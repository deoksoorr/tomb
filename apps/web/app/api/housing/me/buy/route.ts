import { handler, json } from "@/lib/http";
import { ItemSchema } from "@/lib/housing/schemas";
import { buyFurniture, getHouseStore } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 가구 사기 `{ itemId }` → 하우징 가방 +1 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId } = await readBody(req, ItemSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(await buyFurniture(getHouseStore(), visitorId, itemId));
});
