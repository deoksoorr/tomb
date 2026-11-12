import { PermanentBuySchema } from "@/lib/dye/schemas";
import { buyPermanent } from "@/lib/dye/service";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import type { WearResponse } from "@/lib/types";
import { readBody } from "@/lib/validate";

/**
 * 30번 영구 꾸미기 사기 `{ itemId }` (기간제 가격의 7배): 입고 있던 기간제는 그대로 영구가 되고, 아니면 벗어 둔 꾸미기에 영구로 들어간다.
 * 이미 영구면 409 ALREADY_OWNED, 가방에 같은 새 이용권이 있으면 409 HAS_TICKET
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId } = await readBody(req, PermanentBuySchema);
  await rateLimit("shop", req, visitorId);
  return json<WearResponse>(await buyPermanent(visitorId, itemId));
});
