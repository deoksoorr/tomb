import { BOAT_BACK_SEAT, BOAT_SEATS, BOATS, boatKind, DIR, DUCK_DOCK_DECK, DUCK_POND, DUCK_SIDE_SEAT, STEP_STONES, type Boat, type BoatKind, type BoatSeat, type DirId, type Sid } from "@tomb/protocol";
import { BOAT_BACK_SEAT_Y } from "../sprites/rideProps";
import { DECKS, inWater, inWaterBody, type Rect } from "../world/layout";

// 조각배(50번) 규칙 — 순수 함수라 테스트한다 (그림·네트워크는 world/BoatRide.ts).
//  - 배는 물(강·호수) 위로만 간다. 다리·나루터·잔교 판자와 징검다리는 피해 간다 (배가 그 밑으로 지나가지 않는다)
//  - 노 젓기: 방향키·조이스틱 방향으로 천천히 가속하고(관성), 강에서는 물살에 떠내려간다
//  - 내리기: 가까운 뭍(둑·나루터·잔교)에 설 자리가 있을 때만
//  - 11/15 오리배(kind "duck"): 오리 연못 안에서만, 물살 없음, 조금 느리고 더 미끄러지듯(가속·감속이 느리다).
//    자리는 나란히 (왼쪽 = 조종, 오른쪽 = DUCK_SIDE_SEAT). 두 오리배가 닿으면 살짝 튕겨 나간다 (duckBump, 각자 자기 배만)
//  - 11/16 오리배는 연못 어느 둑에서든 내린다 (duckShoreRing): 둑 가까이면 E로 바로, 한가운데서 E면 가장 가까운 둑으로 저절로 저어 가서 내린다
//  - 11/16 배를 앞·뒤·옆 네 방향으로 그린다 (boatFacing): 노 젓는 속도의 큰 축을 따르되, 대각선에서 깜빡이지 않게 축을 바꿀 때는 넉넉히 기다린다.
//    방향은 노 젓는 사람의 아바타 방향(dir, 원래 4방향 u8로 오간다)에 실려 다른 사람 화면에도 그대로 간다 — 프로토콜은 그대로

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
export const DUCK_HULL_PAD_Y = 9;
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

/**
 * 두 번째 자리가 노 젓는 자리(오리배는 왼쪽 자리)에서 떨어진 만큼 (배 종류·뱃머리 방향별).
 * 조각배 = 뒷자리(뱃머리 반대쪽 — 옆모습은 가로, 앞·뒷모습은 세로), 오리배 = 옆자리(어느 방향이든 화면 오른쪽으로 나란히)
 */
export function seatDelta(boat: Boat, dir: DirId): { dx: number; dy: number } {
  if (boatKind(boat) === "duck") return { dx: DUCK_SIDE_SEAT, dy: 0 };
  if (dir === DIR.left) return { dx: BOAT_BACK_SEAT, dy: 0 };
  if (dir === DIR.right) return { dx: -BOAT_BACK_SEAT, dy: 0 };
  return { dx: 0, dy: dir === DIR.down ? -BOAT_BACK_SEAT_Y : BOAT_BACK_SEAT_Y };
}

/** 배가 보는 방향을 바꾸는 최소 속도 (px/초) — 멈춰 가는 배는 마지막 방향 그대로 */
export const FACING_MIN_SPEED = 4;
/** 옆 ↔ 앞뒤로 축을 바꾸려면 새 축 속도가 지금 축 속도의 이만큼은 넘어야 한다 (대각선에서 그림이 깜빡이지 않게) */
export const FACING_SWITCH = 1.4;

/**
 * 배가 볼 방향 (4방향). prev = 지금 방향, vx·vy = 노 젓는 속도 (물살 제외).
 * 큰 축을 따르되 지금 축을 유지하는 쪽에 무게를 둔다: 다른 축이 FACING_SWITCH배를 넘어야 바꾸고,
 * 같은 축 안에서 반대로 가면(왼↔오른, 위↔아래) 바로 돌아선다. 느리면(FACING_MIN_SPEED 미만) 그대로
 */
export function boatFacing(prev: DirId, vx: number, vy: number): DirId {
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const side: DirId = vx < 0 ? DIR.left : DIR.right;
  const fore: DirId = vy < 0 ? DIR.up : DIR.down;
  const vertical = prev === DIR.up || prev === DIR.down;
  if (vertical) {
    if (ax >= FACING_MIN_SPEED && ax > ay * FACING_SWITCH) return side;
    return ay >= FACING_MIN_SPEED ? fore : prev;
  }
  if (ay >= FACING_MIN_SPEED && ay > ax * FACING_SWITCH) return fore;
  return ax >= FACING_MIN_SPEED ? side : prev;
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
  /** 뱃머리 방향 (뒷자리 위치 계산용, 없으면 오른쪽) */
  dir?: DirId;
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
    const o = seatDelta(b, p.dir ?? DIR.right);
    const d = Math.min(Math.hypot(p.at.x - px, p.at.y - py), Math.hypot(p.at.x + o.dx - px, p.at.y + o.dy - py));
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

// ── 11/16 오리배: 아무 둑에서나 내리기 ──

/** 오리배에서 바로 내릴 수 있는 거리 (내 발 ↔ 내려설 둑). 몸통이 넓어(반폭 DUCK_HULL_HALF) 조각배(SHORE_REACH)보다 넉넉히 */
export const DUCK_SHORE_REACH = 44;
/** 연못 둘레 내려설 후보 각도 수 */
export const DUCK_RING_N = 96;
/** 둑 위 내려설 자리를 찾는 거리 (연못 가장자리 바깥으로, 가까운 순) */
const DUCK_LAND_OFF: readonly number[] = [5, 8, 11, 14, 18, 22, 26];

/** 둑 한 곳: land = 내려설 뭍(발 위치), boat = 거기 대려고 오리배(왼쪽 자리)가 갈 물 위 자리 */
export type DuckLanding = { land: { x: number; y: number }; boat: { x: number; y: number } };

/**
 * 오리 연못 둘레의 내려설 자리 (각도마다 하나). ok = 내려서도 되는 뭍 (부르는 쪽이 충돌·물·걷기 격자를 본다).
 * 둑이 막힌 각도(나무·울타리·마당 테두리)와 배를 바짝 댈 수 없는 각도(선착장 판자 옆)는 빠진다. 맵이 고정이라 한 번 만들어 둔다
 */
export function duckShoreRing(ok: (x: number, y: number) => boolean, n = DUCK_RING_N): DuckLanding[] {
  const p = DUCK_POND;
  const out: DuckLanding[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let land: { x: number; y: number } | null = null;
    for (const off of DUCK_LAND_OFF) {
      const x = Math.round(p.x + (p.rx + off) * c);
      const y = Math.round(p.y + (p.ry + off) * s);
      if (ok(x, y)) {
        land = { x, y };
        break;
      }
    }
    if (!land) continue;
    // 배: 같은 각도로 몸통이 둑에 닿지 않는 가장 바깥 물 위 (판자 옆이면 안쪽으로 당긴다)
    let boat: { x: number; y: number } | null = null;
    for (let t = 1; t >= 0.3; t -= 0.02) {
      const x = Math.round(p.x + (p.rx - DUCK_HULL_HALF) * c * t - DUCK_SIDE_SEAT / 2);
      const y = Math.round(p.y + (p.ry - DUCK_HULL_PAD_Y) * s * t);
      if (duckWater(x, y)) {
        boat = { x, y };
        break;
      }
    }
    if (!boat || Math.hypot(land.x - boat.x, land.y - boat.y) > DUCK_SHORE_REACH) continue;
    out.push({ land, boat });
  }
  return out;
}

/** 지금 자리(내 발 x,y)에서 바로 내릴 둑: reach 안에서 가장 가까운 내려설 자리. 없으면 null */
export function duckLandNear(x: number, y: number, ring: readonly DuckLanding[], reach = DUCK_SHORE_REACH): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = reach;
  for (const r of ring) {
    const d = Math.hypot(r.land.x - x, r.land.y - y);
    if (d <= bd) {
      bd = d;
      best = r.land;
    }
  }
  return best;
}

/** 연못 한가운데에서 E: 배(왼쪽 자리 x,y)에서 가장 가까이 댈 수 있는 둑. 없으면 null */
export function nearestDuckLanding(x: number, y: number, ring: readonly DuckLanding[]): DuckLanding | null {
  let best: DuckLanding | null = null;
  let bd = Infinity;
  for (const r of ring) {
    const d = Math.hypot(r.boat.x - x, r.boat.y - y);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

/** 저절로 저어 가기: (x,y)에서 (tx,ty)로 향하는 입력 (−1..1). 다 와 가면 살살 (DUCK_SPEED × 세기) */
export function steerToward(x: number, y: number, tx: number, ty: number): { ax: number; ay: number } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return { ax: 0, ay: 0 };
  const k = Math.max(0.35, Math.min(1, d / 28));
  return { ax: (dx / d) * k, ay: (dy / d) * k };
}
