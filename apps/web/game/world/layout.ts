import {
  ALTAR,
  FURNITURE,
  GRID_DY,
  GRID_Y0,
  MAP_COLS,
  MAP_WIDTH,
  SHOP,
  SHOP_DOOR,
  TILE,
  type Furniture,
} from "@tomb/protocol";

// 정적 소품 배치 (순수 데이터). 묘비·좌석·스폰 좌표는 packages/protocol/src/world.ts가 원본이고,
// 여기서는 그 사이를 채우는 나무·석등·연못·탁자·바닥 종류만 정한다. world.test.ts가 겹침을 검사한다.

export type Rect = { x: number; y: number; w: number; h: number };
export type PropKind = "tree" | "deadTree" | "lantern" | "table" | "altar";
export type PropDef = { kind: PropKind; x: number; y: number; variant: number };

/** 왼쪽 정원의 연못 (타원) */
export const POND = { x: 150, y: 336, rx: 44, ry: 17 } as const;
/** 의자 사이 돌탁자 (오른쪽: cA·cB, 왼쪽: cE·cF) */
export const TABLES: readonly { x: number; y: number }[] = [
  { x: 832, y: 374 },
  { x: 246, y: 374 },
];

const CX = MAP_WIDTH / 2;

/** 위쪽 고정 구역(입구·제단·정원)의 소품. 좌우 정원은 x=512 기준 대칭에 가깝게 */
export const UPPER_PROPS: readonly PropDef[] = [
  { kind: "altar", x: ALTAR.x, y: ALTAR.y, variant: 0 },
  ...TABLES.map((t) => ({ kind: "table" as const, x: t.x, y: t.y, variant: 0 })),
  // 석등: 입구 양옆, 제단 양옆, 광장 모서리, 정원
  { kind: "lantern", x: CX - 48, y: 66, variant: 0 },
  { kind: "lantern", x: CX + 48, y: 66, variant: 0 },
  { kind: "lantern", x: CX - 60, y: 124, variant: 0 },
  { kind: "lantern", x: CX + 60, y: 124, variant: 0 },
  { kind: "lantern", x: 320, y: 268, variant: 0 },
  { kind: "lantern", x: 704, y: 268, variant: 0 },
  { kind: "lantern", x: 202, y: 300, variant: 0 },
  { kind: "lantern", x: 902, y: 300, variant: 0 },
  { kind: "lantern", x: 60, y: 196, variant: 0 },
  { kind: "lantern", x: 964, y: 196, variant: 0 },
  // 왼쪽 정원 고목
  { kind: "tree", x: 60, y: 84, variant: 0 },
  { kind: "tree", x: 190, y: 76, variant: 1 },
  { kind: "deadTree", x: 262, y: 150, variant: 0 },
  { kind: "tree", x: 56, y: 252, variant: 1 },
  { kind: "deadTree", x: 60, y: 396, variant: 1 },
  { kind: "tree", x: 300, y: 330, variant: 1 },
  // 오른쪽 정원 고목
  { kind: "tree", x: 964, y: 84, variant: 1 },
  { kind: "tree", x: 834, y: 76, variant: 0 },
  { kind: "deadTree", x: 762, y: 150, variant: 1 },
  { kind: "tree", x: 968, y: 252, variant: 0 },
  { kind: "tree", x: 788, y: 250, variant: 1 },
  { kind: "deadTree", x: 964, y: 396, variant: 0 },
  { kind: "tree", x: 724, y: 330, variant: 0 },
];

/** 산책로(블록 사이) 가운데 x */
const WALK_XS = [272, MAP_WIDTH - 272];

/** 묘비 격자 구역의 소품. 행 수에 따라 아래로 늘어난다 */
export function gridProps(rows: number): PropDef[] {
  const out: PropDef[] = [];
  for (let r = 0; r < rows + 1; r++) {
    const y = GRID_Y0 + r * GRID_DY + 40;
    // 좌우 돌담 옆 고목 (번갈아)
    if (r % 2 === 0) out.push({ kind: r % 4 === 0 ? "tree" : "deadTree", x: 48, y, variant: r % 2 });
    else out.push({ kind: r % 4 === 1 ? "tree" : "deadTree", x: MAP_WIDTH - 48, y, variant: (r + 1) % 2 });
    // 산책로 석등 (3행마다, 좌우 번갈아)
    if (r % 3 === 1) out.push({ kind: "lantern", x: WALK_XS[(r >> 1) % 2], y, variant: 0 });
    // 중앙 통로 석등 (3행마다, 좌우 번갈아)
    if (r % 3 === 2) out.push({ kind: "lantern", x: r % 2 ? CX - 22 : CX + 22, y, variant: 0 });
  }
  return out;
}

/** 소품 충돌 박스 (좌상단 기준). 나무는 줄기만 막는다 */
export function propCollider(p: PropDef): Rect | null {
  switch (p.kind) {
    case "tree":
    case "deadTree":
      return { x: p.x - 4, y: p.y - 5, w: 8, h: 5 };
    case "lantern":
      return { x: p.x - 4, y: p.y - 5, w: 8, h: 5 };
    case "table":
      return { x: p.x - 10, y: p.y - 6, w: 20, h: 6 };
    case "altar":
      return { x: p.x - 19, y: p.y - 12, w: 38, h: 12 };
  }
}

/** 유령 잡화점 오두막 충돌 박스 (문은 아래 가운데, 문 앞 SHOP_DOOR에서 들어간다) */
export function shopCollider(): Rect {
  return { x: SHOP.x - 28, y: SHOP.y - 18, w: 56, h: 18 };
}

/** 문 앞에 서 있으면 들어갈 수 있다 */
export const SHOP_ENTER_RADIUS = 12;
export function nearShopDoor(x: number, y: number, radius = SHOP_ENTER_RADIUS): boolean {
  return Math.hypot(x - SHOP_DOOR.x, y - SHOP_DOOR.y) <= radius;
}

/** 좌석 수에 따른 벤치 폭 (2인 40, 3인 56, 4인 72) */
export function benchWidth(f: Furniture): number {
  const n = f.seatOffsets.length;
  return n >= 4 ? 72 : n >= 3 ? 56 : 40;
}

export function furnitureCollider(f: Furniture): Rect {
  if (f.kind === "bench") {
    const w = benchWidth(f);
    return { x: f.x - w / 2, y: f.y - 7, w, h: 7 };
  }
  return { x: f.x - 6, y: f.y - 6, w: 12, h: 6 };
}

export function pondColliders(): Rect[] {
  const { x, y, rx, ry } = POND;
  // 타원을 두 개의 사각형으로 근사
  return [
    { x: x - rx + 3, y: y - ry / 2, w: rx * 2 - 6, h: ry },
    { x: x - rx / 2, y: y - ry + 2, w: rx, h: ry * 2 - 4 },
  ];
}

export function allFurnitureColliders(): Rect[] {
  return FURNITURE.map(furnitureCollider);
}

// ── 바닥 ──
export type GroundKind = "grass" | "dirt" | "stone" | "wallTop" | "wallFace" | "wallSide" | "gate";

const MID_TX = MAP_COLS / 2; // 32
/** 정문 (윗담 가운데 4칸) */
export const GATE_TX0 = MID_TX - 2;
export const GATE_TX1 = MID_TX + 1;
const AISLE_TX0 = MID_TX - 1;
const AISLE_TX1 = MID_TX;
/** 블록 사이 산책로 (x 256..288, 736..768) */
const WALK_TX: readonly [number, number][] = [
  [16, 17],
  [MAP_COLS - 18, MAP_COLS - 17],
];
const GRID_TY0 = GRID_Y0 / TILE;

/** 묘비 행 사이 가로 오솔길 (묘비 받침 바로 아래) */
export function isRowPathTile(ty: number): boolean {
  const y = ty * TILE;
  if (y < GRID_Y0) return false;
  return (y - GRID_Y0 - TILE) % GRID_DY === 0;
}

export function groundKind(tx: number, ty: number): GroundKind {
  const lastCol = MAP_COLS - 1;
  if (ty <= 1) {
    if (tx >= GATE_TX0 && tx <= GATE_TX1) return "gate";
    return ty === 0 ? "wallTop" : "wallFace";
  }
  if (tx <= 1 || tx >= lastCol - 1) return "wallSide";
  const inner = tx >= 3 && tx <= lastCol - 3;
  // 제단·부활 대기석 광장 포석 (중앙 통로보다 우선)
  if (ty >= 6 && ty <= 16 && tx >= 19 && tx <= lastCol - 19) return "stone";
  if (tx >= AISLE_TX0 && tx <= AISLE_TX1) return "dirt";
  // 입구 앞마당
  if (ty >= 2 && ty <= 5 && tx >= MID_TX - 4 && tx <= MID_TX + 3) return "dirt";
  // 광장과 양쪽 정원을 잇는 가로길, 묘역 바로 위 가로길
  if ((ty === 11 || ty === GRID_TY0 - 2) && inner) return "dirt";
  // 탁자·의자 앞
  if (ty === 23 && ((tx >= 13 && tx <= 17) || (tx >= lastCol - 17 && tx <= lastCol - 13))) return "dirt";
  if (ty >= GRID_TY0 - 2) {
    for (const [a, b] of WALK_TX) if (tx >= a && tx <= b) return "dirt";
    if (isRowPathTile(ty) && inner) return "dirt";
  }
  return "grass";
}
