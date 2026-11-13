import { describe, expect, it } from "vitest";
import { houseLot, WORLD_LOTS } from "@tomb/protocol";
import { inWater, lotInteractable, standable } from "../world/layout";
import { doorFront } from "./doorSpot";

// 집에서 나오면 그 번지 집 문 앞 (걸을 수 있는 칸)

const blocked = (x: number, y: number) => !standable(x, y) || inWater(x, y);

describe("집 문 앞 설 자리", () => {
  it("모든 번지: 걸을 수 있고, 문 아래 가까이, 문 들어가기 반경 안", () => {
    for (let lot = 1; lot <= WORLD_LOTS; lot++) {
      const s = doorFront(lot, [], blocked)!;
      const l = houseLot(lot)!;
      expect(blocked(s.x, s.y), `${lot}번지`).toBe(false);
      expect(s.y).toBeGreaterThan(l.door.y);
      expect(Math.hypot(s.x - l.door.x, s.y - l.door.y)).toBeLessThan(32);
      // 문 앞이라 E 한 번이면 다시 들어갈 수 있다
      const door = lotInteractable(lot, { id: "h", name: "집" })!;
      expect(Math.hypot(s.x - door.x, s.y - door.y)).toBeLessThanOrEqual(door.r);
    }
  });

  it("다른 사람이 서 있으면 옆 칸, 다 막혔으면 문 바로 아래", () => {
    const l = houseLot(1)!;
    const first = doorFront(1, [], () => false)!;
    expect(first).toEqual({ x: l.door.x, y: l.door.y + 14 });
    const next = doorFront(1, [first], () => false)!;
    expect(next).not.toEqual(first);
    expect(doorFront(1, [], () => true)).toEqual(first);
  });

  it("메인 맵에 없는 번지(2단지)는 null", () => {
    expect(doorFront(WORLD_LOTS + 1, [], () => false)).toBeNull();
    expect(doorFront(0, [], () => false)).toBeNull();
  });
});
