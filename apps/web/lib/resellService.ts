import { itemById } from "@tomb/protocol";
import { changed } from "./dye/service";
import type { StyleChangeResponse } from "./dye/types";
import { HttpError } from "./http";
import { RESELL_GIFT_BLOCK, resellKindBlock, resellPrice } from "./resell";
import { ensureBoughtFill } from "./resellBought";
import { kstDay } from "./store/accounts";
import { getAccounts } from "./store";
import { getStyleStore } from "./store/style";

// 11/22 꾸미기 되팔기 (POST /api/shop/sell). 규칙은 lib/resell (정가의 30%, 상점 꾸미기 영구 소장만, 입고 있으면 안 됨).
// 꾸미기 빼기 + 포인트 돌려주기는 계정 저장소 한 번(sellPermanent)으로 원자적 — 두 번 눌러도 한 번만 판다.
// 판 뒤 그 아이템의 염색 기록·색 보관함도 지운다 (염색권·칸 값은 돌려주지 않는다)
// 11/22 포인트를 내고 영구로 산 기록(bought)이 있는 것만 판다 (선물·보상으로 받은 상점 꾸미기는 못 판다). 팔면 산 기록도 같이 지운다

export async function sellCosmetic(accountId: string, itemId: string, now = Date.now()): Promise<StyleChangeResponse & { paid: number }> {
  const kind = resellKindBlock(itemId);
  if (kind) throw new HttpError(409, "NOT_SELLABLE", kind);
  const paid = resellPrice(itemId);
  if (paid <= 0) throw new HttpError(409, "NOT_SELLABLE", "팔 수 없는 꾸미기예요.");
  const accounts = getAccounts();
  // 되팔기 전부터 가진 꾸미기의 산 기록 채우기 (계정마다 한 번 — 보통은 내 정보를 읽을 때 이미 끝나 있다)
  await ensureBoughtFill(accounts, accountId, await accounts.get(accountId, kstDay(now), now, { bought: true }), now);
  const r = await accounts.sellPermanent(accountId, itemId, paid, `refund:꾸미기 되팔기(${itemById(itemId)?.name ?? itemId})`, now);
  if (r === "worn") throw new HttpError(409, "WORN", "입고 있어서 팔 수 없어요. 먼저 벗어 주세요.");
  if (r === "gift") throw new HttpError(409, "NOT_SELLABLE", RESELL_GIFT_BLOCK);
  if (r === "none") throw new HttpError(409, "NOT_OWNED", "영구로 가진 꾸미기만 팔 수 있어요. 이미 팔았을 수도 있어요.");
  await getStyleStore(accounts).clearItemDye(accountId, itemId);
  return { ...(await changed(accountId, now)), paid };
}
