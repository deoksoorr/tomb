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

/** 화면에 걸치는 격자 행 범위 [r0, r1] (없으면 r0 > r1). out을 주면 거기에 채운다 */
export function visibleRows(top: number, bottom: number, rows: number, out: [number, number] = [0, 0]): [number, number] {
  out[0] = Math.max(0, Math.floor((top - GRID_Y0 - ROW_BOTTOM) / GRID_DY));
  out[1] = Math.min(rows - 1, Math.floor((bottom - GRID_Y0 + ROW_TOP) / GRID_DY));
  return out;
}

/** 묘비 앞, 캐릭터가 서는 자리 */
export const FRONT_OFFSET = 16;
export function standSpot(p: Pick<GravePlacement, "x" | "y">): { x: number; y: number } {
  return { x: p.x, y: p.y + FRONT_OFFSET };
}

/** 근접 판정은 묘비 앞(받침 아래 6px) 기준 거리 */
const FRONT_PROBE = 6;

export type NearResult = { p: GravePlacement; dist: number };

// nearestGrave의 작업 변수 (매 프레임 호출이라 클로저·객체를 만들지 않는다)
let probeBest: GravePlacement | null = null;
let probeD = Infinity;
function probe(p: GravePlacement | null | undefined, x: number, y: number, radius: number): void {
  if (!p) return;
  const d = Math.hypot(p.x - x, p.y + FRONT_PROBE - y);
  if (d <= radius && d < probeD) {
    probeBest = p;
    probeD = d;
  }
}

/**
 * (x,y)에서 radius 안의 가장 가까운 묘비. 전체를 훑지 않고 근처 행만 본다.
 * 결과는 out에 채워 돌려준다 (없으면 null).
 */
export function nearestGrave(
  layout: GraveLayout,
  x: number,
  y: number,
  radius: number,
  out: NearResult = { p: null as unknown as GravePlacement, dist: 0 },
): NearResult | null {
  probeBest = null;
  probeD = Infinity;
  for (let i = 0; i < layout.revive.length; i++) probe(layout.revive[i], x, y, radius);
  if (layout.count) {
    const row = Math.round((y - GRID_Y0) / GRID_DY);
    for (let r = row - 1; r <= row + 1; r++) {
      if (r < 0 || r >= layout.rows) continue;
      for (let c = 0; c < GRID_COLS; c++) {
        const i = r * GRID_COLS + c;
        if (i >= layout.count || layout.promoted[i]) continue;
        probe(layout.placements[i], x, y, radius);
      }
    }
  }
  const best = probeBest as GravePlacement | null;
  probeBest = null;
  if (!best) return null;
  out.p = best;
  out.dist = probeD;
  return out;
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
