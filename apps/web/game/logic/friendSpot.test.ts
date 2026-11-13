import { describe, expect, it } from "vitest";
import { standable } from "../world/layout";
import { besideFriend } from "./friendSpot";

// 친구한테 가기: 친구 둘레에서 걸을 수 있고 다른 사람과 겹치지 않는 칸

describe("친구 옆 설 자리", () => {
  it("막힌 곳·다른 사람 자리는 건너뛰고 가장 가까운 칸", () => {
    const f = { x: 100, y: 100 };
    expect(besideFriend(f, [f], () => false)).toEqual({ x: 116, y: 100 });
    // 오른쪽이 막혔다
    expect(besideFriend(f, [f], (x) => x > 100)).toEqual({ x: 84, y: 100 });
    // 왼쪽에 다른 사람
    expect(besideFriend(f, [f, { x: 84, y: 100 }], (x) => x > 100)).toEqual({ x: 100, y: 114 });
  });

  it("둘레가 모두 막혔으면 친구 자리 그대로, 사람으로만 막혔으면 겹쳐도 걸을 수 있는 칸", () => {
    const f = { x: 50.4, y: 60.6 };
    expect(besideFriend(f, [], () => true)).toEqual({ x: 50, y: 61 });
    const crowd = Array.from({ length: 200 }, (_, i) => ({ x: 10 + (i % 20) * 5, y: 20 + Math.floor(i / 20) * 9 }));
    expect(besideFriend(f, crowd, () => false)).toEqual({ x: 66, y: 61 });
  });

  it("실제 마을 지도에서 고른 칸은 설 수 있는 곳이다", () => {
    // 맵 곳곳의 설 수 있는 점에서 친구 옆 칸을 고르면 언제나 standable
    let n = 0;
    for (let x = 40; x < 1400; x += 97)
      for (let y = 60; y < 1000; y += 89) {
        if (!standable(x, y)) continue;
        const s = besideFriend({ x, y }, [], (px, py) => !standable(px, py));
        expect(standable(s.x, s.y)).toBe(true);
        n++;
      }
    expect(n).toBeGreaterThan(20);
  });
});
