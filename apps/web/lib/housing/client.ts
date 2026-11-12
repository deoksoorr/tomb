import { request } from "../api";
import type { HouseSort, PlotTierId } from "./catalog";
import type { PlantsResponse } from "./plants";
import type { HouseStatesResponse } from "./states";
import type {
  GuestbookResponse,
  HouseExterior,
  VillageResponse,
  HouseDetailResponse,
  HouseLayout,
  HouseLikeResponse,
  HouseListResponse,
  HouseViewerResponse,
  MyHouseResponse,
} from "./types";

// 브라우저 → /api/housing/* (서버의 한국어 오류 메시지를 그대로 보여 준다: lib/api.ts errorMessage)

const send = (method: string, data?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: data === undefined ? undefined : JSON.stringify(data),
});
const house = (id: string, sub = "") => `/api/housing/houses/${encodeURIComponent(id)}${sub}`;

export const housingApi = {
  mine: () => request<MyHouseResponse>("/api/housing/me", { cache: "no-store" }),
  // 채널마다 주거 구역이 따로다: ch = 지금 있는 채널 (서버가 다른 채널의 필지는 다루지 않는다)
  buyPlot: (ch: number, name: string, intro: string, lot?: number | null, tier: PlotTierId = "small") =>
    request<MyHouseResponse>("/api/housing/me", send("POST", { ch, name, intro, lot: lot ?? null, tier })),
  saveExterior: (ch: number, exterior: HouseExterior) => request<MyHouseResponse>("/api/housing/me/exterior", send("PUT", { ch, exterior })),
  /** ch 채널의 분양 마을. fresh=true: 방금 바꾼 내용을 보려고 CDN 캐시(15초)를 건너뛴다 */
  village: (ch: number, fresh = false) =>
    request<VillageResponse>(
      fresh ? `/api/housing/village?ch=${ch}&t=${Date.now()}` : `/api/housing/village?ch=${ch}`,
      fresh ? { cache: "no-store" } : undefined,
    ),
  editProfile: (name: string, intro: string) => request<MyHouseResponse>("/api/housing/me", send("PATCH", { name, intro })),
  upgrade: (ch: number, to: PlotTierId) => request<MyHouseResponse>("/api/housing/me/upgrade", send("POST", { ch, to })),
  buyItem: (itemId: string) => request<MyHouseResponse>("/api/housing/me/buy", send("POST", { itemId })),
  sellItem: (itemId: string) => request<MyHouseResponse & { refunded: number }>("/api/housing/me/sell", send("POST", { itemId })),
  saveLayout: (ch: number, tier: PlotTierId, layout: HouseLayout) => request<MyHouseResponse>("/api/housing/me/layout", send("PUT", { ch, tier, layout })),
  list: (sort: HouseSort, signal?: AbortSignal) => request<HouseListResponse>(`/api/housing/houses?sort=${sort}`, { signal }),
  detail: (id: string) => request<HouseDetailResponse>(house(id)),
  viewer: (id: string) => request<HouseViewerResponse>(house(id, "/viewer"), { cache: "no-store" }),
  like: (id: string) => request<HouseLikeResponse>(house(id, "/like"), { method: "POST" }),
  guestbook: (id: string) => request<GuestbookResponse>(house(id, "/guestbook"), { cache: "no-store" }),
  writeGuest: (id: string, text: string) => request<GuestbookResponse>(house(id, "/guestbook"), send("POST", { text })),
  deleteGuest: (id: string, entryId: string) =>
    request<GuestbookResponse>(house(id, `/guestbook/${encodeURIComponent(entryId)}`), { method: "DELETE" }),
  /** 3번 화분 물 준 기록 / 물 주기 */
  plants: (id: string) => request<PlantsResponse>(house(id, "/plants"), { cache: "no-store" }),
  water: (id: string, u: string) => request<PlantsResponse>(house(id, "/plants"), send("POST", { u })),
  /** 3번 가구 상태 (불·스탠드·라디오·창문): 방 입장 때 받기 / 바꾼 값 저장 */
  states: (id: string) => request<HouseStatesResponse>(house(id, "/states"), { cache: "no-store" }),
  setState: (id: string, u: string, a: number) => request<{ ok: true }>(house(id, "/states"), send("POST", { u, a })),
  reportGuest: (id: string, entryId: string) =>
    request<{ ok: true; duplicate: boolean }>(house(id, `/guestbook/${encodeURIComponent(entryId)}/report`), { method: "POST" }),
};
