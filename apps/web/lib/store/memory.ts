import { REPORT_LOG_MAX, type ReportLogEntry, type ReportReason } from "../reports";
import { MAX_DECOR_PER_GRAVE } from "@tomb/protocol";
import { DEFAULT_PASS_DAYS, type Grave, type GraveDecor, type PassReason } from "../types";
import {
  flowerTtlSec,
  REPORT_HIDE_THRESHOLD,
  type GraveRecord,
  type GraveSettings,
  type GraveStore,
  type PassedRecord,
  type ReportSummary,
  SHRINE_KEEP_MS,
  type ShrineRecord,
  type ViewerState,
} from "./types";

type Seed = { grave: Grave; flowers: number; revives: number };

/**
 * 로컬 개발용. 모든 연산이 await 없이 동기적으로 끝나므로 이벤트 루프 안에서 그 자체로 원자적이다.
 * Redis 키 구조를 그대로 흉내 낸다 (카운트와 방문자 집합을 따로 둔다 → 목업 카운트를 심을 수 있다).
 */
export class MemoryStore implements GraveStore {
  private graves = new Map<string, Grave>();
  private hidden = new Set<string>();
  private flowers = new Map<string, number>();
  /** 49번 이전에 쌓인 살려주세요 수 (보관만 한다) */
  private revives = new Map<string, number>();
  private decor = new Map<string, GraveDecor[]>();
  /** 성황당: 계정 → (묘비 id → 묘비·옮긴 시각). 반응 수·숨김·꾸미기는 위 맵들에 id로 그대로 남는다 */
  private shrined = new Map<string, Map<string, { grave: Grave; removedAt: number }>>();
  /** 신고한 IP 해시 (숨김 판정에 세는 집합) */
  private reportIps = new Map<string, Set<string>>();
  /** 신고한 방문자 (재신고 판정용) */
  private reporters = new Map<string, Set<string>>();
  /** 신고 기록 (최신 먼저) */
  private reportLogs = new Map<string, ReportLogEntry[]>();
  /** `${id}:${visitorId}` → 만료 시각(ms) */
  private flowerMarks = new Map<string, number>();
  /** 성불한 묘비 → 묘비·시각·이유. 반응 수·숨김·꾸미기는 위 맵들에 id로 그대로 남는다 */
  private passedGraves = new Map<string, { grave: Grave; passedAt: number; reason: PassReason }>();
  private cfg: Partial<GraveSettings> = {};
  private sweepUntil = 0;

  constructor(
    seed: Seed[] = [],
    private now: () => number = Date.now,
  ) {
    for (const s of seed) {
      this.graves.set(s.grave.id, s.grave);
      this.flowers.set(s.grave.id, s.flowers);
      this.revives.set(s.grave.id, s.revives);
    }
  }

  private record(g: Grave): GraveRecord {
    return {
      ...g,
      channel: g.channel ?? 1,
      hidden: this.hidden.has(g.id) || undefined,
      decor: this.decor.get(g.id),
      flowers: this.flowers.get(g.id) ?? 0,
      revives: this.revives.get(g.id) ?? 0,
    };
  }

  private flowered(id: string, visitorId: string): boolean {
    return (this.flowerMarks.get(`${id}:${visitorId}`) ?? 0) > this.now();
  }

  private setOf(map: Map<string, Set<string>>, id: string): Set<string> {
    let set = map.get(id);
    if (!set) map.set(id, (set = new Set()));
    return set;
  }

  async list(channel: number): Promise<GraveRecord[]> {
    return [...this.graves.values()].filter((g) => (g.channel ?? 1) === channel).map((g) => this.record(g));
  }

  async listAll(): Promise<GraveRecord[]> {
    return [...this.graves.values()].map((g) => this.record(g));
  }

  async get(id: string): Promise<GraveRecord | null> {
    const g = this.graves.get(id);
    return g ? this.record(g) : null;
  }

  async put(grave: Grave): Promise<void> {
    this.putSync(grave);
  }

  /** MemoryAccounts가 가방 차감과 함께 동기적으로 부른다 (원자적) */
  putSync(grave: Grave): void {
    this.graves.set(grave.id, { ...grave, channel: grave.channel ?? 1, hidden: undefined, decor: undefined });
  }

  async remove(id: string): Promise<Grave | null> {
    const g = this.graves.get(id);
    if (!g) return null;
    this.forget(id);
    return g;
  }

  /** 묘비 id에 딸린 모든 상태를 지운다 */
  private forget(id: string): void {
    for (const m of [
      this.graves,
      this.flowers,
      this.revives,
      this.decor,
      this.reportIps,
      this.reporters,
      this.reportLogs,
    ])
      m.delete(id);
    this.hidden.delete(id);
  }

  async toShrine(id: string, accountId: string, now: number): Promise<Grave | null> {
    const g = this.graves.get(id);
    if (!g) return null;
    this.graves.delete(id);
    let mine = this.shrined.get(accountId);
    if (!mine) this.shrined.set(accountId, (mine = new Map()));
    mine.set(id, { grave: g, removedAt: now });
    return g;
  }

  async shrine(accountId: string, now: number): Promise<ShrineRecord[]> {
    return [...(this.shrined.get(accountId)?.values() ?? [])]
      .map((e) => ({ record: this.record(e.grave), removedAt: e.removedAt, expiresAt: e.removedAt + SHRINE_KEEP_MS }))
      .filter((e) => e.expiresAt > now)
      .sort((a, b) => b.removedAt - a.removedAt);
  }

  async restore(accountId: string, id: string, now: number): Promise<GraveRecord | null> {
    const mine = this.shrined.get(accountId);
    const e = mine?.get(id);
    if (!e || e.removedAt + SHRINE_KEEP_MS <= now) return null;
    mine!.delete(id);
    const grave = { ...e.grave, createdAt: now };
    this.graves.set(id, grave);
    return this.record(grave);
  }

  async purgeShrine(now: number, limit: number): Promise<Grave[]> {
    const out: Grave[] = [];
    for (const mine of this.shrined.values())
      for (const [id, e] of mine) {
        if (out.length >= limit) return out;
        if (e.removedAt + SHRINE_KEEP_MS > now) continue;
        mine.delete(id);
        this.forget(id);
        out.push(e.grave);
      }
    return out;
  }

  async setHidden(id: string, hidden: boolean): Promise<boolean> {
    if (!this.graves.has(id)) return false;
    if (hidden) {
      this.hidden.add(id);
    } else {
      this.hidden.delete(id);
      this.reportIps.delete(id);
      this.reporters.delete(id);
    }
    return true;
  }

  async resetReports(id: string): Promise<boolean> {
    if (!this.graves.has(id)) return false;
    for (const m of [this.reportIps, this.reporters, this.reportLogs]) m.delete(id);
    return true;
  }

  async reportSummary(): Promise<Map<string, ReportSummary>> {
    const out = new Map<string, ReportSummary>();
    for (const [id, log] of this.reportLogs) out.set(id, { count: this.reportIps.get(id)?.size ?? 0, log: [...log] });
    return out;
  }

  async viewer(id: string, visitorId: string): Promise<ViewerState> {
    return { myFlowerToday: this.flowered(id, visitorId) };
  }

  async flower(id: string, visitorId: string): Promise<number | "already" | null> {
    if (!this.graves.has(id)) return null;
    if (this.flowered(id, visitorId)) return "already";
    this.flowerMarks.set(`${id}:${visitorId}`, this.now() + flowerTtlSec(this.now()) * 1000);
    const count = (this.flowers.get(id) ?? 0) + 1;
    this.flowers.set(id, count);
    return count;
  }

  async passOn(id: string, passedAt: number, reason: PassReason): Promise<PassedRecord | null> {
    const g = this.graves.get(id);
    if (!g) return null;
    const record = this.record(g);
    this.graves.delete(id);
    this.passedGraves.set(id, { grave: g, passedAt, reason });
    return { record, passedAt, reason };
  }

  private passedRecord(e: { grave: Grave; passedAt: number; reason: PassReason }): PassedRecord {
    return { record: this.record(e.grave), passedAt: e.passedAt, reason: e.reason };
  }

  async passedAll(): Promise<PassedRecord[]> {
    return [...this.passedGraves.values()].map((e) => this.passedRecord(e));
  }

  async passedSince(since: number, limit: number): Promise<PassedRecord[]> {
    return [...this.passedGraves.values()]
      .filter((e) => e.passedAt > since)
      .sort((a, b) => b.passedAt - a.passedAt)
      .slice(0, limit)
      .map((e) => this.passedRecord(e));
  }

  async removePassed(id: string): Promise<Grave | null> {
    const e = this.passedGraves.get(id);
    if (!e) return null;
    this.passedGraves.delete(id);
    this.forget(id);
    return e.grave;
  }

  async settings(now: number): Promise<GraveSettings> {
    this.cfg.passEpoch ??= now;
    return { passDays: this.cfg.passDays ?? DEFAULT_PASS_DAYS, passEpoch: this.cfg.passEpoch };
  }

  async setPassDays(days: number): Promise<void> {
    this.cfg.passDays = days;
  }

  async lockSweep(ttlMs: number, now: number): Promise<boolean> {
    if (now < this.sweepUntil) return false;
    this.sweepUntil = now + ttlMs;
    return true;
  }

  /**
   * 묘비에 꾸미기 놓기 (MemoryAccounts가 가방 차감과 함께 동기적으로 부른다 → 원자적).
   * 만료된 것을 정리하고, 최대 개수를 넘으면 가장 먼저 놓은 것(만료가 가장 이른 것)을 뺀다. 묘비가 없으면 null
   */
  applyDecor(id: string, itemId: string, until: number, now: number): GraveDecor[] | null {
    if (!this.graves.has(id)) return null;
    const kept = (this.decor.get(id) ?? []).filter((d) => d.until > now).sort((a, b) => a.until - b.until);
    const next = [...kept.slice(Math.max(0, kept.length - MAX_DECOR_PER_GRAVE + 1)), { itemId, until }];
    this.decor.set(id, next);
    return next;
  }

  hasGrave(id: string): boolean {
    return this.graves.has(id);
  }

  async report(
    id: string,
    visitorId: string,
    ipHash: string,
    reason: ReportReason,
    at = Date.now(),
  ): Promise<"added" | "duplicate" | null> {
    if (!this.graves.has(id)) return null;
    const ips = this.setOf(this.reportIps, id);
    const visitors = this.setOf(this.reporters, id);
    if (visitors.has(visitorId) || ips.has(ipHash)) return "duplicate";
    ips.add(ipHash);
    visitors.add(visitorId);
    this.reportLogs.set(id, [{ at, reason }, ...(this.reportLogs.get(id) ?? [])].slice(0, REPORT_LOG_MAX));
    if (ips.size >= REPORT_HIDE_THRESHOLD) this.hidden.add(id);
    return "added";
  }
}
