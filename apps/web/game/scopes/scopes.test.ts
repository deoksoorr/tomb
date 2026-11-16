import { describe, expect, it } from "vitest";
import {
  BOATS,
  CAMP_ARRIVE,
  CAMP_FISHING_SPOTS,
  CAMP_SEATS,
  FISHING_SPOTS,
  SEATS,
  CAMP_SCOPES,
  DIR,
  SEA_ARRIVE,
  SEA_FISHING_SPOTS,
  SEA_REST_SEATS,
  SEA_SCOPES,
  SEA_SEATS,
  SPAWN,
  STATE,
  TELESCOPES,
  VILLAGE_SCOPES,
  scopeSeatId,
  seatSlotIn,
  spotSeatId,
} from "@tomb/protocol";
import { allProps, inWater, interactables, LANDMARKS, propCollider, staticColliders, standable, walkableGrid } from "../world/layout";
import { CAMP_INTERACTABLES, CAMP_TREES, campStandable, campStaticColliders, campWalkGrid } from "../camp/campLayout";
import { CAMP_LANDMARKS } from "../camp/campMinimap";
import { SEA_INTERACTABLES, SEA_TREES, seaFurnitureColliders, seaGroundKind, seaStandable, seaStaticColliders, seaWalkGrid } from "../sea/seaLayout";
import { MAP_ICONS } from "../world/minimapIcons";
import { campScopeGrid, coinScopeGrid } from "./scopeArt";
import { SCOPE_E_RADIUS, scopeBaseRect } from "./scopeGeom";

// 11/16 사용자 "망원경 갯수를 여기저기 좀 늘렸으면" — 마을 곳곳·캠핑장·바닷가 망원경이
// 자리(서버 1인 자리 id)·충돌·E 범위·걸어서 닿는지·그림 겹침에서 기존 망원경과 같은 규칙을 지키는지.

type Rect = { x: number; y: number; w: number; h: number };
type Grid = { cell: number; cols: number; rows: number; cells: Uint8Array };
const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** 시작점에서 열린 칸(0)으로 이어진 칸들 → 이 점(또는 발 한 걸음 아래)에 닿는지 */
function reach(g: Grid, from: { x: number; y: number }): (x: number, y: number) => boolean {
  const seen = new Uint8Array(g.cells.length);
  const start = Math.floor(from.y / g.cell) * g.cols + Math.floor(from.x / g.cell);
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
      if (seen[j] || g.cells[j] !== 0) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  const at = (x: number, y: number) => seen[Math.floor(y / g.cell) * g.cols + Math.floor(x / g.cell)] === 1;
  return (x, y) => at(x, y) || at(x, y + 4) || at(x - 4, y + 4) || at(x + 4, y + 4);
}

describe("마을 곳곳 망원경 (VILLAGE_SCOPES)", () => {
  it("언덕 둘에 더해 넷 이상, 모두 TELESCOPES에 들어 있고 미니맵 이름이 따로 있다", () => {
    expect(VILLAGE_SCOPES.length).toBeGreaterThanOrEqual(4);
    expect(TELESCOPES.length).toBe(2 + VILLAGE_SCOPES.length);
    for (const t of VILLAGE_SCOPES) {
      expect(TELESCOPES).toContain(t);
      expect(LANDMARKS.some((l) => l.kind === "telescope" && l.label === t.name && l.x === t.x && l.y === t.y), t.name).toBe(true);
    }
    expect(new Set(VILLAGE_SCOPES.map((t) => t.name)).size).toBe(VILLAGE_SCOPES.length);
    expect(MAP_ICONS.telescope).toBeDefined();
  });

  it("앞자리는 서 있을 수 있고 물 밖이며 마을 입구에서 걸어서 닿는다, 받침은 충돌", () => {
    const ok = reach(walkableGrid(8), SPAWN);
    const items = interactables();
    const colliders = staticColliders();
    for (const t of VILLAGE_SCOPES) {
      const o = items.find((i) => i.kind === "telescope" && i.ax === t.x && i.ay === t.y + 10);
      expect(o, t.name).toBeDefined();
      expect(standable(t.x, t.y + 10), t.name).toBe(true);
      expect(inWater(t.x, t.y + 10), t.name).toBe(false);
      expect(ok(t.x, t.y + 10), t.name).toBe(true);
      expect(colliders.some((c) => c.x === t.x - 5 && c.y === t.y - 5 && c.w === 10 && c.h === 5), t.name).toBe(true);
      expect(seatSlotIn("village", spotSeatId("telescope", t.x, t.y + 10))).toMatchObject({ kind: "telescope", state: STATE.idle, facing: DIR.up });
    }
  });

  it("낚시 자리·좌석·조각배와 떨어져 있다 (서는 자리·낚싯대·앉는 사람이 망원경과 겹치지 않게)", () => {
    for (const t of VILLAGE_SCOPES) {
      for (const f of FISHING_SPOTS) expect(Math.hypot(f.x - t.x, f.y - (t.y + 10)), `${t.name} ↔ ${f.id}`).toBeGreaterThan(30);
      for (const st of SEATS) expect(Math.hypot(st.x - t.x, st.y - (t.y + 10)), `${t.name} ↔ ${st.id}`).toBeGreaterThan(24);
      for (const b of BOATS) expect(Math.hypot(b.x - t.x, b.y - t.y), `${t.name} ↔ ${b.id}`).toBeGreaterThan(30);
    }
  });

  it("나무·석등 같은 소품과 그림이 겹치지 않는다 (받침 둘레 16px 안에 막는 소품이 없다)", () => {
    for (const t of VILLAGE_SCOPES)
      for (const p of allProps()) {
        if (!propCollider(p)) continue;
        expect(Math.hypot(p.x - t.x, p.y - t.y), `${t.name} ↔ ${p.kind}@${p.x},${p.y}`).toBeGreaterThan(16);
      }
  });
});

describe("캠핑장 별 망원경 (CAMP_SCOPES)", () => {
  it("상호작용·받침 충돌·미니맵", () => {
    expect(CAMP_SCOPES.length).toBeGreaterThanOrEqual(2);
    const cols = campStaticColliders();
    for (const s of CAMP_SCOPES) {
      expect(s.kind).toBe("telescope");
      expect(CAMP_INTERACTABLES.find((o) => o.id === s.id)).toMatchObject({ kind: "telescope", x: s.ax, y: s.ay, r: SCOPE_E_RADIUS });
      expect(cols.some((c) => sameRect(c, scopeBaseRect(s))), s.id).toBe(true);
    }
    expect(CAMP_LANDMARKS.some((l) => l.kind === "telescope")).toBe(true);
  });

  it("앞자리는 서 있을 수 있고 정류장에서 걸어서 닿는다, 다른 E 자리·나무와 겹치지 않는다", () => {
    const ok = reach(campWalkGrid(8), CAMP_ARRIVE);
    for (const s of CAMP_SCOPES) {
      expect(campStandable(s.ax, s.ay), s.id).toBe(true);
      expect(ok(s.ax, s.ay), s.id).toBe(true);
      for (const o of CAMP_INTERACTABLES) if (o.id !== s.id) expect(Math.hypot(o.x - s.ax, o.y - s.ay), `${s.id} ↔ ${o.id}`).toBeGreaterThan(o.r + SCOPE_E_RADIUS);
      for (const t of CAMP_TREES) expect(Math.hypot(t.x - s.x, t.y - s.y), `${s.id} ↔ tree@${t.x},${t.y}`).toBeGreaterThan(16);
      for (const f of CAMP_FISHING_SPOTS) expect(Math.hypot(f.x - s.ax, f.y - s.ay), `${s.id} ↔ ${f.id}`).toBeGreaterThan(30);
      for (const st of CAMP_SEATS) expect(Math.hypot(st.x - s.ax, st.y - s.ay), `${s.id} ↔ ${st.id}`).toBeGreaterThan(24);
    }
  });

  it("서버가 캠핑장에서 받는 1인 자리 (별 망원경 = 하늘을 본다)", () => {
    for (const s of CAMP_SCOPES) expect(seatSlotIn("camp", scopeSeatId(s))).toMatchObject({ kind: "telescope", x: s.ax, y: s.ay, state: STATE.idle, facing: DIR.up });
  });
});

describe("바닷가 동전 망원경 (SEA_SCOPES)", () => {
  it("뒤에 서서 바다(아래)를 본다: 앵커는 받침 위쪽, 서버 1인 자리는 binocular", () => {
    expect(SEA_SCOPES.length).toBeGreaterThanOrEqual(2);
    expect(new Set(SEA_SCOPES.map(scopeSeatId)).size).toBe(SEA_SCOPES.length);
    for (const s of SEA_SCOPES) {
      expect(s.kind).toBe("binocular");
      expect(s.ay).toBeLessThan(s.y);
      expect(seatSlotIn("sea", scopeSeatId(s))).toMatchObject({ kind: "binocular", x: s.ax, y: s.ay, state: STATE.idle, facing: DIR.down });
      // 마을·캠핑장에서도 형식만 맞으면 받는 소품 자리지만, 바닷가 자리 id가 마을 망원경과 섞이지 않는다
      expect(scopeSeatId(s).startsWith("y_")).toBe(true);
    }
  });

  it("받침은 빈 마른 땅(산책로·모래) 위, 앞자리는 서 있을 수 있고 정류장에서 걸어서 닿는다", () => {
    const ok = reach(seaWalkGrid(8), SEA_ARRIVE);
    const solid = [...seaStaticColliders(), ...seaFurnitureColliders()];
    for (const s of SEA_SCOPES) {
      const base = scopeBaseRect(s);
      expect(solid.filter((c) => overlap(c, base)), s.id).toEqual([]);
      expect(["boardwalk", "sand"], s.id).toContain(seaGroundKind(s.x, s.y));
      expect(["boardwalk", "sand"], s.id).toContain(seaGroundKind(s.ax, s.ay));
      expect(seaStandable(s.ax, s.ay), s.id).toBe(true);
      expect(ok(s.ax, s.ay), s.id).toBe(true);
    }
  });

  it("다른 E 자리·좌석·쉴거리·나무와 겹치지 않는다", () => {
    for (const s of SEA_SCOPES) {
      for (const o of SEA_INTERACTABLES) expect(Math.hypot(o.x - s.ax, o.y - s.ay), `${s.id} ↔ ${o.id}`).toBeGreaterThan(o.r + SCOPE_E_RADIUS);
      for (const p of [...SEA_SEATS, ...SEA_REST_SEATS]) expect(Math.hypot(p.x - s.ax, p.y - s.ay), `${s.id} ↔ ${p.id}`).toBeGreaterThan(SCOPE_E_RADIUS + 8);
      for (const f of SEA_FISHING_SPOTS) expect(Math.hypot(f.x - s.ax, f.y - s.ay), `${s.id} ↔ ${f.id}`).toBeGreaterThan(30);
      for (const t of SEA_TREES) expect(Math.hypot(t.x - s.x, t.y - s.y), `${s.id} ↔ ${t.kind}@${t.x},${t.y}`).toBeGreaterThan(18);
    }
  });
});

describe("망원경 그림", () => {
  it("받침 가운데 아래가 원점: 맨 아래 근처 가운데가 칠해져 있고, 크기는 소품 크기", () => {
    const camp = campScopeGrid();
    const coin = coinScopeGrid();
    expect(camp.w).toBeLessThanOrEqual(24);
    expect(coin.h).toBeLessThanOrEqual(36);
    // 삼각대 다리 끝 · 동전 망원경 둥근 받침
    expect(camp.filled(4, 24) && camp.filled(16, 24)).toBe(true);
    expect(coin.filled(coin.w >> 1, 29)).toBe(true);
    // 동전 망원경 렌즈 둘 (쌍안)
    expect(coin.filled((coin.w >> 1) - 4, 8) && coin.filled((coin.w >> 1) + 4, 8)).toBe(true);
  });
});
