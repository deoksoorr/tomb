import { describe, expect, it } from "vitest";
import {
  GRAVE_AREAS,
  ITEMS,
  MAX_VALID_SPEED,
  RUN_SPEED,
  ZOO,
  ZOO_PETS,
  ZONES,
  inZoo,
  isRideablePet,
  isShopListed,
  itemById,
  parseC2S,
  permanentPrice,
  petOfLook,
  petPrice,
  ridePetOfLook,
  rideSpeed,
  sanitizeLook,
} from "./index";

// 동물원(버드나무 묘역 자리)·사육사 펫·타는 펫 공용 규칙

describe("동물원 펫 카탈로그", () => {
  it("펫 8종 이상, 모두 꾸미기 펫 부위이고 영구 가격은 입문 펫 300P 이상, 작은 집터(2,000P)보다 싸게 (I0d)", () => {
    expect(ZOO_PETS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ZOO_PETS.map((p) => p.id)).size).toBe(ZOO_PETS.length);
    for (const p of ZOO_PETS) {
      const it = itemById(p.id);
      expect(it?.kind, p.id).toBe("cosmetic");
      expect(it?.slot, p.id).toBe("pet");
      expect(p.price).toBeGreaterThanOrEqual(300);
      expect(p.price).toBeLessThan(2_000);
      expect(petPrice(p.id)).toBe(p.price);
    }
    // 카탈로그의 모든 펫은 동물원에서 판다
    for (const it of ITEMS) if (it.slot === "pet") expect(petPrice(it.id), it.id).not.toBeNull();
    // 싼 것부터
    const prices = ZOO_PETS.map((p) => p.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("타는 펫은 2~3종, 타고 달려도 서버 속도 검증 안", () => {
    const riders = ZOO_PETS.filter((p) => p.ride);
    expect(riders.length).toBeGreaterThanOrEqual(2);
    expect(riders.length).toBeLessThanOrEqual(3);
    for (const r of riders) {
      expect(isRideablePet(r.id)).toBe(true);
      expect(rideSpeed(r.id)).toBeGreaterThan(1);
      expect(RUN_SPEED * rideSpeed(r.id)).toBeLessThan(MAX_VALID_SPEED);
    }
    expect(isRideablePet("pet_cat")).toBe(false);
    expect(isRideablePet(null)).toBe(false);
    expect(rideSpeed("pet_cat")).toBe(1);
  });

  it("상점은 펫을 팔지 않는다 (기간제·영구 모두), 다른 꾸미기는 그대로", () => {
    for (const it of ITEMS) if (it.slot === "pet") expect(isShopListed(it), it.id).toBe(false);
    expect(isShopListed(itemById("hat_crown")!)).toBe(true);
    expect(permanentPrice("pet_ghost")).toBeNull();
    expect(permanentPrice("pet_cat")).toBeNull();
    expect(permanentPrice("hat_crown")).not.toBeNull();
  });

  it("한 번에 한 마리: 착용 목록에는 펫이 하나뿐 (같은 부위)", () => {
    expect(sanitizeLook(["pet_cat", "pet_deer", "hat_crown"])).toEqual(["pet_cat", "hat_crown"]);
    expect(petOfLook(["hat_crown", "pet_goose"])).toBe("pet_goose");
    expect(ridePetOfLook(["hat_crown", "pet_goose"])).toBe("pet_goose");
    expect(ridePetOfLook(["pet_cat"])).toBeNull();
    expect(petOfLook([])).toBeNull();
  });
});

describe("동물원 자리", () => {
  it("예전 버드나무 묘역 자리, 묘역과 겹치지 않고 구역 이름표가 있다", () => {
    expect(ZONES.some((z) => z.id === "zoo" && z.name === "동물원" && z.x === ZOO.x && z.y === ZOO.y)).toBe(true);
    expect(ZONES.some((z) => z.name === "버드나무 묘역")).toBe(false);
    for (const a of GRAVE_AREAS) expect(inZoo(a.aisleX, a.y0)).toBe(false);
    expect(inZoo(ZOO.x + 10, ZOO.y + 10)).toBe(true);
  });
});

describe("ride 이벤트", () => {
  it("on은 불리언만", () => {
    expect(parseC2S(JSON.stringify({ t: "ride", on: true }))).toEqual({ t: "ride", on: true });
    expect(parseC2S(JSON.stringify({ t: "ride", on: false }))).toEqual({ t: "ride", on: false });
    expect(parseC2S(JSON.stringify({ t: "ride", on: 1 }))).toBeNull();
    expect(parseC2S(JSON.stringify({ t: "ride" }))).toBeNull();
  });
});
