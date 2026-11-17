import { darken, Grid, hash2, lighten, makeCanvas, mix, rng, type Color } from "./pixel";
import { tree, type LeafPal } from "./props";

// 11/17 겨울·크리스마스 판 그림 (lib/mapConcept). 기존 그림을 받아 눈을 얹거나(snowCap·snowRoof), 겨울에만 쓰는 그림을 새로 그린다.
//  - snowCap: 위가 빈 픽셀(윗면)마다 눈을 1~3px 얹는다. 평평한 곳은 두껍게, 비탈은 얇게, 평평한 곳은 윤곽 위로 한 줄 소복이
//  - snowRoof: 지붕 색 픽셀을 통째로 눈으로 덮고 처마 끝 한 줄만 원래 색으로 남긴 뒤 처마 밑에 고드름
//  - 앙상한 나무·눈 쌓인 활엽수·눈사람·선물 더미·장작더미·문 리스·큰 크리스마스트리·전구 줄과 그 빛(두 장 번갈아 반짝)
// 모든 물체 그림은 원점 = 바닥 가운데 (0.5, 1), 맨 아래 줄 근처는 그림자 (props.ts와 같은 규칙).

const OUT = 0x1f1d1a;
/** 눈 윤곽 (검은 윤곽보다 차갑고 옅게 — 눈 덮인 바닥 위에서도 모양이 보이게) */
const SNOW_EDGE = 0x55606c;
export const SNOW = { hi: 0xf6f9fc, mid: 0xe6edf3, lo: 0xcad6e2, shade: 0xaabdcf, deep: 0x8ea3b9 } as const;
export const ICE = { hi: 0xeef8fd, mid: 0xc4e0ee, lo: 0x9cc6dc } as const;

type Img = { w: number; h: number; d: Uint8ClampedArray };

function readCanvas(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData } {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  return { canvas, ctx, img: ctx.getImageData(0, 0, src.width, src.height) };
}

function put(m: Img, x: number, y: number, c: Color, a = 255): void {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  const i = (y * m.w + x) * 4;
  m.d[i] = (c >> 16) & 255;
  m.d[i + 1] = (c >> 8) & 255;
  m.d[i + 2] = c & 255;
  m.d[i + 3] = a;
}

const alphaAt = (m: Img, x: number, y: number) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? 0 : m.d[(y * m.w + x) * 4 + 3]);
const rgbAt = (m: Img, x: number, y: number): Color => {
  const i = (y * m.w + x) * 4;
  return (m.d[i] << 16) | (m.d[i + 1] << 8) | m.d[i + 2];
};
const lum = (c: Color) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);

export type SnowCapOpts = {
  /** 평평한 윗면의 눈 두께 (px, 기본 2) */
  depth?: number;
  /** 세로로 쌓인 프레임 시트면 프레임 높이 (프레임 경계를 넘어 쌓지 않는다) */
  frameH?: number;
  /** 가로로 놓인 프레임 시트면 프레임 폭 */
  frameW?: number;
  /** 이 y 아래(캔버스 아래쪽 행)는 건드리지 않는다 (그림자·받침) */
  maxY?: number;
  seed?: number;
};

/** 그림 윗면에 눈을 얹은 새 캔버스 (원본은 그대로) */
export function snowCap(src: HTMLCanvasElement, o: SnowCapOpts = {}): HTMLCanvasElement {
  const { canvas, ctx, img } = readCanvas(src);
  const m: Img = { w: img.width, h: img.height, d: img.data };
  snowCapImg(m, o);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function snowCapImg(m: Img, o: SnowCapOpts): void {
  const depth = o.depth ?? 2;
  const fh = o.frameH ?? m.h;
  const fw = o.frameW ?? m.w;
  const maxY = o.maxY ?? m.h;
  const seed = o.seed ?? 7;
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
    return alphaAt(m, x, y) >= 200;
  };
  // 프레임 맨 윗줄은 위가 비었다고 본다. 같은 프레임 안의 이웃만 본다
  const sameFrame = (x0: number, y0: number, x1: number, y1: number) => Math.floor(x0 / fw) === Math.floor(x1 / fw) && Math.floor(y0 / fh) === Math.floor(y1 / fh);
  const exposed = (x: number, y: number) => solid(x, y) && !(sameFrame(x, y, x, y - 1) && solid(x, y - 1));
  const tops: [number, number, number][] = [];
  for (let y = 0; y < Math.min(m.h, maxY); y++)
    for (let x = 0; x < m.w; x++) {
      if (!exposed(x, y)) continue;
      const l = sameFrame(x, y, x - 1, y) && exposed(x - 1, y);
      const r = sameFrame(x, y, x + 1, y) && exposed(x + 1, y);
      const flat = (l ? 1 : 0) + (r ? 1 : 0);
      const j = hash2(x, y, seed) < 0.35 ? 1 : 0;
      const t = flat === 2 ? depth + j : flat === 1 ? Math.max(1, depth - 1 + j) : 1;
      tops.push([x, y, t]);
    }
  for (const [x, y, t] of tops) {
    const c0 = rgbAt(m, x, y);
    // 윤곽(어두운 픽셀)이면 차가운 눈 윤곽으로, 아니면 그 자리부터 눈
    const edge = lum(c0) < 70;
    if (edge) put(m, x, y, SNOW_EDGE);
    const start = edge ? y + 1 : y;
    for (let k = 0; k < t; k++) {
      const yy = start + k;
      if (!sameFrame(x, y, x, yy) || yy >= maxY || !solid(x, yy)) break;
      const c = k === t - 1 && t > 1 ? SNOW.lo : k === 0 ? SNOW.hi : SNOW.mid;
      put(m, x, yy, hash2(x, yy, seed + 3) < 0.07 ? SNOW.lo : c);
    }
    // 평평한 곳은 윤곽 위로 한 줄 소복이 (위가 비어 있고 같은 프레임일 때)
    if (t >= 2 && y - 1 >= 0 && sameFrame(x, y, x, y - 1) && alphaAt(m, x, y - 1) < 40 && hash2(x, y, seed + 5) < 0.75) {
      put(m, x, y, SNOW.hi);
      put(m, x, y - 1, SNOW_EDGE);
    }
  }
}

/**
 * 지붕 색 픽셀을 눈으로 덮는다 (처마 끝 한 줄은 원래 색) + 처마 밑 고드름.
 * roof: 지붕으로 볼 색들 (정확히 같은 색), 또는 픽셀이 지붕인지 묻는 함수
 */
export function snowRoof(src: HTMLCanvasElement, roof: readonly Color[] | ((x: number, y: number, c: Color) => boolean), o: { icicles?: boolean; seed?: number } = {}): HTMLCanvasElement {
  const { canvas, ctx, img } = readCanvas(src);
  const m: Img = { w: img.width, h: img.height, d: img.data };
  const set = Array.isArray(roof) ? new Set(roof) : null;
  const isRoof = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h || alphaAt(m, x, y) < 200) return false;
    const c = rgbAt(m, x, y);
    return set ? set.has(c) : (roof as (x: number, y: number, c: Color) => boolean)(x, y, c);
  };
  const mask = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (isRoof(x, y)) mask[y * m.w + x] = 1;
  snowMask(m, mask, o.icicles ?? true, o.seed ?? 11);
  // 지붕 말고도 윗면(굴뚝·간판)에 얇게
  snowCapImg(m, { depth: 1, seed: o.seed });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 마스크(1 = 지붕)를 눈으로 덮고 처마 끝 아래에 고드름을 단다 (Grid·캔버스 공용) */
function snowMask(m: Img, mask: Uint8Array, icicles: boolean, seed: number): void {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && mask[y * m.w + x] === 1;
  const eaves: [number, number][] = [];
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y + 1)) {
        // 처마 끝: 원래 색을 살짝 차갑게 남긴다
        put(m, x, y, mix(rgbAt(m, x, y), 0x8090a4, 0.2));
        eaves.push([x, y]);
        continue;
      }
      // 처마 바로 위 줄은 눈의 두께 그늘, 위쪽은 밝게. 바람 결 무늬 몇 줄
      const nearEave = !at(x, y + 2);
      const side = !at(x - 1, y) || !at(x + 1, y);
      const h = hash2(x >> 1, y, seed);
      let c: Color = nearEave ? SNOW.lo : !at(x, y - 1) ? SNOW.hi : h < 0.1 ? SNOW.lo : h > 0.85 ? SNOW.hi : SNOW.mid;
      if (side && !nearEave) c = SNOW.lo;
      put(m, x, y, c);
    }
  if (!icicles) return;
  let last = -9;
  for (const [x, y] of eaves) {
    if (x - last < 2 || hash2(x, y, seed + 9) < 0.42) continue;
    last = x;
    const len = 1 + Math.floor(hash2(x, y, seed + 13) * 4);
    for (let k = 1; k <= len; k++) put(m, x, y + k, k === len ? ICE.lo : k === 1 ? ICE.hi : ICE.mid);
  }
}

/** 집 외관 그리드(F2 lotLayers의 house)에 지붕 눈 + 고드름 + 윗면 눈. roofMask = 지붕 픽셀 (같은 크기 그리드) */
export function snowGridRoof(src: Grid, roofMask: Grid, seed = 5): Grid {
  const g = new Grid(src.w, src.h);
  g.px.set(src.px);
  const d = new Uint8ClampedArray(src.w * src.h * 4);
  const m: Img = { w: src.w, h: src.h, d };
  for (let i = 0; i < src.px.length; i++) {
    const v = src.px[i];
    d[i * 4] = (v >>> 24) & 255;
    d[i * 4 + 1] = (v >>> 16) & 255;
    d[i * 4 + 2] = (v >>> 8) & 255;
    d[i * 4 + 3] = v & 255;
  }
  const mask = new Uint8Array(src.w * src.h);
  for (let i = 0; i < mask.length; i++) if ((roofMask.px[i] & 255) > 0 && (src.px[i] & 255) > 0) mask[i] = 1;
  snowMask(m, mask, true, seed);
  snowCapImg(m, { depth: 1, seed });
  for (let i = 0; i < src.px.length; i++) g.px[i] = ((d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3]) >>> 0;
  return g;
}

/** 그리드에도 윗면 눈 (집 뒤뜰 나무·앞 울타리) */
export function snowGrid(src: Grid, depth = 2, seed = 3): Grid {
  const g = new Grid(src.w, src.h);
  const d = new Uint8ClampedArray(src.w * src.h * 4);
  for (let i = 0; i < src.px.length; i++) {
    const v = src.px[i];
    d[i * 4] = (v >>> 24) & 255;
    d[i * 4 + 1] = (v >>> 16) & 255;
    d[i * 4 + 2] = (v >>> 8) & 255;
    d[i * 4 + 3] = v & 255;
  }
  snowCapImg({ w: src.w, h: src.h, d }, { depth, seed });
  for (let i = 0; i < src.px.length; i++) g.px[i] = ((d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3]) >>> 0;
  return g;
}

/**
 * 마당·잔디 그리드를 눈밭으로: 초록빛 픽셀은 눈(원래 밝기 차이를 살짝 남긴다), 흙·돌은 서리 내린 색.
 * 눈 위로 마른 풀 몇 가닥이 삐죽 나온다
 */
export function snowLawn(src: Grid, seed = 9): Grid {
  const g = new Grid(src.w, src.h);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const v = src.px[y * src.w + x];
      const a = v & 255;
      if (!a) continue;
      const c = v >>> 8;
      const r = (c >> 16) & 255;
      const gg = (c >> 8) & 255;
      const b = c & 255;
      let out: Color;
      if (gg > r + 6 && gg > b) {
        const h = hash2(x, y, seed);
        const n = (lum(c) - 80) / 120;
        out = h < 0.0015 ? 0x7c7650 : mix(SNOW.mid, n > 0 ? SNOW.hi : SNOW.lo, Math.min(0.7, Math.abs(n) * 1.1));
      } else out = mix(c, 0xd6e0ea, 0.28);
      g.set(x, y, out, a);
    }
  return g;
}

// ── 나무 ──

/** 눈 쌓인 상록 활엽수 잎 (짙은 청록) */
const EVERGREEN: LeafPal = { hi: 0x4f6e5e, mid: 0x3b5648, lo: 0x2b4136, deep: 0x22342b };

/** 눈을 소복이 인 둥근 나무 (tree()와 같은 크기·받침) */
export function snowyRoundTree(v: number): HTMLCanvasElement {
  return snowCap(tree(v, EVERGREEN), { depth: 3, maxY: 30, seed: 21 + v });
}

const BARK = { mid: 0x4e423a, hi: 0x6c5d50, lo: 0x3a302a };
const BIRCH = { mid: 0xd8d4ca, hi: 0xeeebe2, lo: 0xa8a49a, mark: 0x3a3430 };

/**
 * 앙상한 겨울나무 (32×40, tree()와 같은 받침). kind 0·1 = 짙은 껍질 두 모양, 2 = 하얀 자작나무.
 * 가지 끝으로 갈수록 가늘게 갈라지고, 가지 윗면·갈래마다 눈이 얹힌다
 */
export function bareTree(kind: number): HTMLCanvasElement {
  const g = new Grid(32, 40);
  const r = rng(301 + kind * 47);
  const birch = kind === 2;
  const bark = birch ? BIRCH.mid : BARK.mid;
  const hi = birch ? BIRCH.hi : BARK.hi;
  const twig = birch ? 0x6a625a : BARK.lo;
  // 줄기 (tree()와 같은 굵기·밑동)
  for (let y = 18; y <= 37; y++) {
    const flare = y > 34 ? y - 34 : 0;
    const x0 = (birch ? 14 : 13) - flare;
    const x1 = (birch ? 17 : 18) + flare;
    for (let x = x0; x <= x1; x++) g.set(x, y, x === x0 ? hi : x === x1 ? (birch ? BIRCH.lo : BARK.lo) : bark);
  }
  if (birch) for (const [x, y] of [[15, 22], [16, 26], [14, 30], [16, 33], [15, 20]]) g.hline(x, x + 1, y, BIRCH.mark);
  // 가지: 줄기 꼭대기에서 위로 갈라진다 (재귀, 굵기 2 → 1)
  const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    const steps = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(x + ((x1 - x) * i) / steps);
      const py = Math.round(y + ((y1 - y) * i) / steps);
      g.rect(px, py, w, w, depth === 0 ? bark : depth === 1 ? (birch ? BIRCH.lo : bark) : twig);
    }
    if (depth >= 3 || len < 3) return;
    const n = depth === 0 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const spread = (k - (n - 1) / 2) * (0.55 + r() * 0.35);
      branch(x1, y1, ang + spread + (r() - 0.5) * 0.3, len * (0.62 + r() * 0.12), depth >= 1 ? 1 : w, depth + 1);
    }
  };
  const top = { x: 15.5, y: 19 };
  const shapes: [number, number][] =
    kind === 1
      ? [
          [-Math.PI / 2 - 0.9, 9],
          [-Math.PI / 2 + 0.85, 9],
          [-Math.PI / 2 + 0.05, 8],
        ]
      : kind === 2
        ? [
            [-Math.PI / 2 - 0.35, 11],
            [-Math.PI / 2 + 0.4, 10],
          ]
        : [
            [-Math.PI / 2 - 0.6, 10],
            [-Math.PI / 2 + 0.55, 10],
            [-Math.PI / 2 - 0.05, 9],
          ];
  for (const [a, l] of shapes) branch(top.x, top.y, a, l, 2, 0);
  // 줄기 옆 짧은 가지
  branch(13, 26, Math.PI + 0.6, 5, 1, 2);
  branch(18, 24, -0.5, 5, 1, 2);
  g.outline(OUT);
  // 그림자
  for (let y = 36; y <= 39; y++)
    for (let x = 4; x <= 28; x++) {
      const dx = (x + 0.5 - 16) / 10;
      const dy = (y + 0.5 - 38) / 2;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, 60);
    }
  return snowCap(g.toCanvas(), { depth: 1, maxY: 34, seed: 31 + kind });
}

// ── 겨울 소품 ──

/** 눈사람 (18×28). v: 목도리·모자 모양 */
export const SNOWMAN_W = 18;
export const SNOWMAN_H = 28;
export function snowman(v: number): HTMLCanvasElement {
  const g = new Grid(SNOWMAN_W, SNOWMAN_H);
  const body = SNOW.mid;
  g.ellipse(9, 20.5, 7, 5.5, body);
  g.ellipse(9, 12.5, 5, 4.2, body);
  g.ellipse(9, 6.5, 3.8, 3.4, body);
  // 왼쪽 위는 밝게, 오른쪽 아래는 푸른 그늘
  g.recolor((x, y) => !g.filled(x - 1, y - 1), SNOW.hi);
  g.recolor((x, y) => !g.filled(x + 1, y + 1) || (x > 12 && y > 17), SNOW.shade);
  // 눈·코·단추
  g.set(8, 6, 0x22262c);
  g.set(10, 6, 0x22262c);
  g.hline(10, 12, 7, 0xe8762a);
  g.set(12, 7, 0xc85a1a);
  for (const y of [11, 14, 19]) g.set(9, y, 0x2a2e34);
  // 나뭇가지 팔
  g.hline(1, 4, 11, 0x5a4232);
  g.set(1, 10, 0x5a4232);
  g.hline(14, 17, 12, 0x5a4232);
  g.set(17, 11, 0x5a4232);
  // 목도리
  const scarf = [0xc8323a, 0x2f8a52, 0x3a6ec8][v % 3];
  g.hline(5, 13, 9, scarf);
  g.hline(5, 13, 10, darken(scarf, 0.2));
  g.vline(11, 10, 13, scarf);
  g.set(11, 14, darken(scarf, 0.3));
  // 모자
  if (v % 2 === 0) {
    g.rect(6, 1, 6, 3, 0x2a2a30);
    g.hline(5, 12, 3, 0x3a3a42);
    g.hline(6, 11, 2, scarf);
  } else {
    g.ellipse(9, 3, 3.6, 2, scarf);
    g.hline(6, 12, 4, 0xf0f0f0);
    g.set(9, 0, 0xf6f6f6);
  }
  g.outline(SNOW_EDGE);
  for (let y = 25; y <= 27; y++)
    for (let x = 1; x <= 17; x++) {
      const dx = (x + 0.5 - 9) / 8;
      const dy = (y + 0.5 - 26) / 1.6;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x30486a, 70);
    }
  return g.toCanvas();
}

/** 상자 하나 (그리드에 직접) */
function giftBox(g: Grid, x: number, y: number, w: number, h: number, body: Color, ribbon: Color): void {
  g.rect(x, y, w, h, body);
  g.hline(x, x + w - 1, y, lighten(body, 0.22));
  g.vline(x + w - 1, y + 1, y + h - 1, darken(body, 0.22));
  const rx = x + Math.floor(w / 2);
  g.vline(rx, y, y + h - 1, ribbon);
  g.hline(x, x + w - 1, y + Math.floor(h / 2), ribbon);
  // 리본 매듭
  g.set(rx - 1, y - 1, ribbon);
  g.set(rx + 1, y - 1, ribbon);
  g.set(rx - 2, y - 2, lighten(ribbon, 0.2));
  g.set(rx + 2, y - 2, lighten(ribbon, 0.2));
}

/** 선물 더미 (24×16) */
export function giftPile(v: number): HTMLCanvasElement {
  const g = new Grid(24, 16);
  const sets: [Color, Color][] = [
    [0xc8323a, 0xf2d060],
    [0x2f8a52, 0xe84a4a],
    [0x3a6ec8, 0xf2f2f2],
    [0xe8e0d0, 0xc8323a],
    [0x8a4ac8, 0xf2d060],
  ];
  const s = (i: number) => sets[(i + v) % sets.length];
  giftBox(g, 2, 7, 9, 7, ...s(0));
  giftBox(g, 12, 9, 8, 5, ...s(1));
  giftBox(g, 7, 3, 7, 5, ...s(2));
  if (v % 2) giftBox(g, 18, 11, 5, 3, ...s(3));
  g.outline(OUT);
  for (let x = 1; x < 23; x++) if (!g.filled(x, 15)) g.set(x, 15, 0x30486a, 60);
  return snowCap(g.toCanvas(), { depth: 1, maxY: 13, seed: 41 + v });
}

/** 장작더미 (24×16): 통나무 단면이 보이게 쌓고 위에 눈 */
export function woodpile(): HTMLCanvasElement {
  const g = new Grid(24, 16);
  const rows: [number, number][] = [
    [3, 12],
    [5, 8],
    [7, 4],
  ];
  for (const [i, [x0, y]] of rows.entries()) {
    const n = 4 - i;
    for (let k = 0; k < n; k++) {
      const x = x0 + k * 5 - (i === 0 ? 1 : 0);
      g.ellipse(x + 2, y + 1.5, 2.6, 2.2, 0x9c6d45);
      g.set(x + 2, y + 1, 0xd8b080);
      g.set(x + 1, y + 2, 0xb88a5a);
    }
  }
  // 받침 각목
  g.hline(1, 22, 14, 0x553722);
  g.outline(OUT);
  for (let x = 1; x < 23; x++) if (!g.filled(x, 15)) g.set(x, 15, 0x30486a, 60);
  return snowCap(g.toCanvas(), { depth: 2, maxY: 13, seed: 51 });
}

/** 문에 거는 리스 (11×12) */
export function doorWreath(): HTMLCanvasElement {
  const g = new Grid(11, 12);
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < 11; x++) {
      const d = Math.hypot(x + 0.5 - 5.5, y + 0.5 - 5.5);
      if (d <= 5.2 && d >= 2.4) g.set(x, y, hash2(x, y, 61) < 0.3 ? 0x3e7a48 : hash2(x, y, 63) < 0.5 ? 0x2b5a36 : 0x23482c);
    }
  for (const [x, y] of [[2, 3], [8, 2], [9, 7], [3, 8], [6, 1]]) g.set(x, y, 0xd8323a);
  // 아래 리본
  g.set(4, 9, 0xd8323a);
  g.set(6, 9, 0xd8323a);
  g.set(5, 9, 0xf04a4a);
  g.set(4, 10, 0xb82a30);
  g.set(6, 10, 0xb82a30);
  g.set(3, 11, 0xb82a30);
  g.set(7, 11, 0xb82a30);
  g.outline(OUT, false, 200);
  return g.toCanvas();
}

// ── 크리스마스트리 (광장) ──

export const XTREE_W = 64;
export const XTREE_H = 86;
export type Bulb = { x: number; y: number; c: Color };
const BULB_COLORS: readonly Color[] = [0xff5a5a, 0xffd25a, 0x6ad8ff, 0x8aff8a, 0xfff2d8, 0xff8ad8];

/** 큰 크리스마스트리 그림 + 전구 자리 (빛 겹은 bulbGlowSheet) */
export function christmasTree(): { canvas: HTMLCanvasElement; bulbs: Bulb[]; star: { x: number; y: number } } {
  const W = XTREE_W;
  const H = XTREE_H;
  const g = new Grid(W, H);
  const cx = W / 2;
  const r = rng(777);
  const leaf = { hi: 0x3f7a52, mid: 0x2c5e3e, lo: 0x1f4630, deep: 0x173726 };
  // 줄기
  g.rect(cx - 3, 64, 6, 10, 0x5a3e2a);
  g.vline(cx - 3, 64, 73, 0x7a5a3e);
  // 층 (위가 좁고 아래가 넓다). 층 아랫단은 톱니처럼
  const tiers: [number, number, number][] = [
    [10, 15, 9],
    [19, 17, 14],
    [30, 18, 19],
    [41, 19, 24],
    [52, 16, 28],
  ];
  for (const [top, h, hw] of tiers) {
    for (let y = 0; y < h; y++) {
      const w = Math.round(2 + ((hw - 2) * y) / (h - 1));
      for (let x = Math.round(cx - w); x < Math.round(cx + w); x++) {
        const right = x >= cx;
        const c = y > h - 3 ? leaf.lo : right ? leaf.mid : x < cx - w * 0.55 ? leaf.hi : leaf.mid;
        g.set(x, top + y, c);
      }
    }
    // 톱니 아랫단
    for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) if (x % 3 === 0) g.set(x, top + h, leaf.deep);
  }
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(r() * W);
    const y = 10 + Math.floor(r() * 56);
    if (g.filled(x, y)) g.set(x, y, r() < 0.5 ? leaf.deep : leaf.hi);
  }
  g.outline(OUT);
  // 층마다 금빛 장식 줄 (비스듬히 늘어진 곡선)
  for (const [top, h, hw] of tiers) {
    const y0 = top + Math.round(h * 0.45);
    for (let x = Math.round(cx - hw * 0.85); x <= Math.round(cx + hw * 0.85); x++) {
      const t = (x - (cx - hw * 0.85)) / (hw * 1.7);
      const y = Math.round(y0 + t * 5 + Math.sin(t * Math.PI) * 2);
      if (g.filled(x, y)) g.set(x, y, (x & 1) ? 0xf2d060 : 0xfff2a8);
    }
  }
  // 장식 공 (빨강·금·파랑·은)
  const balls: Color[] = [0xd8323a, 0xe8b830, 0x3a7ad8, 0xd8dce4, 0xc8323a];
  for (let i = 0; i < 26; i++) {
    const ti = i % tiers.length;
    const [top, h, hw] = tiers[ti];
    const y = top + 3 + Math.floor(r() * (h - 4));
    const w = 2 + ((hw - 2) * (y - top)) / (h - 1);
    const x = Math.round(cx - w + 2 + r() * (w * 2 - 4));
    if (!g.filled(x, y) || !g.filled(x + 1, y + 1)) continue;
    const c = balls[i % balls.length];
    g.rect(x, y, 2, 2, c);
    g.set(x, y, lighten(c, 0.55));
    g.set(x + 1, y + 1, darken(c, 0.3));
  }
  // 전구 (1px, 빛 겹이 따로 반짝인다)
  const bulbs: Bulb[] = [];
  for (const [top, h, hw] of tiers) {
    for (const f of [0.25, 0.8]) {
      const y0 = top + Math.round(h * f);
      const w = 2 + ((hw - 2) * (y0 - top)) / (h - 1);
      for (let x = Math.round(cx - w + 2); x <= Math.round(cx + w - 2); x += 4) {
        const y = y0 + Math.round(Math.sin(x * 0.7) * 1);
        if (!g.filled(x, y)) continue;
        const c = BULB_COLORS[bulbs.length % BULB_COLORS.length];
        g.set(x, y, c);
        bulbs.push({ x, y, c });
      }
    }
  }
  // 별
  const star = { x: cx, y: 6 };
  const starPx: [number, number][] = [
    [0, -5], [0, -4], [-1, -3], [0, -3], [1, -3], [-4, -2], [-3, -2], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [3, -2],
    [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-3, 1], [-2, 1], [2, 1], [3, 1],
  ];
  for (const [dx, dy] of starPx) g.set(star.x + dx, star.y + dy + 2, dy < -1 ? 0xfff2a8 : 0xf2c040);
  g.set(star.x, star.y - 1, 0xffffff);
  // 선물 (밑동 둘레)
  giftBox(g, cx - 22, 70, 9, 7, 0xc8323a, 0xf2d060);
  giftBox(g, cx - 12, 72, 7, 5, 0x3a6ec8, 0xf2f2f2);
  giftBox(g, cx + 5, 71, 8, 6, 0x2f8a52, 0xe84a4a);
  giftBox(g, cx + 14, 73, 7, 4, 0xe8e0d0, 0xc8323a);
  giftBox(g, cx - 4, 76, 6, 3, 0x8a4ac8, 0xf2d060);
  g.outline(OUT);
  for (let y = 78; y < H; y++)
    for (let x = 4; x < W - 4; x++) {
      const dx = (x + 0.5 - cx) / 28;
      const dy = (y + 0.5 - 81) / 3.2;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x30486a, 70);
    }
  const canvas = snowCap(g.toCanvas(), { depth: 2, maxY: 68, seed: 71 });
  return { canvas, bulbs, star };
}

/**
 * 전구 빛 겹 (가산 섞기로 위에 겹친다): 같은 크기 프레임 두 장을 가로로. 프레임마다 전구 절반이 밝게, 나머지는 은은하게 —
 * 두 장을 번갈아 보여 주면 반짝인다
 */
export function bulbGlowSheet(w: number, h: number, bulbs: readonly Bulb[], star?: { x: number; y: number }): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w * 2, h);
  for (let f = 0; f < 2; f++) {
    for (const [i, b] of bulbs.entries()) {
      const on = (i + f) % 2 === 0;
      const rgb = `${(b.c >> 16) & 255},${(b.c >> 8) & 255},${b.c & 255}`;
      const R = on ? 4 : 2.5;
      const gr = ctx.createRadialGradient(f * w + b.x + 0.5, b.y + 0.5, 0, f * w + b.x + 0.5, b.y + 0.5, R);
      gr.addColorStop(0, `rgba(${rgb},${on ? 0.95 : 0.45})`);
      gr.addColorStop(0.35, `rgba(${rgb},${on ? 0.45 : 0.15})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(f * w + b.x - R, b.y - R, R * 2 + 1, R * 2 + 1);
      ctx.fillStyle = `rgba(255,255,255,${on ? 0.9 : 0.4})`;
      ctx.fillRect(f * w + b.x, b.y, 1, 1);
    }
    if (star) {
      const R = f ? 10 : 8;
      const gr = ctx.createRadialGradient(f * w + star.x, star.y + 1, 0, f * w + star.x, star.y + 1, R);
      gr.addColorStop(0, "rgba(255,240,170,0.95)");
      gr.addColorStop(0.4, "rgba(255,210,90,0.35)");
      gr.addColorStop(1, "rgba(255,200,80,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(f * w + star.x - R, star.y + 1 - R, R * 2, R * 2);
    }
  }
  return canvas;
}

/**
 * 두 점을 잇는 전구 줄 (늘어진 전선 + 전구). 그림 원점은 왼쪽 위, ox·oy = 첫 점이 그림 안에서 놓인 자리.
 * 전선은 늘어진 포물선, 전구는 6px마다 색을 돌려 단다
 */
export function lightString(dx: number, dy: number, sag: number): { canvas: HTMLCanvasElement; bulbs: Bulb[]; ox: number; oy: number } {
  const pad = 3;
  const minY = Math.min(0, dy);
  const w = Math.abs(dx) + pad * 2 + 1;
  const h = Math.abs(dy) + sag + pad * 2 + 2;
  const g = new Grid(w, h);
  const ox = pad + (dx < 0 ? -dx : 0);
  const oy = pad - minY;
  const n = Math.max(2, Math.ceil(Math.hypot(dx, dy)));
  const bulbs: Bulb[] = [];
  let prev: [number, number] | null = null;
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(ox + dx * t);
    const y = Math.round(oy + dy * t + sag * 4 * t * (1 - t));
    if (prev) acc += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
    g.set(x, y, 0x2a2622);
    if (acc >= 6 && t > 0.03 && t < 0.97) {
      acc = 0;
      const c = BULB_COLORS[bulbs.length % 5];
      g.set(x, y + 1, c);
      bulbs.push({ x, y: y + 1, c });
    }
  }
  return { canvas: g.toCanvas(), bulbs, ox, oy };
}

/** 가로등 크리스마스판: 기둥에 빨강·흰 줄무늬 리본 + 리스 (streetLamp 12×32 위에) */
export function xmasLamp(src: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx, img } = readCanvas(snowCap(src, { depth: 2, maxY: 29 }));
  const m: Img = { w: img.width, h: img.height, d: img.data };
  for (let y = 10; y < 28; y++) {
    if ((y >> 1) % 2) continue;
    put(m, 5, y, 0xd8323a);
    put(m, 6, y, 0xb82a30);
  }
  // 리스 (기둥 가운데)
  const cx = 6;
  const cy = 14;
  for (let y = -3; y <= 3; y++)
    for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d <= 3.2 && d >= 1.6) put(m, cx + x - 0, cy + y, (x + y) & 1 ? 0x2b5a36 : 0x3e7a48);
    }
  put(m, cx - 2, cy - 2, 0xd8323a);
  put(m, cx + 2, cy + 1, 0xd8323a);
  put(m, cx, cy + 3, 0xf04a4a);
  put(m, cx - 1, cy + 4, 0xb82a30);
  put(m, cx + 1, cy + 4, 0xb82a30);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 반짝이는 눈 결정 한 점 (5×5 십자, 흰색 — 쓰는 쪽에서 가산 섞기) */
export function snowGlint(): HTMLCanvasElement {
  const g = new Grid(5, 5);
  g.set(2, 2, 0xffffff);
  for (const [x, y] of [[2, 1], [2, 3], [1, 2], [3, 2]]) g.set(x, y, 0xdff0ff, 200);
  for (const [x, y] of [[2, 0], [2, 4], [0, 2], [4, 2]]) g.set(x, y, 0xbfdfff, 90);
  return g.toCanvas();
}

/** 입김 한 모금 (8×6 흰 김, 가장자리 옅게) */
export function breathPuff(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(8, 6);
  const gr = ctx.createRadialGradient(4, 3, 0, 4, 3, 4);
  gr.addColorStop(0, "rgba(255,255,255,0.95)");
  gr.addColorStop(0.6, "rgba(240,246,255,0.5)");
  gr.addColorStop(1, "rgba(240,246,255,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 8, 6);
  return canvas;
}

/** 겨울 꽃밭 자리 (22×10, flowerBed와 같은 크기): 눈 둔덕 위로 호랑가시 잎과 빨간 열매 */
export function hollyBed(v: number): HTMLCanvasElement {
  const g = new Grid(22, 10);
  const r = rng(91 + v * 7);
  g.ellipse(11, 6, 10, 3.2, SNOW.mid);
  g.recolor((x, y) => !g.filled(x, y - 1), SNOW.hi);
  g.recolor((x, y) => !g.filled(x, y + 1) || y > 7, SNOW.shade);
  for (let i = 0; i < 5 + (v % 3); i++) {
    const x = 3 + Math.floor(r() * 16);
    const y = 2 + Math.floor(r() * 4);
    g.set(x, y, 0x2b5a36);
    g.set(x + 1, y, 0x3e7a48);
    g.set(x, y + 1, 0x23482c);
    if (r() < 0.7) g.set(x + 1, y - 1, r() < 0.5 ? 0xd8323a : 0xf04a4a);
  }
  g.outline(SNOW_EDGE, false, 200);
  return g.toCanvas();
}
