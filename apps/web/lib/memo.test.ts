import { describe, expect, it, vi } from "vitest";
import { TtlMemo } from "./memo";
import { memoTopFetch } from "./rankMemo";
import { rankWithoutStaff } from "./staffRank";

describe("TtlMemo", () => {
  it("ttl 안에서는 다시 읽지 않고, 지나면 다시 읽는다", async () => {
    const m = new TtlMemo<number>(1_000);
    const load = vi.fn(async () => 7);
    expect(await m.get("k", load, 0)).toBe(7);
    expect(await m.get("k", load, 999)).toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await m.get("k", load, 1_000)).toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("같은 키를 동시에 부르면 한 번만 읽는다", async () => {
    const m = new TtlMemo<number>(1_000);
    let n = 0;
    const load = async () => {
      n++;
      await new Promise((r) => setTimeout(r, 5));
      return n;
    };
    const [a, b] = await Promise.all([m.get("k", load, 0), m.get("k", load, 1)]);
    expect([a, b]).toEqual([1, 1]);
    expect(n).toBe(1);
  });

  it("읽기가 실패하면 기억하지 않는다", async () => {
    const m = new TtlMemo<number>(1_000);
    await expect(m.get("k", async () => Promise.reject(new Error("x")), 0)).rejects.toThrow("x");
    expect(await m.get("k", async () => 3, 1)).toBe(3);
  });

  it("max를 넘으면 오래된 키부터 버린다", async () => {
    const m = new TtlMemo<number>(1_000, 2);
    await m.get("a", async () => 1, 0);
    await m.get("b", async () => 2, 0);
    await m.get("c", async () => 3, 0);
    expect(m.size).toBe(2);
    const load = vi.fn(async () => 9);
    expect(await m.get("a", load, 1)).toBe(9);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("memoTopFetch (랭킹 판 기억)", () => {
  type Row = { accountId: string; rank: number; points: number };
  // 점수 순 판: a 50, b 40, staff 30, c 20, d 10
  const scores: [string, number][] = [
    ["a", 50],
    ["b", 40],
    ["staff", 30],
    ["c", 20],
    ["d", 10],
  ];
  const makeFetch = () => {
    const calls: [number, string | null][] = [];
    const fetch = async (limit: number, me: string | null) => {
      calls.push([limit, me]);
      const rows: Row[] = scores.slice(0, limit).map(([accountId, points], i) => ({ accountId, points, rank: i + 1 }));
      const at = me ? scores.findIndex(([id]) => id === me) : -1;
      return { rows, mine: at >= 0 ? { accountId: me!, points: scores[at][1], rank: at + 1 } : null };
    };
    return { fetch, calls };
  };

  it("기억한 판으로도 운영자를 뺀 순위·내 줄이 매번 읽은 것과 같다", async () => {
    for (const me of [null, "a", "c", "d", "staff", "zz"]) {
      const plain = makeFetch();
      const memoed = makeFetch();
      const store = new TtlMemo<unknown>(30_000);
      const want = await rankWithoutStaff(plain.fetch, 2, me, "staff");
      const got = await rankWithoutStaff(memoTopFetch("t", memoed.fetch, "staff", { style: false, store }), 2, me, "staff");
      expect(got).toEqual(want);
    }
  });

  it("두 번째부터는 상위 줄을 다시 읽지 않고 내 줄만 (운영자 순위도 기억)", async () => {
    const { fetch, calls } = makeFetch();
    const store = new TtlMemo<unknown>(30_000);
    const f = memoTopFetch("t", fetch, "staff", { style: false, store });
    await rankWithoutStaff(f, 2, "d", "staff");
    const first = calls.length;
    await rankWithoutStaff(f, 2, "c", "staff");
    // 상위 3줄·운영자 순위는 기억 → c의 내 줄(limit 1) 한 번만
    expect(calls.slice(first)).toEqual([[1, "c"]]);
    // 상위 안에 있으면 아무것도 읽지 않는다
    await rankWithoutStaff(f, 2, "a", "staff");
    expect(calls.length).toBe(first + 1);
  });
});
