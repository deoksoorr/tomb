// 11/26 캠핑장 집 겉모습 그림 ③ 촌캉스 시골집: 기와집·슬레이트집·마당·돌담·대문·아궁이·평상·밥상·장독대·빨랫줄·감나무·텃밭·4인 식탁·스파·정자·화로대
// (6차 시안 mockArt5에서 옮김. 펜션 앞마당 식탁·스파·화로대도 여기)

import { darken, Grid, hash2, lighten, mix, rng, vnoise, type Color } from "../sprites/pixel";
import { SNOW } from "../sprites/winterArt";
import { padArt, padGrid } from "./campArtPad";

const OUT = 0x2c2018;

const SH = 0x1a1006;

const WOOD = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e } as const;

const DECK = { hi: 0xdcb888, mid: 0xc49a64, lo: 0x9a7448, line: 0x6a4a2c } as const;

const TIMBER = { hi: 0xa87446, mid: 0x8a5a34, lo: 0x6a4228, line: 0x4a2e1a } as const;

const GIWA = { hi: 0x9aa4b0, mid: 0x737d8a, lo: 0x56606c, dark: 0x3c434e, ridge: 0x2f353f, end: 0xbfc6ce } as const;

const SLATE = { hi: 0x8cb6cc, mid: 0x6a96b2, lo: 0x4e7896, dark: 0x3a5c78, cap: 0xb8c2ca, rust: 0xa8704c } as const;

const PLASTER = { hi: 0xf6f0e2, mid: 0xe8dfca, lo: 0xd2c6aa } as const;

const PAPER = { day: 0xf3ecd6, shade: 0xe0d6ba, lit: 0xffe2a0, lit2: 0xffc878 } as const;

const STONE = { hi: 0xcdc4b2, mid: 0xaea492, lo: 0x8c8272, line: 0x625a4c } as const;

const CLAY = { hi: 0xd09a6c, mid: 0xae7a50, lo: 0x885c3a, dark: 0x5e3e26 } as const;

const IRON = { hi: 0x77736f, mid: 0x46423f, lo: 0x2a2725, glint: 0xaaa6a0 } as const;

const ONGGI = { hi: 0xa4734c, mid: 0x76503a, lo: 0x4e3424, rim: 0x5e4030, glint: 0xe2bc92 } as const;

const PERS = { hi: 0xffc05a, mid: 0xf28a22, lo: 0xc85e16, calyx: 0x45582a } as const;

const BARK = { hi: 0x7c6858, mid: 0x5c4c40, lo: 0x40342c } as const;

const AUTUMN = [0xe07a2e, 0xcc5a2a, 0xeaa63c, 0xb88a30, 0xa24c26] as const;

const XMAS = [0xff6a5a, 0xffd25a, 0x7ae08a, 0x7ac8ff, 0xfff2d8] as const;

const CUSHION = [
  { mid: 0xc8484a, hi: 0xe07068, trim: 0xf0c868 },
  { mid: 0x4a5a9e, hi: 0x6a7cc0, trim: 0xe8d8a0 },
  { mid: 0x5a8a5a, hi: 0x7cac74, trim: 0xf0e0a8 },
  { mid: 0xd09a34, hi: 0xeabc58, trim: 0xb84a3a },
] as const;

export type Pt = { x: number; y: number };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 60): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, SH, a);
    }
}

function frame(g: Grid, x: number, y: number, w: number, h: number, c: Color): void {
  g.hline(x, x + w - 1, y, c);
  g.hline(x, x + w - 1, y + h - 1, c);
  g.vline(x, y, y + h - 1, c);
  g.vline(x + w - 1, y, y + h - 1, c);
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, thick = 1): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    g.set(x, y, c);
    if (thick > 1) g.set(x + 1, y, c);
    if (thick > 2) g.set(x, y + 1, c);
  }
}

const mask = (g: Grid, test: (x: number, y: number) => boolean) => {
  const m = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.filled(x, y) && test(x, y)) m[y * g.w + x] = 1;
  return m;
};

/** 고무신 한 켤레 (흰 · 검정) */
function shoes(g: Grid, x: number, y: number, c: Color): void {
  for (const dx of [0, 4]) {
    g.hline(x + dx, x + dx + 2, y, c);
    g.hline(x + dx, x + dx + 2, y + 1, darken(c, 0.25));
    g.set(x + dx + 1, y, darken(c, 0.5));
  }
}

/** 크리스마스 리스 (지름 7) */
function wreath(g: Grid, cx: number, cy: number): void {
  for (let a = 0; a < 14; a++) {
    const ang = (a / 14) * Math.PI * 2;
    g.set(Math.round(cx + Math.cos(ang) * 3), Math.round(cy + Math.sin(ang) * 3), a % 2 ? 0x2b5a36 : 0x3e7a48);
  }
  for (const [x, y] of [[-2, -2], [2, -1], [-1, 2], [3, 1]] as const) g.set(cx + x, cy + y, 0xe8323a);
  g.set(cx, cy + 3, 0xe8323a);
  g.set(cx - 1, cy + 4, 0xc82a30);
  g.set(cx + 1, cy + 4, 0xc82a30);
}

export type RuralArt = { grid: Grid; roof: Uint8Array; windows: Pt[]; chimney: Pt; door: Pt; board: Pt; eaveL: Pt; eaveR: Pt };

/** 원점 = 기단 아래 가운데 (댓돌 앞) */
// 11/26 촌캉스 두 채 집 크기를 맞췄다 (슬레이트집 82 → 100 — 칸 나눔은 폭 기준이라 그대로 넓어진다)
export const RURAL_SIZE = { giwa: { w: 100, h: 68 }, slate: { w: 100, h: 62 } } as const;

/** 띠살문 한 짝 (창호지 + 촘촘한 세로살 · 가로 띠) */
function paperDoor(g: Grid, x: number, y: number, w: number, h: number, lit: boolean): void {
  g.rect(x, y, w, h, TIMBER.lo);
  const p0 = lit ? PAPER.lit : PAPER.day;
  const p1 = lit ? PAPER.lit2 : PAPER.shade;
  for (let yy = y + 1; yy < y + h - 1; yy++)
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      const band = yy === y + 4 || yy === y + h - 5 || yy === y + Math.round(h / 2);
      const bar = (xx - x) % 2 === 0;
      g.set(xx, yy, band ? (lit ? 0xb07a40 : TIMBER.hi) : bar ? (lit ? 0xe8b060 : mix(TIMBER.hi, p0, 0.55)) : yy < y + 3 ? p1 : p0);
    }
  if (lit) g.set(x + 2, y + 2, 0xfff6d8);
}

/** 기와집 (팔작지붕 · 들린 처마 · 회벽 + 나무 기둥 · 띠살문 · 툇마루 · 돌 기단 · 댓돌 고무신 · 옆 굴뚝) */
export function giwaHouseArt(lit: boolean, xmas: boolean): RuralArt {
  const { w: W, h: H } = RURAL_SIZE.giwa;
  const g = new Grid(W, H);
  const mid = (W - 1) / 2;
  const wx0 = 12;
  const wx1 = W - 13;
  const rx0 = 2;
  const rx1 = W - 3;
  const ridge = 11;
  const eave = 33;
  const wallB = 55;
  // 옆 굴뚝 (흙 + 돌, 지붕 뒤로)
  const chx = W - 19;
  for (let y = 1; y < ridge + 8; y++)
    for (let x = chx; x < chx + 7; x++) g.set(x, y, hash2(x >> 1, y >> 1, 801) < 0.3 ? STONE.mid : x === chx ? CLAY.hi : y % 4 === 0 ? CLAY.lo : CLAY.mid);
  g.rect(chx - 1, 0, 9, 2, CLAY.dark);
  g.hline(chx, chx + 6, 0, CLAY.lo);
  // 지붕: 가운데 용마루, 양끝은 내림마루(합각)로 내려가고 처마 끝은 살짝 들린다
  const half = (rx1 - rx0) / 2;
  const ridgeHalf = half - 15;
  const top = new Array<number>(W).fill(0);
  const bot = new Array<number>(W).fill(0);
  for (let x = rx0; x <= rx1; x++) {
    const t = (x - mid) / half;
    const lift = Math.round(3.2 * Math.abs(t) ** 3);
    const d = Math.max(0, Math.abs(x - mid) - ridgeHalf);
    const rLift = Math.abs(x - mid) <= ridgeHalf ? Math.round(1.6 * (Math.abs(x - mid) / ridgeHalf) ** 8) : 0;
    top[x] = ridge + Math.round(d * 1.05) - rLift;
    bot[x] = eave - lift;
    for (let y = top[x]; y <= bot[x]; y++) {
      const col = (x - rx0) % 4;
      const row = (y - ridge) % 5;
      let c: Color = col === 0 ? GIWA.lo : col === 1 ? GIWA.hi : GIWA.mid;
      if (row === 4 && col !== 1) c = darken(c, 0.12);
      if (d > 0) c = darken(c, 0.14);
      if (y >= bot[x] - 1) c = col === 1 || col === 2 ? GIWA.end : GIWA.dark; // 막새 줄
      if (y === bot[x] - 2) c = darken(c, 0.2);
      g.set(x, y, c);
    }
  }
  // 용마루 (검은 기와 + 흰 착고 줄) · 내림마루
  for (let x = rx0; x <= rx1; x++) {
    const d = Math.abs(x - mid) - ridgeHalf;
    if (d <= 0) {
      g.set(x, top[x] - 2, GIWA.ridge);
      g.set(x, top[x] - 1, 0xd8d2c4);
      g.set(x, top[x], GIWA.ridge);
      g.set(x, top[x] + 1, GIWA.dark);
    } else if (d < 15) {
      g.set(x, top[x] - 1, GIWA.ridge);
      g.set(x, top[x], GIWA.dark);
    }
  }
  // 용마루 끝 망와 (살짝 솟음)
  for (const s of [-1, 1]) {
    const x = Math.round(mid + s * ridgeHalf);
    g.rect(x - 1, top[x] - 4, 3, 3, GIWA.ridge);
    g.set(x, top[x] - 4, GIWA.end);
  }
  // 벽: 창방(가로 나무) · 기둥 · 회벽 칸
  for (let y = eave + 1; y < wallB; y++) for (let x = wx0; x <= wx1; x++) g.set(x, y, y < eave + 3 ? PLASTER.lo : PLASTER.mid);
  for (let x = wx0; x <= wx1; x++) {
    g.set(x, eave + 1, TIMBER.lo);
    g.set(x, eave + 2, TIMBER.mid);
    g.set(x, eave + 3, TIMBER.hi);
  }
  const bay = (wx1 - wx0) / 4;
  const posts = [0, 1, 2, 3, 4].map((i) => Math.round(wx0 + i * bay) - (i === 4 ? 2 : 0));
  const windows: Pt[] = [];
  // 칸 0: 회벽 + 봉창 / 칸 1·2: 띠살문 두 짝씩 / 칸 3: 부엌 판장문 + 살창
  {
    const b0 = posts[0] + 3;
    const wx = b0 + 4;
    const wy = eave + 8;
    g.rect(wx - 1, wy - 1, 11, 10, TIMBER.lo);
    paperDoor(g, wx, wy, 9, 8, lit);
    g.hline(wx - 1, wx + 9, wy + 9, TIMBER.hi);
    windows.push({ x: wx + 4, y: wy + 4 });
    // 머름 (창 아래 나무 판)
    g.rect(b0, wallB - 5, posts[1] - b0, 5, TIMBER.mid);
    g.hline(b0, posts[1] - 1, wallB - 5, TIMBER.hi);
    for (let x = b0 + 3; x < posts[1]; x += 5) g.vline(x, wallB - 4, wallB - 1, TIMBER.lo);
  }
  for (const i of [1, 2]) {
    const x0 = posts[i] + 3;
    const x1 = posts[i + 1] - 1;
    const w = Math.floor((x1 - x0 + 1) / 2);
    paperDoor(g, x0, eave + 5, w, wallB - eave - 5, lit);
    paperDoor(g, x0 + w, eave + 5, x1 - x0 + 1 - w, wallB - eave - 5, lit);
    windows.push({ x: Math.round((x0 + x1) / 2), y: eave + 12 });
  }
  {
    const x0 = posts[3] + 3;
    const x1 = posts[4] - 1;
    const dw = x1 - x0 - 3;
    const dx = x0 + 2;
    g.rect(dx, eave + 9, dw, wallB - eave - 9, TIMBER.mid);
    for (let x = dx; x < dx + dw; x += 3) g.vline(x, eave + 9, wallB - 1, TIMBER.lo);
    g.hline(dx, dx + dw - 1, eave + 9, TIMBER.hi);
    g.set(dx + dw - 3, eave + 17, 0xd8c890);
    // 살창 (부엌 위 세로살 창)
    g.rect(dx + 1, eave + 5, dw - 2, 3, lit ? 0xffb860 : 0x3a3430);
    for (let x = dx + 2; x < dx + dw - 2; x += 2) g.vline(x, eave + 5, eave + 7, TIMBER.lo);
    if (lit) {
      g.vline(dx + Math.round(dw / 2), eave + 10, wallB - 1, 0xffb860);
      windows.push({ x: dx + Math.round(dw / 2), y: eave + 10 });
    }
  }
  for (const px of posts) {
    g.rect(px, eave + 1, 3, wallB - eave, TIMBER.mid);
    g.vline(px, eave + 1, wallB, TIMBER.hi);
    g.vline(px + 2, eave + 1, wallB, TIMBER.lo);
  }
  // 처마 그늘 (벽 위쪽)
  for (let x = wx0; x <= wx1; x++) for (let y = eave + 1; y <= bot[x] + 1; y++) if (y > eave) g.set(x, y, darken(g.get(x, y) >>> 8, 0.25));
  // 툇마루
  for (let x = wx0 - 2; x <= wx1 + 2; x++) {
    g.set(x, wallB, DECK.hi);
    g.set(x, wallB + 1, (x - wx0) % 6 === 0 ? DECK.line : DECK.mid);
    g.set(x, wallB + 2, (x - wx0) % 6 === 0 ? DECK.line : DECK.mid);
    g.set(x, wallB + 3, DECK.lo);
  }
  for (const px of posts) g.rect(px, wallB, 3, 4, TIMBER.mid);
  // 돌 기단
  for (let y = wallB + 4; y < wallB + 9; y++)
    for (let x = wx0 - 6; x <= wx1 + 6; x++) {
      const row = y < wallB + 6 ? 0 : 1;
      const seam = (x + row * 4) % 8 === 0 || y === wallB + 6;
      g.set(x, y, seam ? STONE.line : y === wallB + 4 || y === wallB + 7 ? STONE.hi : hash2(x, y, 803) < 0.2 ? STONE.lo : STONE.mid);
    }
  // 댓돌 + 고무신
  const sx = Math.round(mid) - 9;
  g.rect(sx, wallB + 8, 19, 4, STONE.mid);
  g.hline(sx, sx + 18, wallB + 8, STONE.hi);
  g.hline(sx + 1, sx + 17, wallB + 11, STONE.lo);
  shoes(g, sx + 2, wallB + 8, 0xf4f2ec);
  shoes(g, sx + 11, wallB + 8, 0x3a3a3e);
  // 현판 (가운데 기둥 위)
  const bx = posts[2];
  g.rect(bx - 8, eave + 1, 19, 6, TIMBER.line);
  g.rect(bx - 7, eave + 2, 17, 4, 0x5a3a22);
  if (xmas) {
    wreath(g, posts[1] + 1, eave + 13);
    wreath(g, posts[3] + 1, eave + 13);
  }
  const roof = mask(g, (x, y) => y <= bot[x] - 2 && y >= top[x] - 4 && x >= rx0 && x <= rx1);
  g.outline(OUT);
  shadow(g, mid, wallB + 12, half - 6, 1.6, 54);
  // 11/26 굴뚝 꼭대기가 캔버스 윗줄에 닿아 잘렸다 — 위 3(굴뚝 위 눈)·좌우 2 빈 칸 (바닥 가운데 원점이라 자리는 그대로, 그림 안 좌표도 같이 옮긴다)
  return padArt({
    grid: g,
    roof,
    windows,
    chimney: { x: chx + 3, y: 0 },
    door: { x: Math.round(mid), y: wallB + 10 },
    board: { x: bx + 1, y: eave + 4 },
    eaveL: { x: rx0 + 2, y: bot[rx0 + 2] + 1 },
    eaveR: { x: rx1 - 2, y: bot[rx1 - 2] + 1 },
  }, { top: 3 });
}

/** 슬레이트집 (파란 골슬레이트 맞배지붕 · 시멘트 벽 + 민트 허리 · 유리 미닫이 · 부엌문 · 양철 연통 · 툇마루 · 댓돌) */
export function slateHouseArt(lit: boolean, xmas: boolean): RuralArt {
  const { w: W, h: H } = RURAL_SIZE.slate;
  const g = new Grid(W, H);
  const mid = (W - 1) / 2;
  const wx0 = 10;
  const wx1 = W - 13;
  const rx0 = 3;
  const rx1 = W - 6;
  const ridge = 13;
  const eave = 30;
  const wallB = 50;
  // 지붕 (위가 살짝 좁은 사다리꼴, 골 무늬 세로줄 · 녹물 몇 줄)
  for (let y = ridge; y <= eave; y++) {
    const inset = Math.round(((eave - y) / (eave - ridge)) * 3);
    for (let x = rx0 + inset; x <= rx1 - inset; x++) {
      const col = (x - rx0) % 3;
      let c: Color = col === 0 ? SLATE.lo : col === 1 ? SLATE.hi : SLATE.mid;
      if (y > ridge + 2 && hash2(x, 0, 811) < 0.08 && hash2(x, y, 813) < 0.7 && col !== 1) c = mix(c, SLATE.rust, 0.55);
      if (y >= eave - 1) c = darken(c, 0.22);
      g.set(x, y, c);
    }
  }
  // 용마루 덮개 (밝은 철판)
  g.hline(rx0 + 3, rx1 - 3, ridge - 1, SLATE.cap);
  g.hline(rx0 + 3, rx1 - 3, ridge, darken(SLATE.cap, 0.2));
  for (let x = rx0 + 5; x < rx1 - 3; x += 6) g.set(x, ridge + 1, 0x7a848e);
  // 벽 (흰 시멘트 + 민트 허리)
  for (let y = eave + 1; y < wallB; y++) for (let x = wx0; x <= wx1; x++) g.set(x, y, y > wallB - 8 ? (y === wallB - 7 ? 0x8ab4a0 : 0xa6cab4) : y < eave + 3 ? PLASTER.lo : PLASTER.mid);
  const windows: Pt[] = [];
  const bay = (wx1 - wx0) / 3;
  const posts = [0, 1, 2, 3].map((i) => Math.round(wx0 + i * bay) - (i === 3 ? 2 : 0));
  // 칸 0: 창 (네 칸 유리 · 꽃무늬 커튼)
  {
    const x = posts[0] + 5;
    const y = eave + 6;
    g.rect(x - 1, y - 1, 13, 11, TIMBER.lo);
    for (let yy = y; yy < y + 9; yy++)
      for (let xx = x; xx < x + 11; xx++) {
        const bar = xx === x + 5 || yy === y + 4;
        g.set(xx, yy, bar ? TIMBER.mid : lit ? (xx < x + 2 || xx > x + 8 ? 0xe87a6a : 0xffd890) : yy === y ? 0x9cc4d8 : 0x5a7a90);
      }
    if (lit) g.set(x + 3, y + 1, 0xfff4d0);
    g.hline(x - 1, x + 11, y + 10, TIMBER.hi);
    windows.push({ x: x + 5, y: y + 4 });
  }
  // 칸 1: 유리 미닫이 두 짝 (나무 살 + 유리)
  {
    const x0 = posts[1] + 3;
    const x1 = posts[2] - 1;
    for (let y = eave + 4; y < wallB; y++)
      for (let x = x0; x <= x1; x++) {
        const fx = (x - x0) % 8;
        const fy = (y - eave - 4) % 6;
        const fr = fx === 0 || fx === 7 || fy === 0 || x === x1;
        g.set(x, y, fr ? TIMBER.mid : lit ? (fy === 1 ? 0xffe8b0 : 0xffcf80) : fy === 1 ? 0x9cc4d8 : 0x5a7a90);
      }
    windows.push({ x: Math.round((x0 + x1) / 2), y: eave + 12 });
  }
  // 칸 2: 부엌문 (나무 판 · 작은 유리)
  {
    const x0 = posts[2] + 4;
    const x1 = posts[3] - 2;
    g.rect(x0, eave + 5, x1 - x0 + 1, wallB - eave - 5, 0x6a8a9a);
    for (let x = x0; x <= x1; x += 3) g.vline(x, eave + 5, wallB - 1, 0x56747e);
    g.hline(x0, x1, eave + 5, 0x8aaab8);
    g.rect(x0 + 2, eave + 8, x1 - x0 - 3, 4, lit ? 0xffc070 : 0x3a4656);
    g.set(x1 - 2, eave + 14, 0xd8c890);
    if (lit) windows.push({ x: Math.round((x0 + x1) / 2), y: eave + 10 });
  }
  for (const px of posts) {
    g.rect(px, eave + 1, 3, wallB - eave, TIMBER.mid);
    g.vline(px, eave + 1, wallB, TIMBER.hi);
    g.vline(px + 2, eave + 1, wallB, TIMBER.lo);
  }
  for (let x = wx0; x <= wx1; x++) for (let y = eave + 1; y <= eave + 2; y++) g.set(x, y, darken(g.get(x, y) >>> 8, 0.28));
  // 양철 연통 (부엌 옆으로 나와 지붕 위로)
  const px = wx1 + 3;
  g.rect(wx1 - 1, eave + 7, 5, 3, 0x9aa0a6);
  g.hline(wx1 - 1, wx1 + 3, eave + 7, 0xc8ccd0);
  for (let y = 3; y < eave + 10; y++) {
    g.set(px, y, 0xc0c4c8);
    g.set(px + 1, y, 0x9aa0a6);
    g.set(px + 2, y, 0x7a8086);
  }
  for (const y of [12, 24]) g.hline(px - 1, px + 3, y, 0x6a7076);
  g.hline(px - 2, px + 4, 2, 0x7a8086);
  g.hline(px - 1, px + 3, 1, 0xa8aeb4);
  g.set(px + 1, 0, 0x8a9096);
  // 툇마루 · 시멘트 기단 · 댓돌
  for (let x = wx0 - 2; x <= wx1 + 2; x++) {
    g.set(x, wallB, DECK.hi);
    g.set(x, wallB + 1, (x - wx0) % 5 === 0 ? DECK.line : DECK.mid);
    g.set(x, wallB + 2, DECK.lo);
  }
  for (const p of posts) g.rect(p, wallB, 3, 3, TIMBER.mid);
  for (let y = wallB + 3; y < wallB + 7; y++)
    for (let x = wx0 - 4; x <= wx1 + 4; x++) g.set(x, y, y === wallB + 3 ? 0xd4d0c6 : hash2(x, y, 815) < 0.12 ? 0xa8a49a : 0xbebab0);
  const sx = Math.round(posts[1] + bay / 2) - 8;
  g.rect(sx, wallB + 6, 17, 4, STONE.mid);
  g.hline(sx, sx + 16, wallB + 6, STONE.hi);
  g.hline(sx + 1, sx + 15, wallB + 9, STONE.lo);
  shoes(g, sx + 1, wallB + 6, 0x4a6ab8);
  shoes(g, sx + 9, wallB + 6, 0xf4f2ec);
  if (xmas) wreath(g, posts[2] + 1, eave + 10);
  const roof = mask(g, (x, y) => y <= eave - 2 && y >= ridge - 1 && x < px - 1);
  g.outline(OUT);
  shadow(g, mid - 2, wallB + 10, (rx1 - rx0) / 2 - 4, 1.6, 54);
  return padArt({
    grid: g,
    roof,
    windows,
    chimney: { x: px + 1, y: 0 },
    door: { x: sx + 8, y: wallB + 8 },
    board: { x: Math.round(mid), y: eave + 3 },
    eaveL: { x: rx0 + 1, y: eave + 1 },
    eaveR: { x: rx1 - 1, y: eave + 1 },
  }, { top: 3 });
}

/**
 * 흙마당 바닥 (평평한 그림, 가장자리는 풀밭으로 번진다). 겨울판은 눈 덮인 마당에 쓸어 둔 길·아궁이 둘레 녹은 땅.
 * swept = 눈을 쓸어 둔 자리 (마당 그림 좌표 타원)
 */
export function yardArt(w: number, h: number, snowy: boolean, seed: number, swept: { x: number; y: number; rx: number; ry: number }[] = [], melt: Pt | null = null): Grid {
  const g = new Grid(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      const n = vnoise(x, y, 7, 821 + seed);
      if (e < 4 && hash2(x, y, 823 + seed) * 4 > e + n * 1.2) continue;
      const k = vnoise(x, y, 11, 825 + seed);
      if (!snowy) {
        let c: Color = k < 0.35 ? 0xbc9a6a : k < 0.7 ? 0xc8a676 : 0xd2b282;
        const h1 = hash2(x, y, 827 + seed);
        if (h1 < 0.025) c = 0xa88a5a;
        else if (h1 < 0.035) c = 0xe2c89a;
        else if (h1 < 0.041) c = AUTUMN[Math.floor(hash2(x, y, 829) * AUTUMN.length)];
        if (e < 6 && hash2(x, y, 831 + seed) < 0.25) c = mix(c, 0x8a8a4a, 0.4);
        g.set(x, y, c);
      } else {
        let sweptK = 0;
        for (const s of swept) {
          const d = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
          if (d < 1) sweptK = Math.max(sweptK, 1 - d);
        }
        let c: Color = k < 0.4 ? SNOW.mid : k < 0.8 ? SNOW.hi : SNOW.lo;
        if (sweptK > 0.2 + hash2(x, y, 833) * 0.25) c = mix(0xcdd5dc, 0xd9dfe5, hash2(x, y, 835));
        if (melt) {
          const d = Math.hypot((x - melt.x) / 1.4, y - melt.y);
          if (d < 9 + n * 4) c = d < 6 + n * 3 ? (hash2(x, y, 837) < 0.3 ? 0x8a7458 : 0x9c8462) : mix(c, 0x9a8c7a, 0.5);
        }
        if (hash2(x >> 1, y >> 1, 839 + seed) < 0.012 && sweptK < 0.2) c = 0xb4c0cc;
        g.set(x, y, c);
      }
    }
  return g;
}

/** 끝 열(x — 왼쪽·오른쪽) 또는 윗줄(top)에 닿은 칠을 윤곽 색으로 덮는다 (이어 붙이는 조각 — 크기·원점 그대로) */
function closeEnds(g: Grid, side: "x" | "top"): void {
  const cover = (x: number, y: number) => {
    if ((g.get(x, y) & 255) >= 128) g.set(x, y, OUT);
  };
  if (side === "x")
    for (let y = 0; y < g.h; y++) {
      cover(0, y);
      cover(g.w - 1, y);
    }
  else for (let x = 0; x < g.w; x++) cover(x, 0);
}

/** 낮은 돌담 (가로): 둥근 돌을 엇갈려 쌓고 위는 넓적한 갓돌. 원점 = 아래 왼쪽 (장면이 맞춘다) */
export function stoneWallHArt(len: number, seed: number, mossy: boolean): Grid {
  const g = new Grid(len, 12);
  const r = rng(841 + seed);
  for (let row = 0; row < 3; row++) {
    const y0 = 2 + row * 3;
    let x = -Math.floor(r() * 4);
    while (x < len) {
      const sw = 4 + Math.floor(r() * 4);
      const base = row === 0 ? STONE.hi : r() < 0.3 ? STONE.lo : STONE.mid;
      for (let yy = y0; yy < y0 + 3; yy++)
        for (let xx = Math.max(0, x); xx < Math.min(len, x + sw - 1); xx++) {
          const corner = (xx === x || xx === x + sw - 2) && (yy === y0 || yy === y0 + 2);
          if (corner) continue;
          let c: Color = yy === y0 ? lighten(base, 0.12) : yy === y0 + 2 ? darken(base, 0.12) : base;
          if (mossy && row === 0 && yy === y0 && hash2(xx, yy, 843 + seed) < 0.12) c = 0x7a9a4a;
          g.set(xx, yy, c);
        }
      x += sw;
    }
  }
  // 갓돌 (위 판돌)
  for (let x = 0; x < len; x++) {
    if (!g.filled(x, 2)) continue;
    g.set(x, 1, hash2(x >> 2, 0, 845 + seed) < 0.5 ? 0xd8d0bc : 0xc8bea8);
  }
  for (let x = 0; x < len; x++) for (let y = 2; y < 11; y++) if (!g.filled(x, y) && g.filled(x, y - 1)) g.set(x, y, STONE.line);
  g.outline(OUT);
  for (let x = 1; x < len - 1; x++) if (!g.filled(x, 11)) g.set(x, 11, SH, 54);
  // 11/26 이어 붙이는 담 조각이라 크기는 그대로 — 대신 양 끝 열(잘린 돌)은 윤곽으로 닫는다 (모서리·대문 기둥 옆 끝이 잘려 보였다)
  closeEnds(g, "x");
  return g;
}

/** 낮은 돌담 (세로): 위에서 보면 넓적한 돌이 줄지어 선 띠. 원점 = 위 가운데 */
export function stoneWallVArt(len: number, seed: number, mossy: boolean): Grid {
  const W = 9;
  const g = new Grid(W, len + 10);
  const r = rng(851 + seed);
  let y = 0;
  let k = 0;
  while (y < len) {
    const sh = 3 + Math.floor(r() * 3);
    const off = k % 2;
    for (let yy = y; yy < Math.min(len, y + sh - 1); yy++)
      for (let x = 1 + off; x < W - 1 - (1 - off); x++) {
        const corner = (yy === y || yy === y + sh - 2) && (x === 1 + off || x === W - 2 - (1 - off));
        if (corner) continue;
        let c: Color = x <= 2 + off ? STONE.hi : x >= W - 3 ? STONE.lo : r() < 0.15 ? STONE.lo : STONE.mid;
        if (mossy && hash2(x, yy, 853 + seed) < 0.06) c = 0x7a9a4a;
        g.set(x, yy, c);
      }
    y += sh;
    k++;
  }
  // 아래 끝 앞면 (돌 쌓은 옆모습)
  for (let row = 0; row < 3; row++)
    for (let x = 1; x < W - 1; x++) {
      const yy = len + row * 3;
      for (let j = 0; j < 2; j++) g.set(x, yy + j, (x + row) % 4 === 0 ? STONE.line : j === 0 ? STONE.mid : STONE.lo);
    }
  for (let yy = 0; yy < len + 8; yy++) for (let x = 1; x < W - 1; x++) if (!g.filled(x, yy) && g.filled(x, yy - 1) && g.filled(x, yy + 1)) g.set(x, yy, STONE.line);
  g.outline(OUT);
  closeEnds(g, "top");
  // 가로 가운데 원점이라 좌우 빈 칸은 자리를 안 바꾼다 (눈판에서 옆 윤곽에 얹힌 눈이 끝 열에 닿지 않게)
  return padGrid(g, { x: 2, top: 0 });
}

/** 대문 돌기둥 (갓돌 얹은 돌 기둥) */
export function gatePostArt(): Grid {
  const g = new Grid(10, 20);
  for (let row = 0; row < 5; row++) {
    const y0 = 4 + row * 3;
    for (let x = 1; x < 9; x++) for (let y = y0; y < y0 + 3; y++) g.set(x, y, y === y0 + 2 ? STONE.lo : (x + row * 2) % 6 === 0 ? STONE.line : x < 3 ? STONE.hi : STONE.mid);
  }
  g.rect(0, 1, 10, 3, 0xd8d0bc);
  g.hline(0, 9, 3, STONE.lo);
  g.outline(OUT);
  shadow(g, 5, 19, 5, 1, 56);
  // 11/26 갓돌이 캔버스 양 끝에 닿아 잘렸다
  return padGrid(g);
}

/** 싸리문 (열어 둔 나뭇가지 엮은 문짝) */
export function brushGateArt(): Grid {
  const g = new Grid(14, 18);
  for (let x = 1; x < 13; x++) {
    const top = 2 + (x % 3 === 0 ? 0 : 1);
    for (let y = top; y < 16; y++) g.set(x, y, (x + y) % 3 === 0 ? 0x8a6a40 : x % 2 ? 0xb89060 : 0xa47c4e);
  }
  for (const y of [5, 12]) g.hline(1, 12, y, 0x6a4a2a);
  g.outline(OUT);
  shadow(g, 7, 17, 6, 1, 50);
  return padGrid(g);
}

/** 바깥 아궁이 + 가마솥 (흙·돌 부뚜막, 앞 불구멍, 뒤 작은 굴뚝, 옆 장작) — 불꽃은 장면이 불구멍 위에 얹는다 */
/** 11/26 그림은 44×36에 그리고 둘레에 빈 칸 (좌우 1·위 2 — 굴뚝·옆 장작이 캔버스 끝에 닿아 잘렸다). AGUNGI는 빈 칸까지 넣은 크기·좌표 */
const AGUNGI_RAW = { w: 44, h: 36 } as const;
const AGUNGI_PAD = { x: 1, top: 2 } as const;
export const AGUNGI = {
  w: AGUNGI_RAW.w + 2 * AGUNGI_PAD.x,
  h: AGUNGI_RAW.h + AGUNGI_PAD.top,
  mouth: { x: 23 + AGUNGI_PAD.x, y: 31 + AGUNGI_PAD.top },
  pot: { x: 23 + AGUNGI_PAD.x, y: 12 + AGUNGI_PAD.top },
  chimney: { x: 36 + AGUNGI_PAD.x, y: 1 + AGUNGI_PAD.top },
} as const;

export function agungiArt(lit: boolean, xmas: boolean): Grid {
  const { w: W, h: H } = AGUNGI_RAW;
  const g = new Grid(W, H);
  // 뒤 굴뚝
  for (let y = 2; y < 16; y++) for (let x = 34; x < 39; x++) g.set(x, y, hash2(x, y >> 1, 861) < 0.3 ? STONE.mid : x === 34 ? CLAY.hi : CLAY.mid);
  g.rect(33, 1, 7, 2, CLAY.dark);
  // 부뚜막 몸통 (앞면: 흙에 박힌 돌)
  const x0 = 10;
  const x1 = 36;
  for (let y = 14; y < 33; y++)
    for (let x = x0; x <= x1; x++) {
      const round = (y < 16 && (x === x0 || x === x1)) || (y > 31 && (x === x0 || x === x1));
      if (round) continue;
      let c: Color = y < 18 ? CLAY.hi : CLAY.mid;
      const st = vnoise(x, y, 3, 863);
      if (y >= 18 && st > 0.66) c = st > 0.8 ? STONE.hi : STONE.mid;
      if (y >= 18 && st > 0.62 && st <= 0.66) c = CLAY.lo;
      if (x === x1 || y === 32) c = darken(c, 0.18);
      g.set(x, y, c);
    }
  // 윗면 (솥 둘레 흙)
  g.ellipse(23, 15, 13, 5, CLAY.hi);
  g.ellipse(23, 15.5, 12, 4, lighten(CLAY.hi, 0.08));
  // 가마솥: 전(테) + 뚜껑 + 손잡이
  g.ellipse(23, 13.5, 11, 4.2, IRON.lo);
  g.ellipse(23, 13, 10, 3.6, IRON.mid);
  g.ellipse(23, 10.5, 8, 4.5, IRON.lo);
  g.ellipse(23, 10, 7.5, 4, IRON.mid);
  for (const [x, y] of [[18, 8], [19, 7], [20, 7], [21, 6]] as const) g.set(x, y, IRON.hi);
  g.set(17, 9, IRON.glint);
  g.rect(21, 5, 5, 2, IRON.lo);
  g.hline(22, 24, 5, IRON.hi);
  g.hline(13, 33, 15, IRON.hi);
  // 불구멍 (아치)
  const mx = AGUNGI.mouth.x;
  for (let y = 24; y < 33; y++)
    for (let x = mx - 5; x <= mx + 5; x++) {
      const dx = (x - mx) / 5.5;
      const dy = (y - 32) / 8.5;
      if (dx * dx + dy * dy > 1) continue;
      let c: Color = 0x1e1410;
      if (lit) {
        const k = 1 - Math.sqrt(dx * dx + dy * dy);
        c = y > 29 ? (hash2(x, y, 865) < 0.4 ? 0xffc850 : 0xff8a30) : k > 0.45 ? 0xd8582a : 0x5a2a18;
      }
      g.set(x, y, c);
    }
  for (let x = mx - 6; x <= mx + 6; x++) {
    const dx = (x - mx) / 6.5;
    const y = Math.round(32 - Math.sqrt(Math.max(0, 1 - dx * dx)) * 9.5);
    g.set(x, y, STONE.hi);
  }
  // 옆 장작 (왼쪽)
  for (const [cx, cy] of [[4, 30], [9, 30], [6.5, 26.5]] as const) {
    g.ellipse(cx, cy, 2.8, 2.4, 0x5e4228);
    g.ellipse(cx, cy, 1.8, 1.5, 0xe0c08a);
    g.set(Math.round(cx), Math.round(cy), 0x86603a);
  }
  line(g, 1, 33, 9, 33, 0x86603a);
  if (xmas) {
    // 굴뚝 빨간 리본 · 부뚜막 위 호랑가시 잎
    g.rect(33, 6, 7, 2, 0xd83a3a);
    g.set(32, 8, 0xd83a3a);
    g.set(40, 8, 0xd83a3a);
    g.set(36, 8, 0xa82a2a);
    for (const [x, y] of [[11, 18], [12, 17], [13, 18], [14, 17]] as const) g.set(x, y, 0x2b6a3a);
    g.set(12, 18, 0xe8323a);
    g.set(13, 19, 0xe8323a);
  }
  g.outline(OUT);
  shadow(g, 23, 34, 16, 1.6, 60);
  return padGrid(g, AGUNGI_PAD);
}

/** 평상 + 소반 밥상 + 방석 넷 (뒤 둘 · 양옆 둘) */
export const PYEONG = { w: 52, h: 32, seats: [{ x: 9, y: 16 }, { x: 43, y: 16 }, { x: 19, y: 9 }, { x: 33, y: 9 }] } as const;

export function pyeongsangMealArt(): Grid {
  const { w: W, h: H } = PYEONG;
  const g = new Grid(W, H);
  for (let y = 5; y < 22; y++) for (let x = 2; x < W - 2; x++) g.set(x, y, (x - 2) % 6 === 5 ? WOOD.lo : y === 5 ? WOOD.hi : hash2(x, y, 871) < 0.06 ? WOOD.lo : WOOD.mid);
  g.rect(2, 22, W - 4, 3, WOOD.lo);
  g.hline(2, W - 3, 22, darken(WOOD.lo, 0.1));
  for (const x of [3, W - 6]) g.rect(x, 25, 3, 4, WOOD.line);
  // 방석 (뒤 → 양옆)
  const cush = (cx: number, cy: number, i: number) => {
    const C = CUSHION[i % 4];
    g.rect(cx - 4, cy - 3, 9, 7, C.trim);
    g.rect(cx - 3, cy - 2, 7, 5, C.mid);
    g.hline(cx - 3, cx + 2, cy - 2, C.hi);
    g.set(cx, cy, C.trim);
  };
  PYEONG.seats.forEach((s, i) => cush(s.x, s.y - 2, i));
  // 소반 (둥근 밥상) + 밥 · 국 · 김치 · 나물
  g.ellipse(26, 14, 9, 5, WOOD.line);
  g.ellipse(26, 13.5, 8, 4.2, 0x8a5a34);
  g.ellipse(26, 13, 7.5, 3.6, 0xa06a3e);
  g.hline(21, 31, 11, 0xb87e4c);
  const bowl = (x: number, y: number, c: Color, rim: Color) => {
    g.rect(x, y, 3, 2, rim);
    g.set(x + 1, y, c);
    g.set(x, y, c);
    g.set(x + 2, y, c);
  };
  bowl(21, 12, 0xfaf6ec, 0xc8c4bc);
  bowl(29, 12, 0xfaf6ec, 0xc8c4bc);
  bowl(25, 11, 0xd85a3a, 0x8a3a2a);
  bowl(23, 15, 0x7aa848, 0x4a6a2a);
  bowl(27, 15, 0xe8c060, 0x9a7a3a);
  g.outline(OUT);
  for (let x = 4; x < W - 4; x++) if (!g.filled(x, H - 2)) g.set(x, H - 2, SH, 56);
  return g;
}

/** 낮은 나무 밥상 (교자상) + 작은 나무 의자 넷 (뒤 둘 · 양옆 둘) + 냄비 · 그릇 */
/** 11/26 양옆 의자가 캔버스 끝 열에 닿아 잘렸다 — 그림은 42×26에 그리고 좌우에 1씩 빈 칸 (LOWTABLE은 빈 칸까지 넣은 크기·자리, 위는 그대로) */
const LOWTABLE_RAW_W = 42;
export const LOWTABLE = { w: 44, h: 26, seats: [{ x: 5, y: 19 }, { x: 38, y: 19 }, { x: 16, y: 8 }, { x: 28, y: 8 }] } as const;

/** stools: 2 = 양옆 의자 · 4 = 양옆 + 뒤 · "back" = 뒤 의자 둘만 (11/26 싸리울집 2단계 소반 — 앞을 보고 앉는다) */
export function lowTableArt(stools: 2 | 4 | "back" = 4): Grid {
  const W = LOWTABLE_RAW_W;
  const H = LOWTABLE.h;
  const g = new Grid(W, H);
  const stool = (cx: number, by: number) => {
    g.rect(cx - 3, by - 6, 7, 3, WOOD.hi);
    g.hline(cx - 3, cx + 3, by - 6, lighten(WOOD.hi, 0.18));
    g.rect(cx - 3, by - 3, 7, 1, WOOD.lo);
    g.vline(cx - 2, by - 2, by, WOOD.lo);
    g.vline(cx + 2, by - 2, by, WOOD.lo);
  };
  if (stools !== 2) {
    stool(15, 10);
    stool(27, 10);
  }
  // 상
  g.rect(8, 9, 26, 8, WOOD.mid);
  g.hline(8, 33, 9, WOOD.hi);
  for (let x = 8; x < 34; x += 7) g.vline(x, 10, 16, mix(WOOD.mid, WOOD.lo, 0.5));
  g.rect(8, 17, 26, 2, WOOD.lo);
  for (const x of [9, 32]) g.rect(x, 19, 2, 3, WOOD.line);
  // 냄비 (김 나는 찌개) + 그릇
  g.ellipse(21, 12, 4, 2.4, 0x9a9ea4);
  g.ellipse(21, 11.5, 3, 1.6, 0xd8603a);
  g.set(20, 11, 0xf0a060);
  g.rect(16, 15, 2, 1, 0x7a7e84);
  g.rect(25, 15, 2, 1, 0x7a7e84);
  for (const [x, y, c] of [[11, 11, 0xfaf6ec], [29, 11, 0xfaf6ec], [12, 14, 0x7aa848], [29, 14, 0xd85a3a]] as const) {
    g.rect(x, y, 3, 2, 0xc8c4bc);
    g.hline(x, x + 2, y, c);
  }
  if (stools !== "back") {
    stool(4, 22);
    stool(37, 22);
  }
  g.outline(OUT);
  shadow(g, 21, 23.5, 18, 1.4, 54);
  return padGrid(g, { x: (LOWTABLE.w - LOWTABLE_RAW_W) / 2, top: 0 });
}

/** 옹기 하나 (바닥 by 위로 반지름 rx·ry — 어깨 띠·뚜껑·반짝임) */
function onggi(g: Grid, cx: number, by: number, rx: number, ry: number, lidUp: boolean): void {
  const cy = by - ry;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      g.set(x, y, dx < -0.35 && dy < 0.3 ? ONGGI.hi : dx > 0.45 || dy > 0.6 ? ONGGI.lo : ONGGI.mid);
    }
  g.set(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.2), ONGGI.glint);
  g.set(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.2) + 1, ONGGI.glint);
  // 어깨 띠 + 뚜껑
  g.hline(Math.round(cx - rx * 0.7), Math.round(cx + rx * 0.7), Math.round(cy - ry * 0.45), ONGGI.rim);
  const lw = Math.round(rx * 0.75);
  const ly = Math.round(cy - ry) - 1;
  g.hline(Math.round(cx) - lw, Math.round(cx) + lw, ly, lidUp ? ONGGI.lo : ONGGI.rim);
  g.hline(Math.round(cx) - lw + 1, Math.round(cx) + lw - 1, ly - 1, lidUp ? ONGGI.hi : ONGGI.mid);
  g.set(Math.round(cx), ly - 2, ONGGI.lo);
}

/**
 * 11/26 3단계 원두막·정자 앞 기둥 옆 작은 장독대 (운영자 — 단계가 올라도 장독대는 남는다): 둥근 돌 받침 위 큰 독 하나 뒤 · 작은 항아리 둘 앞 비스듬히,
 * 큰 독 뚜껑 위에 바가지 하나. 그림 22×24 (빈 칸 둘러 26×26)
 */
export function jangdokCompactArt(): Grid {
  const W = 22;
  const H = 24;
  const g = new Grid(W, H);
  // 둥근 돌 받침 (납작한 판돌 두 장)
  g.ellipse(11, 19.5, 9.6, 3.2, STONE.lo);
  g.ellipse(11, 18.6, 9, 2.6, STONE.mid);
  for (let x = 3; x < 19; x++) if (g.filled(x, 17) && hash2(x, 17, 951) < 0.35) g.set(x, 17, STONE.hi);
  g.vline(11, 18, 21, STONE.line);
  // 큰 독 (뒤 가운데) · 작은 항아리 (앞 왼쪽 낮게 · 오른쪽 조금 높게)
  onggi(g, 11.5, 17, 5.6, 6.6, false);
  onggi(g, 6, 21, 3.4, 4, true);
  onggi(g, 16.5, 20, 3.2, 3.8, false);
  // 바가지 (큰 독 뚜껑 위 — 반쪽 박)
  g.rect(13, 2, 4, 2, 0xe8d49a);
  g.hline(13, 16, 1, 0xf6e6b4);
  g.set(17, 3, 0xb89a58);
  g.outline(OUT);
  for (let x = 3; x < W - 3; x++) if (!g.filled(x, H - 1)) g.set(x, H - 1, SH, 56);
  return padGrid(g);
}

/**
 * 11/26 3단계 4인 밥상 (2단계 소반의 큰 판): 뒤 의자 둘(앞을 보고) + 앞 의자 둘(상을 보고), 상과 의자 사이 3px 띄움.
 * 좌석 (그림 기준 — 빈 칸 포함): 뒤 x 13·27 y 8 · 앞 x 13·27 y 28. 상은 y 12~23
 */
export const BAPSANG4 = { w: 40, h: 34, seats: [{ x: 13, y: 8 }, { x: 27, y: 8 }, { x: 13, y: 28 }, { x: 27, y: 28 }] } as const;
export function bapsang4Art(): Grid {
  const RAW = 36;
  const g = new Grid(RAW, BAPSANG4.h);
  const stool = (cx: number, by: number) => {
    g.rect(cx - 3, by - 6, 7, 3, WOOD.hi);
    g.hline(cx - 3, cx + 3, by - 6, lighten(WOOD.hi, 0.18));
    g.rect(cx - 3, by - 3, 7, 1, WOOD.lo);
    g.vline(cx - 2, by - 2, by, WOOD.lo);
    g.vline(cx + 2, by - 2, by, WOOD.lo);
  };
  // 뒤 의자 (상 뒤로 반쯤 가린다)
  stool(11, 10);
  stool(25, 10);
  // 상 (소반보다 넓게 — 30)
  g.rect(3, 12, 30, 8, WOOD.mid);
  g.hline(3, 32, 12, WOOD.hi);
  for (let x = 3; x < 33; x += 6) g.vline(x, 13, 19, mix(WOOD.mid, WOOD.lo, 0.5));
  g.rect(3, 20, 30, 2, WOOD.lo);
  for (const x of [4, 30]) g.rect(x, 22, 2, 2, WOOD.line);
  // 찌개 냄비 + 밥그릇 넷 + 반찬
  g.ellipse(18, 15.5, 4, 2.4, 0x9a9ea4);
  g.ellipse(18, 15, 3, 1.6, 0xd8603a);
  g.set(17, 14, 0xf0a060);
  for (const [x, y] of [[7, 14], [26, 14], [7, 17], [26, 17]] as const) {
    g.rect(x, y, 3, 2, 0xc8c4bc);
    g.hline(x, x + 2, y, 0xfaf6ec);
  }
  for (const [x, y, c] of [[12, 18, 0x7aa848], [22, 18, 0xd85a3a]] as const) g.rect(x, y, 2, 1, c);
  // 앞 의자 (상 앞 3px 띄워서)
  stool(11, 31);
  stool(25, 31);
  g.outline(OUT);
  for (let x = 2; x < RAW - 2; x++) if (!g.filled(x, BAPSANG4.h - 1)) g.set(x, BAPSANG4.h - 1, SH, 50);
  return padGrid(g, { x: (BAPSANG4.w - RAW) / 2, top: 0 });
}

/** 장독대: 돌 단 위 옹기 (뒤 큰 독 · 앞 작은 항아리) */
export function jangdokArt(big: number, small: number): Grid {
  const W = Math.max(big * 11, small * 8) + 8;
  const H = 30;
  const g = new Grid(W, H);
  // 돌 단
  for (let y = 20; y < 27; y++)
    for (let x = 1; x < W - 1; x++) g.set(x, y, y === 20 ? STONE.hi : y < 24 ? ((x + (y > 21 ? 3 : 0)) % 7 === 0 ? STONE.line : STONE.mid) : (x % 6 === 0 ? STONE.line : STONE.lo));
  for (let y = 18; y < 21; y++) for (let x = 2; x < W - 2; x++) g.set(x, y, 0xc8c0ae);
  const jar = (cx: number, by: number, rx: number, ry: number, lidUp: boolean) => onggi(g, cx, by, rx, ry, lidUp);
  for (let i = 0; i < big; i++) jar(6 + i * 11 + 3, 20, 5.2, 6.4 - (i % 2) * 0.6, i % 2 === 1);
  for (let i = 0; i < small; i++) jar(7 + i * 8 + (W - 8 - small * 8) / 2, 25, 3.4, 4, i % 2 === 0);
  g.outline(OUT);
  for (let x = 2; x < W - 2; x++) if (!g.filled(x, H - 2)) g.set(x, H - 2, SH, 56);
  // 11/26 돌 단이 캔버스 양 끝 열에 닿아 잘렸다
  return padGrid(g);
}

/** 빨랫줄 (나무 장대 둘 + 늘어진 줄 + 빨래: 수건 · 몸빼 · 셔츠 · 양말) */
export function clotheslineArt(len: number, xmas: boolean): Grid {
  const W = len + 6;
  const H = 32;
  const g = new Grid(W, H);
  for (const x of [2, W - 4]) {
    g.rect(x, 3, 2, H - 5, WOOD.lo);
    g.vline(x, 3, H - 3, WOOD.mid);
    g.hline(x - 1, x + 2, 3, WOOD.lo);
  }
  const lineY = (x: number) => 5 + Math.round(Math.sin(((x - 3) / (W - 6)) * Math.PI) * 2.5);
  for (let x = 3; x < W - 3; x++) g.set(x, lineY(x), 0xe8e4dc);
  type Item = { w: number; h: number; draw: (x: number, y: number) => void };
  const towel = (c: Color, stripe: Color): Item => ({
    w: 6,
    h: 9,
    draw: (x, y) => {
      g.rect(x, y, 6, 9, c);
      g.vline(x, y, y + 8, lighten(c, 0.2));
      g.hline(x, x + 5, y + 6, stripe);
      g.hline(x, x + 5, y + 8, darken(c, 0.15));
    },
  });
  const pants: Item = {
    w: 8,
    h: 12,
    draw: (x, y) => {
      g.rect(x, y, 8, 5, 0xc84a5a);
      g.rect(x, y + 5, 3, 7, 0xc84a5a);
      g.rect(x + 5, y + 5, 3, 7, 0xc84a5a);
      g.hline(x, x + 7, y, 0x8a2a3a);
      for (let yy = y + 1; yy < y + 12; yy++) for (let xx = x; xx < x + 8; xx++) if (g.get(xx, yy) >>> 8 === 0xc84a5a && (xx + yy * 2) % 4 === 0) g.set(xx, yy, yy % 2 ? 0xf2d868 : 0xf6f0e8);
    },
  };
  const shirt = (c: Color): Item => ({
    w: 10,
    h: 9,
    draw: (x, y) => {
      g.rect(x, y, 10, 3, c);
      g.rect(x + 2, y + 3, 6, 6, c);
      g.vline(x + 5, y + 1, y + 8, darken(c, 0.2));
      g.hline(x, x + 9, y, lighten(c, 0.2));
    },
  });
  const socks = (c: Color): Item => ({
    w: 5,
    h: 6,
    draw: (x, y) => {
      g.rect(x, y, 2, 5, c);
      g.rect(x + 3, y, 2, 5, c);
      g.set(x + 2, y + 4, c);
      g.set(x + 5, y + 4, c);
    },
  });
  const items: Item[] = [towel(0xf4f2ec, 0x6a8ad0), pants, shirt(0x6aa0d8), towel(0xf2d868, 0xe08a4a), xmas ? socks(0xd83a3a) : socks(0xf4f2ec)];
  const total = items.reduce((s, it) => s + it.w, 0);
  const gap = Math.max(1, Math.floor((len - 4 - total) / (items.length + 1)));
  let x = 4 + gap;
  for (const it of items) {
    if (x + it.w > W - 4) break;
    const y = lineY(x + Math.floor(it.w / 2)) + 1;
    it.draw(x, y);
    g.set(x + 1, y - 1, 0xd8b070);
    g.set(x + it.w - 2, y - 1, 0xd8b070);
    x += it.w + gap;
  }
  g.outline(OUT);
  for (const px of [3, W - 3]) shadow(g, px, H - 2, 3, 1, 56);
  for (let xx = 6; xx < W - 6; xx++) if (!g.filled(xx, H - 2) && hash2(xx, 0, 873) < 0.5) g.set(xx, H - 2, SH, 26);
  return g;
}

/**
 * 감나무 (울퉁불퉁 검은 줄기 + 가지). 가을(기본판) = 붉은 잎 사이 주황 감이 주렁주렁,
 * 겨울 = 잎 없는 가지 끝에 까치밥 몇 알 + 까치 한 마리.
 */
export function persimmonTreeArt(bare: boolean, big: boolean, seed: number): Grid {
  // 11/26 가지 끝 잎 덩이가 캔버스 양옆에서 잘렸다 → 좌우 12·위 4 넓혀 그린다 (줄기는 가운데 · 바닥 가운데 원점이라 자리는 그대로)
  const W = (big ? 52 : 42) + 24;
  const H = (big ? 60 : 50) + 4;
  const g = new Grid(W, H);
  const r = rng(881 + seed);
  const base = { x: Math.round(W / 2), y: H - 4 };
  const fork = { x: base.x + (big ? -1 : 1), y: H - (big ? 22 : 18) };
  // 줄기
  for (let i = 0; i <= base.y - fork.y; i++) {
    const t = i / (base.y - fork.y);
    const x = Math.round(base.x + (fork.x - base.x) * t + Math.sin(t * 3) * 1.2);
    const y = base.y - i;
    const w = big ? (t < 0.3 ? 5 : 4) : t < 0.3 ? 4 : 3;
    for (let k = 0; k < w; k++) g.set(x - 1 + k, y, k === 0 ? BARK.hi : k === w - 1 ? BARK.lo : BARK.mid);
  }
  g.set(base.x - 2, base.y, BARK.lo);
  g.set(base.x + 3, base.y, BARK.lo);
  // 가지
  const tips: Pt[] = [];
  const mids: Pt[] = [];
  const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    line(g, Math.round(x), Math.round(y), Math.round(x1), Math.round(y1), depth === 0 ? BARK.mid : BARK.lo, depth === 0 ? 2 : 1);
    mids.push({ x: Math.round((x + x1) / 2), y: Math.round((y + y1) / 2) });
    if (depth >= 2) {
      tips.push({ x: Math.round(x1), y: Math.round(y1) });
      return;
    }
    const n = depth === 0 ? 2 : 2;
    for (let i = 0; i < n; i++) branch(x1, y1, ang + (i === 0 ? -1 : 1) * (0.35 + r() * 0.35), len * (0.55 + r() * 0.15), depth + 1);
  };
  const L0 = big ? 13 : 10;
  for (const a of [-2.45, -1.95, -1.45, -0.95]) branch(fork.x, fork.y, a + (r() - 0.5) * 0.15, L0 + r() * 3, 0);
  const fruit = (x: number, y: number) => {
    g.hline(x - 1, x + 1, y - 1, PERS.mid);
    g.hline(x - 1, x + 1, y, PERS.mid);
    g.hline(x - 1, x + 1, y + 1, PERS.lo);
    g.set(x - 1, y - 1, PERS.hi);
    g.set(x, y - 2, PERS.calyx);
  };
  if (!bare) {
    // 잎 덩이 (가지 끝마다 · 듬성듬성 빈틈)
    const blobs = [...tips, ...mids.filter((_, i) => i % 3 === 0)];
    for (const b of blobs) {
      const rx = 4 + r() * 2.5;
      const ry = 3 + r() * 2;
      for (let y = Math.floor(b.y - ry); y <= Math.ceil(b.y + ry); y++)
        for (let x = Math.floor(b.x - rx); x <= Math.ceil(b.x + rx); x++) {
          const dx = (x + 0.5 - b.x) / rx;
          const dy = (y + 0.5 - b.y) / ry;
          const d = dx * dx + dy * dy;
          if (d > 1 || hash2(x, y, 883 + seed) < 0.16 + d * 0.25) continue;
          const lightSide = dx + dy < -0.4;
          const c = lightSide ? AUTUMN[2] : dy > 0.4 ? AUTUMN[4] : AUTUMN[Math.floor(hash2(x, y, 885) * 3) % 2];
          g.set(x, y, c);
        }
    }
    const nf = big ? 22 : 14;
    for (let i = 0; i < nf; i++) {
      const b = blobs[Math.floor(r() * blobs.length)];
      fruit(Math.round(b.x + (r() - 0.5) * 8), Math.round(b.y + (r() - 0.3) * 6));
    }
  } else {
    // 까치밥 몇 알 + 까치
    const picks = [0, 3, 5, 8].map((i) => tips[i % tips.length]);
    for (const p of picks) fruit(p.x, p.y + 2);
    const m = tips[Math.min(tips.length - 1, 6)];
    const mx = m.x - 1;
    const my = m.y - 1;
    g.rect(mx - 2, my - 2, 5, 3, 0x1e2026);
    g.set(mx - 3, my - 3, 0x1e2026);
    g.set(mx - 4, my - 3, 0x1e2026);
    g.set(mx - 5, my - 3, 0x3a4a7a);
    g.set(mx - 3, my - 2, 0x1e2026);
    g.rect(mx - 1, my - 1, 3, 1, 0xf2f2ee);
    g.set(mx + 2, my - 2, 0x1e2026);
    g.set(mx + 3, my - 2, 0x3a3a3a);
    g.set(mx + 2, my - 3, 0x1e2026);
    g.set(mx + 1, my - 1, 0x2a3a6a);
  }
  g.outline(OUT);
  shadow(g, base.x, H - 2, big ? 14 : 11, 2, 52);
  return g;
}

/** 텃밭 (나무 테두리 + 이랑: 배추 · 파 — 겨울엔 눈 덮인 이랑 · 짚 묶은 배추) */
export function gardenArt(w: number, h: number, snowy: boolean): Grid {
  const g = new Grid(w, h);
  for (let y = 1; y < h - 2; y++)
    for (let x = 1; x < w - 1; x++) {
      const row = (y - 2) % 6;
      const ridge = row >= 0 && row < 4;
      let c: Color;
      if (!snowy) c = ridge ? (row === 0 ? 0x9a7650 : 0x86643e) : 0x5e4430;
      else c = ridge ? (row === 0 ? SNOW.hi : row < 3 ? SNOW.mid : SNOW.lo) : SNOW.shade;
      g.set(x, y, c);
    }
  // 테두리 (나무 판)
  frame(g, 0, 0, w, h - 1, WOOD.lo);
  g.hline(0, w - 1, 0, WOOD.hi);
  for (let ry = 2, k = 0; ry < h - 4; ry += 6, k++)
    for (let x = 4 + (k % 2) * 3; x < w - 3; x += 7) {
      if (!snowy) {
        if (k % 2 === 0) {
          g.ellipse(x, ry + 1.5, 2.8, 2.2, 0x6aa848);
          g.ellipse(x - 0.5, ry + 1, 1.6, 1.3, 0xb8e08a);
          g.set(x, ry + 3, 0x3a7a2a);
        } else
          for (let j = -1; j <= 1; j++) {
            g.vline(x + j * 2, ry - 2, ry + 2, 0x5a9a3a);
            g.set(x + j * 2, ry - 2, 0x9ad070);
          }
      } else {
        g.rect(x - 1, ry - 1, 3, 4, 0xd8c080);
        g.hline(x - 1, x + 1, ry - 1, SNOW.hi);
        g.set(x, ry + 1, 0xb89a58);
        g.set(x + 1, ry - 2, 0x5a8a3a);
      }
    }
  g.outline(OUT);
  for (let x = 1; x < w - 1; x++) if (!g.filled(x, h - 1)) g.set(x, h - 1, SH, 50);
  return g;
}

/** 펜션 데크 4인 식탁 (뒤 의자 둘 · 앞 의자 둘, 컵·접시·작은 꽃병) */
export function diningSetArt(color: number): Grid {
  const g = new Grid(32, 26);
  const C = [0xd8786a, 0x7ec4b0, 0xe8c070, 0x8aa8d8][color % 4];
  // 11/26 등받이 윗줄이 캔버스 윗줄(윤곽)에 닿아 잘렸다 → 등받이를 두 줄 낮춘다 (그림 크기·층 나누는 줄 8·21은 그대로 — campHousingPlan 식탁 crop)
  const chairBack = (x: number) => {
    g.rect(x, 3, 6, 3, WOOD.mid);
    for (let xx = x + 1; xx < x + 6; xx += 2) g.vline(xx, 4, 4, WOOD.lo);
    g.hline(x, x + 5, 3, WOOD.hi);
    g.rect(x, 6, 6, 3, C);
    g.hline(x, x + 5, 6, lighten(C, 0.25));
  };
  chairBack(6);
  chairBack(20);
  g.rect(3, 8, 26, 8, WOOD.hi);
  g.hline(3, 28, 8, lighten(WOOD.hi, 0.2));
  g.rect(3, 16, 26, 2, WOOD.lo);
  for (const x of [4, 27]) g.vline(x, 18, 21, WOOD.line);
  for (const [x, y] of [[8, 10], [22, 10]] as const) {
    g.rect(x, y, 3, 2, 0xf6f2ea);
    g.set(x + 1, y, 0xd8a840);
  }
  g.rect(15, 9, 2, 3, 0x6a9ad0);
  g.set(15, 8, 0xe85a6a);
  g.set(16, 8, 0xf2c444);
  g.set(12, 13, 0xf6f2ea);
  g.set(19, 13, 0xf6f2ea);
  for (const x of [6, 20]) {
    g.rect(x, 18, 6, 3, C);
    g.rect(x, 21, 6, 3, WOOD.mid);
    g.hline(x, x + 5, 21, WOOD.hi);
    g.vline(x, 24, 24, WOOD.lo);
    g.vline(x + 5, 24, 24, WOOD.lo);
  }
  g.outline(OUT);
  shadow(g, 16, 24.5, 14, 1.2, 50);
  return g;
}

/** 온수 스파 (둥근 나무 욕조 · 쇠 테 · 청록 물 · 거품 · 옆 계단) — 김은 장면이 피운다 */
/** 11/26 오른쪽 계단이 캔버스 끝 열에 닿아 잘렸다 — 그림은 32×26에 그리고 둘레에 빈 칸 (SPA는 빈 칸까지 넣은 크기·물 자리) */
const SPA_RAW = { w: 32, h: 26 } as const;
const SPA_PAD = { x: 2, top: 2 } as const;
export const SPA = { w: SPA_RAW.w + 2 * SPA_PAD.x, h: SPA_RAW.h + SPA_PAD.top, water: { x: 15 + SPA_PAD.x, y: 10 + SPA_PAD.top } } as const;

export function spaArt(lit: boolean): Grid {
  const g = new Grid(SPA_RAW.w, SPA_RAW.h);
  // 옆면 (통 판자 + 쇠 테)
  for (let y = 10; y < 21; y++)
    for (let x = 2; x < 29; x++) {
      const dx = (x + 0.5 - 15.5) / 13.5;
      if (Math.abs(dx) > 1) continue;
      const bottom = 19 + Math.round(Math.sqrt(1 - dx * dx) * 1.5);
      if (y > bottom) continue;
      let c: Color = x % 3 === 0 ? WOOD.lo : dx < -0.5 ? WOOD.hi : WOOD.mid;
      if (y === 13 || y === 18) c = 0x4a4a52;
      g.set(x, y, c);
    }
  // 테 (윗면 링)
  g.ellipse(15.5, 10, 13.5, 6.5, WOOD.hi);
  g.ellipse(15.5, 10, 12.5, 5.6, WOOD.lo);
  // 물
  g.ellipse(15.5, 10, 11, 4.6, lit ? 0x6ad8e0 : 0x5ac0cc);
  g.ellipse(14, 9, 7, 2.6, lit ? 0x9af0f2 : 0x86dce2);
  for (const [x, y] of [[10, 9], [18, 11], [21, 8], [13, 12], [16, 7]] as const) g.set(x, y, 0xf2fcfc);
  // 계단
  g.rect(25, 17, 6, 3, WOOD.hi);
  g.rect(25, 20, 6, 2, WOOD.lo);
  g.outline(OUT);
  shadow(g, 16, 23, 14, 1.5, 56);
  return padGrid(g, SPA_PAD);
}

/** 정자 (돌 주춧돌 · 나무 마루 + 계자난간 · 기둥 넷 · 팔작 기와지붕 · 청사초롱) — 마루에 방석 넷 */
export const PAVILION = { w: 58, h: 58, lantern: { x: 50, y: 34 }, seats: [{ x: 16, y: 46 }, { x: 42, y: 46 }, { x: 22, y: 40 }, { x: 36, y: 40 }] } as const;

export function pavilionArt(lit: boolean, xmas: boolean): Grid {
  const { w: W, h: H } = PAVILION;
  const g = new Grid(W, H);
  const mid = (W - 1) / 2;
  // 주춧돌 · 마루
  for (const x of [8, 26, 46]) g.rect(x, 50, 5, 3, STONE.mid);
  for (let y = 36; y < 46; y++) for (let x = 6; x < W - 6; x++) g.set(x, y, (x - 6) % 5 === 4 ? DECK.line : y === 36 ? DECK.hi : DECK.mid);
  g.rect(6, 46, W - 12, 4, DECK.lo);
  g.hline(6, W - 7, 46, darken(DECK.lo, 0.1));
  // 방석 (마루 위)
  PAVILION.seats.forEach((s, i) => {
    const C = CUSHION[i % 4];
    g.rect(s.x - 4, s.y - 6, 9, 6, C.trim);
    g.rect(s.x - 3, s.y - 5, 7, 4, C.mid);
    g.hline(s.x - 3, s.x + 2, s.y - 5, C.hi);
  });
  // 가운데 작은 차상
  g.rect(25, 39, 9, 4, TIMBER.mid);
  g.hline(25, 33, 39, TIMBER.hi);
  g.set(27, 38, 0xf6f2ea);
  g.set(31, 38, 0xf6f2ea);
  // 기둥 (앞 둘 · 뒤 둘)
  for (const x of [9, W - 12]) {
    g.rect(x, 22, 3, 28, TIMBER.mid);
    g.vline(x, 22, 49, TIMBER.hi);
    g.vline(x + 2, 22, 49, TIMBER.lo);
  }
  // 계자난간 (양옆, 가운데 들어가는 자리 비움)
  for (const [x0, x1] of [
    [7, 20],
    [W - 21, W - 8],
  ]) {
    g.hline(x0, x1, 33, TIMBER.hi);
    g.hline(x0, x1, 34, TIMBER.mid);
    for (let x = x0; x <= x1; x += 3) g.vline(x, 35, 37, TIMBER.lo);
  }
  // 돌계단
  g.rect(mid - 6, 50, 13, 3, STONE.hi);
  g.hline(mid - 6, mid + 6, 52, STONE.lo);
  // 지붕. 11/26 처마 끝이 캔버스 끝 열(윤곽)에 닿아 눈판에서 잘려 보였다 → 양쪽 한 칸씩 안으로 (끝 열은 비운다)
  const rx0 = 2;
  const rx1 = W - 3;
  const half = (rx1 - rx0) / 2;
  const ridgeHalf = half - 12;
  const ridge = 7;
  const eave = 24;
  const bot = new Array<number>(W).fill(0);
  const top = new Array<number>(W).fill(0);
  for (let x = rx0; x <= rx1; x++) {
    const t = (x - mid) / half;
    const d = Math.max(0, Math.abs(x - mid) - ridgeHalf);
    top[x] = ridge + Math.round(d * 1.1);
    bot[x] = eave - Math.round(3.4 * Math.abs(t) ** 3);
    for (let y = top[x]; y <= bot[x]; y++) {
      const col = (x - rx0) % 4;
      let c: Color = col === 0 ? GIWA.lo : col === 1 ? GIWA.hi : GIWA.mid;
      if ((y - ridge) % 5 === 4 && col !== 1) c = darken(c, 0.12);
      if (d > 0) c = darken(c, 0.14);
      if (y >= bot[x] - 1) c = col === 1 || col === 2 ? GIWA.end : GIWA.dark;
      g.set(x, y, c);
    }
  }
  for (let x = rx0; x <= rx1; x++) {
    const d = Math.abs(x - mid) - ridgeHalf;
    if (d <= 0) {
      g.set(x, top[x] - 2, GIWA.ridge);
      g.set(x, top[x] - 1, 0xd8d2c4);
      g.set(x, top[x], GIWA.ridge);
    } else if (d < 12) g.set(x, top[x] - 1, GIWA.ridge);
  }
  for (const s of [-1, 1]) {
    const x = Math.round(mid + s * ridgeHalf);
    g.rect(x - 1, top[x] - 4, 3, 3, GIWA.ridge);
  }
  // 처마 그늘 (마루 위)
  for (let x = 7; x < W - 7; x++) for (let y = 25; y < 29; y++) if (!g.filled(x, y)) g.set(x, y, SH, 70);
  // 단청 띠 (처마 밑 초록·빨강)
  for (let x = 8; x < W - 8; x++) g.set(x, bot[x] + 1, x % 4 < 2 ? 0x3a8a6a : 0xb84a3a);
  // 청사초롱 (오른쪽 처마 끝)
  const L = PAVILION.lantern;
  g.vline(L.x, bot[L.x] + 1, L.y - 3, 0x3a3030);
  g.rect(L.x - 1, L.y - 2, 3, 2, lit ? 0x7ab0ff : 0x3a5aa0);
  g.rect(L.x - 1, L.y, 3, 3, lit ? 0xffa088 : 0xc83a3a);
  g.set(L.x, L.y + 3, 0xd8b040);
  if (xmas) {
    for (let x = rx0 + 2; x < rx1 - 1; x++) {
      const y = bot[x] + 1;
      if ((x - rx0) % 5 === 2) g.set(x, y + 1, XMAS[((x - rx0) / 5) % 5 | 0]);
    }
    wreath(g, 10, 29);
  }
  g.outline(OUT);
  shadow(g, mid, H - 3, half - 4, 1.8, 56);
  return g;
}

/** 화톳불 (둥근 돌 테 + 엇갈린 장작 + 숯불) — 불꽃은 장면이 얹는다 */
export function firePitArt(lit: boolean): Grid {
  const g = new Grid(22, 14);
  g.ellipse(11, 8, 9.5, 5, STONE.lo);
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const x = 11 + Math.cos(ang) * 8;
    const y = 8 + Math.sin(ang) * 4.2;
    g.ellipse(x, y, 1.8, 1.4, Math.sin(ang) < 0 ? STONE.mid : STONE.hi);
  }
  g.ellipse(11, 8, 6, 2.8, 0x2a2220);
  line(g, 7, 9, 15, 7, 0x6a4a2e);
  line(g, 7, 7, 15, 9, 0x5a3e26);
  if (lit) for (const [x, y] of [[9, 8], [12, 9], [13, 7], [10, 7]] as const) g.set(x, y, hash2(x, y, 891) < 0.5 ? 0xffb040 : 0xff7a2a);
  g.outline(OUT);
  shadow(g, 11, 12.5, 9, 1.2, 56);
  // 11/26 돌 테 아래·양옆이 캔버스 끝에 닿아 잘렸다 — 아래도 1 (1px 올라간다)
  return padGrid(g, { bottom: 1 });
}
