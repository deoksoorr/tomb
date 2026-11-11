import type { PublicGrave } from "@/lib/types";

// 서버 목록(CDN에 30초 캐시)과 이 브라우저가 방금 알게 된 변경(내 등록·수정·삭제, 낙관적 카운트, 상세 재조회)을 합친다.

/** grave=null 이면 삭제됨 */
export type Override = { grave: PublicGrave | null; at: number };
export type Overrides = Readonly<Record<string, Override>>;

/** 서버 목록이 내 변경 이후에 만들어졌다고 믿을 여유 (서버-브라우저 시계 차이) */
export const OVERRIDE_SKEW_MS = 60_000;
/** 목록이 끝내 따라오지 않아도 이만큼 지나면 버린다 (s-maxage 30초 + stale-while-revalidate 300초보다 길게) */
export const OVERRIDE_TTL_MS = 10 * 60_000;

export function pruneOverrides(overrides: Overrides, generatedAt: number, now: number): Overrides {
  const kept: Record<string, Override> = {};
  for (const [id, o] of Object.entries(overrides)) {
    const listCaughtUp = generatedAt > o.at + OVERRIDE_SKEW_MS;
    if (!listCaughtUp && now - o.at < OVERRIDE_TTL_MS) kept[id] = o;
  }
  return kept;
}

/** 등록 순(오래된 것 먼저) = 격자 배치 순서 */
export function mergeGraves(list: readonly PublicGrave[], overrides: Overrides): PublicGrave[] {
  const out: PublicGrave[] = [];
  const seen = new Set<string>();
  for (const g of list) {
    seen.add(g.id);
    const o = overrides[g.id];
    if (!o) out.push(g);
    else if (o.grave) out.push(o.grave);
  }
  for (const [id, o] of Object.entries(overrides)) {
    if (o.grave && !seen.has(id)) out.push(o.grave);
  }
  return out.sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
