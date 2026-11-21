import { describe, expect, it } from "vitest";
import { seeded } from "@/lib/rpg/formulas";
import {
  ACX,
  ARENA,
  chairThreat,
  chairQuit,
  clampArena,
  COVER_FP,
  coverRect,
  hitDamage,
  chairDmgMul,
  CHAIR_HEAL_MUL,
  CHAIR_HEAL_CAP_PER_SEC,
  CHAIR_REF_HP,
  DMG,
  mailWaves,
  leadAim,
  mailEdgeY,
  mailOpenLead,
  mailPlan,
  mailReact,
  mailSpeedMul,
  mailVy,
  mailWaveReach,
  MailSeq,
  boomCount,
  boomLayout,
  BOOM,
  inBoom,
  flipWarn,
  FLIP,
  AW,
  AH,
  GATHER,
  gatherBall,
  gatherPlan,
  gatherCount,
  stepGather,
  DROP,
  dropDist,
  dropFloor,
  dropReach,
  dropSafe,
  dropSeats,
  dropSweepAt,
  dropWarn,
  COFFEE,
  coffeeAt,
  coffeeHeal,
  coffeeReady,
  coffeeSpot,
  speedOf,
  MAIL,
  patternGap,
  patVariant,
  ALL_PATS,
  layCovers,
  liveSkills,
  overlapOf,
  phaseKills,
  drawPattern,
  gapDist,
  mailGapX,
  mailMargin,
  newPatBag,
  PAT_FRESH_N,
  PAT_GRADE,
  peekPatterns,
  type PatId,
  pushOutCovers,
  rayLen,
  sealClock,
  sealedAt,
  sealSoon,
  segRect,
  slotsOf,
  type Cover,
} from "./rules";
import { sealCard } from "./sealText";
import { SKILLS } from "@/lib/rpg/skillTree";

describe("회장님 독대 기술 고르기", () => {
  // 11/21 판 전체 주머니: 18개를 다 쓰기 전엔 중복 없음 · 첫 주머니는 쉬움 → 보통 → 어려움 · 재섞기 앞 6개는 직전 6개와 다름
  it("처음 18번은 중복 없이 18개 전부, 등급은 쉬움 → 보통 → 어려움 순", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const bag = newPatBag();
      const r = seeded(seed);
      const seq = Array.from({ length: ALL_PATS.length }, () => drawPattern(bag, r)!);
      expect(new Set(seq).size).toBe(ALL_PATS.length);
      const g = seq.map((k) => PAT_GRADE[k]);
      for (let i = 1; i < g.length; i++) expect(g[i]).toBeGreaterThanOrEqual(g[i - 1]);
    }
    expect(ALL_PATS.filter((k) => PAT_GRADE[k] === 0).sort()).toEqual(["bug", "deadline", "dot", "hotfix", "mail", "planChange", "projBoom", "quick"]);
    expect(ALL_PATS.filter((k) => PAT_GRADE[k] === 2).sort()).toEqual(["maint", "stars", "truck"]);
  });
  it("주머니마다 18개 전부 한 번씩, 재섞기 경계에서 앞 6개는 직전 6개와 겹치지 않는다", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const bag = newPatBag();
      const r = seeded(seed);
      const n = ALL_PATS.length;
      const seq = Array.from({ length: n * 5 }, () => drawPattern(bag, r)!);
      for (let c = 0; c < 5; c++) expect([...seq.slice(c * n, c * n + n)].sort()).toEqual([...ALL_PATS].sort());
      for (let c = 1; c < 5; c++) {
        const prev = seq.slice(c * n - PAT_FRESH_N, c * n);
        for (const k of seq.slice(c * n, c * n + PAT_FRESH_N)) expect(prev).not.toContain(k);
      }
    }
  });
  it("지금 돌고 있는 기술은 안 나온다 (동시 실행 중복 없음), 그래도 주머니 중복은 없다", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const bag = newPatBag();
      const r = seeded(seed);
      let running: PatId[] = [];
      const out: PatId[] = [];
      for (let i = 0; i < 400; i++) {
        const k = drawPattern(bag, r, running);
        if (!k) continue;
        expect(running).not.toContain(k);
        out.push(k);
        running = [...running, k].slice(-3);
      }
      const n = ALL_PATS.length;
      for (let c = 0; c + n <= out.length; c += n) expect(new Set(out.slice(c, c + n)).size).toBe(n);
    }
  });
  it("같은 시드면 같은 순서, 미리 보기는 실제로 나올 순서", () => {
    const run = (seed: number) => {
      const bag = newPatBag();
      const r = seeded(seed);
      const peek = peekPatterns(bag, r, 5);
      const seq = Array.from({ length: 40 }, () => drawPattern(bag, r));
      expect(seq.slice(0, 5)).toEqual(peek);
      return seq;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });
  it("11/21 1~2단계 하나 · 3단계부터 둘 · 크런치는 셋 겹치고, 즉사는 3단계부터 · 크런치는 45초마다", () => {
    expect(overlapOf(0)).toBe(1);
    expect(overlapOf(1)).toBe(1);
    expect(overlapOf(2)).toBe(2);
    expect(overlapOf(4)).toBe(2);
    expect(overlapOf(5)).toBe(3);
    expect(phaseKills(seeded(1), 0)).toEqual([]);
    expect(phaseKills(seeded(1), 1)).toEqual([]);
    expect(phaseKills(seeded(1), 2).map((k) => k.kind)).toEqual(["drop"]);
    // 1분 단계 안에 다 온다
    for (let ph = 1; ph <= 4; ph++) for (const k of phaseKills(seeded(ph), ph)) expect(k.at).toBeLessThan(55);
    const crunch = phaseKills(seeded(1), 5);
    expect(crunch[0].kind).toBe("quit");
    expect(crunch[1].at - crunch[0].at).toBeGreaterThan(38);
    expect(crunch[1].at - crunch[0].at).toBeLessThan(52);
    expect(crunch[0].at).toBeLessThan(20);
    expect(crunch.length * 45).toBeGreaterThanOrEqual(15 * 60);
  });
  it("쉬는 틈은 단계가 오를수록 짧고, 크런치는 1초 아래", () => {
    expect(patternGap(0, 1)).toBeCloseTo(3.0);
    expect(patternGap(1, 1)).toBeCloseTo(2.6);
    expect(patternGap(0, 1)).toBeGreaterThan(patternGap(1, 1));
    expect(patternGap(1, 1)).toBeGreaterThan(patternGap(3, 1));
    expect(patternGap(5, 3)).toBeLessThan(1);
  });
  it("변형: 단계가 오를수록 노리는 쪽이 잦고, 앞질러 노린 자리는 판 안", () => {
    const r = seeded(9);
    const aimed = (ph: number) => Array.from({ length: 2000 }, () => patVariant(r, ph).aimed).filter(Boolean).length / 2000;
    expect(aimed(5)).toBeGreaterThan(aimed(0) + 0.3);
    expect(leadAim({ x: 300, y: 250 }, { x: 100, y: 0 }, 0.5)).toEqual({ x: 350, y: 250 });
    expect(leadAim({ x: ARENA.x1 - 5, y: 250 }, { x: 400, y: 0 }, 1).x).toBe(ARENA.x1);
  });
});

describe("세기 · 피해", () => {
  it("서버 곡선 그대로 (노멀 0분 1 · 크런치 5분 2 · 헬 0.7)", () => {
    expect(chairThreat("normal", 0)).toBeCloseTo(1);
    expect(chairThreat("normal", 5 * 60_000)).toBeCloseTo(2);
    expect(chairThreat("normal", 6 * 60_000)).toBeCloseTo(2 * 1.35);
    expect(chairThreat("hell", 0)).toBeCloseTo(0.7);
  });
  it("11/21 피해: 1~3단계 0.55 · 4~5단계 1.0까지 · 크런치 1분마다 ×2.5 (기준 체력 6천이면 크런치 직전 가벼움 16% · 보통 22% · 무거움 40%)", () => {
    const M = 60_000;
    expect(chairDmgMul("normal", 0)).toBeCloseTo(0.55);
    expect(chairDmgMul("normal", 2.9 * M)).toBeCloseTo(0.55);
    expect(chairDmgMul("normal", 4 * M)).toBeCloseTo(0.775);
    expect(chairDmgMul("normal", 5 * M)).toBeCloseTo(1);
    expect(chairDmgMul("normal", 6 * M)).toBeCloseTo(2.5);
    expect(chairDmgMul("hell", 0)).toBeCloseTo(0.55 * 0.85);
    // 기준 체력: 최대 HP %가 그대로
    expect(hitDamage(DMG.light, CHAIR_REF_HP, 1)).toBe(960);
    expect(hitDamage(DMG.normal, CHAIR_REF_HP, chairDmgMul("normal", 0)) / CHAIR_REF_HP).toBeCloseTo(0.121, 3);
    // 체력이 높을수록 % 로는 덜 아프다 (약 2.5천 ×1.55 · 1.2만 ×0.71)
    const pct = (hp: number) => hitDamage(DMG.normal, hp, 1) / hp;
    expect(pct(2500) / pct(CHAIR_REF_HP)).toBeCloseTo(1.55, 1);
    expect(pct(12000) / pct(CHAIR_REF_HP)).toBeCloseTo(0.71, 1);
    // 크런치 2분(7분)이면 최강 스펙(최대 HP 1.2만)도 무거움 한 대가 최대 HP를 넘고, 보통 한 대가 90%를 넘는다
    expect(hitDamage(DMG.heavy, 12000, chairDmgMul("normal", 7 * M))).toBeGreaterThan(12000);
    expect(hitDamage(DMG.normal, 12000, chairDmgMul("normal", 7 * M))).toBeGreaterThan(12000 * 0.9);
    expect(hitDamage(DMG.normal, 12000, chairDmgMul("normal", 5 * M))).toBeLessThan(12000 * 0.2);
  });
  it("11/21 회복 감소 50% · 초당 상한 3%", () => {
    expect(CHAIR_HEAL_MUL).toBe(0.5);
    expect(CHAIR_HEAL_CAP_PER_SEC).toBe(0.03);
  });
});

describe("지옥 봉인", () => {
  const pool = ["fr_ward", "em_spark", "em_meteor", "wk_grip"];
  it("45초마다 앞에서부터 하나씩", () => {
    expect(sealedAt(pool, 44_999)).toEqual([]);
    expect(sealedAt(pool, 45_000)).toEqual(["fr_ward"]);
    expect(sealedAt(pool, 135_000)).toEqual(["fr_ward", "em_spark", "em_meteor"]);
    expect(sealedAt(pool, 10 * 60_000)).toEqual(pool);
  });
  it("3초 전부터 다음 봉인을 알린다", () => {
    expect(sealSoon(pool, 41_000)).toBeNull();
    expect(sealSoon(pool, 42_500)).toBe("fr_ward");
    expect(sealSoon(pool, 10 * 60_000)).toBeNull();
  });
  it("11/21 다음 반려 예고: 남은 시간 · 3초 안이면 무엇인지 · 다 반려되면 끝", () => {
    expect(sealClock(pool, 0)).toEqual({ sealed: [], next: "fr_ward", leftMs: 45_000, reveal: false });
    expect(sealClock(pool, 33_000)).toMatchObject({ next: "fr_ward", leftMs: 12_000, reveal: false });
    expect(sealClock(pool, 42_000)).toMatchObject({ next: "fr_ward", leftMs: 3_000, reveal: true });
    expect(sealClock(pool, 46_000)).toEqual({ sealed: ["fr_ward"], next: "em_spark", leftMs: 44_000, reveal: false });
    expect(sealClock(pool, 132_500)).toMatchObject({ sealed: ["fr_ward", "em_spark"], next: "em_meteor", reveal: true });
    expect(sealClock(pool, 10 * 60_000)).toEqual({ sealed: pool, next: null, leftMs: 0, reveal: false });
    expect(sealClock([], 5_000)).toEqual({ sealed: [], next: null, leftMs: 0, reveal: false });
  });
  it("11/21 반려 글자: 패시브는 잃는 효과 수치, 액티브는 칸", () => {
    const bar = ["em_kindle", null, null, null, null, "em_bonfire"];
    const p = sealCard("em_hearth", 3, bar);
    expect(p).toMatchObject({ kind: "패시브", name: "화롯가 온기" });
    expect(p.lost).toMatch(/^마공 공격력 \+\d+% 효과가 사라져요$/);
    expect(sealCard("fr_collar", 3, bar).lost).toMatch(/^방어 \+\d+ · 최대 HP \+\d+% 효과가 사라져요$/);
    expect(sealCard("em_kindle", 2, bar)).toMatchObject({ kind: "액티브", lost: "1번 칸을 못 써요" });
    expect(sealCard("em_bonfire", 1, bar)).toMatchObject({ kind: "궁극기", lost: "궁극기(F)를 못 써요" });
    for (const s of SKILLS) expect(sealCard(s.id, 1, bar).lost.length).toBeGreaterThan(4);
  });
  it("칸 번호 · 패시브를 뺀 스킬 표", () => {
    expect(slotsOf(["em_meteor", null, "fr_ward", "em_kindle"], ["fr_ward", "em_meteor"])).toEqual([0, 2]);
    expect(liveSkills({ em_spark: 3, em_meteor: 5 }, new Set(["em_spark"]))).toEqual({ em_meteor: 5 });
  });
});

describe("숨을 곳", () => {
  it("여섯 개를 판 안에 깐다", () => {
    for (let seed = 1; seed < 30; seed++) {
      const cs = layCovers(seeded(seed));
      expect(cs).toHaveLength(6);
      for (const c of cs) {
        const r = coverRect(c);
        expect(r.x).toBeGreaterThan(ARENA.x0 + 20);
        expect(r.x + r.w).toBeLessThan(ARENA.x1 - 20);
        expect(r.y).toBeGreaterThan(ARENA.y0 + 20);
        expect(r.y + r.h).toBeLessThan(ARENA.y1 - 10);
        expect(c.hp).toBe(COVER_FP[c.kind][2]);
      }
    }
  });
  const wall: Cover = { kind: "partition", x: 400, y: 300, hp: 3, max: 3, hitT: 0, dead: false };
  it("레이저는 파티션에서 끊기고, 서류 산더미는 레이저를 못 막는다", () => {
    expect(segRect(300, 296, 500, 296, coverRect(wall))).toBe(true);
    expect(segRect(300, 250, 500, 250, coverRect(wall))).toBe(false);
    const L = rayLen([wall], 300, 296, 0, 900);
    expect(L).toBeGreaterThan(80);
    expect(L).toBeLessThan(84);
    expect(rayLen([{ ...wall, kind: "pile" }], 300, 296, 0, 900)).toBe(900);
    expect(rayLen([{ ...wall, dead: true }], 300, 296, 0, 900)).toBe(900);
  });
  it("걸어서 지나갈 수 없고, 판 밖으로도 못 나간다", () => {
    const p = { x: 400, y: 297 };
    pushOutCovers(p, [wall], 5);
    const r = coverRect(wall);
    expect(p.x <= r.x - 5 || p.x >= r.x + r.w + 5 || p.y <= r.y - 5 || p.y >= r.y + r.h + 5).toBe(true);
    expect(clampArena({ x: 0, y: 9999 })).toEqual({ x: ARENA.x0, y: ARENA.y1 });
  });
});

describe("전사 공지 메일 (11/22 벽에서 · 단계별 빠르기)", () => {
  it("단계별 빠르기 1.00 / 1.06 / 1.12 / 1.18 / 1.24 / 1.30배, 알아채는 틈 0.45초 → 크런치 0.30초 (그 밑으로는 안 내려감)", () => {
    expect([0, 1, 2, 3, 4, 5].map((ph) => +mailSpeedMul(ph).toFixed(2))).toEqual([1, 1.06, 1.12, 1.18, 1.24, 1.3]);
    expect([0, 1, 2, 3, 4, 5].map((ph) => mailVy(ph))).toEqual([0, 1, 2, 3, 4, 5].map((ph) => MAIL.v * mailSpeedMul(ph)));
    expect(mailSpeedMul(9)).toBeCloseTo(1.3);
    expect([0, 1, 2, 3, 4, 5].map((ph) => +mailReact(ph).toFixed(2))).toEqual([0.45, 0.42, 0.39, 0.36, 0.33, 0.3]);
    expect(mailReact(99)).toBeGreaterThanOrEqual(0.3);
  });
  it("파도는 늘 위·아래 벽 밖에서 나온다 (판 가운데에서 안 나온다)", () => {
    expect(mailEdgeY(true)).toBeLessThan(ARENA.y0);
    expect(mailEdgeY(false)).toBeGreaterThan(ARENA.y1);
    for (const py of [ARENA.y0 + 2, (ARENA.y0 + ARENA.y1) / 2, ARENA.y1 - 2])
      for (const down of [true, false])
        for (let ph = 0; ph <= 5; ph++) {
          const pl = mailPlan({ py, down, ph, threat: 1.5, sec: 0.9 });
          expect(pl.y === mailEdgeY(true) || pl.y === mailEdgeY(false)).toBe(true);
          expect(Math.sign(pl.vy)).toBe(down ? 1 : -1);
          expect(Math.abs(pl.vy)).toBeCloseTo(mailVy(ph));
          expect(pl.warn).toBeGreaterThanOrEqual(MAIL.minWarn);
        }
  });
  it("항상 닿을 수 있다: 예고 순간(틈이 정해지는 때) 내 자리에서 틈까지 최대 달리기 + 알아채는 틈이 파도보다 먼저 (단계·세기·자리·빠르기 전부)", () => {
    const r = seeded(11);
    for (let ph = 0; ph <= 5; ph++)
      for (const threat of [1, 1.6, 2.5, 6])
        for (const vmax of [120, 146, 162, 200])
          for (let i = 0; i < 40; i++) {
            const py = ARENA.y0 + r() * (ARENA.y1 - ARENA.y0);
            const px = ARENA.x0 + r() * (ARENA.x1 - ARENA.x0);
            const sec = MAIL.run[0] + r() * (MAIL.run[1] - MAIL.run[0]);
            const pl = mailPlan({ py, down: r() < 0.5, ph, threat, sec });
            // 예고 시작부터 내 줄까지 (틈은 예고 시작에 정해진다)
            const rem = pl.arrive;
            expect(rem).toBeGreaterThanOrEqual(mailOpenLead(sec, ph, threat) - 1e-9);
            expect(pl.warn).toBeGreaterThanOrEqual(MAIL.minWarn);
            const reach = mailWaveReach(rem, vmax, ph, threat);
            expect(reach).toBeLessThanOrEqual(MAIL.far);
            const gx = mailGapX(r, px, reach);
            expect(gx).toBeGreaterThanOrEqual(ARENA.x0 + 30 - 1e-9);
            expect(gx + MAIL.gw).toBeLessThanOrEqual(ARENA.x1 - 30 + 1e-9);
            const d = gapDist(px, gx, MAIL.gw);
            // 여유(8~12%)를 빼고도 닿는다 + 알아채는 틈은 0.3초 이상
            expect((d / vmax) * mailMargin(threat) + mailReact(ph)).toBeLessThanOrEqual(rem + 1e-6);
            expect(mailReact(ph)).toBeGreaterThanOrEqual(0.3);
          }
  });
  it("겨우 닿는다: 벽에 붙어 시간이 빠듯하면 틈은 달려서 0.3~0.5초 거리 (폰 화면 반 폭 안), 걸어서는 못 닿는다", () => {
    const vmax = 78 * 1.8;
    for (let ph = 0; ph <= 5; ph++) {
      // 나오는 벽 바로 앞 → 예고를 늘려 예고 시작부터 내 줄까지 딱 mailOpenLead
      const pl = mailPlan({ py: ARENA.y0 + 2, down: true, ph, threat: 1, sec: MAIL.run[1] });
      expect(pl.arrive).toBeCloseTo(mailOpenLead(MAIL.run[1], ph, 1));
      const reach = mailWaveReach(pl.arrive, vmax, ph, 1);
      expect(reach).toBeCloseTo(vmax * MAIL.run[1]);
      expect(reach).toBeLessThanOrEqual(80);
      const px = ACX;
      const d = gapDist(px, mailGapX(() => 0.2, px, reach), MAIL.gw);
      expect(d).toBeCloseTo(reach, 5);
      // 걷기(달리기 1.8배 아님)로는 닿지 않는다
      expect(d / (vmax / 1.8) + mailReact(ph)).toBeGreaterThan(pl.arrive);
    }
  });
  it("벽 예고는 0.7초 이상, 벽이 가까워 빨리 닿으면 예고를 늘린다", () => {
    const pl = mailPlan({ py: ARENA.y0 + 4, down: true, ph: 5, threat: 6, sec: 1.1 });
    expect(pl.warn).toBeGreaterThan(MAIL.minWarn);
    expect(pl.arrive).toBeCloseTo(mailOpenLead(1.1, 5, 6));
    expect(mailPlan({ py: ARENA.y1 - 4, down: true, ph: 0, threat: 1, sec: 0.3 }).warn).toBeCloseTo(MAIL.minWarn);
  });
  describe("11/22 파도 하나하나가 따로 (MailSeq)", () => {
    // 돌아다니는 나를 흉내 내며 끝까지 흘린다
    const run = (seed: number, total: number, ph: number) => {
      const r = seeded(seed);
      const q = new MailSeq(total, r() < 0.5, r);
      const me = { x: ACX, y: (ARENA.y0 + ARENA.y1) / 2, vmax: 140, ph, threat: 1 + ph * 0.4 };
      const frames: { k: number; t: number; y: number; gaps: number[]; warn: number; vy: number; y0: number }[] = [];
      for (let i = 0; i < 4000 && !q.done; i++) {
        me.x = Math.max(ARENA.x0, Math.min(ARENA.x1, me.x + (r() - 0.5) * 12));
        me.y = Math.max(ARENA.y0, Math.min(ARENA.y1, me.y + (r() - 0.5) * 8));
        q.step(1 / 60, me);
        const w = q.cur;
        if (w) frames.push({ k: w.k, t: w.t, y: w.y, gaps: [...w.gaps], warn: w.warn, vy: w.vy, y0: w.y0 });
      }
      return { q, frames };
    };
    it("틈 자리는 그 파도 내내 그대로 (예고부터 다 빠질 때까지)", () => {
      for (let seed = 1; seed <= 30; seed++) {
        const { q, frames } = run(seed, 3, seed % 6);
        expect(q.done).toBe(true);
        for (let k = 0; k < 3; k++) {
          const fs = frames.filter((f) => f.k === k);
          expect(fs.length).toBeGreaterThan(10);
          for (const f of fs) expect(f.gaps).toEqual(fs[0].gaps);
        }
      }
    });
    it("다음 파도는 앞 파도가 맞은편 벽 밖으로 다 빠지고 0.35초 넘게 지난 뒤에야 예고를 시작한다 (한 번에 한 줄)", () => {
      for (let seed = 1; seed <= 30; seed++) {
        const { q } = run(seed, 3, seed % 6);
        expect(q.log).toHaveLength(3);
        for (let k = 1; k < 3; k++) expect(q.log[k].start - q.log[k - 1].end).toBeGreaterThanOrEqual(0.35);
      }
    });
    it("다 빠졌다 = 맞은편 벽 밖까지 갔다 · 위·아래 벽을 번갈아 나온다", () => {
      const { frames } = run(5, 3, 2);
      for (let k = 0; k < 3; k++) {
        const fs = frames.filter((f) => f.k === k);
        const last = fs[fs.length - 1];
        if (last.vy > 0) expect(last.y).toBeGreaterThan(ARENA.y1 + MAIL.edge);
        else expect(last.y).toBeLessThan(ARENA.y0 - MAIL.edge);
      }
      const dirs = [0, 1, 2].map((k) => Math.sign(frames.find((f) => f.k === k)!.vy));
      expect(dirs[0]).toBe(-dirs[1]);
      expect(dirs[1]).toBe(-dirs[2]);
    });
    it("파도마다 예고가 먼저: 예고 동안(0.7초 이상)은 벽 줄에 가만히 있다가 출발", () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { q, frames } = run(seed, 3, seed % 6);
        for (let k = 0; k < 3; k++) {
          const fs = frames.filter((f) => f.k === k);
          expect(fs[0].t).toBeLessThan(0.05);
          expect(fs[0].warn).toBeGreaterThanOrEqual(MAIL.minWarn);
          for (const f of fs) if (f.t < f.warn) expect(f.y).toBe(f.y0);
          expect(fs.some((f) => f.t > f.warn && f.y !== f.y0)).toBe(true);
          expect(q.log[k].move - q.log[k].start).toBeGreaterThanOrEqual(MAIL.minWarn - 1e-9);
        }
      }
    });
    it("쓰러지면 새 파도는 안 나온다", () => {
      const r = seeded(3);
      const q = new MailSeq(3, false, r);
      const me = { x: ACX, y: 250, vmax: 140, ph: 0, threat: 1 };
      for (let i = 0; i < 2000; i++) q.step(1 / 60, me, true);
      expect(q.log).toHaveLength(0);
    });
  });
  it("11/21 파도 수: 1~3단계 둘 · 4단계부터 셋", () => {
    expect([0, 1, 2, 3, 4, 5].map(mailWaves)).toEqual([2, 2, 2, 3, 3, 3]);
  });
  it("세기가 올라도 여유는 8% 밑으로 안 내려간다", () => {
    expect(mailMargin(1)).toBeCloseTo(1.12);
    expect(mailMargin(99)).toBeCloseTo(1.08);
    expect(speedOf(99)).toBe(1.6);
  });
});

describe("11/22 프로젝트가 터졌다 — 폴더 늘리기 + 연쇄", () => {
  it("폴더 수 3 / 4 / 4 / 5 / 5 / 크런치 6", () => {
    expect([0, 1, 2, 3, 4, 5].map(boomCount)).toEqual([3, 4, 4, 5, 5, 6]);
  });
  // 판 위 격자에서 원에 안 덮인 칸 (몸 여유 pad)
  const free = (fs: ReturnType<typeof boomLayout>["folders"], pad: number) => {
    const out: { x: number; y: number }[] = [];
    for (let x = ARENA.x0 + 8; x <= ARENA.x1 - 8; x += 6)
      for (let y = ARENA.y0 + 8; y <= ARENA.y1 - 8; y += 6) {
        const p = { x, y };
        if (!fs.some((f) => inBoom(p, f, pad) || f.chain.some((c) => inBoom(p, c, pad)))) out.push(p);
      }
    return out;
  };
  it("안전한 빈 칸이 늘 하나 이상 (정해 둔 빈 칸은 어떤 원에도 안 덮인다) · 판 전체를 덮지 않는다", () => {
    const r = seeded(77);
    for (let ph = 0; ph <= 5; ph++)
      for (let i = 0; i < 200; i++) {
        const px = ARENA.x0 + r() * AW;
        const py = ARENA.y0 + r() * AH;
        const lay = boomLayout(r, { ph, px, py, first: { x: px + (r() - 0.5) * 60, y: py + (r() - 0.5) * 30 } });
        for (const f of lay.folders) {
          expect(inBoom(lay.safe, f, BOOM.safeR)).toBe(false);
          for (const c of f.chain) expect(inBoom(lay.safe, c, BOOM.safeR)).toBe(false);
        }
        expect(lay.safe.x).toBeGreaterThanOrEqual(ARENA.x0);
        expect(lay.safe.x).toBeLessThanOrEqual(ARENA.x1);
        expect(lay.safe.y).toBeGreaterThanOrEqual(ARENA.y0);
        expect(lay.safe.y).toBeLessThanOrEqual(ARENA.y1);
        expect(free(lay.folders, 6).length).toBeGreaterThan(0);
      }
  });
  it("폴더는 거의 늘 단계 수만큼, 서로 너무 겹치지 않고 · 연쇄는 2~3개, 작고, 0.15~0.3초 뒤", () => {
    const r = seeded(5);
    let short = 0;
    for (let ph = 0; ph <= 5; ph++)
      for (let i = 0; i < 200; i++) {
        const px = ARENA.x0 + r() * AW;
        const py = ARENA.y0 + r() * AH;
        const lay = boomLayout(r, { ph, px, py, first: { x: px, y: py } });
        if (lay.folders.length < boomCount(ph)) short++;
        expect(lay.folders.length).toBeGreaterThanOrEqual(boomCount(ph) - 1);
        for (let a = 0; a < lay.folders.length; a++)
          for (let b = a + 1; b < lay.folders.length; b++) {
            const A = lay.folders[a];
            const B = lay.folders[b];
            // 중심끼리 반지름만큼은 떨어진다 (원 반 넘게 겹치지 않는다)
            expect(Math.hypot((A.x - B.x) / A.r, (A.y - B.y) / (A.r * 0.6))).toBeGreaterThanOrEqual(1 - 1e-9);
          }
        for (const f of lay.folders) {
          expect(f.chain.length).toBeLessThanOrEqual(3);
          for (const c of f.chain) {
            expect(c.r).toBeLessThan(f.r / 2);
            expect(c.dt).toBeGreaterThanOrEqual(0.15);
            expect(c.dt).toBeLessThanOrEqual(0.3);
          }
        }
      }
    expect(short / 1200).toBeLessThan(0.03);
  });
  it("판을 반 넘게 덮지 않는다 (평균)", () => {
    const r = seeded(9);
    let cov = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const px = ARENA.x0 + r() * AW;
      const py = ARENA.y0 + r() * AH;
      const lay = boomLayout(r, { ph: 5, px, py, first: { x: px, y: py } });
      let all = 0;
      for (let x = ARENA.x0 + 8; x <= ARENA.x1 - 8; x += 6) for (let y = ARENA.y0 + 8; y <= ARENA.y1 - 8; y += 6) all++;
      cov += 1 - free(lay.folders, 0).length / all;
    }
    expect(cov / N).toBeLessThan(0.6);
  });
});

describe("11/22 판 엎자! 예고 줄이기", () => {
  it("예전 3.0초에서 40% 줄인 1.8초 (크런치 1.62초), 단 판 절반을 최대 달리기로 건너는 시간 + 0.35초 밑으로는 안 내려간다", () => {
    const need = (axis: "x" | "y") => ((axis === "x" ? AW : AH) / 2) / FLIP.vmax + 0.35;
    for (const ph of [3, 4, 5])
      for (const axis of ["x", "y"] as const) {
        const w = flipWarn(ph, axis);
        expect(w).toBeGreaterThanOrEqual(need(axis));
        expect(w).toBeLessThan(3.0 * 0.75);
      }
    expect(flipWarn(4, "y")).toBeCloseTo(1.8);
    expect(flipWarn(5, "y")).toBeCloseTo(1.62);
    // 좌우로 나뉘면 판이 넓어 바닥 시간(약 2.07초)이 걸린다
    expect(flipWarn(3, "x")).toBeCloseTo((AW / 2 + FLIP.body) / FLIP.vmax + FLIP.react);
    expect(flipWarn(5, "x")).toBeLessThanOrEqual(flipWarn(3, "x"));
  });
});

describe("11/22 야근은 집합의 힘이다 — 덩어리마다 따로", () => {
  it("둘째 덩어리는 첫째가 굴러가기 시작할 때 다른 자리에서 처음부터 모인다", () => {
    for (const spd of [1, 1.3, 1.6]) {
      const [a, b] = gatherPlan(2, spd, 1);
      expect(b.at).toBeCloseTo(a.at + GATHER.gather + GATHER.lift / spd);
      expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(60);
    }
  });
  it("두 덩어리의 단계는 서로 독립 (하나가 사라져도 다른 하나는 모이기부터 끝까지 간다)", () => {
    const spd = 1.3;
    const plan = gatherPlan(2, spd, -1);
    const balls: ReturnType<typeof gatherBall>[] = [];
    const seen: Record<number, string[]> = { 0: [], 1: [] };
    let t = 0;
    let goneAt0 = -1;
    for (let i = 0; i < 60 * 12; i++) {
      t += 1 / 60;
      for (const [k, g] of plan.entries()) if (t >= g.at && !balls.some((b) => b.k === k) && !seen[k].length) balls.push(gatherBall(k, g.cx, g.cy, spd));
      for (const b of balls) {
        if (!seen[b.k].length) seen[b.k].push(b.ph);
        const ch = stepGather(b, 1 / 60);
        if (ch) seen[b.k].push(ch);
      }
      // 사라진 덩어리만 치운다
      for (let j = balls.length - 1; j >= 0; j--) if (balls[j].ph === "gone") {
        if (balls[j].k === 0) goneAt0 = t;
        balls.splice(j, 1);
      }
      if (goneAt0 > 0 && t - goneAt0 < 0.05) expect(balls.some((b) => b.k === 1)).toBe(true);
    }
    expect(seen[0]).toEqual(["gather", "lift", "roll", "gone"]);
    expect(seen[1]).toEqual(["gather", "lift", "roll", "gone"]);
    expect(goneAt0).toBeGreaterThan(0);
  });
});

describe("11/22 즉사 일정 — 권고사직은 5단계에서 한 번", () => {
  it("5단계(서버 오픈): 18~28초 권고사직 · 42~47초 판 엎기 (드랍 없음)", () => {
    for (let sd = 1; sd <= 200; sd++) {
      const ks = phaseKills(seeded(sd), 4);
      expect(ks.map((k) => k.kind)).toEqual(["quit", "flip"]);
      expect(ks[0].at).toBeGreaterThanOrEqual(18);
      expect(ks[0].at).toBeLessThanOrEqual(28);
      expect(ks[1].at).toBeGreaterThanOrEqual(42);
      expect(ks[1].at).toBeLessThanOrEqual(47);
    }
  });
  it("3단계 드랍 · 4단계 엎기 · 크런치는 권고사직 먼저 그대로", () => {
    expect(phaseKills(seeded(3), 2).map((k) => k.kind)).toEqual(["drop"]);
    expect(phaseKills(seeded(3), 3).map((k) => k.kind)).toEqual(["flip"]);
    for (let sd = 1; sd <= 50; sd++) expect(phaseKills(seeded(sd), 5)[0].kind).toBe("quit");
  });
});

describe("11/22 프로젝트 드랍 — 빨라진 예고와 바닥", () => {
  it("예고는 판 어디서든 가까운 자리까지 최대 달리기 + 반응 0.35초 밑으로 안 내려간다", () => {
    for (let sd = 1; sd <= 300; sd++) {
      const rnd = seeded(sd);
      const covers = layCovers(rnd);
      const seats = dropSeats(rnd, covers);
      for (const ph of [2, 4, 5]) {
        const w = dropWarn(ph, seats);
        expect(w).toBeGreaterThanOrEqual(dropFloor(seats) - 1e-9);
        // 가장 먼 점에서 곧장 달려도 (돌아가는 몫 빼고) 반응 시간을 남기고 닿는다
        expect(dropReach(seats) / DROP.vmax + DROP.react).toBeLessThanOrEqual(w + 1e-9);
        // 예전 3.6초보다 빠르다
        expect(w).toBeLessThan(3.0);
      }
    }
  });
  it("판 구석구석 어느 점이든 예고 안에 자리 상자에 닿는다 (4px 격자 · 최대 달리기)", () => {
    for (let sd = 1; sd <= 60; sd++) {
      const seats = dropSeats(seeded(sd), layCovers(seeded(sd + 999)));
      const w = dropWarn(3, seats);
      for (let x = ARENA.x0; x <= ARENA.x1; x += 8)
        for (let y = ARENA.y0; y <= ARENA.y1; y += 8) expect(dropDist({ x, y }, seats) / DROP.vmax + DROP.react).toBeLessThanOrEqual(w);
    }
  });
  it("자리 상자 안이면 산다 · 닿는 상자는 판정 상자 안쪽", () => {
    const seats = [{ x: 140, y: 200 }, { x: 500, y: 300 }];
    expect(dropSafe({ x: 140 + DROP.hx, y: 200 + DROP.hy }, seats)).toBe(true);
    expect(dropSafe({ x: 140 + 19, y: 200 }, seats)).toBe(false);
    expect(dropDist({ x: 140 + DROP.hx, y: 200 }, seats)).toBe(0);
  });
  it("자리는 왼쪽·오른쪽 끝 쪽에 하나씩, 구조물 위가 아니다", () => {
    for (let sd = 1; sd <= 200; sd++) {
      const covers = layCovers(seeded(sd));
      const [a, b] = dropSeats(seeded(sd * 7), covers);
      expect(a.x).toBeLessThan(ACX);
      expect(b.x).toBeGreaterThan(ACX);
      for (const s of [a, b]) {
        expect(s.y).toBeGreaterThanOrEqual(ARENA.y0 + 40);
        expect(s.y).toBeLessThanOrEqual(ARENA.y1 - 40);
      }
    }
  });
  it("폭발은 회장님 x에서 양옆으로 sweep초 안에 판 끝까지 휩쓴다", () => {
    expect(dropSweepAt(300, 300)).toBe(0);
    expect(dropSweepAt(ARENA.x0, ARENA.x0)).toBe(0);
    expect(dropSweepAt(ARENA.x1, ARENA.x0)).toBeCloseTo(DROP.sweep);
    expect(dropSweepAt(ARENA.x0, ACX)).toBeCloseTo(DROP.sweep);
    expect(dropSweepAt(ACX + 50, ACX)).toBeLessThan(dropSweepAt(ACX + 150, ACX));
  });
});

describe("11/22 야근은 집합의 힘이다 — 단계별 덩어리 수", () => {
  it("1~3단계 하나 · 4~5단계 둘 · 크런치 셋", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(gatherCount)).toEqual([1, 1, 2, 2, 2, 3, 3]);
  });
  it("크런치 셋: 앞 덩어리가 굴러갈 때 다음이 모이고, 셋 다 기술 길이(5.6초) 안에 시작 · 자리가 서로 떨어져 있다", () => {
    for (const spd of [1, 1.3, 1.76]) {
      const plan = gatherPlan(gatherCount(5), spd, 1);
      expect(plan).toHaveLength(3);
      for (let k = 1; k < 3; k++) expect(plan[k].at).toBeCloseTo(plan[k - 1].at + GATHER.gather + GATHER.lift / spd);
      expect(plan[2].at).toBeLessThan(5.6);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(plan[i].cx - plan[j].cx, plan[i].cy - plan[j].cy)).toBeGreaterThan(60);
    }
  });
});

describe("11/22 탕비실 믹스커피", () => {
  it("1~5단계마다 한 잔 · 20~40초 · 크런치는 없다 · 같은 seed면 같은 때", () => {
    for (let sd = 1; sd <= 100; sd++)
      for (let ph = 0; ph < 5; ph++) {
        const at = coffeeAt(seeded(sd * 10 + ph), ph)!;
        expect(at).toBeGreaterThanOrEqual(COFFEE.from);
        expect(at).toBeLessThanOrEqual(COFFEE.to);
        expect(coffeeAt(seeded(sd * 10 + ph), ph)).toBe(at);
      }
    for (let ph = 5; ph < 12; ph++) expect(coffeeAt(seeded(1), ph)).toBeNull();
  });
  it("단계당 하나: 한 번 놓으면 다시 안 놓는다 · 즉사 예고 중이면 미뤘다가 끝나면 놓는다", () => {
    const at = 25;
    expect(coffeeReady(at, 24.9, false, false)).toBe(false);
    expect(coffeeReady(at, 25, false, false)).toBe(true);
    expect(coffeeReady(at, 30, true, false)).toBe(false);
    expect(coffeeReady(at, 26, false, true)).toBe(false);
    expect(coffeeReady(at, 31, false, false)).toBe(true);
    expect(coffeeReady(null, 50, false, false)).toBe(false);
    // 한 단계(60초)를 흘려 보면 딱 한 번 (중간 24~30초는 즉사 예고)
    let placed = false;
    let n = 0;
    let first = -1;
    for (let t = 0; t < 60; t += 1 / 60) {
      if (coffeeReady(at, t, placed, t > 24 && t < 30)) {
        placed = true;
        n++;
        first = t;
      }
    }
    expect(n).toBe(1);
    expect(first).toBeGreaterThanOrEqual(30);
  });
  it("회복량은 최대 체력의 20% 고정 (회복 감소 50%를 받지 않는다)", () => {
    expect(coffeeHeal(10_000)).toBe(2000);
    expect(coffeeHeal(6000)).toBe(1200);
    expect(coffeeHeal(10_000)).toBe(Math.round(10_000 * COFFEE.heal));
    expect(coffeeHeal(10_000)).not.toBe(Math.round(10_000 * COFFEE.heal * CHAIR_HEAL_MUL));
  });
  it("자리: 나에게서 120px 넘게 · 판 안 · 구조물 위·예고 칸이 아니다", () => {
    for (let sd = 1; sd <= 200; sd++) {
      const covers = layCovers(seeded(sd));
      const me = { x: ARENA.x0 + ((sd * 37) % AW), y: ARENA.y0 + ((sd * 53) % AH) };
      const bad = (p: { x: number; y: number }) => p.x < ACX;
      const p = coffeeSpot(seeded(sd + 5), me, covers, bad);
      if (!p) continue;
      expect(Math.hypot(p.x - me.x, p.y - me.y)).toBeGreaterThan(COFFEE.far);
      expect(p.x).toBeGreaterThanOrEqual(ACX);
      expect(p.y).toBeGreaterThanOrEqual(ARENA.y0);
      expect(p.y).toBeLessThanOrEqual(ARENA.y1);
      for (const c of covers) {
        const r = coverRect(c);
        expect(p.x > r.x - 1 && p.x < r.x + r.w + 1 && p.y > r.y - 1 && p.y < r.y + r.h + 1).toBe(false);
      }
    }
    // 온 바닥이 예고면 못 놓는다 (다음 프레임에 다시)
    expect(coffeeSpot(seeded(1), { x: 0, y: 0 }, [], () => true)).toBeNull();
  });
});

describe("기술 목록", () => {
  it("열여덟 개", () => expect(ALL_PATS).toHaveLength(18));
});

describe("chairQuit (11/22 브리핑 중 그만두기)", () => {
  it("브리핑(시작 전)이면 기록 없이 바로 닫는다", () => {
    expect(chairQuit({ started: false, done: false, died: false })).toBe("close");
  });
  it("싸우는 중이면 쓰러진 것으로, 쓰러진 뒤면 연출을 기다린다", () => {
    expect(chairQuit({ started: true, done: false, died: false })).toBe("giveUp");
    expect(chairQuit({ started: true, done: false, died: true })).toBe("wait");
  });
  it("결과가 난 판은 닫는다", () => {
    expect(chairQuit({ started: true, done: true, died: true })).toBe("close");
  });
});
