import { describe, expect, it } from "vitest";
import {
  ALTAR,
  CAMPFIRES,
  DIR,
  FURNITURE,
  GRID_COLS,
  GRID_DY,
  GRID_Y0,
  HOUSING_DOOR,
  HOUSING_OFFICE,
  HUNT_GATE,
  SHRINE,
  MAP_WIDTH,
  REVIVE_SLOTS,
  SEATS,
  SHOP,
  SHOP_DOOR,
  SPAWN,
  campfireOfSeat,
  graveSlot,
  mapHeight,
} from "@tomb/protocol";
import { CAMPFIRE_HEAR_PX, CAMPFIRE_NEAR_MAX, campfireLevel, cineCenter, cineZoom, letterboxHeight, nearestCampfire } from "./campfireMath";
import { ambienceAt } from "@/lib/ambience";
import { LevelBlender, levelsFor, mixColor } from "./ambienceMix";
import { graveChannelFor } from "./graveChannel";
import { cameraBounds, clampZoom, parseStoredZoom, pinchZoom, snapZoom, stepZoom, approach } from "./cameraMath";
import { buildLayout, graveAt, layoutSignature, nearestGrave, standSpot, visibleRows } from "./graveLayout";
import {
  allCampfireColliders,
  BRIDGE_DECK,
  POND,
  POOL,
  UPPER_PROPS,
  WALK_XS,
  furnitureCollider,
  gridProps,
  groundKind,
  inWater,
  interactables,
  isLiveTree,
  nearShopDoor,
  nearWater,
  officeCollider,
  propCollider,
  shopCollider,
  type Rect,
} from "./layout";

const graves = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `g${i}`, ageDays: (i * 37) % 800, flowers: i % 9, revives: i % 5 }));

const inside = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

describe("static layout", () => {
  const colliders = [
    ...UPPER_PROPS.map(propCollider),
    ...gridProps(60).map(propCollider),
    ...FURNITURE.map(furnitureCollider),
    shopCollider(),
    officeCollider(),
  ].filter((r): r is Rect => !!r);

  it("spawn, revive stand spots and grid stand spots are walkable", () => {
    const spots = [
      SPAWN,
      SHOP_DOOR,
      HOUSING_DOOR,
      HUNT_GATE,
      SHRINE,
      ...REVIVE_SLOTS.map(standSpot),
      ...Array.from({ length: 960 }, (_, i) => standSpot(graveSlot(i))),
    ];
    for (const s of spots) for (const c of colliders) expect(inside(c, s.x, s.y, 2), JSON.stringify([s, c])).toBe(false);
  });

  it("props do not sit on graves or seats", () => {
    const props = [...UPPER_PROPS, ...gridProps(60)].filter((p) => p.kind !== "altar" && p.kind !== "table");
    const points = [...REVIVE_SLOTS, ...SEATS, ...Array.from({ length: 960 }, (_, i) => graveSlot(i))];
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

describe("v3 world objects", () => {
  const grid = (rows: number) => gridProps(rows);
  const collidersFor = (rows: number) =>
    [...UPPER_PROPS.map(propCollider), ...grid(rows).map(propCollider), ...FURNITURE.map(furnitureCollider), shopCollider(), officeCollider()].filter(
      (r): r is Rect => !!r,
    );

  it("grid props (rows 1/10/40) never block grave stand spots, walkway/aisle centers or row paths", () => {
    for (const rows of [1, 10, 40]) {
      const cs = collidersFor(rows);
      const props = grid(rows);
      for (let i = 0; i < rows * GRID_COLS; i++) {
        const st = standSpot(graveSlot(i));
        for (const c of cs) expect(inside(c, st.x, st.y, 3), JSON.stringify([rows, i, c])).toBe(false);
      }
      for (const p of props) {
        if (p.kind === "lantern") continue; // 석등은 예전부터 통로 가운데 3행마다 (주변으로 돌아갈 수 있다)
        for (const wx of [...WALK_XS, MAP_WIDTH / 2]) expect(Math.abs(p.x - wx), JSON.stringify(p)).toBeGreaterThan(12);
      }
      // 묘비 열 사이 소품은 묘비 자리(받침)와 겹치지 않는다
      for (const p of props) for (let c = 0; c < GRID_COLS; c++) {
        const slot = graveSlot(c);
        const row = Math.round((p.y - GRID_Y0) / GRID_DY);
        if (row < rows) expect(Math.hypot(p.x - slot.x, p.y - (GRID_Y0 + row * GRID_DY)), JSON.stringify(p)).toBeGreaterThan(14);
      }
    }
  });

  it("lots of trees in the grid area and down to the map bottom", () => {
    for (const rows of [1, 10, 40]) {
      const trees = grid(rows).filter((p) => isLiveTree(p.kind) || p.kind === "pine" || p.kind === "deadTree");
      expect(trees.length).toBeGreaterThanOrEqual(rows * 4);
      const bottom = Math.max(...trees.map((t) => t.y));
      expect(bottom).toBeGreaterThan(mapHeight(rows * GRID_COLS) - 200);
    }
    // 묘비가 몇 개 없어도 맵 최소 높이까지 공원이 채워진다
    expect(grid(1).filter((p) => p.y > 1000).length).toBeGreaterThan(30);
  });

  it("interactables: portals, trees, swing, bell, well — stable ids and reachable spots", () => {
    for (const rows of [0, 10, 40]) {
      const items = interactables(rows);
      const cs = collidersFor(rows);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const k of ["hunt", "housing", "shrine"]) expect(items.some((i) => i.kind === "portal" && i.portal === k)).toBe(true);
      for (const k of ["tree", "swing", "bell", "well"]) expect(items.some((i) => i.kind === k), k).toBe(true);
      for (const i of items) {
        for (const c of cs) expect(inside(c, i.ax, i.ay, 1), JSON.stringify([i, c])).toBe(false);
        expect(i.label.length).toBeGreaterThan(0);
        expect(i.r).toBeGreaterThan(0);
        expect(inWater(i.ax, i.ay), i.id).toBe(false);
      }
    }
    const a = interactables(5).filter((i) => i.y < GRID_Y0).map((i) => i.id);
    const b = interactables(30).filter((i) => i.y < GRID_Y0).map((i) => i.id);
    expect(b).toEqual(a);
    expect(interactables(40).filter((i) => i.kind === "tree").length).toBeGreaterThan(100);
  });

  it("special places: office mirrors the shop, nothing blocks the doors / gate / shrine spot", () => {
    expect(HOUSING_OFFICE.x).toBe(MAP_WIDTH - SHOP.x);
    const cs = collidersFor(10);
    for (const s of [HOUSING_DOOR, HUNT_GATE, SHRINE])
      for (const c of cs) expect(inside(c, s.x, s.y, 4), JSON.stringify([s, c])).toBe(false);
    const office = officeCollider();
    for (const f of FURNITURE) {
      const c = furnitureCollider(f);
      expect(c.x + c.w < office.x || c.x > office.x + office.w || c.y + c.h < office.y || c.y > office.y + office.h, f.id).toBe(true);
    }
    for (const p of UPPER_PROPS) {
      const c = propCollider(p);
      if (c) expect(c.x + c.w < office.x || c.x > office.x + office.w || c.y + c.h < office.y || c.y > office.y + office.h, JSON.stringify(p)).toBe(true);
    }
    for (const s of SEATS) expect(Math.hypot(s.x - HUNT_GATE.x, s.y - HUNT_GATE.y)).toBeGreaterThan(30);
  });

  it("water: pond/pool/creek are swimmable, the bridge deck and land are not", () => {
    expect(inWater(POND.x, POND.y)).toBe(true);
    expect(inWater(POOL.x, POOL.y)).toBe(true);
    expect(inWater(980, 340)).toBe(true);
    expect(inWater(BRIDGE_DECK.x + BRIDGE_DECK.w / 2, 340)).toBe(false);
    expect(inWater(POND.x, POND.y + POND.ry + 6)).toBe(false);
    expect(nearWater(POND.x, POND.y + POND.ry + 6)).toBe(true);
    expect(nearWater(POND.x, POND.y)).toBe(false);
    expect(inWater(SPAWN.x, SPAWN.y)).toBe(false);
    // 좌석·문 앞·묘비 자리는 물이 아니다
    for (const s of [...SEATS, SHOP_DOOR, HOUSING_DOOR, ...Array.from({ length: 64 }, (_, i) => standSpot(graveSlot(i)))]) expect(inWater(s.x, s.y + 9)).toBe(false);
    // 물속에는 충돌 박스가 없다 (헤엄쳐 다닐 수 있게)
    for (const c of collidersFor(4)) expect(inWater(c.x + c.w / 2, c.y + c.h / 2), JSON.stringify(c)).toBe(false);
  });
});

describe("grave layout", () => {
  it("grid order follows index; top revive graves get a copy at the altar", () => {
    const list = graves(25);
    const l = buildLayout(list, ["g7", "g3"]);
    expect(l.placements[0]).toMatchObject({ x: graveSlot(0).x, y: graveSlot(0).y, rank: -1, copy: false });
    expect(l.revive[0]).toMatchObject({ id: "g7", x: REVIVE_SLOTS[0].x, y: REVIVE_SLOTS[0].y, rank: 0, copy: true });
    expect(l.revive[1]?.id).toBe("g3");
    expect(l.reviveRank[7]).toBe(0);
    expect(l.reviveRank[8]).toBe(-1);
    expect(l.rows).toBe(Math.ceil(25 / GRID_COLS));
  });

  it("regression: a promoted grave stays in its grid slot with the same design; the altar copy matches", () => {
    const list = graves(20).map((g, i) => ({
      ...g,
      style: i === 5 ? "coffee" : undefined,
      flowers: i === 5 ? 9 : g.flowers,
      decor: i === 5 ? [{ itemId: "decor_wreath", until: Date.now() + 1e7 }] : undefined,
    }));
    const before = buildLayout(list, []);
    const after = buildLayout(list, ["g5"]);
    const real = after.byId.get("g5")!;
    // 격자 자리의 진짜 묘비는 그대로 (자리·디자인·꽃·꾸미기)
    expect(real).toMatchObject({ x: graveSlot(5).x, y: graveSlot(5).y, shape: "coffee", copy: false });
    expect(real.flowers).toBe(before.byId.get("g5")!.flowers);
    expect(real.decor).toEqual(["decor_wreath"]);
    // 다시 피어날 자리에는 같은 모양의 복제본
    const copy = after.revive[0]!;
    expect(copy).toMatchObject({ id: "g5", shape: "coffee", copy: true, rank: 0, flowers: real.flowers });
    expect(copy.decor).toEqual(real.decor);
    // 두 곳 모두 같은 묘비를 연다
    expect(graveAt(after, real.x, real.y - 5)?.id).toBe("g5");
    expect(graveAt(after, copy.x, copy.y - 5)?.id).toBe("g5");
    expect(nearestGrave(after, real.x, real.y + 22, 26)?.p.id).toBe("g5");
    expect(nearestGrave(after, copy.x, copy.y + 22, 26)?.p.id).toBe("g5");
    // 격자 자리에 빈 흙자리가 생기지 않는다: 같은 칸의 묘비가 그대로
    expect(after.placements[5]).toBe(real);
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
    // 명당으로 올라간 묘비도 원래 자리에 그대로 있다
    const slot = graveSlot(499);
    expect(graveAt(l, slot.x, slot.y - 5)?.id).toBe("g499");
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

describe("graveyard per channel", () => {
  const st = (mode: string, channel: number | null) => ({ mode, channel, count: 1, cap: 40 }) as Parameters<typeof graveChannelFor>[0];
  it("shows the connected (or connecting) channel's graves", () => {
    expect(graveChannelFor(st("online", 3), "auto")).toBe(3);
    expect(graveChannelFor(st("connecting", 2), "auto")).toBe(2);
    expect(graveChannelFor(st("reconnecting", 4), 1)).toBe(4);
  });
  it("falls back to channel 1 when there is no channel (spectator/queue/offline/replaced)", () => {
    for (const m of ["spectator", "queue", "offline", "replaced"]) expect(graveChannelFor(st(m, null), 5)).toBe(1);
    expect(graveChannelFor(st("connecting", null), "auto")).toBe(1);
  });
  it("before any status, uses the channel picked at the entrance", () => {
    expect(graveChannelFor(undefined, 7)).toBe(7);
    expect(graveChannelFor(undefined, "auto")).toBe(1);
  });
});

describe("campfires (불멍)", () => {
  const fireColliders = allCampfireColliders();
  const all = [
    ...UPPER_PROPS.map(propCollider),
    ...gridProps(60).map(propCollider),
    ...FURNITURE.map(furnitureCollider),
    ...fireColliders,
    shopCollider(),
    officeCollider(),
  ].filter((r): r is Rect => !!r);
  const fireSeats = SEATS.filter((s) => campfireOfSeat(s.id));

  it("2~3 campfires, each with 4~6 seats facing the fire (server-judged SEATS)", () => {
    expect(CAMPFIRES.length).toBeGreaterThanOrEqual(2);
    expect(CAMPFIRES.length).toBeLessThanOrEqual(3);
    for (const c of CAMPFIRES) {
      const seats = fireSeats.filter((s) => campfireOfSeat(s.id)?.id === c.id);
      expect(seats.length).toBeGreaterThanOrEqual(4);
      expect(seats.length).toBeLessThanOrEqual(6);
      for (const s of seats) {
        expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeLessThan(34);
        // 불을 바라본다
        const dx = c.x - s.x;
        const dy = c.y - s.y;
        const want = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIR.left : DIR.right) : dy < 0 ? DIR.up : DIR.down;
        expect(s.facing, s.id).toBe(want);
      }
    }
    expect(campfireOfSeat("bA-0")).toBeNull();
    expect(campfireOfSeat("nope")).toBeNull();
  });

  it("seats are reachable (stand point free), not in water, and the fire blocks nothing important", () => {
    for (const s of fireSeats) {
      for (const c of all) expect(inside(c, s.x, s.y + 9), JSON.stringify([s.id, c])).toBe(false);
      expect(inWater(s.x, s.y + 9)).toBe(false);
    }
    const spots = [SPAWN, SHOP_DOOR, HOUSING_DOOR, HUNT_GATE, SHRINE, ...REVIVE_SLOTS.map(standSpot), ...Array.from({ length: 960 }, (_, i) => standSpot(graveSlot(i)))];
    for (const c of fireColliders) for (const s of spots) expect(inside(c, s.x, s.y, 6), JSON.stringify([s, c])).toBe(false);
    for (const c of CAMPFIRES) {
      // 중앙 통로·산책로를 막지 않는다
      expect(Math.abs(c.x - MAP_WIDTH / 2)).toBeGreaterThan(60);
      for (const wx of WALK_XS) expect(Math.abs(c.x - wx) > 40 || c.y < GRID_Y0 - 40).toBe(true);
      expect(c.y + 40).toBeLessThan(GRID_Y0);
    }
    // 소품이 모닥불 위에 놓이지 않는다
    for (const p of [...UPPER_PROPS, ...gridProps(60)]) for (const c of CAMPFIRES) expect(Math.hypot(p.x - c.x, p.y - c.y), JSON.stringify(p)).toBeGreaterThan(24);
  });

  it("sound level: 1 when seated, fades with distance, silent far away", () => {
    expect(campfireLevel(500, true)).toBe(1);
    expect(campfireLevel(0, false)).toBeCloseTo(CAMPFIRE_NEAR_MAX, 5);
    expect(campfireLevel(CAMPFIRE_HEAR_PX, false)).toBe(0);
    expect(campfireLevel(Number.NaN, false)).toBe(0);
    let prev = Infinity;
    for (let d = 0; d <= CAMPFIRE_HEAR_PX; d += 20) {
      const l = campfireLevel(d, false);
      expect(l).toBeLessThanOrEqual(prev + 1e-9);
      expect(l).toBeLessThanOrEqual(CAMPFIRE_NEAR_MAX);
      prev = l;
    }
    expect(nearestCampfire(CAMPFIRES[0].x + 3, CAMPFIRES[0].y)?.fire.id).toBe(CAMPFIRES[0].id);
  });

  it("cinematic framing: zoom 4~5, letterbox ~11% that eases in", () => {
    for (const [w, h] of [[1280, 800], [390, 844], [844, 390], [1920, 1080]]) {
      const z = cineZoom(w, h);
      expect(z).toBeGreaterThanOrEqual(4);
      expect(z).toBeLessThanOrEqual(5);
    }
    expect(letterboxHeight(800, 0)).toBe(0);
    expect(letterboxHeight(800, 1)).toBe(Math.round(800 * 0.11));
    expect(letterboxHeight(800, 0.5)).toBeGreaterThan(letterboxHeight(800, 0.25));
    const c = cineCenter(CAMPFIRES[0]);
    expect(c.x).toBe(CAMPFIRES[0].x);
    expect(c.y).toBeLessThan(CAMPFIRES[0].y);
  });
});
