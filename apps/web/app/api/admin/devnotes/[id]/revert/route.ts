import { requireAdmin } from "@/lib/admin";
import { refreshDevNotePages, revertStaticNote } from "@/lib/devNotes/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getNotices } from "@/lib/store";

/** 고친 정적 글을 원본(posts.ts)으로 되돌리기. 예전 공지 원문을 보관해 뒀으면 그 공지를 되살린다 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  if (!(await revertStaticNote(getNotices(), id))) throw new HttpError(404, "NOT_FOUND", "고친 정적 글이 아니에요.");
  refreshDevNotePages(id);
  return json({ ok: true });
});
