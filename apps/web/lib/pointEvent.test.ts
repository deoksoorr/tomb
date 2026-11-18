import { afterEach, describe, expect, it, vi } from "vitest";
import { earnRule, NO_LIMIT, WALLET_MAX, type EarnSource } from "./economy";
import {
  BOOSTABLE_SOURCES,
  earnBoostAt,
  earnTerms,
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

// 끝난 이벤트를 읽으면 끝 공지가 나간다 → 실시간 서버로 보내는 부분만 가짜로
vi.mock("./ban", async (importOriginal) => ({ ...(await importOriginal<typeof import("./ban")>()), sayAll: vi.fn(async () => 1) }));

const H = 3_600_000;
const M = POINT_EVENT_MULT;
/** 2026-11-14(토) 한국 시간 낮 12시 */
const SAT_NOON = Date.UTC(2026, 10, 14, 3);
/** 2026-11-16(월) 한국 시간 새벽 5시 = 그 주 마감 */
const MON_5 = Date.UTC(2026, 10, 15, 20);
const ALL = [...BOOSTABLE_SOURCES];
const ev = (o: Partial<PointEvent> = {}): PointEvent => ({ startAt: SAT_NOON - H, endAt: MON_5, sources: ALL, mult: M, ...o });
/** 횟수 규칙이 남은 항목의 하루 최대 */
const max = (s: EarnSource) => earnRule(s).dailyMax ?? NO_LIMIT;

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

  it("켜져 있는 동안은 고른 항목만 적립이 배수, 횟수 규칙이 남은 항목은 하루 최대도 배수 (11/19 나머지는 한도 없음)", () => {
    const e = ev({ sources: ["hunt", "flower"] });
    expect(pointEventOn(e, SAT_NOON)).toBe(true);
    const b = earnBoostAt(e, SAT_NOON);
    expect(earnTerms(b, "hunt")).toEqual({ m100: M * 100, dailyMax: NO_LIMIT });
    expect(earnTerms(b, "fish")).toEqual({ m100: 100, dailyMax: NO_LIMIT });
    expect(earnTerms(b, "flower")).toEqual({ m100: M * 100, dailyMax: max("flower") * M });
    expect(earnTerms(b, "gotFlower")).toEqual({ m100: 100, dailyMax: max("gotFlower") });
  });

  it("도중에 끝나면 적립과 한도 모두 그 자리에서 원래대로", () => {
    const e = ev({ sources: ["hunt"], endAt: SAT_NOON + H });
    expect(earnTerms(earnBoostAt(e, SAT_NOON + H - 1), "hunt").m100).toBe(M * 100);
    expect(earnBoostAt(e, SAT_NOON + H)).toEqual(NO_BOOST);
    expect(earnBoostAt(e, SAT_NOON + 2 * H)).toEqual(NO_BOOST);
  });

  it("새벽 5시에 딱 끝나면 그 뒤 하루는 원래 한도", () => {
    expect(earnBoostAt(ev({ startAt: SAT_NOON }), MON_5)).toEqual(NO_BOOST);
  });

  it("늘어난 적립이 원래 값으로 얼마어치인지 (paidOf)", () => {
    expect(paidOf(10, 10, 1)).toBe(10);
    expect(paidOf(20, 10, 2)).toBe(10);
    // 지갑이 차서 일부만: 15P 들어옴 = 8어치 (올림, 받은 쪽이 손해 보지 않게)
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

  it("고른 항목은 적립이 배수, 고르지 않은 항목은 그대로 (한도 없는 항목은 얼마든 들어온다)", async () => {
    const accounts = fresh();
    const day = kstDay();
    await on(["hunt", "gotFlower"]);
    expect(await accounts.earn("a", "hunt", day, { amount: 5_000 })).toBe(5_000 * M);
    expect(await accounts.earn("a", "hunt", day, { amount: 10 })).toBe(10 * M);
    expect(await accounts.earn("a", "flower", day)).toBe(earnRule("flower").points);
    expect(await accounts.earn("a", "fish", day, { amount: 100_000 })).toBe(100_000);
    // 횟수 규칙이 남은 항목은 하루 최대가 배수
    expect(await accounts.earn("a", "gotFlower", day, { amount: 100 })).toBe(max("gotFlower") * M);
    expect((await accounts.get("a", day, Date.now())).todayEarned).toBe(5_000 * M + 10 * M + earnRule("flower").points + 100_000 + max("gotFlower") * M);
  });

  it("3배도 된다", async () => {
    await on(["flower"], 3);
    expect(await fresh().earn("a3", "flower", kstDay())).toBe(earnRule("flower").points * 3);
  });

  it("이벤트가 끝나면 한도와 적립 모두 원래대로", async () => {
    const now = Date.now();
    await setPointEvent({ startAt: now - 2000, endAt: now - 1000, sources: ["flower"], mult: M });
    expect(await earnBoost()).toEqual(NO_BOOST);
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
    // 고르지 않은 항목은 그대로
    expect(await earnPoints("pe-acct-1", "gather", 30)).toMatchObject({ earned: 30, paid: 30 });
    await setPointEvent(null);
    const r2 = await earnPoints("pe-acct-1", "fish", 30);
    expect(r2).toMatchObject({ earned: 30, paid: 30 });
  });

  it("지갑 상한(사실상 없음)은 그대로", async () => {
    const accounts = fresh();
    (accounts as unknown as { acct(id: string): { points: number } }).acct("f").points = WALLET_MAX - 9;
    await on();
    expect(await accounts.earn("f", "hunt", kstDay(), { amount: 100 })).toBe(9);
  });
});
