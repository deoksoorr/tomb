import { describe, expect, it } from "vitest";
import { CAMP_ARRIVE, CAMP_FISHING_SPOTS, CAMP_HOME_SEATS, CAMP_LOTS, CAMP_SEATS, GRAVEYARD_CAPACITY, graveSlot, HOUSE_LOTS, SEA_ARRIVE, SEA_LOTS, SPAWN } from "@tomb/protocol";
type Rect = { x: number; y: number; w: number; h: number };
import { BUNGEO_SPOTS, bungeoColliders, bungeoTalks, bungeoVendorAt, type BungeoSpot } from "@/lib/bungeo/cart";
import { CAMP_GATHER_NODES } from "@/lib/forage/catalog";
import { CART_CX, CART_FOOT } from "../sprites/bungeoCart";
import { campFurnitureColliders, campStaticColliders, campWalkGrid, CAMP_DECOR, CAMP_INTERACTABLES, CAMP_TREES, LAMPS, pathEdgeDist } from "../camp/campLayout";
import { campSnowPiles } from "../camp/snowmanLogic";
import { allFurnitureColliders, houseCollider, staticColliders, walkableGrid, WALK } from "./layout";
import { standSpot } from "./graveLayout";
import { seaFurnitureColliders, seaStaticColliders, seaWalkGrid, SEA_INTERACTABLES } from "../sea/seaLayout";

// 11/23 골목 붕어빵 수레 자리 다섯: 막히는 것과 안 겹치고, 터·집·묘비를 안 가리고, 내리는 자리(마을 SPAWN · 바닷가 정류장)에서 걸어 말 걸기 자리에 닿는지

const overlap = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

type Grid = { cell: number; cols: number; rows: number; cells: Uint8Array };
/** 수레 충돌을 더 막은 격자에서 시작점부터 걸어 닿는 칸 */
function reachFrom(g: Grid, sx: number, sy: number, blocks: Rect[]): (x: number, y: number, r: number) => boolean {
  const { cell, cols, rows } = g;
  const cells = g.cells.slice();
  for (const r of blocks) {
    const c0 = Math.max(0, Math.ceil((r.x - 4 - cell / 2) / cell));
    const c1 = Math.min(cols - 1, Math.floor((r.x + r.w + 4 - cell / 2) / cell));
    const r0 = Math.max(0, Math.ceil((r.y - cell / 2) / cell));
    const r1 = Math.min(rows - 1, Math.floor((r.y + r.h + 5 - cell / 2) / cell));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) cells[y * cols + x] = WALK.blocked;
  }
  const seen = new Uint8Array(cols * rows);
  const start = Math.floor(sy / cell) * cols + Math.floor(sx / cell);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % cols;
    const y = (i / cols) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (seen[j] || cells[j] !== WALK.open) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return (x, y, r) => {
    for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++)
      for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        if (Math.hypot(cx * cell + cell / 2 - x, cy * cell + cell / 2 - y) <= r && seen[cy * cols + cx]) return true;
      }
    return false;
  };
}

const village = BUNGEO_SPOTS.filter((s) => s.map === "village");
const sea = BUNGEO_SPOTS.filter((s) => s.map === "sea");
const camp = BUNGEO_SPOTS.filter((s) => s.map === "camp");

describe("붕어빵 수레 자리 — 데이터", () => {
  it("마을 셋 · 바닷가 둘, id·이름이 겹치지 않는다", () => {
    expect(village).toHaveLength(3);
    expect(sea).toHaveLength(2);
    expect(camp).toHaveLength(2);
    expect(new Set(BUNGEO_SPOTS.map((s) => s.id)).size).toBe(BUNGEO_SPOTS.length);
    expect(new Set(BUNGEO_SPOTS.map((s) => s.name)).size).toBe(BUNGEO_SPOTS.length);
  });
});

describe("붕어빵 수레 자리 — 마을", () => {
  const walls = [...staticColliders(), ...allFurnitureColliders(), ...HOUSE_LOTS.map((l) => houseCollider(l))];
  const grid = walkableGrid(8);
  // 묘비 그림 (가장 큰 모양 20px × GRAVE_SCALE 0.7 ≈ 14 폭, 높이 28 × 0.7 ≈ 20) — 수레 몸통·장수 발치가 묘비를 덮지 않는다
  const graveBoxes = Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => graveSlot(i)).map((p) => ({ x: p.x - 7, y: p.y - 20, w: 14, h: 20 }));
  it.each(village.map((s) => [s.name, s] as [string, BungeoSpot]))("%s: 막히는 것·집·묘비와 안 겹치고, 마을 입구에서 걸어 말 걸 수 있다", (_n, s) => {
    for (const c of bungeoColliders(s)) {
      for (const w of walls) expect(overlap(c, w), `${s.id} ${JSON.stringify(w)}`).toBe(false);
      for (const g of graveBoxes) expect(overlap(c, g, 1), `${s.id} grave ${JSON.stringify(g)}`).toBe(false);
    }
    const ok = reachFrom(grid, SPAWN.x, SPAWN.y, bungeoColliders(s));
    expect(bungeoTalks(s).some((t) => ok(t.x, t.y, t.r)), s.id).toBe(true);
    // 수레가 서도 묘비 앞 자리·집 문은 그대로 닿는다
    for (let i = 0; i < GRAVEYARD_CAPACITY; i++) {
      const p = standSpot(graveSlot(i));
      expect(ok(p.x, p.y, 8), `${s.id} grave ${i}`).toBe(true);
    }
    for (const l of HOUSE_LOTS) expect(ok(l.door.x, l.door.y + 6, 10), `${s.id} lot ${l.lot}`).toBe(true);
  });
});

describe("붕어빵 수레 자리 — 바닷가", () => {
  const walls = [...seaStaticColliders(), ...seaFurnitureColliders()];
  const grid = seaWalkGrid(8);
  it.each(sea.map((s) => [s.name, s] as [string, BungeoSpot]))("%s: 막히는 것·별장 터와 안 겹치고, 정류장에서 걸어 말 걸 수 있다", (_n, s) => {
    for (const c of bungeoColliders(s)) {
      for (const w of walls) expect(overlap(c, w), `${s.id} ${JSON.stringify(w)}`).toBe(false);
      // 터 울타리 바깥으로 6px 넘게 떨어진다
      for (const l of SEA_LOTS) expect(overlap(c, l, 6), `${s.id} lot ${l.n}`).toBe(false);
    }
    // 그림(수레 바닥 가운데)이 터 안에 들어가지 않는다
    for (const l of SEA_LOTS) expect(s.x >= l.x && s.x <= l.x + l.w && s.y >= l.y && s.y <= l.y + l.h, `${s.id} in lot ${l.n}`).toBe(false);
    const ok = reachFrom(grid, SEA_ARRIVE.x, SEA_ARRIVE.y, bungeoColliders(s));
    expect(bungeoTalks(s).some((t) => ok(t.x, t.y, t.r)), s.id).toBe(true);
    // 수레가 서도 다른 상호작용(정류장·터 출입구·부동산·매점 …)은 그대로 닿는다
    for (const o of SEA_INTERACTABLES) expect(ok(o.x, o.y, o.r), `${s.id} ${o.id}`).toBe(true);
    // 다른 상호작용 바로 위에 서지 않는다
    for (const o of SEA_INTERACTABLES) expect(Math.hypot(o.x - s.x, o.y - s.y), `${s.id} near ${o.id}`).toBeGreaterThan(48);
  });
});

describe("붕어빵 수레 자리 — 캠핑장", () => {
  const walls = [...campStaticColliders(), ...campFurnitureColliders()];
  const grid = campWalkGrid(8);
  // 다른 E 대상: 채집 지점 · 낚시 자리 · 상호작용 · 앉는 자리(집 마당 포함) · 집 문 · 눈 더미
  const targets = [
    ...CAMP_GATHER_NODES.map((n) => ({ id: n.id, x: n.x, y: n.y })),
    ...CAMP_FISHING_SPOTS.map((f) => ({ id: f.id, x: f.x, y: f.y })),
    ...CAMP_INTERACTABLES.map((o) => ({ id: o.id, x: o.x, y: o.y })),
    ...CAMP_SEATS.map((o) => ({ id: o.id, x: o.x, y: o.y })),
    ...CAMP_HOME_SEATS.map((o) => ({ id: o.id, x: o.x, y: o.y })),
    ...CAMP_LOTS.map((l) => ({ id: `door${l.lot}`, x: l.door.x, y: l.door.y })),
    ...campSnowPiles().map((p, i) => ({ id: `pile${i}`, x: p.x, y: p.y })),
  ];
  it.each(camp.map((s) => [s.name, s] as [string, BungeoSpot]))("%s: 막히는 것·길·다른 E 대상과 안 겹치고, 정류장에서 걸어 말 걸 수 있다", (_n, s) => {
    const body = { x: s.x - CART_CX + 3, y: s.y - CART_FOOT + 6, w: 46, h: CART_FOOT - 6 };
    const v = bungeoVendorAt(s);
    const vendor = { x: v.x - 7, y: v.y - 24, w: 14, h: 24 };
    for (const c of bungeoColliders(s)) for (const w of walls) expect(overlap(c, w), `${s.id} ${JSON.stringify(w)}`).toBe(false);
    // 수레 그림·장수가 나무·가로등·꾸밈과 겹치지 않고, 그림이 맵 위로 잘리지 않는다
    expect(body.y, s.id).toBeGreaterThanOrEqual(0);
    for (const t of CAMP_TREES) for (const b of [body, vendor]) expect(overlap({ x: t.x - 5, y: t.y - 6, w: 10, h: 6 }, b, 2), `${s.id} tree ${t.kind}@${t.x},${t.y}`).toBe(false);
    for (const p of [...LAMPS, ...CAMP_DECOR]) for (const b of [body, vendor]) expect(overlap({ x: p.x - 4, y: p.y - 4, w: 8, h: 4 }, b, 4), `${s.id} prop ${p.x},${p.y}`).toBe(false);
    // 수레 몸통·장수 발치·말 걸기 자리 가운데가 길(저수지 둘레 길·산책로) 위가 아니다
    for (const c of bungeoColliders(s)) for (const [x, y] of [[c.x, c.y + c.h], [c.x + c.w, c.y + c.h], [c.x + c.w / 2, c.y + c.h]]) expect(pathEdgeDist(x, y), `${s.id} path`).toBeGreaterThan(0);
    // 다른 E 대상에서 40px 넘게
    for (const t of bungeoTalks(s)) for (const o of targets) expect(Math.hypot(o.x - t.x, o.y - t.y), `${s.id} ${t.id} near ${o.id}`).toBeGreaterThanOrEqual(40);
    for (const o of targets) for (const b of [body, vendor]) expect(overlap({ x: o.x - 1, y: o.y - 1, w: 2, h: 2 }, b, 16), `${s.id} covers ${o.id}`).toBe(false);
    const ok = reachFrom(grid, CAMP_ARRIVE.x, CAMP_ARRIVE.y, bungeoColliders(s));
    for (const t of bungeoTalks(s)) expect(ok(t.x, t.y, t.r), `${s.id} ${t.id}`).toBe(true);
  });
});
