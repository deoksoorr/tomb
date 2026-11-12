import { buildCalendar } from "./calendar";
import type { AccountStore } from "./store/types";
import { kstDay } from "./store/accounts";
import type { CalendarResponse } from "./types";

/** 그 달 달력 (KST). 오늘·머문 시간은 now 기준 (라우트 공용) */
export async function calendarOf(accounts: AccountStore, visitorId: string, month: string, now: number): Promise<CalendarResponse> {
  const today = kstDay(now);
  const [rec, acct] = await Promise.all([accounts.attendCalendar(visitorId, month), accounts.get(visitorId, today, now)]);
  return buildCalendar(month, today, rec, acct);
}
