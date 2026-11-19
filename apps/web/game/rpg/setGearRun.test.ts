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

  it("야근 4세트 (11/19 근접 생존): 늘 받는 피해 −8%, 체력 30% 아래 공격력 +25%·받는 피해 −15% 더", () => {
    const r = new SetGearRun(four(0));
    expect(r.atkMul(29, 100)).toBe(1.25);
    expect(r.atkMul(31, 100)).toBe(1);
    expect(r.takenMul(0, 50, 100)).toBeCloseTo(0.92);
    expect(r.takenMul(0, 20, 100)).toBeCloseTo(0.92 * 0.85);
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

  it("11/17 발동 표시: 연차는 버틴 순간, 결재 완료는 우두머리마다 30% 아래로 처음 떨어진 순간, 야근 4세트는 30% 위에서 아래로 떨어지는 순간", () => {
    const r = new SetGearRun({
      weapon: encodeSg(mk({ L: 1, g: 3 })),
      head: encodeSg(mk({ p: 2, u: 3, L: 3 })),
    });
    expect(r.takeProcs()).toEqual([]);
    const boss = {};
    r.hitMul(0, { crit: false, boss: true, hpRatio: 0.5, basic: false, who: boss });
    expect(r.takeProcs()).toEqual([]);
    r.hitMul(0, { crit: false, boss: true, hpRatio: 0.2, basic: false, who: boss });
    r.hitMul(0, { crit: false, boss: true, hpRatio: 0.1, basic: false, who: boss });
    expect(r.takeProcs()).toEqual(["bossLow"]);
    r.hitMul(0, { crit: false, boss: true, hpRatio: 0.1, basic: false, who: {} });
    expect(r.takeProcs()).toEqual(["bossLow"]);
    expect(r.saveFromDeath()).toBe(true);
    expect(r.saveFromDeath()).toBe(false);
    expect(r.takeProcs()).toEqual(["vacation"]);
    // 그림: 그 전설 옵션이 붙은 장비 (직급까지)
    expect(r.procIcon("vacation")).toEqual({ icon: { shape: "sg:023", main: 0, accent: 0 }, grade: 3 });
    expect(r.procIcon("bossLow")?.icon.shape).toBe("sg:003");

    const o = new SetGearRun(four(0));
    o.watch(80, 100);
    o.watch(25, 100);
    o.watch(20, 100);
    expect(o.takeProcs()).toEqual(["overtimeFour"]);
    o.watch(50, 100);
    o.watch(10, 100);
    expect(o.takeProcs()).toEqual(["overtimeFour"]);
    expect(o.procIcon("overtimeFour")?.icon.shape).toBe("sg:003");
    // 4세트가 아니면 아무것도
    const none = new SetGearRun({});
    none.watch(80, 100);
    none.watch(10, 100);
    expect(none.takeProcs()).toEqual([]);
    expect(none.procIcon("vacation")).toBeNull();
  });

  it("강화 무기 빛: +10 푸른 · +13 보랏 · +15 금 반짝임", () => {
    expect(weaponGlow(9)).toBeNull();
    expect(weaponGlow(10)?.color).toBe(0x4aa8ff);
    expect(weaponGlow(13)?.color).toBe(0xb070ff);
    expect(weaponGlow(15)).toMatchObject({ spark: true });
  });
});
