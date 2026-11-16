import { NextResponse, type NextRequest } from "next/server";
import { routeLabel, withRedisRoute } from "./redisUsage";
import type { ApiError } from "./types";

/** 라우트 어디서든 던지면 handler()가 `{ error: { code, message } }` 응답으로 바꾼다 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export function apiError(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json<ApiError>(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

/** JSON 응답. 기본은 no-store (방문자별 상태가 섞이지 않게) */
export function json<T>(data: T, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json<T>(data, {
    status: init.status ?? 200,
    headers: { "Cache-Control": "no-store", ...init.headers },
  });
}

export const notFound = () => new HttpError(404, "NOT_FOUND", "묘비를 찾을 수 없어요.");

type Ctx<P> = { params: Promise<P> };

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 다른 사이트(다른 출처·같은 상위 도메인의 다른 하위 도메인 포함)에서 브라우저로 보낸 상태 변경 요청인가 (CSRF 방어).
 * 방문자 쿠키가 SameSite=Lax라 대부분 막히지만, 하위 도메인·오래된 브라우저·text/plain 폼까지 한 번 더 막는다.
 *  - Sec-Fetch-Site가 있으면(요즘 브라우저) same-origin·none만 받는다
 *  - 없으면 Origin이 있을 때 요청 Host와 같은지 본다 (Origin: null도 거절)
 *  - 둘 다 없으면(서버 간 호출·curl·테스트) 그대로 둔다 — 브라우저는 상태 변경 요청에 둘 중 하나를 꼭 붙인다
 */
export function isCrossSiteWrite(req: Pick<NextRequest, "method" | "headers">): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return false;
  const site = req.headers.get("sec-fetch-site")?.toLowerCase();
  if (site) return site !== "same-origin" && site !== "none";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0]?.trim().toLowerCase();
  try {
    return !host || new URL(origin).host.toLowerCase() !== host;
  } catch {
    return true;
  }
}

/**
 * 라우트 핸들러 래퍼: HttpError → 에러 응답, 그 밖의 예외 → 로그 + 500.
 * 동적 경로는 `handler<{ id: string }>(...)`로 params 타입을 준다.
 */
export function handler<P = unknown>(fn: (req: NextRequest, params: P) => Promise<Response>) {
  return (req: NextRequest, ctx?: Ctx<P>): Promise<Response> =>
    // Redis 명령 수를 라우트 이름으로 센다 (lib/redisUsage)
    withRedisRoute(routeLabel(req.method, req.nextUrl?.pathname ?? "?"), () => run(req, ctx));
  async function run(req: NextRequest, ctx?: Ctx<P>): Promise<Response> {
    if (isCrossSiteWrite(req)) return apiError(403, "CROSS_SITE", "다른 사이트에서 보낸 요청은 받을 수 없어요.");
    try {
      return await fn(req, (await ctx?.params) as P);
    } catch (e) {
      if (e instanceof HttpError) return apiError(e.status, e.code, e.message, e.headers);
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, e);
      // 오류 탭에 남긴다 (저장소 → http 순환을 피해 늦게 불러온다)
      await import("./errors").then((m) => m.recordServerError(req, e)).catch(() => {});
      return apiError(500, "INTERNAL", "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.");
    }
  }
}

/** Vercel은 x-forwarded-for를 직접 덮어쓰므로 첫 값을 신뢰한다 */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "unknown";
}
