import type { FxSpec } from "./cosmeticFx";
import { cuteGearIcon } from "./cuteGear";
import { Grid } from "./pixel";

// 11/15: 말랑 꾸미기 묶음 중 "아바타 시트 밖에 따로 그리는 것" (발자국 2 · 오라 2 · 동물원 펫 2).
// 그림(CUTE_FX_ART)은 cosmeticFx FX_ART에, 규칙(CUTE_FX)은 COSMETIC_FX에 섞여 들어간다 — 움직임은 기존 동작(prints·pop·float·fall·pet)을 그대로 쓴다.

const EYE = 0x3a2a2e;
const BLUSH = 0xf6a0b4;

function frames(w: number, h: number, n: number, draw: (g: Grid, f: number) => void): () => Grid {
  return () => {
    const g = new Grid(w * n, h);
    for (let f = 0; f < n; f++) {
      const one = new Grid(w, h);
      draw(one, f);
      g.draw(one, f * w, 0);
    }
    return g;
  };
}

export const CUTE_FX_ART = {
  /** 젤리 발자국: 말랑한 젤리 발바닥 (분홍·민트·레몬) */
  cuteJelly: {
    w: 5,
    h: 4,
    frames: 3,
    build: frames(5, 4, 3, (g, f) => {
      const [c, hi] = ([[0xf8a0c0, 0xffd8e6], [0x8ae0c8, 0xd0fff0], [0xffe07a, 0xfff6c8]] as const)[f];
      g.ellipse(2.5, 2.6, 2, 1.4, c, 225);
      g.set(2, 2, hi, 230);
      for (const x of [0, 2, 4]) g.set(x, 0, c, 215);
    }),
  },
  /** 말랑 찹쌀 걸음: 점 눈·볼터치 찹쌀떡 (하양·분홍) */
  cuteMochi: {
    w: 6,
    h: 5,
    frames: 2,
    build: frames(6, 5, 2, (g, f) => {
      const c = f ? 0xfbd0dc : 0xfbf7f0;
      const lo = f ? 0xe8a8b8 : 0xe0d6ca;
      g.ellipse(3, 3, 3, 2, c);
      g.hline(1, 4, 4, lo);
      g.set(2, 2, EYE);
      g.set(4, 2, EYE);
      g.set(1, 3, BLUSH);
      g.set(5, 3, BLUSH);
      g.outline(0x8a6a6a, false, 150);
    }),
  },
  /** 솜사탕 구름 오라: 몽실한 솜사탕 (분홍·하늘) */
  cuteCotton: {
    w: 8,
    h: 6,
    frames: 2,
    build: frames(8, 6, 2, (g, f) => {
      const [c, hi, lo] = f ? [0xb8dcff, 0xe8f4ff, 0x90bce8] : [0xffc0d8, 0xffe8f0, 0xf098b8];
      g.ellipse(2.6, 3.4, 2.4, 2.2, c, 235);
      g.ellipse(5.4, 3.4, 2.4, 2.2, c, 235);
      g.ellipse(4, 2.2, 2.2, 2, c, 235);
      g.set(3, 1, hi);
      g.set(4, 1, hi);
      g.set(2, 2, hi);
      g.hline(2, 5, 5, lo);
    }),
  },
  /** 디저트 비: 마카롱·민트 사탕·딸기 */
  cuteSweet: {
    w: 5,
    h: 5,
    frames: 3,
    build: frames(5, 5, 3, (g, f) => {
      if (f === 0) {
        // 마카롱 (분홍 꼬끄 + 크림)
        g.hline(1, 3, 0, 0xffb8d0);
        g.hline(0, 4, 1, 0xf898b8);
        g.hline(0, 4, 2, 0xfff4e4);
        g.hline(0, 4, 3, 0xf898b8);
        g.hline(1, 3, 4, 0xe080a0);
      } else if (f === 1) {
        // 민트 사탕 (둥근 사탕 + 양옆 포장 꼬임)
        g.ellipse(2.5, 2.5, 1.6, 1.6, 0x8ae0c8);
        g.set(2, 2, 0xffffff);
        g.set(0, 1, 0xfff0a0);
        g.set(0, 3, 0xfff0a0);
        g.set(4, 1, 0xfff0a0);
        g.set(4, 3, 0xfff0a0);
      } else {
        // 딸기
        g.hline(1, 3, 1, 0xe8485a);
        g.hline(0, 4, 2, 0xe8485a);
        g.hline(1, 3, 3, 0xd03a4a);
        g.set(2, 4, 0xd03a4a);
        g.set(1, 2, 0xfff0a0);
        g.set(3, 3, 0xfff0a0);
        g.hline(1, 3, 0, 0x5ab05a);
      }
      g.outline(0x6a4a5a, false, 140);
    }),
  },
  /** 꼬마 햄찌 (동물원 펫): 주황·크림 동글 햄스터, 작은 귀·볼터치 */
  cuteHamster: {
    w: 10,
    h: 8,
    frames: 2,
    build: frames(10, 8, 2, (g, f) => {
      const c = 0xf0a85e;
      const cream = 0xfff0d8;
      g.ellipse(4.8, 4.6, 4, 2.9, c);
      g.ellipse(5.6, 5.4, 2.8, 1.8, cream);
      g.set(3, 1, c);
      g.set(7, 1, c);
      g.set(7, 2, 0xf6b8b8);
      g.set(7, 3, EYE);
      g.set(8, 4, BLUSH);
      g.set(9, 4, 0xe08a9a);
      g.set(2, 3, 0xd8884a);
      // 짧은 발 (걸을 때 번갈아)
      for (const x of f === 0 ? [3, 6] : [4, 7]) g.set(x, 7, 0xf6c8b0);
      g.outline(0x6a3a1a, false, 220);
    }),
  },
  /** 찹쌀 토끼 (동물원 펫): 하얀 동글 토끼, 긴 귀(분홍 속)·볼터치 — 통통 튄다 */
  cuteBunny: {
    w: 11,
    h: 11,
    frames: 2,
    build: frames(11, 11, 2, (g, f) => {
      const c = 0xfbf7f0;
      const lo = 0xe0d6ca;
      g.ellipse(5, 7.6, 4.2, 3, c);
      g.recolor((x, y) => y >= 9, lo);
      // 귀 (한쪽은 살짝 접힌다)
      g.vline(6, 1, 4, c);
      g.vline(7, 2, 4, c);
      g.vline(6, 2, 3, 0xf6c0cc);
      if (f === 0) {
        g.vline(4, 2, 4, c);
        g.set(3, 2, c);
      } else {
        g.vline(4, 1, 4, c);
      }
      g.set(7, 6, EYE);
      g.set(8, 7, BLUSH);
      g.set(9, 7, 0xe8a0b0);
      g.set(1, 7, 0xffffff);
      g.set(0, 7, c);
      g.outline(0x7a6a72, false, 220);
    }),
  },
} as const;

export type CuteFxArtId = keyof typeof CUTE_FX_ART;

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다) */
export const CUTE_FX = {
  feet_jelly: { kind: "trail", art: "cuteJelly", step: 8, life: 2400, motion: "prints" },
  feet_mochi: { kind: "trail", art: "cuteMochi", step: 11, life: 1400, motion: "pop" },
  aura_cotton: { kind: "aura", motion: "float", art: "cuteCotton" },
  aura_sweets: { kind: "aura", motion: "fall", art: "cuteSweet" },
  pet_ham: { kind: "pet", art: "cuteHamster", hover: 0, fps: 10, idleFps: 2.5 },
  pet_mochi: { kind: "pet", art: "cuteBunny", hover: 0, fps: 6, idleFps: 1.4, squash: true },
} satisfies Record<string, FxSpec>;

function blit(dst: Grid, art: CuteFxArtId, frame: number, x: number, y: number, flip = false): void {
  const a = CUTE_FX_ART[art];
  const src = a.build();
  for (let j = 0; j < a.h; j++)
    for (let i = 0; i < a.w; i++) {
      const v = src.px[j * src.w + frame * a.w + i];
      if ((v & 255) === 0) continue;
      const tx = x + (flip ? a.w - 1 - i : i);
      const ty = y + j;
      if (tx >= 0 && ty >= 0 && tx < dst.w && ty < dst.h) dst.px[ty * dst.w + tx] = v;
    }
}

/** 말랑 꾸미기 아이콘 16×16 (시트 그림 + 따로 그리는 연출). 해당 없으면 null */
export function cuteIconGrid(id: string): Grid | null {
  const sheet = cuteGearIcon(id);
  if (sheet) return sheet;
  const g = new Grid(16, 16);
  const put = (art: CuteFxArtId, list: readonly (readonly [number, number, number])[]) => {
    for (const [x, y, f] of list) blit(g, art, f, x, y, x > 7);
  };
  switch (id) {
    case "feet_jelly":
      put("cuteJelly", [[2, 11, 0], [9, 8, 1], [3, 4, 2], [10, 1, 0]]);
      return g;
    case "feet_mochi":
      put("cuteMochi", [[1, 10, 0], [9, 7, 1], [3, 2, 0]]);
      return g;
    case "aura_cotton":
      put("cuteCotton", [[1, 2, 0], [8, 6, 1], [2, 10, 1]]);
      return g;
    case "aura_sweets":
      put("cuteSweet", [[1, 1, 0], [9, 3, 1], [4, 7, 2], [11, 10, 0], [2, 11, 1]]);
      return g;
    case "pet_ham":
      blit(g, "cuteHamster", 0, 3, 7);
      return g;
    case "pet_mochi":
      blit(g, "cuteBunny", 0, 2, 4);
      return g;
    default:
      return null;
  }
}
