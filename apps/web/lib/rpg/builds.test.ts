import { describe, expect, it } from "vitest";
import { BUILDS, buildAlloc, buildAtLevel, buildSteps, GUIDE_LEVELS } from "./builds";
import { maxDealPerSec } from "./dealCap";
import { checkAllocation, skillPointsEarned, spentPoints } from "./skillRules";
import { linkLines } from "./skillText";
import { BRANCHES, skillById, SKILL_FX, SYNERGY, synergyGuard, synergyGuardOf, synergyMul, synergyPeak, synergyTargets, type SkillId } from "./skillTree";
import { isUltimate, SKILL_SLOTS, ULT_SLOT } from "./hotbar";

// 11/19 대표 빌드 8종 + 연계 보너스 (lib/rpg/builds · skillTree SYNERGY)

describe("연계 보너스 (SYNERGY)", () => {
  it("핵심·받침은 모두 같은 갈래의 실제 스킬이고, 받침은 핵심이 아닌 다른 스킬", () => {
    for (const [core, links] of Object.entries(SYNERGY) as [SkillId, readonly { id: SkillId; pct: number }[]][]) {
      const c = skillById(core)!;
      expect(c, core).toBeDefined();
      expect(links).toHaveLength(2);
      for (const l of links) {
        const d = skillById(l.id)!;
        expect(d.branch, `${core} ← ${l.id}`).toBe(c.branch);
        expect(l.id).not.toBe(core);
        expect(l.pct).toBeGreaterThan(0);
        // 받침을 다 찍으면 받침 하나가 핵심을 2~2.3배로 (한 랭크 몫은 최대 랭크로 나눠 맞췄다 — 핵심 1 + 받침 2 최대면 약 3~3.5배)
        expect(l.pct * d.maxLevel, `${core} ← ${l.id}`).toBeGreaterThanOrEqual(0.95);
        expect(l.pct * d.maxLevel, `${core} ← ${l.id}`).toBeLessThanOrEqual(1.6);
      }
    }
  });

  it("받침 랭크마다 더해서 오르고, 안 찍으면 1배 · 핵심이 아니면 1배", () => {
    expect(synergyMul("em_meteor", {})).toBe(1);
    expect(synergyMul("em_meteor", { em_kindle: 12, em_ring: 12 })).toBeCloseTo(1 + 12 * 0.08 + 12 * 0.08);
    expect(synergyMul("em_meteor", { em_kindle: 4 })).toBeCloseTo(1.32);
    expect(synergyMul("em_kindle", { em_kindle: 12, em_ring: 12 })).toBe(1);
    expect(synergyTargets("so_chain").map((t) => t.core).sort()).toEqual(["so_friend", "so_lantern"]);
    // 넋 사슬은 흡혼 사슬의 핵심이면서 행렬 인도자의 받침
    expect(synergyMul("so_chain", { so_drain: 5, so_wisp: 12 })).toBeCloseTo(1 + 1 + 0.96);
  });

  it("몰아 찍기 > 흩어 찍기: 같은 포인트면 받침에 몬 쪽 핵심 배율이 확실히 크다", () => {
    for (const b of BUILDS) {
      const focus = buildAlloc(b, 55);
      // 받침 포인트를 같은 갈래 다른 스킬로 옮긴 배분 (규칙은 따지지 않는 배율 비교)
      const spread = { ...focus };
      for (const id of b.support) spread[id] = Math.min(spread[id] ?? 0, 1);
      for (const core of b.core) expect(synergyMul(core, focus), b.name).toBeGreaterThan(synergyMul(core, spread) + 0.3);
    }
  });

  it("설명: 핵심은 받침 랭크마다, 받침은 어느 핵심을 올리는지와 지금 오른 만큼", () => {
    const a = { em_kindle: 12, em_ring: 6, em_meteor: 1 };
    const core = linkLines("em_meteor", a);
    expect(core).toHaveLength(1);
    expect(core[0].text).toBe("연계: 불씨 튕기기 랭크마다 +8% · 불의 고리 랭크마다 +8% · 야근 빌딩에서 받는 피해 최대 −80%");
    expect(core[0].now).toBe(144);
    const sup = linkLines("em_kindle", a);
    expect(sup[0].kind).toBe("support");
    expect(sup[0].text).toContain("별똥 장작 피해 +8%");
    expect(sup[0].now).toBe(96);
    expect(linkLines("em_fan", a)).toEqual([]);
  });

  it("서버 딜 상한: 연계로 오른 핵심 피해만큼 여유를 더 준다 (대표 빌드가 기록 확인에 걸리지 않게)", () => {
    const stats = { str: 45, agi: 1, vit: 30, int: 71, dex: 30, luk: 1 };
    const eq = { weapon: "w_ppt" };
    for (const b of BUILDS) {
      const a = buildAlloc(b, 55);
      expect(synergyPeak(a), b.name).toBeGreaterThanOrEqual(Math.max(...b.core.map((c) => synergyMul(c, a))));
    }
    // 받침이 액티브라 다른 상한 몫이 없는 별똥비: 불씨 튕기기 12 → 1이면 상한이 연계 배율만큼 줄어든다
    const a = buildAlloc(BUILDS.find((b) => b.id === "meteor")!, 55);
    const low = { ...a, em_kindle: 1 };
    expect(maxDealPerSec(50, stats, eq, a) / maxDealPerSec(50, stats, eq, low)).toBeCloseTo(synergyPeak(a) / synergyPeak(low), 2);
  });
});

describe("11/19 연계 생존 (몰아 찍으면 받는 피해 −)", () => {
  it("핵심·받침을 다 찍은 대표 빌드는 최대, 흩어 찍으면(절반씩) 1/16, 핵심이 없으면 0", () => {
    for (const b of BUILDS) {
      const a = buildAlloc(b, 55);
      const g = Math.max(...b.core.map((c) => synergyGuardOf(c, a)));
      expect(g, b.name).toBeGreaterThanOrEqual(0.55);
      expect(g, b.name).toBeLessThanOrEqual(0.85);
      expect(synergyGuard(a)).toBeCloseTo(g);
      const half = Object.fromEntries([...b.core, ...b.support].map((id) => [id, Math.ceil(skillById(id)!.maxLevel / 2)]));
      expect(synergyGuardOf(b.core[0], half), b.name).toBeLessThan(g / 8);
    }
    expect(synergyGuard({ em_kindle: 12, em_ring: 12 })).toBe(0);
  });
});

describe("대표 빌드 8종 (builds)", () => {
  it("갈래마다 둘, 핵심 1(넋은 둘) + 받침 2, 연계 표와 같다", () => {
    expect(BUILDS).toHaveLength(8);
    for (const br of BRANCHES) expect(BUILDS.filter((b) => b.branch === br)).toHaveLength(2);
    for (const b of BUILDS) {
      expect(b.support).toHaveLength(2);
      for (const c of b.core) expect(SYNERGY[c]?.map((l) => l.id).sort(), b.name).toEqual([...b.support].sort());
      expect(new Set(BUILDS.map((x) => x.strong)).size).toBeGreaterThanOrEqual(4);
    }
    // 갈래 안 두 빌드는 강점이 다르다
    for (const br of BRANCHES) {
      const [x, y] = BUILDS.filter((b) => b.branch === br);
      expect(x.strong, br).not.toBe(y.strong);
    }
  });

  it("찍는 순서의 모든 단계가 단·선행·포인트 규칙에 맞고, 레벨 50이면 55포인트를 다 쓴다", () => {
    for (const b of BUILDS) {
      for (let p = 1; p <= skillPointsEarned(50); p++) expect(checkAllocation(buildAlloc(b, p), p), `${b.name} ${p}포인트`).toBeNull();
      const a = buildAtLevel(b, 50);
      expect(spentPoints(a), b.name).toBe(55);
      // 핵심·받침은 레벨 50에 최대 랭크
      for (const id of [...b.core, ...b.support]) expect(a[id], `${b.name} ${id}`).toBe(skillById(id)!.maxLevel);
    }
  });

  it("★100(105포인트)도 모든 단계가 규칙에 맞고 포인트를 다 쓴다", () => {
    const P = skillPointsEarned(50, 50);
    expect(P).toBe(105);
    for (const b of BUILDS) {
      for (let p = 56; p <= P; p++) expect(checkAllocation(buildAlloc(b, p), p), `${b.name} ${p}포인트`).toBeNull();
      expect(spentPoints(buildAlloc(b, P)), b.name).toBe(P);
    }
  });

  it("단축 칸: 1~5는 배운 액티브, F는 궁극기", () => {
    for (const b of BUILDS) {
      const a = buildAtLevel(b, 50);
      expect(b.hotbar).toHaveLength(SKILL_SLOTS + 1);
      b.hotbar.forEach((id, i) => {
        if (!id) return;
        expect(a[id], `${b.name} ${id}`).toBeGreaterThan(0);
        expect(skillById(id)!.kind).toBe("active");
        expect(isUltimate(id), `${b.name} ${id}`).toBe(i === ULT_SLOT);
      });
      for (const c of b.core) expect(b.hotbar.includes(c) || skillById(c)!.kind === "passive", `${b.name} ${c}`).toBe(true);
    }
  });

  it("안내서 순서: 레벨 10·20·30·50마다 그때 받은 포인트만큼, 새로 찍는 것만", () => {
    for (const b of BUILDS) {
      const st = buildSteps(b);
      expect(st.map((x) => x.level)).toEqual([...GUIDE_LEVELS]);
      let sum = 0;
      for (const x of st) {
        for (const a of x.adds) {
          expect(a.to).toBeGreaterThan(a.from);
          sum += a.to - a.from;
        }
        expect(sum, `${b.name} Lv${x.level}`).toBe(x.points);
      }
    }
  });

  it("능력치는 레벨 50 포인트(기본 1 + 172)를 다 쓴다", () => {
    for (const b of BUILDS) expect(Object.values(b.stats).reduce((x, n) => x + n, 0), b.name).toBe(6 + 172);
    void SKILL_FX;
  });
});
