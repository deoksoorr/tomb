// 유저이름 규칙: 2~12자, 한글·영문·숫자·공백·_ 만. 금칙어 필터. (클라이언트·서버 공용)

export const NAME_MIN = 2;
export const NAME_MAX = 12;
const NAME_RE = /^[가-힣A-Za-z0-9 _]+$/;

// 공백·_ 제거 + 소문자로 비교. 사칭 방지 단어 포함.
const BANNED = [
  "시발", "씨발", "씨빨", "시바", "ㅅㅂ", "병신", "븅신", "ㅂㅅ", "좆", "존나", "졸라", "개새", "개색", "새끼",
  "미친놈", "미친년", "니미", "느금", "애미", "애비", "섹스", "자지", "보지", "운영자", "관리자", "admin",
  "fuck", "shit", "bitch", "sex", "nigger", "nigga", "cunt", "dick", "pussy",
];

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };

export function normalizeName(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * 이름 중복 비교 키: 정규화(NFC·공백 정리) 뒤 공백·_ 를 빼고 소문자로. "홍길동"·"홍 길동"·"홍_길동"은 같은 이름이다.
 * 서버의 이름 색인(이름 → 계정)이 이 키를 쓴다
 */
export function nameKey(raw: string): string {
  return normalizeName(raw).replace(/[\s_]/g, "").toLowerCase();
}

/** 다른 계정이 이미 쓰는 이름일 때 (입력 중 미리 확인·저장 실패 모두 같은 문구) */
export const NAME_TAKEN_MESSAGE = "이미 있는 이름이에요.";

export function checkName(raw: unknown): NameCheck {
  if (typeof raw !== "string") return { ok: false, reason: "이름을 입력해 주세요." };
  const name = normalizeName(raw);
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) return { ok: false, reason: `이름은 ${NAME_MIN}~${NAME_MAX}자로 지어 주세요.` };
  if (!NAME_RE.test(name)) return { ok: false, reason: "한글, 영문, 숫자, 공백, _ 만 쓸 수 있어요." };
  const flat = nameKey(name);
  if (BANNED.some((w) => flat.includes(w))) return { ok: false, reason: "쓸 수 없는 단어가 들어 있어요." };
  // 운영자 공개 이름 "대장" 흉내 막기: "대장"이나 "○○대장"은 안 되고, "대장장이"처럼 다른 낱말 안에 든 건 된다
  if (flat === "대장" || flat.endsWith("대장")) return { ok: false, reason: "쓸 수 없는 단어가 들어 있어요." };
  return { ok: true, name };
}
