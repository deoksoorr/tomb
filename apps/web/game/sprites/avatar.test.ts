import { describe, expect, it } from "vitest";
import { AVATAR_BODIES, ITEMS, STATE_NAMES } from "@tomb/protocol";
import { AV_ACT_ANIM, AV_ANIM, AV_COLS, BODY_METRICS, bodyOf, gearOf, lookKey, SPRITE_COSMETICS, waterSink } from "./avatar";

describe("avatar sheet layout", () => {
  it("has an animation for every network state and acts, without overlapping columns", () => {
    const used = new Set<number>();
    const all = [...STATE_NAMES.map((s) => AV_ANIM[s]), ...Object.values(AV_ACT_ANIM)];
    expect(Object.keys(AV_ANIM).sort()).toEqual([...STATE_NAMES].sort());
    for (const a of all) {
      for (let i = 0; i < a.frames; i++) {
        const c = a.col + i;
        expect(c).toBeLessThan(AV_COLS);
        expect(used.has(c)).toBe(false);
        used.add(c);
      }
    }
  });

  it("knows every body and falls back to hood", () => {
    for (const b of AVATAR_BODIES) {
      expect(bodyOf(b.id)).toBe(b.id);
      expect(BODY_METRICS[b.id].top).toBeGreaterThan(BODY_METRICS[b.id].shoulder);
      expect(waterSink(b.id, "dive")).toBeGreaterThan(waterSink(b.id, "swim"));
    }
    expect(bodyOf("dragon")).toBe("hood");
    expect(bodyOf(undefined)).toBe("hood");
  });

  it("renders every cosmetic; only sheet-drawn ones change the texture key", () => {
    for (const it of ITEMS.filter((i) => i.kind === "cosmetic" && i.id !== "aura_firefly")) {
      expect(SPRITE_COSMETICS as readonly string[]).toContain(it.id);
    }
    expect(lookKey(["pet_ghost", "back_wings", "feet_flowers", "aura_fog"])).toBe("");
    expect(lookKey(["hat_halo"])).toBe("hat_halo");
    expect(gearOf(["hat_halo"]).hat).toBe("hat_halo");
  });
});
