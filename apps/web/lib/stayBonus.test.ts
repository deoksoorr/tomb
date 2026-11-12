import { describe, expect, it } from "vitest";
import { earnRule } from "./economy";
import { STAY_BONUS_AMOUNTS, STAY_BONUS_DAILY_MAX, stayBonusState, stayBonusSum, stayBonusTiers } from "./stayBonus";

describe("접속 시간 보너스 구간 계산", () => {
  it("30분(기록 3번)마다 한 구간, 하루 7구간에서 멈춘다", () => {
    expect([0, 2, 3, 5, 6, 9, 21, 99].map(stayBonusTiers)).toEqual([0, 0, 1, 1, 2, 3, 7, 7]);
  });

  it("구간이 지날수록 늘다가 25P 고정, 하루 합계 145P = 경제 표 항목 한도", () => {
    expect(STAY_BONUS_AMOUNTS).toEqual([10, 15, 20, 25, 25, 25, 25]);
    expect(STAY_BONUS_DAILY_MAX).toBe(145);
    expect(earnRule("stayBonus").dailyMax).toBe(STAY_BONUS_DAILY_MAX);
    expect(stayBonusSum(1, 3)).toBe(35);
    expect(stayBonusSum(0, 7)).toBe(145);
  });

  it("쌓인 구간·합계·다음 구간까지 남은 기록·다 받음", () => {
    expect(stayBonusState(2, 0)).toEqual({ count: 0, points: 0, done: false, ticksToNext: 1 });
    expect(stayBonusState(10, 1)).toEqual({ count: 2, points: 35, done: false, ticksToNext: 2 });
    expect(stayBonusState(30, 7)).toEqual({ count: 0, points: 0, done: true, ticksToNext: null });
    expect(stayBonusState(30, 4)).toMatchObject({ count: 3, points: 75, ticksToNext: null });
  });
});
