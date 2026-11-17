import { handler, json } from "@/lib/http";
import { ItemSchema } from "@/lib/housing/schemas";
import { buyFurniture, getHouseStore } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { champShopDiscount, pickDiscount } from "@/lib/champPerks";
import { champBoardsSafe } from "@/lib/store/champ";
import { wornPerk } from "@/lib/titlesServer";
import { readBody } from "@/lib/validate";

/**
 * 가구 사기 `{ itemId }` → 하우징 가방 +1. 11/16 값은 집 갈래 칭호의 가구 할인을 뺀 값 (lib/titles discountedPrice).
 * 11/17 포인트왕(지난주 1위) 20%와 겹치면 큰 할인 하나만 (lib/champPerks pickDiscount)
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId, zone } = await readBody(req, ItemSchema);
  await rateLimit("shop", req, visitorId);
  const [perk, champ] = await Promise.all([wornPerk(visitorId), champBoardsSafe(visitorId)]);
  return json<MyHouseResponse>(await buyFurniture(getHouseStore(), visitorId, itemId, pickDiscount(perk.houseDiscount, champShopDiscount(champ, "furniture")), zone));
});
