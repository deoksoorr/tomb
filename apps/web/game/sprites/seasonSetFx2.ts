import type { FxArtId, FxCmd, FxInput, FxSpec } from "./cosmeticFx";
import { DIR } from "@tomb/protocol";
import { Grid, type Color } from "./pixel";
import { FX_ICONS2, SS2_PARTS as P } from "./seasonSetGear2";
import { art, frames, over } from "./seasonSetKit";

// 11/20 계절 한정 세트 나머지 여섯 벌 중 "아바타 시트 밖에 따로 그리는 것" (코디 기획안 시안 그림을 움직이는 연출로 옮겼다):
//  오라: 포스트잇 소용돌이(야근 요정) · 러브레터 오라(의리 초콜릿)
//  발자국: 흐려지는 발자국(안개 묘지기) · 녹은 초코 발자국 · 새싹 걸음 · 흙먼지 질주
//  펫: 등불 부엉이 · 까치 친구 · 꼬마 꿀벌
//  시트 그림에 덧붙는 밤 빛: 형광등 더듬이 · 에너지 드링크 · 달맞이꽃 화관 · 반딧불 유리병 · 이끼 비석 배낭 촛불
//  세트 덤: 밤에 형광등 한 번 더 깜빡 · 밤에 발밑 안개가 푸르게 · 걸을 때 금빛 복 글자 · 손 흔들 때 하트 · 서 있으면 벚꽃잎 · 달릴 때 큰 흙먼지
// 그림 재료(포스트잇·편지봉투·발자국·펫)는 seasonSetGear2.ts 시안 그림을 그대로 쓴다. seasonSetFx.ts가 이 파일의 표를 첫 두 벌 것과 합친다.

// ── 그림 ──

/** 밤 빛 번짐 색 (안쪽·바깥) — ssHalo 프레임 번호 */
const HALO: readonly (readonly [Color, Color])[] = [
  [0xbfeaff, 0xf2fcff], // 0 형광등
  [0x9cff3a, 0xe0ffb0], // 1 에너지 드링크
  [0xffe060, 0xfff8c0], // 2 반딧불
  [0xffa840, 0xffe0a0], // 3 촛불
  [0xd8e4ff, 0xffffff], // 4 달맞이꽃
  [0x4a9ae8, 0x9ad8ff], // 5 유령 안개
  [0xff7aa8, 0xffd0e0], // 6 러브레터
];
const H_TUBE = 0;
const H_LIME = 1;
const H_FLY = 2;
const H_CANDLE = 3;
const H_MOON = 4;
const H_FOG = 5;
const H_PINK = 6;

/** 칸 가운데 아래에 맞춰 놓는다 (크기가 다른 그림을 한 줄 프레임으로) */
function placeBottom(g: Grid, src: Grid): void {
  over(g, src, Math.floor((g.w - src.w) / 2), g.h - src.h);
}

// 등불 부엉이 (시안 gkOwl을 프레임으로: 0 기본 · 1 날개 들썩 · 2 눈 깜빡 · 3 곁눈질)
const OWL_ROWS = [
  "..t.......t..",
  "..tT.....Tt..",
  "..bbbbbbbbb..",
  ".bffffbffffb.",
  ".bfYYfbfYYfl.",
  ".bfYkfbfYkfl.",
  ".bbfffvfffbl.",
  ".WbbbbVbbbWl.",
  "WWWbcbbbcbWWL",
  "WWwbbcbcbbwWL",
  ".WwbcbbbcbwL.",
  "..Lbbbbbbbl..",
  "...lbbbbbl...",
  "....m.m.m....",
  ".....m.m.....",
];
const OWL_PAL: Record<string, Color> = {
  t: 0x7e8eb0,
  T: 0xa8b6d0,
  b: 0xb4c2da,
  f: 0xe2eaf6,
  Y: 0xffd648,
  k: 0x2a1e10,
  v: 0xd8a040,
  V: 0xa87828,
  W: 0x8494b4,
  w: 0x6e7ea0,
  L: 0x5c6a8a,
  l: 0x8a98b6,
  c: 0x8a98b4,
  m: 0xc8d8f0,
};
const OWL_W = 15;
const OWL_H = 17;
function owlFrame(g: Grid, pose: number): void {
  const rows = [...OWL_ROWS];
  if (pose === 1) {
    // 날개 끝을 한 칸 들어 올린다 (둥실)
    rows[7] = "WWbbbbVbbbWWL";
    rows[8] = "WWwbcbbbcbwWL";
    rows[9] = ".Wwbbcbcbbwl.";
    rows[10] = "..wbcbbbcbw..";
  } else if (pose === 2) {
    rows[4] = ".bfllfbfllfl.";
    rows[5] = ".bfffbbbfffl.";
  } else if (pose === 3) {
    rows[5] = ".bfkYfbfkYfl.";
  }
  const a = art(rows, OWL_PAL);
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) {
      const v = a.get(x, y);
      if (!(v & 255)) continue;
      const tail = y >= 13;
      g.set(x + 1, y + 1, v >>> 8, tail ? (y === 13 ? 170 : 110) : 238);
    }
  g.outline(0x34405e, false, 190);
  for (let y = 14; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) >>> 8 === 0x34405e) g.set(x, y, 0, 0);
  if (pose === 2) return;
  for (const [x, y] of P.owlEyes) {
    const dx = pose === 3 ? -1 : 0;
    g.set(x + 1 + dx, y + 1, 0xffe878);
    if (pose !== 3) g.set(x, y + 1, 0xfff6c8);
  }
}

// 까치 친구 (시안 smMagpie: 0 기본 · 1 걷기 · 2 눈 깜빡 · 3 꼬리 까딱)
const MAGPIE_W = 16;
const MAGPIE_H = 13;
function magpieFrame(g: Grid, pose: number): void {
  const rows = [...P.magpieArt];
  if (pose === 1) {
    rows[10] = "........l.l...";
    rows[11] = ".......ll.ll..";
  } else if (pose === 3) {
    rows[2] = "TT.......kekkb";
    rows[3] = ".tTt.....kkkk.";
    rows[4] = "..ttT..kkkkk..";
    rows[5] = "...tTgwwwwk...";
  }
  g.draw(art(rows, P.magpiePal), 1, 0);
  g.outline(0x0e0e16, false, 200);
  if (pose !== 2) g.set(11, 2, 0xffffff);
}

// 꼬마 꿀벌 (시안 spBee: 0 날개 위 · 1 날개 아래 · 2 눈 깜빡)
const BEE_W = 14;
const BEE_H = 12;
function beeFrame(g: Grid, pose: number): void {
  const b = new Grid(BEE_W, BEE_H);
  b.ellipse(6, 7, 4.6, 3.2, 0xffd23a);
  b.recolor((x, y) => x - 6 + (y - 7) < -3, 0xfff08a);
  b.recolor((x, y) => x - 6 + (y - 7) > 3 || y >= 9, 0xd8a01a);
  for (const sx of [4, 6]) b.recolor((x) => x === sx, 0x2a2420);
  b.recolor((x, y) => x === 4 && y === 5, 0x4a3a30);
  b.set(1, 7, 0x2a2420);
  b.set(9, 3, 0x2a2420);
  b.set(10, 2, 0x2a2420);
  b.set(11, 3, 0x2a2420);
  b.set(12, 2, 0x2a2420);
  b.set(5, 10, 0x2a2420);
  b.set(7, 10, 0x2a2420);
  b.outline(0x3a2410, false, 230);
  b.set(9, 6, pose === 2 ? 0xd8a01a : 0x1a1418);
  b.set(10, 8, 0xff9aa8);
  g.draw(b, 0, 0);
  const w = new Grid(BEE_W, BEE_H);
  if (pose === 1) {
    // 날갯짓: 날개가 내려와 납작
    w.ellipse(4, 3, 1.8, 1.1, 0xeaf8ff);
    w.ellipse(6.8, 3.2, 1.4, 0.9, 0xd6eefc);
  } else {
    w.ellipse(4, 1.9, 1.8, 1.6, 0xeaf8ff);
    w.ellipse(6.8, 2.3, 1.4, 1.2, 0xd6eefc);
    w.set(3, 1, 0xffffff);
  }
  w.outline(0x7a9ab8, false, 170);
  over(g, w, 0, 0, pose === 1 ? 0.55 : 0.7);
}

/** 금빛 「福」 글자 (설날 까치 세트 덤) */
const BOK = [".y.yyyy", "yyy....", "..y.yyy", ".yy.y.y", "yyy.yyy", ".y.yyyy", ".y.y.y.", ".y.yyyy"];
/** 벚꽃잎 한 장 (벚꽃 소풍 세트 덤) */
const PETAL = [".pp.", "pPpp", ".ppl", "..l."];

export const SEASON_FX2_ART = {
  /** 포스트잇 네 빛깔 (시안 note 5×5, 0·2는 귀 접힘) */
  ssNote: {
    w: 5,
    h: 5,
    frames: 4,
    build: frames(5, 5, 4, (g, f) => P.note(g, 2, 2, P.notes[f] as [Color, Color], f % 2 === 0)),
  },
  /** 닫힌 편지봉투 (시안 envelope + 외곽선) */
  ssEnvClosed: {
    w: 8,
    h: 7,
    frames: 1,
    build: frames(8, 7, 1, (g) => over(g, P.envelope(), 1, 1)),
  },
  /** 열려 하트가 튀어나온 편지봉투 (시안 openEnvelope) */
  ssEnvOpen: {
    w: 9,
    h: 11,
    frames: 1,
    build: frames(9, 11, 1, (g) => over(g, P.openEnvelope(), 1, 1)),
  },
  /** 작은 하트 반짝이 */
  ssHeartSpark: {
    w: 3,
    h: 3,
    frames: 1,
    build: frames(3, 3, 1, (g) => P.sparkle(g, 1, 1, 235)),
  },
  /** 밤 빛 번짐 (HALO 빛깔마다 한 칸) */
  ssHalo: {
    w: 11,
    h: 11,
    frames: HALO.length,
    build: frames(11, 11, HALO.length, (g, f) => {
      const [c, hi] = HALO[f];
      g.ellipse(5.5, 5.5, 5.5, 5.5, c, 45);
      g.ellipse(5.5, 5.5, 3.2, 3.2, c, 90);
      g.ellipse(5.5, 5.5, 1.4, 1.4, hi, 150);
    }),
  },
  /** 흐려지는 발자국 네 단계 (또렷 → 안개) */
  ssFade: {
    w: 6,
    h: 7,
    frames: 4,
    build: frames(6, 7, 4, (g, f) => over(g, P.fadeSteps()[f], 0, 0)),
  },
  /** 흐려지는 발자국 밤 빛 (단계마다 옅게) */
  ssFadeGlow: {
    w: 9,
    h: 9,
    frames: 4,
    build: frames(9, 9, 4, (g, f) => {
      const k = [1, 0.75, 0.5, 0.3][f];
      g.ellipse(4.5, 4.5, 4.5, 4, 0x3a6a9a, Math.round(70 * k));
      g.ellipse(4.5, 4.5, 2.2, 2, P.ghost, Math.round(110 * k));
    }),
  },
  /** 녹은 초코 하트 자국 (0 그대로 · 1 녹아 흐름) */
  ssChoco: {
    w: 6,
    h: 6,
    frames: 2,
    build: frames(6, 6, 2, (g, f) => over(g, P.chocoPrint(f === 1), 0, 0)),
  },
  /** 새싹 (0 작은 · 1 큰) */
  ssSprout: {
    w: 7,
    h: 6,
    frames: 2,
    build: frames(7, 6, 2, (g, f) => over(g, P.sprout(f === 1), 0, 0)),
  },
  /** 흙먼지 뭉치 넷 (작은 것부터) */
  ssDust: {
    w: 7,
    h: 6,
    frames: 4,
    build: frames(7, 6, 4, (g, f) => placeBottom(g, P.dashFeet()[f])),
  },
  /** 등불 부엉이 */
  ssOwl: {
    w: OWL_W,
    h: OWL_H,
    frames: 4,
    build: frames(OWL_W, OWL_H, 4, owlFrame),
  },
  /** 등불 부엉이 눈빛 (두 눈 자리) */
  ssOwlGlow: {
    w: 13,
    h: 7,
    frames: 1,
    build: frames(13, 7, 1, (g) => {
      for (const x of [4, 9]) {
        g.ellipse(x, 3.5, 3.5, 3.4, 0xffd860, 60);
        g.ellipse(x, 3.5, 1.6, 1.6, 0xfff0a0, 120);
      }
    }),
  },
  /** 까치 친구 */
  ssMagpie: {
    w: MAGPIE_W,
    h: MAGPIE_H,
    frames: 4,
    build: frames(MAGPIE_W, MAGPIE_H, 4, magpieFrame),
  },
  /** 꼬마 꿀벌 */
  ssBee: {
    w: BEE_W,
    h: BEE_H,
    frames: 3,
    build: frames(BEE_W, BEE_H, 3, beeFrame),
  },
  /** 금빛 복 글자 */
  ssBok: {
    w: 9,
    h: 10,
    frames: 1,
    build: frames(9, 10, 1, (g) => {
      const a = art(BOK, { y: P.goldHi });
      a.recolor((x, y) => y >= 5 || x >= 5, P.gold);
      g.draw(a, 1, 1);
      g.outline(0x8a3a10, false, 230);
    }),
  },
  /** 벚꽃잎 (0 그대로 · 1 뒤집힘) */
  ssPetal: {
    w: 4,
    h: 4,
    frames: 2,
    build: frames(4, 4, 2, (g, f) => {
      const a = art(PETAL, {
        p: f ? P.sakuraHi : P.sakura,
        P: 0xffe4ee,
        l: P.sakuraLo,
      });
      g.draw(a, 0, 0);
    }),
  },
} as const;

export type Season2ArtId = keyof typeof SEASON_FX2_ART;

// ── 규칙 ──

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다) */
export const SEASON_FX2 = {
  of_postit: { kind: "aura", motion: "ssPostit" },
  vc_letters: { kind: "aura", motion: "ssLetters", light: true },
  // 흐려지는 발자국: 찍힌 뒤 지날수록 네 단계로 흐려진다 (fade), 밤엔 푸른 빛
  gk_fadesteps: {
    kind: "trail",
    art: "ssFade",
    step: 8,
    life: 3200,
    motion: "fade",
    glowArt: "ssFadeGlow",
  },
  vc_chocosteps: {
    kind: "trail",
    art: "ssChoco",
    step: 9,
    life: 2600,
    motion: "prints",
  },
  sp_sprouts: {
    kind: "trail",
    art: "ssSprout",
    step: 8,
    life: 2000,
    motion: "pop",
  },
  sd_dash: { kind: "trail", art: "ssDust", step: 6, life: 650, motion: "rise" },
  // 등불 부엉이: 살짝 떠서 날갯짓, 눈이 등불처럼 (밤에 또렷), 가끔 곁눈질
  gk_owl: {
    kind: "pet",
    art: "ssOwl",
    hover: 3,
    fps: 4,
    idleFps: 1.4,
    glow: true,
    glowArt: "ssOwlGlow",
    glowAt: [0, 12],
    pose: {
      idle: [0, 0, 0, 2],
      act: [3, 3, 3, 3, 0, 1, 0, 1],
      actMs: 260,
      every: 8000,
    },
  },
  // 까치 친구: 가끔 깡충 뛰며 꼬리를 까딱
  sm_magpie: {
    kind: "pet",
    art: "ssMagpie",
    hover: 0,
    fps: 8,
    idleFps: 1.2,
    pose: {
      idle: [0, 0, 2, 0],
      act: [3, 0, 0, 3, 0, 0],
      actMs: 170,
      every: 6500,
      lift: [0, 3, 1, 0, 3, 1],
    },
  },
  // 꼬마 꿀벌: 붕붕 날갯짓 (멈춰도), 가끔 눈 깜빡
  sp_bee: {
    kind: "pet",
    art: "ssBee",
    hover: 5,
    fps: 14,
    idleFps: 10,
    pose: { idle: [0, 1], act: [2, 2, 2], actMs: 120, every: 5000 },
  },
} satisfies Record<string, FxSpec>;

/** 시트 그림(seasonSetGear2)에 덧붙는 밤 빛 (cosmeticFx GEAR_EXTRA_FX에 섞인다) */
export const SEASON_GEAR_FX2 = {
  of_antenna: { kind: "aura", motion: "ssTube", light: true },
  of_drink: { kind: "aura", motion: "ssDrink", light: true },
  gk_moonwreath: { kind: "aura", motion: "ssWreath", light: true },
  gk_firefly: { kind: "aura", motion: "ssJar", light: true },
  gk_stonepack: { kind: "aura", motion: "ssCandle", light: true },
} satisfies Record<string, FxSpec>;

/** 세트 덤 연출 (한 벌을 다 입으면) */
export const SEASON_SET_FX2: Readonly<Record<string, FxSpec>> = {
  "overtime-fairy": { kind: "aura", motion: "ssOtSet", light: true },
  "fog-keeper": { kind: "aura", motion: "ssFogSet", light: true },
  "seollal-magpie": { kind: "aura", motion: "ssBokSet", light: true },
  "giri-choco": { kind: "aura", motion: "ssHeartSet" },
  "spring-picnic": { kind: "aura", motion: "ssPetalSet" },
  "sports-day": { kind: "aura", motion: "ssDustSet" },
};

export const SEASON2_MOTIONS = ["ssPostit", "ssLetters", "ssTube", "ssDrink", "ssWreath", "ssJar", "ssCandle", "ssOtSet", "ssFogSet", "ssBokSet", "ssHeartSet", "ssPetalSet", "ssDustSet"] as const;
export type Season2Motion = (typeof SEASON2_MOTIONS)[number];

/** cosmeticFx가 넘겨주는 그리기 도우미 (seasonSetFx SeasonDraw와 같다) */
type Draw = {
  push: (art: FxArtId, frame: number, x: number, y: number, o?: Partial<FxCmd>) => void;
  around: (z: number, o: Partial<FxCmd>, light?: boolean) => Partial<FxCmd>;
  night: boolean;
  depth: number;
};

function h01(i: number, salt = 0): number {
  let h = Math.imul((i + 1) * 374761393 + salt * 668265263, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 옆을 보면 보는 쪽(1 오른쪽 · -1 왼쪽), 앞·뒤면 0 */
const sideOf = (f: FxInput) => (f.dir === DIR.left ? -1 : f.dir === DIR.right ? 1 : 0);
/** 얼굴(눈 줄) 높이 (발바닥에서) */
const faceUp = (f: FxInput) => f.face?.up ?? f.shoulder + 4;
/** 형광등 더듬이 등 자리 [dx, 밝기] (앞·뒤 = 양옆 둘, 옆 = 앞 하나 또렷 · 뒤 하나 흐리게) */
function tubeSpots(f: FxInput): [number, number][] {
  const s = sideOf(f);
  return s
    ? [
        [s * 3, 1],
        [-s * 3.5, 0.55],
      ]
    : [
        [-5, 1],
        [5, 1],
      ];
}

/** 새 움직임 그리기. t = 시각(움직임 줄이기·미리보기면 0) */
export function season2Aura(motion: Season2Motion, f: FxInput, t: number, d: Draw): void {
  const calm = f.reduced || !!f.still;
  const top = f.headY - f.artTop;
  const light = (o: Partial<FxCmd>): Partial<FxCmd> => ({
    layer: "light",
    depth: 0,
    ...o,
  });
  switch (motion) {
    case "ssPostit": {
      // 할 일 메모 다섯 장이 머리 둘레를 빙글빙글 (뒤쪽 반 바퀴는 머리 뒤로)
      if (f.hidden) return;
      const cy = f.headY - faceUp(f) - 2;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2 + (calm ? 0.35 : t / 2600);
        const z = Math.sin(th);
        const x = f.x + Math.cos(th) * 12;
        const y = cy + z * 4 - (i % 3);
        d.push("ssNote", i % 4, Math.round(x), Math.round(y), d.around(z, {}));
      }
      break;
    }
    case "ssLetters": {
      // 분홍 편지봉투가 몸 옆에서 둥실 떠올라 머리 높이에서 하트로 열린다 (두 통이 번갈아, 한 통은 몸 뒤로)
      if (f.hidden) return;
      const cyc = 3200;
      for (let k = 0; k < 2; k++) {
        const tt = calm ? (k ? 0.72 : 0.3) * cyc : t + k * (cyc / 2);
        const n = Math.floor(tt / cyc);
        const u = (tt % cyc) / cyc;
        const side = (n + k) % 2 ? 1 : -1;
        const x = f.x + side * (k ? 12 : 10);
        const y0 = f.headY - f.artTop * 0.35;
        const y = y0 - u * (f.artTop * 0.55 + 4);
        const a = u < 0.1 ? u / 0.1 : u > 0.82 ? Math.max(0, (1 - u) / 0.18) : 1;
        const back = k === 1;
        const o = d.around(back ? -0.5 : 1, { alpha: a });
        if (u < 0.55) d.push("ssEnvClosed", 0, Math.round(x), Math.round(y), o);
        else {
          d.push("ssEnvOpen", 0, Math.round(x), Math.round(y - 2), o);
          d.push("ssHeartSpark", 0, Math.round(x + side * 6), Math.round(y - 3), d.around(back ? -0.5 : 1, { alpha: a }, true));
          if (d.night) d.push("ssHalo", H_PINK, Math.round(x), Math.round(y - 3), light({ alpha: 0.8 * a, sx: 0.85, sy: 0.85 }));
        }
      }
      break;
    }
    case "ssTube":
    case "ssOtSet": {
      // 형광등 더듬이 빛 (밤에 또렷 · 두 번째 등은 가끔 깜빡). 세트 덤: 밤마다 3.6초에 한 번 두 번 더 깜빡
      if (f.hidden) return;
      const set = motion === "ssOtSet";
      if (set && !d.night) return;
      const cyc = 3600;
      const u = calm ? 0.03 : (t % cyc) / cyc;
      if (set && !(u < 0.06 || (u > 0.12 && u < 0.18))) return;
      const flick = calm ? 1 : Math.sin(t / 97) > 0.92 ? 0.25 : 1;
      tubeSpots(f).forEach(([dx, k], i) => {
        const base = set ? 1 : (d.night ? 0.85 : 0.22) * (i === 1 ? flick : 1);
        const s = (set ? 1.35 : 0.9) * (0.7 + 0.3 * k);
        d.push("ssHalo", H_TUBE, Math.round(f.x + dx), Math.round(top + 2), light({ alpha: base * k, sx: s, sy: s }));
      });
      break;
    }
    case "ssDrink":
    case "ssJar": {
      // 손에 든 캔의 연두빛 · 유리병 반딧불 빛 (뒷모습은 몸에 가려 없음). 반딧불 하나는 병 밖으로 빠져나와 맴돈다
      if (f.hidden || f.dir === DIR.up) return;
      const jar = motion === "ssJar";
      const hx = Math.round(f.x + f.hand.dx);
      const hy = Math.round(f.headY - f.hand.up);
      const pulse = calm ? 1 : 0.85 + 0.15 * Math.sin(t / 300);
      d.push(
        "ssHalo",
        jar ? H_FLY : H_LIME,
        hx,
        hy + (jar ? 1 : 0),
        light({
          alpha: (d.night ? 0.9 : 0.2) * pulse,
          sx: jar ? 1 : 0.5,
          sy: jar ? 1 : 0.5,
        }),
      );
      if (jar) {
        const a = calm ? 0.6 : t / 900;
        const fx = hx + 2 + Math.cos(a) * 3;
        const fy = hy - 5 + Math.sin(a * 1.7) * 2;
        const tw = calm ? 1 : 0.5 + 0.5 * Math.max(0, Math.sin(t / 210));
        d.push("ssHalo", H_FLY, Math.round(fx), Math.round(fy), light({ alpha: tw, sx: 0.28, sy: 0.28 }));
      }
      break;
    }
    case "ssWreath": {
      // 달맞이꽃 화관: 밤에만 머리 위가 은은하게
      if (f.hidden || !d.night) return;
      const pulse = calm ? 1 : 0.8 + 0.2 * Math.sin(t / 900);
      d.push("ssHalo", H_MOON, Math.round(f.x), Math.round(top + 2), light({ alpha: 0.7 * pulse, sx: 0.65, sy: 0.45 }));
      break;
    }
    case "ssCandle": {
      // 비석 배낭 위 촛불 (앞 = 왼쪽 어깨 너머 · 옆 = 등 뒤 · 뒤 = 등 가운데), 바람에도 안 꺼지게 살랑
      if (f.hidden) return;
      const s = sideOf(f);
      const [dx, up] = s ? [-s * 7, f.shoulder + 7] : f.dir === DIR.up ? [-1, f.shoulder + 6] : [-6, faceUp(f) + 4];
      const flick = calm ? 1 : 0.85 + 0.15 * Math.sin(t / 140) * Math.sin(t / 53);
      d.push("ssHalo", H_CANDLE, Math.round(f.x + dx), Math.round(f.headY - up), light({ alpha: (d.night ? 0.95 : 0.25) * flick, sx: 0.9, sy: 0.9 }));
      break;
    }
    case "ssFogSet": {
      // 세트 덤 「안개 묘지기」: 밤이면 발밑 안개가 푸르게 빛난다 (안개 뭉치 셋 + 푸른 빛 넷이 천천히 돈다)
      if (f.hidden || !d.night) return;
      for (let i = 0; i < 3; i++) {
        const ph = calm ? i / 3 : (t / 6000 + i / 3) % 1;
        const a = ph * Math.PI * 2;
        const z = Math.sin(a);
        d.push("ghMist", Math.floor(t / 800 + i) % 2, Math.round(f.x + Math.cos(a) * 8), Math.round(f.headY + 1 + z * 2), {
          alpha: 0.5 + 0.2 * Math.sin(ph * Math.PI),
          layer: z < 0 ? "body" : "ground",
          depth: z < 0 ? d.depth - 0.25 : 0,
          flip: i % 2 === 0,
        });
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + (calm ? 0 : t / 3000);
        const tw = calm ? 0.8 : 0.6 + 0.4 * Math.sin(t / 700 + i * 1.7);
        d.push("ssHalo", H_FOG, Math.round(f.x + Math.cos(a) * 9), Math.round(f.headY + Math.sin(a) * 2.5), light({ alpha: tw, sx: 0.9, sy: 0.6 }));
      }
      break;
    }
    case "ssBokSet": {
      // 세트 덤 「설날 까치」: 걸을 때 2.4초에 한 번 금빛 복 글자가 몸 옆에서 떠올라 사라진다
      if (f.hidden || (!f.moving && !f.still)) return;
      const cyc = 2400;
      const n = calm ? 0 : Math.floor(t / cyc);
      const u = calm ? 0.35 : (t % cyc) / cyc;
      if (u > 0.75) return;
      const k = Math.sin((u / 0.75) * Math.PI);
      const side = n % 2 ? 1 : -1;
      const x = f.x + side * (10 + h01(n, 3) * 3);
      const y = f.headY - f.artTop * 0.45 - u * 10;
      d.push("ssBok", 0, Math.round(x), Math.round(y), {
        alpha: k,
        sx: 0.8 + 0.2 * k,
        sy: 0.8 + 0.2 * k,
        layer: "body",
        depth: d.depth + 0.2,
      });
      if (d.night) d.push("ssHalo", H_FLY, Math.round(x), Math.round(y), light({ alpha: 0.6 * k, sx: 0.8, sy: 0.8 }));
      break;
    }
    case "ssHeartSet": {
      // 세트 덤 「의리 초콜릿」: 손 흔들기를 하면 손에서 작은 하트가 퐁퐁 터진다 (입어 보기 미리보기는 터지는 모습 한 장)
      if (f.hidden) return;
      const w = f.still ? 400 : f.wave;
      if (w === undefined || w < 0 || w > 1100) return;
      const u = w / 1100;
      const hx = f.x + (f.hand.dx || 4);
      const hy = f.headY - f.hand.up - 4;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        const r = 3 + u * 9;
        const sc = (u < 0.15 ? u / 0.15 : 1) * (0.7 + 0.3 * h01(i, 9));
        d.push("heart", i % 2, Math.round(hx + Math.cos(a) * r), Math.round(hy + Math.sin(a) * r - u * 3), {
          alpha: 1 - u * u,
          sx: sc,
          sy: sc,
          layer: "body",
          depth: d.depth + 0.25,
        });
      }
      break;
    }
    case "ssPetalSet": {
      // 세트 덤 「벚꽃 소풍」: 서 있으면 벚꽃잎이 한 장씩 머리 위에서 살랑 내려와 발치에 앉는다
      if (f.hidden || f.moving) return;
      const cyc = 2800;
      for (let k = 0; k < 2; k++) {
        const tt = calm ? (k ? 0.85 : 0.35) * cyc : t + k * (cyc / 2);
        const n = Math.floor(tt / cyc);
        const u = (tt % cyc) / cyc;
        const side = h01(n, k + 5) < 0.5 ? -1 : 1;
        const gx = f.x + side * (5 + h01(n, k + 7) * 6);
        const gy = f.headY - 1;
        if (u < 0.6) {
          const v = u / 0.6;
          const x = gx + Math.sin(v * Math.PI * 3) * 3 * (1 - v);
          const y = top - 4 + (gy - (top - 4)) * v;
          d.push("ssPetal", Math.floor(v * 6) % 2, Math.round(x), Math.round(y), {
            alpha: Math.min(1, v * 5),
            layer: "body",
            depth: d.depth + 0.2,
            flip: n % 2 === 0,
          });
        } else
          d.push("ssPetal", 0, Math.round(gx), Math.round(gy), {
            alpha: 1 - (u - 0.6) / 0.4,
            layer: "ground",
            depth: 0,
            flip: n % 2 === 0,
          });
      }
      break;
    }
    case "ssDustSet": {
      // 세트 덤 「사내 체육대회」: 달릴 때 발 뒤로 흙먼지가 조금 더 크게 인다
      if (f.hidden || (!f.moving && !f.still)) return;
      const [hx, hy] = f.dir === DIR.left ? [-1, 0] : f.dir === DIR.right ? [1, 0] : f.dir === DIR.up ? [0, -1] : [0, 1];
      const cyc = 420;
      for (let k = 0; k < 2; k++) {
        const tt = calm ? (k ? 0.6 : 0.2) * cyc : t + k * (cyc / 2);
        const u = (tt % cyc) / cyc;
        const side = k ? 1 : -1;
        const x = f.x - hx * (5 + u * 5) + side * Math.abs(hy) * 3;
        const y = f.headY - 1 - hy * (2 + u * 3) - u * 3;
        const s = 1.15 + 0.55 * u;
        d.push("ssDust", 3, Math.round(x), Math.round(y), {
          alpha: 1 - u,
          sx: s,
          sy: s,
          oy: 1,
          layer: "ground",
          depth: 0,
          flip: k === 1,
        });
      }
      break;
    }
  }
}

/** 따로 그리는 연출 아이콘 (해당 없으면 null) */
export function season2FxIconGrid(id: string): Grid | null {
  return FX_ICONS2[id]?.() ?? null;
}
