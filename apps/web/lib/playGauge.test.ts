import { describe, expect, it } from "vitest";
import { playGauge, playSendMs, stayLive } from "./playGauge";

describe("playGauge", () => {
  it("starts empty", () => {
    expect(playGauge("bumper", 0)).toEqual({ frac: 0, text: "0:00 / 1:00", done: false });
    expect(playGauge("fire", 0).text).toBe("0:00 / 2:00");
    expect(playGauge("sky", 0).text).toBe("0:00 / 0:40");
  });
  it("fills proportionally to the send point", () => {
    const g = playGauge("bumper", playSendMs("bumper") / 2);
    expect(g.frac).toBeCloseTo(0.5);
    expect(g.text).toBe("0:30 / 1:00");
    expect(playGauge("fire", playSendMs("fire") / 2).text).toBe("1:00 / 2:00");
  });
  it("never shows the end time before the mission is sent", () => {
    expect(playGauge("bumper", playSendMs("bumper") - 1).text).toBe("0:59 / 1:00");
    expect(playGauge("bumper", 61_000).done).toBe(false);
    expect(playGauge("sky", 40_000).done).toBe(false);
  });
  it("is full exactly when the mission is sent", () => {
    expect(playSendMs("bumper")).toBe(61_500);
    expect(playGauge("bumper", 61_500)).toEqual({ frac: 1, text: "1:00 / 1:00", done: true });
    expect(playGauge("fire", 999_999).frac).toBe(1);
  });
});

describe("stayLive", () => {
  it("adds minutes since the last presence reply", () => {
    expect(stayLive(10, 2 * 60_000 + 30_000, 30)).toEqual({ min: 12, frac: 0.4, text: "12/30분" });
  });
  it("stops one minute short of the next 10-minute slot until the server confirms", () => {
    expect(stayLive(10, 15 * 60_000, 30).min).toBe(19);
    expect(stayLive(20, 15 * 60_000, 30).min).toBe(29);
  });
  it("keeps the server value when already done", () => {
    expect(stayLive(40, 0, 30)).toEqual({ min: 30, frac: 1, text: "30/30분" });
  });
});
