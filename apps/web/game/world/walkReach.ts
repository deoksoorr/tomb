import { SPAWN } from "@tomb/protocol";
import { inWater, standable, walkableGrid, WALK, type WalkGrid } from "./layout";

// 걸어서 닿는 땅 (11/16) — 스폰에서 물을 건너지 않고 걸어서 이어지는 걷기 격자 칸 (8px, layout.walkableGrid).
// 배에서 내려설 뭍·새로고침 복원 자리가 막힌 주머니(범퍼카 링크 안·동물원 우리 안 등)이면 갇히므로 이 격자로 다시 본다.
// 필지는 비워 둔 격자로 잇는다 (집 몸체 충돌은 standable이 따로 본다 — 집 앞마당이 막힌 칸으로 굽혀 갇힘으로 보지 않게).
// 처음 부를 때 한 번 만든다 (맵은 고정).

let reach: { g: WalkGrid; seen: Uint8Array } | null = null;

function build(): { g: WalkGrid; seen: Uint8Array } {
  const g = walkableGrid(8, [], []);
  const seen = new Uint8Array(g.cells.length);
  const start = Math.floor(SPAWN.y / g.cell) * g.cols + Math.floor(SPAWN.x / g.cell);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop()!;
    const cx = i % g.cols;
    const cy = (i - cx) / g.cols;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
      const j = ny * g.cols + nx;
      if (seen[j] || g.cells[j] !== WALK.open) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return { g, seen };
}

/**
 * 이 발 위치가 스폰에서 걸어서 이어지는 땅인지. 격자는 8px 칸이라 벽·소품 바로 옆 칸은 막힘으로 굽혀진다 → 이웃 칸까지 본다
 */
export function walkReachable(x: number, y: number): boolean {
  reach ??= build();
  const { g, seen } = reach;
  const c = Math.floor(x / g.cell);
  const r = Math.floor(y / g.cell);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = c + dx;
      const cy = r + dy;
      if (cx >= 0 && cy >= 0 && cx < g.cols && cy < g.rows && seen[cy * g.cols + cx] === 1) return true;
    }
  return false;
}

/** 내려서도 되는 뭍: 충돌 밖 + 물 밖 + 걸어서 이어지는 땅 (배에서 내릴 때·자리 복원) */
export function safeGround(x: number, y: number): boolean {
  return standable(x, y) && !inWater(x, y) && walkReachable(x, y);
}

/**
 * (x, y) 둘레 maxR 안에서 가장 가까운 내려서도 되는 뭍 (격자 칸 가운데). 없으면 null.
 * 새로고침 복원 자리가 막힌 주머니(링크 안 등)면 바로 바깥으로 옮길 때 쓴다
 */
export function nearestSafeGround(x: number, y: number, maxR = 96): { x: number; y: number } | null {
  reach ??= build();
  const cell = reach.g.cell;
  const n = Math.ceil(maxR / cell);
  const c0 = Math.floor(x / cell);
  const r0 = Math.floor(y / cell);
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (let dy = -n; dy <= n; dy++)
    for (let dx = -n; dx <= n; dx++) {
      const px = (c0 + dx) * cell + cell / 2;
      const py = (r0 + dy) * cell + cell / 2;
      const d = Math.hypot(px - x, py - y);
      if (d > maxR || d >= bd || !safeGround(px, py)) continue;
      bd = d;
      best = { x: px, y: py };
    }
  return best;
}
