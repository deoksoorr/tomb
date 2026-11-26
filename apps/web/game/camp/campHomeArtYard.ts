// 11/26 캠핑장 집 겉모습 그림 ④ 앞마당 단계 소품: 바비큐 스테이션·통유리 난간·아래 단 데크·선베드·싸리 울타리·닭장·우물·원두막 (6차 시안 mockArt6에서 옮김)

import { Grid, hash2, lighten, type Color } from "../sprites/pixel";
import { padGrid } from "./campArtPad";

const OUT = 0x2c2018;

const WOOD = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e } as const;

const DECK = { hi: 0xdcb888, mid: 0xc49a64, lo: 0x9a7448, line: 0x6a4a2c } as const;

const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228 } as const;

const STONE = { hi: 0xc8c2b4, mid: 0xa49e92, lo: 0x7e7972, line: 0x5a5650 } as const;

const XMAS = [0xff6a5a, 0xffd25a, 0x7ae08a, 0x7ac8ff, 0xfff2d8] as const;


function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 60): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, a);
    }
}

/** 개별 바비큐 스테이션: 조리대(위 도마·고기 바구니·집게) + 오른쪽 그릴(숯불) */
export function bbqStationArt(): Grid {
  const g = new Grid(36, 26);
  // 조리대
  g.rect(1, 8, 20, 4, 0xe8e0d0);
  g.hline(1, 20, 8, 0xfaf6ee);
  g.rect(2, 12, 18, 11, WOOD.mid);
  for (const x of [2, 11]) {
    g.rect(x + 1, 13, 7, 9, WOOD.lo);
    g.rect(x + 2, 14, 5, 7, WOOD.mid);
    g.set(x + 6, 17, 0xe8c070);
  }
  // 도마 + 고기 바구니(바구니 결 · 고기 · 상추)
  g.rect(3, 6, 7, 3, 0xd8b078);
  g.rect(12, 3, 8, 6, 0xc89850);
  for (let x = 12; x < 20; x += 2) g.vline(x, 4, 8, 0xa87838);
  g.rect(13, 2, 3, 2, 0xd0605a);
  g.rect(16, 2, 3, 2, 0x7ab84a);
  g.set(14, 1, 0xe88a80);
  // 그릴 (뚜껑 열린 통 그릴)
  g.rect(22, 9, 12, 7, 0x3a3a40);
  g.hline(22, 33, 9, 0x5a5a62);
  for (let x = 23; x < 33; x += 2) g.set(x, 10, 0xff8a40);
  g.hline(23, 32, 11, 0x6a6a70);
  g.rect(22, 2, 12, 6, 0x2a2a30);
  g.hline(23, 32, 3, 0x4a4a52);
  g.vline(24, 16, 23, 0x2a2a30);
  g.vline(31, 16, 23, 0x2a2a30);
  g.hline(24, 31, 20, 0x2a2a30);
  g.outline(OUT);
  shadow(g, 18, 24, 17, 2, 50);
  // 11/26 조리대·그릴 뚜껑이 캔버스 끝에 닿아 잘렸다
  return padGrid(g);
}

/** 통유리 난간 (테라스 앞 · 투명 유리 + 나무 손잡이) */
export function glassRailArt(len: number): Grid {
  const g = new Grid(len, 11);
  // 11/26 난간 양 끝이 잘린 유리면이었다 → 끝 기둥을 한 칸 안으로 두고 끝 열은 윤곽 (데크에 이어 놓는 조각이라 크기·자리는 그대로)
  for (let x = 1; x < len - 1; x++) {
    g.set(x, 1, WOOD.hi);
    g.set(x, 2, WOOD.lo);
    for (let y = 3; y < 10; y++) g.set(x, y, (x + y) % 9 === 0 ? 0xffffff : 0xbfe6f0, (x + y) % 9 === 0 ? 200 : 96);
  }
  for (let x = 1; x < len - 1; x += 12) g.vline(x, 1, 9, 0x8a9aa4);
  g.vline(len - 2, 1, 9, 0x8a9aa4);
  g.vline(0, 1, 10, OUT);
  g.vline(len - 1, 1, 10, OUT);
  return g;
}

/**
 * 아래 단 데크 (테라스 앞 한 단 낮은 넓은 데크 · 계단). 11/26 계단 폭 18 → 32 (문 앞 곧은 길 28px — 두 사람이 나란히),
 * 계단 가운데 stairX (그림 기준 — 기본 가운데. 3단계 넓힌 데크는 가운데가 문과 어긋나 문 아래로 맞춘다)
 */
export const LOWER_DECK_STAIR_W = 32;
export function lowerDeckArt(w: number, d: number, stairX = w / 2): Grid {
  const g = new Grid(w, d + 4);
  for (let y = 0; y < d; y++)
    for (let x = 0; x < w; x++) {
      const k = x % 5;
      g.set(x, y, k === 4 ? DECK.line : y === 0 ? DECK.hi : k === 0 ? DECK.hi : DECK.mid);
    }
  g.rect(0, d, w, 2, DECK.lo);
  const SW = LOWER_DECK_STAIR_W;
  const sx = Math.round(stairX - SW / 2);
  g.rect(sx, d, SW, 3, DECK.mid);
  g.hline(sx, sx + SW - 1, d, DECK.hi);
  g.hline(sx, sx + SW - 1, d + 2, DECK.lo);
  g.outline(OUT);
  return g;
}

/** 싸리 울타리 한 토막 (a → b, 바닥 선 기준). 원점 = (min x, min y - 높이) — ox·oy로 돌려준다 */
export function brushFenceSeg(ax: number, ay: number, bx: number, by: number, seed: number, snowy: boolean): { grid: Grid; ox: number; oy: number } {
  const HT = 11;
  const x0 = Math.floor(Math.min(ax, bx)) - 2;
  const y0 = Math.floor(Math.min(ay, by)) - HT - 2;
  const W = Math.ceil(Math.abs(bx - ax)) + 5;
  const Hh = Math.ceil(Math.abs(by - ay)) + HT + 5;
  const g = new Grid(W, Hh);
  const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
  const cols = [0xb08a5a, 0x8e6a40, 0xc8a46e, 0x9a7848] as const;
  const vert = Math.abs(bx - ax) < Math.abs(by - ay);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(ax + (bx - ax) * t) - x0;
    const y = Math.round(ay + (by - ay) * t) - y0;
    const post = i % 14 === 0 || i === n;
    const step = vert ? 1 : 2;
    if (post) {
      for (let k = 0; k < HT + 2; k++) {
        g.set(x, y - k, 0x5e4228);
        g.set(x + 1, y - k, 0x7a5634);
      }
      if (snowy) g.set(x, y - HT - 2, 0xf6f8fa);
    } else if (i % step === 0) {
      const h = HT - 2 + Math.floor(hash2(i, seed, 671) * 3);
      const c = cols[Math.floor(hash2(i, seed, 673) * 4)];
      for (let k = 0; k < h; k++) g.set(x, y - k, k === h - 1 ? lighten(c, 0.15) : c);
      if (snowy && hash2(i, seed, 675) < 0.5) g.set(x, y - h, 0xeef3f6);
    }
    // 엮은 새끼줄 두 가닥
    for (const k of [3, 7]) g.set(x, y - k, vert ? 0x6a4a2c : (i + k) % 3 === 0 ? 0xd8c090 : 0x6a4a2c);
  }
  g.outline(OUT);
  return { grid: g, ox: x0, oy: y0 };
}

/** 닭장 (나무 닭집 + 철망 마당 + 닭 둘) */
export function chickenCoopArt(snowy: boolean): Grid {
  const g = new Grid(34, 28);
  // 닭집 (왼쪽)
  g.rect(2, 10, 14, 14, WOOD.mid);
  for (let y = 10; y < 24; y += 3) g.hline(2, 15, y, WOOD.hi);
  g.rect(6, 16, 5, 8, 0x3a2a1c);
  for (let x = 0; x < 18; x++) {
    const y = 9 - Math.round(x * 0.35);
    for (let k = 0; k < 3; k++) g.set(x, y + k, k === 0 ? (snowy ? 0xf6f8fa : 0xc86a4a) : 0xa8543a);
  }
  // 철망 마당 (오른쪽)
  for (let x = 16; x < 33; x++) {
    g.set(x, 12, 0x8a8a92);
    g.set(x, 24, 0x8a8a92);
  }
  for (let x = 16; x < 33; x += 4) g.vline(x, 12, 24, 0x6a6a72);
  for (let y = 14; y < 24; y += 3) for (let x = 17; x < 33; x += 2) g.set(x, y, 0xb4b4bc, 120);
  // 닭 둘
  for (const [cx, cy] of [
    [22, 21],
    [28, 20],
  ] as const) {
    g.ellipse(cx, cy, 2.6, 2, 0xf8f4ea);
    g.set(cx + 2, cy - 2, 0xf8f4ea);
    g.set(cx + 2, cy - 3, 0xe04a3a);
    g.set(cx + 3, cy - 2, 0xf2b040);
    g.set(cx - 2, cy - 1, 0xe8e0d0);
  }
  g.outline(OUT);
  shadow(g, 17, 25.5, 16, 1.6, 50);
  return g;
}

/** 우물 (둥근 돌 우물 + 나무 지붕틀 + 두레박) */
export function wellArt(snowy: boolean): Grid {
  const g = new Grid(24, 30);
  g.ellipse(12, 23, 9, 5, STONE.mid);
  for (let x = 3; x < 22; x += 3) g.vline(x, 21, 27, STONE.lo);
  g.ellipse(12, 21, 7, 2.6, 0x2a3440);
  g.hline(6, 18, 19, STONE.hi);
  g.rect(3, 6, 2, 17, LOG.lo);
  g.rect(19, 6, 2, 17, LOG.lo);
  g.hline(3, 20, 9, LOG.mid);
  for (let x = 0; x < 24; x++) {
    const y = 5 - Math.round(Math.abs(x - 12) * 0.35);
    g.set(x, y, snowy ? 0xf6f8fa : 0xa8543a);
    g.set(x, y + 1, 0x8a4430);
  }
  g.vline(12, 10, 15, 0x6a4a2c);
  g.rect(10, 15, 5, 4, LOG.mid);
  g.hline(10, 14, 15, LOG.hi);
  g.outline(OUT);
  shadow(g, 12, 28, 10, 1.6, 50);
  return g;
}

/** 원두막 (기둥 위 높은 마루 + 짚 지붕 + 사다리 + 방석) */
export function wondumakArt(snowy: boolean, xmas: boolean): Grid {
  const g = new Grid(50, 52);
  for (const x of [5, 43]) g.rect(x, 18, 3, 32, LOG.lo);
  for (const x of [12, 36]) g.rect(x, 22, 2, 26, LOG.lo);
  // 마루
  g.rect(3, 30, 44, 6, WOOD.mid);
  for (let x = 3; x < 47; x += 4) g.vline(x, 30, 35, WOOD.lo);
  g.hline(3, 46, 30, WOOD.hi);
  g.hline(3, 46, 36, LOG.lo);
  // 방석
  // 11/26 방석 넷 — 앉을 자리(campHousingPlan 원두막 x 10·20·30·40)와 맞춘다
  for (const [x, c] of [
    [10, 0xc8484a],
    [20, 0x3e5a8a],
    [30, 0xd89a3a],
    [40, 0x4f9a88],
  ] as const)
    g.rect(x - 2, 30, 5, 3, c);
  // 짚 지붕. 11/26 처마 끝이 캔버스 양 끝 열에 닿아 잘렸다 → 양쪽 두 칸 안으로 (윤곽 자리)
  for (let y = 3; y < 18; y++) {
    const inset = Math.max(2, 9 - y);
    for (let x = inset; x < 50 - inset; x++) {
      const c = snowy && y < 6 ? 0xf2f6f8 : (x + y * 2) % 5 === 0 ? 0xa88a4a : y > 14 ? 0x9a7a3a : 0xc8a85a;
      g.set(x, y, c);
    }
  }
  if (xmas) for (let x = 2; x < 48; x += 4) g.set(x, 18, XMAS[(x / 4) % 5 | 0]);
  // 사다리
  g.vline(18, 36, 50, LOG.mid);
  g.vline(23, 36, 50, LOG.mid);
  for (let y = 39; y < 50; y += 3) g.hline(18, 23, y, LOG.hi);
  g.outline(OUT);
  shadow(g, 25, 49.5, 23, 2, 56);
  return g;
}

/** 선베드 (흰 쿠션 · 등받이 올린) */
export function loungerArt(color: Color): Grid {
  const g = new Grid(24, 14);
  g.rect(2, 7, 20, 3, 0xf4f0e8);
  g.hline(2, 21, 7, 0xffffff);
  for (let i = 0; i < 6; i++) g.rect(2 + i, 6 - i, 3, 2, i % 2 ? 0xf4f0e8 : color);
  g.rect(3, 10, 2, 3, 0x8a8a92);
  g.rect(19, 10, 2, 3, 0x8a8a92);
  g.rect(10, 8, 9, 1, color);
  g.outline(OUT);
  shadow(g, 12, 12.5, 11, 1.2, 50);
  // 11/26 등받이 끝이 캔버스 윗줄에 닿아 잘렸다
  return padGrid(g);
}
