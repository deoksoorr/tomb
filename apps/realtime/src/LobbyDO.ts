import { DurableObject } from "cloudflare:workers";
import { LOBBY_SNAPSHOT_MS, type LobbyInfo } from "@tomb/protocol";
import { type Config, type Env, channelStub, readConfig } from "./config";
import { applyReport, computeLobby, emptyLobby, type LobbyState } from "./lobbyState";

// Lobby DO (전체에 하나, idFromName("lobby")).
// - 각 Channel DO가 인원 변화를 1초 단위로 디바운스해 RPC(report)로 알려 준다.
// - Worker의 GET /lobby가 info()를 부른다.
// - 상태는 메모리에 두고 30초마다(바뀐 경우만) storage에 스냅샷한다.
// - 인원의 정답은 각 Channel DO다. 그래서 (1) 새로 뜰 때 모든 채널에 인원을 다시 묻고,
//   (2) 사람이 있는 동안 30초 알람마다 그 채널들을 다시 확인한다(보고 유실·채널 DO 재시작 대비).

const SNAPSHOT_KEY = "lobby";

export class LobbyDO extends DurableObject<Env> {
  private readonly cfg: Config;
  private readonly state: LobbyState;
  private dirty = false;
  private alarmSet = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.cfg = readConfig(env);
    this.state = ctx.storage.kv.get<LobbyState>(SNAPSHOT_KEY) ?? emptyLobby();
    // 새로 떴다 = 메모리를 잃었다(유휴 DO는 로컬 workerd에서 약 10초, 운영에서 70~140초 뒤 내려간다).
    // 스냅샷은 최대 30초 늦으므로, 요청을 받기 전에 각 채널의 현재 인원으로 맞춘다.
    const all = Array.from({ length: this.cfg.maxChannels }, (_, i) => i + 1);
    void ctx.blockConcurrencyWhile(() => this.refresh(all));
  }

  /** Channel DO → 인원 보고 (변화 시 1초 디바운스) */
  report(channel: number, count: number): void {
    if (!Number.isInteger(channel) || channel < 1 || channel > this.cfg.maxChannels) return;
    if (!Number.isInteger(count) || count < 0) return;
    if (applyReport(this.state, channel, count, Date.now())) this.markDirty();
    this.ensureAlarm();
  }

  /** Worker → GET /lobby */
  info(): LobbyInfo {
    const { info, opened } = computeLobby(this.state, this.cfg, Date.now());
    if (opened !== null) this.markDirty();
    return info;
  }

  /** 30초 주기: 사람이 있는 채널을 다시 확인하고, 바뀐 상태를 스냅샷한다. 모두 비고 저장할 것도 없으면 멈춘다. */
  async alarm(): Promise<void> {
    this.alarmSet = false;
    await this.refresh(this.nonEmpty());
    if (this.dirty) {
      this.ctx.storage.kv.put(SNAPSHOT_KEY, this.state);
      this.dirty = false;
    }
    this.ensureAlarm();
  }

  private async refresh(ids: number[]): Promise<void> {
    const counts = await Promise.all(ids.map((id) => channelStub(this.env, id).getCount().catch(() => null)));
    const now = Date.now();
    ids.forEach((id, i) => {
      const count = counts[i];
      if (count !== null && applyReport(this.state, id, count, now)) this.markDirty();
    });
    this.ensureAlarm();
  }

  private nonEmpty(): number[] {
    const ids: number[] = [];
    for (let id = 1; id <= this.cfg.maxChannels; id++) if ((this.state.channels[id]?.count ?? 0) > 0) ids.push(id);
    return ids;
  }

  private markDirty(): void {
    this.dirty = true;
    this.ensureAlarm();
  }

  private ensureAlarm(): void {
    if (this.alarmSet || (!this.dirty && this.nonEmpty().length === 0)) return;
    this.alarmSet = true;
    this.ctx.storage.setAlarm(Date.now() + LOBBY_SNAPSHOT_MS).catch((e) => console.error("lobby setAlarm failed", e));
  }
}
