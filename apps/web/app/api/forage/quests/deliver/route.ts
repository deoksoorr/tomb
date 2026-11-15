import { handler, json } from "@/lib/http";
import { QuestDeliverSchema } from "@/lib/forage/quests/schemas";
import { deliverQuest } from "@/lib/forage/quests/service";
import type { QuestDeliverResponse } from "@/lib/forage/quests/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 납품 `{ key, items }` → 가방에서 빼고 의뢰 도장 (Lua 1번) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { key, items } = await readBody(req, QuestDeliverSchema);
  await rateLimit("quest", req, visitorId);
  return json<QuestDeliverResponse>(await deliverQuest(visitorId, key, items as Record<string, number>));
});
