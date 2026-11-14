import { Redis } from "@upstash/redis";
import { champBoards, TITLE_IDS, titleOfLook, type AvatarDye, type ChampBoard } from "@tomb/protocol";
import { env } from "./env";
import { DEX_CATS, dexIdsOf, speciesOf } from "./forage/catalog";
import { titlesOf } from "./forage/dexReward";
import { getForageStore } from "./forage/store";
import { getHouseStore, houseIdFor } from "./housing/service";
import { lookScore } from "./lookScore";
import { MAX_LEVEL } from "./rpg/formulas";
import { getRpgStore } from "./rpg/store";
import { isSuperHunter, testServerEnv } from "./rpg/superHunter";
import { isStaff } from "./staff";
import { getAccounts } from "./store";
import { kstDay, lookOf } from "./store/accounts";
import { getChamp, type ChampWeek } from "./store/champ";
import { K } from "./store/keys";
import { getStyleStore, styleKey } from "./store/style";
import { getTitleMarks, type TitleMarks } from "./store/titleMarks";
import { getTitleStats } from "./store/titleStats";
import type { EquippedItem } from "./store/types";
import { earnedTitleIds, titlePerk, type TitleFacts, type TitleMetric } from "./titles";

// 칭호를 얻었는지 서버에서 확인 (가방 [칭호] 칸 목록·진행도·착용 검증·새 칭호 알림). 읽기에 실패한 갈래는 "아직 없음"으로 본다
// (그 갈래 칭호를 잠깐 못 낄 뿐, 이미 낀 칭호는 그대로). 한 번 알린 칭호는 기록이 내려가도 얻은 것으로 남는다.
// 운영자 계정은 모든 칭호를 얻은 것으로 보고, 새 칭호 알림은 띄우지 않는다.
//
// Redis 명령 아끼기 (11/14):
//  - 계정마다 읽은 결과(진행 수치·알림 기록·단 칭호)를 이 인스턴스 메모리에 FACTS_TTL_MS 동안 기억한다.
//    칭호를 달거나 빼고, 알림·본 기록을 남기면 그 계정 기억을 지운다 (forgetTitles). 도감 등록·1위 지급 결과는 길어야 FACTS_TTL_MS 늦게 보인다.
//  - 명예의 전당(주간 1위 기록)은 모든 계정이 같이 쓰므로 HALL_TTL_MS 동안 한 번만 읽는다.
//  - 계정 기록은 필요한 칸만 (연속 출석·몸·착용·염색 — 3명령), 사냥 처치·어려움/지옥 완주는 점수 하나씩만 (3명령).
//  - 한 번 새로 읽기 = 도감 3 + 집 2 + 사냥 캐릭터 1 + 계정 3 + 사냥 기록 3 + 접속 시간 1 + 알림 기록 2 ≈ 15명령 (예전 약 46).

/** 명예의 전당에서 훑는 주 수 (10년) */
const HALL_WEEKS = 520;
/** 계정마다 칭호 사실을 기억하는 시간 */
export const FACTS_TTL_MS = 5 * 60_000;
/** 명예의 전당을 기억하는 시간 */
const HALL_TTL_MS = 10 * 60_000;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

type Light = { streak: number; body: string | null; equipped: EquippedItem[]; dye: AvatarDye; kills: number; hard: number; hell: number };

const g = globalThis as typeof globalThis & {
  __tombTitleFacts?: Map<string, { at: number; facts: TitleFacts; marks: TitleMarks; equipped: string | null }>;
  __tombTitleHall?: { at: number; hall: ChampWeek[] };
  __tombTitleRedis?: Redis;
};
const memo = () => (g.__tombTitleFacts ??= new Map());

/** 그 계정의 칭호 기억을 지운다 (칭호 달기·빼기, 알림·본 기록, 시험) */
export function forgetTitles(accountId?: string): void {
  if (accountId) memo().delete(accountId);
  else memo().clear();
}

async function hall(now: number): Promise<ChampWeek[]> {
  const c = g.__tombTitleHall;
  if (c && now - c.at < HALL_TTL_MS) return c.hall;
  const h = await getChamp().hall(HALL_WEEKS);
  g.__tombTitleHall = { at: now, hall: h };
  return h;
}

/** 계정 기록에서 칭호에 필요한 칸만 + 사냥 기록 점수 (Redis면 파이프라인 6명령, 메모리면 저장소 함수) */
async function light(accountId: string, now: number): Promise<Light> {
  const conn = env.redis();
  if (!conn) {
    const accounts = getAccounts();
    const [a, style, kills, hard, hell] = await Promise.all([
      accounts.get(accountId, kstDay(now), now),
      getStyleStore(accounts).get(accountId),
      accounts.huntRank("kills", 1, accountId, {}).then((r) => r.mine?.points ?? 0),
      accounts.huntRank("best", 1, accountId, { zone: "hard" }).then((r) => (r.mine ? 1 : 0)),
      accounts.huntRank("best", 1, accountId, { zone: "hell" }).then((r) => (r.mine ? 1 : 0)),
    ]);
    return { streak: a.streak, body: a.body, equipped: a.equipped, dye: style.dye, kills, hard, hell };
  }
  const redis = (g.__tombTitleRedis ??= new Redis({ ...conn, automaticDeserialization: false }));
  const [acct, look, style, kills, hard, hell] = (await redis
    .pipeline()
    .hmget(K.acct(accountId), "streak", "body")
    .hgetall(K.look(accountId))
    .hgetall(styleKey(accountId))
    .zscore(K.rankHuntKills, accountId)
    .zscore(K.rankHuntBest("hard"), accountId)
    .zscore(K.rankHuntBest("hell"), accountId)
    .exec()) as unknown[];
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
    hard: hard === null || hard === undefined ? 0 : 1,
    hell: hell === null || hell === undefined ? 0 : 1,
  };
}

/** 칭호 사실 새로 읽기 (기억 없이) */
async function readFacts(accountId: string, now: number): Promise<{ facts: TitleFacts; equipped: string | null }> {
  const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
  const [forage, champ, house, rpg, sup, l, stats] = await Promise.all([
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
    safe(getHouseStore().get(houseIdFor(accountId)), null),
    safe(getRpgStore().get(accountId), null),
    safe(isSuperHunter(accountId), false),
    safe(light(accountId, now), null),
    safe(getTitleStats().get(accountId), { stay: 0 }),
  ]);
  const dex = forage?.dex ?? {};
  const has = (id: string) => (dex[id]?.n ?? 0) > 0;
  const metrics: Partial<Record<TitleMetric, number>> = {
    lv: sup ? MAX_LEVEL : (rpg?.level ?? 1),
    kills: l?.kills ?? 0,
    hard: l?.hard ?? 0,
    hell: l?.hell ?? 0,
    fishn: sum(speciesOf("fish").filter((s) => !s.junk).map((s) => dex[s.id]?.n ?? 0)),
    big: Math.max(0, ...speciesOf("fish").filter((s) => !s.junk).map((s) => dex[s.id]?.max ?? 0)),
    gath: sum((["bug", "herb", "ore", "dig"] as const).flatMap((c) => speciesOf(c).map((s) => dex[s.id]?.n ?? 0))),
    streak: l?.streak ?? 0,
    stay: stats.stay,
    look: l ? lookScore({ equipped: l.equipped, body: l.body, dye: l.dye }, now) : 0,
    champ: champ.count,
    house: house ? house.score : 0,
  };
  for (const cat of DEX_CATS) metrics[`dex_${cat}`] = dexIdsOf(cat).filter(has).length;
  return {
    facts: { dexTitleNames: forage ? titlesOf(forage.dex, forage.claims, forage.pay.marks) : [], champBoards: champ.boards, metrics },
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
  if (await isStaff(accountId).catch(() => false)) {
    const equipped = await getAccounts()
      .get(accountId, kstDay(now), now)
      .then((a) => titleOfLook(lookOf(a)))
      .catch(() => null);
    return { earned: [...TITLE_IDS], fresh: [], unseen: [], first: false, equipped, progress: {}, staff: true };
  }
  const { facts, marks, equipped } = await cached(accountId, now);
  const reached = new Set<string>(earnedTitleIds(facts));
  // 한 번 알린 칭호는 기록이 내려가도 남는다 (연속 출석이 끊기거나 집·꾸미기 점수가 내려가도)
  const earned = TITLE_IDS.filter((id) => reached.has(id) || marks.announced.includes(id));
  return {
    earned,
    fresh: earned.filter((id) => !marks.announced.includes(id)),
    unseen: earned.filter((id) => !marks.seen.includes(id)),
    first: !marks.init,
    equipped,
    progress: facts.metrics,
  };
}

/** 얻은 칭호 id (운영자는 전부) */
export async function earnedTitles(accountId: string, now = Date.now()): Promise<string[]> {
  return (await titleStatus(accountId, now)).earned;
}

/** 단 칭호의 상점 할인율 (칭호 기억에서 — 칭호를 바꾸면 기억을 지우므로 늘 지금 칭호. 읽기에 실패하면 0) */
export async function titleDiscount(accountId: string, now = Date.now()): Promise<number> {
  try {
    return titlePerk((await titleStatus(accountId, now)).equipped).discount;
  } catch {
    return 0;
  }
}
