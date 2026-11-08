import type { GraveTier } from "@tomb/protocol";
import { SHAPE_SIZE, type GraveShape } from "../graveShape";
import { darken, Grid, lighten, rng, type Color } from "./pixel";

// 묘비 그림. 생존 기간 4종(나무 팻말/작은 비석/큰 비석/석탑) + 돌 십자가 + 유료 디자인 10종.
// 텍스처 = 묘비 + 앞쪽 흙무덤. 원점 y는 묘비 받침 줄(graveOriginY)에 맞춘다. Phaser 없이 캔버스만 쓴다
// (UI의 디자인 미리보기도 같은 그림을 쓴다 → graveStyles.ts).

export const GRAVE_TEX_W = 18;
export const GRAVE_MOUND_H = 6;
/** 받침 위 높이 */
export const GRAVE_STONE_H: Record<GraveShape, number> = Object.fromEntries(
  Object.entries(SHAPE_SIZE).map(([k, v]) => [k, v.h]),
) as Record<GraveShape, number>;

export function graveTexKey(shape: GraveShape, variant: number): string {
  return `grave-${shape}-${variant}`;
}
export function graveOriginY(shape: GraveShape): number {
  return GRAVE_STONE_H[shape] / (GRAVE_STONE_H[shape] + GRAVE_MOUND_H);
}

const OUT = 0x2b2a27;
const WOOD = { hi: 0x9e7f5a, mid: 0x8a6c4a, lo: 0x6b5238, grain: 0x5e4630 };
const MOSS = 0x5f6e4a;

function stonePal(variant: number) {
  const base = variant === 1 ? 0x7d8184 : 0x8b8a82;
  return { hi: lighten(base, 0.18), mid: base, lo: darken(base, 0.2), cut: darken(base, 0.38) };
}

function mound(g: Grid, sh: number) {
  const cx = g.w / 2;
  g.ellipse(cx, sh + 1.5, 7.5, 3.2, 0x5d4c3a);
  g.recolor((x, y) => y <= sh, 0x6e5b46);
  g.set(cx - 4, sh + 2, 0x4b3d30);
  g.set(cx + 3, sh + 3, 0x4b3d30);
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

function canvasFor(shape: GraveShape): Grid {
  return new Grid(SHAPE_SIZE[shape].tex, GRAVE_STONE_H[shape] + GRAVE_MOUND_H);
}

/** 고리 달린 돌 십자가 (무료 "십자 묘비") */
function crossGrave(variant: number): Grid {
  const sh = GRAVE_STONE_H.cross;
  const g = canvasFor("cross");
  mound(g, sh);
  const b = canvasFor("cross");
  const p = variant === 1 ? { hi: 0x9e9a94, mid: 0x7e7a74, lo: 0x5e5a56 } : { hi: 0xa6a9b0, mid: 0x868990, lo: 0x666870 };
  b.rect(3, 17, 12, sh - 17, p.lo);
  b.hline(3, 14, 17, p.mid);
  b.rect(7, 1, 4, 16, p.mid);
  b.rect(3, 5, 12, 4, p.mid);
  for (let a = 0; a < 24; a++) b.set(Math.round(9 + Math.cos((a / 24) * Math.PI * 2) * 4), Math.round(7 + Math.sin((a / 24) * Math.PI * 2) * 4), p.lo);
  b.vline(7, 1, 16, p.hi);
  b.hline(3, 14, 5, p.hi);
  if (variant === 2) for (const [x, y] of [[4, sh - 2], [5, sh - 1], [12, sh - 1]]) b.set(x, y, MOSS);
  g.draw(b, 0, 0);
  g.outline(OUT);
  return g;
}

// ── 유료 디자인 (공들인 특별 묘비) ──

/** 3×5 숫자 */
const DIGITS: Record<string, string[]> = {
  "4": ["1.1", "1.1", "111", "..1", "..1"],
  "0": ["111", "1.1", "1.1", "1.1", "111"],
};
function digit(g: Grid, ch: string, x0: number, y0: number, c: Color) {
  DIGITS[ch].forEach((row, y) => [...row].forEach((v, x) => v === "1" && g.set(x0 + x, y0 + y, c)));
}

function coffee(): Grid {
  const sh = GRAVE_STONE_H.coffee;
  const g = canvasFor("coffee");
  mound(g, sh);
  const b = canvasFor("coffee");
  // 받침 접시
  b.ellipse(9, sh - 1, 8, 2, 0xd8d4cc);
  b.recolor((x, y) => y >= sh - 1, 0xb4b0a8);
  // 잔
  b.rect(3, 6, 11, 11, 0xeee8da);
  b.vline(3, 6, 16, 0xfffaf0);
  b.rect(12, 6, 2, 11, 0xc8c0b0);
  b.hline(3, 13, 12, 0x8a5a3a);
  b.hline(3, 13, 13, 0x6e4430);
  // 식은 커피
  b.ellipse(8.5, 6, 5.4, 1.6, 0x5a3820);
  b.hline(4, 12, 5, 0xf4eee2);
  // 손잡이
  for (const [x, y] of [[14, 8], [15, 8], [16, 9], [16, 10], [16, 11], [15, 12], [14, 12]]) b.set(x, y, 0xe2dccc);
  g.draw(b, 0, 0);
  g.outline(OUT);
  return g;
}

function duck(): Grid {
  const sh = GRAVE_STONE_H.duck;
  const g = canvasFor("duck");
  mound(g, sh);
  const b = canvasFor("duck");
  b.rect(2, sh - 3, 14, 3, 0x8b8a82);
  b.hline(2, 15, sh - 3, 0xa4a297);
  const y = 0xf2d24a;
  const yLo = 0xd8b030;
  b.ellipse(8, 9, 6.5, 3.6, y);
  b.set(2, 6, y);
  b.set(2, 7, y);
  b.set(3, 7, y);
  b.ellipse(12, 4.5, 3.2, 3, y);
  b.rect(15, 4, 2, 2, 0xf08a30);
  b.set(16, 5, 0xd06a20);
  b.set(13, 3, 0x1a1a1a);
  b.hline(5, 10, 8, yLo);
  b.hline(6, 9, 9, yLo);
  b.recolor((x, yy) => yy >= 11 && yy < sh - 3, yLo);
  b.set(11, 3, 0xfff4b0);
  g.draw(b, 0, 0);
  g.outline(0x5a4410);
  return g;
}

function notFound(): Grid {
  const sh = GRAVE_STONE_H["404"];
  const g = canvasFor("404");
  mound(g, sh);
  const b = canvasFor("404");
  const p = { hi: 0xa8acb2, mid: 0x8a8e94, lo: 0x6a6e74, cut: 0x3e4246 };
  b.ellipse(9, 6, 7, 4.5, p.mid);
  b.rect(2, 6, 14, sh - 6, p.mid);
  shade(b, 3, 14, 0, sh, p);
  digit(b, "4", 3, 6, p.cut);
  digit(b, "0", 7, 6, p.cut);
  digit(b, "4", 11, 6, p.cut);
  b.hline(4, 13, 13, p.lo);
  b.hline(5, 12, 15, p.lo);
  g.draw(b, 0, 0);
  g.outline(OUT);
  return g;
}

/** 모니터 화면 속 커서 자리 (텍스처 좌표) */
export const MONITOR_CURSOR = { x: 10, y: 9 } as const;
function monitor(): Grid {
  const sh = GRAVE_STONE_H.monitor;
  const g = canvasFor("monitor");
  mound(g, sh);
  const b = canvasFor("monitor");
  b.rect(2, 1, 16, 14, 0xd8d0bc);
  b.hline(2, 17, 1, 0xece6d6);
  b.vline(2, 1, 14, 0xece6d6);
  b.vline(17, 1, 14, 0xb0a890);
  b.hline(2, 17, 14, 0xb0a890);
  b.rect(4, 3, 12, 9, 0x6a6458);
  b.rect(5, 4, 10, 7, 0x142218);
  b.hline(6, 11, 5, 0x5ad87a);
  b.hline(6, 9, 7, 0x5ad87a);
  b.hline(6, 8, 9, 0x3a9858);
  b.set(15, 13, 0x6ae07a);
  for (const x of [5, 7, 9]) b.set(x, 13, 0x9a927e);
  b.rect(8, 15, 4, 2, 0xb0a890);
  b.rect(5, 17, 10, 2, 0xc8c0aa);
  g.draw(b, 0, 0);
  g.outline(OUT);
  return g;
}

function sakuraStone(): Grid {
  const sh = GRAVE_STONE_H.sakura;
  const g = canvasFor("sakura");
  mound(g, sh);
  const b = canvasFor("sakura");
  const p = { hi: 0xcac6be, mid: 0xb4b0a8, lo: 0x928e86 };
  b.ellipse(10, 7, 6.5, 4.5, p.mid);
  b.rect(4, 7, 13, sh - 7, p.mid);
  shade(b, 5, 15, 0, sh, p);
  b.hline(7, 13, 11, p.lo);
  b.hline(8, 12, 13, p.lo);
  // 비석 위로 드리운 벚나무 가지
  const branch = 0x5a3e36;
  for (const [x, y] of [[1, 3], [2, 3], [3, 4], [4, 4], [5, 5], [6, 5], [7, 5], [8, 4], [9, 4], [10, 3], [11, 3], [12, 4], [13, 4], [14, 5]]) b.set(x, y, branch);
  const pink = 0xf2b8c8;
  const light = 0xfad4de;
  for (const [cx, cy] of [[2, 2], [6, 4], [11, 2], [15, 5], [4, 6], [17, 3]]) {
    b.set(cx - 1, cy, pink);
    b.set(cx + 1, cy, pink);
    b.set(cx, cy - 1, pink);
    b.set(cx, cy + 1, pink);
    b.set(cx, cy, light);
  }
  g.draw(b, 0, 0);
  g.outline(OUT);
  for (const [x, y] of [[5, sh + 1], [13, sh + 2], [9, sh + 3]]) if (g.filled(x, y)) g.set(x, y, pink);
  return g;
}

/** 서버 랙 LED 자리 (텍스처 좌표) */
export const SERVER_LEDS: readonly [number, number][] = [0, 1, 2, 3, 4, 5, 6].map((u) => [11, 2 + u * 3] as [number, number]);
function server(): Grid {
  const sh = GRAVE_STONE_H.server;
  const g = canvasFor("server");
  mound(g, sh);
  const b = canvasFor("server");
  b.rect(1, 0, 14, sh, 0x2a2d34);
  b.vline(1, 0, sh - 1, 0x3e424c);
  b.vline(14, 0, sh - 1, 0x1c1e24);
  b.hline(3, 12, 0, 0x1c1e24);
  for (let u = 0; u < 7; u++) {
    const y = 2 + u * 3;
    b.rect(3, y, 10, 2, 0x3a3e48);
    b.hline(4, 9, y + 1, 0x22252c);
    b.set(11, y, 0x2a5a32);
    b.set(12, y, 0x5a4a20);
  }
  g.draw(b, 0, 0);
  g.outline(0x111216);
  return g;
}

/** 로켓 코끝 불빛 (텍스처 좌표) */
export const ROCKET_TIP = { x: 8, y: 1 } as const;
function rocket(): Grid {
  const sh = GRAVE_STONE_H.rocket;
  const g = canvasFor("rocket");
  mound(g, sh);
  const b = canvasFor("rocket");
  // 발사대
  b.rect(1, sh - 4, 16, 4, 0x6a6a72);
  b.hline(1, 16, sh - 4, 0x8a8a92);
  b.vline(3, sh - 8, sh - 5, 0x5a5a62);
  b.vline(14, sh - 8, sh - 5, 0x5a5a62);
  // 몸통
  b.rect(6, 6, 6, 15, 0xe8e8ee);
  b.vline(11, 6, 20, 0xb8b8c4);
  b.vline(6, 6, 20, 0xffffff);
  // 코
  const red = 0xd84a3a;
  b.hline(8, 9, 1, red);
  b.hline(8, 9, 2, red);
  b.hline(7, 10, 3, red);
  b.hline(7, 10, 4, red);
  b.hline(6, 11, 5, red);
  // 창
  b.ellipse(9, 10, 1.7, 1.7, 0x6ab8f0);
  b.set(8, 9, 0xd8f0ff);
  // 날개
  for (let y = 16; y <= 21; y++) {
    const w = Math.min(2, y - 15);
    b.hline(6 - w, 5, y, red);
    b.hline(12, 11 + w, y, red);
  }
  b.rect(7, 21, 4, 2, 0x4a4a52);
  g.draw(b, 0, 0);
  g.outline(OUT);
  return g;
}

function angel(): Grid {
  const sh = GRAVE_STONE_H.angel;
  const g = canvasFor("angel");
  mound(g, sh);
  const b = canvasFor("angel");
  const m = { hi: 0xf6f4ee, mid: 0xe6e3dc, lo: 0xbab6ae, line: 0x9a968e };
  b.rect(3, sh - 5, 14, 5, m.lo);
  b.hline(3, 16, sh - 5, m.mid);
  // 접은 날개 (뒤)
  for (let y = 7; y <= 17; y++) {
    const w = y < 10 ? y - 6 : y > 14 ? 18 - y : 4;
    b.hline(6 - w, 6, y, m.hi);
    b.hline(13, 13 + w, y, m.hi);
  }
  for (const y of [10, 13, 16]) {
    b.set(3, y, m.line);
    b.set(16, y, m.line);
  }
  // 옷자락
  for (let y = 10; y <= sh - 6; y++) {
    const hw = 2 + Math.floor((y - 10) * 0.45);
    b.hline(10 - hw, 9 + hw, y, m.mid);
    b.set(9 + hw, y, m.lo);
  }
  // 모은 손, 머리, 숙인 얼굴
  b.hline(9, 10, 12, m.lo);
  b.ellipse(10, 6, 2.6, 2.8, m.mid);
  b.recolor((x, y) => y <= 4 && x >= 8 && x <= 12, m.hi);
  b.set(9, 7, m.lo);
  b.set(11, 7, m.lo);
  g.draw(b, 0, 0);
  g.outline(0x6e6a64);
  return g;
}

function crystal(): Grid {
  const sh = GRAVE_STONE_H.crystal;
  const g = canvasFor("crystal");
  mound(g, sh);
  const b = canvasFor("crystal");
  b.ellipse(9, sh - 2, 7, 2.5, 0x5a5660);
  const prism = (x0: number, x1: number, top: number, bottom: number, fill: Color, left: Color, right: Color) => {
    const mid = (x0 + x1) / 2;
    for (let y = top; y <= bottom; y++) {
      const t = Math.min(1, (y - top) / 3);
      const hw = ((x1 - x0) / 2) * t;
      for (let x = Math.round(mid - hw); x <= Math.round(mid + hw); x++) b.set(x, y, x < mid - hw / 3 ? left : x > mid + hw / 3 ? right : fill);
    }
  };
  prism(1, 6, 9, sh - 3, 0xb8a8f8, 0xd8ccff, 0x8a7ae0);
  prism(12, 17, 11, sh - 3, 0x8ad0f0, 0xc0ecff, 0x5a9ad8);
  prism(5, 13, 0, sh - 2, 0x9ad8f0, 0xd0f4ff, 0x6a9ae0);
  b.vline(8, 4, sh - 6, 0xffffff);
  g.draw(b, 0, 0);
  g.outline(0x3a3a5a);
  return g;
}

function gold(): Grid {
  const sh = GRAVE_STONE_H.gold;
  const g = canvasFor("gold");
  mound(g, sh);
  const b = canvasFor("gold");
  const p = { hi: 0xfff0a0, mid: 0xe8c050, lo: 0xb08a30, cut: 0x8a6a20 };
  b.ellipse(8, 6, 6, 4.5, p.mid);
  b.rect(2, 6, 12, 12, p.mid);
  shade(b, 3, 12, 0, 17, p);
  b.rect(1, 18, 14, sh - 18, p.lo);
  b.hline(1, 14, 18, p.mid);
  // 새긴 별
  for (const [x, y] of [[8, 7], [8, 8], [8, 9], [8, 10], [6, 9], [7, 9], [9, 9], [10, 9], [7, 11], [9, 11]]) b.set(x, y, p.cut);
  b.hline(5, 11, 14, p.cut);
  b.hline(6, 10, 16, p.cut);
  b.set(4, 4, 0xffffff);
  g.draw(b, 0, 0);
  g.outline(0x5a4410);
  return g;
}

function shapeGrid(shape: GraveShape, variant: number): Grid {
  switch (shape) {
    case "woodSign":
    case "smallStone":
    case "largeStone":
    case "pagoda":
      return templeGrave(shape, variant);
    case "cross":
      return crossGrave(variant);
    case "coffee":
      return coffee();
    case "duck":
      return duck();
    case "404":
      return notFound();
    case "monitor":
      return monitor();
    case "sakura":
      return sakuraStone();
    case "server":
      return server();
    case "rocket":
      return rocket();
    case "angel":
      return angel();
    case "crystal":
      return crystal();
    case "gold":
      return gold();
  }
}

export function graveCanvas(shape: GraveShape, variant: number): HTMLCanvasElement {
  return shapeGrid(shape, variant).toCanvas();
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

/** 내 묘비 표시: 금빛 작은 깃발 (8×12, 원점: 깃대 아래) */
export function mineFlagCanvas(): HTMLCanvasElement {
  const g = new Grid(8, 12);
  g.vline(1, 0, 11, 0x8a8478);
  g.set(1, 0, 0xe8dcb5);
  const gold = 0xf2c84a;
  for (let y = 1; y <= 5; y++) g.hline(2, 2 + Math.min(y, 6 - y) * 2, y, y === 3 ? 0xffe68a : gold);
  g.set(3, 3, 0xfff6c8);
  g.outline(0x3a2e10, false, 220);
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
