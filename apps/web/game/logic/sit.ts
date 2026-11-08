import { SEAT_SEARCH_RADIUS, SEATS, seatsNear, type Seat, type Sid } from "@tomb/protocol";

// 앉기 규칙 (명세 5-3): 반경 24px 안에 "비어 있는" 좌석이 있으면 가장 가까운 좌석, 없으면 바닥 앉기.

/** 비어 있는(또는 이미 내가 점유한) 가장 가까운 좌석. 없으면 null → 바닥 앉기 */
export function pickSeat(
  x: number,
  y: number,
  occupied: ReadonlyMap<string, Sid>,
  mySid: Sid | null,
  radius: number = SEAT_SEARCH_RADIUS,
): Seat | null {
  for (const s of seatsNear(x, y, radius)) {
    const owner = occupied.get(s.id);
    if (owner === undefined || (mySid !== null && owner === mySid)) return s;
  }
  return null;
}

/** 의자에서 일어날 때 내려설 자리. 가구 충돌 박스 바깥(아래)으로 살짝 내려선다 */
export const STAND_OFFSET_Y = 9;
export function standPoint(seat: Pick<Seat, "x" | "y">): { x: number; y: number } {
  return { x: seat.x, y: seat.y + STAND_OFFSET_Y };
}

export type InteractTarget = { kind: "grave"; graveId: string } | { kind: "seat"; seat: Seat } | { kind: "none" };

/** E/Space: 가까운 묘비와 빈 좌석 중 더 가까운 쪽 */
export function pickInteract(
  grave: { id: string; dist: number } | null,
  seat: Seat | null,
  px: number,
  py: number,
): InteractTarget {
  const seatDist = seat ? Math.hypot(seat.x - px, seat.y - py) : Infinity;
  if (grave && grave.dist <= seatDist) return { kind: "grave", graveId: grave.id };
  if (seat) return { kind: "seat", seat };
  return { kind: "none" };
}

/**
 * 긴 벤치에 앉은 채 ←/→: 같은 벤치의 바로 옆 좌석 (dx=-1 왼쪽, 1 오른쪽).
 * 끝자리이거나 옆자리에 다른 사람이 앉아 있으면 null (그대로 앉아 있는다). 의자(1인석)도 null.
 */
export function neighborSeat(seat: Pick<Seat, "id" | "furnitureId" | "x">, dx: -1 | 1, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null): Seat | null {
  let best: Seat | null = null;
  for (const s of SEATS) {
    if (s.furnitureId !== seat.furnitureId || s.id === seat.id) continue;
    const d = (s.x - seat.x) * dx;
    if (d <= 0) continue;
    if (!best || d < (best.x - seat.x) * dx) best = s;
  }
  if (!best) return null;
  const owner = occupied.get(best.id);
  return owner === undefined || (mySid !== null && owner === mySid) ? best : null;
}

/** 앉은 채 좌우 입력 → -1/0/1 (가로가 세로보다 확실히 클 때만) */
export function sideIntent(ax: number, ay: number): -1 | 0 | 1 {
  if (Math.abs(ax) < 0.5 || Math.abs(ax) <= Math.abs(ay) * 1.2) return 0;
  return ax < 0 ? -1 : 1;
}
