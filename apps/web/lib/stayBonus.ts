// 접속 시간 보너스: 그날 머문 시간이 30분 쌓일 때마다 한 구간. 구석 작은 창의 [받기]로 받는다 (안 받으면 구간이 계속 쌓인다).
//  - 머문 시간은 출석 도장과 같은 기준 = 그날 서버가 받아 준 머무르기 기록 수(_stay) × 10분 (/api/me/presence, 9.5분 간격)
//    → 클라이언트 시계를 믿지 않고, 탭을 여러 개 열어도 기록은 9.5분에 한 번만 쌓인다. 숨은 탭도 출석처럼 센다
//  - 날짜는 한국 시간 새벽 5시 기준 (lib/gameDay) (오늘 적립 해시 earn:{id}:{날짜}에 받은 구간 수 `_bonus`를 둔다 → 날이 바뀌면 0부터)
//  - 구간이 지날수록 조금씩 늘다가 25P에서 고정, 하루 STAY_BONUS_AMOUNTS.length 구간까지
//  - 하루 전체 한도(DAILY_EARN_CAP)와 별개: 다른 활동으로 한도를 채웠어도 받고, 오늘 합계(_total)에 더하지 않는다. 지갑 상한은 그대로

/** 한 구간 = 머무르기 기록 3번 (30분) */
export const STAY_BONUS_EVERY_TICKS = 3;
/** 머무르기 기록 1번 = 10분 (lib/calendar.ts STAY_TICK_MINUTES와 같다. economy.ts가 이 파일을 읽으므로 순환 import를 피해 숫자로 둔다) */
export const STAY_BONUS_EVERY_MINUTES = STAY_BONUS_EVERY_TICKS * 10;
/** 구간별 보너스 (1구간 = 30분, 7구간 = 3시간 30분). 합계 145P가 하루 상한 */
export const STAY_BONUS_AMOUNTS: readonly number[] = [10, 15, 20, 25, 25, 25, 25];
export const STAY_BONUS_DAILY_MAX = STAY_BONUS_AMOUNTS.reduce((n, p) => n + p, 0);

/** 오늘 머문 기록으로 열린 구간 수 (하루 상한 구간까지) */
export function stayBonusTiers(stayTicks: number): number {
  return Math.min(Math.floor(Math.max(0, stayTicks) / STAY_BONUS_EVERY_TICKS), STAY_BONUS_AMOUNTS.length);
}

/** 받은 구간 수(claimed) 다음부터 upTo 구간까지의 보너스 합 */
export function stayBonusSum(claimed: number, upTo: number): number {
  return STAY_BONUS_AMOUNTS.slice(Math.max(0, claimed), Math.max(0, upTo)).reduce((n, p) => n + p, 0);
}

export type StayBonusState = {
  /** 받을 수 있는 구간 수·합계 */
  count: number;
  points: number;
  /** 오늘 보너스를 다 받았는지 (모든 구간 받음) */
  done: boolean;
  /** 다음 구간까지 남은 머무르기 기록 수 (다 열렸으면 null) */
  ticksToNext: number | null;
};

export function stayBonusState(stayTicks: number, claimed: number): StayBonusState {
  const tiers = stayBonusTiers(stayTicks);
  const from = Math.min(Math.max(0, claimed), tiers);
  const max = STAY_BONUS_AMOUNTS.length;
  return {
    count: tiers - from,
    points: stayBonusSum(from, tiers),
    done: claimed >= max,
    ticksToNext: tiers >= max ? null : (tiers + 1) * STAY_BONUS_EVERY_TICKS - stayTicks,
  };
}
