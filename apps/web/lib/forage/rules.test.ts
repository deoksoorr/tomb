import { describe, expect, it } from "vitest";
import { bugsCount, bugsPlan } from "../rpg/plan";
import { BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS, INSECT_POINTS_MAX, insectPoints } from "./rules";

// 11/15 곤충 채집 한 판 포인트: 다 잡으면 최대, 못 잡거나 실수가 많으면 0, 넘지 않는다

describe("곤충 채집 포인트", () => {
  it("그 판의 곤충을 모두 잡으면 최대, 하나도 못 잡으면 0", () => {
    for (const seed of [1, 42, 9999]) {
      const all = bugsCount(bugsPlan(seed, BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS), Infinity);
      expect(insectPoints(seed, all.bug, all.golden, 0)).toBe(INSECT_POINTS_MAX);
      expect(insectPoints(seed, 0, 0, 0)).toBe(0);
      expect(insectPoints(seed, 0, 0, 5)).toBe(0);
    }
  });

  it("잡은 만큼 늘고, 실수는 깎고, 최대를 넘지 않는다", () => {
    const seed = 7;
    const all = bugsCount(bugsPlan(seed, BUG_DIFFICULTY, BUG_ROUND_SEC, BUG_STATS), Infinity);
    const half = insectPoints(seed, Math.floor(all.bug / 2), 0, 0);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(INSECT_POINTS_MAX);
    expect(insectPoints(seed, Math.floor(all.bug / 2), 0, 3)).toBeLessThanOrEqual(half);
    expect(insectPoints(seed, all.bug + 50, all.golden + 50, 0)).toBe(INSECT_POINTS_MAX);
  });
});
