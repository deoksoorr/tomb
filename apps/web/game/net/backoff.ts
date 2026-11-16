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

// ── 11/17 오래 실패할 때 천천히 ──
// 한 번 실패할 때마다 /api/join(웹) → 로비 조회·친구 등록(로비 DO) → 채널 DO 요청이 한 벌씩 나간다.
// 8초 상한으로 끝없이 다시 시도하면, 붙지 못하는 화면 하나가 사람이 없는 새벽에도 시간당 수백 벌을 만든다(11/16 실측).
// 그래서 여러 번 연달아 실패하면 간격을 30초로, 탭이 숨어 있으면 60초로 늘린다. 탭이 다시 보이면 바로 다시 시도한다(클라이언트).

/** 이만큼 연달아 실패하면(약 1분) 천천히 */
export const SLOW_RETRY_AFTER = 10;
export const SLOW_RETRY_MS = 30_000;
/** 탭이 숨어 있으면 이만큼 실패한 뒤부터(약 15초) 더 천천히 */
export const HIDDEN_RETRY_AFTER = 5;
export const HIDDEN_RETRY_MS = 60_000;

/** 재접속 대기 (ms). attempt: 0부터 연달아 실패한 횟수, hidden: 탭이 숨어 있음(휴식 포함) */
export function retryDelay(attempt: number, hidden: boolean, rand: number = Math.random()): number {
  const slow = hidden && attempt >= HIDDEN_RETRY_AFTER ? HIDDEN_RETRY_MS : attempt >= SLOW_RETRY_AFTER ? SLOW_RETRY_MS : 0;
  if (!slow) return backoffDelay(attempt, rand);
  const r = Math.max(0, Math.min(1, rand));
  return Math.round(slow * (1 - JITTER + 2 * JITTER * r));
}

/** 탭이 다시 보일 때: 남은 대기가 보통 백오프 상한보다 길면 바로 다시 시도할지 */
export function retrySoonOnVisible(dueAt: number | null, now: number): boolean {
  return dueAt !== null && dueAt - now > BACKOFF_MAX_MS;
}
