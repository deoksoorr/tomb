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
    // 11/19 물공 무기는 명중도 조금 (나무 자 명중 +2)
    expect(d.find((x) => x.key === "atk")).toEqual({ key: "atk", label: "ATK", before: expect.any(Number), after: expect.any(Number), delta: 6 });
    expect(d.every((x) => x.delta > 0)).toBe(true);
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
    inv: { w_ruler: 1, c_bonus: 2, a_hazmat: 1 },
    sg: [sg(1, 1, 1, 0), sg(2, 1, 1, 3, 4), sg(3, 0, 0, 1), sg(4, 0, 2, 3)],
    si: ["w_stamp+3@9.0"],
  };
  it("세트별 묶음 (야근 → 결재), 높은 직급·강화 먼저 (11/26 끼는 중보다 직급이 먼저), 상점 장비는 등급·강화·레벨 순", () => {
    const b = bagEntries(c, 50);
    expect(b.sets.map((x) => x.set)).toEqual(["overtime", "approval"]);
    expect(b.sets[0].items.map((x) => x.it.u)).toEqual([4, 3]);
    expect(b.sets[0].items[1].slot).toBe("weapon");
    expect(b.sets[1].items.map((x) => x.it.u)).toEqual([2, 1]);
    expect(b.shop[0]).toMatchObject({ key: "c_bonus", equipped: 1 });
    expect(b.shop.find((x) => x.key === "si9")).toMatchObject({ enh: 3, piece: { u: 9 } });
    expect(b.shop[b.shop.length - 1].key).toBe("w_ruler");
  });
  it("부위 칸으로 거르고, 레벨이 모자라면 아래로 (흐리게)", () => {
    const w = bagEntries(c, 50, "weapon");
    expect(w.sets.flatMap((x) => x.items).every((x) => x.gear.kind === "weapon")).toBe(true);
    expect(w.shop.map((x) => x.key)).toEqual(["si9", "w_ruler"]);
    const low = bagEntries(c, 20, "weapon");
    expect(low.shop.map((x) => [x.key, x.low])).toEqual([
      ["w_ruler", false],
      ["si9", true],
    ]);
    expect(low.sets[0].items[0].low).toBe(true);
  });
});

// 11/26 세트 장비 직급 순 · 부위별 칸 후보
import { sgSort, slotCandidates } from "./gear";

describe("직급 순 정렬 · 부위별 칸", () => {
  const sg = (u: number, s: number, p: number, g: 0 | 1 | 2 | 3, e = 0) => encodeSg({ s, p, g, u, e, o: [], L: 0, rr: 0, f: 0 });
  it("sgSort: 못 끼는 것 아래 → 직급 → 강화 → 끼는 중", () => {
    const it = (u: number, g: 0 | 1 | 2 | 3, e: number) => ({ s: 0, p: 1, g, u, e, o: [], L: 0, rr: 0, f: 0 });
    const rows = [
      { low: false, slot: null, it: it(1, 0, 15) },
      { low: false, slot: "armor" as const, it: it(2, 1, 0) },
      { low: false, slot: null, it: it(3, 3, 0) },
      { low: false, slot: null, it: it(4, 1, 5) },
      { low: true, slot: null, it: it(5, 3, 15) },
      { low: false, slot: null, it: it(6, 1, 0) },
    ];
    expect([...rows].sort(sgSort).map((x) => x.it.u)).toEqual([3, 4, 2, 6, 1, 5]);
  });
  it("slotCandidates: 그 칸에 낄 수 있는 다른 장비만, 세트 장비는 직급 순, 다른 칸에 낀 것은 빼고", () => {
    const c = {
      equip: { ...empty, armor: sg(1, 0, 1, 1), acc1: sg(10, 0, 3, 2), acc2: null },
      inv: { a_hazmat: 1, c_bonus: 1 },
      sg: [sg(1, 0, 1, 1), sg(2, 1, 1, 0, 9), sg(3, 2, 1, 3), sg(4, 3, 1, 2, 3), sg(5, 0, 0, 3), sg(10, 0, 3, 2), sg(11, 1, 4, 0)],
      si: [],
    };
    const b = bagEntries(c, 60);
    const all = [...b.sets.flatMap((x) => x.items), ...b.shop];
    const armor = slotCandidates(all, "armor");
    expect(armor.map((x) => (x.type === "sg" ? x.it.u : x.key))).toEqual([3, 4, 2, "a_hazmat"]);
    // 장신구: acc1에 낀 10번은 acc2 후보에서 빠진다
    const acc2 = slotCandidates(all, "acc2");
    expect(acc2.map((x) => (x.type === "sg" ? x.it.u : x.key))).toEqual([11, "c_bonus"]);
    expect(slotCandidates(all, "weapon").map((x) => (x.type === "sg" ? x.it.u : x.key))).toEqual([5]);
  });
});
