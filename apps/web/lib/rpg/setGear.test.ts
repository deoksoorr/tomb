import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GEAR, gearById, type GearKind, type GearSlot } from "./catalog";
import { normalize, removePieceForSale, sellValue } from "./character";
import { ampNeed, disassemble, DISASSEMBLE, enhance, enhanceRate, ENHANCE_TABLE, ENH_AMP_MUL, ENH_AMP_TABLE, ENH_FAIL_MAX, ENH_PITY, equipSg, pityLeft, pityOf, exchange, grantSgDrops, reroll, rerollCost, type EnhTarget } from "./enhance";
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
  SG_ENH_MAX,
  SHOP_ENH_MAX,
  encodeShopPiece,
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
  CHEST_COSMETIC_CHANCE,
  chestDocs,
  chestSeals,
  CHEST_COSMETICS,
  cosTierOf,
  cosTierWeights,
  crossesTen,
  PROT_FROM_FLOOR,
  gearPower,
  nextPity,
  rollOptions,
  rollSgItem,
  sgGradeForFloor,
  SG_CHEST_CHANCE,
} from "./setGearRoll";
import { floorSeed, isChestFloor, TOWER_CHEST_FROM, towerChestDrops, towerChestFloors } from "./tower";

// 11/19 상자 층 경계는 상수에서 찾는다 (경계가 바뀌어도 그대로 통과하게)
const TOP = 400;
/** 1..TOP층에서 처음으로 pred가 참인 층 (없으면 null) */
const firstFloor = (pred: (f: number) => boolean): number | null => {
  for (let f = 1; f <= TOP; f++) if (pred(f)) return f;
  return null;
};
const monotone = (fn: (f: number) => number) => {
  for (let f = 2; f <= TOP; f++) if (fn(f) < fn(f - 1)) return false;
  return true;
};
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
  it("기본 = 지금 상점 최고 장비 × 직급 배율 (11/19 사원 1.0 · 대리 1.5 · 과장 2.0 · 임원 2.5, 임원급 무기 공격력 295)", () => {
    const top = (k: GearKind) => GEAR.filter((g) => g.kind === k).sort((a, b) => b.reqLevel - a.reqLevel)[0];
    // 무기는 공격력이 가장 높은 것 (11/21 마공 책 「연간 사업계획서」 Lv.47은 레벨이 더 높아도 공격력 100 — 세트 기준은 결재 도장 118)
    const topWeapon = GEAR.filter((g) => g.kind === "weapon").sort((a, b) => (b.bonus.atk ?? 0) - (a.bonus.atk ?? 0))[0];
    expect(topWeapon.id).toBe("w_stamp");
    expect(topWeapon.bonus.atk).toBe(118);
    expect(SG_BASE.armor).toEqual(top("armor").bonus);
    expect(SG_BASE.head).toEqual(top("head").bonus);
    expect(SG_BASE.acc).toEqual(top("acc").bonus);
    expect(SG_GRADE_MULT).toEqual([1.0, 1.5, 2.0, 2.5]);
    expect(sgDef(item({ g: 3 })).bonus.atk).toBe(295);
    expect(sgDef(item({ g: 0 })).bonus.atk).toBe(118);
    // 11/15 강화 배율: +1~+5 한 단계 8%p, +6~+10 12%p, +11~+15 20%p → +5 ×1.40 · +10 ×2.00 · +15 ×3.00 (옵션은 그대로)
    expect([0, 1, 5, 6, 10, 11, 15].map(enhMul)).toEqual([1, 1.08, 1.4, 1.52, 2, 2.2, 3]);
    expect(sgDef(item({ g: 0, e: 15 })).bonus.atk).toBe(118 * 3);
    expect(sgDef(item({ g: 0, e: 10 })).bonus.atk).toBe(118 * 2);
    // 작은 능력치도 한 단계마다 오른다 (올림): 치명 4 → +1에 5
    expect(sgDef(item({ g: 0, e: 1 })).bonus.crit).toBe(5);
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
    // 11/19 상점 장비는 +SHOP_ENH_MAX까지 (그 위는 없는 코드)
    expect(gearById(`w_stamp+${SHOP_ENH_MAX}`)).toBeDefined();
    expect(gearById(`w_stamp+${SHOP_ENH_MAX + 1}`)).toBeUndefined();
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
  it("직급은 층으로: 높이 오를수록 사원 → 대리 → 과장 → 임원 (경계는 sgGradeForFloor)", () => {
    expect(monotone(sgGradeForFloor)).toBe(true);
    const firsts = ([0, 1, 2, 3] as const).map((g) => firstFloor((f) => sgGradeForFloor(f) === g));
    expect(firsts.every((f) => f !== null)).toBe(true);
    expect(firsts).toEqual([...firsts].sort((a, b) => a! - b!));
    // 상자가 처음 열리는 층은 사원급
    expect(sgGradeForFloor(TOWER_CHEST_FROM)).toBe(0);
  });

  it("상자마다 결재 서류 2 + 층÷10, 인감 도장은 높은 층부터 1개·2개 (경계는 chestSeals) · 꾸미기 일반 장비 대신 세트 장비", () => {
    expect([5, 10, 25, 50, 95].map(chestDocs)).toEqual([2, 3, 4, 7, 11]);
    expect(monotone(chestSeals)).toBe(true);
    const s1 = firstFloor((f) => chestSeals(f) >= 1)!;
    const s2 = firstFloor((f) => chestSeals(f) >= 2)!;
    expect(s1).not.toBeNull();
    expect(s2).toBeGreaterThan(s1);
    expect([s1 - 1, s1, s2 - 1, s2].map(chestSeals)).toEqual([0, 1, 1, 2]);
    const d = towerChestDrops(1, s2, 1);
    expect(d.find((x) => x.id === "m_doc")?.qty).toBe(chestDocs(s2));
    expect(d.find((x) => x.id === "m_seal")?.qty).toBe(2);
    expect(towerChestDrops(1, s1 - 1, 1).some((x) => x.id === "m_seal")).toBe(false);
    expect(d.some((x) => x.kind === "gear")).toBe(false);
  });

  it("11/19 세트 장비는 약 2%, 천장 없음 — 판 안에서 굴린 것과 서버가 굴린 것이 같다", () => {
    let hits = 0;
    let n = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const floors = towerChestFloors(1, TOWER_CHEST_FROM + 100, 0);
      // 못 받은 수(pity)를 아무리 넘겨도 결과가 같다 (천장 없음)
      const game: Drop[][] = floors.map((f) => towerChestDrops(seed, f, 1, 0));
      const server = floors.map((f) => towerChestDrops(seed, f, 1, 999));
      expect(server).toEqual(game);
      for (const d of game) {
        n++;
        const set = d.find((x) => x.kind === "set");
        if (set) {
          hits++;
          expect(itemOfSpec(set.id, 1)).not.toBeNull();
        }
      }
    }
    expect(hits / n).toBeGreaterThan(SG_CHEST_CHANCE * 0.7);
    expect(hits / n).toBeLessThan(SG_CHEST_CHANCE * 1.3);
    // 상자 직급
    const at = (f: number) => {
      for (let seed = 1; ; seed++) {
        const s = towerChestDrops(seed, f, 1, 0, true).find((x) => x.kind === "set");
        if (s) return itemOfSpec(s.id, 1)!.g;
      }
    };
    const firsts = ([0, 1, 2, 3] as const).map((g) => firstFloor((f) => isChestFloor(f) && sgGradeForFloor(f) === g)!);
    expect(firsts.map(at)).toEqual([0, 1, 2, 3]);
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

describe("상자 꾸미기 (CHEST_COSMETIC_CHANCE, 층별 등급·랜덤 일수)", () => {
  it("후보는 상점 캐릭터 꾸미기 (닉네임·펫 빼고), 층 구간마다 비율이 0인 등급은 안 나오고 전설은 비율대로 (경계는 cosTierWeights)", () => {
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
    // 구간마다 (비율이 바뀌는 첫 층) 비율이 0인 등급은 나오지 않는다
    const bands: number[] = [];
    for (let f = TOWER_CHEST_FROM; f <= TOP; f++) if (f === TOWER_CHEST_FROM || cosTierWeights(f).join() !== cosTierWeights(f - 1).join()) bands.push(f);
    for (const f of bands) {
      const w = cosTierWeights(f);
      expect(roll(f, 2000).every((d) => w[tier(d)] > 0), `${f}층`).toBe(true);
    }
    // 전설이 나오는 첫 구간: 비율대로
    const legF = firstFloor((f) => cosTierWeights(f)[3] > 0)!;
    expect(legF).not.toBeNull();
    const lw = cosTierWeights(legF);
    const legShare = lw[3] / lw.reduce((a, b) => a + b, 0);
    const hi = roll(legF, 6000);
    const leg = hi.filter((d) => tier(d) === 3).length / hi.length;
    expect(leg).toBeGreaterThan(legShare * 0.5);
    expect(leg).toBeLessThan(legShare * 1.7);
    // 일수: 1일 45 · 3일 30 · 7일 20 · 30일 5, 전설은 30일 없음
    const days = (k: number) => hi.filter((d) => d.days === k).length / hi.length;
    expect(days(1)).toBeCloseTo(0.45, 1);
    expect(days(3)).toBeCloseTo(0.3, 1);
    expect(days(7)).toBeCloseTo(0.2, 1);
    expect(days(30)).toBeGreaterThan(0.02);
    expect(hi.filter((d) => tier(d) === 3).every((d) => d.days !== 30)).toBe(true);
    // 보통 굴림은 CHEST_COSMETIC_CHANCE
    let got = 0;
    for (let i = 1; i <= 20000; i++) if (chestCosmetic(floorSeed(i, legF), legF)) got++;
    expect(got / 20000).toBeGreaterThan(CHEST_COSMETIC_CHANCE * 0.8);
    expect(got / 20000).toBeLessThan(CHEST_COSMETIC_CHANCE * 1.2);
  });

  it("보호 문서: 이번 주 최고 층이 PROT_FROM_FLOOR층부터 10층 단위를 새로 넘을 때 (11/19)", () => {
    const P = PROT_FROM_FLOOR;
    const tenUp = Math.ceil(P / 10) * 10;
    if (P > 10) expect(crossesTen(0, 10)).toBe(false);
    expect(crossesTen(0, P - 1)).toBe(false);
    expect(crossesTen(0, P)).toBe(true);
    expect(crossesTen(tenUp + 2, tenUp + 9)).toBe(false);
    expect(crossesTen(tenUp + 9, tenUp + 21)).toBe(true);
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

  it("표대로: 확률·포인트·재료, 성공하면 +1, 실패하면 연속 실패 +1 (성공하면 0) — 11/19 일반 MMORPG처럼", () => {
    const rows = ENHANCE_TABLE.slice(1);
    // 11/19: 확률은 단계마다 같거나 내려가고(+1만 100%), 비용은 단계마다 오른다. 높은 단계는 한 자릿수 %
    expect(ENHANCE_TABLE[1].rate).toBe(1);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].rate).toBeLessThanOrEqual(rows[i - 1].rate);
      expect(rows[i].cost).toBeGreaterThan(rows[i - 1].cost);
    }
    expect(ENHANCE_TABLE[15].rate).toBeLessThan(0.1);
    expect(ENHANCE_TABLE[10].rate).toBeLessThan(0.5);
    // 재료(결재 서류·인감 도장)는 그대로
    expect(rows.map((r) => r.doc)).toEqual([0, 0, 0, 0, 0, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rows.map((r) => r.seal)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2]);
    // 11/20 실패마다 오르던 확률(+3%p)은 없다 — 표 그대로
    expect(enhanceRate(15)).toBe(ENHANCE_TABLE[15].rate);
    const s = withSg(item({ e: 5 }));
    const r6 = ENHANCE_TABLE[6];
    const ok = enhance(s, sgT(1), false, fixed(r6.rate / 2));
    expect(ok.cost).toBe(r6.cost);
    expect(ok.result).toMatchObject({ ok: true, from: 5, to: 6, amp: 0, sure: false, fails: 0 });
    expect(decodeSg(ok.state.sg![0])!.e).toBe(6);
    expect(ok.state.mats!.doc).toBe(999 - r6.doc);
    expect(ok.state.mats!.prot).toBe(3);
    const no = enhance(s, sgT(1), false, fixed(0.99));
    expect(no.result).toMatchObject({ ok: false, from: 5, to: 5, fails: 1 });
    expect(decodeSg(no.state.sg![0])!.f).toBe(1);
    // 성공하면 연속 실패 0
    expect(decodeSg(enhance(no.state, sgT(1), false, fixed(0)).state.sg![0])!.f).toBe(0);
  });

  it("11/20 실패해도 단계는 그대로 (모든 단계, 세트 장비·상점 장비) — 깨지거나 내려가지 않는다", () => {
    for (let e = 0; e < SG_ENH_MAX; e++) {
      const r = enhance(withSg(item({ e })), sgT(1), false, fixed(0.999999));
      if (ENHANCE_TABLE[e + 1].rate >= 1) continue;
      expect(r.result).toMatchObject({ ok: false, from: e, to: e });
      expect(decodeSg(r.state.sg![0])!.e).toBe(e);
      expect(r.state.sg).toHaveLength(1);
    }
    const shop = char({ si: [encodeShopPiece({ id: "w_stamp", e: 4, u: 7, f: 0 })], sgN: 8, mats: { doc: 99, seal: 9, prot: 0 } });
    const r = enhance(shop, { piece: 7 }, false, fixed(0.999999));
    expect(r.result).toMatchObject({ ok: false, from: 4, to: 4 });
    expect(shopPieceOf(r.state.si![0])).toMatchObject({ e: 4, f: 1 });
    // 재료가 모자라면 거절 (+11부터 인감 도장)
    expect(() => enhance(withSg(item({ e: 10 }), { mats: { doc: 99, seal: 0, prot: 0 } }), sgT(1), false, fixed(0.01))).toThrow(/인감 도장/);
    expect(() => enhance(withSg(item({ e: 15 })), sgT(1), false, fixed(0.01))).toThrow(/\+15/);
  });

  describe("11/20 강화 증폭권 (서버 판정)", () => {
    const amped = (e: number, prot = 99, f = 0) => withSg(item({ e, f }), { mats: { doc: 999, seal: 99, prot } });

    it("장수 정책: +1~+3 못 씀, +4~+6 1장, +7~+9 2장, +10~+12 3장, +13~+15 4장 · 배수 2 · 단계마다 안 줄어든다", () => {
      expect(ENH_AMP_MUL).toBe(2);
      expect(ENH_AMP_TABLE).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
      for (let t = 1; t <= SG_ENH_MAX; t++) expect(ampNeed(t)).toBe(ENH_AMP_TABLE[t]);
      for (let t = 2; t <= SG_ENH_MAX; t++) expect(ampNeed(t)).toBeGreaterThanOrEqual(ampNeed(t - 1));
    });

    it("성공 확률 2배, 100%에서 멈춘다 (쓸 수 없는 단계는 그대로)", () => {
      for (let t = 1; t <= SG_ENH_MAX; t++) {
        const base = ENHANCE_TABLE[t].rate;
        expect(enhanceRate(t)).toBe(base);
        expect(enhanceRate(t, true)).toBeCloseTo(ampNeed(t) ? Math.min(1, base * 2) : base, 10);
      }
      expect(enhanceRate(4, true)).toBe(1); // 65% → 130% → 100%
      expect(enhanceRate(5, true)).toBe(1); // 55% → 100%
      expect(enhanceRate(6, true)).toBeCloseTo(0.9);
      expect(enhanceRate(15, true)).toBeCloseTo(0.08);
    });

    it("경계: 같은 난수에서 증폭 없이는 실패, 증폭하면 성공 (단계마다) — 확률은 서버 표에서만", () => {
      for (let t = 4; t <= SG_ENH_MAX; t++) {
        const base = ENHANCE_TABLE[t].rate;
        const amp = enhanceRate(t, true);
        // 기본 확률과 증폭 확률 사이의 난수 (예: +8 32%면 0.48 → 기본 실패, 64%면 성공)
        const r = (base + amp) / 2;
        const plain = enhance(amped(t - 1), sgT(1), false, fixed(r));
        const boosted = enhance(amped(t - 1), sgT(1), true, fixed(r));
        expect(plain.result).toMatchObject({ ok: false, to: t - 1, amp: 0, rate: base });
        expect(boosted.result).toMatchObject({ ok: true, to: t, amp: ampNeed(t) });
        expect(boosted.result.rate).toBeCloseTo(amp, 10);
        // 증폭권은 정해진 장수만큼만 빠지고, 안 쓰면 그대로
        expect(boosted.state.mats!.prot).toBe(99 - ampNeed(t));
        expect(plain.state.mats!.prot).toBe(99);
        // 증폭 확률 바로 위 난수는 증폭해도 실패 (100%가 아닌 단계)
        if (amp < 1) expect(enhance(amped(t - 1), sgT(1), true, fixed(amp + 1e-9)).result.ok).toBe(false);
      }
      // 예: +10(20%) 난수 0.3 → 그냥은 실패, 증폭 40%면 성공
      expect(enhance(amped(9), sgT(1), false, fixed(0.3)).result.ok).toBe(false);
      expect(enhance(amped(9), sgT(1), true, fixed(0.3)).result.ok).toBe(true);
    });

    it("상한: 100%가 되는 단계는 난수가 1에 가까워도 성공", () => {
      for (const t of [4, 5]) expect(enhance(amped(t - 1), sgT(1), true, fixed(0.999999)).result).toMatchObject({ ok: true, rate: 1 });
    });

    it("모자라면 거절하고 아무것도 안 바뀐다, 못 쓰는 단계에 쓰면 거절", () => {
      expect(() => enhance(amped(9, 2), sgT(1), true, fixed(0))).toThrow(/강화 증폭권이 1장 모자라요/);
      expect(() => enhance(amped(14, 0), sgT(1), true, fixed(0))).toThrow(/4장 모자라요/);
      expect(() => enhance(amped(2), sgT(1), true, fixed(0))).toThrow(/쓸 수 없어요/);
      // 딱 맞게 있으면 0장이 된다
      expect(enhance(amped(9, 3), sgT(1), true, fixed(0.99)).state.mats!.prot).toBe(0);
    });

    it("증폭권을 쓴 실패도 연속 실패 한 번으로 센다", () => {
      const r = enhance(amped(12), sgT(1), true, fixed(0.99));
      expect(r.result).toMatchObject({ ok: false, to: 12, fails: 1, amp: ampNeed(13) });
      expect(decodeSg(r.state.sg![0])!.f).toBe(1);
    });
  });

  describe("11/20 천장 (같은 단계 연속 실패 → 다음은 반드시 성공)", () => {
    it("표 (같은 날 사용자 「약 2배로」): 단계가 높을수록 같거나 크고, 저장 상한(두 자리) 안", () => {
      expect(ENH_PITY).toEqual([0, 0, 2, 2, 4, 4, 6, 8, 10, 12, 16, 20, 26, 36, 56, 84]);
      for (let t = 2; t <= SG_ENH_MAX; t++) expect(pityOf(t)).toBeGreaterThanOrEqual(pityOf(t - 1));
      for (let t = 1; t <= SG_ENH_MAX; t++) expect(pityOf(t)).toBeLessThan(ENH_FAIL_MAX);
      expect(ENH_FAIL_MAX).toBeLessThanOrEqual(99);
      // 천장까지 갈 확률(정말 운이 나쁜 쪽)은 단계마다 5% 안
      for (let t = 2; t <= SG_ENH_MAX; t++) expect((1 - ENHANCE_TABLE[t].rate) ** pityOf(t)).toBeLessThan(0.05);
      expect(pityLeft(15, 0)).toBe(84);
      expect(pityLeft(15, 83)).toBe(1);
      expect(pityLeft(15, 84)).toBe(0);
      expect(pityLeft(15, 99)).toBe(0);
    });

    it("연속 실패는 50을 넘어 저장되고 코드로 다시 읽힌다 (+15 천장 84까지)", () => {
      const r = enhance(withSg(item({ e: 14, f: 60 }), { mats: { doc: 99, seal: 9, prot: 0 } }), sgT(1), false, fixed(0.999999));
      expect(r.result).toMatchObject({ ok: false, fails: 61, pityLeft: 23 });
      expect(decodeSg(r.state.sg![0])!.f).toBe(61);
      const cap = enhance(withSg(item({ e: 14, f: ENH_FAIL_MAX }), { mats: { doc: 99, seal: 9, prot: 0 } }), sgT(1), false, fixed(0.999999));
      expect(cap.result).toMatchObject({ ok: true, sure: true });
    });

    it("천장만큼 실패하면 난수와 상관없이 성공하고 0으로, 그 전까지는 단계 그대로", () => {
      for (const t of [6, 10, 15]) {
        let s = withSg(item({ e: t - 1 }), { mats: { doc: 9999, seal: 999, prot: 0 } });
        for (let i = 0; i < pityOf(t); i++) {
          const r = enhance(s, sgT(1), false, fixed(0.999999));
          expect(r.result).toMatchObject({ ok: false, to: t - 1, sure: false, fails: i + 1, pityLeft: pityOf(t) - i - 1 });
          s = r.state;
        }
        const last = enhance(s, sgT(1), false, fixed(0.999999));
        expect(last.result).toMatchObject({ ok: true, to: t, sure: true, rate: 1, fails: 0 });
        expect(decodeSg(last.state.sg![0])!.f).toBe(0);
        // 다음 단계 천장이 처음부터
        if (t < SG_ENH_MAX) expect(last.result.pityLeft).toBe(pityOf(t + 1));
      }
    });

    it("천장이면 증폭권을 체크해도 쓰지 않는다", () => {
      const s = withSg(item({ e: 9, f: pityOf(10) }), { mats: { doc: 99, seal: 9, prot: 5 } });
      const r = enhance(s, sgT(1), true, fixed(0.999999));
      expect(r.result).toMatchObject({ ok: true, sure: true, amp: 0 });
      expect(r.state.mats!.prot).toBe(5);
    });

    it("예전 저장값: 천장 카운터 없는 상점 장비 코드는 0, 옛 실패 수(최대 50)가 새 천장 이상이면 바로 성공", () => {
      // 연속 실패 기록(enhF)이 없던 예전 상점 장비 강화 → 0
      const mig = normalize({ level: 50, inv: { c_bonus: 1 }, enh: { c_bonus: 3 }, equip: { ...empty, acc1: "c_bonus+3" } });
      expect(shopPieceOf(mig.si![0])).toMatchObject({ e: 3, f: 0 });
      expect(pityLeft(4, shopPieceOf(mig.si![0])!.f)).toBe(pityOf(4));
      // +13 천장 36 ≤ 50 → 바로 성공, +15 천장 84 > 50 → 34번 남음
      const old = withSg(item({ e: 12, f: 50 }), { mats: { doc: 99, seal: 9, prot: 0 } });
      expect(enhance(old, sgT(1), false, fixed(0.999999)).result).toMatchObject({ ok: true, to: 13, sure: true });
      const old15 = withSg(item({ e: 14, f: 50 }), { mats: { doc: 99, seal: 9, prot: 0 } });
      expect(enhance(old15, sgT(1), false, fixed(0.999999)).result).toMatchObject({ ok: false, to: 14, fails: 51, pityLeft: 33 });
    });
  });

  it("처음 +15: 칭호 기록·장비마다 한 번 확성기", () => {
    const r = enhance(withSg(item({ e: 14 })), sgT(1), false, fixed(0.01));
    expect(r.result).toMatchObject({ to: 15, reached15: true, announce: true });
    expect(r.state.enhMax).toBe(15);
    const again = enhance(withSg(item({ e: 14 }), { enhMax: 15, sg15: [1] }), sgT(1), false, fixed(0.01));
    expect(again.result).toMatchObject({ reached15: false, announce: false });
  });

  it("상점 장비는 한 개씩 따로 +SHOP_ENH_MAX까지: 묶음에서 떼어 낸 한 개만, 낀 칸은 그 한 개를 가리킨다", () => {
    let s = char({ inv: { w_stamp: 1 }, equip: { ...empty, weapon: "w_stamp" }, mats: { doc: 999, seal: 99, prot: 0 } });
    const first = enhance(s, { shop: "w_stamp" }, false, fixed(0));
    s = first.state;
    const u = first.result.piece!;
    for (let i = 0; i < SHOP_ENH_MAX - 1; i++) s = enhance(s, { piece: u }, false, fixed(0)).state;
    expect(s.inv.w_stamp).toBeUndefined();
    expect(s.si).toEqual([`w_stamp+${SHOP_ENH_MAX}@${u.toString(36)}.0`]);
    expect(s.equip.weapon).toBe(s.si![0]);
    expect(() => enhance(s, { piece: u }, false, fixed(0))).toThrow(new RegExp(`\\+${SHOP_ENH_MAX}`));
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
    // 무기 공격력 +118 (295 × 0.4 올림) + STR 몫 (임원급 무기 STR 10 → 14)
    expect(w5.atk - w0.atk).toBe(Math.ceil(295 * 0.4) + 3 * 4);
    const a0 = derive(50, st, { ...empty, armor: "a_hazmat" });
    const a5 = derive(50, st, { ...empty, armor: "a_hazmat+5@b.0" });
    expect(a5.def).toBeGreaterThan(a0.def);
    expect(unenhanced({ weapon: encodeSg(item({ e: 9 })), armor: "a_hazmat+5@b.0" })).toEqual({ weapon: encodeSg(item({ e: 0 })), armor: "a_hazmat" });
  });

  it("모의(11/20): 단계마다 증폭 없음·있음 실측 성공률이 표(기본·2배·상한)와 ±1%p 안, 천장이 평균 시도 수를 줄인다", () => {
    const r = seeded(20261120);
    const N = 40_000;
    const lines: string[] = [];
    for (let t = 2; t <= SG_ENH_MAX; t++) {
      // 천장이 끼지 않게 연속 실패 0에서 한 번씩만 굴린다 (서버 판정 함수 enhance 그대로)
      const s0 = withSg(item({ e: t - 1 }), { mats: { doc: 99_999, seal: 9_999, prot: 99_999 } });
      let a = 0;
      let b = 0;
      for (let i = 0; i < N; i++) {
        if (enhance(s0, sgT(1), false, r).result.ok) a++;
        if (ampNeed(t) && enhance(s0, sgT(1), true, r).result.ok) b++;
      }
      expect(Math.abs(a / N - enhanceRate(t))).toBeLessThan(0.01);
      if (ampNeed(t)) expect(Math.abs(b / N - enhanceRate(t, true))).toBeLessThan(0.01);
      lines.push(`+${t} 기본 ${(enhanceRate(t) * 100).toFixed(0)}% 실측 ${((a / N) * 100).toFixed(2)}%` + (ampNeed(t) ? ` | 증폭 ${(enhanceRate(t, true) * 100).toFixed(0)}% 실측 ${((b / N) * 100).toFixed(2)}%` : ""));
    }
    // 천장: 같은 단계에서 성공까지 시도 수 — 실제 판정 평균이 계산값 Σ(1-p)^k (k=0..천장)과 맞고, 천장 없는 1/p보다 작다
    const tries: string[] = [];
    for (const t of [6, 10, 13, 15]) {
      const M = 10_000;
      const p = enhanceRate(t);
      const expectWith = (1 - (1 - p) ** (pityOf(t) + 1)) / p;
      let withPity = 0;
      let worst = 0;
      let hit = 0;
      for (let i = 0; i < M; i++) {
        let s = withSg(item({ e: t - 1 }), { mats: { doc: 99_999, seal: 9_999, prot: 0 } });
        let n = 0;
        let sure = false;
        while (decodeSg(s.sg![0])!.e < t) {
          const o = enhance(s, sgT(1), false, r);
          s = o.state;
          sure = o.result.sure;
          n++;
        }
        withPity += n;
        worst = Math.max(worst, n);
        if (sure) hit++;
      }
      expect(worst).toBeLessThanOrEqual(pityOf(t) + 1);
      expect(Math.abs(withPity / M - expectWith) / expectWith).toBeLessThan(0.04);
      expect(expectWith).toBeLessThan(1 / p);
      tries.push(
        `+${t} 천장 ${pityOf(t)}: 평균 ${(withPity / M).toFixed(2)}번 (계산 ${expectWith.toFixed(2)}, 천장 없으면 ${(1 / p).toFixed(2)}번), 천장에서 성공 ${((hit / M) * 100).toFixed(2)}% (계산 ${((1 - p) ** pityOf(t) * 100).toFixed(2)}%), 가장 많이 ${worst}번`,
      );
    }
    // ENH_REPORT=파일 경로를 주면 실측 표를 남긴다 (보고용)
    if (process.env.ENH_REPORT) writeFileSync(process.env.ENH_REPORT, [...lines, ...tries].join("\n"));
  }, 120_000);
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
