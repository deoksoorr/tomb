import type { MapId } from "@tomb/protocol";

// 11/19 외치기 창 [상점에서 사기] → 그 자리에서 상점 창을 띄우지 않고, 내 캐릭터가 마을의 유령 잡화점까지 걸어가 들어간 뒤
// 상점 창(확성기 탭)을 연다 (사용자: 「상점으로 가게 해야 함, 그 자리에서 사는 게 아니라」). 순수 함수 — GameShell이 쓴다.
//  - 이미 잡화점 안이면 바로 상점 창
//  - 캠핑장·바닷가·실내(집·사냥터·미니게임)·버스에서는 걷지 않고 안내만 (잡화점은 마을에 있다)
//  - 탈것(배·범퍼카 …)에 타 있으면 막는다 (walk 다음 GameShell이 lib/rideGate로 — 의자·벤치면 일어나서 간다). 걷기·길찾기·도착하면 들어가기는 게임 장면 몫 (GraveWalker goPortal "shop")
// [사냥] 걷기와 같은 portal:walk 알림을 쓴다 (kind "shop")

export const SHOP_AWAY_TOAST = "유령 잡화점은 마을에 있어요. 마을로 가서 다시 눌러 주세요.";
export const SHOP_NO_PATH_TOAST = "잡화점으로 가는 길을 찾지 못했어요. 조금 움직인 뒤 다시 눌러 주세요.";

/** 걷는 중 안내 (터치는 방향키 대신 조이스틱) */
export function shopWalkHint(touch: boolean): string {
  return `잡화점으로 가는 중… (${touch ? "조이스틱" : "방향키"}로 멈춰요)`;
}

export type ShopPressInput = {
  /** 지금 맵 (bridge map:changed, 모르면 village) */
  map: MapId;
  /** 지금 장면 (bridge scene:changed — "world"·"shop"·"house"·"hunt"·"minigame" …) */
  scene: string | undefined;
  /** 버스를 타는 중 */
  riding: boolean;
};

export type ShopPress = { do: "open" } | { do: "toast"; message: string } | { do: "walk" };

/** [상점에서 사기]를 눌렀을 때 할 일 */
export function shopPress(i: ShopPressInput): ShopPress {
  if (i.scene === "shop") return { do: "open" };
  if (i.riding || i.map !== "village" || (i.scene !== undefined && i.scene !== "world")) return { do: "toast", message: SHOP_AWAY_TOAST };
  return { do: "walk" };
}
