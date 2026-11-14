import { describe, expect, it } from "vitest";
import { kstDay } from "../store/accounts";
import { earnedTitleIds, pioneerText, progressText, titleDef } from "../titles";
import { HUNT_ZONES } from "./catalog";
import { gainTranscend, newCharacter, normalize, statPointsEarned } from "./character";
import {
  applyTranscend,
  BURNOUT_MAX_TIER,
  burnoutAfter,
  burnoutExpMul,
  burnoutOpenTier,
  burnoutScale,
  burnoutZone,
  checkBurnoutStart,
  cleanClear,
  curseFx,
  cursesAt,
  endgameView,
  isTranscendRun,
  pioneerEligible,
  pioneerOpen,
  pioneerUntil,
  rollDay,
  runTier,
  runTimeLimitSec,
  TRANSCEND_EXP_MUL,
  transcendStatPoints,
  tExpToNext,
} from "./endgame";
import { monsterStats } from "./formulas";
import { evaluate } from "./rewards";
import { huntPlan } from "./plan";
import type { HuntResult } from "./types";

const DAY = 86_400_000;

describe("초월 레벨 곡선 (★51~★100)", () => {
  it("★51은 15,000, ★100은 약 41만, 합계 약 610만", () => {
    expect(tExpToNext(0)).toBe(15_000);
    expect(tExpToNext(1)).toBe(16_050);
    expect(tExpToNext(49)).toBe(412_949);
    expect(tExpToNext(50)).toBe(Infinity);
    let sum = 0;
    for (let t = 0; t < 50; t++) sum += tExpToNext(t);
    expect(sum).toBe(6_097_935);
  });

  it("초월 EXP를 더하면 여러 레벨이 한 번에 오르고, 5레벨마다 능력치 1포인트 (최대면 EXP 0)", () => {
    expect(applyTranscend(0, 0, 14_999)).toEqual({ tLevel: 0, tExp: 14_999, levelsGained: 0, statPoints: 0 });
    const r = applyTranscend(4, 0, tExpToNext(4) + tExpToNext(5) + 10);
    expect(r).toEqual({ tLevel: 6, tExp: 10, levelsGained: 2, statPoints: 1 });
    expect(applyTranscend(49, 0, 10_000_000)).toEqual({ tLevel: 50, tExp: 0, levelsGained: 1, statPoints: 1 });
    expect(transcendStatPoints(50)).toBe(10);
  });

  it("능력치 포인트는 오른 그 갱신에서만 한 번 — 같은 상태를 다시 읽어도(normalize) 더 주지 않는다", () => {
    const c = { ...newCharacter(), level: 50, statPoints: 0 };
    const g = gainTranscend(c, tExpToNext(0) + tExpToNext(1) + tExpToNext(2) + tExpToNext(3) + tExpToNext(4));
    expect(g.state.tLevel).toBe(5);
    expect(g.state.statPoints).toBe(1);
    const again = normalize(JSON.parse(JSON.stringify(g.state)));
    expect(again.statPoints).toBe(1);
    expect(again.tLevel).toBe(5);
    // 초월 몫까지 받은 포인트 합 (능력치 초기화·레벨 맞추기가 쓰는 값)
    expect(statPointsEarned(50, 5)).toBe(statPointsEarned(50) + 1);
  });

  it("옛 저장값은 끝판 칸이 0으로 읽힌다 (깨진 값도)", () => {
    const old = normalize({ level: 50, exp: 0, stats: {}, treeVer: 2 });
    expect([old.tLevel, old.tExp, old.tRuns, old.tBank, old.bTries, old.bBest]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(old.tDay).toBeUndefined();
    expect(old.pioneer).toBeUndefined();
    const bad = normalize({ level: 50, tLevel: 999, tBank: 99, tExp: -5, tDay: "어제", pioneer: { n: "x" } });
    expect([bad.tLevel, bad.tBank, bad.tExp]).toEqual([50, 40, 0]);
    expect(bad.tDay).toBeUndefined();
    expect(bad.pioneer).toBeUndefined();
  });

  it("초월 판 = 레벨 50 지옥 사냥만", () => {
    expect(isTranscendRun(50, "hunt", "hell")).toBe(true);
    expect(isTranscendRun(49, "hunt", "hell")).toBe(false);
    expect(isTranscendRun(50, "hunt", "hard")).toBe(false);
    expect(isTranscendRun(50, "stars", "hell")).toBe(false);
  });

  it("배율: 구조조정 발표 날·분기 마감 전날 밤을 다 잡은 판 평균이 100% 구간에서 약 1,275 초월 EXP", () => {
    const avg = (zone: "quarter-close" | "layoff-day") => {
      let sum = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const plan = huntPlan(seed * 7919, "hell", zone);
        const kills: Record<string, number> = {};
        for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
        const r: HuntResult = { game: "hunt", durationMs: 200_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {} };
        const v = evaluate({ game: "hunt", difficulty: "hell", seed: seed * 7919, level: 50, st: { agi: 1, dex: 1, luk: 1 }, zone }, r, 201_000);
        if (!v.ok) throw new Error(v.message);
        sum += v.exp;
      }
      return (sum / 60) * TRANSCEND_EXP_MUL;
    };
    // 웨이브 몬스터만 잡아도 (졸개·조각 빼고) 1,100~1,450 안
    const both = (avg("quarter-close") + avg("layoff-day")) / 2;
    expect(both).toBeGreaterThan(1_100);
    expect(both).toBeLessThan(1_450);
  });
});

describe("하루 초월 판 구간 (새벽 5시 기준)", () => {
  it("앞 (20 + 적립) 판 100%, 다음 20판 30%, 다음 20판 10%, 그 뒤 연습", () => {
    expect(runTier(0, 0)).toBe("full");
    expect(runTier(19, 0)).toBe("full");
    expect(runTier(20, 0)).toBe("mid");
    expect(runTier(39, 0)).toBe("mid");
    expect(runTier(40, 0)).toBe("low");
    expect(runTier(59, 0)).toBe("low");
    expect(runTier(60, 0)).toBe("practice");
    // 적립 15판: 100%가 35판까지
    expect(runTier(34, 15)).toBe("full");
    expect(runTier(35, 15)).toBe("mid");
    expect(runTier(75, 15)).toBe("practice");
  });

  it("적립: 처음엔 0, 5판 한 날 → 15, 통째로 쉰 날은 20씩, 최대 40", () => {
    expect(rollDay({ tRuns: 0, tBank: 0, bTries: 0 }, "20261116")).toEqual({ tDay: "20261116", tRuns: 0, tBank: 0, bTries: 0 });
    const five = { tDay: "20261116", tRuns: 5, tBank: 0, bTries: 3 };
    expect(rollDay(five, "20261116")).toEqual(five);
    expect(rollDay(five, "20261117")).toEqual({ tDay: "20261117", tRuns: 0, tBank: 15, bTries: 0 });
    // 하루 쉬고 다음 날: 15 + 20 = 35
    expect(rollDay(five, "20261118").tBank).toBe(35);
    expect(rollDay(five, "20261125").tBank).toBe(40);
    // 적립을 다 못 쓴 날: 남은 100% 판 모두 (최대 40)
    expect(rollDay({ tDay: "20261116", tRuns: 10, tBank: 15, bTries: 0 }, "20261117").tBank).toBe(25);
    expect(rollDay({ tDay: "20261116", tRuns: 0, tBank: 40, bTries: 0 }, "20261117").tBank).toBe(40);
    // 100%를 넘게 한 날은 0
    expect(rollDay({ tDay: "20261116", tRuns: 70, tBank: 10, bTries: 0 }, "20261117").tBank).toBe(0);
    // 시계가 거꾸로면 그대로
    expect(rollDay(five, "20261115")).toEqual(five);
  });

  it("하루는 한국 시각 새벽 5시에 바뀐다", () => {
    const at = (h: number, m: number) => Date.UTC(2026, 10, 16, h - 9, m);
    const s = { tDay: kstDay(at(4, 59)), tRuns: 30, tBank: 0, bTries: 5 };
    expect(s.tDay).toBe("20261115");
    expect(rollDay(s, kstDay(at(4, 59)))).toEqual(s);
    expect(rollDay(s, kstDay(at(5, 0)))).toEqual({ tDay: "20261116", tRuns: 0, tBank: 0, bTries: 0 });
  });

  it("화면 정보: 날짜가 바뀌었으면 넘긴 값으로 보여 준다", () => {
    const c = { ...newCharacter(), level: 50, tDay: "20261116", tRuns: 25, tBank: 0, bTries: 4, bBest: 2 };
    const v = endgameView(c, "20261116", 1_000, false);
    expect(v.day).toEqual({ runs: 25, full: 20, bank: 0, tier: "mid" });
    expect(v.burnout).toEqual({ best: 2, open: 3, max: BURNOUT_MAX_TIER, triesLeft: 1, tries: 5 });
    expect(v.pioneer.until).toBe(pioneerUntil(1_000));
    const next = endgameView(c, "20261117", null, true);
    expect(next.day).toEqual({ runs: 0, full: 20, bank: 0, tier: "full" });
    expect(next.burnout.triesLeft).toBe(5);
    expect(next.burnout.open).toBe(BURNOUT_MAX_TIER);
    expect(next.pioneer.until).toBeNull();
  });
});

describe("번아웃 단계", () => {
  it("사냥터는 회식 3차 → 축제장 → 분기 마감 → 구조조정 순으로 돌아간다", () => {
    expect([1, 2, 3, 4, 5, 8, 9, 10].map((n) => burnoutZone(n).id)).toEqual([
      "burnout-abyss",
      "new-year-eve",
      "quarter-close",
      "layoff-day",
      "burnout-abyss",
      "layoff-day",
      "burnout-abyss",
      "new-year-eve",
    ]);
  });

  it("몬스터 배율: 체력·공격력 × 1.35^n, 방어 × 1.12^n, EXP는 그대로 (판 EXP × (1 + 0.1n))", () => {
    expect(burnoutScale(0)).toBeUndefined();
    const s3 = burnoutScale(3)!;
    expect(s3.hp).toBeCloseTo(1.35 ** 3);
    expect(s3.def).toBeCloseTo(1.12 ** 3);
    expect(s3.speed).toBe(1);
    const z = HUNT_ZONES["layoff-day"];
    const base = monsterStats("hr_chair", "hell", z.power);
    const b = monsterStats("hr_chair", "hell", z.power, s3);
    expect(b.maxHp).toBe(Math.round(base.maxHp * 1.35 ** 3));
    expect(b.atk).toBeGreaterThan(base.atk * 2.4);
    expect(b.exp).toBe(base.exp);
    expect(b.speed).toBe(base.speed);
    expect(burnoutExpMul(10)).toBe(2);
  });

  it("저주 표: 누적, −40%가 붙으면 −20%는 빠진다", () => {
    expect(cursesAt(1)).toEqual([]);
    expect(cursesAt(2)).toEqual(["potion_half"]);
    expect(cursesAt(5)).toEqual(["potion_half", "no_potion"]);
    expect(cursesAt(10)).toEqual(["potion_half", "no_potion", "heal_half", "time_20", "no_revive"]);
    expect(cursesAt(20)).toEqual(["potion_half", "no_potion", "heal_half", "no_revive", "mon_move", "mon_atk", "time_40"]);
    expect(curseFx(0)).toEqual({ potionMul: 1, potions: true, healMul: 1, timeMul: 1, revive: true, monMove: 1, monAtk: 1 });
    expect(curseFx(6)).toMatchObject({ potionMul: 0.5, potions: false, healMul: 0.5, timeMul: 1, revive: true });
    expect(curseFx(10)).toMatchObject({ timeMul: 0.8, revive: false, monMove: 1 });
    expect(curseFx(12).monMove).toBe(1.2);
    expect(curseFx(20).timeMul).toBe(0.6);
  });

  it("제한 시간: 8단계부터 −20% (지옥 240초 → 192초)", () => {
    expect(runTimeLimitSec("hunt", "hell", "layoff-day")).toBe(240);
    expect(runTimeLimitSec("hunt", "hell", "layoff-day", 7)).toBe(240);
    expect(runTimeLimitSec("hunt", "hell", "layoff-day", 8)).toBe(192);
  });

  it("시작 검사: 레벨 50, 열린 단계(깬 단계 + 1), 하루 5번. 슈퍼 계정은 모든 단계", () => {
    const ok = { level: 50, tier: 1, best: 0, tries: 0, sup: false };
    expect(checkBurnoutStart(ok)).toBeNull();
    expect(checkBurnoutStart({ ...ok, level: 49 })?.code).toBe("LEVEL_LOW");
    expect(checkBurnoutStart({ ...ok, tier: 2 })?.code).toBe("BURNOUT_LOCKED");
    expect(checkBurnoutStart({ ...ok, tier: 3, best: 2 })).toBeNull();
    expect(checkBurnoutStart({ ...ok, tier: 1, best: 5 })).toBeNull();
    expect(checkBurnoutStart({ ...ok, tier: BURNOUT_MAX_TIER + 1, best: 99 })?.code).toBe("INVALID_INPUT");
    expect(checkBurnoutStart({ ...ok, tries: 5 })?.code).toBe("BURNOUT_TRIES");
    expect(checkBurnoutStart({ ...ok, tier: 9, sup: true })).toBeNull();
    expect(burnoutOpenTier(BURNOUT_MAX_TIER)).toBe(BURNOUT_MAX_TIER);
  });

  it("다음 단계는 바로 아래 단계를 한 번도 쓰러지지 않고(부활 쿠키 없이) 끝까지 깨야 열린다", () => {
    const waves = 7;
    const r = { wavesCleared: 7, died: false, potionsUsed: { p_coffee: 2 } };
    expect(cleanClear(r, waves)).toBe(true);
    expect(cleanClear({ ...r, died: true }, waves)).toBe(false);
    expect(cleanClear({ ...r, potionsUsed: { p_cookie: 1 } }, waves)).toBe(false);
    expect(cleanClear({ ...r, wavesCleared: 6 }, waves)).toBe(false);
    expect(burnoutAfter(0, 1, true)).toBe(1);
    expect(burnoutAfter(0, 1, false)).toBe(0);
    expect(burnoutAfter(3, 2, true)).toBe(3);
    // 건너뛴 단계(슈퍼 계정)는 기록하지 않는다
    expect(burnoutAfter(0, 5, true)).toBe(0);
  });

  it("결과 검증: 번아웃은 EXP 감소 없이 단계 보너스, 저주로 줄어든 제한 시간 뒤는 세지 않는다", () => {
    const seed = 4242;
    const zone = burnoutZone(9); // 회식 3차 (레벨 50이면 보통 10%)
    const plan = huntPlan(seed, "hell", zone.id);
    const kills: Record<string, number> = {};
    for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
    const r: HuntResult = { game: "hunt", durationMs: 180_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {} };
    const t = { game: "hunt" as const, difficulty: "hell" as const, seed, level: 50, st: { agi: 1, dex: 1, luk: 1 }, zone: zone.id };
    const plain = evaluate(t, r, 181_000);
    const burn = evaluate({ ...t, burnout: 9 }, r, 181_000);
    if (!plain.ok || !burn.ok) throw new Error("rejected");
    expect(plain.exp).toBe(Math.round(plain.score * 0.1));
    expect(Math.abs(burn.exp - plain.score * 1.9)).toBeLessThan(2);
    // 9단계 제한 시간 192초: 그보다 긴 판도 192초로 잘라 본다 → 처치 상한이 줄어든다
    const long = { ...r, durationMs: 300_000 };
    expect(evaluate({ ...t, burnout: 9 }, long, 301_000).ok).toBe(true);
    const tooMany = { ...r, kills: Object.fromEntries(Object.entries(kills).map(([k, n]) => [k, n * 3])) };
    expect(evaluate({ ...t, burnout: 9 }, tooMany, 301_000).ok).toBe(false);
  });
});

describe("개척자 (끝판이 열린 뒤 14일)", () => {
  const launch = Date.UTC(2026, 10, 15, 3);
  it("열린 시각부터 14일 동안만", () => {
    expect(pioneerOpen(launch, launch)).toBe(true);
    expect(pioneerOpen(launch, launch + 14 * DAY - 1)).toBe(true);
    expect(pioneerOpen(launch, launch + 14 * DAY)).toBe(false);
    expect(pioneerOpen(launch, launch - 1)).toBe(false);
    expect(pioneerUntil(launch)).toBe(launch + 14 * DAY);
  });

  it("★51 또는 번아웃 1단계 · 운영자 제외 · 한 번만", () => {
    const now = launch + DAY;
    expect(pioneerEligible({ tLevel: 1, bBest: 0 }, launch, now, false)).toBe(true);
    expect(pioneerEligible({ tLevel: 0, bBest: 1 }, launch, now, false)).toBe(true);
    expect(pioneerEligible({ tLevel: 0, bBest: 0 }, launch, now, false)).toBe(false);
    expect(pioneerEligible({ tLevel: 1, bBest: 0 }, launch, now, true)).toBe(false);
    expect(pioneerEligible({ tLevel: 1, bBest: 0, pioneer: { n: 1, at: now } }, launch, now, false)).toBe(false);
    expect(pioneerEligible({ tLevel: 3, bBest: 2 }, launch, launch + 15 * DAY, false)).toBe(false);
  });
});

describe("끝판 칭호", () => {
  it("★60·★75·★90·★100 · 번아웃 5·10·20·30 · 개척자 (등급·진행 표시)", () => {
    const got = earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { tlv: 25, burn: 10, pioneer: 3 } });
    expect(got.filter((id) => /^t_(tlv|burn|pioneer)/.test(id))).toEqual(["t_tlv60", "t_tlv75", "t_burn5", "t_burn10", "t_pioneer"]);
    expect([
      titleDef("t_tlv60")?.grade,
      titleDef("t_tlv100")?.grade,
      titleDef("t_burn5")?.grade,
      titleDef("t_burn30")?.grade,
      titleDef("t_pioneer")?.grade,
    ]).toEqual(["silver", "legend", "silver", "legend", "gold"]);
    expect(titleDef("t_tlv90")?.name).toBe("상무님");
    expect(progressText(titleDef("t_tlv75")!, 3)).toBe("★53 / ★75");
    expect(progressText(titleDef("t_tlv60")!, 0)).toBe("초월 전 / ★60");
    expect(progressText(titleDef("t_burn10")!, 4)).toBe("4단계 / 10단계");
    expect(pioneerText(7, Date.UTC(2026, 10, 20, 3))).toBe("#7 · 2026.11.20 달성");
  });
});
