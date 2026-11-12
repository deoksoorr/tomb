import { isPaidShape, type GraveShape } from "../graveShape";
import { GEAR_SHEET_IDS } from "./avatarGear";
import { COSMETIC_FX_IDS, fxIconGrid } from "./cosmeticFx";
import { ghostCat, miniLantern } from "./extras";
import { forageIconCanvas, isForageIcon } from "./forageIcons";
import { GRAVE_STONE_H, graveCanvas } from "./graves";
import { MEGAPHONE_ICON_IDS, megaphoneIcon } from "./megaphoneIcon";
import { DYE_ICON_IDS, dyeIcon } from "./dyeIcons";
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

// ── v3 새 아이템 ──
function hatHalo(): Grid {
  const g = blank();
  // 비스듬한 금빛 고리 (속은 비어 있다) + 위로 퍼지는 빛살
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    const x = Math.round(8 + Math.cos(t) * 6.2);
    const y = Math.round(10 + Math.sin(t) * 2.6);
    g.set(x, y, y <= 9 ? 0xfff4c0 : 0xf0c040);
  }
  g.outline(0x8a6a20, false, 170);
  for (const [x, y] of [[8, 2], [8, 3], [4, 4], [12, 4], [2, 6], [14, 6]]) g.set(x, y, 0xfff0a8, y <= 3 ? 230 : 150);
  return g;
}

function backWings(): Grid {
  const g = blank();
  // 위로 뾰족하게 펼친 두 날개 (아래 끝은 깃털 물결), 가운데 등
  const rows = ["1......", "11.....", "111....", "1111...", ".11111.", ".111111", "..11111", "..1111.", "...1.1.", "...1..."];
  rows.forEach((r, y) =>
    [...r].forEach((v, x) => {
      if (v !== "1") return;
      const c = x <= 1 || y >= 8 ? 0xc8d8f0 : 0xf4f8ff;
      g.set(x + 1, y + 3, c);
      g.set(14 - x, y + 3, c);
    }),
  );
  // 깃털 결
  for (const [x, y] of [[3, 7], [4, 9], [5, 10]]) {
    g.set(x, y, 0xa8bcdc);
    g.set(15 - x, y, 0xa8bcdc);
  }
  g.vline(7, 8, 10, 0x8a98b4);
  g.vline(8, 8, 10, 0x8a98b4);
  g.outline(0x4a5878);
  return g;
}

function petGhost(): Grid {
  const g = blank();
  const body = 0x4a4660;
  const lo = 0x34304a;
  g.ellipse(8, 7, 5, 5, body);
  g.rect(3, 7, 11, 5, body);
  // 물결 꼬리
  for (const x of [3, 4, 7, 8, 11, 12]) g.set(x, 12, body);
  g.recolor((x, y) => g.filled(x, y) && (x >= 11 || y >= 11), lo);
  g.ellipse(6, 7, 1, 1.3, 0xf6efd4);
  g.ellipse(10, 7, 1, 1.3, 0xf6efd4);
  g.set(8, 9, 0xb07ab0);
  g.outline(0x16141e);
  // 따라오는 작은 점들
  g.set(14, 14, 0x8a86a0, 160);
  g.set(15, 12, 0x8a86a0, 110);
  return g;
}

function feetFlowers(): Grid {
  const g = blank();
  // 발자국 두 개 + 피어난 꽃
  const print = (x: number, y: number) => {
    g.rect(x, y, 3, 4, 0x6a5641);
    g.set(x + 1, y - 1, 0x6a5641);
  };
  print(2, 10);
  print(9, 5);
  const flower = (x: number, y: number, c: number) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, c);
    g.set(x, y, 0xffe07a);
  };
  flower(6, 13, 0xf6a8c8);
  flower(13, 9, 0xffffff);
  flower(12, 2, 0xb8a8ff);
  flower(3, 6, 0xffc2a0);
  g.outline(OUT, false, 140);
  return g;
}

function auraFog(): Grid {
  const g = blank();
  // 푸른 안개 망토: 아래로 갈수록 흩어지는 물결 띠
  g.ellipse(8, 5, 4, 3, 0x5a6a8a);
  g.rect(4, 5, 9, 4, 0x5a6a8a);
  g.set(6, 4, 0xf6efd4);
  g.set(10, 4, 0xf6efd4);
  g.rect(6, 5, 5, 1, 0x1a1a24);
  g.outline(0x2a3044);
  const band = (y: number, c: number, a: number) => {
    for (let x = 0; x < 16; x++) if (Math.sin(x * 0.9 + y) > -0.3) g.set(x, y, c, a);
  };
  band(10, 0xa8c4e8, 220);
  band(12, 0x8aaad8, 170);
  band(14, 0x7a98c8, 110);
  return g;
}

function rainbowIcon(): Grid {
  const g = blank();
  const bands = [0xff6a6a, 0xffb050, 0xfff07a, 0x7ae08a, 0x7ab8ff, 0xb08aff];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 13.5);
      const i = Math.floor(7.6 - d);
      if (i >= 0 && i < bands.length && y <= 12) g.set(x, y, bands[i]);
    }
  g.ellipse(2.5, 13, 2.6, 1.6, 0xf4f6ff);
  g.ellipse(13, 13, 2.6, 1.6, 0xf4f6ff);
  g.outline(OUT, false, 120);
  return g;
}

function butterflyIcon(): Grid {
  const g = blank();
  const w = (x: number, y: number, rx: number, ry: number, c: number) => g.ellipse(x, y, rx, ry, c);
  w(4.5, 5, 3.4, 3, 0xffa8d4);
  w(11.5, 5, 3.4, 3, 0xffa8d4);
  w(5, 10.5, 2.5, 2.2, 0xff80b8);
  w(11, 10.5, 2.5, 2.2, 0xff80b8);
  g.set(4, 4, 0xffe4f0);
  g.set(12, 4, 0xffe4f0);
  g.vline(8, 3, 12, 0x3a2a30);
  g.set(7, 2, 0x3a2a30);
  g.set(9, 2, 0x3a2a30);
  g.outline(0x6a2440);
  return g;
}

function snowmanIcon(): Grid {
  const g = blank();
  g.ellipse(8, 11, 4.6, 4, 0xf4f8ff);
  g.ellipse(8, 5, 3.4, 3.2, 0xf4f8ff);
  g.recolor((x, y) => g.filled(x, y) && x >= 10, 0xc8d4e8);
  g.set(7, 4, 0x2a2a30);
  g.set(9, 4, 0x2a2a30);
  g.set(8, 5, 0xf08a3a);
  g.hline(5, 11, 8, 0xd04a3c);
  g.vline(10, 9, 10, 0xa8382e);
  g.set(8, 11, 0x3a3a40);
  g.set(8, 13, 0x3a3a40);
  g.outline(0x5a6a84);
  g.set(1, 9, 0x6a4a30);
  g.set(2, 10, 0x6a4a30);
  g.set(14, 9, 0x6a4a30);
  return g;
}

function flowerpotIcon(): Grid {
  const g = blank();
  g.rect(3, 9, 10, 2, 0xd88a5a);
  for (let y = 11; y <= 14; y++) g.hline(4 + (y > 13 ? 1 : 0), 11 - (y > 13 ? 1 : 0), y, y === 14 ? 0x8e4a2a : 0xb8683c);
  g.vline(8, 4, 8, 0x4f8a40);
  g.ellipse(5.5, 6.5, 1.8, 1, 0x6aa850);
  g.ellipse(10.5, 5.5, 1.8, 1, 0x6aa850);
  g.ellipse(8, 2.5, 2.2, 2, 0xffd84a);
  g.set(8, 2, 0xf08a3a);
  g.outline(OUT);
  return g;
}

function fwMeteor(): Grid {
  const g = blank();
  // 비스듬한 별똥별 세 줄기
  const streak = (x: number, y: number, len: number, c: number) => {
    for (let i = 0; i < len; i++) g.set(x - i, y + i, c, Math.max(50, 255 - i * Math.floor(200 / len)));
    star(g, x, y, c);
  };
  streak(13, 2, 8, 0xd8f0ff);
  streak(9, 7, 6, 0xfff0b0);
  streak(14, 10, 5, 0xffd0e8);
  for (const [x, y] of [[2, 2], [5, 13], [11, 14]]) g.set(x, y, 0xffffff, 170);
  return g;
}

/** 폭죽 꼬리 (아래에서 솟는 금빛 줄) */
function fwTail(g: Grid, x: number, top: number) {
  g.vline(x, top, 14, 0xffb860);
  g.set(x, 15, 0xffe08a, 140);
}

function fwFountain(): Grid {
  const g = blank();
  // 땅에 놓인 통 + 위로 뿜는 금빛 불티
  g.rect(6, 12, 4, 4, 0xd84a3a);
  g.hline(6, 9, 12, 0xf07a6a);
  const pts: [number, number, number][] = [[8, 10, 0xffffff], [7, 8, 0xfff4d0], [9, 7, 0xffe08a], [8, 5, 0xffe08a], [6, 4, 0xffb860], [10, 4, 0xffb860], [5, 7, 0xffd060], [11, 7, 0xffd060], [4, 10, 0xffb860], [12, 10, 0xffb860], [8, 2, 0xfff4d0], [3, 13, 0xffb860], [13, 13, 0xffb860]];
  for (const [x, y, c] of pts) g.set(x, y, c);
  g.outline(OUT, false, 140);
  return g;
}

function fwRing(): Grid {
  const g = blank();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.set(Math.round(8 + Math.cos(a) * 5.5), Math.round(6 + Math.sin(a) * 5), i % 2 ? 0x8fe0ff : 0xd8f6ff);
  }
  g.set(8, 6, 0xffffff);
  fwTail(g, 8, 12);
  g.outline(OUT, false, 120);
  return g;
}

function fwStar(): Grid {
  const g = blank();
  const rows = [".....1.....", ".....1.....", "....111....", "11111111111", ".111111111.", "..1111111..", "..111.111..", ".111...111.", ".11.....11."];
  rows.forEach((r, y) => [...r].forEach((v, x) => v === "1" && g.set(x + 2, y + 2, y < 4 ? 0xfff6b0 : 0xffe45a)));
  g.set(7, 6, 0xffffff);
  g.outline(0x6a5010);
  for (const [x, y] of [[1, 1], [14, 2], [1, 13], [14, 12]]) g.set(x, y, 0xfff6b0);
  return g;
}

function fwSpiral(): Grid {
  const g = blank();
  // 가운데에서 풀려 나오는 팔 두 개 (보라·청록)
  for (let i = 0; i < 14; i++) {
    const f = i / 13;
    for (const [arm, c] of [[0, 0xd0a0ff], [Math.PI, 0x8fe0ff]] as const) {
      const a = arm + f * 3.4;
      g.set(Math.round(8 + Math.cos(a) * (1 + f * 6)), Math.round(7 + Math.sin(a) * (1 + f * 6)), c, 120 + Math.round(f * 135));
    }
  }
  g.set(8, 7, 0xffffff);
  g.outline(OUT, false, 120);
  return g;
}

function fwWillow(): Grid {
  const g = blank();
  // 위에서 퍼져 축 늘어지는 금빛 가지
  for (const dir of [-1, 1]) {
    for (const [dx, dy, a] of [[1, 0, 255], [2, 0, 255], [3, 1, 240], [4, 2, 220], [5, 4, 200], [5, 6, 170], [5, 8, 140], [5, 10, 110]] as const) g.set(8 + dir * dx, 3 + dy, 0xffd060, a);
    for (const [dx, dy, a] of [[1, 1, 255], [2, 3, 220], [2, 5, 180], [2, 7, 140], [2, 9, 100]] as const) g.set(8 + dir * dx, 3 + dy, 0xffb860, a);
  }
  g.set(8, 2, 0xffffff);
  g.set(8, 3, 0xfff4d0);
  g.outline(OUT, false, 110);
  return g;
}

function fwCrossette(): Grid {
  const g = blank();
  // 가운데 빨간 불꽃 + 네 끝에서 다시 터진 작은 십자
  rays(g, 8, 7, 3, 0xffc0a8, 0xff7a62, 0xff4a4a);
  for (const [x, y] of [[3, 2], [13, 2], [3, 12], [13, 12]]) star(g, x, y, 0xe2ecff);
  g.outline(OUT, false, 120);
  return g;
}

function fwSmile(): Grid {
  const g = blank();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.set(Math.round(8 + Math.cos(a) * 6.4), Math.round(8 + Math.sin(a) * 6.4), 0xffe45a);
  }
  g.rect(5, 5, 2, 2, 0xffffff);
  g.rect(10, 5, 2, 2, 0xffffff);
  for (const [x, y] of [[4, 9], [5, 10], [6, 11], [7, 11], [8, 11], [9, 11], [10, 10], [11, 9]]) g.set(x, y, 0xfff0c0);
  g.outline(0x6a5010, false, 160);
  return g;
}

function fwWaterfall(): Grid {
  const g = blank();
  // 위쪽 가로 불꽃 줄 + 아래로 흘러내리는 은빛 줄기
  g.hline(1, 14, 2, 0xffffff);
  for (let x = 1; x <= 14; x += 2) {
    const len = 6 + ((x * 7) % 5);
    for (let d = 1; d <= len; d++) g.set(x, 2 + d, d % 3 === 0 ? 0xffffff : 0xbcd0ff, Math.max(60, 255 - d * 18));
  }
  g.outline(OUT, false, 120);
  return g;
}

function fwLetter(): Grid {
  const g = blank();
  // 불꽃 점으로 쓴 "Hi" + 아래 로켓 꼬리
  const dots: [number, number][] = [
    [2, 2], [2, 4], [2, 6], [2, 8], [4, 5], [6, 2], [6, 4], [6, 6], [6, 8],
    [9, 2], [9, 5], [9, 7], [9, 9],
    [12, 3], [13, 5], [12, 7], [14, 2], [14, 8],
  ];
  const cols = [0xffe08a, 0xff8fb8, 0x8fe0ff, 0xd0a0ff];
  dots.forEach(([x, y], i) => {
    g.set(x, y, 0xffffff);
    g.set(x + 1, y, cols[Math.floor((x / 16) * cols.length)], 170);
    void i;
  });
  g.vline(8, 11, 14, 0xffb860);
  g.set(8, 15, 0xffe08a, 140);
  g.outline(OUT, false, 120);
  return g;
}

// ── F8 캐릭터 꾸미기 추가분 (시트에 그려지는 머리·목·손·등): 문자 그림 16×16 ──

type Ascii = { rows: readonly string[]; pal: Record<string, Color> };

const GEAR_ICONS: Record<string, Ascii> = {
  hat_beanie: {
    rows: ["", ".......ww", "......wwww", ".......ww", ".....oooooo", "...oooooooooo", "..oooooooooooo", "..oooooooooool", "..ooooooooooll", "..rrrrrrrrrrrr", "..rorororororo", "..rrrrrrrrrrrr"],
    pal: { o: 0xd8743a, l: 0xa8522a, r: 0xf0a060, w: 0xf6efe0 },
  },
  hat_headphones: {
    rows: ["", ".....bbbbbb", "....b......b", "...b........b", "..b..........b", "..b..........b", ".cc..........cc", ".cpc........cpc", ".ccc........ccc", ".ccc........ccc", "..c..........c"],
    pal: { b: 0x5a5a6e, c: 0x7a7a92, p: 0xff7aa0 },
  },
  hat_crown: {
    rows: ["", "", "..h....hh....h", "..g...gggg...g", "..gg.gggggg.gg", "..gggggggggggg", "..ggggrggbgggg", "..gggggggggggg", "..llllllllllll"],
    pal: { g: 0xf2c43a, l: 0xb88a1a, h: 0xfff0a0, r: 0xe0405a, b: 0x4a8ae8 },
  },
  hat_ribbon: {
    rows: ["", "..ppp......ppp", "..pppp....pppp", "..ppppp..ppppp", "..pppppkkppppp", "..ppppp..ppppp", "..pppd....dppp", "..pdd......ddp", "", "....dddddddd", "...d........d", "..d..........d"],
    pal: { p: 0xff7aa8, d: 0xd04a7a, k: 0xffc8dc },
  },
  hat_party: {
    rows: [".......pp", ".......pp", ".......ab", "......abba", "......bbaa", ".....aabbaa", ".....bbaabb", "....aabbaabb", "....bbaabbaa", "...aabbaabbaa", "...bbaabbaabb", "..aabbaabbaabb"],
    pal: { a: 0x5ab8e8, b: 0xffd04a, p: 0xff6a9a },
  },
  hat_glasses: {
    rows: ["", "", "", "", "f", "fffffff..fffffff", ".fllllf..fllllf", ".fllwlffffllwlf", ".fllllf..fllllf", ".ffffff..ffffff"],
    pal: { f: 0xc8904a, l: 0x9ad0e8, w: 0xffffff },
  },
  hat_wizard: {
    rows: [".........pp", "........ppp", ".......pppp", ".......ppppp", "......ppsppp", "......pppppp", ".....ppppppp", ".....pppppppp", "....yyyyyyyyy", "....ppppppppp", ".bbbbbbbbbbbbbb", "..bbbbbbbbbbbb"],
    pal: { p: 0x6a3aa8, s: 0xfff07a, y: 0xffd04a, b: 0x4a2a7a },
  },
  hat_cap: {
    rows: ["", "", "", "......d", "....hhccccc", "...hhcccccccc", "..hhcccwwcccc", "..hccccwwccccc", "..cccccccccccc", "..dddddddddddddd", "............ddd"],
    pal: { c: 0x3a6ac8, h: 0x6a9ae8, d: 0x2a4a98, w: 0xffffff },
  },
  hat_sprout: {
    rows: ["", "...aa......bbb", "..aaaa....bbbbb", "..aaaaa..bbbbb", "...aaaas.bbbb", ".....aasbb", ".......s", ".......s", ".......s", "......sss", ".....ccccc", "....cc...cc"],
    pal: { a: 0x9cd46a, b: 0x7ab84a, s: 0x5a8a3c, c: 0xb0b0c0 },
  },
  neck_tie: {
    rows: ["", "....wwwwwwww", ".....ww..ww", "......nnnn", ".......nn", "......nnnn", "......nsnn", "......nnsn", "......nnns", "......nsnn", "......nnsn", ".......nn"],
    pal: { w: 0xf0f0f0, n: 0x2a4a9a, s: 0x6a8ad8 },
  },
  neck_badge: {
    rows: ["..bb........bb", "...bb......bb", "....bb....bb", ".....bb..bb", "......bbbb", ".......mm", "....wwwwwwww", "....bbbbbbbb", "....wwwwwwww", "....wkkwwggw", "....wkkwwwww", "....wwwwgggw", "....wwwwwwww"],
    pal: { b: 0x3a8ae8, m: 0x9a9aa8, w: 0xf4f4f4, k: 0x8a7a6a, g: 0x9a9aa8 },
  },
  neck_bowtie: {
    rows: ["", "", "", "..rr........rr", "..rrrr....rrrr", "..rrrrrkkrrrrr", "..rrrrkkkkrrrr", "..rrrrrkkrrrrr", "..rrrr....rrrr", "..rr........rr"],
    pal: { r: 0xd8405a, k: 0xa02a40 },
  },
  neck_bell: {
    rows: ["", "cccccccccccccccc", "cccccccccccccccc", ".......kk", "......gggg", ".....gghggg", ".....ghgggg", "....gggggggg", "....gggggggg", "....llllllll", ".......dd"],
    pal: { c: 0xc8463c, g: 0xf2c43a, h: 0xfff0a0, l: 0xb88a1a, k: 0x7a5a1a, d: 0x7a5a1a },
  },
  hand_coffee: {
    rows: [".........g", "........g", ".......g", "....wwwwwww", "....wwwwwww", ".....eiiie", ".....ebibe", ".....ebbbe", ".....essse", ".....essse", ".....ebbbe", "......bbb"],
    pal: { g: 0x3aa86a, w: 0xf4f4f4, e: 0xdde8ee, i: 0xcfe8f4, b: 0x4a2a18, s: 0x2a6a4a },
  },
  hand_briefcase: {
    rows: ["", "", "......kkkk", ".....k....k", "..llllllllllll", "..bbbbbbbbbbbb", "..bbbbbbggbbbb", "..bbbbbbggbbbb", "..dddddddddddd", "..bbbbbbbbbbbb", "..bbbbbbbbbbbb", "..bbbbbbbbbbbb", "..dddddddddddd"],
    pal: { k: 0x3a2414, l: 0x9a6a3a, b: 0x7a4a2a, g: 0xf2c43a, d: 0x5a3420 },
  },
  hand_phone: {
    rows: ["", "..........r", ".....kkkkkk", ".....kssssk", ".....ksbbsk", ".....kssssk", ".....kbbssk", ".....kssssk", ".....ksbbsk", ".....kssssk", ".....kkkkkk", ".....kkwwkk", ".....kkkkkk"],
    pal: { k: 0x2a2a34, s: 0x9ad8ff, b: 0xffffff, w: 0x6a6a7a, r: 0xe84a5a },
  },
  hand_lantern_blue: {
    rows: [".......kk", "......k..k", ".......kk", ".....tttttt", "....tccccccT", "....tcllllcT", "....tclwwlcT", "....tclwwlcT", "....tcllllcT", "....tccccccT", ".....tttttt"],
    pal: { t: 0x2a4a5a, T: 0x1e3640, c: 0x4a8aa0, l: 0x8ae8ff, w: 0xe8ffff, k: 0x2a3a4a },
  },
  back_backpack: {
    rows: [".....ssssss", "....s......s", "...pppppppppp", "..pphhhhhhhhpp", "..pphhhhhhhhpp", "..pppppppppppp", "..pppppppppppp", "..pplllllllppp", "..ppl.....lppp", "..ppl..k..lppp", "..pplllllllppp", "..pppppppppppp", "...pppppppppp"],
    pal: { p: 0x7a8a4a, h: 0x9aaa6a, l: 0x5a6a32, k: 0xd8c8a0, s: 0x5a4a32 },
  },
  back_cape: {
    rows: ["", "..yy........yy", "..rrrrrrrrrrrr", "..rhrrrrrrrrrl", ".rhrrrrrrrrrrrl", ".rhrrrrrrrrrrrl", "rhrrrrrrrrrrrrrl", "rhrrrrrrrrrrrrrl", "rhrrrrrrrrrrrrrl", "rhrrrrrrrrrrrrrl", "r.rr.rr.rr.rr.rl"],
    pal: { r: 0xb83a4a, h: 0xd85a68, l: 0x8a2a38, y: 0xf2c43a },
  },
  // ── 추가분 2 (11/12) ──
  hat_beret: {
    rows: ["", "", "", "......d", "....rrrrrr", "...hrrrrrrrr", "..rrrrrrrrrrr", ".rrrrrrrrrrrrr", "..dddddddddd"],
    pal: { r: 0xc8404e, h: 0xe06a74, d: 0x8e2a36 },
  },
  hat_hardhat: {
    rows: ["", "", "", ".....yyyyy", "....yyhyyyl", "...yyyhyyyll", "..yyyyhyygyll", "..yyyyhyyyyll", ".llllllllllllll"],
    pal: { y: 0xf2c43a, h: 0xfff09a, l: 0xc8961a, g: 0x3aa86a },
  },
  hat_chef: {
    rows: ["...wwww.wwww", "..wwwwwwwwwws", "..wwwwwwwwwws", "..wwwwwwwwwws", "...wwwwwwwws", "...wwwwwwwws", "...eeeeeeeee", "...wwwwwwwww"],
    pal: { w: 0xfbfbf6, s: 0xdcdcd2, e: 0xe0e0d6 },
  },
  hat_horns: {
    rows: ["", "", "..t.........t", "...t.......t", "...cc.....cc", "..ccc.....ccc", "..ccc.....ccc", "..ggggggggggg", "..ggggggggggg"],
    pal: { t: 0xfff0c0, c: 0xe8603a, g: 0x9fc5a8 },
  },
  hat_santa: {
    rows: ["", "...........ww", "..........rww", "........rrrr", "......rrrrrr", ".....rrrrrrr", "....rrrrrrrrl", "...rrrrrrrrrl", "..wwwwwwwwwwww", "..wwwwwwwwwwww"],
    pal: { r: 0xd8323c, l: 0xa02430, w: 0xf8f6f0 },
  },
  staff_crown: {
    rows: ["", "", "..s....bb....s", "..k...kkkk...k", "..kk.kkkkkk.kk", "..kkkkkkkkkkkk", "..kkkkkbkkkkkk", "..kkkkkkkkkkkk", "..llllllllllll"],
    pal: { k: 0x2a2838, l: 0x4a4660, s: 0xc8d0e0, b: 0x6ae0ff },
  },
  neck_collar: {
    rows: ["", "", "..wwww....wwww", "...wwww..wwww", "....wwwwwwww", ".....llllll", "......l..l"],
    pal: { w: 0xf8f8f4, l: 0xc8c8c0 },
  },
  neck_whistle: {
    rows: ["..r..........r", "...r........r", "....r......r", ".....r....r", "......rrrr", ".....mmmmmmm", ".....mmmmmmd", "......mmmmd"],
    pal: { r: 0xe84a5a, m: 0xc8ccd8, d: 0x8a90a0 },
  },
  neck_camera: {
    rows: ["..s..........s", "...s........s", "....s......s", "...kkkkkkkkkk", "...kggggggwgk", "...kkkbbbkkkk", "...kkbllbkkkk", "...kkbllbkkkk", "...kkkbbbkkkk", "...kkkkkkkkkk"],
    pal: { s: 0x2a2a34, k: 0x3a3a46, g: 0x5a5a68, w: 0xf4f4f4, b: 0x4a7aa8, l: 0x8ad0f0 },
  },
  neck_pearl: {
    rows: ["", ".p............p", "..s..........s", "...p........p", "....s......s", ".....pspspsp", ".......kk", ".......kk"],
    pal: { p: 0xf8f4ec, s: 0xc8c0b4, k: 0xf0a8bc },
  },
  neck_medal: {
    rows: ["..rr......bb", "...rr....bb", "....rr..bb", ".....rrbb", "......rb", ".....gggg", "....gghggg", "....ghgggg", "....gggggl", ".....gggl"],
    pal: { r: 0xd8404a, b: 0x3a6ac8, g: 0xf2c43a, h: 0xfff0a0, l: 0xb88a1a },
  },
  staff_armband: {
    rows: ["", "", "", "..rrrrrrrrrrrr", "..rrrrrrrrrrrr", "..rryyryyryyrr", "..rryryyryyyrr", "..rryyrryyryrr", "..rrrrrrrrrrrr", "..dddddddddddd"],
    pal: { r: 0xd8323c, y: 0xf2d04a, d: 0x9a2028 },
  },
  hand_donut: {
    rows: ["", "", "....pppppp", "...pbpppcpp", "..ppppppppbp", "..pppkkkkppp", "..dddkkkkddd", "..ddddddddd", "...ddddddd", "....dddddd"],
    pal: { p: 0xf08ab0, b: 0x9ae0ff, c: 0xffffff, d: 0xd8a060, k: 0x5a3a20 },
  },
  hand_clipboard: {
    rows: ["......ss", ".....smms", "..bbbbbbbbbb", "..bwwwwwwwwb", "..bwllllllwb", "..bwwwwwwwwb", "..bwlllllwwb", "..bwwwwwwwwb", "..bwllllllwb", "..bwwwwwwwwb", "..bbbbbbbbbb"],
    pal: { b: 0x9a6a32, w: 0xf6f4ec, l: 0x9a9488, s: 0x8a8e9a, m: 0xc8ccd8 },
  },
  hand_mic: {
    rows: ["......hgg", ".....hgggg", ".....ggggg", ".....ggggg", "......ggg", ".......k", ".......k", ".......k", ".......k", ".......k", ".......k"],
    pal: { g: 0x8a8a98, h: 0xc8c8d8, k: 0x2a2a34 },
  },
  hand_bouquet: {
    rows: ["......p", ".....ppp.y", "..r...p.yyy", ".rrr.www.y", "..r.wwwww", "..gg.www.gg", "...ggggggg", "....kkkkk", "....kkkkk", ".....kkk", ".....kkk", "......k"],
    pal: { p: 0xff9ac0, y: 0xffd04a, r: 0xe84a5a, w: 0xffffff, g: 0x5aa84a, k: 0xe8d4b0 },
  },
  hand_wand: {
    rows: [".......y", ".......y", "....yyywyyy", ".....yyyyy", "......yyy", ".....yy.yy", ".......p", ".......p", ".......p", ".......p", ".......p", ".......p"],
    pal: { y: 0xffe066, w: 0xfffbe0, p: 0xd88ab8 },
  },
  staff_ledger: {
    rows: ["", "..ssssssssssw", "..sbbbbbbbbbw", "..sbbrrrrbbbw", "..sbbrrrrbbbw", "..sbbbbbbbbbw", "..sbbbbbbbbbw", "..sbbbbbbbbbw", "..sbbbbbbbbbw", "..sbbbbbbbbbw", "..ssssssssssw"],
    pal: { s: 0x3a3446, b: 0x1e1c24, r: 0xc83a3a, w: 0xe8e0d0 },
  },
  staff_lamp: {
    rows: [".......k", ".......k", ".....kkkkk", "....wwwwwww", "...wwllllwww", "...wllggllww", "...wllggllww", "...wwllllwww", "....wwwwwww", ".....kkkkk", ".......r"],
    pal: { k: 0x2a2a34, w: 0xe8f0f8, l: 0x9af0ff, g: 0xd8faff, r: 0xc83a3a },
  },
  back_shell: {
    rows: ["", ".....gggggg", "...ggpppgpppg", "..gpppgggpppgg", "..gpppgpgpppgg", "..ggggpppggggg", "..gpppgpgpppgg", "..gpppgggpppgg", "...ggpppgpppg", ".....gggggg", "....yyyyyyyy"],
    pal: { g: 0x3a6a32, p: 0x8aba6a, y: 0xd8c87a },
  },
  back_guitar: {
    rows: ["...........kk", "..........kk", ".........n", "........n", ".......n", "....www.n", "...wwwwwn", "..wwwwwnww", "..wwwwhwww", "..wwwwwwww", "...wwwwww", "....wwww"],
    pal: { k: 0x3a2414, n: 0x5a3a20, w: 0xc8803a, h: 0x2a1a0a },
  },
  back_jetpack: {
    rows: ["...rr....rr", "...mm....mm", "...ml....ml", "...mlkkkkml", "...ml....ml", "...ml....ml", "...ml....ml", "...oo....oo", "...yy....yy", "....o.....o"],
    pal: { r: 0xd8403a, m: 0xb8c0cc, l: 0x7a8292, k: 0x4a4a58, o: 0xffb03a, y: 0xfff07a },
  },
  staff_robe: {
    rows: ["", "..bb........bb", "..kkkkkkkkkkkk", "..kskkkkkkkkkr", ".kskkkkkkkkkkkr", ".kskkkkkkkkkkkr", "kskkkkkkkkkkkkkr", "kskkkkkkkkkkkkkr", "kskkkkkkkkkkkkkr", "kskkkkkkkkkkkkkr", "k.kk.kk.kk.kk.kr"],
    pal: { k: 0x24222c, s: 0x3a3846, r: 0x8a2430, b: 0x6ae0ff },
  },
};

function gearIcon(id: string): Grid | null {
  if (id === "neck_lei") {
    // U자로 늘어진 꽃 목걸이
    const g = blank();
    const cols = [0xff8ab0, 0xffe066, 0xffffff, 0xff9a5a];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = Math.round(2 + 11 * t);
      const y = Math.round(3 + 8 * Math.sin(Math.PI * t));
      const c = cols[i % cols.length];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, c);
      g.set(x, y, 0xffd84a);
    }
    g.outline(OUT, false, 170);
    return g;
  }
  const a = GEAR_ICONS[id];
  if (!a) return null;
  const g = blank();
  const oy = Math.max(0, Math.floor((16 - a.rows.length) / 2) + 1);
  a.rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && a.pal[ch] !== undefined && g.set(x, y + oy, a.pal[ch])));
  g.outline(OUT, false, 170);
  return g;
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
    case "hat_halo":
      return hatHalo().toCanvas();
    case "back_wings":
      return backWings().toCanvas();
    case "pet_ghost":
      return petGhost().toCanvas();
    case "feet_flowers":
      return feetFlowers().toCanvas();
    case "aura_fog":
      return auraFog().toCanvas();
    case "decor_rainbow":
      return rainbowIcon().toCanvas();
    case "decor_butterfly":
      return butterflyIcon().toCanvas();
    case "decor_snowman":
      return snowmanIcon().toCanvas();
    case "decor_flowerpot":
      return flowerpotIcon().toCanvas();
    case "fw_meteor":
      return fwMeteor().toCanvas();
    case "fw_letter":
      return fwLetter().toCanvas();
    case "fw_fountain":
      return fwFountain().toCanvas();
    case "fw_ring":
      return fwRing().toCanvas();
    case "fw_star":
      return fwStar().toCanvas();
    case "fw_spiral":
      return fwSpiral().toCanvas();
    case "fw_willow":
      return fwWillow().toCanvas();
    case "fw_crossette":
      return fwCrossette().toCanvas();
    case "fw_smile":
      return fwSmile().toCanvas();
    case "fw_waterfall":
      return fwWaterfall().toCanvas();
    default: {
      // F8 추가 꾸미기 (시트 그림 → 문자 아이콘, 따로 그리는 연출 → 그 그림으로 만든 아이콘)
      const f8 = gearIcon(itemId) ?? fxIconGrid(itemId) ?? megaphoneIcon(itemId) ?? dyeIcon(itemId);
      if (f8) return f8.toCanvas();
      // 낚시·채집물 (4·32번: f_/b_/h_/o_/d_)
      return forageIconCanvas(itemId) ?? unknown().toCanvas();
    }
  }
}

/** 전용 그림이 있는 아이템 id (묘비 디자인권 gs_*는 따로). 테스트: 모든 ITEMS가 여기 있거나 gs_여야 한다 */
export const ICON_IDS: readonly string[] = [
  "fw_small", "fw_heart", "fw_triple", "fw_big", "fw_grand", "fw_meteor", "fw_letter",
  "fw_fountain", "fw_ring", "fw_star", "fw_spiral", "fw_willow", "fw_crossette", "fw_smile", "fw_waterfall",
  "hat_straw", "hat_cat", "hat_flower", "hat_halo", "hand_lantern", "aura_firefly", "aura_fog", "neck_scarf",
  "back_wings", "pet_ghost", "feet_flowers",
  "decor_candles", "decor_wreath", "decor_ribbon", "decor_lantern", "decor_ghostcat", "decor_stars",
  "decor_rainbow", "decor_butterfly", "decor_snowman", "decor_flowerpot",
  // F8 추가 꾸미기
  ...GEAR_SHEET_IDS,
  ...COSMETIC_FX_IDS,
  // 23번 확성기
  ...MEGAPHONE_ICON_IDS,
  // 46번 염색권
  ...DYE_ICON_IDS,
];

/** 이 아이템에 전용 아이콘이 있는지 (없으면 물음표 아이콘) */
export function hasItemIcon(itemId: string): boolean {
  if (itemId.startsWith("gs_")) {
    const shape = itemId.slice(3) as GraveShape;
    return shape in GRAVE_STONE_H && isPaidShape(shape);
  }
  return ICON_IDS.includes(itemId) || isForageIcon(itemId);
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
