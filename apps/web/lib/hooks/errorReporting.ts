import type { ErrorReport } from "@/lib/types";

// 클라이언트 오류를 운영자에게 알린다 (POST /api/errors). 같은 메시지는 세션(탭)당 한 번, 전체로 분당 5건까지.
// api.ts의 request가 이 모듈을 부르므로 여기서는 api.ts를 쓰지 않고 fetch를 직접 쓴다.
// 11/26 화면 오류·API 실패(서버 5xx·연결 실패)를 BATCH_MS 동안 모았다가 한 번에 보낸다 (페이지를 떠날 때는 바로). 로그인한 계정이면
// 서버가 그 계정의 접속 기록에도 한 줄씩 남긴다 (관리자 유저 활동 「접속 기록」)

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

/** 모아 보내는 시간 / 한 번에 보내는 최대 수 (서버 ErrorBatchSchema와 같다) */
const BATCH_MS = 3_000;
export const ERROR_BATCH_MAX = 5;
let queue: ErrorReport[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const reports = queue.slice(0, ERROR_BATCH_MAX);
  queue = [];
  const body = JSON.stringify(reports.length === 1 ? reports[0] : { reports });
  void fetch("/api/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // 보고가 실패해도 할 수 있는 일이 없다
  });
}

function enqueue(r: ErrorReport): void {
  queue.push(r);
  if (queue.length >= ERROR_BATCH_MAX) return flush();
  timer ??= setTimeout(flush, BATCH_MS);
}

// 11/18 우리 코드 탓이 아닌 오류는 보내지 않는다 (운영 오류 기록: 확장 프로그램 M_ID, 인앱 브라우저 iabjs postMessage, 출처를 알 수 없는 Script error)
const FOREIGN_STACK = /(chrome|moz|safari(-web)?)-extension:\/\/|iabjs:\/\/|webkit-masked-url:/;
// 11/26 ResizeObserver 반복 경고도 거른다 (한 프레임에 크기 알림을 다 못 보냈다는 브라우저 안내 — 화면은 다음 프레임에 맞춰진다)
const FOREIGN_MESSAGE = /^Script error\.?$|Java object is gone|^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

/** 우리 코드 밖(확장 프로그램·인앱 브라우저·다른 출처 스크립트)에서 난 오류인지 (순수) */
export function isForeignError(message: string, stack?: string): boolean {
  if (FOREIGN_MESSAGE.test(message.trim())) return true;
  return !!stack && FOREIGN_STACK.test(stack) && !stack.includes("/_next/");
}

/** 11/27 페이지를 떠나는 중(새로고침·닫기)인지 — 그때 끊기는 요청은 서버 탓이 아니라 남기지 않는다 (lib/api) */
let leaving = false;
export const pageLeaving = (): boolean => leaving;
const markLeaving = () => {
  leaving = true;
};
const markBack = () => {
  leaving = false;
};

export function reportClientError(kind: ErrorReport["kind"], error: unknown): void {
  if (typeof window === "undefined") return;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MESSAGE_MAX) || "(빈 메시지)";
  if (isForeignError(message, error instanceof Error ? error.stack : undefined)) return;
  if (!gate(`${kind}:${message}`, Date.now())) return;
  const report: ErrorReport = {
    kind,
    message,
    url: window.location.href,
    ua: navigator.userAgent,
    ...(error instanceof Error && error.stack && { stack: error.stack.slice(0, STACK_MAX) }),
  };
  enqueue(report);
}

/** 앱 전체에 한 번: 잡히지 않은 오류·거부된 프로미스를 보고한다 */
export function installErrorReporting(): () => void {
  const onError = (e: ErrorEvent) => reportClientError("error", e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => reportClientError("unhandledrejection", e.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", markLeaving);
  window.addEventListener("pagehide", markLeaving);
  window.addEventListener("pageshow", markBack);
  return () => {
    window.removeEventListener("beforeunload", markLeaving);
    window.removeEventListener("pagehide", markLeaving);
    window.removeEventListener("pageshow", markBack);
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", flush);
    flush();
  };
}
