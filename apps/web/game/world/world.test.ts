import { describe, expect, it } from "vitest";
import {
  BOAT_MOORING,
  BRIDGES,
  CAMPFIRES,
  DIR,
  DOCK_DECK,
  FERRY_DOCK,
  FURNITURE,
  GRAVEYARD_CAPACITY,
  GRAVE_AREAS,
  GRID_COLS,
  GRID_ROWS,
  HILL,
  HILL_STAIRS,
  HOUSE_LOTS,
  HOUSE_LOT_H,
  HOUSE_LOT_W,
  HOUSING_DOOR,
  HOUSING_OFFICE,
  HUNT_GATE,
  LAKE,
  LAKE_PIER,
  MAP_HEIGHT,
  MAP_WIDTH,
  RIVER_PATH,
  SEATS,
  SHOP,
  SHOP_DOOR,
  SHRINE,
  SPAWN,
  STEP_STONES,
  TELESCOPE_SPOT,
  WORLD_LOTS,
  ZONES,
  campfireOfSeat,
  graveSlot,
  houseLot,
  mapHeight,
  plotLabel,
  spotSeatId,
  seatSlot,
} from "@tomb/protocol";
import { CAMPFIRE_HEAR_PX, CAMPFIRE_NEAR_MAX, campfireLevel, cineCenter, cineZoom, letterboxHeight, nearestCampfire } from "./campfireMath";
import { ambienceAt } from "@/lib/ambience";
import { LevelBlender, levelsFor, mixColor } from "./ambienceMix";
import { graveChannelFor } from "./graveChannel";
import { cameraBounds, clampZoom, parseStoredZoom, pinchZoom, snapZoom, stepZoom, approach } from "./cameraMath";
import { buildLayout, graveAt, layoutSignature, nearestGrave, standSpot } from "./graveLayout";
import {
  allCampfireColliders,
  allProps,
  BRIDGE_DECKS,
  cliffColliders,
  FENCE_RUNS,
  furnitureCollider,
  GRAVEYARD_RECT,
  groundKind,
  HAMMOCKS,
  houseCollider,
  inWater,
  interactables,
  isLiveTree,
  lotInteractable,
  nearShopDoor,
  nearWater,
  officeCollider,
  PLAZA_FIRE,
  PLAZA_RECT,
  propCollider,
  shopCollider,
  standable,
  staticColliders,
  SWINGS,
  walkableGrid,
  WALK,
  waterCurrent,
  type Rect,
} from "./layout";

const graves = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `g${i}`, ageDays: (i * 37) % 800, flowers: i % 9, revives: i % 5 }));

const inside = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

/** 모든 필지에 가장 큰 집이 섰다고 보고 (보수적으로) */
const houseBodies = HOUSE_LOTS.map((l) => houseCollider(l));
const colliders = [...staticColliders(), ...FURNITURE.map(furnitureCollider), ...houseBodies];
const graveSpots = Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => standSpot(graveSlot(i)));

/** 물을 건너지 않고 걸어서 닿는 칸 (8px 격자, SPAWN에서 BFS) */
function reachable(): (x: number, y: number) => boolean {
  const g = walkableGrid(8);
  const seen = new Uint8Array(g.cells.length);
  const start = Math.floor(SPAWN.y / g.cell) * g.cols + Math.floor(SPAWN.x / g.cell);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % g.cols;
    const y = (i - x) / g.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const j = ny * g.cols + nx;
      if (seen[j] || g.cells[j] !== WALK.open) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return (x, y) => seen[Math.floor(y / g.cell) * g.cols + Math.floor(x / g.cell)] === 1;
}

describe("컴팩트한 묘지 마을 맵 (F1)", () => {
  it("작은 고정 맵: 가로 1440 × 세로 1024 (예전 2048×1408의 절반쯤), 묘비 수와 상관없다", () => {
    expect(MAP_WIDTH).toBe(1440);
    expect(MAP_HEIGHT).toBe(1024);
    expect(MAP_WIDTH * MAP_HEIGHT).toBeLessThan(2048 * 1408 * 0.55);
    expect(mapHeight(0)).toBe(MAP_HEIGHT);
    expect(mapHeight(5000)).toBe(MAP_HEIGHT);
    for (const z of ZONES) {
      expect(z.x).toBeGreaterThanOrEqual(32);
      expect(z.x + z.w).toBeLessThanOrEqual(MAP_WIDTH - 32);
      expect(z.y + z.h).toBeLessThanOrEqual(MAP_HEIGHT - 16);
    }
  });

  it("스폰·문 앞·묘비 앞·필지 문 앞·1인 자리는 막혀 있지 않다", () => {
    const spots = [SPAWN, SHOP_DOOR, HOUSING_DOOR, HUNT_GATE, SHRINE, FERRY_DOCK, TELESCOPE_SPOT, ...graveSpots, ...HOUSE_LOTS.map((l) => l.door)];
    for (const s of spots) for (const c of colliders) expect(inside(c, s.x, s.y, 2), JSON.stringify([s, c])).toBe(false);
    for (const s of spots) expect(standable(s.x, s.y), JSON.stringify(s)).toBe(true);
  });

  it("어디든 걸어서 갈 수 있다 (물을 건너지 않고 — 다리·나루터·잔교·계단으로)", () => {
    const ok = reachable();
    const targets: { x: number; y: number; what: string }[] = [
      ...SEATS.map((s) => ({ x: s.x, y: s.y + 10, what: s.id })),
      ...graveSpots.map((p, i) => ({ ...p, what: `grave${i}` })),
      ...HOUSE_LOTS.map((l) => ({ x: l.door.x, y: l.door.y + 4, what: `lot${l.lot}` })),
      ...interactables().map((i) => ({ x: i.x, y: i.y, what: i.id })),
      { x: LAKE_PIER.x + LAKE_PIER.w - 6, y: LAKE_PIER.y + 8, what: "pier" },
      { x: HILL.x + 200, y: HILL.y + 150, what: "hill" },
    ];
    // 8px 격자라 바로 그 칸 또는 발 한 걸음(4px) 아래 칸에 닿으면 된다
    const miss = targets.filter((t) => !ok(t.x, t.y) && !ok(t.x, t.y + 4) && !ok(t.x - 4, t.y + 4) && !ok(t.x + 4, t.y + 4)).map((t) => t.what);
    expect(miss).toEqual([]);
  });

  it("언덕은 계단으로만 오른다 (남·동쪽 절벽)", () => {
    const [w, e, east] = cliffColliders();
    expect(w.x + w.w).toBe(HILL_STAIRS.x);
    expect(e.x).toBe(HILL_STAIRS.x + HILL_STAIRS.w);
    expect(east.x).toBe(HILL.x + HILL.w);
    expect(groundKind(Math.floor((HILL_STAIRS.x + 4) / 16), (HILL.y + HILL.h) / 16)).toBe("stairs");
    expect(groundKind(Math.floor((HILL.x + 40) / 16), (HILL.y + HILL.h) / 16)).toBe("cliff");
    expect(groundKind(5, 5)).toBe("hill");
  });

  it("소품이 묘비·좌석·필지·길 한가운데를 막지 않는다", () => {
    const props = allProps().filter((p) => p.kind !== "table");
    const points = [...SEATS, ...Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => graveSlot(i))];
    for (const p of props) for (const q of points) expect(Math.hypot(p.x - q.x, p.y - q.y), JSON.stringify([p, q])).toBeGreaterThan(14);
    for (const p of props) for (const l of HOUSE_LOTS) expect(inside({ x: l.x, y: l.y, w: HOUSE_LOT_W, h: HOUSE_LOT_H }, p.x, p.y, 2), JSON.stringify(p)).toBe(false);
    // 충돌하는 소품은 흙길·돌길 위에 놓지 않는다 (석등·가로등만 길가에)
    for (const p of props) {
      if (!propCollider(p) || p.kind === "lantern" || p.kind === "lamp" || p.kind === "well" || p.kind === "bell") continue;
      const k = groundKind(Math.floor(p.x / 16), Math.floor((p.y - 2) / 16));
      expect(["grass", "hill", "grave", "stone"], JSON.stringify(p)).toContain(k);
    }
  });

  it("가을·겨울 나무(단풍·은행·소나무·마른 나무·수양버들)가 섞여 있고, 숲으로 뒤덮이지는 않는다", () => {
    const props = allProps();
    const kinds = new Set(props.map((p) => p.kind));
    for (const k of ["maple", "ginkgo", "snowPine", "deadTree", "pine", "willow", "leaves", "pumpkin"]) expect(kinds.has(k as never), k).toBe(true);
    expect(props.filter((p) => p.kind === "blossom").length).toBe(0); // 봄꽃 나무는 없다
    const trees = props.filter((p) => isLiveTree(p.kind) || p.kind === "pine" || p.kind === "snowPine" || p.kind === "deadTree" || p.kind === "willow").length;
    expect(trees).toBeGreaterThan(55);
    expect(trees).toBeLessThan(140);
  });

  it("무덤 컨셉이 맵 곳곳에: 오래된 묘비·촛불·땅안개·납골당·철책·종루가 묘역 세 곳 모두에 있다", () => {
    const props = allProps();
    const count = (k: string) => props.filter((p) => p.kind === k).length;
    expect(count("oldGrave")).toBeGreaterThanOrEqual(25);
    expect(count("candle")).toBeGreaterThanOrEqual(10);
    expect(count("mist")).toBeGreaterThanOrEqual(12);
    expect(count("crypt")).toBe(1);
    expect(count("bell")).toBe(1);
    for (const a of GRAVE_AREAS) {
      const inA = props.filter((p) => inside(a.rect, p.x, p.y, 24));
      for (const k of ["oldGrave", "candle", "mist"]) expect(inA.some((p) => p.kind === k), `${a.name} ${k}`).toBe(true);
      // 철책이 묘역을 두르고, 문이 있다
      expect(FENCE_RUNS.filter((f) => inside(a.rect, f.x0, f.y0, 1)).length, a.name).toBeGreaterThanOrEqual(3);
    }
    expect(FENCE_RUNS.every((f) => f.x0 === f.x1 || f.y0 === f.y1)).toBe(true);
  });

  it("좌석: 넉넉하고(60+) id가 겹치지 않으며, 담 안·물 밖·일어설 자리가 비어 있다", () => {
    expect(SEATS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(SEATS.map((s) => s.id)).size).toBe(SEATS.length);
    for (const s of SEATS) {
      expect(s.x).toBeGreaterThan(32);
      expect(s.x).toBeLessThan(MAP_WIDTH - 32);
      expect(inWater(s.x, s.y + 9), s.id).toBe(false);
      for (const c of colliders) expect(inside(c, s.x, s.y + 9), JSON.stringify([s.id, c])).toBe(false);
    }
  });

  it("바닥: 담·정문·광장 포석·묘역 통로·주거 골목", () => {
    expect(groundKind(0, 5)).toBe("wallSide");
    expect(groundKind(10, 0)).toBe("wallTop");
    expect(groundKind(44, 0)).toBe("gate");
    expect(groundKind(89, 30)).toBe("wallSide");
    expect(groundKind(Math.floor(SPAWN.x / 16), Math.floor(SPAWN.y / 16))).toBe("dirt");
    expect(groundKind(Math.floor((PLAZA_RECT.x + 100) / 16), Math.floor((PLAZA_RECT.y + 100) / 16))).toBe("stone");
    for (const a of GRAVE_AREAS) expect(groundKind(Math.floor(a.aisleX / 16), Math.floor((a.y0 + 30) / 16)), a.name).toBe("gravel"); // 묘역 가운데 자갈 통로
    for (let i = 0; i < GRAVEYARD_CAPACITY; i++) {
      const s = graveSlot(i);
      expect(groundKind(Math.floor(s.x / 16), Math.floor((s.y + 16) / 16)), `${i}`).toBe("gravel"); // 묘비 줄 아래 오솔길
      expect(groundKind(Math.floor(s.x / 16), Math.floor((s.y - 8) / 16)), `${i}`).toBe("grave");
    }
    const l = HOUSE_LOTS[0];
    expect(groundKind(Math.floor(l.door.x / 16), Math.floor((l.y + HOUSE_LOT_H + 8) / 16))).toBe("cobble");
  });
});

describe("광장 놀거리 (50번: 가운데에도 상호작용)", () => {
  const items = interactables();
  it("특별한 장소·나무·그네·해먹·종·우물·나루터 — id가 겹치지 않고 자리가 막히지 않는다", () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const k of ["hunt", "housing", "shrine"]) expect(items.some((i) => i.kind === "portal" && i.portal === k)).toBe(true);
    for (const k of ["tree", "swing", "hammock", "bell", "well", "dock", "wish", "telescope"]) expect(items.some((i) => i.kind === k), k).toBe(true);
    for (const i of items) {
      for (const c of colliders) expect(inside(c, i.ax, i.ay, 1), JSON.stringify([i.id, c])).toBe(false);
      expect(i.label.length).toBeGreaterThan(0);
      expect(inWater(i.ax, i.ay), i.id).toBe(false);
    }
    expect(items.filter((i) => i.kind === "tree").length).toBeGreaterThan(25);
  });

  it("광장 한가운데 큰 모닥불, 둘레에 그네·해먹·분수·놀거리·매달릴 나무가 고루 있다", () => {
    expect(PLAZA_FIRE.big).toBe(true);
    expect(Math.abs(PLAZA_FIRE.x - (PLAZA_RECT.x + PLAZA_RECT.w / 2))).toBeLessThan(24);
    expect(Math.abs(PLAZA_FIRE.y - (PLAZA_RECT.y + PLAZA_RECT.h / 2))).toBeLessThan(40);
    const inPlaza = items.filter((i) => inside(PLAZA_RECT, i.x, i.y, 4));
    const kinds = new Set(inPlaza.map((i) => i.kind));
    for (const k of ["swing", "hammock", "wish", "tree", "seesaw", "trampoline", "carousel"]) expect(kinds.has(k as never), k).toBe(true);
    expect(inPlaza.length).toBeGreaterThanOrEqual(7);
    // 광장 네 사분면 모두에 뭔가 있다
    const cx = PLAZA_RECT.x + PLAZA_RECT.w / 2;
    const cy = PLAZA_RECT.y + PLAZA_RECT.h / 2;
    const quads = new Set([...inPlaza, ...SEATS.filter((s) => inside(PLAZA_RECT, s.x, s.y))].map((i) => (i.x < cx ? 0 : 1) + (i.y < cy ? 0 : 2)));
    expect(quads.size).toBe(4);
  });

  it("해먹: 1인 자리(소품 자리 id), 4곳 이상, 누울 자리는 물이 아니다", () => {
    expect(HAMMOCKS.length).toBeGreaterThanOrEqual(4);
    const hs = items.filter((i) => i.kind === "hammock");
    expect(hs.length).toBe(HAMMOCKS.length);
    for (const h of hs) {
      const id = spotSeatId("hammock", h.ax, h.ay);
      expect(seatSlot(id)).toMatchObject({ kind: "hammock", x: Math.round(h.ax), y: Math.round(h.ay) });
    }
    expect(SWINGS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("강·호수 (50번)", () => {
  it("강 가운데·호수는 헤엄치고, 다리·나루터·잔교·징검다리·뭍은 아니다", () => {
    const mid = RIVER_PATH[3];
    expect(inWater(mid.x, mid.y)).toBe(true);
    expect(inWater(LAKE.x, LAKE.y)).toBe(true);
    for (const b of BRIDGES) expect(inWater(b.x, (b.y0 + b.y1) / 2), b.id).toBe(false);
    for (const d of BRIDGE_DECKS) expect(inside(d, d.x + d.w / 2, d.y + d.h / 2)).toBe(true);
    expect(inWater(DOCK_DECK.x + DOCK_DECK.w / 2, DOCK_DECK.y + DOCK_DECK.h - 4)).toBe(false);
    expect(inWater(LAKE_PIER.x + LAKE_PIER.w - 4, LAKE_PIER.y + 8)).toBe(false);
    for (const s of STEP_STONES) expect(inWater(s.x, s.y)).toBe(false);
    expect(inWater(SPAWN.x, SPAWN.y)).toBe(false);
    expect(inWater(BOAT_MOORING.x, BOAT_MOORING.y)).toBe(true); // 배는 물 위에 떠 있다
    expect(nearWater(mid.x, mid.y - 30)).toBe(true);
    expect(nearWater(SPAWN.x, SPAWN.y)).toBe(false);
  });

  it("물살: 강에서는 하류(호수 쪽)로, 호수·뭍에서는 없다", () => {
    const a = RIVER_PATH[1];
    const c = waterCurrent(a.x + 10, a.y);
    expect(c.vx).toBeGreaterThan(5);
    expect(Math.hypot(c.vx, c.vy)).toBeLessThan(20);
    const end = RIVER_PATH[RIVER_PATH.length - 2];
    const d = waterCurrent(end.x, end.y);
    expect(d.vy).toBeGreaterThan(0); // 마지막 굽이는 남동쪽 호수로
    expect(waterCurrent(LAKE.x, LAKE.y)).toEqual({ vx: 0, vy: 0 });
    expect(waterCurrent(SPAWN.x, SPAWN.y)).toEqual({ vx: 0, vy: 0 });
  });

  it("물속에는 충돌 박스가 없다 (헤엄쳐 다닐 수 있게)", () => {
    for (const c of colliders) expect(inWater(c.x + c.w / 2, c.y + c.h / 2), JSON.stringify(c)).toBe(false);
  });
});

describe("주거 구역 (분양 마을을 메인 맵에)", () => {
  it("필지 12곳: 겹치지 않고 주거 구역 안, 문 앞은 골목", () => {
    expect(HOUSE_LOTS.length).toBe(WORLD_LOTS);
    const zone = ZONES.find((z) => z.id === "housing")!;
    for (const l of HOUSE_LOTS) {
      expect(inside(zone, l.x, l.y, 32) && inside(zone, l.x + HOUSE_LOT_W, l.y + HOUSE_LOT_H, 32), `lot${l.lot}`).toBe(true);
      for (const m of HOUSE_LOTS) if (m !== l) expect(Math.abs(m.x - l.x) >= HOUSE_LOT_W || Math.abs(m.y - l.y) >= HOUSE_LOT_H).toBe(true);
      expect(inWater(l.door.x, l.door.y)).toBe(false);
    }
    expect(houseLot(0)).toBeNull();
    expect(houseLot(WORLD_LOTS + 1)).toBeNull();
    expect(houseLot(1)?.door).toEqual(HOUSE_LOTS[0].door);
  });

  it("문·빈 필지 상호작용", () => {
    expect(lotInteractable(3, { id: "h1", name: "달빛 서재" })).toMatchObject({ kind: "door", houseId: "h1", lot: 3, label: "달빛 서재 들어가기" });
    expect(lotInteractable(4, null)).toMatchObject({ kind: "lot", lot: 4 });
    expect(lotInteractable(99, null)).toBeNull();
  });

  it("분양 사무소는 주거 구역 어귀, 문 앞이 막히지 않는다", () => {
    const office = officeCollider();
    for (const f of FURNITURE) {
      const c = furnitureCollider(f);
      expect(c.x + c.w < office.x || c.x > office.x + office.w || c.y + c.h < office.y || c.y > office.y + office.h, f.id).toBe(true);
    }
    expect(Math.hypot(HOUSING_DOOR.x - HOUSING_OFFICE.x, HOUSING_DOOR.y - HOUSING_OFFICE.y)).toBeLessThan(20);
    expect(HOUSING_OFFICE.x).toBeLessThan(HOUSE_LOTS[0].x);
    const hut = shopCollider();
    expect(Math.hypot(SHOP.x - SHOP_DOOR.x, SHOP.y - SHOP_DOOR.y)).toBeLessThan(20);
    for (const p of allProps()) {
      const c = propCollider(p);
      if (c) expect(c.x + c.w < hut.x || c.x > hut.x + hut.w || c.y + c.h < hut.y || c.y > hut.y + hut.h, JSON.stringify(p)).toBe(true);
    }
    expect(nearShopDoor(SHOP_DOOR.x, SHOP_DOOR.y)).toBe(true);
    expect(nearShopDoor(SHOP_DOOR.x, SHOP_DOOR.y + 30)).toBe(false);
  });
});

describe("길찾기 격자 / 옛 좌표", () => {
  it("walkableGrid: 스폰은 열림, 강은 물, 집 몸체·담은 막힘", () => {
    const g = walkableGrid(8);
    const at = (x: number, y: number) => g.cells[Math.floor(y / 8) * g.cols + Math.floor(x / 8)];
    expect(at(SPAWN.x, SPAWN.y)).toBe(WALK.open);
    expect(at(RIVER_PATH[3].x, RIVER_PATH[3].y)).toBe(WALK.water);
    const body = houseCollider(HOUSE_LOTS[0]);
    expect(at(body.x + body.w / 2, body.y + body.h / 2)).toBe(WALK.blocked);
    expect(at(4, 400)).toBe(WALK.blocked);
    // 집이 없는 필지는 열 수 있다
    const open = walkableGrid(8, [], []);
    expect(open.cells[Math.floor((body.y + body.h / 2) / 8) * open.cols + Math.floor((body.x + body.w / 2) / 8)]).toBe(WALK.open);
  });

  it("standable: 맵 밖·집 안·나무 줄기는 false (옛 맵 좌표 복원 방지), 물은 true", () => {
    expect(standable(SPAWN.x, SPAWN.y)).toBe(true);
    expect(standable(500, 3000)).toBe(false);
    expect(standable(10, 400)).toBe(false);
    const body = houseCollider(HOUSE_LOTS[5]);
    expect(standable(body.x + body.w / 2, body.y + body.h)).toBe(false);
    expect(standable(LAKE.x, LAKE.y)).toBe(true);
  });
});

describe("묘역 세 곳 (F4: 정원 합계 = 49번 성불의 GRAVEYARD_CAPACITY)", () => {
  it("묘역 칸 수의 합 = GRAVEYARD_CAPACITY, 모든 자리가 제 묘역 안, 겹치지 않는다", () => {
    expect(GRAVE_AREAS.length).toBe(3);
    expect(GRAVE_AREAS.reduce((n, a) => n + a.cols * a.rows, 0)).toBe(GRAVEYARD_CAPACITY);
    expect(GRID_COLS * GRID_ROWS).toBe(GRAVEYARD_CAPACITY); // 옛 이름 호환
    for (let i = 0; i < GRAVEYARD_CAPACITY; i++) {
      const s = graveSlot(i);
      const a = GRAVE_AREAS.find((g) => g.id === s.area)!;
      expect(inside(a.rect, s.x, s.y, -8), `${i}`).toBe(true);
      expect(inside(a.rect, s.x, s.y + 22, -2), `${i}`).toBe(true);
    }
    expect(new Set(Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => `${graveSlot(i).x},${graveSlot(i).y}`)).size).toBe(GRAVEYARD_CAPACITY);
    expect(GRAVEYARD_RECT).toEqual(GRAVE_AREAS[0].rect);
  });

  it("등록 순서대로 결정적으로, 세 묘역에 골고루 (A·B·A·C …) 놓인다", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => graveSlot(i).area)).toEqual(["A", "B", "A", "C", "A", "B", "A", "C"]);
    expect(graveSlot(0)).toEqual(graveSlot(GRAVEYARD_CAPACITY)); // 돌려 쓴다
    const per = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < GRAVEYARD_CAPACITY; i++) per[graveSlot(i).area]++;
    expect(per).toEqual({ A: 16, B: 8, C: 8 });
    expect(plotLabel(0)).toBe("옛 묘역 1번째 줄 · 1번 자리");
    expect(plotLabel(1)).toBe("다리 건너 묘역 1번째 줄 · 1번 자리");
    expect(plotLabel(3)).toBe("버드나무 묘역 1번째 줄 · 1번 자리");
    expect(plotLabel(2)).toBe("옛 묘역 1번째 줄 · 2번 자리");
  });

  it("등록 순서대로 결정적으로 놓이고, 넘치면 가장 최근 32기만 자리를 돌려 쓴다", () => {
    const l = buildLayout(graves(25), ["g7"]);
    expect(l.placements[0]).toMatchObject({ id: "g0", x: graveSlot(0).x, y: graveSlot(0).y, rank: -1, copy: false });
    expect(l.revive).toEqual([]); // 다시 피어날 자리는 없다
    expect(l.count).toBe(25);
    const big = buildLayout(graves(40), []);
    expect(big.count).toBe(GRAVEYARD_CAPACITY);
    expect(big.byId.has("g7")).toBe(false); // 가장 오래된 8기는 안 보인다 (곧 성불)
    expect(big.byId.get("g39")).toMatchObject({ x: graveSlot(39 % 32).x, y: graveSlot(39 % 32).y });
    // 같은 자리에 두 묘비가 겹치지 않는다
    expect(new Set(big.placements.map((p) => `${p.x},${p.y}`)).size).toBe(GRAVEYARD_CAPACITY);
  });

  it("nearestGrave / graveAt", () => {
    const l = buildLayout(graves(30), []);
    const p = l.placements[12];
    const s = standSpot(p);
    expect(nearestGrave(l, s.x, s.y, 26)?.p.id).toBe("g12");
    expect(graveAt(l, p.x, p.y - 5)?.id).toBe("g12");
    expect(graveAt(l, SPAWN.x, SPAWN.y)).toBeNull();
  });

  it("signature: 꽃 수는 무시, 순서·모양은 따진다", () => {
    const a = graves(5);
    const b = a.map((g) => ({ ...g, flowers: g.flowers + 10 }));
    expect(layoutSignature(a)).toBe(layoutSignature(b));
    expect(layoutSignature([...a].reverse())).not.toBe(layoutSignature(a));
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
  const all = [...colliders, ...fireColliders];
  const fireSeats = SEATS.filter((s) => campfireOfSeat(s.id));

  it("3~5 campfires: one huge plaza fire (12+ seats), the rest 4~6 seats, all facing the fire (server-judged SEATS)", () => {
    expect(CAMPFIRES.length).toBeGreaterThanOrEqual(3);
    expect(CAMPFIRES.length).toBeLessThanOrEqual(5);
    expect(CAMPFIRES.filter((c) => c.big).length).toBe(1);
    const vec = { [DIR.up]: [0, -1], [DIR.down]: [0, 1], [DIR.left]: [-1, 0], [DIR.right]: [1, 0] } as Record<number, number[]>;
    for (const c of CAMPFIRES) {
      const seats = fireSeats.filter((s) => campfireOfSeat(s.id)?.id === c.id);
      expect(seats.length).toBeGreaterThanOrEqual(c.big ? 12 : 4);
      expect(seats.length).toBeLessThanOrEqual(c.big ? 20 : 6);
      for (const s of seats) {
        expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeLessThan(c.big ? 80 : 34);
        // 불을 바라본다
        const dx = c.x - s.x;
        const dy = c.y - s.y;
        if (c.big) {
          const [vx, vy] = vec[s.facing];
          expect(vx * dx + vy * dy, s.id).toBeGreaterThan(0);
        } else {
          const want = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIR.left : DIR.right) : dy < 0 ? DIR.up : DIR.down;
          expect(s.facing, s.id).toBe(want);
        }
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
    const spots = [SPAWN, SHOP_DOOR, HOUSING_DOOR, HUNT_GATE, SHRINE, ...graveSpots, ...HOUSE_LOTS.map((l) => l.door)];
    for (const c of fireColliders) for (const s of spots) expect(inside(c, s.x, s.y, 6), JSON.stringify([s, c])).toBe(false);
    for (const c of CAMPFIRES) {
      // 흙길 위가 아니다 (큰 모닥불은 광장 포석 한가운데)
      expect(groundKind(Math.floor(c.x / 16), Math.floor(c.y / 16)), c.id).toBe(c.big ? "stone" : "grass");
    }
    // 소품이 모닥불 위에 놓이지 않는다
    for (const p of allProps()) for (const c of CAMPFIRES) expect(Math.hypot(p.x - c.x, p.y - c.y), JSON.stringify(p)).toBeGreaterThan(c.big ? 60 : 24);
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

describe("미니맵 (F17)", () => {
  it("맵 전체를 1/8로 줄인 바탕: 물(강·연못·호수)과 주요 장소가 맵 안에 있다", async () => {
    const { minimapPixels, MINIMAP_W, MINIMAP_H, LANDMARKS, toMinimap } = await import("./minimapArt");
    expect(MINIMAP_W).toBe(MAP_WIDTH / 8);
    expect(MINIMAP_H).toBe(MAP_HEIGHT / 8);
    const px = minimapPixels();
    expect(px.length).toBe(MINIMAP_W * MINIMAP_H * 4);
    let water = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] === 0x3d && px[i + 1] === 0x68 && px[i + 2] === 0x78) water++;
    expect(water).toBeGreaterThan(500);
    // 연못이 위쪽에도 있다 (F9): 맵 위 1/4에 물 픽셀
    let topWater = 0;
    for (let y = 0; y < MINIMAP_H / 4; y++) for (let x = 0; x < MINIMAP_W; x++) if (px[(y * MINIMAP_W + x) * 4 + 2] === 0x78) topWater++;
    expect(topWater).toBeGreaterThan(50);
    for (const l of LANDMARKS) {
      const p = toMinimap(l.x, l.y);
      expect(p.x >= 0 && p.x < MINIMAP_W && p.y >= 0 && p.y < MINIMAP_H, l.id).toBe(true);
    }
  });
});

describe("낚시터 (호수 북동쪽 물가)", () => {
  it("낚시 자리 20곳 이상, 그중 10곳 이상이 낚시터에 모여 있고 모두 걸어서 닿는다 (데크·마당)", async () => {
    const { FISHING_SPOTS, FISHING_ZONE, FISHING_ZONE_SPOTS, FISH_ARCH, FISH_PIER, FISH_PIER_HEAD, inFishingZone } = await import("@tomb/protocol");
    const { NPCS } = await import("@/lib/forage/catalog");
    expect(FISHING_SPOTS.length).toBeGreaterThanOrEqual(20);
    const zone = FISHING_SPOTS.filter((s) => inFishingZone(s.x, s.y));
    expect(zone.length).toBeGreaterThanOrEqual(10);
    expect(FISHING_SPOTS.slice(0, FISHING_ZONE_SPOTS).every((s) => inFishingZone(s.x, s.y))).toBe(true);
    expect(ZONES.some((z) => z.id === "fishing" && z.name === "낚시터" && z.x === FISHING_ZONE.x && z.w === FISHING_ZONE.w)).toBe(true);
    // 어부 영감은 낚시터 마당에
    const monger = NPCS.find((n) => n.id === "fishmonger")!;
    expect(inFishingZone(monger.x, monger.y)).toBe(true);
    // 데크 위는 물이 아니고, 데크·아치·자리 모두 정문에서 걸어서 닿는다
    expect(inWater(FISH_PIER.x + FISH_PIER.w / 2, FISH_PIER.y + FISH_PIER.h - 6)).toBe(false);
    expect(inWater(FISH_PIER_HEAD.x + 8, FISH_PIER_HEAD.y + 12)).toBe(false);
    const ok = reachable();
    const miss = [...FISHING_SPOTS, { id: "arch", x: FISH_ARCH.x, y: FISH_ARCH.y + 6 }, { id: "monger", x: monger.x, y: monger.y + 10 }]
      .filter((t) => !ok(t.x, t.y) && !ok(t.x, t.y + 4) && !ok(t.x - 4, t.y + 4) && !ok(t.x + 4, t.y + 4))
      .map((t) => t.id);
    expect(miss).toEqual([]);
  });

  it("데크와 가로 데크가 만나는 곳은 난간이 없어 지나가고, 물 쪽 가장자리는 난간이 막는다", async () => {
    const { FISH_PIER, FISH_PIER_HEAD } = await import("@tomb/protocol");
    const { allDeckRails } = await import("./layout");
    const rails = allDeckRails();
    const hit = (x: number, y: number) => rails.some((r) => inside(r, x, y));
    // 이음매 (데크 가운데 아래 끝 = 가로 데크 윗변)
    expect(hit(FISH_PIER.x + FISH_PIER.w / 2, FISH_PIER_HEAD.y)).toBe(false);
    expect(hit(FISH_PIER.x + 1, FISH_PIER.y + 60)).toBe(true); // 데크 서쪽 가장자리 (물)
    expect(hit(FISH_PIER_HEAD.x + 1, FISH_PIER_HEAD.y + 12)).toBe(true); // 가로 데크 서쪽 끝
    expect(hit(FISH_PIER_HEAD.x + 20, FISH_PIER_HEAD.y + FISH_PIER_HEAD.h - 1)).toBe(true); // 가로 데크 남쪽 가장자리
  });

  it("강 어귀는 비어 있어 조각배가 호수에서 강으로 드나든다", async () => {
    const { stepBoat, boatWater } = await import("../logic/boat");
    const { BOATS } = await import("@tomb/protocol");
    const m = { x: BOATS[0].x, y: BOATS[0].y, vx: 0, vy: 0 };
    // 서쪽(강 어귀)으로 저어 강으로 들어간다: 막히면 위/아래로 비켜 간다
    for (let i = 0; i < 4000 && m.x > 1000; i++) {
      const px = m.x;
      const py = m.y;
      stepBoat(m, -1, 0, 16, { vx: 0, vy: 0 });
      if (Math.hypot(m.x - px, m.y - py) < 0.05) stepBoat(m, -0.3, i % 400 < 200 ? -1 : 1, 16, { vx: 0, vy: 0 });
    }
    expect(m.x).toBeLessThanOrEqual(1000);
    expect(boatWater(m.x, m.y)).toBe(true);
  });
});
