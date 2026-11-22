import { handler, json } from "@/lib/http";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import { withoutWornItemDyes } from "@/lib/dye/itemWorn";
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
  // 11/22 입은 아이템 색(dye.items)은 색 보관함(itemDyes)에서 화면이 다시 계산한다 (lib/hooks/useMe) — 응답에서 중복을 뺀다
  return json<Me>(withoutWornItemDyes(await loadMe(accounts, visitorId, now)));
});
