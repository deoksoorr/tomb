import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getErrors } from "./store";
import { kstDay } from "./store/accounts";
import type { ErrorSample } from "./store/errors";

/** 같은 종류·메시지·스택 첫 두 줄이면 같은 오류로 묶는다 */
export function errorHash(s: Pick<ErrorSample, "kind" | "message" | "stack">): string {
  const top = (s.stack ?? "").split("\n").slice(0, 2).join("\n");
  return createHash("sha256").update(`${s.kind}|${s.message}|${top}`).digest("hex").slice(0, 16);
}

export async function recordError(sample: ErrorSample, now = Date.now()): Promise<void> {
  await getErrors().record(kstDay(now), errorHash(sample), sample, now);
}

/** API handler의 500을 같은 저장소에 남긴다 (기록 실패는 조용히 무시) */
export async function recordServerError(req: NextRequest, e: unknown): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e));
  await recordError({
    kind: "api",
    source: "server",
    message: `${req.method} ${req.nextUrl.pathname}: ${err.message}`.slice(0, 500),
    stack: err.stack?.slice(0, 4000),
    url: req.nextUrl.pathname,
  }).catch(() => {});
}
