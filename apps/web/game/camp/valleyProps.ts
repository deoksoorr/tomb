// 11/26 캠핑장 소품 그림 (6차 시안에서 옮김): 펜션 · 입구 아치 · 워터 슬라이드 / 눈썰매장 · 트램펄린 · 평상 ·
// 낚시터(잔교·좌대·나룻배·관리 부스·얼음낚시 구멍) · 캠프파이어 존(해먹·간식 수레·장작더미).
// 캠핑장 그림 규칙 그대로 (윤곽 0x2c2018, 왼쪽 위 빛, 바닥 그림자, 원점 = 바닥 가운데).

import { darken, Grid, hash2, lighten, mix, rng, type Color } from "../sprites/pixel";
import { SNOW } from "../sprites/winterArt";

const OUT = 0x2c2018;
const WOOD = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e } as const;
const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228, ring: 0xe0c08a } as const;
const STONE = { hi: 0xbcb6a8, mid: 0x9c968a, lo: 0x76716a } as const;
const WIN = { warm: 0xffd890, warm2: 0xffc070, glass: 0x5a7a90, glassHi: 0x9cc4d8, curtain: 0xd8786a, dark: 0x3a4656 } as const;
const XMAS = [0xff6a5a, 0xffd25a, 0x7ae08a, 0x7ac8ff, 0xfff2d8] as const;

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

// ════════════════════════ 펜션 ════════════════════════

export const ROOFS: readonly { hi: Color; mid: Color; lo: Color }[] = [
  { hi: 0xd8784e, mid: 0xb85a3c, lo: 0x8e4430 }, // 붉은 흙빛
  { hi: 0x6f9a74, mid: 0x4f7a5a, lo: 0x385c44 }, // 솔빛
  { hi: 0x5e7a9a, mid: 0x3e5a7a, lo: 0x2c425c }, // 남빛
  { hi: 0xe6b858, mid: 0xc89a3a, lo: 0x9a742a }, // 겨자
  { hi: 0xaa6a7a, mid: 0x8a4a5a, lo: 0x663444 }, // 자두
  { hi: 0x8a8e98, mid: 0x6a6e78, lo: 0x4e525c }, // 슬레이트
];
export type PensionArt = { grid: Grid; roof: Uint8Array; windows: { x: number; y: number }[]; chimney: { x: number; y: number }; door: { x: number; y: number }; board: { x: number; y: number } };

/**
 * 시골 펜션 (3/4 시점): 앞으로 기운 지붕(너와 줄 + 용마루, 오른쪽 돌 굴뚝) · 통나무 벽(모서리 나무 끝 동그라미) ·
 * 창 둘(불 켜진 집은 따뜻한 빛·커튼, 빈 집은 덧문) · 문 위 이름판 · 앞 데크(난간·계단).
 * lit = 분양된 집 (불빛), xmas = 크리스마스 (문 리스·처마 호랑가시 줄·전구)
 */
export function pensionArt(size: "small" | "wide", roofI: number, lit: boolean, xmas: boolean): PensionArt {
  const W = size === "small" ? 66 : 90;
  const H = size === "small" ? 62 : 68;
  const g = new Grid(W, H);
  const R = ROOFS[roofI % ROOFS.length];
  const wx0 = 6;
  const wx1 = W - 7;
  const eave = size === "small" ? 30 : 33;
  const ridge = 7;
  const wallB = eave + (size === "small" ? 16 : 17);
  const deckB = wallB + 9;
  // 지붕 (처마는 벽보다 3px 넓게, 위로 갈수록 살짝 좁게)
  for (let y = ridge; y < eave; y++) {
    const t = (y - ridge) / (eave - ridge);
    const inset = Math.round((1 - t) * 4);
    for (let x = wx0 - 3 + inset; x <= wx1 + 3 - inset; x++) {
      const row = Math.floor((y - ridge) / 4);
      const k = (y - ridge) % 4;
      let c: Color = k === 3 ? R.lo : k === 0 ? R.hi : R.mid;
      if (k !== 3 && (x + row * 3) % 7 === 0) c = R.lo; // 너와 이음
      if (hash2(x, y, 3) < 0.05) c = darken(c, 0.08);
      g.set(x, y, c);
    }
  }
  // 용마루
  g.hline(wx0 + 1, wx1 - 1, ridge, R.lo);
  g.hline(wx0 + 1, wx1 - 1, ridge - 1, darken(R.lo, 0.2));
  // 처마 끝 그늘
  g.hline(wx0 - 3, wx1 + 3, eave - 1, darken(R.lo, 0.15));
  // 굴뚝 (오른쪽, 돌)
  const cx = wx1 - 12;
  for (let y = ridge - 8; y < ridge + 8; y++)
    for (let x = cx; x < cx + 7; x++) g.set(x, y, (x + (y >> 1)) % 3 === 0 ? STONE.lo : y % 3 === 0 ? STONE.hi : STONE.mid);
  g.hline(cx - 1, cx + 7, ridge - 9, 0x5a5650);
  // 벽 (통나무 가로 줄, 모서리 나무 끝)
  for (let y = eave; y < wallB; y++)
    for (let x = wx0; x <= wx1; x++) {
      const k = (y - eave) % 4;
      g.set(x, y, k === 0 ? LOG.hi : k === 3 ? LOG.lo : LOG.mid);
    }
  for (let y = eave + 1; y < wallB; y += 4) {
    g.set(wx0, y, LOG.ring);
    g.set(wx0, y + 1, LOG.ring);
    g.set(wx1, y, LOG.ring);
    g.set(wx1, y + 1, LOG.ring);
  }
  // 창 (왼쪽 하나 · 넓은 집은 둘), 문 (가운데 오른쪽)
  const windows: { x: number; y: number }[] = [];
  const wy = eave + 4;
  const winXs = size === "small" ? [wx0 + 6] : [wx0 + 6, wx0 + 24];
  for (const x of winXs) {
    frame(g, x - 1, wy - 1, 12, 9, WOOD.line);
    if (lit) {
      g.rect(x, wy, 10, 7, WIN.warm);
      g.rect(x, wy, 3, 7, WIN.curtain);
      g.rect(x + 7, wy, 3, 7, WIN.curtain);
      g.set(x + 4, wy + 1, 0xfff4d0);
    } else {
      // 덧문 닫힌 빈 집
      g.rect(x, wy, 10, 7, WIN.dark);
      g.rect(x - 3, wy - 1, 3, 9, WOOD.lo);
      g.rect(x + 10, wy - 1, 3, 9, WOOD.lo);
    }
    g.hline(x - 1, x + 10, wy + 8, WOOD.hi); // 창턱
    windows.push({ x: x + 5, y: wy + 3 });
  }
  const dx = size === "small" ? W - 26 : W - 30;
  g.rect(dx, eave + 3, 10, wallB - eave - 3, WOOD.lo);
  g.rect(dx + 1, eave + 4, 8, wallB - eave - 4, WOOD.mid);
  g.rect(dx + 3, eave + 6, 4, 3, lit ? WIN.warm2 : WIN.dark);
  g.set(dx + 7, eave + 11, 0xe8d8a0);
  // 이름판 (문 위)
  const board = { x: dx + 5, y: eave + 1 };
  // 데크 (앞, 판자 세로) + 난간 기둥 + 계단
  for (let y = wallB; y < deckB; y++)
    for (let x = wx0 - 2; x <= wx1 + 2; x++) {
      const k = (x - wx0) % 4;
      g.set(x, y, y === wallB ? darken(WOOD.lo, 0.2) : k === 3 ? WOOD.lo : y === wallB + 1 ? WOOD.hi : WOOD.mid);
    }
  g.hline(wx0 - 2, wx1 + 2, deckB - 1, WOOD.line);
  for (const px of [wx0 - 2, wx0 + 12, wx1 - 22, wx1 + 2]) if (px < dx - 2 || px > dx + 11) g.rect(px, wallB - 4, 2, 7, WOOD.lo);
  g.hline(wx0 - 2, dx - 3, wallB - 3, WOOD.hi);
  g.hline(dx + 12, wx1 + 2, wallB - 3, WOOD.hi);
  g.rect(dx - 1, deckB - 1, 12, 3, WOOD.mid);
  g.hline(dx - 1, dx + 10, deckB + 1, WOOD.lo);
  if (xmas) {
    // 문 리스 · 처마 호랑가시 줄 + 전구
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      g.set(Math.round(dx + 5 + Math.cos(ang) * 3), Math.round(eave + 8 + Math.sin(ang) * 3), a % 4 === 0 ? 0xe8323a : 0x2b5a36);
    }
    for (let x = wx0 - 2; x <= wx1 + 2; x++) {
      const y = eave + Math.round(Math.sin(((x - wx0) % 14) / 14 * Math.PI) * 2);
      g.set(x, y, (x & 1) === 0 ? 0x2b5a36 : 0x3e7a48);
      if ((x - wx0) % 7 === 3) g.set(x, y + 1, XMAS[((x - wx0) / 7) % 5 | 0]);
    }
  }
  const roof = mask(g, (_x, y) => y < eave - 1 && y >= ridge - 1);
  g.outline(OUT);
  shadow(g, W / 2, deckB + 2, W / 2 - 3, 2.6, 64);
  return { grid: g, roof, windows, chimney: { x: cx + 3, y: ridge - 9 }, door: { x: dx + 5, y: wallB }, board };
}

/** 낮은 나무 울타리 한 칸 (가로 len, 원점 왼쪽 아래) — 기둥 8px마다, 가로대 둘 */
export function fenceHArt(len: number): Grid {
  const g = new Grid(len + 2, 12);
  for (let x = 0; x <= len; x += 8) {
    g.rect(x, 1, 2, 10, WOOD.lo);
    g.set(x, 1, WOOD.hi);
  }
  g.hline(0, len + 1, 3, WOOD.hi);
  g.hline(0, len + 1, 4, WOOD.mid);
  g.hline(0, len + 1, 7, WOOD.hi);
  g.hline(0, len + 1, 8, WOOD.mid);
  g.outline(OUT);
  return g;
}
/** 세로로 가는 울타리 (위에서 보면 짧은 기둥이 줄지어 서고 그 사이를 가는 가로대 두 줄이 잇는다) */
export function fenceVArt(len: number): Grid {
  const g = new Grid(7, len + 10);
  g.vline(2, 3, len + 4, WOOD.hi);
  g.vline(4, 6, len + 7, WOOD.lo);
  for (let y = 0; y <= len; y += 10) {
    g.rect(2, y + 1, 3, 7, WOOD.lo);
    g.rect(2, y + 1, 3, 2, WOOD.hi);
  }
  g.outline(OUT);
  return g;
}

/** 단지 입구 아치 (나무 기둥 둘 + 둥근 들보 + 이름판, 이름 글씨는 장면이 얹는다) */
export function archArt(xmas: boolean): Grid {
  const W = 52;
  const H = 46;
  const g = new Grid(W, H);
  g.rect(4, 12, 4, H - 14, LOG.mid);
  g.vline(4, 12, H - 3, LOG.hi);
  g.rect(W - 8, 12, 4, H - 14, LOG.mid);
  g.vline(W - 8, 12, H - 3, LOG.hi);
  for (let x = 2; x < W - 2; x++) {
    const y = 8 - Math.round(Math.sin(((x - 2) / (W - 4)) * Math.PI) * 5);
    g.rect(x, y, 1, 4, x % 6 === 0 ? LOG.lo : LOG.mid);
    g.set(x, y, LOG.hi);
  }
  g.rect(9, 10, W - 18, 9, 0xf2e6c8);
  frame(g, 9, 10, W - 18, 9, WOOD.line);
  if (xmas) for (let x = 3; x < W - 3; x += 4) g.set(x, 10 - Math.round(Math.sin(((x - 2) / (W - 4)) * Math.PI) * 5) + 3, XMAS[(x / 4) % 5 | 0]);
  g.outline(OUT);
  shadow(g, 6, H - 1.5, 4, 1, 60);
  shadow(g, W - 6, H - 1.5, 4, 1, 60);
  return g;
}

/** 「펜션 분양」 입간판 (작은 집 그림 + 빨간 리본) */
export function pensionStandArt(): Grid {
  const g = new Grid(22, 24);
  line(g, 4, 21, 7, 8, WOOD.lo);
  line(g, 17, 21, 14, 8, WOOD.lo);
  g.rect(2, 3, 18, 13, 0xf6efe0);
  frame(g, 2, 3, 18, 13, WOOD.line);
  for (let y = 7; y < 10; y++) g.hline(11 - (y - 6) * 2, 11 + (y - 6) * 2, y, 0xb85a3c);
  g.rect(7, 10, 9, 4, LOG.mid);
  g.rect(10, 11, 2, 3, WIN.warm);
  g.hline(4, 17, 5, 0xd84a3a);
  g.set(11, 2, 0xd84a3a);
  g.outline(OUT);
  shadow(g, 11, 22.5, 8, 1.2, 56);
  return g;
}

// ════════════════════════ 단지 놀이터 ════════════════════════

/** 워터 슬라이드: 나무 계단 탑(난간·지붕) + 구불구불 미끄럼틀(파랑·노랑 줄) → 작은 풀. 원점 = 그림 왼쪽 위 (장면이 자리를 맞춘다) */
export const SLIDE_ART = { w: 96, h: 120, tower: { x: 66, y: 74 }, pool: { x: 30, y: 104 } } as const;
export function waterSlideArt(): Grid {
  const { w: W, h: H } = SLIDE_ART;
  const g = new Grid(W, H);
  // 미끄럼틀 (탑 꼭대기 → 왼쪽 아래로 S자)
  const pts: [number, number][] = [];
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    pts.push([Math.round(66 - t * 34 + Math.sin(t * Math.PI * 2.2) * 16), Math.round(22 + t * 80)]);
  }
  for (const [x, y] of pts) {
    for (let k = -4; k <= 4; k++) g.set(x + k, y, Math.abs(k) >= 4 ? 0x2a6aa8 : Math.abs(k) >= 3 ? 0xf2c444 : k < 0 ? 0x7ac8ff : 0x5aa8e0);
  }
  for (const [x, y] of pts.filter((_, i) => i % 6 === 0)) g.set(x - 1, y, 0xe8f6ff);
  // 받침 기둥 (미끄럼틀 아래)
  for (const i of [20, 44, 64]) {
    const [x, y] = pts[i];
    g.rect(x - 1, y + 3, 2, Math.max(2, 106 - y - 6), WOOD.lo);
  }
  // 탑 (네 다리 + 두 층 바닥 + 지붕 + 사다리)
  const tx = 56;
  g.rect(tx, 22, 22, 4, WOOD.mid);
  g.hline(tx, tx + 21, 22, WOOD.hi);
  g.rect(tx, 50, 22, 3, WOOD.mid);
  for (const lx of [tx, tx + 20]) g.rect(lx, 14, 2, 76, WOOD.lo);
  for (let y = 30; y < 88; y += 6) g.hline(tx + 22, tx + 28, y, WOOD.hi);
  g.rect(tx + 22, 28, 1, 62, WOOD.lo);
  g.rect(tx + 28, 28, 1, 62, WOOD.lo);
  // 지붕 (빨강·흰 줄 천)
  for (let y = 4; y < 14; y++) for (let x = tx - 3 + (14 - y) * 0; x < tx + 25; x++) g.set(x, y, Math.floor((x - tx) / 4) % 2 ? 0xfaf0dc : 0xe85a4a);
  g.hline(tx - 3, tx + 24, 13, 0xb83a2e);
  // 풀 (둥근 테 + 물)
  const px = SLIDE_ART.pool.x;
  const py = SLIDE_ART.pool.y;
  for (let y = py - 12; y <= py + 12; y++)
    for (let x = px - 28; x <= px + 28; x++) {
      const d = ((x - px) / 28) ** 2 + ((y - py) / 12) ** 2;
      if (d > 1) continue;
      g.set(x, y, d > 0.72 ? (y < py ? 0xe8e4dc : 0xb8b4ac) : d > 0.6 ? 0x5ab4d0 : hash2(x, y >> 1, 7) < 0.12 ? 0xb8ecf8 : 0x6cc8e0);
    }
  g.outline(OUT);
  shadow(g, tx + 11, 91, 14, 2, 60);
  return g;
}
/** 눈썰매장 (겨울·크리스마스판 같은 자리): 눈 언덕 비탈 + 썰매 자국 + 빨간 썰매 둘 + 출발 데크·깃발 */
export function sledHillArt(xmas: boolean): Grid {
  // 11/26 언덕 오른쪽 끝(가운데 70 + 반지름 26)이 캔버스 오른쪽 끝에 닿아 잘렸다 → 오른쪽으로만 6 넓힌다 (위 왼쪽 원점으로 까는 판이라 자리는 그대로)
  const W = SLIDE_ART.w + 6;
  const H = SLIDE_ART.h;
  const g = new Grid(W, H);
  // 둥근 눈 언덕 (오른쪽 위가 꼭대기) + 왼쪽 아래로 길게 흘러내린 비탈. 테두리 없이 그늘로만 땅과 나뉜다
  const hill = (x: number, y: number) => {
    const a = ((x - 70) / 26) ** 2 + ((y - 34) / 22) ** 2;
    const t = Math.max(0, Math.min(1, (y - 34) / 74));
    const cx = 70 - t * 42;
    const hw = 20 - t * 4;
    const b = ((x - cx) / hw) ** 2;
    return Math.min(a, y > 34 && y < 110 ? b : 9);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = hill(x, y);
      if (d > 1) {
        // 언덕 오른쪽·아래 그림자 (땅 위)
        if (hill(x - 3, y - 3) <= 1) g.set(x, y, 0x5a6a82, 70);
        continue;
      }
      // 왼쪽 위 볕, 오른쪽 아래 그늘
      const nx = hill(x + 2, y) - hill(x - 2, y);
      const ny = hill(x, y + 2) - hill(x, y - 2);
      const lit = -nx * 0.6 - ny * 0.7 + (1 - d) * 0.3;
      g.set(x, y, lit > 0.32 ? SNOW.hi : lit > 0.08 ? SNOW.mid : lit > -0.12 ? SNOW.lo : SNOW.shade);
    }
  // 썰매 자국 두 줄 (비탈 가운데)
  for (let y = 40; y < 108; y++) {
    const t = (y - 34) / 74;
    const x = Math.round(70 - t * 42);
    g.set(x - 4, y, SNOW.shade);
    g.set(x + 4, y, SNOW.shade);
  }
  // 11/26 올라가는 나무 사다리 (운영자 「올라가는 다리가 안 보인다」): 언덕 오른쪽 밑(타는 자리 — 받침 81,95)에서 출발 데크까지.
  // 사다리 오르기 연출(campPlayPath — 76,34까지 곧게)과 같은 줄. 진한 테두리 기둥 둘 + 디딤판 (윗면에만 눈)
  for (let y = 22; y <= 99; y++) {
    const t = (y - 22) / 77;
    const lx = Math.round(69 + t * 6);
    const rx = Math.round(83 + t * 6);
    g.set(lx - 1, y, WOOD.line);
    g.set(lx, y, WOOD.lo);
    g.set(lx + 1, y, WOOD.mid);
    g.set(rx - 1, y, WOOD.mid);
    g.set(rx, y, WOOD.lo);
    g.set(rx + 1, y, WOOD.line);
    if ((y - 22) % 6 === 4) {
      g.hline(lx + 2, rx - 2, y - 1, SNOW.hi);
      g.hline(lx + 2, rx - 2, y, WOOD.hi);
      g.hline(lx + 2, rx - 2, y + 1, WOOD.mid);
      g.hline(lx + 2, rx - 2, y + 2, WOOD.line);
    }
  }
  // 기둥 머리 눈 · 밑동 (땅에 박힌 받침돌)
  for (const x of [69, 83]) {
    g.hline(x - 1, x + 1, 21, SNOW.hi);
    g.rect(x + 5, 99, 3, 2, 0x5a6a82);
  }
  // 출발 데크 + 깃발
  g.rect(62, 20, 18, 4, WOOD.mid);
  g.hline(62, 79, 20, WOOD.hi);
  g.hline(62, 79, 23, WOOD.lo);
  g.rect(78, 4, 1, 16, WOOD.line);
  for (let y = 4; y < 10; y++) g.hline(79, 79 + (10 - y), y, xmas ? 0x3e9a4a : 0xe85a4a);
  // 썰매 둘
  const sled = (x: number, y: number) => {
    g.rect(x, y, 10, 3, 0xd84a3a);
    g.hline(x, x + 9, y, 0xf27a6a);
    g.hline(x - 1, x + 10, y + 3, 0x5a5a60);
    g.set(x - 2, y + 2, 0x5a5a60);
    g.set(x + 11, y + 2, 0x1a1006);
  };
  sled(44, 68);
  sled(26, 98);
  return g;
}

/** 11/26 눈썰매 탄 사람 밑에 까는 빨간 썰매 (위에서 본 모습 — 언덕 그림의 썰매와 같은 색). 사람은 뒤쪽에 앉고, 앞판·끈·쇠 날 끝 말림이
 *  사람 발 앞(아래)으로 나온다. 원점 = 바닥 가운데 (CampPlay가 발밑에서 SLED_DY 아래에 깐다) */
export const SLED_RIDE_ART = { w: 24, h: 14 } as const;
export function sledRideArt(): Grid {
  const { w: W, h: H } = SLED_RIDE_ART;
  const g = new Grid(W, H);
  const red = { hi: 0xf27a6a, mid: 0xd84a3a, lo: 0xa83428 };
  const metal = { hi: 0x8a8a92, lo: 0x5a5a60 };
  const rope = 0xd8b070;
  // 쇠 날 (양옆) + 앞끝 말림
  g.vline(2, 3, 10, metal.lo);
  g.vline(21, 3, 10, metal.lo);
  g.set(3, 11, metal.hi);
  g.set(20, 11, metal.hi);
  // 썰매 판 (뒤 등판이 위, 앞판이 아래)
  g.rect(3, 1, 18, 8, red.mid);
  g.hline(3, 20, 1, red.hi);
  g.hline(4, 19, 2, red.lo);
  g.vline(3, 2, 8, red.hi);
  g.vline(20, 2, 8, red.lo);
  // 앞판 (살짝 들린 앞코 — 모서리 둥글게)
  g.rect(4, 9, 16, 2, red.mid);
  g.hline(4, 19, 8, red.hi);
  g.hline(5, 18, 10, red.lo);
  // 끈
  g.set(6, 11, rope);
  g.set(17, 11, rope);
  g.hline(7, 16, 12, rope);
  g.outline(OUT);
  shadow(g, W / 2, H - 1.2, W / 2 - 2, 1, 50);
  return g;
}

/** 대형 트램펄린 (원형 검은 매트 + 파랑 테 + 안전망 기둥 여덟) */
export function trampolineArt(rx: number, ry: number): Grid {
  const W = rx * 2 + 8;
  const H = ry * 2 + 30;
  const g = new Grid(W, H);
  const cx = W / 2;
  const cy = H - ry - 6;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d > 1) continue;
      g.set(x, y, d > 0.78 ? (y < cy ? 0x5ab4e8 : 0x2a7ab8) : d > 0.7 ? 0x1a1c22 : hash2(x >> 1, y >> 1, 9) < 0.08 ? 0x3a3c46 : 0x26282e);
    }
  // 안전망 기둥 + 망 (위 가장자리 옅게)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const x = Math.round(cx + Math.cos(a) * (rx - 1));
    const y = Math.round(cy + Math.sin(a) * (ry - 1));
    g.rect(x, y - 22, 2, 22, 0x8a9096);
    g.set(x, y - 23, 0xe85a4a);
  }
  for (let x = 2; x < W - 2; x++) {
    const t = (x - cx) / rx;
    if (Math.abs(t) > 1) continue;
    const y = Math.round(cy - Math.sqrt(1 - t * t) * ry - 20);
    if (x % 2 === 0) g.set(x, y, 0xdfe6ee, 200);
  }
  g.outline(OUT, false, 200);
  shadow(g, cx, cy + ry + 2, rx + 2, 3, 60);
  return g;
}

/** 평상 (낮은 나무 마루 + 가운데 작은 상) */
export function pyeongsangArt(): Grid {
  const g = new Grid(40, 26);
  for (let y = 4; y < 18; y++) for (let x = 2; x < 38; x++) g.set(x, y, (x - 2) % 5 === 4 ? WOOD.lo : y === 4 ? WOOD.hi : WOOD.mid);
  g.rect(2, 18, 36, 3, WOOD.lo);
  for (const x of [3, 35]) g.rect(x, 21, 2, 3, WOOD.line);
  g.rect(14, 7, 12, 6, 0x8a5a34);
  g.hline(14, 25, 7, 0xa87a4c);
  g.set(17, 9, 0xf2f2ec);
  g.set(22, 9, 0xd8a840);
  g.outline(OUT);
  for (let x = 4; x < 36; x++) g.set(x, 25, 0x1a1006, 56);
  return g;
}

// ════════════════════════ 낚시터 ════════════════════════

/** 가로로 뻗은 나무 잔교 (판자는 세로 — 사람은 가로로 걷는다), 물에 박힌 말뚝 */
export function pierArt(len: number, w: number): Grid {
  const g = new Grid(len + 2, w + 6);
  for (let x = 0; x < len; x++)
    for (let y = 1; y < w; y++) {
      const k = x % 5;
      g.set(x, y, k === 4 ? WOOD.line : y === 1 ? WOOD.hi : k === 0 ? WOOD.hi : WOOD.mid);
    }
  g.rect(0, w, len, 2, WOOD.lo);
  for (let x = 2; x < len; x += 16) {
    g.rect(x, w, 3, 5, LOG.lo);
    g.set(x, w + 4, 0x1a3442);
  }
  g.outline(OUT);
  return g;
}
/** 좌대: 물에 뜬 네모 평상 + 작은 지붕 오두막(창) + 의자 + 낚싯대 받침 둘 (+ 크리스마스 처마 전구) */
export function raftArt(roofI: number, xmas: boolean): { grid: Grid; roof: Uint8Array } {
  const W = 34;
  const H = 34;
  const g = new Grid(W, H);
  const R = ROOFS[roofI % ROOFS.length];
  // 뜬 통 (가장자리 파란 드럼) + 판자 바닥
  for (let y = 14; y < 30; y++)
    for (let x = 2; x < 32; x++) {
      const k = (x - 2) % 4;
      g.set(x, y, y >= 28 ? 0x3a6a8a : y === 14 ? WOOD.hi : k === 3 ? WOOD.lo : WOOD.mid);
    }
  for (const x of [3, 15, 27]) g.rect(x, 28, 4, 3, 0x2a5a8a);
  // 오두막 (뒤 반쪽)
  g.rect(6, 8, 16, 10, LOG.mid);
  for (let y = 8; y < 18; y += 3) g.hline(6, 21, y, LOG.hi);
  g.rect(10, 11, 6, 4, WIN.warm);
  g.set(12, 12, 0xfff4d0);
  for (let y = 2; y < 9; y++) {
    const inset = 8 - y;
    for (let x = 4 + Math.max(0, inset - 2); x < 24 - Math.max(0, inset - 2); x++) g.set(x, y, y === 8 ? R.lo : (x + y) % 5 === 0 ? R.lo : y < 4 ? R.hi : R.mid);
  }
  // 의자 · 낚싯대 받침 (오른쪽 앞)
  g.rect(24, 18, 5, 4, 0x4f9a88);
  g.rect(24, 15, 5, 3, 0x2f6a5e);
  line(g, 29, 22, 33, 10, 0x4a321e);
  line(g, 27, 24, 32, 14, 0x4a321e);
  g.set(33, 10, 0xe8e0d0);
  if (xmas) for (let x = 4; x < 24; x += 3) g.set(x, 9, XMAS[(x / 3) % 5 | 0]);
  const roof = mask(g, (_x, y) => y < 9);
  g.outline(OUT);
  return { grid: g, roof };
}
/** 부교 (물 위 좁은 판자길) — 두 점 사이를 잇는 그림 (원점 = 왼쪽 위 bbox) */
export function walkwayArt(dx: number, dy: number): { grid: Grid; ox: number; oy: number } {
  const pad = 4;
  const W = Math.abs(dx) + pad * 2 + 1;
  const H = Math.abs(dy) + pad * 2 + 2;
  const g = new Grid(W, H);
  const ox = dx < 0 ? W - 1 - pad : pad;
  const oy = dy < 0 ? H - 2 - pad : pad;
  const n = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ox + (dx * i) / n);
    const y = Math.round(oy + (dy * i) / n);
    const k = i % 4;
    for (let a = -2; a <= 2; a++) g.set(x + (Math.abs(dy) > Math.abs(dx) ? a : 0), y + (Math.abs(dy) > Math.abs(dx) ? 0 : a), k === 3 ? WOOD.lo : a === -2 ? WOOD.hi : WOOD.mid);
    if (i % 10 === 5) g.set(x + 2, y + 2, 0x2a5a8a);
  }
  g.outline(OUT);
  return { grid: g, ox, oy };
}
/** 나룻배 (작은 나무배 + 노) */
export function rowboatArt(): Grid {
  const g = new Grid(30, 14);
  for (let y = 3; y < 11; y++)
    for (let x = 1; x < 29; x++) {
      const t = Math.abs(x - 15) / 14;
      if (Math.abs(y - 7) > 4 * Math.sqrt(1 - t * t)) continue;
      g.set(x, y, y < 5 ? WOOD.hi : y > 8 ? WOOD.lo : WOOD.mid);
    }
  g.rect(8, 5, 14, 4, 0x6a4a2e);
  g.hline(12, 13, 5, WOOD.hi);
  g.hline(18, 19, 5, WOOD.hi);
  line(g, 5, 2, 24, 12, 0xa87a4c);
  g.outline(OUT);
  return g;
}
/** 낚시터 관리 부스 (작은 나무 매점 + 「미끼·대여」 판 + 미끼 통 + 낚싯대 걸이) */
export function boothArt(xmas: boolean): { grid: Grid; roof: Uint8Array } {
  const W = 50;
  const H = 46;
  const g = new Grid(W, H);
  for (let y = 4; y < 16; y++) for (let x = 2 + Math.max(0, 6 - y); x < W - 2 - Math.max(0, 6 - y); x++) g.set(x, y, (x + y) % 6 === 0 ? 0x2c425c : y < 7 ? 0x5e7a9a : 0x3e5a7a);
  g.rect(5, 16, W - 10, 20, LOG.mid);
  for (let y = 16; y < 36; y += 4) g.hline(5, W - 6, y, LOG.hi);
  g.rect(10, 20, 24, 9, 0x3a2a1e);
  g.rect(11, 21, 22, 7, WIN.warm2);
  g.rect(8, 29, 28, 3, WOOD.hi);
  g.rect(14, 22, 4, 4, 0x4f9a88);
  g.rect(22, 23, 6, 3, 0xd84a3a);
  g.rect(37, 20, 6, 14, WOOD.lo);
  for (let i = 0; i < 3; i++) line(g, 38 + i * 2, 33, 40 + i * 2, 18, 0x2c2018);
  g.rect(10, 37, 8, 6, 0x6a8aa0);
  g.rect(20, 38, 8, 5, 0x8a9096);
  if (xmas) for (let x = 4; x < W - 4; x += 3) g.set(x, 16, XMAS[(x / 3) % 5 | 0]);
  const roof = mask(g, (_x, y) => y < 16);
  g.outline(OUT);
  shadow(g, W / 2, H - 2, W / 2 - 4, 2, 60);
  return { grid: g, roof };
}
/** 얼음낚시 구멍 (언 연못 위 둥근 구멍 + 둘레 눈 + 작은 의자) */
export function iceHoleArt(): Grid {
  const g = new Grid(22, 14);
  g.ellipse(9, 8, 6, 3.4, SNOW.hi);
  g.ellipse(9, 8, 4, 2.2, 0x1a3442);
  g.set(8, 8, 0x4a7a8e);
  g.rect(17, 6, 4, 3, 0x4f9a88);
  g.rect(17, 9, 1, 2, 0x5a5a60);
  g.rect(20, 9, 1, 2, 0x5a5a60);
  line(g, 13, 7, 18, 1, 0x4a321e);
  g.outline(0x55606c, false, 160);
  return g;
}

// ════════════════════════ 캠프파이어 존 ════════════════════════

/** 해먹 (두 기둥 사이 늘어진 줄무늬 천) */
export function hammockArt(i: number): Grid {
  const g = new Grid(40, 26);
  const cols: [Color, Color][] = [
    [0xe8a03a, 0xfaf2de],
    [0x4f9a88, 0xf2ead0],
  ];
  const [a, b] = cols[i % 2];
  for (const x of [2, 36]) {
    g.rect(x, 2, 3, 22, LOG.mid);
    g.vline(x, 2, 23, LOG.hi);
  }
  for (let x = 5; x < 36; x++) {
    const t = (x - 5) / 30;
    const y = Math.round(6 + Math.sin(t * Math.PI) * 9);
    for (let k = 0; k < 4; k++) g.set(x, y + k - (k > 1 ? 0 : 0), Math.floor(x / 3) % 2 ? a : b);
    g.set(x, y + 4, darken(a, 0.3));
  }
  g.outline(OUT);
  shadow(g, 20, 24, 16, 1.6, 50);
  return g;
}
/** 마시멜로·핫도그 수레 (줄무늬 차양 + 진열대 + 바퀴) */
export function snackCartArt(): Grid {
  const g = new Grid(44, 42);
  for (let y = 4; y < 12; y++) for (let x = 2; x < 42; x++) g.set(x, y, Math.floor((x - 2) / 5) % 2 ? 0xfaf0dc : 0xd84a3a);
  for (let x = 2; x < 42; x++) g.set(x, 12 + ((x - 2) % 5 === 2 ? 1 : 0), 0xb83a2e);
  g.rect(4, 12, 2, 16, 0x8a9096);
  g.rect(38, 12, 2, 16, 0x8a9096);
  g.rect(3, 22, 38, 12, 0xf2c444);
  g.hline(3, 40, 22, 0xffe08a);
  g.rect(6, 25, 32, 6, 0xe8a03a);
  // 진열: 마시멜로 꼬치·핫도그
  for (let x = 8; x < 20; x += 3) {
    g.rect(x, 18, 2, 2, 0xfaf6ee);
    g.vline(x, 20, 22, 0x845e38);
  }
  for (let x = 24; x < 36; x += 5) {
    g.rect(x, 19, 4, 2, 0xd8a050);
    g.hline(x, x + 3, 20, 0xb84a30);
  }
  g.ellipse(10, 35, 3.5, 3.5, 0x2e2a28);
  g.ellipse(34, 35, 3.5, 3.5, 0x2e2a28);
  g.outline(OUT);
  shadow(g, 22, 39, 18, 2, 60);
  return g;
}
/** 장작더미 (통나무 단면이 보이게 쌓은) */
export function firewoodArt(): Grid {
  const g = new Grid(28, 18);
  const r = rng(77);
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4 - row; i++) {
      const cx = 5 + i * 6 + row * 3;
      const cy = 13 - row * 4;
      g.ellipse(cx, cy, 3, 2.6, LOG.lo);
      g.ellipse(cx, cy, 2, 1.7, r() < 0.5 ? LOG.ring : lighten(LOG.ring, 0.1));
      g.set(cx, cy, LOG.mid);
    }
  g.outline(OUT);
  shadow(g, 14, 16.5, 12, 1.2, 56);
  return g;
}

/** NPC 그림 색 바꾸기 (같은 사람 그림으로 다른 사람 — 옷·머리 색만 돌린다) */
export function recolorCanvas(src: HTMLCanvasElement, map: (r: number, g: number, b: number) => [number, number, number] | null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const m = map(d[i], d[i + 1], d[i + 2]);
    if (m) [d[i], d[i + 1], d[i + 2]] = m;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
export { mix as mixColor };
