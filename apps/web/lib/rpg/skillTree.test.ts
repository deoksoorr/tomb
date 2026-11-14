import { describe, expect, it } from "vitest";
import { BRANCHES, SKILL_FX, SKILLS, skillById, TIER_GATES, type SkillId } from "./catalog";
import { allocStats, equip, fitSkillBudget, fitToLevel, learnSkill, newCharacter, normalize, resetSkills, resetStats, RpgError, setHotbar, statPointsEarned } from "./character";
import { MAX_LEVEL } from "./formulas";
import { ALL_SKILLS_POINTS, checkAllocation, checkLearn, RESPEC_MAX_COST, respecCost, SKILL_TREE_VERSION, skillPointsEarned, spentIn, spentPoints, tierOpen, type Alloc } from "./skillRules";
import { testServerEnv } from "./superHunter";

// 스킬 트리 (저장 형식 2): 트리 모양 · 단·선행·포인트 규칙 · 초기화 비용 · 옛 데이터 이전 · 슈퍼 계정 환경 · 밸런스

describe("트리 모양", () => {
  it("갈래 3개 × 단 5개, 갈래당 9~11개, 선행은 같은 갈래의 아래 단", () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(28);
    expect(SKILLS.length).toBeLessThanOrEqual(34);
    for (const b of BRANCHES) {
      const n = SKILLS.filter((s) => s.branch === b);
      expect(n.length).toBeGreaterThanOrEqual(9);
      expect(n.length).toBeLessThanOrEqual(11);
      for (let t = 1; t <= 5; t++) expect(n.some((s) => s.tier === t)).toBe(true);
    }
    const spots = new Set<string>();
    for (const s of SKILLS) {
      expect(s.maxLevel).toBeGreaterThanOrEqual(1);
      expect(s.maxLevel).toBeLessThanOrEqual(5);
      const spot = `${s.branch}:${s.tier}:${s.col}`;
      expect(spots.has(spot), spot).toBe(false);
      spots.add(spot);
      for (const r of s.requires ?? []) {
        const req = skillById(r.id)!;
        expect(req.branch).toBe(s.branch);
        expect(req.tier).toBeLessThan(s.tier);
        expect(r.level).toBeLessThanOrEqual(req.maxLevel);
      }
      // 랭크별 설명·수치가 모두 만들어진다
      for (let lv = 1; lv <= s.maxLevel; lv++) expect(s.describe(lv)).not.toMatch(/NaN|undefined/);
      if (s.kind === "active") expect(s.cooldownMs(1)).toBeGreaterThan(0);
    }
  });

  it("모든 스킬은 레벨 최대 포인트 안에서 닿을 수 있다 (단·선행을 채우는 경로가 있다)", () => {
    for (const s of SKILLS) {
      let a: Alloc = {};
      // 선행을 재귀로 채우고, 단이 모자라면 같은 갈래 1단 스킬로 채운다
      const need = (id: SkillId, lv: number) => {
        const d = skillById(id)!;
        for (const r of d.requires ?? []) need(r.id, r.level);
        while ((a[id] ?? 0) < lv) {
          let guard = 0;
          while (!tierOpen(a, d.branch, d.tier) && guard++ < 40) {
            const filler = SKILLS.find((x) => x.branch === d.branch && x.tier < d.tier && (a[x.id] ?? 0) < x.maxLevel && !checkLearn(a, x.id, Infinity));
            if (!filler) break;
            a = { ...a, [filler.id]: (a[filler.id] ?? 0) + 1 };
          }
          expect(checkLearn(a, id, Infinity), `${s.id} ← ${id}`).toBeNull();
          a = { ...a, [id]: (a[id] ?? 0) + 1 };
        }
      };
      need(s.id, 1);
      expect(checkAllocation(a, skillPointsEarned(MAX_LEVEL))).toBeNull();
    }
  });
});

describe("궁극기: 화면 전체 다단히트", () => {
  it("연출은 1.5~2.5초, 박자는 연출 안에서 차례로 3번 이상", () => {
    for (const f of [SKILL_FX.em_bonfire(1), SKILL_FX.fr_blizzard(1), SKILL_FX.so_procession(1)]) {
      expect(f.screen).toBe(true);
      expect(f.castMs).toBeGreaterThanOrEqual(1500);
      expect(f.castMs).toBeLessThanOrEqual(2500);
      expect(f.hitAt.length).toBeGreaterThanOrEqual(3);
      f.hitAt.forEach((t, i) => {
        expect(t).toBeLessThan(f.castMs);
        if (i) expect(t).toBeGreaterThan(f.hitAt[i - 1]);
      });
    }
  });
});

describe("규칙: 선행·단·포인트 합", () => {
  it("단은 그 갈래의 아래 단에 쓴 포인트로 열린다", () => {
    expect(TIER_GATES[0]).toBe(0);
    let c = normalize({ level: 30, treeVer: SKILL_TREE_VERSION });
    // 2단(불꽃 부채): 1단에 3포인트 전에는 잠김
    c = learnSkill(c, "em_kindle");
    expect(() => learnSkill(c, "em_fan")).toThrow(/2단은 이 갈래에 3포인트/);
    c = learnSkill(learnSkill(c, "em_kindle"), "em_kindle");
    c = learnSkill(c, "em_fan");
    expect(c.skills.em_fan).toBe(1);
    // 다른 갈래에 쓴 포인트는 세지 않는다
    expect(() => learnSkill(c, "fr_icicle")).toThrow(RpgError);
    expect(spentIn(c.skills, "ember")).toBe(4);
    expect(spentIn(c.skills, "ember", 2)).toBe(3);
  });

  it("선행 스킬은 필요 랭크까지 찍어야 한다", () => {
    const a: Alloc = { em_kindle: 3, em_fan: 1, em_hearth: 3 };
    // 3단(불의 고리)은 아래 단 7포인트 + 불꽃 부채 2랭크
    expect(checkLearn(a, "em_ring", 99)?.code).toBe("SKILL_REQUIRED");
    expect(checkLearn({ ...a, em_fan: 2 }, "em_ring", 99)).toBeNull();
    expect(checkLearn({ em_kindle: 1 }, "em_ring", 99)?.code).toBe("TIER_LOCKED");
  });

  it("포인트 합: 남은 포인트는 늘 '레벨로 받은 포인트 - 쓴 포인트'", () => {
    expect(skillPointsEarned(1)).toBe(1);
    expect(skillPointsEarned(10)).toBe(11);
    expect(skillPointsEarned(MAX_LEVEL)).toBe(55);
    // 저장된 skillPoints가 거짓이어도 다시 센다
    const c = normalize({ level: 10, treeVer: SKILL_TREE_VERSION, skills: { em_kindle: 3 }, skillPoints: 999 });
    expect(c.skillPoints).toBe(8);
    expect(spentPoints(c.skills) + c.skillPoints).toBe(skillPointsEarned(10));
    let d = c;
    for (let i = 0; i < 8; i++) d = learnSkill(d, i < 2 ? "em_kindle" : i < 7 ? "em_hearth" : "em_fan");
    expect(d.skillPoints).toBe(0);
    expect(() => learnSkill(d, "em_stoke")).toThrow(/스킬 포인트/);
  });

  it("서버가 잘못된 배분을 거절한다", () => {
    expect(checkAllocation({ em_kindle: 6 }, 99)?.code).toBe("INVALID_INPUT");
    expect(checkAllocation({ nope: 1 }, 99)?.code).toBe("INVALID_INPUT");
    expect(checkAllocation({ em_kindle: 1.5 }, 99)?.code).toBe("INVALID_INPUT");
    expect(checkAllocation({ em_bonfire: 1 }, 99)?.code).toBe("TIER_LOCKED");
    expect(checkAllocation({ em_kindle: 5, em_hearth: 2, em_ring: 1 }, 99)?.code).toBe("SKILL_REQUIRED");
    expect(checkAllocation({ em_kindle: 5, em_hearth: 5 }, 9)?.code).toBe("NO_SKILL_POINTS");
    expect(checkAllocation({ em_kindle: 5, em_hearth: 5 }, 10)).toBeNull();
    // 저장된 배분이 규칙에 어긋나면 (조작·트리 변경) 비우고 포인트를 돌려준다 + 안내
    const c = normalize({ level: 40, treeVer: SKILL_TREE_VERSION, skills: { em_bonfire: 3 }, hotbar: ["em_bonfire", null, null, null, null, null] });
    expect(c.skills).toEqual({});
    expect(c.skillPoints).toBe(skillPointsEarned(40));
    expect(c.hotbar.every((h) => h === null)).toBe(true);
    expect(c.treeNotice).toBe(true);
    // 패시브는 단축키에 못 놓는다
    const p = learnSkill(normalize({ level: 5, treeVer: SKILL_TREE_VERSION }), "em_hearth");
    expect(p.hotbar.includes("em_hearth")).toBe(false);
    expect(() => setHotbar(p, ["em_hearth", null, null, null, null, null])).toThrow(/패시브/);
  });

  it("예산을 넘는 배분(슈퍼 계정으로 찍은 것)은 보통 예산에서 비워진다", () => {
    let c = normalize({ level: 1, treeVer: SKILL_TREE_VERSION });
    for (let i = 0; i < 5; i++) c = learnSkill(c, "em_kindle", ALL_SKILLS_POINTS);
    expect(c.skills.em_kindle).toBe(5);
    expect(c.skillPoints).toBe(0);
    expect(fitSkillBudget(c, ALL_SKILLS_POINTS)).toBe(c);
    const fit = fitSkillBudget(c, skillPointsEarned(1));
    expect(fit.skills).toEqual({});
    expect(fit.skillPoints).toBe(1);
    expect(fit.respecs).toBe(c.respecs);
  });
});

describe("초기화 비용", () => {
  it("처음부터 레벨에 따라 (30 + 2×레벨, 최대 120P) — 무료 1회는 없다", () => {
    expect(respecCost(1)).toBe(32);
    expect(respecCost(10)).toBe(50);
    expect(respecCost(30)).toBe(90);
    expect(respecCost(45)).toBe(RESPEC_MAX_COST);
    expect(respecCost(50)).toBe(RESPEC_MAX_COST);
    // 레벨이 낮아도 0P는 없다
    expect(respecCost(0)).toBeGreaterThan(0);
    expect(RESPEC_MAX_COST).toBeLessThanOrEqual(150);
  });

  it("초기화하면 포인트를 모두 돌려받고 단축키가 비며 횟수가 는다 (슈퍼 계정은 안 센다)", () => {
    let c = normalize({ level: 10, treeVer: SKILL_TREE_VERSION });
    c = learnSkill(learnSkill(c, "so_wisp"), "so_lamp");
    const r = resetSkills(c);
    expect(r.skills).toEqual({});
    expect(r.skillPoints).toBe(11);
    expect(r.hotbar.every((h) => h === null)).toBe(true);
    expect(r.respecs).toBe(1);
    expect(resetSkills(c, false).respecs).toBe(0);
  });
});

describe("옛 데이터 이전 (저장 형식 1 → 2)", () => {
  it("옛 스킬은 모두 지우고 레벨만큼의 포인트를 돌려준다 + 안내 1회 (초기화는 처음부터 비용)", () => {
    const old = {
      level: 23,
      exp: 10,
      statPoints: 0,
      skillPoints: 2,
      stats: { str: 30, agi: 10, vit: 10, int: 10, dex: 10, luk: 5 },
      skills: { refactor: 5, deploy: 5, overtime: 3, coffee_break: 1 },
      hotbar: ["refactor", "deploy", "overtime", "coffee_break", null, null],
      inv: { w_ruler: 1 },
      bought: {},
      equip: { weapon: "w_ruler", armor: null, head: null, acc1: null, acc2: null },
      potions: { p_coffee: 5 },
      runs: 40,
    };
    const c = normalize(old);
    expect(c.treeVer).toBe(SKILL_TREE_VERSION);
    expect(c.skills).toEqual({});
    expect(c.skillPoints).toBe(skillPointsEarned(23));
    expect(c.hotbar).toEqual([null, null, null, null, null, null]);
    expect(c.treeNotice).toBe(true);
    expect(c.respecs).toBe(0);
    expect(respecCost(c.level)).toBe(30 + 2 * 23); // 첫 초기화도 비용
    // 다른 기록은 그대로
    expect(c.stats.str).toBe(30);
    expect(c.potions.p_coffee).toBe(5);
    expect(c.runs).toBe(40);
    // 새로 찍으면 안내는 사라진다 (한 번 저장되면 다시 이전하지 않는다)
    const n = learnSkill(c, "fr_breath");
    expect(n.treeNotice).toBeUndefined();
    expect(normalize(JSON.parse(JSON.stringify(n))).skills).toEqual({ fr_breath: 1 });
    // 새 캐릭터에는 안내가 없다
    expect(normalize(null).treeNotice).toBeUndefined();
    expect(newCharacter().treeVer).toBe(SKILL_TREE_VERSION);
  });
});

describe("테스트 서버 슈퍼 계정 환경 검사", () => {
  it("운영(VERCEL_ENV=production)에서는 절대 켜지지 않는다", () => {
    expect(testServerEnv({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false);
    expect(testServerEnv({ VERCEL_ENV: "production", NODE_ENV: "development" })).toBe(false);
    expect(testServerEnv({ VERCEL_ENV: " production ", NODE_ENV: "test" })).toBe(false);
    // VERCEL_ENV가 없는 운영 빌드 (다른 곳에 올린 경우)도 끈다
    expect(testServerEnv({ NODE_ENV: "production" })).toBe(false);
    // 모르는 값도 끈다
    expect(testServerEnv({ VERCEL_ENV: "staging", NODE_ENV: "production" })).toBe(false);
  });
  it("미리보기·개발 배포와 로컬 개발·테스트에서는 켜진다", () => {
    expect(testServerEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
    expect(testServerEnv({ VERCEL_ENV: "development", NODE_ENV: "production" })).toBe(true);
    expect(testServerEnv({ NODE_ENV: "development" })).toBe(true);
    expect(testServerEnv({ NODE_ENV: "test" })).toBe(true);
  });
  it("슈퍼 계정 레벨·능력치: 요구 레벨 검사에 넘긴 레벨을 쓰고, 능력치는 예산 안에서, 실제 레벨로 되돌리면 정리된다", () => {
    expect(statPointsEarned(1)).toBe(5);
    expect(statPointsEarned(MAX_LEVEL)).toBe(172);
    const c = normalize({ level: 1, treeVer: SKILL_TREE_VERSION, inv: { w_ruler: 1, w_stamp: 1 } });
    expect(() => equip(c, "weapon", "w_stamp")).toThrow(/레벨 45/);
    const worn = equip(c, "weapon", "w_stamp", MAX_LEVEL);
    expect(worn.equip.weapon).toBe("w_stamp");
    expect(() => allocStats(worn, { str: 10 })).toThrow(/포인트/);
    const strong = allocStats(worn, { str: 98, luk: 70 }, statPointsEarned(MAX_LEVEL));
    expect(strong.stats.str).toBe(99);
    expect(strong.statPoints).toBe(0);
    expect(() => allocStats(strong, { dex: 5 }, statPointsEarned(MAX_LEVEL))).toThrow(/포인트/);
    expect(resetStats(strong).statPoints).toBe(5);
    // 보통 계정으로 읽으면: 능력치 되돌림 + 요구 레벨 넘는 장비 빼기 (가방엔 남음)
    const fit = fitToLevel(strong);
    expect(fit.stats.str).toBe(1);
    expect(fit.statPoints).toBe(5);
    expect(fit.equip.weapon).toBeNull();
    expect(fit.inv.w_stamp).toBe(1);
    expect(fit.statResets).toBe(0); // 레벨에 맞춰 되돌린 건 초기화 횟수로 세지 않는다
    // 레벨에 맞는 정상 상태는 그대로 (같은 객체)
    const ok = allocStats(c, { str: 5 });
    expect(fitToLevel(ok)).toBe(ok);
  });

  it("능력치 초기화: 기본 능력치만 되돌리고 횟수를 스킬과 따로 센다 (옛 저장값은 0회)", () => {
    // 옛 저장값(statResets 없음) → 0회 (횟수가 0이어도 첫 초기화부터 비용)
    const old = normalize({ level: 10, treeVer: SKILL_TREE_VERSION, respecs: 2, stats: { str: 5 }, statPoints: 20 });
    expect(old.statResets).toBe(0);
    expect(respecCost(old.level)).toBe(50);
    expect(normalize({ ...old, statResets: 3 }).statResets).toBe(3);
    expect(normalize({ ...old, statResets: -1 }).statResets).toBe(0);
    expect(newCharacter().statResets).toBe(0);
    const learned = learnSkill(old, "em_kindle");
    const r = resetStats({ ...learned, exp: 9, equip: { ...learned.equip, weapon: "w_ruler" } });
    expect(r.stats.str).toBe(1);
    expect(r.statPoints).toBe(statPointsEarned(10));
    expect(r.statResets).toBe(1);
    expect(r.respecs).toBe(2);
    expect(r.skills).toEqual({ em_kindle: 1 });
    expect([r.level, r.exp, r.equip.weapon]).toEqual([10, 9, "w_ruler"]);
    expect(respecCost(r.level)).toBe(50); // 횟수가 늘어도 비용은 그대로
    // 슈퍼 계정·레벨 맞춤은 세지 않는다
    expect(resetStats(r, false).statResets).toBe(1);
  });

  it("슈퍼 계정 예산은 모든 스킬 최대 랭크", () => {
    expect(ALL_SKILLS_POINTS).toBe(SKILLS.reduce((a, s) => a + s.maxLevel, 0));
    expect(ALL_SKILLS_POINTS).toBeGreaterThan(skillPointsEarned(MAX_LEVEL));
  });
});

// ── 밸런스: 만렙(55포인트) 빌드의 화력 점수가 옛 최상위 빌드와 비슷한가 ──
// 점수 = 30초 동안 스킬로 낼 수 있는 "공격력 배수 × 맞힌 적 수" 합 (광역은 4마리, 버프·약화는 유지 비율만큼 곱한다).
// 대략적인 비교지만 수치를 크게 바꾸면 이 테스트가 먼저 알려 준다.
const WINDOW = 30;
const AOE_TARGETS = 4;
/** 궁극기는 화면 전체를 친다 (광역기보다 많이 맞는다) */
const ULT_TARGETS = 6;

/** 옛 트리(형식 1) 최상위 화력 빌드: 결재판 치기5·전체 회신5·보고서 폭탄5·스테이플러 난사5·입사 동기5·복합기5·야근5·빨간 펜5·매의 눈5 + 선행 (옛 수치 그대로) */
function oldTopScore(): number {
  const casts = (cdSec: number) => WINDOW / cdSec;
  let dmg = 0;
  dmg += 3.1 * 1 * casts(2.5); // 결재판 치기 5
  dmg += 2.45 * AOE_TARGETS * casts(9); // 전체 회신 5
  dmg += 4.0 * AOE_TARGETS * casts(11); // 보고서 폭탄 5
  dmg += 8 * 1.2 * 0.5 * casts(5); // 스테이플러 난사 5 (8발 중 절반 명중)
  dmg += (0.8 / 0.8) * Math.min(WINDOW, 18); // 입사 동기 5 (18초)
  dmg += (0.9 / 0.7) * Math.min(WINDOW, 15.5); // 복합기 5 (15.5초)
  const overtime = 1 + 0.75 * (10 / 20);
  const review = 1 + 0.5 * (6 / 14);
  const eye = 1 + 0.4 * 0.5 * (10 / 18);
  return dmg * overtime * review * eye;
}

function newScore(a: Alloc): number {
  const lv = (id: SkillId) => a[id] ?? 0;
  const casts = (id: SkillId) => WINDOW / ((skillById(id)!.cooldownMs(lv(id)) * (1 - (lv("fr_solstice") ? SKILL_FX.fr_solstice(lv("fr_solstice")).cdCut : 0))) / 1000);
  const aoe = 1 + (lv("em_ashheart") ? SKILL_FX.em_ashheart(lv("em_ashheart")).aoePct : 0);
  const summon = 1 + (lv("so_kinship") ? SKILL_FX.so_kinship(lv("so_kinship")).summonPct : 0);
  const sdur = 1 + (lv("so_kinship") ? SKILL_FX.so_kinship(lv("so_kinship")).durPct : 0);
  let dmg = 0;
  const on = (id: SkillId) => lv(id) > 0;
  if (on("em_kindle")) dmg += SKILL_FX.em_kindle(lv("em_kindle")).mult * 2 * casts("em_kindle");
  if (on("em_fan")) dmg += SKILL_FX.em_fan(lv("em_fan")).mult * AOE_TARGETS * aoe * casts("em_fan");
  if (on("em_ring")) dmg += SKILL_FX.em_ring(lv("em_ring")).mult * AOE_TARGETS * aoe * casts("em_ring");
  if (on("em_meteor")) dmg += SKILL_FX.em_meteor(lv("em_meteor")).mult * AOE_TARGETS * aoe * casts("em_meteor");
  if (on("em_brazier")) {
    const f = SKILL_FX.em_brazier(lv("em_brazier"));
    dmg += f.mult * (f.durMs / f.everyMs) * AOE_TARGETS * 0.5 * aoe * casts("em_brazier");
  }
  if (on("em_bonfire")) dmg += SKILL_FX.em_bonfire(lv("em_bonfire")).mult * SKILL_FX.em_bonfire(1).hitAt.length * ULT_TARGETS * aoe * casts("em_bonfire");
  if (on("fr_breath")) dmg += SKILL_FX.fr_breath(lv("fr_breath")).mult * 2 * aoe * casts("fr_breath");
  if (on("fr_icicle")) dmg += SKILL_FX.fr_icicle(lv("fr_icicle")).n * SKILL_FX.fr_icicle(lv("fr_icicle")).mult * 0.6 * casts("fr_icicle");
  if (on("fr_nova")) dmg += SKILL_FX.fr_nova(lv("fr_nova")).mult * AOE_TARGETS * aoe * casts("fr_nova");
  if (on("fr_mist")) dmg += SKILL_FX.fr_mist(lv("fr_mist")).mult * 2 * casts("fr_mist");
  if (on("fr_tomb")) dmg += SKILL_FX.fr_tomb(lv("fr_tomb")).mult * AOE_TARGETS * aoe * casts("fr_tomb");
  if (on("fr_field")) {
    const f = SKILL_FX.fr_field(lv("fr_field"));
    dmg += f.mult * (f.durMs / f.everyMs) * AOE_TARGETS * 0.5 * aoe * casts("fr_field");
  }
  if (on("fr_blizzard")) {
    const f = SKILL_FX.fr_blizzard(lv("fr_blizzard"));
    dmg += f.mult * f.hitAt.length * ULT_TARGETS * aoe * casts("fr_blizzard");
  }
  if (on("so_wisp")) dmg += SKILL_FX.so_wisp(lv("so_wisp")).n * SKILL_FX.so_wisp(lv("so_wisp")).mult * casts("so_wisp");
  if (on("so_chain")) dmg += SKILL_FX.so_chain(lv("so_chain")).mult * AOE_TARGETS * aoe * casts("so_chain");
  if (on("so_harvest")) dmg += SKILL_FX.so_harvest(lv("so_harvest")).mult * 3 * AOE_TARGETS * aoe * casts("so_harvest");
  if (on("so_procession")) dmg += SKILL_FX.so_procession(lv("so_procession")).mult * SKILL_FX.so_procession(1).hitAt.length * ULT_TARGETS * aoe * casts("so_procession");
  if (on("so_friend")) {
    const f = SKILL_FX.so_friend(lv("so_friend"));
    dmg += (f.atkPct / (f.everyMs / 1000)) * Math.min(WINDOW, (f.durMs * sdur) / 1000) * summon;
  }
  if (on("so_lantern")) {
    const f = SKILL_FX.so_lantern(lv("so_lantern"));
    dmg += (f.atkPct / (f.everyMs / 1000)) * Math.min(WINDOW, (f.durMs * sdur) / 1000) * summon;
  }
  let mul = 1;
  if (on("em_hearth")) mul *= 1 + SKILL_FX.em_hearth(lv("em_hearth")).atkPct;
  if (on("em_stoke")) mul *= 1 + SKILL_FX.em_stoke(lv("em_stoke")).atk * (SKILL_FX.em_stoke(1).durMs / skillById("em_stoke")!.cooldownMs(1));
  if (on("em_spark")) mul *= 1 + SKILL_FX.em_spark(lv("em_spark")).crit / 100 * 0.5;
  if (on("fr_brittle")) mul *= 1 + SKILL_FX.fr_brittle(lv("fr_brittle")).vsSlowed * 0.6;
  if (on("so_chain")) mul *= 1 + SKILL_FX.so_chain(lv("so_chain")).vuln * 0.25;
  if (on("fr_tomb")) mul *= 1 + SKILL_FX.fr_tomb(lv("fr_tomb")).vuln * 0.3;
  return dmg * mul;
}

/** 갈래 하나를 우선해 55포인트를 찍는 빌드 (단·선행 규칙대로, 화력 스킬부터) */
function build(order: [SkillId, number][]): Alloc {
  let a: Alloc = {};
  const budget = skillPointsEarned(MAX_LEVEL);
  for (const [id, n] of order) {
    for (let i = 0; i < n; i++) {
      if (checkLearn(a, id, budget)) break;
      a = { ...a, [id]: (a[id] ?? 0) + 1 };
    }
  }
  expect(checkAllocation(a, budget)).toBeNull();
  return a;
}

describe("밸런스", () => {
  const old = oldTopScore();
  const builds: Record<string, Alloc> = {
    ember: build([
      ["em_kindle", 2],
      ["em_hearth", 5],
      ["em_fan", 5],
      ["em_stoke", 5],
      ["em_ring", 5],
      ["em_ignite", 1],
      ["em_meteor", 5],
      ["em_brazier", 5],
      ["em_bonfire", 3],
      ["em_ashheart", 3],
      ["em_spark", 3],
      ["em_kindle", 5],
      ["fr_breath", 5],
      ["fr_collar", 5],
    ]),
    frost: build([
      ["fr_breath", 3],
      ["fr_icicle", 5],
      ["fr_brittle", 4],
      ["fr_nova", 5],
      ["fr_tomb", 5],
      ["fr_field", 5],
      ["fr_blizzard", 3],
      ["fr_collar", 3],
      ["fr_ward", 3],
      ["fr_mist", 1],
      ["fr_solstice", 3],
      ["fr_breath", 5],
      ["em_kindle", 3],
      ["em_hearth", 5],
      ["em_fan", 3],
    ]),
    soul: build([
      ["so_wisp", 3],
      ["so_lamp", 3],
      ["so_friend", 5],
      ["so_chain", 5],
      ["so_harvest", 5],
      ["so_procession", 3],
      ["so_lantern", 5],
      ["so_kinship", 3],
      ["so_drain", 5],
      ["so_wisp", 5],
      ["so_veil", 1],
      ["so_swift", 5],
      ["em_kindle", 3],
      ["em_hearth", 5],
    ]),
  };

  for (const [name, a] of Object.entries(builds)) {
    it(`${name} 만렙 빌드 화력이 옛 최상위 빌드의 0.75~1.3배`, () => {
      expect(spentPoints(a)).toBeLessThanOrEqual(skillPointsEarned(MAX_LEVEL));
      const ratio = newScore(a) / old;
      expect(ratio, `${name}: ${ratio.toFixed(2)}`).toBeGreaterThan(0.75);
      expect(ratio, `${name}: ${ratio.toFixed(2)}`).toBeLessThan(1.3);
    });
  }
});
