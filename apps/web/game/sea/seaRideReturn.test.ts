import { describe, expect, it } from "vitest";
import { SEA_BREAKWATER_TIP, SEA_DECKS, SEA_PONTOON, SEA_HEIGHT, SEA_KAYAKS, SEA_PIER, SEA_TUBES, SEA_WIDTH, onSeaDeck } from "@tomb/protocol";
import { RETURN_MAX_PATH, clearLine, kayakReturnWater, planRideReturn, returnBlend, returnPoseAt, tubeReturnWater } from "./seaRideReturn";

// 11/17 사용자 버그: 버려 둔 카약이 선착장으로 돌아갈 때 다리 위를 지나가요 → 물 위로만 찾은 길로 돌아가요
const HIGH = 1;
const LOW = 0;
const onDeckBox = (x: number, y: number, pad: number) => SEA_DECKS.some((r) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad);

/** 길을 따라 촘촘히 걸으며 모든 자리가 물인지 */
function walkAll(level: number, from: { x: number; y: number }, to: { x: number; y: number }, water: (x: number, y: number) => boolean) {
  const plan = planRideReturn(from, to, water, SEA_WIDTH, SEA_HEIGHT);
  expect(plan.kind).toBe("path");
  if (plan.kind !== "path") return plan;
  for (let t = 0; t <= plan.dur; t += 50) {
    const p = returnPoseAt(plan, from, to, t);
    // 첫·끝 칸 근처(내린 자리)는 빼고 데크에 닿지 않아요
    if (Math.hypot(p.x - from.x, p.y - from.y) > 12) expect(onDeckBox(p.x, p.y, 2), `t=${t} (${p.x.toFixed(0)},${p.y.toFixed(0)}) level=${level}`).toBe(false);
  }
  const end = returnPoseAt(plan, from, to, plan.dur + 1);
  expect(end.done).toBe(true);
  expect(Math.hypot(end.x - to.x, end.y - to.y)).toBeLessThan(0.5);
  return plan;
}

describe("seaRideReturn (11/17)", () => {
  it("부잔교 동쪽에 버린 카약은 부잔교·선착장 끝을 돌아 물 위로만 와요", () => {
    const moor = SEA_KAYAKS[0];
    const from = { x: SEA_PONTOON.x + SEA_PONTOON.w + 90, y: 640 };
    for (const level of [HIGH, LOW]) {
      const water = kayakReturnWater(level);
      // 곧은 줄은 데크를 가로질러요 (예전 모습)
      expect(clearLine(from, moor, water)).toBe(false);
      const plan = walkAll(level, from, moor, water);
      if (plan.kind === "path") expect(plan.pts.length).toBeGreaterThan(2);
    }
  });

  it("선착장 동쪽 물에서 버린 카약도 선착장 끝을 돌아와요 (가로지르지 않아요)", () => {
    const moor = SEA_KAYAKS[2];
    const from = { x: SEA_PIER.x + SEA_PIER.w + 30, y: 660 };
    const water = kayakReturnWater(HIGH);
    expect(clearLine(from, moor, water)).toBe(false);
    walkAll(HIGH, from, moor, water);
  });

  it("곧은 길이 모두 물이면 그대로 (점 둘)", () => {
    const moor = SEA_KAYAKS[1];
    const from = { x: moor.x - 40, y: moor.y + 60 };
    const plan = planRideReturn(from, moor, kayakReturnWater(HIGH), SEA_WIDTH, SEA_HEIGHT);
    expect(plan.kind).toBe("path");
    if (plan.kind === "path") expect(plan.pts).toHaveLength(2);
  });

  it("모래에 대고 내린 카약은 가까운 물로 내려가 돌아와요", () => {
    const moor = SEA_KAYAKS[0];
    const from = { x: 520, y: 530 }; // 만조 물가 바로 위 마른 모래
    const plan = planRideReturn(from, moor, kayakReturnWater(HIGH), SEA_WIDTH, SEA_HEIGHT);
    expect(["path", "fade"]).toContain(plan.kind);
    if (plan.kind === "path") for (const q of plan.pts.slice(1)) expect(onSeaDeck(q.x, q.y)).toBe(false);
  });

  it("너무 먼 곳(방파제 너머)이면 물결에 사라졌다 매어 둔 자리에 나타나요", () => {
    const moor = SEA_KAYAKS[0];
    const from = { x: SEA_BREAKWATER_TIP.x + SEA_BREAKWATER_TIP.w + 60, y: 690 };
    const plan = planRideReturn(from, moor, kayakReturnWater(HIGH), SEA_WIDTH, SEA_HEIGHT);
    expect(Math.hypot(from.x - moor.x, from.y - moor.y)).toBeGreaterThan(RETURN_MAX_PATH);
    expect(plan.kind).toBe("fade");
    const a = returnPoseAt(plan, from, moor, 0);
    expect(a.alpha).toBe(1);
    expect(a.x).toBe(from.x);
    const mid = returnPoseAt(plan, from, moor, plan.dur / 2);
    expect(mid.alpha).toBe(0);
    const end = returnPoseAt(plan, from, moor, plan.dur);
    expect(end).toMatchObject({ x: moor.x, y: moor.y, alpha: 1, done: true });
  });

  it("물 칸이 하나도 없으면 사라졌다 나타나요", () => {
    const plan = planRideReturn({ x: 100, y: 100 }, { x: 200, y: 100 }, () => false, SEA_WIDTH, SEA_HEIGHT);
    expect(plan.kind).toBe("fade");
  });

  it("같은 입력이면 늘 같은 길 (다른 사람 화면에서도 같아요)", () => {
    const moor = SEA_KAYAKS[0];
    const from = { x: 1520, y: 700 };
    const a = planRideReturn(from, moor, kayakReturnWater(0.6), SEA_WIDTH, SEA_HEIGHT);
    const b = planRideReturn(from, moor, kayakReturnWater(0.6), SEA_WIDTH, SEA_HEIGHT);
    expect(a).toEqual(b);
  });

  it("튜브: 선착장 너머에서 내려도 물 위로 돌아가고, 끝에서 떠다니는 길에 섞여요", () => {
    const home = SEA_TUBES[1];
    const from = { x: SEA_PIER.x - 30, y: 700 };
    const water = tubeReturnWater(HIGH);
    const plan = walkAll(HIGH, from, home, water);
    if (plan.kind !== "path") return;
    expect(returnBlend(plan, 0)).toBe(0);
    expect(returnBlend(plan, plan.dur)).toBe(1);
  });
});
