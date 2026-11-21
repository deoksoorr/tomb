import { describe, expect, it } from "vitest";
import { ARENA, TRUCK, truckGreen, truckHits, truckLaneOf, truckLaneTop, truckPlan, truckShift, truckStartX, type TruckEv } from "./rules";

// 11/22 트럭 시위 초록 길: 어느 때든 초록 칸은 달리는 트럭(지금·0.6초 안)에 안 치인다
const DT = 1 / 120;
const AHEAD = 0.6;

function world(plan: TruckEv[], spd: number) {
  const spawn = (e: TruckEv) => e.at + e.warn / spd;
  const trucksAt = (t: number) =>
    plan.filter((e) => t >= spawn(e) && t - spawn(e) < TRUCK.life).map((e) => ({ lane: e.lane, dir: e.dir, x: truckStartX(e.dir) + e.dir * TRUCK.sp * spd * (t - spawn(e)) }));
  const pendingAt = (t: number) => plan.filter((e) => t >= e.at && t < spawn(e)).map((e) => e.lane);
  const freeAt = (t: number) => {
    const cur = plan.filter((e) => e.at <= t);
    return cur.length ? cur[cur.length - 1]!.free : -1;
  };
  return { spawn, trucksAt, pendingAt, freeAt, green: (t: number) => truckGreen(freeAt(t), pendingAt(t), trucksAt(t)) };
}

const cases: { free: number; f2: number | null; spd: number; mirror: boolean; reverse: boolean }[] = [];
for (let free = 0; free < TRUCK.lanes; free++)
  for (const f2 of [null, truckShift(free, 2), truckShift(free, 3)])
    for (const spd of [1, 1.3, 1.6]) for (const mirror of [false, true]) for (const reverse of [false, true]) cases.push({ free, f2, spd, mirror, reverse });

describe("트럭 시위 초록 길", () => {
  it("줄 판정 = 빨간 띠 그대로 (줄 경계에서 바로 바뀐다)", () => {
    expect(truckLaneOf(truckLaneTop(2))).toBe(2);
    expect(truckLaneOf(truckLaneTop(2) - 0.01)).toBe(1);
    expect(truckLaneOf(ARENA.y1)).toBe(TRUCK.lanes - 1);
    expect(truckHits({ lane: 3, x: 200 }, { x: 210, y: truckLaneTop(3) + 1 })).toBe(true);
    expect(truckHits({ lane: 3, x: 200 }, { x: 210, y: truckLaneTop(4) })).toBe(false);
  });

  it("둘째 줄 빈 줄은 2~3칸 옮겨 간다", () => {
    for (let f = 0; f < TRUCK.lanes; f++)
      for (const s of [2, 3]) {
        const f2 = truckShift(f, s);
        expect(f2).toBeGreaterThanOrEqual(0);
        expect(f2).toBeLessThan(TRUCK.lanes);
        expect(f2).not.toBe(f);
      }
  });

  it("초록 칸은 어느 때든 트럭에 안 치인다 (지금 + 0.6초 안)", () => {
    const bad: string[] = [];
    let greenSteps = 0;
    for (const c of cases) {
      const plan = truckPlan(c);
      const w = world(plan, c.spd);
      const end = Math.max(...plan.map((e) => w.spawn(e))) + TRUCK.life;
      for (let t = 0; t < end; t += DT) {
        const g = w.green(t);
        if (!g) continue;
        greenSteps++;
        if (g.x0 < ARENA.x0 || g.x1 > ARENA.x1) bad.push(`판 밖 ${JSON.stringify({ c, t, g })}`);
        // 예고 중인 줄은 초록이 아니다
        if (w.pendingAt(t).includes(g.lane)) bad.push(`예고 줄 ${JSON.stringify({ c, t, g })}`);
        for (let t2 = t; t2 <= t + AHEAD; t2 += DT * 4)
          for (const tr of w.trucksAt(t2)) {
            // 몸 판정 사각형 ∩ 초록 사각형 = 없음
            const ty0 = truckLaneTop(tr.lane);
            const hit = ty0 < g.y1 && truckLaneTop(tr.lane + 1) > g.y0 && tr.x - TRUCK.hx < g.x1 && tr.x + TRUCK.hx > g.x0;
            // 실제 판정 함수로도 칸 가장자리·가운데를 찍어 본다
            const probe = [g.x0, (g.x0 + g.x1) / 2, g.x1].some((x) => [g.y0 + 0.01, (g.y0 + g.y1) / 2, g.y1 - 0.01].some((y) => truckHits(tr, { x, y })));
            if (hit || probe) bad.push(JSON.stringify({ c, t, t2, g, tr }));
          }
        if (bad.length > 3) break;
      }
    }
    expect(bad).toEqual([]);
    expect(greenSteps).toBeGreaterThan(1000);
  });

  it("첫 예고부터 빈 줄이 끝까지 초록 · 둘째 줄은 트럭 출발 전에 새 초록이 보인다", () => {
    for (const c of cases) {
      const plan = truckPlan(c);
      const w = world(plan, c.spd);
      const g0 = w.green(TRUCK.at + DT);
      expect(g0).toEqual({ lane: c.free, x0: ARENA.x0, x1: ARENA.x1, y0: truckLaneTop(c.free), y1: truckLaneTop(c.free + 1) });
      if (c.f2 === null) continue;
      const at2 = TRUCK.at + TRUCK.gap;
      const go2 = Math.min(...plan.filter((e) => e.wave === 1).map((e) => w.spawn(e)));
      // 둘째 줄 예고가 깔리면 옛 빈 줄은 바로 초록이 아니다
      expect(w.green(at2 + DT)?.lane ?? c.f2).toBe(c.f2);
      let seen = false;
      for (let t = at2; t < go2; t += DT) if (w.green(t)?.lane === c.f2) seen = true;
      expect(seen, JSON.stringify(c)).toBe(true);
    }
  });
});
