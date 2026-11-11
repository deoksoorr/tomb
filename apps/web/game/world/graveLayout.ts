import { GRID_COLS, GRID_DY, GRID_ROWS, GRID_Y0, flowerStack, graveSlot, graveVisible } from "@tomb/protocol";
import { graveShape, SHAPE_SIZE, shapeVariants, type GraveShape } from "../graveShape";

// 묘비 배치 계산 (순수). 작은 묘역 격자에 등록 순서(index) → graveSlot(index).
// 묘역에는 GRAVEYARD_CAPACITY(32)기까지 놓인다. 목록이 그보다 길면(성불이 따라잡기 전) 가장 최근 32기만 보이고,
// 자리는 index % 32를 돌려 쓴다 (새 묘비가 가장 오래된 묘비의 자리에 선다 — 그 묘비가 곧 성불할 차례다).
// "다시 피어날 자리"(살려주세요 상위 복제본)는 49번에서 없어졌다. revive/reviveRank는 호환용으로 늘 비어 있다.

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
  /** @deprecated 부활 대기석 순위 (없어짐, 늘 -1) */
  rank: number;
  /** @deprecated 다시 피어날 자리 복제본 (없어짐, 늘 false) */
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
  /** 묘역에 보이는 묘비 (graves 순서, 가장 최근 GRAVEYARD_CAPACITY기) */
  placements: GravePlacement[];
  /** @deprecated 다시 피어날 자리 (없어짐, 늘 빈 배열) */
  revive: (GravePlacement | null)[];
  /** @deprecated (없어짐, 늘 빈 배열) */
  reviveRank: Int8Array;
  /** id → 묘역의 묘비 (보이는 것만) */
  byId: Map<string, GravePlacement>;
  /** 묘비가 놓인 줄 수 (0..GRID_ROWS) */
  rows: number;
  /** 보이는 묘비 수 (placements.length) */
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

export function buildLayout(graves: readonly GraveInfo[], reviveTop: readonly string[] = [], now: number = Date.now()): GraveLayout {
  void reviveTop; // 다시 피어날 자리는 없어졌다 (호출부 호환용 인자)
  const placements: GravePlacement[] = [];
  const byId = new Map<string, GravePlacement>();
  let decorExpiresAt = Infinity;
  const count = graves.length;
  graves.forEach((g, index) => {
    if (!graveVisible(index, count)) return;
    const decor = activeDecor(g.decor, now);
    decorExpiresAt = Math.min(decorExpiresAt, decor.expiresAt);
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
  });
  return {
    placements,
    revive: [],
    reviveRank: new Int8Array(0),
    byId,
    rows: Math.min(GRID_ROWS, Math.ceil(placements.length / GRID_COLS)),
    count: placements.length,
    decorExpiresAt,
  };
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

/** (x,y)에서 radius 안의 가장 가까운 묘비 (묘역은 최대 32기라 전부 본다). 결과는 out에 채워 돌려준다 (없으면 null) */
export function nearestGrave(
  layout: GraveLayout,
  x: number,
  y: number,
  radius: number,
  out: NearResult = { p: null as unknown as GravePlacement, dist: 0 },
): NearResult | null {
  probeBest = null;
  probeD = Infinity;
  const list = layout.placements;
  for (let i = 0; i < list.length; i++) probe(list[i], x, y, radius);
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
  for (const p of layout.placements) if (hit(p, wx, wy)) return p;
  return null;
}

/** 충돌 박스·격자 배치가 바뀌었는지 판단하는 서명 (꽃 수 변화는 제외) */
export function layoutSignature(graves: readonly GraveInfo[], reviveTop: readonly string[] = []): string {
  void reviveTop;
  let s = `${graves.length}|`;
  graves.forEach((g, i) => {
    if (graveVisible(i, graves.length)) s += `${g.id}:${graveShape(g.style, g.ageDays)},`;
  });
  return s;
}
