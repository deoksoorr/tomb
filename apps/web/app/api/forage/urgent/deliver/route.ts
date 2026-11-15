import { handler, json } from "@/lib/http";
import { UrgentDeliverSchema } from "@/lib/forage/quests/urgentSchemas";
import { deliverUrgent } from "@/lib/forage/quests/urgentService";
import type { UrgentDeliverResponse } from "@/lib/forage/quests/urgentTypes";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/15 긴급 의뢰 납품 `{ id, items }` → 제한 시간 안이면 가방에서 빼고 서버 전체 막대·순위 (Lua 1번) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { id, items } = await readBody(req, UrgentDeliverSchema);
  await rateLimit("quest", req, visitorId);
  return json<UrgentDeliverResponse>(await deliverUrgent(visitorId, id, items as Record<string, number>));
});
