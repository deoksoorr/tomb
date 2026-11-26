import { AWAY_PLACE_LABEL, CAMP_LOTS, MAP_NAME, mapOf, type CampHomeKind, type InternalPerson, type MaintState } from "@tomb/protocol";
import { onlinePeople } from "./ban";
import { HOUSING_CHANNELS, SEA_LOT_COUNT } from "./housing/catalog";
import { getHouseStore } from "./housing/service";
import type { HouseRecord } from "./housing/store";
import { readMaint, rememberMaint } from "./maintenance";
import type { MapConcept } from "./mapConcept";
import { connHealth24h, type ConnHealth } from "./opsLog";
import { kstDay } from "./store/accounts";
import { getMapConceptStore } from "./store/mapConcept";
import { getSignupSrc } from "./store/signupSrc";

// 11/26 관리자 대시보드 한 번에 (GET /api/admin/dashboard). 열 때와 [새로고침] 때만 부른다 — 자동으로 다시 묻지 않는다.
// 실시간 서버: 지금 명단(맵별 인원)·점검 상태 (Redis 없음)
// Redis: 맵 컨셉 GET 1 + 24시간 접속 종료 시간 칸 24 (파이프라인 1번) + 가입 유입 날짜 칸 7 (파이프라인 2번) + 집 기록 ZRANGE 1·집 수만큼 HGETALL (파이프라인 1번, 1분 기억)
// 한 칸이 실패해도 나머지는 보여 준다 (그 칸만 null)

export type CountRow = { label: string; n: number };
export type DashOnline = { total: number; byMap: CountRow[]; byCh: { ch: number; n: number }[] };
/** 채널 하나의 분양 수. camp = 캠핑장 종류별 팔린 터 수 */
export type DashHousingRow = { ch: number; camp: Record<CampHomeKind, number>; sea: number; village: number };
export type DashHousing = {
  rows: DashHousingRow[];
  total: { camp: Record<CampHomeKind, number>; sea: number; village: number };
  /** 채널마다 터 수 (캠핑장 종류별·바닷가) */
  cap: { camp: Record<CampHomeKind, number>; sea: number };
  at: number;
};
export type AdminDashboardResponse = {
  at: number;
  /** null = 실시간 서버에 닿지 못함 */
  online: DashOnline | null;
  maint: MaintState | null;
  concept: MapConcept | null;
  conn: ConnHealth | null;
  signups: { today: CountRow[]; week: CountRow[] } | null;
  housing: DashHousing | null;
};

const zeroCamp = (): Record<CampHomeKind, number> => ({ caravan: 0, pension: 0, rural: 0 });
const KIND_OF_LOT = new Map(CAMP_LOTS.map((l) => [l.lot, l.kind] as const));

/** 터 번호들 → 종류별 수 (순수. 모르는 번호는 뺀다) */
export function campKinds(lots: readonly (number | string)[]): Record<CampHomeKind, number> {
  const out = zeroCamp();
  for (const l of lots) {
    const k = KIND_OF_LOT.get(Number(l));
    if (k) out[k] += 1;
  }
  return out;
}

/** 채널별 줄 → 합계·용량 (순수). 아무 집도 없는 채널은 줄에서 뺀다 */
export function housingOf(rows: readonly DashHousingRow[], at: number): DashHousing {
  const total = { camp: zeroCamp(), sea: 0, village: 0 };
  for (const r of rows) {
    for (const k of Object.keys(total.camp) as CampHomeKind[]) total.camp[k] += r.camp[k];
    total.sea += r.sea;
    total.village += r.village;
  }
  const cap = { camp: campKinds(CAMP_LOTS.map((l) => l.lot)), sea: SEA_LOT_COUNT };
  const used = rows.filter((r) => r.sea + r.village + r.camp.caravan + r.camp.pension + r.camp.rural > 0);
  return { rows: used, total, cap, at };
}

/** 지금 명단 → 맵별(실내는 「맵 · 곳」)·채널별 인원 (순수. 같은 계정이 두 번 나오면 하나만) */
export function onlineOf(people: readonly InternalPerson[]): DashOnline {
  const seen = new Set<string>();
  const uniq = people.filter((p) => !seen.has(p.visitorId) && !!seen.add(p.visitorId));
  const map = new Map<string, number>();
  const ch = new Map<number, number>();
  for (const p of uniq) {
    const m = MAP_NAME[mapOf(p.map)] ?? "마을";
    const label = p.inside && p.place ? `${m} · ${AWAY_PLACE_LABEL[p.place]}` : m;
    map.set(label, (map.get(label) ?? 0) + 1);
    ch.set(p.ch, (ch.get(p.ch) ?? 0) + 1);
  }
  return {
    total: uniq.length,
    byMap: [...map].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ko")),
    byCh: [...ch].map(([c, n]) => ({ ch: c, n })).sort((a, b) => a.ch - b.ch),
  };
}

const HOUSING_MEMO_MS = 60_000;
const g = globalThis as typeof globalThis & { __tombDashHousing?: DashHousing };

/**
 * 집 기록 → 채널별 줄 (순수). 번지가 있는 집만 센다 (숨긴 집도 터를 차지하니 센다).
 * 11/27 번지 색인 크기(HLEN)로 세던 것을 집 기록으로 바꿨다 — 철거한 집이 색인에 남은 낡은 칸이 「2채널 마을 1」로 보였다 (운영, 그 채널엔 집이 없었다)
 */
export function housingRowsOf(houses: readonly Pick<HouseRecord, "ch" | "lot" | "zone">[], channels = HOUSING_CHANNELS): DashHousingRow[] {
  const rows = new Map<number, { camp: number[]; sea: number; village: number }>();
  for (let ch = 1; ch <= channels; ch++) rows.set(ch, { camp: [], sea: 0, village: 0 });
  for (const h of houses) {
    const r = rows.get(h.ch);
    if (!r || !(h.lot > 0)) continue;
    if (h.zone === "camp") r.camp.push(h.lot);
    else if (h.zone === "sea") r.sea += 1;
    else r.village += 1;
  }
  return [...rows].map(([ch, r]) => ({ ch, camp: campKinds(r.camp), sea: r.sea, village: r.village }));
}

/** 채널마다 분양 수 — 관리자 하우징 목록·채널 목록과 같은 집 기록(listAll: ZRANGE 1 + 집마다 HGETALL, 파이프라인 1번)에서 센다. 1분 기억 */
async function loadHousing(now: number): Promise<DashHousing> {
  const memo = g.__tombDashHousing;
  if (memo && now - memo.at < HOUSING_MEMO_MS) return memo;
  const out = housingOf(housingRowsOf(await getHouseStore().listAll()), now);
  g.__tombDashHousing = out;
  return out;
}

const top = (counts: Record<string, number>): CountRow[] =>
  Object.entries(counts)
    .map(([label, n]) => ({ label, n }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ko"));

async function loadSignups(now: number) {
  const days = Array.from({ length: 7 }, (_, i) => kstDay(now - i * 86_400_000));
  const store = getSignupSrc();
  const [today, rest] = await Promise.all([store.dayCounts(days.slice(0, 1)), store.dayCounts(days.slice(1))]);
  const week: Record<string, number> = { ...rest };
  for (const [k, n] of Object.entries(today)) week[k] = (week[k] ?? 0) + n;
  return { today: top(today), week: top(week) };
}

const settle = <T>(r: PromiseSettledResult<T>, what: string): T | null => {
  if (r.status === "fulfilled") return r.value;
  console.warn(`[adminDashboard] ${what} 실패`, r.reason);
  return null;
};

export async function loadDashboard(now = Date.now()): Promise<AdminDashboardResponse> {
  rememberMaint(null); // 점검 상태는 기억을 건너뛰고 실시간 서버에 다시 묻는다 (관리자 점검 화면과 같다)
  const [people, maint, concept, conn, signups, housing] = await Promise.allSettled([
    onlinePeople(),
    readMaint(now),
    getMapConceptStore().get(),
    connHealth24h(now),
    loadSignups(now),
    loadHousing(now),
  ]);
  const ppl = settle(people, "지금 명단");
  return {
    at: now,
    online: ppl ? onlineOf(ppl) : null,
    maint: settle(maint, "점검 상태"),
    concept: settle(concept, "맵 컨셉"),
    conn: settle(conn, "접속 종료"),
    signups: settle(signups, "가입 유입"),
    housing: settle(housing, "분양 현황"),
  };
}

