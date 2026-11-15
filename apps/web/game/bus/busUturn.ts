// 11/15 정류장 버스 유턴 (손님을 내려 준 뒤 정류장 앞에서 방향을 바꿔 왔던 길로 되돌아 나간다). 순수 계산 — 테스트는 bus/busRide.test.ts
//  0 ~ 0.34: 옆모습이 좁아지며(차체가 돌아 화면 쪽을 보기 시작) 앞으로 나가며 화면 쪽(아래)으로 내려온다
//  0.34 ~ 0.66: 앞모습 (넓어졌다 다시 좁아진다) — 반원의 가장 아래
//  0.66 ~ 1: 반대쪽 옆모습이 넓어지며 원래 줄로 올라간다

export const UTURN_MS = 1500;
/** 반원의 가로 반지름 (앞으로 나가는 거리의 절반, px) */
export const UTURN_RX = 28;
/** 화면 쪽으로 내려오는 깊이 (px) */
export const UTURN_RY = 14;

export type UturnState = { dx: number; dy: number; sx: number; view: "side" | "front" | "back"; done: boolean };

/** u = 0..1 진행. dx = 처음 방향으로 나간 거리, dy = 아래로, sx = 가로 배율 */
export function uturnAt(u: number): UturnState {
  const t = Math.max(0, Math.min(1, u));
  const a = Math.PI * t;
  const dx = UTURN_RX * (1 - Math.cos(a));
  const dy = UTURN_RY * Math.sin(a);
  if (t < 0.34) return { dx, dy, sx: 1 - 0.62 * (t / 0.34), view: "side", done: false };
  if (t < 0.66) {
    const k = (t - 0.34) / 0.32;
    return { dx, dy, sx: 0.55 + 0.45 * Math.sin(Math.PI * k), view: "front", done: false };
  }
  return { dx, dy, sx: 0.38 + 0.62 * ((t - 0.66) / 0.34), view: "back", done: t >= 1 };
}
