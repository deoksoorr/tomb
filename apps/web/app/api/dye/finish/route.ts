import { DyeFinishSchema } from "@/lib/dye/schemas";
import { finishDye } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 46번 무작위 염색 확정 `{ seed, x, y }`: 판 위 좌표만 받는다. 색은 서버가 그 판의 시드로 계산해 저장한다 (위조 불가).
 * 시간(60초 + 여유)이 지나서 온 좌표는 무시하고 색을 그대로 둔다 (late·kept). 시간이 끝난 판은 timeout → choose
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { seed, x, y } = await readBody(req, DyeFinishSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await finishDye(visitorId, seed, x, y));
});
