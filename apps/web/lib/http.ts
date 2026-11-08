import { NextResponse, type NextRequest } from "next/server";
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

/**
 * 라우트 핸들러 래퍼: HttpError → 에러 응답, 그 밖의 예외 → 로그 + 500.
 * 동적 경로는 `handler<{ id: string }>(...)`로 params 타입을 준다.
 */
export function handler<P = unknown>(fn: (req: NextRequest, params: P) => Promise<Response>) {
  return async (req: NextRequest, ctx?: Ctx<P>): Promise<Response> => {
    try {
      return await fn(req, (await ctx?.params) as P);
    } catch (e) {
      if (e instanceof HttpError) return apiError(e.status, e.code, e.message, e.headers);
      console.error(`[api] ${req.method} ${req.nextUrl.pathname}`, e);
      return apiError(500, "INTERNAL", "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요.");
    }
  };
}

/** Vercel은 x-forwarded-for를 직접 덮어쓰므로 첫 값을 신뢰한다 */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "unknown";
}
