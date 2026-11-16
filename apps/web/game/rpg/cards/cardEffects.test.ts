import { afterEach, describe, expect, it, vi } from "vitest";
import type { MonsterId } from "@/lib/rpg/catalog";
import {
  CARD_IDS,
  CARDS,
  cardPower,
  cardPromoLine,
  cardStats,
  cardText,
  PROMOTE_MUL,
  runXpOf,
  type CardCounts,
  type CardId,
  type CardStats,
} from "@/lib/rpg/cards";
import type { Derived } from "@/lib/rpg/formulas";
import { CardRun, type CardHost, type CardMon } from "./CardRun";

// 11/17 야근 빌딩 능력 카드 전수 조사: 카드에 적힌 숫자 = 실제로 붙는 숫자 (1장·최대 겹침·팀장 승진),
// 무한 야근(부활)·팀장 승진(다른 카드 수치 ×1.5)이 판 실행부(CardRun)에서 제대로 도는지. 그리기는 모두 가짜.

function stub(): unknown {
  const f = function () {};
  return new Proxy(f, {
    get: (_t, k) =>
      k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : stub(),
    apply: () => stub(),
    construct: () => stub() as object,
  });
}
vi.mock("phaser", () => ({}));
vi.mock("./cardFx", () => ({
  CARD_SND: new Proxy({}, { get: () => [] }),
  CDT: new Proxy({}, { get: () => "tex" }),
  ensureCardTextures: () => {},
}));
vi.mock("../combatFx", () => ({ FXT: new Proxy({}, { get: () => "tex" }) }));

type Mon = CardMon;
const mon = (id: MonsterId, o: Partial<Mon> = {}): Mon =>
  ({
    id,
    x: 0,
    y: 0,
    hp: 10,
    alive: true,
    hidden: false,
    boss: false,
    st: { maxHp: 10, def: 0 },
    sprite: stub(),
    slowUntil: 0,
    stunUntil: 0,
    kbx: 0,
    kby: 0,
    ...o,
  }) as unknown as Mon;

/** 가짜 판: 시각·체력·깬 층을 손으로 움직이고, 카드가 부른 회복·SP·무적·능력치 다시 계산을 센다 */
function harness(style = "swing", mons: Mon[] = []) {
  const hits: { m: Mon; mult: number }[] = [];
  const w = {
    now: 0,
    hp: 1000,
    maxHp: 1000,
    cleared: 0,
    healed: 0,
    sp: 0,
    invuln: 0,
    refresh: 0,
  };
  const host = {
    scene: stub(),
    reduced: true,
    now: () => w.now,
    player: () => ({ x: 0, y: 0 }),
    face: () => ({ x: 0, y: 1 }),
    mons: () => mons,
    size: () => 10,
    style: () => ({ id: style }),
    area: () => ({ range: 20, arcDeg: 90 }),
    strike: (m: Mon, mult: number) => hits.push({ m, mult }),
    dot: () => {},
    meleeArc: () => {},
    ink: () => {},
    clampPoint: (x: number, y: number) => ({ x, y }),
    solid: () => null,
    bounds: () => ({ x0: 0, y0: 0, x1: 400, y1: 300 }),
    enemyShots: () => [],
    hp: () => w.hp,
    maxHp: () => w.maxHp,
    healMul: () => 1,
    heal: (n: number) => {
      w.healed += n;
      w.hp = Math.min(w.maxHp, w.hp + n);
    },
    later: (_ms: number, fn: () => void) => fn(),
    hold: () => {},
    canPick: () => true,
    floorsCleared: () => w.cleared,
    refresh: () => w.refresh++,
    addSp: (n: number) => (w.sp += n),
    invuln: (ms: number) => (w.invuln = ms),
    flash: () => {},
    float: () => {},
    synth: () => {},
    shake: () => {},
    ring: () => {},
  } as unknown as CardHost<Mon>;
  const run = new CardRun<Mon>(host, 7, 1);
  /** 카드 한 장 갖기 (화면에서 고른 것과 같은 길 — 능력치 다시 계산·바로 듣는 카드) */
  const give = (id: CardId, n = 1) => {
    for (let i = 0; i < n; i++)
      (run as unknown as { apply(id: CardId): void }).apply(id);
  };
  return { w, run, give, hits };
}

const BASE: Derived = {
  atk: 100,
  aspd: 2,
  crit: 10,
  maxHp: 1000,
  move: 100,
} as unknown as Derived;

afterEach(() => vi.restoreAllMocks());

/**
 * 카드마다: 카드에 적힌 숫자(desc 안에 그대로 있어야 한다) · 한 장당 붙는 값(cardStats에서 읽기) · 겹쳐 쌓이나.
 * 숫자로 말하지 않는 카드는 켜지는 것(flag)만
 */
type Row = {
  text?: string[];
  per?: [(s: CardStats) => number, number][];
  flag?: (s: CardStats, n: number) => boolean;
  stacks?: boolean;
};
const pct =
  (k: keyof CardStats, base = 0) =>
  (s: CardStats) =>
    (s[k] as number) - base;
const TABLE: Record<CardId, Row> = {
  raise: { text: ["15%"], per: [[pct("atkMul", 1), 0.15]], stacks: true },
  quick: { text: ["12%"], per: [[pct("aspdMul", 1), 0.12]], stacks: true },
  health: { text: ["15%"], per: [[pct("hpMul", 1), 0.15]], stacks: true },
  commute: { text: ["10%"], per: [[pct("moveMul", 1), 0.1]], stacks: true },
  coffee: { text: ["40%"], per: [[pct("coffeeHeal"), 0.4]], stacks: false },
  offwork: { text: ["1%"], per: [[pct("killHeal"), 0.01]], stacks: true },
  sharp: {
    text: ["8%", "20%"],
    per: [
      [pct("crit"), 8],
      [pct("critDmg"), 0.2],
    ],
    stacks: true,
  },
  mix: { text: ["2씩"], per: [[pct("spRegen"), 2]], stacks: true },
  memo: { text: ["25%"], per: [[pct("critDmg"), 0.25]], stacks: true },
  walk: {
    text: ["8%", "5%"],
    per: [
      [pct("hpMul", 1), 0.08],
      [pct("moveMul", 1), 0.05],
    ],
    stacks: true,
  },
  circular: { flag: (s, n) => s.dirs.length === 2 * n },
  side: { flag: (s, n) => s.dirs.length === 2 * n },
  backbite: {
    flag: (s, n) =>
      s.dirs.length === (n === 1 ? 1 : 3) &&
      Math.abs(s.dirs[0] - Math.PI) < 1e-9,
  },
  resubmit: { flag: (s) => s.wall },
  toss: { flag: (s, n) => s.toss === n },
  papers: { flag: (s, n) => s.papers === 2 * n },
  snack: { text: ["8%"], per: [[pct("floorHeal"), 0.08]], stacks: true },
  badge: { text: ["6%"], per: [[pct("taken"), 0.06]], stacks: true },
  halfday: { flag: (s) => s.halfday },
  minutes: { text: ["15%"], per: [[pct("xpMul", 1), 0.15]], stacks: true },
  cc: {
    text: ["10%"],
    flag: (s, n) => s.extra === n && Math.abs(s.hitMul - (1 - 0.1 * n)) < 1e-9,
  },
  parallel: { flag: (s, n) => s.front === n },
  direct: {
    per: [
      [pct("reach"), 0.35],
      [pct("pierceDmg"), 0.2],
    ],
    stacks: false,
    flag: (s) => s.pierce,
  },
  passion: { flag: (s) => s.burn },
  chill: { flag: (s) => s.chill },
  solo: { flag: (s) => s.poison },
  urgent: { flag: (s) => s.chain && s.chainJumps === 3 },
  boards: { flag: (s, n) => s.boards === n + 1 },
  intern: { flag: (s, n) => s.interns === n },
  afterparty: { per: [[pct("explode"), 0.6]], stacks: false },
  resign: { text: ["60%"], per: [[pct("resign"), 0.6]], stacks: false },
  chainline: {
    flag: (s) =>
      s.chain &&
      s.chainJumps === 5 &&
      s.chainMult > cardStats({ urgent: 1 }).chainMult,
  },
  wfh: { text: ["15%"], per: [[pct("stillTaken"), 0.15]], stacks: true },
  // 11/17 확률은 15% 고정 (팀장 승진은 대신 때리는 피해에만 — 아래 따로)
  politics: { text: ["15%"], flag: (s) => s.politics === 0.15 },
  bonus: {
    text: ["30%"],
    per: [[pct("bonusDmg" as keyof CardStats), 0]],
    stacks: true,
  },
  oneshot: {
    text: ["5%"],
    per: [[pct("oneshotP"), 0.05]],
    stacks: false,
    flag: (s) => s.oneshot,
  },
  overtime: {
    text: ["30%"],
    per: [[pct("reviveHp"), 0.3]],
    stacks: false,
    flag: (s) => s.revive,
  },
  promote: {
    text: ["50%"],
    flag: (s) => s.promote && s.effMul === PROMOTE_MUL,
  },
  corpcard: { text: ["5초"], flag: (s) => s.corpcard > 0 },
  leave: {
    text: ["30%", "3초", "5초", "50%"],
    per: [[pct("leaveAspd"), 0.5]],
    stacks: false,
    flag: (s) => s.leave,
  },
};
TABLE.bonus.per = [[pct("bossDmg"), 0.3]];

describe("11/17 카드 전수: 적힌 숫자 = 붙는 숫자 (1장·최대 겹침·팀장 승진)", () => {
  it("표가 40장을 모두 다룬다", () => {
    expect(Object.keys(TABLE).sort()).toEqual([...CARD_IDS].sort());
  });

  it.each(CARD_IDS.map((id) => [id]))("%s", (id) => {
    const row = TABLE[id];
    const def = CARDS[id];
    for (const t of row.text ?? [])
      expect(def.desc, `${def.name} 설명에 ${t}`).toContain(t);
    const top = Number.isFinite(def.max) ? def.max : 3;
    for (const n of [1, top]) {
      const s = cardStats({ [id]: n });
      for (const [get, per] of row.per ?? [])
        expect(get(s), `${def.name} ${n}장`).toBeCloseTo(
          per * (row.stacks ? n : 1),
          9,
        );
      if (row.flag) expect(row.flag(s, n), `${def.name} ${n}장`).toBe(true);
      // 팀장 승진: 숫자 효과는 모두 ×1.5 (승진 자신 빼고)
      if (id !== "promote") {
        const sp = cardStats({ [id]: n, promote: 1 });
        for (const [get, per] of row.per ?? [])
          expect(get(sp), `${def.name} ${n}장 + 팀장 승진`).toBeCloseTo(
            per * (row.stacks ? n : 1) * PROMOTE_MUL,
            9,
          );
      }
    }
    // 최대 겹침을 넘겨 실어도 최대까지만 센다 (서버가 기록을 고쳐 실을 때)
    if (Number.isFinite(def.max))
      expect(cardStats({ [id]: def.max + 3 })).toEqual(
        cardStats({ [id]: def.max }),
      );
    // 처치 속도 상한: 카드를 더 가져서 상한이 줄어드는 일은 없다 (정직한 강한 판이 의심 판이 되지 않게)
    expect(cardPower({ [id]: top })).toBeGreaterThanOrEqual(
      cardPower({}) - 1e-9,
    );
    if (id !== "promote")
      expect(cardPower({ [id]: top, promote: 1 })).toBeGreaterThanOrEqual(
        cardPower({ [id]: top }) - 1e-9,
      );
  });

  it("판 실행부(derive)가 능력치에 그대로 얹는다: 1장·최대, 팀장 승진은 고른 순서와 상관없이 한 번만", () => {
    const want = (o: CardCounts) => {
      const s = cardStats(o);
      return {
        atk: 100 * s.atkMul,
        aspd: 2 * s.aspdMul,
        crit: 10 + s.crit,
        maxHp: Math.round(1000 * s.hpMul),
        move: 100 * s.moveMul,
      };
    };
    for (const [id, n] of [
      ["raise", 5],
      ["quick", 5],
      ["health", 5],
      ["commute", 3],
      ["walk", 3],
      ["sharp", 4],
    ] as const) {
      for (const k of [1, n]) {
        const { run, give } = harness();
        give(id, k);
        expect(run.derive(BASE)).toMatchObject(want({ [id]: k }));
      }
    }
    expect(harness().run.derive(BASE).atk).toBe(100);
    // 공격력 +15% × 2장 = +30%, 팀장 승진이면 +45% — 승진을 먼저 골라도 나중에 골라도 같다
    const a = harness();
    a.give("promote");
    a.give("raise", 2);
    const b = harness();
    b.give("raise", 2);
    b.give("promote");
    expect(a.run.derive(BASE).atk).toBeCloseTo(145);
    expect(b.run.derive(BASE).atk).toBeCloseTo(145);
    // 팀장 승진은 한 장만 (두 장으로 실어도 ×1.5 한 번 — ×2.25로 겹치지 않는다)
    expect(cardStats({ raise: 1, promote: 2 }).atkMul).toBeCloseTo(1.225);
  });

  it("받는 피해·주는 피해·치명타·범위가 적힌 숫자대로", () => {
    // 사원증 목걸이 3장 −18% · 재택근무 2장 서 있을 때 −30% (움직이면 안 붙는다)
    const g = harness();
    g.give("badge", 3);
    g.give("wfh", 2);
    expect(g.run.incoming(1000, true)).toBe(820);
    expect(g.run.incoming(1000, false)).toBe(Math.round(1000 * 0.82 * 0.7));
    // 성과급 2장: 우두머리·정예 +60%, 보통 몬스터는 그대로
    const b = harness();
    b.give("bonus", 2);
    expect(
      b.run.dmgMul(mon("scope_creep" as MonsterId, { boss: true })),
    ).toBeCloseTo(1.6);
    expect(
      b.run.dmgMul(mon("scope_creep" as MonsterId, { elite: true })),
    ).toBeCloseTo(1.6);
    expect(b.run.dmgMul(mon("scope_creep" as MonsterId))).toBe(1);
    // 퇴사 각: 체력 가득 = 0, 거의 바닥 = +60% (승진이면 +90%)
    const r = harness();
    r.give("resign");
    expect(r.run.dmgMul(mon("scope_creep" as MonsterId))).toBe(1);
    r.w.hp = 0;
    expect(r.run.dmgMul(mon("scope_creep" as MonsterId))).toBeCloseTo(1.6);
    r.give("promote");
    expect(r.run.dmgMul(mon("scope_creep" as MonsterId))).toBeCloseTo(1.9);
    // 예리한 지적 + 메모 습관: 치명타 피해 150% → 150 + 20 + 25 = 195%
    const c = harness();
    c.give("sharp");
    c.give("memo");
    expect(c.run.critMul * 1.5).toBeCloseTo(1.95);
    // 참조 추가 3장: 한 번 피해 −30%
    const cc = harness();
    cc.give("cc", 3);
    expect(cc.run.hitMul).toBeCloseTo(0.7);
    // 직보: 근접 +35% 닿는 거리 · 마법 +35% 범위, 팀장 승진이면 +52.5%
    const m = harness("swing");
    m.give("direct");
    expect(m.run.area({ range: 40, arcDeg: 90 }).range).toBe(54);
    m.give("promote");
    expect(m.run.area({ range: 40, arcDeg: 90 }).range).toBe(61);
    const mg = harness("magic");
    mg.give("direct");
    expect(mg.run.blastMul).toBeCloseTo(1.35);
    mg.give("promote");
    expect(mg.run.blastMul).toBeCloseTo(1.525);
  });

  it("원샷 결재: 보통 몬스터만 5% (팀장 승진 7.5%), 우두머리·정예는 안 된다", () => {
    const { run, give } = harness();
    give("oneshot");
    vi.spyOn(Math, "random").mockReturnValue(0.049);
    expect(run.oneshot(mon("scope_creep" as MonsterId))).toBe(true);
    expect(run.oneshot(mon("scope_creep" as MonsterId, { boss: true }))).toBe(
      false,
    );
    expect(run.oneshot(mon("scope_creep" as MonsterId, { elite: true }))).toBe(
      false,
    );
    vi.spyOn(Math, "random").mockReturnValue(0.051);
    expect(run.oneshot(mon("scope_creep" as MonsterId))).toBe(false);
    give("promote");
    vi.spyOn(Math, "random").mockReturnValue(0.074);
    expect(run.oneshot(mon("scope_creep" as MonsterId))).toBe(true);
  });

  it("회복·SP·경험치: 커피 수혈 40% · 칼퇴 의지 처치마다 1% · 탕비실 간식 층마다 8% · 믹스커피 초당 2 · 회의록 정리 +15%", () => {
    const h = harness();
    h.w.hp = 100;
    h.give("coffee");
    expect(h.w.healed).toBeCloseTo(400);
    const o = harness();
    o.give("offwork", 2);
    o.w.hp = 100;
    o.run.onKill(mon("scope_creep" as MonsterId));
    expect(o.w.healed).toBeCloseTo(20);
    const s = harness();
    s.give("snack", 2);
    s.w.hp = 100;
    s.run.update(0.016);
    expect(s.w.healed).toBe(0);
    s.w.cleared = 1;
    s.run.update(0.016);
    expect(s.w.healed).toBeCloseTo(160);
    s.run.update(0.016);
    expect(s.w.healed).toBeCloseTo(160);
    const x = harness();
    x.give("mix", 3);
    for (let t = 0; t <= 3000; t += 100) {
      x.w.now = t;
      x.run.update(0.1);
    }
    expect(x.w.sp).toBe(6 * 4);
    // 회의록 정리 2장: 처치 경험치 +30%
    const xp = harness();
    xp.give("minutes", 2);
    const id = "scope_creep" as MonsterId;
    for (let i = 0; i < 10; i++) xp.run.onKill(mon(id));
    expect((xp.run as unknown as { xp: number }).xp).toBeCloseTo(
      10 * runXpOf(id) * 1.3,
    );
  });

  it("반차: 층마다 첫 공격 한 번만 0, 다음 층에 다시", () => {
    const { run, give, w } = harness();
    give("halfday");
    expect(run.incoming(500, true)).toBe(0);
    expect(run.incoming(500, true)).toBe(500);
    expect(run.spare.halfday).toBe(false);
    w.cleared = 1;
    run.update(0.016);
    expect(run.spare.halfday).toBe(true);
    expect(run.incoming(500, true)).toBe(0);
  });
});

describe("11/17 무한 야근 (부활)", () => {
  it("카드가 없으면 안 일어난다, 있으면 판에 딱 한 번 — 층이 바뀌어도(우두머리 층·상사의 제안 뒤에도) 다시 생기지 않는다", () => {
    const none = harness();
    expect(none.run.revive()).toBe(false);
    const { run, give, w } = harness();
    give("overtime");
    expect(run.spare.revive).toBe(true);
    expect(run.reviveHp).toBeCloseTo(0.3);
    expect(run.revive()).toBe(true);
    expect(run.spare.revive).toBe(false);
    expect(run.revive()).toBe(false);
    for (let f = 1; f <= 12; f++) {
      w.cleared = f;
      w.now += 60_000;
      run.update(0.016);
      if (f % 10 === 0) run.bossDeal(f);
    }
    expect(run.revive()).toBe(false);
    // 다른 카드를 더 골라도 (능력치 다시 계산) 쓴 부활은 그대로 쓴 것
    give("raise");
    expect(run.revive()).toBe(false);
    // 최대 1장 — 두 장 실어도 부활은 한 번
    expect(CARDS.overtime.max).toBe(1);
    expect(cardStats({ overtime: 5 }).revive).toBe(true);
  });

  it("체력 30%로 일어난다, 팀장 승진이면 45% (다른 카드의 수치가 모두 50% 더)", () => {
    const a = harness();
    a.give("overtime");
    expect(a.run.reviveHp).toBeCloseTo(0.3);
    a.give("promote");
    expect(a.run.reviveHp).toBeCloseTo(0.45);
    expect(cardPromoLine("overtime", 1, { promote: 1 })).toBe(
      "팀장 승진으로 다시 일어날 때 체력 45%",
    );
  });
});

describe("11/17 팀장 승진 (다른 카드 수치 ×1.5)", () => {
  it("숫자 카드는 모두 ×1.5, 승진 자신·숫자 없는 카드(갈래·방향·횟수)는 그대로", () => {
    for (const id of CARD_IDS) {
      if (id === "promote") continue;
      const n = Number.isFinite(CARDS[id].max) ? CARDS[id].max : 1;
      const a = cardStats({ [id]: n });
      const b = cardStats({ [id]: n, promote: 1 });
      // 갈래·방향·횟수·켜짐은 승진과 상관없다
      expect([
        b.extra,
        b.front,
        b.dirs.length,
        b.toss,
        b.boards,
        b.papers,
        b.interns,
        b.chainJumps,
        b.pierce,
        b.wall,
        b.burn,
        b.chill,
        b.poison,
        b.halfday,
        b.revive,
        b.leave,
        b.politics,
      ]).toEqual([
        a.extra,
        a.front,
        a.dirs.length,
        a.toss,
        a.boards,
        a.papers,
        a.interns,
        a.chainJumps,
        a.pierce,
        a.wall,
        a.burn,
        a.chill,
        a.poison,
        a.halfday,
        a.revive,
        a.leave,
        a.politics,
      ]);
      // 참조 추가의 한 번 피해 −10%는 깎는 값이라 승진이 키우지 않는다
      expect(b.hitMul).toBe(a.hitMul);
    }
  });

  it("화면: 처음 고르는 카드·가진 카드 설명에 승진이 붙은 숫자를 보여 준다", () => {
    expect(cardPromoLine("raise", 1, {})).toBeNull();
    expect(cardPromoLine("raise", 1, { promote: 1 })).toBe(
      "팀장 승진으로 공격력 +22.5%",
    );
    expect(cardPromoLine("raise", 3, { promote: 1 })).toBe(
      "팀장 승진으로 공격력 +67.5%",
    );
    expect(cardPromoLine("badge", 1, { promote: 1 })).toBe(
      "팀장 승진으로 받는 피해 −9%",
    );
    expect(cardPromoLine("direct", 1, { promote: 1 }, "melee")).toBe(
      "팀장 승진으로 닿는 거리 +52.5%",
    );
    expect(cardPromoLine("direct", 1, { promote: 1 }, "ranged")).toBe(
      "팀장 승진으로 원래 뚫는 무기면 피해 +30%",
    );
    expect(cardPromoLine("promote", 1, { promote: 1 })).toBeNull();
    expect(cardPromoLine("circular", 1, { promote: 1 })).toBeNull();
    // 적힌 숫자가 있는 카드는 모두 승진 줄이 있다 (설명에 % 숫자가 있으면)
    for (const id of CARD_IDS) {
      if (id === "promote" || id === "cc" || id === "corpcard") continue;
      if (/\d+%|\d+씩/.test(cardText(id, "melee")))
        expect(cardPromoLine(id, 1, { promote: 1 }), id).not.toBeNull();
      expect(cardPromoLine(id, 1, { promote: 1 }) ?? "").not.toMatch(/[:：]/);
    }
  });

  it("연차 몰아 쓰기: 체력 30% 아래로 떨어지면 무적 3초 + 5초 동안 공격 속도 +50% (승진 +75%), 층마다 한 번", () => {
    const { run, give, w } = harness();
    give("leave");
    w.hp = 299;
    run.update(0.016);
    expect(w.invuln).toBe(3000);
    expect(run.derive(BASE).aspd).toBeCloseTo(3);
    w.invuln = 0;
    run.update(0.016);
    expect(w.invuln).toBe(0);
    w.now = 6000;
    run.update(0.016);
    expect(run.derive(BASE).aspd).toBeCloseTo(2);
    // 다음 층: 다시 쓸 수 있지만, 30% 위로 올라왔다가 다시 떨어져야 터진다
    w.invuln = 0;
    w.cleared = 1;
    run.update(0.016);
    expect(w.invuln).toBe(0);
    w.hp = 500;
    run.update(0.016);
    w.hp = 250;
    run.update(0.016);
    expect(w.invuln).toBe(3000);
    expect(cardPromoLine("leave", 1, { promote: 1 })).toBe(
      "팀장 승진으로 5초 동안 공격 속도 +75%",
    );
    const p = harness();
    p.give("leave");
    p.give("promote");
    p.w.hp = 100;
    p.run.update(0.016);
    expect(p.run.derive(BASE).aspd).toBeCloseTo(3.5);
  });

  it("연차 몰아 쓰기는 「떨어지는 순간」만: 이미 30% 아래인 채로 층을 깨거나, 부활 직후 30%에 살짝 못 미쳐도 바로 안 터진다", () => {
    // 이미 30% 아래로 층을 깸 → 엘리베이터 안에서 터지지 않는다
    const a = harness();
    a.give("leave");
    a.w.hp = 250;
    a.run.update(0.016);
    expect(a.w.invuln).toBe(3000);
    a.w.invuln = 0;
    a.w.cleared = 1;
    for (let i = 0; i < 5; i++) a.run.update(0.016);
    expect(a.w.invuln).toBe(0);
    expect(a.run.spare.leave).toBe(true);
    // 부활 직후: 체력 30%가 반올림으로 살짝 모자라도 (지난 프레임엔 30% 위였어도) 안 터진다
    const b = harness();
    b.give("leave");
    b.give("overtime");
    b.w.maxHp = 1001;
    b.w.hp = 900;
    b.run.update(0.016);
    expect(b.run.revive()).toBe(true);
    b.w.hp = Math.round(1001 * b.run.reviveHp); // 300 < 300.3
    b.run.update(0.016);
    expect(b.w.invuln).toBe(0);
    expect(b.run.spare.leave).toBe(true);
    // 그 뒤 30% 위로 올라왔다가 다시 떨어지면 터진다
    b.w.hp = 400;
    b.run.update(0.016);
    b.w.hp = 200;
    b.run.update(0.016);
    expect(b.w.invuln).toBe(3000);
    // 30% 아래일 때 카드를 고르면, 다시 올라왔다 떨어질 때까지 안 터진다
    const c = harness();
    c.w.hp = 100;
    c.run.update(0.016);
    c.give("leave");
    c.run.update(0.016);
    expect(c.w.invuln).toBe(0);
  });

  it("사내 정치: 확률은 15% 그대로, 팀장 승진은 대신 때리는 피해에만 (0.6 → 0.9)", () => {
    const hit = mon("scope_creep" as MonsterId);
    const near = mon("scope_creep" as MonsterId, { x: 20 });
    expect(cardStats({ politics: 1 }).politics).toBe(0.15);
    expect(cardStats({ politics: 1, promote: 1 }).politics).toBe(0.15);
    expect(CARDS.politics.desc).toContain("15%");
    expect(cardPromoLine("politics", 1, { promote: 1 })).toBe(
      "팀장 승진으로 대신 때리는 피해 +50% (확률은 15% 그대로)",
    );
    for (const [promo, want] of [
      [false, 0.6],
      [true, 0.9],
    ] as const) {
      const h = harness("swing", [hit, near]);
      h.give("politics");
      if (promo) h.give("promote");
      // 확률 15%: 0.149면 터지고 0.151이면 안 터진다 (승진이 있어도 같다)
      vi.spyOn(Math, "random").mockReturnValue(0.151);
      h.run.onBasicHit(hit);
      expect(h.hits.length).toBe(0);
      vi.spyOn(Math, "random").mockReturnValue(0.149);
      h.run.onBasicHit(hit);
      expect(h.hits).toHaveLength(1);
      expect(h.hits[0].m).toBe(near);
      expect(h.hits[0].mult).toBeCloseTo(want);
    }
    // 서버 처치 속도 상한은 예전(확률 ×1.5로 셈)과 같은 몫: 사내 정치 몫 = 1 + 0.15 × 1.5 × 1.5 (스킬 피해 몫은 따로)
    const skill = (o: CardCounts) => 1 + 0.5 * cardStats(o).skillDmg;
    expect(
      cardPower({ politics: 1, promote: 1 }) /
        skill({ politics: 1, promote: 1 }),
    ).toBeCloseTo(
      (cardPower({ promote: 1 }) / skill({ promote: 1 })) *
        (1 + 0.15 * 1.5 * 1.5),
    );
  });

  it("법인카드·연차가 겹쳐도 먼저 끝난 혜택은 제때 빠진다 (능력치를 바로 다시 계산)", () => {
    const { run, give, w } = harness();
    give("corpcard");
    give("leave");
    vi.spyOn(Math, "random").mockReturnValue(0); // 처치마다 혜택 · 첫 번째 혜택(공격력 +40%)
    run.onKill(mon("scope_creep" as MonsterId));
    expect(run.derive(BASE).atk).toBeCloseTo(140);
    w.now = 3000;
    w.hp = 100;
    run.update(0.016); // 연차: 8초까지 공격 속도
    const before = w.refresh;
    w.now = 5100; // 법인카드 혜택 끝 (연차는 아직)
    run.update(0.016);
    expect(w.refresh).toBeGreaterThan(before);
    expect(run.derive(BASE).atk).toBeCloseTo(100);
    expect(run.derive(BASE).aspd).toBeCloseTo(3);
    const mid = w.refresh;
    w.now = 8100; // 연차도 끝
    run.update(0.016);
    expect(w.refresh).toBeGreaterThan(mid);
    expect(run.derive(BASE).aspd).toBeCloseTo(2);
  });
});
