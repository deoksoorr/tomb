import { request } from "../api";
import type { MungnyangBuyResult, MungnyangKind, MungnyangStatus } from "./service";

// 11/19 브라우저 → 분양사 보리 API (실패하면 서버의 한국어 메시지를 담은 ApiRequestError — lib/api request)

export const mungnyangApi = {
  /** 파는 펫·집 가구 · 내가 낼 값 */
  status: () => request<MungnyangStatus>("/api/mungnyang", { cache: "no-store" }),
  /** 사기 (펫 = 영구 분양 후 바로 데리고 다님 · 가구 = 가구 가방 +1) */
  buy: (kind: MungnyangKind, id: string) =>
    request<MungnyangBuyResult>("/api/mungnyang", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, id }) }),
};
