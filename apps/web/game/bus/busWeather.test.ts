import { describe, expect, it } from "vitest";
import { ambienceAt, parseAmbienceOverride, WEATHERS } from "@/lib/ambience";
import { dropHoldMs, dropVelocity, fallVelocity, glassDropCount, NO_RIDE_WEATHER, rideWeather } from "./busWeather";

// 11/17 버스 창밖 날씨: 마을 날씨 → 창밖 세기, 물방울·빗줄기·눈발 움직임

describe("창밖 날씨 세기", () => {
  it("비는 빗줄기, 눈은 눈발, 안개는 흐림. 맑음·흐림은 아무것도 없다", () => {
    expect(rideWeather("clear", 1)).toEqual(NO_RIDE_WEATHER);
    expect(rideWeather("cloudy", 1)).toEqual(NO_RIDE_WEATHER);
    const r = rideWeather("rain", 0.8);
    expect(r.rain).toBeGreaterThan(0.5);
    expect(r.snow).toBe(0);
    const s = rideWeather("snow", 0.8);
    expect(s.snow).toBeGreaterThan(0.5);
    expect(s.rain).toBe(0);
    const f = rideWeather("fog", 0.4);
    expect(f.fog).toBeGreaterThan(0.6);
    expect(f.rain + f.snow).toBe(0);
  });

  it("세기가 셀수록 짙고, 이상한 값은 0..1로 자른다", () => {
    expect(rideWeather("rain", 1).rain).toBeGreaterThan(rideWeather("rain", 0.4).rain);
    expect(rideWeather("rain", 5).rain).toBe(1);
    expect(rideWeather("snow", Number.NaN).snow).toBeCloseTo(0.35);
    for (const w of WEATHERS) for (const v of Object.values(rideWeather(w, 1))) expect(v).toBeLessThanOrEqual(1);
  });

  it("마을과 같은 날씨를 쓴다 (QA ?weather 덮어쓰기 그대로)", () => {
    const amb = ambienceAt(Date.UTC(2026, 10, 17, 3), { ...parseAmbienceOverride("?weather=snow", "1"), hour: 12 });
    expect(amb.weather).toBe("snow");
    expect(rideWeather(amb.weather, amb.intensity).snow).toBeGreaterThan(0);
  });
});

describe("창 물방울", () => {
  it("비 세기만큼, 움직임 줄이기면 적게", () => {
    expect(glassDropCount(0, false)).toBe(0);
    expect(glassDropCount(1, false)).toBe(22);
    expect(glassDropCount(1, true)).toBe(6);
    expect(glassDropCount(0.5, false)).toBe(11);
  });

  it("비가 셀수록 빨리 흘러내리기 시작한다", () => {
    expect(dropHoldMs(1, 0.5)).toBeLessThan(dropHoldMs(0.3, 0.5));
    expect(dropHoldMs(1, 0)).toBeGreaterThan(0);
  });

  it("늘 아래로 흐르고, 버스가 빠를수록 뒤로 더 밀린다", () => {
    const still = dropVelocity(0, 1, 0);
    const fast = dropVelocity(200, 1, 0);
    expect(still.y).toBeGreaterThan(0);
    expect(still.x).toBeCloseTo(0);
    expect(fast.x).toBeLessThan(-20);
    expect(dropVelocity(200, -1, 0).x).toBeGreaterThan(20);
    expect(dropVelocity(0, 1, 1).y).toBeGreaterThan(still.y);
  });
});

describe("빗줄기·눈발 흐름", () => {
  it("비는 눈보다 빨리 떨어지고, 풍경이 흐르는 쪽으로 쓸린다", () => {
    const rain = fallVelocity("rain", true, 100, 1, 0);
    const snow = fallVelocity("snow", true, 100, 1, 0);
    expect(rain.y).toBeGreaterThan(snow.y * 3);
    expect(rain.x).toBeGreaterThan(0);
    expect(fallVelocity("rain", true, 100, -1, 0).x).toBeLessThan(0);
    // 멈춰 있으면 눈은 바람만큼만 옆으로
    expect(fallVelocity("snow", false, 0, 1, 0).x).toBeCloseTo(0);
    expect(fallVelocity("snow", true, 200, 1, 0).x).toBeGreaterThan(fallVelocity("snow", false, 200, 1, 0).x);
  });
});
