import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { bumpSessionGen, requireVisitor, setSessionCookie } from "@/lib/session";

/**
 * 11/18 「다른 기기에서 모두 로그아웃」: 세션 세대를 올려 이 계정의 다른 기기 쿠키를 모두 끊는다.
 * 지금 기기는 새 세대 쿠키로 남는다. 다른 서버 인스턴스는 SESSION_GEN_CACHE_MS(1분) 안에 끊긴다
 */
export const POST = handler(async (req) => {
  await rateLimit("shop", req);
  const visitorId = await requireVisitor(req);
  const res = json<{ ok: true }>({ ok: true });
  await setSessionCookie(res, visitorId, await bumpSessionGen(visitorId));
  return res;
});
