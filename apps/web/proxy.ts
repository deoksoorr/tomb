import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/http";
import { isAdminIp } from "@/lib/ipAllow";

// 관리자 화면과 관리자 API는 허용한 IP에서만 연다. 그 밖에서는 존재 자체를 숨기려고
// 없는 경로로 rewrite해서 사이트의 일반 404를 그대로 보여 준다 (403이면 "여기 뭔가 있다"는 걸 알려 준다).
// IP는 Vercel이 덮어쓰는 x-forwarded-for를 믿는다. IP를 통과해도 ADMIN_KEY 인증은 따로 필요하다.

const HIDDEN_PATH = "/404";

export function proxy(req: NextRequest) {
  if (!isAdminIp(clientIp(req), env.adminAllowedIps(), env.isProd())) {
    return NextResponse.rewrite(new URL(HIDDEN_PATH, req.url));
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
