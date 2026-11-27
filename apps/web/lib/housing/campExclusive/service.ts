import type { CampHomeKind } from "@tomb/protocol";
import { HttpError } from "../../http";
import { getAccounts } from "../../store";
import { loadMe } from "../../store/accounts";
import type { Me } from "../../types";
import type { MyHouseResponse } from "../types";
import { CAMP_ONLY_IDS, campOnlyOwnerMsg, furnitureById } from "../catalog";
import { npcFurnRate, npcFurnRows, npcHouseZone, type NpcFurnRow } from "../npcFurnShop";
import { buyFurnitureMe, getHouseStore, houseIdFor } from "../service";
import { CX_SELLER } from "./index";

// 11/27 캠핑장 집 종류별 전용 가구 판매 (서버): 언젠가 씨(카라반)·소슬댁(펜션)·순이 할머니(촌캉스) 분양 창의 「전용 가구」 탭.
// 사기는 가구점·문대리와 같은 buyFurniture (값 = 집 칭호·포인트왕 중 큰 할인 하나, 공용 가방·한도 MAX_OWNED·환불 그대로) — 한정 판매 인자로 연다.
//  - 그 NPC가 파는 종류 목록 밖이면 400 NOT_SOLD (다른 종류 전용 물건·가구점 물건이라도)
//  - 그 종류 캠핑장 집 주인이 아니면 409 NOT_OWNER (돈은 안 나간다) — 목록은 누구나 본다
//  - 산 물건은 공용 가방 (캠핑장 집 몫). 놓기·입히기는 그 종류 집에서만 (layout validateLayout), 되팔기는 어느 집에서든

export type CampShopStatus = {
  kind: CampHomeKind;
  furn: NpcFurnRow[];
  points: number;
  /** 적용된 가구 할인율 (집 칭호·포인트왕 중 큰 것) */
  rate: number;
  /** 이 종류 캠핑장 집 주인인지 (아니면 구경만) */
  owner: boolean;
};
/** house = 산 뒤 내 캠핑장 집 (가방 포함 — 분양 창이 들고 있는 집 정보를 바로 고친다. 다시 읽지 않게) */
export type CampShopBuyResult = CampShopStatus & { me: Me; got: string; house: MyHouseResponse };

/** 내 캠핑장 집 종류 (없으면 null) */
async function myCampKind(accountId: string): Promise<CampHomeKind | null> {
  const h = await getHouseStore().get(houseIdFor(accountId, "camp"));
  return h && h.zone === "camp" && h.camp ? h.camp.kind : null;
}

export async function campShopStatus(accountId: string, kind: CampHomeKind, now = Date.now()): Promise<CampShopStatus> {
  const [rate, me, zone, mine] = await Promise.all([
    npcFurnRate(accountId, now),
    loadMe(getAccounts(), accountId, now),
    npcHouseZone(accountId),
    myCampKind(accountId),
  ]);
  const furn = await npcFurnRows(accountId, CAMP_ONLY_IDS[kind], rate, zone);
  return { kind, furn, points: me.points, rate, owner: mine === kind };
}

/** 그 종류 NPC에게서 전용 물건 사기 (공용 가방 +1) */
export async function buyCampShop(accountId: string, kind: CampHomeKind, id: string, now = Date.now()): Promise<CampShopBuyResult> {
  const f = furnitureById(id);
  if (!f || f.campOnly !== kind) throw new HttpError(400, "NOT_SOLD", `${CX_SELLER[kind].subj} 파는 물건이 아니에요.`);
  if ((await myCampKind(accountId)) !== kind) throw new HttpError(409, "NOT_OWNER", campOnlyOwnerMsg(kind));
  const rate = await npcFurnRate(accountId, now);
  // 캠핑장 집 가방으로 (세 집 공용 가방이라 어느 집에서 보든 같다)
  const { house: h, me } = await buyFurnitureMe(getHouseStore(), accountId, id, rate, "camp", true);
  const furn = await npcFurnRows(accountId, CAMP_ONLY_IDS[kind], rate, "camp", {
    have: h.inventory,
    away: h.away ?? {},
  });
  return { kind, furn, points: me.points, rate, owner: true, me, got: f.name, house: h };
}
