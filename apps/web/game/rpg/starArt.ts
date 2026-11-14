import type * as Phaser from "phaser";
import type { Constellation } from "@/lib/rpg/constellations";
import { css, hash2, makeCanvas, mix } from "../sprites/pixel";

// 별자리 잇기 그림 (코드로 그리는 픽셀 아트, 외부 이미지 없음).
//  - 망원경 속 밤하늘: 위가 깊은 그라데이션 + 비스듬한 은하수(점 무리·옅은 성운) + 세 겹 별밭 (한 장에 구워 둔다 → 매 프레임 비용 없음)
//  - 망원경 테두리: 둥근 네모(초타원) 바깥을 어둡게, 경계에 놋쇠빛 테 한 줄
//  - 반짝 별·켜질 때 번쩍임·별똥별 꼬리
//  - 도감 칸 아이콘: 별자리 모양을 작은 픽셀 격자에 (등록 전은 점만 = 실루엣)

export const STEX = {
  sky: (w: number, h: number) => `stars-sky-${w}x${h}`,
  rim: (w: number, h: number) => `stars-rim-${w}x${h}`,
  spark: "stars-spark",
  flash: "stars-flash",
  comet: "stars-comet",
} as const;

/** 은하수 띠 안인지 (0..1): 왼쪽 아래 → 오른쪽 위 대각선에서 가까울수록 1 */
function band(x: number, y: number, w: number, h: number): number {
  // 선: (0, 0.9h) → (w, 0.15h)
  const ax = 0;
  const ay = 0.9 * h;
  const bx = w;
  const by = 0.15 * h;
  const dx = bx - ax;
  const dy = by - ay;
  const d = Math.abs(dy * x - dx * y + bx * ay - by * ax) / Math.hypot(dx, dy);
  const wid = Math.min(w, h) * 0.2;
  return Math.max(0, 1 - d / wid);
}

function skyCanvas(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const gr = ctx.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, "#05061a");
  gr.addColorStop(0.55, "#0f1434");
  gr.addColorStop(1, "#2a2150");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, w, h);
  // 은하수 성운: 띠를 따라 옅은 보라·청록 얼룩 (부드럽게 — 이것만 안티앨리어싱)
  ctx.imageSmoothingEnabled = true;
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const x = w * t + (hash2(i, 1, 7) - 0.5) * w * 0.08;
    const y = h * (0.9 - 0.75 * t) + (hash2(i, 2, 7) - 0.5) * h * 0.12;
    const r = Math.min(w, h) * (0.12 + hash2(i, 3, 7) * 0.12);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = i % 3 === 0 ? "120,90,190" : i % 3 === 1 ? "70,110,190" : "150,120,200";
    g.addColorStop(0, `rgba(${tint},0.16)`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.imageSmoothingEnabled = false;
  // 은하수 점 무리 + 세 겹 별밭 (먼 별일수록 어둡고 작다)
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const put = (x: number, y: number, c: number, a: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = Math.round(px[i] + (((c >> 16) & 255) - px[i]) * a);
    px[i + 1] = Math.round(px[i + 1] + (((c >> 8) & 255) - px[i + 1]) * a);
    px[i + 2] = Math.round(px[i + 2] + ((c & 255) - px[i + 2]) * a);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const b = band(x, y, w, h);
      const r = hash2(x, y, 11);
      // 은하수: 띠 안에서 촘촘한 희미한 점
      if (b > 0 && r < b * b * 0.16) put(x, y, mix(0x9fb0ff, 0xfff0d8, hash2(x, y, 12)), 0.18 + 0.3 * b * hash2(x, y, 13));
      // 먼 별 (어둡게)
      else if (r > 0.9965) put(x, y, 0x8a94c8, 0.55);
      // 중간 별
      else if (r > 0.9952 && r <= 0.9965) put(x, y, 0xdfe6ff, 0.8);
    }
  // 가까운 별: 십자 모양 몇 개
  for (let i = 0; i < Math.round((w * h) / 2600); i++) {
    const x = Math.floor(hash2(i, 5, 21) * (w - 4)) + 2;
    const y = Math.floor(hash2(i, 6, 21) * (h * 0.82)) + 2;
    const c = hash2(i, 7, 21) < 0.3 ? 0xffe2b0 : hash2(i, 7, 21) < 0.6 ? 0xc8d8ff : 0xffffff;
    put(x, y, c, 1);
    put(x - 1, y, c, 0.35);
    put(x + 1, y, c, 0.35);
    put(x, y - 1, c, 0.35);
    put(x, y + 1, c, 0.35);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 망원경 테: 초타원(|x|⁴+|y|⁴) 바깥은 어둡게, 경계에 놋쇠빛 한 줄 + 안쪽 렌즈 테 아주 옅게 */
function rimCanvas(w: number, h: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const px = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = ((x + 0.5) / w) * 2 - 1;
      const ny = ((y + 0.5) / h) * 2 - 1;
      const v = Math.pow(nx * nx * nx * nx + ny * ny * ny * ny, 0.25);
      const i = (y * w + x) * 4;
      let c = 0x04050c;
      let a = 0;
      if (v > 1.0) a = 0.96;
      else if (v > 0.975) {
        // 놋쇠 테 (위쪽이 밝고 아래로 갈수록 어둡게 — 빛이 위에서)
        c = mix(0xd2ad62, 0x6a4e26, (ny + 1) / 2);
        a = 0.9;
      } else if (v > 0.955) {
        c = 0x1a1424;
        a = 0.85;
      } else if (v > 0.82) {
        a = ((v - 0.82) / 0.135) ** 2 * 0.55;
      }
      px[i] = (c >> 16) & 255;
      px[i + 1] = (c >> 8) & 255;
      px[i + 2] = c & 255;
      px[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 반짝 별: 가운데 밝은 점 + 네 갈래 (9×9) */
function sparkCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(9, 9);
  const dot = (x: number, y: number, c: number, a: number) => {
    ctx.fillStyle = css(c, a);
    ctx.fillRect(x, y, 1, 1);
  };
  for (let i = 0; i < 9; i++) {
    const a = Math.max(0.15, 1 - Math.abs(i - 4) * 0.24);
    dot(i, 4, 0xfff3c8, a);
    dot(4, i, 0xfff3c8, a);
  }
  for (const [x, y] of [
    [3, 3],
    [5, 3],
    [3, 5],
    [5, 5],
  ])
    dot(x, y, 0xfff3c8, 0.55);
  dot(4, 4, 0xffffff, 1);
  return canvas;
}

/** 켜질 때 번쩍임: 긴 십자 + 작은 대각 (21×21) */
function flashCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(21, 21);
  for (let i = 0; i < 21; i++) {
    const a = Math.max(0, 1 - Math.abs(i - 10) / 10.5) ** 1.6;
    ctx.fillStyle = css(0xffffff, a);
    ctx.fillRect(i, 10, 1, 1);
    ctx.fillRect(10, i, 1, 1);
  }
  for (let k = 1; k <= 4; k++) {
    ctx.fillStyle = css(0xfff3c8, 0.6 - k * 0.13);
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ])
      ctx.fillRect(10 + sx * k, 10 + sy * k, 1, 1);
  }
  return canvas;
}

/** 별똥별: 머리는 밝고 꼬리로 갈수록 옅어지는 32×3 */
function cometCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(32, 3);
  for (let x = 0; x < 32; x++) {
    const a = (x / 31) ** 1.8;
    ctx.fillStyle = css(mix(0x8fa8ff, 0xffffff, x / 31), a);
    ctx.fillRect(x, 1, 1, 1);
    if (x > 22) {
      ctx.fillStyle = css(0xc8d8ff, a * 0.35);
      ctx.fillRect(x, 0, 1, 1);
      ctx.fillRect(x, 2, 1, 1);
    }
  }
  return canvas;
}

function addOnce(scene: Phaser.Scene, key: string, make: () => HTMLCanvasElement): void {
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
}

/** 이 하늘 크기에 필요한 텍스처를 한 번씩 만든다 */
export function ensureStarTextures(scene: Phaser.Scene, w: number, h: number): void {
  addOnce(scene, STEX.sky(w, h), () => skyCanvas(w, h));
  addOnce(scene, STEX.rim(w, h), () => rimCanvas(w, h));
  addOnce(scene, STEX.spark, sparkCanvas);
  addOnce(scene, STEX.flash, flashCanvas);
  addOnce(scene, STEX.comet, cometCanvas);
}

/** 선 그림을 이은 선분 목록으로 (그리기 진행률 계산용) */
export type Seg = { x0: number; y0: number; x1: number; y1: number; len: number };
export function artSegments(c: Constellation): Seg[] {
  const out: Seg[] = [];
  for (const line of c.art)
    for (let i = 1; i < line.length; i++) {
      const [x0, y0] = line[i - 1];
      const [x1, y1] = line[i];
      out.push({ x0, y0, x1, y1, len: Math.hypot(x1 - x0, y1 - y0) });
    }
  return out;
}

/** 희귀도별 그림 빛깔 (흔함·보통 = 하늘빛, 희귀 = 보랏빛, 전설 = 금빛) */
export function artColor(rarity: number): number {
  return rarity >= 5 ? 0xffe39a : rarity >= 3 ? 0xd6b8ff : 0xbfe0ff;
}

/**
 * 도감 칸 아이콘 (size×size 픽셀 격자, 화면에서는 CSS로 키워 픽셀 그대로).
 * known: 그림 선(희귀도 빛깔) + 이은 선(금빛) + 밝은 별, 아니면 어두운 점만 (실루엣)
 */
export function drawConstellationIcon(ctx: CanvasRenderingContext2D, c: Constellation, size: number, known: boolean): void {
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const m = 2;
  const P = (v: number) => Math.round(m + v * (size - 1 - m * 2));
  const plot = (x0: number, y0: number, x1: number, y1: number, color: string) => {
    ctx.fillStyle = color;
    let x = P(x0);
    let y = P(y0);
    const xe = P(x1);
    const ye = P(y1);
    const dx = Math.abs(xe - x);
    const dy = -Math.abs(ye - y);
    const sx = x < xe ? 1 : -1;
    const sy = y < ye ? 1 : -1;
    let err = dx + dy;
    for (let k = 0; k < 400; k++) {
      ctx.fillRect(x, y, 1, 1);
      if (x === xe && y === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  };
  if (known) {
    const col = css(artColor(c.rarity), 0.45);
    for (const s of artSegments(c)) plot(s.x0, s.y0, s.x1, s.y1, col);
    for (let i = 1; i < c.stars.length; i++) plot(c.stars[i - 1][0], c.stars[i - 1][1], c.stars[i][0], c.stars[i][1], css(0xffe39a, 0.9));
  }
  for (const [x, y] of c.stars) {
    ctx.fillStyle = known ? "#ffffff" : "rgba(150,160,200,0.55)";
    ctx.fillRect(P(x), P(y), 1, 1);
    if (known) {
      ctx.fillStyle = "rgba(255,243,200,0.6)";
      ctx.fillRect(P(x) - 1, P(y), 1, 1);
      ctx.fillRect(P(x) + 1, P(y), 1, 1);
      ctx.fillRect(P(x), P(y) - 1, 1, 1);
      ctx.fillRect(P(x), P(y) + 1, 1, 1);
    }
  }
}
