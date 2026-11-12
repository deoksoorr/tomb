import { adminActor } from "@/lib/ban";
import { requireAdmin } from "@/lib/admin";
import { BanEditSchema, editBan, type AdminBan } from "@/lib/banAdmin";
import { handler, json } from "@/lib/http";
import { readBody } from "@/lib/validate";

/** 47번 `{ action: "edit", days?, reason?, memo?, note? }`(기간은 지금부터 N일, null = 영구) 또는 `{ action: "lift", note? }`(조기 해제) */
export const PATCH = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  const input = await readBody(req, BanEditSchema);
  return json<{ ban: AdminBan }>({ ban: await editBan(id, input, await adminActor(req)) });
});
