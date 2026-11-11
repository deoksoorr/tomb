import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterEach, describe, expect, it } from "vitest";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, EARN_RULES, type EarnSource } from "../economy";
import { env } from "../env";
import type { Grave } from "../types";
import { kstDay, kstWeek, kstYesterday, weekOfDay } from "./accounts";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { K } from "./keys";
import { MemoryStore } from "./memory";
import { RedisStore } from "./redis";
import { PRESENCE_MIN_GAP_MS, type AccountStore, type GraveStore } from "./types";

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

  it("하루 전체 한도: 모든 항목을 한도까지 받아도 하루 상한을 넘지 않는다 (사냥은 점수를 직접 준다)", async () => {
    const id = newId();
    const plan = [
      ["hunt", 1, 600],
      ["attend", 1],
      ["streak", 1],
      ["flower", 10],
      ["bury", 1],
      ["presence", 12],
      ["gotFlower", 20],
      ["houseLike", 10],
    ] as const;
    let total = 0;
    for (const [source, times, amount] of plan as readonly (readonly [EarnSource, number, number?])[])
      for (let i = 0; i < times; i++) total += await accounts.earn(id, source, DAY, { amount });
    // 49번에서 살려주세요 항목(10+20)이 빠져 항목 한도 합(780)이 하루 상한(800)보다 작아졌다
    const cap = Math.min(DAILY_EARN_CAP, EARN_RULES.reduce((n, r) => n + r.dailyMax, 0));
    expect(total).toBe(cap);
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ points: cap, todayEarned: cap, lifetimePoints: cap });
    expect(await accounts.earn(id, "flower", DAY)).toBe(0);
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
    expect(results.filter((r) => r === "ok")).toHaveLength(3);
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
    expect(await accounts.equip(id, "hat_straw", "head", 5000, 0)).toBe(true);
    expect(await accounts.equip(id, "neck_scarf", "neck", 1500, 0)).toBe(true);
    expect(await accounts.equip(id, "hat_cat", "head", 6000, 0)).toBe(true);
    expect((await accounts.get(id, DAY, 1000)).equipped.sort((a, b) => a.until - b.until)).toEqual([
      { itemId: "neck_scarf", until: 1500 },
      { itemId: "hat_cat", until: 6000 },
    ]);
    expect((await accounts.get(id, DAY, 2000)).equipped).toEqual([{ itemId: "hat_cat", until: 6000 }]);
    expect(await accounts.equip(id, "hat_cat", "head", 9000, 0)).toBe(false);
    expect((await accounts.get(id, DAY, 0)).inventory).toEqual({});
  });

  it("벗어 둔 꾸미기: 같은 부위에 새로 입으면 입던 것은 남은 시간 그대로 stash로, 만료된 것은 버린다", async () => {
    const id = newId();
    await kit.setPoints(id, 1000);
    for (const item of ["hat_straw", "hat_cat", "hat_flower"]) await accounts.buy(id, item, 10, { unique: true, now: 0 });
    expect(await accounts.equip(id, "hat_straw", "head", 5000, 0)).toBe(true);
    expect(await accounts.equip(id, "hat_cat", "head", 8000, 100)).toBe(true);
    let a = await accounts.get(id, DAY, 200);
    expect(a.equipped).toEqual([{ itemId: "hat_cat", until: 8000 }]);
    expect(a.stash).toEqual([{ itemId: "hat_straw", until: 5000 }]);
    // 만료된 입던 것은 stash로 가지 않는다 (hat_cat은 아직 8000까지라 stash로)
    expect(await accounts.equip(id, "hat_flower", "head", 9000, 6000)).toBe(true);
    a = await accounts.get(id, DAY, 6000);
    expect(a.equipped).toEqual([{ itemId: "hat_flower", until: 9000 }]);
    expect(a.stash).toEqual([{ itemId: "hat_cat", until: 8000 }]);
    // 남은 시간은 벗어 둔 동안에도 흐른다
    expect((await accounts.get(id, DAY, 8000)).stash).toEqual([]);
    expect(await accounts.wear(id, "hat_cat", "head", 8000)).toBe(false);
  });

  it("다시 입기·벗기: wear는 stash와 자리를 바꾸고, unequip은 stash로, 한 아이템은 한 곳에만", async () => {
    const id = newId();
    await kit.setPoints(id, 1000);
    for (const item of ["hat_straw", "hat_cat", "neck_scarf"]) await accounts.buy(id, item, 10, { unique: true, now: 0 });
    await accounts.equip(id, "hat_straw", "head", 5000, 0);
    await accounts.equip(id, "hat_cat", "head", 8000, 0);
    await accounts.equip(id, "neck_scarf", "neck", 7000, 0);

    expect(await accounts.wear(id, "hat_straw", "head", 100)).toBe(true);
    let a = await accounts.get(id, DAY, 100);
    expect(a.equipped.sort((x, y) => x.until - y.until)).toEqual([
      { itemId: "hat_straw", until: 5000 },
      { itemId: "neck_scarf", until: 7000 },
    ]);
    expect(a.stash).toEqual([{ itemId: "hat_cat", until: 8000 }]);
    // 이미 입고 있는 것은 stash에 없으므로 false (아무것도 바뀌지 않는다)
    expect(await accounts.wear(id, "hat_straw", "head", 100)).toBe(false);
    expect(await accounts.wear(id, "hat_halo", "head", 100)).toBe(false);

    expect(await accounts.unequip(id, "neck", 200)).toBe(true);
    expect(await accounts.unequip(id, "neck", 200)).toBe(false);
    expect(await accounts.unequip(id, "pet", 200)).toBe(false);
    a = await accounts.get(id, DAY, 200);
    expect(a.equipped).toEqual([{ itemId: "hat_straw", until: 5000 }]);
    expect(a.stash).toEqual([
      { itemId: "neck_scarf", until: 7000 },
      { itemId: "hat_cat", until: 8000 },
    ]);
    // 빈 부위에 다시 입기, 만료된 착용품은 벗을 수 없다
    expect(await accounts.wear(id, "neck_scarf", "neck", 300)).toBe(true);
    expect(await accounts.unequip(id, "head", 5000)).toBe(false);
    a = await accounts.get(id, DAY, 5000);
    expect(a.equipped).toEqual([{ itemId: "neck_scarf", until: 7000 }]);
    expect(a.stash).toEqual([{ itemId: "hat_cat", until: 8000 }]);
    for (const e of a.equipped) expect(a.stash.some((s) => s.itemId === e.itemId)).toBe(false);
  });

  it("동시에 여러 번 벗고 입어도 아이템이 늘거나 사라지지 않는다", async () => {
    const id = newId();
    await kit.setPoints(id, 1000);
    for (const item of ["hat_straw", "hat_cat"]) await accounts.buy(id, item, 10, { unique: true, now: 0 });
    await accounts.equip(id, "hat_straw", "head", 5000, 0);
    await accounts.equip(id, "hat_cat", "head", 8000, 0);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        i % 3 === 0
          ? accounts.unequip(id, "head", 100)
          : accounts.wear(id, i % 3 === 1 ? "hat_straw" : "hat_cat", "head", 100),
      ),
    );
    const a = await accounts.get(id, DAY, 100);
    expect([...a.equipped, ...a.stash].map((e) => e.itemId).sort()).toEqual(["hat_cat", "hat_straw"]);
    expect(a.equipped.length).toBeLessThanOrEqual(1);
  });

  it("벗어 둔 꾸미기도 가진 것: 다시 살 수 없고, 만료되면 살 수 있다", async () => {
    const id = newId();
    await kit.setPoints(id, 1000);
    await accounts.buy(id, "hat_cat", 50, { unique: true, now: 0 });
    await accounts.equip(id, "hat_cat", "head", 5000, 0);
    await accounts.unequip(id, "head", 100);
    expect(await accounts.buy(id, "hat_cat", 50, { unique: true, now: 4999 })).toBe("owned");
    expect(await accounts.buy(id, "hat_cat", 50, { unique: true, now: 5000 })).toBe("ok");
    // 가방의 새 것을 입으면 stash에 남은(만료 전) 같은 아이템은 지운다 → 한 곳에만
    await accounts.equip(id, "hat_cat", "head", 9000, 0);
    const a = await accounts.get(id, DAY, 0);
    expect(a.equipped).toEqual([{ itemId: "hat_cat", until: 9000 }]);
    expect(a.stash).toEqual([]);
  });

  it("출석: 하루 1번, 연속이면 streak+1, 7일째 보너스(+30), 끊기면 1부터. 이름 저장", async () => {
    const id = newId();
    const ip = `ip-${nanoid(6)}`;
    const d = days(9);
    const earned: number[] = [];
    for (let i = 0; i < 7; i++) earned.push(await accounts.attend(id, ip + i, i === 0 ? { name: "새벽코더" } : {}, d[i], d[i - 1] ?? ""));
    expect(earned).toEqual([10, 10, 10, 10, 10, 10, 40]);
    expect(await accounts.attend(id, ip, {}, d[6], d[5])).toBe(0);
    expect(await accounts.get(id, d[6], 0)).toMatchObject({ streak: 7, name: "새벽코더", lastAttend: d[6] });
    // 하루 건너뛰면 다시 1일째
    expect(await accounts.attend(id, `${ip}-x`, {}, d[8], d[7])).toBe(10);
    expect((await accounts.get(id, d[8], 0)).streak).toBe(1);
  });

  it(`같은 IP에서는 하루 ${ATTEND_ACCOUNTS_PER_IP}개 계정까지만 출석 포인트 (출석 기록은 남는다)`, async () => {
    const ip = `ip-${nanoid(6)}`;
    const ids = Array.from({ length: ATTEND_ACCOUNTS_PER_IP + 1 }, newId);
    const earned = [];
    for (const id of ids) earned.push(await accounts.attend(id, ip, {}, DAY, "20261107"));
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
      expect(await accounts.placeDecor(id, `t-${nanoid(8)}`, 1, "decor_candles", 10_000, 0)).toBeNull();
      expect(await accounts.placeDecor(id, gid, 1, "decor_candles", 10_000, 0)).toBe("no_item");
      await kit.setPoints(id, 1000);
      for (let i = 0; i < 5; i++) await accounts.buy(id, "decor_candles", 30);

      for (const until of [1000, 2000, 3000]) await accounts.placeDecor(id, gid, 1, "decor_candles", until, 0);
      expect(await accounts.placeDecor(id, gid, 1, "decor_candles", 4000, 0)).toEqual(
        [2000, 3000, 4000].map((until) => ({ itemId: "decor_candles", until })),
      );
      expect(await accounts.placeDecor(id, gid, 1, "decor_candles", 9000, 3500)).toEqual([
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
    expect((await graves.listAll()).some((g) => g.id === gid)).toBe(false);
  });

  it("디자인권 1개로 묘비 2개를 동시에 세우면 하나만 저장된다", async () => {
    const id = newId();
    const [a, b] = [`t-${nanoid(8)}`, `t-${nanoid(8)}`];
    try {
      await kit.setPoints(id, 100);
      await accounts.buy(id, "gs_coffee", 100);
      const results = await Promise.all([a, b].map((gid) => accounts.putGraveUsing(id, "gs_coffee", { ...grave(gid), style: "coffee" })));
      expect(results.filter(Boolean)).toHaveLength(1);
      const saved = await Promise.all([a, b].map((gid) => graves.get(gid)));
      expect(saved.filter(Boolean)).toHaveLength(1);
      expect(saved.find(Boolean)?.style).toBe("coffee");
      expect((await accounts.get(id, DAY, 0)).inventory).toEqual({});
      expect(await accounts.putGraveUsing(id, "gs_coffee", grave(`t-${nanoid(8)}`))).toBe(false);
    } finally {
      await Promise.all([a, b].map((gid) => graves.remove(gid)));
    }
  });

  it("관리자 포인트 조정: 0~9,999로 자르고 하루 적립 한도와 무관, 없는 계정은 null", async () => {
    const id = newId();
    expect(await accounts.adjustPoints(id, 100)).toBeNull();
    await accounts.earn(id, "flower", DAY);
    expect(await accounts.adjustPoints(id, 500)).toBe(502);
    expect(await accounts.adjustPoints(id, -9999)).toBe(0);
    expect(await accounts.adjustPoints(id, 9999)).toBe(BALANCE_CAP);
    expect(await accounts.adjustPoints(id, 50)).toBe(BALANCE_CAP);
    expect((await accounts.get(id, DAY, 0)).todayEarned).toBe(2);
  });

  it("모은 포인트·랭킹: 적립과 관리자 지급은 올리고, 쓰면 잔액만 준다", async () => {
    const [a, b] = [newId(), newId()];
    await accounts.earn(a, "hunt", DAY, { amount: 50 });
    await accounts.earn(b, "hunt", DAY, { amount: 80 });
    expect(await accounts.spend(b, 70, "rpg:무기", 1)).toBe(10);
    expect(await accounts.get(b, DAY, 0)).toMatchObject({ points: 10, lifetimePoints: 80 });
    await accounts.adjustPoints(a, 100);
    await accounts.adjustPoints(a, -100);
    expect(await accounts.get(a, DAY, 0)).toMatchObject({ points: 50, lifetimePoints: 150 });

    const { rows, mine } = await accounts.pointRank(500, b);
    const order = rows.filter((r) => r.accountId === a || r.accountId === b).map((r) => r.accountId);
    expect(order).toEqual([a, b]);
    expect(mine).toMatchObject({ accountId: b, points: 80 });
    expect(rows.find((r) => r.accountId === b)?.rank).toBe(mine!.rank);
    expect((await accounts.pointRank(500, `t-${nanoid(10)}`)).mine).toBeNull();
  });

  it("돌려주기: 잔액만 늘고(지갑 상한에서 잘림) 모은 포인트·랭킹·오늘 적립은 그대로", async () => {
    const id = newId();
    await accounts.earn(id, "hunt", DAY, { amount: 100 });
    await accounts.spend(id, 60, "housing:sofa", 0);
    expect(await accounts.refund(id, 30, "housing:refund", 0)).toBe(70);
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ points: 70, lifetimePoints: 100, todayEarned: 100 });
    expect((await accounts.pointRank(1000, id)).mine?.points).toBe(100);
    await kit.setPoints(id, BALANCE_CAP - 5);
    expect(await accounts.refund(id, 50, "housing:refund", 0)).toBe(BALANCE_CAP);
  });

  it("포인트 쓰기: 20번 동시에 써도 잔액만큼만, 음수가 되지 않는다", async () => {
    const id = newId();
    await kit.setPoints(id, 100);
    const left = await Promise.all(Array.from({ length: 20 }, () => accounts.spend(id, 30, "test", 0)));
    expect(left.filter((x) => x !== null)).toHaveLength(3);
    expect((await accounts.get(id, DAY, 0)).points).toBe(10);
  });

  it("같은 IP 합계는 항목 한도 × 3 (계정 여러 개로 농사 방지), IP를 안 주면 계정 한도만", async () => {
    const ip = `ip-${nanoid(6)}`;
    const got = [];
    for (let i = 0; i < 4; i++) got.push(await accounts.earn(newId(), "hunt", DAY, { amount: 600, ipHash: ip }));
    expect(got).toEqual([600, 600, 600, 0]);
    expect(await accounts.earn(newId(), "hunt", DAY, { amount: 600 })).toBe(600);
  });

  it("머무르기: 9.5분 간격, 하루 60점까지", async () => {
    const id = newId();
    const t0 = 1_000_000_000;
    expect(await accounts.presence(id, DAY, t0)).toBe(5);
    expect(await accounts.presence(id, DAY, t0 + PRESENCE_MIN_GAP_MS - 1)).toBeNull();
    let total = 5;
    for (let i = 1; i <= 13; i++) total += (await accounts.presence(id, DAY, t0 + i * PRESENCE_MIN_GAP_MS)) ?? 0;
    expect(total).toBe(60);
  });

  it("캐릭터 꾸미기 중복 구매 금지: 가방에 있거나 착용 중이면 owned (동시에 사도 하나만), 다른 건 여러 개", async () => {
    const id = newId();
    await kit.setPoints(id, 1000);
    const many = await Promise.all(Array.from({ length: 5 }, () => accounts.buy(id, "hat_cat", 50, { unique: true, now: 0 })));
    expect(many.filter((r) => r === "ok")).toHaveLength(1);
    expect(many.filter((r) => r === "owned")).toHaveLength(4);
    await accounts.equip(id, "hat_cat", "head", 5000, 0);
    expect(await accounts.buy(id, "hat_cat", 50, { unique: true, now: 4999 })).toBe("owned");
    expect(await accounts.buy(id, "hat_cat", 50, { unique: true, now: 5000 })).toBe("ok");
    expect(await accounts.buy(id, "fw_small", 30)).toBe("ok");
    expect(await accounts.buy(id, "fw_small", 30)).toBe("ok");
    expect((await accounts.get(id, DAY, 0)).points).toBe(1000 - 100 - 60);
  });

  it("출석의 이름·색·몸 모양은 비어 있을 때만 저장", async () => {
    const id = newId();
    await accounts.attend(id, `ip-${nanoid(6)}`, { name: "새벽코더", color: "#9fc5a8", body: "cat" }, DAY, "20261107");
    await accounts.attend(id, `ip-${nanoid(6)}`, { name: "다른이름", color: "#e0c36a", body: "tall" }, "20261109", DAY);
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ name: "새벽코더", color: "#9fc5a8", body: "cat" });
  });

  it("v4 내 소식: 최신 50개, 읽음 시각은 되돌리지 않고, get()의 activityUnread", async () => {
    const id = newId();
    for (let i = 1; i <= 55; i++)
      await accounts.pushActivity(id, { id: `a${i}`, kind: "flower", at: i * 1000, who: "누군가", targetId: "g", targetName: "무덤" });
    const { items, lastSeenAt } = await accounts.activity(id);
    expect(items).toHaveLength(50);
    expect(items[0]).toEqual({ id: "a55", kind: "flower", at: 55_000, who: "누군가", targetId: "g", targetName: "무덤" });
    expect(lastSeenAt).toBe(0);
    expect(await accounts.seeActivity(id, 50_000)).toBe(50_000);
    expect(await accounts.seeActivity(id, 10_000)).toBe(50_000);
    expect((await accounts.get(id, DAY, 0)).activityUnread).toBe(5);
  });

  it("v4 닉네임 변경: 첫 번째 무료 → 쿨다운 → 포인트 부족 → 유료, 동시 요청은 하나만", async () => {
    const id = newId();
    const t0 = Date.parse("2026-11-08T03:00:00Z");
    const WEEK = 7 * 86_400_000;
    expect(await accounts.changeName(id, "하나둘", t0, 100, WEEK)).toEqual({ ok: true, cost: 0 });
    expect(await accounts.changeName(id, "셋넷", t0 + 1, 100, WEEK)).toEqual({ ok: false, reason: "cooldown", nextAllowedAt: t0 + WEEK });
    expect(await accounts.changeName(id, "셋넷", t0 + WEEK, 100, WEEK)).toEqual({ ok: false, reason: "points" });
    await kit.setPoints(id, 250);
    const race = await Promise.all([0, 1, 2].map((i) => accounts.changeName(id, `이름${i}`, t0 + WEEK, 100, WEEK)));
    expect(race.filter((r) => r.ok)).toHaveLength(1);
    const a = await accounts.get(id, DAY, 0);
    expect(a).toMatchObject({ points: 150, nameChangedAt: t0 + WEEK, nameChanges: 2 });
    expect(a.name).toMatch(/^이름\d$/);
  });

  it("v4 튜토리얼 완료", async () => {
    const id = newId();
    expect((await accounts.get(id, DAY, 0)).tutorialDone).toBeFalsy();
    await accounts.setTutorialDone(id);
    expect((await accounts.get(id, DAY, 0)).tutorialDone).toBe(true);
  });

  it("v4 경제 통계: 적립·사용(분류)·환불·관리자 조정이 그날 필드에 더해지고, 지갑 합계", async () => {
    const id = newId();
    const now = Date.now(); // 관리자 조정·구매는 지금 날짜로 센다
    const today = kstDay(now);
    const stat = async () => (await accounts.economy([today, DAY]))[0].fields;
    const walletsBefore = await accounts.walletTotals();
    const before = await stat();
    await accounts.earn(id, "flower", today);
    await accounts.earn(id, "flower", today);
    await accounts.adjustPoints(id, 300);
    await accounts.spend(id, 30, "rpg:entry", now);
    await accounts.spend(id, 20, "housing:furniture", now);
    await accounts.spend(id, 9999, "shop:too-much", now); // 실패는 세지 않는다
    await accounts.refund(id, 5, "housing:sell", now);
    await accounts.adjustPoints(id, -7);
    await accounts.buy(id, "fw_small", 30);
    const after = await stat();
    const d = (f: string) => (after[f] ?? 0) - (before[f] ?? 0);
    expect([d("earn:flower"), d("earn:admin"), d("spend:rpg"), d("spend:housing"), d("refund"), d("spend:admin"), d("spend:shop")]).toEqual([
      4, 300, 30, 20, 5, 7, 30,
    ]);
    expect((await accounts.economy([today, "20261107"])).map((r) => r.date)).toEqual([today, "20261107"]);
    const walletsAfter = await accounts.walletTotals();
    expect(walletsAfter.accounts - walletsBefore.accounts).toBe(1);
    expect(walletsAfter.wallets - walletsBefore.wallets).toBe(4 + 300 - 30 - 20 + 5 - 7 - 30);
  });

  it("내 묘비 목록", async () => {
    const id = newId();
    await accounts.addGrave(id, "g1");
    await accounts.addGrave(id, "g2");
    await accounts.removeGrave(id, "g1");
    expect((await accounts.get(id, DAY, 0)).graves).toEqual(["g2"]);
  });

  it("주간 포인트 랭킹: 적립(출석·머무르기 포함)이 그 주(KST 월요일)에 쌓이고 다음 주는 따로", async () => {
    const a = newId();
    const b = newId();
    const week = weekOfDay(DAY);
    await accounts.earn(a, "flower", DAY);
    await accounts.earn(a, "flower", DAY);
    await accounts.earn(b, "bury", DAY);
    await accounts.presence(a, DAY, 1_000_000_000);
    await accounts.attend(b, `ip-${nanoid(6)}`, {}, DAY, "20261107");
    // 다음 주 월요일
    await accounts.earn(a, "flower", "20261116");
    const mine = (await accounts.pointRank(10_000, a, week)).mine;
    expect(mine?.points).toBe(2 + 2 + 5);
    expect((await accounts.pointRank(10_000, b, week)).mine?.points).toBe(20 + 10);
    expect((await accounts.pointRank(10_000, a, weekOfDay("20261116"))).mine?.points).toBe(2);
    expect((await accounts.pointRank(10_000, a)).mine?.points).toBe(11); // 전체 = 모은 포인트
    const { rows } = await accounts.pointRank(10_000, null, week);
    const ra = rows.find((r) => r.accountId === a)!;
    const rb = rows.find((r) => r.accountId === b)!;
    expect(rb.rank).toBeLessThan(ra.rank);
  });

  it("사냥 기록: 처치 수는 더하고, 최단 클리어는 더 짧을 때만 바뀐다 (전체·주간, 사냥터별)", async () => {
    const a = newId();
    const b = newId();
    const week = weekOfDay(DAY);
    const nextWeek = weekOfDay("20261116");
    await accounts.recordHunt(a, "easy", { kills: 30, clearMs: 90_000 }, week);
    await accounts.recordHunt(a, "easy", { kills: 12, clearMs: 120_000 }, week); // 더 느림 → 그대로
    await accounts.recordHunt(a, "easy", { kills: 5, clearMs: null }, nextWeek); // 클리어 못 함
    await accounts.recordHunt(b, "easy", { kills: 40, clearMs: 80_000 }, week);
    await accounts.recordHunt(b, "hard", { kills: 3, clearMs: 200_000 }, nextWeek);

    expect((await accounts.huntRank("kills", 10_000, a, {})).mine?.points).toBe(47);
    expect((await accounts.huntRank("kills", 10_000, a, { week })).mine?.points).toBe(42);
    expect((await accounts.huntRank("kills", 10_000, a, { week: nextWeek })).mine?.points).toBe(5);
    expect((await accounts.huntRank("best", 10_000, a, { zone: "easy" })).mine?.points).toBe(90_000);
    expect((await accounts.huntRank("best", 10_000, a, { zone: "easy", week: nextWeek })).mine).toBeNull();
    expect((await accounts.huntRank("best", 10_000, b, { zone: "hard" })).mine?.points).toBe(200_000);
    expect((await accounts.huntRank("best", 10_000, a, { zone: "hard" })).mine).toBeNull();
    // 최단 기록은 작을수록 위
    const best = await accounts.huntRank("best", 10_000, null, { zone: "easy", week });
    const ra = best.rows.find((r) => r.accountId === a)!;
    const rb = best.rows.find((r) => r.accountId === b)!;
    expect(rb.rank).toBeLessThan(ra.rank);
    expect(rb.points).toBe(80_000);
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
        const members = ids.filter((id) => !id.startsWith("code:"));
        if (!members.length) return;
        // 공용 랭킹 ZSET에서 테스트 계정을 뺀다
        const boards = (await raw.keys("rank:*")) as string[];
        await Promise.all(boards.map((k) => raw.zrem(k, ...members)));
      },
    };
  }));

describe("KST 날짜 키", () => {
  it("주 키는 그 주 월요일 (KST)", () => {
    expect(weekOfDay("20261112")).toBe("20261109"); // 목 → 월
    expect(weekOfDay("20261109")).toBe("20261109"); // 월
    expect(weekOfDay("20261115")).toBe("20261109"); // 일 → 그 주 월
    expect(weekOfDay("20261116")).toBe("20261116");
    expect(weekOfDay("20260301")).toBe("20260223"); // 달을 넘어간다
    expect(kstWeek(Date.UTC(2026, 10, 15, 15, 1))).toBe("20261116"); // 11/16(월) 00:01 KST
  });

  it("한국 자정 기준으로 오늘·어제를 YYYYMMDD로", () => {
    const justAfterMidnightKst = Date.UTC(2026, 10, 7, 15, 1); // 11/8 00:01 KST
    expect(kstDay(justAfterMidnightKst)).toBe("20261108");
    expect(kstYesterday(justAfterMidnightKst)).toBe("20261107");
    expect(kstDay(Date.UTC(2026, 10, 7, 14, 59))).toBe("20261107");
    expect(kstYesterday(Date.UTC(2026, 2, 1, 0, 0))).toBe("20260228");
  });
});
