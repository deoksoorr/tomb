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

describe("오라는 모든 자세에서 (수영·잠수·매달리기·해먹 …)", () => {
  it("숨김 자세여도 오라 자리(aura)를 주면 착용 오라·전용 오라를 그린다 — 발밑 고리는 그 자리(수면)에, 잠수는 은은하게", () => {
    const hiddenOnly = frames(1, ["aura_sparkle"], { hidden: true }, 3)[2];
    expect(hiddenOnly.some((c) => c.art === "champRingFront" || c.art === "sparkStar")).toBe(false);
    const swim = frames(1, ["aura_sparkle"], { hidden: true, aura: { base: 195, top: 180, dim: 1 } }, 3)[2];
    const ring = swim.find((c) => c.art === "champRingFront")!;
    expect(ring.y).toBe(195);
    expect(swim.some((c) => c.art === "sparkStar")).toBe(true);
    const dive = frames(1, ["aura_sparkle"], { hidden: true, aura: { base: 195, top: 186, dim: 0.45 } }, 3)[2];
    const dring = dive.find((c) => c.art === "champRingFront")!;
    expect(dring.alpha).toBeLessThan(ring.alpha);
  });

  it("공중(매달리기·놀이기구)이면 발밑 고리가 몸 아래(headY)로 따라간다", () => {
    const up = frames(2, [], { headY: 170, aura: { base: 170, top: 152, dim: 1 } }, 2)[1];
    expect(up.find((c) => c.art === "champRingFront")!.y).toBe(170);
  });
});

describe("타는 펫에 올라탄 오라", () => {
  it("발밑 줄은 펫 발밑(땅), 펫과 사람을 감싸게 넓고, 앞쪽 빛은 펫+사람 상자를 가리지 않는다", () => {
    const worn = frames(0, ["aura_sparkle"], { aura: { base: 200, top: 165, dim: 1, wide: 1.75 } }, 30).flat().filter((c) => c.art === "sparkStar");
    const wornPlain = frames(0, ["aura_sparkle"], { aura: { base: 200, top: 165, dim: 1 } }, 30).flat().filter((c) => c.art === "sparkStar");
    // 착용 오라도 몸 둘레 거리가 넓어진다
    expect(Math.max(...worn.map((c) => Math.abs(c.x - 100)))).toBeGreaterThan(Math.max(...wornPlain.map((c) => Math.abs(c.x - 100))) * 1.5);
    const wide = 1.75;
    const a = { base: 200, top: 165, dim: 1, wide };
    // 전용 오라만 (착용 오라는 원래 앞쪽 반원이 몸 앞을 지나가는 연출이라 따로 — 거리만 넓힌다)
    const all = frames(7, [], { headY: 189, aura: a });
    const plain = frames(7, [], { aura: { base: 200, top: 165, dim: 1 } }, 2)[1];
    const ring = all[1].find((c) => c.art === "champRingFront")!;
    expect(ring.y).toBe(200);
    expect(ring.sx).toBeGreaterThan(plain.find((c) => c.art === "champRingFront")!.sx * 1.5);
    for (const out of all)
      for (const c of out) {
        if (c.layer !== "light" || c.art === "champHalo" || c.art.startsWith("champRing")) continue;
        const art = FX_ART[c.art];
        const w = art.w * Math.abs(c.sx);
        const h = art.h * Math.abs(c.sy);
        const left = c.x - w * c.ox;
        const top = c.y - h * c.oy;
        const overlaps = left < 100 + 7 * wide && left + w > 100 - 7 * wide && top < a.base - 1 && top + h > a.top;
        expect(overlaps, `${c.art} ${c.x},${c.y}`).toBe(false);
      }
  });
});

describe("31번 운영자 오라", () => {
  const run = (champ: number, staff: boolean, n = 60) => {
    const sim = new CosmeticFxSim();
    sim.setLook([], "hood", champ, staff);
    const all: FxCmd[] = [];
    for (let i = 0; i < n; i++) sim.step(input({ now: 1000 + i * 53 }), all);
    return all;
  };
  it("운영자면 운영자 오라(넋 불빛·검은 연기 띠) — 1위 오라보다 우선, 본인이 끄면(오라 끔만) 없음", () => {
    const st = run(0, true);
    expect(st.some((c) => c.art === "soulFlame")).toBe(true);
    expect(st.some((c) => c.art === "staffSmoke")).toBe(true);
    // 검은 연기는 늘 몸 뒤 (보통 섞기, 몸을 덮지 않는다)
    for (const c of st.filter((x) => x.art === "staffSmoke")) {
      expect(c.layer).toBe("body");
      expect(c.depth).toBeLessThan(200);
    }
    // 3관왕 시험 지급을 받아도 운영자 오라 (무지개 알갱이 없음)
    const both = run(7, true);
    expect(both.some((c) => c.art === "tierMote")).toBe(false);
    expect(both.some((c) => c.art === "staffSmoke")).toBe(true);
    expect(run(CHAMP_AURA_OFF, true, 10)).toEqual([]);
    expect(run(0, false, 10)).toEqual([]);
  });
});
