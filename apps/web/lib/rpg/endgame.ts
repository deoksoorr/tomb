import { daysBetween } from "../gameDay";
import { type Difficulty, type GameKind } from "./catalog";
import { MAX_LEVEL } from "./formulas";

// 11/15 사냥 끝판: 초월 레벨(★51~★100) · 하루 초월 판 구간 · 개척자. 야근 빌딩(층·저주·층 칭호)은 lib/rpg/tower.
// 순수 함수만 둔다 — 서버(판 시작 검사·보상)와 화면(로비·결과·안내서)이 같은 표를 쓴다.
// 설계: docs/superpowers/specs/2026-11-15-endgame-design.md

const DAY_MS = 86_400_000;

// ── 초월 레벨 ──

/** 초월 레벨 상한 (t = 0..50, 표시 ★51..★100. 0 = 아직 초월 전) */
export const TRANSCEND_MAX = 50;
// 11/15: 하루 판 수 제한을 없애면서 곡선을 리니지처럼 가파르게 (사용자 요청 "레벨업을 리니지급으로").
// 처음 잡은 2만 시작은 너무 길어 절반으로: 하루 4시간쯤(초월 EXP 약 5만) 하는 사람 기준 ★60 약 3일 · ★75 약 4주 · ★90 약 5달 · ★100 약 1년 3달
const T_BASE = 10_000;
const T_GROWTH = 1.12;

/** 초월 t → t+1에 필요한 초월 EXP. ★51(0→1): 10,000 · ★100(49→50): 약 258만 · 합계 약 2,400만 (최대면 Infinity) */
export function tExpToNext(t: number): number {
  if (t >= TRANSCEND_MAX) return Infinity;
  return Math.round(T_BASE * T_GROWTH ** Math.max(0, Math.floor(t)));
}

/**
 * 판 EXP → 초월 EXP 배율. 11/15 실측(시드 400개 평균, 모든 몬스터·졸개·조각·정예까지 다 잡은 판, 레벨 50):
 * 분기 마감 전날 밤 23,837 · 구조조정 발표 날 27,937 → 평균 25,887 × 0.049 ≈ 1,268 (목표 1,275)
 * 11/17 지옥 EXP 배율을 11 → 4로 낮춰(catalog DIFFS.hell) 판 EXP가 4/11이 됐다 → 배율을 11/4배(0.049 → 0.13475) 올려 초월 EXP는 그대로
 */
export const TRANSCEND_EXP_MUL = 0.13475;

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

/** 이 판이 시작할 때 초월 판 1판으로 세는가: 레벨 50(슈퍼 계정은 최대 레벨 취급)에서 지옥 사냥터. 야근 빌딩은 깬 4층 = 1판 (판 끝에 센다 — tower) */
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

/**
 * 그날 index번째(0부터) 초월 판의 구간. 11/15: 하루 판 수 제한을 없앴다 — 늘 100% (사용자 요청 "초월 판수 제한도 없애").
 * 구간 표·저장 칸(tRuns·tBank)은 옛 저장값·결과 모양 때문에 남겨 둔다
 */
export function runTier(_index: number, _bank: number): RunTier {
  return "full";
}

/**
 * 캐릭터에 저장하는 하루 기록 (CharacterState의 같은 이름 칸). 11/15 야근 빌딩: tFl = 아직 한 판(4층)이 안 된 깬 층 수, tChest = 오늘 연 우두머리 상자 수
 */
export type TDayState = { tDay?: string; tRuns: number; tBank: number; tFl: number; tChest: number };

/**
 * 날짜가 바뀌었으면 하루 기록을 넘긴다: 그날 못 쓴 100% 판(20 + 적립 − 한 판)이 적립으로 넘어가고, 통째로 쉰 날은 하루에 20씩 더 (최대 40).
 * 예) 5판 한 날 → 다음 날 적립 15 (원래 적립이 있었다면 그것도). 처음 쓰는 캐릭터는 적립 0에서 시작. 같은 날(또는 시계가 거꾸로)이면 그대로
 */
export function rollDay(s: TDayState, day: string): Required<TDayState> {
  if (!s.tDay) return { tDay: day, tRuns: 0, tBank: 0, tFl: 0, tChest: 0 };
  const gap = daysBetween(s.tDay, day);
  if (gap <= 0) return { tDay: s.tDay, tRuns: s.tRuns, tBank: s.tBank, tFl: s.tFl, tChest: s.tChest };
  const left = Math.max(0, TDAY_FULL + s.tBank - s.tRuns);
  return { tDay: day, tRuns: 0, tBank: Math.min(TBANK_MAX, left + TDAY_FULL * (gap - 1)), tFl: 0, tChest: 0 };
}

// ── 개척자 ──

/** 끝판이 처음 열린 뒤(서버가 처음 본 시각, 저장소에 한 번만 적는다) 이 기간 안에 ★51 또는 야근 빌딩 5층을 처음 넘으면 개척자 #N */
export const PIONEER_DAYS = 14;
export const pioneerUntil = (launch: number) => launch + PIONEER_DAYS * DAY_MS;
export const pioneerOpen = (launch: number, now: number) => now >= launch && now < pioneerUntil(launch);
/** 개척자: 야근 빌딩 이 층을 깨면 (5층 = 첫 우두머리 층) */
export const PIONEER_FLOOR = 5;
/** 개척자 조건에 닿았나 (★51 = 초월 1 이상, 또는 야근 빌딩 5층까지 깸) */
export const pioneerReached = (s: { tLevel: number; fBest: number }) => s.tLevel >= 1 || s.fBest >= PIONEER_FLOOR;
/** 번호를 받을 수 있나 (운영자·슈퍼 계정은 번호를 받지 않는다 — staff) */
export const pioneerEligible = (s: { tLevel: number; fBest: number; pioneer?: unknown }, launch: number, now: number, staff: boolean) =>
  !staff && !s.pioneer && pioneerReached(s) && pioneerOpen(launch, now);
