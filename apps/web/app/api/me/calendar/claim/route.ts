import { attendLeftText } from "@/lib/attendStay";
import { ATTEND_GIFT, ATTEND_STAY_TICKS, daysInMonth, MONTHLY_GIFT, STAY_TICK_MINUTES, STREAK_EVERY, STREAK_GIFT } from "@/lib/calendar";
import { calendarOf, grantAttendTiers } from "@/lib/calendarView";
import { serverNow } from "@/lib/devClock";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, requireVisitor } from "@/lib/session";
import { isStaff } from "@/lib/staff";
import { getAccounts } from "@/lib/store";
import { kstDay, kstYesterday, loadMe } from "@/lib/store/accounts";
import { bundleText } from "@/lib/rewardText";
import { grantRpgBundle, type RpgBundle } from "@/lib/rpgGift";
import type { CalendarClaimResponse } from "@/lib/types";

/**
 * 10번 출석 달력: 오늘 칸 받기 (하루 1번 — 새벽 5시에 바뀌는 게임 날짜, 원자적).
 * 조건: 오늘 머무르기 기록이 ATTEND_STAY_TICKS번(× 10분) 이상 — 서버가 받아 준 /api/me/presence 기록으로만 판정한다.
 * 보상(11/19 포인트 대신 사냥 아이템, lib/calendar.ts): 매일 커피 1개, 연속 7일째마다 보호 문서 1장, 그달 모든 날을 찍으면 결재 서류 20장.
 * 출석 구간 코디: 그달 도장 수가 3·7·14·21·28일에 닿으면 그 구간 꾸미기 (lib/attendTiers.ts, 구간마다 한 번)
 * 운영자 계정은 출석 도장(포인트·7일 연속·한 달 개근·구간 코디)을 받지 않는다 → 403
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("calendar", req, visitorId);
  if (await isStaff(visitorId)) throw new HttpError(403, "STAFF_NO_REWARD", "운영자 계정은 출석 도장을 받지 않아요.");
  const accounts = getAccounts();
  const now = serverNow(visitorId);
  const day = kstDay(now);
  const month = day.slice(0, 6);
  const r = await accounts.claimAttend(visitorId, ipHash(req), day, kstYesterday(now), daysInMonth(month), ATTEND_STAY_TICKS);
  if (!r.ok && r.reason === "already") throw new HttpError(409, "ALREADY", "오늘 출석 도장은 이미 찍었어요.");
  if (!r.ok) throw new HttpError(409, "NOT_YET", `${attendLeftText(r.stayTicks * STAY_TICK_MINUTES)}.`);
  const tierRewards = await grantAttendTiers(accounts, visitorId, month, now);
  const [calendar, me] = await Promise.all([calendarOf(accounts, visitorId, month, now), loadMe(accounts, visitorId, now)]);
  // 11/19 사냥 아이템: 그달 마지막 칸을 채운 도장이면 한 달 개근도 (그달에 한 번뿐 — 다 찍은 뒤엔 더 찍을 칸이 없다)
  const streak = r.streak % STREAK_EVERY === 0;
  const monthly = calendar.days.filter((d) => d.state === "stamped").length >= daysInMonth(month);
  const bundle: RpgBundle = {
    potions: ATTEND_GIFT.potions,
    mats: { ...(streak ? STREAK_GIFT.mats : {}), ...(monthly ? MONTHLY_GIFT.mats : {}) },
  };
  await grantRpgBundle(visitorId, bundle).catch((e) => console.error("[calendar] 출석 아이템 넣기 실패", visitorId, e));
  const gifts = { daily: bundleText(ATTEND_GIFT), streak: streak ? bundleText(STREAK_GIFT) : null, monthly: monthly ? bundleText(MONTHLY_GIFT) : null };
  return json<CalendarClaimResponse>({ calendar, me, earned: r.earned, gifts, tierRewards });
});
