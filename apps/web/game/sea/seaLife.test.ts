import { describe, expect, it } from "vitest";
import { tideLineY, tideOpen } from "@tomb/protocol";
import type { AmbienceOverride } from "@/lib/ambience";
import { clearPath, FolkSim, type FolkCtx, type FolkDef, type FolkWorld } from "../world/life/folkSim";
import { lintFolkLines } from "../world/life/folkLint";
import { SEA_FOLK, SEA_FOLK_PAIRS, seaFolkWorld } from "./seaLifeData";

// 11/16 바닷가 주민: 걷는 길이 모두 걸을 수 있는 땅인지, 물때·시간·날씨에 맞게 일과가 바뀌는지, 대사 형식.

/** 한국 자정(= 만조) 기준 시각 */
const MIDNIGHT = Date.UTC(2026, 10, 16, 15, 0, 0);
const HOUR = 3_600_000;
const MIN = 60_000;

function sims(override: AmbienceOverride = {}, seed = 7): { sim: FolkSim; world: FolkWorld }[] {
  const world = seaFolkWorld(override);
  return SEA_FOLK.map((def, i) => {
    const pair = SEA_FOLK_PAIRS[def.id];
    const lead = pair ? SEA_FOLK.findIndex((d) => d.id === pair.lead) : -1;
    return { sim: new FolkSim(def, i, seed, world, pair ? { index: lead, dx: pair.dx } : null), world };
  });
}

function legGrid(sim: FolkSim, k: number) {
  return sim.gridFor(sim.ctxOf(k));
}

describe("바닷가 주민 길", () => {
  it("모든 자리는 걸을 수 있는 칸이고, 헤엄치지 않는 주민의 자리는 그때 물 밖이다", () => {
    const world = seaFolkWorld();
    const g = world.grid;
    const open = (x: number, y: number) => !g.blocked(Math.floor(x / g.cell), Math.floor(y / g.cell));
    const ctxs: FolkCtx[] = [];
    for (const tide of [0, 0.25, 0.5, 0.8, 1])
      for (const hour of [6, 12, 18.5, 23])
        for (const weather of ["clear", "rain"] as const) ctxs.push({ tide, open: tide < 0.25, hour, phase: hour < 7 ? "dawn" : hour < 17.5 ? "day" : hour < 19.5 ? "dusk" : "night", weather });
    for (const def of SEA_FOLK)
      for (const c of ctxs) {
        const plans = def.plans(c);
        expect(plans.length, `${def.id} 할 일 없음`).toBeGreaterThan(0);
        for (const p of plans)
          for (const s of p.spots) {
            const dx = SEA_FOLK_PAIRS[def.id]?.dx ?? 0;
            expect(open(s.x + dx, s.y), `${def.id} ${p.act} (${s.x + dx},${s.y}) 막힘`).toBe(true);
            if (!def.swimmer) expect(world.wet!(s.x + dx, s.y, c), `${def.id} ${p.act} (${s.x},${s.y}) 물속 (물 ${c.tide})`).toBe(false);
          }
      }
  });

  it("하루 내내 걷는 길은 막힌 칸을 스치지 않고, 헤엄치지 않으면 물에 들어가지 않고, 목적지에 닿는다", () => {
    for (const { sim, world } of sims()) {
      const step = Math.floor((48 * HOUR) / sim.def.legMs / 120);
      const k0 = sim.legOf(MIDNIGHT);
      for (let i = 0; i < 120; i++) {
        const k = k0 + i * step;
        const leg = sim.legAt(k);
        const g = legGrid(sim, k);
        expect(clearPath(g, leg.path), `${sim.def.id} 구간 ${k} 길이 막힌 칸을 스침`).toBe(true);
        const ctx = sim.ctxOf(k);
        if (!sim.def.swimmer) for (const p of leg.path) expect(world.wet!(p.x, p.y, ctx), `${sim.def.id} 구간 ${k} (${p.x},${p.y}) 물속`).toBe(false);
        const end = leg.path[leg.path.length - 1];
        const want = sim.destOf(k).spot;
        expect(Math.hypot(end.x - want.x, end.y - want.y), `${sim.def.id} 구간 ${k} ${leg.plan.act} (${want.x},${want.y})에 못 닿음`).toBeLessThan(2);
        expect(leg.dur).toBeLessThanOrEqual(sim.def.legMs * 0.8 + 1);
      }
    }
  }, 60_000);

  it("같은 시드·시각이면 같은 자리 (모두가 같은 주민을 본다)", () => {
    const a = sims();
    const b = sims();
    for (let t = MIDNIGHT; t < MIDNIGHT + 6 * HOUR; t += 17 * MIN + 333)
      for (let i = 0; i < a.length; i++) {
        const p = a[i].sim.at(t);
        const q = b[i].sim.at(t);
        expect([p.x, p.y, p.state, p.hidden]).toEqual([q.x, q.y, q.state, q.hidden]);
      }
  });

  it("짝(하루·이틀)은 같은 일을 나란히 한다", () => {
    const list = sims();
    const A = list.find((s) => s.sim.def.id === "tourA")!.sim;
    const B = list.find((s) => s.sim.def.id === "tourB")!.sim;
    for (let t = MIDNIGHT + 9 * HOUR; t < MIDNIGHT + 15 * HOUR; t += 11 * MIN) {
      const p = A.at(t);
      const q = B.at(t);
      expect(q.act).toBe(p.act);
      if (!p.moving && !q.moving) expect(Math.hypot(q.x - p.x - SEA_FOLK_PAIRS.tourB.dx, q.y - p.y)).toBeLessThan(3);
    }
  });
});

/** t부터 n시간 동안 legMs마다 그 주민이 하는 일 */
function acts(def: FolkDef, t0: number, hours: number, override: AmbienceOverride = {}) {
  const world = seaFolkWorld(override);
  const sim = new FolkSim(def, SEA_FOLK.indexOf(def), 3, world);
  const out: { act: string; ctx: FolkCtx }[] = [];
  for (let t = t0; t < t0 + hours * HOUR; t += def.legMs) {
    const k = sim.legOf(t);
    out.push({ act: sim.destOf(k).plan.act, ctx: sim.ctxOf(k) });
  }
  return out;
}
const byId = (id: string) => SEA_FOLK.find((d) => d.id === id)!;
const share = (xs: { act: string }[], act: string) => xs.filter((x) => x.act === act).length / Math.max(1, xs.length);

describe("바닷가 주민 일과", () => {
  it("조개 할매는 갯벌이 열렸을 때만 캐고, 열리면 대부분 캔다", () => {
    const list = acts(byId("clamgran"), MIDNIGHT, 48, { hour: 13 });
    const open = list.filter((x) => x.ctx.open);
    const shut = list.filter((x) => !x.ctx.open);
    expect(share(open, "dig")).toBeGreaterThan(0.55);
    expect(share(shut, "dig")).toBe(0);
  });

  it("숨비 할망은 물이 찼을 때 물질을 많이 하고 간조엔 바위에서 쉰다", () => {
    const list = acts(byId("haenyeo"), MIDNIGHT, 48, { hour: 11 });
    const high = list.filter((x) => x.ctx.tide > 0.7);
    const low = list.filter((x) => x.ctx.tide < 0.2);
    expect(share(high, "dive")).toBeGreaterThan(share(low, "dive") + 0.2);
    expect(share(low, "sit")).toBeGreaterThan(share(high, "sit"));
  });

  it("구조요원은 낮엔 망보고 밤엔 퇴근한다", () => {
    expect(share(acts(byId("lifeguard"), MIDNIGHT, 12, { hour: 13 }), "watch")).toBeGreaterThan(0.5);
    expect(share(acts(byId("lifeguard"), MIDNIGHT, 12, { hour: 23 }), "away")).toBeGreaterThan(0.8);
  });

  it("달마중은 밤에만 나온다", () => {
    expect(share(acts(byId("moonwalker"), MIDNIGHT, 12, { hour: 13 }), "away")).toBe(1);
    expect(share(acts(byId("moonwalker"), MIDNIGHT, 12, { hour: 22, weather: "clear" }), "away")).toBeLessThan(0.15);
  });

  it("비 오면 바닷가에 나와 있는 주민이 줄어든다", () => {
    const seen = (weather: "clear" | "rain") => {
      let n = 0;
      let all = 0;
      for (const def of SEA_FOLK) {
        if (def.kind !== "ghost") continue;
        for (const x of acts(def, MIDNIGHT, 24, { hour: 14, weather })) {
          all++;
          if (x.act !== "away") n++;
        }
      }
      return n / all;
    };
    expect(seen("rain")).toBeLessThan(seen("clear") - 0.15);
  });

  it("강아지는 물가를 뛰어다닌다 (물가 자리는 그때 물 밖)", () => {
    const world = seaFolkWorld({ hour: 12, weather: "clear" });
    const dog = byId("beachdog");
    for (const tide of [0, 0.3, 0.6, 1]) {
      const plans = dog.plans({ tide, open: tide < 0.25, hour: 12, phase: "day", weather: "clear" });
      const play = plans.find((p) => p.act === "play")!;
      expect(play.spots.length).toBeGreaterThan(4);
      for (const s of play.spots) {
        expect(s.y).toBeLessThan(tideLineY(tide));
        expect(world.wet!(s.x, s.y, { tide, open: false, hour: 12, phase: "day", weather: "clear" })).toBe(false);
      }
    }
  });

  it("시험 시각 확인: 자정은 만조, 1시간 반 뒤는 갯벌이 열린다", () => {
    expect(tideOpen(MIDNIGHT)).toBe(false);
    expect(tideOpen(MIDNIGHT + 90 * MIN)).toBe(true);
  });
});

describe("바닷가 주민 대사", () => {
  it("말머리 꼬리표(이름:) 없이 짧고, 시각을 넣은 줄도 콜론이 없다", () => {
    expect(lintFolkLines(SEA_FOLK, [MIDNIGHT, MIDNIGHT + 5 * HOUR + 7 * MIN, MIDNIGHT + 13 * HOUR + 30 * MIN])).toEqual([]);
  });

  it("물때 안내 줄은 다음 갯벌 열리는 시각을 말한다", () => {
    const gran = byId("clamgran");
    const fn = gran.lines.find((l) => typeof l.t === "function" && l.t(MIDNIGHT).includes("시"))!;
    // 자정(만조) → 다음 열림은 1시 (한 바퀴의 60분)
    expect((fn.t as (n: number) => string)(MIDNIGHT)).toContain("1시");
  });
});
