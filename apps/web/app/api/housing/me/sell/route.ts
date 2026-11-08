import { handler, json } from "@/lib/http";
import { ItemSchema } from "@/lib/housing/schemas";
import { getHouseStore, sellFurniture } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 되팔기 `{ itemId }`: 놓지 않은 1개를 가격의 절반에 판다 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId } = await readBody(req, ItemSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse & { refunded: number }>(await sellFurniture(getHouseStore(), visitorId, itemId));
});
