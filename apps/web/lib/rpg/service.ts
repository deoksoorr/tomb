import { nanoid } from "nanoid";
import { recordEvent } from "../analyticsService";
import { earnPoints, getAccounts, refundPoints, spendPoints } from "../store";
import { kstDay, kstWeek } from "../store/accounts";
import { earnRule } from "../economy";
import { env } from "../env";
import { HttpError } from "../http";
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
  learnSkill,
  resetSkills,
  resetStats,
  spentStats,
  statPointsEarned,
  removeForSale,
  returnUnsold,
  RpgError,
  setHotbar,
} from "./character";
import { countsForRace, derive, expToNext, MAX_LEVEL } from "./formulas";
import { ALL_SKILLS_POINTS, respecCost, skillPointsEarned, spentPoints } from "./skillRules";
import { isSuperHunter, testServerEnv } from "./superHunter";
import { takeTestDrops } from "./testDrops";
import { evaluate, FINISH_GRACE_SEC, type StarsDone } from "./rewards";
import { payNewDex } from "../forage/dexReward";
import { getForageStore } from "../forage/store";
import type { DexGain } from "../forage/types";
import { STARRY_NIGHT_BONUS, starSkyAt } from "../stargaze";
import { STARS_NEW_PER_RUN, STARS_PLAN_VER } from "./plan";
import type { z } from "zod";
import type { CharacterActionSchema, ShopActionSchema } from "./schemas";
import { getRpgStore, RUNS_PER_HOUR, type RpgStore } from "./store";
import { signTicket, verifyTicket } from "./ticket";
import type { CharacterState, Drop, RpgView, SoldInfo, RunFinishResponse, RunResult, RunReward, RunStartResponse } from "./types";

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
/** 슈퍼 계정의 능력치 포인트: 최대 레벨까지 받는 포인트 전부 */
const SUPER_STAT_POINTS = statPointsEarned(MAX_LEVEL);
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

export async function rpgView(acct: string, store: RpgStore = getRpgStore(), now = Date.now(), state?: CharacterState): Promise<RpgView> {
  const day = kstDay(now);
  const sup = await isSuperHunter(acct);
  const [loaded, daily, me, runs] = await Promise.all([
    state ?? loadChar(acct, store, sup),
    store.daily(acct, day),
    getAccounts().get(acct, day, now),
    store.runsThisHour(acct, hourBucket(now)),
  ]);
  const stored = fitAll(loaded, sup);
  // 슈퍼 계정: 화면에는 최대 레벨·넉넉한 스킬·능력치 포인트로 보인다 (저장값은 그대로)
  const character = sup
    ? {
        ...stored,
        level: effectiveLevel(stored.level, true),
        skillPoints: Math.max(0, skillBudget(stored.level, true) - spentPoints(stored.skills)),
        statPoints: Math.max(0, SUPER_STAT_POINTS - spentStats(stored)),
      }
    : stored;
  return {
    character,
    derived: derive(character.level, character.stats, character.equip),
    expToNext: Number.isFinite(expToNext(character.level)) ? expToNext(character.level) : 0,
    points: me.points,
    today: { huntPoints: Math.min(daily.points, HUNT_CAP), cap: HUNT_CAP, runs: daily.runs, runsPerHour: RUNS_PER_HOUR - runs },
    respecCost: respecCost(stored.level),
    statResetCost: respecCost(stored.level),
    ...(sup ? { superHunter: true } : {}),
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
          return { state: allocStats(s, a.stats, sup ? SUPER_STAT_POINTS : undefined), result: null };
        case "learn":
          return { state: learnSkill(s, a.skill, skillBudget(s.level, sup)), result: null };
        case "ackTree":
          return { state: ackTreeNotice(s), result: null };
        case "hotbar":
          return { state: setHotbar(s, a.slots), result: null };
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
  const count = a.count ?? 1;
  const { state: removed, result } = await http(
    store.update(acct, (s) => {
      const r = removeForSale(s, a.itemId, count);
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
    const { earned } = await earnPoints(acct, "hunt", want, ipHash);
    capped = earned < want;
    value += earned;
    if (earned > 0) await store.addDaily(acct, kstDay(), { points: earned });
    // 한도에 막혀 값을 한 푼도 못 받은 만큼은 가방에 되돌린다 (일부만 받은 1개는 판 것으로 친다)
    unsold = Math.min(result.drop, Math.floor((want - earned) / result.unit));
    if (unsold > 0) state = (await http(store.update(acct, (s) => ({ state: returnUnsold(s, a.itemId, unsold), result: null })))).state;
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
): Promise<RunStartResponse> {
  const store = getRpgStore();
  const sup = await isSuperHunter(acct);
  const c = await loadChar(acct, store, sup);
  const lv = effectiveLevel(c.level, sup);
  const d = derive(lv, c.stats, c.equip);
  const zone = game === "hunt" ? zoneFor(difficulty, zoneId) : null;
  if (zone && zoneId && zone.id !== zoneId) throw new HttpError(400, "INVALID_INPUT", "그 사냥터는 이 난이도에 없어요.");
  if (zone && lv < zone.unlockLevel && !zoneUnlockBypass())
    throw new HttpError(403, "ZONE_LOCKED", `${zone.name}은(는) Lv.${zone.unlockLevel}부터 갈 수 있어요.`);
  const limit = timeLimitSec(game, difficulty, zone?.id);
  const nonce = nanoid(16);
  if (!(await store.startRun(acct, nonce, limit + FINISH_GRACE_SEC, hourBucket(now))))
    throw new HttpError(429, "RATE_LIMITED", `한 시간에 ${RUNS_PER_HOUR}판까지 할 수 있어요. 잠시 쉬었다 와요.`);
  const seed = newSeed();
  const sv = game === "stars" ? (planVer === STARS_PLAN_VER ? STARS_PLAN_VER : 1) : undefined;
  // 테스트 서버 운영자(슈퍼) 계정의 시험 드롭 예약: 맨 앞 묶음을 꺼내 티켓에 싣는다 (운영 서버·일반 계정은 꺼내지도 않는다)
  const td = game === "hunt" && sup ? await takeTestDrops(acct, difficulty, zone?.id) : null;
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
  });
  // 별자리 잇기: 판 시작 시각의 하늘(맑은 밤 = 전설, 계절, 새벽)에 따라 계획에 들어가는 별자리가 달라진다 (끝낼 때 티켓 시각으로 다시 계산)
  const sky = starSkyAt(now);
  const stars = game === "stars" ? { starry: sky.starry, sky, planVer: sv } : {};
  return { ticket, game, difficulty, ...(zone ? { zone: zone.id } : {}), seed, timeLimitSec: limit, ...stars, ...(td ? { testDrops: td } : {}), view: await rpgView(acct, store, now) };
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

export async function finishRun(acct: string, token: string, result: RunResult, ipHash: string, now = Date.now()): Promise<RunFinishResponse> {
  const store = getRpgStore();
  const t = await verifyTicket(env.sessionSecret(), token);
  if (!t) throw new HttpError(400, "BAD_TICKET", "판 기록이 올바르지 않아요. 다시 시작해 주세요.");
  if (t.a !== acct) throw new HttpError(403, "BAD_TICKET", "다른 계정으로 시작한 판이에요.");
  const elapsed = now - t.t;
  const expired = elapsed > (timeLimitSec(t.g, t.d, t.z) + FINISH_GRACE_SEC) * 1000 || elapsed < 0;
  const claim = await store.claimRun(acct, t.n);
  if (claim === "reused") throw new HttpError(409, "TICKET_USED", "이미 결과를 받은 판이에요.");
  if (expired) throw new HttpError(410, "TICKET_EXPIRED", "너무 오래된 판이라 결과를 받을 수 없어요.");
  if (claim === "stale") throw new HttpError(409, "TICKET_STALE", "그 뒤에 새 판을 시작해서 이 판은 끝났어요.");

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
    },
    result,
    elapsed,
  );
  if (!v.ok) throw new HttpError(422, v.code, v.message);
  // 시험 드롭이 실린 판(테스트 서버 운영자): 굴림 대신 예약 드롭을 준다 (운영 서버에서는 실려 있어도 무시)
  const vDrops = t.td && testServerEnv() ? t.td : v.drops;

  const { state, result: applied } = await http(
    store.update(acct, (s) => {
      let cur = s;
      if (result.game === "hunt") cur = consumePotions(cur, result.potionsUsed).state;
      const g = gainExp(cur, v.exp);
      const dr = addDrops(g.state, vDrops);
      return { state: { ...dr.state, runs: dr.state.runs + 1 }, result: { levelsGained: g.levelsGained, lost: dr.lost } };
    }),
  );
  const drops = await grantCosmetics(acct, vDrops, now);
  const stars = v.stars ? await registerStars(acct, v.stars, now, ipHash) : undefined;
  const constellations = stars?.list;
  const pointsRaw = nightBonus ? Math.round(v.points * STARRY_NIGHT_BONUS) : v.points;
  // 사냥은 사냥 한도, 곤충·별자리는 미니게임 한도 (사냥 화면의 오늘 사냥 포인트(daily.points)에는 사냥 몫만)
  const earned = pointsRaw > 0 ? (await earnPoints(acct, t.g === "hunt" ? "hunt" : "mini", pointsRaw, ipHash)).earned : 0;
  await store.addDaily(acct, kstDay(now), { points: t.g === "hunt" ? earned : 0, runs: 1, exp: v.exp });
  if (t.g === "hunt") await recordEvent("hunt", now); // 47번 방문 분석: 사냥 판 수
  // 49번 랭킹: 사냥터별 최단 클리어·처치 수 (난이도 = 사냥터). 운영자 계정은 순위에 남기지 않는다.
  // 11/15: 자기 레벨이 그 난이도 추천 레벨보다 10 넘게 높으면 주간 레이스(그 주 처치·최단)에는 넣지 않는다 (지옥은 늘 넣는다) — 전체 기록·칭호는 그대로
  if (v.hunt && (v.hunt.kills > 0 || v.hunt.clearMs !== null) && !(await isStaff(acct)))
    await getAccounts().recordHunt(acct, t.d, v.hunt, kstWeek(now), countsForRace(t.lv, t.d));
  return {
    reward: {
      score: v.score,
      exp: v.exp,
      pointsRaw,
      points: earned,
      capped: earned < pointsRaw,
      ...(nightBonus ? { nightBonus: true } : {}),
      ...(constellations?.length ? { constellations } : {}),
      ...(stars?.dex ? { dexReward: stars.dex } : {}),
      drops,
      levelsGained: applied.levelsGained,
      newLevel: state.level,
      lostDrops: applied.lost,
    },
    view: await rpgView(acct, store, now, state),
  };
}
