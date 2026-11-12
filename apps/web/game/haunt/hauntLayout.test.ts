import { describe, expect, it } from "vitest";
import { FERRIS, SEATS, SPAWN } from "@tomb/protocol";
import { allProps, interactables, LANDMARKS, PLAZA_RECT, propCollider, standable, staticColliders, walkableGrid, WALK } from "../world/layout";
import { WISH_FOUNTAIN } from "../world/rides";
import { HAUNT_DOOR, HAUNT_HOUSE, HAUNT_LIGHTS, hauntColliders } from "./hauntLayout";

/** 그림이 차지하는 대략의 영역 (hauntArt HOUSE_W 92 × HOUSE_H 88, 바닥 가운데 원점) */
const ART = { x: HAUNT_HOUSE.x - 46, y: HAUNT_HOUSE.y - 88, w: 92, h: 88 };

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("마을의 귀신의집", () => {
  it("정문에서 내려오는 큰길이 광장에 닿는 입구(소원 분수 옆)에 있고, 문 앞은 서 있을 수 있다", () => {
    expect(HAUNT_HOUSE.x).toBeGreaterThan(PLAZA_RECT.x);
    expect(HAUNT_HOUSE.x).toBeLessThan(PLAZA_RECT.x + PLAZA_RECT.w);
    expect(HAUNT_HOUSE.y).toBeGreaterThan(PLAZA_RECT.y);
    expect(HAUNT_HOUSE.y - PLAZA_RECT.y).toBeLessThan(60);
    expect(Math.hypot(HAUNT_HOUSE.x - WISH_FOUNTAIN.x, HAUNT_HOUSE.y - WISH_FOUNTAIN.y)).toBeLessThan(100);
    expect(Math.hypot(HAUNT_HOUSE.x - SPAWN.x, HAUNT_HOUSE.y - SPAWN.y)).toBeLessThan(260);
    // 관람차와 멀리
    expect(Math.hypot(HAUNT_HOUSE.x - FERRIS.x, HAUNT_HOUSE.y - FERRIS.y)).toBeGreaterThan(200);
    expect(standable(HAUNT_DOOR.x, HAUNT_DOOR.y)).toBe(true);
    expect(standable(HAUNT_DOOR.x, HAUNT_DOOR.y + 6)).toBe(true);
    expect(interactables().some((i) => i.id === "portal:haunt" && i.portal === "haunt")).toBe(true);
    expect(LANDMARKS.some((l) => l.kind === "haunt")).toBe(true);
  });

  it("건물 몸체가 다른 소품·충돌과 겹치지 않는다", () => {
    const mine = hauntColliders();
    const others = staticColliders().filter((c) => !mine.some((m) => m.x === c.x && m.y === c.y && m.w === c.w && m.h === c.h));
    for (const m of mine) {
      for (const c of others) expect(overlap(m, c), JSON.stringify(c)).toBe(false);
      for (const p of allProps()) {
        const c = propCollider(p);
        if (c) expect(overlap(m, c), `${p.kind} ${p.x},${p.y}`).toBe(false);
      }
    }
  });

  it("그림 영역 안에 좌석·소품이 없고, 문 앞에 다른 행동(앉기·놀거리 등)이 겹치지 않는다", () => {
    const inArt = (x: number, y: number) => x > ART.x - 4 && x < ART.x + ART.w + 4 && y > ART.y && y < ART.y + ART.h + 6;
    for (const s of SEATS) expect(inArt(s.x, s.y), s.id).toBe(false);
    for (const p of allProps()) expect(inArt(p.x, p.y), `${p.kind} ${p.x},${p.y}`).toBe(false);
    for (const i of interactables()) {
      if (i.id === "portal:haunt") continue;
      expect(Math.hypot(i.x - HAUNT_DOOR.x, i.y - HAUNT_DOOR.y), i.id).toBeGreaterThan(i.r + 16 + 8);
    }
  });

  it("밤 빛 (보라·초록 벽등 포함)이 건물 둘레에 있다", () => {
    expect(HAUNT_LIGHTS.length).toBeGreaterThanOrEqual(3);
    for (const l of HAUNT_LIGHTS) expect(Math.abs(l.x - HAUNT_HOUSE.x) <= 46 && l.y <= HAUNT_HOUSE.y && l.y >= ART.y).toBe(true);
  });

  it("스폰에서 문 앞까지 걸어서 간다", () => {
    const g = walkableGrid(8);
    const idx = (x: number, y: number) => Math.floor(y / 8) * g.cols + Math.floor(x / 8);
    const seen = new Uint8Array(g.cells.length);
    const q = [idx(SPAWN.x, SPAWN.y)];
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const cx = i % g.cols;
      const cy = (i - cx) / g.cols;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
        const j = ny * g.cols + nx;
        if (seen[j] || g.cells[j] !== WALK.open) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    expect(seen[idx(HAUNT_DOOR.x, HAUNT_DOOR.y)] || seen[idx(HAUNT_DOOR.x, HAUNT_DOOR.y + 4)]).toBe(1);
  });
});
