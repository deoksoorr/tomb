import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { MemoryGoogleLinks, RedisGoogleLinks, type GoogleLinkStore } from "./googleLinks";
import { K } from "./keys";

// 구글 연결 저장소 계약: 메모리는 늘, Redis는 개발용 DB가 있을 때만 (운영·테스트 서버 Redis에서는 돌리지 않는다)

function contract(make: () => { store: GoogleLinkStore; cleanup(ids: string[], hashes: string[]): Promise<void> }) {
  const id = () => `t-${nanoid(10)}`;
  const hash = () => nanoid(32).toLowerCase().replace(/[^0-9a-f]/g, "a").padEnd(64, "0");

  it("연결 → 같은 것 다시 → 다른 계정은 거절 → 이 계정에 다른 구글도 거절 → 끊기", async () => {
    const { store, cleanup } = make();
    const [a, b] = [id(), id()];
    const [g1, g2] = [hash(), hash()];
    try {
      expect(await store.accountOf(g1)).toBeNull();
      expect(await store.linkOf(a)).toBeNull();
      expect(await store.link(a, g1, 1000)).toBe("ok");
      expect(await store.accountOf(g1)).toBe(a);
      expect(await store.linkOf(a)).toEqual({ subHash: g1, at: 1000 });
      expect(await store.link(a, g1, 2000)).toBe("same");
      expect((await store.linkOf(a))?.at).toBe(1000);
      expect(await store.link(b, g1, 2000)).toBe("taken");
      expect(await store.link(a, g2, 2000)).toBe("other");
      expect(await store.accountOf(g2)).toBeNull();
      expect(await store.linkOf(b)).toBeNull();

      expect(await store.unlink(a)).toBe(true);
      expect(await store.unlink(a)).toBe(false);
      expect(await store.accountOf(g1)).toBeNull();
      expect(await store.linkOf(a)).toBeNull();
      // 끊은 구글은 다른 계정이 연결할 수 있다
      expect(await store.link(b, g1, 3000)).toBe("ok");
      expect(await store.accountOf(g1)).toBe(b);
    } finally {
      await cleanup([a, b], [g1, g2]);
    }
  });

  it("두 계정이 동시에 같은 구글을 잡아도 하나만 연결된다 (원자 처리)", async () => {
    const { store, cleanup } = make();
    const ids = Array.from({ length: 6 }, id);
    const g = hash();
    try {
      const results = await Promise.all(ids.map((x) => store.link(x, g, 1000)));
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(results.filter((r) => r === "taken")).toHaveLength(5);
      const owner = ids[results.indexOf("ok")];
      expect(await store.accountOf(g)).toBe(owner);
      for (const x of ids) expect((await store.linkOf(x))?.subHash ?? null).toBe(x === owner ? g : null);
    } finally {
      await cleanup(ids, [g]);
    }
  });

  it("한 계정이 동시에 다른 구글 둘을 잡아도 하나만", async () => {
    const { store, cleanup } = make();
    const a = id();
    const [g1, g2] = [hash(), hash()];
    try {
      const results = await Promise.all([store.link(a, g1, 1), store.link(a, g2, 1)]);
      expect(results.sort()).toEqual(["ok", "other"]);
      const kept = (await store.linkOf(a))!.subHash;
      expect(await store.accountOf(kept)).toBe(a);
      expect(await store.accountOf(kept === g1 ? g2 : g1)).toBeNull();
    } finally {
      await cleanup([a], [g1, g2]);
    }
  });
}

describe("MemoryGoogleLinks", () =>
  contract(() => ({
    store: new MemoryGoogleLinks(),
    async cleanup() {},
  })));

const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisGoogleLinks (실제 Redis, 개발용 DB에서만)", () =>
  contract(() => {
    const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
    return {
      store: new RedisGoogleLinks(redisEnv!),
      async cleanup(ids, hashes) {
        await raw.del(...ids.map(K.googleAcct), ...hashes.map(K.googleSub));
      },
    };
  }));
