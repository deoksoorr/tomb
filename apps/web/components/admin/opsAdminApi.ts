import type { AdminNameReindexResponse } from "@/app/api/admin/accounts/names/route";
import type { AdminStaffResponse } from "@/app/api/admin/staff/route";
import type { AnalyticsRange, AnalyticsReport } from "@/lib/analyticsReport";
import { request } from "@/lib/api";
import type { ResidentSettings } from "@/lib/residents";

// 47번 방문 분석 · 31번 운영자 계정 · 운영 점검 관리자 API (adminApi.ts와 따로 둔다)

/** GET /api/admin/health 응답 (저장소에 임시 묘비를 쓰고·읽고·지워 보는 단계별 결과) */
export type AdminHealthReport = {
  store: "redis" | "memory";
  blob: { token: boolean; storeId: boolean };
  ok: boolean;
  steps: { step: string; ok: boolean; ms: number; error?: string }[];
};

export const opsAdminApi = {
  analytics: (range: AnalyticsRange) => request<AnalyticsReport>(`/api/admin/analytics?range=${range}`, { cache: "no-store" }),
  staff: () => request<AdminStaffResponse>("/api/admin/staff", { cache: "no-store" }),
  setStaff: (accountId: string | null) =>
    request<AdminStaffResponse>("/api/admin/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) }),
  /** 돌아다니는 마을 주민 (켜기/끄기·주민 수) */
  residents: () => request<ResidentSettings>("/api/admin/residents", { cache: "no-store" }),
  setResidents: (s: ResidentSettings) =>
    request<ResidentSettings>("/api/admin/residents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }),
  /** 운영 점검: 저장소 쓰기·읽기·삭제를 실제로 해 본다 */
  health: () => request<AdminHealthReport>("/api/admin/health", { cache: "no-store" }),
  /** 닉네임 색인 채우기 한 번 (next가 "0"이 될 때까지 이어서 부른다) */
  reindexNames: (cursor: string, count = 200) =>
    request<AdminNameReindexResponse>("/api/admin/accounts/names", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor, count }),
    }),
};
