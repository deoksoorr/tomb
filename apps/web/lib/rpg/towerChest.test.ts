import { describe, expect, it } from "vitest";
import { TOWER_CHESTS_PER_DAY, towerChestDrops, towerChestFloors, towerSettle, type TowerState } from "./tower";

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
    // 11/15 하루 한도 없음: 아무리 많이 열었어도 우두머리 층마다
    expect(towerChestFloors(1, 10, 500)).toEqual([5, 10]);
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
