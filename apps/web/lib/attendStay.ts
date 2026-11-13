// 10번 출석 도장 조건 (머문 시간)과 그 안내 문구. 의존성이 없는 작은 모듈이라 lib/economy.ts(포인트 규칙 설명)와
// lib/calendar.ts(달력)가 순환 없이 함께 쓴다. 문구의 숫자는 모두 아래 상수에서 계산한다.

/** 머무르기 기록 1번 = 10분 (클라이언트 PRESENCE_INTERVAL_MS) */
export const STAY_TICK_MINUTES = 10;
/** 출석 도장을 받으려면 그날 머물러야 하는 기록 수 */
export const ATTEND_STAY_TICKS = 6;
/** 출석 도장을 받으려면 그날 머물러야 하는 시간 (= 기록 수 × 10분) */
export const ATTEND_STAY_MINUTES = ATTEND_STAY_TICKS * STAY_TICK_MINUTES;

/** 분 → "1시간" / "1시간 30분" / "40분" */
export function durationText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}분`;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

/** 출석 조건 시간 문구 ("1시간") */
export const ATTEND_STAY_TEXT = durationText(ATTEND_STAY_MINUTES);

/** 출석 조건 한 줄: "마을에 1시간 머물면 오늘 출석 도장을 찍을 수 있어요" */
export const ATTEND_RULE_TEXT = `마을에 ${ATTEND_STAY_TEXT} 머물면 오늘 출석 도장을 찍을 수 있어요`;

/** 남은 시간 안내: "아직 출석까지 20분 남았어요" (다 채웠으면 받으라는 안내) */
export function attendLeftText(stayMinutes: number): string {
  const left = ATTEND_STAY_MINUTES - stayMinutes;
  return left > 0 ? `아직 출석까지 ${durationText(left)} 남았어요` : "오늘 출석 도장을 찍을 수 있어요";
}
