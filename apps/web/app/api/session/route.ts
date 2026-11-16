import { recordEvent } from "@/lib/analyticsService";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { getVisitorId, newVisitorId, setSessionCookie } from "@/lib/session";
import type { SessionResponse } from "@/lib/types";
import { recordSignals, setDeviceCookie } from "@/lib/sameUser";
import { readBody, SessionSchema } from "@/lib/validate";

/**
 * 방문자(=계정) 쿠키 발급 `{ fresh? }`. 이미 유효한 쿠키가 있으면 같은 id로 만료만 1년 연장한다.
 * fresh면 기존 쿠키를 무시하고 새 계정으로 시작한다 ("새로 시작").
 */
export const POST = handler(async (req) => {
  await rateLimit("session", req);
  const { fresh } = await readBody(req, SessionSchema);
  const known = !fresh && (await getVisitorId(req));
  const visitorId = known || newVisitorId();
  // 47번: 새 계정(= 새 방문자 쿠키)이 생긴 날을 신규 가입으로 센다
  if (!known) await recordEvent("signup");
  const res = json<SessionResponse>({ visitorId });
  await setSessionCookie(res, visitorId);
  // 같은 사람 판정용 기기 표시 쿠키 (계정 쿠키와 따로라 「새로 시작」에도 남는다)와 이 계정의 기기·브라우저 환경·대역 해시
  await recordSignals(req, visitorId, Date.now(), setDeviceCookie(req, res));
  return res;
});
