import type { MapConcept } from "@/lib/mapConcept";
import { Grid, hash2, makeCanvas, mix, vnoise, type Color } from "./pixel";
import { SNOW, snowCap, snowRoof, type Bulb, type SnowCapOpts } from "./winterArt";

// 11/17 시점이 바뀌는 장면(관람차·열기구 하늘 · 바다 보기 · 버스 창밖)의 겨울·크리스마스 풍경 (lib/mapConcept).
// 장면 그림은 가을 그대로 다 그린 뒤 한 번 훑어 바꿔요 (마을 winterGround와 같은 방식 — 배치·움직임은 그대로):
//  - tone: 그림 파일이 아는 색(풀밭·나무·지붕…)을 겨울 색으로. 모르는 색은 색상으로 짐작해요 (guessTone — 풀빛 → 눈밭, 단풍 → 잎 진 가지빛)
//  - 지붕 색은 통째로 눈 + 처마 고드름(winterArt.snowRoof), 그다음 윗면마다 소복이(snowCap)
//  - 크리스마스: 처마 끝 전구 · 상록수 몇 그루에 전구. 빛은 두 장(bulbGlowPair)을 번갈아 보여 반짝여요 (밤에 환하게)
// 굽는 건 장면을 처음 열 때 한 번 (텍스처 키에 판 꼬리 conceptSuffix — 판마다 따로 남겨 둬요)

export const XMAS_BULBS: readonly Color[] = [0xff5a5a, 0xffd25a, 0x6ad8ff, 0x8aff8a, 0xff8ad8];

/** 장면 텍스처 키 꼬리 (기본판은 빈 문자열 — 예전 키 그대로) */
export function conceptSuffix(c: MapConcept): string {
  return c === "default" ? "" : c === "winter" ? "-w" : "-x";
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lumOf = (c: Color) => 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
/** 그늘진 눈 (푸른빛) */
const SNOW_SHADOW = 0x8a9cb6;

/** 눈밭 한 점: ratio = 원래 밝기 / 기준 밝기 (그늘이면 푸르게, 밝으면 하얗게) + 큰 둔덕 결 + 가끔 반짝 */
export function snowField(ratio: number, x: number, y: number, base: Color = SNOW.mid): Color {
  const drift = vnoise(x, y, 23, 611) - 0.5;
  const t = (ratio - 1) * 2 + drift * 0.35;
  if (hash2(x, y, 613) < 0.01) return SNOW.hi;
  if (t >= 0) return mix(base, SNOW.hi, Math.min(1, t * 1.6));
  return mix(base, SNOW_SHADOW, Math.min(0.85, -t));
}

/** 잎 진 나무 (짙은 가지와 옅은 잔가지가 얽힌 회갈색 — 밝기만 따라요) + 가지에 앉은 서리 점 */
export function bareTone(L: number, x: number, y: number): Color {
  const k = clamp01((L - 40) / 140);
  if (hash2(x, y, 617) < 0.1) return SNOW.lo;
  return hash2(x, y, 627) < 0.42 ? mix(0x3e3532, 0x6a5e5a, k) : mix(0x8a8280, 0xb2acac, k);
}

/** 상록수 (차가운 짙은 초록 — 밝기만 따라요) */
export function evergreenTone(L: number): Color {
  return mix(0x22342b, 0x587a66, clamp01((L - 25) / 110));
}

/**
 * 모르는 색 짐작하기: 무채색(돌·벽·길)·푸른 것(물·하늘·유리)은 그대로, 풀빛은 눈밭(아주 짙은 초록은 상록수), 단풍·은행은 잎 진 가지빛.
 * 그대로면 -1
 */
export function guessTone(c: Color, x: number, y: number): Color | -1 {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (sat < 0.12) return -1;
  if (b > r + 12 && b >= g - 4) return -1;
  const L = lumOf(c);
  if (g >= r - 6 && g > b + 10) return L < 62 ? evergreenTone(L) : snowField(L / 100, x, y);
  if (r > g + 24 && r > 140 && sat > 0.4) return bareTone(L, x, y);
  return -1;
}

export type SceneryWinter = {
  /** 색 바꾸기 (x·y = 그림 좌표). -1 = 그대로 */
  tone: (c: Color, x: number, y: number) => Color | -1;
  /** 지붕 색 (원래 그림 기준) — 통째로 눈 + 처마 고드름 */
  roof?: (c: Color) => boolean;
  /**
   * 활엽수 잎 색 (원래 그림 기준): 이어진 덩어리(나무 한 그루)마다 잎 진 나무 또는 눈 덮인 상록수로 갈라요 (bareShare = 잎 진 쪽 비율, 기본 0.5).
   * conifer = 늘 상록수인 바늘잎 색
   */
  foliage?: (c: Color, x: number, y: number) => boolean;
  bareShare?: number;
  conifer?: (c: Color, x: number, y: number) => boolean;
  /** 윗면 눈 (false = 얹지 않아요, 기본 깊이 2) */
  cap?: SnowCapOpts | false;
  /** 크리스마스 장식: eaves = 처마 끝 전구, treeRate = 상록수(바늘잎·상록수가 된 덩어리)에 다는 전구 비율 (0이면 안 달아요) */
  xmas?: { eaves?: boolean; treeRate?: number };
};

/**
 * 장면 그림 한 장을 겨울로 (원본은 그대로, 새 캔버스). 크리스마스 장식을 주면 전구도 찍고 그 자리를 돌려줘요 (빛 겹은 bulbGlowPair)
 */
export function winterizeCanvas(src: HTMLCanvasElement, o: SceneryWinter): { canvas: HTMLCanvasElement; bulbs: Bulb[] } {
  const W = src.width;
  const H = src.height;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.drawImage(src, 0, 0);
  if (W === 0 || H === 0) return { canvas, bulbs: [] };
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const roofMask = o.roof ? new Uint8Array(W * H) : null;
  // 나무: 0 = 아님, 1 = 잎 진 나무, 2 = 상록수
  const trees = o.foliage || o.conifer ? treeKinds(d, W, H, o) : null;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] === 0) continue;
      const c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (roofMask && d[i + 3] >= 200 && o.roof!(c)) roofMask[y * W + x] = 1;
      const kind = trees ? trees[y * W + x] : 0;
      const t = kind === 1 ? bareTone(lumOf(c), x, y) : kind === 2 ? evergreenTone(lumOf(c)) : o.tone(c, x, y);
      if (t === -1) continue;
      d[i] = (t >> 16) & 255;
      d[i + 1] = (t >> 8) & 255;
      d[i + 2] = t & 255;
    }
  ctx.putImageData(img, 0, 0);
  let out = canvas;
  if (roofMask) out = snowRoof(out, (x, y) => roofMask[y * W + x] === 1, { seed: 19 });
  if (o.cap !== false) out = snowCap(out, { depth: 2, ...(o.cap ?? {}) });
  const bulbs: Bulb[] = [];
  if (o.xmas) {
    // 처마 끝 (지붕 아래가 지붕이 아닌 자리) 바로 아래에 3px마다
    if (o.xmas.eaves && roofMask)
      for (let y = 0; y < H - 1; y++) {
        let run = 0;
        for (let x = 0; x < W; x++) {
          const eave = roofMask[y * W + x] === 1 && roofMask[(y + 1) * W + x] === 0;
          run = eave ? run + 1 : 0;
          if (eave && run % 3 === 2) bulbs.push({ x, y: y + 1, c: XMAS_BULBS[(x + y) % XMAS_BULBS.length] });
        }
      }
    const rate = o.xmas.treeRate ?? 0;
    if (trees && rate > 0)
      for (let y = 2; y < H; y++)
        for (let x = 0; x < W; x++)
          if (trees[y * W + x] === 2 && trees[(y - 2) * W + x] === 2 && hash2(x, y, 619) < rate) bulbs.push({ x, y, c: XMAS_BULBS[Math.floor(hash2(x, y, 621) * XMAS_BULBS.length)] });
    drawBulbs(out, bulbs);
  }
  return { canvas: out, bulbs };
}

/** 나무 픽셀 종류 (1 = 잎 진 나무, 2 = 상록수): 활엽수 잎은 이어진 덩어리마다 한 가지로 (덩어리 첫 픽셀 해시) */
function treeKinds(d: Uint8ClampedArray, W: number, H: number, o: SceneryWinter): Uint8Array {
  const out = new Uint8Array(W * H);
  const leaf = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    if (d[i + 3] === 0) continue;
    const c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const x = p % W;
    const y = (p - x) / W;
    if (o.conifer?.(c, x, y)) out[p] = 2;
    else if (o.foliage?.(c, x, y)) leaf[p] = 1;
  }
  if (!o.foliage) return out;
  const share = o.bareShare ?? 0.5;
  const stack: number[] = [];
  for (let p = 0; p < W * H; p++) {
    if (leaf[p] !== 1) continue;
    const kind = hash2(p % W, Math.floor(p / W), 625) < share ? 1 : 2;
    leaf[p] = 2;
    stack.push(p);
    while (stack.length) {
      const q = stack.pop()!;
      out[q] = kind;
      const x = q % W;
      const n = [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, q - W, q + W];
      for (const r of n) {
        if (r < 0 || r >= W * H || leaf[r] !== 1) continue;
        leaf[r] = 2;
        stack.push(r);
      }
    }
  }
  return out;
}

/** 전구 1px씩 찍기 */
export function drawBulbs(c: HTMLCanvasElement, bulbs: readonly Bulb[]): void {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  for (const b of bulbs) {
    ctx.fillStyle = `#${b.c.toString(16).padStart(6, "0")}`;
    ctx.fillRect(b.x, b.y, 1, 1);
  }
}

/**
 * 전구 빛 두 장 (가산 섞기로 위에 겹쳐 번갈아 보여요): 장마다 전구 절반이 밝고 나머지는 은은하게.
 * star = 트리 꼭대기 별 (두 장 다 밝게, 크기만 숨 쉬듯)
 */
export function bulbGlowPair(w: number, h: number, bulbs: readonly Bulb[], stars: readonly { x: number; y: number }[] = []): [HTMLCanvasElement, HTMLCanvasElement] {
  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < 2; f++) {
    const { canvas, ctx } = makeCanvas(Math.max(1, w), Math.max(1, h));
    for (const [i, b] of bulbs.entries()) {
      const on = (i + f) % 2 === 0;
      const rgb = `${(b.c >> 16) & 255},${(b.c >> 8) & 255},${b.c & 255}`;
      const R = on ? 3.5 : 2;
      const gr = ctx.createRadialGradient(b.x + 0.5, b.y + 0.5, 0, b.x + 0.5, b.y + 0.5, R);
      gr.addColorStop(0, `rgba(${rgb},${on ? 0.95 : 0.4})`);
      gr.addColorStop(0.4, `rgba(${rgb},${on ? 0.4 : 0.12})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(b.x - R, b.y - R, R * 2 + 1, R * 2 + 1);
      ctx.fillStyle = `rgba(255,255,255,${on ? 0.9 : 0.35})`;
      ctx.fillRect(b.x, b.y, 1, 1);
    }
    for (const s of stars) {
      const R = f ? 7 : 5.5;
      const gr = ctx.createRadialGradient(s.x + 0.5, s.y + 0.5, 0, s.x + 0.5, s.y + 0.5, R);
      gr.addColorStop(0, "rgba(255,240,170,0.95)");
      gr.addColorStop(0.4, "rgba(255,210,90,0.35)");
      gr.addColorStop(1, "rgba(255,200,80,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(s.x - R, s.y - R, R * 2 + 1, R * 2 + 1);
    }
    out.push(canvas);
  }
  return [out[0], out[1]];
}

/**
 * 멀리서 보는 작은 크리스마스트리 (층 셋 + 눈 + 금빛 줄 + 전구 + 별). 높이 h(18 이상), 원점 = 바닥 가운데 (ax, h - 1).
 * 전구·별 자리는 그림 좌표
 */
export function miniXmasTree(h: number): { canvas: HTMLCanvasElement; bulbs: Bulb[]; star: { x: number; y: number }; ax: number } {
  const H = Math.max(18, Math.round(h));
  const W = Math.round(H * 0.7) | 1;
  const g = new Grid(W, H);
  const cx = Math.floor(W / 2);
  const leaf = { hi: 0x3f7a52, mid: 0x2c5e3e, lo: 0x1f4630 };
  const trunkH = Math.max(2, Math.round(H * 0.1));
  g.rect(cx - 1, H - trunkH, 3, trunkH, 0x5a3e2a);
  const top = 4;
  const body = H - trunkH - top;
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const y0 = top + Math.round((t * body) / (tiers + 0.6));
    const y1 = top + Math.round(((t + 1.6) * body) / (tiers + 0.6));
    const half = (W / 2 - 1) * (0.55 + 0.45 * ((t + 1) / tiers));
    for (let y = y0; y <= y1; y++) {
      const w = Math.round(((y - y0 + 1) / (y1 - y0 + 1)) * half);
      for (let x = cx - w; x <= cx + w; x++) g.set(x, y, y === y1 ? leaf.lo : x < cx - w * 0.4 ? leaf.hi : leaf.mid);
    }
    // 층마다 비스듬한 금빛 줄
    const gy = Math.round(y0 + (y1 - y0) * 0.6);
    for (let x = cx - Math.round(half * 0.7); x <= cx + Math.round(half * 0.7); x++) {
      const y = gy + Math.round(((x - cx) / Math.max(1, half)) * 2);
      if (g.filled(x, y)) g.set(x, y, x & 1 ? 0xf2d060 : 0xfff2a8);
    }
  }
  g.outline(0x1f1d1a);
  // 별 (작은 십자)
  const star = { x: cx, y: 2 };
  for (const [dx, dy] of [
    [0, -2],
    [-1, -1],
    [0, -1],
    [1, -1],
    [-2, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 0],
    [-1, 1],
    [1, 1],
  ] as const)
    g.set(star.x + dx, star.y + dy, dy < 0 ? 0xfff2a8 : 0xf2c040);
  const canvas = snowCap(g.toCanvas(), { depth: 1, maxY: H - trunkH, seed: 23 });
  // 전구 (몸통 안쪽에 고르게)
  const bulbs: Bulb[] = [];
  const ctx = canvas.getContext("2d");
  const px = ctx ? ctx.getImageData(0, 0, W, H).data : null;
  for (let y = top + 3; y < H - trunkH - 1; y += 3)
    for (let x = 1; x < W - 1; x += 3) {
      const xx = x + ((y >> 1) & 1);
      const i = (y * W + xx) * 4;
      if (!px || px[i + 3] < 200 || lumOf((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]) > 150) continue;
      if (hash2(xx, y, 623) < 0.35) continue;
      bulbs.push({ x: xx, y, c: XMAS_BULBS[bulbs.length % XMAS_BULBS.length] });
    }
  drawBulbs(canvas, bulbs);
  return { canvas, bulbs, star, ax: cx };
}

/** 하늘빛을 차갑게 (겨울·크리스마스판 — 낮엔 푸른 잿빛 쪽으로 살짝, 밤엔 거의 그대로) */
export function coolSky(c: Color, k = 0.16): Color {
  return mix(c, 0xa8bcd4, k);
}
