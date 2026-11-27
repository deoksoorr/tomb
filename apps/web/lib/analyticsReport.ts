import { hh, REF_CATEGORIES, type RefCategory } from "./analytics";
import type { AnalyticsStore, DayRaw } from "./store/analytics";

// 47번 방문 분석 보고서: 저장소 원자료(하루 해시·HLL·동시 접속) → 관리자 대시보드가 그리는 형태.
// 기간: hour = 지금까지 24시간(시간대별), day = 30일, week = 12주(월요일 시작), month = 3달 (보관이 90일이라 그 이상은 비어 있다)

export type AnalyticsRange = "hour" | "day" | "week" | "month";
export const ANALYTICS_RANGES: readonly AnalyticsRange[] = ["hour", "day", "week", "month"];

export type SeriesPoint = {
  /** 화면 표시 이름 ("14시", "11/12", "11/10주", "2026.11") */
  label: string;
  /** 고유 방문자 */
  visitors: number;
  /** 방문(세션) 수 */
  visits: number;
  /** 최고 동시 접속 */
  peak: number;
  signups: number;
  graves: number;
  hunts: number;
  /** 평균 체류 시간(초) = 머문 초 합 ÷ 방문 수 */
  avgStaySec: number;
};

export type Ranked = { key: string; count: number }[];

export type AnalyticsReport = {
  range: AnalyticsRange;
  /** 오늘(KST) 요약 */
  today: SeriesPoint & { newVisits: number; returningVisits: number };
  series: SeriesPoint[];
  /** 11/17 대시보드용: 기간과 상관없이 오늘(한국 시각) 유입 분류·리퍼러 도메인 */
  todayReferrers: { cat: RefCategory; count: number }[];
  todayDomains: Ranked;
  /** 11/27 오늘 앱 안 브라우저로 연 방문 (카카오톡·인스타그램 … — 리퍼러를 비우는 앱이 많아 따로 센다) */
  todayApps: Ranked;
  /** 유입·기기 분석을 모은 기간 이름 ("오늘", "최근 30일" …) */
  breakdownLabel: string;
  referrers: { cat: RefCategory; count: number }[];
  domains: Ranked;
  /** 11/27 앱 안 브라우저 (기간 합) */
  apps: Ranked;
  utm: Ranked;
  landings: Ranked;
  devices: Ranked;
  browsers: Ranked;
  countries: Ranked;
  generatedAt: number;
};

const DAY_MS = 86_400_000;
const KST = 9 * 3_600_000;
/** KST 날짜(YYYYMMDD) — n일 전 */
export const kstDayAgo = (now: number, n: number) => new Date(now + KST - n * DAY_MS).toISOString().slice(0, 10).replaceAll("-", "");
const kstHourAt = (t: number) => new Date(t + KST).getUTCHours();
const md = (day: string) => `${Number(day.slice(4, 6))}/${Number(day.slice(6, 8))}`;
/** YYYYMMDD의 요일 (0 = 일요일) */
const dow = (day: string) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8))).getUTCDay();

type Group = { label: string; days: string[] };

/** 기간 → 막대 하나에 들어갈 날짜 묶음 (오래된 것 먼저, 오늘까지만) */
export function groupsFor(range: Exclude<AnalyticsRange, "hour">, now: number): Group[] {
  if (range === "day") return Array.from({ length: 30 }, (_, i) => kstDayAgo(now, 29 - i)).map((d) => ({ label: md(d), days: [d] }));
  if (range === "week") {
    const today = kstDayAgo(now, 0);
    const back = (dow(today) + 6) % 7; // 이번 주 월요일까지
    return Array.from({ length: 12 }, (_, w) => {
      const start = back + (11 - w) * 7;
      const days = Array.from({ length: 7 }, (_, i) => start - i).filter((n) => n >= 0).map((n) => kstDayAgo(now, n));
      return { label: `${md(days[0])}주`, days };
    });
  }
  // month: 이번 달과 앞의 두 달
  const out: Group[] = [];
  const today = kstDayAgo(now, 0);
  let y = +today.slice(0, 4);
  let m = +today.slice(4, 6);
  for (let k = 0; k < 3; k++) {
    const prefix = `${y}${String(m).padStart(2, "0")}`;
    const days: string[] = [];
    for (let n = 0; n < 100; n++) {
      const d = kstDayAgo(now, n);
      if (d.startsWith(prefix)) days.push(d);
      else if (d < prefix) break;
    }
    out.unshift({ label: `${y}.${String(m).padStart(2, "0")}`, days: days.reverse() });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

const field = (d: DayRaw | undefined, f: string) => d?.fields[f] ?? 0;
const maxPeak = (d: DayRaw | undefined) => Math.max(0, ...Object.values(d?.peaks ?? {}));
const avg = (sum: number, n: number) => (n > 0 ? Math.round(sum / n) : 0);

function point(label: string, raws: (DayRaw | undefined)[], visitors: number): SeriesPoint {
  const sum = (f: string) => raws.reduce((n, d) => n + field(d, f), 0);
  const visits = sum("v");
  return {
    label,
    visitors,
    visits,
    peak: Math.max(0, ...raws.map(maxPeak)),
    signups: sum("signup"),
    graves: sum("grave"),
    hunts: sum("hunt"),
    avgStaySec: avg(sum("stay"), visits),
  };
}

/** 접두사 필드 합계 → 많은 순 상위 limit개 */
export function ranked(raws: readonly DayRaw[], prefix: string, limit = 10): Ranked {
  const acc = new Map<string, number>();
  for (const d of raws)
    for (const [f, n] of Object.entries(d.fields)) if (f.startsWith(prefix) && n > 0) acc.set(f.slice(prefix.length), (acc.get(f.slice(prefix.length)) ?? 0) + n);
  return [...acc].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, limit);
}

/**
 * livePeak: 11/26 지금 동시 접속 표본(실시간 서버에 묻는 중인 값). 예전엔 표본을 찍고 나서 읽기 시작했는데(실시간 서버 왕복 + Redis 쓰기를 먼저 기다림),
 * 이제 읽기와 함께 돌리고 읽은 오늘 그 시각 최고값에 더한다 (Redis에 적는 값과 같은 규칙 = 더 큰 값). 값은 예전과 같다
 */
export async function buildReport(store: AnalyticsStore, range: AnalyticsRange, now = Date.now(), livePeak?: Promise<number | null>): Promise<AnalyticsReport> {
  const today = kstDayAgo(now, 0);
  const withLive = async (raws: DayRaw[]): Promise<DayRaw[]> => {
    const n = livePeak ? await livePeak : null;
    if (typeof n !== "number") return raws;
    const key = hh(kstHourAt(now));
    return raws.map((r) => (r.day === today && n > (r.peaks[key] ?? -1) ? { ...r, peaks: { ...r.peaks, [key]: n } } : r));
  };
  let series: SeriesPoint[];
  let breakdownDays: string[];
  let breakdownLabel: string;
  let todayRaw: DayRaw | undefined;
  let todayUnique: number;
  /** 위에서 이미 읽은 날들 (유입 등 집계는 다시 읽지 않고 여기서 고른다 — 11/26 Redis 왕복 1번 줄임) */
  let readRaws: DayRaw[] = [];

  if (range === "hour") {
    // 지금 시간대까지 24칸 (어제 같은 시각 다음 칸부터)
    const slots = Array.from({ length: 24 }, (_, i) => {
      const t = now - (23 - i) * 3_600_000;
      return [kstDayAgo(t, 0), kstHourAt(t)] as const;
    });
    const days = [...new Set(slots.map(([d]) => d))];
    const [raws0, hourU, [tu]] = await Promise.all([store.days(days), store.hourUniques(slots), store.uniqueOver([[today]])]);
    const raws = await withLive(raws0);
    readRaws = raws;
    const byDay = new Map(raws.map((r) => [r.day, r]));
    series = slots.map(([d, h], i) => {
      const r = byDay.get(d);
      const f = (k: string) => field(r, `h:${hh(h)}:${k}`);
      return {
        label: `${h}시`,
        visitors: hourU[i],
        visits: f("v"),
        peak: r?.peaks[hh(h)] ?? 0,
        signups: f("signup"),
        graves: f("grave"),
        hunts: f("hunt"),
        avgStaySec: avg(f("stay"), f("v")),
      };
    });
    todayRaw = byDay.get(today);
    todayUnique = tu;
    breakdownDays = [today];
    breakdownLabel = "오늘";
  } else {
    const groups = groupsFor(range, now);
    const all = [...new Set([today, ...groups.flatMap((g) => g.days)])];
    const [raws0, uniques] = await Promise.all([store.days(all), store.uniqueOver([[today], ...groups.map((g) => g.days)])]);
    const raws = await withLive(raws0);
    readRaws = raws;
    const byDay = new Map(raws.map((r) => [r.day, r]));
    series = groups.map((g, i) => point(g.label, g.days.map((d) => byDay.get(d)), uniques[i + 1]));
    todayRaw = byDay.get(today);
    todayUnique = uniques[0];
    breakdownDays = groups.flatMap((g) => g.days);
    breakdownLabel = range === "day" ? "최근 30일" : range === "week" ? "최근 12주" : "최근 3달";
  }

  const readByDay = new Map(readRaws.map((r) => [r.day, r]));
  const bRaws = breakdownDays.every((d) => readByDay.has(d)) ? breakdownDays.map((d) => readByDay.get(d)!) : await store.days(breakdownDays);
  const refs = ranked(bRaws, "ref:", 10);
  const todayRaws = todayRaw ? [todayRaw] : [];
  const todayRefs = ranked(todayRaws, "ref:", 10);
  return {
    range,
    today: { ...point("오늘", [todayRaw], todayUnique), newVisits: field(todayRaw, "v:new"), returningVisits: field(todayRaw, "v:ret") },
    series,
    breakdownLabel,
    referrers: REF_CATEGORIES.map((cat) => ({ cat, count: refs.find((r) => r.key === cat)?.count ?? 0 })),
    todayReferrers: REF_CATEGORIES.map((cat) => ({ cat, count: todayRefs.find((r) => r.key === cat)?.count ?? 0 })),
    todayDomains: ranked(todayRaws, "dom:"),
    todayApps: ranked(todayRaws, "app:"),
    domains: ranked(bRaws, "dom:"),
    apps: ranked(bRaws, "app:"),
    utm: ranked(bRaws, "utm:"),
    landings: ranked(bRaws, "land:"),
    devices: ranked(bRaws, "dev:"),
    browsers: ranked(bRaws, "br:"),
    countries: ranked(bRaws, "cc:"),
    generatedAt: now,
  };
}
