import { describe, expect, it } from "vitest";
import { ITEMS, MUNGNYANG_PETS, PET_FALLBACK, ZOO_PETS, isRideablePet, isShopListed, itemById, lookWithPetFallback, mungnyangPetPrice, permanentPrice, petPrice, sanitizeLook } from "./index";

// 11/19 멍냥 분양소 품종 펫 12종 (고양이 6 · 강아지 6): 잡화점·동물원 사육사 목록에 없고 분양소에서만 영구로 산다.

const CATS = ["pet_cheese", "pet_godeung", "pet_tuxedo", "pet_calico", "pet_russian", "pet_siamese"];
const IDS = ["pet_cheese", "pet_godeung", "pet_tuxedo", "pet_calico", "pet_russian", "pet_siamese", "pet_shiba", "pet_jindo", "pet_corgi", "pet_pom", "pet_bichon", "pet_dachs"];

describe("11/19 멍냥 분양소 품종 펫", () => {
  it("12종 모두 펫 부위 꾸미기이고 분양소 전용 표시가 있다 (시안 값 그대로)", () => {
    expect(ITEMS.filter((i) => i.petShop).map((i) => i.id).sort()).toEqual([...IDS].sort());
    const price: Record<string, number> = { pet_cheese: 1700, pet_godeung: 1700, pet_tuxedo: 1900, pet_calico: 2200, pet_russian: 2200, pet_siamese: 2200, pet_shiba: 2000, pet_jindo: 2000, pet_corgi: 2200, pet_pom: 1900, pet_bichon: 2000, pet_dachs: 1900 };
    for (const id of IDS) {
      const it = itemById(id)!;
      expect([it.kind, it.slot, it.petShop], id).toEqual(["cosmetic", "pet", "mungnyang"]);
      expect(it.price, id).toBe(price[id]);
      expect(it.name.length, id).toBeGreaterThan(0);
      expect(it.desc.endsWith("요.") || it.desc.endsWith("!") || it.desc.endsWith("."), id).toBe(true);
    }
  });

  it("잡화점·동물원 사육사에서는 못 사고, 분양소에서 영구로만 (하루권 없음 — 동물원 펫과 같은 규칙)", () => {
    for (const id of IDS) {
      const it = itemById(id)!;
      expect(isShopListed(it), id).toBe(false);
      expect(petPrice(id), id).toBeNull();
      expect(ZOO_PETS.some((p) => p.id === id), id).toBe(false);
      expect(permanentPrice(id), id).toBeNull();
      expect(mungnyangPetPrice(id), id).toBe(it.price);
      expect(isRideablePet(id), id).toBe(false);
    }
    expect(MUNGNYANG_PETS.map((p) => p.id).sort()).toEqual([...IDS].sort());
    // 싼 것부터
    const prices = MUNGNYANG_PETS.map((p) => p.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(mungnyangPetPrice("pet_cat")).toBeNull();
  });

  it("id는 착용 증서 옛 한도 계산의 펫 부위 가장 긴 id(sc_snowduck, 11자)보다 길지 않다", () => {
    for (const id of IDS) expect(id.length, id).toBeLessThanOrEqual("sc_snowduck".length);
  });

  it("옛 화면: 고양이는 사무실 고양이, 강아지는 퇴근 강아지로 보이고, 실시간 서버 검증을 통과한다", () => {
    for (const id of IDS) {
      expect(PET_FALLBACK[id], id).toBe(CATS.includes(id) ? "pet_cat" : "pet_dog");
      expect(sanitizeLook(["hat_crown", id])).toEqual(["hat_crown", id]);
      expect(lookWithPetFallback([id])).toEqual([id, PET_FALLBACK[id]]);
    }
  });
});
