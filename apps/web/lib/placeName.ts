import { CAMP_TITLE, SEA_TITLE, VILLAGE_TITLE, type MapId } from "@tomb/protocol";

// 11/17 장소 정식 이름 한곳에서 (기억숲 마을·언젠가 캠핑장·달물결 포구)

export const PLACE_TITLE: Record<MapId, string> = { village: VILLAGE_TITLE, camp: CAMP_TITLE, sea: SEA_TITLE };

/** 화면 위 채널 표시의 장소: 넓은 화면은 정식 이름, 좁은 화면(compact)은 채널만 (null). 맵을 모르면(접속 직후) 마을로 본다 */
export const hudPlace = (map: MapId | undefined, compact: boolean): string | null => (compact ? null : PLACE_TITLE[map ?? "village"]);
