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
  SEA_WIDTH,
} from "@tomb/protocol";
import { darken, Grid, lighten, mix, rng, type Color } from "../sprites/pixel";
import { hashU, poolDepth, seaGroundKind, SEA_PLATFORM, type SeaGround } from "./seaLayout";
import { SEA_TEX_PREFIX } from "./seaTypes";

// 11/16 달물결 포구 픽셀 아트 (코드로 그려요, 마을·캠핑장 그림을 다시 쓰지 않고 새로).
// 늦가을 바닷가: 바랜 하늘빛 지붕, 흰 칠이 벗겨진 나무, 소금기에 바랜 모래, 회갈색 갯벌. 원점 = 바닥 가운데 (0.5, 1),
// 맨 아래 줄 근처는 그림자 (캠핑장 그림과 같은 규칙). 모든 함수는 순수(Grid·RGBA 배열)라 Phaser 없이도 돌아요.
// 텍스처 키는 SEA_TEX 값 (모두 "sea-"로 시작). 한 번 구우면 장면을 닫아도 남겨 둬요.

const OUT = 0x26201c;
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
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x101418, a);
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
const PAINT: Pal3 & { line: Color } = { hi: 0xf2ece0, mid: 0xdcd4c4, lo: 0xb4aa98, line: 0x6a6052 };
/** 비바람에 바랜 회갈색 나무 (선착장·울타리 말뚝) */
const DRIFTWOOD: Pal3 & { line: Color } = { hi: 0xc8b49a, mid: 0xa8927a, lo: 0x82705c, line: 0x4e4236 };
/** 선착장 판자 */
const DECK: Pal3 & { line: Color } = { hi: 0xc9a77a, mid: 0xab8a60, lo: 0x876a48, line: 0x4c3a28 };
/** 바랜 하늘빛 지붕 */
const ROOF_BLUE: Pal4 = { hi: 0x8cc0d4, mid: 0x5e98b4, lo: 0x3e7090, deep: 0x2c5068 };
const CONCRETE: Pal3 & { line: Color } = { hi: 0xc8c6bc, mid: 0xaeaba2, lo: 0x8a877e, line: 0x666258 };
const BASALT: Pal4 = { hi: 0x9a948a, mid: 0x787268, lo: 0x5a554e, deep: 0x403c38 };

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

const PINE: Pal4 = { hi: 0x6e8e58, mid: 0x4e6e42, lo: 0x3a5434, deep: 0x283c28 };
const TRUNK: Pal3 = { hi: 0x9a7456, mid: 0x7a5840, lo: 0x56402e };

/** 해송 (바닷바람에 한쪽으로 기운 소나무) */
export function pineArt(v: number): Grid {
  const W = 30;
  const H = 46;
  const g = new Grid(W, H);
  const r = rng(1101 + v * 37);
  const base = H - 3;
  const lean = v ? 1 : -1;
  // 줄기 (위로 갈수록 바람 쪽으로)
  for (let y = base - 22; y <= base; y++) {
    const k = (base - y) / 22;
    const cx = Math.round(W / 2 + lean * k * k * 5);
    const flare = y >= base - 1 ? 1 : 0;
    for (let x = cx - 1 - flare; x <= cx + 1 + flare; x++) g.set(x, y, x < cx ? TRUNK.hi : x > cx ? TRUNK.lo : TRUNK.mid);
  }
  // 수관: 납작한 구름 덩어리 셋 (해송은 층이 납작해요)
  const tiers: [number, number, number, number][] = [
    [W / 2 + lean * 6, 9, 10, 5],
    [W / 2 + lean * 2, 17, 13, 5],
    [W / 2 - lean * 2, 25, 11, 4.5],
  ];
  for (const [cx, cy, rx, ry] of tiers) {
    g.ellipse(cx, cy, rx, ry, PINE.mid);
    g.ellipse(cx - lean * 2, cy - 1.5, rx * 0.7, ry * 0.55, PINE.hi);
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (g.filled(x, Math.round(cy + ry)) && hashU(x, cy, v) < 0.8) g.set(x, Math.round(cy + ry), PINE.deep);
  }
  g.recolor((x, y) => !g.filled(x, y + 1), PINE.lo);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * W);
    const y = Math.floor(r() * 30);
    if (g.filled(x, y) && y < 30) g.set(x, y, r() < 0.5 ? PINE.deep : lighten(PINE.hi, 0.15));
  }
  g.outline(OUT);
  shadow(g, W / 2 + 1, base + 1, 10, 2.2, 60);
  return g;
}

/** 해당화 덤불 (분홍 꽃 몇 송이) */
export function bushArt(v: number): Grid {
  const g = new Grid(20, 14);
  const pal = v % 2 ? { hi: 0x8aa058, mid: 0x6a8244, lo: 0x4c6232 } : { hi: 0x9aa060, mid: 0x7a8648, lo: 0x5a6436 };
  const r = rng(1200 + v);
  g.ellipse(10, 7, 8, 4.5, pal.mid);
  g.ellipse(6, 8, 4.5, 3.5, pal.mid);
  g.ellipse(14, 8, 4.5, 3.5, pal.mid);
  g.recolor((x, y) => !g.filled(x, y - 1), pal.hi);
  g.recolor((x, y) => !g.filled(x, y + 1), pal.lo);
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(r() * 20);
    const y = Math.floor(r() * 10);
    if (g.filled(x, y)) g.set(x, y, i % 3 ? 0xe86a8a : 0xf8c8d0);
  }
  g.outline(OUT);
  shadow(g, 10, 12, 8, 1.6, 54);
  return g;
}

/** 야자수 (해먹을 걸 나무 — 늦가을이라 잎 끝이 조금 누래요) */
export function palmArt(): Grid {
  const W = 40;
  const H = 58;
  const g = new Grid(W, H);
  const base = H - 3;
  const bark = { hi: 0xb89a70, mid: 0x947a56, lo: 0x6e5a40 };
  for (let y = 14; y <= base; y++) {
    const k = (base - y) / (base - 14);
    const cx = Math.round(W / 2 + Math.sin(k * 1.4) * 4);
    for (let x = cx - 2; x <= cx + 1; x++) g.set(x, y, (y + (x === cx - 2 ? 1 : 0)) % 4 === 0 ? bark.lo : x === cx - 2 ? bark.hi : x === cx + 1 ? bark.lo : bark.mid);
  }
  const top = { x: Math.round(W / 2 + Math.sin(1.4) * 4), y: 14 };
  const leaf = { hi: 0x8eb052, mid: 0x6a8c3a, lo: 0x4a6a2a, tip: 0xc8a84a };
  const fronds: [number, number][] = [
    [-18, 6],
    [-14, -6],
    [-4, -12],
    [8, -11],
    [16, -4],
    [19, 7],
  ];
  for (const [dx, dy] of fronds) {
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = top.x + dx * t;
      const y = top.y + dy * t + t * t * 9;
      const w = Math.max(0.5, 2.6 * (1 - t));
      for (let o = -Math.ceil(w); o <= Math.ceil(w); o++) g.set(Math.round(x), Math.round(y + o), t > 0.82 ? leaf.tip : o < 0 ? leaf.hi : o > 0 ? leaf.lo : leaf.mid);
    }
  }
  g.ellipse(top.x, top.y + 2, 3, 2.5, 0x6a4a2a); // 열매
  g.outline(OUT);
  shadow(g, W / 2 + 1, base + 1, 7, 1.8, 60);
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
  g.outline(darken(c, 0.45));
  return g;
}

export function driftArt(): Grid {
  const g = new Grid(26, 8);
  line(g, 2, 5, 23, 3, DRIFTWOOD.mid, 2);
  line(g, 2, 4, 23, 2, DRIFTWOOD.hi);
  line(g, 16, 3, 20, 0, DRIFTWOOD.lo);
  g.outline(OUT);
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
      g.set(x, y, hashU(x, y, 31) < 0.06 ? 0xb07a52 : c); // 녹 자국 조금
    }
  g.hline(0, W - 1, 13, ROOF_BLUE.deep);
  g.hline(0, W - 1, 4, lighten(ROOF_BLUE.hi, 0.3));
  g.rect(W / 2 - 3, 14, 6, 3, 0xfff0c8); // 지붕 등
  g.outline(OUT);
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
  g.set(3, 29, 0xb07a52);
  g.outline(OUT);
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
  g.outline(OUT);
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
  g.outline(OUT);
  shadow(g, 21, 16, 19, 1.4, 56);
  return g;
}

// ── 포구 시장 ── 긴 단층 건물, 차양 셋 아래 좌판 (생선·조개·미역). 받침 = 좌판 앞 (SEA_MARKET.y)
export const MARKET_ART_W = 280;
export const MARKET_ART_H = 124;
/** 지붕 앞 현판 가운데 (그림 원점 기준 — 글씨는 SeaMap) */
export const MARKET_SIGN = { dx: 0, dy: -88 } as const;
const AWNINGS: readonly [Color, Color][] = [
  [0xd8503c, 0xf4ecdc],
  [0x3e7aa8, 0xf4ecdc],
  [0xe0a03a, 0xf4ecdc],
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
      const c = (y - roofTop) % 4 === 3 ? ROOF_BLUE.deep : (x + row * 5) % 11 === 0 ? ROOF_BLUE.lo : row % 2 ? ROOF_BLUE.mid : lighten(ROOF_BLUE.mid, 0.08);
      g.set(x, y, c);
    }
  }
  g.hline(14, W - 15, roofTop, ROOF_BLUE.hi);
  g.hline(0, W - 1, wallTop + 3, ROOF_BLUE.deep);
  // 지붕 앞 현판 (글씨는 SeaMap)
  const sx = W / 2 - 34;
  g.rect(sx, 26, 68, 13, 0xf4ecd8);
  frame(g, sx - 1, 25, 70, 15, DRIFTWOOD.line);
  g.rect(sx - 1, 39, 2, 6, DRIFTWOOD.lo);
  g.rect(sx + 67, 39, 2, 6, DRIFTWOOD.lo);
  // 창 (양 끝)
  for (const wx of [14, W - 36]) {
    g.rect(wx, wallTop + 10, 22, 14, 0xfff0c0);
    g.hline(wx, wx + 21, wallTop + 17, PAINT.line);
    g.vline(wx + 11, wallTop + 10, wallTop + 23, PAINT.line);
    frame(g, wx - 1, wallTop + 9, 24, 16, PAINT.line);
  }
  // 좌판 셋: 차양 + 어두운 안쪽 + 앞 진열대 (생선·조개·미역)
  const stallW = 70;
  for (let i = 0; i < 3; i++) {
    const cx = W / 2 + (i - 1) * 88;
    const x0 = cx - stallW / 2;
    g.rect(x0 + 4, wallTop + 14, stallW - 8, wallBot - wallTop - 14, 0x4a3a30);
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
  g.outline(OUT);
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
    g.hline(6, W - 7, y, k === 0 ? 0xd8eadc : k === 4 ? 0x9cb8a8 : 0xbcd4c4);
  }
  // 박공지붕 (붉은 기와)
  const peak = 6;
  for (let y = peak; y < wallTop + 3; y++) {
    const half = Math.round(((y - peak) / (wallTop + 3 - peak)) * (W / 2 + 2)) + 6;
    for (let x = W / 2 - half; x < W / 2 + half; x++) {
      const row = Math.floor((y - peak) / 4);
      const c = (y - peak) % 4 === 3 ? 0x7a3226 : (x + row * 3) % 9 === 0 ? 0x9a4430 : row % 2 ? 0xc05a3e : 0xb24e36;
      g.set(x, y, c);
    }
  }
  g.hline(0, W - 1, wallTop + 2, 0x5a2a1e);
  // 현판 (문 위, 글씨는 SeaMap)
  g.rect(W / 2 - 40, wallTop + 4, 80, 12, 0xf4ecd8);
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
    g.rect(wx, wallBot - 30, 28, 18, 0xfff0c4);
    frame(g, wx - 1, wallBot - 31, 30, 20, PAINT.line);
    g.vline(wx + 14, wallBot - 30, wallBot - 13, PAINT.line);
  }
  g.rect(18, wallBot - 27, 8, 10, 0xf8f4ea);
  g.hline(19, 24, wallBot - 24, 0xc04a3a);
  g.rect(W - 36, wallBot - 26, 9, 6, 0x6a8ab0); // 오두막 그림
  g.rect(W - 37, wallBot - 28, 11, 2, 0xb24e36);
  // 꽃밭 (양옆)
  for (const fx of [8, W - 50]) {
    g.rect(fx, wallBot + 1, 42, 4, 0x8a6a4a);
    for (let x = fx + 2; x < fx + 40; x += 4) {
      g.set(x, wallBot, 0x5a8a44);
      g.set(x + 1, wallBot - 1, [0xf0a0b8, 0xf8e8a0, 0xe86a8a][(x >> 2) % 3]);
    }
  }
  g.outline(OUT);
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
  g.rect(9, 26, W - 18, 14, 0x3a3430);
  for (let k = 0; k < 6; k++) g.rect(11 + k * 7, 29, 5, 4, [0xe85a3a, 0xf2c444, 0xf8f0e0, 0x7ab85a][k % 4]);
  for (let k = 0; k < 6; k++) g.rect(11 + k * 7, 35, 5, 3, [0xd8a060, 0xe8d8a8][k % 2]);
  g.rect(6, 40, W - 12, 3, DECK.mid);
  g.hline(6, W - 7, 40, DECK.hi);
  // 차양 (빨강·흰 줄무늬)
  for (let y = 14; y < 22; y++) for (let x = 1; x < W - 1; x++) g.set(x, y, Math.floor(x / 5) % 2 ? (y > 19 ? 0xd8ccb8 : 0xf4ecdc) : y > 19 ? 0xb8402e : 0xd8503c);
  for (let x = 1; x < W - 1; x += 2) g.set(x, 22, Math.floor(x / 5) % 2 ? 0xd8ccb8 : 0xb8402e);
  // 지붕 위 간판 (글씨는 SeaMap)
  g.rect(12, 2, W - 24, 11, 0xf4ecd8);
  frame(g, 11, 1, W - 22, 13, PAINT.line);
  g.outline(OUT);
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
  g.outline(OUT);
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
  g.rect(2, 2, W - 4, 14, 0xf4ecd8);
  frame(g, 1, 1, W - 2, 16, DRIFTWOOD.line);
  g.hline(2, W - 3, 15, 0xd8ccb0);
  g.outline(OUT);
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
      if ((k === 2 || k === 3) && (x === 4 || x === W - 5)) c = 0x5a5650; // 못
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
  g.rect(0, H - 3, W, 3, 0x4a3e30);
  for (let x = 3; x < W; x += 12) g.rect(x, H - 6, 3, 6, 0x3e3226);
  g.outline(OUT);
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
  g.rect(2, 10, 4, 2, 0x5a6a4a); // 물이끼
  g.outline(OUT);
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
  for (let y = 4; y < H; y += 10) g.rect(W / 2 - 1, y, 2, 5, 0xd8b84a);
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
  g.rect(0, H - 3, W, 3, 0x4e5a52); // 젖은 아랫단·물이끼
  for (let x = 2; x < W; x += 5) g.set(x, H - 2, 0x3a6a4a);
  g.outline(OUT);
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
  g.recolor((x, y) => y > 13 && hashU(x, y, v) < 0.5, 0x4e6a52); // 물이끼
  g.outline(OUT);
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
      const baseC: Color = band ? 0xc8443a : 0xf2eee6;
      g.set(x, y, rel < -0.55 ? lighten(baseC, 0.15) : rel > 0.45 ? darken(baseC, 0.22) : baseC);
    }
  }
  // 문 (아래 가운데) · 작은 창
  g.rect(cx - 4, base - 13, 8, 13, 0x2e4a66);
  g.ellipse(cx, base - 13, 4, 2, 0x2e4a66);
  g.set(cx + 2, base - 7, 0xe8c070);
  g.rect(cx - 2, towerTop + 22, 4, 5, 0x2e4a66);
  g.rect(cx - 2, towerTop + 48, 4, 5, 0x2e4a66);
  // 전망대 난간
  g.rect(cx - 13, towerTop - 2, 26, 3, 0x3a3a3e);
  for (let x = cx - 12; x <= cx + 12; x += 3) g.vline(x, towerTop - 7, towerTop - 2, 0x3a3a3e);
  g.hline(cx - 13, cx + 13, towerTop - 7, 0x4a4a50);
  // 등실 (유리) + 지붕
  g.rect(cx - 7, towerTop - 16, 14, 10, 0xfff2b8);
  g.vline(cx - 2, towerTop - 16, towerTop - 7, 0x8a8a7a);
  g.vline(cx + 3, towerTop - 16, towerTop - 7, 0x8a8a7a);
  g.rect(cx - 3, towerTop - 13, 5, 5, 0xffd860);
  for (let y = 0; y < 8; y++) g.hline(Math.round(cx - 2 - y), Math.round(cx + 1 + y), towerTop - 25 + y, y < 2 ? 0xe05a48 : 0xb8402e);
  g.set(cx, towerTop - 27, 0x3a3a3e);
  g.set(cx, towerTop - 26, 0x3a3a3e);
  g.outline(OUT);
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
    for (let x = x0; x <= x1; x++) g.set(x, y, y < 27 ? 0xf2eee6 : y < 29 ? 0x2e5a86 : y > water - 1 ? 0x8a3a30 : 0xc8443a);
  }
  // 뱃전 위 테
  g.hline(3, W - 6, 23, 0x3a3a3e);
  // 조타실
  g.rect(42, 8, 24, 16, 0xf2eee6);
  g.rect(42, 6, 26, 3, 0x2e5a86);
  for (let k = 0; k < 3; k++) g.rect(45 + k * 7, 12, 5, 5, 0x9ad0e4);
  g.vline(66, 9, 23, 0xb4aa98);
  // 돛대·안테나·깃발
  g.vline(30, 0, 23, 0x5a4a3a);
  g.hline(24, 36, 8, 0x5a4a3a);
  g.rect(31, 1, 6, 4, 0xe8c040);
  g.vline(60, 0, 6, 0x3a3a3e);
  // 그물 더미·부표 (갑판 앞)
  g.ellipse(18, 21, 6, 2.5, 0x6a8a6a);
  g.ellipse(14, 20, 1.6, 1.6, 0xf08a3a);
  g.ellipse(22, 20, 1.6, 1.6, 0xf08a3a);
  // 배 이름 자리 (흰 칸)
  g.rect(70, 30, 8, 3, 0xf2eee6);
  // 물가 거품 줄
  for (let x = 6; x < W - 4; x++) if (hashU(x, 1, 71) < 0.65) g.set(x, water + 3, 0xe8f6f4, 200);
  g.outline(OUT);
  return g;
}
export function buoyArt(): Grid {
  const g = new Grid(10, 14);
  g.vline(5, 0, 5, 0x3a3a3e);
  g.set(5, 0, 0xffe080);
  g.ellipse(5, 8, 4, 3.6, 0xd8443a);
  g.hline(2, 8, 7, 0xf2eee6);
  g.set(3, 6, 0xf08a7a);
  g.outline(OUT);
  for (let x = 1; x < 10; x++) if (x % 2) g.set(x, 13, 0xe8f6f4, 180);
  return g;
}

// ── 갯바위 (따개비·미역) ──
export function rockArt(i: number): Grid {
  const R = SEA_ROCKS[i];
  const W = Math.ceil(R.rx * 2) + 8;
  const H = Math.ceil(R.ry * 2) + 22;
  const g = new Grid(W, H);
  const r = rng(1300 + i * 17);
  const cx = W / 2;
  const base = H - 4;
  // 앞에서 본 바위 몸 (아래 넓은 둔덕) + 위에서 본 윗면 덩어리 몇 개 (울퉁불퉁)
  const topY = base - R.ry - 10;
  g.ellipse(cx, base - R.ry * 0.7, R.rx, R.ry * 0.9 + 2, BASALT.lo);
  g.ellipse(cx, topY + 2, R.rx * 0.92, R.ry * 0.8, BASALT.mid);
  for (let k = 0; k < 4; k++) g.ellipse(cx + (r() - 0.5) * R.rx * 1.1, topY + (r() - 0.6) * R.ry * 0.6, R.rx * (0.3 + r() * 0.22), R.ry * (0.42 + r() * 0.25), BASALT.mid);
  // 빛 (왼쪽 위) · 그늘 (오른쪽 아래)
  g.recolor((x, y) => y < topY + R.ry * 0.5 && !g.filled(x - 2, y - 2), BASALT.hi);
  g.recolor((x, y) => y > topY + R.ry * 0.6 && (!g.filled(x + 2, y + 1) || (x > cx + R.rx * 0.4 && hashU(x, y >> 1, i) < 0.7)), BASALT.deep);
  // 틈 (금 두세 줄)
  for (let k = 0; k < 3; k++) {
    const x0 = cx + (r() - 0.5) * R.rx;
    line(g, x0, topY - 2 + r() * 4, x0 + (r() - 0.5) * 8, topY + R.ry * 0.9, BASALT.deep);
  }
  // 따개비 (마른 윗면, 흰 점 무리) · 아래는 젖은 물이끼·미역
  for (let k = 0; k < R.rx * 1.4; k++) {
    const x = Math.round(cx + (r() - 0.5) * R.rx * 1.6);
    const y = Math.round(topY + (r() - 0.3) * R.ry * 1.2);
    if (g.filled(x, y) && g.filled(x + 1, y)) {
      g.set(x, y, 0xece4d4);
      if (r() < 0.4) g.set(x + 1, y, 0xc8c0b0);
    }
  }
  for (let x = 0; x < W; x++)
    for (let y = base - 7; y <= base; y++) if (g.filled(x, y) && hashU(x, y, i + 3) < 0.55) g.set(x, y, hashU(x, y, 9) < 0.5 ? 0x3a5034 : 0x4e4a34);
  g.outline(OUT);
  return g;
}
/** 족욕 바위: 물웅덩이를 품은 납작 바위 고리 (앉기는 다음 차수) */
export function footbathArt(): Grid {
  const g = new Grid(52, 26);
  g.ellipse(26, 13, 24, 10, BASALT.mid);
  g.ellipse(26, 11, 22, 8, BASALT.hi);
  g.ellipse(26, 12, 14, 5.5, 0x5aa4b8);
  g.ellipse(24, 11, 8, 2.5, 0x8ccfe0);
  g.recolor((x, y) => y > 18, BASALT.lo);
  for (let k = 0; k < 10; k++) g.set(8 + k * 4, 6 + (k % 3), 0xe8e0d0);
  g.outline(OUT);
  return g;
}

// ── 소품 ──
export function lampArt(): Grid {
  const g = new Grid(10, 40);
  const base = 37;
  g.rect(4, 10, 2, base - 10, 0x3e4448);
  g.rect(3, base - 2, 4, 3, 0x3e4448);
  g.rect(2, 3, 6, 7, 0x3e4448);
  g.rect(3, 4, 4, 5, 0xfff0c0);
  g.rect(1, 2, 8, 2, 0x2e3438);
  g.set(5, 1, 0x2e3438);
  g.outline(OUT);
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
  g.outline(OUT);
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
  g.outline(OUT, false, 200);
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
const WATER: { body: Color; deep: Color; light: Color; foam: Color } = { body: 0x4f9cb4, deep: 0x3a84a0, light: 0x8ccfe0, foam: 0xf0faf8 };
/** 물 몸통 타일 (반투명 — 아래 갯벌이 비쳐 얕은 물처럼 보여요) */
export const WATER_TILE_W = 64;
export const WATER_TILE_H = 32;
export function waterArt(): Grid {
  const g = new Grid(WATER_TILE_W, WATER_TILE_H);
  for (let y = 0; y < WATER_TILE_H; y++)
    for (let x = 0; x < WATER_TILE_W; x++) {
      const wave = Math.sin(((x + y * 2) / WATER_TILE_W) * Math.PI * 4) + Math.sin(((x * 2 - y) / WATER_TILE_W) * Math.PI * 2);
      let c = wave > 1.4 ? WATER.light : wave < -1.3 ? WATER.deep : WATER.body;
      if (hashU(x, y, 81) > 0.985) c = WATER.light;
      g.set(x, y, c, c === WATER.light ? 214 : 200);
    }
  return g;
}
/** 물가 거품 띠 (가로로 이어 붙는 128px). 위는 비고, 물결 모양 흰 거품 아래로 물 몸통과 같은 색 */
export const FOAM_W = 128;
export const FOAM_H = 16;
export function foamProfile(x: number): number {
  return 5 + 2.4 * Math.sin((x / FOAM_W) * Math.PI * 2 * 3) + 1.4 * Math.sin((x / FOAM_W) * Math.PI * 2 * 7 + 1);
}
export function foamArt(): Grid {
  const g = new Grid(FOAM_W, FOAM_H);
  for (let x = 0; x < FOAM_W; x++) {
    const p = Math.round(foamProfile(x));
    for (let y = p; y < FOAM_H; y++) {
      const d = y - p;
      if (d < 2) g.set(x, y, WATER.foam, 240);
      else if (d < 4) g.set(x, y, hashU(x, y, 83) < 0.55 ? WATER.foam : WATER.light, 210);
      else g.set(x, y, hashU(x, y, 84) < 0.06 ? WATER.light : WATER.body, 200);
    }
  }
  return g;
}
/** 물러난 거품 자국 (가는 레이스 줄) */
export function laceArt(): Grid {
  const g = new Grid(FOAM_W, 6);
  for (let x = 0; x < FOAM_W; x++) {
    const y = Math.round(2.5 + 1.6 * Math.sin((x / FOAM_W) * Math.PI * 2 * 5 + 2));
    if (hashU(x, 1, 85) < 0.8) g.set(x, y, WATER.foam, 200);
    if (hashU(x, 2, 85) < 0.3) g.set(x, y + 1, WATER.foam, 140);
  }
  return g;
}
/** 젖은 모래 띠 (세로 그라데이션: 위는 투명, 아래로 짙게 — 높이로 늘려 써요) */
export function wetArt(): Grid {
  const g = new Grid(4, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 4; x++) g.set(x, y, 0x3e3428, Math.round(130 * (y / 31) ** 1.4));
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
    for (let k = 0; k < w; k++) g.set((x + k) % 128, y, 0xd8f2f8, k === 0 || k === w - 1 ? 110 : 170);
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

// ── 바닥 (덩어리마다 RGBA로 굽는다) ──

export const SEA_CHUNK = 512;

const GC = {
  hill: [0x4c5a38, 0x3e4a2e, 0x5a6842] as const,
  hillRock: [0x8a8478, 0x6e6a62] as const,
  grass: [0x8a9150, 0x7a8246, 0x9aa05e, 0x6e7840] as const,
  path: [0xc0a77a, 0xb0966a, 0xceb88c] as const,
  yard: [0xd2bf94, 0xc4b084, 0xdccaa0] as const,
  lot: [0xa48a64, 0x947a56, 0xb49a72] as const,
  platform: [0xb4b0a6, 0x928e86] as const,
  road: [0x55524e, 0x4a4744, 0x625f5a] as const,
  sand: [0xe2cc96, 0xd4bc84, 0xecd9a8] as const,
  flat: [0x857862, 0x76695a, 0x93876e] as const,
  deep: [0x2a6080, 0x24546e, 0x326c8c] as const,
};

/** 부드러운 값 잡음 (격자 해시를 겹선형 보간) 0..1 */
function smoothNoise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hashU(x0, y0, salt);
  const b = hashU(x0 + 1, y0, salt);
  const c = hashU(x0, y0 + 1, salt);
  const d = hashU(x0 + 1, y0 + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function put(d: Uint8ClampedArray, i: number, c: Color, a = 255): void {
  d[i] = (c >> 16) & 255;
  d[i + 1] = (c >> 8) & 255;
  d[i + 2] = c & 255;
  d[i + 3] = a;
}

/** 버스 정차 칸 (정류장 앞 길, 오른쪽에서 들어온 버스 몸이 서는 자리) */
const BAY = { x0: SEA_BUS_STOP.x - 30, x1: SEA_BUS_STOP.x + 98, y0: SEA_ROAD.y + 6, y1: SEA_ROAD.y + SEA_ROAD.h - 5 };

/** 바닥 한 점 색 */
function groundColor(x: number, y: number, k: SeaGround): Color {
  const n = hashU(x, y, 1);
  switch (k) {
    case "hill": {
      const rock = smoothNoise(x / 14, y / 10, 91) > 0.66;
      if (rock) return n < 0.3 ? GC.hillRock[1] : GC.hillRock[0];
      if (hashU(x >> 1, y >> 1, 92) < 0.08) return 0x8a6a40; // 솔잎
      return n < 0.2 ? GC.hill[1] : n > 0.85 ? GC.hill[2] : GC.hill[0];
    }
    case "platform": {
      if (x % 12 === 0 || y % 10 === 0) return GC.platform[1];
      if (y >= SEA_PLATFORM.y + SEA_PLATFORM.h - 3) return 0xd0ccc0; // 연석
      return hashU(x >> 1, y >> 1, 93) < 0.05 ? GC.platform[1] : GC.platform[0];
    }
    case "road": {
      let c: Color = n < 0.12 ? GC.road[1] : n > 0.9 ? GC.road[2] : GC.road[0];
      if (y < SEA_ROAD.y + 3 || y > SEA_ROAD.y + SEA_ROAD.h - 3) c = n < 0.5 ? 0x9a968c : 0xb4b0a4; // 연석
      // 정류장 앞 노란 정차 칸
      if (x >= BAY.x0 && x <= BAY.x1 && y >= BAY.y0 && y <= BAY.y1) {
        const onEdge = y <= BAY.y0 + 1 || y >= BAY.y1 - 1 ? (x >> 2) % 2 === 0 : x <= BAY.x0 + 1 || x >= BAY.x1 - 1;
        if (onEdge) c = 0xe8c040;
        return c;
      }
      // 바랜 가운데 점선 (흰색)
      const mid = SEA_ROAD.y + Math.floor(SEA_ROAD.h / 2);
      if ((y === mid || y === mid + 1) && (x >> 3) % 2 === 0 && hashU(x >> 3, 1, 95) < 0.8) c = 0xc8c4b8;
      return c;
    }
    case "path":
      if (hashU(x, y, 96) > 0.975) return 0xe8dcc4; // 조개 부스러기
      return n < 0.16 ? GC.path[1] : n > 0.86 ? GC.path[2] : GC.path[0];
    case "yard":
      if (hashU(x, y, 97) > 0.97) return 0xf4ecdc;
      return n < 0.15 ? GC.yard[1] : n > 0.88 ? GC.yard[2] : GC.yard[0];
    case "lot":
      if (hashU(x >> 1, y >> 1, 98) < 0.06) return GC.grass[1];
      return n < 0.18 ? GC.lot[1] : n > 0.86 ? GC.lot[2] : GC.lot[0];
    case "boardwalk": {
      const top = SEA_BOARDWALK.y;
      const bot = SEA_BOARDWALK.y + SEA_BOARDWALK.h - 1;
      if (y <= top + 2 || y >= bot - 2) return y === top || y === bot ? DECK.line : DECK.lo; // 테 판
      const k = x % 7;
      if (k === 6) return DECK.line;
      if ((y === top + 5 || y === bot - 5) && k === 3) return 0x5a5650; // 못
      if (k === 0) return DECK.hi;
      return hashU(x, y >> 2, 99) < 0.08 ? DECK.lo : mix(DECK.mid, DECK.hi, hashU(Math.floor(x / 7), 0, 100) * 0.4);
    }
    case "sand": {
      let c: Color = n < 0.15 ? GC.sand[1] : n > 0.88 ? GC.sand[2] : GC.sand[0];
      if (hashU(x, y, 101) > 0.975) c = 0xb89c6a;
      // 바람 결 (가는 물결무늬)
      if (((y + Math.round(Math.sin(x * 0.04) * 3)) % 9 === 0) && hashU(x >> 2, y, 102) < 0.5) c = darken(c, 0.06);
      // 갯벌 가까이는 촉촉하게
      const toFlat = SEA_FLAT_Y0 - y;
      if (toFlat < 16) c = mix(c, 0xb49a72, (16 - toFlat) / 16 * 0.55);
      return c;
    }
    case "pool": {
      const d = poolDepth(x, y);
      if (d < 0.18) return n < 0.5 ? 0x5e5444 : 0x6a5e4c; // 젖은 테두리
      let c: Color = d > 0.6 ? 0x3f88a0 : 0x5aa4b8;
      if (hashU(x >> 1, y, 103) > 0.94) c = 0x9ad8e6;
      if (hashU(x, y, 104) > 0.985) c = 0x3a6a3a; // 해초
      return c;
    }
    case "flat": {
      let c: Color = n < 0.18 ? GC.flat[1] : n > 0.86 ? GC.flat[2] : GC.flat[0];
      // 물결 자국 (가로로 굽이치는 줄)
      const ry = y + Math.round(3 * Math.sin(x * 0.05 + y * 0.013));
      if (ry % 8 === 0) c = darken(c, 0.14);
      else if (ry % 8 === 1) c = lighten(c, 0.08);
      if (hashU(x, y, 105) > 0.996) c = 0xcfc2ac; // 조개 조각
      if (hashU(x >> 1, y >> 1, 106) > 0.993) c = 0x4a4034; // 게 구멍
      // 모래 쪽 가장자리
      const fromSand = y - SEA_FLAT_Y0;
      if (fromSand < 10) c = mix(0xb49a72, c, Math.max(0, fromSand) / 10);
      // 먼바다 쪽은 더 질고 어둡게
      const toDeep = SEA_DEEP_Y - y;
      if (toDeep < 24) c = mix(c, 0x4e5650, (24 - toDeep) / 24 * 0.6);
      return c;
    }
    case "deep": {
      let c: Color = n < 0.2 ? GC.deep[1] : n > 0.9 ? GC.deep[2] : GC.deep[0];
      const wave = (y + Math.round(Math.sin(x * 0.07) * 2)) % 11 === 0 && hashU(x >> 3, y, 107) < 0.6;
      if (wave) c = 0x4a8aa8;
      const fromEdge = y - SEA_DEEP_Y;
      if (fromEdge < 10) c = mix(0x4e5650, c, Math.max(0, fromEdge) / 10);
      return c;
    }
    case "grass":
    default: {
      // 바닷가 풀밭: 남쪽(산책로 쪽)으로 갈수록 모래가 섞여요
      const sandy = Math.max(0, (y - 300) / 90);
      if (hashU(x >> 1, y >> 1, 108) < sandy * 0.35) return n < 0.5 ? GC.sand[1] : GC.sand[0];
      if (n > 0.95) return 0xb0b068;
      const g0 = n < 0.18 ? GC.grass[1] : n > 0.86 ? GC.grass[2] : GC.grass[0];
      return hashU(x >> 3, y >> 3, 109) < 0.18 ? mix(g0, GC.grass[3], 0.5) : g0;
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
        put(out, (py * size + px) * 4, d > 0.6 ? (y < 0 ? 0x5e5444 : 0x9a8e76) : d > 0.3 ? 0x4a4034 : 0x2e2820);
      }
  return out;
}
