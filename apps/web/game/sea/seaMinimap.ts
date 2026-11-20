import {
  SEA_BREAKWATER,
  SEA_BREAKWATER_TIP,
  SEA_BUS_STOP,
  SEA_HEIGHT,
  SEA_KIOSK,
  SEA_KIOSK_H,
  SEA_KIOSK_W,
  SEA_LIGHTHOUSE,
  SEA_LOTS,
  SEA_PIER,
  SEA_PIER_END,
  SEA_DECKS,
  SEA_KAYAK_DOCK,
  SEA_KAYAK_WALK,
  SEA_KAYAK_WALK_HEAD,
  SEA_REALTY,
  SEA_REALTY_W,
  SEA_ROCKS,
  SEA_WIDTH,
  SEA_SPOTS,
  SEA_BONFIRE,
} from "@tomb/protocol";
import { inRect, SEA_BUYER, SEA_BUYER_STALL, SEA_TREES, seaGroundKind, type SeaGround } from "./seaLayout";

// 11/16 바닷가 미니맵 바탕 (순수 계산 — DOM 없이 테스트해요). 캠핑장 campMinimap과 같은 방식:
// 월드 SEA_MINIMAP_CELL px = 미니맵 1px. 바닥·건물·선착장·방파제·바위·소나무를 색으로 칠한 RGBA 배열.
// 갯벌은 물때와 상관없이 갯벌 색이고, 맨 아래 먼바다만 바다색이에요.

export const SEA_MINIMAP_CELL = 8;
export const SEA_MINIMAP_W = Math.ceil(SEA_WIDTH / SEA_MINIMAP_CELL); // 220
export const SEA_MINIMAP_H = Math.ceil(SEA_HEIGHT / SEA_MINIMAP_CELL); // 120

const GROUND: Record<SeaGround, number> = {
  hill: 0x4c5a38,
  grass: 0x7e8a4a,
  platform: 0xa8a49c,
  road: 0x4c4a48,
  path: 0xb49a70,
  yard: 0xc8b48a,
  lot: 0x9a8060,
  boardwalk: 0xa07a50,
  sand: 0xe0c992,
  flat: 0x8a7c64,
  pool: 0x5aa4b8,
  deep: 0x2e6a8c,
};
const ROOF = 0x5e98b4;
const REALTY_ROOF = 0xb24e36;
const KIOSK = 0xd8503c;
const FENCE = 0xdcd4c4;
const DECK = 0xab8a60;
const CONCRETE = 0xb4b0a6;
const ROCK = 0x6a645c;
const PINE = 0x3e5a34;
const LIGHTHOUSE = 0xf2eee6;

let pixels: Uint8ClampedArray | null = null;

/** 바닷가 미니맵 바탕 픽셀 (RGBA, SEA_MINIMAP_W × SEA_MINIMAP_H). 한 번 구우면 기억해요 */
export function seaMinimapPixels(): Uint8ClampedArray {
  if (!pixels) {
    const g = seaMinimapSteps();
    while (!g.next().done);
  }
  return pixels!;
}

/** 미니맵 바탕을 줄 묶음마다 쉬며 구워요 (버스 여행 미리 굽기) */
export function* seaMinimapSteps(): Generator<void, void> {
  if (pixels) return;
  const out = new Uint8ClampedArray(SEA_MINIMAP_W * SEA_MINIMAP_H * 4);
  const trees = new Set(SEA_TREES.filter((t) => t.kind !== "bush").map((t) => Math.floor((t.y - 8) / SEA_MINIMAP_CELL) * SEA_MINIMAP_W + Math.floor(t.x / SEA_MINIMAP_CELL)));
  const realty = { x: SEA_REALTY.x - SEA_REALTY_W / 2, y: SEA_REALTY.y - SEA_REALTY_W / 2 - 10, w: SEA_REALTY_W, h: SEA_REALTY_W / 2 + 8 };
  const kiosk = { x: SEA_KIOSK.x - SEA_KIOSK_W / 2, y: SEA_KIOSK.y - SEA_KIOSK_H / 2, w: SEA_KIOSK_W, h: SEA_KIOSK_H / 2 };
  const shelter = { x: SEA_BUS_STOP.x - 32, y: SEA_BUS_STOP.y - 26, w: 64, h: 26 };
  for (let y = 0; y < SEA_MINIMAP_H; y++) {
    if (y > 0 && y % 12 === 0) yield;
    for (let x = 0; x < SEA_MINIMAP_W; x++) {
      const wx = x * SEA_MINIMAP_CELL + SEA_MINIMAP_CELL / 2;
      const wy = y * SEA_MINIMAP_CELL + SEA_MINIMAP_CELL / 2;
      let c = GROUND[seaGroundKind(wx, wy)];
      if (trees.has(y * SEA_MINIMAP_W + x)) c = PINE;
      for (const l of SEA_LOTS) if (inRect(l, wx, wy) && !inRect(l, wx, wy, -SEA_MINIMAP_CELL)) c = FENCE;
      if (inRect(realty, wx, wy)) c = REALTY_ROOF;
      if (inRect(kiosk, wx, wy)) c = KIOSK;
      if (inRect(shelter, wx, wy)) c = ROOF;
      if (SEA_DECKS.slice(0, 5).some((r) => inRect(r, wx, wy))) c = DECK; // r15 선착장·끝 데크·낚시 가지·부잔교·다리
      if (inRect(SEA_KAYAK_WALK, wx, wy) || inRect(SEA_KAYAK_DOCK, wx, wy) || inRect(SEA_KAYAK_WALK_HEAD, wx, wy)) c = DECK; // r19 카약 선착장 (선착장 서쪽)
      if (inRect(SEA_BREAKWATER, wx, wy) || inRect(SEA_BREAKWATER_TIP, wx, wy)) c = CONCRETE;
      if (SEA_ROCKS.some((r) => ((wx - r.x) / r.rx) ** 2 + ((wy - r.y) / r.ry) ** 2 <= 1)) c = ROCK;
      if (Math.abs(wx - SEA_LIGHTHOUSE.x) <= 8 && wy >= SEA_LIGHTHOUSE.y - 20 && wy <= SEA_LIGHTHOUSE.y) c = LIGHTHOUSE;
      const i = (y * SEA_MINIMAP_W + x) * 4;
      out[i] = (c >> 16) & 255;
      out[i + 1] = (c >> 8) & 255;
      out[i + 2] = c & 255;
      out[i + 3] = 255;
    }
  }
  pixels = out;
}

/** 월드 좌표 → 미니맵 칸 좌표 (실수) */
export function toSeaMinimap(x: number, y: number): { x: number; y: number } {
  return { x: x / SEA_MINIMAP_CELL, y: y / SEA_MINIMAP_CELL };
}

export type SeaLandmark = { id: string; label: string; x: number; y: number; kind: "bus" | "realty" | "kiosk" | "cottages" | "pier" | "lighthouse" | "rocks" | "seat" | "bonfire" | "seaBuyer" };
/** 미니맵 주요 장소 (UI가 작은 표시를 그려요) */
export const SEA_LANDMARKS: readonly SeaLandmark[] = [
  { id: "bus", label: "버스 정류장", x: SEA_BUS_STOP.x, y: SEA_BUS_STOP.y, kind: "bus" },
  { id: "realty", label: "포구 부동산", x: SEA_REALTY.x, y: SEA_REALTY.y - 30, kind: "realty" },
  // 11/16 매점 (미니맵 아이스크림 그림 — 미니맵엔 글씨 없이 그림만)
  { id: "kiosk", label: "매점", x: SEA_KIOSK.x, y: SEA_KIOSK.y - 12, kind: "kiosk" },
  { id: "cottages", label: "별장", x: SEA_LOTS[2].x + SEA_LOTS[2].w / 2, y: SEA_LOTS[2].y + 20, kind: "cottages" },
  { id: "pier", label: "선착장", x: SEA_PIER.x + SEA_PIER.w / 2, y: SEA_PIER_END.y, kind: "pier" },
  { id: "lighthouse", label: "방파제 등대", x: SEA_LIGHTHOUSE.x, y: SEA_LIGHTHOUSE.y - 10, kind: "lighthouse" },
  { id: "rocks", label: "갯바위", x: 350, y: 590, kind: "rocks" },
  // 11/16 r12 걸터앉는 자리 (선착장 끝·방파제 끝) · 해변 모닥불
  { id: "pierSeats", label: "걸터앉기", x: SEA_SPOTS.pierEnd.x, y: SEA_SPOTS.pierEnd.y + 8, kind: "seat" },
  { id: "breakwaterSeats", label: "걸터앉기", x: SEA_SPOTS.breakwaterEnd.x, y: SEA_SPOTS.breakwaterEnd.y + 8, kind: "seat" },
  { id: "bonfire", label: "모닥불", x: SEA_BONFIRE.x, y: SEA_BONFIRE.y, kind: "bonfire" },
  // 11/20 해녀 할망 좌판 (미니맵 파라솔 그림 — 마을 보따리상처럼)
  { id: "seaBuyer", label: "해녀 할망", x: (SEA_BUYER_STALL.x + SEA_BUYER.x) / 2, y: SEA_BUYER.y - 12, kind: "seaBuyer" },
];
/** 주요 장소 표시 색 */
export const SEA_LANDMARK_COLOR: Record<SeaLandmark["kind"], string> = {
  bus: "#ffd84a",
  realty: "#f0a080",
  kiosk: "#f8a8c8",
  cottages: "#e8dcc0",
  pier: "#d8b080",
  lighthouse: "#fff2a0",
  rocks: "#b8b0a4",
  seat: "#f8c8a0",
  bonfire: "#ffb050",
  seaBuyer: "#7fd8c0",
};
