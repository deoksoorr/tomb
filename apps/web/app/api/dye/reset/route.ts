import { DyeResetSchema } from "@/lib/dye/schemas";
import { resetDye } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 46번 원래 색 되돌리기 `{ part }` (DYE_RESET_PRICE 포인트). 이미 원래 색이면 409 NO_CHANGE (포인트를 쓰지 않는다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { part } = await readBody(req, DyeResetSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await resetDye(visitorId, part));
});
