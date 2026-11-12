import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterAll, describe, expect, it } from "vitest";
import { earnRule } from "../economy";
import { env } from "../env";
import { earnPoints, getAccounts, refundPoints } from "../store";
import { kstDay } from "../store/accounts";
import { gearById } from "./catalog";
import { huntPlan } from "./plan";
import { finishRun, shopAction, startRun } from "./service";
import { getRpgStore, MemoryRpgStore, RedisRpgStore, RUNS_PER_HOUR, type RpgStore } from "./store";

// 사냥터 저장소·서비스 계약. RedisRpgStore는 Redis 환경변수가 있을 때 같은 시나리오를 돌린다
// (서비스는 getRpgStore/getAccounts를 쓰므로 환경에 따라 메모리 또는 Redis에서 돈다).

const redisEnv = env.redis();
const kits: [string, () => RpgStore][] = [["memory", () => new MemoryRpgStore()]];
if (redisEnv) kits.push(["redis", () => new RedisRpgStore(redisEnv)]);
const made: string[] = [];
const acct = () => {
  const id = `rpgtest-${nanoid(10)}`;
  made.push(id);
  return id;
};
afterAll(async () => {
  if (!redisEnv) return;
  const raw = new Redis({ ...redisEnv, automaticDeserialization: false });
  const keys = (await Promise.all(made.map((a) => raw.keys(`*${a}*`)))).flat();
  if (keys.length) await raw.del(...keys);
});

describe.each(kits)("RpgStore (%s)", (_name, make) => {
  const store = make();

  it("update는 매번 최신 상태 위에 쌓이고, 동시에 바꿔도 잃어버리는 변경이 없다", async () => {
    const a = acct();
    for (let i = 0; i < 3; i++) await store.update(a, (s) => ({ state: { ...s, runs: s.runs + 1 }, result: null }));
    expect((await store.get(a)).runs).toBe(3);
    await Promise.all(Array.from({ length: 5 }, () => store.update(a, (s) => ({ state: { ...s, runs: s.runs + 1 }, result: null }))));
    expect((await store.get(a)).runs).toBe(8);
  });

  it("fn이 던지면 저장하지 않는다", async () => {
    const a = acct();
    await expect(store.update(a, () => {
      throw new Error("no");
    })).rejects.toThrow("no");
    expect((await store.get(a)).runs).toBe(0);
  });

  it("티켓은 한 번만: 동시에 내도 하나만 ok, 새 판을 시작하면 옛 판은 stale", async () => {
    const a = acct();
    expect(await store.startRun(a, "n1", 60, "h")).toBe(true);
    const claims = await Promise.all([store.claimRun(a, "n1"), store.claimRun(a, "n1"), store.claimRun(a, "n1")]);
    expect(claims.filter((c) => c === "ok")).toHaveLength(1);
    expect(claims.filter((c) => c === "reused")).toHaveLength(2);
    await store.startRun(a, "n2", 60, "h");
    await store.startRun(a, "n3", 60, "h");
    expect(await store.claimRun(a, "n2")).toBe("stale");
    expect(await store.claimRun(a, "n2")).toBe("reused");
    expect(await store.claimRun(a, "n3")).toBe("ok");
  });

  it(`시간당 ${RUNS_PER_HOUR}판: 동시에 시작해도 한도까지만`, async () => {
    const a = acct();
    const started = await Promise.all(Array.from({ length: RUNS_PER_HOUR + 5 }, (_, i) => store.startRun(a, `n${i}`, 60, "h1")));
    expect(started.filter(Boolean)).toHaveLength(RUNS_PER_HOUR);
    expect(await store.runsThisHour(a, "h1")).toBe(RUNS_PER_HOUR);
    expect(await store.startRun(a, "next-hour", 60, "h2")).toBe(true);
  });

  it("오늘 기록은 더해지고 날짜별로 따로", async () => {
    const a = acct();
    await store.addDaily(a, "20261109", { points: 20, runs: 1, exp: 5 });
    expect(await store.addDaily(a, "20261109", { points: 10, runs: 1 })).toEqual({ points: 30, runs: 2, exp: 5 });
    expect(await store.daily(a, "20261110")).toEqual({ points: 0, runs: 0, exp: 0 });
  });
});

describe(`사냥터 서비스 (${redisEnv ? "redis" : "memory"})`, () => {
  const points = async (a: string) => (await getAccounts().get(a, kstDay(), Date.now())).points;

  it("장비 사기: 동시에 여러 번 사도 잔액만큼만 사지고, 산 장비 되팔기는 환불", async () => {
    const a = acct();
    const ruler = gearById("w_ruler")!;
    await refundPoints(a, ruler.price * 2, "test");
    const tries = await Promise.allSettled(Array.from({ length: 5 }, () => shopAction(a, { type: "buy", itemId: ruler.id, qty: 1 }, "ip")));
    expect(tries.filter((t) => t.status === "fulfilled")).toHaveLength(2);
    expect(await points(a)).toBe(0);
    expect((await getRpgStore().get(a)).inv[ruler.id]).toBe(3); // 처음부터 장착한 자 1개 + 산 것 2개

    const sold = await shopAction(a, { type: "sell", itemId: ruler.id }, "ip");
    expect(sold.sold!.value).toBeGreaterThan(0);
    expect(sold.sold!.value).toBeLessThan(ruler.price);
    expect(await points(a)).toBe(sold.sold!.value);
    expect((await getAccounts().get(a, kstDay(), Date.now())).lifetimePoints).toBe(0); // 환불은 모은 포인트가 아니다
    await shopAction(a, { type: "sell", itemId: ruler.id }, "ip");
    // 남은 1개는 장착 중이라 못 판다
    await expect(shopAction(a, { type: "sell", itemId: ruler.id }, "ip")).rejects.toMatchObject({ status: 409, code: "NOT_OWNED" });
  });

  it("여러 개 되팔기: 산 장비는 한 번에 환불, 모자라면 하나도 안 팔린다", async () => {
    const a = acct();
    const kb = gearById("w_keyboard")!;
    await refundPoints(a, kb.price * 3, "test");
    for (let i = 0; i < 3; i++) await shopAction(a, { type: "buy", itemId: kb.id, qty: 1 }, "ip");
    expect(await points(a)).toBe(0);
    await expect(shopAction(a, { type: "sell", itemId: kb.id, count: 4 }, "ip")).rejects.toMatchObject({ status: 409, code: "NOT_OWNED" });
    expect((await getRpgStore().get(a)).inv[kb.id]).toBe(3);
    const sold = await shopAction(a, { type: "sell", itemId: kb.id, count: 3 }, "ip");
    expect(sold.sold).toEqual({ value: 3 * Math.floor(kb.price / 2), capped: false, count: 3 });
    expect(await points(a)).toBe(3 * Math.floor(kb.price / 2));
    expect((await getRpgStore().get(a)).inv[kb.id]).toBeUndefined();
  });

  it("포션 여러 개 되팔기는 사냥 포인트 하루 한도 안에서만, 못 받은 것은 가방에 남는다", async () => {
    const a = acct();
    const cap = earnRule("hunt").dailyMax;
    await getRpgStore().update(a, (s) => ({ state: { ...s, potions: { ...s.potions, p_coffee: 10 } }, result: null }));
    await earnPoints(a, "hunt", cap - 4, "ip"); // 남은 한도 4P = 커피 1개 값
    const sold = await shopAction(a, { type: "sell", itemId: "p_coffee", count: 10 }, "ip");
    expect(sold.sold).toEqual({ value: 4, capped: true, count: 1 });
    expect((await getRpgStore().get(a)).potions.p_coffee).toBe(9);
    // 한도가 다 찼으면 하나도 팔리지 않고 그대로
    const none = await shopAction(a, { type: "sell", itemId: "p_coffee", count: 9 }, "ip");
    expect(none.sold).toEqual({ value: 0, capped: true, count: 0 });
    expect((await getRpgStore().get(a)).potions.p_coffee).toBe(9);
  });

  it("판 끝내기: 티켓 재사용 409, 하루 사냥 포인트 한도에서 멈춘다", async () => {
    const a = acct();
    const cap = earnRule("hunt").dailyMax;
    let now = Date.now();
    let total = 0;
    let last = { points: -1, capped: false };
    for (let i = 0; i < cap / 20 + 1; i++) {
      const run = await startRun(a, "hunt", "easy", now);
      const plan = huntPlan(run.seed, "easy");
      const kills: Record<string, number> = {};
      for (const w of plan) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      const result = { game: "hunt" as const, durationMs: 120_000, kills, wavesCleared: plan.length, died: false, potionsUsed: {} };
      const done = await finishRun(a, run.ticket, result, `ip-${a}`, now + 121_000);
      total += done.reward.points;
      last = { points: done.reward.points, capped: done.reward.capped };
      if (i === 0) await expect(finishRun(a, run.ticket, result, `ip-${a}`, now + 122_000)).rejects.toMatchObject({ code: "TICKET_USED" });
      now += 130_000;
    }
    expect(total).toBe(cap);
    expect(last).toEqual({ points: 0, capped: true });
    expect((await getRpgStore().daily(a, kstDay(now))).points).toBe(cap);
  });
});
