import { runAfter } from "@/lib/analyticsService";
import { notifyMe } from "@/lib/ban";
import { requireAdmin, type AdminPointsResponse } from "@/lib/admin";
import { handler, HttpError, json } from "@/lib/http";
import { getAccounts } from "@/lib/store";
import { codeHash } from "@/lib/store/accounts";
import { ONCE_PENDING, onceClaim, onceDone, onceRelease } from "@/lib/store/once";
import { AdminPointsSchema, readBody } from "@/lib/validate";

/**
 * 포인트 지급·회수 `{ code? | accountId?, delta }`. 한 번에 ±BALANCE_CAP까지, 잔액은 0~WALLET_MAX로 자르고 횟수 규칙과는 무관하다.
 * 개인 코드는 해시로만 찾고 응답·로그에 남기지 않는다.
 */
export const POST = handler(async (req) => {
  await requireAdmin(req);
  const { code, accountId: given, delta, requestId } = await readBody(req, AdminPointsSchema);
  // 11/16 같은 요청 번호는 한 번만 지급한다 (두 번 눌러 두 번 들어가지 않게). 이미 처리했으면 그때 결과를 돌려준다
  const once = requestId ? `points:${requestId}` : null;
  if (once) {
    const prior = await onceClaim(once);
    if (prior === ONCE_PENDING) throw new HttpError(409, "IN_PROGRESS", "이미 처리하는 중이에요.");
    if (prior !== null) return json<AdminPointsResponse>(JSON.parse(prior) as AdminPointsResponse);
  }
  const accounts = getAccounts();
  let accountId: string | null = null;
  let points: number | null = null;
  try {
    accountId = given ?? (await accounts.findByCode(codeHash(code!)));
    points = accountId ? await accounts.adjustPoints(accountId, delta) : null;
  } catch (e) {
    if (once) await onceRelease(once).catch(() => undefined);
    throw e;
  }
  if (!accountId || points === null) {
    if (once) await onceRelease(once).catch(() => undefined);
    throw new HttpError(404, "NOT_FOUND", "그 계정을 찾을 수 없어요.");
  }
  if (once) await onceDone(once, JSON.stringify({ accountId, points }));
  // 접속 중이면 그 사람 화면의 포인트를 바로 맞춘다 (응답 뒤에 보낸다. 실시간 서버에 못 닿아도 지급은 끝났다)
  runAfter(() => notifyMe([accountId]));
  return json<AdminPointsResponse>({ accountId, points });
});
