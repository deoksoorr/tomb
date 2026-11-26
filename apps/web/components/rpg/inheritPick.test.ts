import { describe, expect, it } from "vitest";
import { normalize } from "@/lib/rpg/character";
import { inherit, inheritPlan } from "@/lib/rpg/enhance";
import { seeded } from "@/lib/rpg/formulas";
import { encodeShopPiece, encodeSg, type SgGrade, type SgItem } from "@/lib/rpg/setGear";
import { rollSgFixed } from "@/lib/rpg/setGearRoll";
import type { CharacterState } from "@/lib/rpg/types";
import { inheritEmptyHint, inheritSources, inheritTargets, pairKey } from "./inheritPick";

// 11/26 강화 승계 창: 받을 수 있는 장비만 · 단계 전→후 · 능력치 전→후

const item = (p: Partial<SgItem> & { u: number }): SgItem => ({
  e: 0,
  rr: 0,
  f: 0,
  ...rollSgFixed(seeded(7 + p.u), p.s ?? 0, p.p ?? 1, (p.g ?? 0) as SgGrade),
  ...p,
});
const char = (p: Partial<CharacterState> = {}): CharacterState => normalize({ level: 50, mats: { doc: 99, seal: 9, prot: 0 }, ...p });

// 갑옷: 사원 +15(1) · 대리 +0(2) · 과장 +7(3) · 임원 +0(4) / 다른 부위(머리) 임원(5) / 같은 직급 사원(6) / 강화한 상점 갑옷 +5(7)
const c = char({
  sg: [
    encodeSg(item({ u: 1, g: 0, e: 15 })),
    encodeSg(item({ u: 2, g: 1, s: 1 })),
    encodeSg(item({ u: 3, g: 2, e: 7 })),
    encodeSg(item({ u: 4, g: 3, s: 2 })),
    encodeSg(item({ u: 5, g: 3, p: 2 })),
    encodeSg(item({ u: 6, g: 0 })),
  ],
  si: [encodeShopPiece({ id: "a_hazmat", e: 5, u: 7, f: 0 })],
  sgN: 8,
});

describe("승계 대상 고르기", () => {
  it("재료(사원 +15)에서: 같은 부위의 더 높은 직급만, 이미 그 단계 이상인 것은 빼고, 직급 높은 순", () => {
    const t = inheritTargets(c, { sg: 1 });
    // 대리 +10 · 과장(이미 +7, 받으면 +6 → 안 됨) · 임원 +3 / 머리(5)·같은 직급(6)은 없음
    expect(t.map((x) => ["sg" in x.to ? x.to.sg : -1, x.cur, x.m])).toEqual([
      [4, 0, 3],
      [2, 0, 10],
    ]);
    expect(t[0].src).toMatchObject({ g: 0, e: 15 });
    expect(t[0].dst).toMatchObject({ g: 3, e: 0, set: "meeting" });
  });

  it("받는 장비(임원)에서: 재료 후보 — 사원 +15 · 과장 +7, 강화 높은 순 (상점 갑옷 +5는 임원 +0보다 약해 옮길 게 없어 빠진다)", () => {
    const s = inheritSources(c, { sg: 4 });
    expect(s.map((x) => ("sg" in x.from ? x.from.sg : x.from.piece))).toEqual([1, 3]);
    expect(inheritPlan(c, { piece: 7 }, { sg: 4 }).ok).toBe(false);
    // 모든 받는 장비에서: 후보 = inheritPlan이 되는 것과 정확히 같다
    const froms = [1, 2, 3, 4, 5, 6].map((u) => ({ sg: u }) as const);
    for (const to of froms) {
      const want = [...froms, { piece: 7 } as const].filter((f) => !("sg" in f && f.sg === to.sg) && inheritPlan(c, f, to).ok).length;
      expect(inheritSources(c, to)).toHaveLength(want);
    }
    for (const p of s) expect(p.m).toBeGreaterThan(p.cur);
  });

  it("능력치 전→후: [능력치, 재료, 받는 장비 지금, 승계 뒤] — 승계 뒤는 재료 이상", () => {
    const [p] = inheritTargets(c, { sg: 1 });
    expect(p.lines.length).toBeGreaterThan(0);
    for (const [, src, now, after] of p.lines) {
      if (src > 0 && after > 0) expect(after).toBeGreaterThanOrEqual(src);
      expect(after).toBeGreaterThanOrEqual(now);
    }
  });

  it("상점 묶음 장비는 재료가 못 된다, 없는 번호는 빈 목록", () => {
    expect(inheritTargets(c, { shop: "a_hazmat" })).toEqual([]);
    expect(inheritTargets(c, { sg: 99 })).toEqual([]);
    expect(inheritSources(c, { sg: 99 })).toEqual([]);
  });

  it("고른 짝을 서버 승계(inherit)에 그대로 넣으면 같은 단계로 성공, 재료는 사라진다", () => {
    for (const p of [...inheritTargets(c, { sg: 1 }), ...inheritSources(c, { sg: 4 })]) {
      const r = inherit(c, p.from, p.to);
      expect(r.result.to, pairKey(p)).toBe(p.m);
      expect(r.cost).toBe(p.cost);
      const gone = "sg" in p.from ? !(r.state.sg ?? []).some((x) => x.startsWith("s") && x.includes(`.${(p.from as { sg: number }).sg.toString(36)}.`)) : true;
      expect(gone).toBe(true);
    }
  });

  it("짝이 없을 때 안내: 무엇부터 준비할지 (받기·넘기기)", () => {
    // 머리 임원 +0 하나뿐 (같은 부위 다른 장비 없음)
    expect(inheritSources(c, { sg: 5 })).toEqual([]);
    expect(inheritTargets(c, { sg: 5 })).toEqual([]);
    expect(inheritEmptyHint(c, { sg: 5 })).toEqual(["받기: 과장급 이하 머리 장비를 강화해 두면 재료로 쓸 수 있어요.", "넘기기: 이 장비를 먼저 강화해야 재료로 쓸 수 있어요."]);
    // 대리 머리 +4 하나뿐 → 사원급 이하를 강화하거나 과장급 이상을 구해야
    const one = char({ sg: [encodeSg(item({ u: 1, g: 1, p: 2, e: 4 }))], sgN: 2 });
    expect(inheritEmptyHint(one, { sg: 1 })).toEqual(["받기: 사원급 이하 머리 장비를 강화해 두면 재료로 쓸 수 있어요.", "넘기기: 과장급 이상 머리 세트 장비를 먼저 구해야 해요."]);
    // 사원급은 상점 장비가 재료, 임원급은 넘길 곳이 없다
    const low = char({ sg: [encodeSg(item({ u: 1, g: 0, e: 2 })), encodeSg(item({ u: 2, g: 3, p: 2, e: 3 }))], sgN: 3 });
    expect(inheritEmptyHint(low, { sg: 1 })[0]).toBe("받기: 상점 갑옷 장비를 강화해 두면 재료로 쓸 수 있어요.");
    expect(inheritEmptyHint(low, { sg: 2 })[1]).toBe("넘기기: 임원급은 가장 높은 직급이라 넘길 곳이 없어요.");
    // 강화 안 한 상점 장비
    expect(inheritEmptyHint(c, { shop: "a_hazmat" })).toHaveLength(1);
  });
});
