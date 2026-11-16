import { isOpenLot } from "@tomb/protocol";
import {
  defaultExterior,
  GUEST_KEEP,
  GUEST_PER_DAY,
  GUEST_REPORT_HIDE,
  housingChannelOf,
  LEGACY_HOUSING_CHANNEL,
  LIKE_WEIGHT,
  reclaimLastSeen,
  SEA_LOT_COUNT,
  VILLAGE_MAX_LOTS,
  type CottageStyleId,
  type HouseSort,
  type HouseZone,
  type PlotTierId,
} from "./catalog";
import { emptyLayout, normalizeExterior } from "./layout";
import type { PlantState } from "./plants";
import { keepState, stateSigs, type HouseState } from "./states";
import type { GuestEntry, HouseExterior, HouseLayout, PublicHouse } from "./types";

// 하우징 저장소. 포인트는 여기서 다루지 않는다 (공용 spendPoints/earnPoints → lib/housing/points.ts).
// 집 쪽 상태 변화(가방 개수·배치·좋아요·방명록)는 Redis에서는 Lua 하나, 메모리에서는 await 없는 동기 코드로 원자적이다.

/**
 * 저장소 원본. owner(계정 id)·hidden·paid는 그대로 내보내지 않는다 (toPublicHouse).
 * paid = 이 집에 낸 포인트 (분양가 + 넓히기). 이 기록이 생기기 전에 분양된 집은 없다 → 비울 때 지금 가격표로 센다 (reclaim.ts refundOf)
 */
export type HouseRecord = PublicHouse & { owner: string; hidden: boolean; items: number; paid?: number };

/** 방명록 원본: author(계정 id)는 내보내지 않고 mine 판정에만 쓴다 */
export type StoredGuest = GuestEntry & { author: string };

/** ch: 분양받는 채널 (없으면 1), lot: 그 채널에서 고른 번지 (null이면 가장 앞의 빈 번지를 자동으로) */
export type NewHouse = {
  id: string;
  owner: string;
  name: string;
  intro: string;
  ownerName: string;
  tier: PlotTierId;
  ch?: number;
  lot: number | null;
  now: number;
  paid?: number;
  /** 11/16 sea = 포구 오두막 (번지 색인이 마을과 따로, 1..SEA_LOT_COUNT). 없으면 마을 */
  zone?: HouseZone;
  style?: CottageStyleId;
  /** 처음 배치 (없으면 빈 방). placed = 그 배치에 놓인 개수, placedScore = 그 점수 (호출자가 designCounts·designScore로 센다) */
  layout?: HouseLayout;
  placed?: Record<string, number>;
  placedScore?: number;
  /** 함께 주는 가구 (그 집 가방에 +1씩, 한 집 id에 한 번만 — 철거 뒤 다시 분양받아도 또 주지 않는다) */
  starter?: readonly string[];
};

/** 번지 수 상한 (마을·포구) */
export const zoneMaxLots = (zone: HouseZone | undefined) => (zone === "sea" ? SEA_LOT_COUNT : VILLAGE_MAX_LOTS);

export type CreateResult = { lot: number } | "exists" | "lot_taken" | "full";

export type SaveResult = "ok" | "no_house" | "tier" | "not_owned";

/**
 * 오래 비운 집 정리 (reclaim.ts). owner·tier·ch는 정리할 때 읽은 값이고, 그대로일 때만 비운다.
 * cutoff = 이 시각 뒤에 들어온 주인이면 남긴다. since = 규칙을 켠 시각 (그 전 접속은 이 시각으로 센다, catalog RECLAIM_SINCE).
 * lastSeenAt = 바로 앞에서 다시 읽은 주인의 마지막 접속 (메모리만 쓴다 — Redis는 Lua 안에서 계정 해시를 직접 본다)
 * points = 돌려줄 포인트, label = 번지 표시 (선물 쪽지용)
 */
export type ReclaimInput = {
  owner: string;
  tier: PlotTierId;
  ch: number;
  points: number;
  cutoff: number;
  since: number;
  lastSeenAt: number;
  label: string;
  now: number;
  /** 11/16 오두막이면 sea (번지 색인이 따로) */
  zone?: HouseZone;
};

/** ok면 비웠다. gone = 이미 없거나 주인이 다름, changed = 그 사이 넓혔음, active = 주인이 돌아왔음 */
export type ReclaimResult = { points: number } | "gone" | "changed" | "active";

/** 아직 선물함으로 보내지 않은 정리 기록 (at = 비운 시각, 한 번 비울 때마다 한 줄) */
export type PendingReclaim = { at: number; points: number; label: string };

/** 좋아요 하루 1회 판정 기간 (KST 날짜를 키에 넣으므로 날짜가 바뀌면 다시 누를 수 있다. TTL은 정리용) */
export const LIKE_TTL_SEC = 2 * 86_400;
export const GUEST_DAY_TTL_SEC = 2 * 86_400;
export const GUEST_REPORT_TTL_SEC = 30 * 86_400;

export interface HouseStore {
  get(id: string): Promise<HouseRecord | null>;
  /** 가진 물건 (놓은 것 포함) */
  inventory(id: string): Promise<Record<string, number>>;
  /** 11/16 이 집 id에 시작 가구를 이미 준 적이 있는지 (오두막) */
  hasStarter(id: string): Promise<boolean>;
  /** 집 만들기와 번지 배정을 한 번에 (같은 채널의 같은 번지를 두 집이 받지 않는다. 채널이 다르면 같은 번지도 따로) */
  create(h: NewHouse): Promise<CreateResult>;
  /** 번지가 없는 (마을이 생기기 전) 집에 그 집 채널의 가장 앞의 빈 번지를 준다. 이미 있으면 그 번지 */
  assignLot(id: string): Promise<number | null>;
  /** 한 채널의 마을: 그 채널에 번지가 있는 모든 집 (숨김 포함, 번지 순). zone sea = 그 채널 포구 오두막 */
  village(ch?: number, zone?: HouseZone): Promise<HouseRecord[]>;
  /** 오두막 겉모습 바꾸기 (오두막이 아니거나 없으면 false) */
  setStyle(id: string, style: CottageStyleId, now: number): Promise<boolean>;
  /** 집과 딸린 키를 모두 지운다 (분양 결제 실패 보상·관리자 삭제) */
  remove(id: string): Promise<void>;
  /**
   * 오래 비운 집을 비운다: 주인·터 크기가 그대로이고 주인이 cutoff 뒤로 들어오지 않았을 때만, 한 번에(Redis는 Lua 하나).
   * 집·배치·방명록·번지 칸을 지우고 가방(inv)은 남긴다 (놓은 개수는 0으로 → 새로 분양받으면 다시 놓을 수 있다).
   * 같은 단계에서 돌려줄 포인트를 정리 기록(pendingReclaims)에 남긴다 → 두 번 비우거나 두 번 돌려주지 않는다
   */
  reclaim(id: string, r: ReclaimInput): Promise<ReclaimResult>;
  /** 아직 선물함으로 보내지 않은 정리 기록 (오래된 것 먼저) */
  pendingReclaims(id: string): Promise<PendingReclaim[]>;
  /** 선물함으로 보낸 정리 기록 한 줄을 지운다 (두 번 불러도 같다) */
  settleReclaim(id: string, at: number): Promise<void>;
  /** 정리 잠금 (함수 여러 개가 같은 정리를 겹쳐 하지 않게). 잡았으면 true */
  lockReclaim(ttlMs: number): Promise<boolean>;
  /** 관리자: 같은 채널 안에서 번지를 옮긴다 (그 번지에 다른 집이 있으면 taken) */
  moveLot(id: string, lot: number): Promise<"ok" | "no_house" | "taken">;
  setProfile(id: string, name: string, intro: string, now: number): Promise<boolean>;
  /** tier가 from일 때만 to로 바꾼다. price = 넓히기 값 (낸 포인트 기록 paid가 있으면 더한다) */
  upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number, price?: number): Promise<boolean>;
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
  /** 비운 집의 가방 (집이 없어도 남는다. 다시 분양받으면 그 집 가방이 된다) */
  private keptInv = new Map<string, Map<string, number>>();
  private pending = new Map<string, PendingReclaim[]>();
  private reclaimLockUntil = 0;
  /** 시작 가구를 이미 준 집 id */
  private starterGiven_ = new Set<string>();

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

  async hasStarter(id: string) {
    return this.starterGiven_.has(id);
  }

  async inventory(id: string) {
    return Object.fromEntries(this.houses.get(id)?.inv ?? this.keptInv.get(id) ?? []);
  }

  /** 채널마다 번지 → 집 (메모리는 집 기록에서 바로 센다. 채널이 없는 예전 기록은 1채널로 본다) */
  private lotTaken(ch: number, lot: number, zone?: HouseZone): boolean {
    for (const h of this.houses.values()) if (h.rec.lot === lot && housingChannelOf(h.rec.ch) === ch && h.rec.zone === (zone === "sea" ? "sea" : undefined)) return true;
    return false;
  }

  private freeLot(ch: number, zone?: HouseZone): number | null {
    // 비운 번지(CLOSED_LOTS)는 마을에서만 건너뛴다
    for (let l = 1; l <= zoneMaxLots(zone); l++) if ((zone === "sea" || isOpenLot(l)) && !this.lotTaken(ch, l, zone)) return l;
    return null;
  }

  async create(n: NewHouse): Promise<CreateResult> {
    if (this.houses.has(n.id)) return "exists";
    const ch = housingChannelOf(n.ch ?? LEGACY_HOUSING_CHANNEL);
    const sea = n.zone === "sea";
    if (n.lot !== null && this.lotTaken(ch, n.lot, n.zone)) return "lot_taken";
    const lot = n.lot ?? this.freeLot(ch, n.zone);
    if (lot === null) return "full";
    const kept = this.keptInv.get(n.id) ?? new Map<string, number>();
    this.keptInv.delete(n.id);
    if (n.starter?.length && !this.starterGiven_.has(n.id)) {
      this.starterGiven_.add(n.id);
      for (const it of n.starter) kept.set(it, (kept.get(it) ?? 0) + 1);
    }
    this.houses.set(n.id, {
      rec: {
        id: n.id,
        ch,
        lot,
        ...(sea ? { zone: "sea" as const, style: n.style ?? "wood" } : {}),
        exterior: defaultExterior(),
        owner: n.owner,
        name: n.name,
        intro: n.intro,
        ownerName: n.ownerName,
        tier: n.tier,
        layout: n.layout ? structuredClone(n.layout) : emptyLayout(),
        likes: 0,
        placedScore: n.placedScore ?? 0,
        createdAt: n.now,
        updatedAt: n.now,
        hidden: false,
        ...(n.paid !== undefined ? { paid: n.paid } : {}),
      },
      inv: kept,
      placed: new Map(Object.entries(n.placed ?? {})),
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
    const lot = this.freeLot(housingChannelOf(h.rec.ch), h.rec.zone);
    if (lot === null) return null;
    h.rec.lot = lot;
    return lot;
  }

  async village(ch = LEGACY_HOUSING_CHANNEL, zone?: HouseZone) {
    const want = zone === "sea" ? "sea" : undefined;
    return [...this.houses.values()]
      .filter((h) => h.rec.lot > 0 && housingChannelOf(h.rec.ch) === ch && h.rec.zone === want)
      .map((h) => this.view(h))
      .sort((a, b) => a.lot - b.lot);
  }

  async moveLot(id: string, lot: number) {
    const h = this.houses.get(id);
    if (!h) return "no_house" as const;
    const ch = housingChannelOf(h.rec.ch);
    for (const [oid, o] of this.houses) if (oid !== id && o.rec.lot === lot && housingChannelOf(o.rec.ch) === ch && o.rec.zone === h.rec.zone) return "taken" as const;
    h.rec.lot = lot;
    return "ok" as const;
  }

  async remove(id: string) {
    this.houses.delete(id);
    this.keptInv.delete(id);
    this.plantMap.delete(id);
    this.stateMap.delete(id);
  }

  async reclaim(id: string, r: ReclaimInput): Promise<ReclaimResult> {
    const h = this.houses.get(id);
    if (!h || h.rec.owner !== r.owner) return "gone";
    if (h.rec.tier !== r.tier) return "changed";
    const last = reclaimLastSeen(r.lastSeenAt, r.since);
    if (!(last > 0 && last <= r.cutoff)) return "active";
    this.houses.delete(id);
    this.plantMap.delete(id);
    this.stateMap.delete(id);
    if (h.inv.size) this.keptInv.set(id, h.inv);
    this.pending.set(id, [...(this.pending.get(id) ?? []), { at: r.now, points: r.points, label: r.label }]);
    return { points: r.points };
  }

  async pendingReclaims(id: string) {
    return [...(this.pending.get(id) ?? [])].sort((a, b) => a.at - b.at);
  }

  async settleReclaim(id: string, at: number) {
    const left = (this.pending.get(id) ?? []).filter((p) => p.at !== at);
    if (left.length) this.pending.set(id, left);
    else this.pending.delete(id);
  }

  async lockReclaim(ttlMs: number) {
    const now = Date.now();
    if (now < this.reclaimLockUntil) return false;
    this.reclaimLockUntil = now + ttlMs;
    return true;
  }

  async setStyle(id: string, style: CottageStyleId, now: number) {
    const h = this.houses.get(id);
    if (!h || h.rec.zone !== "sea") return false;
    Object.assign(h.rec, { style, updatedAt: now });
    return true;
  }

  async setProfile(id: string, name: string, intro: string, now: number) {
    const h = this.houses.get(id);
    if (!h) return false;
    Object.assign(h.rec, { name, intro, updatedAt: now });
    return true;
  }

  async upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number, price = 0) {
    const h = this.houses.get(id);
    if (!h || h.rec.tier !== from) return false;
    Object.assign(h.rec, { tier: to, updatedAt: now });
    if (h.rec.paid !== undefined && price > 0) h.rec.paid += price;
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
