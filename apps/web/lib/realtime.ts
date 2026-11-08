import type { LobbyInfo } from "@tomb/protocol";

// 실시간 서버 주소. 로컬 기본값은 wrangler dev(8787).
export const REALTIME_HTTP_URL = (process.env.NEXT_PUBLIC_REALTIME_URL || "http://localhost:8787").replace(/\/$/, "");
export const REALTIME_WS_URL = REALTIME_HTTP_URL.replace(/^http/, "ws");

/** GET {realtime}/lobby. 실패하면 null */
export async function fetchLobby(signal?: AbortSignal): Promise<LobbyInfo | null> {
  try {
    const res = await fetch(`${REALTIME_HTTP_URL}/lobby`, { signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as LobbyInfo;
  } catch {
    return null;
  }
}
