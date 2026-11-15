import { describe, expect, it } from "vitest";
import { charTintOf } from "./charTint";

const rgb = (v: number) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];

describe("charTintOf: 캐릭터에는 마을 색조를 절반만", () => {
  it("정오 맑음(흰색)은 그대로", () => {
    expect(charTintOf(0xffffff, 0)).toBe(0xffffff);
  });

  it("밤 색조: 채널마다 곱하기의 절반(제곱근) — 두 번 곱하면 맵 색조", () => {
    const night = 0x7684c4;
    const c = rgb(charTintOf(night, 0));
    const t = rgb(night);
    for (let i = 0; i < 3; i++) {
      expect(c[i]).toBeGreaterThan(t[i]);
      expect(Math.abs((c[i] / 255) ** 2 - t[i] / 255)).toBeLessThan(0.01);
    }
  });

  it("비(막이 덮는 날): 막만큼 조금 더 밝히되 흰색을 넘지 않는다", () => {
    const rain = 0xa2afc1;
    const plain = rgb(charTintOf(rain, 0));
    const hazed = rgb(charTintOf(rain, 0.2));
    for (let i = 0; i < 3; i++) {
      expect(hazed[i]).toBeGreaterThan(plain[i]);
      expect(hazed[i]).toBeLessThanOrEqual(255);
    }
    expect(charTintOf(0xf0f0f0, 0.5)).toBe(0xffffff);
  });

  it("맵 색조보다 어두워지지 않는다", () => {
    for (const t of [0x000000, 0x102030, 0x6672b0, 0xffbc9a, 0xffe8bc]) {
      const c = rgb(charTintOf(t, 0.3));
      const m = rgb(t);
      for (let i = 0; i < 3; i++) expect(c[i]).toBeGreaterThanOrEqual(m[i]);
    }
  });
});
