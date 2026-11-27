import { describe, expect, it } from "vitest";
import { CX_ENTER_SPEED, cxDetour, cxEnterAt, cxEnterBlocked, cxEnterDepth, cxEnterSeg, cxWalkRoute, type CxEnterStep } from "./types";

// 11/27 드나드는 길 (벙커 침대 사다리): 길 위 자리·시간, 다른 사람 깊이 구간, 가구 둘레로 돌아가기

const PATH: CxEnterStep[] = [
  { x: 0, y: 100 },
  { x: 0, y: 40 },
  { x: 0, y: 4, climb: true },
];

describe("cxEnterAt — 길 위 자리", () => {
  it("걷기 구간은 걷기 속도, 사다리 구간은 사다리 속도로 지나고 끝에서 done", () => {
    const walkMs = (60 / CX_ENTER_SPEED.walk) * 1000;
    const climbMs = (36 / CX_ENTER_SPEED.climb) * 1000;
    expect(cxEnterAt(PATH, 0)).toMatchObject({ x: 0, y: 100, climb: false, done: false });
    expect(cxEnterAt(PATH, walkMs / 2).y).toBeCloseTo(70);
    const mid = cxEnterAt(PATH, walkMs + climbMs / 2);
    expect(mid.y).toBeCloseTo(22);
    expect(mid).toMatchObject({ climb: true, dy: -1, done: false });
    expect(cxEnterAt(PATH, walkMs + climbMs + 1)).toMatchObject({ x: 0, y: 4, done: true, dx: 0, dy: 0 });
  });
});

describe("cxEnterDepth · cxEnterSeg — 깊이 구간", () => {
  it("사다리·front는 가구 앞, behind는 가구 뒤, 표시 없으면 평소 깊이(null)", () => {
    expect(cxEnterDepth({ climb: true }, 10, 50)).toBe(50.5);
    expect(cxEnterDepth({ front: true }, 60, 50)).toBe(60);
    expect(cxEnterDepth({ behind: true }, 10, 50)).toBe(10);
    expect(cxEnterDepth({ behind: true }, 70, 50)).toBe(49.5);
    expect(cxEnterDepth({}, 10, 50)).toBeNull();
  });
  it("길 선분 가까이(2.5px)만 그 구간", () => {
    expect(cxEnterSeg(PATH, 1, 20)?.climb).toBe(true);
    expect(cxEnterSeg(PATH, 0, 70)?.climb).toBeFalsy();
    expect(cxEnterSeg(PATH, 6, 20)).toBeNull();
  });
});

describe("cxDetour — 가구 둘레로 돌아가기", () => {
  const box = { x0: 0, y0: 0, x1: 40, y1: 60 };
  const crossesBox = (pts: { x: number; y: number }[]) =>
    pts.some((p, i) => {
      if (!i) return false;
      const a = pts[i - 1];
      for (let k = 0; k <= 20; k++) {
        const x = a.x + ((p.x - a.x) * k) / 20;
        const y = a.y + ((p.y - a.y) * k) / 20;
        if (x > box.x0 + 0.5 && x < box.x1 - 0.5 && y > box.y0 + 0.5 && y < box.y1 - 0.5) return true;
      }
      return false;
    });
  it("가로지르지 않으면 그대로", () => {
    expect(cxDetour({ x: 10, y: 70 }, { x: 30, y: 60 }, box)).toEqual([]);
  });
  it("아래에서 위쪽 먼 끝으로 가면 가까운 모서리로 돌아간다 (가구를 가로지르지 않는다)", () => {
    const a = { x: 30, y: 70 };
    const b = { x: 25, y: -4 };
    const via = cxDetour(a, b, box);
    expect(via.length).toBeGreaterThan(0);
    expect(crossesBox([a, ...via, b])).toBe(false);
    expect(via[0]).toEqual({ x: 40, y: 60 });
  });
  it("안에서 출발하면 가까운 테두리로 먼저 나간다", () => {
    const via = cxDetour({ x: 38, y: 30 }, { x: -6, y: 30 }, box);
    expect(via[0]).toEqual({ x: 40, y: 30 });
    expect(crossesBox([{ x: 40, y: 30 }, ...via.slice(1), { x: -6, y: 30 }])).toBe(false);
  });
});

describe("cxWalkRoute · cxEnterBlocked — 막힌 칸 피하기", () => {
  // 방 0..160 × 0..100, 가운데 막힌 상자 (60..100 × 0..70)
  const wall = (x: number, y: number) => x < 4 || x > 156 || y < 5 || y > 100 || (x + 4 > 60 && x - 4 < 100 && y > 0 && y - 5 < 70);
  const limit = { x0: 0, y0: 0, x1: 160, y1: 100 };
  it("막힌 상자를 돌아가는 길 (모든 점·사이가 빈 칸), 곧게 가면 한 점", () => {
    const r = cxWalkRoute({ x: 30, y: 30 }, { x: 130, y: 30 }, wall, limit)!;
    expect(r).not.toBeNull();
    expect(r[r.length - 1]).toEqual({ x: 130, y: 30 });
    const pts = [{ x: 30, y: 30 }, ...r];
    for (let i = 1; i < pts.length; i++)
      for (let k = 0; k <= 20; k++) expect(wall(pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * k) / 20, pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * k) / 20)).toBe(false);
    expect(cxWalkRoute({ x: 30, y: 90 }, { x: 130, y: 90 }, wall, limit)).toEqual([{ x: 130, y: 90 }]);
  });
  it("도착 점이 막혔거나 갈 수 없으면 null", () => {
    expect(cxWalkRoute({ x: 30, y: 30 }, { x: 80, y: 30 }, wall, limit)).toBeNull();
    const closed = (x: number, y: number) => wall(x, y) || (x > 40 && x < 120 && y > 0);
    expect(cxWalkRoute({ x: 20, y: 50 }, { x: 140, y: 50 }, closed, limit)).toBeNull();
  });
  it("길이 벽·다른 가구에 막히면 막힘 (그 가구 칸 안과 사다리 구간은 보지 않는다)", () => {
    const own = { x0: 60, y0: 0, x1: 100, y1: 70 };
    const path: CxEnterStep[] = [
      { x: 80, y: 76 },
      { x: 80, y: 69 },
      { x: 80, y: 10, climb: true },
    ];
    expect(cxEnterBlocked(path, wall, own)).toBe(false);
    expect(cxEnterBlocked([{ x: 80, y: -4 }, { x: 80, y: -24, climb: true }], wall, own)).toBe(true);
    expect(cxEnterBlocked(path, (x, y) => wall(x, y) || (y > 72 && x > 70 && x < 90), own)).toBe(true);
  });
});
