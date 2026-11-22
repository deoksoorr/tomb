// 11/22 색 보관함 「이 색 입기」 연타 잠금을 화면이 기억한다 (서버가 429 + Retry-After로 알려 준 끝 시각, 이 탭에서만).
// 아이템 페이지를 닫았다 다시 열어도 남은 시간을 바로 보여 준다. 새로고침하면 잊고, 다음 요청에서 서버가 다시 알려 준다.

let lockUntil = 0;

/** 잠금이 끝나는 내 시계 시각 (0 = 잠금 없음) */
export function selectLockUntil(): number {
  return lockUntil;
}

/** 서버가 알려 준 남은 초로 잠금을 적는다 */
export function noteSelectLock(retryAfterSec: number, now = Date.now()): number {
  lockUntil = now + Math.max(1, retryAfterSec) * 1000;
  return lockUntil;
}
