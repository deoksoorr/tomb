import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { findVisible, getAccounts, getStore } from "@/lib/store";
import { rewardReaction } from "@/lib/store/accounts";
import type { FlowerResponse } from "@/lib/types";

/** 헌화. 같은 방문자는 묘비당 24시간에 1회. 헌화한 사람(+2)과 묘비 주인(+1)에게 포인트 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const store = getStore();
  const grave = await findVisible(store, id);
  const count = await store.flower(id, visitorId);
  if (count === null) throw notFound();
  if (count === "already") throw new HttpError(409, "ALREADY_FLOWERED", "오늘은 이미 꽃을 놓았어요. 내일 다시 찾아와 주세요.");
  const earned = await rewardReaction(getAccounts(), visitorId, grave.ownerAccountId, "flower", "gotFlower");
  return json<FlowerResponse>({ count, earned });
});
