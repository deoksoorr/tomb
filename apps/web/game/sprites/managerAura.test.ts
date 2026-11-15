import { CHAMP_AURA_OFF, DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { CHAMP_FX_MAX, CosmeticFxSim, FX_ART, MANAGER_THEME, STAFF_THEME, type FxCmd, type FxInput } from "./cosmeticFx";

// 11/16 매니저 오라: 전용 오라 자리(운영자 → 1위 → 매니저 순서로 하나), 민트·청록 테마 + 빙글 도는 서류, 몸을 덮지 않고 사냥 화면에선 몸 뒤로 은은하게

const input = (o: Partial<FxInput> = {}): FxInput => ({
  now: 1000,
  dt: 16,
  x: 100,
  y: 200,
  headY: 200,
  dir: DIR.down,
  moving: false,
  hidden: false,
  artTop: 18,
  shoulder: 7,
  hand: { dx: 5.5, up: 6 },
  reduced: false,
  ...o,
});

function run(o: { look?: string[]; champ?: number; staff?: boolean; mgr?: boolean; soft?: number; reduced?: boolean }, n = 80): FxCmd[][] {
  const sim = new CosmeticFxSim();
  sim.setLook(o.look ?? [], "hood", o.champ ?? 0, o.staff ?? false, o.mgr ?? false);
  const all: FxCmd[][] = [];
  for (let i = 0; i < n; i++) {
    const out: FxCmd[] = [];
    sim.step(input({ now: 1000 + i * 47, ...(o.soft !== undefined ? { staffSoft: o.soft } : {}), ...(o.reduced ? { reduced: true } : {}) }), out);
    all.push(out);
  }
  return all;
}
const themeOf = (frames: FxCmd[][]) => {
  const glow = frames.flat().find((c) => c.art === "champGlow");
  return glow ? glow.frame : -1;
};

describe("11/16 매니저 오라", () => {
  it("매니저면 매니저 테마의 전용 오라 + 서류·민트 반짝이 (운영자 넋 불빛·연기, 1위 금화는 없다)", () => {
    const f = run({ mgr: true });
    expect(themeOf(f)).toBe(MANAGER_THEME);
    const arts = new Set(f.flat().map((c) => c.art));
    expect(arts.has("mgrPaper")).toBe(true);
    expect(arts.has("mgrStar")).toBe(true);
    for (const a of ["soulFlame", "staffSmoke", "coin", "champEmber", "champDrop"]) expect(arts.has(a as FxCmd["art"])).toBe(false);
    for (const out of f) expect(out.length).toBeLessThanOrEqual(CHAMP_FX_MAX);
    for (const c of f.flat()) expect(c.frame).toBeLessThan(FX_ART[c.art].frames);
    // 매니저가 아니면 없다
    expect(run({}).flat()).toEqual([]);
  });

  it("전용 오라 자리는 하나: 운영자 오라 → 1위 오라 → 매니저 오라 순서. 착용 오라는 함께 보인다", () => {
    expect(themeOf(run({ mgr: true, staff: true }))).toBe(STAFF_THEME);
    expect(themeOf(run({ mgr: true, champ: 1 }))).toBe(0);
    // 1위 오라를 껐으면 매니저 오라
    expect(themeOf(run({ mgr: true, champ: 1 | CHAMP_AURA_OFF }))).toBe(MANAGER_THEME);
    const both = run({ mgr: true, look: ["aura_sparkle"] }).flat();
    expect(both.some((c) => c.art === "mgrPaper")).toBe(true);
    expect(both.some((c) => c.art === "sparkStar")).toBe(true);
  });

  it("몸을 덮지 않는다: 몸 그림과 겹치는 서류·반짝이는 모두 몸 뒤", () => {
    for (const c of run({ mgr: true }).flat()) {
      if (c.art !== "mgrPaper" && c.art !== "mgrStar") continue;
      const a = FX_ART[c.art];
      const hw = (a.w * Math.abs(c.sx)) / 2;
      const top = c.y - a.h * Math.abs(c.sy) * c.oy;
      const over = Math.abs(c.x - 100) < 7 + hw && top < 199 && top + a.h * Math.abs(c.sy) > 200 - 18;
      if (over) expect(c.layer === "body" && c.depth < 200).toBe(true);
    }
  });

  it("사냥 화면(staffSoft): 운영자 오라처럼 모두 몸 뒤, 투명도는 그만큼만", () => {
    const loud = run({ mgr: true }, 40).flat();
    const soft = run({ mgr: true, soft: 0.45 }, 40).flat();
    expect(soft).toHaveLength(loud.length);
    expect(loud.some((c) => c.layer === "light")).toBe(true);
    for (let i = 0; i < soft.length; i++) {
      expect(soft[i].layer).not.toBe("light");
      if (soft[i].layer === "body") expect(soft[i].depth).toBeLessThan(200);
      expect(soft[i].alpha).toBeCloseTo(loud[i].alpha * 0.45, 5);
    }
  });

  it("움직임 줄이기면 멈춘 모습 (매 프레임 같다)", () => {
    const f = run({ mgr: true, reduced: true }, 3);
    expect(f[1]).toEqual(f[2]);
  });
});
