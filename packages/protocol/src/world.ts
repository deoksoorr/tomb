import { DIR, type DirId } from "./types";

// 맵 레이아웃. 모든 채널이 같은 맵을 쓰고, 서버(좌석 판정·범위 검증)와 클라이언트(렌더링)가 공유한다.
// 단위: 월드 픽셀(스케일 전). 16px 타일, 화면에는 3배 줌. 가로 1024px, 중앙 x=512 기준 좌우 대칭.
//
//  y=0     ┌──────────────── 돌담 ──────── [정문] ──────── 돌담 ────────────────┐
//  y≈56    │  왼쪽 정원                      SPAWN                    오른쪽 정원  │
//  y≈128   │  벤치C   고목      의자 [ 입구 제단 / 부활 대기석 ] 의자      벤치D     │
//  y≈180   │                      2위   1위   3위                                 │
//  y≈232   │                4위 5위 6위 7위 8위 9위 10위                          │
//  y≈290   │  벤치A                                                   벤치B       │
//  y≈330   │ (연못)   의자 탁자 의자                         의자 탁자 의자        │
//  y=448~  │ 묘비 4열 │산책로│ 묘비 4열 ║중앙 통로║ 묘비 4열 │산책로│ 묘비 4열      │
//          │   … 묘비 수에 따라 아래로 확장 (한 줄 16기) …                         │
//          └──────────────────────────────────────────────────────────────────────┘

export const TILE = 16;
export const ZOOM = 3;
export const MAP_COLS = 64;
export const MAP_WIDTH = MAP_COLS * TILE; // 1024
/** 묘비가 없을 때의 최소 맵 높이 (가로가 넓어진 비율만큼, 예전 640×960 → 1024×1536) */
export const MAP_MIN_HEIGHT = 96 * TILE; // 1536
/** u16 좌표 상한 */
export const MAP_MAX_HEIGHT = 0xffff;
/** 위/좌/우 돌담 두께 (이동 불가 영역) */
export const WALL_THICKNESS = 2 * TILE;

const CX = MAP_WIDTH / 2; // 512

export const SPAWN = { x: CX, y: 56 } as const;
export const ALTAR = { x: CX, y: 128 } as const;

/** 부활 대기석: 살려주세요 상위 10개 묘비 자리. index 0 = 1위 */
export const REVIVE_SLOTS: readonly { x: number; y: number }[] = [
  { x: CX, y: 176 },
  { x: CX - 56, y: 184 },
  { x: CX + 56, y: 184 },
  { x: CX - 168, y: 232 },
  { x: CX - 112, y: 232 },
  { x: CX - 56, y: 232 },
  { x: CX, y: 240 },
  { x: CX + 56, y: 232 },
  { x: CX + 112, y: 232 },
  { x: CX + 168, y: 232 },
];

// ── 묘비 격자 ── 등록 순서(index)로 결정적으로 배치한다.
// 한 줄 16기 = 4열 블록 × 4. 블록 사이에 산책로(GRID_WALK), 가운데에 중앙 통로(GRID_AISLE)를 둔다.
export const GRID_COLS = 16;
/** 블록 하나의 열 수 */
export const GRID_BLOCK = 4;
export const GRID_Y0 = 448;
export const GRID_DX = 48;
export const GRID_DY = 64;
/** 블록 사이 산책로 추가 간격 */
export const GRID_WALK = 32;
/** 가운데 통로 추가 간격 */
export const GRID_AISLE = 64;
/** 첫 열 x. 마지막 열과 x=512 기준 좌우 대칭이 되도록 계산 */
export const GRID_X0 = CX - ((GRID_COLS - 1) * GRID_DX + 2 * GRID_WALK + GRID_AISLE) / 2; // 88

export function graveSlot(index: number): { x: number; y: number; col: number; row: number } {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  const block = Math.floor(col / GRID_BLOCK);
  const half = GRID_COLS / GRID_BLOCK / 2;
  // 블록마다 산책로만큼, 오른쪽 절반은 산책로 대신 중앙 통로만큼 띄운다
  const x = GRID_X0 + col * GRID_DX + block * GRID_WALK + (block >= half ? GRID_AISLE - GRID_WALK : 0);
  return { x, y: GRID_Y0 + row * GRID_DY, col, row };
}

/** 격자 자리 이름 (등록 순서 index 기준). 묘비를 세운 뒤 안내·상세 모달에 쓴다. 예: "3번째 줄 · 7번 자리" */
export function plotLabel(index: number): string {
  const { row, col } = graveSlot(index);
  return `${row + 1}번째 줄 · ${col + 1}번 자리`;
}

/** 묘비 수에 따라 아래로 확장되는 맵 높이 */
export function mapHeight(graveCount: number): number {
  const rows = Math.ceil(Math.max(0, graveCount) / GRID_COLS);
  return Math.min(MAP_MAX_HEIGHT, Math.max(MAP_MIN_HEIGHT, GRID_Y0 + rows * GRID_DY + 6 * TILE));
}

/** 플레이어가 서 있을 수 있는 범위 (돌담 안쪽) */
export function playerBounds(graveCount: number) {
  return {
    minX: WALL_THICKNESS,
    maxX: MAP_WIDTH - WALL_THICKNESS,
    minY: WALL_THICKNESS + 8,
    maxY: mapHeight(graveCount) - TILE,
  };
}

/** 서버 검증용: 묘비 수를 모르므로 가장 넓은 범위 */
export function inServerBounds(x: number, y: number): boolean {
  return x >= 0 && x <= MAP_WIDTH && y >= 0 && y <= MAP_MAX_HEIGHT;
}

// ── 의자와 벤치 ── 좌석 점유는 서버가 판정한다.
export type FurnitureKind = "bench" | "chair";
export type Furniture = {
  id: string;
  kind: FurnitureKind;
  x: number;
  y: number;
  /** 앉은 캐릭터가 바라보는 방향 */
  facing: DirId;
  /** 좌석 앵커의 x 오프셋 (벤치는 여러 개) */
  seatOffsets: readonly number[];
};

export const FURNITURE: readonly Furniture[] = [
  // 기존 id는 유지한다 (서버 좌석 판정·테스트가 id로 참조)
  { id: "bA", kind: "bench", x: 150, y: 290, facing: DIR.down, seatOffsets: [-12, 12] },
  { id: "bB", kind: "bench", x: 860, y: 290, facing: DIR.down, seatOffsets: [-16, 0, 16] },
  { id: "cA", kind: "chair", x: 812, y: 372, facing: DIR.right, seatOffsets: [0] },
  { id: "cB", kind: "chair", x: 852, y: 372, facing: DIR.left, seatOffsets: [0] },
  { id: "cC", kind: "chair", x: CX - 120, y: 120, facing: DIR.down, seatOffsets: [0] },
  { id: "cD", kind: "chair", x: CX + 120, y: 120, facing: DIR.down, seatOffsets: [0] },
  // 넓어진 정원에 더한 자리
  { id: "bC", kind: "bench", x: 104, y: 150, facing: DIR.down, seatOffsets: [-12, 12] },
  { id: "bD", kind: "bench", x: 920, y: 150, facing: DIR.down, seatOffsets: [-12, 12] },
  { id: "cE", kind: "chair", x: 226, y: 372, facing: DIR.right, seatOffsets: [0] },
  { id: "cF", kind: "chair", x: 266, y: 372, facing: DIR.left, seatOffsets: [0] },
];

export type Seat = { id: string; furnitureId: string; x: number; y: number; facing: DirId };

/** 좌석 id: 의자는 furniture id 그대로, 벤치는 `${id}-${i}` */
export const SEATS: readonly Seat[] = FURNITURE.flatMap((f) =>
  f.seatOffsets.map((dx, i) => ({
    id: f.seatOffsets.length > 1 ? `${f.id}-${i}` : f.id,
    furnitureId: f.id,
    x: f.x + dx,
    y: f.y,
    facing: f.facing,
  })),
);

const seatMap = new Map(SEATS.map((s) => [s.id, s]));
export function seatById(id: string): Seat | undefined {
  return seatMap.get(id);
}

/** (x,y)에서 radius 안의 좌석 중 가장 가까운 것부터 정렬 */
export function seatsNear(x: number, y: number, radius: number): Seat[] {
  return SEATS.map((s) => ({ s, d: Math.hypot(s.x - x, s.y - y) }))
    .filter((e) => e.d <= radius)
    .sort((a, b) => a.d - b.d)
    .map((e) => e.s);
}

// ── 생존 기간에 따른 묘비 외형 ──
export type GraveTier = "woodSign" | "smallStone" | "largeStone" | "pagoda";
export function graveTier(ageDays: number): GraveTier {
  if (ageDays < 7) return "woodSign";
  if (ageDays < 90) return "smallStone";
  if (ageDays < 365) return "largeStone";
  return "pagoda";
}

/** 헌화 수 → 쌓이는 꽃 송이 (로그 스케일, 최대 8) */
export function flowerStack(flowers: number): number {
  if (flowers <= 0) return 0;
  return Math.min(8, 1 + Math.floor(Math.log2(flowers)));
}
