import type { FxSpec, FxInput } from "./cosmeticFx";
import type { SeasonDraw } from "./seasonSetFx";
import { Grid } from "./pixel";
import { frames, over } from "./seasonSetKit";
import { ICONS4, lightHalo, lightStrand, soleGrid } from "./bungeoGear";

// 11/22 골목 붕어빵 수레 한정 꾸미기 중 "아바타 시트 밖에 따로 그리는 것" (코디 기획안 시안 set1 sneakerFeet · set2 lightsAura를 옮겼다):
//  운동화 발자국: 걸음마다 하얀 운동화 밑창 자국 (좌우 번갈아, 은은하게)
//  거리 전구 오라: 머리 위로 늘어진 노란 전구 줄 두 가닥 (몸 뒤, 전구가 번갈아 살짝 반짝 — 밤엔 빛 층에서 은은히 빛난다, 이름표는 그 위로)
// 그림 재료는 bungeoGear.ts. seasonSetFx.ts가 이 파일의 표를 계절 세트 표와 합친다 (cosmeticFx FX_ART·COSMETIC_FX).

/** 전구 줄 그림 칸 (시안: 몸 가운데 ±15칸, 그림 맨 위에서 11칸 위가 윗줄) */
const LW = 33;
const LH = 15;
/** 전구 줄 가운데 열 */
const LC = 16;
/** 그림 맨 위(모자 포함)에서 전구 줄 그림 맨 윗줄까지 */
export const LIGHTS_UP = 11;

/** 두 가닥 (시안 strand 두 번: 아래 가닥은 넓게 깊이 처지고, 위 가닥은 짧게) */
function strands(g: Grid, dim: number): [number, number][] {
  return [...lightStrand(g, LC - 15, LC + 15, 4, 6, 0, true, dim), ...lightStrand(g, LC - 11, LC + 13, 0, 3, 2, false, dim)];
}

export const BUNGEO_FX_ART = {
  /** 운동화 밑창 자국 (0 왼발 · 1 오른발) */
  bgSole: {
    w: 4,
    h: 8,
    frames: 2,
    build: frames(4, 8, 2, (g, f) => over(g, soleGrid(f === 1, 170), 0, 0)),
  },
  /** 거리 전구 줄 (0 · 1 전구 반짝 번갈이) — 낮에도 은은한 빛 번짐까지 */
  bgLights: {
    w: LW,
    h: LH,
    frames: 2,
    build: frames(LW, LH, 2, (g, f) => {
      const t = new Grid(LW, LH);
      lightHalo(g, strands(t, f), 40);
      strands(g, f);
    }),
  },
  /** 거리 전구 밤 빛 (더해 그린다): 전구마다 노란 번짐 */
  bgLightsGlow: {
    w: LW,
    h: LH,
    frames: 1,
    build: frames(LW, LH, 1, (g) => {
      const bulbs = strands(new Grid(LW, LH), 0);
      for (const [x, y] of bulbs) {
        g.ellipse(x + 0.5, y + 1, 2, 2, 0xffc860, 45);
        g.ellipse(x + 0.5, y + 1, 1, 1.2, 0xfff0c0, 120);
      }
    }),
  },
} as const;

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다) */
export const BUNGEO_FX = {
  kc_sneaker: { kind: "trail", art: "bgSole", step: 8, life: 2400, motion: "prints" },
  kd_lights: { kind: "aura", motion: "bgLights", light: true },
} satisfies Record<string, FxSpec>;

export const BUNGEO_MOTIONS = ["bgLights"] as const;
export type BungeoMotion = (typeof BUNGEO_MOTIONS)[number];

/** 새 움직임 그리기. t = 시각(움직임 줄이기·미리보기면 0) */
export function bungeoAura(motion: BungeoMotion, f: FxInput, t: number, d: SeasonDraw): void {
  const calm = f.reduced || !!f.still;
  switch (motion) {
    case "bgLights": {
      // 거리 전구 오라: 머리 위로 늘어진 전구 줄 (몸 뒤) — 전구 반짝이 천천히 번갈아. 밤엔 전구마다 빛 층에서 노란 번짐
      if (f.hidden) return;
      const y = Math.round(f.headY - f.artTop - LIGHTS_UP);
      const fr = calm ? 0 : Math.floor(t / 900) % 2;
      d.push("bgLights", fr, f.x, y, { ox: LC / LW, oy: 0, layer: "body", depth: d.depth - 0.3 });
      if (d.night) {
        const pulse = calm ? 1 : 0.8 + 0.2 * Math.sin(t / 700);
        d.push("bgLightsGlow", 0, f.x, y, { ox: LC / LW, oy: 0, alpha: 0.6 * pulse, layer: "light", depth: 0 });
      }
      break;
    }
  }
}

/** 따로 그리는 연출 아이콘 (해당 없으면 null) */
export function bungeoFxIconGrid(id: string): Grid | null {
  return id in BUNGEO_FX ? (ICONS4[id]?.() ?? null) : null;
}
