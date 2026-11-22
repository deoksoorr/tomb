import { DyePickSchema } from "@/lib/dye/schemas";
import { applyPickDye } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 11/15 색 확정 염색권 쓰기 `{ itemId, part, color }`: 고른 보통 색("#rrggbb", 특수 색 제외)으로 바로 염색 — 염색권 1장 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, part, color, slot } = await readBody(req, DyePickSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await applyPickDye(visitorId, itemId, part, color, Date.now(), slot));
});
