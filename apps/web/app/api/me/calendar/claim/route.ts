import { attendLeftText } from "@/lib/attendStay";
import { ATTEND_STAY_TICKS, daysInMonth, STAY_TICK_MINUTES } from "@/lib/calendar";
import { calendarOf, grantAttendTiers } from "@/lib/calendarView";
import { serverNow } from "@/lib/devClock";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, kstYesterday, loadMe } from "@/lib/store/accounts";
import type { CalendarClaimResponse } from "@/lib/types";

/**
 * 10번 출석 달력: 오늘 칸 받기 (하루 1번 — 새벽 5시에 바뀌는 게임 날짜, 원자적).
 * 조건: 오늘 머무르기 기록이 ATTEND_STAY_TICKS번(× 10분) 이상 — 서버가 받아 준 /api/me/presence 기록으로만 판정한다.
 * 보상: 출석 10P, 연속 7일째마다 +30P, 그달 모든 날을 찍으면 한 달 개근 +200P (lib/economy.ts EARN_RULES).
 * 같은 IP에서 하루에 포인트를 받는 계정 수는 ATTEND_ACCOUNTS_PER_IP개까지 (넘으면 도장만).
 * 출석 구간 코디: 그달 도장 수가 3·7·14·21·28일에 닿으면 그 구간 꾸미기 (lib/attendTiers.ts, 구간마다 한 번)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("calendar", req, visitorId);
  const accounts = getAccounts();
  const now = serverNow(visitorId);
  const day = kstDay(now);
  const month = day.slice(0, 6);
  const r = await accounts.claimAttend(visitorId, ipHash(req), day, kstYesterday(now), daysInMonth(month), ATTEND_STAY_TICKS);
  if (!r.ok && r.reason === "already") throw new HttpError(409, "ALREADY", "오늘 출석 도장은 이미 찍었어요.");
  if (!r.ok) throw new HttpError(409, "NOT_YET", `${attendLeftText(r.stayTicks * STAY_TICK_MINUTES)}.`);
  const tierRewards = await grantAttendTiers(accounts, visitorId, month, now);
  const [calendar, me] = await Promise.all([calendarOf(accounts, visitorId, month, now), loadMe(accounts, visitorId, now)]);
  return json<CalendarClaimResponse>({ calendar, me, earned: r.earned, tierRewards });
});
