import {
  BRIDGES,
  CAMPFIRES,
  DOCK_DECK,
  FERRY_DOCK,
  FURNITURE,
  GRAVE_AREAS,
  HILL,
  HILL_CLIFF,
  HILL_STAIRS,
  HOUSE_LOT_H,
  HOUSE_LOT_W,
  HOUSE_LOTS,
  HOUSING_DOOR,
  HOUSING_OFFICE,
  HUNT_GATE,
  HUNT_SIGN,
  LAKE,
  LAKE_PIER,
  MAP_COLS,
  MAP_HEIGHT,
  MAP_ROWS,
  MAP_WIDTH,
  PIERS,
  PONDS,
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
  TELESCOPE,
  TILE,
  WALL_THICKNESS,
  graveSlot,
  GRAVEYARD_CAPACITY,
  type Campfire,
  type Furniture,
  type GraveArea,
} from "@tomb/protocol";
import { facadeInfo } from "../housing/art";
import { stargazeColliders, stargazeInteractables } from "./life/stargazeLayout";
import { RIDE_KEEPOUT, rideColliders, rideInteractables, WISH_FOUNTAIN } from "./rides";

// 정적 맵 배치 (순수 데이터). 좌석·스폰·특별한 장소·강·연못·필지·묘역 좌표는 packages/protocol/src/world.ts가 원본이고,
// 여기서는 그 사이를 채우는 나무·석등·오래된 묘비·철책·촛불·안개·종루·납골당 등 소품과 바닥 종류, 물(강·호수·연못), 물살, 충돌, 상호작용 대상을 정한다.
// world.test.ts가 겹침(묘비 자리·좌석·길·문 앞·물)과 걸어서 닿는지(BFS)를 검사한다.
//
// 충돌의 원본: staticColliders() (담·절벽·소품·철책·다리 난간·가구·모닥불·오두막·필지의 집 몸체). 묘비 충돌은 GraveField가 따로 둔다.
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
  | "willow"
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
  | "shrineTree"
  // ── F1 묘지 마을 ──
  | "oldGrave"
  | "candle"
  | "crypt"
  | "mist"
  | "sign";
export type PropDef = { kind: PropKind; x: number; y: number; variant: number };

/** 매달릴 수 있는 (잎이 남은) 나무 */
export function isLiveTree(k: PropKind): boolean {
  return k === "tree" || k === "autumn" || k === "maple" || k === "ginkgo" || k === "blossom";
}
const isTree = (k: PropKind) => isLiveTree(k) || k === "deadTree" || k === "pine" || k === "snowPine" || k === "shrineTree" || k === "willow";

// ── 물: 강(가운데 줄 + 폭) + 호수·연못(타원). 다리·나루터·잔교·징검다리 위는 물이 아니다 ──
export type Ellipse = { x: number; y: number; rx: number; ry: number };
export type WaterBody = ({ kind: "ellipse" } & Ellipse) | { kind: "river" };
/** 타원 물 (호수 + 연못들) */
export const ELLIPSES: readonly Ellipse[] = [LAKE, ...PONDS];
export const WATER: readonly WaterBody[] = [{ kind: "river" }, ...ELLIPSES.map((e) => ({ kind: "ellipse" as const, x: e.x, y: e.y, rx: e.rx, ry: e.ry }))];
/** 물살 세기 (px/초). 강에서 수영하면 하류(호수 쪽)로 살짝 떠내려간다 */
export const RIVER_CURRENT = 14;

/** 다리 판자 (물이 아닌 곳) */
export const BRIDGE_DECKS: readonly Rect[] = BRIDGES.map((b) => ({ x: b.x - b.w / 2, y: b.y0, w: b.w, h: b.y1 - b.y0 }));
/** 물 위에 놓인 걸을 수 있는 판자 (다리·나루터·낚시 잔교) */
export const DECKS: readonly Rect[] = [...BRIDGE_DECKS, DOCK_DECK, ...PIERS];

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

/** 타원 물 e의 정규화 거리² (1 이하면 안). grow만큼 넓혀 본다 */
export function ellipseD(e: Ellipse, x: number, y: number, grow = 0): number {
  const dx = (x - e.x) / (e.rx + grow);
  const dy = (y - e.y) / (e.ry + grow);
  return dx * dx + dy * dy;
}
function inEllipses(x: number, y: number, grow: number): boolean {
  for (const e of ELLIPSES) if (ellipseD(e, x, y, grow) <= 1) return true;
  return false;
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
  return riverDist(x, y) <= RIVER_HALF_W + grow || inEllipses(x, y, grow);
}

/** 발밑이 물(강·호수·연못) 안이면 수영. 다리·나루터·잔교·징검다리 위는 물이 아니다 */
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
 * 물살 (px/초). 강 안이면 하류 방향으로 RIVER_CURRENT (가운데가 가장 세고 둑 쪽은 약하다), 호수·연못·물 밖은 0.
 * 돌려주는 객체는 재사용된다 (바로 읽고 버릴 것)
 */
export function waterCurrent(x: number, y: number): { vx: number; vy: number } {
  const d = riverDist(x, y);
  if (d > RIVER_HALF_W || inEllipses(x, y, 0)) return NO_CURRENT;
  const s = SEGS[segHit];
  const k = RIVER_CURRENT * (1 - 0.5 * (d / RIVER_HALF_W));
  current.vx = (s.dx / s.len) * k;
  current.vy = (s.dy / s.len) * k;
  return current;
}

/**
 * 판자 난간 (F13: 다리 끝·옆에서 물에 빠지지 않게). 판자 안쪽 가장자리 2px 두께.
 * 세로 판자(다리·나루터)는 좌우, 가로 판자(잔교)는 위아래에 둘러치고, 물 쪽 끝은 막는다. 뭍에 닿은 끝 8px은 비워 오르내린다.
 */
export const RAIL = 2;
export function deckRails(d: Rect): Rect[] {
  const vertical = d.h >= d.w;
  const wet = (x: number, y: number) => inWaterBody(x, y, 2);
  if (vertical) {
    const topWet = wet(d.x + d.w / 2, d.y + 2);
    const botWet = wet(d.x + d.w / 2, d.y + d.h - 2);
    const y0 = topWet ? d.y : d.y + 8;
    const y1 = botWet ? d.y + d.h : d.y + d.h - 8;
    const out: Rect[] = [
      { x: d.x, y: y0, w: RAIL, h: y1 - y0 },
      { x: d.x + d.w - RAIL, y: y0, w: RAIL, h: y1 - y0 },
    ];
    if (topWet) out.push({ x: d.x, y: d.y, w: d.w, h: RAIL });
    if (botWet) out.push({ x: d.x, y: d.y + d.h - RAIL, w: d.w, h: RAIL });
    return out;
  }
  const leftWet = wet(d.x + 2, d.y + d.h / 2);
  const rightWet = wet(d.x + d.w - 2, d.y + d.h / 2);
  const x0 = leftWet ? d.x : d.x + 8;
  const x1 = rightWet ? d.x + d.w : d.x + d.w - 8;
  const out: Rect[] = [
    { x: x0, y: d.y, w: x1 - x0, h: RAIL },
    { x: x0, y: d.y + d.h - RAIL, w: x1 - x0, h: RAIL },
  ];
  if (leftWet) out.push({ x: d.x, y: d.y, w: RAIL, h: d.h });
  if (rightWet) out.push({ x: d.x + d.w - RAIL, y: d.y, w: RAIL, h: d.h });
  return out;
}
export function allDeckRails(): Rect[] {
  return DECKS.flatMap(deckRails);
}

// ── 묘역 철책 (F1·F4) ── 묘역 사각형 둘레에 쇠 철책, 문 자리는 비운다. 아래 담과 붙은 변은 담이 대신한다.
export type FenceRun = { x0: number; y0: number; x1: number; y1: number };
export type GraveGate = { area: GraveArea["id"]; side: "top" | "bottom" | "left" | "right"; a: number; b: number };
/** 묘역 문 (변, 비우는 구간 [a, b]) */
export const GRAVE_GATES: readonly GraveGate[] = [
  { area: "A", side: "top", a: 224, b: 256 },
  { area: "A", side: "bottom", a: 224, b: 256 },
  { area: "A", side: "right", a: 376, b: 408 },
  { area: "B", side: "top", a: 704, b: 736 },
  { area: "B", side: "left", a: 856, b: 888 },
  { area: "B", side: "right", a: 856, b: 888 },
  { area: "C", side: "top", a: 160, b: 192 },
  { area: "C", side: "right", a: 872, b: 904 },
];
function sideRuns(a: GraveArea, side: GraveGate["side"]): FenceRun[] {
  const r = a.rect;
  const horiz = side === "top" || side === "bottom";
  const fixed = side === "top" ? r.y : side === "bottom" ? r.y + r.h : side === "left" ? r.x : r.x + r.w;
  if (side === "bottom" && fixed >= MAP_HEIGHT - TILE) return []; // 아래 담이 막는다
  const lo = horiz ? r.x : r.y;
  const hi = horiz ? r.x + r.w : r.y + r.h;
  const gaps = GRAVE_GATES.filter((g) => g.area === a.id && g.side === side).sort((p, q) => p.a - q.a);
  const out: FenceRun[] = [];
  let s = lo;
  for (const g of gaps) {
    if (g.a > s) out.push(horiz ? { x0: s, y0: fixed, x1: g.a, y1: fixed } : { x0: fixed, y0: s, x1: fixed, y1: g.a });
    s = g.b;
  }
  if (hi > s) out.push(horiz ? { x0: s, y0: fixed, x1: hi, y1: fixed } : { x0: fixed, y0: s, x1: fixed, y1: hi });
  return out;
}
/** 철책 줄 (가로 y0 = y1, 세로 x0 = x1) */
export const FENCE_RUNS: readonly FenceRun[] = GRAVE_AREAS.flatMap((a) => (["top", "bottom", "left", "right"] as const).flatMap((s) => sideRuns(a, s)));
/** 철책 충돌 (가로는 선 위 3px ~ 아래 1px, 세로는 선 양옆 2px) */
export function fenceCollider(f: FenceRun): Rect {
  return f.y0 === f.y1 ? { x: f.x0, y: f.y0 - 3, w: f.x1 - f.x0, h: 4 } : { x: f.x0 - 2, y: f.y0, w: 4, h: f.y1 - f.y0 };
}
/** 묘역 문 가운데 (문 아치·이름표 자리) */
export function gateCenter(g: GraveGate): { x: number; y: number } {
  const r = GRAVE_AREAS.find((a) => a.id === g.area)!.rect;
  const m = (g.a + g.b) / 2;
  if (g.side === "top") return { x: m, y: r.y };
  if (g.side === "bottom") return { x: m, y: r.y + r.h };
  return { x: g.side === "left" ? r.x : r.x + r.w, y: m };
}
/** 아치(이름표 달린 문)를 세우는 문: 묘역마다 위쪽 문 */
export const ARCH_GATES: readonly GraveGate[] = GRAVE_GATES.filter((g) => g.side === "top");

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
export const SHRINE_TREE = { x: SHRINE.x + 18, y: SHRINE.y - 20 } as const;
export const SHRINE_CAIRN = { x: SHRINE.x - 14, y: SHRINE.y - 14 } as const;

/** 광장 한가운데 큰 모닥불 (CAMPFIRES의 big) */
export const PLAZA_FIRE: Campfire = CAMPFIRES.find((c) => c.big) ?? CAMPFIRES[0];

/** 해먹 (받침 가운데). 1인 자리 — 누워서 흔들흔들 */
export const HAMMOCKS: readonly { x: number; y: number }[] = [
  { x: 548, y: 456 },
  { x: 892, y: 456 },
  { x: 90, y: 172 },
  { x: 560, y: 992 },
];
/** 그네 (받침 가운데) */
export const SWINGS: readonly { x: number; y: number }[] = [
  { x: 568, y: 288 },
  { x: 608, y: 288 },
  { x: 1090, y: 996 },
];
/** 광장 안의 나무 (바닥에 화단을 그린다) */
export const PLAZA_TREES: readonly { x: number; y: number }[] = [
  { x: 556, y: 372 },
  { x: 884, y: 372 },
];
/** 소원 우물 (정문 앞마당 서쪽). 광장 한가운데는 큰 모닥불이 차지했다 */
export const PLAZA_WELL = { x: 616, y: 140 } as const;
/** 종루: 옛 묘역 동쪽, 성황당 위 */
export const BELL = { x: 464, y: 300 } as const;
/** 납골당 (버드나무 묘역 동쪽, 받침 가운데) */
export const CRYPT = { x: 336, y: 872 } as const;

/** 손으로 놓은 소품 (구역마다). 숲·풀밭 나무는 scatterProps()가 결정적으로 흩뿌린다 */
const HAND_PROPS: readonly PropDef[] = [
  // ── 정문 앞마당 ──
  P("lantern", 672, 76),
  P("lantern", 768, 76),
  P("snowPine", 628, 60, 0),
  P("pine", 812, 58, 1),
  P("well", PLAZA_WELL.x, PLAZA_WELL.y),
  // 유령 잡화점 둘레
  P("lantern", 598, 168),
  P("flowers", 528, 168, 1),
  // ── 사냥터 동굴 (F6): 팻말·횃불 석등·돌무더기 ──
  P("sign", HUNT_SIGN.x, HUNT_SIGN.y),
  P("lantern", 836, 66),
  P("lantern", 892, 66),
  P("cairn", 896, 160, 1),
  P("pine", 936, 58, 0),
  P("snowPine", 806, 52, 1),
  // 분양 사무소 옆
  P("lantern", 996, 166),
  // ── 까마귀 연못 ──
  P("deadTree", 1052, 72, 0),
  P("willow", 1384, 64, 1),
  P("reeds", 1116, 138, 0),
  P("reeds", 1330, 72, 1),
  P("reeds", 1332, 144, 0),
  P("mist", 1224, 100, 1),
  // ── 별 보기 언덕 (F3) ── 소나무·마른 나무, 돗자리, 계단 석등, 언덕 위 오래된 비석
  P("pine", 52, 62, 0),
  P("snowPine", 112, 54, 1),
  P("deadTree", 172, 60, 0),
  P("pine", 352, 60, 1),
  P("deadTree", 348, 214, 1),
  P("mat", 196, 152, 0),
  P("mat", 256, 176, 1),
  P("lantern", 208, 230),
  P("lantern", 272, 230),
  P("oldGrave", 60, 132, 4),
  P("cairn", 330, 200, 0),
  P("hammock", HAMMOCKS[2].x, HAMMOCKS[2].y),
  // 달빛 연못
  P("reeds", 500, 150, 1),
  P("reeds", 414, 80, 0),
  P("mist", 456, 118, 0),
  // ── 종루 · 성황당 (옛 묘역 동문 밖) ──
  P("bell", BELL.x, BELL.y),
  P("shrineTree", SHRINE_TREE.x, SHRINE_TREE.y),
  P("cairn", SHRINE_CAIRN.x, SHRINE_CAIRN.y, 0),
  P("cairn", SHRINE.x - 26, SHRINE.y - 22, 1),
  P("candle", SHRINE.x + 12, SHRINE.y - 2, 0),
  P("lantern", 444, 420),
  // ── 옛 묘역 (A) ── 오래된 묘비·십자가, 마른 나무, 촛불, 땅안개 (사람의 묘비는 GraveField)
  P("oldGrave", 96, 318, 0),
  P("oldGrave", 140, 316, 1),
  P("oldGrave", 188, 320, 3),
  P("oldGrave", 292, 318, 2),
  P("oldGrave", 336, 316, 4),
  P("oldGrave", 392, 320, 0),
  P("oldGrave", 72, 500, 2),
  P("oldGrave", 196, 506, 1),
  P("oldGrave", 284, 506, 3),
  P("oldGrave", 412, 500, 4),
  P("deadTree", 62, 304, 0),
  P("deadTree", 424, 530, 1),
  P("candle", 58, 440, 1),
  P("candle", 420, 356, 0),
  P("candle", 226, 488, 0),
  P("candle", 254, 488, 1),
  P("mist", 150, 430, 0),
  P("mist", 330, 420, 1),
  P("mist", 240, 522, 0),
  // ── 모닥불 광장 ── 그네·해먹·나무·석등 (큰 모닥불·분수·놀거리는 따로)
  ...SWINGS.slice(0, 2).map((s) => P("swing", s.x, s.y)),
  P("hammock", HAMMOCKS[0].x, HAMMOCKS[0].y),
  P("hammock", HAMMOCKS[1].x, HAMMOCKS[1].y),
  P("maple", PLAZA_TREES[0].x, PLAZA_TREES[0].y, 0),
  P("ginkgo", PLAZA_TREES[1].x, PLAZA_TREES[1].y, 1),
  P("lantern", 528, 256),
  P("lantern", 912, 256),
  P("lantern", 528, 628),
  P("lantern", 912, 628),
  P("pumpkin", 640, 612, 0),
  P("pumpkin", 652, 620, 1),
  P("pumpkin", 800, 616, 1),
  P("leaves", 660, 560, 0),
  P("leaves", 780, 560, 1),
  P("flowers", 690, 612, 2),
  P("flowers", 752, 612, 0),
  // ── 광장 ↔ 주거 구역 사이 가로등 ──
  P("lamp", 968, 300),
  P("lamp", 968, 440),
  P("lamp", 968, 580),
  P("lamp", 968, 720),
  // ── 강변 (북쪽 둑) · 묘지기 모닥불 ──
  P("willow", 262, 640, 0),
  P("deadTree", 58, 572, 1),
  P("lantern", 420, 646),
  P("lantern", 548, 650),
  P("lantern", 844, 656),
  P("reeds", 92, 678, 1),
  P("reeds", 470, 684, 0),
  P("reeds", 640, 686, 1),
  P("reeds", 772, 694, 0),
  // 남쪽 둑
  P("reeds", 330, 726, 1),
  P("reeds", 516, 740, 0),
  P("reeds", 840, 754, 1),
  // ── 버드나무 묘역 (C) ── 납골당, 수양버들, 오래된 묘비, 촛불
  P("crypt", CRYPT.x, CRYPT.y),
  P("willow", 64, 808, 0),
  P("willow", 384, 948, 1),
  P("oldGrave", 100, 812, 1),
  P("oldGrave", 140, 806, 0),
  P("oldGrave", 230, 808, 3),
  P("oldGrave", 280, 812, 2),
  P("oldGrave", 380, 820, 0),
  P("oldGrave", 300, 950, 1),
  P("oldGrave", 344, 984, 2),
  P("oldGrave", 60, 940, 3),
  P("candle", CRYPT.x - 14, CRYPT.y + 12, 0),
  P("candle", CRYPT.x + 16, CRYPT.y + 12, 1),
  P("candle", 176, 830, 1),
  P("lantern", 150, 796),
  P("lantern", 202, 796),
  P("mist", 150, 920, 1),
  P("mist", 300, 912, 0),
  P("mist", 76, 958, 1),
  // ── 다리 건너 묘역 (B) ──
  P("oldGrave", 624, 812, 1),
  P("oldGrave", 664, 806, 3),
  P("oldGrave", 776, 808, 0),
  P("oldGrave", 828, 812, 2),
  P("oldGrave", 614, 944, 4),
  P("oldGrave", 842, 940, 0),
  P("deadTree", 612, 990, 1),
  P("willow", 840, 990, 0),
  P("lantern", 692, 796),
  P("lantern", 748, 796),
  P("candle", 700, 822, 0),
  P("candle", 742, 822, 1),
  P("candle", 720, 984, 0),
  P("mist", 720, 900, 0),
  P("mist", 640, 966, 1),
  P("mist", 820, 880, 0),
  // ── 안개 숲 · 안개 연못 ──
  P("hammock", HAMMOCKS[3].x, HAMMOCKS[3].y),
  P("mist", 500, 884, 1),
  P("mist", 452, 818, 0),
  P("reeds", 452, 860, 0),
  P("reeds", 548, 916, 1),
  P("mushroom", 420, 940, 0),
  P("mushroom", 584, 830, 1),
  // ── 호박밭 (남동쪽 풀밭) ──
  P("scarecrow", 900, 950),
  P("pumpkin", 884, 972, 0),
  P("pumpkin", 916, 976, 1),
  P("pumpkin", 900, 994, 1),
  P("pumpkin", 932, 990, 0),
  P("swing", SWINGS[2].x, SWINGS[2].y),
  P("lantern", 1092, 920),
  P("jar", 1066, 990),
  // ── 호숫가 · 나루터 ──
  P("lantern", 1222, 806),
  P("lantern", 1266, 806),
  P("reeds", 1150, 850, 1),
  P("reeds", 1392, 860, 0),
  P("reeds", 1214, 994, 1),
  P("mist", 1300, 940, 1),
];

/** 사각형 안 결정적 산포 */
function scatter(out: PropDef[], r: Rect, n: number, salt: number, pick: (u: number) => PropKind, minGap: number): void {
  for (let i = 0; i < n * 8 && n > 0; i++) {
    const x = Math.round(r.x + h01(i, salt, 3) * r.w);
    const y = Math.round(r.y + h01(i, salt, 7) * r.h);
    const kind = pick(h01(i, salt, 11));
    if (!freeForProp(out, x, y, isTree(kind) ? minGap : 12)) continue;
    out.push({ kind, x, y, variant: Math.floor(h01(i, salt, 13) * 3) });
    n--;
  }
}

/** 철책 줄·문에서 떨어져 있는지 (문 앞을 나무가 막지 않게) */
function clearOfFences(x: number, y: number): boolean {
  for (const f of FENCE_RUNS) {
    const c = fenceCollider(f);
    if (inRect(c, x, y, 10)) return false;
  }
  for (const g of GRAVE_GATES) {
    const c = gateCenter(g);
    if (Math.hypot(c.x - x, c.y - y) < 34) return false;
  }
  return true;
}

/** 길·물·좌석·특별한 자리·다른 소품과 겹치지 않는 자리인지 */
function freeForProp(placed: readonly PropDef[], x: number, y: number, gap: number): boolean {
  if (x < WALL_THICKNESS + 10 || x > MAP_WIDTH - WALL_THICKNESS - 10 || y < WALL_THICKNESS + 30 || y > MAP_HEIGHT - TILE - 12) return false;
  if (inWaterBody(x, y, 10) || inWaterBody(x, y - 10, 4)) return false;
  for (const d of DECKS) if (inRect(d, x, y, 14)) return false;
  const k = groundKind(Math.floor(x / TILE), Math.floor(y / TILE));
  if (k !== "grass" && k !== "hill") return false;
  // 길 바로 옆도 피한다 (줄기가 길에 걸치지 않게)
  for (const [dx, dy] of [[-8, 0], [8, 0], [0, -6], [0, 4]]) {
    const n = groundKind(Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE));
    if (n !== "grass" && n !== "hill") return false;
  }
  if (!clearOfFences(x, y)) return false;
  for (const s of SEATS) if (Math.hypot(s.x - x, s.y - y) < (gap > 12 ? 30 : 22)) return false;
  for (const c of CAMPFIRES) if (Math.hypot(c.x - x, c.y - y) < (c.big ? 96 : 44)) return false;
  for (const l of HOUSE_LOTS) if (inRect({ x: l.x, y: l.y, w: HOUSE_LOT_W, h: HOUSE_LOT_H }, x, y, 6)) return false;
  for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < (isTree(p.kind) ? gap : 12)) return false;
  for (const p of HAND_PROPS) if (Math.hypot(p.x - x, p.y - y) < (isTree(p.kind) || p.kind === "hammock" || p.kind === "swing" || p.kind === "crypt" || p.kind === "mat" || p.kind === "oldGrave" ? gap : 14)) return false;
  for (const k of RIDE_KEEPOUT) if (Math.hypot(k.x - x, k.y - y) < k.r) return false; // 50번 광장 놀거리 (rides.ts)
  for (const p of [SHOP, HOUSING_OFFICE, HUNT_SIGN, SHRINE, TELESCOPE, FERRY_DOCK, WISH_FOUNTAIN]) if (Math.hypot(p.x - x, p.y - y) < 44) return false;
  if (Math.hypot(HUNT_GATE.x - x, HUNT_GATE.y - y) < 50) return false;
  return true;
}

function forestKind(u: number): PropKind {
  return u < 0.24 ? "pine" : u < 0.3 ? "snowPine" : u < 0.48 ? "maple" : u < 0.62 ? "ginkgo" : u < 0.78 ? "deadTree" : u < 0.86 ? "willow" : u < 0.94 ? "bush" : "mushroom";
}
function meadowKind(u: number): PropKind {
  return u < 0.24 ? "maple" : u < 0.4 ? "ginkgo" : u < 0.5 ? "autumn" : u < 0.62 ? "deadTree" : u < 0.72 ? "leaves" : u < 0.82 ? "bush" : u < 0.9 ? "flowers" : "mushroom";
}
function treeKind(u: number): PropKind {
  return u < 0.3 ? "maple" : u < 0.52 ? "ginkgo" : u < 0.64 ? "autumn" : u < 0.82 ? "deadTree" : "pine";
}

function buildProps(): PropDef[] {
  const out: PropDef[] = [];
  // 안개 숲 (안개 연못 둘레): 빽빽하고 으스스하게
  scatter(out, { x: 404, y: 790, w: 192, h: 214 }, 16, 21, forestKind, 22);
  // 언덕 위 (서리 내린 대지)
  scatter(out, { x: 48, y: 48, w: 300, h: 176 }, 6, 41, (u) => (u < 0.45 ? "pine" : u < 0.75 ? "deadTree" : "bush"), 30);
  // 까마귀 연못 둘레 ~ 동쪽 담
  scatter(out, { x: 1000, y: 40, w: 400, h: 130 }, 10, 43, treeKind, 30);
  // 강변 (북쪽 둑)·남쪽 둑
  scatter(out, { x: 40, y: 560, w: 470, h: 90 }, 9, 31, meadowKind, 30);
  scatter(out, { x: 40, y: 742, w: 880, h: 38 }, 10, 33, treeKind, 30);
  // 호박밭·호숫가
  scatter(out, { x: 864, y: 860, w: 240, h: 146 }, 7, 37, meadowKind, 32);
  scatter(out, { x: 1100, y: 786, w: 300, h: 30 }, 3, 39, treeKind, 34);
  // 광장 ↔ 주거 구역 사이, 정문 둘레
  scatter(out, { x: 930, y: 220, w: 42, h: 520 }, 6, 47, treeKind, 34);
  scatter(out, { x: 380, y: 196, w: 140, h: 80 }, 4, 51, treeKind, 30);
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

/** 소품 충돌 박스 (좌상단 기준). 나무는 줄기만 막는다. 꽃밭·덤불·버섯·갈대·낙엽·그네·해먹·배·촛불·안개는 막지 않는다 */
export function propCollider(p: PropDef): Rect | null {
  switch (p.kind) {
    case "tree":
    case "deadTree":
    case "autumn":
    case "maple":
    case "ginkgo":
    case "blossom":
    case "shrineTree":
    case "willow":
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
    case "sign":
      return { x: p.x - 2, y: p.y - 3, w: 4, h: 3 };
    case "jar":
    case "pumpkin":
      return { x: p.x - 3, y: p.y - 3, w: 6, h: 3 };
    case "oldGrave":
      return { x: p.x - 4, y: p.y - 4, w: 8, h: 4 };
    case "crypt":
      return { x: p.x - 28, y: p.y - 12, w: 56, h: 12 };
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
    case "candle":
    case "mist":
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

/** 언덕 절벽 (남쪽 면은 계단만 비우고, 동쪽 비탈은 통째로 막는다). 남쪽 절벽은 두 칸(HILL_CLIFF) 높이 */
export function cliffColliders(): Rect[] {
  const y = HILL.y + HILL.h;
  const right = HILL.x + HILL.w;
  return [
    { x: HILL.x, y: y - 2, w: HILL_STAIRS.x - HILL.x, h: HILL_CLIFF + 2 },
    { x: HILL_STAIRS.x + HILL_STAIRS.w, y: y - 2, w: right + TILE - (HILL_STAIRS.x + HILL_STAIRS.w), h: HILL_CLIFF + 2 },
    { x: right, y: HILL.y, w: TILE, h: HILL.h + HILL_CLIFF },
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

/** 빛을 내는 소품의 빛 위치 (받침 기준 dy). 석등 창·가로등·반딧불 항아리·촛불 */
export function propLight(p: PropDef): { dy: number; scale: number; tint: number; base: number } | null {
  if (p.kind === "lantern") return { dy: -15, scale: 0.75, tint: 0xffc068, base: 0.7 };
  if (p.kind === "lamp") return { dy: -24, scale: 0.85, tint: 0xffd080, base: 0.75 };
  if (p.kind === "jar") return { dy: -6, scale: 0.4, tint: 0xd8f080, base: 0.55 };
  if (p.kind === "candle") return { dy: -6, scale: 0.42, tint: 0xffb860, base: 0.6 };
  if (p.kind === "crypt") return { dy: -20, scale: 0.5, tint: 0x9fb8ff, base: 0.35 };
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

/** 모닥불 돌 고리 충돌 (불 위로는 못 지나간다, 점프로도). 큰 모닥불은 화덕이 넓다 */
export function campfireCollider(c: Campfire): Rect {
  return c.big ? { x: c.x - 26, y: c.y - 10, w: 52, h: 14 } : { x: c.x - 9, y: c.y - 5, w: 18, h: 7 };
}
export function allCampfireColliders(): Rect[] {
  return CAMPFIRES.map(campfireCollider);
}
/** 모닥불 빛 (Atmosphere·조명 패스용, 받침 기준 dy) */
export const CAMPFIRE_LIGHT = { dy: -8, scale: 1.35, tint: 0xffa048, base: 0.95 } as const;
/** 큰 모닥불 빛: 광장 전체를 따뜻하게 */
export const BIG_FIRE_LIGHT = { dy: -18, scale: 3.4, tint: 0xffa048, base: 1 } as const;

export function allFurnitureColliders(): Rect[] {
  return FURNITURE.map(furnitureCollider);
}

/**
 * 움직이지 않는 충돌 전부 (점프로 못 넘는 것): 소품·해먹 기둥·모닥불·오두막·절벽·철책·판자 난간 (+ 필지의 집 몸체는 houseCollider로 따로).
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
  out.push(...FENCE_RUNS.map(fenceCollider)); // F1 묘역 철책
  out.push(...allDeckRails()); // F13 다리·나루터·잔교 난간
  out.push(...stargazeColliders()); // 22번 별 보기 언덕 망원경 (life/stargazeLayout.ts)
  out.push(...rideColliders()); // 50번 광장 놀거리 받침 (rides.ts)
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
 * 길찾기용 격자 (cell px 칸, 기본 8). 0 = 걸을 수 있음, 1 = 막힘(담·절벽·소품·가구·모닥불·오두막·집·철책), 2 = 물(헤엄쳐 지날 수는 있지만 피하는 게 좋다).
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
export type GroundKind =
  | "grass"
  | "dirt"
  | "gravel"
  | "stone"
  | "cobble"
  | "grave"
  | "hill"
  | "cliff"
  | "stairs"
  | "wallTop"
  | "wallFace"
  | "wallSide"
  | "gate";

const MID_TX = MAP_COLS / 2; // 45
/** 정문 (윗담 가운데 4칸) */
export const GATE_TX0 = MID_TX - 2;
export const GATE_TX1 = MID_TX + 1;
const T = (px: number) => Math.floor(px / TILE);
const HILL_TX0 = T(HILL.x);
const HILL_TX1 = T(HILL.x + HILL.w) - 1;
const HILL_TY1 = T(HILL.y + HILL.h) - 1;
const CLIFF_TY0 = HILL_TY1 + 1;
const CLIFF_TY1 = HILL_TY1 + HILL_CLIFF / TILE;
const CLIFF_TX = HILL_TX1 + 1;
const STAIRS_TX0 = T(HILL_STAIRS.x);
const STAIRS_TX1 = T(HILL_STAIRS.x + HILL_STAIRS.w) - 1;
/** 옛 묘역(A) 땅 — 예전 이름 (묘역이 하나이던 때). 묘역 전부는 GRAVE_AREAS */
export const GRAVEYARD_RECT: Rect = GRAVE_AREAS[0].rect;
/** 광장 포석 (모서리 한 칸씩 둥글게) */
export const PLAZA_RECT: Rect = { x: 512, y: 240, w: 416, h: 400 };
const PZ_TX0 = T(PLAZA_RECT.x);
const PZ_TX1 = T(PLAZA_RECT.x + PLAZA_RECT.w) - 1;
const PZ_TY0 = T(PLAZA_RECT.y);
const PZ_TY1 = T(PLAZA_RECT.y + PLAZA_RECT.h) - 1;
const NORTH_ROAD_TY = [11, 12];
/** 강변 산책로 (북쪽 둑) */
const PROMENADE_TY = 41;
/** 강 건너 오솔길 (버드나무 묘역 → 다리 건너 묘역) */
const SOUTH_PATH_TY = 48;
const HOUSE_TX0 = T(HOUSE_LOTS[0].x) - 2;
const HOUSE_TX1 = MAP_COLS - 3;
/** 집 앞 골목 (필지 줄마다 아래로 두 줄) */
const STREET_TYS: readonly number[] = [...new Set(HOUSE_LOTS.map((l) => T(l.y + HOUSE_LOT_H)))].flatMap((ty) => [ty, ty + 1]);
const LAST_STREET_TY = STREET_TYS[STREET_TYS.length - 1];

type AreaTiles = { a: GraveArea; tx0: number; tx1: number; ty0: number; ty1: number; aisle0: number; aisle1: number; rowTys: number[] };
const AREA_TILES: readonly AreaTiles[] = GRAVE_AREAS.map((a) => ({
  a,
  tx0: T(a.rect.x),
  tx1: T(a.rect.x + a.rect.w) - 1,
  ty0: T(a.rect.y),
  ty1: T(a.rect.y + a.rect.h) - 1,
  aisle0: T(a.aisleX) - 1,
  aisle1: T(a.aisleX),
  rowTys: Array.from({ length: a.rows }, (_, r) => T(a.y0 + r * a.dy + TILE)),
}));

/** 묘비 행 사이 가로 오솔길 (묘비 받침 바로 아래). 어느 묘역이든 */
export function isRowPathTile(ty: number): boolean {
  return AREA_TILES.some((t) => t.rowTys.includes(ty));
}

const between = (v: number, a: number, b: number) => v >= a && v <= b;

function graveGround(t: AreaTiles, tx: number, ty: number): GroundKind {
  if (between(tx, t.aisle0, t.aisle1)) return "gravel";
  if (t.rowTys.includes(ty) && between(tx, t.tx0 + 1, t.tx1 - 1)) return "gravel";
  // 옆문으로 이어지는 줄 (그 줄 끝까지)
  for (const g of GRAVE_GATES) {
    if (g.area !== t.a.id || (g.side !== "left" && g.side !== "right")) continue;
    if (between(ty, T(g.a) + 1, T(g.b) - 1) && t.rowTys.includes(ty)) return "gravel";
  }
  return "grave";
}

export function groundKind(tx: number, ty: number): GroundKind {
  const lastCol = MAP_COLS - 1;
  if (ty <= 1) {
    if (tx >= GATE_TX0 && tx <= GATE_TX1) return "gate";
    return ty === 0 ? "wallTop" : "wallFace";
  }
  if (ty >= MAP_ROWS - 1) return "wallFace";
  if (tx <= 1 || tx >= lastCol - 1) return "wallSide";
  // ── 별 보기 언덕 (F3): 대지 · 남쪽 두 칸 절벽 · 계단 · 동쪽 비탈 ──
  if (between(tx, HILL_TX0, HILL_TX1) && ty <= HILL_TY1) return "hill";
  if (between(ty, CLIFF_TY0, CLIFF_TY1) && between(tx, HILL_TX0, CLIFF_TX)) return between(tx, STAIRS_TX0, STAIRS_TX1) ? "stairs" : "cliff";
  if (tx === CLIFF_TX && ty <= CLIFF_TY1) return "cliff";
  // 계단 아래 → 옛 묘역 북문
  if (between(tx, STAIRS_TX0, STAIRS_TX1) && ty === CLIFF_TY1 + 1) return "gravel";
  // ── 묘역 세 곳 ──
  for (const t of AREA_TILES) if (between(tx, t.tx0, t.tx1) && between(ty, t.ty0, t.ty1)) return graveGround(t, tx, ty);
  // 옛 묘역 남문 → 강변 산책로
  const A = AREA_TILES[0];
  if (between(tx, A.aisle0, A.aisle1) && between(ty, A.ty1 + 1, PROMENADE_TY - 1)) return "gravel";
  // ── 정문 앞마당 + 가운데 길 (정문 → 광장 → 가운데 다리 → 다리 건너 묘역) ──
  if (between(ty, 2, 5) && between(tx, MID_TX - 5, MID_TX + 4)) return "dirt";
  if (between(tx, MID_TX - 1, MID_TX) && (ty < PZ_TY0 || between(ty, PZ_TY1 + 1, SOUTH_PATH_TY))) return "dirt";
  // ── 모닥불 광장 ──
  if (between(tx, PZ_TX0, PZ_TX1) && between(ty, PZ_TY0, PZ_TY1)) {
    const corner = (tx === PZ_TX0 || tx === PZ_TX1) && (ty === PZ_TY0 || ty === PZ_TY1);
    if (!corner) return "stone";
  }
  // ── 북쪽 길 (언덕 동쪽 ~ 동쪽 담) ──
  if (NORTH_ROAD_TY.includes(ty) && tx > CLIFF_TX && tx < lastCol - 1) return "dirt";
  // 잡화점·사무소 문 앞, 사냥터 동굴 길
  if (between(ty, T(SHOP_DOOR.y), NORTH_ROAD_TY[0]) && Math.abs(tx * TILE + TILE / 2 - SHOP_DOOR.x) < TILE) return "dirt";
  if (between(ty, T(HOUSING_DOOR.y), NORTH_ROAD_TY[0]) && Math.abs(tx * TILE + TILE / 2 - HOUSING_DOOR.x) < TILE) return "dirt";
  if (between(ty, 2, NORTH_ROAD_TY[0]) && between(tx, T(HUNT_GATE.x) - 1, T(HUNT_GATE.x))) return "dirt";
  // ── 주거 구역: 서쪽 골목(세로)과 집 앞 골목(가로) ──
  if (between(tx, HOUSE_TX0, HOUSE_TX0 + 1) && between(ty, NORTH_ROAD_TY[1] + 1, LAST_STREET_TY)) return "cobble";
  if (between(tx, HOUSE_TX0, HOUSE_TX1) && STREET_TYS.includes(ty)) return "cobble";
  // 광장 ↔ 주거 구역 골목 (첫째·셋째 골목 줄)
  if (between(tx, PZ_TX1 + 1, HOUSE_TX0 - 1) && (STREET_TYS.slice(0, 2).includes(ty) || STREET_TYS.slice(4, 6).includes(ty))) return "dirt";
  // 옛 묘역 동문 ↔ 성황당 ↔ 광장
  if (ty === A.rowTys[0] && between(tx, A.tx1 + 1, PZ_TX0 - 1)) return "dirt";
  // ── 강변 산책로 + 다리·징검다리로 내려가는 길 ──
  if (ty === PROMENADE_TY && tx >= 2 && tx <= T(880)) return "dirt";
  for (const b of BRIDGES) {
    const bt = T(b.x);
    if (between(tx, bt - 1, bt) && (between(ty, PROMENADE_TY, T(b.y0)) || between(ty, T(b.y1), SOUTH_PATH_TY))) return "dirt";
  }
  const st = T(STEP_STONES[0].x);
  if (tx === st && (between(ty, PROMENADE_TY, T(STEP_STONES[0].y - 8)) || between(ty, T(STEP_STONES[STEP_STONES.length - 1].y + 8), SOUTH_PATH_TY))) return "dirt";
  // ── 강 건너 오솔길 (버드나무 묘역 북문 → 다리 건너 묘역 북문) ──
  if (ty === SOUTH_PATH_TY && between(tx, T(BRIDGES[0].x) - 1, MID_TX)) return "dirt";
  // 버드나무 묘역 동문 → 안개 숲, 다리 건너 묘역 동문 → 호박밭 모닥불
  const C = AREA_TILES[2];
  if (ty === C.rowTys[0] && between(tx, C.tx1 + 1, C.tx1 + 3)) return "dirt";
  const B = AREA_TILES[1];
  if (ty === B.rowTys[0] && between(tx, B.tx1 + 1, B.tx1 + 5)) return "dirt";
  // 호수: 나루터 선착장 길 (마지막 골목에서), 낚시 잔교 길 (호박밭에서)
  if (between(tx, T(DOCK_DECK.x), T(DOCK_DECK.x + DOCK_DECK.w) - 1) && between(ty, LAST_STREET_TY + 1, T(DOCK_DECK.y))) return "dirt";
  if (ty === T(LAKE_PIER.y + LAKE_PIER.h / 2) && between(tx, T(LAKE_PIER.x) - 4, T(LAKE_PIER.x) - 1)) return "dirt";
  return "grass";
}

// ── 상호작용 오브젝트 (E/탭) ── WorldScene이 가장 가까운 것을 골라 안내 문구를 띄우고 상호작용한다.
export type InteractKind = "tree" | "swing" | "hammock" | "bell" | "well" | "water" | "portal" | "door" | "lot" | "dock" | "wish" | "seesaw" | "trampoline" | "carousel" | "telescope" | "mat" | "forage";
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
  /** 4·32번 낚시·채집 (game/world/forage): "fish:{자리 id}" | "npc:{id}" | "node:{지점 id}" */
  forage?: string;
};

const PORTALS: readonly Interactable[] = [
  { id: "portal:hunt", kind: "portal", portal: "hunt", x: HUNT_GATE.x, y: HUNT_GATE.y, r: PORTAL_RADIUS, ax: HUNT_GATE.x, ay: HUNT_GATE.y, label: "사냥터 들어가기" },
  { id: "portal:housing", kind: "portal", portal: "housing", x: HOUSING_DOOR.x, y: HOUSING_DOOR.y, r: PORTAL_RADIUS, ax: HOUSING_DOOR.x, ay: HOUSING_DOOR.y, label: "분양 사무소 들어가기" },
  { id: "portal:shrine", kind: "portal", portal: "shrine", x: SHRINE.x, y: SHRINE.y, r: PORTAL_RADIUS, ax: SHRINE.x, ay: SHRINE.y, label: "성황당 · 이장한 묘비 보기" },
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
    case "mat":
      // 22번 별 보기 언덕: 돗자리 가운데에 앉는다 (1인 자리, 바닥 앉기)
      return { id, kind: "mat", x: p.x, y: p.y - 3, r: 15, ax: p.x, ay: p.y - 3, label: "돗자리에 앉기" };
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
    out.push(...stargazeInteractables()); // 22번 망원경 (life/stargazeLayout.ts)
    out.push(...rideInteractables()); // 50번 소원 분수·시소·트램펄린·회전목마 (rides.ts)
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

/** 묘비 자리 (테스트·안내용): 세 묘역 전부 */
export function graveSlots(): { x: number; y: number }[] {
  return Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => graveSlot(i));
}

/** 다리 위인지 */
export function bridgeAt(x: number, y: number): boolean {
  return BRIDGE_DECKS.some((d) => inRect(d, x, y));
}

/** 미니맵·안내용 주요 장소 (F17) */
export type Landmark = { id: string; label: string; x: number; y: number; kind: "fire" | "grave" | "shop" | "hunt" | "housing" | "shrine" | "dock" | "telescope" | "wish" | "bell" };
export const LANDMARKS: readonly Landmark[] = [
  { id: "fire", label: "큰 모닥불", x: PLAZA_FIRE.x, y: PLAZA_FIRE.y, kind: "fire" },
  ...GRAVE_AREAS.map((a) => ({ id: `grave${a.id}`, label: a.name, x: a.aisleX, y: a.y0 + a.dy / 2, kind: "grave" as const })),
  { id: "shop", label: "유령 잡화점", x: SHOP.x, y: SHOP.y, kind: "shop" },
  { id: "hunt", label: "사냥터", x: HUNT_GATE.x, y: HUNT_GATE.y + 8, kind: "hunt" },
  { id: "housing", label: "분양 사무소", x: HOUSING_OFFICE.x, y: HOUSING_OFFICE.y, kind: "housing" },
  { id: "shrine", label: "성황당", x: SHRINE.x, y: SHRINE.y, kind: "shrine" },
  { id: "dock", label: "나루터", x: FERRY_DOCK.x, y: FERRY_DOCK.y, kind: "dock" },
  { id: "telescope", label: "망원경", x: TELESCOPE.x, y: TELESCOPE.y, kind: "telescope" },
  { id: "wish", label: "소원 분수", x: WISH_FOUNTAIN.x, y: WISH_FOUNTAIN.y, kind: "wish" },
];
