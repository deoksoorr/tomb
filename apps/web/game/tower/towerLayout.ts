import type { Interactable, Rect } from "../world/layout";

// 11/15 야근 빌딩 배치 (순수 데이터). 사냥터 동굴 입구 오른쪽 윗동네, 분양 사무소와 까마귀 연못 사이 빈터 (마른 나무와 옛 무덤 사이).
// 북쪽 큰길(y 176~200)을 걷는 사람 누구에게나 보이고, 회전문 앞이 큰길에 붙어 있다. 위쪽 담보다 높이 솟는다.
// 정문 앞마당(도깨비 길·채집 지점)과 동굴 길은 건드리지 않는다.
// layout.ts가 충돌·상호작용·장소 목록에 한 줄씩 더하고, 그림은 TowerView가 그린다. 밤 빛은 WorldMap이 staticLights에 더한다.

/** 건물 바닥 가운데 (그림 원점) */
export const TOWER = { x: 1052, y: 170 } as const;
/** 회전문 앞 (E/탭 → 야근 빌딩 창, 레벨이 모자라면 경비원 한마디) */
export const TOWER_DOOR = { x: TOWER.x, y: TOWER.y + 7 } as const;
/** 몸체 충돌 (로비 1층 + 그 뒤 빌딩 바닥 — 뒤로 돌아 들어가 숨지 않게 깊게) */
export const TOWER_BODY = { w: 50, h: 44 } as const;

export function towerColliders(): Rect[] {
  return [
    {
      x: TOWER.x - TOWER_BODY.w / 2,
      y: TOWER.y - TOWER_BODY.h,
      w: TOWER_BODY.w,
      h: TOWER_BODY.h - 2,
    },
  ];
}

export function towerInteractables(): Interactable[] {
  return [
    {
      id: "portal:tower",
      kind: "portal",
      portal: "tower",
      x: TOWER_DOOR.x,
      y: TOWER_DOOR.y,
      r: 16,
      ax: TOWER_DOOR.x,
      ay: TOWER_DOOR.y,
      label: "야근 빌딩 들어가기",
    },
  ];
}

/** 밤 빛 (WorldMap.staticLights → Atmosphere 번짐 + Lighting 어둠 구멍): 로비 유리문 둘, 옥상 간판, 중간층 창 불빛 */
export const TOWER_LIGHTS: readonly {
  x: number;
  y: number;
  scale: number;
  tint: number;
  base: number;
}[] = [
  { x: TOWER.x - 22, y: TOWER.y - 14, scale: 0.6, tint: 0xffd890, base: 0.8 },
  { x: TOWER.x + 22, y: TOWER.y - 14, scale: 0.6, tint: 0xffd890, base: 0.8 },
  { x: TOWER.x, y: TOWER.y - 8, scale: 0.6, tint: 0xffe3a6, base: 0.7 },
  { x: TOWER.x, y: TOWER.y - 143, scale: 0.9, tint: 0xff5aa8, base: 0.65 },
  { x: TOWER.x, y: TOWER.y - 90, scale: 0.8, tint: 0xffe2a0, base: 0.45 },
];
