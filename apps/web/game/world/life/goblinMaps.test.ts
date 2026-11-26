import { GOBLIN_LIFE_MS, GOBLIN_MAP_ODDS, GOBLIN_ROUTES, SEA_GOBLIN_ROUTES, goblinPos, goblinRoute, pickGoblinMap, seaWet } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { checkGoblinRoutes } from "./goblinRouteCheck";
import { seaStandable, seaWalkGrid } from "../../sea/seaLayout";

// 11/26 황금 고블린 맵 무작위: 바닷가·캠핑장 길이 걸을 수 있는 땅 위인지 (사람이 다가가 잡을 수 있게), 맵 확률.
// 캠핑장 길은 goblinCampRoutes.test.ts (캠핑장 맵 개편 중이라 따로).


describe("11/26 goblin routes on the sea and camp maps", () => {
  it("sea: boardwalk and dry sand only (even at the highest tide), never through loungers or tables", () => {
    expect(SEA_GOBLIN_ROUTES.length).toBeGreaterThanOrEqual(3);
    checkGoblinRoutes(SEA_GOBLIN_ROUTES, seaStandable, (x, y) => seaWet(x, y, 1, 0), seaWalkGrid(8));
  });

  it("goblinPos stays on the map's route for the whole 3 minutes (server and client compute the same)", () => {
    for (const m of ["sea", "camp"] as const) {
      for (let seed = 11; seed < 11 + 8; seed++) {
        const g = { seed, at: 5_000, m };
        const pts = goblinRoute(seed, m).pts;
        for (let t = g.at; t <= g.at + GOBLIN_LIFE_MS; t += 997) {
          const p = goblinPos(g, t);
          expect(goblinPos({ ...g }, t)).toEqual(p);
          // 두 점 사이 선분 가까이 (두리번 흔들림 몇 px)
          let best = Infinity;
          for (let i = 0; i < pts.length; i++) {
            const [ax, ay] = pts[i];
            for (const [bx, by] of [pts[(i + 1) % pts.length], pts[(i - 1 + pts.length) % pts.length]]) {
              const L = Math.hypot(bx - ax, by - ay) || 1;
              const u = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / (L * L)));
              best = Math.min(best, Math.hypot(p.x - (ax + (bx - ax) * u), p.y - (ay + (by - ay) * u)));
            }
          }
          expect(best, `${m} ${seed} @${t}`).toBeLessThan(4);
        }
      }
    }
  });

  it("village routes are untouched (old clients compute the same village goblin)", () => {
    expect(GOBLIN_ROUTES).toHaveLength(8);
    for (const seed of [0, 1, 7, 123456, 987654321]) expect(goblinRoute(seed)).toBe(goblinRoute(seed, "village"));
    expect(goblinRoute(5).zone).toBe(GOBLIN_ROUTES[5].zone);
  });

  it("map odds 34 · 33 · 33, closed maps fall back to the village", () => {
    expect(GOBLIN_MAP_ODDS.reduce((a, o) => a + o.p, 0)).toBeCloseTo(1, 9);
    const all = () => true;
    expect(pickGoblinMap(0, all)).toBe("village");
    expect(pickGoblinMap(0.3399, all)).toBe("village");
    expect(pickGoblinMap(0.34, all)).toBe("sea");
    expect(pickGoblinMap(0.6699, all)).toBe("sea");
    expect(pickGoblinMap(0.67, all)).toBe("camp");
    expect(pickGoblinMap(0.9999, all)).toBe("camp");
    expect(pickGoblinMap(0.5)).toBe("village");
    expect(pickGoblinMap(0.8, (m) => m !== "camp")).toBe("village");
  });
});
