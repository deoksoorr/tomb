import { champBoards, TITLE_IDS, type ChampBoard } from "@tomb/protocol";
import { DEX_CATS, dexIdsOf, speciesOf } from "./forage/catalog";
import { titlesOf } from "./forage/dexReward";
import { getForageStore } from "./forage/store";
import { getHouseStore, houseIdFor } from "./housing/service";
import { lookScore } from "./lookScore";
import { MAX_LEVEL } from "./rpg/formulas";
import { getRpgStore } from "./rpg/store";
import { isSuperHunter } from "./rpg/superHunter";
import { isStaff } from "./staff";
import { getAccounts } from "./store";
import { kstDay } from "./store/accounts";
import { champBitsFor, getChamp } from "./store/champ";
import { getStyleStore } from "./store/style";
import { getTitleMarks } from "./store/titleMarks";
import { getTitleStats } from "./store/titleStats";
import { earnedTitleIds, titlePerk, type TitleFacts, type TitleMetric } from "./titles";
import { titleOfLook } from "@tomb/protocol";
import { lookOf } from "./store/accounts";

// 칭호를 얻었는지 서버에서 확인 (가방 [칭호] 칸 목록·진행도·착용 검증·새 칭호 알림). 읽기에 실패한 갈래는 "아직 없음"으로 본다
// (그 갈래 칭호를 잠깐 못 낄 뿐, 이미 낀 칭호는 그대로). 한 번 알린 칭호는 기록이 내려가도 얻은 것으로 남는다.
// 운영자 계정은 모든 칭호를 얻은 것으로 보고, 새 칭호 알림은 띄우지 않는다.

/** 명예의 전당에서 훑는 주 수 (10년) */
const HALL_WEEKS = 520;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export async function titleFacts(accountId: string, now = Date.now()): Promise<TitleFacts> {
  const accounts = getAccounts();
  const day = kstDay(now);
  const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
  const [forage, champ, house, rpg, sup, acct, style, kills, hard, hell, stats] = await Promise.all([
    safe(getForageStore().dex(accountId), null),
    safe(
      Promise.all([getChamp().hall(HALL_WEEKS), champBitsFor(accountId, now)]).then(([hall, bits]) => {
        const set = new Set<ChampBoard>(champBoards(bits));
        let n = 0;
        for (const w of hall)
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
    safe(accounts.get(accountId, day, now), null),
    safe(getStyleStore(accounts).get(accountId), null),
    safe(accounts.huntRank("kills", 1, accountId, {}).then((r) => r.mine?.points ?? 0), 0),
    safe(accounts.huntRank("best", 1, accountId, { zone: "hard" }).then((r) => (r.mine ? 1 : 0)), 0),
    safe(accounts.huntRank("best", 1, accountId, { zone: "hell" }).then((r) => (r.mine ? 1 : 0)), 0),
    safe(getTitleStats().get(accountId), { stay: 0 }),
  ]);
  const dex = forage?.dex ?? {};
  const has = (id: string) => (dex[id]?.n ?? 0) > 0;
  const metrics: Partial<Record<TitleMetric, number>> = {
    lv: sup ? MAX_LEVEL : (rpg?.level ?? 1),
    kills,
    hard,
    hell,
    fishn: sum(speciesOf("fish").filter((s) => !s.junk).map((s) => dex[s.id]?.n ?? 0)),
    big: Math.max(0, ...speciesOf("fish").filter((s) => !s.junk).map((s) => dex[s.id]?.max ?? 0)),
    gath: sum((["bug", "herb", "ore", "dig"] as const).flatMap((c) => speciesOf(c).map((s) => dex[s.id]?.n ?? 0))),
    streak: acct?.streak ?? 0,
    stay: stats.stay,
    look: acct ? lookScore({ equipped: acct.equipped, body: acct.body, dye: style?.dye ?? null }, now) : 0,
    champ: champ.count,
    house: house ? house.score : 0,
  };
  for (const cat of DEX_CATS) metrics[`dex_${cat}`] = dexIdsOf(cat).filter(has).length;
  return {
    dexTitleNames: forage ? titlesOf(forage.dex, forage.claims, forage.pay.marks) : [],
    champBoards: champ.boards,
    metrics,
  };
}

export type TitleStatus = {
  earned: string[];
  fresh: string[];
  unseen: string[];
  first: boolean;
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
  if (await isStaff(accountId).catch(() => false)) return { earned: [...TITLE_IDS], fresh: [], unseen: [], first: false, progress: {}, staff: true };
  const [facts, marks] = await Promise.all([titleFacts(accountId, now), getTitleMarks().get(accountId)]);
  const ids = new Set<string>(TITLE_IDS);
  const reached = new Set<string>(earnedTitleIds(facts));
  // 한 번 알린 칭호는 기록이 내려가도 남는다 (연속 출석이 끊기거나 집·꾸미기 점수가 내려가도)
  const earned = TITLE_IDS.filter((id) => reached.has(id) || (marks.announced.includes(id) && ids.has(id)));
  return {
    earned,
    fresh: earned.filter((id) => !marks.announced.includes(id)),
    unseen: earned.filter((id) => !marks.seen.includes(id)),
    first: !marks.init,
    progress: facts.metrics,
  };
}

/** 얻은 칭호 id (운영자는 전부) */
export async function earnedTitles(accountId: string, now = Date.now()): Promise<string[]> {
  return (await titleStatus(accountId, now)).earned;
}

/** 단 칭호의 상점 할인율 (칭호가 없거나 읽기에 실패하면 0) */
export async function titleDiscount(accountId: string, now = Date.now()): Promise<number> {
  try {
    const a = await getAccounts().get(accountId, kstDay(now), now);
    return titlePerk(titleOfLook(lookOf(a))).discount;
  } catch {
    return 0;
  }
}
