import type { ErrorReport } from "@/lib/types";

// 클라이언트 오류를 운영자에게 알린다 (POST /api/errors). 같은 메시지는 세션(탭)당 한 번, 전체로 분당 5건까지.
// api.ts의 request가 이 모듈을 부르므로 여기서는 api.ts를 쓰지 않고 fetch를 직접 쓴다.

const PER_MINUTE = 5;
const MESSAGE_MAX = 500;
const STACK_MAX = 4000;

/** 보낼지 판단 (순수): 처음 보는 메시지이고 최근 1분 안에 보낸 수가 한도 밑일 때만 */
export function createErrorGate(perMinute = PER_MINUTE) {
  const seen = new Set<string>();
  let sent: number[] = [];
  return (message: string, now: number): boolean => {
    if (seen.has(message)) return false;
    sent = sent.filter((t) => now - t < 60_000);
    if (sent.length >= perMinute) return false;
    seen.add(message);
    sent.push(now);
    return true;
  };
}

const gate = createErrorGate();

export function reportClientError(kind: ErrorReport["kind"], error: unknown): void {
  if (typeof window === "undefined") return;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MESSAGE_MAX) || "(빈 메시지)";
  if (!gate(`${kind}:${message}`, Date.now())) return;
  const report: ErrorReport = {
    kind,
    message,
    url: window.location.href,
    ua: navigator.userAgent,
    ...(error instanceof Error && error.stack && { stack: error.stack.slice(0, STACK_MAX) }),
  };
  void fetch("/api/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => {
    // 보고가 실패해도 할 수 있는 일이 없다
  });
}

/** 앱 전체에 한 번: 잡히지 않은 오류·거부된 프로미스를 보고한다 */
export function installErrorReporting(): () => void {
  const onError = (e: ErrorEvent) => reportClientError("error", e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportClientError("unhandledrejection", e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
