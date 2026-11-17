import { describe, expect, it } from "vitest";
import { CAMP_FIRE, CAMP_STREAM_HALF_W, campStreamX } from "@tomb/protocol";
import { campGroundPixels, CAMP_CHUNK } from "./campArt";
import { campGroundKind } from "./campLayout";
import { CAMP_MINIMAP_H, CAMP_MINIMAP_W, CAMP_WINTER_PALETTE, campMinimapPixels } from "./campMinimap";
import { campMeltAt, campWinterGroundColor, snowDriftArt } from "./campWinter";

// 11/17 캠핑장 겨울·크리스마스 판 바닥 (campWinter): 겉모습만 바뀌고 바닥 종류·배치는 그대로
const lum = (c: number) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

describe("camp winter ground", () => {
  it("계곡은 물가만 얼고(밝은 얼음·눈) 가운데는 흐른다(짙은 물)", () => {
    let iceEdge = 0;
    let iceMid = 0;
    let n = 0;
    for (let y = 20; y < 780; y += 3) {
      const cx = Math.round(campStreamX(y));
      if (campGroundKind(cx, y) !== "water") continue;
      n++;
      if (lum(campWinterGroundColor(cx, y, "water", 0x3a7a8e, false)) > 170) iceMid++;
      const ex = Math.round(campStreamX(y) + CAMP_STREAM_HALF_W * 0.95);
      if (lum(campWinterGroundColor(ex, y, "water", 0x6cb4c0, false)) > 170) iceEdge++;
    }
    expect(n).toBeGreaterThan(100);
    expect(iceMid).toBe(0);
    expect(iceEdge / n).toBeGreaterThan(0.9);
  });

  it("숲 바닥은 눈밭(밝게), 모닥불 둘레는 녹은 젖은 땅(어둡게)", () => {
    expect(campMeltAt(CAMP_FIRE.x, CAMP_FIRE.y + 30)).toBe(1);
    expect(campMeltAt(200, 300)).toBe(0);
    let snow = 0;
    let wet = 0;
    for (let i = 0; i < 200; i++) {
      snow += lum(campWinterGroundColor(60 + i, 120, "grass", 0x8a8642, false));
      wet += lum(campWinterGroundColor(CAMP_FIRE.x - 50 + (i % 100), CAMP_FIRE.y + 30, "plaza", 0xb49a6e, false));
    }
    expect(snow / 200).toBeGreaterThan(190);
    expect(wet / 200).toBeLessThan(110);
  });

  it("흙길 가운데는 진흙빛, 가장자리는 눈둑", () => {
    const mud = lum(campWinterGroundColor(700, 780, "path", 0xa88a5e, false, -8));
    const bank = lum(campWinterGroundColor(700, 780, "path", 0xa88a5e, false, 0));
    expect(mud).toBeLessThan(150);
    expect(bank).toBeGreaterThan(190);
  });

  it("겨울 바닥 덩어리는 가을 바닥보다 밝다 (눈) — 크기는 같다", () => {
    const a = campGroundPixels(0, 0, CAMP_CHUNK);
    const b = campGroundPixels(0, 0, CAMP_CHUNK, true);
    expect(b.length).toBe(a.length);
    let la = 0;
    let lb = 0;
    for (let i = 0; i < a.length; i += 4 * 97) {
      la += 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2];
      lb += 0.3 * b[i] + 0.59 * b[i + 1] + 0.11 * b[i + 2];
    }
    expect(lb).toBeGreaterThan(la * 1.4);
  });

  it("눈 더미 그림 (낙엽 무더기 자리)", () => {
    for (let v = 0; v < 3; v++) {
      const g = snowDriftArt(v);
      expect(g.w).toBe(16);
      expect(g.px.some((p) => (p & 255) > 0)).toBe(true);
    }
  });
});

describe("camp winter minimap palette", () => {
  it("캠핑장 미니맵 바탕의 모든 색에 겨울 색이 정해져 있다", () => {
    const px = campMinimapPixels();
    const seen = new Set<number>();
    for (let i = 0; i < CAMP_MINIMAP_W * CAMP_MINIMAP_H * 4; i += 4) seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    for (const c of seen) expect(CAMP_WINTER_PALETTE.has(c), c.toString(16)).toBe(true);
  });
});
