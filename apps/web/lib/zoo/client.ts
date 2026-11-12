import { request } from "../api";
import type { WearResponse } from "../types";

// 브라우저 → 동물원 API. 실패하면 서버의 한국어 메시지를 담은 ApiRequestError를 던진다 (lib/api의 request)

const post = (data: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

export const zooApi = {
  /** 펫 분양 (영구). 사면 바로 데리고 다닌다 */
  buy: (petId: string) => request<WearResponse>("/api/zoo/buy", post({ petId })),
};
