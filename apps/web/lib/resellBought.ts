import { isPermanentUntil } from "@tomb/protocol";
import { shiftMonth } from "./calendar";
import { resellKindBlock } from "./resell";
import { kstDay } from "./store/accounts";
import type { AccountRecord, AccountStore } from "./store/types";

// 11/22 되팔기 「산 기록」(bought) 채우기 — 되팔기 전부터 가진 상점 꾸미기를 산 것으로 칠지 계정마다 한 번 정한다.
// 이제부터는 상점 영구 구매(style buyPermanent Lua)만 산 기록을 남긴다. 그 전에는 산 기록이 없어서, 예전부터 가진 것은 이렇게 정한다:
//  - 산 근거: 포인트 사용 기록(최근 100개)에 그 꾸미기 영구 구매(「shop:영구 {id}」 등)가 있으면 산 것 (선물 근거보다 먼저 — 사고 나서 같은 걸 선물로 또 받은 경우)
//  - 선물·보상 근거가 있으면 산 것이 아니다:
//      관리자 선물함에서 영구로 받은 것 (선물 상태가 남은 31일 안 · 발송 기록 200개 안),
//      출석 28일 구간 영구 보상 (출석 달력 100일 안 — 지금 달부터 4달 전까지)
//  - 근거가 아무것도 없으면 산 것으로 친다 (잡화점 영구 구매가 대부분이고, 오래된 선물·바다 밑 꾸미기(낚시 — 기록이 안 남는다)는 가릴 수 없다 — 산 사람을 막지 않는 쪽)
// 계정에 채움 표시(boughtFill)를 남기므로 두 번 하지 않는다. 내 정보를 처음 읽을 때(loadMe)·되팔기 전에 부른다.

/** 출석 달력을 거슬러 볼 달 수 (CALENDAR_TTL_SEC 100일 → 지금 달 포함 5달) */
const ATTEND_LOOKBACK_MONTHS = 4;
/** 출석 영구 보상 구간 (lib/attendTiers ATTEND_TIERS의 termDays null) */
const ATTEND_PERM_TIER = "28";

/** 지금 영구로 가진(입었거나 벗어 둔) 되팔기 가능한 종류의 꾸미기 id */
export function permanentSellables(a: Pick<AccountRecord, "equipped" | "stash">): string[] {
  const ids = new Set<string>();
  for (const e of [...a.equipped, ...a.stash]) if (isPermanentUntil(e.until) && !resellKindBlock(e.itemId)) ids.add(e.itemId);
  return [...ids].sort();
}

/** 포인트 사용 기록 사유 → 영구로 산 꾸미기 id (style buyPermanent 사유: 잡화점 「shop:영구 {id}」·유령선 장터 「shop:유령선 {id}」·계절 「shop:계절 영구 {id}」) */
export function boughtFromLedger(reasons: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const r of reasons) {
    const m = /^shop:(?:영구|유령선|계절 영구) ([a-z0-9_]{1,40})$/.exec(r);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * 채우기 규칙 (순수 계산): owned = 지금 영구로 가진 되팔기 종류 꾸미기 중 아직 산 기록이 없는 것,
 * paid = 구매 근거, gifted = 선물·보상 근거 → 산 것으로 칠 id
 */
export function legacyBought(owned: readonly string[], paid: ReadonlySet<string>, gifted: ReadonlySet<string>): string[] {
  return owned.filter((id) => paid.has(id) || !gifted.has(id));
}

/**
 * 출석 영구 보상 근거를 볼 달 (지금 달부터 거슬러 ATTEND_LOOKBACK_MONTHS달). 11/22 28일 구간은 그달에 출석해야 받으니
 * 마지막 출석(lastAttend)보다 뒤 달은 볼 필요가 없고, 출석한 적이 없으면 한 달도 안 본다 (달마다 달력 읽기 + 처음이면 옮기기 Lua — 채우기 한 번에 명령 40개 안팎이 들던 것)
 */
export function attendMonthsToCheck(nowDay: string, lastAttend: string | null | undefined): string[] {
  if (!lastAttend || !/^\d{8}$/.test(lastAttend)) return [];
  const last = lastAttend.slice(0, 6);
  const month = nowDay.slice(0, 6);
  return Array.from({ length: ATTEND_LOOKBACK_MONTHS + 1 }, (_, i) => shiftMonth(month, -i)).filter((m) => m <= last);
}

/** 이 계정이 선물·보상으로 영구로 받은 근거가 남은 꾸미기 id */
async function giftedEvidence(accounts: AccountStore, accountId: string, lastAttend: string | null | undefined, now: number): Promise<Set<string>> {
  const { getGifts } = await import("./store");
  const months = attendMonthsToCheck(kstDay(now), lastAttend);
  const [gifts, ...cals] = await Promise.all([getGifts().permGiftItems(accountId), ...months.map((m) => accounts.attendCalendar(accountId, m))]);
  const out = new Set(gifts);
  for (const c of cals) {
    const id = c.tiers?.[ATTEND_PERM_TIER];
    if (id) out.add(id);
  }
  return out;
}

/**
 * 산 기록 채우기를 아직 안 했으면 한다 (계정마다 한 번). 채운 뒤의 산 기록을 돌려준다 (Me.bought).
 * a = 방금 읽은 계정 (accounts.get — 11/22 산 기록까지 { bought: true }로 읽은 것)
 */
export async function ensureBoughtFill(accounts: AccountStore, accountId: string, a: AccountRecord, now = Date.now()): Promise<string[]> {
  const bought = a.bought ?? [];
  if (a.boughtFilled) return bought;
  const owned = permanentSellables(a).filter((id) => !bought.includes(id));
  let items: string[] = [];
  if (owned.length) {
    const [ledger, gifted] = await Promise.all([accounts.ledger(accountId), giftedEvidence(accounts, accountId, a.lastAttend, now)]);
    items = legacyBought(owned, boughtFromLedger(ledger.map((e) => e.reason)), gifted);
  }
  if (await accounts.fillBought(accountId, items)) return [...new Set([...bought, ...items])];
  // 이미 다른 요청이 채웠다(또는 계정이 없다) → 채울 게 있었으면 저장된 값을 다시 읽는다
  return owned.length ? ((await accounts.get(accountId, kstDay(now), now, { bought: true })).bought ?? bought) : bought;
}
