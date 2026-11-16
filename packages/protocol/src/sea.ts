import { DIR, STATE, type DirId, type StateId } from "./types";
import type { Furniture, FishingSpot, Seat } from "./world";

// 11/16 세 번째 맵 「달물결 포구」 (1차 바탕: 맵·버스·물때·갈매기). 캠핑장처럼 같은 채널(같은 Channel DO) 안의 따로 된 맵이에요.
// 위쪽이 뭍, 아래쪽이 바다예요. 버스는 맨 위 길을 따라 오른쪽 끝에서 들어와 오른쪽 위 정류장에 서요.
// 좌표는 바닷가 맵 안의 월드 픽셀 (마을·캠핑장과 따로, 16px 타일). 서버는 범위·좌석 판정에, 클라이언트는 그림·충돌·물때에 써요.
// 충돌 상자(seaColliders)도 여기 둬서 서버·클라이언트·테스트가 같은 상자를 봐요.
//
//  y=0    ┌── 소나무 언덕 ────────────────────────────────────────── [정류장] ┐
//  y=104  ╞══ 버스 길 (오른쪽 끝에서 들어와요) ═══════════════════════════════╡
//         │ [오두막 터 1 2 3]  [부동산] [ 포구 시장 ]              풀밭·그물 │
//         │ [오두막 터 4 5 6]                                               │
//  y=388  ├─ 나무 산책로 ─────────────────────────────────────────────────────┤
//  y=414  │ 백사장 (쉼터 자리)                 ║선착장           ║방파제   │
//  y=560  │ ~~ 만조 물가 ~~~~~~~~~~~~~~~~~~~~~~~║~~~~~~~~~~~~~~~~~║~~~~~~~~~│
//         │ 갯바위   갯벌 (물때에 따라 드러나요)  ║                 ║        │
//  y=880  │ ~~ 간조 물가 ~~~~~~~~~~~~~~~~~~~~~~~║~~~~~~~~~~~~~~~~~║        │
//  y=900  └ 먼바다 (막혀요) ─────────────────[선착장 끝·낚싯배]──[등대]─────┘

/** 바닷가 전체 이름 (표지판·첫 안내) */
export const SEA_TITLE = "달물결 포구";
export const SEA_TITLE_EN = "Moonwave Harbor";

export const SEA_COLS = 80;
export const SEA_ROWS = 60;
export const SEA_WIDTH = SEA_COLS * 16; // 1280
export const SEA_HEIGHT = SEA_ROWS * 16; // 960
/**
 * 바닷가 배치 버전. 좌표가 바뀌는 개편마다 올려요 → 옛 바닷가 자리 기록(lib/resume.ts)은 위치를 버리고 정류장에서 시작해요.
 * 1 = 11/16 1차 바탕 (정류장·시장·부동산·오두막 터 6·산책로·백사장·갯벌·선착장·방파제·등대·갯바위)
 * 2 = 11/16 정류장을 왼쪽으로 (오른쪽 위 미니맵에 가리지 않게) · 먼바다 띠에서도 헤엄·잠수 (막지 않아요)
 * 3 = 11/16 버스 길을 오른쪽 끝 ~ 정류장 지나 돌림 마당까지만 (나머지는 풀밭·나무) · 유령선 자리를 비우려고 부표 하나를 옮김
 *     · 오두막 터 6을 굽은 골목을 따라 흩어 놓음 (크기·출입구 쪽·울타리가 터마다 달라요) · 갯바위 구간 (방파제 쪽 곶·물가 바위)
 * 4 = 11/16 갯바위 낚시 자리·발판 (물이 차도 마른 자리) · 오두막 벤치를 조금 아래로, 두 자리 간격 20
 * 5 = 11/16 쉴거리 (백사장 벤치 4·선베드 6·파라솔 돗자리 2·돗자리 3·끝 걸터앉기 2) — 벤치·파라솔 기둥이 막아요
 * 6 = 11/16 백사장을 선베드·파라솔·선베드 한 벌 여섯으로 나란히 (선베드 12), 벤치는 산책로 아래로, 파라솔 돗자리는 빼고 돗자리 둘
 */
export const SEA_MAP_VERSION = 6;

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** 걸을 수 있는 범위 (둘레 언덕·먼바다 안쪽. 먼바다·건물은 seaColliders가 따로 막아요) */
export const SEA_BOUNDS = { minX: 20, maxX: SEA_WIDTH - 20, minY: 60, maxY: SEA_HEIGHT - 14 } as const;

// ── 띠 (위 → 아래) ──
/** 뒤 언덕 (소나무·바위, 막혀요). 이 아래부터 걸어요 */
export const SEA_HILL_H = 56;
/**
 * 버스 길 (맨 위). 11/16 사용자 "길이 쓸데없이 길어요" → 오른쪽 맵 끝에서 들어와 정류장을 조금 지난 돌림 마당(SEA_ROAD_LOOP)에서 끝나요.
 * 길 왼쪽 띠는 풀밭·덤불·나무. 바닥 장식이라 막지 않아요
 */
export const SEA_ROAD = { x: 920, y: 104, w: SEA_WIDTH - 920, h: 42 } as const;
/** 버스 돌림 마당 (길 왼쪽 끝의 둥근 자리 — 가운데·반지름) */
export const SEA_ROAD_LOOP = { x: SEA_ROAD.x, y: SEA_ROAD.y + SEA_ROAD.h / 2, r: 34 } as const;
/** (x,y)가 버스 길(돌림 마당 포함) 위인지 */
export function onSeaRoad(x: number, y: number): boolean {
  const R = SEA_ROAD;
  if (x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h) return true;
  return Math.hypot(x - SEA_ROAD_LOOP.x, y - SEA_ROAD_LOOP.y) <= SEA_ROAD_LOOP.r;
}
/** 뭍 (풀밭·흙길) — 길 아래부터 산책로 위까지 */
export const SEA_LAND_Y0 = SEA_ROAD.y + SEA_ROAD.h;
/** 나무 산책로 (뭍과 백사장 사이, 맵 가로 전체) */
export const SEA_BOARDWALK = { x: 0, y: 388, w: SEA_WIDTH, h: 26 } as const;
/** 마른 백사장 위쪽 끝 (산책로 아래) */
export const SEA_SAND_Y0 = SEA_BOARDWALK.y + SEA_BOARDWALK.h;
/** 갯벌이 시작하는 줄 = 만조 물가 (물이 여기까지 차요). 이 위 백사장은 늘 말라 있어요 */
export const SEA_FLAT_Y0 = 560;
/** 먼바다가 시작하는 줄 (이 아래는 늘 물 — 11/16부터 헤엄치고 잠수할 수 있어요, 맵 아래 끝·배만 막아요) */
export const SEA_DEEP_Y = 900;

// ── 물때 (11/16 사용자 확정) ──
// 한 바퀴 3시간. 서버에 아무것도 두지 않고 한국 시각만으로 계산해요 → 같은 시각이면 모든 화면의 물 높이가 같아요 (Redis 0).
// t = 한 바퀴 안의 분 (0 = 만조). level = 0.5 + 0.5·cos(2π·t/180). level < 0.25 (t 60~120분) 동안 갯벌이 열려요.
// 갯벌 땅은 늘 걸을 수 있는 칸이고, 물은 그 위에 덮어 그리기만 해요 (물때가 바뀌어도 막히는 칸이 생기지 않아요).

export const TIDE_PERIOD_MIN = 180;
export const TIDE_PERIOD_MS = TIDE_PERIOD_MIN * 60_000;
/** 이 물 높이 아래면 갯벌이 열려요 */
export const TIDE_OPEN_LEVEL = 0.25;
/** 갯벌이 열리는 분·닫히는 분 (한 바퀴 안) */
export const TIDE_OPEN_FROM_MIN = 60;
export const TIDE_OPEN_TO_MIN = 120;
/** 만조로 치는 앞뒤 (분) — HUD 「만조」 */
export const TIDE_HIGH_SPAN_MIN = 10;
/** 물가 선: 만조(level 1)면 백사장 끝, 간조(level 0)면 먼바다 바로 위 */
export const TIDE_HIGH_Y = SEA_FLAT_Y0;
export const TIDE_LOW_Y = 880;
const KST_OFFSET_MS = 9 * 3_600_000;

/** 한 바퀴 안의 분 (0 ≤ t < 180, 0 = 만조). 한국 자정에 만조로 맞춰요 (3시간은 하루를 나누어떨어지게 해요) */
export function tideMinute(nowMs: number): number {
  const m = (nowMs + KST_OFFSET_MS) / 60_000;
  return ((m % TIDE_PERIOD_MIN) + TIDE_PERIOD_MIN) % TIDE_PERIOD_MIN;
}

/** 물 높이 0(간조)..1(만조) */
export function tideLevel(nowMs: number): number {
  return 0.5 + 0.5 * Math.cos((2 * Math.PI * tideMinute(nowMs)) / TIDE_PERIOD_MIN);
}

/** 갯벌이 열려 있는지 (물 높이 0.25 아래, 한 바퀴의 60~120분) */
export function tideOpen(nowMs: number): boolean {
  return tideLevel(nowMs) < TIDE_OPEN_LEVEL;
}

export type TidePhase = "high" | "ebb" | "low" | "flood";
/**
 * 지금 물때와 다음 바뀜까지 남은 분 (올림).
 * high = 만조 앞뒤 10분 · ebb = 물 빠지는 중 (갯벌 열림까지) · low = 간조 (갯벌 닫힘까지) · flood = 물 들어오는 중
 */
export function tidePhase(nowMs: number): { phase: TidePhase; minutesLeft: number; minute: number } {
  const t = tideMinute(nowMs);
  if (t < TIDE_HIGH_SPAN_MIN || t >= TIDE_PERIOD_MIN - TIDE_HIGH_SPAN_MIN) {
    const end = t < TIDE_HIGH_SPAN_MIN ? TIDE_HIGH_SPAN_MIN : TIDE_PERIOD_MIN + TIDE_HIGH_SPAN_MIN;
    return { phase: "high", minutesLeft: Math.max(1, Math.ceil(end - t)), minute: t };
  }
  if (t < TIDE_OPEN_FROM_MIN) return { phase: "ebb", minutesLeft: Math.max(1, Math.ceil(TIDE_OPEN_FROM_MIN - t)), minute: t };
  if (t < TIDE_OPEN_TO_MIN) return { phase: "low", minutesLeft: Math.max(1, Math.ceil(TIDE_OPEN_TO_MIN - t)), minute: t };
  return { phase: "flood", minutesLeft: Math.max(1, Math.ceil(TIDE_PERIOD_MIN - TIDE_HIGH_SPAN_MIN - t)), minute: t };
}

/** 다음 갯벌이 열리는 시각 (epoch ms, 지금 열려 있으면 다음 바퀴). 등대지기 안내·HUD에 써요 */
export function nextTideOpenAt(nowMs: number): number {
  const t = tideMinute(nowMs);
  const ahead = t < TIDE_OPEN_FROM_MIN ? TIDE_OPEN_FROM_MIN - t : TIDE_PERIOD_MIN - t + TIDE_OPEN_FROM_MIN;
  return nowMs + ahead * 60_000;
}

/** 물가 선 y (이 아래가 물). level 1이면 백사장 끝, 0이면 먼바다 바로 위 */
export function tideLineY(level: number): number {
  const l = level < 0 ? 0 : level > 1 ? 1 : level;
  return TIDE_LOW_Y + (TIDE_HIGH_Y - TIDE_LOW_Y) * l;
}

// ── 구역 (이름표·안내·미니맵 기준. 충돌과는 상관없어요) ──
export type SeaZoneId = "busStop" | "market" | "realty" | "cottages" | "beach" | "flat" | "pier" | "breakwater" | "rocks";
export type SeaZone = { id: SeaZoneId; name: string } & Rect;
export const SEA_ZONES: readonly SeaZone[] = [
  { id: "busStop", name: "버스 정류장", x: 950, y: 30, w: 200, h: 110 },
  { id: "market", name: "포구 시장", x: 700, y: 170, w: 272, h: 160 },
  { id: "realty", name: "포구 부동산", x: 546, y: 186, w: 132, h: 120 },
  { id: "cottages", name: "오두막 단지", x: 32, y: 156, w: 476, h: 228 },
  { id: "beach", name: "백사장", x: 0, y: SEA_SAND_Y0, w: SEA_WIDTH, h: SEA_FLAT_Y0 - SEA_SAND_Y0 },
  { id: "flat", name: "갯벌", x: 240, y: SEA_FLAT_Y0, w: 900, h: TIDE_LOW_Y - SEA_FLAT_Y0 },
  { id: "pier", name: "선착장", x: 584, y: 540, w: 72, h: 400 },
  { id: "breakwater", name: "방파제", x: 1140, y: 540, w: 88, h: 404 },
  { id: "rocks", name: "갯바위", x: 24, y: 590, w: 220, h: 240 },
];

// ── 버스 정류장 (오른쪽 위) ── 지붕 받침 가운데. 지붕 아래 벤치(pB), 오른쪽에 노선 팻말, 왼쪽에 시간표.
// 정류장 앞 보도 → 그 아래 버스 길. 11/16 오른쪽 끝(1150)에선 화면 오른쪽 위 미니맵에 가려서 조금 왼쪽(1040)으로 옮겼어요
export const SEA_BUS_STOP = { x: 1040, y: 84 } as const;
export const SEA_SHELTER_W = 64;
export const SEA_SHELTER_H = 52;
export const SEA_BUS_SIGN = { x: SEA_BUS_STOP.x + 50, y: 90 } as const;
export const SEA_BUS_TIMETABLE = { x: SEA_BUS_STOP.x - 48, y: 88 } as const;
/** 버스에서 내리는 자리 (정류장 앞 보도). 처음 도착·새로고침 자리가 막혔을 때도 여기 */
export const SEA_ARRIVE = { x: SEA_BUS_STOP.x, y: 100 } as const;
/** 버스에 타는 자리 (정류장 앞 보도 — 여기서 E) */
export const SEA_BOARD = { x: SEA_BUS_STOP.x, y: SEA_BUS_STOP.y + 16 } as const;
/** 버스 바퀴가 닿는 줄 (BusArrival laneY) · 오른쪽 끝에서 들어와요 */
export const SEA_BUS_LANE_Y = SEA_ROAD.y + SEA_ROAD.h - 6;
export const SEA_BUS_FROM_LEFT = false;

// ── 포구 시장 (가운데 위) ── 받침 가운데. 차양 셋 아래 좌판 (갯벌에서 캔 것·바다 고기 팔기는 다음 차수)
export const SEA_MARKET = { x: 836, y: 300 } as const;
export const SEA_MARKET_W = 272;
export const SEA_MARKET_H = 120;
/** 좌판 자리 (시장 앞, 다음 차수에 장사꾼·사고팔기를 붙여요) */
export const SEA_MARKET_STALLS: readonly Pt[] = [
  { x: SEA_MARKET.x - 88, y: SEA_MARKET.y + 18 },
  { x: SEA_MARKET.x, y: SEA_MARKET.y + 18 },
  { x: SEA_MARKET.x + 88, y: SEA_MARKET.y + 18 },
];

// ── 포구 부동산 (시장 왼쪽) ── 오두막 분양 사무소 (분양은 다음 차수). 문은 앞 가운데
export const SEA_REALTY = { x: 612, y: 290 } as const;
export const SEA_REALTY_W = 128;
export const SEA_REALTY_H = 100;
export const SEA_REALTY_DOOR = { x: SEA_REALTY.x, y: SEA_REALTY.y + 8 } as const;

// ── 오두막 터 6 (왼쪽 위) ── 11/16 사용자 "바둑판 같아요" → 작은 모래 언덕 위 굽은 골목(SEA_LOT_LANE)을 따라 흩어진 터.
// 터마다 크기·출입구 쪽(남·동·서)·울타리(나무 울타리·밧줄·생울타리)가 달라요. 바다 쪽 아랫줄 셋은 앞에 작은 데크가 바다를 봐요.
// 하우징 계산이 쉽게 모두 축에 맞춘 사각형이에요. 지금은 빈 터와 「분양 준비 중」 팻말만 (오두막은 다음 차수)
/** 보통 터 크기 (터마다 조금씩 달라요 — SEA_LOTS 각 w·h) */
export const SEA_LOT_W = 136;
export const SEA_LOT_H = 86;
export type SeaLotGate = "s" | "e" | "w";
export type SeaLotFence = "picket" | "rope" | "hedge";
export type SeaLot = { n: number; gate: SeaLotGate; fence: SeaLotFence; deck: boolean } & Rect;
export const SEA_LOTS: readonly SeaLot[] = [
  { n: 1, x: 24, y: 154, w: 136, h: 86, gate: "e", fence: "picket", deck: false },
  { n: 2, x: 220, y: 166, w: 124, h: 80, gate: "s", fence: "rope", deck: false },
  { n: 3, x: 384, y: 154, w: 140, h: 84, gate: "w", fence: "hedge", deck: false },
  { n: 4, x: 36, y: 268, w: 128, h: 92, gate: "s", fence: "picket", deck: true },
  { n: 5, x: 200, y: 288, w: 138, h: 82, gate: "s", fence: "hedge", deck: true },
  { n: 6, x: 372, y: 270, w: 152, h: 90, gate: "s", fence: "rope", deck: true },
];
/** 터 출입구 폭 */
export const SEA_LOT_GATE_W = 32;
/** 터 출입구 가운데 (울타리 선 위) */
export function seaLotGate(l: SeaLot): Pt {
  return l.gate === "s" ? { x: l.x + l.w / 2, y: l.y + l.h } : l.gate === "e" ? { x: l.x + l.w, y: l.y + l.h / 2 } : { x: l.x, y: l.y + l.h / 2 };
}
/** 출입구 바로 바깥 (상호작용·걸어 닿는 자리) */
export function seaLotFront(l: SeaLot, d = 8): Pt {
  const g = seaLotGate(l);
  return l.gate === "s" ? { x: g.x, y: g.y + d } : l.gate === "e" ? { x: g.x + d, y: g.y + 4 } : { x: g.x - d, y: g.y + 4 };
}
/** 터 팻말 (출입구 옆 바깥, 땅에 꽂은 작은 판) */
export function seaLotSign(l: SeaLot): Pt {
  const g = seaLotGate(l);
  return l.gate === "s" ? { x: g.x - SEA_LOT_GATE_W / 2 - 14, y: g.y + 12 } : l.gate === "e" ? { x: g.x + 14, y: g.y - 12 } : { x: g.x - 14, y: g.y - 12 };
}
/** 오두막 단지 굽은 골목 (산책로에서 올라와 터 사이를 지나요) · 동쪽 가지 골목 (디딤돌) */
export const SEA_LOT_LANE: readonly Pt[] = [
  { x: 182, y: 390 },
  { x: 184, y: 332 },
  { x: 176, y: 268 },
  { x: 194, y: 210 },
  { x: 190, y: 150 },
];
export const SEA_LOT_BRANCH: readonly Pt[] = [
  { x: 178, y: 264 },
  { x: 262, y: 266 },
  { x: 362, y: 258 },
  { x: 470, y: 254 },
  { x: 540, y: 250 },
];
/** 오두막 단지 함께 쓰는 우편함 · 등불 기둥 둘 */
export const SEA_LOT_MAILBOX = { x: 170, y: 296 } as const;
export const SEA_LOT_LANTERNS: readonly Pt[] = [
  { x: 196, y: 336 },
  { x: 468, y: 244 },
];

// ── 선착장 (가운데, 백사장 끝에서 먼바다까지) ── 나무 데크. 양옆은 난간이라 갯벌에서 오르내리지 못해요 (머리에서 올라요)
export const SEA_PIER = { x: 600, y: 540, w: 40, h: 370 } as const;
/** 선착장 끝 넓은 데크 (먼바다 위) */
export const SEA_PIER_END = { x: 584, y: 896, w: 72, h: 44 } as const;
/** 매점 (선착장 머리 오른쪽 백사장 — 갈매기 과자는 다음 차수) */
export const SEA_KIOSK = { x: 684, y: 500 } as const;
export const SEA_KIOSK_W = 56;
export const SEA_KIOSK_H = 56;
/** 묶여 있는 낚싯배 (선착장 끝 오른쪽, 늘 깊은 물 — 지금은 물결 따라 흔들리기만) */
export const SEA_BOAT = { x: 700, y: 924 } as const;
/** 빨간 부표 */
export const SEA_BUOYS: readonly Pt[] = [
  { x: 380, y: 920 }, // 11/16 유령선 자리를 비우려고 서쪽으로 (예전 548)
  { x: 780, y: 906 },
  { x: 1086, y: 920 },
];

/**
 * 11/16 유령선이 대는 자리 (토요일 밤 행사 — 다음 차수). 선착장 끝 서쪽 깊은 물 (묶인 낚싯배 반대편).
 *  - ship = 배 그림 받침 가운데(용골 아래), w·h = 배 그림 크기 (160×90)
 *  - clear = 배가 들어올 빈 물 (부표·장식·물보라 자리를 두지 않아요)
 *  - gangway = 선착장 끝 데크 서쪽 가장자리의 건널판 자리 (다음 차수에 난간을 열어요). 토요일 장터는 이 둘레 선착장에
 */
export const SEA_GHOST_BERTH = {
  ship: { x: 494, y: 952 },
  w: 160,
  h: 90,
  clear: { x: 404, y: 862, w: 178, h: 98 },
  gangway: { x: 588, y: 916 },
} as const;

// ── 방파제 (오른쪽) ── 백사장 끝에서 먼바다로. 양옆은 테트라포드라 막혀요. 끝 데크에 등대 (오르기·등불은 다음 차수)
export const SEA_BREAKWATER = { x: 1160, y: 540, w: 48, h: 320 } as const;
export const SEA_BREAKWATER_TIP = { x: 1136, y: 852, w: 96, h: 92 } as const;
/** 등대 받침 가운데 (끝 데크 뒤쪽) */
export const SEA_LIGHTHOUSE = { x: 1184, y: 900 } as const;
export const SEA_LIGHTHOUSE_W = 36;
export const SEA_LIGHTHOUSE_H = 96;
/** 등대 문 앞 (다음 차수에 E → 오르기) */
export const SEA_LIGHTHOUSE_DOOR = { x: SEA_LIGHTHOUSE.x, y: SEA_LIGHTHOUSE.y + 12 } as const;

// ── 갯바위 (왼쪽 아래) ── 바위 덩어리 (막혀요). 족욕 바위는 물웅덩이 옆 납작 바위 (앉기는 다음 차수)
/**
 * 바위 (small = 작은 돌, 막지 않고 그리기만). 11/16 사용자 "백사장만 있지 말고 갯바위 구간도" →
 * 왼쪽 아래 갯바위 + 방파제 쪽 바위 곶 + 물가 사이사이 바위 (가운데 백사장은 모래 그대로). 물가 바위는 만조에 반쯤 잠겨 파도가 부서져요
 */
export type SeaRock = { x: number; y: number; rx: number; ry: number; small?: true };
export const SEA_ROCKS: readonly SeaRock[] = [
  { x: 82, y: 640, rx: 46, ry: 22 },
  { x: 150, y: 712, rx: 34, ry: 17 },
  { x: 62, y: 772, rx: 30, ry: 15 },
  { x: 214, y: 820, rx: 26, ry: 13 },
  { x: 40, y: 860, rx: 24, ry: 12 },
  // 11/16 오두막 언덕 아래 물가
  { x: 36, y: 590, rx: 20, ry: 10 },
  { x: 120, y: 590, rx: 14, ry: 7, small: true },
  { x: 248, y: 604, rx: 12, ry: 6, small: true },
  // 11/16 방파제 쪽 바위 곶
  { x: 1100, y: 600, rx: 28, ry: 14 },
  { x: 1128, y: 646, rx: 22, ry: 11 },
  { x: 1072, y: 652, rx: 16, ry: 8, small: true },
  { x: 1112, y: 700, rx: 20, ry: 10 },
  { x: 1138, y: 588, rx: 12, ry: 6, small: true },
  // 11/16 물가 사이사이
  { x: 540, y: 606, rx: 12, ry: 6, small: true },
  { x: 796, y: 606, rx: 18, ry: 9 },
  { x: 934, y: 676, rx: 20, ry: 10 },
  { x: 686, y: 716, rx: 10, ry: 5, small: true },
];
export const SEA_FOOTBATH = { x: 196, y: 650 } as const;
/** 간조에도 남는 물웅덩이 (갯벌 위, 장식 — 걸을 수 있어요) */
export const SEA_TIDE_POOLS: readonly { x: number; y: number; rx: number; ry: number }[] = [
  { x: 214, y: 662, rx: 22, ry: 9 },
  { x: 380, y: 780, rx: 42, ry: 14 },
  { x: 860, y: 820, rx: 54, ry: 16 },
  { x: 1010, y: 650, rx: 30, ry: 10 },
  { x: 470, y: 690, rx: 24, ry: 8 },
  // 11/16 새 바위 둘레 웅덩이
  { x: 1062, y: 690, rx: 16, ry: 6 },
  { x: 66, y: 618, rx: 14, ry: 5 },
  { x: 812, y: 628, rx: 12, ry: 4 },
];

// ── 다음 차수 자리 (쉴거리·갯벌 캐기·모래성 등). 지금은 그리기만 하거나 비워 둬요 ──
/** 쉴거리 자리 (사용자 확정 배치). 앉기·장면 전환은 다음 차수 */
/** 11/16 백사장 선베드 한 벌(선베드·파라솔·선베드) 가운데 x — 선착장 머리·매점·모닥불·해먹 자리를 비켜서 */
export const SEA_BEACH_UNITS: readonly number[] = [160, 280, 400, 780, 900, 1020];
/** 선베드 받침 y (머리는 위, 발은 바다 쪽) */
export const SEA_LOUNGER_Y = 500;
/** 바다 보기 벤치 x (선베드 한 벌 사이 틈) */
export const SEA_BEACH_BENCH_X: readonly number[] = [220, 340, 840, 960];
export const SEA_SPOTS = {
  /** 바다 보기 벤치 4 — 11/16 사용자: 선베드 줄 뒤(산책로 바로 아래)로, 선베드 사이 틈에서 바다를 봐요 */
  benches: SEA_BEACH_BENCH_X.map((x) => ({ x, y: 432, facing: DIR.down })),
  /** 선베드 12 — 11/16 사용자 "리조트 해변처럼": 선베드·파라솔·선베드 한 벌을 백사장에 나란히 (바다를 봐요). 받침 y */
  loungers: SEA_BEACH_UNITS.flatMap((c) => [
    { x: c - 24, y: SEA_LOUNGER_Y },
    { x: c + 24, y: SEA_LOUNGER_Y },
  ]),
  /** 파라솔 6 (선베드 한 벌 가운데 — 갓이 두 선베드 머리 쪽을 덮어요) */
  parasols: SEA_BEACH_UNITS.map((c) => ({ x: c, y: SEA_LOUNGER_Y - 12 })),
  /** 야자수 해먹 (나무 둘 사이) · 해변 그네 */
  hammock: { x: 80, y: 446 },
  swing: { x: 1096, y: 456 },
  /** 해변 모닥불 (마을 서쪽 모닥불을 옮겨 와요) */
  bonfire: { x: 470, y: 470 },
  /** 모래성 자리 3 (갯벌 바로 앞, 만조 앞뒤에 무너져요) */
  sandcastles: [
    { x: 344, y: 590 },
    { x: 760, y: 590 },
    { x: 980, y: 584 },
  ],
  /** 족욕 바위 · 선착장 끝 걸터앉기 · 방파제 끝 걸터앉기 · 등대 문 */
  footbath: SEA_FOOTBATH,
  pierEnd: { x: SEA_PIER_END.x + SEA_PIER_END.w / 2, y: SEA_PIER_END.y + SEA_PIER_END.h - 4, facing: DIR.down },
  breakwaterEnd: { x: SEA_BREAKWATER_TIP.x + 16, y: SEA_BREAKWATER_TIP.y + SEA_BREAKWATER_TIP.h - 6, facing: DIR.down },
  lighthouseDoor: SEA_LIGHTHOUSE_DOOR,
} as const;
/**
 * 11/16 갯바위 낚시 자리 (마을 낚시와 같은 1인 자리 — SPOT_KINDS.fish, 서버 좌석). 큰 갯바위 앞 (바다 쪽)과 선착장 끝 데크.
 * 바닷물고기 도감이 아직 없어서 물 종류는 호수(lake) 물고기로 둬요 (다음 차수에 바다 물고기를 더하면 "sea"로).
 * id = "f_x_y" (마을·캠핑장 낚시 자리 id와 겹치지 않아요 — sea.test가 봐요). 앉아 있는 동안은 물이 차도 그대로 앉아 있어요
 */
const rockSpot = (i: number, dx = 0): FishingSpot => {
  const r = SEA_ROCKS[i];
  const x = Math.round(r.x + dx);
  // 바위 그림 밑동 바로 앞 (사람이 바위 앞에 그려지고, 일어서도 바위에 걸리지 않게)
  const y = Math.round(r.y + r.ry * 0.7 + 4);
  return { id: `f_${x}_${y}`, water: "lake", x, y, facing: DIR.down };
};
export const SEA_FISHING_SPOTS: readonly FishingSpot[] = [
  // 왼쪽 갯바위
  rockSpot(0),
  rockSpot(1),
  rockSpot(3),
  // 방파제 쪽 바위 곶
  rockSpot(8, -8), // 찌가 아래 바위(9번)에 가리지 않게 조금 왼쪽
  rockSpot(11),
  // 물가 사이 바위
  rockSpot(15),
  // 선착장 끝 데크 (가운데 걸터앉기 자리 양옆)
  { id: "f_604_930", water: "lake", x: 604, y: 930, facing: DIR.down },
  { id: "f_636_930", water: "lake", x: 636, y: 930, facing: DIR.down },
];
/** 갯바위 낚시 자리 발판 (바위 앞 넓적한 바위 턱 — 물이 차도 올라서 있어요, 선착장처럼 마른 자리) */
export const SEA_FISHING_LEDGES: readonly Rect[] = SEA_FISHING_SPOTS.filter((f) => !onSeaDeckBase(f.x, f.y)).map((f) => ({ x: f.x - 15, y: f.y - 6, w: 30, h: 14 }));
export function seaFishingSpotById(id: string): FishingSpot | undefined {
  return SEA_FISHING_SPOTS.find((s) => s.id === id);
}

// ── 11/16 갯바위 낚시 물때 규칙 ── 찌가 떨어지는 곳(자리 앞 SEA_FISH_CAST px)이 물속이어야 낚을 수 있어요.
// 물가 선은 물때 평균 선(tideLineY — 파도로 오르내리는 꾸밈은 빼요)에 여유(SEA_FISH_WET_MARGIN)를 둬요.
// 클라이언트(자리 안내·낚시 중 끝내기)와 웹 서버(던지기·자동 낚시 켜기)가 같은 계산을 써요. 선착장 끝은 늘 깊은 물이에요
/** 찌가 떨어지는 거리 (game/world/forage/Foraging CAST_DIST와 같아요) */
export const SEA_FISH_CAST = 24;
/** 찌 자리가 물가 선보다 이만큼은 더 바다 쪽이어야 해요 (px) */
export const SEA_FISH_WET_MARGIN = 6;
export const SEA_TIDE_OUT_MSG = "물이 빠져서 지금은 낚시할 수 없어요. 물이 들어오면 다시 와요.";
const FISH_STEP: Record<number, [number, number]> = { [DIR.down]: [0, 1], [DIR.up]: [0, -1], [DIR.left]: [-1, 0], [DIR.right]: [1, 0] };
/** 찌가 떨어지는 곳 */
export function seaFishBobber(spot: FishingSpot): Pt {
  const [dx, dy] = FISH_STEP[spot.facing] ?? [0, 1];
  return { x: spot.x + dx * SEA_FISH_CAST, y: spot.y + dy * SEA_FISH_CAST };
}
/** 이 물 높이(0..1)보다 높아야 찌 자리가 물속이에요 (0 이하면 늘 물속, 1 넘으면 늘 마름) */
export function seaFishMinLevel(spot: FishingSpot): number {
  const wetLine = seaFishBobber(spot).y - SEA_FISH_WET_MARGIN;
  return (TIDE_LOW_Y - wetLine) / (TIDE_LOW_Y - TIDE_HIGH_Y);
}
/** 물 높이 level에서 찌 자리가 물속인지 (클라이언트는 화면 물때 level로) */
export function seaFishWetAt(spot: FishingSpot, level: number): boolean {
  return level >= seaFishMinLevel(spot);
}
/** 지금(nowMs) 찌 자리가 물속인지 (서버·클라이언트 공통) */
export function seaFishWet(spot: FishingSpot, nowMs: number): boolean {
  return seaFishWetAt(spot, tideLevel(nowMs));
}
/**
 * 지금 물속이면 물이 빠져 찌 자리가 마르는 시각 (epoch ms), 늘 물속이면 Infinity, 지금 말라 있으면 nowMs.
 * level = 0.5 + 0.5·cos(2πt/주기) ≥ L  ⇔  t ≤ T0 또는 t ≥ 주기 − T0  (T0 = 주기/2π · acos(2L − 1))
 */
export function seaFishDryAt(spot: FishingSpot, nowMs: number): number {
  const L = seaFishMinLevel(spot);
  if (L <= 0) return Infinity;
  if (!seaFishWet(spot, nowMs)) return nowMs;
  const T0 = (TIDE_PERIOD_MIN / (2 * Math.PI)) * Math.acos(Math.max(-1, Math.min(1, 2 * L - 1)));
  const t = tideMinute(nowMs);
  const ahead = t <= T0 ? T0 - t : TIDE_PERIOD_MIN - t + T0;
  return nowMs + ahead * 60_000;
}
/** 갯벌 구멍 (다음 차수 캐기 자리 — 물이 빠지면 드러나요) */
export const SEA_DIG_HOLES: readonly Pt[] = [
  { x: 300, y: 640 },
  { x: 380, y: 700 },
  { x: 268, y: 760 },
  { x: 470, y: 620 },
  { x: 720, y: 640 },
  { x: 800, y: 720 },
  { x: 880, y: 630 },
  { x: 960, y: 790 },
  { x: 680, y: 800 },
  { x: 430, y: 830 },
  { x: 1030, y: 700 },
  { x: 540, y: 760 },
];
/** 갈매기가 내려앉는 말뚝 (선착장 양옆·방파제 위) */
export const SEA_GULL_PERCHES: readonly Pt[] = [
  { x: SEA_PIER.x - 4, y: 640 },
  { x: SEA_PIER.x + SEA_PIER.w + 4, y: 760 },
  { x: SEA_PIER.x - 4, y: 880 },
  { x: SEA_BREAKWATER.x + 6, y: 620 },
  { x: SEA_BREAKWATER.x + SEA_BREAKWATER.w - 6, y: 720 },
  { x: SEA_BREAKWATER.x + 10, y: 820 },
];

// ── 앉는 자리 (좌석 판정은 서버) ── id는 마을·캠핑장 좌석과 겹치지 않게 모두 "p"로 시작해요
/** 11/16 선착장 끝·방파제 끝 걸터앉기 (다리를 데크 끝 밖으로 늘어뜨려요 — 그림·충돌 없는 자리) */
export const SEA_EDGE_SEATS: readonly string[] = ["pE1", "pE2"];
export const SEA_FURNITURE: readonly Furniture[] = [
  // 정류장 지붕 아래 벤치
  { id: "pB", kind: "bench", x: SEA_BUS_STOP.x, y: SEA_BUS_STOP.y - 8, facing: DIR.down, seatOffsets: [-12, 12] },
  // 11/16 오두막 단지 함께 쓰는 벤치 (5·6번 터 사이 앞, 바다 쪽을 봐요). 두 자리 간격은 캠핑장 벤치처럼 20 (울타리와 겹치지 않게 조금 아래로)
  { id: "pL", kind: "bench", x: 362, y: 384, facing: DIR.down, seatOffsets: [-10, 10] },
  // 11/16 백사장 바다 보기 벤치 4 (바다를 봐요)
  ...SEA_SPOTS.benches.map((b, i): Furniture => ({ id: `pS${i + 1}`, kind: "bench", x: b.x, y: b.y, facing: DIR.down, seatOffsets: [-10, 10] })),
  // 11/16 끝 걸터앉기 (선착장 끝 가운데 · 방파제 끝 데크)
  { id: "pE1", kind: "chair", x: SEA_SPOTS.pierEnd.x, y: SEA_SPOTS.pierEnd.y, facing: DIR.down, seatOffsets: [0] },
  { id: "pE2", kind: "chair", x: SEA_SPOTS.breakwaterEnd.x, y: SEA_SPOTS.breakwaterEnd.y, facing: DIR.down, seatOffsets: [0] },
];
export const SEA_SEATS: readonly Seat[] = SEA_FURNITURE.flatMap((f) =>
  f.seatOffsets.map((dx, i) => ({
    id: f.seatOffsets.length > 1 ? `${f.id}-${i}` : f.id,
    furnitureId: f.id,
    x: f.x + dx,
    y: f.y,
    facing: f.facing as DirId,
    // 끝 걸터앉기는 일어서면 데크 쪽(뒤)으로 — 앞은 물이에요
    ...(SEA_EDGE_SEATS.includes(f.id) ? { standDy: -10 } : {}),
  })),
);

/**
 * 11/16 쉴거리 자리 (의자가 아닌 자리): 선베드(눕기) · 파라솔 돗자리(넷이 둘러앉기) · 돗자리(둘).
 * 서버 좌석(seaSlots)으로 한 자리에 한 명. 상태: 선베드 = lie (누운 자세), 돗자리 = sitGround (바닥 앉기)
 *  - group = 같은 선베드·돗자리 (같이 앉은 사람을 바다 장면에 뒷모습으로 그려요)
 *  - x·y = 자리 발 위치, facing = 앉아서 보는 쪽 (모두 바다 쪽 아래)
 */
export type SeaRestKind = "lounger" | "parasol" | "mat";
export type SeaRestSeat = { id: string; group: string; kind: SeaRestKind; x: number; y: number; facing: DirId; state: StateId };
/** 11/16 돗자리 둘 (선베드 줄 앞, 선착장 머리 양옆 — 구덩이·길·벤치를 비켜서) */
export const SEA_MATS: readonly Pt[] = [
  { x: 552, y: 540 },
  { x: 712, y: 540 },
];
/** 선베드에 누운 사람 발 위치 (선베드 그림 받침에서 위로) */
export const SEA_LOUNGER_LIE_DY = -8;
export const SEA_REST_SEATS: readonly SeaRestSeat[] = [
  ...SEA_SPOTS.loungers.map((l, i): SeaRestSeat => ({ id: `pZ${i + 1}`, group: `pZ${i + 1}`, kind: "lounger", x: l.x, y: l.y + SEA_LOUNGER_LIE_DY, facing: DIR.down, state: STATE.lie })),
  // 11/16 파라솔 돗자리는 선베드 한 벌(파라솔 아래 선베드 둘)로 바꿨어요
  ...SEA_MATS.flatMap((m, i) =>
    [-10, 10].map((dx, k): SeaRestSeat => ({ id: `pM${i + 1}-${k}`, group: `pM${i + 1}`, kind: "mat", x: m.x + dx, y: m.y + 2, facing: DIR.down, state: STATE.sitGround })),
  ),
];
const seaRestMap = new Map(SEA_REST_SEATS.map((s) => [s.id, s]));
export function seaRestSeatById(id: string): SeaRestSeat | undefined {
  return seaRestMap.get(id);
}

/** 11/16 바다 보기 장면 종류 (앉은 자리마다) */
export type SeaViewKind = "beach" | "mat" | "parasol" | "lounger" | "pier" | "breakwater";
/** 이 자리에 앉아 있으면 볼 수 있는 바다 장면 (null = 바다 보기 없음 — 정류장·오두막 벤치) */
export function seaViewOfSeat(seatId: string): SeaViewKind | null {
  const r = seaRestMap.get(seatId);
  if (r) return r.kind;
  if (seatId === "pE1") return "pier";
  if (seatId === "pE2") return "breakwater";
  if (seatId.startsWith("pS")) return "beach";
  return null;
}
/** 같은 자리 묶음 (벤치·돗자리·선베드) */
export function seaSeatGroup(seatId: string): string {
  const r = seaRestMap.get(seatId);
  if (r) return r.group;
  return seatSeaFurniture(seatId);
}
function seatSeaFurniture(seatId: string): string {
  const i = seatId.indexOf("-");
  return i < 0 ? seatId : seatId.slice(0, i);
}
const seaSeatMap = new Map(SEA_SEATS.map((s) => [s.id, s]));
export function seaSeatById(id: string): Seat | undefined {
  return seaSeatMap.get(id);
}

// ── 충돌 (서버·클라이언트·테스트 공통) ──

/** 정류장 지붕 뒷벽·앞 기둥 둘 (가운데 벤치 자리는 비워요) */
function shelterColliders(): Rect[] {
  const s = SEA_BUS_STOP;
  const half = SEA_SHELTER_W / 2;
  return [
    { x: s.x - half + 2, y: s.y - 26, w: SEA_SHELTER_W - 4, h: 4 },
    { x: s.x - half + 2, y: s.y - 5, w: 4, h: 5 },
    { x: s.x + half - 6, y: s.y - 5, w: 4, h: 5 },
  ];
}

/** 오두막 터 울타리 (네 변, 출입구 쪽 변은 가운데를 비워요) */
export function seaLotFences(l: SeaLot): Rect[] {
  const t = 4;
  const G = SEA_LOT_GATE_W;
  const out: Rect[] = [];
  const top = { x: l.x, y: l.y, w: l.w, h: t };
  const bottom = { x: l.x, y: l.y + l.h - t, w: l.w, h: t };
  const left = { x: l.x, y: l.y, w: t, h: l.h };
  const right = { x: l.x + l.w - t, y: l.y, w: t, h: l.h };
  out.push(top);
  if (l.gate === "s") {
    const gx = l.x + l.w / 2 - G / 2;
    out.push({ x: l.x, y: bottom.y, w: gx - l.x, h: t }, { x: gx + G, y: bottom.y, w: l.x + l.w - gx - G, h: t });
  } else out.push(bottom);
  const gy = l.y + l.h / 2 - G / 2;
  if (l.gate === "w") out.push({ x: l.x, y: l.y, w: t, h: gy - l.y }, { x: l.x, y: gy + G, w: t, h: l.y + l.h - gy - G });
  else out.push(left);
  if (l.gate === "e") out.push({ x: right.x, y: l.y, w: t, h: gy - l.y }, { x: right.x, y: gy + G, w: t, h: l.y + l.h - gy - G });
  else out.push(right);
  return out;
}

/** 바위 덩어리 하나의 막는 상자 (타원 안쪽) */
export function seaRockCollider(r: { x: number; y: number; rx: number; ry: number }): Rect {
  return { x: r.x - r.rx * 0.8, y: r.y - r.ry * 0.7, w: r.rx * 1.6, h: r.ry * 1.2 };
}

/**
 * 먼바다: 11/16부터 헤엄·잠수할 수 있어 막지 않아요. 묶인 낚싯배 몸통만 막아요 (맵 아래 끝은 SEA_BOUNDS).
 * 선착장·방파제 끝 데크 둘레는 난간(railColliders)이 막아서 물에서 데크로 바로 오르지는 못해요
 */
function deepSeaColliders(): Rect[] {
  return [{ x: SEA_BOAT.x - 34, y: SEA_BOAT.y - 12, w: 68, h: 16 }];
}

/** 선착장·방파제 난간 (머리 아래부터 양옆을 막아요 — 갯벌에서 올라타지 못해요) */
function railColliders(): Rect[] {
  const P = SEA_PIER;
  const B = SEA_BREAKWATER;
  const T = SEA_BREAKWATER_TIP;
  const head = SEA_FLAT_Y0 + 4;
  return [
    { x: P.x - 4, y: head, w: 4, h: SEA_DEEP_Y - head },
    { x: P.x + P.w, y: head, w: 4, h: SEA_DEEP_Y - head },
    { x: B.x - 6, y: head, w: 6, h: T.y - head },
    { x: B.x + B.w, y: head, w: 6, h: T.y - head },
    // 방파제 끝 데크 둘레 (위쪽 양옆 — 방파제 몸통과 이어지는 곳은 비워요)
    { x: T.x - 4, y: T.y, w: B.x - T.x + 4, h: 4 },
    { x: B.x + B.w, y: T.y, w: T.x + T.w - B.x - B.w + 4, h: 4 },
    { x: T.x - 4, y: T.y, w: 4, h: T.h },
    { x: T.x + T.w, y: T.y, w: 4, h: T.h },
    // 선착장 끝 데크 둘레 (위쪽 양옆)
    { x: SEA_PIER_END.x - 4, y: SEA_PIER_END.y, w: P.x - SEA_PIER_END.x + 4, h: 4 },
    { x: P.x + P.w, y: SEA_PIER_END.y, w: SEA_PIER_END.x + SEA_PIER_END.w - P.x - P.w + 4, h: 4 },
    { x: SEA_PIER_END.x - 4, y: SEA_PIER_END.y, w: 4, h: SEA_PIER_END.h },
    { x: SEA_PIER_END.x + SEA_PIER_END.w, y: SEA_PIER_END.y, w: 4, h: SEA_PIER_END.h },
  ];
}

/**
 * 막히는 것 (건물·울타리·바위·난간·먼바다·뒤 언덕). 나무·작은 장식 충돌은 클라이언트(game/sea/seaLayout)가 더해요.
 * 물때로 바뀌는 것은 없어요 — 갯벌은 늘 걸을 수 있어요
 */
export function seaColliders(): Rect[] {
  return [
    // 뒤 언덕 (정류장 지붕 뒤까지)
    { x: 0, y: 0, w: SEA_WIDTH, h: SEA_HILL_H },
    ...shelterColliders(),
    { x: SEA_BUS_SIGN.x - 2, y: SEA_BUS_SIGN.y - 4, w: 4, h: 4 },
    { x: SEA_BUS_TIMETABLE.x - 6, y: SEA_BUS_TIMETABLE.y - 4, w: 12, h: 4 },
    // 시장·부동산·매점 (뒤쪽 몸통 — 앞 처마 아래는 걸어요)
    { x: SEA_MARKET.x - SEA_MARKET_W / 2 + 4, y: SEA_MARKET.y - 52, w: SEA_MARKET_W - 8, h: 40 },
    { x: SEA_REALTY.x - SEA_REALTY_W / 2 + 4, y: SEA_REALTY.y - 44, w: SEA_REALTY_W - 8, h: 44 - 6 },
    { x: SEA_KIOSK.x - SEA_KIOSK_W / 2 + 2, y: SEA_KIOSK.y - 22, w: SEA_KIOSK_W - 4, h: 22 },
    // 오두막 터 울타리
    ...SEA_LOTS.flatMap(seaLotFences),
    { x: SEA_LOT_MAILBOX.x - 3, y: SEA_LOT_MAILBOX.y - 3, w: 6, h: 3 },
    ...SEA_LOT_LANTERNS.map((p) => ({ x: p.x - 2, y: p.y - 3, w: 4, h: 3 })),
    // 등대 (몸통)
    { x: SEA_LIGHTHOUSE.x - SEA_LIGHTHOUSE_W / 2, y: SEA_LIGHTHOUSE.y - 20, w: SEA_LIGHTHOUSE_W, h: 20 },
    ...railColliders(),
    ...SEA_ROCKS.filter((r) => !r.small).map(seaRockCollider),
    ...deepSeaColliders(),
  ];
}

/** (x,y)가 선착장·방파제 위인지 (물이 덮어도 젖지 않아요) */
function onSeaDeckBase(x: number, y: number): boolean {
  const inR = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  return inR(SEA_PIER) || inR(SEA_PIER_END) || inR(SEA_BREAKWATER) || inR(SEA_BREAKWATER_TIP);
}
/** 선착장·방파제 데크 위, 11/16 또는 갯바위 낚시 발판 위 (물이 차도 마른 자리) */
export function onSeaDeck(x: number, y: number): boolean {
  if (onSeaDeckBase(x, y)) return true;
  for (const r of SEA_FISHING_LEDGES) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  return false;
}

/**
 * (x,y)가 지금 물 높이에서 물속인지 (헤엄치는 모습). 물가 선 아래 갯벌이면 물속, 선착장·방파제 위는 아니에요.
 * edge = 물가에서 이만큼은 발만 젖어요 (물가에서 헤엄 모습이 깜빡이지 않게)
 */
export function seaWet(x: number, y: number, level: number, edge = 10): boolean {
  if (y < tideLineY(level) + edge) return false;
  return !onSeaDeck(x, y);
}
