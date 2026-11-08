import { requireAdmin, type AdminPointsResponse } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";
import { codeHash } from "@/lib/store/accounts";
import { AdminPointsSchema, readBody } from "@/lib/validate";

/**
 * 포인트 지급·회수 `{ code? | accountId?, delta }`. 잔액은 0~BALANCE_CAP으로 자르고 하루 적립 한도와는 무관하다.
 * 개인 코드는 해시로만 찾고 응답·로그에 남기지 않는다.
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { code, accountId: given, delta } = await readBody(req, AdminPointsSchema);
  const accounts = getAccounts();
  const accountId = given ?? (await accounts.findByCode(codeHash(code!)));
  const points = accountId ? await accounts.adjustPoints(accountId, delta) : null;
  if (!accountId || points === null) throw new HttpError(404, "NOT_FOUND", "그 계정을 찾을 수 없어요.");
  return json<AdminPointsResponse>({ accountId, points });
});
