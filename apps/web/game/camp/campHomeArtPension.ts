// 11/26 캠핑장 집 겉모습 그림 ② 소슬 펜션: 통나무 집채·높인 테라스·파라솔 탁자·그네 의자·화분·우편함 (6차 시안 mockArt4에서 옮김)

import { darken, Grid, hash2, lighten, type Color } from "../sprites/pixel";
import { padArt, padGrid } from "./campArtPad";
import { ROOFS } from "./campHomeArtMisc";

const OUT = 0x2c2018;

const WOOD = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e } as const;

const DECK = { hi: 0xdcb888, mid: 0xc49a64, lo: 0x9a7448, line: 0x6a4a2c } as const;

const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228, ring: 0xe0c08a } as const;

const STONE = { hi: 0xc4beb0, mid: 0xa49e92, lo: 0x7e7972, line: 0x5a5650 } as const;

const WIN = { warm: 0xffd890, warm2: 0xffc070, curtain: 0xd8786a, dark: 0x3a4656, glass: 0x6a8aa0 } as const;

const XMAS = [0xff6a5a, 0xffd25a, 0x7ae08a, 0x7ac8ff, 0xfff2d8] as const;

const FLOWERS = [0xe85a6a, 0xf2c444, 0xf6f0f0, 0xa87ad8, 0xff9a4a] as const;

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, a);
    }
}

function frame(g: Grid, x: number, y: number, w: number, h: number, c: Color): void {
  g.hline(x, x + w - 1, y, c);
  g.hline(x, x + w - 1, y + h - 1, c);
  g.vline(x, y, y + h - 1, c);
  g.vline(x + w - 1, y, y + h - 1, c);
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c);
}

const mask = (g: Grid, test: (x: number, y: number) => boolean) => {
  const m = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.filled(x, y) && test(x, y)) m[y * g.w + x] = 1;
  return m;
};

export type HouseArt = { grid: Grid; roof: Uint8Array; windows: { x: number; y: number }[]; chimney: { x: number; y: number }; door: { x: number; y: number }; board: { x: number; y: number } };

/** 펜션 집채 크기 (원점 = 벽 아래 가운데, 테라스가 그 앞에 붙는다) */
export const HOUSE_SIZE = { small: { w: 74, h: 64 }, wide: { w: 102, h: 70 } } as const;

/**
 * 펜션 집채: 앞으로 기운 너와 지붕(용마루·처마 그늘) + 지붕창(dormer) 또는 천창(skylight) + 돌 굴뚝 · 통나무 벽 + 돌 기초 ·
 * 창마다 꽃 화분 상자 · 문(작은 창) + 문 위 이름판 · 처마 끝 장식. lit = 분양된 집(따뜻한 창), xmas = 리스·처마 전구
 */
export function houseArt(size: "small" | "wide", roofI: number, lit: boolean, xmas: boolean, variant: number, big = false): HouseArt {
  const { w: W, h: H } = HOUSE_SIZE[size];
  const g = new Grid(W, H);
  const R = ROOFS[roofI % ROOFS.length];
  const wx0 = 6;
  const wx1 = W - 7;
  const ridge = 9;
  const eave = size === "small" ? 33 : 36;
  const wallB = H - 4;
  // 지붕
  for (let y = ridge; y < eave; y++) {
    const t = (y - ridge) / (eave - ridge);
    const inset = Math.round((1 - t) * 5);
    for (let x = wx0 - 4 + inset; x <= wx1 + 4 - inset; x++) {
      const row = Math.floor((y - ridge) / 4);
      const k = (y - ridge) % 4;
      let c: Color = k === 3 ? R.lo : k === 0 ? R.hi : R.mid;
      if (k !== 3 && (x + row * 3) % 6 === 0) c = R.lo;
      if (hash2(x, y, 3) < 0.05) c = darken(c, 0.08);
      g.set(x, y, c);
    }
  }
  g.hline(wx0, wx1, ridge, darken(R.lo, 0.15));
  g.hline(wx0, wx1, ridge - 1, darken(R.lo, 0.35));
  g.hline(wx0 - 4, wx1 + 4, eave - 1, darken(R.lo, 0.2));
  // 처마 장식 (물결 모양 판 끝)
  for (let x = wx0 - 4; x <= wx1 + 4; x += 3) g.set(x, eave, WOOD.hi);
  // 지붕창(dormer) 또는 천창
  if (variant % 2 === 0) {
    const dx = Math.round(W / 2 - 9);
    for (let y = ridge + 3; y < ridge + 15; y++) for (let x = dx; x < dx + 18; x++) g.set(x, y, y < ridge + 6 ? R.hi : LOG.mid);
    for (let y = ridge - 1; y < ridge + 5; y++) g.hline(dx + 9 - (y - ridge + 2) * 2, dx + 9 + (y - ridge + 2) * 2, y, y === ridge + 4 ? R.lo : R.mid);
    g.rect(dx + 5, ridge + 7, 8, 6, lit ? WIN.warm : WIN.dark);
    g.vline(dx + 9, ridge + 7, ridge + 12, WOOD.line);
  } else if (!big) {
    for (const sx of [wx0 + 10, wx1 - 24]) {
      g.rect(sx, ridge + 5, 10, 7, 0x3a5468);
      g.hline(sx, sx + 9, ridge + 5, 0x9cc4d8);
      frame(g, sx - 1, ridge + 4, 12, 9, R.lo);
    }
  }
  // 11/26 넓힌 집(big): 지붕 양쪽에 2층 방 지붕창 둘 (불 켜진 창 — 넓힌 실내 14×10)
  const upper: { x: number; y: number }[] = [];
  if (big) {
    // 지붕창 시안(짝수)은 가운데 지붕창·굴뚝 사이에, 천창 시안(홀수)은 천창 자리에
    const at = variant % 2 === 0 ? [wx0 + 14, Math.round((W / 2 + 9 + wx1 - 12) / 2)] : [wx0 + 15, wx1 - 19];
    for (const dcx of at) {
      const dx = dcx - 6;
      for (let y = ridge + 4; y < ridge + 14; y++) for (let x = dx; x < dx + 12; x++) g.set(x, y, y < ridge + 6 ? R.hi : LOG.mid);
      for (let y = ridge + 1; y < ridge + 5; y++) g.hline(dcx - (y - ridge + 2), dcx + (y - ridge + 1), y, y === ridge + 4 ? R.lo : R.mid);
      g.rect(dx + 3, ridge + 7, 6, 5, lit ? WIN.warm : WIN.dark);
      g.vline(dcx, ridge + 7, ridge + 11, WOOD.line);
      g.hline(dx + 2, dx + 9, ridge + 12, WOOD.hi);
      upper.push({ x: dcx, y: ridge + 9 });
    }
  }
  // 굴뚝
  const cx = variant % 2 === 0 ? wx1 - 12 : Math.round(W / 2 - 3);
  for (let y = ridge - 10; y < ridge + 6; y++) for (let x = cx; x < cx + 8; x++) g.set(x, y, (x + (y >> 1)) % 3 === 0 ? STONE.lo : y % 3 === 0 ? STONE.hi : STONE.mid);
  g.rect(cx - 1, ridge - 12, 10, 2, 0x5a5650);
  // 벽 (통나무) + 모서리 통나무 끝 + 돌 기초
  for (let y = eave + 1; y < wallB; y++)
    for (let x = wx0; x <= wx1; x++) {
      const k = (y - eave - 1) % 4;
      g.set(x, y, k === 0 ? LOG.hi : k === 3 ? LOG.lo : LOG.mid);
    }
  for (let y = eave + 2; y < wallB; y += 4) {
    g.rect(wx0 - 1, y, 2, 2, LOG.ring);
    g.rect(wx1, y, 2, 2, LOG.ring);
  }
  for (let x = wx0; x <= wx1; x++) for (let y = wallB; y < wallB + 3; y++) g.set(x, y, (x + y * 3) % 7 === 0 ? STONE.line : y === wallB ? STONE.hi : STONE.mid);
  // 창 + 꽃 화분 상자
  const windows: { x: number; y: number }[] = [];
  const wy = eave + 5;
  const doorX = size === "small" ? W - 28 : Math.round(W / 2 - 5);
  const winXs = size === "small" ? [wx0 + 6, wx0 + 21] : [wx0 + 6, wx0 + 20, doorX + 20, doorX + 34];
  for (const x of winXs) {
    frame(g, x - 1, wy - 1, 12, 10, WOOD.line);
    if (lit) {
      g.rect(x, wy, 10, 8, WIN.warm);
      g.rect(x, wy, 2, 8, WIN.curtain);
      g.rect(x + 8, wy, 2, 8, WIN.curtain);
      g.set(x + 4, wy + 1, 0xfff4d0);
    } else g.rect(x, wy, 10, 8, WIN.dark);
    g.vline(x + 5, wy, wy + 7, WOOD.line);
    // 화분 상자 (꽃 — 장면이 겨울엔 눈을 얹는다)
    g.rect(x - 1, wy + 9, 12, 3, WOOD.lo);
    g.hline(x - 1, x + 10, wy + 9, WOOD.hi);
    for (let k = 0; k < 5; k++) {
      g.set(x + k * 2, wy + 8, 0x4f8a3a);
      g.set(x + k * 2 + 1, wy + 7, FLOWERS[(k + x) % FLOWERS.length]);
    }
    windows.push({ x: x + 5, y: wy + 4 });
  }
  // 문
  g.rect(doorX, eave + 4, 12, wallB - eave - 4, WOOD.lo);
  g.rect(doorX + 1, eave + 5, 10, wallB - eave - 5, WOOD.mid);
  g.rect(doorX + 3, eave + 7, 6, 4, lit ? WIN.warm2 : WIN.dark);
  g.set(doorX + 9, eave + 14, 0xe8d8a0);
  if (xmas) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      g.set(Math.round(doorX + 6 + Math.cos(ang) * 3), Math.round(eave + 12 + Math.sin(ang) * 3), a % 4 === 0 ? 0xe8323a : 0x2b5a36);
    }
    for (let x = wx0 - 4; x <= wx1 + 4; x++) {
      const y = eave + Math.round(Math.sin((((x - wx0) % 14) / 14) * Math.PI) * 2);
      g.set(x, y, (x & 1) === 0 ? 0x2b5a36 : 0x3e7a48);
      if ((x - wx0) % 7 === 3) g.set(x, y + 1, XMAS[((x - wx0) / 7) % 5 | 0]);
    }
  }
  // 넓힌 집 지붕창은 눈에 덮이지 않게 (지붕창 작은 지붕만 눈)
  const inUpper = (x: number, y: number) => upper.some((u) => Math.abs(x - u.x) <= 6 && y >= ridge + 4 && y < ridge + 14);
  const roof = mask(g, (x, y) => y < eave - 1 && y >= ridge - 2 && !inUpper(x, y));
  g.outline(OUT);
  // 11/26 굴뚝 꼭대기가 캔버스 윗줄에 닿아 잘렸다 — 위 3칸(굴뚝 위 눈)·좌우 2칸 빈 칸 (바닥 가운데 원점이라 자리는 그대로)
  return padArt({ grid: g, roof, windows: [...windows, ...upper], chimney: { x: cx + 4, y: ridge - 12 }, door: { x: doorX + 6, y: wallB }, board: { x: doorX + 6, y: eave + 2 } }, { top: 3 });
}

/** 높인 나무 테라스 (판자 바닥 + 앞 치마판 + 가운데 계단 + 난간 · 모서리 기둥). 원점 = 앞 가장자리 가운데 */
export const TERRACE = { small: { w: 80, d: 30 }, wide: { w: 104, d: 34 } } as const;
/** 11/26 테라스 가운데 계단 폭 (난간 열린 칸 — 문 앞 곧은 길 28px보다 넓게) */
export const TERRACE_STAIR_W = 32;

export function terraceArt(size: "small" | "wide"): Grid {
  const { w: W, d: D } = TERRACE[size];
  const H = D + 10;
  const g = new Grid(W, H);
  const skirt = 6;
  const top = 2;
  const front = top + D - skirt;
  for (let y = top; y < front; y++)
    for (let x = 1; x < W - 1; x++) {
      const k = (y - top) % 5;
      g.set(x, y, k === 4 ? DECK.line : k === 0 ? DECK.hi : hash2(x, y, 5) < 0.05 ? DECK.lo : DECK.mid);
    }
  // 앞 치마판 (세로 판자) + 그림자
  for (let y = front; y < front + skirt; y++) for (let x = 1; x < W - 1; x++) g.set(x, y, (x % 4 === 0 ? DECK.line : y === front ? DECK.hi : DECK.lo));
  // 가운데 계단. 11/26 폭 18 → 32 (문 앞 곧은 길 28px — 두 사람이 나란히 오르내린다)
  const SW = TERRACE_STAIR_W;
  const sx = Math.round(W / 2 - SW / 2);
  for (let k = 0; k < 3; k++) {
    g.rect(sx, front + k * 3, SW, 3, k % 2 ? DECK.mid : DECK.hi);
    g.hline(sx, sx + SW - 1, front + k * 3 + 2, DECK.line);
  }
  // 난간 (앞, 계단 자리만 열림) + 기둥
  const rail = front - 6;
  for (const [x0, x1] of [
    [1, sx - 2],
    [sx + SW + 1, W - 2],
  ]) {
    g.hline(x0, x1, rail, WOOD.hi);
    g.hline(x0, x1, rail + 1, WOOD.mid);
    for (let x = x0; x <= x1; x += 4) g.vline(x, rail + 2, front - 1, WOOD.lo);
  }
  for (const x of [1, sx - 2, sx + SW + 1, W - 3]) g.rect(x, rail - 2, 2, 9, WOOD.lo);
  // 옆 난간 (위에서 보면 가는 줄)
  g.vline(1, top, rail, WOOD.lo);
  g.vline(W - 2, top, rail, WOOD.lo);
  g.outline(OUT);
  for (let x = 2; x < W - 2; x++) if (!g.filled(x, H - 2)) g.set(x, H - 2, 0x1a1006, 60);
  return g;
}

/** 둥근 탁자 + 의자 둘 + 파라솔 (파라솔은 탁자 위로) */
export function tableSetArt(color: number, parasol: boolean): Grid {
  const W = 34;
  const H = parasol ? 42 : 20;
  const g = new Grid(W, H);
  const by = H - 4;
  // 의자 둘 (양옆, 등받이)
  for (const x of [3, W - 9]) {
    g.rect(x, by - 8, 6, 4, WOOD.hi);
    g.rect(x, by - 4, 6, 3, WOOD.mid);
    g.vline(x, by - 1, by + 1, WOOD.lo);
    g.vline(x + 5, by - 1, by + 1, WOOD.lo);
  }
  // 탁자
  g.ellipse(W / 2, by - 5, 7, 3, WOOD.hi);
  g.vline(W / 2, by - 3, by + 1, WOOD.lo);
  g.set(W / 2 - 2, by - 6, 0xf2f2ec);
  g.set(W / 2 + 2, by - 5, 0xd8a840);
  if (parasol) {
    const C = [0xe85a4a, 0x4f9a88, 0xe8a03a][color % 3];
    g.vline(W / 2, 8, by - 6, 0xe8e4dc);
    for (let y = 2; y < 11; y++) {
      const half = Math.round(((y - 1) / 9) * 15);
      for (let x = W / 2 - half; x <= W / 2 + half; x++) g.set(x, y, Math.floor((x - W / 2 + 16) / 4) % 2 ? 0xfaf2de : C);
    }
    g.hline(W / 2 - 15, W / 2 + 15, 11, darken(C, 0.3));
  }
  g.outline(OUT);
  shadow(g, W / 2, by + 2, 14, 1.5, 56);
  return padGrid(g);
}

/** 흔들 그네 벤치 (A자 틀 + 매단 의자) */
export function swingBenchArt(): Grid {
  const g = new Grid(30, 30);
  line(g, 2, 28, 6, 2, LOG.mid);
  line(g, 10, 28, 6, 2, LOG.mid);
  line(g, 20, 28, 24, 2, LOG.mid);
  line(g, 28, 28, 24, 2, LOG.mid);
  g.rect(5, 1, 21, 2, LOG.lo);
  g.vline(9, 3, 16, 0x8a8478);
  g.vline(21, 3, 16, 0x8a8478);
  g.rect(8, 12, 15, 4, 0xe8c070);
  g.rect(8, 16, 15, 3, WOOD.mid);
  g.hline(8, 22, 12, 0xfff0c8);
  g.outline(OUT);
  shadow(g, 15, 28.5, 12, 1.2, 50);
  return padGrid(g);
}

/** 화분 (토분 + 둥근 관목 / 꽃) */
export function potArt(v: number): Grid {
  const g = new Grid(12, 16);
  g.rect(3, 10, 6, 5, 0xc8704a);
  g.hline(2, 9, 10, 0xe08a5a);
  const leaf = v % 2 ? 0x4f8a3a : 0x3a6a3a;
  g.ellipse(6, 6, 4.5, 4.5, leaf);
  g.ellipse(5, 5, 2.5, 2.5, lighten(leaf, 0.2));
  if (v % 3 === 0) for (const [x, y] of [[4, 4], [8, 6], [6, 3]] as const) g.set(x, y, FLOWERS[(v + x) % FLOWERS.length]);
  g.outline(OUT);
  for (let x = 3; x < 10; x++) g.set(x, 15, 0x1a1006, 50);
  return g;
}

/** 대문 기둥 우체통 + 이름 말뚝 */
export function mailboxArt(): Grid {
  const g = new Grid(14, 22);
  g.rect(6, 8, 2, 13, WOOD.lo);
  g.rect(2, 3, 10, 6, 0xd84a3a);
  g.hline(2, 11, 3, 0xf27a6a);
  g.rect(3, 4, 1, 4, 0xa83a2e);
  g.rect(11, 1, 1, 4, 0xf2c444);
  g.outline(OUT);
  for (let x = 3; x < 11; x++) g.set(x, 21, 0x1a1006, 50);
  return padGrid(g);
}
