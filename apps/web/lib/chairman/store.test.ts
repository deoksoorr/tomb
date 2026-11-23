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

// 11/23 끝 Lua가 「이번 주 1위가 바뀌었는지」를 8번째 칸으로 같이 돌려준다 (판마다 왕복은 그대로 한 번)
describe("판 끝 결과 읽기 (Redis 모양)", () => {
  const fin = { acct: "a", nonce: "n", mode: "normal" as const, week: "20261123", day: "20261124", damage: 100, at: 1, durationMs: 60_000, dm: 10, keepBest: true, ranked: true, points: 0 };
  const fake = (reply: unknown) => {
    const s = new RedisChairStore({ url: "https://example.invalid", token: "t" });
    const calls: { script: string; keys: string[]; args: string[] }[] = [];
    const sets: unknown[][] = [];
    (s as unknown as { redis: unknown }).redis = {
      eval: async (script: string, keys: string[], args: string[]) => (calls.push({ script, keys, args }), reply),
      set: async (...a: unknown[]) => (sets.push(a), sets.length === 1 ? "OK" : null),
    };
    return { s, calls, sets };
  };
  it("1이면 overtook, 0·없으면 없다 (숫자 문자열도)", async () => {
    expect(await fake([1, 50, 100, 0, 0, 1, 0, 1]).s.finish(fin)).toMatchObject({ ok: true, weekRank: 1, overtook: true });
    expect(await fake([1, 50, 100, 0, 0, 1, 0, "1"]).s.finish(fin)).toMatchObject({ overtook: true });
    expect(await fake([1, 50, 100, 1, 0, 1, 0, 0]).s.finish(fin)).not.toHaveProperty("overtook");
    // 11/23 2 = 이미 1위인 내가 내 1위 기록을 올렸다 → leadUp (overtook 아님)
    const up = await fake([1, 50, 100, 0, 0, 1, 0, 2]).s.finish(fin);
    expect(up).toMatchObject({ leadUp: true });
    expect(up).not.toHaveProperty("overtook");
    expect(await fake([1, 50, 100, 1, 0, 1, 0]).s.finish(fin)).not.toHaveProperty("overtook");
    expect(await fake([-1]).s.finish(fin)).toEqual({ ok: false });
  });
  it("Lua는 순위에 넣기 전 1위(ZREVRANGE 0 0 + 점수)와 비교한다 · 쉼 표시는 SET NX PX 한 번", async () => {
    const { s, calls, sets } = fake([1, 0, 100, 0, 0, 1, 0, 1]);
    await s.finish(fin);
    expect(calls).toHaveLength(1);
    expect(calls[0].script.indexOf("ZREVRANGE")).toBeLessThan(calls[0].script.indexOf("'ZADD'"));
    expect(calls[0].keys[2]).toBe("chair:w:normal:20261123");
    expect(await s.leadCooldown("hell", 600_000)).toBe(true);
    expect(await s.leadCooldown("hell", 600_000)).toBe(false);
    expect(sets[0]).toEqual(["chair:leadcool:hell", "1", { nx: true, px: 600_000 }]);
  });
});

// 11/24 1위 혜택 자격(chairPerkFor)은 새 읽기 없이 정리 기록 GET 하나 (chairHolders) — 이 클라이언트는 GET을 풀지 않고 JSON 문자열로 준다.
// 2관왕 하루 판 수는 시작 Lua의 ARGV(하루 판 수)로만 바뀐다 — 돌아오는 배열 모양은 그대로
describe("11/24 1위 혜택 (Redis 모양)", () => {
  const rec: ChairSettle = {
    week: "20261123",
    settledAt: 1,
    ranks: { normal: [{ accountId: "duo", name: "d", damage: 9, at: 1, rank: 1 }], hell: [{ accountId: "duo", name: "d", damage: 8, at: 1, rank: 1 }] },
    pay: [],
  };
  it("정리 기록 GET: JSON 문자열 · 풀린 객체 · 없음", async () => {
    for (const reply of [JSON.stringify(rec), rec]) {
      const s = new RedisChairStore({ url: "https://example.invalid", token: "t" });
      (s as unknown as { redis: unknown }).redis = { get: async () => reply };
      expect((await s.getSettle("20261123"))?.ranks.hell[0].accountId).toBe("duo");
    }
    const none = new RedisChairStore({ url: "https://example.invalid", token: "t" });
    (none as unknown as { redis: unknown }).redis = { get: async () => null };
    expect(await none.getSettle("20261123")).toBeNull();
  });
  it("시작: 하루 판 수(2관왕 3)는 ARGV 여섯째, 숫자 문자열 배열 답도 읽는다", async () => {
    const s = new RedisChairStore({ url: "https://example.invalid", token: "t" });
    const argv: string[][] = [];
    (s as unknown as { redis: unknown }).redis = { eval: async (_l: string, _k: string[], a: string[]) => (argv.push(a), ["1", "2", "0", "0"]) };
    expect(await s.start({ acct: "duo", nonce: "n", mode: "normal", practice: false, day: "20261201", ttlMs: 1000, max: 3 })).toEqual({ ok: true, used: { normal: 2, hell: 0 }, refunded: false });
    expect(argv[0][5]).toBe("3");
    (s as unknown as { redis: unknown }).redis = { eval: async () => ["-2", "3", "1"] };
    expect(await s.start({ acct: "duo", nonce: "n", mode: "normal", practice: false, day: "20261201", ttlMs: 1000, max: 3 })).toEqual({ ok: false, why: "no_runs", used: { normal: 3, hell: 1 } });
  });
});
