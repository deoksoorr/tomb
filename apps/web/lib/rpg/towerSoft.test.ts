import { describe, expect, it } from "vitest";
import { MONSTERS, type MonsterId } from "./catalog";
import { cardOffer, CARD_IDS } from "./cards";
import { huntSpawnable } from "./plan";
import { RunFinishSchema } from "./schemas";
import {
  endgameView,
  evalTower,
  floorMinSec,
  isBossFloor,
  TOWER_MAX_CLIMB,
  TOWER_TICKET_SEC,
  towerBlock,
  towerCheckpoints,
  towerClean,
  towerPlan,
  towerReach,
  towerScore,
  towerOfScore,
  towerSettle,
  towerHpMul,
  towerKillRate,
  type TowerState,
  type TowerVerdict,
  isCheckpoint,
  isChestFloor,
  nextCheckpoint,
  TOWER_CHEST_FROM,
} from "./tower";
// 11/19 상자 층 경계는 상수에서 (경계가 바뀌어도 그대로 통과하게)
const floorsOf = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i);
const chestsIn = (start: number, n: number) => floorsOf(start, n).filter(isChestFloor);
/** f층 이상에서 처음 고를 수 있는 시작 층 (체크포인트) */
const cpFrom = (f: number) => (isCheckpoint(f) ? f : nextCheckpoint(f));

import { RF_SPARK_CAP } from "./towerThemes/rooftopPlan";
import type { HuntResult } from "./types";

// 11/15 야근 빌딩 「부드러운 거절」과 거절 기준 (lib/rpg/tower evalTower · TOWER_SOFT), 의심 판 정산(towerSettle suspect · fSus),
// 옥상 피뢰침 불꽃이 층 계획에 들어갔는지, 높은 층(100층 위·400층 상한)에서 숫자가 깨지지 않는지

/** start층부터 floors층: 깬 층은 계획 몬스터 다, 판 중에 더 나오는 몫(분열·소환·adds)까지 다 잡음 */
function climb(seed: number, start: number, floors: number, perFloorSec = 30): HuntResult {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++)
    for (const [id, n] of Object.entries(huntSpawnable(towerPlan(seed, start + i, start), Infinity)) as [MonsterId, number][]) kills[id] = (kills[id] ?? 0) + n;
  const ms = floors * perFloorSec * 1000;
  return { game: "hunt", durationMs: ms + 3_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: ms };
}
const T = (seed: number, start = 1, level = 50) => ({ seed, level, start });
const why = (v: TowerVerdict): string[] => (v.ok ? (v.suspect ?? []) : [`reject:${v.why ?? v.message}`]);

describe("옥상 피뢰침 불꽃: 화면 상한과 서버 계획이 같은 상수", () => {
  it("옥상 우두머리 층 계획: 소환(4 × 두 번) + 피뢰침이 따로 흩뿌리는 RF_SPARK_CAP이 출현 상한에 들어간다", () => {
    let n = 0;
    for (let seed = 1; seed < 300 && n < 20; seed++)
      for (let f = 5; f <= 60; f += 5) {
        if (towerBlock(seed, 1, f).zone !== "rf_rooftop") continue;
        const p = towerPlan(seed, f, 1);
        expect(p[p.length - 1].adds).toContainEqual({ id: "rf_spark", n: RF_SPARK_CAP });
        expect(huntSpawnable(p, Infinity).rf_spark).toBe(8 + RF_SPARK_CAP);
        n++;
      }
    expect(n).toBeGreaterThan(5);
  });
});

describe("부드러운 거절 (한도 없음 — 의심 판: 보상은 주고 랭킹에서만 뺀다) / 거절은 형식·시간만", () => {
  const seed = 2468;
  const r = climb(seed, 1, 12);
  const el = r.durationMs + 1_500;

  it("정직한 판은 깨끗이 통과", () => {
    const v = evalTower(T(seed), r, el);
    expect(towerClean(v), JSON.stringify(why(v))).toBe(true);
  });

  it("몬스터별 출현 상한: 얼마나 넘든 의심 판 (조금이든 열 배든)", () => {
    const can = huntSpawnable(towerPlan(seed, 1, 1), Infinity);
    const id = (Object.keys(can) as MonsterId[]).find((m) => !MONSTERS[m].minion)!;
    const total = Array.from({ length: 13 }, (_, i) => huntSpawnable(towerPlan(seed, 1 + i, 1), Infinity)[id] ?? 0).reduce((a, b) => a + b, 0);
    for (const n of [total + 5, total * 10 + 500]) {
      const v = evalTower(T(seed), { ...r, kills: { ...r.kills, [id]: n } }, el);
      expect(v.ok).toBe(true);
      expect(why(v).some((w) => w.startsWith(`kill:${id}:${n}/`))).toBe(true);
    }
  });

  it("그 판에 오지 않은 테마·사냥터의 몬스터도 의심 판 ((theme) 표시) — 처치 기록 형식(모르는 id·음수·소수)만 거절", () => {
    const v = evalTower(T(seed), { ...r, kills: { ...r.kills, exam_paper: 3 } }, el);
    expect(v.ok).toBe(true);
    expect(why(v)).toContain("kill:exam_paper:3/0 (theme)");
    expect(evalTower(T(seed), { ...r, kills: { ...r.kills, not_a_monster: 1 } as HuntResult["kills"] }, el)).toMatchObject({ ok: false, code: "INVALID_RESULT" });
    expect(evalTower(T(seed), { ...r, kills: { ...r.kills, [Object.keys(r.kills)[0]]: -1 } }, el)).toMatchObject({ ok: false, code: "INVALID_RESULT" });
    expect(evalTower(T(seed), { ...r, kills: { ...r.kills, [Object.keys(r.kills)[0]]: 1.5 } }, el)).toMatchObject({ ok: false, code: "INVALID_RESULT" });
  });

  it("카드 기록이 맞지 않으면 의심 판 (거절하지 않는다)", () => {
    const off = cardOffer(seed, "l", 0, 0, {}, 1);
    const c = CARD_IDS.find((id) => !off.includes(id))!;
    const v = evalTower(T(seed), { ...r, cards: [{ k: "l", i: 0, r: 0, c }] }, el);
    expect(v.ok).toBe(true);
    expect(why(v)).toContain("cards:offer");
    // 형식은 zod가 먼저 본다 (레벨 업 층 f가 지워지지 않는다)
    const parsed = RunFinishSchema.parse({ ticket: "t".repeat(20), result: { ...r, cards: [{ k: "l", i: 0, r: 0, c, f: 7 }] } }).result as HuntResult;
    expect(parsed.cards?.[0].f).toBe(7);
  });

  it("처치 속도: 얼마나 넘든 의심 판", () => {
    // 레벨 1 티켓(상한이 가장 낮다)으로 같은 판을 50초에: 상한 3 + 50 × 3.8(야근 빌딩 ×2) × 1.4 ≈ 269 < 처치 수
    const total = Object.values(r.kills).reduce((a, b) => a + (b ?? 0), 0);
    const dur = 50_000;
    expect(total).toBeGreaterThan(3 + (dur / 1000) * towerKillRate(1) * 1.4);
    for (const mul of [1, 20]) {
      const kills = Object.fromEntries(Object.entries(r.kills).map(([k, n]) => [k, (n ?? 0) * mul]));
      const v = evalTower(T(seed, 1, 1), { ...r, kills, durationMs: dur, floorMs: dur - 1000 } as HuntResult, dur + 1000);
      expect(v.ok).toBe(true);
      expect(why(v).some((w) => w.startsWith("rate:"))).toBe(true);
    }
  });

  it("층 최소 시간: 절반 넘게 걸렸으면 의심 판, 절반도 안 걸렸으면 거절 (8초 미만 판의 층도)", () => {
    let minSec = 0;
    for (let i = 0; i < 12; i++) minSec += floorMinSec(towerPlan(seed, 1 + i, 1));
    for (const ms of [Math.round((minSec - 3) * 1000), Math.round((minSec / 2 + 2) * 1000)]) {
      const v = evalTower({ ...T(seed), gp: 50 }, { ...r, durationMs: ms, floorMs: ms }, ms + 500);
      expect(v.ok).toBe(true);
      expect(why(v).some((w) => w.startsWith("floorTime:"))).toBe(true);
    }
    for (const ms of [Math.round((minSec / 2 - 3) * 1000), 5_000]) {
      const v = evalTower({ ...T(seed), gp: 50 }, { ...r, durationMs: ms, floorMs: ms }, ms + 500);
      expect(v).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
    }
    // 깬 층이 없는 8초 미만 판은 예전처럼 보상 없이 (거절 아님)
    expect(evalTower(T(seed), { ...r, floors: 0, durationMs: 5_000 }, 6_000)).toMatchObject({ ok: true, floors: 0, points: 0 });
  });

  it("깬 층 계획 몬스터 부족: 몇 마리든 한 층 통째로든 의심 판", () => {
    const id = towerPlan(seed, 1, 1)[0].monsters[0];
    const few = evalTower(T(seed), { ...r, kills: { ...r.kills, [id]: (r.kills[id] ?? 0) - 3 } }, el);
    expect(few.ok).toBe(true);
    expect(why(few).some((w) => w.startsWith("need:3 "))).toBe(true);
    const more = evalTower(T(seed), { ...r, floors: 13 }, el);
    expect(more).toMatchObject({ ok: true, floors: 13, best: 13 });
    expect(why(more).some((w) => w.startsWith("need:"))).toBe(true);
  });

  it("깬 층 계획 몬스터를 절반 넘게 못 잡은 판(처치 없이 층 수만 적은 위조)은 거절", () => {
    expect(evalTower(T(seed), { ...r, kills: {} }, el)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
    expect(evalTower(T(seed), { ...r, floors: r.floors! * 3 }, el * 3)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
  });

  it("거절은 위조가 확실한 형식·시간만: 서버 시간보다 긴 기록 · 층 수 범위(0~400) 밖 · 게임 종류", () => {
    expect(evalTower(T(seed), r, r.durationMs - 10_000)).toMatchObject({ ok: false, code: "TOO_FAST" });
    // 요청 왕복 여유(3초) 안은 받는다
    expect(evalTower(T(seed), r, r.durationMs - 2_000).ok).toBe(true);
    expect(evalTower(T(seed), { ...r, floors: TOWER_MAX_CLIMB + 1 }, el)).toMatchObject({ ok: false, code: "INVALID_RESULT" });
    expect(evalTower(T(seed), { ...r, floors: -1 }, el)).toMatchObject({ ok: false, code: "INVALID_RESULT" });
    expect(evalTower(T(seed), { ...r, floors: 1.5 }, el)).toMatchObject({ ok: false, code: "INVALID_RESULT" });
    expect(evalTower(T(seed), { ...r, game: "bugs" } as unknown as HuntResult, el)).toMatchObject({ ok: false, code: "INVALID_RESULT" });
    // 시간 형식은 판 끝 요청 형식(zod)이 거절한다
    expect(RunFinishSchema.safeParse({ ticket: "t".repeat(20), result: { ...r, durationMs: -1 } }).success).toBe(false);
    expect(RunFinishSchema.safeParse({ ticket: "t".repeat(20), result: { ...r, durationMs: 1.5 } }).success).toBe(false);
  });

  it("벽시계로 두 시간 넘게 걸린 판(멈춤·탭 숨김)도 판 시간(durationMs) 그대로 깨끗이 통과", () => {
    const v = evalTower(T(seed), r, 5 * 3600_000);
    expect(towerClean(v)).toBe(true);
    expect(TOWER_TICKET_SEC).toBeGreaterThanOrEqual(12 * 3600);
    // 게임 시간이 두 시간을 넘는 긴 등반 (예전엔 2시간으로 잘라 층 시간이 모자란 판이 됐다) — 형식(zod)도 받는다
    const long = climb(seed, 1, 160, 50);
    expect(long.durationMs).toBeGreaterThan(2 * 3600_000);
    const parsed = RunFinishSchema.parse({ ticket: "t".repeat(20), result: long }).result as HuntResult;
    expect(towerClean(evalTower(T(seed), parsed, long.durationMs + 2_000))).toBe(true);
  });
});

describe("의심 판 정산: 층·초월 EXP·상자는 그대로, 최고·주간 기록은 그대로 두고 체크포인트만 연다", () => {
  const base: TowerState = { tRuns: 0, tBank: 0, tFl: 0, tChest: 0, fBest: 18, fBestMs: 900_000, fWk: "20261116", fWkBest: 18, fWkMs: 900_000 };
  it("towerSettle suspect", () => {
    const st = cpFrom(TOWER_CHEST_FROM);
    const top = st + 11;
    const a = { day: "20261116", week: "20261116", start: st, floors: 12, floorMs: 600_000 };
    const ok = towerSettle(base, a);
    const sus = towerSettle(base, { ...a, suspect: true });
    expect([sus.tExp, sus.runs, sus.chests]).toEqual([ok.tExp, ok.runs, ok.chests]);
    expect(sus.chests).toEqual(chestsIn(st, 12));
    expect(sus.chests.length).toBeGreaterThan(0);
    expect(ok).toMatchObject({ newBest: true, newWeek: true });
    expect(sus).toMatchObject({ newBest: false, newWeek: false, best: top });
    expect(sus.patch).toMatchObject({ fBest: 18, fBestMs: 900_000, fWkBest: 18, fWkMs: 900_000, fSus: top });
    // 체크포인트는 의심 판 층까지 열린다
    const c = { ...base, ...sus.patch };
    expect(towerReach(c)).toBe(top);
    expect(endgameView({ ...c, tLevel: 0 }, "20261116", "20261116", null).tower.checkpoints).toEqual(towerCheckpoints(top));
    expect(endgameView({ ...c, tLevel: 0 }, "20261116", "20261116", null).tower.best).toBe(18);
    // 더 낮은 의심 판은 fSus를 줄이지 않는다
    expect(towerSettle(c, { ...a, floors: 2, suspect: true }).patch.fSus).toBeUndefined();
  });
});

describe("높은 층 (100층 위·400층 상한): 숫자가 깨지지 않는다", () => {
  it("층 배율·계획·점수", () => {
    expect(Number.isFinite(towerHpMul(400))).toBe(true);
    expect(towerHpMul(400)).toBeLessThan(Number.MAX_SAFE_INTEGER);
    for (const f of [99, 100, 101, 150, 200, 201, 300, 399, 400]) {
      const p = towerPlan(777, f, 1);
      expect(p.length).toBe(2);
      expect(p.every((w) => w.monsters.length > 0 && w.monsters.every((m) => MONSTERS[m]))).toBe(true);
      if (isBossFloor(f)) expect(p[1].boss).toBe(true);
      expect(floorMinSec(p)).toBe(5);
    }
    // 11/16 점수 = 층 × 1e9 + 먼저 도달한 시각 (초)
    const at = Date.UTC(2027, 0, 1);
    expect(towerOfScore(towerScore(400, at))).toEqual({ floor: 400, at });
    expect(towerOfScore(towerScore(10_000, at))).toEqual({ floor: 10_000, at });
    expect(towerScore(10_000, 0)).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });

  it("201·301층 시작 판: 깨끗이 통과 (체크포인트 시작 카드 60·90장까지)", () => {
    for (const start of [101, 201, 301]) {
      const r = climb(9001, start, 30, 20);
      expect(towerClean(evalTower(T(9001, start), r, r.durationMs + 1_000))).toBe(true);
    }
  });
});
