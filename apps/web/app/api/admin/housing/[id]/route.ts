import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { AdminHouseSchema } from "@/lib/housing/schemas";
import { getHouseStore, houseNotFound, isHouseId } from "@/lib/housing/service";
import { readBody } from "@/lib/validate";

/** `{ action: "hide" | "unhide" | "delete" }`. 숨기면 목록·랭킹·방문에서 빠진다. delete는 배치·가방·방명록까지 지운다(포인트는 돌려주지 않는다) */
export const POST = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const { action } = await readBody(req, AdminHouseSchema);
  const store = getHouseStore();
  if (!isHouseId(id) || !(await store.get(id))) throw houseNotFound();
  if (action === "delete") await store.remove(id);
  else await store.setHidden(id, action === "hide");
  return json({ ok: true });
});
