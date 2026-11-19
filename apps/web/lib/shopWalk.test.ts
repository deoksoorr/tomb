import { describe, expect, it } from "vitest";
import { openShopTab, takeShopTab } from "@/components/shop/shopTab";
import { SHOP_AWAY_TOAST, shopPress, shopWalkHint } from "./shopWalk";

// 11/19 외치기 창 [상점에서 사기]: 그 자리에서 상점 창이 아니라 마을 잡화점까지 걸어가서 확성기 탭으로

describe("[상점에서 사기] (lib/shopWalk)", () => {
  it("마을(바깥)에 있으면 잡화점까지 걸어간다 — 그 자리에서 상점 창을 띄우지 않는다", () => {
    expect(shopPress({ map: "village", scene: "world", riding: false })).toEqual({ do: "walk" });
    expect(shopPress({ map: "village", scene: undefined, riding: false })).toEqual({ do: "walk" });
  });
  it("이미 잡화점 안이면 바로 상점 창", () => {
    expect(shopPress({ map: "village", scene: "shop", riding: false })).toEqual({ do: "open" });
  });
  it("캠핑장·바닷가·버스·실내(집·사냥터·미니게임)에서는 안내만", () => {
    for (const map of ["camp", "sea"] as const) expect(shopPress({ map, scene: "world", riding: false })).toEqual({ do: "toast", message: SHOP_AWAY_TOAST });
    expect(shopPress({ map: "village", scene: "world", riding: true })).toEqual({ do: "toast", message: SHOP_AWAY_TOAST });
    for (const scene of ["house", "hunt", "minigame"]) expect(shopPress({ map: "village", scene, riding: false })).toEqual({ do: "toast", message: SHOP_AWAY_TOAST });
  });
  it("걷는 중 안내 (데스크톱 방향키, 터치 조이스틱)", () => {
    expect(shopWalkHint(false)).toBe("잡화점으로 가는 중… (방향키로 멈춰요)");
    expect(shopWalkHint(true)).toContain("조이스틱");
  });
  it("골라 둔 탭·물건은 상점 창이 한 번만 읽는다 (확성기 탭의 그 확성기)", () => {
    openShopTab("megaphone", "mega_all");
    expect(takeShopTab()).toEqual({ kind: "megaphone", item: "mega_all" });
    expect(takeShopTab()).toBeNull();
    openShopTab("dye");
    expect(takeShopTab()).toEqual({ kind: "dye" });
  });
});
