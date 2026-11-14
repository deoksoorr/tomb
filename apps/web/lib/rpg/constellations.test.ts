import { describe, expect, it } from "vitest";
import { dexIdsOf, DEX_CATS, DEX_TITLES } from "../forage/catalog";
import { dexPercent } from "../forage/service";
import { dexFromHash, MemoryForageStore } from "../forage/store";
import { DIFFICULTIES, type Difficulty } from "./catalog";
import { CONSTELLATIONS, constellationById } from "./constellations";
import { clamp, seeded } from "./formulas";
import { STAR_APPROACH, starGroups, starsCount, starsPlan } from "./plan";
import { checkStarGroups, evaluate, type TicketInfo } from "./rewards";
import type { StarsResult } from "./types";

// 별자리 잇기 개편: 별자리 모양 데이터, 계획(박자 불변·희귀 조건), 완성 목록 서버 검증, 도감 등록.

/** 개편 전 starsPlan 박자 그대로 (판 진행 중 배포가 겹쳐도 옛 화면과 새 서버의 별 수 상한이 같아야 한다) */
function legacyTimes(seed: number, d: Difficulty, durationSec: number): { t: number; group: number; idx: number }[] {
  const BEAT: Record<Difficulty, number> = { easy: 820, normal: 640, hard: 500, hell: 400 };
  const HALF: Record<Difficulty, number> = { easy: 0, normal: 0.12, hard: 0.25, hell: 0.35 };
  const r = seeded(seed ^ 0x53544152);
  const out: { t: number; group: number; idx: number }[] = [];
  const end = durationSec * 1000 - 400;
  let t = STAR_APPROACH[d] + 600;
  let group = 0;
  while (t < end) {
    const len = 5 + Math.floor(r() * 3);
    let x = 0.2 + r() * 0.6;
    let y = 0.25 + r() * 0.5;
    for (let i = 0; i < len && t < end; i++) {
      out.push({ t: Math.round(t), group, idx: i });
      const a = r() * Math.PI * 2;
      const step = 0.14 + r() * 0.12;
      x = clamp(x + Math.cos(a) * step, 0.08, 0.92);
      y = clamp(y + Math.sin(a) * step * 0.9, 0.12, 0.88);
      t += BEAT[d] * (r() < HALF[d] ? 0.5 : 1);
    }
    group++;
    t += BEAT[d] * 1.8;
  }
  return out;
}

const OLD_NAMES = [
  "새해 다짐자리",
  "헬스장 회원권자리",
  "영어 단어장자리",
  "다이어리자리",
  "가계부자리",
  "홈트자리",
  "자격증 문제집자리",
  "독서 기록자리",
  "다이어트자리",
  "기타 독학자리",
  "아침형 인간자리",
  "퇴사 다짐자리",
];

describe("별자리 모양 데이터", () => {
  it("24개 안팎, id·이름 겹침 없음, 예전 12개 이름 유지", () => {
    expect(CONSTELLATIONS.length).toBeGreaterThanOrEqual(20);
    expect(CONSTELLATIONS.length).toBeLessThanOrEqual(28);
    expect(new Set(CONSTELLATIONS.map((c) => c.id)).size).toBe(CONSTELLATIONS.length);
    expect(new Set(CONSTELLATIONS.map((c) => c.name)).size).toBe(CONSTELLATIONS.length);
    for (const n of OLD_NAMES) expect(CONSTELLATIONS.map((c) => c.name)).toContain(n);
    for (const c of CONSTELLATIONS) {
      expect(c.id).toMatch(/^c_[a-z]+$/);
      expect(c.name.endsWith("자리")).toBe(true);
      expect(c.shape.length).toBeGreaterThan(0);
      expect(c.desc.length).toBeGreaterThan(0);
    }
  });

  it("별 수 5~7, 좌표는 화면(망원경 테) 안, 잇는 순서는 서로 다른 별을 알맞은 거리로", () => {
    for (const c of CONSTELLATIONS) {
      expect(c.stars.length, c.id).toBeGreaterThanOrEqual(5);
      expect(c.stars.length, c.id).toBeLessThanOrEqual(7);
      for (const [x, y] of c.stars) {
        expect(x, c.id).toBeGreaterThanOrEqual(0.06);
        expect(x, c.id).toBeLessThanOrEqual(0.94);
        expect(y, c.id).toBeGreaterThanOrEqual(0.06);
        expect(y, c.id).toBeLessThanOrEqual(0.94);
      }
      // 이웃한 두 별(잇는 차례)은 겹치지 않고 너무 멀지도 않다
      for (let i = 1; i < c.stars.length; i++) {
        const d = Math.hypot(c.stars[i][0] - c.stars[i - 1][0], c.stars[i][1] - c.stars[i - 1][1]);
        expect(d, `${c.id} ${i}`).toBeGreaterThanOrEqual(0.12);
        expect(d, `${c.id} ${i}`).toBeLessThanOrEqual(0.85);
      }
      // 어떤 두 별도 한 자리에 겹치지 않는다
      for (let i = 0; i < c.stars.length; i++)
        for (let j = i + 1; j < c.stars.length; j++)
          expect(Math.hypot(c.stars[i][0] - c.stars[j][0], c.stars[i][1] - c.stars[j][1]), `${c.id} ${i}-${j}`).toBeGreaterThanOrEqual(0.1);
      // 그림 선도 0..1 안, 선마다 점 둘 이상
      expect(c.art.length).toBeGreaterThan(0);
      for (const line of c.art) {
        expect(line.length).toBeGreaterThanOrEqual(2);
        for (const [x, y] of line) {
          expect(x, c.id).toBeGreaterThanOrEqual(0);
          expect(x, c.id).toBeLessThanOrEqual(1);
          expect(y, c.id).toBeGreaterThanOrEqual(0);
          expect(y, c.id).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("별 수(5·6·7)마다 어느 난이도에서나 나오는 별자리가 셋 이상, 희귀·전설도 있다", () => {
    for (const len of [5, 6, 7]) {
      const same = CONSTELLATIONS.filter((c) => c.stars.length === len);
      expect(same.filter((c) => c.rarity <= 2).length).toBeGreaterThanOrEqual(3);
      expect(same.some((c) => c.rarity === 3)).toBe(true);
      expect(same.some((c) => c.rarity === 5)).toBe(true);
    }
  });
});

describe("별자리 잇기 계획", () => {
  it("박자·무리 크기·무리 번호는 개편 전과 똑같다 (맑은 밤이어도)", () => {
    for (const seed of [1, 7, 12345, 99_999_999])
      for (const d of DIFFICULTIES)
        for (const starry of [false, true]) {
          const plan = starsPlan(seed, d, 75, starry);
          expect(plan.map(({ t, group, idx }) => ({ t, group, idx }))).toEqual(legacyTimes(seed, d, 75));
        }
  });

  it("같은 시드면 같은 계획, 무리마다 한 별자리 · 그 별자리의 별 수만큼 (판 끝에 잘린 마지막 무리만 예외)", () => {
    expect(starsPlan(42, "hard", 75, true)).toEqual(starsPlan(42, "hard", 75, true));
    for (const seed of [3, 4, 5, 6]) {
      const plan = starsPlan(seed, "normal", 75);
      const gs = starGroups(plan);
      gs.forEach((g, i) => {
        const con = constellationById(g.con)!;
        expect(plan.filter((n) => n.group === g.group).every((n) => n.con === g.con)).toBe(true);
        if (i < gs.length - 1) expect(g.full).toBe(true);
        expect(g.size).toBeLessThanOrEqual(con.stars.length);
        // 별 자리는 별자리 모양 그대로
        for (const n of plan.filter((n) => n.group === g.group)) expect([n.x, n.y]).toEqual(con.stars[n.idx]);
      });
      // 한 판 안에서는 같은 별 수의 후보를 다 쓰기 전에는 같은 별자리가 다시 나오지 않는다
      for (const len of [5, 6, 7]) {
        const same = gs.filter((g) => constellationById(g.con)!.stars.length === len).map((g) => g.con);
        const pool = CONSTELLATIONS.filter((c) => c.stars.length === len && c.rarity <= 2).length;
        expect(new Set(same).size).toBe(Math.min(same.length, pool));
      }
    }
  });

  it("희귀는 어려움·지옥에서만, 전설은 맑은 밤 판에서만", () => {
    const seen = (d: Difficulty, starry: boolean) => {
      const out = new Set<number>();
      for (let seed = 1; seed <= 300; seed++) for (const g of starGroups(starsPlan(seed, d, 75, starry))) out.add(constellationById(g.con)!.rarity);
      return out;
    };
    for (const d of ["easy", "normal"] as const) {
      expect(seen(d, false).has(3)).toBe(false);
      expect(seen(d, false).has(5)).toBe(false);
      expect(seen(d, true).has(3)).toBe(false);
      expect(seen(d, true).has(5)).toBe(true);
    }
    for (const d of ["hard", "hell"] as const) {
      expect(seen(d, false).has(3)).toBe(true);
      expect(seen(d, false).has(5)).toBe(false);
      expect(seen(d, true).has(5)).toBe(true);
    }
  });

  it("별 개수 상한은 그대로 (같은 시간에 나올 수 있는 별 수가 예전과 같다)", () => {
    for (const d of DIFFICULTIES) {
      const plan = starsPlan(77, d, 75, true);
      const old = legacyTimes(77, d, 75);
      for (const ms of [10_000, 30_000, 75_000]) expect(starsCount(plan, ms)).toBe(old.filter((n) => n.t <= ms).length);
    }
  });
});

describe("완성 목록 서버 검증", () => {
  const T: TicketInfo = { game: "stars", difficulty: "normal", seed: 2024, level: 10, st: { agi: 1, dex: 1, luk: 1 } };
  const plan = starsPlan(T.seed, T.difficulty, 75);
  const gs = starGroups(plan);
  const full = gs.filter((g) => g.full);
  const base = (over: Partial<StarsResult>): StarsResult => ({
    game: "stars",
    durationMs: 75_000,
    perfect: plan.length,
    good: 0,
    miss: 0,
    maxCombo: plan.length,
    score: plan.length * 300,
    ...over,
  });

  it("목록이 없으면(옛 화면) 도감 등록 없이 예전처럼", () => {
    const v = evaluate(T, base({}), 76_000);
    expect(v.ok).toBe(true);
    expect(v.ok && v.stars).toBeUndefined();
  });

  it("계획에 있고 시간 안이고 이은 별 수가 맞으면 통과 → 무리마다 별자리 id", () => {
    const groups = [full[0].group, full[1].group];
    const v = evaluate(T, base({ groups, perfectGroups: [full[0].group] }), 76_000);
    expect(v).toMatchObject({
      ok: true,
      stars: [
        { group: full[0].group, id: full[0].con, perfect: true },
        { group: full[1].group, id: full[1].con, perfect: false },
      ],
    });
  });

  it("가짜 목록은 판 전체를 거절한다", () => {
    const g0 = full[0].group;
    const bad: Partial<StarsResult>[] = [
      // 없는 무리
      { groups: [gs.length + 3] },
      // 같은 무리 두 번
      { groups: [g0, g0] },
      // 완벽 목록이 완성 목록 밖
      { groups: [g0], perfectGroups: [full[1].group] },
      // 이은 별 수보다 완성 별 수가 많다
      { groups: full.map((g) => g.group), perfect: 3, good: 0, miss: 0, maxCombo: 3, score: 900 },
      // 완벽으로만 이었다는 별 수가 완벽 판정보다 많다
      { groups: [g0], perfectGroups: [g0], perfect: 0, good: full[0].size, maxCombo: full[0].size, score: full[0].size * 100 },
    ];
    for (const o of bad) expect(evaluate(T, base(o), 76_000), JSON.stringify(o)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
    // 아직 나오지도 않은 무리 (시간 밖): 10초 판에 마지막 무리를 완성했다고
    const lastFull = full[full.length - 1];
    const early = starsCount(plan, 10_000);
    expect(evaluate(T, base({ durationMs: 10_000, perfect: early, maxCombo: early, score: early * 300, groups: [lastFull.group] }), 10_500)).toMatchObject({
      ok: false,
    });
  });

  it("판 끝에 잘린 무리는 완성할 수 없다", () => {
    // 잘린 무리가 생기는 계획을 찾는다
    for (let seed = 1; seed < 200; seed++) {
      const p = starsPlan(seed, "easy", 75);
      const g = starGroups(p);
      const cut = g.find((x) => !x.full);
      if (!cut) continue;
      const r = base({ perfect: p.length, maxCombo: p.length, groups: [cut.group] });
      expect(checkStarGroups(p, r, 76_000)).toBeNull();
      return;
    }
    throw new Error("잘린 무리가 있는 계획을 못 찾음");
  });

  it("맑은 밤 판이면 서버도 맑은 밤 계획으로 별자리를 정한다", () => {
    const S: TicketInfo = { ...T, difficulty: "hard", starry: true };
    for (let seed = 1; seed < 400; seed++) {
      const p = starsPlan(seed, "hard", 75, true);
      const legend = starGroups(p).find((g) => g.full && constellationById(g.con)!.rarity === 5);
      if (!legend) continue;
      const v = evaluate(
        { ...S, seed },
        { game: "stars", durationMs: 75_000, perfect: p.length, good: 0, miss: 0, maxCombo: p.length, score: 0, groups: [legend.group] },
        76_000,
      );
      expect(v.ok && v.stars?.[0].id).toBe(legend.con);
      return;
    }
    throw new Error("전설 별자리가 있는 계획을 못 찾음");
  });
});

describe("별자리 도감", () => {
  it("도감 칸에 별자리가 있고 칭호·보상 단계가 있다 (가방·판매 분류는 그대로)", () => {
    expect(DEX_CATS).toContain("star");
    expect(dexIdsOf("star")).toEqual(CONSTELLATIONS.map((c) => c.id));
    expect(DEX_TITLES.star[50]).toBeTruthy();
    expect(DEX_TITLES.star[100]).toBeTruthy();
  });

  it("등록: 처음만 새로, 다시 완성하면 횟수만 · 완벽 횟수 따로 · 가방에는 안 들어간다", async () => {
    const st = new MemoryForageStore();
    expect(await st.addStars("a", "20261114", [{ id: "c_gym", perfect: false }])).toEqual([true]);
    expect(
      await st.addStars("a", "20261115", [
        { id: "c_gym", perfect: true },
        { id: "c_diet", perfect: true },
      ]),
    ).toEqual([false, true]);
    const s = await st.snapshot("a", "20261115", 0);
    expect(s.bag).toEqual({});
    expect(s.day).toMatchObject({ fish: 0, gather: 0 });
    expect(s.dex.c_gym).toEqual({ n: 2, max: 0, first: "20261114", pf: 1 });
    expect(s.dex.c_diet).toEqual({ n: 1, max: 0, first: "20261115", pf: 1 });
    expect(dexPercent(s.dex, "star")).toBe(Math.floor((2 * 100) / CONSTELLATIONS.length));
    expect(dexFromHash({ "n:c_gym": "3", "first:c_gym": "20261114", "pf:c_gym": "2" })).toEqual({ c_gym: { n: 3, max: 0, first: "20261114", pf: 2 } });
  });
});
