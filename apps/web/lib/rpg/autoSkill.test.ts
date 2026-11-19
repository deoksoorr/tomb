import { describe, expect, it } from "vitest";
import { SKILL_FX } from "./skillTree";
import { SKILLS, skillById, type SkillId } from "./catalog";
import { learnSkill, newCharacter, normalize, resetSkills, setHotbar } from "./character";
import { checkLearn, SKILL_TREE_VERSION, tierOpen, type Alloc } from "./skillRules";
import { arrangeHotbar, autoBlock, cleanAuto, emptySlotFor, fitsSlot, isUltimate, MOVE_SKILLS, SKILL_SLOTS, ULT_SLOT } from "./hotbar";
import { AUTO_RULE, autoShape, autoSpOk, crowdAt, ultReserve, wantsCast, type AutoCtx, type AutoFoe } from "./autoSkill";

// 11/15 단축 칸(스킬 5칸 + 궁극기 F 칸) · 옛 6칸 저장값 옮기기 · 자동 스킬 규칙

/** 이 스킬까지 닿는 올바른 배분 (선행 + 단 채우기) */
function allocFor(...ids: SkillId[]): Alloc {
  let a: Alloc = {};
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
      a = { ...a, [id]: (a[id] ?? 0) + 1 };
    }
  };
  for (const id of ids) need(id, 1);
  return a;
}

const all = () => true;

describe("궁극기 칸", () => {
  it("궁극기 = 5단 액티브 4개 (11/19 밤샘 삽질), F 칸에만 · 나머지는 1~5에만", () => {
    expect(SKILLS.filter((s) => isUltimate(s.id)).map((s) => s.id)).toEqual(["em_bonfire", "fr_blizzard", "so_procession", "wk_allnight"]);
    expect(fitsSlot("em_bonfire", ULT_SLOT)).toBe(true);
    for (let i = 0; i < SKILL_SLOTS; i++) {
      expect(fitsSlot("em_bonfire", i)).toBe(false);
      expect(fitsSlot("em_kindle", i)).toBe(true);
    }
    expect(fitsSlot("em_kindle", ULT_SLOT)).toBe(false);
  });

  it("옛 6칸: 아무 칸의 궁극기는 F 칸으로, 6번 칸 일반 스킬은 빈 칸으로 (나머지는 제자리)", () => {
    expect(arrangeHotbar(["em_kindle", "em_bonfire", "em_fan", null, "em_ring", "em_stoke"], all)).toEqual(["em_kindle", "em_stoke", "em_fan", null, "em_ring", "em_bonfire"]);
    // 이미 맞는 배치는 그대로
    const ok = ["em_kindle", null, "em_fan", null, null, "em_bonfire"];
    expect(arrangeHotbar(ok, all)).toEqual(ok);
  });

  it("넘치면 칸에서만 빠진다 (일반 6개 → 6번째 빠짐), 궁극기가 둘이면 F 칸에 있던 것", () => {
    expect(arrangeHotbar(["em_kindle", "em_fan", "em_stoke", "em_ring", "em_meteor", "em_brazier"], all)).toEqual(["em_kindle", "em_fan", "em_stoke", "em_ring", "em_meteor", null]);
    expect(arrangeHotbar(["fr_blizzard", null, null, null, null, "em_bonfire"], all)).toEqual([null, null, null, null, null, "em_bonfire"]);
    expect(arrangeHotbar(["fr_blizzard", "em_bonfire", null, null, null, null], all)).toEqual([null, null, null, null, null, "fr_blizzard"]);
  });

  it("모르는 값·패시브·겹침·못 쓰는 스킬은 비우고, 길이는 늘 6", () => {
    expect(arrangeHotbar(["nope", "em_hearth", "em_kindle", "em_kindle", 3, null, "em_fan"], (id) => id !== "em_fan")).toEqual([null, null, "em_kindle", null, null, null]);
    expect(arrangeHotbar(undefined, all)).toHaveLength(6);
  });

  it("저장값 normalize: 배운 스킬은 그대로, 궁극기만 F 칸으로 옮긴다", () => {
    const skills = allocFor("em_bonfire", "em_kindle");
    const c = normalize({ level: 50, treeVer: SKILL_TREE_VERSION, skills, hotbar: ["em_bonfire", "em_kindle", null, null, null, null] });
    expect(c.skills).toEqual(skills);
    expect(c.hotbar).toEqual([null, "em_kindle", null, null, null, "em_bonfire"]);
    expect(c.hotAuto).toBeUndefined();
  });

  it("setHotbar: 예전 화면이 궁극기를 1번에 보내도 거절하지 않고 F 칸으로", () => {
    const c = { ...newCharacter(), skills: { em_kindle: 1, em_bonfire: 1 } };
    expect(setHotbar(c, ["em_bonfire", "em_kindle", null, null, null, null]).hotbar).toEqual([null, "em_kindle", null, null, null, "em_bonfire"]);
  });

  it("새로 배운 궁극기는 F 칸, 일반은 1~5의 빈 칸", () => {
    expect(emptySlotFor([null, null, null, null, null, null], "em_bonfire")).toBe(ULT_SLOT);
    expect(emptySlotFor([null, null, null, null, null, "fr_blizzard"], "em_bonfire")).toBe(-1);
    expect(emptySlotFor(["em_kindle", "em_fan", "em_stoke", "em_ring", "em_meteor", null], "em_brazier")).toBe(-1);
    const { em_bonfire: _u, ...a } = allocFor("em_bonfire");
    void _u;
    const lvl = { ...newCharacter(), level: 50, skills: a, hotbar: ["em_kindle", null, null, null, null, null] as (SkillId | null)[] };
    const next = learnSkill(lvl, "em_bonfire", 999);
    expect(next.hotbar[ULT_SLOT]).toBe("em_bonfire");
  });
});

describe("자동 스킬 설정", () => {
  it("궁극기·몸 옮기기는 자동 불가 (안내 문구), 나머지 액티브는 모두 규칙이 있다", () => {
    expect(autoBlock("em_bonfire")).toBe("궁극기는 직접 써요");
    for (const id of MOVE_SKILLS) expect(autoBlock(id)).toBe("몸 옮기기 스킬은 직접 써요");
    // 11/19 삽날 회오리는 켜고 끄는 스킬이라 직접
    expect(autoBlock("wk_whirl")).toBe("켜고 끄는 스킬은 직접 써요");
    expect(AUTO_RULE.wk_whirl).toBeUndefined();
    for (const s of SKILLS.filter((x) => x.kind === "active" && !isUltimate(x.id) && !MOVE_SKILLS.includes(x.id) && x.id !== "wk_whirl")) {
      expect(autoBlock(s.id), s.id).toBeNull();
      expect(AUTO_RULE[s.id], s.id).toBeDefined();
    }
    for (const id of ["em_bonfire", "fr_blizzard", "so_procession", "fr_mist", "so_veil"] as SkillId[]) expect(AUTO_RULE[id]).toBeUndefined();
  });

  it("cleanAuto: 1~5 칸에 있는 자동 가능한 스킬만, 옛 저장값은 모두 끔·궁극기 SP 남김", () => {
    const bar: (SkillId | null)[] = ["em_kindle", "fr_mist", null, null, null, "em_bonfire"];
    expect(cleanAuto(undefined, bar)).toEqual({ ids: [], on: false, keepUlt: true });
    expect(cleanAuto({ ids: ["em_kindle", "fr_mist", "em_bonfire", "em_fan", "em_kindle"], on: true, keepUlt: false }, bar)).toEqual({ ids: ["em_kindle"], on: true, keepUlt: false });
  });

  it("setHotbar: auto만 보내면 칸은 그대로, 칸을 바꾸면 빠진 스킬의 자동도 빠진다 · 초기화하면 비운다", () => {
    const c = { ...newCharacter(), skills: { em_kindle: 1, em_fan: 1 }, hotbar: ["em_kindle", "em_fan", null, null, null, null] as (SkillId | null)[] };
    const a = setHotbar(c, undefined, { ids: ["em_kindle", "em_fan"], on: true, keepUlt: true });
    expect(a.hotbar).toEqual(c.hotbar);
    expect(a.hotAuto).toEqual({ ids: ["em_kindle", "em_fan"], on: true, keepUlt: true });
    const b = setHotbar(a, ["em_fan", null, null, null, null, null]);
    expect(b.hotAuto).toEqual({ ids: ["em_fan"], on: true, keepUlt: true });
    expect(resetSkills(b).hotAuto?.ids).toEqual([]);
  });
});

describe("자동 스킬: 쓸 만한 때", () => {
  const foe = (x: number, y: number, boss = false, r = 6): AutoFoe => ({ x, y, r, boss });
  const ctx = (o: Partial<AutoCtx> = {}): AutoCtx => ({ px: 0, py: 0, hp: 100, maxHp: 100, now: 10_000, lastFightAt: -1e9, foes: [], buffs: new Set(), teleOnMe: false, ...o });

  it("사거리는 스킬 수치(SKILL_FX)에서", () => {
    expect(autoShape("em_kindle", 1).reach).toBe(110);
    expect(autoShape("fr_breath", 1).reach).toBe(46);
    expect(autoShape("em_ring", 1).radius).toBe(SKILL_FX.em_ring(1).radius);
    expect(autoShape("em_meteor", 1)).toEqual({ reach: 130, radius: SKILL_FX.em_meteor(1).radius });
    expect(autoShape("so_lantern", 1).radius).toBe(110);
  });

  it("한 명·부채꼴: 사거리(조금 짧게) 안에 적이 있을 때만", () => {
    expect(wantsCast("fr_breath", 1, ctx())).toBe(false);
    expect(wantsCast("fr_breath", 1, ctx({ foes: [foe(40, 0)] }))).toBe(true);
    expect(wantsCast("fr_breath", 1, ctx({ foes: [foe(60, 0)] }))).toBe(false);
    expect(wantsCast("em_kindle", 1, ctx({ foes: [foe(90, 0)] }))).toBe(true);
  });

  it("둘레 광역: 3마리 이상 또는 우두머리", () => {
    expect(wantsCast("em_ring", 1, ctx({ foes: [foe(10, 0), foe(-10, 0)] }))).toBe(false);
    expect(wantsCast("em_ring", 1, ctx({ foes: [foe(10, 0), foe(-10, 0), foe(0, 20)] }))).toBe(true);
    expect(wantsCast("em_ring", 1, ctx({ foes: [foe(20, 0, true)] }))).toBe(true);
    // 멀리 있는 3마리는 안 친다
    expect(wantsCast("em_ring", 1, ctx({ foes: [foe(200, 0), foe(210, 0), foe(220, 0)] }))).toBe(false);
  });

  it("지점 광역: 가장 가까운 적 자리에 3마리 이상 모였거나 우두머리", () => {
    const pack = [foe(100, 0), foe(110, 5), foe(105, -10)];
    expect(wantsCast("em_meteor", 1, ctx({ foes: pack }))).toBe(true);
    expect(wantsCast("em_meteor", 1, ctx({ foes: pack.slice(0, 2) }))).toBe(false);
    expect(wantsCast("fr_tomb", 1, ctx({ foes: [foe(80, 0, true)] }))).toBe(true);
    expect(wantsCast("so_harvest", 1, ctx({ foes: [foe(400, 0), foe(400, 5), foe(400, 10)] }))).toBe(false);
  });

  it("강화: 최근 3초 안에 싸웠고 효과가 꺼져 있을 때", () => {
    expect(wantsCast("em_stoke", 1, ctx({ lastFightAt: 8000 }))).toBe(true);
    expect(wantsCast("em_stoke", 1, ctx({ lastFightAt: 6000 }))).toBe(false);
    expect(wantsCast("em_stoke", 1, ctx({ lastFightAt: 9000, buffs: new Set(["em_stoke"]) }))).toBe(false);
    expect(wantsCast("so_swift", 1, ctx({ lastFightAt: 9500 }))).toBe(true);
  });

  it("지키기: 체력 70% 아래 또는 내 자리에 경고 (방패가 이미 있으면 안 씀)", () => {
    expect(wantsCast("fr_ward", 1, ctx({ hp: 80 }))).toBe(false);
    expect(wantsCast("fr_ward", 1, ctx({ hp: 60 }))).toBe(true);
    expect(wantsCast("fr_ward", 1, ctx({ teleOnMe: true }))).toBe(true);
    expect(wantsCast("fr_ward", 1, ctx({ hp: 30, buffs: new Set(["fr_ward"]) }))).toBe(false);
  });

  it("회복: 체력 50% 아래이고 내 자리에 경고가 없을 때 (잠깐 못 움직이니까)", () => {
    expect(wantsCast("so_lamp", 1, ctx({ hp: 60 }))).toBe(false);
    expect(wantsCast("so_lamp", 1, ctx({ hp: 40 }))).toBe(true);
    expect(wantsCast("so_lamp", 1, ctx({ hp: 40, teleOnMe: true }))).toBe(false);
  });

  it("놓기·부르기·끌어오기: 가까이에 3마리 이상", () => {
    const three = [foe(20, 0), foe(-20, 0), foe(0, 25)];
    for (const id of ["em_brazier", "fr_field", "so_friend", "so_lantern", "so_chain"] as SkillId[]) {
      expect(wantsCast(id, 1, ctx({ foes: three })), id).toBe(true);
      expect(wantsCast(id, 1, ctx({ foes: three.slice(0, 2) })), id).toBe(false);
    }
  });

  it("궁극기·몸 옮기기는 어떤 상황에도 자동으로 안 나간다", () => {
    const crowd = Array.from({ length: 8 }, (_, i) => foe(i * 4, 0, i === 0));
    for (const id of ["em_bonfire", "fr_blizzard", "so_procession", "fr_mist", "so_veil"] as SkillId[]) {
      expect(wantsCast(id, 5, ctx({ foes: crowd, hp: 10, lastFightAt: 10_000, teleOnMe: true })), id).toBe(false);
    }
  });

  it("crowdAt: 판정은 aoeAt과 같다 (거리 < 반경 + 몸 반지름)", () => {
    expect(crowdAt([foe(65, 0, false, 6)], 0, 0, 60).n).toBe(1);
    expect(crowdAt([foe(66, 0, false, 6)], 0, 0, 60).n).toBe(0);
  });
});

describe("궁극기 SP 남겨 두기", () => {
  it("켜면 자동 시전 뒤에도 궁극기 비용만큼 남아야 한다, 끄면 비용만 있으면", () => {
    const reserve = ultReserve("em_bonfire", { em_bonfire: 1 });
    expect(reserve).toBe(skillById("em_bonfire")!.sp(1));
    expect(autoSpOk(reserve + 10, 10, reserve, true)).toBe(true);
    expect(autoSpOk(reserve + 9, 10, reserve, true)).toBe(false);
    expect(autoSpOk(reserve + 9, 10, reserve, false)).toBe(true);
    expect(autoSpOk(5, 10, 0, false)).toBe(false);
  });

  it("궁극기 칸이 비었거나 안 배웠으면 남길 것 없음", () => {
    expect(ultReserve(null, {})).toBe(0);
    expect(ultReserve("em_bonfire", {})).toBe(0);
  });
});
