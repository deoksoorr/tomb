import { handler, json } from "@/lib/http";
import { QuestExchangeSchema } from "@/lib/forage/quests/schemas";
import { exchangeQuest } from "@/lib/forage/quests/service";
import type { QuestExchangeResponse } from "@/lib/forage/quests/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 도장 교환소 `{ id }` → 도장을 내고 받기 (Lua 1번) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { id } = await readBody(req, QuestExchangeSchema);
  await rateLimit("quest", req, visitorId);
  return json<QuestExchangeResponse>(await exchangeQuest(visitorId, id));
});
