import { describe, expect, it } from "vitest";
import { addHurt, HURT_MERGE_MS, hpLost, hpShown } from "./hurtTally";

describe("hpShown: HUD 체력 숫자", () => {
  it("살아 있으면 올림 — 0.4가 남아도 0으로 보이지 않는다", () => {
    expect(hpShown(0.4)).toBe(1);
    expect(hpShown(37.4)).toBe(38);
    expect(hpShown(40)).toBe(40);
  });
  it("0 이하·NaN은 0", () => {
    expect(hpShown(0)).toBe(0);
    expect(hpShown(-12)).toBe(0);
    expect(hpShown(Number.NaN)).toBe(0);
  });
  it("소수 끝자리 오차는 올리지 않는다", () => {
    expect(hpShown(37 + 1e-9)).toBe(37);
    expect(hpShown(0.1 + 0.2 + 36.7)).toBe(37);
  });
});

describe("hpLost: 떠오르는 빨간 숫자 = HUD가 줄어든 양", () => {
  it("정수 피해는 소수 체력에서도 그 숫자 그대로", () => {
    // 자연 회복으로 37.4 → 10 맞음 → 27.4 (HUD 38 → 28)
    expect(hpLost(37.4, 27.4)).toBe(10);
  });
  it("0 아래로 넘친 몫은 뺀다", () => {
    expect(hpLost(5, 5 - 40)).toBe(5);
    expect(hpLost(37.4, 0)).toBe(38);
  });
  it("체력 1로 버티면 거기까지만", () => {
    expect(hpLost(12, 1)).toBe(11);
  });
  it("HUD가 안 바뀌면 0, 늘면 0", () => {
    expect(hpLost(37.9, 37.2)).toBe(0);
    expect(hpLost(10, 20)).toBe(0);
  });
  it("작은 지속 피해가 쌓여 정수를 넘는 순간 1 — HUD와 같은 걸음", () => {
    let hp = 20;
    let shown = 0;
    for (let i = 0; i < 10; i++) {
      const before = hp;
      hp -= 0.35;
      shown += hpLost(before, hp);
    }
    expect(shown).toBe(hpShown(20) - hpShown(hp));
  });
});

describe("addHurt: 0.3초 안에 맞으면 하나로", () => {
  it("처음 숫자는 새로", () => {
    expect(addHurt(null, 1000, 7)).toEqual({ cell: { at: 1000, n: 7 }, merged: false, shown: true });
  });
  it("창 안이면 합친다 (첫 숫자 시각은 그대로)", () => {
    const a = addHurt(null, 1000, 7).cell;
    const b = addHurt(a, 1100, 5);
    expect(b).toEqual({ cell: { at: 1000, n: 12 }, merged: true, shown: true });
    const c = addHurt(b.cell, 1000 + HURT_MERGE_MS - 1, 3);
    expect(c.cell).toEqual({ at: 1000, n: 15 });
    expect(c.merged).toBe(true);
  });
  it("창이 지나면 새 숫자 (계속 맞아도 0.3초마다 끊긴다)", () => {
    const a = addHurt(null, 1000, 7).cell;
    expect(addHurt(a, 1000 + HURT_MERGE_MS, 4)).toEqual({ cell: { at: 1300, n: 4 }, merged: false, shown: true });
  });
  it("0 이하는 무시", () => {
    const a = addHurt(null, 1000, 7).cell;
    expect(addHurt(a, 1100, 0)).toEqual({ cell: a, merged: false, shown: false });
    expect(addHurt(null, 1100, -3)).toEqual({ cell: null, merged: false, shown: false });
  });
  it("시계가 거꾸로 가면(다른 판 숫자) 새로", () => {
    const a = addHurt(null, 5000, 7).cell;
    expect(addHurt(a, 100, 2).merged).toBe(false);
  });
});
