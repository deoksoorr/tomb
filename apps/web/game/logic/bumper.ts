import { BUMPER_SEATS, DIR, type BumperSeat, type DirId, type Sid } from "@tomb/protocol";
import { BUMPER_EXIT_AT, BUMPER_EXIT_R, BUMPER_POSTS, RINK_INNER, type BumperPost } from "../bumper/bumperLayout";

// 범퍼카 규칙 (11/16) — 순수 함수라 테스트한다 (그림·네트워크는 bumper/BumperRide.ts).
//  - 운전: 방향키·조이스틱이 가리키는 쪽으로 차머리를 돌리며(회전 빠르기 제한) 앞으로 민다.
//    앞뒤로는 조금, 옆으로는 많이 미끄러져 줄어든다(관성 있는 미끄러짐). 손을 떼면 천천히 선다.
//  - 부딪힘: 링크 고무 테두리·가운데 기둥·타이어·다른 차(세워 둔 차 포함)에 닿으면 튕겨 나가고 살짝 돈다.
//    다른 사람 차는 그 사람 화면이 움직인다 — 내 화면은 내 차에만 반응을 준다 (상대 위치·속도를 보고 내 차를 튕긴다, 서버 물리 없음)
//  - 차 몸통은 반지름 CAR_R 동그라미로 본다

/** 차 몸통 반지름 (px) */
export const CAR_R = 8;
/** 최고 속도 (px/초) — 달리기(약 100)보다 조금 느리다 (서버 속도 검증 안) */
export const CAR_MAX_SPEED = 90;
/** 미는 힘 (px/초²) */
const ACCEL = 170;
/** 차머리 도는 빠르기 (라디안/초) */
const TURN = 4.2;
/** 앞뒤 마찰 (1/초): 미는 중 · 손 뗀 뒤 */
const FWD_DRAG = 1.5;
const COAST_DRAG = 1.1;
/** 옆 미끄러짐 마찰 (1/초) — 작을수록 더 미끄러진다 */
const GRIP = 3.2;
/** 튕김 (0..1): 고무 테두리 · 기둥·타이어 · 다른 차 */
const WALL_E = 0.75;
const POST_E = 0.8;
const CAR_E = 0.9;
/** 차끼리 닿으면 적어도 이만큼은 떨어지는 쪽으로 (px/초) — 서로 붙어 있지 않게 */
const CAR_KICK = 26;
/** 부딪힌 뒤 도는 힘 (라디안/초, 세기에 비례) · 줄어드는 빠르기 */
const SPIN_K = 0.045;
const SPIN_MAX = 7;
const SPIN_DAMP = 3.2;
/** 입력이 있다고 보는 세기 */
const DEAD = 0.15;

/** 내 차 움직임 (x,y = 차 가운데 = 탄 사람 발, h = 차머리 각도 — 0 오른쪽, 아래가 +) */
export type CarMotion = { x: number; y: number; vx: number; vy: number; h: number; spin: number };
/** 부딪힐 수 있는 다른 차 (위치·속도) */
export type CarBody = { x: number; y: number; vx: number; vy: number };
/** 부딪힘 한 번: 세기(닿는 순간 다가오던 빠르기, px/초), 닿은 곳, 무엇과 */
export type Bump = { power: number; x: number; y: number; with: "wall" | "post" | "car" };

/** 링크 안에서 차 가운데가 갈 수 있는 범위 */
export const CAR_BOUNDS = { x0: RINK_INNER.x + CAR_R, x1: RINK_INNER.x + RINK_INNER.w - CAR_R, y0: RINK_INNER.y + CAR_R, y1: RINK_INNER.y + RINK_INNER.h - CAR_R } as const;

/** 각도를 −π..π로 */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export function newMotion(x: number, y: number, h = Math.PI / 2): CarMotion {
  return { x, y, vx: 0, vy: 0, h, spin: 0 };
}

/** 운전 한 걸음 (부딪힘은 collideCar로 따로). ax, ay = 이동 입력 (−1..1) */
export function stepCar(m: CarMotion, ax: number, ay: number, dtMs: number): CarMotion {
  const dt = Math.min(Math.max(dtMs, 0), 50) / 1000;
  const mag = Math.min(1, Math.hypot(ax, ay));
  const driving = mag >= DEAD;
  if (driving) {
    const diff = wrapAngle(Math.atan2(ay, ax) - m.h);
    const turn = TURN * dt * (0.55 + 0.45 * mag);
    m.h = wrapAngle(m.h + Math.max(-turn, Math.min(turn, diff)));
    // 가리키는 쪽과 차머리가 비슷할수록 세게 민다. 뒤쪽을 가리키면 살살 밀며 돈다 (빙글 도는 맛)
    const c = Math.cos(diff);
    const push = ACCEL * mag * (c > 0 ? 0.3 + 0.7 * c : 0.22);
    m.vx += Math.cos(m.h) * push * dt;
    m.vy += Math.sin(m.h) * push * dt;
  }
  // 미끄러짐: 앞뒤 성분과 옆 성분을 따로 줄인다
  const fx = Math.cos(m.h);
  const fy = Math.sin(m.h);
  const fwd = (m.vx * fx + m.vy * fy) * Math.exp(-(driving ? FWD_DRAG : COAST_DRAG) * dt);
  const lat = (-m.vx * fy + m.vy * fx) * Math.exp(-GRIP * dt);
  m.vx = fwd * fx - lat * fy;
  m.vy = fwd * fy + lat * fx;
  const sp = Math.hypot(m.vx, m.vy);
  if (sp > CAR_MAX_SPEED) {
    m.vx *= CAR_MAX_SPEED / sp;
    m.vy *= CAR_MAX_SPEED / sp;
  } else if (!driving && sp < 1.5) m.vx = m.vy = 0;
  // 부딪혀 도는 중
  if (m.spin !== 0) {
    m.h = wrapAngle(m.h + m.spin * dt);
    m.spin *= Math.exp(-SPIN_DAMP * dt);
    if (Math.abs(m.spin) < 0.05) m.spin = 0;
  }
  m.x += m.vx * dt;
  m.y += m.vy * dt;
  return m;
}

function addSpin(m: CarMotion, nx: number, ny: number, power: number): void {
  // 닿은 쪽(법선)이 차머리 왼쪽이면 오른쪽으로, 오른쪽이면 왼쪽으로 돈다
  const side = Math.cos(m.h) * ny - Math.sin(m.h) * nx;
  const s = side >= 0 ? 1 : -1;
  m.spin = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, m.spin + s * power * SPIN_K));
}

/**
 * 부딪힘 처리 (stepCar 다음에): 테두리·기둥·다른 차에서 밀어내고 튕긴다. 가장 센 부딪힘 하나를 돌려준다 (없으면 null).
 * others = 다른 사람 차·세워 둔 차 (속도를 알면 넣는다 — 달려오는 차에 받히면 더 세게 밀린다)
 */
export function collideCar(m: CarMotion, others: readonly CarBody[], posts: readonly BumperPost[] = BUMPER_POSTS): Bump | null {
  let best: Bump | null = null;
  const hit = (power: number, x: number, y: number, kind: Bump["with"]) => {
    if (power > 0 && (!best || power > best.power)) best = { power, x, y, with: kind };
  };
  const b = CAR_BOUNDS;
  if (m.x < b.x0) {
    m.x = b.x0;
    if (m.vx < 0) {
      hit(-m.vx, b.x0 - CAR_R, m.y, "wall");
      addSpin(m, 1, 0, -m.vx);
      m.vx = -m.vx * WALL_E;
    }
  } else if (m.x > b.x1) {
    m.x = b.x1;
    if (m.vx > 0) {
      hit(m.vx, b.x1 + CAR_R, m.y, "wall");
      addSpin(m, -1, 0, m.vx);
      m.vx = -m.vx * WALL_E;
    }
  }
  if (m.y < b.y0) {
    m.y = b.y0;
    if (m.vy < 0) {
      hit(-m.vy, m.x, b.y0 - CAR_R, "wall");
      addSpin(m, 0, 1, -m.vy);
      m.vy = -m.vy * WALL_E;
    }
  } else if (m.y > b.y1) {
    m.y = b.y1;
    if (m.vy > 0) {
      hit(m.vy, m.x, b.y1 + CAR_R, "wall");
      addSpin(m, 0, -1, m.vy);
      m.vy = -m.vy * WALL_E;
    }
  }
  for (const p of posts) {
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const min = CAR_R + p.r;
    const d = Math.hypot(dx, dy);
    if (d >= min) continue;
    const nx = d > 0.001 ? dx / d : 0;
    const ny = d > 0.001 ? dy / d : -1;
    m.x = p.x + nx * min;
    m.y = p.y + ny * min;
    const vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      hit(-vn, p.x + nx * p.r, p.y + ny * p.r, "post");
      addSpin(m, nx, ny, -vn);
      m.vx -= (1 + POST_E) * vn * nx;
      m.vy -= (1 + POST_E) * vn * ny;
    }
  }
  for (const o of others) {
    const dx = m.x - o.x;
    const dy = m.y - o.y;
    const min = CAR_R * 2;
    const d = Math.hypot(dx, dy);
    if (d >= min) continue;
    const nx = d > 0.001 ? dx / d : 0;
    const ny = d > 0.001 ? dy / d : -1;
    // 상대 차는 내 화면에서 움직이지 않는다 → 내 차만 닿지 않는 곳까지 밀어낸다
    m.x = o.x + nx * min;
    m.y = o.y + ny * min;
    const vn = (m.vx - o.vx) * nx + (m.vy - o.vy) * ny;
    if (vn < 0) {
      // 같은 무게 두 차가 부딪힌 몫 (내 몫만): 상대가 달려왔으면 그만큼 더 세게 밀린다
      const j = (-(1 + CAR_E) * vn) / 2;
      m.vx += j * nx;
      m.vy += j * ny;
      hit(-vn, o.x + nx * CAR_R, o.y + ny * CAR_R, "car");
      addSpin(m, nx, ny, -vn);
    }
    // 서로 붙어 있지 않게 조금은 떨어지는 쪽으로
    const away = m.vx * nx + m.vy * ny;
    if (away < CAR_KICK) {
      m.vx += (CAR_KICK - away) * nx;
      m.vy += (CAR_KICK - away) * ny;
    }
  }
  // 차끼리 밀다가 테두리 밖으로 나가지 않게 한 번 더
  m.x = Math.max(b.x0, Math.min(b.x1, m.x));
  m.y = Math.max(b.y0, Math.min(b.y1, m.y));
  return best;
}

/** 이 세기부터 「쿵」으로 센다 · 화면이 흔들린다 (px/초) */
export const BUMP_COUNT_POWER = 24;
export const BUMP_BIG_POWER = 62;

/** 차머리 각도 → 캐릭터가 보는 4방향 (서버에 보내는 dir) */
export function headingDir(h: number): DirId {
  const a = wrapAngle(h);
  if (a > -Math.PI / 4 && a <= Math.PI / 4) return DIR.right;
  if (a > Math.PI / 4 && a <= (3 * Math.PI) / 4) return DIR.down;
  if (a > (-3 * Math.PI) / 4 && a <= -Math.PI / 4) return DIR.up;
  return DIR.left;
}

/** 4방향 → 각도 (원격 차가 멈춰 있을 때 차머리) */
export function dirAngle(d: DirId): number {
  return d === DIR.right ? 0 : d === DIR.down ? Math.PI / 2 : d === DIR.left ? Math.PI : -Math.PI / 2;
}

/** 차머리 각도 → 그림 갈래 (frames방향, 0 = 오른쪽부터 시계 방향) */
export function headingFrame(h: number, frames: number): number {
  const step = (Math.PI * 2) / frames;
  return (((Math.round(wrapAngle(h) / step) % frames) + frames) % frames) as number;
}

/**
 * 입구에서 E: 탈 차 고르기 — 서버가 아무도 차지하지 않았고(내 화면 기준) 제자리에 세워져 있는 차 중 무작위 하나 (차 색이 무작위).
 * parked(i) = 차 i가 제자리에 있는지 (돌아오는 중이면 false). 없으면 null
 */
export function pickCar(occupied: ReadonlyMap<string, Sid>, mySid: Sid | null, parked: (car: number) => boolean, rand: () => number = Math.random): BumperSeat | null {
  const free = BUMPER_SEATS.filter((s) => {
    const owner = occupied.get(s.id);
    return (owner === undefined || owner === mySid) && parked(s.car);
  });
  if (!free.length) return null;
  return free[Math.min(free.length - 1, Math.floor(rand() * free.length))];
}

/** 내릴 수 있는 곳인지 (입구 안쪽 둘레) */
export function canExit(x: number, y: number): boolean {
  return Math.hypot(x - BUMPER_EXIT_AT.x, y - BUMPER_EXIT_AT.y) <= BUMPER_EXIT_R;
}

/**
 * 이 차가 무언가(테두리·기둥·타이어·다른 차)에 닿아 있거나 바로 앞인지 (margin px 여유).
 * 다른 사람 차의 부딪힘을 알아챌 때, 아무것도 없는 한가운데에서 보간이 흔들려 생기는 헛것을 거른다
 */
export function touching(x: number, y: number, others: readonly { x: number; y: number }[], posts: readonly BumperPost[] = BUMPER_POSTS, margin = 4): boolean {
  const b = CAR_BOUNDS;
  if (x <= b.x0 + margin || x >= b.x1 - margin || y <= b.y0 + margin || y >= b.y1 - margin) return true;
  for (const p of posts) if (Math.hypot(x - p.x, y - p.y) <= p.r + CAR_R + margin) return true;
  for (const o of others) if (Math.hypot(x - o.x, y - o.y) <= CAR_R * 2 + margin) return true;
  return false;
}

/**
 * 다른 사람 차의 부딪힘 알아채기 (내 화면 연출용 — 그 사람 화면의 실제 부딪힘은 그 사람이 낸다).
 * 보간된 위치로 잰 속도가 짧은 사이에 크게 꺾이면(방향이 60° 넘게 바뀌고 세기가 충분) 부딪힌 것으로 본다. 세기(px/초) 또는 0.
 * 부르는 쪽이 touching으로 무언가에 닿아 있을 때만 센다
 */
export function remoteBumpPower(prev: { vx: number; vy: number }, now: { vx: number; vy: number }): number {
  const ps = Math.hypot(prev.vx, prev.vy);
  if (ps < 22) return 0;
  const dvx = now.vx - prev.vx;
  const dvy = now.vy - prev.vy;
  const dv = Math.hypot(dvx, dvy);
  if (dv < 44) return 0;
  const ns = Math.hypot(now.vx, now.vy);
  const cos = ns > 0.001 ? (prev.vx * now.vx + prev.vy * now.vy) / (ps * ns) : -1;
  return cos < 0.5 ? dv / 2 : 0;
}
