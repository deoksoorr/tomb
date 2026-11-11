import { GOBLIN_ROUTES, MAP_HEIGHT, MAP_WIDTH, TELESCOPE_SPOT, goblinPos, spotSeatId, seatSlot, STATE, spotKindOfState, SPOT_KINDS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { lineOfSight } from "../../logic/pathfind";
import { inWater, interactables, standable, walkableGrid, WALK } from "../layout";
import { CRITTERS, CritterSim, critterGrid, restSpots, restable } from "./critterSim";

// 22번 마을 생물: 결정성(같은 채널·시각 = 같은 자리), 물·충돌 피하기, 고블린 경로, 망원경·돗자리 자리

describe("critters (cats · ghosts)", () => {
  it("every critter has several rest spots, all on open dry ground", () => {
    const g = critterGrid();
    for (const def of CRITTERS) {
      const spots = restSpots(def, g);
      expect(spots.length, def.id).toBeGreaterThanOrEqual(3);
      for (const s of spots) {
        expect(restable(g, s.x, s.y), `${def.id} ${s.x},${s.y}`).toBe(true);
        expect(inWater(s.x, s.y)).toBe(false);
      }
    }
  });

  it("is deterministic: two independent simulators (two browsers) agree at any time", () => {
    const t0 = Date.UTC(2026, 10, 12, 3, 0, 0);
    CRITTERS.forEach((def, i) => {
      const a = new CritterSim(def, i, 1);
      const b = new CritterSim(def, i, 1);
      // b는 다른 순서로 묻는다 (늦게 들어온 사람)
      const times = Array.from({ length: 40 }, (_, k) => t0 + k * 7_919);
      const ra = times.map((t) => ({ ...a.at(t) }));
      const rb = [...times].reverse().map((t) => ({ ...b.at(t) })).reverse();
      expect(rb).toEqual(ra);
    });
  });

  it("different channels place cats differently", () => {
    const t = Date.UTC(2026, 10, 12, 3, 0, 0);
    const a = CRITTERS.map((d, i) => new CritterSim(d, i, 1).at(t));
    const b = CRITTERS.map((d, i) => new CritterSim(d, i, 2).at(t));
    expect(a.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).not.toEqual(b.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  });

  it("walks only through open dry cells (never water, walls, props, houses)", () => {
    const w = walkableGrid(8);
    const t0 = Date.UTC(2026, 10, 12, 0, 0, 0);
    let walked = 0;
    CRITTERS.forEach((def, i) => {
      const sim = new CritterSim(def, i, 3);
      for (let t = t0; t < t0 + 30 * 60_000; t += 700) {
        const p = sim.at(t);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(MAP_WIDTH);
        expect(p.y).toBeLessThan(MAP_HEIGHT);
        const c = w.cells[Math.floor(p.y / 8) * w.cols + Math.floor(p.x / 8)];
        expect(c, `${def.id} at ${Math.round(p.x)},${Math.round(p.y)}`).toBe(WALK.open);
        if (p.walking) walked++;
      }
    });
    expect(walked).toBeGreaterThan(50); // 실제로 돌아다닌다
  });
});

describe("golden goblin routes", () => {
  it("every route point is standable dry ground and hops never cross water", () => {
    const w = walkableGrid(8);
    const dry = { cols: w.cols, rows: w.rows, cell: 8, ox: 0, oy: 0, blocked: (cx: number, cy: number) => w.cells[cy * w.cols + cx] === WALK.water };
    for (const r of GOBLIN_ROUTES) {
      r.pts.forEach(([x, y], i) => {
        expect(standable(x, y), `${r.zone} #${i}`).toBe(true);
        expect(inWater(x, y)).toBe(false);
        const [nx, ny] = r.pts[(i + 1) % r.pts.length];
        expect(lineOfSight(dry, { x, y }, { x: nx, y: ny }), `${r.zone} #${i}→`).toBe(true);
      });
    }
  });

  it("goblinPos is identical for server and client and stays near its route", () => {
    const g = { seed: 123456, at: 1_000_000 };
    for (let t = g.at; t < g.at + 90_000; t += 333) {
      const a = goblinPos(g, t);
      const b = goblinPos({ ...g }, t);
      expect(b).toEqual(a);
      expect(inWater(a.x, a.y)).toBe(false);
    }
  });
});

describe("stargazing hill spots", () => {
  it("telescope and mats are 1-person spots the server understands, without stealing ordinary poses", () => {
    const items = interactables();
    const scope = items.find((o) => o.kind === "telescope")!;
    expect(scope).toBeDefined();
    expect(standable(TELESCOPE_SPOT.x, TELESCOPE_SPOT.y)).toBe(true);
    const mats = items.filter((o) => o.kind === "mat");
    expect(mats.length).toBeGreaterThanOrEqual(2);
    const sid = spotSeatId("telescope", scope.ax, scope.ay);
    expect(seatSlot(sid)).toMatchObject({ kind: "telescope", state: STATE.idle });
    expect(seatSlot(spotSeatId("mat", mats[0].ax, mats[0].ay))).toMatchObject({ kind: "mat", state: STATE.sitGround });
    // 서 있기·바닥 앉기 MOVE가 망원경·돗자리를 자동으로 잡지 않는다
    expect(spotKindOfState(STATE.idle)).toBeNull();
    expect(spotKindOfState(STATE.sitGround)).toBeNull();
    expect(spotKindOfState(SPOT_KINDS.hammock.state)).toBe("hammock");
  });
});
