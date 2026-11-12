import { describe, expect, it } from "vitest";
import { HILL, SPAWN } from "@tomb/protocol";
import { allProps, interactables, LANDMARKS, propCollider, standable, staticColliders, walkableGrid, WALK } from "../world/layout";
import { HAUNT_DOOR, HAUNT_HOUSE, hauntColliders } from "./hauntLayout";

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("마을의 귀신의집", () => {
  it("언덕 위 마을 가장자리에 있고, 문 앞은 서 있을 수 있다", () => {
    expect(HAUNT_HOUSE.x).toBeGreaterThan(HILL.x + 30);
    expect(HAUNT_HOUSE.y).toBeLessThan(HILL.y + HILL.h - 40);
    expect(standable(HAUNT_DOOR.x, HAUNT_DOOR.y)).toBe(true);
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
