import { graveTier, type GraveTier } from "@tomb/protocol";

// 묘비 모양 (순수). PublicGrave.style(@tomb/protocol GRAVE_STYLES) → 실제로 그릴 모양.
//  - auto(또는 없음·모르는 값): 명세의 생존 기간 규칙 (나무 팻말 → 작은 비석 → 큰 비석 → 석탑)
//  - 무료: wood/stone/tall/pagoda는 생존 기간 모양 중 하나를 고정, cross는 돌 십자가
//  - 유료: 디자인마다 고유한 모양 (조금씩 움직이는 연출이 붙는다)

export const PAID_SHAPES = ["coffee", "duck", "404", "monitor", "sakura", "server", "rocket", "angel", "crystal", "gold"] as const;
export type PaidShape = (typeof PAID_SHAPES)[number];
export type GraveShape = GraveTier | "cross" | PaidShape;

/** w: 히트 테스트 폭, h: 받침 위 높이(툴팁·표시 위치), collider: 충돌 폭, tex: 텍스처 폭 */
export const SHAPE_SIZE: Record<GraveShape, { w: number; h: number; collider: number; tex: number }> = {
  woodSign: { w: 10, h: 17, collider: 4, tex: 18 },
  smallStone: { w: 12, h: 16, collider: 10, tex: 18 },
  largeStone: { w: 14, h: 22, collider: 12, tex: 18 },
  pagoda: { w: 14, h: 28, collider: 12, tex: 18 },
  cross: { w: 14, h: 22, collider: 8, tex: 18 },
  coffee: { w: 16, h: 18, collider: 12, tex: 18 },
  duck: { w: 16, h: 15, collider: 12, tex: 18 },
  "404": { w: 14, h: 18, collider: 12, tex: 18 },
  monitor: { w: 16, h: 20, collider: 12, tex: 20 },
  sakura: { w: 16, h: 18, collider: 12, tex: 20 },
  server: { w: 14, h: 24, collider: 12, tex: 16 },
  rocket: { w: 14, h: 28, collider: 10, tex: 18 },
  angel: { w: 16, h: 26, collider: 12, tex: 20 },
  crystal: { w: 14, h: 24, collider: 12, tex: 18 },
  gold: { w: 14, h: 22, collider: 12, tex: 16 },
};

const FIXED: Record<string, GraveShape> = {
  wood: "woodSign",
  stone: "smallStone",
  tall: "largeStone",
  pagoda: "pagoda",
  cross: "cross",
};
const PAID = new Set<string>(PAID_SHAPES);

export function isPaidShape(s: GraveShape): s is PaidShape {
  return PAID.has(s);
}

export function graveShape(style: string | undefined | null, ageDays: number): GraveShape {
  if (style && FIXED[style]) return FIXED[style];
  if (style && PAID.has(style)) return style as PaidShape;
  return graveTier(ageDays);
}

/** 같은 모양이 줄지어 반복되지 않게 고르는 변형 수 (유료 디자인은 한 가지) */
export function shapeVariants(s: GraveShape): number {
  return isPaidShape(s) ? 1 : 3;
}
