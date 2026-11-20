import { MUNGNYANG_PETS, mungnyangPetPrice, petPrice } from "@tomb/protocol";
import { FURNITURE, furnitureById } from "../housing/catalog";

// 11/19 「분양사 보리」(멍냥 분양사, 동물원 정문 왼쪽) 판매 목록 (순수 — 판매 창·서버·월드 이름표가 같이 쓴다).
//  - 펫: 품종 펫 12종(protocol MUNGNYANG_PETS) + 예전 사육사 펫 강아지·고양이 셋(퇴근 강아지·사무실 고양이·듬직한 큰 개 — protocol BORI_ONLY_PETS, 예전 사육사 값)
//  - 집 가구: 품종 집 가구 12종(catalog petShop) + 예전 가구점 가구 셋(잠자는 강아지·고양이 쿠션·잠든 유령 고양이 — catalog boriOnly, 예전 가구점 값)
//  11/20 겹침 없앰: 모두 보리만 판다 (사육사 창·가구점 목록과 일반 구매에서 뺐다)
//  값 매기기·사기는 lib/mungnyang/service.ts (펫 = 동물원과 같은 영구 분양, 가구 = 가구점과 같은 buyFurniture)

/** 이름표 첫 줄 (판매 창 제목) · 위에 작게 띄우는 둘째 줄 */
export const MUNGNYANG_SHOP_TITLE = "분양사 보리";
export const MUNGNYANG_SHOP_SUB = "강아지·고양이 분양";

/** 예전 사육사 펫 강아지·고양이 셋 (11/20부터 보리만 판다 — 값은 protocol petPrice 그대로) */
export const MUNGNYANG_ZOO_PET_IDS = ["pet_dog", "pet_cat", "pet_hound"] as const;
/** 예전 가구점 강아지·고양이 가구 셋 (11/20부터 보리만 판다 — catalog boriOnly, 값은 price 그대로) */
export const MUNGNYANG_SHOP_FURN_IDS = ["sleepy_dog", "cat_cushion", "ghost_cat"] as const;

/** 판매 창 펫 순서: 품종 펫(싼 것부터) 다음에 사육사와 같이 파는 셋 */
export const MUNGNYANG_PET_IDS: readonly string[] = [...MUNGNYANG_PETS.map((p) => p.id), ...MUNGNYANG_ZOO_PET_IDS];
/** 판매 창 가구 순서: 품종 집 가구(카탈로그 순서) 다음에 가구점과 같이 파는 셋 */
export const MUNGNYANG_FURN_IDS: readonly string[] = [...FURNITURE.filter((f) => f.petShop === "mungnyang").map((f) => f.id), ...MUNGNYANG_SHOP_FURN_IDS];

const petSet = new Set(MUNGNYANG_PET_IDS);
const furnSet = new Set(MUNGNYANG_FURN_IDS);

/** 분양사에서 파는 펫의 영구 분양 값 (판매 목록 밖이면 null). 품종 펫 = mungnyangPetPrice, 사육사와 같이 파는 셋 = 사육사 값 */
export function mungnyangPetCost(id: string): number | null {
  if (!petSet.has(id)) return null;
  return mungnyangPetPrice(id) ?? petPrice(id);
}

/** 분양사에서 파는 집 가구인지 (원가는 catalog price — 할인은 가구점과 같다) */
export function isMungnyangFurn(id: string): boolean {
  return furnSet.has(id) && !!furnitureById(id);
}
