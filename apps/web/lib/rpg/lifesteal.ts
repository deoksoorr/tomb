// 11/17 넋 거두기(so_drain) 흡혈 규칙 (순수): 사냥 화면(HuntScene.strike)이 맞힐 때마다 부른다.
//  - 한 번 맞힘: 준 피해 × 흡혈 비율, 최대 HP의 3%까지 (예전 그대로)
//  - 광역기(opts.aoe)·소환(길동무 넋·망자의 초롱)으로 맞힌 건 3분의 1만
//  - 모든 맞힘을 합쳐 1초(지난 1000ms)에 최대 HP의 5%까지 — 예전엔 상한이 없어 광역기 한 번에 HP가 몇 번이나 꽉 찼다
// 시각은 판 시간(ms). 저주의 받는 회복 절반(healMul)은 부르는 쪽이 이 값에 곱한다.

/** 한 번 맞힐 때 최대 (최대 HP 비율) */
export const STEAL_HIT_CAP = 0.03;
/** 1초 동안 모든 맞힘을 합친 최대 (최대 HP 비율) */
export const STEAL_SEC_CAP = 0.05;
export const STEAL_WINDOW_MS = 1000;
/** 광역기·소환 맞힘의 흡혈 배율 */
export const STEAL_SPLASH_MUL = 1 / 3;

/** 맞힌 방법: 한 대상(기본 공격·단일 스킬) · 광역기 · 소환 */
export type StealKind = "single" | "aoe" | "summon";

/** 지난 1초 동안 찬 양 [시각, 양] (오래된 순) */
export type StealBook = { at: number; hp: number }[];

/**
 * 이번 맞힘으로 찰 HP (저주 배율 전). 찬 만큼 book에 적는다 (book을 고친다).
 * missing: 지금 모자란 HP (가득하면 0 → 안 차고 적지도 않는다)
 */
export function stealHeal(book: StealBook, now: number, a: { dmg: number; steal: number; maxHp: number; missing: number; kind: StealKind }): number {
  while (book.length && book[0].at <= now - STEAL_WINDOW_MS) book.shift();
  if (!(a.steal > 0) || !(a.dmg > 0) || !(a.missing > 0) || !(a.maxHp > 0)) return 0;
  const raw = Math.min(a.maxHp * STEAL_HIT_CAP, a.dmg * a.steal) * (a.kind === "single" ? 1 : STEAL_SPLASH_MUL);
  let used = 0;
  for (const e of book) used += e.hp;
  const heal = Math.max(0, Math.min(raw, a.maxHp * STEAL_SEC_CAP - used, a.missing));
  if (heal > 0) book.push({ at: now, hp: heal });
  return heal;
}
