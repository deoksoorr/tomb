import { request } from "./api";
import type {
  CalendarClaimResponse,
  CalendarResponse,
  GiftClaimResponse,
  GiftListResponse,
  MegaphoneListResponse,
  MegaphoneUseResponse,
  MegaPinResponse,
} from "./types";

// 10번 출석 달력 · 11번 선물함 · 23번 확성기 클라이언트 호출 (lib/api.ts와 같은 request를 쓴다)

const post = (data?: unknown): RequestInit =>
  data === undefined ? { method: "POST" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
const giftPath = (id: string) => `/api/gifts/${encodeURIComponent(id)}`;

export const socialApi = {
  calendar: (month?: string) =>
    request<CalendarResponse>(`/api/me/calendar${month ? `?month=${encodeURIComponent(month)}` : ""}`, { cache: "no-store" }),
  claimCalendar: () => request<CalendarClaimResponse>("/api/me/calendar/claim", post()),
  gifts: () => request<GiftListResponse>("/api/gifts", { cache: "no-store" }),
  claimGift: (id: string) => request<GiftClaimResponse>(giftPath(id), post()),
  deleteGift: (id: string) => request<{ ok: true }>(giftPath(id), { method: "DELETE" }),
  megaphones: (channel: number) => request<MegaphoneListResponse>(`/api/megaphone?channel=${channel}`),
  shout: (itemId: string, text: string, channel: number) => request<MegaphoneUseResponse>("/api/megaphone", post({ itemId, text, channel })),
  // 11/17 확성기 창 고정 공지 (운영자만)
  pin: (text: string, scope: "channel" | "all", channel: number) => request<MegaPinResponse>("/api/megaphone/pin", post({ text, scope, channel })),
  unpin: (scope: "channel" | "all", channel: number) => request<MegaPinResponse>(`/api/megaphone/pin?scope=${scope}&channel=${channel}`, { method: "DELETE" }),
};
