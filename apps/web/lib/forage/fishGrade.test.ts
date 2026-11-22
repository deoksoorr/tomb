import { describe, expect, it } from "vitest";
import { EARN_RULES } from "../economy";
import {
  BAG_IDS,
  bagIdOf,
  bagSpecies,
  baseIdOf,
  GRADE_PRICE_NOTE,
  gradedPrice,
  gradeOf,
  SPECIES,
  speciesBag,
  speciesById,
  speciesOf,
  takePlan,
} from "./catalog";
import { gradeMin10, rollFishSize10, rollSize10, sizeGrade } from "./rules";
import { SellSchema } from "./schemas";

// 11/22 물고기 크기 등급 (대물·월척): 문턱·가방 칸 id·값 반올림·종 단위 꺼내기

const sp = (id: string) => speciesById(id)!;

describe("크기 등급 문턱 (대물 = 위 20%, 월척 = 위 5%)", () => {
  it("종마다 크기 범위로 정해진다 (cm×10, 문턱 이상이면 그 등급)", () => {
    // 월요병 붕어 10~32cm: 대물 ≥ 24.73cm, 월척 ≥ 30.06cm
    const crucian = sp("f_crucian");
    expect(gradeMin10(crucian, 1)).toBeCloseTo(247.226, 2);
    expect(gradeMin10(crucian, 2)).toBeCloseTo(300.597, 2);
    expect([247, 248, 300, 301].map((s) => sizeGrade(crucian, s))).toEqual([0, 1, 1, 2]);
    // 잉어 30~85cm: 대물 ≥ 66.81cm, 월척 ≥ 80.15cm
    const carp = sp("f_carp");
    expect([668, 669, 801, 802, 850].map((s) => sizeGrade(carp, s))).toEqual([0, 1, 1, 2, 2]);
    // 칼퇴 송사리 2~6cm: 대물 ≥ 4.68cm, 월척 ≥ 5.65cm
    const minnow = sp("f_minnow");
    expect([46, 47, 56, 57].map((s) => sizeGrade(minnow, s))).toEqual([0, 1, 1, 2]);
  });

  it("크기를 재지 않는 것·잡동사니·물고기가 아닌 것·크기 0은 늘 보통", () => {
    expect(sizeGrade(sp("f_shoe"), 999)).toBe(0);
    const bug = speciesOf("bug").find((s) => s.size)!;
    expect(sizeGrade(bug, bug.size![1] * 10)).toBe(0);
    expect(sizeGrade(sp("f_carp"), 0)).toBe(0);
  });

  it("고른 난수로 굴리면 대물 약 20%, 월척 약 5% (모든 물고기에서)", () => {
    for (const s of speciesOf("fish").filter((x) => x.size && !x.junk)) {
      const N = 2000;
      let big = 0;
      let huge = 0;
      for (let i = 0; i < N; i++) {
        const g = sizeGrade(s, rollSize10(s, (i + 0.5) / N));
        if (g >= 1) big++;
        if (g === 2) huge++;
      }
      // 크기를 0.1cm로 반올림해 문턱 근처가 한 칸쯤 어긋날 수 있다 (작은 물고기일수록)
      expect(Math.abs(big / N - 0.2)).toBeLessThan(0.03);
      expect(Math.abs(huge / N - 0.05)).toBeLessThan(0.02);
    }
  });

  it("칭호·만조의 「크기 한 번 더 굴리기」는 등급 확률도 올린다 (의도)", () => {
    const carp = sp("f_carp");
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const rate = (chance: number) => {
      let n = 0;
      for (let i = 0; i < 4000; i++) if (sizeGrade(carp, rollFishSize10(carp, rand, chance)) > 0) n++;
      return n / 4000;
    };
    expect(rate(1)).toBeGreaterThan(rate(0) + 0.1);
  });
});

describe("가방 칸 id (`${종}~1` 대물 · `${종}~2` 월척)", () => {
  it("만들기·풀기", () => {
    expect(bagIdOf("f_carp")).toBe("f_carp");
    expect(bagIdOf("f_carp", 0)).toBe("f_carp");
    expect(bagIdOf("f_carp", 1)).toBe("f_carp~1");
    expect(bagIdOf("f_carp", 2)).toBe("f_carp~2");
    expect(baseIdOf("f_carp~2")).toBe("f_carp");
    expect(baseIdOf("h_mugwort")).toBe("h_mugwort");
    expect([gradeOf("f_carp"), gradeOf("f_carp~1"), gradeOf("f_carp~2"), gradeOf("f_carp~3")]).toEqual([0, 1, 2, 0]);
  });

  it("종 id에는 「~」·「@」가 없다 (등급 꼬리·물에 빠진 꾸미기 자리와 안 겹친다)", () => {
    expect(SPECIES.filter((s) => /[~@]/.test(s.id))).toEqual([]);
  });

  it("bagSpecies: 등급이 붙을 수 있는 물고기에만 등급 칸이 있다", () => {
    expect(bagSpecies("f_carp~1")?.id).toBe("f_carp");
    expect(bagSpecies("f_carp~2")?.id).toBe("f_carp");
    expect(bagSpecies("f_carp")?.id).toBe("f_carp");
    expect(bagSpecies("f_carp~3")).toBeUndefined();
    expect(bagSpecies("f_carp~")).toBeUndefined();
    expect(bagSpecies("f_shoe~1")).toBeUndefined();
    expect(bagSpecies("h_mugwort~2")).toBeUndefined();
    expect(bagSpecies("nope~1")).toBeUndefined();
    expect(BAG_IDS).toContain("f_koi~2");
    expect(BAG_IDS).not.toContain("h_mugwort~1");
    expect(new Set(BAG_IDS).size).toBe(BAG_IDS.length);
  });

  it("판매 입력은 등급 칸 id를 받고, 없는 등급 칸은 거절", () => {
    expect(SellSchema.safeParse({ npc: "fishmonger", items: { "f_carp~2": 1, f_carp: 2 } }).success).toBe(true);
    expect(SellSchema.safeParse({ npc: "fishmonger", items: { "f_shoe~1": 1 } }).success).toBe(false);
    expect(SellSchema.safeParse({ npc: "fishmonger", items: { "f_carp~9": 1 } }).success).toBe(false);
  });
});

describe("등급 값 (반올림)", () => {
  it("11/22 물고기 값은 예전의 ×1.3 (반올림, .5는 올림), 물고기가 아닌 것은 그대로", () => {
    expect(["f_minnow", "f_crucian", "f_carp", "f_catfish", "f_snakehead", "f_koi", "f_dragon", "f_shoe"].map((id) => sp(id).price)).toEqual([3, 4, 8, 9, 20, 42, 104, 1]);
    expect(sp("h_mugwort").price).toBe(2);
  });

  it("대물 ×1.5, 월척 ×2.5를 Math.round로", () => {
    // (11/22 물고기 값 ×1.3 뒤) 4P → 6P, 10P · 3P → 4.5 → 5P, 7.5 → 8P · 1P(가상) → 1.5 → 2P, 2.5 → 3P · 8P → 12P, 20P · 42P → 63P, 105P
    expect([0, 1, 2].map((g) => gradedPrice(sp("f_crucian"), g as 0 | 1 | 2))).toEqual([4, 6, 10]);
    expect([0, 1, 2].map((g) => gradedPrice(sp("f_minnow"), g as 0 | 1 | 2))).toEqual([3, 5, 8]);
    expect([1, 2].map((g) => gradedPrice({ ...sp("f_minnow"), price: 1 }, g as 1 | 2))).toEqual([2, 3]);
    expect([0, 1, 2].map((g) => gradedPrice(sp("f_carp"), g as 0 | 1 | 2))).toEqual([8, 12, 20]);
    expect([0, 1, 2].map((g) => gradedPrice(sp("f_koi"), g as 0 | 1 | 2))).toEqual([42, 63, 105]);
  });

  it("물고기 팔기 설명(lib/economy)에 등급 배수 한 줄이 그대로 들어 있다", () => {
    expect(EARN_RULES.find((r) => r.source === "fish")!.note).toContain(GRADE_PRICE_NOTE);
  });
});

describe("종 단위로 꺼내기 (의뢰 납품 — 보통 → 대물 → 월척)", () => {
  const bag = { f_carp: 1, "f_carp~1": 2, "f_carp~2": 1, h_mugwort: 3 };

  it("speciesBag: 등급 칸을 종으로 합친다", () => {
    expect(speciesBag(bag)).toEqual({ f_carp: 4, h_mugwort: 3 });
  });

  it("takePlan: 보통부터, 모자라면 null", () => {
    expect(takePlan(bag, { f_carp: 1 })).toEqual({ f_carp: 1 });
    expect(takePlan(bag, { f_carp: 2 })).toEqual({ f_carp: 1, "f_carp~1": 1 });
    expect(takePlan(bag, { f_carp: 4, h_mugwort: 2 })).toEqual({ f_carp: 1, "f_carp~1": 2, "f_carp~2": 1, h_mugwort: 2 });
    expect(takePlan(bag, { f_carp: 5 })).toBeNull();
    expect(takePlan({ "f_carp~2": 2 }, { f_carp: 1 })).toEqual({ "f_carp~2": 1 });
    expect(takePlan(bag, { f_koi: 1 })).toBeNull();
  });
});
