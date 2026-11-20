import { champShopDiscount, pickDiscount } from "../champPerks";
import { champBoardsSafe } from "../store/champ";
import { discountedPrice } from "../titles";
import { wornPerk } from "../titlesServer";
import { furnitureById, type HouseZone } from "./catalog";
import { getHouseStore, houseIdFor, housePair } from "./service";

// 11/20 NPC 가구 상점 공용 (서버): 가구점 밖에서 가구를 파는 NPC(총무팀 문대리 — lib/office)가 같이 쓰는 값 매기기·집 찾기·목록 줄.
// 규칙은 가구점·분양사 보리(lib/mungnyang)와 같다:
//  - 값 = 집 칭호·포인트왕 가구 할인 중 큰 것 하나 (discountedPrice — 1P 단위 내림)
//  - 가구를 넣을 집 = 마을 집 먼저, 없으면 포구 오두막. 둘 다 없으면 null (가구는 못 산다 — NO_HOUSE)
//  - 가진 개수 = 두 집 공용 가구 가방 (다른 집에 놓인 것까지)

/** 가구 한 줄 (값은 원가 · 내가 낼 값, have = 두 집 공용 가방에 가진 개수 — 다른 집에 놓인 것까지) */
export type NpcFurnRow = { id: string; name: string; desc: string; base: number; cost: number; have: number };

/** 가구 할인율: 가구점과 같다 (집 칭호·포인트왕 가구 중 큰 것 하나) */
export async function npcFurnRate(accountId: string, now: number): Promise<number> {
  const [perk, champ] = await Promise.all([wornPerk(accountId, now), champBoardsSafe(accountId, now)]);
  return pickDiscount(perk.houseDiscount, champShopDiscount(champ, "furniture"));
}

/** 가구를 넣을 집 (마을 집 먼저, 없으면 포구 오두막). 둘 다 없으면 null */
export async function npcHouseZone(accountId: string): Promise<HouseZone | null> {
  const store = getHouseStore();
  const [v, s] = await Promise.all([store.get(houseIdFor(accountId, "village")), store.get(houseIdFor(accountId, "sea"))]);
  return v ? "village" : s ? "sea" : null;
}

/** 가구 가방 (두 집 공용 — have·away) */
export type NpcFurnBag = { have: Record<string, number>; away: Record<string, number> };

/** 판매 목록 줄 (집이 없으면 가진 개수는 0). 11/20 이미 읽은 가방(사기 뒤 buyFurniture 결과)을 주면 다시 읽지 않는다 */
export async function npcFurnRows(accountId: string, ids: readonly string[], rate: number, zone: HouseZone | null, known?: NpcFurnBag): Promise<NpcFurnRow[]> {
  const bag = known ?? (zone ? await getHouseStore().inventory(housePair(accountId), zone) : null);
  return ids.flatMap((id): NpcFurnRow[] => {
    const f = furnitureById(id);
    if (!f) return [];
    return [{ id, name: f.name, desc: f.desc, base: f.price, cost: discountedPrice(f.price, rate), have: (bag?.have[id] ?? 0) + (bag?.away[id] ?? 0) }];
  });
}
