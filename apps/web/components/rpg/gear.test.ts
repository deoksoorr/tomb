import { describe, expect, it } from "vitest";
import { gearById, type GearSlot } from "@/lib/rpg/catalog";
import { baseStats } from "@/lib/rpg/formulas";
import { bagGear, deltaText, equipTarget, gearDiff, gearGrade, sellable, sellWarning, slotAccepts } from "./gear";

const empty: Record<GearSlot, string | null> = { weapon: null, armor: null, head: null, acc1: null, acc2: null };
const char = (equip: Partial<typeof empty> = {}, inv: Record<string, number> = {}) => ({
  level: 10,
  stats: baseStats(),
  equip: { ...empty, ...equip },
  inv,
});

describe("gearGrade", () => {
  it("요구 레벨로 등급", () => {
    expect(gearGrade({ reqLevel: 1 }).label).toBe("일반");
    expect(gearGrade({ reqLevel: 8 }).label).toBe("고급");
    expect(gearGrade({ reqLevel: 22 }).id).toBe("rare");
    expect(gearGrade({ reqLevel: 40 }).id).toBe("legend");
  });
});

describe("equipTarget · slotAccepts", () => {
  it("장신구는 빈 칸 먼저", () => {
    expect(equipTarget(char(), "weapon")).toBe("weapon");
    expect(equipTarget(char(), "acc")).toBe("acc1");
    expect(equipTarget(char({ acc1: "c_sticker" }), "acc")).toBe("acc2");
    expect(equipTarget(char({ acc1: "c_sticker", acc2: "c_earphones" }), "acc")).toBe("acc1");
    expect(slotAccepts("acc2", "acc")).toBe(true);
    expect(slotAccepts("weapon", "armor")).toBe(false);
  });
});

describe("gearDiff", () => {
  it("빈 칸에 끼면 오르는 것만", () => {
    const d = gearDiff(char(), "weapon", "w_ruler");
    expect(d).toEqual([{ key: "atk", label: "ATK", before: expect.any(Number), after: expect.any(Number), delta: 6 }]);
  });

  it("바꿔 끼면 오르고 내리는 것", () => {
    const d = gearDiff(char({ weapon: "w_keyboard" }), "weapon", "w_ruler");
    const by = Object.fromEntries(d.map((x) => [x.key, x.delta]));
    expect(by.atk).toBe(-9);
    expect(by.aspd).toBe(-0.1);
  });

  it("빼기", () => {
    const d = gearDiff(char({ armor: "a_hoodie" }), "armor", null);
    expect(d.find((x) => x.key === "def")?.delta).toBe(-3);
    expect(d.find((x) => x.key === "maxHp")!.delta).toBeLessThan(0);
  });

  it("같은 것이면 변화 없음", () => {
    expect(gearDiff(char({ weapon: "w_ruler" }), "weapon", "w_ruler")).toEqual([]);
  });

  it("표기", () => {
    expect(deltaText(9)).toBe("+9");
    expect(deltaText(-0.1)).toBe("−0.1");
    expect(deltaText(0.15)).toBe("+0.15");
  });
});

describe("되팔기", () => {
  it("장착 중인 것은 못 팔고, 남는 것을 팔 땐 묻는다", () => {
    const c = char({ weapon: "w_ruler" }, { w_ruler: 2, h_cap: 1, w_refactor: 1 });
    expect(sellable(c, "w_ruler")).toBe(1);
    expect(sellable(char({ weapon: "w_ruler" }, { w_ruler: 1 }), "w_ruler")).toBe(0);
    expect(sellWarning(c, gearById("w_ruler")!)).toMatch("장착 중");
    expect(sellWarning(c, gearById("h_cap")!)).toBeNull();
    expect(sellWarning(c, gearById("w_refactor")!)).toMatch("희귀");
  });

  it("가방 순서: 장착 중 → 종류 → 높은 레벨", () => {
    const c = char({ head: "h_cap" }, { c_sticker: 1, w_ruler: 1, w_keyboard: 1, h_cap: 1, nope: 2 });
    expect(bagGear(c).map((x) => x.gear.id)).toEqual(["h_cap", "w_keyboard", "w_ruler", "c_sticker"]);
  });
});

// 11/15 장비창 가방: 세트 장비(세트별) 먼저, 높은 직급·강화 먼저, 못 끼는 것은 아래, 부위 칸
import { encodeSg } from "@/lib/rpg/setGear";
import { bagEntries } from "./gear";

describe("bagEntries", () => {
  const sg = (u: number, s: number, p: number, g: 0 | 1 | 2 | 3, e = 0) => encodeSg({ s, p, g, u, e, o: [], L: 0, rr: 0, f: 0 });
  const c = {
    equip: { ...empty, weapon: sg(3, 0, 0, 1), acc1: "c_bonus" },
    inv: { w_ruler: 1, w_stamp: 1, c_bonus: 2, a_hazmat: 1 },
    sg: [sg(1, 1, 1, 0), sg(2, 1, 1, 3, 4), sg(3, 0, 0, 1), sg(4, 0, 2, 3)],
    enh: { w_stamp: 3 },
  };
  it("세트별 묶음 (야근 → 결재), 낀 것·높은 직급·강화 먼저, 상점 장비는 등급·강화·레벨 순", () => {
    const b = bagEntries(c, 50);
    expect(b.sets.map((x) => x.set)).toEqual(["overtime", "approval"]);
    expect(b.sets[0].items.map((x) => x.it.u)).toEqual([3, 4]);
    expect(b.sets[0].items[0].slot).toBe("weapon");
    expect(b.sets[1].items.map((x) => x.it.u)).toEqual([2, 1]);
    expect(b.shop[0]).toMatchObject({ key: "c_bonus", equipped: 1 });
    expect(b.shop.find((x) => x.key === "w_stamp")!.enh).toBe(3);
    expect(b.shop[b.shop.length - 1].key).toBe("w_ruler");
  });
  it("부위 칸으로 거르고, 레벨이 모자라면 아래로 (흐리게)", () => {
    const w = bagEntries(c, 50, "weapon");
    expect(w.sets.flatMap((x) => x.items).every((x) => x.gear.kind === "weapon")).toBe(true);
    expect(w.shop.map((x) => x.key)).toEqual(["w_stamp", "w_ruler"]);
    const low = bagEntries(c, 20, "weapon");
    expect(low.shop.map((x) => [x.key, x.low])).toEqual([
      ["w_ruler", false],
      ["w_stamp", true],
    ]);
    expect(low.sets[0].items[0].low).toBe(true);
  });
});
