// 성불(49번) 안내 문구 — 서버(409 메시지)와 화면이 같이 쓴다. 서버 전용 모듈을 가져오지 않는다.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 남은 시간 → "3일 4시간" / "5시간" / "1시간 안" */
export function remainingText(ms: number): string {
  if (ms < HOUR) return "1시간 안";
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  if (!days) return `${hours}시간`;
  return hours ? `${days}일 ${hours}시간` : `${days}일`;
}

/** 1인 1묘비: 이미 묘비가 있을 때 새로 쓰기 대신 보여 주는 안내 */
export function oneGraveMessage(passAt: number, now = Date.now()): string {
  return `지금 묘비가 성불한 뒤에 쓸 수 있어요 (남은 기간 ${remainingText(Math.max(0, passAt - now))})`;
}
