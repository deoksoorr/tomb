import {
  BRIDGES,
  BUMPER_GATE,
  CAMPFIRES,
  DOCK_DECK,
  DUCK_DOCK,
  DUCK_DOCK_DECK,
  FERRY_DOCK,
  FURNITURE,
  GRAVE_AREAS,
  HILL,
  HILL_CLIFF,
  HILL_GATE,
  LANES,
  HOUSE_LOT_H,
  HOUSE_LOT_W,
  HOUSE_LOTS,
  HOUSE_GRID,
  HOUSE_ROWS,
  houseLot,
  REST_PLAZA,
  WHARF_YARD,
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
  TELESCOPE_2,
  TILE,
  VILLAGE_SCOPES,
  WALL_THICKNESS,
  graveSlot,
  GRAVEYARD_CAPACITY,
  inZoo,
  ZOOKEEPER,
  FERRIS,
  BALLOON_PAD,
  type Campfire,
  type Furniture,
  type GraveArea,
} from "@tomb/protocol";
import { facadeInfo } from "../housing/facadePlan";
import { clampChars, DOOR_NAME_MAX } from "../text/fitLabel";
import { BUS_E_RADIUS, BUS_STOP, fishZoneColliders, inFishZone } from "./fishZone";
import { inSeaStop, SEA_STOP, SEA_STOP_E_RADIUS, seaStopColliders } from "./seaStop";
import { VILLAGE_CAMP_BAY, VILLAGE_SEA_BAY } from "../bus/busBays";
import type { ReachZone } from "../logic/reach";
import { stargazeColliders, stargazeInteractables } from "./life/stargazeLayout";
import { RIDE_KEEPOUT, rideColliders, rideInteractables, WISH_FOUNTAIN } from "./rides";
import { SKY_KEEPOUT, skyColliders, skyInteractables } from "./skyMath";
import { zooColliders, zooGround, ZOOKEEPER_SPOT } from "./zoo/zooLayout";
import { HAUNT_HOUSE, hauntColliders, hauntInteractables } from "../haunt/hauntLayout";
import { TOWER, towerColliders, towerInteractables } from "../tower/towerLayout";
import { BUMPER_KEEPOUT, BUMPER_LANDMARK, bumperColliders, bumperGround, bumperInteractables, inBumperYardTiles } from "../bumper/bumperLayout";
import { lotteryColliders, lotteryInteractables } from "./lotteryKiosk";
import { FURN_STALL, SEASON_STALL, seasonStallColliders, seasonStallInteractables } from "./seasonStallLayout";
import { MUNGNYANG_SELLER, mungnyangColliders, mungnyangInteractables } from "./mungnyangLayout";
import { OFFICE_STALL, officeColliders, officeInteractables } from "./officeStallLayout";

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
export const DECKS: readonly Rect[] = [...BRIDGE_DECKS, DOCK_DECK, ...PIERS, DUCK_DOCK_DECK];

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
  // 11/19 옛 묘역은 언덕 위 — 문은 별 보기 마당 쪽(동쪽) 하나, 묘비 둘째 줄 오솔길과 줄을 맞춘다 (북문 아치·계단·남문은 없앴다)
  { area: "A", side: "right", a: 120, b: 152 },
  // 예전 버드나무 묘역(C)의 문 자리는 동물원 정문·동문, 다리 건너 묘역(B)은 범퍼카장이 됐다 (11/16, bumper/bumperLayout.ts)
];
function sideRuns(r: GraveArea["rect"], gates: readonly GraveGate[], side: GraveGate["side"]): FenceRun[] {
  const horiz = side === "top" || side === "bottom";
  const fixed = side === "top" ? r.y : side === "bottom" ? r.y + r.h : side === "left" ? r.x : r.x + r.w;
  if (side === "bottom" && fixed >= MAP_HEIGHT - TILE) return []; // 아래 담이 막는다
  const lo = horiz ? r.x : r.y;
  const hi = horiz ? r.x + r.w : r.y + r.h;
  const gaps = gates.filter((g) => g.side === side).sort((p, q) => p.a - q.a);
  const out: FenceRun[] = [];
  let s = lo;
  for (const g of gaps) {
    if (g.a > s) out.push(horiz ? { x0: s, y0: fixed, x1: g.a, y1: fixed } : { x0: fixed, y0: s, x1: fixed, y1: g.a });
    s = g.b;
  }
  if (hi > s) out.push(horiz ? { x0: s, y0: fixed, x1: hi, y1: fixed } : { x0: fixed, y0: s, x1: fixed, y1: hi });
  return out;
}
const SIDES = ["top", "bottom", "left", "right"] as const;
/** 철책 줄 (가로 y0 = y1, 세로 x0 = x1) */
export const FENCE_RUNS: readonly FenceRun[] = GRAVE_AREAS.flatMap((a) => SIDES.flatMap((s) => sideRuns(a.rect, GRAVE_GATES.filter((g) => g.area === a.id), s)));
/**
 * 11/16 예전 다리 건너 묘역(지금 범퍼카장)의 철책·문·소품 자리. 그리지도 막지도 않고, 흩뿌리는 나무(scatter)를 둘 때만 예전처럼 비운다
 * — 범퍼카장 둘레 숲·호박밭·강둑의 나무 자리가 한 그루도 바뀌지 않게
 */
const OLD_B_RECT = { x: 600, y: 784, w: 256, h: 224 } as const;
const OLD_B_GATES: readonly GraveGate[] = [
  { area: "B", side: "top", a: 704, b: 736 },
  { area: "B", side: "left", a: 856, b: 888 },
  { area: "B", side: "right", a: 856, b: 888 },
];
const OLD_B_FENCES: readonly FenceRun[] = SIDES.flatMap((s) => sideRuns(OLD_B_RECT, OLD_B_GATES, s));
const OLD_B_GATE_CENTERS: readonly { x: number; y: number }[] = [
  { x: 720, y: 784 },
  { x: 600, y: 872 },
  { x: 856, y: 872 },
];
/** 예전 다리 건너 묘역 손 소품 (종류·자리만 — 나무 간격 판정용) */
const OLD_B_PROPS: readonly { kind: PropKind; x: number; y: number }[] = [
  { kind: "oldGrave", x: 624, y: 812 },
  { kind: "oldGrave", x: 664, y: 806 },
  { kind: "oldGrave", x: 776, y: 808 },
  { kind: "oldGrave", x: 828, y: 812 },
  { kind: "oldGrave", x: 612, y: 966 },
  { kind: "oldGrave", x: 846, y: 962 },
  { kind: "deadTree", x: 612, y: 990 },
  { kind: "willow", x: 840, y: 990 },
  { kind: "lantern", x: 692, y: 796 },
  { kind: "lantern", x: 748, y: 796 },
  { kind: "candle", x: 700, y: 822 },
  { kind: "candle", x: 742, y: 822 },
  { kind: "candle", x: 720, y: 984 },
  { kind: "mist", x: 720, y: 900 },
  { kind: "mist", x: 640, y: 966 },
  { kind: "mist", x: 820, y: 880 },
];
/** 철책 충돌 (가로는 선 위 3px ~ 아래 1px, 세로는 선 양옆 2px) */
export function fenceCollider(f: FenceRun): Rect {
  return f.y0 === f.y1 ? { x: f.x0, y: f.y0 - 3, w: f.x1 - f.x0, h: 4 } : { x: f.x0 - 2, y: f.y0, w: 4, h: f.y1 - f.y0 };
}
/** 묘역 문 가운데 (문 아치·이름표 자리) */
export function gateCenter(g: GraveGate): { x: number; y: number } {
  const r = (GRAVE_AREAS.find((a) => a.id === g.area) ?? GRAVE_AREAS[0]).rect;
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

/** 11/19 「옛 묘역 입구」 팻말 (성황당을 없애고 그 일을 맡는다 — SHRINE은 팻말 앞자리, 팻말은 북쪽 길 바로 아래 풀밭) */
export const GRAVE_SIGN = { x: SHRINE.x, y: SHRINE.y + 14 } as const;

/** 광장 한가운데 큰 모닥불 (CAMPFIRES의 big) */
export const PLAZA_FIRE: Campfire = CAMPFIRES.find((c) => c.big) ?? CAMPFIRES[0];

/** 해먹 (받침 가운데). 1인 자리 — 누워서 흔들흔들 */
export const HAMMOCKS: readonly { x: number; y: number }[] = [
  { x: 548, y: 456 },
  { x: 892, y: 456 },
  { x: 244, y: 84 }, // 11/19 언덕 서쪽이 옛 묘역이 되어 별 보기 마당 북쪽으로
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
/** 종루: 등불 골목 동쪽 어귀 (예전 옛 묘역 동쪽) */
export const BELL = { x: 464, y: 300 } as const;
/** @deprecated 납골당은 버드나무 묘역과 함께 없어졌다 (그 자리는 동물원). 소품 종류 "crypt"는 그대로 그릴 수 있다 */
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
  // 까마귀가 내려앉는 마른 나무·오래된 비석 (life/crowSim.ts)
  P("deadTree", 1150, 166, 1),
  P("deadTree", 1300, 164, 0),
  P("oldGrave", 1370, 150, 0),
  P("oldGrave", 1086, 152, 1),
  // ── 별 보기 마당 (F3, 11/19 언덕 동쪽 반) ── 소나무·마른 나무, 돗자리, 해먹, 입구 석등 (서쪽 반은 옛 묘역)
  P("snowPine", 232, 56, 1),
  P("pine", 352, 60, 1),
  P("deadTree", 226, 224, 1),
  P("mat", 236, 112, 0),
  P("mat", 318, 146, 1),
  P("lantern", 356, 172),
  P("lantern", 356, 216),
  P("hammock", HAMMOCKS[2].x, HAMMOCKS[2].y),
  // 「옛 묘역 입구」 팻말 (입구 바로 밖 북쪽 길 아래 — E로 성불 안내·성불한 이야기들)
  P("sign", GRAVE_SIGN.x, GRAVE_SIGN.y),
  // ── 옛 묘역 (11/19 언덕 서쪽) ── 가운데 통로 끝 촛불, 땅안개 (사람의 묘비는 GraveField)
  P("candle", 118, 58, 0),
  P("candle", 138, 58, 1),
  P("candle", 216, 114, 1),
  P("candle", 216, 158, 0),
  P("mist", 80, 150, 0),
  P("mist", 176, 196, 1),
  // 달빛 연못
  P("reeds", 500, 150, 1),
  P("reeds", 414, 80, 0),
  P("mist", 456, 118, 0),
  // ── 종루 (등불 골목 동쪽 어귀, 11/19 성황당은 없앴다) ──
  P("bell", BELL.x, BELL.y),
  P("lantern", 480, 404),
  // ── 등불 골목 (11/19 예전 옛 묘역 자리 — 집터 10~15번지) ── 언덕 절벽 아래 소나무 줄(언덕과 떼어 놓는다), 골목 가로등
  ...Array.from({ length: 17 }, (_, i) => P(i % 3 === 1 ? "pine" : "snowPine", 48 + i * 24, 290, i % 2)),
  P("flowers", 452, 552, 1),
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
  P("leaves", 660, 560, 0),
  P("leaves", 780, 560, 1),
  P("flowers", 690, 612, 2),
  P("flowers", 752, 612, 0),
  // ── 11/15 쉼터 광장 (예전 10번지: 가로등·꽃밭, 벤치 bY·bZ) · 버스 정류장 마당 가로등 ──
  P("lamp", REST_PLAZA.x + 10, REST_PLAZA.y + 16),
  P("lamp", REST_PLAZA.x + REST_PLAZA.w - 10, REST_PLAZA.y + 16),
  P("flowers", REST_PLAZA.x + 14, REST_PLAZA.y + 88, 1),
  P("flowers", REST_PLAZA.x + REST_PLAZA.w - 14, REST_PLAZA.y + 88, 2),
  P("flowers", REST_PLAZA.x + REST_PLAZA.w / 2, REST_PLAZA.y + 30, 0),
  P("lamp", WHARF_YARD.x + 8, WHARF_YARD.y + 14),
  P("lamp", WHARF_YARD.x + 124, WHARF_YARD.y + 14),
  P("lamp", WHARF_YARD.x + WHARF_YARD.w - 8, WHARF_YARD.y + 14),
  // ── 광장 ↔ 주거 구역 사이 가로등 ──
  P("lamp", 968, 300),
  P("lamp", 968, 440),
  P("lamp", 968, 580),
  P("lamp", 968, 720),
  // ── 강변 (북쪽 둑) ── 11/16 묘지기 모닥불 옆 마른 나무(58,572)는 바닷가행 승강장 모서리에 걸려 뺐다
  P("willow", 262, 640, 0),
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
  P("reeds", 874, 752, 1), // 11/16 구경 벤치 bW가 오면서 동쪽으로
  // ── 동물원 (예전 버드나무 묘역 자리) ── 울타리·우리·장식·사육사는 zoo/ZooView (배치는 zoo/zooLayout.ts)
  // ── 범퍼카장 (예전 다리 건너 묘역 자리) ── 링크·매표소·간판·조명은 bumper/BumperRide (배치는 bumper/bumperLayout.ts)
  // 11/16 링크가 마당 아래 귀퉁이까지 넓어져 귀퉁이 나무 둘은 뺐다 (버드나무는 연못 남동쪽 둑으로)
  P("willow", 592, 990, 0),
  // ── 안개 숲 · 오리 연못 (11/15: 안개 연못을 넓혔다 — 물 위 안개는 걷고 선착장 석등. 팻말·배는 BoatRide) ──
  // 11/16 연못을 위아래로 더 넓혀 둑 갈대를 새 물가로 옮겼다
  P("hammock", HAMMOCKS[3].x, HAMMOCKS[3].y),
  P("mist", 516, 998, 0),
  P("reeds", 338, 934, 0),
  P("reeds", 600, 940, 1),
  P("reeds", 354, 846, 1),
  P("lantern", DUCK_DOCK_DECK.x + DUCK_DOCK_DECK.w + 10, DUCK_DOCK_DECK.y + 4),
  P("mushroom", 326, 980, 0),
  P("mushroom", 584, 830, 1),
  // ── 호박밭 (남동쪽 풀밭) ── 11/16 범퍼카장이 동쪽으로 넓어져 허수아비·호박을 모닥불 아래로 옮겼다
  P("scarecrow", 936, 960),
  P("pumpkin", 926, 986, 0),
  P("pumpkin", 950, 996, 1),
  P("pumpkin", 974, 984, 1),
  P("pumpkin", 938, 1004, 0),
  P("swing", SWINGS[2].x, SWINGS[2].y),
  P("lantern", 1092, 920),
  P("jar", 1066, 990),
  // ── 호숫가 · 나루터 ──
  P("lantern", 1222, 806),
  P("lantern", 1266, 806),
  P("reeds", 1150, 850, 1),
  P("reeds", 1214, 994, 1),
  P("mist", 1300, 940, 1),
  // 11/16 오리 연못·범퍼카장이 넓어져 숲·호박밭에서 줄어든 나무 몫 (매달릴 수 있는 단풍·은행)
  P("maple", 1384, 836, 1),
  P("ginkgo", 1136, 986, 0),
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

/** 철책 줄·문에서 떨어져 있는지 (문 앞을 나무가 막지 않게). 예전 다리 건너 묘역 철책·문 자리도 그대로 비운다 (11/16) */
function clearOfFences(x: number, y: number): boolean {
  for (const f of FENCE_RUNS) {
    const c = fenceCollider(f);
    if (inRect(c, x, y, 10)) return false;
  }
  for (const f of OLD_B_FENCES) if (inRect(fenceCollider(f), x, y, 10)) return false;
  for (const g of GRAVE_GATES) {
    const c = gateCenter(g);
    if (Math.hypot(c.x - x, c.y - y) < 34) return false;
  }
  for (const c of OLD_B_GATE_CENTERS) if (Math.hypot(c.x - x, c.y - y) < 34) return false;
  return true;
}

/** 길·물·좌석·특별한 자리·다른 소품과 겹치지 않는 자리인지 */
function freeForProp(placed: readonly PropDef[], x: number, y: number, gap: number): boolean {
  if (x < WALL_THICKNESS + 10 || x > MAP_WIDTH - WALL_THICKNESS - 10 || y < WALL_THICKNESS + 30 || y > MAP_HEIGHT - TILE - 12) return false;
  if (inWaterBody(x, y, 10) || inWaterBody(x, y - 10, 4)) return false;
  for (const d of DECKS) if (inRect(d, x, y, 14)) return false;
  if (inFishZone(x, y, 10)) return false; // 예전 납품 부두 자리 (버스 정류장 마당·호수 북동쪽 둑 — fishZone.ts)
  if (inSeaStop(x, y, 8)) return false; // 11/16 바닷가행 정류장·버스 길 (seaStop.ts — 예전 서쪽 모닥불 자리)
  if (inZoo(x, y, 14)) return false; // 동물원 (울타리·우리·장식은 zoo/zooLayout.ts)
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
  if (inRect(REST_PLAZA, x, y, 10) || inRect(WHARF_YARD, x, y, 10)) return false; // 11/15 쉼터 광장·버스 정류장 마당
  for (const p of placed) if (Math.hypot(p.x - x, p.y - y) < (isTree(p.kind) ? gap : 12)) return false;
  for (const p of HAND_PROPS) if (Math.hypot(p.x - x, p.y - y) < (isTree(p.kind) || p.kind === "hammock" || p.kind === "swing" || p.kind === "crypt" || p.kind === "mat" || p.kind === "oldGrave" ? gap : 14)) return false;
  for (const p of OLD_B_PROPS) if (Math.hypot(p.x - x, p.y - y) < (isTree(p.kind) || p.kind === "oldGrave" ? gap : 14)) return false; // 11/16 예전 다리 건너 묘역 소품 자리
  for (const k of RIDE_KEEPOUT) if (Math.hypot(k.x - x, k.y - y) < k.r) return false; // 50번 광장 놀거리 (rides.ts)
  for (const k of SKY_KEEPOUT) if (Math.hypot(k.x - x, k.y - y) < k.r) return false; // 관람차·열기구 출발장 (skyRides.ts)
  for (const p of [SHOP, HOUSING_OFFICE, HUNT_SIGN, SHRINE, TELESCOPE, TELESCOPE_2, FERRY_DOCK, DUCK_DOCK, WISH_FOUNTAIN]) if (Math.hypot(p.x - x, p.y - y) < 44) return false;
  if (Math.hypot(HUNT_GATE.x - x, HUNT_GATE.y - y) < 50) return false;
  for (const r of BUMPER_KEEPOUT) if (inRect(r, x, y)) return false; // 11/16 범퍼카장 간판 앞 · 호박밭 가는 틈
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
  // 안개 숲 (오리 연못 둘레): 빽빽하고 으스스하게 (11/16 연못이 넓어져 둑 둘레만 남는다)
  scatter(out, { x: 308, y: 790, w: 296, h: 214 }, 18, 21, forestKind, 22);
  // 별 보기 마당 (11/19 언덕 동쪽 반만 — 서쪽은 옛 묘역)
  scatter(out, { x: 224, y: 48, w: 128, h: 176 }, 3, 41, (u) => (u < 0.45 ? "pine" : u < 0.75 ? "deadTree" : "bush"), 30);
  // 까마귀 연못 둘레 ~ 동쪽 담
  scatter(out, { x: 1000, y: 40, w: 400, h: 130 }, 10, 43, treeKind, 30);
  // 강변 (북쪽 둑)·남쪽 둑
  scatter(out, { x: 40, y: 560, w: 470, h: 90 }, 9, 31, meadowKind, 30);
  scatter(out, { x: 40, y: 742, w: 880, h: 38 }, 13, 33, treeKind, 30); // 11/16 연못·범퍼카장이 넓어져 숲·호박밭에서 줄어든 나무를 강둑에 (10 → 13)
  // 호박밭·호숫가 (11/16 범퍼카장이 넓어져 호박밭은 x 916부터)
  scatter(out, { x: 916, y: 860, w: 188, h: 146 }, 7, 37, meadowKind, 32);
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

/**
 * 언덕 절벽: 남쪽 면은 통째로 막고(11/19 계단을 없앴다 — 등불 골목에서 바로 못 올라온다),
 * 동쪽 비탈은 입구(HILL_GATE, 북쪽 길과 같은 줄)만 비운다. 남쪽 절벽은 두 칸(HILL_CLIFF) 높이
 */
export function cliffColliders(): Rect[] {
  const y = HILL.y + HILL.h;
  const right = HILL.x + HILL.w;
  return [
    { x: HILL.x, y: y - 2, w: right + TILE - HILL.x, h: HILL_CLIFF + 2 },
    { x: right, y: HILL.y, w: TILE, h: HILL_GATE.y - HILL.y },
    { x: right, y: HILL_GATE.y + HILL_GATE.h, w: TILE, h: y + HILL_CLIFF - (HILL_GATE.y + HILL_GATE.h) },
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
  out.push(...skyColliders()); // 관람차 다리·받침, 열기구 출발장 팻말 (skyRides.ts)
  out.push(...fishZoneColliders()); // 낚시터 아치 기둥·노점 마당 장식 (fishZone.ts)
  out.push(...seaStopColliders()); // 11/16 바닷가행 정류장 지붕·팻말·시간표 (seaStop.ts)
  out.push(...zooColliders()); // 동물원 울타리·우리·노점·사육사 (zoo/zooLayout.ts)
  out.push(...hauntColliders()); // 귀신의집 건물 몸체 (haunt/hauntLayout.ts)
  out.push(...towerColliders()); // 11/15 야근 빌딩 로비·몸체 (tower/towerLayout.ts)
  out.push(...bumperColliders()); // 11/16 범퍼카장 고무 테두리·입구 막대·매표소 (bumper/bumperLayout.ts)
  out.push(...lotteryColliders()); // 행운권 판매대 (lotteryKiosk.ts)
  out.push(...seasonStallColliders()); // 11/19 계절 보따리상(광장)·가구 보따리상(북쪽 길 위) 노점과 주인 (seasonStallLayout.ts)
  out.push(...mungnyangColliders()); // 11/19 분양사 보리(동물원 정문 왼쪽 풀밭) 몸통·간식 상자·방석 (mungnyangLayout.ts)
  out.push(...officeColliders()); // 11/20 총무팀 문대리(야근 빌딩 오른쪽 풀밭) 사무실 가구 카트·문대리 몸통 (officeStallLayout.ts)
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
  const lots = houses ? houses.flatMap((h) => { const lot = houseLot(h.lot); return lot ? [{ lot, tier: h.tier }] : []; }) : HOUSE_LOTS.map((lot) => ({ lot, tier: "manor" }));
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
/** 11/19 언덕 입구 (동쪽 비탈의 틈 — 북쪽 길 두 줄과 같은 줄) */
const HILL_GATE_TY0 = T(HILL_GATE.y);
const HILL_GATE_TY1 = T(HILL_GATE.y + HILL_GATE.h) - 1;
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
/** 강 건너 오솔길 (동물원 정문 → 범퍼카장 입구) */
const SOUTH_PATH_TY = 48;
/** 오솔길 동쪽 끝 (11/16 넓어진 범퍼카장 입구 앞까지 — 가운데 길에서 조금 더 동쪽) */
const SOUTH_PATH_TX1 = T(BUMPER_GATE.x);
const HOUSE_TX0 = T(HOUSE_GRID.x) - 2;
const HOUSE_TX1 = MAP_COLS - 3;
/** 집 앞 골목 (필지 줄마다 아래로 두 줄 — 11/15 없앤 번지가 있어도 격자 줄은 그대로) */
const STREET_TYS: readonly number[] = Array.from({ length: HOUSE_ROWS }, (_, r) => T(HOUSE_GRID.y + r * HOUSE_GRID.pitchY + HOUSE_LOT_H)).flatMap((ty) => [ty, ty + 1]);
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

/** 묘비 행 사이 가로 오솔길 (묘비 받침 바로 아래) */
export function isRowPathTile(ty: number): boolean {
  return AREA_TILES.some((t) => t.rowTys.includes(ty));
}

const between = (v: number, a: number, b: number) => v >= a && v <= b;
/** 옛 묘역 동문(오른쪽 문) 가운데 타일 줄 — 별 보기 마당으로 나가는 흙길 */
const EAST_GATE_TY = (() => {
  const g = GRAVE_GATES.find((q) => q.area === "A" && q.side === "right")!;
  return T((g.a + g.b) / 2);
})();
/** 11/19 별 보기 마당 흙길: 옛 묘역 동문 → (열기구 출발장 왼쪽으로 꺾어) → 입구 (북쪽 길과 같은 두 줄) */
const TRAIL_TX = T(GRAVE_AREAS[0].rect.x + GRAVE_AREAS[0].rect.w) + 1;
function hillTrail(tx: number, ty: number): boolean {
  if (ty === EAST_GATE_TY && between(tx, T(GRAVE_AREAS[0].rect.x + GRAVE_AREAS[0].rect.w), TRAIL_TX)) return true;
  if (tx === TRAIL_TX && between(ty, EAST_GATE_TY, HILL_GATE_TY1)) return true;
  return between(ty, HILL_GATE_TY0, HILL_GATE_TY1) && between(tx, TRAIL_TX, HILL_TX1);
}
// ── 11/19 등불 골목 (예전 옛 묘역 자리) ── 두 줄 사이 골목·아랫줄 문 앞 골목(가로), 동쪽 골목(세로, 예전 성황당 자리), 강변 산책로로 내려가는 길
const LANE_TX0 = T(LANES.x);
const LANE_MID_TYS: readonly number[] = [T(400), T(400) + 1];
const LANE_LOW_TY = T(528);
const LANE_EAST_TXS: readonly number[] = [T(432), T(432) + 1];
const LANE_EAST_TY0 = T(320);
const LANE_SOUTH_TXS: readonly number[] = [T(224), T(224) + 1];
function laneGround(tx: number, ty: number): GroundKind | null {
  if (LANE_MID_TYS.includes(ty) && between(tx, LANE_TX0, T(512) - 1)) return "cobble";
  if (ty === LANE_LOW_TY && between(tx, LANE_TX0, LANE_EAST_TXS[1])) return "cobble";
  if (LANE_EAST_TXS.includes(tx) && between(ty, LANE_EAST_TY0, LANE_LOW_TY)) return "cobble";
  if (LANE_SOUTH_TXS.includes(tx) && between(ty, LANE_LOW_TY + 1, PROMENADE_TY - 1)) return "dirt";
  return null;
}
/** 범퍼카장 동쪽 → 호박밭 모닥불 흙길 (11/16 마당이 넓어져 마당 오른쪽 끝부터 세 칸) */
const YARD_EAST_TRAIL = { ty: 54, tx0: 57, tx1: 59 } as const;

function graveGround(t: AreaTiles, tx: number, ty: number): GroundKind {
  if (between(tx, t.aisle0, t.aisle1)) return "gravel";
  // 11/19 언덕 위 좁은 묘역: 줄 오솔길은 철책 안쪽 끝에서 끝까지 (가장자리 열 묘비 앞도 오솔길)
  if (t.rowTys.includes(ty) && between(tx, t.tx0, t.tx1)) return "gravel";
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
  // ── 옛 묘역 (11/19 언덕 서쪽 — 언덕보다 먼저 본다) ──
  for (const t of AREA_TILES) if (between(tx, t.tx0, t.tx1) && between(ty, t.ty0, t.ty1)) return graveGround(t, tx, ty);
  // ── 별 보기 언덕 (F3): 대지 · 남쪽 두 칸 절벽 · 동쪽 비탈 (11/19 계단은 없애고 동쪽 비탈에 입구) ──
  if (between(tx, HILL_TX0, HILL_TX1) && ty <= HILL_TY1) return hillTrail(tx, ty) ? "dirt" : "hill";
  if (between(ty, CLIFF_TY0, CLIFF_TY1) && between(tx, HILL_TX0, CLIFF_TX)) return "cliff";
  if (tx === CLIFF_TX && ty <= CLIFF_TY1) return between(ty, HILL_GATE_TY0, HILL_GATE_TY1) ? "dirt" : "cliff";
  // ── 등불 골목 (11/19) ──
  const lane = laneGround(tx, ty);
  if (lane) return lane;
  // ── 11/16 범퍼카장 마당 (예전 다리 건너 묘역과 같은 타일) ──
  if (inBumperYardTiles(tx, ty)) return bumperGround();
  // ── 동물원: 자갈길·우리 안 흙바닥·동문 밖 흙길 (나머지는 풀밭) ──
  const zoo = zooGround(tx, ty);
  if (zoo) return zoo;
  // ── 정문 앞마당 + 가운데 길 (정문 → 광장 → 가운데 다리 → 범퍼카장) ──
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
  // 11/15 쉼터 광장 (예전 10번지, 포석) · 버스 정류장 마당 (예전 11·12번지, 자갈 — 의뢰 게시판·주말 버스 정류장)
  if (between(tx, T(REST_PLAZA.x), T(REST_PLAZA.x + REST_PLAZA.w) - 1) && between(ty, T(REST_PLAZA.y), T(REST_PLAZA.y + REST_PLAZA.h) - 1)) return "stone";
  if (between(tx, T(WHARF_YARD.x), T(WHARF_YARD.x + WHARF_YARD.w) - 1) && between(ty, T(WHARF_YARD.y), T(WHARF_YARD.y + WHARF_YARD.h) - 1)) return "gravel";
  // 광장 ↔ 주거 구역 골목 (첫째·셋째 골목 줄)
  if (between(tx, PZ_TX1 + 1, HOUSE_TX0 - 1) && (STREET_TYS.slice(0, 2).includes(ty) || STREET_TYS.slice(4, 6).includes(ty))) return "dirt";
  // ── 강변 산책로 + 다리·징검다리로 내려가는 길 ──
  if (ty === PROMENADE_TY && tx >= 2 && tx <= T(880)) return "dirt";
  for (const b of BRIDGES) {
    const bt = T(b.x);
    if (between(tx, bt - 1, bt) && (between(ty, PROMENADE_TY, T(b.y0)) || between(ty, T(b.y1), SOUTH_PATH_TY))) return "dirt";
  }
  const st = T(STEP_STONES[0].x);
  if (tx === st && (between(ty, PROMENADE_TY, T(STEP_STONES[0].y - 8)) || between(ty, T(STEP_STONES[STEP_STONES.length - 1].y + 8), SOUTH_PATH_TY))) return "dirt";
  // ── 강 건너 오솔길 (동물원 정문 → 범퍼카장 입구) ──
  if (ty === SOUTH_PATH_TY && between(tx, T(BRIDGES[0].x) - 1, SOUTH_PATH_TX1)) return "dirt";
  // 동물원 동문 → 안개 숲은 zooGround, 범퍼카장 동쪽 → 호박밭 모닥불
  if (ty === YARD_EAST_TRAIL.ty && between(tx, YARD_EAST_TRAIL.tx0, YARD_EAST_TRAIL.tx1)) return "dirt";
  // 호수: 나루터 선착장 길 (마지막 골목에서), 낚시 잔교 길 (호박밭에서)
  if (between(tx, T(DOCK_DECK.x), T(DOCK_DECK.x + DOCK_DECK.w) - 1) && between(ty, LAST_STREET_TY + 1, T(DOCK_DECK.y))) return "dirt";
  if (ty === T(LAKE_PIER.y + LAKE_PIER.h / 2) && between(tx, T(LAKE_PIER.x) - 4, T(LAKE_PIER.x) - 1)) return "dirt";
  // 11/15 오리배 선착장 길 (강 건너 오솔길에서 판자까지)
  if (between(tx, T(DUCK_DOCK_DECK.x), T(DUCK_DOCK_DECK.x + DUCK_DOCK_DECK.w) - 1) && between(ty, SOUTH_PATH_TY + 1, T(DUCK_DOCK_DECK.y))) return "dirt";
  return "grass";
}

// ── 상호작용 오브젝트 (E/탭) ── WorldScene이 가장 가까운 것을 골라 안내 문구를 띄우고 상호작용한다.
export type InteractKind = "tree" | "swing" | "hammock" | "bell" | "well" | "water" | "portal" | "door" | "lot" | "dock" | "wish" | "seesaw" | "trampoline" | "carousel" | "telescope" | "mat" | "forage" | "zoo" | "ferris" | "balloon" | "bus" | "bumper";
export type PortalKind = "hunt" | "housing" | "shrine" | "haunt" | "tower" | "lottery" | "seasonCos" | "seasonFurn" | "mungnyang" | "office";
export type Interactable = {
  id: string;
  kind: InteractKind;
  /** 판정 중심 (플레이어 발 기준) */
  x: number;
  y: number;
  /** 판정 반경 */
  r: number;
  /** 11/18 바닥 영역 (있으면 반경 대신 이 상자 안이 닿는 곳 — 버스 정차 칸, game/logic/reach) */
  zone?: ReachZone;
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
  // 11/19 「옛 묘역 입구」 팻말 (성황당을 없애고 성불 안내·성불한 이야기들을 맡는다)
  { id: "portal:shrine", kind: "portal", portal: "shrine", x: SHRINE.x, y: SHRINE.y, r: PORTAL_RADIUS, ax: SHRINE.x, ay: SHRINE.y, label: "옛 묘역 입구 팻말 · 성불한 이야기들" },
  { id: "dock:ferry", kind: "dock", x: FERRY_DOCK.x, y: FERRY_DOCK.y, r: 14, ax: FERRY_DOCK.x, ay: FERRY_DOCK.y, label: "나루터 · 조각배 타기" },
  { id: "dock:duck", kind: "dock", x: DUCK_DOCK.x, y: DUCK_DOCK.y, r: 14, ax: DUCK_DOCK.x, ay: DUCK_DOCK.y, label: "오리배 타기" },
  // 11/15 주말 버스 정류장 (버스 정류장 마당). E → 캠핑장 버스 (운영에서 닫혀 있으면 안내만).
  // 11/16 정류장이 둘이 되며 안내 글에 가는 곳을 붙였다
  // 11/18 타는 곳은 바닥 정차 칸(노란 칠·BUS) 전체 (zone — game/bus/busBays). r은 바닥 장식 비우기 같은 데만 쓴다
  { id: "bus:camp", kind: "bus", x: BUS_STOP.x - 6, y: BUS_STOP.y + 22, r: BUS_E_RADIUS, zone: VILLAGE_CAMP_BAY, ax: BUS_STOP.x - 6, ay: BUS_STOP.y + 22, label: "캠핑장행 버스 타기" },
  // 11/16 바닷가행 정류장 (옛 묘역 아래 강가, seaStop.ts). E → 바닷가 버스 (운영에서 닫혀 있으면 안내만)
  { id: "bus:sea", kind: "bus", x: SEA_STOP.x + 6, y: SEA_STOP.y + 22, r: SEA_STOP_E_RADIUS, zone: VILLAGE_SEA_BAY, ax: SEA_STOP.x + 6, ay: SEA_STOP.y + 22, label: "바닷가행 버스 타기" },
  // 동물원 사육사 (노점 앞) → 펫 분양 창
  { id: "zoo:keeper", kind: "zoo", x: ZOOKEEPER_SPOT.x, y: ZOOKEEPER_SPOT.y, r: 20, ax: ZOOKEEPER_SPOT.x, ay: ZOOKEEPER_SPOT.y, label: "사육사에게 펫 분양 받기" },
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
    out.push(...skyInteractables()); // 관람차·열기구 (skyRides.ts)
    out.push(...hauntInteractables()); // 귀신의집 문 (haunt/hauntLayout.ts)
    out.push(...towerInteractables()); // 11/15 야근 빌딩 회전문 (tower/towerLayout.ts)
    out.push(...bumperInteractables()); // 11/16 범퍼카장 입구 (bumper/bumperLayout.ts)
    out.push(...lotteryInteractables()); // 행운권 판매대 (lotteryKiosk.ts)
    out.push(...seasonStallInteractables()); // 11/19 계절 보따리상·가구 보따리상 (seasonStallLayout.ts)
    out.push(...mungnyangInteractables()); // 11/19 분양사 보리 (mungnyangLayout.ts)
    out.push(...officeInteractables()); // 11/20 총무팀 문대리 사무실 가구 카트 (officeStallLayout.ts)
    fixedItems = out;
  }
  return fixedItems.slice();
}

/** 주거 구역 필지의 상호작용: 집이 있으면 문, 비었으면 "분양 문의" 팻말 */
export function lotInteractable(lot: number, house: { id: string; name: string } | null): Interactable | null {
  const l = houseLot(lot);
  if (!l) return null;
  if (house) return { id: `door:${lot}`, kind: "door", x: l.door.x, y: l.door.y + 4, r: 16, ax: l.door.x, ay: l.door.y, houseId: house.id, lot, label: `${clampChars(house.name, DOOR_NAME_MAX)} 들어가기` };
  const sx = l.x + HOUSE_LOT_W / 2;
  const sy = l.y + HOUSE_LOT_H - 24;
  return { id: `lot:${lot}`, kind: "lot", x: sx, y: sy + 8, r: 16, ax: sx, ay: sy + 8, lot, label: `${lot}번지 분양 문의` };
}

/** 묘비 자리 (테스트·안내용): 옛 묘역 전부 */
export function graveSlots(): { x: number; y: number }[] {
  return Array.from({ length: GRAVEYARD_CAPACITY }, (_, i) => graveSlot(i));
}

/** 다리 위인지 */
export function bridgeAt(x: number, y: number): boolean {
  return BRIDGE_DECKS.some((d) => inRect(d, x, y));
}

/** 미니맵·안내용 주요 장소 (F17) */
export type Landmark = { id: string; label: string; x: number; y: number; kind: "fire" | "grave" | "shop" | "hunt" | "housing" | "shrine" | "dock" | "telescope" | "wish" | "bell" | "fish" | "zoo" | "haunt" | "ferris" | "balloon" | "tower" | "bumper" | "busCamp" | "busSea" | "duck" | "season" | "furnStall" | "mungnyang" | "office" };
export const LANDMARKS: readonly Landmark[] = [
  { id: "fire", label: "큰 모닥불", x: PLAZA_FIRE.x, y: PLAZA_FIRE.y, kind: "fire" },
  ...GRAVE_AREAS.map((a) => ({ id: `grave${a.id}`, label: a.name, x: a.aisleX, y: a.y0 + a.dy / 2, kind: "grave" as const })),
  { id: "shop", label: "유령 잡화점", x: SHOP.x, y: SHOP.y, kind: "shop" },
  { id: "hunt", label: "사냥터", x: HUNT_GATE.x, y: HUNT_GATE.y + 8, kind: "hunt" },
  { id: "housing", label: "분양 사무소", x: HOUSING_OFFICE.x, y: HOUSING_OFFICE.y, kind: "housing" },
  { id: "shrine", label: "옛 묘역 입구", x: SHRINE.x, y: SHRINE.y, kind: "shrine" },
  { id: "dock", label: "나루터", x: FERRY_DOCK.x, y: FERRY_DOCK.y, kind: "dock" },
  // 11/15 낚시: 납품 부두를 없애고 어부 영감 노점이 있는 호수 낚시 잔교로
  { id: "fish", label: "낚시 잔교", x: LAKE_PIER.x + 24, y: LAKE_PIER.y + 8, kind: "fish" },
  { id: "zoo", label: "동물원", x: ZOOKEEPER.x - 16, y: ZOOKEEPER.y + 40, kind: "zoo" },
  { id: "telescope", label: "망원경", x: TELESCOPE.x, y: TELESCOPE.y, kind: "telescope" },
  // 11/16 마을 곳곳 망원경 (광장·다리·호숫가·쉼터 — protocol VILLAGE_SCOPES)
  ...VILLAGE_SCOPES.map((t, i) => ({ id: `telescope${i + 3}`, label: t.name, x: t.x, y: t.y, kind: "telescope" as const })),
  { id: "wish", label: "소원 분수", x: WISH_FOUNTAIN.x, y: WISH_FOUNTAIN.y, kind: "wish" },
  { id: "haunt", label: "귀신의집", x: HAUNT_HOUSE.x, y: HAUNT_HOUSE.y - 8, kind: "haunt" },
  { id: "tower", label: "야근 빌딩", x: TOWER.x, y: TOWER.y - 8, kind: "tower" },
  { id: "ferris", label: "관람차", x: FERRIS.x, y: FERRIS.y - 30, kind: "ferris" },
  { id: "balloon", label: "열기구 타는 곳", x: BALLOON_PAD.x, y: BALLOON_PAD.y - 4, kind: "balloon" },
  { id: "bumper", label: "범퍼카장", x: BUMPER_LANDMARK.x, y: BUMPER_LANDMARK.y, kind: "bumper" },
  // 11/16 정류장 둘 (가는 곳이 달라 이름도 따로)
  { id: "busCamp", label: "캠핑장행 정류장", x: BUS_STOP.x, y: BUS_STOP.y + 8, kind: "busCamp" },
  { id: "busSea", label: "바닷가행 정류장", x: SEA_STOP.x, y: SEA_STOP.y + 8, kind: "busSea" },
  // 11/16 오리배 선착장 (미니맵 오리 그림)
  { id: "duck", label: "오리배", x: DUCK_DOCK.x, y: DUCK_DOCK.y, kind: "duck" },
  // 11/19 광장 계절 보따리상 (미니맵 보따리 그림)
  { id: "season", label: "계절 보따리상", x: SEASON_STALL.x - 16, y: SEASON_STALL.y - 10, kind: "season" },
  // 11/19 가구 보따리상 (미니맵 의자 그림)
  { id: "furnStall", label: "가구 보따리상", x: FURN_STALL.x - 20, y: FURN_STALL.y - 10, kind: "furnStall" },
  // 11/19 분양사 보리 (동물원 정문 왼쪽, 미니맵 발바닥 그림)
  { id: "mungnyang", label: "분양사 보리", x: MUNGNYANG_SELLER.x - 4, y: MUNGNYANG_SELLER.y - 8, kind: "mungnyang" },
  // 11/20 총무팀 문대리 (야근 빌딩 오른쪽, 미니맵 사무 의자 그림)
  { id: "office", label: "총무팀 문대리", x: OFFICE_STALL.x, y: OFFICE_STALL.y - 10, kind: "office" },
];
