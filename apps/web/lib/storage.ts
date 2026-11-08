import { LS } from "./types";

// localStorage 접근. 사파리 사생활 보호 모드처럼 저장소를 못 쓰는 환경에서는 조용히 기억하지 않는다.

/** UI 전용 키 (types.ts의 LS와 겹치지 않게 tomb.ui.* 아래에 둔다) */
export const UI_KEYS = {
  cameraHintSeen: "tomb.ui.cameraHintSeen",
  /** 마지막으로 받은 묘비 목록 (다음 입장 때 바로 그리기) */
  gravesCache: "tomb.ui.gravesCache",
} as const;

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
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
