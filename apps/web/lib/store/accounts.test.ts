import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterEach, describe, expect, it } from "vitest";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP } from "../economy";
import { env } from "../env";
import type { Grave } from "../types";
import { kstDay, kstYesterday } from "./accounts";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { K } from "./keys";
import { MemoryStore } from "./memory";
import { RedisStore } from "./redis";
import type { AccountStore, GraveStore } from "./types";

type Kit = {
  graves: GraveStore;
  accounts: AccountStore;
  setPoints(id: string, n: number): Promise<void>;
  cleanup(ids: string[]): Promise<void>;
};

const DAY = "20261108";
const days = (n: number) => Array.from({ length: n }, (_, i) => `202611${String(i + 1).padStart(2, "0")}`);

function grave(id: string): Grave {
  return {
    id,
    name: "꾸밀 묘비",
    epitaph: "e",
    bornAt: "2024-01-01",
    diedAt: "2024-01-02",
    ageDays: 2,
    causes: ["other"],
    mourner: "테스터",
    createdAt: Date.now(),
    ownerTokenHash: "",
  };
}

/** 두 구현이 똑같이 지켜야 하는 동작. RedisAccounts는 실제 Redis에서 같은 시나리오를 돌린다 */
function contract(make: () => Kit) {
  const kit = make();
  const { graves, accounts } = kit;
  const used: string[] = [];
  const newId = () => {
    const id = `t-${nanoid(10)}`;
    used.push(id);
    return id;
  };
  afterEach(async () => {
    await kit.cleanup(used.splice(0));
  });

  it("항목별 하루 한도: 헌화는 2점씩 하루 20점까지, 다음 날 다시", async () => {
    const id = newId();
    const got: number[] = [];
    for (let i = 0; i < 12; i++) got.push(await accounts.earn(id, "flower", DAY));
    expect(got).toEqual([...Array<number>(10).fill(2), 0, 0]);
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ points: 20, todayEarned: 20 });
    expect(await accounts.earn(id, "flower", "20261109")).toBe(2);
    expect((await accounts.get(id, "20261109", 0)).todayEarned).toBe(2);
  });

  it("하루 전체 한도: 항목 한도 합(130)보다 작은 100점에서 멈춘다", async () => {
    const id = newId();
    const plan = [
      ["attend", 1],
      ["streak", 1],
      ["flower", 10],
      ["revive", 10],
      ["bury", 1],
      ["gotFlower", 20],
      ["gotRevive", 20],
    ] as const;
    let total = 0;
    for (const [source, times] of plan) for (let i = 0; i < times; i++) total += await accounts.earn(id, source, DAY);
    expect(total).toBe(DAILY_EARN_CAP);
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ points: DAILY_EARN_CAP, todayEarned: DAILY_EARN_CAP });
  });

  it("지갑 한도: 넘치는 만큼은 쌓이지 않는다", async () => {
    const id = newId();
    await kit.setPoints(id, BALANCE_CAP - 1);
    expect(await accounts.earn(id, "bury", DAY)).toBe(1);
    expect(await accounts.earn(id, "flower", DAY)).toBe(0);
    expect((await accounts.get(id, DAY, 0)).points).toBe(BALANCE_CAP);
  });

  it("20개를 동시에 사도 잔액만큼만 사지고 음수가 되지 않는다", async () => {
    const id = newId();
    await kit.setPoints(id, 100);
    const results = await Promise.all(Array.from({ length: 20 }, () => accounts.buy(id, "fw_small", 30)));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ points: 10, inventory: { fw_small: 3 } });
  });

  it("가방: 동시에 20번 써도 가진 개수만큼만 쓰이고, 다 쓰면 비어 있다", async () => {
    const id = newId();
    await kit.setPoints(id, 90);
    for (let i = 0; i < 3; i++) await accounts.buy(id, "fw_small", 30);
    const used = await Promise.all(Array.from({ length: 20 }, () => accounts.consume(id, "fw_small")));
    expect(used.filter(Boolean)).toHaveLength(3);
    expect((await accounts.get(id, DAY, 0)).inventory).toEqual({});
    expect(await accounts.consume(id, "fw_small")).toBe(false);
  });

  it("착용: 같은 부위는 교체, 만료된 것은 빠진다, 가방에 없으면 못 입는다", async () => {
    const id = newId();
    await kit.setPoints(id, 1000);
    for (const item of ["hat_straw", "hat_cat", "neck_scarf"]) await accounts.buy(id, item, 10);
    expect(await accounts.equip(id, "hat_straw", "head", 5000)).toBe(true);
    expect(await accounts.equip(id, "neck_scarf", "neck", 1500)).toBe(true);
    expect(await accounts.equip(id, "hat_cat", "head", 6000)).toBe(true);
    expect((await accounts.get(id, DAY, 1000)).equipped.sort((a, b) => a.until - b.until)).toEqual([
      { itemId: "neck_scarf", until: 1500 },
      { itemId: "hat_cat", until: 6000 },
    ]);
    expect((await accounts.get(id, DAY, 2000)).equipped).toEqual([{ itemId: "hat_cat", until: 6000 }]);
    expect(await accounts.equip(id, "hat_cat", "head", 9000)).toBe(false);
    expect((await accounts.get(id, DAY, 0)).inventory).toEqual({});
  });

  it("출석: 하루 1번, 연속이면 streak+1, 7일째 보너스(+30), 끊기면 1부터. 이름 저장", async () => {
    const id = newId();
    const ip = `ip-${nanoid(6)}`;
    const d = days(9);
    const earned: number[] = [];
    for (let i = 0; i < 7; i++) earned.push(await accounts.attend(id, ip + i, i === 0 ? "새벽코더" : null, d[i], d[i - 1] ?? ""));
    expect(earned).toEqual([10, 10, 10, 10, 10, 10, 40]);
    expect(await accounts.attend(id, ip, null, d[6], d[5])).toBe(0);
    expect(await accounts.get(id, d[6], 0)).toMatchObject({ streak: 7, name: "새벽코더", lastAttend: d[6] });
    // 하루 건너뛰면 다시 1일째
    expect(await accounts.attend(id, `${ip}-x`, null, d[8], d[7])).toBe(10);
    expect((await accounts.get(id, d[8], 0)).streak).toBe(1);
  });

  it(`같은 IP에서는 하루 ${ATTEND_ACCOUNTS_PER_IP}개 계정까지만 출석 포인트 (출석 기록은 남는다)`, async () => {
    const ip = `ip-${nanoid(6)}`;
    const ids = Array.from({ length: ATTEND_ACCOUNTS_PER_IP + 1 }, newId);
    const earned = [];
    for (const id of ids) earned.push(await accounts.attend(id, ip, null, DAY, "20261107"));
    expect(earned).toEqual([...Array<number>(ATTEND_ACCOUNTS_PER_IP).fill(10), 0]);
    expect((await accounts.get(ids.at(-1)!, DAY, 0)).lastAttend).toBe(DAY);
  });

  it("개인 코드: 재발급하면 이전 코드로는 찾을 수 없다", async () => {
    const id = newId();
    const [h1, h2] = [`h-${nanoid(8)}`, `h-${nanoid(8)}`];
    expect((await accounts.get(id, DAY, 0)).hasCode).toBe(false);
    await accounts.setCode(id, h1);
    expect(await accounts.findByCode(h1)).toBe(id);
    await accounts.setCode(id, h2);
    expect(await accounts.findByCode(h1)).toBeNull();
    expect(await accounts.findByCode(h2)).toBe(id);
    expect((await accounts.get(id, DAY, 0)).hasCode).toBe(true);
    await kit.cleanup([`code:${h2}`]);
  });

  it("묘비 꾸미기: 가방에서 빠지고, 묘비당 3개(넘으면 가장 오래된 것 교체), 만료된 것은 정리", async () => {
    const id = newId();
    const gid = `t-${nanoid(8)}`;
    await graves.put(grave(gid));
    try {
      expect(await accounts.placeDecor(id, `t-${nanoid(8)}`, "decor_candles", 10_000, 0)).toBeNull();
      expect(await accounts.placeDecor(id, gid, "decor_candles", 10_000, 0)).toBe("no_item");
      await kit.setPoints(id, 1000);
      for (let i = 0; i < 5; i++) await accounts.buy(id, "decor_candles", 30);

      for (const until of [1000, 2000, 3000]) await accounts.placeDecor(id, gid, "decor_candles", until, 0);
      expect(await accounts.placeDecor(id, gid, "decor_candles", 4000, 0)).toEqual(
        [2000, 3000, 4000].map((until) => ({ itemId: "decor_candles", until })),
      );
      expect(await accounts.placeDecor(id, gid, "decor_candles", 9000, 3500)).toEqual([
        { itemId: "decor_candles", until: 4000 },
        { itemId: "decor_candles", until: 9000 },
      ]);
      expect((await graves.get(gid))?.decor).toEqual([
        { itemId: "decor_candles", until: 4000 },
        { itemId: "decor_candles", until: 9000 },
      ]);
      expect((await accounts.get(id, DAY, 0)).inventory).toEqual({});
      // 주인의 수정(put)은 꾸미기를 지우지 않는다
      await graves.put({ ...grave(gid), name: "고친 이름" });
      expect((await graves.get(gid))?.decor).toHaveLength(2);
    } finally {
      await graves.remove(gid);
    }
    expect((await graves.list()).some((g) => g.id === gid)).toBe(false);
  });

  it("내 묘비 목록", async () => {
    const id = newId();
    await accounts.addGrave(id, "g1");
    await accounts.addGrave(id, "g2");
    await accounts.removeGrave(id, "g1");
    expect((await accounts.get(id, DAY, 0)).graves).toEqual(["g2"]);
  });
}

describe("MemoryAccounts", () =>
  contract(() => {
    const graves = new MemoryStore();
    const accounts = new MemoryAccounts(() => graves);
    return {
      graves,
      accounts,
      async setPoints(id, n) {
        (accounts as unknown as { acct(id: string): { points: number } }).acct(id).points = n;
      },
      async cleanup() {},
    };
  }));

const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisAccounts (실제 Redis, 개발용 DB에서만 실행)", () =>
  contract(() => {
    const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
    return {
      graves: new RedisStore(redisEnv!),
      accounts: new RedisAccounts(redisEnv!),
      async setPoints(id, n) {
        await raw.hset(K.acct(id), { points: String(n) });
      },
      async cleanup(ids) {
        const keys = (await Promise.all(ids.map((id) => (id.startsWith("code:") ? [id] : raw.keys(`acct:${id}*`))))).flat();
        if (keys.length) await raw.del(...keys);
      },
    };
  }));

describe("KST 날짜 키", () => {
  it("한국 자정 기준으로 오늘·어제를 YYYYMMDD로", () => {
    const justAfterMidnightKst = Date.UTC(2026, 10, 7, 15, 1); // 11/8 00:01 KST
    expect(kstDay(justAfterMidnightKst)).toBe("20261108");
    expect(kstYesterday(justAfterMidnightKst)).toBe("20261107");
    expect(kstDay(Date.UTC(2026, 10, 7, 14, 59))).toBe("20261107");
    expect(kstYesterday(Date.UTC(2026, 2, 1, 0, 0))).toBe("20260228");
  });
});
