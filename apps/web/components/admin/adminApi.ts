import type { LobbyInfo } from "@tomb/protocol";
import type { AdminBulkResponse, AdminGrave, AdminPointsResponse } from "@/lib/admin";
import { request } from "@/lib/api";
import type { Notice, NoticeInput, NoticeListResponse } from "@/lib/types";
import type { AdminAction } from "@/lib/validate";

// 관리자 화면 → /api/admin/*. 인증은 로그인 때 받은 httpOnly 쿠키가 자동으로 실린다.

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const post = (body: unknown) => send("POST", body);
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
  /** 하나든 여러 개든 일괄 처리 경로로 보낸다 */
  apply: (ids: string[], action: AdminAction) => request<AdminBulkResponse>("/api/admin/graves/bulk", post({ ids, action })),
};
