import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "../env";
import type { Grave } from "../types";
import { GraveInputSchema } from "../validate";
import { deleteGrave, listPublic, toPublicGrave } from "./index";
import { MemoryStore } from "./memory";
import { mockGraves } from "./mock";
import { RedisStore } from "./redis";
import { SHRINE_KEEP_MS, type GraveStore } from "./types";

function grave(over: Partial<Grave> = {}): Grave {
  return {
    id: `test-${nanoid(8)}`,
    name: "테스트 묘비",
    epitaph: "향년 3일, 테스트 중 별세",
    bornAt: "2024-01-01",
    diedAt: "2024-01-03",
    ageDays: 3,
    causes: ["time"],
    mourner: "테스터",
    createdAt: Date.now(),
    ownerTokenHash: "hash",
    ...over,
  };
}

const visitors = (n: number) => Array.from({ length: n }, (_, i) => `visitor-${i}-${nanoid(6)}`);

/** 두 구현이 똑같이 지켜야 하는 동작. RedisStore는 실제 Upstash에서 같은 시나리오를 돌린다 */
function contract(make: () => GraveStore) {
  const store = make();
  const created: string[] = [];
  const add = async (over: Partial<Grave> = {}) => {
    const g = grave(over);
    await store.put(g);
    created.push(g.id);
    return g;
  };
  afterEach(async () => {
    await Promise.all(created.splice(0).flatMap((id) => [store.remove(id), store.removePassed(id)]));
  });

  it("put/get: 메타와 0 카운트를 돌려주고, 없는 id는 null", async () => {
    const g = await add({ links: ["https://example.com"], stack: ["Go"] });
    expect(await store.get(g.id)).toEqual({ ...g, channel: 1, flowers: 0, revives: 0 });
    expect(await store.get("test-nope")).toBeNull();
  });

  it("put은 같은 id를 덮어쓴다", async () => {
    const g = await add();
    await store.put({ ...g, name: "고친 이름" });
    expect((await store.get(g.id))?.name).toBe("고친 이름");
  });

  it("없는(삭제된) 묘비에 반응 → null, 고아 카운트·집합을 만들지 않는다", async () => {
    const id = `test-${nanoid(8)}`;
    expect(await store.flower(id, "v")).toBeNull();
    expect(await store.report(id, "v", "ip", "other")).toBeNull();
    expect(await store.viewer(id, "v")).toEqual({ myFlowerToday: false });
    await add({ id });
    expect(await store.get(id)).toMatchObject({ flowers: 0, revives: 0 });
    expect(await store.report(id, "v", "ip", "other")).toBe("added");
  });

  it("20명이 동시에 헌화 → 20", async () => {
    const g = await add();
    const counts = await Promise.all(visitors(20).map((v) => store.flower(g.id, v)));
    expect(counts.every((c) => typeof c === "number")).toBe(true);
    expect((await store.get(g.id))?.flowers).toBe(20);
  });

  it("같은 방문자가 동시에 5번 헌화해도 1번만 반영, 이후는 already", async () => {
    const g = await add();
    const results = await Promise.all(Array.from({ length: 5 }, () => store.flower(g.id, "same")));
    expect(results.filter((c) => c !== "already")).toEqual([1]);
    expect(await store.flower(g.id, "same")).toBe("already");
    expect(await store.viewer(g.id, "same")).toEqual({ myFlowerToday: true });
    expect((await store.viewer(g.id, "other")).myFlowerToday).toBe(false);
  });

  it("서로 다른 IP 5곳이 신고하면 숨김. 같은 방문자·같은 IP의 재신고는 duplicate", async () => {
    const g = await add();
    const vs = visitors(7);
    for (let i = 0; i < 4; i++) expect(await store.report(g.id, vs[i], `ip-${i}`, "other")).toBe("added");
    expect(await store.report(g.id, vs[0], "ip-new", "other")).toBe("duplicate"); // 같은 방문자, 다른 IP
    expect(await store.report(g.id, vs[5], "ip-0", "other")).toBe("duplicate"); // 새 쿠키, 같은 IP
    expect((await store.get(g.id))?.hidden).toBeFalsy();
    expect(await store.report(g.id, vs[6], "ip-4", "other")).toBe("added");
    expect((await store.get(g.id))?.hidden).toBe(true);
  });

  it("동시에 신고가 몰려도 IP 수가 정확히 집계된다", async () => {
    const g = await add();
    const results = await Promise.all(visitors(10).map((v, i) => store.report(g.id, v, `ip-${i % 3}`, "other")));
    expect(results.filter((r) => r === "added")).toHaveLength(3);
    expect((await store.get(g.id))?.hidden).toBeFalsy();
  });

  it("숨김 해제는 신고 기록도 비운다 → 다음 신고 한 번으로 다시 숨지 않는다", async () => {
    const g = await add();
    for (const [i, v] of visitors(5).entries()) await store.report(g.id, v, `ip-${i}`, "other");
    expect(await store.setHidden(g.id, false)).toBe(true);
    expect(await store.report(g.id, "late", "ip-late", "other")).toBe("added");
    expect((await store.get(g.id))?.hidden).toBeFalsy();
    expect(await store.setHidden("test-nope", true)).toBe(false);
  });

  it("받은 신고의 사유·시각을 최신 먼저 기록하고 최근 50개만 남긴다", async () => {
    const g = await add();
    for (let i = 0; i < 55; i++) await store.report(g.id, `v${i}`, `ip-${i}`, i % 2 ? "spam" : "abuse", 1000 + i);
    await store.report(g.id, "v0", "ip-new", "privacy"); // 중복 신고는 기록하지 않는다
    const summary = (await store.reportSummary()).get(g.id)!;
    expect(summary.count).toBe(55);
    expect(summary.log).toHaveLength(50);
    expect(summary.log[0]).toEqual({ at: 1054, reason: "abuse" });
    expect(summary.log.at(-1)).toEqual({ at: 1005, reason: "spam" });
  });

  it("숨김 해제는 신고 수만 0으로(기록은 남김), 신고 초기화는 기록까지 비운다(숨김은 그대로)", async () => {
    const g = await add();
    for (let i = 0; i < 5; i++) await store.report(g.id, `v${i}`, `ip-${i}`, "privacy");
    expect((await store.get(g.id))?.hidden).toBe(true);
    await store.setHidden(g.id, false);
    const afterUnhide = (await store.reportSummary()).get(g.id)!;
    expect(afterUnhide.count).toBe(0);
    expect(afterUnhide.log).toHaveLength(5);

    await store.setHidden(g.id, true);
    expect(await store.resetReports(g.id)).toBe(true);
    expect((await store.reportSummary()).has(g.id)).toBe(false);
    expect((await store.get(g.id))?.hidden).toBe(true);
    expect(await store.report(g.id, "v0", "ip-0", "spam")).toBe("added");
    expect(await store.resetReports(`test-${nanoid(8)}`)).toBe(false);
  });

  it("주인의 수정(put)은 숨김을 풀지 못한다", async () => {
    const g = await add();
    await store.setHidden(g.id, true);
    await store.put({ ...g, name: "몰래 고친 이름", hidden: false });
    expect(await store.get(g.id)).toMatchObject({ name: "몰래 고친 이름", hidden: true });
  });

  it("remove는 메타·카운트·집합을 모두 지운다", async () => {
    const g = await add();
    await store.flower(g.id, "a");
    await store.report(g.id, "a", "ip-a", "other");
    await store.setHidden(g.id, true);
    expect((await store.remove(g.id))?.id).toBe(g.id);
    expect(await store.get(g.id)).toBeNull();
    expect((await store.listAll()).some((r) => r.id === g.id)).toBe(false);
    expect((await store.viewer(g.id, "a")).myFlowerToday).toBe(true); // 헌화 표시는 24시간 TTL로 저절로 사라진다
    expect((await store.reportSummary()).has(g.id)).toBe(false);
    expect(await store.remove(g.id)).toBeNull();
    // 같은 id로 다시 세워도 예전 카운트·숨김·신고가 남아 있지 않다
    await add({ id: g.id });
    expect(await store.get(g.id)).toMatchObject({ flowers: 0, revives: 0 });
    expect((await store.get(g.id))?.hidden).toBeFalsy();
    expect(await store.report(g.id, "a", "ip-a", "other")).toBe("added");
  });

  it("채널마다 묘지가 따로: 목록·랭킹이 섞이지 않고, id로 부르면 채널을 스스로 찾는다", async () => {
    const one = await add({ channel: 1 });
    const two = await add({ channel: 2 });
    await store.flower(two.id, "v1");
    const ids = async (ch: number) => (await store.list(ch)).map((r) => r.id);
    expect(await ids(1)).toContain(one.id);
    expect(await ids(1)).not.toContain(two.id);
    expect(await ids(2)).toContain(two.id);
    expect(await ids(2)).not.toContain(one.id);
    expect(await store.get(two.id)).toMatchObject({ channel: 2, flowers: 1 });
    expect((await store.list(2)).find((r) => r.id === two.id)).toMatchObject({ channel: 2, flowers: 1 });
    const all = await store.listAll();
    expect(all.find((r) => r.id === one.id)?.channel).toBe(1);
    expect(all.find((r) => r.id === two.id)?.channel).toBe(2);
    // 숨김·신고·삭제도 그 채널에서
    expect(await store.setHidden(two.id, true)).toBe(true);
    expect((await store.get(two.id))?.hidden).toBe(true);
    expect(await store.report(two.id, "v2", "ip2", "spam")).toBe("added");
    expect((await store.remove(two.id))?.channel).toBe(2);
    expect(await ids(2)).not.toContain(two.id);
  });

  it("채널 없는 예전 묘비는 1채널 묘비로 본다", async () => {
    const legacy = await add();
    expect(legacy.channel).toBeUndefined();
    expect((await store.list(1)).some((r) => r.id === legacy.id)).toBe(true);
    expect((await store.get(legacy.id))?.channel).toBe(1);
  });

  it("성황당: 이장하면 목록·랭킹에서 빠지고, 반응 수·숨김·꾸미기를 보관했다가 채널 맨 뒤로 되돌린다", async () => {
    const acct = `acct-${nanoid(6)}`;
    const g = await add({ channel: 2, createdAt: 1000 });
    await store.flower(g.id, "v1");
    await store.setHidden(g.id, true);
    const now = Date.now();

    expect((await store.toShrine(g.id, acct, now))?.id).toBe(g.id);
    expect(await store.get(g.id)).toBeNull();
    expect((await store.list(2)).some((r) => r.id === g.id)).toBe(false);
    expect(await store.toShrine(g.id, acct, now)).toBeNull();

    const [entry] = await store.shrine(acct, now);
    expect(entry).toMatchObject({ removedAt: now, expiresAt: now + SHRINE_KEEP_MS });
    expect(entry.record).toMatchObject({ id: g.id, channel: 2, flowers: 1, hidden: true, createdAt: 1000 });

    expect(await store.restore(`acct-${nanoid(6)}`, g.id, now + 1)).toBeNull(); // 남의 성황당
    const back = await store.restore(acct, g.id, now + 5);
    expect(back).toMatchObject({ id: g.id, channel: 2, flowers: 1, hidden: true, createdAt: now + 5 });
    expect(await store.get(g.id)).toMatchObject({ channel: 2, flowers: 1, createdAt: now + 5 });
    expect((await store.viewer(g.id, "v1")).myFlowerToday).toBe(true); // 헌화한 사람 기록도 그대로
    expect(await store.shrine(acct, now)).toEqual([]);
    expect(await store.restore(acct, g.id, now + 6)).toBeNull();
  });

  it("성황당: 동시에 두 번 되돌려도 한 번만, 30일이 지나면 되돌릴 수 없고 정리된다", async () => {
    const acct = `acct-${nanoid(6)}`;
    const g = await add();
    const now = Date.now();
    await store.toShrine(g.id, acct, now);
    const both = await Promise.all([store.restore(acct, g.id, now), store.restore(acct, g.id, now)]);
    expect(both.filter(Boolean)).toHaveLength(1);

    await store.toShrine(g.id, acct, now);
    const expired = now + SHRINE_KEEP_MS + 1;
    expect(await store.shrine(acct, expired)).toEqual([]);
    expect(await store.restore(acct, g.id, expired)).toBeNull();
    const purged = await store.purgeShrine(expired, 100);
    expect(purged.map((p) => p.id)).toContain(g.id);
    expect(await store.shrine(acct, now)).toEqual([]);
    expect((await store.purgeShrine(expired, 100)).map((p) => p.id)).not.toContain(g.id);
  });

  it("list는 카운트를 붙여 돌려준다 (숨김 포함)", async () => {
    const a = await add();
    const b = await add();
    await store.setHidden(b.id, true);
    await store.flower(a.id, "x");
    const mine = (await store.list(1)).filter((r) => r.id === a.id || r.id === b.id);
    expect(mine).toHaveLength(2);
    expect(mine.find((r) => r.id === a.id)).toMatchObject({ flowers: 1, revives: 0 });
    expect(mine.find((r) => r.id === b.id)?.hidden).toBe(true);
  });

  it("성불: 묘역에서 빼고 성불 리스트로 옮긴다 (반응 수·숨김·꾸미기 보관), 두 번 불러도 한 번만", async () => {
    const g = await add({ channel: 3, createdAt: 1234 });
    await store.flower(g.id, "v1");
    await store.flower(g.id, "v2");
    await store.setHidden(g.id, true);
    const now = Date.now();

    const both = await Promise.all([store.passOn(g.id, now, "time"), store.passOn(g.id, now, "time")]);
    expect(both.filter(Boolean)).toHaveLength(1);
    const done = both.find(Boolean)!;
    expect(done).toMatchObject({ passedAt: now, reason: "time" });
    expect(done.record).toMatchObject({ id: g.id, channel: 3, flowers: 2, hidden: true, createdAt: 1234 });
    expect(await store.get(g.id)).toBeNull();
    expect((await store.list(3)).some((r) => r.id === g.id)).toBe(false);
    expect(await store.flower(g.id, "v3")).toBeNull(); // 성불한 묘비에는 꽃을 놓을 수 없다

    const all = await store.passedAll();
    expect(all.find((p) => p.record.id === g.id)).toMatchObject({ passedAt: now, reason: "time", record: { flowers: 2, channel: 3 } });
    expect((await store.passedSince(now - 1, 50)).map((p) => p.record.id)).toContain(g.id);
    expect((await store.passedSince(now, 50)).map((p) => p.record.id)).not.toContain(g.id);

    expect((await store.removePassed(g.id))?.id).toBe(g.id);
    expect(await store.removePassed(g.id)).toBeNull();
    expect((await store.passedAll()).some((p) => p.record.id === g.id)).toBe(false);
    expect((await store.passedSince(now - 1, 50)).map((p) => p.record.id)).not.toContain(g.id);
    expect(await store.passOn(`test-${nanoid(8)}`, now, "time")).toBeNull();
  });

  it("성불: 꾸미기도 같이 보관한다", async () => {
    const g = await add();
    const passed = await store.passOn(g.id, Date.now(), "full");
    expect(passed?.reason).toBe("full");
    expect(passed?.record.decor).toBeUndefined();
  });

  it("묘지 설정: passEpoch는 처음 한 번만 정해지고, 성불 기간을 바꿀 수 있다", async () => {
    const first = await store.settings(1000);
    const again = await store.settings(5000);
    expect(again.passEpoch).toBe(first.passEpoch);
    const before = first.passDays;
    await store.setPassDays(3);
    expect((await store.settings(9000)).passDays).toBe(3);
    await store.setPassDays(before);
  });
}

describe("MemoryStore", () => contract(() => new MemoryStore()));

const redisEnv = env.redis();
describe.skipIf(!redisEnv)("RedisStore (실제 Upstash, 개발용 DB에서만 실행)", () =>
  contract(() => new RedisStore(redisEnv!)),
);

describe.skipIf(!redisEnv)("RedisStore 채널 이관 (실제 Redis)", () => {
  it("채널 개편 전에 graves:meta에 저장된 묘비(채널 필드·graves:ch 없음)는 그대로 1채널 묘비다", async () => {
    const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
    const store = new RedisStore(redisEnv!);
    const legacy = grave();
    await raw.hset("graves:meta", { [legacy.id]: JSON.stringify(legacy) });
    try {
      expect((await store.get(legacy.id))?.channel).toBe(1);
      expect((await store.list(1)).find((r) => r.id === legacy.id)?.channel).toBe(1);
      expect(await store.flower(legacy.id, "v")).toBe(1);
      expect((await listPublic(store, 1)).graves.find((g) => g.id === legacy.id)?.flowers).toBe(1);
    } finally {
      await store.remove(legacy.id);
    }
    expect(await raw.hget("graves:meta", legacy.id)).toBeNull();
  });
});

describe.skipIf(!redisEnv)("RedisStore 성불 보관 (실제 Redis)", () => {
  it("저장된 살려주세요 수·꾸미기도 성불 보관 JSON에 그대로 남는다", async () => {
    const raw = new Redis({ ...redisEnv!, automaticDeserialization: false });
    const store = new RedisStore(redisEnv!);
    const g = grave({ channel: 2 });
    await store.put(g);
    await raw.zadd("ch:2:graves:revive", { score: 7, member: g.id });
    await raw.hset("ch:2:graves:meta", { [`decor:${g.id}`]: JSON.stringify([{ itemId: "candle", until: 9 }]) });
    try {
      const passed = await store.passOn(g.id, 1234, "one");
      expect(passed?.record).toMatchObject({ id: g.id, channel: 2, revives: 7, decor: [{ itemId: "candle", until: 9 }] });
      expect(await raw.zscore("ch:2:graves:revive", g.id)).toBeNull();
      expect(await raw.hget("ch:2:graves:meta", `decor:${g.id}`)).toBeNull();
      expect(await raw.hget("graves:ch", g.id)).toBeNull();
      const back = (await store.passedAll()).find((p) => p.record.id === g.id);
      expect(back).toMatchObject({ passedAt: 1234, reason: "one", record: { revives: 7, decor: [{ itemId: "candle" }] } });
    } finally {
      await store.removePassed(g.id);
    }
  });
});

describe("MemoryStore 전용", () => {
  it("헌화 표시는 24시간 뒤에 풀린다", async () => {
    let now = 1_000_000;
    const store = new MemoryStore([], () => now);
    await store.put(grave({ id: "g" }));
    expect(await store.flower("g", "v")).toBe(1);
    now += 86_400_000 - 1;
    expect(await store.flower("g", "v")).toBe("already");
    now += 1;
    expect(await store.flower("g", "v")).toBe(2);
  });
});

describe("목업 묘비", () => {
  const seed = mockGraves(60, Date.UTC(2026, 10, 8));

  it("모두 실제 입력 검증을 통과하고, 소유자가 없다", () => {
    for (const { grave: g } of seed) {
      const r = GraveInputSchema.safeParse(g);
      expect(r.success, `${g.id}: ${r.error?.issues[0]?.message}`).toBe(true);
      expect(r.data?.ageDays).toBe(g.ageDays);
      expect(g.ownerTokenHash).toBe("");
    }
  });

  it("로컬 확인용으로 1~3채널에 나눠 심는다", () => {
    expect(new Set(seed.map((s) => s.grave.channel))).toEqual(new Set([1, 2, 3]));
  });

  it("생존 기간 4단계가 모두 섞여 있고 등록 순서가 인덱스 순서다", () => {
    const ages = seed.map((s) => s.grave.ageDays);
    expect(ages.some((a) => a < 7)).toBe(true);
    expect(ages.some((a) => a >= 7 && a < 90)).toBe(true);
    expect(ages.some((a) => a >= 90 && a < 365)).toBe(true);
    expect(ages.some((a) => a >= 365)).toBe(true);
    const created = seed.map((s) => s.grave.createdAt);
    expect([...created].sort((a, b) => a - b)).toEqual(created);
    expect(new Set(seed.map((s) => s.grave.id)).size).toBe(60);
  });

  it("시드가 고정이라 매번 같은 묘지가 나온다", () => {
    expect(mockGraves(10, 0)).toEqual(mockGraves(10, 0));
  });
});

describe("listPublic / toPublicGrave / deleteGrave", () => {
  it("숨김 제외, 등록 순 정렬, 살려주세요는 보관만(revives 0, reviveTop 빈 배열), 성불 시각을 넣는다", async () => {
    const store = new MemoryStore([{ grave: grave({ id: "old", createdAt: 500 }), flowers: 2, revives: 7 }]);
    const gs = Array.from({ length: 14 }, (_, i) => grave({ id: `g${i}`, createdAt: 1000 - i }));
    for (const g of gs) await store.put(g);
    await store.setHidden("g0", true);

    const res = await listPublic(store, 1, 42);
    expect(res.generatedAt).toBe(42);
    expect(res.channel).toBe(1);
    expect(res.graves.map((g) => g.id)).toEqual(["old", ...gs.slice(1).map((g) => g.id).reverse()]);
    expect(res.reviveTop).toEqual([]);
    expect(res.graves[0]).toMatchObject({ id: "old", flowers: 2, revives: 0, passAt: 500 + 14 * 86_400_000 });
    expect((await store.get("old"))?.revives).toBe(7); // 저장된 수는 그대로
    for (const g of res.graves) {
      expect(g).not.toHaveProperty("ownerTokenHash");
      expect(g).not.toHaveProperty("hidden");
    }
  });

  it("toPublicGrave는 비밀 필드를 떼어내고 채널을 항상 넣는다", () => {
    const pub = toPublicGrave({ ...grave({ hidden: true, ownerAccountId: "acct" }), flowers: 1, revives: 2 });
    expect(pub).not.toHaveProperty("ownerTokenHash");
    expect(pub).not.toHaveProperty("hidden");
    expect(pub).not.toHaveProperty("ownerAccountId");
    expect(pub).toMatchObject({ flowers: 1, revives: 0, channel: 1 });
    expect(pub).not.toHaveProperty("passAt");
    expect(toPublicGrave({ ...grave({ channel: 3 }), flowers: 0, revives: 0 }).channel).toBe(3);
  });

  it("채널별 목록, 최근 성불(passed)도 그 채널 것만", async () => {
    const store = new MemoryStore();
    await store.put(grave({ id: "a", channel: 1 }));
    await store.put(grave({ id: "b", channel: 2 }));
    await store.put(grave({ id: "c", channel: 2 }));
    await store.passOn("c", 100, "time");
    expect(await listPublic(store, 1, 200)).toMatchObject({ channel: 1, reviveTop: [], graves: [{ id: "a", channel: 1 }] });
    expect((await listPublic(store, 1, 200)).passed).toBeUndefined();
    expect(await listPublic(store, 2, 200)).toMatchObject({ channel: 2, passed: ["c"], graves: [{ id: "b", channel: 2 }] });
    // 10분이 지나면 빛 연출 목록에서 빠진다
    expect((await listPublic(store, 2, 100 + 10 * 60_000 + 1)).passed).toBeUndefined();
    expect((await listPublic(store, 3, 0)).graves).toEqual([]);
  });

  it("deleteGrave: 있으면 true, 없으면 false", async () => {
    const store = new MemoryStore();
    await store.put(grave({ id: "d" }));
    expect(await deleteGrave(store, "d")).toBe(true);
    expect(await deleteGrave(store, "d")).toBe(false);
  });
});
