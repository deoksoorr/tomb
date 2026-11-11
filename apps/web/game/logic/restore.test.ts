import { seatById } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { anchorAt, fallbackSeat, nudgeSpot, OVERLAP_DIST, restoreAfterDenied } from "./restore";
import { standPoint } from "./sit";

const kWn0 = seatById("kWn-0")!;

describe("자리 복원 — 한 자리에는 한 명", () => {
  it("거절된 좌석 대신 가장 가까운 빈 좌석 (거절된 좌석·남의 좌석은 제외)", () => {
    const occupied = new Map([["kWn-0", 7]]);
    const s = fallbackSeat(kWn0, occupied, 3)!;
    expect(s.id).not.toBe("kWn-0");
    expect(Math.hypot(s.x - kWn0.x, s.y - kWn0.y)).toBeLessThanOrEqual(56);
    // 옆자리(kWn-1)도 누가 앉았으면 그다음
    const s2 = fallbackSeat(kWn0, new Map([["kWn-0", 7], [s.id, 8]]), 3)!;
    expect([s.id, "kWn-0"]).not.toContain(s2.id);
  });

  it("주변 좌석이 모두 차 있으면 좌석 앞에 서되, 거기 선 사람과 겹치지 않게 비켜 선다", () => {
    const occupied = new Map<string, number>();
    for (const id of ["kWn-0", "kWn-1", "kWs-0", "kWs-1", "kWw", "kWe"]) occupied.set(id, 9);
    const front = standPoint(kWn0);
    const r = restoreAfterDenied(kWn0, occupied, 3, [front]);
    // 모닥불 서쪽 둘레 자리가 모두 찼고 반경 안에 다른 가구는 없다 → 앉지 않고 좌석 앞에 비켜 선다
    expect(r.seat).toBeNull();
    expect(Math.hypot(r.stand.x - front.x, r.stand.y - front.y)).toBeGreaterThanOrEqual(OVERLAP_DIST);
    expect(Math.hypot(r.stand.x - front.x, r.stand.y - front.y)).toBeLessThanOrEqual(30);
  });

  it("서 있던 자리에 다른 사람이 있으면 살짝 비켜 선다, 없으면 그대로", () => {
    expect(nudgeSpot({ x: 100, y: 100 }, [{ x: 300, y: 300 }])).toEqual({ x: 100, y: 100 });
    const n = nudgeSpot({ x: 100, y: 100 }, [{ x: 101, y: 100 }]);
    expect(Math.hypot(n.x - 101, n.y - 100)).toBeGreaterThanOrEqual(OVERLAP_DIST);
    expect(Math.hypot(n.x - 100, n.y - 100)).toBeLessThanOrEqual(30);
    // 막힌 곳(물)은 건너뛴다
    const m = nudgeSpot({ x: 100, y: 100 }, [{ x: 100, y: 100 }], (x) => x > 100);
    expect(m.x).toBeLessThanOrEqual(100);
  });

  it("그네·나무 앵커 찾기", () => {
    const list = [
      { kind: "swing", ax: 10, ay: 20 },
      { kind: "tree", ax: 50, ay: 60 },
    ];
    expect(anchorAt(list, "swing", 11, 21)).toBe(list[0]);
    expect(anchorAt(list, "tree", 11, 21)).toBeNull();
    expect(anchorAt(list, "tree", 50, 63)).toBeNull();
  });
});
