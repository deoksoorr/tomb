import { describe, expect, it } from "vitest";
import { CAMP_SEATS, MAP_TAG, SEATS, SEA_ARRIVE, SEA_BOARD, SEA_SEATS, inMapBounds, isAwayMap, mapAllowed, mapOf, mapSpawn, seaColliders, seatSlotIn, SEA_HEIGHT, SEA_WIDTH, SEA_LOTS, SEA_SPOTS, SPAWN, seaWet, tideLineY, SEA_GHOST_BERTH, SEA_PIER_END, SEA_BUOYS, SEA_ROCKS, onSeaRoad, SEA_ROAD, SEA_BUS_STOP, TIDE_HIGH_Y, TIDE_LOW_Y, SEA_DEEP_Y } from "./index";

// 11/16 달물결 포구: 세 번째 맵 (protocol sea.ts). 맵 id·허락·좌석·충돌 기본 규칙

const hit = (x: number, y: number) => seaColliders().some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);

describe("sea map (protocol)", () => {
  it("맵 id·이름표·허락", () => {
    expect(mapOf("sea")).toBe("sea");
    expect(mapOf("ocean")).toBe("village");
    expect(isAwayMap("sea")).toBe(true);
    expect(MAP_TAG.sea).toBe("[바닷가]");
    expect(mapAllowed("sea", { sea: true })).toBe(true);
    expect(mapAllowed("sea", { camp: true })).toBe(false);
    expect(mapAllowed("village", {})).toBe(true);
    expect(mapSpawn("sea", SPAWN)).toEqual(SEA_ARRIVE);
    expect(inMapBounds("sea", SEA_WIDTH, SEA_HEIGHT)).toBe(true);
    expect(inMapBounds("sea", SEA_WIDTH + 1, 10)).toBe(false);
  });
  it("좌석 id는 마을·캠핑장과 겹치지 않고, 바닷가 좌석만 받는다", () => {
    const others = new Set([...SEATS, ...CAMP_SEATS].map((s) => s.id));
    for (const s of SEA_SEATS) {
      expect(s.id.startsWith("p")).toBe(true);
      expect(others.has(s.id)).toBe(false);
      expect(seatSlotIn("sea", s.id)?.kind).toBe("seat");
    }
    expect(seatSlotIn("sea", "qL1")).toBeUndefined();
    expect(seatSlotIn("sea", "lA-0")).toBeUndefined();
  });
  it("도착·타는 자리는 막히지 않고, 11/16 먼바다도 헤엄칠 수 있게 막지 않는다 (낚싯배만)", () => {
    expect(hit(SEA_ARRIVE.x, SEA_ARRIVE.y)).toBe(false);
    expect(hit(SEA_BOARD.x, SEA_BOARD.y)).toBe(false);
    expect(hit(300, SEA_DEEP_Y + 20)).toBe(false);
    expect(seaWet(300, SEA_DEEP_Y + 20, 0)).toBe(true);
    // 갯벌은 물때와 상관없이 막지 않는다
    for (let y = TIDE_HIGH_Y + 4; y < TIDE_LOW_Y; y += 16) expect(hit(420, y), `${y}`).toBe(false);
    expect(tideLineY(1)).toBeLessThan(tideLineY(0));
  });
  it("11/16 유령선 자리: 선착장 끝 서쪽 깊은 물이 비어 있고 건널판은 선착장 끝 데크 가장자리", () => {
    const B = SEA_GHOST_BERTH;
    const P = SEA_PIER_END;
    expect(B.clear.x + B.clear.w).toBeLessThanOrEqual(P.x);
    expect(B.clear.w).toBeGreaterThanOrEqual(B.w);
    expect(B.ship.y).toBeGreaterThan(SEA_DEEP_Y);
    for (const b of SEA_BUOYS) expect(b.x >= B.clear.x && b.x <= B.clear.x + B.clear.w && b.y >= B.clear.y && b.y <= B.clear.y + B.clear.h).toBe(false);
    for (const r of SEA_ROCKS) expect(r.x + r.rx < B.clear.x || r.y + r.ry < B.clear.y).toBe(true);
    expect(B.gangway.x).toBeGreaterThanOrEqual(P.x);
    expect(B.gangway.y).toBeGreaterThanOrEqual(P.y);
    expect(B.gangway.y).toBeLessThanOrEqual(P.y + P.h);
  });
  it("11/16 버스 길은 오른쪽 끝에서 정류장을 지난 돌림 마당까지만", () => {
    expect(onSeaRoad(SEA_WIDTH - 2, SEA_ROAD.y + 20)).toBe(true);
    expect(onSeaRoad(SEA_BUS_STOP.x, SEA_ROAD.y + 20)).toBe(true);
    expect(onSeaRoad(200, SEA_ROAD.y + 20)).toBe(false);
    expect(SEA_ROAD.x).toBeLessThan(SEA_BUS_STOP.x - 60);
  });
  it("다음 차수 자리: 오두막 터 6, 모래성 자리 3, 바다 보기 벤치 4", () => {
    expect(SEA_LOTS).toHaveLength(6);
    expect(SEA_SPOTS.sandcastles).toHaveLength(3);
    expect(SEA_SPOTS.benches).toHaveLength(4);
    expect(SEA_SPOTS.loungers).toHaveLength(6);
  });
});
