import type { GraveTier } from "@tomb/protocol";
import { darken, Grid, lighten, rng, type Color } from "./pixel";

// 묘비 외형 (명세 5-2): 7일 미만 나무 팻말 / 3개월 미만 작은 비석 / 1년 미만 큰 비석 / 1년 이상 석탑.
// 텍스처 = 묘비 + 앞쪽 흙무덤. 원점 y는 묘비 받침 줄(graveOriginY)에 맞춘다.

export const GRAVE_TEX_W = 18;
export const GRAVE_MOUND_H = 6;
export const GRAVE_STONE_H: Record<GraveTier, number> = { woodSign: 17, smallStone: 16, largeStone: 22, pagoda: 28 };

export type GraveStyle = "temple" | "gothic" | "sakura";

export function graveTexKey(tier: GraveTier, variant: number, style: GraveStyle = "temple"): string {
  return style === "temple" ? `grave-${tier}-${variant}` : `grave-${style}-${tier}-${variant}`;
}
export function graveOriginY(tier: GraveTier): number {
  return GRAVE_STONE_H[tier] / (GRAVE_STONE_H[tier] + GRAVE_MOUND_H);
}

const OUT = 0x2b2a27;
const WOOD = { hi: 0x9e7f5a, mid: 0x8a6c4a, lo: 0x6b5238, grain: 0x5e4630 };
const MOSS = 0x5f6e4a;

let stoneBase: Color | null = null;
function stonePal(variant: number) {
  const base = stoneBase ?? (variant === 1 ? 0x7d8184 : 0x8b8a82);
  return { hi: lighten(base, 0.18), mid: base, lo: darken(base, 0.2), cut: darken(base, 0.38) };
}

function mound(g: Grid, sh: number) {
  g.ellipse(9, sh + 1.5, 7.5, 3.2, 0x5d4c3a);
  g.recolor((x, y) => y <= sh, 0x6e5b46);
  g.set(5, sh + 2, 0x4b3d30);
  g.set(12, sh + 3, 0x4b3d30);
}

function shade(g: Grid, x0: number, x1: number, y0: number, y1: number, pal: { hi: Color; lo: Color }) {
  g.recolor((x, y) => y >= y0 && y <= y1 && x <= x0, pal.hi);
  g.recolor((x, y) => y >= y0 && y <= y1 && x >= x1, pal.lo);
}

function woodSign(variant: number): Grid {
  const sh = GRAVE_STONE_H.woodSign;
  const g = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  mound(g, sh);
  if (variant === 2) {
    // 다리 두 개 위의 낮은 널판 팻말
    g.rect(4, 9, 2, sh - 9, WOOD.lo);
    g.rect(12, 9, 2, sh - 9, WOOD.lo);
    for (let y = 5; y <= 10; y++) g.hline(2, 15, y, y === 5 ? WOOD.hi : y === 10 ? WOOD.lo : WOOD.mid);
    g.hline(4, 12, 7, WOOD.grain);
    g.hline(5, 10, 9, WOOD.grain);
  } else {
    g.rect(8, 7, 2, sh - 7, WOOD.lo);
    for (let y = 2; y <= 8; y++) {
      const off = variant === 1 ? Math.floor((y - 2) / 3) : 0;
      g.hline(3 + off, 14 + off, y, y === 2 ? WOOD.hi : y === 8 ? WOOD.lo : WOOD.mid);
    }
    g.hline(5 + (variant === 1 ? 1 : 0), 11, 4, WOOD.grain);
    g.hline(6 + (variant === 1 ? 1 : 0), 12, 6, WOOD.grain);
  }
  g.outline(OUT);
  return g;
}

function smallStone(variant: number): Grid {
  const sh = GRAVE_STONE_H.smallStone;
  const g = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  const p = stonePal(variant);
  mound(g, sh);
  const body = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  body.ellipse(9, 7, 6, 4, p.mid);
  body.rect(3, 7, 12, sh - 7, p.mid);
  shade(body, 4, 13, 0, sh, p);
  body.hline(6, 11, 9, p.cut);
  body.hline(7, 10, 11, p.cut);
  if (variant === 2) {
    body.set(11, 5, p.cut);
    body.set(10, 6, p.cut);
    body.set(11, 7, p.cut);
  }
  if (variant !== 1) {
    const r = rng(variant + 3);
    for (let i = 0; i < 5; i++) body.set(3 + Math.floor(r() * 4), sh - 1 - Math.floor(r() * 3), MOSS);
  }
  g.draw(body, 0, 0);
  g.outline(OUT);
  return g;
}

function largeStone(variant: number): Grid {
  const sh = GRAVE_STONE_H.largeStone;
  const g = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  const p = stonePal(variant);
  mound(g, sh);
  const body = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  body.ellipse(9, 6, 6, 4.5, p.mid);
  body.rect(3, 6, 12, 12, p.mid);
  shade(body, 4, 13, 0, 17, p);
  body.rect(1, 18, 16, sh - 18, p.lo);
  body.hline(1, 16, 18, p.mid);
  // 새김: 작은 원과 글줄
  body.set(8, 7, p.cut);
  body.set(9, 7, p.cut);
  body.set(7, 8, p.cut);
  body.set(10, 8, p.cut);
  body.set(8, 9, p.cut);
  body.set(9, 9, p.cut);
  body.hline(6, 11, 12, p.cut);
  body.hline(6, 11, 14, p.cut);
  body.hline(7, 10, 16, p.cut);
  if (variant === 1) {
    const r = rng(7);
    for (let i = 0; i < 10; i++) body.set(4 + Math.floor(r() * 10), 3 + Math.floor(r() * 14), p.hi);
  }
  if (variant === 2) for (let x = 1; x < 7; x++) body.set(x, 18 + (x % 2), MOSS);
  g.draw(body, 0, 0);
  g.outline(OUT);
  return g;
}

function pagoda(variant: number): Grid {
  const sh = GRAVE_STONE_H.pagoda;
  const g = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  const p = stonePal(variant);
  mound(g, sh);
  const b = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  b.rect(2, 24, 14, 4, p.lo);
  b.hline(2, 15, 24, p.mid);
  b.rect(5, 19, 8, 5, p.mid);
  shade(b, 5, 12, 19, 23, p);
  const roof = (x0: number, x1: number, y: number) => {
    b.hline(x0, x1, y, p.hi);
    b.hline(x0, x1, y + 1, p.lo);
    b.set(x0, y - 1, p.hi);
    b.set(x1, y - 1, p.hi);
  };
  roof(1, 16, 17);
  b.rect(6, 13, 6, 4, p.mid);
  shade(b, 6, 11, 13, 16, p);
  roof(3, 14, 11);
  b.rect(7, 8, 4, 3, p.mid);
  roof(4, 13, 6);
  b.rect(8, 1, 2, 4, p.mid);
  b.hline(7, 10, 2, p.hi);
  if (variant === 2) for (const [x, y] of [[2, 26], [3, 25], [14, 26], [6, 22]]) b.set(x, y, MOSS);
  g.draw(b, 0, 0);
  g.outline(OUT);
  return g;
}

function templeGrave(tier: GraveTier, variant: number): Grid {
  switch (tier) {
    case "woodSign":
      return woodSign(variant);
    case "smallStone":
      return smallStone(variant);
    case "largeStone":
      return largeStone(variant);
    case "pagoda":
      return pagoda(variant);
  }
}

// ── 고딕: 나무 십자가 / 십자 새긴 비석 / 고리 십자가 / 오벨리스크 ──
function gothicGrave(tier: GraveTier, variant: number): Grid {
  const sh = GRAVE_STONE_H[tier];
  const g = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  mound(g, sh);
  const b = new Grid(GRAVE_TEX_W, sh + GRAVE_MOUND_H);
  const p = { hi: 0x9a9da6, mid: 0x7a7d86, lo: 0x5a5c64, cut: 0x3c3d44 };
  if (variant === 1) Object.assign(p, { hi: 0x8e8a86, mid: 0x6e6a66, lo: 0x524e4b, cut: 0x34312e });
  if (tier === "woodSign") {
    const w = { hi: 0x7a5c40, mid: 0x5e4632, lo: 0x46331f };
    b.rect(8, 1, 2, sh - 1, w.mid);
    b.vline(9, 1, sh - 1, w.lo);
    b.rect(4, 4, 10, 2, w.mid);
    b.hline(4, 13, 4, w.hi);
    if (variant === 2) b.set(5, 6, w.lo);
  } else if (tier === "smallStone") {
    b.ellipse(9, 6, 6, 4, p.mid);
    b.rect(3, 6, 12, sh - 6, p.mid);
    shade(b, 4, 13, 0, sh, p);
    b.vline(9, 5, 11, p.cut);
    b.hline(7, 11, 7, p.cut);
  } else if (tier === "largeStone") {
    b.rect(3, 17, 12, sh - 17, p.lo);
    b.hline(3, 14, 17, p.mid);
    b.rect(7, 1, 4, 16, p.mid);
    b.rect(3, 5, 12, 4, p.mid);
    // 교차점의 고리
    for (let a = 0; a < 24; a++) b.set(Math.round(9 + Math.cos((a / 24) * Math.PI * 2) * 4), Math.round(7 + Math.sin((a / 24) * Math.PI * 2) * 4), p.lo);
    b.vline(7, 1, 16, p.hi);
    b.hline(3, 14, 5, p.hi);
  } else {
    b.rect(3, 22, 12, 6, p.lo);
    b.hline(3, 14, 22, p.mid);
    for (let y = 4; y < 22; y++) {
      const hw = 1 + Math.floor((y - 4) / 6);
      b.hline(9 - hw, 8 + hw, y, y % 5 === 0 ? p.lo : p.mid);
      b.set(9 - hw, y, p.hi);
    }
    b.set(8, 1, p.hi);
    b.hline(8, 9, 2, p.mid);
    b.hline(7, 10, 3, p.mid);
  }
  if (variant === 2 && tier !== "woodSign") for (const [x, y] of [[4, sh - 2], [5, sh - 1], [12, sh - 1]]) b.set(x, y, 0x4f5a44);
  g.draw(b, 0, 0);
  g.outline(OUT);
  return g;
}

/** 벚꽃: 산사와 같은 모양을 밝은 돌빛으로, 흙무덤에 꽃잎 */
function sakuraGrave(tier: GraveTier, variant: number): Grid {
  stoneBase = variant === 1 ? 0xa3a2a6 : 0xaeaaa2;
  const g = templeGrave(tier, variant);
  stoneBase = null;
  const sh = GRAVE_STONE_H[tier];
  const r = rng(tier.length * 7 + variant);
  for (let i = 0; i < 6; i++) {
    const x = 3 + Math.floor(r() * 12);
    const y = sh + Math.floor(r() * 4);
    if (g.filled(x, y)) g.set(x, y, r() < 0.5 ? 0xf2b8c8 : 0xe89ab0);
  }
  return g;
}

export function graveCanvas(tier: GraveTier, variant: number, style: GraveStyle = "temple"): HTMLCanvasElement {
  if (style === "gothic") return gothicGrave(tier, variant).toCanvas();
  if (style === "sakura") return sakuraGrave(tier, variant).toCanvas();
  return templeGrave(tier, variant).toCanvas();
}

// ── 꽃 더미 (헌화 수, 최대 8송이) ──
export const FLOWERS_W = 16;
export const FLOWERS_H = 8;
const FLOWER_SPOTS: readonly [number, number, Color][] = [
  [7, 2, 0xefe9d6],
  [10, 3, 0xefe9d6],
  [4, 3, 0xe6d27e],
  [12, 1, 0xefe9d6],
  [2, 5, 0xc4b2dc],
  [8, 5, 0xefe9d6],
  [13, 4, 0xe6d27e],
  [5, 1, 0xd9a6ab],
];

export function flowersCanvas(n: number): HTMLCanvasElement {
  const g = new Grid(FLOWERS_W, FLOWERS_H);
  for (let i = 0; i < Math.min(n, FLOWER_SPOTS.length); i++) {
    const [x, y, c] = FLOWER_SPOTS[i];
    g.set(x, y + 2, 0x5b7044);
    g.set(x - 1, y, c);
    g.set(x + 1, y, c);
    g.set(x, y - 1, c);
    g.set(x, y + 1, c);
    g.set(x, y, c === 0xefe9d6 ? 0xe2b84e : 0xf3eedf);
  }
  return g.toCanvas();
}

/** 부활 대기석으로 올라간 묘비의 빈 흙자리 */
export function plotCanvas(): HTMLCanvasElement {
  const g = new Grid(16, 9);
  g.ellipse(8, 4.5, 7.5, 4, 0x58483a);
  g.recolor((x, y) => y <= 2, 0x6b5946);
  for (const [x, y] of [[4, 5], [10, 4], [7, 6], [12, 6]]) g.set(x, y, 0x46392d);
  return g.toCanvas();
}

/** 빈 흙자리 위 "↑" 표시 */
export function upMarkerCanvas(): HTMLCanvasElement {
  const g = new Grid(7, 9);
  const c = 0xe8dcb5;
  g.vline(3, 2, 7, c);
  g.set(3, 1, c);
  g.hline(2, 4, 2, c);
  g.hline(1, 5, 3, c);
  g.set(1, 3, c);
  g.outline(0x2a2620);
  return g.toCanvas();
}
