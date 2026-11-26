import { describe, expect, it } from "vitest";
import { CAMP_PLUNGE_ZONE, CAMP_POOL_ROCKS, CAMP_STONES_Y, MAX_VALID_SPEED, RUN_SPEED, campStreamX, campWet, inCampPlunge } from "@tomb/protocol";
import { campCurrent, FALLS_VIEW_CENTER, fallsZoom, nearRowDock, PLUNGE_PUSH, stepRow, STREAM_FLOW } from "./campWater";
import { campFallsViewSeat, CAMP_ROWBOATS, campRowboatWater } from "@tomb/protocol";

// 11/26 캠핑장 물살·폭포 멍·나룻배 (순수 계산)

describe("물살", () => {
  it("폭포 밑은 헤엄 최고 속도보다 세게 바깥(아래·옆)으로 민다 — 서버 속도 검증 안에서", () => {
    const swimMax = RUN_SPEED * 0.6; // entities/Player SWIM_SPEED
    expect(PLUNGE_PUSH[0]).toBeGreaterThan(swimMax);
    expect(PLUNGE_PUSH[1] + swimMax).toBeLessThan(MAX_VALID_SPEED);
    const Z = CAMP_PLUNGE_ZONE;
    for (const [x, y] of [
      [Z.x, Z.y],
      [Z.x - 50, Z.y + 10],
      [Z.x + 60, Z.y + 20],
    ]) {
      expect(inCampPlunge(x, y)).toBe(true);
      const c = campCurrent(x, y);
      expect(Math.hypot(c.vx, c.vy)).toBeGreaterThan(swimMax);
      expect(c.vy).toBeGreaterThan(0); // 절벽 쪽으로는 밀지 않는다
    }
  });
  it("낚시 바위·소 앞쪽은 잔잔하다", () => {
    for (const r of CAMP_POOL_ROCKS) expect(campCurrent(r.x + r.side * 10, r.y)).toEqual({ vx: 0, vy: 0 });
    expect(campCurrent(580, 300)).toEqual({ vx: 0, vy: 0 });
  });
  it("계곡은 아래로 흐르고, 징검다리 위는 물살이 없다", () => {
    const c = campCurrent(campStreamX(500), 500);
    expect(c.vy).toBeGreaterThan(STREAM_FLOW * 0.8);
    expect(campWet(campStreamX(CAMP_STONES_Y), CAMP_STONES_Y)).toBe(false);
    expect(campCurrent(campStreamX(CAMP_STONES_Y), CAMP_STONES_Y)).toEqual({ vx: 0, vy: 0 });
  });
});

describe("폭포 멍", () => {
  it("폭포 다리 의자만 시점을 바꾸고, 줌은 게임 줌 범위 안", () => {
    expect(campFallsViewSeat("qW2-1")).toBe(true);
    expect(campFallsViewSeat("qS1")).toBe(false);
    for (const [w, h] of [
      [1280, 800],
      [390, 844],
    ]) {
      const z = fallsZoom(w, h);
      expect(z).toBeGreaterThanOrEqual(1.5);
      expect(z).toBeLessThanOrEqual(4);
    }
    expect(FALLS_VIEW_CENTER.y).toBeGreaterThan(150);
    expect(FALLS_VIEW_CENTER.y).toBeLessThan(380);
  });
});

describe("나룻배", () => {
  it("매어 둔 자리는 배가 뜨는 물이고 선착장 곁이다", () => {
    for (const b of CAMP_ROWBOATS) {
      expect(campRowboatWater(b.x, b.y)).toBe(true);
      expect(nearRowDock(b.x, b.y)).toBe(true);
    }
  });
  it("노를 저어도 저수지(부표 줄 아래) 밖으로 못 나간다", () => {
    const m = { x: CAMP_ROWBOATS[2].x, y: CAMP_ROWBOATS[2].y, vx: 0, vy: 0 };
    for (let i = 0; i < 400; i++) stepRow(m, 0.3, -1, 50);
    expect(campRowboatWater(m.x, m.y)).toBe(true);
    expect(m.y).toBeGreaterThan(370);
    for (let i = 0; i < 400; i++) stepRow(m, 1, 1, 50);
    expect(campRowboatWater(m.x, m.y)).toBe(true);
  });
});
