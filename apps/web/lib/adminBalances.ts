import { WALLET_MAX } from "./economy";
import { matchesMember, membersSnapshot } from "./adminMembers";
import { managerIds } from "./managers";
import { staffAccountId } from "./staff";
import { getAccounts } from "./store";
import { getBanStore } from "./store/bans";
import { DORMANT_MS, type AccountStore } from "./store/types";

// 관리자 경제 탭의 포인트 잔액 보기 (라우트: app/api/admin/economy/balances).
//
// Redis를 아끼려고 따로 훑지 않는다: 회원 목록 탭이 훑어 둔 목록(lib/adminMembers membersSnapshot — SCAN + 계정 해시 HMGET, 30초)을
// 그대로 받아 잔액 순으로 줄 세우고, 그 결과를 이 서버 인스턴스에 CACHE_MS 동안 기억한다. 범위 바꾸기·검색은 기억해 둔 줄에서만 한다.
// 새로 계산하는 때는 경제 탭을 처음 열 때(기억이 지났을 때)와 [새로고침](fresh)뿐이다.
// 상태 판정은 회원 목록과 같다: 정지(정지 색인) → 휴면(닉네임 재설정 대기 또는 DORMANT_MS 넘게 안 옴) → 정상.
// 운영자 계정은 숫자에서 뺀다: 지금 운영자 + 지갑이 상한(WALLET_MAX)까지 채워진 계정 (운영자를 해제해도 채운 잔액이 남는다 — 유저는 닿을 수 없는 값).
// 매니저는 놀아서 버는 보통 유저라 숫자에 넣고 표시만 붙인다.

/** 계산해 둔 잔액 목록을 기억하는 시간 */
export const BALANCES_CACHE_MS = 3 * 60_000;
/** [새로고침]을 연달아 눌러도 이 시간 안이면 다시 훑지 않는다 */
const FRESH_MIN_MS = 15_000;
/** 목록 한 번에 보여 주는 사람 수 */
export const BALANCE_ROWS = 50;

/** 구간 (아래 끝 포함, 위 끝 미포함. 마지막은 위 끝 없음) */
export const BALANCE_BUCKETS: readonly { label: string; min: number; max: number | null }[] = [
  { label: "0 ~ 999", min: 0, max: 1_000 },
  { label: "1천 ~ 5천", min: 1_000, max: 5_000 },
  { label: "5천 ~ 1만", min: 5_000, max: 10_000 },
  { label: "1만 ~ 3만", min: 10_000, max: 30_000 },
  { label: "3만 ~ 10만", min: 30_000, max: 100_000 },
  { label: "10만 이상", min: 100_000, max: null },
];

export type BalanceStatus = "normal" | "banned" | "dormant";
/** all = 운영자만 뺀 전체, active = 휴면과 정지도 뺀다 */
export type BalanceScope = "all" | "active";

export type BalanceRow = {
  accountId: string;
  name: string | null;
  points: number;
  /** 0 = 기록 없음 */
  lastSeenAt: number;
  status: BalanceStatus;
  manager?: true;
  /** 이 범위 안의 잔액 순위 (1부터) */
  rank: number;
};

export type BalanceBucket = { label: string; count: number; sum: number };

/** GET /api/admin/economy/balances */
export type AdminBalancesResponse = {
  scope: BalanceScope;
  /** 이 범위 계정 수 */
  accounts: number;
  sum: number;
  avg: number;
  median: number;
  /** 잔액이 0인 계정 수 */
  zero: number;
  buckets: BalanceBucket[];
  /** 휴면 계정 (전체 범위에 들어 있는 수와 잔액) */
  dormant: { accounts: number; sum: number };
  /** 매니저 계정 (이 범위에 들어 있는 수와 잔액) */
  managers: { accounts: number; sum: number };
  /** 숫자에서 뺀 운영자 계정 수 */
  staffExcluded: number;
  /** q가 없으면 잔액 상위 BALANCE_ROWS명, 있으면 이름이 맞는 사람을 잔액 순으로 BALANCE_ROWS명까지 */
  rows: BalanceRow[];
  /** 검색에 맞는 사람 수 (q가 없으면 accounts와 같다) */
  matched: number;
  q: string;
  /** 회원 목록을 훑은 시각 */
  scannedAt: number;
  /** 잔액을 계산한 시각 */
  computedAt: number;
  /** 회원이 너무 많아 일부만 훑었다 */
  partial: boolean;
};

type Ranked = Omit<BalanceRow, "rank">;
type Cache = {
  at: number;
  scannedAt: number;
  partial: boolean;
  /** 운영자를 뺀 전체, 잔액 많은 순 */
  rows: Ranked[];
  staffExcluded: number;
  store: AccountStore;
};
const g = globalThis as typeof globalThis & { __tombBalances?: Cache };

/** 잔액 많은 순, 같으면 계정 id 순 */
const byPoints = (a: Ranked, b: Ranked) => b.points - a.points || (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0);

async function load(accounts: AccountStore, fresh: boolean, now: number): Promise<Cache> {
  const cur = g.__tombBalances;
  const age = cur && cur.store === accounts ? now - cur.at : Infinity;
  if (age < (fresh ? FRESH_MIN_MS : BALANCES_CACHE_MS)) return cur!;
  const [snap, staffId, bans, managers] = await Promise.all([
    membersSnapshot(accounts, fresh, now),
    staffAccountId(now),
    getBanStore().index(),
    managerIds(now).catch(() => new Set<string>()),
  ]);
  let staffExcluded = 0;
  const rows: Ranked[] = [];
  for (const r of snap.rows) {
    if (r.accountId === staffId || r.points >= WALLET_MAX) {
      staffExcluded++;
      continue;
    }
    const ban = bans.get(`a:${r.accountId}`);
    const banned = !!ban && (ban.until === null || ban.until > now);
    const dormant = r.renameRequired || (r.lastSeenAt > 0 && now - r.lastSeenAt > DORMANT_MS);
    rows.push({
      accountId: r.accountId,
      name: r.name,
      points: r.points,
      lastSeenAt: r.lastSeenAt,
      status: banned ? "banned" : dormant ? "dormant" : "normal",
      ...(managers.has(r.accountId) ? { manager: true as const } : {}),
    });
  }
  rows.sort(byPoints);
  return (g.__tombBalances = { at: now, scannedAt: snap.at, partial: snap.partial, rows, staffExcluded, store: accounts });
}

/** 잔액 많은 순 목록의 중앙값 (짝수면 가운데 둘의 평균, 반올림) */
export function medianOf(desc: readonly number[]): number {
  const n = desc.length;
  if (!n) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? desc[mid] : Math.round((desc[mid - 1] + desc[mid]) / 2);
}

export function bucketsOf(points: readonly number[]): BalanceBucket[] {
  const out = BALANCE_BUCKETS.map((b) => ({ label: b.label, count: 0, sum: 0 }));
  for (const p of points) {
    const i = BALANCE_BUCKETS.findIndex((b) => p >= b.min && (b.max === null || p < b.max));
    const at = out[i < 0 ? 0 : i];
    at.count++;
    at.sum += p;
  }
  return out;
}

/** 기억해 둔 줄 → 범위·검색에 맞춘 응답 (순수 함수) */
export function summarize(cache: Pick<Cache, "rows" | "staffExcluded" | "scannedAt" | "partial" | "at">, scope: BalanceScope, q: string): AdminBalancesResponse {
  const inScope = scope === "active" ? cache.rows.filter((r) => r.status === "normal") : cache.rows;
  const points = inScope.map((r) => r.points);
  const sum = points.reduce((a, b) => a + b, 0);
  const ranked: BalanceRow[] = inScope.map((r, i) => ({ ...r, rank: i + 1 }));
  const hits = q ? ranked.filter((r) => matchesMember(r, q)) : ranked;
  const dormant = cache.rows.filter((r) => r.status === "dormant");
  const managers = inScope.filter((r) => r.manager);
  return {
    scope,
    accounts: inScope.length,
    sum,
    avg: inScope.length ? Math.round(sum / inScope.length) : 0,
    median: medianOf(points),
    zero: points.filter((p) => p === 0).length,
    buckets: bucketsOf(points),
    dormant: { accounts: dormant.length, sum: dormant.reduce((a, r) => a + r.points, 0) },
    managers: { accounts: managers.length, sum: managers.reduce((a, r) => a + r.points, 0) },
    staffExcluded: cache.staffExcluded,
    rows: hits.slice(0, BALANCE_ROWS),
    matched: hits.length,
    q,
    scannedAt: cache.scannedAt,
    computedAt: cache.at,
    partial: cache.partial,
  };
}

export async function balanceStats(
  opts: { scope?: BalanceScope; q?: string; fresh?: boolean; now?: number; accounts?: AccountStore } = {},
): Promise<AdminBalancesResponse> {
  const cache = await load(opts.accounts ?? getAccounts(), !!opts.fresh, opts.now ?? Date.now());
  return summarize(cache, opts.scope ?? "all", (opts.q ?? "").trim());
}

/** 테스트용: 기억해 둔 잔액 목록 지우기 */
export function resetBalancesCache(): void {
  delete g.__tombBalances;
}
