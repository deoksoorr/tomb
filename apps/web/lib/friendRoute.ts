import type { AwayMapId, MapId } from "@tomb/protocol";

// 11/19 [친구한테 가기]의 맵 조합 (순수 함수 — 친구 창·마을·캠핑장·바닷가 장면이 같이 쓴다).
//  - 같은 맵이면 친구 옆으로 순간이동 (버스 없음)
//  - 맵이 다르면 버스를 탄다: 마을 ↔ 캠핑장 · 마을 ↔ 바닷가는 한 번, 캠핑장 ↔ 바닷가는 마을 정류장을 거쳐 두 번 (버스는 마을에만 서요)
//  - 바베큐로 몸이 커져 있으면(커진 배율 > 1) 버스를 못 타니(마을·캠핑장 정류장 규칙과 같다) 다른 맵 친구한테는 못 간다

/** 커진 채로 다른 맵 친구한테 가려 할 때 (버스 막힘 문구 BIG_RIDE_TOAST와 같은 말투) */
export const FRIEND_BIG_MSG = "몸이 너무 커서 버스를 탈 수 없어요. 효과가 끝나면 친구한테 가 봐요.";

export type FriendRoute =
  /** 같은 맵: 친구 옆으로 순간이동 */
  | { do: "warp" }
  /** 버스로 to까지. via = 먼저 내릴 곳 (캠핑장 ↔ 바닷가는 마을을 거친다) */
  | { do: "bus"; to: MapId; via: "village" | null }
  | { do: "block"; message: string };

/** 내가 from 맵에 있고 친구가 to 맵에 있을 때. big = 지금 내 커진 배율 (1 = 그대로) */
export function friendRoute(from: MapId, to: MapId, big: number): FriendRoute {
  if (from === to) return { do: "warp" };
  if (big > 1) return { do: "block", message: FRIEND_BIG_MSG };
  return { do: "bus", to, via: from !== "village" && to !== "village" ? "village" : null };
}

/** 마을 밖 맵에서 버스를 탈 때: 마을에 내린 뒤 이어서 갈 맵 (마을이 목적지면 없음) */
export function nextAfterVillage(r: FriendRoute): AwayMapId | undefined {
  return r.do === "bus" && r.via === "village" && r.to !== "village" ? r.to : undefined;
}
