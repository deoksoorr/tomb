import { listAdminGraves, requireAdmin, type AdminGrave } from "@/lib/admin";
import { handler, json } from "@/lib/http";

/** 숨김 포함 전체 목록 + 묘비별 신고 수·최근 신고 기록 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  return json<{ graves: AdminGrave[] }>({ graves: await listAdminGraves() });
});
