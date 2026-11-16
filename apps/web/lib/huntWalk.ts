import type { MapId } from "@tomb/protocol";

// 11/16 [사냥] 버튼 → 내 캐릭터가 마을의 사냥터 입구까지 걸어가서 입구 창을 연다 (순수 함수 — GameShell이 쓴다).
//  - 걷는 중에 다시 누르면 멈춘다
//  - 캠핑장·바닷가에서는 걷지 않고 안내만 (사냥터는 마을에 있다)
//  - 탈것(배·범퍼카 …)에 타 있으면 막는다 (lib/ridePolicy와 같은 규칙). 의자·벤치는 lib/rideGate가 일으켜 세운 뒤 걷는다
// 걷기 자체(길찾기·방향키 취소·도착하면 portal:open)는 게임 장면 몫 (game/world/GraveWalker goPortal)

export const HUNT_AWAY_TOAST = "사냥터는 마을에 있어요. 마을로 가서 눌러 주세요.";
export const HUNT_NO_PATH_TOAST = "사냥터로 가는 길을 찾지 못했어요. 조금 움직인 뒤 다시 눌러 주세요.";

/** 걷는 중 안내 (터치는 방향키 대신 조이스틱) */
export function huntWalkHint(touch: boolean): string {
  return `사냥터로 가는 중… (${touch ? "조이스틱" : "방향키"}로 멈춰요)`;
}

export type HuntPressInput = {
  /** 지금 맵 (bridge map:changed, 모르면 village) */
  map: MapId;
  /** 사냥터로 걸어가는 중 */
  walking: boolean;
  /** 탈것·버스로 막힌 이유 (lib/rideGate rideBlocked, 없으면 null) */
  rideWhy: string | null;
};

export type HuntPress = { do: "cancel" } | { do: "toast"; message: string } | { do: "walk" };

/** [사냥]을 눌렀을 때 할 일 */
export function huntPress(i: HuntPressInput): HuntPress {
  if (i.walking) return { do: "cancel" };
  if (i.map !== "village") return { do: "toast", message: HUNT_AWAY_TOAST };
  if (i.rideWhy) return { do: "toast", message: i.rideWhy };
  return { do: "walk" };
}

export type PortalWalkStatus = "started" | "arrived" | "cancelled" | "unreachable";

/** 걷기 상태 알림 → 걷는 중인지 */
export function walkingAfter(status: PortalWalkStatus | undefined): boolean {
  return status === "started";
}
