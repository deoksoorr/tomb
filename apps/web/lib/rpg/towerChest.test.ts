import { describe, expect, it } from "vitest";
import { potionById } from "./catalog";
import { potionSaleValue, sellValue, unpaidPotions } from "./character";
import { isChestFloor, NO_POTION_FROM, splitChestPotions, TOWER_CHEST_FROM, TOWER_CHESTS_PER_DAY, towerChestDrops, towerChestFloors, towerSellsPotions, towerSettle, type TowerState } from "./tower";

// 11/15 우두머리 상자: 게임이 판 안에서 여는 상자(층·순서·드롭)와 서버가 판 끝에 주는 상자가 같다

const DAY = "20261116";
const WEEK = "2026-W46";
const base: TowerState = { fBest: 0, fBestMs: 0, fWkBest: 0, fWkMs: 0, tRuns: 0, tBank: 0, tFl: 0, tChest: 0 };

describe("우두머리 상자 (게임 ↔ 서버)", () => {
  it("여는 층: 오늘 연 수 다음부터 하루 한도까지, 서버 정산과 같다", () => {
    for (const start of [1, 11, 21, 51])
      for (let floors = 0; floors <= 40; floors += 3)
        for (const used of [0, 3, 13, 14, 500]) {
          const st = towerSettle({ ...base, tDay: DAY, tChest: used }, { day: DAY, week: WEEK, start, floors, floorMs: floors * 50_000 });
          expect(towerChestFloors(start, floors, used), `${start}층부터 ${floors}층, 오늘 ${used}개`).toEqual(st.chests);
        }
    // 11/15 하루 한도 없음: 아무리 많이 열었어도 우두머리 층마다 · 11/19 상자는 50층부터
    const range = (a: number, n: number) => Array.from({ length: n }, (_, i) => a + i);
    expect(towerChestFloors(1, TOWER_CHEST_FROM - 1, 500)).toEqual([]);
    expect(towerChestFloors(Math.max(1, TOWER_CHEST_FROM - 9), 20, 500)).toEqual(range(Math.max(1, TOWER_CHEST_FROM - 9), 20).filter(isChestFloor));
    expect(towerChestFloors(Math.max(1, TOWER_CHEST_FROM - 9), 20, 500).length).toBeGreaterThanOrEqual(2);
    expect(TOWER_CHESTS_PER_DAY).toBe(Infinity);
  });

  it("상자 드롭은 판 시드 + 층으로 정해진다 (게임이 떨군 것 = 서버가 준 것)", () => {
    for (const seed of [1, 42, 9999])
      for (const f of [5, 10, 15, 50]) {
        const a = towerChestDrops(seed, f, 1);
        expect(towerChestDrops(seed, f, 1)).toEqual(a);
      }
    // 지옥 사냥터를 다 깬 판의 드롭 굴림이라 빈 상자도 있다 (판 시드마다 다르다)
    const filled = Array.from({ length: 40 }, (_, i) => towerChestDrops(i + 1, 5, 1).length > 0).filter(Boolean).length;
    expect(filled).toBeGreaterThan(1);
    // 층마다 따로 굴린다 (빈 상자가 많아 겹칠 수 있다 — 여러 층 중 몇 개는 다르다)
    const set = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(towerChestDrops(7, (i + 1) * 5, 1))));
    expect(set.size).toBeGreaterThan(2);
  });
});

// 11/27 「탕비실 폐쇄」(60층~): 상자 물약은 가방에 넣지 않고 판 끝에 되팔기 값으로 바로 판다 (게임 연출과 서버 정산이 같은 나눔)
describe("60층부터 상자 물약 바로 팔기", () => {
  it("물약을 마실 수 있는 층(55층)은 그대로, 60층부터는 물약만 따로 뺀다", () => {
    expect(NO_POTION_FROM).toBe(60);
    expect(towerSellsPotions(59)).toBe(false);
    expect(towerSellsPotions(60)).toBe(true);
    expect(towerSellsPotions(205)).toBe(true);
    for (const seed of [1, 42, 9999, 123456]) {
      const d55 = towerChestDrops(seed, 55, 51);
      expect(splitChestPotions(55, d55)).toEqual({ keep: d55, sold: {} });
      for (const f of [60, 65, 100, 150]) {
        const d = towerChestDrops(seed, f, 51);
        const { keep, sold } = splitChestPotions(f, d);
        expect(keep.some((x) => x.kind === "potion")).toBe(false);
        expect(keep).toEqual(d.filter((x) => x.kind !== "potion"));
        const n = Object.values(sold).reduce((a, b) => a + b, 0);
        // 상자 물약은 늘 1~2개
        expect(n).toBe(d.filter((x) => x.kind === "potion").reduce((a, x) => a + x.qty, 0));
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(2);
      }
    }
  });

  it("값은 가방 되팔기와 같다 (상점가의 50%): 커피 4P · 에너지드링크 5P · 야근 도시락 15P", () => {
    expect(potionSaleValue({ p_coffee: 1 })).toBe(sellValue(potionById("p_coffee")!.price));
    expect(potionSaleValue({ p_coffee: 1 })).toBe(4);
    expect(potionSaleValue({ p_energy: 1 })).toBe(5);
    expect(potionSaleValue({ p_lunchbox: 1 })).toBe(15);
    expect(potionSaleValue({ p_coffee: 3, p_energy: 2, p_lunchbox: 1 })).toBe(3 * 4 + 2 * 5 + 15);
    expect(potionSaleValue({ nope: 5, p_coffee: 0 })).toBe(0);
  });

  it("지갑 한도에 막혀 일부만 받으면 못 받은 만큼 가방에 되돌린다 (한 푼이라도 받은 것은 판 것)", () => {
    const sold = { p_coffee: 3, p_lunchbox: 1 }; // 12 + 15 = 27P
    expect(unpaidPotions(sold, 27)).toEqual({});
    expect(unpaidPotions(sold, 0)).toEqual({ p_lunchbox: 1, p_coffee: 3 });
    // 12P만 받음 → 못 받은 15P: 도시락 1개를 되돌린다
    expect(unpaidPotions(sold, 12)).toEqual({ p_lunchbox: 1 });
    // 10P만 받음 → 못 받은 17P: 도시락 1개(15) + 남은 2P는 커피 1개 값(4)이 안 돼 판 것으로
    expect(unpaidPotions(sold, 10)).toEqual({ p_lunchbox: 1 });
    // 5P만 받음 → 못 받은 22P: 도시락 1 + 커피 1 (남은 3P는 판 것으로)
    expect(unpaidPotions(sold, 5)).toEqual({ p_lunchbox: 1, p_coffee: 1 });
  });
});
