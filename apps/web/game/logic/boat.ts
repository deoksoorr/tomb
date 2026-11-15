import { BOAT_BACK_SEAT, BOAT_SEATS, BOATS, boatKind, DUCK_DOCK_DECK, DUCK_POND, DUCK_SIDE_SEAT, STEP_STONES, type Boat, type BoatKind, type BoatSeat, type Sid } from "@tomb/protocol";
import { DECKS, inWater, inWaterBody, type Rect } from "../world/layout";

// 조각배(50번) 규칙 — 순수 함수라 테스트한다 (그림·네트워크는 world/BoatRide.ts).
//  - 배는 물(강·호수) 위로만 간다. 다리·나루터·잔교 판자와 징검다리는 피해 간다 (배가 그 밑으로 지나가지 않는다)
//  - 노 젓기: 방향키·조이스틱 방향으로 천천히 가속하고(관성), 강에서는 물살에 떠내려간다
//  - 내리기: 가까운 뭍(둑·나루터·잔교)에 설 자리가 있을 때만
//  - 11/15 오리배(kind "duck"): 오리 연못 안에서만, 물살 없음, 조금 느리고 더 미끄러지듯(가속·감속이 느리다).
//    자리는 나란히 (왼쪽 = 조종, 오른쪽 = DUCK_SIDE_SEAT). 두 오리배가 닿으면 살짝 튕겨 나간다 (duckBump, 각자 자기 배만)

/** 노 저을 때 최고 속도 (px/초). 걷기(56)보다 조금 느리다 */
export const ROW_SPEED = 46;
/** 가속(1/초): 목표 속도에 다가가는 빠르기 — 작을수록 미끄러지듯 */
export const ROW_ACCEL = 2.6;
/** 배 판정 여유: 물가에서 이만큼 안쪽까지만 (배 몸통이 뭍에 올라가지 않게) */
export const BOAT_SHORE_MARGIN = 6;
/** 오리배 페달 최고 속도 (px/초)·가속 (조각배보다 느리고 둥실둥실) */
export const DUCK_SPEED = 36;
export const DUCK_ACCEL = 1.3;
/** 오리배 몸통 반폭·위아래 여유 (두 자리 가운데 기준) — 연못 둑에 몸통이 올라가지 않게 */
export const DUCK_HULL_HALF = 18;
const DUCK_HULL_PAD_Y = 9;
/** 오리배끼리 닿는 타원 (두 배의 왼쪽 자리 사이 거리, 가로·세로 반지름) */
export const DUCK_BUMP_RX = 36;
export const DUCK_BUMP_RY = 18;
/** 닿았을 때 되튀는 정도 (0..1)와 최소로 밀려나는 속도 (px/초) */
const DUCK_BOUNCE = 0.55;
const DUCK_PUSH = 16;
/** 판자·돌에서 떨어져야 하는 거리 */
const DECK_PAD_X = 18;
const DECK_PAD_Y = 6;
const STONE_PAD = 12;
/** 내릴 뭍을 찾는 반경 (배 가운데에서) */
export const SHORE_REACH = 34;
/** 2인승 뒷자리 손님이 같이 탈 수 있는 거리 (배가 나루터에 이만큼 가까울 때) */
export const DOCKED_DIST = 26;
/** 물가에서 2인승의 빈자리에 같이 탈 수 있는 거리 (내 발 ↔ 배 앞·뒷자리 중 가까운 쪽, F13) */
export const JOIN_REACH = 30;

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

/** 오리배(왼쪽 자리 = x,y)가 떠 있을 수 있는 곳: 오리 연못 안쪽 + 선착장 판자에서 떨어져서 */
export function duckWater(x: number, y: number): boolean {
  const cx = x + DUCK_SIDE_SEAT / 2;
  const p = DUCK_POND;
  const dx = (cx - p.x) / (p.rx - DUCK_HULL_HALF);
  const dy = (y - p.y) / (p.ry - DUCK_HULL_PAD_Y);
  if (dx * dx + dy * dy > 1) return false;
  return !nearRect(DUCK_DOCK_DECK, cx, y, DUCK_HULL_HALF + 2, 8);
}

/** 이 종류의 배가 떠 있을 수 있는 곳 */
export function waterOf(kind: BoatKind): (x: number, y: number) => boolean {
  return kind === "duck" ? duckWater : boatWater;
}

export type BoatMotion = { x: number; y: number; vx: number; vy: number };

/**
 * 한 프레임 노 젓기. ax, ay = 입력(-1..1, 조이스틱 아날로그 포함), current = 물살(px/초).
 * 축마다 따로 막아(벽 미끄러짐) 물 밖으로 나가지 않는다. m을 고쳐서 돌려준다
 */
export function stepBoat(m: BoatMotion, ax: number, ay: number, dtMs: number, current: { vx: number; vy: number }, kind: BoatKind = "row"): BoatMotion {
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  const mag = Math.hypot(ax, ay);
  const k = mag > 1 ? 1 / mag : 1;
  const duck = kind === "duck";
  const speed = duck ? DUCK_SPEED : ROW_SPEED;
  const tvx = ax * k * speed;
  const tvy = ay * k * speed;
  const a = Math.min(1, (duck ? DUCK_ACCEL : ROW_ACCEL) * dt);
  m.vx += (tvx - m.vx) * a;
  m.vy += (tvy - m.vy) * a;
  // 축마다: 노 + 물살로 가 보고, 막히면 노만으로(물살이 둑·판자 쪽으로 밀어도 반대로 저어 나올 수 있게).
  // 노 방향이 막힌 쪽이면 그 축 속도를 버린다 (둑에 부딪힘). 오리 연못에는 물살이 없다
  const ok = waterOf(kind);
  const cur = duck ? { vx: 0, vy: 0 } : current;
  m.x = moveAxis(m.x, m.vx, cur.vx, dt, (x) => ok(x, m.y), (v) => (m.vx = v));
  m.y = moveAxis(m.y, m.vy, cur.vy, dt, (y) => ok(m.x, y), (v) => (m.vy = v));
  return m;
}

/**
 * 오리배 범퍼카: 내 배(m, 왼쪽 자리)가 다른 오리배(others, 왼쪽 자리들)와 닿았으면 살짝 튕겨 나가게 속도를 바꾼다.
 * 닿은 쪽으로 가던 속도는 DUCK_BOUNCE만큼 되튀고, 적어도 DUCK_PUSH로 떨어진다 (가만히 있다가 받혀도 밀려난다).
 * 각자 자기 배만 고치므로 서버 없이 두 화면에서 같은 규칙으로 갈라진다. 닿았으면 true
 */
export function duckBump(m: BoatMotion, others: readonly { x: number; y: number }[]): boolean {
  let hit = false;
  for (const o of others) {
    const ux = (m.x - o.x) / DUCK_BUMP_RX;
    const uy = (m.y - o.y) / DUCK_BUMP_RY;
    if (ux * ux + uy * uy >= 1) continue;
    // 타원 바깥쪽 방향 (같은 자리면 오른쪽으로)
    let nx = ux / DUCK_BUMP_RX;
    let ny = uy / DUCK_BUMP_RY;
    const len = Math.hypot(nx, ny);
    if (len < 1e-9) {
      nx = 1;
      ny = 0;
    } else {
      nx /= len;
      ny /= len;
    }
    let vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= (1 + DUCK_BOUNCE) * vn * nx;
      m.vy -= (1 + DUCK_BOUNCE) * vn * ny;
      vn = -DUCK_BOUNCE * vn;
    }
    if (vn < DUCK_PUSH) {
      m.vx += (DUCK_PUSH - vn) * nx;
      m.vy += (DUCK_PUSH - vn) * ny;
    }
    hit = true;
  }
  return hit;
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

/** 두 번째 자리 x 차이 (배 종류별): 조각배 = 뒷자리(뱃머리 반대쪽), 오리배 = 옆자리(늘 화면 오른쪽) */
export function seatOffset(boat: Boat, left: boolean): number {
  return boatKind(boat) === "duck" ? DUCK_SIDE_SEAT : backSeatOffset(left);
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
  /** 뱃머리가 왼쪽 (뒷자리 위치 계산용, 없으면 오른쪽) */
  left?: boolean;
};

/**
 * 물가에서 E (F13): 다른 사람이 노 젓고 있는 2인승의 빈 뒷자리가 가까우면 그 자리 (어디서든 — 나루터가 아니어도).
 * 2인승은 "먼저 탄 사람 = 앞자리 = 노 젓기" (노 젓던 사람이 내리면 남은 사람이 앞자리로 옮겨 앉는다)라서
 * 한 명만 탄 배의 빈자리는 늘 뒷자리다. 앞자리가 비고 뒷자리만 찬 순간(옮겨 앉는 중)에는 같이 타지 않는다
 */
export function joinSeat(px: number, py: number, occupied: ReadonlyMap<string, Sid>, presence: (boatId: string) => BoatPresence, reach = JOIN_REACH): BoatSeat | null {
  let best: BoatSeat | null = null;
  let bd = Infinity;
  for (const b of BOATS) {
    if (b.seats !== 2) continue;
    const seats = seatsOf(b.id);
    const back = seats[1];
    const p = presence(b.id);
    if (!back || p.rower === null || !p.at || occupied.has(back.id) || !occupied.has(seats[0].id)) continue;
    const bx = p.at.x + seatOffset(b, !!p.left);
    const d = Math.min(Math.hypot(p.at.x - px, p.at.y - py), Math.hypot(bx - px, p.at.y - py));
    if (d <= reach && d < bd) {
      bd = d;
      best = back;
    }
  }
  return best;
}

/**
 * 나루터에서 E: 탈 자리를 고른다. 같이 타기(2인승에 노 젓는 사람이 나루터에서 기다림)가 먼저, 그다음 가까운 빈 배.
 * occupied = 서버 좌석 점유표, kind = 이 선착장의 배 종류 (나루터 = 조각배, 오리배 선착장 = 오리배). 없으면 null
 */
export function pickBoatSeat(
  px: number,
  py: number,
  occupied: ReadonlyMap<string, Sid>,
  presence: (boatId: string) => BoatPresence,
  kind: BoatKind = "row",
): BoatSeat | null {
  let best: BoatSeat | null = null;
  let bd = Infinity;
  for (const b of BOATS) {
    if (boatKind(b) !== kind) continue;
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
