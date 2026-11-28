import { describe, expect, it } from "vitest";
import { CAMP_TRADER } from "@tomb/protocol";
import { inReach, reachDist } from "../logic/reach";
import { BOOTH, CAMP_INTERACTABLES, RAFT_BOOTH_SPOT } from "./campLayout";

// 11/27 운영자 「매표소 닿는 곳이 너무 작다」: 부스 건물 전체(앞·양옆)에서 「E 좌대 입장권 사기」, 낚시터 사장님 자리와는 가까운 쪽이 이긴다

const booth = CAMP_INTERACTABLES.find((o) => o.id === "raftBooth")!;
/** 사장님 「팔기」 닿는 곳 (world/forage/Foraging rebuildItems: 발 + 10, 반지름 20) */
const trader = { x: CAMP_TRADER.x, y: CAMP_TRADER.y + 10, r: 20 };

describe("11/27 좌대 매표소 닿는 곳", () => {
  it("부스 앞 가운데·양끝·양옆 벽 옆에서 닿는다, 안내 글자는 창구 왼쪽 앞 고정", () => {
    expect(booth.zone).toBeDefined();
    expect(booth.promptAt).toEqual(RAFT_BOOTH_SPOT);
    for (const [x, y] of [
      [BOOTH.x, BOOTH.y + 6],
      [BOOTH.x - 24, BOOTH.y + 6],
      [BOOTH.x + 24, BOOTH.y + 6],
      [BOOTH.x - 32, BOOTH.y - 6],
      [BOOTH.x + 32, BOOTH.y - 6],
    ] as const)
      expect(inReach(booth, x, y), `${x},${y}`).toBe(true);
  });
  it("사장님 앞·옆에서는 매표소가 아니라 사장님 (닿는 곳이 겹치는 칸에서도 사장님 쪽이 가깝다)", () => {
    for (let dx = -20; dx <= 20; dx += 4)
      for (let dy = -20; dy <= 20; dy += 4) {
        const x = trader.x + dx;
        const y = trader.y + dy;
        if (Math.hypot(dx, dy) > trader.r) continue;
        if (!inReach(booth, x, y)) continue;
        expect(Math.hypot(dx, dy), `${x},${y}`).toBeLessThanOrEqual(reachDist(booth, x, y));
      }
    expect(inReach(booth, CAMP_TRADER.x, CAMP_TRADER.y)).toBe(false);
  });
});
