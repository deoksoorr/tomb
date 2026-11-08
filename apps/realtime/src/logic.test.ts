import { MAP_WIDTH, MAX_VALID_SPEED, RUN_SPEED } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { MoveBudget, RateLimiter, allocSid, parseChannel, parseSpawn, stepToward } from "./logic";

describe("RateLimiter", () => {
  it("drops messages over 20/s for the rest of that second", () => {
    const rl = new RateLimiter(20, 10);
    for (let i = 0; i < 20; i++) expect(rl.hit(1000 + i)).toBe("ok");
    expect(rl.hit(1500)).toBe("drop");
    expect(rl.hit(1999)).toBe("drop");
    expect(rl.hit(2000)).toBe("ok"); // 다음 초는 다시 허용
  });

  it("kicks after 10 consecutive seconds over the limit", () => {
    const rl = new RateLimiter(20, 10);
    const verdicts: string[] = [];
    for (let s = 0; s < 10; s++) for (let i = 0; i < 21; i++) verdicts.push(rl.hit(s * 1000 + i));
    expect(verdicts.filter((v) => v === "kick")).toHaveLength(1);
    expect(verdicts.at(-1)).toBe("kick");
  });

  it("resets the streak when a second stays under the limit", () => {
    const rl = new RateLimiter(20, 10);
    const flood = (s: number) => {
      let last = "ok";
      for (let i = 0; i < 21; i++) last = rl.hit(s * 1000 + i);
      return last;
    };
    for (let s = 0; s < 9; s++) expect(flood(s)).toBe("drop");
    rl.hit(9000); // 9초째는 조용히
    for (let s = 10; s < 19; s++) expect(flood(s)).toBe("drop");
    expect(flood(19)).toBe("kick");
  });
});

describe("MoveBudget", () => {
  it("absorbs up to 1s of bunched movement, then refills at MAX_VALID_SPEED", () => {
    const b = new MoveBudget(0);
    // 0.5초 막혔다가 MOVE 5개(각 10px)가 한꺼번에 도착 → 모두 허용
    for (let i = 0; i < 5; i++) expect(b.take(10, 500)).toBe(10);
    // 버스트 상한(1초 분량)을 넘는 거리는 다 주지 않는다
    expect(b.take(1000, 500)).toBeCloseTo(MAX_VALID_SPEED - 50);
    expect(b.take(10, 500)).toBe(0);
    expect(b.take(1000, 600)).toBeCloseTo(MAX_VALID_SPEED * 0.1);
  });

  it("lets a legit runner keep up indefinitely", () => {
    const b = new MoveBudget(0);
    let lag = 0;
    for (let t = 100; t <= 60_000; t += 100) lag += RUN_SPEED * 0.1 - b.take(lag + RUN_SPEED * 0.1, t);
    expect(lag).toBeLessThan(1e-6);
  });
});

describe("helpers", () => {
  it("stepToward clamps distance and lands exactly when in reach", () => {
    expect(stepToward({ x: 0, y: 0 }, { x: 300, y: 400 }, 50)).toEqual({ x: 30, y: 40 });
    expect(stepToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 50)).toEqual({ x: 3, y: 4 });
  });

  it("allocSid reuses the lowest free id starting at 1", () => {
    expect(allocSid(new Set())).toBe(1);
    expect(allocSid(new Set([1, 2, 4]))).toBe(3);
  });

  it("parseChannel accepts 1..max only", () => {
    expect(parseChannel("1", 10)).toBe(1);
    expect(parseChannel("10", 10)).toBe(10);
    for (const bad of ["0", "11", "01", "-1", "1.5", "abc", "", "1e1"]) expect(parseChannel(bad, 10)).toBeNull();
  });

  it("parseSpawn needs both coordinates inside the map", () => {
    expect(parseSpawn("320", "56")).toEqual({ x: 320, y: 56 });
    expect(parseSpawn("320", null)).toBeUndefined();
    expect(parseSpawn(String(MAP_WIDTH), "56")).toEqual({ x: MAP_WIDTH, y: 56 });
    expect(parseSpawn(String(MAP_WIDTH + 1), "56")).toBeUndefined();
    expect(parseSpawn("-1", "56")).toBeUndefined();
    expect(parseSpawn("3.5", "56")).toBeUndefined();
  });
});
