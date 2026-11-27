// 11/27 좌대 매표소 (옛 「미끼·대여」 부스 자리·크기 그대로 — world/forage/art.ts가 FTEX.campStall로 올린다). 52×48 · 받침 = 맨 아래 가운데 · 아래 두 줄 그림자.
// 크림 칠한 판자 벽 + 빨강·크림 줄무늬 차양, 왼쪽 매표 창(표 나오는 구멍에 표 한 장), 오른쪽 좌대 현황판(1~6 번호 + 등),
// 창 옆 판매대에 표 두루마리, 오른쪽 낚싯대 걸이. 밤엔 창·등 불빛. 시안: ~/Desktop/목요일작업/좌대시안 (scratchpad jwadaemock/art/booth.ts 그대로)
// 현황판 등(빈 좌대 초록 · 입장 중 빨강)과 창 안 매표소 직원은 장면이 그 위에 덧그린다 (game/camp/CampRafts — 실시간 좌대 주인 표로).
import type { MapConcept } from "@/lib/mapConcept";
import { darken, Grid, lighten, type Color } from "../sprites/pixel";
import { snowRoof } from "../sprites/winterArt";
import { seasonHolly } from "../sprites/npcSeasonArt";

const OUT = 0x16121a;
export const BOOTH_W = 52;
export const BOOTH_H = 48;
/** 3×5 숫자 (좌대 번호판과 같은 글꼴 — valleyExtraArt RAFT_DIGITS) */
const DIG: readonly string[] = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111"];
/** 좌대 현황 (true = 빈 좌대 초록, false = 입장 중 빨강) */
export type Lamps = readonly boolean[];
export const LAMPS_DEFAULT: Lamps = [true, true, true, true, true, true];
/** 매표 창 (그림 x·y·폭·높이) — 창 안(직원·유리)은 raftClerkWindow가 덧그린다 */
export const BOOTH_WINDOW = { x: 8, y: 21, w: 13, h: 12 } as const;
/** 현황판 등 (n번 좌대 = i + 1, 그림 x·y = 2×2 등의 왼쪽 위) */
export const BOOTH_LAMPS: readonly { x: number; y: number }[] = Array.from({ length: 6 }, (_, i) => ({ x: 23 + 2 + (i < 3 ? 0 : 1) * 7 + 4, y: 19 + 6 + (i % 3) * 6 + 1 }));
/** 등 색 [밝은 칸, 그늘 칸] — free = 빈 좌대, lit = 밤 */
export function lampColors(free: boolean, lit: boolean): { c: Color; lo: Color; hi: Color } {
  const c = free ? (lit ? 0x8affa0 : 0x4ad86a) : lit ? 0xff7a6a : 0xe0403a;
  const lo = free ? (lit ? 0x4ad86a : 0x2a9a4a) : lit ? 0xe0403a : 0x9a2a28;
  return { c, lo, hi: lit ? lighten(c, 0.4) : c };
}
/** 등 하나 2×2 그림 */
export function lampArt(free: boolean, lit: boolean): Grid {
  const g = new Grid(2, 2);
  const k = lampColors(free, lit);
  g.set(0, 0, k.c);
  g.set(1, 0, k.hi);
  g.set(0, 1, k.lo);
  g.set(1, 1, k.c);
  return g;
}

function stallShadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x3e4060, Math.min(150, Math.round(a * (1 - (dx * dx + dy * dy) * 0.5))));
    }
}

/** 지붕 색 (겨울 눈 덮기 대상) */
const ROOF = [0x5e8a6a, 0x467258, 0x365c46, 0x264434] as const;
/** 차양 줄무늬 */
const AWN_R = 0xd8483c;
const AWN_RL = 0xa83430;
const AWN_W = 0xf6eedc;
const AWN_WL = 0xd8ccb4;
/** 판자 벽 (크림 칠) */
const WALL = { hi: 0xf2e4c4, mid: 0xe2cfa4, lo: 0xc4ae82, seam: 0xa89068 } as const;
const TRIM = 0x6a4a30;
const TRIM_LO = 0x4e3420;
const LOG = { hi: 0xb07c4c, mid: 0x8e5e36, lo: 0x6c4426 } as const;

export function jwadaeBooth(concept: MapConcept = "default", lit = false, lamps: Lamps = LAMPS_DEFAULT): HTMLCanvasElement {
  const W = BOOTH_W;
  const H = BOOTH_H;
  const g = new Grid(W, H);
  const base = H - 3;
  // ── 판자 벽 (가로 판자 3줄마다 이음새, 아래 허리판은 짙은 나무)
  const wx0 = 5;
  const wx1 = 38;
  const wy0 = 18;
  for (let y = wy0; y <= base - 4; y++)
    for (let x = wx0; x <= wx1; x++) {
      const k = (y - wy0) % 3;
      let c: Color = k === 2 ? WALL.lo : k === 0 ? WALL.hi : WALL.mid;
      if (y >= base - 8) c = y === base - 8 ? TRIM : k === 2 ? LOG.lo : LOG.mid; // 허리판
      if (x >= wx1 - 1) c = darken(c, 0.12);
      g.set(x, y, c);
    }
  // 모서리 기둥 (짙은 나무)
  for (let y = wy0; y <= base - 4; y++) {
    g.set(wx0, y, TRIM);
    g.set(wx1, y, TRIM_LO);
  }
  // 받침돌
  g.hline(wx0, wx1, base - 3, 0x6a6e74);
  g.hline(wx0, wx1, base - 2, 0x56595e);

  // ── 매표 창 (짙은 틀 + 유리 안 불빛 + 말하는 구멍 + 아래 표 나오는 구멍)
  const wx = 8;
  const wy = 21;
  const ww = 13;
  const wh = 12;
  const glass = lit ? 0xffdc8e : 0xb8d8e0;
  const glassHi = lit ? 0xfff2c8 : 0xe2f2f6;
  const glassLo = lit ? 0xf0b85e : 0x8ab4c4;
  g.rect(wx - 1, wy - 1, ww + 2, wh + 2, TRIM_LO);
  g.rect(wx, wy, ww, wh, glass);
  // 위 아치 (모서리 둥글게)
  g.set(wx, wy, TRIM_LO);
  g.set(wx + ww - 1, wy, TRIM_LO);
  // 유리 반사 (왼쪽 위 사선) · 아래 그늘
  for (let k = 0; k < 4; k++) g.set(wx + 1 + k, wy + 4 - k, glassHi);
  g.hline(wx, wx + ww - 1, wy + wh - 1, glassLo);
  // 안쪽: 매표원 자리 선반 + 걸린 표 다발 (밤엔 그림자 실루엣)
  g.hline(wx, wx + ww - 1, wy + 7, lit ? 0xd89a4a : 0x7a9aa8);
  g.rect(wx + 8, wy + 3, 3, 4, lit ? 0xc87a3a : 0x6a8a98);
  // 말하는 구멍 (가운데 둥근 점 무리)
  for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]] as const) g.set(wx + 5 + dx, wy + 2 + dy, lit ? 0x8a5a2a : 0x4a6a78);
  // 창살 가운데 세로
  // 표 나오는 구멍 (창 아래 짙은 틈 + 반쯤 나온 표 한 장)
  g.hline(wx + 3, wx + 9, wy + wh, 0x1e1612);
  g.rect(wx + 5, wy + wh, 3, 2, 0xfff4d0);
  g.set(wx + 5, wy + wh + 1, 0xd84a3a);
  g.set(wx + 7, wy + wh, 0xe8d8b0);
  // 판매대 (창 아래 널빤지 — 표가 그 위로)
  g.rect(6, wy + wh + 2, 17, 2, 0xc89a62);
  g.hline(6, 22, wy + wh + 2, 0xe0b880);
  g.set(7, wy + wh + 4, 0x8a6a42);
  g.set(21, wy + wh + 4, 0x8a6a42);
  // 표 두루마리 (판매대 오른쪽: 빨간 걸이 + 크림 두루마리, 표 줄이 판매대 앞으로 늘어진다 — 절취선 점)
  const tx = 18;
  const ty = wy + wh - 1;
  g.rect(tx, ty - 1, 4, 3, 0xc83a34);
  g.hline(tx, tx + 3, ty - 1, 0xe8604e);
  g.set(tx + 1, ty, 0xfff4d0);
  g.set(tx + 2, ty, 0xf2e0b0);
  g.set(tx + 1, ty + 1, 0xe8d0a0);
  for (let y = ty + 2; y <= wy + wh + 6; y++) {
    g.set(tx + 1, y, (y - ty) % 3 === 0 ? 0xc8b48a : 0xfff4d0);
    g.set(tx + 2, y, (y - ty) % 3 === 0 ? 0xb8a47a : 0xf2e0b0);
  }

  // ── 좌대 현황판 (짙은 초록 칠판: 위 크림 머리판, 2열×3줄 = 번호 + 등)
  const bx0 = 23;
  const bx1 = 38;
  const by0 = 19;
  const by1 = 40;
  g.rect(bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1, TRIM_LO);
  g.rect(bx0 + 1, by0 + 1, bx1 - bx0 - 1, by1 - by0 - 1, 0x2a4a3c);
  // 머리판 (크림 + 빨간 표 그림)
  g.rect(bx0 + 1, by0 + 1, bx1 - bx0 - 1, 3, 0xf2e6c8);
  g.hline(bx0 + 1, bx1 - 1, by0 + 3, 0xd8c8a4);
  g.rect(bx0 + 5, by0 + 2, 6, 1, 0xd84a3a);
  g.set(bx0 + 7, by0 + 2, 0xf2e6c8);
  for (let i = 0; i < 6; i++) {
    const col = i < 3 ? 0 : 1;
    const r = i % 3;
    const dx = bx0 + 2 + col * 7;
    const dy = by0 + 6 + r * 6;
    const bits = DIG[i + 1];
    for (let k = 0; k < 15; k++) if (bits[k] === "1") g.set(dx + (k % 3), dy + Math.floor(k / 3), 0xf2ecd8);
    // 등 (2×2): 빈 좌대 = 초록, 입장 중 = 빨강. 밤엔 더 밝게
    g.draw(lampArt(lamps[i] ?? true, lit), dx + 4, dy + 1);
  }
  // 칸 사이 분필 선
  g.vline(bx0 + 8, by0 + 5, by1 - 2, 0x3e6050);

  // ── 지붕 (짙은 초록 함석 — 골 무늬) + 줄무늬 차양
  for (let y = 5; y <= 14; y++) {
    const inset = Math.max(0, Math.round((8 - y) * 0.9));
    const x0 = 3 + inset;
    const x1 = 40 - inset;
    for (let x = x0; x <= x1; x++) {
      const k = y === 5 + 0 ? 0 : y >= 13 ? 3 : (x + 40) % 3 === 0 ? 2 : y < 8 ? 0 : 1;
      g.set(x, y, ROOF[k]);
    }
  }
  // (지붕 위 장식판은 뺐다 — 장면이 그리는 「좌대 매표소」 글자가 그림 위 끝에 얹힌다)
  // 차양 (빨강·크림 세로 줄, 아래는 반달 물결)
  for (let y = 15; y <= 17; y++)
    for (let x = 2; x <= 41; x++) {
      const red = Math.floor((x - 2) / 3) % 2 === 0;
      g.set(x, y, y === 15 ? (red ? 0xe86a5a : 0xfffaf0) : red ? (x >= 40 ? AWN_RL : AWN_R) : x >= 40 ? AWN_WL : AWN_W);
    }
  for (let x = 2; x <= 41; x++) {
    const k = (x - 2) % 3;
    if (k === 1) g.set(x, 18, Math.floor((x - 2) / 3) % 2 === 0 ? AWN_RL : AWN_WL);
  }
  // 밤 등 (차양 밑 작은 갓등 — 창 위)
  g.set(14, 19, 0x3a3a40);
  g.set(14, 20, lit ? 0xfff0b0 : 0xd8d0b0);
  g.set(13, 20, 0x3a3a40);
  g.set(15, 20, 0x3a3a40);

  // ── 대여 낚싯대 걸이 (오른쪽 — 원래 부스와 같다)
  const rx = 40;
  g.rect(rx, 18, 10, base - 18 + 1, LOG.lo);
  g.vline(rx, 18, base, darken(LOG.lo, 0.15));
  g.hline(rx, rx + 9, 18, LOG.mid);
  g.hline(rx, rx + 9, base - 7, LOG.mid);
  g.hline(rx, rx + 9, base - 6, LOG.hi);
  const rods: [number, Color, number][] = [
    [rx + 2, 0xe0503c, 10],
    [rx + 5, 0xf0c040, 14],
    [rx + 8, 0x4f9a88, 10],
  ];
  for (const [x, c, tip] of rods) {
    for (let y = 19; y <= base - 8; y++) g.set(x, y, (y + x) % 5 === 0 ? 0x8a6a42 : 0xc8a060);
    for (let y = tip + 2; y <= 17; y++) g.set(x, y, 0xc8a060);
    g.set(x, tip + 1, 0xfaf2de);
    g.set(x, tip, c);
  }
  // ── 앞: 표 사는 디딤 받침 (창 아래 작은 나무 계단) + 찌 통
  g.rect(9, base - 3, 9, 3, LOG.mid);
  g.hline(9, 17, base - 3, LOG.hi);
  g.vline(17, base - 2, base - 1, LOG.lo);
  // 찌 통은 왼쪽 벽 밖 (현황판 아래 줄을 가리지 않게)
  g.rect(2, base - 4, 3, 4, 0x4a7ab0);
  g.hline(2, 4, base - 4, 0x7aa6d0);
  for (const [x, c] of [[2, 0xe0503c], [4, 0xf0c040]] as const) g.set(x, base - 5, c);
  // ── 시즌
  if (concept === "christmas") {
    for (let x = 3; x <= 40; x += 3) g.set(x, 19, [0xe0303c, 0xf2c444, 0x2e8a4e, 0x6ab8f0][(x >> 1) % 4]);
    // 현황판 머리에 호랑가시 · 창 위 작은 화환
    seasonHolly(g, 36, 21);
    seasonHolly(g, 9, 21);
  }
  g.outline(OUT);
  stallShadow(g, W / 2 - 2, base + 1, W / 2 - 3, 2.2, 60);
  const c = g.toCanvas();
  if (concept === "default") return c;
  const roofSet = new Set<number>(ROOF);
  return snowRoof(c, (_x, y, col) => y <= 14 && roofSet.has(col), { seed: 191 });
}

/** 밤 불빛 점 (더하기 빛 — 시트 합성용): [x, y, 반지름, 색] */
export function boothGlows(lamps: Lamps = LAMPS_DEFAULT): [number, number, number, number][] {
  const out: [number, number, number, number][] = [
    [14, 27, 9, 0xffc870],
    [14, 21, 4, 0xfff0b0],
  ];
  for (let i = 0; i < 6; i++) {
    const col = i < 3 ? 0 : 1;
    const r = i % 3;
    out.push([23 + 2 + col * 7 + 5, 19 + 6 + r * 6 + 2, 2.5, lamps[i] ? 0x6aff8a : 0xff6a5a]);
  }
  return out;
}

// ── 11/27 매표소 직원 (창 안 반신 — 매표 창 13×12를 통째로: 유리·직원·판매대). 장면이 부스 그림 위에 얹고 두 프레임을 번갈아 (숨 쉬듯 1칸) ──
// 낚시터 사장님·해녀 할망과 같은 크림 유령 몸에 남색 역무원 모자(금 배지·검은 챙)·빨간 조끼(흰 깃·나비넥타이). 오른쪽에 걸린 표 다발.
// 겨울 = 주황 털모자(방울)·줄무늬 목도리, 크리스마스 = 산타 모자·초록 나비넥타이·조끼에 호랑가시 열매

/** 창 칸 안에서 부스 그림(표 두루마리)이 보여야 하는 칸 */
export const CLERK_ROLL: readonly (readonly [number, number])[] = [
  [10, 10],
  [11, 10],
  [12, 10],
  [10, 11],
  [11, 11],
  [12, 11],
];
const CLERK_BODY = 0xeae4d6;
const CLERK_SHADE = darken(CLERK_BODY, 0.18);
const CLERK_LINE = 0x3a3040;
const EYE = 0x1a1620;

function clerkFigure(concept: MapConcept, bob: number): Grid {
  const g = new Grid(BOOTH_WINDOW.w, BOOTH_WINDOW.h);
  const y0 = bob;
  // 머리 (8칸 — x 2~9, 3~7줄) · 오른쪽 그늘
  for (let y = 3; y <= 7; y++) {
    const inset = y === 7 ? 1 : 0;
    for (let x = 2 + inset; x <= 9 - inset; x++) g.set(x, y + y0, x >= 8 - inset ? CLERK_SHADE : CLERK_BODY);
  }
  // 눈 (유령 NPC처럼 세로 두 칸)
  for (const x of [4, 7]) {
    g.set(x, 4 + y0, EYE);
    g.set(x, 5 + y0, EYE);
  }
  // 어깨 + 조끼 (8~9줄)
  const vest = 0xc83a34;
  const vestLo = 0x9a2a28;
  for (let y = 8; y <= 9; y++)
    for (let x = 1; x <= 10; x++) {
      if (y === 8 && (x === 1 || x === 10)) continue;
      g.set(x, y + y0, x >= 9 ? vestLo : vest);
    }
  if (concept === "winter") {
    // 줄무늬 목도리 (깃 자리) + 털모자
    for (let x = 2; x <= 9; x++) g.set(x, 8 + y0, x % 2 ? 0xf2e6cc : 0xd86a3a);
    g.set(3, 9 + y0, 0xd86a3a);
    for (let x = 3; x <= 8; x++) g.set(x, 1 + y0, 0xd86a3a);
    for (let x = 2; x <= 9; x++) g.set(x, 2 + y0, x % 2 ? 0xf2e6cc : 0xe8dcc0);
    for (let x = 4; x <= 7; x++) g.set(x, 0 + y0, 0xd86a3a);
    g.set(8, 1 + y0, 0xa84a2a);
    g.set(5, 0 + y0, 0xf2e6cc);
    g.set(6, 0 + y0, 0xfaf6ee);
    return g;
  }
  // 흰 깃 (V) + 나비넥타이
  g.set(4, 8 + y0, 0xf6f2e8);
  g.set(7, 8 + y0, 0xf6f2e8);
  const tie = concept === "christmas" ? 0x2e8a4e : 0x2a3a6a;
  g.set(5, 8 + y0, tie);
  g.set(6, 8 + y0, tie);
  g.set(5, 9 + y0, 0xf6f2e8);
  g.set(6, 9 + y0, 0xd8d0c0);
  if (concept === "christmas") {
    // 산타 모자 (흰 털 테 + 빨간 꼭지가 오른쪽으로 처지고 끝에 흰 방울) · 조끼에 호랑가시 열매
    for (let x = 2; x <= 9; x++) g.set(x, 2 + y0, x >= 8 ? 0xe2dccc : 0xfaf6ee);
    for (let x = 3; x <= 8; x++) g.set(x, 1 + y0, x >= 7 ? 0xa82a32 : 0xd8323c);
    for (let x = 4; x <= 8; x++) g.set(x, 0 + y0, x >= 7 ? 0xa82a32 : 0xd8323c);
    g.set(9, 1 + y0, 0xfaf6ee);
    g.set(2, 9 + y0, 0x2e8a4e);
    g.set(3, 9 + y0, 0xe0303c);
    return g;
  }
  // 남색 역무원 모자: 위 · 몸통(가운데 금 배지) · 검은 챙
  for (let x = 3; x <= 8; x++) g.set(x, 0 + y0, x >= 8 ? 0x2a3a6a : 0x3e5288);
  for (let x = 2; x <= 9; x++) g.set(x, 1 + y0, x >= 8 ? 0x1e2a50 : 0x2a3a6a);
  g.set(5, 1 + y0, 0xf2c444);
  g.set(6, 1 + y0, 0xffe68a);
  for (let x = 2; x <= 9; x++) g.set(x, 2 + y0, x >= 8 ? 0x101018 : 0x1e1e2a);
  return g;
}

/** 매표 창 안 전체 (13×12): 유리 · 직원 · 걸린 표 다발 · 판매대. frame 0/1 = 숨 쉬듯 1칸 */
export function raftClerkWindow(concept: MapConcept, lit: boolean, frame: number): Grid {
  const W = BOOTH_WINDOW.w;
  const H = BOOTH_WINDOW.h;
  const g = new Grid(W, H);
  const glass = lit ? 0xffdc8e : 0xb8d8e0;
  const glassHi = lit ? 0xfff2c8 : 0xe2f2f6;
  const glassLo = lit ? 0xf0b85e : 0x8ab4c4;
  g.rect(0, 0, W, H, glass);
  // 뒤 벽 선반 (직원 뒤 — 밝은 유리 안쪽에 짙은 줄)
  g.hline(0, W - 1, 6, lit ? 0xe0a860 : 0x9ab8c4);
  // 걸린 표 다발 (오른쪽: 못 + 크림 표 네 장, 절취선)
  g.set(11, 1, 0x4a3a30);
  for (let y = 2; y <= 6; y++) {
    g.set(10, y, y % 2 ? 0xfff4d0 : 0xd84a3a);
    g.set(11, y, y % 2 ? 0xf2e0b0 : 0xfff4d0);
  }
  // 직원 (외곽선을 둘러 유리 위에)
  const f = clerkFigure(concept, frame ? 1 : 0);
  f.outline(CLERK_LINE);
  g.draw(f, 0, 0);
  // 판매대 (창 아래 두 줄: 윗판 · 앞판)
  g.hline(0, W - 1, H - 2, 0xc89a62);
  g.set(0, H - 2, 0xe0b880);
  g.hline(0, W - 1, H - 1, 0x8a6a42);
  // 판매대 위 표 한 장 (빨간 줄)
  g.set(10, H - 3, 0xfff4d0);
  g.set(11, H - 3, 0xd84a3a);
  // 유리 반사 (왼쪽 위 사선 — 반투명) · 아래 그늘
  for (let k = 0; k < 3; k++) g.set(k, 3 - k, glassHi, 150);
  g.set(12, 7, glassLo);
  // 창틀 모서리 (부스 그림과 같다)
  g.set(0, 0, TRIM_LO);
  g.set(W - 1, 0, TRIM_LO);
  // 오른쪽 아래 두 줄 세 칸은 비운다: 부스 그림의 표 두루마리(빨간 걸이)가 창 모서리에 걸쳐 있다
  for (const [x, y] of CLERK_ROLL) g.set(x, y, 0, 0);
  return g;
}
