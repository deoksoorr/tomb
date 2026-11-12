import { DIR, STATE, type DirId, type StateId } from "./types";

// 맵 레이아웃. 모든 채널이 같은 맵을 쓰고, 서버(좌석 판정·범위 검증)와 클라이언트(렌더링·충돌)가 공유한다.
// 단위: 월드 픽셀(스케일 전). 16px 타일, 화면에는 3배 줌. 가로 1440 × 세로 1024 고정 (구역 배치는 아래 ZONES 그림).
// 충돌(걸을 수 있는 칸)은 클라이언트 game/world/layout.ts의 staticColliders()/walkableGrid()가 이 좌표로 만든다.

export const TILE = 16;
export const ZOOM = 3;
export const MAP_COLS = 90;
export const MAP_WIDTH = MAP_COLS * TILE; // 1440
export const MAP_ROWS = 64;
/** 맵 높이 (고정). 묘비 수와 상관없다 — 묘역 세 곳의 정원 합계는 GRAVEYARD_CAPACITY */
export const MAP_HEIGHT = MAP_ROWS * TILE; // 1024
/** @deprecated 예전 "묘비가 없을 때의 최소 높이". 이제 맵 높이는 MAP_HEIGHT로 고정 */
export const MAP_MIN_HEIGHT = MAP_HEIGHT;
/** u16 좌표 상한 */
export const MAP_MAX_HEIGHT = 0xffff;
/** 위/좌/우 돌담 두께 (이동 불가 영역) */
export const WALL_THICKNESS = 2 * TILE;
/**
 * 맵 배치 버전. 좌표가 바뀌는 맵 개편마다 올린다 → 옛 맵에서 저장한 새로고침 자리 기록(lib/resume.ts)은 위치를 버리고 입구에서 시작한다.
 * 1 = 세로로 길던 공동묘지 맵, 2 = 가을·겨울 마을(가로로 넓은 맵), 3 = 컴팩트한 묘지 마을(F1: 큰 모닥불 광장·묘역 세 곳·연못 여럿)
 */
export const MAP_VERSION = 3;

const CX = MAP_WIDTH / 2; // 720

// ── 구역 ── (달빛 묘지 마을. 한가운데 큰 모닥불 광장을 묘역 세 곳·언덕·연못·주거 구역이 바짝 둘러싼다)
//
//  y=0    ┌──돌담──────────────────[정문]──[사냥터 동굴]──────────────────────────┐
//         │ ▲별 보기 언덕▲ (달빛 연못) 유령잡화점 SPAWN  ⚑팻말   분양사무소 (까마귀 연못)│
//  y≈176  │ ▲망원경·벤치▲ ═══════════════ 북쪽 길 ═════════════════════════════════│
//  y≈272  │ ▲절벽·계단▲    종루 ┌──────── 모닥불 광장 ────────┐ ║ 집 집 집      │
//  y≈288  │ ┌─옛 묘역 16─┐ 성황당│ 분수  그네   트램펄린     │ ║ 집 집 집      │
//         │ │ 철책·묘비  │═════│      ( 큰 모닥불 )        │ ║ 집 집 집      │
//  y≈544  │ └────────────┘     │ 회전목마  해먹   시소      │ ║ 집 집 집      │
//  y≈600  │ 묘지기 모닥불       └───────────────────────────┘ ╚═══════════════│
//  y≈700  │ ~~~ 강 ~~[서쪽 다리]~~~~[징검다리]~~[가운데 다리]~~~╲  나루터       │
//  y≈784  │ ┌버드나무 묘역 8┐ (안개 연못) ┌다리 건너 묘역 8┐ 호박밭 ╲( 호수 ·배 )│
//  y≈1008 └──────────────────────────────────────────────────────────────────────┘

export type ZoneId = "hill" | "graveyard" | "plaza" | "housing" | "river" | "lake" | "pond" | "forest" | "meadow" | "gate";
export type Zone = { id: ZoneId; name: string; x: number; y: number; w: number; h: number };
/** 구역 사각형 (이름표·안내·앞으로의 콘텐츠 배치 기준. 충돌과는 상관없다) */
export const ZONES: readonly Zone[] = [
  { id: "hill", name: "별 보기 언덕", x: 32, y: 32, w: 336, h: 208 },
  { id: "gate", name: "정문 앞마당", x: 624, y: 32, w: 192, h: 128 },
  { id: "graveyard", name: "옛 묘역", x: 48, y: 288, w: 384, h: 256 },
  { id: "plaza", name: "모닥불 광장", x: 512, y: 240, w: 416, h: 400 },
  { id: "housing", name: "주거 구역", x: 976, y: 208, w: 432, h: 576 },
  { id: "river", name: "강", x: 32, y: 664, w: 1120, h: 136 },
  { id: "lake", name: "호수", x: 1120, y: 820, w: 272, h: 168 },
  { id: "pond", name: "달빛 연못", x: 398, y: 74, w: 116, h: 76 },
  { id: "pond", name: "까마귀 연못", x: 1108, y: 62, w: 232, h: 92 },
  { id: "forest", name: "안개 숲", x: 400, y: 784, w: 200, h: 224 },
  { id: "graveyard", name: "다리 건너 묘역", x: 600, y: 784, w: 256, h: 224 },
  { id: "graveyard", name: "버드나무 묘역", x: 48, y: 784, w: 352, h: 224 },
  { id: "meadow", name: "호박밭", x: 864, y: 864, w: 240, h: 144 },
];

export const SPAWN = { x: CX, y: 60 } as const;

// ── 묘역 (F1·F4: 세 곳에 나눠 배치, 49번 성불과 같은 정원) ──
/**
 * 한 채널 묘역 세 곳에 동시에 놓일 수 있는 묘비 수 (GRAVE_AREAS 칸 수의 합 = 16 + 8 + 8).
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

/**
 * 묘역 하나: rect = 철책 안쪽 땅, 격자 = cols × rows (block열마다 가운데 통로 aisle, 통로 가운데 x = aisleX).
 * 묘비 받침 x = x0 + col·dx (+ 통로), y = y0 + row·dy. 묘비 앞(아래 22px)에 서서 헌화한다.
 */
export type GraveArea = {
  id: "A" | "B" | "C";
  name: string;
  rect: { x: number; y: number; w: number; h: number };
  cols: number;
  rows: number;
  block: number;
  aisleX: number;
  aisle: number;
  dx: number;
  dy: number;
  x0: number;
  y0: number;
};
function area(id: GraveArea["id"], name: string, rect: GraveArea["rect"], cols: number, rows: number, aisleX: number, dx: number, y0: number): GraveArea {
  const aisle = 32;
  return { id, name, rect, cols, rows, block: cols / 2, aisleX, aisle, dx, dy: 80, x0: aisleX - ((cols - 1) * dx + aisle) / 2, y0 };
}
/** 옛 묘역(언덕 아래, 16기) · 다리 건너 묘역(8기) · 버드나무 묘역(8기) */
export const GRAVE_AREAS: readonly GraveArea[] = [
  area("A", "옛 묘역", { x: 48, y: 288, w: 384, h: 256 }, 8, 2, 240, 40, 368),
  area("B", "다리 건너 묘역", { x: 600, y: 784, w: 256, h: 224 }, 4, 2, 720, 44, 848),
  area("C", "버드나무 묘역", { x: 48, y: 784, w: 352, h: 224 }, 4, 2, 176, 44, 864),
];
/**
 * 등록 순서(index % 32) → (묘역, 그 묘역의 칸). 묘역마다 골고루 먼저 차도록 A·B·A·C 순서를 되풀이한다
 * (묘비가 몇 개 없어도 세 묘역 모두에 사람이 세운 묘비가 보인다).
 */
const SLOT_TABLE: readonly { area: GraveArea; k: number }[] = (() => {
  const order = [0, 1, 0, 2];
  const used = [0, 0, 0];
  const out: { area: GraveArea; k: number }[] = [];
  for (let i = 0; out.length < GRAVEYARD_CAPACITY; i++) {
    const a = order[i % order.length];
    const g = GRAVE_AREAS[a];
    if (used[a] >= g.cols * g.rows) continue;
    out.push({ area: g, k: used[a]++ });
  }
  return out;
})();

/** @deprecated 예전 한 묘역 격자 이름 (호환용). 이제 묘역은 GRAVE_AREAS 세 곳 — 칸 수 합계만 같다 (8 × 4 = 32) */
export const GRID_COLS = 8;
/** @deprecated GRID_COLS 참고 */
export const GRID_ROWS = 4;
/** @deprecated 옛 묘역(A)의 값 */
export const GRID_BLOCK = 4;
/** @deprecated 옛 묘역(A)의 첫 줄 y */
export const GRID_Y0 = GRAVE_AREAS[0].y0;
/** @deprecated 옛 묘역(A)의 값 */
export const GRID_DX = GRAVE_AREAS[0].dx;
/** @deprecated 묘역 줄 간격 (세 묘역 같다) */
export const GRID_DY = 80;
/** @deprecated */
export const GRID_WALK = 0;
/** @deprecated */
export const GRID_AISLE = 32;
/** @deprecated 옛 묘역(A) 가운데 통로 x (언덕 계단과 줄을 맞춘다) */
export const GRAVEYARD_AISLE_X = GRAVE_AREAS[0].aisleX;
/** @deprecated 옛 묘역(A) 첫 열 x */
export const GRID_X0 = GRAVE_AREAS[0].x0;

/** 묘비 자리 (index는 등록 순서. 묘역 정원을 넘으면 자리를 돌려 쓴다) */
export function graveSlot(index: number): { x: number; y: number; col: number; row: number; area: GraveArea["id"] } {
  const i = ((index % GRAVEYARD_CAPACITY) + GRAVEYARD_CAPACITY) % GRAVEYARD_CAPACITY;
  const { area: g, k } = SLOT_TABLE[i];
  const col = k % g.cols;
  const row = Math.floor(k / g.cols);
  const x = g.x0 + col * g.dx + (col >= g.block ? g.aisle : 0);
  return { x, y: g.y0 + row * g.dy, col, row, area: g.id };
}

/** 이 묘역 id의 묘역 */
export function graveArea(id: GraveArea["id"]): GraveArea {
  return GRAVE_AREAS.find((a) => a.id === id)!;
}

/** 이 index의 묘비가 지금 묘역에 보이는지 (가장 최근 GRAVEYARD_CAPACITY기만) */
export function graveVisible(index: number, count: number): boolean {
  return index >= 0 && index < count && index >= count - GRAVEYARD_CAPACITY;
}

/** 묘비 자리 이름 (등록 순서 index 기준). 묘비를 세운 뒤 안내·상세 모달에 쓴다. 예: "옛 묘역 2번째 줄 · 7번 자리" */
export function plotLabel(index: number): string {
  const { row, col, area: id } = graveSlot(index);
  return `${graveArea(id).name} ${row + 1}번째 줄 · ${col + 1}번 자리`;
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

// ── 유령 잡화점 ── 정문 왼쪽, 북쪽 길가의 작은 오두막. 문 앞(SHOP_DOOR)에서 들어가면 상점 맵(실내)으로 바뀐다.
// 상점 안에 있는 동안 실시간 위치는 문 앞에 멈춰 있는 것으로 둔다.
/** 오두막 바닥 가운데 */
export const SHOP = { x: 560, y: 148 } as const;
/** 문 앞 (들어가는 자리이자 나왔을 때 서는 자리) */
export const SHOP_DOOR = { x: 560, y: 160 } as const;

// ── 특별한 장소 ── 앞에서 E/탭 → UI에 portal:open {kind}. 좌표는 상호작용하는 자리(입구 앞 발밑)
/** 사냥터 입구: 정문 바로 오른쪽 윗담에 뚫린 동굴 문 (F6: 스폰에서 바로 보인다) */
export const HUNT_GATE = { x: 864, y: 44 } as const;
/** 사냥터 팻말 (동굴로 가는 길가). 그림·이름표는 클라이언트 */
export const HUNT_SIGN = { x: 824, y: 112 } as const;
/** 분양 사무소(하우징): 주거 구역 골목 어귀, 북쪽 길가의 작은 사무실 오두막. 바닥 가운데 */
export const HOUSING_OFFICE = { x: 960, y: 156 } as const;
/** 분양 사무소 문 앞 */
export const HOUSING_DOOR = { x: 960, y: 168 } as const;
/** 성황당: 돌무더기 + 천을 묶은 나무. 옛 묘역 동문 바로 밖 (F10: 묘역 옆). 돌무더기 앞자리 */
export const SHRINE = { x: 472, y: 372 } as const;
/** 특별한 장소 상호작용 반경 */
export const PORTAL_RADIUS = 18;

// ── 주거 구역 ── 분양 마을을 메인 맵에 합쳤다. 번지(1..WORLD_LOTS)마다 필지 하나, 그 집의 외관이 서 있다.
// 필지 = 외관 캔버스(가로 128 × 세로 104, game/housing/art.ts FACADE_*) 크기. 문 앞은 필지 (x+64, y+92).
// 광장 동쪽에 3열 × 4줄. 서쪽 골목(세로)과 줄마다 집 앞 골목(가로)이 있다.
// 번지가 WORLD_LOTS보다 큰 집은 분양 사무소의 "분양 마을(2단지)"에서 본다.
export const HOUSE_LOT_W = 128;
export const HOUSE_LOT_H = 104;
export const HOUSE_COLS = 3;
export const HOUSE_ROWS = 4;
/** 메인 맵에 서는 번지 수 (1..WORLD_LOTS) */
export const WORLD_LOTS = HOUSE_COLS * HOUSE_ROWS;
const HOUSE_X0 = 1008;
const HOUSE_Y0 = 216;
const HOUSE_PITCH_X = HOUSE_LOT_W + 4;
const HOUSE_PITCH_Y = HOUSE_LOT_H + 40;
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

// ── 강·연못·호수 ── (물 판정·그림은 클라이언트 layout.ts, 좌표 원본은 여기)
/** 강 가운데 줄 (서쪽 담 밑에서 흘러나와 광장 남쪽을 지나 남동쪽 호수로). 물살은 이 순서 방향. x는 늘어나는 순서 */
export const RIVER_PATH: readonly { x: number; y: number }[] = [
  { x: 16, y: 692 },
  { x: 160, y: 704 },
  { x: 340, y: 694 },
  { x: 520, y: 712 },
  { x: 720, y: 706 },
  { x: 880, y: 726 },
  { x: 944, y: 790 },
  { x: 1000, y: 840 },
  { x: 1150, y: 892 },
];
/** 강 폭의 절반 */
export const RIVER_HALF_W = 22;
/** x에서 강 가운데 줄의 y (RIVER_PATH 사이를 잇는 꺾은선) */
export function riverYAt(x: number): number {
  const p = RIVER_PATH;
  if (x <= p[0].x) return p[0].y;
  for (let i = 1; i < p.length; i++) if (x <= p[i].x) return p[i - 1].y + ((p[i].y - p[i - 1].y) * (x - p[i - 1].x)) / (p[i].x - p[i - 1].x);
  return p[p.length - 1].y;
}
export type Pond = { id: string; name: string; x: number; y: number; rx: number; ry: number };
/** 호수 (타원, 남동쪽). 강이 흘러든다. 나루터·조각배·낚시 잔교 */
export const LAKE = { x: 1256, y: 904, rx: 136, ry: 84 } as const;
/** 작은 연못 (타원). F9: 위쪽(언덕 옆·주거 구역 위)에서도 가깝게 여러 곳. 낚시는 호수와 같은 물고기 */
export const PONDS: readonly Pond[] = [
  { id: "pondN", name: "달빛 연못", x: 456, y: 112, rx: 58, ry: 38 },
  { id: "pondNE", name: "까마귀 연못", x: 1224, y: 108, rx: 116, ry: 46 },
  { id: "pondS", name: "안개 연못", x: 500, y: 888, rx: 60, ry: 38 },
];
/** 강을 건너는 다리 (세로로 놓인 판자 길, 가운데 x와 위·아래 끝 y). 양 끝은 둑 위까지 넉넉히 걸친다 */
export const BRIDGES: readonly { id: string; x: number; y0: number; y1: number; w: number }[] = [
  { id: "bridgeW", x: 176, y0: 660, y1: 744, w: 24 },
  { id: "bridgeC", x: 720, y0: 668, y1: 748, w: 32 },
];
/** 징검다리 돌 (발판 반지름 STEP_STONE_R) */
export const STEP_STONES: readonly { x: number; y: number }[] = [
  { x: 598, y: 688 },
  { x: 604, y: 699 },
  { x: 598, y: 710 },
  { x: 604, y: 721 },
  { x: 599, y: 732 },
];
export const STEP_STONE_R = 7;
/**
 * 나루터 (호수 북쪽 둑에서 물로 나간 판자 선착장). 조각배(50번)가 여기서 출발한다 — 배가 모두 처음부터 호수에 떠 있다 (F13).
 * FERRY_DOCK = 배 타기 상호작용 자리(선착장 끝), BOAT_MOORING = 매어 둔 배 자리(물 위).
 */
export const FERRY_DOCK = { x: 1244, y: 846 } as const;
export const DOCK_DECK = { x: 1232, y: 800, w: 24, h: 56 } as const;
export const BOAT_MOORING = { x: 1206, y: 862 } as const;
/** 호수 낚시 잔교 (서쪽 둑에서 호수로 뻗은 판자) */
export const LAKE_PIER = { x: 1108, y: 924, w: 72, h: 16 } as const;
/** 낚시 잔교 전부 (호수 + 까마귀 연못). 판자 위는 물이 아니다 */
export const PIERS: readonly { x: number; y: number; w: number; h: number }[] = [LAKE_PIER, { x: 1212, y: 126, w: 24, h: 46 }];

// ── 낚시 자리 (4번·F13) ── 연못·호수 둑과 잔교·강 양쪽 둑. 자리마다 1인(SPOT_KINDS.fish, 서버 좌석 — 정해진 자리만).
// 앵커(x,y) = 앉는 발 위치(물가 뭍 또는 잔교), facing = 물 쪽. 자리 id = spotSeatId("fish", x, y) — 예 "f_456_158".
// 무엇이 잡히는지(호수/강)는 water로 웹 서버(apps/web/lib/forage)가 정한다 (연못은 호수와 같은 물). 실시간 서버는 점유만 판정한다.
export type FishingSpot = { id: string; water: "lake" | "river"; x: number; y: number; facing: DirId };
const fishSpot = (water: FishingSpot["water"], x: number, y: number, facing: DirId): FishingSpot => ({ id: `f_${x}_${y}`, water, x, y, facing });
/** 강 북쪽 둑(아래를 본다)·남쪽 둑(위를 본다) 낚시 자리 — 가운데 줄에서 27px */
const riverSpot = (x: number, north: boolean) => fishSpot("river", x, Math.round(riverYAt(x) + (north ? -27 : 27)), north ? DIR.down : DIR.up);
export const FISHING_SPOTS: readonly FishingSpot[] = [
  // 달빛 연못 (언덕 옆)
  fishSpot("lake", 456, 158, DIR.up),
  fishSpot("lake", 412, 146, DIR.up),
  fishSpot("lake", 456, 68, DIR.down),
  fishSpot("lake", 520, 116, DIR.left),
  fishSpot("lake", 392, 108, DIR.right),
  // 까마귀 연못 (주거 구역 위): 잔교 끝·둑
  fishSpot("lake", 1224, 134, DIR.up),
  fishSpot("lake", 1150, 152, DIR.up),
  fishSpot("lake", 1298, 152, DIR.up),
  fishSpot("lake", 1176, 58, DIR.down),
  fishSpot("lake", 1272, 58, DIR.down),
  fishSpot("lake", 1346, 108, DIR.left),
  fishSpot("lake", 1102, 108, DIR.right),
  // 강 양쪽 둑
  riverSpot(264, true),
  riverSpot(420, true),
  riverSpot(560, true),
  riverSpot(840, true),
  riverSpot(260, false),
  riverSpot(440, false),
  riverSpot(660, false),
  riverSpot(800, false),
  // 안개 연못
  fishSpot("lake", 500, 842, DIR.down),
  fishSpot("lake", 500, 934, DIR.up),
  fishSpot("lake", 434, 888, DIR.right),
  fishSpot("lake", 566, 888, DIR.left),
  // 호수: 잔교 끝·옆, 둑
  fishSpot("lake", 1172, 932, DIR.right),
  fishSpot("lake", 1148, 932, DIR.up),
  fishSpot("lake", 1180, 828, DIR.down),
  fishSpot("lake", 1300, 826, DIR.down),
  fishSpot("lake", 1398, 904, DIR.left),
  fishSpot("lake", 1256, 994, DIR.up),
  fishSpot("lake", 1180, 982, DIR.up),
  fishSpot("lake", 1340, 980, DIR.up),
];
/** 이 좌석 id의 낚시 자리 (없으면 undefined) */
export function fishingSpotById(id: string): FishingSpot | undefined {
  return FISHING_SPOTS.find((s) => s.id === id);
}

// ── 조각배 (50번) ── 나루터(FERRY_DOCK)에서 E → 배에 탄다. 자리마다 1인(SPOT_KINDS.boat, 서버 좌석).
// 1인승 2척(선착장 양옆) + 2인승 1척(선착장 끝 앞, 앞자리 = 노 젓는 사람, 뒷자리 = 같이 타는 사람). 모두 호수에 매어 둔다.
// 앵커(x,y) = 나루터에 매어 둔 자리. 타면 위치는 클라이언트가 물 위로 옮기고(서버는 mobile 자리라 따라간다),
// 내리면 배는 잠시 뒤 이 자리로 돌아온다 (클라이언트 연출). 자리 id = spotSeatId("boat", x, y) — 예 "b_1206_850"
export type Boat = { id: string; x: number; y: number; seats: 1 | 2; facing: DirId };
export const BOATS: readonly Boat[] = [
  { id: "boatA", x: 1206, y: 850, seats: 1, facing: DIR.left },
  { id: "boatB", x: 1282, y: 850, seats: 1, facing: DIR.right },
  { id: "boatC", x: 1250, y: 884, seats: 2, facing: DIR.right },
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

// ── 별 보기 언덕 ── 북서쪽 구석의 높은 대지 (F3). 남쪽은 두 칸 높이 절벽, 동쪽은 바위 비탈이고 계단(HILL_STAIRS)으로만 오른다.
// 계단은 옛 묘역 북문과 줄을 맞춘다 (언덕 위에서 묘역을 내려다본다)
export const HILL = { x: 32, y: 32, w: 336, h: 208 } as const;
/** 계단 (절벽 사이의 틈, 이 x 범위로만 오르내린다) */
export const HILL_STAIRS = { x: 224, w: 32 } as const;
/** 남쪽 절벽 높이 (언덕 아랫변 HILL.y + HILL.h 부터). 동쪽 비탈 폭은 TILE */
export const HILL_CLIFF = 32;
/**
 * 망원경 (22번·별 보기 언덕): 언덕 꼭대기 돌 마당. 받침 가운데(발 위치).
 * 앞자리(TELESCOPE_SPOT)에서 E → 별자리 잇기. 1인 자리(SPOT_KINDS.telescope, id = spotSeatId("telescope", x, y))
 */
export const TELESCOPE = { x: 296, y: 92 } as const;
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
// big = 광장 한가운데의 아주 큰 모닥불 (F1): 통나무 6개(위 3·아래 3)와 그루터기 4개가 넓게 둘러싼다.
export type Campfire = { id: string; x: number; y: number; big?: boolean };
/** 모닥불 자리 (불 받침 가운데). 광장 큰 모닥불 · 묘지기 모닥불(옛 묘역 아래 강가) · 호박밭 모닥불 */
export const CAMPFIRES: readonly Campfire[] = [
  { id: "fireP", x: 720, y: 456, big: true },
  { id: "fireW", x: 136, y: 604 },
  { id: "fireS", x: 968, y: 912 },
];
/** 모닥불 중심에서 위 통나무·그루터기까지 (아래 통나무는 앉은 사람이 불을 가리지 않게 6px 더 아래) */
export const CAMPFIRE_LOG_DY = 20;
export const CAMPFIRE_STUMP_DX = 26;
/** 큰 모닥불 둘레 (불 중심 기준): 위 통나무 3개, 아래 통나무 3개, 좌우 그루터기 2개씩 */
export const BIG_FIRE_LOGS: readonly { dx: number; dy: number; up: boolean }[] = [
  { dx: -46, dy: -38, up: false },
  { dx: 0, dy: -46, up: false },
  { dx: 46, dy: -38, up: false },
  { dx: -46, dy: 44, up: true },
  { dx: 0, dy: 52, up: true },
  { dx: 46, dy: 44, up: true },
];
export const BIG_FIRE_STUMPS: readonly { dx: number; dy: number }[] = [
  { dx: -72, dy: -6 },
  { dx: -72, dy: 18 },
  { dx: 72, dy: -6 },
  { dx: 72, dy: 18 },
];

function campfireSeats(): Furniture[] {
  const out: Furniture[] = [];
  for (const f of CAMPFIRES) {
    const k = f.id.slice(4); // P/W/S
    if (f.big) {
      BIG_FIRE_LOGS.forEach((l, i) =>
        out.push({ id: `k${k}${i + 1}`, kind: "bench", x: f.x + l.dx, y: f.y + l.dy, facing: l.up ? DIR.up : DIR.down, seatOffsets: [-9, 9], campfire: f.id }),
      );
      BIG_FIRE_STUMPS.forEach((s, i) =>
        out.push({ id: `k${k}${s.dx < 0 ? "w" : "e"}${(i % 2) + 1}`, kind: "chair", x: f.x + s.dx, y: f.y + s.dy, facing: s.dx < 0 ? DIR.right : DIR.left, seatOffsets: [0], campfire: f.id }),
      );
      continue;
    }
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
  { x: 824, y: 352 },
  { x: 1030, y: 962 },
];

export const FURNITURE: readonly Furniture[] = [
  // id는 서버 좌석 판정·테스트가 참조한다 (bA 2인, bB 3인, lA 4인, cA→ cB← 마주 보는 의자)
  // ── 모닥불 광장 ── 큰 모닥불을 바라보는 긴 벤치, 탁자 의자
  { id: "lA", kind: "bench", x: CX, y: 362, facing: DIR.down, seatOffsets: four },
  { id: "bB", kind: "bench", x: 604, y: 540, facing: DIR.down, seatOffsets: three },
  { id: "bC", kind: "bench", x: 836, y: 540, facing: DIR.down, seatOffsets: two },
  { id: "cA", kind: "chair", x: 804, y: 350, facing: DIR.right, seatOffsets: [0] },
  { id: "cB", kind: "chair", x: 844, y: 350, facing: DIR.left, seatOffsets: [0] },
  // ── 정문 앞마당 ──
  { id: "bG", kind: "bench", x: 656, y: 100, facing: DIR.down, seatOffsets: two },
  { id: "bH", kind: "bench", x: 784, y: 100, facing: DIR.down, seatOffsets: two },
  // ── 별 보기 언덕 ── 묘역을 내려다보는 긴 벤치, 망원경 옆 벤치
  { id: "lB", kind: "bench", x: 128, y: 216, facing: DIR.down, seatOffsets: four },
  { id: "bF", kind: "bench", x: 88, y: 112, facing: DIR.down, seatOffsets: two },
  { id: "bL", kind: "bench", x: 340, y: 132, facing: DIR.down, seatOffsets: two },
  // ── 성황당 아래 (옛 묘역 동문 밖, 광장 쪽을 바라본다) ──
  { id: "bA", kind: "bench", x: 466, y: 446, facing: DIR.down, seatOffsets: two },
  // ── 옛 묘역 안 ── 묘비를 바라보는 추모 벤치
  { id: "bI", kind: "bench", x: 132, y: 522, facing: DIR.up, seatOffsets: two },
  { id: "bJ", kind: "bench", x: 348, y: 522, facing: DIR.up, seatOffsets: two },
  // ── 강변 산책로 (북쪽 둑, 강을 바라본다) ──
  { id: "lC", kind: "bench", x: 352, y: 652, facing: DIR.down, seatOffsets: four },
  { id: "bK", kind: "bench", x: 488, y: 652, facing: DIR.down, seatOffsets: two },
  { id: "bM", kind: "bench", x: 896, y: 664, facing: DIR.down, seatOffsets: two },
  // ── 주거 구역 ── 골목 어귀, 호숫가
  { id: "bN", kind: "bench", x: 952, y: 262, facing: DIR.down, seatOffsets: two },
  { id: "bO", kind: "bench", x: 1060, y: 800, facing: DIR.down, seatOffsets: two },
  { id: "lE", kind: "bench", x: 1368, y: 800, facing: DIR.down, seatOffsets: four },
  // ── 사냥터 동굴 앞 ──
  { id: "bQ", kind: "bench", x: 912, y: 112, facing: DIR.down, seatOffsets: two },
  // ── 다리 건너 묘역 · 버드나무 묘역 ── 묘비를 바라보는 벤치
  { id: "bV", kind: "bench", x: 656, y: 984, facing: DIR.up, seatOffsets: two },
  { id: "bW", kind: "bench", x: 784, y: 984, facing: DIR.up, seatOffsets: two },
  { id: "bX", kind: "bench", x: 116, y: 988, facing: DIR.up, seatOffsets: two },
  // ── 안개 연못 · 호박밭 ──
  { id: "bS", kind: "bench", x: 440, y: 972, facing: DIR.up, seatOffsets: two },
  { id: "cE", kind: "chair", x: 1010, y: 960, facing: DIR.right, seatOffsets: [0] },
  { id: "cF", kind: "chair", x: 1050, y: 960, facing: DIR.left, seatOffsets: [0] },
  // 모닥불 둘레 (통나무 2인 + 그루터기)
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

