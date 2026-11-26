import { HttpError } from "../http";
import { furnitureById } from "../housing/catalog";
import { npcFurnRate, npcFurnRows, npcHouseZone, type NpcFurnRow } from "../housing/npcFurnShop";
import { buyFurnitureMe, getHouseStore } from "../housing/service";
import { getAccounts } from "../store";
import { loadMe } from "../store/accounts";
import type { Me } from "../types";
import { isOfficeFurn, OFFICE_FURN_IDS } from "./catalog";

// 11/20 「총무팀 문대리」 서버 (판매 목록은 catalog.ts — 순수).
// 사기는 가구점과 같은 buyFurniture (값 = 집 칭호·포인트왕 중 큰 할인 하나, 가방·한도 MAX_OWNED·환불 그대로) — 사무실 가구(officeShop)는 한정 판매 인자로 연다.
// 판매 목록 밖 id는 400 NOT_SOLD (가구점 물건이라도), 집이 없으면 409 NO_HOUSE.

export type OfficeFurnRow = NpcFurnRow;
export type OfficeStatus = {
  furn: OfficeFurnRow[];
  points: number;
  /** 적용된 가구 할인율 (집 칭호·포인트왕 중 큰 것) */
  rate: number;
  /** 집(마을 집이나 포구 오두막)이 있는지 — 없으면 못 산다 */
  house: boolean;
};
export type OfficeBuyResult = OfficeStatus & { me: Me; got: string };

export async function officeStatus(accountId: string, now = Date.now()): Promise<OfficeStatus> {
  const [rate, me, zone] = await Promise.all([npcFurnRate(accountId, now), loadMe(getAccounts(), accountId, now), npcHouseZone(accountId)]);
  const furn = await npcFurnRows(accountId, OFFICE_FURN_IDS, rate, zone);
  return { furn, points: me.points, rate, house: zone !== null };
}

/** 문대리에게서 사무실 가구 사기 (가구 가방 +1) */
export async function buyOffice(accountId: string, id: string, now = Date.now()): Promise<OfficeBuyResult> {
  const f = furnitureById(id);
  if (!f || !isOfficeFurn(id)) throw new HttpError(400, "NOT_SOLD", "총무팀 비품 목록에 없는 물건이에요.");
  const zone = await npcHouseZone(accountId);
  if (!zone) throw new HttpError(409, "NO_HOUSE", "비품은 집이 있어야 지급돼요. 마을 분양 사무소·포구 부동산·캠핑장에서 집을 분양받아요.");
  // 가구점과 같은 값 매기기·가방·한도·환불 (마지막 인자 = 가구점 밖 한정 판매 허용)
  const rate = await npcFurnRate(accountId, now);
  const { house: h, me } = await buyFurnitureMe(getHouseStore(), accountId, id, rate, zone, true);
  // 11/20 할인율·집은 위에서 읽은 값, 가방·내 정보는 결제하며 읽어 돌려준 산 뒤 값 (다시 읽지 않는다 — Redis 명령 줄이기)
  const furn = await npcFurnRows(accountId, OFFICE_FURN_IDS, rate, zone, { have: h.inventory, away: h.away ?? {} });
  return { furn, points: me.points, rate, house: true, me, got: f.name };
}
