import { CAMPFIRES, MAP_HEIGHT, MAP_WIDTH } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { walkableGrid, WALK } from "../layout";
import { critterGrid, restable } from "./critterSim";
import { DOGS, DogSim, dogSpots, fireNear } from "./dogSim";

// 마을 강아지: 쉼 자리가 걷기 가능한 곳, 모닥불 앞 자리, 결정성(같은 채널·시각 = 같은 자리), 막힌 칸·물 피하기

describe("dogs", () => {
  it("village dogs with different colors, plus the bichon 우유", () => {
    expect(DOGS.length).toBeGreaterThanOrEqual(3);
    expect(DOGS.length).toBeLessThanOrEqual(4);
    expect(new Set(DOGS.map((d) => d.variant)).size).toBe(DOGS.length);
    const uyu = DOGS.find((d) => d.name === "우유");
    expect(uyu?.special?.petLines).toEqual(["왈!", "간식 주세요…", "산책 가요!", "♡"]);
  });

  it("우유 sometimes spins in place and always sleeps by the fire (deterministic)", () => {
    const i = DOGS.findIndex((d) => d.id === "uyu");
    const a = new DogSim(DOGS[i], i, 7);
    const b = new DogSim(DOGS[i], i, 7);
    const t0 = Date.UTC(2026, 10, 12, 0, 0, 0);
    let spin = 0;
    for (let t = t0; t < t0 + 3 * 3600_000; t += 300) {
      const p = a.at(t);
      expect(b.at(t).act).toBe(p.act);
      if (p.act === "spin") spin++;
      if (p.fire) expect(["sit", "sleep"]).toContain(p.act);
    }
    expect(spin).toBeGreaterThan(0);
  });

  it("rest spots are on open dry ground, including a spot in front of a campfire", () => {
    const g = critterGrid();
    for (const def of DOGS) {
      const spots = dogSpots(def, g);
      expect(spots.length, def.id).toBeGreaterThanOrEqual(4);
      for (const s of spots) expect(restable(g, s.x, s.y), `${def.id} ${s.x},${s.y}`).toBe(true);
      expect(spots.some((s) => fireNear(s.x, s.y)), def.id).toBe(true);
    }
    expect(CAMPFIRES.length).toBeGreaterThan(0);
  });

  it("is deterministic: two browsers asking in different order agree", () => {
    const t0 = Date.UTC(2026, 10, 12, 3, 0, 0);
    DOGS.forEach((def, i) => {
      const a = new DogSim(def, i, 1);
      const b = new DogSim(def, i, 1);
      const times = Array.from({ length: 60 }, (_, k) => t0 + k * 3_301);
      const ra = times.map((t) => ({ ...a.at(t) }));
      const rb = [...times].reverse().map((t) => ({ ...b.at(t) })).reverse();
      expect(rb).toEqual(ra);
    });
  });

  it("walks only through open cells, sniffs on the way and lies by the fire", () => {
    const w = walkableGrid(8);
    const t0 = Date.UTC(2026, 10, 12, 0, 0, 0);
    const acts = new Set<string>();
    let fire = 0;
    DOGS.forEach((def, i) => {
      const sim = new DogSim(def, i, 3);
      for (let t = t0; t < t0 + 2 * 3600_000; t += 600) {
        const p = sim.at(t);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(MAP_WIDTH);
        expect(p.y).toBeLessThan(MAP_HEIGHT);
        // 길 다듬기(smoothPath)가 막힌 칸 모서리를 1px 안쪽으로 스칠 수 있어 1px 여유를 둔다
        const open = [0, -1, 1].some((ox) => [0, -1, 1].some((oy) => w.cells[Math.floor((p.y + oy) / 8) * w.cols + Math.floor((p.x + ox) / 8)] === WALK.open));
        expect(open, `${def.id} at ${Math.round(p.x)},${Math.round(p.y)}`).toBe(true);
        acts.add(p.act);
        if (p.fire && (p.act === "lie" || p.act === "sleep")) fire++;
      }
    });
    for (const a of ["walk", "sniff", "sit", "lie", "spin"]) expect(acts.has(a), a).toBe(true);
    expect(fire).toBeGreaterThan(0);
  });
});
