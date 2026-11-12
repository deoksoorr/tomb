import { isViewableMonth } from "@/lib/calendar";
import { calendarOf } from "@/lib/calendarView";
import { serverNow } from "@/lib/devClock";
import { handler, HttpError, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay } from "@/lib/store/accounts";
import type { CalendarResponse } from "@/lib/types";

/**
 * 10번 출석 달력 `?month=YYYYMM` (없으면 이번 달). 이번 달과 지난 두 달만 볼 수 있다.
 * 처음 부르면 달력 개편 전 출석(마지막 출석일·연속 일수)이 도장으로 옮겨진다
 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const now = serverNow(visitorId);
  const current = kstDay(now).slice(0, 6);
  const month = req.nextUrl.searchParams.get("month") || current;
  if (!isViewableMonth(month, current)) throw new HttpError(400, "INVALID_INPUT", "이번 달과 지난 두 달만 볼 수 있어요.");
  return json<CalendarResponse>(await calendarOf(getAccounts(), visitorId, month, now));
});
