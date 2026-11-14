import { describe, expect, it } from "vitest";
import { dexIdsOf, DEX_CATS, DEX_TITLES } from "../forage/catalog";
import { dexPercent } from "../forage/service";
import { dexFromHash, MemoryForageStore } from "../forage/store";
import { SEASONS } from "../ambience";
import { DIFFICULTIES, type Difficulty } from "./catalog";
import { CONSTELLATIONS, constellationById, STAR_COUNT } from "./constellations";
import { clamp, seeded } from "./formulas";
import { STAR_APPROACH, starGroups, starsCount, starsPlan, STARS_PLAN_VER, type StarSky } from "./plan";
import { checkStarGroups, evaluate, type TicketInfo } from "./rewards";
import { starsPlanV1, V1_SIZE, V1_TABLE } from "./starsPlanV1";
import type { StarsResult } from "./types";

// 별자리 잇기: 별자리 모양 데이터, 계획(2판: 별 많은 별자리·계절·새벽, 1판 얼림), 완성 목록 서버 검증(판 번호), 도감 등록.

/** 개편 전(0판) starsPlan 박자 — 1판은 이 박자와 같았다 */
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
  it("1차 24개 id 그대로 + 계절·새벽, id·이름 겹침 없음, 예전 12개 이름 유지", () => {
    expect(CONSTELLATIONS.length).toBeGreaterThanOrEqual(28);
    expect(CONSTELLATIONS.length).toBeLessThanOrEqual(34);
    for (const [id] of V1_TABLE) expect(constellationById(id), id).toBeTruthy();
    expect(new Set(CONSTELLATIONS.map((c) => c.id)).size).toBe(CONSTELLATIONS.length);
    expect(new Set(CONSTELLATIONS.map((c) => c.name)).size).toBe(CONSTELLATIONS.length);
    for (const n of OLD_NAMES) expect(CONSTELLATIONS.map((c) => c.name)).toContain(n);
    for (const s of SEASONS)
      expect(
        CONSTELLATIONS.some((c) => c.season === s),
        s,
      ).toBe(true);
    expect(CONSTELLATIONS.filter((c) => c.dawn).length).toBeGreaterThanOrEqual(2);
    for (const c of CONSTELLATIONS) {
      expect(c.id).toMatch(/^c_[a-z]+$/);
      expect(c.name.endsWith("자리")).toBe(true);
      expect(c.shape.length).toBeGreaterThan(0);
      expect(c.desc.length).toBeGreaterThan(0);
      expect(!!c.season && !!c.dawn).toBe(false);
    }
  });

  it("별 수는 희귀도별 범위(흔함 8~10·보통 10~12·희귀 12~15·전설 16~20), 좌표는 화면(망원경 테) 안, 잇는 순서는 알맞은 거리로", () => {
    for (const c of CONSTELLATIONS) {
      const [lo, hi] = STAR_COUNT[c.rarity];
      expect(c.stars.length, c.id).toBeGreaterThanOrEqual(lo);
      expect(c.stars.length, c.id).toBeLessThanOrEqual(hi);
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
      // 그림 선도 0..1 안, 선마다 점 둘 이상, 첫 줄은 별을 이은 테두리
      expect(c.art.length).toBeGreaterThan(1);
      for (const line of c.art) {
        expect(line.length).toBeGreaterThanOrEqual(2);
        for (const [x, y] of line) {
          expect(x, c.id).toBeGreaterThanOrEqual(0);
          expect(x, c.id).toBeLessThanOrEqual(1);
          expect(y, c.id).toBeGreaterThanOrEqual(0);
          expect(y, c.id).toBeLessThanOrEqual(1);
        }
      }
      expect(c.art[0][0], c.id).toEqual(c.stars[0]);
    }
  });
});

const SKIES: StarSky[] = [{}, { starry: true }, { season: "spring" }, { season: "winter", dawn: true }];

describe("별자리 잇기 계획 (2판)", () => {
  it("같은 시드·하늘이면 같은 계획, 무리 = 별자리 별 전부(잘린 무리 없음), 별 자리는 모양 그대로", () => {
    expect(starsPlan(42, "hard", 75, { starry: true })).toEqual(starsPlan(42, "hard", 75, { starry: true }));
    for (const seed of [3, 4, 5, 6])
      for (const d of DIFFICULTIES) {
        const plan = starsPlan(seed, d, 75, SKIES[seed % SKIES.length]);
        const gs = starGroups(plan);
        expect(gs.length).toBeGreaterThan(3);
        for (const g of gs) {
          const con = constellationById(g.con)!;
          expect(g.full, g.con).toBe(true);
          for (const n of plan.filter((n) => n.group === g.group)) expect([n.x, n.y]).toEqual(con.stars[n.idx]);
        }
        expect(plan.every((n, i) => i === 0 || n.t > plan[i - 1].t)).toBe(true);
        expect(plan[plan.length - 1].t).toBeLessThan(75_000 - 400);
        // 한 판 안에서 같은 별자리가 두 번 나오지 않는다 (후보가 무리 수보다 많다)
        expect(new Set(gs.map((g) => g.con)).size).toBe(gs.length);
      }
  });

  it("박자 간격·반 박자 확률은 그대로: 무리 안 간격은 한 박자 또는 반 박자, 무리 사이는 2.8박자", () => {
    const BEAT: Record<Difficulty, number> = { easy: 820, normal: 640, hard: 500, hell: 400 };
    for (const d of DIFFICULTIES) {
      const plan = starsPlan(11, d, 75);
      for (let i = 1; i < plan.length; i++) {
        const gap = plan[i].t - plan[i - 1].t;
        const same = plan[i].group === plan[i - 1].group;
        const ok = same ? [BEAT[d], BEAT[d] / 2] : [BEAT[d] * 2.8];
        expect(
          ok.some((w) => Math.abs(gap - w) <= 1),
          `${d} ${i} ${gap}`,
        ).toBe(true);
      }
    }
  });

  it("희귀는 어려움·지옥, 전설은 맑은 밤, 계절 별자리는 그 계절, 새벽 별자리는 새벽에만", () => {
    const seen = (d: Difficulty, sky: StarSky) => {
      const out = new Set<string>();
      for (let seed = 1; seed <= 250; seed++) for (const g of starGroups(starsPlan(seed, d, 75, sky))) out.add(g.con);
      return [...out].map((id) => constellationById(id)!);
    };
    for (const d of ["easy", "normal"] as const) {
      const plain = seen(d, {});
      expect(plain.some((c) => c.rarity === 3 || c.rarity === 5 || c.season || c.dawn)).toBe(false);
      expect(seen(d, { starry: true }).some((c) => c.rarity === 5)).toBe(true);
      const dawn = seen(d, { dawn: true });
      expect(dawn.some((c) => c.dawn)).toBe(true);
      expect(dawn.some((c) => c.rarity === 3 && !c.dawn)).toBe(false);
    }
    for (const d of ["hard", "hell"] as const) {
      const plain = seen(d, {});
      expect(plain.some((c) => c.rarity === 3 && !c.dawn)).toBe(true);
      expect(plain.some((c) => c.rarity === 5 || c.season || c.dawn)).toBe(false);
    }
    for (const s of SEASONS) {
      const got = seen("normal", { season: s });
      expect(
        got.some((c) => c.season === s),
        s,
      ).toBe(true);
      expect(
        got.some((c) => c.season && c.season !== s),
        s,
      ).toBe(false);
    }
  });

  it("1판 계획은 얼려 둔 그대로 (박자는 0판과 같고, 별자리는 1판 표대로)", () => {
    for (const seed of [1, 7, 12345])
      for (const d of DIFFICULTIES)
        expect(starsPlanV1(seed, d, 75, seed % 2 === 0).map(({ t, group, idx }) => ({ t, group, idx }))).toEqual(legacyTimes(seed, d, 75));
    // 1판 서버가 냈던 별자리 (커밋 b19d557의 starsPlan과 비교해 뽑은 기준값)
    const a = starsPlanV1(7, "normal", 75, false);
    expect([a.length, a.reduce((s, x) => s + x.t, 0)]).toEqual([91, 3378264]);
    expect(starGroups(a, (id) => V1_SIZE.get(id)).map((g) => g.con)).toEqual([
      "c_cooking",
      "c_license",
      "c_reading",
      "c_morning",
      "c_blog",
      "c_coding",
      "c_diet",
      "c_diary",
      "c_guitar",
      "c_ledger",
      "c_newyear",
      "c_hometrain",
      "c_resign",
      "c_ledger",
      "c_license",
      "c_diet",
    ]);
    const b = starsPlanV1(2024, "hard", 75, true);
    expect([b.length, b.reduce((s, x) => s + x.t, 0)]).toEqual([126, 4771900]);
    expect(starGroups(b, (id) => V1_SIZE.get(id))[19].con).toBe("c_bucket");
  });
});

describe("완성 목록 서버 검증", () => {
  const T: TicketInfo = { game: "stars", difficulty: "normal", seed: 2024, level: 10, st: { agi: 1, dex: 1, luk: 1 }, planVer: STARS_PLAN_VER };
  const plan = starsPlan(T.seed, T.difficulty, 75);
  const gs = starGroups(plan);
  const base = (over: Partial<StarsResult>, p = plan): StarsResult => ({
    game: "stars",
    durationMs: 75_000,
    perfect: p.length,
    good: 0,
    miss: 0,
    maxCombo: p.length,
    score: p.length * 300,
    ...over,
  });

  it("목록이 없으면(옛 화면) 도감 등록 없이 예전처럼", () => {
    const v = evaluate(T, base({}), 76_000);
    expect(v.ok).toBe(true);
    expect(v.ok && v.stars).toBeUndefined();
  });

  it("계획에 있고 시간 안이고 이은 별 수가 맞으면 통과 → 무리마다 별자리 id", () => {
    const v = evaluate(T, base({ groups: [gs[0].group, gs[1].group], perfectGroups: [gs[0].group] }), 76_000);
    expect(v).toMatchObject({
      ok: true,
      stars: [
        { group: gs[0].group, id: gs[0].con, perfect: true },
        { group: gs[1].group, id: gs[1].con, perfect: false },
      ],
    });
  });

  it("판 번호가 있는 티켓: 가짜 목록은 판 전체를 거절한다", () => {
    const g0 = gs[0].group;
    const bad: Partial<StarsResult>[] = [
      { groups: [gs.length + 3] },
      { groups: [g0, g0] },
      { groups: [g0], perfectGroups: [gs[1].group] },
      { groups: gs.map((g) => g.group), perfect: 3, good: 0, miss: 0, maxCombo: 3, score: 900 },
      { groups: [g0], perfectGroups: [g0], perfect: 0, good: gs[0].size, maxCombo: gs[0].size, score: gs[0].size * 100 },
    ];
    for (const o of bad) expect(evaluate(T, base(o), 76_000), JSON.stringify(o)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
    // 아직 나오지도 않은 무리 (시간 밖)
    const last = gs[gs.length - 1];
    const early = starsCount(plan, 10_000);
    expect(evaluate(T, base({ durationMs: 10_000, perfect: early, maxCombo: early, score: early * 300, groups: [last.group] }), 10_500)).toMatchObject({
      ok: false,
    });
  });

  it("1판 티켓(sv=1)은 1판 계획으로 검사한다", () => {
    const T1: TicketInfo = { ...T, planVer: 1 };
    const p1 = starsPlanV1(T.seed, "normal", 75);
    const g1 = starGroups(p1, (id) => V1_SIZE.get(id)).filter((g) => g.full);
    const v = evaluate(T1, base({ groups: [g1[0].group] }, p1), 76_000);
    expect(v).toMatchObject({ ok: true, stars: [{ id: g1[0].con }] });
  });

  it("판 번호 없는 옛 티켓: 1판으로 맞으면 1판, 2판 화면이 보낸 결과도 거절하지 않는다 (안 맞는 목록은 버리고 보상은 그대로)", () => {
    const T0: TicketInfo = { ...T, planVer: undefined };
    const p1 = starsPlanV1(T.seed, "normal", 75);
    const g1 = starGroups(p1, (id) => V1_SIZE.get(id)).filter((g) => g.full);
    expect(evaluate(T0, base({ groups: [g1[0].group] }, p1), 76_000)).toMatchObject({ ok: true, stars: [{ id: g1[0].con }] });
    // 2판 화면의 정상 판 (별 수·목록 모두 2판 기준): 거절되지 않는다
    for (let seed = 1; seed < 60; seed++) {
      const p2 = starsPlan(seed, "hell", 75);
      const r = base({ groups: starGroups(p2).map((g) => g.group), perfectGroups: [] }, p2);
      const v = evaluate({ ...T0, seed, difficulty: "hell" }, r, 76_000);
      expect(v.ok, String(seed)).toBe(true);
    }
  });

  it("판 끝에 잘린 무리는 완성할 수 없다 (1판 계획)", () => {
    for (let seed = 1; seed < 200; seed++) {
      const p = starsPlanV1(seed, "easy", 75);
      const g = starGroups(p, (id) => V1_SIZE.get(id));
      const cut = g.find((x) => !x.full);
      if (!cut) continue;
      expect(checkStarGroups(p, base({ groups: [cut.group] }, p), 76_000, (id) => V1_SIZE.get(id))).toBeNull();
      return;
    }
    throw new Error("잘린 무리가 있는 계획을 못 찾음");
  });

  it("하늘(맑은 밤·계절·새벽)이 같아야 같은 별자리 — 서버는 티켓 시각의 하늘로 다시 만든다", () => {
    for (let seed = 1; seed < 400; seed++) {
      const sky: StarSky = { season: "autumn" };
      const p = starsPlan(seed, "normal", 75, sky);
      const g = starGroups(p).find((x) => constellationById(x.con)!.season === "autumn");
      if (!g) continue;
      const r = base({ groups: [g.group] }, p);
      expect(evaluate({ ...T, seed, sky }, r, 76_000)).toMatchObject({ ok: true, stars: [{ id: g.con }] });
      return;
    }
    throw new Error("가을 별자리가 있는 계획을 못 찾음");
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
