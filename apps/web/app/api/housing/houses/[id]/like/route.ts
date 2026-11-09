import { handler, json } from "@/lib/http";
import { getHouseStore, likeHouse } from "@/lib/housing/service";
import type { HouseLikeResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, requireVisitor } from "@/lib/session";
import { pushActivity } from "@/lib/store";

/** 좋아요: 집마다 하루(KST) 1번. 주인은 houseLike 포인트를 받고 내 소식에 남는다 (공용 하루 한도 안에서) */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const store = getHouseStore();
  const result = await likeHouse(store, id, visitorId, ipHash(req));
  const h = await store.get(id);
  if (h) await pushActivity(h.owner, { kind: "houseLike", actorId: visitorId, targetId: id, targetName: h.name });
  return json<HouseLikeResponse>(result);
});
