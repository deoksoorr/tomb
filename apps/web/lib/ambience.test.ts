import { describe, expect, it } from "vitest";
import { ambienceAt, kstHour, parseAmbienceOverride, timePhase, weatherAt, WEATHER_BLOCK_MS } from "./ambience";

// 2026-11-08 00:00 KST = 2026-11-07 15:00 UTC
const KST_MIDNIGHT = Date.UTC(2026, 10, 7, 15);
const at = (h: number) => KST_MIDNIGHT + h * 3_600_000;

describe("ambience", () => {
  it("uses KST hours", () => {
    expect(kstHour(at(13.5))).toBeCloseTo(13.5);
    expect(timePhase(kstHour(at(23)))).toBe("night");
    expect(timePhase(kstHour(at(6)))).toBe("dawn");
    expect(timePhase(kstHour(at(12)))).toBe("day");
    expect(timePhase(kstHour(at(18)))).toBe("dusk");
  });
  it("night is darker than day", () => {
    const night = ambienceAt(at(23), { weather: "clear" }).palette;
    const day = ambienceAt(at(12), { weather: "clear" }).palette;
    expect(night.darkness).toBeGreaterThan(day.darkness);
    expect(night.celestial).toBe("moon");
    expect(day.celestial).toBe("sun");
  });
  it("blends smoothly across a transition", () => {
    const a = ambienceAt(at(17.9), { weather: "clear" }).palette.darkness;
    const b = ambienceAt(at(18.0), { weather: "clear" }).palette.darkness;
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });
  it("weather is shared within a 2h block and changes across blocks", () => {
    const w1 = weatherAt(at(2.1));
    expect(weatherAt(at(3.9)).weather).toBe(w1.weather);
    expect(w1.nextWeatherAt).toBe(at(4));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => weatherAt(at(0) + i * WEATHER_BLOCK_MS).weather));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it("no snow outside Dec–Feb", () => {
    const july = Date.UTC(2026, 6, 1);
    for (let i = 0; i < 400; i++) expect(weatherAt(july + i * WEATHER_BLOCK_MS).weather).not.toBe("snow");
  });
  it("parses QA overrides", () => {
    expect(parseAmbienceOverride("?time=dusk&weather=snow")).toEqual({ hour: 18.5, weather: "snow" });
    expect(parseAmbienceOverride("?time=7")).toEqual({ hour: 7 });
    expect(parseAmbienceOverride("?time=99&weather=meteor")).toEqual({});
  });
});
