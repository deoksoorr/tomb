import type { Interactable, Rect } from "../world/layout";

// 귀신의집 건물 배치 (순수 데이터). 마을 북서쪽 끝 서리 내린 언덕 위 빈자리 — 언덕 소나무 사이에 낡은 2층 집이 서 있다.
// layout.ts가 충돌·상호작용·미니맵 장소 목록에 한 줄씩 더하고, 그림은 HauntHouseView가 그린다.

/** 건물 바닥 가운데 (그림 원점) */
export const HAUNT_HOUSE = { x: 104, y: 118 } as const;
/** 문 앞 (E/탭 → 귀신의집 창) */
export const HAUNT_DOOR = { x: HAUNT_HOUSE.x, y: HAUNT_HOUSE.y + 7 } as const;

/** 건물 몸체 아랫부분 충돌 (윗부분·지붕 뒤로는 지나갈 수 있다 — 깊이 정렬로 건물 뒤에 가려진다) */
export function hauntColliders(): Rect[] {
  return [{ x: HAUNT_HOUSE.x - 30, y: HAUNT_HOUSE.y - 20, w: 60, h: 20 }];
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
