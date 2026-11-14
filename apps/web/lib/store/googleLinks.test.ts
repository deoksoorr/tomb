import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { env } from "../env";
import { LINK_LUA, MemoryGoogleLinks, RedisGoogleLinks, UNLINK_LUA, type GoogleLinkRedis, type GoogleLinkStore } from "./googleLinks";
import { K } from "./keys";

// 구글 연결 저장소 계약: 메모리는 늘, Redis 구현은 ① Upstash 원본 응답을 흉내 낸 가짜 클라이언트로 늘 ② 개발용 DB가 있을 때만 실제로
// (운영·테스트 서버 Redis에서는 돌리지 않는다)

/**
 * Upstash(automaticDeserialization: false) 응답 모양 그대로 돌려주는 가짜: HMGET은 필드 순서 배열, 값은 문자열, Lua 결과는 그대로.
 * Lua는 두 스크립트를 같은 뜻의 JS로 한 번에(중간에 끼어들 수 없게) 돌린다
 */
function fakeUpstash(): GoogleLinkRedis {
  const str = new Map<string, string>();
  const hash = new Map<string, Map<string, string>>();
  const hget = (k: string, f: string) => hash.get(k)?.get(f) ?? null;
  const client = {
    async get(k: string) {
      return str.get(k) ?? null;
    },
    async hget(k: string, f: string) {
      return hget(k, f);
    },
    async hmget(k: string, ...fields: string[]) {
      const vals = fields.map((f) => hget(k, f));
      return vals.every((v) => v === null) ? null : vals;
    },
    async eval(script: string, keys: string[], args: string[]) {
      if (script === LINK_LUA) {
        const owner = str.get(keys[0]);
        if (owner && owner !== args[0]) return "taken";
        const cur = hget(keys[1], "h");
        if (cur && cur !== args[1]) return "other";
        if (owner && cur) return "same";
        str.set(keys[0], args[0]);
        hash.set(keys[1], new Map([["h", args[1]], ["at", String(args[2])]]));
        return "ok";
      }
      if (script === UNLINK_LUA) {
        const cur = hget(keys[0], "h");
        if (!cur) return 0;
        if (cur !== args[0]) return -1;
        if (str.get(keys[1]) === args[1]) str.delete(keys[1]);
        hash.delete(keys[0]);
        return 1;
      }
      throw new Error("모르는 스크립트");
    },
  };
  return client as unknown as GoogleLinkRedis;
}

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

describe("RedisGoogleLinks (Upstash 응답 흉내)", () => {
  contract(() => ({ store: new RedisGoogleLinks({ client: fakeUpstash() }), async cleanup() {} }));

  it("HMGET이 배열로 와도 연결 상태를 읽는다 (테스트 서버에서 '연결됨'이 안 보이던 원인)", async () => {
    const store = new RedisGoogleLinks({ client: fakeUpstash() });
    const g = "a".repeat(64);
    expect(await store.link("acct-1", g, 1234)).toBe("ok");
    expect(await store.linkOf("acct-1")).toEqual({ subHash: g, at: 1234 });
    expect(await store.linkOf("acct-2")).toBeNull();
  });
});

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
