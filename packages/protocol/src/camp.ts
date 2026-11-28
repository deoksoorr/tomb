import { DIR, STATE, type DirId } from "./types";
import { MAP_HEIGHT, MAP_WIDTH, SPOT_KINDS, fishingWaterOf, seatSlot, spotKindOfState, type FishingSpot, type Campfire, type Furniture, type Seat, type SeatSlot } from "./world";
import * as CampHomes from "./campHomes";
import { SEA_ARRIVE, SEA_FISHING_SPOTS, SEA_JETSKI_RADIUS, SEA_KAYAK_RADIUS, SEA_KAYAK_SEATS, SEA_REST_SEATS, SEA_RIDES, SEA_HEIGHT, SEA_SEATS, SEA_TUBE_RADIUS, SEA_WIDTH, seaFishingSpotById } from "./sea";

// 11/15 두 번째 맵 「언젠가 캠핑장 · Someday Camp」 (1차: 맵·버스·앉기·NPC 말 걸기).
// "언젠가 캠핑 가야지" 하고 장비만 사 두고 못 간 그곳. 11/26 폭포 계곡 개편: 아스라 폭포·달그늘 소·옛길 계곡·윤슬 낚시터·카라반 자리·소슬 펜션·촌캉스.
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
/** 11/17 마을 전체 이름 (버스 안내·마을행 표지판). 묘역 옆 숲과 추억 분위기. 짧게 부를 땐 MAP_NAME의 "마을" */
export const VILLAGE_TITLE = "기억숲 마을";
export const VILLAGE_TITLE_EN = "Memory Woods Village";
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
 * 4 = 11/26 폭포 계곡 개편 (아스라 폭포·달그늘 소·옛길 계곡·윤슬 낚시터·카라반 자리·소슬 펜션·촌캉스·캠프파이어 존). 데크·전망대·캠핑카·큰 타프 없앰
 */
export const CAMP_MAP_VERSION = 4;

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** 걸을 수 있는 범위 (둘레 숲 안쪽) */
export const CAMP_BOUNDS = { minX: 10, maxX: CAMP_WIDTH - 10, minY: 24, maxY: CAMP_HEIGHT - 12 } as const;

// ── 11/26 폭포 계곡 배치 (6차 시안 — game/camp/mock/mockLayout을 옮김) ──
//
//  y=0   ┌ 촌캉스 2 ─ 족욕탕 ▟▛ 절벽 ║아스라 폭포║ 절벽 ▜▙  자판기 ┌ 윤슬 낚시터 ┐
//        │ 소슬 펜션 2      [7] (  달그늘 소  ) [10]    부스 │ 좌대·잔교 │
//        │ 펜션 정원·놀이터  [1] ══폭포 다리══ [4]           │ 나룻배    │
//        │                 [8][2]  ╲옛길 계곡╱  [5][11]       └───────────┘
//        │ [정류장] 소슬댁  [9][3]  ┄징검다리┄  [6][12]   캠프파이어 존 🎄
//  y=800 └═버스 길═ [관리소·매점] ── 통나무 다리 ─────────────── 불멍 자리 ┘
export type CampZoneId = "busStop" | "office" | "falls" | "pool" | "stream" | "caravans" | "fishing" | "campfire" | "pension" | "rural" | "footbath";
export type CampZone = { id: CampZoneId; name: string } & Rect;
export const CAMP_ZONES: readonly CampZone[] = [
  { id: "busStop", name: "버스 정류장", x: 40, y: 560, w: 260, h: 132 },
  { id: "office", name: "관리소·매점", x: 292, y: 588, w: 236, h: 132 },
  { id: "falls", name: "아스라 폭포", x: 470, y: 0, w: 340, h: 200 },
  { id: "pool", name: "달그늘 소", x: 466, y: 196, w: 348, h: 152 },
  { id: "stream", name: "옛길 계곡", x: 580, y: 400, w: 120, h: 400 },
  { id: "caravans", name: "카라반 자리", x: 356, y: 296, w: 608, h: 360 },
  { id: "fishing", name: "윤슬 낚시터", x: 944, y: 64, w: 300, h: 444 },
  { id: "campfire", name: "캠프파이어 존", x: 930, y: 540, w: 340, h: 250 },
  { id: "pension", name: "소슬 펜션", x: 0, y: 226, w: 340, h: 360 },
  { id: "rural", name: "촌캉스", x: 0, y: 20, w: 330, h: 196 },
  { id: "footbath", name: "계곡 족욕탕", x: 346, y: 64, w: 92, h: 140 },
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
/** 의뢰판 자리 */
export const CAMP_BOARD_SPOT = { x: 520, y: 684 } as const;

// ── 아스라 폭포 · 달그늘 소 (위 가운데) ── 절벽은 x 424~856, 물줄기는 맵 위 밖에서 쏟아진다
export const CAMP_FALL_X = 640;
export const CAMP_CLIFF_X0 = 424;
export const CAMP_CLIFF_X1 = 856;
/** 절벽 밑동 대략 (웅덩이 위 호를 따라 좌우로 내려온다 — 그림의 실제 밑동은 game/camp/campLayout cliffBase) */
export function campCliffEnvelope(x: number): number {
  const u = Math.min(1, Math.abs(x - CAMP_FALL_X) / ((CAMP_CLIFF_X1 - CAMP_CLIFF_X0) / 2));
  return 196 + 76 * u * u;
}
/** 달그늘 소 (타원) */
export const CAMP_POOL = { x: 640, y: 272, rx: 174, ry: 76 } as const;
/** 소 가장자리 흔들림 포함 거리 (1 = 물가) */
export function campPoolD(x: number, y: number): number {
  const dx = (x - CAMP_POOL.x) / CAMP_POOL.rx;
  const dy = (y - CAMP_POOL.y) / CAMP_POOL.ry;
  const a = Math.atan2(dy, dx);
  const wob = 1 + Math.sin(a * 3 + 0.4) * 0.05 + Math.sin(a * 5 + 0.6) * 0.035 + Math.sin(a * 9 + 2.1) * 0.02;
  return Math.hypot(dx, dy) / wob;
}
/** 물이 떨어지는 자리 (소 안, 거품·물안개 가운데) */
export const CAMP_PLUNGE = { x: 638, y: 214 } as const;
/** 11/26 헤엄쳐 못 들어가는 폭포 밑 (물살이 세서 바깥으로 밀어낸다 — 낚시 바위·소 가장자리는 그대로) */
export const CAMP_PLUNGE_ZONE = { x: 640, y: 214, rx: 92, ry: 40 } as const;
export function inCampPlunge(x: number, y: number, pad = 0): boolean {
  const Z = CAMP_PLUNGE_ZONE;
  return ((x - Z.x) / (Z.rx + pad)) ** 2 + ((y - Z.y) / (Z.ry + pad)) ** 2 <= 1;
}

// ── 옛길 계곡 (소 → 맵 아래 끝, 완만한 S자) ── 물 가운데 선 (위 → 아래). 폭은 CAMP_STREAM_HALF_W × 2
export const CAMP_STREAM: readonly Pt[] = [
  { x: 640, y: 336 },
  { x: 628, y: 396 },
  { x: 650, y: 462 },
  { x: 680, y: 530 },
  { x: 664, y: 600 },
  { x: 626, y: 664 },
  { x: 632, y: 732 },
  { x: 650, y: 812 },
];
export const CAMP_STREAM_HALF_W = 22;
/** 계곡은 소 아래(이 y부터)만 — 위는 소 */
export const CAMP_STREAM_TOP = 300;
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
/** (x,y)가 계곡 물 안인지 (건너는 곳 포함, 소는 빼고) */
export function inCampStream(x: number, y: number, pad = 0): boolean {
  return y > CAMP_STREAM_TOP && Math.abs(x - campStreamX(y)) <= CAMP_STREAM_HALF_W + pad;
}
/** 건너는 곳: 폭포 다리(소 바로 아래, 폭포를 마주 본다) · 징검다리 · 통나무 다리 */
export const CAMP_VIEW_BRIDGE = { y: 380, w: 104, h: 26 } as const;
export const CAMP_STONES_Y = 572;
export const CAMP_LOG_BRIDGE_Y = 716;
/** 물 위를 건너는 곳 (이 y 범위에서는 물이 아니다 — 걸어서 건넌다) */
export const CAMP_CROSSINGS: readonly { kind: "view" | "stones" | "bridge"; y0: number; y1: number }[] = [
  { kind: "view", y0: CAMP_VIEW_BRIDGE.y - 9, y1: CAMP_VIEW_BRIDGE.y + 17 },
  { kind: "stones", y0: CAMP_STONES_Y - 10, y1: CAMP_STONES_Y + 10 },
  { kind: "bridge", y0: CAMP_LOG_BRIDGE_Y - 11, y1: CAMP_LOG_BRIDGE_Y + 11 },
];
/** 징검다리 돌 (물 가운데를 따라 놓는다) */
export const CAMP_STEP_STONES: readonly Pt[] = [-27, -9, 9, 27].map((dx, i) => ({ x: Math.round(campStreamX(CAMP_STONES_Y) + dx), y: CAMP_STONES_Y + (i % 2 ? -3 : 3) }));

// ── 윤슬 낚시터 (오른쪽 위 네모 저수지) ── 석축 둑 + 둘레 둑길, 잔교·좌대 6(4인)·나룻배 선착장
export const CAMP_RES = { x0: 984, y0: 96, x1: 1216, y1: 472 } as const;
/** 석축 폭 (물가 → 둑길) · 물가에서 둘레 둑길 가운데까지 */
export const CAMP_RES_EMBANK = 10;
export const CAMP_RES_RING = 26;
/** 저수지 물가까지 거리 (물 안은 음수) */
export function campResEdge(x: number, y: number): number {
  const R = CAMP_RES;
  const dx = Math.max(R.x0 - x, x - R.x1);
  const dy = Math.max(R.y0 - y, y - R.y1);
  if (dx <= 0 && dy <= 0) return Math.max(dx, dy);
  return Math.hypot(Math.max(0, dx), Math.max(0, dy));
}
/** 서쪽 둑에서 동쪽으로 뻗은 넓은 잔교 (가운데 y, 폭 2칸) */
export const CAMP_PIER = { y: 260, x0: CAMP_RES.x0 - CAMP_RES_EMBANK, x1: 1198, w: 32 } as const;
/**
 * 좌대 여섯 (받침 가운데 아래). 1~3 = 잔교에 붙은 줄(걸어서 — 잔교 난간이 열린 통로), 4~6 = 물 건너 줄
 * (11/26 운영자: 헤엄쳐 가서 앞 사다리로만 오르고 내린다 — 사다리를 타는 동안은 짧게 오르내리는 연출)
 */
export const CAMP_RAFTS: readonly (Pt & { n: number; link: boolean; roof: number })[] = [
  // 11/26 좌대를 넓혔다 (운영자 「좌대 폭이랑 넓이를 좀 더 넓게」 — 마루 62×23 → 66×32, 넓이 약 1.5배). 마루가 뒤로 깊어져
  // 잔교에 붙은 줄은 받침을 9 내렸다 (그림 위 끝 = 잔교 아래 끝 그대로). 양 끝 좌대는 4씩 바깥으로 (좌대 사이 물길 12 그대로)
  { n: 1, x: 1022, y: 333, link: true, roof: 0 },
  { n: 2, x: 1100, y: 333, link: true, roof: 1 },
  { n: 3, x: 1178, y: 333, link: true, roof: 2 },
  { n: 4, x: 1022, y: 174, link: false, roof: 3 },
  { n: 5, x: 1100, y: 174, link: false, roof: 4 },
  { n: 6, x: 1178, y: 174, link: false, roof: 5 },
];
/**
 * 11/27 좌대 낚시 의자 하나 (좌대 입장권 주인이 혼자 쓴다 — 운영자: 의자 넷 대신 하나). 앞 끝 가운데 (좌대 가운데 기준 x),
 * 물 건너 좌대(4~6)는 가운데가 사다리 칸이라 사다리 오른쪽에. 앉는 줄 = 받침에서 위로
 */
export const campRaftSeatDx = (r: { link: boolean }): number => (r.link ? 0 : 11);
export const CAMP_RAFT_SEAT_DY = -12;
/** 11/26 좌대 마루 반폭 · 받침에서 마루 뒤 끝까지 (그림 valleyExtraArt raft4Art 72×57 — 마루 3~68 · 17~48줄) */
export const CAMP_RAFT_HALF_W = 33;
export const CAMP_RAFT_DEPTH = 40;
/** 좌대 그림 높이 (받침에서 지붕 꼭대기까지 — 물 건너 좌대 뒤 막이가 지붕까지 덮는다) */
export const CAMP_RAFT_ART_H = 57;
/**
 * 11/28 좌대 오두막 자리: 옛 뒤 가운데에서 오른쪽으로 민 칸 (운영자 「좌대 길은 하나로 합쳐, 좀 넓게, 건물을 한쪽에 빼고」 — 오두막은 오른쪽 뒤 모서리,
 * 왼쪽 뒤는 넓은 판자 다리 하나·트인 마루). 여섯 다 같은 자리. 그림 valleyExtraArt raft4Art · 막이 campLayout · 지붕 덧그림 CampMap · 이름표 CampRafts가 같이 쓴다
 */
export const CAMP_RAFT_HUT_DX = 16;
/** 좌대 마루 (걸을 수 있는 판 — 받침 기준). 11/26 잔교에 붙은 좌대도 마루는 같고, 잔교 → 마루는 판자 다리(campRaftWalks)로만 건넌다 */
export function campRaftDeck(r: { x: number; y: number; link: boolean }): Rect {
  const top = r.y - CAMP_RAFT_DEPTH;
  return { x: r.x - CAMP_RAFT_HALF_W, y: top, w: CAMP_RAFT_HALF_W * 2, h: r.y - 8 - top };
}
/**
 * 잔교에 붙은 좌대(1~3)의 판자 다리 (잔교 아래 끝 → 마루 뒤 끝). 11/26 운영자 「다리랑 붙어 있는 좌대는 연결 부분을 다리로」.
 * 11/28 오두막 양옆 좁은 다리 둘(폭 12) → 왼쪽 뒤 넓은 다리 하나(폭 26 — 몸 세 칸). 그림 valleyExtraArt raft4Art의 다리 칸(x 6~31)과 같다.
 * 3번도 잔교 안에서 시작한다 (잔교 끝 x 1198). 물 건너 좌대는 없다
 */
export const CAMP_RAFT_WALK_DX: readonly number[] = [-30];
export const CAMP_RAFT_WALK_W = 25;
export function campRaftWalks(r: { x: number; y: number; link: boolean }): Rect[] {
  if (!r.link) return [];
  const top = CAMP_PIER.y + CAMP_PIER.w / 2;
  // 잔교 위에서 시작하는 다리만 (3번 좌대 오른쪽은 잔교 끝 밖이라 없다)
  return CAMP_RAFT_WALK_DX.filter((dx) => r.x + dx >= CAMP_PIER.x0 && r.x + dx + CAMP_RAFT_WALK_W <= CAMP_PIER.x1).map((dx) => ({ x: r.x + dx, y: top, w: CAMP_RAFT_WALK_W, h: r.y - CAMP_RAFT_DEPTH - top }));
}
/** 나룻배 선착장 (서쪽 둑에서 물 위로) */
export const CAMP_ROW_DOCK = { x0: CAMP_RES.x0 - CAMP_RES_EMBANK, y: 420, len: 62 } as const;
export const CAMP_ROW_DOCK_RECT: Rect = { x: CAMP_ROW_DOCK.x0, y: CAMP_ROW_DOCK.y - 7, w: CAMP_ROW_DOCK.len, h: 14 };
/** 좌대 구역 ↔ 배 구역 가르는 부표 줄 (배는 이 아래로만) */
export const CAMP_BUOY_LINE = { x0: CAMP_RES.x0 + 4, x1: CAMP_RES.x1 - 4, y: 368 } as const;
/** 관리 부스 (미끼·대여) 이름 팻말 · 나룻배 팻말. 11/26 이름 팻말은 자판기 옆으로 (사장님 앞을 가리고 글자가 사장님 머리에 걸렸다) */
export const CAMP_POND_SIGN = { x: 918, y: 262 } as const;
// 11/26 나룻배 팻말은 선착장 뿌리 둑 위로 (전에는 11번 카라반 3단계 앞마당에 걸렸다 — 어느 모델·단계에도 안 닿게)
export const CAMP_BOAT_SIGN = { x: 982, y: 408 } as const;

/** (x,y)가 마른 판 위인지 (잔교·좌대·선착장 — 물 위지만 걷는다) */
export function onCampDeck(x: number, y: number): boolean {
  const inR = (r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  const P = CAMP_PIER;
  if (x >= P.x0 && x <= P.x1 && Math.abs(y - P.y) <= P.w / 2) return true;
  if (inR(CAMP_ROW_DOCK_RECT)) return true;
  for (const r of CAMP_RAFTS) if (inR(campRaftDeck(r)) || campRaftWalks(r).some(inR)) return true;
  for (const r of CAMP_POOL_ROCKS) if (Math.hypot(x - r.x, (y - r.y) * 1.3) <= 13) return true;
  return false;
}
/** 11/26 헤엄치는 물 (소·계곡·저수지 — 다리·징검다리·잔교·좌대·바위 위는 빼고). 마을 강·호수처럼 걸어 들어가면 헤엄쳐요 */
export function campWet(x: number, y: number): boolean {
  if (campResEdge(x, y) <= 0) return !onCampDeck(x, y);
  if (campPoolD(x, y) <= 1) return !onCampDeck(x, y);
  if (inCampStream(x, y)) return !CAMP_CROSSINGS.some((c) => y >= c.y0 && y <= c.y1);
  return false;
}

// ── 2인 나룻배 셋 (윤슬 낚시터 선착장에 매어 둠 — 바닷가 카약처럼 앞 자리 = 노 젓는 사람, 뒤 자리 = 같이 탄 사람) ──
export const CAMP_ROWBOATS: readonly Pt[] = [
  { x: 1022, y: 402 },
  { x: 1026, y: 440 },
  { x: 1066, y: 421 },
];
export const CAMP_ROWBOAT_SPEED = 34;
export const CAMP_ROWBOAT_RADIUS = 56;
export type CampRowboatSeat = { id: string; boat: string; n: number; k: 0 | 1; x: number; y: number };
export const CAMP_ROWBOAT_SEATS: readonly CampRowboatSeat[] = CAMP_ROWBOATS.flatMap((p, n) =>
  ([0, 1] as const).map((k): CampRowboatSeat => ({ id: `qN${n + 1}-${k}`, boat: `qN${n + 1}`, n, k, x: p.x, y: p.y })),
);
const campRowboatSeatMap = new Map(CAMP_ROWBOAT_SEATS.map((q) => [q.id, q]));
export function campRowboatSeatById(id: string): CampRowboatSeat | undefined {
  return campRowboatSeatMap.get(id);
}
/** 나룻배가 다닐 수 있는 물 (부표 줄 아래 저수지, 선착장·둑에 부딪힌다) */
export function campRowboatWater(x: number, y: number): boolean {
  const R = CAMP_RES;
  if (x < R.x0 + 8 || x > R.x1 - 8 || y < CAMP_BUOY_LINE.y + 8 || y > R.y1 - 6) return false;
  const D = CAMP_ROW_DOCK_RECT;
  return !(x >= D.x - 4 && x <= D.x + D.w + 4 && y >= D.y - 6 && y <= D.y + D.h + 6);
}
/** 나룻배에서 내려서는 자리 (선착장 위) */
export function campRowboatDismount(p: Pt): Pt {
  const D = CAMP_ROW_DOCK_RECT;
  return { x: Math.max(D.x + 8, Math.min(D.x + D.w - 8, p.x)), y: D.y + D.h / 2 + 2 };
}

// ── 낚시 바위 여섯 (달그늘 소 양옆 — 왼쪽 셋은 오른쪽 물을, 오른쪽 셋은 왼쪽 물을 본다) ──
export const CAMP_POOL_ROCKS: readonly (Pt & { side: -1 | 1 })[] = [
  { x: 488, y: 246, side: -1 },
  { x: 482, y: 276, side: -1 },
  { x: 492, y: 306, side: -1 },
  { x: 792, y: 246, side: 1 },
  { x: 798, y: 276, side: 1 },
  { x: 788, y: 306, side: 1 },
];
/** 자판기 셋 (소 오른쪽 둑, 동쪽 길을 보고 나란히 — 빨강 음료·파랑 커피·초록 간식) */
export const CAMP_VENDING_ROW: readonly Pt[] = [842, 866, 890].map((x) => ({ x, y: 264 }));
/** 계곡 족욕탕 (바닥 가운데 기준 — 80×122 데크) */
export const CAMP_FOOTBATH = { x: 392, y: 194, w: 80, h: 122 } as const;

// ── 캠프파이어 존 (오른쪽 아래) ── 큰 모닥불 + 통나무 의자 12 · 작은 불멍 둘 · 바베큐 그릴 · 간식 수레
export const CAMP_FIRE = { x: 1118, y: 670 } as const;
/** 광장 바닥 반지름 (흙·돌 원) */
export const CAMP_PLAZA_R = 88;
/** 큰 모닥불 (마을 모닥불과 같은 "불멍" 연출 — 통나무 의자 qL1~12에 앉으면) */
export const CAMP_CAMPFIRE: Campfire = { id: "fireC", x: CAMP_FIRE.x, y: CAMP_FIRE.y, big: true };
/** 통나무 의자 고리 (불 가운데 기준 타원) */
export const CAMP_LOG_RX = 64;
export const CAMP_LOG_RY = 50;
/** 크리스마스 트리 (광장 위쪽) */
export const CAMP_XTREE_AT = { x: CAMP_FIRE.x, y: CAMP_FIRE.y - 70 } as const;
/** 작은 불멍 자리 둘 (벤치 쉼터 · 해먹 쉼터) */
export const CAMP_PITS: readonly (Pt & { kind: "bench" | "hammock" })[] = [
  { x: 978, y: 604, kind: "bench" },
  { x: 968, y: 744, kind: "hammock" },
];
/**
 * 11/26 캠핑장 해먹 (운영자 「펜션 해먹·간판 입구 해먹에 누울 수 있게」): E → 해먹에 눕기 (상태 STATE.hammock, 한 사람 — 서버 좌석 표 campSlots).
 * x·y = 해먹 받침 (그림 바닥 가운데), 눕는 자리(앵커) = y − CAMP_HAMMOCK_LIFT. skin = 천 무늬 (sprites/hammockArt — 누운 사람과 같은 천).
 * qM1 = 펜션 정원 간판 옆 · qM2·qM3 = 캠프파이어 존 해먹 쉼터 · qM4 = 달빛채(14번 터) 3단계 마당 (그 집 마당에 해먹이 있을 때만 — 화면이 연다)
 */
export const CAMP_HAMMOCK_LIFT = 5;
export type CampHammock = { id: string; x: number; y: number; skin: "campSun" | "campMint"; lot?: number };
export const CAMP_HAMMOCKS: readonly CampHammock[] = [
  // 11/26 qM1은 정류장 이름표(「마을행 · 언젠가 캠핑장 정류장」) 바로 위라 E 안내가 이름표와 겹쳤다 → 10px 위로
  { id: "qM1", x: 186, y: 540, skin: "campSun" },
  { id: "qM2", x: CAMP_PITS[1].x - 40, y: CAMP_PITS[1].y + 6, skin: "campSun" },
  { id: "qM3", x: CAMP_PITS[1].x + 44, y: CAMP_PITS[1].y + 14, skin: "campMint" },
  // 11/26 달빛채 3단계 아래 단 데크 오른쪽 (집 오른쪽 띠는 바비큐 아래 화로대 — 업그레이드에서 파라솔 탁자를 빼지 않으려고 옮겼다)
  { id: "qM4", x: 281, y: 372, skin: "campMint", lot: 14 },
];
export const campHammockById = (id: string): CampHammock | undefined => CAMP_HAMMOCKS.find((h) => h.id === id);
/** 폭포 다리 앞 작은 모닥불 (통나무 넷 — 폭포를 보며 불멍) */
// 11/26 카라반 1번 오른쪽 위에 너무 붙어 있어 왼쪽 위로 (카라반 지붕·마당과 띄우고, 폭포 다리 길은 그대로)
export const CAMP_SMALL_FIRE = { x: 548, y: 352 } as const;
/** 펜션 정원 화로대 (통나무 넷) */
export const CAMP_GARDEN_FIRE = { x: 160, y: 486 } as const;
/** 캠핑장 모닥불 다섯 (큰 모닥불 + 작은 불 넷) */
export const CAMP_CAMPFIRES: readonly Campfire[] = [
  CAMP_CAMPFIRE,
  { id: "fireS", x: CAMP_SMALL_FIRE.x, y: CAMP_SMALL_FIRE.y },
  { id: "fireP1", x: CAMP_PITS[0].x, y: CAMP_PITS[0].y },
  { id: "fireP2", x: CAMP_PITS[1].x, y: CAMP_PITS[1].y },
  { id: "fireG", x: CAMP_GARDEN_FIRE.x, y: CAMP_GARDEN_FIRE.y },
];
/** 바베큐 그릴·탁자 (캠프파이어 존 윗줄) */
export const CAMP_GRILL = { x: 1112, y: 552 } as const;
export const CAMP_GRILL_TABLE = { x: 1160, y: 566 } as const;
/** 마시멜로·핫도그 간식 수레 */
export const CAMP_SNACK = { x: 1238, y: 756 } as const;

// ── 소슬 펜션 구역 ── 입구 아치 · 「소슬 펜션」 간판 · 정원 (집터는 campHomes CAMP_LOTS)
export const CAMP_PENSION_GATE = { x: 330, y: 540 } as const;
export const CAMP_PENSION_SIGN = { x: 248, y: 574 } as const;
// 11/26 「펜션 분양」 입간판(372, 572)은 뺐다 (운영자 「헷갈려한다」 — 펜션 분양은 소슬댁에게 말을 걸어서만)

// ── 11/26 놀이터 (펜션 정원 옆) ── 대형 트램펄린 8인 · 워터 슬라이드 (겨울·크리스마스판엔 눈썰매 언덕 — 같은 자리)
/** 대형 트램펄린 매트 (타원) */
export const CAMP_TRAMPOLINE = { x: 62, y: 470, rx: 48, ry: 28 } as const;
/**
 * 11/26 트램펄린은 여덟 명까지 (자리 id qJ1~8 — 자리마다 튀는 박자가 다르다). 운영자 「입구로만 타고, 위에서는 돌아다니며 계속 튄다」:
 * 앞 가운데 사다리(입구)에서만 올라타고 내리며, 탄 동안은 매트 안(CAMP_TRAMP_AREA)을 걷고 뛴다 — 서버는 나룻배처럼 위치를 따라가되 매트 밖은 안으로 당긴다
 */
export const CAMP_TRAMP_SEATS = 8;
export const campTrampSeatId = (i: number): string => `qJ${i + 1}`;
/** 사다리 (입구): 밖에서 E를 누르는 자리 · 올라선 매트 안 첫 자리 */
export const CAMP_TRAMP_GATE = { x: CAMP_TRAMPOLINE.x, y: CAMP_TRAMPOLINE.y + CAMP_TRAMPOLINE.ry + 10 } as const;
export const CAMP_TRAMP_IN = { x: CAMP_TRAMPOLINE.x, y: CAMP_TRAMPOLINE.y + CAMP_TRAMPOLINE.ry - 12 } as const;
/** 탄 사람이 다니는 매트 안 (그물 기둥 안쪽) */
export const CAMP_TRAMP_AREA = { x: CAMP_TRAMPOLINE.x, y: CAMP_TRAMPOLINE.y + 2, rx: CAMP_TRAMPOLINE.rx - 9, ry: CAMP_TRAMPOLINE.ry - 9 } as const;
/** 사다리 밖에서 올라타요 → 서버가 받는 거리 (매트 안 첫 자리에서) */
export const CAMP_TRAMP_RADIUS = 40;
/** 트램펄린 자리마다 튀는 박자 어긋남 (ms — 여덟이 한꺼번에 뛰지 않고 물결처럼) */
export function campTrampPhase(seatId: string): number {
  const n = Number(seatId.slice(2));
  return Number.isFinite(n) ? ((n * 5) % 8) * 131 : 0;
}
/** 워터 슬라이드 (탑 받침 가운데) · 작은 풀 */
export const CAMP_SLIDE = { x: 262, y: 472, pool: { x: 238, y: 516, rx: 30, ry: 12 } } as const;
/** 워터 슬라이드 한 자리 (id qZ — 사다리 밑에서 타요. 오르고 미끄러져 풀에 빠지는 동안 차지한다, 위치는 타는 동안 따라간다) */
export const CAMP_SLIDE_SEAT = { id: "qZ", x: 289, y: 507 } as const;

// ── 계곡 낚시 자리 ── 마을 낚시와 같은 1인 자리(SPOT_KINDS.fish, 서버 좌석 — 정해진 자리만).
// id = "f_x_y" (마을 낚시 자리 id와 겹치지 않는다 — camp.test가 본다). 물: 옛길 계곡 valley · 달그늘 소 pool · 윤슬 낚시터 reservoir (나룻배 위는 boat:reservoir)
export const CAMP_FISH_BANK = 34;
const campBank = (y: number, side: -1 | 1): FishingSpot => {
  const x = Math.round(campStreamX(y) + side * CAMP_FISH_BANK);
  return { id: `f_${x}_${y}`, water: "valley", x, y, facing: side < 0 ? DIR.right : DIR.left };
};
const spot = (water: FishingSpot["water"], x: number, y: number, facing: DirId): FishingSpot => ({ id: `f_${x}_${y}`, water, x, y, facing });
/** 11/27 잔교 북쪽 가장자리 낚시 자리 x (좌대 4~6 사다리 줄 x 1022·1100·1178, 수영 팻말 x 1061을 비켜서) */
export const CAMP_PIER_SPOT_XS: readonly number[] = [998, 1036, 1086, 1124, 1156, 1192];
/** 윤슬 낚시터 둑 자리 (석축 위 — 물을 본다) */
const R0 = CAMP_RES;
export const CAMP_FISHING_SPOTS: readonly FishingSpot[] = [
  // 달그늘 소 낚시 바위 여섯
  ...CAMP_POOL_ROCKS.map((r) => spot("pool", r.x + r.side * 4, r.y - 8, r.side < 0 ? DIR.right : DIR.left)),
  // 옛길 계곡 둑 여덟
  ...[452, 548, 640, 690].map((y) => campBank(y, -1)),
  ...[420, 520, 620, 690].map((y) => campBank(y, 1)),
  // 윤슬 낚시터 둑 여섯 (아래 셋 · 위 둘 · 오른쪽 나룻배 구역 하나).
  // 11/26 운영자 「중간 좌대 기준 저수지 양옆 낚시 자리는 다 빼 버려, 좌대랑 겹치잖아」 — 좌대 줄 높이의 왼쪽·오른쪽 둑 자리 여섯(y 112~350)을 뺐다
  ...[1040, 1100, 1160].map((x) => spot("reservoir", x, R0.y1 + 8, DIR.up)),
  spot("reservoir", R0.x1 + 6, 420, DIR.left),
  ...[1060, 1140].map((x) => spot("reservoir", x, R0.y0 - 4, DIR.down)),
  // 11/27 잔교 북쪽 가장자리 여섯 (좌대 입장권이 없어도 앉는 자리 — 물 건너 좌대 쪽 물을 본다). 사다리로 가는 헤엄 길(좌대 가운데 x)·수영 팻말은 비웠다
  ...CAMP_PIER_SPOT_XS.map((x) => spot("reservoir", x, CAMP_PIER.y - CAMP_PIER.w / 2 + 8, DIR.up)),
  // 좌대 여섯 × 의자 하나 (늘 마지막 여섯 자리 — 좌대 입장권 protocol raft.ts campRaftOfSpot)
  ...CAMP_RAFTS.map((r) => spot("reservoir", r.x + campRaftSeatDx(r), r.y + CAMP_RAFT_SEAT_DY, DIR.down)),
];
export function campFishingSpotById(id: string): FishingSpot | undefined {
  return CAMP_FISHING_SPOTS.find((s) => s.id === id);
}
/** 낚시 자리 id → 물 종류 (마을 자리·배 위 가상 자리·캠핑장 자리·바닷가 자리). 웹 서버(lib/forage)가 쓴다 */
export function anyFishingWaterOf(id: string): FishingSpot["water"] | null {
  return fishingWaterOf(id) ?? campFishingSpotById(id)?.water ?? seaFishingSpotById(id)?.water ?? null;
}

// ── NPC ── 관리소 언젠가 씨(카라반 분양) · 매점 알바 · 계곡 할머니 · 기타 캠퍼(밤 9~11시) · 소슬댁(펜션 분양) · 순이 할머니(촌캉스 분양)
export type CampNpcId = "keeper" | "clerk" | "granny" | "guitarist" | "sosul" | "suni";
export const CAMP_NPCS: readonly { id: CampNpcId; name: string; x: number; y: number; facing: DirId }[] = [
  { id: "keeper", name: "언젠가 씨", x: 356, y: 698, facing: DIR.down },
  { id: "clerk", name: "매점 알바", x: 452, y: 694, facing: DIR.down },
  { id: "granny", name: "계곡 할머니", x: Math.round(campStreamX(500) - 40), y: 500, facing: DIR.right },
  { id: "guitarist", name: "기타 캠퍼", x: CAMP_FIRE.x + 46, y: CAMP_FIRE.y + 70, facing: DIR.left },
  { id: "sosul", name: "소슬댁", x: 290, y: 566, facing: DIR.down },
  { id: "suni", name: "순이 할머니", x: 52, y: 216, facing: DIR.right },
];

// ── 앉는 자리 (좌석 판정은 서버) ── id는 마을 좌석과 겹치지 않게 모두 "q"로 시작한다
const faceTo = (dx: number, dy: number): DirId => (Math.abs(dx) > Math.abs(dy) * 1.1 ? (dx > 0 ? DIR.left : DIR.right) : dy > 0 ? DIR.up : DIR.down);
function logChairs(): Furniture[] {
  const out: Furniture[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // 불을 바라본다 (가까운 네 방향)
    out.push({ id: `qL${i + 1}`, kind: "chair", x: Math.round(CAMP_FIRE.x + dx * CAMP_LOG_RX), y: Math.round(CAMP_FIRE.y + 6 + dy * CAMP_LOG_RY), facing: faceTo(dx, dy), seatOffsets: [0], campfire: CAMP_CAMPFIRE.id });
  }
  return out;
}
/** 작은 불 둘레 통나무 넷 (fire 기준 오프셋) */
function smallLogs(prefix: string, fire: string, c: Pt, offs: readonly [number, number][]): Furniture[] {
  return offs.map(([dx, dy], i) => ({ id: `${prefix}${i + 1}`, kind: "chair", x: c.x + dx, y: c.y + dy, facing: faceTo(dx, dy - 6), seatOffsets: [0], campfire: fire }));
}
/** 폭포 다리 가운데 x */
export const CAMP_VIEW_BRIDGE_X = Math.round(campStreamX(CAMP_VIEW_BRIDGE.y));
/** 11/26 족욕탕 양옆 자리 x (데크 왼쪽·오른쪽 끝에서 — 탕 돌 테 위, 다리는 탕 물에 담근다) · 일어서면 데크 쪽으로 비켜선다 */
export const CAMP_FOOT_SIDE_DX = 16;
const CAMP_FOOT_SIDE_STAND_DX = 7;
/** 11/26 족욕탕 앞 자리 y (데크 위 끝에서 — 탕 아래 돌 테 위, 다리는 탕 물에) */
export const CAMP_FOOT_FRONT_DY = 97;
/** 계곡 족욕탕 자리 (데크 왼쪽 위 기준 — 양옆 벤치 넷씩 + 앞 둘, 발을 탕에 담근다) */
const FB0 = { x: CAMP_FOOTBATH.x - CAMP_FOOTBATH.w / 2, y: CAMP_FOOTBATH.y - CAMP_FOOTBATH.h };

export const CAMP_FURNITURE: readonly Furniture[] = [
  // 정류장 지붕 아래 녹슨 벤치
  { id: "qB", kind: "bench", x: CAMP_BUS_STOP.x, y: CAMP_BUS_STOP.y - 8, facing: DIR.down, seatOffsets: [-12, 12] },
  // 관리소 앞 나무 벤치
  { id: "qF", kind: "bench", x: 300, y: 708, facing: DIR.down, seatOffsets: [-10, 10] },
  // 캠프파이어 존 큰 모닥불 통나무 12
  ...logChairs(),
  // 폭포 다리 앞 작은 모닥불 (통나무 넷)
  ...smallLogs("qS", "fireS", CAMP_SMALL_FIRE, [
    [-23, -2],
    [23, -2],
    [-13, 16],
    [13, 16],
  ]),
  // 불멍 벤치 쉼터 (양옆 벤치 + 앞 벤치)
  { id: "qP1", kind: "bench", x: CAMP_PITS[0].x - 30, y: CAMP_PITS[0].y + 2, facing: DIR.down, seatOffsets: [-8, 8], campfire: "fireP1" },
  { id: "qP2", kind: "bench", x: CAMP_PITS[0].x + 30, y: CAMP_PITS[0].y + 2, facing: DIR.down, seatOffsets: [-8, 8], campfire: "fireP1" },
  { id: "qP3", kind: "bench", x: CAMP_PITS[0].x, y: CAMP_PITS[0].y + 26, facing: DIR.up, seatOffsets: [-8, 8], campfire: "fireP1" },
  // 해먹 쉼터 앞 통나무
  { id: "qP4", kind: "chair", x: CAMP_PITS[1].x, y: CAMP_PITS[1].y + 22, facing: DIR.up, seatOffsets: [0], campfire: "fireP2" },
  // 펜션 정원 화로대 (통나무 넷) · 정원 벤치 · 그네 의자
  ...smallLogs("qG", "fireG", CAMP_GARDEN_FIRE, [
    [-22, -2],
    [22, -2],
    [-14, 16],
    [14, 16],
  ]),
  { id: "qGB", kind: "bench", x: 160, y: 450, facing: DIR.down, seatOffsets: [-10, 10] },
  { id: "qGS", kind: "bench", x: 136, y: 546, facing: DIR.down, seatOffsets: [-7, 7] },
  // 폭포 다리 (난간 앞 긴 의자 둘 — 폭포를 본다. 앉으면 「폭포 멍」 시점)
  { id: "qW1", kind: "bench", x: CAMP_VIEW_BRIDGE_X - 24, y: CAMP_VIEW_BRIDGE.y - 2, facing: DIR.up, seatOffsets: [-9, 9] },
  { id: "qW2", kind: "bench", x: CAMP_VIEW_BRIDGE_X + 24, y: CAMP_VIEW_BRIDGE.y - 2, facing: DIR.up, seatOffsets: [-9, 9] },
  // 계곡 족욕탕 (양옆 벤치 넷씩 — 탕을 본다, 앞 짧은 벤치 둘 — 위를 본다).
  // 11/26 양옆 자리는 벤치 물가 끝 (발이 탕 물에 닿게 — 발 담그기 연출 game/camp/campFootbath)
  ...[38, 54, 70, 86].flatMap((y, i): Furniture[] => [
    { id: `qT${i * 2 + 1}`, kind: "chair", x: FB0.x + CAMP_FOOT_SIDE_DX, y: FB0.y + y + 4, facing: DIR.right, seatOffsets: [0] },
    { id: `qT${i * 2 + 2}`, kind: "chair", x: FB0.x + CAMP_FOOTBATH.w - CAMP_FOOT_SIDE_DX, y: FB0.y + y + 4, facing: DIR.left, seatOffsets: [0] },
  ]),
  { id: "qT9", kind: "chair", x: FB0.x + 18, y: FB0.y + CAMP_FOOT_FRONT_DY, facing: DIR.up, seatOffsets: [0] },
  { id: "qT10", kind: "chair", x: FB0.x + CAMP_FOOTBATH.w - 19, y: FB0.y + CAMP_FOOT_FRONT_DY, facing: DIR.up, seatOffsets: [0] },
  // 족욕탕 아래 쉼 벤치 둘
  { id: "qK1", kind: "bench", x: 380, y: 262, facing: DIR.down, seatOffsets: [-8, 8] },
  { id: "qK2", kind: "bench", x: 414, y: 262, facing: DIR.down, seatOffsets: [-8, 8] },
];

/**
 * 11/26 촌캉스 아궁이 불 켜기·끄기 알림 id (실시간 use u — "ag{터}"). 월드 채널은 use를 받지 않지만 이 id만 같은 맵 사람에게 중계한다 (저장 없음)
 */
export const CAMP_FIRE_USE_RE = /^ag(\d{1,2})$/;
export const campFireUseId = (lot: number): string => `ag${lot}`;

/** 폭포 다리 의자인지 (앉으면 「폭포 멍」 시점 바꾸기) */
export function campFallsViewSeat(seatId: string): boolean {
  return seatId.startsWith("qW");
}

/**
 * 11/26 캠핑장 집터 앉을 자리 (집 화면 담당이 campHomes.ts에 CAMP_HOME_SEATS를 넣으면 여기서 좌석 표에 합친다).
 * 모양은 가구(Furniture — seatOffsets) 또는 좌석(Seat) 둘 다 받는다. 아직 없으면 빈 목록
 */
const homeSeatSrc: readonly (Furniture | Seat)[] = ((CampHomes as Record<string, unknown>).CAMP_HOME_SEATS as readonly (Furniture | Seat)[] | undefined) ?? [];
const homeSeats: readonly Seat[] = homeSeatSrc.flatMap((f): Seat[] =>
  "seatOffsets" in f
    ? f.seatOffsets.map((dx, i) => ({ id: f.seatOffsets.length > 1 ? `${f.id}-${i}` : f.id, furnitureId: f.id, x: f.x + dx, y: f.y, facing: f.facing }))
    : [f],
);

/** 좌석 id: 의자는 furniture id 그대로, 벤치는 `${id}-${i}` (마을 SEATS와 같은 규칙) */
export const CAMP_SEATS: readonly Seat[] = [
  ...CAMP_FURNITURE.flatMap((f) =>
    f.seatOffsets.map((dx, i): Seat => ({
      id: f.seatOffsets.length > 1 ? `${f.id}-${i}` : f.id,
      furnitureId: f.id,
      x: f.x + dx,
      y: f.y,
      facing: f.facing,
      ...(f.id.startsWith("qT") && f.facing !== DIR.up ? { standDx: f.facing === DIR.right ? -CAMP_FOOT_SIDE_STAND_DX : CAMP_FOOT_SIDE_STAND_DX, standDy: 3 } : {}),
    })),
  ),
  ...homeSeats,
];
const campSeatMap = new Map(CAMP_SEATS.map((s) => [s.id, s]));
export function campSeatById(id: string): Seat | undefined {
  return campSeatMap.get(id);
}
const campFireById = new Map(CAMP_CAMPFIRES.map((c) => [c.id, c]));
const campFurnById = new Map(CAMP_FURNITURE.map((f) => [f.id, f]));
/** 이 캠핑장 좌석이 모닥불 둘레 자리면 그 모닥불 (마을 campfireOfSeat과 같은 뜻 — 큰 모닥불·작은 불 넷) */
export function campCampfireOfSeat(seatId: string): Campfire | null {
  const s = campSeatMap.get(seatId);
  const f = s ? campFurnById.get(s.furnitureId) : undefined;
  return f?.campfire ? (campFireById.get(f.campfire) ?? null) : null;
}
const campSlots = new Map<string, SeatSlot>(CAMP_SEATS.map((s) => [s.id, { id: s.id, kind: "seat", x: s.x, y: s.y, facing: s.facing, state: STATE.sitChair, furnitureId: s.furnitureId }]));
// 낚시 자리도 정해진 자리로 받는다 (마을 낚시 자리처럼 kind "fish")
for (const f of CAMP_FISHING_SPOTS) campSlots.set(f.id, { id: f.id, kind: "fish", x: f.x, y: f.y, facing: f.facing, state: SPOT_KINDS.fish.state, furnitureId: null });
// 11/26 윤슬 낚시터 2인 나룻배: 바닷가 카약처럼 같은 배 두 자리 (가구 id = 배). 같이 타기는 노 젓는 사람 곁이면 물 위에서도
// 11/26 놀이터: 트램펄린 여덟 자리(매트 안을 다니며 튄다 — 나룻배처럼 mobile, 매트 밖은 서버가 안으로) · 워터 슬라이드 한 자리(타는 동안 움직인다)
for (let i = 0; i < CAMP_TRAMP_SEATS; i++) {
  const id = campTrampSeatId(i);
  campSlots.set(id, {
    id,
    kind: "trampoline",
    x: CAMP_TRAMP_IN.x,
    y: CAMP_TRAMP_IN.y,
    facing: DIR.up,
    state: STATE.trampoline,
    // 자리마다 따로 (같은 가구면 「같은 배 동승자 곁」 규칙으로 멀리서도 타진다)
    furnitureId: id,
    mobile: true,
    drift: true,
    radius: CAMP_TRAMP_RADIUS,
    area: { ...CAMP_TRAMP_AREA },
  });
}
campSlots.set(CAMP_SLIDE_SEAT.id, { id: CAMP_SLIDE_SEAT.id, kind: "boat", x: CAMP_SLIDE_SEAT.x, y: CAMP_SLIDE_SEAT.y, facing: DIR.up, state: STATE.boat, furnitureId: CAMP_SLIDE_SEAT.id, mobile: true, radius: 40, drift: true });
// 11/26 해먹 (한 사람 — 눕는 자리 = 받침 위 CAMP_HAMMOCK_LIFT)
for (const h of CAMP_HAMMOCKS) campSlots.set(h.id, { id: h.id, kind: "hammock", x: h.x, y: h.y - CAMP_HAMMOCK_LIFT, facing: DIR.down, state: STATE.hammock, furnitureId: null });
for (const q of CAMP_ROWBOAT_SEATS)
  campSlots.set(q.id, { id: q.id, kind: "boat", x: q.x, y: q.y, facing: DIR.down, state: STATE.boat, furnitureId: q.boat, mobile: true, radius: CAMP_ROWBOAT_RADIUS, drift: true });
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
  // 11/26 캠핑장 트램펄린은 정해진 여덟 자리(qJ)만 — 아무 좌표의 트램펄린 자리(j_x_y)는 받지 않는다
  if (map === "camp" && spot.kind === "trampoline") return undefined;
  // 11/26 캠핑장 해먹도 정해진 넷(qM1~4)만 — 아무 좌표의 해먹 자리(m_x_y)는 받지 않는다 (한 해먹에 둘이 눕지 않게)
  if (map === "camp" && spot.kind === "hammock") return undefined;
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

// ── 11/26 캠핑장 개편 계약 (다른 작업이 미리 쓰는 자리 — 맵 개편 때 좌표만 다듬고 이름은 그대로 둔다) ──
/** 캠핑장 상인 「낚시터 사장님」 (윤슬 낚시터 관리 부스 앞 — 물고기·채집물을 다 산다. 판매는 lib/forage NPCS "trader", 그리기·E는 world/forage/Foraging) */
export const CAMP_TRADER = { x: 904, y: 214 } as const;
/** 상인 부스 (미끼·대여 부스 — 6차 시안 BOOTH) 바닥 가운데. 11/26 사장님 이름표가 부스 그림에 얹히지 않게 조금 뒤로 */
export const CAMP_TRADER_STALL = { x: 904, y: 172 } as const;
