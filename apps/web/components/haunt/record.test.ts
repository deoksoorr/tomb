import { describe, expect, it } from "vitest";
import { isBetter, parseBest } from "./record";

describe("귀신의집 최고 기록", () => {
  it("저장값 읽기 (깨진 값은 없음으로)", () => {
    expect(parseBest(null)).toBeNull();
    expect(parseBest("{")).toBeNull();
    expect(parseBest(JSON.stringify({ ms: -1 }))).toBeNull();
    expect(parseBest(JSON.stringify({ ms: 61000, scares: 3, at: 5 }))).toEqual({ ms: 61000, scares: 3, at: 5 });
  });

  it("더 빠르면 새 기록, 같으면 덜 놀란 쪽", () => {
    expect(isBetter(null, { ms: 90000, scares: 4 })).toBe(true);
    const prev = { ms: 60000, scares: 2, at: 0 };
    expect(isBetter(prev, { ms: 59000, scares: 9 })).toBe(true);
    expect(isBetter(prev, { ms: 61000, scares: 0 })).toBe(false);
    expect(isBetter(prev, { ms: 60000, scares: 1 })).toBe(true);
    expect(isBetter(prev, { ms: 0, scares: 0 })).toBe(false);
  });
});
