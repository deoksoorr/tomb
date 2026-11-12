import { env } from "./env";

// 개발용 시계 (10번 출석 달력의 "1시간 머묾" 조건을 실제로 1시간 기다리지 않고 확인하려고).
// 방문자마다 따로 앞당긴다 → 같은 개발 서버를 쓰는 다른 사람·테스트의 시간은 그대로다. 운영에서는 항상 0.

const g = globalThis as typeof globalThis & { __tombDevClock?: Map<string, number> };

/** 그 방문자의 서버 시각 (운영 = Date.now()) */
export function serverNow(visitorId: string): number {
  if (env.isProd()) return Date.now();
  return Date.now() + (g.__tombDevClock?.get(visitorId) ?? 0);
}

/** 개발 전용: 그 방문자의 시계를 ms만큼 앞당긴다 (되돌리지 않는다). 새 차이를 돌려준다 */
export function advanceDevClock(visitorId: string, ms: number): number {
  if (env.isProd()) throw new Error("[devClock] 운영에서는 시계를 바꿀 수 없어요");
  const m = (g.__tombDevClock ??= new Map());
  const next = (m.get(visitorId) ?? 0) + Math.max(0, ms);
  m.set(visitorId, next);
  return next;
}
