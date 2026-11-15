import { handler, json } from "@/lib/http";
import { UrgentTestSchema } from "@/lib/forage/quests/urgentSchemas";
import { testAddUrgent, testEndUrgent, testStartUrgent, urgentPublic } from "@/lib/forage/quests/urgentService";
import type { UrgentPublic } from "@/lib/forage/quests/urgentTypes";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 11/15 테스트 서버 운영자(슈퍼 계정) 전용 긴급 의뢰 시험 (운영 서버·다른 계정은 404).
 * start = 지금 시작(20분) · add = 막대에 목표의 pct% 더하기 · end = 지금 끝내기(보상 받기 시험) · clear = 시험 의뢰 지우기
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const body = await readBody(req, UrgentTestSchema);
  if (body.action === "start") await testStartUrgent(visitorId, body.kind);
  else if (body.action === "add") await testAddUrgent(visitorId, body.pct);
  else await testEndUrgent(visitorId, body.action === "clear");
  return json<UrgentPublic>((await urgentPublic()).body);
});
