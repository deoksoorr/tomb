import {
  BOAT_BACK_SEAT,
  CAMP_CROSSINGS,
  CAMP_PLUNGE,
  CAMP_PLUNGE_ZONE,
  CAMP_ROW_DOCK_RECT,
  CAMP_ROWBOAT_SPEED,
  CAMP_VIEW_BRIDGE,
  campRowboatWater,
  campStreamX,
  DIR,
  inCampPlunge,
  inCampStream,
  type DirId,
} from "@tomb/protocol";
import { BOAT_BACK_SEAT_Y } from "../sprites/rideProps";

// 11/26 캠핑장 물살 (순수 계산 — campWater.test). 헤엄칠 때 Player.current가 프레임마다 부른다 (마을 강 waterCurrent와 같은 자리).
//  - 옛길 계곡: 아래로 흐른다 (가만히 떠 있으면 천천히 떠내려간다)
//  - 달그늘 소 안쪽 폭포 떨어지는 곳(CAMP_PLUNGE_ZONE): 바깥으로 세게 밀어낸다 — 헤엄 최고 속도(달리기 × 0.6 ≈ 60px/s)보다 세게,
//    서버 속도 검증(달리기 × 1.5 ≈ 151px/s) 안에서. 낚시 바위·소 가장자리는 물살이 없다

/** 계곡 물살 (px/s) */
export const STREAM_FLOW = 14;
/** 폭포 밑 밀어내기 (가장자리 → 가운데) */
export const PLUNGE_PUSH: readonly [number, number] = [64, 80];

const out = { vx: 0, vy: 0 };
const NONE = { vx: 0, vy: 0 } as const;

/** (x,y)에서 물이 미는 속도 (물 밖·잔잔한 물이면 0) */
export function campCurrent(x: number, y: number): { vx: number; vy: number } {
  if (inCampPlunge(x, y)) {
    const Z = CAMP_PLUNGE_ZONE;
    const dx = (x - Z.x) / Z.rx;
    // 폭포 쪽(위)은 절벽이라 아래로 밀어낸다 — 가운데 위쪽이면 곧장 아래로
    const dy = Math.max(0.35, (y - Z.y) / Z.ry);
    const d = Math.min(1, Math.hypot(dx, (y - Z.y) / Z.ry));
    const m = Math.hypot(dx, dy) || 1;
    const k = PLUNGE_PUSH[0] + (PLUNGE_PUSH[1] - PLUNGE_PUSH[0]) * (1 - d);
    out.vx = (dx / m) * k;
    out.vy = (dy / m) * k;
    return out;
  }
  if (inCampStream(x, y) && !CAMP_CROSSINGS.some((c) => y >= c.y0 - 4 && y <= c.y1 + 4)) {
    const slope = (campStreamX(y + 6) - campStreamX(y - 6)) / 12;
    const m = Math.hypot(slope, 1);
    out.vx = (slope / m) * STREAM_FLOW;
    out.vy = STREAM_FLOW / m;
    return out;
  }
  return NONE;
}

// ── 11/26 나룻배 (CampRowboats가 쓰는 순수 계산) ──
const DOCK_REACH = 34;
const ACCEL = 2.4;

/** 같이 탄 자리(1)가 노 젓는 자리(0)에서 떨어진 만큼 (방향별 — 마을 2인 조각배 seatDelta와 같다) */
export function rowSeatDelta(dir: DirId): { dx: number; dy: number } {
  if (dir === DIR.left) return { dx: BOAT_BACK_SEAT, dy: 0 };
  if (dir === DIR.right) return { dx: -BOAT_BACK_SEAT, dy: 0 };
  return { dx: 0, dy: dir === DIR.down ? -BOAT_BACK_SEAT_Y : BOAT_BACK_SEAT_Y };
}

/** 선착장 가까운지 (내리는 자리) */
export function nearRowDock(x: number, y: number): boolean {
  const D = CAMP_ROW_DOCK_RECT;
  return x > D.x - DOCK_REACH && x < D.x + D.w + DOCK_REACH && y > D.y - DOCK_REACH && y < D.y + D.h + DOCK_REACH;
}

/** 한 프레임 노 젓기 (축마다 막아 물 밖으로 나가지 않는다) */
export function stepRow(m: { x: number; y: number; vx: number; vy: number }, ax: number, ay: number, dtMs: number): void {
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  const mag = Math.hypot(ax, ay);
  const k = mag > 1 ? 1 / mag : 1;
  const a = Math.min(1, ACCEL * dt);
  m.vx += (ax * k * CAMP_ROWBOAT_SPEED - m.vx) * a;
  m.vy += (ay * k * CAMP_ROWBOAT_SPEED - m.vy) * a;
  const nx = m.x + m.vx * dt;
  if (campRowboatWater(nx, m.y)) m.x = nx;
  else m.vx = 0;
  const ny = m.y + m.vy * dt;
  if (campRowboatWater(m.x, ny)) m.y = ny;
  else m.vy = 0;
}


// ── 11/26 폭포 멍 (fallsView가 쓰는 순수 계산) ──

/** 폭포 멍 카메라 중심 (물줄기 가운데 ~ 소 앞 — 다리에 앉은 사람 머리까지 보이게 조금 아래) */
// 11/26 다리에 앉은 내 캐릭터가 아래 레터박스·채팅에 걸리지 않게 프레임을 조금 내리고 높이를 넉넉히 (운영자 「앉았을 때 보이는 시점」)
export const FALLS_VIEW_CENTER = { x: CAMP_PLUNGE.x, y: Math.round((CAMP_PLUNGE.y + CAMP_VIEW_BRIDGE.y) / 2) - 30 } as const;
/** 프레임에 넣을 폭 (절벽 양 끝 낚시 바위까지) · 높이 (폭포 중턱 ~ 다리) */
const FRAME_W = 360;
const FRAME_H = 340;

export function fallsZoom(camW: number, camH: number): number {
  const fit = Math.min(camW / FRAME_W, (camH * 0.84) / FRAME_H);
  return Math.max(1.5, Math.min(4, Math.floor(fit * 4) / 4));
}

