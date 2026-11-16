import { nanoid } from "nanoid";
import { itemById } from "@tomb/protocol";
import { recordEvent } from "../analyticsService";
import { earnPointsOnly, getAccounts, refundPoints, spendPoints } from "../store";
import { kstDay, kstWeek } from "../store/accounts";
import { capsMult } from "../pointEvent";
import { earnBoost } from "../store/pointEvent";
import { forgetTitles, forgetTowerTitles } from "../titlesServer";
import { earnRule } from "../economy";
import { env } from "../env";
import { HttpError } from "../http";
import { recordError } from "../errors";
import { isStaff } from "../staff";
import { COSMETIC_DROPS, gearById, potionById, timeLimitSec, zoneFor, type Difficulty, type GameKind, type ZoneId } from "./catalog";
import {
  ackTreeNotice,
  addDrops,
  addGear,
  addPotions,
  allocStats,
  consumePotions,
  equip,
  fitSkillBudget,
  fitToLevel,
  gainExp,
  gainTranscend,
  learnSkill,
  resetSkills,
  resetStats,
  spentStats,
  statPointsEarned,
  removeForSale,
  removePieceForSale,
  returnUnsold,
  RpgError,
  setHotbar,
} from "./character";
import { isTranscendRun, pioneerEligible, rollDay, RUN_TIERS, runTier, TRANSCEND_EXP_MUL, TRANSCEND_MAX, type RunTier } from "./endgame";
import {
  checkTowerStart,
  endgameView,
  evalTower,
  FIRST_STAR_ID,
  TOWER_FIRSTS,
  TOWER_MAX_RUN_SEC,
  TOWER_TICKET_SEC,
  towerChestDrops,
  towerReach,
  towerScore,
  towerSettle,
  towerZone,
  TOWER_FLOOR_POINTS,
  type TowerSettle,
  type TowerVerdict,
} from "./tower";
import { getTowerStore } from "./towerStore";
import { pushVillageNotice } from "../weeklyChamp";
import { countsForRace, derive, expToNext, MAX_LEVEL } from "./formulas";
import { ALL_SKILLS_POINTS, respecCost, skillPointsEarned, spentPoints } from "./skillRules";
import { isSuperHunter, testServerEnv } from "./superHunter";
import { takeTestDrops } from "./testDrops";
import { evaluate, FINISH_GRACE_SEC, type StarsDone } from "./rewards";
import { CHEST_COSMETICS, cosTierOf, crossesTen, gearPower, nextPity, PROT_PER_WEEK } from "./setGearRoll";
import { grantSgDrops } from "./enhance";
import { payNewDex } from "../forage/dexReward";
import { mobKillItems } from "../forage/mobDex";
import { getForageStore } from "../forage/store";
import type { DexGain } from "../forage/types";
import { STARRY_NIGHT_BONUS, starSkyAt } from "../stargaze";
import { STARS_NEW_PER_RUN, STARS_PLAN_VER } from "./plan";
import type { z } from "zod";
import type { CharacterActionSchema, ShopActionSchema } from "./schemas";
import { getRpgStore, RUNS_PER_HOUR, type RpgStore } from "./store";
import { signTicket, verifyTicket } from "./ticket";
import type { CharacterState, DailyStats, Drop, RpgView, SoldInfo, RunFinishResponse, RunResult, RunReward, RunStartResponse } from "./types";

// 사냥터 서버 로직 (라우트는 세션 확인·입력 검증·레이트리밋만 하고 여기로 넘긴다).
// 포인트는 백엔드 공용 함수(earnPoints/spendPoints)로만 움직인다. 사냥터 자체에는 포인트 장부가 없다.

const HUNT_CAP = earnRule("hunt").dailyMax;
const hourBucket = (now: number) => String(Math.floor(now / 3_600_000));

/** 순수 함수의 RpgError를 라우트 handler가 아는 HttpError로 바꾼다 */
async function http<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof RpgError) throw new HttpError(e.status, e.code, e.message);
    throw e;
  }
}

/** 스킬 포인트 예산: 보통은 레벨로 받은 만큼, 테스트 서버 슈퍼 계정은 모든 스킬 최대치 */
const skillBudget = (level: number, sup: boolean) => (sup ? Math.max(ALL_SKILLS_POINTS, skillPointsEarned(level)) : skillPointsEarned(level));
/** 슈퍼 계정의 능력치 포인트: 최대 레벨까지 받는 포인트 전부 (+ 초월 몫) */
const superStatPoints = (tLevel: number) => statPointsEarned(MAX_LEVEL, tLevel);
/**
 * 레벨을 보는 모든 검사(장비 요구 레벨·사냥터 잠금·판 기록·능력치 계산)에 쓰는 레벨.
 * 테스트 서버 슈퍼 계정은 최대 레벨 취급, 저장된 레벨은 그대로
 */
export const effectiveLevel = (level: number, sup: boolean) => (sup ? MAX_LEVEL : level);

/**
 * 보통 계정이면 실제 레벨 기준으로 맞춘다: 스킬 예산·능력치 포인트를 넘은 배분은 돌려주고, 요구 레벨이 넘는 장착 장비는 뺀다
 * (슈퍼 계정으로 바꾼 상태를 운영자 지정이 풀린 뒤·운영 서버에서 읽을 때). 슈퍼 계정이면 그대로
 */
const fitAll = (s: CharacterState, sup: boolean): CharacterState => (sup ? s : fitToLevel(fitSkillBudget(s, skillPointsEarned(s.level))));

/** 캐릭터 읽기 + 맞추기 (바뀌면 저장한다) */
async function loadChar(acct: string, store: RpgStore, sup: boolean): Promise<CharacterState> {
  const c = await store.get(acct);
  if (fitAll(c, sup) === c) return c;
  return (await http(store.update(acct, (s) => ({ state: fitAll(s, sup), result: null })))).state;
}

/** 11/15 끝판이 이 서버에서 처음 열린 시각 (저장소에 한 번만 적고, 인스턴스 메모리에 기억 — 거의 Redis를 읽지 않는다) */
const eg = globalThis as typeof globalThis & { __tombEndgameLaunch?: number };
export async function endgameLaunch(store: RpgStore = getRpgStore(), now = Date.now()): Promise<number> {
  return (eg.__tombEndgameLaunch ??= await store.endgameLaunch(now));
}
/** 시험용: 기억한 시각을 지운다 */
export const forgetEndgameLaunch = () => void delete eg.__tombEndgameLaunch;

export async function rpgView(acct: string, store: RpgStore = getRpgStore(), now = Date.now(), state?: CharacterState, known?: DailyStats): Promise<RpgView> {
  const day = kstDay(now);
  const sup = await isSuperHunter(acct);
  const [loaded, daily, summary, runs, boost] = await Promise.all([
    state ?? loadChar(acct, store, sup),
    // 판 끝은 방금 더한 오늘 기록(addDaily가 돌려준 값)을 그대로 쓴다 (다시 읽지 않게)
    known ?? store.daily(acct, day),
    // 잔액만 쓴다 → 계정 전체(get = 명령 7개)가 아니라 요약 HMGET 1개
    getAccounts().summaries([acct]),
    store.runsThisHour(acct, hourBucket(now)),
    earnBoost(now),
  ]);
  // 포인트 배수 이벤트로 사냥터를 고른 날은 사냥 한도도 늘어난 값으로 보여 준다 (lib/pointEvent)
  const huntCap = HUNT_CAP * capsMult(boost, "hunt");
  const stored = fitAll(loaded, sup);
  // 슈퍼 계정: 화면에는 최대 레벨·넉넉한 스킬·능력치 포인트로 보인다 (저장값은 그대로)
  const character = sup
    ? {
        ...stored,
        level: effectiveLevel(stored.level, true),
        skillPoints: Math.max(0, skillBudget(stored.level, true) - spentPoints(stored.skills)),
        statPoints: Math.max(0, superStatPoints(stored.tLevel) - spentStats(stored)),
      }
    : stored;
  // 11/15 끝판 (레벨 50): 오늘 초월 판·야근 빌딩·개척자 모집. 끝판이 열린 시각은 레벨 50이 처음 볼 때 적는다
  const endgame = character.level >= MAX_LEVEL ? endgameView(stored, day, kstWeek(now), await endgameLaunch(store, now).catch(() => null), sup) : undefined;
  return {
    character,
    derived: derive(character.level, character.stats, character.equip),
    expToNext: Number.isFinite(expToNext(character.level)) ? expToNext(character.level) : 0,
    points: summary[0]?.points ?? 0,
    today: { huntPoints: Math.min(daily.points, huntCap), cap: huntCap, runs: daily.runs, runsPerHour: RUNS_PER_HOUR - runs, runsHourMax: RUNS_PER_HOUR },
    respecCost: respecCost(stored.level),
    statResetCost: respecCost(stored.level),
    ...(sup ? { superHunter: true } : {}),
    ...(endgame ? { endgame } : {}),
  };
}

// ── 캐릭터 (능력치·스킬·단축키·장착) ──

export async function characterAction(acct: string, a: z.output<typeof CharacterActionSchema>): Promise<RpgView> {
  const store = getRpgStore();
  const sup = await isSuperHunter(acct);
  if (a.type === "respec") return paidReset(acct, "skills", a.cost, sup);
  if (a.type === "resetStats") return paidReset(acct, "stats", a.cost, sup);
  const { state } = await http(
    store.update(acct, (s0) => {
      const s = fitAll(s0, sup);
      switch (a.type) {
        case "alloc":
          return { state: allocStats(s, a.stats, sup ? superStatPoints(s.tLevel) : undefined), result: null };
        case "learn":
          return { state: learnSkill(s, a.skill, skillBudget(s.level, sup)), result: null };
        case "ackTree":
          return { state: ackTreeNotice(s), result: null };
        case "hotbar":
          return { state: setHotbar(s, a.slots, a.auto), result: null };
        case "equip":
          return { state: equip(s, a.slot, a.itemId, effectiveLevel(s.level, sup)), result: null };
      }
    }),
  );
  return rpgView(acct, store, Date.now(), state);
}

/** 초기화 두 가지: 스킬(횟수 respecs)·능력치(횟수 statResets). 비용 공식(skillRules.respecCost)은 같고 횟수만 따로 센다 */
const RESETS = {
  skills: { name: "스킬", count: (s: CharacterState) => s.respecs, apply: (s: CharacterState, sup: boolean) => resetSkills(s, !sup) },
  // 능력치는 직접 올린 기본 능력치만 되돌린다 (장비·레벨·경험치·스킬은 그대로). 레벨에 맞춰 정리한 뒤 되돌린다
  stats: { name: "능력치", count: (s: CharacterState) => s.statResets, apply: (s: CharacterState, sup: boolean) => resetStats(fitAll(s, sup), !sup) },
} as const;

/**
 * 스킬·능력치 초기화: 늘 레벨에 따른 지갑 포인트 (skillRules.respecCost, 슈퍼 계정도 — 슈퍼 계정 지갑은 늘 채워진다). 슈퍼 계정은 횟수만 안 셈.
 * seen: 화면에 보인 비용 — 그 사이 비용이 바뀌었으면(다른 탭에서 먼저 초기화 등) 돈을 받지 않고 다시 보여 준다.
 * 포인트를 먼저 빼고, 저장이 실패하면 돌려준다
 */
async function paidReset(acct: string, kind: keyof typeof RESETS, seen: number, sup: boolean): Promise<RpgView> {
  const r = RESETS[kind];
  const store = getRpgStore();
  const c = await store.get(acct);
  const cost = respecCost(c.level);
  if (cost !== seen) throw new HttpError(409, "COST_CHANGED", `초기화 비용이 ${cost}P로 바뀌었어요. 다시 확인해 주세요.`);
  if (cost > 0) await spendPoints(acct, cost, `사냥 ${r.name} 초기화`);
  try {
    const { state } = await http(
      store.update(acct, (s) => {
        if (r.count(s) !== r.count(c)) throw new RpgError(409, "BUSY", "다른 곳에서 먼저 초기화했어요. 다시 시도해 주세요.");
        return { state: r.apply(s, sup), result: null };
      }),
    );
    return rpgView(acct, store, Date.now(), state);
  } catch (e) {
    if (cost > 0) await refundPoints(acct, cost, `사냥 ${r.name} 초기화 환불`);
    throw e;
  }
}

// ── 상점 (장비·포션 사기, 장비·포션 되팔기 — 여러 개 한 번에) ──

export async function shopAction(acct: string, a: z.input<typeof ShopActionSchema>, ipHash: string): Promise<RpgView & { sold?: SoldInfo }> {
  const store = getRpgStore();
  if (a.type === "buy") {
    const gear = gearById(a.itemId);
    const potion = potionById(a.itemId);
    if (!gear && !potion) throw new HttpError(400, "INVALID_INPUT", "없는 물건이에요.");
    const qty = gear ? 1 : (a.qty ?? 1);
    const add = (s: CharacterState) => (gear ? addGear(s, gear.id, true) : addPotions(s, potion!.id, qty));
    // 가방이 가득 찼는지 먼저 본다 (포인트를 빼고 나서 실패하는 일을 줄인다)
    await http(store.get(acct).then(add));
    const price = (gear?.price ?? potion!.price) * qty;
    await spendPoints(acct, price, `사냥터 상점: ${gear?.name ?? potion!.name}${qty > 1 ? ` ×${qty}` : ""}`);
    try {
      const { state } = await http(store.update(acct, (s) => ({ state: add(s), result: null })));
      return rpgView(acct, store, Date.now(), state);
    } catch (e) {
      // 그 사이 다른 탭에서 가방이 찼다 → 돌려준다
      await refundPoints(acct, price, `사냥터 상점 환불(가방 가득): ${gear?.name ?? potion!.name}`);
      throw e;
    }
  }
  // 1) 가방에서 count개를 한 번에 뺀다 (CAS: 모자라면 하나도 빼지 않는다). count가 없으면 예전처럼 1개
  // 11/15 강화한 장비 한 개(piece = 번호)는 그것만 판다 (강화 값은 쳐 주지 않는다)
  const piece = a.type === "sell" ? a.piece : undefined;
  const count = piece !== undefined ? 1 : (a.count ?? 1);
  const { state: removed, result } = await http(
    store.update(acct, (s) => {
      const r = piece !== undefined ? removePieceForSale(s, piece) : { ...removeForSale(s, a.itemId, count), code: a.itemId };
      return { state: r.state, result: r };
    }),
  );
  const name = gearById(a.itemId)?.name ?? potionById(a.itemId)?.name ?? a.itemId;
  const label = `${name}${count > 1 ? ` ×${count}` : ""}`;
  let state = removed;
  let value = 0;
  let capped = false;
  let unsold = 0;
  // 2) 산 장비 되팔기는 환불이라 하루 적립 한도와 무관하다 (산 값보다 늘 적어서 남는 장사가 없다)
  const refund = result.bought * result.unit;
  if (refund > 0) {
    await refundPoints(acct, refund, `사냥터 되팔기: ${label}`);
    value += refund;
  }
  // 3) 드롭 장비·포션 되팔기는 사냥 수입이다 → 사냥 포인트 하루 한도 안에서만 (원자적으로 한도까지만 적립)
  const want = result.drop * result.unit;
  if (want > 0) {
    // paid = 받은 포인트가 판 값으로 얼마어치인지 (포인트 배수 이벤트면 earned보다 적다, lib/pointEvent)
    const { earned, paid } = await earnPointsOnly(acct, "hunt", want, ipHash);
    capped = paid < want;
    value += earned;
    if (earned > 0) await store.addDaily(acct, kstDay(), { points: earned });
    // 한도에 막혀 값을 한 푼도 못 받은 만큼은 가방에 되돌린다 (일부만 받은 1개는 판 것으로 친다)
    unsold = Math.min(result.drop, Math.floor((want - paid) / result.unit));
    if (unsold > 0) state = (await http(store.update(acct, (s) => ({ state: returnUnsold(s, result.code, unsold), result: null })))).state;
  }
  return { ...(await rpgView(acct, store, Date.now(), state)), sold: { value, capped, count: count - unsold } };
}

// ── 판 시작·끝 ──

function newSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] & 0x7fffffff;
}

/**
 * 40번: 사냥터는 캐릭터 레벨로 차례로 열린다. 로컬 개발 서버(next dev)에서는 검수용으로 모두 열어 둔다
 * (화면은 `localStorage["tomb.rpg.unlockAll"]="1"`일 때만 잠금을 풀어 보여 준다)
 */
export const zoneUnlockBypass = () => process.env.NODE_ENV === "development";

/**
 * planVer: 별자리 잇기 화면이 쓰는 계획 판 번호 (없으면 1판 화면). 서버가 아는 판이면 그대로 티켓(sv)에 실어,
 * 끝낼 때 그 판의 계획으로 검사한다 → 배포가 겹쳐 옛 화면이 새 서버에서 판을 시작해도 화면과 서버의 계획이 같다
 */
export async function startRun(
  acct: string,
  game: GameKind,
  difficulty: Difficulty,
  now = Date.now(),
  zoneId?: ZoneId,
  planVer?: number,
  tower?: number,
): Promise<RunStartResponse> {
  const store = getRpgStore();
  const sup = await isSuperHunter(acct);
  const c = await loadChar(acct, store, sup);
  const lv = effectiveLevel(c.level, sup);
  const d = derive(lv, c.stats, c.equip);
  // 11/15 장비 힘 배율 (세트 장비·강화·옵션): 저장된 장착 칸으로 재서 티켓에 싣는다 → 센 장비로 빨리 잡은 정직한 판이 거절되지 않게
  const gp = game === "hunt" ? gearPower(lv, c.stats, c.equip) : 1;
  const day = kstDay(now);
  // 11/15 야근 빌딩: 지옥 사냥만, 시작 층은 최고 기록으로 연 체크포인트 (층마다 사냥터는 정해져 있다 — 화면이 보낸 사냥터는 보지 않는다)
  if (tower !== undefined) {
    if (game !== "hunt" || difficulty !== "hell") throw new HttpError(400, "INVALID_INPUT", "야근 빌딩은 지옥 사냥에서만 갈 수 있어요.");
    const bad = checkTowerStart({ level: lv, start: tower, best: towerReach(c), sup });
    if (bad) throw new HttpError(bad.code === "INVALID_INPUT" ? 400 : 403, bad.code, bad.message);
  }
  // 11/15 야근 빌딩: 층마다 테마는 판 시드로 정해진다 (시작 층의 테마를 티켓에 싣는다)
  const seed = newSeed();
  const zone = game === "hunt" ? (tower ? towerZone(seed, tower, tower) : zoneFor(difficulty, zoneId)) : null;
  if (zone && zoneId && zone.id !== zoneId && !tower) throw new HttpError(400, "INVALID_INPUT", "그 사냥터는 이 난이도에 없어요.");
  if (zone && !tower && lv < zone.unlockLevel && !zoneUnlockBypass())
    throw new HttpError(403, "ZONE_LOCKED", `${zone.name} 사냥터는 Lv.${zone.unlockLevel}부터 갈 수 있어요.`);
  // 야근 빌딩은 층마다 제한 시간이 따로 있고, 티켓은 긴 등반을 받도록 두 시간
  const limit = tower ? TOWER_MAX_RUN_SEC : timeLimitSec(game, difficulty, zone?.id);
  const nonce = nanoid(16);
  // 11/15 야근 빌딩은 멈춤·카드 고르기·탭 숨김으로 벽시계가 판 시간보다 길어진다 → 진행 중 표시를 티켓 수명(TOWER_TICKET_SEC)만큼
  if (!(await store.startRun(acct, nonce, (tower ? TOWER_TICKET_SEC : limit) + FINISH_GRACE_SEC, hourBucket(now))))
    throw new HttpError(429, "RATE_LIMITED", `한 시간에 ${RUNS_PER_HOUR}판까지 할 수 있어요. 잠시 쉬었다 와요.`);
  // 11/15 초월 판(레벨 50 지옥): 그날 몇 번째 판인지를 서버가 센다 (시작하면 한 판 — 끝내지 않아도).
  // 구간(100%·30%·10%·연습)은 여기서 정해 티켓에 싣는다 → 결과를 낼 때 화면 말을 믿지 않는다.
  // 야근 빌딩은 시작할 때 세지 않는다 — 판 끝에 깬 4층마다 1판 (캐릭터 저장도 판 끝 한 번)
  let tier: RunTier | undefined;
  let started: CharacterState | undefined;
  if (isTranscendRun(lv, game, difficulty) && !tower) {
    const r = await http(
      store.update(acct, (s) => {
        const day0 = rollDay(s, day);
        const next = { ...s, ...day0, tRuns: day0.tRuns + 1 };
        return { state: next, result: runTier(day0.tRuns, day0.tBank) };
      }),
    );
    tier = r.result;
    started = r.state;
  }
  const sv = game === "stars" ? (planVer === STARS_PLAN_VER ? STARS_PLAN_VER : 1) : undefined;
  // 테스트 서버 운영자(슈퍼) 계정의 시험 드롭 예약: 맨 앞 묶음을 꺼내 티켓에 싣는다 (운영 서버·일반 계정은 꺼내지도 않는다)
  const td = game === "hunt" && sup && !tower ? await takeTestDrops(acct, difficulty, zone?.id) : null;
  const ticket = await signTicket(env.sessionSecret(), {
    n: nonce,
    a: acct,
    g: game,
    d: difficulty,
    t: now,
    s: seed,
    lv,
    st: { agi: d.stats.agi, dex: d.stats.dex, luk: d.stats.luk },
    ...(zone ? { z: zone.id } : {}),
    ...(sv ? { sv } : {}),
    ...(td ? { td } : {}),
    ...(tower ? { tw: tower } : {}),
    ...(tier ? { tt: tier } : {}),
    ...(gp > 1 ? { gp } : {}),
  });
  // 별자리 잇기: 판 시작 시각의 하늘(맑은 밤 = 전설, 계절, 새벽)에 따라 계획에 들어가는 별자리가 달라진다 (끝낼 때 티켓 시각으로 다시 계산)
  const sky = starSkyAt(now);
  const stars = game === "stars" ? { starry: sky.starry, sky, planVer: sv } : {};
  return {
    ticket,
    game,
    difficulty,
    ...(zone ? { zone: zone.id } : {}),
    seed,
    timeLimitSec: limit,
    ...(tower ? { tower } : {}),
    ...(tier ? { tier } : {}),
    ...stars,
    ...(td ? { testDrops: td } : {}),
    // 11/15 테스트 서버 슈퍼 계정 시험 드롭 (운영 서버에서는 isSuperHunter가 늘 false)
    ...(sup && game === "hunt" ? { superDrops: true } : {}),
    // 보통 판은 위에서 읽은 캐릭터를 그대로 (시작은 캐릭터를 바꾸지 않는다 — 다시 읽지 않게)
    view: await rpgView(acct, store, now, started ?? c),
  };
}

/** 코디 드롭 하나에 시도해 볼 후보 수 (이미 가진 것이면 다음 것) */
const COSMETIC_TRIES = 8;

/**
 * 11/12 기간제 코디 드롭 → 계정 가방. 상점 구매와 같은 원자적 확인을 0P로 한다 (unique: 가방·착용 중·벗어 둔 꾸미기에 이미 있으면
 * "owned" → 목록의 다음 후보). 후보를 다 가졌으면 그 드롭은 없던 것으로 한다. 판 기록은 이미 claim했으므로 두 번 받을 수 없다
 */
export async function grantCosmetics(acct: string, drops: Drop[], now: number): Promise<Drop[]> {
  if (!drops.some((d) => d.kind === "cosmetic")) return drops;
  const accounts = getAccounts();
  const out: Drop[] = [];
  for (const d of drops) {
    if (d.kind !== "cosmetic") {
      out.push(d);
      continue;
    }
    // 11/15 야근 빌딩 상자 꾸미기 (n일 이용권): 갖고 있으면 기간이 늘어난다. 이미 영구로 가진 것이면 같은 등급의 다음 후보, 다 영구면 없던 것으로
    if (d.days) {
      const pool = CHEST_COSMETICS.filter((i) => cosTierOf(i.price) === cosTierOf(itemById(d.id)?.price ?? 0));
      const start = Math.max(0, pool.findIndex((i) => i.id === d.id));
      for (let i = 0; i < Math.min(COSMETIC_TRIES, pool.length); i++) {
        const id = pool[(start + i) % pool.length].id;
        if ((await accounts.grantTerm(acct, id, d.days * 86_400_000, now)) === "ok") {
          out.push({ kind: "cosmetic", id, qty: 1, days: d.days });
          break;
        }
      }
      continue;
    }
    const start = Math.max(0, COSMETIC_DROPS.indexOf(d.id));
    for (let i = 0; i < Math.min(COSMETIC_TRIES, COSMETIC_DROPS.length); i++) {
      const id = COSMETIC_DROPS[(start + i) % COSMETIC_DROPS.length];
      if ((await accounts.buy(acct, id, 0, { unique: true, now })) === "ok") {
        out.push({ kind: "cosmetic", id, qty: 1 });
        break;
      }
    }
  }
  return out;
}

/**
 * 별자리 잇기에서 검증을 통과한 완성 별자리를 도감(낚시·채집 도감 저장소의 별자리 칸)에 등록한다.
 * 한 판에 새로 등록하는 별자리는 STARS_NEW_PER_RUN개까지 — 넘친 처음 별자리는 등록하지 않고 later로 알린다 (다음 판에).
 * 이미 있는 별자리는 몇 번이든 완성 횟수가 오른다. 판 기록은 이미 claim했고 계정당 진행 중인 판은 하나라 같은 판으로 두 번 등록할 수 없다.
 * 저장이 실패해도 판 보상은 그대로 (도감만 빠진다). 처음 등록한 별자리는 도감 보상(lib/forage/dexReward)을 그 자리에서 받는다
 */
async function registerStars(
  acct: string,
  done: StarsDone[],
  now: number,
  ip: string,
): Promise<{ list: NonNullable<RunReward["constellations"]>; dex?: DexGain }> {
  try {
    const store = getForageStore();
    const have = (await store.dex(acct)).dex;
    const fresh = new Set<string>();
    const keep = done.filter((d) => {
      if ((have[d.id]?.n ?? 0) > 0 || fresh.has(d.id)) return true;
      if (fresh.size >= STARS_NEW_PER_RUN) return false;
      fresh.add(d.id);
      return true;
    });
    const isNew = await store.addStars(
      acct,
      kstDay(now),
      keep.map((d) => ({ id: d.id, perfect: d.perfect })),
    );
    // 한 판에 같은 별자리가 두 번 나오면 둘째부터는 처음이 아니다 (저장소가 차례로 센다)
    let k = 0;
    const list = done.map((d) => (keep.includes(d) ? { id: d.id, isNew: isNew[k++] ?? false, perfect: d.perfect } : { id: d.id, isNew: false, perfect: d.perfect, later: true }));
    let dex: DexGain | undefined;
    try {
      dex = await payNewDex(store, acct, list, ip, now);
    } catch (e) {
      // 못 준 보상은 받을 도감 보상에 남아 도감 창에서 받는다
      console.error("[rpg] 별자리 도감 보상 지급 실패", e);
    }
    return { list, ...(dex ? { dex } : {}) };
  } catch (e) {
    console.error("[rpg] 별자리 도감 등록 실패", e);
    return { list: [] };
  }
}

/**
 * 11/16 몬스터 도감: 서버가 받아들인 판(사냥·야근 빌딩 — 거절·의심 판은 부르지 않는다)의 검증된 처치 수를 계정 도감에 더한다 (저장 한 번, 원자적).
 * 처음 쓰러뜨린 몬스터는 등록되고 도감 보상(lib/forage/dexReward)을 그 자리에서 받는다. 운영자도 기록한다 (도감 랭킹은 없다).
 * 저장·지급이 실패해도 판 보상은 그대로 (도감만 빠진다)
 */
export async function recordMobKills(
  acct: string,
  kills: Partial<Record<string, number>>,
  now: number,
  ip: string,
): Promise<{ fresh: string[]; dex?: DexGain }> {
  const items = mobKillItems(kills);
  if (!items.length) return { fresh: [] };
  try {
    const store = getForageStore();
    const isNew = await store.addKills(acct, kstDay(now), items);
    const granted = items.map((it, i) => ({ id: it.id, isNew: isNew[i] ?? false }));
    const fresh = granted.filter((g) => g.isNew).map((g) => g.id);
    let dex: DexGain | undefined;
    try {
      dex = await payNewDex(store, acct, granted, ip, now);
    } catch (e) {
      // 못 준 보상은 받을 도감 보상에 남아 도감 창에서 받는다
      console.error("[rpg] 몬스터 도감 보상 지급 실패", e);
    }
    return { fresh, ...(dex ? { dex } : {}) };
  } catch (e) {
    console.error("[rpg] 몬스터 도감 기록 실패", e);
    return { fresh: [] };
  }
}

export async function finishRun(acct: string, token: string, result: RunResult, ipHash: string, now = Date.now()): Promise<RunFinishResponse> {
  const store = getRpgStore();
  const t = await verifyTicket(env.sessionSecret(), token);
  if (!t) throw new HttpError(400, "BAD_TICKET", "판 기록이 올바르지 않아요. 다시 시작해 주세요.");
  if (t.a !== acct) throw new HttpError(403, "BAD_TICKET", "다른 계정으로 시작한 판이에요.");
  const elapsed = now - t.t;
  const expired = elapsed > ((t.tw ? TOWER_TICKET_SEC : timeLimitSec(t.g, t.d, t.z)) + FINISH_GRACE_SEC) * 1000 || elapsed < 0;
  const claim = await store.claimRun(acct, t.n);
  if (claim === "reused") throw new HttpError(409, "TICKET_USED", "이미 결과를 받은 판이에요.");
  if (expired) throw new HttpError(410, "TICKET_EXPIRED", "너무 오래된 판이라 결과를 받을 수 없어요.");
  if (claim === "stale") throw new HttpError(409, "TICKET_STALE", "그 뒤에 새 판을 시작해서 이 판은 끝났어요.");
  if (t.tw) return finishTower(acct, t.tw, t.s, t.lv, result, elapsed, ipHash, now, t.gp);

  // 22번: 별자리 잇기를 진짜 맑은 밤(판 시작 시각, KST)에 했으면 포인트 보너스 + 전설 별자리. 계절·새벽 별자리도 판 시작 시각으로
  const sky = t.g === "stars" ? starSkyAt(t.t) : null;
  const nightBonus = !!sky?.starry;
  const v = evaluate(
    {
      game: t.g,
      difficulty: t.d,
      seed: t.s,
      level: t.lv,
      st: t.st,
      ...(t.z ? { zone: t.z } : {}),
      ...(sky ? { sky } : {}),
      ...(t.sv !== undefined ? { planVer: t.sv } : {}),
      ...(t.gp ? { gp: t.gp } : {}),
      // 11/15 테스트 서버 슈퍼 계정 시험 드롭: 서버가 계정으로 다시 정한다 (화면 말은 안 믿는다)
      ...(t.g === "hunt" && (await isSuperHunter(acct)) ? { sup: true } : {}),
    },
    result,
    elapsed,
  );
  if (!v.ok) throw new HttpError(422, v.code, v.message);
  // 시험 드롭이 실린 판(테스트 서버 운영자): 굴림 대신 예약 드롭을 준다 (운영 서버에서는 실려 있어도 무시).
  // 11/15 연습 판(그날 초월 구간을 다 쓴 판)은 드롭이 없다
  const vDrops = t.td && testServerEnv() ? t.td : t.tt === "practice" ? [] : v.drops;
  // 11/15 초월 판: 판 EXP × 배율 × 그날 구간 비율 → 초월 EXP (일반 EXP는 레벨 50이라 어차피 버려진다)
  const tGain = t.tt ? Math.round(v.exp * TRANSCEND_EXP_MUL * RUN_TIERS[t.tt].rate) : 0;

  const done = await http(
    store.update(acct, (s) => {
      let cur = s;
      if (result.game === "hunt") cur = consumePotions(cur, result.potionsUsed).state;
      const g = t.tt ? gainTranscend(cur, tGain) : gainExp(cur, v.exp);
      const dr = addDrops(g.state, vDrops);
      return {
        state: { ...dr.state, runs: dr.state.runs + 1 },
        result: { levelsGained: t.tt ? 0 : g.levelsGained, tLevels: t.tt ? g.levelsGained : 0, lost: dr.lost, star100: cur.tLevel < TRANSCEND_MAX && g.state.tLevel >= TRANSCEND_MAX },
      };
    }),
  );
  const applied = done.result;
  let state = done.state;
  // 11/15 개척자: 끝판이 열린 뒤 14일 안에 ★51 또는 야근 빌딩 5층을 처음 넘은 사람 (운영자 제외) — 번호는 저장소가 차례로 붙인다 (계정마다 한 번)
  const staff = await isStaff(acct);
  let pioneer: number | undefined;
  if (t.tt && !staff) {
    const p = await claimPioneerIf(acct, state, store, now);
    if (p) [state, pioneer] = p;
  }
  // ★100 서버 최초 (신화 「첫 번째 상무」)
  if (applied.star100 && !staff) await claimFirstTitles(acct, [FIRST_STAR_ID], now, () => `서버 최초로 ★100에 올랐어요!`);
  const drops = await grantCosmetics(acct, vDrops, now);
  const stars = v.stars ? await registerStars(acct, v.stars, now, ipHash) : undefined;
  const constellations = stars?.list;
  // 11/16 몬스터 도감 (사냥 판만 mobs가 있다)
  const mobs = v.mobs ? await recordMobKills(acct, v.mobs, now, ipHash) : undefined;
  const dexReward = stars?.dex ?? mobs?.dex;
  const pointsRaw = nightBonus ? Math.round(v.points * STARRY_NIGHT_BONUS) : v.points;
  // 사냥은 사냥 한도, 곤충·별자리는 미니게임 한도 (사냥 화면의 오늘 사냥 포인트(daily.points)에는 사냥 몫만)
  const earned = pointsRaw > 0 ? (await earnPointsOnly(acct, t.g, pointsRaw, ipHash)).earned : 0;
  const daily = await store.addDaily(acct, kstDay(now), { points: t.g === "hunt" ? earned : 0, runs: 1, exp: v.exp });
  if (t.g === "hunt") await recordEvent("hunt", now); // 47번 방문 분석: 사냥 판 수
  // 49번 랭킹: 사냥터별 최단 클리어·처치 수 (난이도 = 사냥터). 운영자 계정은 순위에 남기지 않는다.
  // 11/15: 자기 레벨이 그 사냥터가 열리는 레벨(티켓의 사냥터 t.z)보다 10 넘게 높으면 랭킹에 아예 넣지 않는다 —
  // 주간 레이스뿐 아니라 전체 처치 수·최단 기록도 (사용자 요청 "다 적정 레벨만 세게"). 지나간 기록은 그대로
  if (v.hunt && (v.hunt.kills > 0 || v.hunt.clearMs !== null) && !staff && countsForRace(t.lv, t.d, zoneFor(t.d, t.z)))
    await getAccounts().recordHunt(acct, t.d, v.hunt, kstWeek(now), true);
  return {
    reward: {
      score: v.score,
      exp: v.exp,
      pointsRaw,
      points: earned,
      capped: earned < pointsRaw,
      ...(nightBonus ? { nightBonus: true } : {}),
      ...(constellations?.length ? { constellations } : {}),
      ...(dexReward ? { dexReward } : {}),
      ...(mobs?.fresh.length ? { newMobs: mobs.fresh } : {}),
      drops,
      levelsGained: applied.levelsGained,
      newLevel: state.level,
      lostDrops: applied.lost,
      ...(t.tt ? { transcend: { exp: tGain, tier: t.tt, levelsGained: applied.tLevels, tLevel: state.tLevel } } : {}),
      ...(pioneer ? { pioneer } : {}),
    },
    view: await rpgView(acct, store, now, state, daily),
  };
}

// ── 11/15 야근 빌딩 ──

/** 개척자 번호 받기 (조건·기간이 맞을 때만, 계정마다 한 번). 받았으면 [새 상태, 번호] */
async function claimPioneerIf(acct: string, state: CharacterState, store: RpgStore, now: number): Promise<[CharacterState, number] | null> {
  if (state.pioneer || (state.tLevel < 1 && state.fBest < 5)) return null;
  const launch = await endgameLaunch(store, now);
  if (!pioneerEligible(state, launch, now, false)) return null;
  const p = await store.claimPioneer(acct, now);
  const next = (await http(store.update(acct, (s) => ({ state: { ...s, pioneer: s.pioneer ?? p }, result: null })))).state;
  return [next, p.n];
}

/** 이름 (확성기 알림용 — 칭호를 받는 드문 판에서만 읽는다) */
async function nameOf(acct: string, now: number): Promise<string> {
  return (await getAccounts().get(acct, kstDay(now), now)).name ?? "누군가";
}

/** 서버 최초 칭호 받기 (원자적, 한 사람만). 받은 칭호마다 확성기 알림. 받은 칭호 id */
export async function claimFirstTitles(acct: string, ids: readonly string[], now: number, text: (id: string) => string): Promise<string[]> {
  const got: string[] = [];
  const towers = getTowerStore();
  for (const id of ids) {
    try {
      if (await towers.claimFirst(id, acct, now)) got.push(id);
    } catch (e) {
      console.warn("[tower] 서버 최초 기록 실패", e);
    }
  }
  if (got.length) {
    forgetTitles(acct);
    forgetTowerTitles();
    const name = await nameOf(acct, now).catch(() => "누군가");
    for (const id of got) await pushVillageNotice(`🏆 ${name}님이 ${text(id)}`, now).catch(() => undefined);
  }
  return got;
}

/** 이 인스턴스가 마지막으로 본 꼭대기 층 (이보다 낮은 기록은 Redis에 묻지 않는다) */
const topSeen = globalThis as typeof globalThis & { __tombTowerTop?: number };

/**
 * 판 끝 (야근 빌딩): 층마다 결과 검증 → 캐릭터 저장 한 번(물약·초월 EXP·초월 판 수·상자·최고 기록) → 기록이 오른 사람만 랭킹·서버 최초·꼭대기 층.
 * 운영자(슈퍼) 계정은 랭킹·최초·꼭대기·개척자에서 빠진다
 */
async function finishTower(acct: string, start: number, seed: number, level: number, result: RunResult, elapsed: number, ipHash: string, now: number, gp?: number): Promise<RunFinishResponse> {
  if (result.game !== "hunt") throw new HttpError(422, "INVALID_RESULT", "결과가 시작한 게임과 달라요.");
  // 11/15 테스트 서버 슈퍼 계정만 처치 속도 상한을 빼고 (테스트용 무적·공격력 ×20) — 운영 서버에서는 isSuperHunter가 늘 false
  const sup = await isSuperHunter(acct);
  const v = evalTower({ seed, level, start, ...(gp ? { gp } : {}) }, result, elapsed, { lax: sup });
  // 11/15 거절·의심 판은 운영 로그와 관리자 오류 모음(/admin 오류)에 남긴다 (정직한 판이 걸리면 원인을 바로 찾게 — 계정은 앞 6자리만)
  const info = {
    acct: acct.slice(0, 6),
    start,
    floors: result.floors ?? 0,
    level,
    gp: gp ?? 1,
    elapsed,
    durationMs: result.durationMs,
    floorMs: result.floorMs ?? 0,
    kills: Object.values(result.kills).reduce((a, n) => a + (n ?? 0), 0),
    cards: result.cards?.length ?? 0,
    died: result.died,
    quit: !!result.quit,
  };
  if (!v.ok) {
    console.warn("[tower] 결과 거절", JSON.stringify({ code: v.code, message: v.message, ...(v.why ? { why: v.why } : {}), ...info }));
    await towerOpsLog("[tower] 결과 거절", { code: v.code, why: v.why ?? v.message, ...info, killsBy: result.kills }, now);
    throw new HttpError(422, v.code, v.message);
  }
  if (v.suspect) {
    console.warn("[tower] 의심 판", JSON.stringify({ why: v.suspect, ...info }));
    await towerOpsLog("[tower] 의심 판 (보상 지급·랭킹 제외)", { why: v.suspect.join(" | "), ...info, killsBy: result.kills, picks: result.cards ?? [] }, now);
  }
  return settleTowerRun(acct, start, seed, v, result.potionsUsed, ipHash, now, sup);
}

/** 11/15 야근 빌딩 거절·의심 판 기록 (관리자 오류 모음 — 판마다 따로 묶이게 첫 줄에 계정·시각). 기록 실패는 조용히 */
async function towerOpsLog(title: string, d: Record<string, unknown> & { acct: string; why: string }, now: number): Promise<void> {
  await recordError(
    {
      kind: "tower",
      source: "server",
      message: `${title}: ${d.why}`.slice(0, 500),
      stack: `${d.acct} @${now}\n${JSON.stringify(d)}`.slice(0, 4000),
      url: "/api/rpg/run/finish",
    },
    now,
  ).catch(() => {});
}

/**
 * 11/15 야근 빌딩 판 정산 (검증을 통과한 결과 v로): 캐릭터 저장 한 번(물약·초월 EXP·초월 판 수·상자·최고 기록) → 기록이 오른 사람만 랭킹·서버 최초·꼭대기 층.
 * 판 끝(finishTower)과 관리자 대신 정산(grantTowerRun — 서버가 잘못 거절한 판)이 같은 길을 쓴다
 */
async function settleTowerRun(
  acct: string,
  start: number,
  seed: number,
  v: Extract<TowerVerdict, { ok: true }>,
  potionsUsed: Record<string, number>,
  ipHash: string,
  now: number,
  sup: boolean,
): Promise<RunFinishResponse> {
  const store = getRpgStore();
  const day = kstDay(now);
  const week = kstWeek(now);
  const done = await http(
    store.update(acct, (s) => {
      const cur = consumePotions(s, potionsUsed).state;
      // 11/15 의심 판(부드러운 거절): 층·초월 EXP·상자·포인트는 그대로, 최고·주간 기록은 그대로 두고 체크포인트만 연다 (fSus)
      const st: TowerSettle = towerSettle(cur, { day, week, start, floors: v.floors, floorMs: v.floorMs, suspect: !!v.suspect });
      const settled = { ...cur, ...st.patch };
      const g = gainTranscend(settled, st.tExp);
      // 11/15 상자마다 세트 장비 천장을 이어서 센다 (게임이 판 안에서 같은 순서로 센다) · 슈퍼 계정 시험 드롭(sup)
      let pity = cur.sgPity ?? 0;
      const rolled = st.chests.flatMap((f) => {
        const d = towerChestDrops(seed, f, start, pity, sup);
        pity = nextPity(d, pity);
        return d;
      });
      // 11/15 보호 문서: 이번 주 최고 층이 10층 단위를 새로 넘으면 1장 (한 주 2장까지)
      const prevWk = cur.fWk === week ? cur.fWkBest : 0;
      const protN = cur.protWk === week ? (cur.protN ?? 0) : 0;
      const prot = st.newWeek && crossesTen(prevWk, st.patch.fWkBest) && protN < PROT_PER_WEEK;
      if (prot) rolled.push({ kind: "mat", id: "m_prot", qty: 1 });
      const sgd = grantSgDrops({ ...g.state, sgPity: pity, protWk: week, protN: protN + (prot ? 1 : 0) }, rolled);
      const drops = sgd.drops;
      const dr = addDrops(sgd.state, drops);
      return {
        state: { ...dr.state, runs: dr.state.runs + 1 },
        result: { st, prevBest: cur.fBest, levels: g.levelsGained, lost: dr.lost, drops, star100: cur.tLevel < TRANSCEND_MAX && g.state.tLevel >= TRANSCEND_MAX },
      };
    }),
  );
  let state = done.state;
  const { st, prevBest } = done.result;
  const staff = await isStaff(acct);
  const titles: string[] = [];
  let pioneer: number | undefined;
  // 11/15 의심 판은 랭킹·주간 기록·서버 최초·최고층 기록 보유자·주간 사냥 레이스에서 뺀다 (st.newBest·newWeek도 false)
  const suspect = !!v.suspect;
  if (!staff) {
    // 랭킹: 기록이 오른 판만 (주간·전체 — 파이프라인 한 번)
    if (st.newWeek || st.newBest) {
      const score = towerScore(st.best, v.floorMs);
      await getTowerStore()
        .record(acct, week, st.newWeek ? score : null, st.newBest ? score : null)
        .catch((e) => console.warn("[tower] 랭킹 기록 실패", e));
    }
    const p = await claimPioneerIf(acct, state, store, now);
    if (p) [state, pioneer] = p;
    if (st.newBest && st.best > prevBest) {
      // 서버 최초 (30·50·100층) — 이번에 처음 넘은 층만 묻는다
      const ids = TOWER_FIRSTS.filter((x) => prevBest < x.floor && st.best >= x.floor).map((x) => x.id);
      if (ids.length) titles.push(...(await claimFirstTitles(acct, ids, now, (id) => `서버 최초로 ${TOWER_FIRSTS.find((x) => x.id === id)!.floor}층에 올랐어요!`)));
      // 꼭대기 층 주인: 이 인스턴스가 본 꼭대기보다 높을 때만 Redis에 묻는다
      if (st.best > (topSeen.__tombTowerTop ?? 0)) {
        try {
          const r = await getTowerStore().claimTop(acct, st.best, v.floorMs, now);
          topSeen.__tombTowerTop = Math.max(r.prev?.floor ?? 0, r.took ? st.best : 0);
          if (r.took) {
            forgetTowerTitles();
            if (r.prev?.accountId !== acct) {
              titles.push("t_topFloor");
              forgetTitles(acct);
              if (r.prev) forgetTitles(r.prev.accountId);
              await pushVillageNotice(`🏢 ${await nameOf(acct, now)}님이 야근 빌딩 최고층 기록을 세웠어요 (${st.best}층)`, now).catch(() => undefined);
            }
          }
        } catch (e) {
          console.warn("[tower] 꼭대기 층 기록 실패", e);
        }
      }
    }
    if (done.result.star100 && !suspect) titles.push(...(await claimFirstTitles(acct, [FIRST_STAR_ID], now, () => "서버 최초로 ★100에 올랐어요!")));
  }
  const drops = await grantCosmetics(acct, done.result.drops, now);
  const earned = v.points > 0 ? (await earnPointsOnly(acct, "hunt", v.points, ipHash)).earned : 0;
  // 11/16 몬스터 도감: 의심 판이 아닐 때만 evalTower가 mobs를 싣는다 (관리자 대신 정산 grantTowerRun은 처치 기록이 없다)
  const mobs = v.mobs && !suspect ? await recordMobKills(acct, v.mobs, now, ipHash) : undefined;
  const daily = await store.addDaily(acct, day, { points: earned, runs: 1 });
  await recordEvent("hunt", now);
  // 처치 수는 주간 사냥 레이스에 그대로 (지옥, 레벨 50 콘텐츠라 늘 레이스에 든다)
  if (v.kills > 0 && !staff && !suspect) await getAccounts().recordHunt(acct, "hell", { kills: v.kills, clearMs: null }, week, true);
  const lastTier = st.tiers[st.tiers.length - 1] ?? runTier(rollDay(state, day).tRuns, rollDay(state, day).tBank);
  return {
    reward: {
      score: v.kills,
      exp: 0,
      pointsRaw: v.points,
      points: earned,
      capped: earned < v.points,
      drops,
      levelsGained: 0,
      newLevel: state.level,
      lostDrops: done.result.lost,
      ...(mobs?.dex ? { dexReward: mobs.dex } : {}),
      ...(mobs?.fresh.length ? { newMobs: mobs.fresh } : {}),
      transcend: { exp: st.tExp, tier: lastTier, levelsGained: done.result.levels, tLevel: state.tLevel },
      tower: { start, floors: v.floors, best: st.best, newBest: st.newBest, newWeek: st.newWeek, runs: st.runs, chests: st.chests, emptyChests: st.emptyChests, titles, ...(suspect ? { suspect: true } : {}) },
      ...(pioneer ? { pioneer } : {}),
    },
    view: await rpgView(acct, store, now, state, day === kstDay(now) ? daily : undefined),
  };
}

/**
 * 11/15 관리자: 서버가 잘못 거절한 야근 빌딩 판을 대신 정산한다 (판 끝과 같은 정산 — 우두머리 상자는 새 시드로 다시 굴린다).
 * floors = 깬 층 수 (start층부터), floorMs = 마지막 층을 깬 시각(판 시작부터, 랭킹 동점 순서), kills = 주간 레이스 처치 수(모르면 0)
 */
export async function grantTowerRun(acct: string, o: { start: number; floors: number; floorMs: number; kills?: number }, now = Date.now()): Promise<RunFinishResponse> {
  const v: Extract<TowerVerdict, { ok: true }> = {
    ok: true,
    floors: o.floors,
    best: o.floors > 0 ? o.start + o.floors - 1 : 0,
    floorMs: o.floorMs,
    kills: o.kills ?? 0,
    points: o.floors * TOWER_FLOOR_POINTS,
  };
  const seed = Math.floor(Math.random() * 2 ** 31);
  return settleTowerRun(acct, o.start, seed, v, {}, "admin-grant", now, false);
}
