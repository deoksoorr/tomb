import { describe, expect, it, vi } from "vitest";
import { AVATAR_BODIES, DIR, ITEMS } from "@tomb/protocol";
import { AV_COLS, AV_H, AV_W, avatarColorSpec, avatarFrameGrid, lookKey, SPRITE_COSMETICS } from "./avatar";
import { CosmeticFxSim, FX_ART, fxIconGrid, type FxCmd, type FxInput } from "./cosmeticFx";
import { GEAR4, ICONS4 } from "./bungeoGear";
import { hasItemIcon } from "./itemIcons";
import { Grid } from "./pixel";
import { SEASON_SHEET_IDS, seasonGearIcon } from "./seasonSetGear";

// 11/22 골목 붕어빵 수레 한정 꾸미기 12점 + 외형 「붕어빵 장수 유령」(vendor):
// 15가지 몸 × 앞·옆·뒤 × 시트 28장에 그려지고(칸 안 — x 1~18, y 26 이하), 아이콘·따로 그리는 연출이 있다.

const watch = vi.hoisted(() => ({ on: false }));
vi.mock("./seasonSetGear", async (importOriginal) => {
  const m = await importOriginal<typeof import("./seasonSetGear")>();
  const wrap =
    <A extends unknown[]>(f: (...a: A) => void) =>
    (...a: A) => {
      watch.on = true;
      try {
        f(...a);
      } finally {
        watch.on = false;
      }
    };
  return { ...m, drawSsBack: wrap(m.drawSsBack), drawSsNeck: wrap(m.drawSsNeck), drawSsHead: wrap(m.drawSsHead), drawSsHand: wrap(m.drawSsHand), drawSsGlow: wrap(m.drawSsGlow) };
});

const COLOR = "#9fb8d8";
const ALLEY = ITEMS.filter((i) => i.alley);
const SHEET = ALLEY.map((i) => i.id).filter((id) => id in GEAR4);
const CAMPUS = ["kc_cap", "kc_hoodie", "kc_phones", "kc_icecoffee", "kc_sneaker"];
const DATE = ["kd_beanie", "kd_coat", "kd_muffler", "kd_bungeo", "kd_lights"];
const LOOKS: readonly (readonly string[])[] = [[], ...SHEET.map((id) => [id]), CAMPUS, DATE, ["kn_cable", "kd_muffler"], ["kn_fleece", "kc_phones", "kd_beanie"], ["sc_padding", "sc_earflap", "sc_goguma"]];
const diff = (a: Grid, b: Grid) => {
  let n = 0;
  for (let i = 0; i < a.px.length; i++) if (a.px[i] !== b.px[i]) n++;
  return n;
};

describe("붕어빵 수레 한정 꾸미기 (시트 그림)", () => {
  it("열두 점 모두 그림·아이콘이 있다 (시트 열 점 + 운동화 발자국·거리 전구 오라)", () => {
    expect(ALLEY.length).toBe(12);
    expect(SHEET.sort()).toEqual(["kc_cap", "kc_hoodie", "kc_icecoffee", "kc_phones", "kd_beanie", "kd_bungeo", "kd_coat", "kd_muffler", "kn_cable", "kn_fleece"]);
    for (const it of ALLEY) {
      expect(SPRITE_COSMETICS as readonly string[], it.id).toContain(it.id);
      expect(hasItemIcon(it.id), it.id).toBe(true);
      const icon = ICONS4[it.id]?.();
      expect(icon, it.id).toBeTruthy();
      expect([icon!.w, icon!.h]).toEqual([16, 16]);
      expect(icon!.px.filter((v) => v & 255).length, it.id).toBeGreaterThan(12);
      expect(seasonGearIcon(it.id) ?? fxIconGrid(it.id), it.id).not.toBeNull();
    }
    // 외형 덧그림(bd_*)은 착용 목록·시트 키에 오지 않는다
    expect(SEASON_SHEET_IDS.filter((id) => id.startsWith("bd_"))).toEqual([]);
    for (const id of SHEET) expect(lookKey([id])).toBe(id);
    expect(lookKey(["kc_sneaker", "kd_lights"])).toBe("");
  });

  it("15가지 몸 × 앞·옆·뒤 × 28장: 예외 없이 그려지고 칠은 칸 안 (x 1~18, y 26 이하)", () => {
    const bad: string[] = [];
    let hits: string[] = [];
    const orig = Grid.prototype.set;
    Grid.prototype.set = function (this: Grid, x: number, y: number, c: number, a = 255) {
      if (watch.on && this.w === AV_W && this.h === AV_H && a > 0 && (x < 1 || x > AV_W - 2 || y > AV_H - 2)) hits.push(`${x},${y}`);
      return orig.call(this, x, y, c, a);
    };
    try {
      for (const look of LOOKS)
        for (const { id: body } of AVATAR_BODIES)
          for (const view of ["down", "side", "up"] as const)
            for (let col = 0; col < AV_COLS; col++) {
              hits = [];
              avatarFrameGrid(body, view, col, "#c3a6d9|||#3aa070", look);
              if (hits.length) bad.push(`${look.join("+") || "(맨몸)"} ${body}/${view}/${col}: ${[...new Set(hits)].slice(0, 4).join(" ")}`);
            }
    } finally {
      Grid.prototype.set = orig;
    }
    expect(bad).toEqual([]);
  }, 60_000);

  // 11/22 손에 든 것(얼죽아 컵·붕어빵 봉투)의 뒷모습은 heldGear.test.ts (몸 뒤 반대편 손에 깔린다)
  it("모든 몸에서 앞·옆·뒤 중 어딘가 그림이 바뀐다", () => {
    for (const id of SHEET)
      for (const b of AVATAR_BODIES) {
        const changed = (["down", "side", "up"] as const).some((v) => diff(avatarFrameGrid(b.id, v, 0, COLOR), avatarFrameGrid(b.id, v, 0, COLOR, [id])) > 0);
        expect(changed, `${id} ${b.id}`).toBe(true);
      }
  });
});

describe("외형 「붕어빵 장수 유령」(vendor)", () => {
  it("두건 유령 바탕에 조끼·앞치마·수건·집게 붕어빵을 덧그린다 (앞·옆·뒤)", () => {
    for (const view of ["down", "side", "up"] as const) expect(diff(avatarFrameGrid("hood", view, 0, COLOR), avatarFrameGrid("vendor", view, 0, COLOR)), view).toBeGreaterThan(20);
  });

  it("포인트 색 = 앞치마, 몸 색 = 조끼", () => {
    const plain = avatarFrameGrid("vendor", "down", 0, COLOR);
    expect(diff(plain, avatarFrameGrid("vendor", "down", 0, avatarColorSpec(COLOR, { accent: "#3070d0" })))).toBeGreaterThan(15);
    expect(diff(plain, avatarFrameGrid("vendor", "down", 0, avatarColorSpec(COLOR, { body: "#30a050" })))).toBeGreaterThan(15);
  });

  it("머리 꾸미기를 쓰면 수건을 벗고, 손에 다른 것을 들면 집게 붕어빵을 내려놓는다", () => {
    // 수건 하늘색 줄 (0x7aa4d8)은 맨몸에만
    const towel = (g: Grid) => g.px.filter((v) => (v & 255) === 255 && v >>> 8 === 0x7aa4d8).length;
    expect(towel(avatarFrameGrid("vendor", "down", 0, COLOR))).toBeGreaterThan(2);
    for (const hat of ["kc_cap", "kd_beanie", "hat_straw", "sc_earflap"]) expect(towel(avatarFrameGrid("vendor", "down", 0, COLOR, [hat])), hat).toBe(0);
    // 은색 집게 (0xc4c8d0)는 손이 비었을 때만
    const tong = (g: Grid) => g.px.filter((v) => (v & 255) === 255 && v >>> 8 === 0xc4c8d0).length;
    expect(tong(avatarFrameGrid("vendor", "down", 0, COLOR))).toBeGreaterThan(0);
    for (const held of ["kd_bungeo", "kc_icecoffee", "hand_lantern", "sc_goguma"]) expect(tong(avatarFrameGrid("vendor", "down", 0, COLOR, [held])), held).toBe(0);
  });
});

describe("운동화 발자국 · 거리 전구 오라 (따로 그리는 연출)", () => {
  const input = (o: Partial<FxInput> = {}): FxInput => ({ now: 1000, dt: 16, x: 100, y: 200, headY: 200, dir: DIR.down, moving: false, hidden: false, artTop: 22, shoulder: 8, hand: { dx: 6, up: 8 }, reduced: false, ...o });

  it("전구 줄은 머리 위 몸 뒤에, 밤에는 빛 층에 번짐 — 이름표는 그 위로", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["kd_lights"]);
    const out: FxCmd[] = [];
    sim.step(input({ still: true }), out);
    const l = out.find((c) => c.art === "bgLights")!;
    expect(l).toBeTruthy();
    expect(l.y).toBeLessThan(200 - 22);
    expect(l.layer).toBe("body");
    expect(l.depth).toBeLessThan(200);
    expect(out.some((c) => c.art === "bgLightsGlow" && c.layer === "light")).toBe(true);
    expect(sim.labelTop(22, 8)).toBeGreaterThan(22 + 10);
    for (const c of out) expect(c.frame).toBeLessThan(FX_ART[c.art].frames);
  });

  it("운동화 발자국은 걸으면 바닥에 좌우 번갈아 찍힌다", () => {
    const sim = new CosmeticFxSim();
    sim.setLook(["kc_sneaker"]);
    let out: FxCmd[] = [];
    for (let i = 0; i < 40; i++) {
      out = [];
      sim.step(input({ now: 1000 + i * 50, y: 200 + i, moving: true }), out);
    }
    const prints = out.filter((c) => c.art === "bgSole");
    expect(prints.length).toBeGreaterThan(2);
    expect(new Set(prints.map((c) => c.frame)).size).toBe(2);
    for (const c of prints) expect(c.layer).toBe("ground");
  });
});
