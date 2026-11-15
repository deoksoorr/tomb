import { handler, json } from "@/lib/http";
import { urgentMine } from "@/lib/forage/quests/urgentService";
import type { UrgentMeResponse } from "@/lib/forage/quests/urgentTypes";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

/** 11/15 나와 관련된 긴급 의뢰 (내가 낸 수·받을 보상·받은 기록). 게시판을 열 때·끝났을 때만 부른다 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("quest", req, visitorId);
  return json<UrgentMeResponse>(await urgentMine(visitorId));
});
