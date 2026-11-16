import { BUMPER_GATE, BUMPER_RIM, BUMPER_RINK, BUMPER_YARD } from "@tomb/protocol";
import type { Interactable, Rect } from "../world/layout";

// 범퍼카장 배치 (11/16, 예전 다리 건너 묘역 자리) — 순수 데이터 (Phaser 없음 → bumper.test.ts·world.test.ts가 충돌·길·자리를 검사한다).
// 좌표 원본(마당·링크·입구·차 자리)은 protocol world.ts(BUMPER_YARD·BUMPER_RINK·BUMPER_GATE·BUMPER_SEATS),
// 그림은 bumper/bumperArt.ts + bumper/BumperView.ts, 타기·운전은 bumper/BumperRide.ts + logic/bumper.ts.
// 충돌은 layout.staticColliders()에 들어가 걷기 격자·고양이 길찾기·새로고침 복원 판정이 모두 같은 상자를 본다.
//
// 11/16 "좁다"는 요청으로 링크를 192×148 → 284×180 (달리는 바닥 약 1.9배), 타이어를 둘 더했다.
//
//   y=768 ━━━━━━━━━━━━━━━━━[강 건너 오솔길 → 입구까지]━━━━━━━━━━━━━━━  ╲ 강 남쪽 둑
//         [구경 벤치]        ┃ 「유령 범퍼카」 간판 ┃  [매표소] [구경 벤치]  ╲
//   y=816 ┏━━━━━━━━━━ 고무 테두리 ━━━━[입구 막대]━━━━━━━━━━━━━━━━┓  ← 귀퉁이와 둑 사이 틈 = 호박밭 가는 길
//         ┃    ▣ ▣ ▣ ▣ ▣ ▣ ▣ ▣  (세워 둔 범퍼카 8대)                 ┃
//         ┃   ◎ 타이어                          ◎ 타이어            ┃ → 호박밭 흙길
//         ┃                  ● 가운데 기둥                          ┃
//         ┃      ◎ 타이어                          ◎ 타이어          ┃
//   y=996 ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
//   y=1008 (아래 담 — 아래 테두리 밖에도 내려설 한 줄이 남는다)
//   x=608 (오리 연못 동쪽 둑)                                   x=912 (호박밭)

const T = (px: number) => Math.floor(px / 16);

/** 마당 바닥 타일 (BUMPER_YARD 칸. 강 남쪽 둑에 걸친 오른쪽 위 귀퉁이는 물 그림이 덮는다) */
export const YARD_TILES = { tx0: T(BUMPER_YARD.x), tx1: T(BUMPER_YARD.x + BUMPER_YARD.w) - 1, ty0: T(BUMPER_YARD.y), ty1: T(BUMPER_YARD.y + BUMPER_YARD.h) - 1 } as const;

export function inBumperYardTiles(tx: number, ty: number): boolean {
  return tx >= YARD_TILES.tx0 && tx <= YARD_TILES.tx1 && ty >= YARD_TILES.ty0 && ty <= YARD_TILES.ty1;
}

/** 마당 바닥: 돌 포장 (링크 바닥 철판은 그림이 덮는다). 마당 칸(inBumperYardTiles)에서만 부른다 */
export function bumperGround(): "stone" {
  return "stone";
}

/** 링크 안쪽 (달리는 바닥) */
export const RINK_INNER = {
  x: BUMPER_RINK.x + BUMPER_RIM,
  y: BUMPER_RINK.y + BUMPER_RIM,
  w: BUMPER_RINK.w - 2 * BUMPER_RIM,
  h: BUMPER_RINK.h - 2 * BUMPER_RIM,
} as const;

/** 링크 안 장애물 (동그라미, 받침 가운데). 혼자 타도 부딪힐 거리: 가운데 기둥 + 쌓은 타이어 넷 (11/16 링크가 넓어져 둘 더) — 세워 둔 차 줄 앞은 비운다 */
export type BumperPost = { kind: "pillar" | "tyre"; x: number; y: number; r: number };
export const BUMPER_POSTS: readonly BumperPost[] = [
  { kind: "pillar", x: 762, y: 918, r: 9 },
  { kind: "tyre", x: 686, y: 884, r: 7 },
  { kind: "tyre", x: 842, y: 878, r: 7 },
  { kind: "tyre", x: 696, y: 958, r: 7 },
  { kind: "tyre", x: 834, y: 952, r: 7 },
];

/** 입구 앞 (E로 타고, 내리면 여기 선다) */
export const BUMPER_DOOR = { x: BUMPER_GATE.x, y: BUMPER_GATE.y - 8 } as const;
/** 내릴 수 있는 곳: 링크 안 입구 둘레 이만큼 (차 가운데 기준) */
export const BUMPER_EXIT_R = 46;
/** 입구 안쪽 (내릴 수 있는 곳의 가운데) */
export const BUMPER_EXIT_AT = { x: BUMPER_GATE.x, y: RINK_INNER.y + 8 } as const;

/** 매표소 (받침 가운데) · 간판 아치 기둥 · 링크 네 귀퉁이 조명 기둥 */
export const BUMPER_BOOTH = { x: BUMPER_GATE.x + 50, y: BUMPER_GATE.y - 10 } as const;
export const BUMPER_ARCH = { x: BUMPER_GATE.x, y: BUMPER_GATE.y, half: 20 } as const;
export const BUMPER_POLES: readonly { x: number; y: number }[] = [
  { x: BUMPER_RINK.x + 2, y: BUMPER_RINK.y + 3 },
  { x: BUMPER_RINK.x + BUMPER_RINK.w - 2, y: BUMPER_RINK.y + 3 },
  { x: BUMPER_RINK.x + 2, y: BUMPER_RINK.y + BUMPER_RINK.h },
  { x: BUMPER_RINK.x + BUMPER_RINK.w - 2, y: BUMPER_RINK.y + BUMPER_RINK.h },
];

/**
 * 흩뿌리는 나무를 두지 않는 곳 (11/16): 입구 앞 간판 둘레(오솔길 끝 ~ 링크 위 테두리)와
 * 링크 오른쪽 위 귀퉁이 ↔ 강 남쪽 둑 사이 틈(호박밭 가는 길 — 나무 한 그루면 막힌다)
 */
export const BUMPER_KEEPOUT: readonly Rect[] = [
  { x: BUMPER_GATE.x - 56, y: BUMPER_YARD.y - 30, w: 112, h: 30 },
  { x: BUMPER_RINK.x + BUMPER_RINK.w - 8, y: BUMPER_YARD.y - 8, w: 60, h: 104 },
];

/** 미니맵·안내 장소 표시 자리 (링크 가운데) */
export const BUMPER_LANDMARK = { x: BUMPER_RINK.x + BUMPER_RINK.w / 2, y: BUMPER_RINK.y + BUMPER_RINK.h / 2 } as const;

/**
 * 걷는 사람 충돌: 고무 테두리 네 변(입구 틈은 막대가 막는다)·매표소. 링크 안은 차만 다닌다 (차는 logic/bumper가 테두리에서 튕긴다).
 * 간판 아치 기둥은 테두리 위에 서 있어 따로 막지 않는다
 */
export function bumperColliders(): Rect[] {
  const R = BUMPER_RINK;
  const t = BUMPER_RIM;
  return [
    { x: R.x, y: R.y, w: BUMPER_GATE.x0 - R.x, h: t },
    { x: BUMPER_GATE.x1, y: R.y, w: R.x + R.w - BUMPER_GATE.x1, h: t },
    { x: BUMPER_GATE.x0, y: R.y, w: BUMPER_GATE.x1 - BUMPER_GATE.x0, h: 4 }, // 입구 막대 (걷는 사람은 E로 타고 들어간다)
    { x: R.x, y: R.y, w: t, h: R.h },
    { x: R.x + R.w - t, y: R.y, w: t, h: R.h },
    { x: R.x, y: R.y + R.h - t, w: R.w, h: t },
    { x: BUMPER_BOOTH.x - 12, y: BUMPER_BOOTH.y - 10, w: 24, h: 10 },
  ];
}

export function bumperInteractables(): Interactable[] {
  return [{ id: "bumper:gate", kind: "bumper", x: BUMPER_DOOR.x, y: BUMPER_DOOR.y, r: 20, ax: BUMPER_DOOR.x, ay: BUMPER_DOOR.y, label: "범퍼카 타기" }];
}

/** 밤 빛 (WorldMap.staticLights → Atmosphere 번짐 + Lighting 어둠 구멍): 귀퉁이 조명 기둥 넷(색이 다르다)·간판·매표소 창 */
const POLE_TINTS = [0xff6aa8, 0x6ad8ff, 0xffd84a, 0x8aff7a] as const;
export const BUMPER_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  ...BUMPER_POLES.map((p, i) => ({ x: p.x, y: p.y - 24, scale: 0.75, tint: POLE_TINTS[i], base: 0.85 })),
  { x: BUMPER_ARCH.x, y: BUMPER_ARCH.y - 30, scale: 0.9, tint: 0xffc8f0, base: 0.8 },
  { x: BUMPER_BOOTH.x, y: BUMPER_BOOTH.y - 12, scale: 0.4, tint: 0xffe0a0, base: 0.6 },
];
