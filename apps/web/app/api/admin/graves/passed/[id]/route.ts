import { deletePassed, requireAdmin } from "@/lib/admin";
import { handler, json, notFound } from "@/lib/http";
import { isGraveId } from "@/lib/validate";

/** 성불한 묘비를 완전히 지운다 (사진 포함, 되돌릴 수 없다) */
export const DELETE = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  if (!isGraveId(id) || !(await deletePassed(id))) throw notFound();
  return json({ ok: true });
});
