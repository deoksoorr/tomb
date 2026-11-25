import { HOUSE_LOT_H, HOUSE_LOT_W, HOUSE_LOTS, MAP_HEIGHT, MAP_WIDTH, TILE } from "@tomb/protocol";
import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { npcById } from "@/lib/forage/catalog";
import { WHARF_BOARD } from "./fishZone";
import { DECKS, groundKind, inWaterBody, LANDMARKS as PLACE_LANDMARKS, type GroundKind, type Landmark } from "./layout";

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
/** 11/17 겨울·크리스마스 맵 컨셉 (lib/mapConcept): 눈밭·진흙길·얼음 물 */
const WINTER_GROUND: Record<GroundKind, number> = {
  ...GROUND,
  grass: 0xd2dbe2,
  grave: 0xb4bfca,
  hill: 0xe2e8ec,
  dirt: 0x6a5a4a,
  gate: 0x6a5a4a,
  stone: 0xa6abb0,
  cobble: 0x8c9096,
  gravel: 0x9c9fa2,
};
const WINTER_WATER = 0x5c8ea4;
const WINTER_LOT = 0xc4ced8;

/** 미니맵 바탕 픽셀 (RGBA, MINIMAP_W × MINIMAP_H). concept가 겨울·크리스마스면 눈 덮인 색 */
export function minimapPixels(concept: MapConcept = "default"): Uint8ClampedArray {
  const snowy = isSnowy(concept);
  const ground = snowy ? WINTER_GROUND : GROUND;
  const out = new Uint8ClampedArray(MINIMAP_W * MINIMAP_H * 4);
  for (let y = 0; y < MINIMAP_H; y++)
    for (let x = 0; x < MINIMAP_W; x++) {
      const wx = x * MINIMAP_CELL + MINIMAP_CELL / 2;
      const wy = y * MINIMAP_CELL + MINIMAP_CELL / 2;
      let c = ground[groundKind(Math.floor(wx / TILE), Math.floor(wy / TILE))];
      if (HOUSE_LOTS.some((l) => wx >= l.x + 8 && wx <= l.x + HOUSE_LOT_W - 8 && wy >= l.y + 30 && wy <= l.y + HOUSE_LOT_H - 10)) c = snowy ? WINTER_LOT : LOT;
      if (inWaterBody(wx, wy, -1)) c = snowy ? WINTER_WATER : WATER;
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
  fish: "#7fe0ff",
  zoo: "#ffc890",
  haunt: "#a8ffd8",
  ferris: "#ff9ad0",
  balloon: "#ffb070",
  tower: "#ffb43c",
  bumper: "#ff8ab8",
  // 11/16 정류장 둘: 캠핑장행은 초록 지붕, 바닷가행은 바다 빛
  busCamp: "#9ae0a8",
  busSea: "#5ac8f0",
  duck: "#ffe060",
  // 11/19 계절 보따리상: 보자기 남색
  season: "#7f9be0",
  // 11/19 가구 보따리상: 나무색
  furnStall: "#e0a868",
  // 11/19 분양사 보리: 발바닥 분홍
  mungnyang: "#f6a8b8",
  // 11/20 총무팀 문대리: 회사 청록
  office: "#6cc4bc",
  // 11/20 판교의 등대: 빨간 띠
  lighthouse: "#ff6a6a",
  // 11/25 지도 이름표용: 의뢰 게시판·어부 영감·수집가 유령
  board: "#d8a868",
  fishmonger: "#c89a60",
  collector: "#e0c080",
};

/** 관람차 아이콘 (미니맵 px, 가운데 기준 — 동그란 바퀴 + 다리) */
export const FERRIS_ICON: readonly (readonly [number, number])[] = [
  [-1, -3], [0, -3], [1, -3], [-2, -2], [2, -2], [-3, -1], [3, -1], [-3, 0], [0, 0], [3, 0], [-3, 1], [3, 1], [-2, 2], [2, 2], [-1, 3], [0, 3], [1, 3],
  [-2, 4], [2, 4],
];
/** 11/16 범퍼카 아이콘 (둥근 차 + 더듬이) */
export const BUMPER_ICON: readonly (readonly [number, number])[] = [
  [-2, -4], [-2, -3], [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-3, 0], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [3, 0],
  [-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1], [-2, 2], [2, 2],
];
/** 열기구 아이콘 (풍선 + 바구니) */
export const BALLOON_ICON: readonly (readonly [number, number])[] = [
  [-1, -4], [0, -4], [1, -4], [-2, -3], [-1, -3], [0, -3], [1, -3], [2, -3], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [-1, -1], [0, -1], [1, -1], [0, 0],
  [-1, 2], [0, 2], [1, 2],
];

/** 동물원 발바닥 아이콘 (미니맵 px, 가운데 기준 [dx, dy] — 발가락 셋 + 발바닥) */
export const PAW_ICON: readonly (readonly [number, number])[] = [
  [-2, -2], [0, -3], [2, -2], // 발가락
  [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], // 발바닥
];

/** 채집 지점 점 색 (약초·광석·발굴·곤충 수풀 — 게임의 발밑 빛 색과 같다) */
export const NODE_DOT_COLOR: Record<string, string> = { herb: "#9cff8a", ore: "#9ad8ff", dig: "#ffd27a", bug: "#fff0a0" };

/** 낚시터 물고기 아이콘 (미니맵 px, 가운데 기준 [dx, dy] — 오른쪽을 보는 물고기, 꼬리는 왼쪽) */
export const FISH_ICON: readonly (readonly [number, number])[] = [
  [-3, -1], [-3, 1], [-2, 0], // 꼬리
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1], [2, 0], // 몸
];

/** 미니맵 좌표 (월드 → 미니맵 px) */
export function toMinimap(x: number, y: number): { x: number; y: number } {
  return { x: x / MINIMAP_CELL, y: y / MINIMAP_CELL };
}

/** 11/25 NPC 자리 (lib/forage/catalog NPCS — 상인 자리는 거기 한 곳) */
function npcAt(id: "fishmonger" | "collector"): { x: number; y: number } {
  const n = npcById(id);
  return { x: n?.x ?? 0, y: n?.y ?? 0 };
}

/**
 * 미니맵 주요 장소 = 안내 장소(layout LANDMARKS) + 11/25 길치 이슈로 지도 이름표에 더한 곳 (자리는 원래 데이터 그대로):
 * 의뢰 게시판(도장 교환소도 여기 — fishZone WHARF_BOARD) · 어부 영감 · 수집가 유령 (NPC는 노점 바로 위)
 */
export const LANDMARKS: readonly Landmark[] = [
  ...PLACE_LANDMARKS,
  { id: "board", label: "의뢰 게시판", x: WHARF_BOARD.x, y: WHARF_BOARD.y - 12, kind: "board" },
  { id: "fishmonger", label: "어부 영감", x: npcAt("fishmonger").x, y: npcAt("fishmonger").y - 10, kind: "fishmonger" },
  { id: "collector", label: "수집가 유령", x: npcAt("collector").x, y: npcAt("collector").y - 10, kind: "collector" },
];
