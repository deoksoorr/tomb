import { describe, expect, it } from "vitest";
import { isShopListed, itemById, PERMANENT_UNTIL } from "@tomb/protocol";
import { ATTEND_STAY_MINUTES, ATTEND_STAY_TICKS, attendLeftText, durationText, STAY_TICK_MINUTES } from "./attendStay";
import { ATTEND_TIERS, attendTierPlan, permOwnedOf, pickTierItem, tierUntil } from "./attendTiers";
import { buildCalendar } from "./calendar";

const months = Array.from({ length: 24 }, (_, i) => `${2026 + Math.floor((10 + i) / 12)}${String(((10 + i) % 12) + 1).padStart(2, "0")}`);

describe("출석 구간 코디 보상", () => {
  it("구간이 오를수록 가격대·기간이 오르고, 마지막은 영구", () => {
    for (let i = 1; i < ATTEND_TIERS.length; i++) {
      const [a, b] = [ATTEND_TIERS[i - 1], ATTEND_TIERS[i]];
      expect(b.days).toBeGreaterThan(a.days);
      expect(b.minPrice).toBeGreaterThan(a.maxPrice);
      if (b.termDays !== null) expect(b.termDays).toBeGreaterThan(a.termDays!);
    }
    expect(ATTEND_TIERS.map((t) => t.days)).toEqual([3, 7, 14, 21, 28]);
    expect(ATTEND_TIERS.at(-1)!.termDays).toBeNull();
  });

  it("후보는 상점 코디(부위 있음)만, 가격대 안에서 — 펫·운영자 전용은 나오지 않는다", () => {
    for (const m of months)
      for (const t of ATTEND_TIERS) {
        const it = itemById(pickTierItem(m, t, new Set())!)!;
        expect(it.kind).toBe("cosmetic");
        expect(it.slot && it.slot !== "pet").toBeTruthy();
        expect(isShopListed(it) && !it.staff).toBe(true);
        expect(it.price).toBeGreaterThanOrEqual(t.minPrice);
        expect(it.price).toBeLessThanOrEqual(t.maxPrice);
      }
  });

  it("같은 달이면 늘 같은 보상(결정적), 바로 다음 달은 다른 보상, 한 달 안에서는 구간끼리 겹치지 않는다", () => {
    for (const m of months) {
      const a = attendTierPlan(m, {}, new Set());
      expect(attendTierPlan(m, {}, new Set())).toEqual(a);
      const ids = a.map((t) => t.itemId);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (let i = 1; i < months.length; i++) {
      const [prev, cur] = [attendTierPlan(months[i - 1], {}, new Set()), attendTierPlan(months[i], {}, new Set())];
      for (let k = 0; k < ATTEND_TIERS.length; k++) expect(cur[k].itemId).not.toBe(prev[k].itemId);
    }
  });

  it("이미 영구로 가진 꾸미기는 피한다 (가격대를 다 가졌으면 다른 가격대에서)", () => {
    const m = "202611";
    const top = ATTEND_TIERS.at(-1)!;
    const first = pickTierItem(m, top, new Set())!;
    const owned = permOwnedOf([
      { itemId: first, until: PERMANENT_UNTIL },
      { itemId: "hat_cat", until: Date.now() + 1000 }, // 기간제는 영구로 가진 것이 아니다
    ]);
    expect([...owned]).toEqual([first]);
    const plan = attendTierPlan(m, {}, owned);
    expect(plan.at(-1)!.itemId).not.toBe(first);
    expect(plan.at(-1)!.itemId).toBe(pickTierItem(m, top, owned));
    // 가격대 후보를 모두 영구로 가졌으면 다른 꾸미기 (그래도 영구 아닌 것)
    const band = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = pickTierItem(m, top, band);
      if (!id || itemById(id)!.price < top.minPrice) break;
      band.add(id);
    }
    const fallback = pickTierItem(m, top, band);
    expect(fallback && !band.has(fallback)).toBeTruthy();
  });

  it("받은 구간은 받은 꾸미기 그대로 보여 주고, 남은 구간은 그것과 겹치지 않게 고른다", () => {
    const plan = attendTierPlan("202611", { "3": "hat_crown" }, new Set());
    expect(plan[0]).toEqual({ days: 3, termDays: 3, itemId: "hat_crown", received: true });
    expect(plan.slice(1).map((t) => t.itemId)).not.toContain("hat_crown");
    expect(plan.slice(1).every((t) => !t.received)).toBe(true);
  });

  it("기간 더하기: 남은 기간이 있으면 거기에, 없으면 지금부터. 영구는 영구", () => {
    const now = 1_000_000;
    expect(tierUntil(5000, 0, now)).toBe(now + 5000);
    expect(tierUntil(5000, now + 100, now)).toBe(now + 5100);
    expect(tierUntil(5000, now - 100, now)).toBe(now + 5000);
    expect(tierUntil(null, now + 100, now)).toBe(PERMANENT_UNTIL);
    expect(tierUntil(5000, PERMANENT_UNTIL, now)).toBe(PERMANENT_UNTIL);
  });

  it("달력 화면에 보상 길이 같이 실린다 (영구로 가진 것은 빼고)", () => {
    const rec = { days: { "01": 10, "02": 10, "03": 10 }, monthBonus: null, tiers: { "3": "hat_sprout" } };
    const top = ATTEND_TIERS.at(-1)!;
    const first = pickTierItem("202611", top, new Set())!;
    const cal = buildCalendar("202611", "20261103", rec, {
      lastAttend: "20261103",
      streak: 3,
      stayTicks: 6,
      equipped: [],
      stash: [{ itemId: first, until: PERMANENT_UNTIL }],
    });
    expect(cal.tiers).toHaveLength(ATTEND_TIERS.length);
    expect(cal.tiers[0]).toMatchObject({ days: 3, itemId: "hat_sprout", received: true });
    expect(cal.tiers.at(-1)!.itemId).not.toBe(first);
  });
});

describe("출석 머문 시간 문구", () => {
  it("숫자는 머무르기 기록 수 × 10분에서", () => {
    expect(ATTEND_STAY_MINUTES).toBe(ATTEND_STAY_TICKS * STAY_TICK_MINUTES);
    expect(durationText(60)).toBe("1시간");
    expect(durationText(90)).toBe("1시간 30분");
    expect(durationText(40)).toBe("40분");
    expect(attendLeftText(ATTEND_STAY_MINUTES - 20)).toBe("아직 출석까지 20분 남았어요");
    expect(attendLeftText(ATTEND_STAY_MINUTES)).toBe("오늘 출석 도장을 찍을 수 있어요");
  });
});

describe("출석 안내 문구", () => {
  it("'묘지에 1시간' 대신 '마을에 머물면 출석 도장'으로, 시간 숫자는 상수에서", async () => {
    const { ATTEND_RULE_TEXT, ATTEND_STAY_TEXT } = await import("./attendStay");
    const { ATTEND_TIER_GUIDE } = await import("./attendTiers");
    const { EARN_RULES } = await import("./economy");
    expect(ATTEND_RULE_TEXT).toBe(`마을에 ${ATTEND_STAY_TEXT} 머물면 오늘 출석 도장을 찍을 수 있어요`);
    expect(ATTEND_RULE_TEXT).toBe("마을에 1시간 머물면 오늘 출석 도장을 찍을 수 있어요");
    expect(ATTEND_RULE_TEXT).not.toContain("묘지에");
    expect(EARN_RULES.find((r) => r.source === "attend")!.note).toContain(ATTEND_STAY_TEXT);
    expect(EARN_RULES.some((r) => r.note.includes("묘지에") || r.label.includes("묘지에"))).toBe(false);
    expect(ATTEND_TIER_GUIDE).toBe("그달 출석 3일(3일)·7일(7일)·14일(14일)·21일(30일)·28일(영구)마다 코디 1개 — 갈수록 비싼 코디, 달마다 바뀌어요");
  });
});
