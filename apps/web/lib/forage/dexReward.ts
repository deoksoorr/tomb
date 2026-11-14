import { earnPoints } from "../store";
import { kstDay } from "../store/accounts";
import type { Me } from "../types";
import {
  DEX_CATS,
  DEX_REWARD,
  DEX_TIERS,
  DEX_TITLE_TIERS,
  DEX_TITLES,
  dexCatOf,
  dexClaimKey,
  dexIdsOf,
  dexRewardOf,
  dexTitleNeed,
  type DexCat,
  type DexTitleTier,
} from "./catalog";
import type { DexPay, ForageStore } from "./store";
import type { DexGain, DexRewardState } from "./types";

// 도감 보상 (11/14 개편): 예전 25·50·75·100% 단계 보상 대신 종(칸) 하나를 처음 등록할 때마다 희귀도별 포인트 (catalog DEX_NEW_REWARD).
//  - 등록 순간: 저장소의 등록 연산(grant·grantAuto·addStars)이 정산을 마친 계정이면 그 종의 보상을 "받을 도감 보상"(p:{cat})에 원자적으로 쌓고,
//    이어서 여기서 그만큼 꺼내(takeDexPending) earnPoints("dex")로 지갑에 넣는다. 하루 도감 한도·하루 전체 한도·지갑 상한에 걸려
//    못 들어간 만큼은 p:{cat}에 그대로 남아 도감 창의 [도감 보상 받기]로 나중에 받는다 (꺼내기가 원자적이라 동시에 눌러도 한 번만).
//  - 전환 정산(계정당 한 번, settleDex): 도감 정보를 처음 읽을 때 (지금 등록된 종의 보상 합 − 그 칸에서 받은 예전 단계 보상)이 양수면 받을 보상에.
//    정산 전 등록은 보상을 쌓지 않고 정산이 한꺼번에 세므로 두 번 받지 않는다. 예전 단계 기록(claims)은 지우지 않는다.
//  - 칭호: 그 칸의 절반·전부를 등록하면 자동으로 (지금 종 수 기준). 예전에 단계 보상으로 받은 칭호와 한 번 붙은 칭호(t: 표시)는 유지된다.

const has = (dex: Record<string, { n: number }>, id: string) => (dex[id]?.n ?? 0) > 0;

/** 칭호 열쇠 `${cat}:${50|100}` → 칭호 이름 */
function titleName(key: string): string | undefined {
  const [cat, tier] = key.split(":");
  return DEX_TITLES[cat as DexCat]?.[Number(tier) as DexTitleTier];
}

/** 지금 도감으로 붙는 칭호 열쇠 (절반·전부 등록) */
export function reachedTitleKeys(dex: Record<string, { n: number }>): string[] {
  const out: string[] = [];
  for (const cat of DEX_CATS) {
    const got = dexIdsOf(cat).filter((id) => has(dex, id)).length;
    for (const t of DEX_TITLE_TIERS) if (DEX_TITLES[cat][t] && got >= dexTitleNeed(cat, t)) out.push(dexClaimKey(cat, t));
  }
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

/** 받을 도감 보상에서 max까지 꺼내 지갑에 넣는다. 못 들어간 만큼은 되돌린다 */
async function payFrom(store: ForageStore, acct: string, cat: DexCat, max: number, ip: string | undefined, now: number): Promise<{ taken: number; earned: number; me: Me | null }> {
  const taken = await store.takeDexPending(acct, cat, max);
  if (taken <= 0) return { taken: 0, earned: 0, me: null };
  let earned = 0;
  let me: Me | null = null;
  try {
    const r = await earnPoints(acct, "dex", taken, ip);
    earned = r.earned;
    me = r.me;
  } finally {
    // 적립이 실패해도 꺼낸 것은 받을 보상으로 되돌린다
    await store.dexPaid(acct, cat, taken, earned);
  }
  if (earned > 0) await store.addDay(acct, kstDay(now), "dexP", earned);
  return { taken, earned, me };
}

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
): Promise<DexGain | undefined> {
  const fresh = granted.filter((g) => g.isNew && dexRewardOf(g.id) > 0);
  if (!fresh.length) return undefined;
  // 정산 전 계정이면 지금 정산 (이번 등록도 정산에 들어가 받을 보상에 쌓인다)
  await ensureDexSettled(store, acct, null, now);
  const byCat = new Map<DexCat, number>();
  for (const g of fresh) {
    const cat = dexCatOf(g.id)!;
    byCat.set(cat, (byCat.get(cat) ?? 0) + dexRewardOf(g.id));
  }
  let points = 0;
  let earned = 0;
  let me: Me | null = null;
  for (const [cat, n] of byCat) {
    points += n;
    const r = await payFrom(store, acct, cat, n, ip, now);
    earned += r.earned;
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
  return { points, earned, pending: points - earned, titles, ...(me && earned > 0 ? { me } : {}) };
}

/** 도감 창의 [도감 보상 받기]: 그 칸의 받을 보상을 한도 안에서 받는다 (동시에 눌러도 꺼내기가 원자적이라 한 번만) */
export async function claimPendingDex(
  store: ForageStore,
  acct: string,
  cat: DexCat,
  ip: string | undefined,
  now: number,
): Promise<{ earned: number; left: number; me: Me | null }> {
  const r = await payFrom(store, acct, cat, Number.MAX_SAFE_INTEGER, ip, now);
  return { earned: r.earned, left: r.taken - r.earned, me: r.me };
}

