import type * as Phaser from "phaser";
import { makeCanvas } from "../sprites/pixel";
import { HAUNT_TILE, isWall, mulberry as mulberryCanvasSeed, type GhostLook, type Maze } from "./maze";

// 귀신의집 그림 (코드로 그리는 픽셀아트). 브라우저에서만 부른다.
//  - 마을의 귀신의집 건물 (HauntHouseView)
//  - 미로 바닥·벽·장식 한 장, 귀신 3종(2프레임), 놀래키는 얼굴, 어둠 가리개, 촛불·달빛 번짐, 스치는 그림자

export const HTEX = {
  house: "haunt-house",
  houseGlow: "haunt-house-glow",
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

/** 귀신의집 건물 (가로 72, 세로 68, 바닥 가운데가 원점). 문은 아래 가운데 */
export const HOUSE_W = 72;
export const HOUSE_H = 68;

function houseCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(HOUSE_W, HOUSE_H);
  const r = mulberryCanvasSeed(77);
  const W = HOUSE_W;
  // 몸체 (비틀린 판자벽)
  px(ctx, 6, 30, W - 12, 38, 0x3c3644);
  for (let x = 7; x < W - 6; x += 4) {
    px(ctx, x, 30, 1, 38, 0x2c2734);
    if (r() < 0.4) px(ctx, x + 1, 32 + Math.floor(r() * 30), 2, 3, 0x4a4352);
  }
  // 2층 탑 (왼쪽 뾰족 지붕)
  px(ctx, 10, 14, 22, 18, 0x413a4a);
  for (let x = 11; x < 32; x += 4) px(ctx, x, 14, 1, 18, 0x2f2a38);
  // 지붕들 (짙은 슬레이트, 아래로 처진 끝)
  for (let i = 0; i < 14; i++) px(ctx, 21 - i, 1 + i, 1 + i * 2, 1, i % 3 === 0 ? 0x1d1a24 : 0x26222e);
  px(ctx, 8, 14, 26, 2, 0x1a1720);
  for (let i = 0; i < 12; i++) {
    const l = Math.round(30 - i * 2.3);
    const rr = Math.round(W - 8 + i * 0.5);
    px(ctx, l, 18 + i, rr - l, 1, i % 3 === 0 ? 0x1d1a24 : 0x2a2532);
  }
  px(ctx, 2, 29, W - 4, 3, 0x17141c);
  // 처진 처마 조각
  px(ctx, 4, 32, 3, 2, 0x17141c);
  px(ctx, W - 9, 32, 4, 3, 0x17141c);
  // 굴뚝
  px(ctx, W - 20, 10, 6, 14, 0x3a2c2c);
  px(ctx, W - 21, 9, 8, 2, 0x241c1c);
  // 창문: 위 탑 동그란 창(희미한 초록빛), 아래 판자로 막은 창 둘, 깨진 창 하나(주황빛)
  oval(ctx, 21, 22, 3, 3, 0x0d0b10);
  oval(ctx, 21, 22, 2, 2, 0x6a9a72);
  const win = (x: number, y: number, lit: number | null) => {
    px(ctx, x - 1, y - 1, 12, 13, 0x1a1720);
    px(ctx, x, y, 10, 11, lit ?? 0x0c0b0f);
    if (lit) {
      // 깨진 유리 조각
      px(ctx, x + 2, y + 2, 2, 5, 0x0c0b0f);
      px(ctx, x + 6, y + 6, 3, 2, 0x0c0b0f);
    } else {
      // 엇갈려 박은 판자
      for (let i = 0; i < 10; i++) px(ctx, x + i, y + 2 + Math.floor(i * 0.6), 1, 2, 0x5a4a3a);
      px(ctx, x, y + 7, 10, 2, 0x4e3f32);
    }
  };
  win(10, 40, null);
  win(W - 22, 40, 0xb86a2a);
  win(W - 34, 40, null);
  // 문 (아치형, 반쯤 열려 안이 새까맣다)
  const dx = W / 2 - 6;
  px(ctx, dx - 2, 48, 16, 20, 0x1a1210);
  px(ctx, dx - 1, 46, 14, 2, 0x1a1210);
  px(ctx, dx, 49, 12, 19, 0x050406);
  px(ctx, dx, 49, 4, 19, 0x3a2418);
  px(ctx, dx + 1, 57, 1, 2, 0xb08a40);
  // 문 위 해골 장식 대신 부적 한 장 (빨간 글씨 줄무늬)
  px(ctx, W / 2 - 2, 42, 4, 6, 0xd8c88a);
  px(ctx, W / 2 - 1, 43, 2, 4, 0xa02020);
  // 계단 두 단
  px(ctx, dx - 4, 66, 20, 2, 0x2a2630);
  // 거미줄 (오른쪽 처마 아래)
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "#c8c8d0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W - 6.5, 32.5);
  ctx.lineTo(W - 14.5, 40.5);
  ctx.moveTo(W - 6.5, 32.5);
  ctx.lineTo(W - 6.5, 42.5);
  ctx.moveTo(W - 6.5, 32.5);
  ctx.lineTo(W - 16.5, 33.5);
  ctx.moveTo(W - 10.5, 32.5);
  ctx.lineTo(W - 6.5, 37.5);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 이끼·얼룩
  for (let i = 0; i < 40; i++) px(ctx, 6 + Math.floor(r() * (W - 12)), 30 + Math.floor(r() * 38), 1, 1, r() < 0.5 ? 0x2a3a2a : 0x221e28);
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

export function ensureHouseTextures(scene: Phaser.Scene): void {
  add(scene, HTEX.house, houseCanvas());
  add(scene, HTEX.houseGlow, glowCanvas(32, "rgba(255,150,60,0.9)"));
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

