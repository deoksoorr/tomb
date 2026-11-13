import { bodyUnlockPrice, DYE_PARTS, dyeSpecialOf, itemById, PERMANENT_MULTIPLIER, petPrice, type AvatarDye } from "@tomb/protocol";

// 외형 꾸미기 점수 (서버 랭킹·내 정보·가방이 함께 쓰는 순수 계산. 서버 전용 모듈을 들이지 않는다).
// 지금 "착용 중이고 만료 전"인 꾸미기만 센다 → 기간제가 끝나면 그 파츠 점수도 바로 사라진다.
// 점수 = 영구 소장 기준 가치 ÷ LOOK_SCORE_DIVISOR (반올림, 1점 단위 — 값이 조금만 달라도 점수가 달라진다).
// 입은 게 이용권이든 영구든 같은 점수다 (영구/이용권 차이는 두지 않는다).
//  - 캐릭터 꾸미기: 이용권 값 × PERMANENT_MULTIPLIER (영구 소장가와 같은 기준 — 배수가 바뀌면 점수도 따라간다)
//  - 펫: 동물원 가격
//  - 프리미엄 외형(선택권으로 해금한 몸): 선택권 값. 처음 6종·운영자 몸은 0
//  - 염색 특수 색(금빛·반짝이·무지개·야광): 부위마다 +DYE_SPECIAL_BONUS
//  - 운영자 전용 꾸미기는 0

/** 가치 몇 P당 1점인지 */
export const LOOK_SCORE_DIVISOR = 5;
/** 염색 특수 색 한 부위 보너스 */
export const DYE_SPECIAL_BONUS = 10;

/** 영구 소장 기준 가치(P) → 점수 (0 이하면 0) */
export function valueScore(value: number): number {
  return value > 0 ? Math.round(value / LOOK_SCORE_DIVISOR) : 0;
}

/** 꾸미기 한 점의 영구 소장 기준 가치 (꾸미기가 아니거나 운영자 전용이면 0) */
export function itemLookValue(itemId: string): number {
  const it = itemById(itemId);
  if (!it || it.kind !== "cosmetic" || it.staff) return 0;
  return petPrice(itemId) ?? it.price * PERMANENT_MULTIPLIER;
}

/** 꾸미기 한 점의 점수 (꾸미기가 아니거나 운영자 전용이면 0) */
export function itemLookScore(itemId: string): number {
  return valueScore(itemLookValue(itemId));
}

/** 프리미엄 외형 점수 (선택권 값 기준. 처음 6종·운영자 몸은 0) */
export function bodyLookScore(body: string | null | undefined): number {
  return valueScore(bodyUnlockPrice(body) ?? 0);
}

/** 점수를 매길 외형: 입은 꾸미기(만료 시각 포함) · 몸 모양 · 염색 */
export type LookScoreInput = {
  equipped: readonly { itemId: string; until: number }[];
  body?: string | null;
  dye?: AvatarDye | null;
};

/** 파츠별 점수 (만료 전 착용품만, 부위마다 하나, 점수 높은 순) */
export function scoredParts(input: Pick<LookScoreInput, "equipped">, now: number): { itemId: string; score: number }[] {
  const seen = new Set<string>();
  const out: { itemId: string; score: number }[] = [];
  for (const e of input.equipped) {
    const slot = itemById(e.itemId)?.slot;
    if (!(e.until > now) || !slot || seen.has(slot)) continue;
    seen.add(slot);
    out.push({ itemId: e.itemId, score: itemLookScore(e.itemId) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 지금 꾸미기 점수 = 만료 전 착용 파츠 점수 + 프리미엄 외형 + 염색 특수 색 보너스 */
export function lookScore(input: LookScoreInput, now: number): number {
  const parts = scoredParts(input, now).reduce((n, p) => n + p.score, 0);
  const body = bodyLookScore(input.body);
  const dye = input.dye ? DYE_PARTS.filter((p) => input.dye?.[p] && dyeSpecialOf(input.dye[p])).length * DYE_SPECIAL_BONUS : 0;
  return parts + body + dye;
}

/** 랭킹에 보여 줄 대표 파츠 (점수 높은 순 n개, 0점 파츠는 뺀다) */
export function topParts(input: Pick<LookScoreInput, "equipped">, now: number, n = 3): string[] {
  return scoredParts(input, now)
    .filter((p) => p.score > 0)
    .slice(0, n)
    .map((p) => p.itemId);
}
