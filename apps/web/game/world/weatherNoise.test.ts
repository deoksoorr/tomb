import { describe, expect, it } from "vitest";
import { centerFade, gust, pulse, valueNoise1, wrapInto } from "./weatherNoise";

const sample = (f: (t: number) => number, n = 40_000, step = 0.137) => {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = f(i * step);
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { mean: sum / n, min, max };
};

describe("weatherNoise", () => {
  it("값 노이즈는 [0,1) 안이고 부드럽다 (격자 사이에서 튀지 않는다)", () => {
    for (let i = 0; i < 5000; i++) {
      const t = i * 0.031;
      const v = valueNoise1(t, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(valueNoise1(t + 0.01, 7) - v)).toBeLessThan(0.03);
    }
  });

  it("돌풍은 [-1,1], 평균 0 근처, 양쪽 끝까지 고루 쓴다", () => {
    for (const seed of [1, 42, 9001]) {
      const s = sample((t) => gust(t, seed));
      expect(s.min).toBeGreaterThanOrEqual(-1);
      expect(s.max).toBeLessThanOrEqual(1);
      expect(Math.abs(s.mean)).toBeLessThan(0.05);
      expect(s.min).toBeLessThan(-0.8);
      expect(s.max).toBeGreaterThan(0.8);
    }
  });

  it("시드가 다르면 다른 흔들림", () => {
    let diff = 0;
    for (let i = 0; i < 200; i++) diff += Math.abs(gust(i * 0.5, 1) - gust(i * 0.5, 2));
    expect(diff / 200).toBeGreaterThan(0.2);
  });

  it("한 주기로 되풀이되지 않는다 (어떤 짧은 지연에서도 자기 자신과 겹치지 않는다)", () => {
    for (const lag of [1, 2, 3, 4, 5, 8, 10, 16]) {
      let d = 0;
      for (let i = 0; i < 400; i++) d += Math.abs(gust(i * 0.25, 5) - gust(i * 0.25 + lag, 5));
      expect(d / 400).toBeGreaterThan(0.15);
    }
  });

  it("세기 배율은 평균 1을 지키고 폭 안에서 오르내린다 (센 빗발·잦아듦)", () => {
    const s = sample((t) => pulse(t, 3, 0.35, 9), 60_000, 0.9);
    expect(Math.abs(s.mean - 1)).toBeLessThan(0.02);
    expect(s.min).toBeGreaterThanOrEqual(0.65 - 1e-9);
    expect(s.max).toBeLessThanOrEqual(1.35 + 1e-9);
    expect(s.max - s.min).toBeGreaterThan(0.5);
  });

  it("가운데 옅게: 화면 중심을 덮으면 floor, 멀면 1, 그 사이는 단조", () => {
    expect(centerFade(0)).toBeCloseTo(0.45);
    expect(centerFade(2)).toBe(1);
    let prev = 0;
    for (let d = 0; d <= 1.2; d += 0.05) {
      const v = centerFade(d);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("감기: 범위 안으로, 음수·먼 값도", () => {
    expect(wrapInto(5, 0, 10)).toBe(5);
    expect(wrapInto(12, 0, 10)).toBe(2);
    expect(wrapInto(-3, 0, 10)).toBe(7);
    expect(wrapInto(-1003, 100, 50)).toBeGreaterThanOrEqual(100);
    expect(wrapInto(-1003, 100, 50)).toBeLessThan(150);
    expect(wrapInto(5, 0, 0)).toBe(5);
  });
});
