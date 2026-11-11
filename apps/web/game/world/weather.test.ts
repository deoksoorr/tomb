import { describe, expect, it } from "vitest";
import { ambienceAt } from "@/lib/ambience";
import { LevelBlender, levelsFor } from "./ambienceMix";
import { isQuietHour, THUNDER_MIN_RAIN, thunderDelaySec, thunderFlash, thunderGapMs } from "./weatherMath";

// 12번: 빗소리·천둥·눈·낙엽

describe("thunder", () => {
  it("is rare: one to a few minutes apart, rarer at quiet hours", () => {
    for (const r of [0, 0.5, 0.999]) {
      const gap = thunderGapMs(0.8, false, r);
      expect(gap).toBeGreaterThanOrEqual(40_000);
      expect(gap).toBeLessThanOrEqual(200_000);
      expect(thunderGapMs(0.8, true, r)).toBeCloseTo(gap * 2.5, 5);
    }
    // 비가 셀수록 잦다
    expect(thunderGapMs(1, false, 0.5)).toBeLessThan(thunderGapMs(0.55, false, 0.5));
    // 첫 천둥은 조금 빨리, QA 강제는 몇 초마다
    expect(thunderGapMs(0.8, false, 0.5, true)).toBeLessThan(thunderGapMs(0.8, false, 0.5));
    expect(thunderGapMs(0.8, false, 0.5, false, true)).toBeLessThanOrEqual(10_000);
  });
  it("quiet hours are late night to early morning (KST)", () => {
    expect(isQuietHour(23.5)).toBe(true);
    expect(isQuietHour(3)).toBe(true);
    expect(isQuietHour(7)).toBe(false);
    expect(isQuietHour(21)).toBe(false);
  });
  it("flash: bright, dip, second flicker, then fades out within a second", () => {
    expect(thunderFlash(-1)).toBe(0);
    expect(thunderFlash(10)).toBe(1);
    expect(thunderFlash(100)).toBeLessThan(0.3);
    expect(thunderFlash(160)).toBeGreaterThan(0.5);
    expect(thunderFlash(400)).toBeLessThan(thunderFlash(250));
    expect(thunderFlash(1000)).toBe(0);
  });
  it("sound arrives after the flash", () => {
    expect(thunderDelaySec(0)).toBeGreaterThan(0);
    expect(thunderDelaySec(0.999)).toBeLessThan(3);
  });
  it("only heavy rain thunders", () => {
    const light = { ...levelsFor(ambienceAt(0, { hour: 12, weather: "rain" })), rain: 0.4 };
    expect(light.rain).toBeLessThan(THUNDER_MIN_RAIN);
    expect(levelsFor(ambienceAt(0, { hour: 12, weather: "rain" })).rain).toBeGreaterThanOrEqual(THUNDER_MIN_RAIN);
  });
});

describe("snow and leaves levels", () => {
  it("snow weather → snow level, no rain", () => {
    const L = levelsFor(ambienceAt(0, { hour: 12, weather: "snow" }));
    expect(L.snow).toBeGreaterThan(0.5);
    expect(L.rain).toBe(0);
  });
  it("leaves only in autumn and blend smoothly", () => {
    const autumn = levelsFor(ambienceAt(0, { hour: 12, weather: "clear", season: "autumn" }));
    const summer = levelsFor(ambienceAt(0, { hour: 12, weather: "clear", season: "summer" }));
    expect(autumn.leaves).toBeGreaterThan(0.5);
    expect(summer.leaves).toBe(0);
    const bl = new LevelBlender(summer, 2500);
    bl.setTarget(autumn, 0);
    const mid = bl.update(1250).leaves;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(autumn.leaves);
    expect(bl.update(2500).leaves).toBeCloseTo(autumn.leaves, 5);
  });
});
