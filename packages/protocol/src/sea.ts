import { DIR, STATE, type DirId, type StateId } from "./types";
import type { Campfire, Furniture, FishingSpot, Seat } from "./world";

// 11/16 세 번째 맵 「달물결 포구」 (1차 바탕: 맵·버스·물때·갈매기). 캠핑장처럼 같은 채널(같은 Channel DO) 안의 따로 된 맵이에요.
// 위쪽이 뭍, 아래쪽이 바다예요. 버스는 맨 위 길을 따라 오른쪽 끝에서 들어와 오른쪽 위 정류장에 서요.
// 좌표는 바닷가 맵 안의 월드 픽셀 (마을·캠핑장과 따로, 16px 타일). 서버는 범위·좌석 판정에, 클라이언트는 그림·충돌·물때에 써요.
// 충돌 상자(seaColliders)도 여기 둬서 서버·클라이언트·테스트가 같은 상자를 봐요.
//
// 11/16 r11 사용자: 맵을 덜 길게(960 → 768) · 포구 시장을 빼고 · 별장 6을 뭍 곳곳에 흩어 · 선착장·방파제를 짧게
//  y=0    ┌── 소나무 언덕 ────────────────────────────────────────── [정류장] ┐
//  y=104  ╞══ 별장 2·4   버스 길 (오른쪽 끝에서 들어와요) ═══════════════════════╡
//         │ [별장 1]  [별장 3]  [부동산]  [별장 5]          그물   [별장 6]   │
//  y=316  ├─ 나무 산책로 ─────────────────────────────────────────────────────┤
//  y=342  │ 백사장 (선베드 두 줄·벤치)   ║선착장  [매점]          ║방파제·등대│
//  y=488  │ 갯벌 시작 · y=538 만조 물가 ~~║~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│
//  y=620  │ ~~ 간조 물가 (갯벌 위 60%만 드러나요) ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~│
//  y=708  └ 먼바다 (헤엄·잠수) ──────────────── 유령선 자리 · 낚싯배 ──────────┘

/** 바닷가 전체 이름 (표지판·첫 안내) */
export const SEA_TITLE = "달물결 포구";
export const SEA_TITLE_EN = "Moonwave Harbor";

// 11/16 r12 사용자: 큰 모니터에서 가장 멀리 보면 양옆이 비어요 → 동쪽(오른쪽)으로 넓혀요 (기존 좌표는 그대로, 새 땅엔 갯바위·야자수 만)
export const SEA_COLS = 110;
// 11/16 r12 사용자: 큰 모니터(2560×1440)에서도 멀리 볼 수 있게 맨 아래에 먼바다 띠만 더해요 (뭍·갯벌·물때 선은 그대로)
export const SEA_ROWS = 60; // 11/16 r11: 60 → 48 (덜 길게), r12: 아래 먼바다 192px 더해 다시 60
export const SEA_WIDTH = SEA_COLS * 16; // 1760
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
 * 7 = 11/16 돗자리를 빼고 앞줄 선베드 10 (모두 22), 선베드는 막혀요 (누우면 올라가고 일어나면 발치로)
 * 8 = 11/16 r11 맵 높이 960 → 768 (뭍·갯벌을 줄임), 포구 시장 뺌, 별장 6을 뭍 곳곳에, 선착장·방파제를 짧게 (등대가 가까워요)
 * 9 = 11/16 r12 매점 옆 피크닉 탁자 둘·자판기, 해변 모닥불(통나무 넷), 별장 사이 정원 벤치 둘, 해먹,
 *     선착장 끝 데크를 넓히고 끝마다 걸터앉는 자리 셋 (낚시 자리·유령선 자리도 옮김),
 *     맵 너비 1280 → 1760 (동쪽으로 넓힘 — 서쪽 좌표는 그대로)
 * 10 = 11/16 r12 맵 높이 768 → 960 (맨 아래 먼바다 띠만 더함 — 다른 좌표는 그대로)
 * 11 = 11/16 r13 방파제를 60px 바다 쪽으로 (끝 데크·등대·걸터앉기), 낚싯배 뺌, 튜브·제트스키
 * 12 = 11/16 r14 모든 것을 가운데로 (x +240 — 양쪽 바깥 띠가 같아요), 동쪽 백사장 선베드 두 벌·벤치, 서쪽 바위 해안
 * 13 = 11/16 r14 제트스키 부잔교, 모닥불을 동쪽 빈 모래로, r15 정류장·버스 길을 동쪽 끝 가까이로 (+280)
 * 14 = 11/16 r15 선착장을 길게 (끝 데크는 걸터앉기만), 서쪽 낚시 가지(낚시 자리 둘), 넓은 부잔교 다리, 유령선 자리 서남쪽으로,
 *      데크 가장자리 빙 둘러 난간 (물로 걸어 내려가지 못해요)
 */
export const SEA_MAP_VERSION = 14;

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
// 11/16 r15 사용자: 정류장을 동쪽 끝 가까이로 → 버스 길도 짧게 (돌림 마당은 정류장 120px 서쪽)
export const SEA_ROAD = { x: 1440, y: 104, w: SEA_WIDTH - 1440, h: 42 } as const;
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
export const SEA_BOARDWALK = { x: 0, y: 316, w: SEA_WIDTH, h: 26 } as const;
/** 마른 백사장 위쪽 끝 (산책로 아래) */
export const SEA_SAND_Y0 = SEA_BOARDWALK.y + SEA_BOARDWALK.h;
/** 갯벌이 시작하는 줄 = 만조 물가 (물이 여기까지 차요). 이 위 백사장은 늘 말라 있어요 */
export const SEA_FLAT_Y0 = 488;
/** 먼바다가 시작하는 줄 (이 아래는 늘 물 — 11/16부터 헤엄치고 잠수할 수 있어요, 맵 아래 끝·배만 막아요) */
export const SEA_DEEP_Y = 708;

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
/** 11/16 만조 물가를 갯벌 끝보다 50px 아래로 (보통 파도는 앞줄 선베드 발치까지, 드문 큰 파도만 선베드 둘레를 적셔요) */
export const TIDE_HIGH_Y = SEA_FLAT_Y0 + 50;
/** 11/16 사용자 "간조에 바다가 거의 안 보여요" → 갯벌 위쪽 60%쯤만 드러나고 아래 40%와 먼바다는 늘 물이에요 (r11 맵을 줄여 갯벌 220px 중 132px) */
export const TIDE_LOW_Y = SEA_FLAT_Y0 + 132;
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
export type SeaZoneId = "busStop" | "realty" | "cottages" | "beach" | "flat" | "pier" | "breakwater" | "rocks";
export type SeaZone = { id: SeaZoneId; name: string } & Rect;
export const SEA_ZONES: readonly SeaZone[] = [
  { id: "busStop", name: "버스 정류장", x: 1470, y: 30, w: 200, h: 110 }, // SEA_BUS_STOP.x − 90 (아래에서 정해요)
  { id: "realty", name: "포구 부동산", x: 786, y: 196, w: 132, h: 112 },
  { id: "cottages", name: "별장", x: 264, y: 64, w: 900, h: 236 },
  { id: "beach", name: "백사장", x: 0, y: SEA_SAND_Y0, w: SEA_WIDTH, h: SEA_FLAT_Y0 - SEA_SAND_Y0 },
  { id: "flat", name: "갯벌", x: 480, y: SEA_FLAT_Y0, w: 900, h: TIDE_LOW_Y - SEA_FLAT_Y0 },
  { id: "pier", name: "선착장", x: 760, y: 468, w: 200, h: 296 },
  { id: "breakwater", name: "방파제", x: 1380, y: 468, w: 88, h: 244 },
  { id: "rocks", name: "갯바위", x: 264, y: 506, w: 220, h: 180 },
];

// ── 버스 정류장 (오른쪽 위) ── 지붕 받침 가운데. 지붕 아래 벤치(pB), 오른쪽에 노선 팻말, 왼쪽에 시간표.
// 정류장 앞 보도 → 그 아래 버스 길. 11/16 오른쪽 끝(1150)에선 화면 오른쪽 위 미니맵에 가려서 조금 왼쪽(1040)으로 옮겼어요
export const SEA_BUS_STOP = { x: 1560, y: 84 } as const;
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

// 11/16 r11 사용자: 포구 시장을 뺐어요 (바다 고기·갯것은 마을 어부 영감·수집가 유령에게 팔아요)

// ── 포구 부동산 (가운데) ── 별장 분양 사무소 (분양은 다음 차수). 문은 앞 가운데
export const SEA_REALTY = { x: 852, y: 300 } as const;
// 11/16 r16 사용자 "부동산이 다른 게임 같아요" → 마을 분양 사무소와 같은 크기·모양 (60 × 54)
export const SEA_REALTY_W = 60;
export const SEA_REALTY_H = 54;
export const SEA_REALTY_DOOR = { x: SEA_REALTY.x, y: SEA_REALTY.y + 8 } as const;

// ── 별장 터 6 ── 11/16 r11 사용자 "한 단지가 아니라 따로 떨어진 별장처럼": 뭍 곳곳에 흩어 놓았어요 (왼쪽 언덕·위쪽 풀밭·시장 자리·방파제 쪽).
// 터마다 크기·출입구 쪽·울타리(나무 울타리·밧줄·생울타리)가 다르고, 저마다 산책로로 내려가는 작은 길이 있어요. 바다 쪽 터는 작은 데크.
// 하우징 계산이 쉽게 모두 축에 맞춘 사각형이에요. 지금은 빈 터와 「분양 준비 중」 팻말만 (별장은 다음 차수)
/** 보통 터 크기 (터마다 조금씩 달라요 — SEA_LOTS 각 w·h) */
export const SEA_LOT_W = 136;
export const SEA_LOT_H = 86;
export type SeaLotGate = "s" | "e" | "w";
export type SeaLotFence = "picket" | "rope" | "hedge";
export type SeaLot = { n: number; gate: SeaLotGate; fence: SeaLotFence; deck: boolean } & Rect;
export const SEA_LOTS: readonly SeaLot[] = [
  { n: 1, x: 270, y: 156, w: 128, h: 84, gate: "s", fence: "picket", deck: true },
  { n: 2, x: 476, y: 70, w: 124, h: 80, gate: "s", fence: "rope", deck: false },
  { n: 3, x: 624, y: 196, w: 136, h: 84, gate: "s", fence: "hedge", deck: true },
  { n: 4, x: 952, y: 72, w: 140, h: 84, gate: "s", fence: "picket", deck: false },
  { n: 5, x: 1016, y: 204, w: 128, h: 86, gate: "s", fence: "hedge", deck: true },
  { n: 6, x: 1372, y: 188, w: 120, h: 84, gate: "w", fence: "rope", deck: false },
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
/** 11/16 r11 위쪽 별장(2·4)으로 올라가는 풀밭 오솔길 (산책로에서) · 디딤돌 골목 (별장 1 → 3) */
export const SEA_LOT_LANE: readonly Pt[] = [
  { x: 454, y: 318 },
  { x: 460, y: 240 },
  { x: 538, y: 168 },
];
export const SEA_LOT_BRANCH: readonly Pt[] = [
  { x: 336, y: 262 },
  { x: 460, y: 270 },
  { x: 570, y: 290 },
];
/** 별장 우편함 (위쪽 별장 오솔길 어귀) · 등불 기둥 둘 (위쪽 별장 2·4 앞) */
export const SEA_LOT_MAILBOX = { x: 476, y: 300 } as const;
export const SEA_LOT_LANTERNS: readonly Pt[] = [
  { x: 570, y: 166 },
  { x: 1040, y: 176 },
];

// ── 선착장 (가운데, 백사장 끝에서 먼바다까지) ── 나무 데크. 양옆은 난간이라 갯벌에서 오르내리지 못해요 (머리에서 올라요)
// 11/16 r11 사용자 "선착장·등대까지 너무 멀어요" → 짧게 (끝 데크는 간조 물가 바로 아래 — 늘 물 위)
// r15 사용자: 선착장을 더 길게 (끝 데크는 늘 깊은 물 — 걸터앉기만), 서쪽에 낚시 가지(ㄱ자), 동쪽엔 제트스키 부잔교
export const SEA_PIER = { x: 840, y: 468, w: 40, h: 268 } as const;
/** 선착장 끝 넓은 데크 (간조에도 물 위) */
// r12 사용자: 끝 데크를 넓혀 걸터앉는 자리 셋 (양옆은 낚시 자리)
export const SEA_PIER_END = { x: 812, y: 720, w: 96, h: 44 } as const;
/** 11/16 r15 선착장 서쪽 낚시 가지 (몸통에서 서쪽으로 뻗은 데크 — 남쪽 가장자리에 낚시 자리 둘) */
export const SEA_PIER_ARM = { x: 760, y: 636, w: 80, h: 28 } as const;
/**
 * 11/16 r14 사용자: 제트스키는 낚시 자리·걸터앉기와 떨어진 따로 뜬 부잔교에서 타고 내려요.
 * 선착장 몸통 동쪽에 짧은 다리(ramp)로 이어진 물에 뜬 발판 — 제트스키는 그 동쪽 깊은 물에 매어 둬요 (선착장 끝 데크와는 물길로 떨어져요)
 */
// r15 사용자: 다리는 둘이 나란히 걸을 만큼 넓게(36px), 부잔교는 그 아래로 길게 (제트스키는 늘 깊은 물)
export const SEA_PONTOON = { x: SEA_PIER.x + SEA_PIER.w + 52, y: 564, w: 32, h: 128 } as const;
export const SEA_PONTOON_RAMP = { x: SEA_PIER.x + SEA_PIER.w, y: 576, w: 52, h: 36 } as const;
/** 매점 (선착장 머리 오른쪽 백사장 — 술·음료·오징어구이) */
export const SEA_KIOSK = { x: 924, y: 428 } as const;
export const SEA_KIOSK_W = 56;
export const SEA_KIOSK_H = 56;
/** 묶여 있는 낚싯배 (선착장 끝 오른쪽, 늘 깊은 물 — 지금은 물결 따라 흔들리기만) */
// 11/16 r13 사용자: 선착장 끝 낚싯배(SEA_BOAT)는 뺐어요 (배 타기 계획도 접었어요). 그 자리에 제트스키를 매어 둬요
/** 빨간 부표 */
export const SEA_BUOYS: readonly Pt[] = [
  { x: 690, y: 700 }, // r15 유령선 자리·낚시 가지를 비켜서
  { x: 1020, y: 724 },
  { x: 1326, y: 730 },
  // 11/16 r12 아래로 넓힌 먼바다에 드문드문
  { x: 476, y: 884 },
  { x: 1140, y: 912 },
  { x: 96, y: 880 }, // r14 서쪽 먼바다
];

/**
 * 11/16 유령선이 대는 자리 (토요일 밤 행사 — 다음 차수). 선착장 끝 서쪽 깊은 물 (묶인 낚싯배 반대편).
 *  - ship = 배 그림 받침 가운데(용골 아래), w·h = 배 그림 크기 (160×90)
 *  - clear = 배가 들어올 빈 물 (부표·장식·물보라 자리를 두지 않아요)
 *  - gangway = 선착장 끝 데크 서쪽 가장자리의 건널판 자리 (다음 차수에 난간을 열어요). 토요일 장터는 이 둘레 선착장에
 */
export const SEA_GHOST_BERTH = {
  // r15 낚시 가지에 자리를 내주고 서남쪽 깊은 물로 (건널판은 길어진 끝 데크 서쪽 가장자리)
  ship: { x: 640, y: 812 },
  w: 160,
  h: 90,
  clear: { x: 550, y: 722, w: 178, h: 98 },
  gangway: { x: SEA_PIER_END.x + 4, y: SEA_PIER_END.y + 22 },
} as const;

// ── 방파제 (오른쪽) ── 백사장 끝에서 먼바다로. 양옆은 테트라포드라 막혀요. 끝 데크에 등대 (오르기·등불은 다음 차수)
// 11/16 r11 짧게: 방파제 몸통은 백사장 끝에서 조금만, 끝 데크(등대)는 간조 물가 근처 — 백사장에서 몇 걸음
// 11/16 r13 사용자 "살짝 더 바다쪽으로": 둑을 60px 늘려 끝 데크·등대가 간조 물가 바깥(늘 물인 곳)에 서요
export const SEA_BREAKWATER = { x: 1400, y: 468, w: 48, h: 156 } as const;
export const SEA_BREAKWATER_TIP = { x: 1376, y: 616, w: 96, h: 92 } as const;
/** 걸어 다니는 데크 (선착장 몸통·끝 데크·낚시 가지·부잔교·다리·방파제·끝 데크) */
export const SEA_DECKS: readonly Rect[] = [SEA_PIER, SEA_PIER_END, SEA_PIER_ARM, SEA_PONTOON, SEA_PONTOON_RAMP, SEA_BREAKWATER, SEA_BREAKWATER_TIP];
/** 등대 받침 가운데 (끝 데크 뒤쪽) */
export const SEA_LIGHTHOUSE = { x: 1424, y: 664 } as const;
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
// 11/16 r11 갯벌을 줄이며 y를 갯벌 높이에 맞춰 줄였어요 (크기는 그대로)
export const SEA_ROCKS: readonly SeaRock[] = [
  { x: 322, y: 540, rx: 46, ry: 22 },
  { x: 390, y: 590, rx: 34, ry: 17 },
  { x: 302, y: 630, rx: 30, ry: 15 },
  { x: 454, y: 662, rx: 26, ry: 13 },
  { x: 280, y: 684, rx: 24, ry: 12 },
  // 11/16 별장 언덕 아래 물가
  { x: 276, y: 507, rx: 20, ry: 10 },
  { x: 360, y: 507, rx: 14, ry: 7, small: true },
  { x: 488, y: 516, rx: 12, ry: 6, small: true },
  // 11/16 방파제 쪽 바위 곶
  { x: 1332, y: 514, rx: 28, ry: 14 },
  { x: 1352, y: 552, rx: 22, ry: 11 },
  { x: 1304, y: 552, rx: 16, ry: 8, small: true },
  { x: 1338, y: 592, rx: 20, ry: 10 },
  { x: 1368, y: 504, rx: 12, ry: 6, small: true },
  // 11/16 물가 사이사이
  { x: 780, y: 518, rx: 12, ry: 6, small: true },
  { x: 1036, y: 518, rx: 18, ry: 9 },
  { x: 1174, y: 563, rx: 20, ry: 10 },
  { x: 1004, y: 596, rx: 10, ry: 5, small: true }, // r15 부잔교 다리 자리를 비켜서
  // 11/16 r12 동쪽으로 넓힌 땅: 방파제 너머 갯바위 해안
  { x: 1546, y: 514, rx: 26, ry: 13 },
  { x: 1592, y: 552, rx: 32, ry: 16 },
  { x: 1536, y: 590, rx: 14, ry: 7, small: true },
  { x: 1638, y: 604, rx: 24, ry: 12 },
  { x: 1680, y: 528, rx: 16, ry: 8, small: true },
  { x: 1580, y: 660, rx: 26, ry: 13 },
  { x: 1692, y: 676, rx: 18, ry: 9 },
  // 11/16 r14 가운데로 옮기며 생긴 서쪽 바깥 띠: 바위 해안 (작은 만 둘레)
  { x: 54, y: 526, rx: 28, ry: 14 },
  { x: 160, y: 520, rx: 14, ry: 7, small: true },
  { x: 36, y: 590, rx: 22, ry: 11 },
  { x: 214, y: 572, rx: 12, ry: 6, small: true },
  { x: 60, y: 668, rx: 26, ry: 13 },
  { x: 190, y: 700, rx: 18, ry: 9 },
];
export const SEA_FOOTBATH = { x: 436, y: 546 } as const;
/** 간조에도 남는 물웅덩이 (갯벌 위, 장식 — 걸을 수 있어요) */
export const SEA_TIDE_POOLS: readonly { x: number; y: number; rx: number; ry: number }[] = [
  { x: 454, y: 556, rx: 22, ry: 9 },
  { x: 620, y: 630, rx: 42, ry: 14 },
  { x: 1100, y: 656, rx: 54, ry: 16 },
  { x: 1250, y: 546, rx: 30, ry: 10 },
  { x: 710, y: 572, rx: 24, ry: 8 },
  // 11/16 새 바위 둘레 웅덩이
  { x: 1292, y: 580, rx: 16, ry: 6 },
  { x: 306, y: 526, rx: 14, ry: 5 },
  { x: 1052, y: 532, rx: 12, ry: 4 },
  // r12 동쪽 갯바위 둘레 · 작은 만
  { x: 1620, y: 632, rx: 18, ry: 6 },
  { x: 150, y: 600, rx: 36, ry: 11 }, // r14 서쪽 작은 만
];

// ── 다음 차수 자리 (쉴거리·갯벌 캐기·모래성 등). 지금은 그리기만 하거나 비워 둬요 ──
/** 쉴거리 자리 (사용자 확정 배치). 앉기·장면 전환은 다음 차수 */
/** 11/16 백사장 선베드 한 벌(선베드·파라솔·선베드) 가운데 x — 선착장 머리·매점·모닥불·해먹 자리를 비켜서 */
// 11/16 r14 사용자: 넓힌 맵 가운데로 옮기고(+240) 동쪽 백사장에도 한 벌 둘 더 (백사장 전체에 고르게)
export const SEA_BEACH_UNITS: readonly number[] = [400, 520, 640, 1020, 1140, 1260, 1520, 1640];
/** 선베드 받침 y (머리는 위, 발은 바다 쪽) */
export const SEA_LOUNGER_Y = 428;
/** 11/16 앞줄 선베드 받침 y (뒷줄 발치에서 8px 띄워 — 갯벌 바로 위) */
export const SEA_LOUNGER_FRONT_Y = 480;
/** 선베드 막는 상자 (받침 x·y 기준 — 등받이부터 발치 위까지, 눕기 안내는 발치 쪽에서) */
export function seaLoungerCollider(l: Pt): { x: number; y: number; w: number; h: number } {
  return { x: l.x - 10, y: l.y - 40, w: 20, h: 37 };
}
/** 11/16 r12 매점 왼쪽 빈 백사장의 피크닉 탁자 둘 (탁자 가운데) */
export const SEA_PICNIC_TABLES: readonly Pt[] = [
  { x: 796, y: 380 },
  { x: 796, y: 444 },
];
/** 11/16 r12 해변 모닥불 (불 받침 가운데) · 둘레 통나무 넷 (자리 앵커, 불을 봐요) */
// r14 사용자 "선베드에 너무 붙었어요" → 동쪽 백사장 빈 모래 (양옆 선베드 한 벌과 60px 넘게 떨어져요)
export const SEA_BONFIRE = { id: "fireSea", x: 1400, y: 404 } as const;
export const SEA_BONFIRE_LOGS: readonly { x: number; y: number; facing: DirId }[] = [
  { x: SEA_BONFIRE.x, y: SEA_BONFIRE.y - 18, facing: DIR.down },
  { x: SEA_BONFIRE.x - 22, y: SEA_BONFIRE.y + 2, facing: DIR.right },
  { x: SEA_BONFIRE.x + 22, y: SEA_BONFIRE.y + 2, facing: DIR.left },
  { x: SEA_BONFIRE.x, y: SEA_BONFIRE.y + 22, facing: DIR.up },
];
/** 11/16 r12 별장 사이 정원 벤치 둘 (옆에 등불) */
export const SEA_GARDEN_BENCHES: readonly Pt[] = [
  { x: 856, y: 178 },
  { x: 1216, y: 190 },
];
/** 바다 보기 벤치 x (선베드 한 벌 사이 틈) */
export const SEA_BEACH_BENCH_X: readonly number[] = [460, 580, 1080, 1200, 1580];
export const SEA_SPOTS = {
  /** 바다 보기 벤치 4 — 11/16 사용자: 선베드 줄 뒤(산책로 바로 아래)로, 선베드 사이 틈에서 바다를 봐요 */
  benches: SEA_BEACH_BENCH_X.map((x) => ({ x, y: SEA_SAND_Y0 + 18, facing: DIR.down })),
  /** 선베드 12 — 11/16 사용자 "리조트 해변처럼": 선베드·파라솔·선베드 한 벌을 백사장에 나란히 (바다를 봐요). 받침 y */
  loungers: [
    ...SEA_BEACH_UNITS.flatMap((c) => [
      { x: c - 24, y: SEA_LOUNGER_Y },
      { x: c + 24, y: SEA_LOUNGER_Y },
    ]),
    // 11/16 사용자 "돗자리 빼고 앞 백사장도 선베드로": 앞줄은 뒷줄 사이 틈마다 (뒷줄 선베드 발치로 가는 길이 남아요)
    ...SEA_BEACH_UNITS.flatMap((c, i) => [c, ...(SEA_BEACH_UNITS[i + 1] !== undefined && SEA_BEACH_UNITS[i + 1] - c <= 120 ? [c + 60] : [])]).map((x) => ({ x, y: SEA_LOUNGER_FRONT_Y })),
  ],
  /** 파라솔 6 (선베드 한 벌 가운데 — 갓이 두 선베드 머리 쪽을 덮어요) */
  parasols: SEA_BEACH_UNITS.map((c) => ({ x: c, y: SEA_LOUNGER_Y - 12 })),
  /** 야자수 해먹 (나무 둘 사이) · 해변 그네 */
  hammock: { x: 320, y: 374 },
  swing: { x: 1336, y: 384 },
  /** 해변 모닥불 (r12 진짜 모닥불 — SEA_BONFIRE) */
  bonfire: { x: SEA_BONFIRE.x, y: SEA_BONFIRE.y },
  /** 모래성 자리 3 (갯벌 바로 앞, 만조 앞뒤에 무너져요) */
  sandcastles: [
    { x: 584, y: 507 },
    { x: 1000, y: 507 },
    { x: 1220, y: 503 },
  ],
  /** 족욕 바위 · 선착장 끝 걸터앉기 · 방파제 끝 걸터앉기 · 등대 문 */
  footbath: SEA_FOOTBATH,
  pierEnd: { x: SEA_PIER_END.x + SEA_PIER_END.w / 2, y: SEA_PIER_END.y + SEA_PIER_END.h - 4, facing: DIR.down },
  breakwaterEnd: { x: SEA_BREAKWATER_TIP.x + 24, y: SEA_BREAKWATER_TIP.y + SEA_BREAKWATER_TIP.h - 6, facing: DIR.down },
  lighthouseDoor: SEA_LIGHTHOUSE_DOOR,
} as const;
/**
 * 11/16 갯바위 낚시 자리 (마을 낚시와 같은 1인 자리 — SPOT_KINDS.fish, 서버 좌석). 큰 갯바위 앞 (바다 쪽)과 선착장 끝 데크.
 * 물 종류는 바다(sea) — 11/16 2차: 바닷물고기 10종이 잡혀요 (web lib/forage/catalog SEA_FISH).
 * id = "f_x_y" (마을·캠핑장 낚시 자리 id와 겹치지 않아요 — sea.test가 봐요). 앉아 있는 동안은 물이 차도 그대로 앉아 있어요
 */
const rockSpot = (i: number, dx = 0): FishingSpot => {
  const r = SEA_ROCKS[i];
  const x = Math.round(r.x + dx);
  // 바위 그림 밑동 바로 앞 (사람이 바위 앞에 그려지고, 일어서도 바위에 걸리지 않게)
  const y = Math.round(r.y + r.ry * 0.7 + 4);
  return { id: `f_${x}_${y}`, water: "sea", x, y, facing: DIR.down };
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
  // r15 선착장 서쪽 낚시 가지 남쪽 가장자리에 나란히 둘 (바다를 보고 던져요) — 끝 데크 걸터앉기·부잔교와 멀리
  { id: "f_782_660", water: "sea", x: 782, y: 660, facing: DIR.down },
  { id: "f_814_660", water: "sea", x: 814, y: 660, facing: DIR.down },
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
// 11/16 갯벌이 열려 있는 동안(물 높이 0.25 아래 → 물가 599 아래) 늘 드러나도록 (r11 맵을 줄이며 갯벌 높이에 맞춰 y를 줄였어요)
export const SEA_DIG_HOLES: readonly Pt[] = [
  { x: 540, y: 540 },
  { x: 620, y: 572 },
  { x: 500, y: 566 },
  { x: 710, y: 527 },
  { x: 960, y: 540 },
  { x: 1060, y: 566 },
  { x: 1120, y: 533 },
  { x: 1220, y: 546 },
  { x: 930, y: 572 },
  { x: 680, y: 559 },
  { x: 1270, y: 572 },
  { x: 780, y: 576 },
];
/** 갈매기가 내려앉는 말뚝 (선착장 양옆·방파제 위) */
export const SEA_GULL_PERCHES: readonly Pt[] = [
  { x: SEA_PIER.x - 4, y: 520 },
  { x: SEA_PIER.x + SEA_PIER.w + 4, y: 576 },
  { x: SEA_PIER.x - 4, y: 630 },
  { x: SEA_BREAKWATER.x + 6, y: 500 },
  { x: SEA_BREAKWATER.x + SEA_BREAKWATER.w - 6, y: 540 },
  { x: SEA_BREAKWATER_TIP.x + 10, y: SEA_BREAKWATER_TIP.y + 30 },
];

// ── 앉는 자리 (좌석 판정은 서버) ── id는 마을·캠핑장 좌석과 겹치지 않게 모두 "p"로 시작해요
/** 11/16 선착장 끝·방파제 끝 걸터앉기 (다리를 데크 끝 밖으로 늘어뜨려요 — 그림·충돌 없는 자리) */
export const SEA_EDGE_SEATS: readonly string[] = ["pE1", "pE2"];
export const SEA_FURNITURE: readonly Furniture[] = [
  // 정류장 지붕 아래 벤치
  { id: "pB", kind: "bench", x: SEA_BUS_STOP.x, y: SEA_BUS_STOP.y - 8, facing: DIR.down, seatOffsets: [-12, 12] },
  // 11/16 오두막 단지 함께 쓰는 벤치 (5·6번 터 사이 앞, 바다 쪽을 봐요). 두 자리 간격은 캠핑장 벤치처럼 20 (울타리와 겹치지 않게 조금 아래로)
  // r11 별장 사이 오솔길 어귀로
  { id: "pL", kind: "bench", x: 540, y: 304, facing: DIR.down, seatOffsets: [-10, 10] },
  // 11/16 백사장 바다 보기 벤치 4 (바다를 봐요)
  ...SEA_SPOTS.benches.map((b, i): Furniture => ({ id: `pS${i + 1}`, kind: "bench", x: b.x, y: b.y, facing: DIR.down, seatOffsets: [-10, 10] })),
  // 11/16 끝 걸터앉기 (선착장 끝 가운데 · 방파제 끝 데크)
  // r12 사용자: 끝마다 나란히 셋 (방석을 깔아 눈에 띄게 — 그림은 SeaMap)
  { id: "pE1", kind: "chair", x: SEA_SPOTS.pierEnd.x, y: SEA_SPOTS.pierEnd.y, facing: DIR.down, seatOffsets: [-15, 0, 15] },
  { id: "pE2", kind: "chair", x: SEA_SPOTS.breakwaterEnd.x, y: SEA_SPOTS.breakwaterEnd.y, facing: DIR.down, seatOffsets: [-15, 0, 15] },
  // 11/16 r12 매점 옆 피크닉 탁자 (넷이 앉아요 — 탁자 북쪽 벤치는 바다를, 남쪽 벤치는 탁자를 보고 등을 바다로)
  ...SEA_PICNIC_TABLES.flatMap((t, i): Furniture[] => [
    { id: `pT${i + 1}n`, kind: "bench", x: t.x, y: t.y - 10, facing: DIR.down, seatOffsets: [-9, 9] },
    { id: `pT${i + 1}s`, kind: "bench", x: t.x, y: t.y + 12, facing: DIR.up, seatOffsets: [-9, 9] },
  ]),
  // 11/16 r12 해변 모닥불 둘레 통나무 넷 (불을 봐요)
  ...SEA_BONFIRE_LOGS.map((l, i): Furniture => ({ id: `pF${i + 1}`, kind: "chair", x: l.x, y: l.y, facing: l.facing, seatOffsets: [0], campfire: SEA_BONFIRE.id })),
  // 11/16 r12 별장 사이 정원 벤치 둘 (등불 옆)
  ...SEA_GARDEN_BENCHES.map((b, i): Furniture => ({ id: `pG${i + 1}`, kind: "bench", x: b.x, y: b.y, facing: DIR.down, seatOffsets: [-10, 10] })),
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
    // 피크닉 탁자 북쪽 벤치·모닥불 북쪽 통나무는 앞(남쪽)이 탁자·불이라 뒤(북쪽)로 일어서요
    ...((f.id.startsWith("pT") && f.id.endsWith("n")) || (f.campfire && f.facing === DIR.down) ? { standDy: -12 } : {}),
  })),
);

/**
 * 11/16 쉴거리 자리 (의자가 아닌 자리): 선베드(눕기) · 파라솔 돗자리(넷이 둘러앉기) · 돗자리(둘).
 * 서버 좌석(seaSlots)으로 한 자리에 한 명. 상태: 선베드 = lie (누운 자세), 돗자리 = sitGround (바닥 앉기)
 *  - group = 같은 선베드·돗자리 (같이 앉은 사람을 바다 장면에 뒷모습으로 그려요)
 *  - x·y = 자리 발 위치, facing = 앉아서 보는 쪽 (모두 바다 쪽 아래)
 */
export type SeaRestKind = "lounger" | "parasol" | "mat" | "hammock";
export type SeaRestSeat = { id: string; group: string; kind: SeaRestKind; x: number; y: number; facing: DirId; state: StateId };
/** 11/16 돗자리 (사용자: 모두 빼고 앞줄 선베드로 — 자리 목록은 남겨 둬요, 지금은 비어 있어요) */
export const SEA_MATS: readonly Pt[] = [];
/** 선베드에 누운 사람 발 위치 (선베드 그림 받침에서 위로) */
export const SEA_LOUNGER_LIE_DY = -8;
export const SEA_REST_SEATS: readonly SeaRestSeat[] = [
  ...SEA_SPOTS.loungers.map((l, i): SeaRestSeat => ({ id: `pZ${i + 1}`, group: `pZ${i + 1}`, kind: "lounger", x: l.x, y: l.y + SEA_LOUNGER_LIE_DY, facing: DIR.down, state: STATE.lie })),
  // 11/16 파라솔 돗자리는 선베드 한 벌(파라솔 아래 선베드 둘)로 바꿨어요
  ...SEA_MATS.flatMap((m, i) =>
    [-10, 10].map((dx, k): SeaRestSeat => ({ id: `pM${i + 1}-${k}`, group: `pM${i + 1}`, kind: "mat", x: m.x + dx, y: m.y + 2, facing: DIR.down, state: STATE.sitGround })),
  ),
  // 11/16 r12 야자수 둘 사이 해먹 (누워서 흔들흔들 — 마을 해먹과 같은 자세)
  { id: "pH", group: "pH", kind: "hammock", x: SEA_SPOTS.hammock.x, y: SEA_SPOTS.hammock.y, facing: DIR.down, state: STATE.hammock },
];
const seaRestMap = new Map(SEA_REST_SEATS.map((s) => [s.id, s]));
export function seaRestSeatById(id: string): SeaRestSeat | undefined {
  return seaRestMap.get(id);
}

/** 11/16 바다 보기 장면 종류 (앉은 자리마다) */
// 11/16 r15 해먹은 따로 (해먹에 누워 보는 장면)
export type SeaViewKind = "beach" | "mat" | "parasol" | "lounger" | "hammock" | "pier" | "breakwater";
/** 이 자리에 앉아 있으면 볼 수 있는 바다 장면 (null = 바다 보기 없음 — 정류장·오두막 벤치) */
export function seaViewOfSeat(seatId: string): SeaViewKind | null {
  const r = seaRestMap.get(seatId);
  // 11/16 r15 해먹은 해먹 장면 (선베드 장면 말고)
  if (r) return r.kind;
  if (seatId.startsWith("pE1")) return "pier";
  if (seatId.startsWith("pE2")) return "breakwater";
  if (seatId.startsWith("pS")) return "beach";
  return null;
}
/** 11/16 r12 해변 모닥불 (마을 Campfire 꼴 — 불멍 구도·소리를 같이 써요) */
export const SEA_CAMPFIRE: Campfire = { id: SEA_BONFIRE.id, x: SEA_BONFIRE.x, y: SEA_BONFIRE.y };
/** 이 바닷가 좌석이 모닥불 둘레 통나무면 그 모닥불 (불이 켜져 있는지는 클라이언트가 시간으로 봐요) */
export function seaCampfireOfSeat(seatId: string): Campfire | null {
  return /^pF\d$/.test(seatId) ? SEA_CAMPFIRE : null;
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
  return [];
}

/** 선착장·방파제 난간 (머리 아래부터 양옆을 막아요 — 갯벌에서 올라타지 못해요) */
/** 난간 칸 크기 */
export const SEA_RAIL_CELL = 4;
/**
 * 11/16 r15 사용자: 데크 가장자리 어디서도 물로 걸어 내려가지 못하게 (물에서 올라오지도 못하게) — 데크 합집합 둘레를 4px 칸으로 빙 둘러 막아요.
 * 백사장(갯벌 위쪽, SEA_FLAT_Y0 위) 쪽은 열어 둬서 선착장·방파제 머리로 걸어 올라가요. 같은 줄의 칸은 이어 붙여 상자 수를 줄여요
 */
function railColliders(): Rect[] {
  const C = SEA_RAIL_CELL;
  const inDeck = (cx: number, cy: number) => {
    const x = cx * C + C / 2;
    const y = cy * C + C / 2;
    return SEA_DECKS.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  };
  const rails = new Set<string>();
  for (const r of SEA_DECKS)
    for (let cy = Math.floor(r.y / C); cy < Math.ceil((r.y + r.h) / C); cy++)
      for (let cx = Math.floor(r.x / C); cx < Math.ceil((r.x + r.w) / C); cx++) {
        if (!inDeck(cx, cy)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (inDeck(nx, ny) || ny * C < SEA_FLAT_Y0) continue;
          rails.add(`${nx},${ny}`);
        }
      }
  const cells = [...rails].map((k) => k.split(",").map(Number) as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const out: Rect[] = [];
  for (const [cx, cy] of cells) {
    const last = out[out.length - 1];
    if (last && last.y === cy * C && last.x + last.w === cx * C) last.w += C;
    else out.push({ x: cx * C, y: cy * C, w: C, h: C });
  }
  return out;
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
    // 부동산·매점: 11/16 r14 사용자 "부동산 문 앞에서 건물 안으로 걸어 들어가요" → 몸통 전체를 막아요 (앞벽 밑동까지, 뒤는 지붕 밑까지).
    // 문은 안내(E)만 — 문 앞(SEA_REALTY_DOOR)에서 눌러요
    { x: SEA_REALTY.x - SEA_REALTY_W / 2 + 2, y: SEA_REALTY.y - 30, w: SEA_REALTY_W - 4, h: 30 },
    { x: SEA_KIOSK.x - SEA_KIOSK_W / 2 + 2, y: SEA_KIOSK.y - 40, w: SEA_KIOSK_W - 4, h: 40 },
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
  return SEA_DECKS.some(inR);
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

// ── 11/16 r13 바다 놀거리: 튜브(헤엄치다 올라타 노 젓기) · 제트스키(선착장 끝에 매어 둠) ──
// 서버 좌석은 조각배처럼 mobile 자리(상태 boat)라 탄 사람의 MOVE를 따라가요. 탄 사람이 없는 튜브는 모두의 화면에서
// 같은 시계로 정해진 길(seaTubeDriftAt)을 떠다니고, 제트스키는 매어 둔 자리에 있어요.
export type SeaRideKind = "tube" | "jetski";
export type SeaRide = { id: string; kind: SeaRideKind; n: number; x: number; y: number };
/** 튜브 다섯 (떠다니는 길의 가운데 — 간조 물가보다 넉넉히 바깥) */
export const SEA_TUBES: readonly Pt[] = [
  { x: 560, y: 700 },
  { x: 1080, y: 704 },
  { x: 1240, y: 764 },
  { x: 120, y: 760 }, // r14 서쪽 작은 만
  { x: 460, y: 804 },
];
/** 제트스키 둘 (r14 부잔교 동쪽 깊은 물에 위아래로 매어 둬요. 부잔교 동쪽 가장자리에서 타고 내려요) */
export const SEA_JETSKIS: readonly Pt[] = [
  { x: SEA_PONTOON.x + SEA_PONTOON.w + 22, y: SEA_PONTOON.y + 88 },
  { x: SEA_PONTOON.x + SEA_PONTOON.w + 22, y: SEA_PONTOON.y + 118 },
];
/** 제트스키에서 내려서는 자리 (매어 둔 자리 옆 부잔교 위) */
export function seaJetDismount(j: Pt): Pt {
  const P = SEA_PONTOON;
  return { x: P.x + P.w - 8, y: Math.max(P.y + 8, Math.min(P.y + P.h - 8, j.y)) };
}
export const SEA_RIDES: readonly SeaRide[] = [
  ...SEA_TUBES.map((p, i): SeaRide => ({ id: `pU${i + 1}`, kind: "tube", n: i, x: p.x, y: p.y })),
  ...SEA_JETSKIS.map((p, i): SeaRide => ({ id: `pJ${i + 1}`, kind: "jetski", n: i, x: p.x, y: p.y })),
];
const seaRideMap = new Map(SEA_RIDES.map((r) => [r.id, r]));
export function seaRideById(id: string): SeaRide | undefined {
  return seaRideMap.get(id);
}
/** 튜브 노 젓기 (헤엄 WALK보다 느리게) · 제트스키 (조각배 노 젓기 46의 두 배) — 둘 다 서버 속도 검증(MAX_VALID_SPEED) 안 */
export const SEA_TUBE_SPEED = 24;
export const SEA_JETSKI_SPEED = 92;
/** 튜브가 떠다니는 폭 (가운데에서 좌우·위아래) */
export const SEA_TUBE_DRIFT = { ax: 40, ay: 12 } as const;
/** 튜브는 바다 어디서든 올라타요 (서버는 거리만 넉넉히 봐요) · 제트스키는 매어 둔 자리 가까이에서만 */
export const SEA_TUBE_RADIUS = 2400;
export const SEA_JETSKI_RADIUS = 48;
/** 제트스키가 다닐 수 있는 가장 얕은 줄 (간조 물가보다 바깥 — 여기보다 물가 쪽은 「여기는 너무 얕아요」) */
export const SEA_JET_MIN_Y = TIDE_LOW_Y + 24;
export const SEA_JET_SHALLOW_MSG = "여기는 너무 얕아요";

/** (x,y)가 선착장·방파제·낚싯배·갯바위에 닿는지 (pad = 놀거리 몸 반 폭) */
export function seaRideBlocked(x: number, y: number, pad = 8): boolean {
  const inR = (r: Rect) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  if (SEA_DECKS.some(inR)) return true;
  for (const r of SEA_ROCKS) {
    const dx = (x - r.x) / (r.rx + pad);
    const dy = (y - r.y) / (r.ry + pad * 0.6);
    if (dx * dx + dy * dy < 1) return true;
  }
  return false;
}
/** 제트스키가 갈 수 있는 물인지: 깊은 물(SEA_JET_MIN_Y 바깥)·맵 안·부딪히는 것 없음 */
export function seaJetWater(x: number, y: number): boolean {
  return y >= SEA_JET_MIN_Y && y <= SEA_HEIGHT - 16 && x >= 16 && x <= SEA_WIDTH - 16 && !seaRideBlocked(x, y, 10);
}
/** 튜브가 뜰 수 있는 물인지 (지금 물 높이에서 물속·부딪히는 것 없음) */
export function seaTubeWater(x: number, y: number, level: number): boolean {
  return seaWet(x, y, level, 14) && y <= SEA_HEIGHT - 12 && x >= 12 && x <= SEA_WIDTH - 12 && !seaRideBlocked(x, y, 9);
}
/** 탄 사람이 없는 튜브 i의 자리 (t = 서버 시계 ms, level = 지금 물 높이). 모두의 화면에서 같아요 */
export function seaTubeDriftAt(i: number, t: number, level: number): Pt {
  const h = SEA_TUBES[i];
  const ph = i * 1.7;
  const TAU = Math.PI * 2;
  const x = h.x + Math.sin((t / 23_000) * TAU + ph) * SEA_TUBE_DRIFT.ax + Math.sin((t / 9_100) * TAU + ph * 2) * 4;
  const y = Math.max(h.y + Math.sin((t / 31_000) * TAU + ph * 1.3) * SEA_TUBE_DRIFT.ay, tideLineY(level) + 26);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}
