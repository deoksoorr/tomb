import { NextResponse } from "next/server";
import { z } from "zod";
import { isBot, kstHour } from "@/lib/analytics";
import { kstDayAgo } from "@/lib/analyticsReport";
import { getAnalytics } from "@/lib/analyticsService";
import { handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { readBody } from "@/lib/validate";

/** 한 번에 받는 체류 시간 상한 (화면이 켜진 시간만 센다, 그 이상은 잘못 잰 값으로 본다) */
const STAY_MAX_SEC = 6 * 3_600;
const StaySchema = z.object({ sec: z.number().int().min(1).max(STAY_MAX_SEC) });

/**
 * 47번 체류 시간 `{ sec }`: 화면이 보이던 시간을 숨겨질 때·나갈 때·5분마다 sendBeacon으로 보낸다.
 * 그날 머문 초 합에 더하고, 평균 체류 = 합 ÷ 방문 수. 누구의 시간인지는 남기지 않는다
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
  const now = Date.now();
  await getAnalytics().stay(kstDayAgo(now, 0), kstHour(now), sec);
  return res;
});
