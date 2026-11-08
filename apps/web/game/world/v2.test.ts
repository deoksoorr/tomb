import { describe, expect, it } from "vitest";
import { ITEMS } from "@tomb/protocol";
import { InputHub } from "../input/InputHub";
import { gearOf, lookKey, SPRITE_COSMETICS } from "../sprites/avatar";
import { defaultZoom } from "./cameraMath";
import { heartPoint, playerLightRadius } from "./fxMath";
import { activeDecor, buildLayout, DECOR_IDS, MAX_DECOR } from "./graveLayout";

describe("grave decor", () => {
  const now = 1_000_000;
  it("keeps only known, unexpired items (max 3, no duplicates) and reports the next expiry", () => {
    const d = activeDecor(
      [
        { itemId: "decor_candles", until: now + 5000 },
        { itemId: "decor_candles", until: now + 9000 },
        { itemId: "decor_wreath", until: now - 1 },
        { itemId: "nope", until: now + 5000 },
        { itemId: "decor_stars", until: now + 2000 },
        { itemId: "decor_ribbon", until: now + 7000 },
        { itemId: "decor_ghostcat", until: now + 7000 },
      ],
      now,
    );
    expect(d.ids).toEqual(["decor_candles", "decor_stars", "decor_ribbon"]);
    expect(d.ids.length).toBeLessThanOrEqual(MAX_DECOR);
    expect(d.expiresAt).toBe(now + 2000);
  });

  it("layout carries decor and the earliest expiry across graves", () => {
    const l = buildLayout(
      [
        { id: "a", ageDays: 1, flowers: 0, revives: 0, decor: [{ itemId: "decor_lantern", until: now + 100 }] },
        { id: "b", ageDays: 1, flowers: 0, revives: 0 },
      ],
      [],
      now,
    );
    expect(l.placements[0].decor).toEqual(["decor_lantern"]);
    expect(l.placements[1].decor).toEqual([]);
    expect(l.decorExpiresAt).toBe(now + 100);
    expect(buildLayout([{ id: "a", ageDays: 1, flowers: 0, revives: 0 }], [], now).decorExpiresAt).toBe(Infinity);
  });

  it("every decor item in the catalog is drawable", () => {
    for (const it of ITEMS.filter((i) => i.kind === "decor")) expect(DECOR_IDS as readonly string[]).toContain(it.id);
  });
});

describe("cosmetics", () => {
  it("every sprite cosmetic in the catalog is drawn (aura is a separate effect)", () => {
    for (const it of ITEMS.filter((i) => i.kind === "cosmetic")) {
      if (it.id === "aura_firefly") continue;
      expect(SPRITE_COSMETICS as readonly string[]).toContain(it.id);
    }
  });

  it("sheet key is stable and ignores order and non-sprite items", () => {
    expect(lookKey(["neck_scarf", "hat_cat", "aura_firefly"])).toBe(lookKey(["aura_firefly", "hat_cat", "neck_scarf"]));
    expect(lookKey(["aura_firefly"])).toBe("");
    expect(gearOf(["hat_straw", "hand_lantern"])).toEqual({ hat: "hat_straw", lantern: true, scarf: false });
  });
});

describe("fireworks / lighting / camera", () => {
  it("heart curve is symmetric and heart-shaped (dip at top, point at bottom)", () => {
    const top = heartPoint(0);
    const bottom = heartPoint(Math.PI);
    expect(top.x).toBeCloseTo(0, 5);
    expect(bottom.x).toBeCloseTo(0, 5);
    expect(bottom.y).toBeGreaterThan(top.y); // y가 아래로 갈수록 크다 → 뾰족한 끝이 아래
    const l = heartPoint(Math.PI / 2);
    const r = heartPoint(-Math.PI / 2);
    expect(l.x).toBeCloseTo(-r.x, 5);
    expect(l.y).toBeCloseTo(r.y, 5);
  });

  it("player light grows at night and with a hand lantern", () => {
    expect(playerLightRadius(1, false)).toBeGreaterThan(playerLightRadius(0, false));
    expect(playerLightRadius(1, true)).toBeCloseTo(playerLightRadius(1, false) * 1.5, 5);
  });

  it("small screens start a bit zoomed out", () => {
    expect(defaultZoom(390, 844)).toBe(2.5);
    expect(defaultZoom(1280, 720)).toBe(3);
    expect(defaultZoom(820, 1180)).toBe(3);
  });
});

describe("input hub", () => {
  it("joystick wins over idle keyboard, actions are dropped while blocked", () => {
    const hub = new InputHub();
    const got: string[] = [];
    hub.setHandler((a) => got.push(a));
    hub.setJoystick(0.6, -0.2);
    const m = hub.read({ ax: 0, ay: 0, run: false });
    expect([m.ax, m.ay]).toEqual([0.6, -0.2]);
    hub.dispatch("sit");
    hub.setBlocked(true);
    hub.dispatch("interact");
    expect(got).toEqual(["sit"]);
    // 막히면 조이스틱도 0
    expect(hub.read({ ax: 0, ay: 0, run: false }).ax).toBe(0);
  });
});
