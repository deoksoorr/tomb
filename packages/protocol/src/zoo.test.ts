import { describe, expect, it } from "vitest";
import {
  GRAVE_AREAS,
  ITEMS,
  MAX_VALID_SPEED,
  RUN_SPEED,
  ZOO,
  ZOO_PETS,
  ZONES,
  PET_FALLBACK,
  lookWithPetFallback,
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
  it("펫 8종 이상, 모두 꾸미기 펫 부위이고 영구 가격은 입문 펫 300P 이상, 11/19 값 올림 뒤 작은 펫은 작은 집터(6,000P)보다 한참 싸게 (I0d)", () => {
    expect(ZOO_PETS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(ZOO_PETS.map((p) => p.id)).size).toBe(ZOO_PETS.length);
    for (const p of ZOO_PETS) {
      const it = itemById(p.id);
      expect(it?.kind, p.id).toBe("cosmetic");
      expect(it?.slot, p.id).toBe("pet");
      expect(p.price).toBeGreaterThanOrEqual(300);
      // 11/19 타는 펫은 집과 함께 엔드 콘텐츠(6,000~9,000P), 나머지 펫은 2,500P 미만
      expect(p.price).toBeLessThan(p.ride ? 10_000 : 2_500);
      expect(petPrice(p.id)).toBe(p.price);
    }
    // 카탈로그의 모든 펫은 동물원에서 판다 (11/15 수집 의뢰 보상 펫은 도장 교환소에서만 — 동물원에 없다)
    for (const it of ITEMS)
      if (it.slot === "pet") {
        // 12월 크리스마스 꼬마 루돌프도 선물상자에서만
        // 11/19 계절 한정 꼬마 눈오리는 계절 보따리상에서만 (값은 seasonPrice)
        // 11/19 멍냥 분양소 품종 펫도 분양소에서만 (값은 mungnyangPetPrice — breedPets.test.ts)
        if (it.quest || it.event || it.seasonSet || it.petShop) expect(petPrice(it.id), it.id).toBeNull();
        else expect(petPrice(it.id), it.id).not.toBeNull();
      }
    // 싼 것부터
    const prices = ZOO_PETS.map((p) => p.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("타는 펫은 2~5종 (11/17 알파카·북극곰), 타고 달려도 서버 속도 검증 안", () => {
    const riders = ZOO_PETS.filter((p) => p.ride);
    expect(riders.length).toBeGreaterThanOrEqual(2);
    expect(riders.length).toBeLessThanOrEqual(5);
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

describe("11/17 동물원 새 펫 묶음", () => {
  const NEW = ["pet_hog", "pet_ducks", "pet_gull", "pet_jelly", "pet_snowy", "pet_fly", "pet_otter", "pet_panda", "pet_paca", "pet_polar"];

  it("새 펫 10종: 데리고 다니는 펫 8 · 타는 펫 2, 기존 가격대 안, 새 타는 펫은 가장 빠른 사슴(1.35)보다 빠르지 않다", () => {
    for (const id of NEW) {
      expect(itemById(id)?.slot, id).toBe("pet");
      const p = ZOO_PETS.find((z) => z.id === id)!;
      expect(itemById(id)!.price, id).toBe(p.price);
      if (p.ride) {
        expect(p.price).toBeGreaterThanOrEqual(6000);
        expect(p.price).toBeLessThanOrEqual(9000);
        expect(rideSpeed(id)).toBeLessThanOrEqual(rideSpeed("pet_deer"));
      } else {
        expect(p.price).toBeGreaterThanOrEqual(900);
        expect(p.price).toBeLessThanOrEqual(2400);
      }
      // 착용 증서 길이 (옛 실시간 서버 한도) 때문에 기존 펫 id보다 길지 않게
      expect(id.length, id).toBeLessThanOrEqual(9);
    }
    expect(NEW.filter((id) => isRideablePet(id))).toEqual(["pet_paca", "pet_polar"]);
    expect(Math.max(...ZOO_PETS.map((p) => p.ride?.speed ?? 1))).toBe(1.35);
  });

  it("옛 화면용 비슷한 펫: 새 펫마다 있고, 옛 펫(그림자 유령 제외)이며 타는 펫은 타는 펫으로", () => {
    const BREEDS = ITEMS.filter((i) => i.petShop).map((i) => i.id); // 11/19 멍냥 분양소 품종 펫 (breedPets.test.ts)
    expect(Object.keys(PET_FALLBACK).sort()).toEqual([...NEW, "xm_sleigh", "sc_snowduck", "gk_owl", "sm_magpie", "sp_bee", "ye_raccoon", "su_goat", "ic_penguin", "fr_snowbun", ...BREEDS].sort());
    for (const [id, fb] of Object.entries(PET_FALLBACK)) {
      expect(NEW.includes(fb), fb).toBe(false);
      expect(fb).not.toBe("pet_ghost");
      expect(itemById(fb)?.slot, fb).toBe("pet");
      expect(isRideablePet(fb), id).toBe(isRideablePet(id));
    }
  });

  it("12월 루돌프 썰매: 선물상자 전용 타는 펫 (사육사·상점에 없다), 사슴보다 빠르지 않고, 옛 화면엔 사슴", () => {
    const it = itemById("xm_sleigh")!;
    expect([it.slot, it.event, isShopListed(it)]).toEqual(["pet", true, false]);
    expect(petPrice("xm_sleigh")).toBeNull();
    expect(permanentPrice("xm_sleigh")).toBeNull();
    expect(isRideablePet("xm_sleigh")).toBe(true);
    expect(rideSpeed("xm_sleigh")).toBe(1.3);
    expect(rideSpeed("xm_sleigh")).toBeLessThanOrEqual(rideSpeed("pet_deer"));
    expect(RUN_SPEED * rideSpeed("xm_sleigh")).toBeLessThan(MAX_VALID_SPEED);
    expect("xm_sleigh".length).toBeLessThanOrEqual(9);
    expect(lookWithPetFallback(["xm_sleigh"])).toEqual(["xm_sleigh", "pet_deer"]);
  });

  it("보낼 때만 칭호 앞에 덧붙이고, 새 화면이 보는 펫·타는 펫은 그대로 앞의 새 펫", () => {
    expect(lookWithPetFallback(["hat_crown", "pet_otter", "t_fish50"])).toEqual(["hat_crown", "pet_otter", "pet_cat", "t_fish50"]);
    expect(lookWithPetFallback(["pet_paca"])).toEqual(["pet_paca", "pet_deer"]);
    expect(lookWithPetFallback(["pet_cat", "hat_crown"])).toEqual(["pet_cat", "hat_crown"]);
    expect(lookWithPetFallback([])).toEqual([]);
    const sent = lookWithPetFallback(["pet_paca"]);
    expect(petOfLook(sent)).toBe("pet_paca");
    expect(ridePetOfLook(sent)).toBe("pet_paca");
    // 옛 화면(새 펫 id를 모른다)은 덧붙인 펫을 데리고 다니는 펫으로 본다
    const oldView = sent.filter((id) => !NEW.includes(id));
    expect(petOfLook(oldView)).toBe("pet_deer");
    expect(ridePetOfLook(oldView)).toBe("pet_deer");
    // 저장·검증하는 착용 목록은 한 부위 하나 그대로 (덧붙인 펫은 빠진다)
    expect(sanitizeLook(sent)).toEqual(["pet_paca"]);
  });
});
