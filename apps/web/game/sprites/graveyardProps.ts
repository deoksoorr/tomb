import { darken, Grid, lighten, makeCanvas, rng, type Color } from "./pixel";

// F1 묘지 마을 소품 픽셀아트: 오래된 묘비·십자가·오벨리스크(장식, 사람의 묘비가 아니다), 촛불, 납골당, 철책·묘역 문,
// 땅안개, 사냥터 팻말, 수양버들, 광장의 아주 큰 모닥불(불꽃 시트·돌 화덕).
// 원점 = 바닥 가운데 (0.5, 1) — worldProps.ts와 같은 규칙. 맨 아래 줄 근처는 그림자.

const OUT = 0x1c1a1a;
const STONE = { hi: 0xa9a79d, mid: 0x8b897f, lo: 0x66645c, deep: 0x4a4943, line: 0x34332f };
const MOSS = [0x5c6b44, 0x4d5c3a, 0x6c7a4c] as const;
const IRON = { hi: 0x6c6c78, mid: 0x3c3c46, lo: 0x26262e };
const WOOD = { hi: 0x8a6c4c, mid: 0x6c5238, lo: 0x4c3a28, line: 0x2a2018 };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, w = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.rect(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), w, w, c);
}

/** 이끼·얼룩을 흩뿌린다 (채워진 픽셀에만) */
function weather(g: Grid, seed: number, n: number, y0 = 0) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * g.w);
    const y = y0 + Math.floor(r() * (g.h - y0));
    if (!g.filled(x, y)) continue;
    g.set(x, y, r() < 0.55 ? MOSS[Math.floor(r() * MOSS.length)] : STONE.deep);
  }
}

// ── 오래된 묘비 (장식, 16×30) ── v0 둥근 비석 · v1 돌 십자가 · v2 기운 깨진 비석 · v3 나무 십자가 · v4 오벨리스크
export const OLD_GRAVE_VARIANTS = 5;
export function oldGrave(v: number): HTMLCanvasElement {
  const g = new Grid(16, 30);
  const s = STONE;
  switch (v % OLD_GRAVE_VARIANTS) {
    case 0: {
      // 둥근 머리 비석 + 받침
      g.rect(3, 13, 10, 13, s.mid);
      g.ellipse(7.5, 13, 5, 4, s.mid);
      g.vline(3, 12, 25, s.hi);
      g.vline(12, 12, 25, s.lo);
      g.hline(5, 10, 16, s.deep);
      g.hline(5, 10, 18, s.deep);
      g.hline(6, 9, 20, s.deep);
      g.rect(2, 25, 12, 2, s.lo);
      g.hline(2, 13, 25, s.hi);
      line(g, 9, 11, 7, 15, s.deep);
      weather(g, 11, 10, 18);
      break;
    }
    case 1: {
      // 돌 십자가 (켈트풍 고리)
      g.rect(6, 6, 4, 20, s.mid);
      g.rect(2, 10, 12, 4, s.mid);
      g.vline(6, 6, 25, s.hi);
      g.hline(2, 13, 10, s.hi);
      g.vline(9, 6, 25, s.lo);
      for (const [x, y] of [[4, 8], [11, 8], [4, 15], [11, 15]]) g.set(x, y, s.lo);
      g.rect(4, 25, 8, 2, s.lo);
      weather(g, 23, 8, 12);
      break;
    }
    case 2: {
      // 기울어진 깨진 비석 (윗부분이 떨어져 나감)
      for (let y = 10; y < 26; y++) {
        const lean = Math.round((26 - y) * 0.18);
        const top = y < 13 ? (y - 10) * 2 : 0;
        g.hline(3 + lean + top, 11 + lean, y, y < 12 ? s.hi : s.mid);
        g.set(11 + lean, y, s.lo);
      }
      g.rect(1, 25, 13, 2, s.lo);
      g.set(13, 24, s.mid);
      g.set(14, 25, s.mid);
      line(g, 6, 14, 9, 19, s.deep);
      weather(g, 37, 12, 12);
      break;
    }
    case 3: {
      // 썩어 가는 나무 십자가 + 흙무덤
      g.ellipse(8, 26, 7, 2.2, 0x4a3c2e);
      g.hline(2, 13, 25, 0x5a4a38);
      g.rect(7, 7, 3, 19, WOOD.mid);
      g.vline(7, 7, 25, WOOD.hi);
      g.rect(3, 11, 11, 3, WOOD.mid);
      g.hline(3, 13, 11, WOOD.hi);
      g.set(13, 13, WOOD.lo);
      g.set(9, 18, WOOD.lo);
      g.set(5, 12, WOOD.lo);
      break;
    }
    default: {
      // 오벨리스크
      for (let y = 2; y < 25; y++) {
        const hw = y < 6 ? (y - 2) * 0.6 : 2.5 + (y - 6) * 0.08;
        g.hline(Math.round(8 - hw), Math.round(7 + hw), y, s.mid);
        g.set(Math.round(8 - hw), y, s.hi);
        g.set(Math.round(7 + hw), y, s.lo);
      }
      g.rect(3, 24, 10, 3, s.lo);
      g.hline(3, 12, 24, s.hi);
      g.hline(6, 9, 14, s.deep);
      weather(g, 53, 10, 10);
      break;
    }
  }
  g.outline(OUT);
  shadow(g, 8, 28, 7, 1.4, 70);
  return g.toCanvas();
}

// ── 촛불 무리 (12×12): 녹아내린 흰 초 두세 자루, 작은 불꽃 (빛은 propLight) ──
export function candles(v: number): HTMLCanvasElement {
  const g = new Grid(12, 12);
  const sets = v % 2 ? [[2, 5], [6, 3], [9, 6]] : [[3, 4], [7, 6]];
  for (const [x, top] of sets) {
    g.rect(x, top + 2, 2, 9 - top, 0xe8e0cc);
    g.vline(x, top + 2, 10, 0xfff6e0);
    g.set(x + 1, 10, 0xc8bea8);
    g.set(x, top + 1, 0x2a2420);
    g.set(x, top, 0xffd060);
    g.set(x, top - 1, 0xfff0b0, 220);
    g.set(x + 1, top, 0xff9a40, 200);
  }
  g.hline(1, 10, 11, 0xd8ccb4);
  return g.toCanvas();
}

// ── 납골당 (64×62): 돌 기둥·삼각 지붕·쇠문·십자가, 이끼 낀 계단 ──
export const CRYPT_W = 64;
export const CRYPT_H = 62;
export function crypt(): HTMLCanvasElement {
  const g = new Grid(CRYPT_W, CRYPT_H);
  const s = STONE;
  // 몸채
  g.rect(8, 24, 48, 30, s.mid);
  for (let y = 26; y < 54; y += 5) g.hline(9, 54, y, s.lo);
  for (let y = 26; y < 54; y += 5) for (let x = 12 + ((y / 5) % 2) * 6; x < 54; x += 12) g.vline(x, y, y + 4, s.lo);
  // 지붕 (삼각)
  for (let y = 0; y < 14; y++) {
    const hw = 4 + y * 2.1;
    g.hline(Math.round(32 - hw), Math.round(31 + hw), 10 + y, y < 2 ? s.hi : y < 12 ? 0x5e5d58 : s.deep);
  }
  g.hline(4, 59, 24, s.hi);
  g.hline(4, 59, 25, s.lo);
  // 지붕 꼭대기 십자가
  g.rect(31, 1, 2, 10, s.hi);
  g.rect(28, 3, 8, 2, s.hi);
  // 기둥
  for (const x of [10, 18, 42, 50]) {
    g.rect(x, 26, 4, 28, s.hi);
    g.vline(x + 3, 26, 53, s.lo);
    g.hline(x - 1, x + 4, 26, lighten(s.hi, 0.1));
  }
  // 쇠문 (아치)
  g.rect(25, 32, 14, 22, IRON.lo);
  g.ellipse(31.5, 32, 7, 4, IRON.lo);
  for (let x = 27; x < 38; x += 3) g.vline(x, 30, 53, IRON.mid);
  g.hline(25, 38, 40, IRON.hi);
  g.set(36, 44, 0xc8a050);
  // 계단
  g.rect(20, 54, 24, 3, s.lo);
  g.hline(20, 43, 54, s.hi);
  g.rect(16, 57, 32, 3, s.deep);
  g.hline(16, 47, 57, s.mid);
  // 이끼·얼룩
  const r = rng(91);
  for (let i = 0; i < 70; i++) {
    const x = 8 + Math.floor(r() * 48);
    const y = 12 + Math.floor(r() * 44);
    if (g.filled(x, y) && r() < 0.6) g.set(x, y, MOSS[Math.floor(r() * 3)]);
  }
  g.outline(OUT);
  shadow(g, 32, 60, 30, 2.2, 80);
  return g.toCanvas();
}

// ── 철책 ── 가로 한 칸(16×18): 창끝 쇠살 4개 + 가로대 두 줄. 세로 한 칸(6×22): 옆에서 본 쇠살. 모서리·문 기둥(8×26): 돌기둥
export const FENCE_H_W = 16;
export const FENCE_H_H = 18;
export function fenceH(): HTMLCanvasElement {
  const g = new Grid(FENCE_H_W, FENCE_H_H);
  g.hline(0, 15, 6, IRON.mid);
  g.hline(0, 15, 13, IRON.mid);
  g.hline(0, 15, 5, IRON.hi);
  for (let x = 1; x < 16; x += 4) {
    g.vline(x, 3, 16, IRON.mid);
    g.set(x, 2, IRON.hi);
    g.set(x, 1, IRON.hi);
    g.set(x - 1, 3, IRON.mid);
    g.set(x + 1, 3, IRON.mid);
  }
  g.set(15, 6, IRON.lo);
  g.outline(OUT, false, 200);
  for (let x = 0; x < 16; x++) if (!g.filled(x, 17)) g.set(x, 17, 0x000000, 50);
  return g.toCanvas();
}
export const FENCE_V_W = 6;
export const FENCE_V_H = 22;
export function fenceV(): HTMLCanvasElement {
  const g = new Grid(FENCE_V_W, FENCE_V_H);
  g.vline(2, 4, 20, IRON.mid);
  g.vline(3, 6, 20, IRON.lo);
  g.set(2, 3, IRON.hi);
  g.set(2, 2, IRON.hi);
  g.hline(1, 4, 9, IRON.hi);
  g.hline(1, 4, 16, IRON.mid);
  g.outline(OUT, false, 200);
  g.set(1, 21, 0x000000, 60);
  g.set(4, 21, 0x000000, 60);
  return g.toCanvas();
}
export function fencePost(): HTMLCanvasElement {
  const g = new Grid(8, 26);
  const s = STONE;
  g.rect(1, 6, 6, 18, s.mid);
  g.vline(1, 6, 23, s.hi);
  g.vline(6, 6, 23, s.lo);
  g.rect(0, 4, 8, 3, s.hi);
  g.hline(0, 7, 6, s.lo);
  g.rect(2, 1, 4, 3, s.mid);
  g.set(3, 0, s.hi);
  weather(g, 71, 6, 8);
  g.outline(OUT);
  shadow(g, 4, 24.5, 4, 1, 70);
  return g.toCanvas();
}

// ── 묘역 문 (56×50): 돌기둥 두 개 + 쇠 아치 (안쪽 폭 32). 아치 가운데 팻말 자리(이름표는 WorldMap) ──
export const GRAVE_GATE_W = 56;
export const GRAVE_GATE_H = 50;
export function graveGate(): HTMLCanvasElement {
  const g = new Grid(GRAVE_GATE_W, GRAVE_GATE_H);
  const s = STONE;
  for (const x0 of [4, 44]) {
    g.rect(x0, 18, 8, 30, s.mid);
    g.vline(x0, 18, 47, s.hi);
    g.vline(x0 + 7, 18, 47, s.lo);
    g.rect(x0 - 1, 15, 10, 4, s.hi);
    g.hline(x0 - 1, x0 + 8, 18, s.lo);
    g.ellipse(x0 + 3.5, 13, 3, 2.5, s.mid);
  }
  // 쇠 아치 (두 줄) + 소용돌이 장식
  for (let x = 12; x <= 43; x++) {
    const t = (x - 27.5) / 15.5;
    const y = Math.round(18 - 9 * (1 - t * t));
    g.set(x, y, IRON.mid);
    g.set(x, y + 4, IRON.mid);
    if ((x - 12) % 4 === 0) g.vline(x, y, y + 4, IRON.mid);
  }
  for (const [x, y] of [[16, 15], [39, 15]]) {
    g.set(x, y, IRON.hi);
    g.set(x + 1, y - 1, IRON.hi);
  }
  // 팻말
  g.rect(19, 3, 18, 8, WOOD.mid);
  g.hline(19, 36, 3, WOOD.hi);
  g.hline(19, 36, 10, WOOD.lo);
  g.vline(22, 11, 13, IRON.mid);
  g.vline(33, 11, 13, IRON.mid);
  weather(g, 83, 10, 20);
  g.outline(OUT);
  shadow(g, 8, 48.5, 6, 1.2, 70);
  shadow(g, 48, 48.5, 6, 1.2, 70);
  return g.toCanvas();
}

// ── 땅안개 한 덩이 (72×26, 부드러운 흰 구름 — 캔버스 그라데이션) ──
export const MIST_W = 72;
export const MIST_H = 26;
export function mistPuff(v: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(MIST_W, MIST_H);
  const r = rng(131 + v * 7);
  for (let i = 0; i < 5; i++) {
    const cx = 14 + r() * 44;
    const cy = 10 + r() * 7;
    const rad = 9 + r() * 9;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grd.addColorStop(0, "rgba(214,222,230,0.55)");
    grd.addColorStop(1, "rgba(214,222,230,0)");
    ctx.fillStyle = grd;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.8, 0.7);
    ctx.translate(-cx, -cy);
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return canvas;
}

// ── 사냥터 팻말 (30×32): 기둥 + 화살표 판자 + 해골 (글씨는 WorldMap 이름표) ──
export function huntSign(): HTMLCanvasElement {
  const g = new Grid(30, 32);
  g.rect(14, 10, 3, 20, WOOD.mid);
  g.vline(14, 10, 29, WOOD.hi);
  // 판자 (오른쪽 위 = 동굴 쪽 화살표)
  g.rect(2, 4, 22, 9, WOOD.mid);
  g.hline(2, 23, 4, WOOD.hi);
  g.hline(2, 23, 12, WOOD.lo);
  for (let i = 0; i < 4; i++) g.vline(24 + i, 5 + i, 11 - i, WOOD.mid);
  // 해골
  g.rect(5, 6, 5, 4, 0xe8e2d0);
  g.set(6, 7, 0x2a2420);
  g.set(8, 7, 0x2a2420);
  g.hline(6, 8, 10, 0xd0c8b4);
  // 칼집 자국
  line(g, 12, 7, 20, 7, WOOD.lo);
  line(g, 12, 9, 18, 9, WOOD.lo);
  g.outline(WOOD.line);
  shadow(g, 15, 30.5, 6, 1.1, 70);
  return g.toCanvas();
}

// ── 수양버들 (40×46): 늘어진 잿빛 초록 가지 ──
export function willow(v: number): HTMLCanvasElement {
  const g = new Grid(40, 46);
  const r = rng(201 + v * 17);
  const leaf = v % 2 ? { hi: 0x7a8a5e, mid: 0x5d6c48, lo: 0x445238 } : { hi: 0x8a8a5a, mid: 0x6a6c46, lo: 0x4c5034 };
  g.rect(18, 26, 4, 18, WOOD.lo);
  g.vline(18, 26, 43, WOOD.mid);
  line(g, 20, 28, 12, 18, WOOD.lo, 2);
  line(g, 20, 28, 29, 17, WOOD.lo, 2);
  g.ellipse(20, 13, 15, 9, leaf.mid);
  // 늘어진 가지
  for (let i = 0; i < 26; i++) {
    const x = 5 + Math.floor(r() * 30);
    const top = 8 + Math.floor(r() * 8);
    const len = 12 + Math.floor(r() * 16);
    for (let y = top; y < Math.min(40, top + len); y++) g.set(x + (y > top + len / 2 ? (x < 20 ? -1 : 1) : 0), y, r() < 0.5 ? leaf.mid : leaf.lo);
  }
  g.recolor((x, y) => g.filled(x, y) && !g.filled(x, y - 1) && y < 20, leaf.hi);
  g.outline(OUT, false, 220);
  shadow(g, 20, 44, 13, 1.8, 65);
  return g.toCanvas();
}

// ── 광장의 아주 큰 모닥불 (F1) ── 불꽃 시트 BIG_FIRE_FRAMES × (36×52), 돌 화덕 + 장작 더미 (80×34)
export const BIG_FIRE_W = 36;
export const BIG_FIRE_H = 52;
export const BIG_FIRE_FRAMES = 8;
export function bigFireSheet(): HTMLCanvasElement {
  const g = new Grid(BIG_FIRE_W * BIG_FIRE_FRAMES, BIG_FIRE_H);
  const layers: [number, Color][] = [
    [1, 0xb8322a],
    [0.84, 0xe8602a],
    [0.66, 0xf8922e],
    [0.46, 0xffc84a],
    [0.24, 0xfff2b8],
  ];
  for (let f = 0; f < BIG_FIRE_FRAMES; f++) {
    const ox = f * BIG_FIRE_W;
    const ph = (f / BIG_FIRE_FRAMES) * Math.PI * 2;
    const r = rng(733 + f * 11);
    for (const [k, c] of layers) {
      for (let x = 2; x <= 33; x++) {
        const t = (x - 17.5) / 15.5;
        const prof = Math.max(0, 1 - t * t * 1.1);
        // 혀가 여러 갈래로 일렁인다
        const flick = 0.74 + 0.16 * Math.sin(ph + x * 0.9) + 0.1 * Math.sin(ph * 2 - x * 0.55) + 0.06 * Math.sin(ph * 3 + x * 1.7);
        const h = Math.round(44 * prof * flick * k);
        if (h <= 0) continue;
        const sway = Math.round(Math.sin(ph + (x - 17) * 0.18) * 1.6 * (k < 0.5 ? 0.6 : 1));
        for (let y = 46 - h; y <= 46; y++) g.set(ox + x + (y < 46 - h * 0.45 ? sway : 0), y, c);
      }
    }
    // 위로 튀는 불티
    for (let i = 0; i < 6; i++) {
      const x = 6 + Math.floor(r() * 24);
      const y = 1 + Math.floor(r() * 12);
      g.set(ox + x, y, r() < 0.5 ? 0xffd060 : 0xff8a3a, 210);
    }
    // 장작 끝 (불꽃 아래에서 빛나는 숯)
    for (let x = 6; x <= 29; x += 3) g.set(ox + x, 47 + (x % 2), r() < 0.5 ? 0xff6a2a : 0xffa040);
  }
  return g.toCanvas();
}

/** 큰 모닥불 받침: 돌 화덕 고리 + 쌓아 올린 장작 + 그을린 바닥 (바닥 장식, 80×34, 원점 가운데) */
export const BIG_RING_W = 80;
export const BIG_RING_H = 34;
export function bigFireRing(): HTMLCanvasElement {
  const g = new Grid(BIG_RING_W, BIG_RING_H);
  for (let y = 0; y < BIG_RING_H; y++)
    for (let x = 0; x < BIG_RING_W; x++) {
      const dx = (x + 0.5 - 40) / 38;
      const dy = (y + 0.5 - 17) / 16;
      const d = dx * dx + dy * dy;
      if (d <= 1) g.set(x, y, d < 0.5 ? 0x231e1c : 0x332c28, d < 0.5 ? 235 : 130);
    }
  // 장작 (방사형으로 기대 세운 통나무)
  const logs: [number, number, number, number][] = [
    [22, 22, 36, 12],
    [58, 22, 44, 12],
    [26, 13, 38, 18],
    [54, 13, 42, 18],
    [40, 26, 40, 12],
  ];
  for (const [x0, y0, x1, y1] of logs) {
    line(g, x0, y0, x1, y1, WOOD.lo, 3);
    line(g, x0, y0 - 1, x1, y1 - 1, WOOD.mid, 1);
    g.set(x0, y0, 0xc8a878);
  }
  // 돌 고리 (두 겹)
  const r = rng(177);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const x = Math.round(40 + Math.cos(a) * 33);
    const y = Math.round(17 + Math.sin(a) * 13);
    const c = r() < 0.35 ? STONE.hi : r() < 0.7 ? STONE.mid : STONE.lo;
    g.rect(x - 2, y - 1, 4, 3, c);
    g.hline(x - 2, x + 1, y - 1, lighten(c, 0.12));
    g.hline(x - 2, x + 1, y + 1, darken(c, 0.2));
  }
  for (const [x, y] of [[34, 19], [44, 17], [39, 21], [48, 21], [30, 16]]) g.set(x, y, 0xc0502a);
  return g.toCanvas();
}

// ── 텍스처 키 (manifest가 GY_ART·GY_SHEETS를 코드 생성 항목으로 등록한다) ──
export const GY = {
  old0: "gy-old-0",
  old1: "gy-old-1",
  old2: "gy-old-2",
  old3: "gy-old-3",
  old4: "gy-old-4",
  candle0: "gy-candle-0",
  candle1: "gy-candle-1",
  crypt: "gy-crypt",
  fenceH: "gy-fence-h",
  fenceV: "gy-fence-v",
  fencePost: "gy-fence-post",
  gate: "gy-gate",
  mist0: "gy-mist-0",
  mist1: "gy-mist-1",
  sign: "gy-hunt-sign",
  willow0: "gy-willow-0",
  willow1: "gy-willow-1",
  bigFire: "gy-big-fire",
  bigRing: "gy-big-ring",
} as const;

export const GY_ART: Readonly<Record<string, () => HTMLCanvasElement>> = {
  [GY.old0]: () => oldGrave(0),
  [GY.old1]: () => oldGrave(1),
  [GY.old2]: () => oldGrave(2),
  [GY.old3]: () => oldGrave(3),
  [GY.old4]: () => oldGrave(4),
  [GY.candle0]: () => candles(0),
  [GY.candle1]: () => candles(1),
  [GY.crypt]: crypt,
  [GY.fenceH]: fenceH,
  [GY.fenceV]: fenceV,
  [GY.fencePost]: fencePost,
  [GY.gate]: graveGate,
  [GY.mist0]: () => mistPuff(0),
  [GY.mist1]: () => mistPuff(1),
  [GY.sign]: huntSign,
  [GY.willow0]: () => willow(0),
  [GY.willow1]: () => willow(1),
  [GY.bigRing]: bigFireRing,
};

export const GY_SHEETS: Readonly<Record<string, { build: () => HTMLCanvasElement; frameW: number; frameH: number }>> = {
  [GY.bigFire]: { build: bigFireSheet, frameW: BIG_FIRE_W, frameH: BIG_FIRE_H },
};
