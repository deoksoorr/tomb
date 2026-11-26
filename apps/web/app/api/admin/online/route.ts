import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { loadOnlineNow, type AdminOnlineResponse } from "@/lib/onlineNow";

/**
 * 11/26 관리자 「지금 접속자」: 접속 중 계정 목록 + 통계. 열 때·새로고침 때만 부른다 (자동 반복 없음).
 * Redis: 계정 요약 파이프라인 1번 + 가입 유입 HMGET 1번 + 이번 접속 유입 파이프라인 1번
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminOnlineResponse>(await loadOnlineNow(), { headers: { "Cache-Control": "no-store" } });
});
