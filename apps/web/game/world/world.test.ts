import { describe, expect, it } from "vitest";
import {
  ALTAR,
  FURNITURE,
  GRID_COLS,
  MAP_WIDTH,
  REVIVE_SLOTS,
  SEATS,
  SHOP,
  SHOP_DOOR,
  SPAWN,
  graveSlot,
  mapHeight,
} from "@tomb/protocol";
import { ambienceAt } from "@/lib/ambience";
import { LevelBlender, levelsFor, mixColor } from "./ambienceMix";
import { cameraBounds, clampZoom, parseStoredZoom, pinchZoom, snapZoom, stepZoom, approach } from "./cameraMath";
import { buildLayout, graveAt, layoutSignature, nearestGrave, standSpot, visibleRows } from "./graveLayout";
import { UPPER_PROPS, furnitureCollider, gridProps, groundKind, nearShopDoor, pondColliders, propCollider, shopCollider, type Rect } from "./layout";

const graves = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `g${i}`, ageDays: (i * 37) % 800, flowers: i % 9, revives: i % 5 }));

const inside = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

describe("static layout", () => {
  const colliders = [
    ...UPPER_PROPS.map(propCollider),
    ...gridProps(60).map(propCollider),
    ...FURNITURE.map(furnitureCollider),
    ...pondColliders(),
    shopCollider(),
  ].filter((r): r is Rect => !!r);

  it("spawn, revive stand spots and grid stand spots are walkable", () => {
    const spots = [SPAWN, SHOP_DOOR, ...REVIVE_SLOTS.map(standSpot), ...Array.from({ length: 200 }, (_, i) => standSpot(graveSlot(i)))];
    for (const s of spots) for (const c of colliders) expect(inside(c, s.x, s.y, 2), JSON.stringify([s, c])).toBe(false);
  });

  it("props do not sit on graves or seats", () => {
    const props = [...UPPER_PROPS, ...gridProps(60)].filter((p) => p.kind !== "altar" && p.kind !== "table");
    const points = [...REVIVE_SLOTS, ...SEATS, ...Array.from({ length: 600 }, (_, i) => graveSlot(i))];
    for (const p of props) for (const q of points) expect(Math.hypot(p.x - q.x, p.y - q.y), JSON.stringify([p, q])).toBeGreaterThan(14);
  });

  it("shop hut sits in the left garden away from seats and props; its door is reachable", () => {
    const hut = shopCollider();
    // 오두막 앞 벤치는 있어도 되지만 오두막·문 앞을 막으면 안 된다
    for (const f of FURNITURE) {
      const c = furnitureCollider(f);
      expect(c.x + c.w < hut.x || c.x > hut.x + hut.w || c.y + c.h < hut.y || c.y > hut.y + hut.h, f.id).toBe(true);
      expect(inside(c, SHOP_DOOR.x, SHOP_DOOR.y, 4), f.id).toBe(false);
    }
    expect(Math.hypot(SHOP.x - SHOP_DOOR.x, SHOP.y - SHOP_DOOR.y)).toBeLessThan(20);
    for (const p of UPPER_PROPS) {
      const c = propCollider(p);
      if (c) expect(c.x + c.w < hut.x || c.x > hut.x + hut.w || c.y + c.h < hut.y || c.y > hut.y + hut.h, JSON.stringify(p)).toBe(true);
    }
    expect(nearShopDoor(SHOP_DOOR.x, SHOP_DOOR.y)).toBe(true);
    expect(nearShopDoor(SHOP_DOOR.x, SHOP_DOOR.y + 30)).toBe(false);
  });

  it("there are plenty of seats (40+) with unique ids, all inside the walls", () => {
    expect(SEATS.length).toBeGreaterThanOrEqual(40);
    expect(new Set(SEATS.map((s) => s.id)).size).toBe(SEATS.length);
    for (const s of SEATS) {
      expect(s.x).toBeGreaterThan(32);
      expect(s.x).toBeLessThan(MAP_WIDTH - 32);
    }
  });

  it("seat anchors stay reachable (stand point is outside furniture)", () => {
    for (const s of SEATS) for (const c of colliders) expect(inside(c, s.x, s.y + 9)).toBe(false);
  });

  it("ground: walls, gate, aisle and row paths", () => {
    expect(groundKind(0, 5)).toBe("wallSide");
    expect(groundKind(5, 0)).toBe("wallTop");
    expect(groundKind(31, 0)).toBe("gate");
    expect(groundKind(31, 40)).toBe("dirt"); // 중앙 통로
    expect(groundKind(16, 40)).toBe("dirt"); // 블록 사이 산책로
    expect(groundKind(62, 5)).toBe("wallSide");
    expect(groundKind(5, (graveSlot(0).y + 16) / 16)).toBe("dirt");
    expect(groundKind(5, (graveSlot(0).y - 16) / 16)).toBe("grass");
    expect(groundKind(Math.floor(ALTAR.x / 16), Math.floor((ALTAR.y + 8) / 16))).toBe("stone");
  });
});

describe("grave layout", () => {
  it("grid order follows index; top revive graves move to the altar and leave an empty plot", () => {
    const list = graves(25);
    const l = buildLayout(list, ["g7", "g3"]);
    expect(l.placements[0]).toMatchObject({ x: graveSlot(0).x, y: graveSlot(0).y, rank: -1 });
    expect(l.byId.get("g7")).toMatchObject({ x: REVIVE_SLOTS[0].x, y: REVIVE_SLOTS[0].y, rank: 0 });
    expect(l.revive[1]?.id).toBe("g3");
    expect(l.promoted[7]).toBe(1);
    expect(l.promoted[8]).toBe(0);
    expect(l.rows).toBe(Math.ceil(25 / GRID_COLS));
  });

  it("ignores unknown ids in reviveTop and caps at 10", () => {
    const l = buildLayout(graves(30), ["nope", ...Array.from({ length: 15 }, (_, i) => `g${i}`)]);
    expect(l.revive.filter(Boolean).length).toBe(10);
  });

  it("visibleRows only covers the camera band", () => {
    const top = graveSlot(GRID_COLS * 10).y - 100;
    const [r0, r1] = visibleRows(top, top + 360, 50);
    expect(r0).toBeGreaterThanOrEqual(7);
    expect(r1).toBeLessThanOrEqual(16);
    expect(visibleRows(0, 200, 50)[1]).toBeLessThan(0);
  });

  it("nearestGrave / graveAt find the right grave quickly", () => {
    const l = buildLayout(graves(500), ["g499"]);
    const p = l.placements[123];
    const s = standSpot(p);
    expect(nearestGrave(l, s.x, s.y, 26)?.p.id).toBe("g123");
    expect(graveAt(l, p.x, p.y - 5)?.id).toBe("g123");
    // 올라간 묘비의 빈 자리는 비어 있다
    const empty = graveSlot(499);
    expect(graveAt(l, empty.x, empty.y - 5)).toBeNull();
    expect(nearestGrave(l, REVIVE_SLOTS[0].x, REVIVE_SLOTS[0].y + 16, 26)?.p.id).toBe("g499");
  });

  it("signature ignores counts, tracks order/tier/revive", () => {
    const a = graves(5);
    const b = a.map((g) => ({ ...g, flowers: g.flowers + 10 }));
    expect(layoutSignature(a, [])).toBe(layoutSignature(b, []));
    expect(layoutSignature(a, ["g1"])).not.toBe(layoutSignature(a, []));
  });

  it("map grows with rows", () => {
    expect(mapHeight(500)).toBeGreaterThan(mapHeight(10));
    expect(graveSlot(9).x).toBeLessThan(MAP_WIDTH);
  });
});

describe("camera math", () => {
  it("zoom steps by 0.5 within [1.5, 5]", () => {
    expect(stepZoom(3, 1)).toBe(3.5);
    expect(stepZoom(3, -100)).toBe(2.5);
    expect(stepZoom(5, 1)).toBe(5);
    expect(stepZoom(1.5, -1)).toBe(1.5);
    expect(snapZoom(2.74)).toBe(2.5);
    expect(clampZoom(NaN)).toBe(3);
    expect(pinchZoom(3, 100, 200)).toBe(5);
    expect(pinchZoom(3, 100, 75)).toBeCloseTo(2.25);
  });

  it("restores stored zoom safely", () => {
    expect(parseStoredZoom(null)).toBe(3);
    expect(parseStoredZoom("4.5")).toBe(4.5);
    expect(parseStoredZoom("99")).toBe(5);
    expect(parseStoredZoom("abc")).toBe(3);
  });

  it("centers the map when the view is wider/taller than the map", () => {
    expect(cameraBounds(400, 300, 640, 960)).toEqual({ x: 0, y: 0, w: 640, h: 960 });
    expect(cameraBounds(840, 300, 640, 960)).toEqual({ x: -100, y: 0, w: 840, h: 960 });
    expect(cameraBounds(400, 1160, 640, 960).y).toBe(-100);
  });

  it("approach converges smoothly", () => {
    const a = approach(0, 1, 16, 80);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(approach(0, 1, 2000, 80)).toBeCloseTo(1, 5);
  });
});

describe("ambience mix", () => {
  const night = ambienceAt(0, { hour: 23, weather: "clear" });
  const rainyDay = ambienceAt(0, { hour: 12, weather: "rain" });

  it("maps weather to effect levels", () => {
    expect(levelsFor(night).rain).toBe(0);
    expect(levelsFor(rainyDay).rain).toBeGreaterThan(0);
    expect(levelsFor(night).darkness).toBeGreaterThan(levelsFor(rainyDay).darkness);
    expect(levelsFor(ambienceAt(0, { hour: 23, weather: "fog" })).fog).toBeGreaterThan(levelsFor(night).fog);
  });

  it("blends over ~2.5s instead of jumping", () => {
    const bl = new LevelBlender(levelsFor(night), 2500);
    bl.setTarget(levelsFor(rainyDay), 1000);
    const mid = { ...bl.update(2250) };
    expect(mid.darkness).toBeLessThan(levelsFor(night).darkness);
    expect(mid.darkness).toBeGreaterThan(levelsFor(rainyDay).darkness);
    expect(mid.rain).toBeGreaterThan(0);
    expect(mid.rain).toBeLessThan(levelsFor(rainyDay).rain);
    const end = bl.update(3600);
    expect(end.rain).toBeCloseTo(levelsFor(rainyDay).rain, 5);
    expect(end.tint).toBe(levelsFor(rainyDay).tint);
  });

  it("mixColor blends per channel", () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
});
