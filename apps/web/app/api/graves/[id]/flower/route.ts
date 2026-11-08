import { handler, HttpError, json, notFound } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { findVisible, getStore } from "@/lib/store";
import type { FlowerResponse } from "@/lib/types";

/** 헌화. 같은 방문자는 묘비당 24시간에 1회 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  const visitorId = await requireVisitor(req);
  await rateLimit("reaction", req, visitorId);
  const store = getStore();
  await findVisible(store, id);
  const count = await store.flower(id, visitorId);
  if (count === null) throw notFound();
  if (count === "already") throw new HttpError(409, "ALREADY_FLOWERED", "오늘은 이미 꽃을 놓았어요. 내일 다시 찾아와 주세요.");
  return json<FlowerResponse>({ count });
});
