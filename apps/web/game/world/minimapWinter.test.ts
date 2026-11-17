import { describe, expect, it } from "vitest";
import { seaMinimapPixels, SEA_MINIMAP_H, SEA_MINIMAP_W } from "../sea/seaMinimap";
import { SEA_WINTER_PALETTE, winterizeMinimap, winterMinimapColor } from "./minimapWinter";

// 11/17 마을 밖 맵 미니맵 겨울 색 (캠핑장·바닷가 공용)
const lum = (c: number) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
const px = (...cs: number[]) => {
  const a = new Uint8ClampedArray(cs.length * 4);
  cs.forEach((c, i) => a.set([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255], i * 4));
  return a;
};

describe("winterizeMinimap", () => {
  it("정해 둔 색은 그 색으로, 원본은 그대로", () => {
    const src = px(0x112233, 0x7e8a4a);
    const out = winterizeMinimap(src, new Map([[0x112233, 0xabcdef]]));
    expect([out[0], out[1], out[2], out[3]]).toEqual([0xab, 0xcd, 0xef, 255]);
    expect([src[0], src[1], src[2]]).toEqual([0x11, 0x22, 0x33]);
  });

  it("짐작: 풀은 눈밭, 물은 파란 채로, 짙은 숲은 짙게", () => {
    expect(lum(winterMinimapColor(0x7e8a4a))).toBeGreaterThan(200);
    const sea = winterMinimapColor(0x2e6a8c);
    expect(sea & 255).toBeGreaterThan((sea >> 16) & 255);
    expect(lum(winterMinimapColor(0x3e5a34))).toBeLessThan(110);
  });

  it("바닷가 바탕도 같은 함수로 겨울 색이 된다 (바다는 얼지 않는다)", () => {
    const src = seaMinimapPixels();
    const out = winterizeMinimap(src, SEA_WINTER_PALETTE);
    expect(out.length).toBe(SEA_MINIMAP_W * SEA_MINIMAP_H * 4);
    // 맨 아래 줄 가운데는 먼바다 → 여전히 파랗다
    const i = ((SEA_MINIMAP_H - 1) * SEA_MINIMAP_W + Math.floor(SEA_MINIMAP_W / 2)) * 4;
    expect(out[i + 2]).toBeGreaterThan(out[i]);
    let la = 0;
    let lb = 0;
    for (let k = 0; k < src.length; k += 4) {
      la += 0.3 * src[k] + 0.59 * src[k + 1] + 0.11 * src[k + 2];
      lb += 0.3 * out[k] + 0.59 * out[k + 1] + 0.11 * out[k + 2];
    }
    expect(lb).toBeGreaterThan(la);
  });
});
