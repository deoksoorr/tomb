import { DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { PASSENGER_DROP, PASSENGER_GRACE_MS, PASSENGER_MOVE_OFF, passengerDrop, passengerMoves } from "./boat";

// 11/26 같이 탄 사람 내리기 (운영자 「얻어 타면 납치된다 — 탈출이 되게」): 물 한가운데면 배 옆 헤엄칠 물로
describe("passengerDrop", () => {
  const all = () => true;
  it("옆모습 배는 아래(화면 앞쪽) 먼저, 앞·뒷모습 배는 오른쪽 먼저 — 배 몸통 밖", () => {
    expect(passengerDrop(100, 100, DIR.right, all)).toEqual({ x: 100, y: 100 + Math.round(PASSENGER_DROP * 0.8) });
    expect(passengerDrop(100, 100, DIR.left, all)).toEqual({ x: 100, y: 110 });
    expect(passengerDrop(100, 100, DIR.down, all)).toEqual({ x: 100 + PASSENGER_DROP, y: 100 });
    expect(passengerDrop(100, 100, DIR.up, all)).toEqual({ x: 113, y: 100 });
  });
  it("그쪽이 물이 아니면 반대쪽·대각선, 헤엄칠 물이 하나도 없으면 null (부르는 쪽이 뭍으로)", () => {
    expect(passengerDrop(100, 100, DIR.right, (x, y) => y < 100)).toEqual({ x: 100, y: 90 });
    expect(passengerDrop(100, 100, DIR.up, (x) => x < 100)).toEqual({ x: 87, y: 100 });
    expect(passengerDrop(100, 100, DIR.right, (x, y) => x > 100 && y > 100)).toEqual({ x: 109, y: 107 });
    expect(passengerDrop(100, 100, DIR.right, () => false)).toBeNull();
  });
});

describe("passengerMoves (11/26 같이 탄 사람은 E = 낚시, 움직이면 내린다)", () => {
  it("방향키·조이스틱을 충분히 밀면 내리고, 살짝 닿은 건 무시해요", () => {
    expect(passengerMoves({ ax: 1, ay: 0 })).toBe(true);
    expect(passengerMoves({ ax: 0, ay: -1 })).toBe(true);
    expect(passengerMoves({ ax: 0.3, ay: 0.3 })).toBe(true);
    expect(passengerMoves({ ax: 0.1, ay: 0.1 })).toBe(false);
    expect(passengerMoves({ ax: 0, ay: 0 })).toBe(false);
    expect(PASSENGER_MOVE_OFF).toBeGreaterThan(0.2);
    expect(PASSENGER_GRACE_MS).toBeGreaterThanOrEqual(300);
  });
});
