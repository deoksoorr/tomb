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
  SKIN_AWAY_MSG,
  CAMP_FLOOR,
  CAMP_LOT_COUNT,
  CAMP_STARTER,
  CAMP_WALL,
  campBuyCost,
  campLotByNo,
  campLotShort,
  campYardCost,
  HOUSE_ZONES,
  houseShape,
  villagePlotCost,
  villageUpgradeCost,
  type CampHomeKind,
  type CampInfo,
  type CampYard,
  cottageStyleOf,
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  defaultExterior,
  furnitureById,
  houseLabel,
  isHousingChannel,
  LEGACY_HOUSING_CHANNEL,
  MAX_OWN_PER_ITEM,
  nextTier,
  PLOT_TIERS,
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
import { campFixturesForYard, designCounts, designScore, layoutCounts, validateExterior, validateLayout } from "./layout";
import { waterWait, watered, type PlantsResponse } from "./plants";
import { liveStates, stateTarget, type HouseStatesResponse } from "./states";
import { myBrief, refundAndThrow, rewardLike, spend, refund } from "./points";
import { discountedPrice } from "../titles";
import { CAMP_LOTS, caravanDesignOf, type CaravanDesign } from "@tomb/protocol";
import { isHouseOwnItem, MemoryHouseStore, type HouseBrief, type HousePair, type HouseRecord, type HouseStore } from "./store";
import { RedisHouseStore } from "./store-redis";
import type { GuestEntryView, HouseExterior, HouseLikeResponse, HouseLayout, HousePrices, HouseSummary, MyHouseResponse, PublicHouse, VillageResponse } from "./types";

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
 * 11/16 포구 오두막은 다른 HMAC (한 계정이 마을 집 하나 + 오두막 하나를 따로 가진다). 11/26 캠핑장 집도 또 다른 HMAC (종류 상관없이 한 사람 한 채)
 */
export function houseIdFor(accountId: string, zone: HouseZone = "village"): string {
  return createHmac("sha256", env.sessionSecret())
    .update(zone === "sea" ? `seahouse:${accountId}` : zone === "camp" ? `camphouse:${accountId}` : `house:${accountId}`)
    .digest("base64url")
    .slice(0, 12);
}

/** 11/16 한 계정의 집 id들 (공용 가구 가방은 마을 집 id에 붙는다). 11/26 캠핑장 집까지 세 채 */
export const housePair = (accountId: string): HousePair => ({ village: houseIdFor(accountId), sea: houseIdFor(accountId, "sea"), camp: houseIdFor(accountId, "camp") });
/** 11/26 한 계정의 집 id 셋 (마을·포구·캠핑장 순서) */
export const houseIdsOf = (accountId: string): string[] => HOUSE_ZONES.map((z) => houseIdFor(accountId, z));

const HOUSE_ID_RE = /^[A-Za-z0-9_-]{12}$/;
export const isHouseId = (id: string) => HOUSE_ID_RE.test(id);

export const houseNotFound = () => new HttpError(404, "NOT_FOUND", "그 집을 찾을 수 없어요.");
const noHouse = (zone: HouseZone = "village") =>
  zone === "sea"
    ? new HttpError(409, "NO_HOUSE", "먼저 포구 부동산에서 오두막을 분양받아 주세요.")
    : zone === "camp"
      ? new HttpError(409, "NO_HOUSE", "먼저 언젠가 캠핑장에서 집을 분양받아 주세요.")
      : new HttpError(409, "NO_HOUSE", "먼저 분양 사무소에서 내 집을 분양받아 주세요.");

// 11/15: 집주인 이름은 운영자 집도 저장된 닉네임 그대로 (예전처럼 "대장"으로 바꾸지 않는다)
export function toPublicHouse(r: HouseRecord): PublicHouse {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, hidden, items, paid, villa, ...pub } = r;
  return { ...pub, ...(r.camp ? { camp: campOut(r.lot, r.camp) } : {}), ...(villa ? { villa: true as const } : {}) };
}

/** 11/26 내보내는 캠핑장 정보: 카라반은 디자인을 늘 채운다 (디자인 칸이 없는 옛 카라반 = 그 자리 기본 모습 — 지금 그림 그대로) */
function campOut(lot: number, c: CampInfo): CampInfo {
  if (c.kind !== "caravan") return { kind: c.kind, yard: c.yard };
  return { kind: c.kind, yard: c.yard, design: caravanDesignOf(lot, c.design) };
}

export function toSummary(r: HouseRecord): HouseSummary {
  return {
    id: r.id,
    ch: r.ch,
    lot: r.lot,
    ...(r.zone === "sea" ? { zone: "sea" as const, style: r.style } : {}),
    ...(r.zone === "camp" && r.camp ? { zone: "camp" as const, camp: campOut(r.lot, r.camp) } : {}),
    ...(r.villa ? { villa: true as const } : {}),
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
  // 잔액만 쓰므로 계정 전체를 읽지 않는다 (myBrief = HMGET 1개). 11/26 값표용 세 집 요약 (HMGET 셋 — 파이프라인 하나)
  const [h0, bag, m, briefs] = await Promise.all([store.get(id), store.inventory(housePair(accountId), zone), me ?? myBrief(accountId), houseBriefs(store, accountId)]);
  // 마을이 생기기 전에 분양받은 집은 처음 열 때 번지를 받는다
  const h1 = h0 && !h0.lot && (await store.assignLot(id)) ? await store.get(id) : h0;
  // 방금 남긴 별장 표시 (옛 기록 — houseBriefs가 정해 남겼다)
  const h = h1 && h1.villa === undefined && briefs[zone] ? { ...h1, villa: briefs[zone]!.villa } : h1;
  return { house: h ? toPublicHouse(h) : null, inventory: bag.have, away: bag.away, points: m.points, prices: housePrices(briefs, zone) };
}

/** 11/26 한 계정의 세 집 요약 (구역 → 없으면 null). 별장 표시가 없는 옛 기록은 여기서 한 번 정해 남긴다 */
export type HouseBriefs = Record<HouseZone, HouseBrief | null>;

/**
 * 11/26 세 집 요약을 읽고 옛 기록의 별장 표시를 한 번 남긴다 (이후 안 바뀐다).
 * 옛 규칙(11/16~11/25)에서 마을 집은 늘 첫 집 값이었고, 포구 오두막은 마을 집이 있으면 별장 값이었다 (순서 무관 — 11/18 차액 제도).
 * 그래서 옛 마을 집 = 첫 집, 옛 오두막 = 지금 마을 집이 있으면 별장 (지금 값과 같다). 캠핑장 집은 처음부터 표시가 있다
 */
export async function houseBriefs(store: HouseStore, accountId: string): Promise<HouseBriefs> {
  const list = await store.brief(houseIdsOf(accountId));
  const by = Object.fromEntries(HOUSE_ZONES.map((z, i) => [z, list[i] ?? null])) as HouseBriefs;
  for (const z of HOUSE_ZONES) {
    const b = by[z];
    if (!b || b.villa !== undefined) continue;
    const want = z === "sea" ? !!by.village : z === "camp" ? !!(by.village || by.sea) : false;
    by[z] = { ...b, villa: (await store.settleVilla(b.id, want)) ?? want };
  }
  return by;
}

/** 그 구역 집이 별장인지: 가진 집이면 그 집 표시, 아직 없으면 지금 사면 별장인지 (다른 구역에 집이 있으면) */
const villaFor = (briefs: HouseBriefs, zone: HouseZone): boolean =>
  briefs[zone] ? !!briefs[zone]!.villa : HOUSE_ZONES.some((z) => z !== zone && !!briefs[z]);

/** 11/26 이 사람 기준 값표 (화면은 이 값을 그대로 보여 준다 — 서버가 받는 값과 같다) */
export function housePrices(briefs: HouseBriefs, zone: HouseZone): HousePrices {
  const v = { village: villaFor(briefs, "village"), sea: villaFor(briefs, "sea"), camp: villaFor(briefs, "camp") };
  const tiers = (cost: (t: PlotTierId) => number) => Object.fromEntries(PLOT_TIERS.map((t) => [t.id, cost(t.id)])) as Record<PlotTierId, number>;
  const mine = briefs[zone];
  return {
    villa: v,
    village: tiers((t) => villagePlotCost(t, v.village)),
    sea: tiers((t) => seaPlotCost(t, v.sea)),
    camp: CAMP_LOTS.map((l) => ({
      lot: l.lot,
      kind: l.kind,
      ...(l.grade ? { grade: l.grade } : {}),
      buy: campBuyCost(l.lot, v.camp),
      yard2: campYardCost(l.lot, 2, v.camp),
      yard3: campYardCost(l.lot, 3, v.camp),
    })),
    upgrade: mine ? upgradeQuote(mine, !!mine.villa) : null,
    yard: mine?.zone === "camp" && mine.camp && mine.camp.yard < 3 ? { to: (mine.camp.yard + 1) as CampYard, price: campYardCost(mine.lot, (mine.camp.yard + 1) as 2 | 3, !!mine.villa) } : null,
  };
}

/** 이 집의 다음 넓히기 (없으면 null): 마을 = 다음 터 크기, 포구 = × 1.5(별장 2). 11/26 캠핑장은 넓히기가 없다 (앞마당 단계로 방이 커진다) */
function upgradeQuote(h: Pick<HouseBrief, "zone" | "tier" | "camp">, villa: boolean): { to: PlotTierId; price: number } | null {
  if (h.zone === "camp") return null;
  const next = nextTier(h.tier);
  if (!next) return null;
  return { to: next.id, price: h.zone === "sea" ? seaUpgradeCost(next.price, villa) : villageUpgradeCost(next.price, villa) };
}

/** 11/26 첫 집 값으로 사려는데 그 사이 다른 집이 생겼다 (동시에 두 집을 산 경우) */
const villaChanged = () => new HttpError(409, "VILLA_CHANGED", "그 사이 다른 집이 생겨서 다주택자 가격이 됐어요. 값을 다시 확인해 주세요.");

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
  // 바로 사기 값 = 작은 터 + 넓히기 값 누적 (업그레이드로 올린 것과 같은 값). 11/26 다른 구역에 집이 있으면 별장 (× 4/3)
  const briefs = await houseBriefs(store, accountId);
  const had = briefs.village;
  if (had) throw new HttpError(409, "ALREADY_OWNED", `이미 ${houseLabel(had)}에 내 집이 있어요. 마을 집은 한 채만 가질 수 있어요.`);
  const villa = villaFor(briefs, "village");
  const cost = villagePlotCost(tier.id, villa);
  // 11/19 2단지를 닫아 새 분양은 메인 맵 번지(1..WORLD_LOTS)만
  if (lot !== null && (!Number.isInteger(lot) || lot < 1 || lot > WORLD_LOTS))
    throw new HttpError(400, "INVALID_INPUT", `번지는 1~${WORLD_LOTS} 중에서 골라 주세요.`);
  // 11/15 비운 번지 (CLOSED_LOTS — 지금은 없다)
  if (lot !== null && !isOpenLot(lot)) throw new HttpError(400, "INVALID_INPUT", "그 번지는 이제 분양하지 않아요. 다른 번지를 골라 주세요.");
  if (lot !== null && (await store.village(ch)).some((h) => h.lot === lot)) throw lotTaken();
  await spend(accountId, cost, villa ? `villa:plot:${tier.id}` : tier.id === PLOT_TIERS[0].id ? "plot" : `plot:${tier.id}`);
  // 낸 포인트를 집에 남긴다 (오래 비워 정리할 때 그대로 돌려준다, reclaim.ts)
  const others = [houseIdFor(accountId, "sea"), houseIdFor(accountId, "camp")];
  const r = await store.create({ id, owner: accountId, name, intro, ownerName, tier: tier.id, ch, lot, now: Date.now(), paid: cost, villa, others });
  if (r === "exists") await refundAndThrow(accountId, cost, new HttpError(409, "ALREADY_OWNED", "이미 내 집이 있어요."));
  if (r === "villa_changed") await refundAndThrow(accountId, cost, villaChanged());
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
  // 11/26 다른 구역(마을·캠핑장)에 집이 있으면 별장 (마을 값 × 2 = 1.5 × 4/3)
  const briefs = await houseBriefs(store, accountId);
  const had = briefs.sea;
  if (had) throw new HttpError(409, "ALREADY_OWNED", `이미 오두막이 있어요 (${houseLabel(had)}). 오두막은 한 채만 가질 수 있어요.`);
  const villa = villaFor(briefs, "sea");
  const cost = seaPlotCost(tier.id, villa);
  if (lot !== null && (await store.village(ch, "sea")).some((h) => h.lot === lot)) throw lotTaken();
  // 시작 가구는 한 집 id에 한 번만 준다 (철거 뒤 다시 사면 오두막 몫 가방에 남은 것만 그 자리에 놓는다 — 공용 가방은 건드리지 않는다)
  const given = await store.hasStarter(id);
  // 11/24 바닥·벽지는 공용 가방: 다른 집에 쓰지 않은 것이 있으면 시작 바닥·벽지를 그대로 (inventory가 예전 집 몫도 공용으로 먼저 옮긴다)
  const shared = given ? (await store.inventory(housePair(accountId), "sea")).have : null;
  const owned = given && shared ? { ...(await store.ownItems(id)), [SEA_FLOOR]: shared[SEA_FLOOR] ?? 0, [SEA_WALL]: shared[SEA_WALL] ?? 0 } : null;
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
    villa,
    others: [houseIdFor(accountId), houseIdFor(accountId, "camp")],
  });
  if (r === "exists") await refundAndThrow(accountId, cost, new HttpError(409, "ALREADY_OWNED", "이미 오두막이 있어요."));
  if (r === "villa_changed") await refundAndThrow(accountId, cost, villaChanged());
  if (r === "lot_taken") await refundAndThrow(accountId, cost, lotTaken());
  if (r === "full") await refundAndThrow(accountId, cost, new HttpError(409, "VILLAGE_FULL", "이 채널 포구에는 빈 오두막 터가 없어요."));
  return myHouse(store, accountId, undefined, "sea");
}

/** 11/26 캠핑장 집 시작 배치: 그 종류 기본 가구(CAMP_STARTER 자리) + 전용 바닥·벽 */
export function campStarterLayout(kind: CampHomeKind): HouseLayout {
  return { floor: CAMP_FLOOR[kind], wall: CAMP_WALL[kind], items: CAMP_STARTER[kind].map((p) => ({ ...p })) };
}

/**
 * 11/26 언젠가 캠핑장 집 분양: 채널마다 16터 (카라반 12 · 펜션 2 · 촌캉스 2 — 종류는 터로 정해진다).
 * 한 사람당 캠핑장 집 한 채 (집 id가 계정마다 하나). 값 = 그 터 무주택 분양가, 다른 구역에 집이 있으면 별장 × 4/3.
 * 기본 가구는 집에 딸려 놓인다 (가방에 넣지 않는다)
 */
/** 11/26 캠핑장 집 종류마다 분양하는 NPC (안내 문구) */
const CAMP_KIND_SELLER: Record<CampHomeKind, string> = { caravan: "관리소 언젠가 씨", pension: "소슬댁", rural: "순이 할머니" };

export async function buyCampHome(
  store: HouseStore,
  accountId: string,
  name: string,
  intro: string,
  ownerName: string,
  lot: number | null | undefined,
  ch: number,
  kind?: CampHomeKind,
  design?: CaravanDesign,
): Promise<MyHouseResponse> {
  const id = houseIdFor(accountId, "camp");
  if (!isHousingChannel(ch)) throw badChannel();
  const site = typeof lot === "number" ? campLotByNo(lot) : undefined;
  if (!site) throw new HttpError(400, "INVALID_INPUT", `캠핑장 집터는 1~${CAMP_LOT_COUNT}번 중에서 골라 주세요.`);
  // 11/26 분양 NPC마다 자기 종류만 판다: 창이 알려 준 종류(kind)와 터 종류가 다르면 막는다 (돈을 쓰기 전에)
  if (kind && kind !== site.kind) throw new HttpError(400, "WRONG_KIND", `${campLotShort(site.lot)} 터는 ${CAMP_KIND_SELLER[site.kind]}에게 분양받을 수 있어요.`);
  const briefs = await houseBriefs(store, accountId);
  const had = briefs.camp;
  if (had) {
    // 11/26 받침에 맞는 조사 (「솔바람채 펜션이」·「감나무집 촌캉스가」)
    const label = houseLabel(had);
    const c = label.charCodeAt(label.length - 1);
    const batchim = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
    throw new HttpError(409, "ALREADY_OWNED", `이미 ${label}${batchim ? "이" : "가"} 있어요. 캠핑장 집은 한 사람당 한 채예요.`);
  }
  const villa = villaFor(briefs, "camp");
  const cost = campBuyCost(site.lot, villa);
  const taken = () => new HttpError(409, "LOT_TAKEN", "그 터는 방금 다른 분이 분양받았어요. 다른 터를 골라 주세요.");
  if ((await store.village(ch, "camp")).some((h) => h.lot === site.lot)) throw taken();
  const layout = campStarterLayout(site.kind);
  const ext = defaultExterior();
  await spend(accountId, cost, villa ? `villa:camp:${site.kind}` : `camp:${site.kind}`);
  const r = await store.create({
    id,
    owner: accountId,
    name: name || campLotShort(site.lot),
    intro,
    ownerName,
    tier: "small",
    ch,
    lot: site.lot,
    now: Date.now(),
    paid: cost,
    zone: "camp",
    // 11/26 카라반은 고른 디자인 (값은 자리 등급으로만 — 디자인과 상관없다. 안 고르면 그 자리 기본 모습), 펜션·촌캉스는 디자인 없음
    camp: { kind: site.kind, yard: 1, ...(site.kind === "caravan" ? { design: caravanDesignOf(site.lot, design) } : {}) },
    villa,
    others: [houseIdFor(accountId), houseIdFor(accountId, "sea")],
    layout,
    placed: designCounts(layout, ext),
    placedScore: designScore(layout, ext),
  });
  if (r === "exists") await refundAndThrow(accountId, cost, new HttpError(409, "ALREADY_OWNED", "이미 캠핑장 집이 있어요. 캠핑장 집은 한 사람당 한 채예요."));
  if (r === "villa_changed") await refundAndThrow(accountId, cost, villaChanged());
  if (r === "lot_taken" || r === "full") await refundAndThrow(accountId, cost, taken());
  return myHouse(store, accountId, undefined, "camp");
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

/** 11/26 카라반 디자인 바꾸기 (무료 — 모델·몸통 색·차양 색. 캠핑장 카라반 주인만) */
export async function setCaravanDesign(store: HouseStore, accountId: string, design: CaravanDesign): Promise<MyHouseResponse> {
  const id = houseIdFor(accountId, "camp");
  const h = await store.get(id);
  if (!h || h.zone !== "camp") throw noHouse("camp");
  if (h.camp?.kind !== "caravan") throw new HttpError(409, "NOT_CARAVAN", "디자인은 카라반만 바꿀 수 있어요.");
  const d = caravanDesignOf(h.lot, design);
  if (!(await store.setCampDesign(id, d, Date.now()))) throw noHouse("camp");
  return myHouse(store, accountId, undefined, "camp");
}

/** 오두막 겉모습 바꾸기 (무료) */
export async function setCottageStyle(store: HouseStore, accountId: string, style: CottageStyleId): Promise<MyHouseResponse> {
  if (!(await store.setStyle(houseIdFor(accountId, "sea"), style, Date.now()))) throw noHouse("sea");
  return myHouse(store, accountId, undefined, "sea");
}

// 옛 집 번지 보충(전체 목록 읽기 = 집 수만큼 명령)을 이미 해 본 저장소. 인스턴스마다 처음 한 번만 한다
//  (지금 분양은 늘 번지를 받고, 번지 없는 옛 집도 주인이 내 집을 열면 myHouse가 번지를 준다 → 매 요청 훑을 필요가 없다)
//  11/22 동시에 연 요청도 같은 보충을 기다린다 (먼저 연 요청만 기다리고 나머지는 보충 전 목록을 받아 옛 집이 빠져 보였다)
const legacyFilled = new WeakMap<HouseStore, Promise<void>>();

/** 시험용: 옛 집 번지 보충을 다시 하게 한다 */
export function resetLegacyLotFill(store: HouseStore) {
  legacyFilled.delete(store);
}

function fillLegacyLots(store: HouseStore): Promise<void> {
  let p = legacyFilled.get(store);
  if (!p) {
    const run = (async () => {
      const missing = (await store.listAll()).filter((h) => !h.lot);
      for (const h of missing) await store.assignLot(h.id);
    })();
    // 실패하면 다음 요청이 다시 해 본다 (실패한 약속을 붙들고 있으면 1채널 마을이 계속 실패)
    run.catch(() => legacyFilled.get(store) === run && legacyFilled.delete(store));
    legacyFilled.set(store, (p = run));
  }
  return p;
}

/** 한 채널의 분양 마을: 그 채널에 번지가 있는 집들의 외관·문패 (숨긴 집은 자리만) */
export async function village(store: HouseStore, ch: number = LEGACY_HOUSING_CHANNEL, now = Date.now(), zone: HouseZone = "village"): Promise<VillageResponse> {
  if (!isHousingChannel(ch)) throw badChannel();
  if (zone === "sea" || zone === "camp") {
    const sea = await store.village(ch, zone);
    return {
      ch,
      zone,
      lots: zone === "sea" ? SEA_LOT_COUNT : CAMP_LOT_COUNT,
      houses: sea.filter((h) => !h.hidden).map((h) => ({ ...toSummary(h), exterior: h.exterior })),
      taken: sea.filter((h) => h.hidden).map((h) => h.lot),
      generatedAt: now,
    };
  }
  // 마을이 생기기 전에 분양받은 집(번지·채널 없음 → 1채널)은 1채널 마을을 열 때 빈 번지를 받는다 (인스턴스마다 처음 한 번만 훑는다)
  if (ch === LEGACY_HOUSING_CHANNEL) await fillLegacyLots(store);
  const all = await store.village(ch);
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

/** 문패(이름)·소개 바꾸기. renamed = 문패가 실제로 바뀌었는지 (11/26 — 마을 목록에는 문패만 보여 소개만 바뀌면 집 바뀜 알림을 건너뛴다) */
export async function editProfile(
  store: HouseStore,
  accountId: string,
  name: string,
  intro: string,
  zone: HouseZone = "village",
): Promise<{ house: MyHouseResponse; renamed: boolean }> {
  const prev = await store.setProfile(houseIdFor(accountId, zone), name, intro, Date.now());
  if (prev === null) throw noHouse(zone);
  return { house: await myHouse(store, accountId, undefined, zone), renamed: prev !== name };
}

/**
 * 넓히기: 바로 다음 단계로만. 11/26 값은 그 집의 별장 표시로 (별장이면 × 4/3 — 오두막은 1.5배·별장 2배).
 * 11/26 캠핑장 집은 넓히기가 없다 — 카라반·펜션·촌캉스 모두 앞마당 단계를 올리면 방도 커진다 (upgradeYard)
 */
export async function upgradePlot(store: HouseStore, accountId: string, to: PlotTierId, ch?: number, zone: HouseZone = "village"): Promise<MyHouseResponse> {
  if (zone === "camp") throw new HttpError(409, "BAD_TIER", "캠핑장 집은 넓히기가 없어요. 앞마당 단계를 올리면 방도 커져요.");
  const h = await mustHave(store, accountId, zone);
  assertChannel(h, ch);
  const villa = !!(await houseBriefs(store, accountId))[zone]?.villa;
  const quote = upgradeQuote(h, villa);
  if (!quote || quote.to !== to) throw new HttpError(409, "BAD_TIER", "지금 터에서 바로 올릴 수 있는 크기가 아니에요.");
  const price = quote.price;
  await spend(accountId, price, `upgrade:${to}`);
  if (!(await store.upgrade(h.id, h.tier, to, Date.now(), price)))
    await refundAndThrow(accountId, price, new HttpError(409, "CONFLICT", "터 크기가 이미 바뀌었어요. 다시 확인해 주세요."));
  return myHouse(store, accountId, undefined, zone);
}

/**
 * 11/26 캠핑장 앞마당 다음 단계 (포구 오두막과 같은 +13,500 · +22,500 — 카라반 강가 ×1.25 · 폭포 앞 ×1.5, 별장이면 × 4/3). 방도 커진다 (catalog CARAVAN_ROOM·CAMP_HOME_ROOM).
 * 낸 값은 집에 더해 남긴다 (철거 때 돌려준다)
 */
export async function upgradeYard(store: HouseStore, accountId: string, ch?: number): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId, "camp");
  assertChannel(h, ch);
  const yard = h.camp?.yard ?? 1;
  if (yard >= 3) throw new HttpError(409, "MAX_YARD", "앞마당은 이미 3단계예요.");
  const to = (yard + 1) as 2 | 3;
  // 별장 표시는 산 때 남긴 것 (넓히기 upgradePlot과 같은 기준 — 옛 기록이면 houseBriefs가 지금 정해 남긴다)
  const villa = !!(await houseBriefs(store, accountId)).camp?.villa;
  const price = campYardCost(h.lot, to, villa);
  await spend(accountId, price, `camp:yard${to}`);
  if (!(await store.setYard(h.id, yard, to, Date.now(), price)))
    await refundAndThrow(accountId, price, new HttpError(409, "CONFLICT", "앞마당 단계가 이미 바뀌었어요. 다시 확인해 주세요."));
  await settleCampFixtures(store, accountId, to);
  return myHouse(store, accountId, undefined, "camp");
}

/**
 * 11/26 앞마당 단계를 올린 뒤: 기본 가구를 한 번도 안 옮긴 집이면 커진 방의 시작 자리로 옮긴다 (layout campFixturesForYard — 카라반·펜션·촌캉스).
 * 기본 가구는 가구 수·점수에 안 들어가 놓은 개수·점수는 그대로. 그사이 다른 저장이 끼면(conflict) 그냥 둔다 — 단계 올리기는 이미 끝났다
 */
async function settleCampFixtures(store: HouseStore, accountId: string, to: CampYard): Promise<void> {
  const h = await store.get(houseIdFor(accountId, "camp"));
  if (!h || !h.camp || h.camp.yard !== to) return;
  const next = campFixturesForYard(h.layout, to, houseShape(h));
  if (!next) return;
  await store
    .saveDesign(housePair(accountId), "camp", h.tier, next, null, designCounts(next, h.exterior), designScore(next, h.exterior), Date.now(), h.updatedAt)
    .catch(() => undefined);
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
  // 11/26 캠핑장 집 기본 가구는 집에 딸려 있어 따로 팔지 않는다 (어느 판매처든)
  if (def.fixture) throw new HttpError(400, "INVALID_INPUT", "집에 딸린 기본 가구라 따로 팔지 않아요.");
  if (def.ext && zone === "camp") throw new HttpError(400, "INVALID_INPUT", "외관은 마을 집에서만 바꿀 수 있어요.");
  await mustHave(store, accountId, zone);
  // 가구·바닥·벽지는 세 집 공용 가방 (다른 집에 놓인 것까지), 외관은 이 집 것만 센다
  const [bag, briefs] = await Promise.all([store.inventory(housePair(accountId), zone), def.skin === "window" ? houseBriefs(store, accountId) : null]);
  const owned = (bag.have[itemId] ?? 0) + (isHouseOwnItem(itemId) ? 0 : (bag.away[itemId] ?? 0));
  if (owned >= MAX_OWN_PER_ITEM) throw new HttpError(409, "MAX_OWNED", `${def.name}, 이미 ${MAX_OWN_PER_ITEM}개를 다 가졌어요.`);
  // 11/26 창문 모양(눈꽃 창가)은 집 한 채에 하나만 쓴다 → 가진 집 수만큼까지 (집이 늘면 더 살 수 있다)
  const houses = briefs ? HOUSE_ZONES.filter((z) => briefs[z]).length : 0;
  if (briefs && owned >= Math.max(1, houses))
    throw new HttpError(409, "MAX_OWNED", `${def.name}, 집 한 채에 하나씩 써요. 집이 ${houses}채라 ${houses}개까지 가질 수 있어요.`);
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
  // 11/26 캠핑장 집 기본 가구는 집에 딸려 있어 팔거나 없앨 수 없다 (가방에도 없다)
  if (def.fixture) throw new HttpError(409, "FIXTURE", "집에 딸린 기본 가구라 팔 수 없어요. 옮기거나 돌릴 수는 있어요.");
  await mustHave(store, accountId, zone);
  const r = await store.takeItem(housePair(accountId), zone, itemId);
  if (r === "none") throw new HttpError(409, "NO_ITEM", "그 물건을 가지고 있지 않아요.");
  // 11/24 창문 모양으로 쓰는 중이면 그 안내 (바닥·벽지처럼 쓰는 동안은 못 판다)
  if (r === "placed" && def.skin === "window") throw new HttpError(409, "PLACED", "벽 창문에 쓰고 있어요. 꾸미기 「창문」 칸에서 기본으로 바꿔 저장한 뒤 팔 수 있어요.");
  // 11/24 바닥·벽지도 두 집 공용: 이 집이나 다른 집에 입혀 쓰는 동안은 못 판다
  if (r === "placed" && def.skin) throw new HttpError(409, "PLACED", `${def.skin === "floor" ? "바닥" : "벽지"}로 쓰고 있어요. 꾸미기에서 다른 것으로 바꿔 저장한 뒤 팔 수 있어요.`);
  if (r === "placed") throw new HttpError(409, "PLACED", "모두 놓여 있어요. 먼저 집에서 치운 뒤 저장해 주세요.");
  if (r === "away") throw new HttpError(409, "PLACED", def.skin ? `${def.name}, ${SKIN_AWAY_MSG}` : AWAY_MSG);
  const refunded = sellPrice(def);
  const me = await refund(accountId, refunded);
  return { ...(await myHouse(store, accountId, me, zone)), refunded };
}

/** 가진 개수가 모자란 까닭이 다른 집에 놓인 공용 가구면 그 안내로 */
function awayHint(v: { code: string; message: string }, layout: HouseLayout, bag: { have: Record<string, number>; away: Record<string, number> }): string {
  if (v.code !== "NOT_OWNED") return v.message;
  const short = Object.entries(layoutCounts(layout)).find(([it, n]) => (bag.have[it] ?? 0) < n);
  return short && (bag.away[short[0]] ?? 0) > 0
    ? `${furnitureById(short[0])?.name ?? short[0]}, ${furnitureById(short[0])?.skin ? SKIN_AWAY_MSG : AWAY_MSG}`
    : v.message;
}

/** 11/18 배치·외관을 거의 동시에 저장했을 때 (두 번째 저장은 다시 열어서) */
const DESIGN_CONFLICT_MSG = "방금 다른 곳에서 집이 바뀌었어요. 다시 열어 저장해 주세요.";

export async function saveLayout(store: HouseStore, accountId: string, tier: PlotTierId, sent: HouseLayout, ch?: number, zone: HouseZone = "village"): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId, zone);
  assertChannel(h, ch);
  if (h.tier !== tier) throw new HttpError(409, "CONFLICT", "터 크기가 바뀌었어요. 다시 열어 주세요.");
  const pair = housePair(accountId);
  // 11/24 창문 칸이 없는 저장(예전 화면)은 지금 창문 모양을 그대로 둔다
  const layout: HouseLayout = sent.window === undefined && h.layout.window !== undefined ? { ...sent, window: h.layout.window } : sent;
  const bag = await store.inventory(pair, zone);
  // 11/26 방 크기·가구 수는 집마다 (캠핑장 카라반은 앞마당 단계, 기본 가구 검사 — catalog houseShape)
  const v = validateLayout(layout, houseShape(h), bag.have);
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
  // 11/26 집 확인과 화분 기록을 함께 읽는다 (집이 없거나 숨김이면 읽은 것은 버린다 — 집 들어갈 때 Redis 왕복 1번 줄임)
  const early = isHouseId(houseId) ? store.plants(houseId) : null;
  early?.catch(() => undefined);
  const h = await findVisibleHouse(store, houseId);
  const pots = new Set(h.layout.items.filter((p) => p.i === "pot").map((p) => p.u));
  const all = await (early ?? store.plants(h.id));
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
  // 11/26 집 확인과 가구 상태를 함께 읽는다 (housePlants와 같다)
  const early = isHouseId(houseId) ? store.states(houseId) : null;
  early?.catch(() => undefined);
  const h = await findVisibleHouse(store, houseId);
  return { states: liveStates(h.layout, h.tier, await (early ?? store.states(h.id))) };
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
  // 11/16 포구 오두막도 같은 순위에 (번지 자리에 「포구 N번 오두막」). 11/26 캠핑장 집도 (「언젠가 캠핑장 폭포 앞 2번 카라반」). 운영자·내 집은 세 채 모두
  const staffHouses = staffId ? new Set(houseIdsOf(staffId)) : null;
  const pool = (await store.list("score", HOUSE_RANK_POOL)).filter(
    (h) => !h.hidden && !staffHouses?.has(h.id) && Math.max(h.updatedAt, h.createdAt) >= since,
  );
  const mine = accountId ? new Set(houseIdsOf(accountId)) : null;
  const all = pool.map((h, i) => ({ rank: i + 1, name: h.name, sub: `${houseLabel(h)} · ${h.ownerName}`, value: h.score, me: !!mine?.has(h.id) }));
  const mineAt = all.findIndex((r) => r.me);
  return { rows: all.slice(0, size), mine: mineAt >= size ? all[mineAt] : null };
}

// ── 11/26 가구점 밖 판매처(보따리상·보리·문대리·유령선)가 가구를 넣을 집 ──

/** 가구를 넣을 집: 마을 집 먼저, 없으면 포구 오두막, 없으면 캠핑장 집 (공용 가방이라 어느 집이든 같은 가방). 셋 다 없으면 null */
export async function furnitureZone(store: HouseStore, accountId: string): Promise<HouseZone | null> {
  const list = await store.brief(houseIdsOf(accountId));
  const i = list.findIndex((b) => b !== null);
  return i < 0 ? null : HOUSE_ZONES[i];
}
