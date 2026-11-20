import { isRideablePet, itemById } from "@tomb/protocol";
import { champShopDiscount, pickDiscount } from "../champPerks";
import { HttpError } from "../http";
import { furnitureById, type HouseZone } from "../housing/catalog";
import { buyFurnitureMe, getHouseStore, houseIdFor, housePair } from "../housing/service";
import { getAccounts } from "../store";
import { loadMe } from "../store/accounts";
import { champBoardsSafe } from "../store/champ";
import { discountedPrice } from "../titles";
import { wornPerk } from "../titlesServer";
import type { Me } from "../types";
import { adoptPet } from "../zoo/service";
import { isMungnyangFurn, MUNGNYANG_FURN_IDS, MUNGNYANG_PET_IDS, mungnyangPetCost } from "./catalog";

// 11/19 「분양사 보리」 서버 (판매 목록은 catalog.ts — 순수).
// 사기는 기존 경로를 그대로 쓴다:
//  ① 펫 = 동물원 사육사와 같은 영구 분양(zoo/service adoptPet — 이미 가족이면 409 ALREADY_OWNED, 가방에 같은 이용권이면 HAS_TICKET,
//     모자라면 NOT_ENOUGH_POINTS, 사면 바로 데리고 다닌다). 값은 사육사처럼 할인 없이 정가 (품종 펫 = mungnyangPetPrice, 셋 = 사육사 값)
//  ② 가구 = 가구점과 같은 buyFurniture (값 = 집 칭호·포인트왕 중 큰 할인 하나, 가방·한도 MAX_OWNED·환불 그대로). 품종 가구는 한정 판매 인자로 연다
//  판매 목록 밖 id는 400 NOT_SOLD (사육사·가구점 물건이라도 목록에 없으면)

export type MungnyangKind = "pet" | "furn";

/** 펫 한 줄 (가진 것은 창이 내 정보로 본다 — 데리고 다니는 중·집에 있음) */
export type MungnyangPetRow = { id: string; name: string; desc: string; price: number; ride: boolean };
/** 가구 한 줄 (값은 원가 · 내가 낼 값, have = 두 집 공용 가방에 가진 개수 — 다른 집에 놓인 것까지) */
export type MungnyangFurnRow = { id: string; name: string; desc: string; base: number; cost: number; have: number };

export type MungnyangStatus = {
  pets: MungnyangPetRow[];
  furn: MungnyangFurnRow[];
  points: number;
  /** 가구에 적용된 할인율 (집 칭호·포인트왕 중 큰 것) */
  rate: number;
  /** 집(마을 집이나 포구 오두막)이 있는지 — 없으면 가구는 못 산다 */
  house: boolean;
};
export type MungnyangBuyResult = MungnyangStatus & { me: Me; lookGrant?: string; got: string; kind: MungnyangKind };

/** 가구 할인율: 가구점과 같다 (집 칭호·포인트왕 가구 중 큰 것 하나) */
async function furnRate(accountId: string, now: number): Promise<number> {
  const [perk, champ] = await Promise.all([wornPerk(accountId, now), champBoardsSafe(accountId, now)]);
  return pickDiscount(perk.houseDiscount, champShopDiscount(champ, "furniture"));
}

/** 가구를 넣을 집 (마을 집 먼저, 없으면 포구 오두막). 둘 다 없으면 null (가구 보따리상과 같은 규칙) */
async function houseZone(accountId: string): Promise<HouseZone | null> {
  const store = getHouseStore();
  const [v, s] = await Promise.all([store.get(houseIdFor(accountId, "village")), store.get(houseIdFor(accountId, "sea"))]);
  return v ? "village" : s ? "sea" : null;
}

export async function mungnyangStatus(accountId: string, now = Date.now()): Promise<MungnyangStatus> {
  const [rate, me, zone] = await Promise.all([furnRate(accountId, now), loadMe(getAccounts(), accountId, now), houseZone(accountId)]);
  const bag = zone ? await getHouseStore().inventory(housePair(accountId), zone) : null;
  return statusOf({ rate, points: me.points, zone, bag });
}

/** 가구 가방 (두 집 공용 — have·away) */
type Bag = { have: Record<string, number>; away: Record<string, number> };

/** 11/20 이미 읽은 값으로 목록 만들기 (사기 뒤에 할인율·집·가방·내 정보를 다시 읽지 않게 — Redis 명령 줄이기) */
function statusOf({ rate, points, zone, bag }: { rate: number; points: number; zone: HouseZone | null; bag: Bag | null }): MungnyangStatus {
  const pets = MUNGNYANG_PET_IDS.flatMap((id): MungnyangPetRow[] => {
    const it = itemById(id);
    const price = mungnyangPetCost(id);
    return it && price !== null ? [{ id, name: it.name, desc: it.desc, price, ride: isRideablePet(id) }] : [];
  });
  const furn = MUNGNYANG_FURN_IDS.flatMap((id): MungnyangFurnRow[] => {
    const f = furnitureById(id);
    if (!f) return [];
    return [{ id, name: f.name, desc: f.desc, base: f.price, cost: discountedPrice(f.price, rate), have: (bag?.have[id] ?? 0) + (bag?.away[id] ?? 0) }];
  });
  return { pets, furn, points, rate, house: zone !== null };
}

/** 분양사에게서 사기: 펫은 영구 분양(바로 데리고 다님), 가구는 가구 가방 +1 */
export async function buyMungnyang(accountId: string, kind: MungnyangKind, id: string, now = Date.now()): Promise<MungnyangBuyResult> {
  let got: string;
  let grant: string | undefined;
  let me: Me;
  let rate: number;
  let zone: HouseZone | null;
  let bag: Bag | null;
  if (kind === "pet") {
    const price = mungnyangPetCost(id);
    const it = itemById(id);
    if (price === null || !it) throw new HttpError(400, "NOT_SOLD", "보리가 분양하지 않는 아이예요.");
    const r = await adoptPet(accountId, id, price, { tag: "분양사", where: "분양사 창" }, now);
    grant = r.lookGrant;
    got = it.name;
    // 11/20 adoptPet이 산 뒤 내 정보를 읽어 돌려준다 (다시 읽지 않는다). 가구 쪽 목록 값만 읽는다
    me = r.me;
    [rate, zone] = await Promise.all([furnRate(accountId, now), houseZone(accountId)]);
    bag = zone ? await getHouseStore().inventory(housePair(accountId), zone) : null;
  } else {
    const f = furnitureById(id);
    if (!f || !isMungnyangFurn(id)) throw new HttpError(400, "NOT_SOLD", "보리가 팔지 않는 가구예요.");
    zone = await houseZone(accountId);
    if (!zone) throw new HttpError(409, "NO_HOUSE", "가구는 집이 있어야 살 수 있어요. 마을 분양 사무소나 포구 부동산에 들러요.");
    rate = await furnRate(accountId, now);
    // 가구점과 같은 값 매기기·가방·한도·환불 (마지막 인자 = 가구점 밖 한정 판매 허용 — 품종 가구. 가구점 셋은 원래 열려 있다)
    const r = await buyFurnitureMe(getHouseStore(), accountId, id, rate, zone, true);
    bag = { have: r.house.inventory, away: r.house.away ?? {} }; // 산 뒤 가방·내 정보 (결제하며 이미 읽어 돌려준다)
    me = r.me;
    got = f.name;
  }
  return { ...statusOf({ rate, points: me.points, zone, bag }), me, ...(grant ? { lookGrant: grant } : {}), got, kind };
}
