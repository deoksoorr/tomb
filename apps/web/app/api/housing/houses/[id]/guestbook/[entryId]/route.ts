import { handler, HttpError, json } from "@/lib/http";
import { isEntryId } from "@/lib/housing/schemas";
import { deleteGuest, getHouseStore, guestView } from "@/lib/housing/service";
import type { GuestbookResponse } from "@/lib/housing/types";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";

/** 방명록 글 지우기: 쓴 사람 또는 집주인 */
export const DELETE = handler<{ id: string; entryId: string }>(async (req, { id, entryId }) => {
  const visitorId = await requireVisitor(req);
  if (!isEntryId(entryId)) throw new HttpError(404, "NOT_FOUND", "그 글을 찾을 수 없어요.");
  await rateLimit("reaction", req, visitorId);
  const store = getHouseStore();
  await deleteGuest(store, id, entryId, visitorId);
  return json<GuestbookResponse>({ entries: await guestView(store, id, visitorId) });
});
