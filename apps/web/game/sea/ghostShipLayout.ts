import { SEA_GHOST_BERTH, SEA_PIER_END } from "@tomb/protocol";

// 11/17 유령선 자리 (순수 — 그림 ghostShipArt · 장면 GhostShip · 시험 ghostShipLayout.test 가 같은 값을 봐요).
// 배는 protocol SEA_GHOST_BERTH (카약 선착장 남쪽 깊은 물 — y 722 아래를 비워 둔 자리)에 대요. 서버는 배 위치를 몰라요
// (갑판 위 사람은 그냥 그 자리에 서 있는 것으로 MOVE를 보내요 — 배가 없는 화면에선 물 위에 서 있는 것처럼 보여요).
//
//   뱃머리(서쪽) ── 앞돛대 · 좌판 A · 상인 · 좌판 B · 큰 돛대 ── 고물 선실·뒷돛대 ═ 널빤지 ═ 선착장 끝 데크
//                               (갑판 아래쪽 띠를 걸어 다녀요)
//                          ┗ 앞쪽 뱃전 밧줄 사다리 (헤엄쳐 와서 올라요)

/** 배 그림(뒤·앞 판) 크기와 왼쪽 위 월드 자리 — 그림 한 칸 = 월드 1px */
export const GHOST_ART_W = 208;
export const GHOST_ART_H = 196;
export const GHOST_ORIGIN = { x: SEA_GHOST_BERTH.ship.x - GHOST_ART_W / 2, y: SEA_GHOST_BERTH.ship.y + 18 - GHOST_ART_H } as const;
/** 그림 좌표 → 월드 */
export const gw = (gx: number, gy: number) => ({ x: GHOST_ORIGIN.x + gx, y: GHOST_ORIGIN.y + gy });

/** 배 그림 안 줄 (그림 좌표): 물높이 · 갑판 가운데 · 갑판 반폭 · 뱃전 높이 */
export const G_WATER = 178;
export const G_DECK_CY = 130;
export const G_DECK_HALF = 22;
/** 갑판이 이어지는 가로 범위 (뱃머리 끝 ~ 고물 끝, 그림 좌표) */
export const G_DECK_X0 = 16;
export const G_DECK_X1 = 196;

/** 갑판 너비 비율 0..1 (뱃머리는 뾰족, 고물은 살짝 좁게) */
export function deckWidth(gx: number): number {
  const u = (gx - G_DECK_X0) / (G_DECK_X1 - G_DECK_X0);
  if (u <= 0 || u >= 1.0001) return 0;
  const bow = u < 0.32 ? Math.sqrt(u / 0.32) : 1;
  const stern = u > 0.82 ? 1 - 0.22 * ((u - 0.82) / 0.18) ** 2 : 1;
  return Math.max(0, Math.min(bow, stern));
}
/** 갑판 뒤(북쪽)·앞(남쪽) 가장자리 (그림 y) */
export const deckBack = (gx: number) => G_DECK_CY - G_DECK_HALF * deckWidth(gx);
export const deckFront = (gx: number) => G_DECK_CY + G_DECK_HALF * deckWidth(gx);

/** 돛대 셋 (그림 좌표: 받침 x, 받침 y, 꼭대기 y) — 앞 · 큰 · 뒤 */
export const G_MASTS = [
  { x: 52, base: 116, top: 22 },
  { x: 104, base: 112, top: 4 },
  { x: 164, base: 100, top: 42 },
] as const;

type Rect = { x: number; y: number; w: number; h: number };
const toWorld = (r: Rect): Rect => ({ x: GHOST_ORIGIN.x + r.x, y: GHOST_ORIGIN.y + r.y, w: r.w, h: r.h });

/** 걸어 다니는 갑판 (발 자리, 월드) — 좌판 앞 띠 */
export const GHOST_DECK: Rect = toWorld({ x: 44, y: 122, w: 146, h: 26 });
/** 갑판 위 막히는 것 (발 자리, 월드): 좌판 둘 · 상인 · 돛대 받침 · 고물 선실 */
export const GHOST_BLOCKS: readonly Rect[] = [
  toWorld({ x: 64, y: 108, w: 34, h: 18 }),
  toWorld({ x: 110, y: 108, w: 34, h: 18 }),
  toWorld({ x: 98, y: 112, w: 12, h: 14 }),
  toWorld({ x: 48, y: 112, w: 8, h: 12 }),
  toWorld({ x: 150, y: 96, w: 28, h: 26 }),
];
/** 유령 상인 (발 자리 · 거래 판정 반지름) · 좌판 둘 가운데 (판정) */
export const GHOST_MERCHANT = { ...gw(104, 126), r: 30 } as const;
export const GHOST_STALLS = [{ ...gw(81, 126) }, { ...gw(127, 126) }] as const;

/**
 * 널빤지 (고물 뒤쪽 ↔ 선착장 끝 데크 서쪽 가장자리). 선착장 끝 데크(SEA_PIER_END)의 서쪽 가장자리에 걸쳐요.
 * from = 배 쪽 끝 (갑판 위 내려서는 자리), to = 선착장 끝 데크 위 내려서는 자리
 */
const PLANK_Y = SEA_PIER_END.y + 30;
export const GHOST_PLANK = {
  x0: GHOST_ORIGIN.x + 182,
  x1: SEA_PIER_END.x + 6,
  y: PLANK_Y,
  from: { x: GHOST_ORIGIN.x + 168, y: GHOST_ORIGIN.y + 136 },
  to: { x: SEA_PIER_END.x + 16, y: PLANK_Y + 4 },
} as const;
/** 널빤지에 오르는 판정 (선착장 끝 서쪽 가장자리 가까이 · 갑판 고물 쪽) */
export const GHOST_BOARD_R = 26;
/** 밧줄 사다리 (앞 뱃전, 물 쪽 끝 = 헤엄치는 사람이 잡는 자리 · 올라선 갑판 자리) */
export const GHOST_LADDER = { x: GHOST_ORIGIN.x + 74, water: GHOST_ORIGIN.y + G_WATER + 10, deck: GHOST_ORIGIN.y + 140, r: 24 } as const;
/** 헤엄치는 사람·놀거리가 부딪히는 배 몸 (월드) */
export const GHOST_HULL: Rect = toWorld({ x: 12, y: 96, w: 188, h: G_WATER - 94 });

/** (x,y)가 걸어 다니는 갑판 안인지 (막힌 곳 빼고) */
export function onGhostDeck(x: number, y: number): boolean {
  const d = GHOST_DECK;
  if (x < d.x || x > d.x + d.w || y < d.y || y > d.y + d.h) return false;
  return !GHOST_BLOCKS.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
}

/** 갑판 밖으로 나간 발을 가장 가까운 갑판 자리로 (막힌 곳에 들어가면 들어온 쪽으로 밀어내요) */
export function clampGhostDeck(x: number, y: number, px: number, py: number): { x: number; y: number } {
  const d = GHOST_DECK;
  let nx = Math.max(d.x + 1, Math.min(d.x + d.w - 1, x));
  let ny = Math.max(d.y + 1, Math.min(d.y + d.h - 1, y));
  for (const b of GHOST_BLOCKS) {
    if (!(nx > b.x && nx < b.x + b.w && ny > b.y && ny < b.y + b.h)) continue;
    // 지난 자리에서 들어온 축만 되돌려요 (옆으로 미끄러지는 건 그대로)
    if (!(px > b.x && px < b.x + b.w)) nx = px;
    else if (!(py > b.y && py < b.y + b.h)) ny = py;
    else ny = b.y + b.h + 1;
  }
  return { x: nx, y: ny };
}
