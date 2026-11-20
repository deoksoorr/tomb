import { requireAdmin } from "@/lib/admin";
import { balanceStats, type AdminBalancesResponse } from "@/lib/adminBalances";
import { handler, HttpError, json } from "@/lib/http";

/**
 * 관리자 경제 탭 포인트 잔액 `?scope=all|active&q=&fresh=1`. 운영자 계정은 빼고 센다.
 * 회원 목록이 훑어 둔 목록을 다시 쓰고 계산 결과를 몇 분 기억한다 (lib/adminBalances). fresh=1이면 다시 훑는다.
 * 이메일 같은 개인정보는 넣지 않는다 (닉네임·잔액·최근 접속·상태만)
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (q.length > 64) throw new HttpError(400, "INVALID_INPUT", "검색어는 64자까지예요.");
  return json<AdminBalancesResponse>(await balanceStats({ scope: sp.get("scope") === "active" ? "active" : "all", q, fresh: sp.get("fresh") === "1" }));
});
