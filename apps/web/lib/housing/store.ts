import {
  defaultExterior,
  GUEST_KEEP,
  GUEST_PER_DAY,
  GUEST_REPORT_HIDE,
  housingChannelOf,
  LEGACY_HOUSING_CHANNEL,
  LIKE_WEIGHT,
  VILLAGE_MAX_LOTS,
  type HouseSort,
  type PlotTierId,
} from "./catalog";
import { emptyLayout, normalizeExterior } from "./layout";
import type { PlantState } from "./plants";
import { keepState, stateSigs, type HouseState } from "./states";
import type { GuestEntry, HouseExterior, HouseLayout, PublicHouse } from "./types";

// 하우징 저장소. 포인트는 여기서 다루지 않는다 (공용 spendPoints/earnPoints → lib/housing/points.ts).
// 집 쪽 상태 변화(가방 개수·배치·좋아요·방명록)는 Redis에서는 Lua 하나, 메모리에서는 await 없는 동기 코드로 원자적이다.

/** 저장소 원본. owner(계정 id)·hidden은 그대로 내보내지 않는다 (toPublicHouse) */
export type HouseRecord = PublicHouse & { owner: string; hidden: boolean; items: number };

/** 방명록 원본: author(계정 id)는 내보내지 않고 mine 판정에만 쓴다 */
export type StoredGuest = GuestEntry & { author: string };

/** ch: 분양받는 채널 (없으면 1), lot: 그 채널에서 고른 번지 (null이면 가장 앞의 빈 번지를 자동으로) */
export type NewHouse = { id: string; owner: string; name: string; intro: string; ownerName: string; tier: PlotTierId; ch?: number; lot: number | null; now: number };

export type CreateResult = { lot: number } | "exists" | "lot_taken" | "full";

export type SaveResult = "ok" | "no_house" | "tier" | "not_owned";

/** 좋아요 하루 1회 판정 기간 (KST 날짜를 키에 넣으므로 날짜가 바뀌면 다시 누를 수 있다. TTL은 정리용) */
export const LIKE_TTL_SEC = 2 * 86_400;
export const GUEST_DAY_TTL_SEC = 2 * 86_400;
export const GUEST_REPORT_TTL_SEC = 30 * 86_400;

export interface HouseStore {
  get(id: string): Promise<HouseRecord | null>;
  /** 가진 물건 (놓은 것 포함) */
  inventory(id: string): Promise<Record<string, number>>;
  /** 집 만들기와 번지 배정을 한 번에 (같은 채널의 같은 번지를 두 집이 받지 않는다. 채널이 다르면 같은 번지도 따로) */
  create(h: NewHouse): Promise<CreateResult>;
  /** 번지가 없는 (마을이 생기기 전) 집에 그 집 채널의 가장 앞의 빈 번지를 준다. 이미 있으면 그 번지 */
  assignLot(id: string): Promise<number | null>;
  /** 한 채널의 마을: 그 채널에 번지가 있는 모든 집 (숨김 포함, 번지 순) */
  village(ch?: number): Promise<HouseRecord[]>;
  /** 집과 딸린 키를 모두 지운다 (분양 결제 실패 보상·관리자 삭제) */
  remove(id: string): Promise<void>;
  setProfile(id: string, name: string, intro: string, now: number): Promise<boolean>;
  /** tier가 from일 때만 to로 바꾼다 */
  upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number): Promise<boolean>;
  /** 가방에 1개 (max 초과면 "max") */
  addItem(id: string, itemId: string, max: number): Promise<"ok" | "max" | "no_house">;
  /** 놓지 않은 1개를 뺀다 (되팔기). 전부 놓여 있으면 "placed", 없으면 "none" */
  takeItem(id: string, itemId: string): Promise<"ok" | "placed" | "none">;
  /**
   * 배치·외관 저장 (null인 쪽은 그대로). tier가 그대로이고 counts(안+밖 전체)가 가진 개수 안일 때만.
   * 검증·점수 계산은 호출자가 먼저 한다. 배치가 바뀌면 같은 단계에서 치우거나 옮긴 가구의 상태·없어진 화분 기록을 지운다
   */
  saveDesign(
    id: string,
    tier: PlotTierId,
    layout: HouseLayout | null,
    exterior: HouseExterior | null,
    counts: Record<string, number>,
    placedScore: number,
    now: number,
  ): Promise<SaveResult>;
  /** 좋아요. 오늘 이미 눌렀으면 "already", 집이 없거나 숨김이면 null */
  like(id: string, visitorId: string, day: string): Promise<{ likes: number; score: number } | "already" | null>;
  likedToday(id: string, visitorId: string, day: string): Promise<boolean>;
  /** 숨기지 않은 집 목록 (정렬, 최대 limit) */
  list(sort: HouseSort, limit: number): Promise<HouseRecord[]>;
  /** 관리자: 숨김 포함 전체 (최근 분양 순) */
  listAll(): Promise<HouseRecord[]>;
  setHidden(id: string, hidden: boolean): Promise<boolean>;
  /** 방명록 남기기. 하루 GUEST_PER_DAY개 (모든 집 합계) */
  addGuest(id: string, entry: StoredGuest, day: string): Promise<"ok" | "no_house" | "limit">;
  /** 최신 먼저. withHidden=false면 가린 글은 뺀다 */
  guestbook(id: string, withHidden: boolean): Promise<(StoredGuest & { hidden: boolean })[]>;
  removeGuest(id: string, entryId: string): Promise<StoredGuest | null>;
  /** 신고 (IP 해시 단위). GUEST_REPORT_HIDE개 모이면 가린다. 글이 없으면 null */
  reportGuest(id: string, entryId: string, ipHash: string): Promise<"added" | "duplicate" | null>;
  setGuestHidden(id: string, entryId: string, hidden: boolean): Promise<boolean>;
  /** 관리자: 신고가 있는 글 → 신고 수 */
  guestReports(id: string): Promise<Map<string, number>>;
  /** 3번 화분: 배치 id → 물 준 기록 */
  plants(id: string): Promise<Record<string, PlantState>>;
  setPlant(id: string, u: string, st: PlantState): Promise<void>;
  /** 3번 가구 상태 (불·스탠드·라디오·창문): 배치 id → {값, 서명}. 읽는 쪽이 지금 배치와 서명을 맞춰 본다 (states.ts) */
  states(id: string): Promise<Record<string, HouseState>>;
  /** st가 null이거나 값이 0이면 지운다 */
  setState(id: string, u: string, st: HouseState | null): Promise<void>;
}

export const scoreOf = (placed: number, likes: number) => placed + likes * LIKE_WEIGHT;

// ── 메모리 (로컬 개발·테스트) ──

type MemHouse = {
  rec: Omit<HouseRecord, "score" | "items">;
  inv: Map<string, number>;
  placed: Map<string, number>;
  guests: StoredGuest[];
  guestHidden: Set<string>;
  guestReports: Map<string, Set<string>>;
};

export class MemoryHouseStore implements HouseStore {
  private houses = new Map<string, MemHouse>();
  private likes = new Set<string>();
  private guestDay = new Map<string, number>();
  private plantMap = new Map<string, Record<string, PlantState>>();
  private stateMap = new Map<string, Record<string, HouseState>>();

  async states(id: string) {
    return { ...(this.stateMap.get(id) ?? {}) };
  }

  async setState(id: string, u: string, st: HouseState | null) {
    const cur = { ...(this.stateMap.get(id) ?? {}) };
    if (st && st.a !== 0) cur[u] = { ...st };
    else delete cur[u];
    this.stateMap.set(id, cur);
  }

  /** 배치 저장과 같은 단계: 서명이 달라진(치우거나 옮긴) 가구 상태와 없어진 화분 기록을 지운다. 창문 상태는 남긴다 */
  private pruneFor(id: string, layout: HouseLayout): void {
    const sigs = stateSigs(layout);
    const st = this.stateMap.get(id);
    if (st) this.stateMap.set(id, Object.fromEntries(Object.entries(st).filter(([u, v]) => keepState(sigs, u, v))));
    const pots = new Set(layout.items.filter((p) => p.i === "pot").map((p) => p.u));
    const pl = this.plantMap.get(id);
    if (pl) this.plantMap.set(id, Object.fromEntries(Object.entries(pl).filter(([u]) => pots.has(u))));
  }

  async plants(id: string) {
    return { ...(this.plantMap.get(id) ?? {}) };
  }

  async setPlant(id: string, u: string, st: PlantState) {
    this.plantMap.set(id, { ...(this.plantMap.get(id) ?? {}), [u]: st });
  }

  private view(h: MemHouse): HouseRecord {
    const r = h.rec;
    return {
      ...r,
      layout: structuredClone(r.layout),
      ch: housingChannelOf(r.ch),
      lot: r.lot ?? 0,
      exterior: normalizeExterior(r.exterior),
      score: scoreOf(r.placedScore, r.likes),
      items: r.layout.items.length,
    };
  }

  async get(id: string) {
    const h = this.houses.get(id);
    return h ? this.view(h) : null;
  }

  async inventory(id: string) {
    return Object.fromEntries(this.houses.get(id)?.inv ?? []);
  }

  /** 채널마다 번지 → 집 (메모리는 집 기록에서 바로 센다. 채널이 없는 예전 기록은 1채널로 본다) */
  private lotTaken(ch: number, lot: number): boolean {
    for (const h of this.houses.values()) if (h.rec.lot === lot && housingChannelOf(h.rec.ch) === ch) return true;
    return false;
  }

  private freeLot(ch: number): number | null {
    for (let l = 1; l <= VILLAGE_MAX_LOTS; l++) if (!this.lotTaken(ch, l)) return l;
    return null;
  }

  async create(n: NewHouse): Promise<CreateResult> {
    if (this.houses.has(n.id)) return "exists";
    const ch = housingChannelOf(n.ch ?? LEGACY_HOUSING_CHANNEL);
    if (n.lot !== null && this.lotTaken(ch, n.lot)) return "lot_taken";
    const lot = n.lot ?? this.freeLot(ch);
    if (lot === null) return "full";
    this.houses.set(n.id, {
      rec: {
        id: n.id,
        ch,
        lot,
        exterior: defaultExterior(),
        owner: n.owner,
        name: n.name,
        intro: n.intro,
        ownerName: n.ownerName,
        tier: n.tier,
        layout: emptyLayout(),
        likes: 0,
        placedScore: 0,
        createdAt: n.now,
        updatedAt: n.now,
        hidden: false,
      },
      inv: new Map(),
      placed: new Map(),
      guests: [],
      guestHidden: new Set(),
      guestReports: new Map(),
    });
    return { lot };
  }

  async assignLot(id: string) {
    const h = this.houses.get(id);
    if (!h) return null;
    if (h.rec.lot) return h.rec.lot;
    const lot = this.freeLot(housingChannelOf(h.rec.ch));
    if (lot === null) return null;
    h.rec.lot = lot;
    return lot;
  }

  async village(ch = LEGACY_HOUSING_CHANNEL) {
    return [...this.houses.values()]
      .filter((h) => h.rec.lot > 0 && housingChannelOf(h.rec.ch) === ch)
      .map((h) => this.view(h))
      .sort((a, b) => a.lot - b.lot);
  }

  async remove(id: string) {
    this.houses.delete(id);
    this.plantMap.delete(id);
    this.stateMap.delete(id);
  }

  async setProfile(id: string, name: string, intro: string, now: number) {
    const h = this.houses.get(id);
    if (!h) return false;
    Object.assign(h.rec, { name, intro, updatedAt: now });
    return true;
  }

  async upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number) {
    const h = this.houses.get(id);
    if (!h || h.rec.tier !== from) return false;
    Object.assign(h.rec, { tier: to, updatedAt: now });
    return true;
  }

  async addItem(id: string, itemId: string, max: number) {
    const h = this.houses.get(id);
    if (!h) return "no_house" as const;
    const n = h.inv.get(itemId) ?? 0;
    if (n >= max) return "max" as const;
    h.inv.set(itemId, n + 1);
    return "ok" as const;
  }

  async takeItem(id: string, itemId: string) {
    const h = this.houses.get(id);
    const n = h?.inv.get(itemId) ?? 0;
    if (!h || n < 1) return "none" as const;
    if (n - (h.placed.get(itemId) ?? 0) < 1) return "placed" as const;
    if (n === 1) h.inv.delete(itemId);
    else h.inv.set(itemId, n - 1);
    return "ok" as const;
  }

  async saveDesign(
    id: string,
    tier: PlotTierId,
    layout: HouseLayout | null,
    exterior: HouseExterior | null,
    counts: Record<string, number>,
    placedScore: number,
    now: number,
  ) {
    const h = this.houses.get(id);
    if (!h) return "no_house" as const;
    if (h.rec.tier !== tier) return "tier" as const;
    for (const [item, n] of Object.entries(counts)) if ((h.inv.get(item) ?? 0) < n) return "not_owned" as const;
    h.placed = new Map(Object.entries(counts));
    if (layout) {
      h.rec.layout = structuredClone(layout);
      this.pruneFor(id, layout);
    }
    if (exterior) h.rec.exterior = { ...exterior };
    Object.assign(h.rec, { placedScore, updatedAt: now });
    return "ok" as const;
  }

  async like(id: string, visitorId: string, day: string) {
    const h = this.houses.get(id);
    if (!h || h.rec.hidden) return null;
    const key = `${id}:${visitorId}:${day}`;
    if (this.likes.has(key)) return "already" as const;
    this.likes.add(key);
    h.rec.likes += 1;
    return { likes: h.rec.likes, score: scoreOf(h.rec.placedScore, h.rec.likes) };
  }

  async likedToday(id: string, visitorId: string, day: string) {
    return this.likes.has(`${id}:${visitorId}:${day}`);
  }

  async list(sort: HouseSort, limit: number) {
    const all = [...this.houses.values()].filter((h) => !h.rec.hidden).map((h) => this.view(h));
    const by: Record<HouseSort, (a: HouseRecord, b: HouseRecord) => number> = {
      score: (a, b) => b.score - a.score || b.createdAt - a.createdAt,
      likes: (a, b) => b.likes - a.likes || b.createdAt - a.createdAt,
      new: (a, b) => b.createdAt - a.createdAt,
    };
    return all.sort(by[sort]).slice(0, limit);
  }

  async listAll() {
    return [...this.houses.values()].map((h) => this.view(h)).sort((a, b) => b.createdAt - a.createdAt);
  }

  async setHidden(id: string, hidden: boolean) {
    const h = this.houses.get(id);
    if (!h) return false;
    h.rec.hidden = hidden;
    return true;
  }

  async addGuest(id: string, entry: StoredGuest, day: string) {
    const h = this.houses.get(id);
    if (!h || h.rec.hidden) return "no_house" as const;
    const key = `${entry.author}:${day}`;
    const n = (this.guestDay.get(key) ?? 0) + 1;
    this.guestDay.set(key, n);
    if (n > GUEST_PER_DAY) return "limit" as const;
    h.guests.unshift(entry);
    h.guests.length = Math.min(h.guests.length, GUEST_KEEP);
    return "ok" as const;
  }

  async guestbook(id: string, withHidden: boolean) {
    const h = this.houses.get(id);
    if (!h) return [];
    return h.guests
      .map((g) => ({ ...g, hidden: h.guestHidden.has(g.id) }))
      .filter((g) => withHidden || !g.hidden);
  }

  async removeGuest(id: string, entryId: string) {
    const h = this.houses.get(id);
    const i = h?.guests.findIndex((g) => g.id === entryId) ?? -1;
    if (!h || i < 0) return null;
    const [g] = h.guests.splice(i, 1);
    h.guestHidden.delete(entryId);
    h.guestReports.delete(entryId);
    return g;
  }

  async reportGuest(id: string, entryId: string, ipHash: string) {
    const h = this.houses.get(id);
    if (!h || !h.guests.some((g) => g.id === entryId)) return null;
    let set = h.guestReports.get(entryId);
    if (!set) h.guestReports.set(entryId, (set = new Set()));
    if (set.has(ipHash)) return "duplicate" as const;
    set.add(ipHash);
    if (set.size >= GUEST_REPORT_HIDE) h.guestHidden.add(entryId);
    return "added" as const;
  }

  async setGuestHidden(id: string, entryId: string, hidden: boolean) {
    const h = this.houses.get(id);
    if (!h || !h.guests.some((g) => g.id === entryId)) return false;
    if (hidden) h.guestHidden.add(entryId);
    else {
      h.guestHidden.delete(entryId);
      h.guestReports.delete(entryId);
    }
    return true;
  }

  async guestReports(id: string) {
    const h = this.houses.get(id);
    return new Map([...(h?.guestReports ?? [])].map(([k, v]) => [k, v.size]));
  }
}
