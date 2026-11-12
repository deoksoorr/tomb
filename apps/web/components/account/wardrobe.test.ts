import { describe, expect, it } from "vitest";
import { AVATAR_COLORS, COSMETIC_DURATION_MS } from "@tomb/protocol";
import {
  canDropOn,
  displaced,
  entryStatus,
  resolveAvatar,
  shopCosmetics,
  SHOP_COSMETICS,
  SLOT_ORDER,
  slotCounts,
  timeLeftRatio,
  wardrobeEntries,
  wearAction,
  wornBySlot,
} from "./wardrobe";

const HOUR = 3_600_000;
const now = 1_000_000;

const me = {
  inventory: { hat_cat: 1, fw_small: 3, pet_ghost: 1, decor_candles: 2 },
  equipped: [
    { itemId: "hat_straw", until: now + 18 * HOUR },
    { itemId: "neck_scarf", until: now - 1 },
    { itemId: "pet_ghost", until: now + HOUR },
  ],
  stash: [
    { itemId: "hat_halo", until: now + 5 * HOUR },
    { itemId: "aura_fog", until: now - 5 },
  ],
};

describe("wardrobeEntries", () => {
  it("꾸미기만, 만료 제외, 부위 순서 → 착용·벗어 둠·새것 순", () => {
    const list = wardrobeEntries(me, now).map((e) => [e.item.id, e.state]);
    expect(list).toEqual([
      ["hat_straw", "worn"],
      ["hat_halo", "stash"],
      ["hat_cat", "new"],
      ["pet_ghost", "worn"],
      ["pet_ghost", "new"],
    ]);
  });

  it("stash가 없는 옛 응답도 받는다", () => {
    expect(wardrobeEntries({ inventory: { hat_cat: 1 }, equipped: [] }, now)).toHaveLength(1);
  });

  it("부위마다 입은 것과 바뀌는 것", () => {
    const list = wardrobeEntries(me, now);
    const worn = wornBySlot(list);
    expect(worn.head?.item.id).toBe("hat_straw");
    expect(worn.neck).toBeUndefined();
    const cat = list.find((e) => e.item.id === "hat_cat")!;
    expect(displaced(list, cat)?.id).toBe("hat_straw");
    expect(displaced(list, list[0])).toBeNull();
  });
});

describe("wearAction · entryStatus", () => {
  it("새것은 spend, 벗어 둔 것은 wear, 입은 것은 벗기", () => {
    expect(wearAction({ state: "new" })).toEqual({ kind: "spend", label: "입기" });
    expect(wearAction({ state: "stash" })).toEqual({ kind: "wear", label: "입기" });
    expect(wearAction({ state: "worn" })).toEqual({ kind: "unequip", label: "벗기" });
  });

  it("상태 문구", () => {
    expect(entryStatus({ state: "new", until: null }, now)).toBe("새것 · 입으면 24시간");
    expect(entryStatus({ state: "worn", until: now + 18 * HOUR + 5 }, now)).toBe("착용 중 · 18시간 남음");
    expect(entryStatus({ state: "stash", until: now + 30 * 60_000 }, now)).toBe("벗어 둠 · 30분 남음");
  });

  it("남은 시간 막대", () => {
    expect(timeLeftRatio(now + COSMETIC_DURATION_MS / 4, now)).toBe(0.25);
    expect(timeLeftRatio(now - 1, now)).toBe(0);
    expect(timeLeftRatio(now + 2 * COSMETIC_DURATION_MS, now)).toBe(1);
  });
});

describe("부위", () => {
  it("상점 부위별 개수와 필터", () => {
    const counts = slotCounts(SHOP_COSMETICS);
    expect(counts.all).toBe(SHOP_COSMETICS.length);
    expect(counts.head).toBe(13); // 기본 4 + F8 추가 9
    expect(SLOT_ORDER.reduce((n, s) => n + counts[s], 0)).toBe(counts.all);
    expect(shopCosmetics("aura").map((i) => i.id).slice(0, 2)).toEqual(["aura_firefly", "aura_fog"]);
    expect(shopCosmetics("aura").map((i) => i.id)).toContain("aura_raincloud");
    expect(shopCosmetics("all")).toHaveLength(counts.all);
  });

  it("끌어다 놓기는 같은 부위만", () => {
    expect(canDropOn("hat_cat", "head")).toBe(true);
    expect(canDropOn("hat_cat", "neck")).toBe(false);
    expect(canDropOn("fw_small", "head")).toBe(false);
  });
});

describe("resolveAvatar", () => {
  it("게임 → 계정 → 기기 → 기본값", () => {
    const c = AVATAR_COLORS[2];
    expect(resolveAvatar({ color: c, body: "cat" }, null, null)).toEqual({ color: c, body: "cat" });
    expect(resolveAvatar(undefined, { color: "nope", body: null }, AVATAR_COLORS[1])).toEqual({ color: AVATAR_COLORS[1], body: "hood" });
    expect(resolveAvatar(undefined, null, null).color).toBe(AVATAR_COLORS[0]);
  });
});
