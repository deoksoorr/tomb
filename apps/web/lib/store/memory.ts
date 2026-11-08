import type { Grave, ReviveResponse } from "../types";
import { FLOWER_TTL_SEC, REPORT_HIDE_THRESHOLD, type GraveRecord, type GraveStore, type ViewerState } from "./types";

type Seed = { grave: Grave; flowers: number; revives: number };

/**
 * 로컬 개발용. 모든 연산이 await 없이 동기적으로 끝나므로 이벤트 루프 안에서 그 자체로 원자적이다.
 * Redis 키 구조를 그대로 흉내 낸다 (카운트와 방문자 집합을 따로 둔다 → 목업 카운트를 심을 수 있다).
 */
export class MemoryStore implements GraveStore {
  private graves = new Map<string, Grave>();
  private hidden = new Set<string>();
  private flowers = new Map<string, number>();
  private revives = new Map<string, number>();
  private revivers = new Map<string, Set<string>>();
  /** 신고한 IP 해시 (숨김 판정에 세는 집합) */
  private reportIps = new Map<string, Set<string>>();
  /** 신고한 방문자 (재신고 판정용) */
  private reporters = new Map<string, Set<string>>();
  /** `${id}:${visitorId}` → 만료 시각(ms) */
  private flowerMarks = new Map<string, number>();

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
      hidden: this.hidden.has(g.id) || undefined,
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

  async list(): Promise<GraveRecord[]> {
    return [...this.graves.values()].map((g) => this.record(g));
  }

  async get(id: string): Promise<GraveRecord | null> {
    const g = this.graves.get(id);
    return g ? this.record(g) : null;
  }

  async put(grave: Grave): Promise<void> {
    this.graves.set(grave.id, { ...grave, hidden: undefined });
  }

  async remove(id: string): Promise<Grave | null> {
    const g = this.graves.get(id);
    if (!g) return null;
    for (const m of [this.graves, this.flowers, this.revives, this.revivers, this.reportIps, this.reporters]) m.delete(id);
    this.hidden.delete(id);
    return g;
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

  async viewer(id: string, visitorId: string): Promise<ViewerState> {
    return { myRevive: !!this.revivers.get(id)?.has(visitorId), myFlowerToday: this.flowered(id, visitorId) };
  }

  async flower(id: string, visitorId: string): Promise<number | "already" | null> {
    if (!this.graves.has(id)) return null;
    if (this.flowered(id, visitorId)) return "already";
    this.flowerMarks.set(`${id}:${visitorId}`, this.now() + FLOWER_TTL_SEC * 1000);
    const count = (this.flowers.get(id) ?? 0) + 1;
    this.flowers.set(id, count);
    return count;
  }

  async toggleRevive(id: string, visitorId: string): Promise<ReviveResponse | null> {
    if (!this.graves.has(id)) return null;
    const set = this.setOf(this.revivers, id);
    const revived = !set.has(visitorId);
    if (revived) set.add(visitorId);
    else set.delete(visitorId);
    const count = (this.revives.get(id) ?? 0) + (revived ? 1 : -1);
    this.revives.set(id, count);
    return { revived, count };
  }

  async report(id: string, visitorId: string, ipHash: string): Promise<"added" | "duplicate" | null> {
    if (!this.graves.has(id)) return null;
    const ips = this.setOf(this.reportIps, id);
    const visitors = this.setOf(this.reporters, id);
    if (visitors.has(visitorId) || ips.has(ipHash)) return "duplicate";
    ips.add(ipHash);
    visitors.add(visitorId);
    if (ips.size >= REPORT_HIDE_THRESHOLD) this.hidden.add(id);
    return "added";
  }
}
