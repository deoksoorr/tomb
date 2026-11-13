import { isPermanentUntil, itemById, PERMANENT_UNTIL } from "@tomb/protocol";
import { getStaffStore } from "../staff";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";

// 물에 빠진 꾸미기 지급 (서버 전용). 규칙은 lib/forage/sunken.ts.
// 영구 소장은 기존 영구 꾸미기와 같은 저장(입고 있으면 그 자리에서 영구로, 아니면 벗어 둔 꾸미기에 영구로)을
// 한 번에 바꾸는 grant(Redis는 Lua 한 번)로 넣는다 — 포인트는 오가지 않는다.

/** 이미 영구로 가진 꾸미기 id (입은 것 + 벗어 둔 것) */
export async function ownedPermanent(acct: string, now = Date.now()): Promise<Set<string>> {
  const a = await getAccounts().get(acct, kstDay(now), now);
  return new Set([...a.equipped, ...a.stash].filter((e) => isPermanentUntil(e.until)).map((e) => e.itemId));
}

/** 꾸미기 하나를 영구 소장으로 (원자적). 새로 넣었으면 true, 이미 영구거나 계정이 없으면 false */
export async function grantSunkenCosmetic(acct: string, itemId: string): Promise<boolean> {
  const item = itemById(itemId);
  if (!item?.slot) return false;
  return (await getStaffStore().grant(getAccounts(), acct, [{ itemId, slot: item.slot }], PERMANENT_UNTIL)) === 1;
}
