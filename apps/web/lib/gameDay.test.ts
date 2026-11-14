import { describe, expect, it } from "vitest";
import { ATTEND_STAY_TICKS } from "./attendStay";
import { buildCalendar, daysInMonth } from "./calendar";
import { earnRule } from "./economy";
import { addDays, dayStartMs, gameDay, gameWeek, gameYesterday, gameYmd, msUntilDayReset, nextDayStartMs, nextWeekStartMs, weekEndMs, weekOfDay, weekStartMs } from "./gameDay";
import { kstDay, kstWeek, kstYesterday } from "./store/accounts";
import { MemoryAccounts } from "./store/accounts-memory";
import { MemoryStore } from "./store/memory";
import { PRESENCE_MIN_GAP_MS } from "./store/types";

// 게임 날짜: 한국 시간 새벽 5시에 하루가 바뀐다 (하루 키 YYYYMMDD 형식은 그대로, 경계만 5시간 뒤로)

const HOUR = 3_600_000;
/** 한국 시각 → ms */
const kst = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => Date.UTC(y, m - 1, d, h, min, s) - 9 * HOUR;

describe("하루 키 (새벽 4:59 / 5:00)", () => {
  it("새벽 4:59:59까지는 전날, 5시 정각부터 그날", () => {
    expect(gameDay(kst(2026, 11, 15, 4, 59, 59))).toBe("20261114");
    expect(gameDay(kst(2026, 11, 15, 5))).toBe("20261115");
    expect(gameYmd(kst(2026, 11, 15, 5))).toBe("2026-11-15");
    // 자정·새벽 1시는 아직 전날, 밤 23:59도 그날
    expect(gameDay(kst(2026, 11, 15, 0))).toBe("20261114");
    expect(gameDay(kst(2026, 11, 15, 23, 59, 59))).toBe("20261115");
    // 예전 이름(kstDay·kstYesterday)도 같은 값
    expect(kstDay(kst(2026, 11, 15, 4, 59, 59))).toBe("20261114");
    expect(kstYesterday(kst(2026, 11, 15, 5))).toBe("20261114");
    expect(gameYesterday(kst(2026, 11, 15, 4))).toBe("20261113");
  });

  it("오늘(11/14 토) 배포: 새벽 5시 뒤라면 어느 시각이든 예전(자정 기준) 키와 같다 → 기록이 끊기지 않는다", () => {
    const oldKey = (t: number) => new Date(t + 9 * HOUR).toISOString().slice(0, 10).replaceAll("-", "");
    for (let h = 5; h < 24; h++) expect(gameDay(kst(2026, 11, 14, h, 30))).toBe(oldKey(kst(2026, 11, 14, h, 30)));
    // 새벽 0~5시에만 다르다 (예전 키는 이미 다음 날)
    for (let h = 0; h < 5; h++) expect(gameDay(kst(2026, 11, 14, h, 30))).not.toBe(oldKey(kst(2026, 11, 14, h, 30)));
  });

  it("달·해 경계: 1일 새벽 0~5시는 지난달 마지막 날, 1월 1일 새벽은 지난해 12월 31일", () => {
    expect(gameDay(kst(2026, 12, 1, 3))).toBe("20261130");
    expect(gameDay(kst(2026, 12, 1, 5))).toBe("20261201");
    expect(gameDay(kst(2027, 1, 1, 4, 59))).toBe("20261231");
    expect(gameDay(kst(2027, 1, 1, 5))).toBe("20270101");
    expect(gameDay(kst(2028, 3, 1, 2))).toBe("20280229"); // 윤년
    expect(addDays("20261201", -1)).toBe("20261130");
    expect(addDays("20261231", 1)).toBe("20270101");
  });

  it("하루 시작·다음 리셋·남은 시간", () => {
    expect(dayStartMs("20261115")).toBe(kst(2026, 11, 15, 5));
    expect(nextDayStartMs(kst(2026, 11, 15, 4, 59, 59))).toBe(kst(2026, 11, 15, 5));
    expect(nextDayStartMs(kst(2026, 11, 15, 5))).toBe(kst(2026, 11, 16, 5));
    expect(msUntilDayReset(kst(2026, 11, 15, 0))).toBe(5 * HOUR);
    expect(msUntilDayReset(kst(2026, 11, 15, 5))).toBe(24 * HOUR);
    expect(msUntilDayReset(kst(2026, 11, 15, 4, 59, 59))).toBe(1000);
  });
});

describe("주 경계 (일요일 → 월요일 새벽 5시)", () => {
  it("일요일 밤·월요일 0~4:59는 지난주, 월요일 5시부터 새 주", () => {
    expect(gameWeek(kst(2026, 11, 15, 23, 59))).toBe("20261109");
    expect(gameWeek(kst(2026, 11, 16, 0, 0))).toBe("20261109");
    expect(gameWeek(kst(2026, 11, 16, 4, 59, 59))).toBe("20261109");
    expect(gameWeek(kst(2026, 11, 16, 5))).toBe("20261116");
    expect(kstWeek(kst(2026, 11, 16, 5))).toBe("20261116");
    expect(weekOfDay(gameDay(kst(2026, 11, 16, 4)))).toBe("20261109");
    expect(weekStartMs("20261116")).toBe(kst(2026, 11, 16, 5));
    expect(weekEndMs("20261109")).toBe(kst(2026, 11, 16, 5));
    expect(nextWeekStartMs(kst(2026, 11, 16, 4, 59, 59))).toBe(kst(2026, 11, 16, 5));
    expect(nextWeekStartMs(kst(2026, 11, 16, 5))).toBe(kst(2026, 11, 23, 5));
    // 달을 넘는 주: 12/1(화) 새벽 3시는 11/30(월)의 주
    expect(gameWeek(kst(2026, 12, 1, 3))).toBe("20261130");
  });
});

describe("한도·출석이 새벽 5시에 다시 찬다 (메모리 계정 저장소, 라우트처럼 now → 날짜)", () => {
  const ip = "ip-test";
  const newAccounts = () => {
    const graves = new MemoryStore();
    return new MemoryAccounts(() => graves);
  };

  it("하루 한도: 새벽 4:59까지는 어제 한도 그대로, 5시에 다시 찬다", async () => {
    const acc = newAccounts();
    const id = "a".repeat(21);
    await acc.enter(id, { name: "밤샘" }, kst(2026, 11, 14, 22));
    const max = earnRule("hunt").dailyMax;
    expect(await acc.earn(id, "hunt", kstDay(kst(2026, 11, 14, 22)), { amount: max })).toBe(max);
    // 자정이 지나도(예전엔 여기서 다시 찼다) 아직 같은 날
    expect(await acc.earn(id, "hunt", kstDay(kst(2026, 11, 15, 0, 30)), { amount: 10 })).toBe(0);
    expect(await acc.earn(id, "hunt", kstDay(kst(2026, 11, 15, 4, 59, 59)), { amount: 10 })).toBe(0);
    expect(await acc.earn(id, "hunt", kstDay(kst(2026, 11, 15, 5)), { amount: 10 })).toBe(10);
    expect((await acc.get(id, kstDay(kst(2026, 11, 15, 5)), kst(2026, 11, 15, 5))).todayEarned).toBe(10);
  });

  /** 머무르기 n번 (now부터 9.5분 간격) → 마지막 시각 */
  async function stay(acc: MemoryAccounts, id: string, from: number, n: number): Promise<number> {
    let t = from;
    for (let i = 0; i < n; i++, t += PRESENCE_MIN_GAP_MS) expect(await acc.presence(id, kstDay(t), t)).not.toBeNull();
    return t;
  }
  /** 출석 받기 라우트(app/api/me/calendar/claim)와 같은 계산 */
  const claimAt = (acc: MemoryAccounts, id: string, now: number) => {
    const day = kstDay(now);
    return acc.claimAttend(id, ip, day, kstYesterday(now), daysInMonth(day.slice(0, 6)), ATTEND_STAY_TICKS);
  };

  it("출석 연속(밤샘 플레이): 밤 11시에 받고 새벽 3시엔 이미 받음, 5시 뒤 받으면 연속 2일 · 하루 건너뛰면 1부터", async () => {
    const acc = newAccounts();
    const id = "b".repeat(21);
    await acc.enter(id, { name: "밤샘" }, kst(2026, 11, 14, 21));
    await stay(acc, id, kst(2026, 11, 14, 21), ATTEND_STAY_TICKS);
    expect(await claimAt(acc, id, kst(2026, 11, 14, 23))).toMatchObject({ ok: true, streak: 1 });
    // 자정을 넘겨 새벽 3시: 아직 11/14 → 이미 받음
    expect(await claimAt(acc, id, kst(2026, 11, 15, 3))).toEqual({ ok: false, reason: "already" });
    // 새벽 4시 반부터 계속 놀다가 5시 넘어 받기: 새벽 4~5시 머문 기록은 전날 몫이라 5시 뒤로 1시간 더 머물러야 한다
    const t = await stay(acc, id, kst(2026, 11, 15, 4, 30), 3); // 4:30 · 4:39.5 · 4:49
    expect((await acc.get(id, "20261114", t)).stayTicks).toBe(ATTEND_STAY_TICKS + 3);
    expect((await acc.get(id, "20261115", t)).stayTicks).toBe(0);
    const t2 = await stay(acc, id, kst(2026, 11, 15, 5, 30), ATTEND_STAY_TICKS);
    expect(await claimAt(acc, id, t2)).toMatchObject({ ok: true, streak: 2 });
    expect((await acc.get(id, "20261115", t2)).lastAttend).toBe("20261115");
    // 11/16을 건너뛰고 11/17 새벽 4시(= 11/16)에 받으면 이어지고, 그다음 11/18 6시(11/17 건너뜀)는 끊긴다
    await stay(acc, id, kst(2026, 11, 17, 3), ATTEND_STAY_TICKS);
    expect(await claimAt(acc, id, kst(2026, 11, 17, 4))).toMatchObject({ ok: true, streak: 3 });
    await stay(acc, id, kst(2026, 11, 18, 5), ATTEND_STAY_TICKS);
    expect(await claimAt(acc, id, kst(2026, 11, 18, 6))).toMatchObject({ ok: true, streak: 1 });
  });

  it("달 경계: 12/1 새벽 3시에 받으면 11월 30일 칸, 5시 뒤 받으면 12월 1일 칸", async () => {
    const acc = newAccounts();
    const id = "c".repeat(21);
    await acc.enter(id, { name: "월말" }, kst(2026, 11, 30, 20));
    await stay(acc, id, kst(2026, 12, 1, 1), ATTEND_STAY_TICKS);
    expect(await claimAt(acc, id, kst(2026, 12, 1, 3))).toMatchObject({ ok: true });
    expect(Object.keys((await acc.attendCalendar(id, "202611")).days)).toEqual(["30"]);
    expect((await acc.attendCalendar(id, "202612")).days).toEqual({});
    await stay(acc, id, kst(2026, 12, 1, 5), ATTEND_STAY_TICKS);
    expect(await claimAt(acc, id, kst(2026, 12, 1, 6, 30))).toMatchObject({ ok: true, streak: 2 });
    expect(Object.keys((await acc.attendCalendar(id, "202612")).days)).toEqual(["01"]);
    // 달력 화면: 12/1 새벽 3시의 "오늘"은 11월 30일 (이번 달 = 11월)
    const view = buildCalendar(kstDay(kst(2026, 12, 1, 3)).slice(0, 6), kstDay(kst(2026, 12, 1, 3)), { days: {}, monthBonus: null, tiers: {} }, { lastAttend: null, streak: 0, stayTicks: 0 });
    expect(view).toMatchObject({ month: "202611", today: "20261130" });
    expect(view.days.at(-1)).toMatchObject({ day: 30, state: "today" });
  });
});
