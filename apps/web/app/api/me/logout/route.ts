import { NextResponse } from "next/server";
import { handler } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

/** 로그아웃: 세션 쿠키를 지운다 (204). 다음 방문은 새 계정이고, 이 계정에는 개인 코드로만 다시 들어올 수 있다 */
export const POST = handler(async () => {
  const res = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  clearSessionCookie(res);
  return res;
});
