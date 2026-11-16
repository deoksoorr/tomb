import { describe, expect, it } from "vitest";
import { planSquirrels, squirrelCount, SQUIRREL_BOUNCE_MS, SQUIRREL_END_MS } from "./squirrelRainPlan";

const view = { x: 100, y: 200, width: 427, height: 240 };

describe("다람쥐 비 연출 계획", () => {
  it("같은 씨앗이면 같은 계획 (모든 화면이 같은 모양)", () => {
    expect(planSquirrels(42, view, false)).toEqual(planSquirrels(42, view, false));
    expect(planSquirrels(42, view, false)).not.toEqual(planSquirrels(43, view, false));
  });

  it("마릿수 60~110, 움직임 줄이기면 적게 (돌지 않고 흔들리지 않는다)", () => {
    expect(squirrelCount({ x: 0, y: 0, width: 100, height: 100 }, false)).toBe(60);
    expect(squirrelCount({ x: 0, y: 0, width: 2000, height: 1000 }, false)).toBe(110);
    const calm = planSquirrels(7, view, true);
    expect(calm.length).toBeLessThan(40);
    expect(calm.every((s) => s.spin === 0 && s.swayAmp === 0)).toBe(true);
  });

  it("화면 위에서 떨어져 보이는 범위 안에 내려앉고, 끝나기 한참 전에 다 내려앉는다", () => {
    const plan = planSquirrels(99, view, false);
    for (const s of plan) {
      expect(s.y0).toBeLessThan(view.y);
      expect(s.x0).toBeGreaterThanOrEqual(view.x);
      expect(s.x0).toBeLessThanOrEqual(view.x + view.width);
      expect(s.yl).toBeGreaterThan(view.y);
      expect(s.yl).toBeLessThan(view.y + view.height);
      expect(s.delay + s.fall + SQUIRREL_BOUNCE_MS).toBeLessThan(SQUIRREL_END_MS - 1_500);
    }
    expect(new Set(plan.map((s) => s.dir)).size).toBe(2);
  });
});
