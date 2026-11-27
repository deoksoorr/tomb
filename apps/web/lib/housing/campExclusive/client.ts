import type { CampHomeKind } from "@tomb/protocol";
import { request } from "../../api";
import type { CampShopBuyResult, CampShopStatus } from "./service";

// 11/27 브라우저 → 캠핑장 NPC 전용 가구 API (실패하면 서버의 한국어 메시지를 담은 ApiRequestError — lib/api request)

export const campShopApi = {
  /** 그 종류 전용 물건 · 내가 낼 값 · 그 종류 집 주인인지 */
  status: (kind: CampHomeKind) =>
    request<CampShopStatus>(`/api/camp/shop?kind=${kind}`, {
      cache: "no-store",
    }),
  /** 사기 (공용 가방 +1) */
  buy: (kind: CampHomeKind, id: string) =>
    request<CampShopBuyResult>("/api/camp/shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id }),
    }),
};
