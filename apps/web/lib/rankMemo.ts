import { TtlMemo } from "./memo";
import type { RankBoardOf } from "./staffRank";
import { withNameStyles } from "./nameStyleRank";

// 랭킹 판 기억 (Redis 명령 아끼기): 화면은 늘 `me=1`로 불러 CDN을 못 타서, 판 하나에 상위 51명 이름(51)·닉네임 꾸미기(52)까지
// 요청마다 150개 남짓을 읽었다. 이제 상위 줄(닉네임 꾸미기 포함)은 인스턴스마다 BOARD_MEMO_MS 동안 기억하고, 내 줄만 새로 읽는다 (5개 남짓).
//  - 공개 응답(me 없이)도 CDN에 30초 캐시하므로 판이 길어야 그만큼 늦는 것은 전과 같다 (닉네임 꾸미기도 lib/nameStyleRank 주석대로 30초)
//  - 내가 기억한 상위 줄 안에 있으면 그 줄을 내 줄로 쓴다 (판과 내 줄이 서로 어긋나지 않게)
//  - 운영자 계정의 순위(운영자보다 아래 줄을 한 칸씩 당기는 데만 쓴다)도 같은 시간 기억한다

export const BOARD_MEMO_MS = 30_000;

type Ranked = { accountId: string; rank: number };
type Fetch<T extends Ranked> = (limit: number, me: string | null) => Promise<RankBoardOf<T>>;
type Styled<T> = T & { ns?: string[] };

const g = globalThis as typeof globalThis & { __tombRankMemo?: TtlMemo<unknown> };
const memo = () => (g.__tombRankMemo ??= new TtlMemo<unknown>(BOARD_MEMO_MS, 300));

/**
 * fetch(limit, me) 판을 기억하는 판으로 감싼다 (lib/staffRank rankWithoutStaff에 그대로 넘긴다).
 * key는 판을 가르는 모든 값(판·기간·주·사냥터·물고기)과 운영자 id. 상위 줄에는 닉네임 꾸미기(ns)가 붙어 있다 (style: false면 안 붙인다)
 */
export function memoTopFetch<T extends Ranked>(
  key: string,
  fetch: Fetch<T>,
  staffId: string | null,
  opts: { style?: boolean; store?: TtlMemo<unknown> } = {},
): Fetch<Styled<T>> {
  const store = opts.store ?? memo();
  const style = opts.style ?? true;
  return async (limit, who) => {
    const rows = (await store.get(`${key}|top|${limit}`, async () => {
      const top = (await fetch(limit, null)).rows;
      return style ? withNameStyles(top) : top;
    })) as Styled<T>[];
    if (!who) return { rows, mine: null };
    const hit = rows.find((r) => r.accountId === who);
    if (hit) return { rows, mine: hit };
    // 상위 밖: 내 순위만 (limit 1 = 1등 한 줄 + 내 줄). 운영자 순위는 기억한다
    const mineOf = async () => (await fetch(1, who)).mine;
    const mine = who === staffId ? ((await store.get(`${key}|staff|${who}`, mineOf)) as T | null) : await mineOf();
    return { rows, mine };
  };
}

/** 상위 줄은 이미 꾸미기가 붙어 있다 → 내 줄만 (상위 안에서 온 줄이면 그대로, 아니면 한 명만 읽는다) */
export async function styleMine<T extends { accountId: string }>(rows: readonly Styled<T>[], mine: Styled<T> | null): Promise<Styled<T> | null> {
  if (!mine) return null;
  if (rows.some((r) => r.accountId === mine.accountId)) return mine;
  return (await withNameStyles([mine]))[0] ?? mine;
}
