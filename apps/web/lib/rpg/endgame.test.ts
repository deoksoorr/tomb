import { describe, expect, it } from "vitest";
import { kstDay } from "../store/accounts";
import { earnedTitleIds, pioneerText, progressText, titleDef } from "../titles";
import { gainTranscend, newCharacter, normalize, statPointsEarned } from "./character";
import {
  applyTranscend,
  isTranscendRun,
  pioneerEligible,
  pioneerOpen,
  pioneerUntil,
  rollDay,
  runTier,
  TRANSCEND_EXP_MUL,
  transcendStatPoints,
  tExpToNext,
} from "./endgame";
import { endgameView } from "./tower";
import { evaluate } from "./rewards";
import { huntPlan } from "./plan";
import type { HuntResult } from "./types";

const DAY = 86_400_000;

describe("초월 레벨 곡선 (★51~★100)", () => {
  it("★51은 10,000, ★100은 약 258만, 합계 약 2,400만 (11/15 가파르게)", () => {
    expect(tExpToNext(0)).toBe(10000);
    expect(tExpToNext(1)).toBe(11200);
    expect(tExpToNext(49)).toBe(2580377);
    expect(tExpToNext(50)).toBe(Infinity);
    let sum = 0;
    for (let t = 0; t < 50; t++) sum += tExpToNext(t);
    expect(sum).toBe(24000181);
  });

  it("초월 EXP를 더하면 여러 레벨이 한 번에 오르고, 5레벨마다 능력치 1포인트 (최대면 EXP 0)", () => {
    expect(applyTranscend(0, 0, 9_999)).toEqual({ tLevel: 0, tExp: 9_999, levelsGained: 0, statPoints: 0 });
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
    expect([old.tLevel, old.tExp, old.tRuns, old.tBank, old.tFl, old.tChest, old.fBest, old.fBestMs, old.fWkBest]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // 테스트 서버에만 있던 번아웃 칸은 버린다
    const burn = normalize({ level: 50, bTries: 3, bBest: 4, tFl: 9 }) as unknown as Record<string, unknown>;
    expect(burn.bTries).toBeUndefined();
    expect(burn.bBest).toBeUndefined();
    expect(burn.tFl).toBe(3);
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
  it("11/15 하루 판 수 제한 없음: 몇 번째 판이든 늘 100%", () => {
    for (const i of [0, 19, 20, 59, 60, 500]) expect(runTier(i, 0)).toBe("full");
    expect(runTier(75, 15)).toBe("full");
  });

  it("적립: 처음엔 0, 5판 한 날 → 15, 통째로 쉰 날은 20씩, 최대 40", () => {
    const z = { tFl: 0, tChest: 0 };
    expect(rollDay({ tRuns: 0, tBank: 0, ...z }, "20261116")).toEqual({ tDay: "20261116", tRuns: 0, tBank: 0, tFl: 0, tChest: 0 });
    const five = { tDay: "20261116", tRuns: 5, tBank: 0, tFl: 2, tChest: 3 };
    expect(rollDay(five, "20261116")).toEqual(five);
    // 날이 바뀌면 판이 안 된 층·상자 수도 0부터
    expect(rollDay(five, "20261117")).toEqual({ tDay: "20261117", tRuns: 0, tBank: 15, tFl: 0, tChest: 0 });
    // 하루 쉬고 다음 날: 15 + 20 = 35
    expect(rollDay(five, "20261118").tBank).toBe(35);
    expect(rollDay(five, "20261125").tBank).toBe(40);
    // 적립을 다 못 쓴 날: 남은 100% 판 모두 (최대 40)
    expect(rollDay({ tDay: "20261116", tRuns: 10, tBank: 15, ...z }, "20261117").tBank).toBe(25);
    expect(rollDay({ tDay: "20261116", tRuns: 0, tBank: 40, ...z }, "20261117").tBank).toBe(40);
    // 100%를 넘게 한 날은 0
    expect(rollDay({ tDay: "20261116", tRuns: 70, tBank: 10, ...z }, "20261117").tBank).toBe(0);
    // 시계가 거꾸로면 그대로
    expect(rollDay(five, "20261115")).toEqual(five);
  });

  it("하루는 한국 시각 새벽 5시에 바뀐다", () => {
    const at = (h: number, m: number) => Date.UTC(2026, 10, 16, h - 9, m);
    const s = { tDay: kstDay(at(4, 59)), tRuns: 30, tBank: 0, tFl: 1, tChest: 15 };
    expect(s.tDay).toBe("20261115");
    expect(rollDay(s, kstDay(at(4, 59)))).toEqual(s);
    expect(rollDay(s, kstDay(at(5, 0)))).toEqual({ tDay: "20261116", tRuns: 0, tBank: 0, tFl: 0, tChest: 0 });
  });

  it("화면 정보: 날짜가 바뀌었으면 넘긴 값으로 보여 준다 (야근 빌딩 기록·상자·체크포인트)", () => {
    const c = { ...newCharacter(), level: 50, tDay: "20261116", tRuns: 25, tBank: 0, tFl: 2, tChest: 4, fBest: 23, fBestMs: 600_000, fWk: "20261116", fWkBest: 12, fWkMs: 300_000 };
    const v = endgameView(c, "20261116", "20261116", 1_000, false);
    expect(v.day).toEqual({ runs: 25, full: 20, bank: 0, tier: "full", floors: 2 });
    expect(v.tower).toEqual({ best: 23, week: { floor: 12, ms: 300_000 }, checkpoints: [1, 11, 21], chests: 4, chestsMax: 0 });
    expect(v.pioneer.until).toBe(pioneerUntil(1_000));
    // 다음 날·다음 주: 하루 칸은 넘기고, 지난주 기록은 보이지 않는다. 슈퍼 계정은 101층까지
    const next = endgameView(c, "20261124", "20261123", null, true);
    expect(next.day).toEqual({ runs: 0, full: 60, bank: 40, tier: "full", floors: 0 });
    expect(next.tower.week).toBeNull();
    expect(next.tower.chests).toBe(0);
    expect(next.tower.checkpoints.at(-1)).toBe(101);
    expect(next.pioneer.until).toBeNull();
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

  it("★51 또는 야근 빌딩 5층 · 운영자 제외 · 한 번만", () => {
    const now = launch + DAY;
    expect(pioneerEligible({ tLevel: 1, fBest: 0 }, launch, now, false)).toBe(true);
    expect(pioneerEligible({ tLevel: 0, fBest: 5 }, launch, now, false)).toBe(true);
    expect(pioneerEligible({ tLevel: 0, fBest: 4 }, launch, now, false)).toBe(false);
    expect(pioneerEligible({ tLevel: 1, fBest: 0 }, launch, now, true)).toBe(false);
    expect(pioneerEligible({ tLevel: 1, fBest: 0, pioneer: { n: 1, at: now } }, launch, now, false)).toBe(false);
    expect(pioneerEligible({ tLevel: 3, fBest: 20 }, launch, launch + 15 * DAY, false)).toBe(false);
  });
});

describe("끝판 칭호", () => {
  it("★60·★75·★90·★100 · 야근 빌딩 10·20·30·50·100층 · 개척자 (등급·진행 표시)", () => {
    const got = earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { tlv: 25, floor: 30, pioneer: 3 } });
    expect(got.filter((id) => /^t_(tlv|floor|pioneer)/.test(id))).toEqual(["t_tlv60", "t_tlv75", "t_floor10", "t_floor20", "t_floor30", "t_pioneer"]);
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { floor: 9 } }).some((id) => id.startsWith("t_floor"))).toBe(false);
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { floor: 100 } }).filter((id) => id.startsWith("t_floor"))).toHaveLength(5);
    expect(["t_floor10", "t_floor20", "t_floor30", "t_floor50", "t_floor100", "t_pioneer", "t_tlv100"].map((id) => titleDef(id)?.grade)).toEqual([
      "bronze",
      "silver",
      "gold",
      "gold",
      "legend",
      "gold",
      "legend",
    ]);
    expect(["t_floor10", "t_floor20", "t_floor30", "t_floor50", "t_floor100"].map((id) => titleDef(id)?.name)).toEqual([
      "야근 입문",
      "번아웃 생존자",
      "야근이 일상",
      "퇴근을 잊은 자",
      "사무실이 집",
    ]);
    expect(titleDef("t_tlv90")?.name).toBe("상무님");
    expect(progressText(titleDef("t_tlv75")!, 3)).toBe("★53 / ★75");
    expect(progressText(titleDef("t_tlv60")!, 0)).toBe("초월 전 / ★60");
    expect(progressText(titleDef("t_floor50")!, 23)).toBe("23층 / 50층");
    expect(pioneerText(7, Date.UTC(2026, 10, 20, 3))).toBe("#7 · 2026.11.20 달성");
  });

  it("신화: 지금 주인일 때만 (서버 최초는 영원히, 꼭대기 층·이번 주 최고층은 넘어간다)", () => {
    const ids = ["t_first30", "t_first50", "t_first100", "t_firstStar100", "t_topFloor", "t_weekFloor"];
    expect(ids.map((id) => titleDef(id)?.grade)).toEqual(Array(6).fill("mythic"));
    expect(ids.map((id) => titleDef(id)?.name)).toEqual(["최초 결재자", "최초 임원", "빌딩의 전설", "첫 번째 상무", "최고층 기록 보유자", "이번 주 최고층"]);
    expect(ids.filter((id) => titleDef(id)?.transient)).toEqual(["t_topFloor", "t_weekFloor"]);
    // 층·초월이 아무리 높아도 주인이 아니면 못 얻는다
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: { floor: 200, tlv: 50 } }).some((id) => ids.includes(id))).toBe(false);
    expect(earnedTitleIds({ dexTitleNames: [], champBoards: [], metrics: {}, mythic: ["t_first30", "t_topFloor"] }).filter((id) => ids.includes(id))).toEqual(["t_first30", "t_topFloor"]);
  });
});
