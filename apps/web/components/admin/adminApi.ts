import type { LobbyInfo } from "@tomb/protocol";
import type { AdminBulkResponse, AdminGrave } from "@/lib/admin";
import { request } from "@/lib/api";
import type { AdminAction } from "@/lib/validate";

// 관리자 화면 → /api/admin/*. 인증은 로그인 때 받은 httpOnly 쿠키가 자동으로 실린다.

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const adminApi = {
  login: (key: string) => request<{ ok: true }>("/api/admin/session", post({ key })),
  logout: () => request<{ ok: true }>("/api/admin/session", { method: "DELETE" }),
  graves: () => request<{ graves: AdminGrave[] }>("/api/admin/graves", { cache: "no-store" }),
  channels: () => request<LobbyInfo>("/api/admin/channels", { cache: "no-store" }),
  /** 하나든 여러 개든 일괄 처리 경로로 보낸다 */
  apply: (ids: string[], action: AdminAction) => request<AdminBulkResponse>("/api/admin/graves/bulk", post({ ids, action })),
};
