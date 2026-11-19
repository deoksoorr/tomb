import { describe, expect, it } from "vitest";
import type { Bonus } from "./catalog";
import { normalize } from "./character";
import { ENHANCE_TABLE, inherit, inheritNeed, inheritPlan, inheritStep, inheritTo, SHOP_INHERIT_MULT } from "./enhance";
import { seeded } from "./formulas";
import { decodeSg, encodeShopPiece, encodeSg, enhBonus, enhMul, scaleBonus, sgBaseBonus, SG_ENH_MAX, SG_GRADE_MULT, SG_PIECES, SG_SETS, type SgGrade, type SgItem } from "./setGear";
import { rollSgFixed } from "./setGearRoll";
import type { CharacterState } from "./types";

// 11/19 강화 승계: 재료 장비를 없애고 같은 부위의 더 높은 직급 세트 장비에 강화를 옮긴다.
// 받는 단계 = 받은 뒤 기본 능력치가 재료보다 하나도 떨어지지 않는 가장 낮은 단계

/** 규칙대로 굴린 세트 장비 (세트 s·부위 p·직급 g만 정하고 옵션은 그 부위에 맞게) */
const item = (p: Partial<SgItem> = {}): SgItem => ({ u: 1, e: 0, rr: 0, f: 0, ...rollSgFixed(seeded(7 + (p.u ?? 1)), p.s ?? 0, p.p ?? 0, (p.g ?? 0) as SgGrade), ...p });
const char = (p: Partial<CharacterState> = {}): CharacterState => normalize({ level: 50, mats: { doc: 99, seal: 9, prot: 0 }, ...p });
const baseAt = (s: number, p: number, g: SgGrade, e: number): Bonus => enhBonus(scaleBonus(sgBaseBonus(SG_SETS[s], SG_PIECES[p]), SG_GRADE_MULT[g]), e);

describe("직급 배율 (11/19)", () => {
  it("사원 1.0 · 대리 1.5 · 과장 2.0 · 임원 2.5", () => {
    expect([...SG_GRADE_MULT]).toEqual([1.0, 1.5, 2.0, 2.5]);
  });
});

describe("강화 승계 단계", () => {
  it("사원 +15 → 대리 +10 · 과장 +6 · 임원 +3 (직급 차이가 클수록 많이 준다)", () => {
    expect([1, 2, 3].map((to) => inheritTo(0, 15, to as SgGrade))).toEqual([10, 6, 3]);
  });

  it("더 높은 직급으로만: 같거나 낮은 직급이면 0", () => {
    expect(inheritTo(1, 15, 1)).toBe(0);
    expect(inheritTo(2, 15, 1)).toBe(0);
  });

  it("보장: 모든 세트·부위·직급·단계 조합에서 승계 뒤 기본 능력치가 재료보다 하나도 떨어지지 않는다 (같은 세트·다른 세트 모두)", () => {
    let checked = 0;
    for (let p = 0; p < SG_PIECES.length; p++)
      for (let sa = 0; sa < SG_SETS.length; sa++)
        for (let sb = 0; sb < SG_SETS.length; sb++)
          for (let ga = 0; ga < 3; ga++)
            for (let gb = ga + 1; gb <= 3; gb++)
              for (let e = 1; e <= SG_ENH_MAX; e++) {
                const src = baseAt(sa, p, ga as SgGrade, e);
                const m = inheritStep(src, SG_GRADE_MULT[ga] * enhMul(e), { s: sb, p, g: gb as SgGrade });
                if (m === null) continue;
                const after = baseAt(sb, p, gb as SgGrade, m);
                for (const [k, v] of Object.entries(src) as [keyof Bonus, number][]) if (v > 0 && (after[k] ?? 0) > 0) expect(after[k]!, `${p} ${sa}→${sb} ${ga}→${gb} +${e}→+${m} ${k}`).toBeGreaterThanOrEqual(v);
                // 가장 낮은 단계: 한 단계 아래로는 어느 하나가 떨어진다
                if (m > 0) {
                  const below = baseAt(sb, p, gb as SgGrade, m - 1);
                  const shared = (Object.entries(src) as [keyof Bonus, number][]).filter(([k, v]) => v > 0 && (below[k] ?? 0) > 0);
                  expect(shared.some(([k, v]) => below[k]! < v)).toBe(true);
                }
                checked++;
              }
    expect(checked).toBeGreaterThan(1000);
  });

  it("비용은 받는 강화까지 한 번에 성공한 포인트 합 · 결재 서류 m장", () => {
    expect(inheritNeed(5)).toEqual({ cost: ENHANCE_TABLE.slice(1, 6).reduce((n, r) => n + r.cost, 0), doc: 5 });
    expect(inheritNeed(0)).toEqual({ cost: 0, doc: 0 });
  });
});

describe("강화 승계", () => {
  it("사원 무기 +15 → 대리 무기: 재료는 사라지고, 끼고 있던 칸에 받은 장비를 끼며, 미리보기 줄이 떨어지지 않는다", () => {
    const old = encodeSg(item({ u: 1, e: 15, f: 4, g: 0 }));
    const fresh = encodeSg(item({ u: 2, e: 0, s: 0, g: 1 }));
    const s = char({ sg: [old, fresh], sgN: 3, equip: { weapon: old, armor: null, head: null, acc1: null, acc2: null } });
    const plan = inheritPlan(s, { sg: 1 }, { sg: 2 });
    expect(plan.ok && plan.m).toBe(inheritTo(0, 15, 1));
    if (plan.ok) for (const [, a, b] of plan.lines) if (a > 0 && b > 0) expect(b).toBeGreaterThanOrEqual(a);
    const r = inherit(s, { sg: 1 }, { sg: 2 });
    const m = inheritTo(0, 15, 1);
    expect(r.cost).toBe(inheritNeed(m).cost);
    expect(r.result).toMatchObject({ src: 15, from: 0, to: m });
    expect(r.state.sg).toHaveLength(1);
    expect(decodeSg(r.state.sg![0])).toMatchObject({ u: 2, e: m, f: 0 });
    expect(r.state.equip.weapon).toBe(r.state.sg![0]);
    expect(r.state.mats!.doc).toBe(99 - m);
  });

  it("강화한 상점 장비 → 사원급 세트 무기 (상점 장비는 사원보다 아래 직급), 능력치는 떨어지지 않는다", () => {
    const pc = encodeShopPiece({ id: "w_stamp", e: 10, u: 5, f: 0 });
    const tgt = encodeSg(item({ u: 6, g: 0 }));
    const s = char({ si: [pc], sg: [tgt], sgN: 7, equip: { weapon: pc, armor: null, head: null, acc1: null, acc2: null } });
    const plan = inheritPlan(s, { piece: 5 }, { sg: 6 });
    expect(plan.ok).toBe(true);
    if (plan.ok) for (const [, a, b] of plan.lines) if (a > 0 && b > 0) expect(b).toBeGreaterThanOrEqual(a);
    expect(SHOP_INHERIT_MULT).toBeLessThan(SG_GRADE_MULT[0]);
    const r = inherit(s, { piece: 5 }, { sg: 6 });
    expect(r.state.si ?? []).toHaveLength(0);
    expect(r.state.equip.weapon).toBe(r.state.sg![0]);
  });

  it("막는 경우: 다른 부위, 같은 장비, 같거나 낮은 직급, 상점 장비로 받기, 옮길 게 없음, 이미 더 높음, 서류 모자람", () => {
    const wpn = encodeSg(item({ u: 1, e: 15, p: 0, g: 0 }));
    const armor = encodeSg(item({ u: 2, e: 0, p: 1, g: 1 }));
    const same = encodeSg(item({ u: 3, e: 0, p: 0, g: 0 }));
    const hiDone = encodeSg(item({ u: 4, e: 12, p: 0, g: 1 }));
    const weak = encodeSg(item({ u: 5, e: 2, p: 0, g: 0 }));
    const top = encodeSg(item({ u: 8, e: 0, p: 0, g: 3 }));
    const s = char({ sg: [wpn, armor, same, hiDone, weak, top], sgN: 9, inv: { w_ruler: 1 } });
    const why = (p: ReturnType<typeof inheritPlan>) => (p.ok ? "" : p.why);
    expect(why(inheritPlan(s, { sg: 1 }, { sg: 2 }))).toContain("같은 부위");
    expect(why(inheritPlan(s, { sg: 1 }, { sg: 1 }))).toContain("같은 장비");
    expect(why(inheritPlan(s, { sg: 1 }, { sg: 3 }))).toContain("더 높은 직급");
    expect(why(inheritPlan(s, { sg: 8 }, { sg: 1 }))).toContain("더 높은 직급");
    expect(why(inheritPlan(s, { sg: 1 }, { shop: "w_ruler" }))).toContain("세트 장비로만");
    expect(why(inheritPlan(s, { sg: 5 }, { sg: 8 }))).toContain("옮길 강화가 없어요");
    expect(why(inheritPlan(s, { sg: 1 }, { sg: 4 }))).toContain("이미 +12");
    expect(() => inherit(char({ sg: [wpn, encodeSg(item({ u: 9, e: 0, g: 1 }))], sgN: 10, mats: { doc: 1, seal: 0, prot: 0 } }), { sg: 1 }, { sg: 9 })).toThrow(/결재 서류/);
  });
});
