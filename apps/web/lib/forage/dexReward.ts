import { earnPoints } from "../store";
import { kstDay } from "../store/accounts";
import type { Me } from "../types";
import {
  DEX_CATS,
  DEX_EXPANSION_IDS,
  DEX_MAP_BADGE,
  DEX_MAP_REWARD,
  DEX_MAPS,
  dexMapClaimKey,
  dexMapDone,
  DEX_REWARD,
  DEX_TIERS,
  DEX_TITLE_TIERS,
  DEX_TITLES,
  dexCatOf,
  dexClaimKey,
  dexIdsOf,
  dexRewardOf,
  dexTitleNeed,
  isCampSpecies,
  LIFE_CATS,
  SPECIES,
  type DexCat,
  type DexMap,
  type DexTitleTier,
} from "./catalog";
import type { DexPay, ForageStore } from "./store";
import type { DexGain, DexMapBadgeGain, DexRewardState } from "./types";

// 도감 보상 (11/14 개편): 예전 25·50·75·100% 단계 보상 대신 종(칸) 하나를 처음 등록할 때마다 희귀도별 포인트 (catalog DEX_NEW_REWARD).
//  - 등록 순간: 저장소의 등록 연산(grant·grantAuto·addStars)이 정산을 마친 계정이면 그 종의 보상을 "받을 도감 보상"(p:{cat})에 원자적으로 쌓고,
//    이어서 여기서 그만큼 꺼내(takeDexPending) earnPoints("dex")로 지갑에 넣는다. 11/19 하루 한도가 없어져 보통 바로 다 들어가고,
//    지갑이 꽉 차 못 들어간 만큼(또는 예전 하루 한도로 쌓여 있던 것)은 p:{cat}에 남아 도감 창의 [도감 보상 받기]로 받는다
//    (꺼내기가 원자적이라 동시에 눌러도 한 번만).
//  - 전환 정산(계정당 한 번, settleDex): 도감 정보를 처음 읽을 때 (지금 등록된 종의 보상 합 − 그 칸에서 받은 예전 단계 보상)이 양수면 받을 보상에.
//    정산 전 등록은 보상을 쌓지 않고 정산이 한꺼번에 세므로 두 번 받지 않는다. 예전 단계 기록(claims)은 지우지 않는다.
//  - 칭호: 그 칸의 절반·전부를 등록하면 자동으로 (지금 종 수 기준). 예전에 단계 보상으로 받은 칭호와 한 번 붙은 칭호(t: 표시)는 유지된다.

const has = (dex: Record<string, { n: number }>, id: string) => (dex[id]?.n ?? 0) > 0;

/** 칭호 열쇠 `${cat}:${50|100}` → 칭호 이름 */
function titleName(key: string): string | undefined {
  const [cat, tier] = key.split(":");
  return DEX_TITLES[cat as DexCat]?.[Number(tier) as DexTitleTier];
}

/**
 * 11/26 도감 확장 전에 닿았던 칭호도 지켜요: 붙은 표시(t:)는 11/14부터 도감을 읽거나 등록할 때마다 남겨서 그 뒤에 채운 사람은 이미 있어요.
 * 그 전에 채우고 그 뒤로 안 들어온 사람 몫만 — 확장 전 종(캠핑장·확장 84종 빼고)을 11/14까지 처음 등록한 것만 세요 (그 뒤 등록으로는 안 닿아요)
 */
const MARKS_SINCE = "20261114";
const PRE_EXPANSION = new Set(SPECIES.filter((s) => !isCampSpecies(s) && !DEX_EXPANSION_IDS.includes(s.id)).map((s) => s.id));
function legacyTitleKeys(dex: Record<string, { n: number; first?: string }>): string[] {
  const out: string[] = [];
  for (const cat of LIFE_CATS) {
    const ids = dexIdsOf(cat).filter((id) => PRE_EXPANSION.has(id));
    const got = ids.filter((id) => has(dex, id) && !!dex[id].first && dex[id].first! <= MARKS_SINCE).length;
    if (!got) continue;
    for (const t of DEX_TITLE_TIERS) if (DEX_TITLES[cat][t] && got >= (t === 100 ? ids.length : Math.ceil(ids.length / 2))) out.push(dexClaimKey(cat, t));
  }
  return out;
}

/** 지금 도감으로 붙는 칭호 열쇠 (절반·전부 등록 + 11/26 확장 전 기준으로 닿았던 것) */
export function reachedTitleKeys(dex: Record<string, { n: number; first?: string }>): string[] {
  const out: string[] = [];
  for (const cat of DEX_CATS) {
    const got = dexIdsOf(cat).filter((id) => has(dex, id)).length;
    for (const t of DEX_TITLE_TIERS) if (DEX_TITLES[cat][t] && got >= dexTitleNeed(cat, t)) out.push(dexClaimKey(cat, t));
  }
  for (const k of legacyTitleKeys(dex)) if (!out.includes(k)) out.push(k);
  return out;
}

/** 칭호 목록: 예전 단계 보상으로 받은 것 ∪ 붙은 표시 ∪ 지금 도감으로 닿은 것 (칸 순서·절반 → 전부 순) */
export function titlesOf(dex: Record<string, { n: number }>, claims: Record<string, string>, marks: readonly string[]): string[] {
  const keys = new Set([...marks, ...reachedTitleKeys(dex)]);
  const out: string[] = [];
  for (const cat of DEX_CATS)
    for (const t of DEX_TITLE_TIERS) {
      const k = dexClaimKey(cat, t);
      const name = DEX_TITLES[cat][t];
      if (name && (claims[k] || keys.has(k))) out.push(name);
    }
  return out;
}

/** 화면용: 칸별 받을 보상과 받은 보상 (받은 보상 = 예전 단계 보상 + 새 방식으로 받은 것) */
export function rewardState(claims: Record<string, string>, pay: DexPay): DexRewardState {
  const got: Partial<Record<DexCat, number>> = {};
  for (const cat of DEX_CATS) {
    let n = pay.paid[cat] ?? 0;
    for (const t of DEX_TIERS) if (claims[dexClaimKey(cat, t)]) n += DEX_REWARD[t];
    if (n > 0) got[cat] = n;
  }
  return { pending: { ...pay.pending }, got };
}

/** 아직 전환 정산을 안 했으면 한다 (계정당 한 번, 저장소가 원자적으로 막는다). 이번에 정산했으면 true (이미 했으면 false) */
export async function ensureDexSettled(store: ForageStore, acct: string, pay: DexPay | null, now: number): Promise<boolean> {
  if (pay?.settled) return false;
  if (!pay && (await store.dexPay(acct)).settled) return false;
  return (await store.settleDex(acct, kstDay(now))) !== null;
}

/**
 * 받을 도감 보상에서 max까지 꺼내 지갑에 넣는다. 못 들어간 만큼은 되돌린다.
 * earned = 지갑에 들어간 포인트, paid = 그게 받을 보상으로 얼마어치인지 (포인트 배수 이벤트로 도감을 골랐으면 earned보다 적다, 아니면 같다)
 */
async function payFrom(
  store: ForageStore,
  acct: string,
  cat: DexCat,
  max: number,
  ip: string | undefined,
  bonus = 0,
): Promise<{ taken: number; earned: number; paid: number; me: Me | null }> {
  const taken = await store.takeDexPending(acct, cat, max);
  if (taken <= 0) return { taken: 0, earned: 0, paid: 0, me: null };
  // 11/16 도감 갈래 칭호: 꺼낸 보상 × bonus를 같은 적립에 얹는다 (적립 한 번 — 명령이 늘지 않는다).
  // 지갑이 꽉 차면 원래 보상부터 채우고, 못 받은 덧붙임은 쌓아 두지 않는다
  const extra = bonus > 0 ? dexBonusOf(taken, bonus) : 0;
  let earned = 0;
  let paid = 0;
  let me: Me | null = null;
  try {
    const r = await earnPoints(acct, "dex", taken + extra, ip);
    earned = r.earned;
    // 받은 보상 기록은 원래 보상 몫만 (보상 값 단위 — 덧붙임은 받을 보상에 되돌리지 않는다)
    paid = Math.min(taken, r.paid);
    me = r.me;
  } finally {
    // 적립이 실패해도 꺼낸 것은 받을 보상으로 되돌린다 (받은 기록은 보상 값 단위로)
    await store.dexPaid(acct, cat, taken, paid);
  }
  return { taken, earned, paid, me };
}

/** 11/16 도감 새 칸 보상 덧붙임 (보상 × 비율을 1P 단위로 반올림, 비율이 있으면 최소 1P) */
export const dexBonusOf = (points: number, bonus: number): number => (points > 0 && bonus > 0 ? Math.max(1, Math.round(points * bonus)) : 0);

/**
 * 등록 경로(낚시·채집·자동 낚시·별자리)에서 부른다: 이번에 처음 등록된 칸들의 보상을 그 자리에서 지급하고 결과를 돌려준다.
 * 새로 등록된 게 없으면 undefined. 지급 실패가 낚시·채집 결과를 막지 않게 부르는 쪽에서 잡는다
 */
export async function payNewDex(
  store: ForageStore,
  acct: string,
  granted: readonly { id: string; isNew: boolean }[],
  ip: string | undefined,
  now: number,
  bonusOf?: () => Promise<number>,
): Promise<DexGain | undefined> {
  const fresh = granted.filter((g) => g.isNew && dexRewardOf(g.id) > 0);
  if (!fresh.length) return undefined;
  // 11/16 도감 갈래 칭호의 새 칸 보상 비율 (새로 등록한 게 있을 때만 묻는다 — 부르는 쪽이 lib/titlesServer wornPerk로. 순환 import를 피해 여기서 읽지 않는다)
  const bonus = bonusOf ? await bonusOf().catch(() => 0) : 0;
  // 정산 전 계정이면 지금 정산 (이번 등록도 정산에 들어가 받을 보상에 쌓인다)
  await ensureDexSettled(store, acct, null, now);
  const byCat = new Map<DexCat, number>();
  for (const g of fresh) {
    const cat = dexCatOf(g.id)!;
    byCat.set(cat, (byCat.get(cat) ?? 0) + dexRewardOf(g.id));
  }
  let points = 0;
  let earned = 0;
  let paid = 0;
  let me: Me | null = null;
  for (const [cat, n] of byCat) {
    points += n;
    const r = await payFrom(store, acct, cat, n, ip, bonus);
    earned += r.earned;
    paid += r.paid;
    me = r.me ?? me;
  }
  // 새로 닿은 칭호: 이번 등록 전 도감으로는 못 닿았고, 예전 단계 보상·붙은 표시로도 없던 것
  const after = await store.dex(acct);
  const before = { ...after.dex };
  for (const g of fresh) delete before[g.id];
  const held = new Set([...reachedTitleKeys(before), ...after.pay.marks, ...Object.keys(after.claims)]);
  const reached = reachedTitleKeys(after.dex);
  await store.markDexTitles(acct, reached, kstDay(now));
  const titles = reached
    .filter((k) => !held.has(k))
    .map(titleName)
    .filter((t): t is string => !!t);
  // 11/26 이번 등록으로 맵 도감을 다 채웠으면 완성 배지·보상 (받은 기록은 방금 읽은 claims)
  const map = await payMapBadges(store, acct, after.dex, after.claims, ip, now);
  if (map.me) me = map.me;
  const mapEarned = map.badges.reduce((n, b) => n + b.points, 0);
  return {
    points,
    earned: earned + mapEarned,
    pending: points - paid,
    titles,
    ...(map.badges.length ? { badges: map.badges } : {}),
    ...(me && earned + mapEarned > 0 ? { me } : {}),
  };
}

/**
 * 11/26 맵별 도감 완성 배지: 마을·바닷가·캠핑장 도감을 다 채웠고 아직 안 받았으면 받은 표시(claims `map:${맵}`, HSETNX — 한 번만)를 남기고
 * 완성 보상(DEX_MAP_REWARD)을 「도감」 포인트로 준다. 지갑이 꽉 차 못 들어간 만큼은 쌓아 두지 않는다 (배지는 그대로).
 * claims = 이미 읽어 둔 받은 기록 (있으면 다 받은 맵은 저장소에 묻지 않는다)
 */
export async function payMapBadges(
  store: ForageStore,
  acct: string,
  dex: Record<string, { n: number }>,
  claims: Record<string, string> | null,
  ip: string | undefined,
  now: number,
): Promise<{ badges: DexMapBadgeGain[]; me: Me | null }> {
  const badges: DexMapBadgeGain[] = [];
  let me: Me | null = null;
  for (const m of DEX_MAPS as readonly DexMap[]) {
    const key = dexMapClaimKey(m);
    if ((claims && claims[key]) || !dexMapDone(dex, m)) continue;
    if (!(await store.claimDex(acct, key, kstDay(now)))) continue;
    const pts = DEX_MAP_REWARD[m];
    let earned = 0;
    if (pts > 0) {
      const r = await earnPoints(acct, "dex", pts, ip);
      earned = r.earned;
      me = r.me ?? me;
    }
    badges.push({ map: m, name: DEX_MAP_BADGE[m], points: earned });
  }
  return { badges, me };
}

/** 도감 창의 [도감 보상 받기]: 그 칸의 받을 보상을 한 번에 받는다 (동시에 눌러도 꺼내기가 원자적이라 한 번만) */
export async function claimPendingDex(
  store: ForageStore,
  acct: string,
  cat: DexCat,
  ip: string | undefined,
): Promise<{ earned: number; left: number; me: Me | null }> {
  const r = await payFrom(store, acct, cat, Number.MAX_SAFE_INTEGER, ip);
  return { earned: r.earned, left: r.taken - r.paid, me: r.me };
}

