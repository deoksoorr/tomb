import { NextResponse } from "next/server";
import { findBan } from "@/lib/ban";
import { appOrigin, authorizeUrl, googleConfig, newOAuthState, resultUrl, setStateCookie } from "@/lib/googleAuth";
import { clientIp, handler, HttpError } from "@/lib/http";
import { getVisitorId } from "@/lib/session";

/**
 * 구글 동의 화면으로 보낸다 `?mode=login|link`.
 *  - login: 입구 화면 [구글로 시작하기]
 *  - link: 내 정보 [구글 계정 연결] (이 기기 계정이 있어야 한다 — 상태 쿠키에 계정 id를 묶어 돌아왔을 때 같은 계정인지 본다)
 * 구글 설정이 없으면 404. 다른 주소(www·vercel.app 등)로 열었으면 고정 주소로 한 번 옮긴 뒤 시작한다 (상태 쿠키가 돌아올 주소에 있어야 한다)
 */
export const GET = handler(async (req) => {
  const cfg = googleConfig();
  if (!cfg) throw new HttpError(404, "NOT_FOUND", "없는 경로예요.");
  const mode = req.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const origin = appOrigin();
  if (req.nextUrl.origin !== origin && !req.nextUrl.searchParams.has("hop"))
    return NextResponse.redirect(`${origin}/api/auth/google/start?mode=${mode}&hop=1`, { status: 302, headers: { "Cache-Control": "no-store" } });

  let accountId: string | undefined;
  if (mode === "link") {
    accountId = (await getVisitorId(req)) ?? undefined;
    if (!accountId) return NextResponse.redirect(resultUrl("nosession"), { status: 302, headers: { "Cache-Control": "no-store" } });
    if (await findBan(accountId, clientIp(req), { fresh: true }))
      return NextResponse.redirect(resultUrl("banned"), { status: 302, headers: { "Cache-Control": "no-store" } });
  }
  const state = newOAuthState(mode, accountId);
  const res = NextResponse.redirect(authorizeUrl(cfg, state), { status: 302, headers: { "Cache-Control": "no-store" } });
  setStateCookie(res, state);
  return res;
});
