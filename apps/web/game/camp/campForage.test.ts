import { describe, expect, it } from "vitest";
import {
  anyFishingWaterOf,
  CAMP_ARRIVE,
  CAMP_FISHING_SPOTS,
  CAMP_NPCS,
  CAMP_SEATS,
  DIR,
  FISHING_SPOTS,
  campWet,
  inCampStream,
  seatSlotIn,
} from "@tomb/protocol";
import { CAMP_GATHER_NODES, GATHER_NODES, NODE_CAT, nodeOnMap } from "@/lib/forage/catalog";
import { candidates } from "@/lib/forage/rules";
import { CastSchema, GatherStartSchema } from "@/lib/forage/schemas";
import { campStandable, campWalkGrid, inHome, inSite } from "./campLayout";

// A-6 캠핑장 도감 수집: 낚시 자리·숲 채집 지점이 서 있을 수 있고 닿는 곳인지, 서버가 받는지
// 11/26 폭포 계곡 개편: 계곡 둑·달그늘 소 바위·윤슬 낚시터 둑·좌대 — 좌대 4~6은 헤엄쳐서 닿는다 (닿기는 물을 열어 둔 격자로)

const reachOf = (g: ReturnType<typeof campWalkGrid>) => {
  const { cols, rows, cells, cell } = g;
  const seen = new Uint8Array(cols * rows);
  const start = Math.floor(CAMP_ARRIVE.y / cell) * cols + Math.floor(CAMP_ARRIVE.x / cell);
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
      if (seen[j] || cells[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return { g, seen };
};
// 8px 격자로 못 닿으면 4px 격자로 한 번 더 (11/26 좌대 4~6 사다리 칸·족욕탕 계단처럼 좁은 길)
const coarse = reachOf(campWalkGrid(8, true));
const fine = reachOf(campWalkGrid(4, true));
function reachableNear(x: number, y: number, r: number): boolean {
  for (const { g, seen } of [coarse, fine]) {
    const { cell, cols, rows } = g;
    for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++)
      for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
        if (Math.hypot(cx * cell + cell / 2 - x, cy * cell + cell / 2 - y) <= r && seen[cy * cols + cx]) return true;
      }
  }
  return false;
}
const STEP: Record<number, [number, number]> = { [DIR.down]: [0, 1], [DIR.up]: [0, -1], [DIR.left]: [-1, 0], [DIR.right]: [1, 0] };

describe("캠핑장 낚시 자리", () => {
  it("여러 곳, 서 있을 수 있는 마른 자리에서 물을 바라보고, 정류장에서 걷거나 헤엄쳐 닿는다", () => {
    expect(CAMP_FISHING_SPOTS.length).toBeGreaterThanOrEqual(40);
    for (const s of CAMP_FISHING_SPOTS) {
      expect(campStandable(s.x, s.y), s.id).toBe(true);
      expect(campWet(s.x, s.y), `${s.id} 발밑은 마른 자리`).toBe(false);
      const [dx, dy] = STEP[s.facing];
      expect(campWet(s.x + dx * 24, s.y + dy * 24), `${s.id} 앞이 물`).toBe(true);
      expect(reachableNear(s.x, s.y, 10), `${s.id} 닿기`).toBe(true);
      for (const q of CAMP_SEATS) expect(Math.hypot(q.x - s.x, q.y - s.y), `${s.id} ~ ${q.id}`).toBeGreaterThanOrEqual(20);
      for (const n of CAMP_NPCS) expect(Math.hypot(n.x - s.x, n.y - s.y), `${s.id} ~ ${n.id}`).toBeGreaterThanOrEqual(24);
    }
  });
  it("id는 마을 낚시 자리와 겹치지 않고, 물마다 그 물고기 (계곡 valley · 소 pool · 저수지 reservoir · 나룻배 rowboat)", () => {
    const village = new Set(FISHING_SPOTS.map((s) => s.id));
    expect(new Set(CAMP_FISHING_SPOTS.map((s) => s.id)).size).toBe(CAMP_FISHING_SPOTS.length);
    for (const s of CAMP_FISHING_SPOTS) {
      expect(village.has(s.id), s.id).toBe(false);
      expect(anyFishingWaterOf(s.id)).toBe(s.water);
    }
    expect(new Set(CAMP_FISHING_SPOTS.map((s) => s.water))).toEqual(new Set(["valley", "pool", "reservoir"]));
    expect(anyFishingWaterOf("boat:reservoir")).toBe("rowboat");
    // 마을 자리·배 위 가상 자리는 예전 그대로
    expect(anyFishingWaterOf(FISHING_SPOTS[0].id)).toBe(FISHING_SPOTS[0].water);
    expect(anyFishingWaterOf("boat:lake")).toBe("lake");
    expect(anyFishingWaterOf("f_1_1")).toBeNull();
  });
  it("서버 좌석 판정: 캠핑장에서만 1인 낚시 자리 (마을 맵에서는 없는 자리)", () => {
    const s = CAMP_FISHING_SPOTS[0];
    expect(seatSlotIn("camp", s.id)).toMatchObject({ kind: "fish", x: s.x, y: s.y });
    expect(seatSlotIn("village", s.id)).toBeUndefined();
    expect(seatSlotIn("camp", FISHING_SPOTS[0].id)).toBeUndefined();
  });
  it("웹 서버 입력 검증이 캠핑장 자리를 받는다", () => {
    expect(CastSchema.safeParse({ spot: CAMP_FISHING_SPOTS[0].id }).success).toBe(true);
    expect(CastSchema.safeParse({ spot: "f_1_1" }).success).toBe(false);
  });
});

describe("캠핑장 채집 지점", () => {
  it("곤충·약초·광석·발굴이 모두 있고, id가 겹치지 않고 마을 지점과 구분된다", () => {
    expect(new Set(CAMP_GATHER_NODES.map((n) => n.kind))).toEqual(new Set(["bug", "herb", "ore", "dig"]));
    expect(new Set(GATHER_NODES.map((n) => n.id)).size).toBe(GATHER_NODES.length);
    for (const n of CAMP_GATHER_NODES) {
      expect(nodeOnMap(n, "camp")).toBe(true);
      expect(nodeOnMap(n, "village")).toBe(false);
      expect(GatherStartSchema.safeParse({ node: n.id }).success, n.id).toBe(true);
    }
    expect(GATHER_NODES.filter((n) => nodeOnMap(n, "village")).length).toBeGreaterThan(30);
  });
  it("서 있을 수 있고 걸어서 닿으며, 물·자리·집터·낚시 자리·서로와 떨어져 있다", () => {
    for (const n of CAMP_GATHER_NODES) {
      expect(campStandable(n.x, n.y), n.id).toBe(true);
      expect(inCampStream(n.x, n.y, 8) || campWet(n.x, n.y), n.id).toBe(false);
      expect(reachableNear(n.x, n.y, 12), `${n.id} 닿기`).toBe(true);
      for (const q of CAMP_SEATS) expect(Math.hypot(q.x - n.x, q.y - n.y), `${n.id} ~ ${q.id}`).toBeGreaterThanOrEqual(20);
      for (const q of CAMP_NPCS) expect(Math.hypot(q.x - n.x, q.y - n.y), `${n.id} ~ ${q.id}`).toBeGreaterThanOrEqual(24);
      for (const f of CAMP_FISHING_SPOTS) expect(Math.hypot(f.x - n.x, f.y - n.y), `${n.id} ~ ${f.id}`).toBeGreaterThanOrEqual(24);
      expect(!!inSite(n.x, n.y, 6) || inHome(n.x, n.y, 6, 6), `${n.id} 집터`).toBe(false);
      for (const o of CAMP_GATHER_NODES) if (o !== n) expect(Math.hypot(o.x - n.x, o.y - n.y), `${n.id} ~ ${o.id}`).toBeGreaterThanOrEqual(20);
    }
  });
  it("새 종 없이 기존 종이 나온다 (가을 낮·밤에 지점마다 무언가 잡힌다)", () => {
    for (const phase of ["day", "night"] as const)
      for (const n of CAMP_GATHER_NODES) expect(candidates(NODE_CAT[n.kind], n.where, { phase, weather: "clear", season: "autumn" }).length, `${n.id} ${phase}`).toBeGreaterThan(0);
    // 계곡 물고기 (강)
    expect(candidates("fish", "river", { phase: "day", weather: "clear", season: "autumn" }).length).toBeGreaterThan(3);
  });
});
