import { DyeSlotSchema } from "@/lib/dye/schemas";
import { buyColorSlot } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/22 색 보관함 칸 하나 더 열기 `{ item }` (2번째 500P · 3번째 1,500P — protocol DYE_COLOR_SLOT_PRICES). 새 칸은 비어 있다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { item } = await readBody(req, DyeSlotSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await buyColorSlot(visitorId, item));
});
