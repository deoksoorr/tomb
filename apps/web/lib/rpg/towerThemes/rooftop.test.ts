import { describe, expect, it } from "vitest";
import { MONSTERS, type MonsterId } from "../catalog";
import { huntSpawnable } from "../plan";
import { killRateCeiling } from "../rewards";
import { MONSTER_STATUS } from "../status";
import { evalTower, towerClean, floorMinSec, towerBlock, towerPlan } from "../tower";
import type { HuntResult } from "../types";
import { rfRoom } from "@/game/tower/themes/rooftopMap";
import { RF_BOSS, RF_BOSS_ROOM, RF_ELITE, RF_MONSTER_IDS, RF_PACKABLE, RF_POOL, RF_ROOMS, RF_VISITS, RF_ZONE, rfWeather } from "./rooftop";
import { RF_LEAK_CAP, RF_SPARK_CAP, rfVaneAdds } from "./rooftopPlan";

// 11/15 옥상 정원 폭풍: 몬스터 모양·순서표·층 계획 상한(누수·수탉 서류·무리)·서버 검증·방·날씨

type At = { seed: number; start: number; f: number; visit: number; pos: number };

/** 옥상이 나오는 층들 (시드 1..seeds, 시작 1·11층, 60층까지) */
function rfFloors(seeds: number): At[] {
  const out: At[] = [];
  for (let seed = 1; seed <= seeds; seed++)
    for (const start of [1, 11])
      for (let f = start; f < start + 60; f++) {
        const b = towerBlock(seed, start, f);
        if (b.zone === RF_ZONE) out.push({ seed, start, f, visit: b.visit, pos: b.pos });
      }
  return out;
}
const plan = (x: At) => towerPlan(x.seed, x.f, x.start);
const ids = (x: At) => new Set(plan(x).flatMap((w) => w.monsters));

describe("옥상 정원 폭풍: 몬스터", () => {
  it("열네 종 모두 다른 크기·색 조합, 일반 열 종 + 정예 + 우두머리, 우두머리는 50%·25%에 단계가 바뀐다", () => {
    expect(RF_MONSTER_IDS.length).toBe(14);
    expect(RF_POOL.length).toBe(10);
    expect(new Set(RF_MONSTER_IDS.map((id) => MONSTERS[id].color)).size).toBe(14);
    expect(new Set(RF_MONSTER_IDS.map((id) => `${MONSTERS[id].size}-${MONSTERS[id].accent}`)).size).toBe(14);
    expect(MONSTERS[RF_BOSS].behavior).toBe("boss");
    expect(MONSTERS[RF_BOSS].phases?.map((p) => p.below)).toEqual([0.5, 0.25]);
    expect(MONSTER_STATUS[RF_BOSS]).toBeDefined();
  });
});

describe("옥상 정원 폭풍: 층 계획", () => {
  const xs = rfFloors(60);

  it("처음 들른 블록 첫 층은 두 종, 두 번째로 들를 때까지 일반 열 종이 다 나온다", () => {
    expect(xs.some((x) => x.visit === 1)).toBe(true);
    for (const x of xs.filter((y) => y.visit === 0 && y.pos === 0)) expect([...ids(x)].sort()).toEqual(["rf_pigeon", "rf_umbrella"]);
    const seen = new Set<string>();
    for (const x of xs.filter((y) => y.visit <= 1)) for (const id of ids(x)) seen.add(id);
    for (const id of RF_POOL) expect(seen.has(id), id).toBe(true);
  });

  it("물탱크 누수는 한 층에 넷까지, 무리는 비둘기·서류만, 수탉 웨이브는 서류를 상한만큼 더 받는다", () => {
    let vanes = 0;
    for (const x of xs) {
      const p = plan(x);
      expect(p.flatMap((w) => w.monsters).filter((m) => m === "rf_leak").length).toBeLessThanOrEqual(RF_LEAK_CAP);
      for (const w of p) {
        if (w.pack) expect(RF_PACKABLE).toContain(w.monsters[w.monsters.length - 1]);
        if (w.elite !== undefined && w.monsters[w.elite] === RF_ELITE) {
          vanes++;
          expect(w.adds).toEqual([{ id: "rf_papers", n: rfVaneAdds(x.visit) }]);
        }
      }
      if (x.pos === 4) expect(p.at(-1)!.monsters[0]).toBe(RF_BOSS);
      if (x.pos === 3 && x.visit === 0) expect(p.some((w) => w.elite !== undefined && w.monsters[w.elite] === RF_ELITE)).toBe(true);
    }
    expect(vanes).toBeGreaterThan(5);
  });

  it("한 층에 나올 수 있는 처치 수(물방울·서류·불꽃 포함)는 최소 시간의 처치 속도 상한 아래", () => {
    for (const x of xs) {
      const p = plan(x);
      const total = Object.values(huntSpawnable(p, Infinity)).reduce((a, b) => a + (b ?? 0), 0);
      expect(total, `${x.seed}/${x.f}`).toBeLessThanOrEqual(3 + floorMinSec(p) * killRateCeiling("hell", 50));
    }
  });
});

/** start층부터 floors층을 깬 결과 (조각·불려 온 몬스터까지 다 잡았다) */
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

describe("옥상 정원 폭풍: 서버 검증", () => {
  it("첫 블록이 옥상인 판: 물방울·서류·불꽃까지 다 잡은 판은 통과, 서류를 몫보다 많이 잡았다고 하면 거절", () => {
    let seed = 1;
    while (towerBlock(seed, 1, 1).zone !== RF_ZONE) seed++;
    const r = climbAll(seed, 1, 5);
    expect((r.kills.rf_papers ?? 0) + (r.kills.rf_droplet ?? 0)).toBeGreaterThan(0);
    expect(towerClean(evalTower({ seed, level: 50, start: 1 }, r, r.durationMs + 500))).toBe(true);
    const next = huntSpawnable(towerPlan(seed, 6, 1), Infinity).rf_papers ?? 0;
    const cheat = { ...r, kills: { ...r.kills, rf_papers: (r.kills.rf_papers ?? 0) + next + 1 } };
    expect(towerClean(evalTower({ seed, level: 50, start: 1 }, cheat, r.durationMs + 500))).toBe(false);
    // 우두머리 불꽃: 체력 단계마다 부르는 몫(4 × 두 번, Arena) + 피뢰침이 따로 흩뿌리는 몫(RF_SPARK_CAP, 옥상 화면과 같은 상수)
    expect(huntSpawnable(towerPlan(seed, 5, 1), Infinity).rf_spark).toBe(8 + RF_SPARK_CAP);
  });
});

describe("옥상 정원 폭풍: 방·날씨", () => {
  it("블록의 보통 층 넷은 서로 다른 방, 우두머리 층은 피뢰침 탑, 판마다 다르다", () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      for (let b = 0; b < 6; b++) {
        const rooms = [1, 2, 3, 4].map((k) => rfRoom(seed, b * 5 + k));
        expect(new Set(rooms).size).toBe(4);
        for (const r of rooms) expect(r).toBeLessThan(RF_ROOMS);
        expect(rfRoom(seed, b * 5 + 5)).toBe(RF_BOSS_ROOM);
      }
      firsts.add(rfRoom(seed, 1));
    }
    expect(firsts.size).toBeGreaterThan(4);
  });

  it("다시 올 때마다 돌풍·벼락이 잦아지고, 세 번째부터 도시가 꺼진다", () => {
    const ws = RF_VISITS.map((_, v) => rfWeather(v));
    for (let v = 1; v < ws.length; v++) {
      expect(ws[v].gustEvery).toBeLessThanOrEqual(ws[v - 1].gustEvery);
      expect(ws[v].strikeEvery).toBeLessThan(ws[v - 1].strikeEvery);
    }
    expect(ws.map((w) => w.blackout)).toEqual([false, false, true, true]);
    expect(rfWeather(9)).toEqual(ws.at(-1));
  });
});
