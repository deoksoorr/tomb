import { daysBetween } from "../gameDay";
import { HUNT_ZONES, timeLimitSec, type Difficulty, type GameKind, type ZoneDef, type ZoneId } from "./catalog";
import { MAX_LEVEL, type MonsterScale } from "./formulas";
import type { EndgameView } from "./types";

// 11/15 사냥 끝판 1단계: 초월 레벨(★51~★100) · 하루 초월 판 구간 · 번아웃 단계(저주) · 개척자.
// 순수 함수만 둔다 — 서버(판 시작 검사·보상)와 화면(로비·결과·안내서)·게임(저주)이 같은 표를 쓴다.
// 설계: docs/superpowers/specs/2026-11-15-endgame-design.md

const DAY_MS = 86_400_000;

// ── 초월 레벨 ──

/** 초월 레벨 상한 (t = 0..50, 표시 ★51..★100. 0 = 아직 초월 전) */
export const TRANSCEND_MAX = 50;
const T_BASE = 15_000;
const T_GROWTH = 1.07;

/** 초월 t → t+1에 필요한 초월 EXP. ★51(0→1): 15,000 · ★100(49→50): 약 41만 · 합계 약 610만 (최대면 Infinity) */
export function tExpToNext(t: number): number {
  if (t >= TRANSCEND_MAX) return Infinity;
  return Math.round(T_BASE * T_GROWTH ** Math.max(0, Math.floor(t)));
}

/**
 * 판 EXP → 초월 EXP 배율. 11/15 실측(시드 400개 평균, 모든 몬스터·졸개·조각·정예까지 다 잡은 판, 레벨 50):
 * 분기 마감 전날 밤 23,837 · 구조조정 발표 날 27,937 → 평균 25,887 × 0.049 ≈ 1,268 (목표 1,275)
 */
export const TRANSCEND_EXP_MUL = 0.049;

/** 초월 5레벨마다 능력치 1포인트 */
export const transcendStatPoints = (t: number) => Math.floor(Math.max(0, Math.min(TRANSCEND_MAX, Math.floor(t))) / 5);

/** 초월 EXP를 더하고 초월 레벨업을 처리한다 (최대면 EXP는 0). statPoints = 이번에 새로 받는 능력치 포인트 */
export function applyTranscend(t: number, tExp: number, gained: number): { tLevel: number; tExp: number; levelsGained: number; statPoints: number } {
  let lv = t;
  let e = tExp + Math.max(0, Math.floor(gained));
  while (lv < TRANSCEND_MAX && e >= tExpToNext(lv)) {
    e -= tExpToNext(lv);
    lv++;
  }
  if (lv >= TRANSCEND_MAX) e = 0;
  return { tLevel: lv, tExp: e, levelsGained: lv - t, statPoints: transcendStatPoints(lv) - transcendStatPoints(t) };
}

/** ★표시 (t = 1 → ★51). 초월 전이면 "" */
export const starLabel = (t: number) => (t > 0 ? `★${50 + t}` : "");

/** 이 판이 초월 판인가: 레벨 50(슈퍼 계정은 최대 레벨 취급)에서 지옥 사냥터(번아웃 단계 포함) */
export const isTranscendRun = (level: number, game: GameKind, d: Difficulty) => level >= MAX_LEVEL && game === "hunt" && d === "hell";

// ── 하루 초월 판 구간 (새벽 5시에 하루가 바뀐다 — lib/gameDay) ──

/** 그날 100% 판 수 (적립 판은 더해진다) · 30%·10% 구간 판 수 · 적립 상한 */
export const TDAY_FULL = 20;
export const TDAY_STEP = 20;
export const TBANK_MAX = 40;

export type RunTier = "full" | "mid" | "low" | "practice";
/** 구간별 초월 EXP 비율·이름·칩 색 (초록 100% · 노랑 30% · 주황 10% · 회색 연습) */
export const RUN_TIERS: Record<RunTier, { rate: number; label: string; color: string }> = {
  full: { rate: 1, label: "100%", color: "#4caf50" },
  mid: { rate: 0.3, label: "30%", color: "#e0b800" },
  low: { rate: 0.1, label: "10%", color: "#f08c28" },
  practice: { rate: 0, label: "연습", color: "#8a8a8a" },
};

/** 그날 index번째(0부터) 초월 판의 구간: 앞 (20 + 적립) 판 100%, 다음 20판 30%, 다음 20판 10%, 그 뒤는 연습 판 (초월 EXP·드롭 없음) */
export function runTier(index: number, bank: number): RunTier {
  const full = TDAY_FULL + Math.max(0, bank);
  if (index < full) return "full";
  if (index < full + TDAY_STEP) return "mid";
  if (index < full + TDAY_STEP * 2) return "low";
  return "practice";
}

/** 캐릭터에 저장하는 하루 기록 (CharacterState의 같은 이름 칸) */
export type TDayState = { tDay?: string; tRuns: number; tBank: number; bTries: number };

/**
 * 날짜가 바뀌었으면 하루 기록을 넘긴다: 그날 못 쓴 100% 판(20 + 적립 − 한 판)이 적립으로 넘어가고, 통째로 쉰 날은 하루에 20씩 더 (최대 40).
 * 예) 5판 한 날 → 다음 날 적립 15 (원래 적립이 있었다면 그것도). 처음 쓰는 캐릭터는 적립 0에서 시작. 같은 날(또는 시계가 거꾸로)이면 그대로
 */
export function rollDay(s: TDayState, day: string): Required<TDayState> {
  if (!s.tDay) return { tDay: day, tRuns: 0, tBank: 0, bTries: 0 };
  const gap = daysBetween(s.tDay, day);
  if (gap <= 0) return { tDay: s.tDay, tRuns: s.tRuns, tBank: s.tBank, bTries: s.bTries };
  const left = Math.max(0, TDAY_FULL + s.tBank - s.tRuns);
  return { tDay: day, tRuns: 0, tBank: Math.min(TBANK_MAX, left + TDAY_FULL * (gap - 1)), bTries: 0 };
}

// ── 번아웃 단계 ──

/** 1단계에서 열려 있는 최고 단계 (나중에 올린다) */
export const BURNOUT_MAX_TIER = 10;
/** 하루 번아웃 도전 수 (새벽 5시에 다시 찬다). 도전 1번 = 초월 판 1판으로도 센다 */
export const BURNOUT_TRIES_PER_DAY = 5;
/** 단계마다 돌아가며 쓰는 지옥 사냥터: n단계 = (n−1) % 4 */
export const BURNOUT_ZONES: readonly ZoneId[] = ["burnout-abyss", "new-year-eve", "quarter-close", "layoff-day"];
export const burnoutZone = (n: number): ZoneDef => HUNT_ZONES[BURNOUT_ZONES[(Math.max(1, Math.floor(n)) - 1) % BURNOUT_ZONES.length]];

/** 몬스터 배율 (복리): 체력·공격력 × 1.35^n, 방어 × 1.12^n. EXP = 지옥 EXP × (1 + 0.1n) */
export const BURNOUT_HP_ATK = 1.35;
export const BURNOUT_DEF = 1.12;
export const burnoutExpMul = (n: number) => 1 + 0.1 * Math.max(0, n);

export const isBurnoutTier = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= BURNOUT_MAX_TIER;

export type CurseId = "potion_half" | "no_potion" | "heal_half" | "time_20" | "no_revive" | "mon_move" | "mon_atk" | "time_40";
/** 저주 (누적). 엔진에 이미 있는 값만 바꾼다 — 새 몬스터 패턴은 없다. 12·15·20은 단계 상한을 올릴 때를 위해 미리 정해 둔 것 */
export const CURSES: readonly { id: CurseId; from: number; name: string; desc: string }[] = [
  { id: "potion_half", from: 2, name: "탕비실 절약", desc: "물약 회복량이 절반" },
  { id: "no_potion", from: 4, name: "탕비실 폐쇄", desc: "물약을 마실 수 없다 (부활 쿠키는 된다)" },
  { id: "heal_half", from: 6, name: "연차 반려", desc: "받는 회복이 모두 절반 (스킬·재생·지형)" },
  { id: "time_20", from: 8, name: "마감 당김", desc: "제한 시간 −20%" },
  { id: "no_revive", from: 10, name: "사직서 즉시 수리", desc: "쓰러지면 그 자리에서 판 끝 (부활 쿠키 안 됨)" },
  { id: "mon_move", from: 12, name: "독촉 메일", desc: "몬스터 이동 속도 +20%" },
  { id: "mon_atk", from: 15, name: "연달아 회의", desc: "몬스터 공격 속도 +20%" },
  { id: "time_40", from: 20, name: "마감 당김 Ⅱ", desc: "제한 시간 −40% (−20% 대신)" },
];

/** n단계에 걸린 저주 (−40%가 붙으면 −20%는 빠진다) */
export function cursesAt(n: number): CurseId[] {
  const on = CURSES.filter((c) => n >= c.from).map((c) => c.id);
  return on.includes("time_40") ? on.filter((c) => c !== "time_20") : on;
}

/** 저주가 바꾸는 값. 0단계(번아웃 아님)는 모두 그대로 */
export type CurseFx = { potionMul: number; potions: boolean; healMul: number; timeMul: number; revive: boolean; monMove: number; monAtk: number };
export function curseFx(n: number): CurseFx {
  const on = new Set(cursesAt(n));
  return {
    potionMul: on.has("potion_half") ? 0.5 : 1,
    potions: !on.has("no_potion"),
    healMul: on.has("heal_half") ? 0.5 : 1,
    timeMul: on.has("time_40") ? 0.6 : on.has("time_20") ? 0.8 : 1,
    revive: !on.has("no_revive"),
    monMove: on.has("mon_move") ? 1.2 : 1,
    monAtk: on.has("mon_atk") ? 1.2 : 1,
  };
}

/** monsterStats에 넘기는 몬스터 배율 (번아웃이 아니면 undefined) */
export function burnoutScale(n?: number): MonsterScale | undefined {
  if (!n || n < 1) return undefined;
  return { hp: BURNOUT_HP_ATK ** n, atk: BURNOUT_HP_ATK ** n, def: BURNOUT_DEF ** n, speed: curseFx(n).monMove };
}

/** 판 제한 시간 (초): 번아웃이면 저주(마감 당김)를 반영. 서버 티켓 만료·결과 검증·게임 화면이 모두 이 값을 쓴다 */
export function runTimeLimitSec(game: GameKind, d: Difficulty, zone?: string | null, burnout?: number): number {
  const base = timeLimitSec(game, d, zone);
  return burnout ? Math.round(base * curseFx(burnout).timeMul) : base;
}

/** 고를 수 있는 가장 높은 단계 (깬 단계 + 1, 상한까지). 슈퍼 계정은 상한까지 다 */
export const burnoutOpenTier = (best: number, sup = false) => (sup ? BURNOUT_MAX_TIER : Math.min(BURNOUT_MAX_TIER, Math.max(0, best) + 1));

/** 번아웃 판 시작 검사 (서버). 문제가 없으면 null */
export function checkBurnoutStart(a: { level: number; tier: number; best: number; tries: number; sup: boolean }): { code: string; message: string } | null {
  if (a.level < MAX_LEVEL) return { code: "LEVEL_LOW", message: `번아웃 단계는 Lv.${MAX_LEVEL}부터 갈 수 있어요.` };
  if (!isBurnoutTier(a.tier)) return { code: "INVALID_INPUT", message: `번아웃 단계는 1~${BURNOUT_MAX_TIER}단계예요.` };
  if (a.tier > burnoutOpenTier(a.best, a.sup))
    return { code: "BURNOUT_LOCKED", message: `${a.tier}단계는 아직 잠겨 있어요. ${a.tier - 1}단계를 한 번도 쓰러지지 않고 깨면 열려요.` };
  if (a.tries >= BURNOUT_TRIES_PER_DAY)
    return { code: "BURNOUT_TRIES", message: `오늘 번아웃 도전 ${BURNOUT_TRIES_PER_DAY}번을 다 썼어요. 새벽 5시에 다시 차요.` };
  return null;
}

/**
 * 깔끔한 클리어: 모든 웨이브(우두머리 포함)를 깼고, 한 번도 쓰러지지 않았고(died), 부활 쿠키도 안 먹었다.
 * 다음 단계는 바로 아래 단계를 이렇게 깨야 열린다 (이미 깬 단계는 다시 해도 된다)
 */
export function cleanClear(r: { wavesCleared: number; died: boolean; potionsUsed?: Record<string, number> }, waves: number): boolean {
  return r.wavesCleared >= waves && !r.died && !((r.potionsUsed?.p_cookie ?? 0) > 0);
}

/** 판 뒤 최고 단계: 바로 위 단계(best + 1)를 깔끔하게 깼을 때만 오른다 */
export const burnoutAfter = (best: number, tier: number, clean: boolean) => (clean && tier === best + 1 ? tier : best);

// ── 개척자 ──

/** 끝판이 처음 열린 뒤(서버가 처음 본 시각, 저장소에 한 번만 적는다) 이 기간 안에 ★51 또는 번아웃 1단계를 처음 깨면 개척자 #N */
export const PIONEER_DAYS = 14;
export const pioneerUntil = (launch: number) => launch + PIONEER_DAYS * DAY_MS;
export const pioneerOpen = (launch: number, now: number) => now >= launch && now < pioneerUntil(launch);
/** 개척자 조건에 닿았나 (★51 = 초월 1 이상, 또는 번아웃 1단계 이상 깸) */
export const pioneerReached = (s: { tLevel: number; bBest: number }) => s.tLevel >= 1 || s.bBest >= 1;
/** 번호를 받을 수 있나 (운영자·슈퍼 계정은 번호를 받지 않는다 — staff) */
export const pioneerEligible = (s: { tLevel: number; bBest: number; pioneer?: unknown }, launch: number, now: number, staff: boolean) =>
  !staff && !s.pioneer && pioneerReached(s) && pioneerOpen(launch, now);

// ── 화면 정보 ──

/** 로비·결과 화면의 끝판 정보 (레벨 50일 때). day = 오늘 게임 날짜, launch = 끝판이 열린 시각(없으면 null) */
export function endgameView(
  c: TDayState & { tLevel: number; bBest: number; pioneer?: { n: number; at: number } },
  day: string,
  launch: number | null,
  sup = false,
): EndgameView {
  const d = rollDay(c, day);
  return {
    tExpToNext: Number.isFinite(tExpToNext(c.tLevel)) ? tExpToNext(c.tLevel) : 0,
    day: { runs: d.tRuns, full: TDAY_FULL + d.tBank, bank: d.tBank, tier: runTier(d.tRuns, d.tBank) },
    burnout: {
      best: c.bBest,
      open: burnoutOpenTier(c.bBest, sup),
      max: BURNOUT_MAX_TIER,
      triesLeft: Math.max(0, BURNOUT_TRIES_PER_DAY - d.bTries),
      tries: BURNOUT_TRIES_PER_DAY,
    },
    pioneer: { until: launch === null ? null : pioneerUntil(launch), ...(c.pioneer ? { n: c.pioneer.n, at: c.pioneer.at } : {}) },
  };
}
