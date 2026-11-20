import { itemById, PERMANENT_UNTIL, seasonPrice, type CosmeticSlot, type ItemDef } from "@tomb/protocol";
import { champShopDiscount, pickDiscount } from "../champPerks";
import { env } from "../env";
import { HttpError } from "../http";
import { furnitureById, type FurnitureDef } from "../housing/catalog";
import type { HouseZone } from "../housing/catalog";
import { buyFurnitureMe, getHouseStore, houseIdFor, housePair } from "../housing/service";
import { recordLook } from "../lookRank";
import { getAccounts } from "../store";
import { lookGrant, lookOf, loadMe } from "../store/accounts";
import { champBoardsSafe } from "../store/champ";
import { getStyleStore } from "../store/style";
import { discountedPrice } from "../titles";
import { wornPerk } from "../titlesServer";
import type { Me } from "../types";
import { nextStart, saleRefusal, setBonusText, shopView, type SeasonGroup } from "./rules";
import type { SeasonKind } from "./schedule";

// 11/19 기간 한정 노점 서버 (계절 보따리상 = 코디 · 가구 보따리상 = 가구). 일정·판정은 rules.ts (순수).
// 사기: ① 일정상 지금 판매 중인지 (판매 예정·판매 끝·일정에 없음은 거절 — saleRefusal) ② 값 = 큰 할인 하나 (칭호·포인트왕 — 잡화점·가구점과 같다)
//  ③ 차감은 기존 경로 그대로: 코디 하루권 = 잡화점과 같은 가방 +1(accounts.buy, 가지고 있거나 입고 있으면 409),
//     코디 영구 = 잡화점 영구와 같은 영구 꾸미기 저장소(buyPermanent), 가구 = 가구점과 같은 buyFurniture (가방·한도·환불)

/** 코디 한 줄 (값은 원가 · 내가 낼 값) */
export type SeasonCosRow = {
  id: string;
  name: string;
  desc: string;
  slot: CosmeticSlot;
  grade?: ItemDef["grade"];
  start: number;
  saleEnd: number;
  /** 하루권 (펫은 없음) · 영구 */
  day: { base: number; cost: number } | null;
  perm: { base: number; cost: number };
  /** 11/20 판매 예정: 값을 판매 시작 때 공개한다 (day·perm은 비워 보낸다) */
  hidden?: true;
};
/** 가구 한 줄 (have = 두 집 공용 가방에 가진 개수) */
export type SeasonFurnRow = { id: string; name: string; desc: string; start: number; saleEnd: number; base: number; cost: number; have: number; /** 11/20 판매 예정: 값 비공개 (base·cost 0) */ hidden?: true };
export type SeasonGroupView<R> = Omit<SeasonGroup, "items"> & { bonus: string; items: R[] };

export type SeasonStatus = {
  kind: SeasonKind;
  /** 서버가 본 지금 (남은 날 문구 — 개발 시계를 옮겨도 같은 기준) */
  now: number;
  on: SeasonGroupView<SeasonCosRow | SeasonFurnRow>[];
  soon: SeasonGroupView<SeasonCosRow | SeasonFurnRow>[];
  /** 아무것도 없을 때 다음 묶음 시작 (없으면 null) */
  next: number | null;
  points: number;
  /** 적용된 할인율 (칭호·포인트왕 중 큰 것) */
  rate: number;
  /** 가구: 집(마을 집이나 포구 오두막)이 있는지 */
  house?: boolean;
};
export type SeasonBuyResult = SeasonStatus & { me: Me; lookGrant?: string; got: string };

/** 코디로 팔 수 있는 정의 (계절 한정 꾸미기 — protocol seasonPrice). 아직 정의가 없으면 null */
function cosDef(id: string): { item: ItemDef & { slot: CosmeticSlot }; price: { day: number | null; perm: number } } | null {
  const item = itemById(id);
  const price = seasonPrice(id);
  if (!item || item.kind !== "cosmetic" || !item.slot || !price) return null;
  return { item: item as ItemDef & { slot: CosmeticSlot }, price };
}
const furnDef = (id: string): FurnitureDef | null => furnitureById(id) ?? null;
const has = (kind: SeasonKind) => (id: string) => (kind === "cos" ? cosDef(id) !== null : furnDef(id) !== null);

/** 할인율: 코디 = 패션 칭호·포인트왕(상점), 가구 = 집 칭호·포인트왕(가구) */
async function rateOf(accountId: string, kind: SeasonKind, now: number): Promise<number> {
  const [perk, champ] = await Promise.all([wornPerk(accountId, now), champBoardsSafe(accountId, now)]);
  return kind === "cos" ? pickDiscount(perk.discount, champShopDiscount(champ, "shop", "cosmetic")) : pickDiscount(perk.houseDiscount, champShopDiscount(champ, "furniture"));
}

/** 가구를 넣을 집 (마을 집 먼저, 없으면 포구 오두막). 둘 다 없으면 null */
async function houseZone(accountId: string): Promise<HouseZone | null> {
  const store = getHouseStore();
  const [v, s] = await Promise.all([store.get(houseIdFor(accountId, "village")), store.get(houseIdFor(accountId, "sea"))]);
  return v ? "village" : s ? "sea" : null;
}

export async function seasonStatus(accountId: string, kind: SeasonKind, now = Date.now()): Promise<SeasonStatus> {
  const [rate, me, zone] = await Promise.all([rateOf(accountId, kind, now), loadMe(getAccounts(), accountId, now), kind === "furn" ? houseZone(accountId) : Promise.resolve(null)]);
  const bag = kind === "furn" && zone ? await getHouseStore().inventory(housePair(accountId), zone) : null;
  return statusOf(kind, now, { rate, points: me.points, zone, bag });
}

/** 가구 가방 (두 집 공용 — have·away) */
type Bag = { have: Record<string, number>; away: Record<string, number> };

/** 11/20 이미 읽은 값으로 목록 만들기 (사기 뒤에 할인율·집·가방·내 정보를 다시 읽지 않게 — Redis 명령 줄이기) */
function statusOf(kind: SeasonKind, now: number, got: { rate: number; points: number; zone: HouseZone | null; bag: Bag | null }): SeasonStatus {
  const { rate, zone, bag } = got;
  const view = shopView(kind, now, has(kind));
  const cost = (base: number) => ({ base, cost: discountedPrice(base, rate) });
  const row = (it: { id: string; start: number; saleEnd: number }): SeasonCosRow | SeasonFurnRow | null => {
    if (kind === "cos") {
      const d = cosDef(it.id);
      if (!d) return null;
      return { ...it, name: d.item.name, desc: d.item.desc, slot: d.item.slot, ...(d.item.grade ? { grade: d.item.grade } : {}), day: d.price.day === null ? null : cost(d.price.day), perm: cost(d.price.perm) };
    }
    const f = furnDef(it.id);
    if (!f) return null;
    const have = (bag?.have[it.id] ?? 0) + (bag?.away[it.id] ?? 0);
    return { ...it, name: f.name, desc: f.desc, ...cost(f.price), have };
  };
  // 11/20 판매 예정 묶음은 값을 감춘다 (판매 시작과 함께 공개 — 응답에도 싣지 않는다)
  const hide = (r: SeasonCosRow | SeasonFurnRow): SeasonCosRow | SeasonFurnRow =>
    "perm" in r ? { ...r, day: null, perm: { base: 0, cost: 0 }, hidden: true } : { ...r, base: 0, cost: 0, hidden: true };
  const groups = (list: SeasonGroup[], soon = false) =>
    list.map((g) => ({
      ...g,
      bonus: kind === "cos" ? setBonusText(g.set) : "",
      items: g.items
        .map(row)
        .filter((r): r is SeasonCosRow | SeasonFurnRow => r !== null)
        .map((r) => (soon ? hide(r) : r)),
    }));
  return {
    kind,
    now,
    on: groups(view.on),
    soon: groups(view.soon, true),
    next: view.on.length || view.soon.length ? null : nextStart(kind, now),
    points: got.points,
    rate,
    ...(kind === "furn" ? { house: zone !== null } : {}),
  };
}

/** 노점에서 사기: 코디는 mode = "day"(24시간 이용권, 가방으로) | "perm"(영구), 가구는 mode 무시 (가방 +1) */
export async function buySeason(accountId: string, kind: SeasonKind, id: string, mode: "day" | "perm", now = Date.now()): Promise<SeasonBuyResult> {
  const no = saleRefusal(kind, id, now);
  if (no) throw new HttpError(no.status, no.code, no.message);
  const rate = await rateOf(accountId, kind, now);
  let grant: string | undefined;
  let got: string;
  let me: Me | null = null;
  let zone: HouseZone | null = null;
  let bag: Bag | null = null;
  if (kind === "cos") {
    const d = cosDef(id);
    if (!d) throw new HttpError(400, "NOT_SOLD", "아직 준비 중인 물건이에요.");
    got = d.item.name;
    if (mode === "day") {
      if (d.price.day === null) throw new HttpError(400, "INVALID_INPUT", "이 물건은 영구로만 팔아요.");
      const r = await getAccounts().buy(accountId, id, discountedPrice(d.price.day, rate), { unique: true, now });
      if (r === "owned") throw new HttpError(409, "ALREADY_OWNED", "이미 가지고 있거나 착용 중이에요.");
      if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
    } else {
      const r = await getStyleStore(getAccounts()).buyPermanent(accountId, id, d.item.slot, discountedPrice(d.price.perm, rate), PERMANENT_UNTIL, `shop:계절 영구 ${id}`, now);
      if (r === "owned") throw new HttpError(409, "ALREADY_OWNED", "이미 영구로 가지고 있어요.");
      if (r === "ticket") throw new HttpError(409, "HAS_TICKET", "가방에 같은 꾸미기 이용권이 있어요. 먼저 입은 뒤에 영구로 바꿀 수 있어요.");
      if (r === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
      me = await loadMe(getAccounts(), accountId, now);
      await recordLook(accountId, me, { now }); // 꾸미기 랭킹 점수 (영구 구매)
      grant = await lookGrant(env.joinSecret(), accountId, lookOf(me), now, me);
    }
  } else {
    const f = furnDef(id);
    if (!f) throw new HttpError(400, "NOT_SOLD", "아직 준비 중인 물건이에요.");
    got = f.name;
    zone = await houseZone(accountId);
    if (!zone) throw new HttpError(409, "NO_HOUSE", "가구는 집이 있어야 살 수 있어요. 마을 분양 사무소나 포구 부동산에 들러요.");
    // 가구점과 같은 값 매기기·가방·한도·환불 (마지막 인자 = 가구점 밖 특별 판매 허용 — 유령선과 같은 자리)
    const r = await buyFurnitureMe(getHouseStore(), accountId, id, rate, zone, true);
    bag = { have: r.house.inventory, away: r.house.away ?? {} }; // 산 뒤 가방·내 정보 (결제하며 이미 읽어 돌려준다)
    me = r.me;
  }
  // 11/20 할인율·집·가방은 위에서 읽은 값, 내 정보는 산 뒤 한 번만 (영구 코디·가구는 위에서 읽은 것 — 하루권만 여기서)
  me ??= await loadMe(getAccounts(), accountId, now);
  const status = statusOf(kind, now, { rate, points: me.points, zone, bag });
  return { ...status, me, ...(grant ? { lookGrant: grant } : {}), got };
}
