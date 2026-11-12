import { createHmac } from "node:crypto";
import { nanoid } from "nanoid";
import { env } from "../env";
import { HttpError } from "../http";
import { kstDay, kstWeek } from "../store/accounts";
import type { Me } from "../types";
import {
  furnitureById,
  isHousingChannel,
  LEGACY_HOUSING_CHANNEL,
  lotLabel,
  MAX_OWN_PER_ITEM,
  nextTier,
  PLOT_TIERS,
  plotCost,
  sellPrice,
  tierById,
  villageLots,
  VILLAGE_MAX_LOTS,
  type PlotTierId,
} from "./catalog";
import { designCounts, designScore, validateExterior, validateLayout } from "./layout";
import { waterWait, watered, type PlantsResponse } from "./plants";
import { liveStates, stateTarget, type HouseStatesResponse } from "./states";
import { myPoints, refundAndThrow, rewardLike, spend, refund } from "./points";
import { MemoryHouseStore, type HouseRecord, type HouseStore } from "./store";
import { RedisHouseStore } from "./store-redis";
import type { GuestEntryView, HouseExterior, HouseLayout, HouseSummary, MyHouseResponse, PublicHouse, VillageResponse } from "./types";

// 라우트가 쓰는 하우징 동작. 돈이 오가는 동작은 "검사 → spendPoints → 집 쪽 Lua" 순서이고,
// 집 쪽 단계가 경합으로 실패하면(동시에 두 번 누름 등) 쓴 포인트를 그대로 돌려준다.

const g = globalThis as typeof globalThis & { __tombHouses?: HouseStore };

export function getHouseStore(): HouseStore {
  const conn = env.redis();
  const cur = g.__tombHouses;
  if (conn) return cur instanceof RedisHouseStore ? cur : (g.__tombHouses = new RedisHouseStore(conn));
  if (env.isProd()) throw new Error("[housing] Redis 환경변수가 없습니다.");
  if (cur instanceof MemoryHouseStore) return cur;
  // HMR로 클래스가 바뀌어도 로컬에서 만든 집을 잃지 않게 필드를 옮긴다
  g.__tombHouses = cur ? Object.assign(new MemoryHouseStore(), cur) : new MemoryHouseStore();
  return g.__tombHouses;
}

/** 공개 집 id: 계정 id의 HMAC 앞 12자 (계정 id = 쿠키 신원이라 그대로 내보내지 않는다) */
export function houseIdFor(accountId: string): string {
  return createHmac("sha256", env.sessionSecret()).update(`house:${accountId}`).digest("base64url").slice(0, 12);
}

const HOUSE_ID_RE = /^[A-Za-z0-9_-]{12}$/;
export const isHouseId = (id: string) => HOUSE_ID_RE.test(id);

export const houseNotFound = () => new HttpError(404, "NOT_FOUND", "그 집을 찾을 수 없어요.");
const noHouse = () => new HttpError(409, "NO_HOUSE", "먼저 분양 사무소에서 내 집을 분양받아 주세요.");

export function toPublicHouse(r: HouseRecord): PublicHouse {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, hidden, items, ...pub } = r;
  return pub;
}

export function toSummary(r: HouseRecord): HouseSummary {
  return {
    id: r.id,
    ch: r.ch,
    lot: r.lot,
    name: r.name,
    ownerName: r.ownerName,
    tier: r.tier,
    score: r.score,
    likes: r.likes,
    items: r.items,
    createdAt: r.createdAt,
  };
}

/** 공개 조회용: 없거나 숨긴 집은 404 */
export async function findVisibleHouse(store: HouseStore, id: string): Promise<HouseRecord> {
  const h = isHouseId(id) ? await store.get(id) : null;
  if (!h || h.hidden) throw houseNotFound();
  return h;
}

export async function myHouse(store: HouseStore, accountId: string, me?: Me): Promise<MyHouseResponse> {
  const id = houseIdFor(accountId);
  const [h0, inventory, m] = await Promise.all([store.get(id), store.inventory(id), me ?? myPoints(accountId)]);
  // 마을이 생기기 전에 분양받은 집은 처음 열 때 번지를 받는다
  const h = h0 && !h0.lot && (await store.assignLot(id)) ? await store.get(id) : h0;
  return { house: h ? toPublicHouse(h) : null, inventory, points: m.points };
}

const mustHave = async (store: HouseStore, accountId: string): Promise<HouseRecord> => {
  const h = await store.get(houseIdFor(accountId));
  if (!h) throw noHouse();
  return h;
};

const lotTaken = () => new HttpError(409, "LOT_TAKEN", "그 번지는 방금 다른 분이 분양받았어요. 다른 번지를 골라 주세요.");

/**
 * 채널마다 주거 구역이 따로다. 내 집을 다루는 요청(외관·배치·넓히기)은 지금 있는 채널(ch)을 함께 보내고,
 * 내 집이 다른 채널에 있으면 거절한다 (다른 채널의 필지를 건드리지 못하게). ch가 없으면(서버 안 호출) 검사하지 않는다
 */
export function assertChannel(h: Pick<HouseRecord, "ch" | "lot">, ch: number | undefined): void {
  if (ch === undefined || ch === h.ch) return;
  throw new HttpError(409, "WRONG_CHANNEL", `내 집은 ${lotLabel(h.ch, h.lot)}에 있어요. ${h.ch}채널로 옮긴 뒤 다시 해 주세요.`);
}

/** 채널 번호가 1..HOUSING_CHANNELS 밖 */
const badChannel = () => new HttpError(400, "INVALID_INPUT", "채널 번호가 올바르지 않아요.");

export async function buyPlot(
  store: HouseStore,
  accountId: string,
  name: string,
  intro: string,
  ownerName: string,
  lot: number | null = null,
  ch: number = LEGACY_HOUSING_CHANNEL,
  tierId: PlotTierId = PLOT_TIERS[0].id,
): Promise<MyHouseResponse> {
  const id = houseIdFor(accountId);
  if (!isHousingChannel(ch)) throw badChannel();
  const tier = tierById(tierId);
  if (!tier) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 터 크기예요.");
  // 바로 사기 값 = 작은 터 + 넓히기 값 누적 (업그레이드로 올린 것과 같은 값)
  const cost = plotCost(tier.id);
  const had = await store.get(id);
  if (had) throw new HttpError(409, "ALREADY_OWNED", `이미 ${lotLabel(had.ch, had.lot)}에 내 집이 있어요. 한 계정에 하나만 분양받을 수 있어요.`);
  if (lot !== null && (!Number.isInteger(lot) || lot < 1 || lot > VILLAGE_MAX_LOTS))
    throw new HttpError(400, "INVALID_INPUT", `번지는 1~${VILLAGE_MAX_LOTS} 중에서 골라 주세요.`);
  if (lot !== null && (await store.village(ch)).some((h) => h.lot === lot)) throw lotTaken();
  await spend(accountId, cost, tier.id === PLOT_TIERS[0].id ? "plot" : `plot:${tier.id}`);
  const r = await store.create({ id, owner: accountId, name, intro, ownerName, tier: tier.id, ch, lot, now: Date.now() });
  if (r === "exists") await refundAndThrow(accountId, cost, new HttpError(409, "ALREADY_OWNED", "이미 내 집이 있어요."));
  if (r === "lot_taken") await refundAndThrow(accountId, cost, lotTaken());
  if (r === "full") await refundAndThrow(accountId, cost, new HttpError(409, "VILLAGE_FULL", "마을에 빈 번지가 없어요."));
  return myHouse(store, accountId);
}

/** 한 채널의 분양 마을: 그 채널에 번지가 있는 집들의 외관·문패 (숨긴 집은 자리만) */
export async function village(store: HouseStore, ch: number = LEGACY_HOUSING_CHANNEL, now = Date.now()): Promise<VillageResponse> {
  if (!isHousingChannel(ch)) throw badChannel();
  let all = await store.village(ch);
  // 마을이 생기기 전에 분양받은 집(번지·채널 없음 → 1채널)은 1채널 마을을 열 때 빈 번지를 받는다 (한 번만 일어난다)
  if (ch === LEGACY_HOUSING_CHANNEL) {
    const missing = (await store.listAll()).filter((h) => !h.lot);
    if (missing.length) {
      for (const h of missing) await store.assignLot(h.id);
      all = await store.village(ch);
    }
  }
  const shown = all.filter((h) => !h.hidden);
  const maxLot = all.reduce((m, h) => Math.max(m, h.lot), 0);
  return {
    ch,
    lots: villageLots(maxLot, all.length),
    houses: shown.map((h) => ({ ...toSummary(h), exterior: h.exterior })),
    taken: all.filter((h) => h.hidden).map((h) => h.lot),
    generatedAt: now,
  };
}

export async function editProfile(store: HouseStore, accountId: string, name: string, intro: string): Promise<MyHouseResponse> {
  if (!(await store.setProfile(houseIdFor(accountId), name, intro, Date.now()))) throw noHouse();
  return myHouse(store, accountId);
}

export async function upgradePlot(store: HouseStore, accountId: string, to: PlotTierId, ch?: number): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId);
  assertChannel(h, ch);
  const next = nextTier(h.tier);
  if (!next || next.id !== to) throw new HttpError(409, "BAD_TIER", "지금 터에서 바로 올릴 수 있는 크기가 아니에요.");
  await spend(accountId, next.price, `upgrade:${to}`);
  if (!(await store.upgrade(h.id, h.tier, to, Date.now())))
    await refundAndThrow(accountId, next.price, new HttpError(409, "CONFLICT", "터 크기가 이미 바뀌었어요. 다시 확인해 주세요."));
  return myHouse(store, accountId);
}

export async function buyFurniture(store: HouseStore, accountId: string, itemId: string): Promise<MyHouseResponse> {
  const def = furnitureById(itemId);
  if (!def) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 물건이에요.");
  const h = await mustHave(store, accountId);
  const owned = (await store.inventory(h.id))[itemId] ?? 0;
  if (owned >= MAX_OWN_PER_ITEM) throw new HttpError(409, "MAX_OWNED", `${def.name}은(는) ${MAX_OWN_PER_ITEM}개까지 가질 수 있어요.`);
  const me = await spend(accountId, def.price, `furniture:${itemId}`);
  const r = await store.addItem(h.id, itemId, MAX_OWN_PER_ITEM);
  if (r !== "ok")
    await refundAndThrow(
      accountId,
      def.price,
      r === "max" ? new HttpError(409, "MAX_OWNED", `${def.name}은(는) ${MAX_OWN_PER_ITEM}개까지 가질 수 있어요.`) : noHouse(),
    );
  return myHouse(store, accountId, me);
}

export async function sellFurniture(store: HouseStore, accountId: string, itemId: string): Promise<MyHouseResponse & { refunded: number }> {
  const def = furnitureById(itemId);
  if (!def) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 물건이에요.");
  const h = await mustHave(store, accountId);
  const r = await store.takeItem(h.id, itemId);
  if (r === "none") throw new HttpError(409, "NO_ITEM", "그 물건을 가지고 있지 않아요.");
  if (r === "placed") throw new HttpError(409, "PLACED", "모두 놓여 있어요. 먼저 집에서 치운 뒤 저장해 주세요.");
  const refunded = sellPrice(def);
  const me = await refund(accountId, refunded);
  return { ...(await myHouse(store, accountId, me)), refunded };
}

export async function saveLayout(store: HouseStore, accountId: string, tier: PlotTierId, layout: HouseLayout, ch?: number): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId);
  assertChannel(h, ch);
  if (h.tier !== tier) throw new HttpError(409, "CONFLICT", "터 크기가 바뀌었어요. 다시 열어 주세요.");
  const v = validateLayout(layout, tier, await store.inventory(h.id));
  if (!v.ok) throw new HttpError(400, v.code, v.message);
  // 놓은 개수·점수는 안(배치) + 밖(지금 외관)을 함께 센다 (외관에 쓴 아이템을 되팔지 못하게)
  const r = await store.saveDesign(h.id, tier, layout, null, designCounts(layout, h.exterior), designScore(layout, h.exterior), Date.now());
  if (r === "no_house") throw noHouse();
  if (r === "tier") throw new HttpError(409, "CONFLICT", "터 크기가 바뀌었어요. 다시 열어 주세요.");
  if (r === "not_owned") throw new HttpError(409, "NOT_OWNED", "가진 것보다 많이 놓았어요. 가방을 다시 확인해 주세요.");
  return myHouse(store, accountId);
}

export async function saveExterior(store: HouseStore, accountId: string, exterior: Record<string, unknown>, ch?: number): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId);
  assertChannel(h, ch);
  const v = validateExterior(exterior, await store.inventory(h.id));
  if (!v.ok) throw new HttpError(400, v.code, v.message);
  const ext: HouseExterior = v.exterior;
  const r = await store.saveDesign(h.id, h.tier, null, ext, designCounts(h.layout, ext), designScore(h.layout, ext), Date.now());
  if (r === "no_house") throw noHouse();
  if (r === "tier") throw new HttpError(409, "CONFLICT", "터 크기가 바뀌었어요. 다시 열어 주세요.");
  if (r === "not_owned") throw new HttpError(409, "NOT_OWNED", "가진 것보다 많이 썼어요. 가방을 다시 확인해 주세요.");
  return myHouse(store, accountId);
}

export async function likeHouse(
  store: HouseStore,
  houseId: string,
  visitorId: string,
  ip: string,
  now = Date.now(),
): Promise<{ likes: number; score: number; earnedOwner: number }> {
  const h = await findVisibleHouse(store, houseId);
  if (h.owner === visitorId) throw new HttpError(409, "OWN_HOUSE", "내 집에는 좋아요를 누를 수 없어요.");
  const r = await store.like(h.id, visitorId, kstDay(now));
  if (r === null) throw houseNotFound();
  if (r === "already") throw new HttpError(409, "ALREADY_LIKED", "오늘은 이미 좋아요를 눌렀어요. 내일 또 들러 주세요.");
  const earnedOwner = await rewardLike(h.owner, ip).catch(() => 0);
  return { ...r, earnedOwner };
}

// ── 3번 화분 물 주기 ──

/** 지금 놓인 화분의 물 준 기록만 */
export async function housePlants(store: HouseStore, houseId: string, now = Date.now()): Promise<PlantsResponse> {
  const h = await findVisibleHouse(store, houseId);
  const pots = new Set(h.layout.items.filter((p) => p.i === "pot").map((p) => p.u));
  const all = await store.plants(h.id);
  return { plants: Object.fromEntries(Object.entries(all).filter(([u]) => pots.has(u))), now };
}

/** 화분 u에 물 주기 (누구든, 화분마다 WATER_COOLDOWN_MS에 한 번) */
export async function waterPlant(store: HouseStore, houseId: string, u: string, now = Date.now()): Promise<PlantsResponse> {
  const h = await findVisibleHouse(store, houseId);
  if (!h.layout.items.some((p) => p.u === u && p.i === "pot")) throw new HttpError(404, "NO_PLANT", "그 화분을 찾을 수 없어요.");
  const all = await store.plants(h.id);
  const wait = waterWait(all[u], now);
  if (wait > 0) {
    const min = Math.ceil(wait / 60_000);
    const left = min >= 60 ? `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""}` : `${min}분`;
    throw new HttpError(409, "WATERED", `흙이 아직 촉촉해요. ${left} 뒤에 다시 물을 줄 수 있어요.`);
  }
  await store.setPlant(h.id, u, watered(all[u], now));
  return housePlants(store, houseId, now);
}

// ── 3번 가구 상태 (벽난로 불·스탠드·라디오 채널·창문) ──

/** 지금 배치와 맞는 켜짐·채널 값만 (0·꺼짐은 빠진다) */
export async function houseStates(store: HouseStore, houseId: string): Promise<HouseStatesResponse> {
  const h = await findVisibleHouse(store, houseId);
  return { states: liveStates(h.layout, h.tier, await store.states(h.id)) };
}

/** 가구 u의 상태를 a로 (방에 들어온 누구든 — 방 중계 use와 같은 권한). 0이면 지운다 */
export async function setHouseState(store: HouseStore, houseId: string, u: string, a: number): Promise<void> {
  const h = await findVisibleHouse(store, houseId);
  const t = stateTarget(h.layout, h.tier, u);
  if (!t) throw new HttpError(404, "NO_TARGET", "그 가구를 찾을 수 없어요.");
  if (!Number.isInteger(a) || a < 0 || a > t.max) throw new HttpError(400, "BAD_REQUEST", "알 수 없는 값이에요.");
  await store.setState(h.id, u, a ? { a, s: t.s } : null);
}

export async function postGuest(
  store: HouseStore,
  houseId: string,
  visitorId: string,
  name: string,
  text: string,
  now = Date.now(),
): Promise<void> {
  const h = await findVisibleHouse(store, houseId);
  const r = await store.addGuest(h.id, { id: nanoid(10), name, text, at: now, author: visitorId }, kstDay(now));
  if (r === "no_house") throw houseNotFound();
  if (r === "limit") throw new HttpError(429, "RATE_LIMITED", "방명록은 하루에 10번까지 남길 수 있어요.");
}

export async function guestView(store: HouseStore, houseId: string, visitorId: string | null): Promise<GuestEntryView[]> {
  return (await store.guestbook(houseId, false)).map((g) => ({ id: g.id, name: g.name, text: g.text, at: g.at, mine: !!visitorId && g.author === visitorId }));
}

/** 글쓴이 또는 집주인만 지울 수 있다 */
export async function deleteGuest(store: HouseStore, houseId: string, entryId: string, visitorId: string): Promise<void> {
  const h = await findVisibleHouse(store, houseId);
  const entry = (await store.guestbook(h.id, true)).find((e) => e.id === entryId);
  if (!entry) throw new HttpError(404, "NOT_FOUND", "그 글을 찾을 수 없어요.");
  if (entry.author !== visitorId && h.owner !== visitorId) throw new HttpError(403, "FORBIDDEN", "내가 쓴 글이나 내 집의 글만 지울 수 있어요.");
  await store.removeGuest(h.id, entryId);
}


// ── F11 꾸밈 점수 랭킹 (GET /api/rank?board=house) ──

/** 랭킹을 고르는 후보 수 (꾸밈 점수 상위). 주간은 이 안에서 이번 주에 꾸민 집만 남긴다 */
export const HOUSE_RANK_POOL = 300;

/** 이번 주(KST 월요일 0시) 시작 시각 (epoch ms) */
export function kstWeekStart(now = Date.now()): number {
  const w = kstWeek(now);
  return Date.UTC(Number(w.slice(0, 4)), Number(w.slice(4, 6)) - 1, Number(w.slice(6, 8))) - 9 * 3_600_000;
}

export type HouseRankRow = { rank: number; name: string; sub: string; value: number; me: boolean };

/**
 * 꾸밈 점수 순위. all = 숨기지 않은 모든 집, week = 이번 주에 분양·꾸미기(배치·외관·넓히기·이름)를 한 집.
 * mine: 내 집이 순위(size) 밖이면 그 줄 (후보 안에 있을 때만), 안이면 null (rows의 me로 표시)
 * staffId: 운영자 계정의 집은 순위를 매기기 전에 뺀다 (순번이 비지 않게. 후보가 넉넉해 size명은 찬다)
 */
export async function houseRank(
  store: HouseStore,
  period: "week" | "all",
  accountId: string | null,
  size: number,
  now = Date.now(),
  staffId: string | null = null,
): Promise<{ rows: HouseRankRow[]; mine: HouseRankRow | null }> {
  const since = period === "week" ? kstWeekStart(now) : 0;
  const staffHouse = staffId ? houseIdFor(staffId) : null;
  const pool = (await store.list("score", HOUSE_RANK_POOL)).filter(
    (h) => !h.hidden && h.id !== staffHouse && Math.max(h.updatedAt, h.createdAt) >= since,
  );
  const myId = accountId ? houseIdFor(accountId) : null;
  const all = pool.map((h, i) => ({ rank: i + 1, name: h.name, sub: `${lotLabel(h.ch, h.lot)} · ${h.ownerName}`, value: h.score, me: h.id === myId }));
  const mineAt = all.findIndex((r) => r.me);
  return { rows: all.slice(0, size), mine: mineAt >= size ? all[mineAt] : null };
}
