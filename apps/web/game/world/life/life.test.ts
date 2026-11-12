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

describe("까마귀 연못의 까마귀 (crowSim)", async () => {
  const { CROW_COUNT, CROW_POND, CrowSim, crowPerches } = await import("./crowSim");
  it("연못 둘레 마른 나무 가지·오래된 비석에 앉을 자리가 여럿 있고, 2~4마리", () => {
    const perches = crowPerches();
    expect(CROW_COUNT).toBeGreaterThanOrEqual(2);
    expect(CROW_COUNT).toBeLessThanOrEqual(4);
    expect(perches.length).toBeGreaterThanOrEqual(4);
    expect(perches.some((p) => p.kind === "tree")).toBe(true);
    expect(perches.some((p) => p.kind === "grave")).toBe(true);
    for (const p of perches) expect(Math.hypot(p.x - CROW_POND.x, p.y - CROW_POND.y)).toBeLessThan(CROW_POND.rx + 120);
  });

  it("결정적: 두 브라우저(다른 순서로 묻기)가 같은 자리를 본다, 채널마다 다르다", () => {
    const t0 = Date.UTC(2026, 10, 12, 3, 0, 0);
    for (let i = 0; i < CROW_COUNT; i++) {
      const a = new CrowSim(i, 1);
      const b = new CrowSim(i, 1);
      const times = Array.from({ length: 60 }, (_, k) => t0 + k * 1_337);
      const ra = times.map((t) => ({ ...a.at(t) }));
      const rb = [...times].reverse().map((t) => ({ ...b.at(t) })).reverse();
      expect(rb).toEqual(ra);
    }
    const c1 = Array.from({ length: CROW_COUNT }, (_, i) => new CrowSim(i, 1).at(t0));
    const c2 = Array.from({ length: CROW_COUNT }, (_, i) => new CrowSim(i, 2).at(t0));
    expect(c1.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).not.toEqual(c2.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  });

  it("앉았다가 연못 위를 돌며 날고, 끊김 없이 다음 자리에 내려앉는다 (튀는 순간이 없다)", () => {
    const t0 = Date.UTC(2026, 10, 12, 3, 0, 0);
    for (let i = 0; i < CROW_COUNT; i++) {
      const sim = new CrowSim(i, 3);
      let prev = sim.at(t0);
      let flew = 0;
      let sat = 0;
      let tilted = 0;
      let cawed = 0;
      for (let t = t0 + 50; t < t0 + sim.legMs * 6; t += 50) {
        const p = sim.at(t);
        // 50ms 사이에 크게 튀지 않는다 (순간이동 없음)
        expect(Math.hypot(p.x - prev.x, p.y - p.lift - (prev.y - prev.lift)), `crow${i} @${t - t0}`).toBeLessThan(12);
        if (p.flying) {
          flew++;
          // 원을 도는 동안은 연못 근처 하늘
          expect(Math.hypot(p.x - CROW_POND.x, p.y - CROW_POND.y)).toBeLessThan(CROW_POND.rx + 140);
        } else {
          sat++;
          expect(p.perch).not.toBeNull();
          if (p.tilt) tilted++;
        }
        if (p.cawAt >= 0) cawed++;
        prev = p;
      }
      expect(flew).toBeGreaterThan(50);
      expect(sat).toBeGreaterThan(50);
      expect(tilted).toBeGreaterThan(0);
      expect(cawed).toBeGreaterThan(0);
    }
  });
});
