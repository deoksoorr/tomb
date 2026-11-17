import { SEA_GHOST_BERTH, SEA_PIER_END } from "@tomb/protocol";

// 11/17 유령선 자리 (순수 — 그림 ghostShipArt · 장면 GhostShip · 시험 ghostShipLayout.test 가 같은 값을 봐요).
// 배는 protocol SEA_GHOST_BERTH (카약 선착장 남쪽 깊은 물 — y 722 아래를 비워 둔 자리)에 대요. 서버는 배 위치를 몰라요
// (갑판 위 사람은 그냥 그 자리에 서 있는 것으로 MOVE를 보내요 — 배가 없는 화면에선 물 위에 서 있는 것처럼 보여요).
//
// 11/17 r2 사용자 "갑판이 좁아 벽에 계속 부딪혀요" → 배를 키우고 갑판 앞쪽 넓은 마당을 통째로 걸어요 (이전 띠의 두 배 넘게).
//   뒤쪽 줄(뒤 뱃전 앞)은 돛대 · 좌판 · 상인 · 통과 상자 · 고물 선실이 늘어선 막힌 줄이에요 (판자를 어둡게 그려 구분해요).
//
//   뱃머리(서쪽) ── 앞돛대 · 좌판 A · 상인(큰 돛대 앞) · 좌판 B · 고물 선실(뒷돛대) ─ 고물 층계참 ═ 널빤지 ═ 선착장 끝 데크
//              └────────── 밝은 판자 마당 (걸어요) ──────────┘
//                   ┗ 앞쪽 뱃전 밧줄 사다리 (헤엄쳐 와서 올라요)

/** 배 그림(뒤·앞 판) 크기와 왼쪽 위 월드 자리 — 그림 한 칸 = 월드 1px */
export const GHOST_ART_W = 272;
export const GHOST_ART_H = 228;
// r2 커진 배는 동쪽(선착장 쪽)으로 조금 — 서쪽 튜브가 떠다니는 폭(460±44)과 뱃머리가 겹치지 않고, 널빤지는 짧아져요
export const GHOST_ORIGIN = { x: SEA_GHOST_BERTH.ship.x - 124, y: SEA_GHOST_BERTH.ship.y - 182 } as const;
/** 그림 좌표 → 월드 */
export const gw = (gx: number, gy: number) => ({ x: GHOST_ORIGIN.x + gx, y: GHOST_ORIGIN.y + gy });

/** 배 그림 안 줄 (그림 좌표): 물높이 · 갑판 가운데 · 갑판 반폭 */
export const G_WATER = 208;
export const G_DECK_CY = 144;
export const G_DECK_HALF = 36;
/** 갑판이 이어지는 가로 범위 (뱃머리 끝 ~ 고물 끝, 그림 좌표) */
export const G_DECK_X0 = 16;
export const G_DECK_X1 = 256;
/** 뒤쪽 막힌 줄이 끝나는 선 (그림 y) — 이 아래가 걷는 마당 */
export const G_BACK_ROW = 128;
/** 고물 층계참 (선실 동쪽 · 널빤지가 닿는 곳 — 뒤 뱃전 앞까지 걸어요) */
export const G_LANDING_X0 = 238;
/** 앞 뱃전 · 뒤 뱃전과 발 사이 여유 (그림 px) */
const FRONT_INSET = 4;
const BACK_INSET = 4;
/** 걷는 가로 범위 (뱃머리 쪽은 뾰족해 끝까지는 못 가요) */
export const G_WALK_X0 = 30;
export const G_WALK_X1 = G_DECK_X1 - 4;

/** 갑판 너비 비율 0..1 (뱃머리는 뾰족, 고물은 거의 네모 — 끝만 살짝 둥글게) */
export function deckWidth(gx: number): number {
  const u = (gx - G_DECK_X0) / (G_DECK_X1 - G_DECK_X0);
  if (u <= 0 || u >= 1.0001) return 0;
  const bow = u < 0.3 ? Math.sqrt(u / 0.3) : 1;
  const stern = u > 0.96 ? 1 - 0.1 * ((u - 0.96) / 0.04) ** 2 : 1;
  return Math.max(0, Math.min(bow, stern));
}
/** 갑판 뒤(북쪽)·앞(남쪽) 가장자리 (그림 y) */
export const deckBack = (gx: number) => G_DECK_CY - G_DECK_HALF * deckWidth(gx);
export const deckFront = (gx: number) => G_DECK_CY + G_DECK_HALF * deckWidth(gx);

/** 걷는 마당 위·아래 가장자리 (그림 y). 층계참은 뒤 뱃전 앞까지 */
export const walkTop = (gx: number) => (gx >= G_LANDING_X0 ? deckBack(gx) + BACK_INSET : Math.max(deckBack(gx) + BACK_INSET + 1, G_BACK_ROW));
export const walkBottom = (gx: number) => deckFront(gx) - FRONT_INSET;

/** 돛대 셋 (그림 좌표: 받침 x, 받침 y, 꼭대기 y) — 앞 · 큰 · 뒤 (뒷돛대는 선실 지붕 위) */
export const G_MASTS = [
  { x: 64, base: 120, top: 24 },
  { x: 138, base: 118, top: 4 },
  { x: 214, base: 84, top: 34 },
] as const;
/** 고물 선실 (그림 좌표 — 뒤쪽 막힌 줄 안) */
export const G_CABIN = { x0: 194, x1: 234, top: 86, base: G_BACK_ROW - 1 } as const;

type Rect = { x: number; y: number; w: number; h: number };
const toWorld = (r: Rect): Rect => ({ x: GHOST_ORIGIN.x + r.x, y: GHOST_ORIGIN.y + r.y, w: r.w, h: r.h });

/** 유령 상인 (발 자리 · 거래 판정 반지름) — 큰 돛대 앞, 좌판 둘 사이 (마당 맨 뒤 가장자리) */
export const G_MERCHANT = { x: 138, y: 131 } as const;
export const GHOST_MERCHANT = { ...gw(G_MERCHANT.x, G_MERCHANT.y), r: 34 } as const;
/** 갑판 위 막히는 것 (발 자리, 월드) — 마당 안에선 상인 하나뿐 (나머지는 뒤쪽 줄이라 마당 밖) */
export const GHOST_BLOCKS: readonly Rect[] = [toWorld({ x: G_MERCHANT.x - 7, y: G_BACK_ROW - 4, w: 14, h: G_MERCHANT.y - G_BACK_ROW + 6 })];
/** 좌판 둘 가운데 앞 (판정 · 시험) */
export const GHOST_STALLS = [{ ...gw(103, G_BACK_ROW + 2) }, { ...gw(173, G_BACK_ROW + 2) }] as const;
/** 걷는 마당을 감싸는 상자 (월드 — 대략 범위·시험용) */
export const GHOST_DECK: Rect = toWorld({ x: G_WALK_X0, y: deckBack(G_LANDING_X0) + BACK_INSET, w: G_WALK_X1 - G_WALK_X0, h: deckFront(G_DECK_X1 / 2) - FRONT_INSET - deckBack(G_LANDING_X0) - BACK_INSET });

/**
 * 널빤지 (고물 층계참 ↔ 선착장 끝 데크 서쪽 가장자리). 둘이 나란히 설 만큼 넓게 (걷는 폭 18px — 그림 판자 폭 그대로).
 * from = 배 쪽 끝 (갑판 위 내려서는 자리), to = 선착장 끝 데크 위 내려서는 자리
 */
export const PLANK_WALK_W = 18;
const PLANK_Y0 = SEA_PIER_END.y + SEA_PIER_END.h - 2 - PLANK_WALK_W;
export const GHOST_PLANK = {
  x0: GHOST_ORIGIN.x + G_DECK_X1,
  x1: SEA_PIER_END.x + 6,
  /** 걷는 띠 위·아래 (월드 y) · 가운데 */
  y0: PLANK_Y0,
  y1: PLANK_Y0 + PLANK_WALK_W,
  y: PLANK_Y0 + PLANK_WALK_W / 2,
  from: { x: GHOST_ORIGIN.x + G_LANDING_X0 + 6, y: PLANK_Y0 + PLANK_WALK_W / 2 },
  to: { x: SEA_PIER_END.x + 16, y: PLANK_Y0 + PLANK_WALK_W / 2 },
} as const;
/** 널빤지 위 걷는 띠 (발 자리, 월드) — 고물 층계참과 선착장 끝 데크에 겹쳐 이어져요 */
export const GHOST_PLANK_WALK: Rect = { x: GHOST_PLANK.x0 - 6, y: GHOST_PLANK.y0, w: GHOST_PLANK.x1 - GHOST_PLANK.x0 + 6, h: PLANK_WALK_W };
/** 선착장 끝 다리 입구 등불 기둥 둘 (널빤지 위·아래 끝, 데크 서쪽 가장자리 바로 안) */
export const GHOST_GATE_POSTS = [
  { x: SEA_PIER_END.x + 2, y: GHOST_PLANK.y0 - 2 },
  { x: SEA_PIER_END.x + 2, y: GHOST_PLANK.y1 + 2 },
] as const;
/** 밧줄 사다리 (앞 뱃전, 물 쪽 끝 = 헤엄치는 사람이 잡는 자리 · 올라선 갑판 자리) */
export const G_LADDER_X = 96;
export const GHOST_LADDER = { x: GHOST_ORIGIN.x + G_LADDER_X, water: GHOST_ORIGIN.y + G_WATER + 10, deck: GHOST_ORIGIN.y + Math.round(walkBottom(G_LADDER_X)) - 3, r: 24 } as const;
/** 헤엄치는 사람·놀거리가 부딪히는 배 몸 (월드) */
export const GHOST_HULL: Rect = toWorld({ x: 12, y: 96, w: G_DECK_X1 + 4 - 12, h: G_WATER - 2 - 96 });

/** (그림 좌표) 걷는 마당 안인지 */
export function onGhostDeckArt(gx: number, gy: number): boolean {
  if (gx < G_WALK_X0 || gx > G_WALK_X1) return false;
  return gy >= walkTop(gx) && gy <= walkBottom(gx);
}

/** (x,y)가 걸어 다니는 갑판 안인지 (막힌 곳 빼고) */
export function onGhostDeck(x: number, y: number): boolean {
  if (!onGhostDeckArt(x - GHOST_ORIGIN.x, y - GHOST_ORIGIN.y)) return false;
  return !GHOST_BLOCKS.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
}

/** 널빤지 띠 안인지 */
export function onGhostPlank(x: number, y: number): boolean {
  const r = GHOST_PLANK_WALK;
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** 배 위(갑판 마당 · 널빤지) 걸을 수 있는 자리 */
export const onGhostWalk = (x: number, y: number) => onGhostPlank(x, y) || onGhostDeck(x, y);

/**
 * 걸을 수 없는 자리로 나간 발을 되돌려요 — 넘어간 축만 되돌려서 가장자리를 따라 미끄러져요 (벽에 박혀 멈추지 않게).
 * px·py = 지난(걸을 수 있던) 자리
 */
export function clampGhostDeck(x: number, y: number, px: number, py: number): { x: number; y: number } {
  if (onGhostWalk(x, y)) return { x, y };
  // 한 축씩 되돌려 봐요 (옆으로 미끄러지기)
  if (onGhostWalk(x, py)) return { x, y: py };
  if (onGhostWalk(px, y)) return { x: px, y };
  // 둥근 뱃머리·고물 끝처럼 두 축이 같이 막히면 가장자리 안쪽으로 한 칸씩 당겨요
  for (let d = 1; d <= 3; d++)
    for (const [dx, dy] of [[0, -d], [0, d], [-d, 0], [d, 0]] as const) if (onGhostWalk(x + dx, py + dy)) return { x: x + dx, y: py + dy };
  return { x: px, y: py };
}
