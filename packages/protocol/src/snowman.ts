import { CAMP_BOUNDS, CAMP_BUS_STOP, CAMP_FIRE, CAMP_LOOKOUT, CAMP_OFFICE, CAMP_OFFICE_H, CAMP_OFFICE_W, CAMP_ROAD, CAMP_VANS, CAMP_VAN_H, CAMP_VAN_W, inCampStream } from "./camp";

// 11/17 캠핑장 「눈사람 만들기」 (겨울·크리스마스 판에서만 — 판은 웹이 정하고 서버는 모른다).
// - 눈더미에서 눈덩이를 집어 굴리고(크기 세 단계) 내려놓고 쌓는 것은 각자 화면에서만 한다 (중간 과정은 보내지 않는다)
// - 세 덩이를 다 쌓으면 C2S { t: "snowman", x, y } 한 번 → 서버가 씨앗(seed)·이름·시각을 붙여 같은 채널 캠핑장 사람 모두에게 snowman
// - 녹는 것은 시각으로 각자 계산한다 (at + SNOWMAN_LIFE_MS). 개수가 넘쳐 서버가 먼저 녹인 것만 snowmanGone으로 알린다
// - 캠핑장에 들어올 때(welcome·mapped) 지금 서 있는 눈사람 목록 snowmen을 받는다
// 목록은 채널 DO 메모리에만 둔다 (다시 뜨면 사라져도 괜찮다 — 보상 없는 놀이)

/** 세운 뒤 다 녹을 때까지 */
export const SNOWMAN_LIFE_MS = 60 * 60_000;
/** 마지막 이만큼 동안 조금씩 작아진다 */
export const SNOWMAN_SHRINK_MS = 10 * 60_000;
/** 한 사람이 세워 둘 수 있는 수 (넘치면 그 사람 것 중 가장 오래된 것부터 녹는다) */
export const SNOWMAN_PER_PERSON = 2;
/** 채널(캠핑장)에 서 있을 수 있는 수 (넘치면 가장 오래된 것부터 녹는다) */
export const SNOWMAN_PER_CHANNEL = 15;
/** 세우기 요청 연결당 최소 간격 (도배 방지 — 굴려서 쌓는 데 이보다 훨씬 오래 걸린다) */
export const SNOWMAN_BUILD_INTERVAL_MS = 4_000;
/** 서버 위치에서 이 거리 안에만 세운다 (바로 앞에 내려놓는다) */
export const SNOWMAN_REACH = 48;
/** 눈사람끼리 이만큼은 떨어져 선다 (발 위치 기준) */
export const SNOWMAN_GAP = 14;

/** 서 있는 눈사람 하나. by = 만든 사람 이름, at = 세운 서버 시각(ms), seed = 모습 씨앗 (모두에게 같은 모습) */
export type SnowmanInfo = { id: string; x: number; y: number; seed: number; by: string; at: number };
/** 세우기 거절 까닭: spot = 그 자리에 못 세움, wait = 너무 잦음 */
export type SnowmanDenyWhy = "spot" | "wait";

export const SNOWMAN_ID_RE = /^[a-z0-9]{1,16}$/;

/** 녹은 정도: 0 = 그대로, 마지막 SNOWMAN_SHRINK_MS 동안 0→1, 1 이상 = 다 녹음 */
export function snowmanMelt(at: number, now: number): number {
  const left = at + SNOWMAN_LIFE_MS - now;
  if (left >= SNOWMAN_SHRINK_MS) return 0;
  return Math.min(1, Math.max(0, 1 - left / SNOWMAN_SHRINK_MS));
}

/** 아직 서 있는지 */
export function snowmanAlive(at: number, now: number): boolean {
  return now < at + SNOWMAN_LIFE_MS;
}

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/**
 * 서버 검증: 캠핑장 눈밭에 세울 수 있는 자리인지 (대략 — 건물·물·버스 길·모닥불 둘레 녹은 땅·전망대를 뺀다).
 * 웹은 이보다 좁게(바닥 종류·충돌까지) 본다. 판(겨울·크리스마스)은 서버가 모르므로 보지 않는다
 */
export function campSnowSpotOk(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const b = CAMP_BOUNDS;
  if (x < b.minX + 8 || x > b.maxX - 8 || y < b.minY + 20 || y > b.maxY - 4) return false;
  if (inCampStream(x, y, 12)) return false;
  // 버스 길·정류장 지붕과 내리는 보도
  if (inBox(x, y, CAMP_ROAD.x, CAMP_ROAD.y - 4, CAMP_ROAD.x + CAMP_ROAD.w + 8, CAMP_ROAD.y + CAMP_ROAD.h + 4)) return false;
  if (inBox(x, y, CAMP_BUS_STOP.x - 40, CAMP_BUS_STOP.y - 16, CAMP_BUS_STOP.x + 40, CAMP_BUS_STOP.y + 22)) return false;
  // 모닥불 자리만 (11/18 사용자 「모닥불 근처도 되게」 — 예전엔 녹은 땅 둘레 76px을 막았다)
  if (Math.hypot(x - CAMP_FIRE.x, (y - CAMP_FIRE.y) * 1.2) < 26) return false;
  // 전망대 데크·관리소·캠핑카
  if (inBox(x, y, CAMP_LOOKOUT.x - 6, CAMP_LOOKOUT.y - 6, CAMP_LOOKOUT.x + CAMP_LOOKOUT.w + 6, CAMP_LOOKOUT.y + CAMP_LOOKOUT.h + 10)) return false;
  if (inBox(x, y, CAMP_OFFICE.x - CAMP_OFFICE_W / 2 - 6, CAMP_OFFICE.y - CAMP_OFFICE_H, CAMP_OFFICE.x + CAMP_OFFICE_W / 2 + 6, CAMP_OFFICE.y + 8)) return false;
  for (const v of CAMP_VANS) if (inBox(x, y, v.x - CAMP_VAN_W / 2 - 4, v.y - CAMP_VAN_H, v.x + CAMP_VAN_W / 2 + 4, v.y + 8)) return false;
  return true;
}

/** 받은 눈사람 검증 (클라이언트 수신용). 모양이 틀리면 null */
export function parseSnowmanInfo(o: unknown): SnowmanInfo | null {
  if (!o || typeof o !== "object") return null;
  const m = o as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (typeof m.id !== "string" || !SNOWMAN_ID_RE.test(m.id) || !num(m.x) || !num(m.y) || !num(m.seed) || !num(m.at)) return null;
  return { id: m.id, x: m.x, y: m.y, seed: m.seed >>> 0, by: typeof m.by === "string" ? m.by.slice(0, 40) : "", at: m.at };
}
