import { describe, expect, it } from "vitest";
import { encodeSg, type SgItem } from "@/lib/rpg/setGear";
import { SetGearRun, SG_FX, weaponGlow } from "./setGearRun";

// 11/15 세트 장비 싸움 효과 (4세트·전설 옵션·싸움 옵션)

const mk = (p: Partial<SgItem>): SgItem => ({
  s: 0,
  p: 0,
  g: 3,
  u: 1,
  e: 0,
  o: [],
  L: 0,
  rr: 0,
  f: 0,
  ...p,
});
const four = (s: number, extra: Partial<SgItem> = {}) => {
  const slots = ["weapon", "armor", "head", "acc1"] as const;
  return Object.fromEntries(slots.map((k, p) => [k, encodeSg(mk({ s, p, u: p + 1, ...(p === 0 ? extra : {}) }))]));
};

describe("세트 장비 싸움 효과", () => {
  it("장비가 없으면 아무것도 안 바뀐다", () => {
    const r = new SetGearRun({});
    expect(r.active).toBe(false);
    expect([
      r.atkMul(10, 100),
      r.aspdMul(0),
      r.hitMul(0, { crit: true, boss: true, hpRatio: 0.1, basic: true }),
      r.takenMul(0, 10, 100),
      r.potionMul(),
      r.cdMul(),
    ]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.saveFromDeath()).toBe(false);
    expect(r.killHeal(1000)).toBe(0);
  });

  it("야근 4세트: 체력 30% 아래 공격력 +25%·받는 피해 −10%", () => {
    const r = new SetGearRun(four(0));
    expect(r.atkMul(29, 100)).toBe(1.25);
    expect(r.atkMul(31, 100)).toBe(1);
    expect(r.takenMul(0, 20, 100)).toBeCloseTo(0.9);
  });

  it("결재 4세트: 치명타 뒤 3초 공속 +20% · 치명타 피해 옵션", () => {
    const r = new SetGearRun(four(1, { o: [["d", 18]] }));
    expect(r.aspdMul(100)).toBe(1);
    expect(r.hitMul(100, { crit: true, boss: false, hpRatio: 1, basic: true })).toBeCloseTo(1.68 / 1.5);
    expect(r.aspdMul(2000)).toBeCloseTo(1.2);
    expect(r.aspdMul(100 + SG_FX.approvalMs + 1)).toBe(1);
  });

  it("회의 4세트: 스킬을 쓰면 다음 스킬 재사용 −15% (옵션과 곱)", () => {
    const r = new SetGearRun(four(2, { p: 0, o: [] }));
    expect(r.cdMul()).toBe(1);
    expect(r.cdMul()).toBeCloseTo(0.85);
  });

  it("출장 4세트: 3초 안 맞으면 다음 기본 공격 +40% (한 번 휘두름의 여러 마리 모두), 맞으면 다시 3초", () => {
    const r = new SetGearRun(four(3));
    expect(r.hitMul(3000, { crit: false, boss: false, hpRatio: 1, basic: true })).toBeCloseTo(1.4);
    expect(r.hitMul(3000, { crit: false, boss: false, hpRatio: 1, basic: true })).toBeCloseTo(1.4);
    expect(r.hitMul(3500, { crit: false, boss: false, hpRatio: 1, basic: true })).toBe(1);
    r.takenMul(4000, 50, 100);
    expect(r.hitMul(6500, { crit: false, boss: false, hpRatio: 1, basic: true })).toBe(1);
    expect(r.hitMul(7000, { crit: false, boss: false, hpRatio: 1, basic: true })).toBeCloseTo(1.4);
  });

  it("전설 옵션: 결재 완료·칼퇴·연차(한 번)·야근 수당", () => {
    const eq = {
      weapon: encodeSg(mk({ L: 1, o: [["b", 12]] })),
      armor: encodeSg(mk({ p: 1, u: 2, L: 2 })),
      head: encodeSg(mk({ p: 2, u: 3, L: 3 })),
      acc1: encodeSg(mk({ p: 3, u: 4, L: 4, s: 1 })),
    };
    const r = new SetGearRun(eq);
    expect(r.hitMul(0, { crit: false, boss: true, hpRatio: 0.5, basic: false })).toBeCloseTo(1.12);
    expect(r.hitMul(0, { crit: false, boss: true, hpRatio: 0.2, basic: false })).toBeCloseTo(1.12 * 1.25);
    expect(r.aspdMul(19_000)).toBeCloseTo(1.3);
    expect(r.aspdMul(21_000)).toBe(1);
    expect(r.saveFromDeath()).toBe(true);
    expect(r.saveFromDeath()).toBe(false);
    expect(r.killHeal(1000)).toBe(10);
  });

  it("강화 무기 빛: +10 푸른 · +13 보랏 · +15 금 반짝임", () => {
    expect(weaponGlow(9)).toBeNull();
    expect(weaponGlow(10)?.color).toBe(0x4aa8ff);
    expect(weaponGlow(13)?.color).toBe(0xb070ff);
    expect(weaponGlow(15)).toMatchObject({ spark: true });
  });
});
