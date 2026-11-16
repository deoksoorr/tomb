import type { Box } from "../logic/bounce";
import { DIR, SEA_JET_MIN_Y, SEA_JETSKI_SPEED, SEA_KAYAK_SEAT_GAP, SEA_KAYAK_SPEED, SEA_TUBE_SPEED, seaJetWater, seaKayakWater, seaRideBlocked, seaTubeWater, tideLineY, type DirId } from "@tomb/protocol";

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

/**
 * 11/16 r14 사용자: 가만히 탄 튜브도 물결 따라 떠다녀요 — 빈 튜브와 같은 결의 흐름 (느린 옆 흐름 + 파도에 물가 쪽으로 살짝 밀렸다 돌아가요).
 * 노를 저으면 그 위에 더해요. 세기는 px/s (서버 속도 검증보다 훨씬 작아요)
 */
export function tubeCurrent(t: number, phase = 0): { x: number; y: number } {
  const TAU = Math.PI * 2;
  return {
    x: Math.sin(t / 7_000 + phase) * TUBE_CURRENT + Math.cos((t / 23_000) * TAU + phase) * 6,
    y: Math.sin((t / 6_000) * TAU + phase * 0.7) * 4 + Math.sin(t / 11_000 + 1 + phase) * TUBE_CURRENT * 0.4,
  };
}

/** 튜브 한 걸음. level = 지금 물 높이, t = 시계 ms (물결), phase = 튜브마다 다른 흐름 */
export function stepTube(m: RideMotion, input: RideInput, dtMs: number, level: number, t: number, phase = 0): RideStep {
  const dt = Math.min(100, Math.max(0, dtMs));
  const i = clampInput(input);
  m.vx = approach(m.vx, i.ax * SEA_TUBE_SPEED, dt, TUBE_TAU);
  m.vy = approach(m.vy, i.ay * SEA_TUBE_SPEED, dt, TUBE_TAU);
  // 물결: 옆으로 천천히 오가며, 파도에 물가 쪽으로 살짝 밀렸다 돌아가요 (가만히 있어도 떠다녀요)
  const c = tubeCurrent(t, phase);
  const cx = c.x;
  const cy = c.y;
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

/**
 * 11/16 r18 카약 한 걸음 (노 젓는 사람 쪽에서). 얕은 물도 다녀요 (마른 갯벌·모래·데크·바위·매어 둔 제트스키는 안 돼요).
 * 아무도 노를 안 저어도 튜브와 같은 물결 흐름으로 떠다녀요 (노를 저으면 그 위에 더해요). 모래 쪽으로 저어 마른 곳에 닿으면 land (둘 다 내려요)
 */
export function stepKayak(m: RideMotion, input: RideInput, dtMs: number, level: number, t: number, phase = 0): RideStep {
  const dt = Math.min(100, Math.max(0, dtMs));
  const i = clampInput(input);
  m.vx = approach(m.vx, i.ax * SEA_KAYAK_SPEED, dt, 450);
  m.vy = approach(m.vy, i.ay * SEA_KAYAK_SPEED, dt, 450);
  const c = tubeCurrent(t, phase);
  const nx = m.x + ((m.vx + c.x) * dt) / 1000;
  const ny = m.y + ((m.vy + c.y) * dt) / 1000;
  const out: RideStep = { land: null, shallow: false, bumped: false };
  if (seaKayakWater(nx, ny, level)) {
    m.x = nx;
    m.y = ny;
  } else if (!seaRideBlocked(nx, ny, 7) && ny < tideLineY(level) + 10 && i.ay < 0) {
    out.land = { x: Math.round(nx), y: Math.round(Math.min(ny, tideLineY(level) + 2) - 6) };
  } else {
    out.bumped = Math.hypot(m.vx, m.vy) > 10;
    if (seaKayakWater(nx, m.y, level)) m.x = nx;
    else m.vx *= -0.2;
    if (seaKayakWater(m.x, ny, level)) m.y = ny;
    else m.vy *= -0.2;
  }
  m.dir = rideFacing(m.vx, m.vy, m.dir);
  return out;
}
/** 카약 두 자리 (0 = 앞 · 먼저 탄 사람이 노 저어 조종, 1 = 뒤 · 같이 탄 사람)가 카약 가운데에서 떨어진 만큼 (가는 쪽이 앞) */
export function kayakSeatOffset(dir: DirId, k: 0 | 1): { dx: number; dy: number } {
  const g = SEA_KAYAK_SEAT_GAP * (k === 0 ? 1 : -1);
  if (dir === DIR.right) return { dx: g, dy: 0 };
  if (dir === DIR.left) return { dx: -g, dy: 0 };
  if (dir === DIR.up) return { dx: 0, dy: -g };
  return { dx: 0, dy: g };
}

// ── 11/16 r19 몸 상자 (헤엄치는 사람을 막는 상자 = 놀거리끼리 부딪혀 튕기는 상자 — logic/bounce) ──
const TUBE_BOX = { w: 14, h: 6 };
const JET_BOX_SIDE = { w: 28, h: 8 };
const JET_BOX_FB = { w: 12, h: 12 };
/** 튜브·제트스키 (x,y = 놀거리 자리 — 제트스키는 몸통 가운데가 2px 위) */
export function rideBox(kind: "tube" | "jetski", dir: DirId, x: number, y: number): Box {
  const side = kind === "jetski" && (dir === DIR.left || dir === DIR.right);
  const sz = kind === "tube" ? TUBE_BOX : side ? JET_BOX_SIDE : JET_BOX_FB;
  const cy = kind === "tube" ? y : y - 2;
  return { x: Math.round(x - sz.w / 2), y: Math.round(cy - sz.h / 2), w: sz.w, h: sz.h };
}
/** 카약: 옆모습은 가로로 길고 세로 모습은 세로로 길어요 (매어 둔 셋이 35px 간격이라 34px — 타자마자 옆 카약에 닿지 않게) */
export function kayakBox(dir: DirId, x: number, y: number): Box {
  const side = dir === DIR.left || dir === DIR.right;
  const w = side ? 34 : 10;
  const h = side ? 8 : 32;
  return { x: Math.round(x - w / 2), y: Math.round(y - h / 2), w, h };
}
