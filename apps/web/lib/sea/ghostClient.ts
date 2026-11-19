import { request } from "../api";
import type { GhostBuyResult, GhostCallState, GhostStatus } from "./ghostService";
import type { GhostCall } from "./ghostShip";

// 11/17 브라우저 → 유령선 장터 API (실패하면 서버의 한국어 메시지를 담은 ApiRequestError — lib/api request)

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

const chQuery = (ch: number | null) => (ch === null ? "" : `?ch=${ch}`);

export const ghostApi = {
  /** 이번 주 품목 · 내가 낼 값 · 산 것 · 열려 있는지 (ch = 지금 채널 — 운영자가 부른 것까지) */
  status: (ch: number | null) => request<GhostStatus>(`/api/sea/ghost${chQuery(ch)}`),
  /** 사기 (key = "cosmetic:id" | "furniture:id") */
  buy: (key: string, ch: number | null) => request<GhostBuyResult>("/api/sea/ghost", post(ch === null ? { key } : { key, ch })),
  /** 11/19 그 채널에 운영자가 부른 상태 (가벼운 GET, CDN 10초) · fresh = 캐시 건너뛰기 */
  callState: (ch: number, fresh = false) =>
    request<GhostCallState>(fresh ? `/api/sea/ghost/call?ch=${ch}&t=${Date.now()}` : `/api/sea/ghost/call?ch=${ch}`, fresh ? { cache: "no-store" } : undefined),
  /** 운영자: 그 채널에 부르기 · 보내기 · 시간표대로 */
  call: (call: GhostCall, ch: number) => request<GhostStatus>("/api/sea/ghost/call", post({ call, ch })),
};
