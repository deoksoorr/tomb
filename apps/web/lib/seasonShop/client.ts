import { request } from "../api";
import type { SeasonKind } from "./schedule";
import type { SeasonBuyResult, SeasonStatus } from "./service";

// 11/19 브라우저 → 기간 한정 노점 API (실패하면 서버의 한국어 메시지를 담은 ApiRequestError — lib/api request)

export const seasonApi = {
  /** 판매 중·판매 예정 묶음 · 내가 낼 값 */
  status: (kind: SeasonKind) => request<SeasonStatus>(`/api/season-shop?kind=${kind}`, { cache: "no-store" }),
  /** 사기 (코디: day = 24시간 이용권 · perm = 영구) */
  buy: (kind: SeasonKind, id: string, mode: "day" | "perm") =>
    request<SeasonBuyResult>("/api/season-shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id, mode }) }),
};
