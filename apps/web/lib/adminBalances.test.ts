import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { balanceStats, bucketsOf, medianOf, resetBalancesCache } from "./adminBalances";
import { WALLET_MAX } from "./economy";
import { setStaff } from "./staff";
import { MemoryAccounts } from "./store/accounts-memory";
import { DORMANT_MS } from "./store/types";

// 관리자 경제 탭 포인트 잔액: 운영자 빼기, 합계·평균·중앙값·구간, 잔액 순 목록·검색, 기억해 둔 결과 다시 쓰기

beforeAll(() => {
  for (const k of ["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]) vi.stubEnv(k, "");
});
beforeEach(() => resetBalancesCache());
afterEach(async () => {
  resetBalancesCache();
  await setStaff(null);
});

const NOW = Date.UTC(2026, 10, 20, 3);

async function store(rows: [id: string, name: string, points: number, seenAt?: number][]) {
  const s = new MemoryAccounts(() => null as never);
  for (const [id, name, points, seenAt] of rows) {
    await s.claimName(id, name, seenAt ?? NOW);
    await s.visit(id, seenAt ?? NOW, true);
    await s.adjustPoints(id, points);
  }
  return s;
}

describe("중앙값·구간", () => {
  it("잔액 많은 순 목록의 중앙값 (짝수면 가운데 둘 평균)", () => {
    expect(medianOf([])).toBe(0);
    expect(medianOf([9, 5, 1])).toBe(5);
    expect(medianOf([10, 6, 3, 1])).toBe(5);
    expect(medianOf([10, 5, 2, 1])).toBe(4); // 3.5 → 4
  });

  it("구간은 아래 끝 포함, 위 끝 미포함", () => {
    const b = bucketsOf([0, 999, 1_000, 4_999, 5_000, 10_000, 29_999, 30_000, 100_000, 5_000_000]);
    expect(b.map((x) => x.count)).toEqual([2, 2, 1, 2, 1, 2]);
    expect(b[5]).toMatchObject({ label: "10만 이상", sum: 5_100_000 });
  });
});

describe("잔액 보기 (balanceStats)", () => {
  it("운영자(지금 운영자 + 지갑이 상한까지 찬 계정)는 빼고, 합계·평균·중앙값·순위", async () => {
    const s = await store([
      ["a", "가나다", 12_000],
      ["b", "라마바", 3_000],
      ["c", "사아자", 0],
      ["op", "운영자님", 500],
      ["old", "옛운영", WALLET_MAX],
    ]);
    await setStaff("op", NOW);
    const r = await balanceStats({ accounts: s, now: NOW });
    expect(r.staffExcluded).toBe(2);
    expect(r).toMatchObject({ scope: "all", accounts: 3, sum: 15_000, avg: 5_000, median: 3_000, zero: 1 });
    expect(r.rows.map((x) => [x.name, x.rank, x.points])).toEqual([
      ["가나다", 1, 12_000],
      ["라마바", 2, 3_000],
      ["사아자", 3, 0],
    ]);
    expect(r.rows[0]).not.toHaveProperty("email");
  });

  it("활동 중만 보면 휴면은 빠지고, 전체에는 휴면 수와 잔액을 알려 준다. 검색은 순위를 그대로 둔다", async () => {
    const s = await store([
      ["a", "가나다", 100],
      ["z", "잠든이", 9_000, NOW - DORMANT_MS - 86_400_000],
      ["b", "가나라", 50],
    ]);
    const all = await balanceStats({ accounts: s, now: NOW });
    expect(all.accounts).toBe(3);
    expect(all.dormant).toEqual({ accounts: 1, sum: 9_000 });
    expect(all.rows[0]).toMatchObject({ name: "잠든이", status: "dormant" });

    const active = await balanceStats({ accounts: s, now: NOW, scope: "active" });
    expect(active).toMatchObject({ accounts: 2, sum: 150 });

    const found = await balanceStats({ accounts: s, now: NOW, q: "가나" });
    expect(found.matched).toBe(2);
    expect(found.rows.map((x) => [x.name, x.rank])).toEqual([
      ["가나다", 2],
      ["가나라", 3],
    ]);
  });

  it("기억해 둔 결과를 다시 쓰고, fresh는 짧은 간격 뒤에만 다시 훑는다", async () => {
    const s = await store([["a", "가나다", 100]]);
    const scan = vi.spyOn(s, "scanIds");
    await balanceStats({ accounts: s, now: NOW });
    const calls = scan.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await s.adjustPoints("a", 50);
    // 범위·검색을 바꿔도 다시 훑지 않는다
    expect((await balanceStats({ accounts: s, now: NOW + 60_000, scope: "active", q: "가" })).sum).toBe(100);
    expect(scan.mock.calls.length).toBe(calls);
    // fresh면 다시 훑는다
    expect((await balanceStats({ accounts: s, now: NOW + 60_000, fresh: true })).sum).toBe(150);
    expect(scan.mock.calls.length).toBeGreaterThan(calls);
  });
});
