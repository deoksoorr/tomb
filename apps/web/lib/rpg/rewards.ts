import { COSMETIC_DROPS, DIFFS, GEAR, MONSTER_IDS, MONSTERS, timeLimitSec, zoneFor, type Difficulty, type GameKind, type MonsterId } from "./catalog";
import { clamp, levelPenalty, monsterStats, seeded } from "./formulas";
import {
  BUG_SCORE,
  bugsCount,
  bugsPlan,
  comboMult,
  eliteBonusExp,
  huntPlan,
  huntSpawnable,
  huntTotal,
  STAR_SCORE,
  starGroups,
  STARS_PLAN_VER,
  starsCount,
  starsPlan,
  WAVE_MIN_GAP_SEC,
  type StarNote,
  type StarSky,
} from "./plan";
import { constellationById } from "./constellations";
import { starsPlanV1, V1_SIZE } from "./starsPlanV1";
import type { BugsResult, Drop, HuntResult, RunResult, StarsResult } from "./types";

// 판 결과 검증과 보상 계산 (서버 전용으로 쓰지만 순수 함수라 테스트가 쉽다).
// 클라이언트가 보낸 결과는 얼마든지 꾸밀 수 있으므로, 시드로 다시 만든 출현 계획과 서버가 잰 경과 시간으로 상한을 둔다.

/** 처치 몇 마리마다 드롭을 한 번 굴리나 (한 판 최대 HUNT_DROP_ROLLS번). 45번 출몰량에 맞춰 8 → 14 */
export const KILLS_PER_DROP_ROLL = 14;
export const HUNT_DROP_ROLLS = 2;

/** 이보다 짧은 판은 보상이 없다 (시작하자마자 끝내기 반복 방지) */
export const MIN_RUN_MS = 8000;
/** 서버가 잰 시간보다 이만큼 넘게 길다고 하면 거짓으로 본다 (요청 왕복 여유) */
export const CLOCK_SLACK_MS = 3000;
/** 시간 제한이 지나고도 이만큼은 결과를 받는다 (결과 화면·느린 네트워크) */
export const FINISH_GRACE_SEC = 120;

/**
 * 레벨 대비 초당 처치 상한 (사냥터). 광역기·여러 마리 동시 타격(42번)으로 몰아 잡는 경우까지 넉넉히.
 * 45번에서 출몰량이 약 1.75배가 되면서 올렸다 (예전 0.9/0.75/0.6/0.5는 어려움·지옥을 시간 절반에 깨면 정직한 판도 거절했다).
 */
export function killRateCeiling(d: Difficulty, level: number): number {
  // 40번: 졸개(우두머리가 화날 때)·갈라지는 몬스터가 많은 사냥터도 시간 절반 클리어에 20% 넘게 여유가 있게 (lib/rpg/zones.test.ts)
  const base = { easy: 2, normal: 1.8, hard: 1.8, hell: 1.9 }[d];
  return base * (1 + Math.max(0, level - DIFFS[d].recLevel) / 10);
}

export type TicketInfo = {
  game: GameKind;
  difficulty: Difficulty;
  seed: number;
  level: number;
  st: { agi: number; dex: number; luk: number };
  /** 사냥터 id (40번). 없으면 그 난이도의 기본 사냥터 */
  zone?: string;
  /** 별자리 잇기: 판 시작 시각의 하늘 (맑은 밤·계절·새벽 — 그때만 나오는 별자리가 계획에 들어간다) */
  sky?: StarSky;
  /** 별자리 잇기: 판을 시작할 때의 계획 판 번호 (티켓의 sv). 없으면 판 번호가 생기기 전 티켓 */
  planVer?: number;
};

/** 별자리 잇기에서 검증을 통과한 완성 별자리 (무리 번호·별자리 id·완벽으로만 이었는지) */
export type StarsDone = { group: number; id: string; perfect: boolean };

export type Verdict =
  /** hunt = 사냥터 랭킹 기록 (검증을 통과한 처치 수, 쓰러지지 않고 모든 웨이브를 깼으면 걸린 시간 ms) */
  | { ok: true; score: number; exp: number; points: number; drops: Drop[]; hunt?: { kills: number; clearMs: number | null }; stars?: StarsDone[] }
  | { ok: false; code: string; message: string };

const reject = (code: string, message: string): Verdict => ({ ok: false, code, message });
const tooHigh = (what: string) => reject("RESULT_REJECTED", `${what} 기록이 이 시간 안에 낼 수 있는 값을 넘었어요. 이번 판은 보상 없이 끝나요.`);

/**
 * serverElapsedMs: 서버가 잰 시작~지금. 결과의 durationMs가 이보다 길면 거짓,
 * 실제 판정에는 둘 중 짧은 쪽(eff)을 쓴다 → 시계를 조작해도 이득이 없다.
 */
export function evaluate(t: TicketInfo, result: RunResult, serverElapsedMs: number): Verdict {
  if (result.game !== t.game) return reject("INVALID_RESULT", "결과가 시작한 게임과 달라요.");
  if (result.durationMs > serverElapsedMs + CLOCK_SLACK_MS) return reject("TOO_FAST", "기록된 시간이 실제로 흐른 시간보다 길어요.");
  const limitMs = timeLimitSec(t.game, t.difficulty, t.zone) * 1000;
  const eff = Math.min(result.durationMs, serverElapsedMs, limitMs + CLOCK_SLACK_MS);
  if (eff < MIN_RUN_MS) return { ok: true, score: 0, exp: 0, points: 0, drops: [] };
  switch (result.game) {
    case "hunt":
      return evalHunt(t, result, eff);
    case "bugs":
      return evalBugs(t, result, eff);
    case "stars":
      return evalStars(t, result, eff);
  }
}

function evalHunt(t: TicketInfo, r: HuntResult, eff: number): Verdict {
  const zone = zoneFor(t.difficulty, t.zone);
  const plan = huntPlan(t.seed, t.difficulty, zone.id);
  const effSec = eff / 1000;
  const can = huntSpawnable(plan, effSec);
  let total = 0;
  let exp = 0;
  for (const [id, n] of Object.entries(r.kills) as [MonsterId, number][]) {
    if (!MONSTER_IDS.includes(id) || !Number.isInteger(n) || n < 0) return reject("INVALID_RESULT", "처치 기록 형식이 맞지 않아요.");
    if (n > (can[id] ?? 0)) return tooHigh(MONSTERS[id].name);
    total += n;
    exp += n * monsterStats(id, t.difficulty, zone.power).exp;
  }
  if (total > 3 + effSec * killRateCeiling(t.difficulty, t.level)) return tooHigh("처치 수");
  // 웨이브를 k개 깼다면 그 웨이브들의 몬스터를 모두 잡았어야 하고, 마지막으로 깬 웨이브가 나올 시간이 지났어야 한다
  const k = r.wavesCleared;
  if (!Number.isInteger(k) || k < 0 || k > plan.length) return reject("INVALID_RESULT", "웨이브 기록 형식이 맞지 않아요.");
  if (k > 0 && plan[k - 1].earliestSec > effSec) return tooHigh("웨이브");
  const need: Partial<Record<MonsterId, number>> = {};
  for (const w of plan.slice(0, k)) for (const m of w.monsters) need[m] = (need[m] ?? 0) + 1;
  for (const [id, n] of Object.entries(need) as [MonsterId, number][]) if ((r.kills[id] ?? 0) < n) return tooHigh("웨이브");

  // 11/12 정예: 깬 웨이브의 정예만 (다 잡았다는 게 검증된 몫)
  exp += eliteBonusExp(plan, k, t.difficulty, zone.power);
  const D = DIFFS[t.difficulty];
  const cleared = k === plan.length;
  const progress = clamp((k + (total / Math.max(1, huntTotal(plan))) * 0.999) / (plan.length + 1), 0, 1);
  // 같은 난이도에서 뒤에 열리는 사냥터는 포인트도 조금 더 (power 1.3 → ×1.15)
  let points = total > 0 ? D.huntPoints * (1 + (zone.power - 1) / 2) * (0.15 + 0.85 * (cleared ? 1 : progress)) : 0;
  // 11/15: EXP 감소 기준은 그 사냥터가 열리는 레벨
  let xp = exp * levelPenalty(t.level, t.difficulty, zone);
  if (r.died) {
    points *= 0.5;
    xp *= 0.7;
  }
  // 11/14: 우두머리 드롭은 우두머리를 잡는 순간 정해진다 (뒤에 쓰러지거나 남은 몬스터를 못 잡아도 유지 — 확률은 그대로).
  // 우두머리는 마지막 웨이브에 한 번만 나오고 졸개·분열로는 나오지 않는다 → 처치 기록에 있으면 잡은 것 (위에서 출현 수로 검증됨)
  const bossKilled = (r.kills[zone.boss] ?? 0) > 0;
  const drops = huntDrops(t, total, bossKilled, cleared && !r.died);
  return {
    ok: true,
    score: Math.round(exp),
    exp: Math.round(xp),
    points: Math.round(points),
    drops,
    hunt: { kills: total, clearMs: cleared && !r.died ? Math.round(eff) : null },
  };
}

function evalBugs(t: TicketInfo, r: BugsResult, eff: number): Verdict {
  const limit = timeLimitSec("bugs", t.difficulty);
  const plan = bugsPlan(t.seed, t.difficulty, limit, t.st);
  const c = bugsCount(plan, eff);
  if (r.caught > c.bug) return tooHigh("잡은 벌레");
  if (r.golden > c.golden) return tooHigh("황금 벌레");
  if (r.wrong > c.feature) return tooHigh("체크 누르기");
  if (r.decoy > c.decoy) return tooHigh("이미 잡은 벌레 누르기");
  if (r.maxCombo > r.caught + r.golden) return tooHigh("콤보");
  // 콤보 배수 점수는 서버가 순서를 모르므로 "최대 콤보 배수를 모든 타격에 줬을 때"로 상한을 둔다
  const hits = r.caught * BUG_SCORE.bug + r.golden * BUG_SCORE.golden;
  const penalty = r.wrong * BUG_SCORE.feature + r.decoy * BUG_SCORE.decoy;
  const upper = Math.round(hits * comboMult(r.maxCombo)) + penalty;
  const score = Math.max(0, Math.min(r.score, upper));
  const all = bugsCount(plan, Infinity);
  const target = Math.max(1, all.bug * BUG_SCORE.bug + all.golden * BUG_SCORE.golden);
  return miniReward(t, score, clamp(score / target, 0, 1));
}

/** 그 판 번호의 계획과 별자리 별 수 (1판은 얼려 둔 lib/rpg/starsPlanV1) */
function starsPlanOf(t: TicketInfo, ver: number): { plan: StarNote[]; sizeOf: (id: string) => number | undefined } {
  const limit = timeLimitSec("stars", t.difficulty);
  if (ver === 1) return { plan: starsPlanV1(t.seed, t.difficulty, limit, !!t.sky?.starry), sizeOf: (id) => V1_SIZE.get(id) };
  return { plan: starsPlan(t.seed, t.difficulty, limit, t.sky ?? {}), sizeOf: (id) => constellationById(id)?.stars.length };
}

/**
 * 판 번호가 있으면 그 판의 계획으로 검사한다 (가짜 완성 목록은 판 전체 거절).
 * 판 번호가 없는 티켓(2판 배포 전에 시작한 판): 1판 계획으로 검사하고, 안 맞으면 2판으로 한 번 더 —
 * 이때는 완성 목록이 어느 계획과도 안 맞아도 목록만 버리고 보상은 그대로 (배포가 판 중간에 겹친 정상 판이 거절되지 않게)
 */
function evalStars(t: TicketInfo, r: StarsResult, eff: number): Verdict {
  if (t.planVer === 1 || t.planVer === STARS_PLAN_VER) return evalStarsAt(t, r, eff, t.planVer, false);
  const v1 = evalStarsAt(t, r, eff, 1, true);
  return v1.ok ? v1 : evalStarsAt(t, r, eff, STARS_PLAN_VER, true);
}

function evalStarsAt(t: TicketInfo, r: StarsResult, eff: number, ver: number, lenient: boolean): Verdict {
  const { plan, sizeOf } = starsPlanOf(t, ver);
  // 마지막 별은 판정 범위만큼 늦게 눌릴 수 있다
  if (r.perfect + r.good + r.miss > starsCount(plan, eff + 300)) return tooHigh("별");
  if (r.maxCombo > r.perfect + r.good) return tooHigh("콤보");
  let done = checkStarGroups(plan, r, eff, sizeOf);
  if (done === null) {
    if (!lenient) return tooHigh("별자리");
    done = [];
  }
  const upper = Math.round((r.perfect * STAR_SCORE.perfect + r.good * STAR_SCORE.good) * comboMult(r.maxCombo));
  const score = Math.max(0, Math.min(r.score, upper));
  const target = Math.max(1, plan.length * STAR_SCORE.perfect);
  const v = miniReward(t, score, clamp(score / target, 0, 1));
  return v.ok && done.length ? { ...v, stars: done } : v;
}

/**
 * 완성했다는 별자리 목록 검사 (결과 상한 방식): 계획에 있는 온전한 무리이고, 마지막 별이 그 시간 안에 나왔고,
 * 완성 무리 별 수의 합 ≤ 이은 별(완벽+좋아), 완벽으로만 이은 무리의 합 ≤ 완벽. 하나라도 어긋나면 null (판 전체 거절).
 * 목록이 없으면(옛 화면이 보낸 결과) 빈 목록 — 도감 등록 없이 예전처럼 끝난다
 */
export function checkStarGroups(plan: StarNote[], r: StarsResult, eff: number, sizeOf?: (id: string) => number | undefined): StarsDone[] | null {
  const groups = r.groups ?? [];
  const perfect = r.perfectGroups ?? [];
  if (!groups.length && !perfect.length) return [];
  const all = starGroups(plan, sizeOf);
  const seen = new Set<number>();
  let linked = 0;
  for (const g of groups) {
    const info = all[g];
    if (!Number.isInteger(g) || !info || seen.has(g) || !info.full || info.lastT > eff + 300) return null;
    seen.add(g);
    linked += info.size;
  }
  if (linked > r.perfect + r.good) return null;
  const pset = new Set<number>();
  let flawless = 0;
  for (const g of perfect) {
    if (!seen.has(g) || pset.has(g)) return null;
    pset.add(g);
    flawless += all[g].size;
  }
  if (flawless > r.perfect) return null;
  return groups.map((g) => ({ group: g, id: all[g].con, perfect: pset.has(g) }));
}

function miniReward(t: TicketInfo, score: number, perf: number): Verdict {
  const D = DIFFS[t.difficulty];
  const points = score > 0 ? Math.round(D.miniPoints * perf) : 0;
  // 미니게임은 사냥터가 없으니 난이도 권장 레벨 기준
  const exp = Math.round(D.miniExp * perf * levelPenalty(t.level, t.difficulty, null));
  // 미니게임은 잘하면 포션 하나를 굴린다
  const drops = perf >= 0.5 ? rollDrops(t, 1, false, true) : [];
  return { ok: true, score, exp, points, drops };
}

/** 드롭 굴림에 쓰는 티켓 값 (화면의 바닥 드롭 연출도 같은 값으로 굴린다) */
export type DropTicket = Pick<TicketInfo, "game" | "difficulty" | "seed" | "zone">;

/**
 * 사냥터 한 판의 드롭: 우두머리 몫(맨 앞) + 처치 수만큼 굴림 + 깔끔한 클리어 코디. 서버 판정(evalHunt)과 화면 연출(huntDropsFor)이 같은 식을 쓴다.
 * 우두머리 몫은 같은 난수 줄의 맨 앞이라 우두머리를 잡는 순간 정해지고(huntBossDrop), 나머지는 판 끝에 정해진다
 */
export function huntDrops(t: DropTicket, total: number, bossKilled: boolean, cleanClear: boolean): Drop[] {
  return rollDrops(t, Math.min(HUNT_DROP_ROLLS, Math.floor(total / KILLS_PER_DROP_ROLL)), bossKilled, false, cleanClear);
}

/**
 * 이 사냥터 결과가 검증을 통과하면 받을 드롭 (화면에서 바닥에 떨굴 것을 미리 안다 — 보상은 언제나 서버가 정한다).
 * evaluate의 드롭과 같은 값인지 테스트로 묶어 둔다 (lib/rpg/huntDrops.test.ts)
 */
export function huntDropsFor(t: DropTicket, r: HuntResult): Drop[] {
  if (r.durationMs < MIN_RUN_MS) return [];
  const zone = zoneFor(t.difficulty, t.zone);
  const waves = huntPlan(t.seed, t.difficulty, zone.id).length;
  const total = Object.values(r.kills).reduce((a, n) => a + (n ?? 0), 0);
  const cleared = r.wavesCleared === waves;
  return huntDrops(t, total, (r.kills[zone.boss] ?? 0) > 0, cleared && !r.died);
}

/**
 * 우두머리 몫: 우두머리를 잡는 순간 화면이 그 자리에 떨군다. 우두머리를 잡은 판의 huntDropsFor 결과 맨 앞과 늘 같다
 * (없으면 null — 그 판은 우두머리 장비가 안 나온 것). 판 끝에는 이 몫을 뺀 나머지만 떨군다
 */
export function huntBossDrop(t: DropTicket): Drop | null {
  return rollDrops(t, 0, true)[0] ?? null;
}

/**
 * 드롭은 시드로 정해진다 (같은 판 결과를 다시 보내 다시 굴릴 수 없다).
 * 11/12: 확률을 다시 절반쯤으로, 우두머리 장비도 확률(bossDropChance), 포션은 1개씩.
 * clearedClean(사냥터를 쓰러지지 않고 다 깼다)이면 기간제 코디를 아주 낮은 확률(cosmeticChance)로 굴린다
 */
export function rollDrops(t: DropTicket, rolls: number, bossKilled: boolean, potionsOnly = false, clearedClean = false): Drop[] {
  const D = DIFFS[t.difficulty];
  const r = seeded(t.seed ^ 0x44524f50);
  const drops: Drop[] = [];
  const pickGear = (): Drop => {
    const pool = GEAR.filter((g) => g.reqLevel <= D.dropMaxLevel && g.reqLevel >= D.dropMaxLevel - 20);
    // 싼 장비가 더 잘 나온다. 사냥터마다 잘 나오는 장비(ZoneDef.favor)는 ×3 (40번)
    const favor = t.game === "hunt" ? zoneFor(t.difficulty, t.zone).favor : [];
    const weights = pool.map((g) => (favor.includes(g.id) ? 3 : 1) / Math.sqrt(g.price));
    let x = r() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) if ((x -= weights[i]) <= 0) return { kind: "gear", id: pool[i].id, qty: 1 };
    return { kind: "gear", id: pool[pool.length - 1].id, qty: 1 };
  };
  const pickPotion = (): Drop => {
    const x = r();
    const id = x < 0.5 ? "p_coffee" : x < 0.85 ? "p_energy" : "p_lunchbox";
    return { kind: "potion", id, qty: 1 };
  };
  if (bossKilled && r() < D.bossDropChance) drops.push(pickGear());
  for (let i = 0; i < rolls; i++) {
    if (r() >= D.dropChance) continue;
    drops.push(potionsOnly || r() < 0.55 ? pickPotion() : pickGear());
  }
  if (clearedClean && COSMETIC_DROPS.length > 0) {
    // 따로 굴린다 (위 굴림 수와 상관없이 같은 시드면 같은 결과)
    const rc = seeded(t.seed ^ 0x434f4459);
    if (rc() < D.cosmeticChance) drops.push({ kind: "cosmetic", id: COSMETIC_DROPS[Math.floor(rc() * COSMETIC_DROPS.length)], qty: 1 });
  }
  return drops;
}

/** 웨이브 사이 최소 간격 (UI 안내용으로 내보낸다) */
export const HUNT_WAVE_MIN_GAP_SEC = WAVE_MIN_GAP_SEC;
