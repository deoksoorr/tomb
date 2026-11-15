import { describe, expect, it } from "vitest";
import { CAMP_ROAD, CAMP_ARRIVE, CAMP_BOARD, CAMP_DECKS, CAMP_FURNITURE, CAMP_NPCS, CAMP_SEATS, CAMP_VANS, campStreamX, CAMP_STREAM_HALF_W, CAMP_CROSSINGS } from "@tomb/protocol";
import {
  CAMP_DECOR,
  CAMP_INTERACTABLES,
  CAMP_LIGHTS,
  CAMP_TREES,
  campFurnitureColliders,
  campGroundKind,
  campStandable,
  campStaticColliders,
  campWalkGrid,
  pathEdgeDist,
  treeCollider,
  type Rect,
} from "./campLayout";
import { CAMP_MINIMAP_H, CAMP_MINIMAP_W, campMinimapPixels, toCampMinimap } from "./campMinimap";

const STAND_DY = 9; // logic/sit.ts STAND_OFFSET_Y

const grid = campWalkGrid(8);
/** 정류장 앞(버스에서 내리는 자리)에서 걸어서 닿는 칸 */
const reach = (() => {
  const { cols, rows, cells, cell } = grid;
  const seen = new Uint8Array(cols * rows);
  const sx = Math.floor(CAMP_ARRIVE.x / cell);
  const sy = Math.floor(CAMP_ARRIVE.y / cell);
  const q = [sy * cols + sx];
  seen[q[0]] = 1;
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
  return seen;
})();
/** (x,y) 둘레 r 안에 정류장에서 걸어 닿는 칸이 있는지 */
function reachableNear(x: number, y: number, r: number): boolean {
  const { cell, cols, rows } = grid;
  for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++)
    for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const px = cx * cell + cell / 2;
      const py = cy * cell + cell / 2;
      if (Math.hypot(px - x, py - y) <= r && reach[cy * cols + cx]) return true;
    }
  return false;
}
const hit = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

describe("언젠가 캠핑장 배치", () => {
  it("버스에서 내리는 자리·타는 자리에 설 수 있다", () => {
    expect(campStandable(CAMP_ARRIVE.x, CAMP_ARRIVE.y)).toBe(true);
    expect(campStandable(CAMP_BOARD.x, CAMP_BOARD.y)).toBe(true);
  });

  it("좌석은 막히는 상자 안에 있지 않고, 일어설 자리(앞 9px)에 서서 정류장에서 걸어 닿는다", () => {
    const statics = campStaticColliders();
    for (const s of CAMP_SEATS) {
      expect(statics.some((r) => hit(r, s.x, s.y - 1)), s.id).toBe(false);
      expect(campStandable(s.x, s.y + STAND_DY), `${s.id} 일어설 자리`).toBe(true);
      expect(reachableNear(s.x, s.y + STAND_DY, 10), `${s.id} 닿기`).toBe(true);
    }
  });

  it("광장 통나무 12개·데크 24·관리소 NPC·계곡 바위·전망대 벤치·캠핑카 문·타프 의자에 걸어서 간다", () => {
    expect(CAMP_FURNITURE.filter((f) => f.id.startsWith("qL"))).toHaveLength(12);
    for (const d of CAMP_DECKS) expect(reachableNear(d.x, d.y, 14), `${d.n}번 데크`).toBe(true);
    for (const id of ["qR1", "qR2", "qR3", "qR4", "qR5", "qO1-0", "qO2-1", "qT1-1", "qT2-1", "qV1", "qV2", "qV3"]) {
      const s = CAMP_SEATS.find((x) => x.id === id)!;
      expect(reachableNear(s.x, s.y + STAND_DY, 10), id).toBe(true);
    }
  });

  it("상호작용 자리는 반지름 안에서 걸어 닿는다 (버스·NPC 5·캠핑카 3·데크 24·의뢰판·표지판)", () => {
    expect(CAMP_INTERACTABLES.filter((i) => i.kind === "npc")).toHaveLength(5);
    expect(CAMP_INTERACTABLES.filter((i) => i.kind === "deck")).toHaveLength(24);
    expect(CAMP_INTERACTABLES.filter((i) => i.kind === "van").map((i) => i.seatId)).toEqual(["qV1", "qV2", "qV3"]);
    for (const it of CAMP_INTERACTABLES) expect(reachableNear(it.x, it.y, it.r), it.id).toBe(true);
  });

  it("NPC 앞에 설 수 있다", () => {
    for (const n of CAMP_NPCS) {
      const near = [
        [0, 12],
        [-14, 6],
        [14, 6],
        [0, -10],
      ].some(([dx, dy]) => campStandable(n.x + dx, n.y + dy) && reachableNear(n.x + dx, n.y + dy, 6));
      expect(near, n.id).toBe(true);
    }
  });

  it("계곡은 건너는 곳(징검다리·통나무 다리)으로만 건넌다", () => {
    // 오른쪽 물가 산책로(전망대 계단 아래)에 닿는다 = 어딘가로 건넌다
    expect(reachableNear(1172, 168, 10)).toBe(true);
    for (const y of [120, 420, 700]) expect(campStandable(campStreamX(y), y), `물 ${y}`).toBe(false);
    for (const c of CAMP_CROSSINGS) {
      const y = (c.y0 + c.y1) / 2;
      expect(campStandable(campStreamX(y), y), `${c.kind}`).toBe(true);
    }
  });

  it("나무 줄기는 길·데크·자리·물을 막지 않는다", () => {
    expect(CAMP_TREES.length).toBeGreaterThan(150);
    for (const t of CAMP_TREES) {
      const c = treeCollider(t);
      expect(pathEdgeDist(t.x, t.y), `${t.kind} ${t.x},${t.y} 길`).toBeGreaterThan(2);
      expect(Math.abs(t.x - campStreamX(t.y)) > CAMP_STREAM_HALF_W + 4).toBe(true);
      for (const d of CAMP_DECKS) expect(Math.abs(t.x - d.x) < 20 && Math.abs(t.y - d.y) < 15, `${d.n}번 데크 위 나무`).toBe(false);
      for (const s of CAMP_SEATS) expect(hit({ x: c.x - 4, y: c.y - 2, w: c.w + 8, h: c.h + 12 }, s.x, s.y + STAND_DY), `${s.id} 앞 나무`).toBe(false);
    }
  });

  it("캠핑카 문간 자리는 차 바로 앞이고 막히지 않는다", () => {
    const furn = campFurnitureColliders();
    for (const v of CAMP_VANS) {
      const s = CAMP_SEATS.find((x) => x.id === `qV${v.id.slice(1)}`)!;
      expect(s.y).toBeGreaterThan(v.y);
      expect(furn.some((r) => hit(r, s.x, s.y - 1))).toBe(false);
    }
  });

  it("바닥 종류: 정류장 앞은 길, 계곡 가운데는 물, 광장은 흙 마당, 전망대 둘레는 바위", () => {
    // 11/15 정류장을 한 줄 올렸다 (채팅창에 가리지 않게): 버스 길은 정류장 바로 아래, 맵 맨 아래는 숲
    expect(campGroundKind(140, CAMP_ROAD.y + 20)).toBe("road");
    expect(campGroundKind(140, 780)).not.toBe("road");
    expect(campGroundKind(campStreamX(420), 420)).toBe("water");
    expect(campGroundKind(620, 440)).toBe("plaza");
    expect(campGroundKind(1172, 60)).toBe("rock");
    expect(campGroundKind(300, 300)).toBe("grass");
  });

  it("빛·장식은 맵 안에 있다", () => {
    for (const l of CAMP_LIGHTS) expect(l.x >= 0 && l.x <= 1280 && l.y >= 0 && l.y <= 800).toBe(true);
    expect(CAMP_DECOR.length).toBeGreaterThan(40);
  });

  it("미니맵 바탕: 크기·물 색·좌표 변환", () => {
    const px = campMinimapPixels();
    expect(px.length).toBe(CAMP_MINIMAP_W * CAMP_MINIMAP_H * 4);
    const m = toCampMinimap(campStreamX(420), 420);
    const i = (Math.floor(m.y) * CAMP_MINIMAP_W + Math.floor(m.x)) * 4;
    expect(px[i + 2]).toBeGreaterThan(px[i]); // 물은 파랗다
    expect(px[i + 3]).toBe(255);
  });
});
