// 채팅 기록창의 순수 규칙 (화면 쪽 메모리에만 두고 기기에 저장하지 않는다. 서버도 방별 최근 5분만 메모리에 들고 있다).
// 각 줄은 5분 동안 보이고 마지막 몇 초 동안 서서히 흐려진다. 데스크톱은 상자 안에서 스크롤, 모바일은 최근 몇 줄만.
// 방에 들어올 때 서버가 보내 주는 최근 5분(chatLog)은 받은 줄과 서버 줄 id(key)로 합친다 (내가 쓴 줄은 글·시각으로 맞춘다).

import { CHAT_MAX, CHAT_RECENT_MAX, CHAT_RECENT_MS } from "@tomb/protocol";

/** 한 줄이 보이는 시간 */
export const CHAT_LOG_TTL_MS = CHAT_RECENT_MS;
/** 사라지기 전 서서히 흐려지는 시간 (TTL 끝부분) */
export const CHAT_LOG_FADE_MS = 10_000;
/** 메모리에 들고 있는 최대 줄 수 (데스크톱 스크롤 안전 상한) */
export const CHAT_LOG_KEEP = CHAT_RECENT_MAX;
/** 모바일 글씨만 띄우는 줄 수 (터치 통과라 스크롤이 없다) */
export const CHAT_LOG_MOBILE_LINES = 5;

export type ChatLine = {
  /** 화면 안 번호 (React key) */
  id: number;
  /** 서버 줄 id (chat 방송·chatLog). 없으면 내가 보낸 줄이거나 옛 서버 */
  key?: string;
  /** 보낸 사람 이름 (운영자는 서버·이름표 규칙대로 이미 공개 이름 "대장") */
  name: string;
  /** 가림 처리된 글 그대로 */
  text: string;
  /** 내가 쓴 줄 */
  mine: boolean;
  /** 받은(보낸) 시각 ms (이 기기 시계) */
  at: number;
  /** 운영자 계정 (실시간 서버가 알린 staff 표시만, 이름이 같아도 흉내 불가) → 이름 금색 */
  staff?: true;
  /** 보낸 사람의 닉네임 꾸미기 id (이름 글자·이름표 — 게임이 아는 그 사람 착용 목록에서). 없으면 그냥 이름 */
  ns?: string[];
};

/** 서버 chatLog 한 줄을 이 기기 시계로 옮긴 것 */
export type IncomingChatLine = Omit<ChatLine, "id"> & { key: string };

/** 내가 보낸 줄(key 없음)과 서버가 돌려준 내 줄을 같은 줄로 보는 시각 차 (왕복 지연 여유) */
export const CHAT_MINE_MATCH_MS = 15_000;

/** 아직 5분이 안 지난 줄만 */
export function liveChatLines(lines: readonly ChatLine[], now: number): ChatLine[] {
  return lines.filter((l) => now - l.at < CHAT_LOG_TTL_MS);
}

/** 새 줄을 맨 뒤에 붙인다. 지난 줄은 빼고, 넘치면 오래된 것부터 버린다 */
export function addChatLine(lines: readonly ChatLine[], line: ChatLine, max = CHAT_LOG_KEEP): ChatLine[] {
  // 이미 chatLog로 받은 줄이면 그대로
  if (line.key !== undefined && lines.some((l) => l.key === line.key)) return [...lines];
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

/**
 * 서버 chatLog를 합친다: 같은 key는 건너뛰고, 내 줄은 key 없는 내 줄(같은 글, 시각 차 CHAT_MINE_MATCH_MS 이내)에 key만 붙인다.
 * 시각 순으로 늘어놓고, 5분 지난 줄은 빼고, 넘치면 오래된 것부터 버린다. nextId = 새 줄 화면 번호
 */
export function mergeChatLines(lines: readonly ChatLine[], incoming: readonly IncomingChatLine[], now: number, nextId: () => number, max = CHAT_LOG_KEEP): ChatLine[] {
  const out = lines.map((l) => ({ ...l }));
  for (const inc of incoming) {
    if (now - inc.at >= CHAT_LOG_TTL_MS || out.some((l) => l.key === inc.key)) continue;
    const own = inc.mine ? out.find((l) => l.mine && l.key === undefined && l.text === inc.text && Math.abs(l.at - inc.at) <= CHAT_MINE_MATCH_MS) : undefined;
    if (own) own.key = inc.key;
    else out.push({ ...inc, id: nextId() });
  }
  const live = liveChatLines(out, now).sort((a, b) => a.at - b.at);
  return live.length > max ? live.slice(live.length - max) : live;
}

/**
 * 서버 chatLog 이벤트(최소 검증) → 이 기기 시계의 줄. 서버가 준 now와 각 줄 at의 차(지난 시간)만 쓰므로 기기 시계가 달라도 남은 시간이 맞다.
 * 형식이 이상한 줄은 버린다
 */
export function readChatLog(serverNow: unknown, raw: unknown, localNow: number): IncomingChatLine[] {
  if (typeof serverNow !== "number" || !Number.isFinite(serverNow) || !Array.isArray(raw)) return [];
  const out: IncomingChatLine[] = [];
  for (const v of raw.slice(-CHAT_LOG_KEEP)) {
    if (!v || typeof v !== "object") continue;
    const l = v as Record<string, unknown>;
    if (typeof l.id !== "string" || !l.id || l.id.length > 64 || typeof l.at !== "number" || !Number.isFinite(l.at)) continue;
    if (typeof l.name !== "string" || typeof l.text !== "string" || !l.text) continue;
    const age = Math.max(0, serverNow - l.at);
    out.push({ key: l.id, name: l.name.slice(0, 40), text: l.text.slice(0, CHAT_MAX * 2), mine: l.mine === true, ...(l.staff === true ? { staff: true } : {}), at: localNow - age });
  }
  return out;
}
