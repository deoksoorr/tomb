import type { AdminStaffResponse } from "@/app/api/admin/staff/route";
import type { AnalyticsRange, AnalyticsReport } from "@/lib/analyticsReport";
import { request } from "@/lib/api";
import type { ResidentSettings } from "@/lib/residents";

// 47번 방문 분석 · 31번 운영자 계정 관리자 API (adminApi.ts와 따로 둔다)

export const opsAdminApi = {
  analytics: (range: AnalyticsRange) => request<AnalyticsReport>(`/api/admin/analytics?range=${range}`, { cache: "no-store" }),
  staff: () => request<AdminStaffResponse>("/api/admin/staff", { cache: "no-store" }),
  setStaff: (accountId: string | null) =>
    request<AdminStaffResponse>("/api/admin/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId }) }),
  /** 돌아다니는 마을 주민 (켜기/끄기·주민 수) */
  residents: () => request<ResidentSettings>("/api/admin/residents", { cache: "no-store" }),
  setResidents: (s: ResidentSettings) =>
    request<ResidentSettings>("/api/admin/residents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }),
};
