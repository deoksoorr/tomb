import { request } from "../api";
import type { GhostBuyResult, GhostStatus } from "./ghostService";
import type { GhostCall } from "./ghostShip";

// 11/17 브라우저 → 유령선 장터 API (실패하면 서버의 한국어 메시지를 담은 ApiRequestError — lib/api request)

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const ghostApi = {
  /** 이번 주 품목 · 내가 낼 값 · 산 것 · 열려 있는지 */
  status: () => request<GhostStatus>("/api/sea/ghost"),
  /** 사기 (key = "cosmetic:id" | "furniture:id") */
  buy: (key: string) => request<GhostBuyResult>("/api/sea/ghost", post({ key })),
  /** 운영자 시험: 부르기 · 보내기 · 시간표대로 */
  call: (call: GhostCall) => request<GhostStatus>("/api/sea/ghost/call", post({ call })),
};
