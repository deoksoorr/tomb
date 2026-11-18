import { handler, json } from "@/lib/http";
import { SellSchema } from "@/lib/forage/schemas";
import { sellTo } from "@/lib/forage/service";
import type { SellResponse } from "@/lib/forage/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { readBody } from "@/lib/validate";

/** NPC에게 팔기 `{ npc, items: { id: 개수 } }` → 판 만큼 포인트 (지갑이 꽉 차 못 판 것은 가방에) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("forage", req, visitorId);
  const { npc, items } = await readBody(req, SellSchema);
  return json<SellResponse>(await sellTo(visitorId, npc, items as Record<string, number>, ipHash(req)));
});
