import { describe, expect, it } from "vitest";
import { earnedBySource, earnGaugeRows, gaugeOf, MAIN_SOURCES, resetLeftText } from "./earnGauge";
import { DAILY_EARN_CAP, EARN_RULES, earnRule } from "./economy";

describe("gaugeOf (막대 하나)", () => {
  it("0이면 빈 막대, 아직 덜 찼으면 비율만큼", () => {
    expect(gaugeOf(0, 300)).toEqual({ value: 0, earned: 0, extra: 0, max: 300, ratio: 0, full: false });
    expect(gaugeOf(120, 1200)).toEqual({ value: 120, earned: 120, extra: 0, max: 1200, ratio: 0.1, full: false });
  });

  it("딱 맞거나 넘치면 막대는 100%에서 멈추고 완료, 숫자는 실제로 받은 값과 넘친 몫 (11/16 이벤트로 더 받은 몫)", () => {
    expect(gaugeOf(300, 300)).toEqual({ value: 300, earned: 300, extra: 0, max: 300, ratio: 1, full: true });
    expect(gaugeOf(999, 300)).toEqual({ value: 300, earned: 999, extra: 699, max: 300, ratio: 1, full: true });
  });

  it("음수·NaN·한도 0은 빈 막대 (0으로 나누지 않는다)", () => {
    expect(gaugeOf(-5, 300)).toMatchObject({ value: 0, ratio: 0, full: false });
    expect(gaugeOf(Number.NaN, 300)).toMatchObject({ value: 0, ratio: 0 });
    expect(gaugeOf(10, 0)).toEqual({ value: 0, earned: 10, extra: 10, max: 0, ratio: 0, full: false });
  });
});

describe("earnedBySource (오늘 적립 해시 → 항목별)", () => {
  it("항목 필드만 숫자로, 내부 필드(_total·_stay·_bonus)와 모르는 필드·0은 뺀다", () => {
    const by = earnedBySource(
      new Map<string, string>([
        ["_total", "142"],
        ["_stay", "6"],
        ["_bonus", "1"],
        ["hunt", "120"],
        ["flower", "2"],
        ["bugs", "0"],
        ["nope", "9"],
        ["stayBonus", "10"],
      ]),
    );
    expect(by).toEqual({ hunt: 120, flower: 2, stayBonus: 10 });
  });
});

describe("earnGaugeRows (화면 목록)", () => {
  it("큰 게이지는 하루 전체 한도, 많이 쓰는 항목이 위, 한도 값은 EARN_RULES 그대로", () => {
    const v = earnGaugeRows(450, { hunt: 120, fish: 300, bugs: 30 });
    expect(v.total).toEqual(gaugeOf(450, DAILY_EARN_CAP));
    expect(v.main.map((r) => r.source)).toEqual([...MAIN_SOURCES]);
    expect(v.main[0]).toMatchObject({ source: "hunt", label: earnRule("hunt").label, value: 120, max: earnRule("hunt").dailyMax, full: false });
    expect(v.main.find((r) => r.source === "fish")).toMatchObject({ value: 300, full: true });
    expect(v.main.find((r) => r.source === "stars")).toMatchObject({ value: 0, full: false });
  });

  it("모든 항목이 한 번씩만 나온다. 7일 연속·한 달 개근은 받은 날에만", () => {
    const all = (v: ReturnType<typeof earnGaugeRows>) => [...v.main, ...v.rest, ...v.separate].map((r) => r.source);
    const plain = all(earnGaugeRows(0));
    expect(new Set(plain).size).toBe(plain.length);
    expect(plain.sort()).toEqual(EARN_RULES.map((r) => r.source).filter((s) => s !== "streak" && s !== "monthly").sort());
    expect(all(earnGaugeRows(0, { streak: 30 }))).toContain("streak");
  });

  it("하루 한도에 드는 항목 한도의 합 = DAILY_EARN_CAP (출석·접속 보너스는 따로 묶인다)", () => {
    const v = earnGaugeRows(0);
    expect([...v.main, ...v.rest].reduce((n, r) => n + r.max, 0)).toBe(DAILY_EARN_CAP);
    expect(v.separate.map((r) => r.source)).toEqual(["attend", "stayBonus"]);
    expect(v.rest[0].source).toBe("dex");
  });

  it("하루 합계가 한도를 넘어도 큰 게이지는 꽉 찬 완료", () => {
    expect(earnGaugeRows(DAILY_EARN_CAP + 10).total).toMatchObject({ value: DAILY_EARN_CAP, ratio: 1, full: true });
  });
});

describe("resetLeftText", () => {
  it("시간·분, 1분 미만은 1분", () => {
    expect(resetLeftText(3 * 3_600_000 + 20 * 60_000)).toBe("3시간 20분");
    expect(resetLeftText(2 * 3_600_000)).toBe("2시간");
    expect(resetLeftText(45 * 60_000)).toBe("45분");
    expect(resetLeftText(10_000)).toBe("1분");
  });
});
