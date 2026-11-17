import { describe, expect, it } from "vitest";
import { champBitsOf, CHAMP_AURA_OFF } from "@tomb/protocol";
import {
  askOf,
  champEarnPerk,
  champBoardPerkTags,
  champPerkHead,
  champPerkLines,
  champShopDiscount,
  champSpeedAdd,
  champStayBonus,
  champTotalCap,
  champUntilText,
  earnTerms,
  furnitureDiscount,
  paidOfTerms,
  pickDiscount,
  raceShare,
  stayBonusAsk,
} from "./champPerks";
import { DAILY_EARN_CAP, earnRule } from "./economy";
import { NO_BOOST, type EarnBoost } from "./pointEvent";
import { STAY_BONUS_AMOUNTS, STAY_BONUS_DAILY_MAX, stayBonusAmounts, stayBonusState, stayBonusSum } from "./stayBonus";
import { discountedPrice } from "./titles";

const ev = (mult: number, ...sources: EarnBoost["on"]): EarnBoost => ({ mult, on: sources, caps: sources });

describe("1위 혜택 — 적립 % 와 한도 (이벤트 배수에 더하기)", () => {
  it("낚시왕 판매: 평소 1.2배·한도 450, 주말 2배 이벤트면 2.2배·한도 750 (2.4배가 아니다)", () => {
    const plain = earnTerms(NO_BOOST, "fish", ["fish"]);
    expect(plain).toMatchObject({ m100: 120, race100: 100, dailyMax: 450, raceMax: 300, champ: true });
    expect(askOf(100, plain.m100)).toBe(120);
    const weekend = earnTerms(ev(2, "fish"), "fish", ["fish"]);
    expect(weekend).toMatchObject({ m100: 220, race100: 200, dailyMax: 750, raceMax: 600 });
    expect(askOf(100, weekend.m100)).toBe(220);
    // 3배 이벤트: 3.2배, 300 × 3 + 150
    expect(earnTerms(ev(3, "fish"), "fish", ["fish"])).toMatchObject({ m100: 320, dailyMax: 1050 });
    // 이벤트가 다른 항목이면 물고기는 1.2배 그대로
    expect(earnTerms(ev(2, "hunt"), "fish", ["fish"])).toMatchObject({ m100: 120, dailyMax: 450 });
  });

  it("1위가 아니거나 다른 랭킹 1위면 그 항목은 원래대로 (레이스 몫을 따로 세지 않는다)", () => {
    expect(earnTerms(ev(2, "fish"), "fish", [])).toMatchObject({ m100: 200, dailyMax: 600, champ: false });
    expect(earnTerms(NO_BOOST, "fish", ["points", "huntKills"])).toMatchObject({ m100: 100, dailyMax: 300, champ: false });
    expect(champEarnPerk(["fish"], "gather")).toEqual({ pct: 0, cap: 0 });
  });

  it("사냥왕: 사냥터 한도만 +300 (적립 %는 없다), 이벤트 날 1200 × 2 + 300", () => {
    const hunt = earnRule("hunt").dailyMax;
    expect(earnTerms(NO_BOOST, "hunt", ["huntKills"])).toMatchObject({ m100: 100, dailyMax: hunt + 300, raceMax: hunt, champ: true });
    expect(earnTerms(ev(2, "hunt"), "hunt", ["huntKills"])).toMatchObject({ m100: 200, dailyMax: hunt * 2 + 300, raceMax: hunt * 2 });
  });

  it("포인트왕 머무르기: 5P × 1.15 = 5.75 → 6P, 이벤트 날 5 × 2.15 = 10.75 → 11P, 한도 60 + 30 (정수 계산이라 소수 오차가 없다)", () => {
    const p = earnTerms(NO_BOOST, "presence", ["points"]);
    expect(p).toMatchObject({ m100: 115, dailyMax: 90, raceMax: 60 });
    expect(askOf(5, p.m100)).toBe(6);
    expect(askOf(5 * 3, p.m100)).toBe(17); // 몰아서 3번 = 17.25
    const e = earnTerms(ev(2, "presence"), "presence", ["points"]);
    expect(askOf(5, e.m100)).toBe(11);
    expect(e.dailyMax).toBe(60 * 2 + 30);
  });

  it("하루 전체 한도는 그 사람의 1위 몫만큼 같이 오른다 (접속 시간 보너스는 하루 전체 한도 밖)", () => {
    expect(champTotalCap(NO_BOOST, [])).toBe(DAILY_EARN_CAP);
    expect(champTotalCap(NO_BOOST, ["fish"])).toBe(DAILY_EARN_CAP + 150);
    expect(champTotalCap(NO_BOOST, ["points"])).toBe(DAILY_EARN_CAP + 30);
    expect(champTotalCap(ev(2, "fish"), ["fish"])).toBe(DAILY_EARN_CAP + 300 + 150);
    // 3관왕: 사냥 300 + 물고기 150 + 머무르기 30
    expect(champTotalCap(NO_BOOST, ["points", "huntKills", "fish"])).toBe(DAILY_EARN_CAP + 480);
    expect(earnTerms(NO_BOOST, "flower", ["points", "huntKills", "fish"]).total).toBe(DAILY_EARN_CAP + 480);
  });
});

describe("1위 혜택 — 레이스에서 빼는 몫", () => {
  /** 저장소 credit을 흉내 낸다: 항목 한도 안에서 주고, 1위가 아니었으면 받았을 몫만 레이스에 */
  function simulate(t: ReturnType<typeof earnTerms>, values: number[]) {
    let got = 0;
    let race = 0;
    const out: { amount: number; race: number }[] = [];
    for (const v of values) {
      const amount = Math.max(0, Math.min(askOf(v, t.m100), t.dailyMax - got));
      const r = amount > 0 && t.champ ? raceShare(amount, (v * t.race100) / 100, t.raceMax - race) : amount;
      got += amount;
      race += r;
      out.push({ amount, race: r });
    }
    return { got, race, out };
  }

  it("이벤트 날 낚시왕: 지갑 750, 레이스 600 (1위가 아닌 사람과 같다) — 늘어난 %·늘어난 한도 몫 둘 다 빠진다", () => {
    const r = simulate(earnTerms(ev(2, "fish"), "fish", ["fish"]), [100, 100, 100, 100, 100]);
    expect(r.out).toEqual([
      { amount: 220, race: 200 },
      { amount: 220, race: 200 },
      { amount: 220, race: 200 },
      // 한도 끝: 750 − 660 = 90만 받고, 레이스 한도(600)는 이미 찼다
      { amount: 90, race: 0 },
      { amount: 0, race: 0 },
    ]);
    expect(r).toMatchObject({ got: 750, race: 600 });
    expect(simulate(earnTerms(ev(2, "fish"), "fish", []), [100, 100, 100, 100]).race).toBe(600);
  });

  it("한도에 막혀 일부만 받으면 레이스 몫도 그 안에서만 (raceShare는 받은 값을 넘지 않는다)", () => {
    expect(raceShare(90, 200, 300)).toBe(90);
    expect(raceShare(220, 200, 50)).toBe(50);
    expect(raceShare(220, 200, -10)).toBe(0);
    // 평소 낚시왕: 240어치(288P)를 판 뒤 100을 팔면 120을 다 받지만 레이스에는 남은 60만
    const t = earnTerms(NO_BOOST, "fish", ["fish"]);
    const r = simulate(t, [240, 100, 100]);
    expect(r.out[0]).toEqual({ amount: 288, race: 240 });
    expect(r.out[1]).toEqual({ amount: 120, race: 60 });
    // 마지막: 450 − 408 = 42만 받고 레이스는 0
    expect(r.out[2]).toEqual({ amount: 42, race: 0 });
    expect(r).toMatchObject({ got: 450, race: 300 });
  });

  it("받은 포인트를 판 값으로 되돌리기 (paidOfTerms) — 2.2배여도 소수 오차 없이", () => {
    const t = earnTerms(ev(2, "fish"), "fish", ["fish"]);
    expect(paidOfTerms(220, 100, t)).toBe(100);
    expect(paidOfTerms(110, 100, t)).toBe(50);
    expect(paidOfTerms(111, 100, t)).toBe(51);
    expect(paidOfTerms(30, 30, earnTerms(ev(2, "fish"), "fish", []))).toBe(15);
  });
});

describe("1위 혜택 — 접속 시간 보너스 1.5배", () => {
  it("구간마다 × 1.5 반올림, 레이스에는 원래 값 (이벤트 날은 × 2.5, 레이스 × 2)", () => {
    const t = earnTerms(NO_BOOST, "stayBonus", ["points"]);
    expect(t).toMatchObject({ m100: 150, dailyMax: STAY_BONUS_DAILY_MAX + 73, raceMax: STAY_BONUS_DAILY_MAX });
    const v = stayBonusAsk(stayBonusAmounts(), t);
    expect(v.pay.slice(0, 4)).toEqual([15, 23, 30, 38]);
    expect(v.race).toEqual([...STAY_BONUS_AMOUNTS]);
    const e = stayBonusAsk(stayBonusAmounts(), earnTerms(ev(2, "stayBonus"), "stayBonus", ["points"]));
    expect(e.pay[0]).toBe(25);
    expect(e.race[0]).toBe(20);
  });

  it("화면 표시도 같은 값 (상한 145 + 73)", () => {
    const champ = champStayBonus(["points"]);
    expect(champ).toEqual({ m100: 150, cap: STAY_BONUS_DAILY_MAX + 73 });
    expect(champStayBonus(["fish"])).toBeUndefined();
    expect(stayBonusSum(0, 1, 0, champ)).toBe(15);
    // 7구간 = 15 + 23 + 30 + 38 × 4 = 220 → 상한 218에서 자른다
    expect(stayBonusSum(0, 7, 0, champ)).toBe(STAY_BONUS_DAILY_MAX + 73);
    expect(stayBonusState(21, 0, 0, champ)).toMatchObject({ count: 7, points: STAY_BONUS_DAILY_MAX + 73 });
    expect(stayBonusState(21, 0)).toMatchObject({ points: STAY_BONUS_DAILY_MAX });
  });
});

describe("1위 혜택 — 할인 (가장 큰 것 하나만)", () => {
  it("포인트왕은 꾸미기 상점·가구 상점만 20%, 염색권은 빠진다", () => {
    expect(champShopDiscount(["points"], "shop", "cosmetic")).toBe(0.2);
    expect(champShopDiscount(["points"], "shop", "firework")).toBe(0.2);
    expect(champShopDiscount(["points"], "shop", "dye")).toBe(0);
    expect(champShopDiscount(["points"], "furniture")).toBe(0.2);
    expect(champShopDiscount(["fish", "huntKills"], "shop", "cosmetic")).toBe(0);
  });

  it("칭호 할인과 겹치면 큰 할인 하나만 (더하지 않는다)", () => {
    expect(pickDiscount(0.12, champShopDiscount(["points"], "shop", "cosmetic"))).toBe(0.2);
    expect(pickDiscount(0.05, 0)).toBe(0.05);
    expect(pickDiscount()).toBe(0);
    expect(pickDiscount(undefined, null, Number.NaN, -1)).toBe(0);
    // 앞으로 생길 특가가 더 크면 그 하나 (상한 90%)
    expect(pickDiscount(0.2, 0.3)).toBe(0.3);
    expect(pickDiscount(1.5)).toBe(0.9);
    expect(discountedPrice(1000, pickDiscount(0.12, 0.2))).toBe(800);
    expect(furnitureDiscount(0.08, champBitsOf(["points"]))).toBe(0.2);
    expect(furnitureDiscount(0.08, champBitsOf(["fish"]))).toBe(0.08);
    expect(furnitureDiscount(0, undefined)).toBe(0);
  });
});

describe("1위 혜택 — 2관왕·3관왕", () => {
  it("차지한 혜택 모두 + 이동 속도 +1% (하나면 없음, 오라 끔 표시는 상관없다)", () => {
    expect(champSpeedAdd(champBitsOf(["fish"]))).toBe(0);
    expect(champSpeedAdd(champBitsOf(["points", "fish"]))).toBe(0.01);
    expect(champSpeedAdd(champBitsOf(["points", "huntKills", "fish"], true))).toBe(0.01);
    expect(champSpeedAdd(CHAMP_AURA_OFF)).toBe(0);
    expect(champSpeedAdd(undefined)).toBe(0);
    // 속도 상한: 가장 빠른 칭호 1.08 + 0.01, × 가장 빠른 타는 펫 1.35 < 화면 상한 1.48 < 서버 검증 1.5
    expect((1.08 + 0.01) * 1.35).toBeLessThan(1.48);
    const two = champPerkLines(["huntKills", "fish"]);
    expect(two).toContain("2관왕이라 마을에서 1% 더 빨리 걸어요.");
    expect(two).toContain("사냥 경험치를 15% 더 받아요.");
    expect(two).toContain("물고기를 20% 더 비싸게 팔아요.");
    const three = champPerkLines(["points", "huntKills", "fish"]);
    expect(three).toHaveLength(3 + 3 + 2 + 1);
    expect(three[three.length - 1]).toContain("3관왕");
    expect(champPerkLines(["fish"])).toHaveLength(2);
    // 문구 규칙: 「라벨: 설명」 콜론과 「A · B」 나열이 없다
    for (const l of three) expect(l).not.toMatch(/:| · /);
  });

  it("레이스 창 짧은 꼬리표는 같은 표의 숫자를 쓴다", () => {
    expect(champBoardPerkTags("huntKills")).toEqual(["사냥 경험치 +15%", "초월 경험치 +10%", "사냥 한도 +300P"]);
    expect(champBoardPerkTags("fish")).toEqual(["물고기 값 +20%", "팔기 한도 +150P"]);
    expect(champBoardPerkTags("points")).toEqual(["꾸미기와 가구 20% 할인", "머무르기 +15%", "접속 보너스 1.5배"]);
    for (const b of ["points", "huntKills", "fish"] as const) for (const t of champBoardPerkTags(b)) expect(t).not.toMatch(/:| · /);
  });

  it("2관왕이면 두 랭킹의 적립 혜택이 각자 항목에 붙는다", () => {
    expect(earnTerms(NO_BOOST, "fish", ["points", "fish"]).dailyMax).toBe(450);
    expect(earnTerms(NO_BOOST, "presence", ["points", "fish"]).dailyMax).toBe(90);
    expect(earnTerms(NO_BOOST, "hunt", ["points", "fish"]).champ).toBe(false);
  });
});

describe("1위 혜택 — 끝나는 시각 문구", () => {
  it("실제 다음 마감(월요일 새벽 5시, 한국 시간)을 날짜로", () => {
    const end = Date.UTC(2026, 10, 22, 20, 0); // 11/23(월) 05:00 KST
    expect(champUntilText(end)).toBe("11월 23일 새벽 5시");
    expect(champPerkHead(champBitsOf(["huntKills"]), end)).toBe("지난주 사냥왕 혜택이 11월 23일 새벽 5시까지 붙어 있어요.");
    expect(champPerkHead(champBitsOf(["points", "fish"]), end)).toBe("지난주 포인트왕과 낚시왕 혜택이 11월 23일 새벽 5시까지 붙어 있어요.");
    expect(champPerkHead(champBitsOf(["points", "huntKills", "fish"]), end)).toContain("포인트왕, 사냥왕, 낚시왕 혜택이");
    expect(champPerkHead(0, end)).toBe("");
    // 시험 1위처럼 분이 있는 끝
    expect(champUntilText(Date.UTC(2026, 10, 17, 6, 30))).toBe("11월 17일 오후 3시 30분");
  });
});
