import { DurableObject } from "cloudflare:workers";
import { LOBBY_SNAPSHOT_MS, type HuntRoomsInfo, type LobbyInfo, type QueueStatus } from "@tomb/protocol";
import { type Config, type Env, channelStub, readConfig } from "./config";
import {
  LOBBY_REFRESH_MS,
  VisitorRegistry,
  applyReport,
  computeLobby,
  countOf,
  emptyLobby,
  hasRecentChannels,
  refreshTargets,
  type LobbyState,
} from "./lobbyState";
import { AdmissionQueue, type QueueSnapshot } from "./queue";
import { applyHuntReport, huntRoomsInfo, pruneHunt, type HuntRoomsState } from "./huntRooms";

// Lobby DO (전체에 하나, idFromName("lobby")).
// - 각 Channel DO가 인원 변화를 1초 단위로 디바운스해 RPC(report)로 알려 준다(push).
// - Worker의 GET /lobby가 info()를, GET /queue가 queuePoll()을 부른다.
// - 채널 인원은 메모리에 두고 30초마다(바뀐 경우만) storage에 스냅샷한다.
// - 인원의 정답은 각 Channel DO다. (1) 새로 뜰 때 모든 채널에 인원을 다시 묻고(스냅샷은 최대 30초 늦다),
//   (2) 5분마다, 최근 쓰인 채널 중 5분 동안 push가 없던 채널만 다시 확인한다(보고 유실 대비).
// - 대기열(queue.ts): 순서와 잡아 둔 자리(hold)는 바뀔 때마다 바로 저장한다(재시작해도 순서를 잃지 않게).
//   Channel DO는 새 방문자를 받기 전에 admit()으로 묻는다 → 줄이 있으면 새치기 불가, 잡아 둔 자리는 그 사람만.
// - 채널 간 중복 방문자 레지스트리(메모리, 최선 노력): 한 방문자는 한 채널에만 자리를 가진다.

const SNAPSHOT_KEY = "lobby";
const QUEUE_KEY = "queue";
const HUNT_KEY = "hunt";

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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.cfg = readConfig(env);
    this.visitors = new VisitorRegistry(this.cfg.capacity * this.cfg.maxChannels * 4);
    this.state = ctx.storage.kv.get<LobbyState>(SNAPSHOT_KEY) ?? emptyLobby();
    this.hunt = ctx.storage.kv.get<HuntRoomsState>(HUNT_KEY) ?? {};
    this.queue = new AdmissionQueue(this.cfg, ctx.storage.kv.get<QueueSnapshot>(QUEUE_KEY), Date.now());
    this.refreshDueAt = Date.now() + LOBBY_REFRESH_MS;
    // 새로 떴다 = 메모리를 잃었다(유휴 DO는 로컬 workerd에서 약 10초, 운영에서 70~140초 뒤 내려간다).
    // 요청을 받기 전에 각 채널의 현재 인원으로 맞춘다.
    const all = Array.from({ length: this.cfg.maxChannels }, (_, i) => i + 1);
    void ctx.blockConcurrencyWhile(() => this.refresh(all));
  }

  /** Channel DO → 인원 보고 (변화 시 1초 디바운스). seq는 채널 DO 안에서 단조 증가 */
  report(channel: number, count: number, seq: number): void {
    if (!this.validChannel(channel) || !Number.isInteger(count) || count < 0 || !Number.isFinite(seq)) return;
    if (applyReport(this.state, channel, count, seq, Date.now(), true)) this.markDirty();
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
  async claimVisitor(visitorId: string, channel: number, claimedAt: number): Promise<void> {
    if (typeof visitorId !== "string" || !this.validChannel(channel)) return;
    const prev = this.visitors.claim(visitorId, channel);
    if (prev !== null) {
      await channelStub(this.env, prev)
        .kick(visitorId, claimedAt)
        .catch((e) => console.error("kick failed", e));
    }
  }

  /** Channel DO → 방문자가 최종 퇴장했다(1000 close, 유예 만료, 추방). 등록된 채널이 같을 때만 지운다. */
  releaseVisitor(visitorId: string, channel: number): void {
    if (typeof visitorId === "string" && this.validChannel(channel)) this.visitors.release(visitorId, channel);
  }

  /** 스냅샷(30초, 바뀐 경우만)과 재확인(5분) */
  async alarm(): Promise<void> {
    this.alarmAt = null;
    const now = Date.now();
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
      if (r && applyReport(this.state, id, r.count, r.seq, now, false)) this.markDirty();
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
    const at = Math.min(this.snapshotDueAt ?? Infinity, refreshAt);
    if (at === Infinity || (this.alarmAt !== null && this.alarmAt <= at)) return;
    this.alarmAt = at;
    this.ctx.storage.setAlarm(at).catch((e) => console.error("lobby setAlarm failed", e));
  }
}
