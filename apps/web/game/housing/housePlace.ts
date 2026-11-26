// 11/24 집에 들어가고 나올 때 내 캐릭터를 어디에 둘지 (game/housing/install.ts).
// 11/26 운영자 「내 집 가기로 마을에서 바닷가 집에 들어갔으면, 나올 때 바닷가 집 앞으로. 그냥 워프 가능하게」:
//  - 어디서 어떻게 들어갔든(문·[내 집 가기]·친구 집 놀러 가기) 나오면 그 집이 있는 맵의 그 집 문 앞
//  - 지금 맵이면 그 자리로 옮기기만, 다른 맵이면 맵을 옮긴다 (버스 길 그대로, 창밖 연출 없이 — friend:goto의 door)
//  - 분양 마을(옛 2단지 씬)에서 들어간 집은 분양 마을로. 다른 채널의 집은 그 채널로 옮긴 뒤에만 들어간다 (꽉 찼으면 들어가지 않는다 — HousingOffice).
//    그래도 채널이 다르면(집 안에서 사무소 창으로 다른 채널 집에 옮겨 갔다) 들어가기 전 자리 그대로

import { campLotByNo, houseLot, SEA_LOTS, seaLotFront, type MapId } from "@tomb/protocol";

export type HouseFrom = "world" | "village";
/** 집이 있는 구역 (PublicHouse.zone — 없으면 마을 집) */
export type HouseZone = "sea" | "camp" | undefined;

/** 그 집 문 앞이 있는 맵 */
export const houseMapOf = (zone: HouseZone): MapId => zone ?? "village";

/**
 * 그 집 문 앞 (맵과 좌표 — 집 그림을 아직 못 그린 맵에서도 쓰는 터 기준 자리). 도착한 맵이 집을 그리면 문 바로 앞으로 다시 맞춘다
 * (마을 standAtHouseDoor · 바닷가·캠핑장 standAtLot). 메인 맵에 없는 마을 번지(2단지·집터 기다리는 0번지)·없는 터면 null
 */
export function houseDoorSpot(zone: HouseZone, lot: number): { map: MapId; x: number; y: number } | null {
  if (zone === "sea") {
    const l = SEA_LOTS.find((s) => s.n === lot);
    if (!l) return null;
    const f = seaLotFront(l, 14);
    return { map: "sea", x: f.x, y: f.y };
  }
  if (zone === "camp") {
    const l = campLotByNo(lot);
    return l ? { map: "camp", x: l.door.x, y: l.door.y } : null;
  }
  const l = houseLot(lot);
  // doorSpot.ts doorFront의 첫 후보 (문 바로 아래)
  return l ? { map: "village", x: l.door.x, y: l.door.y + 14 } : null;
}

/** 들어갈 때 숨은 캐릭터를 미리 문 앞에 세울지 (새로고침 복원도 그 자리를 기억한다): 그 집이 지금 맵에 있을 때만 */
export const doorOnEnter = (from: HouseFrom, sameMap: boolean): boolean => from === "world" && sameMap;

export type HouseExit =
  /** 분양 마을 씬으로 */
  | { to: "village" }
  /** 지금 맵의 그 집 문 앞으로 */
  | { to: "door" }
  /** 그 집이 있는 다른 맵의 문 앞으로 맵을 옮긴다 */
  | { to: "warp"; map: MapId; x: number; y: number }
  /** 들어가기 전 자리 그대로 */
  | { to: "stay" };

export type HouseExitInput = {
  from: HouseFrom;
  /** 분양 마을 정보가 있다 (분양 마을 씬으로 돌아갈 수 있다) */
  hasVillage: boolean;
  /** 집에 들어가기 전에 있던 맵 (집 씬이 빌린 장면) */
  host: MapId;
  zone: HouseZone;
  lot: number;
  /** 그 집 채널 · 지금 채널 (모르면 null — 같다고 본다) */
  houseCh: number;
  ch: number | null;
};

/** 나올 때 어디로 */
export function houseExitTo(o: HouseExitInput): HouseExit {
  if (o.from === "village" && o.hasVillage) return { to: "village" };
  const spot = houseDoorSpot(o.zone, o.lot);
  if (!spot) return { to: "stay" };
  // 다른 채널의 집 (집 안에서 다른 채널 집으로 옮겨 갔다): 이 채널의 같은 번지는 다른 집이라 옮기지 않는다
  if (o.ch !== null && o.houseCh !== o.ch) return { to: "stay" };
  if (spot.map === o.host) return { to: "door" };
  return { to: "warp", map: spot.map, x: spot.x, y: spot.y };
}
