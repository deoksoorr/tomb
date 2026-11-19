import { describe, expect, it } from "vitest";
import { STEAL_HIT_CAP, stealHeal } from "./lifesteal";
import { SKILL_FX } from "./skillTree";

// 11/19 넋 갈래 초기 상태로 되돌림 (실서버 v70): 1초 상한·광역 감쇠 없이 맞힐 때마다 min(최대 HP 3%, 피해 × 비율)

const MAX = 1000;
const hit = (dmg: number, missing = MAX, steal = SKILL_FX.so_drain(5).steal) => stealHeal({ dmg, steal, maxHp: MAX, missing });

describe("넋 갈래 수치 (v70)", () => {
  it("흡혈은 레벨당 1% (5레벨 5%)", () => {
    expect(SKILL_FX.so_drain(1).steal).toBeCloseTo(0.01);
    expect(SKILL_FX.so_drain(5).steal).toBeCloseTo(0.05);
  });

  it("넋 소용돌이 회복 상한 8%, 저승 너울 무적 0.8초 + 레벨당 0.3초", () => {
    expect(SKILL_FX.so_harvest(1).healCap).toBe(0.08);
    expect(SKILL_FX.so_veil(1).safeMs).toBe(1100);
    expect(SKILL_FX.so_veil(3).safeMs).toBe(1700);
  });
});

describe("흡혈 한 번", () => {
  it("피해 × 비율, 한 번에 최대 HP 3%까지", () => {
    expect(hit(200)).toBeCloseTo(10);
    expect(hit(10_000)).toBeCloseTo(MAX * STEAL_HIT_CAP);
  });

  it("HP가 가득하면 0", () => {
    expect(hit(10_000, 0)).toBe(0);
  });

  it("1초 상한이 없다: 짧은 사이에 여러 번 맞혀도 맞힐 때마다 그대로 찬다", () => {
    let sum = 0;
    for (let i = 0; i < 20; i++) sum += hit(10_000);
    expect(sum).toBeCloseTo(20 * MAX * STEAL_HIT_CAP);
  });

  it("흡혈이 없거나 피해가 없으면 0", () => {
    expect(hit(0)).toBe(0);
    expect(hit(100, MAX, 0)).toBe(0);
  });
});
