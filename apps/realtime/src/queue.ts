import { QUEUE_HOLD_MS, pickChannel, type QueueStatus } from "@tomb/protocol";
import type { Config } from "./config";

// 대기열 (순수 로직). 전체 상한에 닿으면 Lobby DO가 이 줄로 "먼저 온 순서대로" 들여보낸다. 테스트: queue.test.ts
//
// - 대기자는 GET /queue를 QUEUE_POLL_MS마다 부른다. 30초 넘게 소식이 없으면 줄에서 뺀다.
// - 자리가 나면(유예 만료·1000 퇴장 등으로 채널 인원이 줄어든 보고) 맨 앞 사람에게 그 채널 자리를 QUEUE_HOLD_MS 동안 잡아 준다(hold).
// - 순차 입장: 줄에 누군가 기다리는 동안 줄 밖의 새 입장자는 채널에 들어갈 수 없다. 남는 자리는 언제나 줄에 먼저 간다.
//   Channel DO는 새 방문자를 받기 전에 admit()으로 묻는다(재접속·같은 방문자 교체는 묻지 않는다).

/** 이 시간 넘게 폴링이 없는 대기자는 줄에서 뺀다 */
export const QUEUE_STALE_MS = 30_000;
/** 줄 최대 길이. 넘으면 none → 클라이언트는 관람 모드로 있다가 다시 시도한다 */
export const QUEUE_MAX = 1_000;

export type Hold = { visitorId: string; channel: number; until: number };
/** 저장 형태. 폴링 시각은 저장하지 않는다(되살릴 때 지금 시각으로 본다) */
export type QueueSnapshot = { waiting: string[]; holds: Hold[] };

type Waiter = { visitorId: string; lastPollAt: number };
/** 채널 id → 그 채널의 현재 인원(접속 + 유예 예약). hold는 포함하지 않는다 */
export type Counts = (channel: number) => number;
export type QueueConfig = Pick<Config, "capacity" | "maxChannels" | "threshold">;

export class AdmissionQueue {
  private waiting: Waiter[] = [];
  private readonly holds = new Map<string, Hold>();
  /** 저장할 변화가 있었는지 (줄·hold 구성. 폴링 시각만 바뀐 것은 아님) */
  dirty = false;

  constructor(
    private readonly cfg: QueueConfig,
    snapshot?: QueueSnapshot,
    now = 0,
  ) {
    if (!snapshot) return;
    this.waiting = snapshot.waiting.map((visitorId) => ({ visitorId, lastPollAt: now }));
    for (const h of snapshot.holds) this.holds.set(h.visitorId, h);
  }

  snapshot(): QueueSnapshot {
    return { waiting: this.waiting.map((w) => w.visitorId), holds: [...this.holds.values()] };
  }

  /** 기다리는 사람 수 */
  get size(): number {
    return this.waiting.length;
  }

  /** 이 채널에 잡아 둔 자리 수 */
  heldIn(channel: number): number {
    let n = 0;
    for (const h of this.holds.values()) if (h.channel === channel) n++;
    return n;
  }

  /** GET /queue: 줄에 없으면 맨 뒤에 세우고, 자리가 있으면 바로 잡아 준다 */
  poll(visitorId: string, now: number, counts: Counts): QueueStatus {
    this.prune(now);
    let w = this.waiting.find((x) => x.visitorId === visitorId);
    if (!w && !this.holds.has(visitorId)) {
      if (this.waiting.length >= QUEUE_MAX) return { state: "none" };
      w = { visitorId, lastPollAt: now };
      this.waiting.push(w);
      this.dirty = true;
    }
    if (w) w.lastPollAt = now;
    this.assign(now, counts);
    const h = this.holds.get(visitorId);
    if (h) return { state: "admitted", channel: h.channel, holdUntil: h.until };
    return { state: "waiting", position: this.waiting.indexOf(w!) + 1, size: this.waiting.length };
  }

  /** 남는 자리를 줄 맨 앞부터 잡아 준다 (채널 인원이 줄었다는 보고·폴링 때 부른다) */
  assign(now: number, counts: Counts): void {
    this.prune(now);
    while (this.waiting.length > 0) {
      const channel = this.pickFree(counts);
      if (channel === null) return;
      const w = this.waiting.shift()!;
      this.holds.set(w.visitorId, { visitorId: w.visitorId, channel, until: now + QUEUE_HOLD_MS });
      this.dirty = true;
    }
  }

  /**
   * Channel DO가 새 방문자를 받기 전에 묻는다. channelCount는 그 채널의 지금 인원(이 방문자 제외).
   * - 이 채널에 잡아 둔 자리가 있으면 들어간다(자리를 쓴다)
   * - 줄에 누가 기다리면 새치기 불가
   * - 아니면 인원 + 잡아 둔 자리가 상한 미만일 때만
   */
  admit(visitorId: string, channel: number, channelCount: number, now: number): boolean {
    this.prune(now);
    const h = this.holds.get(visitorId);
    if (h?.channel === channel) {
      this.holds.delete(visitorId);
      this.dirty = true;
      return true;
    }
    if (this.waiting.length > 0) return false;
    if (channelCount + this.heldIn(channel) >= this.cfg.capacity) return false;
    if (h) {
      // 다른 채널에 잡아 둔 자리는 돌려준다
      this.holds.delete(visitorId);
      this.dirty = true;
    }
    return true;
  }

  /** 오래 소식 없는 대기자와 시간이 지난 hold를 치운다 */
  private prune(now: number): void {
    const before = this.waiting.length;
    this.waiting = this.waiting.filter((w) => now - w.lastPollAt <= QUEUE_STALE_MS);
    if (this.waiting.length !== before) this.dirty = true;
    for (const [v, h] of this.holds) {
      if (h.until > now) continue;
      this.holds.delete(v);
      this.dirty = true;
    }
  }

  /** 잡아 둔 자리까지 센 인원으로 자동 배정 규칙(pickChannel)을 그대로 쓴다. 남는 자리가 없으면 null */
  private pickFree(counts: Counts): number | null {
    const channels = Array.from({ length: this.cfg.maxChannels }, (_, i) => {
      const id = i + 1;
      return { id, count: counts(id) + this.heldIn(id), cap: this.cfg.capacity, open: true };
    });
    return pickChannel({
      channels,
      total: 0,
      totalCap: this.cfg.capacity * this.cfg.maxChannels,
      maxChannels: this.cfg.maxChannels,
      threshold: this.cfg.threshold,
    });
  }
}
