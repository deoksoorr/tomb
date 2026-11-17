import { SEA_PIER_END } from "@tomb/protocol";
import { darken, Grid, lighten, mix, type Color } from "../sprites/pixel";
import { pick, toneOutline } from "./seaArt";
import { hashU } from "./seaLayout";
import {
  deckBack,
  deckFront,
  deckWidth,
  G_BACK_ROW,
  G_CABIN,
  G_DECK_CY,
  G_DECK_X0,
  G_DECK_X1,
  G_LADDER_X,
  G_MASTS,
  G_MERCHANT,
  G_WALK_X0,
  G_WALK_X1,
  G_WATER,
  GHOST_ART_H,
  GHOST_ART_W,
  GHOST_ORIGIN,
  GHOST_PLANK,
  onGhostDeckArt,
  walkBottom,
  walkTop,
} from "./ghostShipLayout";
import { SEA_TEX_PREFIX } from "./seaTypes";

/** 널빤지 걷는 띠 (그림 y) — 고물 난간이 열린 자리 */
const G_PLANK_GY0 = GHOST_PLANK.y0 - GHOST_ORIGIN.y;
const G_PLANK_GY1 = GHOST_PLANK.y1 - GHOST_ORIGIN.y;

// 11/17 유령선 그림 (코드로 그리는 픽셀 아트 — 포구 그림 seaArt와 같은 규칙: 색 단계 사이 4×4 디더, 제 색 테두리, 빛은 왼쪽 위).
// 마을·캠핑장·포구 어느 것보다 공들여: 바닷물에 바랜 청회색 나무 배, 이끼 낀 물높이, 녹색 도깨비불 창,
// 반투명하게 해진 돛(따로 그려 바람에 부풀어요), 돛대 등불, 갑판 위 장터 좌판 둘과 유령 상인.
// 판을 나눠 그려요 (사람이 갑판 위를 걷도록): back = 갑판·뒤 뱃전·돛대·선실 (사람 뒤) · front = 앞 뱃전·옆구리·사다리 (사람 앞)

const P = SEA_TEX_PREFIX;
export const GHOST_TEX = {
  back: `${P}ghost-back`,
  front: `${P}ghost-front`,
  sail: (i: number) => `${P}ghost-sail${i}`,
  flag: `${P}ghost-flag`,
  stalls: `${P}ghost-stalls`,
  merchant: `${P}ghost-merchant`,
  plank: `${P}ghost-plank`,
  plankFront: `${P}ghost-plank-front`,
  gatePost: `${P}ghost-gate-post`,
  mist: `${P}ghost-mist`,
  glow: `${P}ghost-glow`,
  windows: `${P}ghost-windows`,
  reflect: `${P}ghost-reflect`,
} as const;

const hexes = (a: readonly string[]): readonly Color[] => a.map((h) => parseInt(h.slice(1), 16));
/** 바닷물에 바랜 청회색 나무 (밝은 쪽 → 짙은 쪽) */
const WOOD = hexes(["#a9b4ae", "#8e9b98", "#748283", "#5e6c70", "#4a575e", "#38444d", "#28323b"]);
/** 갑판 판자 (햇볕·소금에 바래 연한 회갈색) */
const PLANK = hexes(["#c7c4b0", "#b2b19e", "#9c9d8c", "#878a7b", "#717669"]);
/** 11/17 r2 걷는 마당 판자 (밝게 — 걸을 수 있는 곳이 한눈에) · 뒤쪽 막힌 줄 판자 (어둡게 바랜 청회색) */
const DECK_LIT = hexes(["#ebe6cf", "#dcd7be", "#cac6ac", "#b4b298", "#9c9c86"]);
const DECK_DIM = hexes(["#8e958c", "#7c847d", "#6a736f", "#5a6362", "#4a5356"]);
/** 옆구리 아래 이끼·물때 */
const MOSS = hexes(["#7a9a7e", "#5d7f66", "#456a55", "#33554a"]);
const IRON = 0x3c3f4a;
const IRON_HI = 0x6a6e7c;
const GOLD = 0xb89a52;
const GOLD_LO = 0x8a7038;
const BONE = 0xeee6d2;
/** 도깨비불 녹색 (밝은 쪽 → 짙은 쪽) */
export const GHOST_GREEN = [0xeafff2, 0xb8ffd8, 0x7dffb0, 0x3ac888, 0x1e8a62] as const;
/** 돛 (반투명 — 바다가 비쳐요) */
const SAIL = hexes(["#f2fbf6", "#e0f3ec", "#c8e7de", "#a9d3c9", "#8ebdb4"]);

// ── 배 뒤 판: 갑판 · 뒤 뱃전 안쪽 · 돛대·밧줄 · 고물 선실 · 뱃머리 기둥 · 뒤쪽 줄 짐 · 고물 난간 ──
// 11/17 r2 걷는 마당은 밝은 판자, 뒤쪽 막힌 줄은 어둡게 바랜 판자 + 낮은 밧줄 난간 · 통 · 상자로 막아요 (그림 = 충돌)
export function ghostBackArt(): Grid {
  const W = GHOST_ART_W;
  const H = GHOST_ART_H;
  const g = new Grid(W, H);
  // 갑판 판자: 가로로 긴 널 (줄마다 이음매가 엇갈려요). 마당은 밝게, 뒤쪽 줄·뱃머리 끝은 어둡게
  for (let x = G_DECK_X0; x <= G_DECK_X1; x++) {
    const yb = Math.round(deckBack(x));
    const yf = Math.round(deckFront(x));
    if (yf - yb < 2) continue;
    for (let y = yb; y <= yf; y++) {
      const row = Math.floor((y - yb) / 4);
      const seam = (x + row * 13) % 26 === 0;
      const edge = y === yb || (y - yb) % 4 === 0;
      const walk = onGhostDeckArt(x, y);
      const shade = 0.12 + ((y - yb) / Math.max(1, yf - yb)) * 0.3 + (hashU(x >> 2, row, 711) - 0.5) * 0.22;
      if (walk) g.set(x, y, edge || seam ? DECK_LIT[4] : pick(DECK_LIT, shade, x, y));
      else g.set(x, y, edge || seam ? WOOD[5] : pick(DECK_DIM, shade + 0.15, x, y));
    }
  }
  // 마당 가장자리: 뒤쪽 줄 그늘 (마당 위 가장자리 한 줄 어둡게) · 마당 판자 못 자국
  for (let x = G_WALK_X0; x <= G_WALK_X1; x++) {
    const t = Math.ceil(walkTop(x));
    if (onGhostDeckArt(x, t)) g.set(x, t, DECK_LIT[3]);
  }
  for (let i = 0; i < 90; i++) {
    const x = G_WALK_X0 + 4 + Math.floor(hashU(i, 1, 713) * (G_WALK_X1 - G_WALK_X0 - 8));
    const y = Math.round(walkTop(x) + 2 + hashU(i, 2, 713) * (walkBottom(x) - walkTop(x) - 4));
    if (!onGhostDeckArt(x, y)) continue;
    g.set(x, y, hashU(i, 3, 713) < 0.6 ? DECK_LIT[3] : 0x9ab0a4);
  }
  // 뒤 뱃전 (안쪽 면이 보여요): 갑판 뒤 가장자리 위로 8줄 + 난간 머리 + 기둥
  for (let x = G_DECK_X0 + 2; x <= G_DECK_X1 - 1; x++) {
    const yb = Math.round(deckBack(x));
    if (deckWidth(x) < 0.08) continue;
    const h = 8 + Math.round(sheerLift(x) * 0.8);
    for (let y = yb - h; y < yb; y++) g.set(x, y, pick(WOOD, 0.35 + ((y - (yb - h)) / h) * 0.4 + (x % 9 === 0 ? 0.2 : 0), x, y));
    g.set(x, yb - h, WOOD[1]);
    g.set(x, yb - h - 1, WOOD[0]);
    if (x % 12 === 0) g.vline(x, yb - h - 1, yb - 1, WOOD[4]);
  }
  // 뱃전 판 구멍 (해진 데로 녹빛이 비쳐요)
  for (const [x, dy] of [[78, 4], [126, 3], [168, 5]] as const) {
    const yb = Math.round(deckBack(x));
    g.rect(x, yb - dy - 2, 3, 2, 0x274a42);
    g.set(x + 1, yb - dy - 1, GHOST_GREEN[3]);
  }
  // 뒤쪽 줄 짐 (뱃머리 쪽 — 마당 밖이라 막혀요): 감은 밧줄 · 통 셋 · 나무 상자 · 닻
  const barrel = (cx: number, by: number) => {
    for (let y = by - 9; y <= by; y++) {
      const half = 3 + (y > by - 8 && y < by - 1 ? 1 : 0);
      for (let x = cx - half; x <= cx + half; x++) g.set(x, y, pick(WOOD, 0.2 + (x - cx + half) / (half * 2 + 1) * 0.5, x, y));
    }
    g.hline(cx - 4, cx + 4, by - 7, IRON);
    g.hline(cx - 4, cx + 4, by - 2, IRON);
    g.hline(cx - 3, cx + 3, by - 9, WOOD[0]);
  };
  const crate = (x0: number, by: number, w: number, h: number) => {
    g.rect(x0, by - h, w, h, WOOD[3]);
    g.hline(x0, x0 + w - 1, by - h, WOOD[1]);
    g.vline(x0, by - h, by, WOOD[2]);
    for (let k = 0; k < w; k++) g.set(x0 + k, by - h + Math.round((k / (w - 1)) * (h - 1)), WOOD[5]);
    g.rect(x0, by - h, w, 1, WOOD[1]);
  };
  const coil = (cx: number, cy: number) => {
    g.ellipse(cx, cy, 5, 2.6, 0x8a7a5a);
    g.ellipse(cx, cy, 3.4, 1.6, 0x6a5a40);
    g.ellipse(cx, cy, 1.6, 0.8, 0x3a3428);
    g.set(cx - 3, cy - 1, 0xb09a70);
  };
  coil(24, 136);
  barrel(48, 126);
  crate(70, 126, 10, 7);
  barrel(127, 125);
  crate(146, 126, 8, 6);
  // 고물 선실 (오른쪽 뒤, 갤리온 고물 누각): 판자 벽 · 금테 · 아치 창 셋(녹빛) · 문 · 지붕 난간
  const { x0: cx0, x1: cx1, top: cTop, base: cBase } = G_CABIN;
  for (let y = cTop; y <= cBase; y++)
    for (let x = cx0; x <= cx1; x++) {
      const t = (x - cx0) / (cx1 - cx0);
      const board = (y - cTop) % 5 === 0;
      g.set(x, y, x === cx0 ? WOOD[1] : board ? WOOD[4] : pick(WOOD, 0.22 + t * 0.4 + (hashU(x >> 3, (y - cTop) >> 2, 727) - 0.5) * 0.12, x, y));
    }
  // 지붕 (위로 둥글게 휜 처마) · 처마 금테 · 난간 기둥
  for (let x = cx0 - 3; x <= cx1 + 3; x++) {
    const arch = Math.round(Math.sin(((x - cx0 + 3) / (cx1 - cx0 + 6)) * Math.PI) * 2);
    g.set(x, cTop - 1 - arch, WOOD[4]);
    g.set(x, cTop - 2 - arch, WOOD[2]);
    g.set(x, cTop - arch, x % 3 === 0 ? GOLD_LO : GOLD);
    if ((x - cx0) % 4 === 0) g.vline(x, cTop - 6 - arch, cTop - 3 - arch, WOOD[3]);
    g.set(x, cTop - 6 - arch, WOOD[1]);
  }
  // 아치 창 셋 (쇠 창살 · 녹빛)
  for (const wx of GHOST_CABIN_WINDOWS) {
    g.rect(wx - 3, cTop + 7, 7, 9, IRON);
    g.rect(wx - 2, cTop + 8, 5, 8, GHOST_GREEN[2]);
    g.hline(wx - 1, wx + 1, cTop + 6, IRON);
    g.vline(wx, cTop + 8, cTop + 15, IRON);
    g.hline(wx - 2, wx + 2, cTop + 11, IRON);
    g.set(wx - 2, cTop + 8, GHOST_GREEN[0]);
    g.set(wx + 1, cTop + 9, GHOST_GREEN[1]);
    g.hline(wx - 3, wx + 3, cTop + 16, GOLD_LO); // 창턱
  }
  // 문 (가운데 아래) · 금 손잡이 · 문 위 해골 장식 · 문 앞 디딤판
  const dx0 = Math.round((cx0 + cx1) / 2) - 3;
  g.rect(dx0, cTop + 22, 7, cBase - cTop - 22, 0x262b34);
  g.vline(dx0, cTop + 22, cBase, WOOD[5]);
  g.hline(dx0, dx0 + 6, cTop + 22, WOOD[5]);
  g.set(dx0 + 5, cTop + 30, GOLD);
  g.rect(dx0 + 2, cTop + 19, 3, 2, BONE);
  // 벽 아래 금띠 · 벽 밑동 그늘
  g.hline(cx0, cx1, cBase - 2, GOLD_LO);
  g.hline(cx0, cx1, cBase, WOOD[5]);
  // 돛대 셋: 둥근 기둥 (왼쪽 밝게) + 쇠테 · 활대 둘 · 망대(큰 돛대)
  G_MASTS.forEach((m, i) => {
    for (let y = m.top; y <= m.base; y++) {
      g.set(m.x - 1, y, WOOD[1]);
      g.set(m.x, y, WOOD[3]);
      g.set(m.x + 1, y, WOOD[5]);
      if ((y - m.top) % 14 === 7) {
        g.set(m.x - 1, y, IRON_HI);
        g.set(m.x, y, IRON);
        g.set(m.x + 1, y, IRON);
      }
    }
    // 받침 쇠고리 (갑판에 박힌 자리)
    g.hline(m.x - 2, m.x + 2, m.base, IRON);
    const span = i === 1 ? 30 : i === 0 ? 24 : 18;
    for (const yy of i === 2 ? [m.top + 6] : [m.top + 6, m.top + Math.round((m.base - m.top) * 0.42)]) {
      const s = yy === m.top + 6 ? Math.round(span * 0.78) : span;
      g.hline(m.x - s, m.x + s, yy, WOOD[3]);
      g.hline(m.x - s, m.x + s, yy + 1, WOOD[5]);
      g.set(m.x - s - 1, yy, WOOD[4]);
      g.set(m.x + s + 1, yy, WOOD[4]);
    }
    if (i === 1) {
      // 망대 (큰 돛대 위쪽)
      g.rect(m.x - 5, m.top + 16, 11, 3, WOOD[3]);
      g.hline(m.x - 5, m.x + 5, m.top + 16, WOOD[1]);
      for (let x = m.x - 5; x <= m.x + 5; x += 2) g.set(x, m.top + 15, WOOD[4]);
    }
  });
  // 밧줄 (돛대 꼭대기 → 뱃머리 끝 · 고물 · 돛대끼리). 늘어진 줄은 살짝 처져요
  const rope = (x0: number, y0: number, x1: number, y1: number, sag: number, c = 0x4a4640, a = 200) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag);
      if (!g.filled(x, y) || (g.get(x, y) & 255) < 255) g.set(x, y, c, a);
    }
  };
  const [fore, main, mizz] = G_MASTS;
  rope(fore.x, fore.top + 1, 2, G_DECK_CY - 14, 4);
  rope(fore.x, fore.top + 1, main.x, main.top + 18, 3);
  rope(main.x, main.top + 1, mizz.x, mizz.top + 1, 5);
  rope(mizz.x, mizz.top + 1, W - 6, Math.round(deckBack(G_DECK_X1)) - 10, 3);
  rope(main.x, main.top + 1, fore.x + 14, deckBack(fore.x + 14) - 9, 2);
  rope(main.x, main.top + 1, main.x + 26, deckBack(main.x + 26) - 9, 2);
  // 줄사다리 (큰 돛대 옆 · 망대까지): 가로 칸
  for (let y = main.top + 20; y < main.base - 12; y += 4) g.hline(main.x + 3, main.x + 8 - Math.floor((y - main.top) / 30), y, 0x5a5448);
  rope(main.x + 2, main.top + 19, main.x + 10, main.base - 8, 0);
  // 뱃머리 기둥 (서쪽으로 길게) + 줄
  for (let i = 0; i < 18; i++) {
    const x = G_DECK_X0 + 2 - i;
    const y = Math.round(G_DECK_CY - 12 - i * 0.55);
    g.set(x, y, WOOD[2]);
    g.set(x, y + 1, WOOD[4]);
  }
  // 뒤쪽 줄과 마당 사이 낮은 밧줄 난간 (좌판·선실이 없는 틈 — 짧은 놋쇠 기둥 + 처진 밧줄)
  const railY = G_BACK_ROW - 2;
  const gaps: [number, number][] = [
    [G_WALK_X0 + 6, STALLS_G.x + 2],
    [STALLS_G.x + 40, G_MERCHANT.x - 8],
    [G_MERCHANT.x + 8, STALLS_G.x + 72],
    [STALLS_G.x + 110, G_CABIN.x0],
  ];
  for (const [a, b] of gaps) {
    if (b - a < 4) continue;
    const posts: number[] = [];
    for (let x = a; x < b; x += 10) posts.push(x);
    posts.push(b);
    for (const px of posts) {
      g.vline(px, railY - 4, railY + 1, GOLD_LO);
      g.set(px, railY - 4, GOLD);
    }
    for (let k = 0; k + 1 < posts.length; k++) rope(posts[k], railY - 3, posts[k + 1], railY - 3, 1.2, 0x8a7a5a, 255);
  }
  // 고물 난간 (고물 끝 — 널빤지 자리만 열려 있어요. 열린 자리 양옆 기둥 등불은 따로 그려요)
  const sx = G_DECK_X1;
  const sb = Math.round(deckBack(sx));
  const sf = Math.round(deckFront(sx));
  const open0 = G_PLANK_GY0 - 1;
  const open1 = G_PLANK_GY1 + 1;
  for (let y = sb - 6; y <= sf; y++) {
    if (y >= open0 && y <= open1) continue;
    g.set(sx - 1, y, WOOD[1]);
    g.set(sx, y, WOOD[3]);
    g.set(sx + 1, y, WOOD[5]);
  }
  // 열린 자리 앞 문턱 (금빛 쇠붙이)
  g.vline(sx, open0 + 1, open1 - 1, GOLD_LO);
  // 등 매다는 고리 (활대 끝 · 고물) — 등불 빛은 따로(ADD)
  for (const [x, y] of GHOST_LAMPS) {
    g.vline(x, y - 4, y - 2, IRON);
    g.rect(x - 2, y - 1, 5, 6, IRON);
    g.rect(x - 1, y, 3, 4, GHOST_GREEN[2]);
    g.set(x - 1, y, GHOST_GREEN[0]);
    g.hline(x - 2, x + 2, y + 5, IRON_HI);
  }
  toneOutline(g, 0.4);
  return g;
}

/** 배에 매단 녹색 등불 자리 (그림 좌표 — 빛 번짐도 여기에) */
export const GHOST_LAMPS: readonly (readonly [number, number])[] = [
  [22, G_DECK_CY - 18],
  [G_MASTS[0].x - 24, G_MASTS[0].top + 34],
  [G_MASTS[1].x + 30, G_MASTS[1].top + 47],
  [G_MASTS[2].x + 1, G_CABIN.top - 12],
  [G_MASTS[2].x - 15, G_MASTS[2].top + 9],
];
/** 선실 아치 창 자리 (그림 x) */
export const GHOST_CABIN_WINDOWS: readonly number[] = [G_CABIN.x0 + 8, Math.round((G_CABIN.x0 + G_CABIN.x1) / 2), G_CABIN.x1 - 8];

// ── 배 앞 판: 앞 뱃전 · 옆구리 · 물높이 이끼 · 녹빛 창 · 뱃머리 장식 · 밧줄 사다리 ──
export function ghostFrontArt(): Grid {
  const W = GHOST_ART_W;
  const H = GHOST_ART_H;
  const g = new Grid(W, H);
  for (let x = G_DECK_X0 - 6; x <= G_DECK_X1 + 4; x++) {
    const xx = Math.max(G_DECK_X0, Math.min(G_DECK_X1, x));
    const w = deckWidth(xx);
    if (w < 0.03 && x > G_DECK_X0 + 2) continue;
    const yf = Math.round(deckFront(xx));
    // 용골선: 뱃머리 쪽은 물 위로 휘어 올라가고 (뱃머리가 물을 가르는 모양), 고물은 둥글게 들려 물 위로 살짝 뜬 고물판
    const u = (x - G_DECK_X0) / (G_DECK_X1 - G_DECK_X0);
    const rise = u < 0.22 ? Math.round(((0.22 - u) / 0.22) ** 1.6 * 34) : u > 0.86 ? Math.round(((u - 0.86) / 0.14) ** 2 * 16) : 0;
    const bot = G_WATER + 3 - rise;
    // 뱃전 위 선(현호): 뱃머리·고물 쪽으로 휘어 올라가요 (갤리온 모양)
    const railTop = yf - 6 - Math.round(sheerLift(x));
    for (let y = railTop; y <= bot; y++) {
      if (y < railTop + 2) {
        g.set(x, y, y === railTop ? WOOD[0] : WOOD[1]); // 난간 머리
        continue;
      }
      // 옆구리: 위는 밝고 아래로 짙어지며, 물높이 근처는 이끼
      const k = (y - railTop) / Math.max(1, bot - railTop);
      const band = (y - railTop) % 6 === 0;
      const toward = (x - G_DECK_X0) / (G_DECK_X1 - G_DECK_X0);
      // 물높이 이끼 띠: 물결처럼 들쭉날쭉 (두께 3~6)
      const mossTop = G_WATER - 4 - Math.round(1.5 + Math.sin(x / 5.3) * 1.2 + hashU(x >> 1, 3, 717) * 1.6);
      if (y > mossTop) {
        g.set(x, y, pick(MOSS, 0.15 + (y - mossTop) / 7 + (hashU(x, y, 719) - 0.5) * 0.3, x, y));
        continue;
      }
      let c = band ? WOOD[5] : pick(WOOD, 0.25 + k * 0.55 + toward * 0.12 + (hashU(x >> 3, (y - railTop) >> 2, 721) - 0.5) * 0.12, x, y);
      // 바랜 청록 띠 + 금줄 (칠이 군데군데 벗겨진 옛 무늬)
      if (y >= railTop + 7 && y <= railTop + 9 && hashU(x >> 1, y, 729) > 0.12) c = mix(c, y === railTop + 7 ? 0x6aa8a0 : 0x3e7a74, 0.6);
      if (y === railTop + 10 && hashU(x >> 2, 1, 729) > 0.2) c = x % 5 === 0 ? GOLD_LO : GOLD;
      g.set(x, y, c);
    }
    // 뱃전 기둥 (난간 아래 짧은 받침)
    if (x % 10 === 0 && x > G_DECK_X0 + 6 && x < G_DECK_X1 - 4) g.vline(x, railTop + 2, railTop + 5, WOOD[4]);
  }
  // 물높이 아래 비치는 그늘 (반투명 — 물에 잠겨 보여요)
  for (let x = G_DECK_X0 + 18; x <= G_DECK_X1 - 2; x++)
    for (let y = G_WATER + 4; y < G_WATER + 9; y++) if (hashU(x >> 1, y, 723) < 0.85 - (y - G_WATER - 4) * 0.15) g.set(x, y, 0x1e3a48, 110 - (y - G_WATER - 4) * 18);
  // 녹빛 둥근 창 넷 (쇠테 · 도깨비불이 새어 나와요)
  for (const px of GHOST_PORTS) {
    const py = Math.round(deckFront(px)) + 10;
    g.ellipse(px, py, 3.6, 3.2, IRON);
    g.ellipse(px, py, 2.4, 2.1, GHOST_GREEN[2]);
    g.set(px - 1, py - 1, GHOST_GREEN[0]);
    g.set(px + 1, py + 1, GHOST_GREEN[3]);
  }
  // 따개비 · 늘어진 미역
  for (let i = 0; i < 36; i++) {
    const x = G_DECK_X0 + 26 + Math.floor(hashU(i, 5, 725) * (G_DECK_X1 - G_DECK_X0 - 30));
    const y = G_WATER - 4 - Math.floor(hashU(i, 6, 725) * 10);
    if (!g.filled(x, y)) continue;
    if (hashU(i, 7, 725) < 0.55) {
      g.set(x, y, 0xe8e2d4);
      g.set(x + 1, y, 0xb8b0a0);
    } else for (let k = 0; k < 3 + (i % 4); k++) g.set(x + (k % 2), y + k, k % 2 ? MOSS[3] : MOSS[2]);
  }
  // 바랜 금빛 띠 (고물 장식) · 이름판 자리 (글씨 대신 해골 문양)
  const nx = G_DECK_X1 - 24;
  for (let x = G_DECK_X1 - 32; x < G_DECK_X1 - 6; x++) {
    const y = Math.round(deckFront(Math.min(G_DECK_X1, x))) + 4;
    g.set(x, y, x % 4 === 0 ? GOLD_LO : GOLD);
  }
  g.rect(nx, Math.round(deckFront(nx + 4)) + 7, 12, 6, 0x2a2f38);
  g.rect(nx + 4, Math.round(deckFront(nx + 4)) + 8, 4, 3, BONE);
  g.set(nx + 5, Math.round(deckFront(nx + 4)) + 9, IRON);
  g.set(nx + 7, Math.round(deckFront(nx + 4)) + 9, IRON);
  // 뱃머리 장식: 등불을 든 유령 여인상 (뱃머리 끝 아래)
  const fx = G_DECK_X0 - 3;
  const fy = Math.round(deckFront(G_DECK_X0 + 4)) + 2;
  for (let i = 0; i < 9; i++) g.hline(fx - Math.floor(i / 3), fx + 1 - Math.floor(i / 4), fy + i, i < 3 ? 0xd8e8e2 : 0xa8c8c0);
  g.set(fx, fy - 1, 0xd8e8e2);
  g.set(fx - 3, fy + 1, GHOST_GREEN[1]);
  g.set(fx - 3, fy + 2, GHOST_GREEN[2]);
  // 밧줄 사다리 (앞 뱃전에서 물까지 늘어져요): 양쪽 줄 + 나무 디딤판
  const lx = G_LADDER_X;
  const ly0 = Math.round(deckFront(lx)) - 5;
  const ly1 = G_WATER + 6;
  for (let y = ly0; y <= ly1; y++) {
    const sway = Math.round(Math.sin((y - ly0) / 9) * 0.6);
    g.set(lx - 3 + sway, y, 0x8a7a5a);
    g.set(lx + 3 + sway, y, 0x6a5a40);
    if ((y - ly0) % 5 === 3) g.hline(lx - 2 + sway, lx + 2 + sway, y, y > G_WATER - 2 ? MOSS[1] : 0xb09a70);
  }
  g.rect(lx - 4, ly0 - 1, 9, 2, IRON); // 고리
  toneOutline(g, 0.42);
  return g;
}
/** 뱃전 현호: 뱃머리·고물 쪽으로 올라가는 높이 (px) */
export function sheerLift(gx: number): number {
  const u = (gx - G_DECK_X0) / (G_DECK_X1 - G_DECK_X0);
  if (u < 0.28) return ((0.28 - u) / 0.28) ** 2 * 12;
  if (u > 0.74) return ((u - 0.74) / 0.26) ** 2 * 10;
  return 0;
}
/** 앞 옆구리 녹빛 창 자리 (그림 x) */
export const GHOST_PORTS: readonly number[] = [50, 128, 164, 200];

/** 녹빛 창 · 선실 창 빛만 (ADD로 겹쳐 밤에 환하게) */
export function ghostWindowsArt(): Grid {
  const g = new Grid(GHOST_ART_W, GHOST_ART_H);
  const dot = (x: number, y: number, r: number) => {
    for (let yy = -r - 2; yy <= r + 2; yy++)
      for (let xx = -r - 2; xx <= r + 2; xx++) {
        const d = Math.hypot(xx, yy);
        if (d > r + 2) continue;
        g.set(x + xx, y + yy, d <= r ? GHOST_GREEN[0] : GHOST_GREEN[2], d <= r ? 230 : Math.round(140 * (1 - (d - r) / 2)));
      }
  };
  for (const px of GHOST_PORTS) dot(px, Math.round(deckFront(px)) + 10, 2);
  for (const wx of GHOST_CABIN_WINDOWS) dot(wx, G_CABIN.top + 12, 2);
  return g;
}

// ── 돛 (반투명, 해진 밑단 · 구멍 · 덧댄 천 · 큰 돛엔 흐릿한 해골 문양) ──
export const GHOST_SAILS: readonly { w: number; h: number; gx: number; gy: number; skull?: true; tri?: true }[] = [
  // 앞돛대: 윗돛 · 아랫돛
  { w: 36, h: 22, gx: G_MASTS[0].x, gy: G_MASTS[0].top + 7 },
  { w: 46, h: 30, gx: G_MASTS[0].x, gy: G_MASTS[0].top + 42 },
  // 큰 돛대: 윗돛 · 아랫돛 (해골)
  { w: 46, h: 30, gx: G_MASTS[1].x, gy: G_MASTS[1].top + 7 },
  { w: 58, h: 38, gx: G_MASTS[1].x, gy: G_MASTS[1].top + 48, skull: true },
  // 뒷돛대: 세모 돛
  { w: 30, h: 36, gx: G_MASTS[2].x - 14, gy: G_MASTS[2].top + 8, tri: true },
];
export function ghostSailArt(i: number): Grid {
  const s = GHOST_SAILS[i];
  const g = new Grid(s.w, s.h);
  const cx = (s.w - 1) / 2;
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      // 바람에 부푼 모양: 가운데가 아래로 불룩, 밑단은 해져서 들쭉날쭉
      const bulge = Math.sin((x / (s.w - 1)) * Math.PI);
      const hem = s.h - 1 - Math.floor(hashU(x >> 1, i, 731) * 5) - (x % 7 === 3 ? 2 : 0);
      if (s.tri) {
        // 뒷돛 (가프 돛): 돛대(오른쪽) 쪽은 곧고, 바깥쪽은 위가 좁고 아래가 넓은 사다리꼴 · 밑단은 해졌어요
        if (x < s.w * (0.45 - 0.45 * (y / s.h)) || y > hem) continue;
      } else if (y > hem + bulge * 1.5) continue;
      // 구멍 몇 개
      const hx = x - Math.round(cx * (0.5 + hashU(i, 1, 733) * 0.6));
      const hy = y - Math.round(s.h * (0.3 + hashU(i, 2, 733) * 0.4));
      if (hx * hx + hy * hy * 1.6 < 4 + (i % 2) * 3) continue;
      const k = 0.15 + Math.abs(x - cx) / s.w + (y / s.h) * 0.35 - bulge * 0.15 + (hashU(x >> 2, y >> 2, 735) - 0.5) * 0.15;
      const a = Math.round(150 + bulge * 50 - (y > hem - 3 ? 40 : 0));
      // 세로 솔기 · 덧댄 천
      const seam = (x % 9 === 0 && !s.tri) || y === 0;
      const patch = x > s.w * 0.62 && x < s.w * 0.78 && y > s.h * 0.2 && y < s.h * 0.42;
      g.set(x, y, seam ? SAIL[4] : patch ? 0xcfe2ea : pick(SAIL, k, x, y), seam ? a + 30 : a);
    }
  if (s.skull) {
    // 큰 돛 가운데 흐릿한 해골과 엇갈린 뼈 (빛바랜 녹빛)
    const sx = Math.round(cx);
    const sy = Math.round(s.h * 0.46);
    const c = 0x7fb8a8;
    g.ellipse(sx, sy - 2, 5, 4.5, c, 170);
    g.rect(sx - 3, sy + 2, 7, 3, c, 170);
    g.rect(sx - 3, sy - 3, 2, 2, 0xe8fff2, 120);
    g.rect(sx + 2, sy - 3, 2, 2, 0xe8fff2, 120);
    for (let k = -9; k <= 9; k++) {
      if (Math.abs(k) < 6) continue;
      g.set(sx + k, sy + 4 + Math.round(k * 0.35), c, 160);
      g.set(sx + k, sy + 4 - Math.round(k * 0.35), c, 160);
    }
  }
  // 위 가장자리 (활대에 묶인 매듭)
  for (let x = 1; x < s.w - 1; x += 5) if (!s.tri) g.set(x, 0, 0x6a6a5a);
  return g;
}

/** 꼭대기 깃발 (3장 — 너덜너덜 휘날려요) */
export const FLAG_W = 16;
export const FLAG_H = 9;
export function ghostFlagArt(): { grid: Grid; frameW: number; frameH: number } {
  const g = new Grid(FLAG_W * 3, FLAG_H);
  for (let f = 0; f < 3; f++)
    for (let x = 0; x < FLAG_W; x++) {
      const wave = Math.round(Math.sin(x / 2.6 + f * 2.1) * 1.2);
      const len = FLAG_H - 2 - (x > 10 ? Math.floor(hashU(x, f, 741) * 3) : 0);
      for (let y = 1; y < len; y++) g.set(f * FLAG_W + x, y + wave + (x > 12 && y > len - 3 ? 1 : 0), x === 0 ? 0x4a4640 : y === 1 ? 0x3a4a52 : 0x1e262e);
    }
  for (let f = 0; f < 3; f++) {
    const ox = f * FLAG_W + 6;
    const w = Math.round(Math.sin(6 / 2.6 + f * 2.1) * 1.2);
    g.rect(ox, 3 + w, 3, 2, BONE);
    g.set(ox + 1, 5 + w, BONE);
    g.set(ox, 3 + w, 0x1e262e);
    g.set(ox + 2, 3 + w, 0x1e262e);
  }
  return { grid: g, frameW: FLAG_W, frameH: FLAG_H };
}

// ── 장터 좌판 둘 (갑판 뒤쪽) ──
export const STALLS_W = 110;
export const STALLS_H = 46;
/** 좌판 그림 왼쪽 위의 배 그림 좌표 */
export const STALLS_G = { x: 84 - 2, y: G_BACK_ROW - 46 + 2 } as const;
export function ghostStallsArt(): Grid {
  const g = new Grid(STALLS_W, STALLS_H);
  const stall = (x0: number, cloth: readonly Color[], awnA: Color, awnB: Color, goods: (x: number, y: number) => void) => {
    const w = 38;
    const top = 18;
    const base = STALLS_H - 3;
    // 기둥 둘 + 차양 (줄무늬 · 물결 끝단)
    for (const px of [x0 + 1, x0 + w - 2]) {
      g.vline(px, 4, base, WOOD[3]);
      g.vline(px - 1, 4, base, WOOD[1]);
    }
    for (let y = 0; y < 8; y++)
      for (let x = x0 - 2; x < x0 + w + 2; x++) {
        const stripe = Math.floor((x - x0 + 2) / 5) % 2 === 0;
        const scallop = y === 7 && (x - x0) % 5 >= 3;
        if (scallop) continue;
        const c = stripe ? awnA : awnB;
        g.set(x, y + 1, y === 0 ? lighten(c, 0.25) : y > 5 ? darken(c, 0.18) : c);
      }
    // 차양 끝 해진 술 (가끔 늘어진 실)
    for (let x = x0; x < x0 + w; x += 7) g.vline(x, 9, 10 + (x % 3), darken(awnB, 0.3));
    // 진열대 (상판 · 앞에 늘어뜨린 천 · 끝단 술)
    g.rect(x0, top, w, 3, PLANK[1]);
    g.hline(x0, x0 + w - 1, top, PLANK[0]);
    for (let y = top + 3; y < base; y++)
      for (let x = x0; x < x0 + w; x++) {
        const fold = (x - x0) % 6 === 0 ? 0.35 : (x - x0) % 6 === 1 ? 0.1 : 0.2;
        const tat = y > base - 3 && hashU(x, y, 751) < 0.35;
        if (tat) continue;
        g.set(x, y, pick(cloth, fold + ((y - top) / (base - top)) * 0.4, x, y));
      }
    for (let x = x0 + 2; x < x0 + w - 2; x += 4) g.set(x, base, 0xd8c070); // 금실 술
    // 가격표 (작은 크림 카드)
    g.rect(x0 + 4, top + 4, 5, 3, 0xf2ead2);
    g.set(x0 + 5, top + 5, 0x6a5a40);
    g.set(x0 + 7, top + 5, 0x6a5a40);
    goods(x0, top);
  };
  // 좌판 A (자줏빛 천 · 민트/자주 차양): 모자 셋 · 녹빛 물약 병 · 금화 상자
  stall(2, hexes(["#8a6a9a", "#74578a", "#5e4676", "#4a3862"]), 0xb8e8d8, 0x7a5a8a, (x0, top) => {
    // 모자걸이와 모자 (삼각 모자 · 깃털 모자 · 두건)
    g.vline(x0 + 6, top - 9, top - 1, WOOD[4]);
    g.rect(x0 + 3, top - 11, 7, 2, 0x2e3346);
    g.hline(x0 + 2, x0 + 10, top - 9, 0x2e3346);
    g.set(x0 + 2, top - 10, GOLD);
    g.set(x0 + 10, top - 10, GOLD);
    g.set(x0 + 4, top - 13, GHOST_GREEN[2]);
    g.ellipse(x0 + 15, top - 3, 3, 2.5, 0xc8505a);
    g.set(x0 + 17, top - 6, 0xf2e6c8);
    g.set(x0 + 18, top - 7, 0xf2e6c8);
    // 물약 병 셋 (녹·분홍·하늘)
    for (const [dx, c] of [[22, GHOST_GREEN[2]], [26, 0xf8a8c8], [30, 0x9ad8ff]] as const) {
      g.rect(x0 + dx, top - 5, 3, 5, c);
      g.set(x0 + dx, top - 5, lighten(c, 0.6));
      g.set(x0 + dx + 1, top - 6, 0xd8c8a8);
      g.set(x0 + dx + 1, top - 7, 0x8a6a40);
    }
    // 금화 상자
    g.rect(x0 + 32, top - 4, 6, 4, 0x6a4a2a);
    g.hline(x0 + 32, x0 + 37, top - 5, 0xf0c850);
    g.set(x0 + 34, top - 6, 0xfff0a0);
    g.set(x0 + 33, top - 2, GOLD);
  });
  // 좌판 B (청록 천 · 복숭아/청록 차양): 해골 등 · 접은 천 더미 · 진주 접시 · 소라
  stall(72, hexes(["#4f8a8a", "#3e7476", "#305e62", "#244a4e"]), 0xf2c4a8, 0x3e7476, (x0, top) => {
    // 해골 등
    g.rect(x0 + 4, top - 7, 6, 5, BONE);
    g.rect(x0 + 5, top - 2, 4, 2, BONE);
    g.set(x0 + 5, top - 5, GHOST_GREEN[2]);
    g.set(x0 + 8, top - 5, GHOST_GREEN[2]);
    g.set(x0 + 7, top - 9, GHOST_GREEN[1]);
    // 접은 천 더미 (분홍 · 노랑 · 하늘)
    for (const [dy, c] of [[0, 0xf4b8c8], [2, 0xfbe19a], [4, 0x9ad0e8]] as const) {
      g.rect(x0 + 14, top - 2 - dy, 9, 2, c);
      g.set(x0 + 14, top - 2 - dy, lighten(c, 0.4));
    }
    // 진주 접시
    g.hline(x0 + 25, x0 + 31, top - 1, 0xc8c0b0);
    for (const dx of [26, 28, 30, 27, 29]) g.set(x0 + dx, top - 2 - (dx === 27 || dx === 29 ? 1 : 0), dx % 2 ? 0xfffaf0 : 0xf0e8f8);
    // 소라
    g.ellipse(x0 + 34, top - 3, 2.5, 2, 0xf4c8b0);
    g.set(x0 + 35, top - 4, 0xe8987a);
  });
  toneOutline(g, 0.36);
  return g;
}

// ── 유령 상인 (반투명 선장 유령 — 등불을 들고 둥실, 2장) ──
export const MERCHANT_W = 24;
export const MERCHANT_H = 34;
export function ghostMerchantArt(): { grid: Grid; frameW: number; frameH: number } {
  const W = MERCHANT_W;
  const H = MERCHANT_H;
  const g = new Grid(W * 2, H);
  for (let f = 0; f < 2; f++) {
    const one = new Grid(W, H);
    const cx = 11;
    // 몸 (아래로 갈수록 투명해지며 너덜너덜한 자락)
    for (let y = 10; y < H - 1; y++) {
      const half = y < 14 ? 4 + (y - 10) * 0.6 : 6.5 + Math.min(2, (y - 14) * 0.15);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const hem = H - 2 - Math.round(Math.abs(Math.sin(x * 1.3 + f * 1.7)) * 3);
        if (y > hem) continue;
        const fade = y > H - 9 ? 1 - (y - (H - 9)) / 9 : 1;
        const coat = y >= 15 && y < H - 6;
        let c: Color = 0xdff4ee;
        if (coat) c = x < cx - 1 ? 0x3a4466 : x > cx + 1 ? 0x2a3252 : 0x323b5c; // 남색 선장 외투 (가운데 여밈)
        if (coat && x === cx && y % 3 === 0) c = GOLD; // 금단추
        one.set(x, y, c, Math.round((coat ? 235 : 205) * fade));
      }
    }
    // 얼굴 (둥근 유령 얼굴 · 녹빛 눈 · 흰 수염)
    one.ellipse(cx, 9, 4.6, 4.4, 0xe8faf4, 230);
    one.set(cx - 2, 9, GHOST_GREEN[2]);
    one.set(cx + 1, 9, GHOST_GREEN[2]);
    one.set(cx - 2, 8, GHOST_GREEN[0]);
    one.set(cx + 1, 8, GHOST_GREEN[0]);
    one.hline(cx - 3, cx + 2, 12, 0xffffff);
    one.hline(cx - 2, cx + 1, 13, 0xf0f6f4);
    one.set(cx - 4, 10, 0xc8e8e0);
    // 삼각 선장 모자 (금테 · 해골)
    one.rect(cx - 4, 2, 9, 3, 0x2e3346);
    one.hline(cx - 7, cx + 7, 5, 0x2e3346);
    one.set(cx - 7, 4, 0x2e3346);
    one.set(cx + 7, 4, 0x2e3346);
    one.hline(cx - 7, cx + 7, 6, GOLD);
    one.set(cx, 3, BONE);
    one.set(cx - 2, 1, 0x4a5270);
    one.hline(cx - 2, cx + 2, 1, 0x4a5270);
    // 팔 · 등불 (오른손 — 2장째엔 살짝 흔들려요)
    const lx = cx + 8;
    const ly = 18 + f;
    one.set(cx + 6, 16, 0x2a3252);
    one.set(cx + 7, 17, 0x2a3252);
    one.vline(lx, ly - 3, ly - 1, IRON);
    one.rect(lx - 2, ly, 5, 6, IRON);
    one.rect(lx - 1, ly + 1, 3, 4, GHOST_GREEN[1]);
    one.set(lx, ly + 2, GHOST_GREEN[0]);
    // 왼손 장부 (펼친 책)
    one.rect(cx - 9, 19, 5, 4, 0xf2ead2);
    one.vline(cx - 7, 19, 22, 0xb8a888);
    one.set(cx - 8, 20, 0x6a5a40);
    toneOutline(one, 0.3);
    g.draw(one, f * W, 0);
  }
  return { grid: g, frameW: W, frameH: H };
}

// ── 널빤지 (고물 ↔ 선착장 끝): 가로질러 깐 밝은 판자 + 양옆 밧줄 난간 ──
// 11/17 r2 사용자 "다리가 좁고 어디로 걷는지 몰라요" → 걷는 폭(18px)을 판자 그대로 그려요. 판 = 걷는 띠 (GHOST_PLANK_WALK).
//  plank = 판자 · 뒤(북쪽) 밧줄 난간 · 선착장 끝 서쪽 가장자리 밧줄 (사람 뒤) / plankFront = 앞(남쪽) 밧줄 난간 (사람 앞 — 다리를 가려요)
/** 널빤지 그림 왼쪽 위 (월드) · 크기 */
export const PLANK_IMG = { x: GHOST_PLANK.x0, y: GHOST_PLANK.y0 - 38, w: SEA_PIER_END.x + 10 - GHOST_PLANK.x0, h: 64 } as const;
/** 기둥 높이 (밧줄 머리) */
const POST_H = 10;
export function ghostPlankArt(): Grid {
  const { w: W, h: H } = PLANK_IMG;
  const g = new Grid(W, H);
  const y0 = GHOST_PLANK.y0 - PLANK_IMG.y;
  const y1 = GHOST_PLANK.y1 - PLANK_IMG.y;
  const pierX = SEA_PIER_END.x - PLANK_IMG.x;
  // 물 위 그늘 (판 아래 — 살짝 비쳐요)
  for (let x = 2; x < pierX; x++) for (let y = y1 + 2; y < y1 + 5; y++) g.set(x, y, 0x1a3040, 90 - (y - y1 - 2) * 25);
  // 옆 받침보 (짙은 나무) · 가로질러 깐 판자 (5px 마다 이음매, 못 두 줄)
  for (let x = 0; x < W - 2; x++) {
    g.set(x, y0 - 1, WOOD[4]);
    g.set(x, y1 + 1, WOOD[5]);
    for (let y = y0; y <= y1; y++) {
      const board = Math.floor(x / 5);
      const seam = x % 5 === 4;
      const shade = 0.12 + ((y - y0) / (y1 - y0)) * 0.3 + (hashU(board, y >> 2, 761) - 0.5) * 0.3;
      g.set(x, y, seam ? DECK_LIT[4] : pick(DECK_LIT, shade, x, y));
      if (!seam && x % 5 === 1 && (y === y0 + 1 || y === y1 - 1)) g.set(x, y, 0x8a8678);
    }
  }
  // 선착장 데크에 얹힌 끝 (쇠 띠)
  g.rect(pierX + 1, y0, 2, y1 - y0 + 1, IRON);
  // 뒤(북쪽) 밧줄 난간: 고물 기둥 ↔ 선착장 기둥 (두 가닥, 살짝 처져요)
  const rope = (xa: number, ya: number, xb: number, yb: number, sag: number, c: Color) => {
    const n = Math.max(1, Math.abs(xb - xa), Math.abs(yb - ya));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      g.set(Math.round(xa + (xb - xa) * t), Math.round(ya + (yb - ya) * t + Math.sin(t * Math.PI) * sag), c);
    }
  };
  const nTop = y0 - 2 - POST_H;
  rope(0, nTop + 1, pierX + 2, nTop + 1, 3, 0x9a8a62);
  rope(0, nTop + 5, pierX + 2, nTop + 5, 2, 0x7a6a48);
  // 선착장 끝 서쪽 가장자리 밧줄 (모서리 기둥 ↔ 다리 입구 북쪽 기둥 — 여기까지 막히고 그 아래가 열린 자리예요)
  const cornerY = SEA_PIER_END.y + 2 - PLANK_IMG.y;
  const cx = pierX + 2;
  g.vline(cx, cornerY - POST_H + 2, cornerY, WOOD[3]);
  g.set(cx, cornerY - POST_H + 1, WOOD[1]);
  rope(cx, cornerY - POST_H + 3, cx, nTop + 1, 0, 0x9a8a62);
  for (let y = cornerY - POST_H + 3; y <= nTop + 1; y++) g.set(cx + 1, y, 0x6a5a40);
  toneOutline(g, 0.34);
  return g;
}
/** 앞(남쪽) 밧줄 난간 (사람 앞에 그려요 — 깊이 = 널빤지 남쪽 가장자리) */
export function ghostPlankFrontArt(): Grid {
  const { w: W, h: H } = PLANK_IMG;
  const g = new Grid(W, H);
  const y1 = GHOST_PLANK.y1 - PLANK_IMG.y;
  const pierX = SEA_PIER_END.x - PLANK_IMG.x;
  const sTop = y1 + 2 - POST_H;
  for (let x = 0; x <= pierX + 2; x++) {
    const t = x / (pierX + 2);
    g.set(x, Math.round(sTop + 1 + Math.sin(t * Math.PI) * 3), 0x9a8a62);
    g.set(x, Math.round(sTop + 5 + Math.sin(t * Math.PI) * 2), 0x7a6a48);
  }
  toneOutline(g, 0.34);
  return g;
}
/** 다리 입구 기둥 등불 (고물 둘 · 선착장 끝 둘 — 원점 아래 가운데) */
export const GATE_POST_W = 9;
export const GATE_POST_H = POST_H + 9;
export function ghostGatePostArt(): Grid {
  const g = new Grid(GATE_POST_W, GATE_POST_H);
  const cx = 4;
  // 기둥 (둥근 나무 · 왼쪽 밝게) · 밧줄 매듭
  for (let y = 8; y < GATE_POST_H; y++) {
    g.set(cx - 1, y, WOOD[1]);
    g.set(cx, y, WOOD[3]);
    g.set(cx + 1, y, WOOD[5]);
  }
  g.hline(cx - 1, cx + 1, GATE_POST_H - 1, WOOD[5]);
  g.set(cx - 2, 10, 0x9a8a62);
  g.set(cx + 2, 10, 0x9a8a62);
  g.set(cx + 2, 14, 0x7a6a48);
  // 등불 (쇠 갓 · 녹빛 불 · 아래 받침)
  g.hline(cx - 2, cx + 2, 0, IRON);
  g.set(cx, 0, IRON_HI);
  g.rect(cx - 2, 1, 5, 6, IRON);
  g.rect(cx - 1, 2, 3, 4, GHOST_GREEN[1]);
  g.set(cx - 1, 2, GHOST_GREEN[0]);
  g.set(cx, 3, GHOST_GREEN[0]);
  g.hline(cx - 3, cx + 3, 7, IRON_HI);
  toneOutline(g, 0.36);
  return g;
}

/** 안개 한 뭉치 (부드러운 가장자리 — 선형 필터로 늘여 써요) */
export function ghostMistArt(): Grid {
  const W = 72;
  const H = 26;
  const g = new Grid(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2);
      const dy = (y + 0.5 - H / 2) / (H / 2);
      const n = (hashU(x >> 3, y >> 2, 771) - 0.5) * 0.25;
      const d = dx * dx + dy * dy * 1.2 + n;
      if (d >= 1) continue;
      g.set(x, y, mix(0xf2fbf8, 0xcfe6e2, y / H), Math.round(130 * (1 - d) ** 1.4));
    }
  return g;
}

/** 녹색 빛 번짐 (등불·창 — ADD) */
export function ghostGlowArt(): Grid {
  const S = 32;
  const g = new Grid(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
      if (d >= 1) continue;
      g.set(x, y, mix(0xe8fff0, 0x5affa0, Math.min(1, d * 1.4)), Math.round(255 * (1 - d) ** 1.7));
    }
  return g;
}

/** 물에 비친 배 그늘 (물높이 아래로 일렁이는 짙은 줄 · 녹빛 점) */
export function ghostReflectArt(): Grid {
  const W = G_DECK_X1 - G_DECK_X0;
  const g = new Grid(W, 14);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < W; x++) {
      const inset = y * 2;
      if (x < inset + 10 || x > W - 1 - inset) continue;
      if (hashU(x >> 1, y, 781) < 0.6 - y * 0.035) g.set(x, y, 0x1a3040, Math.round(120 - y * 7));
      else if (hashU(x, y, 783) < 0.05) g.set(x, y, GHOST_GREEN[2], 130);
    }
  return g;
}

/** 바닷가 그림 굽는 목록에 유령선 그림을 더해요 (SeaMap forEachSeaTexture가 불러요 — 미리 굽기 포함) */
export function forEachGhostTexture(tex: (key: string, build: () => Grid | { grid: Grid; frameW?: number; frameH?: number }, linear?: boolean) => void): void {
  const T = GHOST_TEX;
  tex(T.back, ghostBackArt);
  tex(T.front, ghostFrontArt);
  GHOST_SAILS.forEach((_s, i) => tex(T.sail(i), () => ghostSailArt(i)));
  tex(T.flag, ghostFlagArt);
  tex(T.stalls, ghostStallsArt);
  tex(T.merchant, ghostMerchantArt);
  tex(T.plank, ghostPlankArt);
  tex(T.plankFront, ghostPlankFrontArt);
  tex(T.gatePost, ghostGatePostArt);
  tex(T.mist, ghostMistArt, true);
  tex(T.glow, ghostGlowArt, true);
  tex(T.windows, ghostWindowsArt);
  tex(T.reflect, ghostReflectArt);
}
