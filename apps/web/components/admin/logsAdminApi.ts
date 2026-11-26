import type { AdminMaintResponse } from "@/app/api/admin/maintenance/route";
import type { AdminSignupSourcesResponse } from "@/app/api/admin/signup-sources/route";
import type { AdminDashboardResponse } from "@/lib/adminDashboard";
import type { AdminLogsResponse } from "@/lib/adminLogs";
import { request } from "@/lib/api";
import type { AdminOnlineResponse } from "@/lib/onlineNow";
import type { MapConcept, MapConceptResponse } from "@/lib/mapConcept";

// 11/26 운영 기록·지금 접속자·점검 모드·가입 유입·대시보드 관리자 API (adminApi.ts와 따로 둔다)

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const logsAdminApi = {
  /** 접속 기록(conn)·사냥터 기록(hunt). account를 주면 그 계정 50줄 */
  logs: (list: "conn" | "hunt", account?: string) =>
    request<AdminLogsResponse>(`/api/admin/logs?${new URLSearchParams({ list, ...(account ? { account } : {}) })}`, { cache: "no-store" }),
  online: () => request<AdminOnlineResponse>("/api/admin/online", { cache: "no-store" }),
  signupSources: (days: number) => request<AdminSignupSourcesResponse>(`/api/admin/signup-sources?days=${days}`, { cache: "no-store" }),
  maintenance: () => request<AdminMaintResponse>("/api/admin/maintenance", { cache: "no-store" }),
  /** 대시보드 한 번에 (맵별 인원·점검·맵 컨셉·접속 종료·가입 유입·분양 현황) */
  dashboard: () => request<AdminDashboardResponse>("/api/admin/dashboard", { cache: "no-store" }),
  /** 마을 맵 컨셉 바꾸기 (바뀌면 마을 전체 공지 한 줄 — 게임 화면이 듣고 바로 그림을 바꾼다) */
  setMapConcept: (concept: MapConcept) => request<MapConceptResponse>("/api/admin/map-concept", post({ concept })),
  setMaintenance: (b: { on: true; msg: string; until: number | null } | { on: false }) => request<AdminMaintResponse>("/api/admin/maintenance", post(b)),
};
