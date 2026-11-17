import { DIR, seaKayakWater, seaTubeWater, type DirId } from "@tomb/protocol";
import { rideFacing } from "./seaRideLogic";

// 11/17 사용자 버그 "버려 둔 카약이 선착장으로 돌아갈 때 다리 위를 지나가요" → 빈 놀거리(카약·튜브)는 물 위로만 길을 찾아 돌아가요.
// 예전엔 내린 자리에서 매어 둔 자리까지 곧게 미끄러져서 선착장·방파제·모래를 가로질렀어요.
//  - 곧은 길이 모두 물이면 그대로, 아니면 8px 칸 A* (8방향)로 물 칸만 이어 찾고, 보이는 칸끼리 이어 줄여요 (꺾임이 적게)
//  - 길이 없거나 너무 멀면 (MAX_PATH) 그 자리에서 물결과 함께 서서히 사라졌다가 매어 둔 자리에 서서히 나타나요
//  - 같은 입력(내린 자리·물 높이)이면 늘 같은 길이에요 → 다른 사람 화면에서도 같은 길로 돌아가요 (서버는 빈 놀거리 자리를 모르고, 좌석이 비는 순간만 알려요)
// 순수 함수라 Phaser 없이 시험해요 (seaRideReturn.test).

export type Pt = { x: number; y: number };
export type ReturnPlan =
  | { kind: "path"; pts: Pt[]; cum: number[]; len: number; dur: number }
  | { kind: "fade"; dur: number };
export type ReturnPose = { x: number; y: number; alpha: number; dir: DirId | null; done: boolean; at: "from" | "to" | "path" };

/** 길 찾는 칸 크기 (px) */
export const RETURN_CELL = 8;
/** 이보다 긴 길이면 물결에 사라졌다 나타나요 (px) */
export const RETURN_MAX_PATH = 900;
/** 돌아가는 빠르기 (px/s) · 가장 짧은·긴 시간 */
export const RETURN_SPEED = 24;
const RETURN_MIN_MS = 3_000;
const RETURN_MAX_MS = 40_000;
/** 사라지기·나타나기 (ms) · 그 사이 비어 있는 때 */
export const RETURN_FADE_MS = 1_400;
export const RETURN_GAP_MS = 600;
/** 내린 자리(모래·데크 옆)에서 가장 가까운 물 칸을 찾는 거리 · 매어 둔 자리 둘레 */
const SNAP_PX = 40;
/** A* 칸을 너무 많이 열면 그만 (맵 전체 220×120 = 26,400 칸) */
const MAX_OPEN = 30_000;

/** 놀거리 몸이 데크·바위에 닿지 않을 만큼 넉넉한 물 (가운데 + 앞뒤·위아래) */
export function kayakReturnWater(level: number): (x: number, y: number) => boolean {
  return (x, y) => seaKayakWater(x, y, level) && seaKayakWater(x - 13, y, level) && seaKayakWater(x + 13, y, level) && seaKayakWater(x, y - 5, level) && seaKayakWater(x, y + 5, level);
}
export function tubeReturnWater(level: number): (x: number, y: number) => boolean {
  return (x, y) => seaTubeWater(x, y, level) && seaTubeWater(x - 6, y, level) && seaTubeWater(x + 6, y, level);
}

/** a → b 곧은 줄이 모두 물인지 (step px마다) */
export function clearLine(a: Pt, b: Pt, water: (x: number, y: number) => boolean, step = 4): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 0; i <= n; i++) if (!water(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  return true;
}

function finish(pts: Pt[]): ReturnPlan {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const len = cum[cum.length - 1];
  if (len > RETURN_MAX_PATH) return { kind: "fade", dur: RETURN_FADE_MS * 2 + RETURN_GAP_MS };
  const dur = Math.min(RETURN_MAX_MS, Math.max(RETURN_MIN_MS, (len / RETURN_SPEED) * 1000));
  return { kind: "path", pts, cum, len, dur };
}

/**
 * 빈 놀거리가 from(내린 자리)에서 to(매어 둔 자리·떠다니는 길 가운데)로 돌아가는 길.
 * water = 놀거리가 뜰 수 있는 물 (kayakReturnWater·tubeReturnWater), W·H = 맵 크기
 */
export function planRideReturn(from: Pt, to: Pt, water: (x: number, y: number) => boolean, W: number, H: number): ReturnPlan {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return finish([from, to]);
  if (water(from.x, from.y) && clearLine(from, to, water)) return finish([from, to]);
  const C = RETURN_CELL;
  const cols = Math.ceil(W / C);
  const rows = Math.ceil(H / C);
  const cache = new Int8Array(cols * rows); // 0 = 모름, 1 = 물, 2 = 막힘
  const ok = (i: number): boolean => {
    if (cache[i] === 0) cache[i] = water((i % cols) * C + C / 2, Math.floor(i / cols) * C + C / 2) ? 1 : 2;
    return cache[i] === 1;
  };
  const center = (i: number): Pt => ({ x: (i % cols) * C + C / 2, y: Math.floor(i / cols) * C + C / 2 });
  const cellOf = (p: Pt) => Math.max(0, Math.min(rows - 1, Math.floor(p.y / C))) * cols + Math.max(0, Math.min(cols - 1, Math.floor(p.x / C)));
  /** p에서 가장 가까운 물 칸 (곧게 닿을 수 있는 것 — 데크 너머를 고르지 않게) */
  const snap = (p: Pt): number => {
    const c0 = cellOf(p);
    if (ok(c0)) return c0;
    const R = Math.ceil(SNAP_PX / C);
    let best = -1;
    let bd = Infinity;
    const cx = c0 % cols;
    const cy = Math.floor(c0 / cols);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const i = y * cols + x;
        const q = center(i);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d > SNAP_PX || d >= bd || !ok(i)) continue;
        best = i;
        bd = d;
      }
    return best;
  };
  const s = snap(from);
  const g = snap(to);
  if (s < 0 || g < 0) return { kind: "fade", dur: RETURN_FADE_MS * 2 + RETURN_GAP_MS };
  // A* (8방향, 대각선은 양옆 칸이 모두 물일 때만 — 모서리를 깎아 데크를 스치지 않게)
  const gc = center(g);
  const h = (i: number) => {
    const q = center(i);
    const dx = Math.abs(q.x - gc.x);
    const dy = Math.abs(q.y - gc.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  // 작은 이진 힙 (f, 칸 번호 — 같은 f면 칸 번호가 작은 쪽: 어느 화면에서나 같은 길)
  const heap: [number, number][] = [];
  const less = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (e: [number, number]) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };
  gScore[s] = 0;
  push([h(s), s]);
  let opened = 0;
  let found = false;
  while (heap.length && opened < MAX_OPEN) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    opened++;
    if (cur === g) {
      found = true;
      break;
    }
    // 너무 먼 길은 더 찾지 않아요 (어차피 사라졌다 나타나요)
    if (gScore[cur] > RETURN_MAX_PATH) break;
    const x = cur % cols;
    const y = Math.floor(cur / cols);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (closed[n] || !ok(n)) continue;
        if (dx && dy && (!ok(y * cols + nx) || !ok(ny * cols + x))) continue;
        const t = gScore[cur] + (dx && dy ? Math.SQRT2 : 1) * C;
        if (t >= gScore[n]) continue;
        gScore[n] = t;
        came[n] = cur;
        push([t + h(n), n]);
      }
  }
  if (!found) return { kind: "fade", dur: RETURN_FADE_MS * 2 + RETURN_GAP_MS };
  const cells: Pt[] = [];
  for (let i = g; i !== -1; i = came[i]) cells.push(center(i));
  cells.reverse();
  // 내린 자리 → 칸 길 → 매어 둔 자리. 보이는 점끼리 이어 꺾임을 줄여요 (줄이 물 밖으로 나가지 않게)
  const raw: Pt[] = [from, ...cells, to];
  const pts: Pt[] = [raw[0]];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    // 첫 점(내린 자리)·끝 점(매어 둔 자리)은 물 밖일 수 있어요 → 바로 옆 칸까지만 곧게
    while (j > i + 1 && !(water(raw[i].x, raw[i].y) && water(raw[j].x, raw[j].y) && clearLine(raw[i], raw[j], water))) j--;
    pts.push(raw[j]);
    i = j;
  }
  return finish(pts);
}

const smooth = (k: number) => k * k * (3 - 2 * k);

/** 이 거리 안으로 들어오면 떠다니는 길의 흐름을 섞기 시작해요 (그 전엔 찾은 길 그대로 — 데크 옆을 지날 때 흐름에 밀려 걸치지 않게) */
const BLEND_PX = 60;
/** 튜브: 떠다니는 길의 흐름을 얼마나 섞을지 (0 = 찾은 길 그대로, 1 = 떠다니는 길). 길 끝 가까이에서만 섞여 끝에서 이어져요 */
export function returnBlend(plan: ReturnPlan, t: number): number {
  if (plan.kind === "fade") return t < RETURN_FADE_MS ? 0 : 1;
  const left = plan.len * (1 - smooth(Math.min(1, Math.max(0, t / plan.dur))));
  return smooth(Math.min(1, Math.max(0, 1 - left / BLEND_PX)));
}

/** 돌아가기 시작한 지 t ms 뒤 자리·보이는 정도·방향 (dir null = 그대로) */
export function returnPoseAt(plan: ReturnPlan, from: Pt, to: Pt, t: number, prevDir: DirId = DIR.right): ReturnPose {
  if (plan.kind === "fade") {
    const F = RETURN_FADE_MS;
    if (t < F) return { x: from.x, y: from.y, alpha: 1 - smooth(Math.max(0, t) / F), dir: null, done: false, at: "from" };
    if (t < F + RETURN_GAP_MS) return { x: to.x, y: to.y, alpha: 0, dir: DIR.right, done: false, at: "to" };
    const k = Math.min(1, (t - F - RETURN_GAP_MS) / F);
    return { x: to.x, y: to.y, alpha: smooth(k), dir: DIR.right, done: k >= 1, at: "to" };
  }
  const k = smooth(Math.min(1, Math.max(0, t / plan.dur)));
  const d = k * plan.len;
  let i = 1;
  while (i < plan.pts.length - 1 && plan.cum[i] < d) i++;
  const a = plan.pts[i - 1];
  const b = plan.pts[i];
  const seg = plan.cum[i] - plan.cum[i - 1];
  const u = seg > 0 ? (d - plan.cum[i - 1]) / seg : 1;
  const x = a.x + (b.x - a.x) * u;
  const y = a.y + (b.y - a.y) * u;
  const dir = seg > 0 ? rideFacing((b.x - a.x) * 10, (b.y - a.y) * 10, prevDir) : prevDir;
  return { x, y, alpha: 1, dir, done: k >= 1, at: "path" };
}
