import { MEGAPHONE_MAX } from "@tomb/protocol";
import { hasBanned } from "./housing/text";

// 23번 확성기 문장 검사 (서버). 한 줄, 1~60자, 링크·금칙어 금지. 금칙어는 유저이름·방명록과 같은 목록(lib/housing/text.ts)

const URL_RE = /(https?:\/\/|www\.|\.(com|net|kr|io|gg|me)\b)/i;
// 제어문자·줄바꿈·제로폭 문자 (보이지 않는 글자로 금칙어 검사를 피하지 못하게)
const INVISIBLE_RE = new RegExp("[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]", "g");
/** 같은 글자 반복 도배 (ㅋㅋㅋ… 같은 것은 6번까지 허용) */
const REPEAT_RE = /(.)\1{7,}/u;

export type MegaphoneTextCheck = { ok: true; text: string } | { ok: false; reason: string };

export function checkMegaphoneText(raw: unknown): MegaphoneTextCheck {
  const text = typeof raw === "string" ? raw.normalize("NFC").replace(INVISIBLE_RE, " ").replace(/\s+/g, " ").trim() : "";
  const len = [...text].length;
  if (len < 1) return { ok: false, reason: "외칠 말을 적어 주세요." };
  if (len > MEGAPHONE_MAX) return { ok: false, reason: `확성기는 ${MEGAPHONE_MAX}자까지 외칠 수 있어요.` };
  if (URL_RE.test(text)) return { ok: false, reason: "링크는 넣을 수 없어요." };
  if (REPEAT_RE.test(text)) return { ok: false, reason: "같은 글자를 너무 많이 반복했어요." };
  if (hasBanned(text)) return { ok: false, reason: "쓸 수 없는 단어가 들어 있어요." };
  return { ok: true, text };
}
