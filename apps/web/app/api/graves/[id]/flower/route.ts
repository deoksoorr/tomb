import { DAY_RESET_TEXT } from "@/lib/gameDay";
import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { findVisible, getAccounts, getStore, pushActivity } from "@/lib/store";
import { rewardReaction } from "@/lib/store/accounts";
import type { FlowerResponse } from "@/lib/types";

/** 헌화. 같은 방문자는 묘비당 하루 1회 (한국 시간 새벽 5시에 다시 — lib/store/types flowerTtlSec). 헌화한 사람(+2)과 묘비 주인(+1)에게 포인트 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const store = getStore();
  const grave = await findVisible(store, id);
  const count = await store.flower(id, visitorId);
  if (count === null) throw notFound();
  if (count === "already") throw new HttpError(409, "ALREADY_FLOWERED", `오늘은 이미 꽃을 놓았어요. ${DAY_RESET_TEXT}가 지나면 다시 찾아와 주세요.`);
  const earned = await rewardReaction(getAccounts(), visitorId, grave.ownerAccountId, "flower", "gotFlower");
  if (grave.ownerAccountId)
    await pushActivity(grave.ownerAccountId, { kind: "flower", actorId: visitorId, targetId: id, targetName: grave.name });
  return json<FlowerResponse>({ count, earned });
});
