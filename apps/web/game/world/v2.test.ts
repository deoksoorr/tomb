import { describe, expect, it } from "vitest";
import { isFireworkId, itemById, ITEMS } from "@tomb/protocol";
import { InputHub } from "../input/InputHub";
import { gearOf, lookKey, SPRITE_COSMETICS } from "../sprites/avatar";
import { defaultZoom } from "./cameraMath";
import { burstSpeed, finaleTimes, fireworkPlan, FW_BASE_RADIUS, heartPoint, meteorShower, playerLightRadius, sampleTextMask } from "./fxMath";
import { hasItemIcon } from "../sprites/itemIcons";
import { declutter, type LabelBox } from "./labels";
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

describe("name labels", () => {
  it("overlapping labels are nudged up; the front (lower) one keeps its place", () => {
    const a: LabelBox = { x: 100, y: 200, w: 30, h: 5 };
    const b: LabelBox = { x: 105, y: 198, w: 30, h: 5 };
    const c: LabelBox = { x: 300, y: 198, w: 30, h: 5 };
    declutter([a, b, c], []);
    expect(a.y).toBe(200);
    expect(b.y).toBeLessThanOrEqual(195);
    expect(c.y).toBe(198); // 떨어져 있으면 그대로
  });
  it("a crowd stacks without overlaps", () => {
    const boxes: LabelBox[] = Array.from({ length: 6 }, (_, i) => ({ x: 100 + i, y: 200 - i * 0.5, w: 30, h: 5 }));
    declutter(boxes, []);
    const ys = boxes.map((b) => b.y).sort((p, q) => p - q);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(5 - 1e-9);
  });
});

describe("firework power", () => {
  const fireworks = ITEMS.filter((i) => isFireworkId(i.id));

  it("every firework item has a power and pricier ones are never weaker", () => {
    expect(fireworks.map((i) => i.id)).toEqual(expect.arrayContaining(["fw_small", "fw_heart", "fw_triple", "fw_big", "fw_grand"]));
    const byPrice = [...fireworks].sort((a, b) => a.price - b.price);
    let prev = fireworkPlan(byPrice[0].power);
    for (const it of byPrice.slice(1)) {
      const p = fireworkPlan(it.power);
      expect(p.power).toBeGreaterThanOrEqual(prev.power);
      // 덮는 넓이(반경² × 발 수)
      expect(p.radius * p.radius * p.shots).toBeGreaterThanOrEqual(prev.radius * prev.radius * prev.shots);
      expect(p.lift).toBeGreaterThanOrEqual(prev.lift);
      expect(p.volume).toBeGreaterThanOrEqual(prev.volume);
      prev = p;
    }
  });

  it("scales size, afterglow and light by power", () => {
    const small = fireworkPlan(itemById("fw_small")?.power);
    const big = fireworkPlan(itemById("fw_big")?.power);
    expect(small.radius).toBe(1);
    expect(fireworkPlan(itemById("fw_heart")?.power).radius).toBeGreaterThan(1);
    expect(fireworkPlan(itemById("fw_triple")?.power).shots).toBe(3);
    expect(big.radius).toBeGreaterThanOrEqual(2.5);
    expect(big.life).toBeGreaterThan(small.life * 1.5);
    expect(big.light).toBeGreaterThanOrEqual(small.light * 2.5);
    expect(big.lift).toBeGreaterThan(0);
    expect(big.sky).toBe(false);
  });

  it("finale fills the whole channel sky: 15~25 shots over 4~6 s", () => {
    const f = fireworkPlan(itemById("fw_grand")?.power);
    expect(f.sky).toBe(true);
    expect(f.shots).toBeGreaterThanOrEqual(15);
    expect(f.shots).toBeLessThanOrEqual(25);
    expect(f.spanMs).toBeGreaterThanOrEqual(4000);
    expect(f.spanMs).toBeLessThanOrEqual(6000);
    expect(f.lift).toBeGreaterThan(fireworkPlan(4).lift);
    const t = finaleTimes(f.shots, f.spanMs, () => 0.5);
    expect(t).toHaveLength(f.shots);
    expect(t[0]).toBe(0);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
    expect(t[t.length - 1]).toBeLessThanOrEqual(f.spanMs);
    // 마지막엔 몰아서 (클라이맥스)
    expect(t.filter((x) => x >= f.spanMs * 0.85).length).toBeGreaterThanOrEqual(3);
    const r = finaleTimes(f.shots, f.spanMs);
    expect(r.every((x) => x >= 0 && x <= f.spanMs)).toBe(true);
  });

  it("reduced-motion: fewer finale shots, no shake, softer flash", () => {
    const f = fireworkPlan(5, true);
    expect(f.shots).toBeLessThan(fireworkPlan(5).shots);
    expect(f.shots).toBeGreaterThanOrEqual(6);
    for (let p = 1; p <= 5; p++) {
      expect(fireworkPlan(p, true).shake).toBe(0);
      expect(fireworkPlan(p, true).lift).toBeLessThanOrEqual(fireworkPlan(p).lift);
    }
  });

  it("unknown/odd power falls back to the smallest; out of range clamps", () => {
    expect(fireworkPlan(undefined).power).toBe(1);
    expect(fireworkPlan(Number.NaN).power).toBe(1);
    expect(fireworkPlan(99).power).toBe(5);
    expect(fireworkPlan(0).power).toBe(1);
  });

  it("burstSpeed reaches the target radius under drag", () => {
    const drag = 1.3;
    const t = 1.23;
    const v = burstSpeed(FW_BASE_RADIUS * 2.8, drag, t);
    expect((v / drag) * (1 - Math.exp(-drag * t))).toBeCloseTo(FW_BASE_RADIUS * 2.8, 5);
  });
});

describe("v3 item visuals", () => {
  it("every shop item has its own icon (no question-mark fallback)", () => {
    for (const it of ITEMS) expect(hasItemIcon(it.id), it.id).toBe(true);
    expect(hasItemIcon("nope")).toBe(false);
  });

  it("every decor item can be drawn on a grave", () => {
    const decor = ITEMS.filter((i) => i.kind === "decor").map((i) => i.id);
    expect(decor).toEqual(expect.arrayContaining(["decor_rainbow", "decor_butterfly", "decor_snowman", "decor_flowerpot"]));
    for (const id of decor) expect(DECOR_IDS as readonly string[]).toContain(id);
  });

  it("text mask sampling stays within the cap and the glyph box, centered", () => {
    const w = 40;
    const h = 18;
    const alpha = new Uint8Array(w * h);
    for (let y = 3; y < 15; y++) for (let x = 2; x < 38; x++) if ((x + y) % 3 !== 0) alpha[y * w + x] = 255;
    for (const cap of [20, 150, 2000]) {
      const pts = sampleTextMask(alpha, w, h, cap);
      expect(pts.length).toBeGreaterThan(0);
      expect(pts.length).toBeLessThanOrEqual(cap);
      for (const p of pts) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(w / 2);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(h / 2);
      }
    }
    expect(sampleTextMask(new Uint8Array(w * h), w, h, 50)).toEqual([]);
  });

  it("meteor shower: streaks fall diagonally (down-left) inside the span, sorted", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const m = meteorShower(12, 2600, rnd);
    expect(m).toHaveLength(12);
    for (let i = 0; i < m.length; i++) {
      expect(m[i].at).toBeGreaterThanOrEqual(0);
      expect(m[i].at).toBeLessThanOrEqual(2600);
      if (i) expect(m[i].at).toBeGreaterThanOrEqual(m[i - 1].at);
      expect(m[i].dx).toBeLessThan(0);
      expect(m[i].dy).toBeGreaterThan(0);
      expect(m[i].dur).toBeGreaterThan(400);
    }
  });
});
