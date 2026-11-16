import { SEA_EDGE_PICK_RADIUS, SEA_EDGE_SEATS, SEA_FURNITURE, SEA_SEATS, SEAT_SEARCH_RADIUS, type Seat, type Sid } from "@tomb/protocol";

// 11/16 바닷가 좌석 고르기 (캠핑장 campSit과 같은 규칙, 좌석 목록만 바닷가 것). 쉴거리 자리가 늘면 SEA_FURNITURE에만 더해요

/** 옆자리로 옮겨 앉을 수 있는 긴 벤치 */
export const SEA_MULTI_SEAT: ReadonlySet<string> = new Set(SEA_FURNITURE.filter((f) => f.seatOffsets.length > 1).map((f) => f.id));

/** (x,y)에서 가까운 빈 좌석 (내가 앉은 자리는 빈 것으로 봐요) */
export function seaPickSeat(x: number, y: number, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null, radius: number = SEAT_SEARCH_RADIUS): Seat | null {
  let best: Seat | null = null;
  let bd = Infinity;
  for (const s of SEA_SEATS) {
    // 11/16 r18 끝 걸터앉기는 데크 안 일어서는 자리에서 재고, 조금 더 멀리서도 (데크 어디서든 가까운 빈 방석)
    const edge = s.furnitureId !== null && SEA_EDGE_SEATS.includes(s.furnitureId);
    const d = edge ? Math.hypot(s.x - x, s.y + (s.standDy ?? 0) - y) : Math.hypot(s.x - x, s.y - y);
    if (d > (edge ? Math.max(radius, SEA_EDGE_PICK_RADIUS) : radius) || d >= bd) continue;
    const owner = occupied.get(s.id);
    if (owner !== undefined && (mySid === null || owner !== mySid)) continue;
    best = s;
    bd = d;
  }
  return best;
}

/** 긴 벤치의 옆자리 (비어 있으면) */
export function seaNeighborSeat(seat: Pick<Seat, "id" | "furnitureId" | "x">, dx: -1 | 1, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null): Seat | null {
  let best: Seat | null = null;
  for (const s of SEA_SEATS) {
    if (s.furnitureId !== seat.furnitureId || s.id === seat.id) continue;
    const d = (s.x - seat.x) * dx;
    if (d <= 0) continue;
    if (!best || d < (best.x - seat.x) * dx) best = s;
  }
  if (!best) return null;
  const owner = occupied.get(best.id);
  return owner === undefined || (mySid !== null && owner === mySid) ? best : null;
}
