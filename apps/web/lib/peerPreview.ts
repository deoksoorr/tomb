import type { MapId } from "@tomb/protocol";
import { PLACE_TITLE } from "./placeName";

// 11/17 채널 이동 창 "지금 여기" 카드의 같이 있는 사람 문구.
// 게임은 지금 맵(마을·캠핑장·바닷가)에 보이는 사람만 안다 → 채널 인원(로비)과 견줘서 다른 곳에 있는 사람 수도 알려 준다.
// 채널 인원은 로비 캐시만큼(최대 몇 초) 늦을 수 있어 0 아래로는 세지 않는다.
// 장소는 정식 이름으로 부른다 (기억숲 마을·언젠가 캠핑장·달물결 포구)

/** 지금 맵에 같이 있는 사람 말고, 이 채널 다른 곳에 있는 사람 수 (나는 빼고) */
export function elsewhereCount(channelCount: number, namesHere: number): number {
  return Math.max(0, channelCount - 1 - namesHere);
}

/** 지금 맵에 아무도 없을 때 한 줄 */
export function aloneLine(map: MapId, elsewhere: number): string {
  if (elsewhere > 0) return `${PLACE_TITLE[map]}에는 지금 나 혼자예요. 이 채널 다른 곳에 ${elsewhere}명 있어요.`;
  return "지금은 이 채널에 나 혼자 있어요. 확성기로 사람을 불러 보세요.";
}

/** 지금 맵에 같이 있는 사람이 있을 때 목록 제목 */
export const hereLabel = (map: MapId): string => `${PLACE_TITLE[map]}에 같이 있는 사람`;

/** 목록 아래 덧붙임 (다른 곳에 아무도 없으면 null) */
export const elsewhereLine = (elsewhere: number): string | null => (elsewhere > 0 ? `이 채널 다른 곳에 ${elsewhere}명 더 있어요.` : null);
