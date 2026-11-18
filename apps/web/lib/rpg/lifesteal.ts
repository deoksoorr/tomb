// 넋 거두기(so_drain) 흡혈 규칙 (순수): 사냥 화면(HuntScene.strike)이 맞힐 때마다 부른다.
//  - 한 번 맞힘: 준 피해 × 흡혈 비율, 최대 HP의 3%까지
// 11/19 넋 갈래 초기 상태로 되돌림 (실서버 v70 그대로): 11/17·11/18에 넣었던 1초 상한과 광역기·소환 감쇠는 없앴다.
// 저주의 받는 회복 절반(healMul)은 부르는 쪽이 이 값에 곱한다.

/** 한 번 맞힐 때 최대 (최대 HP 비율) */
export const STEAL_HIT_CAP = 0.03;

/** 이번 맞힘으로 찰 HP (저주 배율 전, 최대 HP를 넘는 몫은 부르는 쪽이 자른다). missing: 지금 모자란 HP (가득하면 0 → 안 찬다) */
export function stealHeal(a: { dmg: number; steal: number; maxHp: number; missing: number }): number {
  if (!(a.steal > 0) || !(a.dmg > 0) || !(a.missing > 0) || !(a.maxHp > 0)) return 0;
  return Math.min(a.maxHp * STEAL_HIT_CAP, a.dmg * a.steal);
}
