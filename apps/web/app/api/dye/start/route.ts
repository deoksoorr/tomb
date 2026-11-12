import { DyeStartSchema } from "@/lib/dye/schemas";
import { startDye } from "@/lib/dye/service";
import type { DyeStartResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 46번 무작위 염색 시작 `{ itemId, part }`: 염색권 1장을 쓰고 60초짜리 판(시드)을 연다. 진행 중인 판이 있으면 그 판을 돌려준다
 * (resumed, 염색권을 더 쓰지 않는다). 가방에 없으면 409 NO_ITEM
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, part } = await readBody(req, DyeStartSchema);
  await rateLimit("shop", req, visitorId);
  return json<DyeStartResponse>(await startDye(visitorId, itemId, part));
});
