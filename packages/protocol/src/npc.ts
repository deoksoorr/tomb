import type { AwayMapId, MapId } from "./camp";
import { CAMP_GOBLIN_ROUTES, SEA_GOBLIN_ROUTES, type GoblinRoute } from "./goblinMaps";

// 22번 돌아다니는 NPC 공용 (서버·클라이언트가 같은 값을 쓴다).
//
// 고양이·유령: 서버는 아무것도 하지 않는다. 클라이언트가 (채널 번호 = 시드, 서버 시계)만으로 결정적으로 계산하므로
//   같은 채널의 모두가 같은 자리에서 같은 고양이를 본다 (매 틱 네트워크 0, DO 비용 0). 서버 시계는 welcome.now로 맞춘다.
// 황금 고블린(보너스 요정): 등장·주인은 서버(Channel DO)가 정한다. 등장 알림에 시드와 등장 시각만 실어 보내고,
//   움직임은 아래 goblinPos(시드, 시각)로 서버·클라이언트가 똑같이 계산한다 → 서버는 "잡았다" 요청이 오면
//   그 순간 고블린 위치와 서버가 아는 플레이어 위치의 거리만 본다. 가장 먼저 닿은 한 명이 서명된 보상 증서를 받는다.

/** 안내·알림에 쓰는 이름 */
export const GOBLIN_NAME = "황금 고블린(보너스 요정)";
/** 나타나 있는 시간 (11/26 90초 → 3분: 다른 맵에서 버스를 타고 와도 잡을 수 있게) */
export const GOBLIN_LIFE_MS = 180_000;
/** 다음 등장까지 (한 채널에 사람이 계속 있으면 하루 4~8번쯤) */
export const GOBLIN_GAP_MIN_MS = 3 * 3_600_000;
export const GOBLIN_GAP_MAX_MS = 6 * 3_600_000;
/** 처음 켜진 채널의 첫 등장 */
export const GOBLIN_FIRST_MIN_MS = 10 * 60_000;
export const GOBLIN_FIRST_MAX_MS = 2 * 3_600_000;
/** 예정 시각에 아무도 없었으면, 사람이 다시 생긴 뒤 이만큼 지나서 (들어오자마자 나오지 않게) */
export const GOBLIN_LATE_MIN_MS = 2 * 60_000;
export const GOBLIN_LATE_MAX_MS = 15 * 60_000;
/**
 * 보상 (서버가 등장 때 정한다). 11/19 한도가 없어지고 집·펫 값이 2~3배 올라 20~100P는 달려갈 이유가 없었다 →
 * 보통 300~1,000P(10P 단위, 고르게) + 드물게 대박 2,000P. 평균 약 690P = 사냥 20분쯤.
 * 등장 빈도(채널마다 3~6시간에 한 번)는 그대로라 한 채널에서 하루 나오는 양은 많아야 6천P 남짓이다.
 */
export const GOBLIN_POINTS_MIN = 300;
export const GOBLIN_POINTS_MAX = 1000;
/** 보통 보상의 단위 (300, 310, … 1000) */
export const GOBLIN_POINTS_STEP = 10;
/** 대박 보상과 확률 (11/26 운영자: 8% → 3% — 한 채널에서 4~8일에 한 번) */
export const GOBLIN_JACKPOT_POINTS = 2000;
export const GOBLIN_JACKPOT_CHANCE = 0.03;
/** 증서가 받을 수 있는 가장 큰 보상 (grants.ts가 이보다 크면 버린다) */
export const GOBLIN_POINTS_CAP = GOBLIN_JACKPOT_POINTS;

/** 이번 고블린 보상 (서버가 등장 때 한 번 뽑는다). r = [0,1) 난수 */
export function goblinPoints(r: () => number): number {
  if (r() < GOBLIN_JACKPOT_CHANCE) return GOBLIN_JACKPOT_POINTS;
  const steps = (GOBLIN_POINTS_MAX - GOBLIN_POINTS_MIN) / GOBLIN_POINTS_STEP;
  return GOBLIN_POINTS_MIN + Math.min(steps, Math.floor(r() * (steps + 1))) * GOBLIN_POINTS_STEP;
}

/** 평균 보상 (확률 안내) */
export const GOBLIN_POINTS_AVG = (1 - GOBLIN_JACKPOT_CHANCE) * ((GOBLIN_POINTS_MIN + GOBLIN_POINTS_MAX) / 2) + GOBLIN_JACKPOT_CHANCE * GOBLIN_JACKPOT_POINTS;
/** 서버 판정: 서버가 아는 플레이어 위치(마지막 MOVE)와 그 순간 고블린 위치의 거리 상한 (지연·보간 여유 포함) */
export const GOBLIN_CLAIM_RADIUS = 40;
/** 클라이언트: 내 발이 화면 속 고블린에 이만큼 닿으면 잡기 요청 */
export const GOBLIN_TOUCH_RADIUS = 14;
/** 보상 증서 유효 시간 (웹 API가 받는 시한) */
export const GOBLIN_GRANT_TTL_SEC = 600;

/**
 * 등장 정보 (서버 → 모두). at/until = 서버 시계(ms).
 * m = 11/26 나타난 맵 (바닷가 "sea"·캠핑장 "camp"). 없으면 마을 — 마을 고블린은 옛 모양 그대로라 옛 클라이언트도 그린다
 */
export type GoblinInfo = { id: string; seed: number; at: number; until: number; m?: AwayMapId };

/** 이 고블린이 나타난 맵 */
export const goblinMapOf = (g: { m?: unknown }): MapId => (g.m === "sea" || g.m === "camp" ? g.m : "village");

export const GOBLIN_ID_RE = /^[A-Za-z0-9_-]{4,24}$/;

/** 시드 고정 난수 (mulberry32) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 정수 몇 개 → [0,1) 해시 (결정적) */
export function hashUnit(...xs: number[]): number {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h = Math.imul(h ^ (x | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

/**
 * 고블린이 뛰어다니는 고리 경로 (구역마다 하나). 이웃한 점 사이는 물을 건너지 않는다 (game/world/life 테스트가 확인).
 * 고블린은 한 점에 잠깐 머물렀다가(두리번) 옆 점으로 휙 달아난다 — 반대로 돌아서기도 한다.
 */
export const GOBLIN_ROUTES: readonly GoblinRoute[] = [
  { zone: "모닥불 광장", pts: [[648, 320], [690, 380], [860, 430], [880, 520], [720, 580], [560, 500], [580, 410]] },
  { zone: "정문 앞마당", pts: [[688, 136], [752, 136], [800, 150], [744, 72], [690, 76], [620, 130], [640, 160]] },
  // 11/19 예전 옛 묘역 자리는 등불 골목(집터 사이 골목), 언덕 서쪽은 무덤 존이라 고블린은 별 보기 마당만 돈다
  { zone: "등불 골목", pts: [[60, 416], [200, 412], [360, 418], [448, 440], [448, 520], [300, 540], [120, 540]] },
  { zone: "별 보기 마당", pts: [[236, 120], [300, 128], [350, 160], [352, 200], [300, 196], [240, 200], [228, 150]] },
  { zone: "강변 산책로", pts: [[220, 636], [300, 624], [420, 630], [560, 650], [640, 660], [520, 676], [380, 676]] },
  { zone: "주거 구역", pts: [[992, 300], [1100, 336], [1240, 336], [1380, 480], [1200, 480], [1060, 620], [992, 520]] },
  // 11/15 오리 연못이 넓어져 둑을 한 바퀴 (물을 건너지 않게). 11/16 연못이 또 넓어져 동쪽 둑은 범퍼카장 마당 가장자리로
  { zone: "안개 숲", pts: [[410, 792], [530, 792], [596, 830], [614, 898], [600, 962], [566, 1000], [430, 1002], [380, 992], [320, 944], [326, 862]] },
  // 11/16 범퍼카장이 동쪽으로 넓어져 호박밭 고리를 마당 동쪽(모닥불 둘레)으로
  { zone: "호박밭", pts: [[934, 872], [918, 960], [916, 1000], [1024, 1000], [1084, 984], [1084, 920], [1020, 900], [960, 858]] },
];

/** 맵마다 고블린 길 (11/26 바닷가·캠핑장 — goblinMaps.ts) */
export function goblinRoutesOf(map: MapId): readonly GoblinRoute[] {
  return map === "sea" ? SEA_GOBLIN_ROUTES : map === "camp" ? CAMP_GOBLIN_ROUTES : GOBLIN_ROUTES;
}

/** 이 고블린의 경로 (map 없으면 마을 — 옛 계산과 같다) */
export function goblinRoute(seed: number, map: MapId = "village"): GoblinRoute {
  const routes = goblinRoutesOf(map);
  return routes[(seed >>> 0) % routes.length];
}

/** 달아나는 속도 (px/s) — 뛰는 사람(약 100px/s)이 겨우 따라잡을 만큼 */
export const GOBLIN_SPEED = 92;
const DWELL_MS = 1800;

export type GoblinPose = { x: number; y: number; /** 달리는 중 */ dash: boolean; /** 바라보는 쪽 (-1 왼쪽, 1 오른쪽) */ face: -1 | 1 };

/**
 * 시각 t(서버 ms)의 고블린 위치. 같은 (seed, at)이면 서버·모든 클라이언트가 같은 값을 얻는다.
 * 등장 전이면 첫 점, 끝난 뒤에도 마지막 계산 위치 (호출하는 쪽이 until을 따로 본다).
 */
export function goblinPos(g: { seed: number; at: number; m?: AwayMapId }, t: number, out: GoblinPose = { x: 0, y: 0, dash: false, face: 1 }): GoblinPose {
  const pts = goblinRoute(g.seed, goblinMapOf(g)).pts;
  const n = pts.length;
  const r = mulberry32(g.seed ^ 0x5eed);
  let i = Math.floor(r() * n);
  let d = r() < 0.5 ? 1 : -1;
  let time = g.at;
  const until = Math.max(g.at, t);
  for (let hop = 0; hop < 600; hop++) {
    const dwell = DWELL_MS * (0.55 + 0.9 * r());
    const [px, py] = pts[i];
    if (until < time + dwell) {
      // 머무는 동안 제자리에서 두리번 (작게 흔들림)
      const u = (until - time) / 1000;
      out.x = px + Math.sin(u * 5.3 + i) * 2.5;
      out.y = py + Math.sin(u * 3.7 + i * 2) * 1.5;
      out.dash = false;
      return out;
    }
    time += dwell;
    if (r() < 0.3) d = -d;
    const j = (i + d + n) % n;
    const [qx, qy] = pts[j];
    const len = Math.hypot(qx - px, qy - py);
    const dash = (len / GOBLIN_SPEED) * 1000;
    out.face = qx >= px ? 1 : -1;
    if (until < time + dash) {
      const k = (until - time) / dash;
      const e = k * k * (3 - 2 * k);
      out.x = px + (qx - px) * e;
      out.y = py + (qy - py) * e;
      out.dash = true;
      return out;
    }
    time += dash;
    i = j;
  }
  out.x = pts[i][0];
  out.y = pts[i][1];
  out.dash = false;
  return out;
}
