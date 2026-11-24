// 11/24 집에 들어가고 나올 때 내 캐릭터를 어디에 둘지 (game/housing/install.ts).
//  - 문으로 걸어 들어갔으면(또는 친구 집 놀러 가기) 나올 때 그 집 문 앞
//  - [집] → [내 집 가기]처럼 바로 들어갔으면(stay) 들어가기 전 자리 그대로 (마을·캠핑장·바닷가 어디든)

export type HouseFrom = "world" | "village";

/** 들어갈 때 숨은 캐릭터를 미리 문 앞에 세울지 (새로고침 복원도 그 자리를 기억한다) */
export const doorOnEnter = (from: HouseFrom, stay: boolean): boolean => from === "world" && !stay;

/** 나올 때: 분양 마을로 · 그 집 문 앞 · 들어가기 전 자리 */
export function houseExitTo(from: HouseFrom, hasVillage: boolean, stay: boolean): "village" | "door" | "stay" {
  if (from === "village" && hasVillage) return "village";
  return stay ? "stay" : "door";
}
