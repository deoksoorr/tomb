import { handler, json } from "@/lib/http";
import { getHouseStore, likeHouse } from "@/lib/housing/service";
import type { HouseLikeResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, requireVisitor } from "@/lib/session";

/** 좋아요: 집마다 하루(KST) 1번. 주인은 houseLike 포인트를 받는다 (공용 하루 한도 안에서) */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  return json<HouseLikeResponse>(await likeHouse(getHouseStore(), id, visitorId, ipHash(req)));
});
