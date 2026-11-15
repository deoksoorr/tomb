import { describe, expect, it } from "vitest";
import { cfRoom, CF_QUEUE, CF_ROOM_NAMES, CF_SPILL } from "@/lib/rpg/towerThemes/cafeteria";
import { floorSeed } from "@/lib/rpg/tower";
import { AH, allSolids, AW, buildLayout, cellOf, CELL, COLS, distanceField, freeGrid, layoutVariant, SIDE, standable, TOP } from "../../rpg/arena/layout";
import { cfLanes, cfPots, cfRoomPlan, cfSpillBand } from "./cafeteriaMap";

// 11/15 구내식당 배치: 방 여덟 가지 모두 시작 자리에서 어디든 갈 수 있고, 줄서기 선이 막히지 않고, 국솥·국물 튈 자리가 지도 안

const ROOMS = CF_ROOM_NAMES.map((_, v) => v);

describe("구내식당 배치", () => {
  it("arena/layout이 판 시드·층으로 방을 고른다", () => {
    for (let f = 1; f <= 10; f++) {
      const l = buildLayout("cf_cafeteria", floorSeed(42, f), { floor: f, runSeed: 42, start: 1 });
      expect(l.variant).toBe(cfRoom(42, f));
    }
  });

  for (const v of ROOMS)
    it(`${CF_ROOM_NAMES[v]}: 시작·출현 자리에 설 수 있고, 어디든 이어져 있다`, () => {
      for (const seed of [1, 777, 31337]) {
        const l = layoutVariant("cf_cafeteria", v, seed);
        const solids = allSolids(l);
        expect(standable(solids, l.start.x, l.start.y, 6)).toBe(true);
        const free = freeGrid(solids, 6);
        const dist = distanceField(free, cellOf(l.start.x, l.start.y));
        for (const s of l.spawns) {
          expect(standable(solids, s.x, s.y, 6), `${v} spawn ${s.x},${s.y}`).toBe(true);
          expect(dist[cellOf(s.x, s.y)], `${v} spawn ${s.x},${s.y}`).toBeLessThan(Infinity);
        }
        let open = 0;
        let lost = 0;
        for (let k = 0; k < free.length; k++) {
          if (!free[k]) continue;
          const y = Math.floor(k / COLS) * CELL + CELL / 2;
          if (y < TOP + 8) continue;
          open++;
          if (!(dist[k] < Infinity)) lost++;
        }
        expect(open).toBeGreaterThan(600);
        // 소품 사이 아주 작은 틈 말고는 갇힌 곳이 없다
        expect(lost / open).toBeLessThan(0.02);
      }
    });

  for (const v of ROOMS)
    it(`${CF_ROOM_NAMES[v]}: 줄서기 선은 지도 안이고 소품에 막히지 않는다, 국솥이 있다`, () => {
      const lanes = cfLanes(v);
      expect(lanes.length).toBeGreaterThan(0);
      const solids = allSolids(layoutVariant("cf_cafeteria", v, 5));
      for (const L of lanes) {
        const half = CF_QUEUE.width / 2;
        if (L.hor) {
          expect(L.from).toBeGreaterThanOrEqual(SIDE);
          expect(L.to).toBeLessThanOrEqual(AW - SIDE);
          expect(L.at - half).toBeGreaterThanOrEqual(TOP);
          expect(L.at + half).toBeLessThanOrEqual(AH - SIDE + 6);
        } else {
          expect(L.at - half).toBeGreaterThanOrEqual(SIDE);
          expect(L.from).toBeGreaterThanOrEqual(TOP);
          expect(L.to).toBeLessThanOrEqual(AH);
        }
        for (let u = L.from + 12; u <= L.to - 12; u += 6) {
          const x = L.hor ? u : L.at;
          const y = L.hor ? L.at : u;
          expect(standable(solids, x, y, 5), `${v} lane ${x},${y}`).toBe(true);
        }
      }
      const pots = cfPots(v);
      expect(pots.length).toBeGreaterThan(0);
      for (const p of pots) {
        expect(p.x).toBeGreaterThan(SIDE + 10);
        expect(p.x).toBeLessThan(AW - SIDE - 10);
        expect(p.y).toBeGreaterThan(0);
        // 국물이 튀는 자리 (솥 앞)가 걸을 수 있는 지도 안이고, 범위가 넉넉하다
        const b = cfSpillBand(p);
        expect(b.y0).toBeGreaterThanOrEqual(TOP + 30);
        expect(b.y1 + CF_SPILL.r * 0.6).toBeLessThanOrEqual(AH - SIDE + 2);
        expect(b.y1 - b.y0).toBeGreaterThan(30);
      }
    });

  it("방마다 그림이 다르다 (소품 구성이 모두 다른 방)", () => {
    const sig = new Set(ROOMS.map((v) => cfRoomPlan(v).props.map((p) => p.kind).sort().join()));
    expect(sig.size).toBe(ROOMS.length);
  });
});
