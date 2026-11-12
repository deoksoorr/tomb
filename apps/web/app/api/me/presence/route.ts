import { handler, json } from "@/lib/http";
import { serverNow } from "@/lib/devClock";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { kstDay, loadMe } from "@/lib/store/accounts";
import type { PresenceResponse } from "@/lib/types";

/**
 * 머무르기 포인트 (화면이 켜져 있는 동안 PRESENCE_INTERVAL_MS마다). 직전 지급 후 9.5분이 지났을 때만 +5, 하루 60까지.
 * 실시간 서버를 거치지 않는 Vercel 호출이라 채널 DO를 깨우지 않는다. 너무 일찍 부르면 earned 0.
 * 10번: 받아 준 기록은 포인트 한도와 상관없이 "오늘 머문 시간"(10분씩)으로 쌓여 출석 달력 도장 조건이 된다.
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("presence", req, visitorId);
  const accounts = getAccounts();
  const now = serverNow(visitorId); // 운영은 Date.now() (개발 QA만 시계를 앞당길 수 있다)
  const earned = (await accounts.presence(visitorId, kstDay(now), now)) ?? 0;
  return json<PresenceResponse>({ earned, me: await loadMe(accounts, visitorId, now) });
});
