import type { FxArtId, FxCmd, FxInput, FxSpec } from "./cosmeticFx";
import { Grid, mix, type Color } from "./pixel";

// 11/20 「유성우 오라」 (별자리 잇기 전용 전설 오라 st_meteor — 얻는 규칙은 lib/rpg/meteorDrop). 시안 코드를 그대로 옮겼다.
// 그림(METEOR_FX_ART)은 cosmeticFx FX_ART에, 규칙(METEOR_FX)은 COSMETIC_FX에 섞이고, 움직임(meteorAura)은
// cosmeticFx aura()가 그리기 도우미(push·night·depth)를 넘겨 그린다 (이 파일은 cosmeticFx를 타입으로만 읽는다).
//
// 생김새: 머리 위로 작은 별똥별이 2.8초에 한 번 사선(가로 2칸에 세로 1칸)으로 스쳐 가고, 열에 넷은 뒤따라 하나 더 (유성우).
// 다 지나간 자리에서 금빛 부스러기 하나가 반짝이며 어깨 쪽으로 떨어진다. 머리 위엔 아주 작은 별 셋이 숨 쉬듯 깜빡인다.
// 밤(해질녘·밤): 꼬리가 길게 빛 층(더하기)에 · 머리 둘레 푸른 번짐. 낮: 꼬리 짧게 몸 층에 옅게 · 금빛 머리 · 꼬리 아래 남보라 그늘.

/** cosmeticFx가 넘겨주는 그리기 도우미 (seasonSetFx SeasonDraw와 같은 모양) */
export type MeteorDraw = {
  push: (art: FxArtId, frame: number, x: number, y: number, o?: Partial<FxCmd>) => void;
  night: boolean;
  /** 몸 그림 depth */
  depth: number;
};

function frames(w: number, h: number, n: number, draw: (g: Grid, f: number) => void): () => Grid {
  return () => {
    const g = new Grid(w * n, h);
    for (let f = 0; f < n; f++) {
      const one = new Grid(w, h);
      draw(one, f);
      g.draw(one, f * w, 0);
    }
    return g;
  };
}

// ── 꼬리 ──
/** 밤 꼬리 길이 단계 / 낮 꼬리 길이 단계 */
export const TAIL_NIGHT = [4, 7, 10, 13, 16, 18] as const;
export const TAIL_DAY = [4, 5, 6, 8, 9, 10] as const;
const TAIL_W = 38;
const TAIL_H = 12;
/** 꼬리 그림 안의 별똥별 머리 자리 (오른쪽 아래 끝) */
export const TAIL_AX = TAIL_W - 2;
export const TAIL_AY = TAIL_H - 2;

/** 여러 색 사이를 t(0..1)로 */
function ramp(stops: readonly [number, Color][], t: number): Color {
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / Math.max(1e-6, t1 - t0));
    }
  return stops[stops.length - 1][1];
}

/** 밤 꼬리: 머리 쪽 따뜻한 흰빛 → 얼음빛 → 푸른 보랏빛, 머리 가까이는 위·아래로 한 칸씩 옅은 번짐 (두툼하다가 가늘어진다) */
const NIGHT_RAMP: readonly [number, Color][] = [
  [0, 0xfffbe8],
  [0.22, 0xe4ecff],
  [0.55, 0xa9b6ff],
  [1, 0x8a76e0],
];
/** 낮 꼬리: 금빛 → 연보라. 아래 한 칸에 짙은 남보라 그늘 (밝은 풀밭·돌마당에서도 읽히게) */
const DAY_RAMP: readonly [number, Color][] = [
  [0, 0xfffbe0],
  [0.25, 0xffd860],
  [0.6, 0xf6ead0],
  [1, 0xc4b4f0],
];

/** 꼬리 한 장: 머리(ax, ay)에서 왼쪽 위로 가로 2칸에 세로 1칸씩 계단 (머리 칸은 비워 둔다 — 머리 그림이 덮는다) */
function tail(g: Grid, len: number, day: boolean): void {
  const ax = TAIL_AX;
  const ay = TAIL_AY;
  const pts: [number, number, number, Color][] = [];
  for (let i = 0; i < len; i++) {
    const t = len <= 1 ? 0 : i / (len - 1);
    const x = ax - 1 - i;
    const y = ay - Math.floor((i + 1) / 2);
    const a = Math.round(255 * Math.max(day ? 0.3 : 0.12, (1 - t) ** (day ? 0.8 : 0.95)));
    pts.push([x, y, a, ramp(day ? DAY_RAMP : NIGHT_RAMP, t)]);
  }
  // 번짐·그늘 먼저 (선 위에 덮이지 않게)
  pts.forEach(([x, y, a], i) => {
    const t = len <= 1 ? 0 : i / (len - 1);
    if (day) {
      if (t < 0.75) g.set(x, y + 1, 0x3e3a7a, Math.round(a * 0.55));
    } else {
      if (t < 0.4) g.set(x, y - 1, 0xbcc8ff, Math.round(a * 0.36));
      if (i < 2) g.set(x, y + 1, 0xbcc8ff, Math.round(a * 0.22));
    }
  });
  for (const [x, y, a, c] of pts) g.set(x, y, c, a);
}

export const METEOR_FX_ART = {
  /** 밤 꼬리 (길이 6단계 — 머리 자리 = (TAIL_AX, TAIL_AY), 오른쪽 아래로 떨어진다) */
  mtTail: { w: TAIL_W, h: TAIL_H, frames: TAIL_NIGHT.length, build: frames(TAIL_W, TAIL_H, TAIL_NIGHT.length, (g, f) => tail(g, TAIL_NIGHT[f], false)) },
  /** 낮 꼬리 (짧게, 금빛) */
  mtTailDay: { w: TAIL_W, h: TAIL_H, frames: TAIL_DAY.length, build: frames(TAIL_W, TAIL_H, TAIL_DAY.length, (g, f) => tail(g, TAIL_DAY[f], true)) },
  /** 별똥별 머리 5×5 (0 = 십자, 1 = 반짝 — 대각 잔빛) */
  mtHead: {
    w: 5,
    h: 5,
    frames: 2,
    build: frames(5, 5, 2, (g, f) => {
      if (f) for (const [x, y] of [[1, 1], [3, 3], [1, 3], [3, 1]] as const) g.set(x, y, 0xdfe6ff, 80);
      for (const [x, y] of [[2, 0], [2, 4], [0, 2], [4, 2]] as const) g.set(x, y, 0xd8e4ff, f ? 120 : 80);
      for (const [x, y] of [[2, 1], [2, 3], [1, 2], [3, 2]] as const) g.set(x, y, 0xfff2c8, 235);
      g.set(2, 2, 0xffffff);
    }),
  },
  /** 낮 머리: 금빛 십자 + 짙은 금 끝 (풀밭에서 보이게) */
  mtHeadDay: {
    w: 5,
    h: 5,
    frames: 2,
    build: frames(5, 5, 2, (g, f) => {
      for (const [x, y] of [[2, 0], [2, 4], [0, 2], [4, 2]] as const) g.set(x, y, 0xc8902a, f ? 170 : 110);
      for (const [x, y] of [[2, 1], [2, 3], [1, 2], [3, 2]] as const) g.set(x, y, 0xffd04a, 240);
      g.set(2, 2, 0xfffbe0);
    }),
  },
  /** 밤 머리 둘레 푸른 번짐 (더해 그린다) */
  mtGlow: {
    w: 9,
    h: 9,
    frames: 1,
    build: () => {
      const g = new Grid(9, 9);
      g.ellipse(4.5, 4.5, 4.5, 4.5, 0x5a6ee0, 26);
      g.ellipse(4.5, 4.5, 3, 3, 0x98acff, 46);
      g.ellipse(4.5, 4.5, 1.5, 1.5, 0xeef2ff, 90);
      return g;
    },
  },
  /** 머리 위 작은 별 3×3: [금·얼음·라일락] × [점, 십자] */
  mtStar: {
    w: 3,
    h: 3,
    frames: 6,
    build: frames(3, 3, 6, (g, f) => {
      const c = [0xfff0b8, 0xcfe0ff, 0xe2ccff][f >> 1];
      if (f & 1) {
        for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) g.set(x, y, c, 150);
        g.set(1, 1, 0xffffff);
      } else g.set(1, 1, c);
    }),
  },
  /** 별똥별 부스러기 3×3 (0 = 금빛 조각, 1 = 반짝) */
  mtCrumb: {
    w: 3,
    h: 3,
    frames: 2,
    build: frames(3, 3, 2, (g, f) => {
      if (f) {
        for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) g.set(x, y, 0xffe9a0, 120);
        g.set(1, 1, 0xfff8e0);
      } else {
        g.set(1, 1, 0xffd860);
        g.set(1, 0, 0xfff6d0, 210);
        g.set(0, 1, 0xf0b440, 160);
        g.set(2, 1, 0xf0b440, 160);
        g.set(1, 2, 0xc0842a, 130);
      }
    }),
  },
} as const;

/** 착용 규칙 (cosmeticFx COSMETIC_FX에 섞인다) */
export const METEOR_FX = {
  st_meteor: { kind: "aura", motion: "mtMeteor" },
} satisfies Record<string, FxSpec>;

function h01(i: number, salt = 0): number {
  let h = Math.imul((i + 1) * 374761393 + salt * 668265263, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 별똥별 한 번 주기 (ms) */
export const METEOR_MS = 2800;
/** 주기 중 날아가는 몫 (≈ 530ms) */
const FLY = 0.19;
/** 날아간 뒤 꼬리가 사라지는 몫 */
const FADE = 0.07;
/** 부스러기가 떨어지는 몫 */
const CRUMB = 0.26;
/** 한 번에 가는 계단 수 (가로 2칸·세로 1칸씩 → 가로 24, 세로 12) */
const STEPS = 12;
/** 열에 몇 번 뒤따르는 별똥별이 하나 더 (유성우) */
const PAIR_P = 0.4;
/** 머리 위 작은 별 자리 (머리 윗면 기준 dx, dy, 색) */
const CROWN: readonly (readonly [number, number, number])[] = [
  [-10, -7, 0],
  [1, -12, 1],
  [11, -5, 2],
];

/** 한 줄기 그리기: 시작 머리 자리 (sx, sy), 진행 s(0..1), 꼬리 사라짐 fade(0..1) */
function streak(d: MeteorDraw, sx: number, sy: number, dirX: number, s: number, fade: number, alpha: number, maxFrame: number, front: number): { x: number; y: number } {
  const step = Math.round(Math.min(1, s) * STEPS);
  const x = sx + dirX * 2 * step;
  const y = sy + step;
  const k = (s < 0.12 ? s / 0.12 : 1) * (1 - fade) * alpha;
  if (k <= 0.01) return { x, y };
  const night = d.night;
  const fi = Math.min(maxFrame, Math.floor(Math.min(1, s) * (maxFrame + 2)));
  const flip = dirX < 0;
  const ox = (flip ? TAIL_W - 1 - TAIL_AX : TAIL_AX) / TAIL_W;
  const oy = TAIL_AY / TAIL_H;
  d.push(night ? "mtTail" : "mtTailDay", fi, x, y, { ox, oy, flip, alpha: k * (night ? 1 : 0.9), layer: night ? "light" : "body", depth: front });
  if (fade < 0.02) {
    if (night) d.push("mtGlow", 0, x, y, { ox: 4 / 9, oy: 4 / 9, alpha: 0.8 * k, layer: "light", depth: 0 });
    d.push(night ? "mtHead" : "mtHeadDay", step % 4 === 1 ? 1 : 0, x, y, { ox: 2 / 5, oy: 2 / 5, alpha: k * (night ? 1 : 0.85), layer: night ? "light" : "body", depth: front + 0.01 });
  }
  return { x, y };
}

/**
 * 유성우 오라 그리기. t = 시각 (움직임 줄이기·미리보기면 calm — 날아가는 한 순간에 멈춘 그림).
 * seed = 멈춘 그림의 방향 (미리보기 — 게임에서는 사람마다 시계가 같아도 괜찮다, 위치가 달라서). 숨긴 자세는 cosmeticFx가 몸 자리(aura)로 바꿔 넘긴다
 */
export function meteorAura(f: Pick<FxInput, "x" | "headY" | "artTop" | "reduced" | "still">, t: number, d: MeteorDraw, seed = 0): void {
  const calm = f.reduced || !!f.still;
  const bx = f.x;
  const top = f.headY - f.artTop;
  const front = d.depth + 0.2;
  const k = calm ? seed : Math.floor(t / METEOR_MS);
  const u = calm ? FLY * 0.72 : (t % METEOR_MS) / METEOR_MS;
  const dirX = h01(k, 3) < 0.5 ? 1 : -1;
  const jx = Math.round((h01(k, 4) - 0.5) * 6);
  const jy = Math.round(h01(k, 5) * 4);
  const sx = bx - dirX * 16 + jx;
  const sy = top - 14 - jy;
  // 작은 별 셋 (숨 쉬듯)
  CROWN.forEach(([dx, dy, c], i) => {
    const tw = calm ? [0.9, 0.45, 0.7][i] : 0.5 + 0.5 * Math.sin(t / (640 + i * 170) + i * 2.1);
    const frame = c * 2 + (tw > 0.78 ? 1 : 0);
    const a = d.night ? 0.3 + 0.7 * tw : 0.22 + 0.4 * tw;
    d.push("mtStar", frame, bx + dx, top + dy, { ox: 1 / 3, oy: 1 / 3, alpha: a, layer: d.night ? "light" : "body", depth: d.depth - 0.2 });
  });
  // 별똥별 (+ 열에 넷은 뒤따르는 하나)
  const s = u / FLY;
  const fade = u > FLY ? (u - FLY) / FADE : 0;
  if (u < FLY + FADE) streak(d, sx, sy, dirX, s, Math.min(1, fade), 1, 5, front);
  if (h01(k, 6) < PAIR_P && !calm) {
    const lag = 0.075;
    const u2 = u - lag;
    if (u2 > 0 && u2 < FLY + FADE) streak(d, sx - dirX * 6, sy - 5, dirX, u2 / FLY, u2 > FLY ? Math.min(1, (u2 - FLY) / FADE) : 0, 0.7, 3, front);
  }
  // 부스러기: 다 지나간 자리(머리 옆)에서 반짝이며 어깨 쪽으로 떨어진다
  const cu = calm ? 0.35 : (u - FLY) / CRUMB;
  if (cu > 0 && cu < 1) {
    const ex = sx + dirX * 2 * STEPS;
    const ey = sy + STEPS;
    const w = cu;
    const a = w < 0.15 ? w / 0.15 : 1 - (w - 0.15) / 0.85;
    const cx = Math.round(ex + dirX * (1 + 2 * w));
    const cy = Math.round(ey + 2 + 9 * w ** 1.4);
    const tw = calm ? 0 : Math.floor(t / 110) % 3 === 0 ? 1 : 0;
    d.push("mtCrumb", tw, cx, cy, { ox: 1 / 3, oy: 1 / 3, alpha: a * (d.night ? 1 : 0.85), layer: d.night ? "light" : "body", depth: front });
  }
}

// ── 아이콘 16×16 (가방·상점) ──
/** 짙은 밤하늘 조각 위에 별똥별 하나 + 먼 별 + 아래로 떨어지는 금빛 부스러기 (흰 꼬리가 밝은 칸에 묻히지 않게 밤 조각 위에) */
export function meteorIcon(): Grid {
  const g = new Grid(16, 16);
  for (let y = 1; y < 15; y++)
    for (let x = 1; x < 15; x++) {
      if ((x === 1 || x === 14) && (y === 1 || y === 14)) continue;
      g.set(x, y, mix(0x1a1d4a, 0x3b2d6c, (x + y - 2) / 26));
    }
  g.outline(0x0f0f24, false, 255);
  /** 밤 조각 위에 섞어 찍기 (조각은 불투명하게 남는다) */
  const dot = (x: number, y: number, c: Color, a = 255) => g.set(x, y, mix(g.get(x, y) >>> 8, c, a / 255));
  // 머리 둘레 옅은 빛
  for (const [x, y] of [[10, 8], [12, 8], [10, 10], [12, 10], [11, 7], [13, 9], [11, 11]] as const) g.set(x, y, mix(0x3b2d6c, 0x8fa0ff, 0.45));
  // 먼 별
  for (const [x, y, c] of [[3, 3, 0xcfe0ff], [13, 3, 0xe2ccff], [3, 12, 0xfff0b8], [8, 13, 0xcfe0ff]] as const) dot(x, y, c, 210);
  // 꼬리 (가로 2칸에 세로 1칸, 머리 가까이는 위 한 칸 번짐)
  const hx = 11;
  const hy = 9;
  const len = 9;
  for (let i = len - 1; i >= 0; i--) {
    const t = i / (len - 1);
    const x = hx - 1 - i;
    const y = hy - Math.floor((i + 1) / 2);
    if (t < 0.4) dot(x, y - 1, 0xa8b8ff, Math.round(150 * (1 - t)));
    dot(x, y, ramp(NIGHT_RAMP, t), Math.round(255 * Math.max(0.35, (1 - t) ** 0.8)));
  }
  // 머리 (십자 + 흰 가운데)
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) g.set(hx + dx, hy + dy, 0xfff2c8);
  g.set(hx, hy, 0xffffff);
  // 금빛 부스러기 (머리 아래로 떨어지는 작은 반짝)
  g.set(12, 12, 0xffd860);
  for (const [x, y] of [[12, 11], [11, 12], [13, 12], [12, 13]] as const) dot(x, y, 0xf0b440, 150);
  return g;
}
