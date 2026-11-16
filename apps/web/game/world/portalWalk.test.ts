import { describe, expect, it } from "vitest";
import { HOUSE_LOTS, HUNT_GATE, PORTAL_RADIUS, SHOP_DOOR, SPAWN } from "@tomb/protocol";
import { AutoWalk } from "../logic/autoWalk";
import type { MoveInput } from "../logic/movement";
import { findPath, lineOfSight, type Pt, type Rect, type WalkGrid } from "../logic/pathfind";
import { allFurnitureColliders, houseCollider, inWater, PLAZA_FIRE, PLAZA_WELL, staticColliders, standable } from "./layout";
import { PORTAL_WALK, villageBounds, WALK_CELL, WalkGridCache, walkGridOf } from "./portalWalk";
import { nearestSafeGround } from "./walkReach";
import { HUNT_AWAY_TOAST, huntPress, huntWalkHint, walkingAfter } from "@/lib/huntWalk";

// 11/16 [사냥] → 사냥터 입구까지 걸어가기: 장면(GraveWalker)과 같은 격자 규칙으로 마을 충돌체 위에서 길을 찾는다

/** 장면의 정적 충돌 (맵·의자·벤치 + 집이 모두 선 필지 — 가장 막힌 경우) */
function villageRects(): Rect[] {
  return [...staticColliders(), ...allFurnitureColliders(), ...HOUSE_LOTS.map((l) => houseCollider(l, "manor"))];
}

const rects = villageRects();
const dry = walkGridOf(villageBounds(), rects, inWater);
const wet = walkGridOf(villageBounds(), rects);

/** 경로의 모든 구간이 막힌 칸을 지나지 않는지 */
function clear(g: WalkGrid, from: Pt, path: readonly Pt[]): boolean {
  let prev = from;
  for (const p of path) {
    if (!lineOfSight(g, prev, p)) return false;
    prev = p;
  }
  return true;
}

/**
 * 발(발바닥 가운데 조금 위)이 충돌 사각형 안에 들어가는지. 격자는 칸 가운데로 판정해 모서리를 1~2px 스칠 수는 있다 (물리가 미끄러뜨린다) —
 * 몸이 충돌체를 뚫고 지나가는 길만 잡는다
 */
function hits(p: Pt): boolean {
  const x = p.x;
  const y = p.y - 2;
  return rects.some((r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h);
}

/** 웨이포인트 사이를 1px 간격으로 걸으며 충돌체에 닿는 점이 있는지 */
function bumps(from: Pt, path: readonly Pt[]): Pt | null {
  let prev = from;
  for (const p of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y)));
    for (let i = 0; i <= n; i++) {
      const q = { x: prev.x + ((p.x - prev.x) * i) / n, y: prev.y + ((p.y - prev.y) * i) / n };
      if (hits(q)) return q;
    }
    prev = p;
  }
  return null;
}

const ground = (x: number, y: number): Pt => {
  const g = nearestSafeGround(x, y, 64);
  if (!g) throw new Error(`no ground near ${x},${y}`);
  return g;
};

const STARTS: Record<string, Pt> = {
  spawn: SPAWN,
  plaza: ground(PLAZA_WELL.x + 20, PLAZA_WELL.y + 20),
  campfire: ground(PLAZA_FIRE.x, PLAZA_FIRE.y + 40),
  shop: SHOP_DOOR,
  house: ground(HOUSE_LOTS[0].door.x, HOUSE_LOTS[0].door.y + 4),
  farHouse: ground(HOUSE_LOTS[HOUSE_LOTS.length - 1].door.x, HOUSE_LOTS[HOUSE_LOTS.length - 1].door.y + 4),
};

describe("사냥터 입구까지 걷기 — 길찾기", () => {
  const { goal, face } = PORTAL_WALK.hunt;

  it("설 자리는 입구 상호작용 반경 안이고 서 있을 수 있는 땅", () => {
    expect(Math.hypot(goal.x - HUNT_GATE.x, goal.y - HUNT_GATE.y)).toBeLessThan(PORTAL_RADIUS);
    expect(standable(goal.x, goal.y)).toBe(true);
    expect(inWater(goal.x, goal.y)).toBe(false);
    expect(face.y).toBeLessThan(goal.y); // 동굴(위)을 바라본다
  });

  for (const [name, from] of Object.entries(STARTS)) {
    it(`${name}에서 입구까지 길이 있고 충돌체를 지나지 않는다`, () => {
      expect(standable(from.x, from.y)).toBe(true);
      const path = findPath(dry, from, goal) ?? findPath(wet, from, goal);
      expect(path, name).not.toBeNull();
      const p = path!;
      // 끝은 정확히 설 자리 (막힌 칸으로 옮기지 않았다)
      expect(p[p.length - 1]).toEqual(goal);
      expect(clear(dry, from, p) || clear(wet, from, p)).toBe(true);
      expect(bumps(from, p)).toBeNull();
    });
  }

  it("막힌 곳(충돌체 안)을 목표로 주면 그 칸이 아니라 가까운 빈 칸까지", () => {
    const shop = rects.find((r) => r.w >= 24 && r.h >= 16)!;
    const inside = { x: shop.x + shop.w / 2, y: shop.y + shop.h / 2 };
    expect(dry.blocked(Math.floor((inside.x - dry.ox) / WALK_CELL), Math.floor((inside.y - dry.oy) / WALK_CELL))).toBe(true);
    const p = findPath(dry, SPAWN, inside, { snapRadius: 8 });
    if (p) expect(hits(p[p.length - 1])).toBe(false);
  });

  it("스폰에서 자동 걷기로 따라가면 입구에 도착한다 (평소 걸음, 막히지 않음)", () => {
    const w = new AutoWalk();
    const from = { ...STARTS.plaza };
    expect(w.start("portal:hunt", from, goal, face, dry, 0)).toBe("started");
    const out: MoveInput = { ax: 0, ay: 0, run: false };
    const pos = { ...from };
    const SPEED = 60 / 1000; // px/ms (걷기)
    let t = 0;
    let step = "walking";
    while (t < 120_000 && step === "walking") {
      t += 16;
      step = w.steer(pos, t, out);
      pos.x += out.ax * SPEED * 16;
      pos.y += out.ay * SPEED * 16;
      expect(hits(pos)).toBe(false);
    }
    expect(step).toBe("arrived");
    expect(Math.hypot(pos.x - goal.x, pos.y - goal.y)).toBeLessThan(PORTAL_RADIUS);
  });
});

describe("WalkGridCache", () => {
  it("같은 키·ttl 안이면 다시 만들지 않고, 키가 바뀌거나 시간이 지나면 새로", () => {
    const c = new WalkGridCache(1000);
    let n = 0;
    const build = () => {
      n++;
      return dry;
    };
    c.get("a", 0, build);
    c.get("a", 500, build);
    expect(n).toBe(1);
    c.get("b", 600, build);
    expect(n).toBe(2);
    c.get("b", 1700, build);
    expect(n).toBe(3);
    c.clear();
    c.get("b", 1701, build);
    expect(n).toBe(4);
  });
});

describe("[사냥] 버튼 (lib/huntWalk)", () => {
  it("마을에서 아무것도 안 탔으면 걷는다", () => {
    expect(huntPress({ map: "village", walking: false, rideWhy: null })).toEqual({ do: "walk" });
  });
  it("걷는 중에 다시 누르면 멈춘다 (어디서든)", () => {
    expect(huntPress({ map: "village", walking: true, rideWhy: null })).toEqual({ do: "cancel" });
    expect(huntPress({ map: "village", walking: true, rideWhy: "배에서 내린 다음에 사냥터에 갈 수 있어요." })).toEqual({ do: "cancel" });
  });
  it("캠핑장·바닷가에서는 걷지 않고 안내만", () => {
    expect(huntPress({ map: "camp", walking: false, rideWhy: null })).toEqual({ do: "toast", message: HUNT_AWAY_TOAST });
    expect(huntPress({ map: "sea", walking: false, rideWhy: null })).toEqual({ do: "toast", message: HUNT_AWAY_TOAST });
  });
  it("탈것에 타 있으면 막는다 (안내 문구 그대로)", () => {
    const why = "오리배에서 내린 다음에 사냥터에 갈 수 있어요.";
    expect(huntPress({ map: "village", walking: false, rideWhy: why })).toEqual({ do: "toast", message: why });
  });
  it("걷기 상태: started만 걷는 중", () => {
    expect(walkingAfter("started")).toBe(true);
    for (const s of ["arrived", "cancelled", "unreachable", undefined] as const) expect(walkingAfter(s)).toBe(false);
  });
  it("안내 문구 (데스크톱 방향키, 터치 조이스틱)", () => {
    expect(huntWalkHint(false)).toBe("사냥터로 가는 중… (방향키로 멈춰요)");
    expect(huntWalkHint(true)).toContain("조이스틱");
  });
});
