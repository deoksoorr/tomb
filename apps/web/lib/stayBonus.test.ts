import { describe, expect, it } from "vitest";
import { earnRule } from "./economy";
import { STAY_BONUS_AMOUNTS, stayBonusAmounts, stayBonusAt, stayBonusState, stayBonusSum, stayBonusTiers } from "./stayBonus";

describe("접속 시간 보너스 구간 계산", () => {
  it("30분(기록 3번)마다 한 구간, 11/19부터 하루 구간 상한이 없다", () => {
    expect([0, 2, 3, 5, 6, 9, 21, 99].map(stayBonusTiers)).toEqual([0, 0, 1, 1, 2, 3, 7, 33]);
    expect(earnRule("stayBonus").dailyMax).toBeNull();
  });

  it("구간이 지날수록 늘다가 25P 고정 (끝을 넘으면 마지막 값)", () => {
    expect(STAY_BONUS_AMOUNTS).toEqual([10, 15, 20, 25]);
    expect([1, 2, 3, 4, 5, 40].map((i) => stayBonusAt(STAY_BONUS_AMOUNTS, i))).toEqual([10, 15, 20, 25, 25, 25]);
    expect(stayBonusSum(1, 3)).toBe(35);
    // 예전 하루 상한이던 7구간 145P를 넘어 계속 쌓인다
    expect(stayBonusSum(0, 7)).toBe(145);
    expect(stayBonusSum(0, 10)).toBe(145 + 3 * 25);
    // 칭호 보너스는 구간 값만 키운다 (마지막 값도 같이)
    expect(stayBonusSum(4, 6, 0.1)).toBe(2 * Math.round(25 * 1.1));
    expect(stayBonusAmounts(0.1)).toEqual([11, 17, 22, 28]);
  });

  it("쌓인 구간·합계·다음 구간까지 남은 기록 (다 받음 상태가 없다)", () => {
    expect(stayBonusState(2, 0)).toEqual({ count: 0, points: 0, ticksToNext: 1 });
    expect(stayBonusState(10, 1)).toEqual({ count: 2, points: 35, ticksToNext: 2 });
    expect(stayBonusState(30, 7)).toEqual({ count: 3, points: 75, ticksToNext: 3 });
    expect(stayBonusState(30, 10)).toEqual({ count: 0, points: 0, ticksToNext: 3 });
  });
});
