import type { Interactable, Rect } from "../world/layout";

// 11/20 「판교의 등대」 배치 (순수 데이터). 예전 야근 빌딩 자리 — 야근 빌딩은 예전 분양 사무소 자리(서쪽)로, 그 사이에 총무팀 문대리 카트.
// 까마귀 연못 서쪽 끝 바로 아래 풀밭, 북쪽 큰길(y 176부터) 바로 위. 오른쪽 앞에 흐르는 LED 전광판.
// 지금은 장식 + 문 앞 E(안내 한마디)뿐 — 회장님 독대(보스)는 나중에.
// layout.ts가 충돌·상호작용·장소 목록에 더하고, 그림·움직이는 빛(등불·빛줄기·전광판)은 LighthouseView가, 밤 빛은 WorldMap이 staticLights에 더한다.

/** 등대 바닥 가운데 (돌 받침 아랫줄) */
export const LIGHTHOUSE = { x: 1078, y: 170 } as const;
/** 그림 크기 (돌 받침 아랫줄이 그림 아래에서 ART_FOOT 위) */
export const LIGHTHOUSE_ART_W = 46;
export const LIGHTHOUSE_ART_H = 124;
export const LIGHTHOUSE_ART_FOOT = 4;
/** 등불 가운데 (빛줄기·등불 빛무리 원점) */
export const LIGHTHOUSE_LAMP = { x: LIGHTHOUSE.x, y: LIGHTHOUSE.y - 96 } as const;
/** 문 앞 (E/탭 → 안내 한마디) */
export const LIGHTHOUSE_DOOR = { x: LIGHTHOUSE.x, y: LIGHTHOUSE.y + 7 } as const;
/** 오른쪽 앞 전광판 (다리 둘 위 LED 판). 받침 가운데 */
export const LIGHTHOUSE_BOARD = { x: LIGHTHOUSE.x + 36, y: LIGHTHOUSE.y + 2 } as const;
export const BOARD_ART_W = 34;
export const BOARD_ART_H = 22;

/** E 안내 · 눌렀을 때 한마디 */
export const LIGHTHOUSE_LABEL = "사직서 내러 가기";
export const LIGHTHOUSE_TOAST = "회장님 독대는 곧 열려요";

/** 그림 자리 (흩뿌리는 나무가 뒤에 숨거나 걸치지 않게 — layout freeForProp) */
export function lighthouseArtRects(): Rect[] {
  const L = LIGHTHOUSE;
  const B = LIGHTHOUSE_BOARD;
  return [
    { x: L.x - LIGHTHOUSE_ART_W / 2, y: L.y - (LIGHTHOUSE_ART_H - LIGHTHOUSE_ART_FOOT), w: LIGHTHOUSE_ART_W, h: LIGHTHOUSE_ART_H - LIGHTHOUSE_ART_FOOT },
    { x: B.x - BOARD_ART_W / 2, y: B.y - BOARD_ART_H, w: BOARD_ART_W, h: BOARD_ART_H },
  ];
}

/** 충돌: 둥근 돌 받침 (뒤로 돌아 숨지 않게 깊이만큼) + 전광판 다리 줄 */
export function lighthouseColliders(): Rect[] {
  const L = LIGHTHOUSE;
  const B = LIGHTHOUSE_BOARD;
  return [
    { x: L.x - 15, y: L.y - 16, w: 30, h: 15 },
    { x: B.x - 14, y: B.y - 6, w: 28, h: 4 },
  ];
}

export function lighthouseInteractables(): Interactable[] {
  const d = LIGHTHOUSE_DOOR;
  return [{ id: "portal:lighthouse", kind: "portal", portal: "lighthouse", x: d.x, y: d.y, r: 16, ax: d.x, ay: d.y, label: LIGHTHOUSE_LABEL }];
}

/** 밤 빛 (WorldMap.staticLights → Atmosphere 번짐 + Lighting 어둠 구멍): 등불, 문 위 등, 전광판. 창 둘은 빛 층만 (몸 전체가 환해 보이지 않게) */
export const LIGHTHOUSE_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  { x: LIGHTHOUSE_LAMP.x, y: LIGHTHOUSE_LAMP.y, scale: 0.8, tint: 0xffe8a0, base: 0.85 },
  { x: LIGHTHOUSE.x, y: LIGHTHOUSE.y - 16, scale: 0.4, tint: 0xffd08a, base: 0.6 },
  { x: LIGHTHOUSE_BOARD.x, y: LIGHTHOUSE_BOARD.y - 14, scale: 0.45, tint: 0xff7a4a, base: 0.6 },
];
