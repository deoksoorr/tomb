import { describe, expect, it } from "vitest";
import { COSMETIC_DROPS, GEAR, POTIONS } from "@/lib/rpg/catalog";
import { gearGrade } from "@/components/rpg/gear";
import { LOOT_MAX, lootLook, scatter, stackLabels, type LootTier } from "./lootLook";
import { lootSound } from "./lootSound";
import { soundEnd, soundSignature } from "./skillSound";

// 사냥터 바닥 드롭: 등급별 모양(단계가 오를수록 기둥이 굵고 높고 짙게), 흩뿌림·이름표 겹침 풀기, 합성음 설계.

const fixed = (seed = 1) => {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
};

describe("등급별 모양", () => {
  it("장비는 상점·가방과 같은 등급표를 따르고, 이름표 색도 같다", () => {
    for (const g of GEAR) {
      const l = lootLook({ kind: "gear", id: g.id })!;
      const grade = gearGrade(g);
      expect(l.grade).toBe(grade.label);
      expect(l.text).toBe(grade.color);
      expect(l.name).toBe(g.name);
      expect(l.tier).toBe({ common: 0, fine: 1, rare: 2, legend: 3 }[grade.id]);
    }
  });

  it("단계가 오를수록 기둥이 굵고 높고 짙으며 알갱이·맥동도 는다. 일반·물약은 기둥 없이 반짝임만", () => {
    const pick = (t: LootTier) => lootLook({ kind: "gear", id: GEAR.find((g) => lootLook({ kind: "gear", id: g.id })!.tier === t)!.id })!;
    const ls = ([0, 1, 2, 3] as const).map(pick);
    expect(ls[0].beamH).toBe(0);
    expect(ls[0].ringR).toBe(0);
    for (let i = 1; i < 4; i++) {
      expect(ls[i].beamH).toBeGreaterThan(ls[i - 1].beamH);
      expect(ls[i].beamW).toBeGreaterThan(ls[i - 1].beamW);
      expect(ls[i].beamA).toBeGreaterThan(ls[i - 1].beamA);
      expect(ls[i].motes).toBeGreaterThanOrEqual(ls[i - 1].motes);
      expect(ls[i].pulse).toBeGreaterThanOrEqual(ls[i - 1].pulse);
    }
    // 전설만 화면 가장자리 빛 + 알림 글자
    expect(ls.map((l) => l.edge)).toEqual([false, false, false, true]);
    expect(ls[3].notice).toBe("전설 장비!");
    for (const p of POTIONS) expect(lootLook({ kind: "potion", id: p.id })!.tier).toBe(0);
  });

  it("꾸미기 선물은 어떤 꾸미기인지 미리 말하지 않는다 (서버가 이미 가진 것이면 다음 후보로 바꾼다)", () => {
    const l = lootLook({ kind: "cosmetic", id: COSMETIC_DROPS[0] })!;
    expect(l.name).toBe("꾸미기 선물");
    expect(l.tier).toBe(2);
    expect(lootLook({ kind: "gear", id: "없는것" })).toBeNull();
  });
});

describe("흩뿌림·이름표", () => {
  it("여러 개가 떨어지면 서로 겹치지 않게 흩어진다", () => {
    for (let seed = 1; seed < 40; seed++) {
      const ps = scatter(LOOT_MAX, 200, 150, fixed(seed));
      expect(ps).toHaveLength(LOOT_MAX);
      for (let i = 0; i < ps.length; i++) {
        expect(Math.hypot(ps[i].x - 200, ps[i].y - 150)).toBeLessThan(60);
        for (let j = 0; j < i; j++) expect(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y)).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("겹치는 이름표는 위로 한 줄씩 올라가고, 안 겹치면 그대로", () => {
    const lift = stackLabels([
      { x: 100, y: 100, w: 40, h: 5 },
      { x: 110, y: 98, w: 40, h: 5 },
      { x: 300, y: 100, w: 40, h: 5 },
    ]);
    expect(lift[0]).toBe(0);
    expect(lift[1]).toBeGreaterThan(0);
    expect(lift[2]).toBe(0);
    // 올린 뒤에는 겹치지 않는다
    const top0 = 100 - 5;
    expect(98 - lift[1]).toBeLessThanOrEqual(top0);
  });
});

describe("드롭 소리", () => {
  const SOUNDS = ["plain", "fine", "rare", "gift", "legend"] as const;
  it("모든 사건에 소리가 있고 짧으며 음량이 넘치지 않는다", () => {
    for (const s of SOUNDS)
      for (const ev of ["pop", "land", "pick"] as const) {
        const ls = lootSound(ev, s);
        expect(ls.length, `${ev} ${s}`).toBeGreaterThan(0);
        expect(soundEnd(ls)).toBeLessThanOrEqual(2.2);
        for (const l of ls) {
          expect(l.gain).toBeGreaterThan(0);
          expect(l.gain).toBeLessThanOrEqual(0.4);
          expect(l.at).toBeGreaterThanOrEqual(0);
        }
      }
  });

  it("떨어지는 소리는 등급이 높을수록 겹이 많고 길며, 등급마다 다르다", () => {
    const land = (["plain", "fine", "rare", "legend"] as const).map((s) => lootSound("land", s));
    for (let i = 1; i < land.length; i++) {
      expect(land[i].length).toBeGreaterThan(land[i - 1].length);
      expect(soundEnd(land[i])).toBeGreaterThan(soundEnd(land[i - 1]));
    }
    expect(new Set(SOUNDS.map((s) => soundSignature(lootSound("land", s)))).size).toBe(SOUNDS.length);
    // 전설은 가장 낮은 울림을 깐다
    const low = (s: (typeof SOUNDS)[number]) => Math.min(...lootSound("land", s).map((l) => l.f1 ?? Infinity));
    expect(low("legend")).toBeLessThan(low("rare"));
  });
});
