import { describe, expect, it } from "vitest";
import { shoreDelay, shoreReach, WaveTrain, waveShape } from "./seaWaves";
import { MAP_ICONS } from "../world/minimapIcons";

// 11/16 파도는 하나마다 길이·높이가 다르고, 가끔 큰 파도가 몰려와요. 물가 앞줄은 x마다 다르게 닿아요

describe("waves (물가 파도)", () => {
  it("파도 길이 4~9초, 높이가 제각각이고 세트(큰 파도)가 있어요", () => {
    const w = new WaveTrain(1234, 0);
    const peaks: number[] = [];
    let big = 0;
    let last = 0;
    for (let t = 0; t < 600_000; t += 100) {
      peaks.push(w.surgeAt(t));
      const b = w.bigPeak(t, last);
      if (b) {
        last = b.id;
        big++;
      }
    }
    // 11/16 사용자 "더 세게": 큰 너울은 모래 위로 60px 넘게, 그래도 산책로(물가에서 140px 위)까지는 못 와요
    expect(Math.max(...peaks)).toBeGreaterThan(55);
    expect(Math.max(...peaks)).toBeLessThan(77);
    expect(big).toBeGreaterThan(5);
    // 10분 동안 같은 높이로만 오지 않아요 (봉우리 높이가 넓게 퍼져요)
    const tops = peaks.filter((v, i) => i > 0 && i < peaks.length - 1 && v >= peaks[i - 1] && v > peaks[i + 1]);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(20);
  });
  it("같은 씨앗이면 같은 흐름", () => {
    const a = new WaveTrain(77, 0);
    const b = new WaveTrain(77, 0);
    for (let t = 0; t < 60_000; t += 333) expect(a.surgeAt(t)).toBe(b.surgeAt(t));
  });
  it("모양은 0에서 올라 0으로 내려가요", () => {
    expect(waveShape(0)).toBe(0);
    expect(waveShape(0.35)).toBeCloseTo(1);
    expect(waveShape(1)).toBe(0);
  });
  it("물가는 x마다 닿는 때·폭이 달라요", () => {
    const reach = Array.from({ length: 40 }, (_, i) => shoreReach(i * 32, 1000));
    const delay = Array.from({ length: 40 }, (_, i) => shoreDelay(i * 32, 1000));
    expect(Math.max(...reach) - Math.min(...reach)).toBeGreaterThan(0.2);
    expect(Math.max(...delay) - Math.min(...delay)).toBeGreaterThan(300);
    for (const r of reach) expect(r).toBeGreaterThanOrEqual(0.2);
  });
});

describe("minimap icons (글씨 없는 도트 그림)", () => {
  it("요청한 장소마다 그림이 있고 서로 달라요 (r16 바닷가 부동산은 마을 분양 사무소와 같은 그림)", () => {
    expect(MAP_ICONS.realty).toEqual(MAP_ICONS.housing);
    const kinds = ["shop", "housing", "hunt", "tower", "busCamp", "busSea", "dock", "duck", "bus", "kiosk", "pier", "lighthouse"];
    const sigs = new Set<string>();
    for (const k of kinds) {
      const ic = MAP_ICONS[k];
      expect(ic, k).toBeDefined();
      expect(ic.px.length).toBeGreaterThan(5);
      sigs.add(JSON.stringify(ic.px) + ic.color);
    }
    expect(sigs.size).toBe(kinds.length);
  });
});
