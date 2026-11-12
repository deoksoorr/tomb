import type * as Phaser from "phaser";
import { makeCanvas } from "../sprites/pixel";
import { HAUNT_TILE, isWall, mulberry as mulberryCanvasSeed, type GhostLook, type Maze } from "./maze";

// 귀신의집 그림 (코드로 그리는 픽셀아트). 브라우저에서만 부른다.
//  - 마을의 귀신의집 건물·간판·벽등·문틈 안개·창 얼굴 (HauntHouseView)
//  - 미로 바닥·벽·장식 한 장, 귀신 3종(2프레임), 놀래키는 얼굴, 어둠 가리개, 촛불·달빛 번짐, 스치는 그림자

export const HTEX = {
  house: "haunt-house",
  houseGlow: "haunt-house-glow",
  lampP: "haunt-lamp-purple",
  lampG: "haunt-lamp-green",
  lampGlow: "haunt-lamp-glow",
  mist: "haunt-door-mist",
  windowFace: "haunt-window-face",
  sign: "haunt-sign",
  signGlow: "haunt-sign-glow",
  ghost: (look: GhostLook) => `haunt-ghost-${look}`,
  face: "haunt-face",
  dark: "haunt-dark",
  glow: "haunt-glow",
  moon: "haunt-moon",
  shade: "haunt-shade",
  flame: "haunt-flame",
  maze: "haunt-maze",
} as const;

export const GHOST_W = 16;
export const GHOST_H = 24;
/** 어둠 가리개 텍스처 크기와, 빛 반지름(반쯤 어두워지는 곳)이 텍스처에서 차지하는 픽셀 */
export const DARK_SIZE = 256;
export const DARK_LIGHT_PX = 40;

type Ctx = CanvasRenderingContext2D;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  ctx.globalAlpha = a;
  ctx.fillStyle = hex(c);
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}
function oval(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: number, a = 1): void {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    px(ctx, cx - w, cy + y, w * 2 + 1, 1, c, a);
  }
}

function add(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, frame?: { w: number; h: number }): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex || !frame) return;
  const cols = Math.floor(canvas.width / frame.w);
  for (let i = 0; i < cols; i++) tex.add(i, 0, i * frame.w, 0, frame.w, frame.h);
}


// ── 마을의 건물 ──

/** 귀신의집 건물 (가로 92, 세로 88, 바닥 가운데가 원점). 문은 아래 가운데. 간판·벽등·안개·얼굴은 HauntHouseView가 따로 올린다 */
export const HOUSE_W = 92;
export const HOUSE_H = 88;
/** 깨진 창(주황 불빛) 가운데 — 그림 왼쪽 위 기준 */
export const HOUSE_LIT_WINDOW = { x: 77, y: 68 } as const;
/** 가끔 귀신 얼굴이 비치는 창 가운데 (탑 둥근 창, 지붕창, 왼쪽 아래 창) — 그림 왼쪽 위 기준 */
export const HOUSE_FACE_WINDOWS: readonly { x: number; y: number }[] = [
  { x: 24, y: 27 },
  { x: 65, y: 29 },
  { x: 15, y: 68 },
];
/** 간판을 매다는 처마 높이 (그림 위에서부터) */
export const HOUSE_SIGN_Y = 39;

function houseCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(HOUSE_W, HOUSE_H);
  const r = mulberryCanvasSeed(77);
  const W = HOUSE_W;
  const H = HOUSE_H;
  // 몸체 (비틀린 판자벽)
  px(ctx, 6, 40, W - 12, H - 40, 0x3c3644);
  for (let x = 7; x < W - 6; x += 4) {
    px(ctx, x, 40, 1, H - 40, 0x2c2734);
    if (r() < 0.4) px(ctx, x + 1, 42 + Math.floor(r() * 40), 2, 3, 0x4a4352);
  }
  // 아랫단 이끼 낀 돌 기초
  px(ctx, 5, H - 5, W - 10, 5, 0x2a2830);
  for (let x = 6; x < W - 6; x += 7) px(ctx, x, H - 4, 5, 3, r() < 0.5 ? 0x34323c : 0x2e3a30);
  // 2층 탑 (왼쪽 뾰족 지붕)
  px(ctx, 10, 16, 28, 26, 0x413a4a);
  for (let x = 11; x < 38; x += 4) px(ctx, x, 16, 1, 26, 0x2f2a38);
  for (let i = 0; i < 16; i++) px(ctx, 24 - i, i, 1 + i * 2, 1, i % 3 === 0 ? 0x1d1a24 : 0x26222e);
  px(ctx, 7, 16, 34, 2, 0x1a1720);
  // 탑 꼭대기 풍향계 (부러진 화살)
  px(ctx, 24, 0, 1, 1, 0x1a1720);
  // 큰 지붕 (짙은 슬레이트, 아래로 처진 끝)
  for (let i = 0; i < 14; i++) {
    const l = Math.round(38 - i * 2.4);
    const rr = Math.round(W - 8 + i * 0.5);
    px(ctx, l, 24 + i, rr - l, 1, i % 3 === 0 ? 0x1d1a24 : 0x2a2532);
  }
  px(ctx, 2, 37, W - 4, 3, 0x17141c);
  // 처진 처마 조각
  px(ctx, 4, 40, 3, 2, 0x17141c);
  px(ctx, W - 9, 40, 4, 3, 0x17141c);
  // 굴뚝
  px(ctx, W - 18, 8, 6, 18, 0x3a2c2c);
  px(ctx, W - 19, 7, 8, 2, 0x241c1c);
  // 지붕창 (얼굴이 비치는 창)
  px(ctx, 59, 23, 12, 11, 0x1a1720);
  px(ctx, 58, 21, 14, 2, 0x17141c);
  px(ctx, 60, 25, 10, 8, 0x0c0b0f);
  px(ctx, 60, 31, 10, 2, 0x1c3024);
  // 탑 동그란 창 (희미한 초록빛)
  oval(ctx, 24, 27, 4, 4, 0x0d0b10);
  oval(ctx, 24, 27, 3, 3, 0x1c3024);
  px(ctx, 23, 25, 1, 1, 0x6a9a72);
  const win = (x: number, y: number, kind: "lit" | "dark" | "boards") => {
    px(ctx, x - 1, y - 1, 14, 14, 0x1a1720);
    px(ctx, x, y, 12, 12, kind === "lit" ? 0xb86a2a : 0x0c0b0f);
    if (kind === "lit") {
      // 깨진 유리 조각
      px(ctx, x + 2, y + 2, 2, 6, 0x0c0b0f);
      px(ctx, x + 7, y + 7, 3, 2, 0x0c0b0f);
      px(ctx, x + 5, y, 1, 4, 0x0c0b0f);
    } else if (kind === "dark") {
      // 십자 창살 + 바닥에 고인 초록 기운
      px(ctx, x + 5, y, 2, 12, 0x1a1720);
      px(ctx, x, y + 5, 12, 2, 0x1a1720);
      px(ctx, x, y + 10, 12, 2, 0x1c3024);
    } else {
      // 엇갈려 박은 판자
      for (let i = 0; i < 12; i++) px(ctx, x + i, y + 2 + Math.floor(i * 0.6), 1, 2, 0x5a4a3a);
      px(ctx, x, y + 8, 12, 2, 0x4e3f32);
    }
  };
  win(9, 62, "dark");
  win(HOUSE_LIT_WINDOW.x - 6, HOUSE_LIT_WINDOW.y - 6, "lit");
  // 문 (아치형, 반쯤 열려 안이 새까맣다)
  const dx = W / 2 - 8;
  px(ctx, dx - 2, 63, 20, H - 63, 0x1a1210);
  px(ctx, dx, 61, 16, 2, 0x1a1210);
  px(ctx, dx + 2, 60, 12, 1, 0x1a1210);
  px(ctx, dx, 64, 16, H - 64, 0x050406);
  px(ctx, dx, 64, 5, H - 64, 0x3a2418);
  px(ctx, dx + 1, 74, 1, 2, 0xb08a40);
  // 문틈 안쪽에 고인 초록 안개
  px(ctx, dx + 5, H - 4, 11, 4, 0x1c3a2a);
  px(ctx, dx + 8, H - 6, 7, 2, 0x163024);
  // 문 위 부적 한 장
  px(ctx, W / 2 + 4, 66, 4, 6, 0xd8c88a);
  px(ctx, W / 2 + 5, 67, 2, 4, 0xa02020);
  // 계단
  px(ctx, dx - 4, H - 2, 24, 2, 0x2a2630);
  // 거미줄 (오른쪽 처마 아래)
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#c8c8d0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W - 6.5, 40.5);
  ctx.lineTo(W - 14.5, 48.5);
  ctx.moveTo(W - 6.5, 40.5);
  ctx.lineTo(W - 6.5, 50.5);
  ctx.moveTo(W - 6.5, 40.5);
  ctx.lineTo(W - 16.5, 41.5);
  ctx.moveTo(W - 10.5, 40.5);
  ctx.lineTo(W - 6.5, 45.5);
  ctx.moveTo(8.5, 40.5);
  ctx.lineTo(14.5, 46.5);
  ctx.moveTo(8.5, 40.5);
  ctx.lineTo(8.5, 47.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 이끼·얼룩
  for (let i = 0; i < 56; i++) px(ctx, 6 + Math.floor(r() * (W - 12)), 40 + Math.floor(r() * (H - 46)), 1, 1, r() < 0.5 ? 0x2a3a2a : 0x221e28);
  return canvas;
}

/** 깨진 창의 은은한 빛 (ADD) */
function glowCanvas(size: number, color: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** 벽등 (7×12, 위가 원점 근처): 쇠 받침 + 뚜껑 + 색유리 + 바닥 */
function lampCanvas(glass: number, core: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(7, 12);
  px(ctx, 3, 0, 1, 2, 0x17141c);
  px(ctx, 1, 2, 5, 1, 0x17141c);
  px(ctx, 0, 3, 7, 1, 0x241f2a);
  px(ctx, 1, 4, 5, 6, 0x17141c);
  px(ctx, 2, 4, 3, 6, glass);
  px(ctx, 3, 6, 1, 2, core);
  px(ctx, 1, 10, 5, 1, 0x241f2a);
  px(ctx, 3, 11, 1, 1, 0x17141c);
  return canvas;
}

/** 문틈에서 새어 나오는 안개 한 덩이 (부드러운 납작한 타원) */
function mistCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(28, 12);
  ctx.setTransform(1, 0, 0, 12 / 28, 0, 0);
  const g = ctx.createRadialGradient(14, 14, 0, 14, 14, 14);
  g.addColorStop(0, "rgba(210,255,230,0.9)");
  g.addColorStop(0.55, "rgba(180,235,210,0.45)");
  g.addColorStop(1, "rgba(160,220,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 28, 28);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** 창에 비치는 창백한 얼굴 (5×6): 퀭한 두 눈 + 벌린 입 */
function windowFaceCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(5, 6);
  px(ctx, 1, 0, 3, 1, 0xd8e4e0);
  px(ctx, 0, 1, 5, 4, 0xe8eef0);
  px(ctx, 1, 5, 3, 1, 0xd8e4e0);
  px(ctx, 1, 2, 1, 1, 0x0a080c);
  px(ctx, 3, 2, 1, 1, 0x0a080c);
  px(ctx, 2, 4, 1, 1, 0x3a0a10);
  return canvas;
}

export function ensureHouseTextures(scene: Phaser.Scene): void {
  add(scene, HTEX.house, houseCanvas());
  add(scene, HTEX.houseGlow, glowCanvas(32, "rgba(255,150,60,0.9)"));
  add(scene, HTEX.lampP, lampCanvas(0x9a52e8, 0xf0d8ff));
  add(scene, HTEX.lampG, lampCanvas(0x3ad88a, 0xe0fff0));
  add(scene, HTEX.lampGlow, glowCanvas(32, "rgba(255,255,255,0.85)"));
  add(scene, HTEX.mist, mistCanvas());
  add(scene, HTEX.windowFace, windowFaceCanvas());
}

/** 간판 글꼴 (픽셀 글꼴 Galmuri를 이진화해 판에 새긴다). 글꼴을 불러온 뒤(whenSignFont) 그린다 */
const SIGN_FONT = `11px "Galmuri11", "Galmuri9", monospace`;
export const SIGN_TEXT = "귀신의집";

/** 간판 (나무판 + 쇠사슬 두 줄) 과 글씨만 있는 빛 층. 원점은 위 가운데(사슬을 거는 곳) */
export function ensureSignTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(HTEX.sign)) return;
  const probe = makeCanvas(8, 8).ctx;
  probe.font = SIGN_FONT;
  const tw = Math.ceil(probe.measureText(SIGN_TEXT).width);
  const bw = tw + 10;
  const bh = 15;
  const chain = 4;
  const w = bw + 2;
  const h = chain + bh + 4;
  // 글씨 한 장 (이진화) — 판·빛 층 둘 다에 쓴다
  const tctx = makeCanvas(w, h).ctx;
  tctx.font = SIGN_FONT;
  tctx.textBaseline = "alphabetic";
  tctx.fillStyle = "#ffffff";
  tctx.fillText(SIGN_TEXT, Math.round((w - tw) / 2), chain + 12);
  const img = tctx.getImageData(0, 0, w, h);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] >= 110;
  // 판
  const { canvas, ctx } = makeCanvas(w, h);
  const bx = 1;
  const by = chain;
  px(ctx, bx + 4, 0, 1, chain, 0x5a5660);
  px(ctx, bx + bw - 5, 0, 1, chain, 0x5a5660);
  px(ctx, bx, by, bw, bh, 0x1a1210);
  px(ctx, bx + 1, by + 1, bw - 2, bh - 2, 0x2e1e18);
  for (let y = by + 4; y < by + bh - 1; y += 4) px(ctx, bx + 1, y, bw - 2, 1, 0x24170f);
  // 한쪽 귀퉁이가 떨어져 나간 판
  ctx.clearRect(bx + bw - 2, by + bh - 2, 2, 2);
  // 글씨: 어두운 테두리 + 창백한 초록
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (on(x, y)) continue;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) px(ctx, x, y, 1, 1, 0x0a0608);
    }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) px(ctx, x, y, 1, 1, 0xc8ffd8);
  // 판 아래로 흘러내린 붉은 자국 (글씨는 또렷하게 두고 판 가장자리에서만)
  const r = mulberryCanvasSeed(13);
  for (let x = bx + 3; x < bx + bw - 3; x++) if (r() < 0.16) px(ctx, x, by + bh, 1, 1 + Math.floor(r() * 3), 0x8a1820);
  add(scene, HTEX.sign, canvas);
  // 빛 층: 글씨만 (ADD로 깜빡인다)
  const { canvas: gc, ctx: gctx } = makeCanvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) px(gctx, x, y, 1, 1, 0x9affc8);
  add(scene, HTEX.signGlow, gc);
}

/** 간판 글꼴을 불러온 뒤 한 번 부른다 (이미 있으면 바로) */
export function whenSignFont(cb: () => void): void {
  if (typeof document === "undefined" || !document.fonts) return cb();
  if (document.fonts.check(SIGN_FONT, SIGN_TEXT)) return cb();
  document.fonts.load(SIGN_FONT, SIGN_TEXT).then(cb, cb);
}

// ── 미로 안 ──

function ghostSheet(look: GhostLook): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(GHOST_W * 2, GHOST_H);
  for (let f = 0; f < 2; f++) {
    const o = f * GHOST_W;
    if (look === "sobok") {
      // 소복 입은 처녀귀신: 긴 검은 머리가 얼굴을 덮고, 흰 옷자락 아래는 발이 없다
      px(ctx, o + 4, 9, 8, 13, 0xe8e6e0);
      px(ctx, o + 3, 13, 10, 8, 0xe8e6e0);
      px(ctx, o + 2, 18, 12, 4 - f, 0xd8d6d0);
      for (let x = 2; x < 14; x += 2) px(ctx, o + x + f, 21 - f, 1, 2, 0xd8d6d0);
      px(ctx, o + 3, 11, 1, 7, 0xd0cec8);
      px(ctx, o + 12, 11, 1, 7, 0xd0cec8);
      // 머리카락 (어깨 아래까지)
      px(ctx, o + 4, 1, 8, 3, 0x0a080c);
      px(ctx, o + 3, 3, 10, 12 + f, 0x0a080c);
      px(ctx, o + 2, 6, 1, 8, 0x0a080c);
      px(ctx, o + 13, 6, 1, 9 - f, 0x0a080c);
      // 머리카락 사이로 보이는 창백한 얼굴 한 줄기와 눈 하나
      px(ctx, o + 7, 5, 2, 6, 0xc8d0d8);
      px(ctx, o + 7, 7, 1, 1, 0x000000);
      px(ctx, o + 8, 9, 1, 1, 0x5a1010);
    } else if (look === "sheet") {
      // 보자기 유령: 둥근 머리, 뻥 뚫린 눈과 입
      oval(ctx, o + 8, 8, 6, 6, 0xf0f0f4);
      px(ctx, o + 2, 8, 13, 12, 0xf0f0f4);
      for (let x = 2; x < 15; x += 3) px(ctx, o + x + (f ? 1 : 0), 20, 2, 2, 0xe0e0e8);
      px(ctx, o + 2, 10, 1, 9, 0xd8d8e2);
      oval(ctx, o + 6, 8, 1, 2, 0x0a0a10);
      oval(ctx, o + 10, 8, 1, 2, 0x0a0a10);
      oval(ctx, o + 8, 13, 1, 1 + f, 0x0a0a10);
    } else {
      // 그림자 사람: 새까만 몸, 붉은 눈 두 점
      oval(ctx, o + 8, 5, 3, 4, 0x050407);
      px(ctx, o + 5, 8, 6, 12, 0x050407);
      px(ctx, o + 4, 10, 1, 8 + f, 0x050407);
      px(ctx, o + 11, 10, 1, 8 - f, 0x050407);
      px(ctx, o + 5, 20, 2, 4 - f, 0x050407);
      px(ctx, o + 9, 20, 2, 3 + f, 0x050407);
      px(ctx, o + 6, 4, 1, 1, 0xff3030);
      px(ctx, o + 9, 4, 1, 1, 0xff3030);
    }
  }
  return canvas;
}

/** 놀래키는 얼굴 (64×64, 크게 늘려 화면을 채운다) */
function faceCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 64);
  const r = mulberryCanvasSeed(13);
  // 머리카락 (위·양옆으로 길게 늘어진다)
  oval(ctx, 32, 28, 26, 26, 0x070509);
  px(ctx, 6, 28, 52, 36, 0x070509);
  // 창백한 얼굴
  oval(ctx, 32, 34, 16, 22, 0xb8c4c8);
  oval(ctx, 32, 36, 14, 19, 0xc8d2d4);
  // 가르마로 갈라진 앞머리가 이마를 덮는다
  for (let i = 0; i < 9; i++) {
    px(ctx, 32 - i * 2 - 2, 12 + i, 2, 6 + i, 0x070509);
    px(ctx, 32 + i * 2, 12 + i, 2, 6 + i, 0x070509);
  }
  // 퀭한 눈: 검은 구멍 + 작은 흰 눈동자
  for (const ex of [24, 40]) {
    oval(ctx, ex, 31, 6, 5, 0x6a7078);
    oval(ctx, ex, 31, 5, 4, 0x000000);
    px(ctx, ex - (ex < 32 ? -1 : 1), 31, 2, 2, 0xffffff);
    // 흘러내린 자국
    px(ctx, ex - 1, 36, 1, 8 + Math.floor(r() * 4), 0x2a2228);
  }
  // 크게 벌어진 입
  oval(ctx, 32, 47, 6, 7, 0x1a0608);
  oval(ctx, 32, 48, 5, 5, 0x000000);
  px(ctx, 28, 41, 8, 1, 0x7a8288);
  // 뺨 그늘·핏줄
  for (let i = 0; i < 26; i++) px(ctx, 18 + Math.floor(r() * 28), 18 + Math.floor(r() * 34), 1, 1, r() < 0.5 ? 0x8a9298 : 0x9aa2a8);
  px(ctx, 19, 38, 3, 6, 0x98a2a8);
  px(ctx, 42, 38, 3, 6, 0x98a2a8);
  return canvas;
}

/** 어둠 가리개: 가운데만 투명하고 바깥은 새까맣다 (빛 반지름 = DARK_LIGHT_PX 텍스처 px) */
function darkCanvas(): HTMLCanvasElement {
  const S = DARK_SIZE;
  const { canvas, ctx } = makeCanvas(S, S);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = "destination-out";
  const R = S / 2;
  const L = DARK_LIGHT_PX / R;
  const g = ctx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(L * 0.55, "rgba(0,0,0,0.96)");
  g.addColorStop(L * 0.82, "rgba(0,0,0,0.7)");
  g.addColorStop(L, "rgba(0,0,0,0.4)");
  g.addColorStop(L * 1.22, "rgba(0,0,0,0.1)");
  g.addColorStop(Math.min(1, L * 1.45), "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** 벽을 스치는 그림자 (가로로 길게 기운 사람 그림자) */
function shadeCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(24, 40);
  ctx.filter = "blur(2px)";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(12, 8, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(12, 26, 7, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";
  return canvas;
}

function flameCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(5, 7);
  px(ctx, 2, 0, 1, 1, 0xffe8a0);
  px(ctx, 1, 1, 3, 3, 0xffc050);
  px(ctx, 2, 2, 1, 3, 0xfff4d0);
  px(ctx, 1, 4, 3, 2, 0xe07020);
  return canvas;
}

export function ensureHauntTextures(scene: Phaser.Scene): void {
  for (const look of ["sobok", "sheet", "shadow"] as const) add(scene, HTEX.ghost(look), ghostSheet(look), { w: GHOST_W, h: GHOST_H });
  add(scene, HTEX.face, faceCanvas());
  add(scene, HTEX.dark, darkCanvas());
  add(scene, HTEX.glow, glowCanvas(64, "rgba(255,170,90,1)"));
  add(scene, HTEX.moon, glowCanvas(64, "rgba(170,200,230,1)"));
  add(scene, HTEX.shade, shadeCanvas());
  add(scene, HTEX.flame, flameCanvas());
}

/** 미로 한 장 (바닥 마루·벽지 벽·장식). 판마다 다시 그린다 */
export function setMazeTexture(scene: Phaser.Scene, m: Maze): void {
  if (scene.textures.exists(HTEX.maze)) scene.textures.remove(HTEX.maze);
  scene.textures.addCanvas(HTEX.maze, mazeCanvas(m));
}

function mazeCanvas(m: Maze): HTMLCanvasElement {
  const T = HAUNT_TILE;
  const { canvas, ctx } = makeCanvas(m.cols * T, m.rows * T);
  const r = mulberryCanvasSeed(m.seed);
  for (let ty = 0; ty < m.rows; ty++) {
    for (let tx = 0; tx < m.cols; tx++) {
      const x = tx * T;
      const y = ty * T;
      if (!isWall(m, tx, ty)) {
        // 마루: 가로 널판 + 이음매 + 옹이 + 얼룩
        px(ctx, x, y, T, T, 0x2b211c);
        for (let k = 0; k < 4; k++) {
          px(ctx, x, y + k * 4 + 3, T, 1, 0x1b1411);
          const seam = (tx * 7 + ty * 3 + k * 5) % 16;
          px(ctx, x + seam, y + k * 4, 1, 3, 0x1b1411);
          if (r() < 0.25) px(ctx, x + Math.floor(r() * 14), y + k * 4 + 1, 2, 1, 0x372a22);
        }
        if (r() < 0.08) oval(ctx, x + 4 + Math.floor(r() * 8), y + 4 + Math.floor(r() * 8), 3, 2, 0x2a1214, 0.8);
        continue;
      }
      const front = ty + 1 < m.rows && !isWall(m, tx, ty + 1);
      if (front) {
        // 앞면이 보이는 벽: 위 테두리 + 줄무늬 벽지 + 걸레받이
        px(ctx, x, y, T, 3, 0x1c1822);
        px(ctx, x, y + 3, T, 11, 0x3b2a35);
        for (let k = 1; k < T; k += 3) px(ctx, x + k, y + 3, 1, 11, 0x33232d);
        if (r() < 0.5) px(ctx, x + 4 + Math.floor(r() * 8), y + 6, 2, 2, 0x47333f);
        // 벗겨진 벽지
        if (r() < 0.18) px(ctx, x + Math.floor(r() * 10), y + 5 + Math.floor(r() * 5), 4, 3, 0x241a20);
        px(ctx, x, y + 14, T, 2, 0x1a1210);
      } else {
        // 벽 윗면
        px(ctx, x, y, T, T, 0x16131b);
        if (r() < 0.3) px(ctx, x + Math.floor(r() * 14), y + Math.floor(r() * 14), 2, 1, 0x1d1924);
      }
    }
  }
  // 출구 문: 달빛이 새어 드는 바닥/문틀
  const ex = m.exit.tx * T;
  const ey = m.exit.ty * T;
  px(ctx, ex, ey, T, T, 0x2f3a46);
  px(ctx, ex + 2, ey + 2, T - 4, T - 4, 0x6a8aa0);
  px(ctx, ex + 4, ey + 4, T - 8, T - 8, 0xa8c4d8);
  // 장식
  for (const d of m.decor) {
    const x = d.tx * T;
    const y = d.ty * T;
    switch (d.kind) {
      case "portrait":
        px(ctx, x + 3, y + 4, 10, 9, 0x5a4320);
        px(ctx, x + 4, y + 5, 8, 7, 0x141018);
        oval(ctx, x + 8, y + 8, 2, 3, 0x8a8a90);
        px(ctx, x + 7, y + 7, 1, 1, 0x000000);
        px(ctx, x + 9, y + 7, 1, 1, 0x000000);
        break;
      case "mirror":
        px(ctx, x + 4, y + 3, 8, 11, 0x4a3a28);
        px(ctx, x + 5, y + 4, 6, 9, 0x5a6a78);
        px(ctx, x + 6, y + 5, 1, 4, 0x8a9aa8);
        px(ctx, x + 8, y + 6, 1, 1, 0x1a1a20);
        px(ctx, x + 7, y + 7, 1, 1, 0x1a1a20);
        px(ctx, x + 9, y + 8, 1, 2, 0x1a1a20);
        break;
      case "web": {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = "#b8b8c4";
        ctx.beginPath();
        // 열린 쪽이 아닌 벽 모서리 쪽에 친다
        const cx = isWall(m, d.tx - 1, d.ty) ? x : x + T;
        const cy = isWall(m, d.tx, d.ty - 1) ? y : y + T;
        const sx = cx === x ? 1 : -1;
        const sy = cy === y ? 1 : -1;
        ctx.moveTo(cx + 0.5, cy + 0.5);
        ctx.lineTo(cx + sx * 9.5, cy + 0.5);
        ctx.moveTo(cx + 0.5, cy + 0.5);
        ctx.lineTo(cx + 0.5, cy + sy * 9.5);
        ctx.moveTo(cx + 0.5, cy + 0.5);
        ctx.lineTo(cx + sx * 7.5, cy + sy * 7.5);
        ctx.moveTo(cx + sx * 5.5, cy + 0.5);
        ctx.lineTo(cx + sx * 4.5, cy + sy * 4.5);
        ctx.lineTo(cx + 0.5, cy + sy * 5.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case "chair":
        // 넘어진 의자
        px(ctx, x + 3, y + 9, 10, 2, 0x3a2416);
        px(ctx, x + 3, y + 5, 2, 4, 0x3a2416);
        px(ctx, x + 11, y + 11, 1, 3, 0x2a1a10);
        px(ctx, x + 6, y + 11, 1, 3, 0x2a1a10);
        break;
      case "doll":
        oval(ctx, x + 8, y + 7, 3, 3, 0xd8c8b8);
        px(ctx, x + 5, y + 10, 6, 4, 0x6a2a3a);
        px(ctx, x + 7, y + 6, 1, 1, 0x000000);
        px(ctx, x + 9, y + 6, 1, 1, 0x000000);
        px(ctx, x + 5, y + 4, 6, 2, 0x2a1a10);
        break;
      case "candle":
        px(ctx, x + 6, y + 9, 3, 5, 0xd8d0b8);
        px(ctx, x + 5, y + 13, 5, 1, 0x8a8070);
        px(ctx, x + 7, y + 8, 1, 1, 0x1a1210);
        break;
    }
  }
  return canvas;
}

