import { isPermanentUntil, itemById, PERMANENT_UNTIL, type ItemDef } from "@tomb/protocol";
import { cosTierOf, rollCosDays } from "../rpg/setGearRoll";
import { getStaffStore } from "../staff";
import { getAccounts } from "../store";
import { kstDay } from "../store/accounts";

// 물에 빠진 꾸미기 지급 (서버 전용). 규칙은 lib/forage/sunken.ts.
// 11/28 물에 빠진 꾸미기는 기간제 (grantSunkenTerm — 야근 빌딩 상자 꾸미기와 같은 grantTerm: 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기의 끝을 늘린다).
// 영구 지급(grantSunkenCosmetic)은 별똥별 코디처럼 영구로 주는 곳이 쓴다 — 입고 있으면 그 자리에서 영구로, 아니면 벗어 둔 꾸미기에 영구로,
// Redis는 Lua 한 번. 포인트는 오가지 않는다.

/** 가진 꾸미기 id (입은 것 + 벗어 둔 것): perm = 영구, timed = 아직 안 끝난 기간제 */
export async function ownedCosmetics(acct: string, now = Date.now()): Promise<{ perm: Set<string>; timed: Set<string> }> {
  const a = await getAccounts().get(acct, kstDay(now), now);
  const all = [...a.equipped, ...a.stash];
  return {
    perm: new Set(all.filter((e) => isPermanentUntil(e.until)).map((e) => e.itemId)),
    timed: new Set(all.filter((e) => !isPermanentUntil(e.until) && e.until > now).map((e) => e.itemId)),
  };
}

/** 이미 영구로 가진 꾸미기 id (입은 것 + 벗어 둔 것) */
export async function ownedPermanent(acct: string, now = Date.now()): Promise<Set<string>> {
  return (await ownedCosmetics(acct, now)).perm;
}

/** 11/28 물에 빠진 꾸미기 기간(일): 상자 꾸미기와 같은 표 (lib/rpg/setGearRoll COS_DAYS — 1일 45% · 3일 30% · 7일 20% · 30일 5%, 전설 등급은 30일 대신 7일). r = 0~1 난수 하나 */
export const sunkenDays = (r: number, item: Pick<ItemDef, "price">): number => rollCosDays(() => r, cosTierOf(item.price));

/** 11/28 꾸미기 하나를 days일 기간제로 (원자적, 가진 기간에 더한다 — 줄지 않는다). 넣었으면 true, 이미 영구거나 부위가 없으면 false */
export async function grantSunkenTerm(acct: string, itemId: string, days: number, now: number): Promise<boolean> {
  if (!itemById(itemId)?.slot || days <= 0) return false;
  return (await getAccounts().grantTerm(acct, itemId, days * 86_400_000, now)) === "ok";
}

/** 꾸미기 하나를 영구 소장으로 (원자적). 새로 넣었으면 true, 이미 영구거나 계정이 없으면 false */
export async function grantSunkenCosmetic(acct: string, itemId: string): Promise<boolean> {
  const item = itemById(itemId);
  if (!item?.slot) return false;
  return (await getStaffStore().grant(getAccounts(), acct, [{ itemId, slot: item.slot }], PERMANENT_UNTIL)) === 1;
}
