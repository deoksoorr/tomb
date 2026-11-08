import { handler, HttpError, json } from "@/lib/http";
import { isEntryId } from "@/lib/housing/schemas";
import { findVisibleHouse, getHouseStore } from "@/lib/housing/service";
import { rateLimit } from "@/lib/ratelimit";
import { ipHash, requireVisitor } from "@/lib/session";

/** 방명록 신고: IP 단위로 세고, 서로 다른 IP 3곳이 신고하면 가린다 */
export const POST = handler<{ id: string; entryId: string }>(async (req, { id, entryId }) => {
  const visitorId = await requireVisitor(req);
  if (!isEntryId(entryId)) throw new HttpError(404, "NOT_FOUND", "그 글을 찾을 수 없어요.");
  await rateLimit("report", req, visitorId);
  const store = getHouseStore();
  const h = await findVisibleHouse(store, id);
  const r = await store.reportGuest(h.id, entryId, ipHash(req));
  if (r === null) throw new HttpError(404, "NOT_FOUND", "그 글을 찾을 수 없어요.");
  return json({ ok: true, duplicate: r === "duplicate" });
});
