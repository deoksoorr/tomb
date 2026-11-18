import { describe, expect, it } from "vitest";
import { SnowGrid } from "./snowNpc";

// 11/18 눈뭉치가 박히는 칸: 맵 충돌 상자를 칸으로 한 번 굽고 칸만 본다 (물은 빼고 날아간다)

describe("SnowGrid", () => {
  it("상자 안·밖, 맵 밖은 막힘", () => {
    const g = new SnowGrid(100, 80).fill([{ x: 20, y: 30, w: 12, h: 5 }]);
    expect(g.blocked(25, 32)).toBe(true);
    expect(g.blocked(31, 34)).toBe(true);
    expect(g.blocked(25, 40)).toBe(false);
    expect(g.blocked(10, 32)).toBe(false);
    expect(g.blocked(-1, 10)).toBe(true);
    expect(g.blocked(50, 80)).toBe(true);
  });

  it("빼는 자리(물)는 막지 않고, 다시 구우면 앞 것은 지운다", () => {
    const g = new SnowGrid(100, 80).fill([{ x: 0, y: 0, w: 40, h: 8 }], (x) => x < 20);
    expect(g.blocked(5, 4)).toBe(false);
    expect(g.blocked(30, 4)).toBe(true);
    g.fill([{ x: 60, y: 60, w: 4, h: 4 }]);
    expect(g.blocked(30, 4)).toBe(false);
    expect(g.blocked(61, 61)).toBe(true);
  });
});
