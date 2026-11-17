import { describe, expect, it } from "vitest";
import { isShopListed, itemById, permanentPrice, PERMANENT_MULTIPLIER } from "@tomb/protocol";
import { pickDiscount } from "../champPerks";
import { furnitureById } from "../housing/catalog";
import { discountedPrice } from "../titles";
import { GHOST_DEAL_RATE, GHOST_LIMITED, GHOST_PRICEY, GHOST_SALE_RATE, ghostClock, ghostCost, ghostLimitedOf, ghostOpen, ghostPresence, ghostStock, ghostWeek } from "./ghostShip";

// 11/17 유령선 특가 장터 순수 규칙
/** 한국 시각 → epoch ms (2026-11-21은 토요일) */
const kst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);

describe("유령선 시간표 (토요일 밤 9~11시, 8시 50분 안개)", () => {
  it("토요일 8시 50분 전엔 없고, 안개 → 정박 → 떠나는 중 → 없음", () => {
    expect(ghostClock(kst(2026, 11, 21, 20, 49)).phase).toBe("away");
    const fog = ghostClock(kst(2026, 11, 21, 20, 55));
    expect(fog.phase).toBe("fog");
    expect(fog.presence).toBeCloseTo(0.5, 2);
    expect(ghostClock(kst(2026, 11, 21, 21, 0)).phase).toBe("docked");
    expect(ghostClock(kst(2026, 11, 21, 22, 59)).phase).toBe("docked");
    expect(ghostClock(kst(2026, 11, 21, 23, 0)).phase).toBe("leaving");
    expect(ghostClock(kst(2026, 11, 21, 23, 4)).phase).toBe("away");
    // 다른 요일 같은 시각은 없어요
    expect(ghostClock(kst(2026, 11, 20, 21, 30)).phase).toBe("away");
    expect(ghostClock(kst(2026, 11, 22, 21, 30)).phase).toBe("away");
  });

  it("다음 정박 시각을 알려요 (떠난 뒤면 다음 주 토요일)", () => {
    expect(ghostClock(kst(2026, 11, 18, 12, 0)).opensAt).toBe(kst(2026, 11, 21, 21, 0));
    expect(ghostClock(kst(2026, 11, 21, 23, 10)).opensAt).toBe(kst(2026, 11, 28, 21, 0));
    expect(ghostClock(kst(2026, 11, 21, 22, 0)).closesAt).toBe(kst(2026, 11, 21, 23, 0));
  });

  it("살 수 있는 때 = 정박 중만 (안개·떠나는 중은 안 돼요), 운영자 부르기는 아무 때나 · 보내기는 시간표 중에도 닫아요", () => {
    expect(ghostOpen(kst(2026, 11, 21, 20, 55))).toBe(false);
    expect(ghostOpen(kst(2026, 11, 21, 21, 30))).toBe(true);
    expect(ghostOpen(kst(2026, 11, 21, 23, 1))).toBe(false);
    expect(ghostOpen(kst(2026, 11, 18, 12, 0), "on")).toBe(true);
    expect(ghostOpen(kst(2026, 11, 21, 21, 30), "off")).toBe(false);
    expect(ghostPresence(kst(2026, 11, 18, 12, 0), "on")).toBe(1);
    expect(ghostPresence(kst(2026, 11, 21, 21, 30), "off")).toBe(0);
  });
});

describe("이번 주 품목 (8개)", () => {
  const weeks = ["20261116", "20261123", "20261130", "20261207", "20261214", "20270104"];

  it("같은 주면 늘 같고, 주가 바뀌면 달라져요", () => {
    expect(ghostStock("20261116")).toEqual(ghostStock("20261116"));
    expect(ghostStock("20261116").map((s) => s.key)).not.toEqual(ghostStock("20261123").map((s) => s.key));
    expect(ghostWeek(kst(2026, 11, 21, 21, 30))).toBe("20261116");
  });

  it.each(weeks)("%s: 꾸미기 4 (30%, 1,000P 넘는 것 하나는 꼭) · 가구 2 (30%) · 파격가 1 (50%) · 한정 1 (0%) · 모두 영구 · 겹치지 않아요", (week) => {
    const s = ghostStock(week);
    expect(s).toHaveLength(8);
    expect(new Set(s.map((x) => x.key)).size).toBe(8);
    const sale = s.filter((x) => x.tag === "sale");
    const cos = sale.filter((x) => x.kind === "cosmetic");
    const fur = sale.filter((x) => x.kind === "furniture");
    expect(cos).toHaveLength(4);
    expect(fur).toHaveLength(2);
    expect(sale.every((x) => x.rate === GHOST_SALE_RATE)).toBe(true);
    expect(cos.some((x) => x.base >= GHOST_PRICEY)).toBe(true);
    // 꾸미기 = 상점 영구 소장값, 가구 = 가구점 값
    for (const c of cos) {
      expect(isShopListed(itemById(c.id)!)).toBe(true);
      expect(c.base).toBe(permanentPrice(c.id));
    }
    for (const f of fur) {
      expect(furnitureById(f.id)!.ghost).toBeUndefined();
      expect(f.base).toBe(furnitureById(f.id)!.price);
    }
    const deal = s.filter((x) => x.tag === "deal");
    expect(deal).toHaveLength(1);
    expect(deal[0].rate).toBe(GHOST_DEAL_RATE);
    expect(deal[0].base).toBeGreaterThanOrEqual(deal[0].kind === "cosmetic" ? GHOST_PRICEY : 300);
    const lim = s.filter((x) => x.tag === "limited");
    expect(lim).toHaveLength(1);
    expect(lim[0].rate).toBe(0);
    const L = ghostLimitedOf(week);
    expect(lim[0]).toMatchObject({ kind: L.kind, id: L.id, base: L.price });
  });

  it("한정은 주마다 차례로 바뀌고, 상점·가구점엔 없어요", () => {
    const ids = weeks.slice(0, 3).map((w) => ghostLimitedOf(w).id);
    expect(new Set(ids).size).toBe(3);
    for (const l of GHOST_LIMITED) {
      expect(l.price).toBeGreaterThan(0);
      if (l.kind === "cosmetic") {
        const it = itemById(l.id)!;
        expect(it.ghost).toBe(true);
        expect(isShopListed(it)).toBe(false);
        expect(permanentPrice(l.id)).toBeNull();
        expect(l.price).toBe(it.price * PERMANENT_MULTIPLIER);
      } else expect(furnitureById(l.id)!.ghost).toBe(true);
    }
  });
});

describe("값 (큰 할인 하나만)", () => {
  it("유령선 30% · 칭호 · 포인트왕 20% 중 가장 큰 것 하나", () => {
    const s = { base: 1000, rate: GHOST_SALE_RATE };
    expect(ghostCost(s)).toEqual({ cost: 700, rate: 0.3 });
    expect(ghostCost(s, 0.08, 0.2)).toEqual({ cost: 700, rate: 0.3 });
    // 한정(0%)엔 포인트왕 20%가 그대로
    expect(ghostCost({ base: 1680, rate: 0 }, 0.05, 0.2)).toEqual({ cost: discountedPrice(1680, 0.2), rate: 0.2 });
    // 파격가 50%가 늘 이겨요
    expect(ghostCost({ base: 1920, rate: GHOST_DEAL_RATE }, 0.12, 0.2).rate).toBe(pickDiscount(0.5, 0.12, 0.2));
    expect(ghostCost({ base: 1920, rate: GHOST_DEAL_RATE }).cost).toBe(960);
  });
});
