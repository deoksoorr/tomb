import { BOATS, boatKind, DIR, DUCK_DOCK, FERRY_DOCK, type DirId } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { boatHull, hullBlocks, seatDelta } from "../logic/boat";
import { boatGeom, duckGeom } from "../sprites/rideProps";
import { inWater, type Rect } from "./layout";

// 11/16 매어 둔·떠 있는 배를 헤엄쳐 뚫고 지나가지 않게: 몸통 바닥 상자(boatHull)와 막는 조건(hullBlocks)

const DIRS: readonly DirId[] = [DIR.down, DIR.left, DIR.right, DIR.up];
const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const rectDist = (r: Rect, x: number, y: number) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

describe("boatHull — 배 몸통 바닥 (방향별)", () => {
  it("모든 배·네 방향: 두 자리를 다 덮고, 그림 프레임 안에 든다", () => {
    for (const b of BOATS) {
      for (const dir of DIRS) {
        const r = boatHull(b, dir, b.x, b.y);
        expect(r.w).toBeGreaterThan(8);
        expect(r.h).toBeGreaterThan(8);
        expect(inside(r, b.x, b.y - 1)).toBe(true);
        if (b.seats === 2) {
          const o = seatDelta(b, dir);
          expect(inside(r, b.x + o.dx, b.y + o.dy - 1)).toBe(true);
        }
        const g = boatKind(b) === "duck" ? duckGeom(dir) : boatGeom(b.seats, dir);
        const fx = b.x - g.ax - 0.5;
        const fy = b.y - g.ay;
        expect(r.x).toBeGreaterThanOrEqual(fx);
        expect(r.x + r.w).toBeLessThanOrEqual(fx + g.w);
        expect(r.y).toBeGreaterThanOrEqual(fy);
        expect(r.y + r.h).toBeLessThanOrEqual(fy + g.h);
      }
    }
  });

  it("조각배 옆모습은 가로로, 앞·뒷모습은 세로로 길다. 2인승이 1인승보다 길다", () => {
    const one = BOATS.find((b) => boatKind(b) === "row" && b.seats === 1)!;
    const two = BOATS.find((b) => boatKind(b) === "row" && b.seats === 2)!;
    for (const b of [one, two]) {
      const side = boatHull(b, DIR.right, 0, 0);
      const fore = boatHull(b, DIR.down, 0, 0);
      expect(side.w).toBeGreaterThan(side.h);
      expect(fore.h).toBeGreaterThan(fore.w);
    }
    expect(boatHull(two, DIR.left, 0, 0).w).toBeGreaterThan(boatHull(one, DIR.left, 0, 0).w);
    expect(boatHull(two, DIR.up, 0, 0).h).toBeGreaterThan(boatHull(one, DIR.up, 0, 0).h);
    // 뱃머리가 왼쪽이면 고물(2인승 뒷자리)이 오른쪽으로
    expect(boatHull(two, DIR.left, 0, 0).x + boatHull(two, DIR.left, 0, 0).w).toBeGreaterThan(20);
    expect(boatHull(two, DIR.right, 0, 0).x).toBeLessThan(-20);
  });

  it("상자는 배 자리를 따라간다 (내린 자리에 떠 있는 배·타고 가는 배)", () => {
    const b = BOATS[0];
    const a = boatHull(b, DIR.right, 100, 200);
    const c = boatHull(b, DIR.right, 130, 180);
    expect(c.x - a.x).toBe(30);
    expect(c.y - a.y).toBe(-20);
  });

  it("매어 둔 배는 물 위에 있고, 타는 곳(나루터·선착장 판자 끝)은 상자 밖이라 타기는 그대로", () => {
    for (const b of BOATS) {
      const r = boatHull(b, b.facing, b.x, b.y);
      expect(inWater(r.x + r.w / 2, r.y + r.h / 2)).toBe(true);
      const dock = boatKind(b) === "duck" ? DUCK_DOCK : FERRY_DOCK;
      expect(rectDist(r, dock.x, dock.y)).toBeGreaterThan(4);
    }
  });
});

describe("hullBlocks — 누구를 막나", () => {
  it("헤엄·잠수 중이고 배에 타 있지 않을 때만, 보이는 배만", () => {
    expect(hullBlocks({ inWater: true, boatSeatId: null }, true)).toBe(true);
    expect(hullBlocks({ inWater: false, boatSeatId: null }, true)).toBe(false); // 걷기(판자·둑)
    expect(hullBlocks({ inWater: true, boatSeatId: null }, false)).toBe(false); // 나루터로 돌아가며 사라지는 중
    expect(hullBlocks({ inWater: false, boatSeatId: "b_1206_850" }, true)).toBe(false); // 배에 탄 사람 (내 배·남의 배 모두)
    expect(hullBlocks({ inWater: true, boatSeatId: "b_1206_850" }, true)).toBe(false);
  });
});
