import { handler, json } from "@/lib/http";
import { SellSchema } from "@/lib/forage/schemas";
import { sellTo } from "@/lib/forage/service";
import type { SellResponse } from "@/lib/forage/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** NPC에게 팔기 `{ npc, items: { id: 개수 } }` → 오늘 한도 안에서 판 만큼 포인트 (못 판 것은 가방에) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { npc, items } = await readBody(req, SellSchema);
  return json<SellResponse>(await sellTo(visitorId, npc, items as Record<string, number>, ipHash(req)));
});
