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
  SEA_PIER,
  SEA_PIER_END,
  SEA_PIER_ARM,
  SEA_LOTS,
  SEA_PONTOON,
  SEA_PONTOON_RAMP,
  SEA_ROAD,
  SEA_ROAD_LOOP,
  SEA_ROCKS,
  SEA_SAND_Y0,
  SEA_WIDTH,
} from "@tomb/protocol";
import { darken, Grid, lighten, mix, rng, type Color } from "../sprites/pixel";
import type { SeaLot } from "@tomb/protocol";
import { hashU, pathEdgeDist, poolDepth, seaGroundKind, SEA_PLATFORM, type SeaGround } from "./seaLayout";
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
// 11/16 r17 사용자: 테두리가 "따로 놀지" 않게 — 한 가지 짙은 선 대신 물건마다 제 색에서 나온 테두리 (닿은 칸의 가장 짙은 색을
// 한 단계 더 짙고 살짝 따뜻하게). 건물·나무·구조물은 조금 더 또렷하게, 바위·백사장 소품은 더 부드럽게. 테두리 칸은 불투명도 254로 표시해요
const SOFT_EDGE = 0x5a463a;
const LIGHT_EDGE = 0x8a7464;
const TONE_STRONG = 0.42;
const TONE_SOFT = 0.3;
/** 제 색 테두리 (빈 칸 중 몸에 닿은 칸만, 가장 짙은 이웃 색 → 더 짙게 + 따뜻하게) */
export function toneOutline(g: Grid, k = TONE_STRONG): void {
  const W = g.w;
  const H = g.h;
  const src = g.px.slice();
  const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.55 + (c & 255) * 0.15;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if ((src[y * W + x] & 255) !== 0) continue;
      let best = -1;
      let bl = 1e9;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const v = src[ny * W + nx];
        if ((v & 255) < 200) continue;
        const c = v >>> 8;
        const l = lum(c);
        if (l < bl) {
          bl = l;
          best = c;
        }
      }
      if (best < 0) continue;
      const out = mix(mix(best, 0x000000, k), 0x4a2e22, 0.25);
      g.px[y * W + x] = ((out << 8) | 254) >>> 0;
    }
}
function softOutline(g: Grid, light = false): void {
  toneOutline(g, light ? TONE_SOFT : TONE_STRONG);
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
  mat: (v: number) => `${P}mat${v}`,
  parasol: (v: number) => `${P}parasol${v}`,
  lounger: `${P}lounger`,
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
  keeper: `${P}keeper`,
  boat: `${P}boat`,
  buoy: `${P}buoy`,
  rock: (i: number) => `${P}rock${i}`,
  rockFoam: (i: number) => `${P}rockFoam${i}`,
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
  mailbox: `${P}mailbox`,
  /** 11/16 r12 피크닉 탁자(상판·긴 의자 판) · 모닥불(낮엔 꺼진 장작) · 통나무 · 끝 걸터앉기 방석 */
  picnicTop: `${P}picnicTop`,
  picnicPlank: `${P}picnicPlank`,
  ashLogs: `${P}ashLogs`,
  driftLog: `${P}driftLog`,
  cushion: (v: number) => `${P}cushion${v}`,
  /** 11/16 r13 바다 놀거리: 튜브(색 다섯) · 제트스키(옆·앞·뒤) · 물살 자국 */
  tube: (v: number) => `${P}tube${v}`,
  jetski: (d: "side" | "front" | "back", v: number) => `${P}jetski-${d}${v}`,
  wake: `${P}wake`,
  /** 11/16 r15 먼바다 배 (유조선·컨테이너선) · 오징어잡이배 · 등불 물빛 기둥 */
  ship: (k: "tanker" | "cargo") => `${P}ship-${k}`,
  shipReflect: (k: "tanker" | "cargo" | "fishing") => `${P}shipReflect-${k}`,
  squid: `${P}squid`,
  squidLamps: `${P}squidLamps`,
  lightColumn: `${P}lightColumn`,
  pontoon: `${P}pontoon`,
  pierArm: `${P}pierArm`,
  pontoonRamp: `${P}pontoonRamp`,
  stone: (v: number) => `${P}stone${v}`,
  crab: `${P}crab`,
  ledge: `${P}ledge`,
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
      // r16 바닥에 닿은 그림자를 조금 더 진하게 (물건이 땅에 앉아 보이게)
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x3e4060, Math.min(150, Math.round(a * 1.0 * (1 - (dx * dx + dy * dy) * 0.5))));
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
  softOutline(g, true);
  return g;
}

export function driftArt(): Grid {
  const g = new Grid(26, 8);
  line(g, 2, 5, 23, 3, DRIFTWOOD.mid, 2);
  line(g, 2, 4, 23, 2, DRIFTWOOD.hi);
  line(g, 16, 3, 20, 0, DRIFTWOOD.lo);
  softOutline(g, true);
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
  softOutline(g, true);
  shadow(g, 21, 16, 19, 1.4, 56);
  return g;
}

// ── 11/16 쉴거리 (해변 벤치는 benchArt) ──
/** 돗자리 (줄무늬 천, 가장자리 술). v: 0 = 하늘 줄무늬, 1 = 노랑, 2 = 분홍. 원점 = 가운데 아래 */
export const MAT_W = 44;
export const MAT_H = 26;
export function matArt(v: number): Grid {
  const g = new Grid(MAT_W + 4, MAT_H + 4);
  const ramp = v === 0 ? RAMP.towel : v === 1 ? RAMP.umbY : RAMP.umbC;
  for (let y = 2; y < MAT_H + 2; y++)
    for (let x = 2; x < MAT_W + 2; x++) {
      const stripe = ((x - 2) >> 3) % 2 === 0;
      // 아래로 갈수록(앞) 조금 밝게, 줄무늬는 흰 천과 번갈아
      g.set(x, y, stripe ? ramp[y > MAT_H - 2 ? 2 : y < 6 ? 0 : 1] : y > MAT_H - 2 ? RAMP.wall[2] : RAMP.wall[0]);
    }
  // 앞뒤 술
  for (let x = 3; x < MAT_W + 2; x += 2) {
    g.set(x, 1, ramp[2]);
    g.set(x, MAT_H + 2, ramp[2]);
  }
  softOutline(g, true);
  shadow(g, (MAT_W + 4) / 2, MAT_H + 2, MAT_W / 2, 1.2, 40);
  return g;
}
/** 파라솔 (줄무늬 갓 + 기둥). 갓과 기둥 아래를 따로 그려요 (사람 위로 갓이 덮이게). 원점 = 기둥 밑 */
export const PARASOL_W = 52;
export const PARASOL_H = 46;
/** 갓 그림 높이 (이 아래는 기둥 — SeaMap이 갓·기둥을 다른 depth로 나눠 그려요) */
export const PARASOL_CANOPY_H = 19;
export function parasolArt(v: number): Grid {
  const g = new Grid(PARASOL_W, PARASOL_H);
  const cx = PARASOL_W / 2;
  const base = PARASOL_H - 2;
  // 기둥
  g.rect(cx - 1, 12, 2, base - 12, RAMP.wall[2]);
  g.vline(cx - 1, 12, base - 1, RAMP.wall[0]);
  // 갓: 위가 둥근 넓은 반원, 여덟 쪽 줄무늬 (두 색 번갈아), 아래 끝은 물결 술
  const ramp = v === 0 ? RAMP.umbC : RAMP.umbY;
  for (let y = 2; y < 18; y++)
    for (let x = 1; x < PARASOL_W - 1; x++) {
      const dx = (x + 0.5 - cx) / (cx - 1);
      const dy = (y - 15) / 13;
      if (dx * dx + dy * dy > 1 || y > 15 + (x % 6 < 3 ? 1 : 0)) continue;
      const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / Math.PI) * 8) % 2;
      const light = 1 - (dx * -0.5 + dy * -0.6 + 0.4);
      g.set(x, y, seg ? pick(ramp, 0.15 + light * 0.5, x, y) : pick(RAMP.wall, 0.1 + light * 0.4, x, y));
    }
  g.rect(cx - 1, 0, 2, 3, RAMP.wall[1]);
  fabricFolds(g, { x0: 1, y0: 2, x1: PARASOL_W - 2, y1: 17 }, PARASOL_W / 8, 0.07);
  softOutline(g, true);
  shadow(g, cx, base + 1, 4, 1, 60);
  return g;
}
/** 선베드 (뒤가 비스듬히 선 흰 나무 침대, 머리는 위, 발은 바다 쪽 아래). 원점 = 가운데 아래 */
export const LOUNGER_W = 22;
export const LOUNGER_H = 44;
export function loungerArt(): Grid {
  const g = new Grid(LOUNGER_W, LOUNGER_H);
  const x0 = 3;
  const x1 = LOUNGER_W - 4;
  // 등받이 (위 14줄, 조금 세워져 짧아 보여요)
  for (let y = 2; y < 15; y++) for (let x = x0; x <= x1; x++) g.set(x, y, (y & 1) === 0 ? RAMP.wall[0] : RAMP.wall[2]);
  g.hline(x0, x1, 15, RAMP.wood[3]);
  // 누운 판 (가로 판자)
  for (let y = 16; y < LOUNGER_H - 6; y++) for (let x = x0; x <= x1; x++) g.set(x, y, (y - 16) % 4 === 3 ? RAMP.wall[2] : RAMP.wall[0]);
  // 다리
  for (const [x, y] of [
    [x0, LOUNGER_H - 6],
    [x1 - 1, LOUNGER_H - 6],
    [x0, 15],
    [x1 - 1, 15],
  ])
    g.rect(x, y, 2, 3, RAMP.wood[4]);
  // 수건 한 장 (하늘빛)
  g.rect(x0 + 2, 18, x1 - x0 - 3, 10, RAMP.towel[0]);
  g.hline(x0 + 2, x1 - 2, 27, RAMP.towel[2]);
  fabricFolds(g, { x0: x0 + 2, y0: 18, x1: x1 - 2, y1: 27 }, 6, 0.08);
  softOutline(g, true);
  shadow(g, LOUNGER_W / 2, LOUNGER_H - 3, LOUNGER_W / 2, 1.6, 50);
  return g;
}

/** 11/16 등대지기: 남색 선원 모자·노란 비옷의 작은 할아버지 (16 × 24, 원점 가운데 아래) */
export function keeperArt(): Grid {
  const g = new Grid(16, 24);
  // 비옷
  g.rect(3, 11, 10, 11, RAMP.umbY[1]);
  g.vline(3, 12, 21, RAMP.umbY[0]);
  g.vline(12, 12, 21, RAMP.umbY[2]);
  g.hline(5, 10, 15, RAMP.umbY[2]);
  // 얼굴·흰 수염
  g.rect(4, 5, 8, 6, 0xf4d8bc);
  g.rect(4, 9, 8, 3, RAMP.wall[0]);
  g.set(6, 7, 0x3a3440);
  g.set(9, 7, 0x3a3440);
  // 선원 모자
  g.rect(3, 2, 10, 3, 0x2f3f6a);
  g.hline(2, 13, 5, 0x24304f);
  g.set(8, 3, RAMP.umbY[0]);
  // 장화
  g.rect(4, 22, 3, 2, 0x3a3440);
  g.rect(9, 22, 3, 2, 0x3a3440);
  softOutline(g);
  shadow(g, 8, 23, 6, 1.2, 50);
  return g;
}

// ── 포구 부동산 ── 작은 나무 사무소. 받침 = 문 앞 계단 (SEA_REALTY.y)
export const REALTY_ART_W = 60; // r16 마을 분양 사무소와 같은 크기
export const REALTY_ART_H = 54;
export const REALTY_SIGN = { dx: 0, dy: -50 } as const;
/**
 * 11/16 r16 사용자 "바닷가 부동산이 다른 게임 같아요" → 마을 분양 사무소(sprites/worldProps officeHut)와 같은 그림·크기·문·간판 (60 × 54).
 * 바닷가 느낌은 지붕 색만 바다빛 (짙은 청록). 테두리는 마을과 같은 짙은 1px
 */
export function realtyArt(): Grid {
  const W = REALTY_ART_W;
  const H = REALTY_ART_H;
  const g = new Grid(W, H);
  // r17 테두리는 제 색에서 (아래 toneOutline)
  const wall = { hi: 0xd9d0bc, mid: 0xc2b89f, lo: 0x9e957f };
  const roof = { hi: 0x4f8478, mid: 0x3d6a62, lo: 0x2c4f4a };
  g.rect(6, 24, 48, 26, wall.mid);
  g.rect(6, 24, 48, 2, wall.hi);
  g.rect(50, 24, 4, 26, wall.lo);
  g.rect(6, 47, 48, 3, 0x7a705c);
  for (let y = 0; y < 12; y++) {
    const inset = Math.max(0, 10 - y);
    g.hline(2 + inset, 57 - inset, 12 + y, y < 3 ? roof.hi : y < 9 ? roof.mid : roof.lo);
  }
  for (let x = 6; x < 56; x += 5) g.vline(x, 15, 22, roof.lo);
  // 간판 (작은 집 셋 — 분양 사무소처럼)
  g.rect(16, 4, 28, 9, 0x2f3a44);
  g.rect(17, 5, 26, 7, 0x3e4c58);
  for (const x of [20, 25, 30, 35]) g.rect(x, 7, 3, 3, 0xe8e0c8);
  g.vline(18, 13, 14, 0x2f3a44);
  g.vline(41, 13, 14, 0x2f3a44);
  // 문
  g.rect(25, 33, 10, 17, 0x6e5238);
  g.rect(26, 34, 8, 15, 0x8e6e4e);
  g.rect(28, 36, 4, 4, 0xbfdde8);
  g.set(33, 42, 0xf3d36b);
  // 창 (불빛)
  for (const x of [11, 40]) {
    g.rect(x, 30, 9, 8, 0x52402c);
    g.rect(x + 1, 31, 7, 6, 0xffd98a);
    g.vline(x + 4, 31, 36, 0x52402c);
    g.hline(x + 1, x + 7, 33, 0x52402c);
  }
  // 우편함
  g.rect(52, 40, 4, 4, 0xb85a4a);
  g.vline(54, 44, 49, 0x6e5238);
  toneOutline(g, TONE_STRONG);
  shadow(g, 30, 51.5, 27, 1.6, 70);
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
  planks(g, { x0: 4, y0: 20, x1: W - 5, y1: base - 1 }, 6, true, 40, 3);
  // 창구 (과자·음료)
  g.rect(9, 26, W - 18, 14, RAMP.wood[3]);
  for (let k = 0; k < 6; k++) g.rect(11 + k * 7, 29, 5, 4, [0xe85a3a, 0xf2c444, 0xf8f0e0, 0x7ab85a][k % 4]);
  for (let k = 0; k < 6; k++) g.rect(11 + k * 7, 35, 5, 3, [0xd8a060, 0xe8d8a8][k % 2]);
  g.rect(6, 40, W - 12, 3, DECK.mid);
  g.hline(6, W - 7, 40, DECK.hi);
  // 차양 (빨강·흰 줄무늬)
  for (let y = 14; y < 22; y++) for (let x = 1; x < W - 1; x++) g.set(x, y, Math.floor(x / 5) % 2 ? (y > 19 ? 0xf0e4d4 : 0xfff8ee) : y > 19 ? 0xf0c878 : 0xf8dc8c);
  for (let x = 1; x < W - 1; x += 2) g.set(x, 22, Math.floor(x / 5) % 2 ? 0xf0e4d4 : 0xf0c878);
  fabricFolds(g, { x0: 1, y0: 14, x1: W - 2, y1: 22 }, 10, 0.07);
  // 지붕 위 간판 (11/16 글씨는 위에 뜨는 이름표 — 판에는 아이스크림 그림)
  g.rect(12, 2, W - 24, 11, 0xfff8ee);
  for (const [ix, c] of [[W / 2 - 8, 0xf8a8a0], [W / 2 + 2, 0x9edcd0]] as const) {
    g.ellipse(ix + 3, 5.5, 2.6, 2.2, c);
    for (let k = 0; k < 4; k++) g.hline(ix + 1 + (k >> 1), ix + 5 - (k >> 1), 7 + k, 0xe8c08a);
  }
  frame(g, 11, 1, W - 22, 13, PAINT.line);
  softOutline(g, true);
  shadow(g, W / 2, base + 1, W / 2 - 3, 2, 56);
  return g;
}

// ── 오두막 터 (울타리 친 빈 터) ── 그림 원점 = 왼쪽 위 (터 사각형에서 (-2, -LOT_RISE)).
// 11/16 터마다 크기·출입구 쪽·울타리(나무 울타리·밧줄·생울타리)·바다 쪽 데크가 달라요 (protocol SEA_LOTS)
export const LOT_RISE = 10;
export function lotArtSize(l: SeaLot): { w: number; h: number; front: number } {
  return { w: l.w + 4, h: l.h + LOT_RISE + 4, front: LOT_RISE + l.h - 16 };
}
export function lotArt(l: SeaLot): Grid {
  const { w: W, h: H } = lotArtSize(l);
  const g = new Grid(W, H);
  const ox = 2;
  const top = LOT_RISE; // 뒤 울타리 받침 줄
  const bot = LOT_RISE + l.h - 2; // 앞 울타리 받침 줄
  const x0 = ox;
  const x1 = ox + l.w - 1;
  const G = SEA_LOT_GATE_W;
  const gx0 = ox + l.w / 2 - G / 2;
  const gx1 = gx0 + G;
  const gy0 = top + l.h / 2 - G / 2;
  const gy1 = gy0 + G;
  const r = rng(1600 + l.n * 31);
  // 바다 쪽 데크 (앞 22px 안쪽 판자 — 바다를 봐요)
  if (l.deck)
    for (let y = bot - 24; y < bot - 3; y++)
      for (let x = x0 + 6; x <= x1 - 6; x++) g.set(x, y, pick(RAMP.wood, 0.15 + ((y - (bot - 24)) / 21) * 0.4 + ((x - x0) % 12 === 0 ? 0.3 : 0), x, y));
  // 울타리 한 변 (가로: y 고정, 세로: x 고정). 출입구 자리는 비워요
  const post = (x: number, y: number, tall: number) => {
    for (let k = 0; k <= tall; k++) {
      g.set(x - 1, y - k, RAMP.wood[1]);
      g.set(x, y - k, RAMP.wood[2]);
      g.set(x + 1, y - k, RAMP.wood[3]);
    }
  };
  const hedge = (cx: number, cy: number) =>
    blobPaint(
      g,
      [
        [cx, cy - 4, 4.6],
        [cx + 3, cy - 3, 3.4],
      ],
      RAMP.leaf,
      true,
      cx * 0.3 + cy,
    );
  const run = (ax: number, ay: number, bx: number, by: number) => {
    const horiz = ay === by;
    const len = horiz ? bx - ax : by - ay;
    if (len <= 0) return;
    if (l.fence === "hedge") {
      for (let k = 0; k <= len; k += 6) hedge(horiz ? ax + k : ax, horiz ? ay : ay + k);
      return;
    }
    const step = l.fence === "picket" ? 6 : 16;
    if (horiz) {
      if (l.fence === "picket") {
        g.hline(ax, bx, ay - 5, RAMP.wood[1]);
        g.hline(ax, bx, ay - 2, RAMP.wood[2]);
      } else for (let x = ax; x <= bx; x++) g.set(x, ay - 5 + Math.round(Math.sin(((x - ax) % step) / step * Math.PI) * 1.5), 0xc9b48f);
      for (let x = ax; x <= bx; x += step) post(Math.min(x, bx), ay, l.fence === "picket" ? 7 : 9);
      post(bx, ay, l.fence === "picket" ? 7 : 9);
    } else {
      for (let y = ay; y <= by; y++) g.set(ax, y - 4, l.fence === "picket" ? RAMP.wood[2] : 0xc9b48f);
      for (let y = ay; y <= by; y += step) post(ax, y, l.fence === "picket" ? 5 : 7);
      post(ax, by, 5);
    }
  };
  // 뒤
  run(x0, top, x1, top);
  // 왼쪽·오른쪽 (서·동 출입구면 가운데를 비워요)
  if (l.gate === "w") {
    run(x0, top, x0, gy0);
    run(x0, gy1, x0, bot);
  } else run(x0, top, x0, bot);
  if (l.gate === "e") {
    run(x1, top, x1, gy0);
    run(x1, gy1, x1, bot);
  } else run(x1, top, x1, bot);
  // 앞 (남 출입구면 가운데를 비워요)
  if (l.gate === "s") {
    run(x0, bot, gx0, bot);
    run(gx1, bot, x1, bot);
  } else run(x0, bot, x1, bot);
  // 출입구 기둥 (조금 높게) + 번호 패
  const gp: [number, number][] = l.gate === "s" ? [[gx0, bot], [gx1, bot]] : l.gate === "e" ? [[x1, gy0], [x1, gy1]] : [[x0, gy0], [x0, gy1]];
  for (const [x, y] of gp) post(x, y, 11);
  const [nx, ny] = l.gate === "s" ? [gx1 + 3, bot - 12] : l.gate === "e" ? [x1 - 13, gy1 + 2] : [x0 + 4, gy1 + 2];
  g.rect(nx, ny, 9, 8, RAMP.wall[0]);
  frame(g, nx, ny, 9, 8, DRIFTWOOD.line);
  drawNumber(g, l.n, nx + 3, ny + 1, RAMP.trunk[2]);
  // 말뚝 줄 (오두막 자리 표시 — 데크 뒤쪽)
  const sx0 = x0 + 16;
  const sx1 = x1 - 16;
  const sy0 = top + 12;
  const sy1 = l.deck ? bot - 28 : bot - 14;
  for (const [x, y] of [
    [sx0, sy0],
    [sx1, sy0],
    [sx0, sy1],
    [sx1, sy1],
  ]) {
    g.rect(x, y - 3, 2, 4, DRIFTWOOD.lo);
    g.set(x, y - 4, RAMP.roofC[2]); // 측량 깃
  }
  for (let x = sx0 + 1; x < sx1; x += 2) {
    g.set(x, sy0 - 1, RAMP.wall[1]);
    g.set(x, sy1 - 1, RAMP.wall[1]);
  }
  for (let y = sy0; y < sy1; y += 2) {
    g.set(sx0, y, RAMP.wall[1]);
    g.set(sx1, y, RAMP.wall[1]);
  }
  // 갯그령 몇 포기 (울타리 안 모서리)
  for (let k = 0; k < 3; k++) {
    const x = Math.round(x0 + 6 + r() * (l.w - 12));
    const y = Math.round(top + 6 + r() * 8);
    for (let j = 0; j < 4; j++) g.set(x + (j - 1), y - (j % 2) - 1, RAMP.leaf[2 + (j % 2)]);
  }
  softOutline(g);
  return g;
}

/** 11/16 오두막 단지 함께 쓰는 우편함 (나무 기둥 + 하늘빛 통) */
export function mailboxArt(): Grid {
  const g = new Grid(12, 20);
  const base = 17;
  g.rect(5, 8, 2, base - 8, RAMP.wood[2]);
  g.vline(5, 8, base - 1, RAMP.wood[1]);
  g.rect(1, 2, 10, 7, RAMP.towel[1]);
  g.hline(1, 10, 2, RAMP.towel[0]);
  g.hline(1, 10, 8, RAMP.towel[2]);
  g.rect(9, 0, 1, 4, RAMP.roofC[2]); // 깃발
  g.rect(10, 0, 2, 2, RAMP.roofC[2]);
  softOutline(g);
  shadow(g, 6, base + 1, 5, 1.2, 50);
  return g;
}
/** 11/16 갯바위 낚시 발판 (넓적한 바위 턱 32×16 — 위가 평평하고 물에 젖은 아래 끝) */
export function ledgeArt(): Grid {
  const g = new Grid(34, 18);
  blobPaint(
    g,
    [
      [10, 9, 7],
      [18, 8, 8],
      [26, 9.5, 6.5],
    ],
    RAMP.rock,
    true,
    71,
  );
  for (let x = 0; x < 34; x++) for (let y = 13; y < 17; y++) if (g.filled(x, y) && hashU(x, y, 72) < 0.3) g.set(x, y, RAMP.roofM[2]);
  softOutline(g, true);
  return g;
}
/** 11/16 디딤돌 (둥근 납작 돌) */
export function stoneArt(v: number): Grid {
  const g = new Grid(14, 9);
  blobPaint(g, [[7, 4.5, v ? 4.5 : 3.8], [v ? 9 : 5, 5, 3]], RAMP.rock, true, v * 5);
  return g;
}
/** 11/16 갯바위 게 (작은 코럴빛 게) */
export function crabArt(): Grid {
  const g = new Grid(12, 8);
  g.ellipse(6, 5, 3.4, 2.2, RAMP.roofC[2]);
  g.hline(4, 7, 4, RAMP.roofC[1]);
  for (const x of [1, 2, 9, 10]) g.set(x, 6, RAMP.roofC[3]);
  g.set(2, 2, RAMP.roofC[3]);
  g.set(9, 2, RAMP.roofC[3]);
  g.set(1, 1, RAMP.roofC[2]);
  g.set(10, 1, RAMP.roofC[2]);
  g.set(5, 3, 0x3a3440);
  g.set(7, 3, 0x3a3440);
  softOutline(g, true);
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
  planks(g, { x0: 2, y0: 0, x1: W - 3, y1: H - 1 }, 6, false, 36, 5);
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
/** 11/16 r15 선착장 서쪽 낚시 가지 (끝 데크와 같은 판자 — 가로 판, 남쪽 앞 테). 원점 왼쪽 위 */
export function pierArmArt(): Grid {
  const W = SEA_PIER_ARM.w;
  const H = SEA_PIER_ARM.h + 5;
  const g = new Grid(W, H);
  for (let y = 0; y < H - 5; y++) {
    const k = y % 6;
    for (let x = 0; x < W; x++) g.set(x, y, k === 5 ? DECK.line : k === 0 ? DECK.hi : hashU(x, y, 57) < 0.05 ? DECK.lo : DECK.mid);
  }
  g.rect(0, H - 5, W, 3, DECK.lo);
  g.rect(0, H - 2, W, 2, 0xb09078);
  planks(g, { x0: 0, y0: 0, x1: W - 1, y1: H - 6 }, 6, false, 30, 9);
  softOutline(g);
  return g;
}
/** 11/16 r14 부잔교 (물에 뜬 발판 — 선착장보다 한 단계 짙은 판자 + 양옆 파란 부표 통). 원점 왼쪽 위 */
export function pontoonArt(): Grid {
  const W = SEA_PONTOON.w;
  const H = SEA_PONTOON.h + 4;
  const g = new Grid(W + 4, H);
  for (let y = 0; y < H - 4; y++) {
    const k = y % 7;
    for (let x = 2; x < W + 2; x++) {
      const grain = hashU(x >> 2, y, 61) < 0.12 && k !== 6;
      g.set(x, y, k === 6 ? DECK.line : k === 0 ? DECK.mid : grain ? DECK.lo : mix(DECK.mid, DECK.lo, 0.35));
    }
  }
  // 물에 잠긴 아래 테 · 양옆 부표 통 (하늘색)
  g.rect(2, H - 4, W, 2, DECK.lo);
  g.rect(2, H - 2, W, 2, 0x9ac8c8);
  for (let y = 6; y < H - 6; y += 22) {
    g.rect(0, y, 2, 10, 0x8ec8e8);
    g.rect(W + 2, y, 2, 10, 0x6aa8d0);
  }
  softOutline(g);
  return g;
}
/** 부잔교 다리 (선착장 몸통 → 부잔교, 가로 판자 + 난간 줄). 원점 왼쪽 위 */
export function pontoonRampArt(): Grid {
  const W = SEA_PONTOON_RAMP.w;
  const H = SEA_PONTOON_RAMP.h + 3;
  const g = new Grid(W, H);
  for (let y = 0; y < H - 3; y++) for (let x = 0; x < W; x++) g.set(x, y, x % 6 === 5 ? DECK.line : y === 0 ? DECK.hi : DECK.mid);
  g.rect(0, H - 3, W, 3, DECK.lo);
  for (let x = 0; x < W; x++) {
    g.set(x, 0, 0xc8b070);
    g.set(x, H - 4, 0xc8b070);
  }
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
  stoneBlocks(g, { x0: 3, y0: 0, x1: W - 4, y1: H - 1 }, 14, 8, 1);
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
  stoneBlocks(g, { x0: 2, y0: 2, x1: W - 3, y1: H - 7 }, 16, 9, 2);
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
  softOutline(g, true);
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
  softOutline(g, true);
  for (let x = 1; x < 10; x++) if (x % 2) g.set(x, 13, 0xe8f6f4, 180);
  return g;
}

// ── 갯바위 (따개비·미역) ──
/**
 * 11/16 r16 사용자 "갯바위가 다 비슷해요 — 훨씬 다양하게": 바위마다(번호로 정해지는 씨앗) 모양 종류가 달라요.
 *  둥근 바위(boulder) · 높은 바위 기둥(stack) · 넓적한 판바위(slab) · 뾰족한 바위(jagged) · 틈이 갈라진 무더기(cluster)
 *  그 위에 물때 젖은 띠(아래쪽 짙게) · 따개비 · 삿갓조개 · 미역 · 금 · 둘레 자갈. 색은 지금 바닷가 단계(RAMP.rock) 그대로.
 *  r16 사용자 "바위가 잘려요": 그림 높이를 모양에 맞춰 넉넉히 (위가 잘리지 않게)
 */
export type RockKind = "boulder" | "stack" | "slab" | "jagged" | "cluster";
export function rockKindOf(i: number): RockKind {
  const R = SEA_ROCKS[i];
  const h = hashU(i, 7, 5);
  if (R.small) return h < 0.4 ? "boulder" : h < 0.7 ? "cluster" : "slab";
  return h < 0.24 ? "boulder" : h < 0.42 ? "stack" : h < 0.6 ? "slab" : h < 0.8 ? "jagged" : "cluster";
}
/** 열 높이 그림 (뾰족·판바위): top(x) 위로 빛은 왼쪽 위 */
function profilePaint(g: Grid, x0: number, x1: number, base: number, top: (x: number) => number, salt: number): void {
  const w = Math.max(1, x1 - x0);
  for (let x = Math.floor(x0); x <= x1; x++) {
    const t = top(x);
    if (t >= base) continue;
    const u = (x - x0) / w;
    for (let y = Math.floor(t); y <= base; y++) {
      const v = (y - t) / Math.max(1, base - t);
      // 면 나눔: 몇 칸마다 세로 결 (각진 면)
      const facet = hashU(Math.floor((x + salt) / 5), 0, 91 + salt) * 0.25;
      let light = 0.18 + u * 0.45 + v * 0.25 + facet + (fbm(x * 0.3 + salt, y * 0.3) - 0.5) * 0.3;
      if (y - t < 1.2) light -= 0.18; // 윗면 빛
      g.set(x, y, pick(RAMP.rock, Math.max(0, Math.min(1, light)), x, y));
    }
  }
}
export function rockArt(i: number): Grid {
  const R = SEA_ROCKS[i];
  const kind = rockKindOf(i);
  const r = rng(1300 + i * 17);
  const rr = Math.min(R.rx, R.ry * 1.6);
  const tall = kind === "stack" ? rr * 2.2 : kind === "jagged" ? rr * 1.7 : kind === "slab" ? R.ry * 1.4 : kind === "cluster" ? rr * 1.5 : rr * 2;
  const W = Math.ceil(R.rx * 2) + 14;
  const H = Math.ceil(Math.max(R.ry * 2 + 22, tall + 14));
  const g = new Grid(W, H);
  const cx = W / 2;
  const base = H - 5;
  if (kind === "boulder") {
    const circles: [number, number, number][] = [
      [cx - R.rx * 0.2, base - rr * 0.9, rr * 0.95],
      [cx + R.rx * 0.45, base - rr * 0.7, rr * 0.72],
      [cx - R.rx * 0.65, base - rr * 0.55, rr * 0.55],
    ];
    if (r() < 0.6) circles.push([cx + R.rx * 0.1, base - rr * 1.3, rr * 0.55]);
    blobPaint(g, circles, RAMP.rock, true, i * 13);
  } else if (kind === "stack") {
    // 높이 선 바위 기둥: 각진 기둥(층층이 턱진 윗면) + 밑동 곁 바위 — 둥근 덩어리를 쌓지 않아요
    const ledges = [0.62 + r() * 0.1, 0.8 + r() * 0.1, 1];
    profilePaint(g, cx - R.rx * 0.75, cx + R.rx * 0.75, base, (x) => {
      const u = (x - cx) / (R.rx * 0.75);
      const a = Math.abs(u + 0.1);
      const step = a < 0.3 ? ledges[2] : a < 0.6 ? ledges[1] : ledges[0];
      const fall = a > 0.85 ? (a - 0.85) / 0.15 : 0;
      return base - tall * step * (1 - fall * 0.8) + (hashU(x >> 1, 3, 87 + i) < 0.3 ? 1 : 0);
    }, i * 5);
    blobPaint(g, [[cx + R.rx * 0.7, base - rr * 0.3, rr * 0.38]], RAMP.rock, true, i * 13);
  } else if (kind === "slab") {
    // 넓적한 판바위: 낮고 평평한 윗면, 비스듬한 옆
    const h0 = R.ry * (1 + r() * 0.35);
    const tilt = (r() - 0.5) * 0.25;
    profilePaint(g, cx - R.rx, cx + R.rx, base, (x) => {
      const u = (x - cx) / R.rx;
      const edge = Math.max(0, Math.abs(u) - 0.7) / 0.3;
      return base - h0 * (1 - edge * edge) + u * tilt * h0 + (hashU(x >> 2, 1, 77 + i) < 0.2 ? 1 : 0);
    }, i * 7);
  } else if (kind === "jagged") {
    // 뾰족한 바위: 봉우리 둘셋 + 잔 톱니
    const peaks = [[-0.35, 0.75 + r() * 0.2], [0.15, 1], [0.55, 0.6 + r() * 0.2]] as const;
    profilePaint(g, cx - R.rx, cx + R.rx, base, (x) => {
      const u = (x - cx) / R.rx;
      let h = 0;
      // 봉우리 어깨를 넓게 (텐트처럼 뾰족하지 않게), 잔 톱니는 작게
      for (const [pu, ph] of peaks) h = Math.max(h, ph * Math.max(0, 1 - Math.abs(u - pu) * 1.15) ** 0.8);
      h = Math.max(h, 0.3 * (1 - Math.abs(u)));
      const teeth = (hashU(x >> 1, 2, 79 + i) - 0.5) * 2;
      return base - Math.max(0, h) * tall + teeth;
    }, i * 11);
  } else {
    // 무더기: 작은 덩어리 여럿, 사이사이 틈 (갈라진 곳은 짙게)
    const n = 4 + Math.floor(r() * 3);
    const circles: [number, number, number][] = [];
    for (let k = 0; k < n; k++) {
      const u = -0.8 + (1.6 * k) / Math.max(1, n - 1) + (r() - 0.5) * 0.2;
      const rad = rr * (0.32 + r() * 0.28);
      circles.push([cx + u * R.rx * 0.9, base - rad * (0.8 + r() * 0.5), rad]);
    }
    blobPaint(g, circles, RAMP.rock, true, i * 13);
    for (let k = 1; k < n; k++) {
      const x = Math.round((circles[k - 1][0] + circles[k][0]) / 2);
      for (let y = base - Math.round(rr * 0.9); y <= base; y++) if (g.filled(x, y) && hashU(x, y, 81) < 0.8) g.set(x, y, RAMP.rock[4]);
    }
  }
  // 금 (짙은 가는 선 둘셋 — 위에서 아래로 비틀비틀)
  for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
    let x = Math.round(cx + (r() - 0.5) * R.rx * 1.2);
    let y = Math.round(base - tall * (0.3 + r() * 0.5));
    for (let j = 0; j < 6 + r() * 8; j++) {
      if (g.filled(x, y) && g.filled(x - 1, y) && g.filled(x + 1, y)) g.set(x, y, RAMP.rock[4]);
      y += 1;
      x += r() < 0.3 ? -1 : r() < 0.6 ? 1 : 0;
    }
  }
  // 물때 젖은 띠 (아래 6줄은 짙고 축축하게) · 따개비(흰 점 무리) · 삿갓조개(작은 고깔)
  const band = 6 + Math.floor(r() * 3);
  for (let y = base - band; y <= base; y++)
    for (let x = 0; x < W; x++) {
      if (!g.filled(x, y)) continue;
      const c = g.get(x, y) >>> 8;
      g.set(x, y, mix(c, 0x4a5868, 0.18 + ((y - (base - band)) / band) * 0.12));
      if (hashU(x >> 1, y >> 1, 85 + i) < 0.09 && y < base - 1) g.set(x, y, RAMP.rock[0]);
    }
  for (let k = 0; k < Math.round(R.rx / 8); k++) {
    const x = Math.round(cx + (r() - 0.5) * R.rx * 1.4);
    const y = base - 2 - Math.floor(r() * band);
    if (g.filled(x, y) && g.filled(x + 2, y + 1)) {
      g.set(x + 1, y - 1, RAMP.rock[1]);
      g.set(x, y, RAMP.rock[2]);
      g.set(x + 1, y, RAMP.rock[1]);
      g.set(x + 2, y, RAMP.rock[3]);
    }
  }
  // 미역·파래 (밑동 몇 가닥)
  for (let k = 0; k < Math.max(1, Math.round(R.rx / 9)); k++) {
    const x = Math.round(cx + (r() - 0.5) * R.rx * 1.4);
    const len = 2 + Math.floor(r() * 3);
    for (let j = 0; j < len; j++) if (g.filled(x, base - j)) g.set(x + (j % 2), base - j, j === len - 1 ? RAMP.leaf[2] : RAMP.leaf[3]);
  }
  // 젖은 아래 끝 (옅은 민트 몇 점)
  for (let x = 0; x < W; x++) for (let y = base - 3; y <= base; y++) if (g.filled(x, y) && hashU(x, y, i + 3) < 0.2) g.set(x, y, RAMP.roofM[2]);
  softOutline(g, true);
  // 둘레 자갈 (바위 밖 모래·갯벌 위 작은 돌 몇 알)
  for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
    const x = Math.round(cx + (r() < 0.5 ? -1 : 1) * (R.rx * (0.9 + r() * 0.3)));
    const y = base - 1 + Math.floor(r() * 3);
    if (x < 1 || x >= W - 2 || g.filled(x, y)) continue;
    g.set(x, y, RAMP.rock[1]);
    g.set(x + 1, y, RAMP.rock[3]);
  }
  shadow(g, cx + 2, base + 1, R.rx + 2, 3, 60);
  return g;
}
/** 11/16 갯바위 밑동 거품 고리 (바위보다 조금 큰 성긴 흰 레이스) */
export function rockFoamArt(i: number): Grid {
  const R = SEA_ROCKS[i];
  const rx = R.rx + 5;
  const ry = R.ry * 0.45 + 3;
  const W = Math.ceil(rx * 2) + 4;
  const H = Math.ceil(ry * 2) + 4;
  const g = new Grid(W, H);
  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
      if (d > 1 || d < 0.62) continue;
      const n = hashU(x, y, 900 + i);
      if (d > 0.86 ? n < 0.75 : n < 0.3) g.set(x, y, d > 0.86 ? RAMP.water[0] : RAMP.water[1], 220);
    }
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
  softOutline(g, true);
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
  metalShine(g, { x0: 4, y0: 10, x1: 5, y1: base - 3 });
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
  const c = pick(RAMP.water, Math.min(1, Math.max(0, 0.1 + depth / 248 + n * 0.18)), x, depth);
  // 11/16 r12 아래로 넓힌 먼바다: 물가에서 멀어질수록 조금 더 짙은 남색 (수평선 쪽 느낌, 4단 디더)
  if (depth <= 230) return c;
  const f = Math.min(1, (depth - 230) / 210) * 0.55 + n * 0.08;
  return pick([c, mix(c, 0x2c5488, 0.33), mix(c, 0x2c5488, 0.66), 0x2c5488], Math.max(0, Math.min(1, f)), x, depth);
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
  // 11/16 노을 바다가 한 가지 라벤더로 보인다 → 물가에서 더 빨리 분홍·주황으로 넘어가게 (깊이 170px에 주황)
  const f = Math.max(0, Math.min(1, depth / 170));
  const sky = f < 0.5 ? [172 + 70 * f * 2, 150 - 4 * f * 2, 226 - 40 * f * 2] : [242 + 13 * (f - 0.5) * 2, 146 + 20 * (f - 0.5) * 2, 186 - 86 * (f - 0.5) * 2];
  const v = 0.62 + l * 0.48;
  const k = 0.08;
  const r = Math.min(255, Math.round(sky[0] * v * (1 - k) + r0 * k));
  const g = Math.min(255, Math.round(sky[1] * v * (1 - k) + g0 * 0.8 * k));
  const b = Math.min(255, Math.round(sky[2] * v * (1 - k) + b0 * 0.75 * k));
  return (r << 16) | (g << 8) | b;
}
/** 저녁 물 몸통 (낮 물 그림을 노을빛으로 옮겨요 — 줄마다 깊이가 다르고, 얼룩마다 깊이를 조금씩 흔들어 띠가 살아 보여요) */
export function duskWaterArt(): Grid {
  const day = waterArt();
  const g = new Grid(WATER_TILE_W, WATER_TILE_H);
  for (let y = 0; y < WATER_TILE_H; y++)
    for (let x = 0; x < WATER_TILE_W; x++) {
      const v = day.get(x, y);
      if ((v & 255) === 0) continue;
      const depth = y - WATER_ROW0 + (fbm(x / 48, y * 0.03, 5) - 0.5) * 50;
      g.set(x, y, duskOf(v >>> 8, depth), v & 255);
    }
  // 조금 짙은 물결 줄 (보랏빛 남색 쪽으로 16%) — 노을 물이 평평해 보이지 않게
  const r = rng(1777);
  for (let i = 0; i < 220; i++) {
    const x = Math.floor(r() * WATER_TILE_W);
    const y = WATER_ROW0 + 24 + Math.floor(r() * (WATER_TILE_H - WATER_ROW0 - 24));
    const len = 10 + Math.floor(r() * 26);
    for (let k = 0; k < len; k++) {
      const xx = (x + k) % WATER_TILE_W;
      const v = g.get(xx, y);
      if ((v & 255) === 0) continue;
      g.set(xx, y, mix(v >>> 8, 0x6a5a96, 0.16));
    }
  }
  return g;
}
/**
 * 저녁 물가 거품 띠: 낮과 같은 레이스 모양을 깨끗하게 — 거품(water[0])은 분홍빛 흰색, 그 사이 얕은 물(water[1..])은 한 가지 연분홍 라벤더.
 * (낮 색을 깊이로 섞으면 점이 섞여 잿빛 자글자글해 보였어요)
 */
export function duskFoamArt(): Grid {
  const day = foamArt();
  const g = new Grid(FOAM_W, FOAM_TEX_H);
  for (let y = 0; y < FOAM_H; y++)
    for (let x = 0; x < FOAM_W; x++) {
      const v = day.get(x, y);
      if ((v & 255) === 0) continue;
      const c = v >>> 8;
      // 물 몸통과 겹치는 아래쪽(14줄부터)은 저녁 물빛으로 서서히 — 디더 점이 흰 바둑판으로 보이지 않게
      const k = Math.max(0, Math.min(1, (y - 12) / 14));
      const top = c === RAMP.water[0] ? 0xffe6e0 : 0xeccbe6;
      g.set(x, y, k > 0 ? mix(top, duskOf(c, Math.max(0, y - 14)), k) : top, v & 255);
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
/** 11/16 물가 띠는 이어진 곡선(Rope)으로 그려요 — 텍스처를 되풀이(REPEAT)하려고 높이를 2의 거듭제곱(64)으로, 48줄 아래는 비워요 */
export const FOAM_TEX_H = 64;
export const LACE_TEX_H = 8;
/** 거품 위 끝이 이만큼 아래부터 (SeaMap이 물가 선에서 이만큼 위에 띠를 놓아요) */
export const FOAM_TOP = 6;
export function foamProfile(x: number): number {
  const a = (x / FOAM_W) * Math.PI * 2;
  const blob = hashU(x >> 3, 0, 86) * 3 + hashU(x >> 1, 1, 86) * 1.2;
  return Math.round(FOAM_TOP - 1 + 2.2 * Math.sin(a * 3) + 1.4 * Math.sin(a * 7 + 1) + blob - 2);
}
export function foamArt(): Grid {
  const g = new Grid(FOAM_W, FOAM_TEX_H);
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
  const g = new Grid(FOAM_W, LACE_TEX_H);
  for (let x = 0; x < FOAM_W; x++) {
    const y = Math.round(2.5 + 1.6 * Math.sin((x / FOAM_W) * Math.PI * 2 * 5 + 2) + (hashU(x >> 2, 0, 85) - 0.5) * 1.5);
    if (hashU(x, 1, 85) < 0.7) g.set(x, Math.max(0, Math.min(5, y)), RAMP.water[0], 235);
    if (hashU(x, 2, 85) < 0.3) g.set(x, Math.max(0, Math.min(5, y + 1)), RAMP.water[1], 180);
  }
  return g;
}
/** 11/16 파도가 쓸고 간 젖은 윤기 (시안: 젖은 모래 단계 위에 water[1] 물빛 점 — 32×32 타일, 조각마다 이어 깔아요) */
// 11/16 사용자 "간조 갯벌이 하늘색 물결무늬 벽지처럼 반복돼요" → 하늘색 점을 빼고, 큰 타일(128)에 젖은 모래 한 단계 얼룩 + 드문 윤기만
export const SHEEN_WET_TILE = 128;
export function sheenWetArt(): Grid {
  const N = SHEEN_WET_TILE;
  const g = new Grid(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const n = fbm(x / 32, y / 32, 4);
      g.set(x, y, RAMP.wet[n > 0.55 ? 2 : 1], Math.round(60 + n * 90));
      // 물기 윤기 (아주 드물게 밝은 모래빛)
      if (fbm(x / 16, y / 8, 8) > 0.8) g.set(x, y, RAMP.sand[1], 110);
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
 * 11/16 r14 사용자 "캠핑장처럼 촘촘한 바닥 결" — 캠핑장 바닥(campArt groundColor)과 같은 방법: 점마다 세 톤(조금 진하게·바탕·조금 밝게),
 * 2px 덩어리 몇 개, 아주 드문 밝은 점 — 색은 바닷가 단계(RAMP) 안에서만 움직여요 (색은 그대로)
 */
function speck(t: number, x: number, y: number, salt: number): number {
  const n = hashU(x, y, 201 + salt);
  if (hashU(x >> 1, y >> 1, 203 + salt) < 0.07) return t + 0.22;
  if (n < 0.16) return t + 0.14;
  if (n > 0.9) return t - 0.12;
  return t;
}
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
      // 11/16 길 왼쪽 끝은 둥근 돌림 마당 (가장자리는 연석)
      if (x < SEA_ROAD.x) {
        const d = Math.hypot(x - SEA_ROAD_LOOP.x, y - SEA_ROAD_LOOP.y);
        if (d > SEA_ROAD_LOOP.r - 3) return pick(RAMP.rock, 0.05, x, y);
        return pick(RAMP.road, 0.25 + (d / SEA_ROAD_LOOP.r) * 0.3 + (fbm(x * 0.05, y * 0.05) - 0.5) * 0.4, x, y);
      }
      if (y < SEA_ROAD.y + 3 || y > SEA_ROAD.y + SEA_ROAD.h - 3) return pick(RAMP.rock, 0.05, x, y); // 연석
      let c = pick(RAMP.road, 0.2 + ((y - SEA_ROAD.y) / SEA_ROAD.h) * 0.5 + (fbm(x * 0.05, y * 0.05) - 0.5) * 0.4, x, y);
      if (x >= BAY.x0 && x <= BAY.x1 && y >= BAY.y0 && y <= BAY.y1) {
        const onEdge = y <= BAY.y0 + 1 || y >= BAY.y1 - 1 ? (x >> 2) % 2 === 0 : x <= BAY.x0 + 1 || x >= BAY.x1 - 1;
        if (onEdge) c = RAMP.umbY[1];
        return c;
      }
      const mid = SEA_ROAD.y + Math.floor(SEA_ROAD.h / 2);
      if ((y === mid || y === mid + 1) && (x >> 3) % 2 === 0 && x > SEA_ROAD.x + 16) c = RAMP.wall[0];
      return c;
    }
    case "path": {
      // 11/16 r14 밟혀 다져진 흙길: 가운데는 밝게, 가장자리는 한 단계 진하게 + 가장자리 자갈 몇 알
      const e = pathEdgeDist(x, y); // 0 = 가장자리, 음수 = 안쪽
      let t = 0.42 + fbm(x * 0.02, y * 0.02) * 0.4 + (e > -2.5 ? 0.22 : e < -6 ? -0.08 : 0); // r16 흙길 한 톤 깊게
      if (e > -3.5 && hashU(x >> 1, y >> 1, 41) < 0.03) return (x + y) & 1 ? mix(RAMP.rock[1], RAMP.sand[2], 0.45) : mix(RAMP.rock[3], RAMP.sand[4], 0.5);
      if (hashU(x, y, 43) < 0.03) t += 0.18;
      return pick(RAMP.sand, speck(t, x, y, 3), x, y);
    }
    case "yard":
      return pick(RAMP.sand, 0.12 + fbm(x * 0.015, y * 0.02) * 0.45, x, y);
    case "lot": {
      // 11/16 r14 울타리·생울타리 안쪽 가장자리는 그늘 (AO)
      let edge = 99;
      for (const l of SEA_LOTS) if (x >= l.x - 2 && x <= l.x + l.w + 2 && y >= l.y - 2 && y <= l.y + l.h + 2) edge = Math.min(x - l.x, l.x + l.w - x, y - l.y, l.y + l.h - y);
      const ao = edge < 6 ? (6 - edge) * 0.05 : 0;
      return pick(RAMP.sand, speck(0.45 + fbm(x * 0.02, y * 0.025) * 0.45 + ao, x, y, 4), x, y);
    }
    case "boardwalk": {
      const top = SEA_BOARDWALK.y;
      const plank = (x + (y - top > SEA_BOARDWALK.h / 2 ? 12 : 0)) % 36 === 0;
      return pick(RAMP.wood, 0.15 + ((y - top) / SEA_BOARDWALK.h) * 0.45 + (plank ? 0.35 : 0) + (fbm(x * 0.075, y * 0.25) - 0.5) * 0.2, x, y);
    }
    case "sand": {
      const toFlat = SEA_FLAT_Y0 - y;
      // 갯벌 바로 앞은 젖은 모래 (위로 갈수록 마른 모래로 디더)
      if (toFlat < 28) return pick(RAMP.wet, (1 - toFlat / 28) * 0.9 + (fbm(x * 0.05, y * 0.075) - 0.5) * 0.3, x, y);
      // 11/16 r14 결: 산책로 바로 밑 그늘(3px) · 고운 모래 알갱이(두 톤) · 바람 물결 자국(모래 언덕 쪽, 잡음 자리) · 발자국 같은 오목한 자국 · 조개 부스러기
      const under = y - SEA_SAND_Y0;
      let t = 0.12 + fbm(x * 0.009, y * 0.0125) * 0.6 + (under < 12 ? 0.25 : 0) + (under < 3 ? 0.35 : 0);
      const wind = fbm(x * 0.006 + 21, y * 0.01 + 3);
      if (wind > 0.62 && under > 10 && toFlat > 40) {
        const ph = (y + (fbm(x * 0.03, y * 0.05) - 0.5) * 10 + x * 0.12) / 5;
        if (ph - Math.floor(ph) < 0.2) t += 0.12 * Math.min(1, (wind - 0.62) / 0.06);
      }
      const cx = x / 11 | 0;
      const cy = y / 9 | 0;
      if (hashU(cx, cy, 89) < 0.035) {
        const lx = x - cx * 11;
        const ly = y - cy * 9;
        if ((lx === 4 || lx === 5) && ly === 3) return pick(RAMP.sand, Math.min(1, t + 0.3), x, y);
        if ((lx === 4 || lx === 5) && ly === 4) return RAMP.sand[0];
      }
      const h = hashU(x, y, 91);
      if (h < 0.045) t += 0.2;
      else if (h > 0.975) return RAMP.sand[0];
      if (h > 0.9992) return (x & 1) ? 0xfbe4e0 : 0xfffaf2;
      return pick(RAMP.sand, speck(t, x, y, 1), x, y);
    }
    case "pool": {
      const d = poolDepth(x, y);
      if (d < 0.18) return pick(RAMP.wet, 0.6, x, y); // 젖은 테두리
      return pick(RAMP.water, 0.05 + d * 0.35 + (fbm(x * 0.1, y * 0.1) - 0.5) * 0.1, x, y);
    }
    case "flat": {
      // 드러난 갯벌: 젖은 모래 단계. 11/16 차분하게 — 큰 축축한 얼룩(낮은 주파수) 위에,
      // 물결 자국은 잡음이 고른 몇 군데에만 짧게, 색은 한 단계만 진하게 (반복 무늬가 생기지 않게 위치·간격·휨을 모두 잡음으로)
      const damp = fbm(x * 0.006 + 3.1, y * 0.009);
      let t = 0.12 + fbm(x * 0.014, y * 0.02) * 0.32 + Math.max(0, damp - 0.5) * 0.9 + Math.max(0, (y - (SEA_DEEP_Y - 30)) / 30) * 0.3;
      const mask = fbm(x * 0.01 + 11, y * 0.014 + 7);
      if (mask > 0.6) {
        const bend = (fbm(x * 0.02, y * 0.05 + 5) - 0.5) * 14;
        const ph = (y + bend + x * 0.08) / (7 + fbm(x * 0.008, y * 0.008 + 2) * 4);
        const on = ph - Math.floor(ph) < 0.16 && hashU(x >> 3, Math.floor(ph), 77) < 0.7;
        if (on) t += 0.14 * Math.min(1, (mask - 0.6) / 0.08);
      }
      return pick(RAMP.wet, Math.min(0.92, t), x, y);
    }
    case "deep":
      return RAMP.water[7];
    case "grass":
    default: {
      // 풀밭: 남쪽(산책로 쪽)은 모래가 섞여요
      const sandy = Math.max(0, (y - (SEA_BOARDWALK.y - 58)) / 60); // 11/16 r11 산책로에서 재요
      if (sandy > 0 && fbm(x * 0.03, y * 0.03) < sandy * 0.6) return pick(RAMP.sand, 0.4, x, y);
      // 11/16 r14 결: 울타리 바깥 그늘(AO) · 풀 포기(3px 짙은 잎 + 밝은 끝) · 토끼풀 무리(잡음 자리) · 작은 들꽃 · 잔 알갱이
      // r16 풀밭은 한 톤 깊게 (마을·캠핑장 땅 밝기에 가깝게 — 같은 풀빛 단계 안에서)
      let t = 0.27 + fbm(x * 0.015, y * 0.0225) * 0.7 + (y > SEA_BOARDWALK.y - 6 ? 0.2 : 0);
      for (const l of SEA_LOTS) {
        const dx = Math.max(l.x - x, 0, x - (l.x + l.w));
        const dy = Math.max(l.y - y, 0, y - (l.y + l.h));
        const d = Math.max(dx, dy);
        if (d < 5) t += (5 - d) * 0.04;
      }
      const tx = x / 7 | 0;
      const ty = y / 6 | 0;
      if (hashU(tx, ty, 31) < 0.16) {
        const ox = 2 + Math.floor(hashU(tx, ty, 32) * 3);
        const lx = x - tx * 7;
        const ly = y - ty * 6;
        if (ly === 4 && (lx === ox - 1 || lx === ox + 1)) return RAMP.grass[4];
        if (ly === 3 && lx === ox) return RAMP.grass[4];
        if (ly === 2 && lx === ox) return RAMP.leaf[0];
      }
      if (fbm(x * 0.05 + 9, y * 0.05 + 4) > 0.68 && hashU(x >> 1, y >> 1, 33) < 0.3) return (x + y) & 1 ? RAMP.leaf[1] : RAMP.leaf[0];
      const h = hashU(x, y, 35);
      if (h > 0.9985) return h > 0.9995 ? 0xfff6d0 : 0xf8c8d8;
      if (h < 0.05) t += 0.18;
      // 캠핑장 풀밭처럼: 큰 얼룩(짙은 풀 무리) 위에 점 세 톤 + 무리 안은 4px 덩어리 (2px 점이 화면 가득이면 지글거려요)
      if (hashU(x >> 3, y >> 3, 205) < 0.16) t += 0.18;
      if (hashU(x >> 4, y >> 4, 207) > 0.68 && hashU(x >> 2, y >> 2, 209) < 0.42) return hashU(x >> 2, y >> 2, 211) < 0.5 ? RAMP.grass[4] : RAMP.leaf[1];
      return pick(RAMP.grass, speck(t, x, y, 2), x, y);
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

// ── 11/16 r12 매점 옆 피크닉 탁자 · 해변 모닥불 · 끝 걸터앉기 방석 ──
const PICNIC = hexes(["#f6dcb2", "#ecc898", "#dcb282", "#c89c6e", "#b2885e"]);
/** 피크닉 탁자 상판 (46×18, 원점 가운데 아래 = 탁자 가운데 + 6). 위엔 줄무늬 천 한 장 */
export function picnicTopArt(): Grid {
  const g = new Grid(46, 18);
  for (let y = 2; y < 12; y++)
    for (let x = 2; x < 44; x++) {
      const k = (y - 2) % 4;
      g.set(x, y, k === 3 ? PICNIC[3] : k === 0 ? PICNIC[0] : pick(PICNIC, 0.3 + h2(x, y) * 0.15, x, y));
    }
  g.hline(2, 43, 11, PICNIC[4]);
  // 다리 (X자)
  for (let i = 0; i < 4; i++) {
    g.set(8 + i, 12 + i, PICNIC[4]);
    g.set(37 - i, 12 + i, PICNIC[4]);
  }
  // 체크 천 + 컵
  for (let y = 4; y < 10; y++) for (let x = 16; x < 30; x++) if (((x >> 1) + (y >> 1)) % 2) g.set(x, y, 0xf2a49a);
  g.rect(34, 4, 3, 3, 0xfdf6ec);
  g.set(35, 4, 0x9ad6e6);
  softOutline(g, true);
  shadow(g, 23, 15.5, 20, 1.6, 52);
  return g;
}
/** 피크닉 긴 의자 판 (36×7, 원점 가운데 아래) */
export function picnicPlankArt(): Grid {
  const g = new Grid(36, 7);
  g.rect(2, 1, 32, 3, PICNIC[2]);
  g.hline(2, 33, 1, PICNIC[0]);
  g.hline(2, 33, 3, PICNIC[4]);
  g.rect(5, 4, 2, 2, PICNIC[4]);
  g.rect(29, 4, 2, 2, PICNIC[4]);
  softOutline(g, true);
  shadow(g, 18, 5.5, 15, 1, 48);
  return g;
}
/** 꺼진 모닥불 장작 (낮 — 엇갈린 숯 장작, 22×10, 원점 가운데 아래) */
export function ashLogsArt(): Grid {
  const g = new Grid(22, 10);
  const bark = [0x8a6a4c, 0x6e5238, 0x4e3a2a];
  for (let i = 0; i < 12; i++) {
    g.set(4 + i, 7 - (i >> 2), bark[i % 3 === 0 ? 0 : 1]);
    g.set(4 + i, 8 - (i >> 2), bark[2]);
    g.set(17 - i, 7 - (i >> 2), bark[i % 3 === 1 ? 0 : 1]);
    g.set(17 - i, 8 - (i >> 2), bark[2]);
  }
  for (const [x, y] of [[10, 4], [11, 5], [9, 6], [12, 6]]) g.set(x, y, 0x3a3230);
  g.set(11, 4, 0x6a6460);
  softOutline(g, true);
  return g;
}
/** 물에 씻긴 통나무 의자 (1인, 18×10, 원점 가운데 아래) */
export function driftLogArt(): Grid {
  const g = new Grid(18, 10);
  const bark = hexes(["#d8c2a2", "#c2a882", "#a88c68", "#8c7254"]);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 16; x++) g.set(x, y, y === 2 ? bark[0] : y === 7 ? bark[3] : pick(bark, 0.25 + h2(x, y) * 0.35, x, y));
  for (const ex of [2, 15]) {
    g.vline(ex, 3, 6, 0xeedcbc);
    g.set(ex, 4, 0xc8aa80);
  }
  softOutline(g, true);
  shadow(g, 9, 8.5, 8, 1.1, 50);
  return g;
}
/** 끝 걸터앉기 방석 (12×6, 원점 가운데 아래). v: 0 = 산호, 1 = 하늘, 2 = 노랑 — 데크 끝 앉는 자리 표시 */
export function cushionArt(v: number): Grid {
  const ramp = v === 0 ? RAMP.umbC : v === 1 ? RAMP.towel : RAMP.umbY;
  const g = new Grid(12, 6);
  for (let y = 1; y < 5; y++) for (let x = 1; x < 11; x++) if (!((x === 1 || x === 10) && (y === 1 || y === 4))) g.set(x, y, y === 1 ? ramp[0] : y === 4 ? ramp[2] : ramp[1]);
  g.set(5, 2, ramp[2]);
  g.set(6, 2, ramp[2]);
  softOutline(g, true);
  return g;
}

// ── 11/16 r13 바다 놀거리: 튜브 · 제트스키 (부드러운 단계·옅은 테) ──
/** 튜브 크기 (원점 = 가운데). 위쪽 반(뒤)과 아래쪽 반(앞)을 잘라 탄 사람 앞뒤로 그려요 */
export const TUBE_W = 26;
export const TUBE_H = 16;
export const TUBE_CY = 8;
const TUBE_COLORS = [hexes(["#ffd0c4", "#f6a896", "#e48678"]), hexes(["#fff2c0", "#fbe08e", "#eec66e"]), hexes(["#cdf2dc", "#a6e2c0", "#84cba4"]), hexes(["#d4ecff", "#a8d4f6", "#86b8e4"]), hexes(["#ffd6ec", "#f6b0d2", "#e490ba"])];
/** 줄무늬 튜브 (v = 색). 가운데 구멍은 비워 둬요 (물이 보여요) */
export function tubeArt(v: number): Grid {
  const ramp = TUBE_COLORS[v % TUBE_COLORS.length];
  const g = new Grid(TUBE_W, TUBE_H);
  const cx = TUBE_W / 2;
  for (let y = 0; y < TUBE_H; y++)
    for (let x = 0; x < TUBE_W; x++) {
      const dx = (x + 0.5 - cx) / 11.5;
      const dy = (y + 0.5 - TUBE_CY) / 6.2;
      const o = dx * dx + dy * dy;
      const ix = (x + 0.5 - cx) / 5.2;
      const iy = (y + 0.5 - TUBE_CY + 0.6) / 2.6;
      if (o > 1 || ix * ix + iy * iy < 1) continue;
      const a = Math.atan2(dy, dx);
      const stripe = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0;
      // 빛은 왼쪽 위: 위쪽 바깥은 밝게, 아래쪽은 한 단계 진하게
      const shade = dy < -0.35 ? 0 : dy > 0.45 ? 2 : 1;
      g.set(x, y, stripe ? ramp[shade] : shade === 2 ? 0xe8e4dc : shade === 0 ? 0xffffff : 0xf8f6f0);
    }
  g.set(7, 4, 0xffffff);
  g.set(8, 4, 0xffffff);
  softOutline(g, true);
  return g;
}

/** 제트스키 크기 · 앉는 높이 (원점 = 가운데 아래) */
export const JET_SIDE_W = 34;
export const JET_SIDE_H = 16;
export const JET_FB_W = 18;
export const JET_FB_H = 18;
const JET_HULL = [hexes(["#ffe0d6", "#f8b8a6", "#e8958a"]), hexes(["#d8f0ff", "#a6d6f4", "#7cb8e0"])];
const JET_TOP = hexes(["#fffdf8", "#f2eee6", "#ddd6ca"]);
const JET_SEAT = hexes(["#7c8cc0", "#5c6aa0", "#46528a"]);
/** 옆모습 (오른쪽으로 가요 — 왼쪽은 뒤집어 그려요). v = 색 */
export function jetskiSideArt(v: number): Grid {
  const H = JET_HULL[v % 2];
  const g = new Grid(JET_SIDE_W, JET_SIDE_H);
  // 아래 배 (앞이 올라간 뱃머리)
  for (let x = 2; x < 32; x++) {
    const top = x > 24 ? 8 - Math.round((x - 24) * 0.4) : 8;
    const bot = x > 26 ? 12 - Math.round((x - 26) * 0.6) : 12;
    for (let y = top; y <= bot; y++) g.set(x, y, y === bot ? H[2] : y === top ? H[0] : H[1]);
  }
  // 위 덮개 (흰색) + 줄무늬
  for (let x = 4; x < 28; x++) for (let y = 6; y < 9; y++) g.set(x, y, y === 6 ? JET_TOP[0] : JET_TOP[1]);
  g.hline(6, 26, 9, H[2]);
  // 안장 (뒤쪽) · 손잡이 기둥 (앞)
  for (let x = 7; x < 17; x++) for (let y = 4; y < 6; y++) g.set(x, y, y === 4 ? JET_SEAT[0] : JET_SEAT[1]);
  g.vline(21, 2, 6, 0x6a6f80);
  g.hline(20, 23, 2, 0x4a4e5c);
  // 앞 유리 · 물보라 자국 (배 밑)
  g.set(24, 5, 0xbfe8f1);
  g.set(25, 5, 0x94d3e6);
  for (let x = 3; x <= 30; x++) g.set(x, 13, 0xffffff, 120);
  softOutline(g);
  return g;
}
/** 앞모습(아래로 와요)·뒷모습(위로 가요) */
export function jetskiFbArt(front: boolean, v: number): Grid {
  const H = JET_HULL[v % 2];
  const g = new Grid(JET_FB_W, JET_FB_H);
  const cx = JET_FB_W / 2;
  for (let y = 4; y < 16; y++) {
    const half = front ? Math.min(7, 2 + (y - 4) * 0.7) : Math.min(7, 5 + (y - 4) * 0.25);
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) g.set(x, y, y < 10 ? (y === 4 ? JET_TOP[0] : JET_TOP[1]) : y >= 14 ? H[2] : H[1]);
  }
  if (front) {
    // 손잡이 · 앞 유리
    g.hline(4, 13, 3, 0x4a4e5c);
    g.rect(7, 5, 4, 2, 0xbfe8f1);
  } else {
    // 안장 · 뒤 등 두 개
    g.rect(6, 5, 6, 4, JET_SEAT[1]);
    g.hline(6, 11, 5, JET_SEAT[0]);
    g.set(4, 12, 0xff8a7a);
    g.set(13, 12, 0xff8a7a);
  }
  for (let x = 2; x <= 15; x++) g.set(x, 16, 0xffffff, 130);
  softOutline(g);
  return g;
}
/** 물살 자국 한 점 (밝은 거품 타원, 원점 가운데) */
export function wakeArt(): Grid {
  const g = new Grid(10, 6);
  for (let y = 0; y < 6; y++)
    for (let x = 0; x < 10; x++) {
      const dx = (x + 0.5 - 5) / 5;
      const dy = (y + 0.5 - 3) / 3;
      const d = dx * dx + dy * dy;
      if (d < 1) g.set(x, y, 0xffffff, Math.round(220 * (1 - d)));
    }
  return g;
}

// ── 11/16 r14 사용자 "바닷가 사물이 납작해요 — 마을·캠핑장처럼 결을": 구운 그림 위에 한 번 더 (매 프레임 비용 없음) ──
//  - 빛은 왼쪽 위: 몸통 테두리 중 오른쪽·아래가 비면 한 단계 어둡게(그늘 쪽 1px 테), 왼쪽·위가 비면 살짝 밝게
//  - 안쪽은 잔잔한 결 (드문드문 한 톤 진하게·밝게 — 잡음 위치라 되풀이 무늬가 없어요)
//  - wood: 나무 빛깔 칸에 짧은 가로 나뭇결
// 테두리(SOFT_EDGE)·그림자(반투명)는 건드리지 않아요
export type DetailOpts = { wood?: boolean; rim?: number; grain?: number; salt?: number };
const EDGE_RGB = SOFT_EDGE;
function woody(c: Color): boolean {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return r >= 120 && r > g && g > b && r - b >= 40 && r - b <= 140;
}
export function detailPass(g: Grid, o: DetailOpts = {}): Grid {
  const W = g.w;
  const H = g.h;
  const src = g.px.slice();
  const rim = o.rim ?? 0.15; // r16 그늘 쪽을 깊게 → r17 캠핑장 세기에 맞춰 조금 덜
  const grain = o.grain ?? 0.05;
  const salt = o.salt ?? 0;
  const solid = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const v = src[y * W + x];
    // 테두리(불투명도 254)·그림자(반투명)는 몸이 아니에요
    return (v & 255) === 255 && v >>> 8 !== EDGE_RGB && v >>> 8 !== LIGHT_EDGE;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue;
      const v = src[y * W + x];
      const c = v >>> 8;
      const r = !solid(x + 1, y);
      const b = !solid(x, y + 1);
      const l = !solid(x - 1, y);
      const t = !solid(x, y - 1);
      let out = c;
      if ((r || b) && !l && !t) out = mix(c, 0x3a2c28, rim);
      else if ((l || t) && !r && !b) out = mix(c, 0xffffff, rim * 0.6);
      else if (!r && !b && !l && !t) {
        const h = h2(x * 7 + salt, y * 13 + salt);
        if (h < grain) out = mix(c, 0x3a2c28, 0.06);
        else if (h > 1 - grain * 0.7) out = mix(c, 0xffffff, 0.07);
        if (o.wood && woody(c) && h2((x >> 2) + salt, y * 3 + 7) < 0.2 && h2(x + 11, y + salt) < 0.85) out = mix(out, 0x5a3c28, 0.1);
      }
      if (out !== c) g.px[y * W + x] = ((out << 8) | (v & 255)) >>> 0;
    }
  return g;
}
/** 그림 꾸러미(Grid 또는 {grid})에 결을 더해요 */
export function withDetail<T extends Grid | ArtOut>(out: T, o: DetailOpts = {}): T {
  detailPass("grid" in out ? out.grid : out, o);
  return out;
}

// ── 11/16 r15 먼바다 배 (멀리 있어 흐릿하게 — 그리는 쪽에서 안개 빛으로 덧칠해요) ──
export const SHIP_W = { tanker: 128, cargo: 116 } as const;
/** 유조선: 긴 붉은 배 밑 + 짙은 남색 옆구리 + 갑판 관 + 고물 쪽 흰 선교 (오른쪽이 뱃머리) */
export function tankerArt(): Grid {
  const W = SHIP_W.tanker;
  // r15 사용자: 물에 잠겨 보이게 — 물높이(맨 아래 줄 20)까지만 그리고, 물높이 줄은 짙게 + 뱃머리 물결 (반사는 shipReflectArt)
  const g = new Grid(W, 21);
  for (let x = 2; x < W - 2; x++) {
    const bow = x > W - 16 ? Math.round((x - (W - 16)) * 0.35) : 0;
    for (let y = 13 + bow; y < 21; y++) g.set(x, y, y === 20 ? 0x2e3a58 : y >= 18 ? 0xb8606a : y === 13 + bow ? 0x5a6a8e : 0x46557a);
  }
  for (const [x, y] of [[W - 3, 19], [W - 2, 20], [W - 5, 20], [W - 8, 20]] as const) g.set(x, y, 0xffffff);
  // 갑판 관 · 가운데 통로
  for (let x = 30; x < W - 20; x++) g.set(x, 12, 0x8a96aa);
  for (let x = 34; x < W - 22; x += 9) g.rect(x, 10, 5, 2, 0xa8b2c2);
  // 선교 (고물)
  g.rect(8, 3, 16, 10, 0xeef0f2);
  g.hline(8, 23, 3, 0xffffff);
  for (let x = 10; x < 23; x += 3) g.set(x, 6, 0x8ab0c8);
  g.rect(14, 0, 3, 3, 0x7a5a5a);
  softOutline(g);
  return g;
}
/** 컨테이너선: 남색 배 + 알록달록 상자 더미 + 고물 선교 */
export function cargoArt(): Grid {
  const W = SHIP_W.cargo;
  const g = new Grid(W, 25);
  for (let x = 2; x < W - 2; x++) {
    const bow = x > W - 14 ? Math.round((x - (W - 14)) * 0.4) : 0;
    for (let y = 17 + bow; y < 25; y++) g.set(x, y, y === 24 ? 0x2e3a58 : y >= 22 ? 0xb06a62 : y === 17 + bow ? 0x4a6aa0 : 0x3e5a8a);
  }
  for (const [x, y] of [[W - 3, 23], [W - 2, 24], [W - 5, 24], [W - 8, 24]] as const) g.set(x, y, 0xffffff);
  const box = [0xe8907a, 0x7ab8d8, 0xf0c870, 0x8cc89a, 0xc898d8, 0xe8e0d0];
  const r = rng(515);
  for (let x = 28; x < W - 16; x += 7)
    for (let row = 0; row < 3; row++) {
      if (row === 2 && r() < 0.4) continue;
      g.rect(x, 14 - row * 4, 6, 3, box[Math.floor(r() * box.length)]);
    }
  g.rect(8, 5, 14, 12, 0xeef0f2);
  g.hline(8, 21, 5, 0xffffff);
  for (let x = 10; x < 21; x += 3) g.set(x, 8, 0x8ab0c8);
  g.rect(13, 1, 3, 4, 0xd86a5a);
  softOutline(g);
  return g;
}
/** 오징어잡이배: 작은 흰 배 + 앞뒤 기둥 사이에 줄줄이 매단 등 (등은 따로 squidLampsArt — 밤에 더해 밝혀요) */
export const SQUID_W = 50;
export const SQUID_H = 28;
const SQUID_BULBS: readonly [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let x = 8; x <= 42; x += 4) out.push([x, 9 + Math.round(Math.sin(((x - 8) / 34) * Math.PI) * 2)]);
  for (let x = 10; x <= 40; x += 5) out.push([x, 14]);
  return out;
})();
export function squidArt(): Grid {
  const g = new Grid(SQUID_W, SQUID_H);
  for (let x = 4; x < SQUID_W - 4; x++) {
    const bow = x > SQUID_W - 12 ? Math.round((x - (SQUID_W - 12)) * 0.5) : 0;
    for (let y = 18 + bow; y < 25; y++) g.set(x, y, y >= 23 ? 0x5a7a9a : y === 18 + bow ? 0xf4f6f8 : 0xdde4ea);
  }
  g.rect(16, 13, 10, 5, 0xeef2f4);
  g.set(18, 15, 0x7aa8c0);
  g.set(21, 15, 0x7aa8c0);
  // 기둥 둘 · 등 줄
  g.vline(7, 6, 18, 0x8a8f9a);
  g.vline(43, 6, 18, 0x8a8f9a);
  for (let x = 7; x <= 43; x++) g.set(x, 7 + Math.round(Math.sin(((x - 7) / 36) * Math.PI) * 2), 0x9aa0aa);
  for (const [x, y] of SQUID_BULBS) g.set(x, y, 0xe8ecd8);
  softOutline(g);
  return g;
}
/** 오징어잡이배 등불만 (ADD로 겹쳐 밤에 밝혀요 — 흰빛·연두빛 섞어) */
export function squidLampsArt(): Grid {
  const g = new Grid(SQUID_W, SQUID_H);
  SQUID_BULBS.forEach(([x, y], i) => {
    const c = i % 3 === 1 ? 0xd8ffd0 : 0xfffbe8;
    g.set(x, y, c);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(x + dx, y + dy, c, 120);
  });
  return g;
}
/** 먼 배 물빛 반사 (배 길이만큼 깨진 짙은 줄 + 흰 물결 몇 점, 원점 가운데 위 = 물높이) */
export function shipReflectArt(w: number): Grid {
  const g = new Grid(w, 6);
  for (let y = 0; y < 6; y++)
    for (let x = 2; x < w - 2; x++) {
      const inset = y * 3;
      if (x < 2 + inset || x > w - 3 - inset) continue;
      if (hashU(x >> 1, y, 113) < 0.55 - y * 0.08) g.set(x, y, 0x2e3a58, Math.round(120 - y * 18));
      else if (hashU(x, y, 114) < 0.05) g.set(x, y, 0xffffff, 120);
    }
  return g;
}
/** 물에 비친 불빛 기둥 (ADD, 위가 밝고 아래로 사라져요 — 그리는 쪽에서 위아래로 일렁여요) */
export function lightColumnArt(): Grid {
  const W = 8;
  const H = 48;
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = 1 - y / H;
      const side = 1 - Math.abs(x + 0.5 - W / 2) / (W / 2);
      const broken = hashU(x, y >> 1, 97) < 0.25 + (1 - k) * 0.4 ? 0.35 : 1;
      const a = Math.round(200 * k * k * side * broken);
      if (a > 6) g.set(x, y, 0xfff4c8, a);
    }
  return g;
}

// ── 11/16 r14 재질 결 (사용자: 기와 줄·천 주름·나뭇결·판자·외벽·금속·돌) — 그림 함수 안에서 테두리 전에 불러요 ──
type Box = { x0: number; y0: number; x1: number; y1: number };
function eachSolid(g: Grid, b: Box, fn: (x: number, y: number, c: Color, a: number) => Color | null): void {
  for (let y = Math.max(0, b.y0); y <= Math.min(g.h - 1, b.y1); y++)
    for (let x = Math.max(0, b.x0); x <= Math.min(g.w - 1, b.x1); x++) {
      const v = g.get(x, y);
      const a = v & 255;
      if (a < 200) continue;
      const out = fn(x, y, v >>> 8, a);
      if (out !== null) g.set(x, y, out, a);
    }
}
/** 기와 줄: 줄마다 윗줄은 빛, 아랫줄은 그늘, 줄마다 엇갈린 이음 */
export function roofRows(g: Grid, b: Box, rowH = 4, seam = 8): void {
  eachSolid(g, b, (x, y, c) => {
    const r = (y - b.y0) % rowH;
    const row = Math.floor((y - b.y0) / rowH);
    if (r === 0) return mix(c, 0xffffff, 0.12);
    if (r === rowH - 1) return mix(c, 0x3a2c28, 0.14);
    if ((x + row * (seam >> 1)) % seam === 0) return mix(c, 0x3a2c28, 0.09);
    return r === 1 ? mix(c, 0xffffff, 0.04) : null;
  });
}
/** 천 주름: 세로로 접힌 결 (period px마다 밝은 마루·그늘 골) */
export function fabricFolds(g: Grid, b: Box, period = 10, amt = 0.08): void {
  eachSolid(g, b, (x, _y, c) => {
    const k = Math.sin(((x - b.x0) / period) * Math.PI * 2);
    if (k > 0.65) return mix(c, 0xffffff, amt * 0.8);
    if (k < -0.65) return mix(c, 0x3a2c28, amt);
    return null;
  });
}
/** 판자: 판마다 다른 톤 · 판 사이 그늘 · 짧은 나뭇결 · 판 끝 못 (가로 판자면 vertical = false) */
export function planks(g: Grid, b: Box, plankH = 6, vertical = false, len = 28, salt = 0): void {
  eachSolid(g, b, (x, y, c) => {
    const along = vertical ? y - b.y0 : x - b.x0;
    const across = vertical ? x - b.x0 : y - b.y0;
    const p = Math.floor(across / plankH);
    const r = across % plankH;
    const seg = Math.floor((along + p * 11) / len);
    const at = (along + p * 11) % len;
    let o = c;
    const tone = hashU(p, seg, 70 + salt) - 0.5;
    o = tone > 0 ? mix(o, 0xffffff, tone * 0.1) : mix(o, 0x3a2c28, -tone * 0.12);
    if (r === plankH - 1) return mix(o, 0x3a2c28, 0.14);
    if (at === 0) return mix(o, 0x3a2c28, 0.12);
    if ((at === 2 || at === len - 3) && r === Math.floor(plankH / 2)) return mix(o, 0x6a6470, 0.45);
    if (hashU((along >> 2) + p * 7, across, 71 + salt) < 0.14) return mix(o, 0x5a3c28, 0.07);
    return o;
  });
}
/** 외벽 판자(겹친 판): 판 윗줄은 빛, 바로 위 판이 드리운 그늘 한 줄 */
export function siding(g: Grid, b: Box, rowH = 5): void {
  eachSolid(g, b, (x, y, c) => {
    const r = (y - b.y0) % rowH;
    if (r === 0) return mix(c, 0x3a2c28, 0.1);
    if (r === 1) return mix(c, 0xffffff, 0.08);
    return hashU(x >> 3, y, 73) < 0.08 ? mix(c, 0x3a2c28, 0.04) : null;
  });
}
/** 금속: 왼쪽에 밝은 빛 줄, 오른쪽 끝은 그늘 */
export function metalShine(g: Grid, b: Box): void {
  eachSolid(g, b, (x, _y, c) => {
    if (x === b.x0) return mix(c, 0xffffff, 0.3);
    if (x === b.x0 + 1) return mix(c, 0xffffff, 0.12);
    if (x === b.x1) return mix(c, 0x2a2a3a, 0.18);
    return null;
  });
}
/** 돌 쌓기: 엇갈린 돌 블록 · 줄눈 그늘 · 블록마다 톤 · 왼쪽 위 모서리 빛 */
export function stoneBlocks(g: Grid, b: Box, bw = 12, bh = 7, salt = 0): void {
  eachSolid(g, b, (x, y, c) => {
    const ry = y - b.y0;
    const row = Math.floor(ry / bh);
    const off = row % 2 ? bw >> 1 : 0;
    const rx = x - b.x0 + off;
    const col = Math.floor(rx / bw);
    if (ry % bh === bh - 1 || rx % bw === 0) return mix(c, 0x3a3640, 0.16);
    const tone = hashU(col, row, 75 + salt) - 0.5;
    let o = tone > 0 ? mix(c, 0xffffff, tone * 0.12) : mix(c, 0x3a3640, -tone * 0.12);
    if (ry % bh === 0 || rx % bw === 1) o = mix(o, 0xffffff, 0.08);
    return o;
  });
}
