// 11/19 첫 걸음 길 안내(RouteGuide)의 순수 계산 — Phaser 없이 테스트한다.
// 길(웨이포인트)을 따라 일정 간격으로 표시(점·작은 화살표)를 놓고, 시간이 지나면 앞으로 흐르게 위상을 민다.

export type Pt = { x: number; y: number };
/** 목적지 후보 (r = 이만큼 다가가면 닿은 것으로 본다) */
export type RouteGoal = { x: number; y: number; r: number };

/** 표시 간격 (월드 px) */
export const ROUTE_SPACING = 9;
/** 표시 몇 개마다 하나는 화살표 (나머지는 점) */
export const ROUTE_ARROW_EVERY = 3;
/** 흐르는 속도 (월드 px/초) */
export const ROUTE_FLOW = 14;
/** 길을 다시 찾는 최소 간격 (ms) */
export const ROUTE_REPATH_MS = 500;
/** 칸 크기 (portalWalk WALK_CELL과 같다 — 칸이 바뀔 때만 다시 찾는다) */
export const ROUTE_CELL = 8;
/** 목적지 후보를 몇 개까지 걸어서 이어 보는지 (가까운 순) */
export const ROUTE_TRY = 3;
/** 내 발밑 근처는 비운다 (캐릭터를 가리지 않게) */
export const ROUTE_SKIP = 10;

/** 가까운 순으로 n개 (같은 거리는 원래 순서) */
export function nearestGoals<T extends Pt>(list: readonly T[], from: Pt, n = ROUTE_TRY): T[] {
  return list
    .map((p, i) => ({ p, i, d: Math.hypot(p.x - from.x, p.y - from.y) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, n)
    .map((e) => e.p);
}

/** 목적지에 닿았는지 */
export const reached = (pos: Pt, goal: RouteGoal): boolean => Math.hypot(goal.x - pos.x, goal.y - pos.y) <= goal.r;

/** 다시 찾을 때인가: 간격이 지났고 칸이 바뀌었을 때만 (force = 목적지가 바뀜) */
export function needRepath(last: { cell: string; at: number } | null, pos: Pt, now: number, force = false): string | null {
  const cell = `${Math.floor(pos.x / ROUTE_CELL)},${Math.floor(pos.y / ROUTE_CELL)}`;
  if (force || !last) return cell;
  if (now - last.at < ROUTE_REPATH_MS || cell === last.cell) return null;
  return cell;
}

/** 길 전체 길이 (시작점 from + 웨이포인트) */
export function pathLength(from: Pt, path: readonly Pt[]): number {
  let len = 0;
  let prev = from;
  for (const p of path) {
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/** 화면 영역 (월드 좌표) */
export type View = { x: number; y: number; width: number; height: number };

/**
 * 길을 따라 표시를 놓는다: from에서 ROUTE_SKIP 뒤부터 spacing 간격, phase(0..spacing×every)만큼 앞으로 민다.
 * visit(x, y, angle, arrow) — angle = 진행 방향(라디안), arrow = 화살표 자리. view 밖(여유 8px)은 건너뛴다.
 * 끝(목적지) 바로 앞 spacing 안은 비운다 (깃발과 겹치지 않게). max개까지. 놓은 수를 돌려준다
 */
export function routeMarks(
  from: Pt,
  path: readonly Pt[],
  phase: number,
  visit: (x: number, y: number, angle: number, arrow: boolean) => void,
  opts: { spacing?: number; every?: number; view?: View | null; max?: number } = {},
): number {
  const sp = opts.spacing ?? ROUTE_SPACING;
  const every = Math.max(1, opts.every ?? ROUTE_ARROW_EVERY);
  const period = sp * every;
  const max = opts.max ?? 400;
  const v = opts.view;
  const total = pathLength(from, path);
  const stop = total - sp;
  const ph = ((phase % period) + period) % period;
  // 첫 표시 거리: ROUTE_SKIP 이상인 (k·sp + ph) 중 가장 작은 것 — k를 세어 화살표 자리를 정한다 (흐르는 동안 무늬가 같이 움직인다)
  let k = Math.ceil((ROUTE_SKIP - ph) / sp);
  let dist = k * sp + ph;
  let seg = 0;
  let segStart = 0;
  let a = from;
  let b = path[0];
  let segLen = b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  let n = 0;
  while (b && dist <= stop && n < max) {
    while (b && dist > segStart + segLen) {
      segStart += segLen;
      seg++;
      a = b;
      b = path[seg];
      segLen = b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    }
    if (!b) break;
    const t = segLen > 0 ? (dist - segStart) / segLen : 0;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (!v || (x >= v.x - 8 && x <= v.x + v.width + 8 && y >= v.y - 8 && y <= v.y + v.height + 8)) {
      visit(x, y, Math.atan2(b.y - a.y, b.x - a.x), (((k % every) + every) % every) === every - 1);
      n++;
    }
    k++;
    dist += sp;
  }
  return n;
}
