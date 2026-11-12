import { describe, expect, it } from "vitest";
import { AWAY_FADE_MS, awayFade } from "./awayFade";

describe("실내 표시 연출 (awayFade)", () => {
  it("들어가면 흐려지며 문 쪽(위)으로 가다가 다 들어가면 숨는다", () => {
    expect(awayFade(true, 0, 0)).toEqual({ alpha: 1, dy: 0, hidden: false });
    const mid = awayFade(true, 0, AWAY_FADE_MS / 2);
    expect(mid.alpha).toBeCloseTo(0.5);
    expect(mid.dy).toBeGreaterThan(0);
    expect(awayFade(true, 0, AWAY_FADE_MS).hidden).toBe(true);
  });

  it("이미 안에 있던 사람(-Infinity)과 움직임 줄이기는 바로 숨는다", () => {
    expect(awayFade(true, -Infinity, 5).hidden).toBe(true);
    expect(awayFade(true, 0, 1, true).hidden).toBe(true);
  });

  it("나오면 문 앞에서 나타나고, 연출이 끝나면 그대로", () => {
    expect(awayFade(false, 0, 0)).toMatchObject({ alpha: 0, hidden: false });
    expect(awayFade(false, 0, AWAY_FADE_MS)).toEqual({ alpha: 1, dy: 0, hidden: false });
    expect(awayFade(false, -Infinity, 0)).toEqual({ alpha: 1, dy: 0, hidden: false });
  });
});
