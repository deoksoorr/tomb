import { DurableObject } from "cloudflare:workers";
import { LOBBY_SNAPSHOT_MS, MAINT_OFF, TAB_ID_RE, connWhyOf, parseConnWire, parseMaint, type ConnActExtra, type HuntRoomsInfo, type LobbyInfo, type MaintState, type MapCause, type MapId, type QueueStatus } from "@tomb/protocol";
import type { JoinInfo } from "./channel";
import { ConnLogBuffer, sendConnLog } from "./connLog";
import { type Config, type Env, channelStub, readConfig } from "./config";
import {
  LOBBY_REFRESH_MS,
  VisitorRegistry,
  applyReport,
  computeLobby,
  countOf,
  emptyLobby,
  hasRecentChannels,
  liveChannels,
  refreshTargets,
  startupTargets,
  tabRow,
  type LobbyState,
} from "./lobbyState";
import { AdmissionQueue, type QueueSnapshot } from "./queue";
import { applyHuntReport, huntRoomsInfo, pruneHunt, type HuntRoomsState } from "./huntRooms";
import { FriendPresence, type FriendNotice, type PresenceRec } from "./friendPresence";

// Lobby DO (전체에 하나, idFromName("lobby")).
// - 각 Channel DO가 인원 변화를 1초 단위로 디바운스해 RPC(report)로 알려 준다(push).
// - Worker의 GET /lobby가 info()를, GET /queue가 queuePoll()을 부른다.
// - 채널 인원은 메모리에 두고 30초마다(바뀐 경우만) storage에 스냅샷한다.
// - 인원의 정답은 각 Channel DO다. (1) 새로 뜰 때 사람이 있거나 최근에 있었던 채널에 인원을 다시 묻고(스냅샷은 최대 30초 늦다),
//   (2) 5분마다, 최근 쓰인 채널 중 5분 동안 push가 없던 채널만 다시 확인한다(보고 유실 대비).
// - 대기열(queue.ts): 순서와 잡아 둔 자리(hold)는 바뀔 때마다 바로 저장한다(재시작해도 순서를 잃지 않게).
//   Channel DO는 새 방문자를 받기 전에 admit()으로 묻는다 → 줄이 있으면 새치기 불가, 잡아 둔 자리는 그 사람만.
// - 채널 간 중복 방문자 레지스트리(메모리, 최선 노력): 한 방문자는 한 채널에만 자리를 가진다.

const SNAPSHOT_KEY = "lobby";
const QUEUE_KEY = "queue";
const HUNT_KEY = "hunt";
/** 친구 들고 남: 방문자별 기록 "fp:{visitorId}", 나감 알림 대기 목록 */
const FP_PREFIX = "fp:";
const FP_PENDING_KEY = "fpPending";
/** 11/26 점검 모드 상태 (켜고 끌 때만 쓴다) */
const MAINT_KEY = "maint";
/** 11/26 아직 웹에 넘기지 못한 접속 기록 줄 (로비가 내려가도 잃지 않게) */
const CONN_LOG_KEY = "connLog";

export class LobbyDO extends DurableObject<Env> {
  private readonly cfg: Config;
  private readonly state: LobbyState;
  private readonly visitors: VisitorRegistry;
  private readonly queue: AdmissionQueue;
  /** 11/12 사냥터 방 인원 (방 DO가 보고, 바뀔 때마다 저장 — 몇 바이트) */
  private readonly hunt: HuntRoomsState;
  private dirty = false;
  private snapshotDueAt: number | null = null;
  private refreshDueAt: number;
  private alarmAt: number | null = null;
  private readonly counts = (id: number) => countOf(this.state, id);
  /** 친구 들고 남 알림 (기록은 storage에 두어 로비가 다시 떠도 중복·누락이 없게) */
  private readonly friends: FriendPresence;
  /** 11/26 접속 기록 (들어옴·나감 줄을 모았다가 웹으로 — connLog.ts) */
  private readonly connLog = new ConnLogBuffer();
  private connSending = false;
  /** 11/27 방문자별 마지막 탭 id (메모리에만 — 다른 탭에서 다시 접속한 걸 기록하려고) */
  private readonly tabs = new Map<string, string>();
  /** 11/26 점검 모드 */
  private maintState: MaintState;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.cfg = readConfig(env);
    this.visitors = new VisitorRegistry(this.cfg.capacity * this.cfg.maxChannels * 4);
    this.state = ctx.storage.kv.get<LobbyState>(SNAPSHOT_KEY) ?? emptyLobby();
    this.hunt = ctx.storage.kv.get<HuntRoomsState>(HUNT_KEY) ?? {};
    this.queue = new AdmissionQueue(this.cfg, ctx.storage.kv.get<QueueSnapshot>(QUEUE_KEY), Date.now());
    this.refreshDueAt = Date.now() + LOBBY_REFRESH_MS;
    this.maintState = parseMaint(ctx.storage.kv.get<MaintState>(MAINT_KEY) ?? MAINT_OFF);
    const kv = ctx.storage.kv;
    this.friends = new FriendPresence(
      {
        get: (v) => kv.get<PresenceRec>(FP_PREFIX + v),
        put: (v, rec) => void (rec ? kv.put(FP_PREFIX + v, rec) : kv.delete(FP_PREFIX + v)),
      },
      kv.get<[string, number][]>(FP_PENDING_KEY) ?? [],
    );
    this.connLog.restore(kv.get<unknown>(CONN_LOG_KEY), Date.now());
    if (this.connLog.size) this.ensureAlarm();
    // 새로 떴다 = 메모리를 잃었다(유휴 DO는 로컬 workerd에서 약 10초, 운영에서 70~140초 뒤 내려간다).
    // 요청을 받기 전에 채널의 현재 인원으로 맞춘다. 11/17 스냅샷에 사람이 있거나 최근에 있었던 채널만 (빈 채널 DO를 깨우지 않게)
    const targets = startupTargets(this.state, this.cfg, Date.now());
    if (targets.length) void ctx.blockConcurrencyWhile(() => this.refresh(targets));
  }

  /** Channel DO → 인원 보고 (변화 시 1초 디바운스). seq는 채널 DO 안에서 단조 증가 */
  report(channel: number, count: number, seq: number, staff?: number): void {
    if (!this.validChannel(channel) || !Number.isInteger(count) || count < 0 || !Number.isFinite(seq)) return;
    // 11/20 staff = 운영자 수 (count에 없다. 옛 채널 DO는 보내지 않는다)
    const st = Number.isInteger(staff) && staff! >= 0 ? staff : undefined;
    if (applyReport(this.state, channel, count, seq, Date.now(), true, st)) this.markDirty();
    this.settleQueue();
  }

  /** 11/12 사냥터 방 DO → 인원 보고 (변화 시 1초 디바운스 + 5분마다). 사냥터 방이 아니면 무시 */
  reportRoom(room: string, count: number, seq: number): void {
    const now = Date.now();
    const pruned = pruneHunt(this.hunt, now);
    if (applyHuntReport(this.hunt, room, count, seq, now) || pruned) this.ctx.storage.kv.put(HUNT_KEY, this.hunt);
  }

  /** Worker → GET /hunt-rooms */
  huntRooms(): HuntRoomsInfo {
    return huntRoomsInfo(this.hunt, Date.now());
  }

  /**
   * Channel DO → 새 방문자를 받아도 되는지 (재접속·같은 방문자 교체는 묻지 않는다).
   * count는 그 채널의 지금 인원(이 방문자 제외). 승인하면 인원을 바로 +1 해 둬서, 다음 보고 전에 같은 자리를 또 내주지 않는다.
   */
  admit(visitorId: string, channel: number, count: number, seq: number): boolean {
    if (typeof visitorId !== "string" || !this.validChannel(channel) || !Number.isInteger(count) || count < 0) return false;
    const now = Date.now();
    if (applyReport(this.state, channel, count, seq, now, true)) this.markDirty();
    const ok = this.queue.admit(visitorId, channel, count, now);
    if (ok && applyReport(this.state, channel, count + 1, seq, now, true)) this.markDirty();
    this.saveQueue();
    return ok;
  }

  /** Worker → GET /queue (대기열 토큰을 검증한 뒤) */
  queuePoll(visitorId: string): QueueStatus {
    const status = this.queue.poll(visitorId, Date.now(), this.counts);
    this.saveQueue();
    return status;
  }

  /** 11/20 사람이 있는 채널 id (운영자만 있어도) — 확성기·공지·친구 위치를 보낼 곳 (Worker·채널 DO, RPC) */
  liveChannels(): number[] {
    this.settleQueue();
    return liveChannels(this.state, this.cfg, (id) => this.queue.heldIn(id));
  }

  /** Worker → GET /lobby. 대기열이 잡아 둔 자리도 인원으로 보여 준다 */
  info(): LobbyInfo {
    this.settleQueue();
    return computeLobby(this.state, this.cfg, (id) => this.queue.heldIn(id));
  }

  /**
   * Channel DO → 방문자가 그 채널에 자리를 잡았다(신규·복귀·교체). 다른 채널에 있었으면 그 채널에서 내보낸다(4002, 유예 없음).
   * 등록을 먼저 바꾸고 내보내므로, 옛 채널이 뒤이어 보내는 release는 무시된다.
   * claimedAt보다 나중에 옛 채널로 다시 들어간 연결은 그 채널이 건드리지 않는다(빠르게 오가는 경우).
   */
  async claimVisitor(visitorId: string, channel: number, claimedAt: number, dev?: string, info?: JoinInfo): Promise<void> {
    if (typeof visitorId !== "string" || !this.validChannel(channel)) return;
    const device = typeof dev === "string" ? dev.slice(0, 30) : "";
    const prevCh = this.visitors.channelOf(visitorId);
    // 11/26 접속 기록: 어느 채널에도 없던 사람이면 들어옴 (채널 이동·재접속 복귀는 이미 등록돼 있다)
    if (prevCh === undefined) this.logConn([visitorId, "i", Date.now(), channel, device, ""]);
    // 11/27 다른 탭·기기에서 다시 접속 (이전 연결을 끊음 · 다른 채널 탭 · 화면이 다른 맵을 보냄): 한 줄
    const extra = info ? tabRow(info, this.tabs.get(visitorId), prevCh !== undefined && prevCh !== channel ? prevCh : undefined) : null;
    if (extra) this.logConn([visitorId, "t", Date.now(), channel, device, "", extra]);
    if (info?.tab && TAB_ID_RE.test(info.tab)) {
      this.tabs.delete(visitorId);
      this.tabs.set(visitorId, info.tab);
      if (this.tabs.size > 4_000) this.tabs.delete(this.tabs.keys().next().value!);
    }
    // 친구 들고 남: 처음 자리를 잡았으면 친구들에게 바로 "들어옴" (나감 대기 중이었으면 취소)
    const notice = this.friends.joined(visitorId);
    this.saveFriends();
    if (notice) this.tellFriends(notice);
    const prev = this.visitors.claim(visitorId, channel);
    if (prev !== null) {
      await channelStub(this.env, prev)
        .kick(visitorId, claimedAt)
        .catch((e) => console.error("kick failed", e));
    }
  }

  /** 11/27 Channel DO → 이 방문자가 등록된 채널 (없으면 null — 다른 채널에서 들어올 때 서버가 아는 맵을 찾으려고) */
  channelOfVisitor(visitorId: string): number | null {
    return typeof visitorId === "string" ? (this.visitors.channelOf(visitorId) ?? null) : null;
  }

  /** 11/27 Channel DO → 서버가 맵을 옮겼다 (접속 기록 한 줄) */
  logMapMove(visitorId: string, channel: number, from: MapId, to: MapId, cause: MapCause, dev?: string): void {
    if (typeof visitorId !== "string" || !this.validChannel(channel)) return;
    this.logConn([visitorId, "m", Date.now(), channel, typeof dev === "string" ? dev.slice(0, 30) : "", "", { f: from, t: to, c: cause }]);
  }

  /** 11/28 Channel DO → 탈것 타고 내림·좌대에서 내려보냄 (접속 기록 "r" 줄 — 모양이 틀리면 버린다, 바로 타고 내린 줄은 버퍼가 접는다) */
  logAct(visitorId: string, channel: number, x: ConnActExtra, dev?: string): void {
    if (typeof visitorId !== "string" || !this.validChannel(channel)) return;
    const row = parseConnWire([visitorId, "r", Date.now(), channel, typeof dev === "string" ? dev.slice(0, 30) : "", "", x]);
    if (row) this.logConn(row);
  }

  /** Channel DO → 방문자가 최종 퇴장했다(1000 close, 유예 만료, 추방). 등록된 채널이 같을 때만 지운다. */
  releaseVisitor(visitorId: string, channel: number, code?: number, dev?: string): void {
    if (typeof visitorId !== "string" || !this.validChannel(channel)) return;
    this.visitors.release(visitorId, channel);
    // 다른 채널에 이미 자리를 잡았으면(채널 이동) 나간 게 아니다
    if (this.visitors.channelOf(visitorId) === undefined) {
      this.dropFriend(visitorId);
      this.logConn([visitorId, "o", Date.now(), channel, typeof dev === "string" ? dev.slice(0, 30) : "", connWhyOf(typeof code === "number" ? code : undefined)]);
    }
  }

  /** 11/26 점검 모드 상태 (Worker → GET /maintenance·입장 확인) */
  maintenance(): MaintState {
    return this.maintState;
  }

  /** 11/26 점검 시작·끝 (Worker /internal/maint). 저장하고 새 상태를 돌려준다 (접속 끊기는 Worker가 채널마다) */
  setMaintenance(next: MaintState): MaintState {
    this.maintState = parseMaint(next);
    this.ctx.storage.kv.put(MAINT_KEY, this.maintState);
    return this.maintState;
  }

  /** 접속 기록 한 줄. 한 묶음이 차면 바로 보내고, 아니면 알람(1분 뒤)에 */
  private logConn(row: Parameters<ConnLogBuffer["add"]>[0]): void {
    const full = this.connLog.add(row, Date.now());
    this.saveConnLog();
    if (full) void this.flushConnLog();
    else this.ensureAlarm();
  }

  private saveConnLog(): void {
    if (this.connLog.size) this.ctx.storage.kv.put(CONN_LOG_KEY, this.connLog.snapshot());
    else this.ctx.storage.kv.delete(CONN_LOG_KEY);
  }

  private async flushConnLog(): Promise<void> {
    if (this.connSending) return;
    this.connSending = true;
    try {
      while (this.connLog.size) {
        const now = Date.now();
        const rows = this.connLog.take(now);
        if (!(await sendConnLog(this.env, rows))) {
          this.connLog.putBack(rows, Date.now());
          break;
        }
      }
    } finally {
      this.connSending = false;
      this.saveConnLog();
      this.ensureAlarm();
    }
  }

  /** Channel DO → 연결이 끊겼다 (재연결 유예 시작). 유예 안에 돌아오면 claim이 다시 온다 */
  visitorDropped(visitorId: string, channel: number): void {
    if (typeof visitorId !== "string" || !this.validChannel(channel)) return;
    const at = this.visitors.channelOf(visitorId);
    if (at === undefined || at === channel) this.dropFriend(visitorId);
  }

  /** Worker /internal/online → 11/17 로비가 아는 접속 중인 방문자 id (채널 명단과 합친다) */
  onlineVisitors(): string[] {
    return this.visitors.ids();
  }

  /** Worker /internal/hello → 웹이 입장 토큰을 주기 직전: 이 사람이 들고 날 때 알릴 친구들 */
  friendHello(visitorId: string, name: string, key: string, friends: string[]): void {
    this.friends.hello(visitorId, name, key, friends);
  }

  private dropFriend(visitorId: string): void {
    this.friends.dropped(visitorId, Date.now());
    this.saveFriends();
    this.ensureAlarm();
  }

  private saveFriends(): void {
    if (!this.friends.dirty) return;
    this.ctx.storage.kv.put(FP_PENDING_KEY, [...this.friends.pending]);
    this.friends.dirty = false;
  }

  /** 사람이 있는 채널마다 그 친구들에게 전한다 (받을 사람이 없는 채널은 아무것도 안 한다) */
  private tellFriends(n: FriendNotice): void {
    for (const id of liveChannels(this.state, this.cfg)) {
      channelStub(this.env, id)
        .friendNotice(n.to, n.key, n.name, n.on)
        .catch((e) => console.error("friendNotice failed", id, e));
    }
  }

  /** 스냅샷(30초, 바뀐 경우만)과 재확인(5분) */
  async alarm(): Promise<void> {
    this.alarmAt = null;
    const now = Date.now();
    for (const n of this.friends.tick(now)) this.tellFriends(n);
    this.saveFriends();
    const logDue = this.connLog.due();
    if (logDue !== null && now >= logDue) await this.flushConnLog();
    if (now >= this.refreshDueAt) {
      this.refreshDueAt = now + LOBBY_REFRESH_MS;
      await this.refresh(refreshTargets(this.state, this.cfg, now));
    }
    if (this.dirty && now >= (this.snapshotDueAt ?? 0)) {
      this.ctx.storage.kv.put(SNAPSHOT_KEY, this.state);
      this.dirty = false;
      this.snapshotDueAt = null;
    }
    this.ensureAlarm();
  }

  private validChannel(channel: number): boolean {
    return Number.isInteger(channel) && channel >= 1 && channel <= this.cfg.maxChannels;
  }

  private async refresh(ids: number[]): Promise<void> {
    const results = await Promise.all(ids.map((id) => channelStub(this.env, id).getCount().catch(() => null)));
    const now = Date.now();
    ids.forEach((id, i) => {
      const r = results[i];
      if (r && applyReport(this.state, id, r.count, r.seq, now, false, Number.isInteger(r.staff) ? r.staff : undefined)) this.markDirty();
    });
    this.settleQueue();
  }

  /** 인원이 줄었으면 대기열 맨 앞에 자리를 잡아 준다 */
  private settleQueue(): void {
    this.queue.assign(Date.now(), this.counts);
    this.saveQueue();
    this.ensureAlarm();
  }

  private saveQueue(): void {
    if (!this.queue.dirty) return;
    this.ctx.storage.kv.put(QUEUE_KEY, this.queue.snapshot());
    this.queue.dirty = false;
  }

  private markDirty(): void {
    if (!this.dirty) this.snapshotDueAt = Date.now() + LOBBY_SNAPSHOT_MS;
    this.dirty = true;
    this.ensureAlarm();
  }

  /** 알람 하나로 두 주기를 돌린다: min(스냅샷 예정, 재확인 예정). 최근 쓰인 채널이 없고 저장할 것도 없으면 알람 없음 */
  private ensureAlarm(): void {
    const refreshAt = hasRecentChannels(this.state, this.cfg, Date.now()) ? this.refreshDueAt : Infinity;
    const at = Math.min(this.snapshotDueAt ?? Infinity, refreshAt, this.friends.due() ?? Infinity, this.connLog.due() ?? Infinity);
    if (at === Infinity || (this.alarmAt !== null && this.alarmAt <= at)) return;
    this.alarmAt = at;
    this.ctx.storage.setAlarm(at).catch((e) => console.error("lobby setAlarm failed", e));
  }
}
