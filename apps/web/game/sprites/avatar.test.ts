import { describe, expect, it } from "vitest";
import { AVATAR_BODIES, ITEMS, STATE_NAMES } from "@tomb/protocol";
import { AV_ACT_ANIM, AV_ALIASES, AV_ANIM, AV_COLS, AV_H, AV_W, avatarArtTop, avatarFrameGrid, BODY_METRICS, bodyOf, gearOf, lookKey, SPRITE_COSMETICS, waterSink } from "./avatar";
import { EMOTE_ICONS, emoteGrid } from "./emotes";
import { lighten, mix, parseHex } from "./pixel";

describe("avatar sheet layout", () => {
  it("has an animation for every network state and acts, without overlapping columns", () => {
    const used = new Set<number>();
    // 다른 상태의 프레임을 그대로 쓰는 상태(AV_ALIASES, 50번 놀거리)는 그 상태와 같은 열이어야 하고 열을 따로 차지하지 않는다
    for (const [s, base] of Object.entries(AV_ALIASES)) expect(AV_ANIM[s as keyof typeof AV_ANIM], s).toEqual(AV_ANIM[base]);
    const all = [...STATE_NAMES.filter((s) => !(s in AV_ALIASES)).map((s) => AV_ANIM[s]), ...Object.values(AV_ACT_ANIM)];
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

describe("wave / cheer hands (NEXT 38)", () => {
  const COLOR = "#9fb8d8";
  const handColor = (body: string) => {
    const base = parseHex(COLOR);
    const b = body === "sheet" ? lighten(base, 0.3) : base;
    return mix(lighten(b, 0.5), 0xfff4dc, 0.45);
  };
  const handPixels = (body: string, view: "down" | "side" | "up", col: number) => {
    const g = avatarFrameGrid(body, view, col, COLOR);
    const want = handColor(body);
    const out: [number, number][] = [];
    for (let y = 0; y < AV_H; y++) for (let x = 0; x < AV_W; x++) if ((g.get(x, y) & 255) === 255 && g.get(x, y) >>> 8 === want) out.push([x, y]);
    return out;
  };
  const W0 = AV_ACT_ANIM.wave.col;
  const C0 = AV_ACT_ANIM.cheer.col;

  it("draws bright hands outside the body on all 6 bodies x front/side/back", () => {
    for (const b of AVATAR_BODIES)
      for (const view of ["down", "side", "up"] as const) {
        const idle = avatarFrameGrid(b.id, view, AV_ANIM.idle.col, COLOR);
        for (const col of [W0, W0 + 1, C0, C0 + 1]) {
          const hands = handPixels(b.id, view, col);
          expect(hands.length, `${b.id} ${view} ${col}`).toBeGreaterThanOrEqual(2);
          // 손은 서 있을 때 몸 그림 밖 (몸 위에 겹쳐 묻히지 않는다)
          expect(hands.some(([x, y]) => !idle.filled(x, y)), `${b.id} ${view} ${col}`).toBe(true);
        }
        // 두 프레임 사이 손이 크게 움직인다 (최소 3px)
        const a = handPixels(b.id, view, W0)[0];
        const c = handPixels(b.id, view, W0 + 1)[0];
        expect(Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]), `${b.id} ${view}`).toBeGreaterThanOrEqual(3);
      }
  });

  it("armless bodies (round, sheet) tilt the whole body while waving", () => {
    for (const body of ["round", "sheet"])
      for (const view of ["down", "side", "up"] as const) {
        const left = (col: number, y: number) => {
          const g = avatarFrameGrid(body, view, col, COLOR);
          for (let x = 0; x < AV_W; x++) if (g.filled(x, y)) return x;
          return -1;
        };
        const y = body === "round" ? 16 : 12;
        expect(left(W0 + 1, y) - left(W0, y), `${body} ${view}`).toBeGreaterThanOrEqual(2);
      }
  });
});

describe("above-head stack (NEXT 21/20)", () => {
  it("head cosmetics raise the art top so the name tag sits above them", () => {
    for (const b of AVATAR_BODIES) {
      const plain = avatarArtTop(b.id);
      expect(plain).toBeGreaterThanOrEqual(BODY_METRICS[b.id].top);
      expect(avatarArtTop(b.id, ["hat_halo"])).toBeGreaterThan(plain);
      // 모자가 두건 끝을 덮어도 몸 기준 높이 밑으로는 내려가지 않는다
      expect(avatarArtTop(b.id, ["hat_straw", "pet_ghost"])).toBeGreaterThanOrEqual(BODY_METRICS[b.id].top);
      expect(avatarArtTop(b.id, ["hat_halo"])).toBeLessThan(AV_H);
    }
  });

  it("emote icons are big outlined pixel art", () => {
    for (const k of EMOTE_ICONS) {
      const g = emoteGrid(k);
      expect(g.w).toBeGreaterThanOrEqual(12);
      let n = 0;
      for (let i = 0; i < g.px.length; i++) if (g.px[i] & 255) n++;
      expect(n, k).toBeGreaterThan(40);
    }
  });
});
