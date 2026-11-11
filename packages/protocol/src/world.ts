import { DIR, STATE, type DirId, type StateId } from "./types";

// 맵 레이아웃. 모든 채널이 같은 맵을 쓰고, 서버(좌석 판정·범위 검증)와 클라이언트(렌더링·충돌)가 공유한다.
// 단위: 월드 픽셀(스케일 전). 16px 타일, 화면에는 3배 줌. 가로 2048 × 세로 1408 고정 (구역 배치는 아래 ZONES 그림).
// 충돌(걸을 수 있는 칸)은 클라이언트 game/world/layout.ts의 staticColliders()/walkableGrid()가 이 좌표로 만든다.

export const TILE = 16;
export const ZOOM = 3;
export const MAP_COLS = 128;
export const MAP_WIDTH = MAP_COLS * TILE; // 2048
export const MAP_ROWS = 88;
/** 맵 높이 (고정). 묘비 수와 상관없다 — 묘역은 작은 구역 하나(GRAVEYARD_CAPACITY) */
export const MAP_HEIGHT = MAP_ROWS * TILE; // 1408
/** @deprecated 예전 "묘비가 없을 때의 최소 높이". 이제 맵 높이는 MAP_HEIGHT로 고정 */
export const MAP_MIN_HEIGHT = MAP_HEIGHT;
/** u16 좌표 상한 */
export const MAP_MAX_HEIGHT = 0xffff;
/** 위/좌/우 돌담 두께 (이동 불가 영역) */
export const WALL_THICKNESS = 2 * TILE;
/**
 * 맵 배치 버전. 좌표가 바뀌는 맵 개편마다 올린다 → 옛 맵에서 저장한 새로고침 자리 기록(lib/resume.ts)은 위치를 버리고 입구에서 시작한다.
 * 1 = 세로로 길던 공동묘지 맵, 2 = 가을·겨울 마을(가로로 넓은 맵, 강·광장·주거 구역)
 */
export const MAP_VERSION = 2;

const CX = MAP_WIDTH / 2; // 1024

// ── 구역 ── (가을~겨울 마을. 좌우로 넓고, 가운데 광장을 여러 구역이 둘러싼다)
//
//  y=0    ┌──돌담──────────────────────── [정문] ──────────────────── [사냥터 동굴] ──┐
//         │ ▲별 보기 언덕▲  성황당   유령잡화점  SPAWN  종루        모닥불N          │
//  y≈190  │ ▲(절벽·계단)▲ ════════════ 북쪽 길 ═══════════════ 분양사무소 ═══════│
//  y≈260  │       │계단            ┌──────── 광장 ────────┐     ┌주거 구역 4×3 필지┐ │
//         │ ┌─작은 묘역─┐ 모닥불W  │ 그네  우물  해먹 …  │     │ 집 집 집 집      │ │
//         │ │ 묘비 8×4  │ 쉼터     └──────────────────────┘     │ 집 집 집 집      │ │
//  y≈680  │ └───────────┘          모닥불C (광장 남쪽 잔디)      │ 집 집 집 집      │ │
//  y≈800  │ ═══ 강변 산책로 ═════════════════════════════════════                  │
//  y≈880  │ ~~~ 강 ~~[징검다리]~~[서쪽 다리]~~~[가운데 다리]~~~[나루터·배]~~~~~╮    │
//  y≈1000 │ 숲 (채집 자리)    해먹·강가 쉼터     모닥불E · 허수아비 밭      ( 호수 ) │
//         └───────────────────────────────────────────────────────────────────────┘

export type ZoneId = "hill" | "graveyard" | "rest" | "plaza" | "housing" | "river" | "lake" | "forest" | "meadow" | "gate";
export type Zone = { id: ZoneId; name: string; x: number; y: number; w: number; h: number };
/** 구역 사각형 (이름표·안내·앞으로의 콘텐츠 배치 기준. 충돌과는 상관없다) */
export const ZONES: readonly Zone[] = [
  { id: "hill", name: "별 보기 언덕", x: 32, y: 32, w: 416, h: 272 },
  { id: "gate", name: "정문 앞마당", x: 912, y: 32, w: 224, h: 144 },
  { id: "graveyard", name: "작은 묘역", x: 96, y: 392, w: 416, h: 272 },
  { id: "rest", name: "쉼터", x: 560, y: 384, w: 208, h: 200 },
  { id: "plaza", name: "광장", x: 800, y: 256, w: 448, h: 352 },
  { id: "housing", name: "주거 구역", x: 1424, y: 200, w: 592, h: 464 },
  { id: "river", name: "강", x: 32, y: 820, w: 1640, h: 140 },
  { id: "lake", name: "호수", x: 1584, y: 976, w: 432, h: 248 },
  { id: "forest", name: "숲", x: 32, y: 944, w: 576, h: 432 },
  { id: "meadow", name: "강 건너 풀밭", x: 640, y: 944, w: 920, h: 432 },
];

export const SPAWN = { x: CX, y: 60 } as const;

// ── 묘역 크기 (49번 성불) ──
/**
 * 한 채널 묘역에 동시에 놓일 수 있는 묘비 수 = 작은 묘역 격자(GRID_COLS × GRID_ROWS = 8 × 4).
 * 넘치면 가장 오래된 묘비부터 앞당겨 성불한다(서버 lib/store/passing.ts). 서버·클라이언트가 같은 값을 쓴다.
 */
export const GRAVEYARD_CAPACITY = 32;

// ── 다시 피어날 자리 (제거됨, 49번) ── 옛 이름만 남긴다 (다른 모듈이 import하던 이름이 컴파일되게).
/** @deprecated 다시 피어날 자리는 맵에서 없어졌다. 쓰지 않는다 */
export const ALTAR_NAME = "다시 피어날 자리";
/** @deprecated 맵에서 없어졌다 (옛 자리는 광장이 됐다) */
export const ALTAR = { x: CX, y: 430 } as const;
/** @deprecated 부활 대기석은 없어졌다 (항상 빈 배열) */
export const REVIVE_SLOTS: readonly { x: number; y: number }[] = [];

// ── 작은 묘역 ── 등록 순서(index)로 결정적으로 배치한다. 한 줄 8기 = 4열 블록 × 2, 가운데에 통로(GRID_AISLE).
// 묘역에는 GRAVEYARD_CAPACITY(8×4=32)기까지. 넘치면(성불 전) 자리는 index % 32를 돌려 쓰고, 가장 최근 32기만 보인다.
export const GRID_COLS = 8;
export const GRID_ROWS = 4;
/** 블록 하나의 열 수 */
export const GRID_BLOCK = 4;
export const GRID_Y0 = 448;
export const GRID_DX = 44;
export const GRID_DY = 60;
/** 블록 사이 산책로 추가 간격 (이제 블록이 둘이라 가운데 통로 하나뿐) */
export const GRID_WALK = 0;
/** 가운데 통로 추가 간격 */
export const GRID_AISLE = 40;
/** 묘역 가운데 통로 x (언덕 계단과 줄을 맞춘다) */
export const GRAVEYARD_AISLE_X = 304;
/** 첫 열 x. 마지막 열과 가운데 통로 기준 좌우 대칭 */
export const GRID_X0 = GRAVEYARD_AISLE_X - ((GRID_COLS - 1) * GRID_DX + GRID_AISLE) / 2; // 130

/** 묘비 자리 (index는 등록 순서. 묘역 크기를 넘으면 자리를 돌려 쓴다) */
export function graveSlot(index: number): { x: number; y: number; col: number; row: number } {
  const i = ((index % GRAVEYARD_CAPACITY) + GRAVEYARD_CAPACITY) % GRAVEYARD_CAPACITY;
  const col = i % GRID_COLS;
  const row = Math.floor(i / GRID_COLS);
  const x = GRID_X0 + col * GRID_DX + (col >= GRID_BLOCK ? GRID_AISLE : 0);
  return { x, y: GRID_Y0 + row * GRID_DY, col, row };
}

/** 이 index의 묘비가 지금 묘역에 보이는지 (가장 최근 GRAVEYARD_CAPACITY기만) */
export function graveVisible(index: number, count: number): boolean {
  return index >= 0 && index < count && index >= count - GRAVEYARD_CAPACITY;
}

/** 격자 자리 이름 (등록 순서 index 기준). 묘비를 세운 뒤 안내·상세 모달에 쓴다. 예: "3번째 줄 · 7번 자리" */
export function plotLabel(index: number): string {
  const { row, col } = graveSlot(index);
  return `${row + 1}번째 줄 · ${col + 1}번 자리`;
}

/** 맵 높이. 이제 묘비 수와 상관없이 고정 (예전 호출부 호환용 인자) */
export function mapHeight(_graveCount = 0): number {
  return MAP_HEIGHT;
}

/** 플레이어가 서 있을 수 있는 범위 (돌담 안쪽) */
export function playerBounds(_graveCount = 0) {
  return {
    minX: WALL_THICKNESS,
    maxX: MAP_WIDTH - WALL_THICKNESS,
    minY: WALL_THICKNESS + 8,
    maxY: MAP_HEIGHT - TILE,
  };
}

/** 서버 검증용: 맵 안 (담 두께는 따지지 않는다 — 실내 방은 따로 검사) */
export function inServerBounds(x: number, y: number): boolean {
  return x >= 0 && x <= MAP_WIDTH && y >= 0 && y <= MAP_HEIGHT;
}

// ── 유령 잡화점 ── 정문 왼쪽의 작은 오두막. 문 앞(SHOP_DOOR)에서 들어가면 상점 맵(실내)으로 바뀐다.
// 상점 안에 있는 동안 실시간 위치는 문 앞에 멈춰 있는 것으로 둔다.
/** 오두막 바닥 가운데 */
export const SHOP = { x: 840, y: 156 } as const;
/** 문 앞 (들어가는 자리이자 나왔을 때 서는 자리) */
export const SHOP_DOOR = { x: 840, y: 168 } as const;

// ── 특별한 장소 ── 앞에서 E/탭 → UI에 portal:open {kind}. 좌표는 상호작용하는 자리(입구 앞 발밑)
/** 사냥터 입구: 오른쪽 윗담에 뚫린 동굴 문 */
export const HUNT_GATE = { x: 1776, y: 44 } as const;
/** 분양 사무소(하우징): 주거 구역 어귀의 작은 사무실 오두막. 바닥 가운데. 이제 필지 분양만 한다 (집은 주거 구역에 서 있다) */
export const HOUSING_OFFICE = { x: 1352, y: 236 } as const;
/** 분양 사무소 문 앞 */
export const HOUSING_DOOR = { x: 1352, y: 248 } as const;
/** 성황당: 돌무더기 + 천을 묶은 나무. 돌무더기 앞자리 (언덕 동쪽 기슭) */
export const SHRINE = { x: 572, y: 120 } as const;
/** 특별한 장소 상호작용 반경 */
export const PORTAL_RADIUS = 18;

// ── 주거 구역 ── 분양 마을을 메인 맵에 합쳤다. 번지(1..WORLD_LOTS)마다 필지 하나, 그 집의 외관이 서 있다.
// 필지 = 외관 캔버스(가로 128 × 세로 104, game/housing/art.ts FACADE_*) 크기. 문 앞은 필지 (x+64, y+92).
// 번지가 WORLD_LOTS보다 큰 집은 분양 사무소의 "분양 마을(2단지)"에서 본다.
export const HOUSE_LOT_W = 128;
export const HOUSE_LOT_H = 104;
export const HOUSE_COLS = 4;
export const HOUSE_ROWS = 3;
/** 메인 맵에 서는 번지 수 (1..WORLD_LOTS) */
export const WORLD_LOTS = HOUSE_COLS * HOUSE_ROWS;
const HOUSE_X0 = 1440;
const HOUSE_Y0 = 216;
const HOUSE_PITCH_X = HOUSE_LOT_W + 16;
const HOUSE_PITCH_Y = HOUSE_LOT_H + 44;
export type HouseLot = { lot: number; x: number; y: number; door: { x: number; y: number } };
/** 번지 → 필지 (좌상단 x,y와 문 앞). 메인 맵에 없는 번지면 null */
export function houseLot(lot: number): HouseLot | null {
  if (!Number.isInteger(lot) || lot < 1 || lot > WORLD_LOTS) return null;
  const i = lot - 1;
  const x = HOUSE_X0 + (i % HOUSE_COLS) * HOUSE_PITCH_X;
  const y = HOUSE_Y0 + Math.floor(i / HOUSE_COLS) * HOUSE_PITCH_Y;
  return { lot, x, y, door: { x: x + HOUSE_LOT_W / 2, y: y + 92 } };
}
export const HOUSE_LOTS: readonly HouseLot[] = Array.from({ length: WORLD_LOTS }, (_, i) => houseLot(i + 1)!);

// ── 강과 호수 ── (물 판정·그림은 클라이언트 layout.ts, 좌표 원본은 여기)
/** 강 가운데 줄 (서쪽 담 밑에서 흘러나와 동쪽 호수로). 물살은 이 순서 방향 */
export const RIVER_PATH: readonly { x: number; y: number }[] = [
  { x: 16, y: 860 },
  { x: 200, y: 876 },
  { x: 420, y: 864 },
  { x: 640, y: 888 },
  { x: 860, y: 872 },
  { x: 1080, y: 890 },
  { x: 1300, y: 878 },
  { x: 1480, y: 900 },
  { x: 1600, y: 960 },
  { x: 1664, y: 1024 },
];
/** 강 폭의 절반 */
export const RIVER_HALF_W = 22;
/** 호수 (타원). 4번 낚시가 들어올 자리 */
export const LAKE = { x: 1800, y: 1100, rx: 212, ry: 118 } as const;
/** 강을 건너는 다리 (세로로 놓인 판자 길, 가운데 x와 위·아래 끝 y) */
export const BRIDGES: readonly { id: string; x: number; y0: number; y1: number; w: number }[] = [
  { id: "bridgeW", x: 520, y0: 836, y1: 914, w: 24 },
  { id: "bridgeC", x: 1024, y0: 846, y1: 926, w: 28 },
];
/** 징검다리 돌 (발판 반지름 STEP_STONE_R) */
export const STEP_STONES: readonly { x: number; y: number }[] = [
  { x: 296, y: 846 },
  { x: 304, y: 858 },
  { x: 296, y: 870 },
  { x: 305, y: 882 },
  { x: 297, y: 894 },
];
export const STEP_STONE_R = 7;
/**
 * 나루터 (강 북쪽 둑에서 물로 나간 판자 선착장). 조각배(50번)가 여기서 출발한다.
 * FERRY_DOCK = 배 타기 상호작용 자리(선착장 끝), BOAT_MOORING = 매어 둔 배 자리(물 위).
 * 배 작업: 배 타기는 FERRY_DOCK에서 E → 1인 자리(SPOT_KINDS에 "boat" 추가) + 물 위 이동(물살 drift는 layout.waterCurrent).
 */
export const FERRY_DOCK = { x: 1302, y: 876 } as const;
export const DOCK_DECK = { x: 1290, y: 838, w: 26, h: 44 } as const;
export const BOAT_MOORING = { x: 1336, y: 886 } as const;
/** 호수 낚시 잔교 (4번 낚시 자리 예정). 뭍에서 호수로 뻗은 판자 */
export const LAKE_PIER = { x: 1560, y: 1092, w: 92, h: 16 } as const;

// ── 낚시 자리 (4번) ── 호수 잔교·호숫가·강둑. 자리마다 1인(SPOT_KINDS.fish, 서버 좌석 — 정해진 자리만).
// 앵커(x,y) = 앉는 발 위치(물가 뭍), facing = 물 쪽. 자리 id = spotSeatId("fish", x, y) — 예 "f_1646_1100".
// 무엇이 잡히는지(호수/강)는 water로 웹 서버(apps/web/lib/forage)가 정한다. 실시간 서버는 점유만 판정한다.
export type FishingSpot = { id: string; water: "lake" | "river"; x: number; y: number; facing: DirId };
const fishSpot = (water: FishingSpot["water"], x: number, y: number, facing: DirId): FishingSpot => ({ id: `f_${x}_${y}`, water, x, y, facing });
export const FISHING_SPOTS: readonly FishingSpot[] = [
  // 호수: 잔교 끝·잔교 양옆·북쪽 물가·남쪽 물가
  fishSpot("lake", 1646, 1100, DIR.right),
  fishSpot("lake", 1612, 1093, DIR.up),
  fishSpot("lake", 1612, 1107, DIR.down),
  fishSpot("lake", 1792, 974, DIR.down),
  fishSpot("lake", 1760, 1224, DIR.up),
  // 강: 북쪽 둑(아래를 본다)·남쪽 둑(위를 본다)
  fishSpot("river", 220, 852, DIR.down),
  fishSpot("river", 700, 862, DIR.down),
  fishSpot("river", 900, 845, DIR.down),
  fishSpot("river", 1150, 858, DIR.down),
  fishSpot("river", 760, 906, DIR.up),
  fishSpot("river", 1400, 914, DIR.up),
];
/** 이 좌석 id의 낚시 자리 (없으면 undefined) */
export function fishingSpotById(id: string): FishingSpot | undefined {
  return FISHING_SPOTS.find((s) => s.id === id);
}

// ── 조각배 (50번) ── 나루터(FERRY_DOCK)에서 E → 배에 탄다. 자리마다 1인(SPOT_KINDS.boat, 서버 좌석).
// 1인승 2척(나루터 동쪽) + 2인승 1척(서쪽, 앞자리 = 노 젓는 사람, 뒷자리 = 같이 타는 사람).
// 앵커(x,y) = 나루터에 매어 둔 자리. 타면 위치는 클라이언트가 물 위로 옮기고(서버는 mobile 자리라 따라간다),
// 내리면 배는 잠시 뒤 이 자리로 돌아온다 (클라이언트 연출). 자리 id = spotSeatId("boat", x, y) — 예 "b_1338_872"
export type Boat = { id: string; x: number; y: number; seats: 1 | 2; facing: DirId };
export const BOATS: readonly Boat[] = [
  { id: "boatA", x: 1338, y: 872, seats: 1, facing: DIR.right },
  { id: "boatB", x: 1338, y: 895, seats: 1, facing: DIR.right },
  { id: "boatC", x: 1264, y: 880, seats: 2, facing: DIR.left },
];
/** 2인승 뒷자리: 앞자리(노 젓는 자리)에서 뱃머리 반대쪽으로 이만큼 */
export const BOAT_BACK_SEAT = 11;
export type BoatSeat = { id: string; boatId: string; index: 0 | 1; x: number; y: number; facing: DirId };
/** 배 자리 전부 (앞자리 index 0, 2인승 뒷자리 index 1) */
export const BOAT_SEATS: readonly BoatSeat[] = BOATS.flatMap((b) => {
  const back = b.facing === DIR.right ? -BOAT_BACK_SEAT : BOAT_BACK_SEAT;
  const seats: BoatSeat[] = [{ id: `b_${b.x}_${b.y}`, boatId: b.id, index: 0, x: b.x, y: b.y, facing: b.facing }];
  if (b.seats === 2) seats.push({ id: `b_${b.x + back}_${b.y}`, boatId: b.id, index: 1, x: b.x + back, y: b.y, facing: b.facing });
  return seats;
});
/** 이 좌석 id의 배 자리 (없으면 undefined) */
export function boatSeatById(id: string): BoatSeat | undefined {
  return BOAT_SEATS.find((s) => s.id === id);
}

// ── 별 보기 언덕 ── 북서쪽 구석의 높은 대지. 남쪽·동쪽은 절벽이고 계단(HILL_STAIRS)으로만 오른다
export const HILL = { x: 32, y: 32, w: 416, h: 272 } as const;
/** 계단 (절벽 사이의 틈, 이 x 범위로만 오르내린다) */
export const HILL_STAIRS = { x: 288, w: 32 } as const;
/** 절벽 두께 (언덕 아랫변 HILL.y + HILL.h 부터) */
export const HILL_CLIFF = 16;
/**
 * 망원경 (22번·별 보기 언덕): 언덕 동쪽 끝에서 마을을 내려다본다. 받침 가운데(발 위치).
 * 앞자리(TELESCOPE_SPOT)에서 E → 별자리 잇기. 1인 자리(SPOT_KINDS.telescope, id = spotSeatId("telescope", x, y))
 */
export const TELESCOPE = { x: 404, y: 108 } as const;
export const TELESCOPE_SPOT = { x: TELESCOPE.x, y: TELESCOPE.y + 10 } as const;

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
  /** 모닥불 둘레 통나무·그루터기면 그 모닥불 id (CAMPFIRES) */
  campfire?: string;
};

// ── 모닥불 ── 둘러앉는 통나무(위·아래, 2인)와 그루터기(좌우, 1인). 앉으면 클라이언트가 "불멍" 구도로 바뀐다.
export type Campfire = { id: string; x: number; y: number };
/** 모닥불 자리 (불 받침 가운데). 서쪽 쉼터 · 광장 남쪽 잔디 · 사냥터 동굴 옆 · 강 건너 풀밭 */
export const CAMPFIRES: readonly Campfire[] = [
  { id: "fireW", x: 648, y: 476 },
  { id: "fireC", x: 1136, y: 692 },
  { id: "fireN", x: 1888, y: 112 },
  { id: "fireE", x: 1180, y: 1120 },
];
/** 모닥불 중심에서 위 통나무·그루터기까지 (아래 통나무는 앉은 사람이 불을 가리지 않게 6px 더 아래) */
export const CAMPFIRE_LOG_DY = 20;
export const CAMPFIRE_STUMP_DX = 26;

function campfireSeats(): Furniture[] {
  const out: Furniture[] = [];
  for (const f of CAMPFIRES) {
    const k = f.id.slice(4); // W/C/N/E
    out.push({ id: `k${k}n`, kind: "bench", x: f.x, y: f.y - CAMPFIRE_LOG_DY, facing: DIR.down, seatOffsets: [-9, 9], campfire: f.id });
    out.push({ id: `k${k}s`, kind: "bench", x: f.x, y: f.y + CAMPFIRE_LOG_DY + 6, facing: DIR.up, seatOffsets: [-9, 9], campfire: f.id });
    out.push({ id: `k${k}w`, kind: "chair", x: f.x - CAMPFIRE_STUMP_DX, y: f.y + 3, facing: DIR.right, seatOffsets: [0], campfire: f.id });
    out.push({ id: `k${k}e`, kind: "chair", x: f.x + CAMPFIRE_STUMP_DX, y: f.y + 3, facing: DIR.left, seatOffsets: [0], campfire: f.id });
  }
  return out;
}

const two = [-12, 12] as const;
const three = [-16, 0, 16] as const;
const four = [-27, -9, 9, 27] as const;

/** 의자 사이 돌탁자 (마주 보는 의자 두 개 가운데). 그림·충돌은 클라이언트 layout.ts */
export const TABLES: readonly { x: number; y: number }[] = [
  { x: 1164, y: 332 },
  { x: 620, y: 558 },
  { x: 1556, y: 1182 },
];

export const FURNITURE: readonly Furniture[] = [
  // id는 서버 좌석 판정·테스트가 참조한다 (bA 2인, bB 3인, lA 4인, cA→ cB← 마주 보는 의자)
  // ── 광장 ── 우물을 둘러싼 벤치, 탁자 의자
  { id: "lA", kind: "bench", x: CX, y: 356, facing: DIR.down, seatOffsets: four },
  { id: "bB", kind: "bench", x: 920, y: 452, facing: DIR.down, seatOffsets: three },
  { id: "bC", kind: "bench", x: 1128, y: 452, facing: DIR.down, seatOffsets: two },
  { id: "cA", kind: "chair", x: 1144, y: 330, facing: DIR.right, seatOffsets: [0] },
  { id: "cB", kind: "chair", x: 1184, y: 330, facing: DIR.left, seatOffsets: [0] },
  { id: "bD", kind: "bench", x: 960, y: 540, facing: DIR.down, seatOffsets: two },
  { id: "bE", kind: "bench", x: 1088, y: 540, facing: DIR.down, seatOffsets: two },
  // ── 정문 앞마당 ──
  { id: "bG", kind: "bench", x: 944, y: 100, facing: DIR.down, seatOffsets: two },
  { id: "bH", kind: "bench", x: 1104, y: 100, facing: DIR.down, seatOffsets: two },
  // ── 별 보기 언덕 ── 마을을 내려다보는 긴 벤치
  { id: "lB", kind: "bench", x: 200, y: 268, facing: DIR.down, seatOffsets: four },
  { id: "bF", kind: "bench", x: 96, y: 132, facing: DIR.down, seatOffsets: two },
  { id: "bL", kind: "bench", x: 360, y: 132, facing: DIR.down, seatOffsets: two },
  // ── 서쪽 쉼터 ── (모닥불W 둘레는 campfireSeats)
  { id: "bA", kind: "bench", x: 724, y: 408, facing: DIR.down, seatOffsets: two },
  { id: "cC", kind: "chair", x: 600, y: 556, facing: DIR.right, seatOffsets: [0] },
  { id: "cD", kind: "chair", x: 640, y: 556, facing: DIR.left, seatOffsets: [0] },
  // ── 작은 묘역 앞 ──
  { id: "bI", kind: "bench", x: 196, y: 704, facing: DIR.down, seatOffsets: two },
  { id: "bJ", kind: "bench", x: 412, y: 704, facing: DIR.down, seatOffsets: two },
  // ── 강변 산책로 (북쪽 둑, 강을 바라본다) ──
  { id: "bK", kind: "bench", x: 160, y: 792, facing: DIR.down, seatOffsets: two },
  { id: "lC", kind: "bench", x: 400, y: 792, facing: DIR.down, seatOffsets: four },
  { id: "bM", kind: "bench", x: 760, y: 792, facing: DIR.down, seatOffsets: two },
  { id: "lD", kind: "bench", x: 1216, y: 792, facing: DIR.down, seatOffsets: four },
  // ── 주거 구역 ── 사무소 앞, 골목 끝
  { id: "bN", kind: "bench", x: 1288, y: 276, facing: DIR.down, seatOffsets: two },
  { id: "bO", kind: "bench", x: 1520, y: 700, facing: DIR.down, seatOffsets: two },
  { id: "bP", kind: "bench", x: 1808, y: 700, facing: DIR.down, seatOffsets: two },
  // ── 사냥터 동굴 앞 ──
  { id: "bQ", kind: "bench", x: 1680, y: 132, facing: DIR.down, seatOffsets: two },
  // ── 성황당 앞 ──
  { id: "bR", kind: "bench", x: 652, y: 156, facing: DIR.down, seatOffsets: two },
  // ── 강 건너 ── 강가 쉼터, 풀밭, 호숫가
  { id: "bS", kind: "bench", x: 820, y: 1000, facing: DIR.down, seatOffsets: two },
  { id: "bT", kind: "bench", x: 1400, y: 1000, facing: DIR.down, seatOffsets: two },
  { id: "lE", kind: "bench", x: 960, y: 1236, facing: DIR.down, seatOffsets: four },
  { id: "cE", kind: "chair", x: 1536, y: 1180, facing: DIR.right, seatOffsets: [0] },
  { id: "cF", kind: "chair", x: 1576, y: 1180, facing: DIR.left, seatOffsets: [0] },
  { id: "bU", kind: "bench", x: 1800, y: 1268, facing: DIR.up, seatOffsets: three },
  // 모닥불 둘레 (통나무 2인 × 2 + 그루터기 × 2)
  ...campfireSeats(),
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

const furnitureMap = new Map(FURNITURE.map((f) => [f.id, f]));
const campfireMap = new Map(CAMPFIRES.map((c) => [c.id, c]));
/** 이 좌석이 모닥불 둘레 자리면 그 모닥불 (아니면 null) */
export function campfireOfSeat(seatId: string): Campfire | null {
  const s = seatMap.get(seatId);
  const f = s ? furnitureMap.get(s.furnitureId) : undefined;
  return (f?.campfire && campfireMap.get(f.campfire)) || null;
}

/** (x,y)에서 radius 안의 좌석 중 가장 가까운 것부터 정렬 */
export function seatsNear(x: number, y: number, radius: number): Seat[] {
  return SEATS.map((s) => ({ s, d: Math.hypot(s.x - x, s.y - y) }))
    .filter((e) => e.d <= radius)
    .sort((a, b) => a.d - b.d)
    .map((e) => e.s);
}

// ── 1인 자리 (좌석 체계 공통) ──
// 한 자리에는 무조건 한 명(사용자 원칙). 의자·벤치(SEATS, 고정 id)와 똑같은 sit → seat/seatDenied 판정으로
// 맵 소품 자리(나무 매달리기·그네, 앞으로 낚시 자리·채집 지점·집 안 가구 …)도 서버가 점유를 정한다.
// 소품 자리는 묘비 수에 따라 배치가 바뀌는 구역에도 있어 서버가 목록을 다 알 수 없다 → id에 종류와 앵커 좌표를 담는다:
//   `${code}_${x}_${y}` (예: 나무 "h_60_90", 그네 "s_140_96"). 앵커 = 그 자리를 차지한 캐릭터의 발 위치(MOVE x,y).
// 서버는 형식(정규형: 같은 자리는 id가 하나뿐)과 플레이어와의 거리만 확인한다. 새 1인 자리는 SPOT_KINDS에 한 줄 더하면 된다.

export type SpotKind = "hang" | "swing" | "hammock" | "boat" | "seesaw" | "trampoline" | "carousel" | "telescope" | "mat" | "fish";
/**
 * mobile = 앉은 채 움직이는 자리(조각배): 서버는 위치를 앵커에 고정하지 않고 MOVE를 따라간다 (속도 검증은 그대로).
 * radius = 서버가 점유 요청을 받을 때 허용하는 거리 (없으면 SEAT_SERVER_RADIUS)
 * fixed = 정해진 자리만 (BOATS). 형식만 맞는 아무 좌표의 id는 받지 않는다
 */
export type SpotKindDef = { code: string; state: StateId; facing: DirId; mobile?: boolean; radius?: number; fixed?: boolean; shared?: boolean };
export const SPOT_KINDS: Readonly<Record<SpotKind, SpotKindDef>> = {
  /** 나무에 매달리기 (앵커 = 줄기 앞 발 위치) */
  hang: { code: "h", state: STATE.hang, facing: DIR.down },
  /** 그네 타기 (앵커 = 그네 좌석) */
  swing: { code: "s", state: STATE.swing, facing: DIR.down },
  /** 해먹에 눕기 (앵커 = 해먹 천 가운데) */
  hammock: { code: "m", state: STATE.hammock, facing: DIR.down },
  // ── 50번 조각배·광장 놀거리 ── (아래 "조각배" 절 참고)
  /** 조각배 자리 (앵커 = 나루터에 매어 둔 자리). 타고 나면 물 위를 움직인다 */
  boat: { code: "b", state: STATE.boat, facing: DIR.right, mobile: true, radius: 72, fixed: true },
  /** 시소 한쪽 끝 (앵커 = 앉는 자리) */
  seesaw: { code: "e", state: STATE.seesaw, facing: DIR.down },
  /** 트램펄린 (앵커 = 매트 가운데) */
  trampoline: { code: "j", state: STATE.trampoline, facing: DIR.down },
  /** 회전목마 목마 하나 (앵커 = 그 목마의 기준 자리. 그림은 회전하지만 서버 위치는 앵커 그대로) */
  carousel: { code: "r", state: STATE.carousel, facing: DIR.down },
  // ── 22번 별 보기 언덕 ── shared = 평소 자세(서 있기·바닥 앉기)와 같은 상태라 MOVE만으로는 자리를 잡아 주지 않는다 (sit 요청으로만)
  /** 망원경 앞 (앵커 = TELESCOPE_SPOT). 서서 위를 본다 */
  telescope: { code: "t", state: STATE.idle, facing: DIR.up, shared: true },
  /** 돗자리에 앉기 (앵커 = 돗자리 가운데) */
  mat: { code: "n", state: STATE.sitGround, facing: DIR.down, shared: true },
  // ── 4번 낚시 ── 물가에 앉아 낚싯대를 드리운다 (바닥 앉기와 같은 상태라 shared). 정해진 자리(FISHING_SPOTS)만
  /** 낚시 자리 (앵커 = 앉는 발 위치, 방향은 자리마다 물 쪽) */
  fish: { code: "f", state: STATE.sitGround, facing: DIR.down, shared: true, fixed: true },
};
const SPOT_BY_CODE = new Map(Object.entries(SPOT_KINDS).map(([kind, v]) => [v.code, kind as SpotKind]));
const SPOT_BY_STATE = new Map<number, SpotKind>(
  Object.entries(SPOT_KINDS)
    .filter(([, v]) => !v.shared)
    .map(([kind, v]) => [v.state, kind as SpotKind]),
);
const SPOT_ID_RE = /^([a-z])_(0|[1-9]\d{0,4})_(0|[1-9]\d{0,4})$/;

/** 소품 자리 id (좌표는 정수로 반올림) */
export function spotSeatId(kind: SpotKind, x: number, y: number): string {
  return `${SPOT_KINDS[kind].code}_${Math.round(x)}_${Math.round(y)}`;
}

/** 이 상태(STATE)로 차지하는 소품 자리 종류 (hang → "hang"). 없으면 null */
export function spotKindOfState(state: number): SpotKind | null {
  return SPOT_BY_STATE.get(state) ?? null;
}

/**
 * 좌석 체계의 한 자리: 의자·벤치 좌석 또는 소품 자리.
 * state = 그 자리를 차지한 동안의 캐릭터 상태(의자 sitChair, 나무 hang, 그네 swing, 해먹 hammock), furnitureId = 같은 벤치 판정용(소품 자리는 null)
 */
export type SeatSlot = {
  id: string;
  kind: "seat" | SpotKind;
  x: number;
  y: number;
  facing: DirId;
  state: StateId;
  furnitureId: string | null;
  /** 앉은 채 움직이는 자리 (조각배). 서버는 위치를 앵커에 묶지 않는다 */
  mobile?: boolean;
  /** 점유 요청을 받는 거리 (없으면 SEAT_SERVER_RADIUS) */
  radius?: number;
};

const seatSlots = new Map<string, SeatSlot>(
  SEATS.map((s) => [s.id, { id: s.id, kind: "seat", x: s.x, y: s.y, facing: s.facing, state: STATE.sitChair, furnitureId: s.furnitureId }]),
);
for (const b of BOAT_SEATS) {
  const k = SPOT_KINDS.boat;
  seatSlots.set(b.id, { id: b.id, kind: "boat", x: b.x, y: b.y, facing: b.facing, state: k.state, furnitureId: b.boatId, mobile: true, radius: k.radius });
}
for (const f of FISHING_SPOTS) seatSlots.set(f.id, { id: f.id, kind: "fish", x: f.x, y: f.y, facing: f.facing, state: SPOT_KINDS.fish.state, furnitureId: null });

/** id → 자리 (의자·벤치 좌석 또는 형식이 맞는 소품 자리). 모르는 id면 undefined */
export function seatSlot(id: string): SeatSlot | undefined {
  const s = seatSlots.get(id);
  if (s) return s;
  const m = SPOT_ID_RE.exec(id);
  if (!m) return undefined;
  const kind = SPOT_BY_CODE.get(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);
  if (!kind || x > 0xffff || y > 0xffff) return undefined;
  const k = SPOT_KINDS[kind];
  if (k.fixed) return undefined; // 조각배처럼 정해진 자리만 있는 종류 (위 seatSlots에 없으면 없는 자리)
  return { id, kind, x, y, facing: k.facing, state: k.state, furnitureId: null, ...(k.radius ? { radius: k.radius } : {}) };
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

