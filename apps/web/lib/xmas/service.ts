import { PERMANENT_UNTIL } from "@tomb/protocol";
import { HttpError } from "../http";
import { ownedPermanent } from "../forage/sunkenGrant";
import { getAccounts } from "../store";
import { kstDay, loadMe } from "../store/accounts";
import { rollXmasBox, XMAS_BOX_FALLBACK, XMAS_BOX_ID, xmasSlot, type XmasOpenResponse, type XmasPrize } from "./box";
import { getXmasStore } from "./store";

// 12월 크리스마스 선물상자 열기 (서버 전용). 뽑기는 서버가 한다: 가진 것(영구)을 읽고 → lib/xmas/box 표로 하나 →
// 저장소가 상자 1개 빼기·지급을 한 번에 (그 사이 같은 꾸미기를 가졌으면 대체 보상으로 바뀐다)

export async function openXmasBox(acct: string, now = Date.now(), roll = Math.random()): Promise<XmasOpenResponse> {
  const accounts = getAccounts();
  const a = await accounts.get(acct, kstDay(now), now);
  const have = a.inventory[XMAS_BOX_ID] ?? 0;
  if (have < 1) throw new HttpError(409, "NO_ITEM", "열 수 있는 선물상자가 없어요.");
  const owned = await ownedPermanent(acct, now);
  const pick = rollXmasBox(owned, roll);
  const slot = pick.kind === "cosmetic" ? xmasSlot(pick.id) : null;
  const res = await getXmasStore().open(acct, {
    box: XMAS_BOX_ID,
    prize: pick.kind === "cosmetic" && slot ? { itemId: pick.id, slot } : null,
    fallback: XMAS_BOX_FALLBACK,
    perm: PERMANENT_UNTIL,
  });
  if (res === "nobox") throw new HttpError(409, "NO_ITEM", "이미 연 상자예요. 가방을 다시 열어 주세요.");
  const prize: XmasPrize = res === "cosmetic" && pick.kind === "cosmetic" ? pick : { kind: "fallback", ...XMAS_BOX_FALLBACK };
  return { prize, left: Math.max(0, have - 1), me: await loadMe(accounts, acct, now) };
}
