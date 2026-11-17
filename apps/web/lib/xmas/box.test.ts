import { describe, expect, it } from "vitest";
import { isShopListed, itemById, permanentPrice, XMAS_BOX_ID, XMAS_SET_IDS } from "@tomb/protocol";
import { ShopBuySchema } from "../validate";
import { rollXmasBox, XMAS_BOX_FALLBACK, XMAS_BOX_TABLE, xmasCandidates, xmasOdds, xmasSlot } from "./box";

// 12월 크리스마스 선물상자: 무작위 뽑기 · 가진 것 빼기 · 다 가졌을 때 대체 보상

describe("크리스마스 선물상자 표", () => {
  it("표는 카탈로그의 크리스마스 꾸미기 전부를 한 번씩, 무게 합 100, 흔한 것부터", () => {
    expect([...XMAS_BOX_TABLE.map((r) => r.id)].sort()).toEqual([...XMAS_SET_IDS].sort());
    expect(XMAS_BOX_TABLE.reduce((n, r) => n + r.weight, 0)).toBe(100);
    const w = XMAS_BOX_TABLE.map((r) => r.weight);
    expect([...w].sort((a, b) => b - a)).toEqual(w);
    for (const id of XMAS_SET_IDS) expect(xmasSlot(id), id).not.toBeNull();
    expect(xmasSlot("hat_cat")).toBeNull();
  });

  it("세트와 상자는 상점에 없고 사거나 영구로 살 수 없다", () => {
    for (const id of [...XMAS_SET_IDS, XMAS_BOX_ID]) {
      const it = itemById(id)!;
      expect(it.event, id).toBe(true);
      expect(isShopListed(it), id).toBe(false);
      expect(permanentPrice(id), id).toBeNull();
      expect(ShopBuySchema.safeParse({ itemId: id }).success, id).toBe(false);
    }
    expect(itemById(XMAS_BOX_ID)?.kind).toBe("box");
  });
});

describe("뽑기", () => {
  it("roll이 무게 구간을 따라 고른다 (0 → 맨 앞, 1에 가까우면 맨 뒤)", () => {
    const none = new Set<string>();
    expect(rollXmasBox(none, 0)).toEqual({ kind: "cosmetic", id: "xm_bells" });
    expect(rollXmasBox(none, 0.189)).toEqual({ kind: "cosmetic", id: "xm_bells" });
    expect(rollXmasBox(none, 0.19)).toEqual({ kind: "cosmetic", id: "xm_name" });
    expect(rollXmasBox(none, 0.985)).toEqual({ kind: "cosmetic", id: "xm_deer" });
    // 마지막 1% = 루돌프 썰매
    expect(rollXmasBox(none, 0.99)).toEqual({ kind: "cosmetic", id: "xm_sleigh" });
    expect(rollXmasBox(none, 0.99999)).toEqual({ kind: "cosmetic", id: "xm_sleigh" });
    // 범위 밖 값도 안전하게
    expect(rollXmasBox(none, 1)).toEqual({ kind: "cosmetic", id: "xm_sleigh" });
    expect(rollXmasBox(none, -3)).toEqual({ kind: "cosmetic", id: "xm_bells" });
  });

  it("이미 가진 것은 나오지 않고, 남은 것끼리 비율이 다시 맞춰진다", () => {
    const owned = new Set(["xm_bells", "xm_name", "xm_scarf"]);
    for (let i = 0; i < 1000; i++) {
      const p = rollXmasBox(owned, i / 1000);
      expect(p.kind).toBe("cosmetic");
      if (p.kind === "cosmetic") expect(owned.has(p.id)).toBe(false);
    }
    const odds = xmasOdds(owned);
    expect(odds.map((o) => o.id)).toEqual(["xm_cane", "xm_plate", "xm_crown", "xm_snow", "xm_cape", "xm_deer", "xm_sleigh"]);
    expect(odds.reduce((n, o) => n + o.p, 0)).toBeCloseTo(1, 10);
    expect(odds[0].p).toBeCloseTo(14 / 47, 10);
  });

  it("하나만 남으면 늘 그것", () => {
    const owned = new Set(XMAS_SET_IDS.filter((id) => id !== "xm_cape"));
    expect(xmasCandidates(owned).map((r) => r.id)).toEqual(["xm_cape"]);
    for (const r of [0, 0.5, 0.999]) expect(rollXmasBox(owned, r)).toEqual({ kind: "cosmetic", id: "xm_cape" });
  });

  it("다 가지고 있으면 대체 보상 (별 폭죽)", () => {
    const all = new Set(XMAS_SET_IDS);
    expect(xmasOdds(all)).toEqual([]);
    expect(rollXmasBox(all, 0.3)).toEqual({ kind: "fallback", ...XMAS_BOX_FALLBACK });
    expect(itemById(XMAS_BOX_FALLBACK.itemId)?.kind).toBe("firework");
  });

  it("고르게 굴리면 표 비율과 같다", () => {
    const n = 10_000;
    const got = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const p = rollXmasBox(new Set(), (i + 0.5) / n);
      if (p.kind === "cosmetic") got.set(p.id, (got.get(p.id) ?? 0) + 1);
    }
    for (const r of XMAS_BOX_TABLE) expect((got.get(r.id) ?? 0) / n).toBeCloseTo(r.weight / 100, 3);
  });
});
