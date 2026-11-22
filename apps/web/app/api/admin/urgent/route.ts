import { requireAdmin } from "@/lib/admin";
import { adminUrgentResults } from "@/lib/forage/quests/urgentService";
import type { AdminUrgentResultsResponse } from "@/lib/forage/quests/urgentTypes";
import { handler, json } from "@/lib/http";

/**
 * 11/22 관리자 「긴급 의뢰 결과」: 최근 끝난 긴급 의뢰(최대 20개)의 시각·종류·최종 %·낸 사람(수·순위·받을 보상)·행운의 배달부,
 * 받기 기록이 남아 있으면 누가 받았는지와 받은 꾸미기까지. 아직 기록이 없는 최근 의뢰는 이때 남긴다
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<AdminUrgentResultsResponse>(await adminUrgentResults(Date.now()));
});
