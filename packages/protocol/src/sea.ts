import { DIR, type DirId } from "./types";
import type { Furniture, Seat } from "./world";

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
 */
export const SEA_MAP_VERSION = 2;

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** 걸을 수 있는 범위 (둘레 언덕·먼바다 안쪽. 먼바다·건물은 seaColliders가 따로 막아요) */
export const SEA_BOUNDS = { minX: 20, maxX: SEA_WIDTH - 20, minY: 60, maxY: SEA_HEIGHT - 14 } as const;

// ── 띠 (위 → 아래) ──
/** 뒤 언덕 (소나무·바위, 막혀요). 이 아래부터 걸어요 */
export const SEA_HILL_H = 56;
/** 버스 길 (맨 위, 오른쪽 끝에서 들어와 정류장 앞에 서요). 바닥 장식, 막지 않아요 */
export const SEA_ROAD = { x: 0, y: 104, w: SEA_WIDTH, h: 42 } as const;
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

// ── 오두막 터 6 (왼쪽 위) ── 두 줄에 세 채씩, 모두 바다를 봐요. 터 하나는 가로 9칸 세로 6칸 (뒤 4칸 오두막, 앞 2칸 데크).
// 지금은 울타리 친 빈 터와 「분양 준비 중」 팻말만 (오두막은 다음 차수). 울타리는 앞 가운데가 열려 있어요
export const SEA_LOT_W = 144;
export const SEA_LOT_H = 96;
export type SeaLot = { n: number } & Rect;
export const SEA_LOTS: readonly SeaLot[] = [0, 1, 2, 3, 4, 5].map((i) => ({ n: i + 1, x: 40 + (i % 3) * 156, y: 164 + Math.floor(i / 3) * 112, w: SEA_LOT_W, h: SEA_LOT_H }));
/** 터 앞 팻말 (왼쪽 앞 기둥 옆) */
export function seaLotSign(l: SeaLot): Pt {
  return { x: l.x + 22, y: l.y + l.h - 4 };
}
/** 터 울타리 출입구 (앞 가운데, 폭) */
export const SEA_LOT_GATE_W = 32;

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
  { x: 548, y: 918 },
  { x: 780, y: 906 },
  { x: 1086, y: 920 },
];

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
export const SEA_ROCKS: readonly { x: number; y: number; rx: number; ry: number }[] = [
  { x: 82, y: 640, rx: 46, ry: 22 },
  { x: 150, y: 712, rx: 34, ry: 17 },
  { x: 62, y: 772, rx: 30, ry: 15 },
  { x: 214, y: 820, rx: 26, ry: 13 },
  { x: 40, y: 860, rx: 24, ry: 12 },
];
export const SEA_FOOTBATH = { x: 196, y: 650 } as const;
/** 간조에도 남는 물웅덩이 (갯벌 위, 장식 — 걸을 수 있어요) */
export const SEA_TIDE_POOLS: readonly { x: number; y: number; rx: number; ry: number }[] = [
  { x: 214, y: 662, rx: 22, ry: 9 },
  { x: 380, y: 780, rx: 42, ry: 14 },
  { x: 860, y: 820, rx: 54, ry: 16 },
  { x: 1010, y: 650, rx: 30, ry: 10 },
  { x: 470, y: 690, rx: 24, ry: 8 },
];

// ── 다음 차수 자리 (쉴거리·갯벌 캐기·모래성 등). 지금은 그리기만 하거나 비워 둬요 ──
/** 쉴거리 자리 (사용자 확정 배치). 앉기·장면 전환은 다음 차수 */
export const SEA_SPOTS = {
  /** 바다 보기 벤치 4 (백사장 아래쪽, 바다를 봐요) */
  benches: [
    { x: 316, y: 540, facing: DIR.down },
    { x: 458, y: 540, facing: DIR.down },
    { x: 790, y: 540, facing: DIR.down },
    { x: 946, y: 540, facing: DIR.down },
  ],
  /** 선베드 6 */
  loungers: [
    { x: 196, y: 446 },
    { x: 246, y: 446 },
    { x: 296, y: 446 },
    { x: 836, y: 446 },
    { x: 886, y: 446 },
    { x: 936, y: 446 },
  ],
  /** 파라솔 돗자리 2 */
  parasols: [
    { x: 254, y: 494 },
    { x: 900, y: 494 },
  ],
  /** 야자수 해먹 (나무 둘 사이) · 해변 그네 */
  hammock: { x: 80, y: 446 },
  swing: { x: 1056, y: 456 },
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
export const SEA_FURNITURE: readonly Furniture[] = [
  // 정류장 지붕 아래 벤치
  { id: "pB", kind: "bench", x: SEA_BUS_STOP.x, y: SEA_BUS_STOP.y - 8, facing: DIR.down, seatOffsets: [-12, 12] },
];
export const SEA_SEATS: readonly Seat[] = SEA_FURNITURE.flatMap((f) =>
  f.seatOffsets.map((dx, i) => ({ id: f.seatOffsets.length > 1 ? `${f.id}-${i}` : f.id, furnitureId: f.id, x: f.x + dx, y: f.y, facing: f.facing as DirId })),
);
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

/** 오두막 터 울타리 (뒤·양옆 + 앞 가운데 출입구를 뺀 앞 두 토막) */
export function seaLotFences(l: SeaLot): Rect[] {
  const t = 4;
  const gx = l.x + l.w / 2 - SEA_LOT_GATE_W / 2;
  return [
    { x: l.x, y: l.y, w: l.w, h: t },
    { x: l.x, y: l.y, w: t, h: l.h },
    { x: l.x + l.w - t, y: l.y, w: t, h: l.h },
    { x: l.x, y: l.y + l.h - t, w: gx - l.x, h: t },
    { x: gx + SEA_LOT_GATE_W, y: l.y + l.h - t, w: l.x + l.w - gx - SEA_LOT_GATE_W, h: t },
  ];
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
    // 등대 (몸통)
    { x: SEA_LIGHTHOUSE.x - SEA_LIGHTHOUSE_W / 2, y: SEA_LIGHTHOUSE.y - 20, w: SEA_LIGHTHOUSE_W, h: 20 },
    ...railColliders(),
    ...SEA_ROCKS.map(seaRockCollider),
    ...deepSeaColliders(),
  ];
}

/** (x,y)가 선착장·방파제 위인지 (물이 덮어도 젖지 않아요) */
export function onSeaDeck(x: number, y: number): boolean {
  const inR = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  return inR(SEA_PIER) || inR(SEA_PIER_END) || inR(SEA_BREAKWATER) || inR(SEA_BREAKWATER_TIP);
}

/**
 * (x,y)가 지금 물 높이에서 물속인지 (헤엄치는 모습). 물가 선 아래 갯벌이면 물속, 선착장·방파제 위는 아니에요.
 * edge = 물가에서 이만큼은 발만 젖어요 (물가에서 헤엄 모습이 깜빡이지 않게)
 */
export function seaWet(x: number, y: number, level: number, edge = 10): boolean {
  if (y < tideLineY(level) + edge) return false;
  return !onSeaDeck(x, y);
}
