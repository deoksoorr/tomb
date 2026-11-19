import { describe, expect, it } from "vitest";
import { STAND_GAP, standUpSpot } from "./standUp";

// 집 안 자리에서 일어나 설 자리

const pre = { x: 64, y: 122 };
const bed = { x: 64, y: 102 };
const open = () => false;
const far = (p: { x: number; y: number }, list: { x: number; y: number }[]) => list.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= STAND_GAP);

describe("일어나 설 자리", () => {
  it("앉기 전 자리가 비어 있으면 그대로", () => {
    expect(standUpSpot(pre, bed, [], open)).toEqual(pre);
    expect(standUpSpot(pre, bed, [{ x: 200, y: 200 }], open)).toEqual(pre);
  });

  it("앉기 전 자리에 다른 사람이 서 있으면 겹치지 않는 가까운 빈 칸 (가구 앞쪽 = 아래 먼저)", () => {
    const b = { x: 64, y: 122 };
    const s = standUpSpot(pre, bed, [b], open);
    expect(far(s, [b])).toBe(true);
    expect(s).toEqual({ x: 64, y: 134 });
  });

  it("벽·가구에 막힌 칸은 건너뛴다 (가구를 옮겨 앉기 전 자리가 가구 안이 됐을 때도)", () => {
    // 앉기 전 자리와 그 아래가 막혔다 → 옆 칸
    const blocked = (x: number, y: number) => x === 64 && y >= 122;
    const s = standUpSpot(pre, bed, [], blocked);
    expect(blocked(s.x, s.y)).toBe(false);
    expect(s).toEqual({ x: 52, y: 122 });
  });

  it("둘레가 사람으로 꽉 찼으면 가구 앞쪽 둘레에서 찾는다", () => {
    const crowd = [-24, -12, 0, 12, 24].flatMap((dx) => [-12, 0, 12, 24].map((dy) => ({ x: pre.x + dx, y: pre.y + dy })));
    const s = standUpSpot(pre, { x: 140, y: 60 }, crowd, open);
    expect(far(s, crowd)).toBe(true);
  });

  it("빈 칸이 없으면 겹쳐도 걸을 수 있는 칸, 다 막혔으면 앉기 전 자리", () => {
    const everyone = Array.from({ length: 40 }, (_, i) => ({ x: (i % 8) * 12 + 20, y: Math.floor(i / 8) * 12 + 90 }));
    const s = standUpSpot(pre, bed, everyone, (x) => x !== 64);
    expect(s.x).toBe(64);
    expect(standUpSpot(pre, bed, [], () => true)).toEqual(pre);
  });
});
