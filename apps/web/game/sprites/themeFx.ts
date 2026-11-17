import type { FxSpec } from "./cosmeticFx";
import { Grid } from "./pixel";
import { themeGearIcon } from "./themeGear";

// 11/17 테마 꾸미기 묶음 중 "아바타 시트 밖에 따로 그리는 것" (발자국 둘: 모닥불 불씨 걸음 · 모래사장 발자국).
// 그림(THEME_FX_ART)은 cosmeticFx FX_ART에, 규칙(THEME_FX)은 COSMETIC_FX에 섞여 들어간다 — 움직임은 기존 동작(rise·prints)을 쓴다.

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

export const THEME_FX_ART = {
  /** 모닥불 불씨: 작은 불티 (노랑 → 주황 → 빨강 끝) */
  thEmber: {
    w: 3,
    h: 4,
    frames: 3,
    build: frames(3, 4, 3, (g, f) => {
      const [hi, c, lo] = ([[0xfff2a0, 0xffb040, 0xe0502a], [0xffe080, 0xff8a30, 0xc8402a], [0xffffff, 0xffd060, 0xff7a30]] as const)[f];
      g.set(1, 0, hi, 200);
      g.set(1, 1, hi);
      g.set(0, 2, c, 220);
      g.set(1, 2, c);
      g.set(2, 2, lo, 200);
      g.set(1, 3, lo, 180);
    }),
  },
  /** 모래사장 발자국: 눌린 모래 발자국 (오른발엔 작은 분홍 조개가 빼꼼) */
  thSand: {
    w: 6,
    h: 5,
    frames: 2,
    build: frames(6, 5, 2, (g, f) => {
      const dent = 0xb8945a;
      const rim = 0xf2dcaa;
      g.hline(0, 2, 0, rim);
      g.hline(0, 2, 1, dent);
      g.set(1, 2, dent);
      g.hline(0, 2, 3, dent);
      g.set(1, 4, rim);
      if (f === 1) {
        g.set(4, 2, 0xffc0d0);
        g.set(5, 2, 0xffb0c4);
        g.set(4, 3, 0xe088a0);
        g.set(3, 3, 0xfff0f4);
      }
    }),
  },
} as const;

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다) */
export const THEME_FX = {
  feet_embers: { kind: "trail", art: "thEmber", step: 6, life: 900, motion: "rise", light: true },
  feet_sand: { kind: "trail", art: "thSand", step: 8, life: 2800, motion: "prints" },
} satisfies Record<string, FxSpec>;

function blit(dst: Grid, art: keyof typeof THEME_FX_ART, frame: number, x: number, y: number): void {
  const a = THEME_FX_ART[art];
  const src = a.build();
  for (let j = 0; j < a.h; j++)
    for (let i = 0; i < a.w; i++) {
      const v = src.px[j * src.w + frame * a.w + i];
      if ((v & 255) === 0) continue;
      const tx = x + i;
      const ty = y + j;
      if (tx >= 0 && ty >= 0 && tx < dst.w && ty < dst.h) dst.px[ty * dst.w + tx] = v;
    }
}

/** 테마 꾸미기 아이콘 16×16 (시트 그림 + 발자국). 해당 없으면 null */
export function themeIconGrid(id: string): Grid | null {
  const sheet = themeGearIcon(id);
  if (sheet) return sheet;
  const g = new Grid(16, 16);
  switch (id) {
    case "feet_embers":
      // 장작 둘 + 튀어 오르는 불씨
      g.hline(2, 13, 14, 0x6a3a1e);
      g.hline(3, 12, 13, 0x8a5a32);
      g.ellipse(8, 11, 3, 2.5, 0xff8a30);
      g.ellipse(8, 11, 1.6, 1.6, 0xffe080);
      blit(g, "thEmber", 0, 3, 5);
      blit(g, "thEmber", 1, 10, 3);
      blit(g, "thEmber", 2, 6, 0);
      g.outline(0x2a1408, false, 160);
      return g;
    case "feet_sand":
      g.rect(0, 9, 16, 7, 0xe0c48a);
      g.hline(0, 15, 9, 0xf2dcaa);
      g.rect(0, 6, 16, 3, 0x6ac8e8);
      g.hline(0, 15, 8, 0xffffff);
      blit(g, "thSand", 0, 2, 10);
      blit(g, "thSand", 1, 8, 11);
      return g;
    default:
      return null;
  }
}
