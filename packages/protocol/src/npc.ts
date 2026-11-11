// 22번 돌아다니는 NPC 공용 (서버·클라이언트가 같은 값을 쓴다).
//
// 고양이·유령: 서버는 아무것도 하지 않는다. 클라이언트가 (채널 번호 = 시드, 서버 시계)만으로 결정적으로 계산하므로
//   같은 채널의 모두가 같은 자리에서 같은 고양이를 본다 (매 틱 네트워크 0, DO 비용 0). 서버 시계는 welcome.now로 맞춘다.
// 황금 고블린(보너스 요정): 등장·주인은 서버(Channel DO)가 정한다. 등장 알림에 시드와 등장 시각만 실어 보내고,
//   움직임은 아래 goblinPos(시드, 시각)로 서버·클라이언트가 똑같이 계산한다 → 서버는 "잡았다" 요청이 오면
//   그 순간 고블린 위치와 서버가 아는 플레이어 위치의 거리만 본다. 가장 먼저 닿은 한 명이 서명된 보상 증서를 받는다.

/** 안내·알림에 쓰는 이름 */
export const GOBLIN_NAME = "황금 고블린(보너스 요정)";
/** 나타나 있는 시간 */
export const GOBLIN_LIFE_MS = 90_000;
/** 다음 등장까지 (한 채널에 사람이 계속 있으면 하루 4~8번쯤) */
export const GOBLIN_GAP_MIN_MS = 3 * 3_600_000;
export const GOBLIN_GAP_MAX_MS = 6 * 3_600_000;
/** 처음 켜진 채널의 첫 등장 */
export const GOBLIN_FIRST_MIN_MS = 10 * 60_000;
export const GOBLIN_FIRST_MAX_MS = 2 * 3_600_000;
/** 예정 시각에 아무도 없었으면, 사람이 다시 생긴 뒤 이만큼 지나서 (들어오자마자 나오지 않게) */
export const GOBLIN_LATE_MIN_MS = 2 * 60_000;
export const GOBLIN_LATE_MAX_MS = 15 * 60_000;
/** 보상 (서버가 등장 때 정한다) */
export const GOBLIN_POINTS_MIN = 20;
export const GOBLIN_POINTS_MAX = 100;
/** 서버 판정: 서버가 아는 플레이어 위치(마지막 MOVE)와 그 순간 고블린 위치의 거리 상한 (지연·보간 여유 포함) */
export const GOBLIN_CLAIM_RADIUS = 40;
/** 클라이언트: 내 발이 화면 속 고블린에 이만큼 닿으면 잡기 요청 */
export const GOBLIN_TOUCH_RADIUS = 14;
/** 보상 증서 유효 시간 (웹 API가 받는 시한) */
export const GOBLIN_GRANT_TTL_SEC = 600;

/** 등장 정보 (서버 → 모두). at/until = 서버 시계(ms) */
export type GoblinInfo = { id: string; seed: number; at: number; until: number };

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
export const GOBLIN_ROUTES: readonly { zone: string; pts: readonly (readonly [number, number])[] }[] = [
  { zone: "광장", pts: [[1167, 462], [1086, 587], [1019, 536], [868, 503], [897, 391], [1030, 409], [1116, 376]] },
  { zone: "정문 앞마당", pts: [[1105, 132], [1058, 170], [1006, 173], [955, 161], [951, 119], [999, 93], [1043, 97]] },
  { zone: "쉼터", pts: [[751, 504], [709, 555], [633, 538], [592, 530], [580, 478], [659, 427], [710, 466]] },
  { zone: "강 건너 풀밭", pts: [[1134, 1100], [1103, 1196], [924, 1281], [835, 1211], [827, 1037], [948, 1059], [1076, 1004]] },
  { zone: "숲", pts: [[485, 1125], [406, 1230], [294, 1176], [248, 1151], [232, 1069], [305, 1062], [385, 1049]] },
  { zone: "별 보기 언덕", pts: [[367, 164], [318, 228], [201, 243], [161, 210], [164, 171], [212, 120], [288, 121]] },
  { zone: "주거 구역", pts: [[1776, 744], [1762, 793], [1702, 844], [1601, 779], [1580, 700], [1708, 645], [1749, 706]] },
  { zone: "강변 산책로", pts: [[865, 782], [770, 824], [698, 850], [567, 792], [594, 699], [691, 664], [767, 694]] },
];

/** 이 고블린의 경로 */
export function goblinRoute(seed: number): (typeof GOBLIN_ROUTES)[number] {
  return GOBLIN_ROUTES[(seed >>> 0) % GOBLIN_ROUTES.length];
}

/** 달아나는 속도 (px/s) — 뛰는 사람(약 100px/s)이 겨우 따라잡을 만큼 */
export const GOBLIN_SPEED = 92;
const DWELL_MS = 1800;

export type GoblinPose = { x: number; y: number; /** 달리는 중 */ dash: boolean; /** 바라보는 쪽 (-1 왼쪽, 1 오른쪽) */ face: -1 | 1 };

/**
 * 시각 t(서버 ms)의 고블린 위치. 같은 (seed, at)이면 서버·모든 클라이언트가 같은 값을 얻는다.
 * 등장 전이면 첫 점, 끝난 뒤에도 마지막 계산 위치 (호출하는 쪽이 until을 따로 본다).
 */
export function goblinPos(g: { seed: number; at: number }, t: number, out: GoblinPose = { x: 0, y: 0, dash: false, face: 1 }): GoblinPose {
  const pts = goblinRoute(g.seed).pts;
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
