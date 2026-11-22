import { DyeSelectSchema } from "@/lib/dye/schemas";
import { selectItemColor } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/22 색 보관함: 아이템이 입을 색 칸 고르기 `{ item, sel }` (sel -1 = 원래 색). 무료, 칠한 칸만 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { item, sel } = await readBody(req, DyeSelectSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await selectItemColor(visitorId, item, sel));
});
