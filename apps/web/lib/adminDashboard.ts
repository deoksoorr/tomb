import { AWAY_PLACE_LABEL, CAMP_LOTS, MAP_NAME, mapOf, type CampHomeKind, type InternalPerson, type MaintState } from "@tomb/protocol";
import { onlinePeople } from "./ban";
import { env } from "./env";
import { HOUSING_CHANNELS, SEA_LOT_COUNT, type HouseZone } from "./housing/catalog";
import { getHouseStore } from "./housing/service";
import { HK } from "./housing/store-redis";
import { readMaint, rememberMaint } from "./maintenance";
import type { MapConcept } from "./mapConcept";
import { connHealth24h, type ConnHealth } from "./opsLog";
import { redisClient } from "./redisUsage";
import { kstDay } from "./store/accounts";
import { getMapConceptStore } from "./store/mapConcept";
import { getSignupSrc } from "./store/signupSrc";

// 11/26 관리자 대시보드 한 번에 (GET /api/admin/dashboard). 열 때와 [새로고침] 때만 부른다 — 자동으로 다시 묻지 않는다.
// 실시간 서버: 지금 명단(맵별 인원)·점검 상태 (Redis 없음)
// Redis: 맵 컨셉 GET 1 + 24시간 접속 종료 시간 칸 24 (파이프라인 1번) + 가입 유입 날짜 칸 7 (파이프라인 2번) + 집터 색인 31 (파이프라인 1번, 1분 기억)
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

/** 채널마다 집터 색인 크기 (Redis는 파이프라인 한 번 — 캠핑장 HKEYS·바닷가 HLEN·마을 HLEN, 1분 기억) */
async function loadHousing(now: number): Promise<DashHousing> {
  const memo = g.__tombDashHousing;
  if (memo && now - memo.at < HOUSING_MEMO_MS) return memo;
  const chs = Array.from({ length: HOUSING_CHANNELS }, (_, i) => i + 1);
  const conn = env.redis();
  let rows: DashHousingRow[];
  if (conn) {
    const p = redisClient(conn, "adminDashboard").pipeline();
    for (const ch of chs) {
      p.hkeys(HK.campLots(ch));
      p.hlen(HK.seaLots(ch));
      p.hlen(HK.lots(ch));
    }
    p.hlen(HK.legacyLots); // 채널이 생기기 전 색인 (1채널로 옮기기 전이면 1채널에 더한다)
    const got = await p.exec<unknown[]>();
    rows = chs.map((ch, i) => ({
      ch,
      camp: campKinds(Array.isArray(got[i * 3]) ? (got[i * 3] as string[]) : []),
      sea: Number(got[i * 3 + 1]) || 0,
      village: (Number(got[i * 3 + 2]) || 0) + (ch === 1 ? Number(got[chs.length * 3]) || 0 : 0),
    }));
  } else {
    // 로컬(메모리 저장소): 채널·구역마다 분양 마을을 그대로 센다
    const store = getHouseStore();
    const count = (ch: number, zone?: HouseZone) => store.village(ch, zone);
    rows = await Promise.all(
      chs.map(async (ch) => {
        const [camp, sea, village] = await Promise.all([count(ch, "camp"), count(ch, "sea"), count(ch)]);
        return { ch, camp: campKinds(camp.map((h) => h.lot)), sea: sea.length, village: village.length };
      }),
    );
  }
  const out = housingOf(rows, now);
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

