import { describe, expect, it } from "vitest";
import { BOAT_BOARD_QUIET_MS, BOAT_BOARD_SFX, BOAT_LEAVE_SFX, BOAT_ROW_GAIN, BOAT_STROKE_FAST_MS, BOAT_STROKE_SLOW_MS, BoatSfx, boatHearGain, rowStrokeMs } from "./boatSfx";
import { RIDE_BYSTANDER_GAIN, RIDE_HEAR_FAR, bystanderGain } from "./rides";

function fake() {
  const calls: { name: string; gain: number; rate: number }[] = [];
  const sfx = new BoatSfx({ play: (name, gain = 1, rate = 1) => void calls.push({ name, gain, rate }), destroy: () => {} });
  return { sfx, calls };
}

describe("배 공용 효과음 (boatSfx)", () => {
  it("탄 사람은 그대로, 구경꾼은 놀거리 거리 규칙 (멀면 0)", () => {
    expect(boatHearGain(true, 999)).toBe(1);
    expect(boatHearGain(false, 0)).toBe(RIDE_BYSTANDER_GAIN);
    expect(boatHearGain(false, 30)).toBe(bystanderGain(30));
    expect(boatHearGain(false, RIDE_HEAR_FAR)).toBe(0);
  });

  it("노 박자는 속도를 따라간다 (빠를수록 짧게)", () => {
    expect(rowStrokeMs(34, 34)).toBe(BOAT_STROKE_FAST_MS);
    expect(rowStrokeMs(6, 34)).toBe(BOAT_STROKE_SLOW_MS);
    expect(rowStrokeMs(20, 34)).toBeLessThan(rowStrokeMs(10, 34));
    expect(rowStrokeMs(99, 34)).toBe(BOAT_STROKE_FAST_MS);
  });

  it("탈 때·내릴 때 조각배와 같은 boat-board 소리", () => {
    const { sfx, calls } = fake();
    sfx.board("b", true, 0, 0);
    sfx.leave("b", true, 0);
    expect(calls).toEqual([
      { name: "boat-board", gain: BOAT_BOARD_SFX.gain, rate: BOAT_BOARD_SFX.rate },
      { name: "boat-board", gain: BOAT_LEAVE_SFX.gain, rate: BOAT_LEAVE_SFX.rate },
    ]);
  });

  it("움직이면 첫 노는 바로, 다음은 속도 박자대로 · 멈추면 조용", () => {
    const { sfx, calls } = fake();
    sfx.row("b", 0, 3, 34, true, 0);
    expect(calls).toHaveLength(0);
    sfx.row("b", 100, 34, 34, true, 0);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("row");
    expect(calls[0].gain).toBe(BOAT_ROW_GAIN);
    sfx.row("b", 100 + BOAT_STROKE_FAST_MS - 1, 34, 34, true, 0);
    expect(calls).toHaveLength(1);
    sfx.row("b", 100 + BOAT_STROKE_FAST_MS, 34, 34, true, 0);
    expect(calls).toHaveLength(2);
    // 잠깐 느려졌다 다시 빨라져도 박자대로 (겹쳐 나지 않게)
    sfx.row("b", 700, 0, 34, true, 0);
    sfx.row("b", 710, 30, 34, true, 0);
    expect(calls).toHaveLength(2);
    // 한 박자 넘게 쉬었다 다시 저으면 첫 노는 바로
    sfx.row("b", 2000, 0, 34, true, 0);
    sfx.row("b", 2010, 30, 34, true, 0);
    expect(calls).toHaveLength(3);
  });

  it("남이 탄 배는 탄 직후 잠깐 노 소리 없음 (자리로 옮겨 앉는 움직임) · 내가 탄 배는 바로", () => {
    const { sfx, calls } = fake();
    sfx.board("b", false, 10, 1000);
    sfx.row("b", 1100, 30, 34, false, 10);
    expect(calls.map((c) => c.name)).toEqual(["boat-board"]);
    sfx.row("b", 1000 + BOAT_BOARD_QUIET_MS, 30, 34, false, 10);
    expect(calls.map((c) => c.name)).toEqual(["boat-board", "row"]);
    const mine = fake();
    mine.sfx.board("m", true, 0, 1000);
    mine.sfx.row("m", 1100, 30, 34, true, 0);
    expect(mine.calls.map((c) => c.name)).toEqual(["boat-board", "row"]);
  });

  it("배마다 박자를 따로 센다", () => {
    const { sfx, calls } = fake();
    sfx.row("a", 0, 34, 34, true, 0);
    sfx.row("b", 0, 34, 34, false, 10);
    expect(calls).toHaveLength(2);
    expect(calls[1].gain).toBeCloseTo(BOAT_ROW_GAIN * RIDE_BYSTANDER_GAIN);
  });

  it("멀리 있는 남의 배는 아무 소리도 안 낸다", () => {
    const { sfx, calls } = fake();
    sfx.board("b", false, RIDE_HEAR_FAR + 1, 0);
    sfx.leave("b", false, RIDE_HEAR_FAR + 1);
    sfx.row("b", 0, 34, 34, false, RIDE_HEAR_FAR + 1);
    expect(calls).toHaveLength(0);
  });
});
