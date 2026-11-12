import { describe, expect, it } from "vitest";
import { HUNT_ZONES, ZONE_IDS } from "@/lib/rpg/catalog";
import { allSolids, AW, AH, buildLayout, cellOf, CELL, collide, COLS, distanceField, FlowField, freeGrid, inRegion, layoutVariant, layoutVariants, nearestFree, ROWS, standable } from "./layout";

// 40번 사냥터 지도 검사: 장애물이 플레이어·몬스터를 가두지 않는지 (모든 사냥터·모든 배치).
//  - 플레이어(반지름 5)가 설 수 있는 칸은 시작점에서 모두 이어져 있다 (갇힌 구석 없음)
//  - 플레이어가 갈 수 있는 모든 칸은 보통 몬스터(반지름 10)가 닿을 수 있는 칸 바로 옆이다 (몬스터가 못 오는 숨을 곳 없음)
//  - 우두머리(반지름 20)도 출현 지점에서 시작점 근처까지 걸어올 수 있다

const centerOf = (c: number) => ({ x: (c % COLS) * CELL + CELL / 2, y: Math.floor(c / COLS) * CELL + CELL / 2 });

function reach(free: Uint8Array, from: number[]): Uint8Array {
  const seen = new Uint8Array(free.length);
  for (const f of from) {
    if (!free[f] || seen[f]) continue;
    const d = distanceField(free, f);
    for (let k = 0; k < d.length; k++) if (d[k] !== Infinity) seen[k] = 1;
  }
  return seen;
}

describe("사냥터 지도 (40번)", () => {
  it("사냥터마다 지도가 있고, 같은 시드면 같은 지도", () => {
    for (const id of ZONE_IDS) {
      expect(buildLayout(id, 7)).toEqual(buildLayout(id, 7));
      expect(layoutVariants(id)).toBeGreaterThanOrEqual(2);
      expect(buildLayout(id, 7).props.length).toBeGreaterThan(4);
    }
    expect(buildLayout("없는곳", 1).zone).toBe("meeting-room");
  });

  for (const id of ZONE_IDS) {
    for (let v = 0; v < layoutVariants(id); v++) {
      it(`${HUNT_ZONES[id].name} 배치 ${v}: 갇히는 곳이 없다`, () => {
        const l = layoutVariant(id, v);
        const solids = allSolids(l);
        expect(standable(solids, l.start.x, l.start.y, 5), "시작점").toBe(true);
        expect(standable(solids, l.start.x, l.start.y, 10), "시작점 (몬스터 크기)").toBe(true);
        expect(l.spawns.length).toBeGreaterThanOrEqual(5);
        for (const s of l.spawns) expect(standable(solids, s.x, s.y, 10), `출현 지점 ${s.x},${s.y}`).toBe(true);
        for (const r of l.regions) {
          expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= AW && r.y + r.h <= AH, `구역 ${r.kind}`).toBe(true);
        }

        // 플레이어: 설 수 있는 칸은 모두 이어져 있다
        const pFree = freeGrid(solids, 5);
        const pReach = reach(pFree, [cellOf(l.start.x, l.start.y)]);
        const pockets: string[] = [];
        for (let k = 0; k < pFree.length; k++) if (pFree[k] && !pReach[k]) pockets.push(JSON.stringify(centerOf(k)));
        expect(pockets, "플레이어가 못 가는 빈 구석").toEqual([]);

        // 보통 몬스터: 출현 지점에서 플레이어가 갈 수 있는 모든 곳에 닿는다 (몸 반지름 10 + 공격 거리 7)
        const mFree = freeGrid(solids, 10);
        const mReach = reach(mFree, l.spawns.map((s) => cellOf(s.x, s.y)));
        const safe: string[] = [];
        for (let k = 0; k < pFree.length; k++) {
          if (!pReach[k]) continue;
          const p = centerOf(k);
          let ok = false;
          for (let j = -2; j <= 2 && !ok; j++)
            for (let i = -2; i <= 2 && !ok; i++) {
              const ci = (k % COLS) + i;
              const cj = Math.floor(k / COLS) + j;
              if (ci < 0 || cj < 0 || ci >= COLS || cj >= ROWS) continue;
              const n = cj * COLS + ci;
              if (!mReach[n]) continue;
              const q = centerOf(n);
              if (Math.hypot(p.x - q.x, p.y - q.y) <= 16) ok = true;
            }
          if (!ok) safe.push(JSON.stringify(p));
        }
        expect(safe, "몬스터가 못 오는 숨을 곳").toEqual([]);

        // 우두머리: 출현 지점에서 가장 가까운 설 수 있는 칸(게임도 이렇게 고른다)에서 시작점 근처(24px)까지 온다
        const bFree = freeGrid(solids, 20);
        const bSpawns = l.spawns.map((s) => nearestFree(bFree, s.x, s.y)).filter((c) => c >= 0 && Math.hypot(centerOf(c).x - l.start.x, centerOf(c).y - l.start.y) > 60);
        expect(bSpawns.length, "우두머리 출현 지점").toBeGreaterThanOrEqual(3);
        const bReach = reach(bFree, bSpawns);
        let near = false;
        for (let k = 0; k < bFree.length && !near; k++) if (bReach[k] && Math.hypot(centerOf(k).x - l.start.x, centerOf(k).y - l.start.y) <= 24) near = true;
        expect(near, "우두머리가 시작점 근처까지").toBe(true);
      });
    }
  }

  it("충돌: 사각형·원 밖으로 밀어내고, 흐름장은 막힌 쪽을 돌아간다", () => {
    const solids = [{ t: "r" as const, x: 100, y: 100, w: 40, h: 40 }, { t: "c" as const, x: 300, y: 100, r: 10 }];
    const p = { x: 120, y: 98 };
    expect(collide(solids, p, 5)).toBe(true);
    expect(p.y).toBeLessThanOrEqual(95.01);
    const q = { x: 300, y: 105 };
    collide(solids, q, 5);
    expect(Math.hypot(q.x - 300, q.y - 100)).toBeCloseTo(15, 3);
    // 벽 너머의 목표: 곧장은 막혀 있고, 흐름장 방향은 벽을 피해 간다
    const wall = [{ t: "r" as const, x: 200, y: 40, w: 16, h: 200 }];
    const ff = new FlowField(wall, 8);
    ff.update(300, 140);
    expect(ff.clearLine(150, 140, 300, 140)).toBe(false);
    const d = ff.dirAt(150, 140)!;
    expect(Math.abs(d.y)).toBeGreaterThan(0.5);
    expect(inRegion({ kind: "mud", x: 0, y: 0, w: 20, h: 10, ellipse: true }, 10, 5)).toBe(true);
    expect(inRegion({ kind: "mud", x: 0, y: 0, w: 20, h: 10, ellipse: true }, 1, 1)).toBe(false);
  });
});
