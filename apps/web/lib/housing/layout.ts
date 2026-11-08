import {
  DEFAULT_FLOOR,
  DEFAULT_WALL,
  furnitureById,
  isFloorSkin,
  isWallSkin,
  LIKE_WEIGHT,
  STYLE_TAGS,
  tierById,
  type FurnitureDef,
  type PlotTier,
  type PlotTierId,
} from "./catalog";
import type { HouseLayout, Placed } from "./types";

// 배치 규칙 (서버 검증과 편집 화면이 같은 함수를 쓴다).
//  - 물건은 묘역 안쪽 칸에만, 아래 가운데 문 2칸은 비워 둔다.
//  - 바닥층(러그·돌길·꽃밭)끼리, 서 있는 물건끼리는 겹칠 수 없다. 바닥층 위에는 서 있는 물건을 올릴 수 있다.
//  - 놓은 개수는 가진 개수를 넘을 수 없다 (바닥·담장 스킨도 1개를 쓴다).

export const emptyLayout = (): HouseLayout => ({ items: [], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL });

const UID_RE = /^[a-z0-9]{1,8}$/;

/** 돌린 상태의 차지 칸 */
export function footprint(def: Pick<FurnitureDef, "w" | "h" | "turn">, r: number): { w: number; h: number } {
  return def.turn && r % 2 === 1 ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

/** 문 칸 (아래 줄 가운데 2칸) */
export function gateTiles(tier: Pick<PlotTier, "w" | "h">): { x: number; y: number }[] {
  const x = tier.w / 2 - 1;
  return [
    { x, y: tier.h - 1 },
    { x: x + 1, y: tier.h - 1 },
  ];
}

export type LayoutError = { ok: false; code: string; message: string };
export type LayoutOk = { ok: true; counts: Record<string, number>; placedScore: number };

const fail = (code: string, message: string): LayoutError => ({ ok: false, code, message });

/** 칸 점유표: 층별로 칸 → 물건 u */
export class Occupancy {
  readonly floor = new Map<number, string>();
  readonly stand = new Map<number, string>();
  constructor(readonly tier: Pick<PlotTier, "w" | "h">) {}

  private key(x: number, y: number) {
    return y * 1000 + x;
  }

  /** 놓을 수 있으면 null, 아니면 이유 */
  check(def: FurnitureDef, x: number, y: number, r: number, ignoreU?: string): string | null {
    const { w, h } = footprint(def, r);
    const t = this.tier;
    if (x < 0 || y < 0 || x + w > t.w || y + h > t.h) return "묘역 밖으로 나갔어요.";
    const gate = gateTiles(t);
    const layer = def.floor ? this.floor : this.stand;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (gate.some((g) => g.x === x + i && g.y === y + j)) return "문 앞은 비워 두어야 해요.";
        const who = layer.get(this.key(x + i, y + j));
        if (who !== undefined && who !== ignoreU) return "다른 물건과 겹쳐요.";
      }
    return null;
  }

  add(p: Placed, def: FurnitureDef): void {
    const { w, h } = footprint(def, p.r);
    const layer = def.floor ? this.floor : this.stand;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) layer.set(this.key(p.x + i, p.y + j), p.u);
  }

  /** 그 칸의 서 있는 물건 (없으면 바닥층) u */
  at(x: number, y: number): string | undefined {
    return this.stand.get(this.key(x, y)) ?? this.floor.get(this.key(x, y));
  }
}

export function buildOccupancy(items: readonly Placed[], tier: Pick<PlotTier, "w" | "h">, skipU?: string): Occupancy {
  const occ = new Occupancy(tier);
  for (const p of items) {
    if (p.u === skipU) continue;
    const def = furnitureById(p.i);
    if (def && !def.skin) occ.add(p, def);
  }
  return occ;
}

/** 이 배치에서 쓰는 물건 수 (기본 스킨 제외) */
export function layoutCounts(layout: HouseLayout): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of layout.items) counts[p.i] = (counts[p.i] ?? 0) + 1;
  for (const s of [layout.floor, layout.wall]) if (s !== DEFAULT_FLOOR && s !== DEFAULT_WALL) counts[s] = (counts[s] ?? 0) + 1;
  return counts;
}

/** 놓은 물건 + 입힌 스킨의 꾸밈 점수 (좋아요 제외) */
export function placedScore(layout: HouseLayout): number {
  let s = 0;
  for (const [id, n] of Object.entries(layoutCounts(layout))) s += (furnitureById(id)?.score ?? 0) * n;
  return s;
}

export const totalScore = (placed: number, likes: number) => placed + likes * LIKE_WEIGHT;

/**
 * 서버 검증. tier 크기·문·겹침·개수 상한·가진 개수를 모두 본다.
 * owned를 null로 주면 가진 개수 확인을 건너뛴다 (저장소가 원자적으로 다시 확인한다).
 */
export function validateLayout(layout: HouseLayout, tierId: PlotTierId, owned: Record<string, number> | null): LayoutOk | LayoutError {
  const tier = tierById(tierId);
  if (!tier) return fail("BAD_TIER", "묘역 크기를 알 수 없어요.");
  if (!isFloorSkin(layout.floor)) return fail("BAD_SKIN", "알 수 없는 바닥이에요.");
  if (!isWallSkin(layout.wall)) return fail("BAD_SKIN", "알 수 없는 담장이에요.");
  if (layout.items.length > tier.maxItems)
    return fail("TOO_MANY", `${tier.name}에는 물건을 ${tier.maxItems}개까지 놓을 수 있어요.`);
  const occ = new Occupancy(tier);
  const seen = new Set<string>();
  for (const p of layout.items) {
    if (!UID_RE.test(p.u) || seen.has(p.u)) return fail("BAD_LAYOUT", "배치 정보가 올바르지 않아요.");
    seen.add(p.u);
    const def = furnitureById(p.i);
    if (!def || def.skin) return fail("BAD_ITEM", "알 수 없는 물건이 있어요.");
    if (![p.x, p.y, p.r].every(Number.isInteger) || p.r < 0 || p.r > 3) return fail("BAD_LAYOUT", "배치 정보가 올바르지 않아요.");
    const why = occ.check(def, p.x, p.y, p.r);
    if (why) return fail("BAD_PLACE", `${def.name}: ${why}`);
    occ.add(p, def);
  }
  const counts = layoutCounts(layout);
  if (owned) {
    for (const [id, n] of Object.entries(counts))
      if ((owned[id] ?? 0) < n) return fail("NOT_OWNED", `${furnitureById(id)?.name ?? id}을(를) 가진 것보다 많이 놓았어요.`);
  }
  return { ok: true, counts, placedScore: placedScore(layout) };
}

/** 가장 많이 놓은 갈래의 별칭 (물건 3개 미만이면 null) */
export function styleTag(layout: HouseLayout): string | null {
  if (layout.items.length < 3) return null;
  const by: Record<string, number> = {};
  for (const p of layout.items) {
    const c = furnitureById(p.i)?.category;
    if (c && c !== "skin") by[c] = (by[c] ?? 0) + 1;
  }
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  return top ? STYLE_TAGS[top[0] as keyof typeof STYLE_TAGS] : null;
}

/** 새 물건을 놓을 빈자리: (cx,cy) 가까운 칸부터 찾는다. 없으면 null */
export function findFreeSpot(
  items: readonly Placed[],
  tier: Pick<PlotTier, "w" | "h">,
  def: FurnitureDef,
  r: number,
  cx = Math.floor(tier.w / 2),
  cy = Math.floor(tier.h / 2),
): { x: number; y: number } | null {
  const occ = buildOccupancy(items, tier);
  const spots: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < tier.h; y++) for (let x = 0; x < tier.w; x++) spots.push({ x, y, d: Math.hypot(x - cx, y - cy) });
  spots.sort((a, b) => a.d - b.d);
  return spots.find((s) => occ.check(def, s.x, s.y, r) === null) ?? null;
}

/** 짧은 배치 id (편집 화면에서 새 물건을 놓을 때) */
export function newUid(items: readonly Placed[]): string {
  const used = new Set(items.map((p) => p.u));
  for (;;) {
    const u = Math.floor(Math.random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0");
    if (!used.has(u)) return u;
  }
}
