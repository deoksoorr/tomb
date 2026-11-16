import { describe, expect, it } from "vitest";
import { seatSlotIn } from "./camp";
import { MAX_VALID_SPEED, WALK_SPEED } from "./constants";
import {
  SEA_HEIGHT,
  SEA_JET_MIN_Y,
  SEA_JETSKI_SPEED,
  SEA_JETSKIS,
  SEA_PIER_END,
  SEA_RIDES,
  SEA_TUBE_SPEED,
  SEA_TUBES,
  SEA_WIDTH,
  TIDE_LOW_Y,
  seaJetWater,
  seaRideBlocked,
  seaRideById,
  seaTubeDriftAt,
  seaTubeWater,
} from "./sea";
import { STATE } from "./types";

// 11/16 r13 바다 놀거리 (튜브·제트스키)
describe("sea rides", () => {
  it("빈 튜브는 하루 내내 어느 물때에도 물 위·맵 안에서 떠다니고 아무것에도 닿지 않아요", () => {
    const day = 24 * 3600_000;
    for (let i = 0; i < SEA_TUBES.length; i++)
      for (let t = 0; t < day; t += 37_000)
        for (const level of [0, 0.3, 0.7, 1]) {
          const p = seaTubeDriftAt(i, t, level);
          expect(seaTubeWater(p.x, p.y, level), `tube ${i} t ${t} level ${level} (${p.x},${p.y})`).toBe(true);
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(SEA_WIDTH);
          expect(p.y).toBeLessThan(SEA_HEIGHT);
        }
  });
  it("튜브끼리 떨어져 있어요 (같은 시각)", () => {
    for (let t = 0; t < 600_000; t += 10_000)
      for (let a = 0; a < SEA_TUBES.length; a++)
        for (let b = a + 1; b < SEA_TUBES.length; b++) {
          const p = seaTubeDriftAt(a, t, 0.5);
          const q = seaTubeDriftAt(b, t, 0.5);
          expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(30);
        }
  });
  it("제트스키는 깊은 물만: 간조 물가보다 바깥, 매어 둔 자리는 다닐 수 있는 물이고 선착장 끝 데크 바로 아래", () => {
    expect(SEA_JET_MIN_Y).toBeGreaterThan(TIDE_LOW_Y);
    for (const j of SEA_JETSKIS) {
      expect(seaJetWater(j.x, j.y), `${j.x},${j.y}`).toBe(true);
      // 선착장 끝 데크 동쪽 가장자리 바로 옆 (데크에서 타요)
      expect(j.x - (SEA_PIER_END.x + SEA_PIER_END.w)).toBeLessThan(30);
      expect(j.y).toBeGreaterThan(SEA_PIER_END.y);
      expect(j.y).toBeLessThan(SEA_PIER_END.y + SEA_PIER_END.h + 10);
    }
    expect(seaJetWater(400, SEA_JET_MIN_Y - 1)).toBe(false);
    expect(seaJetWater(400, 820)).toBe(true);
    // 선착장 끝·방파제·바위에는 못 들어가요
    expect(seaJetWater(SEA_PIER_END.x + 20, SEA_PIER_END.y + 20)).toBe(false);
    expect(seaRideBlocked(1184, 690)).toBe(true);
    expect(seaRideBlocked(1340, 660)).toBe(true);
  });
  it("속도: 튜브는 걷기보다 느리고, 제트스키는 조각배(46)의 두 배 — 둘 다 서버 속도 검증 안", () => {
    expect(SEA_TUBE_SPEED).toBeLessThan(WALK_SPEED);
    expect(SEA_JETSKI_SPEED).toBe(46 * 2);
    expect(SEA_JETSKI_SPEED).toBeLessThan(MAX_VALID_SPEED);
  });
  it("서버 좌석: 조각배처럼 움직이는 자리(상태 boat), 튜브는 떠다니는 자리(탄 곳 그대로)", () => {
    expect(SEA_RIDES.map((r) => r.id)).toEqual(["pU1", "pU2", "pU3", "pU4", "pU5", "pJ1", "pJ2"]);
    for (const r of SEA_RIDES) {
      const s = seatSlotIn("sea", r.id)!;
      expect(s).toMatchObject({ kind: "boat", state: STATE.boat, mobile: true, furnitureId: r.id });
      expect(!!s.drift).toBe(r.kind === "tube");
      expect(seaRideById(r.id)).toBe(r);
      expect(seatSlotIn("village", r.id)).toBeUndefined();
    }
  });
});
