import { request } from "../api";
import type { OfficeBuyResult, OfficeStatus } from "./service";

// 11/20 브라우저 → 총무팀 문대리 API (실패하면 서버의 한국어 메시지를 담은 ApiRequestError — lib/api request)

export const officeApi = {
  /** 파는 사무실 가구 · 내가 낼 값 · 집이 있는지 */
  status: () => request<OfficeStatus>("/api/office", { cache: "no-store" }),
  /** 사기 (가구 가방 +1) */
  buy: (id: string) => request<OfficeBuyResult>("/api/office", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }),
};
