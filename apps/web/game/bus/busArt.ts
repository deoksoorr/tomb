import type * as Phaser from "phaser";
import { addCanvasTexture } from "../assets/manifest";
import { darken, Grid, lighten, makeCanvas, type Color } from "../sprites/pixel";
import { BUS_TEX_PREFIX } from "./busTypes";

// 언젠가 캠핑장 버스 겉모습 (정류장에 서는 시골 버스) — 코드로 그린 픽셀 아트, 마을 소품과 같은 규칙(어두운 외곽선·바닥 그림자).
// 위에서 비스듬히 본 옆모습, 오른쪽을 본다 (왼쪽으로 가면 setFlipX). 원점 = 바닥 가운데 (0.5, 1).
// 프레임: 0·1 문 닫힘(바퀴 두 모양 — 굴러갈 때 번갈아), 2 문 반쯤, 3 문 열림.
// 밤: 창문 빛(같은 크기 한 장, 가산)과 전조등 빛(부드러운 타원, 가산)을 따로 둔다.

export const BUS_W = 108;
export const BUS_H = 50;
/** 문 가운데 (그림 가운데 기준 x, 오른쪽을 볼 때) */
export const BUS_DOOR_DX = 89 - BUS_W / 2;
/** 그림 맨 아래 줄에서 바퀴가 닿는 줄까지 (그림자 몫) */
export const BUS_FOOT = 6;

export const BUS_TEX = {
  body: `${BUS_TEX_PREFIX}body`,
  windows: `${BUS_TEX_PREFIX}win`,
  head: `${BUS_TEX_PREFIX}head`,
  dust: `${BUS_TEX_PREFIX}dust`,
} as const;

export const BUS_FRAME = { closedA: 0, closedB: 1, half: 2, open: 3 } as const;

const OUT = 0x1f1d1a;
const CREAM = { hi: 0xfaf0d6, mid: 0xeedcb4, lo: 0xd2bc90 };
const ORANGE = { hi: 0xe88a48, mid: 0xd06a30, lo: 0xa44e22 };
const GLASS = { hi: 0x9ab8c8, mid: 0x4e6878, lo: 0x34485a };
const METAL = { hi: 0xb8b8b4, mid: 0x86868a, lo: 0x56565c };
const TIRE = 0x26242a;

/** 창문 칸 (x0, x1) — 옆면 창 띠 y 15..25 */
const WINDOWS: readonly [number, number][] = [
  [9, 19],
  [22, 32],
  [35, 45],
  [48, 58],
  [61, 71],
];
const WIN_Y0 = 15;
const WIN_Y1 = 25;
const DOOR_X0 = 84;
const DOOR_X1 = 93;
const REAR_WHEEL = 24;
const FRONT_WHEEL = 74;
const WHEEL_Y = 40;

function wheel(g: Grid, cx: number, frame: 0 | 1) {
  g.ellipse(cx, WHEEL_Y, 5.6, 5.6, TIRE);
  g.ellipse(cx, WHEEL_Y, 2.8, 2.8, METAL.mid);
  g.set(cx, WHEEL_Y, METAL.lo);
  // 휠 반짝임: 굴러갈 때 위치가 바뀐다
  if (frame === 0) {
    g.set(cx - 1, WHEEL_Y - 2, METAL.hi);
    g.set(cx + 1, WHEEL_Y + 2, METAL.lo);
  } else {
    g.set(cx + 2, WHEEL_Y - 1, METAL.hi);
    g.set(cx - 2, WHEEL_Y + 1, METAL.lo);
  }
}

function door(g: Grid, phase: 0 | 1 | 2) {
  // 문틀
  g.rect(DOOR_X0, 14, DOOR_X1 - DOOR_X0 + 1, 26, METAL.lo);
  if (phase === 2) {
    // 열림: 안쪽 어둠 + 계단 두 칸 + 접힌 문짝 (양쪽 끝에 얇게)
    g.rect(DOOR_X0 + 1, 15, DOOR_X1 - DOOR_X0 - 1, 24, 0x2a2420);
    g.rect(DOOR_X0 + 1, 15, DOOR_X1 - DOOR_X0 - 1, 3, 0x4a3c2c); // 천장 등 아래 빛
    g.rect(DOOR_X0 + 2, 34, DOOR_X1 - DOOR_X0 - 3, 2, 0x6a5a44);
    g.rect(DOOR_X0 + 1, 37, DOOR_X1 - DOOR_X0 - 1, 2, 0x7a6a50);
    g.rect(DOOR_X0, 15, 1, 24, GLASS.mid);
    g.rect(DOOR_X1, 15, 1, 24, GLASS.mid);
    return;
  }
  // 닫힘·반쯤: 유리 두 짝 (반쯤이면 가운데가 벌어진다)
  const gap = phase === 1 ? 3 : 0;
  const mid = Math.floor((DOOR_X0 + DOOR_X1) / 2);
  const leftW = mid - DOOR_X0 - gap / 2;
  g.rect(DOOR_X0 + 1, 15, Math.max(1, Math.floor(leftW)), 23, GLASS.mid);
  g.rect(mid + 1 + Math.ceil(gap / 2), 15, Math.max(1, DOOR_X1 - mid - 1 - Math.ceil(gap / 2)), 23, GLASS.mid);
  if (gap) g.rect(mid - 1, 15, gap + 1, 23, 0x2a2420);
  g.rect(DOOR_X0 + 1, 15, 1, 8, GLASS.hi);
  g.rect(mid + 2 + gap, 15, 1, 8, GLASS.hi);
  g.rect(DOOR_X0 + 1, 27, DOOR_X1 - DOOR_X0 - 1, 1, METAL.lo); // 문 가운데 가로대
}

/** 버스 한 프레임 (오른쪽을 본다) */
function busFrame(f: number): Grid {
  const g = new Grid(BUS_W, BUS_H);
  // 지붕 (위에서 살짝 보이는 면)
  g.rect(6, 7, 92, 6, CREAM.hi);
  g.rect(8, 6, 88, 1, CREAM.hi);
  g.rect(40, 8, 22, 3, METAL.mid); // 지붕 환기구
  g.rect(41, 8, 20, 1, METAL.hi);
  g.rect(14, 8, 14, 3, darken(CREAM.hi, 0.08)); // 지붕 짐칸 덮개
  // 옆면
  g.rect(4, 13, 98, 27, CREAM.mid);
  // 앞머리 (둥근 앞)
  g.rect(102, 15, 3, 24, CREAM.mid);
  g.set(102, 13, CREAM.mid);
  g.set(102, 14, CREAM.mid);
  g.set(104, 39, CREAM.lo);
  // 아래쪽 어둡게
  g.rect(4, 34, 101, 6, CREAM.lo);
  // 주황 띠 (위 얇게, 가운데 굵게)
  g.rect(4, 13, 101, 1, ORANGE.mid);
  g.rect(4, 28, 101, 4, ORANGE.mid);
  g.rect(4, 28, 101, 1, ORANGE.hi);
  g.rect(4, 31, 101, 1, ORANGE.lo);
  // 창문
  for (const [x0, x1] of WINDOWS) {
    g.rect(x0, WIN_Y0, x1 - x0 + 1, WIN_Y1 - WIN_Y0 + 1, GLASS.mid);
    g.rect(x0, WIN_Y0, x1 - x0 + 1, 1, GLASS.lo);
    g.rect(x0 + 1, WIN_Y0 + 2, 2, 3, GLASS.hi);
    g.set(x0 + 3, WIN_Y0 + 1, GLASS.hi);
    g.rect(x0, WIN_Y1 + 1, x1 - x0 + 1, 1, darken(CREAM.mid, 0.12)); // 창 아래 그늘
  }
  // 운전석 옆 작은 창
  g.rect(74, WIN_Y0, 8, WIN_Y1 - WIN_Y0 + 1, GLASS.mid);
  g.rect(75, WIN_Y0 + 2, 2, 3, GLASS.hi);
  // 앞 유리 (비스듬)
  g.rect(95, 14, 9, 14, GLASS.lo);
  g.rect(96, 15, 7, 12, GLASS.mid);
  g.rect(97, 16, 2, 4, GLASS.hi);
  g.set(100, 16, GLASS.hi);
  // 앞 행선지 판 (앞 유리 위)
  g.rect(95, 11, 9, 3, 0x2a2622);
  g.set(97, 12, 0xf0a040);
  g.set(99, 12, 0xf0a040);
  g.set(101, 12, 0xf0a040);
  // 옆 행선지 판 「언젠가 캠핑장」 (창 띠 위)
  g.rect(48, 10, 26, 3, 0x2a2622);
  for (let x = 50; x < 72; x += 2) g.set(x, 11, x % 6 === 2 ? 0xffd070 : 0xf09a3a);
  // 문
  door(g, f === BUS_FRAME.open ? 2 : f === BUS_FRAME.half ? 1 : 0);
  // 범퍼·등
  g.rect(103, 34, 3, 6, METAL.mid);
  g.rect(103, 34, 3, 1, METAL.hi);
  g.rect(104, 30, 2, 3, 0xfff2b0); // 전조등
  g.rect(3, 34, 2, 6, METAL.mid);
  g.rect(3, 30, 2, 3, 0xd03a2a); // 미등
  // 바퀴 집 (어두운 반원)
  for (const cx of [REAR_WHEEL, FRONT_WHEEL]) g.ellipse(cx, WHEEL_Y - 1, 7.2, 6, darken(CREAM.lo, 0.45));
  const wf: 0 | 1 = f === BUS_FRAME.closedB ? 1 : 0;
  wheel(g, REAR_WHEEL, wf);
  wheel(g, FRONT_WHEEL, wf);
  // 녹 조금 (시골 버스)
  g.set(8, 37, 0xa0603a);
  g.set(9, 38, 0x8a4e30);
  g.set(60, 38, 0xa0603a);
  // 외곽선
  g.outline(OUT);
  // 바닥 그림자 (외곽선 뒤에 — 비어 있는 칸만)
  for (let y = 44; y < BUS_H; y++)
    for (let x = 2; x < BUS_W - 2; x++) {
      const dx = (x + 0.5 - BUS_W / 2) / (BUS_W / 2 - 1);
      const dy = (y + 0.5 - 45.5) / 4;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, 70);
    }
  return g;
}

/** 4프레임 가로 시트 */
export function buildBusSheet(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(BUS_W * 4, BUS_H);
  for (let f = 0; f < 4; f++) busFrame(f).blit(ctx, f * BUS_W, 0);
  return canvas;
}

/** 밤 창문 빛 (창 칸만 따뜻한 색, 가산으로 겹친다) */
export function buildBusWindows(): HTMLCanvasElement {
  const g = new Grid(BUS_W, BUS_H);
  const warm: Color = 0xffd890;
  for (const [x0, x1] of WINDOWS) g.rect(x0, WIN_Y0, x1 - x0 + 1, WIN_Y1 - WIN_Y0 + 1, warm);
  g.rect(74, WIN_Y0, 8, WIN_Y1 - WIN_Y0 + 1, warm);
  g.rect(96, 15, 7, 12, lighten(warm, 0.2));
  g.rect(DOOR_X0 + 1, 15, DOOR_X1 - DOOR_X0 - 1, 23, warm);
  return g.toCanvas();
}

/** 전조등 빛 (앞으로 퍼지는 부드러운 타원) */
function buildHead(): HTMLCanvasElement {
  const w = 48;
  const h = 18;
  const { canvas, ctx } = makeCanvas(w, h);
  const grad = ctx.createRadialGradient(6, h / 2, 1, 6, h / 2, w * 0.9);
  grad.addColorStop(0, "rgba(255,240,190,0.95)");
  grad.addColorStop(0.35, "rgba(255,226,160,0.45)");
  grad.addColorStop(1, "rgba(255,210,140,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function buildDust(): HTMLCanvasElement {
  const g = new Grid(3, 3);
  g.rect(1, 0, 1, 3, 0xd8ccb0);
  g.rect(0, 1, 3, 1, 0xd8ccb0);
  g.set(1, 1, 0xf0e6d0);
  return g.toCanvas();
}

/** 정류장 버스 텍스처를 (없으면) 굽는다 */
export function ensureBusTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BUS_TEX.body)) addCanvasTexture(scene, BUS_TEX.body, { canvas: buildBusSheet(), frameW: BUS_W, frameH: BUS_H });
  if (!scene.textures.exists(BUS_TEX.windows)) addCanvasTexture(scene, BUS_TEX.windows, { canvas: buildBusWindows() });
  if (!scene.textures.exists(BUS_TEX.head)) addCanvasTexture(scene, BUS_TEX.head, { canvas: buildHead(), linear: true });
  if (!scene.textures.exists(BUS_TEX.dust)) addCanvasTexture(scene, BUS_TEX.dust, { canvas: buildDust() });
}

/** 정류장 버스 텍스처를 지운다 */
export function removeBusTextures(scene: Phaser.Scene): void {
  for (const key of Object.values(BUS_TEX)) if (scene.textures.exists(key)) scene.textures.remove(key);
}
