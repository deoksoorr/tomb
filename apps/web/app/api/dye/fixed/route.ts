import { DyeFixedSchema } from "@/lib/dye/schemas";
import { applyFixedDye } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 46번 고정 색 염색권 쓰기 `{ itemId, part }`: 색은 염색권 정의에서만 온다 (요청에 색을 받지 않는다) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, part } = await readBody(req, DyeFixedSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await applyFixedDye(visitorId, itemId, part));
});
