import { BOAT_BACK_SEAT, BOAT_SEATS, BOATS, STEP_STONES, type Boat, type BoatSeat, type Sid } from "@tomb/protocol";
import { DECKS, inWater, inWaterBody, type Rect } from "../world/layout";

// 조각배(50번) 규칙 — 순수 함수라 테스트한다 (그림·네트워크는 world/BoatRide.ts).
//  - 배는 물(강·호수) 위로만 간다. 다리·나루터·잔교 판자와 징검다리는 피해 간다 (배가 그 밑으로 지나가지 않는다)
//  - 노 젓기: 방향키·조이스틱 방향으로 천천히 가속하고(관성), 강에서는 물살에 떠내려간다
//  - 내리기: 가까운 뭍(둑·나루터·잔교)에 설 자리가 있을 때만

/** 노 저을 때 최고 속도 (px/초). 걷기(56)보다 조금 느리다 */
export const ROW_SPEED = 46;
/** 가속(1/초): 목표 속도에 다가가는 빠르기 — 작을수록 미끄러지듯 */
export const ROW_ACCEL = 2.6;
/** 배 판정 여유: 물가에서 이만큼 안쪽까지만 (배 몸통이 뭍에 올라가지 않게) */
export const BOAT_SHORE_MARGIN = 6;
/** 판자·돌에서 떨어져야 하는 거리 */
const DECK_PAD_X = 18;
const DECK_PAD_Y = 6;
const STONE_PAD = 12;
/** 내릴 뭍을 찾는 반경 (배 가운데에서) */
export const SHORE_REACH = 34;
/** 2인승 뒷자리 손님이 같이 탈 수 있는 거리 (배가 나루터에 이만큼 가까울 때) */
export const DOCKED_DIST = 26;

function nearRect(r: Rect, x: number, y: number, px: number, py: number): boolean {
  return x >= r.x - px && x <= r.x + r.w + px && y >= r.y - py && y <= r.y + r.h + py;
}

/** 배(노 젓는 자리 = x,y)가 떠 있을 수 있는 곳 */
export function boatWater(x: number, y: number): boolean {
  if (!inWaterBody(x, y, -BOAT_SHORE_MARGIN)) return false;
  for (const d of DECKS) if (nearRect(d, x, y, DECK_PAD_X, DECK_PAD_Y)) return false;
  for (const s of STEP_STONES) if (Math.hypot(x - s.x, y - s.y) < STONE_PAD) return false;
  return true;
}

export type BoatMotion = { x: number; y: number; vx: number; vy: number };

/**
 * 한 프레임 노 젓기. ax, ay = 입력(-1..1, 조이스틱 아날로그 포함), current = 물살(px/초).
 * 축마다 따로 막아(벽 미끄러짐) 물 밖으로 나가지 않는다. m을 고쳐서 돌려준다
 */
export function stepBoat(m: BoatMotion, ax: number, ay: number, dtMs: number, current: { vx: number; vy: number }): BoatMotion {
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  const mag = Math.hypot(ax, ay);
  const k = mag > 1 ? 1 / mag : 1;
  const tvx = ax * k * ROW_SPEED;
  const tvy = ay * k * ROW_SPEED;
  const a = Math.min(1, ROW_ACCEL * dt);
  m.vx += (tvx - m.vx) * a;
  m.vy += (tvy - m.vy) * a;
  // 축마다: 노 + 물살로 가 보고, 막히면 노만으로(물살이 둑·판자 쪽으로 밀어도 반대로 저어 나올 수 있게).
  // 노 방향이 막힌 쪽이면 그 축 속도를 버린다 (둑에 부딪힘)
  m.x = moveAxis(m.x, m.vx, current.vx, dt, (x) => boatWater(x, m.y), (v) => (m.vx = v));
  m.y = moveAxis(m.y, m.vy, current.vy, dt, (y) => boatWater(m.x, y), (v) => (m.vy = v));
  return m;
}

function moveAxis(p: number, v: number, cur: number, dt: number, ok: (p: number) => boolean, setV: (v: number) => void): number {
  const d = (v + cur) * dt;
  if (d === 0) return p;
  if (ok(p + d)) return p + d;
  const own = v * dt;
  if (own !== 0 && ok(p + own)) return p + own;
  setV(0);
  return p;
}

/** 배에서 내릴 뭍 (가까운 순). standable = 설 수 있는 곳(충돌 밖). 없으면 null */
export function shorePoint(x: number, y: number, standable: (x: number, y: number) => boolean, reach = SHORE_REACH): { x: number; y: number } | null {
  for (let r = 8; r <= reach; r += 3) {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * r);
      const py = Math.round(y + Math.sin(a) * r * 0.8);
      if (inWater(px, py) || !standable(px, py)) continue;
      // 발 밑이 물 몸체 가장자리(뭍과 물 경계)여도 판자 위가 아니면 둑으로 본다
      const d = Math.hypot(px - x, py - y);
      if (d < bd) {
        bd = d;
        best = { x: px, y: py };
      }
    }
    if (best) return best;
  }
  return null;
}

/** 뒷자리(손님) 자리: 노 젓는 사람에서 뱃머리 반대쪽으로 */
export function backSeatOffset(left: boolean): number {
  return left ? BOAT_BACK_SEAT : -BOAT_BACK_SEAT;
}

/** 배 하나의 자리들 (앞자리 먼저) */
export function seatsOf(boatId: string): BoatSeat[] {
  return BOAT_SEATS.filter((s) => s.boatId === boatId);
}

export function boatOf(seatId: string): { boat: Boat; seat: BoatSeat } | null {
  const seat = BOAT_SEATS.find((s) => s.id === seatId);
  const boat = seat && BOATS.find((b) => b.id === seat.boatId);
  return seat && boat ? { boat, seat } : null;
}

export type BoatPresence = {
  /** 이 배가 나루터에 매여 있다 (다른 사람이 타고 나가 있지 않고, 돌아오는 중도 아니다) */
  docked: boolean;
  /** 앞자리(노 젓는 자리)를 차지한 사람 */
  rower: Sid | null;
  /** 노 젓는 사람이 있는 지금 배 자리 (rower가 있을 때) */
  at: { x: number; y: number } | null;
};

/**
 * 나루터에서 E: 탈 자리를 고른다. 같이 타기(2인승에 노 젓는 사람이 나루터에서 기다림)가 먼저, 그다음 가까운 빈 배.
 * occupied = 서버 좌석 점유표. 없으면 null
 */
export function pickBoatSeat(
  px: number,
  py: number,
  occupied: ReadonlyMap<string, Sid>,
  presence: (boatId: string) => BoatPresence,
): BoatSeat | null {
  let best: BoatSeat | null = null;
  let bd = Infinity;
  for (const b of BOATS) {
    const seats = seatsOf(b.id);
    const p = presence(b.id);
    if (p.rower !== null) {
      // 노 젓는 사람이 나루터 가까이에서 기다린다 → 뒷자리
      const back = seats[1];
      if (back && !occupied.has(back.id) && p.at && Math.hypot(p.at.x - b.x, p.at.y - b.y) <= DOCKED_DIST) return back;
      continue;
    }
    if (!p.docked || occupied.has(seats[0].id) || (seats[1] && occupied.has(seats[1].id))) continue;
    const d = Math.hypot(seats[0].x - px, seats[0].y - py);
    if (d < bd) {
      bd = d;
      best = seats[0];
    }
  }
  return best;
}
