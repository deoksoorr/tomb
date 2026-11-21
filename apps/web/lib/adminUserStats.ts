import { chairWeek } from "./chairman/rules";
import { getChairStore, type ChairMine } from "./chairman/store";
import { DEX_CAT_LABEL, DEX_CATS, dexIdsOf } from "./forage/catalog";
import { getHouseStore, houseIdFor } from "./housing/service";
import type { HouseRecord } from "./housing/store";
import { PLOT_TIERS } from "./housing/catalog";
import { kstMonth } from "./referralRules";
import { BRANCH_INFO, BRANCHES } from "./rpg/skillTree";
import { spentIn } from "./rpg/skillRules";
import { HUNT_ZONES, ZONE_IDS } from "./rpg/catalog";
import { getRpgStore } from "./rpg/store";
import { getTowerStore } from "./rpg/towerStore";
import type { CharacterState } from "./rpg/types";
import { HttpError } from "./http";
import { isStaff } from "./staff";
import { stayText } from "./stayTime";
import { getAccounts, getFriends, getMegaphone } from "./store";
import { kstDay, kstWeek } from "./store/accounts";
import { getBanStore, isBanActive, type BanRecord } from "./store/bans";
import { MEGA_KEEP } from "./store/megaphone";
import { getReferrals, type ReferrerStats } from "./store/referrals";
import { getReportBox } from "./store/reportBox";
import type { AccountRecord, AccountSummary } from "./store/types";
import { getActivity } from "./store/userActivity";
import { TITLE_IDS } from "@tomb/protocol";
import { titleDef, type TitleMetric } from "./titles";
import { reachedTitles, titleFacts } from "./titlesServer";

// 관리자 「유저 활동」에서 유저를 누르면 여는 계정 상세 (GET /api/admin/accounts/{id}/stats).
// 새로 쓰는 값 없이 이미 저장된 것만 읽는다 (판 수 누적 CharacterState.hz만 11/20부터 판 끝 저장에 같이 싣는다 — 명령 추가 없음).
// 읽기는 저장소마다 한 번씩 한꺼번에(Promise.all) 보내 왕복 한 번 시간이고, 결과는 인스턴스에 30초 기억한다.

export type StatRow = { label: string; value: string; note?: string };
/** num = 오른쪽 정렬할 열 번호 */
export type StatTable = { head: string[]; rows: string[][]; num: number[] };
export type StatSection = { id: string; title: string; note?: string; rows: StatRow[]; table?: StatTable };
export type AdminUserStats = { accountId: string; name: string | null; at: number; sections: StatSection[] };

/** 판 수 누적(hz)을 시작한 날 */
export const RUNS_SINCE = "11/20";

type Rank = { value: number; rank: number } | null;

/** 저장소에서 읽은 그대로 (못 읽은 칸은 null) */
export type UserStatsRaw = {
  accountId: string;
  now: number;
  staff: boolean;
  summary: AccountSummary | null;
  account: Pick<AccountRecord, "streak" | "lastAttend" | "inventory" | "equipped" | "stash" | "graves" | "nameChanges"> | null;
  activeDays: number | null;
  hourDays: number | null;
  pointRank: Rank;
  pointWeek: Rank;
  stayRank: Rank;
  char: CharacterState | null;
  kills: Rank;
  killsWeek: Rank;
  /** 사냥터 id → 최단 클리어 ms·순위 */
  zoneBest: Record<string, Rank>;
  towerRank: number | null;
  chair: ChairMine | null;
  metrics: Partial<Record<TitleMetric, number>> | null;
  titles: string[] | null;
  wornTitle: string | null;
  friends: { friends: number; incoming: number; outgoing: number } | null;
  referrals: ReferrerStats | null;
  referredBy: string | null;
  houses: { village: HouseRecord | null; sea: HouseRecord | null } | null;
  megaphones: number | null;
  bans: BanRecord[] | null;
  reported: { count: number; lastAt: number } | null;
};

// ── 표시 ──

const NA = "—";
const num = (n: number) => Math.round(n).toLocaleString("ko-KR");
const opt = (n: number | null | undefined, unit = "") => (n === null || n === undefined ? NA : `${num(n)}${unit}`);
const ranked = (r: Rank, unit = "") => (r ? `${num(r.value)}${unit}` : NA);
const rankNote = (r: Rank | { rank: number } | null) => (r ? `${num(r.rank)}위` : undefined);
/** KST 날짜 (2026. 11. 20.) */
export function kstDate(ms: number): string {
  if (!ms) return NA;
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
}
/** KST 날짜·시각 (11/20 14:05) */
export function kstTime(ms: number): string {
  if (!ms) return NA;
  const d = new Date(ms + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
/** 판 시간 (1분 23.4초) */
export function clock(ms: number): string {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1);
  return m ? `${m}분 ${rest}초` : `${rest}초`;
}
const ymd = (d: string | null) => (d && /^\d{8}$/.test(d) ? `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}` : NA);
const ago = (ms: number, now: number) => {
  if (!ms) return NA;
  const min = Math.max(0, Math.floor((now - ms) / 60_000));
  if (min < 60) return min < 1 ? "방금" : `${min}분 전`;
  if (min < 1440) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / 1440)}일 전`;
};
const star = (t: number) => (t > 0 ? `★${50 + t}` : NA);

/** 가장 많이 찍은 스킬 갈래 (없으면 null) */
function mainBranch(c: CharacterState): { name: string; sp: number } | null {
  let best: { name: string; sp: number } | null = null;
  for (const b of BRANCHES) {
    const sp = spentIn(c.skills, b);
    if (sp > 0 && (!best || sp > best.sp)) best = { name: BRANCH_INFO[b].name, sp };
  }
  return best;
}

const runsOf = (c: CharacterState | null, key: string) => c?.hz?.[key] ?? [0, 0];

// ── 조립 (순수) ──

export function buildUserStats(r: UserStatsRaw): AdminUserStats {
  const s = r.summary;
  const a = r.account;
  const c = r.char;
  const m = r.metrics ?? {};
  const now = r.now;
  const runsNote = `판 수 집계 시작 ${RUNS_SINCE}.`;

  const status = r.bans?.some((b) => isBanActive(b, now)) ? "정지" : r.staff ? "운영자" : s?.renameRequired ? "휴면" : "정상";
  const basic: StatSection = {
    id: "basic",
    title: "기본",
    rows: [
      { label: "상태", value: status },
      { label: "가입일", value: s ? kstDate(s.createdAt) : NA, note: s && !s.createdAt ? "기록 전 옛 계정" : undefined },
      { label: "마지막 접속", value: s ? ago(s.lastSeenAt, now) : NA, note: s?.lastSeenAt ? kstTime(s.lastSeenAt) : undefined },
      { label: "총 접속 시간", value: s?.stayMinutes ? stayText(s.stayMinutes) : NA, note: rankNote(r.stayRank) },
      { label: "활동한 날", value: opt(r.activeDays, "일"), note: r.hourDays ? `1시간 넘게 머문 날 ${num(r.hourDays)}일` : undefined },
      { label: "연속 출석", value: opt(a?.streak, "일"), note: a?.lastAttend ? `마지막 도장 ${ymd(a.lastAttend)}` : undefined },
      { label: "닉네임 바꾼 횟수", value: opt(a?.nameChanges, "번") },
      { label: "접속 코드", value: s ? (s.hasCode ? "있음" : "없음") : NA },
      { label: "세운 묘비", value: opt(a?.graves.length, "개") },
    ],
  };

  const branch = c ? mainBranch(c) : null;
  const zoneRows = ZONE_IDS.map((id) => {
    const [n, clear] = runsOf(c, id);
    const best = r.zoneBest[id] ?? null;
    return { id, n, clear, best };
  });
  const huntTotal = zoneRows.reduce((t, z) => t + z.n, 0);
  const huntClear = zoneRows.reduce((t, z) => t + z.clear, 0);
  const hunt: StatSection = {
    id: "hunt",
    title: "사냥",
    note: `${runsNote} 처치 수와 최단 기록은 적정 레벨 판만 랭킹에 남아요.`,
    rows: [
      { label: "레벨", value: c ? `Lv.${c.level}` : NA, note: c && c.tLevel > 0 ? `초월 ${star(c.tLevel)}` : undefined },
      { label: "주 갈래", value: branch?.name ?? NA, note: branch ? `스킬 ${branch.sp}포인트` : undefined },
      { label: "끝낸 판 전체", value: c ? `${num(c.runs)}판` : NA, note: "미니게임·야근 빌딩 포함" },
      { label: "사냥터 판", value: `${num(huntTotal)}판`, note: `깬 판 ${num(huntClear)}판` },
      { label: "누적 처치", value: ranked(r.kills, "마리"), note: rankNote(r.kills) },
      { label: "이번 주 처치", value: ranked(r.killsWeek, "마리"), note: rankNote(r.killsWeek) },
      { label: "곤충 잡기 판", value: `${num(runsOf(c, "bugs")[0])}판` },
      { label: "별자리 잇기 판", value: `${num(runsOf(c, "stars")[0])}판` },
      { label: "가장 높은 강화", value: c?.enhMax ? `+${c.enhMax}` : NA },
      { label: "세트 장비", value: c ? `${num(c.sg?.length ?? 0)}개` : NA },
      { label: "스킬 초기화", value: c ? `${num(c.respecs)}번` : NA, note: c ? `능력치 초기화 ${num(c.statResets)}번` : undefined },
    ],
    table: {
      head: ["사냥터", "판", "깬 판", "최단 기록", "순위"],
      num: [1, 2, 3, 4],
      rows: zoneRows
        .filter((z) => z.n > 0 || z.best)
        .map((z) => [HUNT_ZONES[z.id].name, num(z.n), num(z.clear), z.best ? clock(z.best.value) : NA, z.best ? `${num(z.best.rank)}위` : NA]),
    },
  };

  const [towerRuns, towerFloors] = runsOf(c, "tower");
  const tower: StatSection = {
    id: "tower",
    title: "야근 빌딩",
    note: runsNote,
    rows: [
      { label: "최고 층", value: c?.fBest ? `${num(c.fBest)}층` : NA, note: c?.fBest && c.fBestMs ? `${clock(c.fBestMs)} 만에` : undefined },
      { label: "전체 순위", value: r.towerRank ? `${num(r.towerRank)}위` : NA },
      { label: "이번 주 최고", value: c?.fWkBest && c.fWk === kstWeek(now) ? `${num(c.fWkBest)}층` : NA },
      { label: "오른 판", value: `${num(towerRuns)}판`, note: `깬 층 합 ${num(towerFloors)}층` },
      { label: "오늘 연 우두머리 상자", value: c && c.tDay === kstDay(now) ? `${num(c.tChest)}개` : "0개" },
      { label: "개척자", value: c?.pioneer ? `${num(c.pioneer.n)}번` : NA, note: c?.pioneer ? kstDate(c.pioneer.at) : undefined },
    ],
  };

  const ch = r.chair;
  const chairRow = (mode: "normal" | "hell", label: string): StatRow[] => [
    { label: `${label} 최고 피해`, value: ch?.best[mode] ? num(ch.best[mode]) : NA, note: ch?.bestMs[mode] ? `${clock(ch.bestMs[mode])} 판` : undefined },
    { label: `${label} 이번 주`, value: ch?.week[mode] ? num(ch.week[mode]!.damage) : NA, note: ch?.week[mode] ? `${num(ch.week[mode]!.rank)}위` : undefined },
    { label: `${label} 오늘 판`, value: ch ? `${num(ch.used[mode])}판` : NA },
  ];
  const chair: StatSection = {
    id: "chair",
    title: "회장님 독대",
    note: "전체 판 수는 따로 세지 않아요. 오늘 판만 있어요.",
    rows: [...chairRow("normal", "일반"), ...chairRow("hell", "지옥")],
  };

  const dexRows: StatRow[] = DEX_CATS.map((cat) => ({
    label: `${DEX_CAT_LABEL[cat]} 도감`,
    value: r.metrics ? `${num(m[`dex_${cat}` as TitleMetric] ?? 0)} / ${num(dexIdsOf(cat).length)}` : NA,
  }));
  const life: StatSection = {
    id: "life",
    title: "채집·낚시",
    rows: [
      { label: "낚은 물고기", value: r.metrics ? `${num(m.fishn ?? 0)}마리` : NA, note: m.big ? `가장 큰 것 ${(m.big / 10).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}cm` : undefined },
      { label: "채집한 것", value: r.metrics ? `${num(m.gath ?? 0)}개` : NA, note: "곤충·약초·광석·발굴품" },
      { label: "끝낸 수집 의뢰", value: r.metrics ? `${num(m.quests ?? 0)}개` : NA },
      ...dexRows,
    ],
  };

  const points: StatSection = {
    id: "points",
    title: "포인트",
    rows: [
      { label: "지금 지갑", value: s ? `${num(s.points)}P` : NA },
      { label: "모은 포인트", value: s ? `${num(s.lifetimePoints)}P` : NA, note: rankNote(r.pointRank) },
      { label: "이번 주 모은 포인트", value: ranked(r.pointWeek, "P"), note: rankNote(r.pointWeek) },
      { label: "주간 1위", value: r.metrics ? `${num(m.champ ?? 0)}번` : NA },
    ],
  };

  const invKinds = a ? Object.values(a.inventory).filter((n) => n > 0).length : null;
  const houseText = (h: HouseRecord | null) =>
    h ? `${PLOT_TIERS.find((t) => t.id === h.tier)?.name ?? h.tier}, ${h.ch}채널 ${h.lot}번지` : "없음";
  const worn = r.wornTitle ? (titleDef(r.wornTitle)?.name ?? r.wornTitle) : null;
  const deco: StatSection = {
    id: "deco",
    title: "꾸미기·집",
    rows: [
      { label: "입은 꾸미기", value: opt(a?.equipped.length, "개"), note: a ? `벗어 둔 것 ${num(a.stash.length)}개` : undefined },
      { label: "가방 아이템", value: opt(invKinds, "종류") },
      { label: "꾸미기 점수", value: r.metrics ? num(m.look ?? 0) : NA },
      { label: "칭호", value: r.titles ? `${num(r.titles.length)} / ${num(TITLE_IDS.length)}` : NA, note: worn ? `달고 있는 칭호 ${worn}` : undefined },
      { label: "마을 집", value: r.houses ? houseText(r.houses.village) : NA, note: r.houses?.village ? `꾸밈 점수 ${num(r.houses.village.score)}, 좋아요 ${num(r.houses.village.likes)}` : undefined },
      { label: "포구 오두막", value: r.houses ? (r.houses.sea ? `${r.houses.sea.ch}채널 ${r.houses.sea.lot}번 터` : "없음") : NA, note: r.houses?.sea ? `꾸밈 점수 ${num(r.houses.sea.score)}` : undefined },
    ],
  };

  const ref = r.referrals;
  const social: StatSection = {
    id: "social",
    title: "소셜",
    rows: [
      { label: "친구", value: r.friends ? `${num(r.friends.friends)}명` : NA, note: r.friends ? `받은 신청 ${num(r.friends.incoming)}, 보낸 신청 ${num(r.friends.outgoing)}` : undefined },
      { label: "데려온 이웃", value: ref ? `${num(ref.joined)}명` : NA, note: ref ? `조건 넘김 ${num(ref.qualified)}명, 보상 ${num(ref.paid)}번` : undefined },
      { label: "추천인", value: r.referredBy ?? "없음" },
      { label: "확성기", value: opt(r.megaphones, "번"), note: `최근 ${MEGA_KEEP}개 기록 안에서 세요` },
    ],
  };

  const bans = r.bans ?? [];
  const active = bans.find((b) => isBanActive(b, now));
  const last = bans[0];
  const sanction: StatSection = {
    id: "sanction",
    title: "제재",
    rows: [
      {
        label: "지금 정지",
        value: r.bans ? (active ? (active.until ? `${kstTime(active.until)}까지` : "영구") : "없음") : NA,
        note: active?.reason || undefined,
      },
      { label: "정지 기록", value: r.bans ? `${num(bans.length)}번` : NA, note: last ? `마지막 ${kstDate(last.startAt)}` : undefined },
      { label: "받은 유저 신고", value: r.reported ? `${num(r.reported.count)}번` : "0번", note: r.reported?.lastAt ? `마지막 ${kstTime(r.reported.lastAt)}` : undefined },
    ],
  };

  return { accountId: r.accountId, name: s?.name ?? null, at: now, sections: [basic, hunt, tower, chair, life, points, deco, social, sanction] };
}

// ── 읽기 ──

const CACHE_MS = 30_000;
const cg = globalThis as typeof globalThis & { __tombUserStats?: Map<string, { at: number; v: AdminUserStats }> };
const cache = () => (cg.__tombUserStats ??= new Map());

const safe = <T>(p: Promise<T>, fb: T): Promise<T> =>
  p.catch((e: unknown) => {
    console.error("[admin] 유저 상세 읽기 실패", e);
    return fb;
  });
const rankOf = (p: Promise<{ mine: { points: number; rank: number } | null }>): Promise<Rank> =>
  safe(
    p.then((x) => (x.mine ? { value: x.mine.points, rank: x.mine.rank } : null)),
    null,
  );

/** 저장소들에서 한꺼번에 읽는다 (fresh면 기억을 건너뛴다) */
export async function readUserStats(id: string, now = Date.now(), fresh = false): Promise<AdminUserStats> {
  const hit = cache().get(id);
  if (!fresh && hit && now - hit.at < CACHE_MS) return hit.v;
  const accounts = getAccounts();
  const day = kstDay(now);
  const week = kstWeek(now);
  const towers = getTowerStore();
  const [summary, account, staff, activeDays, hourDays, pointRank, pointWeek, stayRank, char, kills, killsWeek, zoneBest, towerScore, chair, metrics, titles, wornTitle, friends, referrals, referredBy, houses, megaphones, bans, reported] =
    await Promise.all([
      // 계정 요약은 못 읽으면 그대로 실패 (없는 계정과 구분)
      accounts.summaries([id]).then((x) => x[0] ?? null),
      safe(accounts.get(id, day, now), null),
      safe(isStaff(id), false),
      safe(getActivity().activeDays([id]).then((x) => x[0] ?? 0), null),
      safe(getActivity().hourDays([id]).then((x) => x[0] ?? 0), null),
      // limit 1: 0이면 Redis가 전체를 돌려준다
      rankOf(accounts.pointRank(1, id)),
      rankOf(accounts.pointRank(1, id, week)),
      rankOf(accounts.stayRank(1, id)),
      safe(getRpgStore().get(id), null),
      rankOf(accounts.huntRank("kills", 1, id, {})),
      rankOf(accounts.huntRank("kills", 1, id, { week })),
      Promise.all(ZONE_IDS.map((zone) => rankOf(accounts.huntRank("best", 1, id, { zone })))).then((v) => Object.fromEntries(ZONE_IDS.map((z, i) => [z, v[i]]))),
      safe(towers.scoreOf(id), null),
      // 회장님 독대 주는 chairWeek (첫 주 전 기록도 첫 주에)
      safe(getChairStore().mine(id, day, chairWeek(now)), null),
      safe(
        titleFacts(id, now).then((f) => f.metrics),
        null,
      ),
      safe(reachedTitles(id, now), null),
      safe(accounts.wornTitle(id, now), null),
      safe(
        getFriends()
          .lists(id, now)
          .then((l) => ({ friends: l.friends.length, incoming: l.incoming.length, outgoing: l.outgoing.length })),
        null,
      ),
      safe(getReferrals().stats(id, kstMonth(now)), null),
      safe(
        getReferrals()
          .get(id)
          .then(async (rec) => (rec ? ((await accounts.summaries([rec.referrerId]))[0]?.name ?? rec.referrerId) : null)),
        null,
      ),
      safe(
        Promise.all([getHouseStore().get(houseIdFor(id)), getHouseStore().get(houseIdFor(id, "sea"))]).then(([village, sea]) => ({ village, sea })),
        null,
      ),
      safe(
        getMegaphone()
          .recent(MEGA_KEEP, now)
          .then((l) => l.filter((x) => x.accountId === id).length),
        null,
      ),
      safe(
        getBanStore()
          .list()
          .then((l) => l.filter((b) => b.accountId === id)),
        null,
      ),
      safe(
        getReportBox()
          .get(`user:${id}`)
          .then((c) => (c ? { count: c.count, lastAt: c.lastAt } : null)),
        null,
      ),
    ]);
  if (!summary) throw new HttpError(404, "NOT_FOUND", "계정을 찾을 수 없어요.");
  const towerRank = towerScore === null ? null : await safe(towers.countAbove(towerScore).then((n) => n + 1), null);
  const v = buildUserStats({
    accountId: id,
    now,
    staff,
    summary,
    account,
    activeDays,
    hourDays,
    pointRank,
    pointWeek,
    stayRank,
    char,
    kills,
    killsWeek,
    zoneBest,
    towerRank,
    chair,
    metrics,
    titles,
    wornTitle,
    friends,
    referrals,
    referredBy,
    houses,
    megaphones,
    bans,
    reported,
  });
  cache().set(id, { at: now, v });
  if (cache().size > 200) for (const [k, e] of cache()) if (now - e.at >= CACHE_MS) cache().delete(k);
  return v;
}
