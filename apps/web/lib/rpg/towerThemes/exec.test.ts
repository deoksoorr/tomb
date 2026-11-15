import { describe, expect, it } from "vitest";
import { HUNT_ZONES, isZoneId, MONSTERS, type MonsterId } from "../catalog";
import { huntSpawnable } from "../plan";
import { MONSTER_STATUS } from "../status";
import { evalTower, towerBlock, towerPlan } from "../tower";
import type { HuntResult } from "../types";
import { EX_BOSS, EX_CARDS_CAP, EX_ELITE, EX_KEY_CAP, EX_MONSTER_IDS, EX_PACKABLE, EX_POOL, EX_ROOMS, EX_ZONE, exRules } from "./exec";
import { exRoom } from "../../../game/tower/themes/execMap";

// 11/15 임원층: 몬스터 열넷 모양, 순서표(처음·두 번째 방문), 층 계획 상한(차 키·명함 뭉치·무리), 서버 검증(명함 조각·수행 임원), 방

/** 판 시작 1층에서 임원층이 (visit)번째로 나오는 블록을 가진 시드와 그 블록 첫 층 */
function findRun(visit: number): { seed: number; f: number } {
  for (let seed = 1; seed < 5000; seed++)
    for (let b = 0; b < 12; b++) {
      const f = b * 5 + 1;
      const at = towerBlock(seed, 1, f);
      if (at.zone === EX_ZONE && at.visit === visit) return { seed, f };
    }
  throw new Error("no run");
}

const ids = (seed: number, f: number) =>
  new Set(
    towerPlan(seed, f, 1)
      .flatMap((w) => w.monsters)
      .filter((m) => !MONSTERS[m].minion && m !== EX_ELITE && m !== EX_BOSS),
  );

describe("임원층 몬스터", () => {
  it("열네 종 모두 크기·색이 다르고, 일반 열 종 + 졸개 둘 + 정예 + 우두머리", () => {
    expect(EX_MONSTER_IDS.length).toBe(14);
    expect(EX_POOL.length).toBe(10);
    expect(new Set(EX_MONSTER_IDS.map((id) => MONSTERS[id].color)).size).toBe(14);
    expect(new Set(EX_MONSTER_IDS.map((id) => `${MONSTERS[id].color}-${MONSTERS[id].size}`)).size).toBe(14);
    expect(MONSTERS.ex_ceo.behavior).toBe("boss");
    expect(MONSTERS.ex_ceo.phases?.length).toBe(3);
    expect(MONSTERS.ex_cards.split).toEqual({ id: "ex_card", n: 3 });
    expect(MONSTER_STATUS.ex_ceo).toBeDefined();
    expect(isZoneId(EX_ZONE)).toBe(false);
    expect(HUNT_ZONES[EX_ZONE].summon).toEqual({ id: "ex_entourage", n: 3 });
  });

  it("다시 올 때마다 기믹이 세진다 (서류 더 자주·더 많이, 순시 더 자주, 넷째부터 스포트라이트 둘)", () => {
    expect(exRules(2).rainEvery).toBeLessThan(exRules(0).rainEvery);
    expect(exRules(2).rainN).toBeGreaterThan(exRules(0).rainN);
    expect(exRules(1).tourEvery).toBeLessThan(exRules(0).tourEvery);
    expect(exRules(1).night).toBe(true);
    expect(exRules(3).spots).toBe(2);
    expect(exRules(99)).toEqual(exRules(3));
  });
});

describe("임원층 순서표·층 계획", () => {
  it("처음 오면 첫 층 두 종에서 층마다 새로 두 종까지, 두 번째에 남은 종이 들어와 열 종이 다 나온다", () => {
    const first = findRun(0);
    const second = findRun(1);
    expect(ids(first.seed, first.f).size).toBe(2);
    const seen = new Set<MonsterId>();
    for (let k = 0; k < 5; k++) {
      const now = ids(first.seed, first.f + k);
      expect([...now].filter((m) => !seen.has(m)).length, `${k}번째 층`).toBeLessThanOrEqual(2);
      for (const m of now) seen.add(m);
    }
    for (let k = 0; k < 5; k++) for (const m of ids(second.seed, second.f + k)) seen.add(m);
    for (const id of EX_POOL) expect(seen.has(id), id).toBe(true);
  });

  it("정예 비서실장은 처음 온 블록 4번째 층 둘째 웨이브, 우두머리 층 마지막 웨이브는 대표이사", () => {
    const { seed, f } = findRun(0);
    const plan = (k: number) => towerPlan(seed, f + k, 1);
    expect([0, 1, 2, 3].map((k) => plan(k).some((w) => w.elite !== undefined))).toEqual([false, false, false, true]);
    const w = plan(3)[1];
    expect(w.monsters[w.elite!]).toBe(EX_ELITE);
    const boss = plan(4).at(-1)!;
    expect(boss.boss).toBe(true);
    expect(boss.monsters[0]).toBe(EX_BOSS);
    expect(boss.summon).toEqual({ id: "ex_entourage", n: 3 });
  });

  it("차 키는 한 층에 셋, 명함 뭉치는 넷까지 · 무리는 몰려다니는 것만", () => {
    for (let seed = 1; seed < 400; seed++)
      for (let b = 0; b < 8; b++) {
        const f = b * 5 + 1;
        if (towerBlock(seed, 1, f).zone !== EX_ZONE) continue;
        for (let k = 0; k < 5; k++) {
          const p = towerPlan(seed, f + k, 1);
          const solo = p.flatMap((w) => w.monsters.slice(0, w.monsters.length - w.pack));
          expect(solo.filter((m) => m === "ex_car_key").length).toBeLessThanOrEqual(EX_KEY_CAP);
          expect(solo.filter((m) => m === "ex_cards").length).toBeLessThanOrEqual(EX_CARDS_CAP);
          for (const w of p) if (w.pack > 0) expect(EX_PACKABLE).toContain(w.monsters[w.monsters.length - 1]);
        }
      }
  });

  it("방: 블록의 보통 층 넷은 서로 다른 방, 우두머리 층은 대표이사실, 같은 판 같은 층은 늘 같은 방", () => {
    for (let seed = 1; seed < 60; seed++)
      for (let b = 0; b < 6; b++) {
        const rooms = [1, 2, 3, 4].map((k) => exRoom(seed, b * 5 + k));
        expect(new Set(rooms).size).toBe(4);
        for (const r of rooms) expect(r).toBeLessThan(EX_ROOMS);
        expect(exRoom(seed, b * 5 + 5)).toBe(EX_ROOMS);
        expect(exRoom(seed, b * 5 + 2)).toBe(rooms[1]);
      }
    const all = new Set<number>();
    for (let seed = 1; seed < 40; seed++) for (let k = 1; k <= 4; k++) all.add(exRoom(seed, k));
    expect(all.size).toBe(EX_ROOMS);
  });
});

describe("임원층 결과 검증 (서버)", () => {
  /** 임원층이 처음 나오는 블록이 시작 블록인 판: 1층부터 5층까지 */
  function startRun(): number {
    for (let seed = 1; seed < 5000; seed++) if (towerBlock(seed, 1, 1).zone === EX_ZONE) return seed;
    throw new Error("no run");
  }

  function climb(seed: number, floors: number, extra = true): HuntResult {
    const kills: Partial<Record<MonsterId, number>> = {};
    for (let i = 0; i < floors; i++) {
      const p = towerPlan(seed, 1 + i, 1);
      for (const w of p) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
      if (extra) {
        // 명함 뭉치는 셋으로 흩어지고, 대표이사는 수행 임원을 두 번 셋씩 부른다
        const cards = p.flatMap((w) => w.monsters).filter((m) => m === "ex_cards").length;
        if (cards) kills.ex_card = (kills.ex_card ?? 0) + cards * 3;
        if (p.some((w) => w.summon?.id === "ex_entourage")) kills.ex_entourage = (kills.ex_entourage ?? 0) + 6;
      }
    }
    return { game: "hunt", durationMs: floors * 55_000 + 5_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: floors * 55_000 };
  }

  it("명함 조각·수행 임원까지 다 잡은 정직한 판은 통과", () => {
    const seed = startRun();
    const r = climb(seed, 5);
    expect(r.kills.ex_entourage).toBe(6);
    const v = evalTower({ seed, level: 50, start: 1 }, r, r.durationMs + 1000);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.best).toBe(5);
  });

  it("수행 임원을 부를 수 있는 몫(3 × 2번)보다 많이 잡았다고 하면 거절", () => {
    const seed = startRun();
    const r = climb(seed, 5);
    // 6층(지금 층)에서 더 나올 수 있는 몫까지 더해도 넘게
    const more = huntSpawnable(towerPlan(seed, 6, 1), Infinity).ex_entourage ?? 0;
    const bad = { ...r, kills: { ...r.kills, ex_entourage: 6 + more + 1 } };
    expect(evalTower({ seed, level: 50, start: 1 }, bad, r.durationMs + 1000).ok).toBe(false);
  });

  it("명함 뭉치 몫보다 명함을 더 잡았다고 하면 거절 (두 번째로 온 임원층까지 오른 판)", () => {
    const { seed, f } = findRun(1);
    const floors = f + 4;
    const r = climb(seed, floors);
    expect(r.kills.ex_card ?? 0).toBeGreaterThan(0);
    expect(evalTower({ seed, level: 50, start: 1 }, r, r.durationMs + 1000).ok).toBe(true);
    const more = huntSpawnable(towerPlan(seed, floors + 1, 1), Infinity).ex_card ?? 0;
    const bad = { ...r, kills: { ...r.kills, ex_card: (r.kills.ex_card ?? 0) + more + 1 } };
    expect(evalTower({ seed, level: 50, start: 1 }, bad, r.durationMs + 1000).ok).toBe(false);
  });
});
