import { describe, expect, it } from "vitest";
import { ambienceAt, kstHour, leavesFor, parseAmbienceOverride, seasonOf, skyLabel, timePhase, weatherAt, WEATHER_BLOCK_MS } from "./ambience";

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
  it("날씨는 30분 블록 안에서 같고 블록마다 바뀐다", () => {
    const w1 = weatherAt(at(2.05));
    expect(weatherAt(at(2.45)).weather).toBe(w1.weather);
    expect(w1.nextWeatherAt).toBe(at(2.5));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => weatherAt(at(0) + i * WEATHER_BLOCK_MS).weather));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
  it("no snow in warm months", () => {
    const july = Date.UTC(2026, 6, 1);
    for (let i = 0; i < 400; i++) expect(weatherAt(july + i * WEATHER_BLOCK_MS).weather).not.toBe("snow");
    const may = Date.UTC(2026, 4, 1);
    for (let i = 0; i < 300; i++) expect(weatherAt(may + i * WEATHER_BLOCK_MS).weather).not.toBe("snow");
  });
  it("snows sometimes in late autumn and more in deep winter", () => {
    const count = (from: number, n: number) => {
      let snow = 0;
      for (let i = 0; i < n; i++) if (weatherAt(from + i * WEATHER_BLOCK_MS).weather === "snow") snow++;
      return snow;
    };
    // 11월 한 달 (360블록): 가끔
    const nov = count(Date.UTC(2026, 10, 1), 340);
    expect(nov).toBeGreaterThan(0);
    // 1월: 비 오는 블록의 절반이 눈이라 더 많다
    const jan = count(Date.UTC(2027, 0, 1), 340);
    expect(jan).toBeGreaterThan(nov);
  });
  it("seasons and falling leaves", () => {
    expect(seasonOf(11)).toBe("autumn");
    expect(seasonOf(12)).toBe("winter");
    expect(seasonOf(4)).toBe("spring");
    expect(seasonOf(7)).toBe("summer");
    expect(leavesFor("autumn", "clear", 0.5)).toBeGreaterThan(leavesFor("autumn", "rain", 0.5));
    expect(leavesFor("summer", "clear", 1)).toBe(0);
    // 11월 맑은 날 → 낙엽, 7월 → 없음
    expect(ambienceAt(at(12), { weather: "clear" }).leaves).toBeGreaterThan(0.5);
    expect(ambienceAt(Date.UTC(2026, 6, 1), { weather: "clear" }).leaves).toBe(0);
    expect(ambienceAt(Date.UTC(2026, 6, 1), { weather: "clear", season: "autumn" }).season).toBe("autumn");
  });
  it("parses QA overrides", () => {
    expect(parseAmbienceOverride("?time=dusk&weather=snow")).toEqual({ hour: 18.5, weather: "snow" });
    expect(parseAmbienceOverride("?time=7")).toEqual({ hour: 7 });
    expect(parseAmbienceOverride("?time=99&weather=meteor")).toEqual({});
    expect(parseAmbienceOverride("?season=winter")).toEqual({ season: "winter" });
    expect(parseAmbienceOverride("?season=monsoon")).toEqual({});
  });
});

describe("11/19 화면에 보이는 시간대 이름", () => {
  it("새벽·아침(7~11)·점심(11~14)·오후(14~17.5)·해질녘·밤 — 게임 규칙의 phase는 낮 그대로", () => {
    const at = (h: number) => skyLabel({ phase: timePhase(h), kstHour: h });
    expect([5, 6.9, 7, 10.9, 11, 13.9, 14, 17.4, 18, 23].map(at)).toEqual(["새벽", "새벽", "아침", "아침", "점심", "점심", "오후", "오후", "해질녘", "밤"]);
    expect([8, 12, 15].map(timePhase)).toEqual(["day", "day", "day"]);
  });

  it("맵 빛: 아침은 푸른 빛, 점심이 가장 밝고, 오후는 노릇하다", () => {
    const tint = (h: number) => ambienceAt(Date.UTC(2026, 5, 1, 0), { hour: h, weather: "clear" }).palette.worldTint;
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const [mr, , mb] = rgb(tint(8.5));
    const noon = rgb(tint(12.5));
    const [ar, , ab] = rgb(tint(16));
    expect(mb).toBeGreaterThan(mr);
    expect(ar).toBeGreaterThan(ab + 20);
    expect(noon.reduce((a, b) => a + b)).toBeGreaterThan(rgb(tint(8.5)).reduce((a, b) => a + b));
  });
});
