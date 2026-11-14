import { describe, expect, it } from "vitest";
import { countsForRace, levelPenalty } from "./formulas";

describe("levelPenalty · countsForRace (11/15 낮은 난이도 EXP 거의 없음)", () => {
  it("권장 +10까지는 그대로, +10 넘으면 10%, +20 넘으면 2% (지옥 빼고)", () => {
    expect(levelPenalty(11, "easy")).toBe(1);
    expect(levelPenalty(12, "easy")).toBe(0.1);
    expect(levelPenalty(22, "easy")).toBe(0.02);
    expect(levelPenalty(50, "hard")).toBe(0.02);
    expect(levelPenalty(28, "hard")).toBe(1);
  });

  it("지옥은 맨 위 난이도라 +10 넘어도 절반까지만", () => {
    expect(levelPenalty(40, "hell")).toBe(1);
    expect(levelPenalty(41, "hell")).toBe(0.5);
    expect(levelPenalty(50, "hell")).toBe(0.5);
  });

  it("주간 레이스: 권장 +10 이하이거나 지옥이면 센다 (50레벨은 지옥만)", () => {
    expect(countsForRace(11, "easy")).toBe(true);
    expect(countsForRace(12, "easy")).toBe(false);
    expect(countsForRace(50, "hard")).toBe(false);
    expect(countsForRace(50, "hell")).toBe(true);
  });
});
