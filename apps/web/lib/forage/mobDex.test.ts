import { describe, expect, it } from "vitest";
import { HUNT_ZONES, MONSTER_IDS, MONSTERS, TOWER_ZONE_IDS, ZONE_IDS } from "../rpg/catalog";
import { CONSTELLATIONS } from "../rpg/constellations";
import { DEX_CATS, DEX_NEW_REWARD, dexCatOf, dexIdsOf, dexRarityOf, dexRewardOf, SPECIES } from "./catalog";
import { MOB_DEX_IDS, MOB_GROUPS, MOB_KILLS_PER_RUN_MAX, mobKillItems, mobMarks, mobRarity, mobRole, mobWhere } from "./mobDex";

// 11/16 도감 몬스터 칸: 모든 몬스터가 한 칸씩, 사는 곳 묶음, 희귀도(처음 등록 보상), 처치 표시, 판 처치 기록 거르기

describe("몬스터 도감 칸", () => {
  it("모든 몬스터가 한 번씩, 다른 도감 칸 id와 겹치지 않는다", () => {
    expect(DEX_CATS).toContain("mob");
    expect(new Set(dexIdsOf("mob"))).toEqual(new Set(MONSTER_IDS));
    expect(dexIdsOf("mob")).toHaveLength(MONSTER_IDS.length);
    const others = new Set<string>([...SPECIES.map((s) => s.id), ...CONSTELLATIONS.map((c) => c.id)]);
    expect(MONSTER_IDS.filter((id) => others.has(id))).toEqual([]);
    for (const id of MONSTER_IDS) expect(dexCatOf(id), id).toBe("mob");
  });

  it("모든 몬스터가 사는 곳이 있고, 묶음은 사냥터 순서 → 야근 빌딩 테마 순서", () => {
    for (const id of MONSTER_IDS) expect(mobWhere(id).length, id).toBeGreaterThan(0);
    expect(MOB_GROUPS.flatMap((g) => g.ids)).toHaveLength(MONSTER_IDS.length);
    expect(MOB_DEX_IDS).toEqual(MOB_GROUPS.flatMap((g) => g.ids));
    const order = [...ZONE_IDS, ...TOWER_ZONE_IDS] as string[];
    const idx = MOB_GROUPS.map((g) => order.indexOf(g.zone));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    // 야근 빌딩 테마는 「야근 빌딩」 묶음
    for (const z of TOWER_ZONE_IDS) {
      const g = MOB_GROUPS.find((x) => x.zone === z)!;
      expect(g.tower).toBe(true);
      expect(g.name.startsWith("야근 빌딩 ")).toBe(true);
      expect(g.ids).toContain(HUNT_ZONES[z].boss);
    }
    // 테마 졸개(계획 밖에서 불려 나오는 것)도 그 테마에
    expect(MOB_GROUPS.find((g) => g.zone === "cf_cafeteria")!.ids).toContain("cf_riceball");
  });

  it("우두머리는 보통 몬스터보다 많이 받는다 (3~25P), 모든 사냥터 우두머리는 우두머리", () => {
    for (const z of [...ZONE_IDS, ...TOWER_ZONE_IDS]) expect(mobRole(HUNT_ZONES[z].boss), z).toBe("boss");
    for (const id of MONSTER_IDS) {
      const r = mobRarity(id);
      expect(dexRarityOf(id)).toBe(r);
      expect(dexRewardOf(id)).toBe(DEX_NEW_REWARD[r]);
      if (MONSTERS[id].behavior === "boss") expect(r, id).toBeGreaterThanOrEqual(3);
      if (MONSTERS[id].minion) expect(r, id).toBe(1);
    }
    expect(dexRewardOf("scope_creep")).toBe(DEX_NEW_REWARD[1]);
    expect(dexRewardOf("express_train")).toBe(DEX_NEW_REWARD[3]);
    expect(dexRewardOf("hr_chair")).toBe(DEX_NEW_REWARD[4]);
    expect(dexRewardOf("sv_legacy_system")).toBe(DEX_NEW_REWARD[4]);
    expect(Math.max(...MONSTER_IDS.map(dexRewardOf))).toBe(DEX_NEW_REWARD[4]);
  });

  it("처치 표시: 100·1,000·10,000마리", () => {
    expect(mobMarks(0)).toEqual({ reached: [], next: 100 });
    expect(mobMarks(99)).toEqual({ reached: [], next: 100 });
    expect(mobMarks(100)).toEqual({ reached: [100], next: 1_000 });
    expect(mobMarks(1_234)).toEqual({ reached: [100, 1_000], next: 10_000 });
    expect(mobMarks(10_000)).toEqual({ reached: [100, 1_000, 10_000], next: null });
  });

  it("판 처치 기록 거르기: 아는 몬스터 id만, 양의 정수만, 몬스터당 상한까지", () => {
    expect(mobKillItems({ scope_creep: 3, nope: 5, f_carp: 2, c_gym: 1, req_change: 0, prod_dragon: -2, legacy_golem: 2.7, sv_reboot: 1e9 })).toEqual([
      { id: "scope_creep", n: 3 },
      { id: "legacy_golem", n: 2 },
      { id: "sv_reboot", n: MOB_KILLS_PER_RUN_MAX },
    ]);
    expect(mobKillItems({})).toEqual([]);
  });
});
