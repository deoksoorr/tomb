import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { Me } from "@/lib/types";

/**
 * 내 계정 (포인트·출석·가방·착용·내 묘비). 방문자 쿠키 = 계정.
 * 닉네임 중복 금지: 여기서 휴면(90일)을 판정하고(→ me.renameRequired) 색인에 없는 옛 이름을 색인에 채운다 (입장 시각은 남기지 않는다)
 */
export const GET = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const accounts = getAccounts();
  const now = Date.now();
  await accounts.visit(visitorId, now, false);
  return json<Me>(await loadMe(accounts, visitorId, now));
});
