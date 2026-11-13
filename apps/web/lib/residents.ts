// 돌아다니는 마을 주민 설정 (관리자 화면에서 켜기/끄기·주민 수). 서버 저장소(lib/store/residents)와 게임(Residents.ts)이 같이 쓴다.

/** 주민 수 상한 (game/world/life/residentData RESIDENTS 길이) */
export const RESIDENTS_MAX = 15;

export type ResidentSettings = { enabled: boolean; count: number };

/** 기본값: 켜기 · 12명 */
export const RESIDENTS_DEFAULT: ResidentSettings = { enabled: true, count: 12 };

/** 저장소·응답에서 읽은 값을 안전한 설정으로 (모르는 값은 기본값, 수는 0~15 정수) */
export function normalizeResidentSettings(raw: unknown): ResidentSettings {
  if (!raw || typeof raw !== "object") return { ...RESIDENTS_DEFAULT };
  const o = raw as { enabled?: unknown; count?: unknown };
  const enabled = typeof o.enabled === "boolean" ? o.enabled : RESIDENTS_DEFAULT.enabled;
  const n = typeof o.count === "number" && Number.isFinite(o.count) ? Math.round(o.count) : RESIDENTS_DEFAULT.count;
  return { enabled, count: Math.max(0, Math.min(RESIDENTS_MAX, n)) };
}

/** 지금 화면에 나올 주민 수 (꺼져 있으면 0) */
export function activeResidentCount(s: ResidentSettings): number {
  return s.enabled ? s.count : 0;
}
