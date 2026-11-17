import { describe, expect, it } from "vitest";
import { SEA_FLAT_Y0, SEA_GHOST_BERTH, SEA_SAND_Y0, SEA_WIDTH, TIDE_HIGH_Y } from "@tomb/protocol";
import { seaGroundKind, seaStandable } from "./seaLayout";
import { ICE_BAND_H, ICE_BAND_TEX_H, ICE_BAND_W, iceBandArt, lighthouseSpiral, seaXmasSpots, snowDeck, stringLights, type Img } from "./seaWinterArt";
import { SEA_ICE, SEA_SNOW, seaSnowLineY, seaSnowyGround, seaWinterColor } from "./seaWinterGround";

// 11/17 바닷가 겨울·크리스마스판 순수 그림 조각 (seaWinterGround · seaWinterArt)

const lum = (c: number) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

describe("겨울 바닥", () => {
  it("백사장 눈은 만조 물가보다 위에서 끝나요 (파도 닿는 곳은 젖은 모래)", () => {
    for (let x = 0; x < SEA_WIDTH; x += 7) {
      const y = seaSnowLineY(x);
      expect(y).toBeGreaterThan(SEA_SAND_Y0 + 80);
      expect(y).toBeLessThan(TIDE_HIGH_Y - 40);
    }
  });

  it("풀밭·눈 줄 위 백사장은 밝은 눈, 눈 줄 아래는 눈이 아니에요", () => {
    const grass = seaWinterColor(300, 250, "grass", 0x9cc882);
    expect(lum(grass)).toBeGreaterThan(190);
    const sand = seaWinterColor(600, SEA_SAND_Y0 + 40, "sand", 0xf1dcbc);
    expect(lum(sand)).toBeGreaterThan(200);
    const wet = seaWinterColor(600, SEA_FLAT_Y0 - 4, "sand", 0xd0b48d);
    expect(lum(wet)).toBeLessThan(lum(SEA_SNOW.lo));
    expect(seaSnowyGround(600, SEA_FLAT_Y0 - 4, "sand")).toBe(false);
    expect(seaSnowyGround(600, SEA_SAND_Y0 + 40, "sand")).toBe(true);
  });

  it("먼바다는 그대로, 갯벌은 얼지 않고 차가운 빛만", () => {
    expect(seaWinterColor(500, 800, "deep", 0x4588b5)).toBe(0x4588b5);
    let white = 0;
    for (let x = 500; x < 900; x++) if (lum(seaWinterColor(x, SEA_FLAT_Y0 + 60, "flat", 0xd0b48d)) > 225) white++;
    expect(white).toBeLessThan(8);
  });
});

describe("데크 눈", () => {
  const deck = (w: number, h: number): Img => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) d.set([0xd6, 0xad, 0x7c, 255], i * 4);
    return { w, h, d };
  };

  it("판자 위 군데군데 눈 (다 덮지도, 하나도 없지도 않아요) · 투명한 칸은 그대로", () => {
    const m = deck(40, 120);
    m.d[3] = 0; // 맨 왼쪽 위 한 칸은 투명
    snowDeck(m, 0, 3);
    let snow = 0;
    for (let i = 0; i < 40 * 120; i++) if (lum((m.d[i * 4] << 16) | (m.d[i * 4 + 1] << 8) | m.d[i * 4 + 2]) > 205) snow++;
    expect(snow).toBeGreaterThan(40 * 120 * 0.1);
    expect(snow).toBeLessThan(40 * 120 * 0.9);
    expect(m.d[3]).toBe(0);
  });

  it("앞 테엔 고드름 (얼음 색)", () => {
    const m = deck(96, 50);
    snowDeck(m, 6, 5);
    const ice = new Set<number>([SEA_ICE.hi, SEA_ICE.mid, SEA_ICE.lo]);
    let n = 0;
    for (let y = 45; y < 50; y++) for (let x = 0; x < 96; x++) if (ice.has((m.d[(y * 96 + x) * 4] << 16) | (m.d[(y * 96 + x) * 4 + 1] << 8) | m.d[(y * 96 + x) * 4 + 2])) n++;
    expect(n).toBeGreaterThan(10);
  });
});

describe("살얼음 띠 · 전구 줄 · 등대 나선", () => {
  it("살얼음 띠는 2의 거듭제곱 크기, 띠 아래 줄은 비어 있어요", () => {
    const g = iceBandArt();
    expect(g.w).toBe(ICE_BAND_W);
    expect(g.h).toBe(ICE_BAND_TEX_H);
    for (let y = ICE_BAND_H; y < g.h; y++) for (let x = 0; x < g.w; x++) expect(g.get(x, y) & 255).toBe(0);
    let filled = 0;
    for (let x = 0; x < g.w; x++) if ([...Array(ICE_BAND_H).keys()].some((y) => g.filled(x, y))) filled++;
    expect(filled).toBeGreaterThan(ICE_BAND_W * 0.8);
  });

  it("전구 줄: 첫 점이 (ox, oy)에 있고 전구는 그림 안에 6px쯤마다", () => {
    for (const [dx, dy, sag, bow] of [
      [160, 0, 10, 0],
      [0, 36, 0, -3],
      [-40, 12, 4, 0],
    ]) {
      const s = stringLights(dx, dy, sag, bow);
      expect(s.grid.filled(s.ox, s.oy)).toBe(true);
      expect(s.grid.filled(s.ox + dx, s.oy + dy)).toBe(true);
      expect(s.bulbs.length).toBeGreaterThanOrEqual(Math.floor(Math.hypot(dx, dy) / 8) - 1);
      for (const b of s.bulbs) expect(s.grid.filled(b.x, b.y)).toBe(true);
    }
  });

  it("등대 나선 전구는 탑 앞쪽 안에만", () => {
    const sp = lighthouseSpiral();
    expect(sp.bulbs.length).toBeGreaterThan(8);
    for (const p of [...sp.wire, ...sp.bulbs]) {
      expect(p.y).toBeGreaterThanOrEqual(26);
      expect(p.y).toBeLessThan(101);
      expect(Math.abs(p.x - 22)).toBeLessThanOrEqual(15);
    }
  });
});

describe("크리스마스 눈사람·선물 자리", () => {
  it("모두 놓이고, 걸을 수 있는 눈밭 위, 서로·유령선 자리와 떨어져 있어요", () => {
    const { snowmen, gifts } = seaXmasSpots();
    expect(snowmen.length).toBe(4);
    expect(gifts.length).toBe(3);
    const all = [...snowmen, ...gifts];
    const G = SEA_GHOST_BERTH.clear;
    for (const p of all) {
      expect(seaStandable(p.x, p.y)).toBe(true);
      expect(seaSnowyGround(p.x, p.y, seaGroundKind(p.x, p.y))).toBe(true);
      expect(p.x > G.x - 20 && p.x < G.x + G.w + 20 && p.y > G.y - 40 && p.y < G.y + G.h + 20).toBe(false);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y)).toBeGreaterThan(24);
  });
});
