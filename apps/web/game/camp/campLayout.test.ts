import { describe, expect, it } from "vitest";
import {
  CAMP_ROAD,
  CAMP_ARRIVE,
  CAMP_BOARD,
  CAMP_FURNITURE,
  CAMP_LOTS,
  CAMP_NPCS,
  CAMP_PLUNGE,
  CAMP_POOL,
  CAMP_RAFTS,
  CAMP_PIER,
  CAMP_RAFT_ART_H,
  CAMP_RAFT_DEPTH,
  CAMP_RAFT_HALF_W,
  campRaftWalks,
  CAMP_SEATS,
  CAMP_VENDING_ROW,
  campStreamX,
  campWet,
  CAMP_STREAM_HALF_W,
  CAMP_CROSSINGS,
  CAMP_STREAM_TOP,
} from "@tomb/protocol";
import {
  CAMP_DECOR,
  CAMP_INTERACTABLES,
  CAMP_TREES,
  FIRE,
  campGroundKind,
  campStandable,
  campStaticColliders,
  campWalkGrid,
  pathEdgeDist,
  treeCollider,
  type Rect,
} from "./campLayout";
import { raft4Art } from "./valleyExtraArt";
import { CAMP_MINIMAP_H, CAMP_MINIMAP_W, campMinimapPixels, toCampMinimap } from "./campMinimap";

const STAND_DY = 9; // logic/sit.ts STAND_OFFSET_Y

// 11/26 폭포 계곡 개편: 물(소·계곡·저수지)은 헤엄쳐 다니는 칸 — 닿기는 물을 연 격자로 본다 (좌대 4~6은 헤엄쳐서)
const grid = campWalkGrid(8, true);
/** 11/26 족욕탕 데크(앞 계단으로만 오른다)처럼 좁은 길은 4px 격자로 본다 */
const fine = campWalkGrid(4, true);
/** 정류장 앞(버스에서 내리는 자리)에서 걷거나 헤엄쳐 닿는 칸 */
const reachOf = (g: typeof grid) => {
  const { cols, rows, cells, cell } = g;
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
};
const reach = reachOf(grid);
const reachFine = reachOf(fine);
/** (x,y) 둘레 r 안에 정류장에서 걸어 닿는 칸이 있는지 (8px 격자 — 못 닿으면 4px 격자로 한 번 더) */
function reachableNear(x: number, y: number, r: number): boolean {
  return reachIn(grid, reach, x, y, r) || reachIn(fine, reachFine, x, y, r);
}
function reachIn(g: typeof grid, seen: Uint8Array, x: number, y: number, r: number): boolean {
  const { cell, cols, rows } = g;
  for (let cy = Math.floor((y - r) / cell); cy <= Math.floor((y + r) / cell); cy++)
    for (let cx = Math.floor((x - r) / cell); cx <= Math.floor((x + r) / cell); cx++) {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const px = cx * cell + cell / 2;
      const py = cy * cell + cell / 2;
      if (Math.hypot(px - x, py - y) <= r && seen[cy * cols + cx]) return true;
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
      expect(campStandable(s.x + (s.standDx ?? 0), s.y + (s.standDy ?? STAND_DY)), `${s.id} 일어설 자리`).toBe(true);
      expect(reachableNear(s.x + (s.standDx ?? 0), s.y + (s.standDy ?? STAND_DY), 10), `${s.id} 닿기`).toBe(true);
    }
  });

  it("캠프파이어 존 통나무 12 · 작은 불 넷 · 폭포 다리 · 족욕탕에 걸어서 간다", () => {
    expect(CAMP_FURNITURE.filter((f) => f.id.startsWith("qL"))).toHaveLength(12);
    for (const id of ["qS1", "qS4", "qP1-0", "qP3-1", "qP4", "qG1", "qG4", "qW1-0", "qW2-1", "qT1", "qT8", "qT9", "qK1-0"]) {
      const s = CAMP_SEATS.find((x) => x.id === id)!;
      expect(s, id).toBeTruthy();
      expect(reachableNear(s.x + (s.standDx ?? 0), s.y + (s.standDy ?? STAND_DY), 10), id).toBe(true);
    }
  });

  it("11/26 족욕탕은 앞 계단으로만 오른다 (옆·앞 끝에서 데크로 못 올라간다)", () => {
    const x0 = 352;
    const y0 = 72;
    // 데크 옆·앞 끝 바로 밖에서 안으로 한 칸 들어선 자리는 막혀 있다
    for (const [x, y] of [[x0 + 1, y0 + 60], [x0 + 79, y0 + 60], [x0 + 12, y0 + 112], [x0 + 68, y0 + 112]]) expect(campStandable(x, y), `${x},${y}`).toBe(false);
    // 계단은 오를 수 있다
    expect(campStandable(x0 + 40, y0 + 112)).toBe(true);
  });

  it("상호작용 자리는 반지름 안에서 닿는다 (버스·NPC 6·의뢰판·표지판·바베큐·간식·자판기 셋)", () => {
    expect(CAMP_INTERACTABLES.filter((i) => i.kind === "npc")).toHaveLength(6);
    expect(CAMP_INTERACTABLES.filter((i) => i.kind === "vending")).toHaveLength(CAMP_VENDING_ROW.length);
    // 11/26 분양 입간판은 카라반·펜션 모두 뺐다 (운영자 「카라반, 촌캉스도 NPC만으로 통일」 — 분양은 NPC에게 말을 걸어서만)
    expect(CAMP_INTERACTABLES.filter((i) => i.id.startsWith("sale"))).toEqual([]);
    for (const it of CAMP_INTERACTABLES) expect(reachableNear(it.x, it.y, it.r), it.id).toBe(true);
  });

  it("카라반·펜션·촌캉스 터 문 앞에 닿는다 (집 화면 담당이 문 E를 둔다)", () => {
    for (const l of CAMP_LOTS) expect(reachableNear(l.door.x, l.door.y, 12), `${l.lot}번 터 문`).toBe(true);
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

  it("물: 소·계곡·저수지는 헤엄, 다리·징검다리는 걸어서, 걸어 다니는 주민 격자는 물을 막는다", () => {
    for (const y of [420, 520, 700]) expect(campWet(campStreamX(y), y), `계곡 ${y}`).toBe(true);
    for (const c of CAMP_CROSSINGS) {
      const y = (c.y0 + c.y1) / 2;
      expect(campWet(campStreamX(y), y), c.kind).toBe(false);
      expect(campStandable(campStreamX(y), y), c.kind).toBe(true);
    }
    const walk = campWalkGrid(8);
    const at = (x: number, y: number) => walk.cells[Math.floor(y / 8) * walk.cols + Math.floor(x / 8)];
    expect(at(CAMP_POOL.x, CAMP_POOL.y + 30)).toBe(1);
    expect(at(1100, 420)).toBe(1);
    // 좌대 4~6은 헤엄쳐서만 (걷는 격자로는 못 간다), 1~3은 잔교로 걸어서
    for (const r of CAMP_RAFTS) expect(reachableNear(r.x, r.y - 14, 8), `좌대 ${r.n}`).toBe(true);
  });

  it("11/26 잔교에 붙은 좌대 1~3: 잔교 → 마루는 그림의 판자 다리 칸으로만 걷는다 (다리 밖·오두막 뒤는 막이)", () => {
    const cols = campStaticColliders();
    const hit = (x: number, y: number) => cols.some((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
    const top = CAMP_PIER.y + CAMP_PIER.w / 2;
    for (const r of CAMP_RAFTS.filter((q) => q.link)) {
      const walks = campRaftWalks(r);
      const deckTop = r.y - CAMP_RAFT_DEPTH;
      const art = raft4Art(r.roof, false, "left", { n: r.n, walks: walks.map((w) => w.x - r.x + 36) });
      // 잔교 아래 끝 줄(top)은 잔교 판 — 그 아래부터 마루 뒤 끝까지, 좌대 둘레 막이 폭(5) 안
      for (let y = top + 1; y < deckTop; y++)
        for (let x = r.x - CAMP_RAFT_HALF_W - 5; x < r.x + CAMP_RAFT_HALF_W + 5; x++) {
          const inWalk = walks.some((w) => x >= w.x && x <= w.x + w.w);
          const free = !hit(x, y) && !campWet(x, y);
          expect(free, `좌대 ${r.n} (${x},${y})`).toBe(inWalk);
          // 그림: 다리 칸은 판자가 칠해져 있다
          if (inWalk) expect((art.grid.get(x - r.x + 36, y - (r.y - CAMP_RAFT_ART_H)) & 255) > 200, `좌대 ${r.n} 그림 (${x},${y})`).toBe(true);
        }
      // 몸 상자(8px)가 지나갈 폭
      for (const w of walks) expect(w.w + 1).toBeGreaterThanOrEqual(10);
    }
  });
  it("절벽은 막히고 폭포 밑(물살)은 물이다", () => {
    expect(campStandable(640, 120)).toBe(false);
    expect(campStandable(520, 150)).toBe(false);
    expect(campWet(CAMP_PLUNGE.x, CAMP_PLUNGE.y + 10)).toBe(true);
  });

  it("나무 줄기는 길·집터·자리·물을 막지 않는다", () => {
    expect(CAMP_TREES.length).toBeGreaterThan(120);
    for (const t of CAMP_TREES) {
      const c = treeCollider(t);
      expect(pathEdgeDist(t.x, t.y), `${t.kind} ${t.x},${t.y} 길`).toBeGreaterThan(2);
      if (t.y > CAMP_STREAM_TOP) expect(Math.abs(t.x - campStreamX(t.y)) > CAMP_STREAM_HALF_W + 4).toBe(true);
      expect(campWet(t.x, t.y), `${t.x},${t.y} 물 위 나무`).toBe(false);
      for (const l of CAMP_LOTS) expect(hit(l, t.x, t.y), `${l.lot}번 터 안 나무`).toBe(false);
      for (const s of CAMP_SEATS) expect(hit({ x: c.x - 4, y: c.y - 2, w: c.w + 8, h: c.h + 12 }, s.x, s.y + STAND_DY), `${s.id} 앞 나무`).toBe(false);
    }
  });

  it("바닥 종류: 정류장 앞은 길, 계곡 가운데는 물, 소·저수지·절벽·캠프파이어 마당·카라반 자갈", () => {
    // 11/15 정류장을 한 줄 올렸다 (채팅창에 가리지 않게): 버스 길은 정류장 바로 아래, 맵 맨 아래는 숲
    expect(campGroundKind(140, CAMP_ROAD.y + 20)).toBe("road");
    expect(campGroundKind(140, 780)).not.toBe("road");
    expect(campGroundKind(campStreamX(420), 420)).toBe("water");
    expect(campGroundKind(CAMP_POOL.x, CAMP_POOL.y + 20)).toBe("pool");
    expect(campGroundKind(1100, 420)).toBe("pond");
    expect(campGroundKind(560, 120)).toBe("cliff");
    expect(campGroundKind(FIRE.x, FIRE.y + 30)).toBe("plaza");
    const l7 = CAMP_LOTS.find((l) => l.lot === 7)!;
    expect(campGroundKind(l7.x + l7.w / 2, l7.y + l7.h / 2)).toBe("pad");
  });

  it("장식은 맵 안에 있다", () => {
    expect(CAMP_DECOR.length).toBeGreaterThan(40);
    for (const d of CAMP_DECOR) expect(d.x >= -24 && d.x <= 1304 && d.y >= 0 && d.y <= 850, `${d.kind} ${d.x},${d.y}`).toBe(true);
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

// 11/26 qM1 해먹 E 안내(받침 + 10px부터 글씨 한 줄 ≈ 6px)가 정류장 이름표(CampMap addLabel — 쉼터 위 4px, 아래 끝 기준 한 줄)와 겹치지 않게
describe("qM1 해먹 안내 ↔ 정류장 이름표", () => {
  it("안내 아래 끝이 이름표 위 끝보다 위", async () => {
    const { CAMP_HAMMOCKS, CAMP_BUS_STOP } = await import("@tomb/protocol");
    const { CAMP_SHELTER_H } = await import("./campLayout");
    const h = CAMP_HAMMOCKS.find((x) => x.id === "qM1")!;
    const hintBottom = h.y + 10 + 6;
    const labelTop = CAMP_BUS_STOP.y - CAMP_SHELTER_H - 4 - 6;
    expect(hintBottom).toBeLessThan(labelTop);
  });
});
