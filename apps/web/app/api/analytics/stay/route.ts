import { NextResponse } from "next/server";
import { z } from "zod";
import { isBot, kstHour } from "@/lib/analytics";
import { kstDayAgo } from "@/lib/analyticsReport";
import { getAnalytics, visitorHash } from "@/lib/analyticsService";
import { handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { readBody } from "@/lib/validate";

/** 한 번에 받는 체류 시간 상한 (화면이 켜진 시간만 센다, 그 이상은 잘못 잰 값으로 본다) */
const STAY_MAX_SEC = 6 * 3_600;
const StaySchema = z.object({ sec: z.number().int().min(1).max(STAY_MAX_SEC) });

/** 방문 쿠키 (app/api/analytics/hit가 굽는다) */
const VISIT_COOKIE = "tav";
const VISIT_RE = /^[A-Za-z0-9_-]{16,32}$/;

/**
 * 47번 체류 시간 `{ sec }`: 화면이 보이던 시간을 숨겨질 때·나갈 때 sendBeacon으로 보낸다.
 * 그날 머문 초 합에 더하고, 평균 체류 = 합 ÷ 방문 수. 누구의 시간인지는 남기지 않는다.
 * 11/18 방문 쿠키가 있어야 받고, 쿠키(HMAC)마다 하루 24시간까지만 더한다 (같은 IP 여럿은 쿠키가 달라 서로 막지 않는다)
 */
export const POST = handler(async (req) => {
  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (isBot(req.headers.get("user-agent"))) return res;
  try {
    await rateLimit("visit", req);
  } catch (e) {
    if (e instanceof HttpError && e.status === 429) return res;
    throw e;
  }
  const { sec } = await readBody(req, StaySchema);
  const cookie = req.cookies.get(VISIT_COOKIE)?.value;
  if (!cookie || !VISIT_RE.test(cookie)) return res;
  const now = Date.now();
  await getAnalytics().stay(kstDayAgo(now, 0), kstHour(now), sec, visitorHash(cookie));
  return res;
});
