import { describe, expect, it } from "vitest";
import { ambienceAt, parseAmbienceOverride, TOD_HOURS } from "@/lib/ambience";
import { LevelBlender, levelsFor } from "./ambienceMix";
import { gradeAt, todKey } from "./skyGrade";

// 바깥 색 보정: 밤은 확실히 어둡게, 시간대 색 온도, 날씨 겹침

const lum = (c: number) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
const r = (c: number) => (c >> 16) & 255;
const b = (c: number) => c & 255;

describe("skyGrade", () => {
  it("night is really dark, deep night darkest, day has no darkness", () => {
    expect(todKey(TOD_HOURS.day).darkness).toBe(0);
    expect(todKey(TOD_HOURS.night).darkness).toBeGreaterThanOrEqual(0.65);
    expect(todKey(TOD_HOURS.deepnight).darkness).toBeGreaterThan(todKey(TOD_HOURS.night).darkness);
    // 남색: 파랑이 빨강보다 확실히 강하다
    expect(b(todKey(TOD_HOURS.night).tint)).toBeGreaterThan(r(todKey(TOD_HOURS.night).tint) + 40);
  });
  it("color temperature per phase", () => {
    expect(todKey(TOD_HOURS.day).tint).toBe(0xffffff);
    expect(b(todKey(TOD_HOURS.dawn).tint)).toBeGreaterThan(r(todKey(TOD_HOURS.dawn).tint)); // 푸르스름
    expect(r(todKey(TOD_HOURS.morning).tint)).toBeGreaterThan(b(todKey(TOD_HOURS.morning).tint)); // 금빛
    expect(r(todKey(TOD_HOURS.sunset).tint)).toBeGreaterThan(b(todKey(TOD_HOURS.sunset).tint) + 60); // 주황·분홍
    expect(b(todKey(TOD_HOURS.evening).tint)).toBeGreaterThan(r(todKey(TOD_HOURS.evening).tint)); // 보라
  });
  it("changes smoothly across the day (no jumps between minutes)", () => {
    for (let h = 0; h < 24; h += 1 / 60) {
      const a = todKey(h);
      const c = todKey(h + 1 / 60);
      expect(Math.abs(a.darkness - c.darkness)).toBeLessThan(0.02);
    }
  });
  it("weather stacks on time of day", () => {
    const clearNight = gradeAt(22, "clear", 0.8);
    const rainNight = gradeAt(22, "rain", 0.8);
    expect(rainNight.darkness).toBeGreaterThan(clearNight.darkness);
    expect(lum(gradeAt(12, "cloudy", 0.8).tint)).toBeLessThan(lum(gradeAt(12, "clear", 0.8).tint));
    expect(gradeAt(12, "cloudy", 0.8).haze).toBeGreaterThan(0);
    expect(gradeAt(22, "snow", 0.8).darkness).toBeLessThan(clearNight.darkness);
    expect(gradeAt(12, "fog", 0.8).haze).toBeGreaterThan(gradeAt(12, "cloudy", 0.8).haze);
    const rain = gradeAt(12, "rain", 0.8).tint;
    expect(b(rain)).toBeGreaterThan(r(rain)); // 차가운 청회색
  });
  it("outdoor levels use the grade, indoor keeps the gentle palette", () => {
    const a = ambienceAt(0, { hour: 23, weather: "clear" });
    expect(levelsFor(a, true).darkness).toBeGreaterThan(0.6);
    expect(levelsFor(a).darkness).toBeLessThanOrEqual(0.3);
    expect(levelsFor(a).haze).toBe(0);
  });
  it("blends shade and haze too", () => {
    const from = levelsFor(ambienceAt(0, { hour: 12, weather: "clear" }), true);
    const to = levelsFor(ambienceAt(0, { hour: 12, weather: "fog" }), true);
    const bl = new LevelBlender(from, 2500);
    bl.setTarget(to, 0);
    const mid = bl.update(1250).haze;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(to.haze);
  });
  it("?tod= picks one of 7 phases", () => {
    expect(parseAmbienceOverride("?tod=deepnight&weather=rain")).toEqual({ hour: TOD_HOURS.deepnight, weather: "rain" });
    expect(parseAmbienceOverride("?tod=sunset").hour).toBe(TOD_HOURS.sunset);
    expect(parseAmbienceOverride("?tod=toString")).toEqual({});
  });
});
