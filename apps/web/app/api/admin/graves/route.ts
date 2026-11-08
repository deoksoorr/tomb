import { requireAdmin, type AdminGrave } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { byCreated, getStore, toPublicGrave } from "@/lib/store";

/** 숨김 포함 전체 목록 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const records = (await getStore().list()).sort(byCreated);
  return json<{ graves: AdminGrave[] }>({
    graves: records.map((r) => ({ ...toPublicGrave(r), hidden: !!r.hidden })),
  });
});
