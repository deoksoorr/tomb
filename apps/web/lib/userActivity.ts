import {
  COHORT_DAYS,
  COHORT_WEEKS,
  GONE_RULE,
  LAST_SEEN_BUCKETS,
  RETENTION_DAYS,
  RETENTION_WEEKS,
  TIER_WINDOW_DAYS,
  tierOf,
  type ActivityTier,
  type LastSeenBucket,
} from "./activityRules";
import { membersSnapshot } from "./adminMembers";
import { addDays, daysBetween, gameDay, weekOfDay } from "./gameDay";
import { staffAccountId } from "./staff";
import { stayFillDays } from "./stayTime";
import { getAccounts } from "./store";
import { DORMANT_MS, type AccountStore, type AccountSummary } from "./store/types";
import { getActivity, type ActivityStore } from "./store/userActivity";

// 관리자 「유저 활동」 보고서 (라우트: app/api/admin/activity). 계정 전체 요약(SCAN)과 최근 FETCH_DAYS일 날짜별 활동 SET(파이프라인 한 번)을
// 읽어 메모리에서 센다. 무거우니 CACHE_MS 동안 이 서버 인스턴스에 기억한다 (fresh면 다시).
//
// 정의 (화면 안내와 같다)
//  - 활동한 날: 그 게임 날짜에 마을에 들어왔거나 머무르기 기록이 쌓인 날 (lib/store/userActivity.ts)
//  - DAU = 오늘 활동한 계정, WAU = 오늘 포함 최근 7일 중 하루라도, MAU = 오늘 포함 최근 30일 중 하루라도
//  - 고착도 = 최근 7일 평균 DAU ÷ MAU (기록이 있는 날만 평균)
//  - 신규 = 처음 입장 시각(createdAt)이 오늘 / 최근 7일 / 최근 30일인 계정
//  - 일별 리텐션: 그날 가입한 계정 중 정확히 D일 뒤에 활동한 비율. 끝난 날(오늘 전)이고 기록이 있는 날만 센다
//    「7일 안에 다시 옴」은 D1~D7 중 하루라도 활동한 비율 (7일이 모두 끝나야 센다)
//  - 주별 리텐션: 그 주(월요일 시작)에 가입한 계정 중 W주 뒤 그 주에 한 번이라도 활동한 비율 (그 주가 끝나야 센다)
//  - 등급·떠난 단골·마지막 접속 구간은 lib/activityRules.ts

const CACHE_MS = 5 * 60_000;
/** 날짜별 활동을 읽는 기간 (떠난 단골은 마지막 접속 30일 전까지의 30일을 봐야 해서 60일 + 오늘) */
const FETCH_DAYS = GONE_RULE.maxDays + TIER_WINDOW_DAYS + 1;
/** 목록 상한 (자주 오는 유저·떠난 단골) */
const LIST_MAX = 300;

export type ActivityUser = {
  accountId: string;
  name: string | null;
  createdAt: number;
  lastSeenAt: number;
  points: number;
  lifetimePoints: number;
  stayMinutes: number;
  /** 오늘 포함 최근 7일 / 30일 중 활동한 날 */
  days7: number;
  days30: number;
  /** 기록을 시작한 뒤 활동한 날 전부 */
  totalDays: number;
  tier: ActivityTier | null;
};
export type GoneUser = ActivityUser & {
  /** 마지막 접속에서 지난 날 */
  awayDays: number;
  /** 마지막 접속까지 30일 중 활동한 날과 그때 등급 */
  daysBefore: number;
  tierBefore: ActivityTier;
};
export type DailyCohort = {
  day: string;
  size: number;
  /** RETENTION_DAYS 순서, 아직 셀 수 없으면 null */
  returned: (number | null)[];
  within7: number | null;
};
export type WeeklyCohort = { week: string; size: number; returned: (number | null)[] };

/** GET /api/admin/activity */
export type UserActivityReport = {
  at: number;
  today: string;
  /** 활동 기록이 있는 가장 이른 날 (null = 아직 없음) */
  since: string | null;
  includeStaff: boolean;
  accounts: number;
  partial: boolean;
  summary: { dau: number; dauYesterday: number; wau: number; mau: number; avgDau7: number; stickiness: number | null; new1: number; new7: number; new30: number };
  cohorts: DailyCohort[];
  /** 일별 묶음을 모두 더한 값 (셀 수 있는 묶음만) */
  cohortTotal: { size: number[]; returned: number[]; within7: { size: number; returned: number } };
  weekly: WeeklyCohort[];
  frequent: ActivityUser[];
  tiers: ActivityUser[];
  buckets: { id: LastSeenBucket; label: string; count: number }[];
  gone: GoneUser[];
};

export type ReportInput = {
  now: number;
  accounts: readonly AccountSummary[];
  sets: ReadonlyMap<string, ReadonlySet<string>>;
  since: string | null;
  staffId: string | null;
  includeStaff: boolean;
  partial?: boolean;
};

const createdDay = (a: AccountSummary) => (a.createdAt > 0 ? gameDay(a.createdAt) : null);

/** 날짜별 활동과 계정 요약 → 보고서 (순수 함수, 활동한 날 전부(totalDays)는 0으로 두고 밖에서 채운다) */
export function buildActivityReport(input: ReportInput): UserActivityReport {
  const { now, since, staffId, includeStaff } = input;
  const today = gameDay(now);
  const accounts = input.accounts.filter((a) => includeStaff || a.accountId !== staffId);
  const known = new Set(accounts.map((a) => a.accountId));
  const empty = new Set<string>();
  const setOf = (d: string): ReadonlySet<string> => input.sets.get(d) ?? empty;
  const isActive = (id: string, d: string) => setOf(d).has(id);
  /** 그날이 끝났고 기록이 있는 날인가 (리텐션은 이 날만 센다) */
  const counted = (d: string) => !!since && d >= since && d < today;
  const lastDays = (n: number, end = today) => Array.from({ length: n }, (_, i) => addDays(end, -i));
  const unionSize = (days: readonly string[]) => {
    const u = new Set<string>();
    for (const d of days) for (const id of setOf(d)) if (known.has(id)) u.add(id);
    return u.size;
  };
  const daySize = (d: string) => [...setOf(d)].filter((id) => known.has(id)).length;

  // ── 요약 ──
  const week = lastDays(7);
  const month = lastDays(30);
  const wau = unionSize(week);
  const mau = unionSize(month);
  const recorded = week.filter((d) => !!since && d >= since);
  const avgDau7 = recorded.length ? recorded.reduce((n, d) => n + daySize(d), 0) / recorded.length : 0;
  const newIn = (n: number) => {
    const from = addDays(today, -(n - 1));
    return accounts.filter((a) => {
      const c = createdDay(a);
      return !!c && c >= from && c <= today;
    }).length;
  };

  // ── 일별 리텐션 ──
  const byDay = new Map<string, string[]>();
  const byWeek = new Map<string, string[]>();
  for (const a of accounts) {
    const c = createdDay(a);
    if (!c) continue;
    (byDay.get(c) ?? byDay.set(c, []).get(c)!).push(a.accountId);
    const w = weekOfDay(c);
    (byWeek.get(w) ?? byWeek.set(w, []).get(w)!).push(a.accountId);
  }
  const cohorts: DailyCohort[] = lastDays(COHORT_DAYS, addDays(today, -1)).map((day) => {
    const ids = byDay.get(day) ?? [];
    const returned = RETENTION_DAYS.map((k) => {
      const d = addDays(day, k);
      return counted(d) ? ids.filter((id) => isActive(id, d)).length : null;
    });
    const span = Array.from({ length: 7 }, (_, i) => addDays(day, i + 1));
    const within7 = span.every(counted) ? ids.filter((id) => span.some((d) => isActive(id, d))).length : null;
    return { day, size: ids.length, returned, within7 };
  });
  const cohortTotal = {
    size: RETENTION_DAYS.map((_, i) => cohorts.reduce((n, c) => n + (c.returned[i] === null ? 0 : c.size), 0)),
    returned: RETENTION_DAYS.map((_, i) => cohorts.reduce((n, c) => n + (c.returned[i] ?? 0), 0)),
    within7: {
      size: cohorts.reduce((n, c) => n + (c.within7 === null ? 0 : c.size), 0),
      returned: cohorts.reduce((n, c) => n + (c.within7 ?? 0), 0),
    },
  };

  // ── 주별 리텐션 (지난주부터 COHORT_WEEKS주) ──
  const thisWeek = weekOfDay(today);
  const weekly: WeeklyCohort[] = Array.from({ length: COHORT_WEEKS }, (_, i) => addDays(thisWeek, -7 * (i + 1))).map((w) => {
    const ids = byWeek.get(w) ?? [];
    const returned = RETENTION_WEEKS.map((k) => {
      const span = Array.from({ length: 7 }, (_, i) => addDays(w, 7 * k + i));
      return span.every(counted) ? ids.filter((id) => span.some((d) => isActive(id, d))).length : null;
    });
    return { week: w, size: ids.length, returned };
  });

  // ── 계정마다 최근 활동 ──
  const users: ActivityUser[] = accounts.map((a) => {
    const days7 = week.filter((d) => isActive(a.accountId, d)).length;
    const days30 = month.filter((d) => isActive(a.accountId, d)).length;
    return {
      accountId: a.accountId,
      name: a.name,
      createdAt: a.createdAt,
      lastSeenAt: a.lastSeenAt,
      points: a.points,
      lifetimePoints: a.lifetimePoints,
      stayMinutes: a.stayMinutes,
      days7,
      days30,
      totalDays: 0,
      tier: tierOf(days30, a.stayMinutes),
    };
  });
  const byActivity = (x: ActivityUser, y: ActivityUser) => y.days30 - x.days30 || y.days7 - x.days7 || y.stayMinutes - x.stayMinutes || y.lastSeenAt - x.lastSeenAt;
  const frequent = users.filter((u) => u.days30 > 0).sort(byActivity).slice(0, LIST_MAX);
  const tiers = users.filter((u) => u.tier).sort((x, y) => (x.tier === y.tier ? 0 : x.tier === "vip" ? -1 : 1) || byActivity(x, y));

  // ── 마지막 접속 구간 · 떠난 단골 ──
  const counts = new Map<LastSeenBucket, number>(LAST_SEEN_BUCKETS.map((b) => [b.id, 0]));
  const gone: GoneUser[] = [];
  for (const [i, a] of accounts.entries()) {
    const bucket = bucketOf(a, now, today);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    if (!a.lastSeenAt || bucket === "dormant") continue;
    const last = gameDay(a.lastSeenAt);
    const awayDays = daysBetween(last, today);
    if (awayDays < GONE_RULE.minDays || awayDays > GONE_RULE.maxDays) continue;
    const daysBefore = lastDays(TIER_WINDOW_DAYS, last).filter((d) => isActive(a.accountId, d)).length;
    const tierBefore = tierOf(daysBefore, a.stayMinutes);
    if (tierBefore) gone.push({ ...users[i], awayDays, daysBefore, tierBefore });
  }
  gone.sort((x, y) => y.daysBefore - x.daysBefore || x.awayDays - y.awayDays || y.stayMinutes - x.stayMinutes);

  return {
    at: now,
    today,
    since,
    includeStaff,
    accounts: accounts.length,
    partial: !!input.partial,
    summary: {
      dau: daySize(today),
      dauYesterday: daySize(addDays(today, -1)),
      wau,
      mau,
      avgDau7,
      stickiness: mau ? avgDau7 / mau : null,
      new1: newIn(1),
      new7: newIn(7),
      new30: newIn(30),
    },
    cohorts,
    cohortTotal,
    weekly,
    frequent,
    tiers,
    buckets: LAST_SEEN_BUCKETS.map((b) => ({ id: b.id, label: b.label, count: counts.get(b.id) ?? 0 })),
    gone: gone.slice(0, LIST_MAX),
  };
}

/** 마지막 접속 구간: 휴면(재설정 중이거나 90일 넘음) → 날 수(게임 날짜) 구간. 기록 없음은 따로 */
export function bucketOf(a: Pick<AccountSummary, "lastSeenAt" | "renameRequired">, now: number, today = gameDay(now)): LastSeenBucket {
  if (!a.lastSeenAt) return "none";
  if (a.renameRequired || now - a.lastSeenAt > DORMANT_MS) return "dormant";
  const days = daysBetween(gameDay(a.lastSeenAt), today);
  return LAST_SEEN_BUCKETS.find((b) => b.id !== "dormant" && b.id !== "none" && days <= b.maxDays)?.id ?? "d90";
}

// ── 읽기 (캐시) ──

type Cached = { at: number; report: UserActivityReport; key: string };
const g = globalThis as typeof globalThis & { __tombActivityReport?: Cached[] };

export async function userActivityReport(
  opts: { includeStaff?: boolean; fresh?: boolean; now?: number; accounts?: AccountStore; activity?: ActivityStore } = {},
): Promise<UserActivityReport> {
  const now = opts.now ?? Date.now();
  const includeStaff = !!opts.includeStaff;
  const accounts = opts.accounts ?? getAccounts();
  const activity = opts.activity ?? getActivity();
  const key = String(includeStaff);
  const hit = g.__tombActivityReport?.find((c) => c.key === key);
  if (!opts.fresh && hit && now - hit.at < CACHE_MS) return hit.report;

  const days = Array.from({ length: FETCH_DAYS }, (_, i) => addDays(gameDay(now), -i));
  // 11/26 계정 훑기는 회원 목록·잔액 보기와 같은 30초 기억을 함께 쓴다 (탭을 옮길 때마다 키 전체를 다시 훑지 않게)
  const [scan, sets, since, staffId] = await Promise.all([membersSnapshot(accounts, !!opts.fresh, now), activity.daySets(days), activity.since(), staffAccountId(now)]);
  const report = buildActivityReport({ now, accounts: scan.rows, sets, since, staffId, includeStaff, partial: scan.partial });
  // 목록에 나온 계정만 활동한 날 전부를 한 번에 읽는다
  const listed = [...new Set([...report.frequent, ...report.tiers, ...report.gone].map((u) => u.accountId))];
  const counts = await activity.activeDays(listed);
  const totals = new Map(listed.map((id, i) => [id, counts[i] ?? 0]));
  for (const u of [...report.frequent, ...report.tiers, ...report.gone]) u.totalDays = totals.get(u.accountId) ?? 0;

  g.__tombActivityReport = [...(g.__tombActivityReport ?? []).filter((c) => c.key !== key), { at: now, report, key }];
  return report;
}

// ── 기록 전 활동 채우기 (관리자 일괄) ──

/**
 * 활동 기록을 켜기 전 며칠을 남은 흔적으로 채운다. cursor부터 계정 count개 안팎을 훑어
 * 날짜별 머무르기 기록(최근 3일, 2일 TTL)이 있는 날, 그리고 그 3일 안의 처음 입장일·마지막 접속일을 활동한 날로 남긴다.
 * 그날 이미 있으면 세지 않으므로 여러 번 돌려도 그대로. next = "0"이면 끝
 */
export async function seedActivity(
  cursor: string,
  count: number,
  now = Date.now(),
  accounts: AccountStore = getAccounts(),
  activity: ActivityStore = getActivity(),
): Promise<{ next: string; recorded: number }> {
  const { next, accounts: rows } = await accounts.scanAccounts(cursor, count);
  const days = stayFillDays(now);
  const ticks = await accounts.stayTicksOn(rows.map((r) => r.accountId), days);
  const pairs: [string, string][] = [];
  rows.forEach((r, i) => {
    const hit = new Set(days.filter((_, j) => ticks[i][j] > 0));
    for (const t of [r.createdAt, r.lastSeenAt]) if (t > 0 && t <= now && days.includes(gameDay(t))) hit.add(gameDay(t));
    for (const d of hit) pairs.push([r.accountId, d]);
  });
  return { next, recorded: await activity.record(pairs) };
}
