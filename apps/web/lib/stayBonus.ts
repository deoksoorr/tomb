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

/**
 * 11/16 출석·접속 갈래 칭호(머무르기 보상 +): 구간별 보너스 × (1 + bonus)를 1P 단위로 반올림.
 * 하루 상한(STAY_BONUS_DAILY_MAX = 칭호 없는 7구간 합)은 그대로라 칭호가 있으면 상한에 더 일찍 닿을 뿐 하루에 더 받지는 않는다
 * (저장소 credit이 항목 하루 상한에서 자른다 — accounts-redis STAY_BONUS_LUA · MemoryAccounts.claimStayBonus)
 */
export function stayBonusAmounts(bonus = 0): number[] {
  return bonus > 0 ? STAY_BONUS_AMOUNTS.map((n) => Math.round(n * (1 + bonus))) : [...STAY_BONUS_AMOUNTS];
}

/**
 * 11/17 지난주 포인트왕 혜택 (화면 표시용 — 서버는 lib/champPerks로 같은 계산): m100 = 구간 값에 곱하는 배수 (100 = 1배, 150 = 1.5배, 구간마다 반올림),
 * cap = 하루 상한. 없으면 그대로
 */
export type StayBonusChamp = { m100: number; cap: number };

/** 받은 구간 수(claimed) 다음부터 upTo 구간까지의 보너스 합 (bonus = 칭호 머무르기 보상 비율, 하루 상한에서 자른다. champ = 포인트왕 배수·상한) */
export function stayBonusSum(claimed: number, upTo: number, bonus = 0, champ?: StayBonusChamp): number {
  const a = stayBonusAmounts(bonus).map((n) => (champ ? Math.floor((n * champ.m100 + 50) / 100) : n));
  const cap = champ?.cap ?? STAY_BONUS_DAILY_MAX;
  const upToSum = (k: number) => Math.min(cap, a.slice(0, Math.max(0, k)).reduce((n, p) => n + p, 0));
  return Math.max(0, upToSum(upTo) - upToSum(claimed));
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

/** bonus = 11/16 단 칭호의 머무르기 보상 비율, champ = 11/17 포인트왕 배수·상한 (화면 표시용 — 서버가 같은 규칙으로 준다) */
export function stayBonusState(stayTicks: number, claimed: number, bonus = 0, champ?: StayBonusChamp): StayBonusState {
  const tiers = stayBonusTiers(stayTicks);
  const from = Math.min(Math.max(0, claimed), tiers);
  const max = STAY_BONUS_AMOUNTS.length;
  // 11/16 칭호로 하루 상한에 먼저 닿았으면 남은 구간은 0P라 받을 것도 끝난 것으로
  const full = (bonus > 0 || !!champ) && stayBonusSum(0, claimed, bonus, champ) >= (champ?.cap ?? STAY_BONUS_DAILY_MAX);
  return {
    count: full ? 0 : tiers - from,
    points: full ? 0 : stayBonusSum(from, tiers, bonus, champ),
    done: claimed >= max || full,
    ticksToNext: tiers >= max ? null : (tiers + 1) * STAY_BONUS_EVERY_TICKS - stayTicks,
  };
}
