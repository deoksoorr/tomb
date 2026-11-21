import { describe, expect, it } from "vitest";
import { DIR, FURNITURE, HOUSE_LOTS, SPAWN } from "@tomb/protocol";
import { findPath, lineOfSight, type Pt, type WalkGrid } from "../logic/pathfind";
import { allFurnitureColliders, houseCollider, inWater, interactables, staticColliders } from "./layout";
import { WHARF_BOARD } from "./fishZone";
import { PORTAL_WALK, villageBounds, walkGridOf } from "./portalWalk";
import { needRepath, nearestGoals, pathLength, reached, routeMarks, ROUTE_ARROW_EVERY, ROUTE_REPATH_MS, ROUTE_SKIP, ROUTE_SPACING } from "./routeGuideMath";
import { FIRST_ALL, FIRST_STEPS, firstGuideTarget, type FirstGuideTarget } from "@/lib/retain";

// 11/19 첫 걸음 길 안내 (RouteGuide): 표시 놓기·다시 찾기 판정·가까운 목적지 + 실제 마을 충돌 위에서 목적지마다 걷는 길이 이어지는지

describe("길 표시 놓기 (routeMarks)", () => {
  const from = { x: 0, y: 0 };
  const path = [{ x: 100, y: 0 }];

  it("간격마다 놓고, 발밑과 깃발 앞은 비우고, 세 번째마다 화살표", () => {
    const got: { x: number; arrow: boolean; angle: number }[] = [];
    routeMarks(from, path, 0, (x, _y, angle, arrow) => got.push({ x, arrow, angle }));
    expect(got.length).toBeGreaterThan(5);
    expect(got[0].x).toBeGreaterThanOrEqual(ROUTE_SKIP);
    expect(got[got.length - 1].x).toBeLessThanOrEqual(100 - ROUTE_SPACING);
    for (let i = 1; i < got.length; i++) expect(got[i].x - got[i - 1].x).toBeCloseTo(ROUTE_SPACING);
    const idx = got.flatMap((g, i) => (g.arrow ? [i] : []));
    expect(idx.length).toBeGreaterThan(1);
    for (let i = 1; i < idx.length; i++) expect(idx[i] - idx[i - 1]).toBe(ROUTE_ARROW_EVERY);
    expect(got.every((g) => g.angle === 0)).toBe(true);
  });

  it("위상을 밀면 무늬가 앞으로 흐르고, 한 주기를 돌면 제자리 (화살표 자리도 같이)", () => {
    const at = (phase: number) => {
      const out: string[] = [];
      routeMarks(from, path, phase, (x, _y, _a, arrow) => out.push(`${x.toFixed(2)}${arrow ? "A" : "."}`));
      return out;
    };
    const period = ROUTE_SPACING * ROUTE_ARROW_EVERY;
    expect(at(period)).toEqual(at(0));
    expect(at(3)).not.toEqual(at(0));
    // 화살표 하나를 따라가면 위상만큼 앞으로 간다
    const firstArrow = (phase: number) => {
      let ax = -1;
      routeMarks(from, path, phase, (x, _y, _a, arrow) => {
        if (arrow && ax < 0) ax = x;
      });
      return ax;
    };
    expect(firstArrow(4) - firstArrow(0)).toBeCloseTo(4);
  });

  it("꺾이는 길은 구간 방향으로 돌고, 화면 밖은 건너뛰고, 상한까지만", () => {
    const bend = [{ x: 60, y: 0 }, { x: 60, y: 60 }];
    const angles = new Set<number>();
    routeMarks(from, bend, 0, (_x, _y, a) => angles.add(Math.round(a * 100) / 100));
    expect([...angles].sort()).toEqual([0, 1.57]);
    const xs: number[] = [];
    routeMarks(from, path, 0, (x) => xs.push(x), { view: { x: 40, y: -10, width: 30, height: 20 } });
    expect(xs.every((x) => x >= 32 && x <= 78)).toBe(true);
    expect(routeMarks(from, path, 0, () => undefined, { max: 2 })).toBe(2);
    expect(routeMarks(from, [], 0, () => undefined)).toBe(0);
  });

  it("길 길이", () => {
    expect(pathLength({ x: 0, y: 0 }, [{ x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });
});

describe("다시 찾기·목적지", () => {
  it("0.5초가 지났고 칸이 바뀔 때만 다시 찾는다 (목적지가 바뀌면 바로)", () => {
    const first = needRepath(null, { x: 10, y: 10 }, 0)!;
    expect(first).toBe("1,1");
    const last = { cell: first, at: 0 };
    expect(needRepath(last, { x: 30, y: 10 }, ROUTE_REPATH_MS - 1)).toBeNull();
    expect(needRepath(last, { x: 12, y: 12 }, ROUTE_REPATH_MS + 1)).toBeNull();
    expect(needRepath(last, { x: 30, y: 10 }, ROUTE_REPATH_MS + 1)).toBe("3,1");
    expect(needRepath(last, { x: 12, y: 12 }, 1, true)).toBe("1,1");
  });

  it("가까운 순 몇 개, 닿음 판정", () => {
    const list = [{ x: 100, y: 0, r: 10 }, { x: 10, y: 0, r: 10 }, { x: 50, y: 0, r: 10 }, { x: 70, y: 0, r: 10 }];
    expect(nearestGoals(list, { x: 0, y: 0 }, 3).map((p) => p.x)).toEqual([10, 50, 70]);
    expect(reached({ x: 5, y: 0 }, list[1])).toBe(true);
    expect(reached({ x: 30, y: 0 }, list[1])).toBe(false);
  });
});

describe("첫 걸음 미션 목적지", () => {
  it("14개 미션 (11/21 별자리 512 뺌), 새 비트 4096·8192·16384, 갈 곳이 있는 미션만 목적지", () => {
    expect(FIRST_STEPS.length).toBe(14);
    expect(FIRST_ALL).toBe(32767 - 512);
    expect(FIRST_STEPS.find((s) => s.id === "quest")?.bit).toBe(16384);
    expect(firstGuideTarget("quest")).toBe("questBoard");
    expect(FIRST_STEPS.find((s) => s.id === "camp")?.bit).toBe(4096);
    expect(FIRST_STEPS.find((s) => s.id === "sea")?.bit).toBe(8192);
    const routed = FIRST_STEPS.filter((s) => firstGuideTarget(s.id)).map((s) => s.id);
    expect(routed).toEqual(["look", "sit", "fish", "gather", "hunt", "visit", "camp", "sea", "quest"]);
    for (const id of ["run", "jump", "emote", "chat", "bag"] as const) expect(firstGuideTarget(id)).toBeNull();
    // 안내 문구: 짧은 해요체, 「라벨: 설명」 콜론 없음
    for (const s of FIRST_STEPS.filter((x) => ["camp", "sea", "quest"].includes(x.id)))
      for (const t of [s.pc, s.touch]) {
        expect(t, s.id).toMatch(/요\.$/);
        expect(t).not.toContain(":");
      }
  });

  // 장면(GraveWalker.route)과 같은 격자 규칙 — 집이 모두 선 가장 막힌 마을에서 처음 자리부터 목적지마다 걷는 길이 있다
  const rects = [...staticColliders(), ...allFurnitureColliders(), ...HOUSE_LOTS.map((l) => houseCollider(l, "manor"))];
  const dry = walkGridOf(villageBounds(), rects, inWater);
  const wet = walkGridOf(villageBounds(), rects);
  const route = (from: Pt, to: Pt) => findPath(dry, from, to) ?? findPath(wet, from, to);
  const clear = (g: WalkGrid, from: Pt, path: readonly Pt[]) => {
    let prev = from;
    for (const p of path) {
      if (!lineOfSight(g, prev, p)) return false;
      prev = p;
    }
    return true;
  };
  const items = interactables();
  const goals: Partial<Record<FirstGuideTarget, Pt[]>> = {
    bench: FURNITURE.filter((f) => f.kind === "bench" && !f.campfire).map((f) => ({ x: f.x, y: f.y + (f.facing === DIR.up ? -10 : 10) })),
    stars: items.filter((o) => o.kind === "telescope"),
    hunt: [PORTAL_WALK.hunt.goal],
    busCamp: items.filter((o) => o.id === "bus:camp"),
    busSea: items.filter((o) => o.id === "bus:sea"),
    // 의뢰 게시판 앞 (WorldScene.resolveRoute · Foraging forage:board와 같은 자리)
    questBoard: [{ x: WHARF_BOARD.x, y: WHARF_BOARD.y + 12 }],
  };

  for (const [t, list] of Object.entries(goals)) {
    it(`처음 자리 → ${t} (가장 가까운 곳까지 길이 이어진다)`, () => {
      expect(list?.length, t).toBeGreaterThan(0);
      const near = nearestGoals(list!, SPAWN);
      const path = near.map((g) => route(SPAWN, g)).find((p) => p?.length);
      expect(path, t).toBeTruthy();
      expect(clear(wet, SPAWN, path!), t).toBe(true);
    });
  }
});
