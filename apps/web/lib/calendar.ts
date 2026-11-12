import { earnRule } from "./economy";
import type { CalendarResponse } from "./types";

// 10번 출석 달력 (KST 기준). 입장 때 자동으로 주던 출석을 "그날 1시간 머문 뒤 달력의 오늘 칸을 눌러 받기"로 바꿨다.
//  - 머문 시간 = 그날 서버가 받아 준 머무르기 기록 수 × 10분 (/api/me/presence, PRESENCE_MIN_GAP_MS 간격)
//  - 받은 날은 도장, 못 받고 지난 날은 회색. 7일 연속마다 보너스, 그달 모든 날을 받으면 한 달 개근 보상
//  - 날짜 문자열: 하루 YYYYMMDD, 달 YYYYMM, 달 안의 날 DD (계정 저장소 키와 같다)

/** 머무르기 기록 1번 = 10분 (클라이언트 PRESENCE_INTERVAL_MS) */
export const STAY_TICK_MINUTES = 10;
/** 출석 도장을 받으려면 그날 머물러야 하는 시간 */
export const ATTEND_STAY_MINUTES = 60;
export const ATTEND_STAY_TICKS = ATTEND_STAY_MINUTES / STAY_TICK_MINUTES;
/** 달력 기록 보관 (지난달·지지난달까지 볼 수 있게) */
export const CALENDAR_TTL_SEC = 100 * 86_400;
/** 볼 수 있는 지난달 수 (이번 달 포함 3개월) */
export const CALENDAR_BACK_MONTHS = 2;

/** 보상 숫자 (lib/economy.ts EARN_RULES에서 그대로 가져온다) */
export const calendarRewards = () => ({
  daily: earnRule("attend").points,
  streak: earnRule("streak").points,
  streakEvery: 7,
  monthly: earnRule("monthly").points,
});

const DAY_MS = 86_400_000;
const utcOf = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(4, 6)) - 1, Number(day.slice(6, 8)));
const ymdOf = (t: number) => new Date(t).toISOString().slice(0, 10).replaceAll("-", "");

/** 그달의 날 수 (month = YYYYMM) */
export function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4, 6)), 0)).getUTCDate();
}

/** 그달 1일의 요일 (0 = 일요일) */
export function firstWeekday(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4, 6)) - 1, 1)).getUTCDay();
}

/** month에서 delta달 옮긴 달 (YYYYMM) */
export function shiftMonth(month: string, delta: number): string {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4, 6)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 볼 수 있는 달인지 (이번 달 ~ CALENDAR_BACK_MONTHS달 전) */
export function isViewableMonth(month: string, current: string): boolean {
  if (!/^\d{6}$/.test(month)) return false;
  for (let i = 0; i <= CALENDAR_BACK_MONTHS; i++) if (shiftMonth(current, -i) === month) return true;
  return false;
}

/**
 * 달력 개편 전 기록 이어 받기: 예전에는 계정에 마지막 출석일·연속 일수만 있었다.
 * 연속 일수만큼 거슬러 올라간 날들(최대 62일)을 출석한 날로 본다. 그보다 전은 알 수 없어 비워 둔다
 */
export function legacyAttendDays(lastAttend: string | null, streak: number): string[] {
  if (!lastAttend || !/^\d{8}$/.test(lastAttend) || !(streak > 0)) return [];
  const end = utcOf(lastAttend);
  return Array.from({ length: Math.min(streak, 62) }, (_, i) => ymdOf(end - i * DAY_MS));
}

/** 저장소가 돌려주는 한 달 기록 */
export type CalendarMonthRecord = {
  /** DD → 그날 받은 포인트 (도장만 있고 포인트가 없으면 0: 옛 출석·같은 IP 한도) */
  days: Record<string, number>;
  /** 한 달 개근 보상을 받았으면 그 포인트 */
  monthBonus: number | null;
};

/** 오늘 칸 받기 결과 */
export type AttendClaim =
  | { ok: true; earned: { daily: number; streak: number; monthly: number }; streak: number }
  | { ok: false; reason: "already" }
  | { ok: false; reason: "stay"; stayTicks: number };

/** 한 달 달력 화면 데이터 (저장소 기록 + 계정 상태 → 칸마다 상태) */
export function buildCalendar(
  month: string,
  today: string,
  rec: CalendarMonthRecord,
  acct: { lastAttend: string | null; streak: number; stayTicks: number },
): CalendarResponse {
  const todayMonth = today.slice(0, 6);
  const todayDd = Number(today.slice(6));
  const claimedToday = acct.lastAttend === today;
  const days = Array.from({ length: daysInMonth(month) }, (_, i): CalendarResponse["days"][number] => {
    const day = i + 1;
    const dd = String(day).padStart(2, "0");
    const has = Object.hasOwn(rec.days, dd);
    const points = has ? rec.days[dd] : 0;
    // 지난달은 모두 지난 날, 이번 달은 오늘 기준
    const cmp = month < todayMonth ? -1 : month > todayMonth ? 1 : Math.sign(day - todayDd);
    if (cmp < 0) return { day, state: has ? "stamped" : "missed", points };
    if (cmp > 0) return { day, state: "future", points: 0 };
    return { day, state: has || claimedToday ? "stamped" : "today", points };
  });
  const stayMinutes = acct.stayTicks * STAY_TICK_MINUTES;
  return {
    month,
    today,
    firstWeekday: firstWeekday(month),
    days,
    claimable: !claimedToday && stayMinutes >= ATTEND_STAY_MINUTES,
    stayMinutes,
    needMinutes: ATTEND_STAY_MINUTES,
    // 어제나 오늘 받지 않았으면 연속이 끊긴 상태
    streak: acct.lastAttend && acct.lastAttend >= ymdOf(utcOf(today) - DAY_MS) ? acct.streak : 0,
    monthBonus: rec.monthBonus,
    rewards: calendarRewards(),
  };
}
