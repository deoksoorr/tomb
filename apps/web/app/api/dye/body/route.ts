import { ReshapeSchema } from "@/lib/dye/schemas";
import { reshape } from "@/lib/dye/service";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 25번 외형 바꾸기 `{ body }` (소장한 외형끼리는 무료, 해금 전 프리미엄은 선택권 값). 염색한 부위 색은 새 몸의 같은 부위로 따라간다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { body } = await readBody(req, ReshapeSchema);
  await rateLimit("shop", req, visitorId);
  return json<StyleChangeResponse>(await reshape(visitorId, body));
});
