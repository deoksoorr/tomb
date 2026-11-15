import { describe, expect, it } from "vitest";
import { GEAR, gearById, type GearKind, type GearSlot } from "./catalog";
import { normalize, removePieceForSale, sellValue } from "./character";
import { disassemble, DISASSEMBLE, enhance, enhanceRate, ENHANCE_TABLE, equipSg, exchange, grantSgDrops, reroll, rerollCost, type EnhTarget } from "./enhance";
import { baseStats, derive, seeded } from "./formulas";
import {
  activeSets,
  decodeSg,
  encodeSg,
  equippedSg,
  itemOfSpec,
  optRange,
  optsFor,
  SG_BASE,
  SG_GRADE_MULT,
  SG_INV_MAX,
  SG_OPT_COUNT,
  SG_PIECES,
  sgCombat,
  sgDef,
  sgStatic,
  syncEquip,
  enhMul,
  shopPieceOf,
  unenhanced,
  type SgGrade,
  type SgItem,
} from "./setGear";
import {
  chestCosmetic,
  chestDocs,
  chestSeals,
  CHEST_COSMETICS,
  cosTierOf,
  crossesTen,
  gearPower,
  nextPity,
  rollOptions,
  rollSgItem,
  sgGradeForFloor,
  SG_CHEST_CHANCE,
  SG_PITY,
} from "./setGearRoll";
import { floorSeed, towerChestDrops, towerChestFloors } from "./tower";
import type { CharacterState, Drop } from "./types";

// 11/15 세트 장비·강화·재료·상자 꾸미기

const item = (p: Partial<SgItem> = {}): SgItem => ({
  s: 0,
  p: 0,
  g: 3,
  u: 1,
  e: 0,
  o: [
    ["a", 7],
    ["c", 5],
    ["d", 18],
  ],
  L: 0,
  rr: 0,
  f: 0,
  ...p,
});
const empty: Record<GearSlot, string | null> = {
  weapon: null,
  armor: null,
  head: null,
  acc1: null,
  acc2: null,
};
const char = (p: Partial<CharacterState> = {}): CharacterState => normalize({ level: 50, ...p });
/** 고정 난수 줄 */
const fixed = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("세트 장비 기본 능력치·코드", () => {
  it("기본 = 지금 상점 최고 장비 × 직급 배율 (임원급 무기 공격력 약 207)", () => {
    const top = (k: GearKind) => GEAR.filter((g) => g.kind === k).sort((a, b) => b.reqLevel - a.reqLevel)[0];
    expect(top("weapon").bonus.atk).toBe(118);
    expect(SG_BASE.armor).toEqual(top("armor").bonus);
    expect(SG_BASE.head).toEqual(top("head").bonus);
    expect(SG_BASE.acc).toEqual(top("acc").bonus);
    expect(SG_GRADE_MULT).toEqual([1.15, 1.3, 1.5, 1.75]);
    expect(sgDef(item({ g: 3 })).bonus.atk).toBe(207);
    expect(sgDef(item({ g: 0 })).bonus.atk).toBe(136);
    // 11/15 강화 배율: +1~+5 한 단계 8%p, +6~+10 12%p, +11~+15 20%p → +5 ×1.40 · +10 ×2.00 · +15 ×3.00 (옵션은 그대로)
    expect([0, 1, 5, 6, 10, 11, 15].map(enhMul)).toEqual([1, 1.08, 1.4, 1.52, 2, 2.2, 3]);
    expect(sgDef(item({ g: 0, e: 15 })).bonus.atk).toBe(136 * 3);
    expect(sgDef(item({ g: 0, e: 10 })).bonus.atk).toBe(136 * 2);
    // 작은 능력치도 한 단계마다 오른다 (올림): 치명 5 → +1에 6
    expect(sgDef(item({ g: 0, e: 1 })).bonus.crit).toBe(6);
    expect(sgDef(item()).reqLevel).toBe(50);
    expect(sgDef(item({ s: 2 })).name).toBe("끝없는 PPT 마법서");
    expect(sgDef(item({ s: 2 })).style).toBe("magic");
  });

  it("코드 왕복, 잘못된 코드는 거절 (범위 밖 옵션·겹친 옵션·임원 아닌 전설)", () => {
    const it0 = item({ u: 12345, e: 12, L: 2, rr: 3, f: 1 });
    expect(decodeSg(encodeSg(it0))).toEqual(it0);
    expect(gearById(encodeSg(it0))?.name).toBe("막차 놓친 도끼");
    expect(decodeSg("s003.1.0.a9.0.0")).toBeNull(); // 임원 공격력 최대 8
    expect(decodeSg("s003.1.0.a7a7.0.0")).toBeNull();
    expect(decodeSg("s003.1.0.h8.0.0")).toBeNull(); // 최대 체력은 무기에 안 붙는다
    expect(decodeSg("s013.1.0.h8.0.0")).not.toBeNull();
    expect(decodeSg("s002.1.0.a6!1.0.0")).toBeNull();
    expect(decodeSg("s003.1.16.a7.0.0")).toBeNull();
    expect(itemOfSpec("s012.h9r5p25", 7)).toMatchObject({
      s: 0,
      p: 1,
      g: 2,
      u: 7,
      e: 0,
    });
    // 상점 장비 강화 표시
    expect(gearById("w_stamp+3")?.bonus.atk).toBe(118 + Math.ceil(118 * 0.24));
    expect(gearById("w_stamp+5@a.0")?.bonus.atk).toBe(118 + Math.ceil(118 * 0.4 - 1e-9));
    expect(gearById("w_stamp+6")).toBeUndefined();
  });
});

describe("랜덤 옵션", () => {
  it("직급만큼(2·2·3·3), 겹치지 않고, 직급 범위 안 · 전설은 임원급에만 약 10%", () => {
    const r = seeded(7);
    let legends = 0;
    for (let n = 0; n < 4000; n++) {
      const g = (n % 4) as SgGrade;
      const piece = SG_PIECES[n % 5];
      const { o, L } = rollOptions(r, piece, g);
      expect(o.length).toBe(Math.min(SG_OPT_COUNT[g], optsFor(piece).length));
      expect(new Set(o.map(([k]) => k)).size).toBe(o.length);
      for (const [k, v] of o) {
        const [lo, hi] = optRange(k, g);
        expect(v).toBeGreaterThanOrEqual(lo);
        expect(v).toBeLessThanOrEqual(hi);
        expect(optsFor(piece)).toContain(k);
      }
      if (L) {
        expect(g).toBe(3);
        legends++;
      }
    }
    expect(legends / 1000).toBeGreaterThan(0.07);
    expect(legends / 1000).toBeLessThan(0.13);
    expect(optRange("a", 0)).toEqual([3, 5]);
    expect(optRange("a", 3)).toEqual([6, 8]);
    expect(optRange("d", 3)).toEqual([15, 20]);
  });

  it("부위 비율 무기 15 · 갑옷 20 · 머리 20 · 장신구 45, 세트 25%씩", () => {
    const r = seeded(99);
    const piece = [0, 0, 0, 0, 0];
    const sets = [0, 0, 0, 0];
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const it = rollSgItem(r, 1);
      piece[it.p]++;
      sets[it.s]++;
    }
    const pct = piece.map((n) => n / N);
    expect(pct[0]).toBeCloseTo(0.15, 1);
    expect(pct[1]).toBeCloseTo(0.2, 1);
    expect(pct[3] + pct[4]).toBeCloseTo(0.45, 1);
    for (const n of sets) expect(n / N).toBeCloseTo(0.25, 1);
  });
});

describe("우두머리 상자 (게임 ↔ 서버, 천장)", () => {
  it("직급은 층으로: 5~14 사원 · 15~29 대리 · 30~49 과장 · 50~ 임원", () => {
    expect([5, 14, 15, 29, 30, 49, 50, 120].map(sgGradeForFloor)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("상자마다 결재 서류 2 + 층÷10, 인감 도장 25층부터 1·50층부터 2 · 꾸미기 일반 장비 대신 세트 장비", () => {
    expect([5, 10, 25, 50, 95].map(chestDocs)).toEqual([2, 3, 4, 7, 11]);
    expect([20, 25, 49, 50].map(chestSeals)).toEqual([0, 1, 1, 2]);
    const d = towerChestDrops(1, 50, 1);
    expect(d.find((x) => x.id === "m_doc")?.qty).toBe(7);
    expect(d.find((x) => x.id === "m_seal")?.qty).toBe(2);
    expect(d.some((x) => x.kind === "gear")).toBe(false);
  });

  it("세트 장비는 약 15%, 7번 연속 못 받으면 다음은 반드시 — 판 안에서 센 것과 서버가 센 것이 같다", () => {
    let hits = 0;
    let n = 0;
    let maxMiss = 0;
    for (let seed = 1; seed <= 400; seed++) {
      // 게임: 상자를 여는 순서대로 천장을 센다 / 서버: 같은 층 목록을 판 끝에 같은 순서로
      const floors = towerChestFloors(1, 60, 0);
      let pa = 0;
      const game: Drop[][] = floors.map((f) => {
        const d = towerChestDrops(seed, f, 1, pa);
        pa = nextPity(d, pa);
        return d;
      });
      let pb = 0;
      const server = floors.map((f) => {
        const d = towerChestDrops(seed, f, 1, pb);
        pb = nextPity(d, pb);
        return d;
      });
      expect(server).toEqual(game);
      let miss = 0;
      for (const d of game) {
        n++;
        if (d.some((x) => x.kind === "set")) {
          hits++;
          miss = 0;
        } else maxMiss = Math.max(maxMiss, ++miss);
        const set = d.find((x) => x.kind === "set");
        if (set) expect(itemOfSpec(set.id, 1)).not.toBeNull();
      }
    }
    expect(maxMiss).toBeLessThanOrEqual(SG_PITY);
    // 천장 포함 실제 비율은 15%보다 조금 높다 (약 4.9번에 하나 ≈ 20%)
    expect(hits / n).toBeGreaterThan(SG_CHEST_CHANCE);
    expect(hits / n).toBeLessThan(0.24);
    // 천장 7이면 반드시
    for (let seed = 1; seed < 50; seed++) expect(towerChestDrops(seed, 5, 1, SG_PITY).some((x) => x.kind === "set")).toBe(true);
    // 상자 직급
    const at = (f: number) => {
      for (let seed = 1; ; seed++) {
        const s = towerChestDrops(seed, f, 1, SG_PITY).find((x) => x.kind === "set");
        if (s) return itemOfSpec(s.id, 1)!.g;
      }
    };
    expect([at(5), at(15), at(30), at(50)]).toEqual([0, 1, 2, 3]);
  });

  it("슈퍼 계정 시험 드롭: 상자마다 세트 장비·꾸미기 하나씩 (재료는 그대로), 끄면 보통 굴림과 같다", () => {
    for (let seed = 1; seed < 40; seed++) {
      const d = towerChestDrops(seed, 35, 1, 0, true);
      expect(d.filter((x) => x.kind === "set")).toHaveLength(1);
      expect(d.filter((x) => x.kind === "cosmetic")).toHaveLength(1);
      expect(d.find((x) => x.id === "m_doc")?.qty).toBe(chestDocs(35));
      expect(towerChestDrops(seed, 35, 1, 0, false)).toEqual(towerChestDrops(seed, 35, 1));
    }
  });
});

describe("상자 꾸미기 (10%, 층별 등급·랜덤 일수)", () => {
  it("후보는 상점 캐릭터 꾸미기 (닉네임·펫 빼고), 15층 아래 일반·고급만, 30층부터 전설 약 3%", () => {
    expect(CHEST_COSMETICS.length).toBeGreaterThan(50);
    expect(CHEST_COSMETICS.every((i) => i.slot !== "pet" && i.slot !== "nameColor" && i.slot !== "namePlate")).toBe(true);
    const roll = (f: number, n: number) => {
      const out: Drop[] = [];
      for (let i = 1; i <= n; i++) {
        const d = chestCosmetic(floorSeed(i, f), f, true);
        if (d) out.push(d);
      }
      return out;
    };
    const tier = (d: Drop) => cosTierOf(CHEST_COSMETICS.find((i) => i.id === d.id)!.price);
    expect(roll(10, 2000).every((d) => tier(d) <= 1)).toBe(true);
    expect(roll(20, 2000).every((d) => tier(d) <= 2)).toBe(true);
    const hi = roll(40, 6000);
    const leg = hi.filter((d) => tier(d) === 3).length / hi.length;
    expect(leg).toBeGreaterThan(0.015);
    expect(leg).toBeLessThan(0.05);
    // 일수: 1일 45 · 3일 30 · 7일 20 · 30일 5, 전설은 30일 없음
    const days = (k: number) => hi.filter((d) => d.days === k).length / hi.length;
    expect(days(1)).toBeCloseTo(0.45, 1);
    expect(days(3)).toBeCloseTo(0.3, 1);
    expect(days(7)).toBeCloseTo(0.2, 1);
    expect(days(30)).toBeGreaterThan(0.02);
    expect(hi.filter((d) => tier(d) === 3).every((d) => d.days !== 30)).toBe(true);
    // 보통 굴림은 약 10%
    let got = 0;
    for (let i = 1; i <= 5000; i++) if (chestCosmetic(floorSeed(i, 30), 30)) got++;
    expect(got / 5000).toBeCloseTo(0.1, 1);
  });

  it("보호 문서: 이번 주 최고 층이 10층 단위를 새로 넘을 때", () => {
    expect(crossesTen(0, 9)).toBe(false);
    expect(crossesTen(0, 10)).toBe(true);
    expect(crossesTen(12, 19)).toBe(false);
    expect(crossesTen(19, 31)).toBe(true);
  });
});

describe("세트 효과·옵션 (능력치·싸움)", () => {
  const eq = (codes: SgItem[]) => {
    const e = { ...empty };
    const slots: GearSlot[] = ["weapon", "armor", "head", "acc1", "acc2"];
    for (const it of codes) e[slots[it.p]] = encodeSg(it);
    return e;
  };

  it("2세트·4세트, 2+2 섞기, 같은 부위 두 개는 하나로", () => {
    const ov = [0, 1].map((p) => item({ s: 0, p, u: p + 1, o: [] }));
    const ap = [2, 3].map((p) => item({ s: 1, p, u: p + 1, o: [] }));
    const a = activeSets(eq([...ov, ...ap]));
    expect(a.two).toEqual(["overtime", "approval"]);
    expect(a.four).toEqual([]);
    const four = activeSets(eq([0, 1, 2, 3].map((p) => item({ s: 3, p, u: p + 1, o: [] }))));
    expect(four.four).toEqual(["trip"]);
    // 장신구 칸 둘에 같은 장신구 → 1부위
    const dup = {
      ...empty,
      acc1: encodeSg(item({ s: 0, p: 3, u: 1, o: [] })),
      acc2: encodeSg(item({ s: 0, p: 3, u: 2, o: [] })),
    };
    expect(activeSets(dup).counts.overtime).toBe(1);
  });

  it("derive: 야근 2세트 체력 +10%, 결재 2세트 치명 +6, 회의 2세트 SP +20%·스킬 +8%, 출장 2세트 이속 +8%, 옵션 %", () => {
    const st = baseStats();
    const base = derive(50, st, {
      ...empty,
      armor: "a_hazmat",
      head: "h_halo",
    });
    const ov = derive(50, st, eq([item({ s: 0, p: 1, u: 1, g: 0, o: [] }), item({ s: 0, p: 2, u: 2, g: 0, o: [] })]));
    const noFx = derive(50, st, {
      ...eq([item({ s: 0, p: 1, u: 1, g: 0, o: [] })]),
      head: encodeSg(item({ s: 1, p: 2, u: 2, g: 0, o: [] })),
    });
    expect(ov.maxHp).toBeGreaterThan(base.maxHp);
    expect(ov.maxHp / noFx.maxHp).toBeCloseTo(1.1, 2);
    expect(sgStatic(eq([item({ s: 1, p: 1, u: 1, o: [] }), item({ s: 1, p: 2, u: 2, o: [] })])).crit).toBe(6);
    const mt = sgStatic(eq([item({ s: 2, p: 1, u: 1, o: [] }), item({ s: 2, p: 2, u: 2, o: [] })]));
    expect([mt.spPct, mt.skillPct]).toEqual([0.2, 0.08]);
    expect(sgStatic(eq([item({ s: 3, p: 1, u: 1, o: [] }), item({ s: 3, p: 2, u: 2, o: [] })])).movePct).toBe(0.08);
    // 옵션: 공격력 +7%
    const w = derive(50, st, eq([item({ o: [["a", 7]] })]));
    const w0 = derive(50, st, eq([item({ o: [] })]));
    expect(w.atk / w0.atk).toBeCloseTo(1.07, 2);
    // 싸움 옵션
    const cb = sgCombat(
      eq([
        item({
          o: [
            ["d", 18],
            ["b", 13],
          ],
          L: 1,
        }),
        item({
          p: 1,
          u: 2,
          o: [
            ["r", 5],
            ["p", 27],
          ],
        }),
      ]),
    );
    expect(cb).toMatchObject({
      critDmg: 0.18,
      bossDmg: 0.13,
      guard: 0.05,
      potion: 0.27,
      legends: [1],
    });
  });

  it("서버 처치 속도 상한: 세트 장비·강화가 세지면 배율이 오른다 (1 이상)", () => {
    const st = baseStats();
    expect(gearPower(50, st, { ...empty, weapon: "w_stamp" })).toBe(1);
    const strong = {
      ...empty,
      weapon: encodeSg(
        item({
          e: 15,
          o: [
            ["a", 8],
            ["s", 8],
            ["d", 20],
          ],
          L: 2,
        }),
      ),
      armor: encodeSg(item({ p: 1, u: 2, o: [] })),
    };
    expect(gearPower(50, st, strong)).toBeGreaterThan(2);
    expect(gearPower(50, st, { ...empty, weapon: "w_stamp+5@c.0" })).toBeGreaterThan(1.1);
    // +15 임원 전부: 상한(40) 안
    const all15 = { weapon: encodeSg(item({ e: 15, o: [["a", 8], ["s", 8], ["d", 20]], L: 2 })), armor: encodeSg(item({ p: 1, u: 2, e: 15, o: [] })), head: encodeSg(item({ p: 2, u: 3, e: 15, o: [] })), acc1: encodeSg(item({ p: 3, u: 4, e: 15, o: [["a", 8]] })), acc2: encodeSg(item({ p: 4, u: 5, e: 15, o: [["a", 8]] })) };
    expect(gearPower(50, st, all15)).toBeLessThan(40);
  });
});

describe("강화 (고정 난수)", () => {
  const withSg = (it: SgItem, p: Partial<CharacterState> = {}) =>
    char({
      sg: [encodeSg(it)],
      sgN: it.u + 1,
      mats: { doc: 999, seal: 99, prot: 3 },
      ...p,
    });
  const sgT = (u: number): EnhTarget => ({ sg: u });

  it("표대로: 확률·포인트·재료, 성공하면 +1, 연속 실패마다 +5%p (성공하면 처음부터)", () => {
    expect(ENHANCE_TABLE.slice(1).map((r) => r.cost)).toEqual([40, 60, 80, 120, 160, 200, 260, 320, 400, 480, 560, 640, 720, 800, 880]);
    expect(ENHANCE_TABLE[1]).toEqual({ rate: 1, cost: 40, doc: 0, seal: 0 });
    expect(ENHANCE_TABLE.slice(1).map((r) => r.doc)).toEqual([0, 0, 0, 0, 0, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ENHANCE_TABLE.slice(1).map((r) => r.seal)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2]);
    expect(ENHANCE_TABLE[6]).toEqual({ rate: 0.75, cost: 200, doc: 2, seal: 0 });
    expect(ENHANCE_TABLE[15]).toEqual({ rate: 0.28, cost: 880, doc: 10, seal: 2 });
    expect(enhanceRate(15, 2)).toBeCloseTo(0.38);
    expect(enhanceRate(2, 9)).toBe(1);
    const s = withSg(item({ e: 5 }));
    const ok = enhance(s, sgT(1), false, fixed(0.1));
    expect(ok.cost).toBe(200);
    expect(ok.result).toMatchObject({ ok: true, from: 5, to: 6 });
    expect(decodeSg(ok.state.sg![0])!.e).toBe(6);
    expect(ok.state.mats!.doc).toBe(999 - 2);
    // 실패 (75%보다 큼) → 그대로, 연속 실패 1
    const no = enhance(s, sgT(1), false, fixed(0.9));
    expect(no.result).toMatchObject({
      ok: false,
      from: 5,
      to: 5,
      dropped: false,
    });
    expect(decodeSg(no.state.sg![0])!.f).toBe(1);
    // 0.78은 75%면 실패지만 실패 1번 뒤(80%)면 성공
    expect(enhance(no.state, sgT(1), false, fixed(0.78)).result.ok).toBe(true);
    expect(decodeSg(enhance(no.state, sgT(1), false, fixed(0.78)).state.sg![0])!.f).toBe(0);
  });

  it("+11부터 실패하면 한 단계 내려간다 (+10에서 +11 실패는 그대로), 보호 문서는 막고 한 장 쓴다, 깨지지 않는다", () => {
    expect(enhance(withSg(item({ e: 10 })), sgT(1), false, fixed(0.99)).result.to).toBe(10);
    const r = enhance(withSg(item({ e: 12 })), sgT(1), false, fixed(0.99));
    expect(r.result).toMatchObject({
      ok: false,
      from: 12,
      to: 11,
      dropped: true,
    });
    const p = enhance(withSg(item({ e: 12 })), sgT(1), true, fixed(0.99));
    expect(p.result).toMatchObject({ ok: false, to: 12, saved: true });
    expect(p.state.mats!.prot).toBe(2);
    // 보호 문서가 없으면 쓸 수 없다
    expect(() => enhance(withSg(item({ e: 12 }), { mats: { doc: 99, seal: 9, prot: 0 } }), sgT(1), true, fixed(0.5))).toThrow(/보호 문서/);
    // 재료가 모자라면 거절 (+11부터 인감 도장)
    expect(() => enhance(withSg(item({ e: 10 }), { mats: { doc: 99, seal: 0, prot: 0 } }), sgT(1), false, fixed(0.1))).toThrow(/인감 도장/);
    expect(() => enhance(withSg(item({ e: 15 })), sgT(1), false, fixed(0.1))).toThrow(/\+15/);
  });

  it("처음 +15: 칭호 기록·장비마다 한 번 확성기", () => {
    const r = enhance(withSg(item({ e: 14 })), sgT(1), false, fixed(0.01));
    expect(r.result).toMatchObject({ to: 15, reached15: true, announce: true });
    expect(r.state.enhMax).toBe(15);
    const again = enhance(withSg(item({ e: 14 }), { enhMax: 15, sg15: [1] }), sgT(1), false, fixed(0.01));
    expect(again.result).toMatchObject({ reached15: false, announce: false });
  });

  it("상점 장비는 한 개씩 따로 +5까지: 묶음에서 떼어 낸 한 개만, 낀 칸은 그 한 개를 가리킨다", () => {
    let s = char({ inv: { w_stamp: 1 }, equip: { ...empty, weapon: "w_stamp" } });
    const first = enhance(s, { shop: "w_stamp" }, false, fixed(0));
    s = first.state;
    const u = first.result.piece!;
    for (let i = 0; i < 4; i++) s = enhance(s, { piece: u }, false, fixed(0)).state;
    expect(s.inv.w_stamp).toBeUndefined();
    expect(s.si).toEqual([`w_stamp+5@${u.toString(36)}.0`]);
    expect(s.equip.weapon).toBe(s.si![0]);
    expect(() => enhance(s, { piece: u }, false, fixed(0))).toThrow(/\+5/);
    // 다시 읽어도 그대로 (normalize가 장착 칸을 원본에 맞춘다)
    expect(normalize(JSON.parse(JSON.stringify(s))).equip.weapon).toBe(s.si![0]);
  });

  it("같은 장신구 두 개를 끼고 하나만 강화하면 그것만 오른다", () => {
    let s = char({ inv: { c_bonus: 2 }, equip: { ...empty, acc1: "c_bonus", acc2: "c_bonus" } });
    s = enhance(s, { shop: "c_bonus" }, false, fixed(0)).state;
    expect(s.inv.c_bonus).toBe(1);
    expect(shopPieceOf(s.equip.acc1)?.e).toBe(1);
    expect(s.equip.acc2).toBe("c_bonus");
    const d = derive(50, baseStats(), s.equip);
    const plain = derive(50, baseStats(), { ...empty, acc1: "c_bonus", acc2: "c_bonus" });
    expect(d.crit).toBeGreaterThan(plain.crit);
    // 두 번째도 따로
    s = enhance(s, { shop: "c_bonus" }, false, fixed(0)).state;
    expect(s.inv.c_bonus).toBeUndefined();
    expect(s.si).toHaveLength(2);
    expect(shopPieceOf(s.equip.acc2)?.e).toBe(1);
    expect(shopPieceOf(s.equip.acc1)!.u).not.toBe(shopPieceOf(s.equip.acc2)!.u);
  });

  it("예전 저장값(장비 id마다 붙던 강화)은 한 개에만 옮긴다", () => {
    const s = normalize({ level: 50, inv: { c_bonus: 2 }, enh: { c_bonus: 3 }, enhF: { c_bonus: 1 }, equip: { ...empty, acc1: "c_bonus+3", acc2: "c_bonus+3" } });
    expect(s.inv.c_bonus).toBe(1);
    expect(s.si).toHaveLength(1);
    expect(shopPieceOf(s.si![0])).toMatchObject({ id: "c_bonus", e: 3, f: 1 });
    expect(s.equip.acc1).toBe(s.si![0]);
    expect(s.equip.acc2).toBe("c_bonus");
    expect(s.enh).toBeUndefined();
    // 두 번 읽어도 같다
    expect(normalize(JSON.parse(JSON.stringify(s)))).toMatchObject({ si: s.si, inv: { c_bonus: 1 } });
  });

  it("강화한 한 개 팔기: 그 한 개만 빠지고, 낀 것은 못 판다", () => {
    let s = char({ inv: { c_bonus: 2 }, bought: { c_bonus: 2 }, equip: { ...empty } });
    s = enhance(s, { shop: "c_bonus" }, false, fixed(0)).state;
    const u = shopPieceOf(s.si![0])!.u;
    const r = removePieceForSale(s, u);
    expect(r.state.si).toEqual([]);
    expect(r.state.inv.c_bonus).toBe(1);
    expect(r.bought).toBe(1);
    expect(r.unit).toBe(sellValue(gearById("c_bonus")!.price));
    expect(() => removePieceForSale(equipSg(s, "acc1", u), u)).toThrow(/장착 중/);
  });

  it("강화가 능력치에 그대로 들어간다 (+5 vs +0: 공격력·방어)", () => {
    const st = baseStats();
    const w0 = derive(50, st, { ...empty, weapon: encodeSg(item({ e: 0, o: [] })) });
    const w5 = derive(50, st, { ...empty, weapon: encodeSg(item({ e: 5, o: [] })) });
    // 무기 공격력 +83 (207 × 0.4 올림) + STR 7 → 10 몫
    expect(w5.atk - w0.atk).toBe(Math.ceil(207 * 0.4) + 3 * 3);
    const a0 = derive(50, st, { ...empty, armor: "a_hazmat" });
    const a5 = derive(50, st, { ...empty, armor: "a_hazmat+5@b.0" });
    expect(a5.def).toBeGreaterThan(a0.def);
    expect(unenhanced({ weapon: encodeSg(item({ e: 9 })), armor: "a_hazmat+5@b.0" })).toEqual({ weapon: encodeSg(item({ e: 0 })), armor: "a_hazmat" });
  });

  it("10만 번 모의: +15 평균 약 93번 시도 (기획 표와 같은 규칙)", () => {
    const r = seeded(5);
    let tries = 0;
    const N = 3000;
    for (let n = 0; n < N; n++) {
      let s = withSg(item({ e: 0 }));
      while (decodeSg(s.sg![0])!.e < 15) {
        s = enhance(s, sgT(1), false, r).state;
        s.mats = { doc: 9999, seal: 999, prot: 0 };
        tries++;
      }
    }
    expect(tries / N).toBeGreaterThan(80);
    expect(tries / N).toBeLessThan(106);
  }, 30_000);
});

describe("옵션 굴리기·바꾸기·분해", () => {
  it("비용 150 → 두 배씩 → 2,400에서 멈춤 + 결재 서류 3, 고정하면 인감 도장 2", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(rerollCost)).toEqual([150, 300, 600, 1200, 2400, 2400, 2400]);
    const s = char({
      sg: [encodeSg(item({ L: 3 }))],
      mats: { doc: 10, seal: 2, prot: 0 },
    });
    const r = reroll(s, 1, "c", seeded(3));
    const it = decodeSg(r.state.sg![0])!;
    expect(it.o.find(([k]) => k === "c")).toEqual(["c", 5]);
    expect(it.rr).toBe(1);
    expect(r.cost).toBe(150);
    expect(r.state.mats).toMatchObject({ doc: 7, seal: 0 });
    // 전설 고정
    const L = reroll(s, 1, "L", seeded(4));
    expect(decodeSg(L.state.sg![0])!.L).toBe(3);
    expect(() => reroll(char({ sg: [encodeSg(item())], mats: { doc: 2, seal: 0, prot: 0 } }), 1, null, seeded(1))).toThrow(/결재 서류/);
  });

  it("바꾸기: 같은 직급 3개(무기 5개) → 고른 세트·부위, 장착 중인 것은 못 낸다", () => {
    const codes = [1, 2, 3, 4, 5].map((u) => encodeSg(item({ u, p: 1, g: 2, o: [["h", 7]] })));
    const s = char({ sg: codes, sgN: 6 });
    const r = exchange(s, [1, 2, 3], 2, 3, seeded(1));
    expect(r.state.sg).toHaveLength(3);
    const got = decodeSg(r.result.code)!;
    expect(got).toMatchObject({ s: 2, p: 3, g: 2, u: 6, e: 0 });
    expect(() => exchange(s, [1, 2, 3], 2, 0, seeded(1))).toThrow(/무기는/);
    expect(exchange(s, [1, 2, 3, 4, 5], 0, 0, seeded(1)).state.sg).toHaveLength(1);
    const mixed = char({
      sg: [...codes.slice(0, 2), encodeSg(item({ u: 9, p: 1, g: 1, o: [["h", 5]] }))],
    });
    expect(() => exchange(mixed, [1, 2, 9], 0, 1, seeded(1))).toThrow(/같은 직급/);
    const worn = equipSg(s, "armor", 1);
    expect(() => exchange(worn, [1, 2, 3], 0, 1, seeded(1))).toThrow(/장착 중/);
  });

  it("분해: 사원 10 · 대리 20 · 과장 30+도장 1 · 임원 40+도장 3", () => {
    expect(DISASSEMBLE).toEqual([
      { doc: 10, seal: 0 },
      { doc: 20, seal: 0 },
      { doc: 30, seal: 1 },
      { doc: 40, seal: 3 },
    ]);
    const s = char({
      sg: [encodeSg(item({ u: 1, g: 3 })), encodeSg(item({ u: 2, g: 2, o: [["a", 6]] }))],
    });
    const r = disassemble(s, [1, 2]);
    expect(r.result).toEqual({ doc: 70, seal: 4 });
    expect(r.state.sg).toEqual([]);
    expect(r.state.mats).toMatchObject({ doc: 70, seal: 4 });
  });

  it("상자 드롭 넣기: 새 번호, 가방(60)이 가득 차면 그 자리에서 분해해 재료로", () => {
    const d: Drop[] = [
      { kind: "set", id: "s003.a7c5d18", qty: 1 },
      { kind: "mat", id: "m_doc", qty: 4 },
      { kind: "potion", id: "p_coffee", qty: 1 },
    ];
    const r = grantSgDrops(char({ sgN: 10 }), d);
    expect(decodeSg(r.state.sg![0])!.u).toBe(10);
    expect(r.state.sgN).toBe(11);
    expect(r.state.mats!.doc).toBe(4);
    expect(r.drops).toHaveLength(3);
    const full = char({
      sg: Array.from({ length: SG_INV_MAX }, (_, i) => encodeSg(item({ u: i + 1 }))),
    });
    const f = grantSgDrops(full, d);
    expect(f.state.sg).toHaveLength(SG_INV_MAX);
    expect(f.state.mats).toMatchObject({ doc: 4 + 40, seal: 3 });
    expect(f.drops.filter((x) => x.kind === "set")).toHaveLength(0);
  });

  it("끼기: 부위·레벨 검사, 다른 칸에 낀 같은 장비는 옮긴다, 4세트 처음 완성 기록", () => {
    const codes = [0, 1, 2, 3].map((p) =>
      encodeSg(
        item({
          u: p + 1,
          p,
          o: p === 1 ? [["h", 9]] : p === 2 ? [["m", 5]] : [["a", 7]],
        }),
      ),
    );
    let s = char({ sg: codes });
    expect(() => equipSg(s, "armor", 1)).toThrow(/칸/);
    expect(() => equipSg(char({ sg: codes, level: 49 }), "weapon", 1)).toThrow(/레벨 50/);
    s = equipSg(s, "weapon", 1);
    s = equipSg(s, "armor", 2);
    s = equipSg(s, "head", 3);
    s = equipSg(s, "acc1", 4);
    expect(s.sgDone).toBe(1);
    s = equipSg(s, "acc2", 4);
    expect(s.equip.acc1).toBeNull();
    expect(equippedSg(s.equip)).toHaveLength(4);
    // 가방에서 사라진 장비는 장착 칸에서도 빠진다
    expect(syncEquip(s.equip, codes.slice(1), []).weapon).toBeNull();
    // 코드를 조작한 장착 칸은 가방 것으로 되돌린다
    const forged = { ...s.equip, weapon: encodeSg(item({ u: 1, e: 15 })) };
    expect(normalize({ ...s, equip: forged }).equip.weapon).toBe(codes[0]);
  });
});
