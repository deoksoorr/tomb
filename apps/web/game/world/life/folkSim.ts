import { DIR, hashUnit, type DirId } from "@tomb/protocol";
import type { TimePhase, Weather } from "@/lib/ambience";
import { faceToward } from "../../logic/movement";
import { findPath, type Pt, type WalkGrid } from "../../logic/pathfind";

// 11/16 바닷가·캠핑장 주민 — 하루 일과(시간대·날씨·물때)를 따라 움직이는 결정적 시뮬레이션 (순수, Phaser 없음 → seaLife.test·campLife.test).
// 마을 주민(residentSim)과 같은 약속: 채널 번호 = 시드, 서버 시계 = 시각 → 같은 채널 모두가 같은 자리에서 같은 주민을 본다. 서버는 모른다.
// 다른 점: 집 구역을 떠도는 대신, 주민마다 "지금 할 일" 목록(plans)을 가진다. 구간(legMs)마다 그 구간의 상황(ctx: 시각·날씨·물때)으로
// 할 일 하나와 그 자리를 해시로 고르고, 앞 구간의 도착 자리에서 걸어가 남은 시간 동안 그 일을 한다 (잠수·갯벌 캐기·사진·불 보기…).
// - 물: 헤엄치는 주민(swimmer)이 아니면 그 구간 동안 가장 높은 물 높이에서 물속인 칸을 길에서 뺀다 → 물때가 바뀌어도 발이 젖지 않는다.
// - 집에 들어가기(away): 문까지 걸어가 사라지고, 다음 구간에도 집이면 계속 안 보인다 (비 오면 사람이 줄어든다).
// - 구간 하나만 계산하면 되므로(과거를 다시 돌리지 않는다) 어느 시각을 물어도 모두 같은 자리다.

/** 도착해서 하는 일 */
export type FolkAct =
  | "stand" // 서서 바라보기 (자리 face 쪽)
  | "look" // 두리번
  | "sit" // 바닥에 앉기
  | "swim" // 물에 떠서 둥실
  | "dive" // 잠수했다 떠오르기 (해녀)
  | "dig" // 쪼그려 갯벌·흙 캐기
  | "photo" // 사진 찍기
  | "watch" // 망보기 (구조요원)
  | "fish" // 앉아 낚시
  | "grill" // 고기 굽기
  | "chop" // 장작 패기
  | "gaze" // 하늘 보기 (위를 본다)
  | "play" // 뛰어놀기 (강아지·아이)
  | "nap" // 엎드려 자기 (동물) · 앉아 졸기
  | "away"; // 집에 들어가 안 보인다

export type FolkSpot = { x: number; y: number; face?: DirId };
export type FolkPlan = { act: FolkAct; spots: readonly FolkSpot[]; w: number; run?: boolean };

/** 구간의 상황 (물때는 바닷가만 — 캠핑장은 tide 0·open false) */
export type FolkCtx = {
  hour: number;
  phase: TimePhase;
  weather: Weather;
  /** 그 구간 동안 가장 높은 물 높이 (0 간조 ~ 1 만조) */
  tide: number;
  /** 갯벌이 그 구간 내내 열려 있는지 */
  open: boolean;
};

export type FolkLineWhen = TimePhase | Weather | "low" | "high" | "wet";
/** 대사 (함수면 말 거는 때 시각으로 만든다 — 다음 물때 같은 안내) */
export type FolkLine = { t: string | ((now: number) => string); when?: FolkLineWhen };
export type FolkKind = "ghost" | "dog" | "cat";
/** 손에 드는 소품 (folkArt) */
export type FolkProp = "tewak" | "hoe" | "icebox" | "rescue" | "camera" | "axe" | "tongs" | "poles" | "rod" | "scope" | "ball";

export type FolkDef = {
  id: string;
  name: string;
  kind: FolkKind;
  /** 유령 몸 모양·색·꾸미기 (kind ghost) */
  body?: string;
  color?: string;
  look?: readonly string[];
  /** 동물 털 색 (kind dog·cat — world/life/sprites) */
  variant?: number;
  prop?: FolkProp;
  /** 구간 길이(ms)와 걷는 속도(px/s) */
  legMs: number;
  speed: number;
  /** 물에 들어간다 (해녀) */
  swimmer?: boolean;
  /** 이 상황에서 할 일 후보 (w = 고르는 비중). 언제나 하나 이상 */
  plans: (ctx: FolkCtx) => readonly FolkPlan[];
  lines: readonly FolkLine[];
};

/** 맵마다 주는 것: 걷기 격자, 시각 → 상황, 물 */
export type FolkWorld = {
  grid: WalkGrid;
  /** t0~t1 구간의 상황 */
  ctx(t0: number, t1: number): FolkCtx;
  /** 그 상황에서 물속이라 못 걷는 자리인지 (헤엄치지 않는 주민의 길에서 뺀다) */
  wet?(x: number, y: number, ctx: FolkCtx): boolean;
  /** 시각 t에 (x,y)가 물속인지 (헤엄 모습) */
  swimAt?(x: number, y: number, t: number): boolean;
};

export type FolkState = "idle" | "walk" | "run" | "sitGround" | "swim" | "dive";
export type FolkPose = {
  x: number;
  y: number;
  state: FolkState;
  /** 지금 하는 일 (걷는 중이면 도착해서 할 일) */
  act: FolkAct;
  dir: DirId;
  leg: number;
  /** 도착한 뒤 경과 ms (걷는 중이면 0) */
  restMs: number;
  moving: boolean;
  /** 집에 들어가 안 보인다 */
  hidden: boolean;
};

export function blankFolkPose(): FolkPose {
  return { x: 0, y: 0, state: "idle", act: "stand", dir: DIR.down, leg: 0, restMs: 0, moving: false, hidden: false };
}

/** 마을 주민(100~)·강아지(200~) 시뮬레이터 번호와 겹치지 않게 */
export const FOLK_INDEX_BASE = 300;
/** 걷는 데 쓰는 구간 비율 상한 (그보다 길면 빨리 걷는다) */
const WALK_SHARE = 0.8;
const RUN_AT = 1.35;
const RUN_PACE = 1.8;
/** 잠수 한 번 (잠수 → 떠올라 숨 고르기) */
export const DIVE_CYCLE_MS = 9_000;
export const DIVE_UNDER_MS = 5_200;
/** 짝이 앞 사람보다 늦게 출발하는 시간 */
const TWIN_LAG_MS = 1_400;

type Leg = {
  k: number;
  start: number;
  plan: FolkPlan;
  to: FolkSpot;
  path: Pt[];
  lens: number[];
  total: number;
  dur: number;
  run: boolean;
  face: DirId;
  /** 출발할 때 집 안 (나타나며 걷기 시작) */
  fromAway: boolean;
};

function measure(path: Pt[]): { lens: number[]; total: number } {
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  return { lens, total: lens[lens.length - 1] };
}

function pointAt(path: Pt[], lens: number[], total: number, d: number, out: Pt): Pt {
  if (d <= 0) return Object.assign(out, path[0]);
  if (d >= total) return Object.assign(out, path[path.length - 1]);
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

/** 할 일 고르기 (비중대로, u = 0~1) */
export function pickPlan(plans: readonly FolkPlan[], u: number): FolkPlan {
  const ok = plans.filter((p) => p.w > 0 && p.spots.length > 0);
  const list = ok.length ? ok : plans;
  const sum = list.reduce((s, p) => s + Math.max(0, p.w), 0);
  let r = u * sum;
  for (const p of list) {
    r -= Math.max(0, p.w);
    if (r < 0) return p;
  }
  return list[list.length - 1];
}

const LOOK: readonly DirId[] = [DIR.down, DIR.left, DIR.right, DIR.down];

export class FolkSim {
  private readonly idx: number;
  private readonly phase: number;
  private leg: Leg | null = null;
  private readonly p0: Pt = { x: 0, y: 0 };
  private readonly p1: Pt = { x: 0, y: 0 };

  constructor(
    readonly def: FolkDef,
    readonly index: number,
    readonly seed: number,
    private readonly world: FolkWorld,
    /** 짝: 앞 사람의 번호로 같은 일과를 고르고, 자리만 dx만큼 옆으로 */
    private readonly twin: { index: number; dx: number } | null = null,
  ) {
    this.idx = FOLK_INDEX_BASE + (twin ? twin.index : index);
    this.phase = Math.floor(hashUnit(seed, this.idx, 17) * def.legMs);
  }

  private h(k: number, salt: number): number {
    return hashUnit(this.seed, this.idx, k, salt);
  }

  /** 구간 k가 시작하는 시각 */
  legStart(k: number): number {
    return k * this.def.legMs - this.phase;
  }

  legOf(t: number): number {
    return Math.floor((t + this.phase) / this.def.legMs);
  }

  /** 구간 k의 상황 */
  ctxOf(k: number): FolkCtx {
    const s = this.legStart(k);
    return this.world.ctx(s, s + this.def.legMs);
  }

  /** 구간 k에 할 일과 도착 자리 (= 구간 k+1의 출발 자리) */
  destOf(k: number): { plan: FolkPlan; spot: FolkSpot } {
    const plan = pickPlan(this.def.plans(this.ctxOf(k)), this.h(k, 1));
    const raw = plan.spots[Math.floor(this.h(k, 2) * plan.spots.length) % plan.spots.length];
    // 칸 가운데로 맞춘다 (칸 경계에 선 자리는 길 첫걸음이 옆 막힌 칸 모서리를 스친다) — 4px 안쪽이라 보기엔 같은 자리
    const g = this.world.grid;
    const x = raw.x + (this.twin ? this.twin.dx : 0);
    const spot = { ...raw, x: g.ox + Math.floor((x - g.ox) / g.cell) * g.cell + g.cell / 2, y: g.oy + Math.floor((raw.y - g.oy) / g.cell) * g.cell + g.cell / 2 };
    return { plan, spot };
  }

  /** 구간 k에서 걷는 격자 (헤엄치지 않으면 그 구간의 물을 막는다) */
  gridFor(ctx: FolkCtx): WalkGrid {
    const g = this.world.grid;
    const wet = this.world.wet;
    if (this.def.swimmer || !wet) return g;
    return {
      cols: g.cols,
      rows: g.rows,
      cell: g.cell,
      ox: g.ox,
      oy: g.oy,
      blocked: (cx, cy) => g.blocked(cx, cy) || wet(g.ox + cx * g.cell + g.cell / 2, g.oy + cy * g.cell + g.cell / 2, ctx),
    };
  }

  /** a → b 길 (a 포함). 못 가면 갈 수 있는 데까지 */
  route(a: Pt, b: Pt, g: WalkGrid): Pt[] {
    const path: Pt[] = [{ x: a.x, y: a.y }];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 0.5) return path;
    let p = findPath(g, a, b, { maxNodes: 40_000, snapRadius: 2 });
    if (p && p.length && !clearPath(g, [a, ...p])) p = findPath(g, a, b, { maxNodes: 40_000, snapRadius: 2, smooth: false }) ?? p;
    if (p && p.length) path.push(...p);
    return path;
  }

  /** 미리 계산 (구간이 바뀌는 프레임에 여럿이 한꺼번에 길을 찾지 않게) */
  warmLeg(t: number): boolean {
    const k = this.legOf(t);
    if (this.leg && this.leg.k === k) return false;
    this.legAt(k);
    return true;
  }

  /** 구간 k 계산 (테스트도 부른다) */
  legAt(k: number): Leg {
    if (this.leg && this.leg.k === k) return this.leg;
    const def = this.def;
    const prev = this.destOf(k - 1);
    const { plan, spot } = this.destOf(k);
    const ctx = this.ctxOf(k);
    const g = this.gridFor(ctx);
    const path = this.route(prev.spot, spot, g);
    const { lens, total } = measure(path);
    let v = def.speed * (plan.run ? RUN_PACE : 1);
    const budget = def.legMs * WALK_SHARE;
    if (total > 0 && (total / v) * 1000 > budget) v = (total / budget) * 1000;
    const dur = total > 0 ? (total / v) * 1000 : 0;
    const end = path[path.length - 1];
    const reached = Math.hypot(end.x - spot.x, end.y - spot.y) < 2;
    let face: DirId = spot.face ?? (this.h(k, 5) < 0.5 ? DIR.left : DIR.right);
    if (spot.face === undefined)
      for (let i = path.length - 1; i > 0; i--) {
        const a = path[i - 1];
        const b = path[i];
        if (Math.abs(b.x - a.x) > 0.5 || Math.abs(b.y - a.y) > 0.5) {
          face = faceToward(a.x, a.y, b.x, b.y, face);
          break;
        }
      }
    const leg: Leg = {
      k,
      start: this.legStart(k),
      plan,
      to: reached ? spot : { x: end.x, y: end.y, face: spot.face },
      path,
      lens,
      total,
      dur,
      run: v > def.speed * RUN_AT,
      face,
      fromAway: prev.plan.act === "away",
    };
    this.leg = leg;
    return leg;
  }

  /** 시각 t의 모습 (같은 seed·t면 어느 클라이언트든 같다) */
  at(t: number, out: FolkPose = blankFolkPose()): FolkPose {
    const k = this.legOf(t);
    const L = this.legAt(k);
    // 짝은 앞 사람 조금 뒤에서 따라 걷는다 (나란히 겹쳐 걷지 않게)
    const u = Math.max(0, t - L.start - (this.twin ? TWIN_LAG_MS : 0));
    out.leg = k;
    out.act = L.plan.act;
    out.hidden = false;
    if (u < L.dur) {
      const d = (u / L.dur) * L.total;
      const p = pointAt(L.path, L.lens, L.total, d, this.p0);
      const fwd = d + 6 <= L.total;
      const q = pointAt(L.path, L.lens, L.total, fwd ? d + 6 : d - 6, this.p1);
      out.x = p.x;
      out.y = p.y;
      out.dir = fwd ? faceToward(p.x, p.y, q.x, q.y, L.face) : faceToward(q.x, q.y, p.x, p.y, L.face);
      out.state = this.def.swimmer && this.world.swimAt?.(p.x, p.y, t) ? "swim" : L.run ? "run" : "walk";
      out.restMs = 0;
      out.moving = true;
      return out;
    }
    out.moving = false;
    out.x = L.to.x;
    out.y = L.to.y;
    out.restMs = u - L.dur;
    out.dir = L.to.face ?? L.face;
    // 집에 들어갔다 (문 앞에 도착) — 처음부터 집 안이고 그대로 집이면 안 걷고 계속 안 보인다
    if (L.plan.act === "away") {
      out.hidden = true;
      out.state = "idle";
      return out;
    }
    const wet = this.def.swimmer && !!this.world.swimAt?.(out.x, out.y, t);
    switch (L.plan.act) {
      case "sit":
      case "fish":
      case "dig":
      case "nap":
        out.state = "sitGround";
        if (L.plan.act === "nap" || L.plan.act === "sit") out.dir = L.to.face ?? DIR.down;
        break;
      case "swim":
        out.state = wet ? "swim" : "idle";
        // 제자리에서 둥실 (조금씩 오간다)
        out.x += Math.sin((t + this.index * 977) / 2100) * 5;
        out.y += Math.sin((t + this.index * 577) / 2900) * 2;
        break;
      case "dive":
        out.state = wet ? ((t + this.index * 1300) % DIVE_CYCLE_MS < DIVE_UNDER_MS ? "dive" : "swim") : "idle";
        break;
      case "look": {
        out.state = "idle";
        const beat = Math.floor(out.restMs / 1_600);
        out.dir = beat === 0 ? L.face : LOOK[Math.floor(this.h(k, 40 + (beat % 16)) * LOOK.length) % LOOK.length];
        break;
      }
      case "gaze":
        out.state = "idle";
        out.dir = DIR.up;
        break;
      case "play": {
        // 제자리 둘레를 이리저리 뛴다 (구간 해시로 정한 박자 → 모두 같다)
        const beat = Math.floor(out.restMs / 1_400);
        const ph = (out.restMs % 1_400) / 1_400;
        const run = this.h(k, 60 + (beat % 24)) < 0.65;
        const ax = (this.h(k, 90 + (beat % 24)) - 0.5) * 36;
        const ay = (this.h(k, 120 + (beat % 24)) - 0.5) * 14;
        const s = run ? Math.sin(ph * Math.PI) : 0;
        out.x += ax * s;
        out.y += ay * s;
        out.state = run ? "run" : "idle";
        if (run) out.dir = ax * Math.cos(ph * Math.PI) >= 0 ? DIR.right : DIR.left;
        out.moving = run;
        break;
      }
      default:
        out.state = "idle";
    }
    return out;
  }
}

/** 길이 막힌 칸 모서리를 스치지 않는지 (1px 간격, 네 귀퉁이 0.75px) */
export function clearPath(g: WalkGrid, path: readonly Pt[]): boolean {
  const hit = (x: number, y: number) => g.blocked(Math.floor((x - g.ox) / g.cell), Math.floor((y - g.oy) / g.cell));
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

/** 대사 고르기 상황 */
export type FolkLineCtx = { phase: TimePhase; weather: Weather; tide?: "low" | "high" | null; wet?: boolean };

function fits(l: FolkLine, c: FolkLineCtx): boolean {
  if (!l.when) return true;
  if (l.when === "low" || l.when === "high") return c.tide === l.when;
  if (l.when === "wet") return c.wet === true;
  return l.when === c.phase || l.when === c.weather;
}

export function lineText(l: FolkLine, now: number): string {
  return typeof l.t === "function" ? l.t(now) : l.t;
}

/** 말 걸면 할 대사 하나 (마을 pickLine과 같은 규칙: 때에 맞는 줄이 있으면 절반쯤은 그중에서). 바로 전 줄은 되도록 피한다 */
export function pickFolkLine(def: FolkDef, c: FolkLineCtx, r: () => number, now: number, last: string | null = null): string {
  const timely = def.lines.filter((l) => l.when && fits(l, c));
  const always = def.lines.filter((l) => !l.when);
  let pool = timely.length && r() < 0.5 ? timely : always.length ? always : def.lines.filter((l) => fits(l, c));
  if (pool.length > 1 && last) pool = pool.filter((l) => lineText(l, now) !== last);
  if (!pool.length) pool = def.lines.slice();
  return lineText(pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))], now);
}

/** 맵 걷기 격자(칸 배열) → 길찾기 격자 */
export function folkGrid(g: { cell: number; cols: number; rows: number; cells: Uint8Array }): WalkGrid {
  return { cols: g.cols, rows: g.rows, cell: g.cell, ox: 0, oy: 0, blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows || g.cells[cy * g.cols + cx] === 1 };
}
