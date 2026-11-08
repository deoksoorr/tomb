import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { AdminGuestSchema, isEntryId } from "@/lib/housing/schemas";
import { getHouseStore, houseNotFound, isHouseId } from "@/lib/housing/service";
import { readBody } from "@/lib/validate";

/** 방명록 글 `{ action: "hide" | "unhide" | "delete" }`. unhide는 신고 수도 비운다 */
export const POST = handler<{ id: string; entryId: string }>(async (req, { id, entryId }) => {
  await requireAdmin(req);
  const { action } = await readBody(req, AdminGuestSchema);
  if (!isHouseId(id)) throw houseNotFound();
  const store = getHouseStore();
  const gone = () => new HttpError(404, "NOT_FOUND", "그 글을 찾을 수 없어요.");
  if (!isEntryId(entryId)) throw gone();
  if (action === "delete") {
    if (!(await store.removeGuest(id, entryId))) throw gone();
  } else if (!(await store.setGuestHidden(id, entryId, action === "hide"))) throw gone();
  return json({ ok: true });
});
