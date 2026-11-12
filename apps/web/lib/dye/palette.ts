// 46번 염색 팔레트: 서버가 정한 시드(seed)와 등급(tier)으로 만드는 큰 색 판. 서버(결과 색 판정)와 화면(그리기)이
// 같은 함수를 쓰므로, 클라이언트는 "판 위의 좌표"만 보내고 색은 서버가 이 함수로 계산한다 → 색을 위조할 수 없다.
//
// 판 = DYE_BOARD_W × DYE_BOARD_H 칸, 칸마다 색이 조금씩 다른 연속 색 공간 (11/12 개편: 예전엔 단색 덩어리 몇십 개).
//  1) 큰 물감 격자(등급마다 간격이 다르다): 격자점마다 무작위 색 → 칸 색은 둘레 네 점을 부드럽게(smoothstep) 섞은 값
//  2) 중간 격자(8칸): 격자점마다 RGB를 조금씩 비튼다 → 같은 계열 안에서도 색이 미세하게 흐른다
//  3) 고운 격자(4칸): 밝기를 아주 조금씩 흔든다 → 바로 옆 칸도 같은 색이 드물다
//  4) 비틀기 격자(32칸): 좌표를 밀어 경계가 구불구불하게 (큰·중간 격자는 판과 어긋나게 기울여 네모 무늬가 보이지 않게)
// 격자점은 등급에 따라 수백~수천 개. 모든 계산은 정수(좌표는 1/256칸 고정소수점)와 사칙연산뿐이라
// 브라우저(사파리 포함)와 서버에서 결과가 한 칸도 다르지 않다 (삼각함수·지수 같은 엔진마다 다를 수 있는 함수는 쓰지 않는다).

export const DYE_BOARD_W = 320;
export const DYE_BOARD_H = 200;
/** 제한 시간 (모든 염색권 같음, 11/11 사용자 지시) */
export const DYE_TIME_MS = 60_000;
/** 시간이 끝난 뒤 마지막 좌표가 서버에 닿기까지 봐주는 여유 */
export const DYE_GRACE_MS = 6_000;

export type DyeTier = 1 | 2 | 3;

type TierSpec = {
  /** 큰 물감 격자 간격 (칸, 2의 거듭제곱). 좁을수록 색 지역이 많다 */
  baseShift: number;
  /** 색상(hue) 묶음 수 (0 = 묶지 않고 전체에서 고르게) */
  hueGroups: number;
  /** 묶음 안에서 퍼지는 색상 폭 (도) */
  hueSpread: number;
  sat: [number, number];
  light: [number, number];
  /** 중간 격자 RGB 비틀기 폭 (0~255 단위, ±) */
  tint: number;
  /** 고운 격자 밝기 흔들기 폭 (0~255 단위, ±) */
  grain: number;
  /** 좌표 비틀기 폭 (칸, ±) */
  warp: number;
  /** 조준점 흔들림 (화면 px, 확대해도 같은 px → 확대할수록 판 위에서는 덜 흔들린다) */
  wobblePx: number;
};

export const DYE_TIERS: Record<DyeTier, TierSpec> = {
  1: { baseShift: 5, hueGroups: 3, hueSpread: 34, sat: [0.22, 0.62], light: [0.32, 0.72], tint: 16, grain: 6, warp: 14, wobblePx: 16 },
  2: { baseShift: 4, hueGroups: 7, hueSpread: 48, sat: [0.18, 0.82], light: [0.26, 0.82], tint: 22, grain: 7, warp: 11, wobblePx: 9 },
  3: { baseShift: 4, hueGroups: 0, hueSpread: 360, sat: [0.08, 0.96], light: [0.16, 0.9], tint: 28, grain: 8, warp: 11, wobblePx: 3 },
};

const FP = 8; // 고정소수점 자리 (1칸 = 256)
const MID_SHIFT = 3; // 중간 격자 8칸
const FINE_SHIFT = 2; // 고운 격자 4칸
const WARP_SHIFT = 5; // 비틀기 격자 32칸

/** 격자 하나: 격자점 (gw × gh)마다 값 ch개 (정수). 격자점 (i, j)는 좌표 ((i + ox) << shift, (j + oy) << shift) 칸 */
type Lattice = { shift: number; ox: number; oy: number; gw: number; gh: number; ch: number; v: Int32Array };

export type DyePalette = {
  seed: string;
  tier: DyeTier;
  /** 큰 물감 격자 (RGB × 256) */
  base: Lattice;
  /** 중간 격자 (RGB 비틀기 × 256) */
  tint: Lattice;
  /** 고운 격자 (밝기 × 256) */
  grain: Lattice;
  /** 비틀기 격자 (dx, dy — 1/256칸) */
  warp: Lattice;
};

/** 문자열 → 32비트 해시 (FNV-1a) */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 시드 고정 난수 (mulberry32, 32비트 정수) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** 0 이상 n 미만 정수 */
const below = (next: () => number, n: number) => (next() % n) | 0;
/** a~b 사이 실수 (2^-16 단위 — 사칙연산만이라 어디서나 같다) */
const between = (next: () => number, a: number, b: number) => a + ((b - a) * (next() & 0xffff)) / 0x10000;

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** HSL(0~360, 0~1, 0~1) → [r, g, b] 0~255 정수 (사칙연산만) */
export function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  const q = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return [q(r), q(g), q(b)];
}

/** HSL(0~360, 0~1, 0~1) → "#rrggbb" */
export function hslHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslRgb(h, s, l);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/**
 * 좌표 범위 [x0, x1] × [y0, y1] (칸)을 덮는 격자. 둘레에 한 칸씩 여유
 * (비틀기·기울이기로 판 밖 좌표를 볼 수 있다 — 범위 밖은 가장자리 값으로 붙는다)
 */
function lattice(shift: number, ch: number, [x0, y0, x1, y1]: readonly [number, number, number, number], fill: (out: Int32Array, i: number) => void): Lattice {
  const ox = (x0 >> shift) - 1;
  const oy = (y0 >> shift) - 1;
  const gw = (x1 >> shift) - ox + 3;
  const gh = (y1 >> shift) - oy + 3;
  const v = new Int32Array(gw * gh * ch);
  for (let i = 0; i < gw * gh; i++) fill(v, i * ch);
  return { shift, ox, oy, gw, gh, ch, v };
}

// 격자를 판의 가로세로와 어긋나게 기울여 쓴다 (정수 기울이기 — 네모난 격자 무늬가 보이지 않게). 1/256칸 좌표 → 1/256칸 좌표
const tiltA = (X: number, Y: number): [number, number] => [(13 * X + 7 * Y) >> 4, (13 * Y - 7 * X) >> 4];
const tiltB = (X: number, Y: number): [number, number] => [(11 * X - 9 * Y) >> 4, (11 * Y + 9 * X) >> 4];
/** 비틀기 여유를 둔 판 범위 (칸) */
const PAD = 24;
const BOARD_BOX = [-PAD, -PAD, DYE_BOARD_W + PAD, DYE_BOARD_H + PAD] as const;
/** 기울인 좌표가 닿는 범위 (칸) */
function tiltBox(tilt: (X: number, Y: number) => [number, number]): [number, number, number, number] {
  const pts = [BOARD_BOX[0], BOARD_BOX[2]].flatMap((x) => [BOARD_BOX[1], BOARD_BOX[3]].map((y) => tilt(x << FP, y << FP)));
  const xs = pts.map((p) => p[0] >> FP);
  const ys = pts.map((p) => p[1] >> FP);
  return [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1];
}
const BOX_A = tiltBox(tiltA);
const BOX_B = tiltBox(tiltB);

/** 0~256 smoothstep (입력 f: 0~255) */
const smooth = (f: number) => (f * f * (768 - 2 * f)) >> 16;

/** 격자 값을 (X, Y) (1/256칸)에서 부드럽게 섞는다. out[k] = 채널 k */
function sample(L: Lattice, X: number, Y: number, out: Int32Array): void {
  const sh = L.shift;
  // 좌표 → 격자 좌표 (1/256 격자 단위). 격자 밖은 가장자리로 붙인다
  let gx = (X >> sh) - (L.ox << 8);
  let gy = (Y >> sh) - (L.oy << 8);
  const maxX = (L.gw - 1) << 8;
  const maxY = (L.gh - 1) << 8;
  gx = gx < 0 ? 0 : gx >= maxX ? maxX - 1 : gx;
  gy = gy < 0 ? 0 : gy >= maxY ? maxY - 1 : gy;
  const ix = gx >> 8;
  const iy = gy >> 8;
  const sx = smooth(gx & 255);
  const sy = smooth(gy & 255);
  const ch = L.ch;
  const i00 = (iy * L.gw + ix) * ch;
  const i10 = i00 + ch;
  const i01 = i00 + L.gw * ch;
  const i11 = i01 + ch;
  const v = L.v;
  for (let k = 0; k < ch; k++) {
    const top = v[i00 + k] + (((v[i10 + k] - v[i00 + k]) * sx) >> 8);
    const bot = v[i01 + k] + (((v[i11 + k] - v[i01 + k]) * sx) >> 8);
    out[k] = top + (((bot - top) * sy) >> 8);
  }
}

/** 시드·등급 → 팔레트 (같은 인자면 언제나 같은 판) */
export function buildPalette(seed: string, tier: DyeTier): DyePalette {
  const spec = DYE_TIERS[tier];
  const next = rng(hash32(`dye2:${tier}:${seed}`));
  const groups = spec.hueGroups > 0 ? Array.from({ length: spec.hueGroups }, () => below(next, 360)) : [];
  const base = lattice(spec.baseShift, 3, BOX_A, (o, i) => {
    const hue = groups.length ? groups[below(next, groups.length)] + between(next, -spec.hueSpread / 2, spec.hueSpread / 2) : below(next, 360);
    const [r, g, b] = hslRgb(hue, between(next, spec.sat[0], spec.sat[1]), between(next, spec.light[0], spec.light[1]));
    o[i] = r << 8;
    o[i + 1] = g << 8;
    o[i + 2] = b << 8;
  });
  const t = spec.tint;
  const tint = lattice(MID_SHIFT, 3, BOX_B, (o, i) => {
    o[i] = (below(next, 2 * t + 1) - t) << 8;
    o[i + 1] = (below(next, 2 * t + 1) - t) << 8;
    o[i + 2] = (below(next, 2 * t + 1) - t) << 8;
  });
  const gr = spec.grain;
  const grain = lattice(FINE_SHIFT, 1, BOARD_BOX, (o, i) => {
    o[i] = (below(next, 2 * gr + 1) - gr) << 8;
  });
  const wp = spec.warp << FP;
  const warp = lattice(WARP_SHIFT, 2, BOARD_BOX, (o, i) => {
    o[i] = below(next, 2 * wp + 1) - wp;
    o[i + 1] = below(next, 2 * wp + 1) - wp;
  });
  return { seed, tier, base, tint, grain, warp };
}

/** 판 안의 칸 좌표인지 (서버가 받는 좌표 검사) */
export function inBoard(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < DYE_BOARD_W && y < DYE_BOARD_H;
}

const buf3 = new Int32Array(3);
const buf3b = new Int32Array(3);
const buf2 = new Int32Array(2);
const buf1 = new Int32Array(1);

/** 칸(cx, cy 정수)의 색 → 0xrrggbb */
export function cellRgb(p: DyePalette, cx: number, cy: number): number {
  // 칸 가운데 (1/256칸)
  const X = ((cx | 0) << FP) + 128;
  const Y = ((cy | 0) << FP) + 128;
  sample(p.warp, X, Y, buf2);
  const wx = X + buf2[0];
  const wy = Y + buf2[1];
  const [ax, ay] = tiltA(wx, wy);
  sample(p.base, ax, ay, buf3);
  const [bx, by] = tiltB(wx, wy);
  sample(p.tint, bx, by, buf3b);
  sample(p.grain, X, Y, buf1);
  const g = buf1[0];
  const ch = (k: number) => {
    const v = (buf3[k] + buf3b[k] + g) >> 8;
    return v < 0 ? 0 : v > 255 ? 255 : v;
  };
  return (ch(0) << 16) | (ch(1) << 8) | ch(2);
}

/** 칸(cx, cy 정수)의 색 "#rrggbb" */
export function cellColor(p: DyePalette, cx: number, cy: number): string {
  return `#${cellRgb(p, cx, cy).toString(16).padStart(6, "0")}`;
}

/** 판 위 좌표(실수)의 칸 (판 밖이면 가장자리로 붙인다) */
export function cellOf(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: Math.min(DYE_BOARD_W - 1, Math.max(0, Math.floor(Number.isFinite(x) ? x : 0))),
    cy: Math.min(DYE_BOARD_H - 1, Math.max(0, Math.floor(Number.isFinite(y) ? y : 0))),
  };
}

/** 판 위 좌표(실수)의 색. 판 밖이면 가장자리로 붙인다 */
export function colorAt(p: DyePalette, x: number, y: number): string {
  const { cx, cy } = cellOf(x, y);
  return cellColor(p, cx, cy);
}

/** 판 전체를 RGBA로 (화면이 한 번 그린다) */
export function paletteRgba(p: DyePalette): Uint8ClampedArray {
  const out = new Uint8ClampedArray(DYE_BOARD_W * DYE_BOARD_H * 4);
  for (let y = 0; y < DYE_BOARD_H; y++)
    for (let x = 0; x < DYE_BOARD_W; x++) {
      const v = cellRgb(p, x, y);
      const i = (y * DYE_BOARD_W + x) * 4;
      out[i] = (v >> 16) & 255;
      out[i + 1] = (v >> 8) & 255;
      out[i + 2] = v & 255;
      out[i + 3] = 255;
    }
  return out;
}

/** 격자점(색 표본) 수 — 등급마다 수백~수천 개 */
export function samplePoints(p: DyePalette): number {
  return [p.base, p.tint, p.grain, p.warp].reduce((n, L) => n + L.gw * L.gh, 0);
}

/** 시간이 지나도록 아무 좌표도 오지 않은 판은 처음 조준점(판 가운데) 색으로 정한다 */
export const DYE_CENTER = { x: DYE_BOARD_W / 2, y: DYE_BOARD_H / 2 } as const;
