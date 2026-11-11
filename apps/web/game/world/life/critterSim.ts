import { FURNITURE, MAP_HEIGHT, MAP_WIDTH, SEATS, hashUnit, mulberry32, type Seat } from "@tomb/protocol";
import { findPath, type Pt, type WalkGrid } from "../../logic/pathfind";
import { nearWater, WALK, walkableGrid } from "../layout";

// 22번 돌아다니는 고양이·유령 — 결정적 시뮬레이션 (순수, Phaser 없음 → life.test.ts).
//
// 왜 이렇게 하나: 위치를 서버 틱에 실으면 고양이 8마리 × 10Hz가 모든 접속자에게 계속 나가고 DO가 잠들지 못한다(요금).
// 대신 채널 번호(서버가 welcome으로 알려 준 값) = 시드, 서버 시계(welcome.now로 맞춤) = 시각으로 두고
// 모든 클라이언트가 같은 함수로 "그 시각의 자리"를 계산한다 → 네트워크 0, 서버 비용 0, 늦게 들어온 사람도 같은 자리.
//
// 한 마리의 하루는 같은 길이의 "구간(leg)"이 이어진 것: 구간 k가 시작하면 자리 S(k)에서 S(k+1)로 걸어가고(길찾기, 물·충돌 피함)
// 도착하면 구간 끝까지 쉰다(앉기·식빵·그루밍·낮잠, 벤치면 벤치 위로 폴짝). S(k)는 (시드, 고양이, k) 해시로 고른 쉼 자리라
// 구간 하나만 계산하면 된다(과거를 다시 돌리지 않는다). 길도 걷기 격자(walkableGrid: 담·절벽·소품·가구·집·물)가 같으니 모두 같다.
// 다가가면 놀라 도망가거나 다가오는 반응은 화면 연출(내 화면에서만 잠깐 비켜 그리기)이라 공유 위치는 그대로다.

export type CritterKind = "cat" | "ghost";
export type CritterDef = {
  id: string;
  kind: CritterKind;
  /** 이름표 (가까이 가면) */
  name: string;
  /** 털 색 / 유령 색 */
  variant: number;
  /** 사는 동네 (쉼 자리는 이 원 안에서) */
  home: { x: number; y: number; r: number };
  /** 올라가 쉬는 벤치·의자 (FURNITURE id) */
  perches: readonly string[];
  /** 풀밭 쉼 자리 수 */
  grass: number;
  /** 구간 길이(ms)와 걷는 속도(px/s) */
  legMs: number;
  speed: number;
};

export const CRITTERS: readonly CritterDef[] = [
  { id: "cheese", kind: "cat", name: "치즈", variant: 0, home: { x: 1024, y: 470, r: 160 }, perches: ["bB", "bC", "bD", "bE"], grass: 5, legMs: 38_000, speed: 22 },
  { id: "kkam", kind: "cat", name: "까망이", variant: 1, home: { x: 670, y: 490, r: 100 }, perches: ["bA", "cC", "cD"], grass: 4, legMs: 42_000, speed: 20 },
  { id: "godeung", kind: "cat", name: "고등어", variant: 2, home: { x: 560, y: 740, r: 210 }, perches: ["bK", "lC", "bM"], grass: 5, legMs: 40_000, speed: 22 },
  { id: "samsaek", kind: "cat", name: "삼색이", variant: 3, home: { x: 1024, y: 128, r: 110 }, perches: ["bG", "bH"], grass: 4, legMs: 36_000, speed: 24 },
  { id: "tux", kind: "cat", name: "턱시도", variant: 4, home: { x: 1660, y: 720, r: 150 }, perches: ["bO", "bP"], grass: 4, legMs: 44_000, speed: 20 },
  { id: "boo", kind: "ghost", name: "꼬마 유령", variant: 0, home: { x: 304, y: 560, r: 170 }, perches: ["bI", "bJ"], grass: 5, legMs: 30_000, speed: 14 },
  { id: "starlet", kind: "ghost", name: "별 유령", variant: 1, home: { x: 230, y: 180, r: 140 }, perches: ["lB", "bF", "bL"], grass: 4, legMs: 34_000, speed: 12 },
  { id: "moss", kind: "ghost", name: "이끼 유령", variant: 2, home: { x: 330, y: 1120, r: 170 }, perches: [], grass: 6, legMs: 32_000, speed: 13 },
];

/** 쉬는 자세 (고양이: 앉기·식빵·그루밍·낮잠 / 유령: 둥실) */
export type RestPose = "sit" | "loaf" | "groom" | "sleep" | "float";
export type RestSpot = { x: number; y: number; /** 벤치·의자 좌석이면 그 좌석 (비어 있으면 위로 올라간다) */ perch: Seat | null };

export type CritterPose = {
  x: number;
  y: number;
  /** 걷는 중이면 true */
  walking: boolean;
  /** 바라보는 쪽 (-1 왼쪽, 1 오른쪽) */
  face: -1 | 1;
  pose: RestPose;
  /** 쉬는 자리가 좌석이면 그 좌석 (올라갈지는 그 좌석이 비었는지로 화면이 정한다) */
  perch: Seat | null;
  /** 쉬기 시작한 뒤 경과 ms (걷는 중이면 0) — 벤치로 폴짝 오르는 연출 */
  restMs: number;
  /** 구간 번호 (반응·소리 시드) */
  leg: number;
};

/** 좌석 앞(내려선 자리)까지의 거리 — 길은 여기까지 걷고, 쉬기 시작하면 좌석 위로 */
export const PERCH_FRONT_DY = 9;

const CELL = 8;
let gridCache: WalkGrid | null = null;

/** 고양이·유령이 다니는 격자: 막힌 칸(1)과 물(2)을 모두 피한다. 모든 클라이언트가 같은 격자를 얻는다 (집은 모든 필지를 막는다) */
export function critterGrid(): WalkGrid {
  if (gridCache) return gridCache;
  const w = walkableGrid(CELL);
  gridCache = {
    cols: w.cols,
    rows: w.rows,
    cell: w.cell,
    ox: 0,
    oy: 0,
    blocked: (cx, cy) => cx < 0 || cy < 0 || cx >= w.cols || cy >= w.rows || w.cells[cy * w.cols + cx] !== WALK.open,
  };
  return gridCache;
}

/** 이 점 둘레 3×3칸이 모두 열려 있고 물가가 아닌지 (쉼 자리로 쓸 수 있는지) */
export function restable(g: WalkGrid, x: number, y: number): boolean {
  if (x < 40 || y < 48 || x > MAP_WIDTH - 40 || y > MAP_HEIGHT - 24) return false;
  const cx = Math.floor(x / g.cell);
  const cy = Math.floor(y / g.cell);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g.blocked(cx + dx, cy + dy)) return false;
  return !nearWater(x, y, 14);
}

const FURN = new Map(FURNITURE.map((f) => [f.id, f]));

/** 한 마리의 쉼 자리 목록 (결정적: 같은 맵이면 모든 클라이언트가 같은 목록) */
export function restSpots(def: CritterDef, g: WalkGrid = critterGrid()): RestSpot[] {
  const out: RestSpot[] = [];
  for (const fid of def.perches) {
    if (!FURN.has(fid)) continue;
    for (const s of SEATS) {
      if (s.furnitureId !== fid) continue;
      const front = { x: s.x, y: s.y + PERCH_FRONT_DY };
      if (restable(g, front.x, front.y)) out.push({ x: front.x, y: front.y, perch: s });
    }
  }
  const r = mulberry32(Math.floor(hashUnit(def.id.length, def.home.x, def.home.y) * 0x7fffffff));
  let added = 0;
  for (let i = 0; i < 400 && added < def.grass; i++) {
    const a = r() * Math.PI * 2;
    const d = def.home.r * Math.sqrt(r());
    const x = Math.round(def.home.x + Math.cos(a) * d);
    const y = Math.round(def.home.y + Math.sin(a) * d * 0.8);
    if (!restable(g, x, y)) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.y - y) < 28)) continue;
    out.push({ x, y, perch: null });
    added++;
  }
  return out;
}

type Leg = { k: number; start: number; from: RestSpot; to: RestSpot; path: Pt[]; lens: number[]; total: number; walkMs: number; pose: RestPose; restFace: -1 | 1 };

/**
 * 한 마리의 시뮬레이터. at(t)는 t의 구간만 계산하고(길찾기 1번), 같은 구간이면 캐시를 쓴다.
 * seed = 채널 번호 (welcome.channel). 같은 seed·t면 어느 클라이언트든 같은 결과.
 */
export class CritterSim {
  readonly spots: RestSpot[];
  private readonly phase: number;
  private leg: Leg | null = null;

  constructor(
    readonly def: CritterDef,
    readonly index: number,
    readonly seed: number,
    private readonly grid: WalkGrid = critterGrid(),
  ) {
    this.spots = restSpots(def, grid);
    this.phase = Math.floor(hashUnit(seed, index, 17) * def.legMs);
  }

  /** 구간 k의 출발(= 구간 k-1의 도착) 자리 */
  spotAt(k: number): RestSpot {
    const n = this.spots.length;
    return this.spots[Math.floor(hashUnit(this.seed, this.index, k) * n) % n];
  }

  private legAt(k: number): Leg {
    if (this.leg && this.leg.k === k) return this.leg;
    const def = this.def;
    const from = this.spotAt(k);
    const to = this.spotAt(k + 1);
    const path: Pt[] = [{ x: from.x, y: from.y }];
    if (from !== to) {
      const p = findPath(this.grid, from, to, { maxNodes: 30_000, snapRadius: 2 });
      if (p && p.length) path.push(...p);
    }
    const lens: number[] = [0];
    for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    const total = lens[lens.length - 1];
    // 길이 너무 길면 조금 빨리 걷는다 (구간의 60% 안에 도착)
    const walkMs = total <= 0 ? 0 : Math.min((total / def.speed) * 1000, def.legMs * 0.6);
    const u = hashUnit(this.seed, this.index, k, 99);
    const pose: RestPose = def.kind === "ghost" ? "float" : u < 0.32 ? "sit" : u < 0.62 ? "loaf" : u < 0.82 ? "groom" : "sleep";
    // 길이 끊겼으면(도착 못 함) 도착 자리 = 마지막 길 점으로 둔다
    const end = path[path.length - 1];
    const reached = Math.hypot(end.x - to.x, end.y - to.y) < 2;
    // 쉬는 동안 바라보는 쪽: 마지막으로 걸어온 방향 (안 걸었으면 구간 해시) — 언제 들어온 사람이든 같은 쪽을 본다
    let restFace: -1 | 1 = hashUnit(this.seed, this.index, k, 5) < 0.5 ? -1 : 1;
    for (let i = path.length - 1; i > 0; i--) {
      const dx = path[i].x - path[i - 1].x;
      if (Math.abs(dx) > 0.5) {
        restFace = dx > 0 ? 1 : -1;
        break;
      }
    }
    const leg: Leg = { k, start: k * def.legMs - this.phase, from, to: reached ? to : { x: end.x, y: end.y, perch: null }, path, lens, total, walkMs, pose, restFace };
    this.leg = leg;
    return leg;
  }

  /** 시각 t(서버 ms)의 모습 */
  at(t: number, out: CritterPose = { x: 0, y: 0, walking: false, face: 1, pose: "sit", perch: null, restMs: 0, leg: 0 }): CritterPose {
    const k = Math.floor((t + this.phase) / this.def.legMs);
    const L = this.legAt(k);
    const u = t - L.start;
    out.leg = k;
    if (u < L.walkMs && L.total > 0) {
      const d = (u / L.walkMs) * L.total;
      let i = 1;
      while (i < L.lens.length - 1 && L.lens[i] < d) i++;
      const a = L.path[i - 1];
      const b = L.path[i];
      const seg = L.lens[i] - L.lens[i - 1];
      const f = seg > 0 ? Math.min(1, Math.max(0, (d - L.lens[i - 1]) / seg)) : 1;
      out.x = a.x + (b.x - a.x) * f;
      out.y = a.y + (b.y - a.y) * f;
      out.walking = true;
      out.face = L.restFace;
      for (let j = i; j > 0; j--) {
        const dx = L.path[j].x - L.path[j - 1].x;
        if (Math.abs(dx) > 0.5) {
          out.face = dx > 0 ? 1 : -1;
          break;
        }
      }
      out.pose = L.pose;
      out.perch = null;
      out.restMs = 0;
      return out;
    }
    out.x = L.to.x;
    out.y = L.to.y;
    out.walking = false;
    out.pose = L.pose;
    out.perch = L.to.perch;
    out.restMs = u - L.walkMs;
    out.face = L.restFace;
    return out;
  }
}
