// 11/21 시안 4차 그림: 고급 펜션(집 + 높인 나무 테라스 + 앉는 가구들) · 대형 트램펄린(8인) · 직사각 저수지 낚시터(석축·넓은 잔교·2인 좌대·사다리).
// 캠핑장 그림 규칙 그대로 (윤곽 0x2c2018, 왼쪽 위 빛, 바닥 그림자, 원점 = 바닥 가운데). 시안 전용.

import { darken, Grid, hash2, lighten, rng, type Color } from "../../sprites/pixel";
import { SNOW } from "../../sprites/winterArt";
import { ROOFS } from "./mockArt3";

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

// ════════════════════════ 고급 펜션 ════════════════════════

export type HouseArt = { grid: Grid; roof: Uint8Array; windows: { x: number; y: number }[]; chimney: { x: number; y: number }; door: { x: number; y: number }; board: { x: number; y: number } };
/** 펜션 집채 크기 (원점 = 벽 아래 가운데, 테라스가 그 앞에 붙는다) */
export const HOUSE_SIZE = { small: { w: 74, h: 64 }, wide: { w: 102, h: 70 } } as const;

/**
 * 펜션 집채: 앞으로 기운 너와 지붕(용마루·처마 그늘) + 지붕창(dormer) 또는 천창(skylight) + 돌 굴뚝 · 통나무 벽 + 돌 기초 ·
 * 창마다 꽃 화분 상자 · 문(작은 창) + 문 위 이름판 · 처마 끝 장식. lit = 분양된 집(따뜻한 창), xmas = 리스·처마 전구
 */
export function houseArt(size: "small" | "wide", roofI: number, lit: boolean, xmas: boolean, variant: number): HouseArt {
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
  } else {
    for (const sx of [wx0 + 10, wx1 - 24]) {
      g.rect(sx, ridge + 5, 10, 7, 0x3a5468);
      g.hline(sx, sx + 9, ridge + 5, 0x9cc4d8);
      frame(g, sx - 1, ridge + 4, 12, 9, R.lo);
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
  const roof = mask(g, (_x, y) => y < eave - 1 && y >= ridge - 2);
  g.outline(OUT);
  return { grid: g, roof, windows, chimney: { x: cx + 4, y: ridge - 12 }, door: { x: doorX + 6, y: wallB }, board: { x: doorX + 6, y: eave + 2 } };
}

/** 높인 나무 테라스 (판자 바닥 + 앞 치마판 + 가운데 계단 + 난간 · 모서리 기둥). 원점 = 앞 가장자리 가운데 */
export const TERRACE = { small: { w: 80, d: 30 }, wide: { w: 104, d: 34 } } as const;
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
  // 가운데 계단
  const sx = Math.round(W / 2 - 9);
  for (let k = 0; k < 3; k++) {
    g.rect(sx, front + k * 3, 18, 3, k % 2 ? DECK.mid : DECK.hi);
    g.hline(sx, sx + 17, front + k * 3 + 2, DECK.line);
  }
  // 난간 (앞, 계단 자리만 열림) + 기둥
  const rail = front - 6;
  for (const [x0, x1] of [
    [1, sx - 2],
    [sx + 19, W - 2],
  ]) {
    g.hline(x0, x1, rail, WOOD.hi);
    g.hline(x0, x1, rail + 1, WOOD.mid);
    for (let x = x0; x <= x1; x += 4) g.vline(x, rail + 2, front - 1, WOOD.lo);
  }
  for (const x of [1, sx - 2, sx + 19, W - 3]) g.rect(x, rail - 2, 2, 9, WOOD.lo);
  // 옆 난간 (위에서 보면 가는 줄)
  g.vline(1, top, rail, WOOD.lo);
  g.vline(W - 2, top, rail, WOOD.lo);
  g.outline(OUT);
  for (let x = 2; x < W - 2; x++) if (!g.filled(x, H - 2)) g.set(x, H - 2, 0x1a1006, 60);
  return g;
}

/** 데크 소파 (쿠션 둘·셋, 등받이) */
export function deckSofaArt(seats: 2 | 3, color: number): Grid {
  const W = seats === 2 ? 26 : 36;
  const g = new Grid(W, 16);
  const C = [0xd8786a, 0x7ec4b0, 0xe8c070, 0x8aa8d8][color % 4];
  g.rect(1, 1, W - 2, 6, WOOD.mid);
  g.hline(1, W - 2, 1, WOOD.hi);
  g.rect(1, 6, W - 2, 6, WOOD.lo);
  for (let i = 0; i < seats; i++) {
    const x = 3 + i * Math.floor((W - 6) / seats);
    g.rect(x, 3, Math.floor((W - 6) / seats) - 1, 4, lighten(C, 0.15));
    g.rect(x, 7, Math.floor((W - 6) / seats) - 1, 4, C);
    g.hline(x, x + Math.floor((W - 6) / seats) - 2, 7, lighten(C, 0.3));
  }
  g.rect(0, 4, 2, 8, WOOD.lo);
  g.rect(W - 2, 4, 2, 8, WOOD.lo);
  g.outline(OUT);
  for (let x = 2; x < W - 2; x++) g.set(x, 15, 0x1a1006, 56);
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
  return g;
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
  return g;
}
/** 달걀 그네 의자 (둥근 등나무 + 받침 기둥) */
export function hangingChairArt(): Grid {
  const g = new Grid(20, 32);
  g.rect(9, 1, 2, 4, 0x6a6a70);
  line(g, 10, 1, 16, 4, 0x6a6a70);
  g.vline(16, 4, 29, 0x6a6a70);
  g.rect(13, 29, 7, 2, 0x5a5a60);
  g.ellipse(9, 16, 7, 10, 0xc89a5a);
  g.ellipse(9, 17, 5, 7, 0x8a6a40);
  g.ellipse(9, 20, 4, 3, 0x9ed6c0);
  for (let y = 7; y < 26; y += 3) g.set(3 + ((y / 3) % 2), y, 0xe0b878);
  g.outline(OUT);
  shadow(g, 10, 30.5, 8, 1.2, 50);
  return g;
}
/** 바 카운터 + 높은 의자 둘 */
export function barCounterArt(): Grid {
  const g = new Grid(30, 24);
  g.rect(2, 4, 26, 4, WOOD.hi);
  g.hline(2, 27, 4, lighten(WOOD.hi, 0.2));
  g.rect(3, 8, 24, 8, WOOD.lo);
  for (let x = 4; x < 27; x += 4) g.vline(x, 8, 15, WOOD.line);
  g.set(8, 3, 0x7ac8ff);
  g.set(9, 3, 0x7ac8ff);
  g.set(20, 3, 0xe8a03a);
  for (const x of [7, 19]) {
    g.ellipse(x + 1, 18, 3, 1.6, 0x4a4a52);
    g.vline(x + 1, 19, 22, 0x6a6a70);
    g.hline(x - 1, x + 3, 22, 0x6a6a70);
  }
  g.outline(OUT);
  shadow(g, 15, 22.5, 12, 1.2, 50);
  return g;
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
  return g;
}
/** 화단 상자 (길가 — 나무 상자에 꽃·관목) */
export function planterArt(len: number): Grid {
  const g = new Grid(len, 14);
  g.rect(0, 7, len, 6, WOOD.lo);
  g.hline(0, len - 1, 7, WOOD.hi);
  for (let x = 1; x < len - 1; x++) {
    const h = 2 + Math.round(hash2(x, 0, 9) * 3);
    for (let y = 7 - h; y < 7; y++) g.set(x, y, hash2(x, y, 11) < 0.25 ? FLOWERS[x % FLOWERS.length] : x % 3 ? 0x4f8a3a : 0x3a6a3a);
  }
  g.outline(OUT);
  return g;
}

// ════════════════════════ 대형 트램펄린 (8인) ════════════════════════

/** 지름 6칸(96px) 원형 매트 + 파랑 패드 테 + 안전망 기둥(앞쪽 들어가는 틈 + 작은 사다리) · 망 */
export function bigTrampolineArt(): { back: Grid; front: Grid; w: number; h: number } {
  const rx = 48;
  const ry = 28;
  const W = rx * 2 + 10;
  const H = ry * 2 + 40;
  const back = new Grid(W, H);
  const front = new Grid(W, H);
  const cx = W / 2;
  const cy = H - ry - 10;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      const pad = d > 0.8;
      back.set(x, y, pad ? (y < cy ? 0x5ab4e8 : 0x2a7ab8) : d > 0.74 ? 0x16181e : (x + y) % 7 === 0 ? 0x2e3038 : 0x24262c);
    }
  // 매트 가운데 무늬
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    back.set(Math.round(cx + Math.cos(ang) * rx * 0.45), Math.round(cy + Math.sin(ang) * ry * 0.45), 0x3a3c46);
  }
  // 기둥 열 (뒤 반은 back, 앞 반은 front — 사람이 사이에 보이게), 앞 가운데는 들어가는 틈
  const gapA = Math.PI / 2 - 0.22;
  const gapB = Math.PI / 2 + 0.22;
  const posts: { x: number; y: number; front: boolean }[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    if (a > gapA && a < gapB) continue;
    posts.push({ x: Math.round(cx + Math.cos(a) * (rx - 1)), y: Math.round(cy + Math.sin(a) * (ry - 1)), front: Math.sin(a) > 0 });
  }
  for (const p of posts) {
    const g = p.front ? front : back;
    g.rect(p.x, p.y - 30, 2, 30, 0xa8b0b8);
    g.set(p.x, p.y - 31, 0xe85a4a);
    g.set(p.x + 1, p.y - 31, 0xe85a4a);
  }
  // 위 망 테 (뒤 반 · 앞 반)
  for (let x = 2; x < W - 2; x++) {
    const t = (x - cx) / (rx - 1);
    if (Math.abs(t) > 1) continue;
    const s = Math.sqrt(1 - t * t) * (ry - 1);
    back.set(x, Math.round(cy - s - 30), 0xdfe6ee);
    const fy = Math.round(cy + s - 30);
    const ang = Math.atan2(s, x - cx);
    if (!(ang > gapA && ang < gapB)) {
      front.set(x, fy, 0xdfe6ee);
      // 앞 망 (성긴 그물 — 아주 옅게)
      for (let y = fy + 3; y < cy + s - 2; y += 4) if ((x + y) % 4 === 0) front.set(x, y, 0xe8eef4, 90);
    }
  }
  // 들어가는 틈 앞 작은 사다리
  const lx = Math.round(cx - 6);
  const ly = Math.round(cy + ry - 2);
  front.rect(lx, ly, 1, 10, 0x8a9096);
  front.rect(lx + 11, ly, 1, 10, 0x8a9096);
  for (let y = ly + 2; y < ly + 10; y += 3) front.hline(lx, lx + 11, y, 0xc8ccd0);
  back.outline(OUT, false, 220);
  front.outline(OUT, false, 140);
  shadow(back, cx, cy + ry + 3, rx + 2, 4, 56);
  return { back, front, w: W, h: H };
}

// ════════════════════════ 저수지 낚시터 ════════════════════════

/** 2인 좌대: 네모 평상(드럼에 뜬) + 뒤 작은 지붕 오두막 + 앞 낚시 의자 둘·낚싯대 둘 + 옆 물 사다리(수영해서 올라오는 곳) */
export function raft2Art(roofI: number, xmas: boolean, ladder: "left" | "right" | "front"): { grid: Grid; roof: Uint8Array } {
  const W = 50;
  const H = 46;
  const g = new Grid(W, H);
  const R = ROOFS[roofI % ROOFS.length];
  // 평상 바닥
  for (let y = 16; y < 38; y++)
    for (let x = 3; x < 47; x++) {
      const k = (x - 3) % 4;
      g.set(x, y, y === 16 ? DECK.hi : k === 3 ? DECK.line : DECK.mid);
    }
  g.rect(3, 38, 44, 3, 0x3a6a8a);
  for (const x of [4, 20, 36]) g.rect(x, 38, 8, 4, 0x2a5a8a);
  // 오두막 (뒤 가운데)
  g.rect(12, 9, 24, 11, LOG.mid);
  for (let y = 9; y < 20; y += 3) g.hline(12, 35, y, LOG.hi);
  g.rect(17, 12, 6, 5, WIN.warm);
  g.set(19, 13, 0xfff4d0);
  g.rect(27, 12, 6, 8, LOG.lo);
  for (let y = 2; y < 10; y++) {
    const inset = Math.max(0, 6 - y);
    for (let x = 9 + inset; x < 39 - inset; x++) g.set(x, y, y === 9 ? R.lo : (x + y) % 5 === 0 ? R.lo : y < 5 ? R.hi : R.mid);
  }
  if (xmas) for (let x = 10; x < 38; x += 3) g.set(x, 10, XMAS[(x / 3) % 5 | 0]);
  // 앞 낚시 의자 둘 + 낚싯대 둘 (물 쪽으로 뻗음) + 받침
  for (const [x, c] of [
    [8, 0x4f9a88],
    [34, 0xd8786a],
  ] as const) {
    g.rect(x, 26, 7, 5, c);
    g.rect(x, 23, 7, 3, darken(c, 0.25));
    g.vline(x + 1, 31, 33, 0x5a5a60);
    g.vline(x + 5, 31, 33, 0x5a5a60);
    line(g, x + 6, 33, x + 12, 44, 0x4a321e);
    g.set(x + 12, 45, 0xe8e0d0);
  }
  g.rect(22, 30, 6, 4, 0x6a8aa0); // 미끼통
  // 물 사다리
  const lxs = ladder === "left" ? 0 : ladder === "right" ? 46 : 22;
  if (ladder === "front") {
    g.rect(lxs, 38, 1, 8, 0xc8ccd0);
    g.rect(lxs + 6, 38, 1, 8, 0xc8ccd0);
    for (let y = 40; y < 46; y += 2) g.hline(lxs, lxs + 6, y, 0xe8ecf0);
  } else {
    g.rect(lxs, 20, 4, 1, 0xc8ccd0);
    g.rect(lxs, 34, 4, 1, 0xc8ccd0);
    for (let y = 22; y < 34; y += 3) g.hline(lxs, lxs + 3, y, 0xe8ecf0);
  }
  const roof = mask(g, (_x, y) => y < 10);
  g.outline(OUT);
  return { grid: g, roof };
}
/** 넓은 나무 잔교 (가로, 폭 32 = 2칸) */
export function widePierArt(len: number): Grid {
  const W = len;
  const H = 40;
  const g = new Grid(W, H);
  for (let x = 0; x < W; x++)
    for (let y = 2; y < 32; y++) {
      const k = x % 5;
      g.set(x, y, k === 4 ? DECK.line : y === 2 ? DECK.hi : k === 0 ? DECK.hi : DECK.mid);
    }
  g.rect(0, 32, W, 3, DECK.lo);
  for (let x = 4; x < W; x += 20) {
    g.rect(x, 32, 4, 7, LOG.lo);
    g.set(x + 1, 38, 0x1a3442);
  }
  // 양옆 낮은 턱 (판자 끝)
  g.hline(0, W - 1, 2, WOOD.lo);
  g.hline(0, W - 1, 31, WOOD.lo);
  g.outline(OUT);
  return g;
}
/** 석축 둑 낚시 자리 받침 (작은 접이 의자 + 낚싯대 받침 · 물쪽 방향 dir) */
export function bankSeatArt(): Grid {
  const g = new Grid(14, 14);
  g.rect(3, 5, 7, 4, 0xe8c070);
  g.rect(3, 2, 7, 3, 0xd8786a);
  g.hline(3, 9, 5, 0xfff0c8);
  g.vline(4, 9, 11, 0x5a5a60);
  g.vline(8, 9, 11, 0x5a5a60);
  line(g, 10, 11, 13, 1, 0x4a321e);
  g.outline(OUT);
  return g;
}
/** 「수영해서 갈 수 있어요」 작은 팻말 (물결 그림 + 사람 머리) */
export function swimSignArt(): Grid {
  const g = new Grid(22, 22);
  g.rect(10, 12, 2, 9, WOOD.lo);
  g.rect(1, 2, 20, 11, 0xe8f2f8);
  frame(g, 1, 2, 20, 11, WOOD.line);
  for (let x = 3; x < 19; x++) g.set(x, 9 + Math.round(Math.sin(x * 0.9)), 0x3a86b8);
  g.ellipse(10, 6, 2, 2, 0xe8b894);
  g.hline(13, 16, 6, 0x3a86b8);
  g.outline(OUT);
  for (let x = 6; x < 16; x++) g.set(x, 21, 0x1a1006, 50);
  return g;
}

/** 석축 (저수지 둘레 돌 벽 — 위는 판판한 갓돌, 물 쪽 면은 돌 줄) — 바닥에서 쓰는 색 계산 */
export function embankColor(x: number, y: number, along: number, depth: number, snowy: boolean): Color {
  // depth: 둑 안쪽(물)에서 0 → 바깥(길)으로 1. along: 둑을 따라 거리
  if (depth > 0.62) {
    // 갓돌 (판판한 윗면)
    const c: Color = Math.floor(along / 12) % 2 ? STONE.hi : lighten(STONE.hi, 0.06);
    if (snowy) return hash2(x, y, 601) < 0.7 ? SNOW.hi : SNOW.mid;
    return (along | 0) % 12 === 0 ? STONE.line : c;
  }
  // 물 쪽 돌 면 (엇갈린 돌 줄)
  const row = Math.floor(depth * 4);
  const off = row % 2 ? 6 : 0;
  if ((((along + off) | 0) % 12) === 0 || depth * 4 - row < 0.18) return STONE.line;
  return depth < 0.2 ? darken(STONE.lo, 0.2) : row % 2 ? STONE.mid : STONE.lo;
}

export const rngLocal = rng;
