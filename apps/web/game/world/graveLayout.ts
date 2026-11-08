import {
  GRID_COLS,
  GRID_DY,
  GRID_Y0,
  REVIVE_SLOTS,
  flowerStack,
  graveSlot,
  graveTier,
  type GraveTier,
} from "@tomb/protocol";

// 묘비 배치 계산 (순수). 격자는 등록 순서(index) → graveSlot(index).
// 살려주세요 상위 10개는 "부활 대기석"(REVIVE_SLOTS)으로 올라가고, 원래 격자 자리는 빈 흙자리(↑)가 된다.

export type GraveInfo = { id: string; ageDays: number; flowers: number; revives: number };

export type GravePlacement = {
  index: number;
  id: string;
  x: number;
  y: number;
  /** 부활 대기석 순위 (0 = 1위). 격자면 -1 */
  rank: number;
  tier: GraveTier;
  /** 쌓이는 꽃 송이 (0..8) */
  flowers: number;
  revives: number;
  /** 같은 외형이 반복되지 않게 고르는 변형 번호 */
  variant: number;
};

export type GraveLayout = {
  /** graves와 같은 순서 */
  placements: GravePlacement[];
  /** 부활 대기석 순위별 (비어 있으면 null) */
  revive: (GravePlacement | null)[];
  /** 격자 index → 부활 대기석으로 올라가서 비어 있으면 true */
  promoted: Uint8Array;
  byId: Map<string, GravePlacement>;
  rows: number;
  count: number;
};

/** 외형별 크기 (받침 기준 위로 h, 히트 테스트·툴팁 위치용) */
export const TIER_SIZE: Record<GraveTier, { w: number; h: number; collider: number }> = {
  woodSign: { w: 10, h: 17, collider: 4 },
  smallStone: { w: 12, h: 16, collider: 10 },
  largeStone: { w: 14, h: 22, collider: 12 },
  pagoda: { w: 14, h: 28, collider: 12 },
};

export const VARIANTS = 3;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildLayout(graves: readonly GraveInfo[], reviveTop: readonly string[]): GraveLayout {
  // 목록에 없는 id(숨김·삭제)는 건너뛰고 순위를 당긴다
  const known = new Set(graves.map((g) => g.id));
  const rankOf = new Map<string, number>();
  reviveTop
    .filter((id) => known.has(id))
    .slice(0, REVIVE_SLOTS.length)
    .forEach((id, i) => rankOf.set(id, i));

  const placements: GravePlacement[] = [];
  const revive: (GravePlacement | null)[] = REVIVE_SLOTS.map(() => null);
  const promoted = new Uint8Array(graves.length);
  const byId = new Map<string, GravePlacement>();

  graves.forEach((g, index) => {
    const rank = rankOf.get(g.id) ?? -1;
    const pos = rank >= 0 ? REVIVE_SLOTS[rank] : graveSlot(index);
    const p: GravePlacement = {
      index,
      id: g.id,
      x: pos.x,
      y: pos.y,
      rank,
      tier: graveTier(g.ageDays),
      flowers: flowerStack(g.flowers),
      revives: g.revives,
      variant: hashId(g.id) % VARIANTS,
    };
    placements.push(p);
    byId.set(g.id, p);
    if (rank >= 0) {
      revive[rank] = p;
      promoted[index] = 1;
    }
  });

  return { placements, revive, promoted, byId, rows: Math.ceil(graves.length / GRID_COLS), count: graves.length };
}

/** 격자 묘비가 그려지는 세로 범위: 받침 위로 32px, 아래로 10px (꽃·흙) */
const ROW_TOP = 32;
const ROW_BOTTOM = 10;

/** 화면에 걸치는 격자 행 범위 [r0, r1] (없으면 r0 > r1) */
export function visibleRows(top: number, bottom: number, rows: number): [number, number] {
  const r0 = Math.max(0, Math.floor((top - GRID_Y0 - ROW_BOTTOM) / GRID_DY));
  const r1 = Math.min(rows - 1, Math.floor((bottom - GRID_Y0 + ROW_TOP) / GRID_DY));
  return [r0, r1];
}

/** 묘비 앞, 캐릭터가 서는 자리 */
export const FRONT_OFFSET = 16;
export function standSpot(p: Pick<GravePlacement, "x" | "y">): { x: number; y: number } {
  return { x: p.x, y: p.y + FRONT_OFFSET };
}

/** 근접 판정은 묘비 앞(받침 아래 6px) 기준 거리 */
const FRONT_PROBE = 6;

export type NearResult = { p: GravePlacement; dist: number };

function consider(p: GravePlacement | null | undefined, x: number, y: number, best: NearResult | null, radius: number) {
  if (!p) return best;
  const d = Math.hypot(p.x - x, p.y + FRONT_PROBE - y);
  if (d <= radius && (!best || d < best.dist)) return { p, dist: d };
  return best;
}

/** (x,y)에서 radius 안의 가장 가까운 묘비. 전체를 훑지 않고 근처 행만 본다 */
export function nearestGrave(layout: GraveLayout, x: number, y: number, radius: number): NearResult | null {
  let best: NearResult | null = null;
  for (const p of layout.revive) best = consider(p, x, y, best, radius);
  if (!layout.count) return best;
  const row = Math.round((y - GRID_Y0) / GRID_DY);
  for (let r = row - 1; r <= row + 1; r++) {
    if (r < 0 || r >= layout.rows) continue;
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      if (i >= layout.count || layout.promoted[i]) continue;
      best = consider(layout.placements[i], x, y, best, radius);
    }
  }
  return best;
}

function hit(p: GravePlacement | null | undefined, wx: number, wy: number): boolean {
  if (!p) return false;
  const s = TIER_SIZE[p.tier];
  const pad = 3;
  return wx >= p.x - s.w / 2 - pad && wx <= p.x + s.w / 2 + pad && wy >= p.y - s.h - pad && wy <= p.y + 6;
}

/** 탭/클릭 지점의 묘비 */
export function graveAt(layout: GraveLayout, wx: number, wy: number): GravePlacement | null {
  for (const p of layout.revive) if (hit(p, wx, wy)) return p;
  if (!layout.count) return null;
  const row = Math.round((wy - GRID_Y0) / GRID_DY);
  for (let r = row - 1; r <= row + 1; r++) {
    if (r < 0 || r >= layout.rows) continue;
    for (let c = 0; c < GRID_COLS; c++) {
      const i = r * GRID_COLS + c;
      if (i >= layout.count || layout.promoted[i]) continue;
      if (hit(layout.placements[i], wx, wy)) return layout.placements[i];
    }
  }
  return null;
}

/** 충돌 박스·격자 배치가 바뀌었는지 판단하는 서명 (꽃·살려주세요 수 변화는 제외) */
export function layoutSignature(graves: readonly GraveInfo[], reviveTop: readonly string[]): string {
  let s = `${graves.length}|${reviveTop.slice(0, REVIVE_SLOTS.length).join(",")}|`;
  for (const g of graves) s += `${g.id}:${graveTier(g.ageDays)},`;
  return s;
}
