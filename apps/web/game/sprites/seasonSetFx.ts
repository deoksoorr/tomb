import type { FxArtId, FxCmd, FxInput, FxSpec } from "./cosmeticFx";
import { DIR } from "@tomb/protocol";
import { Grid, type Color } from "./pixel";
import { art, over } from "./seasonSetGear";
import { season2Aura, season2FxIconGrid, SEASON_FX2, SEASON_FX2_ART, SEASON_GEAR_FX2, SEASON_SET_FX2, type Season2Motion } from "./seasonSetFx2";
import { BUNGEO_FX, BUNGEO_FX_ART, BUNGEO_MOTIONS, bungeoAura, bungeoFxIconGrid, type BungeoMotion } from "./bungeoFx";
import { SEASON3_MOTIONS, season3Aura, season3FxIconGrid, SEASON_FX3, SEASON_FX3_ART, SEASON_GEAR_FX3, SEASON_SET_FX3, type Season3Motion } from "./seasonSetFx3";

// 11/19 계절 한정 세트 중 "아바타 시트 밖에 따로 그리는 것" (코디 기획안 시안 코드를 움직이는 연출로 옮겼다):
//  하얀 입김 오라(입에서 퍼지는 입김 한 줄기) · 꼬마전구 발자국 · 꼬마 눈오리(펫) · 세트 덤 「첫눈 출근길」 발밑 눈송이 반짝.
// 그림(SEASON_FX_ART)은 cosmeticFx FX_ART에, 규칙(SEASON_FX)은 COSMETIC_FX에 섞여 들어간다.
// 새 움직임(ssBreath·ssSnowSet)은 seasonAura가 그리고, cosmeticFx가 그리기 도우미(push·around)를 넘겨준다
// (이 파일은 cosmeticFx를 타입으로만 읽는다 — 서로 불러 초기화 순서가 꼬이지 않게).
// 11/20 나머지 여섯 벌(야근 요정 · 안개 묘지기 · 설날 까치 · 의리 초콜릿 · 벚꽃 소풍 · 사내 체육대회)은 seasonSetFx2.ts — 아래 표에 합친다.
// 11/20 새 다섯 벌(송년회 3차 · 해맞이 산행 · 작심삼일 · 빙어 축제 · 서리 내린 묘역)은 seasonSetFx3.ts — 아래 표에 합친다.
// 11/22 골목 붕어빵 수레 한정(운동화 발자국 · 거리 전구 오라)은 bungeoFx.ts — 아래 표에 합친다.

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

// ── 하얀 입김 ──

/** 입김 한 줄기 (시안 plume): 작은 원이 점점 커지며 겹친 덩어리 + 푸른 그늘 테, 끝으로 갈수록 옅게. 입 자리 (mx, my)에서 d쪽으로 */
function plume(g: Grid, mx: number, my: number, d: number, len = 10, rise = 6): void {
  const n = len + 8;
  const s = new Grid(n * 2, n * 2);
  const o = n;
  const pts: [number, number, number][] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push([o + d * (1 + len * t), o - rise * t * t - 0.5 * t, 0.7 + 1.9 * t]);
  }
  for (const [x, y, r] of pts) s.ellipse(x, y, r + 0.2, r * 0.75 + 0.3, 0xffffff, 255);
  // 테 (아래·바깥쪽 진하게 — 눈밭 위에서도 보이게)
  const rim: [number, number, number][] = [];
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      if (s.filled(x, y)) continue;
      if (s.filled(x - 1, y) || s.filled(x + 1, y) || s.filled(x, y - 1) || s.filled(x, y + 1)) rim.push([x, y, y >= o - 1 || (x - o) * d > len * 0.6 ? 150 : 70]);
    }
  for (const [x, y, al] of rim) s.set(x, y, 0x8aa2c4, al);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.get(x, y) >>> 8 === 0xffffff && s.filled(x, y + 1) && !s.filled(x, y + 2)) s.set(x, y, 0xdbe6f4);
  // 끝으로 갈수록 옅게
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const v = s.get(x, y);
      if (!(v & 255)) continue;
      const t = Math.min(1, Math.max(0, ((x - o) * d) / (len + 3)));
      s.set(x, y, v >>> 8, Math.round((v & 255) * (1 - 0.5 * t)));
    }
  over(g, s, Math.round(mx - o), Math.round(my - o));
}

/** 입김 그림 한 칸: 가로 PLUME_W(입 자리가 가운데 — 좌우 뒤집어도 입 자리 그대로), 세로 PLUME_H(입 자리 = 위에서 PLUME_MY) */
const PLUME_N = 18;
const PLUME_W = PLUME_N * 2;
const PLUME_MY = 12;
const PLUME_H = 18;
/** 자라는 단계 (길이·솟는 높이): 앞·옆은 마지막 단계까지, 뒷모습은 시안처럼 짧게 */
const PLUME_STEPS: readonly (readonly [number, number])[] = [
  [3, 1.5],
  [5, 3],
  [7, 4.5],
  [10, 6],
  [7, 5],
];
/** 뒷모습 입김 단계 (짧은 한 줄기) */
const PLUME_BACK = 4;

// ── 꼬마전구 ──
const GREEN_LO = 0x1c6a36;
const GREEN_DEEP = 0x124a26;
const BULB_COLS: readonly (readonly [Color, Color])[] = [
  [0xff5a5a, 0xffb0a0],
  [0xffd24a, 0xfff2b0],
  [0x5ad86a, 0xc0ffc0],
  [0x4a9aff, 0xc0e4ff],
  [0xff7ad0, 0xffd0f0],
];
/** 꼬마전구 하나 7×8 (시안 bulb): 은은한 빛 번짐 + 짙은 초록 소켓 + 전구 몸 + 전선 한 가닥 */
function bulb(g: Grid, c: Color, hi: Color, glow = true): void {
  if (glow) {
    g.ellipse(3.5, 4.5, 3.5, 3.4, c, 50);
    g.ellipse(3.5, 4.5, 2.4, 2.4, c, 90);
  }
  g.set(3, 1, GREEN_DEEP);
  g.set(3, 2, GREEN_LO);
  g.set(3, 3, hi);
  g.set(4, 3, c);
  g.set(2, 4, c);
  g.set(3, 4, c);
  g.set(4, 4, c);
  g.set(3, 5, c);
  g.set(2, 3, hi);
  g.set(4, 1, GREEN_DEEP, 160);
  g.set(5, 1, GREEN_DEEP, 110);
}

// ── 꼬마 눈오리 (펫, 오른쪽을 본다) ──
const SNOW_W = 0xf8fbff;
const SNOW_S = 0xdde7f2;
const SNOW_D = 0xb2c3d8;
const DUCK = ["....wwww....", "...wWwwws...", "...wwkwwsbb.", "...wwwwwsbB.", "....pwwss...", "w..wwwwws...", "ww.wWwwwwss.", "wwwwwwwwwwsd", "wWwwwwwwwssd", ".sswwwwwssdd", "..dddddddd.."];
const DUCK_PAL: Record<string, Color> = { w: SNOW_W, W: 0xffffff, s: SNOW_S, d: SNOW_D, k: 0x2a2a36, b: 0xeef3fa, B: SNOW_D, p: 0xf4b8c4 };
const DUCK_LINE = 0x5a6a86;
const DUCK_W = 14;
const DUCK_H = 13;
/**
 * 눈오리 한 칸 (14×13, 발바닥 = 맨 아래 줄). pose: 0 서기 · 1 뒤뚱(한 칸 들썩 + 꼬리 까딱) · 2 서서 눈 깜빡 · 3 눈 위에 폭 앉기 · 4 앉아서 눈 깜빡
 */
function duckFrame(g: Grid, pose: number): void {
  const sit = pose >= 3;
  const blink = pose === 2 || pose === 4;
  const a = art(DUCK, DUCK_PAL);
  if (blink) a.set(5, 2, SNOW_S);
  if (pose === 1) {
    // 뒤뚱: 꼬리 끝을 한 칸 들어 올린다
    a.set(0, 5, 0, 0);
    a.set(0, 4, SNOW_W);
  }
  if (sit) {
    // 폭 앉기: 몸을 두 칸 낮추고 아래 그늘 줄을 눈 무더기에 묻는다
    const s = new Grid(DUCK_W, DUCK_H);
    s.draw(a, 1, 3);
    s.outline(DUCK_LINE, false, 210);
    // 눈 무더기 (외곽선 위에 얹어 몸 아래를 감싼다)
    s.ellipse(7, 12, 7, 2.2, SNOW_S);
    s.ellipse(6.5, 11.6, 5.5, 1.6, SNOW_W);
    for (const x of [2, 12]) s.set(x, 12, SNOW_D);
    for (let x = 0; x < DUCK_W; x++) if (s.filled(x, 12) && !s.filled(x, 11)) s.set(x, 11, SNOW_W);
    if (!blink) s.set(7, 6, 0x2a2a36);
    g.draw(s, 0, 0);
    return;
  }
  const s = new Grid(DUCK_W, DUCK_H);
  s.draw(a, 1, pose === 1 ? 1 : 2);
  s.outline(DUCK_LINE, false, 210);
  // 눈 반짝 (외곽선 위)
  if (!blink) s.set(7, pose === 1 ? 3 : 4, 0x2a2a36);
  g.draw(s, 0, 0);
}

export const SEASON_FX_ART = {
  /** 하얀 입김 한 줄기 (자라는 단계 다섯 칸 — 입 자리 = 가로 가운데 · 위에서 PLUME_MY, 오른쪽으로 뻗는다) */
  ssPlume: {
    w: PLUME_W,
    h: PLUME_H,
    frames: PLUME_STEPS.length,
    build: frames(PLUME_W, PLUME_H, PLUME_STEPS.length, (g, f) => {
      const [len, rise] = PLUME_STEPS[f];
      plume(g, PLUME_N, PLUME_MY, 1, len, rise);
    }),
  },
  /** 입김 끝 얼음 알갱이 반짝 (3×3 + 모양) */
  ssIce: {
    w: 3,
    h: 3,
    frames: 2,
    build: frames(3, 3, 2, (g, f) => {
      g.set(1, 1, 0xffffff);
      const c = f ? 0xd8f0ff : 0xffffff;
      for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) g.set(x, y, c, 150);
    }),
  },
  /** 꼬마전구 발자국 (다섯 색 — 낮에도 보이게 은은한 빛 번짐까지 그림에) */
  ssBulb: {
    w: 7,
    h: 8,
    frames: BULB_COLS.length,
    build: frames(7, 8, BULB_COLS.length, (g, f) => bulb(g, BULB_COLS[f][0], BULB_COLS[f][1])),
  },
  /** 꼬마전구 밤 빛 (더해 그린다) */
  ssBulbGlow: {
    w: 11,
    h: 11,
    frames: BULB_COLS.length,
    build: frames(11, 11, BULB_COLS.length, (g, f) => {
      const [c, hi] = BULB_COLS[f];
      g.ellipse(5.5, 5.5, 5.5, 5.5, c, 55);
      g.ellipse(5.5, 5.5, 3, 3, c, 110);
      g.ellipse(5.5, 5.5, 1.3, 1.3, hi, 200);
    }),
  },
  /** 꼬마 눈오리: 0·1 걷기 · 2·3 멈춤(서기·눈 깜빡) · 4·5 눈 위에 폭 앉기(·눈 깜빡) */
  ssDuck: {
    w: DUCK_W,
    h: DUCK_H,
    frames: 6,
    build: frames(DUCK_W, DUCK_H, 6, (g, f) => duckFrame(g, [0, 1, 0, 2, 3, 4][f])),
  },
  // 11/20 나머지 여섯 벌 (seasonSetFx2.ts)
  ...SEASON_FX2_ART,
  // 11/20 새 다섯 벌 (seasonSetFx3.ts)
  ...SEASON_FX3_ART,
  // 11/22 골목 붕어빵 수레 (bungeoFx.ts)
  ...BUNGEO_FX_ART,
} as const;

export type SeasonFxArtId = keyof typeof SEASON_FX_ART;

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다). glowArt = 밤에 흔적마다 더해 그리는 빛 */
export const SEASON_FX = {
  sc_breath: { kind: "aura", motion: "ssBreath" },
  si_bulbs: { kind: "trail", art: "ssBulb", step: 8, life: 1500, motion: "pop", glowArt: "ssBulbGlow" },
  sc_snowduck: { kind: "pet", art: "ssDuck", hover: 0, fps: 6, idleFps: 1.4, pose: { idle: [2, 2, 2, 3], act: [4, 4, 4, 5, 4, 4, 4, 4, 5, 4], actMs: 300, every: 9000 } },
  ...SEASON_FX2,
  ...SEASON_FX3,
  ...BUNGEO_FX,
} satisfies Record<string, FxSpec>;

/** 시트 그림(seasonSetGear)에 덧붙는 빛 (cosmeticFx GEAR_EXTRA_FX에 섞인다): 군고구마 봉투의 따뜻한 빛 */
export const SEASON_GEAR_FX = {
  sc_goguma: { kind: "aura", motion: "ssGoguma", light: true },
  ...SEASON_GEAR_FX2,
  ...SEASON_GEAR_FX3,
} satisfies Record<string, FxSpec>;

/** 세트 덤 연출 (한 벌을 다 입으면 — cosmeticFx setLook이 붙인다) */
export const SEASON_SET_FX: Readonly<Record<string, FxSpec>> = {
  "snow-commute": { kind: "aura", motion: "ssSnowSet", light: true },
  ...SEASON_SET_FX2,
  ...SEASON_SET_FX3,
};

export type SeasonMotion = "ssBreath" | "ssSnowSet" | "ssGoguma" | Season2Motion | Season3Motion | BungeoMotion;

/** cosmeticFx가 넘겨주는 그리기 도우미 (xmasFx XmasDraw와 같다) */
export type SeasonDraw = {
  push: (art: FxArtId, frame: number, x: number, y: number, o?: Partial<FxCmd>) => void;
  around: (z: number, o: Partial<FxCmd>, light?: boolean) => Partial<FxCmd>;
  night: boolean;
  /** 몸 그림 depth */
  depth: number;
};

function h01(i: number, salt = 0): number {
  let h = Math.imul((i + 1) * 374761393 + salt * 668265263, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 입김 한 번 길이 (ms): 이만큼마다 한 줄기 */
export const BREATH_MS = 2600;

/** 새 움직임 그리기. t = 시각(움직임 줄이기·미리보기면 0) */
export function seasonAura(motion: SeasonMotion, f: FxInput, t: number, d: SeasonDraw): void {
  if ((SEASON3_MOTIONS as readonly string[]).includes(motion)) return season3Aura(motion as Season3Motion, f, t, d);
  if ((BUNGEO_MOTIONS as readonly string[]).includes(motion)) return bungeoAura(motion as BungeoMotion, f, t, d);
  if (motion !== "ssBreath" && motion !== "ssSnowSet" && motion !== "ssGoguma") return season2Aura(motion as Season2Motion, f, t, d);
  const calm = f.reduced || !!f.still;
  switch (motion) {
    case "ssBreath": {
      // 숨 쉴 때마다 입에서 하얀 입김 한 줄기가 자라 옆으로 퍼지며 사라진다 (앞모습은 한 번씩 번갈아 왼쪽·오른쪽, 옆모습은 보는 쪽, 뒷모습은 머리 옆으로)
      if (f.hidden) return;
      const face = f.face ?? { dx: 0, up: f.shoulder + 4 };
      const fx = f.x + face.dx;
      const fy = f.headY - face.up;
      const k = calm ? 0 : Math.floor(t / BREATH_MS);
      const u = calm ? 0.5 : (t % BREATH_MS) / BREATH_MS;
      // 자라기(0~0.4) → 머물며 옅어지기(~0.9) → 쉼
      if (u > 0.92) return;
      const up = f.dir === DIR.up;
      const side = f.dir === DIR.left || f.dir === DIR.right;
      const dirX = f.dir === DIR.left ? -1 : f.dir === DIR.right ? 1 : up ? 1 : k % 2 ? 1 : -1;
      const steps = up ? PLUME_BACK : PLUME_STEPS.length - 2;
      const frame = up ? PLUME_BACK : calm ? steps : Math.min(steps, Math.floor((u / 0.4) * (steps + 1)));
      const alpha = calm ? 1 : u < 0.08 ? u / 0.08 : u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.32);
      const drift = calm ? 0 : Math.max(0, u - 0.4) * 4;
      // 입 자리: 앞 = 얼굴 아래 옆, 옆 = 얼굴 앞, 뒤 = 머리 옆
      // 11/20 사용자 「뒤에서 보면 뒤통수에 다 보인다」: 뒷모습은 입김이 얼굴 앞에서 나오니 몸 뒤에 깔고 머리 옆으로 조금 더 빼서 끝만 삐져나오게
      const mx = up ? f.x + 9 : fx + dirX * (side ? 4 : 3);
      const my = up ? fy - 1 : fy + 2;
      // 뒤집으면 그림이 한 칸 왼쪽으로 가므로 +1 (입 자리 그대로)
      d.push("ssPlume", frame, Math.round(mx + dirX * drift) + (dirX < 0 ? 1 : 0), Math.round(my - drift * 0.6), {
        ox: 0.5,
        oy: PLUME_MY / PLUME_H,
        flip: dirX < 0,
        alpha: up ? alpha * 0.85 : alpha,
        layer: "body",
        depth: up ? d.depth - 0.2 : d.depth + 0.2,
      });
      // 끝에서 얼음 알갱이 반짝 (앞·옆, 다 자랐을 때)
      if (!up && (calm || (u > 0.3 && u < 0.85))) {
        const tw = calm ? 0.8 : Math.sin(((u - 0.3) / 0.55) * Math.PI);
        d.push("ssIce", 0, Math.round(fx + dirX * 15), Math.round(fy - 2), { alpha: tw * 0.85, layer: d.night ? "light" : "body", depth: d.depth + 0.21 });
        d.push("ssIce", 1, Math.round(fx + dirX * 8), Math.round(fy - 7), { alpha: tw * 0.6, layer: d.night ? "light" : "body", depth: d.depth + 0.21 });
      }
      break;
    }
    case "ssGoguma": {
      // 군고구마 봉투: 손에 든 봉투 둘레의 따뜻한 빛 (밤에 밝게, 뒷모습은 몸에 가려 없음)
      if (f.hidden || f.dir === DIR.up) return;
      const flick = calm ? 1 : 0.88 + 0.12 * Math.sin(t / 260);
      d.push("xmHalo", 0, Math.round(f.x + f.hand.dx), Math.round(f.headY - f.hand.up + 1), { alpha: (d.night ? 0.85 : 0.2) * flick, sx: 0.9, sy: 0.9, layer: "light", depth: 0 });
      break;
    }
    case "ssSnowSet": {
      // 세트 덤 「첫눈 출근길」: 발밑 양옆에서 눈송이가 반짝 (한 번에 셋까지, 1.4초에 하나꼴 — 눈 결정 + 얼음빛 반짝)
      if (f.hidden) return;
      const n = 3;
      const cyc = 1400;
      for (let i = 0; i < n; i++) {
        const tt = calm ? (i + 0.5) * (cyc / n) : t + (i * cyc) / n;
        const k = Math.floor(tt / cyc);
        const u = (tt % cyc) / cyc;
        if (u > 0.6) continue;
        const tw = Math.sin((u / 0.6) * Math.PI);
        // 몸 너비 밖 양옆 발치 (몸을 덮지 않게 — 번갈아 왼쪽·오른쪽)
        const side = (k + i) % 2 ? 1 : -1;
        const x = f.x + side * (8 + h01(k, i * 7 + 2) * 6);
        const y = f.headY - 1 + h01(k, i * 7 + 1) * 3 - u * 2;
        const s = 0.7 + 0.6 * tw;
        d.push("snowflake", k % 2, Math.round(x), Math.round(y - 1), { alpha: tw, sx: 1.2, sy: 1.2, layer: "ground", depth: 0 });
        d.push("xmGlint", 0, Math.round(x), Math.round(y - 1), { sx: s, sy: s, alpha: tw * (d.night ? 1 : 0.9), layer: "light", depth: 0 });
      }
      break;
    }
  }
}

// ── 아이콘 (16×16) ──

function breathIcon(): Grid {
  const g = new Grid(16, 16);
  // 귀달이를 쓴 작은 얼굴 옆으로 입김 한 줄기
  const face = art(["...rr...", ".nnnnnn.", "nNnnnnnl", "cccrcccc", "nhhhhhhn", "nhkhhkhn", "nhhhhhhn", "chhhhhhc", ".hhhhhl."], {
    h: 0x9fb8d8,
    l: 0x6f88aa,
    k: 0x17161d,
    n: 0x2f4f86,
    N: 0x5277b4,
    c: 0xf4ecda,
    r: 0xd8464c,
  });
  const f = new Grid(16, 16);
  f.draw(face, 0, 5);
  f.outline(0x1e1c1a, false, 170);
  g.draw(f, 0, 0);
  plume(g, 8, 12, 1, 7, 7);
  g.set(15, 6, 0xffffff);
  return g;
}

function bulbsIcon(): Grid {
  const g = new Grid(16, 16);
  // 전선이 출렁이며 전구 넷
  const pts: [number, number][] = [
    [1, 3],
    [5, 6],
    [9, 7],
    [13, 5],
  ];
  for (let x = 0; x < 16; x++) g.set(x, Math.round(4 + Math.sin((x / 15) * Math.PI) * 3), GREEN_DEEP);
  pts.forEach(([x, y], i) => {
    const b = new Grid(7, 8);
    bulb(b, BULB_COLS[i][0], BULB_COLS[i][1]);
    over(g, b, x - 1, y);
  });
  return g;
}

function duckIcon(): Grid {
  const g = new Grid(16, 16);
  const a = art(DUCK, DUCK_PAL);
  const s = new Grid(14, 12);
  s.draw(a, 1, 1);
  s.outline(DUCK_LINE, false, 210);
  s.set(7, 3, 0x2a2a36);
  over(g, s, 1, 3);
  for (let x = 3; x < 13; x++) g.set(x, 15, SNOW_D, 120);
  return g;
}

/** 계절 한정 따로 그리는 연출의 아이콘 (해당 없으면 null) */
export function seasonFxIconGrid(id: string): Grid | null {
  switch (id) {
    case "sc_breath":
      return breathIcon();
    case "si_bulbs":
      return bulbsIcon();
    case "sc_snowduck":
      return duckIcon();
    default:
      return season2FxIconGrid(id) ?? season3FxIconGrid(id) ?? bungeoFxIconGrid(id);
  }
}
