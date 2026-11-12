import { describe, expect, it } from "vitest";
import { AVATAR_BODIES, DIR, ITEMS, sanitizeLook } from "@tomb/protocol";
import { AV_H, AV_W, avatarArtTop, avatarFrameGrid, handAnchor, lookKey, SPRITE_COSMETICS } from "./avatar";
import { GEAR_HAND, GEAR_HEAD, GEAR_SHEET_IDS } from "./avatarGear";
import { COSMETIC_FX, COSMETIC_FX_IDS, CosmeticFxSim, FX_ART, fxIconGrid, petSinkTarget, type FxCmd, type FxInput } from "./cosmeticFx";
import { hasItemIcon } from "./itemIcons";

// F8 캐릭터 꾸미기 추가분: 시트 그림(6몸 × 앞·옆·뒤)·따로 그리는 연출(CosmeticFxSim)·아이콘·원격 착용(sanitizeLook)

const F8 = ITEMS.filter((i) => i.kind === "cosmetic" && (GEAR_SHEET_IDS.includes(i.id) || i.id in COSMETIC_FX));
const COLOR = "#9fb8d8";

function diff(a: ReturnType<typeof avatarFrameGrid>, b: ReturnType<typeof avatarFrameGrid>): number {
  let n = 0;
  for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) n++;
  return n;
}

describe("F8 catalog", () => {
  it("adds 30+ cosmetics over every slot, all drawable, priced 60–480 (I0d: ×4)", () => {
    expect(F8.length).toBeGreaterThanOrEqual(30);
    for (const slot of ["head", "neck", "hand", "back", "feet", "aura", "pet"]) expect(F8.some((i) => i.slot === slot), slot).toBe(true);
    for (const it of F8) {
      expect(SPRITE_COSMETICS as readonly string[]).toContain(it.id);
      expect(hasItemIcon(it.id), it.id).toBe(true);
      if (it.slot === "pet") continue; // 펫은 동물원 사육사가 영구로만 판다 (값은 ZOO_PETS, zoo.test.ts)
      if (it.staff) continue; // 31번 운영자 전용은 값 0 (운영자만 영구로 받는다)
      expect(it.price).toBeGreaterThanOrEqual(60);
      expect(it.price).toBeLessThanOrEqual(480);
    }
    // 시트 그림과 따로 그리는 연출은 겹치지 않는다
    for (const id of GEAR_SHEET_IDS) expect(COSMETIC_FX_IDS).not.toContain(id);
  });

  it("remote look validation accepts the new ids (one per slot)", () => {
    expect(sanitizeLook(["hat_crown", "neck_tie", "hand_umbrella", "back_cape", "feet_hearts", "aura_zzz", "pet_cat", "hat_cap"])).toEqual([
      "hat_crown",
      "neck_tie",
      "hand_umbrella",
      "back_cape",
      "feet_hearts",
      "aura_zzz",
      "pet_cat",
    ]);
  });
});

describe("F8 sheet gear fits all 6 bodies", () => {
  it("every sheet item changes the front/side frame of every body (and the texture key)", () => {
    for (const id of GEAR_SHEET_IDS) {
      expect(lookKey([id])).toBe(id);
      for (const b of AVATAR_BODIES)
        for (const view of ["down", "side"] as const) {
          const plain = avatarFrameGrid(b.id, view, 0, COLOR);
          const worn = avatarFrameGrid(b.id, view, 0, COLOR, [id]);
          expect(diff(plain, worn), `${id} ${b.id} ${view}`).toBeGreaterThan(0);
        }
    }
  });

  it("head gear is never clipped at the top of the frame (sitting and standing)", () => {
    for (const id of GEAR_HEAD)
      for (const b of AVATAR_BODIES) {
        expect(avatarArtTop(b.id, [id]), `${id} ${b.id}`).toBeLessThan(AV_H - 1);
        for (const view of ["down", "side", "up"] as const)
          for (const col of [0, 1, 12, 13]) {
            const g = avatarFrameGrid(b.id, view, col, COLOR, [id]);
            let topRow = 0;
            for (let x = 0; x < AV_W; x++) if (g.filled(x, 0)) topRow++;
            expect(topRow, `${id} ${b.id} ${view} ${col}`).toBe(0);
          }
      }
  });

  it("hand gear hides behind the body from the back", () => {
    for (const id of GEAR_HAND)
      for (const b of AVATAR_BODIES) expect(diff(avatarFrameGrid(b.id, "up", 0, COLOR), avatarFrameGrid(b.id, "up", 0, COLOR, [id])), `${id} ${b.id}`).toBe(0);
  });

  it("back gear shows on the back view", () => {
    for (const id of ["back_backpack", "back_cape"])
      for (const b of AVATAR_BODIES) expect(diff(avatarFrameGrid(b.id, "up", 0, COLOR), avatarFrameGrid(b.id, "up", 0, COLOR, [id])), `${id} ${b.id}`).toBeGreaterThan(4);
  });

  it("hand anchor is beside the body and mirrored for left/back", () => {
    for (const b of AVATAR_BODIES) {
      const down = handAnchor(b.id, "down");
      expect(down.dx).toBeGreaterThan(2);
      expect(handAnchor(b.id, "up").dx).toBe(-down.dx);
      expect(handAnchor(b.id, "left").dx).toBe(-handAnchor(b.id, "right").dx);
      expect(down.up).toBeGreaterThan(3);
    }
  });
});

describe("F8 effects (CosmeticFxSim)", () => {
  const input = (o: Partial<FxInput> = {}): FxInput => ({
    now: 1000,
    dt: 16,
    x: 100,
    y: 200,
    headY: 200,
    dir: DIR.down,
    moving: false,
    hidden: false,
    artTop: 18,
    shoulder: 7,
    hand: { dx: 5.5, up: 6 },
    reduced: false,
    ...o,
  });

  const valid = (c: FxCmd) => {
    const a = FX_ART[c.art];
    expect(c.frame).toBeGreaterThanOrEqual(0);
    expect(c.frame).toBeLessThan(a.frames);
    for (const v of [c.x, c.y, c.alpha, c.sx, c.sy, c.rot, c.depth]) expect(Number.isFinite(v)).toBe(true);
  };

  it("every effect item draws something (walking, a few seconds), with valid frames", () => {
    for (const id of COSMETIC_FX_IDS) {
      const sim = new CosmeticFxSim();
      sim.setLook([id]);
      let drawn = 0;
      for (let i = 0; i < 120; i++) {
        const out: FxCmd[] = [];
        sim.step(input({ now: 1000 + i * 33, dt: 33, x: 100 + i, moving: true, dir: DIR.right }), out);
        for (const c of out) valid(c);
        drawn = Math.max(drawn, out.length);
      }
      expect(drawn, id).toBeGreaterThan(0);
    }
  });

  it("art sheets match their frame size", () => {
    for (const [k, a] of Object.entries(FX_ART)) {
      const g = a.build();
      expect([g.w, g.h], k).toEqual([a.w * a.frames, a.h]);
      let n = 0;
      for (let i = 0; i < g.px.length; i++) if (g.px[i] & 255) n++;
      expect(n, k).toBeGreaterThan(0);
    }
  });

  it("footprints stay on the ground where they were left and fade", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["feet_prints"]);
    const out: FxCmd[] = [];
    for (let i = 0; i < 30; i++) {
      out.length = 0;
      sim.step(input({ now: 1000 + i * 33, x: 100 + i * 2, moving: true, dir: DIR.right }), out);
    }
    expect(out.length).toBeGreaterThan(3);
    expect(out.every((c) => c.layer === "ground")).toBe(true);
    // 멈춰 서도 남아 있다가 몇 초 뒤 사라진다
    out.length = 0;
    sim.step(input({ now: 2100, x: 160 }), out);
    expect(out.length).toBeGreaterThan(0);
    out.length = 0;
    sim.step(input({ now: 9000, x: 160 }), out);
    expect(out).toHaveLength(0);
  });

  it("pets trail behind and catch up", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["pet_cat"]);
    const out: FxCmd[] = [];
    sim.step(input(), out);
    const start = out.find((c) => c.art === "petCat")!;
    expect(start.x).toBeLessThan(100);
    let x = 100;
    for (let i = 0; i < 60; i++) {
      out.length = 0;
      x += 2;
      sim.step(input({ now: 1000 + i * 33, dt: 33, x, moving: true, dir: DIR.right }), out);
    }
    const pet = out.find((c) => c.art === "petCat")!;
    expect(pet.x).toBeLessThan(x);
    expect(x - pet.x).toBeLessThan(40);
    expect(pet.flip).toBe(false); // 오른쪽으로 걷는 주인을 본다
  });

  it("pets follow their owner into the water: half sunk while swimming, under the surface while diving; flying pets stay up", () => {
    const step = (sim: CosmeticFxSim, water: FxInput["water"], n = 40) => {
      let out: FxCmd[] = [];
      for (let i = 0; i < n; i++) {
        out = [];
        sim.step(input({ now: 1000 + i * 33, dt: 33, water, hidden: !!water }), out);
      }
      return out;
    };
    const sim = new CosmeticFxSim();
    sim.setLook(["pet_dog"]);
    const dry = step(sim, null).find((c) => c.art === "petDog")!;
    expect(dry.crop ?? 0).toBe(0);
    const swim = step(sim, "swim");
    const dog = swim.find((c) => c.art === "petDog")!;
    expect(dog.crop).toBe(petSinkTarget("swim", 0, FX_ART.petDog.h));
    expect(dog.crop!).toBeLessThan(FX_ART.petDog.h);
    expect(swim.some((c) => c.art === "petRipple")).toBe(true);
    const dive = step(sim, "dive");
    expect(dive.some((c) => c.art === "petDog")).toBe(false); // 수면 아래
    expect(dive.some((c) => c.art === "petBubble")).toBe(true);
    for (const c of dive) valid(c);
    // 물에서 나오면 다시 보인다
    expect(step(sim, null).find((c) => c.art === "petDog")!.crop ?? 0).toBe(0);
    // 나는 펫(새)은 물 위를 그대로 난다
    const bird = new CosmeticFxSim();
    bird.setLook(["pet_bird"]);
    const b = step(bird, "dive").find((c) => c.art === "petBird")!;
    expect(b.crop ?? 0).toBe(0);
  });

  it("umbrella, rain cloud and wings lift the name tag; hidden states hide body effects", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["hand_umbrella"]);
    expect(sim.labelTop(18, 7)).toBeGreaterThan(18);
    sim.setLook(["aura_raincloud"]);
    expect(sim.labelTop(18, 7)).toBeGreaterThan(18);
    sim.setLook(["back_wings_bat"]);
    expect(sim.labelTop(18, 7)).toBe(16);
    sim.setLook(["pet_dog"]);
    expect(sim.labelTop(18, 7)).toBe(0);
    for (const id of ["hand_umbrella", "aura_snow", "back_wings_butterfly"]) {
      sim.setLook([id]);
      const out: FxCmd[] = [];
      sim.step(input({ hidden: true }), out);
      expect(out, id).toHaveLength(0);
    }
  });

  it("still preview (reduced motion) is deterministic and pre-seeds trails while walking", () => {
    const a = new CosmeticFxSim();
    const b = new CosmeticFxSim();
    for (const s of [a, b]) s.setLook(["feet_leaves"]);
    const oa: FxCmd[] = [];
    const ob: FxCmd[] = [];
    a.step(input({ still: true, moving: true, now: 5 }), oa);
    b.step(input({ still: true, moving: true, now: 99999 }), ob);
    expect(oa.length).toBe(3);
    expect(oa.map((c) => [c.x, c.y])).toEqual(ob.map((c) => [c.x, c.y]));
  });

  it("bag icons for effect items are filled 16×16 grids", () => {
    for (const id of COSMETIC_FX_IDS) {
      const g = fxIconGrid(id)!;
      expect(g, id).not.toBeNull();
      expect([g.w, g.h]).toEqual([16, 16]);
      let n = 0;
      for (let i = 0; i < g.px.length; i++) if (g.px[i] & 255) n++;
      expect(n, id).toBeGreaterThan(12);
    }
  });
});
