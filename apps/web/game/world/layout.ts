import {
  ALTAR,
  FURNITURE,
  GRID_DY,
  GRID_Y0,
  MAP_COLS,
  TILE,
  type Furniture,
} from "@tomb/protocol";

// 정적 소품 배치 (순수 데이터). 묘비·좌석·스폰 좌표는 packages/protocol/src/world.ts가 원본이고,
// 여기서는 그 사이를 채우는 나무·석등·연못·탁자·바닥 종류만 정한다. world.test.ts가 겹침을 검사한다.

export type Rect = { x: number; y: number; w: number; h: number };
export type PropKind = "tree" | "deadTree" | "lantern" | "table" | "altar";
export type PropDef = { kind: PropKind; x: number; y: number; variant: number };

/** 작은 연못 (타원) */
export const POND = { x: 96, y: 318, rx: 30, ry: 13 } as const;
/** 의자 cA·cB 사이 돌탁자 */
export const TABLE = { x: 440, y: 338 } as const;

/** 위쪽 고정 구역(입구·제단·벤치·연못)의 소품 */
export const UPPER_PROPS: readonly PropDef[] = [
  { kind: "altar", x: ALTAR.x, y: ALTAR.y, variant: 0 },
  { kind: "table", x: TABLE.x, y: TABLE.y, variant: 0 },
  // 석등: 입구 양옆, 제단 양옆, 벤치 옆
  { kind: "lantern", x: 272, y: 66, variant: 0 },
  { kind: "lantern", x: 368, y: 66, variant: 0 },
  { kind: "lantern", x: 252, y: 112, variant: 0 },
  { kind: "lantern", x: 388, y: 112, variant: 0 },
  { kind: "lantern", x: 158, y: 250, variant: 0 },
  { kind: "lantern", x: 564, y: 296, variant: 0 },
  // 고목
  { kind: "tree", x: 62, y: 84, variant: 0 },
  { kind: "tree", x: 578, y: 82, variant: 1 },
  { kind: "deadTree", x: 120, y: 156, variant: 0 },
  { kind: "tree", x: 540, y: 150, variant: 0 },
  { kind: "tree", x: 52, y: 230, variant: 1 },
  { kind: "deadTree", x: 590, y: 236, variant: 1 },
  { kind: "tree", x: 206, y: 318, variant: 0 },
  { kind: "tree", x: 378, y: 312, variant: 1 },
  { kind: "deadTree", x: 590, y: 372, variant: 0 },
  { kind: "tree", x: 46, y: 384, variant: 0 },
];

/** 묘비 격자 구역의 소품. 행 수에 따라 아래로 늘어난다 */
export function gridProps(rows: number): PropDef[] {
  const out: PropDef[] = [];
  for (let r = 0; r < rows + 1; r++) {
    const rowY = GRID_Y0 + r * GRID_DY;
    // 좌우 가장자리 고목 (번갈아)
    if (r % 2 === 0) out.push({ kind: r % 4 === 0 ? "tree" : "deadTree", x: 42, y: rowY + 40, variant: r % 2 });
    else out.push({ kind: r % 4 === 1 ? "tree" : "deadTree", x: 598, y: rowY + 40, variant: (r + 1) % 2 });
    // 중앙 통로 석등 (3행마다, 좌우 번갈아)
    if (r % 3 === 1) out.push({ kind: "lantern", x: r % 2 ? 294 : 346, y: rowY + 40, variant: 0 });
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

export function benchWidth(f: Furniture): number {
  return f.seatOffsets.length >= 3 ? 56 : 40;
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

const AISLE_TX0 = 19;
const AISLE_TX1 = 20;
export const GATE_TX0 = 18;
export const GATE_TX1 = 21;

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
  // 제단·부활 대기석 포석 (중앙 통로보다 우선)
  if (ty >= 6 && ty <= 15 && tx >= 10 && tx <= 29) return "stone";
  if (tx >= AISLE_TX0 && tx <= AISLE_TX1) return "dirt";
  // 입구 앞마당
  if (ty >= 2 && ty <= 5 && tx >= 16 && tx <= 23) return "dirt";
  // 벤치·연못·탁자를 잇는 가로 오솔길
  if (ty === 16 && tx >= 3 && tx <= lastCol - 3) return "dirt";
  // 탁자·의자 앞
  if (ty === 21 && tx >= 25 && tx <= 31) return "dirt";
  if (isRowPathTile(ty) && tx >= 3 && tx <= lastCol - 3) return "dirt";
  return "grass";
}
