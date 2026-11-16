import { afterEach, describe, expect, it } from "vitest";
import { earnGaugeRows } from "./earnGauge";
import { DAILY_EARN_CAP, earnRule, type EarnSource } from "./economy";
import { dayStartMs, gameDay } from "./gameDay";
import {
  BOOSTABLE_SOURCES,
  boostedTotalCap,
  earnBoostAt,
  earnLimits,
  NO_BOOST,
  normalizePointEvent,
  paidOf,
  pointEventBanner,
  pointEventEndText,
  pointEventListText,
  pointEventOn,
  pointEventWhat,
  POINT_EVENT_MULT,
  type PointEvent,
} from "./pointEvent";
import { earnPoints } from "./store";
import { kstDay } from "./store/accounts";
import { MemoryAccounts } from "./store/accounts-memory";
import { MemoryStore } from "./store/memory";
import { cachedPointEvent, earnBoost, setPointEvent } from "./store/pointEvent";

const H = 3_600_000;
const M = POINT_EVENT_MULT;
/** 2026-11-14(토) 한국 시간 낮 12시 */
const SAT_NOON = Date.UTC(2026, 10, 14, 3);
/** 2026-11-16(월) 한국 시간 새벽 5시 = 그 주 마감 */
const MON_5 = Date.UTC(2026, 10, 15, 20);
const ALL = [...BOOSTABLE_SOURCES];
const ev = (o: Partial<PointEvent> = {}): PointEvent => ({ startAt: SAT_NOON - H, endAt: MON_5, sources: ALL, mult: M, ...o });
const max = (s: EarnSource) => earnRule(s).dailyMax;

describe("포인트 배수 이벤트 규칙 (lib/pointEvent)", () => {
  it("꺼져 있거나 아직 시작 전이면 그대로", () => {
    expect(earnBoostAt(null, SAT_NOON)).toEqual(NO_BOOST);
    expect(earnBoostAt(ev({ startAt: SAT_NOON + H }), SAT_NOON)).toEqual(NO_BOOST);
  });

  it("출석 달력 보상(출석·7일 연속·한 달 개근)은 고를 수 없다", () => {
    expect(BOOSTABLE_SOURCES).not.toContain("attend");
    expect(BOOSTABLE_SOURCES).not.toContain("streak");
    expect(BOOSTABLE_SOURCES).not.toContain("monthly");
    expect(BOOSTABLE_SOURCES).toContain("stayBonus");
  });

  it("예전 값(항목·배수 없음)은 전부·2배, 모르는 항목은 빼고, 남는 게 없으면 꺼짐", () => {
    expect(normalizePointEvent({ startAt: 1, endAt: null })).toEqual({ startAt: 1, endAt: null, sources: ALL, mult: 2 });
    expect(normalizePointEvent({ startAt: 1, endAt: 5, sources: ["stars", "nope", "attend", "hunt"], mult: 3 })).toEqual({
      startAt: 1,
      endAt: 5,
      sources: ["hunt", "stars"],
      mult: 3,
    });
    expect(normalizePointEvent({ startAt: 1, sources: [] })).toBeNull();
    expect(normalizePointEvent({ startAt: 1, mult: 7 })?.mult).toBe(2);
  });

  it("켜져 있는 동안은 고른 항목만 적립과 한도가 배수", () => {
    const e = ev({ sources: ["hunt", "stars"] });
    expect(pointEventOn(e, SAT_NOON)).toBe(true);
    const b = earnBoostAt(e, SAT_NOON);
    expect(earnLimits(b, "hunt")).toMatchObject({ points: M, caps: M });
    expect(earnLimits(b, "fish")).toMatchObject({ points: 1, caps: 1 });
    // 하루 전체 한도는 늘어난 항목 몫만큼만
    expect(boostedTotalCap(b)).toBe(DAILY_EARN_CAP + (max("hunt") + max("stars")) * (M - 1));
  });

  it("전부 고르면 하루 전체 한도도 배수 (접속 시간 보너스는 전체 한도와 따로라 더하지 않는다)", () => {
    expect(boostedTotalCap(earnBoostAt(ev(), SAT_NOON))).toBe(DAILY_EARN_CAP * M);
    expect(boostedTotalCap(earnBoostAt(ev({ sources: ["stayBonus"] }), SAT_NOON))).toBe(DAILY_EARN_CAP);
  });

  it("도중에 끝나면 적립은 바로 그대로, 한도는 그날 새벽 5시까지 늘어난 채로", () => {
    const e = ev({ sources: ["hunt"], endAt: SAT_NOON + H });
    const b = earnBoostAt(e, SAT_NOON + 2 * H);
    expect(earnLimits(b, "hunt")).toMatchObject({ points: 1, caps: M });
    const sun5 = dayStartMs(gameDay(SAT_NOON)) + 24 * H;
    expect(earnBoostAt(e, sun5 - 1).caps).toEqual(["hunt"]);
    expect(earnBoostAt(e, sun5)).toEqual(NO_BOOST);
  });

  it("새벽 5시에 딱 끝나면 그 뒤 하루는 원래 한도", () => {
    expect(earnBoostAt(ev({ startAt: SAT_NOON }), MON_5)).toEqual(NO_BOOST);
  });

  it("늘어난 적립이 원래 값으로 얼마어치인지 (paidOf)", () => {
    expect(paidOf(10, 10, 1)).toBe(10);
    expect(paidOf(20, 10, 2)).toBe(10);
    // 한도에 걸려 일부만: 15P 들어옴 = 8어치 (올림, 받은 쪽이 손해 보지 않게)
    expect(paidOf(15, 10, 2)).toBe(8);
    expect(paidOf(30, 10, 3)).toBe(10);
    expect(paidOf(0, 10, 2)).toBe(0);
  });

  it("끝나는 때 문구는 한국 시간 기준 요일·시각", () => {
    expect(pointEventEndText(MON_5, SAT_NOON)).toBe("월요일 새벽 5시");
    expect(pointEventEndText(SAT_NOON + 3 * H, SAT_NOON)).toBe("오늘 오후 3시");
    expect(pointEventEndText(SAT_NOON + 21.5 * H, SAT_NOON)).toBe("내일 오전 9시 30분");
    expect(pointEventEndText(SAT_NOON + 10 * 24 * H, SAT_NOON)).toBe("11월 24일 낮 12시");
  });

  it("안내 띠 문구: 전부, 하나, 둘(와/과), 셋 넘게", () => {
    expect(pointEventBanner(ev(), SAT_NOON)).toBe(`포인트 ${M}배 이벤트 중이에요. 월요일 새벽 5시까지`);
    expect(pointEventBanner(ev({ endAt: null, mult: 3 }), SAT_NOON)).toBe("포인트 3배 이벤트 중이에요.");
    expect(pointEventWhat(["hunt"])).toBe("사냥터 포인트");
    expect(pointEventWhat(["hunt", "stars"])).toBe("사냥터와 별자리 잇기 포인트");
    expect(pointEventWhat(["bugs", "stars"])).toBe("곤충 채집과 별자리 잇기 포인트");
    expect(pointEventWhat(["hunt", "bugs", "stars", "fish"])).toBe("사냥터 포함 4가지 포인트");
    expect(pointEventBanner(ev({ sources: ["hunt", "stars"] }), SAT_NOON)).toBe("사냥터와 별자리 잇기 포인트 2배 이벤트 중이에요. 월요일 새벽 5시까지");
  });

  it("관리자 화면 목록 문구 (이/가)", () => {
    expect(pointEventListText(ALL)).toBe("모든 항목이");
    expect(pointEventListText(["hunt", "bugs"])).toBe("사냥터, 곤충 채집이");
    expect(pointEventListText(["bugs", "hunt"])).toBe("곤충 채집, 사냥터가");
  });

  it("오늘 포인트 게이지는 고른 항목만 한도가 배수이고 표시가 붙는다", () => {
    const b = earnBoostAt(ev({ sources: ["hunt", "stayBonus"] }), SAT_NOON);
    const v = earnGaugeRows(0, { attend: 10, hunt: 5 }, b);
    expect(v.total.max).toBe(DAILY_EARN_CAP + max("hunt") * (M - 1));
    const hunt = v.main.find((r) => r.source === "hunt")!;
    expect(hunt).toMatchObject({ max: max("hunt") * M, boosted: M });
    expect(v.main.find((r) => r.source === "fish")!).toMatchObject({ max: max("fish") });
    expect(v.main.find((r) => r.source === "fish")!.boosted).toBeUndefined();
    expect(v.separate.find((r) => r.source === "attend")!.max).toBe(max("attend"));
    expect(v.separate.find((r) => r.source === "stayBonus")!.max).toBe(max("stayBonus") * M);
  });
});

describe("포인트 배수 이벤트 적립 (메모리 저장소)", () => {
  afterEach(async () => {
    await setPointEvent(null);
  });
  const on = (sources: EarnSource[] = ALL, mult = M) => setPointEvent({ startAt: Date.now() - H, endAt: null, sources, mult });
  const fresh = () => new MemoryAccounts(() => new MemoryStore());

  it("설정은 바로 캐시에도 반영된다", async () => {
    expect(await cachedPointEvent()).toBeNull();
    await on(["hunt"]);
    expect(await earnBoost()).toEqual({ mult: M, on: ["hunt"], caps: ["hunt"] });
    await setPointEvent(null);
    expect(await earnBoost()).toEqual(NO_BOOST);
  });

  it("고른 항목은 적립과 항목 한도가 배수, 고르지 않은 항목은 그대로", async () => {
    const accounts = fresh();
    const day = kstDay();
    await on(["hunt"]);
    expect(await accounts.earn("a", "hunt", day, { amount: max("hunt") })).toBe(max("hunt") * M);
    expect(await accounts.earn("a", "hunt", day, { amount: 10 })).toBe(0);
    expect(await accounts.earn("a", "flower", day)).toBe(earnRule("flower").points);
    expect(await accounts.earn("a", "fish", day, { amount: 100_000 })).toBe(max("fish"));
    expect((await accounts.get("a", day, Date.now())).earnedBy.hunt).toBe(max("hunt") * M);
  });

  it("3배도 된다", async () => {
    await on(["flower"], 3);
    expect(await fresh().earn("a3", "flower", kstDay())).toBe(earnRule("flower").points * 3);
  });

  it("하루 전체 한도는 늘어난 항목 몫만큼만 늘어난다", async () => {
    const day = kstDay();
    const all = ["hunt", "bugs", "stars", "fish", "gather", "dex", "goblin", "wish", "presence", "flower", "bury", "gotFlower", "houseLike"] as const;
    const fill = async (accounts: MemoryAccounts, id: string) => {
      let total = 0;
      for (const r of all) total += await accounts.earn(id, r, day, { amount: 100_000 });
      return total;
    };
    await on(["hunt", "stars"]);
    expect(await fill(fresh(), "b")).toBe(DAILY_EARN_CAP + (max("hunt") + max("stars")) * (M - 1));
    await on();
    const accounts = fresh();
    expect(await fill(accounts, "b2")).toBe(DAILY_EARN_CAP * M);
    expect((await accounts.get("b2", day, Date.now())).todayEarned).toBe(DAILY_EARN_CAP * M);
  });

  it("이벤트가 끝나도 그날은 늘어난 한도가 남고, 적립은 원래대로", async () => {
    const now = Date.now();
    if (now - 2000 <= dayStartMs(gameDay(now))) return; // 새벽 5시 직후면 건너뛴다
    await setPointEvent({ startAt: now - 2000, endAt: now - 1000, sources: ["flower"], mult: M });
    expect(await earnBoost()).toEqual({ mult: M, on: [], caps: ["flower"] });
    expect(await fresh().earn("c", "flower", kstDay())).toBe(earnRule("flower").points);
  });

  it("boost를 넘기면 그 값을 쓴다 (꺼져 있으면 원래대로)", async () => {
    const accounts = fresh();
    const day = kstDay();
    expect(await accounts.earn("d", "flower", day)).toBe(earnRule("flower").points);
    expect(await accounts.earn("d", "flower", day, { boost: { mult: 3, on: ["flower"], caps: ["flower"] } })).toBe(earnRule("flower").points * 3);
  });

  it("머무르기·접속 시간 보너스도 고르면 배수, 안 고르면 그대로", async () => {
    const accounts = fresh();
    const day = kstDay();
    const setStay = (id: string) => (accounts as unknown as { acct(id: string): { earned: Map<string, number> } }).acct(id).earned.set("_stay", 3);
    await on(["presence", "stayBonus"]);
    expect((await accounts.presenceTick("e", day, Date.now()))?.earned).toBe(earnRule("presence").points * M);
    setStay("e");
    // 머문 기록 3개(30분) = 첫 구간 10P
    expect(await accounts.claimStayBonus("e", day)).toEqual({ earned: 10 * M, count: 1 });
    await on(["hunt"]);
    expect((await accounts.presenceTick("e2", day, Date.now()))?.earned).toBe(earnRule("presence").points);
    setStay("e2");
    expect(await accounts.claimStayBonus("e2", day)).toEqual({ earned: 10, count: 1 });
  });

  it("earnPoints는 늘어난 적립(earned)과 원래 값어치(paid)를 같이 준다", async () => {
    await on(["fish"]);
    const r = await earnPoints("pe-acct-1", "fish", 30);
    expect(r).toMatchObject({ earned: 30 * M, paid: 30 });
    expect(r.me.earnBoost).toEqual({ mult: M, on: ["fish"], caps: ["fish"] });
    // 고르지 않은 항목은 그대로
    expect(await earnPoints("pe-acct-1", "gather", 30)).toMatchObject({ earned: 30, paid: 30 });
    await setPointEvent(null);
    const r2 = await earnPoints("pe-acct-1", "fish", 30);
    expect(r2).toMatchObject({ earned: 30, paid: 30 });
    expect(r2.me.earnBoost).toBeUndefined();
  });

  it("지갑 상한은 그대로", async () => {
    const accounts = fresh();
    (accounts as unknown as { acct(id: string): { points: number } }).acct("f").points = 99_990;
    await on();
    expect(await accounts.earn("f", "hunt", kstDay(), { amount: 100 })).toBe(9);
  });
});
