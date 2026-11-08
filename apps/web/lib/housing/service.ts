import { createHmac } from "node:crypto";
import { nanoid } from "nanoid";
import { env } from "../env";
import { HttpError } from "../http";
import { kstDay } from "../store/accounts";
import type { Me } from "../types";
import {
  furnitureById,
  MAX_OWN_PER_ITEM,
  nextTier,
  PLOT_TIERS,
  sellPrice,
  type PlotTierId,
} from "./catalog";
import { validateLayout } from "./layout";
import { myPoints, refundAndThrow, rewardLike, spend, refund } from "./points";
import { MemoryHouseStore, type HouseRecord, type HouseStore } from "./store";
import { RedisHouseStore } from "./store-redis";
import type { GuestEntryView, HouseLayout, HouseSummary, MyHouseResponse, PublicHouse } from "./types";

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
const noHouse = () => new HttpError(409, "NO_HOUSE", "먼저 분양 사무소에서 내 묘역을 분양받아 주세요.");

export function toPublicHouse(r: HouseRecord): PublicHouse {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { owner, hidden, items, ...pub } = r;
  return pub;
}

export function toSummary(r: HouseRecord): HouseSummary {
  return {
    id: r.id,
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
  const [h, inventory, m] = await Promise.all([store.get(id), store.inventory(id), me ?? myPoints(accountId)]);
  return { house: h ? toPublicHouse(h) : null, inventory, points: m.points };
}

const mustHave = async (store: HouseStore, accountId: string): Promise<HouseRecord> => {
  const h = await store.get(houseIdFor(accountId));
  if (!h) throw noHouse();
  return h;
};

export async function buyPlot(store: HouseStore, accountId: string, name: string, intro: string, ownerName: string): Promise<MyHouseResponse> {
  const id = houseIdFor(accountId);
  if (await store.get(id)) throw new HttpError(409, "ALREADY_OWNED", "이미 내 묘역이 있어요. 한 계정에 하나만 분양받을 수 있어요.");
  const tier = PLOT_TIERS[0];
  await spend(accountId, tier.price, "plot");
  const ok = await store.create({ id, owner: accountId, name, intro, ownerName, tier: tier.id, now: Date.now() });
  if (!ok) await refundAndThrow(accountId, tier.price, new HttpError(409, "ALREADY_OWNED", "이미 내 묘역이 있어요."));
  return myHouse(store, accountId);
}

export async function editProfile(store: HouseStore, accountId: string, name: string, intro: string): Promise<MyHouseResponse> {
  if (!(await store.setProfile(houseIdFor(accountId), name, intro, Date.now()))) throw noHouse();
  return myHouse(store, accountId);
}

export async function upgradePlot(store: HouseStore, accountId: string, to: PlotTierId): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId);
  const next = nextTier(h.tier);
  if (!next || next.id !== to) throw new HttpError(409, "BAD_TIER", "지금 묘역에서 바로 올릴 수 있는 크기가 아니에요.");
  await spend(accountId, next.price, `upgrade:${to}`);
  if (!(await store.upgrade(h.id, h.tier, to, Date.now())))
    await refundAndThrow(accountId, next.price, new HttpError(409, "CONFLICT", "묘역 크기가 이미 바뀌었어요. 다시 확인해 주세요."));
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
  if (r === "placed") throw new HttpError(409, "PLACED", "모두 놓여 있어요. 먼저 묘역에서 치운 뒤 저장해 주세요.");
  const refunded = sellPrice(def);
  const me = await refund(accountId, refunded);
  return { ...(await myHouse(store, accountId, me)), refunded };
}

export async function saveLayout(store: HouseStore, accountId: string, tier: PlotTierId, layout: HouseLayout): Promise<MyHouseResponse> {
  const h = await mustHave(store, accountId);
  if (h.tier !== tier) throw new HttpError(409, "CONFLICT", "묘역 크기가 바뀌었어요. 다시 열어 주세요.");
  const v = validateLayout(layout, tier, await store.inventory(h.id));
  if (!v.ok) throw new HttpError(400, v.code, v.message);
  const r = await store.saveLayout(h.id, tier, layout, v.counts, v.placedScore, Date.now());
  if (r === "no_house") throw noHouse();
  if (r === "tier") throw new HttpError(409, "CONFLICT", "묘역 크기가 바뀌었어요. 다시 열어 주세요.");
  if (r === "not_owned") throw new HttpError(409, "NOT_OWNED", "가진 것보다 많이 놓았어요. 가방을 다시 확인해 주세요.");
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

