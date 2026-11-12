import { giftAccountCreatedAt } from "@/lib/gifts";
import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getGifts } from "@/lib/store";
import type { GiftListResponse } from "@/lib/types";

/** 11번 내 선물함 (최신 먼저, 지운 것·보관 기간이 지난 것 제외). unclaimed = 아직 안 받은 수 (빨간 점) */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const now = Date.now();
  const gifts = await getGifts().inbox(visitorId, await giftAccountCreatedAt(visitorId, now), now);
  return json<GiftListResponse>({ gifts, unclaimed: gifts.filter((g) => g.claimedAt === null).length });
});
