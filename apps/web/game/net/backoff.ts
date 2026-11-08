// 재연결 지수 백오프: 0.5s → 1s → 2s → 4s → 8s(최대), ±25% 지터.
// 지터는 서버가 재시작됐을 때 모두가 같은 순간에 몰려 재접속하는 것을 흩어 준다.

export const BACKOFF_STEPS_MS = [500, 1000, 2000, 4000, 8000] as const;
export const BACKOFF_MAX_MS = 8000;
export const BACKOFF_MIN_MS = 250;
const JITTER = 0.25;

/** attempt: 0부터. rand: [0,1) */
export function backoffDelay(attempt: number, rand: number = Math.random()): number {
  const i = Math.max(0, Math.min(Math.floor(attempt), BACKOFF_STEPS_MS.length - 1));
  const base = BACKOFF_STEPS_MS[i];
  const r = Math.max(0, Math.min(1, rand));
  const jittered = base * (1 - JITTER + 2 * JITTER * r);
  return Math.round(Math.max(BACKOFF_MIN_MS, Math.min(BACKOFF_MAX_MS, jittered)));
}
