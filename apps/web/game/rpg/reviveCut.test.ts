import { describe, expect, it, vi } from "vitest";
import { downPlan, downPose, downStage, REVIVE_INVULN_MS } from "./reviveCut";

vi.mock("phaser", () => ({}));

// 11/17 쓰러짐 → 카드 발동 → 일어남 연출의 단계

describe("부활 연출 단계", () => {
  it("무한 야근·부활 쿠키: 쓰러짐 0.6초 → 카드 → 일어남, 무적 1.5초", () => {
    const p = downPlan("card");
    expect(p.fall).toBe(600);
    expect(p.total).toBe(p.fall + p.card + p.rise);
    expect(downPlan("cookie")).toEqual(p);
    expect(REVIVE_INVULN_MS).toBe(1500);
    expect(downStage(p, 0)).toEqual({ stage: "fall", k: 0 });
    expect(downStage(p, 300).stage).toBe("fall");
    expect(downStage(p, 600).stage).toBe("card");
    expect(downStage(p, p.fall + p.card).stage).toBe("rise");
    expect(downStage(p, p.total)).toEqual({ stage: "done", k: 1 });
  });

  it("연차(세트 장비)는 짧은 판 0.4초 — 카드 단계 없이 바로 일어난다", () => {
    const p = downPlan("vacation");
    expect(p.total).toBe(400);
    expect(p.card).toBe(0);
    expect(downStage(p, 249).stage).toBe("fall");
    expect(downStage(p, 250).stage).toBe("rise");
    expect(downStage(p, 400).stage).toBe("done");
  });

  it("자세: 쓰러지며 눕고 흑백이 짙어졌다가, 일어나며 돌아온다", () => {
    const p = downPlan("card");
    const at = (t: number) => downPose("card", downStage(p, t));
    expect(at(0)).toMatchObject({ angle: 0, gray: 0 });
    expect(at(300).angle).toBeGreaterThan(0);
    expect(at(300).angle).toBeLessThan(90);
    expect(at(700)).toMatchObject({ angle: 90, gray: 0.9 });
    expect(at(p.fall + p.card + p.rise / 2).gray).toBeCloseTo(0.45);
    expect(at(p.total)).toMatchObject({ angle: 0, gray: 0, drop: 0 });
    // 연차는 반쯤만
    const v = downPlan("vacation");
    expect(downPose("vacation", downStage(v, 249)).angle).toBeLessThanOrEqual(32);
  });
});
