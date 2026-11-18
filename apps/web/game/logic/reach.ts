// 11/18 E·탭 상호작용 닿는 거리: 보통은 중심점에서 반지름(r) 안, 바닥 영역(zone)이 있으면 그 상자 안(가장자리 ZONE_PAD 여유)
// 버스 정류장은 바닥 정차 칸(노란 칠·BUS) 상자 전체가 타는 곳이에요 (game/bus/busBays) — 마을·캠핑장·바닷가 장면이 같이 써요

export type ReachZone = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
export type Reachable = { readonly x: number; readonly y: number; readonly r: number; readonly zone?: ReachZone };

/** 바닥 영역 가장자리 여유 (px) — 칸 테두리를 살짝 밟아도 돼요 */
export const ZONE_PAD = 6;

/** 점에서 상자까지 거리 (안이면 0, 테두리 포함) */
export function boxDist(b: ReachZone, x: number, y: number): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return dx === 0 && dy === 0 ? 0 : Math.hypot(dx, dy);
}

/** 가까운 것 고를 때 쓰는 거리: 바닥 영역이 있으면 그 상자까지, 없으면 중심까지 */
export function reachDist(o: Reachable, px: number, py: number): number {
  return o.zone ? boxDist(o.zone, px, py) : Math.hypot(o.x - px, o.y - py);
}

/** 닿는지: 바닥 영역이면 상자 안(ZONE_PAD 여유), 아니면 반지름 × k 안 (탭은 k 1.5) */
export function inReach(o: Reachable, px: number, py: number, k = 1): boolean {
  return o.zone ? boxDist(o.zone, px, py) <= ZONE_PAD : Math.hypot(o.x - px, o.y - py) <= o.r * k;
}
