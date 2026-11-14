// 귀신의집 미로 (순수 함수 — 테스트한다). 들어갈 때마다 시드가 달라 배치가 조금씩 바뀐다.
//  - 칸(cell) 미로를 "뒤로 돌아가며 파기"로 만든 뒤(모든 칸이 이어진 완전 미로) 막다른 길 몇 개를 터서 고리를 만든다
//    → 귀신을 피해 돌아갈 길이 생긴다. 어떤 시드든 출구까지 늘 이어진다(maze.test.ts).
//  - 타일 격자는 (2W+1)×(2H+1): 짝수 줄·칸은 벽, 홀수는 바닥. 입구는 왼쪽 아래 칸, 출구는 바깥 벽에 낸 문(입구에서 가장 먼 가장자리 칸).
//  - 귀신: 정해진 길을 오가는 "순찰"과 막다른 곳·모퉁이에 숨은 "숨음". 출구로 가는 길 위에도 꼭 몇 마리를 둔다.
//    종류(10가지)는 ghostKinds.ts가 판마다 섞어 붙인다 — 안쪽일수록 무서운 것, 한 판에 같은 종류는 한 번만.

import { assignLooks, type GhostLook } from "./ghostKinds";

export type { GhostLook };

export const HAUNT_TILE = 16;
export type GhostPlan = {
  id: number;
  kind: "patrol" | "lurk";
  look: GhostLook;
  /** 순찰: 오가는 길(타일 좌표, 처음→끝). 숨음: 숨어 있는 타일 하나 */
  path: { tx: number; ty: number }[];
};
export type DecorKind = "candle" | "portrait" | "web" | "chair" | "doll" | "mirror";
export type Decor = { kind: DecorKind; tx: number; ty: number };

export type Maze = {
  seed: number;
  /** 칸 수 */
  w: number;
  h: number;
  /** 타일 수 */
  cols: number;
  rows: number;
  /** 1 = 벽, 0 = 바닥 */
  tiles: Uint8Array;
  start: { tx: number; ty: number };
  /** 출구 문 타일 (바깥 벽에 뚫린 자리) */
  exit: { tx: number; ty: number };
  /** 출구 문 바로 안쪽 바닥 타일 */
  exitIn: { tx: number; ty: number };
  ghosts: GhostPlan[];
  decor: Decor[];
};

/** 시드 난수 (mulberry32) */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export function isWall(m: Pick<Maze, "cols" | "rows" | "tiles">, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= m.cols || ty >= m.rows) return true;
  return m.tiles[ty * m.cols + tx] === 1;
}

/** 바닥 타일 사이 걸음 수 (BFS, 못 가면 -1) */
export function distances(m: Pick<Maze, "cols" | "rows" | "tiles">, from: { tx: number; ty: number }): Int32Array {
  const d = new Int32Array(m.cols * m.rows).fill(-1);
  if (isWall(m, from.tx, from.ty)) return d;
  const q: number[] = [from.ty * m.cols + from.tx];
  d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % m.cols;
    const y = (i - x) / m.cols;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (isWall(m, nx, ny)) continue;
      const j = ny * m.cols + nx;
      if (d[j] >= 0) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  return d;
}

/** 두 바닥 타일 사이 가장 짧은 길 (양 끝 포함, 못 가면 빈 배열) */
export function pathBetween(m: Pick<Maze, "cols" | "rows" | "tiles">, a: { tx: number; ty: number }, b: { tx: number; ty: number }): { tx: number; ty: number }[] {
  const d = distances(m, b);
  if (d[a.ty * m.cols + a.tx] < 0) return [];
  const out = [{ tx: a.tx, ty: a.ty }];
  let cur = a;
  while (cur.tx !== b.tx || cur.ty !== b.ty) {
    const here = d[cur.ty * m.cols + cur.tx];
    let next: { tx: number; ty: number } | null = null;
    for (const [dx, dy] of DIRS) {
      const nx = cur.tx + dx;
      const ny = cur.ty + dy;
      if (!isWall(m, nx, ny) && d[ny * m.cols + nx] === here - 1) {
        next = { tx: nx, ty: ny };
        break;
      }
    }
    if (!next) return [];
    out.push(next);
    cur = next;
  }
  return out;
}

/**
 * 거리표(distances(m, 목표))를 따라 목표 쪽으로 한 칸 (이미 목표거나 못 가면 null).
 * 귀신이 벽을 뚫지 않고 미로 길을 따라 다가오게 한다
 */
export function stepToward(m: Pick<Maze, "cols" | "rows" | "tiles">, field: Int32Array, from: { tx: number; ty: number }): { tx: number; ty: number } | null {
  if (isWall(m, from.tx, from.ty)) return null;
  const here = field[from.ty * m.cols + from.tx];
  if (here <= 0) return null;
  for (const [dx, dy] of DIRS) {
    const nx = from.tx + dx;
    const ny = from.ty + dy;
    if (!isWall(m, nx, ny) && field[ny * m.cols + nx] === here - 1) return { tx: nx, ty: ny };
  }
  return null;
}

const cellTile = (c: number) => c * 2 + 1;

/** 바닥 타일의 열린 이웃 수 (1이면 막다른 곳) */
function openNeighbors(m: Pick<Maze, "cols" | "rows" | "tiles">, tx: number, ty: number): number {
  let n = 0;
  for (const [dx, dy] of DIRS) if (!isWall(m, tx + dx, ty + dy)) n++;
  return n;
}

/** 모퉁이(꺾이는 곳)인지: 열린 이웃이 둘이고 일직선이 아니다 */
function isCorner(m: Pick<Maze, "cols" | "rows" | "tiles">, tx: number, ty: number): boolean {
  if (openNeighbors(m, tx, ty) !== 2) return false;
  const h = !isWall(m, tx - 1, ty) || !isWall(m, tx + 1, ty);
  const v = !isWall(m, tx, ty - 1) || !isWall(m, tx, ty + 1);
  return h && v;
}

export function makeMaze(seed: number): Maze {
  const r = mulberry(seed ^ 0x9e3779b9);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const w = 15 + Math.floor(r() * 3); // 15..17칸
  const h = 11 + Math.floor(r() * 2); // 11..12칸
  const cols = w * 2 + 1;
  const rows = h * 2 + 1;
  const tiles = new Uint8Array(cols * rows).fill(1);
  const m = { cols, rows, tiles };
  const open = (tx: number, ty: number) => (tiles[ty * cols + tx] = 0);

  // 1) 뒤로 돌아가며 파기 (반복문, 깊은 재귀 없이)
  const seen = new Uint8Array(w * h);
  const sx = 0;
  const sy = h - 1;
  const stack: [number, number][] = [[sx, sy]];
  seen[sy * w + sx] = 1;
  open(cellTile(sx), cellTile(sy));
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nb = DIRS.filter(([dx, dy]) => {
      const nx = cx + dx;
      const ny = cy + dy;
      return nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx];
    });
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = pick(nb);
    const nx = cx + dx;
    const ny = cy + dy;
    seen[ny * w + nx] = 1;
    open(cellTile(cx) + dx, cellTile(cy) + dy);
    open(cellTile(nx), cellTile(ny));
    stack.push([nx, ny]);
  }

  // 2) 막다른 길 일부를 터서 고리 만들기 (약 1/4)
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const tx = cellTile(cx);
      const ty = cellTile(cy);
      if (openNeighbors(m, tx, ty) !== 1 || r() > 0.27) continue;
      const walls = DIRS.filter(([dx, dy]) => {
        const nx = cx + dx;
        const ny = cy + dy;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && isWall(m, tx + dx, ty + dy);
      });
      if (walls.length) {
        const [dx, dy] = pick(walls);
        open(tx + dx, ty + dy);
      }
    }
  }

  const start = { tx: cellTile(sx), ty: cellTile(sy) };
  const dStart = distances(m, start);

  // 3) 출구: 오른쪽·위쪽 가장자리 칸 중 입구에서 가장 먼 곳 → 바깥 벽에 문
  let best = { cx: w - 1, cy: 0, d: -1, side: "right" as "right" | "top" };
  for (let cy = 0; cy < h; cy++) {
    const d = dStart[cellTile(cy) * cols + cellTile(w - 1)];
    if (d > best.d) best = { cx: w - 1, cy, d, side: "right" };
  }
  for (let cx = 0; cx < w; cx++) {
    const d = dStart[cellTile(0) * cols + cellTile(cx)];
    if (d > best.d) best = { cx, cy: 0, d, side: "top" };
  }
  const exitIn = { tx: cellTile(best.cx), ty: cellTile(best.cy) };
  const exit = best.side === "right" ? { tx: cols - 1, ty: exitIn.ty } : { tx: exitIn.tx, ty: 0 };
  open(exit.tx, exit.ty);

  // 4) 귀신
  const solution = pathBetween(m, start, exitIn);
  const onSolution = new Set(solution.map((p) => p.ty * cols + p.tx));
  const dExit = distances(m, exitIn);
  const anchors: { tx: number; ty: number }[] = [];
  const farFromOthers = (tx: number, ty: number) => anchors.every((a) => Math.abs(a.tx - tx) + Math.abs(a.ty - ty) >= 8);
  const safe = (tx: number, ty: number) => dStart[ty * cols + tx] >= 10 && dExit[ty * cols + tx] >= 3;
  const ghosts: GhostPlan[] = [];
  // 종류는 다 놓은 뒤에 한꺼번에 붙인다 (4-4)
  const addGhost = (kind: GhostPlan["kind"], path: { tx: number; ty: number }[]) => {
    anchors.push(path[0]);
    ghosts.push({ id: ghosts.length, kind, look: "sobok", path });
  };

  // 4-1) 출구로 가는 길 위 모퉁이에 숨은 귀신 2~3 (꼭 한 번은 마주치게)
  const pathCorners = solution.filter((p) => isCorner(m, p.tx, p.ty) && safe(p.tx, p.ty));
  const wantOnPath = 2 + Math.floor(r() * 2);
  shuffle(pathCorners, r);
  for (const p of pathCorners) {
    if (ghosts.length >= wantOnPath) break;
    if (farFromOthers(p.tx, p.ty)) addGhost("lurk", [p]);
  }

  // 4-2) 막다른 곳에 숨은 귀신 1~2
  const deadEnds: { tx: number; ty: number }[] = [];
  for (let ty = 1; ty < rows; ty += 2)
    for (let tx = 1; tx < cols; tx += 2) if (openNeighbors(m, tx, ty) === 1 && safe(tx, ty) && !onSolution.has(ty * cols + tx)) deadEnds.push({ tx, ty });
  shuffle(deadEnds, r);
  const wantLurk = ghosts.length + 1 + Math.floor(r() * 2);
  for (const p of deadEnds) {
    if (ghosts.length >= wantLurk) break;
    if (farFromOthers(p.tx, p.ty)) addGhost("lurk", [p]);
  }

  // 4-3) 정해진 길을 오가는 순찰 귀신 3: 바닥 칸 하나에서 6~10걸음(칸 기준 3~5칸) 떨어진 칸까지
  const floorCells: { tx: number; ty: number }[] = [];
  for (let ty = 1; ty < rows; ty += 2) for (let tx = 1; tx < cols; tx += 2) if (safe(tx, ty)) floorCells.push({ tx, ty });
  shuffle(floorCells, r);
  let patrols = 0;
  for (const a of floorCells) {
    if (patrols >= 3) break;
    if (!farFromOthers(a.tx, a.ty)) continue;
    const d = distances(m, a);
    const ends = floorCells.filter((b) => {
      const k = d[b.ty * cols + b.tx];
      return k >= 6 && k <= 10 && safe(b.tx, b.ty);
    });
    if (!ends.length) continue;
    const path = pathBetween(m, a, pick(ends));
    if (path.some((p) => !safe(p.tx, p.ty))) continue;
    addGhost("patrol", path);
    patrols++;
  }

  // 4-4) 종류: 입구에서 멀수록 무서운 것, 판마다 무작위
  const looks = assignLooks(
    ghosts.map((g) => g.kind),
    ghosts.map((g) => dStart[g.path[0].ty * cols + g.path[0].tx]),
    r,
  );
  ghosts.forEach((g, i) => (g.look = looks[i]));

  // 5) 장식: 촛대·초상화·거미줄·쓰러진 의자·인형·깨진 거울 (바닥 타일 / 벽 아래쪽 면)
  const decor: Decor[] = [];
  const used = new Set<number>();
  const keepClear = (tx: number, ty: number) => (tx === start.tx && ty === start.ty) || (tx === exitIn.tx && ty === exitIn.ty);
  for (let ty = 1; ty < rows - 1; ty++) {
    for (let tx = 1; tx < cols - 1; tx++) {
      const i = ty * cols + tx;
      if (used.has(i) || keepClear(tx, ty)) continue;
      if (isWall(m, tx, ty)) {
        // 아래가 바닥인 벽 = 앞면이 보이는 벽 → 초상화·거울
        if (!isWall(m, tx, ty + 1) && r() < 0.07) {
          decor.push({ kind: r() < 0.7 ? "portrait" : "mirror", tx, ty });
          used.add(i);
        }
        continue;
      }
      const u = r();
      if (isCorner(m, tx, ty) && u < 0.35) decor.push({ kind: "web", tx, ty });
      else if (openNeighbors(m, tx, ty) === 1 && u < 0.4) decor.push({ kind: r() < 0.5 ? "doll" : "chair", tx, ty });
      else if (u < 0.045) decor.push({ kind: "candle", tx, ty });
      else continue;
      used.add(i);
    }
  }

  return { seed, w, h, cols, rows, tiles, start, exit, exitIn, ghosts, decor };
}

function shuffle<T>(a: T[], r: () => number): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/** 두 타일 사이가 직선으로 트였는지 (같은 줄·같은 칸에서만, 사이에 벽이 없으면) */
export function clearLine(m: Pick<Maze, "cols" | "rows" | "tiles">, a: { tx: number; ty: number }, b: { tx: number; ty: number }): boolean {
  if (a.tx === b.tx) {
    const [y0, y1] = a.ty < b.ty ? [a.ty, b.ty] : [b.ty, a.ty];
    for (let y = y0; y <= y1; y++) if (isWall(m, a.tx, y)) return false;
    return true;
  }
  if (a.ty === b.ty) {
    const [x0, x1] = a.tx < b.tx ? [a.tx, b.tx] : [b.tx, a.tx];
    for (let x = x0; x <= x1; x++) if (isWall(m, x, a.ty)) return false;
    return true;
  }
  return false;
}

// ── 깜짝 놀래키기 연출 일정 (광과민성 안전: 번쩍임·얼굴 깜빡임은 1초에 3번 이하) ──

export type ScareStep = { at: number; kind: "dark" | "faceIn" | "faceOut" | "red" | "shake" | "scream" | "thud" | "release" };

/** 먼저 화면이 새까매졌다가(숨 멎는 틈) 튀어나오는 귀신과 그 틈 (ms) — 빛 밖의 그림자·눈 깜빡임 마네킹 */
const PRE_DARK_MS: Partial<Record<GhostLook, number>> = { shadow: 280, mannequin: 320 };

/**
 * 놀래키기 한 번의 일정 (ms). look = 귀신 종류, level 0..1 = 이번 판에서 얼마나 놀랐는지(많이 놀랄수록 세진다).
 * reduced = 움직임 줄이기: 커지기·흔들림·번쩍임 없이 천천히 나타났다 사라지기만
 */
export function scareSchedule(reduced: boolean, look: GhostLook = "sobok", level = 0): ScareStep[] {
  const pre = PRE_DARK_MS[look] ?? 0;
  if (reduced) {
    const out: ScareStep[] = [
      { at: pre, kind: "scream" },
      { at: pre, kind: "faceIn" },
      { at: pre + 1000, kind: "faceOut" },
      { at: pre + 1100, kind: "release" },
    ];
    if (pre) out.unshift({ at: 0, kind: "dark" });
    return out;
  }
  // 얼굴 2~3번 (380ms 간격 ≈ 2.6번/초), 붉은 번쩍임 2번 (760ms 간격)
  const pulses = level >= 0.25 ? 3 : 2;
  const out: ScareStep[] = [
    { at: pre, kind: "scream" },
    { at: pre, kind: "thud" },
    { at: pre, kind: "shake" },
    { at: pre, kind: "red" },
    { at: pre + 760, kind: "red" },
  ];
  if (pre) out.push({ at: 0, kind: "dark" });
  for (let i = 0; i < pulses; i++) {
    out.push({ at: pre + i * 380, kind: "faceIn" });
    out.push({ at: pre + i * 380 + 230, kind: "faceOut" });
  }
  out.push({ at: pre + 1000 + Math.round(clamp01(level) * 200), kind: "release" });
  return out.sort((a, b) => a.at - b.at);
}

/** 얼굴이 커지는 데 걸리는 시간·사라지는 데 걸리는 시간 (ms) */
export const SCARE_FACE_IN_MS = 90;
export const SCARE_FACE_OUT_MS = 120;
/** 같은 귀신이 다시 놀래킬 때까지 쉬는 시간 (ms) */
export const GHOST_REST_MS = 9000;
/** 어떤 귀신이든 연달아 놀래키지 않는 간격 (ms) */
export const SCARE_GAP_MS = 2500;

/**
 * 심장 박동 간격 (ms): 귀신이나 출구가 가까울수록 빨라진다.
 * ghostPx·exitPx = 가장 가까운 귀신·출구까지의 거리(월드 px)
 */
export function heartbeatMs(ghostPx: number, exitPx: number): number {
  const g = 1 - clamp01((ghostPx - 24) / 150);
  const e = 1 - clamp01((exitPx - 24) / 220);
  const k = Math.max(g, e * 0.8);
  return Math.round(1150 - 720 * k);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 시간 표시 (분:초.한자리) */
export function formatHauntTime(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 100));
  const m = Math.floor(t / 600);
  const s = Math.floor((t % 600) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${t % 10}`;
}
