// 11/17 사냥터 낙법(회피 구르기): 보는 쪽으로 짧게 구르고, 구르는 동안은 공격을 받지 않는다 (몬스터 공격·장판·투사체).
// 무적은 화면(HuntScene)이 판정한다 — 서버가 받는 결과(HuntResult)에는 아무것도 더하지 않는다.
// 시각은 모두 판 시간(멈춤을 뺀 ms, HuntScene.now) 기준.

/** 구르는 시간 = 무적 시간 (ms) */
export const DODGE_MS = 400;
/** 다시 구를 수 있을 때까지 (구르기 시작부터, ms) */
export const DODGE_CD_MS = 6000;
/** 한 번에 구르는 거리 (월드 px, 걷기의 약 두 배 빠르기) */
export const DODGE_DIST = 54;

export type Dodge = { at: number; readyAt: number };
/** 판을 새로 시작할 때 (바로 구를 수 있다) */
export const NO_DODGE: Dodge = { at: -Infinity, readyAt: 0 };

/** 지금 구를 수 있나 (쿨타임만 — 쓰러짐·빙결·묶임은 씬이 따로 본다) */
export const dodgeReady = (d: Dodge, now: number): boolean => now >= d.readyAt;

/** 구르기 시작. 쿨타임 중이면 null */
export function startDodge(d: Dodge, now: number): Dodge | null {
  if (!dodgeReady(d, now)) return null;
  return { at: now, readyAt: now + DODGE_CD_MS };
}

/** 구르는 중인가 (= 공격을 받지 않는 때). 시작 순간부터 DODGE_MS 직전까지 */
export const rolling = (d: Dodge, now: number): boolean => now >= d.at && now < d.at + DODGE_MS;

/** 구르기 진행 0..1 (구르는 중이 아니면 1) */
export const rollT = (d: Dodge, now: number): number => (rolling(d, now) ? (now - d.at) / DODGE_MS : 1);

/** 남은 쿨타임: 비율 0..1과 ms (HUD 칸의 시계·남은 초) */
export function dodgeCooldown(d: Dodge, now: number): { left: number; ms: number } {
  const ms = Math.max(0, d.readyAt - now);
  return { left: Math.min(1, ms / DODGE_CD_MS), ms };
}

/** 굴러 간 거리 비율 (처음에 빠르고 끝에 멈칫 — 감속 곡선). t: 0..1 */
export function rollTravel(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) * (1 - c);
}

/**
 * 구르는 방향 (단위 벡터): 방향 입력이 있으면 그쪽 (걷던 쪽 그대로 — 공격하느라 겨냥한 쪽으로 굳어 있어도 빠져나가게),
 * 없으면 보는 쪽. 둘 다 없으면 아래
 */
export function rollDir(axis: { x: number; y: number }, face: { x: number; y: number }): { x: number; y: number } {
  const am = Math.hypot(axis.x, axis.y);
  if (am > 0.15) return { x: axis.x / am, y: axis.y / am };
  const fm = Math.hypot(face.x, face.y);
  if (fm > 1e-6) return { x: face.x / fm, y: face.y / fm };
  return { x: 0, y: 1 };
}
