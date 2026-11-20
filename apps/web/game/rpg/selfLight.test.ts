import { describe, expect, it, vi } from "vitest";

// 그리기(Phaser)는 쓰지 않는다 — 분위기 층을 구멍 + 사각형 넷으로 나누는 계산만 본다
vi.mock("phaser", () => ({}));
import { holeStrips, type Box } from "./selfLight";

/** 영역의 칸마다 몇 번 칠해지나 (구멍 + 사각형 넷) */
function coverage(area: Box, hole: Box): number[] {
  const cut = holeStrips(area, hole);
  const n = new Array<number>(area.w * area.h).fill(0);
  for (const b of [cut.hole, ...cut.strips])
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        expect(x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h).toBe(true);
        n[(y - area.y) * area.w + (x - area.x)]++;
      }
  return n;
}

describe("holeStrips — 야근 빌딩 분위기 층 (11/20 마스크 대신 조각으로)", () => {
  const area: Box = { x: -20, y: -20, w: 60, h: 50 };

  it("구멍과 사각형 넷이 영역을 빈틈·겹침 없이 한 번씩 덮는다", () => {
    for (const hole of [
      { x: 5, y: 8, w: 12, h: 12 },
      { x: -20, y: -20, w: 12, h: 12 },
      { x: 28, y: 18, w: 12, h: 12 },
    ])
      expect(coverage(area, hole).every((c) => c === 1)).toBe(true);
  });

  it("영역 밖으로 걸친 구멍은 영역 안으로 잘린다 (그래도 한 번씩)", () => {
    const hole = { x: 34, y: -26, w: 12, h: 12 };
    const cut = holeStrips(area, hole);
    expect(cut.hole).toEqual({ x: 34, y: -20, w: 6, h: 6 });
    expect(coverage(area, hole).every((c) => c === 1)).toBe(true);
  });

  it("영역을 아예 벗어난 구멍은 크기 0 — 사각형 넷이 영역 전체를 덮는다", () => {
    const hole = { x: 100, y: 100, w: 12, h: 12 };
    const cut = holeStrips(area, hole);
    expect(cut.hole.w * cut.hole.h).toBe(0);
    expect(coverage(area, hole).every((c) => c === 1)).toBe(true);
  });
});
