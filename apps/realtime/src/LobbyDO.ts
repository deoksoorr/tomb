import { DurableObject } from "cloudflare:workers";
import { LOBBY_SNAPSHOT_MS, type LobbyInfo } from "@tomb/protocol";
import { type Config, type Env, channelStub, readConfig } from "./config";
import {
  LOBBY_REFRESH_MS,
  VisitorRegistry,
  applyReport,
  computeLobby,
  emptyLobby,
  refreshTargets,
  type LobbyState,
} from "./lobbyState";

// Lobby DO (전체에 하나, idFromName("lobby")).
// - 각 Channel DO가 인원 변화를 1초 단위로 디바운스해 RPC(report)로 알려 준다(push).
// - Worker의 GET /lobby가 info()를 부른다.
// - 상태는 메모리에 두고 30초마다(바뀐 경우만) storage에 스냅샷한다.
// - 인원의 정답은 각 Channel DO다. (1) 새로 뜰 때 모든 채널에 인원을 다시 묻고(스냅샷은 최대 30초 늦다),
//   (2) 5분마다, 열린 채널 중 최근 5분 안에 push가 없던 채널만 다시 확인한다(보고 유실 대비).
//   hibernate된 채널을 자주 깨우지 않으려고 push가 오가는 채널은 건너뛴다.
// - 채널 간 중복 방문자 레지스트리(메모리, 최선 노력): 한 방문자는 한 채널에만 자리를 가진다.

const SNAPSHOT_KEY = "lobby";

export class LobbyDO extends DurableObject<Env> {
  private readonly cfg: Config;
  private readonly state: LobbyState;
  private readonly visitors: VisitorRegistry;
  private dirty = false;
  private snapshotDueAt: number | null = null;
  private refreshDueAt: number;
  private alarmAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.cfg = readConfig(env);
    this.visitors = new VisitorRegistry(this.cfg.capacity * this.cfg.maxChannels * 4);
    this.state = ctx.storage.kv.get<LobbyState>(SNAPSHOT_KEY) ?? emptyLobby();
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
    this.ensureAlarm();
  }

  /** Worker → GET /lobby */
  info(): LobbyInfo {
    const { info, opened } = computeLobby(this.state, this.cfg, Date.now());
    if (opened !== null) this.markDirty();
    return info;
  }

  /**
   * Channel DO → 방문자가 그 채널에 자리를 잡았다(신규·복귀·교체). 다른 채널에 있었으면 그 채널에서 내보낸다(4002, 유예 없음).
   * 등록을 먼저 바꾸고 내보내므로, 옛 채널이 뒤이어 보내는 release는 무시된다.
   */
  async claimVisitor(visitorId: string, channel: number): Promise<void> {
    if (typeof visitorId !== "string" || !this.validChannel(channel)) return;
    const prev = this.visitors.claim(visitorId, channel);
    if (prev !== null) await channelStub(this.env, prev).kick(visitorId).catch((e) => console.error("kick failed", e));
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
    this.ensureAlarm();
  }

  private markDirty(): void {
    if (!this.dirty) this.snapshotDueAt = Date.now() + LOBBY_SNAPSHOT_MS;
    this.dirty = true;
    this.ensureAlarm();
  }

  /** 알람 하나로 두 주기를 돌린다: min(스냅샷 예정, 재확인 예정). 1채널은 늘 열려 있으므로 재확인은 항상 예정돼 있다. */
  private ensureAlarm(): void {
    const at = Math.min(this.snapshotDueAt ?? Infinity, this.refreshDueAt);
    if (this.alarmAt !== null && this.alarmAt <= at) return;
    this.alarmAt = at;
    this.ctx.storage.setAlarm(at).catch((e) => console.error("lobby setAlarm failed", e));
  }
}
