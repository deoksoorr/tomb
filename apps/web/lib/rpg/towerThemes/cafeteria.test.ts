import { describe, expect, it } from "vitest";
import { HUNT_ZONES, MONSTERS, type MonsterId } from "../catalog";
import { huntSpawnable } from "../plan";
import { killRateCeiling } from "../rewards";
import { evalTower, MINION_FLOOR_ALLOW, towerClean, floorMinSec, isBossFloor, towerBlock, towerPlan } from "../tower";
import type { HuntResult } from "../types";
import { CF_BOSS, CF_BOSS_ROOM, CF_ELITE, CF_LOOPS, CF_PACKABLE, CF_POOL, CF_ROOMS, CF_ZONE, cfDish, cfRoom } from "./cafeteria";
import { CF_BIN_CAP, CF_JELLY_CAP, CF_SPECIAL_SERVERS, cfRiceAdds } from "./cafeteriaPlan";

// 11/15 구내식당: 몬스터 표, 층 계획(젤리·잔반통 상한·무리·밥솥 주먹밥 몫·특식 배식 도우미 몫), 서버 검증, 층마다 방

/** 1층부터 오르는 판들 중 구내식당 층 (판 시드·층·몇 번째 방문인지) — 100층 아래만 */
function cfFloors(seeds: number, upTo = 60): { seed: number; f: number; visit: number }[] {
  const out: { seed: number; f: number; visit: number }[] = [];
  for (let seed = 1; seed <= seeds; seed++)
    for (let f = 1; f <= upTo; f++) {
      const at = towerBlock(seed, 1, f);
      if (at.zone === CF_ZONE) out.push({ seed, f, visit: at.visit });
    }
  return out;
}
const FLOORS = cfFloors(80);

describe("구내식당 몬스터", () => {
  it("모두 새것 (cf_), 일반 10종 · 정예 · 우두머리 · 조각·졸개, 생김새가 겹치지 않는다", () => {
    expect(CF_POOL).toHaveLength(10);
    const ids = Object.keys(MONSTERS).filter((id) => id.startsWith("cf_")) as MonsterId[];
    expect(ids).toHaveLength(15);
    for (const id of [...CF_POOL, CF_ELITE, CF_BOSS, "cf_jelly_bit", "cf_riceball", "cf_server"] as MonsterId[]) expect(MONSTERS[id]).toBeDefined();
    expect(new Set(ids.map((id) => `${MONSTERS[id].size}-${MONSTERS[id].color}-${MONSTERS[id].accent}`)).size).toBe(15);
    expect(HUNT_ZONES[CF_ZONE].boss).toBe(CF_BOSS);
    expect(HUNT_ZONES[CF_ZONE].visits).toBe(CF_LOOPS);
  });

  it("판마다 구내식당이 나오는 블록이 다르고, 블록 다섯 층은 모두 구내식당", () => {
    expect(FLOORS.length).toBeGreaterThan(200);
    const firstBlocks = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const f = FLOORS.find((x) => x.seed === seed)?.f;
      if (f) firstBlocks.add(Math.floor((f - 1) / 5));
    }
    expect(firstBlocks.size).toBeGreaterThan(3);
    for (const { seed, f } of FLOORS.slice(0, 60)) {
      const b = Math.floor((f - 1) / 5) * 5;
      for (let k = 1; k <= 5; k++) expect(towerBlock(seed, 1, b + k).zone).toBe(CF_ZONE);
    }
  });
});

describe("구내식당 층 계획", () => {
  it("젤리는 한 층에 셋까지, 잔반통은 웨이브마다 하나까지, 무리는 몰려다니는 것만, 구성은 모두 cf_", () => {
    for (const { seed, f } of FLOORS) {
      const p = towerPlan(seed, f, 1);
      const all = p.flatMap((w) => w.monsters);
      expect(all.filter((m) => m === "cf_jelly").length).toBeLessThanOrEqual(CF_JELLY_CAP);
      for (const w of p) {
        expect(w.monsters.filter((m) => m === "cf_bin").length).toBeLessThanOrEqual(CF_BIN_CAP);
        if (w.pack) expect(CF_PACKABLE).toContain(w.monsters[w.monsters.length - 1]);
      }
      for (const m of all) expect(m.startsWith("cf_")).toBe(true);
    }
  });

  it("밥솥이 있는 웨이브는 주먹밥 몫, 우두머리 웨이브는 영양사 + 배식 도우미 몫", () => {
    let rice = 0;
    for (const { seed, f, visit } of FLOORS) {
      const p = towerPlan(seed, f, 1);
      for (const w of p) {
        const elite = w.elite !== undefined ? w.monsters[w.elite] : null;
        if (w.boss) {
          expect(w.monsters[0]).toBe(CF_BOSS);
          expect(w.summon).toEqual({ id: "cf_server", n: 3 });
          expect(w.adds).toEqual([{ id: "cf_server", n: CF_SPECIAL_SERVERS }]);
        } else if (elite === CF_ELITE) {
          rice++;
          expect(w.adds).toEqual([{ id: "cf_riceball", n: cfRiceAdds(visit) }]);
        } else expect(w.adds).toBeUndefined();
      }
      if (isBossFloor(f)) expect(p.at(-1)!.boss).toBe(true);
    }
    expect(rice).toBeGreaterThan(30);
  });

  it("출현 상한: 젤리 한 마리 = 조각 셋, 주먹밥·배식 도우미는 몫만큼", () => {
    for (const { seed, f } of FLOORS) {
      const p = towerPlan(seed, f, 1);
      const can = huntSpawnable(p, Infinity);
      const n = (id: MonsterId) => p.flatMap((w) => w.monsters).filter((m) => m === id).length;
      const adds = (id: MonsterId) => p.flatMap((w) => w.adds ?? []).filter((a) => a.id === id).reduce((k, a) => k + a.n, 0);
      expect(can.cf_jelly_bit ?? 0).toBe(n("cf_jelly") * 3);
      expect(can.cf_riceball ?? 0).toBe(adds("cf_riceball"));
      if (isBossFloor(f)) expect(can.cf_server).toBe(3 * 2 + CF_SPECIAL_SERVERS);
    }
  });

  it("한 층 처치 수도 최소 시간 안에서 처치 속도 상한 아래", () => {
    for (const { seed, f } of FLOORS) {
      const p = towerPlan(seed, f, 1);
      const total = Object.values(huntSpawnable(p, Infinity)).reduce((a, b) => a + (b ?? 0), 0);
      expect(total).toBeLessThanOrEqual(3 + floorMinSec(p) * killRateCeiling("hell", 50));
    }
  });
});

/** start층부터 floors층을 깬 결과 (계획·조각·불려 온 몬스터를 모두 잡았다) */
function climbAll(seed: number, start: number, floors: number): HuntResult {
  const kills: Partial<Record<MonsterId, number>> = {};
  let minSec = 0;
  for (let i = 0; i < floors; i++) {
    const p = towerPlan(seed, start + i, start);
    minSec += floorMinSec(p);
    for (const [id, n] of Object.entries(huntSpawnable(p, Infinity)) as [MonsterId, number][]) kills[id] = (kills[id] ?? 0) + n;
  }
  const ms = Math.round(minSec * 1000) + 1500;
  return { game: "hunt", durationMs: ms, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: ms };
}

describe("구내식당 서버 검증", () => {
  const runs = [...new Set(FLOORS.filter((x) => x.f <= 10).map((x) => x.seed))].slice(0, 25);
  it("구내식당이 든 판: 조각·주먹밥·배식 도우미까지 다 잡고 최소 시간에 오른 판도 통과 (Lv.50)", () => {
    expect(runs.length).toBeGreaterThan(5);
    for (const seed of runs) {
      const r = climbAll(seed, 1, 10);
      expect(towerClean(evalTower({ seed, level: 50, start: 1 }, r, r.durationMs + 500)), `seed ${seed}`).toBe(true);
    }
  });

  it("나올 수 없는 만큼 잡았다고 하면 거절 (주먹밥 · 젤리 조각 한 개 더)", () => {
    for (const seed of runs.slice(0, 8)) {
      const r = climbAll(seed, 1, 10);
      const next = huntSpawnable(towerPlan(seed, 11, 1), Infinity);
      for (const id of ["cf_riceball", "cf_jelly_bit", "cf_server"] as MonsterId[]) {
        const cheat = { ...r, kills: { ...r.kills, [id]: (r.kills[id] ?? 0) + (next[id] ?? 0) + 11 * MINION_FLOOR_ALLOW + 1 } };
        expect(towerClean(evalTower({ seed, level: 50, start: 1 }, cheat, r.durationMs + 500)), `${seed} ${id}`).toBe(false);
      }
    }
  });
});

describe("구내식당 방", () => {
  it("우두머리 층은 특식 배식대, 다섯 층 묶음의 보통 층 넷은 서로 다른 방 (판 시드 + 층)", () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const base of [0, 5, 25, 70]) {
        const rooms = [1, 2, 3, 4].map((k) => cfRoom(seed, base + k));
        expect(new Set(rooms).size).toBe(4);
        for (const r of rooms) expect(r).toBeLessThan(CF_ROOMS);
        expect(cfRoom(seed, base + 5)).toBe(CF_BOSS_ROOM);
        expect(cfRoom(seed, base + 2)).toBe(rooms[1]);
      }
    // 판이 다르면 같은 층도 다른 방이 나온다
    expect(new Set(Array.from({ length: 40 }, (_, i) => cfRoom(i + 1, 1))).size).toBeGreaterThan(4);
  });

  it("오늘의 메뉴는 층마다 바뀐다", () => {
    expect(new Set(Array.from({ length: 20 }, (_, i) => cfDish(i + 1))).size).toBeGreaterThan(6);
    expect(new Set([1, 11, 21, 31, 41, 51].map(cfDish)).size).toBeGreaterThan(3);
  });
});
