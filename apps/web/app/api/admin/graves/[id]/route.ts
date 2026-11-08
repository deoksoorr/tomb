import { requireAdmin } from "@/lib/admin";
import { handler, json, notFound } from "@/lib/http";
import { deleteGrave, getStore } from "@/lib/store";
import { AdminActionSchema, readBody } from "@/lib/validate";

/** `{ action: "hide" | "unhide" | "delete" }`. 숨김 해제 시 신고 기록도 비운다 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const { action } = await readBody(req, AdminActionSchema);
  const store = getStore();
  const ok = action === "delete" ? await deleteGrave(store, id) : await store.setHidden(id, action === "hide");
  if (!ok) throw notFound();
  return json({ ok: true });
});
