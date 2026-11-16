import { describe, expect, it } from "vitest";
import { inCampStream } from "@tomb/protocol";
import type { AmbienceOverride } from "@/lib/ambience";
import { clearPath, FolkSim, type FolkCtx, type FolkDef } from "../world/life/folkSim";
import { lintFolkLines } from "../world/life/folkLint";
import { CAMP_FOLK, campFolkWorld } from "./campLifeData";

// 11/16 캠핑장 주민: 걷는 길이 모두 걸을 수 있는 땅인지, 시간·날씨에 맞게 일과가 바뀌는지, 대사 형식.

const T0 = Date.UTC(2026, 10, 16, 15, 0, 0); // 한국 자정
const HOUR = 3_600_000;
const phaseOf = (h: number): FolkCtx["phase"] => (h >= 5 && h < 7 ? "dawn" : h >= 7 && h < 17.5 ? "day" : h >= 17.5 && h < 19.5 ? "dusk" : "night");

describe("캠핑장 주민 길", () => {
  it("모든 자리는 걸을 수 있는 칸이고 계곡 물속이 아니다", () => {
    const g = campFolkWorld().grid;
    for (const def of CAMP_FOLK)
      for (const hour of [3, 6, 12, 18, 21, 23.5])
        for (const weather of ["clear", "rain", "cloudy"] as const) {
          const plans = def.plans({ hour, phase: phaseOf(hour), weather, tide: 0, open: false });
          expect(plans.length, `${def.id} ${hour}시 할 일 없음`).toBeGreaterThan(0);
          for (const p of plans)
            for (const s of p.spots) {
              expect(g.blocked(Math.floor(s.x / g.cell), Math.floor(s.y / g.cell)), `${def.id} ${p.act} (${s.x},${s.y}) 막힘`).toBe(false);
              expect(inCampStream(s.x, s.y)).toBe(false);
              // 뛰어노는 자리는 둘레(좌우 18·위아래 7)도 트여 있어야 (제자리 둘레를 뛰어다닌다)
              if (p.act === "play")
                for (const [dx, dy] of [[-18, 0], [18, 0], [0, -7], [0, 7], [-18, -7], [18, 7], [-18, 7], [18, -7]])
                  expect(g.blocked(Math.floor((s.x + dx) / g.cell), Math.floor((s.y + dy) / g.cell)), `${def.id} 놀이 자리 (${s.x},${s.y}) 둘레 막힘`).toBe(false);
            }
        }
  });

  it("하루 내내 걷는 길은 막힌 칸을 스치지 않고 목적지에 닿는다", () => {
    const world = campFolkWorld();
    CAMP_FOLK.forEach((def, i) => {
      const sim = new FolkSim(def, i, 5, world);
      const k0 = sim.legOf(T0);
      const step = Math.floor((48 * HOUR) / def.legMs / 100);
      for (let n = 0; n < 100; n++) {
        const k = k0 + n * step;
        const leg = sim.legAt(k);
        expect(clearPath(world.grid, leg.path), `${def.id} 구간 ${k} 길이 막힌 칸을 스침`).toBe(true);
        for (const p of leg.path) expect(inCampStream(p.x, p.y, -2) && !(p.y > 270 && p.y < 300) && !(p.y > 570 && p.y < 600), `${def.id} 물 (${p.x},${p.y})`).toBe(false);
        const end = leg.path[leg.path.length - 1];
        const want = sim.destOf(k).spot;
        expect(Math.hypot(end.x - want.x, end.y - want.y), `${def.id} ${leg.plan.act} (${want.x},${want.y})에 못 닿음`).toBeLessThan(2);
      }
    });
  }, 60_000);
});

function acts(id: string, override: AmbienceOverride, hours = 12) {
  const def = CAMP_FOLK.find((d) => d.id === id) as FolkDef;
  const sim = new FolkSim(def, CAMP_FOLK.indexOf(def), 3, campFolkWorld(override));
  const out: string[] = [];
  for (let t = T0; t < T0 + hours * HOUR; t += def.legMs) out.push(sim.destOf(sim.legOf(t)).plan.act);
  return out;
}
const share = (xs: string[], a: string) => xs.filter((x) => x === a).length / xs.length;

describe("캠핑장 주민 일과", () => {
  it("콩이가 뛰노는 자리가 넉넉하다 (캠핑카 마당)", () => {
    const kid = CAMP_FOLK.find((d) => d.id === "kid")!;
    const play = kid.plans({ hour: 11, phase: "day", weather: "clear", tide: 0, open: false }).filter((p) => p.act === "play");
    expect(play[0].spots.length).toBeGreaterThanOrEqual(3);
  });
  it("장작 아재는 낮엔 장작을 패고 해 질 녘엔 불을 지킨다", () => {
    expect(share(acts("woodman", { hour: 11, weather: "clear" }), "chop")).toBeGreaterThan(0.5);
    expect(share(acts("woodman", { hour: 18.5, weather: "clear" }), "stand")).toBeGreaterThan(0.5);
  });
  it("별바라기는 맑은 밤에 전망대에서 별을 본다", () => {
    expect(share(acts("stargirl", { hour: 22, weather: "clear" }), "gaze")).toBeGreaterThan(0.6);
    expect(share(acts("stargirl", { hour: 12, weather: "clear" }), "gaze")).toBe(0);
  });
  it("할배는 낮엔 거의 낚시하고, 늦은 밤엔 들어간다", () => {
    expect(share(acts("angler", { hour: 10, weather: "clear" }), "fish")).toBeGreaterThan(0.6);
    expect(share(acts("angler", { hour: 23, weather: "clear" }), "away")).toBeGreaterThan(0.8);
  });
  it("비 오면 나와 있는 캠퍼가 줄어든다", () => {
    const out = (weather: "clear" | "rain") => {
      const all = CAMP_FOLK.filter((d) => d.kind === "ghost").flatMap((d) => acts(d.id, { hour: 14, weather }, 6));
      return 1 - share(all, "away");
    };
    expect(out("rain")).toBeLessThan(out("clear") - 0.15);
  });
});

describe("캠핑장 주민 대사", () => {
  it("말머리 꼬리표(이름:) 없이 짧다", () => {
    expect(lintFolkLines(CAMP_FOLK, [T0])).toEqual([]);
  });
});
