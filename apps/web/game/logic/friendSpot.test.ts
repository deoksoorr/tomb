import { describe, expect, it } from "vitest";
import { standable } from "../world/layout";
import { besideFriend, findFollowed, FRIEND_ARRIVED, followDeadline } from "./friendSpot";

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

describe("친구 따라 집에 들어가기", () => {
  it("기다리는 끝 시각은 게임 루프 시각 기준 (씬 시계가 멈춰 있던 옛 값이어도 바로 끝나지 않는다)", () => {
    // 집 씬 시계는 처음 더해질 때(게임 시작 ~1초)에 멈춰 있고, 루프는 이미 30초다
    const staleSceneClock = 1_000;
    const loop = 30_000;
    expect(staleSceneClock + 12_000 < loop).toBe(true); // 예전 계산: 시작하자마자 "못 찾았어요"
    expect(followDeadline(loop, 12_000)).toBe(42_000);
    expect(followDeadline(loop, 12_000) > loop).toBe(true);
  });

  it("방 사람 목록에서 이름으로 친구를 찾는다 (앞뒤 공백 무시, 없으면 null)", () => {
    const remotes = [
      { sid: 1, name: "보리별" },
      { sid: 2, name: " 가람 " },
    ];
    expect(findFollowed(remotes, "가람")?.sid).toBe(2);
    expect(findFollowed(remotes, "없는사람")).toBeNull();
    expect(findFollowed(remotes, "  ")).toBeNull();
  });

  it("도착 안내는 한 문구로 한 번만", () => {
    expect(FRIEND_ARRIVED).toBe("도착했어요!");
  });
});
