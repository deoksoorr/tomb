import type { LobbyInfo } from "@tomb/protocol";
import type {
  AdminBulkResponse,
  AdminErrorsResponse,
  AdminGrave,
  AdminGraveSettings,
  AdminPassedResponse,
  AdminPointsResponse,
} from "@/lib/admin";
import { request } from "@/lib/api";
import type { AdminHouse } from "@/lib/housing/types";
import type { AdminAccountRow } from "@/app/api/admin/accounts/search/route";
import type { EconomyResponse, Notice, NoticeInput, NoticeListResponse } from "@/lib/types";
import type { AdminAction } from "@/lib/validate";

// 관리자 화면 → /api/admin/*. 인증은 로그인 때 받은 httpOnly 쿠키가 자동으로 실린다.

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const post = (body: unknown) => send("POST", body);
/** 하우징 집·방명록 관리 작업 */
export type ModAction = "hide" | "unhide" | "delete";
const noticePath = (id: string) => `/api/admin/notices/${encodeURIComponent(id)}`;

export const adminApi = {
  login: (key: string) => request<{ ok: true }>("/api/admin/session", post({ key })),
  logout: () => request<{ ok: true }>("/api/admin/session", { method: "DELETE" }),
  graves: () => request<{ graves: AdminGrave[] }>("/api/admin/graves", { cache: "no-store" }),
  channels: () => request<LobbyInfo>("/api/admin/channels", { cache: "no-store" }),
  /** 개인 코드 또는 계정 id 중 하나 + 증감 (코드는 서버가 해시로만 찾는다) */
  points: (target: { code: string } | { accountId: string }, delta: number) =>
    request<AdminPointsResponse>("/api/admin/accounts/points", post({ ...target, delta })),
  notices: () => request<NoticeListResponse>("/api/admin/notices", { cache: "no-store" }),
  createNotice: (input: NoticeInput) => request<{ notice: Notice }>("/api/admin/notices", post(input)),
  updateNotice: (id: string, patch: Partial<NoticeInput>) => request<{ notice: Notice }>(noticePath(id), send("PATCH", patch)),
  deleteNotice: (id: string) => request<{ ok: true }>(noticePath(id), { method: "DELETE" }),
  houses: () => request<{ houses: AdminHouse[] }>("/api/admin/housing", { cache: "no-store" }),
  houseAction: (id: string, action: ModAction) => request<{ ok: true }>(`/api/admin/housing/${encodeURIComponent(id)}`, post({ action })),
  guestAction: (id: string, entryId: string, action: ModAction) =>
    request<{ ok: true }>(`/api/admin/housing/${encodeURIComponent(id)}/guestbook/${encodeURIComponent(entryId)}`, post({ action })),
  errors: (days: number) => request<AdminErrorsResponse>(`/api/admin/errors?days=${days}`, { cache: "no-store" }),
  economy: (days: number) => request<EconomyResponse>(`/api/admin/economy?days=${days}`, { cache: "no-store" }),
  /** 닉네임으로 계정 찾기 (포인트를 모은 적 있는 계정) */
  searchAccounts: (name: string) =>
    request<{ accounts: AdminAccountRow[] }>(`/api/admin/accounts/search?${new URLSearchParams({ name })}`, { cache: "no-store" }),
  /** 코드 재발급 (이전 코드는 무효, 새 코드는 이 응답에서 한 번만) */
  reissueCode: (accountId: string) =>
    request<{ accountId: string; name: string | null; code: string }>("/api/admin/accounts/code", post({ accountId })),
  /** 성불한 묘비 (숨김 포함) */
  passed: (q: string, offset = 0) =>
    request<AdminPassedResponse>(`/api/admin/graves/passed?${new URLSearchParams({ q, offset: String(offset) })}`, { cache: "no-store" }),
  deletePassed: (id: string) => request<{ ok: true }>(`/api/admin/graves/passed/${encodeURIComponent(id)}`, { method: "DELETE" }),
  graveSettings: () => request<AdminGraveSettings>("/api/admin/graves/settings", { cache: "no-store" }),
  setGraveSettings: (passDays: number) =>
    request<AdminGraveSettings & { passedNow: number }>("/api/admin/graves/settings", send("PATCH", { passDays })),
  /** 하나든 여러 개든 일괄 처리 경로로 보낸다 */
  apply: (ids: string[], action: AdminAction) => request<AdminBulkResponse>("/api/admin/graves/bulk", post({ ids, action })),
};
