import { handler, json } from "@/lib/http";
import { QuestRerollSchema } from "@/lib/forage/quests/schemas";
import { rerollQuest } from "@/lib/forage/quests/service";
import type { QuestRerollResponse } from "@/lib/forage/quests/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 오늘의 의뢰 하나 바꾸기 `{ key }` (하루 한 번, 무료) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { key } = await readBody(req, QuestRerollSchema);
  await rateLimit("quest", req, visitorId);
  return json<QuestRerollResponse>(await rerollQuest(visitorId, key));
});
