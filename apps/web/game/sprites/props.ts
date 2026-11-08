import { darken, Grid, lighten, rng, type Color } from "./pixel";

// 소품 픽셀아트: 고목, 마른 나무, 석등, 벤치, 의자, 돌탁자, 제단, 정문, 아래 담장.
// 모두 원점 = 바닥 중앙 (0.5, 1)으로 쓰도록 맨 아래 줄을 그림자 줄로 둔다.

const OUT = 0x1f1d1a;
export type WoodPal = { hi: Color; mid: Color; lo: Color; line: Color };
export type LeafPal = { hi: Color; mid: Color; lo: Color; deep: Color };
export type TrunkPal = { hi: Color; mid: Color; lo: Color };
const WOOD: WoodPal = { hi: 0x927252, mid: 0x7a5d40, lo: 0x5a432e, line: 0x2e2219 };
const STONE = { hi: 0xa4a297, mid: 0x8a887e, lo: 0x67655d, line: 0x3a3934 };
const LEAF: LeafPal = { hi: 0x4a5f3c, mid: 0x38492f, lo: 0x2a3825, deep: 0x222d1f };
const TRUNK: TrunkPal = { hi: 0x6e5840, mid: 0x5a4632, lo: 0x43342a };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, w = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps);
    const y = Math.round(y0 + ((y1 - y0) * i) / steps);
    g.rect(x, y, w, w, c);
  }
}

export function tree(variant: number, leaf: LeafPal = LEAF, trunk: TrunkPal = TRUNK): HTMLCanvasElement {
  const g = new Grid(32, 40);
  const r = rng(17 + variant * 31);
  // 줄기
  for (let y = 22; y <= 37; y++) {
    const flare = y > 34 ? y - 34 : 0;
    for (let x = 13 - flare; x <= 18 + flare; x++) g.set(x, y, x <= 14 ? trunk.hi : x >= 17 ? trunk.lo : trunk.mid);
  }
  g.set(15, 28, trunk.lo);
  g.set(16, 31, trunk.lo);
  // 수관
  const blobs: [number, number, number, number][] =
    variant % 2 === 0
      ? [
          [16, 14, 12, 9.5],
          [8.5, 18, 7, 5.5],
          [23.5, 18, 7, 5.5],
          [16, 6.5, 8, 5.5],
          [11, 9, 5, 4],
        ]
      : [
          [16, 12, 11, 8.5],
          [9, 17, 6.5, 7],
          [23, 17, 6.5, 7],
          [16, 19, 7, 4],
        ];
  for (const [cx, cy, rx, ry] of blobs) g.ellipse(cx, cy, rx, ry, leaf.mid);
  g.recolor((x, y) => !g.filled(x - 1, y - 2) || (x < 13 && y < 10), leaf.hi);
  g.recolor((x, y) => (!g.filled(x, y + 2) && y > 12) || (x > 22 && y > 14), leaf.lo);
  for (let i = 0; i < 45; i++) {
    const x = Math.floor(r() * 32);
    const y = Math.floor(r() * 26);
    if (g.filled(x, y) && y < 26) g.set(x, y, r() < 0.5 ? leaf.deep : leaf.hi);
  }
  if (variant % 2 === 1) {
    // 늘어진 가지
    for (const x of [7, 11, 21, 25]) for (let y = 21; y < 21 + 3 + Math.floor(r() * 4); y++) g.set(x, y, leaf.lo);
  }
  g.outline(OUT);
  shadow(g, 16, 38, 11, 2.2, 70);
  return g.toCanvas();
}

export function deadTree(variant: number, bark: Color = 0x51443a, hi: Color = 0x65574a): HTMLCanvasElement {
  const g = new Grid(28, 38);
  for (let y = 16; y <= 35; y++) {
    const flare = y > 32 ? y - 32 : 0;
    for (let x = 12 - flare; x <= 15 + flare; x++) g.set(x, y, x <= 12 ? hi : bark);
  }
  const branches: [number, number, number, number][] =
    variant % 2 === 0
      ? [
          [13, 18, 5, 9],
          [5, 9, 2, 4],
          [5, 9, 8, 3],
          [14, 16, 22, 7],
          [22, 7, 25, 2],
          [19, 11, 18, 4],
          [13, 16, 13, 3],
        ]
      : [
          [13, 20, 4, 12],
          [4, 12, 3, 6],
          [14, 17, 23, 10],
          [23, 10, 21, 3],
          [13, 16, 11, 5],
          [11, 5, 14, 1],
        ];
  for (const [x0, y0, x1, y1] of branches) line(g, x0, y0, x1, y1, bark);
  g.outline(OUT);
  shadow(g, 14, 36, 7, 1.8, 60);
  return g.toCanvas();
}

export const LANTERN_H = 26;
/** 석등 창(빛) 위치: 받침 기준 */
export const LANTERN_LIGHT_DY = -15;

export function lantern(): HTMLCanvasElement {
  const g = new Grid(12, LANTERN_H);
  const s = STONE;
  g.rect(1, 22, 10, 3, s.mid);
  g.rect(1, 22, 10, 1, s.hi);
  g.rect(4, 15, 4, 7, s.mid);
  g.rect(4, 15, 1, 7, s.hi);
  g.rect(7, 15, 1, 7, s.lo);
  g.rect(2, 8, 8, 7, s.mid);
  g.rect(3, 9, 6, 4, 0xffd27a);
  g.rect(4, 10, 4, 2, 0xfff0b8);
  g.rect(0, 5, 12, 3, s.lo);
  g.rect(1, 5, 10, 1, s.hi);
  g.set(0, 4, s.lo);
  g.set(11, 4, s.lo);
  g.rect(5, 2, 2, 3, s.mid);
  g.set(5, 1, s.hi);
  g.outline(s.line);
  shadow(g, 6, 25, 6, 1.2, 70);
  return g.toCanvas();
}

export function bench(width: number, w: WoodPal = WOOD): HTMLCanvasElement {
  const g = new Grid(width, 16);
  // 등받이
  g.rect(2, 1, width - 4, 2, w.mid);
  g.rect(2, 1, width - 4, 1, w.hi);
  g.rect(3, 3, 2, 4, w.lo);
  g.rect(width - 5, 3, 2, 4, w.lo);
  // 앉는 판
  g.rect(1, 6, width - 2, 5, w.mid);
  g.rect(1, 6, width - 2, 1, w.hi);
  g.rect(1, 8, width - 2, 1, w.lo);
  g.rect(1, 10, width - 2, 1, w.lo);
  // 다리
  for (const x of [3, width - 5]) g.rect(x, 11, 2, 3, w.lo);
  g.outline(w.line);
  shadow(g, width / 2, 14.5, width / 2 - 2, 1.4, 60);
  return g.toCanvas();
}

export function chair(facing: "down" | "left" | "right", w: WoodPal = WOOD): HTMLCanvasElement {
  const g = new Grid(14, 18);
  if (facing === "down") {
    g.rect(2, 1, 10, 2, w.mid);
    g.rect(2, 1, 10, 1, w.hi);
    g.rect(2, 3, 2, 5, w.lo);
    g.rect(10, 3, 2, 5, w.lo);
    g.rect(5, 4, 4, 1, w.lo);
    g.rect(1, 8, 12, 4, w.mid);
    g.rect(1, 8, 12, 1, w.hi);
    g.rect(2, 12, 2, 4, w.lo);
    g.rect(10, 12, 2, 4, w.lo);
  } else {
    // 오른쪽을 보는 의자: 등받이가 왼쪽
    g.rect(1, 1, 2, 11, w.mid);
    g.rect(1, 1, 1, 11, w.hi);
    g.rect(1, 8, 11, 3, w.mid);
    g.rect(1, 8, 11, 1, w.hi);
    g.rect(2, 11, 2, 5, w.lo);
    g.rect(9, 11, 2, 5, w.lo);
  }
  g.outline(w.line);
  shadow(g, 7, 16.5, 6, 1.2, 60);
  return facing === "left" ? g.mirrored().toCanvas() : g.toCanvas();
}

export function table(): HTMLCanvasElement {
  const g = new Grid(22, 16);
  const s = STONE;
  g.rect(9, 8, 4, 5, s.lo);
  g.rect(7, 12, 8, 2, s.mid);
  g.ellipse(11, 6, 10, 4, s.mid);
  g.recolor((x, y) => y <= 4, s.hi);
  g.recolor((x, y) => y >= 8 && y <= 9, s.lo);
  g.outline(s.line);
  shadow(g, 11, 14.5, 9, 1.4, 60);
  return g.toCanvas();
}

export const ALTAR_W = 44;
export const ALTAR_H = 30;
/** 제단 촛불 위치 (받침 기준) */
export const ALTAR_CANDLES: readonly [number, number][] = [
  [-13, -21],
  [13, -21],
];

export function altar(): HTMLCanvasElement {
  const g = new Grid(ALTAR_W, ALTAR_H);
  const s = STONE;
  // 아래 단
  g.rect(0, 23, 44, 5, s.lo);
  g.rect(0, 23, 44, 1, s.mid);
  // 몸체
  g.rect(4, 12, 36, 11, s.mid);
  g.rect(4, 12, 36, 2, s.hi);
  g.rect(4, 18, 36, 5, s.lo);
  g.rect(8, 15, 28, 1, darken(s.mid, 0.2));
  // 윗판
  g.rect(2, 10, 40, 2, s.hi);
  // 향로
  g.rect(18, 6, 8, 4, 0x8c6d3f);
  g.rect(18, 6, 8, 1, lighten(0x8c6d3f, 0.25));
  g.rect(17, 5, 10, 1, 0x6b5230);
  g.rect(21, 2, 1, 3, 0xcfc6b0);
  // 초 받침 (불꽃은 FX)
  g.rect(7, 6, 3, 4, 0xe8e0c8);
  g.rect(34, 6, 3, 4, 0xe8e0c8);
  g.outline(s.line);
  shadow(g, 22, 28.5, 21, 1.4, 70);
  return g.toCanvas();
}

export const GATE_W = 72;
export const GATE_H = 44;
export function gate(): HTMLCanvasElement {
  const g = new Grid(GATE_W, GATE_H);
  const s = STONE;
  const roof = { hi: 0x5a6266, mid: 0x434a4e, lo: 0x2f3437 };
  for (const x0 of [5, 57]) {
    g.rect(x0, 12, 10, 31, s.mid);
    g.rect(x0, 12, 2, 31, s.hi);
    g.rect(x0 + 8, 12, 2, 31, s.lo);
    for (let y = 18; y < 42; y += 6) g.rect(x0, y, 10, 1, s.line);
  }
  // 들보
  g.rect(1, 9, 70, 4, WOOD.mid);
  g.rect(1, 9, 70, 1, WOOD.hi);
  g.rect(1, 12, 70, 1, WOOD.lo);
  // 지붕
  for (let y = 0; y < 8; y++) {
    const inset = Math.max(0, 6 - y);
    g.rect(inset, y + 1, GATE_W - inset * 2, 1, y < 2 ? roof.hi : y < 6 ? roof.mid : roof.lo);
  }
  for (let x = 4; x < GATE_W - 4; x += 4) g.vline(x, 3, 8, roof.lo);
  // 현판
  g.rect(28, 13, 16, 7, 0x3e2f22);
  g.rect(29, 14, 14, 5, 0x4d3a2a);
  for (const x of [31, 34, 37, 40]) g.rect(x, 15, 2, 3, 0xd8c99c);
  g.outline(OUT);
  return g.toCanvas();
}

export function wallFaceTile(): HTMLCanvasElement {
  const g = new Grid(16, 16);
  const face = 0x625f57;
  const ln = 0x45433d;
  g.rect(0, 0, 16, 16, face);
  g.rect(0, 0, 16, 2, 0x76736a);
  for (let row = 0; row < 3; row++) {
    const y = 2 + row * 5;
    g.rect(0, y + 4, 16, 1, ln);
    const off = row % 2 ? 3 : 9;
    g.rect(off, y, 1, 4, ln);
  }
  return g.toCanvas();
}
