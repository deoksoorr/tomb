// 채팅 기록창의 순수 규칙 (화면 쪽 메모리에만 두고 서버·기기 어디에도 저장하지 않는다).
// 각 줄은 1분 동안 보이고 마지막 몇 초 동안 서서히 흐려진다. 데스크톱은 상자 안에서 스크롤, 모바일은 최근 몇 줄만.

/** 한 줄이 보이는 시간 */
export const CHAT_LOG_TTL_MS = 60_000;
/** 사라지기 전 서서히 흐려지는 시간 (TTL 끝부분) */
export const CHAT_LOG_FADE_MS = 10_000;
/** 메모리에 들고 있는 최대 줄 수 (데스크톱 스크롤 안전 상한) */
export const CHAT_LOG_KEEP = 50;
/** 모바일 글씨만 띄우는 줄 수 (터치 통과라 스크롤이 없다) */
export const CHAT_LOG_MOBILE_LINES = 5;

export type ChatLine = {
  id: number;
  /** 보낸 사람 이름 (운영자는 서버·이름표 규칙대로 이미 "운영자") */
  name: string;
  /** 가림 처리된 글 그대로 */
  text: string;
  /** 내가 쓴 줄 */
  mine: boolean;
  /** 받은(보낸) 시각 ms */
  at: number;
};

/** 아직 1분이 안 지난 줄만 */
export function liveChatLines(lines: readonly ChatLine[], now: number): ChatLine[] {
  return lines.filter((l) => now - l.at < CHAT_LOG_TTL_MS);
}

/** 새 줄을 맨 뒤에 붙인다. 지난 줄은 빼고, 넘치면 오래된 것부터 버린다 */
export function addChatLine(lines: readonly ChatLine[], line: ChatLine, max = CHAT_LOG_KEEP): ChatLine[] {
  const next = [...liveChatLines(lines, line.at), line];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** 지금 보여 줄 줄 (max가 있으면 최근 max줄만) */
export function visibleChatLines(lines: readonly ChatLine[], now: number, max?: number): ChatLine[] {
  const live = liveChatLines(lines, now);
  return max !== undefined && live.length > max ? live.slice(live.length - max) : live;
}

/** 줄의 불투명도: 마지막 FADE 동안 1 → 0 */
export function chatLineOpacity(line: ChatLine, now: number): number {
  const left = CHAT_LOG_TTL_MS - (now - line.at);
  return Math.max(0, Math.min(1, left / CHAT_LOG_FADE_MS));
}

/** 글자색 구분: 내 줄은 촛불색, 다른 사람은 연한 이름 + 밝은 내용 */
export function chatLineTone(line: ChatLine): "mine" | "other" {
  return line.mine ? "mine" : "other";
}
