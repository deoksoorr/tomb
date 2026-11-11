import { Redis } from "@upstash/redis";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { dexFromHash, lk, MemoryForageStore, parseGranted, RedisForageStore } from "./store";
import { contract, DAY } from "./store.contract";

// 두 구현이 똑같이 지켜야 하는 동작. RedisForageStore는 실제 Redis(개발용 DB 환경변수가 있을 때만)에서 같은 시나리오를 돌린다.

describe("MemoryForageStore", () => contract(() => new MemoryForageStore()));

const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisForageStore (실제 Redis, 개발용 DB에서만 실행)", () =>
  contract(
    () => new RedisForageStore(redisEnv!),
    async (ids) => {
      const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
      const keys = (await Promise.all(ids.map((id) => raw.keys(`forage:${id}:*`)))).flat() as string[];
      if (keys.length) await raw.del(...keys);
    },
  ),
);

describe("저장 형식 도우미", () => {
  it("dex 해시 → 칸별 기록 (0마리 칸은 빼고)", () => {
    expect(dexFromHash({ "n:f_carp": "2", "max:f_carp": "610", "first:f_carp": DAY, "n:f_koi": "0", junk: "x" })).toEqual({
      f_carp: { n: 2, max: 610, first: DAY },
    });
  });
  it("GRANT_LUA 결과 줄 → 기록, 'taken'이면 null", () => {
    expect(parseGranted("taken", [{ id: "a", size: 0 }])).toBeNull();
    expect(parseGranted(["f_carp:110", "h_x:011"], [{ id: "f_carp", size: 5 }, { id: "h_x", size: 0 }])).toEqual([
      { id: "f_carp", size: 5, kept: true, isNew: true, record: false },
      { id: "h_x", size: 0, kept: false, isNew: true, record: true },
    ]);
  });
  it("키는 모두 계정 접두어 아래", () => {
    expect(Object.values(lk).map((f) => (f as (a: string, b: never) => string)("A", 1 as never))).toSatisfy((ks: string[]) => ks.every((k) => k.startsWith("forage:A:")));
  });
});
