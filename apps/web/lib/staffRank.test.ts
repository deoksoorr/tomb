import { describe, expect, it } from "vitest";
import { MemoryAccounts } from "./store/accounts-memory";
import { rankWithoutStaff } from "./staffRank";

// 운영자는 어느 순위에도 나오지 않는다: 이미 들어가 있는 기록도 읽을 때 거르고 순번을 다시 매긴다

const W = "20261109";

/** 처치 수 순위 판 (운영자로 지정되기 전에 쌓인 기록 포함) */
async function killsBoard(kills: Record<string, number>) {
  const s = new MemoryAccounts(() => null as never);
  for (const [id, k] of Object.entries(kills)) await s.recordHunt(id, "easy", { kills: k, clearMs: null }, W);
  return (limit: number, me: string | null) => s.huntRank("kills", limit, me, {});
}

const ranks = (rows: { accountId: string; rank: number }[]) => rows.map((r) => [r.accountId, r.rank]);

describe("운영자 빼고 순위 매기기", () => {
  it("기존 기록의 운영자를 거르고, 상위 N명이 차고, 순번이 비지 않는다", async () => {
    const fetch = await killsBoard({ a: 50, op: 40, b: 30, c: 20, d: 10 });
    const r = await rankWithoutStaff(fetch, 3, null, "op");
    expect(ranks(r.rows)).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(r.mine).toBeNull();
    expect(r.staff).toBe(false);
  });

  it("내 순위: 운영자가 나보다 위면 하나 당긴다 (운영자가 읽은 범위 안·밖 모두)", async () => {
    const fetch = await killsBoard({ a: 50, op: 40, b: 30, c: 20, d: 10 });
    expect((await rankWithoutStaff(fetch, 2, "d", "op")).mine).toMatchObject({ accountId: "d", rank: 4 });
    // 한 명 더 읽은 줄(3번째)에 내가 있으면 rows에서 잘려도 mine으로 남는다
    expect((await rankWithoutStaff(fetch, 1, "b", "op")).mine).toMatchObject({ accountId: "b", rank: 2 });
    // 운영자가 읽은 범위 밖(5위)이고 나는 더 아래(6위)
    const far = await killsBoard({ a: 50, b: 40, c: 30, d: 20, op: 15, e: 5 });
    const r = await rankWithoutStaff(far, 2, "e", "op");
    expect(ranks(r.rows)).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(r.mine).toMatchObject({ accountId: "e", rank: 5 });
    // 운영자가 나보다 아래면 그대로
    expect((await rankWithoutStaff(far, 2, "d", "op")).mine).toMatchObject({ accountId: "d", rank: 4 });
  });

  it("운영자 본인이 보면 내 순위 대신 staff 표시, 목록에는 없다", async () => {
    const fetch = await killsBoard({ op: 99, a: 50, b: 30 });
    const r = await rankWithoutStaff(fetch, 2, "op", "op");
    expect(r).toMatchObject({ mine: null, staff: true });
    expect(ranks(r.rows)).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("운영자가 없으면 판을 그대로 돌려준다", async () => {
    const fetch = await killsBoard({ a: 50, b: 30 });
    const r = await rankWithoutStaff(fetch, 5, "b", null);
    expect(ranks(r.rows)).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(r.mine).toMatchObject({ accountId: "b", rank: 2 });
  });
});
