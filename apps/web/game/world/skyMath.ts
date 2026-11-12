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
  MAP_HEIGHT,
  MAP_WIDTH,
  ZONES,
  type BalloonSeat,
  type FerrisSeat,
} from "@tomb/protocol";
import type { Interactable, Rect } from "./layout";

// 놀이기구 2 (관람차·열기구) — 순수 데이터와 수식. 그림·탑승·소리는 SkyRides.ts, 3D처럼 보이는 하늘 시점은 SkyView.ts.
//  - 관람차: 칸 위치 = 서버 시계로 돈다 (회전목마처럼 따로 주고받지 않는다). 탄 사람은 자기 칸이 한 바퀴 돌아 내려오면 내린다
//  - 열기구: 운항 시간표(protocol balloonPhase) + 정해진 항로 → 시각만 알면 누구 화면에서나 같은 자리
//  - 하늘 시점 카메라(SkyPose): 맵을 땅바닥 판(X = 맵 x, Z = 맵 y, Y = 높이 px)으로 보고 원근 카메라를 둔다.
//    yaw 0 = 북쪽(맵 위쪽)을 본다, + = 오른쪽(동쪽)으로. pitch − = 아래를 본다. roll = 바람·흔들림 기울기

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
/** 하늘 시점 높이 (3D px): 순항 · 바구니 눈높이 */
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
  /** 하늘 시점 높이 (3D px) */
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
  let best: string | null = null;
  let area = Infinity;
  for (const z of ZONES) {
    if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) continue;
    const a = z.w * z.h;
    if (a < area) {
      area = a;
      best = z.name;
    }
  }
  return best;
}

// ── 하늘 시점 카메라 ──
export type SkyPose = { x: number; z: number; h: number; yaw: number; pitch: number; roll: number };
const DEG = Math.PI / 180;
/** 세로 시야각 */
export const SKY_FOV_Y = 52 * DEG;

/**
 * 관람차 칸에서의 시점: 칸 높이를 따라 오르내리고(바닥 근처 22 → 꼭대기 272), 북쪽(광장·마을)을 본다.
 * 오를수록 더 아래를 내려다보고, 꼭대기 근처에서는 천천히 왼쪽에서 오른쪽으로 둘러본다
 */
export function ferrisPose(car: number, t: number): SkyPose {
  const a = carAngle(car, t);
  const up = (1 - Math.cos(a)) / 2; // 0 아래 … 1 꼭대기
  const top = up * up * up;
  const look = Math.sin((a - Math.PI) * 1.6) * 0.42 * top;
  return {
    x: FERRIS.x - Math.sin(a) * 60,
    z: FERRIS.y - 6,
    h: 22 + 250 * up,
    yaw: look,
    pitch: -(7 + 31 * up) * DEG,
    roll: Math.sin(t / 1700) * 0.6 * DEG,
  };
}

/**
 * 열기구 바구니에서의 시점: 가는 쪽을 보며 주로 아래를 내려다보고, 가끔(약 26초마다 7초) 지평선 쪽으로 고개를 든다.
 * 바람에 살짝 흔들린다 (roll·yaw)
 */
export function balloonPose(s: BalloonState, flightMs: number): SkyPose {
  const cycle = 26_000;
  const ph = (((flightMs % cycle) + cycle) % cycle) / cycle;
  const raise = ph > 0.62 && ph < 0.9 ? Math.sin(((ph - 0.62) / 0.28) * Math.PI) : 0;
  const lift = flightLift(s.u);
  return {
    x: s.x,
    z: s.y + 30 * lift,
    h: s.h,
    yaw: s.heading + Math.sin(flightMs / 5200) * 0.08,
    pitch: (-(14 + 30 * lift) + 24 * raise * lift) * DEG,
    roll: (Math.sin(flightMs / 1900) * 1.1 + Math.sin(flightMs / 830) * 0.4) * DEG * lift,
  };
}

/** 카메라 축 (right, up, fwd) — 셰이더와 같은 식 */
export function poseBasis(p: SkyPose): { r: [number, number, number]; u: [number, number, number]; f: [number, number, number] } {
  const cp = Math.cos(p.pitch);
  const f: [number, number, number] = [Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
  const r0: [number, number, number] = [Math.cos(p.yaw), 0, Math.sin(p.yaw)];
  // up = right × fwd
  const u0: [number, number, number] = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
  const c = Math.cos(p.roll);
  const s = Math.sin(p.roll);
  const r: [number, number, number] = [r0[0] * c + u0[0] * s, r0[1] * c + u0[1] * s, r0[2] * c + u0[2] * s];
  const u: [number, number, number] = [u0[0] * c - r0[0] * s, u0[1] * c - r0[1] * s, u0[2] * c - r0[2] * s];
  return { r, u, f };
}

/** 화면 점(nx, ny ∈ −1..1, y 위가 +)에서 나간 시선이 땅에 닿는 곳 (맵 좌표). 땅에 안 닿거나 far보다 멀면 far 거리의 점 */
export function groundHit(p: SkyPose, nx: number, ny: number, aspect: number, far: number): { x: number; y: number; hit: boolean } {
  const B = poseBasis(p);
  const ty = Math.tan(SKY_FOV_Y / 2);
  const tx = ty * aspect;
  const d = [0, 1, 2].map((i) => B.f[i] + B.r[i] * nx * tx + B.u[i] * ny * ty);
  const len = Math.hypot(d[0], d[1], d[2]);
  const dir = d.map((v) => v / len);
  if (dir[1] < -1e-4) {
    const t = p.h / -dir[1];
    const hx = dir[0] * t;
    const hz = dir[2] * t;
    const hd = Math.hypot(hx, hz);
    if (hd <= far) return { x: p.x + hx, y: p.z + hz, hit: true };
  }
  const hl = Math.hypot(dir[0], dir[2]) || 1;
  return { x: p.x + (dir[0] / hl) * far, y: p.z + (dir[2] / hl) * far, hit: false };
}

/**
 * 이 시점에서 보이는 땅을 다 담는 맵 사각형 (월드 카메라를 이 사각형에 맞춰 그리고 그 화면을 땅바닥 판 그림으로 쓴다).
 * 맵 밖은 잘라낸다 (셰이더가 맵 밖을 따로 칠한다). 너무 작으면 min 크기로
 */
export function skyFootprint(p: SkyPose, aspect: number, far: number, min = 160): Rect {
  let x0 = p.x;
  let x1 = p.x;
  let y0 = p.z;
  let y1 = p.z;
  const N = 6;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      if (i !== 0 && i !== N && j !== 0 && j !== N) continue;
      const g = groundHit(p, (i / N) * 2 - 1, (j / N) * 2 - 1, aspect, far);
      x0 = Math.min(x0, g.x);
      x1 = Math.max(x1, g.x);
      y0 = Math.min(y0, g.y);
      y1 = Math.max(y1, g.y);
    }
  }
  const pad = 24;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(MAP_WIDTH, x1 + pad);
  y1 = Math.min(MAP_HEIGHT, y1 + pad);
  if (x1 - x0 < min) {
    const c = Math.max(min / 2, Math.min(MAP_WIDTH - min / 2, (x0 + x1) / 2));
    x0 = c - min / 2;
    x1 = c + min / 2;
  }
  if (y1 - y0 < min) {
    const c = Math.max(min / 2, Math.min(MAP_HEIGHT - min / 2, (y0 + y1) / 2));
    y0 = c - min / 2;
    y1 = c + min / 2;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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
