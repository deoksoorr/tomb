import { describe, expect, it } from "vitest";
import { STEAL_HIT_CAP, STEAL_SEC_CAP, stealHeal, type StealBook, type StealKind } from "./lifesteal";
import { SKILL_FX } from "./skillTree";

// 11/17 넋 거두기 흡혈 너프: 1초 상한 5% · 광역기와 소환 3분의 1 · 비율 레벨당 1.5%
// 11/18 완화(127층 클리어자가 60층도 버거워졌다): 1초 상한 8% · 광역기와 소환 절반

const MAX = 1000;

/** 옛 규칙 (11/17 전): 맞힐 때마다 min(최대 HP 3%, 피해 × 비율), 1초 상한·광역 감쇠 없음 */
const oldHeal = (dmg: number, steal: number) => Math.min(MAX * 0.03, dmg * steal);

function hit(book: StealBook, now: number, dmg: number, kind: StealKind = "single", steal = SKILL_FX.so_drain(5).steal): number {
  return stealHeal(book, now, { dmg, steal, maxHp: MAX, missing: MAX, kind });
}

describe("흡혈 비율", () => {
  it("레벨당 1.5% (5레벨 7.5%)", () => {
    expect(SKILL_FX.so_drain(1).steal).toBeCloseTo(0.015);
    expect(SKILL_FX.so_drain(5).steal).toBeCloseTo(0.075);
  });

  it("보상: 넋 소용돌이 회복 상한 12%, 저승 너울 무적 1초 + 레벨당 0.35초", () => {
    expect(SKILL_FX.so_harvest(1).healCap).toBe(0.12);
    expect(SKILL_FX.so_veil(1).safeMs).toBe(1350);
    expect(SKILL_FX.so_veil(3).safeMs).toBe(2050);
  });
});

describe("흡혈 한 번", () => {
  it("한 대상은 피해 × 비율, 한 번에 최대 HP 3%까지", () => {
    expect(hit([], 0, 200)).toBeCloseTo(15);
    expect(hit([], 0, 10_000)).toBeCloseTo(MAX * STEAL_HIT_CAP);
  });

  it("광역기와 소환은 절반", () => {
    expect(hit([], 0, 200, "aoe")).toBeCloseTo(7.5);
    expect(hit([], 0, 200, "summon")).toBeCloseTo(7.5);
    expect(hit([], 0, 10_000, "aoe")).toBeCloseTo(15);
  });

  it("가득 차 있거나 흡혈이 없으면 안 차고 적지도 않는다", () => {
    const book: StealBook = [];
    expect(stealHeal(book, 0, { dmg: 500, steal: 0.075, maxHp: MAX, missing: 0, kind: "single" })).toBe(0);
    expect(stealHeal(book, 0, { dmg: 500, steal: 0, maxHp: MAX, missing: 500, kind: "single" })).toBe(0);
    expect(book).toEqual([]);
    // 모자란 만큼만
    expect(stealHeal(book, 0, { dmg: 500, steal: 0.075, maxHp: MAX, missing: 4, kind: "single" })).toBe(4);
  });
});

describe("1초 상한", () => {
  it("모든 맞힘을 합쳐 1초에 최대 HP 8%까지, 1초가 지나면 다시 찬다", () => {
    const book: StealBook = [];
    let sum = 0;
    for (let t = 0; t < 1000; t += 100) sum += hit(book, t, 1000);
    expect(sum).toBeCloseTo(MAX * STEAL_SEC_CAP);
    // 첫 맞힘(0ms)이 창 밖으로 나가면 그만큼 다시 찬다
    expect(hit(book, 1000, 1000)).toBeCloseTo(30);
    expect(hit(book, 1050, 1000)).toBe(0);
  });

  it("예시: 별빛 행렬 한 번 (보이는 적 20마리 × 5번, 860ms 안) — 옛 규칙 200% → 이제 8%", () => {
    const hitAt = SKILL_FX.so_procession(3).hitAt;
    expect(hitAt.length).toBe(5);
    expect(hitAt[hitAt.length - 1] - hitAt[0]).toBeLessThan(1000);
    const book: StealBook = [];
    let now = 0;
    let old = 0;
    for (const at of hitAt)
      for (let m = 0; m < 20; m++) {
        now += hit(book, at, 400, "aoe");
        old += oldHeal(400, SKILL_FX.so_drain(5).steal - 0.025); // 옛 5레벨 비율 5%
      }
    // 옛 규칙: 한 마리 맞힐 때마다 20(2%)씩 100번 = 최대 HP의 200% (HP가 두 번 꽉 찬다)
    expect(old / MAX).toBeCloseTo(2);
    // 이제: 광역 절반(약 15)씩이지만 1초 상한에 막혀 8%
    expect(now / MAX).toBeCloseTo(0.08);
  });

  it("한 대상만 꾸준히 때리면 (초당 3번, 한 번 피해 400) 1초에 8%", () => {
    const book: StealBook = [];
    let sum = 0;
    for (let t = 0; t < 3000; t += 333) sum += hit(book, t, 400);
    // 1초마다 30 + 30 + 20(상한까지) → 3초에 약 24%
    expect(sum / MAX).toBeLessThanOrEqual(0.24 + 1e-9);
    expect(sum / MAX).toBeGreaterThan(0.2);
  });
});
