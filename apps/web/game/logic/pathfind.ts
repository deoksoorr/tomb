// 길찾기 (41번: 내 묘비까지 걸어가기). 맵 배치와 무관한 작은 인터페이스만 쓴다 —
// 게임이 지금 있는 충돌체(사각형)로 격자를 만들어 넘기면 8방향 A*로 길을 찾고, 시야가 트인 구간은 곧게 편다.
// 순수 함수라 테스트한다 (Phaser 없음).

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** 걷기 격자: cell 픽셀 칸, (cx, cy) 칸이 막혔는지. 격자 밖은 막힌 것으로 본다 */
export type WalkGrid = {
  cols: number;
  rows: number;
  cell: number;
  /** 격자 왼쪽 위 월드 좌표 */
  ox: number;
  oy: number;
  blocked(cx: number, cy: number): boolean;
};

/** 사각형을 이만큼 넓혀서 막는다 (발 상자 크기만큼: 점 하나로 판정해도 몸이 끼지 않게) */
export type Pad = { l: number; r: number; t: number; b: number };

export type GridOptions = {
  pad?: Pad;
  /** 그 밖에 막을 곳 (물 등). 칸 가운데 월드 좌표로 묻는다 */
  extraBlocked?: (wx: number, wy: number) => boolean;
  /** 격자 영역 (기본: 0,0 ~ width,height) */
  ox?: number;
  oy?: number;
};

/** 칸 가운데가 (넓힌) 사각형 안이거나 extraBlocked면 막힌 칸 */
export function buildGrid(width: number, height: number, cell: number, rects: readonly Rect[], opts: GridOptions = {}): WalkGrid {
  const ox = opts.ox ?? 0;
  const oy = opts.oy ?? 0;
  const cols = Math.max(1, Math.ceil(width / cell));
  const rows = Math.max(1, Math.ceil(height / cell));
  const cells = new Uint8Array(cols * rows);
  const p = opts.pad ?? { l: 0, r: 0, t: 0, b: 0 };
  for (const r of rects) {
    const x0 = r.x - p.l;
    const x1 = r.x + r.w + p.r;
    const y0 = r.y - p.t;
    const y1 = r.y + r.h + p.b;
    // 가운데가 [x0, x1]·[y0, y1] 안인 칸: cx*cell + cell/2 + ox ∈ [x0, x1]
    const c0 = Math.max(0, Math.ceil((x0 - ox - cell / 2) / cell));
    const c1 = Math.min(cols - 1, Math.floor((x1 - ox - cell / 2) / cell));
    const r0 = Math.max(0, Math.ceil((y0 - oy - cell / 2) / cell));
    const r1 = Math.min(rows - 1, Math.floor((y1 - oy - cell / 2) / cell));
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) cells[cy * cols + cx] = 1;
  }
  if (opts.extraBlocked) {
    for (let cy = 0; cy < rows; cy++)
      for (let cx = 0; cx < cols; cx++) {
        const i = cy * cols + cx;
        if (!cells[i] && opts.extraBlocked(ox + cx * cell + cell / 2, oy + cy * cell + cell / 2)) cells[i] = 1;
      }
  }
  return {
    cols,
    rows,
    cell,
    ox,
    oy,
    blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= cols || cy >= rows || cells[cy * cols + cx] === 1,
  };
}

const cellOf = (g: WalkGrid, v: number, o: number) => Math.floor((v - o) / g.cell);
const centerX = (g: WalkGrid, cx: number) => g.ox + cx * g.cell + g.cell / 2;
const centerY = (g: WalkGrid, cy: number) => g.oy + cy * g.cell + g.cell / 2;

/** (cx, cy)에서 가장 가까운 빈 칸 (반경 maxR칸 안, 없으면 null) */
export function nearestOpen(g: WalkGrid, cx: number, cy: number, maxR = 6): [number, number] | null {
  if (!g.blocked(cx, cy)) return [cx, cy];
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || g.blocked(cx + dx, cy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [cx + dx, cy + dy];
        }
      }
    if (best) return best;
  }
  return null;
}

/** 최소 힙 (f값 기준, 노드 번호를 담는다) */
class Heap {
  private items: number[] = [];
  constructor(private readonly f: Float64Array) {}
  get size(): number {
    return this.items.length;
  }
  push(n: number): void {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export type PathOptions = {
  /** 펼쳐 볼 칸 수 상한 (넘으면 null) */
  maxNodes?: number;
  /** 시작·도착이 막힌 칸이면 이 반경 안의 가장 가까운 빈 칸으로 */
  snapRadius?: number;
  /** 시야가 트인 구간을 곧게 편다 (기본 true) */
  smooth?: boolean;
};

/**
 * 8방향 A* (대각선은 양옆 두 칸이 모두 비어야 — 모서리를 깎지 않는다).
 * 돌려주는 경로는 월드 좌표 웨이포인트 (시작점은 빼고, 마지막은 정확히 to — 도착 칸이 막혀 옮겼으면 옮긴 칸 가운데).
 * 길이 없으면 null.
 */
export function findPath(g: WalkGrid, from: Pt, to: Pt, opts: PathOptions = {}): Pt[] | null {
  const snap = opts.snapRadius ?? 6;
  const s = nearestOpen(g, cellOf(g, from.x, g.ox), cellOf(g, from.y, g.oy), snap);
  const goalCell = [cellOf(g, to.x, g.ox), cellOf(g, to.y, g.oy)] as const;
  const e = nearestOpen(g, goalCell[0], goalCell[1], snap);
  if (!s || !e) return null;
  const goalMoved = e[0] !== goalCell[0] || e[1] !== goalCell[1];
  const end: Pt = goalMoved ? { x: centerX(g, e[0]), y: centerY(g, e[1]) } : { x: to.x, y: to.y };
  const { cols, rows } = g;
  const total = cols * rows;
  const start = s[1] * cols + s[0];
  const goal = e[1] * cols + e[0];
  if (start === goal) return [end];

  const gScore = new Float64Array(total).fill(Infinity);
  const fScore = new Float64Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const heap = new Heap(fScore);
  const h = (n: number) => {
    const dx = Math.abs((n % cols) - e[0]);
    const dy = Math.abs(Math.floor(n / cols) - e[1]);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  gScore[start] = 0;
  fScore[start] = h(start);
  heap.push(start);
  const maxNodes = opts.maxNodes ?? 80_000;
  let expanded = 0;
  let found = false;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goal) {
      found = true;
      break;
    }
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (g.blocked(nx, ny)) continue;
      if (dx && dy && (g.blocked(cx + dx, cy) || g.blocked(cx, cy + dy))) continue;
      const n = ny * cols + nx;
      if (closed[n]) continue;
      const t = gScore[cur] + cost;
      if (t >= gScore[n]) continue;
      came[n] = cur;
      gScore[n] = t;
      fScore[n] = t + h(n);
      heap.push(n);
    }
  }
  if (!found || rows === 0) return null;

  const cellsPath: Pt[] = [];
  for (let n = goal; n !== -1 && n !== start; n = came[n]) cellsPath.push({ x: centerX(g, n % cols), y: centerY(g, Math.floor(n / cols)) });
  cellsPath.reverse();
  cellsPath[cellsPath.length - 1] = end;
  return opts.smooth === false ? cellsPath : smoothPath(g, from, cellsPath);
}

/** a→b 직선이 막힌 칸을 지나지 않는지 (칸 크기의 1/4 간격으로 표본) */
export function lineOfSight(g: WalkGrid, a: Pt, b: Pt): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len / (g.cell / 4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (g.blocked(cellOf(g, x, g.ox), cellOf(g, y, g.oy))) return false;
  }
  return true;
}

/** 줄 당기기: 지금 점에서 곧게 갈 수 있는 가장 먼 웨이포인트로 건너뛴다 (마지막 점은 늘 남긴다) */
export function smoothPath(g: WalkGrid, from: Pt, path: readonly Pt[]): Pt[] {
  if (path.length <= 1) return [...path];
  const out: Pt[] = [];
  let anchor = from;
  let i = 0;
  while (i < path.length) {
    let j = path.length - 1;
    while (j > i && !lineOfSight(g, anchor, path[j])) j--;
    out.push(path[j]);
    anchor = path[j];
    i = j + 1;
  }
  return out;
}

/** 웨이포인트를 따라 남은 길이 (지금 위치 → idx → … → 끝) */
export function remainingLength(pos: Pt, path: readonly Pt[], idx: number): number {
  let len = 0;
  let prev = pos;
  for (let i = idx; i < path.length; i++) {
    len += Math.hypot(path[i].x - prev.x, path[i].y - prev.y);
    prev = path[i];
  }
  return len;
}
