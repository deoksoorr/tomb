import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { ShopActionSchema } from "@/lib/rpg/schemas";
import { shopAction } from "@/lib/rpg/service";
import type { RpgView, SoldInfo } from "@/lib/rpg/types";
import { ipHash, requireVisitor } from "@/lib/session";
import { readBody } from "@/lib/validate";

/** 사냥터 상점: 장비·포션 사기(buy, 포인트 차감) · 장비·포션 되팔기(sell, 값의 50%, count개 한 번에 — 없으면 1개) */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const action = await readBody(req, ShopActionSchema);
  await rateLimit("shop", req, visitorId);
  return json<RpgView & { sold?: SoldInfo }>(await shopAction(visitorId, action, ipHash(req)));
});
