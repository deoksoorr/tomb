import {
  CAMP_BUS_STOP,
  CAMP_CROSSINGS,
  CAMP_HEIGHT,
  CAMP_WIDTH,
  CAMP_FIRE,
  CAMP_LOOKOUT,
  CAMP_LOOKOUT_STAIRS,
  CAMP_PLAZA_R,
  CAMP_ROAD,
  CAMP_STEP_STONES,
  CAMP_STREAM_HALF_W,
  campStreamX,
  type CampNpcId,
} from "@tomb/protocol";
import { darken, Grid, lighten, mix, rng, type Color } from "../sprites/pixel";
import { CAMP_SUMMIT, campGroundKind, hashU, pathEdgeDist, type CampGround } from "./campLayout";
import { CAMP_TEX_PREFIX } from "./campTypes";

// 11/15 언젠가 캠핑장 픽셀 아트 (코드로 그린다, 마을 그림 재탕 없이 새로).
// 늦가을 숲(노란 낙엽 + 침엽수), 마을보다 밝고 따뜻한 색. 원점 = 바닥 가운데 (0.5, 1), 맨 아래 줄 근처는 그림자 (마을 props와 같은 규칙).
// 모든 함수는 순수(Grid·RGBA 배열)라 Phaser·DOM 없이도 돈다 — CampMap이 캔버스로 바꿔 텍스처로 올린다.
// 텍스처 키는 CAMP_TEX의 값 (모두 "camp-"로 시작 → 장면을 닫을 때 한꺼번에 지운다).

const OUT = 0x2c2018;
const P = CAMP_TEX_PREFIX;

export const CAMP_TEX = {
  spruce: (v: number) => `${P}spruce${v}`,
  pine: (v: number) => `${P}pine${v}`,
  fir: (v: number) => `${P}fir${v}`,
  maple: (v: number) => `${P}maple${v}`,
  mapleO: (v: number) => `${P}mapleO${v}`,
  yellow: (v: number) => `${P}yellow${v}`,
  bush: (v: number) => `${P}bush${v}`,
  leafPile: (v: number) => `${P}leafPile${v}`,
  mushroom: (v: number) => `${P}mushroom${v}`,
  fern: (v: number) => `${P}fern${v}`,
  pebbles: (v: number) => `${P}pebbles${v}`,
  boulder: (v: number) => `${P}boulder${v}`,
  rockSeat: `${P}rockSeat`,
  logChair: `${P}logChair`,
  bench: `${P}bench`,
  rustyBench: `${P}rustyBench`,
  plankBench2: `${P}plankBench2`,
  plankBench3: `${P}plankBench3`,
  table: `${P}table`,
  deck: (n: number) => `${P}deck${n}`,
  office: `${P}office`,
  board: `${P}board`,
  fireRing: `${P}fireRing`,
  flames: `${P}flames`,
  bridge: `${P}bridge`,
  van: (i: number, open: boolean) => `${P}van${i}${open ? "o" : "c"}`,
  tarp: `${P}tarp`,
  tarpPole: `${P}tarpPole`,
  lookoutFloor: `${P}lookoutFloor`,
  lookoutFront: `${P}lookoutFront`,
  pole: `${P}pole`,
  bulb: `${P}bulb`,
  bulbGlow: `${P}bulbGlow`,
  shelter: `${P}shelter`,
  busSign: `${P}busSign`,
  timetable: `${P}timetable`,
  npc: (id: CampNpcId) => `${P}npc-${id}`,
  squirrel: `${P}squirrel`,
  milkyWay: `${P}milkyWay`,
  mist: `${P}mist`,
  sunGlow: `${P}sunGlow`,
  sparkle: `${P}sparkle`,
  ember: `${P}ember`,
  firefly: `${P}firefly`,
  drip: `${P}drip`,
  ground: (cx: number, cy: number) => `${P}ground-${cx}-${cy}`,
  // 11/15 캠핑카 앞 캠핑 도구 · 문패 팻말
  foldTable: `${P}foldTable`,
  campChairFront: (i: number) => `${P}campChairF${i}`,
  campChairSide: (i: number) => `${P}campChairS${i}`,
  brazier: `${P}brazier`,
  brazierFire: `${P}brazierFire`,
  lantern: `${P}lantern`,
  icebox: `${P}icebox`,
  plateSign: `${P}plateSign`,
  // 11/15 야외 바베큐장
  bbqGrill: `${P}bbqGrill`,
  bbqTable: `${P}bbqTable`,
  bbqSmoke: `${P}bbqSmoke`,
  /** 음료 자판기 · 밤에 겹쳐 빛나는 앞판 */
  vending: `${P}vending`,
  vendingLit: `${P}vendingLit`,
  /** 먹을 때 머리 위에 잠깐 뜨는 접시 (메뉴마다) */
  bbqPlate: (id: string) => `${P}bbqPlate-${id}`,
} as const;

/** 그리드 + (스프라이트 시트면) 프레임 크기 */
export type ArtOut = { grid: Grid; frameW?: number; frameH?: number };

// ── 공용 도구 ──

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, a);
    }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, w = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.rect(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), w, w, c);
}

/** 테두리만 (외곽선 없이 직사각 테두리) */
function frame(g: Grid, x: number, y: number, w: number, h: number, c: Color): void {
  g.hline(x, x + w - 1, y, c);
  g.hline(x, x + w - 1, y + h - 1, c);
  g.vline(x, y, y + h - 1, c);
  g.vline(x + w - 1, y, y + h - 1, c);
}

type Pal4 = { hi: Color; mid: Color; lo: Color; deep: Color };
type Pal3 = { hi: Color; mid: Color; lo: Color };

const WOOD: Pal3 & { line: Color } = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e };
const WOOD_DECK: Pal3 & { line: Color } = { hi: 0xd8b582, mid: 0xbf9662, lo: 0x977048, line: 0x5e4228 };
const LOG: Pal3 & { ring: Color; core: Color } = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228, ring: 0xe0c08a, core: 0xc89c62 };
const STONE: Pal3 & { moss: Color } = { hi: 0xbcb6a8, mid: 0x9c968a, lo: 0x76716a, moss: 0x7c8a4a };
const TRUNK: Pal3 = { hi: 0x9a7650, mid: 0x7a5a3c, lo: 0x56402a };

// ── 나무 ──

const SPRUCE: Pal4 = { hi: 0x6f9a5a, mid: 0x507a44, lo: 0x3a5c34, deep: 0x2a4428 };
const PINE: Pal4 = { hi: 0x82a262, mid: 0x62844a, lo: 0x48663a, deep: 0x344c2c };
const FIR: Pal4 = { hi: 0x6e9a86, mid: 0x4e7a68, lo: 0x385c50, deep: 0x28443c };

/** 침엽수: 층층이 쌓인 뾰족한 수관 */
function conifer(w: number, h: number, pal: Pal4, tiers: number, trunkH: number, seed: number, round = false): Grid {
  const g = new Grid(w, h);
  const r = rng(seed);
  const cx = (w - 1) / 2;
  const base = h - 3;
  // 줄기
  for (let y = base - trunkH; y <= base; y++) {
    const flare = y >= base - 1 ? 1 : 0;
    for (let x = Math.round(cx - 1 - flare); x <= Math.round(cx + 1 + flare); x++) g.set(x, y, x <= cx - 1 ? TRUNK.hi : x >= cx + 1 ? TRUNK.lo : TRUNK.mid);
  }
  const top = 1;
  const crownBot = base - trunkH + 2;
  const span = crownBot - top;
  for (let t = 0; t < tiers; t++) {
    const ty = Math.round(top + (t * span) / tiers * 0.82);
    const by = Math.round(top + ((t + 1) * span) / tiers);
    const half = (w / 2 - 1) * (round ? 0.6 + 0.4 * ((t + 1) / tiers) : 0.38 + 0.62 * ((t + 1) / tiers));
    for (let y = ty; y <= by; y++) {
      const k = (y - ty) / Math.max(1, by - ty);
      const hw = round ? half * Math.sqrt(Math.min(1, k * 1.4)) + 0.5 : half * k + 0.8;
      const jag = (hashU(y, t, seed) - 0.5) * 1.6;
      for (let x = Math.floor(cx - hw - jag); x <= Math.ceil(cx + hw + jag); x++) {
        const rel = (x - cx) / Math.max(1, hw);
        const c = y >= by - 1 ? pal.lo : rel < -0.45 ? pal.hi : rel > 0.4 ? pal.lo : pal.mid;
        g.set(x, y, c);
      }
    }
    // 층 아래 그늘 한 줄
    for (let x = Math.floor(cx - half * 0.7); x <= Math.ceil(cx + half * 0.7); x++) if (g.filled(x, by + 1) && hashU(x, by, seed) < 0.7) g.set(x, by + 1, pal.deep);
  }
  for (let i = 0; i < w * h * 0.06; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * (crownBot - 1));
    if (g.filled(x, y)) g.set(x, y, r() < 0.5 ? pal.deep : pal.hi);
  }
  // 꼭대기 한 점 밝게
  g.set(Math.round(cx), top, pal.hi);
  g.outline(OUT);
  shadow(g, cx + 1, base + 1, w * 0.36, 2.2, 62);
  return g;
}

const MAPLE: Pal4 = { hi: 0xf3824e, mid: 0xd65632, lo: 0xa83a26, deep: 0x7e281a };
const MAPLE_O: Pal4 = { hi: 0xffb456, mid: 0xe68a38, lo: 0xb8642a, deep: 0x8a481e };
const YELLOW: Pal4 = { hi: 0xffe682, mid: 0xf4c444, lo: 0xcc982e, deep: 0x9c7022 };

/** 잎 넓은 나무 (단풍·노란 잎). birch = 흰 줄기(자작나무) */
function leafy(w: number, h: number, pal: Pal4, seed: number, birch = false): Grid {
  const g = new Grid(w, h);
  const r = rng(seed);
  const cx = (w - 1) / 2;
  const base = h - 3;
  const trunk: Pal3 = birch ? { hi: 0xf4efe2, mid: 0xdcd4c0, lo: 0xb4aa94 } : TRUNK;
  const trunkTop = Math.round(h * 0.48);
  for (let y = trunkTop; y <= base; y++) {
    const flare = y >= base - 2 ? base - y === 0 ? 2 : 1 : 0;
    for (let x = Math.round(cx - 1 - flare); x <= Math.round(cx + 1 + flare); x++) g.set(x, y, x <= cx - 1 ? trunk.hi : x >= cx + 1 ? trunk.lo : trunk.mid);
    if (birch && hashU(y, 3, seed) < 0.22) g.set(Math.round(cx + (hashU(y, 9, seed) < 0.5 ? -1 : 0)), y, 0x3a3228);
  }
  // 가지
  line(g, cx, trunkTop + 3, cx - 5, trunkTop - 3, trunk.mid);
  line(g, cx + 1, trunkTop + 1, cx + 6, trunkTop - 4, trunk.lo);
  // 수관: 둥근 덩어리 여럿
  const blobs: [number, number, number, number][] = [];
  const cy = h * 0.32;
  blobs.push([cx, cy, w * 0.36, h * 0.24]);
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    blobs.push([cx + Math.cos(a) * w * 0.22, cy + Math.sin(a) * h * 0.13 + 1, w * (0.15 + r() * 0.1), h * (0.1 + r() * 0.07)]);
  }
  for (const [bx, by, rx, ry] of blobs) g.ellipse(bx, by, rx, ry, pal.mid);
  g.recolor((x, y) => !g.filled(x - 1, y - 2) || (x < cx - 3 && y < cy - 2), pal.hi);
  g.recolor((x, y) => (!g.filled(x, y + 2) && y > cy) || (x > cx + w * 0.22 && y > cy - 1), pal.lo);
  for (let i = 0; i < w * h * 0.08; i++) {
    const x = Math.floor(r() * w);
    const y = Math.floor(r() * h * 0.6);
    if (g.filled(x, y) && y < trunkTop + 2) g.set(x, y, r() < 0.45 ? pal.deep : r() < 0.5 ? pal.hi : lighten(pal.hi, 0.25));
  }
  // 줄기 사이로 보이는 가지 구멍 몇 개
  for (let i = 0; i < 3; i++) {
    const x = Math.round(cx + (r() - 0.5) * w * 0.4);
    const y = Math.round(cy + (r() - 0.2) * h * 0.12);
    if (g.filled(x, y) && g.filled(x + 1, y)) {
      g.set(x, y, pal.deep);
      g.set(x + 1, y, pal.deep);
    }
  }
  g.outline(OUT);
  shadow(g, cx + 1, base + 1, w * 0.38, 2.4, 60);
  // 떨어진 잎 몇 장 (그림자 위)
  for (let i = 0; i < 6; i++) {
    const x = Math.round(cx + (r() - 0.5) * w * 0.8);
    const y = base - 1 + Math.round(r() * 3);
    if (!g.filled(x, y) || (g.get(x, y) & 255) < 255) g.set(x, y, r() < 0.5 ? pal.hi : pal.mid);
  }
  return g;
}

export function spruceArt(v: number): Grid {
  return conifer(24, 50, SPRUCE, 5, 6, 101 + v * 13);
}
export function pineArt(v: number): Grid {
  return conifer(30, 44, PINE, 3, 8, 211 + v * 17, true);
}
export function firArt(v: number): Grid {
  return conifer(20, 34, FIR, 4, 5, 307 + v * 19);
}
export function mapleArt(v: number): Grid {
  return leafy(34, 42, MAPLE, 401 + v * 23);
}
export function mapleOArt(v: number): Grid {
  return leafy(32, 40, MAPLE_O, 503 + v * 29);
}
export function yellowArt(v: number): Grid {
  return leafy(32, 44, YELLOW, 607 + v * 31, v % 2 === 1);
}

export function bushArt(v: number): Grid {
  const g = new Grid(20, 14);
  const pal = v % 2 ? { hi: 0xe0a04a, mid: 0xc07a32, lo: 0x8e5626 } : { hi: 0x8aa252, mid: 0x6a8440, lo: 0x4c6430 };
  const r = rng(700 + v);
  g.ellipse(10, 7, 8, 4.5, pal.mid);
  g.ellipse(6, 8, 4.5, 3.5, pal.mid);
  g.ellipse(14, 8, 4.5, 3.5, pal.mid);
  g.recolor((x, y) => !g.filled(x, y - 1), pal.hi);
  g.recolor((x, y) => !g.filled(x, y + 1), pal.lo);
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(r() * 20);
    const y = Math.floor(r() * 12);
    if (g.filled(x, y)) g.set(x, y, r() < 0.4 ? 0xf2c444 : pal.lo);
  }
  g.outline(OUT);
  shadow(g, 10, 12, 8, 1.6, 54);
  return g;
}

const LEAF_COLORS: readonly Color[] = [0xf2c444, 0xe68a38, 0xd65632, 0xb4783a, 0xffe07a];

export function leafPileArt(v: number): Grid {
  const g = new Grid(16, 7);
  const r = rng(800 + v);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const x = Math.round(8 + Math.cos(a) * d * 7);
    const y = Math.round(4 + Math.sin(a) * d * 2.5);
    g.set(x, y, LEAF_COLORS[(i + v) % LEAF_COLORS.length]);
  }
  return g;
}

export function mushroomArt(v: number): Grid {
  const g = new Grid(10, 8);
  const cap = v % 2 ? 0xd65632 : 0xc89a5a;
  for (const [x, s] of [
    [3, 1],
    [7, 0.75],
  ] as const) {
    g.rect(x, 4, 1, 3, 0xf0e4c8);
    g.ellipse(x + 0.5, 3.5, 2.5 * s, 1.8 * s, cap);
    if (v % 2) g.set(x, 3, 0xfff0e0);
  }
  g.outline(OUT);
  return g;
}

export function fernArt(v: number): Grid {
  const g = new Grid(14, 9);
  const c = v % 2 ? 0x6a8a40 : 0x8a7a3a;
  for (const [x0, dx] of [
    [7, -6],
    [7, 6],
    [7, -3],
    [7, 3],
    [7, 0],
  ] as const)
    line(g, x0, 8, x0 + dx, 1 + Math.abs(dx) / 3, c);
  g.recolor((x, y) => y < 4, lighten(c, 0.2));
  return g;
}

export function pebblesArt(v: number): Grid {
  const g = new Grid(12, 6);
  const r = rng(900 + v);
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(r() * 8);
    const y = 2 + Math.floor(r() * 3);
    g.ellipse(x, y, 1.6, 1.1, i % 2 ? STONE.hi : STONE.mid);
  }
  g.outline(darken(STONE.lo, 0.3));
  return g;
}

export function boulderArt(v: number): Grid {
  const g = new Grid(30, 22);
  g.ellipse(15, 12, 12, 8, STONE.mid);
  g.ellipse(v ? 9 : 21, 14, 6, 5, STONE.mid);
  g.recolor((x, y) => !g.filled(x - 1, y - 1) || (y < 9 && x < 16), STONE.hi);
  g.recolor((x, y) => !g.filled(x + 1, y + 1) || y > 16, STONE.lo);
  // 이끼·금
  for (let x = 8; x < 22; x++) if (hashU(x, 5, v) < 0.5) g.set(x, Math.round(6 + Math.sin(x) * 0.8), STONE.moss);
  line(g, 14, 9, 17, 14, darken(STONE.lo, 0.2));
  g.outline(OUT);
  shadow(g, 15, 20, 12, 2, 66);
  return g;
}

/** 앉는 바위: 윗면이 평평한 납작 바위 */
export function rockSeatArt(): Grid {
  const g = new Grid(20, 14);
  g.ellipse(10, 8, 8.5, 5, STONE.mid);
  g.ellipse(10, 5.5, 7, 2.5, STONE.hi);
  g.recolor((x, y) => y > 9, STONE.lo);
  g.set(5, 8, STONE.moss);
  g.set(6, 8, STONE.moss);
  g.outline(OUT);
  shadow(g, 10, 13, 9, 1.4, 60);
  return g;
}

/** 통나무 의자: 세워 둔 짧은 통나무 (윗면 나이테) */
export function logChairArt(): Grid {
  const g = new Grid(14, 14);
  g.rect(2, 5, 10, 6, LOG.mid);
  g.vline(2, 5, 10, LOG.hi);
  g.vline(3, 5, 10, LOG.hi);
  g.vline(11, 5, 10, LOG.lo);
  for (const y of [7, 9]) g.set(6, y, LOG.lo);
  g.ellipse(7, 5, 5, 2.4, LOG.core);
  g.ellipse(7, 5, 3, 1.4, LOG.ring);
  g.set(7, 5, LOG.core);
  g.ellipse(7, 10.5, 5, 1.6, LOG.mid);
  g.outline(OUT);
  shadow(g, 7, 13, 6, 1.2, 56);
  return g;
}

/** 등받이 나무 벤치 (2인, 관리소 앞) */
export function benchArt(): Grid {
  const g = new Grid(42, 18);
  // 등받이
  g.rect(3, 2, 36, 3, WOOD.mid);
  g.hline(3, 38, 2, WOOD.hi);
  g.rect(5, 5, 2, 5, WOOD.lo);
  g.rect(35, 5, 2, 5, WOOD.lo);
  // 앉는 판
  g.rect(2, 9, 38, 4, WOOD.mid);
  g.hline(2, 39, 9, WOOD.hi);
  g.hline(2, 39, 11, WOOD.lo);
  // 다리
  g.rect(4, 13, 2, 3, WOOD.line);
  g.rect(36, 13, 2, 3, WOOD.line);
  g.outline(OUT);
  shadow(g, 21, 16, 19, 1.4, 56);
  return g;
}

/** 녹슨 쇠 벤치 (버스 정류장) */
export function rustyBenchArt(): Grid {
  const g = new Grid(42, 18);
  const rust = { hi: 0xc88a5a, mid: 0xa4643a, lo: 0x7a4628 };
  for (let x = 3; x <= 38; x += 2) g.vline(x, 2, 7, x % 4 === 1 ? rust.hi : rust.mid);
  g.hline(3, 38, 2, rust.hi);
  g.rect(2, 9, 38, 3, 0x6e8a8a); // 바랜 청록 앉는 판
  g.hline(2, 39, 9, 0x8aa8a4);
  for (let x = 4; x < 38; x += 5) if (hashU(x, 1, 3) < 0.6) g.set(x, 10, rust.mid); // 녹 자국
  g.rect(4, 12, 2, 4, rust.lo);
  g.rect(36, 12, 2, 4, rust.lo);
  g.outline(OUT);
  shadow(g, 21, 16, 19, 1.4, 56);
  return g;
}

/** 등받이 없는 긴 판자 의자 (타프 아래·전망대) */
export function plankBenchArt(seats: 2 | 3): Grid {
  const w = seats === 3 ? 58 : 42;
  const g = new Grid(w, 12);
  g.rect(1, 3, w - 2, 4, WOOD_DECK.mid);
  g.hline(1, w - 2, 3, WOOD_DECK.hi);
  g.hline(1, w - 2, 6, WOOD_DECK.lo);
  for (const x of [4, w - 6, ...(seats === 3 ? [Math.floor(w / 2) - 1] : [])]) g.rect(x, 7, 2, 3, WOOD.line);
  g.outline(OUT);
  shadow(g, w / 2, 10, w / 2 - 2, 1.2, 50);
  return g;
}

/** 피크닉 탁자 */
export function tableArt(): Grid {
  const g = new Grid(56, 22);
  g.rect(2, 3, 52, 10, WOOD_DECK.mid);
  for (let y = 3; y < 13; y += 3) g.hline(2, 53, y, WOOD_DECK.hi);
  g.hline(2, 53, 12, WOOD_DECK.lo);
  g.rect(6, 13, 3, 6, WOOD.lo);
  g.rect(47, 13, 3, 6, WOOD.lo);
  // 식탁보 대신 체크무늬 천 한 장 + 컵
  for (let y = 5; y < 11; y++) for (let x = 20; x < 36; x++) if (((x >> 1) + (y >> 1)) % 2) g.set(x, y, 0xd65a4a);
  g.rect(40, 5, 3, 3, 0xe8e0d0);
  g.outline(OUT);
  shadow(g, 28, 20, 25, 1.6, 54);
  return g;
}

// ── 데크 (번호 팻말이 붙은 빈 나무 데크) ──

const DIGITS: readonly string[] = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function drawNumber(g: Grid, n: number, x: number, y: number, c: Color): void {
  const s = String(n);
  s.split("").forEach((ch, i) => {
    const bits = DIGITS[Number(ch)];
    for (let k = 0; k < 15; k++) if (bits[k] === "1") g.set(x + i * 4 + (k % 3), y + Math.floor(k / 3), c);
  });
}

export function deckArt(n: number): Grid {
  const W = 38;
  const H = 32;
  const g = new Grid(W, H);
  const top = 4;
  const bot = H - 3;
  // 판자 (가로), 판 사이 틈
  g.rect(1, top, W - 2, bot - top, WOOD_DECK.mid);
  for (let y = top; y < bot; y++) {
    const k = (y - top) % 5;
    for (let x = 1; x < W - 1; x++) {
      if (k === 4) g.set(x, y, WOOD_DECK.line);
      else if (k === 0) g.set(x, y, WOOD_DECK.hi);
      else if (hashU(x, y, n) < 0.06) g.set(x, y, WOOD_DECK.lo);
    }
    // 판자 이음매 (줄마다 다른 자리)
    const seam = 6 + ((y - top) / 5 | 0) * 11 % 26;
    if (k !== 4) g.set(seam, y, WOOD_DECK.lo);
  }
  // 앞 테 (두께)
  g.rect(1, bot, W - 2, 2, WOOD.lo);
  g.hline(1, W - 2, bot + 1, WOOD.line);
  g.outline(OUT);
  // 번호 팻말 (왼쪽 위 모서리 말뚝 + 작은 판)
  g.rect(3, 0, 2, 7, WOOD.lo);
  const tw = n >= 10 ? 11 : 7;
  g.rect(5, 1, tw, 7, 0xf2e6c8);
  frame(g, 5, 1, tw, 7, WOOD.line);
  drawNumber(g, n, 7, 2, 0x5a3a22);
  shadow(g, W / 2, H - 1, W / 2 - 1, 1.2, 50);
  return g;
}

// ── 관리소·매점 오두막 (왼쪽 반 관리소, 오른쪽 반 매점) ──

export const OFFICE_ART_W = 180;
export const OFFICE_ART_H = 92;
export function officeArt(): Grid {
  const W = OFFICE_ART_W;
  const H = OFFICE_ART_H;
  const g = new Grid(W, H);
  const base = H - 3;
  const wallTop = 40;
  const x0 = 4;
  const x1 = W - 5;
  // 통나무 벽 (가로 통나무, 끝은 둥근 마구리)
  for (let y = wallTop; y <= base; y++) {
    const k = (y - wallTop) % 6;
    const c = k === 0 ? LOG.hi : k === 5 ? LOG.lo : LOG.mid;
    g.hline(x0 + 2, x1 - 2, y, c);
  }
  for (let y = wallTop; y <= base - 2; y += 6) {
    g.ellipse(x0 + 2, y + 2.5, 2.4, 2.6, LOG.core);
    g.ellipse(x1 - 2, y + 2.5, 2.4, 2.6, LOG.core);
    g.set(x0 + 2, y + 2, LOG.ring);
    g.set(x1 - 2, y + 2, LOG.ring);
  }
  // 가운데 칸막이 기둥
  g.rect(W / 2 - 2, wallTop, 4, base - wallTop + 1, LOG.lo);
  // 지붕 (붉은 갈색 너와, 처마가 벽 밖으로)
  const roofTop = 6;
  for (let y = roofTop; y < wallTop + 4; y++) {
    const k = (y - roofTop) / (wallTop + 4 - roofTop);
    const inset = Math.round((1 - k) * 18);
    for (let x = inset; x < W - inset; x++) {
      const row = Math.floor((y - roofTop) / 4);
      const shingle = (x + row * 3) % 7 === 0;
      const c = (y - roofTop) % 4 === 3 ? 0x6e3426 : shingle ? 0x8e4430 : row % 2 ? 0xb85a3c : 0xa64e36;
      g.set(x, y, c);
    }
  }
  g.hline(18, W - 19, roofTop, 0xd8784e); // 용마루 빛
  g.hline(0, W - 1, wallTop + 3, 0x5a2a1e); // 처마 그늘
  g.hline(0, W - 1, wallTop + 4, 0x3e2018);
  // 굴뚝
  g.rect(34, 0, 8, 14, 0x9a8a7a);
  g.hline(34, 41, 0, 0xbab0a2);
  for (let y = 3; y < 14; y += 3) g.hline(34, 41, y, 0x7a6c60);
  // ── 관리소 (왼쪽) ── 문 + 창
  const dx = 46;
  g.rect(dx, base - 30, 18, 30, 0x6a4428);
  frame(g, dx - 1, base - 31, 20, 31, WOOD.line);
  g.rect(dx + 4, base - 26, 10, 7, 0xffe2a0); // 문 창 (불빛)
  frame(g, dx + 4, base - 26, 10, 7, WOOD.line);
  g.set(dx + 14, base - 14, 0xe8c070); // 손잡이
  // 문 위 등
  g.rect(dx + 7, base - 36, 4, 4, 0xffd27a);
  g.set(dx + 8, base - 37, 0x3a2a1a);
  // 창 (네 칸, 따뜻한 불빛)
  const wx = 14;
  g.rect(wx, base - 28, 22, 16, 0xffe6aa);
  g.rect(wx + 2, base - 26, 8, 6, 0xffd27a);
  g.rect(wx + 12, base - 26, 8, 6, 0xffd890);
  g.hline(wx, wx + 21, base - 20, WOOD.line);
  g.vline(wx + 11, base - 28, base - 13, WOOD.line);
  frame(g, wx - 1, base - 29, 24, 18, WOOD.line);
  g.rect(wx - 2, base - 11, 26, 2, WOOD.mid); // 창턱
  // 창턱 화분
  g.rect(wx + 2, base - 14, 4, 3, 0xb8643a);
  g.set(wx + 3, base - 15, 0xf2c444);
  g.set(wx + 4, base - 16, 0xe68a38);
  // 관리소 현판 자리 (글씨는 CampMap 이름표)
  g.rect(14, wallTop + 8, 52, 9, 0xf0e2c0);
  frame(g, 13, wallTop + 7, 54, 11, WOOD.line);
  // ── 매점 (오른쪽) ── 큰 창구 + 줄무늬 차양 + 선반
  const sx = W / 2 + 12;
  const sw = 64;
  g.rect(sx, base - 32, sw, 22, 0x5a3a24);
  // 선반의 물건 (컵라면·마시멜로·장갑·랜턴)
  for (let i = 0; i < 9; i++) {
    const c = [0xe85a3a, 0xf8f0e0, 0x4aa0c8, 0xf2c444, 0x7ab85a, 0xe68a38][i % 6];
    g.rect(sx + 4 + i * 7, base - 28, 5, 5, c);
    g.rect(sx + 4 + i * 7, base - 20, 5, 4, [0xc8b090, 0xe8d8a8, 0xa86a4a][i % 3]);
  }
  g.hline(sx, sx + sw - 1, base - 22, WOOD.lo);
  // 창구 턱
  g.rect(sx - 3, base - 10, sw + 6, 4, WOOD.mid);
  g.hline(sx - 3, sx + sw + 2, base - 10, WOOD.hi);
  frame(g, sx - 1, base - 33, sw + 2, 24, WOOD.line);
  // 차양 (빨강·크림 줄무늬, 끝은 물결)
  const ay = base - 44;
  for (let y = ay; y < ay + 10; y++)
    for (let x = sx - 6; x < sx + sw + 6; x++) {
      const stripe = Math.floor((x - sx + 6) / 6) % 2 === 0;
      const shade = y > ay + 6;
      g.set(x, y, stripe ? (shade ? 0xb8402e : 0xe0563c) : shade ? 0xd8ccb0 : 0xf6eedc);
    }
  for (let x = sx - 6; x < sx + sw + 6; x++) if (Math.floor((x - sx + 6) / 3) % 2 === 0) g.set(x, ay + 10, Math.floor((x - sx + 6) / 6) % 2 === 0 ? 0xb8402e : 0xd8ccb0);
  // 매점 현판 자리
  g.rect(sx + 12, wallTop + 4, 40, 9, 0xf0e2c0);
  frame(g, sx + 11, wallTop + 3, 42, 11, WOOD.line);
  // 장작 더미 (오른쪽 끝)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) g.ellipse(x1 - 8 - j * 5 - i * 2.5, base - 2 - i * 4, 2.6, 2.2, LOG.core);
  g.outline(OUT);
  shadow(g, W / 2, base + 1, W / 2 - 4, 2, 60);
  return g;
}

/** 빈 의뢰판 (다음 차수에 의뢰가 붙는다) */
export function boardArt(): Grid {
  const g = new Grid(30, 36);
  g.rect(3, 6, 3, 28, WOOD.lo);
  g.rect(24, 6, 3, 28, WOOD.lo);
  g.rect(2, 6, 26, 18, 0xb88a5a);
  for (let y = 7; y < 23; y++) for (let x = 3; x < 27; x++) if (hashU(x, y, 5) < 0.18) g.set(x, y, 0xa47648);
  frame(g, 1, 5, 28, 20, WOOD.line);
  // 지붕 판
  g.rect(0, 2, 30, 4, 0xa64e36);
  g.hline(0, 29, 2, 0xd8784e);
  // 압정 몇 개 + 비어 있는 종이 한 장 ("곧 열려요")
  g.rect(9, 10, 12, 9, 0xf4ecd8);
  g.hline(11, 18, 13, 0xc8bca0);
  g.hline(11, 16, 15, 0xc8bca0);
  g.set(15, 10, 0xe0563c);
  for (const [x, y] of [
    [5, 9],
    [24, 20],
    [6, 21],
  ])
    g.set(x, y, 0xf2c444);
  g.outline(OUT);
  shadow(g, 15, 34, 13, 1.4, 56);
  return g;
}

// ── 큰 모닥불 ──

/** 돌 고리 + 장작 (불꽃은 따로) */
export function fireRingArt(): Grid {
  const g = new Grid(52, 28);
  const cx = 26;
  const cy = 15;
  // 재·숯 바닥
  g.ellipse(cx, cy, 18, 8, 0x4a3a30);
  for (let i = 0; i < 40; i++) {
    const x = Math.round(cx + (hashU(i, 1, 2) - 0.5) * 30);
    const y = Math.round(cy + (hashU(i, 2, 2) - 0.5) * 12);
    if (g.filled(x, y)) g.set(x, y, hashU(i, 3, 2) < 0.4 ? 0xe8783a : 0x2e241e);
  }
  // 장작 (원뿔로 세운 통나무)
  for (const [x0, y0, x1, y1] of [
    [16, 18, 25, 6],
    [36, 18, 27, 6],
    [21, 21, 26, 5],
    [31, 21, 26, 5],
    [26, 22, 26, 6],
  ])
    line(g, x0, y0, x1, y1, LOG.mid, 2);
  for (const [x, y] of [
    [16, 18],
    [36, 18],
    [21, 21],
    [31, 21],
  ])
    g.set(x, y, LOG.ring);
  // 돌 고리
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = cx + Math.cos(a) * 21;
    const y = cy + Math.sin(a) * 9.5;
    const c = i % 3 === 0 ? STONE.hi : i % 3 === 1 ? STONE.mid : 0xa8a092;
    g.ellipse(x, y, 3.4, 2.6, c);
    g.set(Math.round(x - 1), Math.round(y - 1), lighten(c, 0.2));
  }
  g.outline(OUT);
  shadow(g, cx, cy + 10, 22, 2.5, 60);
  return g;
}

/** 불꽃 4프레임 (26×34 한 칸) */
export const FLAME_W = 26;
export const FLAME_H = 34;
export const FLAME_FRAMES = 4;
export function flamesArt(): ArtOut {
  const g = new Grid(FLAME_W * FLAME_FRAMES, FLAME_H);
  for (let f = 0; f < FLAME_FRAMES; f++) {
    const ox = f * FLAME_W;
    const cx = FLAME_W / 2;
    const tongues = [
      { dx: 0, h: 28 + (f % 2) * 3, w: 7 },
      { dx: -5 + (f === 2 ? 1 : 0), h: 18 + ((f + 1) % 3) * 3, w: 5 },
      { dx: 5 - (f === 1 ? 1 : 0), h: 17 + ((f + 2) % 3) * 3, w: 5 },
      { dx: -2 + (f % 3), h: 22, w: 4 },
    ];
    for (const t of tongues) {
      for (let y = 0; y < t.h; y++) {
        const k = y / t.h;
        const sway = Math.sin(k * 3 + f * 1.6) * 1.6 * k;
        const hw = t.w * (1 - k) ** 0.7;
        for (let x = Math.floor(cx + t.dx + sway - hw); x <= Math.ceil(cx + t.dx + sway + hw); x++) {
          const yy = FLAME_H - 2 - y;
          const inner = Math.abs(x - (cx + t.dx + sway)) < hw * 0.45 && k < 0.7;
          const c = k > 0.75 ? 0xd8402a : inner ? (k < 0.35 ? 0xfff4b0 : 0xffd23a) : k < 0.5 ? 0xff9a2a : 0xf26a26;
          g.set(ox + x, yy, c);
        }
      }
    }
    // 불티
    g.set(ox + 6 + f * 3, 4 + (f % 2) * 3, 0xffd23a);
    g.set(ox + 18 - f * 2, 2 + f, 0xff9a2a);
  }
  return { grid: g, frameW: FLAME_W, frameH: FLAME_H };
}

// ── 통나무 다리 (계곡 위) ──
export const BRIDGE_W = 84;
export const BRIDGE_H = 30;
export function bridgeArt(): Grid {
  const g = new Grid(BRIDGE_W, BRIDGE_H);
  // 세로로 놓은 반쪽 통나무들 (사람은 가로로 건넌다)
  for (let x = 2; x < BRIDGE_W - 2; x += 5) {
    for (let y = 3; y < BRIDGE_H - 4; y++) {
      const k = x % 10 === 2 ? 0 : 1;
      g.set(x, y, LOG.hi);
      g.set(x + 1, y, k ? LOG.mid : lighten(LOG.mid, 0.08));
      g.set(x + 2, y, LOG.mid);
      g.set(x + 3, y, LOG.lo);
      g.set(x + 4, y, 0x3a2a1c);
    }
    g.set(x + 1, 3, LOG.ring);
    g.set(x + 2, BRIDGE_H - 5, LOG.ring);
  }
  // 양옆 손잡이 통나무
  g.rect(0, 1, BRIDGE_W, 3, LOG.lo);
  g.hline(0, BRIDGE_W - 1, 1, LOG.hi);
  g.rect(0, BRIDGE_H - 5, BRIDGE_W, 3, LOG.lo);
  g.hline(0, BRIDGE_W - 1, BRIDGE_H - 5, LOG.hi);
  g.outline(OUT);
  for (let x = 4; x < BRIDGE_W - 4; x++) if (!g.filled(x, BRIDGE_H - 1)) g.set(x, BRIDGE_H - 1, 0x1a2a2a, 70);
  return g;
}

// ── 캠핑카 3대 ── (3/4 시점: 지붕 + 옆면, 문은 앞 오른쪽 CAMP_VAN_DOOR_DX)
export const VAN_ART_W = 80;
export const VAN_ART_H = 52;
const VAN_COLORS: readonly { body: Color; hi: Color; lo: Color; stripe: Color }[] = [
  { body: 0x9ed6c0, hi: 0xc4ecdc, lo: 0x6eaa94, stripe: 0xf6f0e0 },
  { body: 0xf0c050, hi: 0xffe08a, lo: 0xc89432, stripe: 0xf8f0dc },
  { body: 0xe8806a, hi: 0xf8aa94, lo: 0xb85a48, stripe: 0xf6ecdc },
];
export function vanArt(i: number, open: boolean, plate: boolean): Grid {
  const W = VAN_ART_W;
  const H = VAN_ART_H;
  const g = new Grid(W, H);
  const pal = VAN_COLORS[i % VAN_COLORS.length];
  const x0 = 3;
  const x1 = W - 4;
  const roofTop = 4;
  const sideTop = 18;
  const base = H - 6;
  // 지붕 (밝은 흰 지붕 + 루프 박스)
  g.rect(x0 + 2, roofTop, x1 - x0 - 4, sideTop - roofTop, 0xe8e4d8);
  g.hline(x0 + 2, x1 - 2, roofTop, 0xfaf8f0);
  g.rect(x0 + 10, roofTop + 3, 26, 7, 0xb8b4a8);
  g.hline(x0 + 10, x0 + 35, roofTop + 3, 0xd8d4c8);
  g.rect(x1 - 18, roofTop + 4, 10, 5, 0x6a8aa0); // 천창
  // 옆면
  g.rect(x0, sideTop, x1 - x0 + 1, base - sideTop, pal.body);
  g.hline(x0, x1, sideTop, pal.hi);
  g.rect(x0, sideTop + 13, x1 - x0 + 1, 4, pal.stripe); // 레트로 줄
  g.hline(x0, x1, base - 1, pal.lo);
  // 앞(오른쪽) 둥근 코
  g.rect(x1 - 4, sideTop + 2, 5, base - sideTop - 4, pal.hi);
  // 창 (뒤쪽 둘, 커튼)
  for (const wx of [x0 + 6, x0 + 22]) {
    g.rect(wx, sideTop + 4, 12, 8, 0xffd890);
    g.rect(wx, sideTop + 4, 4, 8, 0xd8786a);
    frame(g, wx - 1, sideTop + 3, 14, 10, darken(pal.lo, 0.3));
  }
  // 운전석 창
  g.rect(x1 - 12, sideTop + 4, 9, 7, 0x8ab8cc);
  g.set(x1 - 10, sideTop + 5, 0xd8f0f8);
  // 문 (가운데 x = W/2 + 20)
  const dc = Math.round(W / 2 + 20);
  const dx = dc - 6;
  if (open) {
    g.rect(dx, sideTop + 2, 12, base - sideTop - 2, 0x4a3226);
    g.rect(dx + 1, sideTop + 3, 10, 9, 0xffc870); // 안쪽 불빛
    g.rect(dx + 2, sideTop + 13, 8, 4, 0xa86a4a); // 안쪽 의자
    // 열린 문짝 (오른쪽으로 젖혀짐)
    g.rect(dx + 12, sideTop + 1, 4, base - sideTop - 1, pal.lo);
    g.vline(dx + 12, sideTop + 1, base - 1, pal.hi);
  } else {
    frame(g, dx, sideTop + 2, 12, base - sideTop - 2, darken(pal.lo, 0.25));
    g.rect(dx + 2, sideTop + 4, 8, 6, 0xffd890);
    g.set(dx + 10, sideTop + 16, 0xe8e0d0);
  }
  // 발판
  g.rect(dx - 1, base, 14, 2, 0x8a8478);
  // 바퀴
  for (const wx of [x0 + 12, x1 - 18]) {
    g.ellipse(wx, base + 1, 5, 4, 0x2e2a28);
    g.ellipse(wx, base + 1, 2.2, 1.8, 0xb8b4ac);
  }
  // 문패 (가운데 차: 문 왼쪽에 걸린 작은 나무 판 — 글씨는 CampMap 이름표)
  if (plate) {
    g.rect(dx - 15, sideTop + 4, 13, 7, 0xf0e0b8);
    frame(g, dx - 16, sideTop + 3, 15, 9, WOOD.line);
    g.hline(dx - 13, dx - 5, sideTop + 7, 0x8a6a48);
    line(g, dx - 13, sideTop + 3, dx - 9, sideTop, WOOD.line);
    line(g, dx - 5, sideTop + 3, dx - 9, sideTop, WOOD.line);
  }
  g.outline(OUT);
  shadow(g, W / 2, base + 3, W / 2 - 3, 2.4, 64);
  return g;
}

// ── 큰 타프 ──
export const TARP_ART_W = 192;
export const TARP_ART_H = 84;
/** 타프 천 (위에 겹쳐 그린다. 원점 = 가운데) */
export function tarpArt(): Grid {
  const W = TARP_ART_W;
  const H = TARP_ART_H;
  const g = new Grid(W, H);
  const cx = W / 2;
  const cy = H / 2;
  const hi = 0xf6b26a;
  const mid = 0xe2924e;
  const lo = 0xc0703a;
  const deep = 0x9a5428;
  // 육각 타프: 네 모서리 + 용마루 양 끝이 당겨지고, 변은 안쪽으로 살짝 처진다(현수선)
  for (let y = 3; y < H - 3; y++) {
    const k = Math.abs(y - cy) / (cy - 3);
    const sag = Math.sin((1 - k) * Math.PI) * 4;
    const hw = (W / 2 - 3) * (1 - k * 0.26) - sag * 0.6;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const ex = Math.abs(x - cx) / hw; // 0 용마루 ~ 1 가장자리
      // 위·아래 변도 처지게 (가운데가 안쪽)
      const edgeSag = Math.sin(((x - (cx - hw)) / (2 * hw)) * Math.PI) * 5;
      if (y < cy && y < 3 + edgeSag * 0.6) continue;
      if (y > H - 4 - edgeSag * 0.6 && y > cy) continue;
      // 빛: 위쪽(북)이 밝고, 용마루에서 멀어질수록 어두워지는 경사면
      const north = y < cy;
      let c: Color = north ? (ex < 0.35 ? hi : ex < 0.75 ? mid : lo) : ex < 0.35 ? mid : ex < 0.75 ? lo : deep;
      if (Math.abs(x - cx) < 1) c = 0xffd296; // 용마루
      // 천 주름 (모서리 쪽으로 퍼지는 사선)
      const fold = (x - cx) * (y - cy) > 0 ? ((x + y) % 11 === 0) : ((x - y + 400) % 11 === 0);
      if (fold && ex > 0.4) c = darken(c, 0.12);
      g.set(x, y, c);
    }
  }
  // 바느질선 (가장자리를 따라 한 줄)
  for (let y = 5; y < H - 5; y++) {
    const k = Math.abs(y - cy) / (cy - 3);
    const hw = (W / 2 - 3) * (1 - k * 0.26) - Math.sin((1 - k) * Math.PI) * 2.4;
    if (y % 2) {
      g.set(Math.round(cx - hw + 3), y, 0xffe0b0);
      g.set(Math.round(cx + hw - 3), y, 0xd8945c);
    }
  }
  g.outline(0x5a3018);
  // 모서리 고리 + 당김 줄 (밖으로)
  const corners: [number, number, number, number][] = [
    [6, 6, -1, -1],
    [W - 7, 6, 1, -1],
    [6, H - 7, -1, 1],
    [W - 7, H - 7, 1, 1],
  ];
  for (const [x, y] of corners) g.ellipse(x, y, 1.8, 1.8, 0xd8d0c0);
  g.set(1, Math.round(cy), 0xd8d0c0);
  g.set(W - 2, Math.round(cy), 0xd8d0c0);
  return g;
}
export function tarpPoleArt(): Grid {
  const g = new Grid(8, 46);
  g.rect(3, 2, 2, 42, 0x8a8478);
  g.vline(3, 2, 43, 0xb8b2a6);
  g.rect(2, 0, 4, 3, 0xd8d0c0);
  g.outline(OUT);
  shadow(g, 4, 44, 3, 1, 60);
  return g;
}

// ── 전망대 ──
/** 바닥 판자 + 뒤·옆 난간 (CAMP_LOOKOUT 사각형 크기, 왼쪽 위 원점) */
export function lookoutFloorArt(): Grid {
  const L = CAMP_LOOKOUT;
  const g = new Grid(L.w, L.h + 4);
  for (let y = 4; y < L.h; y++)
    for (let x = 2; x < L.w - 2; x++) {
      const k = x % 8;
      g.set(x, y, k === 7 ? WOOD_DECK.line : k === 0 ? WOOD_DECK.hi : hashU(x, y, 11) < 0.05 ? WOOD_DECK.lo : WOOD_DECK.mid);
    }
  // 뒤 난간 (기둥 + 가로대)
  for (let x = 1; x < L.w; x += 12) g.rect(x, 0, 3, 8, WOOD.lo);
  g.rect(0, 1, L.w, 2, WOOD.mid);
  g.hline(0, L.w - 1, 1, WOOD.hi);
  // 옆 난간
  for (const x of [0, L.w - 3]) {
    g.rect(x, 0, 3, L.h, WOOD.mid);
    g.vline(x, 0, L.h - 1, WOOD.hi);
    for (let y = 0; y < L.h; y += 14) g.rect(x, y, 3, 3, WOOD.lo);
  }
  // 바닥 아래 두께 (산꼭대기에서 살짝 떠 있다)
  g.rect(2, L.h, L.w - 4, 3, WOOD.lo);
  g.outline(OUT);
  return g;
}
/** 앞 난간 (계단 자리는 비운다) + 계단 — 왼쪽 위 원점이 (L.x, L.y + L.h - 12) */
export function lookoutFrontArt(): Grid {
  const L = CAMP_LOOKOUT;
  const S = CAMP_LOOKOUT_STAIRS;
  const g = new Grid(L.w, 30);
  const sx = S.x - L.x;
  const rail = (x0: number, x1: number) => {
    for (let x = x0; x <= x1; x += 10) g.rect(x, 2, 3, 12, WOOD.lo);
    g.rect(x0, 3, x1 - x0 + 3, 2, WOOD.mid);
    g.hline(x0, x1 + 2, 3, WOOD.hi);
    g.rect(x0, 8, x1 - x0 + 3, 1, WOOD.lo);
  };
  rail(0, sx - 4);
  rail(sx + S.w + 1, L.w - 3);
  // 계단 (세 칸)
  for (let i = 0; i < 4; i++) {
    const y = 12 + i * 4;
    g.rect(sx + 1, y, S.w - 2, 3, i % 2 ? WOOD_DECK.mid : WOOD_DECK.hi);
    g.hline(sx + 1, sx + S.w - 2, y + 3, WOOD_DECK.line);
  }
  g.outline(OUT);
  return g;
}

// ── 줄 조명 ──
export function poleArt(): Grid {
  const g = new Grid(8, 40);
  g.rect(3, 2, 3, 36, WOOD.mid);
  g.vline(3, 2, 37, WOOD.hi);
  g.rect(1, 3, 7, 2, WOOD.lo); // 걸이
  g.outline(OUT);
  shadow(g, 4, 38, 3.5, 1.2, 60);
  return g;
}
export function bulbArt(): Grid {
  const g = new Grid(3, 4);
  g.set(1, 0, 0x3a2a1a);
  g.rect(0, 1, 3, 3, 0xffe4a0);
  g.set(1, 2, 0xfffbe8);
  return g;
}
/** 전구 빛 번짐 (가산 섞기용 부드러운 원) */
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

// ── 버스 정류장 ──
export const SHELTER_ART_W = 68;
export const SHELTER_ART_H = 56;
export function shelterArt(): Grid {
  const W = SHELTER_ART_W;
  const H = SHELTER_ART_H;
  const g = new Grid(W, H);
  const base = H - 3;
  const rust = { hi: 0xd4945e, mid: 0xb06c40, lo: 0x844a2c };
  // 뒷벽 (바랜 청록 판 + 오래된 캠핑장 포스터)
  g.rect(5, 16, W - 10, 18, 0x6e9a96);
  g.hline(5, W - 6, 16, 0x8ab8b2);
  g.rect(12, 19, 18, 12, 0xf2e2b8);
  g.ellipse(21, 25, 5, 3, 0x6ea052); // 포스터 속 숲
  g.rect(19, 21, 4, 3, 0xe8783a); // 포스터 속 텐트
  g.rect(36, 20, 20, 3, 0xe8dcc0); // 낙서·스티커
  g.rect(40, 25, 8, 5, 0xe0563c);
  // 기둥 (녹슨 쇠)
  for (const x of [4, W - 8]) {
    g.rect(x, 10, 4, base - 10, rust.mid);
    g.vline(x, 10, base - 1, rust.hi);
  }
  // 지붕 (녹슨 골함석, 앞으로 기울어짐)
  for (let y = 4; y < 14; y++)
    for (let x = 0; x < W; x++) {
      const ridge = x % 4;
      const c = ridge === 0 ? rust.hi : ridge === 3 ? rust.lo : rust.mid;
      g.set(x, y, hashU(x, y, 21) < 0.08 ? 0x7a5a3e : c);
    }
  g.hline(0, W - 1, 13, 0x5a3220);
  g.hline(0, W - 1, 4, 0xe0a878);
  // 지붕 등
  g.rect(W / 2 - 3, 14, 6, 3, 0xfff0c8);
  g.outline(OUT);
  shadow(g, W / 2, base + 1, W / 2 - 3, 2, 58);
  return g;
}
/**
 * 11/16 벤치에 앉은 사람 앞에 한 번 더 그리는 정류장 조각 [x, y, w, h]: 지붕(+등 윗부분)과 앞 기둥 둘 (그림자 줄은 뺀다).
 * 나머지(뒷벽·포스터)는 벤치 뒤 depth에 그린다 — 통째로 정류장 depth면 앉은 사람 머리가 뒷벽에 가렸다
 */
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
  // 동그란 정류장 표지 (버스 그림)
  g.ellipse(14.5, 7, 7, 7, 0x2e7aa8);
  g.ellipse(14.5, 7, 5.5, 5.5, 0xf4f0e4);
  g.rect(11, 4, 8, 5, 0x2e7aa8);
  g.rect(12, 5, 2, 2, 0xd8f0f8);
  g.rect(15, 5, 2, 2, 0xd8f0f8);
  g.set(12, 9, 0x2e2a28);
  g.set(17, 9, 0x2e2a28);
  // 노선 판 (글씨는 CampMap 이름표)
  g.rect(1, 17, 28, 13, 0x2e6a48);
  frame(g, 1, 17, 28, 13, 0xf4f0e4);
  g.hline(4, 25, 21, 0xf4f0e4);
  g.hline(4, 18, 25, 0xc8e0c8);
  // 녹 자국
  g.set(3, 29, 0xb06c40);
  g.set(26, 18, 0xb06c40);
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
  g.rect(1, 2, 16, 3, 0x3a6a98);
  for (let y = 7; y < 15; y += 2) g.hline(3, 14, y, y === 13 ? 0xe0563c : 0x9aa4ac);
  g.outline(OUT);
  shadow(g, 9, base + 1, 4, 1.2, 60);
  return g;
}

// ── NPC 5명 (2프레임 숨쉬기, 20×30 한 칸) ──
export const NPC_W = 20;
export const NPC_H = 30;
type NpcLook = { skin: Color; hair: Color; top: Color; topLo: Color; bottom: Color; hat?: "ranger" | "cap" | "scarf" | "hood" | "beanie"; hatC?: Color; extra?: "rod" | "scope" | "guitar" | "apron" | "vest" | "stars" };
const NPC_LOOKS: Record<CampNpcId, NpcLook> = {
  keeper: { skin: 0xf2d6b8, hair: 0x6a5a4a, top: 0x6e8a4a, topLo: 0x4e6a34, bottom: 0x7a6a52, hat: "ranger", hatC: 0x9a7448, extra: "vest" },
  clerk: { skin: 0xf6dcc0, hair: 0x3a2a24, top: 0xf2ece0, topLo: 0xc8bea8, bottom: 0x4a5a78, hat: "cap", hatC: 0xe0563c, extra: "apron" },
  granny: { skin: 0xf0d2b4, hair: 0xd8d4cc, top: 0x8a5aa0, topLo: 0x6a4080, bottom: 0x6a5a4a, hat: "scarf", hatC: 0xd8503a, extra: "rod" },
  stargazer: { skin: 0xecd8c8, hair: 0x2a2a3a, top: 0x2e3a6a, topLo: 0x1e284a, bottom: 0x2e3a6a, hat: "hood", hatC: 0x2e3a6a, extra: "stars" },
  guitarist: { skin: 0xf2d4b6, hair: 0x5a3a24, top: 0xc84a3a, topLo: 0x8a2e26, bottom: 0x4a5a6a, hat: "beanie", hatC: 0xe8b040, extra: "guitar" },
};
function npcFrame(g: Grid, ox: number, L: NpcLook, f: number): void {
  const cx = ox + NPC_W / 2;
  const base = NPC_H - 2;
  const bob = f; // 숨쉬기: 몸통 위쪽이 1px 오르내린다
  // 다리
  g.rect(cx - 4, base - 6, 3, 5, L.bottom);
  g.rect(cx + 1, base - 6, 3, 5, L.bottom);
  g.rect(cx - 4, base - 1, 3, 1, 0x3a2a20);
  g.rect(cx + 1, base - 1, 3, 1, 0x3a2a20);
  // 몸통
  const by = base - 15 + bob;
  g.rect(cx - 5, by, 10, 10 - bob, L.top);
  g.vline(cx + 4, by, base - 6, L.topLo);
  g.rect(cx - 7, by + 1, 2, 7, L.top); // 팔
  g.rect(cx + 5, by + 1, 2, 7, L.topLo);
  g.set(cx - 7, by + 8, L.skin);
  g.set(cx + 6, by + 8, L.skin);
  if (L.extra === "vest") {
    g.rect(cx - 5, by, 3, 9, 0x9a7448);
    g.rect(cx + 2, by, 3, 9, 0x9a7448);
    g.set(cx - 4, by + 3, 0xf2c444); // 배지
  }
  if (L.extra === "apron") {
    g.rect(cx - 4, by + 2, 8, 9, 0xe68a38);
    g.hline(cx - 4, cx + 3, by + 5, 0xc8702e);
  }
  if (L.extra === "stars") {
    // 망토 (넓게) + 별 무늬
    g.rect(cx - 7, by - 1, 14, 12 - bob, L.top);
    for (const [x, y] of [
      [-4, 2],
      [3, 4],
      [-1, 7],
      [4, 9],
    ])
      g.set(cx + x, by + y, 0xffe682);
  }
  // 머리
  const hy = by - 8;
  g.ellipse(cx, hy + 4, 4.5, 4.5, L.skin);
  g.rect(cx - 4, hy, 9, 2, L.hair);
  g.set(cx - 2, hy + 5, 0x2a2018);
  g.set(cx + 2, hy + 5, 0x2a2018);
  g.set(cx - 3, hy + 6, 0xf0a090); // 볼
  g.set(cx + 3, hy + 6, 0xf0a090);
  if (L.hat === "ranger") {
    g.rect(cx - 7, hy + 1, 15, 2, L.hatC!);
    g.rect(cx - 4, hy - 2, 9, 3, L.hatC!);
    g.hline(cx - 4, cx + 4, hy, 0x6a4a2a);
    g.rect(cx - 2, hy + 7, 5, 1, L.hair); // 콧수염
  }
  if (L.hat === "cap") {
    g.rect(cx - 4, hy - 1, 9, 3, L.hatC!);
    g.rect(cx + 1, hy + 1, 6, 1, L.hatC!);
  }
  if (L.hat === "scarf") {
    g.rect(cx - 5, hy - 1, 11, 4, L.hatC!);
    g.vline(cx - 5, hy + 2, hy + 6, L.hatC!);
    g.vline(cx + 5, hy + 2, hy + 6, L.hatC!);
    g.set(cx - 2, hy, 0xf4f0e4);
    g.set(cx + 2, hy + 1, 0xf4f0e4);
  }
  if (L.hat === "hood") {
    g.rect(cx - 5, hy - 1, 11, 3, L.hatC!);
    g.vline(cx - 5, hy, hy + 7, L.hatC!);
    g.vline(cx + 5, hy, hy + 7, L.hatC!);
  }
  if (L.hat === "beanie") {
    g.rect(cx - 4, hy - 2, 9, 4, L.hatC!);
    g.set(cx, hy - 3, 0xf4f0e4);
  }
  if (L.extra === "rod") {
    line(g, cx + 6, by + 6, cx + 9, hy - 6, 0x7a5a3a);
    g.set(cx + 9, hy - 7, 0xd8d4cc);
  }
  if (L.extra === "scope") line(g, cx + 5, by + 3, cx + 8, hy, 0xc8a050, 2);
  if (L.extra === "guitar") {
    g.ellipse(cx - 1, by + 7 - bob, 4, 3, 0xb87a40);
    g.ellipse(cx - 1, by + 7 - bob, 1.2, 1.2, 0x3a2a1a);
    line(g, cx + 2, by + 6 - bob, cx + 8, by + 1, 0x6a4a2a);
    g.set(cx + 4 - f, by + 6, 0xf2d4b6); // 줄 튕기는 손
  }
}
export function npcArt(id: CampNpcId): ArtOut {
  const L = NPC_LOOKS[id];
  const g = new Grid(NPC_W * 2, NPC_H);
  for (let f = 0; f < 2; f++) npcFrame(g, f * NPC_W, L, f);
  if (id === "stargazer") {
    // 망원경 (등에 메지 않고 옆에 세워 둔다)
    for (let f = 0; f < 2; f++) {
      const ox = f * NPC_W;
      line(g, ox + 17, NPC_H - 3, ox + 16, NPC_H - 10, 0x6a6a72);
      line(g, ox + 15, NPC_H - 10, ox + 19, NPC_H - 15, 0xc8a050, 2);
    }
  }
  g.outline(OUT);
  for (let f = 0; f < 2; f++) shadow(g, f * NPC_W + NPC_W / 2, NPC_H - 1.5, 6, 1.3, 64);
  return { grid: g, frameW: NPC_W, frameH: NPC_H };
}

/** 다람쥐 2프레임 (12×10) */
export function squirrelArt(): ArtOut {
  const g = new Grid(24, 10);
  for (let f = 0; f < 2; f++) {
    const ox = f * 12;
    const lift = f;
    g.ellipse(ox + 5, 6 - lift, 3, 2.2, 0xc8743a); // 몸
    g.ellipse(ox + 8, 4 - lift, 1.8, 1.6, 0xc8743a); // 머리
    g.set(ox + 9, 3 - lift, 0x2a1a10);
    g.set(ox + 8, 2 - lift, 0xa85a2a); // 귀
    g.ellipse(ox + 2, 3 + lift, 2.2, 3, 0xe09a52); // 꼬리
    g.set(ox + 1, 1 + lift, 0xf2c070);
    g.set(ox + 6, 8, 0x8a4a22);
  }
  g.outline(OUT);
  return { grid: g, frameW: 12, frameH: 10 };
}

// ── 하늘·효과 ──

/** 부드러운 값 잡음 (격자 해시를 겹선형 보간) 0..1 */
function smoothNoise(x: number, y: number, salt: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hashU(x0, y0, salt);
  const b = hashU(x0 + 1, y0, salt);
  const c = hashU(x0, y0 + 1, salt);
  const d = hashU(x0 + 1, y0 + 1, salt);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** 은하수 띠 (화면 고정, 가산 섞기 — 투명 바탕에 별·옅은 띠) */
export function milkyWayArt(): Grid {
  const W = 320;
  const H = 140;
  const g = new Grid(W, H);
  const r = rng(424242);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      // 띠: 왼쪽 아래 → 오른쪽 위로 기운 선에서의 거리
      const d = Math.abs(y - (H * 0.78 - x * 0.32)) / 26;
      const band = Math.max(0, 1 - d);
      const neb = band * (0.35 + 0.65 * smoothNoise(x / 12, y / 9, 9)) * 0.42;
      if (neb > 0.04) g.set(x, y, mix(0x5a6aa8, 0xc8a8d8, smoothNoise(x / 30, y / 20, 3)), Math.round(255 * neb));
    }
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(r() * W);
    const yLine = H * 0.78 - x * 0.32;
    const spread = r() < 0.65 ? 22 : 70;
    const y = Math.round(yLine + (r() - 0.5) * 2 * spread);
    if (y < 0 || y >= H) continue;
    const bright = r();
    g.set(x, y, bright > 0.92 ? 0xfff8e0 : bright > 0.6 ? 0xd8e4ff : 0xa8b4d8, bright > 0.92 ? 255 : 150 + Math.round(bright * 100));
    if (bright > 0.97) {
      g.set(x - 1, y, 0xd8e4ff, 120);
      g.set(x + 1, y, 0xd8e4ff, 120);
      g.set(x, y - 1, 0xd8e4ff, 120);
      g.set(x, y + 1, 0xd8e4ff, 120);
    }
  }
  return g;
}

/** 물안개 한 덩이 (부드러운 타원) */
export function mistArt(): Grid {
  const W = 128;
  const H = 40;
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2));
      if (d >= 1) continue;
      const n = 0.75 + 0.25 * hashU(x >> 3, y >> 2, 4);
      g.set(x, y, 0xf4f6f2, Math.round(150 * (1 - d) ** 1.4 * n));
    }
  return g;
}

export function sparkleArt(): Grid {
  const g = new Grid(5, 3);
  g.hline(0, 4, 1, 0xd8f4f8);
  g.set(2, 0, 0xffffff);
  g.set(2, 2, 0xffffff);
  return g;
}
export function emberArt(): Grid {
  const g = new Grid(2, 2);
  g.rect(0, 0, 2, 2, 0xffc040);
  g.set(1, 1, 0xff7a2a);
  return g;
}
export function fireflyArt(): Grid {
  const g = new Grid(3, 3);
  g.set(1, 1, 0xfaffb0);
  g.set(0, 1, 0xd8ff6a, 140);
  g.set(2, 1, 0xd8ff6a, 140);
  g.set(1, 0, 0xd8ff6a, 140);
  g.set(1, 2, 0xd8ff6a, 140);
  return g;
}
export function dripArt(): Grid {
  const g = new Grid(1, 4);
  g.set(0, 0, 0xc8e4f0, 120);
  g.set(0, 1, 0xd8eef8, 180);
  g.set(0, 2, 0xe8f6ff, 230);
  g.set(0, 3, 0xe8f6ff, 230);
  return g;
}

// ── 바닥 (덩어리마다 RGBA로 굽는다) ──

export const CAMP_CHUNK = 512;

const GC = {
  grass: [0x8a8642, 0x7a7a3a, 0x9a9450, 0x6e7036] as const,
  blade: 0xa8a258,
  path: [0xa88a5e, 0x96784e, 0xbc9c6c] as const,
  plaza: [0xb49a6e, 0xa2875c, 0xc4aa7c] as const,
  road: [0x55524e, 0x4a4744, 0x625f5a] as const,
  bank: [0xb0a690, 0x968c78, 0xc8bea8] as const,
  rock: [0x9c968a, 0x86817a, 0xb4ae9e, 0x7a8a4a] as const,
  water: { deep: 0x3a7a8e, mid: 0x4a92a4, shallow: 0x6cb4c0, light: 0xa8dce0, foam: 0xe8f6f4 },
};
/**
 * 11/16 바닥 낙엽 색: 낮에 낙엽 점이 너무 쨍해서 눈이 아프다(사용자 — 밤엔 괜찮았다) → 풀색에 섞어 채도·밝기를 낮춘다.
 * 가장 밝은 노랑(0xffe07a)은 바닥에서 뺀다 (나무·낙엽 더미 그림은 LEAF_COLORS 그대로)
 */
const GROUND_LEAF: readonly Color[] = LEAF_COLORS.slice(0, 4).map((c) => mix(c, GC.grass[0], 0.4));


function put(d: Uint8ClampedArray, i: number, c: Color, a = 255): void {
  d[i] = (c >> 16) & 255;
  d[i + 1] = (c >> 8) & 255;
  d[i + 2] = c & 255;
  d[i + 3] = a;
}

/** 바닥 한 점 색 (x,y 월드 좌표, k = 그 자리 바닥 종류, nearPath = 길 가까이) */
function groundColor(x: number, y: number, k: CampGround, nearPath: boolean): Color {
  const n = hashU(x, y, 1);
  switch (k) {
    case "water": {
      const sx = x - campStreamX(y);
      const edge = Math.abs(sx) / CAMP_STREAM_HALF_W;
      // 물결: 흐름 방향(아래)으로 길쭉한 줄
      const flow = hashU(Math.floor((x + Math.sin(y * 0.09) * 3) / 2), Math.floor(y / 7), 31);
      let c: Color = edge > 0.8 ? GC.water.shallow : edge > 0.45 ? GC.water.mid : GC.water.deep;
      if (flow > 0.9) c = GC.water.light;
      else if (flow > 0.82 && edge < 0.8) c = mix(c, GC.water.light, 0.45);
      if (edge > 0.9 && n > 0.6) c = GC.water.foam;
      // 바닥 돌 비침
      if (edge < 0.7 && hashU(x >> 2, y >> 2, 33) > 0.93) c = mix(c, 0x7a7a6a, 0.35);
      return c;
    }
    case "bank":
      return n < 0.18 ? GC.bank[1] : n > 0.84 ? GC.bank[2] : hashU(x >> 1, y >> 1, 3) < 0.2 ? 0xa49a84 : GC.bank[0];
    case "road": {
      let c: Color = n < 0.12 ? GC.road[1] : n > 0.9 ? GC.road[2] : GC.road[0];
      // 길 위 가장자리 연석
      if (y < CAMP_ROAD.y + 5) c = n < 0.5 ? 0x9a968c : 0xb4b0a4;
      // 정류장 앞 노란 정차 칸 (테두리 점선)
      // 버스는 문이 정류장 앞에 오게 서고(문은 차 앞쪽), 왼쪽에서 들어온다 → 칸은 정류장 왼쪽으로 치우친다
      const bx0 = CAMP_BUS_STOP.x - 98;
      const bx1 = CAMP_BUS_STOP.x + 30;
      const by0 = CAMP_ROAD.y + 9;
      const by1 = CAMP_ROAD.y + 38;
      if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) {
        const onEdge = y === by0 || y === by0 + 1 || y === by1 || y === by1 - 1 ? (x >> 2) % 2 === 0 : x === bx0 || x === bx0 + 1 || x === bx1 || x === bx1 - 1;
        if (onEdge) c = 0xe8c040;
      }
      // 길 가운데 바랜 흰 점선 (정차 칸 밖)
      if (y >= CAMP_ROAD.y + 40 && y <= CAMP_ROAD.y + 41 && (x >> 3) % 2 === 0 && (x < bx0 - 4 || x > bx1 + 4)) c = 0xc8c4b8;
      return c;
    }
    case "rock": {
      const crack = hashU(x >> 2, y >> 1, 41) > 0.94;
      if (crack) return GC.rock[1];
      if (hashU(x >> 2, y >> 2, 43) < 0.1) return GC.rock[3]; // 이끼
      // 낙엽이 바위 틈에 조금
      if (hashU(x >> 1, y >> 1, 45) < 0.04) return GROUND_LEAF[Math.floor(hashU(x, y, 46) * GROUND_LEAF.length)];
      return n < 0.15 ? GC.rock[1] : n > 0.85 ? GC.rock[2] : GC.rock[0];
    }
    case "plaza": {
      const r = Math.hypot(x - CAMP_FIRE.x, (y - CAMP_FIRE.y) * 1.12);
      // 가장자리 돌 테두리
      if (r > CAMP_PLAZA_R - 6) {
        const cell = hashU(Math.floor(x / 4), Math.floor(y / 3), 51);
        return cell < 0.55 ? (n < 0.5 ? 0xb4ae9e : 0x9c968a) : GC.plaza[1];
      }
      // 불 둘레는 재로 거뭇하게
      if (r < 30 && n < (30 - r) / 40) return 0x6a5a48;
      return n < 0.14 ? GC.plaza[1] : n > 0.88 ? GC.plaza[2] : hashU(x >> 1, y >> 1, 53) < 0.03 ? 0xd8a840 : GC.plaza[0];
    }
    case "path": {
      if (hashU(x >> 1, y >> 1, 61) < 0.08) return GROUND_LEAF[Math.floor(hashU(x, y, 62) * GROUND_LEAF.length)];
      if (hashU(x, y, 63) > 0.97) return 0xc8b89a; // 자갈
      return n < 0.16 ? GC.path[1] : n > 0.86 ? GC.path[2] : GC.path[0];
    }
    case "deckPad":
    case "grass":
    default: {
      // 낙엽 깔린 풀: 군데군데 잎이 수북한 곳 (큰 얼룩) + 흩어진 잎
      // 11/15 더 촘촘하게 (사용자: 낙엽 점을 늘려 달라) → 11/16 낮에 지글거려 눈이 아프다: 흩어진 점은 줄이고 수북한 곳에 모은다.
      // 수북한 곳은 4px 덩어리 (2px 점이 화면 가득 흩어지면 낮에 지글거려 보인다), 색은 풀에 섞은 GROUND_LEAF
      const inPile = hashU(x >> 4, y >> 4, 71) > 0.65;
      const rate = inPile ? 0.46 : 0.1 + (nearPath ? 0.06 : 0);
      const gx = inPile ? x >> 2 : x >> 1;
      const gy = inPile ? y >> 2 : y >> 1;
      if (hashU(gx, gy, 72) < rate) {
        const li = Math.floor(hashU(gx, gy, 73) * GROUND_LEAF.length);
        return n < 0.25 ? darken(GROUND_LEAF[li], 0.08) : GROUND_LEAF[li];
      }
      if (n > 0.95) return GC.blade;
      const g0 = n < 0.18 ? GC.grass[1] : n > 0.86 ? GC.grass[2] : GC.grass[0];
      // 큰 얼룩 (짙은 풀)
      return hashU(x >> 3, y >> 3, 75) < 0.18 ? mix(g0, GC.grass[3], 0.5) : g0;
    }
  }
}

/** 바닥 덩어리 RGBA (CAMP_CHUNK × CAMP_CHUNK, 맵 밖은 가장자리 숲 바닥) */
export function campGroundPixels(cx: number, cy: number, size = CAMP_CHUNK): Uint8ClampedArray {
  const steps = campGroundSteps(cx, cy, size);
  let r = steps.next();
  while (!r.done) r = steps.next();
  return r.value;
}

/** 바닥 덩어리를 줄 묶음(band줄)마다 멈추며 굽는다 — 버스 창밖 연출 동안 프레임마다 조금씩 (campPrebake). 끝나면 RGBA를 돌려준다 */
export function* campGroundSteps(cx: number, cy: number, size = CAMP_CHUNK, band = 32): Generator<void, Uint8ClampedArray> {
  const out = new Uint8ClampedArray(size * size * 4);
  const ox = cx * size;
  const oy = cy * size;
  // 맵 밖(오른쪽·아래)은 그리지 않는다 (카메라가 맵 밖을 보지 않는다)
  const w = Math.max(0, Math.min(size, CAMP_WIDTH - ox));
  const h = Math.max(0, Math.min(size, CAMP_HEIGHT - oy));
  // 바닥 종류는 2px 칸마다 한 번 (경계 흔들림이 4px 단위라 차이가 없다) — 덩어리 하나 굽는 시간을 1/3로
  const hw = Math.ceil(w / 2);
  const kinds: CampGround[] = new Array(hw * Math.ceil(h / 2));
  const near = new Uint8Array(kinds.length);
  // band줄씩 (짝수 줄에서 끊어 2px 칸 표가 묶음 안에서 끝난다)
  const step = Math.max(2, band & ~1);
  for (let y0 = 0; y0 < h; y0 += step) {
    const y1 = Math.min(h, y0 + step);
    for (let y = y0; y < y1; y += 2)
      for (let x = 0; x < w; x += 2) {
        const i = (y >> 1) * hw + (x >> 1);
        const kd = campGroundKind(ox + x, oy + y);
        kinds[i] = kd;
        near[i] = kd === "grass" && pathEdgeDist(ox + x, oy + y, 12) < 10 ? 1 : 0;
      }
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < w; x++) {
        const i = (y >> 1) * hw + (x >> 1);
        put(out, (y * size + x) * 4, groundColor(ox + x, oy + y, kinds[i], near[i] === 1));
      }
    yield;
  }
  // 징검다리 돌 (물 위에 얹힌 납작한 돌)
  for (const s of CAMP_STEP_STONES) {
    for (let y = -5; y <= 5; y++)
      for (let x = -8; x <= 8; x++) {
        const d = (x / 7.5) ** 2 + (y / 5) ** 2;
        if (d > 1) continue;
        const px = Math.round(s.x + x - ox);
        const py = Math.round(s.y + y - oy);
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const c = d > 0.75 ? (y > 0 ? 0x5a5650 : 0x8a857a) : y < -1 ? STONE.hi : hashU(px, py, 81) < 0.15 ? STONE.moss : STONE.mid;
        put(out, (py * size + px) * 4, c);
      }
    // 돌 아래 물살 거품
    for (let x = -6; x <= 6; x++) {
      const px = Math.round(s.x + x - ox);
      const py = Math.round(s.y + 6 - oy);
      if (px >= 0 && py >= 0 && px < size && py < size && hashU(px, py, 83) < 0.7) put(out, (py * size + px) * 4, GC.water.foam);
    }
  }
  return out;
}

/** 건너는 곳 (통나무 다리 그림 자리 — 왼쪽 위 원점) */
export function bridgePlacement(): { x: number; y: number } {
  const c = CAMP_CROSSINGS.find((k) => k.kind === "bridge")!;
  const y = (c.y0 + c.y1) / 2;
  return { x: Math.round(campStreamX(y) - BRIDGE_W / 2), y: Math.round(y - BRIDGE_H / 2) };
}

/** 산꼭대기 정보 (일출빛 자리) */
export const CAMP_SUNRISE = { x: CAMP_SUMMIT.x + 40, y: CAMP_SUMMIT.y - 70 } as const;


// ── 11/15 캠핑카 앞 캠핑 도구 ──

/** 캠핑 의자 천 색 (캠핑카마다 다르게) */
const CHAIR_CLOTH: readonly Pal3[] = [
  { hi: 0x7ec4b0, mid: 0x4f9a88, lo: 0x2f6a5e },
  { hi: 0xf0b860, mid: 0xd08a34, lo: 0x94561c },
  { hi: 0xe88a7a, mid: 0xc45a50, lo: 0x8a3430 },
];
const METAL: Pal3 = { hi: 0xc8ccd0, mid: 0x8a9096, lo: 0x5a6066 };

/** 접이식 탁자 (알루미늄 다리 + 나무 상판) */
export function foldTableArt(): Grid {
  const g = new Grid(30, 18);
  g.rect(2, 3, 26, 7, WOOD_DECK.mid);
  for (let x = 4; x < 28; x += 4) g.vline(x, 3, 9, WOOD_DECK.lo);
  g.hline(2, 27, 3, WOOD_DECK.hi);
  g.hline(2, 27, 9, WOOD_DECK.lo);
  // X자 다리
  line(g, 5, 10, 11, 15, METAL.mid);
  line(g, 11, 10, 5, 15, METAL.lo);
  line(g, 19, 10, 25, 15, METAL.mid);
  line(g, 25, 10, 19, 15, METAL.lo);
  // 컵 두 개와 작은 냄비
  g.rect(8, 4, 2, 3, 0xe8e0d0);
  g.rect(20, 4, 2, 3, 0x6aa0c8);
  g.outline(OUT);
  shadow(g, 15, 16, 13, 1.4, 50);
  return g;
}

/** 캠핑 의자 (앞모습 — 아래를 보고 앉는다) */
export function campChairFrontArt(i: number): Grid {
  const c = CHAIR_CLOTH[i % CHAIR_CLOTH.length];
  const g = new Grid(16, 18);
  // 등받이 천
  g.rect(3, 2, 10, 7, c.mid);
  g.hline(3, 12, 2, c.hi);
  g.vline(3, 2, 8, c.lo);
  g.vline(12, 2, 8, c.lo);
  // 팔걸이·앉는 천
  g.rect(2, 9, 12, 3, c.lo);
  g.hline(2, 13, 9, METAL.hi);
  g.rect(1, 8, 2, 2, METAL.mid);
  g.rect(13, 8, 2, 2, METAL.mid);
  g.set(14, 10, 0x4a7ac8); // 컵꽂이
  // 다리
  line(g, 3, 12, 2, 16, METAL.lo);
  line(g, 12, 12, 13, 16, METAL.lo);
  line(g, 4, 12, 11, 16, METAL.mid);
  g.outline(OUT);
  shadow(g, 8, 17, 7, 1.2, 50);
  return g;
}

/** 캠핑 의자 (옆모습 — 오른쪽을 보고 앉는다. 왼쪽은 좌우 뒤집기) */
export function campChairSideArt(i: number): Grid {
  const c = CHAIR_CLOTH[i % CHAIR_CLOTH.length];
  const g = new Grid(16, 18);
  // 등받이 (왼쪽, 살짝 눕힘)
  line(g, 3, 2, 4, 10, c.mid, 2);
  g.set(3, 2, c.hi);
  // 앉는 천 (오른쪽으로 처짐)
  g.rect(4, 9, 8, 3, c.mid);
  g.hline(4, 11, 9, c.hi);
  g.hline(5, 10, 11, c.lo);
  // 팔걸이
  g.hline(4, 12, 7, METAL.mid);
  // X자 다리
  line(g, 4, 12, 11, 16, METAL.mid);
  line(g, 11, 12, 4, 16, METAL.lo);
  g.outline(OUT);
  shadow(g, 8, 17, 7, 1.2, 50);
  return g;
}

/** 화롯대 (검은 쇠 그릇 + 다리 + 장작 숯, 불꽃은 brazierFireArt가 위에서 일렁인다) */
export function brazierArt(): Grid {
  const g = new Grid(18, 16);
  g.ellipse(9, 6, 8, 3, 0x3a3634);
  g.ellipse(9, 5.5, 6.5, 2, 0x8a3a1c); // 숯
  for (const [x, y] of [[6, 5], [10, 6], [12, 5]] as const) g.set(x, y, 0xffb040);
  g.rect(3, 6, 12, 3, 0x2e2a28);
  g.hline(3, 14, 6, 0x5a5654);
  line(g, 5, 9, 3, 14, 0x2e2a28);
  line(g, 13, 9, 15, 14, 0x2e2a28);
  line(g, 9, 9, 9, 14, 0x2e2a28);
  g.outline(OUT);
  shadow(g, 9, 15, 8, 1.2, 50);
  return g;
}

/** 화롯대 작은 불꽃 (3프레임 시트, 원점 아래 가운데) */
export function brazierFireArt(): ArtOut {
  const F = 3;
  const W = 10;
  const H = 12;
  const g = new Grid(W * F, H);
  for (let f = 0; f < F; f++) {
    const ox = f * W;
    const sway = [0, 1, -1][f];
    g.ellipse(ox + 5, 9, 4, 3, 0xd8582a);
    g.ellipse(ox + 5 + sway * 0.5, 6, 3, 4, 0xf08a30);
    g.ellipse(ox + 5 + sway, 4, 1.6, 3, 0xffc850);
    g.set(ox + 5 + sway, 1 + (f % 2), 0xfff0a0);
  }
  return { grid: g, frameW: W, frameH: H };
}

/** 탁자 위 캠핑 랜턴 (손잡이 + 불빛 유리) */
export function lanternArt(): Grid {
  const g = new Grid(8, 12);
  g.rect(2, 3, 4, 6, 0xffd890);
  g.vline(2, 3, 8, 0xf0b860);
  g.set(4, 5, 0xfff8d8);
  g.rect(1, 9, 6, 2, 0x3a5a4a);
  g.rect(1, 2, 6, 1, 0x3a5a4a);
  g.hline(2, 5, 0, METAL.mid);
  g.set(1, 1, METAL.mid);
  g.set(6, 1, METAL.mid);
  g.outline(OUT);
  return g;
}

/** 아이스박스 (하늘색 몸통 + 흰 뚜껑) */
export function iceboxArt(): Grid {
  const g = new Grid(18, 14);
  g.rect(2, 5, 14, 7, 0x5aa8d8);
  g.hline(2, 15, 11, 0x3a7aa8);
  g.vline(2, 5, 11, 0x7ac4ec);
  g.rect(1, 3, 16, 3, 0xf0f0e8);
  g.hline(1, 16, 3, 0xffffff);
  g.rect(6, 1, 6, 2, 0xd8d8d0); // 손잡이
  g.rect(12, 7, 2, 2, 0xffffff); // 스티커
  g.outline(OUT);
  shadow(g, 9, 13, 8, 1.2, 50);
  return g;
}

export const PLATE_SIGN_W = 64;
export const PLATE_SIGN_H = 40;
/**
 * 「언젠가 씨네」 문패 팻말 (가운데 캠핑카 옆에 세운 나무 간판): 둥근 지붕 띠, 넓은 판(글씨는 CampMap이 얹는다),
 * 아래 꽃 상자, 기둥 둘. 원점 = 바닥 가운데
 */
export function plateSignArt(): Grid {
  const W = PLATE_SIGN_W;
  const H = PLATE_SIGN_H;
  const g = new Grid(W, H);
  // 기둥
  g.rect(8, 18, 3, H - 20, WOOD.lo);
  g.rect(W - 11, 18, 3, H - 20, WOOD.lo);
  // 판 (크림색 바탕 + 나무 테두리)
  g.rect(3, 6, W - 6, 18, WOOD.mid);
  g.rect(5, 8, W - 10, 14, 0xf6e6c0);
  g.hline(5, W - 6, 8, 0xfff4dc);
  frame(g, 4, 7, W - 8, 16, WOOD.line);
  // 지붕 띠 (둥글게)
  for (let x = 2; x < W - 2; x++) {
    const t = (x - W / 2) / (W / 2);
    const y = Math.round(5 - (1 - t * t) * 4);
    g.vline(x, y, 6, WOOD.lo);
    g.set(x, y, WOOD.hi);
  }
  // 모서리 별 장식
  for (const x of [8, W - 9]) {
    g.set(x, 11, 0xe8b040);
    g.set(x - 1, 12, 0xe8b040);
    g.set(x + 1, 12, 0xe8b040);
    g.set(x, 13, 0xe8b040);
  }
  // 꽃 상자
  g.rect(14, H - 9, W - 28, 4, 0x9a6a40);
  g.hline(14, W - 15, H - 9, 0xc08a58);
  for (let x = 16; x < W - 16; x += 4) {
    g.set(x, H - 11, x % 8 ? 0xe86a6a : 0xf0d060);
    g.set(x + 1, H - 10, 0x5a9a4a);
  }
  g.outline(OUT);
  shadow(g, W / 2, H - 2, W / 2 - 6, 1.6, 54);
  return g;
}


// ── 11/15 야외 바베큐장 ──

/** 숯불 바베큐 그릴: 드럼통 반쪽 몸통 + 석쇠 위 고기·소시지·꼬치 + 빨간 숯 + 다리 둘 */
export function bbqGrillArt(): Grid {
  const g = new Grid(30, 26);
  // 다리
  line(g, 6, 15, 4, 24, 0x2e2a28);
  line(g, 24, 15, 26, 24, 0x2e2a28);
  g.hline(6, 24, 20, 0x3a3634);
  // 몸통 (검은 드럼 반쪽)
  g.ellipse(15, 13, 12, 5, 0x34302e);
  g.rect(3, 9, 25, 5, 0x34302e);
  g.hline(3, 27, 9, 0x5a5654);
  g.hline(4, 26, 14, 0x24201e);
  // 숯 (빨갛게)
  g.ellipse(15, 9, 10.5, 2.6, 0x7a2a14);
  for (const [x, y] of [[8, 9], [12, 8], [17, 10], [21, 9], [14, 10]] as const) g.set(x, y, 0xff8a30);
  // 석쇠
  for (let x = 5; x <= 25; x += 3) g.vline(x, 6, 9, 0x8a8e92);
  g.hline(4, 26, 7, 0xa8acb0);
  // 삼겹살 두 점 · 소시지 · 마시멜로 꼬치
  g.rect(6, 4, 6, 3, 0xd8826a);
  g.hline(6, 11, 5, 0xf2d8c8);
  g.rect(13, 5, 4, 2, 0xc8705a);
  g.rect(18, 5, 6, 2, 0xb05a34);
  g.hline(18, 23, 5, 0xd8784a);
  line(g, 25, 2, 28, 8, 0xc8a070);
  g.rect(24, 2, 3, 2, 0xfaf4ec);
  // 옆 손잡이
  g.rect(0, 10, 3, 2, 0x5a5654);
  g.outline(OUT);
  shadow(g, 15, 24.5, 12, 1.4, 54);
  return g;
}

/** 음료 자판기 (빨간 몸통 + 불 들어오는 진열창 + 꺼내는 칸). 22×36, 원점 바닥 가운데 */
export function vendingArt(): Grid {
  const g = new Grid(22, 36);
  // 몸통
  g.rect(2, 2, 18, 31, 0xc8343a);
  g.vline(2, 2, 32, 0xe0565a);
  g.vline(19, 2, 32, 0x9a2228);
  g.hline(2, 19, 2, 0xe86a6a);
  // 위 간판 (흰 바탕 + 파란 줄)
  g.rect(4, 4, 14, 3, 0xf4f4f0);
  g.hline(5, 16, 5, 0x3a78c8);
  // 진열창 (밝은 하늘색 바탕 + 캔·병 세 줄)
  g.rect(4, 9, 14, 13, 0xd8f0fa);
  const cans = [0xe84848, 0x48a8e8, 0xf0c040, 0x58c068, 0xf0f0f0, 0x8ac04a];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const col = cans[(r * 4 + c) % cans.length];
      const x = 5 + c * 3;
      const y = 10 + r * 4;
      g.rect(x, y, 2, 3, col);
      g.set(x, y, 0xffffff);
    }
    g.hline(4, 17, 13 + r * 4, 0xa8c8d8); // 선반
  }
  // 버튼 줄 · 돈 넣는 곳
  for (let c = 0; c < 4; c++) g.set(6 + c * 3, 23, 0xffe070);
  g.rect(15, 24, 2, 3, 0x2a2a2a);
  // 꺼내는 칸
  g.rect(4, 27, 14, 4, 0x2a1a1c);
  g.hline(4, 17, 27, 0x5a3a3c);
  // 다리
  g.rect(3, 33, 3, 2, 0x3a3a3a);
  g.rect(16, 33, 3, 2, 0x3a3a3a);
  g.outline(OUT);
  shadow(g, 11, 34.5, 10, 1.3, 54);
  return g;
}

/** 자판기 밤 불빛: 진열창·간판·버튼만 밝게 (ADD로 겹친다). vendingArt와 같은 크기 */
export function vendingLitArt(): Grid {
  const g = new Grid(22, 36);
  g.rect(4, 9, 14, 13, 0x8ac8e8);
  g.rect(5, 10, 12, 11, 0xb8e8ff);
  g.rect(4, 4, 14, 3, 0x9aa8b8);
  for (let c = 0; c < 4; c++) g.set(6 + c * 3, 23, 0xffd060);
  return g;
}

/** 바베큐장 나무 탁자 (접시·양념병·컵) */
export function bbqTableArt(): Grid {
  const g = new Grid(48, 20);
  g.rect(2, 3, 44, 9, WOOD.mid);
  for (let y = 3; y < 12; y += 3) g.hline(2, 45, y, WOOD.hi);
  g.hline(2, 45, 11, WOOD.lo);
  g.rect(5, 12, 3, 6, WOOD.lo);
  g.rect(40, 12, 3, 6, WOOD.lo);
  // 접시 둘 + 고기
  for (const cx of [12, 32]) {
    g.ellipse(cx, 7, 5, 2.4, 0xf4f0e8);
    g.rect(cx - 2, 6, 4, 2, 0xd08060);
  }
  // 양념병·컵
  g.rect(21, 3, 2, 5, 0xc83a2a);
  g.rect(24, 4, 2, 4, 0xe8c040);
  g.rect(39, 5, 3, 3, 0x6aa0c8);
  g.outline(OUT);
  shadow(g, 24, 18.5, 21, 1.4, 50);
  return g;
}

/** 고기 굽는 연기 한 점 (부드러운 회색 덩어리 — 위로 오르며 커지고 흐려진다) */
export function bbqSmokeArt(): Grid {
  const g = new Grid(10, 8);
  g.ellipse(5, 4, 4.6, 3.4, 0xd8d4cc, 150);
  g.ellipse(4, 3, 2.4, 1.8, 0xf0ece4, 170);
  return g;
}

/** 먹을 때 뜨는 접시 (메뉴마다 위에 올린 것이 다르다) */
export function bbqPlateArt(id: string): Grid {
  // 11/15 마실 거리는 잔·사발·컵 그림
  if (id === "beer" || id === "soju" || id === "makgeolli" || id === "coffee" || id === "hangover") return drinkArt(id);
  const g = new Grid(16, 10);
  g.ellipse(8, 6, 7, 3, 0xf8f4ec);
  g.ellipse(8, 6.5, 5, 1.8, 0xe8e2d6);
  if (id === "pork") {
    g.rect(4, 3, 4, 3, 0xd8826a);
    g.hline(4, 7, 4, 0xf2d8c8);
    g.rect(9, 3, 4, 3, 0xc8705a);
    g.hline(9, 12, 4, 0xf2d8c8);
    g.set(13, 2, 0x5a9a4a); // 상추 한 장
  } else if (id === "sausage") {
    g.rect(4, 3, 8, 2, 0xb05a34);
    g.hline(4, 11, 3, 0xd8784a);
    g.set(12, 3, 0xe8c040); // 머스터드
  } else if (id === "hotteok") {
    // 꿀호떡: 노릇한 둥근 떡 + 꿀이 비치는 가운데
    g.ellipse(8, 4.5, 4.5, 2.4, 0xd89040);
    g.ellipse(8, 4.2, 3.4, 1.6, 0xeab05a);
    g.hline(7, 9, 4, 0x8a4a1c);
    g.set(11, 6, 0xc87a28); // 흘러내린 꿀
  } else if (id === "wholepork") {
    // 통삼겹 바비큐: 접시를 덮는 큰 덩어리 (윤기 나는 껍질 + 비계 줄) + 꽂힌 꼬챙이
    g.ellipse(8, 4.5, 6.5, 3.6, 0x9a3e22);
    g.ellipse(8, 4, 5.5, 2.6, 0xc8582e);
    g.hline(3, 13, 5, 0xf2d8c8);
    g.hline(4, 12, 6, 0xb04a2a);
    g.set(6, 2, 0xf0a070); // 윤기
    g.set(7, 2, 0xf0a070);
    g.vline(12, 0, 3, 0xd8c8a0);
    g.set(13, 0, 0x5a9a4a); // 허브 한 줄기
  } else if (id === "tomahawk") {
    // 도끼 스테이크: 두툼한 고기 + 길게 뻗은 뼈
    g.ellipse(6, 5, 4, 2.4, 0x8a2e24);
    g.ellipse(6, 4.6, 3, 1.5, 0xb84a3a);
    g.hline(4, 8, 4, 0x6a2018); // 그릴 자국
    line(g, 9, 4, 14, 1, 0xf4ecdc);
    g.set(14, 0, 0xf4ecdc);
    g.set(15, 1, 0xf4ecdc);
  } else if (id === "zap") {
    // 번개 닭꼬치: 꼬치에 꿴 고기 세 덩이 + 노란 번개
    line(g, 2, 7, 14, 3, 0xc8a070);
    g.rect(4, 4, 2, 2, 0xd8783a);
    g.rect(7, 4, 2, 2, 0xc8602a);
    g.rect(10, 3, 2, 2, 0xd8783a);
    for (const [x, y] of [[13, 0], [12, 1], [13, 1], [12, 2], [13, 2], [14, 2], [13, 3], [14, 4]] as const) g.set(x, y, 0xffe040);
  } else {
    line(g, 3, 6, 13, 1, 0xc8a070);
    g.rect(5, 3, 3, 2, 0xfaf4ec);
    g.rect(9, 1, 3, 2, 0xf0d8a8); // 살짝 그을린 마시멜로
  }
  g.outline(OUT);
  return g;
}


/** 11/15 마실 거리: 맥주잔(거품)·소주잔과 초록 병·막걸리 사발·캠핑 커피 컵(김). 16×12, 원점 바닥 가운데 */
export function drinkArt(id: "beer" | "soju" | "makgeolli" | "coffee" | "hangover"): Grid {
  const g = new Grid(16, 12);
  if (id === "hangover") {
    // 컨디숑: 작은 갈색 병 + 초록 라벨 + 노란 뚜껑
    g.rect(6, 4, 5, 7, 0x8a5428);
    g.rect(7, 2, 3, 2, 0x8a5428);
    g.rect(7, 1, 3, 1, 0xf0c040);
    g.rect(6, 6, 5, 3, 0x8ac04a);
    g.hline(7, 9, 7, 0xf4f8e8);
    g.vline(7, 4, 10, 0xb07840);
  } else if (id === "beer") {
    // 손잡이 달린 유리잔 + 호박색 맥주 + 흰 거품
    g.rect(4, 4, 7, 7, 0xe8a830);
    g.vline(5, 5, 10, 0xf8d070); // 반사
    g.rect(4, 2, 7, 3, 0xfaf6ec);
    g.set(3, 3, 0xfaf6ec);
    g.set(11, 2, 0xfaf6ec);
    g.vline(12, 5, 9, 0xd8e4ec);
    g.set(13, 6, 0xd8e4ec);
    g.set(13, 7, 0xd8e4ec);
    g.set(13, 8, 0xd8e4ec);
    g.hline(4, 10, 10, 0xc88820);
  } else if (id === "soju") {
    // 초록 병 + 작은 잔
    g.rect(2, 3, 4, 8, 0x3a9a6a);
    g.rect(3, 1, 2, 2, 0x3a9a6a);
    g.vline(3, 4, 9, 0x8ad8b0);
    g.rect(2, 6, 4, 2, 0xe8f0e8); // 라벨
    g.rect(9, 7, 4, 4, 0xe8f0f4);
    g.hline(9, 12, 8, 0xc8e8e0);
    g.set(10, 9, 0xffffff);
  } else if (id === "makgeolli") {
    // 납작한 양은 사발 + 뽀얀 막걸리
    g.ellipse(8, 7, 6.5, 3, 0xd8c088);
    g.ellipse(8, 6.2, 5.5, 2, 0xf4ecd8);
    g.hline(3, 13, 9, 0xb09860);
    g.set(6, 6, 0xffffff);
  } else {
    // 법랑 캠핑 컵 (하늘색 + 테두리) + 김
    g.rect(4, 5, 7, 6, 0x6aa8d0);
    g.hline(4, 10, 5, 0xe8f0f4);
    g.rect(5, 6, 5, 1, 0x5a3a20); // 커피
    g.vline(11, 6, 9, 0x4a88b0);
    g.set(12, 7, 0x4a88b0);
    g.set(12, 8, 0x4a88b0);
    g.vline(4, 6, 10, 0x8ac4e8);
    for (const [x, y] of [[6, 3], [7, 2], [8, 3], [9, 1]] as const) g.set(x, y, 0xe8e8e8);
  }
  g.outline(OUT);
  return g;
}
