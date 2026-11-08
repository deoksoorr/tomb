import { applyAdminAction, requireAdmin, type AdminBulkResponse } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { getStore } from "@/lib/store";
import { AdminBulkSchema, readBody } from "@/lib/validate";

/** 일괄 처리 `{ ids (최대 100개), action }`. 하나씩 순서대로 처리하고 없는 묘비는 따로 알려 준다 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { ids, action } = await readBody(req, AdminBulkSchema);
  const store = getStore();
  const result: AdminBulkResponse = { done: [], notFound: [] };
  for (const id of ids) (await applyAdminAction(store, id, action) ? result.done : result.notFound).push(id);
  return json(result);
});
