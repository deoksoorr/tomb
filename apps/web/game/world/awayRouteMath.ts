import { nearestSeller, type NpcMap } from "@/lib/forage/catalog";
import type { FirstGuideTarget } from "@/lib/retain";
import type { WalkGrid } from "../logic/pathfind";
import type { RouteGoal, Pt } from "./routeGuideMath";

// 11/26 캠핑장·바닷가 길 안내(AwayRoute)의 순수 계산 — Phaser 없이 테스트한다.

/** 이 맵에서 안내하는 목적지 */
export const awayRouteTargets: readonly FirstGuideTarget[] = ["seller"];

/** 맵 걷기 격자 (campWalkGrid·seaWalkGrid 모양) → 길찾기 격자 */
export function gridOfCells(g: { cell: number; cols: number; rows: number; cells: Uint8Array }): WalkGrid {
  return { cols: g.cols, rows: g.rows, cell: g.cell, ox: 0, oy: 0, blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows || g.cells[cy * g.cols + cx] === 1 };
}

/** 「팔기」 목적지: 이 맵에서 가장 가까운 상인 앞 (Foraging 상인 E 자리 — 발 아래 10px, 반경 20) */
export function sellerRoute(map: NpcMap, from: Pt): { goals: RouteGoal[]; label: string } | null {
  const n = nearestSeller(map, from.x, from.y);
  return n ? { goals: [{ x: n.x, y: n.y + 10, r: 20 }], label: n.name } : null;
}
