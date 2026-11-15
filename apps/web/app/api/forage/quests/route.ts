import { handler, json } from "@/lib/http";
import { questBoard } from "@/lib/forage/quests/service";
import type { QuestBoard } from "@/lib/forage/quests/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

/** 11/15 수집 의뢰판: 오늘의 의뢰 7개·이번 주 큰 의뢰·도장·교환소에서 받은 것 (저장소 읽기 1번) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("quest", req, visitorId);
  return json<QuestBoard>(await questBoard(visitorId));
});
