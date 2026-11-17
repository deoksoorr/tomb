import { Grid, mix, type Color } from "../sprites/pixel";
import { toneOutline } from "./seaArt";
import { SEA_TEX_PREFIX } from "./seaTypes";

// 11/17 포구 갈매기 과자 그림 (코드로 그리는 픽셀 아트 — 포구 그림과 같은 규칙): 던지는 과자 한 조각 (갈매기 과자 · 매운 새우 과자),
// 매점 창 과자 봉지 아이콘, 빨개진 갈매기 머리 위 김 · 작은 불꽃 입김

const P = SEA_TEX_PREFIX;
export const GULL_TEX = {
  piece: (hot: boolean) => `${P}gull-piece${hot ? "Hot" : ""}`,
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

/** 바닷가 그림 굽는 목록에 더해요 (SeaMap forEachSeaTexture) */
export function forEachGullTexture(tex: (key: string, build: () => Grid | { grid: Grid; frameW?: number; frameH?: number }, linear?: boolean) => void): void {
  tex(GULL_TEX.piece(false), () => snackPieceArt(false));
  tex(GULL_TEX.piece(true), () => snackPieceArt(true));
  tex(GULL_TEX.steam, gullSteamArt);
  tex(GULL_TEX.flame, gullFlameArt);
}
