import {
  BOAT_MOORING,
  BRIDGES,
  CAMPFIRES,
  DOCK_DECK,
  FERRY_DOCK,
  FURNITURE,
  GRAVEYARD_AISLE_X,
  GRID_COLS,
  GRID_DY,
  GRID_ROWS,
  GRID_Y0,
  HILL,
  HILL_CLIFF,
  HILL_STAIRS,
  HOUSE_LOT_H,
  HOUSE_LOT_W,
  HOUSE_LOTS,
  HOUSING_DOOR,
  HOUSING_OFFICE,
  HUNT_GATE,
  LAKE,
  LAKE_PIER,
  MAP_COLS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  PORTAL_RADIUS,
  RIVER_HALF_W,
  RIVER_PATH,
  SEATS,
  SHOP,
  SHOP_DOOR,
  SHRINE,
  STEP_STONE_R,
  STEP_STONES,
  TABLES,
  TILE,
  WALL_THICKNESS,
  graveSlot,
  type Campfire,
  type Furniture,
} from "@tomb/protocol";
import { facadeInfo } from "../housing/art";

// 정적 맵 배치 (순수 데이터). 좌석·스폰·특별한 장소·강·필지 좌표는 packages/protocol/src/world.ts가 원본이고,
// 여기서는 그 사이를 채우는 나무·석등·우물·그네·해먹·종루·꽃밭 등 소품과 바닥 종류, 물(강·호수), 물살, 충돌, 상호작용 대상을 정한다.
// world.test.ts가 겹침(묘비 자리·좌석·길·문 앞·물)을 검사한다.
//
// 충돌의 원본: staticColliders() (담·절벽·소품·가구·모닥불·오두막·필지의 집 몸체). 묘비 충돌은 GraveField가 따로 둔다.
// 길찾기(41번 내 묘비 걸어가기 등)는 walkableGrid()를 쓴다 — 같은 충돌 목록을 8px 칸으로 굽는다.

export type Rect = { x: number; y: number; w: number; h: number };
export type PropKind =
  | "tree"
  | "deadTree"
  | "autumn"
  | "maple"
  | "ginkgo"
  | "blossom"
  | "pine"
  | "snowPine"
  | "bush"
  | "lantern"
  | "lamp"
  | "table"
  | "well"
  | "swing"
  | "hammock"
  | "bell"
  | "cairn"
  | "flowers"
  | "mushroom"
  | "leaves"
  | "pumpkin"
  | "mat"
  | "scarecrow"
  | "reeds"
  | "jar"
  | "boat"
  | "shrineTree";
export type PropDef = { kind: PropKind; x: number; y: number; variant: number };

/** 매달릴 수 있는 (잎이 남은) 나무 */
export function isLiveTree(k: PropKind): boolean {
  return k === "tree" || k === "autumn" || k === "maple" || k === "ginkgo" || k === "blossom";
}
const isTree = (k: PropKind) => isLiveTree(k) || k === "deadTree" || k === "pine" || k === "snowPine" || k === "shrineTree";

const CX = MAP_WIDTH / 2;

// ── 물: 강(가운데 줄 + 폭) + 호수(타원). 다리·나루터·잔교·징검다리 위는 물이 아니다 ──
export type WaterBody = { kind: "ellipse"; x: number; y: number; rx: number; ry: number } | { kind: "river" };
export const WATER: readonly WaterBody[] = [{ kind: "river" }, { kind: "ellipse", ...LAKE }];
/** 물살 세기 (px/초). 강에서 수영하면 하류(호수 쪽)로 살짝 떠내려간다 */
export const RIVER_CURRENT = 14;

/** 다리 판자 (물이 아닌 곳) */
export const BRIDGE_DECKS: readonly Rect[] = BRIDGES.map((b) => ({ x: b.x - b.w / 2, y: b.y0, w: b.w, h: b.y1 - b.y0 }));
/** 물 위에 놓인 걸을 수 있는 판자 (다리·나루터·호수 잔교) */
export const DECKS: readonly Rect[] = [...BRIDGE_DECKS, DOCK_DECK, LAKE_PIER];

type Seg = { ax: number; ay: number; dx: number; dy: number; len2: number; len: number };
const SEGS: readonly Seg[] = RIVER_PATH.slice(1).map((b, i) => {
  const a = RIVER_PATH[i];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { ax: a.x, ay: a.y, dx, dy, len2: dx * dx + dy * dy, len: Math.hypot(dx, dy) };
});
const RIVER_BOX = {
  x0: Math.min(...RIVER_PATH.map((p) => p.x)) - RIVER_HALF_W - 4,
  x1: Math.max(...RIVER_PATH.map((p) => p.x)) + RIVER_HALF_W + 4,
  y0: Math.min(...RIVER_PATH.map((p) => p.y)) - RIVER_HALF_W - 4,
  y1: Math.max(...RIVER_PATH.map((p) => p.y)) + RIVER_HALF_W + 4,
};

// riverDist의 작업 변수 (매 프레임 호출이라 객체를 만들지 않는다)
let segHit = 0;
/** 강 가운데 줄까지 거리 (멀면 Infinity). segHit = 가장 가까운 구간 */
export function riverDist(x: number, y: number): number {
  if (x < RIVER_BOX.x0 - 40 || x > RIVER_BOX.x1 + 40 || y < RIVER_BOX.y0 - 40 || y > RIVER_BOX.y1 + 40) return Infinity;
  let best = Infinity;
  for (let i = 0; i < SEGS.length; i++) {
    const s = SEGS[i];
    let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (s.ax + s.dx * t), y - (s.ay + s.dy * t));
    if (d < best) {
      best = d;
      segHit = i;
    }
  }
  return best;
}

function lakeD(x: number, y: number, grow: number): number {
  const dx = (x - LAKE.x) / (LAKE.rx + grow);
  const dy = (y - LAKE.y) / (LAKE.ry + grow);
  return dx * dx + dy * dy;
}

function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** 징검다리 돌 위 */
export function onStone(x: number, y: number): boolean {
  for (const s of STEP_STONES) if (Math.hypot(x - s.x, y - s.y) <= STEP_STONE_R) return true;
  return false;
}

/** 판자(다리·나루터·잔교) 위 */
export function onDeck(x: number, y: number): boolean {
  for (const d of DECKS) if (inRect(d, x, y)) return true;
  return false;
}

/** 물 몸체 안 (판자·돌 무시). grow만큼 넓혀 본다 */
export function inWaterBody(x: number, y: number, grow = 0): boolean {
  return riverDist(x, y) <= RIVER_HALF_W + grow || lakeD(x, y, grow) <= 1;
}

/** 발밑이 물(강·호수) 안이면 수영. 다리·나루터·잔교·징검다리 위는 물이 아니다 */
export function inWater(x: number, y: number): boolean {
  if (!inWaterBody(x, y, -2)) return false;
  return !onDeck(x, y) && !onStone(x, y);
}

/** 물가 (물 밖이지만 margin px 안) — E로 물 튀기기 */
export function nearWater(x: number, y: number, margin = 10): boolean {
  if (inWater(x, y)) return false;
  return inWaterBody(x, y, margin);
}

const NO_CURRENT = { vx: 0, vy: 0 } as const;
const current = { vx: 0, vy: 0 };
/**
 * 물살 (px/초). 강 안이면 하류 방향으로 RIVER_CURRENT (가운데가 가장 세고 둑 쪽은 약하다), 호수·물 밖은 0.
 * 돌려주는 객체는 재사용된다 (바로 읽고 버릴 것)
 */
export function waterCurrent(x: number, y: number): { vx: number; vy: number } {
  const d = riverDist(x, y);
  if (d > RIVER_HALF_W || lakeD(x, y, 0) <= 1) return NO_CURRENT;
  const s = SEGS[segHit];
  const k = RIVER_CURRENT * (1 - 0.5 * (d / RIVER_HALF_W));
  current.vx = (s.dx / s.len) * k;
  current.vy = (s.dy / s.len) * k;
  return current;
}

// ── 소품 배치 ──

/** 결정적 의사난수 0..1 */
function h01(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const P = (kind: PropKind, x: number, y: number, variant = 0): PropDef => ({ kind, x, y, variant });

/** 성황당: 오색 천을 묶은 나무와 돌무더기 (SHRINE 앞자리 뒤쪽) */
export const SHRINE_TREE = { x: SHRINE.x + 18, y: SHRINE.y - 10 } as const;
export const SHRINE_CAIRN = { x: SHRINE.x - 12, y: SHRINE.y - 6 } as const;

/** 해먹 (받침 가운데). 1인 자리 — 누워서 흔들흔들 */
export const HAMMOCKS: readonly { x: number; y: number }[] = [
  { x: 872, y: 584 },
  { x: 1176, y: 584 },
  { x: 704, y: 1012 },
  { x: 116, y: 222 },
];
/** 그네 (받침 가운데) */
export const SWINGS: readonly { x: number; y: number }[] = [
  { x: 856, y: 304 },
  { x: 896, y: 304 },
  { x: 1320, y: 1204 },
];
/** 광장 안의 나무 (바닥에 화단을 그린다) */
export const PLAZA_TREES: readonly { x: number; y: number }[] = [
  { x: 952, y: 296 },
  { x: 1096, y: 296 },
];
/** 광장 한가운데 소원 우물 */
export const PLAZA_WELL = { x: CX, y: 432 } as const;
export const BELL = { x: 1196, y: 140 } as const;

/** 손으로 놓은 소품 (구역마다). 숲·강가 나무는 scatterProps()가 결정적으로 흩뿌린다 */
const HAND_PROPS: readonly PropDef[] = [
  // ── 정문 앞마당 ──
  P("lantern", 976, 78),
  P("lantern", 1072, 78),
  P("snowPine", 896, 64, 0),
  P("snowPine", 1152, 64, 1),
  P("pine", 868, 92, 1),
  P("bush", 1176, 96, 1),
  // 유령 잡화점 둘레
  P("lantern", 800, 172),
  P("bush", 884, 150, 2),
  P("flowers", 792, 150, 1),
  // 종루
  P("bell", BELL.x, BELL.y),
  P("ginkgo", 1236, 128, 0),
  // ── 성황당 (언덕 동쪽 기슭) ──
  P("shrineTree", SHRINE_TREE.x, SHRINE_TREE.y),
  P("cairn", SHRINE_CAIRN.x, SHRINE_CAIRN.y, 0),
  P("cairn", SHRINE.x - 28, SHRINE.y - 2, 1),
  P("maple", 700, 96, 1),
  P("leaves", 676, 118, 0),
  // ── 별 보기 언덕 ── 눈 쌓인 소나무, 돗자리, 석등
  P("snowPine", 60, 60, 0),
  P("snowPine", 150, 52, 1),
  P("snowPine", 252, 62, 0),
  P("snowPine", 420, 56, 1),
  P("snowPine", 52, 176, 1),
  P("snowPine", 424, 196, 0),
  P("pine", 330, 72, 0),
  P("deadTree", 196, 92, 1),
  P("maple", 300, 176, 0),
  P("mat", 352, 230, 0),
  P("mat", 236, 196, 1),
  P("lantern", 300, 248),
  P("lantern", 104, 268),
  P("hammock", HAMMOCKS[3].x, HAMMOCKS[3].y),
  // ── 서쪽 쉼터 ──
  P("maple", 584, 410, 0),
  P("ginkgo", 772, 472, 1),
  P("autumn", 572, 600, 1),
  P("jar", 604, 512),
  P("lantern", 700, 520),
  P("leaves", 690, 444, 1),
  P("bush", 744, 576, 0),
  // ── 광장 ── 우물·그네·해먹·나무·석등
  P("well", PLAZA_WELL.x, PLAZA_WELL.y),
  ...SWINGS.slice(0, 2).map((s) => P("swing", s.x, s.y)),
  P("hammock", HAMMOCKS[0].x, HAMMOCKS[0].y),
  P("hammock", HAMMOCKS[1].x, HAMMOCKS[1].y),
  P("ginkgo", 952, 296, 0),
  P("maple", 1096, 296, 1),
  P("autumn", 820, 452, 0),
  P("ginkgo", 1228, 456, 1),
  P("lantern", 812, 268),
  P("lantern", 1236, 268),
  P("lantern", 812, 600),
  P("lantern", 1236, 600),
  P("flowers", 968, 452, 2),
  P("flowers", 1080, 452, 0),
  P("jar", 976, 380),
  P("leaves", 1150, 520, 0),
  P("leaves", 900, 520, 1),
  P("flowers", 1000, 500, 1),
  P("flowers", 1048, 500, 2),
  P("pumpkin", 1162, 372, 0),
  P("pumpkin", 886, 470, 1),
  P("lantern", 976, 420),
  P("lantern", 1072, 420),
  P("bush", 1220, 330, 1),
  P("bush", 830, 420, 0),
  // 광장 밖 모서리 나무
  P("maple", 780, 236, 1),
  P("autumn", 1268, 228, 0),
  P("ginkgo", 780, 640, 0),
  P("maple", 1268, 640, 1),
  // ── 광장 남쪽 잔디 (모닥불C) ──
  P("maple", 900, 690, 0),
  P("ginkgo", 1236, 700, 1),
  P("pumpkin", 960, 712, 0),
  P("pumpkin", 976, 718, 1),
  P("leaves", 1080, 724, 0),
  P("jar", 1100, 664),
  // ── 작은 묘역 ── 마른 나무·석등·돌무더기 (묘비는 GraveField)
  P("deadTree", 110, 410, 0),
  P("deadTree", 500, 410, 1),
  P("deadTree", 108, 650, 1),
  P("lantern", 280, 404),
  P("lantern", 328, 404),
  P("lantern", 520, 506),
  P("cairn", 492, 652, 0),
  P("bush", 120, 520, 2),
  P("bush", 490, 580, 1),
  P("leaves", 220, 668, 1),
  P("leaves", 390, 668, 0),
  // ── 주거 구역 ── 골목 가로등, 골목 끝 나무
  P("lamp", 1432, 336),
  P("lamp", 1432, 484),
  P("lamp", 1432, 632),
  P("lamp", 2004, 336),
  P("lamp", 2004, 484),
  P("lamp", 2004, 632),
  P("lantern", 1320, 254),
  P("maple", 1400, 700, 0),
  P("ginkgo", 1660, 700, 1),
  P("autumn", 1960, 704, 0),
  P("pumpkin", 1600, 712, 0),
  P("leaves", 1720, 712, 1),
  // ── 사냥터 동굴 둘레 ──
  P("snowPine", 1712, 60, 0),
  P("pine", 1840, 64, 1),
  P("snowPine", 1984, 60, 1),
  P("deadTree", 1990, 150, 0),
  P("cairn", 1640, 164, 1),
  // ── 강변 (북쪽 둑) ──
  P("lantern", 1276, 832),
  P("reeds", 1340, 852, 1),
  P("reeds", 1450, 870, 0),
  P("reeds", 600, 856, 0),
  P("reeds", 120, 850, 1),
  P("reeds", 880, 848, 0),
  // 나루터에 매어 둔 조각배 (배 작업이 이어 쓴다)
  P("boat", BOAT_MOORING.x, BOAT_MOORING.y),
  // ── 강 건너 ──
  P("hammock", HAMMOCKS[2].x, HAMMOCKS[2].y),
  P("swing", SWINGS[2].x, SWINGS[2].y),
  P("scarecrow", 880, 1152),
  P("pumpkin", 856, 1168, 0),
  P("pumpkin", 904, 1172, 1),
  P("pumpkin", 868, 1188, 1),
  P("flowers", 920, 1150, 1),
  P("reeds", 760, 930, 1),
  P("reeds", 1160, 930, 0),
  P("reeds", 1500, 950, 1),
  P("lantern", 1548, 1080),
  P("jar", 1250, 1150),
  // 호숫가 갈대
  P("reeds", 1600, 1030, 0),
  P("reeds", 1640, 1196, 1),
  P("reeds", 1900, 990, 0),
  P("reeds", 1996, 1110, 1),
  P("reeds", 1880, 1214, 0),
];

/** 사각형 안 결정적 산포 */
function scatter(out: PropDef[], r: Rect, n: number, salt: number, pick: (u: number) => PropKind, minGap: number): void {
  for (let i = 0; i < n * 6 && n > 0; i++) {
    const x = Math.round(r.x + h01(i, salt, 3) * r.w);
    const y = Math.round(r.y + h01(i, salt, 7) * r.h);
    const kind = pick(h01(i, salt, 11));
    if (!freeForProp(out, x, y, isTree(kind) ? minGap : 12)) continue;
    out.push({ kind, x, y, variant: Math.floor(h01(i, salt, 13) * 3) });
    n--;
  }
}

/** 길·물·좌석·특별한 자리·다른 소품과 겹치지 않는 자리인지 */
function freeForProp(placed: readonly PropDef[], x: number, y: number, gap: number): boolean {
  if (x < WALL_THICKNESS + 10 || x > MAP_WIDTH - WALL_THICKNESS - 10 || y < WALL_THICKNESS + 30 || y > MAP_HEIGHT - TILE - 4) return false;
  if (inWaterBody(x, y, 10) || inWaterBody(x, y - 10, 4)) return false;
  for (const d of DECKS) if (inRect(d, x, y, 14)) return false;
  const k = groundKind(Math.floor(x / TILE), Math.floor(y / TILE));
  if (k !== "grass" && k !== "hill") return false;
  for (const s of SEATS) if (Math.hypot(s.x - x, s.y - y) < 22) return false;
  for (const c of CAMPFIRES) if (Math.hypot(c.x - x, c.y - y) < 44) return false;
  for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < (isTree(p.kind) ? gap : 12)) return false;
  for (const p of HAND_PROPS) if (Math.hypot(p.x - x, p.y - y) < (isTree(p.kind) || p.kind === "hammock" || p.kind === "swing" ? gap : 14)) return false;
  return true;
}

function forestKind(u: number): PropKind {
  return u < 0.28 ? "pine" : u < 0.42 ? "snowPine" : u < 0.6 ? "maple" : u < 0.74 ? "ginkgo" : u < 0.86 ? "deadTree" : u < 0.93 ? "bush" : "mushroom";
}
function meadowKind(u: number): PropKind {
  return u < 0.18 ? "maple" : u < 0.32 ? "ginkgo" : u < 0.4 ? "autumn" : u < 0.55 ? "leaves" : u < 0.7 ? "bush" : u < 0.82 ? "flowers" : "mushroom";
}

function buildProps(): PropDef[] {
  const out: PropDef[] = [];
  // 강 건너 숲 (채집 자리 예정): 빽빽한 나무, 가운데 빈터는 비운다
  const forest: Rect = { x: 48, y: 952, w: 556, h: 420 };
  const clearing = { x: 330, y: 1160, r: 70 };
  const before = out.length;
  scatter(out, forest, 130, 21, forestKind, 20);
  for (let i = out.length - 1; i >= before; i--) if (Math.hypot(out[i].x - clearing.x, out[i].y - clearing.y) < clearing.r) out.splice(i, 1);
  out.push(P("mushroom", clearing.x - 14, clearing.y + 6, 0), P("mushroom", clearing.x + 18, clearing.y - 10, 1), P("cairn", clearing.x, clearing.y - 26, 0));
  // 강 건너 풀밭·호숫가
  scatter(out, { x: 640, y: 960, w: 920, h: 400 }, 70, 23, meadowKind, 34);
  scatter(out, { x: 1600, y: 1230, w: 400, h: 150 }, 10, 29, meadowKind, 36);
  // 강변 둑 (북쪽)
  scatter(out, { x: 48, y: 720, w: 1400, h: 70 }, 26, 31, meadowKind, 40);
  // 주거 구역 아래 ~ 호수 사이 풀밭
  scatter(out, { x: 1440, y: 670, w: 560, h: 280 }, 16, 37, meadowKind, 40);
  // 언덕 위 (눈 덮인 대지)
  scatter(out, { x: 48, y: 72, w: 384, h: 200 }, 10, 41, (u) => (u < 0.45 ? "snowPine" : u < 0.6 ? "deadTree" : u < 0.8 ? "bush" : "leaves"), 30);
  // 동굴·쉼터 사이 (북동쪽)
  scatter(out, { x: 1600, y: 70, w: 400, h: 100 }, 8, 43, (u) => (u < 0.5 ? "snowPine" : u < 0.7 ? "pine" : "bush"), 34);
  return out;
}

/** 맵의 모든 정적 소품 (손으로 놓은 것 + 결정적으로 흩뿌린 것) */
export const WORLD_PROPS: readonly PropDef[] = [...HAND_PROPS, ...TABLES.map((t) => P("table", t.x, t.y))];
let scattered: PropDef[] | null = null;
export function allProps(): readonly PropDef[] {
  if (!scattered) scattered = [...WORLD_PROPS, ...buildProps()];
  return scattered;
}
/** @deprecated 예전 이름 (위쪽 고정 구역). 이제 맵 전체가 고정이라 allProps()와 같다 */
export const UPPER_PROPS = WORLD_PROPS;

/** 소품 충돌 박스 (좌상단 기준). 나무는 줄기만 막는다. 꽃밭·덤불·버섯·갈대·낙엽·그네·해먹·배는 막지 않는다 */
export function propCollider(p: PropDef): Rect | null {
  switch (p.kind) {
    case "tree":
    case "deadTree":
    case "autumn":
    case "maple":
    case "ginkgo":
    case "blossom":
    case "shrineTree":
      return { x: p.x - 4, y: p.y - 5, w: 8, h: 5 };
    case "pine":
    case "snowPine":
      return { x: p.x - 3, y: p.y - 5, w: 6, h: 5 };
    case "lantern":
    case "lamp":
      return { x: p.x - 4, y: p.y - 5, w: 8, h: 5 };
    case "table":
      return { x: p.x - 10, y: p.y - 6, w: 20, h: 6 };
    case "well":
      return { x: p.x - 10, y: p.y - 7, w: 20, h: 7 };
    case "bell":
      return { x: p.x - 10, y: p.y - 5, w: 20, h: 5 };
    case "cairn":
      return { x: p.x - 5, y: p.y - 4, w: 10, h: 4 };
    case "scarecrow":
      return { x: p.x - 2, y: p.y - 3, w: 4, h: 3 };
    case "jar":
    case "pumpkin":
      return { x: p.x - 3, y: p.y - 3, w: 6, h: 3 };
    case "hammock":
      // 양쪽 기둥만 막는다 (가운데 천은 눕는 자리)
      return null;
    case "swing":
    case "bush":
    case "flowers":
    case "mushroom":
    case "leaves":
    case "mat":
    case "reeds":
    case "boat":
      return null;
  }
}

/** 해먹 기둥 (양 끝) */
export const HAMMOCK_HALF = 20;
export function hammockPosts(p: { x: number; y: number }): Rect[] {
  return [
    { x: p.x - HAMMOCK_HALF - 2, y: p.y - 4, w: 4, h: 4 },
    { x: p.x + HAMMOCK_HALF - 2, y: p.y - 4, w: 4, h: 4 },
  ];
}

/** 유령 잡화점 오두막 충돌 박스 (문은 아래 가운데, 문 앞 SHOP_DOOR에서 들어간다) */
export function shopCollider(): Rect {
  return { x: SHOP.x - 28, y: SHOP.y - 18, w: 56, h: 18 };
}

/** 분양 사무소 오두막 충돌 박스 (잡화점과 같은 크기, 문 앞 HOUSING_DOOR) */
export function officeCollider(): Rect {
  return { x: HOUSING_OFFICE.x - 28, y: HOUSING_OFFICE.y - 18, w: 56, h: 18 };
}

/** 언덕 절벽 (남쪽 면은 계단만 비우고, 동쪽 면은 통째로 막는다) */
export function cliffColliders(): Rect[] {
  const y = HILL.y + HILL.h;
  const right = HILL.x + HILL.w;
  return [
    { x: HILL.x, y: y - 2, w: HILL_STAIRS.x - HILL.x, h: HILL_CLIFF + 2 },
    { x: HILL_STAIRS.x + HILL_STAIRS.w, y: y - 2, w: right + HILL_CLIFF - (HILL_STAIRS.x + HILL_STAIRS.w), h: HILL_CLIFF + 2 },
    { x: right, y: HILL.y, w: HILL_CLIFF, h: HILL.h },
  ];
}

/** 집 몸체 충돌 (필지 좌상단 기준, 문 앞은 막지 않게 아래 4px 남김). tier 모르면 가장 큰 집 */
export function houseCollider(lot: { x: number; y: number }, tier = "manor"): Rect {
  const b = facadeInfo({} as Parameters<typeof facadeInfo>[0], tier).body;
  return { x: lot.x + b.x, y: lot.y + b.y, w: b.w, h: b.h - 4 };
}

/** 문 앞에 서 있으면 들어갈 수 있다 */
export const SHOP_ENTER_RADIUS = 12;
export function nearShopDoor(x: number, y: number, radius = SHOP_ENTER_RADIUS): boolean {
  return Math.hypot(x - SHOP_DOOR.x, y - SHOP_DOOR.y) <= radius;
}

/** 빛을 내는 소품의 빛 위치 (받침 기준 dy). 석등 창·가로등·반딧불 항아리 */
export function propLight(p: PropDef): { dy: number; scale: number; tint: number; base: number } | null {
  if (p.kind === "lantern") return { dy: -15, scale: 0.75, tint: 0xffc068, base: 0.7 };
  if (p.kind === "lamp") return { dy: -24, scale: 0.85, tint: 0xffd080, base: 0.75 };
  if (p.kind === "jar") return { dy: -6, scale: 0.4, tint: 0xd8f080, base: 0.55 };
  return null;
}

/** 좌석 수에 따른 벤치 폭 (2인 40, 3인 56, 4인 72) */
export function benchWidth(f: Furniture): number {
  const n = f.seatOffsets.length;
  return n >= 4 ? 72 : n >= 3 ? 56 : 40;
}

export function furnitureCollider(f: Furniture): Rect {
  // 모닥불 둘레: 통나무(2인)는 짧고 낮게, 그루터기는 작게
  if (f.campfire) return f.kind === "bench" ? { x: f.x - 15, y: f.y - 6, w: 30, h: 6 } : { x: f.x - 5, y: f.y - 5, w: 10, h: 5 };
  if (f.kind === "bench") {
    const w = benchWidth(f);
    return { x: f.x - w / 2, y: f.y - 7, w, h: 7 };
  }
  return { x: f.x - 6, y: f.y - 6, w: 12, h: 6 };
}

/** 모닥불 돌 고리 충돌 (불 위로는 못 지나간다, 점프로도) */
export function campfireCollider(c: Campfire): Rect {
  return { x: c.x - 9, y: c.y - 5, w: 18, h: 7 };
}
export function allCampfireColliders(): Rect[] {
  return CAMPFIRES.map(campfireCollider);
}
/** 모닥불 빛 (Atmosphere·조명 패스용, 받침 기준 dy) */
export const CAMPFIRE_LIGHT = { dy: -8, scale: 1.35, tint: 0xffa048, base: 0.95 } as const;

export function allFurnitureColliders(): Rect[] {
  return FURNITURE.map(furnitureCollider);
}

/**
 * 움직이지 않는 충돌 전부 (점프로 못 넘는 것): 소품·해먹 기둥·모닥불·오두막·절벽 (+ 필지의 집 몸체는 houseCollider로 따로).
 * 의자·벤치는 점프로 넘을 수 있어 allFurnitureColliders()로 따로 둔다.
 */
export function staticColliders(): Rect[] {
  const out: Rect[] = [];
  for (const p of allProps()) {
    const c = propCollider(p);
    if (c) out.push(c);
    if (p.kind === "hammock") out.push(...hammockPosts(p));
  }
  out.push(...allCampfireColliders(), shopCollider(), officeCollider(), ...cliffColliders());
  return out;
}

let standRects: Rect[] | null = null;
/**
 * 이 발 위치에 서 있을 수 있는지 (담 안, 충돌·가구·집 몸체 밖). 물속은 괜찮다(헤엄친다).
 * 새로고침 복원처럼 옛 좌표를 받아 쓸 때 확인한다 (맵이 바뀌어 집·나무가 들어선 자리면 false)
 */
export function standable(x: number, y: number): boolean {
  const b = { minX: WALL_THICKNESS, maxX: MAP_WIDTH - WALL_THICKNESS, minY: WALL_THICKNESS + 8, maxY: MAP_HEIGHT - TILE };
  if (!(x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY)) return false;
  standRects ??= [...staticColliders(), ...allFurnitureColliders(), ...HOUSE_LOTS.map((l) => houseCollider(l))];
  // 발 상자 (8×5, 발바닥이 아랫변)
  const fx = x - 4;
  const fy = y - 5;
  for (const r of standRects) if (fx < r.x + r.w && fx + 8 > r.x && fy < r.y + r.h && fy + 5 > r.y) return false;
  return true;
}

/** walkableGrid 칸 값 */
export const WALK = { open: 0, blocked: 1, water: 2 } as const;
export type WalkGrid = { cell: number; cols: number; rows: number; cells: Uint8Array };

/**
 * 길찾기용 격자 (cell px 칸, 기본 8). 0 = 걸을 수 있음, 1 = 막힘(담·절벽·소품·가구·모닥불·오두막·집), 2 = 물(헤엄쳐 지날 수는 있지만 피하는 게 좋다).
 * extra: 그때그때 달라지는 충돌(묘비 GraveField.colliders 등)을 더 막는다. houses: 집이 선 필지 (없으면 모든 필지를 막는다 — 보수적으로)
 * 칸의 가운데 점에 플레이어 발 상자(8×5)를 놓아 충돌에 닿으면 막힘으로 본다.
 */
export function walkableGrid(cell = 8, extra: readonly Rect[] = [], houses?: readonly { lot: number; tier?: string }[]): WalkGrid {
  const cols = Math.ceil(MAP_WIDTH / cell);
  const rows = Math.ceil(MAP_HEIGHT / cell);
  const cells = new Uint8Array(cols * rows);
  // 칸 가운데(발 위치)에 발 상자(가로 8 × 세로 5, 발바닥이 아랫변)를 놓았을 때 충돌에 닿으면 막힘
  const block = (r: Rect) => {
    const c0 = Math.max(0, Math.ceil((r.x - 4 - cell / 2) / cell));
    const c1 = Math.min(cols - 1, Math.floor((r.x + r.w + 4 - cell / 2) / cell));
    const r0 = Math.max(0, Math.ceil((r.y - cell / 2) / cell));
    const r1 = Math.min(rows - 1, Math.floor((r.y + r.h + 5 - cell / 2) / cell));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) cells[y * cols + x] = WALK.blocked;
  };
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = x * cell + cell / 2;
      const py = y * cell + cell / 2;
      if (px < WALL_THICKNESS || px > MAP_WIDTH - WALL_THICKNESS || py < WALL_THICKNESS + 8 || py > MAP_HEIGHT - TILE) cells[y * cols + x] = WALK.blocked;
      else if (inWater(px, py)) cells[y * cols + x] = WALK.water;
    }
  const lots = houses ? houses.map((h) => ({ lot: HOUSE_LOTS[h.lot - 1], tier: h.tier })).filter((h) => h.lot) : HOUSE_LOTS.map((lot) => ({ lot, tier: "manor" }));
  for (const r of [...staticColliders(), ...allFurnitureColliders(), ...extra, ...lots.map((h) => houseCollider(h.lot, h.tier))]) block(r);
  return { cell, cols, rows, cells };
}

// ── 바닥 ──
export type GroundKind = "grass" | "dirt" | "stone" | "cobble" | "grave" | "hill" | "cliff" | "stairs" | "wallTop" | "wallFace" | "wallSide" | "gate";

const MID_TX = MAP_COLS / 2; // 64
/** 정문 (윗담 가운데 4칸) */
export const GATE_TX0 = MID_TX - 2;
export const GATE_TX1 = MID_TX + 1;
const T = (px: number) => Math.floor(px / TILE);
const HILL_TX0 = T(HILL.x);
const HILL_TX1 = T(HILL.x + HILL.w) - 1;
const HILL_TY1 = T(HILL.y + HILL.h) - 1;
const CLIFF_TY = HILL_TY1 + 1;
const CLIFF_TX = HILL_TX1 + 1;
const STAIRS_TX0 = T(HILL_STAIRS.x);
const STAIRS_TX1 = T(HILL_STAIRS.x + HILL_STAIRS.w) - 1;
/** 묘역 땅 (낮은 돌 테두리 안) */
export const GRAVEYARD_RECT: Rect = { x: 96, y: 400, w: 416, h: 264 };
const GY_TX0 = T(GRAVEYARD_RECT.x);
const GY_TX1 = T(GRAVEYARD_RECT.x + GRAVEYARD_RECT.w) - 1;
const GY_TY0 = T(GRAVEYARD_RECT.y);
const GY_TY1 = T(GRAVEYARD_RECT.y + GRAVEYARD_RECT.h) - 1;
const AISLE_TX0 = T(GRAVEYARD_AISLE_X) - 1;
const AISLE_TX1 = T(GRAVEYARD_AISLE_X);
const GRID_TY0 = GRID_Y0 / TILE;
/** 광장 포석 (모서리 한 칸씩 둥글게) */
export const PLAZA_RECT: Rect = { x: 800, y: 256, w: 448, h: 352 };
const PZ_TX0 = T(PLAZA_RECT.x);
const PZ_TX1 = T(PLAZA_RECT.x + PLAZA_RECT.w) - 1;
const PZ_TY0 = T(PLAZA_RECT.y);
const PZ_TY1 = T(PLAZA_RECT.y + PLAZA_RECT.h) - 1;
const NORTH_ROAD_TY = [11, 12];
const PROMENADE_TY = 50;
const SOUTH_PATH_TY = 66;
const HOUSE_TX0 = T(HOUSE_LOTS[0].x) - 1;
const HOUSE_TX1 = T(HOUSE_LOTS[HOUSE_LOTS.length - 1].x + HOUSE_LOT_W);
/** 집 앞 골목 (필지 줄마다 아래로 한 줄) */
const STREET_TYS: readonly number[] = [...new Set(HOUSE_LOTS.map((l) => T(l.y + HOUSE_LOT_H)))].flatMap((ty) => [ty, ty + 1]);

/** 묘비 행 사이 가로 오솔길 (묘비 받침 바로 아래) */
export function isRowPathTile(ty: number): boolean {
  const y = ty * TILE;
  if (y < GRID_Y0 || y > GRID_Y0 + GRID_ROWS * GRID_DY) return false;
  return (y - GRID_Y0 - TILE) % GRID_DY === 0;
}

const between = (v: number, a: number, b: number) => v >= a && v <= b;

export function groundKind(tx: number, ty: number): GroundKind {
  const lastCol = MAP_COLS - 1;
  if (ty <= 1) {
    if (tx >= GATE_TX0 && tx <= GATE_TX1) return "gate";
    return ty === 0 ? "wallTop" : "wallFace";
  }
  if (ty >= MAP_ROWS - 1) return "wallFace";
  if (tx <= 1 || tx >= lastCol - 1) return "wallSide";
  // ── 별 보기 언덕 ──
  if (between(tx, HILL_TX0, HILL_TX1) && ty <= HILL_TY1) return "hill";
  if (ty === CLIFF_TY && between(tx, HILL_TX0, CLIFF_TX)) return between(tx, STAIRS_TX0, STAIRS_TX1) ? "stairs" : "cliff";
  if (tx === CLIFF_TX && ty <= CLIFF_TY) return "cliff";
  // 계단 아래 → 묘역 북문 길
  if (between(tx, STAIRS_TX0, STAIRS_TX1) && between(ty, CLIFF_TY + 1, GY_TY0)) return "dirt";
  // ── 정문 앞마당 + 가운데 길 (정문 → 광장 → 강 → 가운데 다리) ──
  if (between(ty, 2, 5) && between(tx, MID_TX - 5, MID_TX + 4)) return "dirt";
  if (between(tx, MID_TX - 1, MID_TX) && (ty < PZ_TY0 || between(ty, PZ_TY1 + 1, 53) || between(ty, 57, SOUTH_PATH_TY))) return "dirt";
  // ── 광장 ──
  if (between(tx, PZ_TX0, PZ_TX1) && between(ty, PZ_TY0, PZ_TY1)) {
    const corner = (tx === PZ_TX0 || tx === PZ_TX1) && (ty === PZ_TY0 || ty === PZ_TY1);
    if (!corner) return "stone";
  }
  // ── 북쪽 길 (언덕 동쪽 ~ 동쪽 담) ──
  if (NORTH_ROAD_TY.includes(ty) && tx > CLIFF_TX && tx < lastCol - 1) return "dirt";
  // 잡화점·사무소 문 앞
  if (between(ty, T(SHOP_DOOR.y) - 1, NORTH_ROAD_TY[0]) && Math.abs(tx * TILE + TILE / 2 - SHOP_DOOR.x) < TILE) return "dirt";
  if (between(ty, NORTH_ROAD_TY[1], T(HOUSING_DOOR.y)) && Math.abs(tx * TILE + TILE / 2 - HOUSING_DOOR.x) < TILE) return "dirt";
  // 사냥터 동굴 앞
  if (between(ty, 2, NORTH_ROAD_TY[0]) && between(tx, T(HUNT_GATE.x) - 1, T(HUNT_GATE.x))) return "dirt";
  // 성황당 앞
  if (between(ty, T(SHRINE.y) + 1, NORTH_ROAD_TY[0]) && between(tx, T(SHRINE.x) - 1, T(SHRINE.x))) return "dirt";
  // ── 주거 구역: 골목(돌길)과 서쪽 샛길 ──
  if (between(tx, HOUSE_TX0, HOUSE_TX1) && STREET_TYS.includes(ty)) return "cobble";
  if (tx === HOUSE_TX0 && between(ty, NORTH_ROAD_TY[0], PROMENADE_TY)) return "cobble";
  // 광장 ↔ 주거 구역 골목
  if (between(tx, PZ_TX1 + 1, HOUSE_TX0) && STREET_TYS.slice(0, 2).includes(ty)) return "dirt";
  // 광장 ↔ 서쪽 쉼터 ↔ 묘역 동문
  if (ty === 33 && between(tx, GY_TX1 + 1, PZ_TX0 - 1)) return "dirt";
  // ── 작은 묘역 ──
  if (between(tx, GY_TX0, GY_TX1) && between(ty, GY_TY0, GY_TY1)) {
    if (between(tx, AISLE_TX0, AISLE_TX1)) return "dirt";
    if (ty >= GRID_TY0 - 1 && isRowPathTile(ty) && between(tx, GY_TX0 + 1, GY_TX1 - 1)) return "dirt";
    if (ty === 33 && tx >= AISLE_TX1) return "dirt";
    return "grave";
  }
  // ── 강변 산책로 + 다리·나루터로 내려가는 길 ──
  if (ty === PROMENADE_TY && tx >= 2 && tx <= T(1560)) return "dirt";
  for (const b of BRIDGES) {
    const bt = T(b.x);
    if (between(tx, bt - 1, bt) && (between(ty, PROMENADE_TY, T(b.y0)) || between(ty, T(b.y1), SOUTH_PATH_TY))) return "dirt";
  }
  if (between(tx, T(DOCK_DECK.x), T(DOCK_DECK.x + DOCK_DECK.w)) && between(ty, PROMENADE_TY, T(DOCK_DECK.y))) return "dirt";
  if (between(tx, T(296) - 1, T(296)) && (between(ty, PROMENADE_TY, T(846)) || between(ty, T(900), T(940)))) return "dirt";
  // ── 강 건너 오솔길 (다리 → 풀밭 → 호수 잔교) ──
  if (ty === SOUTH_PATH_TY && between(tx, T(296), T(LAKE_PIER.x))) return "dirt";
  return "grass";
}

// ── 상호작용 오브젝트 (E/탭) ── WorldScene이 가장 가까운 것을 골라 안내 문구를 띄우고 상호작용한다.
export type InteractKind = "tree" | "swing" | "hammock" | "bell" | "well" | "water" | "portal" | "door" | "lot" | "dock";
export type PortalKind = "hunt" | "housing" | "shrine";
export type Interactable = {
  id: string;
  kind: InteractKind;
  /** 판정 중심 (플레이어 발 기준) */
  x: number;
  y: number;
  /** 판정 반경 */
  r: number;
  /** 상호작용 자리: tree = 매달릴 때 발 위치(줄기 앞), swing = 그네 좌석, hammock = 눕는 자리(천 가운데), 나머지 = (x,y) */
  ax: number;
  ay: number;
  portal?: PortalKind;
  /** 주거 구역: 집 문(door)이면 그 집 id, 빈 필지 팻말(lot)이면 번지 */
  houseId?: string;
  lot?: number;
  /** 안내 문구 (예: "매달리기", "종 치기", "사냥터 들어가기") */
  label: string;
};

const PORTALS: readonly Interactable[] = [
  { id: "portal:hunt", kind: "portal", portal: "hunt", x: HUNT_GATE.x, y: HUNT_GATE.y, r: PORTAL_RADIUS, ax: HUNT_GATE.x, ay: HUNT_GATE.y, label: "사냥터 들어가기" },
  { id: "portal:housing", kind: "portal", portal: "housing", x: HOUSING_DOOR.x, y: HOUSING_DOOR.y, r: PORTAL_RADIUS, ax: HOUSING_DOOR.x, ay: HOUSING_DOOR.y, label: "분양 사무소 들어가기" },
  { id: "portal:shrine", kind: "portal", portal: "shrine", x: SHRINE.x, y: SHRINE.y, r: PORTAL_RADIUS, ax: SHRINE.x, ay: SHRINE.y, label: "성황당에 소원 빌기" },
  { id: "dock:ferry", kind: "dock", x: FERRY_DOCK.x, y: FERRY_DOCK.y, r: 14, ax: FERRY_DOCK.x, ay: FERRY_DOCK.y, label: "나루터 · 조각배 타기" },
];

/** 해먹에 누운 사람 발 기준 자리 (천 가운데, 받침보다 위) */
export const HAMMOCK_LIFT = 5;

/** 소품 → 상호작용 대상 (매달릴 나무·그네·해먹·종루·우물). 없으면 null */
export function propInteractable(p: PropDef): Interactable | null {
  const id = `${p.kind}:${p.x}:${p.y}`;
  if (isLiveTree(p.kind)) return { id, kind: "tree", x: p.x, y: p.y + 6, r: 14, ax: p.x, ay: p.y + 6, label: "매달리기" };
  switch (p.kind) {
    case "swing":
      return { id, kind: "swing", x: p.x, y: p.y + 1, r: 16, ax: p.x, ay: p.y - 4, label: "그네 타기" };
    case "hammock":
      return { id, kind: "hammock", x: p.x, y: p.y + 4, r: 18, ax: p.x, ay: p.y - HAMMOCK_LIFT, label: "해먹에 눕기" };
    case "bell":
      return { id, kind: "bell", x: p.x, y: p.y + 8, r: 16, ax: p.x, ay: p.y + 8, label: "종 치기" };
    case "well":
      return { id, kind: "well", x: p.x, y: p.y + 8, r: 16, ax: p.x, ay: p.y + 8, label: "우물에 동전 던지기" };
    default:
      return null;
  }
}

/** 고정 맵의 상호작용 오브젝트 (id는 좌표 기반이라 늘 같다). 집 문·빈 필지는 WorldMap이 마을 정보를 받아 더한다 */
let fixedItems: Interactable[] | null = null;
export function interactables(): Interactable[] {
  if (!fixedItems) {
    const out: Interactable[] = [...PORTALS];
    for (const p of allProps()) {
      const i = propInteractable(p);
      if (i) out.push(i);
    }
    fixedItems = out;
  }
  return fixedItems.slice();
}

/** 주거 구역 필지의 상호작용: 집이 있으면 문, 비었으면 "분양 문의" 팻말 */
export function lotInteractable(lot: number, house: { id: string; name: string } | null): Interactable | null {
  const l = HOUSE_LOTS[lot - 1];
  if (!l) return null;
  if (house) return { id: `door:${lot}`, kind: "door", x: l.door.x, y: l.door.y + 4, r: 16, ax: l.door.x, ay: l.door.y, houseId: house.id, lot, label: `${house.name} 들어가기` };
  const sx = l.x + HOUSE_LOT_W / 2;
  const sy = l.y + HOUSE_LOT_H - 24;
  return { id: `lot:${lot}`, kind: "lot", x: sx, y: sy + 8, r: 16, ax: sx, ay: sy + 8, lot, label: `${lot}번지 분양 문의` };
}

/** 묘비 자리 (테스트·안내용): 격자 전체 */
export function graveSlots(): { x: number; y: number }[] {
  return Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => graveSlot(i));
}

/** 다리 위인지 */
export function bridgeAt(x: number, y: number): boolean {
  return BRIDGE_DECKS.some((d) => inRect(d, x, y));
}
