import { describe, expect, it } from "vitest";
import { HUNT_ZONES, MONSTERS, type MonsterId } from "../catalog";
import { huntSpawnable } from "../plan";
import { evalTower, towerClean, floorMinSec, isBossFloor, TOWER_THEMES, towerBlock, towerPlan, towerZone, towerKillRate } from "../tower";
import type { HuntResult } from "../types";
import { PK_ALARM, PK_BOSS, PK_ELITE, PK_LOOPS, PK_POOL, PK_ROOMS, PK_BOSS_ROOM, PK_RUSH, PK_TICKET, PK_ZONE, pkLoop, pkPillarCode, pkRoom, pkTicketSlow } from "./parking";
import { PK_BARRIER_CAP, pkTowAdds } from "./parkingPlan";

// 11/15 지하 주차장: 테마 모음에 들어 있고, 층 계획(차단기 상한·무리·견인차 adds), 서버 검증(견인해 깨운 경보 차까지), 방·기믹 숫자의 경계

/** seed 판(시작 층 start)에서 주차장 층들 (앞에서부터 n블록까지 훑는다) */
function parkingFloors(seed: number, start = 1, blocks = 12): number[] {
  const out: number[] = [];
  for (let f = start; f < start + blocks * 5; f++) if (towerZone(seed, start, f).id === PK_ZONE) out.push(f);
  return out;
}

describe("지하 주차장: 테마와 몬스터", () => {
  it("테마 모음에 들어 있고 판마다 어디선가 나온다", () => {
    expect(TOWER_THEMES).toContain(PK_ZONE);
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) if (parkingFloors(seed).length) seen++;
    expect(seen).toBeGreaterThan(35);
    expect(HUNT_ZONES[PK_ZONE].visits).toBe(PK_LOOPS);
  });

  it("몬스터는 모두 새것 (pk_), 일반 10종 · 정예 · 우두머리, 생김새가 겹치지 않는다", () => {
    expect(PK_POOL).toHaveLength(10);
    const ids = Object.keys(MONSTERS).filter((id) => id.startsWith("pk_")) as MonsterId[];
    expect(ids).toHaveLength(12);
    for (const id of [...PK_POOL, PK_ELITE, PK_BOSS]) expect(MONSTERS[id]).toBeDefined();
    expect(new Set(ids.map((id) => `${MONSTERS[id].size}-${MONSTERS[id].color}-${MONSTERS[id].accent}`)).size).toBe(ids.length);
    expect(MONSTERS[PK_BOSS].behavior).toBe("boss");
    expect(MONSTERS[PK_BOSS].phases).toHaveLength(3);
  });
});

describe("지하 주차장: 층 계획", () => {
  it("구성은 pk_ 몬스터만, 차단기는 한 층에 둘까지, 무리는 카트·딱지만", () => {
    let floors = 0;
    for (let seed = 1; seed <= 80; seed++)
      for (const f of parkingFloors(seed)) {
        floors++;
        const p = towerPlan(seed, f, 1);
        const all = p.flatMap((w) => w.monsters);
        for (const id of all) expect(id.startsWith("pk_")).toBe(true);
        expect(all.filter((id) => id === "pk_barrier").length).toBeLessThanOrEqual(PK_BARRIER_CAP);
        for (const w of p) if (w.pack) expect(["pk_cart", "pk_ticket"]).toContain(w.monsters[w.monsters.length - 1]);
      }
    expect(floors).toBeGreaterThan(200);
  });

  it("우두머리 층은 견인차 + 카트 졸개, 견인해 깨울 경보 차 몫(adds)은 다시 올 때마다 늘어난다", () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const f of parkingFloors(seed).filter(isBossFloor)) {
        const last = towerPlan(seed, f, 1).at(-1)!;
        expect(last.boss).toBe(true);
        expect(last.monsters[0]).toBe(PK_BOSS);
        expect(last.summon).toEqual({ id: "pk_cart", n: 4 });
        expect(last.adds).toEqual([{ id: "pk_alarm_car", n: pkTowAdds(towerBlock(seed, 1, f).visit) }]);
      }
    expect(pkTowAdds(0)).toBe(3);
    expect(pkTowAdds(9)).toBe(5);
  });

  it("처음 온 블록은 순서표 첫 표대로 (정예는 4번째 층 둘째 웨이브)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const fs = parkingFloors(seed);
      const first = fs.filter((f) => towerBlock(seed, 1, f).visit === 0);
      for (const f of first) {
        const pos = towerBlock(seed, 1, f).pos;
        const w = towerPlan(seed, f, 1)[1];
        if (pos === 3) expect(w.monsters[w.elite!]).toBe(PK_ELITE);
        else if (pos < 3) expect(w.elite).toBeUndefined();
      }
    }
  });
});

/** start층부터 floors층을 깬 결과 (계획·불려 온 몬스터를 모두 잡았다) */
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

describe("지하 주차장: 서버 검증", () => {
  it("견인해 깨운 경보 차·카트 졸개까지 다 잡고 최소 시간에 오른 판도 통과한다 (Lv.50)", () => {
    let tested = 0;
    for (let seed = 1; seed <= 60; seed++) {
      if (!parkingFloors(seed, 1, 4).length) continue;
      tested++;
      const r = climbAll(seed, 1, 20);
      const v = evalTower({ seed, level: 50, start: 1 }, r, r.durationMs + 500);
      expect(v.ok, `seed ${seed}`).toBe(true);
    }
    expect(tested).toBeGreaterThan(10);
  });

  it("주차장 한 층의 처치 수는 최소 시간 안의 처치 속도 상한 아래", () => {
    for (let seed = 1; seed <= 120; seed++)
      for (const f of parkingFloors(seed)) {
        const p = towerPlan(seed, f, 1);
        const total = Object.values(huntSpawnable(p, Infinity)).reduce((a, b) => a + (b ?? 0), 0);
        expect(total).toBeLessThanOrEqual(3 + floorMinSec(p) * towerKillRate(50));
      }
  });

  it("깨울 수 있는 것보다 경보 차를 더 잡았다고 하면 거절", () => {
    const seed = [...Array(200).keys()].map((k) => k + 1).find((s) => parkingFloors(s, 1, 4).some(isBossFloor))!;
    const r = climbAll(seed, 1, 20);
    const can = huntSpawnable(towerPlan(seed, 21, 1), Infinity).pk_alarm_car ?? 0;
    const cheat = { ...r, kills: { ...r.kills, pk_alarm_car: (r.kills.pk_alarm_car ?? 0) + can + 1 } };
    expect(towerClean(evalTower({ seed, level: 50, start: 1 }, cheat, r.durationMs + 500))).toBe(false);
  });
});

describe("지하 주차장: 방·판·기믹 숫자", () => {
  it("방은 판 시드·층으로 정해지고, 블록의 보통 층 넷은 서로 다르며 우두머리 층은 견인 차고지", () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const base of [0, 5, 10, 45]) {
        const rooms = [1, 2, 3, 4].map((k) => pkRoom(seed, base + k));
        expect(new Set(rooms).size).toBe(4);
        for (const r of rooms) expect(r).toBeLessThan(PK_ROOMS);
        expect(pkRoom(seed, base + 5)).toBe(PK_BOSS_ROOM);
      }
    expect(pkRoom(9, 7)).toBe(pkRoom(9, 7));
    expect(new Set(Array.from({ length: 40 }, (_, i) => pkRoom(i + 1, 1))).size).toBeGreaterThan(4);
  });

  it("다시 올 때마다 판이 바뀌고 넷째부터는 마지막 판 그대로", () => {
    expect(pkLoop(0).name).toBe("평일 밤");
    expect(pkLoop(1).name).toBe("정전 주차장");
    expect(pkLoop(9)).toBe(PK_LOOPS[PK_LOOPS.length - 1]);
    for (const l of PK_LOOPS) {
      expect(l.dark).toBeGreaterThanOrEqual(0);
      expect(l.dark).toBeLessThan(0.7);
      expect(l.rush).toBeGreaterThan(0.5);
      expect(l.speed).toBeLessThanOrEqual(1.1);
    }
  });

  it("돌진·경보·딱지 숫자가 피할 수 있는 범위", () => {
    expect(PK_RUSH.warn).toBeGreaterThanOrEqual(1200);
    expect(PK_RUSH.every[1] * Math.min(...PK_LOOPS.map((l) => l.rush)) * 0.55).toBeGreaterThan(PK_RUSH.warn + 1500);
    expect(PK_ALARM.dur).toBeLessThan(PK_ALARM.every * Math.min(...PK_LOOPS.map((l) => l.alarm)));
    expect(pkTicketSlow(0)).toBe(1);
    expect(pkTicketSlow(99)).toBeCloseTo(1 - PK_TICKET.slow * PK_TICKET.max);
    expect(pkTicketSlow(99)).toBeGreaterThan(0.5);
  });

  it("기둥 칠: 블록 글자 + 층 자리, 우두머리 층은 T", () => {
    expect(pkPillarCode(1)).toBe("A1");
    expect(pkPillarCode(8)).toBe("B3");
    expect(pkPillarCode(10)).toBe("T");
    expect(pkPillarCode(21)).toBe("A1");
  });
});
