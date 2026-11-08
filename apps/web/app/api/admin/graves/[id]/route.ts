import { applyAdminAction, requireAdmin } from "@/lib/admin";
import { handler, json, notFound } from "@/lib/http";
import { getStore } from "@/lib/store";
import { AdminActionSchema, readBody } from "@/lib/validate";

/**
 * `{ action: "hide" | "unhide" | "delete" | "resetReports" }`.
 * unhide는 신고 수를 0으로 되돌리고(기록은 남김), resetReports는 신고 수와 기록을 비운다(숨김은 그대로).
 */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const { action } = await readBody(req, AdminActionSchema);
  if (!(await applyAdminAction(getStore(), id, action))) throw notFound();
  return json({ ok: true });
});
