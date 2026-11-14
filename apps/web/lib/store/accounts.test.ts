import { Redis } from "@upstash/redis";
import { nanoid } from "nanoid";
import { afterEach, describe, expect, it } from "vitest";
import { nameKey, PERMANENT_UNTIL } from "@tomb/protocol";
import { attendTierPlan } from "../attendTiers";
import { calendarOf, grantAttendTiers } from "../calendarView";
import { ATTEND_ACCOUNTS_PER_IP, BALANCE_CAP, DAILY_EARN_CAP, EARN_RULES, earnRule, type EarnSource } from "../economy";
import { env } from "../env";
import type { Grave } from "../types";
import { kstDay, kstWeek, kstYesterday, weekOfDay } from "./accounts";
import { MemoryAccounts } from "./accounts-memory";
import { RedisAccounts } from "./accounts-redis";
import { K } from "./keys";
import { MemoryStore } from "./memory";
import { RedisStore } from "./redis";
import { DORMANT_MS, PRESENCE_CATCHUP_WINDOW_MS, PRESENCE_MIN_GAP_MS, PRESENCE_TICK_MS, presenceCatchup, type AccountStore, type GraveStore } from "./types";

type Kit = {
  graves: GraveStore;
  accounts: AccountStore;
  setPoints(id: string, n: number): Promise<void>;
  /** 달력 개편 전 계정처럼 마지막 출석일·연속 일수만 넣는다 */
  setLegacyAttend(id: string, lastAttend: string, streak: number): Promise<void>;
  /** 이름 색인을 만들기 전 계정처럼 이름만 넣는다 (색인·마지막 입장 기록 없음) */
  setLegacyName(id: string, name: string): Promise<void>;
  /** 테스트 계정이 차지한 이름 색인도 함께 지운다 */
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
  /** 하루 전체 합계에 드는 항목을 모두 한도까지 채운다 (= DAILY_EARN_CAP) */
  const fillDay = async (id: string) => {
    for (const r of EARN_RULES) if (!["attend", "streak", "monthly", "stayBonus"].includes(r.source)) await accounts.earn(id, r.source, DAY, { amount: r.dailyMax });
  };

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
    // 낚시·채집·도감·고블린·소원 분수(4·22·32·50·51번)처럼 항목이 늘어도 이 계획이 받는 항목들의 한도 합으로 잰다
    const planned = new Set<string>(plan.map(([source]) => source));
    const cap = Math.min(DAILY_EARN_CAP, EARN_RULES.filter((r) => planned.has(r.source)).reduce((n, r) => n + r.dailyMax, 0));
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

  // ── 10번 출석 달력 ──
  /** 머무르기 기록을 n번 남긴다 (10분 간격, 계정마다 시계가 앞으로만 간다) */
  const clock = new Map<string, number>();
  async function stay(id: string, day: string, n: number) {
    for (let i = 0; i < n; i++) {
      const t = (clock.get(id) ?? 1_000_000_000) + 600_000;
      clock.set(id, t);
      expect(await accounts.presence(id, day, t)).not.toBeNull();
    }
  }
  const claim = (id: string, ip: string, day: string, yesterday: string, monthDays = 30) =>
    accounts.claimAttend(id, ip, day, yesterday, monthDays, 6);

  it("출석 달력: 1시간(머무르기 6번) 전엔 못 받고, 하루 1번, 연속 7일째 +30, 끊기면 1부터", async () => {
    const id = newId();
    const d = days(9);
    await accounts.enter(id, { name: "새벽코더" }, 1);
    await stay(id, d[0], 5);
    expect(await claim(id, "ip-a", d[0], "")).toEqual({ ok: false, reason: "stay", stayTicks: 5 });
    expect((await accounts.get(id, d[0], 0)).stayTicks).toBe(5);
    const earned: number[] = [];
    for (let i = 0; i < 7; i++) {
      await stay(id, d[i], i === 0 ? 1 : 6);
      const r = await claim(id, `ip-${nanoid(6)}`, d[i], d[i - 1] ?? "");
      if (!r.ok) throw new Error(r.reason);
      earned.push(r.earned.daily + r.earned.streak);
    }
    expect(earned).toEqual([10, 10, 10, 10, 10, 10, 40]);
    expect(await claim(id, "ip-a", d[6], d[5])).toEqual({ ok: false, reason: "already" });
    expect(await accounts.get(id, d[6], 0)).toMatchObject({ streak: 7, name: "새벽코더", lastAttend: d[6] });
    const cal = await accounts.attendCalendar(id, "202611");
    expect(cal).toEqual({ days: { "01": 10, "02": 10, "03": 10, "04": 10, "05": 10, "06": 10, "07": 40 }, monthBonus: null, tiers: {} });
    // 하루 건너뛰면 다시 1일째
    await stay(id, d[8], 6);
    const again = await claim(id, "ip-b", d[8], d[7]);
    expect(again).toMatchObject({ ok: true, streak: 1, earned: { daily: 10, streak: 0, monthly: 0 } });
  });

  it("출석 달력 보상은 하루 전체 한도에 막히지 않는다 (항목 한도만)", async () => {
    const id = newId();
    await fillDay(id);
    expect((await accounts.get(id, DAY, 0)).todayEarned).toBe(DAILY_EARN_CAP);
    await stay(id, DAY, 6); // 머무르기 포인트는 하루 한도에 막히지만 머문 기록은 쌓인다
    expect((await accounts.get(id, DAY, 0)).stayTicks).toBe(6);
    expect(await claim(id, "ip-c", DAY, "20261107")).toMatchObject({ ok: true, earned: { daily: 10 } });
  });

  it("하루 한도는 항목마다 따로: 낚시·채집을 다 팔아도 사냥 한도는 끝까지 (11/14 사냥 380P 멈춤)", async () => {
    const id = newId();
    await accounts.earn(id, "presence", DAY, { amount: earnRule("presence").dailyMax });
    await accounts.earn(id, "fish", DAY, { amount: earnRule("fish").dailyMax });
    await accounts.earn(id, "gather", DAY, { amount: earnRule("gather").dailyMax });
    expect(await accounts.earn(id, "hunt", DAY, { amount: earnRule("hunt").dailyMax })).toBe(earnRule("hunt").dailyMax);
  });

  it(`같은 IP에서는 하루 ${ATTEND_ACCOUNTS_PER_IP}개 계정까지만 출석 포인트 (도장은 남는다)`, async () => {
    const ip = `ip-${nanoid(6)}`;
    const ids = Array.from({ length: ATTEND_ACCOUNTS_PER_IP + 1 }, newId);
    const earned = [];
    for (const id of ids) {
      await stay(id, DAY, 6);
      const r = await claim(id, ip, DAY, "20261107");
      earned.push(r.ok ? r.earned.daily : -1);
    }
    expect(earned).toEqual([...Array<number>(ATTEND_ACCOUNTS_PER_IP).fill(10), 0]);
    expect((await accounts.get(ids.at(-1)!, DAY, 0)).lastAttend).toBe(DAY);
    expect((await accounts.attendCalendar(ids.at(-1)!, "202611")).days).toEqual({ "08": 0 });
  });

  it("한 달 개근: 그달 모든 날을 찍은 날 한 번 +200 (달력 개편 전 출석도 이어서 센다)", async () => {
    const id = newId();
    // 11/1~11/5는 개편 전 자동 출석으로 받았다 (마지막 출석 11/5, 5일 연속)
    await kit.setLegacyAttend(id, "20261105", 5);
    expect((await accounts.attendCalendar(id, "202611")).days).toEqual({ "01": 0, "02": 0, "03": 0, "04": 0, "05": 0 });
    // 오늘(11/5)은 이미 받았다 → 옛 자동 출석과 겹쳐 두 번 주지 않는다
    expect(await claim(id, "ip-x", "20261105", "20261104")).toEqual({ ok: false, reason: "already" });
    const d = days(30);
    let monthly = 0;
    let streak = 0;
    for (let i = 5; i < 30; i++) {
      await stay(id, d[i], 6);
      const r = await claim(id, `ip-${nanoid(6)}`, d[i], d[i - 1]);
      if (!r.ok) throw new Error(r.reason);
      monthly += r.earned.monthly;
      if (i < 29) expect(r.earned.monthly).toBe(0);
      streak = r.streak;
    }
    expect(monthly).toBe(200);
    expect(streak).toBe(30);
    const cal = await accounts.attendCalendar(id, "202611");
    expect(Object.keys(cal.days)).toHaveLength(30);
    expect(cal.monthBonus).toBe(200);
  });

  // ── 출석 구간 코디 보상 (lib/attendTiers.ts) ──
  const TT = 1_790_000_000_000;
  const D = 86_400_000;
  /** 11월 1일부터 이어서 n일째까지 출석 도장을 찍는다 (이미 찍은 날은 건너뛴다) */
  const stampedUpTo = new Map<string, number>();
  async function stampDays(id: string, n: number) {
    const d = days(n);
    for (let i = stampedUpTo.get(id) ?? 0; i < n; i++) {
      await stay(id, d[i], 6);
      const r = await claim(id, `ip-${nanoid(6)}`, d[i], d[i - 1] ?? "");
      if (!r.ok) throw new Error(r.reason);
    }
    stampedUpTo.set(id, Math.max(n, stampedUpTo.get(id) ?? 0));
  }
  const owned = async (id: string, itemId: string, now: number) => {
    const a = await accounts.get(id, DAY, now);
    return [...a.equipped, ...a.stash].find((e) => e.itemId === itemId)?.until ?? 0;
  };

  it("출석 구간 코디: 도장 수가 모자라면 못 받고, 닿으면 그 구간 한 번만 (기록이 달력에 남는다)", async () => {
    const id = newId();
    await stampDays(id, 2);
    expect(await accounts.grantAttendTier(id, "202611", 3, "hat_sprout", "head", 3 * D, TT)).toBe(false);
    await stampDays(id, 3);
    expect(await accounts.grantAttendTier(id, "202611", 3, "hat_sprout", "head", 3 * D, TT)).toBe(true);
    // 같은 구간은 다른 꾸미기로도 다시 받을 수 없다
    expect(await accounts.grantAttendTier(id, "202611", 3, "hat_sprout", "head", 3 * D, TT)).toBe(false);
    expect(await accounts.grantAttendTier(id, "202611", 3, "neck_scarf", "neck", 3 * D, TT)).toBe(false);
    expect(await owned(id, "hat_sprout", TT)).toBe(TT + 3 * D);
    expect(await owned(id, "neck_scarf", TT)).toBe(0);
    const cal = await accounts.attendCalendar(id, "202611");
    expect(cal.tiers).toEqual({ "3": "hat_sprout" });
    expect(Object.keys(cal.days)).toHaveLength(3); // 보상 기록은 도장 수에 들어가지 않는다
  });

  it("출석 구간 코디: 기간제는 남은 기간에 더하고(입고 있으면 그 자리), 영구는 영구 소장", async () => {
    const id = newId();
    await stampDays(id, 7);
    // 벗어 둔 꾸미기에 3일 → 같은 꾸미기 7일을 더 받으면 남은 시간 + 7일
    expect(await accounts.grantAttendTier(id, "202611", 3, "hat_cat", "head", 3 * D, TT)).toBe(true);
    expect(await accounts.grantAttendTier(id, "202611", 7, "hat_cat", "head", 7 * D, TT + D)).toBe(true);
    expect(await owned(id, "hat_cat", TT + D)).toBe(TT + 10 * D);
    // 입고 있으면 착용한 자리에서 늘어난다
    expect(await accounts.wear(id, "hat_cat", "head", TT + D)).toBe(true);
    await stampDays(id, 14);
    expect(await accounts.grantAttendTier(id, "202611", 14, "hat_cat", "head", 14 * D, TT + 2 * D)).toBe(true);
    const a = await accounts.get(id, DAY, TT + 2 * D);
    expect(a.equipped).toContainEqual({ itemId: "hat_cat", until: TT + 24 * D });
    expect(a.stash.find((e) => e.itemId === "hat_cat")).toBeUndefined();
    // 영구
    await stampDays(id, 28);
    expect(await accounts.grantAttendTier(id, "202611", 28, "back_wings_dragon", "back", null, TT)).toBe(true);
    expect(await owned(id, "back_wings_dragon", TT)).toBe(PERMANENT_UNTIL);
    expect((await accounts.attendCalendar(id, "202611")).tiers).toEqual({ "3": "hat_cat", "7": "hat_cat", "14": "hat_cat", "28": "back_wings_dragon" });
  });

  it("출석 구간 코디 지급(grantAttendTiers): 닿은 구간을 모두 이어서 주고, 다시 불러도 두 번 주지 않는다", async () => {
    const id = newId();
    await stampDays(id, 8);
    const now = Date.UTC(2026, 10, 8, 3);
    const got = await grantAttendTiers(accounts, id, "202611", now);
    const plan = attendTierPlan("202611", {}, new Set());
    expect(got).toEqual([
      { days: 3, itemId: plan[0].itemId, termDays: 3 },
      { days: 7, itemId: plan[1].itemId, termDays: 7 },
    ]);
    expect(await grantAttendTiers(accounts, id, "202611", now)).toEqual([]);
    expect(await owned(id, plan[1].itemId!, now)).toBe(now + 7 * D);
    const view = await calendarOf(accounts, id, "202611", now);
    expect(view.tiers.map((t) => t.received)).toEqual([true, true, false, false, false]);
  });

  it("입장 기록: 이름·색·몸 모양·처음 입장 시각은 비어 있을 때만, 포인트는 주지 않는다", async () => {
    const id = newId();
    await accounts.enter(id, { name: "새벽코더", color: "#9fc5a8", body: "cat" }, 1234);
    await accounts.enter(id, { name: "다른이름", color: "#e0c36a", body: "tall" }, 5678);
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ name: "새벽코더", color: "#9fc5a8", body: "cat", createdAt: 1234, points: 0, lastAttend: null });
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

  it("관리자 포인트 조정: 0~지갑 상한(BALANCE_CAP)으로 자르고 하루 적립 한도와 무관, 없는 계정은 null", async () => {
    const id = newId();
    expect(await accounts.adjustPoints(id, 100)).toBeNull();
    await accounts.earn(id, "flower", DAY);
    expect(await accounts.adjustPoints(id, 500)).toBe(502);
    expect(await accounts.adjustPoints(id, -BALANCE_CAP)).toBe(0);
    expect(await accounts.adjustPoints(id, BALANCE_CAP - 1)).toBe(BALANCE_CAP - 1);
    expect(await accounts.adjustPoints(id, BALANCE_CAP)).toBe(BALANCE_CAP);
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

  it("머무르기 몰아서 정산: 같은 화면(sid)이면 흐른 시간만큼(최대 3번), 새 화면·sid 없음·오래 끊김은 1번", async () => {
    const MIN = 60_000;
    const id = newId();
    const t0 = 1_000_000_000;
    expect(await accounts.presenceTick(id, DAY, t0, "sidAAAAA1")).toMatchObject({ earned: 5, ticks: 1, stayTicks: 1 });
    // 숨긴 탭: 30분 뒤 한 번 → 3번 몫
    expect(await accounts.presenceTick(id, DAY, t0 + 30 * MIN, "sidAAAAA1")).toMatchObject({ earned: 15, ticks: 3, stayTicks: 4, points: 20 });
    // 너무 이르면 null, 기준 시각은 센 만큼만 앞으로 (31분 뒤 = 직전 기준 30분 + 10분 → 10분 몫)
    expect(await accounts.presenceTick(id, DAY, t0 + 31 * MIN, "sidAAAAA1")).toBeNull();
    expect(await accounts.presenceTick(id, DAY, t0 + 40 * MIN, "sidAAAAA1")).toMatchObject({ ticks: 1, stayTicks: 5 });
    // 2시간 뒤(끊김)에는 같은 sid여도 1번만
    expect(await accounts.presenceTick(id, DAY, t0 + 160 * MIN, "sidAAAAA1")).toMatchObject({ ticks: 1, stayTicks: 6 });
    // 다른 화면(새로 연 탭)은 30분이 지났어도 1번만
    expect(await accounts.presenceTick(id, DAY, t0 + 190 * MIN, "sidBBBBB2")).toMatchObject({ ticks: 1, stayTicks: 7 });
    // sid 없음(옛 화면)도 1번
    expect(await accounts.presenceTick(id, DAY, t0 + 220 * MIN)).toMatchObject({ ticks: 1, stayTicks: 8 });
    // 하루 한도(60점)는 몰아서 받아도 넘지 않는다
    const id2 = newId();
    let t = t0;
    expect(await accounts.presenceTick(id2, DAY, t, "sidCCCCC3")).not.toBeNull();
    let points = 5;
    for (let i = 0; i < 6; i++) points += (await accounts.presenceTick(id2, DAY, (t += 30 * MIN), "sidCCCCC3"))?.earned ?? 0;
    expect(points).toBe(60);
    expect((await accounts.presenceTick(id2, DAY, (t += 30 * MIN), "sidCCCCC3"))?.stayTicks).toBe(22); // 머문 기록은 한도와 별개로 센다
  });

  it("presenceCatchup 규칙 (Lua와 같은 계산)", () => {
    const t = 1_000_000_000;
    expect(presenceCatchup(t, t + PRESENCE_MIN_GAP_MS - 1, true)).toBeNull();
    expect(presenceCatchup(t, t + PRESENCE_MIN_GAP_MS, true)).toEqual({ ticks: 1, nextAt: t + PRESENCE_MIN_GAP_MS });
    expect(presenceCatchup(t, t + 2 * PRESENCE_TICK_MS - 20_000, true)).toEqual({ ticks: 2, nextAt: t + 2 * PRESENCE_TICK_MS - 20_000 });
    expect(presenceCatchup(t, t + 25 * 60_000, true)).toEqual({ ticks: 2, nextAt: t + 2 * PRESENCE_TICK_MS });
    expect(presenceCatchup(t, t + PRESENCE_CATCHUP_WINDOW_MS, true)).toEqual({ ticks: 3, nextAt: t + 3 * PRESENCE_TICK_MS });
    expect(presenceCatchup(t, t + PRESENCE_CATCHUP_WINDOW_MS + 1, true)).toEqual({ ticks: 1, nextAt: t + PRESENCE_CATCHUP_WINDOW_MS + 1 });
    expect(presenceCatchup(t, t + 30 * 60_000, false)).toEqual({ ticks: 1, nextAt: t + 30 * 60_000 });
    expect(presenceCatchup(0, 30 * 60_000, true)).toEqual({ ticks: 1, nextAt: 30 * 60_000 });
  });

  // 접속 시간 보너스 (lib/stayBonus.ts): 머무르기 기록 3번(30분)마다 한 구간, 10→15→20→25P 고정, 하루 7구간 145P
  async function stayTicks(id: string, day: string, t0: number, ticks: number): Promise<number> {
    for (let i = 0; i < ticks; i++) expect(await accounts.presence(id, day, t0 + i * PRESENCE_MIN_GAP_MS)).not.toBeNull();
    return t0 + ticks * PRESENCE_MIN_GAP_MS;
  }

  it("접속 보너스: 30분마다 구간이 열리고, 안 받으면 쌓였다가 한꺼번에 받는다", async () => {
    const id = newId();
    expect(await accounts.claimStayBonus(id, DAY)).toBeNull();
    let t = await stayTicks(id, DAY, 1_000_000_000, 2);
    expect(await accounts.claimStayBonus(id, DAY)).toBeNull(); // 20분: 아직
    t = await stayTicks(id, DAY, t, 1);
    expect(await accounts.claimStayBonus(id, DAY)).toEqual({ earned: 10, count: 1 });
    expect(await accounts.claimStayBonus(id, DAY)).toBeNull(); // 같은 구간 두 번 받기 불가
    await stayTicks(id, DAY, t, 6); // 90분: 2·3구간이 쌓임
    expect((await accounts.get(id, DAY, 0)).bonusClaimed).toBe(1);
    expect(await accounts.claimStayBonus(id, DAY)).toEqual({ earned: 15 + 20, count: 2 });
    expect(await accounts.get(id, DAY, 0)).toMatchObject({ bonusClaimed: 3, stayTicks: 9 });
  });

  it("접속 보너스: 하루 145P(7구간)까지, 동시에 눌러도 한 번만, 한국 시간 자정에 처음부터", async () => {
    const id = newId();
    let t = await stayTicks(id, DAY, 1_000_000_000, 30); // 5시간
    const many = await Promise.all(Array.from({ length: 5 }, () => accounts.claimStayBonus(id, DAY)));
    expect(many.filter(Boolean)).toEqual([{ earned: 145, count: 7 }]);
    t = await stayTicks(id, DAY, t, 3);
    expect(await accounts.claimStayBonus(id, DAY)).toBeNull();
    // 다음 날: 머문 기록·받은 구간이 0부터
    const next = "20261109";
    expect(await accounts.get(id, next, 0)).toMatchObject({ bonusClaimed: 0, stayTicks: 0 });
    expect(await accounts.claimStayBonus(id, next)).toBeNull();
    await stayTicks(id, next, t, 3);
    expect(await accounts.claimStayBonus(id, next)).toEqual({ earned: 10, count: 1 });
  });

  it("접속 보너스: 하루 전체 한도와 별개 — 다 찬 뒤에도 받고, _total에도 더하지 않는다", async () => {
    const id = newId();
    await fillDay(id);
    const t = await stayTicks(id, DAY, 1_000_000_000, 3); // 머무르기는 이미 한도라 더 안 쌓인다
    expect(await accounts.claimStayBonus(id, DAY)).toEqual({ earned: 10, count: 1 });
    expect(await accounts.claimStayBonus(id, DAY)).toBeNull();
    expect((await accounts.get(id, DAY, 0)).todayEarned).toBe(DAILY_EARN_CAP);
    // 나머지 6구간도 그대로 → 보너스 하루 145P
    await stayTicks(id, DAY, t, 18);
    expect(await accounts.claimStayBonus(id, DAY)).toEqual({ earned: 135, count: 6 });
    expect((await accounts.get(id, DAY, 0)).todayEarned).toBe(DAILY_EARN_CAP);
    // 지갑 상한은 그대로 적용
    const rich = newId();
    await stayTicks(rich, DAY, 1_000_000_000, 3);
    await kit.setPoints(rich, BALANCE_CAP - 3);
    expect(await accounts.claimStayBonus(rich, DAY)).toEqual({ earned: 3, count: 1 });
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

  // ── 닉네임 중복 금지 (이름 색인) ──
  const T0 = Date.parse("2026-11-08T03:00:00Z");
  const DAY_MS = 86_400_000;
  const WEEK_MS = 7 * DAY_MS;
  /** 실제 Redis에서 다른 실행이 남긴 색인과 겹치지 않게 이름마다 꼬리표 */
  const tagged = (base: string) => `${base}${nanoid(4).replace(/[^A-Za-z0-9]/g, "z")}`;

  it("이름 중복: 비교 키가 같은 이름(공백·_·대소문자 차이)은 등록·입장·변경 모두 거절, 내 이름은 그대로", async () => {
    const [a, b] = [newId(), newId()];
    const name = tagged("홍길동");
    expect(await accounts.claimName(a, name, T0)).toBe("ok");
    expect(await accounts.nameOwner(nameKey(name), T0)).toBe(a);
    const lookalike = `홍 길_동 ${name.slice(3).toUpperCase()}`;
    expect(nameKey(lookalike)).toBe(nameKey(name));
    expect(await accounts.claimName(b, lookalike, T0)).toBe("taken");
    await accounts.enter(b, { name: lookalike, color: "#9fc5a8" }, T0);
    expect(await accounts.get(b, DAY, T0)).toMatchObject({ name: null, color: "#9fc5a8" });
    // 변경도 거절: 포인트·쿨다운·횟수를 쓰지 않는다
    expect(await accounts.changeName(b, lookalike, T0, 100, WEEK_MS)).toEqual({ ok: false, reason: "taken" });
    expect(await accounts.get(b, DAY, T0)).toMatchObject({ nameChanges: 0, nameChangedAt: 0 });
    // 이미 내 이름이면 ok, 이름이 있는 계정의 다른 등록은 has
    expect(await accounts.claimName(a, name, T0)).toBe("ok");
    expect(await accounts.claimName(a, tagged("딴이름"), T0)).toBe("has");
  });

  it("이름 중복: 같은 이름 동시 등록·동시 변경은 하나만 성공", async () => {
    const ids = [newId(), newId(), newId(), newId()];
    const name = tagged("동시");
    const claims = await Promise.all(ids.map((id) => accounts.claimName(id, name, T0)));
    expect(claims.filter((r) => r === "ok")).toHaveLength(1);
    expect(claims.filter((r) => r === "taken")).toHaveLength(3);
    const winner = ids[claims.indexOf("ok")];
    expect(await accounts.nameOwner(nameKey(name), T0)).toBe(winner);

    const others = ids.filter((id) => id !== winner);
    const target = tagged("바꿀");
    const changes = await Promise.all(others.map((id) => accounts.changeName(id, target, T0, 0, WEEK_MS)));
    expect(changes.filter((r) => r.ok)).toHaveLength(1);
    expect(changes.filter((r) => !r.ok && r.reason === "taken")).toHaveLength(2);
  });

  it("이름 중복: 이름을 바꾸면 옛 이름은 풀려서 다른 계정이 쓸 수 있다", async () => {
    const [a, b] = [newId(), newId()];
    const [x, y] = [tagged("옛이름"), tagged("새이름")];
    expect(await accounts.claimName(a, x, T0)).toBe("ok");
    expect(await accounts.changeName(a, y, T0, 100, WEEK_MS)).toEqual({ ok: true, cost: 0 });
    expect(await accounts.nameOwner(nameKey(x), T0)).toBeNull();
    expect(await accounts.nameOwner(nameKey(y), T0)).toBe(a);
    expect(await accounts.claimName(b, x, T0)).toBe("ok");
    expect((await accounts.get(a, DAY, T0)).name).toBe(y);
  });

  it("이름 중복: 기존 중복 계정은 이름을 그대로 두고(먼저 확인된 계정이 색인), 새로 그 이름을 쓰는 건 막는다", async () => {
    const [a, b, c] = [newId(), newId(), newId()];
    const name = tagged("겹친이름");
    const same = name.toUpperCase(); // 비교 키가 같은 옛 이름
    await kit.setLegacyName(a, name);
    await kit.setLegacyName(b, same);
    // 다음 입장·계정 확인 때 색인을 채운다: a가 먼저 → a 차지, b는 이름 그대로(표시만)
    expect(await accounts.visit(a, T0, true)).toEqual({ renameRequired: false });
    expect(await accounts.visit(b, T0, false)).toEqual({ renameRequired: false });
    expect(await accounts.nameOwner(nameKey(name), T0)).toBe(a);
    expect((await accounts.get(b, DAY, T0)).name).toBe(same);
    expect(await accounts.claimName(c, name, T0)).toBe("taken");
    // b가 다른 이름으로 바꿔도 a의 색인은 그대로
    const other = tagged("비켜줌");
    expect(await accounts.changeName(b, other, T0, 100, WEEK_MS)).toEqual({ ok: true, cost: 0 });
    expect(await accounts.nameOwner(nameKey(name), T0)).toBe(a);
    expect(await accounts.nameOwner(nameKey(other), T0)).toBe(b);
  });

  it("이름 중복: 관리자 일괄 색인은 색인에 없는 옛 계정 이름을 채운다 (겹치면 표시만)", async () => {
    const [a, b] = [newId(), newId()];
    const name = tagged("일괄");
    await kit.setLegacyName(a, name);
    await kit.setLegacyName(b, name);
    let cursor = "0";
    let dup = 0;
    for (let i = 0; i < 10_000; i++) {
      const r = await accounts.reindexNames(cursor, 500, T0);
      dup += r.dup;
      cursor = r.next;
      if (cursor === "0") break;
    }
    expect([a, b]).toContain(await accounts.nameOwner(nameKey(name), T0));
    expect(dup).toBeGreaterThanOrEqual(1);
    expect((await accounts.get(a, DAY, T0)).name).toBe(name);
    expect((await accounts.get(b, DAY, T0)).name).toBe(name);
  });

  it("휴면: 89일이면 이름을 지키고, 91일이면 다른 계정이 가져가며, 돌아오면 닉네임을 다시 정해야 한다 (나머지 데이터는 그대로)", async () => {
    const [a, b] = [newId(), newId()];
    const [x, z] = [tagged("휴면"), tagged("다시")];
    expect(DORMANT_MS).toBe(90 * DAY_MS);
    expect(await accounts.claimName(a, x, T0)).toBe("ok");
    await kit.setPoints(a, 30);
    // 89일: 그대로 a의 것
    const d89 = T0 + 89 * DAY_MS;
    expect(await accounts.nameOwner(nameKey(x), d89)).toBe(a);
    expect(await accounts.claimName(b, x, d89)).toBe("taken");
    expect(await accounts.changeName(b, x, d89, 0, WEEK_MS)).toEqual({ ok: false, reason: "taken" });
    expect(await accounts.visit(a, d89, false)).toEqual({ renameRequired: false });
    // 91일: 다른 계정이 가져간다 (원자적으로 점유자 교체)
    const d91 = T0 + 91 * DAY_MS;
    expect(await accounts.nameOwner(nameKey(x), d91)).toBeNull();
    expect(await accounts.claimName(b, x, d91)).toBe("ok");
    expect(await accounts.nameOwner(nameKey(x), d91)).toBe(b);
    // a가 돌아오면 재설정 요구 — 입장 기록(enter)으로는 이름을 정하지 못한다
    expect(await accounts.visit(a, d91 + 1, true)).toEqual({ renameRequired: true });
    await accounts.enter(a, { name: z }, d91 + 1);
    expect(await accounts.get(a, DAY, d91 + 1)).toMatchObject({ renameRequired: true, name: x, points: 30 });
    expect(await accounts.claimName(a, x, d91 + 1)).toBe("taken");
    expect(await accounts.claimName(a, z, d91 + 1)).toBe("ok");
    expect(await accounts.get(a, DAY, d91 + 1)).toMatchObject({ renameRequired: false, name: z, points: 30 });
    expect(await accounts.visit(a, d91 + 2, true)).toEqual({ renameRequired: false });
  });

  it("휴면: 옛 이름이 아직 비어 있으면 다시 정할 때 그대로 쓸 수 있고, 머무르기 기록도 접속으로 친다", async () => {
    const [a, c] = [newId(), newId()];
    const [x, w] = [tagged("돌아옴"), tagged("머묾")];
    expect(await accounts.claimName(a, x, T0)).toBe("ok");
    const back = T0 + 120 * DAY_MS;
    expect(await accounts.visit(a, back, false)).toEqual({ renameRequired: true });
    // 휴면 판정 때 a의 색인은 풀린다
    expect(await accounts.nameOwner(nameKey(x), back)).toBeNull();
    expect(await accounts.claimName(a, x, back)).toBe("ok");
    expect(await accounts.get(a, DAY, back)).toMatchObject({ renameRequired: false, name: x });

    // 50일째 머무르기 → 91일째(머문 지 41일)는 휴면이 아니다
    expect(await accounts.claimName(c, w, T0)).toBe("ok");
    expect(await accounts.presence(c, kstDay(T0 + 50 * DAY_MS), T0 + 50 * DAY_MS)).not.toBeNull();
    expect(await accounts.visit(c, T0 + 91 * DAY_MS, true)).toEqual({ renameRequired: false });
    expect(await accounts.nameOwner(nameKey(w), T0 + 91 * DAY_MS)).toBe(c);
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
    await accounts.earn(b, "attend", DAY);
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
      async setLegacyAttend(id, lastAttend, streak) {
        Object.assign((accounts as unknown as { acct(id: string): object }).acct(id), { lastAttend, streak });
      },
      async setLegacyName(id, name) {
        (accounts as unknown as { acct(id: string): { name: string | null } }).acct(id).name = name;
      },
      async cleanup(ids) {
        const names = (accounts as unknown as { names: Map<string, string> }).names;
        for (const [k, owner] of names) if (ids.includes(owner)) names.delete(k);
      },
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
      async setLegacyAttend(id, lastAttend, streak) {
        await raw.hset(K.acct(id), { lastAttend, streak: String(streak) });
      },
      async setLegacyName(id, name) {
        await raw.hset(K.acct(id), { name });
      },
      async cleanup(ids) {
        // 테스트 계정이 차지한 이름 색인을 먼저 푼다 (계정 해시를 지우면 어느 키였는지 모른다)
        for (const id of ids.filter((x) => !x.startsWith("code:"))) {
          const key = (await raw.hget(K.acct(id), "nameKey")) as string | null;
          if (key && (await raw.hget(K.names, key)) === id) await raw.hdel(K.names, key);
        }
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

describe("게임 날짜 키 (한국 시간 새벽 5시 경계)", () => {
  it("주 키는 그 주 월요일, 주는 월요일 새벽 5시에 바뀐다", () => {
    expect(weekOfDay("20261112")).toBe("20261109"); // 목 → 월
    expect(weekOfDay("20261109")).toBe("20261109"); // 월
    expect(weekOfDay("20261115")).toBe("20261109"); // 일 → 그 주 월
    expect(weekOfDay("20261116")).toBe("20261116");
    expect(weekOfDay("20260301")).toBe("20260223"); // 달을 넘어간다
    expect(kstWeek(Date.UTC(2026, 10, 15, 15, 1))).toBe("20261109"); // 11/16(월) 00:01 KST — 아직 지난주
    expect(kstWeek(Date.UTC(2026, 10, 15, 19, 59, 59))).toBe("20261109"); // 11/16(월) 04:59:59 KST
    expect(kstWeek(Date.UTC(2026, 10, 15, 20, 0))).toBe("20261116"); // 11/16(월) 05:00 KST
  });

  it("새벽 5시 기준으로 오늘·어제를 YYYYMMDD로", () => {
    const justAfterMidnightKst = Date.UTC(2026, 10, 7, 15, 1); // 11/8 00:01 KST → 아직 11/7
    expect(kstDay(justAfterMidnightKst)).toBe("20261107");
    expect(kstYesterday(justAfterMidnightKst)).toBe("20261106");
    expect(kstDay(Date.UTC(2026, 10, 7, 19, 59, 59))).toBe("20261107"); // 11/8 04:59:59 KST
    expect(kstDay(Date.UTC(2026, 10, 7, 20, 0))).toBe("20261108"); // 11/8 05:00 KST
    expect(kstYesterday(Date.UTC(2026, 10, 7, 20, 0))).toBe("20261107");
    expect(kstYesterday(Date.UTC(2026, 2, 1, 0, 0))).toBe("20260228"); // 3/1 09:00 KST → 어제는 2/28
  });
});
