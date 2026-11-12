import {
  AVATAR_COLORS,
  COSMETIC_DURATION_MS,
  isAvatarBody,
  isAvatarColor,
  isShopListed,
  itemById,
  ITEMS,
  type AvatarDye,
  type CosmeticSlot,
  type ItemDef,
} from "@tomb/protocol";
import { avatarColorSpec } from "@/game/sprites/avatar";
import { remainingLabel } from "./items";

// 캐릭터 꾸미기 "착용 부위" 순수 함수 (상점 부위 필터, 가방 장비창)

/** 몸 위에서 아래로 (가방 목록·상점 필터 순서) */
export const SLOT_ORDER: readonly CosmeticSlot[] = ["head", "neck", "back", "hand", "aura", "feet", "pet"];

export const SLOT_NAMES: Record<CosmeticSlot, string> = {
  head: "머리",
  neck: "목",
  hand: "손",
  back: "등",
  aura: "오라",
  feet: "발",
  pet: "펫",
};

/** 빈 칸에 흐리게 깔아 두는 그림 (그 부위 대표 아이템) */
export const SLOT_SILHOUETTE: Record<CosmeticSlot, string> = {
  head: "hat_straw",
  neck: "neck_scarf",
  hand: "hand_lantern",
  back: "back_wings",
  aura: "aura_firefly",
  feet: "feet_flowers",
  pet: "pet_ghost",
};

export type SlotFilter = CosmeticSlot | "all";

type Timed = { itemId: string; until: number };
type Wardrobe = { inventory: Readonly<Record<string, number>>; equipped: readonly Timed[]; stash?: readonly Timed[] };

/** worn: 착용 중 · stash: 벗어 둠(시간은 흐른다) · new: 가방의 새것(입는 순간 24시간 시작) */
export type WearState = "worn" | "stash" | "new";
export type WardrobeEntry = { item: ItemDef; slot: CosmeticSlot; state: WearState; until: number | null };

const STATE_ORDER: Record<WearState, number> = { worn: 0, stash: 1, new: 2 };

function cosmetic(id: string): (ItemDef & { slot: CosmeticSlot }) | null {
  const item = itemById(id);
  return item?.kind === "cosmetic" && item.slot ? (item as ItemDef & { slot: CosmeticSlot }) : null;
}

/** 가진 꾸미기 전부: 착용 중 → 벗어 둔 것 → 새것, 부위 순서대로. 만료된 것은 뺀다 */
export function wardrobeEntries(w: Wardrobe, now: number): WardrobeEntry[] {
  const out: WardrobeEntry[] = [];
  const seenWorn = new Set<CosmeticSlot>();
  for (const e of w.equipped) {
    const item = cosmetic(e.itemId);
    if (!item || e.until <= now || seenWorn.has(item.slot)) continue;
    seenWorn.add(item.slot);
    out.push({ item, slot: item.slot, state: "worn", until: e.until });
  }
  for (const e of w.stash ?? []) {
    const item = cosmetic(e.itemId);
    if (item && e.until > now) out.push({ item, slot: item.slot, state: "stash", until: e.until });
  }
  for (const [id, n] of Object.entries(w.inventory)) {
    const item = cosmetic(id);
    if (item && n > 0) out.push({ item, slot: item.slot, state: "new", until: null });
  }
  return out.sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || STATE_ORDER[a.state] - STATE_ORDER[b.state],
  );
}

/** 부위마다 지금 입은 것 */
export function wornBySlot(entries: readonly WardrobeEntry[]): Partial<Record<CosmeticSlot, WardrobeEntry>> {
  const out: Partial<Record<CosmeticSlot, WardrobeEntry>> = {};
  for (const e of entries) if (e.state === "worn") out[e.slot] = e;
  return out;
}

/** 부위별 개수 (+ 전체) */
export function slotCounts(items: readonly { slot?: CosmeticSlot }[]): Record<SlotFilter, number> {
  const out = Object.fromEntries([["all", 0], ...SLOT_ORDER.map((s) => [s, 0])]) as Record<SlotFilter, number>;
  for (const i of items) {
    if (!i.slot) continue;
    out.all += 1;
    out[i.slot] += 1;
  }
  return out;
}

export const matchesSlot = (slot: CosmeticSlot | undefined, filter: SlotFilter) => filter === "all" || slot === filter;

/** 상점 캐릭터 꾸미기 목록 (부위 필터). 펫은 상점에서 팔지 않는다 (동물원 사육사에게서 영구로만) */
export const SHOP_COSMETICS = ITEMS.filter((i) => i.kind === "cosmetic" && i.slot && isShopListed(i));
export function shopCosmetics(filter: SlotFilter): ItemDef[] {
  return SHOP_COSMETICS.filter((i) => matchesSlot(i.slot, filter));
}

/** 이 칸에서 누르면 하는 일: 새것은 spendItem(24시간 시작), 벗어 둔 것은 wear, 입은 것은 unequip */
export type WearAction = { kind: "spend" | "wear" | "unequip"; label: string };
export function wearAction(e: Pick<WardrobeEntry, "state"> & { slot?: CosmeticSlot }): WearAction {
  // 펫은 한 마리만 데리고 다닌다: 벗기 = 집에 두기, 입기 = 데리고 다니기
  const pet = e.slot === "pet";
  if (e.state === "worn") return { kind: "unequip", label: pet ? "집에 두기" : "벗기" };
  return { kind: e.state === "new" ? "spend" : "wear", label: pet ? "데리고 다니기" : "입기" };
}

/** 목록 한 줄 상태: "착용 중 · 18시간 남음" · "벗어 둠 · 5시간 남음" · "새것 · 입으면 24시간" */
export function entryStatus(e: Pick<WardrobeEntry, "state" | "until"> & { slot?: CosmeticSlot }, now: number): string {
  if (e.state === "new") return `새것 · 입으면 ${Math.round(COSMETIC_DURATION_MS / 3_600_000)}시간`;
  const left = remainingLabel(e.until ?? now, now);
  if (e.slot === "pet") return `${e.state === "worn" ? "데리고 다니는 중" : "집에서 쉬는 중"} · ${left}`;
  return `${e.state === "worn" ? "착용 중" : "벗어 둠"} · ${left}`;
}

/** 남은 시간 막대 (0~1) */
export function timeLeftRatio(until: number, now: number, total = COSMETIC_DURATION_MS): number {
  return Math.min(1, Math.max(0, (until - now) / total));
}

/** 끌어다 놓기: 그 부위 아이템만 받는다 */
export function canDropOn(itemId: string, slot: CosmeticSlot): boolean {
  return cosmetic(itemId)?.slot === slot;
}

/** 이 아이템을 입으면 그 부위에서 벗겨지는 것 (없으면 null) */
export function displaced(entries: readonly WardrobeEntry[], e: WardrobeEntry): ItemDef | null {
  if (e.state === "worn") return null;
  return wornBySlot(entries)[e.slot]?.item ?? null;
}

/**
 * 내 아바타 색·몸: 게임 속 값 → 계정 → 이 기기에 남은 색 → 기본값.
 * color는 46번 염색까지 담은 색 표기(avatarColorSpec)다. 몸은 25번 외형 바꾸기가 계정에 남으므로 계정 값이 먼저
 */
export function resolveAvatar(
  avatar: { color?: string | null; body?: string | null } | undefined,
  me: { color: string | null; body: string | null; dye?: AvatarDye } | null,
  savedColor: string | null,
): { color: string; body: string } {
  const base = [avatar?.color, me?.color, savedColor].find((c): c is string => isAvatarColor(c)) ?? AVATAR_COLORS[0];
  const body = [me?.body, avatar?.body].find((b): b is string => isAvatarBody(b)) ?? "hood";
  return { color: avatarColorSpec(base, me?.dye), body };
}
