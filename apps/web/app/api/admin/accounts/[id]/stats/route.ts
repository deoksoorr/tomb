import { requireAdmin } from "@/lib/admin";
import { readUserStats, type AdminUserStats } from "@/lib/adminUserStats";
import { handler, HttpError, json } from "@/lib/http";

export type AdminUserStatsResponse = AdminUserStats;

/** 계정 상세 수치 (관리자 「유저 활동」에서 유저를 누를 때). 30초 기억, ?fresh=1이면 다시 읽는다 */
export const GET = handler<{ id: string }>(async (req, { id }) => {
  await requireAdmin(req);
  if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, "BAD_ID", "계정 id가 올바르지 않아요.");
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  return json<AdminUserStatsResponse>(await readUserStats(id, Date.now(), fresh));
});
