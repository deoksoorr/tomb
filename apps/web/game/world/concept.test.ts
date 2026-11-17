import { describe, expect, it } from "vitest";
import { MAP_HEIGHT, MAP_WIDTH, TILE } from "@tomb/protocol";
import { MINIMAP_CELL, MINIMAP_H, MINIMAP_W, minimapPixels } from "./minimapArt";
import { groundKind } from "./layout";

// 11/17 마을 맵 컨셉 (lib/mapConcept): 겉모습만 바뀌고 배치는 그대로

const at = (px: Uint8ClampedArray, x: number, y: number) => {
  const i = (y * MINIMAP_W + x) * 4;
  return (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
};

describe("맵 컨셉 미니맵", () => {
  it("겨울·크리스마스는 같은 눈 덮인 바탕, 기본과는 다르다", () => {
    const base = minimapPixels();
    const winter = minimapPixels("winter");
    const xmas = minimapPixels("christmas");
    expect(winter.length).toBe(base.length);
    expect(xmas).toEqual(winter);
    expect(winter).not.toEqual(base);
  });

  it("풀밭은 밝은 눈빛, 담은 그대로", () => {
    const base = minimapPixels();
    const winter = minimapPixels("winter");
    let grass = 0;
    let wall = 0;
    for (let y = 0; y < MINIMAP_H; y++)
      for (let x = 0; x < MINIMAP_W; x++) {
        const wx = x * MINIMAP_CELL + MINIMAP_CELL / 2;
        const wy = y * MINIMAP_CELL + MINIMAP_CELL / 2;
        if (wx >= MAP_WIDTH || wy >= MAP_HEIGHT) continue;
        const k = groundKind(Math.floor(wx / TILE), Math.floor(wy / TILE));
        const c = at(winter, x, y);
        if (k === "grass" && at(base, x, y) === 0x4c5034) {
          grass++;
          expect((c >> 16) & 255).toBeGreaterThan(180);
        }
        if ((k === "wallTop" || k === "wallFace" || k === "wallSide") && at(base, x, y) === 0x24221f) {
          wall++;
          expect(c).toBe(at(base, x, y));
        }
      }
    expect(grass).toBeGreaterThan(100);
    expect(wall).toBeGreaterThan(10);
  });
});
