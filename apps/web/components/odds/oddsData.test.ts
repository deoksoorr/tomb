import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFS } from "@/lib/rpg/catalog";
import { SG_CHEST_CHANCE } from "@/lib/rpg/setGearRoll";
import { chestRows, cosDaysRows, cosTierRows, dyeRows, enhanceRows, gearAtLeastOne, gradeBands, huntRows, lotteryAny, pct, pieceRows, potionRows, rarityRows, setGearLongRun, wishRows, xmasRows } from "./oddsData";

const sum = (rows: string[][], col: number) => rows.reduce((n, r) => n + Number(r[col].replace("%", "")), 0);

describe("확률 안내 숫자", () => {
  it("퍼센트는 소수 둘째 자리까지, 끝 0은 뺀다", () => {
    expect(pct(0.5)).toBe("50%");
    expect(pct(0.003)).toBe("0.3%");
    expect(pct(0.0015)).toBe("0.15%");
    expect(pct(0.12345)).toBe("12.35%");
  });

  it("사냥터 표는 난이도마다 한 칸이고 규칙 값을 그대로 쓴다", () => {
    const rows = huntRows();
    for (const r of rows) expect(r).toHaveLength(DIFFICULTIES.length + 1);
    expect(rows[0].slice(1)).toEqual(DIFFICULTIES.map((d) => pct(DIFFS[d].bossDropChance)));
    for (const d of DIFFICULTIES) {
      expect(gearAtLeastOne(d)).toBeGreaterThanOrEqual(DIFFS[d].bossDropChance);
      expect(gearAtLeastOne(d)).toBeLessThan(1);
    }
  });

  it("합이 100%인 표는 100%에 가깝다", () => {
    for (const rows of [potionRows(), pieceRows(), cosDaysRows(), wishRows(), xmasRows()]) expect(sum(rows, 1)).toBeCloseTo(100, 0);
    expect(sum(rarityRows(), 2)).toBeCloseTo(100, 0);
    for (const r of cosTierRows().rows) expect(r.slice(1).reduce((n, c) => n + (c.endsWith("%") ? Number(c.replace("%", "")) : 0), 0)).toBeCloseTo(100, 0);
  });

  it("세트 장비 평균 확률은 천장 때문에 기본 확률보다 높다", () => {
    expect(setGearLongRun()).toBeGreaterThan(SG_CHEST_CHANCE);
    expect(setGearLongRun()).toBeLessThan(0.5);
    expect(chestRows().length).toBeGreaterThanOrEqual(4);
  });

  it("직급 구간은 우두머리 층부터 끊김 없이 이어지고 마지막은 끝이 없다", () => {
    const b = gradeBands();
    expect(b[0].from).toBe(5);
    expect(b[b.length - 1].to).toBeNull();
    expect(new Set(b.map((x) => x.name)).size).toBe(b.length);
  });

  it("강화 표는 +1부터 있고 확률이 0~100%", () => {
    const rows = enhanceRows();
    expect(rows[0][0]).toBe("+1");
    for (const r of rows) expect(Number(r[1].replace("%", ""))).toBeGreaterThan(0);
  });

  it("염색권마다 특수 색 확률이 있다", () => {
    const rows = dyeRows();
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) expect(r[1]).toMatch(/%$/);
  });

  it("행운권 당첨 확률은 산 사람 수로 나눈다", () => {
    expect(lotteryAny(0)).toBe(0);
    expect(lotteryAny(2)).toBe(1);
    expect(lotteryAny(100)).toBeCloseTo(0.03);
  });
});
