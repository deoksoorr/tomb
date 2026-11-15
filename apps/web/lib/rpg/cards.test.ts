import { describe, expect, it } from "vitest";
import type { MonsterId } from "./catalog";
import {
  CARD_IDS,
  CARD_POWER_MAX,
  CARDS,
  cardOffer,
  cardPower,
  cardStats,
  cardStyleKind,
  cardStackLine,
  cardText,
  isBossDealFloor,
  BOSS_ODDS,
  RARITIES,
  statPanel,
  TIER_ODDS,
  tierOdds,
  replayPicks,
  rerollsAllowed,
  runLevel,
  runXp,
  runXpOf,
  startPicks,
  type CardCounts,
  type CardId,
  type CardPick,
  type OfferKind,
} from "./cards";
import { huntSpawnable } from "./plan";
import { killRateCeiling } from "./rewards";
import { RunResultSchema } from "./schemas";
import { evalTower, towerPlan } from "./tower";
import type { HuntResult } from "./types";

// 11/15 야근 빌딩 능력 카드 (lib/rpg/cards): 제안 굴림이 시드로 정해지는지, 서버가 고른 기록을 다시 굴려 확인하는지,
// 겹침 한도·전설 확률·상사의 제안·체크포인트 시작 카드·판 레벨 속도·처치 속도 상한 배율

const LIM = { levels: 99, starts: 0, bossFloors: [] as number[], rerolls: 99 };

/** 제안마다 첫 카드를 고르는 정직한 기록 (다시 뽑기 r번) */
function honest(seed: number, plan: { k: OfferKind; i: number; r?: number; f?: number }[], start = 1): CardPick[] {
  const owned: CardCounts = {};
  return plan.map(({ k, i, r = 0, f }) => {
    const c = cardOffer(seed, k, i, r, owned, f ?? start)[0];
    owned[c] = (owned[c] ?? 0) + 1;
    return { k, i, r, c, ...(f !== undefined ? { f } : {}) };
  });
}

function climb(seed: number, start: number, floors: number): HuntResult {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++) for (const w of towerPlan(seed, start + i, start)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return { game: "hunt", durationMs: floors * 45_000 + 5_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: floors * 45_000 };
}

describe("카드 표", () => {
  it("40장, 일반 10 · 매직 10 · 레어 9 · 유니크 6 · 전설 5, 겹침 한도", () => {
    expect(CARD_IDS.length).toBe(40);
    const by = (r: string) => CARD_IDS.filter((id) => CARDS[id].rarity === r).length;
    expect(RARITIES.map(by)).toEqual([10, 10, 9, 6, 5]);
    expect(CARD_IDS.filter((id) => CARDS[id].rarity === "legend").sort()).toEqual(["corpcard", "leave", "oneshot", "overtime", "promote"]);
    expect(CARDS.cc.max).toBe(3);
    expect(CARDS.raise.max).toBe(5);
    expect(CARDS.coffee.max).toBe(Infinity);
  });

  it("무기마다 설명이 갈린다 (근접·원거리·마법), 콜론 꼬리표 없이", () => {
    expect(cardStyleKind("shot")).toBe("ranged");
    expect(cardStyleKind("card")).toBe("ranged");
    expect(cardStyleKind("magic")).toBe("magic");
    expect(cardStyleKind("smash")).toBe("melee");
    expect(cardText("cc", "melee")).not.toBe(cardText("cc", "ranged"));
    for (const id of CARD_IDS) for (const k of ["melee", "ranged", "magic"] as const) expect(cardText(id, k)).not.toMatch(/[:：]/);
  });

  it("카드 수치: 참조 추가는 한 번 피해 −10%씩, 방향 카드는 겹칠수록 방향이 는다", () => {
    const s = cardStats({ cc: 3, circular: 2, side: 1, backbite: 1, raise: 2, health: 1, boards: 1 });
    expect(s.extra).toBe(3);
    expect(s.hitMul).toBeCloseTo(0.7);
    expect(s.dirs.length).toBe(4 + 2 + 1);
    expect(s.atkMul).toBeCloseTo(1.3);
    expect(s.hpMul).toBeCloseTo(1.15);
    expect(s.boards).toBe(2);
    // 한도를 넘는 수는 한도까지만
    expect(cardStats({ raise: 9 }).atkMul).toBeCloseTo(1.75);
  });
});

describe("제안 굴림", () => {
  it("같은 시드·번호·다시 뽑기 횟수면 늘 같은 세 장 (서로 다르게)", () => {
    for (let i = 0; i < 30; i++) {
      const a = cardOffer(777, "l", i, 0, {});
      expect(cardOffer(777, "l", i, 0, {})).toEqual(a);
      expect(new Set(a).size).toBe(3);
    }
    expect(cardOffer(777, "l", 0, 0, {})).not.toEqual(cardOffer(778, "l", 0, 0, {}));
    // 다시 뽑으면 (대개) 다른 제안
    let diff = 0;
    for (let i = 0; i < 40; i++) if (cardOffer(5, "l", i, 1, {}).join() !== cardOffer(5, "l", i, 0, {}).join()) diff++;
    expect(diff).toBeGreaterThan(35);
  });

  it("다 쌓인 카드는 안 나온다", () => {
    const owned: CardCounts = {};
    for (const id of CARD_IDS) if (id !== "coffee" && id !== "raise") owned[id] = CARDS[id].max;
    for (let i = 0; i < 50; i++) for (const c of cardOffer(9, "l", i, 0, owned)) expect(["coffee", "raise"]).toContain(c);
    expect(cardOffer(9, "l", 0, 0, owned).length).toBe(2);
  });

  it("등급 확률: 1층은 일반 50 · 매직 28 · 레어 15 · 유니크 6 · 전설 1, 높이 오를수록·다시 뽑을수록 좋아진다, 상사의 제안은 레어 이상", () => {
    const N = 6000;
    const count = (k: "l" | "b", f: number, r: number) => {
      const c: Record<string, number> = {};
      for (let i = 0; i < N; i++) for (const id of cardOffer(i * 7919 + 13, k, k === "b" ? 10 * (1 + (i % 9)) : i % 41, r, {}, f)) c[CARDS[id].rarity] = (c[CARDS[id].rarity] ?? 0) + 1;
      return c;
    };
    const lo = count("l", 1, 0);
    // 같은 등급이 한 제안에 두 장 나오면 겹치지 않게 다른 카드를 고를 뿐 등급은 그대로 → 장 단위 비율이 표와 맞다
    for (const r of RARITIES) expect(Math.abs((lo[r] ?? 0) / (3 * N) - TIER_ODDS[r])).toBeLessThan(0.012);
    const hi = count("l", 51, 0);
    expect((hi.legend ?? 0) / (3 * N)).toBeGreaterThan((lo.legend ?? 0) / (3 * N) + 0.012);
    expect((hi.unique ?? 0) / (3 * N)).toBeGreaterThan((lo.unique ?? 0) / (3 * N) + 0.03);
    expect(tierOdds("l", 500, 0).legend).toBeCloseTo(0.05);
    expect(tierOdds("l", 500, 0).unique).toBeCloseTo(0.14);
    expect(tierOdds("l", 1, 1).legend).toBeGreaterThan(tierOdds("l", 1, 0).legend);
    for (const f of [1, 51, 999]) expect(Object.values(tierOdds("l", f, 1)).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const b = count("b", 1, 0);
    expect((b.common ?? 0) + (b.magic ?? 0)).toBe(0);
    expect(Math.abs((b.legend ?? 0) / N - BOSS_ODDS.legend)).toBeLessThan(0.02);
    // 전설은 한 장씩만 → 다 가지면 상사의 제안은 유니크·레어
    const allLegend = { oneshot: 1, overtime: 1, promote: 1, corpcard: 1, leave: 1 };
    for (let i = 0; i < 300; i++) expect(cardOffer(i, "b", 10, 0, allLegend).some((c) => CARDS[c].rarity === "legend")).toBe(false);
  });
});

describe("판 레벨·다시 뽑기·체크포인트·상사의 제안", () => {
  it("처치 경험치: 우두머리 > 정예 > 보통 > 졸개", () => {
    expect(runXpOf("prod_dragon")).toBe(20);
    expect(runXpOf("conflict_shard")).toBe(1);
    expect(runXpOf("scope_creep")).toBe(2);
    expect(runXp({ scope_creep: 3, conflict_shard: 2 })).toBe(8);
  });

  it("1층부터 15층쯤 오르면 판 레벨이 10~14번 오른다", () => {
    for (const seed of [1, 42, 1234, 99_999]) {
      const kills: Partial<Record<MonsterId, number>> = {};
      for (let f = 1; f <= 15; f++) for (const w of towerPlan(seed, f, 1)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      const lv = runLevel(runXp(kills)).level;
      expect(lv).toBeGreaterThanOrEqual(10);
      expect(lv).toBeLessThanOrEqual(14);
    }
    expect(runLevel(0)).toEqual({ level: 0, into: 0, need: 20 });
    expect(runLevel(20 + 27 + 5)).toEqual({ level: 2, into: 5, need: 34 });
  });

  it("다시 뽑기는 판마다 1번 + 깬 10층마다 1번, 시작 카드는 건너뛴 10층마다 3장", () => {
    expect(rerollsAllowed(0)).toBe(1);
    expect(rerollsAllowed(9)).toBe(1);
    expect(rerollsAllowed(10)).toBe(2);
    expect(rerollsAllowed(25)).toBe(3);
    expect(startPicks(1)).toBe(0);
    expect(startPicks(11)).toBe(3);
    expect(startPicks(21)).toBe(6);
    expect(startPicks(101)).toBe(30);
    expect(isBossDealFloor(10)).toBe(true);
    expect(isBossDealFloor(15)).toBe(false);
  });
});

describe("서버 검사 (replayPicks)", () => {
  it("정직한 기록은 통과하고 가진 카드를 돌려준다", () => {
    const picks = honest(31, [{ k: "s", i: 0 }, { k: "s", i: 1 }, { k: "s", i: 2 }, { k: "l", i: 0 }, { k: "l", i: 1, r: 1 }, { k: "b", i: 20 }, { k: "l", i: 2 }]);
    const v = replayPicks(31, picks, { levels: 3, starts: 3, bossFloors: [20], rerolls: 1 });
    expect(v.ok).toBe(true);
    if (v.ok) expect(Object.values(v.owned).reduce((a, b) => a + (b ?? 0), 0)).toBe(7);
  });

  it("제안에 없던 카드·순서가 틀린 번호·한도를 넘는 레벨/시작 카드/다시 뽑기·상사의 제안 층은 거절", () => {
    const base = honest(8, [{ k: "l", i: 0 }, { k: "l", i: 1 }]);
    const off = cardOffer(8, "l", 0, 0, {});
    const notOffered = CARD_IDS.find((id) => !off.includes(id) && CARDS[id].rarity !== "legend") as CardId;
    expect(replayPicks(8, [{ ...base[0], c: notOffered }], LIM)).toMatchObject({ ok: false, why: "offer" });
    expect(replayPicks(8, [base[1]], LIM)).toMatchObject({ ok: false, why: "level" });
    expect(replayPicks(8, base, { ...LIM, levels: 1 })).toMatchObject({ ok: false, why: "level" });
    expect(replayPicks(8, honest(8, [{ k: "s", i: 0 }]), LIM)).toMatchObject({ ok: false, why: "start" });
    expect(replayPicks(8, honest(8, [{ k: "l", i: 0 }, { k: "s", i: 0 }]), { ...LIM, starts: 3 })).toMatchObject({ ok: false, why: "start" });
    expect(replayPicks(8, honest(8, [{ k: "l", i: 0, r: 2 }]), { ...LIM, rerolls: 1 })).toMatchObject({ ok: false, why: "reroll" });
    expect(replayPicks(8, honest(8, [{ k: "b", i: 10 }]), LIM)).toMatchObject({ ok: false, why: "boss" });
    expect(replayPicks(8, honest(8, [{ k: "b", i: 10 }, { k: "b", i: 10 }]), { ...LIM, bossFloors: [10] })).toMatchObject({ ok: false, why: "boss" });
    // 겹침 한도: 같은 카드를 한도보다 많이 고를 수 없다 (그때 제안에 안 나온다)
    const many: CardPick[] = Array.from({ length: 6 }, (_, i) => ({ k: "l" as const, i, r: 0, c: "direct" as CardId }));
    expect(replayPicks(8, many, LIM).ok).toBe(false);
  });

  it("결과 형식 검사 (zod): 카드 기록이 실린다", () => {
    const r = { ...climb(3, 1, 1), cards: honest(3, [{ k: "l", i: 0 }]) };
    expect(RunResultSchema.safeParse(r).success).toBe(true);
    expect(RunResultSchema.safeParse({ ...r, cards: [{ k: "x", i: 0, r: 0, c: "cc" }] }).success).toBe(false);
    expect(RunResultSchema.safeParse({ ...r, cards: [{ k: "l", i: 0, r: 0, c: "nope" }] }).success).toBe(false);
  });
});

describe("야근 빌딩 결과 검증에 카드", () => {
  const t = { seed: 4321, level: 50, start: 1 };

  it("정직하게 고른 판은 통과, 제안에 없던 카드를 실으면 거절", () => {
    const r = climb(4321, 1, 10);
    const lv = runLevel(runXp(r.kills)).level;
    const picks = honest(4321, [...Array.from({ length: lv }, (_, i) => ({ k: "l" as const, i })), { k: "b", i: 10 }]);
    expect(evalTower(t, { ...r, cards: picks }, r.durationMs + 1_000).ok).toBe(true);
    const bad = [...picks];
    const off = cardOffer(4321, "l", 0, 0, {});
    bad[0] = { ...bad[0], c: CARD_IDS.find((id) => !off.includes(id) && CARDS[id].rarity === "legend")! };
    expect(evalTower(t, { ...r, cards: bad }, r.durationMs + 1_000)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
    // 처치 수로 오를 수 있는 판 레벨보다 많이 골랐다
    const extra = honest(4321, Array.from({ length: lv + 1 }, (_, i) => ({ k: "l" as const, i })));
    expect(evalTower(t, { ...r, cards: extra }, r.durationMs + 1_000).ok).toBe(false);
    // 10층을 안 깼으면 상사의 제안도 없다
    const r9 = climb(4321, 1, 9);
    expect(evalTower(t, { ...r9, cards: honest(4321, [{ k: "b", i: 10 }]) }, r9.durationMs + 1_000).ok).toBe(false);
  });

  it("체크포인트 시작 카드는 건너뛴 층만큼만", () => {
    const t21 = { seed: 77, level: 50, start: 21 };
    const r = climb(77, 21, 2);
    const six = honest(77, Array.from({ length: 6 }, (_, i) => ({ k: "s" as const, i })), 21);
    expect(evalTower(t21, { ...r, cards: six }, r.durationMs + 1_000).ok).toBe(true);
    const seven = honest(77, Array.from({ length: 7 }, (_, i) => ({ k: "s" as const, i })), 21);
    expect(evalTower(t21, { ...r, cards: seven }, r.durationMs + 1_000).ok).toBe(false);
  });

  it("처치 속도 상한은 카드 배율만큼 늘어난다 (강한 정직한 판이 거절되지 않게)", () => {
    expect(cardPower({})).toBeCloseTo(1.4);
    const strong: CardCounts = { cc: 3, parallel: 2, circular: 2, raise: 5, quick: 5, urgent: 1, boards: 3 };
    expect(cardPower(strong)).toBeGreaterThan(cardPower({ raise: 5 }));
    expect(cardPower(Object.fromEntries(CARD_IDS.map((id) => [id, Number.isFinite(CARDS[id].max) ? CARDS[id].max : 3])))).toBe(CARD_POWER_MAX);
    // 레벨이 낮은 티켓(상한이 가장 낮다)으로 1층을 최소 시간에 + 2층에서 나올 수 있는 만큼 더 잡은 판:
    // 카드 없이(멈추면 집중 배율만)는 상한을 넘고, 정직하게 고른 카드가 있으면 상한이 그만큼 늘어 통과
    const seed = 2024;
    const t1 = { seed, level: 1, start: 1 };
    const r0 = climb(seed, 1, 1);
    const kills = { ...r0.kills };
    for (const [id, n] of Object.entries(huntSpawnable(towerPlan(seed, 2, 1), Infinity)) as [MonsterId, number][]) kills[id] = (kills[id] ?? 0) + n;
    const total = Object.values(kills).reduce((a, b) => a + (b ?? 0), 0);
    const dur = 11_000;
    const fast = { ...r0, kills, durationMs: dur, floorMs: 10_000 };
    const cap = (p: number) => 3 + (dur / 1000) * killRateCeiling("hell", 1) * p;
    expect(total).toBeGreaterThan(cap(cardPower({})));
    expect(evalTower(t1, fast, dur + 500)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
    const lv = runLevel(runXp(kills)).level;
    // 제안된 것 중 가장 센 카드를 고른다 (정직한 기록)
    const owned: CardCounts = {};
    const picks: CardPick[] = Array.from({ length: lv }, (_, i) => {
      const c = cardOffer(seed, "l", i, 0, owned).sort((x, y) => cardPower({ ...owned, [y]: (owned[y] ?? 0) + 1 }) - cardPower({ ...owned, [x]: (owned[x] ?? 0) + 1 }))[0];
      owned[c] = (owned[c] ?? 0) + 1;
      return { k: "l", i, r: 0, c };
    });
    const v = replayPicks(seed, picks, { levels: lv, starts: 0, bossFloors: [], rerolls: 1 });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(total).toBeLessThanOrEqual(cap(cardPower(v.owned)));
    expect(evalTower(t1, { ...fast, cards: picks }, dur + 500).ok).toBe(true);
  });
});

describe("11/15 겹치는 카드 수치 표시", () => {
  it("지금 수치 → 더해진 수치 (+늘어나는 만큼), 효과 계산과 같은 숫자", () => {
    expect(cardStackLine("raise", 1)).toBe("공격력 +15% → +30% (+15%)");
    expect(cardStackLine("quick", 2)).toBe("공격 속도 +24% → +36% (+12%)");
    expect(cardStackLine("boards", 1)).toBe("결재판 2장 → 3장 (+1장)");
    expect(cardStackLine("coffee", 3)).toBeNull();
    for (const id of CARD_IDS) expect(cardStackLine(id, 1) ?? "").not.toMatch(/[:：]/);
  });
});

describe("11/15 등급 개편: 레벨 업 층·팀장 승진·능력치 판", () => {
  it("레벨 업 층은 시작~지금 층 안에서 줄지 않고, 깬 층 경험치로 넘는 층보다 늦을 수 없다", () => {
    const lim = { levels: 9, starts: 0, bossFloors: [], rerolls: 9, start: 11, top: 15 };
    const ok = honest(3, [
      { k: "l", i: 0, f: 11 },
      { k: "l", i: 1, f: 13 },
    ]);
    expect(replayPicks(3, ok, lim).ok).toBe(true);
    expect(replayPicks(3, honest(3, [{ k: "l", i: 0, f: 16 }]), lim)).toMatchObject({ ok: false, why: "floor" });
    expect(replayPicks(3, honest(3, [{ k: "l", i: 0, f: 13 }, { k: "l", i: 1, f: 12 }]), lim)).toMatchObject({ ok: false, why: "floor" });
    expect(replayPicks(3, honest(3, [{ k: "l", i: 0, f: 14 }]), { ...lim, levelFloorMax: () => 12 })).toMatchObject({ ok: false, why: "floor" });
    // 층에 따라 제안이 달라진다 (같은 굴림이라도 등급 경계가 움직인다)
    let diff = 0;
    for (let i = 0; i < 200; i++) if (cardOffer(i, "l", 0, 0, {}, 1).join() !== cardOffer(i, "l", 0, 0, {}, 91).join()) diff++;
    expect(diff).toBeGreaterThan(10);
  });

  it("야근 빌딩 결과: 정직한 레벨 업 층은 통과, 높은 층으로 부풀리면 거절", () => {
    const t = { seed: 909, level: 50, start: 1 };
    const r = climb(909, 1, 12);
    // 층마다 경험치를 쌓아 레벨이 오른 층을 그대로 적는다
    const steps: { k: "l"; i: number; f: number }[] = [];
    let xp = 0;
    for (let f = 1; f <= 12; f++) {
      for (const w of towerPlan(909, f, 1)) for (const m of w.monsters) xp += runXpOf(m);
      while (steps.length < runLevel(xp).level) steps.push({ k: "l", i: steps.length, f });
    }
    expect(steps.length).toBeGreaterThan(6);
    expect(evalTower(t, { ...r, cards: honest(909, steps) }, r.durationMs + 1_000).ok).toBe(true);
    const lifted = steps.map((p) => ({ ...p, f: 13 }));
    expect(evalTower(t, { ...r, cards: honest(909, lifted) }, r.durationMs + 1_000)).toMatchObject({ ok: false, code: "RESULT_REJECTED" });
  });

  it("팀장 승진은 다른 카드 수치를 1.5배로, 겹침 줄에도 반영", () => {
    expect(cardStats({ raise: 2, promote: 1 }).atkMul).toBeCloseTo(1 + 0.15 * 2 * 1.5);
    expect(cardStats({ badge: 3 }).taken).toBeCloseTo(0.18);
    expect(cardStats({ badge: 3, promote: 1 }).taken).toBeCloseTo(0.27);
    expect(cardStackLine("raise", 1, { raise: 1, promote: 1 })).toBe("공격력 +22.5% → +45% (+22.5%)");
    expect(cardPower({ promote: 1, raise: 5 })).toBeGreaterThan(cardPower({ raise: 5 }));
    // 수치 카드는 모두 겹침 줄이 있다 (한 장만 가질 수 있는 카드·커피 수혈 빼고)
    for (const id of CARD_IDS) if (CARDS[id].max > 1 && Number.isFinite(CARDS[id].max)) expect(cardStackLine(id, 1)).not.toBeNull();
    for (const id of CARD_IDS) expect(cardStackLine(id, 1, { promote: 1 }) ?? "").not.toMatch(/[:：]/);
  });

  it("능력치 판: 기본 + 카드 몫이 전투 계산(derive)과 같은 숫자", () => {
    const base = { atk: 200, aspd: 2, crit: 10, maxHp: 1000, move: 100 };
    const s = cardStats({ raise: 2, quick: 1, sharp: 1, memo: 1, health: 1, commute: 1, badge: 2, boards: 1, intern: 1 });
    const cur = { atk: base.atk * s.atkMul, aspd: base.aspd * s.aspdMul, crit: base.crit + s.crit, maxHp: Math.round(base.maxHp * s.hpMul), move: base.move * s.moveMul };
    const p = statPanel(base, cur, 1.1, s);
    const row = (l: string) => p.rows.find((x) => x.label === l)!;
    expect(row("공격력")).toEqual({ label: "공격력", v: "260", plus: "+60" });
    expect(row("공격 속도").v).toBe(`${((2 * 1.12) / 1.1).toFixed(1)}/초`);
    expect(row("치명타")).toMatchObject({ v: "18%", plus: "+8%" });
    expect(row("치명 피해")).toMatchObject({ v: "195%", plus: "+45%" });
    expect(row("최대 체력")).toMatchObject({ v: "1,150", plus: "+150" });
    expect(row("받는 피해").v).toBe("−12%");
    expect(p.chips).toEqual(expect.arrayContaining(["결재판 2장", "인턴 1명"]));
    // 보통 사냥: 카드 몫 없이
    const plain = statPanel(base, base, 1, null);
    expect(plain.chips).toEqual([]);
    expect(plain.rows.every((x) => !x.plus)).toBe(true);
  });
});
