import { describe, expect, it } from "vitest";
import { ITEMS, PERMANENT_MULTIPLIER, PERMANENT_UNTIL, withDyeSpecial } from "@tomb/protocol";
import { bodyLookScore, DYE_SPECIAL_BONUS, itemLookScore, itemLookValue, LOOK_SCORE_DIVISOR, lookScore, topParts, valueScore } from "./lookScore";

// 꾸미기 점수: 지금 입은(만료 전) 코디 파츠의 가치 비례 점수 합 + 프리미엄 외형 + 특수 염색 보너스

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe("가치 비례 점수 (영구 소장 기준 가치 ÷ 5, 1점 단위)", () => {
  it("값이 조금만 달라도 점수가 달라진다", () => {
    expect(LOOK_SCORE_DIVISOR).toBe(5);
    expect([0, -10, 480, 482, 483, 500, 5000].map(valueScore)).toEqual([0, 0, 96, 96, 97, 100, 1000]);
  });

  it("코디 = 이용권 값 × 영구 배수, 펫 = 동물원 가격, 운영자 전용·모르는 아이템은 0", () => {
    expect(PERMANENT_MULTIPLIER).toBe(4);
    expect(itemLookScore("hand_lantern")).toBe(96); // 120P × 4 = 480P
    expect(itemLookScore("neck_scarf")).toBe(48); // 60P × 4 = 240P
    expect(itemLookScore("hat_halo")).toBe(128); // 160P × 4 = 640P
    expect(itemLookScore("back_wings_dragon")).toBe(384); // 480P × 4
    expect(itemLookScore("pet_duck")).toBe(90); // 동물원 450P
    expect(itemLookScore("pet_cat")).toBe(180); // 900P
    expect(itemLookScore("pet_deer")).toBe(600); // 3,000P
    expect(itemLookScore("staff_crown")).toBe(0);
    expect(itemLookScore("fw_small")).toBe(0);
    expect(itemLookScore("nope")).toBe(0);
    // 운영자 전용이 아닌 모든 코디는 1점 이상, 공식 그대로
    for (const it of ITEMS)
      if (it.kind === "cosmetic" && !it.staff) {
        expect(itemLookScore(it.id)).toBeGreaterThan(0);
        expect(itemLookScore(it.id)).toBe(Math.round(itemLookValue(it.id) / LOOK_SCORE_DIVISOR));
      }
  });

  it("착용 파츠 합 + 프리미엄 외형(선택권 값) + 특수 염색 부위마다 +10", () => {
    const equipped = [
      { itemId: "hat_halo", until: NOW + HOUR },
      { itemId: "pet_cat", until: PERMANENT_UNTIL },
    ];
    expect(lookScore({ equipped }, NOW)).toBe(128 + 180);
    expect(bodyLookScore("king")).toBe(1000); // 전설 외형 5,000P
    expect(bodyLookScore("suit")).toBe(240); // 일반 외형 1,200P
    expect(bodyLookScore("hood")).toBe(0); // 처음 6종은 0
    expect(lookScore({ equipped, body: "king" }, NOW)).toBe(308 + 1000);
    expect(lookScore({ equipped, dye: { head: withDyeSpecial("#ff0000", "g"), body: "#00ff00", accent: withDyeSpecial("#0000ff", "r") } }, NOW)).toBe(308 + 2 * DYE_SPECIAL_BONUS);
    expect(DYE_SPECIAL_BONUS).toBe(10);
    expect(topParts({ equipped }, NOW)).toEqual(["pet_cat", "hat_halo"]);
  });
});

describe("기간제가 끝나면 점수도 사라진다", () => {
  it("만료 시각이 지난 파츠는 0점, 다 끝나면 0", () => {
    const equipped = [
      { itemId: "hat_crown", until: NOW + HOUR },
      { itemId: "neck_scarf", until: NOW + 2 * HOUR },
    ];
    expect(lookScore({ equipped }, NOW)).toBe(384 + 48);
    expect(lookScore({ equipped }, NOW + HOUR)).toBe(48);
    expect(lookScore({ equipped }, NOW + 2 * HOUR)).toBe(0);
    expect(topParts({ equipped }, NOW + 2 * HOUR)).toEqual([]);
  });

  it("같은 부위는 하나만 센다", () => {
    const equipped = [
      { itemId: "hat_crown", until: NOW + HOUR },
      { itemId: "hat_cat", until: NOW + HOUR },
    ];
    expect(lookScore({ equipped }, NOW)).toBe(384);
  });
});
