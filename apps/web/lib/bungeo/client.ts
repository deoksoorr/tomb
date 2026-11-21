import { request } from "../api";
import type { BungeoBuyResult, BungeoSchedule, BungeoStatus } from "./service";

// 11/22 브라우저 → 골목 붕어빵 수레 API

export const bungeoApi = {
  status: () => request<BungeoStatus>("/api/bungeo"),
  buy: (id: string) => request<BungeoBuyResult>("/api/bungeo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }),
  /** 운영자 전용 (아니면 403) */
  schedule: () => request<BungeoSchedule>("/api/bungeo/schedule", { cache: "no-store" }),
};
