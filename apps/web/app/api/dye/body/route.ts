import { ReshapeSchema } from "@/lib/dye/schemas";
import { reshape } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 25번 외형 바꾸기 `{ body }` (RESHAPE_PRICE 포인트). 염색한 부위 색은 새 몸의 같은 부위로 따라간다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { body } = await readBody(req, ReshapeSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await reshape(visitorId, body));
});
