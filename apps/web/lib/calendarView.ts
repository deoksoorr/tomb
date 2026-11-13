import { itemById } from "@tomb/protocol";
import { attendTierPlan, permOwnedOf, tierTermMs } from "./attendTiers";
import { buildCalendar } from "./calendar";
import type { AccountStore } from "./store/types";
import { kstDay } from "./store/accounts";
import type { AttendTierGrant, CalendarResponse } from "./types";

/** 그 달 달력 (KST). 오늘·머문 시간은 now 기준 (라우트 공용) */
export async function calendarOf(accounts: AccountStore, visitorId: string, month: string, now: number): Promise<CalendarResponse> {
  const today = kstDay(now);
  const [rec, acct] = await Promise.all([accounts.attendCalendar(visitorId, month), accounts.get(visitorId, today, now)]);
  return buildCalendar(month, today, rec, acct);
}

/**
 * 출석 구간 코디 보상 지급 (출석 도장을 찍은 직후): 그달 도장 수가 닿았는데 아직 안 받은 구간을 모두 준다
 * (지난번에 못 준 구간이 있어도 여기서 이어서 준다). 받을 꾸미기는 lib/attendTiers.ts가 정하고(영구로 가진 것은 피한다),
 * 한 번만 주는 판정·기록·지급은 저장소가 원자적으로 한다 → 동시에 불려도 구간마다 한 번. 이번에 준 것만 돌려준다
 */
export async function grantAttendTiers(accounts: AccountStore, visitorId: string, month: string, now: number): Promise<AttendTierGrant[]> {
  const [rec, acct] = await Promise.all([accounts.attendCalendar(visitorId, month), accounts.get(visitorId, kstDay(now), now)]);
  const stamped = Object.keys(rec.days).length;
  const plan = attendTierPlan(month, rec.tiers, permOwnedOf([...acct.equipped, ...acct.stash]));
  const out: AttendTierGrant[] = [];
  for (const t of plan) {
    if (t.received || !t.itemId || stamped < t.days) continue;
    const slot = itemById(t.itemId)?.slot;
    if (!slot) continue;
    if (await accounts.grantAttendTier(visitorId, month, t.days, t.itemId, slot, tierTermMs(t.termDays), now))
      out.push({ days: t.days, itemId: t.itemId, termDays: t.termDays });
  }
  return out;
}
