// 11/16 귓속말 입력: 채팅 입력칸에 "/귓 닉네임 할 말" (또는 "/w 닉네임 할 말"), 답장은 "/답 할 말" (또는 "/r 할 말").
// 이름에 공백이 들 수 있어 아는 이름(최근 귓속말 상대·채팅창에 보인 사람들) 중 가장 긴 것으로 나눈다. 모르는 이름이면 첫 낱말을 이름으로 보낸다
// (실시간 서버가 접속자 이름으로 다시 맞추므로 여기서 조금 틀려도 맞는 사람에게 간다).
// 최근 귓속말 상대 목록 규칙(addPartner·filterPartners·readPartners)과 입력칸 위 이름 칩(whisperChips)도 여기.

import { WHO_ON_MAX, matchWhisperTarget, nameKey, normalizeChat } from "@tomb/protocol";

const COMMAND_RE = /^\/(?:귓|w)(?=\s|$)/i;
const REPLY_RE = /^\/(?:답|r)(?=\s|$)/i;

/** send = 보낼 수 있음, empty = 이름이나 할 말이 아직 없음, long = 할 말이 너무 김 (size = 할 말 글자 수), noReply = 답장할 귓속말이 없음 */
export type WhisperDraft = { kind: "send"; to: string; text: string } | { kind: "empty" } | { kind: "long"; size: number } | { kind: "noReply" };

/** 입력이 귓속말(답장 포함) 명령으로 시작하는지 */
export function isWhisperCommand(raw: string): boolean {
  const s = raw.trimStart();
  return COMMAND_RE.test(s) || REPLY_RE.test(s);
}

/** 답장(/답·/r) 명령으로 시작하는지 */
export function isReplyCommand(raw: string): boolean {
  return REPLY_RE.test(raw.trimStart());
}

/** 할 말 정리: 비었으면 empty, 너무 길면 long */
function draftOf(to: string, rest: string): WhisperDraft {
  if (!to || !rest.trim()) return { kind: "empty" };
  const text = normalizeChat(rest);
  return text ? { kind: "send", to, text } : { kind: "long", size: [...rest.trim()].length };
}

/** 귓속말 명령 나누기. replyTo = /답 대상 (마지막으로 나에게 귓속말한 사람). 귓속말 명령이 아니면 null */
export function parseWhisper(raw: string, names: Iterable<string>, replyTo?: string | null): WhisperDraft | null {
  const s = raw.normalize("NFC").trimStart();
  if (REPLY_RE.test(s)) return replyTo ? draftOf(replyTo, s.replace(REPLY_RE, "")) : { kind: "noReply" };
  if (!COMMAND_RE.test(s)) return null;
  const body = s.replace(COMMAND_RE, "").replace(/\s+/g, " ").trim();
  const hit = matchWhisperTarget(body, names, (n) => n);
  const sp = body.indexOf(" ");
  if (hit) return draftOf(hit.target, hit.text);
  return sp > 0 ? draftOf(body.slice(0, sp), body.slice(sp + 1)) : { kind: "empty" };
}

/** 캐릭터 메뉴 [귓속말]·이름 칩이 채워 넣는 글 */
export function whisperPrefill(name: string): string {
  return `/귓 ${name} `;
}

// ── 최근 귓속말 상대 ──

/** 최근 귓속말 상대 최대 수 (서버에 접속 여부를 한 번에 물어볼 수 있는 수와 같다) */
export const WHISPER_PARTNERS_MAX = WHO_ON_MAX;

/** 맨 앞에 넣는다 (같은 이름 키는 빼고 새 이름으로), 넘치면 오래된 것부터 버린다 */
export function addPartner(list: readonly string[], name: string, max = WHISPER_PARTNERS_MAX): string[] {
  const k = nameKey(name);
  if (!k) return [...list];
  return [name, ...list.filter((n) => nameKey(n) !== k)].slice(0, max);
}

/** 입력 중인 이름 앞부분으로 거르기 (이름 키 기준, 비었으면 전부) */
export function filterPartners(list: readonly string[], query: string): string[] {
  const q = nameKey(query);
  return q ? list.filter((n) => nameKey(n).startsWith(q)) : [...list];
}

/** 저장된 값 읽기: 문자열 배열만, 최대 개수까지 겹치지 않게 (형식이 틀리면 빈 목록) */
export function readPartners(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.filter((n): n is string => typeof n === "string" && nameKey(n) !== "").reduceRight<string[]>((acc, n) => addPartner(acc, n), []);
  } catch {
    return [];
  }
}

/**
 * 입력칸 위 이름 칩: 입력이 "/귓 " 뒤에 이름을 쓰는 중이면 그 앞부분에 맞는 최근 상대 (이름을 다 쓰고 띄었으면 그 이름은 뺀다).
 * 이름을 쓰는 중이 아니면 null
 */
export function whisperChips(raw: string, partners: readonly string[]): string[] | null {
  const m = /^\/(?:귓|w)\s+([\s\S]*)$/i.exec(raw.normalize("NFC").trimStart());
  if (!m) return null;
  const q = m[1].replace(/\s+/g, " ").trim();
  const done = /\s$/.test(m[1]) ? nameKey(q) : null;
  return filterPartners(partners, q).filter((n) => nameKey(n) !== done);
}
