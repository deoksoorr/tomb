import { getAccounts } from "./store";
import { getLookRankStore, type LookRankStore } from "./store/lookRank";

// 랭킹 줄의 닉네임 꾸미기 (이름 글자 색·이름표): 그 줄 계정이 지금 착용한 것만 (만료 전).
// 랭킹 응답은 CDN에 30초 캐시되므로 꾸미기를 바꾸면 길어야 그만큼 늦게 보인다. 읽기에 실패해도 랭킹은 그대로 낸다 (그냥 이름).

/** rows 순서 그대로 ns(닉네임 꾸미기 id)를 붙여 돌려준다 (계정 id는 붙이지도 빼지도 않는다) */
export async function withNameStyles<T extends { accountId: string }>(rows: readonly T[], now = Date.now(), store?: LookRankStore): Promise<(T & { ns?: string[] })[]> {
  const ids = [...new Set(rows.map((r) => r.accountId))];
  if (!ids.length) return [...rows];
  try {
    const styles = await (store ?? getLookRankStore(getAccounts())).nameStyles(ids, now);
    return rows.map((r) => {
      const ns = styles.get(r.accountId);
      return ns ? { ...r, ns } : r;
    });
  } catch (e) {
    console.warn("[nameStyleRank] 읽기 실패", e);
    return [...rows];
  }
}

/** 판(rows)과 내 줄(mine)을 한 번에 (읽기 한 번) */
export async function boardWithNameStyles<T extends { accountId: string }>(rows: readonly T[], mine: T | null, now = Date.now(), store?: LookRankStore): Promise<{ rows: (T & { ns?: string[] })[]; mine: (T & { ns?: string[] }) | null }> {
  const all = await withNameStyles(mine ? [...rows, mine] : rows, now, store);
  return { rows: all.slice(0, rows.length), mine: mine ? all[rows.length] : null };
}
