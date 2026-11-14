import { CHAMP_AURA_OFF, DIR } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { CHAMP_FX_MAX, champTheme, CosmeticFxSim, FX_ART, HALO_HOLE_RX, HALO_HOLE_RY, type FxCmd, type FxInput } from "./cosmeticFx";

// 주간 랭킹 1위 오라: 테마(한 랭킹 색 · 두 색 섞임 · 3관왕 무지개)는 하나로, 몸을 덮지 않고, 입자 수 상한·화면 밖·오라 끔을 지킨다

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

const champCmds = (out: FxCmd[]) => out.filter((c) => c.art.startsWith("champ") || ["coin", "sparkStar", "tierMote", "bubble"].includes(c.art));

function frames(bits: number, look: string[] = [], o: Partial<FxInput> = {}, n = 120): FxCmd[][] {
  const sim = new CosmeticFxSim();
  sim.setLook(look, "hood", bits);
  const all: FxCmd[][] = [];
  for (let i = 0; i < n; i++) {
    const out: FxCmd[] = [];
    sim.step(input({ now: 1000 + i * 47, ...o }), out);
    all.push(out);
  }
  return all;
}

describe("주간 1위 오라", () => {
  it("테마: 한 랭킹은 그 색, 2관왕은 섞인 색 하나, 3관왕은 무지개, 끄거나 1위가 아니면 없음", () => {
    expect(champTheme(1)).toBe(0);
    expect(champTheme(2)).toBe(1);
    expect(champTheme(4)).toBe(2);
    expect(champTheme(3)).toBe(3);
    expect(champTheme(5)).toBe(4);
    expect(champTheme(6)).toBe(5);
    expect(champTheme(7)).toBe(6);
    expect(champTheme(7 | CHAMP_AURA_OFF)).toBe(-1);
    expect(champTheme(0)).toBe(-1);
    expect(champTheme(undefined)).toBe(-1);
  });

  it("다관왕도 오라는 하나 (빛 고리가 겹치지 않는다)", () => {
    for (const out of frames(7, [], {}, 20)) expect(out.filter((c) => c.art === "champGlow")).toHaveLength(1);
  });

  it("몸을 덮지 않는다: 몸 그림과 겹치는 1위 오라 조각은 모두 몸 뒤(body 층, 몸 depth 아래)", () => {
    const f = input();
    for (const bits of [1, 2, 4, 3, 7])
      for (const out of frames(bits))
        for (const c of out) {
          const a = FX_ART[c.art];
          const w = a.w * Math.abs(c.sx);
          const h = a.h * Math.abs(c.sy);
          const left = c.x - w * c.ox;
          const top = c.y - h * c.oy;
          // 몸 그림 상자 (발바닥 위, 머리 꼭대기 아래, 몸 반너비 7)
          const overlaps = left < f.x + 7 && left + w > f.x - 7 && top < f.y - 1 && top + h > f.y - f.artTop;
          if (!overlaps || c.layer === "ground") continue;
          if (c.art === "champHalo") {
            // 후광 고리는 가운데가 뚫려 있다: 구멍이 몸(반너비 7, 머리 위까지)보다 크다
            expect(HALO_HOLE_RX * c.sx).toBeGreaterThan(7 + 2);
            expect(HALO_HOLE_RY * c.sy * 2).toBeGreaterThan(f.artTop + 2);
            expect(c.y).toBeCloseTo(f.headY - f.artTop / 2, 0);
            continue;
          }
          expect(c.layer, `${c.art} ${bits}`).toBe("body");
          expect(c.depth, `${c.art} ${bits}`).toBeLessThan(f.y);
        }
  });

  it("입자 수 상한, 화면 밖이면 그리지 않고, 움직임 줄이기면 은은하게", () => {
    for (const out of frames(7)) expect(champCmds(out).length).toBeLessThanOrEqual(CHAMP_FX_MAX);
    for (const out of frames(7, [], { offscreen: true }, 5)) expect(out).toEqual([]);
    const calm = frames(7, [], { reduced: true }, 3);
    const busy = frames(7, [], {}, 3);
    expect(calm[0].length).toBeLessThan(busy[0].length);
  });

  it("착용 오라와 함께 둘 다 보인다 (착용 오라는 그대로, 1위 오라는 발밑·몸 뒤)", () => {
    const both = frames(1, ["aura_sparkle"], {}, 5)[0];
    const auraOnly = frames(0, ["aura_sparkle"], {}, 5)[0];
    expect(both.filter((c) => c.art === "champRingBack").length).toBeGreaterThan(0);
    expect(both.filter((c) => c.art === "sparkStar" && c.layer !== "light").length).toBeGreaterThanOrEqual(0);
    expect(auraOnly.some((c) => c.art.startsWith("champ"))).toBe(false);
    // 착용 오라 입자 수는 1위 오라가 있어도 같다
    const count = (o: FxCmd[]) => o.filter((c) => c.art === "sparkStar" && Math.abs(c.y - (200 - 9)) < 8).length;
    expect(count(both)).toBeGreaterThanOrEqual(count(auraOnly));
  });
});
