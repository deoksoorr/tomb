import { describe, expect, it } from "vitest";
import { isShopListed, itemById, permanentPrice } from "@tomb/protocol";
import { isGiftItem } from "../gifts";
import { SUNKEN_POOL } from "../forage/sunken";
import { ShopBuySchema } from "../validate";
import { COSMETIC_DROPS } from "./catalog";
import { CHEST_COSMETICS } from "./setGearRoll";
import { METEOR_DAY_ROLLS, METEOR_ITEM_ID, METEOR_LEGEND_P, METEOR_P, METEOR_PITY, meteorChance, meteorOf, meteorProgress, meteorUnit, rollMeteor, type MeteorRun } from "./meteorDrop";

// 11/20 유성우 오라 얻는 규칙 (순수 함수)

const DAY = "20261120";
const NOW = 1_800_000_000_000;
/** 기본 확률로는 안 떨어지는 시드 · 기본으로는 안 되고 전설이면 떨어지는 시드 · 늘 떨어지는 시드 */
const seedWhere = (ok: (u: number) => boolean) => {
  for (let s = 1; s < 5_000_000; s++) if (ok(meteorUnit(s))) return s;
  throw new Error("시드 없음");
};
const MISS = seedWhere((u) => u > 0.5);
const LEGEND_ONLY = seedWhere((u) => u >= METEOR_P && u < METEOR_LEGEND_P);
const HIT = seedWhere((u) => u < METEOR_P);
const run = (o: Partial<MeteorRun> = {}): MeteorRun => ({ starry: true, done: 1, legend: false, day: DAY, seed: MISS, ...o });

describe("유성우 오라 굴림", () => {
  it("맑은 밤이 아닌 판은 굴리지 않는다 (진행도 그대로)", () => {
    const r = rollMeteor({ d: DAY, n: 3, p: 10 }, run({ starry: false, seed: HIT }), NOW);
    expect(r).toEqual({ mt: { d: DAY, n: 3, p: 10 }, rolled: false, win: false });
  });

  it("검증된 완성 별자리가 없는 판은 굴리지 않는다", () => {
    expect(rollMeteor(undefined, run({ done: 0, seed: HIT }), NOW)).toEqual({ mt: { n: 0, p: 0 }, rolled: false, win: false });
  });

  it("맑은 밤 + 완성 별자리 → 하루 수·천장 진행이 하나씩 오른다", () => {
    const r = rollMeteor(undefined, run(), NOW);
    expect(r).toEqual({ mt: { d: DAY, n: 1, p: 1 }, rolled: true, win: false });
  });

  it("하루 앞 15판까지만 굴리고, 날이 바뀌면 다시 센다 (천장 진행은 이어진다)", () => {
    let mt: unknown = undefined;
    for (let i = 0; i < METEOR_DAY_ROLLS; i++) {
      const r = rollMeteor(mt, run(), NOW);
      expect(r.rolled).toBe(true);
      mt = r.mt;
    }
    expect(mt).toEqual({ d: DAY, n: METEOR_DAY_ROLLS, p: METEOR_DAY_ROLLS });
    // 16번째 판은 확률이 있어도 굴리지 않는다
    expect(rollMeteor(mt, run({ seed: HIT }), NOW)).toEqual({ mt, rolled: false, win: false });
    const next = rollMeteor(mt, run({ day: "20261121" }), NOW);
    expect(next).toEqual({ mt: { d: "20261121", n: 1, p: METEOR_DAY_ROLLS + 1 }, rolled: true, win: false });
    expect(meteorProgress(mt, DAY)).toEqual({ got: false, left: METEOR_PITY - METEOR_DAY_ROLLS, todayLeft: 0 });
    expect(meteorProgress(mt, "20261121").todayLeft).toBe(METEOR_DAY_ROLLS);
  });

  it("굴린 판이 400번째가 되면 확정 (시드와 상관없이)", () => {
    const r = rollMeteor({ d: "20261119", n: 15, p: METEOR_PITY - 1 }, run({ seed: MISS }), NOW);
    expect(r).toEqual({ mt: { d: DAY, n: 1, p: METEOR_PITY, got: NOW }, rolled: true, win: true });
    expect(rollMeteor({ p: METEOR_PITY - 2, n: 0 }, run({ seed: MISS }), NOW).win).toBe(false);
  });

  it("이미 받았으면 더 굴리지 않는다", () => {
    const had = { d: DAY, n: 2, p: 120, got: NOW - 1 };
    expect(rollMeteor(had, run({ seed: HIT }), NOW)).toEqual({ mt: had, rolled: false, win: false });
    expect(meteorProgress(had, DAY).got).toBe(true);
  });

  it("기본 0.2%, 그 판에 전설 별자리를 완성했으면 0.8%", () => {
    expect(meteorChance(false)).toBe(0.002);
    expect(meteorChance(true)).toBe(0.008);
    expect(rollMeteor(undefined, run({ seed: HIT }), NOW).win).toBe(true);
    expect(rollMeteor(undefined, run({ seed: LEGEND_ONLY }), NOW).win).toBe(false);
    expect(rollMeteor(undefined, run({ seed: LEGEND_ONLY, legend: true }), NOW).win).toBe(true);
    // 드롭 시드 → 0..1이 고르게 퍼진다 (20만 개 시드에서 0.8% 아래 몫)
    let hit = 0;
    let base = 0;
    const N = 200_000;
    for (let s = 0; s < N; s++) {
      const u = meteorUnit(s * 7919 + 13);
      if (u < METEOR_LEGEND_P) hit++;
      if (u < METEOR_P) base++;
    }
    expect(hit / N).toBeGreaterThan(0.007);
    expect(hit / N).toBeLessThan(0.009);
    expect(base / N).toBeGreaterThan(0.0015);
    expect(base / N).toBeLessThan(0.0025);
  });

  it("개발용 force는 맑은 밤이 아니어도 확률 1 (완성 별자리·이미 가짐 조건은 그대로)", () => {
    expect(rollMeteor(undefined, run({ starry: false, force: true }), NOW).win).toBe(true);
    expect(rollMeteor(undefined, run({ done: 0, force: true }), NOW).rolled).toBe(false);
    expect(rollMeteor({ n: 0, p: 3, got: 1 }, run({ force: true }), NOW).rolled).toBe(false);
  });

  it("이상한 저장값은 0부터", () => {
    expect(meteorOf({ d: "x", n: 99, p: -3, got: "a" })).toEqual({ n: 0, p: 0 });
    expect(meteorOf({ d: DAY, n: 99, p: 9999 })).toEqual({ d: DAY, n: METEOR_DAY_ROLLS, p: METEOR_PITY });
  });
});

describe("유성우 오라 아이템", () => {
  it("전설 오라, 상점·영구 구매·물에 빠진 꾸미기·코디 드롭·상자·선물에서 빠진다", () => {
    const it = itemById(METEOR_ITEM_ID)!;
    expect(it).toMatchObject({ kind: "cosmetic", slot: "aura", grade: "legend", stargaze: true });
    expect(isShopListed(it)).toBe(false);
    expect(permanentPrice(METEOR_ITEM_ID)).toBeNull();
    expect(SUNKEN_POOL.some((i) => i.id === METEOR_ITEM_ID)).toBe(false);
    expect(COSMETIC_DROPS).not.toContain(METEOR_ITEM_ID);
    expect(CHEST_COSMETICS.some((i) => i.id === METEOR_ITEM_ID)).toBe(false);
    expect(isGiftItem(METEOR_ITEM_ID)).toBe(false);
    const buy = ShopBuySchema.safeParse({ itemId: METEOR_ITEM_ID });
    expect(buy.success).toBe(false);
    expect(JSON.stringify(buy.error?.issues)).toContain("망원경에서만");
  });
});
