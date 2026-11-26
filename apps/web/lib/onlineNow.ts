import { AWAY_PLACE_LABEL, MAP_NAME, mapOf, type InternalPerson } from "@tomb/protocol";
import { onlinePeople } from "./ban";
import { srcText } from "./signupSource";
import { sproutLeftMinutes } from "./sprout";
import { staffAccountId } from "./staff";
import { getAccounts } from "./store";
import { kstDay } from "./store/accounts";
import { getSignupSrc, type LiveSrc } from "./store/signupSrc";
import type { AccountSummary } from "./store/types";
import type { SignupSrc } from "./signupSource";

// 11/26 관리자 「지금 접속자」: 실시간 서버의 지금 명단(/internal/people) + 계정 요약·가입 유입·이번 접속 유입을 한 번에 읽는다
// (계정 요약은 파이프라인 1번, 유입은 HMGET 1번 + 파이프라인 1번). 열 때·새로고침 때만 부른다 — 자동으로 다시 묻지 않는다.

export type OnlineRow = {
  accountId: string;
  name: string;
  ch: number;
  /** 맵 이름 (마을·캠핑장·바닷가) */
  map: string;
  /** 실내면 어디인지 (집 안·사냥터 …) */
  place?: string;
  /** 이번 접속 시작 (그 탭의 첫 입장, 모르면 null) */
  since: number | null;
  points: number;
  /** 가입 유입 (기록 없으면 "기록 없음") */
  signup: string;
  /** 이번 접속 유입 (모르면 null) */
  session: string | null;
  createdAt: number;
  stayMinutes: number;
  sprout: boolean;
  staff: boolean;
};
export type CountRow = { label: string; n: number };
export type OnlineStats = {
  /** 운영자 뺀 인원 (통계는 이 사람들로) */
  count: number;
  points: { avg: number; median: number; buckets: CountRow[] };
  bySignup: CountRow[];
  bySession: CountRow[];
  byMap: CountRow[];
  sprouts: number;
  sproutRatio: number | null;
};
export type AdminOnlineResponse = { at: number; rows: OnlineRow[]; stats: OnlineStats; reachable: boolean };

/** 포인트 구간 (아래 끝 이상 ~ 다음 끝 미만) */
export const POINT_BUCKETS: [number, string][] = [
  [0, "1천 미만"],
  [1_000, "1천~1만"],
  [10_000, "1만~5만"],
  [50_000, "5만~10만"],
  [100_000, "10만~50만"],
  [500_000, "50만~100만"],
  [1_000_000, "100만 이상"],
];

function countBy(values: readonly string[]): CountRow[] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ko"));
}

/** 통계 (순수). 운영자는 뺀다 — 포인트가 지갑 상한까지 차 있어 평균을 흐린다 */
export function onlineStats(rows: readonly OnlineRow[]): OnlineStats {
  const ppl = rows.filter((r) => !r.staff);
  const pts = ppl.map((r) => r.points).sort((a, b) => a - b);
  const n = pts.length;
  const median = n === 0 ? 0 : n % 2 ? pts[(n - 1) / 2] : Math.round((pts[n / 2 - 1] + pts[n / 2]) / 2);
  const avg = n === 0 ? 0 : Math.round(pts.reduce((s, p) => s + p, 0) / n);
  const buckets = POINT_BUCKETS.map(([lo, label], i) => {
    const hi = POINT_BUCKETS[i + 1]?.[0] ?? Infinity;
    return { label, n: pts.filter((p) => p >= lo && p < hi).length };
  });
  const sprouts = ppl.filter((r) => r.sprout).length;
  return {
    count: n,
    points: { avg, median, buckets },
    bySignup: countBy(ppl.map((r) => r.signup)),
    bySession: countBy(ppl.map((r) => r.session ?? "모름")),
    byMap: countBy(ppl.map((r) => (r.place ? `${r.map} · ${r.place}` : r.map))),
    sprouts,
    sproutRatio: n ? sprouts / n : null,
  };
}

/** 명단 + 읽어 온 값 → 줄 (순수). 같은 계정이 두 번 나오면 하나만 */
export function onlineRows(
  people: readonly InternalPerson[],
  summaries: readonly (AccountSummary | null)[],
  signups: readonly (SignupSrc | null)[],
  lives: readonly (LiveSrc | null)[],
  staffId: string | null,
): OnlineRow[] {
  return people.map((p, i): OnlineRow => {
    const a = summaries[i];
    const staff = p.visitorId === staffId;
    const live = lives[i];
    return {
      accountId: p.visitorId,
      name: a?.name ?? p.name ?? "",
      ch: p.ch,
      map: MAP_NAME[mapOf(p.map)] ?? "마을",
      ...(p.inside && p.place ? { place: AWAY_PLACE_LABEL[p.place] } : {}),
      since: live?.at ?? null,
      points: a?.points ?? 0,
      signup: srcText(signups[i]),
      session: live?.s ?? null,
      createdAt: a?.createdAt ?? 0,
      stayMinutes: a?.stayMinutes ?? 0,
      sprout: !!a && sproutLeftMinutes({ stayMin: a.stayMinutes, createdAt: a.createdAt }, { staff, mgr: false }) > 0,
      staff,
    };
  });
}

export async function loadOnlineNow(now = Date.now()): Promise<AdminOnlineResponse> {
  const people = await onlinePeople();
  if (!people) return { at: now, rows: [], stats: onlineStats([]), reachable: false };
  const seen = new Set<string>();
  const uniq = people.filter((p) => !seen.has(p.visitorId) && !!seen.add(p.visitorId));
  const ids = uniq.map((p) => p.visitorId);
  const today = kstDay(now);
  const yesterday = kstDay(now - 86_400_000);
  const store = getSignupSrc();
  const [summaries, signups, lives, staffId] = await Promise.all([
    getAccounts().summaries(ids),
    store.get(ids),
    store.live(ids, [today, yesterday]),
    staffAccountId(now),
  ]);
  const rows = onlineRows(uniq, summaries, signups, lives, staffId).sort((a, b) => a.ch - b.ch || a.name.localeCompare(b.name, "ko"));
  return { at: now, rows, stats: onlineStats(rows), reachable: true };
}
