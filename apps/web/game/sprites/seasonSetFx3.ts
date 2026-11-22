import type { FxArtId, FxCmd, FxInput, FxSpec } from "./cosmeticFx";
import { DIR } from "@tomb/protocol";
import { kstHour, parseAmbienceOverride } from "@/lib/ambience";
import { Grid, type Color } from "./pixel";
import { FX_ICONS3, SS3_PARTS as P } from "./seasonSetGear3";
import { art, frames, over } from "./seasonSetKit";

// 11/20 계절 보따리상 새 다섯 벌 중 "아바타 시트 밖에 따로 그리는 것" (코디 기획안 2차 시안 그림을 움직이는 연출로 옮겼다):
//  오라: 알딸딸 오라(분홍 거품이 보글보글 + 몸 뒤 분홍 기운 — 볼 발그레는 시트) · 첫 햇살 오라(등 뒤로 떠오른 해 + 금빛 반짝) · 핫팩 오라(따뜻한 김 + 몸 양옆에 둥실 뜬 핫팩 둘)
//  발자국: 사흘째 발자국(운동화 두 걸음 → 삼선 슬리퍼 한 걸음, 세 걸음 주기) · 성에 발자국(밟은 자리에 얼음 꽃이 사르르 번진다, 밤엔 푸른 빛)
//  펫: 꼬마 너구리 · 꼬마 산양 · 빙어 도둑 펭귄 · 꼬마 눈토끼 (네 방향 — 옆·앞·뒤 걷기 + 멈춤·깜빡·귀여운 동작)
//  시트 그림에 덧붙는 밤 빛: 애창곡 마이크 분홍 불빛 · 고드름 왕관 얼음빛
//  세트 덤: 서 있으면 머리 위로 음표 · 아침(6~9시) 몸 둘레 금빛 · 멈추면 이마에 땀방울 · 멈추면 발밑에서 빙어 퐁 · 밤에 몸 둘레로 눈 결정
// 밤에 스스로 빛나는 것(첫 햇살·핫팩·거품·눈 결정)은 기존 밤 빛 방식(빛 층에 더해 그리기)으로. 그림 재료는 seasonSetGear3.ts (시안 그대로).
// seasonSetFx.ts가 이 파일의 표를 앞의 여덟 벌 것과 합친다.

// ── 그림 ──

/** 밤 빛 번짐 색 (안쪽·바깥) — ssHalo3 프레임 번호 */
const HALO: readonly (readonly [Color, Color])[] = [
  [0xff6ab8, 0xffc8e4], // 0 마이크 분홍 불빛 · 알딸딸
  [0xa8e0ff, 0xf0faff], // 1 고드름 얼음빛 · 성에 · 눈 결정
  [0xffb050, 0xfff0b0], // 2 첫 햇살
  [0xff9a50, 0xffe0b0], // 3 핫팩 온기
  [0xffd860, 0xfff6c0], // 4 금빛 (아침 덤 · 음표)
];
const H_PINK = 0;
const H_ICE = 1;
const H_SUN = 2;
const H_WARM = 3;
const H_GOLD = 4;

/** 칸 가운데 아래에 맞춰 놓는다 (크기가 다른 그림을 한 줄 프레임으로) */
function placeBottom(g: Grid, src: Grid): void {
  over(g, src, Math.floor((g.w - src.w) / 2), g.h - src.h);
}

/** 펫 시트 (seasonSetGear3 PET3 — 열 배치는 petBreeds와 같다). w·h = 가장 큰 장 (옆모습) */
const PET_FRAMES = 14;
function petArt(id: string, w: number, h: number) {
  return {
    w,
    h,
    frames: PET_FRAMES,
    build: () => {
      const { cels } = P.pets[id]();
      return frames(w, h, PET_FRAMES, (g, f) => placeBottom(g, cels[f]))();
    },
  };
}

/** 알딸딸 오라 거품 여섯 (시안 pts: [dx, dy, 반지름, 색]) */
const TIPSY_BUBBLES: readonly (readonly [number, number, number, Color])[] = [
  [-10, -2, 1, 0xffa8cc],
  [-12, -9, 0, 0xffffff],
  [-7, -12, 1, 0xffc8e0],
  [10, -5, 2, 0xffa8cc],
  [12, -12, 0, 0xffd0e4],
  [6, -15, 1, 0xffc8e0],
];

/** 몸 뒤 은은한 기운 (시안: 몸 둘레 타원 안 바둑판 점, 가운데가 진하다) */
function haze(g: Grid, c: Color, rx: number, ry: number, a0: number): void {
  const cx = g.w / 2;
  const cy = g.h / 2;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (d < 1 && (x + y) % 2 === 0) g.set(x, y, c, Math.round(a0 * (1 - d)));
    }
}

/** 첫 햇살 해 (시안 sunDisk r = 11) — 그림 칸 크기 */
const SUN_R = 11;
const SUN_S = SUN_R * 2 + 16;
/** 밤 빛 층에 더해 그리는 해 테두리: 해에서 몸이 서는 자리(가운데 아래 폭 15칸)를 비운다 → 몸을 덮지 않고 해만 스스로 빛난다 */
function sunRim(g: Grid, phase: number): void {
  P.sunDisk(g, SUN_S / 2, SUN_S / 2, SUN_R, 235, phase);
  const o = SUN_S / 2;
  for (let y = Math.round(o - SUN_R + 5); y < g.h; y++)
    for (let x = Math.round(o - 7.5); x < Math.round(o + 7.5); x++) g.set(x, y, 0, 0);
}

/** 작은 음표 (송년회 3차 세트 덤): 0 분홍 · 1 금빛 */
const NOTE = ["..##", "..#.", "..#.", "..#.", "###.", "###."];
/** 이마 땀방울 (작심삼일 세트 덤): 0 그대로 · 1 반짝 */
const SWEAT = [".w.", "ddd", "ddD", ".D."];
/** 빙어 (빙어 축제 세트 덤, 옆으로 누운 모습 — 오른쪽이 머리): 0 · 1 꼬리 파닥 */
const FISH = ["b...bbb.", ".bsssseb", "b.ssss..", "........"];
const FISH_B = ["........", "b.ssssbb", ".bsssse.", "b......."];
/** 눈 결정 (서리 내린 묘역 세트 덤): 0 큰 · 1 작은 */
const FLAKE = ["...w...", ".w.w.w.", "..www..", "wwwWwww", "..www..", ".w.w.w.", "...w..."];
const FLAKE_S = [".....", ".w.w.", "..W..", ".w.w.", "....."];

export const SEASON_FX3_ART = {
  /** 밤 빛 번짐 (HALO 빛깔마다 한 칸) */
  ssHalo3: {
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
  /** 알딸딸 오라 거품 여섯 (시안 bubble 그대로, 거품마다 한 칸) */
  ssBubble: {
    w: 7,
    h: 7,
    frames: TIPSY_BUBBLES.length,
    build: frames(7, 7, TIPSY_BUBBLES.length, (g, f) => P.bubble(g, 3, 3, TIPSY_BUBBLES[f][2], TIPSY_BUBBLES[f][3])),
  },
  /** 몸 뒤 기운: 0 알딸딸 분홍 · 1 핫팩 주황 */
  ssHaze: {
    w: 21,
    h: 28,
    frames: 2,
    build: frames(21, 28, 2, (g, f) => (f ? haze(g, P.warm, 10.5, 14, 40) : haze(g, 0xff9ac8, 9.5, 13, 46))),
  },
  /** 첫 햇살 해 (0 · 1 빛살 길이 번갈아) */
  ssSun: {
    w: SUN_S,
    h: SUN_S,
    frames: 2,
    build: frames(SUN_S, SUN_S, 2, (g, f) => P.sunDisk(g, SUN_S / 2, SUN_S / 2, SUN_R, 235, f)),
  },
  /** 첫 햇살 해 밤 빛 (몸 자리를 비운 해) */
  ssSunRim: {
    w: SUN_S,
    h: SUN_S,
    frames: 2,
    build: frames(SUN_S, SUN_S, 2, sunRim),
  },
  /** 금빛 반짝 (0 큰 십자 · 1 작은 점) */
  ssSpark3: {
    w: 3,
    h: 3,
    frames: 2,
    build: frames(3, 3, 2, (g, f) => {
      g.set(1, 1, 0xfff6c0);
      if (!f) for (const [x, y] of [[0, 1], [2, 1], [1, 0], [1, 2]] as const) g.set(x, y, 0xffd860, 170);
    }),
  },
  /** 핫팩 오라 따뜻한 김 한 줄기 (시안 wave, 0 · 1 물결 위상) */
  ssWarm: {
    w: 4,
    h: 8,
    frames: 2,
    build: frames(4, 8, 2, (g, f) => P.wave(g, 1, 7, 7, f * 2, 220)),
  },
  /** 핫팩 (0 바로 · 1 기울어짐 — 시안 hotpack) */
  ssHotpack: {
    w: 8,
    h: 8,
    frames: 2,
    build: frames(8, 8, 2, (g, f) => P.hotpack(g, 3, 3, f)),
  },
  /** 사흘째 발자국 (0 형광 운동화 · 1 삼선 슬리퍼 — 시안 그대로) */
  ssDay3: {
    w: 5,
    h: 7,
    frames: 2,
    build: frames(5, 7, 2, (g, f) => over(g, f ? P.slipper() : P.sneaker(), 0, 0)),
  },
  /** 성에 얼음 꽃 (0 십자 · 1 여섯 갈래 — 시안 rime) */
  ssRime: {
    w: 9,
    h: 7,
    frames: 2,
    build: frames(9, 7, 2, (g, f) => over(g, P.rime(f), 0, 0)),
  },
  /** 성에 얼음 꽃 밤 빛 (시안 light 0xa8dcff) */
  ssRimeGlow: {
    w: 9,
    h: 7,
    frames: 2,
    build: frames(9, 7, 2, (g, f) => {
      g.ellipse(4.5, 3.5, 4.5, 3.5, 0xa8dcff, f ? 60 : 50);
      g.ellipse(4.5, 3.5, 2, 1.6, 0xe8f6ff, 120);
    }),
  },
  /** 꼬마 너구리 (옆 16칸) */
  ssRaccoon: petArt("ye_raccoon", 16, 12),
  /** 꼬마 산양 */
  ssGoat: petArt("su_goat", 16, 13),
  /** 빙어 도둑 펭귄 */
  ssPenguin: petArt("ic_penguin", 14, 13),
  /** 꼬마 눈토끼 */
  ssSnowbun: petArt("fr_snowbun", 14, 11),
  /** 꼬마 눈토끼 푸르스름한 몸빛 (시안 viewLights 0x9ad0ff) */
  ssBunGlow: {
    w: 15,
    h: 11,
    frames: 1,
    // 몸에 딱 맞게 (밖으로는 옅게) — 어두운 밤에 눈 뭉치가 스스로 하얗게 빛나 보이게
    build: frames(15, 11, 1, (g) => {
      g.ellipse(7.5, 5.5, 7.5, 5.5, 0x9ad0ff, 30);
      g.ellipse(7.5, 5.5, 5.5, 4, 0x9ad0ff, 95);
      g.ellipse(7.5, 5.5, 3.5, 2.5, 0xe8f6ff, 120);
    }),
  },
  /** 작은 음표 (0 분홍 · 1 금빛) */
  ssNote3: {
    w: 6,
    h: 8,
    frames: 2,
    build: frames(6, 8, 2, (g, f) => {
      g.draw(art(NOTE, { "#": f ? P.gold : P.pink }), 1, 1);
      g.outline(0x3a1a2a, false, 210);
      g.set(3, 1, f ? P.goldHi : P.pinkHi);
    }),
  },
  /** 아침 금빛 (몸 둘레 — 몸 뒤에 더해 그린다) */
  ssGoldRim: {
    w: 27,
    h: 33,
    frames: 1,
    build: frames(27, 33, 1, (g) => {
      g.ellipse(13.5, 16.5, 13.5, 16.5, 0xffc860, 40);
      g.ellipse(13.5, 16.5, 11, 14, 0xffd870, 60);
      g.ellipse(13.5, 16.5, 8.5, 11.5, 0xffe890, 70);
    }),
  },
  /** 이마 땀방울 (0 · 1 반짝) */
  ssSweat: {
    w: 5,
    h: 6,
    frames: 2,
    build: frames(5, 6, 2, (g, f) => {
      g.draw(art(SWEAT, { w: 0xffffff, d: P.drop, D: 0x5ab0e0 }), 1, 1);
      g.outline(0x2a4a6a, false, 160);
      if (f) {
        g.set(2, 2, 0xffffff);
        g.set(0, 0, 0xffffff, 200);
      }
    }),
  },
  /** 퐁 튀어 오르는 빙어 (0 · 1 꼬리 파닥) */
  ssSmelt3: {
    w: 10,
    h: 6,
    frames: 2,
    build: frames(10, 6, 2, (g, f) => {
      g.draw(art(f ? FISH_B : FISH, { s: P.smeltBody, b: P.smeltBack, e: P.smeltEye }), 1, 1);
      g.outline(0x2a4a6a, false, 200);
    }),
  },
  /** 얼음 구멍 · 튀는 물방울 (0 구멍 · 1 물방울) */
  ssIceHole: {
    w: 9,
    h: 4,
    frames: 2,
    build: frames(9, 4, 2, (g, f) => {
      if (f) {
        for (const [x, y] of [[1, 2], [3, 0], [5, 1], [7, 2]] as const) g.set(x, y, 0xe8f6ff);
        return;
      }
      g.ellipse(4.5, 2, 4.5, 2, P.iceLo, 230);
      g.ellipse(4.5, 2.2, 3, 1.2, 0x2a4a78, 240);
    }),
  },
  /** 눈 결정 (0 큰 · 1 작은) */
  ssFlake: {
    w: 7,
    h: 7,
    frames: 2,
    build: frames(7, 7, 2, (g, f) => g.draw(art(f ? FLAKE_S : FLAKE, { w: P.ice, W: P.iceHi }), f ? 1 : 0, f ? 1 : 0)),
  },
} as const;

export type Season3ArtId = keyof typeof SEASON_FX3_ART;

// ── 규칙 ──

/** 네 방향 펫 앞·뒷모습 프레임 (petBreeds BREED_DIRS와 같은 열) */
const DIRS3 = { down: { walk: [6, 7], rest: [8, 8, 8, 9] }, up: { walk: [10, 11], rest: [12, 12, 12, 13] } } as const;

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다) */
export const SEASON_FX3 = {
  ye_tipsy: { kind: "aura", motion: "ssTipsy", light: true },
  su_sunrise: { kind: "aura", motion: "ssSunrise", light: true },
  ic_hotpack: { kind: "aura", motion: "ssHotpack", light: true },
  // 사흘째 발자국: 걸음을 세어 운동화 → 운동화 → 슬리퍼 (cycle, 좌우 발은 번갈아 뒤집기)
  rs_day3: { kind: "trail", art: "ssDay3", step: 8, life: 2600, motion: "prints", cycle: [0, 0, 1] },
  // 성에 발자국: 밟은 자리에 얼음 꽃이 번진다 (spread), 밤엔 푸른 빛
  fr_rime: { kind: "trail", art: "ssRime", step: 8, life: 2600, motion: "spread", glowArt: "ssRimeGlow" },
  // 꼬마 너구리: 멈추면 앉아 깜빡, 가끔 꼬리 살랑 들썩 (3차 노래방 흥)
  ye_raccoon: { kind: "pet", art: "ssRaccoon", hover: 0, dirs: DIRS3, fps: 7, idleFps: 1.5, pose: { idle: [2, 2, 2, 3], act: [4, 5, 4, 5, 4, 5, 2], actMs: 220, every: 7000, lift: [1, 0, 1, 0, 1, 0, 0] } },
  // 꼬마 산양: 가끔 바위 타듯 깡충깡충
  su_goat: { kind: "pet", art: "ssGoat", hover: 0, dirs: DIRS3, fps: 8, idleFps: 1.5, pose: { idle: [2, 2, 3, 2], act: [4, 4, 5, 4, 4, 5], actMs: 180, every: 6500, lift: [2, 4, 0, 2, 4, 0] } },
  // 빙어 도둑 펭귄: 가끔 날개를 들썩이며 모른 척 뒤뚱
  ic_penguin: { kind: "pet", art: "ssPenguin", hover: 0, dirs: DIRS3, fps: 6, idleFps: 1.3, pose: { idle: [2, 2, 2, 3], act: [4, 5, 4, 5, 4, 5], actMs: 200, every: 7000, lift: [0, 1, 0, 1, 0, 1] } },
  // 꼬마 눈토끼: 깡충 (걷기 둘째 장이 뜬 모습), 가끔 제자리 깡충, 밤엔 몸이 푸르스름하게 빛난다
  fr_snowbun: {
    kind: "pet",
    art: "ssSnowbun",
    hover: 0,
    dirs: DIRS3,
    fps: 7,
    idleFps: 1.4,
    glow: true,
    glowNight: true,
    glowArt: "ssBunGlow",
    glowAt: [0, 5],
    pose: { idle: [2, 2, 2, 3], act: [4, 4, 4, 5], actMs: 160, every: 5500, lift: [2, 4, 2, 0] },
  },
} satisfies Record<string, FxSpec>;

/** 시트 그림(seasonSetGear3)에 덧붙는 밤 빛 (cosmeticFx GEAR_EXTRA_FX에 섞인다) */
export const SEASON_GEAR_FX3 = {
  ye_mic: { kind: "aura", motion: "ssMic", light: true },
  fr_icicle: { kind: "aura", motion: "ssIcicle", light: true },
} satisfies Record<string, FxSpec>;

/** 세트 덤 연출 (한 벌을 다 입으면) */
export const SEASON_SET_FX3: Readonly<Record<string, FxSpec>> = {
  "year-end": { kind: "aura", motion: "ssNoteSet", light: true },
  "sunrise-hike": { kind: "aura", motion: "ssDawnSet", light: true },
  resolution: { kind: "aura", motion: "ssSweatSet" },
  "smelt-fest": { kind: "aura", motion: "ssSmeltSet" },
  "frost-yard": { kind: "aura", motion: "ssFlakeSet", light: true },
};

export const SEASON3_MOTIONS = ["ssTipsy", "ssSunrise", "ssHotpack", "ssMic", "ssIcicle", "ssNoteSet", "ssDawnSet", "ssSweatSet", "ssSmeltSet", "ssFlakeSet"] as const;
export type Season3Motion = (typeof SEASON3_MOTIONS)[number];

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
/** 머리 윗면 y (모자 빼고 — faceAnchor top, 없으면 그림 맨 위) */
const headTop = (f: FxInput) => f.headY - (f.face?.top ?? f.artTop);

/** 아침(6~9시)인지 — 마을 시각 (?time= 덮어쓰기 포함), 1초마다만 다시 본다 */
let dawnAt = -Infinity;
let dawnNow = false;
function isDawn(now: number): boolean {
  if (Math.abs(now - dawnAt) < 1000) return dawnNow;
  dawnAt = now;
  const hour = typeof location !== "undefined" ? parseAmbienceOverride(location.search).hour : undefined;
  const h = hour ?? kstHour(Date.now());
  dawnNow = h >= 6 && h < 9;
  return dawnNow;
}

/** 새 움직임 그리기. t = 시각(움직임 줄이기·미리보기면 0) */
export function season3Aura(motion: Season3Motion, f: FxInput, t: number, d: Draw): void {
  const calm = f.reduced || !!f.still;
  const light = (o: Partial<FxCmd>): Partial<FxCmd> => ({ layer: "light", depth: 0, ...o });
  const s = sideOf(f);
  switch (motion) {
    case "ssTipsy": {
      // 알딸딸 오라: 몸 뒤 분홍 기운 + 머리 둘레로 분홍·금 거품이 보글보글 올라간다 (밤엔 거품이 빛 층에서 스스로 빛나고 머리에 분홍 불빛)
      if (f.hidden) return;
      d.push("ssHaze", 0, f.x, f.headY - 2, { oy: 1, layer: "body", depth: d.depth - 0.3 });
      const head = headTop(f);
      const cyc = 2600;
      TIPSY_BUBBLES.forEach(([dx, dy], i) => {
        const u = calm ? (i * 0.37) % 1 : ((t + (i * cyc) / TIPSY_BUBBLES.length) % cyc) / cyc;
        const a = u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1;
        const x = f.x + dx + Math.sin(u * Math.PI * 2 + i) * 0.8;
        const y = head + dy + 7 - u * 7;
        d.push("ssBubble", i, Math.round(x), Math.round(y), d.around(1, { alpha: a }, d.night));
      });
      if (d.night) d.push("ssHalo3", H_PINK, f.x, head + 4, light({ alpha: 0.3, sx: 2.2, sy: 2.2 }));
      break;
    }
    case "ssSunrise": {
      // 첫 햇살 오라: 등 뒤로 큰 해가 둥실 (빛살이 번갈아 반짝) + 앞에 금빛 반짝 셋. 밤엔 해 테두리가 빛 층에서 스스로 빛난다
      if (f.hidden) return;
      const bob = calm ? 0 : Math.round(Math.sin(t / 1600));
      const sy = f.headY - 16 + bob;
      const fr = calm ? 0 : Math.floor(t / 700) % 2;
      d.push("ssSun", fr, f.x, sy, { layer: "body", depth: d.depth - 0.35 });
      if (d.night) {
        d.push("ssSunRim", fr, f.x, sy, light({ alpha: 0.75 }));
        d.push("ssHalo3", H_SUN, f.x, sy, light({ alpha: 0.35, sx: 3.4, sy: 3.4 }));
      }
      const flip = s < 0 ? -1 : 1;
      (
        [
          [13, -20, 0],
          [-11, -25, 1],
          [-14, -9, 1],
        ] as const
      ).forEach(([dx, dy, fr2], i) => {
        const tw = calm ? 1 : 0.35 + 0.65 * Math.max(0, Math.sin(t / 420 + i * 2.1));
        d.push("ssSpark3", fr2, f.x + dx * flip, f.headY + dy, d.around(1, { alpha: tw }, true));
      });
      break;
    }
    case "ssHotpack": {
      // 핫팩 오라: 몸 뒤 주황 기운 + 아른아른 올라가는 김 둘 + 양옆에 둥실 뜬 핫팩 둘 (밤엔 핫팩마다 온기 빛)
      if (f.hidden) return;
      d.push("ssHaze", 1, f.x, f.headY - 1, { oy: 1, layer: "body", depth: d.depth - 0.3 });
      const flip = s < 0 ? -1 : 1;
      const head = headTop(f);
      (
        [
          [-10, f.headY - 5, 0],
          [4, head - 1, 1],
        ] as const
      ).forEach(([dx, y0, k]) => {
        const cyc = 1800;
        const u = calm ? 0.4 : ((t + k * 900) % cyc) / cyc;
        const a = u < 0.2 ? u / 0.2 : u > 0.7 ? (1 - u) / 0.3 : 1;
        d.push("ssWarm", Math.floor(t / 260 + k) % 2, f.x + dx * flip, Math.round(y0 - 4 - u * 3), d.around(1, { alpha: a * 0.9 }, d.night));
      });
      // 핫팩 둘은 시안 자리(몸 앞쪽 옆 · 머리 옆 반대쪽)에서 둥실둥실 (몸 앞을 가로지르지 않게 옆에서만 흔들린다)
      for (let k = 0; k < 2; k++) {
        const bob = calm ? 0 : Math.sin(t / 700 + k * 2.2);
        const x = Math.round(f.x + (k ? -12 : 11) * flip + (calm ? 0 : Math.sin(t / 1300 + k) * 1.2));
        const y = Math.round((k ? f.headY - 18 : f.headY - 8) + bob * 1.5);
        d.push("ssHotpack", k, x, y, d.around(1, {}));
        if (d.night) d.push("ssHalo3", H_WARM, x, y, light({ alpha: 0.85, sx: 0.9, sy: 0.9 }));
      }
      if (d.night) d.push("ssHalo3", H_WARM, f.x, f.headY - 9, light({ alpha: 0.25, sx: 2.5, sy: 2.5 }));
      break;
    }
    case "ssMic": {
      // 애창곡 마이크 분홍 불빛 테 (뒷모습은 몸에 가려 없음)
      if (f.hidden || f.dir === DIR.up) return;
      const pulse = calm ? 1 : 0.8 + 0.2 * Math.sin(t / 260);
      d.push("ssHalo3", H_PINK, Math.round(f.x + f.hand.dx), Math.round(f.headY - f.hand.up - 2), light({ alpha: (d.night ? 0.9 : 0.2) * pulse, sx: 0.55, sy: 0.55 }));
      break;
    }
    case "ssIcicle": {
      // 고드름 왕관 얼음빛 (밤에 또렷)
      if (f.hidden) return;
      const pulse = calm ? 1 : 0.8 + 0.2 * Math.sin(t / 900);
      d.push("ssHalo3", H_ICE, f.x, headTop(f) - 3, light({ alpha: (d.night ? 0.8 : 0.15) * pulse, sx: 0.65, sy: 0.65 }));
      break;
    }
    case "ssNoteSet": {
      // 세트 덤 「송년회 3차」: 서 있으면 머리 옆 위로 작은 음표가 통통 튀며 떠올랐다 사라진다 (두 개가 번갈아)
      if (f.hidden || (f.moving && !f.still)) return;
      const top = f.headY - f.artTop;
      const cyc = 1800;
      for (let k = 0; k < 2; k++) {
        const tt = calm ? (k ? 0.65 : 0.25) * cyc : t + k * (cyc / 2);
        const n = Math.floor(tt / cyc);
        const u = (tt % cyc) / cyc;
        const side = (n + k) % 2 ? 1 : -1;
        // 머리 옆에서 떠올라 이름표(머리 위)를 가리지 않는다
        const x = f.x + side * (8 + h01(n, k) * 3) + side * u * 2;
        const y = top + 5 - u * 9 - Math.abs(Math.sin(u * Math.PI * 3)) * 2;
        const a = u < 0.15 ? u / 0.15 : u > 0.7 ? (1 - u) / 0.3 : 1;
        d.push("ssNote3", (n + k) % 2, Math.round(x), Math.round(y), d.around(1, { alpha: a }, d.night));
      }
      break;
    }
    case "ssDawnSet": {
      // 세트 덤 「해맞이 산행」: 아침(6~9시)이면 몸 둘레가 금빛으로 물든다 (몸 뒤에 더해 그린 금빛 + 반짝 둘). 미리보기는 늘
      if (f.hidden || (!f.still && !isDawn(f.now))) return;
      const pulse = calm ? 1 : 0.75 + 0.25 * Math.sin(t / 1100);
      d.push("ssGoldRim", 0, f.x, f.headY + 2, { oy: 1, alpha: pulse, layer: "body", add: true, depth: d.depth - 0.3 });
      for (let i = 0; i < 2; i++) {
        const a = (calm ? 0.8 : t / 2400) + i * Math.PI;
        const tw = calm ? 1 : 0.4 + 0.6 * Math.max(0, Math.sin(t / 330 + i * 1.7));
        d.push("ssSpark3", 0, Math.round(f.x + Math.cos(a) * 10), Math.round(f.headY - f.artTop * 0.5 + Math.sin(a) * 6), light({ alpha: tw }));
      }
      if (d.night) d.push("ssHalo3", H_GOLD, f.x, f.headY - 10, light({ alpha: 0.3, sx: 2.4, sy: 2.4 }));
      break;
    }
    case "ssSweatSet": {
      // 세트 덤 「작심삼일」: 멈춰 서 있으면 이마(머리띠 바로 아래)에 땀방울이 맺혀 반짝, 조금 흘러내리다 사라진다
      if (f.hidden || f.dir === DIR.up || (f.moving && !f.still)) return;
      const cyc = 2800;
      const u = calm ? 0.3 : (t % cyc) / cyc;
      if (u > 0.85) return;
      const a = u < 0.12 ? u / 0.12 : u > 0.65 ? (0.85 - u) / 0.2 : 1;
      const dx = (f.face?.dx ?? 0) + (s ? s : 2);
      const y = f.headY - faceUp(f) - 3 + Math.min(2, Math.max(0, (u - 0.4) * 6));
      d.push("ssSweat", u > 0.2 && u < 0.4 ? 1 : 0, Math.round(f.x + dx), Math.round(y), { alpha: a, layer: "body", depth: d.depth + 0.25 });
      break;
    }
    case "ssSmeltSet": {
      // 세트 덤 「빙어 축제」: 멈춰 서 있으면 가끔 발밑 얼음 구멍에서 빙어가 퐁 튀어 올라 반원을 그리고 다시 쏙 (물방울 톡)
      if (f.hidden || (f.moving && !f.still)) return;
      const cyc = 3400;
      const n = calm ? 0 : Math.floor(t / cyc);
      const u = calm ? 0.22 : (t % cyc) / cyc;
      if (u > 0.62) return;
      const side = n % 2 ? 1 : -1;
      const hx = f.x + side * (7 + Math.round(h01(n, 4) * 2));
      const hy = f.headY + 2;
      d.push("ssIceHole", 0, hx + side * 2, hy, { alpha: u < 0.05 ? u / 0.05 : u > 0.5 ? (0.62 - u) / 0.12 : 1, layer: "ground", depth: 0 });
      if (u < 0.45) {
        const v = u / 0.45;
        const x = hx + side * v * 4;
        const y = hy - 2 - Math.sin(v * Math.PI) * 10;
        d.push("ssSmelt3", Math.floor(v * 8) % 2, Math.round(x), Math.round(y), {
          rot: side * (v - 0.5) * 2.2,
          flip: side < 0,
          layer: "body",
          depth: d.depth + 0.15,
        });
      } else d.push("ssIceHole", 1, hx + side * 4, hy - 2 - (u - 0.45) * 8, { alpha: 1 - (u - 0.45) / 0.17, layer: "body", depth: d.depth + 0.15 });
      break;
    }
    case "ssFlakeSet": {
      // 세트 덤 「서리 내린 묘역」: 밤이면 몸 둘레로 작은 눈 결정 다섯이 천천히 돈다 (뒤쪽 반 바퀴는 몸 뒤)
      if (f.hidden || !d.night) return;
      const cy = f.headY - f.artTop * 0.5;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + (calm ? 0.3 : t / 4200);
        const z = Math.sin(a);
        const bob = calm ? 0 : Math.sin(t / 900 + i) * 1.5;
        d.push("ssFlake", i % 2, Math.round(f.x + Math.cos(a) * 11), Math.round(cy + z * 3 + bob - (i % 3) * 2), d.around(z, { alpha: 0.7 }, true));
      }
      break;
    }
  }
}

/** 따로 그리는 연출 아이콘 (해당 없으면 null) */
export function season3FxIconGrid(id: string): Grid | null {
  return FX_ICONS3[id]?.() ?? null;
}
