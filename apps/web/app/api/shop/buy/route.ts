import { itemById } from "@tomb/protocol";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { BuyResponse } from "@/lib/types";
import { readBody, ShopBuySchema } from "@/lib/validate";

/**
 * 구매 `{ itemId }`: 잔액 확인·차감과 가방 +1이 한 번에 일어난다 (동시에 눌러도 잔액이 음수가 되지 않는다).
 * 캐릭터 꾸미기는 가방에 있거나 지금 착용 중이면 다시 살 수 없다 (409 ALREADY_OWNED). 폭죽·묘비 꾸미기·디자인권은 여러 개 OK
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId } = await readBody(req, ShopBuySchema);
  await rateLimit("shop", req, visitorId);
  const accounts = getAccounts();
  const item = itemById(itemId)!;
  const result = await accounts.buy(visitorId, itemId, item.price, { unique: item.kind === "cosmetic" });
  if (result === "owned") throw new HttpError(409, "ALREADY_OWNED", "이미 가지고 있거나 착용 중이에요.");
  if (result === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  return json<BuyResponse>({ me: await loadMe(accounts, visitorId) });
});
