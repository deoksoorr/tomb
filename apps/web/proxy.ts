import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/http";
import { isAdminIp } from "@/lib/ipAllow";
import { maintBypass, maintOpenPath, maintPageHtml, readMaint, retryAfterSec } from "@/lib/maintenance";

// 1) 관리자 화면과 관리자 API는 허용한 IP에서만 연다. 그 밖에서는 존재 자체를 숨기려고
//    없는 경로로 rewrite해서 사이트의 일반 404를 그대로 보여 준다 (403이면 "여기 뭔가 있다"는 걸 알려 준다).
//    IP는 Vercel이 덮어쓰는 x-forwarded-for를 믿는다. IP를 통과해도 ADMIN_KEY 인증은 따로 필요하다.
// 2) 11/26 점검 모드: 점검 중이면 사이트 페이지 전체(첫 화면·개발자 노트·안내 — API는 matcher에서 뺌)를 503 + Retry-After로 막는다 (검색 순위 보호).
//    관리자 화면·관리자 API·점검 상태 API·서버끼리 경로·정적 파일은 열어 둔다 (안 그러면 점검을 못 끈다).
//    관리자 쿠키·운영자 계정은 통과. 상태는 실시간 서버 값을 약 15초 기억해 읽는다 (lib/maintenance — Redis 안 씀)

const HIDDEN_PATH = "/404";

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/admin" || path.startsWith("/admin/") || path === "/api/admin" || path.startsWith("/api/admin/")) {
    if (!isAdminIp(clientIp(req), env.adminAllowedIps(), env.isProd())) {
      return NextResponse.rewrite(new URL(HIDDEN_PATH, req.url));
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }
  if (maintOpenPath(path)) return NextResponse.next();
  const state = await readMaint();
  if (!state.on || (await maintBypass(req.cookies, state))) return NextResponse.next();
  const headers = { "Retry-After": String(retryAfterSec(state)), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (path.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "MAINTENANCE", message: "서버 점검 중이에요." }, maint: { msg: state.msg, until: state.until } },
      { status: 503, headers },
    );
  }
  return new NextResponse(maintPageHtml(state), { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}

export const config = {
  // 정적 파일(_next/static·이미지·소리·글꼴)은 부르지 않는다 — 요청마다 도는 일을 줄인다.
  // 11/26 API(/api/admin 빼고)도 부르지 않는다: 게임 중 API 호출마다 미들웨어가 돌면 Vercel 호출이 크게 는다.
  // 점검 중 게임은 실시간 서버가 끊고 화면(MaintenanceWatcher)이 덮으니 페이지만 막아도 충분하다
  matcher: ["/admin/:path*", "/api/admin/:path*", "/((?!api/|_next/static|_next/image|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|wav|m4a|woff2?|ttf|otf|css|js|map|txt|xml|webmanifest)$).*)"],
};
