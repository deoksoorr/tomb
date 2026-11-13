import { isPermanentUntil, isShopListed, ITEMS, PERMANENT_UNTIL, type ItemDef } from "@tomb/protocol";
import type { AttendTierView } from "./types";

// 출석 구간 코디 보상 ("이번 달 보상 길"). 그달 출석 도장 수가 구간(3·7·14·21·28일)에 닿으면 꾸미기 1개씩.
// 구간이 오를수록 가격대(상점 24시간 이용권 값)와 기간이 함께 오른다. 마지막 28일(2월은 개근)은 영구 소장.
//  - 후보: 상점에서 파는 부위 있는 캐릭터 꾸미기 (펫·운영자 전용 제외 — isShopListed)
//  - 달마다 바뀐다: 구간마다 고정 시드로 섞은 후보 목록에서 (연 × 12 + 월)번째부터 고른다 → 같은 달이면 모두 같은 보상,
//    바로 다음 달은 항상 다른 꾸미기 (후보가 2개 이상이면)
//  - 이미 영구로 가진 꾸미기는 건너뛰고 다음 후보 (가격대가 모두 영구면 다른 가격대에서 가까운 값부터)
//  - 지급(서버): 출석 도장을 찍을 때 닿은 구간을 원자적으로 한 번만 (AccountStore.grantAttendTier).
//    기간제는 입고 있으면 그 자리, 아니면 벗어 둔 꾸미기의 만료 시각을 늘리고(선물 기간과 같은 규칙), 영구는 영구 소장
// 순수 계산이라 서버·화면이 함께 쓴다.

const DAY_MS = 86_400_000;

export type AttendTierDef = {
  /** 그달 출석 도장 수가 이만큼이면 받는다 */
  days: number;
  /** 이용 기간 (일). null = 영구 소장 */
  termDays: number | null;
  /** 후보 가격대 (상점 24시간 이용권 값, 양끝 포함) */
  minPrice: number;
  maxPrice: number;
};

/** 구간 (낮은 것부터). 가격대는 겹치지 않는다 → 한 달 안에서 구간끼리 같은 꾸미기가 나오지 않는다 */
export const ATTEND_TIERS: readonly AttendTierDef[] = [
  { days: 3, termDays: 3, minPrice: 0, maxPrice: 80 },
  { days: 7, termDays: 7, minPrice: 100, maxPrice: 140 },
  { days: 14, termDays: 14, minPrice: 160, maxPrice: 200 },
  { days: 21, termDays: 30, minPrice: 240, maxPrice: 320 },
  { days: 28, termDays: null, minPrice: 360, maxPrice: Number.MAX_SAFE_INTEGER },
];

/** 구간 일수 → 정의 */
export function attendTier(days: number): AttendTierDef | undefined {
  return ATTEND_TIERS.find((t) => t.days === days);
}

/** 기간 문구: "3일" / "영구" */
export function tierTermText(termDays: number | null): string {
  return termDays === null ? "영구" : `${termDays}일`;
}

/** 이용 기간 ms (null = 영구) */
export function tierTermMs(termDays: number | null): number | null {
  return termDays === null ? null : termDays * DAY_MS;
}

/** 받은 뒤 만료 시각: 영구면 PERMANENT_UNTIL, 아니면 지금(또는 아직 남은 만료 시각)부터 기간만큼 늘린다 (선물 기간과 같은 규칙) */
export function tierUntil(termMs: number | null, had: number, now: number): number {
  if (termMs === null) return PERMANENT_UNTIL;
  return Math.min(PERMANENT_UNTIL, Math.max(had, now) + termMs);
}

/** 보상 후보가 될 수 있는 꾸미기 (상점 목록의 부위 있는 캐릭터 꾸미기, 펫·운영자 전용 제외) */
const ELIGIBLE: readonly ItemDef[] = ITEMS.filter((it) => it.kind === "cosmetic" && !!it.slot && isShopListed(it));

/** 문자열 → 32비트 시드 (FNV-1a) */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** 시드 고정 섞기 (mulberry32 + Fisher–Yates) */
function shuffled<T>(list: readonly T[], seed: number): T[] {
  let a = seed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 구간마다 고정 순서로 섞은 가격대 후보 (id). 순서는 구간 일수로만 정해진다 */
const ORDERS: ReadonlyMap<number, readonly string[]> = new Map(
  ATTEND_TIERS.map((t) => [
    t.days,
    shuffled(
      ELIGIBLE.filter((it) => it.price >= t.minPrice && it.price <= t.maxPrice).map((it) => it.id),
      hash(`attend-tier:${t.days}`),
    ),
  ]),
);

/** YYYYMM → 달 번호 (연 × 12 + 월) */
const monthNumber = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(4, 6)) - 1;

/**
 * 그달 그 구간의 꾸미기 (결정적). skip = 고르지 않을 것 (영구로 가진 것·같은 달 다른 구간에 나온 것).
 * 가격대 후보를 그달 차례부터 돌고, 모두 skip이면 다른 가격대에서 구간 가격대에 가까운 값부터. 없으면 null
 */
export function pickTierItem(month: string, tier: AttendTierDef, skip: ReadonlySet<string>): string | null {
  const order = ORDERS.get(tier.days) ?? [];
  const n = order.length;
  const start = n ? monthNumber(month) % n : 0;
  for (let i = 0; i < n; i++) {
    const id = order[(start + i) % n];
    if (!skip.has(id)) return id;
  }
  const mid = (tier.minPrice + Math.min(tier.maxPrice, tier.minPrice * 2)) / 2;
  const rest = ELIGIBLE.filter((it) => !skip.has(it.id) && !order.includes(it.id)).sort(
    (a, b) => Math.abs(a.price - mid) - Math.abs(b.price - mid) || b.price - a.price || a.id.localeCompare(b.id),
  );
  return rest[0]?.id ?? null;
}

/** 영구로 가진 꾸미기 id (착용·벗어 둔 꾸미기 중 만료 시각이 영구인 것) */
export function permOwnedOf(items: readonly { itemId: string; until: number }[]): Set<string> {
  return new Set(items.filter((e) => isPermanentUntil(e.until)).map((e) => e.itemId));
}

/**
 * 그달 보상 길: 받은 구간은 받은 꾸미기, 아직이면 지금 계정 기준으로 받을 꾸미기 (영구로 가진 것·다른 구간에 나온 것은 피한다).
 * received = 구간 일수 → 받은 꾸미기 id (저장소 기록)
 */
export function attendTierPlan(month: string, received: Readonly<Record<string, string>>, permOwned: ReadonlySet<string>): AttendTierView[] {
  const used = new Set(Object.values(received));
  return ATTEND_TIERS.map((t) => {
    const got = received[String(t.days)];
    const itemId = got ?? pickTierItem(month, t, new Set([...permOwned, ...used]));
    if (itemId) used.add(itemId);
    return { days: t.days, termDays: t.termDays, itemId, received: !!got };
  });
}

/** 안내 창·자주 묻는 질문 한 줄: "그달 출석 3일(3일)·7일(7일)·…·28일(영구)마다 코디 1개 — 갈수록 비싼 코디, 달마다 바뀌어요" */
export const ATTEND_TIER_GUIDE = `그달 출석 ${ATTEND_TIERS.map((t) => `${t.days}일(${tierTermText(t.termDays)})`).join("·")}마다 코디 1개 — 갈수록 비싼 코디, 달마다 바뀌어요`;
