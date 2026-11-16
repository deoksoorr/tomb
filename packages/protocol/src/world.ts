import { DIR, STATE, type DirId, type StateId } from "./types";

// 맵 레이아웃. 모든 채널이 같은 맵을 쓰고, 서버(좌석 판정·범위 검증)와 클라이언트(렌더링·충돌)가 공유한다.
// 단위: 월드 픽셀(스케일 전). 16px 타일, 화면에는 3배 줌. 가로 1440 × 세로 1024 고정 (구역 배치는 아래 ZONES 그림).
// 충돌(걸을 수 있는 칸)은 클라이언트 game/world/layout.ts의 staticColliders()/walkableGrid()가 이 좌표로 만든다.

export const TILE = 16;
export const ZOOM = 3;
export const MAP_COLS = 90;
export const MAP_WIDTH = MAP_COLS * TILE; // 1440
export const MAP_ROWS = 64;
/** 맵 높이 (고정). 묘비 수와 상관없다 — 묘역(옛 묘역 하나)의 정원은 GRAVEYARD_CAPACITY */
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
 * 4 = 낚시터(호수 북동쪽 데크·아치·노점 마당, 까마귀 연못 마른 나무·비석) — 데크·장식 자리에 옛 기록이 끼지 않게
 * 5 = 동물원(버드나무 묘역 자리 — 울타리·우리·사육사 노점, 묘비 자리는 옛 묘역·다리 건너 묘역으로 옮김) — 우리 안에 옛 기록이 끼지 않게
 * 6 = 11/15 오리 연못(동물원을 줄이고 연못을 넓힘)·납품 부두(낚시 데크를 줄이고 의뢰 게시판 마당)·필지 1·11·12번 없앰(버스 정류장 광장)
 *     — 넓어진 물·우리 울타리·새 장식 자리에 옛 기록이 끼지 않게
 * 7 = 필지를 1~9번지로 (1번지 되살림, 10·11·12번지 없앰 → 버스 정류장 광장을 10번지 자리로) — 광장·필지 자리가 바뀌어서
 * 8 = 납품 부두 기록 수족관 자리에 주말 버스 정류장(지붕·벤치·팻말 충돌), 10번지 자리는 쉼터 광장 — 새 충돌 자리에 옛 기록이 끼지 않게
 * 9 = 별 보기 언덕에 망원경 두 대 (둘째 받침 충돌·넓어진 돌 마당) — 새 충돌 자리에 옛 기록이 끼지 않게
 * 10 = 납품 부두 좁힘(잔교·끝 데크·아래 마당)·나루터와 띄움, 주말 버스 정류장 승강장·정차 칸 — 새 충돌 자리에 옛 기록이 끼지 않게
 * 11 = 납품 부두 없앰(잔교·데크·낚시 자리), 어부 노점 호박밭 옆, 강둑·호수 낚시 자리 — 새 충돌 자리에 옛 기록이 끼지 않게
 * (11/16 묘역 하나로 합침·범퍼카장 — 배포 때 12로 올릴 것: 묘비 줄·링크 테두리 자리에 옛 기록이 끼지 않게)
 * 12 = 묘역 하나로 합침(옛 묘역 8×4), 다리 건너 묘역 자리에 범퍼카장 — 새 충돌 자리에 옛 기록이 끼지 않게
 * 13 = 행운권 판매대 충돌 · 범퍼카장 링크/오리 연못 넓힘
 * 14 = 11/16 서쪽 모닥불을 치우고 바닷가행 정류장 — 새 충돌 자리에 옛 기록이 끼지 않게
 */
export const MAP_VERSION = 14; // 14 = 서쪽 모닥불(fireW) 치우고 그 자리에 바닷가행 정류장(지붕·벤치 bU·팻말 충돌) (11/16)

const CX = MAP_WIDTH / 2; // 720

// ── 구역 ── (달빛 묘지 마을. 한가운데 큰 모닥불 광장을 묘역 세 곳·언덕·연못·주거 구역이 바짝 둘러싼다)
//
//  y=0    ┌──돌담──────────────────[정문]──[사냥터 동굴]──────────────────────────┐
//         │ ▲별 보기 언덕▲ (달빛 연못) 유령잡화점 SPAWN  ⚑팻말   분양사무소 (까마귀 연못)│
//  y≈176  │ ▲망원경·벤치▲ ═══════════════ 북쪽 길 ═════════════════════════════════│
//  y≈272  │ ▲절벽·계단▲    종루 ┌──────── 모닥불 광장 ────────┐ ║ 집 집 집      │
//  y≈288  │ ┌─옛 묘역 32─┐ 성황당│ 분수  그네   트램펄린     │ ║ 집 집 집      │
//         │ │ 철책·묘비  │═════│      ( 큰 모닥불 )        │ ║ 집 집 집      │
//  y≈544  │ └────────────┘     │ 회전목마  해먹   시소      │ ║ 집 집 집      │
//  y≈600  │ 묘지기 모닥불       └───────────────────────────┘ ╚═══════════════│
//  y≈700  │ ~~~ 강 ~~[서쪽 다리]~~~~[징검다리]~~[가운데 다리]~~~╲  나루터·정류장  │
//  y≈784  │ ┌─ 동물원 (우리 5곳·사육사) ─┐ (오리 연못) ┌─ 범퍼카장 ─┐ 호박밭 ╲( 호수 ·배 )│
//  y≈1008 └──────────────────────────────────────────────────────────────────────┘

export type ZoneId = "hill" | "graveyard" | "plaza" | "housing" | "river" | "lake" | "pond" | "forest" | "meadow" | "gate" | "busyard" | "zoo" | "bumper";
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
  { id: "forest", name: "안개 숲", x: 304, y: 784, w: 304, h: 224 },
  // 11/15 오리 연못 (안개 숲 가운데, 오리배 선착장). DUCK_POND와 같은 타원을 두르는 사각형 (11/16 위아래로 넓혔다)
  { id: "pond", name: "오리 연못", x: 342, y: 800, w: 264, h: 196 },
  // 11/16 범퍼카장 (예전 다리 건너 묘역 자리 — 묘비 자리는 옛 묘역 하나로 합쳤다). BUMPER_YARD와 같은 사각형 (11/16 링크를 넓히며 호박밭 쪽으로)
  { id: "bumper", name: "범퍼카장", x: 608, y: 784, w: 304, h: 224 },
  // 동물원 (예전 버드나무 묘역 자리, 사용자 요청: 펫은 사육사에게서). ZOO와 같은 사각형
  { id: "zoo", name: "동물원", x: 48, y: 784, w: 256, h: 224 },
  { id: "meadow", name: "호박밭", x: 912, y: 864, w: 192, h: 144 },
  // 11/15 버스 정류장 마당 (없앤 11·12번지 자리 — 의뢰 게시판·긴급 의뢰 현판·주말 버스 정류장). 납품 부두(낚시 잔교·어부 노점)는 없앴다. WHARF_YARD와 같은 사각형
  { id: "busyard", name: "버스 정류장 마당", x: 1144, y: 640, w: 256, h: 112 },
];

export const SPAWN = { x: CX, y: 60 } as const;

// ── 묘역 (F1·F4 → 11/16 옛 묘역 하나, 49번 성불과 같은 정원) ──
/**
 * 한 채널 묘역에 동시에 놓일 수 있는 묘비 수 (GRAVE_AREAS 칸 수 = 8열 × 4줄).
 * 버드나무 묘역이 동물원이 되고(7), 다리 건너 묘역이 범퍼카장이 되면서(11/16) 묘비 자리는 모두 옛 묘역으로 모였다 — 정원은 그대로 32.
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
function area(id: GraveArea["id"], name: string, rect: GraveArea["rect"], cols: number, rows: number, aisleX: number, dx: number, y0: number, dy: number): GraveArea {
  const aisle = 32;
  return { id, name, rect, cols, rows, block: cols / 2, aisleX, aisle, dx, dy, x0: aisleX - ((cols - 1) * dx + aisle) / 2, y0 };
}
/**
 * 옛 묘역(언덕 아래, 32기 = 8열 × 4줄, 가운데 자갈 통로는 언덕 계단과 줄을 맞춘다).
 * 둘째 줄 오솔길(타일 y 24)이 동문(성황당 쪽 길)과 이어지게 줄을 놓았다.
 * 예전 버드나무 묘역(C)은 동물원, 다리 건너 묘역(B)은 범퍼카장이 됐다 — 묘비 데이터(등록 순서)는 그대로이고 자리(graveSlot)만 옛 묘역으로 모인다.
 */
export const GRAVE_AREAS: readonly GraveArea[] = [area("A", "옛 묘역", { x: 48, y: 288, w: 384, h: 256 }, 8, 4, 240, 40, 320, 52)];

/** @deprecated 예전 한 묘역 격자 이름 (호환용). 이제 옛 묘역 하나의 격자와 같다 (8 × 4 = 32) */
export const GRID_COLS = GRAVE_AREAS[0].cols;
/** @deprecated GRID_COLS 참고 */
export const GRID_ROWS = GRAVE_AREAS[0].rows;
/** @deprecated 옛 묘역(A)의 값 */
export const GRID_BLOCK = GRAVE_AREAS[0].block;
/** @deprecated 옛 묘역(A)의 첫 줄 y */
export const GRID_Y0 = GRAVE_AREAS[0].y0;
/** @deprecated 옛 묘역(A)의 값 */
export const GRID_DX = GRAVE_AREAS[0].dx;
/** @deprecated 옛 묘역(A)의 줄 간격 */
export const GRID_DY = GRAVE_AREAS[0].dy;
/** @deprecated */
export const GRID_WALK = 0;
/** @deprecated */
export const GRID_AISLE = 32;
/** @deprecated 옛 묘역(A) 가운데 통로 x (언덕 계단과 줄을 맞춘다) */
export const GRAVEYARD_AISLE_X = GRAVE_AREAS[0].aisleX;
/** @deprecated 옛 묘역(A) 첫 열 x */
export const GRID_X0 = GRAVE_AREAS[0].x0;

/**
 * 묘비 자리 (index는 등록 순서. 묘역 정원을 넘으면 자리를 돌려 쓴다).
 * 등록 순서 index % 32 = k → 옛 묘역 k번 칸 (줄 = k ÷ 8, 열 = k % 8, 왼쪽 위부터 줄마다 채운다)
 */
export function graveSlot(index: number): { x: number; y: number; col: number; row: number; area: GraveArea["id"] } {
  const k = ((index % GRAVEYARD_CAPACITY) + GRAVEYARD_CAPACITY) % GRAVEYARD_CAPACITY;
  const g = GRAVE_AREAS[0];
  const col = k % g.cols;
  const row = Math.floor(k / g.cols);
  const x = g.x0 + col * g.dx + (col >= g.block ? g.aisle : 0);
  return { x, y: g.y0 + row * g.dy, col, row, area: g.id };
}

/** 이 묘역 id의 묘역 */
export function graveArea(id: GraveArea["id"]): GraveArea {
  return GRAVE_AREAS.find((a) => a.id === id) ?? GRAVE_AREAS[0];
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
// 광장 동쪽에 3열 × 3줄 = 1~9번지 (격자는 4줄 — 넷째 줄은 쉼터 광장·버스 정류장 마당). 서쪽 골목(세로)과 줄마다 집 앞 골목(가로)이 있다.
// 번지가 WORLD_LOTS보다 큰 집은 분양 사무소의 "분양 마을(2단지)"에서 본다.
export const HOUSE_LOT_W = 128;
export const HOUSE_LOT_H = 104;
export const HOUSE_COLS = 3;
/** 필지 격자 줄 수 (골목 계산용). 필지는 위 세 줄에만 선다 */
export const HOUSE_ROWS = 4;
/**
 * 메인 맵 번지 1..WORLD_LOTS (11/15: 1~9번지만 — 넷째 줄 10·11·12번지 자리는 없앴다. 어느 채널에도 집이 없던 줄).
 * 10번지 자리 → 쉼터 광장 (REST_PLAZA), 11·12번지 자리 → 버스 정류장 마당 (WHARF_YARD — 의뢰 게시판·주말 버스 정류장).
 * 그보다 큰 번지는 예전처럼 분양 마을(2단지) 번지다. 남은 집의 번지·자리는 그대로
 */
export const WORLD_LOTS = HOUSE_COLS * 3;
/** 중간에 비운 번지 (지금은 없다 — 번호를 다시 매기지 않고 한 번지만 빼야 할 때 쓴다) */
export const CLOSED_LOTS: readonly number[] = [];
/** 분양할 수 있는 번지인지 (1 이상 정수, 없앤 번지가 아님. WORLD_LOTS보다 크면 2단지) */
export function isOpenLot(lot: number): boolean {
  return Number.isInteger(lot) && lot >= 1 && !CLOSED_LOTS.includes(lot);
}
/** 메인 맵에 서는 번지인지 (없앤 번지는 아니다) */
export function isWorldLot(lot: number): boolean {
  return isOpenLot(lot) && lot <= WORLD_LOTS;
}
const HOUSE_X0 = 1008;
const HOUSE_Y0 = 216;
const HOUSE_PITCH_X = HOUSE_LOT_W + 4;
const HOUSE_PITCH_Y = HOUSE_LOT_H + 40;
export type HouseLot = { lot: number; x: number; y: number; door: { x: number; y: number } };
/** 번지 → 필지 (좌상단 x,y와 문 앞). 메인 맵에 없는 번지면 null */
export function houseLot(lot: number): HouseLot | null {
  if (!isWorldLot(lot)) return null;
  const i = lot - 1;
  const x = HOUSE_X0 + (i % HOUSE_COLS) * HOUSE_PITCH_X;
  const y = HOUSE_Y0 + Math.floor(i / HOUSE_COLS) * HOUSE_PITCH_Y;
  return { lot, x, y, door: { x: x + HOUSE_LOT_W / 2, y: y + 92 } };
}
/** 메인 맵 필지 (없앤 번지는 빠진다 — 순서는 번지 순. 번지 → 필지는 houseLot, 배열 위치로 찾지 않는다) */
export const HOUSE_LOTS: readonly HouseLot[] = Array.from({ length: WORLD_LOTS }, (_, i) => houseLot(i + 1)).filter((l): l is HouseLot => l !== null);
/** 주거 구역 필지 격자 왼쪽 위 (없앤 번지와 상관없이 격자는 그대로 — 골목·길 계산용) */
export const HOUSE_GRID = { x: HOUSE_X0, y: HOUSE_Y0, pitchX: HOUSE_PITCH_X, pitchY: HOUSE_PITCH_Y } as const;
/** 11/15 쉼터 광장 (예전 10번지 필지, 마을 동쪽 끝 — 버스 정류장 마당 바로 왼쪽): 포석·벤치·가로등·꽃밭. 버스 정류장은 그 옆 마당에 */
export const REST_PLAZA = { x: HOUSE_X0, y: HOUSE_Y0 + 3 * HOUSE_PITCH_Y, w: HOUSE_LOT_W, h: HOUSE_LOT_H } as const;

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
  // 11/15: 안개 연못을 넓혀 오리 연못으로 (오리배 선착장, 낚시는 하지 않는다 — 둑 낚시 자리를 뺐다).
  // 동물원을 줄인 자리(x 304~400)까지 서쪽으로 넓혔다 — 오리배 세 척이 돌아다닐 만큼 (예전 안개 연못의 약 4배, 처음 오리 연못의 약 2배)
  // 11/16 "오리배 자리가 좁다" → 강 건너 오솔길 바로 아래부터 아래 담 앞까지 위아래로 늘리고 동쪽으로 조금 (248×144 → 264×196, 넓이 약 1.45배)
  { id: "pondS", name: "오리 연못", x: 474, y: 898, rx: 132, ry: 98 },
];
/** 오리 연못 (PONDS "pondS"). 오리배는 이 연못 안에서만 다닌다 */
export const DUCK_POND: Pond = PONDS.find((p) => p.id === "pondS")!;
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
/** 호수 낚시 잔교 (서쪽 둑에서 호수로 뻗은 판자). 11/15 납품 부두를 없애며 어부 영감 노점이 잔교 서쪽 끝(호박밭 쪽)으로 왔다 */
export const LAKE_PIER = { x: 1108, y: 924, w: 72, h: 16 } as const;
// ── 버스 정류장 마당 (11/15) ── 없앤 11·12번지 자리 (마지막 골목 바로 위, 자갈 바닥):
// 의뢰 게시판(E → 수집 의뢰판)·긴급 의뢰 현판·주말 버스 정류장(캠핑장행)·벤치·가로등. 그림·장식·충돌은 클라이언트(game/world/fishZone.ts).
// 11/15 사용자 요청으로 납품 부두(아래 마당·입구 아치·낚시 잔교·끝 데크·부두 낚시 자리)를 없앴다 — 호수 북동쪽은 다시 둑이고,
// 어부 영감 노점은 호수 낚시 잔교 서쪽 끝(호박밭 옆)으로 옮겼다 (lib/forage/catalog NPCS).
/** 버스 정류장 마당 (자갈 바닥, 없앤 11·12번지 자리 — 마지막 골목 바로 위). ZONES의 "버스 정류장 마당"과 같다 */
export const WHARF_YARD = { x: 1144, y: 640, w: 256, h: 112 } as const;
// ── 동물원 (사용자 요청: "버드나무 묘역을 동물원으로, 펫은 사육사한테 산다") ── 예전 버드나무 묘역 자리.
// 나무 울타리로 두르고(위쪽 정문은 서쪽 다리와 줄을 맞추고, 동쪽 문은 안개 숲으로), 안에 우리 다섯 곳과 사육사 노점이 있다.
// 우리·장식·동물 움직임(결정적 시뮬레이션)은 클라이언트(game/world/zoo), 펫 가격은 items.ts ZOO_PETS.
// 11/15: 너무 넓다는 요청으로 동쪽을 96px 줄였다 (쉼터를 빼고 우리를 촘촘히) — 빈 자리는 오리 연못이 됐다
/** 동물원 구역 (울타리 안쪽 땅). ZONES의 "동물원"과 같다 */
export const ZOO = { x: 48, y: 784, w: 256, h: 224 } as const;
/** 위쪽 정문 (울타리를 비우는 x 구간) — 서쪽 다리(x 176)에서 곧장 내려온다 */
export const ZOO_GATE = { x0: 160, x1: 192, y: 784 } as const;
/** 동쪽 문 (울타리를 비우는 y 구간) — 안개 숲으로 */
export const ZOO_EAST_GATE = { x: 304, y0: 872, y1: 904 } as const;
/** 사육사 (정문 안쪽 오른편 노점 앞, 발 위치). E → 펫 분양 창 */
export const ZOOKEEPER = { x: 210, y: 826 } as const;
/** 이 점이 동물원 사각형 안인지 (pad만큼 넓혀 본다) */
export function inZoo(x: number, y: number, pad = 0): boolean {
  return x >= ZOO.x - pad && x <= ZOO.x + ZOO.w + pad && y >= ZOO.y - pad && y <= ZOO.y + ZOO.h + pad;
}

/** 낚시 판자 전부 (호수 잔교 + 까마귀 연못 잔교). 판자 위는 물이 아니다. 11/15 납품 부두 잔교·끝 데크는 없앴다 */
export const PIERS: readonly { x: number; y: number; w: number; h: number }[] = [LAKE_PIER, { x: 1212, y: 126, w: 24, h: 46 }];

// ── 낚시 자리 (4번·F13) ── 연못·호수 둑과 잔교·강 양쪽 둑. 자리마다 1인(SPOT_KINDS.fish, 서버 좌석 — 정해진 자리만).
// 앵커(x,y) = 앉는 발 위치(물가 뭍 또는 잔교), facing = 물 쪽. 자리 id = spotSeatId("fish", x, y) — 예 "f_456_158".
// 무엇이 잡히는지(호수/강)는 water로 웹 서버(apps/web/lib/forage)가 정한다 (연못은 호수와 같은 물). 실시간 서버는 점유만 판정한다.
/** 11/16 바닷가 낚시 자리는 "sea" (바닷물고기) */
export type FishWater = "lake" | "river" | "sea";
export type FishingSpot = { id: string; water: FishWater; x: number; y: number; facing: DirId };
const fishSpot = (water: FishingSpot["water"], x: number, y: number, facing: DirId): FishingSpot => ({ id: `f_${x}_${y}`, water, x, y, facing });
/** 강 북쪽 둑(아래를 본다)·남쪽 둑(위를 본다) 낚시 자리 — 가운데 줄에서 27px */
const riverSpot = (x: number, north: boolean) => fishSpot("river", x, Math.round(riverYAt(x) + (north ? -27 : 27)), north ? DIR.down : DIR.up);
export const FISHING_SPOTS: readonly FishingSpot[] = [
  // ── 호수 북동쪽 둑 (3) ── 11/15 납품 부두(잔교 위 4자리)를 없애고 둑 자리만 남겼다 (+1, 옛 아래 마당 둑)
  fishSpot("lake", 1384, 862, DIR.down),
  fishSpot("lake", 1398, 904, DIR.left),
  fishSpot("lake", 1318, 824, DIR.down),
  // ── 다른 물가 ── 연못·강·호수 서쪽 (어부 영감 노점이 있는 호수 잔교 쪽이 이제 낚시 중심)
  // 달빛 연못 (언덕 옆)
  fishSpot("lake", 456, 158, DIR.up),
  fishSpot("lake", 520, 116, DIR.left),
  fishSpot("lake", 392, 108, DIR.right),
  // 까마귀 연못 (주거 구역 위): 잔교 끝·둑
  fishSpot("lake", 1224, 134, DIR.up),
  fishSpot("lake", 1346, 108, DIR.left),
  fishSpot("lake", 1102, 108, DIR.right),
  // 강 양쪽 둑 (11/15 부두 자리를 없앤 만큼 둘 더)
  riverSpot(420, true),
  riverSpot(840, true),
  riverSpot(260, false),
  riverSpot(800, false),
  riverSpot(540, false),
  riverSpot(960, true),
  // 호수 서쪽 잔교·둑
  fishSpot("lake", 1172, 932, DIR.right),
  fishSpot("lake", 1148, 932, DIR.up),
  fishSpot("lake", 1180, 828, DIR.down),
  fishSpot("lake", 1180, 982, DIR.up),
];
/** 이 좌석 id의 낚시 자리 (없으면 undefined) */
export function fishingSpotById(id: string): FishingSpot | undefined {
  return FISHING_SPOTS.find((s) => s.id === id);
}

/**
 * 배 위 낚시 (50번 조각배): 자리가 정해져 있지 않으니 "배가 떠 있는 물" 가상 자리 id로 던진다.
 * 서버(웹 /api/forage/fish/cast)는 물 종류로 물고기를 고르고 나머지 규칙(하루 한도·시간당 시작 수·티켓)은 그대로다.
 * 다른 사람에게는 실시간 서버의 rod 표시(배 자리에 앉아 있을 때만)로 낚싯대를 보여 준다
 */
export const BOAT_FISHING_SPOTS = { "boat:river": "river", "boat:lake": "lake" } as const satisfies Record<string, FishingSpot["water"]>;
export type BoatFishingSpotId = keyof typeof BOAT_FISHING_SPOTS;
export function boatFishingSpotId(water: "lake" | "river"): BoatFishingSpotId {
  return water === "lake" ? "boat:lake" : "boat:river";
}
/** 낚시 자리 id(정해진 자리 또는 배 위 가상 자리) → 물 종류. 모르는 id면 null */
export function fishingWaterOf(id: string): FishingSpot["water"] | null {
  if (Object.prototype.hasOwnProperty.call(BOAT_FISHING_SPOTS, id)) return BOAT_FISHING_SPOTS[id as BoatFishingSpotId];
  return fishingSpotById(id)?.water ?? null;
}

// ── 조각배 (50번) ── 나루터(FERRY_DOCK)에서 E → 배에 탄다. 자리마다 1인(SPOT_KINDS.boat, 서버 좌석).
// 1인승 2척(선착장 양옆) + 2인승 1척(선착장 끝 앞, 앞자리 = 노 젓는 사람, 뒷자리 = 같이 타는 사람). 모두 호수에 매어 둔다.
// 앵커(x,y) = 나루터에 매어 둔 자리. 타면 위치는 클라이언트가 물 위로 옮기고(서버는 mobile 자리라 따라간다),
// 내리면 배는 잠시 뒤 이 자리로 돌아온다 (클라이언트 연출). 자리 id = spotSeatId("boat", x, y) — 예 "b_1206_850"
// 11/15 오리배: kind "duck" — 오리 연못(DUCK_POND) 선착장(DUCK_DOCK)에 3척, 2인승 나란히 앉기 (왼쪽 = 먼저 탄 사람이 페달·조종, 오른쪽 = 같이 타는 사람).
// 옆자리는 뱃머리 방향과 상관없이 화면 오른쪽으로 DUCK_SIDE_SEAT. 서버 규칙(1인 1자리·같은 배 옆자리·mobile)은 조각배와 같다
export type BoatKind = "row" | "duck";
export type Boat = { id: string; x: number; y: number; seats: 1 | 2; facing: DirId; kind?: BoatKind };
export const BOATS: readonly Boat[] = [
  { id: "boatA", x: 1206, y: 850, seats: 1, facing: DIR.left },
  { id: "boatB", x: 1282, y: 850, seats: 1, facing: DIR.right },
  { id: "boatC", x: 1250, y: 884, seats: 2, facing: DIR.right },
  { id: "duckA", x: 418, y: 826, seats: 2, facing: DIR.left, kind: "duck" },
  { id: "duckB", x: 494, y: 826, seats: 2, facing: DIR.right, kind: "duck" },
  { id: "duckC", x: 456, y: 860, seats: 2, facing: DIR.right, kind: "duck" },
];
/** 배 종류 (없으면 조각배) */
export function boatKind(b: Boat): BoatKind {
  return b.kind ?? "row";
}
/** 오리배 선착장 판자 (오리 연못 북쪽 둑에서 물로) · 타는 자리(판자 끝). 11/16 연못이 위로 넓어져 오솔길 바로 아래에서 시작한다 */
export const DUCK_DOCK_DECK = { x: 452, y: 788, w: 20, h: 40 } as const;
export const DUCK_DOCK = { x: 462, y: 822 } as const;
/** 2인승 뒷자리: 앞자리(노 젓는 자리)에서 뱃머리 반대쪽으로 이만큼 */
export const BOAT_BACK_SEAT = 11;
/** 오리배 옆자리: 왼쪽 자리(조종)에서 화면 오른쪽으로 이만큼 */
export const DUCK_SIDE_SEAT = 12;
export type BoatSeat = { id: string; boatId: string; index: 0 | 1; x: number; y: number; facing: DirId };
/** 배 자리 전부 (앞자리 index 0, 2인승 뒷자리 index 1) */
export const BOAT_SEATS: readonly BoatSeat[] = BOATS.flatMap((b) => {
  const back = boatKind(b) === "duck" ? DUCK_SIDE_SEAT : b.facing === DIR.right ? -BOAT_BACK_SEAT : BOAT_BACK_SEAT;
  const seats: BoatSeat[] = [{ id: `b_${b.x}_${b.y}`, boatId: b.id, index: 0, x: b.x, y: b.y, facing: b.facing }];
  if (b.seats === 2) seats.push({ id: `b_${b.x + back}_${b.y}`, boatId: b.id, index: 1, x: b.x + back, y: b.y, facing: b.facing });
  return seats;
});
/** 이 좌석 id의 배 자리 (없으면 undefined) */
export function boatSeatById(id: string): BoatSeat | undefined {
  return BOAT_SEATS.find((s) => s.id === id);
}

// ── 놀이기구 2: 관람차·열기구 ── 둘 다 정해진 1인 자리(서버 좌석)만 쓰고, 움직임은 서버 시계로 모두에게 같게 그린다 (네트워크 추가 없음).
// 서버 위치는 앵커(타는 곳) 그대로다 — 그림(칸·기구 위치)은 클라이언트가 시계로 계산한다 (game/world/skyRides.ts).

/**
 * 관람차: 광장 남쪽 (큰 모닥불 아래, 다리로 가는 길과 시소 사이). 받침 가운데 = 바닥(발 위치).
 * 칸 FERRIS_CARS개 × 칸마다 2자리. 앵커 = 받침 앞 타는 곳에 한 줄로 (자리마다 x가 다르다 — 내리면 그 자리에 선다).
 * 칸 c는 서버 시계 t에 각도 2π·(c/칸 수 + t/FERRIS_PERIOD_MS)에 있다 (각 0 = 맨 아래 타는 곳)
 */
export const FERRIS = { x: 788, y: 628 } as const;
export const FERRIS_CARS = 6;
export const FERRIS_CAR_SEATS = 2;
/** 한 바퀴 시간 (탄 사람은 자기 칸이 한 바퀴 돌아 타는 곳으로 내려오면 내린다) */
export const FERRIS_PERIOD_MS = 48_000;
export type FerrisSeat = { id: string; car: number; index: 0 | 1; x: number; y: number };
/** 관람차 자리 전부 (칸 c의 왼쪽 자리 index 0, 오른쪽 1). id = spotSeatId("ferris", x, y) — 예 "w_777_638" */
export const FERRIS_SEATS: readonly FerrisSeat[] = Array.from({ length: FERRIS_CARS * FERRIS_CAR_SEATS }, (_, i) => {
  const x = FERRIS.x - 11 + i * 2;
  const y = FERRIS.y + 10;
  return { id: `w_${x}_${y}`, car: Math.floor(i / FERRIS_CAR_SEATS), index: (i % FERRIS_CAR_SEATS) as 0 | 1, x, y };
});

/**
 * 열기구: 별 보기 언덕 위 출발장 (마을 북서쪽 끝). 기구 BALLOON_COUNT대가 출발장 하나를 번갈아 쓴다 — 운항 시간표(서버 시계):
 * 기구 b는 주기 BALLOON_CYCLE_MS마다 BALLOON_BOARD_MS 동안 출발장에서 태우고, BALLOON_FLIGHT_MS 동안 정해진 항로를 날아 돌아온다.
 * 두 대는 반 주기 어긋나 있어 출발장에서 오래 기다리지 않는다. 자리 = 기구마다 BALLOON_SEATS_EACH개, 앵커는 바구니 앞 (내리면 선다)
 */
export const BALLOON_PAD = { x: 200, y: 100 } as const;
export const BALLOON_COUNT = 2;
export const BALLOON_SEATS_EACH = 4;
export const BALLOON_BOARD_MS = 30_000;
export const BALLOON_FLIGHT_MS = 110_000;
export const BALLOON_CYCLE_MS = BALLOON_BOARD_MS + BALLOON_FLIGHT_MS;
/** 서버가 탑승을 받는 여유: 출발 시각 뒤 이만큼까지 (시계 차이·지연) */
export const BALLOON_BOARD_GRACE_MS = 1_500;
export type BalloonSeat = { id: string; balloon: number; index: number; x: number; y: number };
/** 열기구 자리 전부 (기구 b, 자리 k). 앵커는 기구마다 한 줄씩 (b = 0 위 줄, 1 아래 줄) */
export const BALLOON_SEATS: readonly BalloonSeat[] = Array.from({ length: BALLOON_COUNT * BALLOON_SEATS_EACH }, (_, i) => {
  const balloon = Math.floor(i / BALLOON_SEATS_EACH);
  const index = i % BALLOON_SEATS_EACH;
  const x = BALLOON_PAD.x - 6 + index * 4 + balloon;
  const y = BALLOON_PAD.y + 9 + balloon * 3;
  return { id: `o_${x}_${y}`, balloon, index, x, y };
});
export type BalloonPhase = {
  /** board = 출발장에서 태우는 중, fly = 비행 중 */
  phase: "board" | "fly";
  /** 이번 단계가 시작된 뒤 흐른 시간 (ms) */
  ms: number;
  /** 이번 주기가 시작된 시각 (= 태우기 시작) */
  start: number;
  /** 이번 주기의 이륙 시각 */
  departAt: number;
};
/** 기구 b의 운항 상태 (t = 서버 시계 ms) */
export function balloonPhase(b: number, t: number): BalloonPhase {
  const off = (b * BALLOON_CYCLE_MS) / BALLOON_COUNT;
  const k = Math.floor((t - off) / BALLOON_CYCLE_MS);
  const start = off + k * BALLOON_CYCLE_MS;
  const u = t - start;
  const departAt = start + BALLOON_BOARD_MS;
  return u < BALLOON_BOARD_MS ? { phase: "board", ms: u, start, departAt } : { phase: "fly", ms: u - BALLOON_BOARD_MS, start, departAt };
}
/** 지금 기구 b에 탈 수 있는지 (출발장에 있다). grace = 이륙 뒤에도 받아 주는 여유 (서버) */
export function balloonBoarding(b: number, t: number, grace = 0): boolean {
  const p = balloonPhase(b, t);
  return p.phase === "board" || p.ms < grace;
}
/** 이 좌석 id의 관람차·열기구 자리 */
export function ferrisSeatById(id: string): FerrisSeat | undefined {
  return FERRIS_SEATS.find((s) => s.id === id);
}
export function balloonSeatById(id: string): BalloonSeat | undefined {
  return BALLOON_SEATS.find((s) => s.id === id);
}

// ── 범퍼카장 (11/16, 예전 다리 건너 묘역 자리) ──
// 고무 테두리를 두른 네모난 링크 + 위쪽 가운데 입구(문 앞에서 E → 빈 범퍼카에 탄다). 차는 BUMPER_CARS대, 차마다 1인(SPOT_KINDS.bumper, 서버 좌석).
// 앵커 = 링크 위쪽에 한 줄로 세워 둔 자리. 타면 위치는 클라이언트가 링크 안에서 움직이고(서버는 mobile 자리라 따라간다),
// 내리면 빈 차는 잠시 뒤 제자리로 돌아온다 (클라이언트 연출). 부딪힘은 저마다 자기 차에만 적용한다 (서버 물리 없음, 네트워크 추가 없음).
// 11/16 "범퍼카장이 좁다" → 링크를 192×148 → 284×180으로 (달리는 바닥 약 1.9배). 오리 연못이 동쪽을 조금 쓰고, 링크는 호박밭 쪽(동쪽)과 아래로 넓혔다.
// 링크 오른쪽 위 귀퉁이는 강 남쪽 둑과 걸어서 지날 틈(호박밭 가는 길)을 남긴다 — 그래서 더 동쪽·위로는 못 넓힌다
/** 범퍼카장 마당 (ZONES "범퍼카장"과 같은 사각형) */
export const BUMPER_YARD = { x: 608, y: 784, w: 304, h: 224 } as const;
/** 링크 바깥 사각형 (고무 테두리 바깥선). 안쪽 달리는 바닥은 BUMPER_RIM만큼 안으로. 아래 테두리 밖에 내려설 한 줄(발 상자)을 남긴다 */
export const BUMPER_RINK = { x: 620, y: 816, w: 284, h: 180 } as const;
export const BUMPER_RIM = 6;
/** 입구 (위 테두리 가운데 틈 x0..x1). 걷는 사람은 틈의 막대에 막히고, 문 앞(BUMPER_GATE.x, y − 8)에서 E로 탄다 */
export const BUMPER_GATE = { x: 762, y: 816, x0: 746, x1: 778 } as const;
export const BUMPER_CARS = 8;
export type BumperSeat = { id: string; car: number; x: number; y: number };
/** 범퍼카 자리 전부 (차 c 하나에 한 자리). 링크 위쪽 테두리 안에 한 줄로 세워 둔다 (입구를 가운데로 26px 간격). id = spotSeatId("bumper", x, y) — 예 "v_671_838" */
export const BUMPER_SEATS: readonly BumperSeat[] = Array.from({ length: BUMPER_CARS }, (_, car) => {
  const x = BUMPER_GATE.x - 91 + car * 26;
  const y = BUMPER_RINK.y + BUMPER_RIM + 16;
  return { id: `v_${x}_${y}`, car, x, y };
});
export function bumperSeatById(id: string): BumperSeat | undefined {
  return BUMPER_SEATS.find((s) => s.id === id);
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
/** 11/15 둘째 망원경: 같은 돌 마당 동쪽 (망원경마다 한 명이라 둘이 같이 볼 수 있게). 자리 id가 앵커 좌표라 서버는 따로 알 필요가 없다 */
export const TELESCOPE_2 = { x: 328, y: 92 } as const;
/** 언덕의 망원경들 (받침 가운데). 앞자리는 각각 y + 10 */
export const TELESCOPES: readonly { x: number; y: number }[] = [TELESCOPE, TELESCOPE_2];

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
/**
 * 모닥불 자리 (불 받침 가운데). 광장 큰 모닥불 · 호박밭 모닥불.
 * 11/16 묘지기 모닥불(fireW, 옛 묘역 아래 강가 136,604)은 치우고 그 자리에 바닷가행 정류장을 세웠다 (둘레 통나무 kW* 자리도 같이 없어졌다)
 */
export const CAMPFIRES: readonly Campfire[] = [
  { id: "fireP", x: 720, y: 456, big: true },
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
  { id: "lE", kind: "bench", x: 1144, y: 800, facing: DIR.down, seatOffsets: four }, // 낚시터가 생기며 나루터 서쪽 호숫가로 옮김
  // ── 11/15 쉼터 광장 (예전 10번지, 아래 골목을 바라본다) · 납품 부두 위 마당 (게시판 앞 · 버스 정류장 지붕 아래) ──
  { id: "bY", kind: "bench", x: 1044, y: 704, facing: DIR.down, seatOffsets: two },
  { id: "bZ", kind: "bench", x: 1100, y: 704, facing: DIR.down, seatOffsets: two },
  { id: "bD", kind: "bench", x: 1192, y: 744, facing: DIR.up, seatOffsets: two },
  { id: "bE", kind: "bench", x: 1330, y: 716, facing: DIR.down, seatOffsets: two }, // 주말 버스 정류장 지붕 아래 (game/world/fishZone.ts BUS_STOP)
  { id: "bU", kind: "bench", x: 108, y: 592, facing: DIR.down, seatOffsets: two }, // 11/16 바닷가행 정류장 지붕 아래 (game/world/seaStop.ts SEA_STOP — 예전 서쪽 모닥불 자리)
  // ── 사냥터 동굴 앞 ──
  { id: "bQ", kind: "bench", x: 912, y: 112, facing: DIR.down, seatOffsets: two },
  // ── 범퍼카장 ── 링크를 내려다보는 구경 벤치 (예전 다리 건너 묘역 벤치를 옮겼다, id 그대로).
  // 11/16 링크가 넓어져 입구 앞 마당이 좁아졌다 → 강 건너 오솔길 북쪽 강둑에서 길 너머 링크를 내려다본다
  { id: "bV", kind: "bench", x: 668, y: 764, facing: DIR.down, seatOffsets: two },
  { id: "bW", kind: "bench", x: 836, y: 764, facing: DIR.down, seatOffsets: two },
  // ── 동물원 ── 큰 개 놀이터 옆 쉼터 벤치 (예전 버드나무 묘역 벤치를 옮겼다, id 그대로)
  { id: "bX", kind: "bench", x: 354, y: 990, facing: DIR.up, seatOffsets: two },
  // ── 오리 연못(옛 안개 연못) · 호박밭 ──
  { id: "bS", kind: "bench", x: 584, y: 800, facing: DIR.down, seatOffsets: two }, // 11/15 오리 연못 북쪽 둑 (연못을 바라본다). 11/16 연못이 넓어져 북동쪽 둑으로
  { id: "cE", kind: "chair", x: 1010, y: 960, facing: DIR.right, seatOffsets: [0] },
  { id: "cF", kind: "chair", x: 1050, y: 960, facing: DIR.left, seatOffsets: [0] },
  // 모닥불 둘레 (통나무 2인 + 그루터기)
  ...campfireSeats(),
];

export type Seat = {
  id: string;
  furnitureId: string;
  x: number;
  y: number;
  facing: DirId;
  /** 11/16 일어설 때 내려설 자리 (앉은 자리에서 y로, 없으면 아래 STAND_OFFSET_Y) — 바닷가 끝 걸터앉기는 뒤(데크 쪽)로 */
  standDy?: number;
};

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

export type SpotKind =
  | "hang"
  | "swing"
  | "hammock"
  | "boat"
  | "seesaw"
  | "trampoline"
  | "carousel"
  | "telescope"
  | "mat"
  | "fish"
  | "ferris"
  | "balloon"
  | "bumper"
  // 3번 집 안 가구 (indoor: 방(집) 서버에서만 받는다)
  | "chair"
  | "bed"
  | "book"
  | "tub";
/**
 * mobile = 앉은 채 움직이는 자리(조각배): 서버는 위치를 앵커에 고정하지 않고 MOVE를 따라간다 (속도 검증은 그대로).
 * radius = 서버가 점유 요청을 받을 때 허용하는 거리 (없으면 SEAT_SERVER_RADIUS)
 * fixed = 정해진 자리만 (BOATS). 형식만 맞는 아무 좌표의 id는 받지 않는다
 */
export type SpotKindDef = {
  code: string;
  state: StateId;
  facing: DirId;
  mobile?: boolean;
  radius?: number;
  fixed?: boolean;
  shared?: boolean;
  /** 집 안 가구 자리: 방(집) 서버에서만 받고, 월드 채널에서는 받지 않는다 (반대로 월드 자리는 방에서 받지 않는다) */
  indoor?: boolean;
};
/**
 * 11/15 "타는" 자리: 그네·조각배·오리배·시소·트램펄린·회전목마·관람차·열기구·범퍼카.
 * 바베큐로 커진 동안(bbqBig > 1)에는 여기 앉지 못한다 (서버 onSit·claimSpot이 거절, 클라이언트는 안내)
 */
export const RIDE_SPOT_KINDS: readonly SpotKind[] = ["swing", "boat", "seesaw", "trampoline", "carousel", "ferris", "balloon", "bumper"];
export const isRideSpotKind = (k: string | null | undefined): boolean => !!k && (RIDE_SPOT_KINDS as readonly string[]).includes(k);

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
  // ── 놀이기구 2 ── 정해진 자리(FERRIS_SEATS·BALLOON_SEATS)만. 앵커는 타는 곳이고 칸·기구 위치는 클라이언트가 시계로 그린다
  /** 관람차 칸 자리 (앵커 = 받침 앞 타는 곳) */
  ferris: { code: "w", state: STATE.ferris, facing: DIR.down, fixed: true },
  /** 열기구 바구니 자리 (앵커 = 출발장 바구니 앞). 비행 중 탑승은 서버가 거절한다 (balloonBoarding) */
  balloon: { code: "o", state: STATE.balloon, facing: DIR.down, fixed: true },
  // ── 11/16 범퍼카장 ── 정해진 자리(BUMPER_SEATS)만. 타고 나면 링크 안을 움직인다 (조각배처럼 mobile). 입구에서 가장 먼 차까지 닿게 radius를 넉넉히
  /** 범퍼카 (앵커 = 링크 위쪽에 세워 둔 자리) */
  bumper: { code: "v", state: STATE.bumper, facing: DIR.down, mobile: true, radius: 120, fixed: true },
  // ── 3번 집 안 가구 ── 앵커 = 집 씬 좌표의 발 위치(가구 배치에서 계산, game/housing/interact.ts). 집마다 배치가 달라 형식만 본다
  /** 의자·소파·책상·피아노 의자에 앉기 (의자와 같은 sitChair라 shared — sit 요청으로만) */
  chair: { code: "c", state: STATE.sitChair, facing: DIR.down, shared: true, indoor: true },
  /** 침대에 눕기 */
  bed: { code: "l", state: STATE.lie, facing: DIR.down, indoor: true },
  /** 책장 앞에서 책 읽기 */
  book: { code: "k", state: STATE.read, facing: DIR.down, indoor: true },
  /** 욕조에 들어가기 */
  tub: { code: "u", state: STATE.bath, facing: DIR.down, indoor: true },
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

/** 집 안 가구 자리인지 (방 서버만 받는다) */
export function isIndoorSpot(kind: SeatSlot["kind"]): boolean {
  return kind !== "seat" && !!SPOT_KINDS[kind].indoor;
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
// 같은 칸·같은 기구 안에서는 옮겨 앉기(furnitureId가 같다)
for (const w of FERRIS_SEATS) seatSlots.set(w.id, { id: w.id, kind: "ferris", x: w.x, y: w.y, facing: DIR.down, state: STATE.ferris, furnitureId: `ferris${w.car}` });
for (const o of BALLOON_SEATS) seatSlots.set(o.id, { id: o.id, kind: "balloon", x: o.x, y: o.y, facing: DIR.down, state: STATE.balloon, furnitureId: `balloon${o.balloon}` });
// 범퍼카는 차마다 한 자리 (다른 차로 옮겨 앉기 없음)
for (const v of BUMPER_SEATS) {
  const k = SPOT_KINDS.bumper;
  seatSlots.set(v.id, { id: v.id, kind: "bumper", x: v.x, y: v.y, facing: k.facing, state: k.state, furnitureId: `bumper${v.car}`, mobile: true, radius: k.radius });
}

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

