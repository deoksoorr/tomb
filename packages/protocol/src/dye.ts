// 46번 염색: 아바타 3부위 색 (6종 몸 공통). 기본은 입장 때 고른 색 하나(머리 = 몸)와 몸마다 정해진 포인트 색이고,
// 염색한 부위만 따로 색을 가진다. 웹(계정)이 정하고, 입장 토큰·look 증서로 실시간 서버에 실려 다른 사람 화면에도 보인다.
//
//  부위    | 두건·키다리   | 고양이       | 토끼             | 이불 유령         | 동글이
//  머리    | 두건·꼭지     | 머리·귀      | 머리·귀          | 천 윗부분(얼굴 쪽) | 몸 윗부분
//  몸      | 망토          | 망토·꼬리    | 망토             | 천 자락           | 아래쪽(배)
//  포인트  | 목도리        | 귀 안쪽·꼬리 끝 | 귀 안쪽·동그란 꼬리 | 밑단 물결·주름   | 머리 위 새싹
// 발·눈·외곽선은 염색되지 않는다.

export const DYE_PARTS = ["head", "body", "accent"] as const;
export type DyePart = (typeof DYE_PARTS)[number];
export const DYE_PART_NAMES: Record<DyePart, string> = { head: "머리", body: "몸", accent: "포인트" };

/** 염색한 부위의 색 ("#rrggbb" 소문자). 없는 부위는 기본색 */
export type AvatarDye = Partial<Record<DyePart, string>>;

/** 포인트 기본색 (두건·키다리의 목도리 베이지). 다른 몸은 염색 전까지 몸마다 원래 포인트 색을 쓴다 */
export const DEFAULT_ACCENT = "#d9ceb2";

const COLOR_RE = /^#[0-9a-f]{6}$/;
const HEX6_RE = /^[0-9a-f]{6}$/;

export function isDyePart(p: unknown): p is DyePart {
  return typeof p === "string" && (DYE_PARTS as readonly string[]).includes(p);
}

/** 염색 색 형식: "#rrggbb" (소문자만) */
export function isDyeColor(c: unknown): c is string {
  return typeof c === "string" && COLOR_RE.test(c);
}

/** 대소문자를 맞춘 "#rrggbb" (형식이 틀리면 null) */
export function normalizeDyeColor(c: unknown): string | null {
  if (typeof c !== "string") return null;
  const s = c.trim().toLowerCase();
  const v = s.startsWith("#") ? s : `#${s}`;
  return COLOR_RE.test(v) ? v : null;
}

/** 아무 부위도 염색하지 않았으면 false */
export function hasDye(d: AvatarDye | null | undefined): boolean {
  return !!d && DYE_PARTS.some((p) => isDyeColor(d[p]));
}

/**
 * 짧은 전송 형식: "머리.몸.포인트" 6자리 hex를 점으로 잇고 기본색 부위는 비운다 ("aabbcc..f4a7b9").
 * 아무 부위도 없으면 "" — 토큰·증서 길이를 아끼려고 객체 대신 쓴다.
 */
export function packDye(d: AvatarDye | null | undefined): string {
  if (!hasDye(d)) return "";
  return DYE_PARTS.map((p) => (isDyeColor(d![p]) ? d![p]!.slice(1) : "")).join(".");
}

/** packDye의 반대. 형식이 틀린 칸은 버린다 */
export function unpackDye(s: unknown): AvatarDye {
  if (typeof s !== "string" || !s || s.length > 32) return {};
  const parts = s.split(".");
  const out: AvatarDye = {};
  DYE_PARTS.forEach((p, i) => {
    const v = parts[i];
    if (v && HEX6_RE.test(v)) out[p] = `#${v}`;
  });
  return out;
}

/** 객체 또는 짧은 형식을 받아 검증된 AvatarDye로 (모르는 키·틀린 색은 버린다) */
export function sanitizeDye(raw: unknown): AvatarDye {
  if (typeof raw === "string") return unpackDye(raw);
  if (!raw || typeof raw !== "object") return {};
  const out: AvatarDye = {};
  for (const p of DYE_PARTS) {
    const c = (raw as Record<string, unknown>)[p];
    if (isDyeColor(c)) out[p] = c;
  }
  return out;
}

/** 두 염색이 같은지 (기본색 부위는 없는 것과 같다) */
export function sameDye(a: AvatarDye | null | undefined, b: AvatarDye | null | undefined): boolean {
  return packDye(a) === packDye(b);
}

/**
 * 염색권 종류. random = 무작위 팔레트에서 직접 찾기(등급이 높을수록 조준점이 덜 흔들리고 색이 다양),
 * fixed = 정해진 색 (관리자·이벤트 발급, parts가 있으면 그 부위에만)
 */
export type DyeTicketSpec = { mode: "random"; tier: 1 | 2 | 3 } | { mode: "fixed"; color: string; parts?: DyePart[] };

/** 고정 색 염색권 아이템 id (관리자가 발급할 때 만든다): "dyefix_" + 영숫자 */
export const FIXED_DYE_ID_RE = /^dyefix_[a-z0-9]{6,16}$/;
export function isFixedDyeId(id: unknown): id is string {
  return typeof id === "string" && FIXED_DYE_ID_RE.test(id);
}
