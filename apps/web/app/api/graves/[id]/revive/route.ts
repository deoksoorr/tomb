import { handler, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { findVisible, getStore } from "@/lib/store";
import type { ReviveResponse } from "@/lib/types";

/** "이건 살려주세요" 토글. 다시 누르면 취소된다 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const store = getStore();
  await findVisible(store, id);
  const result = await store.toggleRevive(id, visitorId);
  if (!result) throw notFound();
  return json<ReviveResponse>(result);
});
