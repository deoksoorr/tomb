import { LIGHTHOUSE, LIGHTHOUSE_LAMP } from "./lighthouseLayout";

// 11/20 등대 빛줄기 원근 계산 (순수 함수 — 그림은 BeamView).
// 위에서 비스듬히 보는 마을: 땅 위 거리 d만큼 남북으로 가면 화면에선 d*SQUASH만 움직인다.
// 빛줄기는 등불(땅에서 LAMP_H 위)에서 나와 땅 위 POOL 거리에 내려앉는 원뿔 — 내려앉은 자리에 빛 웅덩이.
// 방위 th: 0 = 동, π/2 = 남(보는 사람 쪽), π = 서, -π/2 = 북 (화면 y가 아래로 커진다).

/** 땅 남북 납작함 (연못 타원 비율과 비슷하게) */
export const SQUASH = 0.45;
/** 등불 높이 (화면 px) */
export const LAMP_H = LIGHTHOUSE.y - LIGHTHOUSE_LAMP.y;
/** 빛 웅덩이까지 땅 거리: 북쪽(먼 쪽)일수록 멀리 — 언덕이 북으로 높아지는 셈, 북쪽 빛줄기가 화면에서 납작해지지 않게 */
export const POOL_D = 215;
export const POOL_D_TILT = 45;
/** 빛 웅덩이 반지름 (땅 거리, 빛줄기 방향 · 옆) */
export const POOL_ALONG = 46;
export const POOL_ACROSS = 0.14;
/** 가까울수록(남쪽) 크고 밝게 */
export const NEAR_GROW = 0.3;

export type BeamPose = {
  /** 방위의 남쪽 성분 sin(th): +1 보는 사람 쪽, -1 먼 쪽 */
  s: number;
  /** 빛 웅덩이 가운데 (땅 = 화면 좌표) */
  px: number;
  py: number;
  /** 등불 → 웅덩이 화면 길이·각 */
  len: number;
  ang: number;
  /** 원뿔 끝 반폭 (화면 px, 원근 키움 포함) */
  half: number;
  /** 가까움 배율 1-NEAR_GROW..1+NEAR_GROW */
  near: number;
};

export function beamPose(th: number): BeamPose {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const d = POOL_D - POOL_D_TILT * s;
  const px = LIGHTHOUSE.x + d * c;
  const py = LIGHTHOUSE.y + d * s * SQUASH;
  const dx = px - LIGHTHOUSE_LAMP.x;
  const dy = py - LIGHTHOUSE_LAMP.y;
  const near = 1 + NEAR_GROW * s;
  return {
    s,
    px,
    py,
    len: Math.hypot(dx, dy),
    ang: Math.atan2(dy, dx),
    half: POOL_D * POOL_ACROSS * near,
    near,
  };
}

/** 등불 → 웅덩이 사이 t(0..1) 지점의 땅 y (그 자리 빛줄기 바로 아래 땅 — 이보다 앞(아래)에 선 것이 빛줄기를 가린다) */
export function groundYAt(p: BeamPose, t: number): number {
  return LIGHTHOUSE.y + (p.py - LIGHTHOUSE.y) * t;
}

/** 화면 점 (x,y)를 등불→웅덩이 선분에 내린 비율 (0..1로 자른다) */
export function projectT(p: BeamPose, x: number, y: number): number {
  const dx = p.px - LIGHTHOUSE_LAMP.x;
  const dy = p.py - LIGHTHOUSE_LAMP.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1) return 0;
  return Math.min(1, Math.max(0, ((x - LIGHTHOUSE_LAMP.x) * dx + (y - LIGHTHOUSE_LAMP.y) * dy) / l2));
}

/**
 * 땅 위 타원(빛줄기 방향 반지름 a, 옆 b)을 화면으로 — 원 그림 하나를 돌리고 늘려 그리도록 (회전, 가로 반지름, 세로 반지름).
 * 화면 = diag(1,SQUASH)·R(th)·diag(a,b) 를 특이값 분해 (원은 뒤쪽 회전에 그대로라 앞쪽 회전·배율만 쓴다).
 */
export function groundEllipse(th: number, a: number, b: number, squash = SQUASH): { rot: number; rx: number; ry: number } {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const m00 = c * a;
  const m01 = -s * b;
  const m10 = squash * s * a;
  const m11 = squash * c * b;
  const E = (m00 + m11) / 2;
  const F = (m00 - m11) / 2;
  const G = (m10 + m01) / 2;
  const H = (m10 - m01) / 2;
  const Q = Math.hypot(E, H);
  const R = Math.hypot(F, G);
  const a1 = Math.atan2(G, F);
  const a2 = Math.atan2(H, E);
  return { rot: (a2 + a1) / 2, rx: Q + R, ry: Math.abs(Q - R) };
}

/** 각을 -π..π로 */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (Math.PI * 2);
  return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
}
