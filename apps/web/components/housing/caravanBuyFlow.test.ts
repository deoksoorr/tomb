import { defaultCaravanDesign } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { CARAVAN_BUY_START, caravanBuy, caravanCardDesign } from "./caravanBuyFlow";

// 11/27 카라반 분양 두 단계 (1 자리 고르기 → 2 모델·몸통 색·차양 색 → 분양). 디자인은 자리와 따로 — 자리를 바꿔도 디자인은 그대로

describe("카라반 분양 순서", () => {
  it("1단계: 자리를 바꿔도 디자인을 정하지 않는다 (카드는 그 자리 기본 모습)", () => {
    let s = caravanBuy(CARAVAN_BUY_START, { type: "lot", lot: 2 });
    s = caravanBuy(s, { type: "lot", lot: 4 });
    expect(s).toEqual({ step: 1, lot: 4, design: null });
    expect(caravanCardDesign(s, 4)).toEqual(defaultCaravanDesign(4));
  });

  it("자리 없이는 2단계로 못 간다", () => {
    expect(caravanBuy(CARAVAN_BUY_START, { type: "next" })).toEqual(CARAVAN_BUY_START);
  });

  it("2단계로 가면 고른 자리의 기본 모습에서 시작하고, 고른 디자인은 자리를 바꿔도·되돌아가도 그대로", () => {
    let s = caravanBuy(CARAVAN_BUY_START, { type: "lot", lot: 2 });
    s = caravanBuy(s, { type: "next" });
    expect(s).toEqual({ step: 2, lot: 2, design: defaultCaravanDesign(2) });
    const mine = { model: "bus", color: 1, awning: 3 } as const;
    s = caravanBuy(s, { type: "design", design: mine });
    s = caravanBuy(s, { type: "back" });
    expect(s).toEqual({ step: 1, lot: 2, design: mine });
    s = caravanBuy(s, { type: "lot", lot: 4 });
    expect(s.design).toEqual(mine);
    // 고른 디자인은 고른 자리 카드에 그대로 보인다 (다른 빈 자리 카드는 기본 모습)
    expect(caravanCardDesign(s, 4)).toEqual(mine);
    expect(caravanCardDesign(s, 7)).toEqual(defaultCaravanDesign(7));
    s = caravanBuy(s, { type: "next" });
    expect(s).toEqual({ step: 2, lot: 4, design: mine });
  });

  it("고른 자리가 막 분양되어 사라지면(lot null) 1단계로", () => {
    let s = caravanBuy(CARAVAN_BUY_START, { type: "lot", lot: 2 });
    s = caravanBuy(s, { type: "next" });
    s = caravanBuy(s, { type: "lot", lot: null });
    expect(s.step).toBe(1);
    expect(s.design).toEqual(defaultCaravanDesign(2));
  });
});
