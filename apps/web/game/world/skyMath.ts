import {
  BALLOON_BOARD_MS,
  BALLOON_COUNT,
  BALLOON_FLIGHT_MS,
  BALLOON_PAD,
  BALLOON_SEATS,
  balloonPhase,
  FERRIS,
  FERRIS_CARS,
  FERRIS_PERIOD_MS,
  FERRIS_SEATS,
  ZONES,
  type BalloonSeat,
  type FerrisSeat,
} from "@tomb/protocol";
import type { Interactable, Rect } from "./layout";

// 놀이기구 2 (관람차·열기구) — 순수 데이터와 수식. 그림·탑승·소리는 SkyRides.ts, 탑승 중 옆에서 본 2D 장면은 SkyStage.ts.
//  - 관람차: 칸 위치 = 서버 시계로 돈다 (회전목마처럼 따로 주고받지 않는다). 탄 사람은 자기 칸이 한 바퀴 돌아 내려오면 내린다
//  - 열기구: 운항 시간표(protocol balloonPhase) + 정해진 항로 → 시각만 알면 누구 화면에서나 같은 자리
//  - 탑승 중 장면: 관람차는 칸 높이(ferrisLift), 열기구는 항로 위 거리(balloonRouteS)·높이(flightLift)로 층을 움직인다

// ── 관람차 (2D 그림 치수) ──
/** 바퀴 반지름 (그림 px) · 바닥에서 바퀴 축까지 높이 */
export const WHEEL_R = 34;
export const WHEEL_HUB_H = 58;
/** 바퀴 축 (월드 좌표) */
export const WHEEL_HUB = { x: FERRIS.x, y: FERRIS.y - WHEEL_HUB_H } as const;
/** 칸 안 자리 가로 위치 (칸 가운데에서) · 앉은 발 위치 (칸 매달린 점에서 아래로) */
export const CAR_SEAT_DX = 4;
export const CAR_FEET_DY = 18;
/** 타는 곳 (상호작용 지점·내려서는 곳 가운데) */
export const FERRIS_BOARD = { x: FERRIS.x, y: FERRIS.y + 10 } as const;

/** 칸 c의 각 (rad, 0 = 맨 아래, 시간이 지나면 커진다) */
export function carAngle(car: number, t: number): number {
  const f = car / FERRIS_CARS + (((t % FERRIS_PERIOD_MS) + FERRIS_PERIOD_MS) % FERRIS_PERIOD_MS) / FERRIS_PERIOD_MS;
  return (f - Math.floor(f)) * Math.PI * 2;
}

/** 각 → 칸이 매달린 바퀴 테 위의 점 (월드 좌표, 그림에서 시계 방향으로 돈다) */
export function rimPoint(angle: number): { x: number; y: number } {
  return { x: WHEEL_HUB.x - Math.sin(angle) * WHEEL_R, y: WHEEL_HUB.y + Math.cos(angle) * WHEEL_R };
}

/** 바퀴 살 회전 각 (rad) — 칸과 같은 빠르기 */
export function wheelSpin(t: number): number {
  return carAngle(0, t);
}

/** 관람차 자리 id → 자리 */
export function ferrisSeat(id: string | null): FerrisSeat | undefined {
  return id ? FERRIS_SEATS.find((s) => s.id === id) : undefined;
}

/** 앉은 사람이 그려질 발 위치 (칸 안, 월드 좌표) */
export function ferrisRiderPoint(seat: FerrisSeat, t: number): { x: number; y: number } {
  const p = rimPoint(carAngle(seat.car, t));
  return { x: p.x + (seat.index === 0 ? -CAR_SEAT_DX : CAR_SEAT_DX), y: p.y + CAR_FEET_DY };
}

/** 탈 수 있는 칸: 맨 아래(각 0)에서 이만큼 안 (rad) */
export const FERRIS_BOARD_ARC = (40 / 180) * Math.PI;

/**
 * 탈 칸 고르기: 맨 아래(각 0)에 가장 가까운 칸부터, 빈자리가 있는 칸의 빈자리 (taken = 차 있는 자리 id).
 * 칸이 위로 너무 올라가 있으면(FERRIS_BOARD_ARC 밖) 고르지 않는다 → 다음 칸이 내려올 때까지 기다린다
 */
export function pickFerrisSeat(t: number, taken: (id: string) => boolean): FerrisSeat | null {
  const order = Array.from({ length: FERRIS_CARS }, (_, c) => {
    const a = carAngle(c, t);
    return { c, d: Math.min(a, Math.PI * 2 - a) };
  })
    .filter((o) => o.d <= FERRIS_BOARD_ARC)
    .sort((a, b) => a.d - b.d);
  for (const { c } of order) {
    const free = FERRIS_SEATS.find((s) => s.car === c && !taken(s.id));
    if (free) return free;
  }
  return null;
}

/** 탄 시각 t0에 칸 car에 탔을 때 내리는 시각: 칸이 한 바퀴 돌아 맨 아래로 내려오는 때 (적어도 반 바퀴는 탄다) */
export function ferrisRideEnd(car: number, t0: number): number {
  const a = carAngle(car, t0) / (Math.PI * 2);
  let wait = (1 - a) * FERRIS_PERIOD_MS;
  if (wait < FERRIS_PERIOD_MS / 2) wait += FERRIS_PERIOD_MS;
  return t0 + wait;
}

// ── 열기구 ──
/** 출발장 바구니 바닥 (월드 좌표) */
export const BALLOON_BASKET = { x: BALLOON_PAD.x, y: BALLOON_PAD.y } as const;
/** 비행 중 그림에서 땅 그림자보다 위로 뜨는 높이 (px) */
export const BALLOON_ALT_2D = 64;
/** 높이 (px, 바람 소리 세기에 쓴다): 순항 · 바구니 눈높이 */
export const BALLOON_CRUISE_H = 280;
export const BALLOON_EYE_H = 12;
/** 이륙·착륙에 쓰는 비행 시간 비율 */
const RISE = 0.1;
/** 속도 올리고 줄이는 비율 (항로 진행) */
const ACCEL = 0.12;

/** 항로 (땅 위 점, 월드 좌표): 출발장 → 옛 묘역 → 광장 큰 모닥불 → 강 → 호수 → 호박밭·다리 건너 묘역 → 동물원 → 강가 → 언덕(출발장) */
export const BALLOON_ROUTE: readonly { x: number; y: number }[] = [
  { x: BALLOON_PAD.x, y: BALLOON_PAD.y },
  { x: 236, y: 250 },
  { x: 240, y: 420 },
  { x: 470, y: 470 },
  { x: 720, y: 456 },
  { x: 730, y: 620 },
  { x: 760, y: 720 },
  { x: 1000, y: 780 },
  { x: 1240, y: 900 },
  { x: 1010, y: 960 },
  { x: 730, y: 900 },
  { x: 500, y: 890 },
  { x: 230, y: 880 },
  { x: 120, y: 620 },
  { x: 110, y: 340 },
  { x: BALLOON_PAD.x - 30, y: BALLOON_PAD.y + 70 },
  { x: BALLOON_PAD.x, y: BALLOON_PAD.y },
];

/** 항로를 촘촘히 나눈 점 + 누적 길이 (Catmull-Rom, 처음 한 번) */
type Track = { xs: Float64Array; ys: Float64Array; acc: Float64Array; total: number };
let track: Track | null = null;
function buildTrack(): Track {
  const P = BALLOON_ROUTE;
  const pts: { x: number; y: number }[] = [];
  const SUB = 24;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < SUB; k++) {
      const u = k / SUB;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  pts.push({ ...P[P.length - 1] });
  const n = pts.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const acc = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = pts[i].x;
    ys[i] = pts[i].y;
    acc[i] = i === 0 ? 0 : acc[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }
  return { xs, ys, acc, total: acc[n - 1] };
}
function getTrack(): Track {
  track ??= buildTrack();
  return track;
}

/** 항로 길이 (px) */
export function routeLength(): number {
  return getTrack().total;
}

/** 항로 위 거리 s(px)의 점 */
export function routeAt(s: number): { x: number; y: number } {
  const T = getTrack();
  const d = Math.max(0, Math.min(T.total, s));
  let lo = 0;
  let hi = T.acc.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (T.acc[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = T.acc[hi] - T.acc[lo] || 1;
  const k = (d - T.acc[lo]) / seg;
  return { x: T.xs[lo] + (T.xs[hi] - T.xs[lo]) * k, y: T.ys[lo] + (T.ys[hi] - T.ys[lo]) * k };
}

/** 비행 진행 u(0..1) → 항로 진행(0..1): 처음과 끝에서 천천히 (사다리꼴 속도) */
export function flightProgress(u: number): number {
  const a = ACCEL;
  const v = Math.max(0, Math.min(1, u));
  if (v < a) return (v * v) / (2 * a * (1 - a));
  if (v > 1 - a) return 1 - ((1 - v) * (1 - v)) / (2 * a * (1 - a));
  return (v - a / 2) / (1 - a);
}

/** 이륙·착륙 높이 비율 0..1 (출발장 0, 순항 1) */
export function flightLift(u: number): number {
  const s = (e0: number, e1: number, x: number) => {
    const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return k * k * (3 - 2 * k);
  };
  return s(0, RISE, u) * (1 - s(1 - RISE, 1, u));
}

export type BalloonState = {
  /** 출발장에서 태우는 중 */
  boarding: boolean;
  /** 땅 위 점 (그림자 자리) */
  x: number;
  y: number;
  /** 그림에서 뜬 높이 (px) */
  alt: number;
  /** 높이 (px, 바람 소리 세기) */
  h: number;
  /** 가는 방향 (rad, yaw와 같은 기준: 0 = 북쪽, + = 동쪽으로) */
  heading: number;
  /** 비행 진행 0..1 (태우는 중이면 0) */
  u: number;
  /** 버너를 켜는 중 (불꽃·소리) */
  burn: boolean;
  /** 이륙 시각 (태우는 중이면 다음 이륙) */
  departAt: number;
};

/** 버너: 이륙하며 길게, 순항 중에는 가끔 짧게 (시각으로 정해져 모두에게 같다) */
export function burnerOn(flightMs: number): boolean {
  if (flightMs < 0) return false;
  if (flightMs < 7_000) return true;
  if (flightMs > BALLOON_FLIGHT_MS - 9_000) return false;
  const k = Math.floor(flightMs / 9_000);
  const ph = flightMs - k * 9_000;
  const len = 1_200 + ((k * 7919) % 5) * 300;
  return ph < len;
}

/** 기구 b의 지금 모습 (t = 서버 시계 ms) */
export function balloonState(b: number, t: number): BalloonState {
  const p = balloonPhase(b, t);
  if (p.phase === "board") {
    return {
      boarding: true,
      x: BALLOON_BASKET.x,
      y: BALLOON_BASKET.y,
      alt: 0,
      h: BALLOON_EYE_H,
      heading: Math.PI,
      u: 0,
      burn: p.ms > BALLOON_BOARD_MS - 2_500,
      departAt: p.departAt,
    };
  }
  const u = Math.min(1, p.ms / BALLOON_FLIGHT_MS);
  const L = routeLength();
  const s = flightProgress(u) * L;
  const at = routeAt(s);
  // 가는 방향: 조금 앞의 점을 본다 (급히 꺾지 않게)
  const ahead = routeAt(Math.min(L, s + 70));
  const behind = routeAt(Math.max(0, s - 10));
  const dx = ahead.x - behind.x;
  const dy = ahead.y - behind.y;
  const heading = Math.hypot(dx, dy) > 1 ? Math.atan2(dx, -dy) : Math.PI;
  const lift = flightLift(u);
  const bob = Math.sin(p.ms / 2300 + b) * 3;
  return {
    boarding: false,
    x: at.x,
    y: at.y,
    alt: BALLOON_ALT_2D * lift + (lift > 0.9 ? bob : 0),
    h: BALLOON_EYE_H + (BALLOON_CRUISE_H - BALLOON_EYE_H) * lift + bob * 4 * lift,
    heading,
    u,
    burn: burnerOn(p.ms),
    departAt: p.departAt,
  };
}

/** 열기구 자리 id → 자리 */
export function balloonSeat(id: string | null): BalloonSeat | undefined {
  return id ? BALLOON_SEATS.find((s) => s.id === id) : undefined;
}

/** 기구 b의 자리 (index 순) */
export function balloonSeatsOf(b: number): BalloonSeat[] {
  return BALLOON_SEATS.filter((s) => s.balloon === b).sort((x, y) => x.index - y.index);
}

/** 지금 출발장에 내려와 태우는 기구 (없으면 -1) */
export function boardingBalloon(t: number): number {
  for (let b = 0; b < BALLOON_COUNT; b++) if (balloonPhase(b, t).phase === "board") return b;
  return -1;
}

/** 다음 기구가 출발장에 내려오기까지 남은 시간 (ms) */
export function nextBoardingIn(t: number): number {
  let best = Infinity;
  for (let b = 0; b < BALLOON_COUNT; b++) {
    const p = balloonPhase(b, t);
    best = Math.min(best, p.phase === "board" ? 0 : BALLOON_FLIGHT_MS - p.ms);
  }
  return best;
}

/** 바구니 안 자리 가로 위치 (기구 가운데에서) */
export function basketSeatDx(index: number): number {
  return -6 + index * 4;
}

/** 지나가는 곳 이름 (땅 위 점이 들어 있는 가장 작은 구역) */
export function placeName(x: number, y: number): string | null {
  return zoneAt(x, y)?.name ?? null;
}

// ── 탑승 중 화면 (옆에서 본 2D 장면, SkyStage) ──

/**
 * 관람차 칸 높이 → 장면 높이 0..1. 칸 높이((1 − cos)/2)를 조금 키워 잘라서, 꼭대기 근처(±약 27°, 3초 남짓)에서는
 * 장면이 멈춘 듯 머문다 (넓은 전경). 서버 시계 각도만 쓰므로 시작·꼭대기·내리는 때가 실제와 같다
 */
export function ferrisLift(angle: number): number {
  const up = (1 - Math.cos(angle)) / 2;
  return Math.min(1, up * 1.06);
}

export type RouteSeg = {
  /** 항로 위 거리 (px) 시작·끝 */
  s0: number;
  s1: number;
  /** 구역 종류 (ZONES id, 구역 밖이면 null) · 이름 */
  id: string | null;
  name: string | null;
};

/** 땅 위 점이 들어 있는 가장 작은 구역 */
export function zoneAt(x: number, y: number): (typeof ZONES)[number] | null {
  let best: (typeof ZONES)[number] | null = null;
  let area = Infinity;
  for (const z of ZONES) {
    if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) continue;
    const a = z.w * z.h;
    if (a < area) {
      area = a;
      best = z;
    }
  }
  return best;
}

let segs: RouteSeg[] | null = null;
/** 항로를 지나가는 구역 차례 (열기구 장면의 땅 띠를 이 차례로 그린다 — HUD 이름 placeName과 같은 판정) */
export function routeSegments(): readonly RouteSeg[] {
  if (segs) return segs;
  const L = routeLength();
  const out: RouteSeg[] = [];
  const STEP = 6;
  for (let s = 0; s <= L; s += STEP) {
    const p = routeAt(s);
    const z = zoneAt(p.x, p.y);
    const name = z?.name ?? null;
    const last = out[out.length - 1];
    if (last && last.name === name) last.s1 = Math.min(L, s + STEP);
    else out.push({ s0: s, s1: Math.min(L, s + STEP), id: z?.id ?? null, name });
  }
  segs = out;
  return out;
}

/** 열기구가 지금 항로 위 어디쯤인지 (px, 0..routeLength) */
export function balloonRouteS(s: BalloonState): number {
  return s.boarding ? 0 : flightProgress(s.u) * routeLength();
}

// ── 상호작용·충돌 (layout.ts가 더한다) ──
export function skyInteractables(): Interactable[] {
  return [
    { id: "ferris:wheel", kind: "ferris", x: FERRIS_BOARD.x, y: FERRIS_BOARD.y + 2, r: 22, ax: FERRIS_BOARD.x, ay: FERRIS_BOARD.y, label: "관람차 타기" },
    { id: "balloon:pad", kind: "balloon", x: BALLOON_PAD.x, y: BALLOON_PAD.y + 10, r: 20, ax: BALLOON_PAD.x, ay: BALLOON_PAD.y + 10, label: "열기구 타기" },
  ];
}

/** 관람차 다리·받침, 출발장 팻말 기둥 (점프로 못 넘는다). 칸·바구니 자리 위에는 충돌이 없다 */
export function skyColliders(): Rect[] {
  return [
    { x: FERRIS.x - 26, y: FERRIS.y - 5, w: 9, h: 5 },
    { x: FERRIS.x + 17, y: FERRIS.y - 5, w: 9, h: 5 },
    { x: FERRIS.x - 8, y: FERRIS.y - 4, w: 16, h: 4 },
    { x: BALLOON_PAD.x + 22, y: BALLOON_PAD.y - 3, w: 4, h: 3 },
  ];
}

/** 소품을 흩뿌릴 때 피할 자리 */
export const SKY_KEEPOUT: readonly { x: number; y: number; r: number }[] = [
  { x: FERRIS.x, y: FERRIS.y - 30, r: 46 },
  { x: BALLOON_PAD.x, y: BALLOON_PAD.y, r: 30 },
];
