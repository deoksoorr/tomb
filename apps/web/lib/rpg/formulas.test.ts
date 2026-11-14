import { describe, expect, it } from "vitest";
import { HUNT_ZONES, ZONE_IDS } from "./catalog";
import { countsForRace, levelPenalty, MAX_LEVEL, refLevel } from "./formulas";

describe("levelPenalty · countsForRace (11/15: 기준 = 그 사냥터가 열리는 레벨)", () => {
  it("미니게임(사냥터 없음)은 난이도 권장 레벨 기준: +10까지 그대로, +10 넘으면 10%, +20 넘으면 2%", () => {
    expect(refLevel("hard")).toBe(18);
    expect(levelPenalty(11, "easy")).toBe(1);
    expect(levelPenalty(12, "easy")).toBe(0.1);
    expect(levelPenalty(22, "easy")).toBe(0.02);
    expect(levelPenalty(50, "hard", null)).toBe(0.02);
    expect(levelPenalty(28, "hard")).toBe(1);
  });

  it("사냥터는 그 사냥터가 열리는 레벨 기준 (같은 난이도라도 사냥터마다 다르다)", () => {
    const Z = HUNT_ZONES;
    expect(refLevel("hell", Z["layoff-day"])).toBe(48);
    // 50레벨: Lv.48·42 사냥터는 그대로, 회식 3차(30)·축제장(36)은 +10을 넘어 10%
    expect(levelPenalty(50, "hell", Z["layoff-day"])).toBe(1);
    expect(levelPenalty(50, "hell", Z["quarter-close"])).toBe(1);
    expect(levelPenalty(50, "hell", Z["burnout-abyss"])).toBe(0.1);
    expect(levelPenalty(50, "hell", Z["new-year-eve"])).toBe(0.1);
    // 어려움 두 번째 사냥터(Lv.22): 32까지 그대로, 33부터 10%, 43부터 2%
    expect(levelPenalty(32, "hard", Z["homework-desert"])).toBe(1);
    expect(levelPenalty(33, "hard", Z["homework-desert"])).toBe(0.1);
    expect(levelPenalty(43, "hard", Z["homework-desert"])).toBe(0.02);
    // 첫 사냥터는 난이도 권장 레벨과 같다 (예전 기준과 같은 값)
    expect(levelPenalty(41, "hell", Z["burnout-abyss"])).toBe(levelPenalty(41, "hell"));
  });

  it("지옥 예외는 없다: 회식 3차를 41레벨에 돌면 10%, 51레벨 이상은 없지만 +20 넘으면 2%", () => {
    expect(levelPenalty(40, "hell", HUNT_ZONES["burnout-abyss"])).toBe(1);
    expect(levelPenalty(41, "hell", HUNT_ZONES["burnout-abyss"])).toBe(0.1);
    expect(levelPenalty(50, "hell", HUNT_ZONES["burnout-abyss"])).toBe(0.1);
    expect(levelPenalty(51, "hell", HUNT_ZONES["burnout-abyss"])).toBe(0.02);
  });

  it("주간 레이스: 그 사냥터가 열리는 레벨 +10 이하만 센다 (지옥도 마찬가지)", () => {
    expect(countsForRace(11, "easy")).toBe(true);
    expect(countsForRace(12, "easy")).toBe(false);
    expect(countsForRace(50, "hard")).toBe(false);
    expect(countsForRace(50, "hell", HUNT_ZONES["burnout-abyss"])).toBe(false);
    expect(countsForRace(50, "hell", HUNT_ZONES["new-year-eve"])).toBe(false);
    expect(countsForRace(46, "hell", HUNT_ZONES["new-year-eve"])).toBe(true);
    expect(countsForRace(50, "hell", HUNT_ZONES["quarter-close"])).toBe(true);
    expect(countsForRace(50, "hell", HUNT_ZONES["layoff-day"])).toBe(true);
  });

  it("빈 구간이 없다: 1~50 어느 레벨이든 EXP를 다 받고 레이스에 드는 열린 사냥터가 하나 이상", () => {
    const gaps: number[] = [];
    for (let lv = 1; lv <= MAX_LEVEL; lv++) {
      const ok = ZONE_IDS.some((id) => {
        const z = HUNT_ZONES[id];
        return z.unlockLevel <= lv && levelPenalty(lv, z.difficulty, z) === 1 && countsForRace(lv, z.difficulty, z);
      });
      if (!ok) gaps.push(lv);
    }
    expect(gaps).toEqual([]);
  });
});
