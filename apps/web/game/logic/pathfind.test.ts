import { describe, expect, it } from "vitest";
import { AutoWalk, NEAR_ENOUGH, RUN_OVER, STUCK_MS } from "./autoWalk";
import { buildGrid, findPath, lineOfSight, nearestOpen, type Pt, type Rect, type WalkGrid } from "./pathfind";
import type { MoveInput } from "./movement";

const W = 320;
const H = 240;
const CELL = 8;

/** 경로의 모든 구간이 막힌 칸을 지나지 않는지 */
function clear(g: WalkGrid, from: Pt, path: Pt[]): boolean {
  let prev = from;
  for (const p of path) {
    if (!lineOfSight(g, prev, p)) return false;
    prev = p;
  }
  return true;
}

describe("buildGrid", () => {
  it("사각형(넓힌 만큼)과 extraBlocked를 막는다", () => {
    const g = buildGrid(W, H, CELL, [{ x: 100, y: 100, w: 16, h: 16 }], { pad: { l: 4, r: 4, t: 0, b: 4 }, extraBlocked: (x) => x > 300 });
    expect(g.blocked(13, 13)).toBe(true); // 가운데 (108,108)
    expect(g.blocked(12, 12)).toBe(true); // (100,100) 가장자리
    expect(g.blocked(11, 13)).toBe(false); // (92,108): 왼쪽 여유 4px 밖
    expect(g.blocked(38, 5)).toBe(true); // x=308 > 300
    expect(g.blocked(-1, 0)).toBe(true); // 격자 밖
    expect(g.blocked(0, 30)).toBe(true);
  });

  it("격자 원점(ox, oy)을 반영한다", () => {
    const g = buildGrid(80, 80, CELL, [{ x: 40, y: 40, w: 8, h: 8 }], { ox: 32, oy: 32 });
    expect(g.blocked(1, 1)).toBe(true); // 가운데 (44,44)
    expect(g.blocked(0, 0)).toBe(false);
  });

  it("nearestOpen은 막힌 칸이면 가장 가까운 빈 칸", () => {
    const g = buildGrid(W, H, CELL, [{ x: 96, y: 96, w: 24, h: 24 }]);
    expect(nearestOpen(g, 5, 5)).toEqual([5, 5]);
    const n = nearestOpen(g, 13, 13)!;
    expect(g.blocked(n[0], n[1])).toBe(false);
    expect(Math.max(Math.abs(n[0] - 13), Math.abs(n[1] - 13))).toBe(2);
  });
});

describe("findPath", () => {
  const wall: Rect = { x: 152, y: 0, w: 16, h: 200 }; // 아래쪽만 열린 세로 담
  const g = buildGrid(W, H, CELL, [wall]);

  it("담을 돌아서 간다 (막힌 칸을 지나지 않고, 끝은 정확히 목표)", () => {
    const from = { x: 60, y: 40 };
    const to = { x: 260, y: 40 };
    const path = findPath(g, from, to)!;
    expect(path).not.toBeNull();
    expect(path.at(-1)).toEqual(to);
    expect(clear(g, from, path)).toBe(true);
    // 담 아래(y > 200)로 돌아간다
    expect(path.some((p) => p.y > 200)).toBe(true);
  });

  it("트인 곳은 곧게 편다 (웨이포인트 1개)", () => {
    expect(findPath(g, { x: 20, y: 20 }, { x: 120, y: 150 })).toEqual([{ x: 120, y: 150 }]);
  });

  it("길이 없으면 null", () => {
    const closed = buildGrid(W, H, CELL, [{ x: 152, y: 0, w: 16, h: H }]);
    expect(findPath(closed, { x: 60, y: 40 }, { x: 260, y: 40 })).toBeNull();
  });

  it("목표가 막힌 칸이면 가장 가까운 빈 칸까지", () => {
    const box = buildGrid(W, H, CELL, [{ x: 200, y: 100, w: 32, h: 32 }]);
    const path = findPath(box, { x: 20, y: 20 }, { x: 216, y: 116 })!;
    const end = path.at(-1)!;
    expect(box.blocked(Math.floor(end.x / CELL), Math.floor(end.y / CELL))).toBe(false);
    expect(Math.hypot(end.x - 216, end.y - 116)).toBeLessThan(32);
  });

  it("모서리를 대각선으로 깎지 않는다", () => {
    // 두 막힌 칸이 대각선으로 맞닿은 틈은 지나갈 수 없다
    const diag: WalkGrid = {
      cols: 3,
      rows: 3,
      cell: CELL,
      ox: 0,
      oy: 0,
      blocked: (cx, cy) => cx < 0 || cy < 0 || cx > 2 || cy > 2 || (cx === 1 && cy === 0) || (cx === 0 && cy === 1),
    };
    const p = findPath(diag, { x: 4, y: 4 }, { x: 20, y: 20 }, { smooth: false, snapRadius: 0 });
    expect(p).toBeNull();
  });

  it("탐색 한도를 넘으면 null", () => {
    expect(findPath(g, { x: 60, y: 40 }, { x: 260, y: 40 }, { maxNodes: 5 })).toBeNull();
  });
});

describe("AutoWalk", () => {
  const g = buildGrid(W, H, CELL, [{ x: 152, y: 0, w: 16, h: 200 }]);
  const move = (): MoveInput => ({ ax: 0, ay: 0, run: false });

  it("가까우면 걷지 않는다", () => {
    const w = new AutoWalk();
    expect(w.start("g", { x: 100, y: 100 }, { x: 100 + NEAR_ENOUGH - 1, y: 100 }, { x: 0, y: 0 }, g, 0)).toBe("near");
    expect(w.active).toBe(false);
  });

  it("따라가면 도착한다 (먼 길은 달리고, 가까워지면 걷는다)", () => {
    const w = new AutoWalk();
    const pos = { x: 60, y: 40 };
    expect(w.start("g", pos, { x: 260, y: 40 }, { x: 260, y: 20 }, g, 0)).toBe("started");
    const out = move();
    let t = 0;
    let ranAtStart = false;
    let last = "walking";
    for (let i = 0; i < 2000 && last === "walking"; i++) {
      last = w.steer(pos, t, out);
      if (i === 0) ranAtStart = out.run;
      const speed = out.run ? 100 : 56;
      pos.x += out.ax * speed * 0.016;
      pos.y += out.ay * speed * 0.016;
      t += 16;
    }
    expect(last).toBe("arrived");
    expect(ranAtStart).toBe(RUN_OVER < 400);
    expect(Math.hypot(pos.x - 260, pos.y - 40)).toBeLessThan(4);
    expect(w.active).toBe(false);
  });

  it("움직이지 못하면 stuck, 길을 다시 찾는 건 한 번만", () => {
    const w = new AutoWalk();
    const pos = { x: 60, y: 40 };
    w.start("g", pos, { x: 260, y: 40 }, pos, g, 0);
    const out = move();
    expect(w.steer(pos, 0, out)).toBe("walking");
    expect(w.steer(pos, STUCK_MS + 1, out)).toBe("stuck");
    expect(w.repath(pos, g, STUCK_MS + 1)).toBe(true);
    expect(w.steer(pos, STUCK_MS + 2, out)).toBe("walking");
    expect(w.repath(pos, g, STUCK_MS * 3)).toBe(false);
  });

  it("cancel하면 더 움직이지 않는다", () => {
    const w = new AutoWalk();
    w.start("g", { x: 60, y: 40 }, { x: 260, y: 40 }, { x: 0, y: 0 }, g, 0);
    w.cancel();
    const out = move();
    expect(w.steer({ x: 60, y: 40 }, 10, out)).toBe("idle");
    expect(w.target).toBeNull();
  });
});
