import { requireAdmin } from "@/lib/admin";
import { handler, json } from "@/lib/http";
import { userActivityReport, type UserActivityReport } from "@/lib/userActivity";

/**
 * 관리자 유저 활동 보고서 `?staff=1&fresh=1`. DAU·WAU·MAU·신규 · 일별·주별 리텐션 · 자주 오는 유저 · VIP·단골 · 마지막 접속 구간 · 떠난 단골.
 * 운영자 계정은 빼고 세며 staff=1이면 넣는다. 5분 동안 기억해 두고, fresh=1이면 다시 센다 (정의는 lib/userActivity.ts)
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  return json<UserActivityReport>(await userActivityReport({ includeStaff: sp.get("staff") === "1", fresh: sp.get("fresh") === "1" }));
});
