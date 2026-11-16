import { describe, expect, it } from "vitest";
import { SEA_HEIGHT, SEA_JET_MIN_Y, SEA_TUBES, SEA_WIDTH, TIDE_LOW_Y } from "@tomb/protocol";
import { SHIP_LANE_Y0, SHIP_SLOT_MS, shipPassOf, shipsAt, squidBoatsAt, squidCount } from "./seaShipsPlan";

// 11/16 r15 먼바다 풍경 계획 (그림·소리만)
describe("seaShipsPlan", () => {
  it("같은 시각이면 누구나 같은 배 (칸마다 정해져요), 몇 분마다 한 척쯤", () => {
    const t = Date.UTC(2026, 10, 16, 3, 0, 0);
    expect(shipsAt(t)).toEqual(shipsAt(t));
    let passes = 0;
    for (let s = 0; s < 200; s++) if (shipPassOf(Math.floor(t / SHIP_SLOT_MS) + s)) passes++;
    expect(passes).toBeGreaterThan(110);
    expect(passes).toBeLessThan(170);
  });
  it("배는 먼바다 띠로만 지나가요 (놀거리·튜브·헤엄 자리보다 바깥)", () => {
    const t0 = Date.UTC(2026, 10, 16, 0, 0, 0);
    const tubeMax = Math.max(...SEA_TUBES.map((p) => p.y)) + 20;
    for (let t = t0; t < t0 + 6 * 3600_000; t += 17_000)
      for (const s of shipsAt(t)) {
        expect(s.pass.y).toBeGreaterThan(tubeMax);
        expect(s.pass.y).toBeLessThan(SEA_HEIGHT);
        expect(s.pass.y).toBeGreaterThan(SEA_JET_MIN_Y);
        expect(s.pass.y).toBeGreaterThan(TIDE_LOW_Y);
      }
  });
  it("가로지르는 데 3~4분 남짓, 한 번에 두 척 넘게 겹치지 않아요", () => {
    const t0 = Date.UTC(2026, 10, 16, 0, 0, 0);
    for (let t = t0; t < t0 + 6 * 3600_000; t += 13_000) expect(shipsAt(t).length).toBeLessThanOrEqual(2);
    const p = [...Array(50)].map((_, i) => shipPassOf(i)).find((q) => q && q.kind !== "fishing")!;
    const span = (SEA_WIDTH + 160) / p.speed;
    expect(span).toBeGreaterThan(150);
    expect(span).toBeLessThan(260);
  });
  it("오징어잡이배 3~4척, 먼바다 띠 안에서 서로 떨어져요", () => {
    const t0 = Date.UTC(2026, 10, 16, 12, 0, 0);
    for (let t = t0; t < t0 + 8 * 3600_000; t += 60_000) {
      const b = squidBoatsAt(t);
      expect(b.length).toBe(squidCount(t));
      expect(b.length).toBeGreaterThanOrEqual(3);
      for (const q of b) {
        expect(q.y).toBeGreaterThan(SHIP_LANE_Y0 - 30);
        expect(q.y).toBeLessThan(SEA_HEIGHT);
        expect(q.x).toBeGreaterThan(0);
        expect(q.x).toBeLessThan(SEA_WIDTH);
      }
      for (let a = 0; a < b.length; a++) for (let c = a + 1; c < b.length; c++) expect(Math.abs(b[a].x - b[c].x)).toBeGreaterThan(40);
    }
  });
});
