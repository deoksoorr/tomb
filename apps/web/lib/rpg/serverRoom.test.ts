import { describe, expect, it } from "vitest";
import { HUNT_ZONES, isZoneId, MONSTERS, zonesOf, type MonsterId } from "./catalog";
import { huntSpawnable, revivable } from "./plan";
import { SV_BOSS_ROOM, SV_LOOPS, SV_MONSTER_IDS, SV_POOL, svLoop, svRoom } from "./serverRoom";
import { MONSTER_STATUS } from "./status";
import { evalTower, isBossFloor, towerLoop, towerPlan, towerZone } from "./tower";
import type { HuntResult } from "./types";

// 11/15 야근 빌딩 지하 서버실: 층 → 테마·방 종류, 층 계획(구성 섞기·정예 백업 테이프·우두머리), 서버 상한(복사·되살리기·재부팅)

const isSv = (f: number) => towerZone(f).id === "server-room";

/** 깬 층의 계획 몬스터 + 덤(복사·되살림)을 모두 잡은 판 */
function climb(seed: number, start: number, floors: number, extra: (f: number, kills: Partial<Record<MonsterId, number>>) => void = () => {}): HuntResult {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++) {
    for (const w of towerPlan(seed, start + i)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
    extra(start + i, kills);
  }
  return { game: "hunt", durationMs: floors * 50_000 + 5_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: floors * 50_000 };
}

describe("지하 서버실 층·테마", () => {
  it("1~5·11~15·21~25 …층은 지하 서버실, 6~10·16~20 …층은 다른 테마", () => {
    for (const f of [1, 2, 3, 4, 5, 11, 15, 21, 25, 101, 105]) expect(isSv(f), `${f}층`).toBe(true);
    for (const f of [6, 10, 16, 20, 26, 30]) expect(isSv(f), `${f}층`).toBe(false);
  });

  it("사냥터 고르기·판 시작 입력에는 없다 (야근 빌딩 전용)", () => {
    expect(isZoneId("server-room")).toBe(false);
    expect(zonesOf("hell").map((z) => z.id)).not.toContain("server-room");
    expect(HUNT_ZONES["server-room"].boss).toBe("sv_legacy_system");
  });

  it("층마다 방: 한 블록의 보통 층 넷은 모두 다른 방, 우두머리 층은 메인프레임 홀, 두 블록이 여덟 방을 다 쓴다", () => {
    for (let b = 0; b < 12; b++) {
      const base = b * 10;
      const rooms = [1, 2, 3, 4].map((k) => svRoom(base + k));
      expect(new Set(rooms).size, `${base + 1}층 블록`).toBe(4);
      for (const r of rooms) expect(r).toBeLessThan(SV_BOSS_ROOM);
      expect(svRoom(base + 5)).toBe(SV_BOSS_ROOM);
    }
    for (let pair = 0; pair < 4; pair++) {
      const all = new Set([1, 2, 3, 4, 11, 12, 13, 14].map((k) => svRoom(pair * 20 + k)));
      expect(all.size).toBe(8);
    }
    expect(svRoom(12)).toBe(svRoom(12));
  });

  it("바퀴마다 판이 달라진다 (평상시 → 정전 → 비상 경보 → 멜트다운)", () => {
    expect([1, 11, 21, 31, 41].map((f) => svLoop(towerLoop(f)).name)).toEqual([SV_LOOPS[0].name, SV_LOOPS[1].name, SV_LOOPS[2].name, SV_LOOPS[3].name, SV_LOOPS[3].name]);
    expect(svLoop(towerLoop(21)).heatMs).toBeLessThan(svLoop(towerLoop(1)).heatMs);
  });
});

describe("지하 서버실 몬스터·층 계획", () => {
  it("열두 종 모두 다른 크기·색 조합, 일반 열 종 + 정예 + 우두머리", () => {
    expect(SV_MONSTER_IDS.length).toBe(12);
    expect(SV_POOL.length).toBe(10);
    const looks = new Set(SV_MONSTER_IDS.map((id) => `${MONSTERS[id].color}-${MONSTERS[id].size}`));
    expect(looks.size).toBe(12);
    expect(new Set(SV_MONSTER_IDS.map((id) => MONSTERS[id].color)).size).toBe(12);
    expect(MONSTERS.sv_legacy_system.behavior).toBe("boss");
    expect(MONSTERS.sv_legacy_system.phases?.length).toBe(2);
    expect(MONSTER_STATUS.sv_hot_fan?.[0].status).toBe("burn");
  });

  it("층마다 넷을 골라 섞는다 — 같은 판에서 두 층의 구성이 거의 겹치지 않는다", () => {
    const rosters: string[] = [];
    for (const f of [1, 2, 3, 4, 11, 12, 13, 14, 21, 22, 23, 24]) {
      const ids = new Set(towerPlan(77, f).flatMap((w) => w.monsters));
      ids.delete("sv_backup_tape");
      for (const id of ids) expect(SV_POOL).toContain(id);
      expect(ids.size).toBeLessThanOrEqual(4);
      rosters.push([...ids].sort().join(","));
    }
    expect(new Set(rosters).size).toBeGreaterThanOrEqual(10);
  });

  it("정예 자리는 백업 테이프, 우두머리 층 마지막 웨이브는 레거시 시스템", () => {
    let elites = 0;
    for (let seed = 1; seed < 60; seed++)
      for (const w of towerPlan(seed, 3))
        if (w.elite !== undefined) {
          elites++;
          expect(w.monsters[w.elite]).toBe("sv_backup_tape");
        }
    expect(elites).toBeGreaterThan(5);
    expect(isBossFloor(5)).toBe(true);
    const boss = towerPlan(9, 5);
    expect(boss.at(-1)!.monsters[0]).toBe("sv_legacy_system");
    expect(boss.at(-1)!.summon?.id).toBe("sv_excel_macro");
    // 바퀴가 돌수록 정예가 자주 섞인다
    const count = (f: number) => Array.from({ length: 200 }, (_, s) => towerPlan(s + 1, f).filter((w) => w.elite !== undefined).length).reduce((a, b) => a + b, 0);
    expect(count(33)).toBeGreaterThan(count(3));
  });

  it("출현 상한: 엑셀 매크로는 복사 둘까지, 백업 테이프는 되살릴 수 있는 종류마다 셋, 재부팅은 덤이 없다", () => {
    const plan = [{ index: 0, monsters: ["sv_excel_macro", "sv_reboot", "sv_backup_tape", "sv_hot_fan"] as MonsterId[], earliestSec: 0, boss: false, pack: 0, formation: "scatter" as const }];
    const can = huntSpawnable(plan, Infinity);
    expect(can.sv_excel_macro).toBe(3);
    expect(can.sv_reboot).toBe(1 + 3);
    expect(can.sv_hot_fan).toBe(1 + 3);
    expect(can.sv_backup_tape).toBe(1);
    expect(revivable("sv_excel_macro")).toBe(false);
    expect(revivable("sv_legacy_system")).toBe(false);
    expect(revivable("sv_backup_tape")).toBe(false);
    expect(revivable("sv_bluescreen")).toBe(true);
    // 되살리는 몬스터가 없으면 덤도 없다
    expect(huntSpawnable([{ ...plan[0], monsters: ["sv_hot_fan", "sv_reboot"] }], Infinity)).toEqual({ sv_hot_fan: 1, sv_reboot: 1 });
  });
});

describe("지하 서버실 결과 검증 (서버)", () => {
  const t = { seed: 4321, level: 50, start: 1 };

  it("복사본·되살린 몬스터까지 다 잡은 정직한 판은 통과", () => {
    const r = climb(t.seed, 1, 5, (f, kills) => {
      const ids = towerPlan(t.seed, f).flatMap((w) => w.monsters);
      const macros = ids.filter((m) => m === "sv_excel_macro").length;
      if (macros) kills.sv_excel_macro = (kills.sv_excel_macro ?? 0) + macros * 2;
      const tapes = ids.filter((m) => m === "sv_backup_tape").length;
      const target = ids.find((m) => revivable(m));
      if (tapes && target) kills[target] = (kills[target] ?? 0) + 3 * tapes;
    });
    const v = evalTower(t, r, r.durationMs + 1000);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.best).toBe(5);
  });

  it("복사 몫보다 많이 잡았다고 하면 거절", () => {
    // 매크로가 나오는 층을 찾아 복사 둘보다 하나 더
    let seed = 1;
    while (!towerPlan(seed, 1).some((w) => w.monsters.includes("sv_excel_macro"))) seed++;
    const tt = { ...t, seed };
    const r = climb(seed, 1, 1, (f, kills) => {
      const n = towerPlan(seed, f).flatMap((w) => w.monsters).filter((m) => m === "sv_excel_macro").length;
      kills.sv_excel_macro = (kills.sv_excel_macro ?? 0) + n * 2;
    });
    expect(evalTower(tt, r, r.durationMs + 1000).ok).toBe(true);
    // 다음 층(지금 층)에서 나올 수 있는 만큼을 넘긴다
    const next = towerPlan(seed, 2).flatMap((w) => w.monsters).filter((m) => m === "sv_excel_macro").length;
    const bad = { ...r, kills: { ...r.kills, sv_excel_macro: (r.kills.sv_excel_macro ?? 0) + next * 3 + 1 } };
    expect(evalTower(tt, bad, r.durationMs + 1000).ok).toBe(false);
  });

  it("무한 재부팅은 한 마리 = 처치 하나 (재부팅해도 두 번 세지 않는다) — 계획만큼이면 통과, 두 배면 거절", () => {
    let seed = 1;
    const has = (s: number) => towerPlan(s, 2).some((w) => w.monsters.includes("sv_reboot")) && !towerPlan(s, 2).some((w) => w.elite !== undefined) && !towerPlan(s, 3).some((w) => w.monsters.includes("sv_reboot"));
    while (!has(seed)) seed++;
    const tt = { ...t, seed };
    const r = climb(seed, 1, 2);
    expect(evalTower(tt, r, r.durationMs + 1000).ok).toBe(true);
    const dbl = { ...r, kills: { ...r.kills, sv_reboot: (r.kills.sv_reboot ?? 0) * 2 + 1 } };
    expect(evalTower(tt, dbl, r.durationMs + 1000).ok).toBe(false);
  });
});
