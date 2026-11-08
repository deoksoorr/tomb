import { isPaidShape, type GraveShape } from "../graveShape";
import { ghostCat, miniLantern } from "./extras";
import { GRAVE_STONE_H, graveCanvas } from "./graves";
import { Grid, type Color } from "./pixel";

// 상점·가방 아이템 픽셀아트 아이콘 (UI용). Phaser 없이 캔버스만 쓴다 (브라우저 전용: document 사용).
//  - 폭죽·꾸미기·묘비 꾸미기: 16×16
//  - 묘비 디자인권(gs_*): 32×32 티켓 (게임 안 묘비와 같은 그림)
//
//   import { itemIcon, itemIconSize } from "@/game/sprites/itemIcons";
//   const { width, height } = itemIconSize("fw_heart", 3);
//   <img src={itemIcon("fw_heart", 3)} width={width} height={height} style={{ imageRendering: "pixelated" }} />

const OUT = 0x1e1c1a;
const cache = new Map<string, string>();

function blank(): Grid {
  return new Grid(16, 16);
}

/** 다른 캔버스를 16×16 가운데(아래 정렬)에 놓는다 */
function centered(src: HTMLCanvasElement, sx = 0, sy = 0, sw = src.width, sh = src.height): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, sw, sh, Math.floor((16 - sw) / 2), Math.floor((16 - sh) / 2) + 1, sw, sh);
  return c;
}

function star(g: Grid, x: number, y: number, c: Color, big = false) {
  g.set(x, y, 0xffffff);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, c);
  if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) g.set(x + dx, y + dy, c, 140);
}

// ── 폭죽 ──
function fwSmall(): Grid {
  const g = blank();
  for (let i = 0; i < 6; i++) g.set(3 + i, 14 - i, 0x8a6a40);
  g.rect(8, 6, 3, 3, 0xd84a3a);
  g.set(10, 6, 0xf07a6a);
  // 금빛 불꽃
  for (const [dx, dy] of [[0, -3], [3, 0], [2, -2], [-2, -2], [2, 2], [0, 3], [-3, 0]]) g.set(12 + dx, 4 + dy, 0xffd060);
  star(g, 12, 4, 0xffe8a0);
  g.outline(OUT, false, 160);
  return g;
}

function fwHeart(): Grid {
  const g = blank();
  const rows = ["..11...11..", ".1111.1111.", "11111111111", "11111111111", ".111111111.", "..1111111..", "...11111...", "....111....", ".....1....."];
  rows.forEach((r, y) => [...r].forEach((v, x) => v === "1" && g.set(x + 2, y + 3, y < 2 ? 0xffb6cf : 0xff7fab)));
  g.set(4, 4, 0xffe4ee);
  g.set(5, 4, 0xffe4ee);
  g.outline(0x6a2440);
  for (const [x, y] of [[1, 1], [14, 2], [0, 12], [15, 11]]) g.set(x, y, 0xffc2d6);
  return g;
}

function fwTriple(): Grid {
  const g = blank();
  const rocket = (x: number, top: number, c: Color) => {
    g.set(x, top, c);
    g.rect(x - 1, top + 1, 3, 3, c);
    g.set(x, top + 2, 0xffffff);
    for (let y = top + 4; y < top + 8; y++) g.set(x, y, 0x8a6a40);
    g.set(x, top + 9, 0xffe08a, 180);
    g.set(x, top + 11, 0xffe08a, 100);
  };
  rocket(3, 4, 0x6ad0f0);
  rocket(8, 1, 0xffc040);
  rocket(13, 5, 0xc090f0);
  g.outline(OUT, false, 160);
  return g;
}

/** 방사형 불꽃: 8방향 빛살 (안쪽 흰색 → 바깥 색), 대각선은 조금 짧게 */
function rays(g: Grid, cx: number, cy: number, r: number, inner: Color, outer: Color, tip: Color) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 ? r - 1 : r;
    for (let d = 1; d <= len; d++) {
      const x = Math.round(cx + Math.cos(a) * d);
      const y = Math.round(cy + Math.sin(a) * d);
      g.set(x, y, d === len ? tip : d <= len / 2 ? inner : outer);
    }
  }
  g.set(cx, cy, 0xffffff);
}

function fwBig(): Grid {
  const g = blank();
  // 굵은 로켓 꼬리
  g.vline(8, 13, 15, 0xffb860);
  g.set(7, 15, 0xffe08a, 150);
  g.set(9, 14, 0xffe08a, 150);
  // 커다란 금빛 불꽃 + 안쪽 청록 고리
  rays(g, 8, 6, 6, 0xfff4d0, 0xffd060, 0xff9a40);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    g.set(Math.round(8 + Math.cos(a) * 3), Math.round(6 + Math.sin(a) * 3), 0x8fe0ff);
  }
  // 늘어지는 잔상
  for (const [x, y] of [[2, 9], [3, 11], [14, 9], [13, 11], [5, 12], [11, 12]]) g.set(x, y, 0xffd060, 150);
  g.outline(OUT, false, 140);
  return g;
}

function fwGrand(): Grid {
  const g = blank();
  // 밤하늘 액자 (금테) 안에 여러 색 불꽃이 가득
  for (let y = 1; y < 15; y++) g.hline(1, 14, y, y < 6 ? 0x1a1d3c : y < 11 ? 0x22264a : 0x2b2f58);
  g.hline(2, 13, 0, 0xffd060);
  g.hline(2, 13, 15, 0xc89a3a);
  g.vline(0, 2, 13, 0xffd060);
  g.vline(15, 2, 13, 0xc89a3a);
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) g.set(x, y, 0xffe08a);
  rays(g, 6, 6, 4, 0xfff4d0, 0xffd060, 0xffa050);
  rays(g, 11, 4, 2, 0xffe4ee, 0xff8fb8, 0xff6f9f);
  rays(g, 11, 10, 3, 0xd8f6ff, 0x8fe0ff, 0x6ab8f0);
  rays(g, 4, 11, 2, 0xf0dcff, 0xd0a0ff, 0xa070e8);
  // 아래 지평선의 작은 묘비 실루엣
  g.hline(1, 14, 14, 0x141428);
  g.rect(8, 12, 2, 2, 0x141428);
  g.rect(13, 13, 1, 1, 0x141428);
  for (const [x, y] of [[13, 7], [2, 3], [9, 13]]) g.set(x, y, 0xffffff, 200);
  return g;
}

// ── 캐릭터 꾸미기 (게임 안 모양과 같은 색) ──
function hatStraw(): Grid {
  const g = blank();
  const straw = 0xe2c27a;
  g.ellipse(8, 10.5, 7.5, 2.2, 0xb8964f);
  g.ellipse(8, 9.5, 7, 2, straw);
  g.rect(4, 4, 8, 6, straw);
  g.ellipse(8, 4.5, 4, 1.5, 0xf0d898);
  g.hline(4, 11, 8, 0x8c4a32);
  g.hline(4, 11, 7, 0xa85a3a);
  g.outline(0x5a4420);
  return g;
}

function hatCat(): Grid {
  const g = blank();
  const fur = 0x8a7aa0;
  const inner = 0xe6a3b0;
  // 머리띠 (두꺼운 호)
  for (let x = 1; x <= 14; x++) {
    const y = 12 - Math.round(Math.sin(((x - 1) / 13) * Math.PI) * 3);
    g.set(x, y, 0x5a4a70);
    g.set(x, y + 1, 0x4a3c5e);
  }
  // 세모 귀
  const ear = (x0: number, dir: 1 | -1) => {
    for (let y = 0; y < 7; y++) {
      const w = Math.floor(y * 0.8);
      g.hline(x0 - w * (dir === 1 ? 0 : 1), x0 + w * (dir === 1 ? 1 : 0) + (dir === 1 ? 0 : 0), 3 + y, fur);
      if (y >= 3) g.hline(x0 + (dir === 1 ? 1 : -w + 1), x0 + (dir === 1 ? w - 1 : -1), 3 + y, inner);
    }
  };
  ear(3, 1);
  ear(12, -1);
  g.outline(0x2e2638);
  return g;
}
function hatFlower(): Grid {
  const g = blank();
  // 머리핀
  g.hline(2, 12, 13, 0xb8b8c4);
  g.hline(3, 12, 14, 0x8a8a96);
  // 다섯 꽃잎
  const cx = 8;
  const cy = 7;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.ellipse(cx + Math.sin(a) * 3.3, cy - Math.cos(a) * 3.3, 1.9, 1.9, i % 2 ? 0xf2b8c6 : 0xf6c8d4);
  }
  g.outline(0x8a3a54);
  g.ellipse(cx, cy, 1.5, 1.5, 0xf3d36b);
  g.set(cx - 1, cy - 1, 0xfff4b0);
  g.set(13, 11, 0x5b7044);
  g.set(12, 12, 0x5b7044);
  return g;
}
function handLantern(): Grid {
  const g = blank();
  for (const [x, y] of [[6, 2], [7, 1], [8, 1], [9, 2]]) g.set(x, y, 0x3a3127);
  g.rect(5, 3, 6, 2, 0x6b4f32);
  g.rect(5, 5, 6, 7, 0xffd77a);
  g.rect(6, 6, 4, 5, 0xfff0b0);
  g.vline(5, 5, 11, 0x6b4f32);
  g.vline(10, 5, 11, 0x6b4f32);
  g.rect(5, 12, 6, 2, 0x6b4f32);
  g.outline(OUT);
  // 빛
  for (const [x, y] of [[2, 7], [13, 7], [8, 15]]) g.set(x, y, 0xffe8a0, 150);
  return g;
}

function auraFirefly(): Grid {
  const g = blank();
  const fly = (x: number, y: number) => {
    g.set(x, y, 0xfffbe0);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, 0xf2e27a, 170);
    for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) g.set(x + dx, y + dy, 0xd8c860, 70);
  };
  fly(4, 5);
  fly(11, 3);
  fly(9, 11);
  // 맴도는 궤적
  for (let a = 0; a < 18; a++) {
    if (a % 3 === 0) continue;
    const t = (a / 18) * Math.PI * 2;
    g.set(Math.round(8 + Math.cos(t) * 6), Math.round(8 + Math.sin(t) * 4.5), 0xb8c870, 80);
  }
  return g;
}

function neckScarf(): Grid {
  const g = blank();
  const red = 0xc8463c;
  const lo = 0x9a3028;
  // 목에 두른 띠 (뜨개 줄무늬)
  g.rect(2, 4, 12, 4, red);
  for (let x = 2; x <= 13; x += 2) g.vline(x, 4, 7, lo);
  g.hline(2, 13, 4, 0xe06a5a);
  // 매듭
  g.rect(9, 6, 3, 3, lo);
  // 늘어진 두 끝 (조금 벌어진다)
  for (let y = 9; y <= 13; y++) {
    g.hline(8 - Math.floor((y - 9) / 2), 9 - Math.floor((y - 9) / 2), y, red);
    g.hline(11 + Math.floor((y - 9) / 3), 12 + Math.floor((y - 9) / 3), y, y % 2 ? red : lo);
  }
  g.outline(0x4a1410);
  // 술
  for (const x of [6, 7, 12, 13]) g.set(x, 15, 0xe8d8b0);
  return g;
}
// ── 묘비 꾸미기 ──
function candles(): Grid {
  const g = blank();
  const candle = (x: number, h: number) => {
    g.rect(x, 15 - h, 3, h, 0xe8e0c8);
    g.vline(x + 2, 15 - h, 14, 0xc9c0a8);
    g.set(x + 1, 14 - h, 0x3a3127);
    g.set(x + 1, 13 - h, 0xffc45a);
    g.set(x + 1, 12 - h, 0xfff2b8);
  };
  candle(3, 7);
  candle(10, 9);
  g.outline(OUT, false, 160);
  return g;
}

function ribbonBig(): Grid {
  const g = blank();
  const c = 0x2a2a32;
  const hi = 0x5a5a68;
  // 추모 리본: 위가 둥근 고리, 아래에서 엇갈리는 두 꼬리
  const loop = [
    "...1111...",
    "..11..11..",
    ".11....11.",
    ".11....11.",
    "..11..11..",
    "...1111...",
    "....11....",
    "...1111...",
    "..11..11..",
    ".11....11.",
    "11......11",
  ];
  loop.forEach((r, y) => [...r].forEach((v, x) => v === "1" && g.set(x + 3, y + 2, c)));
  g.set(6, 3, hi);
  g.set(5, 4, hi);
  g.outline(0xb8b8c4);
  return g;
}
function wreathBig(): Grid {
  const g = blank();
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    for (const r of [4.6, 5.6]) g.set(Math.round(8 + Math.cos(t) * r), Math.round(8 + Math.sin(t) * r), a % 4 ? 0x4f7040 : 0x3c5a32);
  }
  for (const [x, y, c] of [[3, 6, 0xf2e8d4], [8, 2, 0xf2b8c6], [13, 7, 0xf2e8d4], [5, 12, 0xe6d27e], [11, 12, 0xf2b8c6], [12, 3, 0xe6d27e]] as const) {
    g.set(x, y, c);
    g.set(x + 1, y, c);
  }
  // 아래 리본
  g.rect(7, 13, 3, 2, 0xc8463c);
  g.outline(0x22301e);
  return g;
}

function starlight(): Grid {
  const g = blank();
  star(g, 4, 4, 0xfff0a0, true);
  star(g, 11, 6, 0xd8e8ff, true);
  star(g, 7, 12, 0xfff0a0);
  for (const [x, y] of [[13, 13], [2, 10], [12, 1]]) g.set(x, y, 0xffffff, 180);
  return g;
}

// ── 묘비 디자인권: 티켓 + 실제 묘비 그림 ──
function styleTicket(shape: GraveShape): HTMLCanvasElement {
  const t = new Grid(32, 32);
  const paper = 0xefe4c8;
  const edge = 0xb89a5a;
  t.rect(1, 2, 30, 28, paper);
  t.hline(1, 30, 2, 0xfff6dc);
  // 양옆 반달 홈
  for (const cy of [16]) {
    t.ellipse(1, cy, 2.5, 2.5, 0x000000, 0);
    t.ellipse(30.5, cy, 2.5, 2.5, 0x000000, 0);
  }
  for (let x = 4; x < 28; x += 2) t.set(x, 27, edge);
  t.outline(0x6a5428);
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(t.toCanvas(), 0, 0);
  // 흙무덤 줄은 빼고 묘비만, 티켓 안 아래쪽에 맞춘다
  const src = graveCanvas(shape, 0);
  const h = Math.min(GRAVE_STONE_H[shape], 24);
  const sy = GRAVE_STONE_H[shape] - h;
  ctx.drawImage(src, 0, sy, src.width, h, Math.floor((32 - src.width) / 2), 26 - h, src.width, h);
  return c;
}

function unknown(): Grid {
  const g = blank();
  g.rect(3, 3, 10, 10, 0x5a5660);
  for (const [x, y] of [[6, 5], [7, 4], [8, 4], [9, 5], [9, 6], [8, 7], [8, 8], [8, 10]]) g.set(x, y, 0xe8e0c8);
  g.outline(OUT);
  return g;
}

function base(itemId: string): HTMLCanvasElement {
  if (itemId.startsWith("gs_")) {
    const shape = itemId.slice(3) as GraveShape;
    if (shape in GRAVE_STONE_H && isPaidShape(shape)) return styleTicket(shape);
  }
  switch (itemId) {
    case "fw_small":
      return fwSmall().toCanvas();
    case "fw_heart":
      return fwHeart().toCanvas();
    case "fw_triple":
      return fwTriple().toCanvas();
    case "fw_big":
      return fwBig().toCanvas();
    case "fw_grand":
      return fwGrand().toCanvas();
    case "hat_straw":
      return hatStraw().toCanvas();
    case "hat_cat":
      return hatCat().toCanvas();
    case "hat_flower":
      return hatFlower().toCanvas();
    case "hand_lantern":
      return handLantern().toCanvas();
    case "aura_firefly":
      return auraFirefly().toCanvas();
    case "neck_scarf":
      return neckScarf().toCanvas();
    case "decor_candles":
      return candles().toCanvas();
    case "decor_wreath":
      return wreathBig().toCanvas();
    case "decor_ribbon":
      return ribbonBig().toCanvas();
    case "decor_lantern":
      return centered(miniLantern());
    case "decor_ghostcat":
      return centered(ghostCat(), 0, 0, 12, 8);
    case "decor_stars":
      return starlight().toCanvas();
    default:
      return unknown().toCanvas();
  }
}

/** 아이콘 원본 크기: 묘비 디자인권은 32, 나머지는 16 */
export function itemIconBase(itemId: string): number {
  return itemId.startsWith("gs_") ? 32 : 16;
}

export function itemIconSize(itemId: string, scale = 2): { width: number; height: number } {
  const s = Math.max(1, Math.round(scale)) * itemIconBase(itemId);
  return { width: s, height: s };
}

/** 아이템 아이콘 dataURL (정수 배율, 같은 인자면 캐시) */
export function itemIcon(itemId: string, scale = 2): string {
  const k = Math.max(1, Math.round(scale));
  const key = `${itemId}|${k}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = base(itemId);
  const out = document.createElement("canvas");
  out.width = src.width * k;
  out.height = src.height * k;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  cache.set(key, url);
  return url;
}
