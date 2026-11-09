import { describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { env } from "../env";
import { errorHash } from "../errors";
import { MemoryErrors, RedisErrors, type ErrorSample, type ErrorStore } from "./errors";

const sample = (message: string, stack?: string): ErrorSample => ({ kind: "error", source: "client", message, stack, url: "/" });

function contract(make: () => ErrorStore) {
  const store = make();
  it("같은 해시는 한 묶음: 횟수·마지막 시각, 샘플은 처음 것 하나", async () => {
    const day = `t${nanoid(7)}`;
    const a = sample("x is undefined", "at f\nat g\nat h1");
    const h = errorHash(a);
    expect(errorHash(sample("x is undefined", "at f\nat g\nat other"))).toBe(h); // 스택 셋째 줄부터는 무시
    expect(errorHash(sample("y is undefined", "at f\nat g"))).not.toBe(h);
    await store.record(day, h, a, 1000);
    await store.record(day, h, { ...a, url: "/second" }, 3000);
    await store.record(day, "other", sample("다른 오류"), 2000);
    const groups = await store.day(day);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.hash === h)).toMatchObject({ count: 2, lastAt: 3000, url: "/", message: "x is undefined" });
    expect(await store.day(`t${nanoid(7)}`)).toEqual([]);
  });
}

describe("MemoryErrors", () => contract(() => new MemoryErrors()));
const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisErrors (실제 Redis)", () => contract(() => new RedisErrors(redisEnv!)));
