import { MOVE_BATCH_MAX, type MoveWire } from "./moveLog";

// 11/27 화면 → 서버 자리 옮김 기록 (lib/moveLog · POST /api/me/moves). 잠깐 모았다가 한 번에, 실패해도 조용히 (기록일 뿐이다).
// 페이지가 내려갈 때(pagehide)는 keepalive로 남은 것을 보낸다.

const FLUSH_MS = 1_500;
let queue: MoveWire[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let hooked = false;

function flush(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const rows = queue.splice(0, MOVE_BATCH_MAX);
  if (!rows.length || typeof fetch !== "function") return;
  void fetch("/api/me/moves", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rows }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
  if (queue.length) timer = setTimeout(flush, FLUSH_MS);
}

/** 한 줄 남긴다 (시각은 지금) */
export function reportMove(row: Omit<MoveWire, "at">): void {
  if (typeof window === "undefined") return;
  if (!hooked) {
    hooked = true;
    window.addEventListener("pagehide", flush);
  }
  queue.push({ ...row, at: Date.now() });
  if (queue.length > MOVE_BATCH_MAX * 2) queue = queue.slice(-MOVE_BATCH_MAX * 2);
  timer ??= setTimeout(flush, FLUSH_MS);
}
