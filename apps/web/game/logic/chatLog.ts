// 채팅 기록창의 순수 규칙 (화면 쪽 메모리에만 두고 기기에 저장하지 않는다).
// 줄은 하루(CHAT_LOG_HISTORY_MS) 동안 기록으로 남는다. 방금 오간 줄(CHAT_LOG_TTL_MS = 5분)만 폰 화면 글씨로 떠 있다가 흐려지고,
// 기록창(데스크톱 상자·폰 [기록] 창·채팅 입력 줄)에서는 그보다 지난 줄을 흐리게 "N분 전"과 함께 보여 준다.
// 방에 들어올 때 서버가 보내 주는 최근 기록(chatLog — 서버가 잠들었다 깨도 맵별 최근 50줄은 남는다)은 받은 줄과
// 서버 줄 id(key)로 합친다 (내가 쓴 줄은 글·시각으로 맞춘다).

import { CHAT_HISTORY_MS, CHAT_MAX, CHAT_RECENT_MAX, CHAT_RECENT_MS } from "@tomb/protocol";

/** "방금 오간 글"로 보는 시간: 폰 화면 글씨가 떠 있는 시간, 기록창에서 흐려지지 않는 시간 */
export const CHAT_LOG_TTL_MS = CHAT_RECENT_MS;
/** 기록으로 들고 있는 시간 (이보다 지난 줄은 버린다) */
export const CHAT_LOG_HISTORY_MS = CHAT_HISTORY_MS;
/** 폰 화면 글씨가 사라지기 전 서서히 흐려지는 시간 (TTL 끝부분) */
export const CHAT_LOG_FADE_MS = 10_000;
/** 기록창에서 지난 줄(TTL 지남)의 불투명도 */
export const CHAT_LOG_OLD_OPACITY = 0.6;
/** 메모리에 들고 있는 최대 줄 수 (스크롤 안전 상한) */
export const CHAT_LOG_KEEP = CHAT_RECENT_MAX;
/** 모바일 평소에 글씨만 띄우는 줄 수 (터치 통과). 지난 줄은 [기록] 창·채팅 입력 줄에서 스크롤로 본다 */
export const CHAT_LOG_MOBILE_LINES = 5;

export type ChatLine = {
  /** 화면 안 번호 (React key) */
  id: number;
  /** 서버 줄 id (chat 방송·chatLog). 없으면 내가 보낸 줄이거나 옛 서버 */
  key?: string;
  /** 보낸 사람 이름 (운영자도 닉네임 그대로 — staff 표시로 금색·"운영자" 딱지) */
  name: string;
  /** 가림 처리된 글 그대로 */
  text: string;
  /** 내가 쓴 줄 */
  mine: boolean;
  /** 받은(보낸) 시각 ms (이 기기 시계) */
  at: number;
  /** 운영자 계정 (실시간 서버가 알린 staff 표시만, 이름이 같아도 흉내 불가) → 이름 금색 */
  staff?: true;
  /** 11/16 매니저 계정 (실시간 서버가 알린 mgr 표시만) → "매니저" 딱지 */
  mgr?: true;
  /** 보낸 사람의 닉네임 꾸미기 id (이름 글자·이름표 — 게임이 아는 그 사람 착용 목록에서). 없으면 그냥 이름 */
  ns?: string[];
  /** 11/16 쓴 사람이 있던 맵 (캠핑장이면 "camp", 없으면 마을) → 다른 맵에서 보면 [캠핑장]·[마을] (chatPlaceTag) */
  m?: "camp";
  /**
   * 11/16 귓속말 줄 (이 화면에만, 서버 기록에는 없다). out = 내가 보냄(name = 받는 사람), in = 받음(name = 보낸 사람),
   * fail = 못 보냄 안내(text만). 채팅창에 "[귓속말] 나 → 진순: …"처럼 분홍색으로
   */
  w?: "out" | "in" | "fail";
};

/** 서버 chatLog 한 줄을 이 기기 시계로 옮긴 것 */
export type IncomingChatLine = Omit<ChatLine, "id"> & { key: string };

/** 내가 보낸 줄(key 없음)과 서버가 돌려준 내 줄을 같은 줄로 보는 시각 차 (왕복 지연 여유) */
export const CHAT_MINE_MATCH_MS = 15_000;

/** 아직 기록으로 남는(하루가 안 지난) 줄만 */
export function liveChatLines(lines: readonly ChatLine[], now: number): ChatLine[] {
  return lines.filter((l) => now - l.at < CHAT_LOG_HISTORY_MS);
}

/** 방금 오간(5분이 안 지난) 줄 중 최근 max줄 — 폰 화면 글씨 */
export function recentChatLines(lines: readonly ChatLine[], now: number, max: number): ChatLine[] {
  const fresh = lines.filter((l) => now - l.at < CHAT_LOG_TTL_MS);
  return fresh.length > max ? fresh.slice(fresh.length - max) : fresh;
}

/** 새 줄을 맨 뒤에 붙인다. 지난 줄은 빼고, 넘치면 오래된 것부터 버린다 */
export function addChatLine(lines: readonly ChatLine[], line: ChatLine, max = CHAT_LOG_KEEP): ChatLine[] {
  // 이미 chatLog로 받은 줄이면 그대로
  if (line.key !== undefined && lines.some((l) => l.key === line.key)) return [...lines];
  const next = [...liveChatLines(lines, line.at), line];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** 기록창에 보여 줄 줄 (max가 있으면 최근 max줄만) */
export function visibleChatLines(lines: readonly ChatLine[], now: number, max?: number): ChatLine[] {
  const live = liveChatLines(lines, now);
  return max !== undefined && live.length > max ? live.slice(live.length - max) : live;
}

/** 폰 화면 글씨의 불투명도: 5분의 마지막 FADE 동안 1 → 0 */
export function chatLineOpacity(line: ChatLine, now: number): number {
  const left = CHAT_LOG_TTL_MS - (now - line.at);
  return Math.max(0, Math.min(1, left / CHAT_LOG_FADE_MS));
}

/** 기록창 줄의 불투명도: 방금 오간 줄은 또렷하게, 지난 줄은 흐리게 */
export function chatLineDim(line: ChatLine, now: number): number {
  return now - line.at < CHAT_LOG_TTL_MS ? 1 : CHAT_LOG_OLD_OPACITY;
}

/** 지난 줄 옆 작은 시각: "N분 전"·"N시간 전" (방금 오간 줄이면 null) */
export function chatLineAgo(line: ChatLine, now: number): string | null {
  const ms = now - line.at;
  if (ms < CHAT_LOG_TTL_MS) return null;
  const min = Math.floor(ms / 60_000);
  return min < 60 ? `${min}분 전` : `${Math.floor(min / 60)}시간 전`;
}

/** 글자색 구분: 내 줄은 촛불색, 다른 사람은 연한 이름 + 밝은 내용, 11/16 귓속말은 분홍색 */
export function chatLineTone(line: ChatLine): "mine" | "other" | "whisper" {
  if (line.w) return "whisper";
  return line.mine ? "mine" : "other";
}

/**
 * 서버 chatLog를 합친다: 같은 key는 건너뛰고, 내 줄은 key 없는 내 줄(같은 글, 시각 차 CHAT_MINE_MATCH_MS 이내)에 key만 붙인다.
 * 시각 순으로 늘어놓고, 하루 지난 줄은 빼고, 넘치면 오래된 것부터 버린다. nextId = 새 줄 화면 번호
 */
export function mergeChatLines(lines: readonly ChatLine[], incoming: readonly IncomingChatLine[], now: number, nextId: () => number, max = CHAT_LOG_KEEP): ChatLine[] {
  const out = lines.map((l) => ({ ...l }));
  for (const inc of incoming) {
    if (now - inc.at >= CHAT_LOG_HISTORY_MS || out.some((l) => l.key === inc.key)) continue;
    const own = inc.mine ? out.find((l) => l.mine && !l.w && l.key === undefined && l.text === inc.text && Math.abs(l.at - inc.at) <= CHAT_MINE_MATCH_MS) : undefined;
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
    out.push({ key: l.id, name: l.name.slice(0, 40), text: l.text.slice(0, CHAT_MAX * 2), mine: l.mine === true, ...(l.staff === true ? { staff: true } : {}), ...(l.mgr === true ? { mgr: true } : {}), ...(l.m === "camp" ? { m: "camp" as const } : {}), at: localNow - age });
  }
  return out;
}

/**
 * 11/16 다른 맵에서 쓴 줄 앞 표시: 지금 보는 맵(here)과 쓴 사람의 맵이 다르면 "[캠핑장]"·"[마을]", 같거나 맵을 모르면(집 안 등) null
 */
export function chatPlaceTag(line: Pick<ChatLine, "m">, here: "camp" | "village" | null): string | null {
  if (!here) return null;
  const from = line.m === "camp" ? "camp" : "village";
  return from === here ? null : from === "camp" ? "[캠핑장]" : "[마을]";
}

/**
 * 채팅 기록을 비우는 단위: GameShell이 넘기는 방 문자열("world:3", "house:3")의 채널 부분.
 * 같은 채널 마을↔집↔캠핑장(11/16부터 한 기록)은 그대로 이어지고, 채널을 옮기면 비운다
 */
export function chatChannelOf(room: string): string {
  const i = room.indexOf(":");
  return i < 0 ? room : room.slice(i + 1);
}

/** 스크롤 기록: 이만큼(px) 안이면 맨 아래를 보고 있는 것으로 본다 */
export const CHAT_STICK_PX = 4;

/** 스크롤 기록에서 지금 맨 아래를 보고 있는지 */
export function chatAtBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight < CHAT_STICK_PX;
}

/**
 * 줄이 바뀐 뒤 스크롤 기록이 할 일 (데스크톱 상자·폰 기록 창·폰 채팅 입력 줄 공통)
 *  - reset: 스크롤할 만큼 줄이 없다 → 다시 맨 아래 고정, [새 메시지 ↓] 끄기
 *  - follow: 맨 아래를 보고 있다 → 따라 내려가기
 *  - unread: 위를 읽는 중에 새 줄 → 끌어내리지 않고 [새 메시지 ↓]만
 *  - none: 위를 읽는 중, 새 줄 없음(지난 줄이 빠짐 등) → 그대로
 */
export function chatScrollAction(s: { overflow: boolean; stick: boolean; added: boolean }): "reset" | "follow" | "unread" | "none" {
  if (!s.overflow) return "reset";
  if (s.stick) return "follow";
  return s.added ? "unread" : "none";
}
