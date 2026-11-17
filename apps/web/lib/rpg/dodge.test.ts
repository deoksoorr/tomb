import { describe, expect, it } from "vitest";
import { DODGE_CD_MS, DODGE_MS, dodgeCooldown, dodgeReady, NO_DODGE, rollDir, rolling, rollT, rollTravel, startDodge } from "./dodge";

// 11/17 사냥터 낙법: 쿨타임 6초 · 무적 0.4초 · 구르는 방향

describe("낙법 쿨타임", () => {
  it("판 처음에는 바로 구를 수 있다", () => {
    expect(dodgeReady(NO_DODGE, 0)).toBe(true);
    expect(startDodge(NO_DODGE, 0)).toEqual({ at: 0, readyAt: DODGE_CD_MS });
  });

  it("구른 뒤 6초 동안은 다시 못 구르고, 6초가 되는 순간 된다", () => {
    const d = startDodge(NO_DODGE, 1000)!;
    expect(DODGE_CD_MS).toBe(6000);
    expect(startDodge(d, 1000)).toBeNull();
    expect(startDodge(d, 6999)).toBeNull();
    expect(dodgeReady(d, 6999)).toBe(false);
    expect(startDodge(d, 7000)).toEqual({ at: 7000, readyAt: 13000 });
  });

  it("남은 쿨타임은 비율과 ms로 줄어든다", () => {
    const d = startDodge(NO_DODGE, 0)!;
    expect(dodgeCooldown(d, 0)).toEqual({ left: 1, ms: 6000 });
    expect(dodgeCooldown(d, 3000)).toEqual({ left: 0.5, ms: 3000 });
    expect(dodgeCooldown(d, 6000)).toEqual({ left: 0, ms: 0 });
    expect(dodgeCooldown(d, 9000)).toEqual({ left: 0, ms: 0 });
    expect(dodgeCooldown(NO_DODGE, 0)).toEqual({ left: 0, ms: 0 });
  });
});

describe("낙법 무적 시간", () => {
  it("시작 순간부터 0.4초 직전까지만 무적이다", () => {
    const d = startDodge(NO_DODGE, 2000)!;
    expect(DODGE_MS).toBe(400);
    expect(rolling(d, 1999)).toBe(false);
    expect(rolling(d, 2000)).toBe(true);
    expect(rolling(d, 2399)).toBe(true);
    expect(rolling(d, 2400)).toBe(false);
    // 쿨타임이 남아 있어도 무적은 아니다
    expect(rolling(d, 5000)).toBe(false);
  });

  it("구르지 않은 판은 무적이 아니다", () => {
    expect(rolling(NO_DODGE, 0)).toBe(false);
    expect(rollT(NO_DODGE, 0)).toBe(1);
  });

  it("진행 비율은 0에서 1로 간다", () => {
    const d = startDodge(NO_DODGE, 0)!;
    expect(rollT(d, 0)).toBe(0);
    expect(rollT(d, 200)).toBe(0.5);
    expect(rollT(d, 400)).toBe(1);
  });
});

describe("구르는 거리·방향", () => {
  it("굴러 간 거리는 0에서 1로, 처음이 빠르다", () => {
    expect(rollTravel(0)).toBe(0);
    expect(rollTravel(1)).toBe(1);
    expect(rollTravel(0.5)).toBeGreaterThan(0.5);
    expect(rollTravel(-1)).toBe(0);
    expect(rollTravel(2)).toBe(1);
    let prev = 0;
    for (let t = 0.1; t <= 1; t += 0.1) {
      const v = rollTravel(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("방향 입력이 있으면 그쪽, 없으면 보는 쪽, 둘 다 없으면 아래", () => {
    expect(rollDir({ x: 1, y: 0 }, { x: 0, y: 1 })).toEqual({ x: 1, y: 0 });
    const d = rollDir({ x: 1, y: 1 }, { x: 0, y: 1 });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(rollDir({ x: 0.05, y: 0 }, { x: -3, y: 0 })).toEqual({ x: -1, y: 0 });
    expect(rollDir({ x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 1 });
  });
});
