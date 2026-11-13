import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";
import { env } from "../env";
import { kstDay } from "./accounts";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { GIFT_KEEP_MS, MemoryGifts, RedisGifts, type GiftStore } from "./gifts";
import { K } from "./keys";
import { MemoryStore } from "./memory";
import type { AccountStore } from "./types";

// 관리자 경제 통계에서 운영자 계정 활동을 뺀다: 운영자의 적립·사용·환불·구매·관리자 지급·선물 받기는 econ에 잡히지 않고
// (지갑은 그대로 바뀐다), 일반 유저는 그대로 잡힌다. 지갑 합계(walletTotals)도 운영자를 빼고 센다.
// 운영자 지정은 실제 저장소(admin:staff)를 건드리지 않게 모듈을 바꿔 끼운다 (Redis 계약 테스트가 개발 DB의 운영자를 바꾸지 않게)

const staff = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("../staff", async (orig) => ({
  ...(await orig<typeof import("../staff")>()),
  staffAccountId: async () => staff.id,
  staffAccountIdNow: () => staff.id,
}));

type Kit = { accounts: AccountStore; gifts: GiftStore; cleanup(ids: string[], giftIds: string[]): Promise<void> };

function contract(make: () => Kit) {
  const { accounts, gifts, cleanup } = make();

  /** 한 계정이 오늘 하는 일: 적립 2번(4점)·관리자 지급 300·사용 30·환불 5·관리자 회수 7·구매 30·선물 받기 50 */
  async function activity(id: string, now: number, giftId: string) {
    const today = kstDay(now);
    await accounts.earn(id, "flower", today);
    await accounts.earn(id, "flower", today);
    await accounts.adjustPoints(id, 300);
    await accounts.spend(id, 30, "rpg:entry", now);
    await accounts.refund(id, 5, "housing:sell", now);
    await accounts.adjustPoints(id, -7);
    await accounts.buy(id, "fw_small", 30, { now });
    await gifts.send({
      id: giftId,
      from: "마을 관리인",
      note: "선물",
      points: 50,
      items: [],
      createdAt: now,
      expiresAt: now + GIFT_KEEP_MS,
      target: id,
      targetName: "받는이",
    });
    expect(await gifts.claim(id, giftId, now, now + 1)).toMatchObject({ ok: true, points: 50 });
  }
  const WALLET = 4 + 300 - 30 + 5 - 7 - 30 + 50;
  const FIELDS = ["earn:flower", "earn:admin", "spend:rpg", "refund", "spend:admin", "spend:shop", "earn:gift"];

  it("운영자 계정 활동은 경제 통계·지갑 합계에서 빠지고 일반 유저는 그대로 (운영자 지갑은 그대로 바뀐다)", async () => {
    const [op, user] = [`t-${nanoid(10)}`, `t-${nanoid(10)}`];
    const giftIds = [`g-${nanoid(8)}`, `g-${nanoid(8)}`];
    const now = Date.now();
    const today = kstDay(now);
    const stat = async () => (await accounts.economy([today]))[0].fields;
    staff.id = op;
    try {
      const before = await stat();
      const walletsBefore = await accounts.walletTotals(op);
      await activity(op, now, giftIds[0]);
      const mid = await stat();
      // 운영자: 통계는 그대로, 지갑은 평소처럼 바뀐다
      expect(FIELDS.map((f) => (mid[f] ?? 0) - (before[f] ?? 0))).toEqual([0, 0, 0, 0, 0, 0, 0]);
      expect((await accounts.get(op, today, now)).points).toBe(WALLET);
      expect(await accounts.walletTotals(op)).toEqual(walletsBefore);

      await activity(user, now, giftIds[1]);
      const after = await stat();
      expect(FIELDS.map((f) => (after[f] ?? 0) - (mid[f] ?? 0))).toEqual([4, 300, 30, 5, 7, 30, 50]);
      const walletsAfter = await accounts.walletTotals(op);
      expect(walletsAfter.accounts - walletsBefore.accounts).toBe(1);
      expect(walletsAfter.wallets - walletsBefore.wallets).toBe(WALLET);
      // 빼지 않으면 운영자도 센다
      const all = await accounts.walletTotals();
      expect(all.accounts - walletsAfter.accounts).toBe(1);
      expect(all.wallets - walletsAfter.wallets).toBe(WALLET);
    } finally {
      staff.id = null;
      await cleanup([op, user], giftIds);
    }
  });
}

describe("경제 통계 운영자 제외 (메모리)", () =>
  contract(() => {
    const graves = new MemoryStore();
    const accounts = new MemoryAccounts(() => graves);
    return { accounts, gifts: new MemoryGifts(() => accounts), cleanup: async () => {} };
  }));

const redisEnv = env.redis();
describe.skipIf(!redisEnv)("경제 통계 운영자 제외 (실제 Redis, 개발용 DB에서만)", () =>
  contract(() => {
    const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
    return {
      accounts: new RedisAccounts(redisEnv!),
      gifts: new RedisGifts(redisEnv!),
      async cleanup(ids, giftIds) {
        const keys = (await Promise.all(ids.map((id) => raw.keys(`acct:${id}*`)))).flat();
        keys.push(...ids.flatMap((id) => [K.giftsTo(id), K.giftState(id)]));
        await raw.del(...keys);
        await raw.hdel(K.giftsAll, ...giftIds);
        await raw.hdel(K.giftClaims, ...giftIds);
        const boards = (await raw.keys("rank:*")) as string[];
        await Promise.all(boards.map((k) => raw.zrem(k, ...ids)));
      },
    };
  }));
