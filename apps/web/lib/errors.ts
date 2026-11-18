import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getErrors } from "./store";
import { kstDay } from "./store/accounts";
import { ERROR_GROUPS_PER_DAY, type ErrorSample } from "./store/errors";

/** 같은 종류·메시지·스택 첫 두 줄이면 같은 오류로 묶는다 */
export function errorHash(s: Pick<ErrorSample, "kind" | "message" | "stack">): string {
  const top = (s.stack ?? "").split("\n").slice(0, 2).join("\n");
  return createHash("sha256").update(`${s.kind}|${s.message}|${top}`).digest("hex").slice(0, 16);
}

export async function recordError(sample: ErrorSample, now = Date.now()): Promise<void> {
  // 11/18 브라우저가 보낸 것은 하루 종류 상한과 짧은 스택으로 (서버 500은 그대로)
  const client = sample.source === "client";
  const s = client && sample.stack ? { ...sample, stack: sample.stack.slice(0, 2000) } : sample;
  await getErrors().record(kstDay(now), errorHash(s), s, now, client ? ERROR_GROUPS_PER_DAY : undefined);
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
