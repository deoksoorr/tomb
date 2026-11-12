import { staffAccountId } from "./staff";

// 운영자 계정은 어떤 순위에도 나오지 않는다. 기록할 때 빼고(사냥·최대어), 읽을 때도 한 번 더 거른다
// (운영자로 지정되기 전에 쌓인 기록·포인트 순위처럼 기록 쪽에서 막지 못한 것 대비)

/** 순위 한 줄: 판마다 모양이 달라도 계정 id와 순위만 있으면 된다 */
type Ranked = { accountId: string; rank: number };
export type RankBoardOf<T extends Ranked> = { rows: T[]; mine: T | null };

/**
 * 운영자를 뺀 순위. fetch(limit, me) = 상위 limit명 + me의 줄을 돌려주는 순위 판.
 *  - 한 명 더 읽어서 운영자를 걸러도 limit명이 찬다
 *  - 운영자보다 아래 줄은 순위를 하나씩 당긴다 (순번이 비지 않게)
 *  - 운영자 본인이 보면 mine = null, staff = true
 * staffId를 주지 않으면 지정된 운영자 계정을 읽는다
 */
export async function rankWithoutStaff<T extends Ranked>(
  fetch: (limit: number, me: string | null) => Promise<RankBoardOf<T>>,
  limit: number,
  me: string | null,
  staffId?: string | null,
): Promise<RankBoardOf<T> & { staff: boolean }> {
  const staff = staffId === undefined ? await staffAccountId() : staffId;
  if (!staff) return { ...(await fetch(limit, me)), staff: false };
  const isMe = me === staff;
  const r = await fetch(limit + 1, isMe ? null : me);
  let staffRank = r.rows.find((x) => x.accountId === staff)?.rank;
  // 내 줄이 읽은 범위 밖이면 운영자가 나보다 위인지 따로 본다 (범위 안에 운영자가 없을 때만)
  const myRow = isMe || !me ? null : (r.rows.find((x) => x.accountId === me) ?? r.mine);
  if (staffRank === undefined && myRow && !r.rows.includes(myRow)) staffRank = (await fetch(1, staff)).mine?.rank ?? undefined;
  const shift = (x: T): T => (staffRank !== undefined && staffRank < x.rank ? { ...x, rank: x.rank - 1 } : x);
  return {
    rows: r.rows.filter((x) => x.accountId !== staff).slice(0, limit).map(shift),
    // 한 명 더 읽은 줄에 내가 있었으면 잘려도 mine으로 남긴다
    mine: myRow ? shift(myRow) : null,
    staff: isMe,
  };
}
