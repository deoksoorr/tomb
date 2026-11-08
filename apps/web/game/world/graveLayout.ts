import {
  GRID_COLS,
  GRID_DY,
  GRID_Y0,
  REVIVE_SLOTS,
  flowerStack,
  graveSlot,
} from "@tomb/protocol";
import { graveShape, SHAPE_SIZE, shapeVariants, type GraveShape } from "../graveShape";

// 묘비 배치 계산 (순수). 격자는 등록 순서(index) → graveSlot(index).
// 살려주세요 상위 10개는 "다시 피어날 자리"(REVIVE_SLOTS)에 같은 묘비의 복제본을 따로 세운다.
// 진짜 묘비는 격자 원래 자리에 그대로 둔다 (같은 디자인·꽃·꾸미기·내 묘비 빛). 두 곳 모두 같은 묘비(id)를 연다.

export type GraveInfo = {
  id: string;
  ageDays: number;
  /** 묘비 디자인 (GRAVE_STYLES id, 없으면 auto) */
  style?: string;
  flowers: number;
  revives: number;
  /** 묘비 꾸미기 (until이 지나면 그리지 않는다) */
  decor?: readonly { itemId: string; until: number }[];
};

/** 그릴 수 있는 묘비 꾸미기 */
export const DECOR_IDS = [
  "decor_candles",
  "decor_wreath",
  "decor_ribbon",
  "decor_lantern",
  "decor_ghostcat",
  "decor_stars",
  "decor_rainbow",
  "decor_butterfly",
  "decor_snowman",
  "decor_flowerpot",
] as const;
const DECOR_SET = new Set<string>(DECOR_IDS);
export const MAX_DECOR = 3;

/** 아직 유효한 꾸미기 id (중복 제거, 최대 3개)와 가장 이른 만료 시각 */
export function activeDecor(decor: GraveInfo["decor"], now: number): { ids: string[]; expiresAt: number } {
  const ids: string[] = [];
  let expiresAt = Infinity;
  for (const d of decor ?? []) {
    if (!d || !DECOR_SET.has(d.itemId) || !(d.until > now) || ids.includes(d.itemId)) continue;
    ids.push(d.itemId);
    expiresAt = Math.min(expiresAt, d.until);
    if (ids.length >= MAX_DECOR) break;
  }
  return { ids, expiresAt };
}

export type GravePlacement = {
  index: number;
  id: string;
  x: number;
  y: number;
  /** 부활 대기석 순위 (0 = 1위). 격자면 -1 */
  rank: number;
  /** 다시 피어날 자리에 세운 복제본이면 true (진짜는 격자 자리) */
  copy: boolean;
  /** 그릴 모양 (디자인 또는 생존 기간 규칙) */
  shape: GraveShape;
  /** 쌓이는 꽃 송이 (0..8) */
  flowers: number;
  revives: number;
  /** 같은 외형이 반복되지 않게 고르는 변형 번호 */
  variant: number;
  /** 지금 보이는 묘비 꾸미기 */
  decor: string[];
};

export type GraveLayout = {
  /** graves와 같은 순서 */
  placements: GravePlacement[];
  /** 다시 피어날 자리 순위별 복제본 (비어 있으면 null) */
  revive: (GravePlacement | null)[];
  /** 격자 index → 다시 피어날 자리에 복제본이 있으면 순위, 없으면 -1 */
  reviveRank: Int8Array;
  /** id → 격자 자리의 진짜 묘비 */
  byId: Map<string, GravePlacement>;
  rows: number;
  count: number;
  /** 가장 먼저 만료되는 꾸미기 시각 (그때 다시 배치해서 지운다) */
  decorExpiresAt: number;
};

/** 모양별 크기 (받침 기준 위로 h, 히트 테스트·툴팁 위치용) */
export const TIER_SIZE = SHAPE_SIZE;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function buildLayout(graves: readonly GraveInfo[], reviveTop: readonly string[], now: number = Date.now()): GraveLayout {
  // 목록에 없는 id(숨김·삭제)는 건너뛰고 순위를 당긴다
  const known = new Set(graves.map((g) => g.id));
  const rankOf = new Map<string, number>();
  reviveTop
    .filter((id) => known.has(id))
    .slice(0, REVIVE_SLOTS.length)
    .forEach((id, i) => rankOf.set(id, i));

  const placements: GravePlacement[] = [];
  const revive: (GravePlacement | null)[] = REVIVE_SLOTS.map(() => null);
  const reviveRank = new Int8Array(graves.length).fill(-1);
  const byId = new Map<string, GravePlacement>();
  let decorExpiresAt = Infinity;

  graves.forEach((g, index) => {
    const decor = activeDecor(g.decor, now);
    decorExpiresAt = Math.min(decorExpiresAt, decor.expiresAt);
    const rank = rankOf.get(g.id) ?? -1;
    const pos = graveSlot(index);
    const shape = graveShape(g.style, g.ageDays);
    const p: GravePlacement = {
      index,
      id: g.id,
      x: pos.x,
      y: pos.y,
      rank: -1,
      copy: false,
      shape,
      flowers: flowerStack(g.flowers),
      revives: g.revives,
      variant: hashId(g.id) % shapeVariants(shape),
      decor: decor.ids,
    };
    placements.push(p);
    byId.set(g.id, p);
    if (rank >= 0) {
      // 명당 복제본: 같은 모양·꽃·꾸미기, 자리만 다르다
      revive[rank] = { ...p, x: REVIVE_SLOTS[rank].x, y: REVIVE_SLOTS[rank].y, rank, copy: true };
      reviveRank[index] = rank;
    }
  });

  return { placements, revive, reviveRank, byId, rows: Math.ceil(graves.length / GRID_COLS), count: graves.length, decorExpiresAt };
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

/** 묘비 앞, 캐릭터가 서는 자리 (아바타 머리가 비석을 가리지 않을 만큼 떨어져 선다) */
export const FRONT_OFFSET = 22;
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
        if (i >= layout.count) continue;
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
  const s = TIER_SIZE[p.shape];
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
      if (i >= layout.count) continue;
      if (hit(layout.placements[i], wx, wy)) return layout.placements[i];
    }
  }
  return null;
}

/** 충돌 박스·격자 배치가 바뀌었는지 판단하는 서명 (꽃·살려주세요 수 변화는 제외) */
export function layoutSignature(graves: readonly GraveInfo[], reviveTop: readonly string[]): string {
  let s = `${graves.length}|${reviveTop.slice(0, REVIVE_SLOTS.length).join(",")}|`;
  for (const g of graves) s += `${g.id}:${graveShape(g.style, g.ageDays)},`;
  return s;
}
