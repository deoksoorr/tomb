import {
  CAMP_BOARD_SPOT,
  CAMP_BUS_STOP,
  CAMP_FIRE,
  CAMP_FOOTBATH,
  CAMP_HEIGHT,
  CAMP_LOTS,
  CAMP_NPCS,
  CAMP_OFFICE,
  CAMP_OFFICE_H,
  CAMP_OFFICE_W,
  CAMP_PIER,
  CAMP_PLUNGE,
  CAMP_POOL,
  CAMP_RAFTS,
  CAMP_RES,
  CAMP_ROW_DOCK_RECT,
  CAMP_TRADER,
  CAMP_TRADER_STALL,
  CAMP_VENDING_ROW,
  CAMP_VIEW_BRIDGE,
  CAMP_VIEW_BRIDGE_X,
  CAMP_WIDTH,
  campRaftDeck,
  campStreamX,
} from "@tomb/protocol";
import { campGroundKind, CAMP_BBQ, CAMP_TREES, inRect, type CampGround } from "./campLayout";

// 캠핑장 미니맵 바탕 (순수 계산 — DOM 없이 테스트한다). 마을 game/world/minimapArt.ts와 같은 방식:
// 월드 CAMP_MINIMAP_CELL px = 미니맵 1px. 바닥·물·절벽·건물·좌대·잔교·집터·숲(나무가 빽빽한 곳)을 색으로 칠한 RGBA 배열.
// 11/26 폭포 계곡 개편: 아스라 폭포 절벽·달그늘 소·옛길 계곡·윤슬 낚시터(잔교·좌대)·카라반 자갈 마당·펜션/촌캉스 터.
// UI(components/overlay/Minimap)가 캔버스에 한 번 찍고 그 위에 주요 장소 표시와 사람 점을 다시 그린다.

export const CAMP_MINIMAP_CELL = 8;
export const CAMP_MINIMAP_W = Math.ceil(CAMP_WIDTH / CAMP_MINIMAP_CELL); // 160
export const CAMP_MINIMAP_H = Math.ceil(CAMP_HEIGHT / CAMP_MINIMAP_CELL); // 100

const GROUND: Record<CampGround, number> = {
  grass: 0x6e6a38,
  path: 0xa88a5c,
  foot: 0x9a8a64,
  plaza: 0xb0946a,
  road: 0x4c4a48,
  water: 0x4a90a4,
  pool: 0x2e6a80,
  bank: 0x9c9484,
  rock: 0x8c877c,
  pad: 0xa49a84,
  cliff: 0x6a6660,
  river: 0x4a90a4,
  pond: 0x3e7e94,
  brook: 0x4a90a4,
  embank: 0x8a8478,
};
const FOREST = 0x4e5a30;
const FOREST_WARM = 0x8a6a2c;
const DECK = 0xb08458;
const ROOF = 0x7a4a34;
/** 물줄기 (폭포) */
const FALLS = 0xdcecf2;
/** 펜션·촌캉스 터 (앞마당) */
const LOT = 0x9a8c5e;

/**
 * 11/17 겨울·크리스마스 판 색 (기본 색 → 겨울 색, game/world/minimapWinter가 바꾼다): 숲 바닥은 눈밭, 흙길·광장은 진흙빛,
 * 물은 차가운 물, 침엽수 숲은 눈 쌓인 짙은 초록, 단풍 숲은 앙상한 회갈색, 지붕·잔교·좌대는 눈
 */
export const CAMP_WINTER_PALETTE: ReadonlyMap<number, number> = new Map([
  [GROUND.grass, 0xd6dee6],
  [GROUND.pad, 0xc8d0d8],
  [GROUND.path, 0x6a5a4a],
  [GROUND.foot, 0xb4bcc4],
  [GROUND.plaza, 0x6e6052],
  [GROUND.road, 0x3e3c3c],
  [GROUND.water, 0x3a6878],
  [GROUND.pool, 0x2a5262],
  [GROUND.pond, 0x9ab8c8],
  [GROUND.bank, 0xc8d2dc],
  [GROUND.rock, 0xc4ccd4],
  [GROUND.cliff, 0x8a9098],
  [GROUND.embank, 0xb4bcc4],
  [FOREST, 0x5a7064],
  [FOREST_WARM, 0x9a9088],
  [DECK, 0xc8bcac],
  [ROOF, 0xe4eaf0],
  [FALLS, 0xf4f8fc],
  [LOT, 0xd0d4d8],
]);

/** 나무가 선 칸 (미니맵 1px 단위) → 숲 색 (침엽수 짙은 초록, 단풍·노란 잎 따뜻한 색) */
function forestCells(): Map<number, number> {
  const m = new Map<number, number>();
  for (const t of CAMP_TREES) {
    const cx = Math.floor(t.x / CAMP_MINIMAP_CELL);
    const cy = Math.floor((t.y - 10) / CAMP_MINIMAP_CELL);
    const warm = t.kind === "maple" || t.kind === "mapleO" || t.kind === "yellow";
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
    ]) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= CAMP_MINIMAP_W || y >= CAMP_MINIMAP_H) continue;
      const k = y * CAMP_MINIMAP_W + x;
      if (!m.has(k) || (dx === 0 && dy === 0)) m.set(k, warm ? FOREST_WARM : FOREST);
    }
  }
  return m;
}

let pixels: Uint8ClampedArray | null = null;

/** 캠핑장 미니맵 바탕 픽셀 (RGBA, CAMP_MINIMAP_W × CAMP_MINIMAP_H). 한 번 구우면 기억해요 */
export function campMinimapPixels(): Uint8ClampedArray {
  if (!pixels) {
    const g = campMinimapSteps();
    while (!g.next().done);
  }
  return pixels!;
}

/** 11/15 미니맵 바탕을 줄 묶음마다 쉬며 구워요 (버스 여행 미리 굽기 — 캠핑장에 내리는 프레임이 가벼워져요) */
export function* campMinimapSteps(): Generator<void, void> {
  if (pixels) return;
  const out = new Uint8ClampedArray(CAMP_MINIMAP_W * CAMP_MINIMAP_H * 4);
  const forest = forestCells();
  const office = { x: CAMP_OFFICE.x - CAMP_OFFICE_W / 2, y: CAMP_OFFICE.y - CAMP_OFFICE_H + 24, w: CAMP_OFFICE_W, h: CAMP_OFFICE_H - 24 };
  const booth = { x: CAMP_TRADER_STALL.x - 22, y: CAMP_TRADER_STALL.y - 30, w: 44, h: 30 };
  const homeLots = CAMP_LOTS.filter((l) => l.kind !== "caravan");
  const decks = [
    { x: CAMP_PIER.x0, y: CAMP_PIER.y - CAMP_PIER.w / 2, w: CAMP_PIER.x1 - CAMP_PIER.x0, h: CAMP_PIER.w },
    CAMP_ROW_DOCK_RECT,
    ...CAMP_RAFTS.map((r) => campRaftDeck({ ...r, link: false })),
    { x: CAMP_VIEW_BRIDGE_X - CAMP_VIEW_BRIDGE.w / 2, y: CAMP_VIEW_BRIDGE.y - 9, w: CAMP_VIEW_BRIDGE.w, h: 26 },
    { x: CAMP_FOOTBATH.x - CAMP_FOOTBATH.w / 2, y: CAMP_FOOTBATH.y - CAMP_FOOTBATH.h + 20, w: CAMP_FOOTBATH.w, h: CAMP_FOOTBATH.h - 20 },
  ];
  for (let y = 0; y < CAMP_MINIMAP_H; y++) {
    if (y > 0 && y % 10 === 0) yield;
    for (let x = 0; x < CAMP_MINIMAP_W; x++) {
      const wx = x * CAMP_MINIMAP_CELL + CAMP_MINIMAP_CELL / 2;
      const wy = y * CAMP_MINIMAP_CELL + CAMP_MINIMAP_CELL / 2;
      const g = campGroundKind(wx, wy);
      let c = GROUND[g];
      if (g === "grass" || g === "rock") c = forest.get(y * CAMP_MINIMAP_W + x) ?? c;
      if (homeLots.some((l) => inRect(l, wx, wy, -2))) c = LOT;
      if (decks.some((r) => inRect(r, wx, wy))) c = DECK;
      if (inRect(office, wx, wy) || inRect(booth, wx, wy)) c = ROOF;
      if (Math.abs(wx - fallX(wy)) <= 10 && wy < CAMP_PLUNGE.y && g === "cliff") c = FALLS;
      const i = (y * CAMP_MINIMAP_W + x) * 4;
      out[i] = (c >> 16) & 255;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
      out[i + 3] = 255;
    }
  }
  pixels = out;
}

/** 월드 좌표 → 미니맵 칸 좌표 (실수) */
export function toCampMinimap(x: number, y: number): { x: number; y: number } {
  return { x: x / CAMP_MINIMAP_CELL, y: y / CAMP_MINIMAP_CELL };
}

/** 폭포 물줄기 가운데 x (그림 FALLS 1단·2단 — 지도에는 한 줄로) */
const fallX = (y: number) => 640 + (y > 104 ? -4 : 0);

export type CampLandmark = {
  id: string;
  label: string;
  x: number;
  y: number;
  kind: "bus" | "office" | "fire" | "stream" | "bbq" | "vending" | "board" | "dock" | "pier" | "housing" | "fishmonger" | "seat" | "fish";
};
const npc = (id: string) => CAMP_NPCS.find((n) => n.id === id)!;
/** 미니맵 주요 장소 (UI가 작은 표시를 그린다). 붕어빵 수레 자리는 넣지 않는다 (비밀) */
export const CAMP_LANDMARKS: readonly CampLandmark[] = [
  { id: "bus", label: "버스 정류장", x: CAMP_BUS_STOP.x, y: CAMP_BUS_STOP.y, kind: "bus" },
  { id: "office", label: "관리소·매점", x: CAMP_OFFICE.x, y: CAMP_OFFICE.y - 30, kind: "office" },
  { id: "falls", label: "아스라 폭포", x: 640, y: 70, kind: "stream" },
  { id: "pool", label: "달그늘 소", x: CAMP_POOL.x, y: CAMP_POOL.y + 30, kind: "stream" },
  { id: "rocks", label: "폭포 낚시 바위", x: 486, y: 276, kind: "fish" },
  { id: "vending", label: "자판기", x: 866, y: CAMP_VENDING_ROW[0].y - 10, kind: "vending" },
  { id: "stream", label: "옛길 계곡", x: Math.round(campStreamX(640)), y: 640, kind: "stream" },
  { id: "fishing", label: "윤슬 낚시터", x: (CAMP_RES.x0 + CAMP_RES.x1) / 2, y: CAMP_PIER.y, kind: "pier" },
  { id: "rowboat", label: "나룻배 선착장", x: CAMP_ROW_DOCK_RECT.x + 12, y: CAMP_ROW_DOCK_RECT.y + 7, kind: "dock" },
  { id: "trader", label: "낚시터 사장님", x: CAMP_TRADER.x, y: CAMP_TRADER.y, kind: "fishmonger" },
  { id: "footbath", label: "계곡 족욕탕", x: CAMP_FOOTBATH.x, y: CAMP_FOOTBATH.y - 60, kind: "seat" },
  { id: "pension", label: "소슬 펜션 · 소슬댁", x: npc("sosul").x, y: npc("sosul").y, kind: "housing" },
  { id: "rural", label: "촌캉스 · 순이 할머니", x: npc("suni").x, y: npc("suni").y, kind: "housing" },
  { id: "caravans", label: "카라반 자리", x: 520, y: 470, kind: "housing" },
  { id: "fire", label: "캠프파이어 존", x: CAMP_FIRE.x, y: CAMP_FIRE.y, kind: "fire" },
  { id: "bbq", label: "바베큐", x: CAMP_BBQ.grill.x, y: CAMP_BBQ.grill.y - 8, kind: "bbq" },
  { id: "board", label: "의뢰판", x: CAMP_BOARD_SPOT.x, y: CAMP_BOARD_SPOT.y - 12, kind: "board" },
];
/** 주요 장소 표시 색 (그림이 없는 장소) */
export const CAMP_LANDMARK_COLOR: Record<CampLandmark["kind"], string> = {
  bus: "#ffd84a",
  office: "#ffb070",
  fire: "#ff9a3a",
  stream: "#9ad8ff",
  bbq: "#ff8a40",
  vending: "#e05a5a",
  board: "#d8a868",
  dock: "#e0b07a",
  pier: "#f0d0a0",
  housing: "#9ad0ff",
  fishmonger: "#c89a60",
  seat: "#f8c8a0",
  fish: "#9ae8ff",
};
