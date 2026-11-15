import { describe, expect, it } from "vitest";
import { floorSeed } from "@/lib/rpg/tower";
import { allSolids, buildLayout, cellOf, CELL, COLS, distanceField, freeGrid } from "../../rpg/arena/layout";
import { MT_MIN_ROOM, MT_ROOM_TYPES, mtRoomPlan, mtRoomType } from "./meetingRoomMap";

// 11/15 끝없는 회의실 배치: 층마다 다른 방 (블록 안 보통 층 넷은 겹치지 않음), 모든 방에서 갇히는 곳 없음 (가장 좁아진 방에서도)

describe("끝없는 회의실 방 종류", () => {
  it("우두머리 층은 주재자의 대회의실, 한 블록의 보통 층 넷은 서로 다른 방", () => {
    for (let seed = 1; seed <= 60; seed++) {
      for (const base of [5, 15, 25, 55]) {
        const types = [1, 2, 3, 4].map((k) => mtRoomType(seed, base + k));
        expect(new Set(types).size).toBe(4);
        expect(types).not.toContain("boss");
        expect(mtRoomType(seed, base + 5)).toBe("boss");
      }
    }
    // 11/15 층 번호로만 정해진다 (판이 달라도 6층은 작은 회의실)
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => mtRoomType(i + 1, 6)));
    expect([...firsts]).toEqual(["huddle"]);
  });

  it("층 배치는 층 시드로 정해진다 (카펫 색·가구 자리)", () => {
    const a = mtRoomPlan("board", 11);
    expect(mtRoomPlan("board", 11)).toEqual(a);
    const carpets = new Set(Array.from({ length: 30 }, (_, i) => mtRoomPlan("board", i * 7919).carpet.join()));
    expect(carpets.size).toBeGreaterThan(4);
  });

  it("arena/layout이 층·판 시드로 방을 고른다", () => {
    for (let f = 6; f <= 10; f++) {
      const l = buildLayout("mt_meeting", floorSeed(42, f), { floor: f, runSeed: 42 });
      expect(MT_ROOM_TYPES[l.variant]).toBe(mtRoomType(42, f));
    }
  });

  for (const type of MT_ROOM_TYPES)
    it(`${type}: 시작 자리에서 방 안 어디든 갈 수 있다 (가장 좁아진 방 안도)`, () => {
      for (let s = 0; s < 6; s++) {
        const seed = 1000 + s * 7717;
        const l = buildLayoutFor(MT_ROOM_TYPES.indexOf(type), seed);
        expect(MT_ROOM_TYPES[l.variant]).toBe(type);
        const plan = mtRoomPlan(type, seed);
        const solids = allSolids(l);
        const free = freeGrid(solids, 6);
        const dist = distanceField(free, cellOf(plan.start.x, plan.start.y));
        expect(free[cellOf(plan.start.x, plan.start.y)]).toBe(1);
        const r0 = plan.room0;
        for (const room of [r0, { x0: Math.max(r0.x0, MT_MIN_ROOM.x0), x1: Math.min(r0.x1, MT_MIN_ROOM.x1), y0: MT_MIN_ROOM.y0, y1: MT_MIN_ROOM.y1 }]) {
          let open = 0;
          for (let k = 0; k < free.length; k++) {
            const x = (k % COLS) * CELL + CELL / 2;
            const y = Math.floor(k / COLS) * CELL + CELL / 2;
            if (x < room.x0 + 8 || x > room.x1 - 8 || y < room.y0 + 8 || y > room.y1 - 8 || !free[k]) continue;
            open++;
            expect(dist[k], `${type} ${seed} (${x},${y})`).toBeLessThan(Infinity);
          }
          expect(open).toBeGreaterThan(80);
        }
      }
    });
});

/** 방 종류 v를 고르게 하는 판 시드·층을 찾아 배치를 만든다 */
function buildLayoutFor(v: number, seed: number) {
  // 11/15 방은 층 번호로만 정해진다 → 여러 바퀴의 회의실 층을 훑는다
  for (let run = 1; run < 3; run++)
    for (let f = 6; f <= 80; f += f % 10 === 0 ? 6 : 1) {
      if (MT_ROOM_TYPES.indexOf(mtRoomType(run, f)) === v) return buildLayout("mt_meeting", seed, { floor: f, runSeed: run });
    }
  throw new Error(`no layout for ${v}`);
}
