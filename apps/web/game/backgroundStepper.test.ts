import { describe, expect, it } from "vitest";
import { BACKGROUND_FPS, BackgroundStepper } from "./backgroundStepper";

const FRAME = 1000 / 60;
const STEP = 1000 / BACKGROUND_FPS;

/** 60fps로 ms 동안 돌린 결과: 갱신 횟수·그리기 횟수·넘긴 시간 합 */
function run(live: boolean, ms: number) {
  const s = new BackgroundStepper();
  let updates = 0;
  let renders = 0;
  let total = 0;
  for (let t = FRAME; t <= ms + 1e-6; t += FRAME) {
    const p = s.plan(t, FRAME, live);
    if (p.kind === "full") {
      updates++;
      renders++;
      total += p.delta;
    } else if (p.kind === "update") {
      updates++;
      total += p.delta;
    }
  }
  return { updates, renders, total };
}

describe("뒤로 간 동안 게임 루프 줄이기 (BackgroundStepper)", () => {
  it("마을: 초당 5번만 갱신·그리기, 흐른 시간은 모아서 넘겨 게임 시계가 그대로 간다", () => {
    const r = run(false, 10_000);
    expect(r.renders).toBeGreaterThanOrEqual(10 * BACKGROUND_FPS - 1);
    expect(r.renders).toBeLessThanOrEqual(10 * BACKGROUND_FPS + 1);
    expect(r.updates).toBe(r.renders);
    // 마지막 묶음(아직 넘기지 않은 몫)만큼만 모자란다
    expect(10_000 - r.total).toBeLessThan(STEP);
  });

  it("사냥 판 진행 중: 갱신은 매 프레임(판 시계 그대로), 그리기만 초당 5번", () => {
    const r = run(true, 10_000);
    expect(r.updates).toBe(600);
    expect(r.renders).toBeGreaterThanOrEqual(10 * BACKGROUND_FPS - 1);
    expect(r.renders).toBeLessThanOrEqual(10 * BACKGROUND_FPS + 1);
    expect(Math.abs(r.total - 10_000)).toBeLessThan(1);
  });
});
