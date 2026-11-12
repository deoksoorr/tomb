import type { Interactable, Rect } from "../world/layout";

// 귀신의집 건물 배치 (순수 데이터). 사용자 요청: "대놓고 눈에 띄게" → 정문(접속 시작 지점)에서 큰길을 따라 내려와
// 모닥불 광장에 들어서는 입구 바로 동쪽 (소원 분수 오른쪽, 트램펄린 왼쪽). 광장 북쪽 큰길에서도, 정문 앞마당에서 내려오는 길에서도 보인다.
// layout.ts가 충돌·상호작용·미니맵 장소 목록에 한 줄씩 더하고, 그림은 HauntHouseView가 그린다. 등불 빛은 WorldMap이 staticLights에 더한다.

/** 건물 바닥 가운데 (그림 원점) */
export const HAUNT_HOUSE = { x: 794, y: 284 } as const;
/** 문 앞 (E/탭 → 귀신의집 창) */
export const HAUNT_DOOR = { x: HAUNT_HOUSE.x, y: HAUNT_HOUSE.y + 8 } as const;
/** 몸체 충돌 너비 (그림 HOUSE_W보다 조금 좁게 — 처마 끝은 지나갈 수 있다) */
export const HAUNT_BODY_W = 72;

/** 건물 몸체 아랫부분 충돌 (윗부분·지붕 뒤로는 지나갈 수 있다 — 깊이 정렬로 건물 뒤에 가려진다) */
export function hauntColliders(): Rect[] {
  return [{ x: HAUNT_HOUSE.x - HAUNT_BODY_W / 2, y: HAUNT_HOUSE.y - 20, w: HAUNT_BODY_W, h: 20 }];
}

export function hauntInteractables(): Interactable[] {
  return [
    {
      id: "portal:haunt",
      kind: "portal",
      portal: "haunt",
      x: HAUNT_DOOR.x,
      y: HAUNT_DOOR.y,
      r: 16,
      ax: HAUNT_DOOR.x,
      ay: HAUNT_DOOR.y,
      label: "귀신의집 들어가기",
    },
  ];
}

/** 문 양옆 벽등 (그림 원점 기준 dx, 바닥에서 위로 dy). 왼쪽 보라, 오른쪽 초록 */
export const HAUNT_LAMPS: readonly { dx: number; dy: number; tint: number }[] = [
  { dx: -15, dy: 24, tint: 0xb46cff },
  { dx: 15, dy: 24, tint: 0x5cffa0 },
];

/** 밤 빛 (WorldMap.staticLights → Atmosphere 번짐 + Lighting 어둠 구멍): 벽등 둘, 간판, 깨진 창 */
export const HAUNT_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  ...HAUNT_LAMPS.map((l) => ({ x: HAUNT_HOUSE.x + l.dx, y: HAUNT_HOUSE.y - l.dy, scale: 0.62, tint: l.tint, base: 0.85 })),
  { x: HAUNT_HOUSE.x, y: HAUNT_HOUSE.y - 36, scale: 0.7, tint: 0x8cffc0, base: 0.5 },
  { x: HAUNT_HOUSE.x + 31, y: HAUNT_HOUSE.y - 20, scale: 0.4, tint: 0xff9a50, base: 0.55 },
];
