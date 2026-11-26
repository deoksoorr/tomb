import { CAMP_SLIDE, CAMP_SLIDE_SEAT, CAMP_TRAMP_AREA, CAMP_TRAMP_GATE, DIR, type DirId, type StateName } from "@tomb/protocol";

// 11/26 워터 슬라이드·눈썰매 한 번 타는 길 (순수 함수 — campPlay.test가 속도·끝자리를 본다).
// 그림(valleyProps waterSlideArt·sledHillArt)은 왼쪽 위 원점 (SLIDE.x − 54, SLIDE.y − 60)에 깔린다 (CampMap.addPlayground).

/** 미끄럼 그림 원점 (월드) */
export const SLIDE_ORIGIN = { x: CAMP_SLIDE.x - 54, y: CAMP_SLIDE.y - 60 } as const;
/** 타는 사람은 미끄럼 그림(깊이 SLIDE.y + 40) 위에 그린다 */
export const SLIDE_DEPTH = CAMP_SLIDE.y + 41;
/** 한 번 타는 시간 (사다리 오르기 → 꼭대기 → 미끄러지기 → 풀에 풍덩) */
export const SLIDE_RIDE_MS = 3_400;

const CLIMB_MS = 1_100;
const STEP_MS = 250;
const SIT_MS = 150;
const SLIDE_START = CLIMB_MS + STEP_MS + SIT_MS;
const SLIDE_MS = 1_400;
const SLED_MS = 1_100;

type P = { x: number; y: number };
/** 미끄럼틀 가운데 선 (그림과 같은 식 — u 0 꼭대기 → 1 풀) */
export function slidePath(u: number): P {
  return { x: SLIDE_ORIGIN.x + 66 - u * 34 + Math.sin(u * Math.PI * 2.2) * 16, y: SLIDE_ORIGIN.y + 22 + u * 80 };
}
/** 눈썰매 자국 (꼭대기 → 언덕 밑) */
export function sledPath(u: number): P {
  return { x: SLIDE_ORIGIN.x + 70 - u * 42, y: SLIDE_ORIGIN.y + 34 + u * 74 };
}

const LADDER_TOP: P = { x: CAMP_SLIDE_SEAT.x, y: SLIDE_ORIGIN.y + 28 };
const SLED_TOP: P = { x: SLIDE_ORIGIN.x + 76, y: SLIDE_ORIGIN.y + 34 };
const POOL: P = { x: CAMP_SLIDE.pool.x + 2, y: CAMP_SLIDE.pool.y };
/** 다 타고 내려서는 자리 (풀·언덕 밑 앞 — 막힌 곳 밖) */
export const SLIDE_OUT: P = { x: CAMP_SLIDE.pool.x, y: CAMP_SLIDE.pool.y + CAMP_SLIDE.pool.ry + 7 };

const lerp = (a: P, b: P, k: number): P => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
/** 갈수록 빨라지게 (끝 기울기 1.3 — 서버 속도 검증 안) */
const accel = (k: number) => 0.7 * k + 0.3 * k * k;
function faceOf(dx: number, dy: number): DirId {
  if (Math.abs(dx) > Math.abs(dy) * 1.2) return dx < 0 ? DIR.left : DIR.right;
  return dy < 0 ? DIR.up : DIR.down;
}

export type SlidePose = P & {
  dir: DirId;
  /** 보여 줄 자세 (null = 타는 자세 — 앉은 모습) */
  alt: StateName | null;
  /** 풀에 빠졌다 (워터 슬라이드만) */
  inPool: boolean;
  out: P;
};

/** 한 번 타는 박자 (ms — 효과음이 따른다): 꼭대기에 앉는 때 · 미끄러지기 시작 · 풀·언덕 밑에 닿는 때 */
export function slideTimeline(snowy: boolean): { sitAt: number; startAt: number; endAt: number } {
  return { sitAt: CLIMB_MS + STEP_MS, startAt: SLIDE_START, endAt: SLIDE_START + (snowy ? SLED_MS : SLIDE_MS) };
}

/** 탄 뒤 t ms의 자리·자세 */
export function slideRidePose(t: number, snowy: boolean): SlidePose {
  const base = { inPool: false, out: SLIDE_OUT };
  const foot = { x: CAMP_SLIDE_SEAT.x, y: CAMP_SLIDE_SEAT.y };
  const step = Math.floor(t / 180) % 2 ? "walk" : "idle";
  const top = snowy ? SLED_TOP : LADDER_TOP;
  if (t < CLIMB_MS) return { ...lerp(foot, top, clamp01(t / CLIMB_MS)), dir: DIR.up, alt: step, ...base };
  const start = snowy ? sledPath(0) : slidePath(0);
  if (t < CLIMB_MS + STEP_MS) return { ...lerp(top, start, clamp01((t - CLIMB_MS) / STEP_MS)), dir: DIR.left, alt: step, ...base };
  if (t < SLIDE_START) return { ...start, dir: DIR.down, alt: null, ...base };
  const dur = snowy ? SLED_MS : SLIDE_MS;
  const k = (t - SLIDE_START) / dur;
  if (k < 1) {
    const path = snowy ? sledPath : slidePath;
    const u = accel(clamp01(k));
    const p = path(u);
    const q = path(Math.min(1, u + 0.03));
    return { ...p, dir: faceOf(q.x - p.x, q.y - p.y), alt: null, ...base };
  }
  const end = snowy ? sledPath(1) : slidePath(1);
  const after = t - SLIDE_START - dur;
  if (snowy) return { ...end, dir: DIR.down, alt: null, ...base };
  return { ...lerp(end, POOL, clamp01(after / 300)), dir: DIR.down, alt: "swim", ...base, inPool: true };
}


// ── 11/26 트램펄린 (입구로만 타고 매트 안을 다닌다) ──
/** 매트 위 걷기·뛰기 속도 (px/s — 서버 속도 검증 안) */
export const TRAMP_WALK = 40;
export const TRAMP_RUN = 68;
/** 사다리(입구) 앞인지 — 매트 앞 가장자리 가운데 (여기서 아래로 가거나 E면 내린다) */
export function nearTrampGate(x: number, y: number): boolean {
  const A = CAMP_TRAMP_AREA;
  return Math.abs(x - CAMP_TRAMP_GATE.x) <= 12 && y >= A.y + A.ry - 7;
}
