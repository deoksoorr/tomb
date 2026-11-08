import { checkName } from "@tomb/protocol";
import { GUEST_MAX_LEN, HOUSE_INTRO_MAX, HOUSE_NAME_MAX } from "./catalog";

// 집 이름·소개·방명록 글 검사. 금칙어는 유저이름 규칙(@tomb/protocol checkName)의 목록을 그대로 쓴다:
// 글자·숫자만 남긴 문장을 12자 창으로 잘라 checkName에 넣으면, 길이·문자 조건은 항상 통과하므로
// 실패 = 금칙어가 들어 있다는 뜻이다 (목록을 복사해 두 군데서 관리하지 않으려는 선택).

export type TextCheck = { ok: true; text: string } | { ok: false; reason: string };

/** checkName이 받는 문자(한글 음절·영문·숫자)에 없는 자모 욕설만 따로 */
const JAMO_BANNED = ["ㅅㅂ", "ㅂㅅ", "ㅄ", "ㅆㅂ", "ㅈㄹ"];
const URL_RE = /(https?:\/\/|www\.)/i;
// 제어문자·줄바꿈·제로폭 문자 (보이지 않는 글자로 금칙어 검사를 피하지 못하게)
const INVISIBLE_RE = new RegExp("[\\u0000-\\u001f\\u007f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]", "g");

const WINDOW = 12;
const STEP = 6;

export function hasBanned(raw: string): boolean {
  const s = raw.normalize("NFC").replace(INVISIBLE_RE, "");
  if (JAMO_BANNED.some((w) => s.replace(/\s/g, "").includes(w))) return true;
  const flat = s.replace(/[^가-힣A-Za-z0-9]/g, "").toLowerCase();
  if (!flat) return false;
  // 한 글자 금칙어도 걸리도록 2자 미만이면 무해한 글자를 붙인다
  const text = flat.length < 2 ? `${flat}가` : flat;
  for (let i = 0; i < text.length; i += STEP) {
    const win = text.slice(i, i + WINDOW);
    const w = win.length < 2 ? `${win}가` : win;
    if (!checkName(w).ok) return true;
    if (i + WINDOW >= text.length) break;
  }
  return false;
}

const clean = (raw: string) => raw.normalize("NFC").replace(INVISIBLE_RE, " ").replace(/\s+/g, " ").trim();
const len = (s: string) => [...s].length;

const HOUSE_NAME_RE = /^[가-힣A-Za-z0-9 _'·.,!?~&()-]+$/;

export function checkHouseName(raw: unknown): TextCheck {
  if (typeof raw !== "string") return { ok: false, reason: "집 이름을 적어 주세요." };
  const text = clean(raw);
  if (len(text) < 1) return { ok: false, reason: "집 이름을 적어 주세요." };
  if (len(text) > HOUSE_NAME_MAX) return { ok: false, reason: `집 이름은 ${HOUSE_NAME_MAX}자까지 지을 수 있어요.` };
  if (!HOUSE_NAME_RE.test(text)) return { ok: false, reason: "집 이름에는 한글, 영문, 숫자, 공백과 몇 가지 문장부호만 쓸 수 있어요." };
  if (hasBanned(text)) return { ok: false, reason: "쓸 수 없는 단어가 들어 있어요." };
  return { ok: true, text };
}

/** 한 줄 글 (소개·방명록). min=0이면 빈 글 허용 */
function checkLine(raw: unknown, min: number, max: number, empty: string, what: string): TextCheck {
  const text = typeof raw === "string" ? clean(raw) : "";
  if (len(text) < min) return { ok: false, reason: empty };
  if (len(text) > max) return { ok: false, reason: `${what} ${max}자까지 적을 수 있어요.` };
  if (URL_RE.test(text)) return { ok: false, reason: "링크는 넣을 수 없어요." };
  if (hasBanned(text)) return { ok: false, reason: "쓸 수 없는 단어가 들어 있어요." };
  return { ok: true, text };
}

export const checkIntro = (raw: unknown) => checkLine(raw ?? "", 0, HOUSE_INTRO_MAX, "", "소개는");
export const checkGuestText = (raw: unknown) => checkLine(raw, 1, GUEST_MAX_LEN, "방명록에 남길 말을 적어 주세요.", "방명록은");
