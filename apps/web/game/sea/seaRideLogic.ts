import { DIR, SEA_JET_MIN_Y, SEA_JETSKI_SPEED, SEA_TUBE_SPEED, seaJetWater, seaRideBlocked, seaTubeWater, tideLineY, type DirId } from "@tomb/protocol";

// 11/16 r13 바다 놀거리 움직임 (순수 — 시험은 seaRideLogic.test).
//  - 튜브: 방향키로 천천히 노 젓기 (헤엄보다 느려요), 물결이 살짝 밀어요. 모래에 닿으면 내려요(land), 선착장·바위·배에는 살짝 멈춰요
//  - 제트스키: 관성 있게 빨라지고 미끄러져요. 깊은 물(SEA_JET_MIN_Y 바깥)만 — 얕은 쪽으로 가면 멈추고 「여기는 너무 얕아요」(shallow)

export type RideMotion = { x: number; y: number; vx: number; vy: number; dir: DirId };
export type RideInput = { ax: number; ay: number };
export type RideStep = { land: { x: number; y: number } | null; shallow: boolean; bumped: boolean };

/** 튜브가 빨라지는·멈추는 시간 (ms) */
const TUBE_TAU = 520;
/** 제트스키 가속 · 손을 떼면 미끄러지다 서는 시간 (ms) */
const JET_TAU = 380;
const JET_COAST_TAU = 1100;
/** 물결이 튜브를 미는 세기 (px/s) */
export const TUBE_CURRENT = 3;

function approach(v: number, goal: number, dt: number, tau: number): number {
  return goal + (v - goal) * Math.exp(-dt / tau);
}

/** 움직이는 방향 → 4방향 (느리면 그대로) */
export function rideFacing(vx: number, vy: number, prev: DirId): DirId {
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  if (Math.max(ax, ay) < 4) return prev;
  if (ax >= ay * 1.15) return vx > 0 ? DIR.right : DIR.left;
  if (ay >= ax * 1.15) return vy > 0 ? DIR.down : DIR.up;
  return prev;
}

function clampInput(i: RideInput): RideInput {
  const m = Math.hypot(i.ax, i.ay);
  return m > 1 ? { ax: i.ax / m, ay: i.ay / m } : i;
}

/** 튜브 한 걸음. level = 지금 물 높이, t = 시계 ms (물결) */
export function stepTube(m: RideMotion, input: RideInput, dtMs: number, level: number, t: number): RideStep {
  const dt = Math.min(100, Math.max(0, dtMs));
  const i = clampInput(input);
  m.vx = approach(m.vx, i.ax * SEA_TUBE_SPEED, dt, TUBE_TAU);
  m.vy = approach(m.vy, i.ay * SEA_TUBE_SPEED, dt, TUBE_TAU);
  // 물결: 옆으로 천천히 오가며 살짝 밀어요
  const cx = Math.sin(t / 7_000) * TUBE_CURRENT;
  const cy = Math.sin(t / 11_000 + 1) * TUBE_CURRENT * 0.4;
  const nx = m.x + ((m.vx + cx) * dt) / 1000;
  const ny = m.y + ((m.vy + cy) * dt) / 1000;
  const out: RideStep = { land: null, shallow: false, bumped: false };
  if (seaTubeWater(nx, ny, level)) {
    m.x = nx;
    m.y = ny;
  } else if (!seaRideBlocked(nx, ny, 9) && ny < tideLineY(level) + 14 && i.ay < 0) {
    // 물가(모래)에 닿았어요 → 내려서요 (물가 선 바로 위 마른 모래)
    out.land = { x: Math.round(nx), y: Math.round(Math.min(ny, tideLineY(level) + 2) - 6) };
  } else {
    // 선착장·바위·배·맵 끝: 막힌 쪽만 멈추고 옆으로는 미끄러져요
    out.bumped = Math.hypot(m.vx, m.vy) > 8;
    if (seaTubeWater(nx, m.y, level)) m.x = nx;
    else m.vx *= -0.2;
    if (seaTubeWater(m.x, ny, level)) m.y = ny;
    else m.vy *= -0.2;
  }
  m.dir = rideFacing(m.vx, m.vy, m.dir);
  return out;
}

/** 제트스키 한 걸음 */
export function stepJet(m: RideMotion, input: RideInput, dtMs: number): RideStep {
  const dt = Math.min(100, Math.max(0, dtMs));
  const i = clampInput(input);
  const pushing = Math.hypot(i.ax, i.ay) > 0.1;
  m.vx = approach(m.vx, i.ax * SEA_JETSKI_SPEED, dt, pushing ? JET_TAU : JET_COAST_TAU);
  m.vy = approach(m.vy, i.ay * SEA_JETSKI_SPEED, dt, pushing ? JET_TAU : JET_COAST_TAU);
  const nx = m.x + (m.vx * dt) / 1000;
  const ny = m.y + (m.vy * dt) / 1000;
  const out: RideStep = { land: null, shallow: false, bumped: false };
  if (seaJetWater(nx, ny)) {
    m.x = nx;
    m.y = ny;
  } else {
    // 얕은 물(물가 쪽)이면 멈추고 알려요, 부딪히는 것이면 쿵
    if (ny < SEA_JET_MIN_Y && i.ay < 0) out.shallow = true;
    else out.bumped = Math.hypot(m.vx, m.vy) > 20;
    if (seaJetWater(nx, m.y)) m.x = nx;
    else m.vx *= -0.25;
    if (seaJetWater(m.x, ny)) m.y = ny;
    else m.vy = ny < SEA_JET_MIN_Y ? 0 : m.vy * -0.25;
  }
  m.dir = rideFacing(m.vx, m.vy, m.dir);
  return out;
}

/** 탄 사람이 내린 튜브가 떠다니는 길로 돌아가는 비율 (0 = 내린 자리, 1 = 길 위). 거리 20px/s, 4~20초 */
export function tubeReturnK(dist: number, sinceMs: number): number {
  const dur = Math.min(20_000, Math.max(4_000, (dist / 20) * 1000));
  const k = Math.min(1, Math.max(0, sinceMs / dur));
  return k * k * (3 - 2 * k);
}
