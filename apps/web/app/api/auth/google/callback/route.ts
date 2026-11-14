import { NextResponse } from "next/server";
import { findBan } from "@/lib/ban";
import { googleLogin, linkGoogle } from "@/lib/googleAccount";
import {
  clearStateCookie,
  exchangeCode,
  GoogleAuthError,
  googleConfig,
  openState,
  resultUrl,
  setPendingCookie,
  STATE_COOKIE,
  subHash,
  verifyIdToken,
} from "@/lib/googleAuth";
import type { GoogleResult } from "@/lib/googleResult";
import { clientIp, handler, HttpError } from "@/lib/http";
import { getVisitorId, setSessionCookie } from "@/lib/session";

/**
 * 구글 동의 화면에서 돌아오는 곳 `?code&state` (또는 `?error`).
 * 상태 쿠키(서명·만료·state 일치) → 인가 코드 + PKCE로 id_token 교환 → id_token 검증 → sub를 해시로만 바꿔 쓴다.
 * 결과는 언제나 고정 주소의 첫 화면 `/?google=결과`로 돌려보낸다 (상태 쿠키는 한 번 쓰고 지운다)
 */
export const GET = handler(async (req) => {
  const cfg = googleConfig();
  if (!cfg) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const done = (r: GoogleResult) => {
    const res = NextResponse.redirect(resultUrl(r), { status: 302, headers: { "Cache-Control": "no-store" } });
    clearStateCookie(res);
    return res;
  };

  const sp = req.nextUrl.searchParams;
  const st = openState(req.cookies.get(STATE_COOKIE)?.value, sp.get("state"));
  if (!st) return done("error");
  const err = sp.get("error");
  if (err) return done(err === "access_denied" ? "cancel" : "error");
  const code = sp.get("code");
  if (!code || code.length > 2048) return done("error");

  let hash: string;
  try {
    const idToken = await exchangeCode(cfg, code, st.verifier);
    hash = subHash(await verifyIdToken(cfg, idToken, st.nonce), cfg.mock);
  } catch (e) {
    if (!(e instanceof GoogleAuthError)) throw e;
    console.error("[google] 확인 실패", e.message);
    return done("error");
  }

  const now = Date.now();
  if (st.mode === "link") {
    // 동의 화면에 다녀오는 사이 이 기기 계정이 바뀌었으면 연결하지 않는다
    const visitorId = await getVisitorId(req);
    if (!visitorId || visitorId !== st.accountId) return done("nosession");
    if (await findBan(visitorId, clientIp(req), { fresh: true, now })) return done("banned");
    const r = await linkGoogle(visitorId, hash, now);
    return done(r === "ok" ? "linked" : r);
  }

  const r = await googleLogin(req, hash, now);
  if (r.kind === "banned") return done("banned");
  if (r.kind === "new") {
    const res = done("new");
    setPendingCookie(res, hash);
    return res;
  }
  const res = done("login");
  await setSessionCookie(res, r.accountId);
  return res;
});
