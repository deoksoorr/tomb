import { requireAdmin } from "@/lib/admin";
import { loadDashboard, type AdminDashboardResponse } from "@/lib/adminDashboard";
import { handler, json } from "@/lib/http";

/**
 * 11/26 관리자 대시보드: 지금 맵별 인원·점검 상태·맵 컨셉·24시간 접속 종료·가입 유입(오늘·7일)·분양 현황을 한 번에.
 * 열 때와 [새로고침] 때만 부른다 (자동 반복 없음). Redis 비용은 lib/adminDashboard 머리말
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminDashboardResponse>(await loadDashboard(), { headers: { "Cache-Control": "no-store" } });
});
