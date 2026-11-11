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
