import { requireAdmin } from "@/lib/admin";
import { listMembers, type AdminMembersResponse } from "@/lib/adminMembers";
import { handler, HttpError, json } from "@/lib/http";

/**
 * 관리자 회원 목록 `?q=&cursor=&fresh=1`. 최근 접속 순으로 한 페이지 50명, 다음 페이지는 응답의 next를 cursor로.
 * q = 이름 일부(공백·_·대소문자 무시) 또는 계정 id 앞부분. fresh=1이면 저장해 둔 목록(30초)을 버리고 다시 훑는다
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (q.length > 64) throw new HttpError(400, "INVALID_INPUT", "검색어는 64자까지예요.");
  const cursor = sp.get("cursor");
  if (cursor && cursor.length > 100) throw new HttpError(400, "INVALID_INPUT", "페이지 커서가 올바르지 않아요.");
  return json<AdminMembersResponse>(await listMembers({ q, cursor, fresh: sp.get("fresh") === "1" }));
});
