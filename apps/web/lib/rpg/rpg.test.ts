import { describe, expect, it } from "vitest";
import { DIFFICULTIES, DIFFS, GEAR, MONSTERS, SKILLS, ZONES } from "./catalog";
import { addGear, allocStats, consumePotions, equip, gainExp, learnSkill, newCharacter, removeGearForSale, RpgError, setHotbar } from "./character";
import { applyExp, ATK_PER_STR, attackArea, damage, DEFAULT_ATTACK_AREA, derive, expToNext, hitChance, inAttackArea, MAX_LEVEL, monsterStats } from "./formulas";
import { bugsCount, bugsPlan, comboMult, huntPlan, huntSpawnable, huntTotal, starsCount, starsPlan, starWindows } from "./plan";
import { evaluate, MIN_RUN_MS, type TicketInfo } from "./rewards";
import { signTicket, verifyTicket } from "./ticket";
import { MemoryRpgStore } from "./store";

describe("성장 공식", () => {
  it("EXP 곡선은 오르기만 하고 최대 레벨에서 멈춘다", () => {
    expect(expToNext(1)).toBe(50);
    for (let lv = 1; lv < MAX_LEVEL - 1; lv++) expect(expToNext(lv + 1)).toBeGreaterThan(expToNext(lv));
    expect(expToNext(MAX_LEVEL)).toBe(Infinity);
    const r = applyExp(1, 0, 50 + 96 + 10);
    expect(r).toMatchObject({ level: 3, exp: 10, levelsGained: 2, statPoints: 6, skillPoints: 2 });
    expect(applyExp(49, 0, 1e9)).toMatchObject({ level: 50, exp: 0 });
  });

  it("파생 능력치는 능력치·장비를 반영한다", () => {
    const c = newCharacter();
    const d0 = derive(1, c.stats, { weapon: null });
    const d1 = derive(1, c.stats, c.equip);
    expect(d1.atk - d0.atk).toBe(6); // 나무 자
    expect(d1.def - d0.def).toBe(3); // 후드티
    expect(d1.maxHp).toBeGreaterThan(d0.maxHp);
    const strong = derive(1, { ...c.stats, agi: 99, luk: 99 }, {});
    expect(strong.aspd).toBeLessThanOrEqual(6);
    expect(strong.crit).toBeLessThanOrEqual(60);
  });

  it("STR 1당 ATK +3 (7번: 올린 만큼 피해 숫자에 보이게)", () => {
    const c = newCharacter();
    const a = derive(1, c.stats, c.equip);
    const b = derive(1, { ...c.stats, str: c.stats.str + 1 }, c.equip);
    expect(b.atk - a.atk).toBe(ATK_PER_STR);
    expect(ATK_PER_STR).toBe(3);
    // 흔들림(±10%) 최저값으로도 STR 5 올린 쪽이 최고값보다 세다
    const s5 = derive(1, { ...c.stats, str: c.stats.str + 5 }, c.equip);
    expect(damage(s5.atk, 1, 0, 0, false)).toBeGreaterThan(damage(a.atk, 1, 0, 0.999, false));
  });

  it("기본 공격 범위: 앞쪽 부채꼴 안은 모두, 뒤는 안 맞고, 몸이 겹치면 방향 무관 (42번)", () => {
    const A = DEFAULT_ATTACK_AREA;
    const right = { x: 1, y: 0 };
    expect(inAttackArea(A, right, 20, 0, 7)).toBe(true);
    expect(inAttackArea(A, right, 18, 14, 7)).toBe(true); // 대각선 앞
    expect(inAttackArea(A, right, -20, 0, 7)).toBe(false); // 뒤
    expect(inAttackArea(A, right, 0, -24, 7)).toBe(false); // 옆 멀리
    expect(inAttackArea(A, right, -5, 3, 7)).toBe(true); // 겹침
    expect(inAttackArea(A, right, 40, 0, 7)).toBe(false); // 너무 멂
    // 무기가 범위를 정할 수 있다 (장우산 창: 길고 좁게)
    const spear = attackArea({ weapon: "w_monitor_arm" });
    expect(spear.range).toBeGreaterThan(A.range);
    expect(inAttackArea(spear, right, 40, 0, 7)).toBe(true);
    expect(attackArea({ weapon: "w_ruler" })).toEqual(A);
  });

  it("피해: 방어가 높을수록 줄고, 치명타는 방어를 무시하고 1.5배, 최소 1", () => {
    expect(damage(100, 1, 0, 0.5, false)).toBe(100);
    expect(damage(100, 1, 50, 0.5, false)).toBe(50);
    expect(damage(100, 1, 50, 0.5, true)).toBe(150);
    expect(damage(1, 0.1, 999, 0, false)).toBe(1);
    expect(damage(100, 1, 0, 0.5, false, 0.3)).toBe(130);
    expect(hitChance(0, 999)).toBe(0.05);
    expect(hitChance(999, 0)).toBe(0.98);
  });

  it("몬스터는 난이도마다 강해진다", () => {
    expect(monsterStats("scope_creep", "hell").maxHp).toBeGreaterThan(monsterStats("scope_creep", "easy").maxHp);
    expect(Object.keys(MONSTERS)).toContain("prod_dragon");
    expect(ZONES.easy.name).toBe("월요일 회의실");
  });
});

describe("캐릭터 조작", () => {
  it("능력치 포인트 안에서만 올린다", () => {
    const c = newCharacter();
    const n = allocStats(c, { str: 3, luk: 2 });
    expect(n.stats.str).toBe(4);
    expect(n.statPoints).toBe(0);
    expect(() => allocStats(n, { str: 1 })).toThrow(RpgError);
  });

  it("스킬은 레벨·선행 스킬·포인트가 있어야 배우고, 처음 배우면 단축키에 놓인다", () => {
    let c = newCharacter();
    c = learnSkill(c, "refactor");
    expect(c.skills.refactor).toBe(1);
    expect(c.hotbar[0]).toBe("refactor");
    expect(() => learnSkill(c, "refactor")).toThrow(/스킬 포인트/);
    c = gainExp(c, 1e6).state;
    expect(() => learnSkill(c, "deploy")).toThrow(/결재판 치기 3단계/);
    expect(() => setHotbar(c, ["hotfix", null, null, null, null, null])).toThrow(/배운 스킬/);
    expect(SKILLS).toHaveLength(10);
  });

  it("장착: 종류·레벨·보유를 확인하고, 같은 장신구는 가진 수만큼만 낀다", () => {
    let c = newCharacter();
    expect(() => equip(c, "armor", "w_ruler")).toThrow(/칸/);
    c = addGear(c, "c_earphones", true);
    c = equip(c, "acc1", "c_earphones");
    expect(() => equip(c, "acc2", "c_earphones")).toThrow(/가방/);
    c = addGear(c, "c_earphones", false);
    c = equip(c, "acc2", "c_earphones");
    c = addGear(c, "w_compiler", true);
    expect(() => equip(c, "weapon", "w_compiler")).toThrow(/레벨 40/);
  });

  it("되팔기: 장착 중인 건 못 팔고, 산 것부터 판 것으로 친다", () => {
    let c = newCharacter();
    expect(() => removeGearForSale(c, "w_ruler")).toThrow(/장착/);
    c = addGear(c, "w_keyboard", false);
    c = addGear(c, "w_keyboard", true);
    const first = removeGearForSale(c, "w_keyboard");
    expect(first).toMatchObject({ bought: true, value: 60 });
    const second = removeGearForSale(first.state, "w_keyboard");
    expect(second.bought).toBe(false);
    expect(second.state.inv.w_keyboard).toBeUndefined();
  });

  it("포션 사용은 가진 만큼만 뺀다", () => {
    const c = newCharacter(); // 커피 3개
    const r = consumePotions(c, { p_coffee: 5, p_energy: 1 });
    expect(r.consumed).toEqual({ p_coffee: 3 });
    expect(r.state.potions.p_coffee).toBeUndefined();
  });

  it("가방이 가득 차면 더 받지 않는다", () => {
    let c = newCharacter();
    for (let i = 0; i < 38; i++) c = addGear(c, "h_cap", false);
    expect(() => addGear(c, "h_cap", true)).toThrow(/40개/);
  });

  it("메모리 저장소의 갱신은 원자적이다 (실패하면 저장하지 않는다)", async () => {
    const s = new MemoryRpgStore();
    await s.update("a", (c) => ({ state: allocStats(c, { str: 1 }), result: null }));
    await expect(s.update("a", (c) => ({ state: allocStats(c, { str: 99 }), result: null }))).rejects.toThrow();
    expect((await s.get("a")).stats.str).toBe(2);
    await Promise.all([1, 2, 3].map(() => s.update("a", (c) => ({ state: allocStats(c, { vit: 1 }), result: null }))));
    expect((await s.get("a")).statPoints).toBe(1);
  });
});

describe("출현 계획", () => {
  it("같은 시드면 같은 계획, 마지막 웨이브에 우두머리", () => {
    const a = huntPlan(42, "normal");
    expect(huntPlan(42, "normal")).toEqual(a);
    expect(a).toHaveLength(ZONES.normal.waves);
    expect(a.at(-1)!.monsters[0]).toBe("legacy_golem");
    expect(huntSpawnable(a, 0)).not.toHaveProperty("legacy_golem");
  });

  it("45번: 웨이브가 커지고 둘째 웨이브부터 무리가 섞인다, 마리당 EXP는 줄여 총량은 비슷", () => {
    const old = { easy: 17, normal: 29, hard: 44, hell: 62 };
    for (const d of DIFFICULTIES) {
      const p = huntPlan(7, d);
      expect(huntTotal(p) / old[d]).toBeGreaterThan(1.5);
      expect(huntTotal(p) / old[d]).toBeLessThan(2);
      expect(p[0].pack).toBe(0);
      for (const w of p.slice(1)) {
        expect(w.pack).toBeGreaterThanOrEqual(3);
        const pack = w.monsters.slice(w.monsters.length - w.pack);
        expect(new Set(pack).size).toBe(1);
      }
      expect(Math.max(...p.map((w) => w.monsters.length))).toBeLessThanOrEqual(20);
    }
    expect(monsterStats("scope_creep", "easy")).toMatchObject({ maxHp: 48, atk: 8, exp: 4 });
  });

  it("43번: 드롭 확률은 예전의 절반쯤", () => {
    expect(DIFFICULTIES.map((d) => DIFFS[d].dropChance)).toEqual([0.08, 0.1, 0.12, 0.15]);
  });

  it("버그·데드라인 계획은 시간 안에서만 나온다", () => {
    const b = bugsPlan(7, "hard", 60, { dex: 10, luk: 10 });
    expect(b.every((s) => s.t < 60_000)).toBe(true);
    expect(bugsCount(b, 10_000).bug).toBeLessThan(bugsCount(b, 60_000).bug);
    expect(bugsCount(bugsPlan(7, "hell", 60, { dex: 1, luk: 1 }), 60_000).decoy).toBeGreaterThan(0);
    // 어려울수록 더 많이·더 빨리 나온다
    expect(bugsPlan(7, "hell", 60, { dex: 1, luk: 1 }).length).toBeGreaterThan(bugsPlan(7, "easy", 60, { dex: 1, luk: 1 }).length);
    const st = starsPlan(7, "normal", 75);
    expect(st.every((n, i) => i === 0 || n.t >= st[i - 1].t)).toBe(true);
    expect(st.every((n) => n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1 && n.t < 75_000)).toBe(true);
    expect(starsPlan(7, "hell", 75).length).toBeGreaterThan(starsPlan(7, "easy", 75).length);
    expect(starWindows("easy", 50)[1]).toBeGreaterThan(starWindows("easy", 1)[1]);
    expect([0, 4, 5, 10, 20, 99].map(comboMult)).toEqual([1, 1, 1.5, 2, 3, 3]);
  });
});

describe("런 티켓", () => {
  const claims = { n: "nonce1", a: "acct", g: "hunt" as const, d: "easy" as const, t: 1000, s: 5, lv: 1, st: { agi: 1, dex: 1, luk: 1 } };

  it("서명이 맞으면 그대로 돌려받고, 꾸미면 거절한다", async () => {
    const tk = await signTicket("secret", claims);
    expect(await verifyTicket("secret", tk)).toEqual(claims);
    expect(await verifyTicket("other", tk)).toBeNull();
    const [p, sig] = tk.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, d: "hell" })).toString("base64url");
    expect(await verifyTicket("secret", `${forged}.${sig}`)).toBeNull();
    expect(await verifyTicket("secret", `${p}.`)).toBeNull();
    expect(await verifyTicket("secret", "garbage")).toBeNull();
  });

  it("메모리 저장소: 한 번만 끝낼 수 있고, 새 판을 시작하면 옛 판은 끝난다", async () => {
    const s = new MemoryRpgStore();
    await s.startRun("a", "n1", 60, "h");
    await s.startRun("a", "n2", 60, "h");
    expect(await s.claimRun("a", "n1")).toBe("stale");
    expect(await s.claimRun("a", "n2")).toBe("ok");
    expect(await s.claimRun("a", "n2")).toBe("reused");
  });
});

describe("결과 검증", () => {
  const T: TicketInfo = { game: "hunt", difficulty: "easy", seed: 99, level: 1, st: { agi: 1, dex: 1, luk: 1 } };
  const plan = huntPlan(T.seed, T.difficulty);
  const allKills = () => {
    const k: Record<string, number> = {};
    for (const w of plan) for (const m of w.monsters) k[m] = (k[m] ?? 0) + 1;
    return k;
  };
  const hunt = (over: object = {}) => ({ game: "hunt" as const, durationMs: 120_000, kills: allKills(), wavesCleared: plan.length, died: false, potionsUsed: {}, ...over });

  it("정상 클리어는 보상을 받는다 (우두머리를 잡으면 장비 1개)", () => {
    const v = evaluate(T, hunt(), 121_000);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.points).toBe(20);
    expect(v.exp).toBeGreaterThan(0);
    expect(v.drops.some((d) => d.kind === "gear")).toBe(true);
  });

  it("정직한 판은 거절하지 않는다: 모든 난이도·시드에서 시간 절반에 다 잡아도 통과 (45번 출몰량)", () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 60; seed++) {
        const p = huntPlan(seed, d);
        const kills = huntSpawnable(p, Infinity) as Record<string, number>;
        const ms = (ZONES[d].timeLimitSec * 1000) / 2;
        const v = evaluate({ ...T, difficulty: d, seed, level: DIFFS[d].recLevel }, hunt({ kills, wavesCleared: p.length, durationMs: ms }), ms + 1000);
        expect(v.ok, `${d} seed ${seed}`).toBe(true);
      }
    }
  });

  it("서버 시간보다 길다고 하면 TOO_FAST", () => {
    expect(evaluate(T, hunt(), 30_000)).toMatchObject({ ok: false, code: "TOO_FAST" });
  });

  it("그 시간 안에 나올 수 없는 몬스터를 잡았다고 하면 거절", () => {
    expect(evaluate(T, hunt({ durationMs: 12_000 }), 12_500)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
    const k = allKills();
    k.scope_creep = (k.scope_creep ?? 0) + 50;
    expect(evaluate(T, hunt({ kills: k }), 121_000)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
  });

  it("웨이브를 깼다면서 몬스터가 모자라면 거절", () => {
    expect(evaluate(T, hunt({ kills: {} }), 121_000)).toMatchObject({ ok: false });
  });

  it("쓰러지면 포인트 절반, 아주 짧은 판은 보상 없음", () => {
    const v = evaluate(T, hunt({ died: true }), 121_000);
    expect(v.ok && v.points).toBe(10);
    const short = evaluate(T, hunt({ durationMs: MIN_RUN_MS - 1, kills: {}, wavesCleared: 0 }), MIN_RUN_MS);
    expect(short).toMatchObject({ ok: true, points: 0, exp: 0 });
  });

  it("버그 잡기: 나온 수보다 많이 잡으면 거절, 점수는 콤보 상한으로 자르고, 잘하면 최대 포인트", () => {
    const B: TicketInfo = { ...T, game: "bugs" };
    const p = bugsPlan(B.seed, "easy", 60, B.st);
    const all = bugsCount(p, Infinity);
    const base = { game: "bugs" as const, durationMs: 60_000, wrong: 0, decoy: 0 };
    const hits = all.bug * 10 + all.golden * 30;
    const ok = evaluate(B, { ...base, caught: all.bug, golden: all.golden, maxCombo: 20, score: hits * 2 }, 61_000);
    expect(ok).toMatchObject({ ok: true, points: 12, score: hits * 2 });
    // 콤보 5짜리로 ×3 점수를 주장하면 ×1.5까지로 자른다
    const capped = evaluate(B, { ...base, caught: all.bug, golden: all.golden, maxCombo: 5, score: hits * 3 }, 61_000);
    expect(capped).toMatchObject({ ok: true, score: hits * 1.5 });
    const bad = evaluate(B, { ...base, caught: all.bug + 1, golden: 0, maxCombo: 0, score: 0 }, 61_000);
    expect(bad).toMatchObject({ ok: false });
    expect(evaluate(B, { ...base, caught: 1, golden: 0, decoy: all.decoy + 1, maxCombo: 1, score: 10 }, 61_000)).toMatchObject({ ok: false });
  });

  it("별자리 잇기: 그 시간까지 나온 별보다 많이 판정하면 거절, 다 완벽이면 최대 포인트", () => {
    const S: TicketInfo = { ...T, game: "stars" };
    const plan = starsPlan(S.seed, "easy", 75);
    const n = plan.length;
    const full = evaluate(S, { game: "stars", durationMs: 75_000, perfect: n, good: 0, miss: 0, maxCombo: n, score: n * 300 * 2 }, 76_000);
    expect(full).toMatchObject({ ok: true, points: 12 });
    const early = starsCount(plan, 20_000);
    expect(evaluate(S, { game: "stars", durationMs: 20_000, perfect: early + 3, good: 0, miss: 0, maxCombo: 1, score: 300 }, 20_500)).toMatchObject({ ok: false });
    expect(evaluate(S, { game: "stars", durationMs: 75_000, perfect: 2, good: 0, miss: 0, maxCombo: 9, score: 600 }, 76_000)).toMatchObject({ ok: false });
    const half = evaluate(S, { game: "stars", durationMs: 75_000, perfect: Math.floor(n / 3), good: 0, miss: n - Math.floor(n / 3), maxCombo: 3, score: Math.floor(n / 3) * 300 }, 76_000);
    expect(half.ok && half.points).toBeLessThan(12);
  });

  it("카탈로그: 장비 id 형식과 가격", () => {
    for (const g of GEAR) {
      expect(g.id).toMatch(/^[a-z]_[a-z_]+$/);
      expect(g.price).toBeGreaterThan(0);
    }
  });
});
