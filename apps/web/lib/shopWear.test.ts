import { describe, expect, it } from "vitest";
import { isDyeableCosmetic, isShopListed, itemById, PERMANENT_MULTIPLIER, permanentPrice, seasonSetsOfLook, wornDyeItems } from "@tomb/protocol";
import { SHOP_COSMETICS, shopCosmetics, slotCounts } from "../components/account/wardrobe";
import { itemLookScore } from "./lookScore";
import { RESELL_GIFT_BLOCK, resellBlock, resellKindBlock, resellPrice } from "./resell";

// 11/22 잡화점 「옷」 다섯 벌: 일반 상점 규칙(진열·옷 칸 필터·24시간/영구 ×4·꾸미기 점수·되팔기 30%·염색)이 따로 손대지 않아도 따라온다

const IDS = ["wr_shirt", "wr_puffer", "wr_robe", "wr_apron", "wr_coat"];
const PRICES = [140, 200, 180, 120, 220];
const PERM = 9_999_999_999_999;

describe("잡화점 옷 다섯 벌", () => {
  it("잡화점 진열: 옷 칸 필터에 다섯 벌이 카탈로그 순서로, 칸 수 5", () => {
    expect(shopCosmetics("back").map((i) => i.id)).toEqual(IDS);
    expect(slotCounts(SHOP_COSMETICS).back).toBe(5);
    for (const id of IDS) expect(isShopListed(itemById(id)!), id).toBe(true);
  });

  it("값: 24시간 이용권 = 시안 값, 영구 = ×4 (10P 단위)", () => {
    IDS.forEach((id, k) => {
      expect(itemById(id)!.price, id).toBe(PRICES[k]);
      expect(itemById(id)!.durationMs, id).toBe(86_400_000);
      expect(permanentPrice(id), id).toBe(Math.round((PRICES[k] * PERMANENT_MULTIPLIER) / 10) * 10);
    });
  });

  it("꾸미기 점수가 붙고, 계절 세트 판정에는 걸리지 않는다", () => {
    for (const id of IDS) expect(itemLookScore(id), id).toBeGreaterThan(0);
    expect(seasonSetsOfLook(IDS)).toEqual([]);
    expect(seasonSetsOfLook(["wr_coat", "kd_beanie", "kd_muffler", "kd_bungeo", "kd_lights"])).toEqual([]);
  });

  it("되팔기: 영구로 산 것만 정가의 30% (내림), 선물·기간제·입은 것은 못 판다", () => {
    for (const id of IDS) {
      expect(resellKindBlock(id), id).toBeNull();
      expect(resellPrice(id), id).toBe(Math.floor(permanentPrice(id)! * 0.3));
      expect(resellBlock(id, "stash", PERM, [id]), id).toBeNull();
      expect(resellBlock(id, "stash", PERM, []), id).toBe(RESELL_GIFT_BLOCK);
      expect(resellBlock(id, "stash", Date.now() + 1000, [id]), id).not.toBeNull();
      expect(resellBlock(id, "worn", PERM, [id]), id).not.toBeNull();
    }
    expect(resellPrice("wr_puffer")).toBe(240);
  });

  it("염색: 옷 칸 꾸미기로 기본 염색 가능, 등 칸과 따로 칸을 차지한다", () => {
    for (const id of IDS) expect(isDyeableCosmetic(id), id).toBe(true);
    expect(wornDyeItems(["hat_beanie", "wr_robe", "back_cape"]).map((w) => [w.slot, w.id])).toEqual([
      ["head", "hat_beanie"],
      ["back", "wr_robe"],
      ["pack", "back_cape"],
    ]);
  });
});
