import { CAMP_BOUNDS, CAMP_BUS_STOP, CAMP_CLIFF_X0, CAMP_CLIFF_X1, CAMP_FIRE, CAMP_OFFICE, CAMP_OFFICE_H, CAMP_OFFICE_W, CAMP_RES, CAMP_ROAD, CAMP_RES_EMBANK, campCliffEnvelope, campPoolD, inCampStream } from "./camp";
import { CAMP_LOTS } from "./campHomes";
import type { Sid } from "./types";

// 11/17 캠핑장 「눈사람 만들기」 (겨울·크리스마스 판에서만 — 판은 웹이 정하고 서버는 모른다).
// - 눈더미에서 눈덩이를 집어 굴리고(크기 세 단계) 내려놓고 쌓는다. 11/18부터 이 과정도 같은 캠핑장에 보인다 (아래 「만드는 과정」)
// - 세 덩이째를 올리면(snowAdd) 서버가 씨앗(seed)·이름·시각을 붙여 같은 채널 캠핑장 사람 모두에게 snowman
// - 녹는 것은 시각으로 각자 계산한다 (at + SNOWMAN_LIFE_MS). 개수가 넘쳐 서버가 먼저 녹인 것만 snowmanGone으로 알린다
// - 캠핑장에 들어올 때(welcome·mapped) 지금 서 있는 눈사람 목록 snowmen을 받는다
// 목록은 채널 DO 메모리에만 둔다 (다시 뜨면 사라져도 괜찮다 — 보상 없는 놀이)

/** 세운 뒤 다 녹을 때까지 */
export const SNOWMAN_LIFE_MS = 60 * 60_000;
/** 마지막 이만큼 동안 조금씩 작아진다 */
export const SNOWMAN_SHRINK_MS = 10 * 60_000;
/**
 * 한 사람이 동시에 가질 수 있는 수 — 서 있는 눈사람과 쌓는 중인 덩이를 합쳐서 (11/18 사용자: 2개 만들면 녹을 때까지 못 만든다).
 * 다 차면 새 덩이를 못 놓는다 (예전엔 가장 오래된 것부터 녹였다)
 */
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
/**
 * 거절 까닭: spot = 그 자리에 못 놓음·못 세움, wait = 너무 잦음, near = 다른 사람 덩이·눈사람과 겹침,
 * full = 캠핑장에 덩이가 너무 많음, lost = 그 덩이가 없음(사라졌거나 내 것이 아님)
 */
/** many = 11/18 서 있는 내 눈사람과 쌓는 중인 내 덩이가 이미 SNOWMAN_PER_PERSON개 */
/** lone = 11/26 한 덩이만 놓인 내 덩이(몸통만)가 이미 있다 — 그 위에 먼저 올리거나 허문다. 옛 웹은 모르는 값이라 spot으로 받는다 (덩이를 다시 든다) */
export type SnowmanDenyWhy = "spot" | "wait" | "near" | "full" | "lost" | "many" | "lone";
/** 거절된 동작: put = 내려놓기, add = 올리기(세 단째면 세우기까지), take = 다시 들기, break = 11/26 허물기 (쌓다 만 덩이·다 세운 눈사람 — id로 가린다) */
export type SnowAct = "put" | "add" | "take" | "break";
const DENY_WHYS: readonly SnowmanDenyWhy[] = ["spot", "wait", "near", "full", "lost", "many", "lone"];
export const isSnowAct = (v: unknown): v is SnowAct => v === "put" || v === "add" || v === "take" || v === "break";
export const isSnowmanDenyWhy = (v: unknown): v is SnowmanDenyWhy => (DENY_WHYS as readonly unknown[]).includes(v);

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
 * 11/26 캠핑장 채집 지점 자리 (웹 lib/forage/catalog CAMP_GATHER_NODES와 같은 좌표 — 웹 game/camp/snowman.test가 맞는지 본다).
 * 서버가 눈덩이·눈사람 자리를 볼 때 쓴다
 */
export const CAMP_FORAGE_SPOTS: readonly (readonly [number, number])[] = [[60, 758], [250, 770], [860, 770], [1238, 560], [1262, 100], [900, 62], [330, 40], [560, 780], [456, 492], [750, 506], [314, 300], [120, 766], [420, 780], [958, 788], [1262, 420], [1100, 40], [1222, 298], [612, 782], [1186, 781], [870, 240], [564, 440], [426, 238], [840, 250], [508, 362], [774, 360], [930, 330], [1262, 200], [440, 596], [1000, 582], [180, 780], [700, 780], [1010, 775], [30, 600], [1262, 700], [330, 770], [600, 500], [716, 560], [610, 590], [714, 624], [604, 420], [720, 470], [608, 554], [700, 700], [590, 740], [690, 746]];
/**
 * 11/26 눈덩이·눈사람은 채집 지점과 이만큼 떨어진다 — 붙어 있으면 「E 약초 캐기」 안내가 덩이 안내(다시 들기·허물기)를 가렸다.
 * 덩이 안내 거리(웹 SNOW_REACH 20) + 지점 닿는 거리(14) + 지점 E 자리가 6px 아래인 몫
 */
export const SNOW_NODE_GAP = 40;

/**
 * 서버 검증: 캠핑장 눈밭에 세울 수 있는 자리인지 (대략 — 건물·물·버스 길·모닥불 자리·절벽·집터·채집 지점 둘레를 뺀다).
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
  // 관리소 · 11/26 폭포 절벽·달그늘 소·저수지(둑 포함) · 집터(카라반·펜션·촌캉스 — 집과 앞마당)
  if (inBox(x, y, CAMP_OFFICE.x - CAMP_OFFICE_W / 2 - 6, CAMP_OFFICE.y - CAMP_OFFICE_H, CAMP_OFFICE.x + CAMP_OFFICE_W / 2 + 6, CAMP_OFFICE.y + 8)) return false;
  if (x > CAMP_CLIFF_X0 && x < CAMP_CLIFF_X1 && y < campCliffEnvelope(x) + 10) return false;
  if (campPoolD(x, y) < 1.08) return false;
  if (inBox(x, y, CAMP_RES.x0 - CAMP_RES_EMBANK - 4, CAMP_RES.y0 - CAMP_RES_EMBANK - 4, CAMP_RES.x1 + CAMP_RES_EMBANK + 4, CAMP_RES.y1 + CAMP_RES_EMBANK + 4)) return false;
  for (const l of CAMP_LOTS) if (inBox(x, y, l.x - 2, l.y - 2, l.x + l.w + 2, l.y + l.h + 2)) return false;
  // 11/26 채집 지점 둘레 (안내가 겹치지 않게)
  for (const [nx, ny] of CAMP_FORAGE_SPOTS) if (Math.hypot(x - nx, y - ny) < SNOW_NODE_GAP) return false;
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

// ── 11/18 만드는 과정도 같은 캠핑장에 (v73) ──
// - 안고 다니는·굴리는 눈덩이: 상태가 바뀔 때만 C2S snowHold (집기·크기 바뀜·굴리기 시작/멈춤·버리기). 늦게 온 사람은 PeerInfo.snow
// - 내려놓은 덩이(쌓는 중): snowPut(새 자리)·snowAdd(내 덩이 위에 올리기)·snowTake(내 덩이 맨 위 다시 들기). 서버가 목록을 들고 같은 캠핑장에 snowStack
//   세 단째를 올리면 서버가 바로 눈사람으로 세운다 (snowman.st = 바뀐 덩이 id). 늦게 온 사람은 snowmen.stacks
// - 덩이는 주인이 캠핑장을 떠나거나 SNOW_STACK_IDLE_MS 동안 손대지 않으면 사라진다 (손댄 시각 at으로 각자 계산, 서버는 만날 때 지운다)
// - 다른 사람 덩이·눈사람과 SNOW_STACK_GAP 안에는 내려놓지 못한다 (웹·서버 같은 snowGapWhy)

/** 눈덩이 크기: 0 머리 · 1 배 · 2 몸통 */
export type SnowBall = 0 | 1 | 2;
export const isSnowBall = (v: unknown): v is SnowBall => v === 0 || v === 1 || v === 2;
/** 들고 있는 눈덩이 (s = 크기, r = 발 앞에서 굴리는 중 — 아니면 품에 안고 있다) */
export type SnowHold = { s: SnowBall; r?: true };
/** 내려놓은 덩이 하나. sid = 주인, sizes = 아래부터 크기(큰 것 → 작은 것), at = 마지막으로 손댄 서버 시각(ms) */
export type SnowStackInfo = { id: string; sid: Sid; x: number; y: number; sizes: SnowBall[]; at: number };

/** 이만큼 손대지 않은 덩이는 사라진다 */
export const SNOW_STACK_IDLE_MS = 10 * 60_000;
/** 한 사람이 동시에 둘 수 있는 덩이 (11/18 4 → 2, 서 있는 눈사람과 합쳐 SNOWMAN_PER_PERSON까지 — 넘치면 못 놓는다) */
export const SNOW_STACKS_PER_PERSON = 2;
/** 채널(캠핑장)에 놓일 수 있는 덩이 (넘치면 새로 못 놓는다) */
export const SNOW_STACKS_PER_CHANNEL = 40;
/** 다른 사람 덩이·눈사람과 이만큼은 떨어져야 내려놓는다 (발 위치, 세로는 1.4배로 잰다) */
export const SNOW_STACK_GAP = 22;
/** 내려놓기·올리기·다시 들기 연결당 최소 간격 */
export const SNOW_ACT_INTERVAL_MS = 200;
/** 들고 있는 상태 알림 연결당 최소 간격 (웹은 SNOW_HOLD_SEND_MS로 더 드물게 모아 보낸다) */
export const SNOW_HOLD_INTERVAL_MS = 150;
/** 웹이 들고 있는 상태를 보내는 최소 간격 (마지막 상태는 꼭 보낸다) */
export const SNOW_HOLD_SEND_MS = 400;

/**
 * 11/26 한 사람이 바닥에 한 덩이만 놓아 둔 덩이(몸통만)는 하나까지 — 두 번째 몸통을 따로 놓으면 둘 다 배를 기다리다 내 몫이 막혔다.
 * 새로 내려놓기 전에 본다 (웹·서버 같은 식). mine = 내 쌓는 중인 덩이들의 크기
 */
export function snowLoneBlocks(mine: Iterable<{ sizes: readonly unknown[] }>): boolean {
  for (const st of mine) if (st.sizes.length === 1) return true;
  return false;
}

/** 11/26 내 덩이·눈사람을 허물 수 있는 거리 (서버가 아는 내 위치에서 — 웹은 바로 앞에서만 보낸다) */
export const SNOW_BREAK_REACH = SNOWMAN_REACH;

/** 아직 놓여 있는 덩이인지 */
export function snowStackAlive(at: number, now: number): boolean {
  return now < at + SNOW_STACK_IDLE_MS;
}

/** 쌓인 크기가 맞는지 (1~3단, 위로 갈수록 작다) */
export function snowSizesOk(sizes: readonly unknown[]): sizes is SnowBall[] {
  if (sizes.length < 1 || sizes.length > 3) return false;
  for (let i = 0; i < sizes.length; i++) if (!isSnowBall(sizes[i]) || (i > 0 && (sizes[i] as number) >= (sizes[i - 1] as number))) return false;
  return true;
}

/** 세 단(몸통·배·머리)이 다 쌓였나 */
export function snowSizesDone(sizes: readonly SnowBall[]): boolean {
  return sizes.length === 3 && sizes[0] === 2 && sizes[1] === 1 && sizes[2] === 0;
}

type Pt = { x: number; y: number };
const snowDist = (o: Pt, x: number, y: number) => Math.hypot(o.x - x, (o.y - y) * 1.4);

/**
 * 새 덩이를 (x,y)에 내려놓을 때 간격 판정 (웹·서버 같은 식). mine = 내 덩이·눈사람, theirs = 다른 사람 것.
 * near = 다른 사람 것과 겹친다, spot = 내 것과 너무 붙었다, null = 괜찮다
 */
export function snowGapWhy(x: number, y: number, mine: Iterable<Pt>, theirs: Iterable<Pt>): "near" | "spot" | null {
  for (const o of theirs) if (snowDist(o, x, y) < SNOW_STACK_GAP) return "near";
  for (const o of mine) if (snowDist(o, x, y) < SNOWMAN_GAP) return "spot";
  return null;
}

/** 받은 들고 있는 상태 검증 (PeerInfo.snow·snowHold). 없거나 틀리면 null */
export function parseSnowHold(o: unknown): SnowHold | null {
  if (!o || typeof o !== "object") return null;
  const m = o as Record<string, unknown>;
  if (!isSnowBall(m.s)) return null;
  return m.r === true ? { s: m.s, r: true } : { s: m.s };
}

/** 받은 덩이 검증 (클라이언트 수신용). 모양이 틀리면 null */
export function parseSnowStackInfo(o: unknown): SnowStackInfo | null {
  if (!o || typeof o !== "object") return null;
  const m = o as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  if (typeof m.id !== "string" || !SNOWMAN_ID_RE.test(m.id) || !num(m.sid) || !num(m.x) || !num(m.y) || !num(m.at) || !Array.isArray(m.sizes) || !snowSizesOk(m.sizes)) return null;
  return { id: m.id, sid: m.sid, x: m.x, y: m.y, sizes: [...m.sizes], at: m.at };
}
