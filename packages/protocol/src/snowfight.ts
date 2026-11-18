import type { MapId } from "./camp";
import { STATE, type StateId } from "./types";

// 11/18 마을·캠핑장 「눈싸움」 (겨울·크리스마스 판에서만 — 판은 웹이 정하고 서버는 모른다).
// - 던질 때 C2S snowball 한 번: 출발점(x,y)과 떨어질 곳(tx,ty). 서버는 간격·맵·자세·거리만 보고 번호(n)를 붙여
//   같은 맵 다른 사람에게 중계한다. 시각은 서버가 받은 때로 친다 (기기 시계는 믿지 않는다)
// - 날아가는 길은 모두가 같은 식(snowballAt)으로 그린다: 받은 때부터 뭉치기(SNOWBALL_GATHER_MS) → 날기(snowballFlightMs)
// - 맞았는지는 맞은 사람 화면이 판정한다 (자기 위치·자세·「눈싸움 안 하기」, 11/18 머리·몸 그림에 닿았을 때만 — 이름표 높이는 아니다).
//   맞았으면 C2S snowHit 한 번 (h = 맞은 높이 — 모두의 화면이 그 자리에 퍽) →
//   서버는 그 던지기가 최근 것이고 맞은 사람 서버 위치가 날아간 길 근처인지만 보고 같은 맵 모두(맞은 사람·던진 사람 포함)에게 snowHit
// 저장하는 것은 없다 (맞힌 수·맞은 수는 각 기기에 하루치만, 포인트·랭킹 없음)

/** 웹이 지키는 던지기 간격 (11/18 사용자 「쿨타임을 잡아서 막 못 던지게」 — 서버 요청 비용 1초 → 3초) */
export const SNOWBALL_INTERVAL_MS = 3_000;
/** 서버가 받는 최소 간격 (네트워크 지터 여유 — 웹 간격보다 조금 짧게). 더 잦으면 조용히 버린다 */
export const SNOWBALL_SERVER_INTERVAL_MS = 2_800;
/** 한 사람이 1분에 보낼 수 있는 던지기 메시지 (버린 것도 센다 — 넘으면 버린다. 3초 간격이면 20개라 넉넉하다) */
export const SNOWBALL_PER_MINUTE = 25;
/** 보통 던지는 거리 (px) */
export const SNOWBALL_RANGE = 140;
/** 서버가 받는 가장 먼 거리 (웹이 가까운 사람 쪽으로 겨눌 때 조금 더 멀리 간다) */
export const SNOWBALL_RANGE_MAX = 180;
/** 출발점이 서버 위치에서 이만큼 안이어야 받는다 (서버 위치는 조금 늦다) */
export const SNOWBALL_START_SLACK = 64;
/** 눈을 뭉치는 짧은 동작 (받은 때부터 이만큼 뒤에 손을 떠난다) */
export const SNOWBALL_GATHER_MS = 240;
/** 손을 떠나는 높이 (발에서, px) */
export const SNOWBALL_HAND_Z = 10;
/** 던진 뒤 이만큼 안에 온 맞음만 인정한다 (뭉치기 + 날기 1초 안팎 + 오가는 지연 여유). 한 던지기에 맞음은 한 번만 */
export const SNOWBALL_HIT_WINDOW_MS = 3_000;
/** 맞은 사람의 서버 위치가 날아간 길에서 이만큼 안이어야 인정한다 */
export const SNOWBALL_HIT_SLACK = 56;
/** 맞음 신고 연결당 최소 간격 */
export const SNOWBALL_HIT_INTERVAL_MS = 200;
/** 서버가 사람마다 기억하는 최근 던지기 수 (맞음 확인용) */
export const SNOWBALL_KEEP = 3;
/** 맞은 높이(발에서, px) 최대 — 바베큐로 커진 몸까지 */
export const SNOWBALL_HIT_H_MAX = 64;
/** 얼굴에 눈이 묻어 있는 시간 · 휘청이는 시간 */
export const SNOW_FACE_MS = 3_000;
export const SNOW_WOBBLE_MS = 300;

/** 눈싸움을 하는 맵 (마을·캠핑장 바깥 — 바닷가는 아니다) */
export const snowFightMap = (m: MapId): boolean => m === "village" || m === "camp";

/** 던지고 맞을 수 있는 자세 (서기·걷기·뛰기·점프). 앉기·자리·배·놀이기구·물속은 아니다 */
export function snowFightState(s: StateId): boolean {
  return s === STATE.idle || s === STATE.walk || s === STATE.run || s === STATE.jump;
}

/** 날아가는 시간 (거리에 따라, 140px이면 0.53초쯤) */
export function snowballFlightMs(dist: number): number {
  return Math.round(260 + Math.max(0, Math.min(SNOWBALL_RANGE_MAX, dist)) * 1.9);
}

export type SnowballPos = { x: number; y: number; z: number; done: boolean };

/**
 * 손을 떠난 뒤 t(ms) 지난 공. (x,y) = 바닥 자리(그림자) — 출발점에서 떨어질 곳까지 곧게, z = 높이 — 손 높이에서 포물선으로 땅까지.
 * done = 땅에 닿았다. out을 채워 돌려준다 (매 프레임 할당 없음)
 */
export function snowballAt(x0: number, y0: number, x1: number, y1: number, t: number, out: SnowballPos): SnowballPos {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const u = Math.max(0, Math.min(1, t / snowballFlightMs(d)));
  out.x = x0 + (x1 - x0) * u;
  out.y = y0 + (y1 - y0) * u;
  // z(u) = 손 높이(1-u) + k·u(1-u): 처음엔 살짝 올라갔다가 떨어진다 (140px이면 꼭대기 16px쯤 — 몸 높이 안이라 길 위 사람은 맞는다)
  const k = 20 + Math.min(SNOWBALL_RANGE_MAX, d) * 0.15;
  out.z = SNOWBALL_HAND_Z * (1 - u) + k * u * (1 - u);
  out.done = u >= 1;
  return out;
}

/** 점 (px,py)에서 선분 (ax,ay)-(bx,by)까지 거리. ky = 세로를 이만큼 늘려 잰다 (발 둘레 타원) */
export function snowSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number, ky = 1): number {
  const dx = bx - ax;
  const dy = (by - ay) * ky;
  const qx = px - ax;
  const qy = (py - ay) * ky;
  const len = dx * dx + dy * dy;
  const u = len > 0 ? Math.max(0, Math.min(1, (qx * dx + qy * dy) / len)) : 0;
  return Math.hypot(qx - dx * u, qy - dy * u);
}

/** 받은 snowball 중계 검증 (클라이언트 수신용). 모양이 틀리면 null */
export function parseSnowballMsg(m: Record<string, unknown>): { sid: number; n: number; x: number; y: number; tx: number; ty: number } | null {
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (!num(m.sid) || !num(m.n) || !num(m.x) || !num(m.y) || !num(m.tx) || !num(m.ty)) return null;
  if (Math.hypot(m.tx - m.x, m.ty - m.y) > SNOWBALL_RANGE_MAX + 2) return null;
  return { sid: m.sid, n: m.n, x: m.x, y: m.y, tx: m.tx, ty: m.ty };
}
