import { itemById } from "@tomb/protocol";
import { handler, HttpError, json } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { requireVisitor } from "@/lib/session";
import { getAccounts } from "@/lib/store";
import { loadMe } from "@/lib/store/accounts";
import type { BuyResponse } from "@/lib/types";
import { readBody, ShopBuySchema } from "@/lib/validate";
import { discountedPrice } from "@/lib/titles";
import { titleDiscount } from "@/lib/titlesServer";

/**
 * 구매 `{ itemId }`: 잔액 확인·차감과 가방 +1이 한 번에 일어난다 (동시에 눌러도 잔액이 음수가 되지 않는다).
 * 값은 단 칭호의 상점 할인을 뺀 값 (lib/titles discountedPrice). 캐릭터 꾸미기는 가방에 있거나 지금 착용 중이면 다시 살 수 없다 (409 ALREADY_OWNED). 폭죽·묘비 꾸미기·디자인권은 여러 개 OK
 */
export const POST = handler(async (req) => {
  const visitorId = await requireVisitor(req);
  const { itemId } = await readBody(req, ShopBuySchema);
  await rateLimit("shop", req, visitorId);
  const accounts = getAccounts();
  const item = itemById(itemId)!;
  // 단 칭호의 상점 할인 (lib/titles TITLE_PERKS — 원가 × (1 − 할인율), 1P 단위 내림)
  const price = discountedPrice(item.price, await titleDiscount(visitorId));
  const result = await accounts.buy(visitorId, itemId, price, { unique: item.kind === "cosmetic" });
  if (result === "owned") throw new HttpError(409, "ALREADY_OWNED", "이미 가지고 있거나 착용 중이에요.");
  if (result === "insufficient") throw new HttpError(409, "NOT_ENOUGH_POINTS", "포인트가 모자라요.");
  return json<BuyResponse>({ me: await loadMe(accounts, visitorId) });
});
