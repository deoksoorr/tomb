import { DIFFS, GEAR, MONSTER_IDS, MONSTERS, timeLimitSec, ZONES, type Difficulty, type GameKind, type MonsterId } from "./catalog";
import { clamp, levelPenalty, monsterStats, seeded } from "./formulas";
import {
  BUG_SCORE,
  bugsCount,
  bugsPlan,
  comboMult,
  huntPlan,
  huntSpawnable,
  huntTotal,
  STAR_SCORE,
  starsCount,
  starsPlan,
  WAVE_MIN_GAP_SEC,
} from "./plan";
import type { BugsResult, Drop, HuntResult, RunResult, StarsResult } from "./types";

// 판 결과 검증과 보상 계산 (서버 전용으로 쓰지만 순수 함수라 테스트가 쉽다).
// 클라이언트가 보낸 결과는 얼마든지 꾸밀 수 있으므로, 시드로 다시 만든 출현 계획과 서버가 잰 경과 시간으로 상한을 둔다.

/** 이보다 짧은 판은 보상이 없다 (시작하자마자 끝내기 반복 방지) */
export const MIN_RUN_MS = 8000;
/** 서버가 잰 시간보다 이만큼 넘게 길다고 하면 거짓으로 본다 (요청 왕복 여유) */
export const CLOCK_SLACK_MS = 3000;
/** 시간 제한이 지나고도 이만큼은 결과를 받는다 (결과 화면·느린 네트워크) */
export const FINISH_GRACE_SEC = 120;

/** 레벨 대비 초당 처치 상한 (사냥터). 광역기로 몰아 잡는 경우까지 넉넉히 */
export function killRateCeiling(d: Difficulty, level: number): number {
  const base = { easy: 0.9, normal: 0.75, hard: 0.6, hell: 0.5 }[d];
  return base * (1 + Math.max(0, level - DIFFS[d].recLevel) / 10);
}

export type TicketInfo = {
  game: GameKind;
  difficulty: Difficulty;
  seed: number;
  level: number;
  st: { agi: number; dex: number; luk: number };
};

export type Verdict =
  | { ok: true; score: number; exp: number; points: number; drops: Drop[] }
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
  const limitMs = timeLimitSec(t.game, t.difficulty) * 1000;
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
  const plan = huntPlan(t.seed, t.difficulty);
  const effSec = eff / 1000;
  const can = huntSpawnable(plan, effSec);
  let total = 0;
  let exp = 0;
  for (const [id, n] of Object.entries(r.kills) as [MonsterId, number][]) {
    if (!MONSTER_IDS.includes(id) || !Number.isInteger(n) || n < 0) return reject("INVALID_RESULT", "처치 기록 형식이 맞지 않아요.");
    if (n > (can[id] ?? 0)) return tooHigh(MONSTERS[id].name);
    total += n;
    exp += n * monsterStats(id, t.difficulty).exp;
  }
  if (total > 3 + effSec * killRateCeiling(t.difficulty, t.level)) return tooHigh("처치 수");
  // 웨이브를 k개 깼다면 그 웨이브들의 몬스터를 모두 잡았어야 하고, 마지막으로 깬 웨이브가 나올 시간이 지났어야 한다
  const k = r.wavesCleared;
  if (!Number.isInteger(k) || k < 0 || k > plan.length) return reject("INVALID_RESULT", "웨이브 기록 형식이 맞지 않아요.");
  if (k > 0 && plan[k - 1].earliestSec > effSec) return tooHigh("웨이브");
  const need: Partial<Record<MonsterId, number>> = {};
  for (const w of plan.slice(0, k)) for (const m of w.monsters) need[m] = (need[m] ?? 0) + 1;
  for (const [id, n] of Object.entries(need) as [MonsterId, number][]) if ((r.kills[id] ?? 0) < n) return tooHigh("웨이브");

  const D = DIFFS[t.difficulty];
  const cleared = k === plan.length;
  const progress = clamp((k + (total / Math.max(1, huntTotal(plan))) * 0.999) / (plan.length + 1), 0, 1);
  let points = total > 0 ? D.huntPoints * (0.15 + 0.85 * (cleared ? 1 : progress)) : 0;
  let xp = exp * levelPenalty(t.level, t.difficulty);
  if (r.died) {
    points *= 0.5;
    xp *= 0.7;
  }
  const bossKilled = (r.kills[ZONES[t.difficulty].boss] ?? 0) > 0 && cleared;
  const drops = rollDrops(t, Math.min(2, Math.floor(total / 8)), bossKilled);
  return { ok: true, score: Math.round(exp), exp: Math.round(xp), points: Math.round(points), drops };
}

function evalBugs(t: TicketInfo, r: BugsResult, eff: number): Verdict {
  const limit = timeLimitSec("bugs", t.difficulty);
  const plan = bugsPlan(t.seed, t.difficulty, limit, t.st);
  const c = bugsCount(plan, eff);
  if (r.caught > c.bug) return tooHigh("잡은 버그");
  if (r.golden > c.golden) return tooHigh("황금 버그");
  if (r.wrong > c.feature) return tooHigh("기능 누르기");
  if (r.decoy > c.decoy) return tooHigh("가짜 버그 누르기");
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

function evalStars(t: TicketInfo, r: StarsResult, eff: number): Verdict {
  const plan = starsPlan(t.seed, t.difficulty, timeLimitSec("stars", t.difficulty));
  // 마지막 별은 판정 범위만큼 늦게 눌릴 수 있다
  if (r.perfect + r.good + r.miss > starsCount(plan, eff + 300)) return tooHigh("별");
  if (r.maxCombo > r.perfect + r.good) return tooHigh("콤보");
  const upper = Math.round((r.perfect * STAR_SCORE.perfect + r.good * STAR_SCORE.good) * comboMult(r.maxCombo));
  const score = Math.max(0, Math.min(r.score, upper));
  const target = Math.max(1, plan.length * STAR_SCORE.perfect);
  return miniReward(t, score, clamp(score / target, 0, 1));
}

function miniReward(t: TicketInfo, score: number, perf: number): Verdict {
  const D = DIFFS[t.difficulty];
  const points = score > 0 ? Math.round(D.miniPoints * perf) : 0;
  const exp = Math.round(D.miniExp * perf * levelPenalty(t.level, t.difficulty));
  // 미니게임은 잘하면 포션 하나를 굴린다
  const drops = perf >= 0.5 ? rollDrops(t, 1, false, true) : [];
  return { ok: true, score, exp, points, drops };
}

/** 드롭은 시드로 정해진다 (같은 판 결과를 다시 보내 다시 굴릴 수 없다) */
export function rollDrops(t: TicketInfo, rolls: number, bossKilled: boolean, potionsOnly = false): Drop[] {
  const D = DIFFS[t.difficulty];
  const r = seeded(t.seed ^ 0x44524f50);
  const drops: Drop[] = [];
  const pickGear = (): Drop => {
    const pool = GEAR.filter((g) => g.reqLevel <= D.dropMaxLevel && g.reqLevel >= D.dropMaxLevel - 20);
    // 싼 장비가 더 잘 나온다
    const weights = pool.map((g) => 1 / Math.sqrt(g.price));
    let x = r() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) if ((x -= weights[i]) <= 0) return { kind: "gear", id: pool[i].id, qty: 1 };
    return { kind: "gear", id: pool[pool.length - 1].id, qty: 1 };
  };
  const pickPotion = (): Drop => {
    const x = r();
    const id = x < 0.5 ? "p_coffee" : x < 0.85 ? "p_energy" : "p_lunchbox";
    return { kind: "potion", id, qty: id === "p_lunchbox" ? 1 : 1 + Math.floor(r() * 2) };
  };
  if (bossKilled) drops.push(pickGear());
  for (let i = 0; i < rolls; i++) {
    if (r() >= D.dropChance) continue;
    drops.push(potionsOnly || r() < 0.55 ? pickPotion() : pickGear());
  }
  return drops;
}

/** 웨이브 사이 최소 간격 (UI 안내용으로 내보낸다) */
export const HUNT_WAVE_MIN_GAP_SEC = WAVE_MIN_GAP_SEC;
