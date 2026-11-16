import type { ScopeSpot } from "@tomb/protocol";

// 11/16 캠핑장·바닷가 망원경의 충돌·E 범위 (순수 — 캠핑장 배치(campLayout)와 장면 모듈(StarScopes)이 같이 쓴다)

/** 받침 충돌 (발 상자가 못 들어가게, 마을 망원경 받침과 같은 크기) */
export function scopeBaseRect(s: ScopeSpot): { x: number; y: number; w: number; h: number } {
  return { x: s.x - 5, y: s.y - 5, w: 10, h: 5 };
}
/** E가 닿는 거리 (앞자리에서, 마을 망원경과 같다) */
export const SCOPE_E_RADIUS = 14;
