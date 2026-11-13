import { describe, expect, it } from "vitest";
import { SKILLS, skillById } from "./skillTree";
import { compareStats, josa, requirements, SKILL_TEXT, skillStats, skillTypes, TYPE_TAG_GLYPH, unlocks } from "./skillText";

describe("스킬 설명 (skillText)", () => {
  it("33종 모두 요약·분위기 문장·유형이 있다", () => {
    expect(SKILLS).toHaveLength(33);
    for (const sk of SKILLS) {
      const tx = SKILL_TEXT[sk.id];
      expect(tx.summary.length, sk.id).toBeGreaterThan(8);
      expect(tx.flavor.length, sk.id).toBeGreaterThan(5);
      expect(skillTypes(sk).length, sk.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("시너지는 실제 있는 다른 스킬만 가리킨다", () => {
    for (const sk of SKILLS)
      for (const sy of SKILL_TEXT[sk.id].synergy) {
        expect(sy.with.length).toBeGreaterThan(0);
        for (const id of sy.with) expect(skillById(id), `${sk.id} → ${id}`).toBeDefined();
        expect(sy.with.every((id) => id === sk.id)).toBe(false);
      }
  });

  it("유형 태그: 패시브/궁극기/광역은 정의와 같다", () => {
    for (const sk of SKILLS) {
      const tags = skillTypes(sk);
      expect(tags.includes("passive")).toBe(sk.kind === "passive");
      expect(tags.includes("ultimate")).toBe(sk.kind === "active" && sk.tier === 5);
      expect(tags.includes("aoe")).toBe(!!sk.aoe);
      expect(new Set(tags).size).toBe(tags.length);
    }
    for (const g of Object.values(TYPE_TAG_GLYPH)) {
      expect(g).toHaveLength(7);
      for (const row of g) expect(row).toHaveLength(7);
    }
  });

  it("랭크마다 수치 표가 있고, 액티브는 SP·쿨타임, 다음 랭크는 뭔가 달라진다", () => {
    for (const sk of SKILLS) {
      for (let lv = 1; lv <= sk.maxLevel; lv++) {
        const rows = skillStats(sk, lv);
        expect(rows.length, sk.id).toBeGreaterThan(0);
        for (const r of rows) expect(r.value).not.toMatch(/NaN|undefined/);
        if (sk.kind === "active") expect(rows.map((r) => r.label)).toEqual(expect.arrayContaining(["SP", "쿨타임"]));
      }
      if (sk.maxLevel > 1) expect(compareStats(sk, 1, 2).some((r) => r.changed), sk.id).toBe(true);
    }
  });

  it("선행 조건 문구와 다음에 열리는 스킬", () => {
    const fan = skillById("em_fan")!;
    const req = requirements(fan, {});
    expect(req.map((r) => r.text)).toEqual(["2단 열기: 모닥불지기 1단에 3포인트", "불씨 튕기기 1랭크 필요"]);
    expect(req.every((r) => !r.ok)).toBe(true);
    expect(requirements(fan, { em_kindle: 3 }).map((r) => r.ok)).toEqual([true, true]);
    expect(unlocks("em_kindle").map((u) => u.def.id)).toEqual(["em_fan"]);
  });

  it("조사", () => {
    expect(josa("재의 심장", "과", "와")).toBe("재의 심장과");
    expect(josa("바람 넋", "을", "를")).toBe("바람 넋을");
    expect(josa("불씨 옮기기", "을", "를")).toBe("불씨 옮기기를");
  });
});
