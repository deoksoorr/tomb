import { CAMP_FURNITURE, CAMP_SEATS, SEAT_SEARCH_RADIUS, type Seat, type Sid } from "@tomb/protocol";

// 11/15 캠핑장 좌석 고르기 (마을 logic/sit.ts와 같은 규칙, 좌석 목록만 캠핑장 것)

/** 옆자리로 옮겨 앉을 수 있는 긴 벤치 */
export const CAMP_MULTI_SEAT: ReadonlySet<string> = new Set(CAMP_FURNITURE.filter((f) => f.seatOffsets.length > 1).map((f) => f.id));

/** (x,y)에서 가까운 빈 좌석 (내가 앉은 자리는 빈 것으로 본다) */
export function campPickSeat(x: number, y: number, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null, radius: number = SEAT_SEARCH_RADIUS): Seat | null {
  let best: Seat | null = null;
  let bd = Infinity;
  for (const s of CAMP_SEATS) {
    // 캠핑카 문간 자리는 캠핑카 E 하나로만 (좌석 안내가 따로 뜨면 같은 캠핑카에 E가 둘이 된다)
    if (s.furnitureId.startsWith("qV")) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d > radius || d >= bd) continue;
    const owner = occupied.get(s.id);
    if (owner !== undefined && (mySid === null || owner !== mySid)) continue;
    best = s;
    bd = d;
  }
  return best;
}

/** 긴 벤치의 옆자리 (비어 있으면) */
export function campNeighborSeat(seat: Pick<Seat, "id" | "furnitureId" | "x">, dx: -1 | 1, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null): Seat | null {
  let best: Seat | null = null;
  for (const s of CAMP_SEATS) {
    if (s.furnitureId !== seat.furnitureId || s.id === seat.id) continue;
    const d = (s.x - seat.x) * dx;
    if (d <= 0) continue;
    if (!best || d < (best.x - seat.x) * dx) best = s;
  }
  if (!best) return null;
  const owner = occupied.get(best.id);
  return owner === undefined || (mySid !== null && owner === mySid) ? best : null;
}
