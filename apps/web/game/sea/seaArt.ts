import {
  SEA_BOARDWALK,
  SEA_BREAKWATER,
  SEA_BREAKWATER_TIP,
  SEA_BUS_STOP,
  SEA_DEEP_Y,
  SEA_DIG_HOLES,
  SEA_FLAT_Y0,
  SEA_HEIGHT,
  SEA_LOT_GATE_W,
  SEA_LOT_H,
  SEA_LOT_W,
  SEA_PIER,
  SEA_PIER_END,
  SEA_ROAD,
  SEA_ROCKS,
  SEA_SAND_Y0,
  SEA_WIDTH,
} from "@tomb/protocol";
import { darken, Grid, lighten, mix, rng, type Color } from "../sprites/pixel";
import { hashU, poolDepth, seaGroundKind, SEA_PLATFORM, type SeaGround } from "./seaLayout";
import { SEA_TEX_PREFIX } from "./seaTypes";

// 11/16 달물결 포구 픽셀 아트 (코드로 그려요, 마을·캠핑장 그림을 다시 쓰지 않고 새로).
// 11/16 사용자 "고물상 같아요" → 파스텔 바닷가로: 크림빛 모래, 민트·아쿠아 얕은 물에서 청록·연보라 먼바다로, 복숭아·민트·라일락·버터색 지붕과 차양,
// 깨끗한 산책로, 지저분한 점·잔해는 줄이고, 갯벌은 따뜻한 회보라(토프), 바위는 푸른 회색. 원점 = 바닥 가운데 (0.5, 1),
// 맨 아래 줄 근처는 그림자 (캠핑장 그림과 같은 규칙). 모든 함수는 순수(Grid·RGBA 배열)라 Phaser 없이도 돌아요.
// 텍스처 키는 SEA_TEX 값 (모두 "sea-"로 시작). 한 번 구우면 장면을 닫아도 남겨 둬요.

// ── 11/16 사용자 확정 시안(seaside-mock)의 색 단계 ── 밝은 쪽 → 어두운 쪽. 원색 없이 한 톤 눌린 색.
// 바닥·모래·물은 선 없이 단계 사이를 4×4 순서 디더로 섞고, 낮은 주파수 값 잡음으로 부드러운 얼룩을 둬요.
// 물체(건물·덤불·나무·파라솔·배·바위·매점·등대)만 연한 테: 뒷배경을 따뜻한 갈색(92,74,66) 쪽으로 48% 누른 색 (검은 선이 아니에요)
const hexes = (a: readonly string[]): readonly Color[] => a.map((h) => parseInt(h.slice(1), 16));
export const RAMP = {
  sand: hexes(["#fbf0dc", "#f7e7cc", "#f1dcbc", "#e9cfab", "#dfc19a"]),
  wet: hexes(["#e6cfa9", "#dcc29b", "#d0b48d", "#c4a681"]),
  water: hexes(["#e9f8f4", "#cdf0ec", "#ade6e4", "#8dd9de", "#71c9d8", "#5db5cf", "#4e9ec3", "#4588b5", "#3f74a5"]),
  grass: hexes(["#c3e2a2", "#b0d690", "#9cc882", "#89b876", "#77a66b"]),
  leaf: hexes(["#c9eaa4", "#a8d98b", "#88c477", "#6cad69", "#57955e", "#477f55"]),
  trunk: hexes(["#c99a6b", "#a97b52", "#8b6142"]),
  wood: hexes(["#f1d3a6", "#e5c191", "#d6ad7c", "#c39869", "#ae845b"]),
  roofC: hexes(["#f8c4b4", "#f2ad9b", "#e79685", "#d88173"]),
  roofM: hexes(["#c9eadc", "#addfcb", "#91cfb8", "#79bca5"]),
  wall: hexes(["#fffaf2", "#f7eedf", "#ecdfca", "#ddcdb4"]),
  glass: hexes(["#e8f8fb", "#bfe8f1", "#94d3e6", "#76bcd6"]),
  rock: hexes(["#e2e7ea", "#ccd4da", "#b3bec7", "#9aa8b4", "#84929f"]),
  road: hexes(["#c4c6c9", "#b3b6ba", "#a3a6ab"]),
  umbC: hexes(["#fbd0c2", "#f4b1a0", "#e8968a"]),
  umbY: hexes(["#fff0bf", "#fbe19a", "#f1cd7e"]),
  towel: hexes(["#cdeef6", "#a9dcec", "#8cc8de"]),
  hull: hexes(["#f6b8a8", "#ea9c8c", "#d98476"]),
} as const;
const B4M = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 단계 고르기 (v 0..1, 단계 사이는 4×4 순서 디더) */
export function pick(ramp: readonly Color[], v: number, x: number, y: number): Color {
  const n = ramp.length - 1;
  const f = Math.max(0, Math.min(n, v * n));
  const i = Math.floor(f);
  return ramp[Math.min(n, i + (f - i > B4M[((y & 3) << 2) | (x & 3)] ? 1 : 0))];
}
function h2(x: number, y: number): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const smt = (t: number) => t * t * (3 - 2 * t);
/** 값 잡음 (px = x 방향 주기 칸 수 — 0이면 주기 없음, 타일 그림이 이어지게) */
function vnoise(x: number, y: number, px = 0): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smt(x - xi);
  const yf = smt(y - yi);
  const w = (v: number) => (px > 0 ? ((v % px) + px) % px : v);
  const a = h2(w(xi), yi);
  const b = h2(w(xi + 1), yi);
  const c = h2(w(xi), yi + 1);
  const d = h2(w(xi + 1), yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
/** 부드러운 얼룩 (세 겹) */
export function fbm(x: number, y: number, px = 0): number {
  return vnoise(x, y, px) * 0.6 + vnoise(x * 2, y * 2.1, px * 2) * 0.3 + vnoise(x * 4, y * 4.3, px * 4) * 0.1;
}
/** 물체 둘레 연한 테 색·불투명도 (뒷배경을 따뜻한 갈색 쪽으로 48%) */
const SOFT_EDGE = 0x5c4a42;
const SOFT_EDGE_A = 122;
function softOutline(g: Grid): void {
  g.outline(SOFT_EDGE, false, SOFT_EDGE_A);
}
/** 둥근 덩어리 (원 여러 개를 합친 모양, 빛은 왼쪽 위 — 아래 가장자리는 한 단계 진하게) */
function blobPaint(g: Grid, circles: readonly (readonly [number, number, number])[], ramp: readonly Color[], rimDark = true, salt = 0): void {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const [cx, cy, r] of circles) {
    x0 = Math.min(x0, cx - r);
    y0 = Math.min(y0, cy - r);
    x1 = Math.max(x1, cx + r);
    y1 = Math.max(y1, cy + r);
  }
  const inside = (x: number, y: number) => circles.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
  for (let y = Math.floor(y0); y <= y1; y++)
    for (let x = Math.floor(x0); x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      let best = circles[0];
      let bd = 1e9;
      for (const c of circles) {
        const d = Math.hypot(x - c[0], y - c[1]) / c[2];
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      const nx = (x - best[0]) / best[2];
      const ny = (y - best[1]) / best[2];
      let light = 0.55 - (-nx * 0.55 - ny * 0.8) * 0.55 + bd * 0.18 + (fbm(x * 0.35 + salt, y * 0.35) - 0.5) * 0.35;
      if (rimDark && !inside(x + 0.5, y + 1.5)) light += 0.22;
      g.set(x, y, pick(ramp, Math.max(0, Math.min(1, light)), x, y));
    }
}
const P = SEA_TEX_PREFIX;

export const SEA_TEX = {
  pine: (v: number) => `${P}pine${v}`,
  bush: (v: number) => `${P}bush${v}`,
  palm: `${P}palm`,
  beachGrass: (v: number) => `${P}beachGrass${v}`,
  shell: (v: number) => `${P}shell${v}`,
  drift: `${P}drift`,
  flower: (v: number) => `${P}flower${v}`,
  shelter: `${P}shelter`,
  busSign: `${P}busSign`,
  timetable: `${P}timetable`,
  bench: `${P}bench`,
  market: `${P}market`,
  realty: `${P}realty`,
  kiosk: `${P}kiosk`,
  lot: (n: number) => `${P}lot${n}`,
  lotSign: `${P}lotSign`,
  pier: `${P}pier`,
  pierEnd: `${P}pierEnd`,
  post: `${P}post`,
  breakwater: `${P}breakwater`,
  tip: `${P}tip`,
  tetra: (v: number) => `${P}tetra${v}`,
  lighthouse: `${P}lighthouse`,
  boat: `${P}boat`,
  buoy: `${P}buoy`,
  rock: (i: number) => `${P}rock${i}`,
  footbath: `${P}footbath`,
  lamp: `${P}lamp`,
  lampGlow: `${P}lampGlow`,
  beaconGlow: `${P}beaconGlow`,
  crates: `${P}crates`,
  netRack: `${P}netRack`,
  gull: `${P}gull`,
  water: `${P}water`,
  foam: `${P}foam`,
  lace: `${P}lace`,
  wet: `${P}wet`,
  shimmer: `${P}shimmer`,
  spray: `${P}spray`,
  sparkle: `${P}sparkle`,
  /** 11/16 물 빛: 반짝이는 별·밤 물빛 점·지나가는 빛 띠·먼바다 깊이 그늘 */
  star: `${P}star`,
  glowDot: `${P}glowDot`,
  sheen: `${P}sheen`,
  depthShade: `${P}depthShade`,
  sheenWet: `${P}sheenWet`,
  duskWater: `${P}duskWater`,
  duskFoam: `${P}duskFoam`,
  goldStreak: `${P}goldStreak`,
  ground: (cx: number, cy: number) => `${P}ground-${cx}-${cy}`,
} as const;

/** 그리드 + (스프라이트 시트면) 프레임 크기 */
export type ArtOut = { grid: Grid; frameW?: number; frameH?: number };

// ── 공용 도구 ──

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x464e6e, Math.round(a * 0.75 * (1 - (dx * dx + dy * dy) * 0.6)));
    }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, w = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.rect(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), w, w, c);
}

function frame(g: Grid, x: number, y: number, w: number, h: number, c: Color): void {
  g.hline(x, x + w - 1, y, c);
  g.hline(x, x + w - 1, y + h - 1, c);
  g.vline(x, y, y + h - 1, c);
  g.vline(x + w - 1, y, y + h - 1, c);
}

type Pal3 = { hi: Color; mid: Color; lo: Color };
type Pal4 = Pal3 & { deep: Color };

/** 소금기에 바랜 흰 칠 나무 */
/** 11/16 현판 그림 (글씨는 판 위에 뜨는 이름표가 맡아요 — 판에는 작은 그림만): 물고기 */
function fishIcon(g: Grid, x: number, y: number, c: Color): void {
  g.ellipse(x + 4, y + 2.5, 4, 2.2, c);
  g.set(x + 9, y + 1, c);
  g.set(x + 9, y + 4, c);
  g.rect(x + 8, y + 2, 2, 2, c);
  g.set(x + 2, y + 2, 0xfffaf0);
}
/** 작은 집 (지붕 세모 + 몸) */
function houseIcon(g: Grid, x: number, y: number, roof: Color, wall: Color): void {
  for (let k = 0; k < 4; k++) g.hline(x + 3 - k, x + 4 + k, y + k, roof);
  g.rect(x + 1, y + 4, 6, 4, wall);
  g.rect(x + 3, y + 5, 2, 3, roof);
}

const PAINT: Pal3 & { line: Color } = { hi: RAMP.wall[0], mid: RAMP.wall[1], lo: RAMP.wall[2], line: RAMP.wall[3] };
/** 비바람에 바랜 회갈색 나무 (선착장·울타리 말뚝) */
const DRIFTWOOD: Pal3 & { line: Color } = { hi: RAMP.wood[0], mid: RAMP.wood[2], lo: RAMP.wood[3], line: RAMP.wood[4] };
/** 선착장 판자 */
const DECK: Pal3 & { line: Color } = { hi: RAMP.wood[0], mid: RAMP.wood[1], lo: RAMP.wood[3], line: RAMP.wood[4] };
/** 바랜 하늘빛 지붕 */
/** 지붕·몸통 기본 (파스텔 민트) */
const ROOF_BLUE: Pal4 = { hi: RAMP.roofM[0], mid: RAMP.roofM[1], lo: RAMP.roofM[2], deep: RAMP.roofM[3] };
/** 11/16 파스텔 지붕 (복숭아·라일락·버터) */
// 11/16 시안: 작은 집(부동산)은 민트 지붕, 큰 집(시장)은 코럴 지붕
const ROOF_PEACH: Pal4 = { hi: RAMP.roofM[0], mid: RAMP.roofM[1], lo: RAMP.roofM[2], deep: RAMP.roofM[3] };
const ROOF_LILAC: Pal4 = { hi: RAMP.roofC[0], mid: RAMP.roofC[1], lo: RAMP.roofC[2], deep: RAMP.roofC[3] };
const CONCRETE: Pal3 & { line: Color } = { hi: RAMP.rock[0], mid: RAMP.rock[1], lo: RAMP.rock[2], line: RAMP.rock[3] };
const BASALT: Pal4 = { hi: RAMP.rock[1], mid: RAMP.rock[2], lo: RAMP.rock[3], deep: RAMP.rock[4] };

const DIGITS: readonly string[] = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function drawNumber(g: Grid, n: number, x: number, y: number, c: Color): void {
  String(n)
    .split("")
    .forEach((ch, i) => {
      const bits = DIGITS[Number(ch)];
      for (let k = 0; k < 15; k++) if (bits[k] === "1") g.set(x + i * 4 + (k % 3), y + Math.floor(k / 3), c);
    });
}

// ── 나무·풀 ──


/**
 * 11/16 둥근 잎 나무 (시안 tree): 줄기 + 원 넷을 합친 수관, 빛은 왼쪽 위, 아래 가장자리 한 단계 진하게.
 * 테가 잘리지 않게 그림 둘레에 여백을 넉넉히 둬요 (예전엔 잎·테가 그림 끝에서 잘렸어요)
 */
export function pineArt(v: number): Grid {
  const r0 = v ? 13 : 11;
  const W = Math.ceil(r0 * 3.2) + 8;
  const H = Math.ceil(r0 * 2.6) + 14;
  const g = new Grid(W, H);
  const cx = W / 2;
  const cy = r0 + 4;
  const base = H - 4;
  for (let y = Math.round(cy + r0 * 0.6); y <= base; y++)
    for (let j = 0; j < 4; j++) g.set(Math.round(cx) - 2 + j, y, pick(RAMP.trunk, (j / 3) * 0.8 + (y - cy) * 0.01, Math.round(cx) + j, y));
  blobPaint(
    g,
    [
      [cx, cy, r0],
      [cx - r0 * 0.55, cy + r0 * 0.25, r0 * 0.7],
      [cx + r0 * 0.55, cy + r0 * 0.3, r0 * 0.68],
      [cx, cy - r0 * 0.45, r0 * 0.7],
    ],
    RAMP.leaf,
    true,
    v * 17,
  );
  softOutline(g);
  shadow(g, cx + 2, base + 1, r0 + 3, 2.6, 64);
  return g;
}

/** 11/16 덤불 (시안 bush): 둥근 덩어리 셋 + 분홍·흰 꽃 몇 송이 */
export function bushArt(v: number): Grid {
  const r0 = v % 2 ? 6 : 5;
  const W = Math.ceil(r0 * 4) + 6;
  const H = Math.ceil(r0 * 2) + 8;
  const g = new Grid(W, H);
  const cx = W / 2;
  const cy = r0 + 2;
  blobPaint(
    g,
    [
      [cx, cy, r0],
      [cx - r0 * 0.8, cy + 1, r0 * 0.75],
      [cx + r0 * 0.8, cy + 1, r0 * 0.7],
    ],
    RAMP.leaf,
    true,
    30 + v * 7,
  );
  const r = rng(1200 + v);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(cx - r0 * 1.2 + r() * r0 * 2.4);
    const y = Math.floor(cy - r0 * 0.6 + r() * r0 * 0.9);
    if (g.filled(x, y)) g.set(x, y, i % 2 ? 0xf8c8c4 : 0xfff6de);
  }
  softOutline(g);
  shadow(g, cx + 1, H - 3, r0 * 1.6 + 2, 2, 56);
  return g;
}

/** 11/16 야자수 (시안 palm): 휘어진 줄기 + 잎 덩어리 여섯 (잎은 아래 테 없이) */
export function palmArt(): Grid {
  const W = 44;
  const H = 62;
  const g = new Grid(W, H);
  const base = H - 4;
  const top = { x: W / 2, y: 18 };
  for (let y = top.y; y <= base; y++) {
    const ox = Math.round(Math.sin((y - top.y) / 12) * 3);
    for (let j = 0; j < 3; j++) g.set(top.x + ox - 1 + j, y, RAMP.trunk[j === 2 ? 2 : (y + j) % 4 === 0 ? 0 : 1]);
  }
  const fr: [number, number][] = [
    [-16, 3],
    [-12, -7],
    [-2, -11],
    [10, -7],
    [16, 3],
    [4, 4],
  ];
  for (const [dx, dy] of fr)
    blobPaint(
      g,
      [
        [top.x + dx * 0.6, top.y + dy * 0.6, 5],
        [top.x + dx, top.y + dy, 4],
      ],
      RAMP.leaf,
      false,
      dx,
    );
  softOutline(g);
  shadow(g, top.x + 3, base + 1, 10, 2.4, 56);
  return g;
}

export function beachGrassArt(v: number): Grid {
  const g = new Grid(12, 10);
  const c = v === 2 ? 0xb4a45a : v === 1 ? 0x8e9a52 : 0xa0a85e;
  for (const [x0, dx] of [
    [6, -5],
    [6, 5],
    [6, -2],
    [6, 2],
    [6, 0],
  ] as const)
    line(g, x0, 9, x0 + dx, 1 + Math.abs(dx) / 2, c);
  g.recolor((_x, y) => y < 4, lighten(c, 0.25));
  return g;
}

export function shellArt(v: number): Grid {
  const g = new Grid(6, 5);
  const c = [0xf4e6d8, 0xe8c4b0, 0xd8d0c4][v % 3];
  g.ellipse(3, 2.5, 2.4, 1.8, c);
  g.set(3, 1, lighten(c, 0.4));
  if (v === 1) g.set(2, 3, darken(c, 0.25));
  softOutline(g);
  return g;
}

export function driftArt(): Grid {
  const g = new Grid(26, 8);
  line(g, 2, 5, 23, 3, DRIFTWOOD.mid, 2);
  line(g, 2, 4, 23, 2, DRIFTWOOD.hi);
  line(g, 16, 3, 20, 0, DRIFTWOOD.lo);
  softOutline(g);
  shadow(g, 13, 7, 11, 1, 40);
  return g;
}

export function flowerArt(v: number): Grid {
  const g = new Grid(7, 6);
  const c = [0xf0a0b8, 0xf8e8a0, 0xd8c8f0][v % 3];
  g.vline(3, 2, 5, 0x6a8a44);
  g.set(3, 1, c);
  g.set(2, 2, c);
  g.set(4, 2, c);
  g.set(3, 2, 0xf8d040);
  g.set(1, 4, 0x7a9a4a);
  g.set(5, 3, 0x7a9a4a);
  return g;
}

// ── 버스 정류장 ── 캠핑장 정류장과 같은 틀 (SHELTER_FRONT 자르기 자리 같음), 지붕은 바랜 하늘빛 골함석
export const SHELTER_ART_W = 68;
export const SHELTER_ART_H = 56;
export function shelterArt(): Grid {
  const W = SHELTER_ART_W;
  const H = SHELTER_ART_H;
  const g = new Grid(W, H);
  const base = H - 3;
  const pole = { hi: 0xe8ecec, mid: 0xc4cccc, lo: 0x8e9898 };
  // 뒷벽 (흰 칠 판 + 바닷가 포스터)
  g.rect(5, 16, W - 10, 18, 0xe4ded0);
  g.hline(5, W - 6, 16, 0xf4f0e6);
  for (let x = 6; x < W - 6; x += 6) g.vline(x, 17, 33, 0xccc4b4);
  g.rect(12, 19, 18, 12, 0x8ec4d8); // 포스터 속 바다
  g.rect(12, 26, 18, 5, 0x4e8cb0);
  g.ellipse(25, 22, 2.5, 2.5, 0xf8e0a0); // 포스터 속 달
  g.rect(15, 24, 6, 1, 0xf4f0e6); // 포스터 속 물결
  g.rect(37, 20, 18, 9, 0xf4ecd8); // 물때표 종이
  for (let y = 22; y < 28; y += 2) g.hline(39, 52, y, 0x9aa8b0);
  // 기둥 (흰 칠 쇠)
  for (const x of [4, W - 8]) {
    g.rect(x, 10, 4, base - 10, pole.mid);
    g.vline(x, 10, base - 1, pole.hi);
    g.vline(x + 3, 10, base - 1, pole.lo);
  }
  // 지붕 (하늘빛 골함석, 앞으로 기울어짐)
  for (let y = 4; y < 14; y++)
    for (let x = 0; x < W; x++) {
      const ridge = x % 4;
      const c = ridge === 0 ? ROOF_BLUE.hi : ridge === 3 ? ROOF_BLUE.lo : ROOF_BLUE.mid;
      g.set(x, y, c);
    }
  g.hline(0, W - 1, 13, ROOF_BLUE.deep);
  g.hline(0, W - 1, 4, lighten(ROOF_BLUE.hi, 0.3));
  g.rect(W / 2 - 3, 14, 6, 3, 0xfff0c8); // 지붕 등
  softOutline(g);
  shadow(g, W / 2, base + 1, W / 2 - 3, 2, 58);
  return g;
}
/** 벤치에 앉은 사람 앞에 한 번 더 그리는 조각 (캠핑장 SHELTER_FRONT와 같은 자리) */
export const SHELTER_FRONT: readonly (readonly [number, number, number, number])[] = [
  [0, 0, SHELTER_ART_W, 16],
  [3, 16, 5, 38],
  [SHELTER_ART_W - 8, 16, 5, 38],
];

export function busSignArt(): Grid {
  const g = new Grid(30, 52);
  const base = 49;
  g.rect(13, 8, 3, base - 8, 0x8a8a86);
  g.vline(13, 8, base - 1, 0xb8b8b2);
  g.ellipse(14.5, 7, 7, 7, 0x2e7aa8);
  g.ellipse(14.5, 7, 5.5, 5.5, 0xf4f0e4);
  g.rect(11, 4, 8, 5, 0x2e7aa8);
  g.rect(12, 5, 2, 2, 0xd8f0f8);
  g.rect(15, 5, 2, 2, 0xd8f0f8);
  g.set(12, 9, 0x2e2a28);
  g.set(17, 9, 0x2e2a28);
  // 노선 판 (바다색, 글씨는 SeaMap 이름표)
  g.rect(1, 17, 28, 13, 0x2a5e86);
  frame(g, 1, 17, 28, 13, 0xf4f0e4);
  g.hline(4, 25, 21, 0xf4f0e4);
  g.hline(4, 18, 25, 0xb8d8ec);
  softOutline(g);
  shadow(g, 14, base + 1, 4, 1.2, 60);
  return g;
}

export function timetableArt(): Grid {
  const g = new Grid(18, 32);
  const base = 29;
  g.rect(8, 14, 2, base - 14, 0x8a8a86);
  g.rect(1, 2, 16, 14, 0xf4f0e4);
  frame(g, 1, 2, 16, 14, 0x3a4a58);
  g.rect(1, 2, 16, 3, 0x2a5e86);
  for (let y = 7; y < 15; y += 2) g.hline(3, 14, y, y === 9 ? 0x4e8cb0 : 0x9aa4ac);
  softOutline(g);
  shadow(g, 9, base + 1, 4, 1.2, 60);
  return g;
}

/** 정류장 벤치 (하늘빛 칠 나무, 2인) */
export function benchArt(): Grid {
  const g = new Grid(42, 18);
  const wood = { hi: 0x9ccce0, mid: 0x6aa4c0, lo: 0x46809c };
  g.rect(3, 2, 36, 3, wood.mid);
  g.hline(3, 38, 2, wood.hi);
  g.rect(5, 5, 2, 5, wood.lo);
  g.rect(35, 5, 2, 5, wood.lo);
  g.rect(2, 9, 38, 4, wood.mid);
  g.hline(2, 39, 9, wood.hi);
  g.hline(2, 39, 11, wood.lo);
  for (let x = 4; x < 38; x += 7) if (hashU(x, 2, 5) < 0.5) g.set(x, 10, 0xe8e4d8); // 칠 벗겨진 자국
  g.rect(4, 13, 2, 3, 0x5a5650);
  g.rect(36, 13, 2, 3, 0x5a5650);
  softOutline(g);
  shadow(g, 21, 16, 19, 1.4, 56);
  return g;
}

// ── 포구 시장 ── 긴 단층 건물, 차양 셋 아래 좌판 (생선·조개·미역). 받침 = 좌판 앞 (SEA_MARKET.y)
export const MARKET_ART_W = 280;
export const MARKET_ART_H = 124;
/** 지붕 앞 현판 가운데 (그림 원점 기준 — 글씨는 SeaMap) */
export const MARKET_SIGN = { dx: 0, dy: -88 } as const;
const AWNINGS: readonly [Color, Color][] = [
  [RAMP.umbC[1], RAMP.wall[0]],
  [RAMP.towel[1], RAMP.wall[0]],
  [RAMP.umbY[1], RAMP.wall[0]],
];
export function marketArt(): Grid {
  const W = MARKET_ART_W;
  const H = MARKET_ART_H;
  const g = new Grid(W, H);
  const base = H - 3;
  const wallBot = base - 12;
  const wallTop = 44;
  // 벽 (흰 칠 판자, 아래는 바랜 하늘빛 판)
  for (let y = wallTop; y <= wallBot; y++)
    for (let x = 6; x < W - 6; x++) {
      const lower = y > wallBot - 12;
      const seam = (x - 6) % 8 === 0;
      g.set(x, y, lower ? (seam ? ROOF_BLUE.lo : ROOF_BLUE.mid) : seam ? PAINT.lo : hashU(x, y, 41) < 0.05 ? PAINT.lo : PAINT.mid);
    }
  // 지붕 (하늘빛 슬레이트, 처마가 벽 밖으로)
  const roofTop = 10;
  for (let y = roofTop; y < wallTop + 4; y++) {
    const k = (y - roofTop) / (wallTop + 4 - roofTop);
    const inset = Math.round((1 - k) * 14);
    for (let x = inset; x < W - inset; x++) {
      const row = Math.floor((y - roofTop) / 4);
      const c = (y - roofTop) % 4 === 3 ? ROOF_LILAC.deep : (x + row * 5) % 11 === 0 ? ROOF_LILAC.lo : row % 2 ? ROOF_LILAC.mid : lighten(ROOF_LILAC.mid, 0.08);
      g.set(x, y, c);
    }
  }
  g.hline(14, W - 15, roofTop, ROOF_LILAC.hi);
  g.hline(0, W - 1, wallTop + 3, ROOF_LILAC.deep);
  // 지붕 앞 현판 (11/16 글씨는 위에 뜨는 이름표 — 판에는 물고기·조개 그림)
  const sx = W / 2 - 34;
  g.rect(sx, 26, 68, 13, 0xfff8ee);
  for (let k = 0; k < 4; k++) fishIcon(g, sx + 6 + k * 15, 30, [0x7ec8d8, 0xf8a8a0, 0x9edcd0, 0xf8c88c][k]);
  frame(g, sx - 1, 25, 70, 15, DRIFTWOOD.line);
  g.rect(sx - 1, 39, 2, 6, DRIFTWOOD.lo);
  g.rect(sx + 67, 39, 2, 6, DRIFTWOOD.lo);
  // 창 (양 끝)
  for (const wx of [14, W - 36]) {
    g.rect(wx, wallTop + 10, 22, 14, RAMP.glass[1]);
    g.hline(wx, wx + 21, wallTop + 17, PAINT.line);
    g.vline(wx + 11, wallTop + 10, wallTop + 23, PAINT.line);
    frame(g, wx - 1, wallTop + 9, 24, 16, PAINT.line);
  }
  // 좌판 셋: 차양 + 어두운 안쪽 + 앞 진열대 (생선·조개·미역)
  const stallW = 70;
  for (let i = 0; i < 3; i++) {
    const cx = W / 2 + (i - 1) * 88;
    const x0 = cx - stallW / 2;
    g.rect(x0 + 4, wallTop + 14, stallW - 8, wallBot - wallTop - 14, RAMP.wood[3]);
    // 안쪽 선반 물건
    for (let k = 0; k < 8; k++) g.rect(x0 + 8 + k * 7, wallTop + 18, 5, 4, [0xc8b090, 0x9ac0d0, 0xe0a060, 0x8a9a6a][(k + i) % 4]);
    // 차양 (줄무늬, 끝은 물결)
    const [a, b] = AWNINGS[i];
    const ay = wallTop + 4;
    for (let y = ay; y < ay + 11; y++)
      for (let x = x0 - 2; x < x0 + stallW + 2; x++) {
        const stripe = Math.floor((x - x0 + 2) / 6) % 2 === 0;
        const shade = y > ay + 7;
        g.set(x, y, stripe ? (shade ? darken(a, 0.18) : a) : shade ? darken(b, 0.12) : b);
      }
    for (let x = x0 - 2; x < x0 + stallW + 2; x++) if (Math.floor((x - x0 + 2) / 3) % 2 === 0) g.set(x, ay + 11, Math.floor((x - x0 + 2) / 6) % 2 === 0 ? darken(a, 0.18) : darken(b, 0.12));
    // 진열대 (나무 상자 + 얼음 + 물건)
    const ty = wallBot + 1;
    g.rect(x0, ty, stallW, 10, DECK.mid);
    g.hline(x0, x0 + stallW - 1, ty, DECK.hi);
    g.hline(x0, x0 + stallW - 1, ty + 9, DECK.line);
    for (let k = 0; k < 4; k++) g.vline(x0 + 17 * k + 1, ty + 1, ty + 9, DECK.lo);
    const goods = i === 0 ? "fish" : i === 1 ? "shell" : "weed";
    for (let k = 0; k < 4; k++) {
      const bx = x0 + 3 + k * 17;
      g.rect(bx, ty - 3, 14, 4, 0xe8f4f8); // 얼음
      if (goods === "fish")
        for (let f = 0; f < 3; f++) {
          g.hline(bx + 1 + f * 4, bx + 3 + f * 4, ty - 4 + (f % 2), 0x9ab4c4);
          g.set(bx + 1 + f * 4, ty - 5 + (f % 2), 0x5a7486);
        }
      else if (goods === "shell") for (let f = 0; f < 4; f++) g.ellipse(bx + 2 + f * 3.3, ty - 3, 1.6, 1.3, [0xd88a5a, 0x8a6a5a, 0xf0d8c0][(f + k) % 3]);
      else for (let f = 0; f < 5; f++) g.vline(bx + 2 + f * 2.5, ty - 5, ty - 2, f % 2 ? 0x3a5a3a : 0x5a6a34);
    }
  }
  softOutline(g);
  shadow(g, W / 2, base + 1, W / 2 - 6, 2, 56);
  return g;
}

// ── 포구 부동산 ── 작은 나무 사무소. 받침 = 문 앞 계단 (SEA_REALTY.y)
export const REALTY_ART_W = 132;
export const REALTY_ART_H = 104;
export const REALTY_SIGN = { dx: 0, dy: -50 } as const;
export function realtyArt(): Grid {
  const W = REALTY_ART_W;
  const H = REALTY_ART_H;
  const g = new Grid(W, H);
  const base = H - 3;
  const wallBot = base - 6;
  const wallTop = 42;
  // 벽 (가로 판자, 연한 민트)
  for (let y = wallTop; y <= wallBot; y++) {
    const k = (y - wallTop) % 5;
    g.hline(6, W - 7, y, k === 0 ? RAMP.wall[0] : k === 4 ? RAMP.wall[3] : RAMP.wall[1]);
  }
  // 박공지붕 (붉은 기와)
  const peak = 6;
  for (let y = peak; y < wallTop + 3; y++) {
    const half = Math.round(((y - peak) / (wallTop + 3 - peak)) * (W / 2 + 2)) + 6;
    for (let x = W / 2 - half; x < W / 2 + half; x++) {
      const row = Math.floor((y - peak) / 4);
      const c = (y - peak) % 4 === 3 ? ROOF_PEACH.deep : (x + row * 3) % 9 === 0 ? ROOF_PEACH.lo : row % 2 ? ROOF_PEACH.mid : lighten(ROOF_PEACH.mid, 0.06);
      g.set(x, y, c);
    }
  }
  g.hline(0, W - 1, wallTop + 2, ROOF_PEACH.deep);
  // 현판 (문 위 — 11/16 글씨는 위에 뜨는 이름표, 판에는 작은 집 셋)
  g.rect(W / 2 - 40, wallTop + 4, 80, 12, 0xfff8ee);
  for (let k = 0; k < 3; k++) houseIcon(g, W / 2 - 22 + k * 16, wallTop + 6, [ROOF_PEACH.lo, ROOF_LILAC.lo, ROOF_BLUE.lo][k], 0xf2eadc);
  frame(g, W / 2 - 41, wallTop + 3, 82, 14, PAINT.line);
  // 문 (가운데) + 계단
  const dx = W / 2 - 9;
  g.rect(dx, wallBot - 30, 18, 30, 0x4e6e86);
  frame(g, dx - 1, wallBot - 31, 20, 31, PAINT.line);
  g.rect(dx + 3, wallBot - 26, 12, 8, 0xffe8b0);
  frame(g, dx + 3, wallBot - 26, 12, 8, PAINT.line);
  g.set(dx + 14, wallBot - 14, 0xe8c070);
  g.rect(dx - 4, wallBot + 1, 26, 3, CONCRETE.mid);
  g.rect(dx - 2, wallBot + 4, 22, 2, CONCRETE.lo);
  // 창 (왼쪽, 분양 안내 종이 · 오른쪽, 오두막 그림)
  for (const wx of [14, W - 42]) {
    g.rect(wx, wallBot - 30, 28, 18, RAMP.glass[1]);
    frame(g, wx - 1, wallBot - 31, 30, 20, PAINT.line);
    g.vline(wx + 14, wallBot - 30, wallBot - 13, PAINT.line);
  }
  g.rect(18, wallBot - 27, 8, 10, 0xf8f4ea);
  g.hline(19, 24, wallBot - 24, 0xc04a3a);
  g.rect(W - 36, wallBot - 26, 9, 6, 0x6a8ab0); // 오두막 그림
  g.rect(W - 37, wallBot - 28, 11, 2, 0xb24e36);
  // 꽃밭 (양옆)
  for (const fx of [8, W - 50]) {
    g.rect(fx, wallBot + 1, 42, 4, 0xc8a890);
    for (let x = fx + 2; x < fx + 40; x += 4) {
      g.set(x, wallBot, 0x5a8a44);
      g.set(x + 1, wallBot - 1, [0xf0a0b8, 0xf8e8a0, 0xe86a8a][(x >> 2) % 3]);
    }
  }
  softOutline(g);
  shadow(g, W / 2, base + 1, W / 2 - 6, 2, 56);
  return g;
}

// ── 매점 (선착장 머리 옆) ──
export const KIOSK_ART_W = 60;
export const KIOSK_ART_H = 60;
export const KIOSK_SIGN = { dx: 0, dy: -50 } as const;
export function kioskArt(): Grid {
  const W = KIOSK_ART_W;
  const H = KIOSK_ART_H;
  const g = new Grid(W, H);
  const base = H - 3;
  // 몸통 (하늘빛 판자)
  for (let y = 20; y <= base - 1; y++) for (let x = 4; x < W - 4; x++) g.set(x, y, (x - 4) % 6 === 0 ? ROOF_BLUE.lo : ROOF_BLUE.mid);
  // 창구 (과자·음료)
  g.rect(9, 26, W - 18, 14, RAMP.wood[3]);
  for (let k = 0; k < 6; k++) g.rect(11 + k * 7, 29, 5, 4, [0xe85a3a, 0xf2c444, 0xf8f0e0, 0x7ab85a][k % 4]);
  for (let k = 0; k < 6; k++) g.rect(11 + k * 7, 35, 5, 3, [0xd8a060, 0xe8d8a8][k % 2]);
  g.rect(6, 40, W - 12, 3, DECK.mid);
  g.hline(6, W - 7, 40, DECK.hi);
  // 차양 (빨강·흰 줄무늬)
  for (let y = 14; y < 22; y++) for (let x = 1; x < W - 1; x++) g.set(x, y, Math.floor(x / 5) % 2 ? (y > 19 ? 0xf0e4d4 : 0xfff8ee) : y > 19 ? 0xf0c878 : 0xf8dc8c);
  for (let x = 1; x < W - 1; x += 2) g.set(x, 22, Math.floor(x / 5) % 2 ? 0xf0e4d4 : 0xf0c878);
  // 지붕 위 간판 (11/16 글씨는 위에 뜨는 이름표 — 판에는 아이스크림 그림)
  g.rect(12, 2, W - 24, 11, 0xfff8ee);
  for (const [ix, c] of [[W / 2 - 8, 0xf8a8a0], [W / 2 + 2, 0x9edcd0]] as const) {
    g.ellipse(ix + 3, 5.5, 2.6, 2.2, c);
    for (let k = 0; k < 4; k++) g.hline(ix + 1 + (k >> 1), ix + 5 - (k >> 1), 7 + k, 0xe8c08a);
  }
  frame(g, 11, 1, W - 22, 13, PAINT.line);
  softOutline(g);
  shadow(g, W / 2, base + 1, W / 2 - 3, 2, 56);
  return g;
}

// ── 오두막 터 (울타리 친 빈 터) ── 그림 원점 = 왼쪽 위 (터 사각형에서 (-2, -LOT_RISE))
export const LOT_RISE = 10;
export const LOT_ART_W = SEA_LOT_W + 4;
export const LOT_ART_H = SEA_LOT_H + LOT_RISE + 4;
/** 앞 울타리 줄 (그림 y) — 이 아래를 앞 depth로 한 번 더 그려요 */
export const LOT_FRONT_Y = LOT_RISE + SEA_LOT_H - 16;
export function lotArt(n: number): Grid {
  const W = LOT_ART_W;
  const H = LOT_ART_H;
  const g = new Grid(W, H);
  const ox = 2;
  const top = LOT_RISE; // 뒤 울타리 받침 줄
  const bot = LOT_RISE + SEA_LOT_H - 2; // 앞 울타리 받침 줄
  const gx0 = ox + SEA_LOT_W / 2 - SEA_LOT_GATE_W / 2;
  const gx1 = gx0 + SEA_LOT_GATE_W;
  const post = (x: number, y: number, tall = 9) => {
    g.rect(x - 1, y - tall, 3, tall + 1, DRIFTWOOD.mid);
    g.vline(x - 1, y - tall, y, DRIFTWOOD.hi);
    g.set(x, y - tall - 1, DRIFTWOOD.hi);
  };
  const rail = (x0: number, x1: number, y: number) => {
    g.hline(x0, x1, y - 6, PAINT.mid);
    g.hline(x0, x1, y - 3, PAINT.lo);
  };
  // 뒤·앞 가로 울타리
  rail(ox, ox + SEA_LOT_W - 1, top);
  for (let x = ox; x <= ox + SEA_LOT_W; x += 12) post(Math.min(x, ox + SEA_LOT_W - 1), top);
  rail(ox, gx0, bot);
  rail(gx1, ox + SEA_LOT_W - 1, bot);
  for (let x = ox; x <= gx0; x += 12) post(x, bot);
  for (let x = gx1; x <= ox + SEA_LOT_W; x += 12) post(Math.min(x, ox + SEA_LOT_W - 1), bot);
  post(gx0, bot, 12);
  post(gx1, bot, 12);
  // 옆 울타리 (위에서 내려다본 세로 줄)
  for (const x of [ox, ox + SEA_LOT_W - 1]) {
    for (let y = top; y <= bot; y++) g.set(x, y - 4, (y - top) % 12 === 0 ? DRIFTWOOD.lo : PAINT.lo);
    for (let y = top; y <= bot; y += 12) post(x, y, 6);
  }
  // 출입구 기둥 번호 패
  g.rect(gx1 + 2, bot - 12, 9, 8, 0xf4ecd8);
  frame(g, gx1 + 2, bot - 12, 9, 8, DRIFTWOOD.line);
  drawNumber(g, n, gx1 + 5, bot - 11, 0x4a3a2a);
  // 말뚝 줄 (오두막 자리 표시 — 뒤쪽 4칸)
  for (const [x, y] of [
    [ox + 16, top + 14],
    [ox + SEA_LOT_W - 16, top + 14],
    [ox + 16, top + 62],
    [ox + SEA_LOT_W - 16, top + 62],
  ]) {
    g.rect(x, y - 3, 2, 4, DRIFTWOOD.lo);
    g.set(x, y - 4, 0xe85a3a); // 측량 깃
  }
  for (let x = ox + 17; x < ox + SEA_LOT_W - 16; x += 2) {
    g.set(x, top + 13, 0xe8e0c8);
    g.set(x, top + 61, 0xe8e0c8);
  }
  for (let y = top + 14; y < top + 61; y += 2) {
    g.set(ox + 16, y, 0xe8e0c8);
    g.set(ox + SEA_LOT_W - 16, y, 0xe8e0c8);
  }
  softOutline(g);
  return g;
}

/** 「분양 준비 중」 팻말 (글씨는 SeaMap) */
export const LOT_SIGN_W = 46;
export const LOT_SIGN_H = 30;
/** 팻말 판 가운데 (받침 기준 y) */
export const LOT_SIGN_TEXT_DY = -18;
export function lotSignArt(): Grid {
  const W = LOT_SIGN_W;
  const H = LOT_SIGN_H;
  const g = new Grid(W, H);
  const base = H - 3;
  g.rect(8, 12, 2, base - 12, DRIFTWOOD.lo);
  g.rect(W - 10, 12, 2, base - 12, DRIFTWOOD.lo);
  g.rect(2, 2, W - 4, 14, 0xfff8ee);
  frame(g, 1, 1, W - 2, 16, DRIFTWOOD.line);
  g.hline(2, W - 3, 15, 0xeee0cc);
  // 11/16 글씨는 위에 뜨는 이름표 — 판에는 작은 집과 분홍 띠
  houseIcon(g, W / 2 - 4, 4, ROOF_PEACH.lo, 0xf2eadc);
  g.hline(5, W / 2 - 8, 9, 0xf8b8a0);
  g.hline(W / 2 + 8, W - 6, 9, 0xf8b8a0);
  softOutline(g);
  shadow(g, W / 2, base + 1, W / 2 - 6, 1.2, 50);
  return g;
}

// ── 선착장 ──
/** 판자 바닥 (가로 판자, 걷는 방향과 엇갈려요). 원점 = 왼쪽 위 (SEA_PIER) */
export function pierArt(): Grid {
  const W = SEA_PIER.w;
  const H = SEA_PIER.h;
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++) {
    const k = y % 6;
    for (let x = 0; x < W; x++) {
      let c: Color = k === 5 ? DECK.line : k === 0 ? DECK.hi : hashU(x, y, 51) < 0.05 ? DECK.lo : DECK.mid;
      if (x < 2 || x >= W - 2) c = x === 0 || x === W - 1 ? DECK.line : DECK.lo;
      if ((k === 2 || k === 3) && (x === 4 || x === W - 5)) c = 0xb0a4a8; // 못
      g.set(x, y, c);
    }
  }
  return g;
}
export function pierEndArt(): Grid {
  const W = SEA_PIER_END.w;
  const H = SEA_PIER_END.h + 6;
  const g = new Grid(W, H);
  for (let y = 0; y < H - 6; y++) {
    const k = y % 6;
    for (let x = 0; x < W; x++) {
      let c: Color = k === 5 ? DECK.line : k === 0 ? DECK.hi : hashU(x, y, 53) < 0.05 ? DECK.lo : DECK.mid;
      if (x < 2 || x >= W - 2) c = DECK.lo;
      g.set(x, y, c);
    }
  }
  // 앞 테 (두께 + 물에 젖은 아래)
  g.rect(0, H - 6, W, 3, DECK.lo);
  g.rect(0, H - 3, W, 3, 0xb09078);
  for (let x = 3; x < W; x += 12) g.rect(x, H - 6, 3, 6, 0xa48468);
  softOutline(g);
  return g;
}
/** 말뚝 (갈매기가 앉아요) */
export function postArt(): Grid {
  const g = new Grid(8, 14);
  g.rect(2, 3, 4, 9, DRIFTWOOD.mid);
  g.vline(2, 3, 11, DRIFTWOOD.hi);
  g.vline(5, 3, 11, DRIFTWOOD.lo);
  g.ellipse(4, 3, 2.2, 1.3, DRIFTWOOD.hi);
  g.hline(2, 5, 7, 0xc8b070); // 밧줄
  g.hline(2, 5, 8, 0xa08850);
  g.rect(2, 10, 4, 2, 0x9ac8b8); // 물이끼
  softOutline(g);
  return g;
}

// ── 방파제 ──
/** 콘크리트 몸통 (위에서 본 길쭉한 판, 이음매). 원점 = 왼쪽 위 (SEA_BREAKWATER) */
export function breakwaterArt(): Grid {
  const W = SEA_BREAKWATER.w;
  const H = SEA_BREAKWATER.h;
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c: Color = hashU(x >> 1, y >> 1, 61) < 0.12 ? CONCRETE.lo : hashU(x, y, 62) > 0.93 ? CONCRETE.hi : CONCRETE.mid;
      if (y % 32 === 0) c = CONCRETE.line;
      if (x < 3) c = x === 0 ? CONCRETE.line : CONCRETE.hi;
      if (x >= W - 3) c = x === W - 1 ? CONCRETE.line : CONCRETE.lo;
      g.set(x, y, c);
    }
  // 가운데 노란 안전선
  for (let y = 4; y < H; y += 10) g.rect(W / 2 - 1, y, 2, 5, 0xf8dc8c);
  return g;
}
/** 끝 데크 (등대가 서는 넓은 판). 원점 = 왼쪽 위 (SEA_BREAKWATER_TIP) */
export function tipArt(): Grid {
  const W = SEA_BREAKWATER_TIP.w;
  const H = SEA_BREAKWATER_TIP.h + 6;
  const g = new Grid(W, H);
  for (let y = 0; y < H - 6; y++)
    for (let x = 0; x < W; x++) {
      let c: Color = hashU(x >> 1, y >> 1, 63) < 0.12 ? CONCRETE.lo : CONCRETE.mid;
      if ((x - 2) % 24 === 0 || (y - 2) % 24 === 0) c = CONCRETE.line;
      if (x < 2 || y < 2) c = CONCRETE.hi;
      if (x >= W - 2) c = CONCRETE.lo;
      g.set(x, y, c);
    }
  g.rect(0, H - 6, W, 3, CONCRETE.lo);
  g.rect(0, H - 3, W, 3, 0xa4b4c4); // 젖은 아랫단
  for (let x = 2; x < W; x += 5) g.set(x, H - 2, 0x9ac8b8);
  softOutline(g);
  return g;
}
/** 테트라포드 (다리 넷 콘크리트 덩어리) */
export function tetraArt(v: number): Grid {
  const g = new Grid(20, 18);
  const c = mix(CONCRETE.mid, 0x9a9890, v * 0.3);
  const legs: [number, number][] = v === 0 ? [[-6, 3], [6, 3], [0, -6], [0, 5]] : v === 1 ? [[-7, -1], [7, 1], [-2, -6], [3, 6]] : [[-5, 4], [7, -2], [-3, -5], [2, 6]];
  for (const [dx, dy] of legs) line(g, 10, 9, 10 + dx, 9 + dy, c, 3);
  for (const [dx, dy] of legs) g.ellipse(10 + dx, 9 + dy, 2, 1.6, lighten(c, 0.15));
  g.ellipse(10, 9, 3, 2.5, c);
  g.recolor((x, y) => !g.filled(x, y + 1), darken(c, 0.25));
  g.recolor((x, y) => y > 13 && hashU(x, y, v) < 0.4, 0x9ac8b8); // 물이끼
  softOutline(g);
  return g;
}

// ── 등대 (흰·빨강 줄무늬, 위에 등실) ──
export const LIGHTHOUSE_ART_W = 44;
export const LIGHTHOUSE_ART_H = 104;
export function lighthouseArt(): Grid {
  const W = LIGHTHOUSE_ART_W;
  const H = LIGHTHOUSE_ART_H;
  const g = new Grid(W, H);
  const base = H - 3;
  const cx = W / 2;
  const towerTop = 26;
  // 탑 (아래가 넓어요). 줄무늬 띠
  for (let y = towerTop; y <= base; y++) {
    const k = (y - towerTop) / (base - towerTop);
    const half = 8 + k * 7;
    const band = Math.floor((y - towerTop) / 13) % 2 === 1;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const rel = (x - cx) / half;
      const baseC: Color = band ? RAMP.roofC[2] : RAMP.wall[0];
      g.set(x, y, rel < -0.55 ? lighten(baseC, 0.15) : rel > 0.45 ? darken(baseC, 0.22) : baseC);
    }
  }
  // 문 (아래 가운데) · 작은 창
  g.rect(cx - 4, base - 13, 8, 13, RAMP.glass[3]);
  g.ellipse(cx, base - 13, 4, 2, RAMP.glass[3]);
  g.set(cx + 2, base - 7, 0xe8c070);
  g.rect(cx - 2, towerTop + 22, 4, 5, RAMP.glass[3]);
  g.rect(cx - 2, towerTop + 48, 4, 5, RAMP.glass[3]);
  // 전망대 난간
  g.rect(cx - 13, towerTop - 2, 26, 3, RAMP.rock[4]);
  for (let x = cx - 12; x <= cx + 12; x += 3) g.vline(x, towerTop - 7, towerTop - 2, RAMP.rock[4]);
  g.hline(cx - 13, cx + 13, towerTop - 7, RAMP.rock[3]);
  // 등실 (유리) + 지붕
  g.rect(cx - 7, towerTop - 16, 14, 10, 0xfff2b8);
  g.vline(cx - 2, towerTop - 16, towerTop - 7, 0x8a8a7a);
  g.vline(cx + 3, towerTop - 16, towerTop - 7, 0x8a8a7a);
  g.rect(cx - 3, towerTop - 13, 5, 5, 0xffd860);
  for (let y = 0; y < 8; y++) g.hline(Math.round(cx - 2 - y), Math.round(cx + 1 + y), towerTop - 25 + y, y < 2 ? RAMP.roofC[1] : RAMP.roofC[3]);
  g.set(cx, towerTop - 27, RAMP.rock[4]);
  g.set(cx, towerTop - 26, RAMP.rock[4]);
  softOutline(g);
  shadow(g, cx + 1, base + 1, 16, 2.4, 62);
  return g;
}

// ── 낚싯배 (묶여 있어요, 왼쪽을 봐요) ──
export const BOAT_ART_W = 84;
export const BOAT_ART_H = 44;
export function boatArt(): Grid {
  const W = BOAT_ART_W;
  const H = BOAT_ART_H;
  const g = new Grid(W, H);
  const water = H - 6;
  // 선체 (뱃머리 왼쪽으로 솟음)
  for (let y = 24; y <= water + 2; y++) {
    const k = (y - 24) / (water + 2 - 24);
    const x0 = Math.round(4 + k * k * 12 + (y < 28 ? (28 - y) * -0.5 : 0));
    const x1 = Math.round(W - 6 - k * 6);
    for (let x = x0; x <= x1; x++) g.set(x, y, y < 27 ? RAMP.wall[0] : y < 29 ? RAMP.towel[2] : pick(RAMP.hull, (y - 29) / Math.max(1, water - 29) * 0.9 + (x < x0 + 2 || x > x1 - 2 ? 0.25 : 0), x, y));
  }
  // 뱃전 위 테
  g.hline(3, W - 6, 23, RAMP.rock[4]);
  // 조타실
  g.rect(42, 8, 24, 16, RAMP.wall[0]);
  g.rect(42, 6, 26, 3, RAMP.towel[2]);
  for (let k = 0; k < 3; k++) g.rect(45 + k * 7, 12, 5, 5, RAMP.glass[2]);
  g.vline(66, 9, 23, 0xb4aa98);
  // 돛대·안테나·깃발
  g.vline(30, 0, 23, RAMP.trunk[2]);
  g.hline(24, 36, 8, RAMP.trunk[2]);
  g.rect(31, 1, 6, 4, 0xe8c040);
  g.vline(60, 0, 6, RAMP.rock[4]);
  // 그물 더미·부표 (갑판 앞)
  g.ellipse(18, 21, 6, 2.5, 0x6a8a6a);
  g.ellipse(14, 20, 1.6, 1.6, 0xf08a3a);
  g.ellipse(22, 20, 1.6, 1.6, 0xf08a3a);
  // 배 이름 자리 (흰 칸)
  g.rect(70, 30, 8, 3, 0xf2eee6);
  // 물가 거품 줄
  for (let x = 6; x < W - 4; x++) if (hashU(x, 1, 71) < 0.65) g.set(x, water + 3, 0xe8f6f4, 200);
  softOutline(g);
  return g;
}
export function buoyArt(): Grid {
  const g = new Grid(10, 14);
  g.vline(5, 0, 5, RAMP.rock[4]);
  g.set(5, 0, 0xffe080);
  g.ellipse(5, 8, 4, 3.6, 0xd8443a);
  g.hline(2, 8, 7, 0xf2eee6);
  g.set(3, 6, 0xf08a7a);
  softOutline(g);
  for (let x = 1; x < 10; x++) if (x % 2) g.set(x, 13, 0xe8f6f4, 180);
  return g;
}

// ── 갯바위 (따개비·미역) ──
export function rockArt(i: number): Grid {
  const R = SEA_ROCKS[i];
  const W = Math.ceil(R.rx * 2) + 10;
  const H = Math.ceil(R.ry * 2) + 22;
  const g = new Grid(W, H);
  const r = rng(1300 + i * 17);
  const cx = W / 2;
  const base = H - 5;
  // 11/16 시안 rock: 둥근 덩어리 둘셋을 빛(왼쪽 위)으로 단계 나눔, 테는 연하게
  const rr = Math.min(R.rx, R.ry * 1.6);
  const circles: [number, number, number][] = [
    [cx - R.rx * 0.2, base - rr * 0.9, rr * 0.95],
    [cx + R.rx * 0.45, base - rr * 0.7, rr * 0.72],
    [cx - R.rx * 0.65, base - rr * 0.55, rr * 0.55],
  ];
  if (r() < 0.6) circles.push([cx + R.rx * 0.1, base - rr * 1.3, rr * 0.55]);
  blobPaint(g, circles, RAMP.rock, true, i * 13);
  // 젖은 아래 끝 (물이끼 대신 옅은 민트 몇 점)
  for (let x = 0; x < W; x++) for (let y = base - 3; y <= base; y++) if (g.filled(x, y) && hashU(x, y, i + 3) < 0.25) g.set(x, y, RAMP.roofM[2]);
  softOutline(g);
  shadow(g, cx + 2, base + 1, R.rx + 2, 3, 60);
  return g;
}
/** 족욕 바위: 물웅덩이를 품은 납작 바위 고리 (앉기는 다음 차수) */
export function footbathArt(): Grid {
  const g = new Grid(52, 26);
  g.ellipse(26, 13, 24, 10, BASALT.mid);
  g.ellipse(26, 11, 22, 8, BASALT.hi);
  g.ellipse(26, 12, 14, 5.5, 0x8adcd8);
  g.ellipse(24, 11, 8, 2.5, 0xc4f2ec);
  g.recolor((x, y) => y > 18, BASALT.lo);
  for (let k = 0; k < 10; k++) g.set(8 + k * 4, 6 + (k % 3), 0xe8e0d0);
  softOutline(g);
  return g;
}

// ── 소품 ──
export function lampArt(): Grid {
  const g = new Grid(10, 40);
  const base = 37;
  g.rect(4, 10, 2, base - 10, 0x8a90b0);
  g.rect(3, base - 2, 4, 3, 0x8a90b0);
  g.rect(2, 3, 6, 7, 0x8a90b0);
  g.rect(3, 4, 4, 5, 0xfff4c8);
  g.rect(1, 2, 8, 2, 0x6e74a0);
  g.set(5, 1, 0x6e74a0);
  softOutline(g);
  shadow(g, 5, base + 1, 3, 1, 60);
  return g;
}
export function cratesArt(): Grid {
  const g = new Grid(22, 18);
  const box = (x: number, y: number, c: Color) => {
    g.rect(x, y, 10, 6, c);
    g.hline(x, x + 9, y, lighten(c, 0.2));
    g.vline(x + 9, y, y + 5, darken(c, 0.25));
    g.hline(x + 1, x + 8, y + 1, 0xb4c8d0); // 생선
  };
  box(1, 9, 0x3e7aa8);
  box(11, 9, 0xd8a050);
  box(6, 3, 0x3e7aa8);
  softOutline(g);
  shadow(g, 11, 16, 10, 1.2, 56);
  return g;
}
/** 그물 말리는 틀 (기둥 둘 + 늘어진 그물 + 주황 뜸) */
export function netRackArt(): Grid {
  const W = 56;
  const H = 32;
  const g = new Grid(W, H);
  const base = H - 3;
  for (const x of [3, W - 5]) {
    g.rect(x, 4, 3, base - 4, DRIFTWOOD.mid);
    g.vline(x, 4, base - 1, DRIFTWOOD.hi);
  }
  g.hline(3, W - 3, 5, DRIFTWOOD.lo);
  for (let x = 6; x < W - 5; x++) {
    const sag = Math.sin(((x - 6) / (W - 11)) * Math.PI) * 6;
    const bot = Math.round(16 + sag);
    for (let y = 6; y <= bot; y++) if ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) g.set(x, y, 0x5a7a6a);
    if (x % 8 === 2) g.ellipse(x, bot + 1, 1.6, 1.4, 0xf08a3a);
  }
  softOutline(g);
  shadow(g, W / 2, base + 1, W / 2 - 3, 1.2, 50);
  return g;
}

/** 빛 번짐 (가산 섞기용 부드러운 원) */
export function glowArt(size: number, color: Color, power = 1.6): Grid {
  const g = new Grid(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c;
      if (d >= 1) continue;
      g.set(x, y, color, Math.round(255 * (1 - d) ** power));
    }
  return g;
}

// ── 갈매기 (16×12 한 칸, 6프레임) ── 0 날개 위 · 1 활공 · 2 날개 아래 · 3 앉음 · 4 앉아 고개 돌림 · 5 날아오르기
export const GULL_W = 16;
export const GULL_H = 12;
export const GULL_FRAMES = 6;
export function gullArt(): ArtOut {
  const g = new Grid(GULL_W * GULL_FRAMES, GULL_H);
  const white = 0xf6f4ee;
  const grey = 0xb8bcc0;
  const tipC = 0x2e3034;
  const beak = 0xf0c040;
  for (let f = 0; f < GULL_FRAMES; f++) {
    const ox = f * GULL_W;
    if (f <= 2) {
      // 나는 모습 (몸은 가운데, 날개 각도만 바뀌어요)
      g.ellipse(ox + 8, 7, 3.2, 1.6, white);
      g.set(ox + 11, 6, white);
      g.set(ox + 12, 6, beak);
      const wy = f === 0 ? -4 : f === 1 ? 0 : 3;
      line(g, ox + 7, 6, ox + 2, 6 + wy, grey);
      line(g, ox + 9, 6, ox + 14, 6 + wy, grey);
      g.set(ox + 1, 6 + wy, tipC);
      g.set(ox + 15, 6 + wy, tipC);
      g.set(ox + 2, 6 + wy, tipC);
      g.set(ox + 14, 6 + wy, tipC);
      g.set(ox + 5, 7, white);
    } else {
      // 앉은 모습 (옆모습, 오른쪽을 봐요)
      g.ellipse(ox + 7, 7, 4, 2.4, white);
      g.ellipse(ox + 6, 6.5, 3, 1.4, grey); // 등 날개
      g.hline(ox + 3, ox + 4, 6, tipC); // 꽁지 끝 검정
      const hx = f === 4 ? ox + 9 : ox + 10;
      g.ellipse(hx, 4, 1.8, 1.6, white);
      g.set(f === 4 ? hx - 1 : hx + 1, 3, tipC); // 눈
      g.set(f === 4 ? hx - 2 : hx + 2, 4, beak);
      g.set(ox + 6, 10, beak);
      g.set(ox + 8, 10, beak);
      if (f === 5) {
        line(g, ox + 6, 6, ox + 2, 1, grey);
        line(g, ox + 8, 6, ox + 12, 1, grey);
      }
    }
  }
  g.outline(0x3a3c40);
  return { grid: g, frameW: GULL_W, frameH: GULL_H };
}

// ── 물 (SeaMap이 물가 선에 맞춰 위치만 옮겨요) ──
// 11/16 사용자 참고 그림의 톤: 밝고 맑은 하늘빛 물. 깊이에 따라 가로 띠(얕은 물 → 연한 바다 → 바다 → 짙은 파랑)로 나뉘고
// 띠 사이는 픽셀 디더로 섞어요. 어두운 물결 무늬는 없애고 밝은 물결 줄만 드문드문 (진흙빛·회색 없이)
export const SEA_PAL = {
  deep: 0x3b95e3,
  sea: 0x6ac7ff,
  light: 0x95e5ff,
  shallow: 0xcef3ff,
  foam: 0xeefbff,
  wetSand: 0xeddcbe,
  sand: 0xf7e8cf,
  lightSand: 0xfdefd8,
} as const;
const WATER: { body: Color; deep: Color; light: Color; foam: Color } = { body: SEA_PAL.sea, deep: SEA_PAL.deep, light: SEA_PAL.light, foam: SEA_PAL.foam };
/**
 * 물 몸통 타일: 가로 256 × 세로 512. 세로는 반복하지 않아요 — 줄 = 물가 선(물때)에서 잰 깊이 + WATER_ROW0.
 * 11/16 시안: 아홉 단계(RAMP.water)로 물가 연한 아쿠아 → 먼바다 차분한 파랑, 단계 사이는 순서 디더, 얼룩은 가로로 이어지는 값 잡음.
 * 가로는 256마다 이어지게 (잡음도 주기를 맞춰 이음새 세로 줄이 없어요). SeaMap이 tilePositionY를 맞춰요
 */
export const WATER_TILE_W = 256;
export const WATER_TILE_H = 512;
/** 물가 선 바로 위로 밀려온 물(파도)도 담게 깊이 0을 이 줄에 둬요 */
export const WATER_ROW0 = 64;
/** 물가에서 깊이(px) → 물 색 (시안: 0.1 + 깊이/62 — 시안 1px = 월드 4px) */
function waterBand(x: number, depth: number): Color {
  const n = fbm(x / 64, depth * 0.02, 4) - 0.5;
  return pick(RAMP.water, Math.min(1, Math.max(0, 0.1 + depth / 248 + n * 0.18)), x, depth);
}
export function waterArt(): Grid {
  const g = new Grid(WATER_TILE_W, WATER_TILE_H);
  for (let y = 0; y < WATER_TILE_H; y++) for (let x = 0; x < WATER_TILE_W; x++) g.set(x, y, waterBand(x, y - WATER_ROW0));
  // 밝은 물결 줄 (짧은 가로 줄, 바탕을 흰색 쪽으로 28%)
  const r = rng(1001);
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(r() * WATER_TILE_W);
    const y = WATER_ROW0 + 40 + Math.floor(r() * (WATER_TILE_H - WATER_ROW0 - 40));
    const len = 8 + Math.floor(r() * 20);
    for (let k = 0; k < len; k++) {
      const xx = (x + k) % WATER_TILE_W;
      g.set(xx, y, mix(waterBand(xx, y - WATER_ROW0), 0xffffff, 0.28));
    }
  }
  return g;
}
/**
 * 11/16 시안 저녁 물: 노을 하늘이 비쳐요 — 물가 라벤더 (172,150,226) → 가운데 분홍 (242,146,186) → 먼바다 주황 (255,166,100).
 * 밝기는 낮 물빛의 밝기를 살려(0.62 + l·0.48) 물결이 보이고, 원래 색은 8%만 남겨요. 아주 밝은 거품은 분홍빛 흰색
 */
export function duskOf(c: Color, depth: number): Color {
  const r0 = (c >> 16) & 255;
  const g0 = (c >> 8) & 255;
  const b0 = c & 255;
  const l = (r0 * 0.3 + g0 * 0.55 + b0 * 0.15) / 255;
  if (l > 0.9) return (Math.round(r0 * 0.4 + 255 * 0.6) << 16) | (Math.round(g0 * 0.4 + 225 * 0.6) << 8) | Math.round(b0 * 0.4 + 220 * 0.6);
  const f = Math.max(0, Math.min(1, depth / 240));
  const sky = f < 0.5 ? [172 + 70 * f * 2, 150 - 4 * f * 2, 226 - 40 * f * 2] : [242 + 13 * (f - 0.5) * 2, 146 + 20 * (f - 0.5) * 2, 186 - 86 * (f - 0.5) * 2];
  const v = 0.62 + l * 0.48;
  const k = 0.08;
  const r = Math.min(255, Math.round(sky[0] * v * (1 - k) + r0 * k));
  const g = Math.min(255, Math.round(sky[1] * v * (1 - k) + g0 * 0.8 * k));
  const b = Math.min(255, Math.round(sky[2] * v * (1 - k) + b0 * 0.75 * k));
  return (r << 16) | (g << 8) | b;
}
/** 저녁 물 몸통 (낮 물 그림을 노을빛으로 옮겨요 — 줄마다 깊이가 달라요) */
export function duskWaterArt(): Grid {
  const day = waterArt();
  const g = new Grid(WATER_TILE_W, WATER_TILE_H);
  for (let y = 0; y < WATER_TILE_H; y++)
    for (let x = 0; x < WATER_TILE_W; x++) {
      const v = day.get(x, y);
      if ((v & 255) === 0) continue;
      g.set(x, y, duskOf(v >>> 8, y - WATER_ROW0), v & 255);
    }
  return g;
}
/** 저녁 물가 거품 띠 (거품은 분홍빛 흰색, 얕은 물은 라벤더) */
export function duskFoamArt(): Grid {
  const day = foamArt();
  const g = new Grid(FOAM_W, FOAM_H);
  for (let y = 0; y < FOAM_H; y++)
    for (let x = 0; x < FOAM_W; x++) {
      const v = day.get(x, y);
      if ((v & 255) === 0) continue;
      g.set(x, y, duskOf(v >>> 8, Math.max(0, y - 14)), v & 255);
    }
  return g;
}
/** 11/16 저녁 해가 비친 금빛 짧은 물결 줄 (ADD, 가운데가 밝게) 12×2 */
export function goldStreakArt(): Grid {
  const g = new Grid(12, 2);
  for (let x = 0; x < 12; x++) {
    const a = Math.round(255 * Math.min(1, 1.4 * Math.sin(((x + 0.5) / 12) * Math.PI)));
    g.set(x, 0, 0xffd68c, a);
    g.set(x, 1, 0xffc878, Math.round(a * 0.55));
  }
  return g;
}

/**
 * 물가 거품 띠 (가로로 이어 붙는 128px, 세로 48). 위 끝은 고르지 않은 거품 덩어리·구멍 난 레이스(구멍으로 모래가 보여요),
 * 그 아래 흰 물빛 → 얕은 물(아주 옅은 하늘빛) → 아래로 디더하며 투명해져 물 몸통과 섞여요
 */
export const FOAM_W = 128;
export const FOAM_H = 48;
/** 거품 위 끝이 이만큼 아래부터 (SeaMap이 물가 선에서 이만큼 위에 띠를 놓아요) */
export const FOAM_TOP = 6;
export function foamProfile(x: number): number {
  const a = (x / FOAM_W) * Math.PI * 2;
  const blob = hashU(x >> 3, 0, 86) * 3 + hashU(x >> 1, 1, 86) * 1.2;
  return Math.round(FOAM_TOP - 1 + 2.2 * Math.sin(a * 3) + 1.4 * Math.sin(a * 7 + 1) + blob - 2);
}
export function foamArt(): Grid {
  const g = new Grid(FOAM_W, FOAM_H);
  for (let x = 0; x < FOAM_W; x++) {
    const p = Math.max(0, foamProfile(x));
    for (let y = p; y < FOAM_H; y++) {
      const d = y - p;
      // 11/16 시안: 거품 머리는 가장 밝은 물빛(water[0]), 그 아래 레이스(water[0..1])가 잡음 따라 부서지고, 사이는 얕은 물(water[1..2])
      const lace = fbm(x / 32, y * 0.11, 4);
      if (d < 3) g.set(x, y, RAMP.water[0]);
      else if (lace > 0.5 + d * 0.009 && d < 28) g.set(x, y, d < 8 ? RAMP.water[0] : pick(RAMP.water, 0.02 + d * 0.003, x, y));
      else if (d < 14) g.set(x, y, pick(RAMP.water, 0.06 + d * 0.008, x, y));
    }
  }
  return g;
}
/** 물러난 거품 자국 (구멍 난 가는 레이스 줄, 128 × 6) */
export function laceArt(): Grid {
  const g = new Grid(FOAM_W, 6);
  for (let x = 0; x < FOAM_W; x++) {
    const y = Math.round(2.5 + 1.6 * Math.sin((x / FOAM_W) * Math.PI * 2 * 5 + 2) + (hashU(x >> 2, 0, 85) - 0.5) * 1.5);
    if (hashU(x, 1, 85) < 0.7) g.set(x, Math.max(0, Math.min(5, y)), RAMP.water[0], 235);
    if (hashU(x, 2, 85) < 0.3) g.set(x, Math.max(0, Math.min(5, y + 1)), RAMP.water[1], 180);
  }
  return g;
}
/** 11/16 파도가 쓸고 간 젖은 윤기 (시안: 젖은 모래 단계 위에 water[1] 물빛 점 — 32×32 타일, 조각마다 이어 깔아요) */
export function sheenWetArt(): Grid {
  const g = new Grid(32, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      g.set(x, y, pick(RAMP.wet, 0.25 + fbm(x / 8, y / 8, 4) * 0.4, x, y), 150);
      if (fbm(x / 4, y / 3, 8) > 0.66) g.set(x, y, RAMP.water[1], 210);
    }
  return g;
}
/** 젖은 모래 띠 (세로 그라데이션: 위는 투명, 아래로 짙게 — 높이로 늘려 써요) */
export function wetArt(): Grid {
  const g = new Grid(4, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 4; x++) g.set(x, y, RAMP.wet[1], Math.round(140 * (y / 31) ** 1.3));
  return g;
}
/** 먼바다 반짝임 (투명 바탕에 밝은 물결 조각) */
export function shimmerArt(): Grid {
  const g = new Grid(128, 64);
  const r = rng(1401);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * 128);
    const y = Math.floor(r() * 64);
    const w = 3 + Math.floor(r() * 6);
    for (let k = 0; k < w; k++) g.set((x + k) % 128, y, 0xf0fcff, k === 0 || k === w - 1 ? 120 : 190);
  }
  return g;
}
export function sprayArt(): Grid {
  const g = new Grid(12, 10);
  const r = rng(1501);
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI;
    const d = r() * 5;
    g.set(Math.round(6 + Math.cos(a) * d), Math.round(8 - Math.sin(a) * d * 1.4), WATER.foam, 200 + Math.floor(r() * 55));
  }
  g.ellipse(6, 8, 3, 1.4, WATER.foam, 180);
  return g;
}
export function sparkleArt(): Grid {
  const g = new Grid(5, 5);
  g.set(2, 0, 0xffffff, 160);
  g.set(2, 4, 0xffffff, 160);
  g.set(0, 2, 0xffffff, 160);
  g.set(4, 2, 0xffffff, 160);
  g.rect(1, 1, 3, 3, 0xf0fcff, 220);
  g.set(2, 2, 0xffffff);
  return g;
}

/** 11/16 햇빛 반짝임 (십자 별, ADD로 겹쳐요) 9×9 */
export function starArt(): Grid {
  const g = new Grid(9, 9);
  for (let k = 0; k <= 4; k++) {
    const a = 255 - k * 48;
    for (const [x, y] of [[4 + k, 4], [4 - k, 4], [4, 4 + k], [4, 4 - k]] as const) g.set(x, y, 0xffffff, a);
  }
  for (const [x, y] of [[3, 3], [5, 3], [3, 5], [5, 5]] as const) g.set(x, y, 0xfffbe8, 120);
  return g;
}
/** 11/16 밤 물가 물빛 (작고 둥근 빛 점, ADD) 7×7 */
export function glowDotArt(): Grid {
  const g = new Grid(7, 7);
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const d = Math.hypot(x - 3, y - 3) / 3.5;
      if (d < 1) g.set(x, y, 0xffffff, Math.round(255 * (1 - d) ** 1.8));
    }
  return g;
}
/** 11/16 물 위를 천천히 지나가는 빛 띠 (가로로 부드럽게, 위 끝은 흐리게) 64×32 */
export function sheenArt(): Grid {
  const g = new Grid(64, 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 64; x++) {
      const bell = Math.exp(-(((x - 31.5) / 16) ** 2));
      const top = Math.min(1, y / 6);
      g.set(x, y, 0xffffff, Math.round(255 * bell * top));
    }
  return g;
}
/** 11/16 먼바다 깊이 그늘 (위는 투명, 아래로 청록·연보라) 4×64 */
export function depthShadeArt(): Grid {
  const g = new Grid(4, 64);
  for (let y = 0; y < 64; y++) {
    const k = y / 63;
    const c = mix(0x6cc4d0, 0x8a9ee6, k);
    for (let x = 0; x < 4; x++) g.set(x, y, c, Math.round(170 * k ** 1.3));
  }
  return g;
}

// ── 바닥 (덩어리마다 RGBA로 굽는다) ──

export const SEA_CHUNK = 512;



function put(d: Uint8ClampedArray, i: number, c: Color, a = 255): void {
  d[i] = (c >> 16) & 255;
  d[i + 1] = (c >> 8) & 255;
  d[i + 2] = c & 255;
  d[i + 3] = a;
}

/** 버스 정차 칸 (정류장 앞 길, 오른쪽에서 들어온 버스 몸이 서는 자리) */
const BAY = { x0: SEA_BUS_STOP.x - 30, x1: SEA_BUS_STOP.x + 98, y0: SEA_ROAD.y + 6, y1: SEA_ROAD.y + SEA_ROAD.h - 5 };

/**
 * 바닥 한 점 색. 11/16 사용자 확정 시안: 선 없이 단계(RAMP) + 4×4 순서 디더 + 낮은 주파수 얼룩 (마을 모닥불 둘레 바닥처럼 부드럽게).
 * 시안은 1px = 월드 4px 크기라 얼룩 주파수를 1/4로 맞췄어요
 */
function groundColor(x: number, y: number, k: SeaGround): Color {
  switch (k) {
    case "hill": {
      // 뒤 언덕: 짙은 잎빛 풀 (나무가 그 위에 서요)
      return pick(RAMP.leaf, 0.3 + fbm(x * 0.02, y * 0.03) * 0.55, x, y);
    }
    case "platform": {
      // 정류장 승강장: 밝은 돌 판 (판 이음은 한 단계 진하게, 아래 연석은 밝게)
      if (y >= SEA_PLATFORM.y + SEA_PLATFORM.h - 3) return RAMP.rock[0];
      const seam = x % 16 === 0 || y % 12 === 0;
      return pick(RAMP.rock, 0.05 + fbm(x * 0.05, y * 0.05) * 0.25 + (seam ? 0.25 : 0), x, y);
    }
    case "road": {
      if (y < SEA_ROAD.y + 3 || y > SEA_ROAD.y + SEA_ROAD.h - 3) return pick(RAMP.rock, 0.05, x, y); // 연석
      let c = pick(RAMP.road, 0.2 + ((y - SEA_ROAD.y) / SEA_ROAD.h) * 0.5 + (fbm(x * 0.05, y * 0.05) - 0.5) * 0.4, x, y);
      if (x >= BAY.x0 && x <= BAY.x1 && y >= BAY.y0 && y <= BAY.y1) {
        const onEdge = y <= BAY.y0 + 1 || y >= BAY.y1 - 1 ? (x >> 2) % 2 === 0 : x <= BAY.x0 + 1 || x >= BAY.x1 - 1;
        if (onEdge) c = RAMP.umbY[1];
        return c;
      }
      const mid = SEA_ROAD.y + Math.floor(SEA_ROAD.h / 2);
      if ((y === mid || y === mid + 1) && (x >> 3) % 2 === 0) c = RAMP.wall[0];
      return c;
    }
    case "path":
      return pick(RAMP.sand, 0.3 + fbm(x * 0.02, y * 0.02) * 0.45, x, y);
    case "yard":
      return pick(RAMP.sand, 0.12 + fbm(x * 0.015, y * 0.02) * 0.45, x, y);
    case "lot":
      return pick(RAMP.sand, 0.45 + fbm(x * 0.02, y * 0.025) * 0.45, x, y);
    case "boardwalk": {
      const top = SEA_BOARDWALK.y;
      const plank = (x + (y - top > SEA_BOARDWALK.h / 2 ? 12 : 0)) % 36 === 0;
      return pick(RAMP.wood, 0.15 + ((y - top) / SEA_BOARDWALK.h) * 0.45 + (plank ? 0.35 : 0) + (fbm(x * 0.075, y * 0.25) - 0.5) * 0.2, x, y);
    }
    case "sand": {
      const toFlat = SEA_FLAT_Y0 - y;
      // 갯벌 바로 앞은 젖은 모래 (위로 갈수록 마른 모래로 디더)
      if (toFlat < 28) return pick(RAMP.wet, (1 - toFlat / 28) * 0.9 + (fbm(x * 0.05, y * 0.075) - 0.5) * 0.3, x, y);
      return pick(RAMP.sand, 0.12 + fbm(x * 0.009, y * 0.0125) * 0.6 + (y < SEA_SAND_Y0 + 12 ? 0.25 : 0), x, y);
    }
    case "pool": {
      const d = poolDepth(x, y);
      if (d < 0.18) return pick(RAMP.wet, 0.6, x, y); // 젖은 테두리
      return pick(RAMP.water, 0.05 + d * 0.35 + (fbm(x * 0.1, y * 0.1) - 0.5) * 0.1, x, y);
    }
    case "flat": {
      // 드러난 갯벌: 젖은 모래 단계, 큰 얼룩 + 아주 옅은 물결 자국
      const ry = y + Math.round(3 * Math.sin(x * 0.05 + y * 0.013));
      return pick(RAMP.wet, 0.15 + fbm(x * 0.012, y * 0.02) * 0.6 + (ry % 12 === 0 && fbm(x * 0.03, y * 0.03) > 0.5 ? 0.1 : 0) + Math.max(0, (y - (SEA_DEEP_Y - 30)) / 30) * 0.3, x, y);
    }
    case "deep":
      return RAMP.water[7];
    case "grass":
    default: {
      // 풀밭: 남쪽(산책로 쪽)은 모래가 섞여요
      const sandy = Math.max(0, (y - 330) / 60);
      if (sandy > 0 && fbm(x * 0.03, y * 0.03) < sandy * 0.6) return pick(RAMP.sand, 0.4, x, y);
      return pick(RAMP.grass, 0.15 + fbm(x * 0.015, y * 0.0225) * 0.75 + (y > SEA_BOARDWALK.y - 6 ? 0.2 : 0), x, y);
    }
  }
}

/** 바닥 덩어리 RGBA (SEA_CHUNK × SEA_CHUNK) */
export function seaGroundPixels(cx: number, cy: number, size = SEA_CHUNK): Uint8ClampedArray {
  const steps = seaGroundSteps(cx, cy, size);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** 바닥 덩어리를 줄 묶음(band줄)마다 멈추며 굽는다 (seaPrebake — 버스 창밖 연출 동안 조금씩). 끝나면 RGBA를 돌려준다 */
export function* seaGroundSteps(cx: number, cy: number, size = SEA_CHUNK, band = 32): Generator<void, Uint8ClampedArray> {
  const out = new Uint8ClampedArray(size * size * 4);
  const ox = cx * size;
  const oy = cy * size;
  const w = Math.max(0, Math.min(size, SEA_WIDTH - ox));
  const h = Math.max(0, Math.min(size, SEA_HEIGHT - oy));
  const hw = Math.ceil(w / 2);
  const kinds: SeaGround[] = new Array(hw * Math.ceil(h / 2));
  const step = Math.max(2, band & ~1);
  for (let y0 = 0; y0 < h; y0 += step) {
    const y1 = Math.min(h, y0 + step);
    for (let y = y0; y < y1; y += 2) for (let x = 0; x < w; x += 2) kinds[(y >> 1) * hw + (x >> 1)] = seaGroundKind(ox + x, oy + y);
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < w; x++) {
        // 경계 칸(언덕·길·산책로·갯벌 가장자리)은 2px 칸 대신 그 점의 종류로 (가로줄이 계단지지 않게)
        let k = kinds[(y >> 1) * hw + (x >> 1)];
        if (k === "boardwalk" || k === "road" || k === "platform" || k === "deep" || k === "pool") k = seaGroundKind(ox + x, oy + y);
        put(out, (y * size + x) * 4, groundColor(ox + x, oy + y, k));
      }
    yield;
  }
  // 갯벌 구멍 (다음 차수 캐기 자리 — 물이 빠지면 드러나요)
  for (const hpt of SEA_DIG_HOLES)
    for (let y = -4; y <= 4; y++)
      for (let x = -6; x <= 6; x++) {
        const d = (x / 5.5) ** 2 + (y / 3.2) ** 2;
        if (d > 1) continue;
        const px = Math.round(hpt.x + x - ox);
        const py = Math.round(hpt.y + y - oy);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        // 11/16 파스텔: 구멍도 옅은 회보라로 (예전엔 짙은 갈색 점이 지저분해 보였어요)
        put(out, (py * size + px) * 4, d > 0.6 ? (y < 0 ? RAMP.wet[2] : RAMP.wet[0]) : RAMP.wet[3]);
      }
  return out;
}
