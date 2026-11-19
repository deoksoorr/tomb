// 접속 시간 보너스: 그날 머문 시간이 30분 쌓일 때마다 한 구간. 구석 작은 창의 [받기]로 받는다 (안 받으면 구간이 계속 쌓인다).
//  - 머문 시간은 출석 도장과 같은 기준 = 그날 서버가 받아 준 머무르기 기록 수(_stay) × 10분 (/api/me/presence, 9.5분 간격)
//    → 클라이언트 시계를 믿지 않고, 탭을 여러 개 열어도 기록은 9.5분에 한 번만 쌓인다. 숨은 탭도 출석처럼 센다
//  - 날짜는 한국 시간 새벽 5시 기준 (lib/gameDay) (오늘 적립 해시 earn:{id}:{날짜}에 받은 구간 수 `_bonus`를 둔다 → 날이 바뀌면 0부터)
//  - 구간이 지날수록 조금씩 늘다가 25P에서 고정. 11/19 하루 7구간(145P) 상한을 없앴다 — 그다음 구간도 계속 25P
//  - 오늘 모은 포인트(_total)에 더하지 않는다 (출석 달력 보상처럼 따로)

/** 한 구간 = 머무르기 기록 3번 (30분) */
export const STAY_BONUS_EVERY_TICKS = 3;
/** 머무르기 기록 1번 = 10분 (lib/calendar.ts STAY_TICK_MINUTES와 같다. economy.ts가 이 파일을 읽으므로 순환 import를 피해 숫자로 둔다) */
export const STAY_BONUS_EVERY_MINUTES = STAY_BONUS_EVERY_TICKS * 10;
/** 구간별 보너스 (1구간 = 30분). 마지막 값이 그다음 구간마다 계속 나온다 */
export const STAY_BONUS_AMOUNTS: readonly number[] = [10, 15, 20, 25];

/** 오늘 머문 기록으로 열린 구간 수 */
export function stayBonusTiers(stayTicks: number): number {
  return Math.floor(Math.max(0, stayTicks) / STAY_BONUS_EVERY_TICKS);
}

/**
 * 11/16 출석·접속 갈래 칭호(머무르기 보상 +): 구간별 보너스 × (1 + bonus)를 1P 단위로 반올림.
 * 앞 구간들 값만 들어 있고, 마지막 값이 그다음 구간마다 계속 쓰인다 (stayBonusAt)
 */
export function stayBonusAmounts(bonus = 0): number[] {
  return bonus > 0 ? STAY_BONUS_AMOUNTS.map((n) => Math.round(n * (1 + bonus))) : [...STAY_BONUS_AMOUNTS];
}

/** i번째(1부터) 구간 값 (amounts = stayBonusAmounts — 끝을 넘으면 마지막 값) */
export const stayBonusAt = (amounts: readonly number[], i: number) => amounts[Math.min(i, amounts.length) - 1] ?? 0;

/** 받은 구간 수(claimed) 다음부터 upTo 구간까지의 보너스 합 (bonus = 칭호 머무르기 보상 비율) */
export function stayBonusSum(claimed: number, upTo: number, bonus = 0): number {
  const a = stayBonusAmounts(bonus);
  let sum = 0;
  for (let i = Math.max(0, claimed) + 1; i <= upTo; i++) sum += stayBonusAt(a, i);
  return sum;
}

export type StayBonusState = {
  /** 받을 수 있는 구간 수·합계 */
  count: number;
  points: number;
  /** 다음 구간까지 남은 머무르기 기록 수 */
  ticksToNext: number;
};

/** bonus = 11/16 단 칭호의 머무르기 보상 비율 (화면 표시용 — 서버가 같은 규칙으로 준다) */
export function stayBonusState(stayTicks: number, claimed: number, bonus = 0): StayBonusState {
  const tiers = stayBonusTiers(stayTicks);
  const from = Math.min(Math.max(0, claimed), tiers);
  return {
    count: tiers - from,
    points: stayBonusSum(from, tiers, bonus),
    ticksToNext: (tiers + 1) * STAY_BONUS_EVERY_TICKS - stayTicks,
  };
}
