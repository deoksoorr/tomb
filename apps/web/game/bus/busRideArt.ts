import { css, darken, lighten, makeCanvas, rng, type Color } from "../sprites/pixel";
import type { RideSegment } from "./busRideMath";

// 버스 창밖 연출 그림 (코드로 그린 픽셀 아트). 그림 단위는 "그림 픽셀" — 장면이 화면에 맞게 정수 배(S)로 키운다.
// 세로 ART_H = 180: 위 천장(0..WIN_TOP) · 창(WIN_TOP..WIN_BOT) · 아래 창턱·좌석 등받이(WIN_BOT..180).
// 창밖은 층마다 긴 파노라마 한 장 (먼 산 · 중간 집·나무·방음벽 · 차 · 가까운 담·가드레일·전봇대·나무 줄기).
// 층의 파노라마는 구간 4개를 차례로 잇고, 경계는 픽셀 디더로 섞는다 → 시차로 달리면 다음 구간이 오른쪽에서 스며 들어온다.
// 밤 불빛(창문·석등·가로등·차 불빛)은 층마다 따로 한 장 (가산으로 겹친다).

export const ART_H = 180;
export const WIN_TOP = 20;
export const WIN_BOT = 122;
/** 지평선 (그림 y) */
export const HORIZON = 96;
/** 화면 하나의 가장 넓은 폭 (그림 픽셀). 장면이 S를 골라 이보다 넓지 않게 한다 */
export const VIEW_MAX = 700;
/** 구간 경계를 화면 가운데쯤에서 넘도록 미는 값 (보통 화면 폭의 절반) */
const CENTER_OFF = 160;
/** 경계 디더 폭 */
const DITHER_W = 28;

export type LayerId = "far" | "mid" | "cars" | "near";
export type LayerSpec = { id: LayerId; factor: number; y0: number; h: number };
export const LAYERS: readonly LayerSpec[] = [
  { id: "far", factor: 0.18, y0: 40, h: 64 },
  { id: "mid", factor: 0.5, y0: 34, h: 90 },
  { id: "cars", factor: 1.7, y0: 100, h: 24 },
  { id: "near", factor: 1, y0: 0, h: 124 },
];

export type Panorama = { canvas: HTMLCanvasElement; lights: HTMLCanvasElement | null; width: number };

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 이 층 파노라마에서 구간 경계 x (i = 1..3) */
function boundary(spec: LayerSpec, dist: number, i: number): number {
  return spec.factor * dist * (i / 4) + CENTER_OFF;
}

/** 경계 섞기 폭 (먼 층은 넓게 — 산 모양이 천천히 바뀌게) */
function ditherW(spec: LayerSpec): number {
  return spec.id === "far" ? 72 : DITHER_W;
}

/** 열 x의 구간 쌍과 섞기 비율 (a → b로 t만큼. 경계 밖이면 t = 0) */
function blendAt(spec: LayerSpec, dist: number, x: number): { a: number; b: number; t: number } {
  const w = ditherW(spec);
  for (let i = 1; i <= 3; i++) {
    const bx = boundary(spec, dist, i);
    if (x < bx - w / 2) return { a: i - 1, b: i - 1, t: 0 };
    if (x < bx + w / 2) return { a: i - 1, b: i, t: (x - (bx - w / 2)) / w };
  }
  return { a: 3, b: 3, t: 0 };
}

/** 섞기 비율 t에서 이 칸이 다음 구간 색을 쓰는지 (4×4 순서 디더) */
function ditherPick(t: number, x: number, y: number): boolean {
  return t * 16 > BAYER4[(y & 3) * 4 + (x & 3)];
}

/** 결정적 점 뿌리기 (x,y,salt → 0..1) */
function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 이 층에서 구간 i가 차지하는 x 범위 */
function segRange(spec: LayerSpec, dist: number, width: number, i: number): [number, number] {
  return [i === 0 ? 0 : boundary(spec, dist, i), i === 3 ? width : boundary(spec, dist, i + 1)];
}

// ── 작은 그리기 도구 (정수 칸) ──
type Ctx = CanvasRenderingContext2D;
function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: Color, a = 1): void {
  ctx.globalAlpha = a;
  ctx.fillStyle = css(c);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.globalAlpha = 1;
}
/** 픽셀 타원 (채움) */
function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: Color): void {
  ctx.fillStyle = css(c);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    ctx.fillRect(Math.round(cx - half), y, Math.max(1, Math.round(half * 2)), 1);
  }
}
/** 삼각 수관 한 층 (아래 넓게) */
function tri(ctx: Ctx, cx: number, top: number, h: number, w: number, c: Color): void {
  ctx.fillStyle = css(c);
  for (let y = 0; y < h; y++) {
    const half = Math.round(((y + 1) / h) * (w / 2));
    ctx.fillRect(Math.round(cx - half), Math.round(top + y), half * 2 + 1, 1);
  }
}

/** 글자를 픽셀처럼 (알파를 이진화해) 찍는다 */
export function pixelText(ctx: Ctx, text: string, x: number, y: number, color: Color, px12 = 12): number {
  const font = `${px12}px "Galmuri11", "Galmuri9", monospace`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 2;
  const h = px12 + 4;
  const { canvas: tmp, ctx: t } = makeCanvas(w, h);
  t.font = font;
  t.textBaseline = "top";
  t.fillStyle = css(color);
  t.fillText(text, 1, 1);
  const img = t.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  t.putImageData(img, 0, 0);
  ctx.drawImage(tmp, Math.round(x), Math.round(y));
  return w;
}

// ── 구간별 색 ──
const SEG = {
  village: { hill: 0x5e6a5c, hillHi: 0x6f7b68, ground: 0x6a6444, groundLo: 0x5a5438, nearGround: 0x5e5840 },
  highway: { hill: 0x7684a0, hillHi: 0x96a2ba, ground: 0x6c7250, groundLo: 0x55555b, nearGround: 0x4a4a50 },
  maple: { hill: 0x986640, hillHi: 0xb07a46, ground: 0xa48048, groundLo: 0x8a6a3a, nearGround: 0x7a5a34 },
  forest: { hill: 0x3c5a4e, hillHi: 0x4a6a58, ground: 0x5c4a30, groundLo: 0x4a3c28, nearGround: 0x463824 },
} as const satisfies Record<RideSegment, Record<string, Color>>;

const AUTUMN_LEAF: readonly Color[] = [0xc8482a, 0xe06a34, 0xe8a83a, 0xd88a2e, 0xb83c26];

// ── 먼 층: 언덕·산·숲 실루엣 (윤곽은 두 구간 높이를 섞고, 색은 디더) ──
function farTop(seg: RideSegment, x: number): number {
  switch (seg) {
    case "village":
      return HORIZON - (16 + 7 * Math.sin(x * 0.021) + 5 * Math.sin(x * 0.053 + 1));
    case "highway":
      return HORIZON - (26 + 14 * Math.abs(Math.sin(x * 0.012)) + 6 * Math.sin(x * 0.071));
    case "maple":
      return HORIZON - (20 + 7 * Math.sin(x * 0.017 + 2) + 4 * Math.sin(x * 0.061));
    case "forest": {
      const saw = Math.abs(((x % 7) - 3.5) / 3.5); // 침엽수 뾰족한 줄
      return HORIZON - (24 + 5 * Math.sin(x * 0.03) + 8 * (1 - saw) * (0.6 + 0.4 * Math.sin(x * 0.37)));
    }
  }
}

function farColor(seg: RideSegment, x: number, y: number, top: number): Color | -1 {
  const s = SEG[seg];
  if (y >= HORIZON) return y >= HORIZON + 4 ? s.groundLo : s.ground;
  if (y < top) return -1;
  if (y < top + 2) return s.hillHi;
  if (seg === "maple") {
    // 단풍 든 산: 얼룩덜룩 (칸마다 덩어리)
    const n = Math.sin(x * 0.19) * Math.sin(y * 0.43 + x * 0.05);
    if (n > 0.45) return AUTUMN_LEAF[Math.floor(hash(x >> 2, y >> 2, 3) * AUTUMN_LEAF.length)];
  }
  if (seg === "village" && hash(x, y, 7) < 0.025) return 0xa86a3a; // 늦가을 나무 점
  if (seg === "highway" && y > top + 6 && hash(x >> 1, y >> 1, 9) < 0.05) return SEG.highway.hillHi;
  return s.hill;
}

function farObjects(ctx: Ctx, lights: Ctx, seg: RideSegment, x0: number, x1: number, r: () => number): void {
  const oy = 40;
  if (seg === "village") {
    // 먼 마을 지붕 실루엣 + 창 불빛
    for (let x = x0 + 10; x < x1 - 10; x += 14 + r() * 26) {
      const w = 6 + Math.round(r() * 6);
      const base = HORIZON - oy - 1;
      px(ctx, x, base - 4, w, 4, 0x4a5262);
      px(ctx, x - 1, base - 6, w + 2, 2, 0x3a4050);
      if (r() < 0.6) px(lights, x + 2, base - 3, 1, 1, 0xffd27a);
    }
  } else if (seg === "highway") {
    // 먼 송전탑
    for (let x = x0 + 30; x < x1 - 10; x += 90 + r() * 60) {
      const base = HORIZON - oy - 2 - Math.round(r() * 6);
      px(ctx, x, base - 18, 1, 18, 0x5a6478);
      px(ctx, x - 4, base - 16, 9, 1, 0x5a6478);
      px(ctx, x - 3, base - 12, 7, 1, 0x5a6478);
      px(lights, x, base - 19, 1, 1, 0xff6a5a);
    }
  }
}

// ── 중간 층 ──
function midPixel(seg: RideSegment, x: number, ly: number): Color | -1 {
  const y = ly + 34;
  const s = SEG[seg];
  if (y < HORIZON + 4) return -1;
  if (seg === "highway") {
    if (y >= 110) return y === 116 && x % 12 < 6 ? 0xd8d8d0 : 0x55555b; // 반대편 차로 (흰 점선)
    return y < 104 ? 0x6c7250 : 0x7e8458;
  }
  if (seg === "maple" && hash(x, y, 11) < 0.08) return AUTUMN_LEAF[Math.floor(hash(x, y, 12) * AUTUMN_LEAF.length)];
  if (seg === "forest" && hash(x, y, 13) < 0.05) return 0xd8b040;
  return y > 112 ? s.groundLo : s.ground;
}

/** 기와집 한 채 (중간 층 좌표, base = 땅 y) */
function house(ctx: Ctx, lights: Ctx, x: number, base: number, w: number, r: () => number): void {
  const wallH = 9 + Math.round(r() * 3);
  px(ctx, x, base - wallH, w, wallH, 0xd8ccb0);
  px(ctx, x, base - wallH, w, 1, 0xb8aa8c);
  for (let bx = x; bx < x + w; bx += 7) px(ctx, bx, base - wallH, 1, wallH, 0x6a4a30); // 나무 기둥
  // 기와 지붕 (양 끝이 살짝 들린다)
  const roofY = base - wallH - 6;
  px(ctx, x - 3, roofY + 2, w + 6, 4, 0x4a5060);
  px(ctx, x - 1, roofY, w + 2, 2, 0x5a6272);
  px(ctx, x - 4, roofY + 1, 1, 1, 0x4a5060);
  px(ctx, x + w + 3, roofY + 1, 1, 1, 0x4a5060);
  for (let rx = x - 2; rx < x + w + 3; rx += 2) px(ctx, rx, roofY + 5, 1, 1, 0x3a404e);
  // 창 (밤에 불빛)
  for (let wx = x + 2; wx < x + w - 3; wx += 7) {
    px(ctx, wx + 1, base - wallH + 3, 3, 3, 0x3a3630);
    if (r() < 0.75) px(lights, wx + 1, base - wallH + 3, 3, 3, 0xffcf78);
  }
}

function stoneLantern(ctx: Ctx, lights: Ctx, x: number, base: number): void {
  px(ctx, x - 1, base - 4, 3, 4, 0x8a887e);
  px(ctx, x - 2, base - 8, 5, 4, 0x9a988e);
  px(ctx, x - 1, base - 7, 3, 2, 0x3a3630);
  px(ctx, x - 3, base - 10, 7, 2, 0x7a786e);
  px(ctx, x, base - 11, 1, 1, 0x7a786e);
  px(lights, x - 1, base - 7, 3, 2, 0xffc060);
}

function roundTree(ctx: Ctx, x: number, base: number, h: number, leaf: Color): void {
  px(ctx, x - 1, base - h * 0.45, 2, h * 0.45, 0x4a3424);
  blob(ctx, x, base - h * 0.62, h * 0.32, h * 0.3, darken(leaf, 0.18));
  blob(ctx, x - 1, base - h * 0.68, h * 0.26, h * 0.24, leaf);
  blob(ctx, x - 2, base - h * 0.74, h * 0.12, h * 0.1, lighten(leaf, 0.22));
}

function conifer(ctx: Ctx, x: number, base: number, h: number, c: Color): void {
  px(ctx, x, base - 4, 2, 4, 0x3a2a1c);
  const layers = 3;
  for (let i = 0; i < layers; i++) {
    const lh = Math.round(h * 0.42);
    const top = base - 3 - h + i * Math.round(h * 0.26);
    tri(ctx, x + 1, top, lh, Math.round(h * 0.36 + i * h * 0.1), i === 0 ? lighten(c, 0.08) : c);
  }
}

function tombstone(ctx: Ctx, x: number, base: number): void {
  px(ctx, x, base - 5, 4, 5, 0x9a988e);
  px(ctx, x, base - 5, 4, 1, 0xb4b2a8);
}

function midObjects(ctx: Ctx, lights: Ctx, seg: RideSegment, x0: number, x1: number, r: () => number, signs: { ic: boolean }): void {
  const ground = HORIZON + 12 - 34; // 중간 층의 땅 줄 (층 좌표)
  switch (seg) {
    case "village": {
      let x = x0 + 6;
      while (x < x1 - 20) {
        const k = r();
        if (k < 0.42) {
          const w = 18 + Math.round(r() * 14);
          house(ctx, lights, x, ground + Math.round(r() * 3), w, r);
          x += w + 8 + r() * 14;
        } else if (k < 0.62) {
          stoneLantern(ctx, lights, x + 3, ground + 2);
          x += 12 + r() * 10;
        } else if (k < 0.82) {
          roundTree(ctx, x + 6, ground + 2, 22 + r() * 12, AUTUMN_LEAF[Math.floor(r() * AUTUMN_LEAF.length)]);
          x += 14 + r() * 10;
        } else {
          // 작은 묘역: 낮은 울타리와 묘비 몇 개
          px(ctx, x, ground - 2, 30, 1, 0x4a4038);
          for (let i = 0; i < 4; i++) tombstone(ctx, x + 2 + i * 7, ground + 1);
          x += 36 + r() * 8;
        }
      }
      break;
    }
    case "highway": {
      // 방음벽: 기둥 사이 반투명 판
      for (let x = Math.floor(x0); x < x1; x += 24) {
        px(ctx, x, ground - 34, 2, 36, 0x5a5e62);
        ctx.globalAlpha = 0.5;
        px(ctx, x + 2, ground - 34, 22, 22, 0x9ac0bc);
        ctx.globalAlpha = 1;
        px(ctx, x + 2, ground - 12, 22, 14, 0x7a8a86);
        px(ctx, x + 2, ground - 34, 22, 1, 0x6a7a76);
      }
      // 가로등 (밤에 켜진다)
      for (let x = x0 + 40; x < x1 - 10; x += 70 + r() * 20) {
        px(ctx, x, ground - 48, 2, 50, 0x6a6e72);
        px(ctx, x, ground - 48, 8, 2, 0x6a6e72);
        px(ctx, x + 6, ground - 47, 3, 2, 0xd8d8c8);
        px(lights, x + 5, ground - 46, 5, 3, 0xffe6a0);
      }
      // 초록 표지판 「언젠가 IC」 (구간 가운데 한 번)
      if (!signs.ic) {
        signs.ic = true;
        const cx = Math.round((x0 + x1) / 2);
        // 11/15 판을 넓히고 둘째 줄을 두어 화살표가 판 안에 다 들어가게 (예전엔 오른쪽 끝에서 잘렸다)
        px(ctx, cx - 46, ground - 62, 2, 64, 0x6a6e72);
        px(ctx, cx + 44, ground - 62, 2, 64, 0x6a6e72);
        px(ctx, cx - 48, ground - 70, 96, 34, 0x1e6a3e);
        px(ctx, cx - 47, ground - 69, 94, 1, 0xf0f0e8);
        px(ctx, cx - 47, ground - 38, 94, 1, 0xf0f0e8);
        px(ctx, cx - 47, ground - 69, 1, 32, 0xf0f0e8);
        px(ctx, cx + 46, ground - 69, 1, 32, 0xf0f0e8);
        pixelText(ctx, "언젠가 IC", cx - 30, ground - 67, 0xf4f4ec);
        // 화살표 (나가는 길 → 오른쪽): 줄기 + 세모 머리, 모두 판 안
        px(ctx, cx - 14, ground - 47, 28, 2, 0xf4f4ec);
        px(ctx, cx + 14, ground - 50, 2, 8, 0xf4f4ec);
        px(ctx, cx + 16, ground - 49, 2, 6, 0xf4f4ec);
        px(ctx, cx + 18, ground - 48, 2, 4, 0xf4f4ec);
        px(ctx, cx + 20, ground - 47, 2, 2, 0xf4f4ec);
        px(lights, cx - 48, ground - 70, 96, 34, 0x1e3a2a); // 밤에 표지판이 은은하게 빛난다
      }
      break;
    }
    case "maple": {
      for (let x = x0 + 4; x < x1 - 8; x += 9 + r() * 14) {
        const ginkgo = r() < 0.35;
        roundTree(ctx, x, ground + 2 + Math.round(r() * 4), 24 + r() * 16, ginkgo ? 0xe8b83a : AUTUMN_LEAF[Math.floor(r() * 3)]);
      }
      // 길가 농가 하나 (밤에 창 불빛)
      const fx = x0 + (x1 - x0) * (0.3 + r() * 0.4);
      house(ctx, lights, fx, ground + 4, 20, r);
      break;
    }
    case "forest": {
      for (let x = x0 + 3; x < x1 - 6; x += 6 + r() * 10) {
        const larch = r() < 0.3;
        conifer(ctx, x, ground + 3 + Math.round(r() * 5), 30 + r() * 28, larch ? 0xc8a03a : r() < 0.5 ? 0x2e5040 : 0x3e6a50);
      }
      break;
    }
  }
}

// ── 차 층 (고속도로만, 반대편 차로를 스쳐 간다) ──
const CAR_COLORS: readonly Color[] = [0xd8d8d4, 0x3a4a6a, 0xa83a32, 0x2a2a2e, 0xe8c048, 0x6a8a9a];
function car(ctx: Ctx, lights: Ctx, x: number, base: number, c: Color, truck: boolean): number {
  const w = truck ? 30 : 18 + Math.round(c % 4);
  const h = truck ? 13 : 7;
  px(ctx, x, base - h - 2, w, h, c);
  px(ctx, x, base - h - 2, w, 1, lighten(c, 0.25));
  if (!truck) {
    px(ctx, x + 3, base - h - 5, w - 8, 3, darken(c, 0.15));
    px(ctx, x + 4, base - h - 4, w - 10, 2, 0x6a8aa0);
  } else px(ctx, x + w - 7, base - h - 2, 6, 5, 0x6a8aa0);
  px(ctx, x + 3, base - 3, 4, 3, 0x1e1e22);
  px(ctx, x + w - 7, base - 3, 4, 3, 0x1e1e22);
  // 반대편 차로: 왼쪽으로 달린다 → 앞(왼쪽)에 전조등, 뒤에 미등
  px(lights, x - 3, base - h + 1, 4, 2, 0xfff0c0);
  px(lights, x + w - 1, base - h + 1, 1, 2, 0xff4a3a);
  return w;
}

// ── 가까운 층 ──
function nearPixel(seg: RideSegment, x: number, y: number): Color | -1 {
  if (y < 118) return -1;
  const s = SEG[seg];
  if (seg === "maple" && hash(x, y, 21) < 0.3) return AUTUMN_LEAF[Math.floor(hash(x, y, 22) * AUTUMN_LEAF.length)];
  if (seg === "forest" && hash(x, y, 23) < 0.2) return 0xd8b040;
  return s.nearGround;
}

function nearObjects(ctx: Ctx, lights: Ctx, seg: RideSegment, x0: number, x1: number, r: () => number): void {
  const base = 124;
  switch (seg) {
    case "village": {
      // 낮은 돌담 + 담 위 석등
      for (let x = Math.floor(x0); x < x1; x += 8) {
        const sh = (x / 8) % 2 ? 0x8a8678 : 0x7a766a;
        px(ctx, x, base - 14, 8, 14, sh);
        px(ctx, x, base - 14, 8, 1, 0xa4a094);
        px(ctx, x, base - 7, 8, 1, 0x5a5850);
        px(ctx, x + ((x / 8) % 2 ? 4 : 0), base - 14, 1, 7, 0x5a5850);
      }
      for (let x = x0 + 50; x < x1 - 10; x += 110 + r() * 40) {
        px(ctx, x - 2, base - 30, 5, 16, 0x8a887e);
        px(ctx, x - 4, base - 38, 9, 8, 0x9a988e);
        px(ctx, x - 2, base - 36, 5, 4, 0x3a3630);
        px(ctx, x - 5, base - 41, 11, 3, 0x7a786e);
        px(lights, x - 2, base - 36, 5, 4, 0xffc060);
      }
      for (let x = x0 + 20; x < x1 - 10; x += 60 + r() * 50) blob(ctx, x, base - 16, 7, 5, 0x5a6a3a);
      break;
    }
    case "highway": {
      // 가드레일
      for (let x = Math.floor(x0); x < x1; x++) {
        px(ctx, x, base - 14, 1, 6, 0xb0b4b8);
        if (x % 2 === 0) px(ctx, x, base - 12, 1, 1, 0x8a8e92);
        px(ctx, x, base - 9, 1, 1, 0x6a6e72);
      }
      for (let x = Math.floor(x0); x < x1; x += 20) {
        px(ctx, x, base - 10, 2, 10, 0x6a6e72);
        px(ctx, x, base - 14, 2, 2, 0xe8c040);
        px(lights, x, base - 14, 2, 2, 0xffd860);
      }
      break;
    }
    case "maple": {
      // 전봇대 + 늘어진 전깃줄
      const poles: number[] = [];
      for (let x = x0 + 30; x < x1 - 10; x += 120 + r() * 20) poles.push(Math.round(x));
      for (const x of poles) {
        px(ctx, x, 6, 4, base - 6, 0x6a6058);
        px(ctx, x + 1, 6, 1, base - 6, 0x847a70);
        px(ctx, x - 8, 14, 20, 2, 0x5a5048);
        for (const ix of [-7, 2, 10]) px(ctx, x + ix, 12, 2, 2, 0xd8d0c0);
      }
      for (let i = 0; i + 1 < poles.length; i++) {
        const a = poles[i];
        const b = poles[i + 1];
        for (const [ix, dy] of [
          [-6, 0],
          [3, 2],
          [11, 1],
        ] as const) {
          for (let x = a + ix; x <= b + ix; x++) {
            const t = (x - (a + ix)) / (b - a);
            const sag = Math.round(4 * t * (1 - t) * 6);
            px(ctx, x, 13 + dy + sag, 1, 1, 0x2a2622);
          }
        }
      }
      // 낙엽 더미
      for (let x = x0 + 10; x < x1 - 10; x += 26 + r() * 30) blob(ctx, x, base - 4, 6, 3, AUTUMN_LEAF[Math.floor(r() * AUTUMN_LEAF.length)]);
      break;
    }
    case "forest": {
      // 굵은 나무 줄기가 휙휙 지나간다
      for (let x = x0 + 20; x < x1 - 10; x += 60 + r() * 80) {
        const w = 8 + Math.round(r() * 7);
        px(ctx, x, 0, w, base, 0x4a3424);
        px(ctx, x + 1, 0, 2, base, 0x6a4a32);
        px(ctx, x + w - 2, 0, 1, base, 0x33241a);
        for (let y = 8; y < base; y += 9 + Math.round(r() * 8)) px(ctx, x + 2 + Math.round(r() * (w - 4)), y, 2, 1, 0x33241a);
      }
      for (let x = x0 + 8; x < x1 - 8; x += 18 + r() * 24) {
        // 고사리
        for (let k = -4; k <= 4; k += 2) px(ctx, x + k, base - 6 + Math.abs(k), 1, 6 - Math.abs(k), 0x4a7a3a);
      }
      break;
    }
  }
}

/** 층 하나의 파노라마 (구간 4개를 잇는다) */
export function buildPanorama(spec: LayerSpec, order: readonly RideSegment[], dist: number, seed: number): Panorama {
  const width = Math.ceil(spec.factor * dist) + VIEW_MAX + CENTER_OFF;
  const { canvas, ctx } = makeCanvas(width, spec.h);
  const { canvas: lc, ctx: lctx } = makeCanvas(width, spec.h);
  // 바탕 (픽셀마다, 경계 디더 — 먼 층 윤곽은 높이를 섞는다)
  const pix = spec.id === "mid" ? midPixel : spec.id === "near" ? (sg: RideSegment, x: number, ly: number) => nearPixel(sg, x, ly + spec.y0) : null;
  if (spec.id !== "cars") {
    const img = ctx.createImageData(width, spec.h);
    const d = img.data;
    for (let x = 0; x < width; x++) {
      const { a, b, t } = blendAt(spec, dist, x);
      const top = spec.id === "far" ? farTop(order[a], x) * (1 - t) + farTop(order[b], x) * t : 0;
      for (let y = 0; y < spec.h; y++) {
        const sg = order[ditherPick(t, x, y) ? b : a];
        const c = spec.id === "far" ? farColor(sg, x, y + spec.y0, top) : pix!(sg, x, y);
        if (c === -1) continue;
        const i = (y * width + x) * 4;
        d[i] = (c >> 16) & 255;
        d[i + 1] = (c >> 8) & 255;
        d[i + 2] = c & 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  // 소품
  const r = rng(seed);
  const signs = { ic: false };
  for (let i = 0; i < 4; i++) {
    const [x0, x1] = segRange(spec, dist, width, i);
    const seg = order[i];
    if (spec.id === "far") farObjects(ctx, lctx, seg, x0, x1, r);
    else if (spec.id === "mid") midObjects(ctx, lctx, seg, x0, x1, r, signs);
    else if (spec.id === "near") nearObjects(ctx, lctx, seg, x0, x1, r);
    else if (seg === "highway") {
      // 차: 반대편 차로에 띄엄띄엄 (가끔 트럭)
      for (let x = x0 + 20; x < x1 - 40; ) {
        const truck = r() < 0.2;
        x += car(ctx, lctx, x, spec.h - 2, CAR_COLORS[Math.floor(r() * CAR_COLORS.length)], truck) + 50 + r() * 120;
      }
    }
  }
  return { canvas, lights: lc, width };
}

/** 창밖 끝 표지판: 캠핑장행 = 나무 표지판 「언젠가 캠핑장」, 마을행 = 버스 정류장 팻말 「마을 정류장」. 바닥 = 그림 맨 아래 줄 */
export function buildEndSign(leg: "toCamp" | "toVillage"): HTMLCanvasElement {
  if (leg === "toCamp") {
    const { canvas, ctx } = makeCanvas(112, 70);
    px(ctx, 16, 18, 4, 52, 0x5a3e28);
    px(ctx, 92, 18, 4, 52, 0x5a3e28);
    px(ctx, 8, 4, 96, 22, 0x7a5434);
    px(ctx, 9, 5, 94, 20, 0x9a6c42);
    px(ctx, 9, 5, 94, 1, 0xb88454);
    px(ctx, 9, 15, 94, 1, 0x8a6038);
    pixelText(ctx, "언젠가 캠핑장", 16, 6, 0xf6e8c8);
    // 아래 판 「Someday Camp」 (글자 폭에 맞춘다)
    const { ctx: m } = makeCanvas(4, 4);
    m.font = `12px "Galmuri11", "Galmuri9", monospace`;
    const ew = Math.min(108, Math.ceil(m.measureText("Someday Camp").width) + 10);
    const ex = Math.round(56 - ew / 2);
    px(ctx, ex, 30, ew, 18, 0x6a4a2e);
    px(ctx, ex + 1, 31, ew - 2, 1, 0x8a6440);
    pixelText(ctx, "Someday Camp", ex + 4, 31, 0xe8d8b0);
    // 낙엽 몇 장
    px(ctx, 28, 3, 2, 2, 0xe8a83a);
    px(ctx, 80, 2, 2, 2, 0xc8482a);
    px(ctx, 56, 26, 2, 1, 0xd8b040);
    return canvas;
  }
  const { canvas, ctx } = makeCanvas(84, 76);
  px(ctx, 40, 18, 4, 58, 0x8a8e92);
  px(ctx, 41, 18, 1, 58, 0xb0b4b8);
  px(ctx, 4, 2, 76, 22, 0x2a5a9a);
  px(ctx, 5, 3, 74, 1, 0x6a8aca);
  pixelText(ctx, "마을 정류장", 9, 5, 0xf4f4ec);
  blob(ctx, 42, 34, 8, 8, 0x2a5a9a);
  px(ctx, 38, 31, 9, 6, 0xf4f4ec);
  px(ctx, 39, 32, 7, 3, 0x2a5a9a);
  return canvas;
}

/** 버스 안 (창틀·기둥·천장·창턱·좌석 등받이). 창은 비워 둔다. 폭 = 화면 폭(그림 픽셀) */
export function buildInterior(viewW: number, night: boolean): HTMLCanvasElement {
  const w = Math.max(16, Math.ceil(viewW));
  const { canvas, ctx } = makeCanvas(w, ART_H);
  // 천장
  px(ctx, 0, 0, w, WIN_TOP, 0x3c3631);
  px(ctx, 0, 2, w, 2, night ? 0xfff0c8 : 0xe8dcc0);
  px(ctx, 0, 4, w, 1, 0x2e2925);
  px(ctx, 0, 11, w, 2, 0x9a9a98); // 손잡이 봉
  px(ctx, 0, 11, w, 1, 0xc8c8c6);
  // 창틀 고무
  px(ctx, 0, WIN_TOP, w, 2, 0x1e1c1a);
  px(ctx, 0, WIN_BOT - 2, w, 2, 0x1e1c1a);
  // 창 기둥 (화면 가운데가 창 하나의 가운데)
  const pitch = 150;
  const start = Math.round(w / 2 - pitch / 2) % pitch;
  for (let x = start - pitch; x < w + pitch; x += pitch) {
    px(ctx, x - 6, WIN_TOP, 12, WIN_BOT - WIN_TOP, 0x4a443e);
    px(ctx, x - 5, WIN_TOP, 1, WIN_BOT - WIN_TOP, 0x6a645c);
    px(ctx, x + 5, WIN_TOP, 1, WIN_BOT - WIN_TOP, 0x2e2a26);
    px(ctx, x - 8, WIN_TOP, 2, WIN_BOT - WIN_TOP, 0x1e1c1a);
    px(ctx, x + 6, WIN_TOP, 2, WIN_BOT - WIN_TOP, 0x1e1c1a);
    // 창 위쪽 열림 손잡이
    px(ctx, x + 20, WIN_TOP + 3, 8, 2, 0x8a8a8c);
  }
  // 창턱
  px(ctx, 0, WIN_BOT, w, 6, 0x8a8a8c);
  px(ctx, 0, WIN_BOT, w, 1, 0xb4b4b6);
  px(ctx, 0, WIN_BOT + 5, w, 1, 0x5a5a5c);
  // 아래 벽
  px(ctx, 0, WIN_BOT + 6, w, ART_H - WIN_BOT - 6, 0x6a5440);
  px(ctx, 0, ART_H - 14, w, 14, 0x5a4636);
  // 좌석 등받이 (청록 천, 위에 손잡이)
  const seatPitch = 92;
  const s0 = Math.round(w / 2 - seatPitch / 2) % seatPitch;
  for (let x = s0 - seatPitch; x < w + seatPitch; x += seatPitch) {
    px(ctx, x + 4, 136, 60, ART_H - 136, 0x2a5656);
    px(ctx, x + 6, 134, 56, 2, 0x2a5656);
    px(ctx, x + 6, 136, 56, ART_H - 136, 0x2f6060);
    for (let yy = 140; yy < ART_H; yy += 6) for (let xx = x + 9 + ((yy / 6) % 2) * 3; xx < x + 60; xx += 6) px(ctx, xx, yy, 1, 1, 0x3a7070);
    px(ctx, x + 6, 136, 56, 1, 0x4a8080);
    // 크롬 손잡이
    px(ctx, x + 14, 129, 40, 2, 0xc8c8cc);
    px(ctx, x + 14, 129, 2, 7, 0xc8c8cc);
    px(ctx, x + 52, 129, 2, 7, 0xc8c8cc);
  }
  return canvas;
}

/** 손잡이 하나 (끈 + 고리). 원점 = 위 가운데 */
export function buildStrap(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(9, 22);
  px(ctx, 3, 0, 3, 12, 0x3a5a5a);
  px(ctx, 4, 0, 1, 12, 0x5a7a7a);
  // 고리 (7×7 둥근 테)
  const ring = ["..###..", ".#...#.", "#.....#", "#.....#", "#.....#", ".#...#.", "..###.."];
  ring.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && px(ctx, 1 + x, 12 + y, 1, 1, y < 2 ? 0xeeeae0 : 0xc8c4b8)));
  return canvas;
}

/** 하늘 (위 → 아래 그라데이션, 1px 폭) */
export function buildSky(top: string, bottom: string): HTMLCanvasElement {
  const h = WIN_BOT - WIN_TOP;
  const { canvas, ctx } = makeCanvas(1, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1, h);
  return canvas;
}

/** 별 (타일) */
export function buildStars(seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(160, 70);
  const r = rng(seed);
  for (let i = 0; i < 46; i++) {
    const c = r() < 0.2 ? 0xfff4d0 : r() < 0.5 ? 0xd8e0ff : 0xffffff;
    px(ctx, Math.floor(r() * 160), Math.floor(r() * 70), 1, 1, c, 0.5 + r() * 0.5);
  }
  return canvas;
}

/** 구름 (타일, 부드러운 픽셀 덩어리) */
export function buildClouds(seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(240, 40);
  const r = rng(seed);
  for (let i = 0; i < 4; i++) {
    const cx = 20 + i * 60 + r() * 20;
    const cy = 12 + r() * 16;
    const w = 14 + r() * 12;
    blob(ctx, cx, cy + 2, w, 4, 0xd8dce4);
    blob(ctx, cx - w * 0.3, cy, w * 0.5, 4, 0xeef0f4);
    blob(ctx, cx + w * 0.25, cy - 1, w * 0.45, 4.5, 0xf6f6f8);
  }
  return canvas;
}

/** 낙엽 한 장 (3×3) */
export function buildLeaf(c: Color): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(3, 3);
  px(ctx, 1, 0, 1, 3, c);
  px(ctx, 0, 1, 3, 1, c);
  px(ctx, 2, 0, 1, 1, lighten(c, 0.25));
  return canvas;
}

/** 숲 햇살 줄기 (부드러운 사선, 가산) */
export function buildSunbeam(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(40, 110);
  const g = ctx.createLinearGradient(0, 0, 40, 0);
  g.addColorStop(0, "rgba(255,240,190,0)");
  g.addColorStop(0.5, "rgba(255,240,190,0.9)");
  g.addColorStop(1, "rgba(255,240,190,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(26, 0);
  ctx.lineTo(40, 110);
  ctx.lineTo(10, 110);
  ctx.closePath();
  ctx.fill();
  const v = ctx.createLinearGradient(0, 0, 0, 110);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 40, 110);
  ctx.globalCompositeOperation = "source-over";
  return canvas;
}

/** 자막 한 줄 (어두운 둥근 바탕 + 픽셀 글자). 화면 배율은 장면이 정한다 */
export function buildCaption(text: string): HTMLCanvasElement {
  const { ctx: m } = makeCanvas(4, 4);
  m.font = `12px "Galmuri11", "Galmuri9", monospace`;
  const tw = Math.ceil(m.measureText(text).width) + 2;
  const w = tw + 16;
  const h = 20;
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = "rgba(14,12,10,0.78)";
  ctx.fillRect(2, 0, w - 4, h);
  ctx.fillRect(0, 2, w, h - 4);
  ctx.fillRect(1, 1, w - 2, h - 2);
  pixelText(ctx, text, 8, 3, 0xf6eedc);
  return canvas;
}
