import { SCOPE_STAND } from "./lookoutMath";
import {
  CAMP_BOARD,
  CAMP_BOARD_SPOT,
  CAMP_BOUNDS,
  CAMP_BUS_SIGN,
  CAMP_BUS_STOP,
  CAMP_BUS_TIMETABLE,
  CAMP_CROSSINGS,
  CAMP_DECK_H,
  CAMP_DECK_W,
  CAMP_DECKS,
  CAMP_FIRE,
  CAMP_FURNITURE,
  CAMP_HEIGHT,
  CAMP_LOOKOUT,
  CAMP_LOOKOUT_STAIRS,
  CAMP_NPCS,
  CAMP_OFFICE,
  CAMP_OFFICE_H,
  CAMP_OFFICE_W,
  CAMP_PLAZA_R,
  CAMP_ROAD,
  CAMP_SEATS,
  CAMP_STREAM,
  CAMP_STREAM_HALF_W,
  CAMP_TABLE,
  CAMP_TARP,
  CAMP_VAN_DOOR_DX,
  CAMP_VANS,
  CAMP_VAN_GEAR,
  CAMP_WIDTH,
  campStreamX,
  type CampNpcId,
  type Furniture,
} from "@tomb/protocol";
import type { CampInteractable, CampLight } from "./campTypes";
import { CAMP_FISHING_SPOTS } from "@tomb/protocol";
import { CAMP_GATHER_NODES } from "@/lib/forage/catalog";

// 11/15 언젠가 캠핑장 배치 — 순수 데이터 (Phaser 없음 → campLayout.test.ts가 충돌·길을 검사한다).
// 좌석·NPC·구역 좌표의 원본은 packages/protocol/src/camp.ts (서버 좌석 판정과 같다). 여기서는 그 위에
//  - 길(흙길 띠), 바닥 종류, 나무·덤불·낙엽 흩뿌리기(시드 고정, 길·구역·데크·물·자리 피해서)
//  - 충돌 상자(나무 줄기·건물·캠핑카·물(건너는 곳 빼고)·전망대 난간(계단 빼고)·큰 바위·정류장 기둥)
//  - 가구 충돌(통나무 의자·벤치·앉는 바위·피크닉 탁자), 상호작용, 밤 빛, 걷기 격자를 만든다.
// 그림은 campArt.ts, 그리기·컬링은 CampMap.ts, 미니맵 바탕은 campMinimap.ts.

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 11/15 야외 바베큐장 (큰 타프 오른쪽, 데크 고리와 산책로 사이 빈 마당): 숯불 그릴 + 나무 탁자.
 * 그릴 앞에서 E → 메뉴 창(삼겹살·소시지·마시멜로 꼬치), 먹으면 잠깐 커진다 (protocol bbq.ts)
 */
export const CAMP_BBQ = {
  grill: { x: 800, y: 686 },
  table: { x: 848, y: 704 },
  /** 음료 자판기 (마당 오른쪽 위, 밤에 앞판이 빛난다) — 마실 거리는 여기서만 판다 */
  vending: { x: 876, y: 664 },
  /** 나무가 서지 않는 마당 */
  area: { x: 764, y: 640, w: 124, h: 92 },
} as const;
type Pt = { x: number; y: number };

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

// ── 길 (흙길, 낙엽이 덜 깔린 밟힌 땅) ── 점들을 잇는 띠. hw = 반폭
export type CampPath = { id: string; hw: number; pts: readonly Pt[] };
export const CAMP_PATHS: readonly CampPath[] = [
  // 정류장 → 관리소 앞 → 타프 아래쪽 → 징검다리 → 산책로 → 전망대 계단
  {
    id: "trail",
    hw: 10,
    pts: [
      { x: 214, y: 640 },
      { x: 284, y: 650 },
      { x: 318, y: 690 },
      { x: 404, y: 718 },
      { x: 520, y: 716 },
      { x: 556, y: 772 },
      { x: 660, y: 782 },
      { x: 770, y: 774 },
      { x: 866, y: 722 },
      { x: 936, y: 640 },
      { x: 984, y: 590 },
      { x: 1040, y: 584 },
      { x: 1094, y: 574 },
      { x: 1140, y: 500 },
      { x: 1166, y: 400 },
      { x: 1156, y: 300 },
      { x: 1176, y: 222 },
      { x: 1172, y: 162 },
    ],
  },
  // 광장 → 통나무 다리 → 산책로
  {
    id: "bridge",
    hw: 8,
    pts: [
      { x: 706, y: 384 },
      { x: 800, y: 350 },
      { x: 904, y: 300 },
      { x: 990, y: 286 },
      { x: 1088, y: 286 },
      { x: 1156, y: 300 },
    ],
  },
  // 광장 → 의뢰판·관리소 앞
  {
    id: "office",
    hw: 8,
    pts: [
      { x: 600, y: 486 },
      { x: 566, y: 560 },
      { x: 534, y: 640 },
      { x: 520, y: 716 },
    ],
  },
  // 캠핑카 앞 골목 (위 → 정류장)
  {
    id: "vans",
    hw: 8,
    pts: [
      { x: 178, y: 232 },
      { x: 180, y: 420 },
      { x: 180, y: 560 },
      { x: 196, y: 610 },
      { x: 214, y: 640 },
    ],
  },
  // 캠핑카 → 광장
  {
    id: "west",
    hw: 8,
    pts: [
      { x: 180, y: 424 },
      { x: 300, y: 430 },
      { x: 420, y: 418 },
      { x: 530, y: 400 },
    ],
  },
];

/** 점과 선분 거리 */
function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0;
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}

type Seg = { a: Pt; b: Pt; hw: number; x0: number; y0: number; x1: number; y1: number };
const SEGS: Seg[] = CAMP_PATHS.flatMap((p) =>
  p.pts.slice(1).map((b, i) => {
    const a = p.pts[i];
    return { a, b, hw: p.hw, x0: Math.min(a.x, b.x) - p.hw - 4, y0: Math.min(a.y, b.y) - p.hw - 4, x1: Math.max(a.x, b.x) + p.hw + 4, y1: Math.max(a.y, b.y) + p.hw + 4 };
  }),
);

/** 길 가운데선에서 반폭을 뺀 거리 (0 이하면 길 위). 아주 멀면 큰 수 */
export function pathEdgeDist(x: number, y: number, pad = 0): number {
  let best = 1e9;
  for (const s of SEGS) {
    if (x < s.x0 - pad || x > s.x1 + pad || y < s.y0 - pad || y > s.y1 + pad) continue;
    const d = segDist(x, y, s.a, s.b) - s.hw;
    if (d < best) best = d;
  }
  return best;
}

// ── 바닥 종류 ──
export type CampGround = "grass" | "path" | "plaza" | "road" | "water" | "bank" | "rock" | "deckPad";
/** 산꼭대기 바위 마당 (전망대 둘레) */
export const CAMP_SUMMIT = { x: 1172, y: 112, rx: 128, ry: 96 } as const;

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

/** 바닥 종류 (그림·미니맵 공통). 경계의 흔들림은 결정적 해시로 */
export function campGroundKind(x: number, y: number): CampGround {
  const wob = (hashU(x >> 2, y >> 2, 7) - 0.5) * 3;
  const sx = Math.abs(x - campStreamX(y));
  if (sx <= CAMP_STREAM_HALF_W) return "water";
  if (sx <= CAMP_STREAM_HALF_W + 6 + wob) return "bank";
  if (inRect(CAMP_ROAD, x, y) && y >= CAMP_ROAD.y + 2 + wob * 0.5) {
    // 길 끝(오른쪽)은 둥글게 돌려 나가는 자리 — 잘린 것처럼 보이지 않게
    const ex = CAMP_ROAD.x + CAMP_ROAD.w - 28;
    if (x <= ex) return "road";
    const dx = (x - ex) / 28;
    const dy = (y - (CAMP_ROAD.y + CAMP_ROAD.h / 2)) / (CAMP_ROAD.h / 2);
    if (dx * dx + dy * dy <= 1) return "road";
  }
  const sdx = (x - CAMP_SUMMIT.x) / CAMP_SUMMIT.rx;
  const sdy = (y - CAMP_SUMMIT.y) / CAMP_SUMMIT.ry;
  if (sdx * sdx + sdy * sdy <= 1 + wob * 0.04) return "rock";
  if (Math.hypot(x - CAMP_FIRE.x, (y - CAMP_FIRE.y) * 1.12) <= CAMP_PLAZA_R + wob) return "plaza";
  if (pathEdgeDist(x, y) <= wob * 0.6) return "path";
  return "grass";
}

// ── 충돌 ──

/** 건물·큰 소품 충돌 (나무 줄기는 CAMP_TREES에서 따로) */
export const CAMP_OFFICE_COLLIDER: Rect = { x: CAMP_OFFICE.x - CAMP_OFFICE_W / 2 + 2, y: CAMP_OFFICE.y - 36, w: CAMP_OFFICE_W - 4, h: 36 };
export function vanCollider(v: { x: number; y: number }): Rect {
  return { x: v.x - 36, y: v.y - 20, w: 72, h: 20 };
}
/** 큰 모닥불 돌 고리 (점프로도 못 넘는다) */
export const CAMP_FIRE_COLLIDER: Rect = { x: CAMP_FIRE.x - 22, y: CAMP_FIRE.y - 10, w: 44, h: 14 };
/** 타프 기둥 넷 (받침 가운데) */
export const CAMP_TARP_POLES: readonly Pt[] = [
  { x: CAMP_TARP.x + 6, y: CAMP_TARP.y + 10 },
  { x: CAMP_TARP.x + CAMP_TARP.w - 6, y: CAMP_TARP.y + 10 },
  { x: CAMP_TARP.x + 6, y: CAMP_TARP.y + CAMP_TARP.h - 4 },
  { x: CAMP_TARP.x + CAMP_TARP.w - 6, y: CAMP_TARP.y + CAMP_TARP.h - 4 },
];
/** 피크닉 탁자: 다리 쪽 낮은 상자만 막는다 (위 의자에서 일어선 자리 y+9가 비게) */
export const CAMP_TABLE_COLLIDER: Rect = { x: CAMP_TABLE.x - 26, y: CAMP_TABLE.y + 2, w: 52, h: 6 };
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
/** 전망대 난간 (위·왼쪽·오른쪽 + 아래 — 가운데 계단은 비운다) */
export function lookoutRails(): Rect[] {
  const L = CAMP_LOOKOUT;
  const S = CAMP_LOOKOUT_STAIRS;
  const t = 4;
  return [
    { x: L.x, y: L.y, w: L.w, h: t },
    { x: L.x, y: L.y, w: t, h: L.h },
    { x: L.x + L.w - t, y: L.y, w: t, h: L.h },
    { x: L.x, y: L.y + L.h - t, w: S.x - L.x, h: t },
    { x: S.x + S.w, y: L.y + L.h - t, w: L.x + L.w - S.x - S.w, h: t },
  ];
}
/** 물 (8px 줄마다 한 상자. 징검다리·통나무 다리 줄은 비운다) */
export function streamColliders(): Rect[] {
  const out: Rect[] = [];
  const step = 8;
  for (let y = 0; y < CAMP_HEIGHT; y += step) {
    if (CAMP_CROSSINGS.some((c) => y + step > c.y0 && y < c.y1)) continue;
    const a = campStreamX(y);
    const b = campStreamX(y + step);
    const x0 = Math.min(a, b) - CAMP_STREAM_HALF_W + 2;
    const x1 = Math.max(a, b) + CAMP_STREAM_HALF_W - 2;
    out.push({ x: Math.round(x0), y, w: Math.round(x1 - x0), h: step });
  }
  return out;
}

/** 가구 충돌 (점프 중엔 넘는다). 캠핑카 문간 자리는 발판이라 막지 않는다 */
export function campFurnitureCollider(f: Furniture): Rect | null {
  if (f.id.startsWith("qV")) return null;
  if (f.id.startsWith("qL")) return { x: f.x - 5, y: f.y - 5, w: 10, h: 5 }; // 통나무 의자
  if (f.id.startsWith("qR")) return { x: f.x - 7, y: f.y - 5, w: 14, h: 5 }; // 앉는 바위
  if (f.kind === "bench") {
    const w = f.seatOffsets.length >= 3 ? 56 : 40;
    return { x: f.x - w / 2, y: f.y - 7, w, h: 7 };
  }
  return { x: f.x - 6, y: f.y - 6, w: 12, h: 6 };
}

// ── NPC ── (발밑 충돌은 늘 서 있는 셋만. 별지기·기타 캠퍼는 시간대에만 나와 막지 않는다)
const ALWAYS_NPC: ReadonlySet<CampNpcId> = new Set(["keeper", "clerk", "granny"]);
/** 그 시각(KST 0~24)에 그 NPC가 나와 있는지. 별지기는 밤(20~5시), 기타 캠퍼는 밤 9~11시 */
export function campNpcActive(id: CampNpcId, hour: number): boolean {
  if (id === "stargazer") return hour >= 20 || hour < 5;
  if (id === "guitarist") return hour >= 21 && hour < 23;
  return true;
}
export function npcCollider(n: { id: CampNpcId; x: number; y: number }): Rect | null {
  return ALWAYS_NPC.has(n.id) ? { x: n.x - 6, y: n.y - 5, w: 12, h: 5 } : null;
}

// ── 큰 바위 (앉지 않는 덩어리) ──
export const CAMP_BOULDERS: readonly (Pt & { v: number })[] = [
  { x: 960, y: 320, v: 0 },
  { x: 1100, y: 640, v: 1 },
  { x: 1236, y: 196, v: 0 },
  { x: 1090, y: 176, v: 1 },
  { x: 940, y: 760, v: 0 },
  { x: 60, y: 160, v: 1 },
];
export function boulderCollider(b: Pt): Rect {
  return { x: b.x - 11, y: b.y - 7, w: 22, h: 7 };
}

// ── 나무·덤불 흩뿌리기 ──
export type CampTreeKind = "spruce" | "pine" | "fir" | "maple" | "mapleO" | "yellow" | "bush";
export type CampTree = { kind: CampTreeKind; x: number; y: number; v: number };
export type CampDecorKind = "leafPile" | "mushroom" | "fern" | "pebbles";
export type CampDecor = { kind: CampDecorKind; x: number; y: number; v: number };

/** 줄기 충돌 (덤불은 작게) */
export function treeCollider(t: CampTree): Rect {
  if (t.kind === "bush") return { x: t.x - 6, y: t.y - 4, w: 12, h: 4 };
  if (t.kind === "spruce" || t.kind === "pine" || t.kind === "fir") return { x: t.x - 4, y: t.y - 4, w: 8, h: 4 };
  return { x: t.x - 3, y: t.y - 4, w: 6, h: 4 };
}

/** 나무가 서면 안 되는 자리 (길·구역 핵심·데크·물·자리·상호작용) */
function keepClear(x: number, y: number): boolean {
  if (pathEdgeDist(x, y, 20) < 12) return true;
  if (Math.abs(x - campStreamX(y)) < CAMP_STREAM_HALF_W + 14) return true;
  if (Math.hypot(x - CAMP_FIRE.x, (y - CAMP_FIRE.y) * 1.1) < CAMP_PLAZA_R + 22) return true;
  if (inRect({ x: CAMP_OFFICE.x - CAMP_OFFICE_W / 2, y: CAMP_OFFICE.y - CAMP_OFFICE_H, w: CAMP_OFFICE_W, h: CAMP_OFFICE_H }, x, y, 22)) return true;
  // 정류장·보도·버스 길 (그 아래는 숲) · 관리소 앞마당
  // (길 아래 나무는 줄기가 길에서 충분히 떨어져야 잎이 길을 덮지 않는다)
  if (x < 330 && y > CAMP_BUS_STOP.y - CAMP_SHELTER_H - 10 && y < CAMP_ROAD.y + CAMP_ROAD.h + 40) return true;
  if (x >= 290 && x < 540 && y > 660) return true;
  if (inRect(CAMP_TARP, x, y, 26)) return true;
  if (inRect(CAMP_LOOKOUT, x, y, 22)) return true;
  if (x > CAMP_LOOKOUT_STAIRS.x - 20 && x < CAMP_LOOKOUT_STAIRS.x + CAMP_LOOKOUT_STAIRS.w + 20 && y > CAMP_LOOKOUT.y + CAMP_LOOKOUT.h - 4 && y < CAMP_LOOKOUT.y + CAMP_LOOKOUT.h + 40) return true;
  // 캠핑카와 앞마당 캠핑 도구
  for (const v of CAMP_VANS) if (x > v.x - (v.plate ? 112 : 76) && x < v.x + 70 && y > v.y - 58 && y < v.y + 58) return true;
  for (const d of CAMP_DECKS) if (Math.abs(x - d.x) < CAMP_DECK_W / 2 + 20 && Math.abs(y - d.y) < CAMP_DECK_H / 2 + 22) return true;
  for (const s of CAMP_SEATS) if (Math.hypot(x - s.x, y - s.y) < 26) return true;
  for (const n of CAMP_NPCS) if (Math.hypot(x - n.x, y - n.y) < 28) return true;
  for (const b of CAMP_BOULDERS) if (Math.hypot(x - b.x, y - b.y) < 24) return true;
  if (inRect(CAMP_BBQ.area, x, y, 14)) return true; // 바베큐장
  if (Math.hypot(x - CAMP_BOARD_SPOT.x, y - CAMP_BOARD_SPOT.y) < 26) return true;
  // A-6 계곡 낚시 자리·채집 지점 (나무가 그 자리를 비켜 선다)
  for (const f of CAMP_FISHING_SPOTS) if (Math.hypot(x - f.x, y - f.y) < 22) return true;
  for (const n of CAMP_GATHER_NODES) if (Math.hypot(x - n.x, y - n.y) < 20) return true;
  return false;
}

function treeKindFor(x: number, y: number, u: number): CampTreeKind {
  // 계곡 둘레·산꼭대기는 침엽수가 많고, 마당 쪽은 노란 잎·단풍이 많다
  const nearStream = Math.abs(x - campStreamX(y)) < 110;
  const high = y < 200 && x > 900;
  if (nearStream || high) return u < 0.34 ? "spruce" : u < 0.58 ? "fir" : u < 0.7 ? "pine" : u < 0.84 ? "yellow" : u < 0.94 ? "mapleO" : "bush";
  return u < 0.2 ? "spruce" : u < 0.32 ? "pine" : u < 0.42 ? "fir" : u < 0.62 ? "yellow" : u < 0.74 ? "maple" : u < 0.86 ? "mapleO" : "bush";
}

function buildTrees(): CampTree[] {
  const out: CampTree[] = [];
  const r = seeded(20261115);
  const step = 30;
  for (let gy = -1; gy * step < CAMP_HEIGHT + step; gy++)
    for (let gx = -1; gx * step < CAMP_WIDTH + step; gx++) {
      const x = Math.round(gx * step + 8 + r() * (step - 10) + (gy % 2 ? step / 2 : 0));
      const y = Math.round(gy * step + 10 + r() * (step - 12));
      const u = r();
      const kindU = r();
      const v = Math.floor(r() * 4);
      if (x < -8 || x > CAMP_WIDTH + 8 || y < 8 || y > CAMP_HEIGHT + 30) continue;
      const border = x < CAMP_BOUNDS.minX + 6 || x > CAMP_BOUNDS.maxX - 6 || y < CAMP_BOUNDS.minY + 10 || y > CAMP_BOUNDS.maxY + 6;
      if (keepClear(x, y)) continue;
      // 데크 고리 안쪽(광장과 데크 사이 풀밭)은 드문드문
      const ex = (x - CAMP_FIRE.x) / 272;
      const ey = (y - CAMP_FIRE.y - 8) / 176;
      const inRing = ex * ex + ey * ey < 1;
      const p = border ? 1 : inRing ? 0.16 : 0.74;
      if (u > p) continue;
      out.push({ kind: inRing ? (kindU < 0.5 ? "yellow" : kindU < 0.8 ? "mapleO" : "bush") : treeKindFor(x, y, kindU), x, y, v });
    }
  return out;
}

function buildDecor(trees: readonly CampTree[]): CampDecor[] {
  const out: CampDecor[] = [];
  const r = seeded(77115);
  // 낙엽 무더기·버섯은 나무 밑동 둘레, 고사리는 계곡 쪽, 자갈은 물가
  for (const t of trees) {
    if (r() > 0.42) continue;
    const kind: CampDecorKind = t.kind === "spruce" || t.kind === "fir" ? (r() < 0.5 ? "fern" : "mushroom") : "leafPile";
    const x = Math.round(t.x + (r() - 0.5) * 22);
    const y = Math.round(t.y + 4 + r() * 8);
    if (pathEdgeDist(x, y) < 4 || Math.abs(x - campStreamX(y)) < CAMP_STREAM_HALF_W + 4) continue;
    out.push({ kind, x, y, v: Math.floor(r() * 3) });
  }
  // 풀밭 군데군데 낙엽 무더기
  for (let i = 0; i < 70; i++) {
    const x = Math.round(40 + r() * (CAMP_WIDTH - 80));
    const y = Math.round(60 + r() * (CAMP_HEIGHT - 120));
    if (campGroundKind(x, y) !== "grass" || pathEdgeDist(x, y) < 6) continue;
    out.push({ kind: "leafPile", x, y, v: Math.floor(r() * 3) });
  }
  // 물가 자갈
  for (let y = 30; y < CAMP_HEIGHT; y += 44) {
    const side = (y / 44) % 2 ? 1 : -1;
    const x = Math.round(campStreamX(y) + side * (CAMP_STREAM_HALF_W + 9));
    if (CAMP_CROSSINGS.some((c) => y > c.y0 - 16 && y < c.y1 + 16)) continue;
    out.push({ kind: "pebbles", x, y, v: Math.floor(r() * 3) });
  }
  return out;
}

export const CAMP_TREES: readonly CampTree[] = buildTrees();
export const CAMP_DECOR: readonly CampDecor[] = buildDecor(CAMP_TREES);

// ── 줄 조명 (전구 줄) ── 기둥·처마 사이에 늘어진 줄. 밤에 켜진다
/** 광장 둘레 조명 기둥 (불 가운데 기준 원) */
export const CAMP_LIGHT_POLES: readonly Pt[] = Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI / 8 + (i / 8) * Math.PI * 2;
  return { x: Math.round(CAMP_FIRE.x + Math.cos(a) * 104), y: Math.round(CAMP_FIRE.y + 8 + Math.sin(a) * 86) };
});
/** 줄 하나: 두 끝(높이 h만큼 땅 위)과 늘어짐 */
export type CampString = { a: Pt; b: Pt; ha: number; hb: number; sag: number; bulbs: number };
export const CAMP_POLE_H = 34;
export const CAMP_STRINGS: readonly CampString[] = [
  // 광장 둘레 (기둥 → 다음 기둥)
  ...CAMP_LIGHT_POLES.map((p, i) => {
    const q = CAMP_LIGHT_POLES[(i + 1) % CAMP_LIGHT_POLES.length];
    return { a: p, b: q, ha: CAMP_POLE_H, hb: CAMP_POLE_H, sag: 9, bulbs: 6 };
  }),
  // 관리소·매점 처마
  { a: { x: CAMP_OFFICE.x - 84, y: CAMP_OFFICE.y }, b: { x: CAMP_OFFICE.x + 84, y: CAMP_OFFICE.y }, ha: 40, hb: 40, sag: 6, bulbs: 11 },
  // 타프 앞쪽 처마
  { a: CAMP_TARP_POLES[2], b: CAMP_TARP_POLES[3], ha: 30, hb: 30, sag: 8, bulbs: 9 },
  // 전망대 앞 난간
  { a: { x: CAMP_LOOKOUT.x + 2, y: CAMP_LOOKOUT.y + CAMP_LOOKOUT.h }, b: { x: CAMP_LOOKOUT.x + CAMP_LOOKOUT.w - 2, y: CAMP_LOOKOUT.y + CAMP_LOOKOUT.h }, ha: 16, hb: 16, sag: 4, bulbs: 8 },
];
/** 줄 위의 점 (t 0..1) — 화면 좌표 (높이만큼 위로 올린 y) */
export function stringPoint(s: CampString, t: number): Pt {
  const x = s.a.x + (s.b.x - s.a.x) * t;
  const ground = s.a.y + (s.b.y - s.a.y) * t;
  const h = s.ha + (s.hb - s.ha) * t;
  return { x, y: ground - h + Math.sin(t * Math.PI) * s.sag };
}
/** 전구 자리 (줄마다 bulbs개, 양 끝 빼고) */
export function stringBulbs(): (Pt & { depthY: number; i: number })[] {
  const out: (Pt & { depthY: number; i: number })[] = [];
  let i = 0;
  for (const s of CAMP_STRINGS)
    for (let k = 1; k <= s.bulbs; k++) {
      const t = k / (s.bulbs + 1);
      const p = stringPoint(s, t);
      out.push({ ...p, depthY: Math.max(s.a.y, s.b.y), i: i++ });
    }
  return out;
}

// ── 모든 충돌 ──
export function campStaticColliders(): Rect[] {
  return [
    CAMP_OFFICE_COLLIDER,
    ...CAMP_VANS.map(vanCollider),
    CAMP_FIRE_COLLIDER,
    ...CAMP_TARP_POLES.map((p) => ({ x: p.x - 2, y: p.y - 4, w: 4, h: 4 })),
    ...shelterColliders(),
    { x: CAMP_BUS_SIGN.x - 2, y: CAMP_BUS_SIGN.y - 4, w: 4, h: 4 },
    { x: CAMP_BUS_TIMETABLE.x - 6, y: CAMP_BUS_TIMETABLE.y - 4, w: 12, h: 4 },
    { x: CAMP_BOARD_SPOT.x - 13, y: CAMP_BOARD_SPOT.y - 5, w: 26, h: 5 },
    ...campVanGearColliders(),
    // 바베큐 그릴(다리 쪽)·나무 탁자
    { x: CAMP_BBQ.grill.x - 12, y: CAMP_BBQ.grill.y - 5, w: 24, h: 5 },
    { x: CAMP_BBQ.table.x - 22, y: CAMP_BBQ.table.y - 4, w: 44, h: 4 },
    { x: CAMP_BBQ.vending.x - 10, y: CAMP_BBQ.vending.y - 6, w: 20, h: 6 },
    ...lookoutRails(),
    ...streamColliders(),
    ...CAMP_BOULDERS.map(boulderCollider),
    ...CAMP_LIGHT_POLES.map((p) => ({ x: p.x - 2, y: p.y - 3, w: 4, h: 3 })),
    ...CAMP_NPCS.map(npcCollider).filter((r): r is Rect => r !== null),
    ...CAMP_TREES.map(treeCollider),
  ];
}
/** 캠핑카 앞 캠핑 도구: 접이식 탁자(다리 쪽만, 랜턴은 그 위)·화롯대·아이스박스 (의자는 가구 충돌) */
export function campVanGearColliders(): Rect[] {
  return CAMP_VAN_GEAR.flatMap((g) => [
    { x: g.table.x - 12, y: g.table.y - 3, w: 24, h: 3 },
    { x: g.brazier.x - 7, y: g.brazier.y - 5, w: 14, h: 5 },
    { x: g.icebox.x - 8, y: g.icebox.y - 5, w: 16, h: 5 },
  ]);
}

export function campFurnitureColliders(): Rect[] {
  return [...CAMP_FURNITURE.map(campFurnitureCollider).filter((r): r is Rect => r !== null), CAMP_TABLE_COLLIDER];
}

let standRects: Rect[] | null = null;
/** 발 상자(8×5, 발바닥이 아랫변)를 (x,y)에 놓아 맵 안이고 어떤 충돌에도 닿지 않는지 */
export function campStandable(x: number, y: number): boolean {
  const b = CAMP_BOUNDS;
  if (!(x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY)) return false;
  standRects ??= [...campStaticColliders(), ...campFurnitureColliders()];
  const fx = x - 4;
  const fy = y - 5;
  for (const r of standRects) if (fx < r.x + r.w && fx + 8 > r.x && fy < r.y + r.h && fy + 5 > r.y) return false;
  return true;
}

/** 걷기 격자 (cell px, 0 = 걸을 수 있음, 1 = 막힘). 칸 가운데에 발 상자를 놓아 판정 */
export type CampWalkGrid = { cell: number; cols: number; rows: number; cells: Uint8Array };
export function campWalkGrid(cell = 8): CampWalkGrid {
  const cols = Math.ceil(CAMP_WIDTH / cell);
  const rows = Math.ceil(CAMP_HEIGHT / cell);
  const cells = new Uint8Array(cols * rows);
  const b = CAMP_BOUNDS;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const px = x * cell + cell / 2;
      const py = y * cell + cell / 2;
      if (px < b.minX || px > b.maxX || py < b.minY || py > b.maxY) cells[y * cols + x] = 1;
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
  { id: "bus:village", kind: "bus", x: CAMP_BOARD.x, y: CAMP_BOARD.y, r: 22, label: "마을행 버스 타기" },
  ...CAMP_NPCS.map((n): CampInteractable => ({ id: `npc:${n.id}`, kind: "npc", npc: n.id, x: n.x, y: n.y + 10, r: 26, label: `${n.name}에게 말 걸기` })),
  ...CAMP_VANS.map((v): CampInteractable => ({ id: `van:${v.id}`, kind: "van", van: v.id, seatId: `qV${v.id.slice(1)}`, x: v.x + CAMP_VAN_DOOR_DX, y: v.y + 13, r: 20, label: "캠핑카에 들어가 앉기" })),
  ...CAMP_DECKS.map((d): CampInteractable => ({ id: `deck:${d.n}`, kind: "deck", deck: d.n, x: d.x, y: d.y + 2, r: 18, label: `${d.n}번 데크` })),
  { id: "board", kind: "board", x: CAMP_BOARD_SPOT.x, y: CAMP_BOARD_SPOT.y + 12, r: 20, label: "의뢰판 보기" },
  { id: "sign", kind: "sign", x: CAMP_BUS_SIGN.x, y: CAMP_BUS_SIGN.y + 12, r: 18, label: "표지판 보기" },
  { id: "lookout", kind: "lookout", x: SCOPE_STAND.x, y: SCOPE_STAND.y + 14, r: 20, label: "망원경으로 캠핑장 보기" },
  { id: "bbq", kind: "bbq", x: CAMP_BBQ.grill.x, y: CAMP_BBQ.grill.y + 14, r: 28, label: "바베큐 사 먹기" },
  { id: "vending", kind: "vending", x: CAMP_BBQ.vending.x, y: CAMP_BBQ.vending.y + 12, r: 20, label: "음료 뽑기" },
];

// ── 밤 빛 ──
export const CAMP_FIRE_LIGHT = { dy: -16, scale: 3.6, tint: 0xffa048, base: 1 } as const;
export const CAMP_LIGHTS: readonly CampLight[] = [
  // 큰 모닥불 (광장 전체를 따뜻하게)
  { x: CAMP_FIRE.x, y: CAMP_FIRE.y + CAMP_FIRE_LIGHT.dy, scale: CAMP_FIRE_LIGHT.scale, tint: CAMP_FIRE_LIGHT.tint, base: CAMP_FIRE_LIGHT.base },
  // 관리소 창·문등, 매점 창구
  { x: CAMP_OFFICE.x - 56, y: CAMP_OFFICE.y - 22, scale: 0.6, tint: 0xffd890, base: 0.75 },
  { x: CAMP_OFFICE.x - 20, y: CAMP_OFFICE.y - 30, scale: 0.45, tint: 0xffc070, base: 0.8 },
  { x: CAMP_OFFICE.x + 44, y: CAMP_OFFICE.y - 22, scale: 0.8, tint: 0xffe0a0, base: 0.85 },
  // 처마 줄 조명 (줄 하나에 빛 둘 — 전구 하나하나는 CampMap이 반짝이게)
  { x: CAMP_OFFICE.x - 40, y: CAMP_OFFICE.y - 38, scale: 0.9, tint: 0xffd27a, base: 0.55 },
  { x: CAMP_OFFICE.x + 40, y: CAMP_OFFICE.y - 38, scale: 0.9, tint: 0xffd27a, base: 0.55 },
  // 광장 둘레 줄 조명 (기둥마다)
  ...CAMP_LIGHT_POLES.map((p) => ({ x: p.x, y: p.y - CAMP_POLE_H, scale: 0.7, tint: 0xffcf78, base: 0.5 })),
  // 정류장 지붕 등 · 시간표 불빛
  { x: CAMP_BUS_STOP.x, y: CAMP_BUS_STOP.y - CAMP_SHELTER_H + 12, scale: 0.85, tint: 0xfff0c8, base: 0.85 },
  { x: CAMP_BUS_TIMETABLE.x, y: CAMP_BUS_TIMETABLE.y - 18, scale: 0.4, tint: 0xd8f0ff, base: 0.6 },
  // 캠핑카 창 (주황 불빛)
  ...CAMP_VANS.map((v) => ({ x: v.x - 8, y: v.y - 24, scale: 0.55, tint: 0xffb060, base: 0.7 })),
  // 바베큐 숯불
  { x: CAMP_BBQ.grill.x, y: CAMP_BBQ.grill.y - 12, scale: 1.1, tint: 0xff8a40, base: 0.9 },
  // 음료 자판기 앞판 (하얗고 파르스름한 불빛)
  { x: CAMP_BBQ.vending.x, y: CAMP_BBQ.vending.y - 16, scale: 0.7, tint: 0xc8ecff, base: 0.85 },
  // 캠핑카 앞 화롯대·랜턴
  ...CAMP_VAN_GEAR.flatMap((g) => [
    { x: g.brazier.x, y: g.brazier.y - 10, scale: 1.0, tint: 0xff9a48, base: 0.9 },
    { x: g.lantern.x, y: g.lantern.y - 14, scale: 0.55, tint: 0xffd890, base: 0.8 },
  ]),
  // 타프 아래 걸린 랜턴
  { x: CAMP_TABLE.x, y: CAMP_TABLE.y - 30, scale: 1.1, tint: 0xffc070, base: 0.85 },
  // 전망대 랜턴 둘
  { x: CAMP_LOOKOUT.x + 8, y: CAMP_LOOKOUT.y + 8, scale: 0.6, tint: 0xffd28a, base: 0.7 },
  { x: CAMP_LOOKOUT.x + CAMP_LOOKOUT.w - 8, y: CAMP_LOOKOUT.y + 8, scale: 0.6, tint: 0xffd28a, base: 0.7 },
];

/** 구역 이름표 자리 (구역 사각형 위쪽 가운데가 어색한 곳만) */
export const CAMP_ZONE_LABEL_AT: Partial<Record<string, Pt>> = {
  "버스 정류장": { x: CAMP_BUS_STOP.x, y: CAMP_BUS_STOP.y - CAMP_SHELTER_H - 14 },
  "관리소·매점": { x: CAMP_OFFICE.x, y: CAMP_OFFICE.y - CAMP_OFFICE_H - 4 },
  "캠프파이어 광장": { x: CAMP_FIRE.x, y: CAMP_FIRE.y - 74 },
  "캠핑 데크": { x: 620, y: 196 },
  "계곡": { x: 1060, y: 446 },
  "숲 산책로": { x: 1196, y: 440 },
  "전망대": { x: CAMP_LOOKOUT.x + CAMP_LOOKOUT.w / 2, y: CAMP_LOOKOUT.y - 6 },
  "캠핑카": { x: 124, y: 206 },
  "큰 타프": { x: CAMP_TARP.x + CAMP_TARP.w / 2, y: CAMP_TARP.y - 30 },
};

/** 다람쥐가 다니는 나무 (낮). 길 가까운 단풍·노란 잎 나무 몇 그루 */
export const CAMP_SQUIRREL_TREES: readonly CampTree[] = CAMP_TREES.filter((t) => (t.kind === "yellow" || t.kind === "maple" || t.kind === "mapleO") && t.y > 120 && t.y < 700 && pathEdgeDist(t.x, t.y, 40) < 40).slice(0, 12);

/** 계곡 물안개 자리 (새벽) — 물줄기를 따라 */
export const CAMP_MIST_SPOTS: readonly Pt[] = CAMP_STREAM.slice(1, -1).map((p) => ({ x: p.x, y: p.y }));
