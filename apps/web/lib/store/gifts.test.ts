import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { PERMANENT_UNTIL } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { BALANCE_CAP } from "../economy";
import { env } from "../env";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { MemoryGifts, RedisGifts, GIFT_KEEP_MS, type GiftRecord, type GiftStore } from "./gifts";
import { K } from "./keys";
import { MemoryStore } from "./memory";
import { MEGAPHONE_TTL_MS } from "@tomb/protocol";
import { MEGA_KEEP, MemoryMegaphone, pinList, RedisMegaphone, type MegaphoneStore } from "./megaphone";
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
      // 선물 포인트는 지갑에만: 모은 포인트·전체 포인트 랭킹엔 안 들어간다
      expect(a.lifetimePoints).toBe(0);
      expect((await accounts.pointRank(10_000, old)).mine).toBeNull();
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

  it("특정 계정 선물은 그 계정만, 예전 지갑 상한(99,999)을 넘어도 다 들어온다 (11/19 지갑 상한 WALLET_MAX)", async () => {
    const { gifts, accounts, cleanup } = make();
    const [me, other] = [`t-${nanoid(10)}`, `t-${nanoid(10)}`];
    const g = gift({ target: me, targetName: "받는이", points: BALANCE_CAP, items: [{ itemId: "mega_ch", count: 1 }] });
    await gifts.send(g);
    await accounts.earn(me, "flower", "20261112");
    expect((await gifts.inbox(other, T0 - 1, T0 + 1)).map((x) => x.id)).not.toContain(g.id);
    expect(await gifts.claim(other, g.id, T0 - 1, T0 + 1)).toEqual({ ok: false, reason: "gone" });
    const r = await gifts.claim(me, g.id, T0 + 100, T0 + 1); // 특정 계정 선물은 처음 들어온 시각과 상관없다
    expect(r).toMatchObject({ ok: true, points: BALANCE_CAP });
    expect((await accounts.get(me, "20261112", T0)).points).toBe(BALANCE_CAP + 2);
    // 모은 포인트·랭킹은 꽃 적립 2만 (선물 몫은 빠진다)
    expect((await accounts.get(me, "20261112", T0)).lifetimePoints).toBe(2);
    expect((await accounts.pointRank(10_000, me)).mine?.points).toBe(2);
    await cleanup([me, other], [g.id]);
  });

  it("여러 계정 선물: 고른 계정마다 선물함에 들어가 각자 한 번씩 받고, 발송 기록은 한 줄로 받은 수를 모은다", async () => {
    const { gifts, accounts, cleanup } = make();
    const [a, b, c, other] = [0, 1, 2, 3].map(() => `t-${nanoid(10)}`);
    const g = gift({ target: a, targetName: "진순", targets: [a, b, c], points: 30 });
    try {
      await gifts.send(g);
      for (const id of [a, b, c]) {
        const box = await gifts.inbox(id, 0, T0 + 1);
        expect(box.map((x) => x.id)).toContain(g.id);
      }
      expect((await gifts.inbox(other, T0 - 1, T0 + 1)).map((x) => x.id)).not.toContain(g.id);
      expect(await gifts.claim(other, g.id, T0 - 1, T0 + 1)).toEqual({ ok: false, reason: "gone" });

      // 받은 선물은 그 계정 앞 사본 (대상은 그 계정, 목록은 없다)
      const got = await gifts.claim(b, g.id, 0, T0 + 2);
      expect(got).toMatchObject({ ok: true, points: 30, gift: { id: g.id, target: b } });
      expect(got.ok && got.gift.targets).toBeUndefined();
      expect(await gifts.claim(b, g.id, 0, T0 + 3)).toEqual({ ok: false, reason: "done" });
      expect(await gifts.claim(c, g.id, 0, T0 + 3)).toMatchObject({ ok: true });
      expect((await accounts.get(b, "20261112", T0)).points).toBe(30);
      // 한 계정이 지워도 다른 계정 선물함엔 남는다
      expect(await gifts.remove(a, g.id, 0, T0 + 4)).toBe(true);
      expect((await gifts.inbox(a, 0, T0 + 5)).map((x) => x.id)).not.toContain(g.id);
      expect((await gifts.inbox(c, 0, T0 + 5)).find((x) => x.id === g.id)?.claimedAt).toBe(T0 + 3);

      const row = (await gifts.log(50)).filter((x) => x.id === g.id);
      expect(row).toHaveLength(1);
      expect(row[0]).toMatchObject({ target: a, targetName: "진순", targets: [a, b, c], claims: 2 });
      await cleanup([a, b, c, other], [g.id]);
    } catch (e) {
      await cleanup([a, b, c, other], [g.id]);
      throw e;
    }
  });

  it("지갑 전용으로 받은 선물은 랭킹 정리(legacyClaims) 대상이 아니다 (받고 지워도)", async () => {
    const { gifts, cleanup } = make();
    const me = `t-${nanoid(10)}`;
    const g = gift({ target: me, points: 40 });
    await gifts.send(g);
    expect(await gifts.claim(me, g.id, 0, T0 + 1)).toMatchObject({ ok: true, points: 40 });
    expect((await gifts.legacyClaims()).perAccount.has(me)).toBe(false);
    expect(await gifts.remove(me, g.id, 0, T0 + 2)).toBe(true);
    expect((await gifts.legacyClaims()).perAccount.has(me)).toBe(false);
    await cleanup([me], [g.id]);
  });

  it("기간 선물(꾸미기): 3일·7일은 옷장에 기간을 더하고, 입고 있으면 그 자리에서, 영구는 영구, 기간 없는 옛 선물은 가방 이용권", async () => {
    const { gifts, accounts, cleanup } = make();
    const me = `t-${nanoid(10)}`;
    const DAY = 86_400_000;
    const until = async (itemId: string, now: number) => {
      const a = await accounts.get(me, "20261112", now);
      return [...a.equipped, ...a.stash].find((e) => e.itemId === itemId)?.until;
    };
    const g1 = gift({
      target: me,
      items: [
        { itemId: "hat_straw", count: 1, term: "3d" },
        { itemId: "neck_scarf", count: 1, term: "perm" },
        { itemId: "hat_cat", count: 2 }, // 옛 선물 모양 (기간 없음)
      ],
    });
    const g2 = gift({ target: me, items: [{ itemId: "hat_straw", count: 1, term: "7d" }] });
    const g3 = gift({ target: me, items: [{ itemId: "hat_straw", count: 1, term: "30d" }, { itemId: "neck_scarf", count: 1, term: "3d" }] });
    try {
      for (const x of [g1, g2, g3]) await gifts.send(x);
      expect(await gifts.claim(me, g1.id, 0, T0 + 1)).toMatchObject({ ok: true });
      const a = await accounts.get(me, "20261112", T0 + 1);
      expect(a.inventory.hat_cat).toBe(2);
      expect(a.inventory.hat_straw ?? 0).toBe(0);
      expect(a.stash).toEqual(expect.arrayContaining([{ itemId: "hat_straw", until: T0 + 1 + 3 * DAY }, { itemId: "neck_scarf", until: PERMANENT_UNTIL }]));
      // 아직 남은 기간 위에 7일이 더해진다
      expect(await gifts.claim(me, g2.id, 0, T0 + 2)).toMatchObject({ ok: true });
      expect(await until("hat_straw", T0 + 2)).toBe(T0 + 1 + 10 * DAY);
      // 입고 있으면 그 자리에서 늘어나고, 영구는 3일 선물로 줄지 않는다
      expect(await accounts.wear(me, "hat_straw", "head", T0 + 3)).toBe(true);
      expect(await gifts.claim(me, g3.id, 0, T0 + 4)).toMatchObject({ ok: true });
      const b = await accounts.get(me, "20261112", T0 + 4);
      expect(b.equipped).toContainEqual({ itemId: "hat_straw", until: T0 + 1 + 40 * DAY });
      expect(b.stash.find((e) => e.itemId === "hat_straw")).toBeUndefined();
      expect(await until("neck_scarf", T0 + 4)).toBe(PERMANENT_UNTIL);
      await cleanup([me], [g1.id, g2.id, g3.id]);
    } catch (e) {
      await cleanup([me], [g1.id, g2.id, g3.id]);
      throw e;
    }
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
    const recs = [1, 2].map((n) => ({ id: `m-${nanoid(8)}`, name: "외침이", text: `한마디 ${n}`, scope: "channel" as const, ch: 1, at: Date.now() + n, accountId: id }));
    for (const r of recs) await store.push(r);
    const recent = await store.recent(2);
    expect(recent.map((r) => r.id)).toEqual([recs[1].id, recs[0].id]);
    expect(await store.setHidden(recs[0].id, true)).toBe(true);
    expect((await store.recent(2)).find((r) => r.id === recs[0].id)?.hidden).toBe(true);
    expect(await store.setHidden(recs[0].id, false)).toBe(true);
    expect(await store.setHidden("nope", true)).toBe(false);
    await cleanup([id]);
  });

  it("확성기: 외친 지 5분이 지난 기록은 목록에서 빠지고 저장소에서도 지워진다", async () => {
    const { store, cleanup } = make();
    const id = `t-${nanoid(10)}`;
    const now = Date.now();
    const rec = (at: number) => ({ id: `m-${nanoid(8)}`, name: "외침이", text: "한마디", scope: "all" as const, ch: 1, at, accountId: id });
    const old = rec(now - MEGAPHONE_TTL_MS - 1);
    const fresh = rec(now);
    await store.push(old);
    await store.push(fresh);
    const ids = (await store.recent(MEGA_KEEP, now)).map((r) => r.id);
    expect(ids).toContain(fresh.id);
    expect(ids).not.toContain(old.id);
    // 지워졌으니 숨기기도 찾지 못한다
    expect(await store.setHidden(old.id, true)).toBe(false);
    // 5분이 지나면 방금 것도 빠진다
    expect((await store.recent(MEGA_KEEP, now + MEGAPHONE_TTL_MS)).some((r) => r.id === fresh.id)).toBe(false);
    await cleanup([id]);
  });

  it("11/17 고정 공지: 채널마다 하나 + 모든 채널 하나, 덮어쓰기·지우기, 쓴 사람·시각까지 남는다", async () => {
    const { store, cleanup } = make();
    // 실제 Redis에서도 다른 테스트와 겹치지 않게 쓰지 않는 큰 채널 번호
    const [chA, chB] = [900 + Math.floor(Math.random() * 40), 950 + Math.floor(Math.random() * 40)];
    const pin = (scope: "channel" | "all", ch: number, text: string) => ({ scope, ch, text, name: "운영자", at: 1_000, accountId: "staff-1" });
    try {
      expect(await store.pins(chA)).toEqual({ channel: null, all: null });
      await store.setPin("channel", chA, pin("channel", chA, "A채널 공지"));
      await store.setPin("all", chA, pin("all", 0, "모두 공지"));
      expect(await store.pins(chA)).toEqual({ channel: pin("channel", chA, "A채널 공지"), all: pin("all", 0, "모두 공지") });
      // 다른 채널은 모든 채널 공지만 보인다
      expect(await store.pins(chB)).toEqual({ channel: null, all: pin("all", 0, "모두 공지") });
      // 덮어쓰기 (모든 채널 공지는 어느 채널에서 써도 같은 칸)
      await store.setPin("all", chB, pin("all", 0, "새 모두 공지"));
      expect((await store.pins(chA)).all?.text).toBe("새 모두 공지");
      expect(pinList(await store.pins(chA)).map((p) => [p.scope, p.text])).toEqual([
        ["channel", "A채널 공지"],
        ["all", "새 모두 공지"],
      ]);
      // 쓴 계정은 화면용 목록에 나가지 않는다
      expect(pinList(await store.pins(chA))[0]).not.toHaveProperty("accountId");
      await store.setPin("channel", chA, null);
      expect(await store.pins(chA)).toEqual({ channel: null, all: pin("all", 0, "새 모두 공지") });
      await store.setPin("all", chA, null);
      expect(await store.pins(chA)).toEqual({ channel: null, all: null });
      // 없는 것을 지워도 괜찮다
      await store.setPin("channel", chB, null);
    } finally {
      await store.setPin("channel", chA, null);
      await store.setPin("all", 0, null);
      await cleanup([]);
    }
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
    return { store: new RedisMegaphone(redisEnv!), cleanup: async (ids) => void (ids.length && (await raw.del(...ids.map(K.megaCool)))) };
  }));
