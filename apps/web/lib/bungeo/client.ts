import { request } from "../api";
import type { BungeoAt, BungeoBuyResult, BungeoSchedule, BungeoStatus } from "./service";

// 11/22 브라우저 → 골목 붕어빵 수레 API

export const bungeoApi = {
  status: () => request<BungeoStatus>("/api/bungeo"),
  /** at = 수레에 말을 건 맵·자리 (11/23 서버가 그 회차 수레 가까이인지 본다) */
  buy: (id: string, at: BungeoAt | null) =>
    request<BungeoBuyResult>("/api/bungeo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...(at ? { map: at.map, x: Math.round(at.x), y: Math.round(at.y) } : {}) }) }),
  /** 운영자 전용 (아니면 403) */
  schedule: () => request<BungeoSchedule>("/api/bungeo/schedule", { cache: "no-store" }),
};
