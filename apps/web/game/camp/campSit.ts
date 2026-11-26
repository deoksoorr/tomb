import { CAMP_FOOTBATH, CAMP_FURNITURE, CAMP_LOTS, CAMP_SEATS, campSeatById, SEAT_SEARCH_RADIUS, type Seat, type Sid } from "@tomb/protocol";
import { campLadders, campSeatZones, type CampLadder, type CampSeatZone } from "./campHousingPlan";

// 11/15 캠핑장 좌석 고르기 (마을 logic/sit.ts와 같은 규칙, 좌석 목록만 캠핑장 것)

/** 옆자리로 옮겨 앉을 수 있는 긴 벤치 */
export const CAMP_MULTI_SEAT: ReadonlySet<string> = new Set(CAMP_FURNITURE.filter((f) => f.seatOffsets.length > 1).map((f) => f.id));

/**
 * (x,y)에서 가까운 빈 좌석 (내가 앉은 자리는 빈 것으로 본다).
 * open = 11/26 지금 열린 자리인지 (집 앞마당 qH… 자리는 그 단계 소품이 놓였을 때만 — game/camp/campHousing seatOpen)
 */
export function campPickSeat(x: number, y: number, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null, radius: number = SEAT_SEARCH_RADIUS, open?: (id: string) => boolean): Seat | null {
  let best: Seat | null = null;
  let bd = Infinity;
  for (const s of CAMP_SEATS) {
    if (open && !open(s.id)) continue;
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

/**
 * 11/26 족욕탕 자리(qT1~10)는 데크 위(앞 계단 포함)에 있을 때만 고른다.
 * 데크는 앞 계단으로만 오르는데, 울타리 밖에서 앉았다 일어나면 데크 위로 넘어 들어갔다 (campLayout footbathColliders와 같은 테두리)
 */
export function campFootSeatReachable(id: string, x: number, y: number): boolean {
  if (!/^qT\d/.test(id)) return true;
  const x0 = CAMP_FOOTBATH.x - CAMP_FOOTBATH.w / 2;
  const y0 = CAMP_FOOTBATH.y - CAMP_FOOTBATH.h;
  const onDeck = x >= x0 && x <= x0 + CAMP_FOOTBATH.w && y >= y0 + 20 && y <= y0 + 110;
  const onSteps = x >= x0 + 28 && x <= x0 + 52 && y > y0 + 110 && y <= y0 + 124;
  return onDeck || onSteps;
}

/**
 * 11/26 원두막(싸리울집 3단계)은 앞 사다리로만 오른다 (운영자): 사다리 밑(x ±7, y −4~+8)에서만 마루 방석을 고르고,
 * 다른 쪽에서 다가가면 원두막 자리는 아예 안 고른다 (CampScene seatOpen이 걸러 낸다). 일어서면 사다리 밑 (자리 stand)
 */
export const CAMP_LADDERS: readonly CampLadder[] = campLadders(CAMP_LOTS);
/** (x,y)가 원두막 사다리 밑이면 그 사다리 */
export function campLadderAt(x: number, y: number): CampLadder | null {
  return CAMP_LADDERS.find((l) => Math.abs(x - l.x) <= 7 && y >= l.y - 4 && y <= l.y + 8) ?? null;
}

/**
 * 11/26 높은·큰 자리는 정해진 쪽에서만 (운영자 「원두막을 뒤에서 접근했더니 바로 걸터앉아」·「평상을 뒤에서 들어갔더니 바로 위로 올라가져」):
 * 원두막 = 앞 사다리 밑 · 평상 = 앞 긴 쪽 + 길 쪽 짧은 쪽 · 정자 = 앞 계단 쪽 (campHousingPlan campSeatZones).
 * 그 자리(rects) 안에 서 있으면 그 가구 방석을 먼저 고르고 (반경 없이 가까운 빈 방석), 밖에서는 그 방석을 아예 안 고른다
 */
export const CAMP_SEAT_ZONES: readonly CampSeatZone[] = campSeatZones(CAMP_LOTS);
const ZONE_OF: ReadonlyMap<string, CampSeatZone> = new Map(CAMP_SEAT_ZONES.flatMap((z) => z.seats.map((id) => [id, z] as const)));
/** 정해진 쪽에서만 앉는 자리인지 (원두막·평상·정자 방석) */
export const isCampZoneSeat = (id: string): boolean => ZONE_OF.has(id);
/** @deprecated 원두막 방석만 — isCampZoneSeat */
export const isCampLadderSeat = (id: string): boolean => ZONE_OF.get(id)?.kind === "ladder";
const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
/** (x,y)가 오르는 자리 안이면 그 가구들 (여럿이면 모두 — 열린 방석이 있는 것을 고른다) */
export function campZonesAt(x: number, y: number): CampSeatZone[] {
  return CAMP_SEAT_ZONES.filter((z) => z.rects.some((r) => inRect(r, x, y)));
}
/** 오르는 자리 안에서 고를 빈 방석 (그 가구 방석 중 서 있는 자리에서 가까운 순). open = 지금 열린 자리 (그 단계 집) */
export function campZoneSeat(x: number, y: number, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null, open?: (id: string) => boolean): Seat | null {
  let best: Seat | null = null;
  let bd = Infinity;
  for (const z of campZonesAt(x, y))
    for (const id of z.seats) {
      const s = campSeatById(id);
      if (!s || (open && !open(id))) continue;
      const owner = occupied.get(id);
      if (owner !== undefined && (mySid === null || owner !== mySid)) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) {
        best = s;
        bd = d;
      }
    }
  return best;
}
/** 사다리 밑에서 E로 오를 빈 방석 (원두막만 — 위로 걷기만 해서는 오르지 않는다) */
export function campLadderSeat(x: number, y: number, occupied: ReadonlyMap<string, Sid>, mySid: Sid | null, open?: (id: string) => boolean): Seat | null {
  if (!campLadderAt(x, y)) return null;
  const s = campZoneSeat(x, y, occupied, mySid, open);
  return s && isCampLadderSeat(s.id) ? s : null;
}
