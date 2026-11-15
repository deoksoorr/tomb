import { describe, expect, it } from "vitest";
import { floorSeed } from "@/lib/rpg/tower";
import { PK_ROOM_NAMES, PK_RUSH, pkRoom } from "@/lib/rpg/towerThemes/parking";
import { AH, allSolids, AW, buildLayout, cellOf, CELL, COLS, distanceField, freeGrid, layoutVariant, ROWS, SIDE, standable, TOP } from "../../rpg/arena/layout";
import { PK_LANE_W, pkLanes, PK_PROP_META } from "./parkingMap";

// 11/15 지하 주차장 배치: 방 여덟 가지 모두 시작 자리에서 어디든 갈 수 있고, 차가 지나가는 통로는 소품이 막지 않는다 (돌진 판정 폭 + 여유)

const ROOMS = PK_ROOM_NAMES.map((_, v) => v);

describe("지하 주차장 방", () => {
  it("arena/layout이 판 시드·층으로 방을 고른다 (블록의 보통 층 넷은 서로 다름, 우두머리 층은 견인 차고지)", () => {
    for (const run of [3, 42, 977])
      for (let f = 1; f <= 20; f++) {
        const l = buildLayout("pk_parking", floorSeed(run, f), { floor: f, runSeed: run, start: 1 });
        expect(l.variant).toBe(pkRoom(run, f));
      }
  });

  for (const v of ROOMS)
    it(`${PK_ROOM_NAMES[v]}: 시작·출현 자리에 설 수 있고 어디든 갈 수 있다`, () => {
      for (const seed of [1, 7717, 99991]) {
        const l = layoutVariant("pk_parking", v, seed);
        const solids = allSolids(l);
        expect(standable(solids, l.start.x, l.start.y, 6), `start ${v}`).toBe(true);
        expect(l.spawns.length).toBeGreaterThanOrEqual(5);
        for (const s of l.spawns) expect(standable(solids, s.x, s.y, 8), `spawn ${v} ${s.x},${s.y}`).toBe(true);
        const free = freeGrid(solids, 6);
        const dist = distanceField(free, cellOf(l.start.x, l.start.y));
        let open = 0;
        for (let k = 0; k < free.length; k++) {
          if (!free[k]) continue;
          open++;
          const x = (k % COLS) * CELL + CELL / 2;
          const y = Math.floor(k / COLS) * CELL + CELL / 2;
          expect(dist[k], `${v} ${seed} (${x},${y})`).toBeLessThan(Infinity);
        }
        expect(open).toBeGreaterThan(400);
        // 몬스터(몸 반지름 10)가 출현 지점에서 플레이어가 설 수 있는 모든 곳 16px 안까지 온다 (차 사이 숨을 곳 없음 — 빈칸은 시드마다 다르다)
        const mFree = freeGrid(solids, 10);
        const mDist = new Float32Array(COLS * ROWS).fill(Infinity);
        for (const sp of l.spawns) {
          const d = distanceField(mFree, cellOf(sp.x, sp.y));
          for (let k = 0; k < d.length; k++) mDist[k] = Math.min(mDist[k], d[k]);
        }
        for (let k = 0; k < free.length; k++) {
          if (!free[k]) continue;
          let ok = false;
          for (let j = -2; j <= 2 && !ok; j++)
            for (let i = -2; i <= 2 && !ok; i++) {
              const ci = (k % COLS) + i;
              const cj = Math.floor(k / COLS) + j;
              if (ci < 0 || cj < 0 || ci >= COLS || cj >= ROWS || Math.hypot(i, j) * CELL > 16) continue;
              if (mDist[cj * COLS + ci] < Infinity) ok = true;
            }
          expect(ok, `${PK_ROOM_NAMES[v]} ${seed} 숨을 곳 (${(k % COLS) * CELL + 4},${Math.floor(k / COLS) * CELL + 4})`).toBe(true);
        }
      }
    });

  it("돌진 통로는 지도 안에 있고 아무 소품도 막지 않는다", () => {
    const half = Math.max(PK_RUSH.width, PK_LANE_W) / 2 + 2;
    for (const v of ROOMS) {
      expect(pkLanes(v).length).toBeGreaterThan(0);
      for (const seed of [1, 5, 31337]) {
        const l = layoutVariant("pk_parking", v, seed);
        for (const lane of pkLanes(v)) {
          if (lane.hor) expect(lane.at - half).toBeGreaterThanOrEqual(TOP);
          else expect(lane.at - half).toBeGreaterThanOrEqual(SIDE);
          expect(lane.at + half).toBeLessThanOrEqual(lane.hor ? AH - SIDE : AW - SIDE);
          for (const s of l.solids) {
            const [lo, hi] = s.t === "c" ? (lane.hor ? [s.y - s.r, s.y + s.r] : [s.x - s.r, s.x + s.r]) : lane.hor ? [s.y, s.y + s.h] : [s.x, s.x + s.w];
            const clear = hi <= lane.at - half || lo >= lane.at + half;
            expect(clear, `${PK_ROOM_NAMES[v]} lane ${lane.hor ? "y" : "x"}=${lane.at} vs ${JSON.stringify(s)}`).toBe(true);
          }
        }
      }
    }
  });

  it("모든 소품 그림 크기가 정해져 있다", () => {
    for (const v of ROOMS) for (const p of layoutVariant("pk_parking", v, 3).props.filter((p) => p.kind.startsWith("pk_"))) expect(PK_PROP_META[p.kind as keyof typeof PK_PROP_META]).toBeDefined();
  });
});
