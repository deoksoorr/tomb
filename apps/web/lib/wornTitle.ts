// 11/16 단 칭호 기억 (칭호 능력용 — 인스턴스 메모리). 의존성이 없는 작은 모듈이라 lib/store/accounts(loadMe)와
// lib/titlesServer가 순환 없이 함께 쓴다.
//  - loadMe·칭호 확인처럼 이미 착용 목록을 읽은 흐름이 여기에 적어 두고(rememberWornTitle), 낚시·채집·사냥처럼 계정을 읽지 않는 흐름은
//    여기서 꺼내 쓴다 → 요청마다 Redis 명령이 늘지 않는다. 기억이 없을 때만 lib/titlesServer wornTitle이 HGET 1번으로 채운다
//  - 칭호를 달거나 빼면 forgetTitles가 지우고 바로 loadMe가 새 칭호로 다시 적는다. 다른 인스턴스는 길어야 WORN_TTL_MS 늦게 바뀐다
//    (그동안은 이미 얻었던 칭호의 능력이라 이득이 생기지 않는다)

import { titleOfLook } from "@tomb/protocol";

/** 단 칭호를 기억하는 시간 */
export const WORN_TTL_MS = 30 * 60_000;
const MAX_KEEP = 5000;

const g = globalThis as typeof globalThis & { __tombWornTitle?: Map<string, { at: number; id: string | null }> };
const memo = () => (g.__tombWornTitle ??= new Map());

/** 이미 읽은 착용 목록에서 단 칭호를 적어 둔다 */
export function rememberWornTitle(accountId: string, look: readonly string[] | null | undefined, now = Date.now()): void {
  const m = memo();
  m.set(accountId, { at: now, id: titleOfLook(look) });
  // 오래된 기억 정리 (인스턴스 메모리가 끝없이 늘지 않게)
  if (m.size > MAX_KEEP) for (const [k, v] of m) if (now - v.at >= WORN_TTL_MS) m.delete(k);
}

/** 기억한 단 칭호 (칭호 없음 = null, 기억이 없거나 오래됐으면 undefined) */
export function recallWornTitle(accountId: string, now = Date.now()): string | null | undefined {
  const hit = memo().get(accountId);
  return hit && now - hit.at < WORN_TTL_MS ? hit.id : undefined;
}

/** 기억을 지운다 (칭호 달기·빼기 — lib/titlesServer forgetTitles, 시험) */
export function forgetWornTitle(accountId?: string): void {
  if (accountId) memo().delete(accountId);
  else memo().clear();
}
