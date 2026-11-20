import { createHmac } from "node:crypto";
import { bumpQuest, questHook, todoTickOf } from "../retainQuest";
import type { TodoTick } from "../retain";
import { isOpenLot, WORLD_LOTS } from "@tomb/protocol";
import { nanoid } from "nanoid";
import { env } from "../env";
import { weekStartMs } from "../gameDay";
import { HttpError } from "../http";
import { kstDay, kstWeek } from "../store/accounts";
import type { Me } from "../types";
import {
  AWAY_MSG,
  cottageStyleOf,
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  defaultExterior,
  furnitureById,
  houseLabel,
  isHousingChannel,
  LEGACY_HOUSING_CHANNEL,
  lotLabel,
  MAX_OWN_PER_ITEM,
  nextTier,
  PLOT_TIERS,
  plotCost,
  SEA_FLOOR,
  SEA_LOT_COUNT,
  SEA_STARTER,
  SEA_WALL,
  seaPlotCost,
  seaUpgradeCost,
  sellPrice,
  tierById,
  villageLots,
  type CottageStyleId,
  type HouseZone,
  type PlotTierId,
} from "./catalog";
import { designCounts, designScore, layoutCounts, validateExterior, validateLayout } from "./layout";
import { waterWait, watered, type PlantsResponse } from "./plants";
import { liveStates, stateTarget, type HouseStatesResponse } from "./states";
import { myBrief, refundAndThrow, rewardLike, spend, refund } from "./points";
import { discountedPrice } from "../titles";
import { isHouseOwnItem, MemoryHouseStore, type HousePair, type HouseRecord, type HouseStore } from "./store";
import { RedisHouseStore } from "./store-redis";
import type { GuestEntryView, HouseExterior, HouseLikeResponse, HouseLayout, HouseSummary, MyHouseResponse, PublicHouse, VillageResponse } from "./types";

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

/**
 * 공개 집 id: 계정 id의 HMAC 앞 12자 (계정 id = 쿠키 신원이라 그대로 내보내지 않는다).
 * 11/16 포구 오두막은 다른 HMAC (한 계정이 마을 집 하나 + 오두막 하나를 따로 가진다)
 */
export function houseIdFor(accountId: string, zone: HouseZone = "village"): string {
  return createHmac("sha256", env.sessionSecret())
    .update(zone === "sea" ? `seahouse:${accountId}` : `house:${accountId}`)
    .digest("base64url")
    .slice(0, 12);
}

/** 11/16 한 계정의 두 집 id (공용 가구 가방은 마을 집 id에 붙는다) */
export const housePair = (accountId: string): HousePair => ({ village: houseIdFor(accountId), sea: houseIdFor(accountId, "sea") });

const HOUSE_ID_RE = /^[A-Za-z0-9_-]{12}$/;
export const isHouseId = (id: string) => HOUSE_ID_RE.test(id);

export const houseNotFound = () => new HttpError(404, "NOT_FOUND", "그 집을 찾을 수 없어요.");
const noHouse = (zone: HouseZone = "village") =>
  zone === "sea"
    ? new HttpError(409, "NO_HOUSE", "먼저 포구 부동산에서 오두막을 분양받아 주세요.")
    : new HttpError(409, "NO_HOUSE", "먼저 분양 사무소에서 내 집을 분양받아 주세요.");

// 11/15: 집주인 이름은 운영자 집도 저장된 닉네임 그대로 (예전처럼 "대장"으로 바꾸지 않는다)
export function toPublicHouse(r: HouseRecord): PublicHouse {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, hidden, items, paid, ...pub } = r;
  return pub;
}

export function toSummary(r: HouseRecord): HouseSummary {
  return {
    id: r.id,
    ch: r.ch,
    lot: r.lot,
    ...(r.zone === "sea" ? { zone: "sea" as const, style: r.style } : {}),
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

export async function myHouse(store: HouseStore, accountId: string, me?: Me, zone: HouseZone = "village"): Promise<MyHouseResponse> {
  const id = houseIdFor(accountId, zone);
  // 잔액만 쓰므로 계정 전체를 읽지 않는다 (myBrief = HMGET 1개)
  const [h0, bag, m] = await Promise.all([store.get(id), store.inventory(housePair(accountId), zone), me ?? myBrief(accountId)]);
  // 마을이 생기기 전에 분양받은 집은 처음 열 때 번지를 받는다
  const h = h0 && !h0.lot && (await store.assignLot(id)) ? await store.get(id) : h0;
  // 11/18 마을 집을 아직 안 샀으면 분양가에 더해질 별장 값 차이 (오두막이 먼저 있을 때만)
  const fee = !h && zone === "village" ? await villaFeeFor(store, accountId) : 0;
  return { house: h ? toPublicHouse(h) : null, inventory: bag.have, away: bag.away, points: m.points, ...(fee > 0 ? { villaFee: fee } : {}) };
}

/**
 * 11/18 보안: 포구 오두막을 먼저 사고 마을 집을 사면 오두막이 별장 값(2배)을 피한다. 그래서 마을 집을 살 때 그 차이를 더한다
 * (오두막 터 크기의 별장 값 − 오두막에 낸 값. 낸 값 기록이 없으면 오두막 값으로 본다)
 */
async function villaFeeFor(store: HouseStore, accountId: string): Promise<number> {
  const cottage = await store.get(houseIdFor(accountId, "sea"));
  if (!cottage) return 0;
  return Math.max(0, seaPlotCost(cottage.tier, true) - (cottage.paid ?? seaPlotCost(cottage.tier, false)));
}

const mustHave = async (store: HouseStore, accountId: string, zone: HouseZone = "village"): Promise<HouseRecord> => {
  const h = await store.get(houseIdFor(accountId, zone));
  if (!h) throw noHouse(zone);
  return h;
};

const lotTaken = () => new HttpError(409, "LOT_TAKEN", "그 번지는 방금 다른 분이 분양받았어요. 다른 번지를 골라 주세요.");

/**
 * 채널마다 주거 구역이 따로다. 내 집을 다루는 요청(외관·배치·넓히기)은 지금 있는 채널(ch)을 함께 보내고,
 * 내 집이 다른 채널에 있으면 거절한다 (다른 채널의 필지를 건드리지 못하게). ch가 없으면(서버 안 호출) 검사하지 않는다
 */
export function assertChannel(h: Pick<HouseRecord, "ch" | "lot" | "zone">, ch: number | undefined): void {
  if (ch === undefined || ch === h.ch) return;
  throw new HttpError(409, "WRONG_CHANNEL", `내 집은 ${houseLabel(h)}에 있어요. ${h.ch}채널로 옮긴 뒤 다시 해 주세요.`);
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
  // 바로 사기 값 = 작은 터 + 넓히기 값 누적 (업그레이드로 올린 것과 같은 값) + 11/18 오두막이 먼저 있으면 별장 값 차이
  const [had, fee] = await Promise.all([store.get(id), villaFeeFor(store, accountId)]);
  const cost = plotCost(tier.id) + fee;
  if (had) throw new HttpError(409, "ALREADY_OWNED", `이미 ${lotLabel(had.ch, had.lot)}에 내 집이 있어요. 마을 집은 한 채만 가질 수 있어요.`);
  // 11/19 2단지를 닫아 새 분양은 메인 맵 번지(1..WORLD_LOTS)만
  if (lot !== null && (!Number.isInteger(lot) || lot < 1 || lot > WORLD_LOTS))
    throw new HttpError(400, "INVALID_INPUT", `번지는 1~${WORLD_LOTS} 중에서 골라 주세요.`);
  // 11/15 비운 번지 (CLOSED_LOTS — 지금은 없다)
  if (lot !== null && !isOpenLot(lot)) throw new HttpError(400, "INVALID_INPUT", "그 번지는 이제 분양하지 않아요. 다른 번지를 골라 주세요.");
  if (lot !== null && (await store.village(ch)).some((h) => h.lot === lot)) throw lotTaken();
  await spend(accountId, cost, tier.id === PLOT_TIERS[0].id ? "plot" : `plot:${tier.id}`);
  // 낸 포인트를 집에 남긴다 (오래 비워 정리할 때 그대로 돌려준다, reclaim.ts)
  const r = await store.create({ id, owner: accountId, name, intro, ownerName, tier: tier.id, ch, lot, now: Date.now(), paid: cost });
  if (r === "exists") await refundAndThrow(accountId, cost, new HttpError(409, "ALREADY_OWNED", "이미 내 집이 있어요."));
  if (r === "lot_taken") await refundAndThrow(accountId, cost, lotTaken());
  if (r === "full") await refundAndThrow(accountId, cost, new HttpError(409, "VILLAGE_FULL", "주거 구역이 다 찼어요. 빈 집터가 나면 다시 와 주세요."));
  return myHouse(store, accountId);
}

/** 11/16 오두막 시작 배치 (작은 방 10×8 기준. 넓은 터·대저택도 왼쪽 방에 같은 자리) */
export function seaStarterLayout(): HouseLayout {
  return {
    floor: SEA_FLOOR,
    wall: SEA_WALL,
    items: [
      { u: "s1", i: "sea_hammock", x: 1, y: 0, r: 4 },
      { u: "s2", i: "surfboard", x: 5, y: 0, r: 4 },
      { u: "s3", i: "life_ring", x: 7, y: 0, r: 4 },
      { u: "s4", i: "shell_decor", x: 8, y: 3, r: 4 },
      { u: "s5", i: "rattan_chair", x: 2, y: 3, r: 4 },
    ],
  };
}

/**
 * 11/16 포구 오두막 분양: 채널마다 11터 (11/19 6 → 11) (마을 번지와 따로). 값 = 같은 크기 마을 집 값 × 1.5, 마을 집이 이미 있으면 별장이라 × 2.
 * 한 계정에 마을 집 하나 + 오두막 하나까지 (오두막 집 id가 따로라 둘째 오두막은 "exists"로 막힌다)
 */
export async function buyCottage(
  store: HouseStore,
  accountId: string,
  name: string,
  intro: string,
  ownerName: string,
  lot: number | null,
  ch: number,
  tierId: PlotTierId = PLOT_TIERS[0].id,
  style: CottageStyleId = "wood",
): Promise<MyHouseResponse> {
  const id = houseIdFor(accountId, "sea");
  if (!isHousingChannel(ch)) throw badChannel();
  const tier = tierById(tierId);
  if (!tier) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 터 크기예요.");
  if (lot !== null && (!Number.isInteger(lot) || lot < 1 || lot > SEA_LOT_COUNT))
    throw new HttpError(400, "INVALID_INPUT", `오두막 터는 1~${SEA_LOT_COUNT}번 중에서 골라 주세요.`);
  const [had, village] = await Promise.all([store.get(id), store.get(houseIdFor(accountId))]);
  if (had) throw new HttpError(409, "ALREADY_OWNED", `이미 오두막이 있어요 (${houseLabel(had)}). 오두막은 한 채만 가질 수 있어요.`);
  const villa = !!village;
  const cost = seaPlotCost(tier.id, villa);
  if (lot !== null && (await store.village(ch, "sea")).some((h) => h.lot === lot)) throw lotTaken();
  // 시작 가구는 한 집 id에 한 번만 준다 (철거 뒤 다시 사면 오두막 몫 가방에 남은 것만 그 자리에 놓는다 — 공용 가방은 건드리지 않는다)
  const given = await store.hasStarter(id);
  const owned = given ? await store.ownItems(id) : null;
  const layout = starterFor(seaStarterLayout(), owned);
  const ext = defaultExterior();
  await spend(accountId, cost, villa ? `villa:${tier.id}` : `cottage:${tier.id}`);
  const r = await store.create({
    id,
    owner: accountId,
    name,
    intro,
    ownerName,
    tier: tier.id,
    ch,
    lot,
    now: Date.now(),
    paid: cost,
    zone: "sea",
    style: cottageStyleOf(style),
    layout,
    placed: designCounts(layout, ext),
    placedScore: designScore(layout, ext),
    starter: SEA_STARTER,
  });
  if (r === "exists") await refundAndThrow(accountId, cost, new HttpError(409, "ALREADY_OWNED", "이미 오두막이 있어요."));
  if (r === "lot_taken") await refundAndThrow(accountId, cost, lotTaken());
  if (r === "full") await refundAndThrow(accountId, cost, new HttpError(409, "VILLAGE_FULL", "이 채널 포구에는 빈 오두막 터가 없어요."));
  return myHouse(store, accountId, undefined, "sea");
}

/** 가진 것만 남긴 시작 배치 (owned = null이면 시작 가구를 지금 주므로 그대로) */
function starterFor(layout: HouseLayout, owned: Record<string, number> | null): HouseLayout {
  if (!owned) return layout;
  const left = { ...owned };
  const items = layout.items.filter((p) => {
    if ((left[p.i] ?? 0) < 1) return false;
    left[p.i] -= 1;
    return true;
  });
  return {
    items,
    floor: (owned[layout.floor] ?? 0) > 0 ? layout.floor : DEFAULT_FLOOR,
    wall: (owned[layout.wall] ?? 0) > 0 ? layout.wall : DEFAULT_WALL,
  };
}

/** 오두막 겉모습 바꾸기 (무료) */
export async function setCottageStyle(store: HouseStore, accountId: string, style: CottageStyleId): Promise<MyHouseResponse> {
  if (!(await store.setStyle(houseIdFor(accountId, "sea"), style, Date.now()))) throw noHouse("sea");
  return myHouse(store, accountId, undefined, "sea");
}

// 옛 집 번지 보충(전체 목록 읽기 = 집 수만큼 명령)을 이미 해 본 저장소. 인스턴스마다 처음 한 번만 한다
//  (지금 분양은 늘 번지를 받고, 번지 없는 옛 집도 주인이 내 집을 열면 myHouse가 번지를 준다 → 매 요청 훑을 필요가 없다)
const legacyFilled = new WeakSet<HouseStore>();

/** 시험용: 옛 집 번지 보충을 다시 하게 한다 */
export function resetLegacyLotFill(store: HouseStore) {
  legacyFilled.delete(store);
}

/** 한 채널의 분양 마을: 그 채널에 번지가 있는 집들의 외관·문패 (숨긴 집은 자리만) */
export async function village(store: HouseStore, ch: number = LEGACY_HOUSING_CHANNEL, now = Date.now(), zone: HouseZone = "village"): Promise<VillageResponse> {
  if (!isHousingChannel(ch)) throw badChannel();
  if (zone === "sea") {
    const sea = await store.village(ch, "sea");
    return {
      ch,
      zone: "sea",
      lots: SEA_LOT_COUNT,
      houses: sea.filter((h) => !h.hidden).map((h) => ({ ...toSummary(h), exterior: h.exterior })),
      taken: sea.filter((h) => h.hidden).map((h) => h.lot),
      generatedAt: now,
    };
  }
  let all = await store.village(ch);
  // 마을이 생기기 전에 분양받은 집(번지·채널 없음 → 1채널)은 1채널 마을을 열 때 빈 번지를 받는다 (인스턴스마다 처음 한 번만 훑는다)
  if (ch === LEGACY_HOUSING_CHANNEL && !legacyFilled.has(store)) {
    legacyFilled.add(store);
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

export async function editProfile(store: HouseStore, accountId: string, name: string, intro: string, zone: HouseZone = "village"): Promise<MyHouseResponse> {
  if (!(await store.setProfile(houseIdFor(accountId, zone), name, intro, Date.now()))) throw noHouse(zone);
  return myHouse(store, accountId, undefined, zone);
}

/** 넓히기 값: 오두막은 배수를 곱한다 (마을 집이 지금 있으면 별장 배수) */
async function upgradePrice(store: HouseStore, accountId: string, zone: HouseZone, base: number): Promise<number> {
  if (zone !== "sea") return base;
  return seaUpgradeCost(base, !!(await store.get(houseIdFor(accountId))));
}

export async function upgradePlot(store: HouseStore, accountId: string, to: PlotTierId, ch?: number, zone: HouseZone = "village"): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId, zone);
  assertChannel(h, ch);
  const next = nextTier(h.tier);
  if (!next || next.id !== to) throw new HttpError(409, "BAD_TIER", "지금 터에서 바로 올릴 수 있는 크기가 아니에요.");
  const price = await upgradePrice(store, accountId, zone, next.price);
  await spend(accountId, price, `upgrade:${to}`);
  if (!(await store.upgrade(h.id, h.tier, to, Date.now(), price)))
    await refundAndThrow(accountId, price, new HttpError(409, "CONFLICT", "터 크기가 이미 바뀌었어요. 다시 확인해 주세요."));
  return myHouse(store, accountId, undefined, zone);
}

/** 11/16 discount = 단 칭호의 가구 할인율 (집 갈래 — 라우트가 lib/titlesServer wornPerk로 넘긴다. 순환 import를 피해 여기서 읽지 않는다) */
/** 11/17 ghostSale = 유령선 장터에서 사요 (유령선 한정 가구는 이때만 — lib/sea/ghostService) */
/** 11/19 시즌 가구(seasonWeek)도 한정 판매라 가구점에서는 막고, 한정 장터(ghostSale = true — 유령선 장터·가구 보따리상 lib/seasonShop)에서만 산다 */
/** 11/19 멍냥 분양소 품종 펫 가구(petShop)도 같은 한정 판매 인자로만 산다 */
export async function buyFurniture(store: HouseStore, accountId: string, itemId: string, discount = 0, zone: HouseZone = "village", ghostSale = false): Promise<MyHouseResponse> {
  return (await buyFurnitureMe(store, accountId, itemId, discount, zone, ghostSale)).house;
}

/**
 * 11/20 buyFurniture와 같은데 결제하며 읽은 내 정보(me — spendPoints가 산 뒤 다시 읽은 것)도 돌려준다.
 * NPC 가구 판매(보따리상·보리·문대리)가 응답에 me를 실으려 계정을 또 읽지 않게 (Redis 명령 줄이기)
 */
export async function buyFurnitureMe(
  store: HouseStore,
  accountId: string,
  itemId: string,
  discount = 0,
  zone: HouseZone = "village",
  ghostSale = false,
): Promise<{ house: MyHouseResponse; me: Me }> {
  const def = furnitureById(itemId);
  if (!def) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 물건이에요.");
  if (def.ghost && !ghostSale) throw new HttpError(400, "INVALID_INPUT", "유령선 한정은 토요일 밤 유령선 장터에서만 팔아요.");
  if (def.seasonWeek && !ghostSale) throw new HttpError(400, "INVALID_INPUT", "시즌 가구는 가구 보따리상에서만 팔아요.");
  // 11/19 멍냥 분양소 품종 펫 가구도 한정 판매 (분양소가 ghostSale = true로 부른다)
  if (def.petShop && !ghostSale) throw new HttpError(400, "INVALID_INPUT", "품종 펫 가구는 동물원 정문 옆 분양사 보리에게서 사요.");
  // 11/20 기존 강아지·고양이 가구 셋도 분양사 보리만 판다 (가구점과 겹치지 않게)
  if (def.boriOnly && !ghostSale) throw new HttpError(400, "INVALID_INPUT", "강아지·고양이 가구는 동물원 정문 옆 분양사 보리에게서 사요.");
  // 11/20 사무실 가구 15종은 야근 빌딩 옆 총무팀 문대리만 판다 (lib/office가 ghostSale = true로 부른다)
  if (def.officeShop && !ghostSale) throw new HttpError(400, "INVALID_INPUT", "사무실 가구는 야근 빌딩 옆 총무팀 문대리에게서 사요.");
  await mustHave(store, accountId, zone);
  // 가구는 두 집 공용 가방 (다른 집에 놓인 것까지), 바닥·벽지·외관은 이 집 것만 센다
  const bag = await store.inventory(housePair(accountId), zone);
  const owned = (bag.have[itemId] ?? 0) + (isHouseOwnItem(itemId) ? 0 : (bag.away[itemId] ?? 0));
  if (owned >= MAX_OWN_PER_ITEM) throw new HttpError(409, "MAX_OWNED", `${def.name}, 이미 ${MAX_OWN_PER_ITEM}개를 다 가졌어요.`);
  // 11/16 집 갈래 칭호의 가구 할인 (lib/titles — 원가 × (1 − 할인율), 1P 단위 내림. 되팔기 값은 원가 기준 그대로라 할인가보다 늘 싸다)
  const price = discountedPrice(def.price, discount);
  const me = await spend(accountId, price, `furniture:${itemId}`);
  const r = await store.addItem(housePair(accountId), zone, itemId, MAX_OWN_PER_ITEM);
  if (r !== "ok")
    await refundAndThrow(
      accountId,
      price,
      r === "max" ? new HttpError(409, "MAX_OWNED", `${def.name}, 이미 ${MAX_OWN_PER_ITEM}개를 다 가졌어요.`) : noHouse(zone),
    );
  return { house: await myHouse(store, accountId, me, zone), me };
}

export async function sellFurniture(store: HouseStore, accountId: string, itemId: string, zone: HouseZone = "village"): Promise<MyHouseResponse & { refunded: number }> {
  const def = furnitureById(itemId);
  if (!def) throw new HttpError(400, "INVALID_INPUT", "알 수 없는 물건이에요.");
  await mustHave(store, accountId, zone);
  const r = await store.takeItem(housePair(accountId), zone, itemId);
  if (r === "none") throw new HttpError(409, "NO_ITEM", "그 물건을 가지고 있지 않아요.");
  if (r === "placed") throw new HttpError(409, "PLACED", "모두 놓여 있어요. 먼저 집에서 치운 뒤 저장해 주세요.");
  if (r === "away") throw new HttpError(409, "PLACED", AWAY_MSG);
  const refunded = sellPrice(def);
  const me = await refund(accountId, refunded);
  return { ...(await myHouse(store, accountId, me, zone)), refunded };
}

/** 가진 개수가 모자란 까닭이 다른 집에 놓인 공용 가구면 그 안내로 */
function awayHint(v: { code: string; message: string }, layout: HouseLayout, bag: { have: Record<string, number>; away: Record<string, number> }): string {
  if (v.code !== "NOT_OWNED") return v.message;
  const short = Object.entries(layoutCounts(layout)).find(([it, n]) => (bag.have[it] ?? 0) < n);
  return short && (bag.away[short[0]] ?? 0) > 0 ? `${furnitureById(short[0])?.name ?? short[0]}, ${AWAY_MSG}` : v.message;
}

/** 11/18 배치·외관을 거의 동시에 저장했을 때 (두 번째 저장은 다시 열어서) */
const DESIGN_CONFLICT_MSG = "방금 다른 곳에서 집이 바뀌었어요. 다시 열어 저장해 주세요.";

export async function saveLayout(store: HouseStore, accountId: string, tier: PlotTierId, layout: HouseLayout, ch?: number, zone: HouseZone = "village"): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId, zone);
  assertChannel(h, ch);
  if (h.tier !== tier) throw new HttpError(409, "CONFLICT", "터 크기가 바뀌었어요. 다시 열어 주세요.");
  const pair = housePair(accountId);
  const bag = await store.inventory(pair, zone);
  const v = validateLayout(layout, tier, bag.have);
  if (!v.ok) throw new HttpError(400, v.code, awayHint(v, layout, bag));
  // 놓은 개수·점수는 안(배치) + 밖(지금 외관)을 함께 센다 (외관에 쓴 아이템을 되팔지 못하게)
  // 11/18 읽은 뒤 외관 저장이 먼저 됐으면 놓은 개수가 틀리므로 저장하지 않는다 (h.updatedAt — 다시 열면 된다)
  const r = await store.saveDesign(pair, zone, tier, layout, null, designCounts(layout, h.exterior), designScore(layout, h.exterior), Date.now(), h.updatedAt);
  if (r === "no_house") throw noHouse(zone);
  if (r === "tier") throw new HttpError(409, "CONFLICT", "터 크기가 바뀌었어요. 다시 열어 주세요.");
  if (r === "conflict") throw new HttpError(409, "CONFLICT", DESIGN_CONFLICT_MSG);
  // 다른 집 저장과 겹쳐 공용 가구가 모자라게 된 경우도 여기로 (두 집 합쳐 가진 것보다 많이 놓이지 않는다)
  if (r === "not_owned") throw new HttpError(409, "NOT_OWNED", "가진 것보다 많이 놓았어요. 다른 집에 놓인 건 거기서 치워야 여기 놓을 수 있어요.");
  return myHouse(store, accountId, undefined, zone);
}

export async function saveExterior(store: HouseStore, accountId: string, exterior: Record<string, unknown>, ch?: number): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId);
  assertChannel(h, ch);
  const pair = housePair(accountId);
  const v = validateExterior(exterior, (await store.inventory(pair, "village")).have);
  if (!v.ok) throw new HttpError(400, v.code, v.message);
  const ext: HouseExterior = v.exterior;
  const r = await store.saveDesign(pair, "village", h.tier, null, ext, designCounts(h.layout, ext), designScore(h.layout, ext), Date.now(), h.updatedAt);
  if (r === "no_house") throw noHouse();
  if (r === "tier") throw new HttpError(409, "CONFLICT", "터 크기가 바뀌었어요. 다시 열어 주세요.");
  if (r === "conflict") throw new HttpError(409, "CONFLICT", DESIGN_CONFLICT_MSG);
  if (r === "not_owned") throw new HttpError(409, "NOT_OWNED", "가진 것보다 많이 썼어요. 가방을 다시 확인해 주세요.");
  return myHouse(store, accountId);
}

export async function likeHouse(
  store: HouseStore,
  houseId: string,
  visitorId: string,
  ip: string,
  now = Date.now(),
): Promise<HouseLikeResponse> {
  const h = await findVisibleHouse(store, houseId);
  if (h.owner === visitorId) throw new HttpError(409, "OWN_HOUSE", "내 집에는 좋아요를 누를 수 없어요.");
  // 11/18 오늘의 할 일 「이웃 집에 좋아요」면 같은 스크립트에서 누른 사람의 진행도 (lib/retainQuest)
  const day = kstDay(now);
  const quest = questHook(visitorId, day, "like");
  const r = await store.like(h.id, visitorId, day, quest);
  if (r === null) throw houseNotFound();
  if (r === "already") throw new HttpError(409, "ALREADY_LIKED", "오늘은 이미 좋아요를 눌렀어요. 내일 또 들러 주세요.");
  const earnedOwner = await rewardLike(h.owner, ip).catch(() => 0);
  return { ...r, earnedOwner, ...todoTickOf(quest, day) };
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
): Promise<{ todo?: TodoTick }> {
  const h = await findVisibleHouse(store, houseId);
  const day = kstDay(now);
  const r = await store.addGuest(h.id, { id: nanoid(10), name, text, at: now, author: visitorId }, day);
  if (r === "no_house") throw houseNotFound();
  if (r === "limit") throw new HttpError(429, "RATE_LIMITED", "방명록은 하루에 10번까지 남길 수 있어요.");
  // 11/19 오늘 미션 「이웃 집 방명록 남기기」 (내 집은 세지 않는다 — 그날 미션일 때만 진행 칸 +1, lib/retainQuest)
  const quest = h.owner !== visitorId ? questHook(visitorId, day, "guestbook") : null;
  await bumpQuest(quest).catch((e) => console.error("[housing] 미션 진행 실패", e));
  return todoTickOf(quest, day);
}

export async function guestView(store: HouseStore, houseId: string, visitorId: string | null): Promise<GuestEntryView[]> {
  const rows = await store.guestbook(houseId, false);
  return rows.map((g) => ({ id: g.id, name: g.name, text: g.text, at: g.at, mine: !!visitorId && g.author === visitorId }));
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

/** 이번 주(월요일 새벽 5시, lib/gameDay) 시작 시각 (epoch ms) */
export function kstWeekStart(now = Date.now()): number {
  return weekStartMs(kstWeek(now));
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
  // 11/16 포구 오두막도 같은 순위에 (번지 자리에 「포구 N번 오두막」). 운영자·내 집은 두 채 모두
  const staffHouses = staffId ? new Set([houseIdFor(staffId), houseIdFor(staffId, "sea")]) : null;
  const pool = (await store.list("score", HOUSE_RANK_POOL)).filter(
    (h) => !h.hidden && !staffHouses?.has(h.id) && Math.max(h.updatedAt, h.createdAt) >= since,
  );
  const mine = accountId ? new Set([houseIdFor(accountId), houseIdFor(accountId, "sea")]) : null;
  const all = pool.map((h, i) => ({ rank: i + 1, name: h.name, sub: `${houseLabel(h)} · ${h.ownerName}`, value: h.score, me: !!mine?.has(h.id) }));
  const mineAt = all.findIndex((r) => r.me);
  return { rows: all.slice(0, size), mine: mineAt >= size ? all[mineAt] : null };
}
