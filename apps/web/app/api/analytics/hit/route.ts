import { nanoid } from "nanoid";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isBot } from "@/lib/analytics";
import { recordHit, runAfter, sampleConcurrency } from "@/lib/analyticsService";
import { env } from "@/lib/env";
import { handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { readBody } from "@/lib/validate";

/** 방문 쿠키: 무작위 값 하나 (재방문 판정·고유 방문자 수). 서버는 이 값을 저장하지 않고 해시를 HLL에만 넣는다 */
const VISIT_COOKIE = "tav";
const ONE_YEAR_SEC = 365 * 86_400;
const VISIT_RE = /^[A-Za-z0-9_-]{16,32}$/;

const short = z.string().max(300).nullish();
const HitSchema = z.object({
  ref: short,
  path: z.string().max(200).nullish(),
  grave: z.boolean().optional(),
  utm: z.object({ source: short, medium: short, campaign: short }).partial().optional(),
});

/**
 * 47번 방문 기록 (브라우저 세션마다 한 번, components/VisitTracker). 리퍼러는 도메인·분류로만, 경로는 모양으로만 남긴다.
 * 로봇·한도 초과는 조용히 버린다 (204). 응답 뒤에 동시 접속 표본도 한 번 찍는다 (1분 간격)
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
  const body = await readBody(req, HitSchema);
  const prev = req.cookies.get(VISIT_COOKIE)?.value;
  const cookie = prev && VISIT_RE.test(prev) ? prev : nanoid(21);
  await recordHit(req, body, cookie, cookie !== prev);
  res.cookies.set(VISIT_COOKIE, cookie, { httpOnly: true, sameSite: "lax", secure: env.isProd(), path: "/", maxAge: ONE_YEAR_SEC });
  runAfter(() => sampleConcurrency());
  return res;
});
