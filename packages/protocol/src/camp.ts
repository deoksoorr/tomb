import { DIR, STATE, type DirId } from "./types";
import { MAP_HEIGHT, MAP_WIDTH, SPOT_KINDS, fishingWaterOf, seatSlot, spotKindOfState, type FishingSpot, type Campfire, type Furniture, type Seat, type SeatSlot } from "./world";
import { SEA_ARRIVE, SEA_FISHING_SPOTS, SEA_JETSKI_RADIUS, SEA_KAYAK_RADIUS, SEA_KAYAK_SEATS, SEA_REST_SEATS, SEA_RIDES, SEA_HEIGHT, SEA_SEATS, SEA_TUBE_RADIUS, SEA_WIDTH, seaFishingSpotById } from "./sea";

// 11/15 두 번째 맵 「언젠가 캠핑장 · Someday Camp」 (1차: 맵·버스·앉기·NPC 말 걸기).
// "언젠가 캠핑 가야지" 하고 장비만 사 두고 못 간 그곳 — 늦가을 숲, 계곡, 캠프파이어 광장, 번호 붙은 빈 데크 24자리.
//
// 마을과 같은 채널(같은 Channel DO) 안에서 사람마다 지금 있는 맵(map)을 따로 둔다.
//  - 버스를 타면 연결은 그대로, C2S { t: "map", m: "camp", x, y } 한 번 → 서버가 옛 맵 사람들에게 leave, 새 맵 사람들에게 join,
//    본인에게 { t: "mapped", m, peers, seats }를 보낸다. 위치(SNAPSHOT)·말풍선·채팅·몸짓은 같은 맵 사람끼리만.
//  - 채널 목록·인원·정원·확성기는 채널 전체 그대로.
//  - 옛 클라이언트는 맵을 모른다 → 언제나 마을. 서버가 캠핑장 사람을 옛 클라이언트에 보내지 않는다.
// 좌표는 캠핑장 맵 안의 월드 픽셀 (마을과 따로, 16px 타일). 서버는 좌석 판정·범위 검사에, 클라이언트는 그림·충돌에 쓴다.

// 11/16 세 번째 맵 「달물결 포구」("sea", protocol sea.ts)도 같은 규칙이에요. 마을 밖 맵(AwayMapId)은 입장 토큰 허락(camp·sea)이 있어야 가요.
export type MapId = "village" | "camp" | "sea";
/** 마을이 아닌 맵 (버스로 가는 곳). 와이어의 m·map 값은 이 둘 중 하나이거나 없어요(마을) */
export type AwayMapId = Exclude<MapId, "village">;
export const MAP_IDS: readonly MapId[] = ["village", "camp", "sea"];
export const isMapId = (v: unknown): v is MapId => v === "village" || v === "camp" || v === "sea";
export const isAwayMap = (v: unknown): v is AwayMapId => v === "camp" || v === "sea";
/** 맵 이름 (친구 위치 "3채널 캠핑장"처럼) */
export const MAP_NAME: Record<MapId, string> = { village: "마을", camp: "캠핑장", sea: "바닷가" };
/** 11/16 채팅 줄 맵 표시 (다른 맵에서 쓴 줄 앞에) */
export const MAP_TAG: Record<MapId, string> = { village: "[마을]", camp: "[캠핑장]", sea: "[바닷가]" };
/** 와이어 m 값 → 마을 밖 맵이면 그 맵, 아니면 없음 (마을) */
export const awayTag = (m: unknown): { m?: AwayMapId } => (isAwayMap(m) ? { m } : {});
/**
 * 11/17 채팅 줄을 쓴 곳 (chat·chatLog의 m): 마을 밖 맵 + 사냥터 "hunt" (사냥 중에도 채널 채팅을 쓴다 — 서버가 실내 장소 hunt로 붙인다).
 * 없으면 마을. 옛 클라이언트는 "hunt"를 모르니 맵 표시 없이(마을 줄처럼) 본다
 */
export type ChatPlace = AwayMapId | "hunt";
export const isChatPlace = (v: unknown): v is ChatPlace => isAwayMap(v) || v === "hunt";
/** 와이어 m 값 → 채팅 줄 장소 표시 (마을이면 없음) */
export const chatTagOf = (m: unknown): { m?: ChatPlace } => (isChatPlace(m) ? { m } : {});
/** 11/17 채팅 줄 장소 표시 (다른 곳에서 쓴 줄 앞에) — 맵 표시 + [사냥터] */
export const CHAT_PLACE_TAG: Record<MapId | "hunt", string> = { ...MAP_TAG, hunt: "[사냥터]" };
/** 캠핑장 전체 이름 (표지판·첫 안내) */
export const CAMP_TITLE = "언젠가 캠핑장";
export const CAMP_TITLE_EN = "Someday Camp";

export const CAMP_COLS = 80;
export const CAMP_ROWS = 50;
export const CAMP_WIDTH = CAMP_COLS * 16; // 1280
export const CAMP_HEIGHT = CAMP_ROWS * 16; // 800
/**
 * 캠핑장 배치 버전. 좌표가 바뀌는 개편마다 올린다 → 옛 캠핑장 자리 기록(lib/resume.ts)은 위치를 버리고 정류장에서 시작한다.
 * 1 = 11/15 1차 (정류장·관리소·광장·데크 24·계곡·산책로·전망대·캠핑카 3·큰 타프)
 * 2 = 정류장을 위로 (화면 아래 채팅창에 가리지 않게) · 캠핑카 앞 캠핑 도구(의자 앉기) — 정류장·길 자리가 바뀌어서
 * 3 = 11/16 별 망원경 둘 (전망대 계단 아래·계곡 둑 받침 충돌, scopes.ts CAMP_SCOPES) — 새 충돌 자리에 옛 기록이 끼지 않게
 */
export const CAMP_MAP_VERSION = 3;

type Rect = { x: number; y: number; w: number; h: number };

/** 걸을 수 있는 범위 (둘레 숲 안쪽) */
export const CAMP_BOUNDS = { minX: 24, maxX: CAMP_WIDTH - 24, minY: 44, maxY: CAMP_HEIGHT - 12 } as const;

// ── 구역 (이름표·안내·미니맵 기준. 충돌과는 상관없다) ──
//
//  y=0   ┌──숲───────────────────────────────────────────── 계곡 ──────[전망대]┐
//        │ 캠핑카1   ⌂ ⌂ ⌂ 데크 ⌂ ⌂ ⌂               ╲ 통나무 다리 ═══  산책로 │
//        │ 캠핑카2  ⌂     (캠프파이어 광장)   ⌂       ╱ 앉는 바위        ┊     │
//        │ 캠핑카3   ⌂ ⌂ ⌂ ⌂   ⌂ ⌂ ⌂ ⌂               ╲ 징검다리 ┄┄┄┄┄┄┘     │
//        │ [정류장]  [관리소·매점]   [ 큰 타프 ]       ╱                      │
//  y=800 └═ 버스 길 ════════════════════════════════════════════════════════┘
export type CampZoneId = "busStop" | "office" | "plaza" | "decks" | "stream" | "trail" | "lookout" | "campers" | "tarp";
export type CampZone = { id: CampZoneId; name: string } & Rect;
export const CAMP_ZONES: readonly CampZone[] = [
  { id: "busStop", name: "버스 정류장", x: 40, y: 560, w: 260, h: 132 },
  { id: "office", name: "관리소·매점", x: 292, y: 588, w: 236, h: 132 },
  { id: "plaza", name: "캠프파이어 광장", x: 524, y: 304, w: 192, h: 184 },
  { id: "decks", name: "캠핑 데크", x: 330, y: 206, w: 580, h: 392 },
  { id: "stream", name: "계곡", x: 952, y: 40, w: 150, h: 756 },
  { id: "trail", name: "숲 산책로", x: 1100, y: 200, w: 160, h: 460 },
  { id: "lookout", name: "전망대", x: 1092, y: 52, w: 168, h: 120 },
  { id: "campers", name: "캠핑카", x: 40, y: 196, w: 184, h: 360 },
  { id: "tarp", name: "큰 타프", x: 568, y: 644, w: 184, h: 124 },
];

// ── 버스 정류장 (왼쪽 아래) ── 정류장 지붕 받침 가운데. 지붕 아래 녹슨 벤치(qB), 오른쪽 기둥에 노선 팻말, 왼쪽에 시간표.
// 맵 맨 아래에 두면 화면 아래 채팅창에 가려서 (11/15) 한 줄 위로 올렸다. 정류장 앞 보도 → 그 아래 버스 길 → 그 아래는 숲
export const CAMP_BUS_STOP = { x: 150, y: 622 } as const;
export const CAMP_BUS_SIGN = { x: 200, y: 628 } as const;
export const CAMP_BUS_TIMETABLE = { x: 102, y: 626 } as const;
/** 버스가 서는 길 (왼쪽 끝 → 정류장 앞 → 둥글게 돌아 나가는 끝). 바닥 장식, 막지 않는다 */
export const CAMP_ROAD = { x: 0, y: 646, w: 300, h: 42 } as const;
/** 버스에서 내리는 자리 (정류장 앞 보도). 처음 도착·새로고침 자리가 막혔을 때도 여기 */
export const CAMP_ARRIVE = { x: 150, y: 640 } as const;
/** 버스에 타는 자리 (정류장 앞 보도 — 여기서 E) */
export const CAMP_BOARD = { x: CAMP_BUS_STOP.x, y: CAMP_BUS_STOP.y + 16 } as const;

// ── 관리소·매점 (정류장 오른쪽) ── 오두막 받침 가운데. 왼쪽 반은 관리소(문), 오른쪽 반은 매점(창구·차양). 처마에 줄 조명
export const CAMP_OFFICE = { x: 404, y: 676 } as const;
export const CAMP_OFFICE_W = 176;
export const CAMP_OFFICE_H = 84;
/** 의뢰판 자리 (다음 차수에 의뢰를 붙인다 — 지금은 빈 판) */
export const CAMP_BOARD_SPOT = { x: 520, y: 684 } as const;

// ── 캠프파이어 광장 (가운데) ── 큰 모닥불 + 통나무 의자 12개
export const CAMP_FIRE = { x: 620, y: 392 } as const;
/** 광장 바닥 반지름 (흙·돌 원) */
export const CAMP_PLAZA_R = 92;
/** 광장 큰 모닥불 (마을 모닥불과 같은 "불멍" 연출 — 통나무 의자 qL1~12에 앉으면) */
export const CAMP_CAMPFIRE: Campfire = { id: "fireC", x: CAMP_FIRE.x, y: CAMP_FIRE.y, big: true };
/** 통나무 의자 고리 (불 가운데 기준 타원) */
export const CAMP_LOG_RX = 66;
export const CAMP_LOG_RY = 52;

// ── 캠핑 데크 24자리 (광장 둘레 타원) ── 텐트는 다음 차수. 지금은 번호 팻말만 있는 빈 나무 데크
export const CAMP_DECK_W = 36;
export const CAMP_DECK_H = 26;
export const CAMP_DECK_COUNT = 24;
export type CampDeck = { n: number; x: number; y: number };
/** 데크 가운데 좌표. 1번은 광장 바로 위에서 시작해 시계 방향 */
export const CAMP_DECKS: readonly CampDeck[] = Array.from({ length: CAMP_DECK_COUNT }, (_, i) => {
  const a = -Math.PI / 2 + (i / CAMP_DECK_COUNT) * Math.PI * 2;
  return { n: i + 1, x: Math.round(CAMP_FIRE.x + Math.cos(a) * 272), y: Math.round(CAMP_FIRE.y + 8 + Math.sin(a) * 176) };
});

// ── 계곡 (오른쪽을 굽이쳐 흐른다) ── 물 가운데 선 (위 → 아래). 폭은 CAMP_STREAM_HALF_W × 2
export const CAMP_STREAM: readonly { x: number; y: number }[] = [
  { x: 1004, y: 0 },
  { x: 1032, y: 92 },
  { x: 1002, y: 184 },
  { x: 1040, y: 284 },
  { x: 1010, y: 384 },
  { x: 1050, y: 484 },
  { x: 1012, y: 584 },
  { x: 1042, y: 692 },
  { x: 1012, y: 800 },
];
export const CAMP_STREAM_HALF_W = 20;
/** 계곡 가운데 x (y에서) */
export function campStreamX(y: number): number {
  const p = CAMP_STREAM;
  if (y <= p[0].y) return p[0].x;
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i].y) {
      // 꼭짓점에서 꺾이지 않게 코사인으로 부드럽게 (물가가 지그재그가 아니라 굽이친다)
      const t = (1 - Math.cos(((y - p[i - 1].y) / (p[i].y - p[i - 1].y)) * Math.PI)) / 2;
      return p[i - 1].x + (p[i].x - p[i - 1].x) * t;
    }
  }
  return p[p.length - 1].x;
}
/** 물 위를 건너는 곳: 징검다리(아래)와 통나무 다리(위). 이 y 범위 안에서는 물이 막지 않는다 */
export const CAMP_CROSSINGS: readonly { kind: "stones" | "bridge"; y0: number; y1: number }[] = [
  { kind: "stones", y0: 574, y1: 596 },
  { kind: "bridge", y0: 274, y1: 296 },
];
/** 징검다리 돌 (물 가운데를 따라 놓는다) */
export const CAMP_STEP_STONES: readonly { x: number; y: number }[] = [-24, -8, 8, 24].map((dx, i) => ({ x: Math.round(campStreamX(585) + dx), y: 585 + (i % 2 ? -3 : 3) }));
/** (x,y)가 계곡 물 안인지 (건너는 곳 포함) */
export function inCampStream(x: number, y: number, pad = 0): boolean {
  return Math.abs(x - campStreamX(y)) <= CAMP_STREAM_HALF_W + pad;
}

// ── 계곡 낚시 자리 (A-6) ── 마을 낚시와 같은 1인 자리(SPOT_KINDS.fish, 서버 좌석 — 정해진 자리만). 계곡 물은 강(river) 물고기.
// 앵커 = 물가 둑의 발 위치(물 가운데에서 CAMP_FISH_BANK), facing = 물 쪽. id = "f_x_y" (마을 낚시 자리 id와 겹치지 않는다 — camp.test가 본다)
export const CAMP_FISH_BANK = 30;
const campBank = (y: number, side: -1 | 1): FishingSpot => {
  const x = Math.round(campStreamX(y) + side * CAMP_FISH_BANK);
  return { id: `f_${x}_${y}`, water: "river", x, y, facing: side < 0 ? DIR.right : DIR.left };
};
/** 왼쪽 둑(-1, 오른쪽을 본다)·오른쪽 둑(1, 왼쪽을 본다) — 앉는 바위·할머니·큰 바위·건너는 곳을 피해서 */
export const CAMP_FISHING_SPOTS: readonly FishingSpot[] = [
  campBank(124, -1),
  campBank(172, 1),
  campBank(244, -1),
  campBank(400, 1),
  campBank(486, -1),
  campBank(624, -1),
  campBank(700, 1),
  campBank(750, -1),
];
export function campFishingSpotById(id: string): FishingSpot | undefined {
  return CAMP_FISHING_SPOTS.find((s) => s.id === id);
}
/** 낚시 자리 id → 물 종류 (마을 자리·배 위 가상 자리·캠핑장 계곡 자리). 웹 서버(lib/forage)가 쓴다 */
export function anyFishingWaterOf(id: string): FishingSpot["water"] | null {
  return fishingWaterOf(id) ?? campFishingSpotById(id)?.water ?? seaFishingSpotById(id)?.water ?? null;
}

// ── 전망대 (오른쪽 위 산꼭대기) ── 나무 데크 (난간, 아래쪽 가운데 계단)
export const CAMP_LOOKOUT: Rect = { x: 1104, y: 76, w: 136, h: 80 };
export const CAMP_LOOKOUT_STAIRS = { x: 1156, w: 32 } as const;

// ── 캠핑카 3대 (왼쪽) ── 받침 가운데. 문은 앞(아래) 오른쪽. 가운데 차에 문패
export const CAMP_VANS: readonly { id: string; x: number; y: number; plate?: string }[] = [
  { id: "v1", x: 124, y: 268 },
  { id: "v2", x: 124, y: 396, plate: "언젠가 씨네" },
  { id: "v3", x: 124, y: 524 },
];
export const CAMP_VAN_W = 76;
export const CAMP_VAN_H = 46;
/** 캠핑카 문 (받침 기준 오프셋) */
export const CAMP_VAN_DOOR_DX = 20;

/**
 * 캠핑카 앞 캠핑 도구 (11/15): 접이식 탁자 + 캠핑 의자 셋(앉을 수 있다) + 화롯대 + 랜턴 + 아이스박스.
 * 좌표는 받침 가운데. 차 앞(아래) 마당에 두고, 캠핑카 골목(x≈180)은 비운다
 */
export type CampVanGear = {
  van: string;
  table: { x: number; y: number };
  chairs: readonly { x: number; y: number; facing: DirId }[];
  brazier: { x: number; y: number };
  lantern: { x: number; y: number };
  icebox: { x: number; y: number };
};
export const CAMP_VAN_GEAR: readonly CampVanGear[] = CAMP_VANS.map((v) => ({
  van: v.id,
  table: { x: v.x - 10, y: v.y + 40 },
  chairs: [
    { x: v.x - 34, y: v.y + 40, facing: DIR.right },
    { x: v.x + 14, y: v.y + 40, facing: DIR.left },
    { x: v.x - 10, y: v.y + 16, facing: DIR.down },
  ],
  brazier: { x: v.x + 42, y: v.y + 44 },
  lantern: { x: v.x - 2, y: v.y + 40 }, // 탁자 위
  icebox: { x: v.x - 58, y: v.y + 52 },
}));

// ── 큰 타프 (아래 가운데) ── 비 피하는 지붕 + 피크닉 탁자와 긴 의자 둘
export const CAMP_TARP: Rect = { x: 572, y: 650, w: 176, h: 112 };
export const CAMP_TABLE = { x: 660, y: 704 } as const;

// ── NPC 5명 (말 걸기만, 1차) ──
export type CampNpcId = "keeper" | "clerk" | "granny" | "stargazer" | "guitarist";
export const CAMP_NPCS: readonly { id: CampNpcId; name: string; x: number; y: number; facing: DirId }[] = [
  { id: "keeper", name: "언젠가 씨", x: 356, y: 698, facing: DIR.down },
  { id: "clerk", name: "매점 알바", x: 452, y: 694, facing: DIR.down },
  { id: "granny", name: "계곡 할머니", x: 980, y: 540, facing: DIR.right },
  { id: "stargazer", name: "별지기", x: 1218, y: 132, facing: DIR.up },
  { id: "guitarist", name: "기타 캠퍼", x: 706, y: 450, facing: DIR.left },
];

// ── 앉는 자리 (좌석 판정은 서버) ── id는 마을 좌석과 겹치지 않게 모두 "q"로 시작한다
function logChairs(): Furniture[] {
  const out: Furniture[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // 불을 바라본다 (가까운 네 방향)
    const facing: DirId = Math.abs(dx) > Math.abs(dy) * 1.1 ? (dx > 0 ? DIR.left : DIR.right) : dy > 0 ? DIR.up : DIR.down;
    out.push({ id: `qL${i + 1}`, kind: "chair", x: Math.round(CAMP_FIRE.x + dx * CAMP_LOG_RX), y: Math.round(CAMP_FIRE.y + 6 + dy * CAMP_LOG_RY), facing, seatOffsets: [0], campfire: CAMP_CAMPFIRE.id });
  }
  return out;
}

export const CAMP_FURNITURE: readonly Furniture[] = [
  // 정류장 지붕 아래 녹슨 벤치
  { id: "qB", kind: "bench", x: CAMP_BUS_STOP.x, y: CAMP_BUS_STOP.y - 8, facing: DIR.down, seatOffsets: [-12, 12] },
  // 관리소 앞 나무 벤치
  { id: "qF", kind: "bench", x: 300, y: 708, facing: DIR.down, seatOffsets: [-10, 10] },
  // 광장 통나무 의자 12개
  ...logChairs(),
  // 계곡 앉는 바위 (물을 바라본다)
  { id: "qR1", kind: "chair", x: 974, y: 438, facing: DIR.right, seatOffsets: [0] },
  { id: "qR2", kind: "chair", x: 1094, y: 528, facing: DIR.left, seatOffsets: [0] },
  { id: "qR3", kind: "chair", x: 984, y: 660, facing: DIR.right, seatOffsets: [0] },
  { id: "qR4", kind: "chair", x: 1080, y: 352, facing: DIR.left, seatOffsets: [0] },
  { id: "qR5", kind: "chair", x: 966, y: 214, facing: DIR.right, seatOffsets: [0] },
  // 전망대 데크 벤치 (산 아래 캠핑장·계곡 경치를 내려다본다 — 등은 난간 쪽)
  { id: "qO1", kind: "bench", x: 1134, y: 104, facing: DIR.down, seatOffsets: [-10, 10] },
  { id: "qO2", kind: "bench", x: 1206, y: 104, facing: DIR.down, seatOffsets: [-10, 10] },
  // 캠핑카 문간 (안에 들어가 앉는 자리 — 열린 문 안쪽 발판)
  ...CAMP_VANS.map((v): Furniture => ({ id: `qV${v.id.slice(1)}`, kind: "chair", x: v.x + CAMP_VAN_DOOR_DX, y: v.y + 4, facing: DIR.down, seatOffsets: [0] })),
  // 캠핑카 앞 캠핑 의자 (접이식 탁자를 둘러싼다)
  ...CAMP_VAN_GEAR.flatMap((g): Furniture[] => g.chairs.map((c, i) => ({ id: `qC${g.van.slice(1)}${i + 1}`, kind: "chair", x: c.x, y: c.y, facing: c.facing, seatOffsets: [0] }))),
  // 큰 타프 아래 피크닉 의자 (탁자를 사이에 두고 마주 본다)
  { id: "qT1", kind: "bench", x: CAMP_TABLE.x, y: CAMP_TABLE.y - 14, facing: DIR.down, seatOffsets: [-18, 0, 18] },
  { id: "qT2", kind: "bench", x: CAMP_TABLE.x, y: CAMP_TABLE.y + 16, facing: DIR.up, seatOffsets: [-18, 0, 18] },
];

/** 좌석 id: 의자는 furniture id 그대로, 벤치는 `${id}-${i}` (마을 SEATS와 같은 규칙) */
export const CAMP_SEATS: readonly Seat[] = CAMP_FURNITURE.flatMap((f) =>
  f.seatOffsets.map((dx, i) => ({ id: f.seatOffsets.length > 1 ? `${f.id}-${i}` : f.id, furnitureId: f.id, x: f.x + dx, y: f.y, facing: f.facing })),
);
const campSeatMap = new Map(CAMP_SEATS.map((s) => [s.id, s]));
export function campSeatById(id: string): Seat | undefined {
  return campSeatMap.get(id);
}
/** 이 캠핑장 좌석이 큰 모닥불 둘레 통나무 의자면 그 모닥불 (마을 campfireOfSeat과 같은 뜻) */
export function campCampfireOfSeat(seatId: string): Campfire | null {
  const s = campSeatMap.get(seatId);
  return s && CAMP_FURNITURE.some((f) => f.id === s.furnitureId && f.campfire === CAMP_CAMPFIRE.id) ? CAMP_CAMPFIRE : null;
}
const campSlots = new Map<string, SeatSlot>(CAMP_SEATS.map((s) => [s.id, { id: s.id, kind: "seat", x: s.x, y: s.y, facing: s.facing, state: STATE.sitChair, furnitureId: s.furnitureId }]));
// 계곡 낚시 자리도 정해진 자리로 받는다 (마을 낚시 자리처럼 kind "fish")
for (const f of CAMP_FISHING_SPOTS) campSlots.set(f.id, { id: f.id, kind: "fish", x: f.x, y: f.y, facing: f.facing, state: SPOT_KINDS.fish.state, furnitureId: null });
/** 11/16 바닷가 좌석 (정류장 벤치 — 쉴거리 자리는 다음 차수에 여기에 더해요) */
const seaSlots = new Map<string, SeatSlot>(SEA_SEATS.map((s) => [s.id, { id: s.id, kind: "seat", x: s.x, y: s.y, facing: s.facing, state: STATE.sitChair, furnitureId: s.furnitureId }]));
// 11/16 쉴거리 자리 (선베드 눕기·돗자리 바닥 앉기) — 자리마다 상태가 달라요 (MOVE 상태가 다르면 자리를 놓아요)
for (const r of SEA_REST_SEATS) seaSlots.set(r.id, { id: r.id, kind: "seat", x: r.x, y: r.y, facing: r.facing, state: r.state, furnitureId: r.group });
// 11/16 갯바위 낚시 자리도 정해진 자리로 (캠핑장 계곡 낚시 자리처럼 kind "fish")
for (const f of SEA_FISHING_SPOTS) seaSlots.set(f.id, { id: f.id, kind: "fish", x: f.x, y: f.y, facing: f.facing, state: SPOT_KINDS.fish.state, furnitureId: null });
// 11/16 r13 튜브·제트스키: 조각배처럼 앉은 채 움직이는 자리 (상태 boat, "타는" 자리라 커진 동안엔 못 타요).
// 튜브는 바다 어디서든 올라타서 서버 자리를 앵커로 옮기지 않아요(drift)
for (const r of SEA_RIDES)
  seaSlots.set(r.id, {
    id: r.id,
    kind: "boat",
    x: r.x,
    y: r.y,
    facing: DIR.down,
    state: STATE.boat,
    furnitureId: r.id,
    mobile: true,
    radius: r.kind === "tube" ? SEA_TUBE_RADIUS : SEA_JETSKI_RADIUS,
    ...(r.kind === "tube" ? { drift: true } : {}),
  });
// 11/16 r18 2인승 카약: 같은 카약 두 자리 (가구 id = 카약). 같이 타기는 노 젓는 사람 곁이면 바다 위에서도 (조각배 2인승과 같은 서버 규칙)
for (const q of SEA_KAYAK_SEATS)
  seaSlots.set(q.id, { id: q.id, kind: "boat", x: q.x, y: q.y, facing: DIR.down, state: STATE.boat, furnitureId: q.kayak, mobile: true, radius: SEA_KAYAK_RADIUS, drift: true });

// ── 맵별 판정 (서버·클라이언트 공통) ──

/** 맵 id 정규화: "camp"는 캠핑장, "sea"는 바닷가, 나머지(없음·옛 값)는 마을 */
export function mapOf(m: unknown): MapId {
  return isAwayMap(m) ? m : "village";
}

/** 11/16 이 입장 허락(토큰 camp·sea)으로 그 맵에 갈 수 있는지. 마을은 언제나 */
export function mapAllowed(map: MapId, perm: { camp?: true; sea?: true }): boolean {
  return map === "village" || (map === "camp" && perm.camp === true) || (map === "sea" && perm.sea === true);
}

/** 서버 검증용: 그 맵 안 (담 두께는 따지지 않는다) */
export function inMapBounds(map: MapId, x: number, y: number): boolean {
  if (map === "camp") return x >= 0 && x <= CAMP_WIDTH && y >= 0 && y <= CAMP_HEIGHT;
  if (map === "sea") return x >= 0 && x <= SEA_WIDTH && y >= 0 && y <= SEA_HEIGHT;
  return x >= 0 && x <= MAP_WIDTH && y >= 0 && y <= MAP_HEIGHT;
}

/**
 * 그 맵의 1인 자리 (서버 좌석 판정). 마을은 world.ts seatSlot 그대로.
 * 캠핑장은 캠핑장 좌석 + 정해진 자리가 없는 소품 자리(형식만 보는 종류)만 — 마을의 배·관람차·열기구·낚시 자리는 받지 않는다
 */
export function seatSlotIn(map: MapId, id: string): SeatSlot | undefined {
  if (map === "village") return seatSlot(id);
  const s = (map === "sea" ? seaSlots : campSlots).get(id);
  if (s) return s;
  const spot = seatSlot(id);
  // 마을에만 있는 정해진 자리(배·관람차·열기구·낚시 자리)와 마을 의자는 캠핑장에 없다 → 형식만 보는 소품 자리만
  if (!spot || spot.kind === "seat" || spot.mobile || SPOT_KINDS[spot.kind].fixed) return undefined;
  return spot;
}

/** 이 상태가 그 맵에서 의미 있는 소품 자리 상태인지 (캠핑장엔 배·관람차·열기구가 없다) */
export function mapHasSpotState(map: MapId, state: number): boolean {
  if (map === "village") return true;
  const k = spotKindOfState(state);
  return k !== "boat" && k !== "ferris" && k !== "balloon";
}

/** 그 맵의 처음 자리 (캠핑장·바닷가는 버스에서 내리는 자리) */
export function mapSpawn(map: MapId, villageSpawn: { x: number; y: number }): { x: number; y: number } {
  return map === "camp" ? CAMP_ARRIVE : map === "sea" ? SEA_ARRIVE : villageSpawn;
}
