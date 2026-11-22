import { DyeSpecialSchema } from "@/lib/dye/schemas";
import { applySpecialDye } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/15 특수색 확정 염색권 쓰기 `{ itemId, part, kind }`: 특수 색 종류만 고르고 바탕 색은 서버가 정한다 — 염색권 1장 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, part, kind, slot } = await readBody(req, DyeSpecialSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await applySpecialDye(visitorId, itemId, part, kind, Date.now(), slot));
});
