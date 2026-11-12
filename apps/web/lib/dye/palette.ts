import { withDyeSpecial, type DyeSpecial, type DyeTierId } from "@tomb/protocol";

// 46번 염색 팔레트: 서버가 정한 시드(seed)와 등급(tier)으로 만드는 큰 색 판. 서버(결과 색 판정)와 화면(그리기)이
// 같은 함수를 쓰므로, 클라이언트는 "판 위의 좌표"만 보내고 색은 서버가 이 함수로 계산한다 → 색을 위조할 수 없다.
//
// 판 = DYE_BOARD_W × DYE_BOARD_H 칸, 칸마다 색이 조금씩 다른 연속 색 공간.
// 11/12 개편 2 (더 화려하게):
//  1) 색 계열: 은은한 색·원색·형광·파스텔·짙은 색·금속(금·은·동…)·흑백 — 염색권 종류마다 계열 비중이 다르다
//  2) 무늬 구역: 판을 구불구불한 경계의 구역 몇 개로 나누고(경계는 부드럽게 섞인다), 구역마다 시드로 무늬를 고른다
//     번짐(큰 물감 격자를 부드럽게) · 띠(무지개 띠 포함) · 소용돌이 · 체크 · 물결 · 대리석
//  3) 중간 격자(8칸) RGB 비틀기 · 고운 격자(4칸) 밝기 흔들기 · 비틀기 격자(32칸) 좌표 밀기 (예전과 같다)
//  4) 특수 색 무리(희귀): 판 어딘가에 작은 동그라미로 숨어 있다 — 금빛 광택·반짝이·무지개·야광.
//     그 칸을 골라 확정하면 색 문자열 뒤에 "~종류"가 붙는다 (packages/protocol dye.ts)
// 모든 계산은 정수(좌표는 1/256칸 고정소수점)와 사칙연산뿐이라 브라우저(사파리 포함)와 서버에서 결과가 한 칸도 다르지 않다
// (삼각함수·지수·제곱근 같은 엔진마다 다를 수 있는 함수는 쓰지 않는다 — 방향은 정수 표, 거리는 팔각형 근사, 각도는 마름모 각도).

/** 구역 하나(예전 판 한 장)의 크기 (칸). 11/12: 판은 이 구역이 상하좌우로 끝없이 이어진다 */
export const DYE_BOARD_W = 320;
export const DYE_BOARD_H = 200;
/** 끝없는 판의 좌표 한계 (칸, ±). 1/256칸 고정소수점으로도 32비트 정수 안이다 (구역 안 좌표만 고정소수점으로 계산) */
export const DYE_LIMIT = 1_000_000;
/** 구역 이음매를 섞는 폭 (이음매 양쪽 칸) */
const SEAM = 8;
/** 제한 시간 (모든 염색권 같음, 11/11 사용자 지시) */
export const DYE_TIME_MS = 60_000;
/** 시간이 끝난 뒤 마지막 좌표가 서버에 닿기까지 봐주는 여유 */
export const DYE_GRACE_MS = 6_000;

export type DyeTier = DyeTierId;

/** 색 계열 */
type Family = "muted" | "vivid" | "neon" | "pastel" | "deep" | "metal" | "mono";
/** 구역 무늬 */
export type DyePattern = "blot" | "stripe" | "swirl" | "check" | "wave" | "marble";

type TierSpec = {
  /** 큰 물감 격자 간격 (칸, 2의 거듭제곱). 좁을수록 색 지역이 많다 */
  baseShift: number;
  /** 물감 수 (0 = 계열 안에서 끝없이 새 색, n = 판마다 n가지 물감을 조금씩 흔들어 쓴다) */
  pool: number;
  /** 색 계열 비중 */
  families: readonly (readonly [Family, number])[];
  /** 무늬 비중 */
  patterns: readonly (readonly [DyePattern, number])[];
  /** 무늬 구역 격자 (가로 × 세로 — 구역 가운데를 흔들어 놓는다) */
  zones: readonly [number, number];
  /** 무지개 띠의 채도·밝기 (null = 무지개 띠 없음, 띠도 물감에서 고른다) */
  band: readonly [number, number] | null;
  /** 중간 격자 RGB 비틀기 폭 (0~255 단위, ±) */
  tint: number;
  /** 고운 격자 밝기 흔들기 폭 (0~255 단위, ±) */
  grain: number;
  /** 좌표 비틀기 폭 (칸, ±) */
  warp: number;
  /** 조준점 흔들림 (화면 px, 확대해도 같은 px → 확대할수록 판 위에서는 덜 흔들린다) */
  wobblePx: number;
  /** 특수 색 무리: 구역(판 한 장 크기)마다 생길 확률 (1/10000 단위, 구역마다 많아야 1개), 종류 비중, 반지름(칸) */
  special: { rate: number; kinds: readonly (readonly [DyeSpecial, number])[]; radius: readonly [number, number] };
};

const ALL_SPECIAL = [["g", 3], ["s", 3], ["r", 2], ["n", 2]] as const;

export const DYE_TIERS: Record<DyeTier, TierSpec> = {
  // 얼룩: 물감 4가지, 은은한 색 위주, 번짐·물결이 많다
  1: {
    baseShift: 5, pool: 4,
    families: [["muted", 6], ["vivid", 2], ["pastel", 2], ["deep", 1], ["mono", 1]],
    patterns: [["blot", 6], ["wave", 2], ["stripe", 1], ["marble", 1]],
    zones: [2, 2], band: null, tint: 16, grain: 6, warp: 14, wobblePx: 16,
    special: { rate: 10, kinds: ALL_SPECIAL, radius: [3, 4] },
  },
  // 고운: 물감 10가지, 계열이 고루, 무늬도 고루
  2: {
    baseShift: 4, pool: 10,
    families: [["muted", 3], ["vivid", 3], ["pastel", 3], ["neon", 1], ["deep", 2], ["metal", 1], ["mono", 1]],
    patterns: [["blot", 4], ["wave", 2], ["stripe", 2], ["swirl", 1], ["check", 1], ["marble", 1]],
    zones: [3, 2], band: [0.75, 0.55], tint: 22, grain: 7, warp: 11, wobblePx: 9,
    special: { rate: 12, kinds: ALL_SPECIAL, radius: [3, 5] },
  },
  // 무지개: 모든 계열·모든 무늬, 물감 제한 없음
  3: {
    baseShift: 4, pool: 0,
    families: [["muted", 2], ["vivid", 3], ["neon", 2], ["pastel", 3], ["deep", 2], ["metal", 2], ["mono", 2]],
    patterns: [["blot", 3], ["wave", 2], ["stripe", 3], ["swirl", 2], ["check", 2], ["marble", 2]],
    zones: [4, 2], band: [0.9, 0.55], tint: 26, grain: 8, warp: 11, wobblePx: 3,
    special: { rate: 20, kinds: ALL_SPECIAL, radius: [3, 5] },
  },
  // 원색: 쨍한 원색 + 흑백
  4: {
    baseShift: 4, pool: 0,
    families: [["vivid", 8], ["deep", 1], ["mono", 2]],
    patterns: [["blot", 3], ["stripe", 3], ["check", 3], ["swirl", 1], ["wave", 1]],
    zones: [3, 2], band: [1, 0.5], tint: 14, grain: 6, warp: 10, wobblePx: 11,
    special: { rate: 16, kinds: [["s", 2], ["r", 3], ["g", 1]], radius: [3, 5] },
  },
  // 파스텔: 부드럽게 밝은 색 (흰빛 조금)
  5: {
    baseShift: 4, pool: 0,
    families: [["pastel", 9], ["mono", 1]],
    patterns: [["blot", 4], ["wave", 3], ["swirl", 2], ["marble", 2], ["stripe", 1], ["check", 1]],
    zones: [3, 2], band: [0.8, 0.84], tint: 12, grain: 5, warp: 12, wobblePx: 11,
    special: { rate: 16, kinds: [["s", 3], ["r", 3], ["n", 1]], radius: [3, 5] },
  },
  // 형광: 형광 위주 + 어두운 바탕색, 야광이 잘 나온다
  6: {
    baseShift: 4, pool: 0,
    families: [["neon", 8], ["deep", 2], ["vivid", 1]],
    patterns: [["stripe", 3], ["swirl", 2], ["wave", 2], ["blot", 2], ["check", 1]],
    zones: [3, 2], band: [1, 0.55], tint: 16, grain: 6, warp: 11, wobblePx: 9,
    special: { rate: 70, kinds: [["n", 5], ["s", 2], ["r", 1]], radius: [3, 5] },
  },
  // 금속: 금·은·동 + 흑백, 금빛 광택이 잘 나온다
  7: {
    baseShift: 4, pool: 0,
    families: [["metal", 7], ["mono", 3]],
    patterns: [["marble", 3], ["blot", 3], ["stripe", 2], ["wave", 2], ["check", 1]],
    zones: [3, 2], band: null, tint: 8, grain: 6, warp: 11, wobblePx: 7,
    special: { rate: 80, kinds: [["g", 6], ["s", 2]], radius: [3, 5] },
  },
  // 반짝: 모든 계열, 특수 색 무리가 여럿이고 조금 크다
  8: {
    baseShift: 4, pool: 0,
    families: [["muted", 1], ["vivid", 2], ["neon", 1], ["pastel", 2], ["metal", 2], ["mono", 1], ["deep", 1]],
    patterns: [["blot", 3], ["wave", 2], ["stripe", 2], ["swirl", 2], ["check", 1], ["marble", 2]],
    zones: [4, 2], band: [0.9, 0.6], tint: 20, grain: 7, warp: 11, wobblePx: 6,
    special: { rate: 330, kinds: ALL_SPECIAL, radius: [4, 7] },
  },
};

/** 화면 안내용: 흔들림 정도 */
export function wobbleLabel(tier: DyeTier): string {
  const px = DYE_TIERS[tier]?.wobblePx ?? 9;
  return px >= 14 ? "큼" : px >= 8 ? "보통" : "적음";
}

/** 화면 안내용: 특수 색이 나올 가능성 (구역 = 판 한 장 크기, 끝없이 이어진다) */
export function specialLabel(tier: DyeTier): string {
  const r = DYE_TIERS[tier]?.special.rate ?? 0;
  if (r <= 0) return "없음";
  const n = Math.round(10_000 / r);
  return `약 ${n >= 100 ? Math.round(n / 50) * 50 : n >= 20 ? Math.round(n / 5) * 5 : n}구역에 1번`;
}

const FP = 8; // 고정소수점 자리 (1칸 = 256)
const MID_SHIFT = 3; // 중간 격자 8칸
const FINE_SHIFT = 2; // 고운 격자 4칸
const WARP_SHIFT = 5; // 비틀기 격자 32칸
/** 구역 경계를 섞는 폭 (칸) */
const ZONE_BLEND = 6;

/** 격자 하나: 격자점 (gw × gh)마다 값 ch개 (정수). 격자점 (i, j)는 좌표 ((i + ox) << shift, (j + oy) << shift) 칸 */
type Lattice = { shift: number; ox: number; oy: number; gw: number; gh: number; ch: number; v: Int32Array };

/** 무늬 구역 하나 */
type Zone = {
  /** 구역 가운데 (1/16칸) */
  x: number;
  y: number;
  kind: DyePattern;
  /** 물감 띠 (색 K개 × RGB, ×256) */
  ramp: Int32Array;
  k: number;
  /** 방향 (정수 단위 벡터 ×16) */
  dx: number;
  dy: number;
  /** 띠·칸·소용돌이 간격 (칸) */
  period: number;
  /** 물결 파장 (칸) · 높이 (칸) */
  wl: number;
  amp: number;
  /** 띠 경계 날카로움 (0 = 부드럽게) */
  sharp: number;
  /** 무늬 시작 위치 (1/256 단계) */
  phase: number;
  /** 대리석 결 색 (×256) */
  vein: Int32Array;
};

/** 특수 색 무리 (판 위 작은 동그라미) */
export type DyeSpot = { x: number; y: number; r: number; kind: DyeSpecial; /** 야광 바탕 색 */ glow: number };

export type DyePalette = {
  seed: string;
  tier: DyeTier;
  /** 큰 물감 격자 (RGB × 256) — 번짐 무늬 */
  base: Lattice;
  /** 중간 격자 (RGB 비틀기 × 256) */
  tint: Lattice;
  /** 고운 격자 (밝기 × 256) */
  grain: Lattice;
  /** 비틀기 격자 (dx, dy — 1/256칸) */
  warp: Lattice;
  /** 무늬 구역들 */
  zones: Zone[];
  /** 두 구역 가운데 사이 거리 (1/16칸, zones.length² 표) */
  gap: Int32Array;
  /** 특수 색 무리 */
  spots: DyeSpot[];
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

// ── 색 계열 ──

type RGB = [number, number, number];
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
/** 원색 색상 (빨강·주황·노랑·초록·파랑·보라·자홍) */
const PRIMARY_HUES = [0, 28, 54, 122, 214, 272, 318] as const;
/** 형광 (라임·핫핑크·시안·레몬·형광 주황·전기 보라·연두·네온 레드) */
const NEON: readonly RGB[] = [[57, 255, 20], [255, 20, 147], [0, 255, 255], [255, 255, 0], [255, 95, 31], [188, 19, 254], [204, 255, 0], [255, 7, 92]];
/** 금속 (금·은·청동·구리·로즈골드·백금·건메탈·황동) */
const METALS: readonly RGB[] = [[212, 175, 55], [192, 194, 201], [176, 120, 60], [184, 115, 51], [196, 128, 128], [229, 228, 226], [83, 88, 98], [181, 166, 66]];

function famColor(next: () => number, fam: Family): RGB {
  switch (fam) {
    case "muted":
      return hslRgb(below(next, 360), between(next, 0.2, 0.6), between(next, 0.3, 0.72));
    case "vivid":
      return hslRgb(PRIMARY_HUES[below(next, PRIMARY_HUES.length)] + between(next, -14, 14), between(next, 0.88, 1), between(next, 0.42, 0.56));
    case "neon": {
      const c = NEON[below(next, NEON.length)];
      return [clamp255(c[0] + below(next, 37) - 18), clamp255(c[1] + below(next, 37) - 18), clamp255(c[2] + below(next, 37) - 18)];
    }
    case "pastel":
      return hslRgb(below(next, 360), between(next, 0.55, 0.95), between(next, 0.78, 0.9));
    case "deep":
      return hslRgb(below(next, 360), between(next, 0.45, 0.85), between(next, 0.12, 0.3));
    case "metal": {
      const c = METALS[below(next, METALS.length)];
      const k = 180 + below(next, 141); // 0.7 ~ 1.25배 (÷256)
      return [clamp255((c[0] * k) >> 8), clamp255((c[1] * k) >> 8), clamp255((c[2] * k) >> 8)];
    }
    case "mono": {
      const v = below(next, 256);
      const t = below(next, 13) - 6; // 살짝 따뜻하거나 차갑게
      return [clamp255(v + t), v, clamp255(v - t)];
    }
  }
}

/** 비중 [값, 무게] 목록에서 하나 */
function pickW<T>(next: () => number, list: readonly (readonly [T, number])[]): T {
  const total = list.reduce((n, [, w]) => n + w, 0);
  let r = below(next, total);
  for (const [v, w] of list) {
    if (r < w) return v;
    r -= w;
  }
  return list[0][0];
}

/** 정수 제곱근 (내림) — 사칙연산만 */
function isqrt(n: number): number {
  if (n < 2) return n;
  let x = n;
  let y = Math.floor((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.floor((x + Math.floor(n / x)) / 2);
  }
  return x;
}

/** 방향 표 (정수 단위 벡터 ×16, 반원 8방향 — 삼각함수 대신) */
const DIRS: readonly (readonly [number, number])[] = [[16, 0], [15, 6], [11, 11], [6, 15], [0, 16], [-6, 15], [-11, 11], [-15, 6]];

/** 마름모 각도: (a, b) → 0~1023 (한 바퀴, 나눗셈만) */
function dangle(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (b >= 0) return a >= 0 ? Math.floor((b * 256) / (a + b)) : 256 + Math.floor((-a * 256) / (b - a));
  return a < 0 ? 512 + Math.floor((-b * 256) / (-a - b)) : 768 + Math.floor((a * 256) / (a - b));
}

/** 팔각형 거리 근사 (제곱근 없이): max + 3/8 min */
const octLen = (a: number, b: number) => {
  const x = a < 0 ? -a : a;
  const y = b < 0 ? -b : b;
  return x > y ? x + ((3 * y) >> 3) : y + ((3 * x) >> 3);
};

/** 무지개 색표 64칸 (특수 색 무지개 무리) */
const HUE64: readonly RGB[] = Array.from({ length: 64 }, (_, i) => hslRgb((i * 360) / 64, 0.95, 0.58));
/** 금빛 광택 색표 (밝은 곳 → 그늘) */
const GOLD_RAMP = Int32Array.from([[255, 246, 200], [247, 214, 110], [214, 166, 58], [150, 104, 28]].flat().map((v) => v << 8));

/**
 * 물감 띠에서 t(1/256 단계)의 색 → out (×256). cyclic이면 띠가 돌고, 아니면 양 끝에 붙는다.
 * sharp가 클수록 색과 색 사이가 짧게 넘어간다 (0 = 부드럽게)
 */
function rampAt(ramp: Int32Array, k: number, t: number, sharp: number, cyclic: boolean, out: Int32Array): void {
  const m = k << 8;
  if (cyclic) t = ((t % m) + m) % m;
  else t = t < 0 ? 0 : t > m - 257 ? m - 257 : t;
  const i = t >> 8;
  let f = t & 255;
  if (sharp > 0) f = clamp255(((f - 128) << sharp) + 128);
  const w = smooth(f);
  const a = i * 3;
  const b = ((i + 1) % k) * 3;
  for (let c = 0; c < 3; c++) out[c] = ramp[a + c] + (((ramp[b + c] - ramp[a + c]) * w) >> 8);
}

/** 시드·등급 → 팔레트 (같은 인자면 언제나 같은 판) */
export function buildPalette(seed: string, tier: DyeTier): DyePalette {
  const spec = DYE_TIERS[tier] ?? DYE_TIERS[1];
  const next = rng(hash32(`dye3:${tier}:${seed}`));
  // 물감: 판마다 정해진 몇 가지(pool)를 조금씩 흔들어 쓰거나, 계열에서 매번 새로
  const pool = Array.from({ length: spec.pool }, () => famColor(next, pickW(next, spec.families)));
  const paint = (): RGB => {
    if (!pool.length) return famColor(next, pickW(next, spec.families));
    const c = pool[below(next, pool.length)];
    return [clamp255(c[0] + below(next, 29) - 14), clamp255(c[1] + below(next, 29) - 14), clamp255(c[2] + below(next, 29) - 14)];
  };
  const base = lattice(spec.baseShift, 3, BOX_A, (o, i) => {
    const [r, g, b] = paint();
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

  // 무늬 구역: 격자 칸마다 가운데를 흔들어 놓고 무늬를 고른다
  const [zc, zr] = spec.zones;
  const zones: Zone[] = [];
  for (let j = 0; j < zr; j++)
    for (let i = 0; i < zc; i++) {
      const cw = DYE_BOARD_W / zc;
      const ch = DYE_BOARD_H / zr;
      const jx = Math.floor(cw / 3);
      const jy = Math.floor(ch / 3);
      const x = Math.floor((i + 0.5) * cw) + below(next, 2 * jx + 1) - jx;
      const y = Math.floor((j + 0.5) * ch) + below(next, 2 * jy + 1) - jy;
      const kind = pickW(next, spec.patterns);
      const rainbow = spec.band !== null && (kind === "stripe" || kind === "swirl") && below(next, 2) === 0;
      const k = rainbow ? 6 + below(next, 2) : 3 + below(next, 3);
      const ramp = new Int32Array(k * 3);
      const h0 = below(next, 360);
      for (let n = 0; n < k; n++) {
        const [r, g, b] = rainbow ? hslRgb(h0 + (n * 360) / k, spec.band![0], spec.band![1]) : paint();
        ramp[n * 3] = r << 8;
        ramp[n * 3 + 1] = g << 8;
        ramp[n * 3 + 2] = b << 8;
      }
      const [dx, dy] = DIRS[below(next, DIRS.length)];
      const v = paint();
      zones.push({
        x: x << 4,
        y: y << 4,
        kind,
        ramp,
        k,
        dx,
        dy,
        period: kind === "check" ? 6 + below(next, 8) : kind === "swirl" ? 10 + below(next, 18) : kind === "marble" ? 16 + below(next, 20) : 9 + below(next, 18),
        wl: 26 + below(next, 40),
        amp: 4 + below(next, 10),
        sharp: kind === "check" ? 3 : kind === "stripe" ? below(next, 3) : 0,
        phase: below(next, k << 8),
        vein: Int32Array.from([v[0] << 8, v[1] << 8, v[2] << 8]),
      });
    }
  const gap = new Int32Array(zones.length * zones.length);
  zones.forEach((a, i) =>
    zones.forEach((b, j) => {
      gap[i * zones.length + j] = Math.max(1, isqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)));
    }),
  );

  // 특수 색 무리 (구역마다 rate/10000 확률로 1개). 구역 이음매(SEAM)에 걸리지 않게 안쪽에만 둔다
  const sp = spec.special;
  const count = below(next, 10_000) < sp.rate ? 1 : 0;
  const spots: DyeSpot[] = [];
  for (let n = 0; n < count; n++) {
    const kind = pickW(next, sp.kinds);
    const r = sp.radius[0] + below(next, sp.radius[1] - sp.radius[0] + 1);
    const m = SEAM + r + 2;
    const x = m + below(next, DYE_BOARD_W - 2 * m);
    const y = m + below(next, DYE_BOARD_H - 2 * m);
    const g = NEON[below(next, NEON.length)];
    spots.push({ x, y, r, kind, glow: (g[0] << 16) | (g[1] << 8) | g[2] });
  }
  return { seed, tier, base, tint, grain, warp, zones, gap, spots };
}

/** 판 좌표 한계 안인지 (서버가 받는 좌표 검사) */
export function inBoard(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && x >= -DYE_LIMIT && y >= -DYE_LIMIT && x < DYE_LIMIT && y < DYE_LIMIT;
}

const buf3 = new Int32Array(3);
const buf3b = new Int32Array(3);
const bufA = new Int32Array(3);
const bufB = new Int32Array(3);
const bufV = new Int32Array(3);
const buf2 = new Int32Array(2);
const buf1 = new Int32Array(1);

/** 구역 z의 무늬 색 (×256) → out. (X, Y) = 비튼 좌표 (1/256칸), (wx, wy) = 비틀기 양 */
function zoneColor(p: DyePalette, z: Zone, X: number, Y: number, wx: number, wy: number, out: Int32Array): void {
  // 구역 방향으로 돌린 좌표 (1/256칸): u = 방향, v = 옆
  const u = (X * z.dx + Y * z.dy) >> 4;
  const v = (Y * z.dx - X * z.dy) >> 4;
  switch (z.kind) {
    case "blot": {
      const [ax, ay] = tiltA(X, Y);
      sample(p.base, ax, ay, out);
      return;
    }
    case "stripe":
      rampAt(z.ramp, z.k, Math.floor(u / z.period) + z.phase, z.sharp, true, out);
      return;
    case "wave": {
      // 옆으로 흐르는 삼각파를 부드럽게 → 물결
      const q = Math.floor(v / z.wl) & 255;
      const tri = smooth(q < 128 ? q * 2 : 511 - q * 2);
      rampAt(z.ramp, z.k, Math.floor((u + (tri - 128) * z.amp * 2) / z.period) + z.phase, 0, true, out);
      return;
    }
    case "check": {
      // 가로 띠와 세로 띠를 반씩 섞는다 → 체크(깅엄)
      rampAt(z.ramp, z.k, Math.floor(u / z.period) + z.phase, z.sharp, true, bufA);
      rampAt(z.ramp, z.k, Math.floor(v / z.period) + z.phase + 128, z.sharp, true, bufB);
      for (let c = 0; c < 3; c++) out[c] = (bufA[c] + bufB[c]) >> 1;
      return;
    }
    case "swirl": {
      // 구역 가운데를 도는 나선: 각도(한 바퀴 = 물감 K개) + 거리
      const a = X - (z.x << 4);
      const b = Y - (z.y << 4);
      const t = ((dangle(a, b) * z.k) >> 2) + Math.floor(octLen(a, b) / z.period) * (z.dx >= 0 ? 1 : -1);
      rampAt(z.ramp, z.k, t + z.phase, 0, true, out);
      return;
    }
    case "marble": {
      // 비틀기를 세게 넣은 결 + 결 가운데는 결 색
      rampAt(z.ramp, z.k, Math.floor(u / (z.period * 5)) + z.phase, 0, true, out);
      const q = Math.floor((u + 3 * wx + 2 * wy) / z.period) & 255;
      const d = q < 128 ? 128 - q : q - 128; // 결 가운데에서 멀수록 큼 (0~128)
      const m = smooth(clamp255(255 - d * 3)); // 결에 가까울수록 큼
      for (let c = 0; c < 3; c++) out[c] = out[c] + (((z.vein[c] - out[c]) * m) >> 9);
      return;
    }
  }
}

/** 특수 색 무리 안이면 그 무리 (칸 정수 좌표) */
function spotAt(p: DyePalette, cx: number, cy: number): DyeSpot | null {
  for (const s of p.spots) {
    const dx = cx - s.x;
    const dy = cy - s.y;
    if (dx * dx + dy * dy <= s.r * s.r) return s;
  }
  return null;
}

/** 특수 색 무리 칸의 바탕 색 (밑 색 v → 0xrrggbb) */
function spotRgb(s: DyeSpot, cx: number, cy: number, v: number): number {
  const dx = cx - s.x;
  const dy = cy - s.y;
  const r2 = s.r * s.r;
  const d2 = dx * dx + dy * dy;
  switch (s.kind) {
    case "g": {
      // 가운데가 밝고 가장자리가 그늘진 금, 왼쪽 위가 빛을 받는다
      const t = Math.floor((d2 * 3 * 256) / (r2 + 1)) + (dx + dy) * 24;
      rampAt(GOLD_RAMP, 4, t, 0, false, bufV);
      return (clamp255(bufV[0] >> 8) << 16) | (clamp255(bufV[1] >> 8) << 8) | clamp255(bufV[2] >> 8);
    }
    case "s": {
      // 밑 색을 1/3 밝게
      const ch = (sh: number) => {
        const c = (v >> sh) & 255;
        return c + Math.floor((255 - c) / 3);
      };
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    }
    case "r": {
      const h = HUE64[dangle(dx, dy) >> 4];
      return (h[0] << 16) | (h[1] << 8) | h[2];
    }
    case "n": {
      // 가운데로 갈수록 흰빛
      const w = Math.floor(((r2 - d2) * 110) / (r2 + 1));
      const ch = (sh: number) => {
        const c = (s.glow >> sh) & 255;
        return c + (((255 - c) * w) >> 8);
      };
      return (ch(16) << 16) | (ch(8) << 8) | ch(0);
    }
  }
}

/** 칸(cx, cy 정수)의 바탕 색 → 0xrrggbb (특수 색 무리 칸이면 그 무리의 바탕 색) — 구역 하나 안의 좌표 */
export function cellRgb(p: DyePalette, cx: number, cy: number): number {
  const v = cellBase(p, cx, cy);
  const s = p.spots.length ? spotAt(p, cx | 0, cy | 0) : null;
  return s ? spotRgb(s, cx | 0, cy | 0, v) : v;
}

/** 칸의 밑 색 (특수 색 무리 없이). 구역 밖 좌표(이음매 섞기 — 구역 밖 SEAM칸까지)도 격자 여유(PAD) 안이라 그대로 계산된다 */
function cellBase(p: DyePalette, cx: number, cy: number): number {
  cx |= 0;
  cy |= 0;
  // 칸 가운데 (1/256칸)
  const X = (cx << FP) + 128;
  const Y = (cy << FP) + 128;
  sample(p.warp, X, Y, buf2);
  const wx = buf2[0];
  const wy = buf2[1];
  const PX = X + wx;
  const PY = Y + wy;
  // 가장 가까운 구역 둘 (1/16칸 거리)
  const qx = PX >> 4;
  const qy = PY >> 4;
  let ia = 0;
  let ib = -1;
  let da = Infinity;
  let db = Infinity;
  for (let i = 0; i < p.zones.length; i++) {
    const z = p.zones[i];
    const d = (qx - z.x) * (qx - z.x) + (qy - z.y) * (qy - z.y);
    if (d < da) {
      ib = ia;
      db = da;
      ia = i;
      da = d;
    } else if (d < db) {
      ib = i;
      db = d;
    }
  }
  zoneColor(p, p.zones[ia], PX, PY, wx, wy, buf3);
  if (ib >= 0 && ib !== ia) {
    // 두 구역 경계(수직 이등분선)까지 거리 (1/16칸) = (db - da) / (2 × 가운데 사이 거리)
    const edge = Math.floor((db - da) / (2 * p.gap[ia * p.zones.length + ib]));
    if (edge < ZONE_BLEND << 4) {
      zoneColor(p, p.zones[ib], PX, PY, wx, wy, buf3b);
      const w = 128 + Math.floor((edge * 128) / (ZONE_BLEND << 4));
      for (let c = 0; c < 3; c++) buf3[c] = buf3b[c] + (((buf3[c] - buf3b[c]) * w) >> 8);
    }
  }
  const [bx, by] = tiltB(PX, PY);
  sample(p.tint, bx, by, buf3b);
  sample(p.grain, X, Y, buf1);
  const g = buf1[0];
  const ch = (k: number) => clamp255((buf3[k] + buf3b[k] + g) >> 8);
  return (ch(0) << 16) | (ch(1) << 8) | ch(2);
}

/** 칸의 특수 색 종류 (없으면 null) */
export function cellSpecial(p: DyePalette, cx: number, cy: number): DyeSpecial | null {
  return spotAt(p, cx | 0, cy | 0)?.kind ?? null;
}

/** 칸(cx, cy 정수)의 바탕 색 "#rrggbb" (특수 표시 없이 — 그리기용) */
export function cellHex(p: DyePalette, cx: number, cy: number): string {
  return `#${cellRgb(p, cx, cy).toString(16).padStart(6, "0")}`;
}

/** 칸(cx, cy 정수)의 염색 색: "#rrggbb", 특수 색 무리 칸이면 "#rrggbb~종류" (서버가 저장하는 값) */
export function cellColor(p: DyePalette, cx: number, cy: number): string {
  return withDyeSpecial(cellHex(p, cx, cy), cellSpecial(p, cx, cy));
}

/** 판 위 좌표(실수)의 칸 (좌표 한계 ±DYE_LIMIT 밖이면 한계로 붙인다) */
export function cellOf(x: number, y: number): { cx: number; cy: number } {
  return {
    cx: Math.min(DYE_LIMIT - 1, Math.max(-DYE_LIMIT, Math.floor(Number.isFinite(x) ? x : 0))),
    cy: Math.min(DYE_LIMIT - 1, Math.max(-DYE_LIMIT, Math.floor(Number.isFinite(y) ? y : 0))),
  };
}

/** 판 위 좌표(실수)의 염색 색 (특수 표시 포함). 한계 밖이면 한계로 붙인다 */
export function colorAt(b: DyeBoard, x: number, y: number): string {
  const { cx, cy } = cellOf(x, y);
  return boardColor(b, cx, cy);
}

/** 판 전체를 RGBA로 (화면이 한 번 그린다 — 특수 색 무리는 화면이 그 위에 연출을 더한다) */
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

/** 격자점(색 표본) 수 — 등급마다 수백~수천 개 (+ 구역 물감) */
export function samplePoints(p: DyePalette): number {
  return [p.base, p.tint, p.grain, p.warp].reduce((n, L) => n + L.gw * L.gh, 0) + p.zones.reduce((n, z) => n + z.k, 0);
}

/** 시간이 지나도록 아무 좌표도 오지 않은 판은 처음 조준점(판 가운데) 색으로 정한다 */
export const DYE_CENTER = { x: DYE_BOARD_W / 2, y: DYE_BOARD_H / 2 } as const;

// ── 11/12 끝없는 판: 구역(i, j)마다 시드+구역 좌표로 새 팔레트, 이음매는 양쪽 SEAM칸을 정수로 섞는다 ──

/** 끝없는 판 (구역 팔레트를 만들어 두고 다시 쓴다) */
export type DyeBoard = { seed: string; tier: DyeTier; chunks: Map<string, DyePalette> };
/** 구역 팔레트를 기억해 두는 수 (넘으면 오래된 것부터 버린다) */
const CHUNK_CACHE = 48;

export function buildBoard(seed: string, tier: DyeTier): DyeBoard {
  return { seed, tier, chunks: new Map() };
}

/** 구역 (i, j)의 팔레트. (0, 0)은 예전 판과 같은 시드 */
export function chunkAt(b: DyeBoard, i: number, j: number): DyePalette {
  const key = `${i},${j}`;
  let p = b.chunks.get(key);
  if (p) {
    b.chunks.delete(key);
    b.chunks.set(key, p);
    return p;
  }
  p = buildPalette(i === 0 && j === 0 ? b.seed : `${b.seed}@${key}`, b.tier);
  b.chunks.set(key, p);
  if (b.chunks.size > CHUNK_CACHE) b.chunks.delete(b.chunks.keys().next().value!);
  return p;
}

/** 두 색을 w/256 : (256-w)/256로 섞는다 (정수) */
function mixRgb(a: number, b: number, w: number): number {
  const ch = (sh: number) => {
    const ca = (a >> sh) & 255;
    const cb = (b >> sh) & 255;
    return cb + (((ca - cb) * w) >> 8);
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** 구역 안 좌표 → [이웃 방향(-1·0·1), 이웃 구역 안 좌표, 내 구역 무게(128~256)] */
function seam(l: number, size: number): [number, number, number] {
  if (l < SEAM) return [-1, l + size, 128 + Math.floor(((2 * l + 1) * 128) / (2 * SEAM))];
  if (l >= size - SEAM) {
    const k = size - 1 - l;
    return [1, l - size, 128 + Math.floor(((2 * k + 1) * 128) / (2 * SEAM))];
  }
  return [0, l, 256];
}

/** 끝없는 판의 칸 → [구역 i, j, 구역 안 x, y] */
function split(cx: number, cy: number): [number, number, number, number] {
  const i = Math.floor(cx / DYE_BOARD_W);
  const j = Math.floor(cy / DYE_BOARD_H);
  return [i, j, cx - i * DYE_BOARD_W, cy - j * DYE_BOARD_H];
}

/** 끝없는 판 칸의 밑 색 (이음매 섞기 포함, 특수 색 없이) */
function boardBase(b: DyeBoard, i: number, j: number, lx: number, ly: number): number {
  const own = cellBase(chunkAt(b, i, j), lx, ly);
  const [di, nx, wx] = seam(lx, DYE_BOARD_W);
  const [dj, ny, wy] = seam(ly, DYE_BOARD_H);
  const rowA = wx < 256 ? mixRgb(own, cellBase(chunkAt(b, i + di, j), nx, ly), wx) : own;
  if (wy === 256) return rowA;
  const vb = cellBase(chunkAt(b, i, j + dj), lx, ny);
  const rowB = wx < 256 ? mixRgb(vb, cellBase(chunkAt(b, i + di, j + dj), nx, ny), wx) : vb;
  return mixRgb(rowA, rowB, wy);
}

/** 끝없는 판 칸(정수)의 바탕 색 → 0xrrggbb (특수 색 무리 칸이면 그 무리의 바탕 색) */
export function boardRgb(b: DyeBoard, cx: number, cy: number): number {
  const [i, j, lx, ly] = split(cx, cy);
  const v = boardBase(b, i, j, lx, ly);
  const p = chunkAt(b, i, j);
  const s = p.spots.length ? spotAt(p, lx, ly) : null;
  return s ? spotRgb(s, lx, ly, v) : v;
}

/** 끝없는 판 칸의 특수 색 종류 (없으면 null) */
export function boardSpecial(b: DyeBoard, cx: number, cy: number): DyeSpecial | null {
  const [i, j, lx, ly] = split(cx, cy);
  return cellSpecial(chunkAt(b, i, j), lx, ly);
}

/** 끝없는 판 칸의 염색 색: "#rrggbb" 또는 "#rrggbb~종류" (서버가 저장하는 값) */
export function boardColor(b: DyeBoard, cx: number, cy: number): string {
  return withDyeSpecial(`#${boardRgb(b, cx, cy).toString(16).padStart(6, "0")}`, boardSpecial(b, cx, cy));
}

/** 구역 (i, j) 한 장을 RGBA로 (화면 타일 — 보이는 구역만 그려 캐시한다) */
export function chunkRgba(b: DyeBoard, i: number, j: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(DYE_BOARD_W * DYE_BOARD_H * 4);
  const x0 = i * DYE_BOARD_W;
  const y0 = j * DYE_BOARD_H;
  for (let y = 0; y < DYE_BOARD_H; y++)
    for (let x = 0; x < DYE_BOARD_W; x++) {
      const v = boardRgb(b, x0 + x, y0 + y);
      const k = (y * DYE_BOARD_W + x) * 4;
      out[k] = (v >> 16) & 255;
      out[k + 1] = (v >> 8) & 255;
      out[k + 2] = v & 255;
      out[k + 3] = 255;
    }
  return out;
}

/** 구역 (i, j)의 특수 색 무리 (끝없는 판 좌표) */
export function chunkSpots(b: DyeBoard, i: number, j: number): DyeSpot[] {
  return chunkAt(b, i, j).spots.map((s) => ({ ...s, x: s.x + i * DYE_BOARD_W, y: s.y + j * DYE_BOARD_H }));
}
