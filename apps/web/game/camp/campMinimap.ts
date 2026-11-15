import {
  CAMP_BUS_STOP,
  CAMP_DECK_H,
  CAMP_DECK_W,
  CAMP_DECKS,
  CAMP_FIRE,
  CAMP_HEIGHT,
  CAMP_LOOKOUT,
  CAMP_OFFICE,
  CAMP_OFFICE_H,
  CAMP_OFFICE_W,
  CAMP_TARP,
  CAMP_VANS,
  CAMP_WIDTH,
} from "@tomb/protocol";
import { campGroundKind, CAMP_TREES, inRect, vanCollider, type CampGround } from "./campLayout";

// 캠핑장 미니맵 바탕 (순수 계산 — DOM 없이 테스트한다). 마을 game/world/minimapArt.ts와 같은 방식:
// 월드 CAMP_MINIMAP_CELL px = 미니맵 1px. 바닥·물·데크·건물·캠핑카·숲(나무가 빽빽한 곳)을 색으로 칠한 RGBA 배열.
// UI(components/overlay/Minimap)가 캔버스에 한 번 찍고 그 위에 주요 장소 표시와 사람 점을 다시 그린다.

export const CAMP_MINIMAP_CELL = 8;
export const CAMP_MINIMAP_W = Math.ceil(CAMP_WIDTH / CAMP_MINIMAP_CELL); // 160
export const CAMP_MINIMAP_H = Math.ceil(CAMP_HEIGHT / CAMP_MINIMAP_CELL); // 100

const GROUND: Record<CampGround, number> = {
  grass: 0x6e6a38,
  path: 0xa88a5c,
  plaza: 0xb0946a,
  road: 0x4c4a48,
  water: 0x4a90a4,
  bank: 0x9c9484,
  rock: 0x8c877c,
  deckPad: 0x9a7448,
};
const FOREST = 0x4e5a30;
const FOREST_WARM = 0x8a6a2c;
const DECK = 0xb08458;
const ROOF = 0x7a4a34;
const VAN = 0xd8d0b8;
const TARP = 0xc8783a;
const LOOKOUT = 0xa07a50;

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

/** 캠핑장 미니맵 바탕 픽셀 (RGBA, CAMP_MINIMAP_W × CAMP_MINIMAP_H) */
export function campMinimapPixels(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(CAMP_MINIMAP_W * CAMP_MINIMAP_H * 4);
  const forest = forestCells();
  const office = { x: CAMP_OFFICE.x - CAMP_OFFICE_W / 2, y: CAMP_OFFICE.y - CAMP_OFFICE_H + 24, w: CAMP_OFFICE_W, h: CAMP_OFFICE_H - 24 };
  for (let y = 0; y < CAMP_MINIMAP_H; y++)
    for (let x = 0; x < CAMP_MINIMAP_W; x++) {
      const wx = x * CAMP_MINIMAP_CELL + CAMP_MINIMAP_CELL / 2;
      const wy = y * CAMP_MINIMAP_CELL + CAMP_MINIMAP_CELL / 2;
      const g = campGroundKind(wx, wy);
      let c = GROUND[g];
      if (g === "grass" || g === "rock") c = forest.get(y * CAMP_MINIMAP_W + x) ?? c;
      if (CAMP_DECKS.some((d) => Math.abs(wx - d.x) <= CAMP_DECK_W / 2 && Math.abs(wy - d.y) <= CAMP_DECK_H / 2)) c = DECK;
      if (inRect(office, wx, wy)) c = ROOF;
      if (CAMP_VANS.some((v) => inRect(vanCollider(v), wx, wy, 4))) c = VAN;
      if (inRect(CAMP_TARP, wx, wy, -10)) c = TARP;
      if (inRect(CAMP_LOOKOUT, wx, wy)) c = LOOKOUT;
      const i = (y * CAMP_MINIMAP_W + x) * 4;
      out[i] = (c >> 16) & 255;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
      out[i + 3] = 255;
    }
  return out;
}

/** 월드 좌표 → 미니맵 칸 좌표 (실수) */
export function toCampMinimap(x: number, y: number): { x: number; y: number } {
  return { x: x / CAMP_MINIMAP_CELL, y: y / CAMP_MINIMAP_CELL };
}

export type CampLandmark = { id: string; label: string; x: number; y: number; kind: "bus" | "office" | "fire" | "lookout" | "tarp" | "van" | "stream" };
/** 미니맵 주요 장소 (UI가 작은 표시를 그린다) */
export const CAMP_LANDMARKS: readonly CampLandmark[] = [
  { id: "bus", label: "버스 정류장", x: CAMP_BUS_STOP.x, y: CAMP_BUS_STOP.y, kind: "bus" },
  { id: "office", label: "관리소·매점", x: CAMP_OFFICE.x, y: CAMP_OFFICE.y - 30, kind: "office" },
  { id: "fire", label: "캠프파이어", x: CAMP_FIRE.x, y: CAMP_FIRE.y, kind: "fire" },
  { id: "lookout", label: "전망대", x: CAMP_LOOKOUT.x + CAMP_LOOKOUT.w / 2, y: CAMP_LOOKOUT.y + CAMP_LOOKOUT.h / 2, kind: "lookout" },
  { id: "tarp", label: "큰 타프", x: CAMP_TARP.x + CAMP_TARP.w / 2, y: CAMP_TARP.y + CAMP_TARP.h / 2, kind: "tarp" },
  { id: "vans", label: "캠핑카", x: CAMP_VANS[1].x, y: CAMP_VANS[1].y - 10, kind: "van" },
  { id: "stream", label: "계곡", x: 1046, y: 470, kind: "stream" },
];
/** 주요 장소 표시 색 */
export const CAMP_LANDMARK_COLOR: Record<CampLandmark["kind"], string> = {
  bus: "#ffd84a",
  office: "#ffb070",
  fire: "#ff9a3a",
  lookout: "#fff2a0",
  tarp: "#f0a060",
  van: "#e8e0c8",
  stream: "#9ad8ff",
};
