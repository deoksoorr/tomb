import type { Interactable, Rect } from "./layout";
import { darken, Grid, lighten, makeCanvas } from "../sprites/pixel";
import type { LightSpot } from "./WorldMap";

// 행운권 판매대 (유령 잡화점 동쪽 풀밭, 정문에서 내려오는 길 바로 서쪽). 앞(아래)에서 E/탭 → 행운권 창 (components/plaza/LotteryDialog, 서버 /api/lottery).
// layout.ts가 충돌·상호작용에 한 줄씩 더하고, 그림·밤 빛·이름표는 WorldMap이 놓는다. 그림은 코드로 그리는 픽셀아트 두 장(등불·네잎클로버 반짝임).

/** 판매대 바닥 가운데 (그림 원점) */
export const LOTTERY_KIOSK = { x: 684, y: 156 } as const;
/** 그림 한 장 크기 (두 장을 가로로 붙인다) */
export const KIOSK_ART_W = 30;
export const KIOSK_ART_H = 40;
/** 그림이 바닥 아래로 내려오는 줄 (그림자) */
const SHADOW_ROWS = 2;

/** 판매대 몸체 충돌 (계산대 + 뒤 벽 — 뒤로 돌아가 숨지 않게 조금 깊게) */
export function lotteryColliders(): Rect[] {
  return [{ x: LOTTERY_KIOSK.x - 10, y: LOTTERY_KIOSK.y - 9, w: 20, h: 9 }];
}

export function lotteryInteractables(): Interactable[] {
  const x = LOTTERY_KIOSK.x;
  const y = LOTTERY_KIOSK.y + 9;
  return [{ id: "portal:lottery", kind: "portal", portal: "lottery", x, y, r: 16, ax: x, ay: y, label: "행운권 보기" }];
}

/** 밤 빛 (WorldMap.staticLights): 매달린 등불, 계산대 안쪽 */
export const KIOSK_LIGHTS: readonly LightSpot[] = [
  { x: LOTTERY_KIOSK.x + 12, y: LOTTERY_KIOSK.y - 25, scale: 0.4, tint: 0xffd27a, base: 0.65 },
  { x: LOTTERY_KIOSK.x, y: LOTTERY_KIOSK.y - 20, scale: 0.45, tint: 0xffe2a6, base: 0.45 },
];

const OUT = 0x1f1a1c;
const WOOD = { hi: 0x9a7854, mid: 0x7a5d40, lo: 0x5a432e };
const RED = 0xd8434f;
const CREAM = 0xf4ecd8;
const GOLD = { hi: 0xffe9a0, mid: 0xf2c24a, lo: 0xb07c22 };
const CLOVER = { hi: 0x8ee07a, mid: 0x4fb04a, lo: 0x2f7a34 };

/** 네잎클로버 (가운데 cx, cy · 5×5) */
function clover(g: Grid, cx: number, cy: number, shine: boolean): void {
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.rect(cx + (dx < 0 ? -2 : 1), cy + (dy < 0 ? -2 : 1), 2, 2, CLOVER.mid);
  g.set(cx, cy, CLOVER.lo);
  g.set(cx + 1, cy + 2, CLOVER.lo);
  g.set(cx - 2, cy - 2, shine ? 0xffffff : CLOVER.hi);
}

/** 판매대 한 장 (frame 0·1 = 등불·클로버가 번갈아 반짝인다) */
function drawFrame(frame: number): Grid {
  const g = new Grid(KIOSK_ART_W, KIOSK_ART_H);
  const base = KIOSK_ART_H - SHADOW_ROWS - 1; // 계산대 맨 아래 줄
  // 뒤 벽 (안쪽 어둠) + 걸어 둔 행운권 쪽지
  g.rect(6, 11, 18, base - 11, 0x3a2a30);
  const tickets: readonly [number, number, number][] = [[8, 13, 0xf6d6e0], [12, 12, CREAM], [16, 13, 0xfff0b0], [20, 12, CREAM], [10, 17, 0xfff0b0], [18, 17, 0xf6d6e0]];
  for (const [x, y, c] of tickets) {
    g.rect(x, y, 3, 4, c);
    g.set(x + 1, y, RED);
  }
  // 기둥 둘
  g.rect(4, 9, 2, base - 9, WOOD.mid);
  g.vline(4, 9, base, WOOD.hi);
  g.rect(24, 9, 2, base - 9, WOOD.lo);
  // 계산대 (나무 판 + 앞판 네잎클로버 팻말)
  g.rect(3, 23, 24, 2, WOOD.hi);
  g.hline(3, 26, 23, lighten(WOOD.hi, 0.25));
  g.rect(4, 25, 22, base - 24, WOOD.mid);
  for (let y = 27; y < base; y += 3) g.hline(5, 24, y, WOOD.lo);
  g.rect(11, 26, 8, 7, CREAM);
  g.hline(11, 18, 32, darken(CREAM, 0.2));
  clover(g, 15, 29, frame === 1);
  // 계산대 위 행운권 뭉치 (빨간 띠)
  g.rect(7, 21, 5, 2, CREAM);
  g.hline(7, 11, 21, 0xfff8ec);
  g.vline(9, 21, 22, RED);
  // 줄무늬 차양 (빨강·크림 세로 줄, 아래 물결)
  for (let x = 1; x < 29; x++) {
    const c = Math.floor((x - 1) / 3) % 2 ? CREAM : RED;
    g.vline(x, 5, 9, c);
    if ((x - 1) % 3 !== 1) g.set(x, 10, c);
  }
  g.hline(1, 28, 5, lighten(RED, 0.35));
  // 꼭대기 금빛 간판 + 클로버
  g.rect(9, 0, 12, 5, GOLD.mid);
  g.hline(9, 20, 0, GOLD.hi);
  g.hline(9, 20, 4, GOLD.lo);
  clover(g, 15, 2, frame === 0);
  // 차양 끝에 매달린 등불 (번갈아 밝게)
  g.vline(27, 11, 12, 0x3a3434);
  g.rect(26, 13, 3, 4, frame ? 0xffe27a : 0xe0a440);
  g.set(27, 14, frame ? 0xfff6c8 : 0xffd27a);
  g.outline(OUT);
  // 바닥 그림자
  for (let x = 2; x < 28; x++) g.set(x, base + 1, 0x000000, x < 4 || x > 25 ? 40 : 70);
  return g;
}

/** 두 장을 가로로 붙인 캔버스 (WorldMap이 addCanvasTexture로 프레임 0·1을 나눈다). 브라우저에서만 부른다 */
export function lotteryKioskArt(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(KIOSK_ART_W * 2, KIOSK_ART_H);
  for (let f = 0; f < 2; f++) drawFrame(f).blit(ctx, f * KIOSK_ART_W, 0);
  return canvas;
}
