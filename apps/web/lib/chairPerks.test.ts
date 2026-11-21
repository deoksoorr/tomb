import { describe, expect, it } from "vitest";
import { champBitsOf, SPEED_TOLERANCE } from "@tomb/protocol";
import {
  CHAIR_CHEST_SG_CHANCE,
  CHAIR_DUO_SPEED,
  CHAIR_PERK_TERM,
  chairChestChance,
  chairEnhanceDiscount,
  chairEnhanceNote,
  chairHuntExp,
  chairPerkLines,
  chairPerkName,
  chairPerkTags,
  chairPerkUntil,
  chairRunsPerDay,
  chairShopDiscount,
  chairShopNote,
  chairSpeedAdd,
  chairTranscendExp,
  isChairPerk,
  perkHuntExp,
  perkShopDiscount,
  perkTranscendExp,
} from "./chairPerks";
import { CHAIR_RUNS_PER_DAY } from "./chairman/rules";
import { champSpeedAdd, furnitureDiscount, pickDiscount } from "./champPerks";
import { weekStartMs } from "./gameDay";
import { enhanceNeed, ENHANCE_TABLE } from "./rpg/enhance";
import { SG_CHEST_CHANCE } from "./rpg/setGearRoll";
import { towerChestDrops } from "./rpg/tower";
import { discountedPrice } from "./titles";

// 11/24 회장님 독대 1위 1주일 혜택 — 값·겹침·속도 상한 (서버 흐름은 app/api/chairPerks.test, 자격·하루 판은 lib/chairman/perks.test)

describe("값", () => {
  it("노멀 1위: 꾸미기(염색권 빼고)·가구 30%, 강화 포인트 30% — 헬 1위는 할인 없음, 2관왕은 다", () => {
    expect(chairShopDiscount("normal", "shop", "cosmetic")).toBe(0.3);
    expect(chairShopDiscount("normal", "shop", "firework")).toBe(0.3);
    expect(chairShopDiscount("normal", "shop", "dye")).toBe(0);
    expect(chairShopDiscount("normal", "furniture")).toBe(0.3);
    expect(chairShopDiscount("hell", "shop", "cosmetic")).toBe(0);
    expect(chairShopDiscount("hell", "furniture")).toBe(0);
    expect(chairShopDiscount("duo", "furniture")).toBe(0.3);
    expect(chairShopDiscount(null, "furniture")).toBe(0);
    expect(chairEnhanceDiscount("normal")).toBe(0.3);
    expect(chairEnhanceDiscount("duo")).toBe(0.3);
    expect(chairEnhanceDiscount("hell")).toBe(0);
    expect(chairEnhanceDiscount(undefined)).toBe(0);
  });

  it("헬 1위: 사냥 +20% · 초월 +15% · 상자 세트 장비 20% (보통 15%) — 노멀 1위는 없음, 2관왕은 다", () => {
    expect([chairHuntExp("hell"), chairTranscendExp("hell"), chairChestChance("hell")]).toEqual([0.2, 0.15, 0.2]);
    expect([chairHuntExp("duo"), chairTranscendExp("duo"), chairChestChance("duo")]).toEqual([0.2, 0.15, 0.2]);
    expect([chairHuntExp("normal"), chairTranscendExp("normal"), chairChestChance("normal")]).toEqual([0, 0, SG_CHEST_CHANCE]);
    expect(chairChestChance(null)).toBe(0.15);
  });

  it("2관왕만: 걷기 +2% · 하루 판 모드마다 3 (나머지는 2)", () => {
    expect(chairSpeedAdd("duo")).toBe(0.02);
    expect(chairSpeedAdd("normal") + chairSpeedAdd("hell") + chairSpeedAdd(null)).toBe(0);
    expect(chairRunsPerDay("duo")).toBe(3);
    expect([chairRunsPerDay("normal"), chairRunsPerDay("hell"), chairRunsPerDay(null)]).toEqual([CHAIR_RUNS_PER_DAY, CHAIR_RUNS_PER_DAY, CHAIR_RUNS_PER_DAY]);
    expect(CHAIR_RUNS_PER_DAY).toBe(2);
  });

  it("isChairPerk · 칭호 이름", () => {
    expect(["normal", "hell", "duo", "x", null, 1].map(isChairPerk)).toEqual([true, true, true, false, false, false]);
    expect([chairPerkName("normal"), chairPerkName("hell"), chairPerkName("duo"), chairPerkName(null)]).toEqual(["연봉 협상의 신", "맨주먹 협상가", "차기 회장", null]);
  });

  it("끝나는 때 = 이번 회장님 독대 주 정산 (다음 월요일 새벽 5시)", () => {
    const t = weekStartMs("20261130") + 3 * 86_400_000;
    expect(chairPerkUntil(t)).toBe(weekStartMs("20261207"));
  });
});

describe("겹침", () => {
  it("할인은 가장 큰 하나만: 포인트왕 20% · 칭호 8% · 노멀 1위 30% → 30% (더하지 않는다)", () => {
    expect(perkShopDiscount(["points"], "normal", "shop", "cosmetic")).toBe(0.3);
    expect(pickDiscount(0.08, perkShopDiscount(["points"], "normal", "shop", "cosmetic"))).toBe(0.3);
    expect(perkShopDiscount(["points"], "hell", "shop", "cosmetic")).toBe(0.2);
    expect(perkShopDiscount([], null, "furniture")).toBe(0);
    // 유령선 특가가 더 크면 그것 하나
    expect(pickDiscount(0.4, 0.08, perkShopDiscount(["points"], "duo", "furniture"))).toBe(0.4);
    // 화면 가구 할인 (집 칭호 · 포인트왕 · 노멀 1위 중 큰 것)
    expect(furnitureDiscount(0.05, champBitsOf(["points"]), chairShopDiscount("normal", "furniture"))).toBe(0.3);
    expect(furnitureDiscount(0.05, champBitsOf(["points"]))).toBe(0.2);
    expect(discountedPrice(1000, perkShopDiscount(["points"], "normal", "shop", "cosmetic"))).toBe(700);
    // 염색권은 둘 다 원가
    expect(perkShopDiscount(["points"], "duo", "shop", "dye")).toBe(0);
  });

  it("경험치는 사냥왕(15%·10%)과 더하지 않고 큰 쪽 하나 — 몫을 준 이름도", () => {
    expect(perkHuntExp(["huntKills"], "hell")).toEqual({
      rate: 0.2,
      by: "맨주먹 협상가",
    });
    expect(perkTranscendExp(["huntKills"], "hell")).toEqual({
      rate: 0.15,
      by: "맨주먹 협상가",
    });
    expect(perkHuntExp(["huntKills"], "duo")).toEqual({
      rate: 0.2,
      by: "차기 회장",
    });
    expect(perkHuntExp(["huntKills"], "normal")).toEqual({
      rate: 0.15,
      by: "사냥왕",
    });
    expect(perkTranscendExp(["huntKills"], null)).toEqual({
      rate: 0.1,
      by: "사냥왕",
    });
    expect(perkHuntExp([], "hell")).toEqual({ rate: 0.2, by: "맨주먹 협상가" });
    expect(perkHuntExp(["points"], "normal")).toEqual({ rate: 0, by: null });
  });

  it("걷기: 레이스 다관왕 +1%와 같은 자리에 더한다 — 가장 빠른 칭호·펫이면 MAX_GROUND_MUL 1.48에서 멈추고, 실시간 서버 1.5 안", () => {
    const MAX_GROUND_MUL = 1.48; // game/entities/Player (Phaser라 여기서 읽지 않는다)
    const FASTEST_TITLE = 1.08; // 신화 1.06 + 1위·명예 갈래 0.02
    const FASTEST_PET = 1.35;
    const slot = FASTEST_TITLE + champSpeedAdd(champBitsOf(["points", "huntKills"])) + chairSpeedAdd("duo");
    expect(slot).toBeCloseTo(1.11, 10);
    // 그대로 곱하면 1.4985 > 1.48 → 화면 상한이 자른다 (서버 검증 SPEED_TOLERANCE 1.5 안)
    expect(FASTEST_PET * slot).toBeGreaterThan(MAX_GROUND_MUL);
    expect(FASTEST_PET * slot).toBeLessThan(SPEED_TOLERANCE);
    expect(Math.min(MAX_GROUND_MUL, FASTEST_PET * slot)).toBe(1.48);
    expect(MAX_GROUND_MUL).toBeLessThan(SPEED_TOLERANCE);
    // 펫 없이는 다 받는다
    expect(Math.min(MAX_GROUND_MUL, slot)).toBeCloseTo(1.11, 10);
    expect(CHAIR_DUO_SPEED).toBe(0.02);
  });
});

describe("계산 경로", () => {
  it("강화 비용: 포인트만 30% (1P 단위 내림), 재료·단계는 그대로", () => {
    for (const e of [0, 4, 9, 14]) {
      const base = enhanceNeed({ sg: 1 }, e)!;
      const off = enhanceNeed({ sg: 1 }, e, chairEnhanceDiscount("normal"))!;
      expect(off).toEqual({
        ...base,
        cost: discountedPrice(ENHANCE_TABLE[e + 1].cost, 0.3),
      });
      expect(enhanceNeed({ sg: 1 }, e, chairEnhanceDiscount("hell"))).toEqual(base);
    }
    expect(enhanceNeed({ sg: 1 }, 0, 0.3)!.cost).toBe(70);
  });

  it("상자 굴림: 같은 시드에서 20%는 15%보다 세트 장비가 같거나 많고, 대략 20%로 나온다", () => {
    let hit15 = 0;
    let hit20 = 0;
    const N = 4000;
    for (let seed = 1; seed <= N; seed++) {
      const a = towerChestDrops(seed, 60, 51, 0, false).some((d) => d.kind === "set");
      const b = towerChestDrops(seed, 60, 51, 0, false, CHAIR_CHEST_SG_CHANCE).some((d) => d.kind === "set");
      if (a) expect(b).toBe(true);
      hit15 += a ? 1 : 0;
      hit20 += b ? 1 : 0;
    }
    expect(hit15 / N).toBeGreaterThan(0.12);
    expect(hit15 / N).toBeLessThan(0.18);
    expect(hit20 / N).toBeGreaterThan(0.17);
    expect(hit20 / N).toBeLessThan(0.23);
  });
});

describe("화면 문구", () => {
  it("카드 꼬리표 · 기간 · 혜택 문장", () => {
    expect(chairPerkTags("normal")).toEqual(["꾸미기와 가구 30% 할인", "장비 강화 포인트 30% 할인"]);
    expect(chairPerkTags("hell")).toEqual(["사냥 경험치 +20%", "초월 경험치 +15%", "상자 세트 장비 20%"]);
    expect(chairPerkTags("duo")).toEqual(["노멀과 헬 1위 혜택 모두", "마을 걷기 +2%", "독대 하루 3판씩"]);
    expect(CHAIR_PERK_TERM).toBe("다음 1위가 정해질 때까지 1주일");
    expect(chairPerkLines(null)).toEqual([]);
    expect(chairPerkLines("normal")).toHaveLength(2);
    expect(chairPerkLines("hell")).toHaveLength(3);
    expect(chairPerkLines("duo")).toEqual([...chairPerkLines("normal"), ...chairPerkLines("hell"), "마을에서 2% 더 빨리 걸어요.", "회장님 독대를 하루 노멀 3판, 헬 3판 해요."]);
    // 짧은 해요체 — 「A · B」 사슬·「라벨: 설명」 없음
    for (const line of [...chairPerkLines("duo"), ...chairPerkTags("duo")]) {
      expect(line).not.toMatch(/ · |: /);
    }
    expect(chairShopNote("normal")).toBe("「연봉 협상의 신」 혜택으로 30% 싸게 사요.");
    expect(chairShopNote("hell")).toBe("");
    expect(chairEnhanceNote("duo")).toBe("「차기 회장」 혜택으로 강화 포인트가 30% 덜 들어요.");
  });
});
