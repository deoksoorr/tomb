// 11/16 귓속말 입력: 채팅 입력칸에 "/귓 닉네임 할 말" (또는 "/w 닉네임 할 말").
// 이름에 공백이 들 수 있어 아는 이름(채팅창에 보인 사람들) 중 가장 긴 것으로 나눈다. 모르는 이름이면 첫 낱말을 이름으로 보낸다
// (실시간 서버가 접속자 이름으로 다시 맞추므로 여기서 조금 틀려도 맞는 사람에게 간다).

import { matchWhisperTarget, normalizeChat } from "@tomb/protocol";

const COMMAND_RE = /^\/(?:귓|w)(?=\s|$)/i;

/** send = 보낼 수 있음, empty = 이름이나 할 말이 아직 없음, long = 할 말이 너무 김 (size = 할 말 글자 수) */
export type WhisperDraft = { kind: "send"; to: string; text: string } | { kind: "empty" } | { kind: "long"; size: number };

/** 입력이 귓속말 명령으로 시작하는지 */
export function isWhisperCommand(raw: string): boolean {
  return COMMAND_RE.test(raw.trimStart());
}

/** 귓속말 명령 나누기. 귓속말 명령이 아니면 null */
export function parseWhisper(raw: string, names: Iterable<string>): WhisperDraft | null {
  const s = raw.normalize("NFC").trimStart();
  if (!COMMAND_RE.test(s)) return null;
  const body = s.replace(COMMAND_RE, "").replace(/\s+/g, " ").trim();
  const hit = matchWhisperTarget(body, names, (n) => n);
  const sp = body.indexOf(" ");
  const to = hit ? hit.target : sp > 0 ? body.slice(0, sp) : "";
  const rest = hit ? hit.text : sp > 0 ? body.slice(sp + 1) : "";
  if (!to || !rest.trim()) return { kind: "empty" };
  const text = normalizeChat(rest);
  return text ? { kind: "send", to, text } : { kind: "long", size: [...rest].length };
}

/** 캐릭터 메뉴 [귓속말]이 채워 넣는 글 */
export function whisperPrefill(name: string): string {
  return `/귓 ${name} `;
}
