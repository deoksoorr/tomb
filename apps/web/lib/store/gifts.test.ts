import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { BALANCE_CAP } from "../economy";
import { env } from "../env";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { MemoryGifts, RedisGifts, GIFT_KEEP_MS, type GiftRecord, type GiftStore } from "./gifts";
import { K } from "./keys";
import { MemoryStore } from "./memory";
import { MemoryMegaphone, RedisMegaphone, type MegaphoneStore } from "./megaphone";
import type { AccountStore } from "./types";

// 11번 선물함·23번 확성기 저장소 계약 (RedisGifts/RedisMegaphone은 Redis 환경변수가 있을 때 같은 시나리오)

const T0 = 1_800_000_000_000;
const gift = (over: Partial<GiftRecord>): GiftRecord => ({
  id: `g-${nanoid(8)}`,
  from: "마을 관리인",
  note: "선물",
  points: 0,
  items: [],
  createdAt: T0,
  expiresAt: T0 + GIFT_KEEP_MS,
  target: "all",
  targetName: null,
  ...over,
});

function giftContract(make: () => { gifts: GiftStore; accounts: AccountStore; cleanup(ids: string[], giftIds: string[]): Promise<void> }) {
  it("전체 선물: 보낸 시각 이전 계정만, 한 번만 받고(포인트·아이템 반영), 지우면 다시 못 받고, 만료되면 사라진다", async () => {
    const { gifts, accounts, cleanup } = make();
    const [old, fresh] = [`t-${nanoid(10)}`, `t-${nanoid(10)}`];
    const g = gift({ points: 70, items: [{ itemId: "fw_small", count: 2 }] });
    try {
      await gifts.send(g);
      expect((await gifts.inbox(old, T0 - 1, T0 + 1)).map((x) => x.id)).toContain(g.id);
      expect((await gifts.inbox(fresh, T0 + 1, T0 + 1)).map((x) => x.id)).not.toContain(g.id);
      expect((await gifts.inbox(old, 0, T0 + 1)).map((x) => x.id)).not.toContain(g.id); // 처음 들어온 시각을 모르면 대상 아님
      expect(await gifts.claim(fresh, g.id, T0 + 1, T0 + 2)).toEqual({ ok: false, reason: "gone" });

      const results = await Promise.all([gifts.claim(old, g.id, T0 - 1, T0 + 5), gifts.claim(old, g.id, T0 - 1, T0 + 5)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.find((r) => !r.ok)).toEqual({ ok: false, reason: "done" });
      const a = await accounts.get(old, "20261112", T0);
      expect(a.points).toBe(70);
      expect(a.lifetimePoints).toBe(70);
      expect(a.inventory.fw_small).toBe(2);
      expect((await gifts.inbox(old, T0 - 1, T0 + 6)).find((x) => x.id === g.id)?.claimedAt).toBe(T0 + 5);
      expect((await gifts.log(50)).find((x) => x.id === g.id)?.claims).toBe(1);

      expect(await gifts.remove(old, g.id, T0 - 1, T0 + 7)).toBe(true);
      expect(await gifts.remove(old, g.id, T0 - 1, T0 + 7)).toBe(false);
      expect((await gifts.inbox(old, T0 - 1, T0 + 8)).map((x) => x.id)).not.toContain(g.id);

      // 안 받은 채 지우면 버려진다
      const g2 = gift({ points: 5 });
      await gifts.send(g2);
      expect(await gifts.remove(old, g2.id, T0 - 1, T0 + 9)).toBe(true);
      expect(await gifts.claim(old, g2.id, T0 - 1, T0 + 10)).toEqual({ ok: false, reason: "done" });
      // 만료
      expect((await gifts.inbox(fresh, T0 - 10, T0 + GIFT_KEEP_MS + 1)).map((x) => x.id)).not.toContain(g.id);
      await cleanup([old, fresh], [g.id, g2.id]);
    } catch (e) {
      await cleanup([old, fresh], [g.id]);
      throw e;
    }
  });

  it("특정 계정 선물은 그 계정만, 지갑 상한에서 잘린다", async () => {
    const { gifts, accounts, cleanup } = make();
    const [me, other] = [`t-${nanoid(10)}`, `t-${nanoid(10)}`];
    const g = gift({ target: me, targetName: "받는이", points: BALANCE_CAP, items: [{ itemId: "mega_ch", count: 1 }] });
    await gifts.send(g);
    await accounts.earn(me, "flower", "20261112");
    expect((await gifts.inbox(other, T0 - 1, T0 + 1)).map((x) => x.id)).not.toContain(g.id);
    expect(await gifts.claim(other, g.id, T0 - 1, T0 + 1)).toEqual({ ok: false, reason: "gone" });
    const r = await gifts.claim(me, g.id, T0 + 100, T0 + 1); // 특정 계정 선물은 처음 들어온 시각과 상관없다
    expect(r).toMatchObject({ ok: true, points: BALANCE_CAP - 2 });
    expect((await accounts.get(me, "20261112", T0)).points).toBe(BALANCE_CAP);
    await cleanup([me, other], [g.id]);
  });
}

function megaContract(make: () => { store: MegaphoneStore; cleanup(ids: string[]): Promise<void> }) {
  it("확성기: 계정마다 간격, 풀기, 최신 먼저 기록과 숨김", async () => {
    const { store, cleanup } = make();
    const id = `t-${nanoid(10)}`;
    expect(await store.cooldown(id, 30_000, 1_000)).toBe(0);
    expect(await store.cooldown(id, 30_000, 2_000)).toBeGreaterThan(0);
    await store.releaseCooldown(id);
    expect(await store.cooldown(id, 30_000, 3_000)).toBe(0);
    const recs = [1, 2].map((n) => ({ id: `m-${nanoid(8)}`, name: "외침이", text: `한마디 ${n}`, scope: "channel" as const, ch: 1, at: n, accountId: id }));
    for (const r of recs) await store.push(r);
    const recent = await store.recent(2);
    expect(recent.map((r) => r.id)).toEqual([recs[1].id, recs[0].id]);
    expect(await store.setHidden(recs[0].id, true)).toBe(true);
    expect((await store.recent(2)).find((r) => r.id === recs[0].id)?.hidden).toBe(true);
    expect(await store.setHidden(recs[0].id, false)).toBe(true);
    expect(await store.setHidden("nope", true)).toBe(false);
    await cleanup([id]);
  });
}

describe("MemoryGifts", () =>
  giftContract(() => {
    const graves = new MemoryStore();
    const accounts = new MemoryAccounts(() => graves);
    return { gifts: new MemoryGifts(() => accounts), accounts, cleanup: async () => {} };
  }));
describe("MemoryMegaphone", () => megaContract(() => ({ store: new MemoryMegaphone(), cleanup: async () => {} })));

const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisGifts (실제 Redis, 개발용 DB에서만)", () =>
  giftContract(() => {
    const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
    return {
      gifts: new RedisGifts(redisEnv!),
      accounts: new RedisAccounts(redisEnv!),
      async cleanup(ids, giftIds) {
        const keys = (await Promise.all(ids.map((id) => raw.keys(`acct:${id}*`)))).flat();
        keys.push(...ids.flatMap((id) => [K.giftsTo(id), K.giftState(id)]));
        await raw.del(...keys);
        await raw.hdel(K.giftsAll, ...giftIds);
        await raw.hdel(K.giftClaims, ...giftIds);
        await raw.zrem(K.rankPoints, ...ids);
      },
    };
  }));
describe.skipIf(!redisEnv)("RedisMegaphone (실제 Redis, 개발용 DB에서만)", () =>
  megaContract(() => {
    const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
    return { store: new RedisMegaphone(redisEnv!), cleanup: async (ids) => void (await raw.del(...ids.map(K.megaCool))) };
  }));
