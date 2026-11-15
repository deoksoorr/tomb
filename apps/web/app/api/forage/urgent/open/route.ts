import { handler, json } from "@/lib/http";
import { openUrgentPocket } from "@/lib/forage/quests/urgentService";
import type { UrgentOpenResponse } from "@/lib/forage/quests/urgentTypes";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

/** 11/15 가방의 「수집가의 뒷주머니」 하나 열기 (오래된 것부터, Lua 1번 — 두 번 열 수 없다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("quest", req, visitorId);
  return json<UrgentOpenResponse>(await openUrgentPocket(visitorId));
});
