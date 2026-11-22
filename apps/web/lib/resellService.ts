import { itemById } from "@tomb/protocol";
import { changed } from "./dye/service";
import type { StyleChangeResponse } from "./dye/types";
import { HttpError } from "./http";
import { resellKindBlock, resellPrice } from "./resell";
import { getAccounts } from "./store";
import { getStyleStore } from "./store/style";

// 11/22 꾸미기 되팔기 (POST /api/shop/sell). 규칙은 lib/resell (정가의 30%, 상점 꾸미기 영구 소장만, 입고 있으면 안 됨).
// 꾸미기 빼기 + 포인트 돌려주기는 계정 저장소 한 번(sellPermanent)으로 원자적 — 두 번 눌러도 한 번만 판다.
// 판 뒤 그 아이템의 염색 기록·색 보관함도 지운다 (염색권·칸 값은 돌려주지 않는다)

export async function sellCosmetic(accountId: string, itemId: string, now = Date.now()): Promise<StyleChangeResponse & { paid: number }> {
  const kind = resellKindBlock(itemId);
  if (kind) throw new HttpError(409, "NOT_SELLABLE", kind);
  const paid = resellPrice(itemId);
  if (paid <= 0) throw new HttpError(409, "NOT_SELLABLE", "팔 수 없는 꾸미기예요.");
  const accounts = getAccounts();
  const r = await accounts.sellPermanent(accountId, itemId, paid, `refund:꾸미기 되팔기(${itemById(itemId)?.name ?? itemId})`, now);
  if (r === "worn") throw new HttpError(409, "WORN", "입고 있어서 팔 수 없어요. 먼저 벗어 주세요.");
  if (r === "none") throw new HttpError(409, "NOT_OWNED", "영구로 가진 꾸미기만 팔 수 있어요. 이미 팔았을 수도 있어요.");
  await getStyleStore(accounts).clearItemDye(accountId, itemId);
  return { ...(await changed(accountId, now)), paid };
}
