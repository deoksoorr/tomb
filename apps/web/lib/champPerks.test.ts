import { describe, expect, it } from "vitest";
import { champBitsOf, CHAMP_AURA_OFF } from "@tomb/protocol";
import {
  champBoardPerkLines,
  champBoardPerkTags,
  champPerkHead,
  champPerkLines,
  champShopDiscount,
  champSpeedAdd,
  champUntilText,
  earnTerms,
  furnitureDiscount,
  pickDiscount,
} from "./champPerks";
import { NO_LIMIT } from "./economy";
import { NO_BOOST, type EarnBoost } from "./pointEvent";
import { discountedPrice } from "./titles";

const ev = (mult: number, ...sources: EarnBoost["on"]): EarnBoost => ({ mult, on: sources, caps: sources });

describe("1위 혜택 — 11/19 포인트 혜택 없음", () => {
  it("1위여도 적립 배수·한도는 이벤트 배수 그대로 (낚시왕 판매 +20%·한도 +150 등이 없다)", () => {
    expect(earnTerms(NO_BOOST, "fish", ["fish"])).toEqual(earnTerms(NO_BOOST, "fish"));
    expect(earnTerms(NO_BOOST, "fish", ["fish"])).toEqual({ m100: 100, dailyMax: NO_LIMIT });
    expect(earnTerms(ev(2, "fish"), "fish", ["fish"])).toEqual({ m100: 200, dailyMax: NO_LIMIT });
    expect(earnTerms(NO_BOOST, "hunt", ["huntKills"])).toEqual({ m100: 100, dailyMax: NO_LIMIT });
    expect(earnTerms(NO_BOOST, "presence", ["points"])).toEqual({ m100: 100, dailyMax: NO_LIMIT });
    expect(earnTerms(NO_BOOST, "stayBonus", ["points"])).toEqual({ m100: 100, dailyMax: NO_LIMIT });
  });

  it("혜택 문구에 한도 말이 없다 (11/23 낚시왕은 물고기 판매 +15%만, 포인트 레이스 제외)", () => {
    for (const b of ["points", "huntKills", "fish"] as const) for (const l of [...champBoardPerkLines(b), ...champBoardPerkTags(b)]) expect(l).not.toMatch(/한도|포인트를|머무르기|접속 보너스/);
    expect(champBoardPerkLines("fish")).toEqual(["물고기를 15% 더 비싸게 팔아요. 더 받은 포인트는 포인트 레이스에 들어가지 않아요."]);
  });
});

describe("1위 혜택 — 할인 (가장 큰 것 하나만)", () => {
  it("포인트왕은 꾸미기 상점·가구 상점만 20%, 염색권은 빠진다", () => {
    expect(champShopDiscount(["points"], "shop", "cosmetic")).toBe(0.2);
    expect(champShopDiscount(["points"], "shop", "firework")).toBe(0.2);
    expect(champShopDiscount(["points"], "shop", "dye")).toBe(0);
    expect(champShopDiscount(["points"], "furniture")).toBe(0.2);
    expect(champShopDiscount(["fish", "huntKills"], "shop", "cosmetic")).toBe(0);
  });

  it("칭호 할인과 겹치면 큰 할인 하나만 (더하지 않는다)", () => {
    expect(pickDiscount(0.12, champShopDiscount(["points"], "shop", "cosmetic"))).toBe(0.2);
    expect(pickDiscount(0.05, 0)).toBe(0.05);
    expect(pickDiscount()).toBe(0);
    expect(pickDiscount(undefined, null, Number.NaN, -1)).toBe(0);
    // 앞으로 생길 특가가 더 크면 그 하나 (상한 90%)
    expect(pickDiscount(0.2, 0.3)).toBe(0.3);
    expect(pickDiscount(1.5)).toBe(0.9);
    expect(discountedPrice(1000, pickDiscount(0.12, 0.2))).toBe(800);
    expect(furnitureDiscount(0.08, champBitsOf(["points"]))).toBe(0.2);
    expect(furnitureDiscount(0.08, champBitsOf(["fish"]))).toBe(0.08);
    expect(furnitureDiscount(0, undefined)).toBe(0);
  });
});

describe("1위 혜택 — 2관왕·3관왕", () => {
  it("차지한 혜택 모두 + 이동 속도 +1% (하나면 없음, 오라 끔 표시는 상관없다)", () => {
    expect(champSpeedAdd(champBitsOf(["fish"]))).toBe(0);
    expect(champSpeedAdd(champBitsOf(["points", "fish"]))).toBe(0.01);
    expect(champSpeedAdd(champBitsOf(["points", "huntKills", "fish"], true))).toBe(0.01);
    expect(champSpeedAdd(CHAMP_AURA_OFF)).toBe(0);
    expect(champSpeedAdd(undefined)).toBe(0);
    // 속도 상한: 가장 빠른 칭호 1.08 + 0.01, × 가장 빠른 타는 펫 1.35 < 화면 상한 1.48 < 서버 검증 1.5
    expect((1.08 + 0.01) * 1.35).toBeLessThan(1.48);
    const two = champPerkLines(["huntKills", "fish"]);
    expect(two).toContain("2관왕이라 마을에서 1% 더 빨리 걸어요.");
    expect(two).toContain("사냥 경험치를 15% 더 받아요.");
    const three = champPerkLines(["points", "huntKills", "fish"]);
    expect(three).toHaveLength(1 + 2 + 1 + 1);
    expect(three[three.length - 1]).toContain("3관왕");
    expect(champPerkLines(["fish"])).toHaveLength(1);
    // 문구 규칙: 「라벨: 설명」 콜론과 「A · B」 나열이 없다
    for (const l of three) expect(l).not.toMatch(/:| · /);
  });

  it("레이스 창 짧은 꼬리표는 같은 표의 숫자를 쓴다", () => {
    expect(champBoardPerkTags("huntKills")).toEqual(["사냥 경험치 +15%", "초월 경험치 +10%"]);
    expect(champBoardPerkTags("fish")).toEqual(["물고기 판매 +15%"]);
    expect(champBoardPerkTags("points")).toEqual(["꾸미기와 가구 20% 할인"]);
    for (const b of ["points", "huntKills", "fish"] as const) for (const t of champBoardPerkTags(b)) expect(t).not.toMatch(/:| · /);
  });
});

describe("1위 혜택 — 끝나는 시각 문구", () => {
  it("실제 다음 마감(월요일 새벽 5시, 한국 시간)을 날짜로", () => {
    const end = Date.UTC(2026, 10, 22, 20, 0); // 11/23(월) 05:00 KST
    expect(champUntilText(end)).toBe("11월 23일 새벽 5시");
    expect(champPerkHead(champBitsOf(["huntKills"]), end)).toBe("지난주 사냥왕 혜택이 11월 23일 새벽 5시까지 붙어 있어요.");
    expect(champPerkHead(champBitsOf(["points", "fish"]), end)).toBe("지난주 포인트왕과 낚시왕 혜택이 11월 23일 새벽 5시까지 붙어 있어요.");
    expect(champPerkHead(champBitsOf(["points", "huntKills", "fish"]), end)).toContain("포인트왕, 사냥왕, 낚시왕 혜택이");
    expect(champPerkHead(0, end)).toBe("");
    // 시험 1위처럼 분이 있는 끝
    expect(champUntilText(Date.UTC(2026, 10, 17, 6, 30))).toBe("11월 17일 오후 3시 30분");
  });
});
