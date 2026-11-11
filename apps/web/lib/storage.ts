import { LS } from "./types";

// localStorage 접근. 사파리 사생활 보호 모드처럼 저장소를 못 쓰는 환경에서는 조용히 기억하지 않는다.

/** UI 전용 키 (types.ts의 LS와 겹치지 않게 tomb.ui.* 아래에 둔다) */
export const UI_KEYS = {
  cameraHintSeen: "tomb.ui.cameraHintSeen",
  /** 마지막으로 본 공지 id (새 공지 점 표시) */
  noticeSeen: "tomb.ui.noticeSeen",
} as const;

/** 채널별로 마지막에 받은 묘비 목록 (다음 입장 때 바로 그리기) */
export const gravesCacheKey = (channel: number) => `tomb.ui.gravesCache.${channel}`;

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function removeItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
}

export function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장할 수 없으면 다음 방문에 기억하지 못할 뿐이다
  }
}

type OwnerTokens = Record<string, string>;

function readOwnerTokens(): OwnerTokens {
  try {
    const parsed: unknown = JSON.parse(readItem(LS.ownerTokens) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as OwnerTokens) : {};
  } catch {
    return {};
  }
}

/** 이 브라우저에서 세운 묘비의 관리 토큰 */
export function getOwnerToken(graveId: string): string | null {
  const token = readOwnerTokens()[graveId];
  return typeof token === "string" ? token : null;
}

export function saveOwnerToken(graveId: string, token: string): void {
  writeItem(LS.ownerTokens, JSON.stringify({ ...readOwnerTokens(), [graveId]: token }));
}

export function forgetOwnerToken(graveId: string): void {
  const tokens = readOwnerTokens();
  delete tokens[graveId];
  writeItem(LS.ownerTokens, JSON.stringify(tokens));
}

// ── 개인 코드 (이 기기 저장본) ──
// 서버는 코드를 해시로만 들고 있어 다시 보여 줄 수 없다. 이 기기에서 발급받았거나 코드로 들어온 경우에만
// 원문을 계정 id와 함께 남겨 두고 내 정보에서 다시 보여 준다. 로그아웃하면 지운다.

export const MY_CODE_KEY = "tomb.myCode";

/** 이 기기에 남겨 둔 그 계정의 개인 코드 (다른 계정 것이거나 형식이 틀리면 null) */
export function readMyCode(accountId: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readItem(MY_CODE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return null;
    const { accountId: owner, code } = parsed as Record<string, unknown>;
    return owner === accountId && typeof code === "string" && code ? code : null;
  } catch {
    return null;
  }
}

export function saveMyCode(accountId: string, code: string): void {
  writeItem(MY_CODE_KEY, JSON.stringify({ accountId, code }));
}

export function forgetMyCode(): void {
  removeItem(MY_CODE_KEY);
}
