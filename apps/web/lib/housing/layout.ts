import {
  defaultExterior,
  EXT_SLOTS,
  isExtBase,
  type HouseExteriorMap,
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
import { partitionViolation, roomPlan, type RoomPlan } from "./rooms";
import type { HouseLayout, Placed } from "./types";

// 배치 규칙 (서버 검증과 편집 화면이 같은 함수를 쓴다).
//  - 물건은 집 안쪽 칸에만, 아래 가운데 문 2칸은 비워 둔다.
//  - 바닥층(러그·돌길·꽃밭)끼리, 서 있는 물건끼리는 겹칠 수 없다. 바닥층 위에는 서 있는 물건을 올릴 수 있다.
//  - 놓은 개수는 가진 개수를 넘을 수 없다 (바닥·담장 스킨도 1개를 쓴다).
//  - 3번: 넓은 터·대저택은 칸막이 벽으로 방이 나뉜다(rooms.ts). 물건은 벽을 가로지를 수 없고 방 사이 문 앞은 비워 둔다.

/** 터 크기 (id가 있으면 방 구조도 본다) */
export type TierShape = Pick<PlotTier, "w" | "h"> & { id?: PlotTierId };

export const emptyLayout = (): HouseLayout => ({ items: [], floor: DEFAULT_FLOOR, wall: DEFAULT_WALL });

const UID_RE = /^[a-z0-9]{1,8}$/;

/** 4방향 가구(spin)의 방향 값 시작: 배치 r 4~7 = 방향 0~3. 그보다 작은 r은 예전 값(앞모습, 홀수면 좌우 뒤집기) */
export const SPIN_R0 = 4;
/** 배치 r의 가장 큰 값 */
export const MAX_R = SPIN_R0 + 3;

/** 4방향 가구의 방향: 0 앞(아래를 봄) · 1 왼쪽을 봄 · 2 뒤(위를 봄) · 3 오른쪽을 봄. 예전 값(r 0~3)은 0 */
export const spinDir = (r: number): number => (r >= SPIN_R0 ? (r - SPIN_R0) % 4 : 0);

/** 돌린 상태의 차지 칸 (turn은 r 홀수, spin은 옆을 볼 때 가로·세로가 바뀐다) */
export function footprint(def: Pick<FurnitureDef, "w" | "h" | "turn" | "spin">, r: number): { w: number; h: number } {
  const swap = def.turn ? r % 2 === 1 : def.spin ? spinDir(r) % 2 === 1 : false;
  return swap ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
}

/** 한 번 돌린 다음 r: turn은 90°씩, spin은 다음 방향(예전 값이면 앞에서 시작), 나머지는 좌우 뒤집기 */
export function nextRotation(def: Pick<FurnitureDef, "turn" | "spin">, r: number): number {
  if (def.spin) return SPIN_R0 + ((spinDir(r) + 1) % 4);
  return (r + 1) % 4;
}

/** R(돌리기 단추)이 하는 일: 네 방향으로 돌리기(turn·spin 가구) 또는 좌우 뒤집기(나머지). 화면 단추·안내 글이 같이 쓴다 */
export const rotateMode = (def: Pick<FurnitureDef, "turn" | "spin">): "turn" | "flip" => (def.turn || def.spin ? "turn" : "flip");
/** 단추·안내 이름 */
export const ROTATE_LABEL = { turn: "↻ 돌리기", flip: "⇆ 뒤집기" } as const;

/** 이 물건에 쓸 수 있는 r인지 (4~7은 4방향 가구만) */
export const validRotation = (def: Pick<FurnitureDef, "spin">, r: number): boolean =>
  Number.isInteger(r) && r >= 0 && r <= (def.spin ? MAX_R : 3);

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
  private readonly plan: RoomPlan | null;
  constructor(readonly tier: TierShape) {
    this.plan = tier.id ? roomPlan({ id: tier.id, w: tier.w, h: tier.h }) : null;
  }

  private key(x: number, y: number) {
    return y * 1000 + x;
  }

  /** 놓을 수 있으면 null, 아니면 이유 */
  check(def: FurnitureDef, x: number, y: number, r: number, ignoreU?: string): string | null {
    const { w, h } = footprint(def, r);
    const t = this.tier;
    if (x < 0 || y < 0 || x + w > t.w || y + h > t.h) return "집 밖으로 나갔어요.";
    const gate = gateTiles(t);
    const layer = def.floor ? this.floor : this.stand;
    const wall = this.plan && partitionViolation(this.plan, x, y, w, h, !def.floor);
    if (wall) return wall;
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

export function buildOccupancy(items: readonly Placed[], tier: TierShape, skipU?: string): Occupancy {
  const occ = new Occupancy(tier);
  for (const p of items) {
    if (p.u === skipU) continue;
    const def = furnitureById(p.i);
    if (def && !def.skin && !def.ext) occ.add(p, def);
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
  if (!tier) return fail("BAD_TIER", "터 크기를 알 수 없어요.");
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
    if (!def || def.skin || def.ext) return fail("BAD_ITEM", "알 수 없는 물건이 있어요.");
    if (![p.x, p.y].every(Number.isInteger) || !validRotation(def, p.r)) return fail("BAD_LAYOUT", "배치 정보가 올바르지 않아요.");
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
    if (c && c !== "skin" && c !== "exterior") by[c] = (by[c] ?? 0) + 1;
  }
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  return top ? STYLE_TAGS[top[0] as keyof typeof STYLE_TAGS] : null;
}

/** 새 물건을 놓을 빈자리: (cx,cy) 가까운 칸부터 찾는다. 없으면 null */
export function findFreeSpot(
  items: readonly Placed[],
  tier: TierShape,
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

// ── 외관 ──

/** 저장된 외관을 읽을 때: 모르는 자리·값은 기본으로 */
export function normalizeExterior(raw: unknown): HouseExteriorMap {
  const out = defaultExterior();
  if (!raw || typeof raw !== "object") return out;
  for (const { slot } of EXT_SLOTS) {
    const v = (raw as Record<string, unknown>)[slot];
    if (typeof v === "string" && (isExtBase(v) || furnitureById(v)?.ext === slot)) out[slot] = v;
  }
  return out;
}

export function exteriorCounts(ext: HouseExteriorMap): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { slot } of EXT_SLOTS) if (!isExtBase(ext[slot])) counts[ext[slot]] = (counts[ext[slot]] ?? 0) + 1;
  return counts;
}

export const exteriorScore = (ext: HouseExteriorMap) =>
  Object.keys(exteriorCounts(ext)).reduce((s, id) => s + (furnitureById(id)?.score ?? 0), 0);

/** 안(배치·스킨) + 밖(외관)에서 쓰는 물건 수 */
export function designCounts(layout: HouseLayout, ext: HouseExteriorMap): Record<string, number> {
  const c = layoutCounts(layout);
  for (const [id, n] of Object.entries(exteriorCounts(ext))) c[id] = (c[id] ?? 0) + n;
  return c;
}

/** 꾸밈 점수의 물건 몫 = 안 + 밖 */
export const designScore = (layout: HouseLayout, ext: HouseExteriorMap) => placedScore(layout) + exteriorScore(ext);

export function validateExterior(ext: Record<string, unknown>, owned: Record<string, number> | null): { ok: true; exterior: HouseExteriorMap } | LayoutError {
  const out = defaultExterior();
  for (const { slot, label } of EXT_SLOTS) {
    const v = ext[slot];
    if (v === undefined) continue;
    if (typeof v !== "string" || !(isExtBase(v) ? EXT_SLOTS.find((s) => s.slot === slot)!.base === v : furnitureById(v)?.ext === slot))
      return fail("BAD_EXTERIOR", `${label}에 쓸 수 없는 아이템이에요.`);
    if (!isExtBase(v) && owned && (owned[v] ?? 0) < 1) return fail("NOT_OWNED", `${furnitureById(v)!.name}을(를) 먼저 사 주세요.`);
    out[slot] = v;
  }
  return { ok: true, exterior: out };
}
