import {
  ALTAR,
  FURNITURE,
  GRID_COLS,
  GRID_DY,
  GRID_Y0,
  HOUSING_DOOR,
  HOUSING_OFFICE,
  HUNT_GATE,
  MAP_COLS,
  MAP_WIDTH,
  PORTAL_RADIUS,
  SEATS,
  SHOP,
  SHOP_DOOR,
  SHRINE,
  TILE,
  graveSlot,
  mapHeight,
  type Furniture,
} from "@tomb/protocol";

// 정적 소품 배치 (순수 데이터). 묘비·좌석·스폰·특별한 장소 좌표는 packages/protocol/src/world.ts가 원본이고,
// 여기서는 그 사이를 채우는 나무·석등·연못·우물·그네·종루·꽃밭 등과 바닥 종류, 물, 상호작용 대상을 정한다.
// world.test.ts가 겹침(묘비 자리·좌석·통로·문 앞)을 검사한다.

export type Rect = { x: number; y: number; w: number; h: number };
export type PropKind =
  | "tree"
  | "deadTree"
  | "autumn"
  | "blossom"
  | "pine"
  | "bush"
  | "lantern"
  | "table"
  | "altar"
  | "well"
  | "swing"
  | "bell"
  | "cairn"
  | "flowers"
  | "mushroom"
  | "scarecrow"
  | "reeds"
  | "jar"
  | "shrineTree";
export type PropDef = { kind: PropKind; x: number; y: number; variant: number };

/** 매달릴 수 있는 (살아 있는) 나무 */
export function isLiveTree(k: PropKind): boolean {
  return k === "tree" || k === "autumn" || k === "blossom";
}

/** 왼쪽 정원의 연못 (타원) */
export const POND = { x: 150, y: 336, rx: 44, ry: 17 } as const;

// ── 물: 연못 + 오른쪽 정원의 작은 웅덩이와 담 밑에서 흘러나오는 시내(작은 다리로 건넌다) ──
export type WaterBody = { kind: "ellipse"; x: number; y: number; rx: number; ry: number } | { kind: "rect"; x: number; y: number; w: number; h: number };
export const POOL = { x: 916, y: 340, rx: 16, ry: 10 } as const;
export const CREEK: Rect = { x: 916, y: 334, w: MAP_WIDTH - 32 - 916, h: 12 };
export const WATER: readonly WaterBody[] = [
  { kind: "ellipse", ...POND },
  { kind: "ellipse", ...POOL },
  { kind: "rect", ...CREEK },
];
/** 시내 위 작은 다리 (바닥 높이, 걸어서 건넌다). 바닥 가운데 기준 */
export const BRIDGE = { x: 956, y: 358 } as const;
/** 다리 판자 (물이 아닌 곳) */
export const BRIDGE_DECK: Rect = { x: BRIDGE.x - 9, y: BRIDGE.y - 32, w: 18, h: 30 };

/** 의자 사이 돌탁자 (오른쪽: cA·cB, 왼쪽: cE·cF) */
export const TABLES: readonly { x: number; y: number }[] = [
  { x: 832, y: 374 },
  { x: 246, y: 374 },
];

const CX = MAP_WIDTH / 2;

/** 성황당: 오색 천을 묶은 나무와 돌무더기 (SHRINE 앞자리 뒤쪽) */
export const SHRINE_TREE = { x: SHRINE.x + 18, y: SHRINE.y - 10 } as const;
export const SHRINE_CAIRN = { x: SHRINE.x - 12, y: SHRINE.y - 6 } as const;

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
  { kind: "autumn", x: 300, y: 330, variant: 1 },
  { kind: "pine", x: 110, y: 58, variant: 0 },
  { kind: "pine", x: 246, y: 54, variant: 1 },
  { kind: "blossom", x: 372, y: 330, variant: 0 },
  // 오른쪽 정원 고목 (분양 사무소 자리의 나무는 오른쪽으로 옮겼다)
  { kind: "tree", x: 964, y: 84, variant: 1 },
  { kind: "tree", x: 834, y: 76, variant: 0 },
  { kind: "deadTree", x: 762, y: 150, variant: 1 },
  { kind: "tree", x: 968, y: 252, variant: 0 },
  { kind: "autumn", x: 846, y: 250, variant: 0 },
  { kind: "deadTree", x: 964, y: 396, variant: 0 },
  { kind: "tree", x: 724, y: 330, variant: 0 },
  { kind: "pine", x: 784, y: 56, variant: 0 },
  { kind: "blossom", x: 652, y: 330, variant: 1 },
  // 놀거리
  { kind: "swing", x: 140, y: 100, variant: 0 },
  { kind: "well", x: 724, y: 66, variant: 0 },
  { kind: "bell", x: 650, y: 60, variant: 0 },
  { kind: "scarecrow", x: 770, y: 330, variant: 0 },
  // 성황당
  { kind: "shrineTree", x: SHRINE_TREE.x, y: SHRINE_TREE.y, variant: 0 },
  { kind: "cairn", x: SHRINE_CAIRN.x, y: SHRINE_CAIRN.y, variant: 0 },
  { kind: "cairn", x: SHRINE.x - 28, y: SHRINE.y - 2, variant: 1 },
  // 꽃밭·덤불·버섯
  { kind: "flowers", x: 748, y: 350, variant: 0 },
  { kind: "flowers", x: 792, y: 348, variant: 2 },
  { kind: "flowers", x: 112, y: 258, variant: 1 },
  { kind: "flowers", x: 344, y: 384, variant: 0 },
  { kind: "flowers", x: 680, y: 384, variant: 1 },
  { kind: "bush", x: 44, y: 300, variant: 0 },
  { kind: "bush", x: 984, y: 300, variant: 1 },
  { kind: "bush", x: 300, y: 420, variant: 2 },
  { kind: "bush", x: 724, y: 420, variant: 0 },
  { kind: "mushroom", x: 330, y: 300, variant: 0 },
  { kind: "mushroom", x: 690, y: 300, variant: 1 },
  { kind: "mushroom", x: 40, y: 160, variant: 1 },
  { kind: "mushroom", x: 990, y: 230, variant: 0 },
  { kind: "blossom", x: 66, y: 128, variant: 1 },
  { kind: "autumn", x: 968, y: 134, variant: 1 },
  { kind: "bush", x: 204, y: 188, variant: 1 },
  { kind: "flowers", x: 250, y: 206, variant: 2 },
  { kind: "bush", x: 842, y: 204, variant: 2 },
  { kind: "flowers", x: 760, y: 188, variant: 1 },
  // 연못·시내 갈대
  { kind: "reeds", x: 103, y: 333, variant: 0 },
  { kind: "reeds", x: 128, y: 318, variant: 1 },
  { kind: "reeds", x: 196, y: 330, variant: 0 },
  { kind: "reeds", x: 186, y: 352, variant: 1 },
  { kind: "reeds", x: 112, y: 350, variant: 0 },
  { kind: "reeds", x: 898, y: 351, variant: 1 },
  { kind: "reeds", x: 924, y: 331, variant: 0 },
  { kind: "reeds", x: 978, y: 332, variant: 1 },
  // 반딧불 항아리 (벤치 옆)
  { kind: "jar", x: 178, y: 398, variant: 0 },
  { kind: "jar", x: 444, y: 290, variant: 0 },
  { kind: "jar", x: 580, y: 290, variant: 0 },
  { kind: "jar", x: 870, y: 404, variant: 0 },
];

const COL_XS: readonly number[] = Array.from({ length: GRID_COLS }, (_, c) => graveSlot(c).x);
/** 산책로(블록 사이) 가운데 x */
export const WALK_XS: readonly number[] = [(COL_XS[3] + COL_XS[4]) / 2, (COL_XS[11] + COL_XS[12]) / 2];
/** 블록 가운데 x (빈 줄의 공원에 쓴다) */
const BLOCK_XS: readonly number[] = [0, 1, 2, 3].map((b) => (COL_XS[b * 4] + COL_XS[b * 4 + 3]) / 2);

/** 결정적 의사난수 0..1 */
function h01(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function treeKind(u: number): PropKind {
  return u < 0.42 ? "tree" : u < 0.58 ? "autumn" : u < 0.72 ? "blossom" : u < 0.88 ? "pine" : "deadTree";
}

/** 좌석과 너무 가까우면 놓지 않는다 */
function clearOfSeats(x: number, y: number, d = 16): boolean {
  for (const s of SEATS) if (Math.hypot(s.x - x, s.y - y) < d || Math.hypot(s.x - x, s.y + 9 - y) < d) return false;
  return true;
}

/**
 * 묘비 격자 구역의 소품. 행 수에 따라 아래로 늘어난다.
 *  - 좌우 담 옆 숲길: 행마다 나무 2그루씩 (종류는 결정적으로 섞는다) + 돌무더기·덤불
 *  - 중앙 통로 가장자리: 나무 / 덤불 / 석등이 3행 주기로
 *  - 블록 사이 산책로: 석등, 가장자리 반딧불 항아리·버섯
 *  - 같은 블록의 묘비 열 사이(다음 줄 묘비 앞 풀밭): 버섯·꽃밭을 드문드문 (충돌 없음)
 *  - 묘비가 아직 없는 아래쪽(맵 최소 높이까지): 나무 많은 공원 + 그네·우물·허수아비
 */
export function gridProps(rows: number): PropDef[] {
  const out: PropDef[] = [];
  const height = mapHeight(rows * GRID_COLS);
  for (let r = 0; ; r++) {
    const y0 = GRID_Y0 + r * GRID_DY;
    if (y0 + 40 > height - TILE * 2) break;
    const park = r >= rows;
    // 좌우 숲길
    out.push({ kind: treeKind(h01(r, 1, 5)), x: 46, y: y0 + 12, variant: r & 1 });
    out.push({ kind: treeKind(h01(r, 2, 5)), x: 56, y: y0 + 44, variant: (r + 1) & 1 });
    out.push({ kind: treeKind(h01(r, 3, 5)), x: MAP_WIDTH - 46, y: y0 + 12, variant: (r + 1) & 1 });
    out.push({ kind: treeKind(h01(r, 4, 5)), x: MAP_WIDTH - 56, y: y0 + 44, variant: r & 1 });
    if (r % 5 === 2) out.push({ kind: "cairn", x: 38, y: y0 + 30, variant: r & 1 });
    if (r % 4 === 1) out.push({ kind: "bush", x: MAP_WIDTH - 40, y: y0 + 30, variant: r % 3 });
    if (r % 6 === 4) out.push({ kind: "mushroom", x: 72, y: y0 + 28, variant: r & 1 });
    // 중앙 통로 가장자리
    if (r % 3 === 0) {
      out.push({ kind: treeKind(h01(r, 6, 7) * 0.85), x: CX - 28, y: y0 + 34, variant: r & 1 });
      out.push({ kind: treeKind(h01(r, 7, 7) * 0.85), x: CX + 28, y: y0 + 34, variant: (r + 1) & 1 });
    } else if (r % 3 === 1) {
      out.push({ kind: "bush", x: CX - 26, y: y0 + 6, variant: r % 3 });
      out.push({ kind: "flowers", x: CX + 26, y: y0 + 8, variant: r % 3 });
    } else {
      // 중앙 통로 석등 (좌우 번갈아)
      out.push({ kind: "lantern", x: r % 2 ? CX - 22 : CX + 22, y: y0 + 40, variant: 0 });
    }
    // 블록 사이 산책로
    WALK_XS.forEach((wx, k) => {
      if (r % 3 === 1 && k === ((r >> 1) & 1)) out.push({ kind: "lantern", x: wx, y: y0 + 40, variant: 0 });
      const side = (r + k) % 2 ? -1 : 1;
      const jx = wx + side * 21;
      if (r % 2 === 0 && clearOfSeats(jx, y0 + 4)) out.push({ kind: "jar", x: jx, y: y0 + 4, variant: 0 });
      else if (clearOfSeats(wx - side * 21, y0 + 42)) out.push({ kind: "mushroom", x: wx - side * 21, y: y0 + 42, variant: (r + k) & 1 });
    });
    if (!park) {
      // 같은 블록의 묘비 열 사이 풀밭
      for (let c = 0; c < GRID_COLS - 1; c++) {
        if (c % 4 === 3) continue;
        const u = h01(r, c, 11);
        const mx = (COL_XS[c] + COL_XS[c + 1]) / 2;
        if (u < 0.16) out.push({ kind: "mushroom", x: mx, y: y0 + 42, variant: (r + c) & 1 });
        else if (u < 0.3) out.push({ kind: "flowers", x: mx, y: y0 + 44, variant: (r + c) % 3 });
        // 묘비와 묘비 사이 낮은 덤불·꽃 (충돌 없음, 묘비 받침과 같은 줄)
        const v = h01(r, c, 19);
        if (v < 0.22) out.push({ kind: "bush", x: mx, y: y0 - 1, variant: (r + c) % 3 });
        else if (v < 0.36) out.push({ kind: "flowers", x: mx, y: y0 + 2, variant: (r * 3 + c) % 3 });
      }
      continue;
    }
    // ── 묘비가 아직 없는 줄: 공원 ──
    BLOCK_XS.forEach((bx, b) => {
      const u = h01(r, b, 13);
      if ((r + b) % 2 === 0) {
        out.push({ kind: treeKind(u), x: bx - 34, y: y0 + 28, variant: b & 1 });
        out.push({ kind: treeKind(h01(r, b, 17)), x: bx + 34, y: y0 + 50, variant: (b + 1) & 1 });
        out.push({ kind: "flowers", x: bx, y: y0 + 40, variant: (r + b) % 3 });
      } else {
        const feature: PropKind = u < 0.12 ? "swing" : u < 0.22 ? "well" : u < 0.34 ? "scarecrow" : u < 0.5 ? "cairn" : u < 0.75 ? "flowers" : "bush";
        out.push({ kind: feature, x: bx, y: y0 + 34, variant: r & 1 });
        out.push({ kind: "bush", x: bx - 40, y: y0 + 14, variant: b % 3 });
        out.push({ kind: "mushroom", x: bx + 38, y: y0 + 20, variant: r & 1 });
      }
    });
  }
  return out;
}

/** 소품 충돌 박스 (좌상단 기준). 나무는 줄기만 막는다. 꽃밭·덤불·버섯·갈대·그네는 막지 않는다 */
export function propCollider(p: PropDef): Rect | null {
  switch (p.kind) {
    case "tree":
    case "deadTree":
    case "autumn":
    case "blossom":
    case "shrineTree":
      return { x: p.x - 4, y: p.y - 5, w: 8, h: 5 };
    case "pine":
      return { x: p.x - 3, y: p.y - 5, w: 6, h: 5 };
    case "lantern":
      return { x: p.x - 4, y: p.y - 5, w: 8, h: 5 };
    case "table":
      return { x: p.x - 10, y: p.y - 6, w: 20, h: 6 };
    case "altar":
      return { x: p.x - 19, y: p.y - 12, w: 38, h: 12 };
    case "well":
      return { x: p.x - 10, y: p.y - 7, w: 20, h: 7 };
    case "bell":
      return { x: p.x - 10, y: p.y - 5, w: 20, h: 5 };
    case "cairn":
      return { x: p.x - 5, y: p.y - 4, w: 10, h: 4 };
    case "scarecrow":
      return { x: p.x - 2, y: p.y - 3, w: 4, h: 3 };
    case "jar":
      return { x: p.x - 3, y: p.y - 3, w: 6, h: 3 };
    case "swing":
    case "bush":
    case "flowers":
    case "mushroom":
    case "reeds":
      return null;
  }
}

/** 유령 잡화점 오두막 충돌 박스 (문은 아래 가운데, 문 앞 SHOP_DOOR에서 들어간다) */
export function shopCollider(): Rect {
  return { x: SHOP.x - 28, y: SHOP.y - 18, w: 56, h: 18 };
}

/** 분양 사무소 오두막 충돌 박스 (잡화점과 같은 크기, 문 앞 HOUSING_DOOR) */
export function officeCollider(): Rect {
  return { x: HOUSING_OFFICE.x - 28, y: HOUSING_OFFICE.y - 18, w: 56, h: 18 };
}

/** 문 앞에 서 있으면 들어갈 수 있다 */
export const SHOP_ENTER_RADIUS = 12;
export function nearShopDoor(x: number, y: number, radius = SHOP_ENTER_RADIUS): boolean {
  return Math.hypot(x - SHOP_DOOR.x, y - SHOP_DOOR.y) <= radius;
}

/** 빛을 내는 소품의 빛 위치 (받침 기준 dy). 석등 창·반딧불 항아리 */
export function propLight(p: PropDef): { dy: number; scale: number; tint: number; base: number } | null {
  if (p.kind === "lantern") return { dy: -15, scale: 0.75, tint: 0xffc068, base: 0.7 };
  if (p.kind === "jar") return { dy: -6, scale: 0.4, tint: 0xd8f080, base: 0.55 };
  return null;
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
  // 사냥터 동굴 앞, 분양 사무소 문 앞
  if (ty === 2 && tx >= Math.floor(HUNT_GATE.x / TILE) - 1 && tx <= Math.floor(HUNT_GATE.x / TILE)) return "dirt";
  if (ty >= Math.floor(HOUSING_DOOR.y / TILE) - 1 && ty <= Math.floor(HOUSING_DOOR.y / TILE) && Math.abs(tx * TILE + TILE / 2 - HOUSING_DOOR.x) < TILE) return "dirt";
  // 탁자·의자 앞
  if (ty === 23 && ((tx >= 13 && tx <= 17) || (tx >= lastCol - 17 && tx <= lastCol - 13))) return "dirt";
  if (ty >= GRID_TY0 - 2) {
    for (const [a, b] of WALK_TX) if (tx >= a && tx <= b) return "dirt";
    if (isRowPathTile(ty) && inner) return "dirt";
  }
  return "grass";
}

// ── 상호작용 오브젝트 (E/탭) ── WorldScene이 가장 가까운 것을 골라 안내 문구를 띄우고 상호작용한다.
export type InteractKind = "tree" | "swing" | "bell" | "well" | "water" | "portal";
export type PortalKind = "hunt" | "housing" | "shrine";
export type Interactable = {
  id: string;
  kind: InteractKind;
  /** 판정 중심 (플레이어 발 기준) */
  x: number;
  y: number;
  /** 판정 반경 */
  r: number;
  /** 상호작용 자리: tree = 매달릴 때 발 위치(줄기 앞), swing = 그네 좌석, 나머지 = (x,y) */
  ax: number;
  ay: number;
  portal?: PortalKind;
  /** 안내 문구 (예: "매달리기", "종 치기", "사냥터 들어가기") */
  label: string;
};

const PORTALS: readonly Interactable[] = [
  { id: "portal:hunt", kind: "portal", portal: "hunt", x: HUNT_GATE.x, y: HUNT_GATE.y, r: PORTAL_RADIUS, ax: HUNT_GATE.x, ay: HUNT_GATE.y, label: "사냥터 들어가기" },
  { id: "portal:housing", kind: "portal", portal: "housing", x: HOUSING_DOOR.x, y: HOUSING_DOOR.y, r: PORTAL_RADIUS, ax: HOUSING_DOOR.x, ay: HOUSING_DOOR.y, label: "분양 사무소 들어가기" },
  { id: "portal:shrine", kind: "portal", portal: "shrine", x: SHRINE.x, y: SHRINE.y, r: PORTAL_RADIUS, ax: SHRINE.x, ay: SHRINE.y, label: "성황당에 소원 빌기" },
];

/** 소품 → 상호작용 대상 (매달릴 나무·그네·종루·우물). 없으면 null */
export function propInteractable(p: PropDef): Interactable | null {
  const id = `${p.kind}:${p.x}:${p.y}`;
  if (isLiveTree(p.kind)) return { id, kind: "tree", x: p.x, y: p.y + 6, r: 14, ax: p.x, ay: p.y + 6, label: "매달리기" };
  switch (p.kind) {
    case "swing":
      return { id, kind: "swing", x: p.x, y: p.y + 1, r: 16, ax: p.x, ay: p.y - 4, label: "그네 타기" };
    case "bell":
      return { id, kind: "bell", x: p.x, y: p.y + 8, r: 16, ax: p.x, ay: p.y + 8, label: "종 치기" };
    case "well":
      return { id, kind: "well", x: p.x, y: p.y + 8, r: 16, ax: p.x, ay: p.y + 8, label: "우물에 동전 던지기" };
    default:
      return null;
  }
}

/** 위쪽 고정 구역 + 묘비 격자 구역(rows행)의 상호작용 오브젝트 (id는 좌표 기반이라 행 수가 바뀌어도 그대로) */
export function interactables(rows: number): Interactable[] {
  const out: Interactable[] = [...PORTALS];
  for (const p of UPPER_PROPS) {
    const i = propInteractable(p);
    if (i) out.push(i);
  }
  for (const p of gridProps(rows)) {
    const i = propInteractable(p);
    if (i) out.push(i);
  }
  return out;
}

function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

function inBody(b: WaterBody, x: number, y: number, grow: number): boolean {
  if (b.kind === "rect") return inRect(b, x, y, grow);
  const dx = (x - b.x) / Math.max(1, b.rx + grow);
  const dy = (y - b.y) / Math.max(1, b.ry + grow);
  return dx * dx + dy * dy <= 1;
}

/** 발밑이 물(연못·웅덩이·시내) 안이면 수영. 다리 위는 물이 아니다 */
export function inWater(x: number, y: number): boolean {
  if (inRect(BRIDGE_DECK, x, y)) return false;
  for (const b of WATER) if (inBody(b, x, y, -2)) return true;
  return false;
}

/** 물가 (물 밖이지만 margin px 안) — E로 물 튀기기 */
export function nearWater(x: number, y: number, margin = 10): boolean {
  if (inWater(x, y)) return false;
  for (const b of WATER) if (inBody(b, x, y, margin)) return true;
  return false;
}
