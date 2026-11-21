import { describe, expect, it } from "vitest";
import { hmgetList, MemoryChairStore, RedisChairStore, settleOf, type ChairSettle } from "./store";

// 11/21 테스트서버에서 잡은 것: redisClient는 HMGET을 이름 없는 배열로 준다 (입장 창 남은 판·최고·순위 시간이 비던 원인)
describe("HMGET 결과 읽기", () => {
  it("배열로 오면 필드 순서대로", () => {
    expect(hmgetList(["20261121", "2", null], ["d", "cn", "ch"])).toEqual(["20261121", "2", null]);
  });
  it("이름 붙은 객체로 와도 같은 결과", () => {
    expect(hmgetList({ d: "20261121", cn: 2, ch: null }, ["d", "cn", "ch"])).toEqual(["20261121", "2", null]);
  });
  it("없으면 모두 null", () => {
    expect(hmgetList(null, ["a", "b"])).toEqual([null, null]);
  });
});

// 11/22 명예의 전당 색인 (chair:weeks) — 이 클라이언트는 ZRANGE·MGET을 풀지 않고 문자열 배열로 준다
describe("명예의 전당 (Redis 모양)", () => {
  const rec = (week: string, name: string): ChairSettle => ({
    week,
    settledAt: 1,
    ranks: { normal: [{ accountId: `a${week}`, name, damage: 100, at: 1, rank: 1, ms: 70_000 }], hell: [] },
    pay: [],
  });
  const fake = (weeks: unknown[], raws: unknown[]) => {
    const s = new RedisChairStore({ url: "https://example.invalid", token: "t" });
    const calls: string[] = [];
    (s as unknown as { redis: unknown }).redis = {
      zrange: async (key: string, a: number, b: number, o: unknown) => (calls.push(`zrange ${key} ${a} ${b} ${JSON.stringify(o)}`), weeks),
      mget: async (...keys: string[]) => (calls.push(`mget ${keys.join(",")}`), raws),
      set: async () => (calls.push("set"), "OK"),
      zadd: async (key: string, m: unknown) => (calls.push(`zadd ${key} ${JSON.stringify(m)}`), 1),
    };
    return { s, calls };
  };

  it("주 문자열 배열 + JSON 문자열 배열 → 최근 주부터 (망가진 칸·빈 칸은 건너뛴다)", async () => {
    const { s, calls } = fake(["20261130", "20261123", "20261116"], [JSON.stringify(rec("20261130", "b")), null, "{oops"]);
    expect((await s.hall(52)).map((r) => [r.week, r.ranks.normal[0].name])).toEqual([["20261130", "b"]]);
    expect(calls).toEqual(['zrange chair:weeks 0 51 {"rev":true}', "mget chair:settle:20261130,chair:settle:20261123,chair:settle:20261116"]);
  });

  it("숫자로 온 주 · 이미 풀린 객체도 읽는다, 비면 MGET 없이 []", async () => {
    const { s } = fake([20261123], [rec("20261123", "a")]);
    expect((await s.hall(5)).map((r) => r.week)).toEqual(["20261123"]);
    const empty = fake([], []);
    expect(await empty.s.hall(5)).toEqual([]);
    expect(empty.calls).toHaveLength(1);
  });

  it("정리 기록을 만들면 색인에도 (처음이 아니어도 — 같은 주는 하나)", async () => {
    const { s, calls } = fake([], []);
    await s.createSettle(rec("20261123", "a"));
    expect(calls).toEqual(["set", 'zadd chair:weeks {"score":20261123,"member":"20261123"}']);
  });

  it("settleOf: 문자열·객체·망가진 값", () => {
    expect(settleOf(JSON.stringify(rec("20261123", "a")))?.week).toBe("20261123");
    expect(settleOf(rec("20261130", "b"))?.week).toBe("20261130");
    expect(settleOf("nope")).toBeNull();
    expect(settleOf(null)).toBeNull();
    expect(settleOf({ week: 1 })).toBeNull();
  });
});

describe("명예의 전당 (메모리)", () => {
  it("최근 주부터 limit개", async () => {
    const m = new MemoryChairStore(() => ({}) as never);
    for (const w of ["20261123", "20261207", "20261130"]) await m.createSettle({ week: w, settledAt: 1, ranks: { normal: [], hell: [] }, pay: [] });
    expect((await m.hall(2)).map((r) => r.week)).toEqual(["20261207", "20261130"]);
    expect(await m.hall(0)).toEqual([]);
  });
});
