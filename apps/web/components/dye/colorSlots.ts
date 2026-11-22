import { DYE_COLOR_SLOT_PRICES, DYE_COLOR_SLOTS_MAX, type DyeTarget } from "@tomb/protocol";

// 11/22 아이템 색 보관함 칸 계산 (아이템 페이지 · 가방 목록의 작은 칸 · 염색 창의 칸 고르기가 같이 쓴다).
// 「원래 색」은 늘 있고 칸 수에 들지 않는다. 커스텀 칸은 처음 1칸이 공짜로 열려 있고(아직 안 칠했으면 빈 칸), 2·3번째는 포인트로 차례로 연다.

export type ItemDyes = Record<string, { colors: (string | null)[]; sel: number }>;

/** 커스텀 칸 하나: painted = 칠함 · empty = 열었는데 비었음 · locked = 아직 안 열었음 (price = 그 칸을 여는 값) */
export type ColorSlot =
  | { k: number; state: "painted"; color: string; worn: boolean }
  | { k: number; state: "empty" }
  | { k: number; state: "locked"; price: number; next: boolean };

/** 연 칸의 색들 (처음 염색 전에도 커스텀 1칸은 열려 있다) */
export function openColors(itemDyes: ItemDyes | undefined, item: string): (string | null)[] {
  const c = itemDyes?.[item]?.colors;
  return c?.length ? c : [null];
}

/** 지금 입는 칸 (-1 = 원래 색) */
export function wornSlot(itemDyes: ItemDyes | undefined, item: string): number {
  const st = itemDyes?.[item];
  return st && st.sel >= 0 && st.colors[st.sel] ? st.sel : -1;
}

/** 커스텀 칸 3개의 상태 (화면 순서) */
export function colorSlots(itemDyes: ItemDyes | undefined, item: string): ColorSlot[] {
  const colors = openColors(itemDyes, item);
  const sel = wornSlot(itemDyes, item);
  return Array.from({ length: DYE_COLOR_SLOTS_MAX }, (_, k): ColorSlot => {
    if (k >= colors.length) return { k, state: "locked", price: DYE_COLOR_SLOT_PRICES[k], next: k === colors.length };
    const c = colors[k];
    return c ? { k, state: "painted", color: c, worn: sel === k } : { k, state: "empty" };
  });
}

/** 다음에 열 칸 (다 열었으면 null) */
export function nextLockedSlot(itemDyes: ItemDyes | undefined, item: string): { k: number; price: number } | null {
  const n = openColors(itemDyes, item).length;
  return n < DYE_COLOR_SLOTS_MAX ? { k: n, price: DYE_COLOR_SLOT_PRICES[n] } : null;
}

/** 덮어쓰기 대신 칠할 수 있는 다른 빈 칸 (k 말고, 연 칸 중 첫 빈 칸 — 없으면 null) */
export function otherEmptySlot(itemDyes: ItemDyes | undefined, item: string, k: number): number | null {
  const i = openColors(itemDyes, item).findIndex((c, j) => j !== k && !c);
  return i >= 0 ? i : null;
}

/** 아이템 색 보관함에서 처음 골라 둘 칸: 지금 입는 칸 · 첫 빈 칸 · 0 (서버 assertDyeable과 같은 규칙) */
export function defaultDyeSlot(itemDyes: ItemDyes | undefined, item: DyeTarget): number {
  const st = itemDyes?.[item];
  if (!st) return 0;
  if (st.sel >= 0) return st.sel;
  const empty = st.colors.findIndex((c) => !c);
  return empty >= 0 ? empty : 0;
}

/** 아이템 페이지에서 처음 고를 칸: 입는 커스텀 칸 · 첫 빈 칸 · 원래 색(-1) — 처음 염색하는 사람은 바로 빈 칸이 골라져 [이 칸 칠하기]를 누를 수 있다 */
export function firstPick(itemDyes: ItemDyes | undefined, item: string): number {
  const worn = wornSlot(itemDyes, item);
  if (worn >= 0) return worn;
  const empty = openColors(itemDyes, item).findIndex((c) => !c);
  return empty >= 0 ? empty : -1;
}

/** 「내 다른 색」: 그 아이템에 칠해 둔 색 중 지금 칠할 칸(k)이 아닌 것 (바탕 hex, 겹치지 않게) */
export function otherPaintedColors(itemDyes: ItemDyes | undefined, item: string, k: number): string[] {
  const out: string[] = [];
  openColors(itemDyes, item).forEach((c, j) => {
    if (!c || j === k) return;
    const hex = c.slice(0, 7);
    if (!out.includes(hex)) out.push(hex);
  });
  return out;
}

/** 11/22 색 보관함 미리보기: 고른 칸(pick)이 보여 줄 색 — 칠한 칸은 그 색, 원래 색(-1)은 null, 빈 칸·잠긴 칸은 지금 입은 색 그대로 */
export function previewColor(itemDyes: ItemDyes | undefined, item: string, pick: number): string | null {
  if (pick < 0) return null;
  const c = openColors(itemDyes, item)[pick];
  if (c) return c;
  const worn = wornSlot(itemDyes, item);
  return worn >= 0 ? (itemDyes?.[item]?.colors[worn] ?? null) : null;
}

/** [이 색 입기]를 보일지: 미리보기 칸이 입을 수 있는 칸(원래 색 · 칠한 칸)이고 지금 입은 칸과 다를 때만 */
export function canWearPick(itemDyes: ItemDyes | undefined, item: string, pick: number): boolean {
  if (pick === wornSlot(itemDyes, item)) return false;
  return pick < 0 || !!openColors(itemDyes, item)[pick];
}

/** 칠하기 전에 덮어쓰기를 물을지: 그 칸(k)에 이미 칠한 색이 있을 때만 (빈 칸은 묻지 않는다) */
export function needsOverwrite(colors: readonly (string | null)[], k: number): boolean {
  return !!colors[k];
}
