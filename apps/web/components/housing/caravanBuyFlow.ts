import { defaultCaravanDesign, type CaravanDesign } from "@tomb/protocol";

// 11/27 카라반 분양 두 단계 (OfficeDialog 캠핑장 언젠가 씨 창 — 순수, Phaser·React 없이 시험한다):
//  1 자리 고르기 (CampLotPicker) → 2 모델·몸통 색·차양 색 (CaravanDesignPicker) → 분양.
// 디자인은 자리와 따로 간다: 자리를 바꿔도·2단계에서 1단계로 돌아가도 고른 디자인은 그대로.
// 아직 2단계에 간 적이 없으면(design null) 디자인을 정하지 않았고, 처음 2단계로 갈 때 고른 자리의 기본 모습에서 시작한다.
// 펜션·촌캉스는 디자인 단계가 없다 (자리 → 분양).

export type CaravanBuyState = { step: 1 | 2; lot: number | null; design: CaravanDesign | null };
export type CaravanBuyAction =
  | { type: "lot"; lot: number | null }
  | { type: "next" }
  | { type: "back" }
  | { type: "design"; design: CaravanDesign };

export const CARAVAN_BUY_START: CaravanBuyState = { step: 1, lot: null, design: null };

export function caravanBuy(s: CaravanBuyState, a: CaravanBuyAction): CaravanBuyState {
  switch (a.type) {
    case "lot":
      // 자리만 바꾼다 (디자인은 손대지 않는다). 자리가 없어지면 1단계로
      return a.lot === null ? { ...s, step: 1, lot: null } : { ...s, lot: a.lot };
    case "next":
      if (s.lot === null) return s;
      return { step: 2, lot: s.lot, design: s.design ?? defaultCaravanDesign(s.lot) };
    case "back":
      return { ...s, step: 1 };
    case "design":
      return { ...s, design: a.design };
  }
}

/** 빈 자리 카드에 그릴 카라반: 고른 자리 = 고른 디자인(정했으면), 나머지 = 그 자리 기본 모습 */
export const caravanCardDesign = (s: CaravanBuyState, lot: number): CaravanDesign => (lot === s.lot && s.design ? s.design : defaultCaravanDesign(lot));

/** 분양 때 보낼 디자인 (2단계에서 정한 것 — 안 정했으면 그 자리 기본 모습) */
export const caravanBuyDesign = (s: CaravanBuyState, lot: number): CaravanDesign => s.design ?? defaultCaravanDesign(lot);
