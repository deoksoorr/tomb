import { describe, expect, it } from "vitest";
import { DIFFICULTIES, GEAR, MONSTER_IDS, MONSTERS } from "./catalog";
import { attackArea, inAttackArea } from "./formulas";
import {
  BEHAVIOR_PATTERNS,
  bossPhaseIndex,
  DEFAULT_BOSS_PHASES,
  inTelegraph,
  MIN_WINDUP_MS,
  monsterPatterns,
  PATTERN_IDS,
  PATTERNS,
  patternTiming,
} from "./patterns";
import { attackCooldownMs, dpsFactor, WEAPON_STYLES, weaponArea, weaponStyleOf, weaponStyleText } from "./weapons";

// 40번 무기 특색 · 2번 몬스터 패턴(범위 미리 표시) — 순수 함수 검사

describe("무기 공격 방식 (40번)", () => {
  const weapons = GEAR.filter((g) => g.kind === "weapon");

  it("모든 무기에 공격 방식이 있고, 방식마다 무기가 적어도 하나", () => {
    for (const w of weapons) expect(w.style, w.id).toBeDefined();
    const used = new Set(weapons.map((w) => w.style));
    for (const id of Object.keys(WEAPON_STYLES)) expect(used.has(id as never), id).toBe(true);
  });

  it("방식마다 초당 피해(한 마리 기준)가 크게 벌어지지 않는다: 0.6~1.25배 (마법은 넓은 대신 낮게)", () => {
    for (const st of Object.values(WEAPON_STYLES)) {
      const f = dpsFactor(st);
      expect(f, st.id).toBeGreaterThanOrEqual(0.6);
      expect(f, st.id).toBeLessThanOrEqual(1.25);
    }
    expect(dpsFactor(WEAPON_STYLES.magic)).toBeLessThan(dpsFactor(WEAPON_STYLES.swing));
  });

  it("범위: 찌르기는 길고 좁게, 휘두르기는 넓게, 원거리는 근접보다 멀리", () => {
    const sw = weaponArea(GEAR.find((g) => g.id === "w_ruler"));
    const th = weaponArea(GEAR.find((g) => g.id === "w_monitor_arm"));
    const shot = weaponArea(GEAR.find((g) => g.id === "w_rubber_band"));
    expect(th.range).toBeGreaterThan(sw.range);
    expect(th.arcDeg).toBeLessThan(sw.arcDeg / 3);
    expect(shot.range).toBeGreaterThan(th.range * 2);
    // formulas.attackArea도 같은 범위를 쓴다
    for (const w of weapons) expect(attackArea({ weapon: w.id })).toEqual(weaponArea(w));
    // 찌르기: 앞 40px 줄은 맞고, 옆으로 벗어난 건 안 맞는다 (관통 판정은 범위 안 모두)
    const right = { x: 1, y: 0 };
    expect(inAttackArea(th, right, 40, 0, 6)).toBe(true);
    expect(inAttackArea(th, right, 20, 0, 6)).toBe(true);
    expect(inAttackArea(th, right, 20, 18, 6)).toBe(false);
    expect(inAttackArea(sw, right, 14, 14, 6)).toBe(true);
  });

  it("공격 간격: 내려찍기는 느리고, 연타는 한 번에 두 대", () => {
    const smash = weaponStyleOf(GEAR.find((g) => g.id === "w_duck"));
    const swing = weaponStyleOf(GEAR.find((g) => g.id === "w_ruler"));
    expect(attackCooldownMs(3, smash)).toBeGreaterThan(attackCooldownMs(3, swing));
    expect(weaponStyleOf(GEAR.find((g) => g.id === "w_keyboard")).hits).toBe(2);
    expect(weaponStyleOf(undefined).id).toBe("swing");
  });

  it("장비창 설명: 무기만 공격 방식 한 줄", () => {
    for (const w of weapons) expect(weaponStyleText(w)).toMatch(new RegExp(`^${weaponStyleOf(w).name} · `));
    expect(weaponStyleText(GEAR.find((g) => g.kind === "armor")!)).toBeNull();
  });
});

describe("몬스터 패턴과 범위 미리 표시 (2번)", () => {
  it("판정 모양: 원·도넛(가운데는 안전)·부채꼴·줄", () => {
    expect(inTelegraph({ kind: "circle", r: 20 }, 0, 0, 0, 15, 10)).toBe(true);
    expect(inTelegraph({ kind: "circle", r: 20 }, 0, 0, 0, 30, 0, 5)).toBe(false);
    expect(inTelegraph({ kind: "circle", r: 20 }, 0, 0, 0, 24, 0, 5)).toBe(true); // 몸이 테두리에 걸침
    const ring = { kind: "ring", r0: 20, r1: 60 } as const;
    expect(inTelegraph(ring, 0, 0, 0, 5, 0, 3)).toBe(false);
    expect(inTelegraph(ring, 0, 0, 0, 40, 0, 3)).toBe(true);
    expect(inTelegraph(ring, 0, 0, 0, 70, 0, 3)).toBe(false);
    const cone = { kind: "cone", r: 50, arcDeg: 60 } as const;
    expect(inTelegraph(cone, 0, 0, 0, 40, 5)).toBe(true);
    expect(inTelegraph(cone, 0, 0, 0, -40, 0)).toBe(false);
    expect(inTelegraph(cone, 0, 0, Math.PI, -40, 0)).toBe(true);
    expect(inTelegraph(cone, 0, 0, 0, 20, 30)).toBe(false);
    const line = { kind: "line", len: 100, width: 10 } as const;
    expect(inTelegraph(line, 0, 0, Math.PI / 2, 0, 80)).toBe(true);
    expect(inTelegraph(line, 0, 0, Math.PI / 2, 12, 80, 2)).toBe(false);
    expect(inTelegraph(line, 0, 0, Math.PI / 2, 0, 120)).toBe(false);
  });

  it("모든 몬스터(새 사냥터 몬스터 포함)가 있는 패턴만 쓴다, 공격 패턴이 하나 이상", () => {
    for (const id of MONSTER_IDS) {
      for (const d of DIFFICULTIES) {
        const pats = monsterPatterns(MONSTERS[id], { difficulty: d });
        expect(pats.length, id).toBeGreaterThan(0);
        for (const p of pats) expect(PATTERN_IDS, `${id}:${p}`).toContain(p);
        const boss = monsterPatterns(MONSTERS[id], { boss: true, hpRatio: 0.1, difficulty: d });
        for (const p of boss) expect(PATTERN_IDS, `${id}:${p}`).toContain(p);
      }
    }
    for (const list of Object.values(BEHAVIOR_PATTERNS)) for (const p of list) expect(PATTERNS[p]).toBeDefined();
  });

  it("우두머리 단계: 70%·35% 아래로 내려가면 패턴이 붙는다", () => {
    const boss = { behavior: "boss" as const };
    const p100 = monsterPatterns(boss, { boss: true, hpRatio: 1 });
    const p50 = monsterPatterns(boss, { boss: true, hpRatio: 0.5 });
    const p20 = monsterPatterns(boss, { boss: true, hpRatio: 0.2 });
    expect(p100).not.toContain("nova");
    expect(p50).toEqual(expect.arrayContaining(["charge", "nova"]));
    expect(p50).not.toContain("rain");
    expect(p20).toEqual(expect.arrayContaining(["rain", "cross", "nova"]));
    expect(bossPhaseIndex(boss, 1)).toBe(0);
    expect(bossPhaseIndex(boss, 0.7)).toBe(1);
    expect(bossPhaseIndex(boss, 0.3)).toBe(2);
    expect(DEFAULT_BOSS_PHASES.every((p, i, a) => i === 0 || p.below < a[i - 1].below)).toBe(true);
    // 우두머리로 나온 평범한 몬스터도 내려찍기를 쓴다, 정의에 적힌 패턴·단계가 기본보다 먼저
    expect(monsterPatterns({ behavior: "ranged" }, { boss: true })).toContain("slam");
    expect(monsterPatterns({ behavior: "chase", patterns: ["breath"], phases: [{ below: 0.5, add: ["rain"], haste: 0.8, label: "!" }] }, { boss: true, hpRatio: 0.4 })).toEqual(
      expect.arrayContaining(["breath", "slam", "rain"]),
    );
  });

  it("난이도: 지옥일수록 경고가 짧고 개수가 많지만, 경고는 늘 보인다", () => {
    for (const id of PATTERN_IDS) {
      const easy = patternTiming(id, "easy");
      const hell = patternTiming(id, "hell");
      expect(hell.windupMs, id).toBeLessThan(easy.windupMs);
      expect(hell.windupMs, id).toBeGreaterThanOrEqual(MIN_WINDUP_MS);
      expect(hell.count, id).toBeGreaterThanOrEqual(easy.count);
      expect(hell.cooldownMs).toBeLessThanOrEqual(easy.cooldownMs);
    }
    expect(patternTiming("rain", "hell").count).toBeGreaterThan(patternTiming("rain", "easy").count);
    // 원거리는 어려움·지옥에서 부채 사격도 섞는다
    expect(monsterPatterns({ behavior: "ranged" }, { difficulty: "hell" })).toContain("fan_volley");
    expect(monsterPatterns({ behavior: "ranged" }, { difficulty: "easy" })).not.toContain("fan_volley");
    // 우두머리 단계는 쿨타임을 줄인다
    expect(patternTiming("slam", "normal", 0.75).cooldownMs).toBeLessThan(patternTiming("slam", "normal").cooldownMs);
  });

  it("공정성: 판정 범위는 경고 모양 그대로 — 경고 밖 한 걸음이면 안 맞는다", () => {
    for (const id of PATTERN_IDS) {
      const s = PATTERNS[id].shape;
      const far = s.kind === "circle" ? s.r : s.kind === "ring" ? s.r1 : s.kind === "cone" ? s.r : s.len;
      expect(inTelegraph(s, 0, 0, 0, far + 6 + 1, 0, 6), id).toBe(false);
    }
  });
});
