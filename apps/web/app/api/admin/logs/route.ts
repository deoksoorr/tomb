import { requireAdmin } from "@/lib/admin";
import { readAdminLogs, type AdminLogsResponse } from "@/lib/adminLogs";
import { handler, HttpError, json } from "@/lib/http";

/**
 * 11/26 관리자 운영 기록 `?list=conn|hunt&account=계정id`. 계정을 주면 그 계정 50줄(+가입 유입), 없으면 전체 최근 500줄.
 * conn = 접속 기록(들어옴·나감·화면 오류), hunt = 사냥터 기록
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const q = req.nextUrl.searchParams;
  const list = q.get("list") ?? "conn";
  if (list !== "conn" && list !== "hunt") throw new HttpError(400, "INVALID_INPUT", "기록 종류는 conn·hunt 중 하나예요.");
  const account = q.get("account")?.trim() || null;
  if (account && !/^[\w-]{1,64}$/.test(account)) throw new HttpError(400, "BAD_ID", "계정 id가 올바르지 않아요.");
  return json<AdminLogsResponse>(await readAdminLogs(list, account), { headers: { "Cache-Control": "no-store" } });
});
