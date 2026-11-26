import { describe, expect, it } from "vitest";
import { ambienceAt } from "@/lib/ambience";
import { drawnAmbience, fireflyLevel, LevelBlender, levelsFor } from "./ambienceMix";
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

// 11/26 운영자 문의 「날씨 효과 끄니까 눈 점점거리는 게 그대로 멈춤, 다시 켜도 안 켜짐」 (크리스마스판 밤·그때 날씨는 맑음):
// 멈춘 「눈」은 반딧불이었다 (날씨가 아니라 설정과 상관없이 남음). 켜고 끄기는 몇 번을 되풀이해도 눈이 사라졌다 돌아와야 한다
describe("날씨 효과 끄기·켜기 (설정)", () => {
  const snowNight = ambienceAt(0, { hour: 23, weather: "snow" });
  const clearNight = ambienceAt(0, { hour: 23, weather: "clear" });
  const L = (on: boolean, a = snowNight) => levelsFor(drawnAmbience(a, on), true);

  it("끄면 비·눈·안개·흐림이 0, 시간대 색은 그대로", () => {
    const off = L(false);
    expect(off.snow).toBe(0);
    expect(off.rain).toBe(0);
    expect(off.cloud).toBe(0);
    expect(L(true).snow).toBeGreaterThan(0.5);
    expect(drawnAmbience(snowNight, false).phase).toBe(snowNight.phase);
    expect(drawnAmbience(snowNight, true)).toBe(snowNight);
  });

  it("끄기→켜기→끄기를 되풀이해도 매번 끝까지 섞인다 (멈춘 값이 남지 않음)", () => {
    const bl = new LevelBlender(L(true), 2500);
    let t = 0;
    for (let i = 0; i < 3; i++) {
      bl.setTarget(L(false), t);
      expect(bl.update(t + 2500).snow).toBe(0);
      t += 4000;
      bl.setTarget(L(true), t);
      expect(bl.update(t + 2500).snow).toBeCloseTo(L(true).snow, 5);
      t += 4000;
    }
    // 섞는 도중에 다시 눌러도 그 자리에서 새 목표로 간다
    bl.setTarget(L(false), t);
    const mid = bl.update(t + 1000).snow;
    expect(mid).toBeGreaterThan(0);
    bl.setTarget(L(true), t + 1000);
    expect(bl.update(t + 1000).snow).toBeCloseTo(mid, 5);
    expect(bl.update(t + 3500).snow).toBeCloseTo(L(true).snow, 5);
  });

  it("겨울·크리스마스판에는 반딧불이 없다 (밤 눈밭에 멈춘 눈송이처럼 보였다) — 다른 판은 그대로", () => {
    const night = levelsFor(clearNight, true).fireflies;
    expect(night).toBeGreaterThan(0.5);
    expect(fireflyLevel(night, true)).toBe(0);
    expect(fireflyLevel(night, false)).toBe(night);
  });
});
