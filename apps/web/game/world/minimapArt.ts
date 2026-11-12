import { HOUSE_LOT_H, HOUSE_LOT_W, HOUSE_LOTS, MAP_HEIGHT, MAP_WIDTH, TILE } from "@tomb/protocol";
import { DECKS, groundKind, inWaterBody, LANDMARKS, type GroundKind, type Landmark } from "./layout";

// F17 미니맵 바탕 (순수 계산 — DOM 없이 테스트한다). 월드 MINIMAP_CELL px = 미니맵 1px.
// 바닥 종류·물·판자·필지를 색으로 칠한 RGBA 배열을 만들고, UI(components/overlay/Minimap)가 캔버스에 한 번 찍은 뒤
// 그 위에 주요 장소 표시와 사람 점(나·다른 사람)만 0.25초마다 다시 그린다.

export const MINIMAP_CELL = 8;
export const MINIMAP_W = Math.ceil(MAP_WIDTH / MINIMAP_CELL);
export const MINIMAP_H = Math.ceil(MAP_HEIGHT / MINIMAP_CELL);

const GROUND: Record<GroundKind, number> = {
  grass: 0x4c5034,
  dirt: 0x7c6850,
  gravel: 0x8a867c,
  stone: 0x8e8a7e,
  cobble: 0x6c675e,
  grave: 0x30362b,
  hill: 0x6c7468,
  cliff: 0x3a3630,
  stairs: 0x8a877e,
  wallTop: 0x24221f,
  wallFace: 0x24221f,
  wallSide: 0x24221f,
  gate: 0x7c6850,
};
const WATER = 0x3d6878;
const DECK = 0x8a6a48;
const LOT = 0x5a4e40;

/** 미니맵 바탕 픽셀 (RGBA, MINIMAP_W × MINIMAP_H) */
export function minimapPixels(): Uint8ClampedArray {
  const out = new Uint8ClampedArray(MINIMAP_W * MINIMAP_H * 4);
  for (let y = 0; y < MINIMAP_H; y++)
    for (let x = 0; x < MINIMAP_W; x++) {
      const wx = x * MINIMAP_CELL + MINIMAP_CELL / 2;
      const wy = y * MINIMAP_CELL + MINIMAP_CELL / 2;
      let c = GROUND[groundKind(Math.floor(wx / TILE), Math.floor(wy / TILE))];
      if (HOUSE_LOTS.some((l) => wx >= l.x + 8 && wx <= l.x + HOUSE_LOT_W - 8 && wy >= l.y + 30 && wy <= l.y + HOUSE_LOT_H - 10)) c = LOT;
      if (inWaterBody(wx, wy, -1)) c = WATER;
      if (DECKS.some((d) => wx >= d.x && wx <= d.x + d.w && wy >= d.y && wy <= d.y + d.h)) c = DECK;
      const i = (y * MINIMAP_W + x) * 4;
      out[i] = (c >> 16) & 255;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
      out[i + 3] = 255;
    }
  return out;
}

/** 주요 장소 표시 색 */
export const LANDMARK_COLOR: Record<Landmark["kind"], string> = {
  fire: "#ff9a3a",
  grave: "#e8e2d4",
  shop: "#c8a0ff",
  hunt: "#ff6a5a",
  housing: "#9ad0ff",
  shrine: "#ffd6e0",
  dock: "#d8b880",
  telescope: "#fff2a0",
  wish: "#8ce0ff",
  bell: "#e0c070",
};

/** 미니맵 좌표 (월드 → 미니맵 px) */
export function toMinimap(x: number, y: number): { x: number; y: number } {
  return { x: x / MINIMAP_CELL, y: y / MINIMAP_CELL };
}

export { LANDMARKS };
