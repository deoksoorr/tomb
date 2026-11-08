import { handler, json } from "@/lib/http";
import { getVisitorId, newVisitorId, setSessionCookie } from "@/lib/session";
import type { SessionResponse } from "@/lib/types";

/** 방문자 쿠키 발급. 이미 유효한 쿠키가 있으면 같은 id로 만료만 1년 연장한다 */
export const POST = handler(async (req) => {
  const visitorId = (await getVisitorId(req)) ?? newVisitorId();
  const res = json<SessionResponse>({ visitorId });
  await setSessionCookie(res, visitorId);
  return res;
});
