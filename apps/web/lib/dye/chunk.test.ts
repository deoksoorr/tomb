import { describe, expect, it } from "vitest";
import { boardRgb, buildBoard, chunkRgba, chunkSpots, DYE_BOARD_H, DYE_BOARD_W, type DyeTier } from "./palette";

// 11/22 판 끊김 개선: 구역 그림(chunkRgba)을 칸마다 boardRgb 대신 이웃 9구역을 한 번만 찾아 계산한다 (~37ms → ~13ms, 일꾼 스레드).
// 그림은 예전과 한 칸도 다르지 않아야 한다 (조준점 색·서버 판정 색과 화면 그림이 같은 판).

const fnv = (a: Uint8ClampedArray) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) {
    h ^= a[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

// 11/22 바꾸기 전 chunkRgba(칸마다 boardRgb)로 만든 값 — 구역 (0,0) · (-1,1)
const GOLDEN: [DyeTier, [string, string]][] = [
  [1, ["8b75b4e4", "cbd4ca13"]],
  [2, ["5bf7ee55", "34117e39"]],
  [3, ["da620b3d", "abc396b"]],
  [4, ["1b93ccfc", "ba11d32d"]],
  [5, ["f7a77c", "4e1d2728"]],
  [6, ["9da9b7b1", "b11cd87f"]],
  [7, ["c6e10e3b", "de5eb9e7"]],
  [8, ["c529e346", "a6532d5d"]],
];

describe("46번 염색 판 구역 그림 (11/22 빠른 계산)", () => {
  it("모든 등급에서 예전 그림과 한 칸도 다르지 않다", () => {
    for (const [tier, [a, b]] of GOLDEN) {
      const board = buildBoard(`golden-${tier}`, tier);
      expect([fnv(chunkRgba(board, 0, 0)), fnv(chunkRgba(board, -1, 1))]).toEqual([a, b]);
    }
  });

  it("구역 그림의 칸 = boardRgb (이음매·음수 구역·특수 색 무리 포함)", () => {
    for (const tier of [3, 8] as const) {
      const b = buildBoard(`seam-${tier}`, tier);
      for (const [i, j] of [
        [0, 0],
        [-2, 3],
      ]) {
        const px = chunkRgba(b, i, j);
        for (let y = 0; y < DYE_BOARD_H; y += 3)
          for (let x = 0; x < DYE_BOARD_W; x += 3) {
            const v = boardRgb(b, i * DYE_BOARD_W + x, j * DYE_BOARD_H + y);
            const o = (y * DYE_BOARD_W + x) * 4;
            expect([px[o], px[o + 1], px[o + 2], px[o + 3]]).toEqual([(v >> 16) & 255, (v >> 8) & 255, v & 255, 255]);
          }
      }
    }
  });

  it("거친 그림(step 8)은 40×25, 칸은 그 묶음 가운데 칸 색", () => {
    const b = buildBoard("low", 2);
    const px = chunkRgba(b, 1, -1, 8);
    expect(px.length).toBe(40 * 25 * 4);
    const v = boardRgb(b, DYE_BOARD_W + 3 * 8 + 4, -DYE_BOARD_H + 2 * 8 + 4);
    const o = (2 * 40 + 3) * 4;
    expect([px[o], px[o + 1], px[o + 2]]).toEqual([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
  });

  it("팔레트 기억 수(cap)를 크게 줘도 그림·무리는 같다", () => {
    const a = buildBoard("cap", 8);
    const b = buildBoard("cap", 8, 160);
    expect(fnv(chunkRgba(a, 2, 2))).toBe(fnv(chunkRgba(b, 2, 2)));
    expect(chunkSpots(a, 2, 2)).toEqual(chunkSpots(b, 2, 2));
  });
});
