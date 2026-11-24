import type { QuestHook } from "../store/types";
import { isOpenLot, WORLD_LOTS } from "@tomb/protocol";
import {
  defaultExterior,
  furnitureById,
  GUEST_KEEP,
  GUEST_PER_DAY,
  GUEST_REPORT_HIDE,
  housingChannelOf,
  houseScore,
  isHouseOwnDef,
  isSharedSkinDef,
  LEGACY_HOUSING_CHANNEL,
  reclaimLastSeen,
  SEA_LOT_COUNT,
  SEA_STARTER,
  type CottageStyleId,
  type HouseSort,
  type HouseZone,
  type PlotTierId,
} from "./catalog";
import type { ReportBy } from "../reports";
import { emptyLayout, liftWindowSkins, normalizeExterior } from "./layout";
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
  /** 함께 주는 가구 (그 집 몫 가방에 +1씩 — 공용 가방이 아니다. 한 집 id에 한 번만 — 철거 뒤 다시 분양받아도 또 주지 않는다) */
  starter?: readonly string[];
};

/**
 * 11/16 공용 가구 가방: 한 계정의 두 집 id (마을 집·포구 오두막, service housePair).
 * 가구는 마을 집 id에 붙은 공용 가방 하나에 모이고 (마을 집이 없어도 같은 자리), 두 집이 나눠 놓는다 — N개를 가지면 두 집 합쳐 N개까지.
 * 외관(isHouseOwnItem)과 오두막 시작 가구는 그 집 몫 (집 가방 inv에 남는다). 11/24 바닥·벽지는 공용 가방 (예전 집 몫은 읽을 때 옮긴다 — mergeSkins)
 */
export type HousePair = { village: string; sea: string };

/** 그 집의 id와 다른 집 id */
export const pairIds = (pair: HousePair, zone: HouseZone | undefined) =>
  zone === "sea" ? { self: pair.sea, other: pair.village } : { self: pair.village, other: pair.sea };

/** 집에 딸린 물건 (외관): 공용 가방에 넣지 않고 산 집 가방에 */
export const isHouseOwnItem = (itemId: string) => isHouseOwnDef(furnitureById(itemId));

/** 오두막 시작 가구 중 가구 (오두막 몫으로 1개씩 남긴다 — 옛 가방을 옮길 때도) */
export const SEA_STARTER_KEEP: readonly string[] = SEA_STARTER.filter((i) => !isHouseOwnItem(i) && !isSharedSkinDef(furnitureById(i)));

/**
 * 한 집에서 본 가방. have = 이 집에 놓을 수 있는 개수 (이 집 몫 + 공용 − 다른 집이 공용에서 꺼내 놓은 것),
 * away = 다른 집에 놓여 있어 여기서 못 쓰는 공용 개수 (치우면 여기 놓을 수 있다)
 */
export type InvView = { have: Record<string, number>; away: Record<string, number> };

/** 다른 집이 공용 가방에서 꺼내 놓은 개수 (그 집 몫을 넘게 놓은 만큼) */
const overOwn = (placed: Record<string, number>, own: Record<string, number>, it: string) => Math.max(0, (placed[it] ?? 0) - (own[it] ?? 0));

/** 두 저장소가 같은 규칙으로 센다 */
export function invView(pool: Record<string, number>, own: Record<string, number>, otherOwn: Record<string, number>, otherPlaced: Record<string, number>): InvView {
  const have: Record<string, number> = {};
  const away: Record<string, number> = {};
  for (const it of new Set([...Object.keys(pool), ...Object.keys(own)])) {
    const out = overOwn(otherPlaced, otherOwn, it);
    const n = Math.max(0, (own[it] ?? 0) + (pool[it] ?? 0) - out);
    if (n > 0) have[it] = n;
    const a = Math.min(out, pool[it] ?? 0);
    if (a > 0) away[it] = a;
  }
  return { have, away };
}

/**
 * 공용 가방 규칙으로 counts(이 집에 놓을 개수)를 놓을 수 있나: 물건마다 (이 집이 몫을 넘게 놓은 수) + (다른 집이 몫을 넘게 놓은 수) ≤ 공용 개수.
 * Redis SAVE_LUA와 같은 규칙
 */
export function fitsPool(counts: Record<string, number>, pool: Record<string, number>, own: Record<string, number>, otherOwn: Record<string, number>, otherPlaced: Record<string, number>): boolean {
  return Object.entries(counts).every(([it, n]) => Math.max(0, n - (own[it] ?? 0)) + overOwn(otherPlaced, otherOwn, it) <= (pool[it] ?? 0));
}

/**
 * 되팔기 1개를 어디서 뺄지: 공용에 놓이지 않은 것이 있으면 공용에서, 아니면 이 집 몫에서 (안 놓인 것만).
 * none = 이 집에서 쓸 수 있는 게 없음, placed = 모두 이 집에 놓임, away = 남은 건 다른 집에 놓임. Redis TAKE_ITEM_LUA와 같은 규칙
 */
export function takeFrom(
  it: string,
  pool: Record<string, number>,
  own: Record<string, number>,
  placed: Record<string, number>,
  otherOwn: Record<string, number>,
  otherPlaced: Record<string, number>,
): "pool" | "own" | "none" | "placed" | "away" {
  const o = own[it] ?? 0;
  const p = pool[it] ?? 0;
  if (o + p < 1) return "none";
  const out = overOwn(otherPlaced, otherOwn, it);
  if (p - overOwn(placed, own, it) - out >= 1) return "pool";
  if (o - (placed[it] ?? 0) >= 1) return "own";
  return out > 0 && (placed[it] ?? 0) === 0 ? "away" : "placed";
}

/** 번지 수 상한 (마을·포구). 11/19 2단지를 닫아 마을은 메인 맵 번지(1..WORLD_LOTS)까지만 — 다 차면 분양·번지 배정이 「빈 번지 없음」 */
export const zoneMaxLots = (zone: HouseZone | undefined) => (zone === "sea" ? SEA_LOT_COUNT : WORLD_LOTS);

export type CreateResult = { lot: number } | "exists" | "lot_taken" | "full";

/** conflict = 11/18 읽은 뒤 다른 저장이 먼저 됐다 (base가 지금 updatedAt과 다르다 — 배치·외관을 동시에 저장해 놓은 개수가 옛 값으로 덮이지 않게) */
export type SaveResult = "ok" | "no_house" | "tier" | "not_owned" | "conflict";

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
/** 11/18 방명록 글을 신고한 사람 (관리자 신고함에 보인다). weak = 갓 만든 계정이라 가림 수에는 안 들어간 신고 */
export type GuestReporter = { accountId: string; name: string | null; at: number; weak?: true };

export interface HouseStore {
  get(id: string): Promise<HouseRecord | null>;
  /**
   * 11/16 그 집에서 본 가방 (공용 가방 + 그 집 몫, 다른 집에 놓인 공용 몫은 away).
   * Redis는 처음 읽을 때 옛 집마다 가방을 공용 가방으로 옮긴다 (한 번만, 같은 Lua 안에서)
   */
  inventory(pair: HousePair, zone: HouseZone): Promise<InvView>;
  /** 그 집 몫 가방만 (바닥·벽지·외관·시작 가구. 공용 가방은 빼고) */
  ownItems(id: string): Promise<Record<string, number>>;
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
  /** 집과 딸린 키를 모두 지운다 (분양 결제 실패 보상·관리자 삭제). 공용 가구 가방은 남긴다 (다른 집이 쓴다) */
  remove(id: string): Promise<void>;
  /**
   * 오래 비운 집을 비운다: 주인·터 크기가 그대로이고 주인이 cutoff 뒤로 들어오지 않았을 때만, 한 번에(Redis는 Lua 하나).
   * 집·배치·방명록·번지 칸을 지우고 가방(inv, 그 집 몫)은 남긴다. 놓은 개수는 0으로 → 그 집에 놓였던 공용 가구는 공용 가방으로 돌아가 다른 집에 놓을 수 있다.
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
  /** 11/19 「필지 대기」: 번지 칸을 비우고 집의 번지를 0으로 (집·가구·방명록은 그대로 — 빈 번지가 나면 assignLot이 다시 준다). 집이 없으면 false */
  unlot(id: string): Promise<boolean>;
  setProfile(id: string, name: string, intro: string, now: number): Promise<boolean>;
  /** tier가 from일 때만 to로 바꾼다. price = 넓히기 값 (낸 포인트 기록 paid가 있으면 더한다) */
  upgrade(id: string, from: PlotTierId, to: PlotTierId, now: number, price?: number): Promise<boolean>;
  /** 가방에 1개: 가구·바닥·벽지는 공용 가방, 외관은 그 집 가방 (그 가방에서 max 이상이면 "max", 그 집이 없으면 "no_house") */
  addItem(pair: HousePair, zone: HouseZone, itemId: string, max: number): Promise<"ok" | "max" | "no_house">;
  /** 두 집 어디에도 놓이지 않은 1개를 뺀다 (되팔기, takeFrom). 이 집에 다 놓였으면 "placed", 남은 게 다른 집에 놓였으면 "away", 없으면 "none" */
  takeItem(pair: HousePair, zone: HouseZone, itemId: string): Promise<"ok" | "placed" | "away" | "none">;
  /**
   * 배치·외관 저장 (null인 쪽은 그대로). tier가 그대로이고 counts(안+밖 전체)가 공용 가방 규칙(fitsPool, 다른 집에 놓인 것까지)에 맞을 때만 — 한 번에.
   * 검증·점수 계산은 호출자가 먼저 한다. 배치가 바뀌면 같은 단계에서 치우거나 옮긴 가구의 상태·없어진 화분 기록을 지운다.
   * 11/18 base = 호출자가 읽은 집의 updatedAt (주면 그대로일 때만 저장, 아니면 "conflict"). 저장하면 updatedAt은 반드시 커진다
   */
  saveDesign(
    pair: HousePair,
    zone: HouseZone,
    tier: PlotTierId,
    layout: HouseLayout | null,
    exterior: HouseExterior | null,
    counts: Record<string, number>,
    placedScore: number,
    now: number,
    base?: number,
  ): Promise<SaveResult>;
  /** 좋아요. 오늘 이미 눌렀으면 "already", 집이 없거나 숨김이면 null */
  like(id: string, visitorId: string, day: string, quest?: QuestHook | null): Promise<{ likes: number; score: number } | "already" | null>;
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
  /**
   * 신고 (11/18 계정 단위 — 예전엔 IP 해시라 같은 회사·집 여럿의 신고가 1건이었다). 서로 다른 계정 GUEST_REPORT_HIDE명이면 가린다.
   * 같은 계정의 재신고는 "duplicate". 신고한 사람(계정 id·이름·시각)을 남긴다(guestReporters). 글이 없으면 null.
   * weak(갓 만든 계정)면 관리자 신고함에만 보이고(신고 수 0으로라도 목록에 올린다) 가림 수에는 넣지 않는다
   */
  reportGuest(id: string, entryId: string, by: ReportBy, weak?: boolean, at?: number): Promise<"added" | "duplicate" | null>;
  /** 관리자: 그 글을 신고한 사람들 (최근 먼저). 11/18 전 신고는 이름이 없어 빠진다 */
  guestReporters(id: string, entryId: string): Promise<GuestReporter[]>;
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
  /**
   * 11/22 순위 ZSET(houses:score)을 지금 점수 규칙(터 크기 점수 포함)으로 다시 맞춘다. 규칙 판(SCORE_RULE_VER)마다 한 번만 (표시를 남긴다).
   * 맞춘 집 수, 이미 맞췄으면 null. 메모리는 읽을 때 계산하므로 할 일이 없다
   */
  syncRankScores(): Promise<number | null>;
}

/** 11/22 순위 점수 규칙 판 (규칙을 바꾸면 올린다 → 다음 정리 때 순위 ZSET을 한 번 다시 맞춘다) */
export const SCORE_RULE_VER = "2026-11-22-tier";

/** 꾸밈 점수 = 물건 점수 + 좋아요 × LIKE_WEIGHT + 터 크기 점수 (11/22 tier — catalog houseScore) */
export const scoreOf = (placed: number, likes: number, tier: string | null | undefined) => houseScore(placed, likes, tier);

// ── 메모리 (로컬 개발·테스트) ──

type MemHouse = {
  rec: Omit<HouseRecord, "score" | "items">;
  /** 그 집 몫 가방 (바닥·벽지·외관·시작 가구) */
  inv: Map<string, number>;
  placed: Map<string, number>;
  guests: StoredGuest[];
  guestHidden: Set<string>;
  guestReports: Map<string, Set<string>>;
  /** 11/18 글 → 신고한 계정 → 누가·언제 (같은 계정 중복 막기도 여기서) */
  guestRepBy: Map<string, Map<string, GuestReporter>>;
};

export class MemoryHouseStore implements HouseStore {
  private houses = new Map<string, MemHouse>();
  private likes = new Set<string>();
  private guestDay = new Map<string, number>();
  private plantMap = new Map<string, Record<string, PlantState>>();
  private stateMap = new Map<string, Record<string, HouseState>>();
  /** 비운 집의 가방 (집이 없어도 남는다. 다시 분양받으면 그 집 가방이 된다) */
  private keptInv = new Map<string, Map<string, number>>();
  /** 11/16 공용 가구 가방 (마을 집 id → 물건 → 개수) */
  private pools = new Map<string, Map<string, number>>();
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
    // 11/24 예전에 바닥에 놓은 눈꽃 창가는 창문 모양으로 읽는다 (layout.ts liftWindowSkins)
    const layout = liftWindowSkins(structuredClone(r.layout));
    return {
      ...r,
      layout,
      ch: housingChannelOf(r.ch),
      lot: r.lot ?? 0,
      exterior: normalizeExterior(r.exterior),
      score: scoreOf(r.placedScore, r.likes, r.tier),
      items: layout.items.length,
    };
  }

  async get(id: string) {
    const h = this.houses.get(id);
    return h ? this.view(h) : null;
  }

  async hasStarter(id: string) {
    return this.starterGiven_.has(id);
  }

  private own(id: string): Record<string, number> {
    return Object.fromEntries(this.houses.get(id)?.inv ?? this.keptInv.get(id) ?? []);
  }

  private placedOf(id: string): Record<string, number> {
    return Object.fromEntries(this.houses.get(id)?.placed ?? []);
  }

  private pool(pair: HousePair): Map<string, number> {
    let m = this.pools.get(pair.village);
    if (!m) this.pools.set(pair.village, (m = new Map()));
    return m;
  }

  /**
   * 11/24 예전 집 몫 가방(비운 집 가방 포함)의 바닥·벽지를 공용 가방으로 옮긴다. 옮긴 뒤 집 몫은 0이라 몇 번 불러도 같다(멱등).
   * 놓인 개수(placed)는 그대로 — 두 집 합계 ≤ 공용 개수가 그대로 맞는다 (Redis smerge와 같은 규칙)
   */
  private mergeSkins(pair: HousePair): void {
    const pool = this.pool(pair);
    for (const id of [pair.village, pair.sea]) {
      const inv = this.houses.get(id)?.inv ?? this.keptInv.get(id);
      if (!inv) continue;
      for (const [it, n] of [...inv])
        if (isSharedSkinDef(furnitureById(it))) {
          if (n > 0) pool.set(it, (pool.get(it) ?? 0) + n);
          inv.delete(it);
        }
    }
  }

  async inventory(pair: HousePair, zone: HouseZone) {
    this.mergeSkins(pair);
    const { self, other } = pairIds(pair, zone);
    return invView(Object.fromEntries(this.pool(pair)), this.own(self), this.own(other), this.placedOf(other));
  }

  async ownItems(id: string) {
    return this.own(id);
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
      guestRepBy: new Map(),
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

  async unlot(id: string) {
    const h = this.houses.get(id);
    if (!h) return false;
    h.rec.lot = 0;
    return true;
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

  async addItem(pair: HousePair, zone: HouseZone, itemId: string, max: number) {
    const h = this.houses.get(pairIds(pair, zone).self);
    if (!h) return "no_house" as const;
    this.mergeSkins(pair);
    const bag = isHouseOwnItem(itemId) ? h.inv : this.pool(pair);
    const n = bag.get(itemId) ?? 0;
    if (n >= max) return "max" as const;
    bag.set(itemId, n + 1);
    return "ok" as const;
  }

  async takeItem(pair: HousePair, zone: HouseZone, itemId: string) {
    this.mergeSkins(pair);
    const { self, other } = pairIds(pair, zone);
    const pool = this.pool(pair);
    const from = takeFrom(itemId, Object.fromEntries(pool), this.own(self), this.placedOf(self), this.own(other), this.placedOf(other));
    if (from === "none" || from === "placed" || from === "away") return from;
    const bag = from === "pool" ? pool : (this.houses.get(self)?.inv ?? this.keptInv.get(self));
    const n = bag?.get(itemId) ?? 0;
    if (!bag || n < 1) return "none" as const;
    if (n === 1) bag.delete(itemId);
    else bag.set(itemId, n - 1);
    return "ok" as const;
  }

  async saveDesign(
    pair: HousePair,
    zone: HouseZone,
    tier: PlotTierId,
    layout: HouseLayout | null,
    exterior: HouseExterior | null,
    counts: Record<string, number>,
    placedScore: number,
    now: number,
    base?: number,
  ) {
    const { self: id, other } = pairIds(pair, zone);
    const h = this.houses.get(id);
    if (!h) return "no_house" as const;
    if (h.rec.tier !== tier) return "tier" as const;
    if (base !== undefined && h.rec.updatedAt !== base) return "conflict" as const;
    this.mergeSkins(pair);
    if (!fitsPool(counts, Object.fromEntries(this.pool(pair)), this.own(id), this.own(other), this.placedOf(other))) return "not_owned" as const;
    h.placed = new Map(Object.entries(counts));
    if (layout) {
      h.rec.layout = structuredClone(layout);
      this.pruneFor(id, layout);
    }
    if (exterior) h.rec.exterior = { ...exterior };
    Object.assign(h.rec, { placedScore, updatedAt: Math.max(now, h.rec.updatedAt + 1) });
    return "ok" as const;
  }

  async like(id: string, visitorId: string, day: string, quest?: QuestHook | null) {
    const h = this.houses.get(id);
    if (!h || h.rec.hidden) return null;
    const key = `${id}:${visitorId}:${day}`;
    if (this.likes.has(key)) return "already" as const;
    this.likes.add(key);
    if (quest) quest.have = quest.local(1);
    h.rec.likes += 1;
    return { likes: h.rec.likes, score: scoreOf(h.rec.placedScore, h.rec.likes, h.rec.tier) };
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
    h.guestRepBy.delete(entryId);
    return g;
  }

  async reportGuest(id: string, entryId: string, by: ReportBy, weak = false, at = Date.now()) {
    const h = this.houses.get(id);
    if (!h || !h.guests.some((g) => g.id === entryId)) return null;
    let who = h.guestRepBy.get(entryId);
    if (!who) h.guestRepBy.set(entryId, (who = new Map()));
    if (who.has(by.accountId)) return "duplicate" as const;
    who.set(by.accountId, { accountId: by.accountId, name: by.name, at, ...(weak ? { weak: true as const } : {}) });
    let set = h.guestReports.get(entryId);
    if (!set) h.guestReports.set(entryId, (set = new Set()));
    if (weak) return "added" as const;
    set.add(by.accountId);
    if (set.size >= GUEST_REPORT_HIDE) h.guestHidden.add(entryId);
    return "added" as const;
  }

  async guestReporters(id: string, entryId: string) {
    return [...(this.houses.get(id)?.guestRepBy.get(entryId)?.values() ?? [])].sort((a, b) => b.at - a.at);
  }

  async setGuestHidden(id: string, entryId: string, hidden: boolean) {
    const h = this.houses.get(id);
    if (!h || !h.guests.some((g) => g.id === entryId)) return false;
    if (hidden) h.guestHidden.add(entryId);
    else {
      h.guestHidden.delete(entryId);
      h.guestReports.delete(entryId);
      h.guestRepBy.delete(entryId);
    }
    return true;
  }

  async guestReports(id: string) {
    const h = this.houses.get(id);
    return new Map([...(h?.guestReports ?? [])].map(([k, v]) => [k, v.size]));
  }

  async syncRankScores() {
    return null;
  }
}
