import { DyeTimeoutSchema } from "@/lib/dye/schemas";
import { timeoutDye } from "@/lib/dye/service";
import type { DyeTimeoutResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 46번 무작위 염색 시간 끝 `{ seed, x, y }`: 그 순간 조준점 색을 서버가 계산해 후보로 판에 적는다 (색은 아직 그대로).
 * 이어서 /api/dye/choose로 새 색/지금 색을 고른다. 여유 시간까지 지났으면 candidate: null (색 그대로 끝남)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { seed, x, y } = await readBody(req, DyeTimeoutSchema);
  await rateLimit("shop", req, visitorId);
  return json<DyeTimeoutResponse>(await timeoutDye(visitorId, seed, x, y));
});
