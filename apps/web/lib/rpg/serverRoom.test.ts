import { describe, expect, it } from "vitest";
import { HUNT_ZONES, isZoneId, MONSTERS, zonesOf, type MonsterId } from "./catalog";
import { huntSpawnable, revivable } from "./plan";
import { SV_BOSS_ROOM, SV_LOOPS, SV_MONSTER_IDS, SV_POOL, SV_ROOMS, svLoop, svRoom } from "./serverRoom";
import { MONSTER_STATUS } from "./status";
import { evalTower, towerClean, floorMinSec, isBossFloor, towerBlock, towerPlan, towerZone } from "./tower";
import type { HuntResult } from "./types";

// 11/15 야근 빌딩 지하 서버실: 층 → 테마·방 종류, 층 계획(구성 섞기·정예 백업 테이프·우두머리), 서버 상한(복사·되살리기·재부팅)

// 11/15 테마 순서가 판마다 무작위 → 서버실이 visit번째로 나오는 블록을 시드로 찾는다
const SV = "server-room";
/** 1층부터 오르는 판 중 서버실 visit번째(0부터) 블록의 첫 층 (seed 이상에서 처음 찾은 판 — 정예가 섞이는 100층 아래에서만) */
function svBlock(visit: number, from = 1): { seed: number; f: number } {
  for (let seed = from; ; seed++)
    for (let b = 0; b < 19; b++) {
      const at = towerBlock(seed, 1, b * 5 + 1);
      if (at.zone === SV && at.visit === visit) return { seed, f: b * 5 + 1 };
      if (at.zone === SV && at.visit > visit) break;
    }
}
/** 첫 블록(1~5층)이 서버실인 판 시드 */
const svFirst = (from = 1) => {
  for (let seed = from; ; seed++) if (towerZone(seed, 1, 1).id === SV) return seed;
};

/** 깬 층의 계획 몬스터 + 덤(복사·되살림)을 모두 잡은 판 */
function climb(seed: number, start: number, floors: number, extra: (f: number, kills: Partial<Record<MonsterId, number>>) => void = () => {}): HuntResult {
  const kills: Partial<Record<MonsterId, number>> = {};
  for (let i = 0; i < floors; i++) {
    for (const w of towerPlan(seed, start + i, start)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
    extra(start + i, kills);
  }
  return { game: "hunt", durationMs: floors * 50_000 + 5_000, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors, floorMs: floors * 50_000 };
}

describe("지하 서버실 층·테마", () => {
  it("판마다 서버실이 어느 블록에 나올지는 다르다 (블록 다섯 층은 모두 서버실)", () => {
    const firsts = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const { f } = svBlock(0, seed);
      firsts.add(f);
    }
    expect(firsts.size).toBeGreaterThan(2);
    const { seed, f } = svBlock(0);
    for (let k = 0; k < 5; k++) expect(towerZone(seed, 1, f + k).id).toBe(SV);
  });

  it("사냥터 고르기·판 시작 입력에는 없다 (야근 빌딩 전용)", () => {
    expect(isZoneId("server-room")).toBe(false);
    expect(zonesOf("hell").map((z) => z.id)).not.toContain("server-room");
    expect(HUNT_ZONES["server-room"].boss).toBe("sv_legacy_system");
  });

  it("층마다 방: 블록의 보통 층 넷은 모두 다른 방, 우두머리 층은 메인프레임 홀 (판 시드·층으로 — 같은 판 같은 층은 늘 같은 방)", () => {
    const used = new Set<number>();
    for (let seed = 1; seed < 40; seed++)
      for (let b = 0; b < 6; b++) {
        const base = b * 5;
        const rooms = [1, 2, 3, 4].map((k) => svRoom(seed, base + k));
        expect(new Set(rooms).size, `${seed} ${base + 1}층 블록`).toBe(4);
        for (const r of rooms) {
          expect(r).toBeLessThan(SV_BOSS_ROOM);
          used.add(r);
        }
        expect(svRoom(seed, base + 5)).toBe(SV_BOSS_ROOM);
      }
    expect(used.size).toBe(SV_ROOMS);
    expect(svRoom(7, 12)).toBe(svRoom(7, 12));
  });

  it("다시 올 때마다 판이 달라진다 (평상시 → 정전 → 비상 경보 → 멜트다운)", () => {
    expect([0, 1, 2, 3, 4].map((v) => svLoop(v).name)).toEqual([SV_LOOPS[0].name, SV_LOOPS[1].name, SV_LOOPS[2].name, SV_LOOPS[3].name, SV_LOOPS[3].name]);
    expect(svLoop(2).heatMs).toBeLessThan(svLoop(0).heatMs);
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

  it("순서표: 처음 온 블록 첫 층은 두 종, 층마다 새 몬스터 한두 종, 두 번째로 오면 남은 종이 들어오고, 판 시드와 상관없이 같은 자리는 같은 구성", () => {
    const ids = (seed: number, f: number) => new Set(towerPlan(seed, f, 1).flatMap((w) => w.monsters).filter((m) => !MONSTERS[m].minion && m !== "sv_backup_tape" && m !== "sv_legacy_system"));
    const a0 = svBlock(0);
    const a1 = svBlock(1);
    expect([...ids(a0.seed, a0.f)].sort()).toEqual(["sv_excel_macro", "sv_tangled_lan"]);
    const seen = new Set<string>();
    const floors = [0, 1, 2, 3, 4].map((k) => ({ ...a0, f: a0.f + k })).concat([0, 1, 2, 3, 4].map((k) => ({ ...a1, f: a1.f + k })));
    for (const [i, x] of floors.entries()) {
      const now = ids(x.seed, x.f);
      // 다른 판에서도 같은 자리(같은 visit·pos)면 같은 몬스터 종류
      const other = svBlock(i < 5 ? 0 : 1, x.seed + 1);
      expect([...ids(other.seed, other.f + (i % 5))].sort(), `${i}`).toEqual([...now].sort());
      const fresh = [...now].filter((m) => !seen.has(m));
      expect(fresh.length, `${i}번째 층 새 몬스터`).toBeLessThanOrEqual(2);
      for (const m of now) seen.add(m);
    }
    for (const id of SV_POOL) expect(seen.has(id), id).toBe(true);
  });

  it("정예 백업 테이프: 처음 온 블록 4번째 층, 두 번째 3·4번째, 세 번째 2·3·4번째 (둘째 웨이브) / 우두머리 층 마지막 웨이브는 레거시 시스템", () => {
    const elite = (seed: number, f: number) => towerPlan(seed, f, 1).some((w) => w.elite !== undefined);
    for (let s0 = 1; s0 < 30; s0 += 7) {
      const [a, b2, c] = [svBlock(0, s0), svBlock(1, s0), svBlock(2, s0)];
      expect([0, 1, 2, 3].map((k) => elite(a.seed, a.f + k))).toEqual([false, false, false, true]);
      expect([0, 1, 2, 3].map((k) => elite(b2.seed, b2.f + k))).toEqual([false, false, true, true]);
      expect([0, 1, 2, 3].map((k) => elite(c.seed, c.f + k))).toEqual([false, true, true, true]);
      const w = towerPlan(a.seed, a.f + 3, 1)[1];
      expect(w.monsters[w.elite!]).toBe("sv_backup_tape");
    }
    const a = svBlock(0);
    expect(isBossFloor(a.f + 4)).toBe(true);
    const boss = towerPlan(a.seed, a.f + 4, 1);
    expect(boss.at(-1)!.monsters[0]).toBe("sv_legacy_system");
    expect(boss.at(-1)!.summon?.id).toBe("sv_excel_macro");
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
  const S = svFirst(4321);
  const t = { seed: S, level: 50, start: 1 };

  it("복사본·되살린 몬스터까지 다 잡은 정직한 판은 통과", () => {
    const r = climb(t.seed, 1, 5, (f, kills) => {
      const ids = towerPlan(t.seed, f, 1).flatMap((w) => w.monsters);
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
    // 첫 블록이 서버실이면 1층에 매크로가 나온다 → 복사 둘보다 하나 더
    const seed = svFirst(5);
    expect(towerPlan(seed, 1, 1).some((w) => w.monsters.includes("sv_excel_macro"))).toBe(true);
    const tt = { ...t, seed };
    const r = climb(seed, 1, 1, (f, kills) => {
      const n = towerPlan(seed, f, 1).flatMap((w) => w.monsters).filter((m) => m === "sv_excel_macro").length;
      kills.sv_excel_macro = (kills.sv_excel_macro ?? 0) + n * 2;
    });
    expect(towerClean(evalTower(tt, r, r.durationMs + 1000))).toBe(true);
    // 다음 층(지금 층)에서 나올 수 있는 만큼을 넘긴다
    const next = towerPlan(seed, 2, 1).flatMap((w) => w.monsters).filter((m) => m === "sv_excel_macro").length;
    const bad = { ...r, kills: { ...r.kills, sv_excel_macro: (r.kills.sv_excel_macro ?? 0) + next * 3 + 1 } };
    expect(towerClean(evalTower(tt, bad, r.durationMs + 1000))).toBe(false);
  });

  it("무한 재부팅은 한 마리 = 처치 하나 (재부팅해도 두 번 세지 않는다) — 계획만큼이면 통과, 두 배면 거절", () => {
    // 서버실에 두 번째로 온 블록 첫 두 층 (재부팅은 두 번째 층에만)
    const at = svBlock(1, 77);
    const tt = { seed: at.seed, level: 50, start: 1 };
    const r = climb(at.seed, 1, at.f + 1);
    expect(r.kills.sv_reboot ?? 0).toBeGreaterThan(0);
    expect(towerClean(evalTower(tt, r, r.durationMs + 1000))).toBe(true);
    const dbl = { ...r, kills: { ...r.kills, sv_reboot: (r.kills.sv_reboot ?? 0) * 2 + 1 } };
    expect(towerClean(evalTower(tt, dbl, r.durationMs + 1000))).toBe(false);
  });

  it("테스트 서버 슈퍼 계정(서버가 판정)만 처치 속도 상한을 뺀다 — 계획에 없는 몬스터·층 부풀리기는 그대로 거절", () => {
    // 나올 수 있는 만큼(복사·되살림·졸개까지) 다 잡고 최소 시간에 4층 — 레벨 1이면 처치 속도 상한에 걸린다
    const kills: Partial<Record<MonsterId, number>> = {};
    let minSec = 0;
    for (let f = 1; f <= 5; f++) {
      const p = towerPlan(S, f, 1);
      if (f <= 4) minSec += floorMinSec(p);
      for (const [id, n] of Object.entries(huntSpawnable(p, Infinity)) as [MonsterId, number][]) kills[id] = (kills[id] ?? 0) + n;
    }
    const ms = Math.round(minSec * 1000) + 1500;
    const fast: HuntResult = { game: "hunt", durationMs: ms, kills, wavesCleared: 0, died: true, potionsUsed: {}, floors: 4, floorMs: ms };
    const can = evalTower({ seed: S, level: 1, start: 1 }, fast, ms + 1000);
    const lax = evalTower({ seed: S, level: 1, start: 1 }, fast, ms + 1000, { lax: true });
    expect(lax.ok).toBe(true);
    // 상한을 넘을 만큼 빨랐는지 (아니면 이 시험은 의미가 없다)
    expect(towerClean(can)).toBe(false);
    expect(towerClean(evalTower({ seed: S, level: 1, start: 1 }, { ...fast, floors: 9 }, ms + 1000, { lax: true }))).toBe(false);
  });
});
