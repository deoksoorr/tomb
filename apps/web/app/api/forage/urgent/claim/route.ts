import { handler, json } from "@/lib/http";
import { UrgentClaimSchema } from "@/lib/forage/quests/urgentSchemas";
import { claimUrgent } from "@/lib/forage/quests/urgentService";
import type { UrgentClaimResponse } from "@/lib/forage/quests/urgentTypes";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/15 긴급 의뢰 보상 받기 `{ id }` (끝난 뒤, 한 번만 — Lua) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { id } = await readBody(req, UrgentClaimSchema);
  await rateLimit("quest", req, visitorId);
  return json<UrgentClaimResponse>(await claimUrgent(visitorId, id));
});
