import { HUNT_GATE, playerBounds, SHOP_DOOR } from "@tomb/protocol";
import { buildGrid, type Pt, type Rect, type WalkGrid } from "../logic/pathfind";

// 11/16 [사냥] 버튼 → 사냥터 입구까지 걸어가기 (묘비 가기 GraveWalker·AutoWalk·pathfind A*를 그대로 쓴다).
// 걷기 격자 규칙(칸 크기·발 상자 여유·물 피하기)을 여기 한 곳에 두고 GraveWalker와 테스트가 같이 쓴다. 순수 함수 (Phaser 없음).

/** 걸어서 갈 수 있는 입구 (야근 빌딩은 따로 [버튼]이 없어 아직 없다). 11/19 shop = 유령 잡화점 문 (외치기 창 [상점에서 사기]) */
export type WalkPortal = "hunt" | "shop";

/** 걸어가 설 자리 (입구 상호작용 반경 PORTAL_RADIUS 안, 동굴 문 바로 앞)와 도착하면 바라볼 곳 */
export const PORTAL_WALK: Readonly<Record<WalkPortal, { goal: Pt; face: Pt }>> = {
  hunt: { goal: { x: HUNT_GATE.x, y: HUNT_GATE.y + 6 }, face: { x: HUNT_GATE.x, y: HUNT_GATE.y - 12 } },
  // 잡화점은 문 앞(SHOP_DOOR — 들어가는 반경 SHOP_ENTER_RADIUS 안)에 서서 문(위)을 바라본다. 도착하면 장면이 들어간다
  shop: { goal: { x: SHOP_DOOR.x, y: SHOP_DOOR.y }, face: { x: SHOP_DOOR.x, y: SHOP_DOOR.y - 12 } },
};

/** 격자 칸 (반 타일) */
export const WALK_CELL = 8;
/** 발 상자 (Player BODY_W×BODY_H, 원점 = 발바닥 가운데) + 여유 1px */
export const WALK_PAD = { l: 5, r: 5, t: 1, b: 6 } as const;

export type WalkBounds = { x: number; y: number; width: number; height: number; right: number; bottom: number };

/** 플레이어가 설 수 있는 범위 (물리 월드 경계와 같다 — WorldMap.applyBounds) */
export function villageBounds(): WalkBounds {
  const b = playerBounds();
  return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY, right: b.maxX, bottom: b.maxY };
}

/** 충돌 사각형 → 걷기 격자. water를 주면 물도 막는다 (헤엄칠 수는 있지만 되도록 피한다) */
export function walkGridOf(b: WalkBounds, rects: readonly Rect[], water?: (x: number, y: number) => boolean): WalkGrid {
  // 발 상자가 월드 경계 안에 머무는 곳만 (x ± 4, 위로 5)
  return buildGrid(b.width, b.height, WALK_CELL, rects, {
    ox: b.x,
    oy: b.y,
    pad: WALK_PAD,
    extraBlocked: (x, y) => x < b.x + WALK_PAD.l || x > b.right - WALK_PAD.r || y < b.y + WALK_PAD.b || y > b.bottom - 1 || !!water?.(x, y),
  });
}

/**
 * 격자 캐시: 충돌체 수가 같고 ttl 안이면 다시 만들지 않는다 (버튼을 연달아 눌러도·막혀서 다시 찾을 때도 가볍게).
 * 묘비·집이 생기거나 사라지면 충돌체 수가 바뀌어 새로 만든다
 */
export class WalkGridCache {
  private hit: { key: string; at: number; grid: WalkGrid } | null = null;
  constructor(private readonly ttlMs = 5_000) {}

  get(key: string, now: number, build: () => WalkGrid): WalkGrid {
    const h = this.hit;
    if (h && h.key === key && now - h.at < this.ttlMs) return h.grid;
    const grid = build();
    this.hit = { key, at: now, grid };
    return grid;
  }

  clear(): void {
    this.hit = null;
  }
}
