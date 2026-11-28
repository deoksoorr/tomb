import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFS } from "@/lib/rpg/catalog";
import { SG_CHEST_CHANCE } from "@/lib/rpg/setGearRoll";
import { TOWER_CHEST_FROM } from "@/lib/rpg/tower";
import { AUTO_CATCH_CHANCE, AUTO_FISH_EVERY_MS } from "@/lib/forage/auto";
import { chestRows, cosDaysRows, cosTierRows, dyeRows, enhanceRows, forageFacts, gearAtLeastOne, gradeBands, gradeOddsText, gradeRows, huntRows, lotteryAny, pct, pieceRows, potionRows, rarityRows, wishRows, xmasRows } from "./oddsData";

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

  it("자동 낚시 숫자는 규칙 상수에서 읽는다 (11/19 30초마다 25%)", () => {
    expect(forageFacts()).toMatchObject({ autoEvery: `${AUTO_FISH_EVERY_MS / 1000}초`, autoCatch: pct(AUTO_CATCH_CHANCE) });
    expect(forageFacts().autoCatch).toBe("25%");
  });

  it("합이 100%인 표는 100%에 가깝다", () => {
    for (const rows of [potionRows(), pieceRows(), cosDaysRows(), wishRows(), xmasRows()]) expect(sum(rows, 1)).toBeCloseTo(100, 0);
    expect(sum(rarityRows(), 2)).toBeCloseTo(100, 0);
    for (const r of cosTierRows().rows) expect(r.slice(1).reduce((n, c) => n + (c.endsWith("%") ? Number(c.replace("%", "")) : 0), 0)).toBeCloseTo(100, 0);
  });

  it("11/19 세트 장비는 천장 없이 기본 확률 그대로", () => {
    const row = chestRows().find((r) => r[0] === "세트 장비")!;
    expect(row[1]).toContain(pct(SG_CHEST_CHANCE));
    expect(row[1]).not.toMatch(/반드시|평균/);
    expect(chestRows().length).toBeGreaterThanOrEqual(4);
  });

  it("11/27 직급 표는 상자 층 구간마다 섞인 확률 그대로 (운영자 확정 표), 마지막은 끝이 없다", () => {
    const b = gradeBands();
    expect(b[0].from).toBeGreaterThanOrEqual(TOWER_CHEST_FROM);
    expect(b[b.length - 1].to).toBeNull();
    expect(gradeRows()).toEqual([
      ["55~100층", "사원급 100%"],
      ["105~125층", "대리급 100%"],
      ["130~150층", "대리급 70% · 과장급 30%"],
      ["155층", "과장급 100%"],
      ["160~175층", "과장급 80% · 임원급 20%"],
      ["180~200층", "과장급 50% · 임원급 50%"],
      ["205층부터", "임원급 100%"],
    ]);
    expect(gradeOddsText([0, 70, 30, 0])).toBe("대리급 70% · 과장급 30%");
    expect(gradeOddsText([0, 0, 100, 0])).toBe("과장급");
  });

  it("인감 도장·꾸미기 등급 표도 실제 상자 층으로 끊는다 (경계 101·151층은 그대로)", () => {
    expect(chestRows().find((r) => r[0] === "인감 도장")![1]).toBe("105층부터 1개, 155층부터 2개예요.");
    expect(cosTierRows().rows.map((r) => r[0])).toEqual(["55~100층", "105~150층", "155층부터"]);
  });

  it("강화 표는 +1부터 있고 확률이 0~100%", () => {
    const rows = enhanceRows();
    expect(rows[0][0]).toBe("+1");
    for (const r of rows) expect(Number(r[1].replace("%", ""))).toBeGreaterThan(0);
    // 11/20 증폭권·천장 칸 (천장은 사용자 「약 2배로」 뒤 값)
    expect(rows[3]).toEqual(["+4", "65%", "1장으로 100%", "4번", "300P"]);
    expect(rows[14]).toEqual(["+15", "4%", "4장으로 8%", "84번", "4,000P"]);
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

describe("11/27 야근 빌딩 상자 물약", () => {
  it("60층부터 바로 되팔기 값으로 포인트가 된다는 말이 있다", () => {
    const row = chestRows().find((r) => r[0] === "물약")!;
    expect(row[1]).toContain("60층부터 상자에서 나온 물약은 바로 되팔기 값으로 포인트가 돼요");
  });
});
