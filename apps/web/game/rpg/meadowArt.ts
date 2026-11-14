import * as Phaser from "phaser";
import type { MeadowTone } from "@/lib/rpg/types";
import { darken, Grid, hash2, lighten, mix, radial, rng, type Color } from "../sprites/pixel";
import type { DecorKind, InsectArt } from "./meadowLayout";

// 32번 곤충 채집 들판 그림 (코드로 그리는 픽셀아트 — 외부 이미지 없음). 마을과 같은 위에서 내려다보는 시점.
//  - 바닥: 이음매 없는 128×128 풀밭 한 장(타일로 깐다) + 웅덩이·돌·꽃·토끼풀·바람에 흔들리는 풀 포기
//  - 덤불 9개 (칸마다 모양·크기·열매가 다르다) + 키 팻말
//  - 곤충 24×24 × 3프레임 (0 날개 활짝 · 1 반쯤 · 2 접음/빠른 날갯짓): 나비·고추잠자리·반딧불이·황금 나비·꿀벌·낙엽
//  - 잠자리채 (빈 채·담긴 채), 꽃잎·빛 가루 조각, 빛 번짐, 그림자
// 시간대(낮·노을·밤)는 그릴 때 색에 입힌다 (toneColor) — 틴트를 매 프레임 거는 것보다 싸고 색이 덜 뭉개진다.
// 텍스처 이름에 시간대가 붙으므로 한 판에 쓰는 시간대 것만 만든다.

export const MTEX = {
  ground: (t: MeadowTone) => `meadow-ground-${t}`,
  bush: (slot: number, t: MeadowTone) => `meadow-bush-${slot}-${t}`,
  sign: (t: MeadowTone) => `meadow-sign-${t}`,
  decor: (k: DecorKind, v: number, t: MeadowTone) => `meadow-${k}-${v}-${t}`,
  insect: (a: InsectArt, t: MeadowTone) => `meadow-insect-${a}-${t}`,
  net: "meadow-net",
  bits: "meadow-bits",
  glow: "meadow-glow",
  shadow: "meadow-shadow",
  shade: "meadow-shade",
  cloud: "meadow-cloud",
} as const;

/** bits 시트 프레임: 꽃잎 4색, 반짝이, 빛 가루, 낙엽 부스러기, 풀 부스러기 */
export const BIT = { petal: [0, 1, 2, 3], sparkle: 4, dust: 5, leafBit: 6, grassBit: 7 } as const;
export const DECOR_VARIANTS = 4;

const OUT = 0x16121a;

// ── 시간대 색 ──

const toneCache = new Map<string, Color>();

/**
 * 시간대 색: 노을 = 주황빛을 섞고 살짝 어둡게, 밤 = 어둡게 + 푸른 달빛 (지형이 또렷이 보일 만큼만).
 * k: 세기 (곤충은 약하게 — 밤에도 눈에 띄게)
 */
export function toneColor(c: Color, tone: MeadowTone, k = 1): Color {
  if (tone === "day" || k <= 0) return c;
  const key = `${c}:${tone}:${k}`;
  const known = toneCache.get(key);
  if (known !== undefined) return known;
  const out = tone === "dusk" ? darken(mix(c, 0xff8a40, 0.3 * k), 0.04 * k) : mix(darken(c, 0.4 * k), 0x2a3a6a, 0.3 * k);
  toneCache.set(key, out);
  return out;
}

function toneGrid(g: Grid, tone: MeadowTone, k = 1): void {
  if (tone === "day") return;
  for (let i = 0; i < g.px.length; i++) {
    const v = g.px[i];
    const a = v & 255;
    if (!a) continue;
    g.px[i] = Grid.rgba(toneColor(v >>> 8, tone, k), a);
  }
}

// ── 들판 색 (낮 기준, 마을 풀밭의 차분한 올리브빛보다 조금 더 싱그럽게) ──
const C = {
  grass: 0x667744,
  grassDark: 0x5c6c3e,
  grassDeep: 0x536238,
  grassLight: 0x71814b,
  blade: 0x86944f,
  bladeTip: 0xa2ad62,
  dirt: 0x6c5b46,
  dirtDark: 0x58493a,
  stone: 0x8a877c,
  stoneDark: 0x6a675e,
  stoneLight: 0xa8a598,
  moss: 0x5d6b4a,
  water: 0x3e5e68,
  waterDeep: 0x2f4a54,
  waterLight: 0x5f8890,
  leaf: 0x3f6a34,
  leafDark: 0x2c4c28,
  leafLight: 0x56853e,
  leafShine: 0x77a24c,
  wood: 0x9a6a3a,
  woodDark: 0x6a4a2a,
  woodLight: 0xb88a52,
  flowers: [0xe8e4d4, 0xe0c050, 0xd88aa0, 0xa898d0] as readonly Color[],
};

// ── 바닥 ──

/** 감싸는 값 잡음 (주기 size, 칸 cell) → 0..1. 바닥 타일이 이음매 없이 이어진다. 격자 값은 씨앗 난수 표 (해시를 그대로 쓰면 줄무늬가 진다) */
function wrapNoise(cell: number, size: number, seed: number): (x: number, y: number) => number {
  const n = size / cell;
  const r = rng(seed * 7919 + n);
  const table = Array.from({ length: n * n }, () => r());
  return (x, y) => {
    const gx = x / cell;
    const gy = y / cell;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const h = (i: number, j: number) => table[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy) + (h(ix + 1, iy) - h(ix, iy)) * sx;
    const b = h(ix, iy + 1) + (h(ix + 1, iy + 1) - h(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** 풀밭 256×256 (이음매 없음): 큰 얼룩 + 잔 점 + 풀잎 + 아주 작은 들꽃 */
function groundTile(tone: MeadowTone): HTMLCanvasElement {
  const S = 256;
  const g = new Grid(S, S);
  const big = new Float32Array(S * S);
  const [n1, n2, n3] = [wrapNoise(64, S, 1), wrapNoise(32, S, 2), wrapNoise(16, S, 3)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) big[y * S + x] = n1(x, y) * 0.6 + n2(x, y) * 0.3 + n3(x, y) * 0.1;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = (hash2(x, y, 3) - 0.5) * 0.06; // 얼룩 경계를 픽셀로 흩뜨린다
      const v = big[y * S + x] + d;
      let c = v < 0.3 ? C.grassDeep : v < 0.42 ? C.grassDark : v > 0.64 ? C.grassLight : C.grass;
      const s = hash2(x, y, 4);
      if (s < 0.05) c = darken(c, 0.12);
      else if (s > 0.96) c = lighten(c, 0.1);
      g.set(x, y, c);
    }
  // 풀잎 (아래 어두운 밑동 + 위 밝은 끝)
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(hash2(i, 0, 5) * S);
    const y = Math.floor(hash2(i, 1, 5) * S);
    g.set(x, y, C.blade);
    g.set(x, (y + S - 1) % S, C.bladeTip);
    if (hash2(i, 2, 5) < 0.4) {
      g.set((x + 1) % S, y, C.blade);
      g.set((x + 2) % S, (y + S - 1) % S, C.bladeTip);
    }
  }
  // 아주 작은 들꽃 점
  for (let i = 0; i < 36; i++) {
    const x = Math.floor(hash2(i, 7, 6) * S);
    const y = Math.floor(hash2(i, 8, 6) * S);
    g.set(x, y, C.flowers[i % 4]);
  }
  toneGrid(g, tone);
  return g.toCanvas();
}

// ── 꾸미기 ──

function pond(v: number): Grid {
  const g = new Grid(52, 32);
  const cx = 25;
  const cy = 16;
  g.ellipse(cx, cy, 23, 12.5, C.dirt);
  g.ellipse(cx, cy + 1, 21, 11, C.dirtDark);
  g.ellipse(cx, cy, 20, 10, C.waterDeep);
  g.ellipse(cx - 1, cy - 1, 18, 8.4, C.water);
  g.recolor((x, y) => (x - cx) * 0.3 + (y - cy) < -5 && g.get(x, y) >>> 8 === C.water, C.waterLight);
  // 물결 반짝 줄
  for (const [x, y, w] of [[14, 13, 4], [28, 18, 5], [20, 21, 3]] as const) g.hline(x, x + w, y, lighten(C.waterLight, 0.25));
  // 연잎 + 꽃
  const lx = v % 2 ? 33 : 15;
  g.ellipse(lx, 17, 3.6, 2.4, 0x4f8040);
  g.set(lx + 2, 16, C.waterDeep);
  g.set(lx + 3, 16, C.waterDeep);
  g.set(lx - 1, 15, 0xe8a0c0);
  g.set(lx, 15, 0xf4c8d8);
  g.outline(OUT, false, 140);
  // 갈대 (가장자리)
  const rx = v % 2 ? 6 : 44;
  for (let i = 0; i < 4; i++) {
    const x = rx + i * 2 - 3;
    g.vline(x, 4 + (i % 2) * 2, 14, 0x6f7a42);
    g.rect(x, 3 + (i % 2) * 2, 1, 3, 0x7a5232);
  }
  return g;
}

function stone(v: number): Grid {
  const g = new Grid(14, 11);
  const rx = 4.5 + (v % 2) * 1.5;
  const ry = 3 + (v % 3) * 0.6;
  g.ellipse(7, 7.5, rx + 0.5, ry * 0.6, 0x000000, 60);
  const s = new Grid(14, 11);
  s.ellipse(7, 5.5, rx, ry, C.stone);
  s.recolor((x, y) => y >= 5.5 + ry * 0.4, C.stoneDark);
  s.recolor((x, y) => y <= 4 && x <= 6, C.stoneLight);
  if (v % 2 === 0) s.set(8, 4, C.moss);
  s.outline(OUT, false, 180);
  g.draw(s, 0, 0);
  return g;
}

function flowers(v: number): Grid {
  const g = new Grid(14, 11);
  for (const [x, y] of [[3, 7], [7, 8], [11, 6], [5, 4], [9, 3]] as const) {
    g.set(x, y + 1, 0x4f7a3a);
    g.set(x + 1, y + 2, 0x4f7a3a);
  }
  const c = C.flowers[v % 4];
  const spots = v % 2 ? [[4, 5], [9, 3], [11, 7]] : [[3, 6], [8, 4], [10, 8], [6, 2]];
  for (const [x, y] of spots) {
    g.set(x - 1, y, c);
    g.set(x + 1, y, c);
    g.set(x, y - 1, c);
    g.set(x, y + 1, c);
    g.set(x, y, v % 4 === 1 ? 0xb8742a : 0xf0d060);
  }
  return g;
}

function clover(v: number): Grid {
  const g = new Grid(14, 10);
  const c = 0x557a3c;
  for (const [x, y] of [[3, 4], [8, 3], [11, 6], [5, 7]] as const) {
    g.set(x, y, c);
    g.set(x + 1, y, c);
    g.set(x, y + 1, c);
    g.set(x + 1, y + 1, darken(c, 0.15));
    g.set(x - 1, y + 1, lighten(c, 0.1));
  }
  if (v % 2) {
    g.rect(9, 1, 2, 2, 0xf0ece0);
    g.set(10, 1, 0xf8d8e0);
  }
  return g;
}

/** 바람에 흔들리는 풀 포기 (밑동이 그림 아래 가운데) */
function tuft(v: number): Grid {
  const g = new Grid(11, 13);
  const blades = [
    [5, 0, 12],
    [3, -2, 10],
    [7, 2, 10],
    [2, -3, 8],
    [8, 3, 8],
  ].slice(0, 3 + (v % 3));
  for (const [x, lean, h] of blades) {
    for (let i = 0; i < h; i++) {
      const px = Math.round(x + (lean * i) / h);
      g.set(px, 12 - i, i > h - 3 ? C.bladeTip : i < 3 ? darken(C.blade, 0.2) : C.blade);
    }
  }
  return g;
}

function decorGrid(k: DecorKind, v: number): Grid {
  switch (k) {
    case "pond":
      return pond(v);
    case "stone":
      return stone(v);
    case "flower":
      return flowers(v);
    case "clover":
      return clover(v);
    case "tuft":
      return tuft(v);
  }
}

// ── 덤불 ──

/** 덤불 한 개 (위에서 본 둥근 잎 뭉치). r: 반지름, variant: 모양·열매 */
function bush(r: number, variant: number, tone: MeadowTone): HTMLCanvasElement {
  const W = r * 2 + 12;
  const H = Math.round(r * 1.8) + 14;
  const cx = W / 2;
  const cy = H / 2 - 2;
  const g = new Grid(W, H);
  const b = new Grid(W, H);
  // 잎 뭉치: 가운데 하나 + 둘레 여럿, 위쪽 것부터 그려 아래 것이 앞에 겹친다
  const m = 5 + (variant % 3);
  const clumps: { x: number; y: number; r: number }[] = [{ x: cx, y: cy, r: r * 0.62 }];
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 + variant * 0.7;
    const d = r * (0.42 + hash2(i, variant, 21) * 0.1);
    clumps.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.86, r: r * (0.42 + hash2(variant, i, 22) * 0.14) });
  }
  clumps.sort((p, q) => p.y - q.y);
  for (const c of clumps) {
    b.ellipse(c.x, c.y, c.r, c.r * 0.9, C.leafDark);
    b.ellipse(c.x - 0.6, c.y - 0.9, c.r * 0.86, c.r * 0.76, C.leaf);
    b.ellipse(c.x - c.r * 0.22, c.y - c.r * 0.28, c.r * 0.5, c.r * 0.42, C.leafLight);
    b.set(c.x - c.r * 0.35, c.y - c.r * 0.45, C.leafShine);
    b.set(c.x - c.r * 0.35 + 1, c.y - c.r * 0.45, C.leafShine);
  }
  // 잎결 (안쪽만 드문드문)
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (!b.filled(x, y) || !b.filled(x, y - 1) || !b.filled(x, y + 1)) continue;
      const h = hash2(x, y, 23 + variant);
      if (h < 0.07) b.set(x, y, C.leafDark);
      else if (h > 0.95) b.set(x, y, C.leafLight);
    }
  // 꽃·열매 (덤불마다 다르게, 마지막 하나는 잎만)
  const kind = variant % 5;
  if (kind < 4) {
    const col = [0xf0ece0, 0xc83a3a, 0xe8a0c0, 0xf0d060][kind];
    for (let i = 0; i < 5 + (variant % 3); i++) {
      const a = hash2(i, variant, 24) * Math.PI * 2;
      const d = hash2(variant, i, 25) * r * 0.75;
      const x = Math.round(cx + Math.cos(a) * d);
      const y = Math.round(cy + Math.sin(a) * d * 0.8);
      if (!b.filled(x, y) || !b.filled(x + 1, y + 1)) continue;
      b.set(x, y, col);
      if (kind === 1) b.set(x + 1, y + 1, darken(col, 0.3));
      else {
        b.set(x + 1, y, col);
        b.set(x, y + 1, col);
        b.set(x + 1, y + 1, kind === 0 ? 0xf0d060 : lighten(col, 0.3));
      }
    }
  }
  b.outline(OUT, false, 200);
  // 그림자 (오른쪽 아래로)
  g.ellipse(cx + 2, cy + r * 0.62, r * 1.02, r * 0.42, 0x000000, 70);
  g.draw(b, 0, 0);
  toneGrid(g, tone);
  return g.toCanvas();
}

/** 키 팻말 (작은 나무판 + 말뚝). 글자는 씬이 화면 해상도로 따로 얹는다 */
function sign(tone: MeadowTone): HTMLCanvasElement {
  const g = new Grid(14, 16);
  g.rect(6, 9, 2, 7, C.woodDark);
  g.rect(0, 1, 14, 9, C.wood);
  g.hline(0, 13, 1, C.woodLight);
  g.hline(0, 13, 9, C.woodDark);
  g.hline(2, 5, 5, darken(C.wood, 0.12));
  g.hline(9, 12, 6, darken(C.wood, 0.12));
  g.set(1, 2, 0x4a4a52);
  g.set(12, 2, 0x4a4a52);
  g.outline(OUT, false, 220);
  toneGrid(g, tone, 0.8);
  return g.toCanvas();
}

// ── 곤충 (24×24 × 3프레임, 머리가 위) ──

type Draw = (g: Grid, f: number) => void;

/** 왼쪽 반만 그리고 거울로 붙인다 (몸통은 x 11·12 두 줄) */
function symmetric(g: Grid): void {
  g.draw(g.mirrored(), 0, 0);
}

/** 나비 날개 (위에서 본 모양). spread: 1 활짝 · 0.6 반쯤 · 0.25 접음 */
function butterflyWings(g: Grid, spread: number, fore: Color, hind: Color, edge: Color): void {
  const fx = 11.5 - 5.6 * spread;
  g.ellipse(fx, 10, 5.6 * spread + 0.6, 4, fore);
  g.ellipse(11.5 - 4.2 * spread, 15.5, 4 * spread + 0.6, 3.2, hind);
  // 날개 끝 테두리 (앞날개 바깥 위)
  g.recolor((x, y) => x < fx - 1.2 * spread && y < 9 && x < 12, edge);
}

function insectBody(g: Grid, top: number, bottom: number, c: Color): void {
  g.rect(11, top, 2, bottom - top + 1, c);
  g.set(10, top - 2, c);
  g.set(9, top - 3, c);
  g.set(13, top - 2, c);
  g.set(14, top - 3, c);
}

const SPREAD = [1, 0.6, 0.25];

const butterfly: Draw = (g, f) => {
  butterflyWings(g, SPREAD[f], 0xf6f2e4, 0xe9e2c8, 0x3a3430);
  if (f < 2) {
    g.set(Math.round(11.5 - 5.6 * SPREAD[f]), 11, 0x3a3430);
    g.set(Math.round(11.5 - 4.2 * SPREAD[f]) - 1, 15, 0xe0c060);
  }
  symmetric(g);
  insectBody(g, 7, 17, 0x2a2420);
  g.outline(OUT, false, 210);
};

const golden: Draw = (g, f) => {
  butterflyWings(g, SPREAD[f], 0xffd040, 0xf0a020, 0xb86a10);
  if (f < 2) {
    g.set(Math.round(11.5 - 5.6 * SPREAD[f]) + 1, 8, 0xffffff);
    g.set(Math.round(11.5 - 4.2 * SPREAD[f]), 16, 0xfff6c0);
  }
  symmetric(g);
  insectBody(g, 7, 17, 0x5a3a10);
  g.outline(0x3a2408, false, 230);
};

/** 고추잠자리: 긴 빨간 꼬리 + 투명한 날개 네 장 (프레임: 펴짐 · 떨림 · 앞으로 모음) */
const dragonfly: Draw = (g, f) => {
  const wing = 0xdde8f0;
  const vein = 0x9aaabb;
  // 날개 반 길이 (몸통에서 그림 끝까지 거의 닿는다)
  const len = f === 2 ? 4.6 : 5.6;
  const tilt = f === 1 ? -1 : 0;
  g.ellipse(11.5 - len, 7 + tilt, len, f === 1 ? 2 : 1.6, wing, 150);
  g.ellipse(11.5 - len * 0.95, 10.5 - tilt, len * 0.95, f === 1 ? 2.2 : 1.8, wing, 150);
  g.recolor((x, y) => x < 12 && (y === 7 + tilt || y === 10 - tilt) && x < 9, vein);
  g.set(Math.round(11.5 - len * 2) + 1, 7 + tilt, 0x5a3a30);
  symmetric(g);
  g.ellipse(11.5, 4, 2.4, 2, 0xb8402a);
  g.set(10, 3, 0xe86a4a);
  g.set(13, 3, 0xe86a4a);
  g.ellipse(11.5, 8.5, 1.8, 2.4, 0x8a3a24);
  for (let y = 10; y <= 21; y++) {
    const c = y % 3 === 0 ? 0xa8301e : 0xd8452c;
    g.set(11, y, c);
    g.set(12, y, y > 19 ? c : lighten(c, 0.12));
  }
  g.outline(OUT, false, 190);
};

/** 반딧불이: 주황 앞가슴 + 검은 딱지날개, 꽁무니 등불은 시간대 색을 입히지 않는다 (lantern) */
const firefly: Draw = (g, f) => {
  if (f > 0) {
    // 펼친 속날개
    g.ellipse(11.5 - 3.5 * f, 12, 2.6 * f, 3.6, 0xd8e0e8, 130);
  }
  const open = f;
  g.ellipse(11.5 - open, 13, 2.4, 4, 0x34302e);
  g.recolor((x, y) => x < 12 && x >= 10 - open && y < 11, 0x4a4440);
  symmetric(g);
  g.ellipse(11.5, 8.5, 2.6, 1.8, 0xd86a3a);
  g.rect(11, 6, 2, 2, 0x2a2420);
  g.set(10, 4, 0x2a2420);
  g.set(13, 4, 0x2a2420);
  g.outline(OUT, false, 210);
};
const fireflyLantern: Draw = (g) => {
  g.ellipse(11.5, 18, 3, 2.6, 0xffe060);
  g.ellipse(11.5, 18, 2, 1.6, 0xfff4a0);
  g.rect(11, 17, 2, 2, 0xfffde8);
};

/** 꿀벌: 노랑·검정 줄 몸통 + 투명 날개 (프레임: 위·아래·흐림) */
const bee: Draw = (g, f) => {
  const wy = f === 0 ? 8 : 10;
  g.ellipse(7, wy, 3.8, 2.6, 0xe8f4ff, f === 2 ? 110 : 170);
  g.ellipse(8, wy + 3, 2.8, 1.8, 0xe8f4ff, f === 2 ? 90 : 150);
  symmetric(g);
  g.ellipse(11.5, 13.5, 3.8, 5, 0xf0c030);
  for (const y of [11, 14, 17]) {
    g.hline(9, 14, y, 0x2a2420);
    g.hline(9, 14, y + 1, 0x2a2420);
  }
  g.recolor((x, y) => y >= 9 && y <= 18 && x <= 9 && g.get(x, y) >>> 8 === 0xf0c030, 0xf8dc70);
  g.ellipse(11.5, 7.5, 2.4, 2, 0x2a2420);
  g.set(10, 7, 0x6a6a7a);
  g.set(13, 7, 0x6a6a7a);
  g.rect(11, 19, 2, 1, 0x2a2420);
  g.set(11, 20, 0x1a1418);
  g.outline(OUT, false, 210);
};

/** 낙엽: 가을 잎 (프레임: 펼침 · 기울어짐 · 옆면) — 팔랑이며 떨어질 때 돌린다 */
const leafArt: Draw = (g, f) => {
  const c = 0xd8782a;
  const w = [6.5, 4.4, 1.6][f];
  g.ellipse(11.5, 12, w, 7.5, c);
  if (f === 0) {
    g.ellipse(6.5, 9, 2.6, 2.4, c);
    g.ellipse(16.5, 9, 2.6, 2.4, c);
    g.ellipse(7.5, 14.5, 2.4, 2, c);
    g.ellipse(15.5, 14.5, 2.4, 2, c);
  }
  g.recolor((x) => x > 11, f === 1 ? darken(c, 0.18) : lighten(c, 0.08));
  g.recolor((x, y) => y > 15 && x <= 11, 0xc06020);
  g.vline(11, 5, 19, 0x8a4a1a);
  if (f === 0)
    for (let i = 0; i < 3; i++) {
      g.set(10 - i, 10 + i, 0xa85a20);
      g.set(13 + i, 10 + i, 0xa85a20);
    }
  g.vline(11, 19, 21, 0x6a3a1a);
  g.outline(OUT, false, 200);
};

const INSECTS: Record<InsectArt, { draw: Draw; glow?: Draw }> = {
  butterfly: { draw: butterfly },
  golden: { draw: golden },
  dragonfly: { draw: dragonfly },
  firefly: { draw: firefly, glow: fireflyLantern },
  bee: { draw: bee },
  leaf: { draw: leafArt },
};

function insectSheet(art: InsectArt, tone: MeadowTone): HTMLCanvasElement {
  const s = new Grid(72, 24);
  const def = INSECTS[art];
  for (let f = 0; f < 3; f++) {
    const g = new Grid(24, 24);
    def.draw(g, f);
    // 곤충은 시간대 색을 약하게 (황금은 늘 그대로 반짝)
    if (art !== "golden") toneGrid(g, tone, 0.25);
    def.glow?.(g, f);
    s.draw(g, f * 24, 0);
  }
  return s.toCanvas();
}

// ── 잠자리채 ──

/** 잠자리채 44×44 (손잡이 끝이 오른쪽 아래 40,40 — 씬이 이 점을 축으로 휘두른다). f=1이면 그물에 뭔가 담김 */
function netSheet(): HTMLCanvasElement {
  const s = new Grid(88, 44);
  for (let f = 0; f < 2; f++) {
    const g = new Grid(44, 44);
    // 손잡이 (대나무)
    for (let i = 0; i < 22; i++) {
      g.set(20 + i, 21 + i, 0xb8925a);
      g.set(21 + i, 21 + i, 0x8a6a3a);
      g.set(20 + i, 22 + i, 0x8a6a3a);
    }
    for (const k of [6, 13]) g.set(20 + k, 20 + k, 0xe0c890);
    // 그물 (테 안 엇갈린 실)
    const cx = 13;
    const cy = 13;
    g.ellipse(cx, cy, 10, 10, 0xf0ece0, 70);
    for (let y = 3; y < 24; y++)
      for (let x = 3; x < 24; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > 9.6) continue;
        if ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0) g.set(x, y, 0xf4f0e6, 170);
      }
    if (f === 1) {
      // 담긴 것: 그물이 불룩 + 날개 빛
      g.ellipse(cx + 1, cy + 1, 5, 4, 0x2a2420, 120);
      g.set(cx - 1, cy, 0xfff6c0);
      g.set(cx + 3, cy + 1, 0xfff6c0);
      g.set(cx + 1, cy - 1, 0xf6f2e4);
    }
    // 테 (두께 2)
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      g.set(cx + Math.cos(t) * 10, cy + Math.sin(t) * 10, 0xc8a46a);
      g.set(cx + Math.cos(t) * 9.4, cy + Math.sin(t) * 9.4, 0xe0c890);
    }
    g.outline(OUT, false, 220);
    s.draw(g, f * 44, 0);
  }
  return s.toCanvas();
}

/** 조각 시트 8칸 (4×4): 꽃잎 4색 · 반짝이 · 빛 가루 · 낙엽 부스러기 · 풀 부스러기 */
function bitsSheet(): HTMLCanvasElement {
  const g = new Grid(32, 4);
  const petals = [0xf4b8cc, 0xf6f2e4, 0xf0d060, 0xc8b8f0];
  petals.forEach((c, i) => {
    const ox = i * 4;
    g.rect(ox + 1, 0, 2, 3, c);
    g.set(ox, 1, c);
    g.set(ox + 3, 2, lighten(c, 0.3));
    g.set(ox + 2, 3, darken(c, 0.15));
  });
  g.set(17, 0, 0xfff6c0);
  g.rect(16, 1, 3, 1, 0xfff6c0);
  g.set(17, 1, 0xffffff);
  g.set(17, 2, 0xfff6c0);
  g.rect(21, 1, 2, 2, 0xffe890);
  g.rect(24, 1, 3, 2, 0xa85a20);
  g.set(25, 0, 0xd8782a);
  g.rect(29, 0, 1, 3, 0x7f8b4c);
  g.set(30, 1, 0x98a35e);
  return g.toCanvas();
}

function shadowGrid(): HTMLCanvasElement {
  const g = new Grid(14, 6);
  g.ellipse(7, 3, 6.5, 2.4, 0x000000, 80);
  return g.toCanvas();
}

// ── 텍스처 올리기 ──

function addSheet(scene: Phaser.Scene, key: string, build: () => HTMLCanvasElement, fw?: number, fh?: number, frames = 0): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, build());
  if (!tex || !fw || !fh) return;
  for (let i = 0; i < frames; i++) tex.add(i, 0, i * fw, 0, fw, fh);
}

export function ensureMeadowTextures(scene: Phaser.Scene, tone: MeadowTone, bushes: readonly { slot: number; r: number; variant: number }[]): void {
  addSheet(scene, MTEX.ground(tone), () => groundTile(tone));
  for (const b of bushes) addSheet(scene, MTEX.bush(b.slot, tone), () => bush(b.r, b.variant, tone));
  addSheet(scene, MTEX.sign(tone), () => sign(tone));
  for (const k of ["pond", "stone", "flower", "clover", "tuft"] as const)
    for (let v = 0; v < DECOR_VARIANTS; v++)
      addSheet(scene, MTEX.decor(k, v, tone), () => {
        const g = decorGrid(k, v);
        toneGrid(g, tone);
        return g.toCanvas();
      });
  for (const a of Object.keys(INSECTS) as InsectArt[]) addSheet(scene, MTEX.insect(a, tone), () => insectSheet(a, tone), 24, 24, 3);
  addSheet(scene, MTEX.net, netSheet, 44, 44, 2);
  addSheet(scene, MTEX.bits, bitsSheet, 4, 4, 8);
  addSheet(scene, MTEX.shadow, shadowGrid);
  addSheet(scene, MTEX.glow, () =>
    radial(32, [
      [0, "rgba(255,244,170,0.95)"],
      [0.3, "rgba(255,226,110,0.45)"],
      [1, "rgba(255,210,80,0)"],
    ]),
  );
  // 가장자리 어둠 (노을·밤) — 가운데 투명, 바깥으로 짙게
  addSheet(scene, MTEX.shade, () =>
    radial(128, [
      [0, "rgba(0,0,0,0)"],
      [0.55, "rgba(0,0,0,0)"],
      [1, "rgba(0,0,0,0.85)"],
    ]),
  );
  addSheet(scene, MTEX.cloud, () =>
    radial(64, [
      [0, "rgba(10,20,10,0.5)"],
      [0.6, "rgba(10,20,10,0.25)"],
      [1, "rgba(10,20,10,0)"],
    ]),
  );
}

/** 곤충 채집 문구 */
export const MEADOW_TEXT = {
  feature: "벌은 건드리지 마세요",
  decoy: "낙엽이에요",
  miss: "날아갔다",
  ready: "준비",
  go: "시작!",
  end: "끝!",
} as const;
