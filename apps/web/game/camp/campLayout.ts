import {
  CAMP_BOARD,
  CAMP_BOARD_SPOT,
  CAMP_BOAT_SIGN,
  CAMP_BOUNDS,
  CAMP_BUS_SIGN,
  CAMP_BUS_STOP,
  CAMP_BUS_TIMETABLE,
  CAMP_CLIFF_X0,
  CAMP_CLIFF_X1,
  CAMP_CROSSINGS,
  CAMP_FALL_X,
  CAMP_FIRE,
  CAMP_FISHING_SPOTS,
  CAMP_FOOTBATH,
  CAMP_FURNITURE,
  CAMP_GARDEN_FIRE,
  CAMP_GRILL,
  CAMP_GRILL_TABLE,
  CAMP_HEIGHT,
  CAMP_LOG_BRIDGE_Y,
  CAMP_LOG_RX,
  CAMP_LOG_RY,
  CAMP_LOTS,
  CAMP_NPCS,
  CAMP_OFFICE,
  CAMP_OFFICE_H,
  CAMP_OFFICE_W,
  CAMP_PENSION_GATE,
  CAMP_PENSION_SIGN,
  CAMP_PIER,
  CAMP_PITS,
  CAMP_PLAZA_R,
  CAMP_PLUNGE,
  CAMP_POND_SIGN,
  CAMP_POOL,
  CAMP_POOL_ROCKS,
  CAMP_RAFTS,
  CAMP_RAFT_ART_H,
  CAMP_RES,
  CAMP_RES_EMBANK,
  CAMP_RES_RING,
  CAMP_ROAD,
  CAMP_ROW_DOCK,
  CAMP_BUOY_LINE,
  CAMP_ROWBOATS,
  CAMP_SMALL_FIRE,
  CAMP_SNACK,
  CAMP_STEP_STONES,
  CAMP_SLIDE,
  CAMP_SLIDE_SEAT,
  CAMP_TRAMP_GATE,
  CAMP_TRAMPOLINE,
  campRaftDeck,
  campRaftWalks,
  CAMP_STONES_Y,
  CAMP_STREAM,
  CAMP_STREAM_HALF_W,
  CAMP_STREAM_TOP,
  CAMP_TRADER_STALL,
  CAMP_VENDING_ROW,
  CAMP_VIEW_BRIDGE,
  CAMP_VIEW_BRIDGE_X,
  CAMP_WIDTH,
  CAMP_XTREE_AT,
  campCliffEnvelope,
  campPoolD,
  campResEdge,
  campStreamX,
  campWet,
  type CampLot,
  type CampNpcId,
  type Furniture,
} from "@tomb/protocol";
import { CAMP_BUS_BAY } from "../bus/busBays";
import type { CampInteractable } from "./campTypes";
import { CAMP_GATHER_NODES } from "@/lib/forage/catalog";
import { campHammockColliders, MAP_HAMMOCKS } from "./campHammock";

// 11/15 언젠가 캠핑장 배치 — 순수 데이터 (Phaser 없음 → campLayout.test.ts가 충돌·길을 검사한다).
// 11/26 폭포 계곡 개편 (6차 시안 game/camp/mock/mockLayout을 옮김). 좌석·NPC·물·낚시 자리 좌표의 원본은 packages/protocol/src/camp.ts
// (서버 좌석 판정과 같다), 집터는 protocol campHomes CAMP_LOTS (카라반·펜션·촌캉스 건물·앞마당·울타리는 집 화면 담당 game/camp/campHousing).
// 여기서는 그 위에
//  - 절벽 덩이·물줄기 (그림), 길(흙길·눈 다진 오솔길), 바닥 종류, 나무·바위·바닥 소품 흩뿌리기(시드 고정, 길·물·자리·시설 피해서)
//  - 충돌 상자(절벽·나무 줄기·건물·좌대 오두막·소품), 가구 충돌, 상호작용, 걷기 격자를 만든다.
// 그림은 campArt.ts·valleyArt*.ts, 그리기·컬링은 CampMap.ts, 미니맵 바탕은 campMinimap.ts.

export type Rect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };

// ── 결정적 난수 (그림·배치가 매번 같게) ──
export function hashU(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

export const MW = CAMP_WIDTH;
export const MH = CAMP_HEIGHT;

// ── 아스라 폭포 절벽 (위 가운데) ── 바위 덩이 여럿이 뒤 → 앞으로 겹쳐 말굽처럼 소를 감싼다.
// 덩이마다: 윗면(눈 덮인 마루, cap ~ cap+thick) + 앞면(바위 벽, ~ base). 뒤 덩이(가운데·가장 높다)에 폭포가 있다.
export const FALL_X = CAMP_FALL_X;
export const CLIFF_X0 = CAMP_CLIFF_X0;
export const CLIFF_X1 = CAMP_CLIFF_X1;
export type Mass = { id: string; x0: number; x1: number; cap: number; thick: number; drop: number; seed: number; jag: number };
/** 뒤 → 앞 순서 (그리는 순서) */
export const MASSES: readonly Mass[] = [
  // 가운데 덩이 윗면은 맵 위 밖 (폭포가 화면 위 끝에서 바로 쏟아진다 — 물의 출발점은 보이지 않게)
  { id: "M0", x0: 474, x1: 810, cap: -24, thick: 10, drop: 0, seed: 1, jag: 7 },
  { id: "M1L", x0: 438, x1: 576, cap: 84, thick: 9, drop: 5, seed: 2, jag: 6 },
  { id: "M1R", x0: 708, x1: 856, cap: 78, thick: 9, drop: 5, seed: 3, jag: 6 },
];
/** 바깥 끝은 둥근 바위 코(밑은 판판하게 땅에 앉는다) — 밑동엔 돌무더기(SCREE) */
const NOSE = 22;
function outerE(m: Mass, x: number): number {
  if (m.id === "M1L" && x - m.x0 < m.x1 - x) return x - m.x0;
  if (m.id === "M1R" && m.x1 - x < x - m.x0) return m.x1 - x;
  return 999;
}
function noseX(m: Mass): number {
  return m.id === "M1L" ? m.x0 + NOSE : m.x1 - NOSE;
}
export function massCap(m: Mass, x: number): number {
  if (x < m.x0 || x > m.x1) return 9999;
  const e = outerE(m, x);
  if (e < NOSE) {
    const nx = noseX(m);
    const capN = rawCap(m, nx);
    const baseN = rawBase(m, nx);
    const k = Math.sqrt(Math.max(0, 1 - ((NOSE - e) / NOSE) ** 2));
    return Math.round(baseN - (baseN - capN) * k + (hashU(x >> 1, m.seed, 913) - 0.5) * 2);
  }
  return rawCap(m, x);
}
function rawCap(m: Mass, x: number): number {
  const e = Math.min(x - m.x0, m.x1 - x);
  const sh = 22;
  // 바깥쪽 끝(왼쪽 덩이의 왼쪽, 오른쪽 덩이의 오른쪽)은 길게 비탈져 숲으로 내려앉는다 — 반듯한 벽 끝이 보이지 않게
  const outer = (m.id === "M1L" && x - m.x0 < m.x1 - x) || (m.id === "M1R" && m.x1 - x < x - m.x0);
  const osh = 84;
  const fall = Math.max(0, campCliffEnvelope(x) - m.cap - 14);
  const shoulder = outer && e < osh ? (1 - Math.sqrt(1 - ((osh - e) / osh) ** 2)) * fall * 0.92 : e < sh ? (1 - Math.sqrt(1 - ((sh - e) / sh) ** 2)) * 34 : 0;
  const jag = (hashU(x >> 3, m.seed, 905) - 0.5) * m.jag * 2 + Math.sin(x * 0.045 + m.seed) * m.jag * 0.6 + (hashU(x >> 1, m.seed, 907) - 0.5) * 2;
  return Math.round(m.cap + shoulder + jag);
}
export function massBase(m: Mass, x: number): number {
  if (outerE(m, x) < NOSE) return rawBase(m, noseX(m));
  return rawBase(m, x);
}
function rawBase(m: Mass, x: number): number {
  const full = Math.round(campCliffEnvelope(x) + m.drop + (hashU(x >> 3, m.seed, 909) - 0.5) * 3);
  // 바깥쪽 비탈: 밑동도 올라와 덩이가 뾰족하게 숲 바닥으로 사라진다 (아래가 부채처럼 퍼지지 않게)
  const e = x - m.x0 < m.x1 - x ? x - m.x0 : m.x1 - x;
  const outer = (m.id === "M1L" && x - m.x0 < m.x1 - x) || (m.id === "M1R" && m.x1 - x < x - m.x0);
  if (!outer || e >= 84) return full;
  const top = rawCap(m, x) + m.thick + 3;
  return Math.round(top + (full - top) * Math.pow(e / 84, 0.7));
}
/** 맨 위 덩이 윗선 (= 절벽 위 마루가 끝나는 곳) */
export function cliffTop(x: number): number {
  let t = 9999;
  for (const m of MASSES) if (x >= m.x0 && x <= m.x1) t = Math.min(t, massCap(m, x));
  return t;
}
/** 맨 앞 덩이 밑동 (절벽이 없는 x면 -1) */
export function cliffBase(x: number): number {
  let b = -1;
  for (const m of MASSES) if (x >= m.x0 && x <= m.x1) b = Math.max(b, massBase(m, x));
  return b;
}
/** (x,y)가 절벽 위 마루(높은 땅)인지 */
export function onPlateau(x: number, y: number): boolean {
  return x > CLIFF_X0 && x < CLIFF_X1 && cliffBase(x) > 0 && y < cliffTop(x);
}
/** 절벽(윗면·앞면) 안인지 */
export function inCliffFace(x: number, y: number): boolean {
  const b = cliffBase(x);
  return b > 0 && y >= cliffTop(x) && y < b;
}

/** 위 마루를 흘러 폭포 입구로 들어오는 강 (맵 위 끝 → 입구) */
export const UPPER_RIVER: readonly Pt[] = [
  { x: 668, y: -4 },
  { x: 652, y: 14 },
  { x: 640, y: 40 },
];
export const UPPER_RIVER_HW = 14;
export function upperRiverX(y: number): number {
  const p = UPPER_RIVER;
  if (y <= p[0].y) return p[0].x;
  for (let i = 1; i < p.length; i++) if (y <= p[i].y) return p[i - 1].x + ((p[i].x - p[i - 1].x) * (y - p[i - 1].y)) / (p[i].y - p[i - 1].y);
  return p[p.length - 1].x;
}

/**
 * 물줄기 (화면 좌표, 위 → 아래). x0/x1 = 위·아래 폭의 왼쪽·오른쪽 끝. kind: main(굵은 물)·thin(가는 줄기)·ice(얼어붙은 줄기)
 * 1단: 입구 → 바위 선반 (좁고 빠르게), 선반에서 물이 고였다 넘쳐 2단: 선반 → 소 (넓게, 가운데 바위가 두 갈래로 나눈다)
 */
export type FallStrand = { id: string; top: number; bottom: number; xt: [number, number]; xb: [number, number]; kind: "main" | "thin" | "ice" };
export const FALL_LEDGE_Y = 104;
export const FALLS: readonly FallStrand[] = [
  { id: "f1", top: -10, bottom: FALL_LEDGE_Y - 2, xt: [624, 656], xb: [620, 660], kind: "main" },
  { id: "f2a", top: FALL_LEDGE_Y - 6, bottom: 206, xt: [612, 650], xb: [598, 645], kind: "main" },
  { id: "f2b", top: FALL_LEDGE_Y - 6, bottom: 206, xt: [655, 668], xb: [657, 682], kind: "main" },
  { id: "rib", top: 86, bottom: 214, xt: [516, 521], xb: [517, 523], kind: "thin" },
  { id: "ice", top: 78, bottom: 212, xt: [768, 792], xb: [764, 796], kind: "ice" },
];
/** 1단 물줄기가 떨어지는 둥근 바위 혹 (가운데 아래, 거품을 이고 있다) */
export const KNOB = { x: 640, y: 112, rx: 32, ry: 13 } as const;

// ── 달그늘 소 · 옛길 계곡 (protocol) ──
export const POOL = CAMP_POOL;
export const poolD = campPoolD;
export const PLUNGE = CAMP_PLUNGE;
export const STREAM = CAMP_STREAM;
export const STREAM_HW = CAMP_STREAM_HALF_W;
export const streamX = campStreamX;
/** 물살 (작은 턱: 하얀 거품 띠) */
export const RAPIDS: readonly number[] = [438, 512, 640];
export const VIEW_BRIDGE = CAMP_VIEW_BRIDGE;
export const STONES_Y = CAMP_STONES_Y;
export const LOG_BRIDGE_Y = CAMP_LOG_BRIDGE_Y;
/**
 * 11/26 폭포 다리 난간 (그림 valleyArt.viewBridgeArt 104 너비 — 판자 윗줄 = 뒤 난간 받침 VIEW_BRIDGE.y − 14, 앞 난간 기둥 받침 = VIEW_BRIDGE.y + 13).
 * 운영자 「다리 바깥에서 다리 쪽으로 걸치면 난간 뒤에 내가 있어야」: 뒤·앞 난간에 막는 상자 (양 끝은 열어 가로로만 오르내린다 — 마을 다리 난간 F13과 같다).
 * 다리 위 발은 y 372~393, 뒤(소 쪽)는 364까지, 앞은 401부터 — 난간 가림판 깊이(뒤 368 · 앞 397)가 그 사이에 온다 (CampMap.addBridges)
 */
export const VIEW_BRIDGE_RAIL = { x0: CAMP_VIEW_BRIDGE_X - 51, x1: CAMP_VIEW_BRIDGE_X + 51, backY: CAMP_VIEW_BRIDGE.y - 14, frontY: CAMP_VIEW_BRIDGE.y + 13 } as const;
export const VIEW_BRIDGE_BACK_DEPTH = CAMP_VIEW_BRIDGE.y - 12;
export const VIEW_BRIDGE_FRONT_DEPTH = CAMP_VIEW_BRIDGE.y + 17;
function viewBridgeRailColliders(): Rect[] {
  const R = VIEW_BRIDGE_RAIL;
  return [
    { x: R.x0, y: R.backY - 2, w: R.x1 - R.x0, h: 3 },
    { x: R.x0, y: R.frontY, w: R.x1 - R.x0, h: 3 },
  ];
}
export const STEP_STONES = CAMP_STEP_STONES;
/** 계곡 물 안 (소 제외) */
export function inStream(x: number, y: number, pad = 0): boolean {
  return y > CAMP_STREAM_TOP && Math.abs(x - streamX(y)) <= STREAM_HW + pad;
}
/** 웅덩이 희귀 물고기 반짝임 자리 (UI 없음) */
export const RARE_GLINT = { x: 712, y: 298 } as const;

// ── 카라반 자리 12 (집터 lot 1~12 — 물가 앞줄 1~6 · 숲 쪽 뒷줄 7~12). 자갈 마당은 맵이, 카라반·앞마당은 집 화면 담당이 그린다 ──
export type Site = { n: number; x: number; y: number; side: -1 | 1; row: "front" | "back"; lot: CampLot };
export const SITE_W = 80;
export const SITE_H = 76;
export const SITES: readonly Site[] = CAMP_LOTS.filter((l) => l.kind === "caravan").map((l) => {
  const x = l.x + l.w / 2;
  const y = l.y + l.h / 2;
  return { n: l.n, x, y, side: x < streamX(y) ? -1 : 1, row: l.n <= 6 ? "front" : "back", lot: l };
});
export function inSite(x: number, y: number, pad = 0): Site | null {
  for (const s of SITES) if (Math.abs(x - s.x) <= s.lot.w / 2 + pad && Math.abs(y - s.y) <= s.lot.h / 2 + pad) return s;
  return null;
}
/** 펜션·촌캉스 터 (집 + 앞마당 3단계 발자국) */
export const HOME_LOTS: readonly CampLot[] = CAMP_LOTS.filter((l) => l.kind !== "caravan");
/** 집 발자국 안인지 (pad만큼 넓혀서) */
export function inHome(x: number, y: number, padX = 0, padTop = 0, padBottom = padTop): boolean {
  for (const h of HOME_LOTS) if (x >= h.x - padX && x <= h.x + h.w + padX && y >= h.y - padTop && y <= h.y + h.h + padBottom) return true;
  return false;
}

// ── 캠프파이어 존 ──
export const FIRE = CAMP_FIRE;
export const PLAZA_R = CAMP_PLAZA_R;
export const LOG_RX = CAMP_LOG_RX;
export const LOG_RY = CAMP_LOG_RY;
export const XTREE_AT = CAMP_XTREE_AT;
export const LIGHT_POLES: readonly Pt[] = Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
  return { x: Math.round(FIRE.x + Math.cos(a) * 100), y: Math.round(FIRE.y + 8 + Math.sin(a) * 82) };
});
export const PITS = CAMP_PITS;
export const SNACK = CAMP_SNACK;
export const WOOD_STACKS: readonly Pt[] = [
  { x: 1240, y: 616 },
  { x: 1052, y: 770 },
  { x: 1020, y: 566 },
];
/**
 * 바베큐 그릴·탁자 (캠프파이어 존 윗줄 — 그릴 앞에서 E → 먹거리 메뉴, protocol bbq.ts). 11/26 자판기는 달그늘 소 옆 셋으로 (CAMP_VENDING_ROW)
 * vending = 지도 이름표·옛 쓰임새용 (첫 자판기)
 */
export const CAMP_BBQ = {
  grill: CAMP_GRILL,
  table: CAMP_GRILL_TABLE,
  vending: CAMP_VENDING_ROW[0],
  area: { x: 1088, y: 520, w: 140, h: 56 },
} as const;
export const BBQ = CAMP_BBQ;
export const BUS_STOP = CAMP_BUS_STOP;
export const ROAD = CAMP_ROAD;
export const OFFICE = CAMP_OFFICE;
export const OFFICE_RECT: Rect = { x: CAMP_OFFICE.x - CAMP_OFFICE_W / 2, y: CAMP_OFFICE.y - CAMP_OFFICE_H, w: CAMP_OFFICE_W, h: CAMP_OFFICE_H };
export const BOARD_SPOT = CAMP_BOARD_SPOT;
export const SMALL_FIRE = CAMP_SMALL_FIRE;

// ── 윤슬 낚시터 ──
export const RES = CAMP_RES;
export const EMBANK = CAMP_RES_EMBANK;
export const RING = CAMP_RES_RING;
export const POND = { x: (RES.x0 + RES.x1) / 2, y: (RES.y0 + RES.y1) / 2, rx: (RES.x1 - RES.x0) / 2, ry: (RES.y1 - RES.y0) / 2 } as const;
export const resEdge = campResEdge;
export const PIER = CAMP_PIER;
export const RAFTS = CAMP_RAFTS;
export const BOOTH = CAMP_TRADER_STALL;
export const POND_SIGN = CAMP_POND_SIGN;
/**
 * 11/26 수영 안내 팻말 「4~6번 좌대는 헤엄쳐 가서 사다리로 올라가요」: 잔교 위쪽 끝(4·5번 좌대 사이 앞) — 잔교에서 물로 들어가 바로 위 좌대 사다리로 헤엄쳐 가는 자리.
 * 전에는 둑 위 사장님 옆이라 어디로 헤엄치라는 건지 몰랐다 (운영자)
 */
export const SWIM_SIGN = { x: Math.round((CAMP_RAFTS[3].x + CAMP_RAFTS[4].x) / 2), y: CAMP_PIER.y - CAMP_PIER.w / 2 + 6 } as const;
/** 겨울 얼음낚시 구멍 (가장자리 언 곳). 11/26 좌대 4·6 지붕 옆 둘은 뺐다 (좌대 줄 양옆 둑 낚시 자리를 뺄 때 — 좌대에 붙어 보였다) */
export const ICE_HOLES: readonly Pt[] = [{ x: 1202, y: 456 }];
const DIR_NAME = ["down", "left", "right", "up"] as const;
/** 둑 낚시 자리 (석축 위 — 물을 본다, 접이 의자 그림) */
export const POND_SPOTS: readonly (Pt & { dir: "up" | "down" | "left" | "right" })[] = CAMP_FISHING_SPOTS.filter((f) => f.water === "reservoir" && campResEdge(f.x, f.y) > 0).map((f) => ({
  x: f.x,
  y: f.y,
  dir: DIR_NAME[f.facing] ?? "down",
}));
export const ROW_DOCK = CAMP_ROW_DOCK;
export const BUOY_LINE = CAMP_BUOY_LINE;
export const ROWBOATS = CAMP_ROWBOATS;
export const BOAT_SIGN = CAMP_BOAT_SIGN;
/** 절벽 양 끝 밑동 돌무더기 (바닥 가운데) */
export const SCREE: readonly (Pt & { seed: number; flip: boolean })[] = [
  { x: 462, y: 202, seed: 1, flip: false },
  { x: 836, y: 206, seed: 2, flip: true },
];
export const POOL_ROCKS = CAMP_POOL_ROCKS;
export const VENDING_ROW = CAMP_VENDING_ROW;
/** 계곡 족욕탕 (바닥 가운데 기준) · 아래 쉼 벤치 둘 */
export const FOOTBATH_AT = { x: CAMP_FOOTBATH.x, y: CAMP_FOOTBATH.y } as const;
export const FOOT_BENCHES: readonly Pt[] = [
  { x: 380, y: 262 },
  { x: 414, y: 262 },
];

// ── 소슬 펜션 구역 (펜션 2 아래 · 촌캉스 2 위 — 집터는 CAMP_LOTS 13~16) ──
export const LANE_X = 338;
export const VILLAGE_Y = 211;
export const PENSION_GATE = CAMP_PENSION_GATE;
export const SIDE_GATE = { x: 440, y: VILLAGE_Y } as const;
/** 놀이터: 대형 트램펄린(8인) · 워터 슬라이드(겨울엔 눈썰매장) */
export const TRAMPOLINE = CAMP_TRAMPOLINE;
export const SLIDE = CAMP_SLIDE;
/** 펜션 정원 (울타리 없는 잔디 마당) */
export const PGARDEN = { x0: 6, y0: 386, x1: 318, y1: 552 } as const;
export const PG_BENCH = { x: 160, y: 450 } as const;
export const PG_FIRE = CAMP_GARDEN_FIRE;
export const PG_WOOD = { x: 198, y: 506 } as const;
export const PG_SWING = { x: 136, y: 546 } as const;
export const PG_HAMMOCK = { x: 186, y: 540 } as const;
export const PG_PLANTERS: readonly (Pt & { len: number })[] = [
  { x: 30, y: 552, len: 30 },
  { x: 92, y: 552, len: 30 },
  { x: 300, y: 404, len: 22 },
  { x: 244, y: 404, len: 22 },
];
export const PG_SIGN = CAMP_PENSION_SIGN;
// 11/26 두 펜션 터를 같게 맞추며 사이 길(138~176) 가운데로
export const PG_ARCH = { x: 157, y: 306 } as const;
export const PG_LAMPS: readonly Pt[] = [
  { x: 143, y: 346 },
  { x: 171, y: 346 },
  { x: 112, y: 396 },
  { x: 212, y: 396 },
];
export const PG_SHRUBS: readonly (Pt & { v: number })[] = [
  { x: 122, y: 404, v: 0 },
  { x: 200, y: 404, v: 1 },
  { x: 314, y: 366, v: 0 },
  { x: 6, y: 372, v: 1 },
];
export const PG_TREE = { x: 26, y: 408 } as const;
// 11/26 달빛채 터가 넓어져(186~322) 자전거는 두 펜션 사이 길로
export const PG_BIKE = { x: 158, y: 262 } as const;
export const PG_CAR = { x: 48, y: 592 } as const;
/** 펜션마다 디딤돌 (계단 → 앞 길) */
export const PG_STEPS: readonly Pt[] = [
  { x: 59, y: 364 },
  { x: 57, y: 372 },
  { x: 227, y: 362 },
  { x: 225, y: 370 },
  { x: 164, y: 394 },
  { x: 160, y: 402 },
];

// ── 길 ──
export type CampPath = { id: string; hw: number; pts: readonly Pt[]; foot?: true };
function bankPath(side: -1 | 1, y0: number, y1: number, off: number): Pt[] {
  const out: Pt[] = [];
  for (let y = y0; y <= y1; y += 24) out.push({ x: Math.round(streamX(y) + side * off), y });
  return out;
}
/** 카라반 골목 (앞줄과 뒷줄 사이, 계곡을 따라) */
function alley(side: -1 | 1, y0: number, y1: number): Pt[] {
  return bankPath(side, y0, y1, 183);
}
const PL = POOL;
export const CAMP_PATHS: readonly CampPath[] = [
  // 정류장 → 관리소 앞 → 통나무 다리 → 캠프파이어 존 (폭 2칸)
  {
    id: "trail",
    hw: 16,
    pts: [
      { x: 214, y: 640 },
      { x: 284, y: 650 },
      { x: 318, y: 712 },
      { x: 404, y: 728 },
      { x: 520, y: 722 },
      { x: 600, y: LOG_BRIDGE_Y },
      { x: 680, y: LOG_BRIDGE_Y },
      { x: 780, y: 724 },
      { x: 900, y: 716 },
      { x: 936, y: 690 },
      { x: 1022, y: 672 },
    ],
  },
  // 펜션 마을: 정류장 → 입구 아치 → 오른쪽 길 → 마을 흙길 (집 사이를 굽이친다) · 족욕탕 쪽
  { id: "lane", hw: 16, pts: [{ x: 214, y: 640 }, { x: 290, y: 596 }, { x: 330, y: 560 }, { x: 330, y: 476 }, { x: LANE_X, y: 420 }, { x: LANE_X, y: VILLAGE_Y }] },
  { id: "village", hw: 14, pts: [{ x: LANE_X, y: VILLAGE_Y }, { x: 262, y: 213 }, { x: 171, y: 212 }, { x: 98, y: 214 }, { x: -4, y: 212 }] },
  { id: "toBbq", hw: 16, pts: [{ x: LANE_X, y: VILLAGE_Y }, { x: SIDE_GATE.x, y: VILLAGE_Y }] },
  // 촌캉스 두 집 사이 골목
  { id: "alley", hw: 8, pts: [{ x: 171, y: 212 }, { x: 171, y: 163 }, { x: 186, y: 163 }] },
  // 펜션 앞 정원 길 (마을 길 → 두 펜션 사이 → 정원 앞 → 오른쪽 길)
  { id: "pgap", foot: true, hw: 10, pts: [{ x: 166, y: 212 }, { x: 166, y: 378 }] },
  { id: "pfront", foot: true, hw: 10, pts: [{ x: 8, y: 378 }, { x: 166, y: 378 }, { x: 334, y: 380 }] },
  // 물가 길 (왼쪽·오른쪽 둑) — 소 둑에서 시작해 통나무 다리까지
  { id: "bankL", foot: true, hw: 16, pts: [{ x: PL.x - PL.rx - 14, y: PL.y + 10 }, { x: PL.x - 130, y: PL.y + 66 }, ...bankPath(-1, 372, 712, 52)] },
  { id: "bankR", foot: true, hw: 16, pts: [{ x: PL.x + PL.rx + 14, y: PL.y + 10 }, { x: PL.x + 130, y: PL.y + 66 }, ...bankPath(1, 372, 712, 52)] },
  // 소 앞 둑길 → 폭포 다리
  { id: "rimL", hw: 16, pts: [{ x: PL.x - 130, y: PL.y + 66 }, { x: PL.x - 70, y: VIEW_BRIDGE.y }, { x: PL.x - 30, y: VIEW_BRIDGE.y }] },
  { id: "rimR", hw: 16, pts: [{ x: PL.x + 130, y: PL.y + 66 }, { x: PL.x + 70, y: VIEW_BRIDGE.y }, { x: PL.x + 30, y: VIEW_BRIDGE.y }] },
  // 카라반 골목 (앞줄과 뒷줄 사이)
  { id: "alleyL", foot: true, hw: 16, pts: [{ x: PL.x - PL.rx - 14, y: PL.y + 10 }, ...alley(-1, 330, 640), { x: streamX(664) - 160, y: 690 }, { x: 520, y: 722 }] },
  { id: "alleyR", foot: true, hw: 16, pts: [{ x: PL.x + PL.rx + 14, y: PL.y + 10 }, ...alley(1, 330, 640), { x: streamX(664) + 170, y: 690 }, { x: 900, y: 716 }] },
  // 징검다리 가로질러 (왼쪽 골목 ↔ 오른쪽 골목)
  { id: "stones", foot: true, hw: 16, pts: [{ x: streamX(STONES_Y) - 183, y: STONES_Y }, { x: streamX(STONES_Y) - 40, y: STONES_Y }] },
  { id: "stones2", foot: true, hw: 16, pts: [{ x: streamX(STONES_Y) + 40, y: STONES_Y }, { x: streamX(STONES_Y) + 183, y: STONES_Y }] },
  // 펜션 쪽문 → 소 왼쪽 둑
  { id: "west", hw: 16, pts: [{ x: SIDE_GATE.x, y: SIDE_GATE.y }, { x: 452, y: 250 }, { x: PL.x - PL.rx - 14, y: PL.y + 10 }] },
  // 소 오른쪽 둑 → 저수지 서쪽 둑길
  { id: "east", hw: 16, pts: [{ x: PL.x + PL.rx + 14, y: PL.y + 10 }, { x: 890, y: 292 }, { x: RES.x0 - RING, y: 292 }] },
  // 저수지 둘레 둑길 (네모 한 바퀴, 폭 2칸)
  {
    id: "ring",
    hw: 16,
    pts: [
      { x: RES.x0 - RING, y: RES.y0 - RING },
      { x: RES.x1 + RING, y: RES.y0 - RING },
      { x: RES.x1 + RING, y: RES.y1 + RING },
      { x: RES.x0 - RING, y: RES.y1 + RING },
      { x: RES.x0 - RING, y: RES.y0 - RING },
    ],
  },
  // 저수지 남서쪽 → 캠프파이어 존
  { id: "pondW", hw: 16, pts: [{ x: RES.x0 - RING, y: RES.y1 + RING }, { x: 1000, y: 530 }, { x: FIRE.x - 52, y: FIRE.y - 60 }] },
  // 캠프파이어 존 안: 광장 ↔ 불멍 자리 둘 · 간식 수레
  { id: "pits", foot: true, hw: 14, pts: [{ x: PITS[0].x + 20, y: PITS[0].y + 10 }, { x: 1030, y: 640 }, { x: 1022, y: 672 }, { x: 1010, y: 720 }, { x: PITS[1].x + 24, y: PITS[1].y }] },
  { id: "snack", foot: true, hw: 14, pts: [{ x: FIRE.x + 70, y: FIRE.y + 66 }, { x: SNACK.x - 20, y: SNACK.y + 4 }] },
];
export const PATHS = CAMP_PATHS;

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}
type Seg = { a: Pt; b: Pt; hw: number; foot: boolean; x0: number; y0: number; x1: number; y1: number };
const SEGS: Seg[] = CAMP_PATHS.flatMap((p) =>
  p.pts.slice(1).map((b, i) => {
    const a = p.pts[i];
    return { a, b, hw: p.hw, foot: !!p.foot, x0: Math.min(a.x, b.x) - p.hw - 4, y0: Math.min(a.y, b.y) - p.hw - 4, x1: Math.max(a.x, b.x) + p.hw + 4, y1: Math.max(a.y, b.y) + p.hw + 4 };
  }),
);
/** 길 가장자리까지 거리 (0 이하면 길 위). which: 흙길만(main)·눈 다진 오솔길만(foot)·둘 다 */
export function pathEdgeDist(x: number, y: number, pad = 0, which: "all" | "main" | "foot" = "all"): number {
  let best = 1e9;
  for (const s of SEGS) {
    if (which === "main" && s.foot) continue;
    if (which === "foot" && !s.foot) continue;
    if (x < s.x0 - pad || x > s.x1 + pad || y < s.y0 - pad || y > s.y1 + pad) continue;
    const d = segDist(x, y, s.a, s.b) - s.hw;
    if (d < best) best = d;
  }
  return best;
}

// ── 바닥 종류 (그림·미니맵 공통) ──
export type CampGround = "grass" | "path" | "foot" | "plaza" | "road" | "water" | "pool" | "bank" | "rock" | "pad" | "cliff" | "river" | "pond" | "brook" | "embank";
export function campGroundKind(x: number, y: number): CampGround {
  const wob = (hashU(x >> 2, y >> 2, 7) - 0.5) * 3;
  if (inCliffFace(x, y)) return "cliff";
  if (onPlateau(x, y)) {
    if (Math.abs(x - upperRiverX(y)) <= UPPER_RIVER_HW) return "river";
    if (Math.abs(x - upperRiverX(y)) <= UPPER_RIVER_HW + 5 + wob) return "bank";
    return "grass";
  }
  const pd = poolD(x, y);
  if (pd <= 1) return "pool";
  if (y > CAMP_STREAM_TOP && Math.abs(x - streamX(y)) <= STREAM_HW) return "water";
  if (pd <= 1.07 + wob * 0.01 || (y > CAMP_STREAM_TOP && Math.abs(x - streamX(y)) <= STREAM_HW + 6 + wob)) return "bank";
  // 절벽 밑 돌무더기 띠
  if (x > CLIFF_X0 && x < CLIFF_X1 && y < cliffBase(x) + 8 + wob) return "rock";
  if (inRect(ROAD, x, y) && y >= ROAD.y + 2 + wob * 0.5) {
    const ex = ROAD.x + ROAD.w - 28;
    if (x <= ex) return "road";
    const dx = (x - ex) / 28;
    const dy = (y - (ROAD.y + ROAD.h / 2)) / (ROAD.h / 2);
    if (dx * dx + dy * dy <= 1) return "road";
  }
  const re = resEdge(x, y);
  if (re <= 0) return "pond";
  if (re <= EMBANK && !(x < RES.x0 && Math.abs(y - PIER.y) <= PIER.w / 2)) return "embank";
  for (const p of PITS) if (Math.hypot(x - p.x, (y - p.y - 4) * 1.25) <= 26 + wob) return "plaza";
  if (Math.hypot(x - FIRE.x, (y - FIRE.y) * 1.12) <= PLAZA_R + wob) return "plaza";
  if (Math.hypot(x - SMALL_FIRE.x, (y - SMALL_FIRE.y - 6) * 1.25) <= 30 + wob) return "plaza";
  if (inSite(x, y, -1)) return "pad";
  if (pathEdgeDist(x, y, 0, "main") <= wob * 0.6) return "path";
  if (pathEdgeDist(x, y, 0, "foot") <= wob * 0.6) return "foot";
  return "grass";
}

// ── 낚시 자리 (소 바위 + 계곡 둑 — 나무가 비켜 선다) ──
export const FISH_SPOTS: readonly (Pt & { facing: "up" | "left" | "right" })[] = CAMP_FISHING_SPOTS.filter((f) => f.water === "pool" || f.water === "valley").map((f) => ({
  x: f.x,
  y: f.y,
  facing: f.facing === 1 ? "left" : f.facing === 2 ? "right" : "up",
}));

// ── 나무 (시드 고정, 길·물·자리·시설을 피해서) ──
export type CampTreeKind = "spruce" | "pine" | "fir" | "maple" | "mapleO" | "yellow" | "bush";
export type CampTree = { kind: CampTreeKind; x: number; y: number; v: number };
export type CampDecorKind = "leafPile" | "mushroom" | "fern" | "pebbles";
export type CampDecor = { kind: CampDecorKind; x: number; y: number; v: number };

/** 나무가 서면 안 되는 자리 (길·물·절벽·집터·시설·자리·상호작용) */
export function keepClear(x: number, y: number): boolean {
  if (pathEdgeDist(x, y, 20) < 12) return true;
  if (y > CAMP_STREAM_TOP && Math.abs(x - streamX(y)) < STREAM_HW + 16) return true;
  if (poolD(x, y) < 1.16) return true;
  // 절벽 면과 밑동 (나무는 마루 위나 밑동 앞 땅에만)
  if (x > CLIFF_X0 - 6 && x < CLIFF_X1 + 6 && y > cliffTop(x) - 6 && y < cliffBase(x) + 16) return true;
  if (onPlateau(x, y) && Math.abs(x - upperRiverX(y)) < UPPER_RIVER_HW + 12) return true;
  if (Math.hypot(x - FIRE.x, (y - FIRE.y) * 1.1) < PLAZA_R + 24) return true;
  if (inRect(OFFICE_RECT, x, y, 22)) return true;
  if (x < 330 && y > BUS_STOP.y - 64 && y < ROAD.y + ROAD.h + 40) return true;
  if (x >= 290 && x < 560 && y > 660) return true;
  if (inRect(BBQ.area, x, y, 14)) return true;
  if (resEdge(x, y) < RING + 22) return true;
  // 집터 (나무 줄기가 발자국 아래 34px 안이면 우듬지가 마당을 가린다) · 놀이터 · 족욕탕
  if (inHome(x, y, 10, 4, 34)) return true;
  if (x > PGARDEN.x0 - 4 && x < PGARDEN.x1 + 4 && y > PGARDEN.y0 - 30 && y < PGARDEN.y1 + 6) return true;
  if (x >= 350 && x < 446 && y > 56 && y < 300) return true;
  if (x >= 340 && x < 460 && y > 56 && y < 214) return true;
  if ((Math.abs(x - BOOTH.x) < 40 && y > BOOTH.y - 56 && y < BOOTH.y + 40) || Math.hypot(x - POND_SIGN.x, y - POND_SIGN.y) < 20) return true;
  for (const p of PITS) if (Math.hypot(x - p.x, y - p.y) < 50) return true;
  if (x < 100 && y > 560 && y < 620) return true;
  if (Math.hypot(x - SNACK.x, y - SNACK.y) < 30) return true;
  for (const w of WOOD_STACKS) if (Math.hypot(x - w.x, y - w.y) < 18) return true;
  if (Math.hypot(x - PENSION_GATE.x, y - PENSION_GATE.y) < 36) return true;
  for (const n of CAMP_NPCS) if (Math.hypot(x - n.x, y - n.y) < 28) return true;
  for (const f of POND_SPOTS) if (Math.hypot(x - f.x, y - f.y) < 20) return true;
  for (const s of SITES) if (Math.abs(x - s.x) < SITE_W / 2 + 12 && y > s.y - SITE_H / 2 - 4 && y < s.y + SITE_H / 2 + 26) return true;
  for (const f of FISH_SPOTS) if (Math.hypot(x - f.x, y - f.y) < 20) return true;
  if (Math.hypot(x - SMALL_FIRE.x, y - SMALL_FIRE.y) < 40) return true;
  if (Math.hypot(x - BOARD_SPOT.x, y - BOARD_SPOT.y) < 26) return true;
  if (x > VENDING_ROW[0].x - 24 && x < VENDING_ROW[2].x + 22 && y > VENDING_ROW[0].y - 44 && y < VENDING_ROW[0].y + 30) return true;
  if (x > BOAT_SIGN.x - 18 && x < BOAT_SIGN.x + 18 && y > BOAT_SIGN.y - 20 && y < BOAT_SIGN.y + 30) return true;
  for (const r of POOL_ROCKS) if (Math.hypot(x - r.x, y - r.y) < 26) return true;
  for (const r of SCREE) if (Math.abs(x - r.x) < 40 && y > r.y - 34 && y < r.y + 22) return true;
  // 채집 지점 (나무가 그 자리를 비켜 선다)
  for (const n of CAMP_GATHER_NODES) if (Math.hypot(x - n.x, y - n.y) < 18) return true;
  return false;
}
function treeKindFor(x: number, y: number, u: number): CampTreeKind {
  const nearWater = (y > CAMP_STREAM_TOP && Math.abs(x - streamX(y)) < 120) || poolD(x, y) < 1.6 || onPlateau(x, y);
  if (nearWater) return u < 0.38 ? "spruce" : u < 0.62 ? "fir" : u < 0.74 ? "pine" : u < 0.86 ? "yellow" : u < 0.94 ? "mapleO" : "bush";
  return u < 0.22 ? "spruce" : u < 0.34 ? "pine" : u < 0.46 ? "fir" : u < 0.64 ? "yellow" : u < 0.76 ? "maple" : u < 0.88 ? "mapleO" : "bush";
}
function buildTrees(): CampTree[] {
  const out: CampTree[] = [];
  const r = seeded(20261121);
  const step = 30;
  for (let gy = -1; gy * step < MH + step; gy++)
    for (let gx = -1; gx * step < MW + step; gx++) {
      const x = Math.round(gx * step + 8 + r() * (step - 10) + (gy % 2 ? step / 2 : 0));
      const y = Math.round(gy * step + 10 + r() * (step - 12));
      const u = r();
      const kindU = r();
      const v = Math.floor(r() * 4);
      if (x < -8 || x > MW + 8 || y < 8 || y > MH + 30) continue;
      if (keepClear(x, y)) continue;
      const border = x < 30 || x > MW - 30 || y < 56 || y > MH - 6;
      // 마루 위는 빽빽하게 (폭포를 감싸는 숲), 카라반 사이는 드문드문
      const between = SITES.some((s) => Math.abs(x - s.x) < SITE_W && Math.abs(y - s.y) < SITE_H);
      const edge = x < 46 || x > MW - 40 || y < 70 || y > MH - 40;
      const p = border || edge || onPlateau(x, y) ? 1 : between ? 0.35 : 0.38;
      if (u > p) continue;
      out.push({ kind: treeKindFor(x, y, kindU), x, y, v });
    }
  return out;
}
export const CAMP_TREES: readonly CampTree[] = buildTrees();

/** 소 둘레·절벽 밑 바위 (눈 얹은 큰 바위 — s = 크기) */
export const ROCKS: readonly (Pt & { v: number; s: number })[] = (() => {
  const out: (Pt & { v: number; s: number })[] = [];
  const r = seeded(4401);
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (0.02 + (i / 26) * 0.96) + (r() - 0.5) * 0.08;
    const k = 1.04 + r() * 0.06;
    const x = Math.round(POOL.x + Math.cos(a + Math.PI) * POOL.rx * k);
    const y = Math.round(POOL.y - Math.sin(a) * POOL.ry * k);
    out.push({ x, y, v: i % 2, s: 0.6 + r() * 0.5 });
  }
  for (const a of [0.18, 0.3, 0.7, 0.82]) {
    const ang = Math.PI * (1 + a);
    out.push({ x: Math.round(POOL.x + Math.cos(ang) * POOL.rx * 1.05), y: Math.round(POOL.y - Math.sin(ang) * POOL.ry * 1.06), v: 1, s: 0.55 });
  }
  return out.filter(
    (p) =>
      pathEdgeDist(p.x, p.y) > 4 &&
      !FISH_SPOTS.some((f) => Math.hypot(f.x - p.x, f.y - p.y) < 14) &&
      !POOL_ROCKS.some((f) => Math.hypot(f.x - p.x, f.y - p.y) < 22) &&
      !(p.x > 818 && p.x < 912 && p.y > 220 && p.y < 278) &&
      !(Math.abs(p.x - FALL_X) < 74 && p.y < POOL.y),
  );
})();

/** 길가 등 기둥 (물가 오솔길·골목·폭포 다리 앞·저수지·펜션 길) */
export const LAMPS: readonly Pt[] = [
  ...[420, 520].map((y) => ({ x: Math.round(streamX(y) - 78), y })),
  // 11/26 셋째 등(578,620)은 카라반 3번 자리 오른쪽 끝 바로 옆이라 에어스트림·버스 3단계 꼬리·바퀴가 등에 닿고 문 앞 길에 걸렸다 →
  // 카라반 꼬리(x 607)·물가 덤불 오른쪽 물가 쪽 위로 (빛은 물가 길·낚시 자리·카라반 앞까지 닿는다)
  { x: 620, y: 606 },
  // 11/26 첫 등은 카라반 4번 마당 의자 바로 밑이라 물가 쪽 아래로 (길 밝히기는 그대로)
  // 11/26 그 자리(710,486)는 물가 광석 자리 qo720_470 왼쪽을 가려서 길 건너 풀밭으로 (빛은 길·광석 자리까지 닿는다. 광석 자리 id는 서버가 쓰니 등을 옮김)
  { x: 740, y: 496 },
  ...[570, 670].map((y) => ({ x: Math.round(streamX(y) + 78), y })),
  { x: 498, y: 356 },
  { x: POOL.x + 112, y: POOL.y + 84 },
  { x: 466, y: 240 },
  { x: RES.x0 - RING - 22, y: 360 },
  { x: RES.x0 - RING - 22, y: 130 },
  { x: RES.x1 + RING + 20, y: 260 },
  { x: 1040, y: 530 },
  { x: 352, y: 470 },
  { x: 160, y: 192 },
  { x: 16, y: 392 },
];

/** 바닥 소품 (나무 밑 낙엽 무더기·버섯·고사리, 물가 자갈 — 겨울 판은 campSkin이 눈 더미로 바꾼다) */
export const CAMP_DECOR: readonly CampDecor[] = (() => {
  const out: CampDecor[] = [];
  const r = seeded(77121);
  for (const t of CAMP_TREES) {
    if (r() > 0.4) continue;
    const kind: CampDecorKind = t.kind === "spruce" || t.kind === "fir" ? (r() < 0.5 ? "fern" : "mushroom") : "leafPile";
    const x = Math.round(t.x + (r() - 0.5) * 22);
    const y = Math.round(t.y + 4 + r() * 8);
    if (pathEdgeDist(x, y) < 4 || keepClear(x, y) || inCliffFace(x, y)) continue;
    out.push({ kind, x, y, v: Math.floor(r() * 3) });
  }
  for (let y = 360; y < MH; y += 46) {
    const side = Math.floor(y / 46) % 2 ? 1 : -1;
    const x = Math.round(streamX(y) + side * (STREAM_HW + 9));
    if (Math.abs(y - VIEW_BRIDGE.y) < 26 || Math.abs(y - STONES_Y) < 16 || Math.abs(y - LOG_BRIDGE_Y) < 22) continue;
    out.push({ kind: "pebbles", x, y, v: Math.floor(r() * 3) });
  }
  return out;
})();

// ── 충돌 ──

/** 관리소·매점 */
export const CAMP_OFFICE_COLLIDER: Rect = { x: CAMP_OFFICE.x - CAMP_OFFICE_W / 2 + 2, y: CAMP_OFFICE.y - 36, w: CAMP_OFFICE_W - 4, h: 36 };
/** 큰 모닥불 돌 고리 (점프로도 못 넘는다) */
export const CAMP_FIRE_COLLIDER: Rect = { x: FIRE.x - 22, y: FIRE.y - 10, w: 44, h: 14 };
/** 정류장 지붕: 뒷벽 + 앞 기둥 둘 (가운데 벤치 자리는 비운다) */
export const CAMP_SHELTER_W = 64;
export const CAMP_SHELTER_H = 52;
function shelterColliders(): Rect[] {
  const s = CAMP_BUS_STOP;
  const half = CAMP_SHELTER_W / 2;
  return [
    { x: s.x - half + 2, y: s.y - 26, w: CAMP_SHELTER_W - 4, h: 4 },
    { x: s.x - half + 2, y: s.y - 5, w: 4, h: 5 },
    { x: s.x + half - 6, y: s.y - 5, w: 4, h: 5 },
  ];
}
/** 절벽 (4px 띠마다 맵 위 끝 → 밑동 조금 위까지) + 양 끝 돌무더기 */
export function cliffColliders(): Rect[] {
  const out: Rect[] = [];
  for (let x = CLIFF_X0; x < CLIFF_X1; x += 4) {
    let b = -1;
    for (let k = 0; k < 4; k++) b = Math.max(b, cliffBase(x + k));
    if (b <= 0) continue;
    // 소 낚시 바위 가까이는 밑동 바로 위까지만 (바위에 앉고 일어설 자리를 남긴다)
    out.push({ x, y: 0, w: 4, h: Math.max(4, b - 6) });
  }
  for (const r of SCREE) out.push({ x: r.x - 28, y: r.y - 16, w: 56, h: 14 });
  return out;
}
/** 줄기 충돌 (덤불은 작게) */
export function treeCollider(t: CampTree): Rect {
  if (t.kind === "bush") return { x: t.x - 6, y: t.y - 4, w: 12, h: 4 };
  if (t.kind === "spruce" || t.kind === "pine" || t.kind === "fir") return { x: t.x - 4, y: t.y - 4, w: 8, h: 4 };
  return { x: t.x - 3, y: t.y - 4, w: 6, h: 4 };
}
function post(p: Pt, w = 4, h = 4): Rect {
  return { x: p.x - w / 2, y: p.y - h, w, h };
}
/** 펜션 구역·놀이터 소품 */
function gardenColliders(): Rect[] {
  return [
    // 워터 슬라이드 탑 · 작은 풀 (겨울엔 눈썰매 언덕 — 같은 자리)
    { x: SLIDE.x - 2, y: SLIDE.y - 14, w: 30, h: 22 },
    { x: SLIDE.pool.x - SLIDE.pool.rx, y: SLIDE.pool.y - SLIDE.pool.ry, w: SLIDE.pool.rx * 2, h: SLIDE.pool.ry * 2 },
    // 11/26 해먹은 기둥 둘만 막는다 (가운데로 다가가 눕는다 — campHammock)
    ...MAP_HAMMOCKS.flatMap((h) => campHammockColliders(h)),
    ...PG_PLANTERS.map((p) => post(p, p.len, 5)),
    { x: PG_ARCH.x - 19, y: PG_ARCH.y - 4, w: 4, h: 4 },
    { x: PG_ARCH.x + 15, y: PG_ARCH.y - 4, w: 4, h: 4 },
    ...PG_LAMPS.map((p) => post(p, 4, 3)),
    ...PG_SHRUBS.map((p) => post(p, 12, 4)),
    post(PG_TREE, 10, 4),
    post(PG_BIKE, 18, 4),
    post(PG_CAR, 38, 10),
    post(PG_SIGN, 40, 5),
    post(PG_WOOD, 22, 5),
  ];
}
/** 좌대 둘레 막이 폭 (헤엄치는 사람이 좌대 그림 밑으로 파고들지 않게). 11/26 좌대는 모두 잔교에서 걸어 들어간다 (1~3 큰 잔교 · 4~6 북쪽 잔교) */
const RAFT_RIM = 5;
/**
 * 11/26 물 건너 좌대(4~6) 앞 사다리 (운영자: 헤엄쳐 가서 사다리로만 오르내린다). foot = 물속 사다리 밑, top = 올라선 마루 자리,
 * gap = 둘레 막이에서 비워 둔 사다리 칸 (여기로만 물 ↔ 마루). 그림 valleyExtraArt raft4Art 앞 사다리 (x ±4, 마루 아래 끝 → 받침)
 */
export type RaftLadder = { n: number; x: number; foot: Pt; top: Pt; gap: Rect };
export const RAFT_LADDERS: readonly RaftLadder[] = RAFTS.filter((r) => !r.link).map((r) => ({
  n: r.n,
  x: r.x,
  foot: { x: r.x, y: r.y + 9 },
  top: { x: r.x, y: r.y - 14 },
  gap: { x: r.x - 6, y: r.y - 8, w: 12, h: 12 },
}));
/** 좌대 그림 둘레(물 위)를 막는다: 마루(campRaftDeck)는 걷고, 둘레 물은 사다리 칸 말고는 못 지나간다 */
export function raftRimColliders(): Rect[] {
  const out: Rect[] = [];
  for (const r of RAFTS) {
    const d = campRaftDeck(r);
    const x0 = d.x - RAFT_RIM;
    const x1 = d.x + d.w + RAFT_RIM;
    const y1 = r.y + 4;
    // 뒤 (물 건너 좌대). 오두막 지붕까지 덮어 헤엄치는 사람이 지붕 밑에 숨지 않게
    if (!r.link) out.push({ x: x0, y: r.y - CAMP_RAFT_ART_H + 2, w: x1 - x0, h: d.y - (r.y - CAMP_RAFT_ART_H + 2) });
    else {
      // 11/26 잔교에 붙은 좌대: 잔교 아래 끝 → 마루 뒤 끝 사이는 판자 다리(campRaftWalks) 칸만 열고 나머지(다리 난간·오두막 뒤·다리 바깥 물)는 막는다
      const top = PIER.y + PIER.w / 2;
      let x = x0;
      for (const w of campRaftWalks(r)) {
        if (w.x > x) out.push({ x, y: top, w: w.x - x, h: d.y - top });
        x = w.x + w.w + 1;
      }
      if (x1 > x) out.push({ x, y: top, w: x1 - x, h: d.y - top });
    }
    // 양옆
    out.push({ x: x0, y: d.y, w: RAFT_RIM, h: y1 - d.y }, { x: d.x + d.w, y: d.y, w: RAFT_RIM, h: y1 - d.y });
    // 앞 (말뚝·물 띠) — 물 건너 좌대는 가운데 사다리 칸을 비운다
    const by = d.y + d.h;
    const gap = RAFT_LADDERS.find((l) => l.n === r.n)?.gap;
    if (!gap) out.push({ x: d.x, y: by, w: d.w, h: y1 - by });
    else out.push({ x: d.x, y: by, w: gap.x - d.x, h: y1 - by }, { x: gap.x + gap.w, y: by, w: d.x + d.w - gap.x - gap.w, h: y1 - by });
  }
  return out;
}

/** 저수지 시설: 좌대 오두막(가운데 뒤)·둘레 막이 · 관리 부스 · 팻말 */
function fishingColliders(): Rect[] {
  return [
    // 11/26 좌대를 넓혀 오두막이 9 뒤로 (그림 72×57 — 오두막 밑동 = 받침 − 37)
    ...RAFTS.map((r) => ({ x: r.x - 14, y: r.y - 49, w: 28, h: 12 })),
    ...raftRimColliders(),
    // 미끼·대여 부스 (그림·말 걸기는 world/forage/Foraging — 맵은 52×48 자리만 비워 두고 밑동을 막는다)
    { x: BOOTH.x - 26, y: BOOTH.y - 12, w: 52, h: 12 },
    post(POND_SIGN, 24, 4),
    post(BOAT_SIGN, 14, 4),
    post(SWIM_SIGN, 14, 4),
  ];
}
/** 족욕탕: 뒤 대나무 울 · 가운데 탕 · 데크 둘레 (앞 계단으로만 오른다 — 데크 위 양옆 벤치는 걷는다) */
function footbathColliders(): Rect[] {
  const x0 = CAMP_FOOTBATH.x - CAMP_FOOTBATH.w / 2;
  const y0 = CAMP_FOOTBATH.y - CAMP_FOOTBATH.h;
  const W = CAMP_FOOTBATH.w;
  return [
    { x: x0, y: y0 + 18, w: W, h: 12 },
    // 탕 물 (돌 테는 걸터앉는 자리라 막지 않는다 — 그림 물 P0 18·32 ~ P1 61·92)
    { x: x0 + 19, y: y0 + 30, w: W - 38, h: 62 },
    // 11/26 데크는 앞 가운데 계단으로만 오른다 (양옆·앞 끝은 막는다 — 운영자 「입구로만」). 계단 = 그림 x 30~49
    { x: x0 - 3, y: y0 + 20, w: 3, h: 92 },
    { x: x0 + W, y: y0 + 20, w: 3, h: 92 },
    { x: x0 + 2, y: y0 + 108, w: 28, h: 4 },
    { x: x0 + 50, y: y0 + 108, w: W - 52, h: 4 },
  ];
}
/** 캠프파이어 존·소 둘레 소품 */
function propColliders(): Rect[] {
  return [
    CAMP_FIRE_COLLIDER,
    ...LIGHT_POLES.map((p) => post(p, 4, 3)),
    { x: SMALL_FIRE.x - 9, y: SMALL_FIRE.y - 6, w: 18, h: 7 },
    ...PITS.map((p) => ({ x: p.x - 9, y: p.y - 6, w: 18, h: 7 })),
    { x: PG_FIRE.x - 9, y: PG_FIRE.y - 6, w: 18, h: 7 },
    post(SNACK, 40, 8),
    ...WOOD_STACKS.map((w) => post(w, 22, 5)),
    { x: BBQ.grill.x - 12, y: BBQ.grill.y - 5, w: 24, h: 5 },
    { x: BBQ.table.x - 22, y: BBQ.table.y - 4, w: 44, h: 4 },
    ...VENDING_ROW.map((v) => ({ x: v.x - 10, y: v.y - 6, w: 20, h: 6 })),
    ...LAMPS.map((p) => post(p, 4, 3)),
    ...ROCKS.map((r) => ({ x: r.x - 11 * r.s, y: r.y - 6 * r.s, w: 22 * r.s, h: 6 * r.s })),
  ];
}

// ── NPC ── (발밑 충돌은 늘 서 있는 사람만. 기타 캠퍼는 시간대에만 나와 막지 않는다)
/** 그 시각(KST 0~24)에 그 NPC가 나와 있는지. 기타 캠퍼는 밤 9~11시 */
export function campNpcActive(id: CampNpcId, hour: number): boolean {
  if (id === "guitarist") return hour >= 21 && hour < 23;
  return true;
}
export function npcCollider(n: { id: CampNpcId; x: number; y: number }): Rect | null {
  return n.id === "guitarist" ? null : { x: n.x - 6, y: n.y - 5, w: 12, h: 5 };
}

/** 가구 충돌 (점프 중엔 넘는다) */
export function campFurnitureCollider(f: Furniture): Rect | null {
  if (/^q[LSG]\d/.test(f.id) || f.id === "qP4") return { x: f.x - 5, y: f.y - 5, w: 10, h: 5 }; // 통나무 의자
  if (f.id.startsWith("qT")) return null; // 족욕탕 방석 (데크 위 — 막지 않는다)
  if (f.kind === "bench") {
    const w = f.seatOffsets.length >= 3 ? 56 : f.seatOffsets.length === 2 && Math.abs(f.seatOffsets[1] - f.seatOffsets[0]) <= 16 ? 30 : 40;
    return { x: f.x - w / 2, y: f.y - 7, w, h: 7 };
  }
  return { x: f.x - 6, y: f.y - 6, w: 12, h: 6 };
}

// ── 모든 충돌 ──
export function campStaticColliders(): Rect[] {
  return [
    CAMP_OFFICE_COLLIDER,
    ...shelterColliders(),
    { x: CAMP_BUS_SIGN.x - 2, y: CAMP_BUS_SIGN.y - 4, w: 4, h: 4 },
    { x: CAMP_BUS_TIMETABLE.x - 6, y: CAMP_BUS_TIMETABLE.y - 4, w: 12, h: 4 },
    { x: CAMP_BOARD_SPOT.x - 13, y: CAMP_BOARD_SPOT.y - 5, w: 26, h: 5 },
    ...cliffColliders(),
    ...viewBridgeRailColliders(),
    ...footbathColliders(),
    ...fishingColliders(),
    ...gardenColliders(),
    ...propColliders(),
    ...CAMP_NPCS.map(npcCollider).filter((r): r is Rect => r !== null),
    ...CAMP_TREES.map(treeCollider),
  ];
}
export function campFurnitureColliders(): Rect[] {
  // 11/26 대형 트램펄린 매트는 가구처럼 (점프 중엔 넘는다 — 뛰어내릴 때 매트 위에서 밖으로 폴짝)
  const T = TRAMPOLINE;
  return [...CAMP_FURNITURE.map(campFurnitureCollider).filter((r): r is Rect => r !== null), { x: T.x - T.rx + 2, y: T.y - T.ry + 4, w: T.rx * 2 - 4, h: T.ry * 2 - 4 }];
}

let standRects: Rect[] | null = null;
/** 발 상자(8×5, 발바닥이 아랫변)를 (x,y)에 놓아 맵 안이고 어떤 충돌에도 닿지 않는지 (물은 헤엄쳐 다니니 걸을 수 있는 칸) */
export function campStandable(x: number, y: number): boolean {
  const b = CAMP_BOUNDS;
  if (!(x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY)) return false;
  standRects ??= [...campStaticColliders(), ...campFurnitureColliders()];
  const fx = x - 4;
  const fy = y - 5;
  for (const r of standRects) if (fx < r.x + r.w && fx + 8 > r.x && fy < r.y + r.h && fy + 5 > r.y) return false;
  return true;
}

/**
 * 걷기 격자 (cell px, 0 = 걸을 수 있음, 1 = 막힘). 칸 가운데에 발 상자를 놓아 판정.
 * 11/26 swim = false(기본)면 물(소·계곡·저수지)도 막는다 — 걸어 다니는 주민·고블린 길찾기용 (사람은 헤엄쳐 들어간다)
 */
export type CampWalkGrid = { cell: number; cols: number; rows: number; cells: Uint8Array };
export function campWalkGrid(cell = 8, swim = false): CampWalkGrid {
  const cols = Math.ceil(CAMP_WIDTH / cell);
  const rows = Math.ceil(CAMP_HEIGHT / cell);
  const cells = new Uint8Array(cols * rows);
  const b = CAMP_BOUNDS;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = x * cell + cell / 2;
      const py = y * cell + cell / 2;
      if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) cells[y * cols + x] = 1;
      else if (!swim && (campWet(px, py) || campWet(px - 3, py) || campWet(px + 3, py) || campWet(px, py - 3))) cells[y * cols + x] = 1;
    }
  const block = (r: Rect) => {
    const c0 = Math.max(0, Math.ceil((r.x - 4 - cell / 2) / cell));
    const c1 = Math.min(cols - 1, Math.floor((r.x + r.w + 4 - cell / 2) / cell));
    const r0 = Math.max(0, Math.ceil((r.y - cell / 2) / cell));
    const r1 = Math.min(rows - 1, Math.floor((r.y + r.h + 5 - cell / 2) / cell));
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) cells[y * cols + x] = 1;
  };
  for (const r of [...campStaticColliders(), ...campFurnitureColliders()]) block(r);
  return { cell, cols, rows, cells };
}

// ── 상호작용 ──
export const CAMP_INTERACTABLES: readonly CampInteractable[] = [
  // 11/18 타는 곳은 바닥 정차 칸 전체 (zone — game/bus/busBays)
  { id: "bus:village", kind: "bus", x: CAMP_BOARD.x, y: CAMP_BOARD.y, r: 22, zone: CAMP_BUS_BAY, label: "마을행 버스 타기" },
  ...CAMP_NPCS.map((n): CampInteractable => ({ id: `npc:${n.id}`, kind: "npc", npc: n.id, x: n.x, y: n.y + 10, r: 26, label: `${n.name}에게 말 걸기` })),
  { id: "board", kind: "board", x: CAMP_BOARD_SPOT.x, y: CAMP_BOARD_SPOT.y + 12, r: 20, label: "의뢰판 보기" },
  { id: "sign", kind: "sign", x: CAMP_BUS_SIGN.x, y: CAMP_BUS_SIGN.y + 12, r: 18, label: "표지판 보기" },
  // 11/26 카라반·펜션 분양 입간판은 뺐다 (운영자 「헷갈려한다」 → 「카라반, 촌캉스도 NPC만으로 통일」) — 분양은 언젠가 씨·소슬댁·순이 할머니에게 말을 걸어서만
  { id: "bbq", kind: "bbq", x: BBQ.grill.x, y: BBQ.grill.y + 14, r: 28, label: "바베큐 사 먹기" },
  { id: "snack", kind: "bbq", x: SNACK.x, y: SNACK.y + 12, r: 24, label: "간식 사 먹기" },
  ...VENDING_ROW.map((v, i): CampInteractable => ({ id: i ? `vending${i + 1}` : "vending", kind: "vending", x: v.x, y: v.y + 12, r: 14, label: "음료 뽑기" })),
  // 11/26 놀이터: 트램펄린은 앞 가운데 사다리(입구)에서만, 워터 슬라이드(겨울엔 눈썰매)는 탑 오른쪽 사다리 밑
  { id: "tramp", kind: "tramp", x: CAMP_TRAMP_GATE.x, y: CAMP_TRAMP_GATE.y, r: 14, label: "트램펄린 뛰기" },
  { id: "slide", kind: "slide", x: CAMP_SLIDE_SEAT.x, y: CAMP_SLIDE_SEAT.y, r: 18, label: "워터 슬라이드 타기" },
  // 11/26 해먹에 눕기 (펜션 정원 간판 옆 · 캠프파이어 존 해먹 쉼터 둘 — 14번 터 마당 해먹은 집 화면이 끼운다)
  ...MAP_HAMMOCKS.map((h): CampInteractable => ({ id: `hammock:${h.id}`, kind: "hammock", x: h.x, y: h.y + 4, r: 18, label: "해먹에 눕기" })),
];

/** 다람쥐가 다니는 나무 (낮). 길 가까운 단풍·노란 잎 나무 몇 그루 */
export const CAMP_SQUIRREL_TREES: readonly CampTree[] = CAMP_TREES.filter((t) => (t.kind === "yellow" || t.kind === "maple" || t.kind === "mapleO") && t.y > 120 && t.y < 700 && pathEdgeDist(t.x, t.y, 40) < 40).slice(0, 12);

/** 계곡 물안개 자리 (새벽) — 물줄기를 따라 */
export const CAMP_MIST_SPOTS: readonly Pt[] = CAMP_STREAM.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));

/** 크로싱 (다리·징검다리) y 범위 안인지 (그림·물보라에서 쓴다) */
export function onCrossing(y: number, pad = 0): boolean {
  return CAMP_CROSSINGS.some((c) => y >= c.y0 - pad && y <= c.y1 + pad);
}
