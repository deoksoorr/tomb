import { describe, expect, it } from "vitest";
import { MONSTERS, type MonsterId } from "./catalog";
import { monsterStats } from "./formulas";
import { huntSpawnable } from "./plan";
import { signTicket, verifyTicket } from "./ticket";
import {
  betterRecord,
  checkTowerStart,
  cursesAt,
  evalTower,
  floorMinSec,
  floorTExp,
  isBossFloor,
  TOWER_CHESTS_PER_DAY,
  TOWER_FLOOR_POINTS,
  TOWER_POWER,
  TOWER_TAUNTS,
  towerChestDrops,
  towerCheckpoints,
  towerCurseFx,
  towerFloorSec,
  towerOfScore,
  towerPlan,
  towerScale,
  towerScore,
  towerSettle,
  towerTaunt,
  TOWER_THEMES,
  towerBlock,
  towerZone,
  type TowerState,
} from "./tower";
import { MemoryTowerStore } from "./towerStore";
import type { HuntResult } from "./types";

// 11/15 야근 빌딩 (lib/rpg/tower): 층 배율·저주, 체크포인트, 층 계획·결과 검증, 층 EXP·4층 = 1판, 상자 하루 한도, 기록·랭킹 점수, 서버 최초·꼭대기 층

const base: TowerState = {
  tRuns: 0,
  tBank: 0,
  tFl: 0,
  tChest: 0,
  fBest: 0,
  fBestMs: 0,
  fWkBest: 0,
  fWkMs: 0,
};
const DAY = "20261116";
const WEEK = "20261116";

/** start층부터 floors층을 깬 결과 (계획 몬스터를 모두 잡음 + 지금 층에서 extra) */
function climb(
  seed: number,
  start: number,
  floors: number,
  extra: Partial<HuntResult> = {},
): HuntResult {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++)
    for (const w of towerPlan(seed, start + i, start))
      for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
  return {
    game: "hunt",
    durationMs: floors * 45_000 + 5_000,
    kills,
    wavesCleared: 0,
    died: true,
    potionsUsed: {},
    floors,
    floorMs: floors * 45_000,
    ...extra,
  };
}

describe("층 배율·테마·저주", () => {
  it("체력·공격력 ×1.06^층, 방어 ×1.023^층 (기본 세기 하나 — 테마가 바뀌어도 약해지지 않는다)", () => {
    expect(towerScale(10).hp).toBeCloseTo(1.06 ** 10);
    expect(towerScale(10).def).toBeCloseTo(1.023 ** 10);
    expect(towerScale(50).hp).toBeCloseTo(18.42, 1);
    const at = (f: number) =>
      monsterStats("hr_chair", "hell", TOWER_POWER, towerScale(f)).maxHp;
    for (let f = 1; f < 40; f++) expect(at(f + 1)).toBeGreaterThan(at(f));
    expect(
      monsterStats("hr_chair", "hell", TOWER_POWER, towerScale(20)).exp,
    ).toBe(monsterStats("hr_chair", "hell", TOWER_POWER).exp);
  });

  it("11/15 테마 순서는 판 시드로: 다섯 층씩 같은 테마, 바로 앞 블록과 겹치지 않고, 처음엔 안 나온 테마부터 (테마 수 × 5층이면 모두 한 번씩)", () => {
    const n = TOWER_THEMES.length;
    const orders = new Set<string>();
    for (let seed = 1; seed <= 200; seed++)
      for (const start of [1, 11, 51]) {
        const zones: string[] = [];
        for (let b = 0; b < n * 3; b++) {
          const f = start + b * 5;
          const at = towerBlock(seed, start, f);
          for (let k = 1; k < 5; k++) expect(towerBlock(seed, start, f + k).zone).toBe(at.zone);
          expect(towerBlock(seed, start, f + 4).pos).toBe(4);
          if (b > 0) expect(at.zone, `${seed}/${start} ${f}층`).not.toBe(zones[b - 1]);
          // 그 판에서 몇 번째로 왔나
          expect(at.visit).toBe(zones.filter((z) => z === at.zone).length);
          zones.push(at.zone);
        }
        expect(new Set(zones.slice(0, n)).size, `${seed}/${start}`).toBe(n);
        if (start === 1) orders.add(zones.slice(0, n).join());
      }
    // 판마다 순서가 다르다
    expect(orders.size).toBeGreaterThan(20);
    // 같은 판이면 같은 순서 (몇 층까지 물었는지와 상관없이)
    expect(towerZone(77, 1, 26).id).toBe(towerZone(77, 1, 26).id);
    expect(towerBlock(5, 11, 40)).toEqual(towerBlock(5, 11, 40));
  });

  it("11/15 서버·게임이 같은 계획: 층 계획의 몬스터는 그 판 그 층 테마 것만, 우두머리 층은 그 테마 우두머리 — 다 잡은 판은 시작 층과 상관없이 통과", () => {
    for (let seed = 1; seed <= 25; seed++)
      for (const start of [1, 11, 21]) {
        const kills: Partial<Record<MonsterId, number>> = {};
        for (let f = start; f < start + TOWER_THEMES.length * 5; f++) {
          const z = towerZone(seed, start, f);
          const ok = new Set<MonsterId>([...z.pool, z.boss, z.summon.id, ...(z.elite ? [z.elite] : []), ...(z.mid ? [z.mid] : [])]);
          const p = towerPlan(seed, f, start);
          for (const w of p) {
            for (const m of w.monsters) {
              expect(ok.has(m), `${seed}/${start} ${f}층 ${m} (${z.id})`).toBe(true);
              kills[m] = (kills[m] ?? 0) + 1;
            }
            for (const a of w.adds ?? []) expect(a.id.slice(0, 3), `${z.id} adds ${a.id}`).toBe([...ok][0].slice(0, 3));
          }
          if (isBossFloor(f)) expect(p.at(-1)!.monsters[0]).toBe(z.boss);
        }
        const floors = TOWER_THEMES.length * 5;
        const r: HuntResult = { game: "hunt", durationMs: floors * 45_000 + 5_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: floors * 45_000 };
        const v = evalTower({ seed, level: 50, start }, r, r.durationMs + 1000, { lax: true });
        expect(v.ok, `${seed}/${start}`).toBe(true);
        // 다른 판 시드의 티켓으로는 (테마 순서가 달라서) 대개 맞지 않는다
        const k = Object.keys(kills)[0] as MonsterId;
        expect(evalTower({ seed, level: 50, start }, { ...r, kills: { ...kills, [k]: kills[k]! - 1 } }, r.durationMs + 1000, { lax: true }).ok).toBe(false);
      }
  });

  it("저주는 층대마다 쌓인다: 10 물약 절반 · 20 금지 · 30 회복 절반 · 40 이동 · 50 공격 속도 · 70 시간 −20% · 100 정예 섞임", () => {
    expect(cursesAt(9)).toEqual([]);
    expect(cursesAt(10)).toEqual(["potion_half"]);
    expect(cursesAt(35)).toEqual(["potion_half", "no_potion", "heal_half"]);
    expect(cursesAt(100)).toEqual([
      "potion_half",
      "no_potion",
      "heal_half",
      "mon_move",
      "mon_atk",
      "time_20",
      "elite_mix",
    ]);
    expect(towerCurseFx(1)).toEqual({
      potionMul: 1,
      potions: true,
      healMul: 1,
      timeMul: 1,
      revive: false,
      monMove: 1,
      monAtk: 1,
      eliteMix: false,
    });
    expect(towerCurseFx(45)).toMatchObject({
      potionMul: 0.5,
      potions: false,
      healMul: 0.5,
      monMove: 1.2,
      monAtk: 1,
    });
    expect(towerCurseFx(55).monAtk).toBe(1.2);
    expect(towerScale(45).speed).toBe(1.2);
    expect(towerFloorSec(69)).toBe(90);
    expect(towerFloorSec(71)).toBe(72);
    expect(towerFloorSec(70)).toBe(96);
    expect(towerCurseFx(100).eliteMix).toBe(true);
  });
});

describe("층 계획", () => {
  it("시드·층마다 같고, 5층마다 우두머리 층 (마지막 웨이브 맨 앞 = 그 테마 우두머리)", () => {
    expect(towerPlan(77, 3, 1)).toEqual(towerPlan(77, 3, 1));
    expect(towerPlan(77, 3, 1)).not.toEqual(towerPlan(77, 4, 1));
    expect(isBossFloor(5) && isBossFloor(10) && !isBossFloor(11)).toBe(true);
    const boss = towerPlan(77, 15, 1);
    expect(boss.at(-1)!.boss).toBe(true);
    expect(boss.at(-1)!.monsters[0]).toBe(towerZone(77, 1, 15).boss);
    expect(towerPlan(77, 14, 1).some((w) => w.boss)).toBe(false);
    expect(floorMinSec(towerPlan(77, 2, 1))).toBe(10);
  });

  it("100층부터 우두머리 웨이브 빼고 웨이브마다 정예", () => {
    for (const f of [101, 102, 103, 104])
      for (const w of towerPlan(9, f, 101)) expect(w.elite).toBeDefined();
    expect(towerPlan(9, 105, 101).at(-1)!.elite).toBeUndefined();
  });
});

describe("체크포인트·시작 검사", () => {
  it("1층 + 바로 아래층까지 깬 1·11·21 …층 (10층을 깨면 11층이 열린다, 슈퍼 계정은 101층까지)", () => {
    expect(towerCheckpoints(0)).toEqual([1]);
    expect(towerCheckpoints(9)).toEqual([1]);
    expect(towerCheckpoints(10)).toEqual([1, 11]);
    expect(towerCheckpoints(19)).toEqual([1, 11]);
    expect(towerCheckpoints(20)).toEqual([1, 11, 21]);
    expect(towerCheckpoints(23)).toEqual([1, 11, 21]);
    expect(towerCheckpoints(3, true).at(-1)).toBe(101);
  });

  it("레벨 50 · 체크포인트 층만 · 최고 기록 위로는 못 간다", () => {
    const ok = { level: 50, start: 1, best: 0, sup: false };
    expect(checkTowerStart(ok)).toBeNull();
    expect(checkTowerStart({ ...ok, level: 49 })?.code).toBe("LEVEL_LOW");
    expect(checkTowerStart({ ...ok, start: 5 })?.code).toBe("INVALID_INPUT");
    expect(checkTowerStart({ ...ok, start: 11, best: 9 })?.code).toBe(
      "TOWER_LOCKED",
    );
    expect(checkTowerStart({ ...ok, start: 11, best: 10 })).toBeNull();
    expect(checkTowerStart({ ...ok, start: 21, best: 19 })?.code).toBe("TOWER_LOCKED");
    expect(checkTowerStart({ ...ok, start: 21, best: 23 })).toBeNull();
    expect(checkTowerStart({ ...ok, start: 51, sup: true })).toBeNull();
  });
});

describe("결과 검증 (층마다)", () => {
  const t = { seed: 1234, level: 50, start: 1 };

  it("깬 층의 몬스터를 다 잡은 정직한 판은 통과 (쓰러져도)", () => {
    const r = climb(1234, 1, 6);
    const v = evalTower(t, r, r.durationMs + 1_000);
    expect(v).toEqual({
      ok: true,
      floors: 6,
      best: 6,
      floorMs: 270_000,
      kills: Object.values(r.kills).reduce((a, b) => a + (b ?? 0), 0),
      points: 6 * TOWER_FLOOR_POINTS,
    });
    // 지금 층에서 잡은 몬스터도 나올 수 있었던 만큼은 된다
    const cur = towerPlan(1234, 7, 1)[0].monsters[0];
    const more = {
      ...r,
      kills: { ...r.kills, [cur]: (r.kills[cur] ?? 0) + 1 },
    };
    expect(evalTower(t, more, r.durationMs + 1_000).ok).toBe(true);
  });

  it("층을 부풀리거나, 몬스터를 덜 잡았거나, 너무 빨리 올랐으면 거절", () => {
    const r = climb(1234, 1, 6);
    expect(evalTower(t, { ...r, floors: 7 }, r.durationMs + 1_000).ok).toBe(
      false,
    );
    const k = Object.keys(r.kills)[0] as MonsterId;
    expect(
      evalTower(
        t,
        { ...r, kills: { ...r.kills, [k]: r.kills[k]! - 1 } },
        r.durationMs + 1_000,
      ).ok,
    ).toBe(false);
    // 6층을 30초에 (층마다 최소 10초)
    const fast = { ...r, durationMs: 30_000, floorMs: 30_000 };
    expect(evalTower(t, fast, 31_000).ok).toBe(false);
    // 기록 시간이 서버가 잰 시간보다 길다
    expect(evalTower(t, r, r.durationMs - 10_000).ok).toBe(false);
    // 있을 수 없는 몬스터
    expect(
      evalTower(
        t,
        { ...r, kills: { ...r.kills, exam_paper: 1 } },
        r.durationMs + 1_000,
      ).ok,
    ).toBe(false);
  });

  it("처치 수 상한: 나올 수 있는 수 (분열·졸개 포함)를 넘으면 거절", () => {
    const r = climb(1234, 1, 2);
    const can = huntSpawnable(
      [...towerPlan(1234, 1, 1), ...towerPlan(1234, 2, 1), ...towerPlan(1234, 3, 1)],
      Infinity,
    );
    const id = Object.keys(can)[0] as MonsterId;
    expect(MONSTERS[id]).toBeDefined();
    expect(
      evalTower(
        t,
        { ...r, kills: { ...r.kills, [id]: can[id]! + 1 } },
        r.durationMs + 1_000,
      ).ok,
    ).toBe(false);
  });

  it("8초 미만 판은 보상 없이 (층은 못 깬다)", () => {
    expect(
      evalTower(
        t,
        { ...climb(1234, 1, 0), durationMs: 5_000, floorMs: 0 },
        6_000,
      ),
    ).toMatchObject({ ok: true, floors: 0, points: 0 });
    expect(
      evalTower(t, { ...climb(1234, 1, 1), durationMs: 5_000 }, 6_000).ok,
    ).toBe(false);
  });

  it("체크포인트에서 시작한 판은 그 층부터 센다", () => {
    const r = climb(55, 21, 3);
    expect(
      evalTower({ seed: 55, level: 50, start: 21 }, r, r.durationMs + 1_000),
    ).toMatchObject({ ok: true, floors: 3, best: 23 });
    // 다른 시작 층의 계획으로는 맞지 않는다
    expect(
      evalTower({ seed: 55, level: 50, start: 1 }, r, r.durationMs + 1_000).ok,
    ).toBe(false);
  });
});

describe("보상 정산 (층 EXP · 4층 = 1판 · 상자 하루 15개 · 기록)", () => {
  it("층 EXP ≈ 320 × (1 + 0.02 × 층): 1층 326 · 30층 512 · 100층 960", () => {
    expect([
      floorTExp(1),
      floorTExp(30),
      floorTExp(50),
      floorTExp(100),
    ]).toEqual([326, 512, 640, 960]);
    // 낮은 층 4층 ≈ 지옥 한 판(100% 구간 약 1,270)
    const four = floorTExp(1) + floorTExp(2) + floorTExp(3) + floorTExp(4);
    expect(four).toBeGreaterThan(1_250);
    expect(four).toBeLessThan(1_400);
  });

  it("깬 4층마다 초월 판 1판, 남은 층은 다음 판으로 이어진다 (쓰러져도 깬 만큼)", () => {
    const a = towerSettle(base, {
      day: DAY,
      week: WEEK,
      start: 1,
      floors: 6,
      floorMs: 300_000,
    });
    expect(a.runs).toBe(1);
    expect(a.patch).toMatchObject({ tRuns: 1, tFl: 2 });
    expect(a.tExp).toBe(
      [1, 2, 3, 4, 5, 6].reduce((n, f) => n + floorTExp(f), 0),
    );
    const b = towerSettle(
      { ...base, ...a.patch },
      { day: DAY, week: WEEK, start: 1, floors: 2, floorMs: 90_000 },
    );
    expect(b.runs).toBe(1);
    expect(b.patch).toMatchObject({ tRuns: 2, tFl: 0 });
  });

  it("11/15 하루 판 수 제한 없음: 많이 오른 날에도 층마다 100%", () => {
    const r = towerSettle({ ...base, tDay: DAY, tRuns: 19, tFl: 3 }, { day: DAY, week: WEEK, start: 1, floors: 2, floorMs: 60_000 });
    expect(r.tiers).toEqual(["full", "full"]);
    expect(r.tExp).toBe(floorTExp(1) + floorTExp(2));
    const late = towerSettle({ ...base, tDay: DAY, tRuns: 60 }, { day: DAY, week: WEEK, start: 1, floors: 4, floorMs: 60_000 });
    expect(late.tExp).toBe(floorTExp(1) + floorTExp(2) + floorTExp(3) + floorTExp(4));
  });

  it("11/15 우두머리 상자는 하루 개수 제한 없음 — 많이 연 날에도 우두머리 층마다 열린다", () => {
    const r = towerSettle(
      { ...base, tDay: DAY, tChest: 13 },
      { day: DAY, week: WEEK, start: 1, floors: 20, floorMs: 900_000 },
    );
    expect(r.chests).toEqual([5, 10, 15, 20]);
    expect(r.emptyChests).toBe(0);
    expect(r.patch.tChest).toBe(17);
    expect(TOWER_CHESTS_PER_DAY).toBe(Infinity);
    const next = towerSettle(
      { ...base, ...r.patch },
      { day: "20261117", week: WEEK, start: 1, floors: 5, floorMs: 200_000 },
    );
    expect(next.chests).toEqual([5]);
    // 상자 굴림은 층 시드로 정해진다 (게임 연출과 서버가 같다)
    expect(towerChestDrops(42, 5, 1)).toEqual(towerChestDrops(42, 5, 1));
  });

  it("최고 기록·이번 주 기록: 층 높은 순, 같으면 빨리 깬 쪽. 주가 바뀌면 이번 주는 0부터", () => {
    const s = {
      ...base,
      fBest: 12,
      fBestMs: 500_000,
      fWk: WEEK,
      fWkBest: 12,
      fWkMs: 500_000,
    };
    const same = towerSettle(s, {
      day: DAY,
      week: WEEK,
      start: 1,
      floors: 12,
      floorMs: 400_000,
    });
    expect([same.newBest, same.newWeek]).toEqual([true, true]);
    const slower = towerSettle(s, {
      day: DAY,
      week: WEEK,
      start: 1,
      floors: 12,
      floorMs: 600_000,
    });
    expect([slower.newBest, slower.newWeek]).toEqual([false, false]);
    expect(slower.patch).toMatchObject({ fBest: 12, fBestMs: 500_000 });
    const nextWeek = towerSettle(s, {
      day: "20261123",
      week: "20261123",
      start: 1,
      floors: 3,
      floorMs: 100_000,
    });
    expect([nextWeek.newBest, nextWeek.newWeek]).toEqual([false, true]);
    expect(nextWeek.patch).toMatchObject({
      fWk: "20261123",
      fWkBest: 3,
      fBest: 12,
    });
    const none = towerSettle(s, {
      day: DAY,
      week: WEEK,
      start: 1,
      floors: 0,
      floorMs: 0,
    });
    expect([none.best, none.newBest, none.newWeek]).toEqual([0, false, false]);
  });

  it("랭킹 점수: 층이 먼저, 같은 층이면 빠른 쪽이 위", () => {
    expect(towerScore(30, 900_000)).toBeGreaterThan(towerScore(29, 1_000));
    expect(towerScore(30, 800_000)).toBeGreaterThan(towerScore(30, 900_000));
    expect(towerOfScore(towerScore(73, 1_234_567))).toEqual({
      floor: 73,
      ms: 1_234_567,
    });
    expect(betterRecord(5, 10, 5, 10)).toBe(false);
    expect(betterRecord(0, 0, 0, 0)).toBe(false);
  });
});

describe("기록 저장소 (서버 최초 · 꼭대기 층 · 주간 랭킹)", () => {
  it("서버 최초는 처음 한 사람만", async () => {
    const st = new MemoryTowerStore();
    expect(await st.claimFirst("t_first30", "a", 1)).toBe(true);
    expect(await st.claimFirst("t_first30", "b", 2)).toBe(false);
    expect(await st.claimFirst("t_first50", "b", 2)).toBe(true);
    expect(await st.firsts()).toEqual({ t_first30: "a", t_first50: "b" });
  });

  it("꼭대기 층: 더 높은 층만 빼앗는다 (같은 층은 먼저 오른 사람)", async () => {
    const st = new MemoryTowerStore();
    expect(await st.claimTop("a", 30, 1, 1)).toEqual({
      took: true,
      prev: null,
    });
    expect((await st.claimTop("b", 30, 0, 2)).took).toBe(false);
    const r = await st.claimTop("b", 31, 5, 3);
    expect(r.took).toBe(true);
    expect(r.prev?.accountId).toBe("a");
    expect(await st.topHolder()).toMatchObject({ accountId: "b", floor: 31 });
  });

  it("주간·전체 랭킹 순서 (층 → 빠른 순), 주마다 따로", async () => {
    const st = new MemoryTowerStore();
    await st.record(
      "a",
      WEEK,
      towerScore(20, 600_000),
      towerScore(20, 600_000),
    );
    await st.record("b", WEEK, towerScore(20, 500_000), null);
    await st.record(
      "c",
      WEEK,
      towerScore(25, 900_000),
      towerScore(25, 900_000),
    );
    await st.record("d", "20261123", towerScore(40, 1), null);
    expect((await st.top(5, WEEK)).map((e) => e.accountId)).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect((await st.top(5)).map((e) => e.accountId)).toEqual(["c", "a"]);
    expect(await st.countAbove(towerScore(20, 600_000), WEEK)).toBe(2);
  });
});

describe("티켓", () => {
  it("시작 층(tw)은 지옥 사냥·체크포인트만, 초월 구간(tt)과 같이 실리지 않는다", async () => {
    const claims = {
      n: "x",
      a: "acc",
      g: "hunt" as const,
      d: "hell" as const,
      t: 1,
      s: 5,
      lv: 50,
      st: { agi: 1, dex: 1, luk: 1 },
      z: towerZone(5, 11, 11).id,
      tw: 11,
    };
    expect((await verifyTicket("s", await signTicket("s", claims)))?.tw).toBe(
      11,
    );
    expect(
      await verifyTicket("s", await signTicket("s", { ...claims, tw: 12 })),
    ).toBeNull();
    expect(
      await verifyTicket(
        "s",
        await signTicket("s", { ...claims, d: "hard" as const, z: undefined }),
      ),
    ).toBeNull();
    expect(
      await verifyTicket(
        "s",
        await signTicket("s", { ...claims, tt: "full" as const }),
      ),
    ).toBeNull();
  });
});

describe("입구 경비원", () => {
  it("한마디는 8개 넘게, 모두 레벨 50 안내", () => {
    expect(TOWER_TAUNTS.length).toBeGreaterThanOrEqual(8);
    expect(TOWER_TAUNTS.every((t) => t.includes("50"))).toBe(true);
    expect(TOWER_TAUNTS).toContain(towerTaunt(0.99));
  });
});

describe("11/15 테마 졸개 (옥상 정전기 불꽃)", () => {
  it("층마다 계획 밖 졸개를 MINION_FLOOR_ALLOW만큼 더 잡아도 거절하지 않는다", async () => {
    const { evalTower, MINION_FLOOR_ALLOW, towerPlan } = await import("./tower");
    const { huntSpawnable } = await import("./plan");
    const start = 21;
    const floors = 3;
    const kills: Record<string, number> = {};
    for (let i = 0; i <= floors; i++)
      for (const [id, n] of Object.entries(huntSpawnable(towerPlan(77, start + i, start), Infinity))) kills[id] = (kills[id] ?? 0) + (n ?? 0);
    kills.rf_spark = (kills.rf_spark ?? 0) + (floors + 1) * MINION_FLOOR_ALLOW;
    const v = evalTower({ seed: 77, level: 50, start, gp: 3 }, { game: "hunt", durationMs: 3_000_000, kills, floors, floorMs: 2_900_000, wavesCleared: 0, died: true, potionsUsed: {} } as never, 3_100_000, { lax: true });
    expect(v.ok, JSON.stringify(v)).toBe(true);
  });
});
