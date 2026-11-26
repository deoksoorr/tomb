import type { GoblinRoute } from "@tomb/protocol";
import { expect } from "vitest";
import { lineOfSight } from "../../logic/pathfind";

// 시험 도우미 (goblinMaps.test·goblinCampRoutes.test): 고블린 길의 점이 설 수 있는 땅이고, 이웃한 점 사이가 막히거나 물을 건너지 않는지

type Grid = { cell: number; cols: number; rows: number; cells: Uint8Array };

export function checkGoblinRoutes(routes: readonly GoblinRoute[], standable: (x: number, y: number) => boolean, wet: (x: number, y: number) => boolean, grid: Grid): void {
  const walk = { cols: grid.cols, rows: grid.rows, cell: grid.cell, ox: 0, oy: 0, blocked: (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows || grid.cells[cy * grid.cols + cx] === 1 };
  for (const r of routes) {
    expect(r.pts.length, r.zone).toBeGreaterThanOrEqual(4);
    r.pts.forEach(([x, y], i) => {
      expect(standable(x, y), `${r.zone} #${i} (${x},${y})`).toBe(true);
      expect(wet(x, y), `${r.zone} #${i} 물`).toBe(false);
      const [nx, ny] = r.pts[(i + 1) % r.pts.length];
      expect(lineOfSight(walk, { x, y }, { x: nx, y: ny }), `${r.zone} #${i}→`).toBe(true);
      for (let k = 1; k < 10; k++) expect(wet(x + ((nx - x) * k) / 10, y + ((ny - y) * k) / 10), `${r.zone} #${i}→ 물`).toBe(false);
    });
  }
}
