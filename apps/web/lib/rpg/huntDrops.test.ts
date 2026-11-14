import { describe, expect, it } from "vitest";
import { DIFFS, timeLimitSec, zonesOf, type Difficulty } from "./catalog";
import { huntPlan } from "./plan";
import { evaluate, huntBossDrop, huntDropsFor, type TicketInfo } from "./rewards";
import type { HuntResult } from "./types";

// 사냥터 바닥 드롭 연출: 판이 끝나는 순간 화면이 굴린 드롭(huntDropsFor)이
// 서버 판정(evaluate)이 주는 드롭과 언제나 같아야 한다 — 바닥에 떨어진 것과 결과 화면이 어긋나지 않게.

const DS = Object.keys(DIFFS) as Difficulty[];

describe("바닥 드롭 = 서버 드롭", () => {
  it("모든 사냥터·여러 시드·클리어/쓰러짐/중간 종료에서 같다", () => {
    let checked = 0;
    let withDrops = 0;
    for (const d of DS) {
      for (const z of zonesOf(d)) {
        const limit = timeLimitSec("hunt", d, z.id) * 1000;
        for (let seed = 1; seed <= 120; seed++) {
          const t: TicketInfo = { game: "hunt", difficulty: d, seed, zone: z.id, level: DIFFS[d].recLevel + 5, st: { agi: 5, dex: 5, luk: 5 } };
          const plan = huntPlan(seed, d, z.id);
          const killsOf = (k: number) => {
            const out: Record<string, number> = {};
            for (const w of plan.slice(0, k)) for (const m of w.monsters) out[m] = (out[m] ?? 0) + 1;
            return out;
          };
          const half = Math.max(1, Math.floor(plan.length / 2));
          const cases: HuntResult[] = [
            { game: "hunt", durationMs: limit - 1000, kills: killsOf(plan.length), wavesCleared: plan.length, died: false, potionsUsed: {} },
            { game: "hunt", durationMs: limit - 1000, kills: killsOf(plan.length), wavesCleared: plan.length, died: true, potionsUsed: {} },
            { game: "hunt", durationMs: limit - 1000, kills: killsOf(half), wavesCleared: half, died: false, potionsUsed: {} },
            { game: "hunt", durationMs: limit - 1000, kills: killsOf(half), wavesCleared: half, died: true, potionsUsed: {} },
            // 너무 짧은 판은 드롭이 없다
            { game: "hunt", durationMs: 5000, kills: {}, wavesCleared: 0, died: false, potionsUsed: {} },
          ];
          for (const r of cases) {
            const v = evaluate(t, r, r.durationMs + 500);
            if (!v.ok) continue;
            expect(huntDropsFor(t, r), `${z.id} ${seed}`).toEqual(v.drops);
            checked++;
            if (v.drops.length) withDrops++;
          }
        }
      }
    }
    // 검증을 통과한 결과로 충분히 많이, 드롭이 있는 판도 함께 봤다
    expect(checked).toBeGreaterThan(1500);
    expect(withDrops).toBeGreaterThan(100);
  });
});

describe("우두머리 몫은 우두머리를 잡는 순간 정해진다", () => {
  it("우두머리를 잡은 판이면 다 깨든, 남은 몬스터를 못 잡고 쓰러지든 서버 드롭 맨 앞이 그 순간 떨군 우두머리 몫과 같다", () => {
    let withBoss = 0;
    for (const d of DS)
      for (const z of zonesOf(d)) {
        const limit = timeLimitSec("hunt", d, z.id) * 1000;
        for (let seed = 1; seed <= 120; seed++) {
          const t: TicketInfo = { game: "hunt", difficulty: d, seed, zone: z.id, level: DIFFS[d].recLevel + 5, st: { agi: 5, dex: 5, luk: 5 } };
          const plan = huntPlan(seed, d, z.id);
          const all: Record<string, number> = {};
          for (const w of plan) for (const m of w.monsters) all[m] = (all[m] ?? 0) + 1;
          // 마지막 웨이브에서 우두머리 말고 하나를 못 잡고 쓰러짐
          const last = plan[plan.length - 1].monsters;
          const other = last.find((m) => m !== z.boss)!;
          const partial = { ...all, [other]: all[other] - 1 };
          const b = huntBossDrop(t);
          for (const r of [
            { game: "hunt" as const, durationMs: limit - 1000, kills: all, wavesCleared: plan.length, died: false, potionsUsed: {} },
            { game: "hunt" as const, durationMs: limit - 1000, kills: partial, wavesCleared: plan.length - 1, died: true, potionsUsed: {} },
          ]) {
            const v = evaluate(t, r, r.durationMs + 500);
            if (!v.ok) continue;
            expect(huntDropsFor(t, r)).toEqual(v.drops);
            if (b) {
              expect(v.drops[0]).toEqual(b);
              withBoss++;
            } else expect(v.drops.filter((x) => x.kind === "gear").length).toBeLessThanOrEqual(2);
          }
        }
      }
    expect(withBoss).toBeGreaterThan(50);
  });

  it("우두머리를 못 잡은 판에는 우두머리 몫이 없다 (판 끝 굴림만)", () => {
    const t: TicketInfo = { game: "hunt", difficulty: "easy", seed: 7, level: 5, st: { agi: 5, dex: 5, luk: 5 } };
    const plan = huntPlan(7, "easy");
    const kills: Record<string, number> = {};
    for (const w of plan.slice(0, plan.length - 1)) for (const m of w.monsters) kills[m] = (kills[m] ?? 0) + 1;
    const v = evaluate(t, { game: "hunt", durationMs: 100_000, kills, wavesCleared: plan.length - 1, died: true, potionsUsed: {} }, 100_500);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.drops.length).toBeLessThanOrEqual(2);
  });
});
