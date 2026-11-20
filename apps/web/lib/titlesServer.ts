import type { Redis } from "@upstash/redis";
import { redisClient } from "./redisUsage";
import { champBoards, MANAGER_TITLE_ID, TITLE_IDS, titleOfLook, type AvatarDye, type ChampBoard } from "@tomb/protocol";
import { env } from "./env";
import { DEX_CATS, dexIdsOf, speciesOf } from "./forage/catalog";
import { titlesOf } from "./forage/dexReward";
import { getForageStore } from "./forage/store";
import { getHouseStore, houseIdFor } from "./housing/service";
import { lookScore, wornSeasonSets } from "./lookScore";
import { MAX_LEVEL } from "./rpg/formulas";
import { getRpgStore } from "./rpg/store";
import { getTowerStore } from "./rpg/towerStore";
import { prevWeek } from "./gameDay";
import { isSuperHunter, testServerEnv } from "./rpg/superHunter";
import { isManager } from "./managers";
import { isStaff } from "./staff";
import { getAccounts } from "./store";
import { kstDay, kstWeek, lookOf } from "./store/accounts";
import { getChamp, type ChampWeek } from "./store/champ";
import { K } from "./store/keys";
import { getStyleStore, styleKey } from "./store/style";
import { getTitleMarks, type TitleMarks } from "./store/titleMarks";
import { getReferrals } from "./store/referrals";
import { getTitleStats } from "./store/titleStats";
import type { EquippedItem } from "./store/types";
import { earnedTitleIds, titleDef, titlePerk, type TitleFacts, type TitleMetric, type TitlePerk } from "./titles";
import { forgetWornTitle, recallWornTitle, rememberWornTitle } from "./wornTitle";

// 칭호를 얻었는지 서버에서 확인 (가방 [칭호] 칸 목록·진행도·착용 검증·새 칭호 알림). 읽기에 실패한 갈래는 "아직 없음"으로 본다
// (그 갈래 칭호를 잠깐 못 낄 뿐, 이미 낀 칭호는 그대로). 한 번 알린 칭호는 기록이 내려가도 얻은 것으로 남는다.
// 운영자 계정은 모든 칭호를 얻은 것으로 보고, 새 칭호 알림은 띄우지 않는다.
//
// Redis 명령 아끼기 (11/14):
//  - 계정마다 읽은 결과(진행 수치·알림 기록·단 칭호)를 이 인스턴스 메모리에 FACTS_TTL_MS 동안 기억한다.
//    칭호를 달거나 빼고, 알림·본 기록을 남기면 그 계정 기억을 지운다 (forgetTitles). 도감 등록·1위 지급 결과는 길어야 FACTS_TTL_MS 늦게 보인다.
//  - 명예의 전당(주간 1위 기록)은 모든 계정이 같이 쓰므로 HALL_TTL_MS 동안 한 번만 읽는다.
//  - 계정 기록은 필요한 칸만 (연속 출석·몸·착용·염색 — 3명령), 사냥 처치·어려움/지옥 완주는 점수 하나씩만 (3명령).
//  - 한 번 새로 읽기 = 도감 3 + 집 2 + 사냥 캐릭터 1 + 계정 3 + 사냥 기록 5 + 접속 시간 1 + 추천 1 + 알림 기록 2 ≈ 18명령 (예전 약 46. 11/16 사냥터별 랭킹으로 완주 판 +2).

/** 명예의 전당에서 훑는 주 수 (10년) */
const HALL_WEEKS = 520;
/** 계정마다 칭호 사실을 기억하는 시간 */
export const FACTS_TTL_MS = 5 * 60_000;
/** 명예의 전당을 기억하는 시간 */
const HALL_TTL_MS = 10 * 60_000;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

type Light = { streak: number; body: string | null; equipped: EquippedItem[]; dye: AvatarDye; kills: number; hard: number; hell: number; grad: number };

const g = globalThis as typeof globalThis & {
  __tombTitleFacts?: Map<string, { at: number; facts: TitleFacts; marks: TitleMarks; equipped: string | null }>;
  __tombTitleHall?: { at: number; hall: ChampWeek[] };
  __tombTowerTitles?: { at: number; holders: Map<string, string> };
  __tombTitleRedis?: Redis;
};
const memo = () => (g.__tombTitleFacts ??= new Map());

/** 그 계정의 칭호 기억을 지운다 (칭호 달기·빼기, 알림·본 기록, 시험) */
export function forgetTitles(accountId?: string): void {
  if (accountId) memo().delete(accountId);
  else memo().clear();
  // 11/16 칭호 능력용 단 칭호 기억도 (lib/wornTitle — 다음 loadMe·wornTitle이 새로 적는다)
  forgetWornTitle(accountId);
}

/** 11/15 신화 칭호 주인을 기억하는 시간 (서버 최초·꼭대기 층 주인·지난주 최고층 1위 — 모든 계정이 같이 쓴다) */
const TOWER_TITLES_TTL_MS = 2 * 60_000;

/** 신화 칭호 주인 기억을 지운다 (이 인스턴스에서 주인이 바뀌었을 때 — lib/rpg/service) */
export function forgetTowerTitles(): void {
  delete g.__tombTowerTitles;
}

/** 신화 칭호 id → 지금 주인 계정 (명령 3개를 TOWER_TITLES_TTL_MS에 한 번) */
async function towerHolders(now: number): Promise<Map<string, string>> {
  const c = g.__tombTowerTitles;
  if (c && now - c.at < TOWER_TITLES_TTL_MS) return c.holders;
  const store = getTowerStore();
  const [firsts, top, week] = await Promise.all([store.firsts(), store.topHolder(), store.top(1, prevWeek(kstWeek(now)))]);
  const holders = new Map(Object.entries(firsts));
  if (top) holders.set("t_topFloor", top.accountId);
  if (week[0]) holders.set("t_weekFloor", week[0].accountId);
  g.__tombTowerTitles = { at: now, holders };
  return holders;
}

async function hall(now: number): Promise<ChampWeek[]> {
  const c = g.__tombTitleHall;
  if (c && now - c.at < HALL_TTL_MS) return c.hall;
  const h = await getChamp().hall(HALL_WEEKS);
  g.__tombTitleHall = { at: now, hall: h };
  return h;
}

/** 계정 기록에서 칭호에 필요한 칸만 + 사냥 기록 점수 (Redis면 파이프라인 8명령, 메모리면 저장소 함수) */
async function light(accountId: string, now: number): Promise<Light> {
  const conn = env.redis();
  if (!conn) {
    const accounts = getAccounts();
    const [a, style, kills, hard, hell] = await Promise.all([
      accounts.get(accountId, kstDay(now), now),
      getStyleStore(accounts).get(accountId),
      accounts.huntRank("kills", 1, accountId, {}).then((r) => r.mine?.points ?? 0),
      accounts.huntCleared(accountId, "hard").then((x) => (x ? 1 : 0)),
      accounts.huntCleared(accountId, "hell").then((x) => (x ? 1 : 0)),
    ]);
    return { streak: a.streak, body: a.body, equipped: a.equipped, dye: style.dye, kills, hard, hell, grad: a.retain.gp };
  }
  const redis = (g.__tombTitleRedis ??= redisClient(conn, "titlesServer"));
  // 11/16 어려움·지옥 완주: 옛 난이도 판 + 사냥터별로 바뀐 뒤의 난이도 판 (lib/store/huntBoards)
  const [acct, look, style, kills, hardOld, hardNew, hellOld, hellNew] = (await redis
    .pipeline()
    // 11/18 gp = 새 이웃 꾸러미 받은 수 (같은 HMGET에 칸만 하나 — 명령 그대로)
    .hmget(K.acct(accountId), "streak", "body", "gp")
    .hgetall(K.look(accountId))
    .hgetall(styleKey(accountId))
    .zscore(K.rankHuntKills, accountId)
    .zscore(K.rankHuntBest("hard"), accountId)
    .zscore(K.rankHuntClear("hard"), accountId)
    .zscore(K.rankHuntBest("hell"), accountId)
    .zscore(K.rankHuntClear("hell"), accountId)
    .exec()) as unknown[];
  const has = (...xs: unknown[]) => (xs.some((x) => x !== null && x !== undefined) ? 1 : 0);
  const pairs = (raw: unknown): [string, string][] => {
    if (Array.isArray(raw)) {
      const out: [string, string][] = [];
      for (let i = 0; i + 1 < raw.length; i += 2) out.push([String(raw[i]), String(raw[i + 1])]);
      return out;
    }
    return raw && typeof raw === "object" ? Object.entries(raw).map(([k, v]) => [k, String(v)]) : [];
  };
  const a = Array.isArray(acct) ? acct : acct && typeof acct === "object" ? Object.values(acct) : [];
  const equipped = pairs(look).flatMap(([, v]) => {
    const [itemId, until] = v.split("|");
    return itemId && Number(until) > now ? [{ itemId, until: Number(until) }] : [];
  });
  const st = Object.fromEntries(pairs(style));
  const dye: AvatarDye = {};
  for (const p of ["head", "body", "accent"] as const) if (st[p]) dye[p] = st[p];
  return {
    streak: Number(a[0]) || 0,
    body: a[1] === null || a[1] === undefined ? null : String(a[1]),
    equipped,
    dye,
    kills: Math.floor(Number(kills) || 0),
    hard: has(hardOld, hardNew),
    hell: has(hellOld, hellNew),
    grad: Number(a[2]) || 0,
  };
}

/** 계절 한정 세트 id → 칭호 진행 수치 이름 (titles.ts STEP_ROWS t_ss*) */
const SEASON_SET_METRIC: Readonly<Record<string, TitleMetric>> = {
  "snow-commute": "ssSnow",
  "santa-intern": "ssSanta",
  "overtime-fairy": "ssOvertime",
  "fog-keeper": "ssFog",
  "seollal-magpie": "ssMagpie",
  "giri-choco": "ssGiri",
  "spring-picnic": "ssPicnic",
  "sports-day": "ssSports",
  "year-end": "ssYearEnd",
  "sunrise-hike": "ssSunrise",
  resolution: "ssResol",
  "smelt-fest": "ssSmelt",
  "frost-yard": "ssFrost",
};

/** 11/19 계절 한정 세트 칭호 진행 수치 (지금 한 벌을 다 입었으면 1) */
function seasonSetMetrics(equipped: readonly EquippedItem[], now: number): Partial<Record<TitleMetric, number>> {
  const worn = new Set(wornSeasonSets({ equipped }, now).map((s) => s.id));
  const out: Partial<Record<TitleMetric, number>> = {};
  for (const [set, metric] of Object.entries(SEASON_SET_METRIC)) out[metric] = worn.has(set) ? 1 : 0;
  return out;
}

/** 칭호 사실 새로 읽기 (기억 없이) */
async function readFacts(accountId: string, now: number): Promise<{ facts: TitleFacts; equipped: string | null }> {
  const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
  const [forage, champ, house, rpg, sup, l, stats, holders, refs] = await Promise.all([
    safe(getForageStore().dex(accountId), null),
    safe(
      Promise.all([hall(now), testServerEnv() ? getChamp().test(accountId, now) : Promise.resolve(null)]).then(([weeks, test]) => {
        const set = new Set<ChampBoard>(champBoards(test?.bits));
        let n = 0;
        for (const w of weeks)
          for (const x of w.winners)
            if (x.accountId === accountId) {
              set.add(x.board);
              n++;
            }
        return { boards: [...set], count: Math.max(n, set.size) };
      }),
      { boards: [] as ChampBoard[], count: 0 },
    ),
    // 11/20 「내 집」 꾸밈 점수 = 마을 집과 포구 오두막 중 높은 쪽 (두 채를 다 가져도 더하지 않는다)
    safe(
      Promise.all([getHouseStore().get(houseIdFor(accountId)), getHouseStore().get(houseIdFor(accountId, "sea"))]).then(([v, c]) => Math.max(v?.score ?? 0, c?.score ?? 0)),
      0,
    ),
    safe(getRpgStore().get(accountId), null),
    safe(isSuperHunter(accountId), false),
    safe(light(accountId, now), null),
    safe(getTitleStats().get(accountId), { stay: 0, quests: 0, qking: 0, urgKing: 0, urgLast: 0 }),
    safe(towerHolders(now), new Map<string, string>()),
    // 추천 코드 칭호: 데려온 이웃 중 조건을 넘긴 수 (ZSCORE 1명령)
    safe(getReferrals().credited(accountId), 0),
  ]);
  const dex = forage?.dex ?? {};
  const has = (id: string) => (dex[id]?.n ?? 0) > 0;
  const metrics: Partial<Record<TitleMetric, number>> = {
    lv: sup ? MAX_LEVEL : (rpg?.level ?? 1),
    // 11/15 사냥 끝판: 초월 레벨·야근 빌딩 최고 층·개척자 번호(와 받은 시각 — 칭호 카드 표시용). 사냥 캐릭터에서 같이 읽는다 (명령 추가 없음)
    tlv: rpg?.tLevel ?? 0,
    floor: rpg?.fBest ?? 0,
    pioneer: rpg?.pioneer?.n ?? 0,
    // 11/15 세트 장비: 4세트 처음 완성(비트) · 가장 높은 강화 (사냥 캐릭터에서 같이 읽는다 — 명령 추가 없음)
    sgOvertime: (rpg?.sgDone ?? 0) & 1 ? 1 : 0,
    sgApproval: (rpg?.sgDone ?? 0) & 2 ? 1 : 0,
    sgMeeting: (rpg?.sgDone ?? 0) & 4 ? 1 : 0,
    sgTrip: (rpg?.sgDone ?? 0) & 8 ? 1 : 0,
    enh: rpg?.enhMax ?? 0,
    ...(rpg?.pioneer ? { pioneerAt: rpg.pioneer.at } : {}),
    kills: l?.kills ?? 0,
    hard: l?.hard ?? 0,
    hell: l?.hell ?? 0,
    fishn: sum(speciesOf("fish").filter((s) => !s.junk).map((s) => dex[s.id]?.n ?? 0)),
    big: Math.max(0, ...speciesOf("fish").filter((s) => !s.junk).map((s) => dex[s.id]?.max ?? 0)),
    gath: sum((["bug", "herb", "ore", "dig"] as const).flatMap((c) => speciesOf(c).map((s) => dex[s.id]?.n ?? 0))),
    streak: l?.streak ?? 0,
    stay: stats.stay,
    // 11/15 수집 의뢰: 끝낸 수 · 수집가 유령 외형 받음 (칭호 누적 해시에서 같이 읽는다 — 명령 추가 없음)
    quests: stats.quests,
    qking: stats.qking,
    look: l ? lookScore({ equipped: l.equipped, body: l.body, dye: l.dye }, now) : 0,
    champ: champ.count,
    house,
    refs,
    grad: l?.grad ?? 0,
    // 11/19 계절 한정 세트: 지금 만료 전 착용품으로 한 벌을 다 입었는지 (내 정보에서 같이 읽는다 — 명령 추가 없음)
    ...seasonSetMetrics(l?.equipped ?? [], now),
  };
  for (const cat of DEX_CATS) metrics[`dex_${cat}`] = dexIdsOf(cat).filter(has).length;
  return {
    facts: {
      dexTitleNames: forage ? titlesOf(forage.dex, forage.claims, forage.pay.marks) : [],
      champBoards: champ.boards,
      metrics,
      // 11/15 신화: 지금 이 계정이 주인인 칭호 (운영자는 랭킹·최초에 들어가지 않는다 — lib/rpg/service)
      mythic: [...holders].filter(([, a]) => a === accountId).map(([id]) => id),
      // 11/15 긴급 의뢰 칭호: 받은 때부터 하루 (칭호 누적 해시에서 같이 읽는다 — 명령 추가 없음)
      timed: [...(stats.urgKing > now ? ["t_urgKing"] : []), ...(stats.urgLast > now ? ["t_urgLast"] : [])],
    },
    equipped: titleOfLook((l?.equipped ?? []).map((e) => e.itemId)),
  };
}

/** 칭호 사실 + 알림 기록 + 단 칭호 (FACTS_TTL_MS 동안 기억) */
async function cached(accountId: string, now: number) {
  const hit = memo().get(accountId);
  if (hit && now - hit.at < FACTS_TTL_MS) return hit;
  const [{ facts, equipped }, marks] = await Promise.all([readFacts(accountId, now), getTitleMarks().get(accountId)]);
  const entry = { at: now, facts, marks, equipped };
  memo().set(accountId, entry);
  // 오래된 기억 정리 (인스턴스 메모리가 끝없이 늘지 않게)
  if (memo().size > 2000) for (const [k, v] of memo()) if (now - v.at >= FACTS_TTL_MS) memo().delete(k);
  return entry;
}

export async function titleFacts(accountId: string, now = Date.now()): Promise<TitleFacts> {
  return (await cached(accountId, now)).facts;
}

export type TitleStatus = {
  earned: string[];
  fresh: string[];
  unseen: string[];
  first: boolean;
  /** 지금 단 칭호 */
  equipped: string | null;
  /** 진행 수치 (가방 [칭호] 칸 진행도) */
  progress: Partial<Record<TitleMetric, number>>;
  /** 운영자 계정 (모든 칭호를 쓸 수 있다) */
  staff?: true;
};

/**
 * 칭호 상태: 얻은 칭호(지금 기록으로 닿은 것 ∪ 예전에 알린 것), 새로 알릴 칭호(fresh = 얻었는데 아직 알림 창을 안 띄운 것),
 * 가방에서 아직 안 본 칭호(unseen), first = 이 계정을 처음 확인 (기능 전에 얻어 둔 칭호를 "칭호가 n개 생겼어요"로 묶어 알린다), 진행 수치
 */
export async function titleStatus(accountId: string, now = Date.now()): Promise<TitleStatus> {
  // 11/16 매니저인지는 칭호 기억(몇 분)에 넣지 않고 매번 본다 (매니저 목록은 인스턴스가 1분 기억 — 해제가 빨리 반영되게)
  const [staff, manager] = await Promise.all([isStaff(accountId).catch(() => false), isManager(accountId, now)]);
  if (staff) {
    const equipped = await getAccounts()
      .get(accountId, kstDay(now), now)
      .then((a) => titleOfLook(lookOf(a)))
      .catch(() => null);
    // 운영자도 매니저 전용 칭호는 매니저로 임명됐을 때만
    return { earned: TITLE_IDS.filter((id) => manager || id !== MANAGER_TITLE_ID), fresh: [], unseen: [], first: false, equipped, progress: {}, staff: true };
  }
  const { facts, marks, equipped } = await cached(accountId, now);
  const reached = new Set<string>(earnedTitleIds({ ...facts, manager }));
  // 한 번 알린 칭호는 기록이 내려가도 남는다 (연속 출석이 끊기거나 집·꾸미기 점수가 내려가도).
  // 11/15 꼭대기 층 주인·이번 주 최고층은 지금 주인일 때만 — 뺏기면 끼고 있던 것도 뺀다 (이 확인은 입장·칭호 창을 열 때)
  // 11/18 보안: 신화(서버에 한 사람 — holder)는 알림 기록으로 남기지 않는다 (지금 주인 기록으로만). 알림 기록은 marks 경로가 닿은 칭호만 적는다
  const earned = TITLE_IDS.filter((id) => reached.has(id) || (marks.announced.includes(id) && !titleDef(id)?.transient && !titleDef(id)?.holder));
  if (equipped && titleDef(equipped)?.transient && !earned.includes(equipped)) {
    await getAccounts()
      .setTitle(accountId, null)
      .then(() => forgetTitles(accountId))
      .catch(() => undefined);
    return { earned, fresh: earned.filter((id) => !marks.announced.includes(id)), unseen: earned.filter((id) => !marks.seen.includes(id)), first: !marks.init, equipped: null, progress: facts.metrics };
  }
  return {
    earned,
    fresh: earned.filter((id) => !marks.announced.includes(id)),
    unseen: earned.filter((id) => !marks.seen.includes(id)),
    first: !marks.init,
    equipped,
    progress: facts.metrics,
  };
}

/**
 * 11/18 보안: 지금 기록으로 닿은 칭호 id (알림 기록은 빼고 — 운영자는 전부). 알림 기록(marks)에는 이것만 적는다
 * (예전에는 아무 칭호 id나 「알렸음」으로 적고 그걸로 착용할 수 있었다)
 */
export async function reachedTitles(accountId: string, now = Date.now()): Promise<string[]> {
  const [staff, manager] = await Promise.all([isStaff(accountId).catch(() => false), isManager(accountId, now)]);
  if (staff) return TITLE_IDS.filter((id) => manager || id !== MANAGER_TITLE_ID);
  const { facts } = await cached(accountId, now);
  return earnedTitleIds({ ...facts, manager });
}

/** 얻은 칭호 id (운영자는 전부) */
export async function earnedTitles(accountId: string, now = Date.now()): Promise<string[]> {
  return (await titleStatus(accountId, now)).earned;
}

/**
 * 11/16 지금 단 칭호 (칭호 능력용). Redis 명령 아끼기: ① 단 칭호 기억(lib/wornTitle — loadMe가 적는다) ② 칭호 사실 기억 ③ 둘 다 없을 때만
 * 착용 해시 "title" 칸 HGET 1번 (계정마다 인스턴스당 WORN_TTL_MS에 많아야 한 번). 읽기에 실패하면 칭호 없음
 */
export async function wornTitle(accountId: string, now = Date.now()): Promise<string | null> {
  const known = recallWornTitle(accountId, now);
  if (known !== undefined) return known;
  const hit = memo().get(accountId);
  if (hit && now - hit.at < FACTS_TTL_MS) return hit.equipped;
  try {
    const id = await getAccounts().wornTitle(accountId, now);
    rememberWornTitle(accountId, id ? [id] : [], now);
    return id;
  } catch {
    return null;
  }
}

/** 11/16 단 칭호의 능력 (서버가 정하는 보상·확률·할인 — lib/titles titlePerk) */
export async function wornPerk(accountId: string, now = Date.now()): Promise<TitlePerk> {
  return titlePerk(await wornTitle(accountId, now));
}

/** 단 칭호의 상점·염색 할인율 (패션 갈래 칭호만 — 읽기에 실패하면 0) */
export async function titleDiscount(accountId: string, now = Date.now()): Promise<number> {
  return (await wornPerk(accountId, now)).discount;
}
