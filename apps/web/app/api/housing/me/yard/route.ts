import { handler, json } from "@/lib/http";
import { YardSchema } from "@/lib/housing/schemas";
import { getHouseStore, upgradeYard } from "@/lib/housing/service";
import type { MyHouseResponse } from "@/lib/housing/types";
import { notifyHomes } from "@/lib/housing/homesNotify";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/**
 * 11/26 캠핑장 집 앞마당 다음 단계 `{ ch, zone?: "camp" }`: 포구 넓히기와 같은 +13,500 · +22,500 (카라반 강가 ×1.25 · 폭포 앞 ×1.5, 별장이면 × 4/3 — catalog campYardCost).
 * 모든 종류가 방도 커진다. 내 캠핑장 집이 다른 채널에 있으면 409 WRONG_CHANNEL, 이미 3단계면 409 MAX_YARD
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { ch } = await readBody(req, YardSchema);
  await rateLimit("shop", req, visitorId);
  return json<MyHouseResponse>(notifyHomes(await upgradeYard(getHouseStore(), visitorId, ch)));
});
