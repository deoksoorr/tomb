import { request } from "../api";
import type { HouseSort, PlotTierId } from "./catalog";
import type {
  GuestbookResponse,
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
  buyPlot: (name: string, intro: string) => request<MyHouseResponse>("/api/housing/me", send("POST", { name, intro })),
  editProfile: (name: string, intro: string) => request<MyHouseResponse>("/api/housing/me", send("PATCH", { name, intro })),
  upgrade: (to: PlotTierId) => request<MyHouseResponse>("/api/housing/me/upgrade", send("POST", { to })),
  buyItem: (itemId: string) => request<MyHouseResponse>("/api/housing/me/buy", send("POST", { itemId })),
  sellItem: (itemId: string) => request<MyHouseResponse & { refunded: number }>("/api/housing/me/sell", send("POST", { itemId })),
  saveLayout: (tier: PlotTierId, layout: HouseLayout) => request<MyHouseResponse>("/api/housing/me/layout", send("PUT", { tier, layout })),
  list: (sort: HouseSort, signal?: AbortSignal) => request<HouseListResponse>(`/api/housing/houses?sort=${sort}`, { signal }),
  detail: (id: string) => request<HouseDetailResponse>(house(id)),
  viewer: (id: string) => request<HouseViewerResponse>(house(id, "/viewer"), { cache: "no-store" }),
  like: (id: string) => request<HouseLikeResponse>(house(id, "/like"), { method: "POST" }),
  guestbook: (id: string) => request<GuestbookResponse>(house(id, "/guestbook"), { cache: "no-store" }),
  writeGuest: (id: string, text: string) => request<GuestbookResponse>(house(id, "/guestbook"), send("POST", { text })),
  deleteGuest: (id: string, entryId: string) =>
    request<GuestbookResponse>(house(id, `/guestbook/${encodeURIComponent(entryId)}`), { method: "DELETE" }),
  reportGuest: (id: string, entryId: string) =>
    request<{ ok: true; duplicate: boolean }>(house(id, `/guestbook/${encodeURIComponent(entryId)}/report`), { method: "POST" }),
};
