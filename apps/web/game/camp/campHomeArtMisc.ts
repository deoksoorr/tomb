// 11/26 캠핑장 집 겉모습 그림 ⑤ 지붕 색·해먹 (6차 시안 mockArt3에서 옮김)

import { darken, Grid, type Color } from "../sprites/pixel";

const OUT = 0x2c2018;

const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228, ring: 0xe0c08a } as const;

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, a);
    }
}

export const ROOFS: readonly { hi: Color; mid: Color; lo: Color }[] = [
  { hi: 0xd8784e, mid: 0xb85a3c, lo: 0x8e4430 }, // 붉은 흙빛
  { hi: 0x6f9a74, mid: 0x4f7a5a, lo: 0x385c44 }, // 솔빛
  { hi: 0x5e7a9a, mid: 0x3e5a7a, lo: 0x2c425c }, // 남빛
  { hi: 0xe6b858, mid: 0xc89a3a, lo: 0x9a742a }, // 겨자
  { hi: 0xaa6a7a, mid: 0x8a4a5a, lo: 0x663444 }, // 자두
  { hi: 0x8a8e98, mid: 0x6a6e78, lo: 0x4e525c }, // 슬레이트
];

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

// ════════════════════ 11/26 집 들어가는 곳 표시 (운영자 「펜션·촌캉스 입구가 어디인지 모르겠다」) ════════════════════

/** 문 앞 발매트 (붉은 바탕 + 크림 테 — 테라스 나무 위에서 눈에 띄게) */
export function doorMatArt(): Grid {
  const g = new Grid(18, 7);
  g.rect(1, 1, 16, 5, 0xb84a3a);
  g.hline(1, 16, 1, 0xd86a52);
  g.hline(2, 15, 3, 0xf2dcb0);
  for (let x = 3; x < 15; x += 3) g.set(x, 4, 0x8e3428);
  g.outline(OUT);
  return g;
}
