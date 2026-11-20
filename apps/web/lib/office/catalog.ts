import { FURNITURE, furnitureById } from "../housing/catalog";

// 11/20 「총무팀 문대리」(야근 빌딩 옆 사무실 가구 카트) 판매 목록 (순수 — 판매 창·서버·월드 이름표가 같이 쓴다).
//  사무실 가구 15종 (catalog officeShop — 가구점 목록·일반 구매에서 빠지고 여기서만 판다). 값 매기기·사기는 lib/office/service.ts

/** 이름표 첫 줄 (판매 창 제목) · 위에 작게 띄우는 둘째 줄 */
export const OFFICE_SHOP_TITLE = "총무팀 문대리";
export const OFFICE_SHOP_SUB = "사무실 가구";

/** 판매 창 가구 순서 (카탈로그 순서 그대로) */
export const OFFICE_FURN_IDS: readonly string[] = FURNITURE.filter((f) => f.officeShop).map((f) => f.id);

const furnSet = new Set(OFFICE_FURN_IDS);

/** 문대리가 파는 사무실 가구인지 (원가는 catalog price — 할인은 가구점과 같다) */
export function isOfficeFurn(id: string): boolean {
  return furnSet.has(id) && !!furnitureById(id);
}
