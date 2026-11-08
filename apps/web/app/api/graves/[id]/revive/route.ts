import { handler, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { findVisible, getAccounts, getStore } from "@/lib/store";
import { rewardReaction } from "@/lib/store/accounts";
import type { ReviveResponse } from "@/lib/types";

/**
 * "이건 살려주세요" 토글. 다시 누르면 취소된다.
 * 포인트는 묘비마다 처음 누를 때 한 번만 (취소해도 회수하지 않고, 다시 눌러도 다시 주지 않는다)
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const store = getStore();
  const grave = await findVisible(store, id);
  const result = await store.toggleRevive(id, visitorId);
  if (!result) throw notFound();
  const first = result.revived && (await store.firstRevive(id, visitorId));
  const earned = first ? await rewardReaction(getAccounts(), visitorId, grave.ownerAccountId, "revive", "gotRevive") : 0;
  return json<ReviveResponse>({ ...result, earned });
});
