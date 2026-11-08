import { DIR, RUN_MULTIPLIER, WALK_SPEED, type DirId } from "@tomb/protocol";

// 입력(키보드 축 또는 아날로그 조이스틱) → 속도·방향·걷기/달리기. 순수 함수라 테스트한다.

export type MoveInput = {
  /** -1..1 (키보드는 -1/0/1, 조이스틱은 아날로그) */
  ax: number;
  ay: number;
  run: boolean;
};

export type MoveResult = {
  vx: number;
  vy: number;
  moving: boolean;
  running: boolean;
  dir: DirId;
};

export const DEADZONE = 0.18;
/** 아날로그 스틱을 살짝만 기울였을 때의 최소 속도 비율 */
const MIN_ANALOG = 0.4;
const FULL_TILT = 0.85;
/** 대각선 근처에서는 이전 방향을 유지해 스프라이트가 깜빡이지 않게 한다 */
const DIAGONAL_HYSTERESIS = 0.17;

export function emptyMove(dir: DirId = DIR.down): MoveResult {
  return { vx: 0, vy: 0, moving: false, running: false, dir };
}

/** 8방향 이동 벡터 → 4방향 스프라이트 방향 */
export function pickDir(nx: number, ny: number, prev: DirId): DirId {
  const ax = Math.abs(nx);
  const ay = Math.abs(ny);
  const horiz: DirId = nx < 0 ? DIR.left : DIR.right;
  const vert: DirId = ny < 0 ? DIR.up : DIR.down;
  if (Math.abs(ax - ay) < DIAGONAL_HYSTERESIS && (prev === horiz || prev === vert)) return prev;
  return ax > ay ? horiz : vert;
}

/** out을 채워서 돌려준다 (매 프레임 할당 없음) */
export function resolveMove(input: MoveInput, prevDir: DirId, out: MoveResult): MoveResult {
  const mag = Math.hypot(input.ax, input.ay);
  if (!Number.isFinite(mag) || mag < DEADZONE) {
    out.vx = 0;
    out.vy = 0;
    out.moving = false;
    out.running = false;
    out.dir = prevDir;
    return out;
  }
  const nx = input.ax / mag;
  const ny = input.ay / mag;
  const strength = Math.min(1, mag);
  const t = Math.max(0, Math.min(1, (strength - DEADZONE) / (FULL_TILT - DEADZONE)));
  const analog = MIN_ANALOG + (1 - MIN_ANALOG) * t;
  const speed = WALK_SPEED * (input.run ? RUN_MULTIPLIER : 1) * analog;
  out.vx = nx * speed;
  out.vy = ny * speed;
  out.moving = true;
  out.running = input.run;
  out.dir = pickDir(nx, ny, prevDir);
  return out;
}

/** 방향 id → 단위 벡터 */
export function dirVector(dir: DirId): { x: number; y: number } {
  switch (dir) {
    case DIR.left:
      return { x: -1, y: 0 };
    case DIR.right:
      return { x: 1, y: 0 };
    case DIR.up:
      return { x: 0, y: -1 };
    default:
      return { x: 0, y: 1 };
  }
}

/** (fromX,fromY)에서 (toX,toY)를 바라보는 4방향 */
export function faceToward(fromX: number, fromY: number, toX: number, toY: number, prev: DirId): DirId {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return prev;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIR.left : DIR.right) : dy < 0 ? DIR.up : DIR.down;
}
