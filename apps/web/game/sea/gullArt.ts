import { Grid, mix, type Color } from "../sprites/pixel";
import { toneOutline } from "./seaArt";
import { SEA_TEX_PREFIX } from "./seaTypes";

// 11/17 포구 갈매기 과자 그림 (코드로 그리는 픽셀 아트 — 포구 그림과 같은 규칙): 던지는 과자 한 조각 (갈매기 과자 · 매운 새우 과자),
// 과자 자판기 창 과자 봉지 아이콘, 빨개진 갈매기 머리 위 김 · 작은 불꽃 입김, r2 선착장 길목 과자 자판기

const P = SEA_TEX_PREFIX;
export const GULL_TEX = {
  piece: (hot: boolean) => `${P}gull-piece${hot ? "Hot" : ""}`,
  /** 11/17 r2 선착장 길목 과자 자판기 · 밤 불빛 (이름이 "sea-gullVend"라 겨울판·크리스마스판이 눈·장식을 얹어요) */
  vend: `${P}gullVend`,
  vendLit: `${P}gullVendLit`,
  steam: `${P}gull-steam`,
  flame: `${P}gull-flame`,
} as const;

/** 던지는 과자 한 조각 (갈매기 과자 = 노릇한 둥근 과자 · 매운 새우 과자 = 빨간 새우 모양 과자) */
export function snackPieceArt(hot: boolean): Grid {
  const g = new Grid(7, 5);
  if (hot) {
    // 휘어진 새우 모양 (빨강 · 고춧가루 점)
    const rows = ["..rrr..", ".rhhrr.", "rhrrrdr", "rr...dd", ".d....."];
    rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && g.set(x, y, ({ r: 0xf05a3a, h: 0xffa080, d: 0xb8301e } as Record<string, Color>)[ch])));
    g.set(3, 2, 0x8a1a10);
  } else {
    g.ellipse(3.5, 2.5, 3.2, 2.2, 0xe8b860);
    g.set(2, 1, 0xfff0b8);
    g.set(3, 1, 0xfbd890);
    g.set(5, 3, 0xb8823a);
    g.set(2, 3, 0xc8924a); // 깨 한 알
  }
  toneOutline(g, 0.3);
  return g;
}

/** 김 한 뭉치 (빨개진 갈매기 머리 위 — 흰 김이 피어올라요) */
export function gullSteamArt(): Grid {
  const g = new Grid(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4) / 4;
      if (d < 1) g.set(x, y, 0xffffff, Math.round(200 * (1 - d) ** 1.2));
    }
  return g;
}

/** 작은 불꽃 입김 (2장 — 앞으로 훅 뿜었다 사라져요). 원점 왼쪽 가운데 = 부리 끝 */
export function gullFlameArt(): { grid: Grid; frameW: number; frameH: number } {
  const W = 10;
  const H = 6;
  const g = new Grid(W * 2, H);
  for (let f = 0; f < 2; f++)
    for (let x = 0; x < W; x++) {
      const len = f ? W : W - 3;
      if (x >= len) continue;
      const half = 0.6 + Math.sin((x / len) * Math.PI) * (f ? 2.6 : 2);
      for (let y = 0; y < H; y++) {
        const dy = Math.abs(y + 0.5 - H / 2);
        if (dy > half) continue;
        const k = x / len;
        const c = mix(mix(0xfff6c8, 0xffb040, Math.min(1, k * 1.6)), 0xe8402a, Math.max(0, k * 1.4 - 0.4));
        g.set(f * W + x, y, c, Math.round(255 * (1 - Math.max(0, k - 0.55) * 1.6)));
      }
    }
  return { grid: g, frameW: W, frameH: H };
}

/** 매점 창 과자 봉지 아이콘 (16×16) — 갈매기 그림이 찍힌 하늘색 봉지 · 새우가 그려진 빨간 봉지 */
export function snackBagIcon(hot: boolean): Grid {
  const g = new Grid(16, 16);
  const body: Color = hot ? 0xe8463a : 0x8ad0ec;
  const lo: Color = hot ? 0xb02a22 : 0x5aa8cc;
  const hi: Color = hot ? 0xff8a70 : 0xc8ecf8;
  for (let y = 2; y < 15; y++)
    for (let x = 3; x < 13; x++) {
      const zig = y === 2 && x % 2 === 0;
      if (zig) continue;
      g.set(x, y, x === 3 ? hi : x >= 11 ? lo : body);
    }
  g.hline(3, 12, 4, hot ? 0xffd860 : 0xfff6d8); // 봉지 위 띠
  if (hot) {
    // 새우 그림 + 「매운」 불꽃 점
    for (const [x, y] of [[6, 8], [7, 7], [8, 7], [9, 8], [9, 9], [8, 10], [7, 11]] as const) g.set(x, y, 0xffe0c8);
    g.set(6, 7, 0x3a1a10);
    g.set(10, 6, 0xffd040);
    g.set(11, 5, 0xffa020);
  } else {
    // 갈매기 그림 (흰 날개 · 노란 부리)
    g.hline(5, 10, 9, 0xffffff);
    g.set(6, 8, 0xffffff);
    g.set(9, 8, 0xffffff);
    g.set(7, 10, 0xffffff);
    g.set(8, 10, 0xffffff);
    g.set(10, 10, 0xf0b040);
    for (const [x, y] of [[5, 12], [7, 13], [9, 12]] as const) g.set(x, y, 0xe8b860); // 과자 부스러기
  }
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 11/17 r2 과자 자판기 (음료 자판기와 같은 그림체 — 24×44, 원점 바닥 가운데) ──
// 하늘색·흰색 포구 몸통, 위에 앉은 갈매기 마스코트 (한눈에 「갈매기 과자」), 간판에 갈매기 그림, 진열창엔 하늘색 갈매기 과자 봉지와 빨간 새우 과자 봉지,
// 아래엔 큰 단추 둘 (하늘색 · 빨강)과 꺼내는 칸
export const GULL_VEND_W = 24;
export const GULL_VEND_H = 44;
const VEND_OUT = 0x1e2a36;
export function gullVendArt(): Grid {
  const W = GULL_VEND_W;
  const H = GULL_VEND_H;
  const g = new Grid(W, H);
  const top = 9;
  // 몸통 (하늘색 · 왼쪽 밝게 · 오른쪽 그늘) + 흰 앞판 띠
  g.rect(2, top, 20, H - top - 3, 0x5ab8e0);
  g.vline(2, top, H - 4, 0x8ad4f0);
  g.vline(21, top, H - 4, 0x3a8ab8);
  g.hline(2, 21, top, 0xa8e2f6);
  // 지붕 차양 (흰·하늘 줄무늬 — 포구 매점과 같은 줄)
  for (let x = 1; x <= 22; x++) {
    const stripe = Math.floor((x - 1) / 3) % 2 === 0;
    g.set(x, top - 1, stripe ? 0xffffff : 0x3a9ad0);
    g.set(x, top, stripe ? 0xf0f6fa : 0x2e86bc);
    if (x % 3 === 1) g.set(x, top + 1, stripe ? 0xe0eef6 : 0x2e86bc);
  }
  // 간판 (흰 바탕 · 갈매기 그림 · 물결 한 줄)
  g.rect(4, top + 3, 16, 5, 0xfffcf2);
  g.hline(5, 18, top + 7, 0x8ad0ec);
  // 간판 갈매기 (날개 펼친 V · 노란 부리)
  for (const [x, y] of [[8, top + 4], [9, top + 5], [10, top + 5], [11, top + 4], [12, top + 5], [13, top + 5], [14, top + 4]] as const) g.set(x, y, 0x3a4a5a);
  g.set(15, top + 4, 0xf0b040);
  // 진열창 (밝은 하늘 바탕 + 과자 봉지 두 줄: 위 하늘색 갈매기 과자 · 아래 빨간 새우 과자)
  g.rect(4, top + 10, 16, 13, 0xe4f6fc);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const x = 5 + c * 4;
      const y = top + 11 + r * 6;
      const body = r === 0 ? 0x8ad0ec : 0xe8463a;
      const hi = r === 0 ? 0xc8ecf8 : 0xff8a70;
      g.rect(x, y, 3, 4, body);
      g.vline(x, y, y + 3, hi);
      g.set(x + 1, y, r === 0 ? 0xfff6d8 : 0xffd860); // 봉지 위 띠
      g.set(x + 1, y + 2, r === 0 ? 0xffffff : 0xffe0c8); // 갈매기·새우 그림 한 점
    }
    g.hline(4, 19, top + 15 + r * 6, 0xa8c8d8); // 선반
  }
  // 단추 둘 (하늘색 · 빨강) · 동전 넣는 곳
  g.rect(5, top + 25, 4, 2, 0x3aa0e0);
  g.set(5, top + 25, 0xa8e2ff);
  g.rect(10, top + 25, 4, 2, 0xe0463a);
  g.set(10, top + 25, 0xffa090);
  g.rect(17, top + 24, 2, 4, 0x2a3440);
  g.set(17, top + 25, 0x8a96a4);
  // 꺼내는 칸
  g.rect(4, top + 29, 16, 4, 0x1e2a36);
  g.hline(4, 19, top + 29, 0x3a5468);
  // 아래 물결 띠 (흰 물결)
  for (let x = 3; x <= 20; x++) g.set(x, H - 5 - (x % 4 === 0 ? 1 : 0), 0xffffff);
  // 다리
  g.rect(3, H - 3, 3, 2, 0x3a4450);
  g.rect(18, H - 3, 3, 2, 0x3a4450);
  // 위에 앉은 갈매기 마스코트 (흰 몸 · 회색 날개 · 노란 부리 · 까만 눈) — 차양 위 오른쪽
  const gx = 15;
  const gy = top - 2;
  g.ellipse(gx, gy - 3, 3.2, 2.4, 0xffffff);
  g.ellipse(gx - 1, gy - 6, 2, 1.8, 0xffffff);
  g.hline(gx - 3, gx + 1, gy - 2, 0xb8c4cc); // 날개
  g.hline(gx - 2, gx + 2, gy - 1, 0x98a4ae);
  g.set(gx + 3, gy - 3, 0xe8eef2); // 꽁지
  g.set(gx - 3, gy - 6, 0xf0b040); // 부리
  g.set(gx - 4, gy - 6, 0xd89020);
  g.set(gx - 1, gy - 7, 0x1e2228); // 눈
  g.set(gx - 1, gy, 0xf0b040); // 발
  g.set(gx + 1, gy, 0xf0b040);
  g.outline(VEND_OUT);
  // 바닥 그림자
  for (let x = 2; x <= W - 3; x++) g.set(x, H - 1, 0x000000, 50);
  return g;
}
/** 과자 자판기 밤 불빛: 진열창·간판·단추만 밝게 (ADD로 겹쳐요). gullVendArt와 같은 크기 */
export function gullVendLitArt(): Grid {
  const g = new Grid(GULL_VEND_W, GULL_VEND_H);
  const top = 9;
  g.rect(4, top + 10, 16, 13, 0x8ac8e8);
  g.rect(5, top + 11, 14, 11, 0xb8e8ff);
  g.rect(4, top + 3, 16, 5, 0x9aa8b8);
  g.rect(5, top + 25, 4, 2, 0x60b0ff);
  g.rect(10, top + 25, 4, 2, 0xff7060);
  return g;
}

/** 바닷가 그림 굽는 목록에 더해요 (SeaMap forEachSeaTexture) */
export function forEachGullTexture(tex: (key: string, build: () => Grid | { grid: Grid; frameW?: number; frameH?: number }, linear?: boolean) => void): void {
  tex(GULL_TEX.piece(false), () => snackPieceArt(false));
  tex(GULL_TEX.piece(true), () => snackPieceArt(true));
  tex(GULL_TEX.steam, gullSteamArt);
  tex(GULL_TEX.flame, gullFlameArt);
  tex(GULL_TEX.vend, gullVendArt);
  tex(GULL_TEX.vendLit, gullVendLitArt);
}
