import { describe, expect, it } from "vitest";
import { STAFF_SHINE_FRAMES, staffPlateGrid, staffPlateLayout, staffShineGrid } from "./staffPlate";

// 11/15 운영자 이름표 판: 글자 상자는 언제나 판 몸통 안(불투명한 바탕 위), 장식은 판 밖으로 너무 넓게 나가지 않고, 빛줄기는 판 크기 프레임으로

const alphaAt = (g: { w: number; px: Uint32Array }, x: number, y: number) => g.px[y * g.w + x] & 255;

describe("운영자 이름표 판", () => {
  it.each([
    [12, 10],
    [48, 12],
    [132, 11],
  ])("글자 %ipx×%ipx: 글자 상자 전체가 거의 불투명한 판 바탕 위", (tw, th) => {
    const L = staffPlateLayout(tw, th);
    const g = staffPlateGrid(tw, th);
    expect(g.w).toBe(L.w);
    expect(g.h).toBe(L.h);
    for (let y = L.inkY; y < L.inkY + th; y++)
      for (let x = L.inkX; x < L.inkX + tw; x++) expect(alphaAt(g, x, y)).toBeGreaterThanOrEqual(230);
    // 판은 글자보다 양옆 16px·위아래 14px 안쪽으로만 커진다 (근처 사람을 많이 가리지 않게)
    expect(L.w - tw).toBeLessThanOrEqual(32);
    expect(L.h - th).toBeLessThanOrEqual(14);
  });

  it("위 가운데 금관이 판 꼭대기에 있다 (맨 윗줄은 외곽선뿐)", () => {
    const L = staffPlateLayout(48, 12);
    const g = staffPlateGrid(48, 12);
    const cx = Math.floor((L.left + L.right + 1) / 2);
    expect([-1, 0, 1].some((d) => alphaAt(g, cx + d, 1) === 255)).toBe(true);
    expect(alphaAt(g, 2, 0)).toBe(0);
  });

  it("빛줄기: 판 크기 프레임 STAFF_SHINE_FRAMES장, 판 밖에는 칠하지 않는다", () => {
    const L = staffPlateLayout(40, 10);
    const base = staffPlateGrid(40, 10);
    const s = staffShineGrid(40, 10);
    expect(s.w).toBe(L.w * STAFF_SHINE_FRAMES);
    expect(s.h).toBe(L.h);
    let lit = 0;
    for (let f = 0; f < STAFF_SHINE_FRAMES; f++)
      for (let y = 0; y < L.h; y++)
        for (let x = 0; x < L.w; x++) {
          if (!alphaAt(s, f * L.w + x, y)) continue;
          lit++;
          expect(alphaAt(base, x, y)).toBeGreaterThan(0);
        }
    expect(lit).toBeGreaterThan(0);
  });
});
