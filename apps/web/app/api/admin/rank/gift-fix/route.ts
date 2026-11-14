import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { rankGiftFixStatus, runRankGiftFix, type RankGiftFixResponse } from "@/lib/rankGiftFix";

/** 선물·1위 보상 포인트를 랭킹에서 빼는 한 번짜리 정리: 상태 (관리자) */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<RankGiftFixResponse>(await rankGiftFixStatus());
});

/** 정리 실행 (관리자). 이미 했으면 그때 결과(already), 진행 중이면 busy — 두 번 눌러도 한 번만 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  return json<RankGiftFixResponse>(await runRankGiftFix());
});
