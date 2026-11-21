import { describe, expect, it } from "vitest";
import { advance, bolts, door, FLASH_AT, FLASH_PEAK, heartTimes, INTRO_END, lineAt, lines, SPOT, spot, storm, WALK_MS } from "./introTime";

describe("입장 연출 시간표", () => {
  it("걸음: 0에서 1까지 줄지 않고, 문 앞에서 느려진다", () => {
    expect(advance(0)).toBe(0);
    expect(advance(WALK_MS)).toBeCloseTo(1, 5);
    let prev = -1;
    for (let t = 0; t <= WALK_MS; t += 100) {
      expect(advance(t)).toBeGreaterThanOrEqual(prev);
      prev = advance(t);
    }
    const early = advance(1100) - advance(1000);
    const late = advance(WALK_MS) - advance(WALK_MS - 100);
    expect(late).toBeLessThan(early * 0.2);
  });

  it("폭풍은 0..1로 차오르고 헬은 처음부터 붉다", () => {
    expect(storm(0, "normal")).toBe(0);
    expect(storm(0, "hell")).toBeGreaterThan(0);
    expect(storm(4000, "normal")).toBeCloseTo(1, 2);
    expect(storm(bolts("normal")[0] + 300, "normal")).toBeGreaterThan(storm(bolts("normal")[0] - 10, "normal"));
  });

  it("들킴·문·도장·섬광 순서가 맞고 전체가 6초 안", () => {
    expect(spot(SPOT.lock + 100)).toBeCloseTo(1, 2);
    expect(spot(SPOT.from - 1)).toBe(0);
    expect(door(WALK_MS)).toBeCloseTo(1, 2);
    expect(door(3000)).toBe(0);
    expect(FLASH_AT).toBeLessThan(FLASH_PEAK);
    expect(INTRO_END).toBeLessThanOrEqual(6000);
  });

  it("심장은 점점 빨라진다", () => {
    const b = heartTimes("normal");
    const gaps = b.slice(1).map((t, i) => t - b[i]);
    expect(gaps[0]).toBeGreaterThan(gaps[gaps.length - 1] * 1.5);
    expect(b[b.length - 1]).toBeLessThan(FLASH_AT);
  });

  it("글은 한 번에 한 줄", () => {
    for (const m of ["normal", "hell"] as const) {
      const ls = lines(m);
      for (let i = 1; i < ls.length; i++) expect(ls[i].at).toBeGreaterThanOrEqual(ls[i - 1].end);
      expect(lineAt(0, m)).toBe(-1);
      expect(lineAt(ls[1].at + 10, m)).toBe(1);
    }
  });
});
