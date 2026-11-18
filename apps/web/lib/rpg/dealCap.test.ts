import { describe, expect, it } from "vitest";
import { baseStats } from "./formulas";
import { huntSpawnable, huntPlan } from "./plan";
import { evalTower, floorMinSec, towerClean, towerPlan } from "./tower";
import { evaluate } from "./rewards";
import { AOE_K, MARGIN, maxDealPerSec, minDealSec, planHp } from "./dealCap";
import { monsterStats } from "./formulas";
import { zoneFor, type MonsterId } from "./catalog";
import type { HuntResult } from "./types";
import { encodeSg, SG_PIECES, type SgItem } from "./setGear";
import { SKILLS } from "./skillTree";

// 11/18 「그 속도로 때릴 수 있나」 (보안 검토): 넣을 수 있는 최대 피해로도 못 깨는 속도면 의심 판, 정직하게 센 캐릭터는 늘 통과

/** start층부터 floors층을 층마다 perFloorSec초에 (깬 층 계획 몬스터·더 나오는 몫까지 다 잡음) */
function climb(seed: number, start: number, floors: number, perFloorSec: number): HuntResult {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++)
    for (const [id, n] of Object.entries(huntSpawnable(towerPlan(seed, start + i, start), Infinity)) as [MonsterId, number][]) kills[id] = (kills[id] ?? 0) + n;
  const ms = floors * perFloorSec * 1000;
  return { game: "hunt", durationMs: ms + 3_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: ms };
}
/** 깬 층 최소 시간 합 (초) — 위조하는 쪽이 고를 수 있는 가장 짧은 판 */
const minFloorsSec = (seed: number, start: number, floors: number) => {
  let s = 0;
  for (let i = 0; i < floors; i++) s += floorMinSec(towerPlan(seed, start + i, start));
  return s;
};
const deal = (v: ReturnType<typeof evalTower>) => (v.ok ? (v.suspect ?? []).filter((w) => w.startsWith("deal:")) : ["reject"]);

const NAKED = maxDealPerSec(50, { ...baseStats(), str: 99, dex: 60, luk: 60, agi: 40 }, {}, {});
const STRONG = maxDealPerSec(
  50,
  { ...baseStats(), str: 99, dex: 80, luk: 99, agi: 60, int: 40 },
  { weapon: "w_stamp", armor: "a_hazmat", head: "h_halo", acc1: "c_bonus", acc2: "c_bonus" },
  { em_hearth: 5 },
);

/** 실서버 상위권과 비슷한 구성: 야근 세트 5부위 임원(전설)급 +15, 공격 옵션, 스킬 트리 모두 찍음 */
const sg = (p: number): string => encodeSg({ s: 0, p, g: 3, u: p + 1, e: 15, o: [["a", 7], ["c", 5]], L: 1, rr: 0, f: 0 } satisfies SgItem);
const TOP_EQUIP = Object.fromEntries(SG_PIECES.map((slot, i) => [slot, sg(i)]));
const ALL_SKILLS = Object.fromEntries(SKILLS.map((d) => [d.id, d.maxLevel]));
const TOP = maxDealPerSec(50, { ...baseStats(), str: 99, dex: 70, luk: 70, agi: 60, int: 50 }, TOP_EQUIP, ALL_SKILLS);
/** 장비는 상점 최고, 스킬은 하나도 안 찍은 중간 구성 (맞는 카드 없이) */
const MID = maxDealPerSec(45, { ...baseStats(), str: 70, dex: 40, luk: 30, agi: 30 }, { weapon: "w_stamp", armor: "a_hazmat" }, {});

describe("최대 피해 (lib/rpg/dealCap)", () => {
  it("센 장비·능력치일수록 크고, 1 이상 정수", () => {
    expect(Number.isInteger(NAKED)).toBe(true);
    expect(NAKED).toBeGreaterThan(1);
    expect(STRONG).toBeGreaterThan(NAKED);
  });

  it("가장 빠른 시간은 체력에 비례하고 카드 배율만큼 짧아진다", () => {
    expect(minDealSec(2_000_000, 1000)).toBeCloseTo(2 * minDealSec(1_000_000, 1000));
    expect(minDealSec(1_000_000, 1000, 4)).toBeCloseTo(minDealSec(1_000_000, 1000) / 4);
  });
});

describe("야근 빌딩: 그 속도로 때릴 수 있나", () => {
  const seed = 9753;

  // 11/19 레이스형 곡선(100층까지 완만)으로 130층까지는 맨몸 최대 피해로도 닿는다 → 가팔라진 위층(200층)까지로 본다
  it("장비 없는 캐릭터가 200층을 층 최소 시간에 깼다고 하면 의심 판 (deal)", () => {
    const r = climb(seed, 1, 200, 0);
    const sec = minFloorsSec(seed, 1, 200);
    const fake = { ...r, durationMs: sec * 1000 + 2000, floorMs: sec * 1000 };
    const v = evalTower({ seed, level: 50, start: 1, dm: NAKED }, fake, fake.durationMs + 1000);
    expect(v.ok).toBe(true);
    expect(deal(v).length).toBe(1);
  });

  it("같은 판도 최대 피해를 모르는 옛 티켓이면 이 검사는 건너뛴다", () => {
    const r = climb(seed, 1, 200, 0);
    const sec = minFloorsSec(seed, 1, 200);
    const fake = { ...r, durationMs: sec * 1000 + 2000, floorMs: sec * 1000 };
    expect(deal(evalTower({ seed, level: 50, start: 1 }, fake, fake.durationMs + 1000))).toEqual([]);
  });

  it("센 캐릭터가 층마다 30초로 127층까지 올라도 통과 (정직한 기록이 걸리지 않게)", () => {
    const r = climb(seed, 1, 127, 30);
    expect(deal(evalTower({ seed, level: 50, start: 1, dm: STRONG, gp: 40 }, r, r.durationMs + 1000))).toEqual([]);
  });

  it("센 캐릭터가 낮은 층(1~40층)을 층 최소 시간에 가깝게 깨도 통과", () => {
    const sec = minFloorsSec(seed, 1, 40);
    const r = { ...climb(seed, 1, 40, 0), durationMs: sec * 1000 + 3000, floorMs: sec * 1000 };
    expect(deal(evalTower({ seed, level: 50, start: 1, dm: STRONG, gp: 40 }, r, r.durationMs + 1000))).toEqual([]);
  });

  it("11/18 상위권 구성(세트 +15·스킬 모두)이 여러 판을 층 최소 시간(사람이 낼 수 있는 가장 빠른 속도)으로 1~130층 올라도 통과 (카드 없이)", () => {
    expect(TOP).toBeGreaterThan(STRONG);
    for (const sd of [11, 222, 3333, 44_444, 98_765]) {
      const sec = minFloorsSec(sd, 1, 130);
      const r = { ...climb(sd, 1, 130, 0), durationMs: sec * 1000 + 3000, floorMs: sec * 1000 };
      expect(deal(evalTower({ seed: sd, level: 50, start: 1, dm: TOP, gp: 40 }, r, r.durationMs + 1000))).toEqual([]);
    }
  });

  it("11/18 중간 구성도 층마다 20초면 100층까지 통과 (카드 없이)", () => {
    for (const sd of [5, 77, 909]) {
      const r = climb(sd, 1, 100, 20);
      expect(deal(evalTower({ seed: sd, level: 45, start: 1, dm: MID }, r, r.durationMs + 1000))).toEqual([]);
    }
  });

  it("맨몸 캐릭터도 낮은 층을 보통 속도로 깨면 통과", () => {
    const r = climb(seed, 1, 10, 30);
    expect(towerClean(evalTower({ seed, level: 50, start: 1, dm: NAKED }, r, r.durationMs + 1000))).toBe(true);
  });
});

describe("사냥터 최단 클리어 랭킹", () => {
  const zone = zoneFor("hell");
  const plan = huntPlan(4242, "hell", zone.id);
  const kills: Partial<Record<MonsterId, number>> = {};
  for (const [id, n] of Object.entries(huntSpawnable(plan, Infinity)) as [MonsterId, number][]) kills[id] = n;
  const minSec = plan[plan.length - 1].earliestSec;
  const ticket = { game: "hunt" as const, difficulty: "hell" as const, seed: 4242, level: 50, st: { agi: 1, dex: 1, luk: 1 }, zone: zone.id, gp: 40 };
  const r = (ms: number): HuntResult => ({ game: "hunt", durationMs: ms, kills, wavesCleared: plan.length, died: false, potionsUsed: {} });
  const hp = planHp(plan, (id) => monsterStats(id, "hell", zone.power).maxHp);

  it("최대 피해로도 못 깨는 시간이면 랭킹 기록이 없다 (보상은 그대로)", () => {
    const tiny = Math.max(1, Math.floor(hp / ((minSec + 5) * AOE_K * MARGIN * 2)));
    const v = evaluate({ ...ticket, dm: tiny }, r((minSec + 5) * 1000), (minSec + 6) * 1000);
    expect(v.ok && v.hunt?.clearMs).toBe(null);
    expect(v.ok && v.points).toBeGreaterThan(0);
  });

  it("센 캐릭터는 그대로 기록된다", () => {
    const v = evaluate({ ...ticket, dm: STRONG }, r((minSec + 5) * 1000), (minSec + 6) * 1000);
    expect(v.ok && v.hunt?.clearMs).toBe((minSec + 5) * 1000);
  });

  it("서버가 잰 시간보다 90초 넘게 짧은 판(오래 멈춤)은 랭킹에서 뺀다", () => {
    const v = evaluate({ ...ticket, dm: STRONG }, r((minSec + 5) * 1000), (minSec + 5) * 1000 + 120_000);
    expect(v.ok && v.hunt?.clearMs).toBe(null);
  });
});
