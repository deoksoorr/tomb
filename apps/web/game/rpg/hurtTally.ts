// 11/17 내가 받은 피해 숫자를 HUD 체력과 맞추는 계산 (Phaser 없이 — hurtTally.test.ts).
//  - 체력은 안에서 소수로 흐른다 (1초마다 자연 회복 0.4%, 처치 회복 1% …). 화면은 정수로, 살아 있으면 1 아래로 내려가 보이지 않게 올림
//  - 떠오르는 빨간 숫자 = 화면 체력이 실제로 줄어든 양 (0 아래로 넘친 몫은 빼고, 체력 1로 버티면 거기까지만)
//  - 0.3초 안에 여러 번 맞으면 숫자 하나로 합친다 (맞은 종류마다 따로 — 맞음·지속 피해·방패가 막음)

/** 이 안에 또 맞으면 앞 숫자에 더한다 (첫 숫자부터 잰다 — 계속 맞아도 0.3초마다 새 숫자가 뜬다) */
export const HURT_MERGE_MS = 300;

export type HurtKind = "hit" | "dot" | "block";

/** 합치는 중인 숫자 하나: 처음 뜬 시각(ms)과 지금까지 합 */
export type HurtCell = { at: number; n: number };

/** 화면에 보이는 체력 (정수). 살아 있으면 1 이상 — 0.4가 남았는데 "0"으로 보이지 않게 올린다 */
export function hpShown(hp: number): number {
  if (!(hp > 0)) return 0;
  // 0.1 + 0.2 같은 소수 끝자리 때문에 37.0000001이 38로 보이지 않게
  return Math.max(1, Math.ceil(hp - 1e-6));
}

/** before → after로 화면 체력이 줄어든 양 (늘었으면 0) */
export function hpLost(before: number, after: number): number {
  return Math.max(0, hpShown(before) - hpShown(after));
}

/**
 * 새 피해 n을 더한다. 앞 숫자가 뜬 지 windowMs 안이면 거기에 합친다 (merged = true → 앞 숫자를 지우고 합계를 다시 띄운다).
 * n이 0 이하면 아무것도 바꾸지 않는다 (cell 그대로, merged = false, shown = false)
 */
export function addHurt(cell: HurtCell | null, now: number, n: number, windowMs = HURT_MERGE_MS): { cell: HurtCell | null; merged: boolean; shown: boolean } {
  if (!(n > 0)) return { cell, merged: false, shown: false };
  if (cell && now >= cell.at && now - cell.at < windowMs) return { cell: { at: cell.at, n: cell.n + n }, merged: true, shown: true };
  return { cell: { at: now, n }, merged: false, shown: true };
}
