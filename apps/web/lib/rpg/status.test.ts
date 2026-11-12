import { describe, expect, it } from "vitest";
import { DIFFICULTIES, MONSTERS, POTIONS, type MonsterId } from "./catalog";
import { monsterPatterns } from "./patterns";
import { BLEED_MOVE_MULT, MAX_SLOW, MONSTER_STATUS, POTION_CURES, rollStatus, STATUS_DIFF, STATUS_IDS, STATUSES, StatusBook, statusFor } from "./status";

describe("몬스터가 거는 상태 이상", () => {
  it("규칙의 패턴은 그 몬스터가 실제로 쓰는 패턴이다 (우두머리 단계 포함)", () => {
    for (const [id, rules] of Object.entries(MONSTER_STATUS) as [MonsterId, NonNullable<(typeof MONSTER_STATUS)[MonsterId]>][]) {
      const def = MONSTERS[id];
      const can = new Set([...monsterPatterns(def, { difficulty: "hell" }), ...monsterPatterns(def, { boss: true, hpRatio: 0, difficulty: "hell" })]);
      for (const r of rules) {
        expect(STATUS_IDS).toContain(r.status);
        expect(r.chance).toBeGreaterThan(0);
        expect(r.chance).toBeLessThanOrEqual(0.7);
        for (const p of r.on ?? []) expect(can.has(p), `${id}: ${p}`).toBe(true);
      }
    }
  });

  it("모든 상태를 거는 몬스터가 하나 이상 있고, 우두머리는 모두 무언가를 건다", () => {
    for (const s of STATUS_IDS) expect(Object.values(MONSTER_STATUS).some((rules) => rules?.some((r) => r.status === s))).toBe(true);
    for (const m of Object.values(MONSTERS)) if (m.behavior === "boss") expect(MONSTER_STATUS[m.id], m.id).toBeDefined();
  });

  it("패턴이 맞아야 굴리고, 어려울수록 잘 걸린다", () => {
    // 칼퇴 방해 드래곤: 화상은 사격·내려찍기 등, 물기로는 안 걸린다
    expect(rollStatus("prod_dragon", "bite", "hell", () => 0)).toEqual([]);
    expect(rollStatus("prod_dragon", "slam", "normal", () => 0).map((h) => h.id)).toEqual(["burn"]);
    // 패턴 제한이 없는 규칙은 무엇에 맞아도 굴린다
    expect(rollStatus("req_change", undefined, "normal", () => 0).map((h) => h.id)).toEqual(["confuse"]);
    // 같은 굴림값이 쉬움에선 빗나가고 지옥에선 걸린다 (0.18×0.7 < 0.2 < 0.18×1.45)
    expect(rollStatus("req_change", "bite", "easy", () => 0.2)).toEqual([]);
    expect(rollStatus("req_change", "bite", "hell", () => 0.2)).toHaveLength(1);
    // 상태 없는 몬스터
    expect(rollStatus("scope_creep", "bite", "hell", () => 0)).toEqual([]);
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      const [a, b] = [STATUS_DIFF[DIFFICULTIES[i - 1]], STATUS_DIFF[DIFFICULTIES[i]]];
      expect(b.chance).toBeGreaterThan(a.chance);
      expect(b.dur).toBeGreaterThan(a.dur);
      expect(b.power).toBeGreaterThan(a.power);
    }
  });

  it("빙결·혼란은 지옥에서도 짧다", () => {
    expect(statusFor("freeze", "hell").durMs).toBeLessThanOrEqual(1200);
    expect(statusFor("confuse", "hell").durMs).toBeLessThanOrEqual(3000);
    expect(statusFor("poison", "hell").durMs).toBeGreaterThan(statusFor("poison", "easy").durMs);
  });

  it("같은 상태는 겹치지 않고 갱신, 끝나면 잠깐 면역", () => {
    const b = new StatusBook();
    const hit = statusFor("slow", "normal");
    expect(b.apply(hit, 0)).toBe("new");
    expect(b.apply({ ...hit, durMs: 1000, power: 1.6 }, 500)).toBe("refresh");
    // 남은 시간은 긴 쪽(3000), 세기는 센 쪽(1.6)
    expect(b.list(500)).toEqual([{ id: "slow", leftMs: 2500 }]);
    expect(b.moveMul(500)).toBeCloseTo(1 - Math.min(MAX_SLOW, (STATUSES.slow.slow ?? 0) * 1.6));
    expect(b.update(3000, 100, false).ended).toEqual(["slow"]);
    expect(b.has("slow", 3000)).toBe(false);
    expect(b.apply(hit, 3000 + STATUSES.slow.immuneMs - 1)).toBe("immune");
    expect(b.apply(hit, 3000 + STATUSES.slow.immuneMs)).toBe("new");
  });

  it("지속 피해는 간격마다, 출혈은 움직이면 더 아프다", () => {
    const b = new StatusBook();
    b.apply(statusFor("poison", "normal"), 0);
    const one = b.update(1000, 1000, false).dmg;
    expect(one).toHaveLength(1);
    expect(one[0].amount).toBeCloseTo(1000 * STATUSES.poison.dotPct!);
    // 끝날 때까지 다 합치면 지속 시간만큼
    let total = one[0].amount;
    for (let t = 1100; t <= 7000; t += 100) total += b.update(t, 1000, false).dmg.reduce((s, x) => s + x.amount, 0);
    expect(total).toBeCloseTo(1000 * STATUSES.poison.dotPct! * (STATUSES.poison.durMs / 1000));

    const still = new StatusBook();
    const run = new StatusBook();
    still.apply(statusFor("bleed", "normal"), 0);
    run.apply(statusFor("bleed", "normal"), 0);
    const a = still.update(500, 1000, false).dmg[0].amount;
    const c = run.update(500, 1000, true).dmg[0].amount;
    expect(c).toBeCloseTo(a * BLEED_MOVE_MULT);
  });

  it("포션으로 풀린다: 도시락은 전부, 커피는 지속 피해, 에너지드링크는 나머지", () => {
    for (const id of Object.keys(POTION_CURES)) expect(POTIONS.some((p) => p.id === id)).toBe(true);
    expect([...POTION_CURES.p_lunchbox].sort()).toEqual([...STATUS_IDS].sort());
    expect(new Set([...POTION_CURES.p_coffee, ...POTION_CURES.p_energy]).size).toBe(STATUS_IDS.length);
    const b = new StatusBook();
    b.apply(statusFor("poison", "hard"), 0);
    b.apply(statusFor("silence", "hard"), 0);
    expect(b.cure(POTION_CURES.p_coffee, 100)).toEqual(["poison"]);
    expect(b.list(100).map((x) => x.id)).toEqual(["silence"]);
    // 풀린 직후엔 면역
    expect(b.apply(statusFor("poison", "hard"), 200)).toBe("immune");
  });
});
