import type { AdminNameReindexResponse } from "@/app/api/admin/accounts/names/route";
import type { AdminStayFillResponse } from "@/app/api/admin/accounts/stay/route";
import type { AdminUserStatsResponse } from "@/app/api/admin/accounts/[id]/stats/route";
import type { AdminActivitySeedResponse } from "@/app/api/admin/activity/seed/route";
import type { UserActivityReport } from "@/lib/userActivity";
import type { AdminChampResponse } from "@/app/api/admin/champ/route";
import type { AdminChampTestResponse } from "@/app/api/admin/champ/test/route";
import type { AdminRankFillResponse } from "@/app/api/admin/rank/fill/route";
import type { RankGiftFixResponse } from "@/lib/rankGiftFix";
import type { AdminTestDropsResponse } from "@/app/api/admin/rpg/test-drops/route";
import type { AdminManagersResponse } from "@/app/api/admin/managers/route";
import type { AdminStaffResponse } from "@/app/api/admin/staff/route";
import type { AnalyticsRange, AnalyticsReport } from "@/lib/analyticsReport";
import { request } from "@/lib/api";
import type { EarnSource } from "@/lib/economy";
import type { PointEventResponse } from "@/lib/pointEvent";
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
  /** 11/16 매니저 목록 · 임명(on = true)·해제 */
  managers: () => request<AdminManagersResponse>("/api/admin/managers", { cache: "no-store" }),
  setManager: (accountId: string, on: boolean) =>
    request<AdminManagersResponse>("/api/admin/managers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId, on }) }),
  /** 돌아다니는 마을 주민 (켜기/끄기·주민 수) */
  residents: () => request<ResidentSettings>("/api/admin/residents", { cache: "no-store" }),
  setResidents: (s: ResidentSettings) =>
    request<ResidentSettings>("/api/admin/residents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) }),
  /** 포인트 배수 이벤트 (켜기·끄기·끝나는 시각·늘릴 항목·배수) */
  pointEvent: () => request<PointEventResponse>("/api/admin/point-event", { cache: "no-store" }),
  setPointEvent: (input: { on: boolean; endAt?: number | null; sources?: EarnSource[]; mult?: number }) =>
    request<PointEventResponse>("/api/admin/point-event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }),
  /** 운영 점검: 저장소 쓰기·읽기·삭제를 실제로 해 본다 */
  health: () => request<AdminHealthReport>("/api/admin/health", { cache: "no-store" }),
  /** 닉네임 색인 채우기 한 번 (next가 "0"이 될 때까지 이어서 부른다) */
  reindexNames: (cursor: string, count = 200) =>
    request<AdminNameReindexResponse>("/api/admin/accounts/names", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor, count }),
    }),
  /** 총 접속 시간 채우기 한 번 (next가 "0"이 될 때까지 이어서 부른다, 여러 번 돌려도 두 번 세지 않는다) */
  fillStay: (cursor: string, count = 200) =>
    request<AdminStayFillResponse>("/api/admin/accounts/stay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor, count }),
    }),
  /** 유저 활동 보고서 (staff = 운영자 계정도 세기, fresh = 5분 기억을 버리고 다시 세기) */
  activity: (staff: boolean, fresh = false) =>
    request<UserActivityReport>(`/api/admin/activity?${new URLSearchParams({ ...(staff ? { staff: "1" } : {}), ...(fresh ? { fresh: "1" } : {}) })}`, { cache: "no-store" }),
  /** 11/20 계정 상세 수치 (fresh = 30초 기억을 버리고 다시 읽기) */
  userStats: (accountId: string, fresh = false) =>
    request<AdminUserStatsResponse>(`/api/admin/accounts/${encodeURIComponent(accountId)}/stats${fresh ? "?fresh=1" : ""}`, { cache: "no-store" }),
  /** 기록 전 활동 채우기 한 번 (next가 "0"이 될 때까지 이어서 부른다) */
  seedActivity: (cursor: string, count = 200) =>
    request<AdminActivitySeedResponse>("/api/admin/activity/seed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor, count }),
    }),
  /** 주간 랭킹 1위 지급 상태 (week 없으면 지난주) */
  champ: (week?: string) => request<AdminChampResponse>(`/api/admin/champ${week ? `?week=${week}` : ""}`, { cache: "no-store" }),
  /** 주간 랭킹 1위 정리·지급 다시 시도 (이미 준 랭킹은 다시 주지 않는다) */
  champSettle: (week?: string) =>
    request<AdminChampResponse>("/api/admin/champ", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(week ? { week } : {}) }),
  /** 테스트 서버 전용: 운영자 시험 1위 상태 (운영은 404) */
  champTest: () => request<AdminChampTestResponse>("/api/admin/champ/test", { cache: "no-store" }),
  /** 테스트 서버 전용: 운영자 계정에 시험 1위 주기 (빈 목록 = 시험 해제) */
  setChampTest: (boards: string[]) =>
    request<AdminChampTestResponse>("/api/admin/champ/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ boards }) }),
  /** 테스트 서버 전용: 운영자 계정의 남은 시험 드롭 예약 (운영은 404) */
  testDrops: () => request<AdminTestDropsResponse>("/api/admin/rpg/test-drops", { cache: "no-store" }),
  /** 테스트 서버 전용: 시험 드롭 예약 — preset = [고급+희귀] → [꾸미기 선물+전설] 두 판, clear = 비우기 */
  setTestDrops: (action: "preset" | "clear") =>
    request<AdminTestDropsResponse>("/api/admin/rpg/test-drops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }),
  /** 선물·1위 보상 포인트를 랭킹에서 빼는 한 번짜리 정리: 상태 */
  rankGiftFix: () => request<RankGiftFixResponse>("/api/admin/rank/gift-fix", { cache: "no-store" }),
  /** 정리 실행 (이미 했으면 그때 결과가 온다 — 두 번 눌러도 한 번만) */
  runRankGiftFix: () => request<RankGiftFixResponse>("/api/admin/rank/gift-fix", { method: "POST" }),
  /** 랭킹 기존 기록 다시 채우기 한 번 (next가 "0"이 될 때까지 이어서 부른다) */
  fillRank: (board: "huntLevel" | "look", cursor: string, count = 200) =>
    request<AdminRankFillResponse>("/api/admin/rank/fill", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board, cursor, count }),
    }),
};
