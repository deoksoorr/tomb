import { describe, expect, it } from "vitest";
import { ITEMS, PERMANENT_UNTIL, withDyeSpecial } from "@tomb/protocol";
import { itemLookScore, lookScore, priceScore, topParts } from "./lookScore";

// 꾸미기 점수: 지금 입은(만료 전) 코디 파츠의 기본 가격대 점수 합 + 프리미엄 외형 + 특수 염색 보너스

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

describe("가격대 점수", () => {
  it("기본(24시간) 가격 구간마다 점수가 오른다", () => {
    expect([0, 60, 100, 101, 200, 320, 400, 480, 800, 900, 1500, 2000, 3000, 3200, 4500, 5000].map(priceScore)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 5, 5, 8, 8, 12, 12, 16, 16, 20,
    ]);
  });

  it("파츠 점수: 기본 가격 기준(영구가와 무관), 펫은 동물원 가격, 운영자 전용·모르는 아이템은 0", () => {
    expect(itemLookScore("neck_scarf")).toBe(1); // 60P
    expect(itemLookScore("hat_halo")).toBe(2); // 160P (영구 소장 가능 — 점수는 같다)
    expect(itemLookScore("back_wings_dragon")).toBe(5); // 480P
    expect(itemLookScore("pet_duck")).toBe(5); // 450P
    expect(itemLookScore("pet_cat")).toBe(8); // 900P
    expect(itemLookScore("pet_deer")).toBe(12); // 3,000P
    expect(itemLookScore("staff_crown")).toBe(0);
    expect(itemLookScore("fw_small")).toBe(0);
    expect(itemLookScore("nope")).toBe(0);
    // 운영자 전용이 아닌 모든 코디는 1점 이상
    for (const it of ITEMS) if (it.kind === "cosmetic" && !it.staff) expect(itemLookScore(it.id)).toBeGreaterThan(0);
  });

  it("착용 파츠 합 + 프리미엄 외형 + 특수 염색 부위마다 +1", () => {
    const equipped = [
      { itemId: "hat_halo", until: NOW + HOUR },
      { itemId: "pet_cat", until: PERMANENT_UNTIL },
    ];
    expect(lookScore({ equipped }, NOW)).toBe(2 + 8);
    expect(lookScore({ equipped, body: "king" }, NOW)).toBe(10 + 20); // 전설 외형 5,000P
    expect(lookScore({ equipped, body: "hood" }, NOW)).toBe(10); // 처음 6종은 0
    expect(lookScore({ equipped, dye: { head: withDyeSpecial("#ff0000", "g"), body: "#00ff00", accent: withDyeSpecial("#0000ff", "r") } }, NOW)).toBe(12);
    expect(topParts({ equipped }, NOW)).toEqual(["pet_cat", "hat_halo"]);
  });
});

describe("기간제가 끝나면 점수도 사라진다", () => {
  it("만료 시각이 지난 파츠는 0점, 다 끝나면 0", () => {
    const equipped = [
      { itemId: "hat_crown", until: NOW + HOUR },
      { itemId: "neck_scarf", until: NOW + 2 * HOUR },
    ];
    expect(lookScore({ equipped }, NOW)).toBe(5 + 1);
    expect(lookScore({ equipped }, NOW + HOUR)).toBe(1);
    expect(lookScore({ equipped }, NOW + 2 * HOUR)).toBe(0);
    expect(topParts({ equipped }, NOW + 2 * HOUR)).toEqual([]);
  });

  it("같은 부위는 하나만 센다", () => {
    const equipped = [
      { itemId: "hat_crown", until: NOW + HOUR },
      { itemId: "hat_cat", until: NOW + HOUR },
    ];
    expect(lookScore({ equipped }, NOW)).toBe(5);
  });
});
