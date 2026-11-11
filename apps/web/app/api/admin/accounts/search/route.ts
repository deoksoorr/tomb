import { requireAdmin } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";

export type AdminAccountRow = { accountId: string; name: string | null; points: number; rank: number };

/**
 * 닉네임으로 계정 찾기 `?name=` (부분 일치, 공백·대소문자 무시). 포인트를 한 번이라도 모은 계정(출석 포함)이 대상이다.
 * 코드 분실 문의 때 계정 id를 찾아 /api/admin/accounts/code로 새 코드를 발급하는 용도.
 */
export const GET = handler(async (req) => {
  await requireAdmin(req);
  const q = (req.nextUrl.searchParams.get("name") ?? "").replace(/\s+/g, "").toLowerCase();
  if (q.length < 1 || q.length > 20) throw new HttpError(400, "INVALID_INPUT", "찾을 닉네임을 1~20자로 입력해 주세요.");
  const { rows } = await getAccounts().pointRank(10_000, null);
  const found: AdminAccountRow[] = rows
    .filter((r) => (r.name ?? "").replace(/\s+/g, "").toLowerCase().includes(q))
    .slice(0, 30)
    .map(({ accountId, name, points, rank }) => ({ accountId, name, points, rank }));
  return json({ accounts: found });
});
