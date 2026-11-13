import { DIR, hashUnit, MAP_HEIGHT, MAP_WIDTH, RIVER_HALF_W, RIVER_PATH, riverYAt, SEATS, type DirId, type Seat } from "@tomb/protocol";
import { faceToward } from "../../logic/movement";
import { findPath, type Pt, type WalkGrid } from "../../logic/pathfind";
import type { EmoteIcon } from "../../sprites/emotes";
import { ELLIPSES, inWater, inWaterBody, onDeck, onStone } from "../layout";
import { critterGrid, restSpots, seatFront, type CritterDef, type RestSpot } from "./critterSim";
import { RESIDENTS, type ResidentDef, type ResidentTaste } from "./residentData";

// 돌아다니는 마을 주민 — 결정적 시뮬레이션 (순수, Phaser 없음 → residents.test.ts).
// 고양이·유령(critterSim)과 같은 방식: 채널 번호 = 시드, 서버 시계 = 시각 → 같은 채널의 모두가 같은 자리에서 같은 주민을 본다.
// 서버는 아무것도 모른다 (접속자 수·채널 인원·순위·신고·주변 사람 목록에 들어가지 않는다).
//
// 사용자 요청 "다 너무 앉아 있다. 돌아다니는 걸 위주로, 앉는 건 살짝만. 수영도 하게":
// 하루 = 같은 길이(legMs)의 구간이 이어진 것. 구간 k는 자리 S(k)에서 S(k+1)까지 "구간의 대부분을 써서" 걷고(약 80%),
// 끝에 잠깐 쉰다 — 앉기(6~15초, 전체 15% 안팎) 또는 서서 두리번(1.5~4.5초). 길이 짧으면 마을 다른 곳(다른 주민의 쉼 자리)을 들러 간다.
// 가끔 달리고, 가끔 물가(강·호수·연못)로 가 물에 들어가 잠시 헤엄치다 나온다 (모습은 사람 수영 그대로: state "swim").
// 구간 하나만 계산하면 되므로(과거를 다시 돌리지 않는다) 어느 시각을 물어도 모두 같은 자리다.
// 걷는 길은 critterGrid(담·절벽·소품·가구·집·물을 피하는 격자). 벤치·그루터기에는 "보기에만" 앉는다 (서버 좌석을 잡지 않는다).

/** 고양이 시뮬레이터 번호와 겹치지 않게 (시드 = 채널 + 주민 번호 + 시간) */
export const RESIDENT_INDEX_BASE = 100;
/** 좌석 앞에 도착해 자리로 옮겨 앉는 데 걸리는 시간 */
export const SIT_DELAY_MS = 500;
/** 사람이 앉은 자리 앞에서 비켜 서는 거리 */
const SIDESTEP = 13;
/** 이 빠르기(주민 걸음의 배수)를 넘으면 달린다 */
const RUN_AT = 1.35;
/** 걷기 빠르기 범위 (주민 걸음의 배수) — 길이 길면 빨리(달리기), 짧으면 천천히 */
const PACE_MIN = 0.8;
const PACE_MAX = 2;
/** 헤엄 빠르기 범위 (px/s) */
const SWIM_V_MIN = 9;
const SWIM_V_MAX = 24;
/** 마을 다른 곳까지 가는 거리 (사는 동네 중심에서) */
const ROAM_R = 520;

/** 성향별 비율 — 모두 걷는 비중이 크고(약 75~85%), 앉기·수영·달리기만 조금씩 다르다 */
const TASTES: Record<ResidentTaste, { sit: number; swim: number; run: number; sitMs: [number, number]; roam: number }> = {
  walk: { sit: 0.46, swim: 0.06, run: 0.14, sitMs: [7_000, 15_000], roam: 0.6 },
  swim: { sit: 0.4, swim: 0.3, run: 0.1, sitMs: [6_000, 14_000], roam: 0.45 },
  fire: { sit: 0.62, swim: 0.04, run: 0.06, sitMs: [9_000, 15_000], roam: 0.4 },
};
/** 서서 두리번거리는 시간 */
const IDLE_MS: [number, number] = [1_500, 4_500];
/** 물에 들어가 있는 시간 */
const SWIM_MS: [number, number] = [8_000, 16_000];
/** 달리는 구간의 목표 빠르기 (걸음의 배수) */
const RUN_PACE = 1.7;

export type ResidentState = "idle" | "walk" | "run" | "sitChair" | "sitGround" | "swim";

export type ResidentPose = {
  x: number;
  y: number;
  state: ResidentState;
  dir: DirId;
  /** 앉아 있는 좌석 (보기에만) */
  seat: Seat | null;
  /** 구간 번호 */
  leg: number;
  /** 쉬기 시작한 뒤 경과 ms (걷는·헤엄치는 중이면 0) */
  restMs: number;
};

export function blankResidentPose(): ResidentPose {
  return {
    x: 0,
    y: 0,
    state: "idle",
    dir: DIR.down,
    seat: null,
    leg: 0,
    restMs: 0,
  };
}

/** 주민 정의 → 고양이 쉼 자리 규칙(restSpots)에 넘기는 정의 */
export function residentCritterDef(r: ResidentDef): CritterDef {
  return {
    id: r.id,
    kind: "cat",
    name: r.name,
    variant: 0,
    home: r.home,
    perches: r.perches,
    grass: r.grass,
    legMs: r.legMs,
    speed: r.speed,
  };
}

/**
 * 주민의 쉼 자리: 앉는 좌석마다 "그 앞에 서는 자리"를 바라보는 쪽(없으면 아래쪽)으로 10~24px 안에서 찾고,
 * 길가·풀밭 자리는 고양이와 같은 규칙(restSpots). 결정적이라 모든 클라이언트가 같은 목록을 얻는다
 */
export function residentSpots(def: ResidentDef, g: WalkGrid = critterGrid()): RestSpot[] {
  const out: RestSpot[] = [];
  for (const fid of def.perches) {
    for (const s of SEATS) {
      if (s.furnitureId !== fid) continue;
      const hit = seatFront(g, s);
      if (hit) out.push({ x: hit.x, y: hit.y, perch: s });
    }
  }
  for (const sp of restSpots(residentCritterDef({ ...def, perches: [] }), g)) if (!out.some((o) => Math.hypot(o.x - sp.x, o.y - sp.y) < 20)) out.push(sp);
  return out;
}

/** 마을 곳곳의 들를 자리 = 모든 주민의 쉼 자리 (격자마다 한 번만 만든다) */
const poolCache = new WeakMap<WalkGrid, RestSpot[]>();
function villagePool(g: WalkGrid): RestSpot[] {
  let p = poolCache.get(g);
  if (!p) {
    p = RESIDENTS.flatMap((r) => residentSpots(r, g));
    poolCache.set(g, p);
  }
  return p;
}

// ── 수영 자리 ──
/** 물가 자리(뭍)와 물속 고리 (입수 점 → 물속 점들 → 입수 점) */
export type SwimSite = { shore: Pt; loop: Pt[] };

/** a→b 직선이 모두 물속인지 (판자·징검다리 밑은 피한다) */
function lineInWater(a: Pt, b: Pt): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
  for (let i = 0; i <= n; i++) if (!inWater(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
  return true;
}

/** 뭍(shore)에서 입수 점까지: 걸을 수 있는 칸이거나 물가이고, 판자·징검다리는 지나지 않는다 */
function wadeOk(g: WalkGrid, a: Pt, b: Pt): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3));
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n;
    const y = a.y + ((b.y - a.y) * i) / n;
    if (onDeck(x, y) || onStone(x, y)) return false;
    if (g.blocked(Math.floor(x / g.cell), Math.floor(y / g.cell)) && !inWaterBody(x, y, 6)) return false;
  }
  return true;
}

function shoreOk(g: WalkGrid, x: number, y: number): boolean {
  if (x < 40 || y < 48 || x > MAP_WIDTH - 40 || y > MAP_HEIGHT - 24) return false;
  return !inWater(x, y) && !g.blocked(Math.floor(x / g.cell), Math.floor(y / g.cell));
}

function trySite(g: WalkGrid, shores: Pt[], entry: Pt, inner: Pt[]): SwimSite | null {
  const shore = shores.find((s) => shoreOk(g, s.x, s.y));
  if (!shore || !inWater(entry.x, entry.y) || !wadeOk(g, shore, entry)) return null;
  const loop = [entry, ...inner, entry];
  for (let i = 1; i < loop.length; i++) if (!lineInWater(loop[i - 1], loop[i])) return null;
  return { shore, loop };
}

const siteCache = new WeakMap<WalkGrid, SwimSite[]>();
/** 강·호수·연못의 수영 자리 목록 (결정적: 같은 맵이면 모든 클라이언트가 같은 목록) */
export function swimSites(g: WalkGrid = critterGrid()): SwimSite[] {
  const hit = siteCache.get(g);
  if (hit) return hit;
  const out: SwimSite[] = [];
  const R = (n: number) => Math.round(n);
  // 호수·연못(타원): 둘레를 돌며 물가 → 입수 → 안쪽 두 점 → 입수
  for (const e of ELLIPSES) {
    const n = e.rx > 100 ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const at = (s: number, da = 0, grow = 0) => ({ x: R(e.x + (e.rx + grow) * s * Math.cos(a + da)), y: R(e.y + (e.ry + grow) * s * Math.sin(a + da)) });
      const shores: Pt[] = [];
      for (let gap = 4; gap <= 22; gap += 2) shores.push(at(1, 0, gap));
      const s = trySite(g, shores, at(1, 0, -8), [at(0.55, 0.7), at(0.5, -0.6)]);
      if (s) out.push(s);
    }
  }
  // 강: 둑 양쪽에서 들어가 물길을 따라 조금 오갔다 나온다
  const x0 = RIVER_PATH[0].x + 40;
  const x1 = RIVER_PATH[RIVER_PATH.length - 1].x - 40;
  for (let x = x0; x <= x1; x += 72) {
    for (const side of [-1, 1]) {
      const y = riverYAt(x);
      const shores: Pt[] = [];
      for (let gap = 4; gap <= 20; gap += 2) shores.push({ x, y: R(y + side * (RIVER_HALF_W + gap)) });
      const s = trySite(g, shores, { x, y: R(y + side * (RIVER_HALF_W - 8)) }, [
        { x: x + 30, y: R(riverYAt(x + 30) + side * 4) },
        { x: x - 26, y: R(riverYAt(x - 26) - side * 3) },
      ]);
      if (s) out.push(s);
    }
  }
  siteCache.set(g, out);
  return out;
}

// ── 구간 계획 ──
type Seg = { swim: boolean; run: boolean; t0: number; dur: number; path: Pt[]; lens: number[]; total: number };
type Leg = {
  k: number;
  start: number;
  segs: Seg[];
  /** 걷기·헤엄이 끝나 쉬기 시작하는 때 (구간 시작부터 ms) */
  restAt: number;
  /** 앉기 시작하는 때 (앉는 구간만, 아니면 Infinity) — 앉는 시간이 늘어지지 않게 구간 끝에서 거꾸로 잰다 */
  sitAt: number;
  to: RestSpot;
  /** 쉬기 시작할 때 바라보는 쪽 (마지막으로 걸어온 방향) */
  face: DirId;
};

function measure(path: Pt[]): { lens: number[]; total: number } {
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  return { lens, total: lens[lens.length - 1] };
}

/** 길 위 거리 d의 점 */
function pointAt(s: Seg, d: number, out: Pt): Pt {
  const { path, lens } = s;
  if (d <= 0) return Object.assign(out, path[0]);
  if (d >= s.total) return Object.assign(out, path[path.length - 1]);
  let i = 1;
  while (i < lens.length - 1 && lens[i] < d) i++;
  const a = path[i - 1];
  const b = path[i];
  const seg = lens[i] - lens[i - 1];
  const f = seg > 0 ? Math.min(1, Math.max(0, (d - lens[i - 1]) / seg)) : 1;
  out.x = a.x + (b.x - a.x) * f;
  out.y = a.y + (b.y - a.y) * f;
  return out;
}

const near = (a: Pt, b: Pt, r = 2) => Math.hypot(a.x - b.x, a.y - b.y) < r;

export class ResidentSim {
  readonly spots: RestSpot[];
  /** 마을 다른 곳의 쉼 자리 (멀리 산책 갈 때의 도착지) */
  readonly roam: RestSpot[];
  private readonly phase: number;
  private readonly idx: number;
  private leg: Leg | null = null;
  private readonly p0: Pt = { x: 0, y: 0 };
  private readonly p1: Pt = { x: 0, y: 0 };

  constructor(
    readonly def: ResidentDef,
    readonly index: number,
    readonly seed: number,
    private readonly grid: WalkGrid = critterGrid(),
  ) {
    this.idx = RESIDENT_INDEX_BASE + index;
    this.spots = residentSpots(def, grid);
    this.roam = villagePool(grid).filter((p) => !p.perch && Math.hypot(p.x - def.home.x, p.y - def.home.y) <= ROAM_R && !this.spots.some((o) => near(o, p, 20)));
    this.phase = Math.floor(hashUnit(seed, this.idx, 17) * def.legMs);
  }

  /** 구간 k의 출발(= 구간 k-1의 도착) 자리: 사는 동네 또는 (성향만큼) 마을 다른 곳 */
  spotAt(k: number): RestSpot {
    const away = this.roam.length > 0 && hashUnit(this.seed, this.idx, k, 3) < TASTES[this.def.taste].roam;
    const list = away ? this.roam : this.spots;
    return list[Math.floor(hashUnit(this.seed, this.idx, k) * list.length) % list.length];
  }

  private h(k: number, salt: number): number {
    return hashUnit(this.seed, this.idx, k, salt);
  }

  /** a에서 b까지 길 (a 포함). 못 가면 갈 수 있는 데까지 */
  private route(a: Pt, b: Pt): Pt[] {
    const path: Pt[] = [{ x: a.x, y: a.y }];
    if (!near(a, b, 0.5)) {
      let p = findPath(this.grid, a, b, { maxNodes: 30_000, snapRadius: 2 });
      // 곧게 편 길이 막힌 칸 모서리를 살짝 깎으면(표본 간격 사이) 칸 길 그대로 간다 — 많이 걸으니 담·소품을 스치지 않게
      if (p && p.length && !this.clear([a, ...p])) p = findPath(this.grid, a, b, { maxNodes: 30_000, snapRadius: 2, smooth: false }) ?? p;
      if (p && p.length) path.push(...p);
    }
    return path;
  }

  /** 길이 막힌 칸에서 1px 안쪽으로도 닿지 않는지 (1px 간격 표본의 네 귀퉁이까지 — 칸 모서리를 스치는 것도 잡는다) */
  private clear(path: Pt[]): boolean {
    const g = this.grid;
    const hit = (x: number, y: number) => g.blocked(Math.floor(x / g.cell), Math.floor(y / g.cell));
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let j = 0; j <= n; j++) {
        const x = a.x + ((b.x - a.x) * j) / n;
        const y = a.y + ((b.y - a.y) * j) / n;
        if (hit(x - 0.75, y - 0.75) || hit(x + 0.75, y - 0.75) || hit(x - 0.75, y + 0.75) || hit(x + 0.75, y + 0.75)) return false;
      }
    }
    return true;
  }

  /** 걷는 조각 (빠르기 v px/s) */
  private walkSeg(path: Pt[], t0: number, v: number): Seg {
    const { lens, total } = measure(path);
    return { swim: false, run: v > this.def.speed * RUN_AT, t0, dur: total > 0 ? (total / v) * 1000 : 0, path, lens, total };
  }

  /** 걷기 budget ms 동안 걸을 거리 dist에 맞는 빠르기 (너무 짧으면 천천히·일찍 도착, 길면 달린다) */
  private pace(dist: number, budget: number, hardMs: number): number {
    const sp = this.def.speed;
    let v = Math.min(sp * PACE_MAX, Math.max(sp * PACE_MIN, (dist / Math.max(1, budget)) * 1000));
    // 그래도 구간 안에 못 닿으면 더 빨리 (드물다: 아주 먼 길)
    if (dist > 0 && (dist / v) * 1000 > hardMs) v = (dist / hardMs) * 1000;
    return v;
  }

  /** 길이 목표 거리 D에 모자라면 들를 자리 하나 (from→w→to 어림 거리가 D에 가까운 곳) */
  private waypoint(k: number, from: Pt, to: Pt, D: number): Pt | null {
    const pool = villagePool(this.grid);
    const est = (w: Pt) => (Math.hypot(w.x - from.x, w.y - from.y) + Math.hypot(to.x - w.x, to.y - w.y)) * 1.15;
    const ok = pool.filter((w) => !near(w, from, 30) && !near(w, to, 30) && est(w) >= D * 0.7 && est(w) <= D * 1.1);
    if (ok.length) return ok[Math.floor(this.h(k, 91) * ok.length) % ok.length];
    let best: Pt | null = null;
    let bd = Infinity;
    for (const w of pool) {
      if (near(w, from, 30) || near(w, to, 30)) continue;
      const d = Math.abs(est(w) - D);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  /** 그냥 걷는 구간: from→(들를 곳)→to를 budget ms에 맞춰 */
  private planWalk(k: number, from: Pt, to: Pt, budget: number, pace: number): Seg[] {
    const D = (pace * budget) / 1000;
    let path = this.route(from, to);
    if (measure(path).total < D * 0.7) {
      const w = this.waypoint(k, from, to, D);
      if (w) {
        const a = this.route(from, w);
        const b = this.route(w, to);
        if (near(a[a.length - 1], w) && near(b[b.length - 1], to)) {
          const via = [...a, ...b.slice(1)];
          if (measure(via).total > measure(path).total) path = via;
        }
      }
    }
    const total = measure(path).total;
    if (total <= 0) return [];
    // 달리는 구간은 D가 길어 들를 곳도 멀다 → 빠르기가 RUN_AT을 넘어 달린다
    return [this.walkSeg(path, 0, this.pace(total, budget, this.def.legMs - 500))];
  }

  /** 헤엄 구간: from→물가 걷기, 물에 들어가 한 바퀴, 물가→to 걷기. 못 하면 null */
  private planSwim(k: number, from: Pt, to: Pt, budget: number): Seg[] | null {
    const sites = swimSites(this.grid);
    if (!sites.length) return null;
    const cost = (s: SwimSite) => Math.hypot(s.shore.x - from.x, s.shore.y - from.y) + Math.hypot(to.x - s.shore.x, to.y - s.shore.y);
    const best = [...sites].sort((a, b) => cost(a) - cost(b) || a.shore.x - b.shore.x || a.shore.y - b.shore.y).slice(0, 3);
    const site = best[Math.floor(this.h(k, 81) * best.length) % best.length];
    const a = this.route(from, site.shore);
    if (!near(a[a.length - 1], site.shore)) return null;
    const b = this.route(site.shore, to);
    const loop = [site.shore, ...site.loop, site.shore];
    const lm = measure(loop);
    const want = SWIM_MS[0] + this.h(k, 82) * (SWIM_MS[1] - SWIM_MS[0]);
    const sv = Math.min(SWIM_V_MAX, Math.max(SWIM_V_MIN, (lm.total / want) * 1000));
    const swimDur = (lm.total / sv) * 1000;
    const walkBudget = budget - swimDur;
    const dist = measure(a).total + measure(b).total;
    if (walkBudget < 3_000 || (dist / (this.def.speed * PACE_MAX)) * 1000 > walkBudget) return null;
    const v = this.pace(dist, walkBudget, walkBudget);
    const s1 = this.walkSeg(a, 0, v);
    const sw: Seg = { swim: true, run: false, t0: s1.t0 + s1.dur, dur: swimDur, path: loop, lens: lm.lens, total: lm.total };
    const s2 = this.walkSeg(b, sw.t0 + sw.dur, v);
    return [s1, sw, s2].filter((s) => s.dur > 0);
  }

  private legAt(k: number): Leg {
    if (this.leg && this.leg.k === k) return this.leg;
    const def = this.def;
    const T = TASTES[def.taste];
    const from = this.spotAt(k);
    const to = this.spotAt(k + 1);
    const u = this.h(k, 99);
    // 벤치·그루터기 앞에 도착하면 앉을 때가 많고, 길가에서는 덜 앉는다 (땅바닥보다 벤치에 앉은 모습이 자연스럽다)
    const sitP = to.perch ? Math.min(0.85, T.sit * 1.5) : T.sit * 0.75;
    let kind: "sit" | "swim" | "idle" = u < sitP ? "sit" : u < sitP + T.swim ? "swim" : "idle";
    const r = this.h(k, 98);
    const restMs = kind === "sit" ? T.sitMs[0] + r * (T.sitMs[1] - T.sitMs[0]) : kind === "swim" ? 1_500 + r * 1_500 : IDLE_MS[0] + r * (IDLE_MS[1] - IDLE_MS[0]);
    let segs = kind === "swim" ? this.planSwim(k, from, to, def.legMs - restMs) : null;
    if (!segs) {
      if (kind === "swim") kind = "idle";
      const pace = this.h(k, 97) < T.run ? def.speed * RUN_PACE : def.speed;
      segs = this.planWalk(k, from, to, def.legMs - restMs, pace);
    }
    const last = segs[segs.length - 1];
    const restAt = last ? last.t0 + last.dur : 0;
    // 길이 끊겼으면(도착 못 함) 도착 자리 = 마지막 길 점
    const end = last ? last.path[last.path.length - 1] : from;
    const reached = near(end, to);
    // 쉬기 시작할 때 바라보는 쪽: 마지막으로 걸어온 방향 (안 걸었으면 구간 해시)
    let face: DirId = this.h(k, 5) < 0.5 ? DIR.left : DIR.right;
    if (last)
      for (let i = last.path.length - 1; i > 0; i--) {
        const a = last.path[i - 1];
        const b = last.path[i];
        if (Math.abs(b.x - a.x) > 0.5 || Math.abs(b.y - a.y) > 0.5) {
          face = faceToward(a.x, a.y, b.x, b.y, face);
          break;
        }
      }
    const leg: Leg = {
      k,
      start: k * def.legMs - this.phase,
      segs,
      restAt,
      sitAt: kind === "sit" ? Math.max(restAt, def.legMs - restMs) : Infinity,
      to: reached ? to : { x: end.x, y: end.y, perch: null },
      face,
    };
    this.leg = leg;
    return leg;
  }

  /**
   * 시각 t(서버 ms)의 모습. seatTaken(좌석 id) = 사람이 그 자리에 앉아 있는지 (앉아 있으면 주민은 옆에 비켜 선다).
   * 같은 seed·t·좌석 상황이면 어느 클라이언트든 같은 결과
   */
  at(t: number, seatTaken: (id: string) => boolean = () => false, out: ResidentPose = blankResidentPose()): ResidentPose {
    const k = Math.floor((t + this.phase) / this.def.legMs);
    const L = this.legAt(k);
    const u = t - L.start;
    out.leg = k;
    out.seat = null;
    for (const s of L.segs) {
      if (u >= s.t0 + s.dur) continue;
      const d = (Math.max(0, u - s.t0) / s.dur) * s.total;
      const p = pointAt(s, d, this.p0);
      // 걷는 방향 (4방향): 길을 조금 앞서 본다 (끝 무렵이면 조금 뒤를 보고)
      const q = d + 6 <= s.total ? pointAt(s, d + 6, this.p1) : pointAt(s, d - 6, this.p1);
      const fwd = d + 6 <= s.total;
      out.x = p.x;
      out.y = p.y;
      out.dir = fwd ? faceToward(p.x, p.y, q.x, q.y, L.face) : faceToward(q.x, q.y, p.x, p.y, L.face);
      out.state = s.swim ? (inWater(p.x, p.y) ? "swim" : "walk") : s.run ? "run" : "walk";
      out.restMs = 0;
      return out;
    }
    out.x = L.to.x;
    out.y = L.to.y;
    out.restMs = u - L.restAt;
    if (u >= L.sitAt) {
      const sitMs = u - L.sitAt;
      const seat = L.to.perch;
      if (!seat) {
        out.state = "sitGround";
        out.dir = DIR.down;
        return out;
      }
      if (!seatTaken(seat.id)) {
        if (sitMs >= SIT_DELAY_MS) {
          out.x = seat.x;
          out.y = seat.y;
          out.state = "sitChair";
          out.dir = seat.facing;
          out.seat = seat;
          return out;
        }
        // 좌석 앞에서 자리로 몇 걸음
        const f = sitMs / SIT_DELAY_MS;
        out.x = L.to.x + (seat.x - L.to.x) * f;
        out.y = L.to.y + (seat.y - L.to.y) * f;
        out.state = "walk";
        out.dir = faceToward(L.to.x, L.to.y, seat.x, seat.y, DIR.up);
        return out;
      }
      // 사람이 앉아 있으면 그 앞을 가리지 않게 옆으로 비켜 선다 (어느 쪽인지는 구간 해시 → 모두 같은 쪽)
      out.x = L.to.x + (hashUnit(this.seed, this.index, k, 31) < 0.5 ? -SIDESTEP : SIDESTEP);
      out.state = "idle";
      out.dir = out.x < seat.x ? DIR.right : DIR.left;
      return out;
    }
    // 서서 두리번: 처음엔 걸어온 쪽, 그다음 1.4초마다 좌우·아래를 번갈아 본다 (구간 해시 → 모두 같은 쪽)
    out.state = "idle";
    const beat = Math.floor(out.restMs / 1_400);
    out.dir = beat === 0 ? L.face : LOOK[Math.floor(this.h(k, 40 + beat) * LOOK.length) % LOOK.length];
    return out;
  }
}

const LOOK: readonly DirId[] = [DIR.down, DIR.left, DIR.right, DIR.down];

/** 쉬는 동안 한 번 하는 몸짓: 손 흔들기·이모티콘 (없으면 null) */
export type RestAct = { atMs: number; icon: EmoteIcon } | null;

const IDLE_ICONS: readonly EmoteIcon[] = ["tune", "idea", "sweat", "zzz", "laugh", "clap"];

/** 구간 leg의 쉼 동안 할 몸짓 (결정적: 같은 구간이면 모두 같은 몸짓·같은 때). 절반쯤은 아무것도 안 한다. 쉼이 짧아 쉬자마자 곧 한다 */
export function restActOf(seed: number, index: number, leg: number): RestAct {
  const u = hashUnit(seed, RESIDENT_INDEX_BASE + index, leg, 77);
  if (u < 0.5) return null;
  const atMs = 400 + Math.floor(hashUnit(seed, index, leg, 78) * 1600);
  if (u < 0.68) return { atMs, icon: "wave" };
  return {
    atMs,
    icon: IDLE_ICONS[Math.floor(hashUnit(seed, index, leg, 79) * IDLE_ICONS.length) % IDLE_ICONS.length],
  };
}

/** 벤치에 앉아 있는 동안 띄울 상태 (구간마다 주민의 moods 중 하나, 가끔 없음) */
export function seatMoodOf(def: ResidentDef, seed: number, index: number, leg: number): string | null {
  if (!def.moods.length) return null;
  const u = hashUnit(seed, RESIDENT_INDEX_BASE + index, leg, 55);
  if (u < 0.3) return null;
  return def.moods[Math.floor(u * 1000) % def.moods.length];
}
