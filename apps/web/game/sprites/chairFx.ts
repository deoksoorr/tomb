import { DIR } from "@tomb/protocol";
import { BAND_PAPER_UP, crownRows, DUO_CUP_DX, duoPlateUp } from "./chairGear";
import type { FxArtId, FxCmd, FxInput, FxSpec } from "./cosmeticFx";
import { Grid, mix, vnoise, type Color } from "./pixel";

// 11/20 「회장님 독대」 주간 1위 보상 연출 (상점에 없고 1위가 한 주 빌려 입는다 — protocol CHAIR_REWARD).
// 그림(CHAIR_FX_ART)은 cosmeticFx FX_ART에, 규칙(CHAIR_FX·CHAIR_GEAR_FX)은 COSMETIC_FX·GEAR_EXTRA_FX에 섞이고,
// 움직임(chairAura)은 cosmeticFx aura()가 그리기 도우미를 넘겨 그린다 (이 파일은 cosmeticFx를 타입으로만 읽는다).
// 가장 어려운 보상이라 주간 레이스 1위 오라보다 한 단계 화려하게. 그래도 가볍게: 모두 미리 구운 그림, 한 사람에 오라 30장 안팎 · 모자 6장 안팎.
//  chair_aura_gold 연봉 인상 금박 오라: 몸 뒤로 천천히 도는 금빛 햇살 + 발밑 금 인장 고리(보석 박힌 두 겹) + 양옆 빛기둥,
//    ₩ 금화가 나선으로 돌며 솟고 금박·↑·별이 반짝, 3.6초마다 「+연봉」 금빛 글자가 터지며 고리가 퍼진다 (밤이면 더 밝게)
//  chair_aura_ember 사직서 불씨 오라: 몸 뒤 일렁이는 불꽃 망토 + 발밑 불꽃 고리(불 혀가 날름), 불씨 회오리가 솟고
//    타는 사직서 조각이 말려 재가 되며, 3초마다 불길이 확 치솟아 불씨가 튄다 (밤이면 더 밝게)
//  chair_crown 황금 사원증 왕관: 2초마다 보석 띠를 따라 빛이 훑고 꼭대기 다이아가 반짝, 작은 별 셋이 왕관을 돈다, 밤엔 금빛 번짐
//  chair_band 불타는 사직서 머리띠: 사직서 탄 끝에서 큰 불길(네 장)이 일렁 + 불티 셋 · 불빛 번짐(밤엔 더 환하게)
// 11/23 2관왕 (노멀·헬 모두 1위 — 두 벌 대신 이 한 벌만). 11/24 「너무 심심하다」 → 노멀 금빛 + 헬 불꽃을 섞어 게임에서 가장 화려하게:
//  chair_aura_stamp 결재 도장 금빛 소나기: 발밑에 금·진홍 결재 인장(새김 눈금·글자 마디가 서로 거꾸로 돌고 뒤 테두리에 금·불 혀),
//    몸 뒤 금·진홍 햇살 + 빛기둥(밤엔 머리 위 하늘까지) + 금빛 빗줄기, 금·진홍 불씨가 나선으로 솟고 결재 서류 셋이 허리춤을 돈다.
//    4.2초마다 큰 금 도장이 옆에 쿵 — 몸 뒤 섬광 · 인장 충격파 · 불꽃이 튀고 「결재」 금빛 글자가 솟는다 (밤이면 더 밝게)
//  chair_duo_crown 회장실 금장 명패 왕관: 양 끝 금 잔의 금·진홍 불꽃이 일렁이고, 명패 위로 빛이 훑고 다이아 반짝 · 별 둘이 돈다, 밤엔 금빛 번짐

export type ChairMotion = "chGold" | "chEmber" | "chFlame" | "chCrown" | "chStamp" | "chDuoCrown";

/** cosmeticFx가 넘겨주는 그리기 도우미 (seasonSetFx SeasonDraw와 같은 모양) */
export type ChairDraw = {
  push: (art: FxArtId, frame: number, x: number, y: number, o?: Partial<FxCmd>) => void;
  around: (z: number, o: Partial<FxCmd>, light?: boolean) => Partial<FxCmd>;
  night: boolean;
  /** 몸 그림 depth */
  depth: number;
};

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

function rows(g: Grid, art: readonly string[], pal: Record<string, Color>, ox = 0, oy = 0): void {
  art.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && pal[ch] !== undefined && g.set(ox + x, oy + y, pal[ch])));
}

const GOLD = 0xf6c83a;
const GOLD_HI = 0xfff4b0;
const GOLD_MID = 0xe0a828;
const GOLD_LO = 0xc08a1e;
const PAPER = 0xe8dcc0;
const CHAR = 0x3a2620;
const ASH = 0x8a8480;
const FIRE_W = 0xfffbe0;
const FIRE_Y = 0xfff0a0;
const FIRE_O = 0xffa030;
const FIRE_R = 0xe8381e;
const FIRE_D = 0xa01818;

/** 몸 뒤 빛 (0 금 · 1 주홍): 가운데가 밝은 세로 타원 세 겹 */
function glow(g: Grid, f: number): void {
  const [a, b, c] = f ? [0xc8401a, 0xff6a24, 0xffb050] : [0xc89020, 0xffcc50, 0xfff0b0];
  g.ellipse(13, 18, 13, 18, a, 34);
  g.ellipse(13, 18, 9.5, 14, b, 50);
  g.ellipse(13, 19, 6, 9.5, c, 64);
}

/**
 * 기둥 불꽃: 칸마다 높이가 다른 불 혀 (가운데가 높고 가장자리가 낮다, 노이즈로 들쭉날쭉) — 밑은 흰 노랑, 위로 주황·빨강·검붉게.
 * 장(f)마다 위쪽이 좌우로 휘어(sway) 일렁인다. rim = 바깥에 검붉은 테 한 줄
 */
function flameCols(
  g: Grid,
  w: number,
  h: number,
  f: number,
  seed: number,
  o: { alpha?: number; jag?: number; hot?: number; sway?: number; rim?: boolean; peak?: number; pal?: readonly [Color, Color, Color, Color, Color] } = {},
): void {
  const [cW, cY, cO, cR, cD] = o.pal ?? [FIRE_W, FIRE_Y, FIRE_O, FIRE_R, FIRE_D];
  const alpha = o.alpha ?? 255;
  const jag = o.jag ?? 0.5;
  const hot = o.hot ?? 0.3;
  const sw = (o.sway ?? 1) * [-1.2, -0.4, 1.2, 0.4][f % 4];
  const c = w / 2;
  for (let x = 0; x < w; x++) {
    const dx = Math.abs(x + 0.5 - c) / c;
    const bell = Math.max(0, 1 - dx * dx);
    const n = vnoise(x * 1.7 + seed * 13, f * 2.3 + seed, 1.9, seed + 3);
    const colH = Math.round(h * Math.pow(bell, o.peak ?? 0.75) * (1 - jag + jag * n));
    for (let j = 0; j < colH; j++) {
      const v = j / colH;
      const core = dx < hot * (0.7 + 0.3 * n) && j / h < 0.26 + 0.18 * n;
      const col = core ? (j / h < 0.12 && dx < hot * 0.4 ? cW : cY) : v < 0.5 ? cO : v < 0.82 ? cR : cD;
      g.set(x + Math.round(sw * Math.pow(j / h, 1.6)), h - 1 - j, col, Math.round(alpha * (v < 0.85 ? 1 : 0.75)));
    }
  }
  if (o.rim) g.outline(cD, false, 150);
}

/** 몸 뒤 금빛 햇살 (긴 빛살·짧은 빛살 번갈아 16갈래, 4단계 회전) */
const raysBuild = frames(56, 56, 4, (g, ph) => {
  const N = 16;
  for (let y = 0; y < 56; y++)
    for (let x = 0; x < 56; x++) {
      const dx = x + 0.5 - 28;
      const dy = y + 0.5 - 28;
      const r = Math.hypot(dx, dy);
      const u = ((Math.atan2(dy, dx) / (Math.PI * 2) + 1) * N + ph / 4) % N;
      const i = Math.floor(u);
      const len = i % 2 ? 20 : 27.5;
      if (r > len || r < 7) continue;
      const across = Math.abs((u % 1) - 0.5) * 2;
      const wdt = i % 2 ? 0.3 : 0.42;
      if (across > wdt) continue;
      const kr = Math.min(1, (r - 7) / 6) * Math.pow(1 - r / len, 0.9);
      const ka = 1 - across / wdt;
      const v = kr * (0.45 + 0.55 * ka);
      if (v < 0.06) continue;
      g.set(x, y, v > 0.5 ? GOLD_HI : v > 0.25 ? GOLD : GOLD_MID, Math.round(200 * Math.min(1, v * 1.3)));
    }
});

/** 몸 뒤 불꽃 망토 (네 장 일렁임) */
const mantleBuild = frames(30, 40, 4, (g, f) => flameCols(g, 30, 40, f, 5, { alpha: 235, jag: 0.6, hot: 0.75, sway: 2.5 }));

/** 그림 가운데(몸 자리) 타원을 비운다 — 밤에 빛 층에 한 번 더 그려도 몸을 덮지 않게 (가로 반지름 rx · 세로 ry, 가운데 cx·cy) */
function holed(build: () => Grid, w: number, n: number, cx: number, cy: number, rx: number, ry: number): () => Grid {
  return () => {
    const g = build();
    for (let f = 0; f < n; f++)
      for (let y = 0; y < g.h; y++)
        for (let x = 0; x < w; x++) {
          const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
          if (d < 1) g.set(f * w + x, y, 0, 0);
          else if (d < 1.25) {
            const v = g.get(f * w + x, y);
            if (v & 255) g.px[y * g.w + f * w + x] = (v & ~255) | Math.round((v & 255) * (d - 1) * 4);
          }
        }
    return g;
  };
}

/** 금 인장 고리 반쪽 (back = 위쪽 반원 → 몸 뒤, front = 아래쪽 반원 → 발 앞). 프레임 = 8단계 회전: 바깥 금 띠의 빛 마디 16개 · 안쪽 띠는 거꾸로 · 사이에 다이아 8개 */
const SEAL_W = 48;
const SEAL_H = 16;
function sealHalf(half: "back" | "front"): () => Grid {
  return frames(SEAL_W, SEAL_H / 2, 8, (g, ph) => {
    const cx = SEAL_W / 2;
    const cy = SEAL_H / 2;
    for (let y = 0; y < SEAL_H; y++) {
      if ((half === "back") !== y < cy) continue;
      const oy = half === "back" ? y : y - cy;
      for (let x = 0; x < SEAL_W; x++) {
        const dx = (x + 0.5 - cx) / (cx - 0.5);
        const dy = (y + 0.5 - cy) / (cy - 0.5);
        const d = Math.hypot(dx, dy);
        if (d > 1.03) continue;
        const ang = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
        if (d > 0.86) {
          const dash = (ang * 16 + ph / 8) % 1 < 0.45;
          g.set(x, oy, dash ? GOLD_HI : GOLD, dash ? 250 : 185);
        } else if (d > 0.76) {
          const stud = (ang * 8 - ph / 16 + 1) % 1 < 0.09;
          g.set(x, oy, stud ? 0xffffff : GOLD_MID, stud ? 240 : 60);
        } else if (d > 0.64) {
          const dash = (ang * 10 - ph / 8 + 1) % 1 < 0.3;
          g.set(x, oy, dash ? GOLD_HI : GOLD_MID, dash ? 220 : 120);
        } else g.set(x, oy, GOLD, 34);
      }
    }
  });
}

/** 불꽃 고리 (발밑 타원 테두리에서 불 혀가 솟는다). 위쪽 반(+ 불 혀 자리 7줄)과 아래쪽 반으로 나눠 굽는다 — 6장 */
const FR_W = 48;
const FR_RY = 7;
const FR_UP = 8;
function fireRing(half: "back" | "front"): () => Grid {
  const hh = half === "back" ? FR_UP + FR_RY : FR_RY + 2;
  return frames(FR_W, hh, 6, (g, ph) => {
    // 가상 판: 타원 가운데 줄 = back 판의 맨 아래 / front 판의 맨 위
    const cy = half === "back" ? hh : 0;
    const rx = FR_W / 2 - 1;
    const cx = FR_W / 2;
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < FR_W; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / FR_RY;
        const d = Math.hypot(dx, dy);
        if (d > 1.04) continue;
        if (d > 0.8) g.set(x, y, d > 0.93 ? FIRE_O : FIRE_R, d > 0.93 ? 210 : 150);
        else g.set(x, y, FIRE_D, 46);
      }
    // 불 혀: 테두리 칸마다 노이즈 높이로 위로 솟는다
    for (let x = 1; x < FR_W - 1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (Math.abs(dx) > 0.98) continue;
      const rimY = cy + (half === "back" ? -1 : 1) * FR_RY * Math.sqrt(1 - dx * dx);
      const n = vnoise(x * 1.3, ph * 2.1, 1.7, half === "back" ? 11 : 12);
      const th = Math.round(half === "back" ? 2 + 6 * n * n : 1 + 3 * n * n);
      for (let j = 0; j < th; j++) {
        const y = Math.round(rimY) - j;
        if (y < 0 || y >= hh) continue;
        const v = j / th;
        g.set(x, y, v < 0.3 ? FIRE_Y : v < 0.65 ? FIRE_O : FIRE_R, Math.round(240 * (1 - v * 0.45)));
      }
    }
  });
}

/** 「+연봉」 금빛 글자 (9줄 글꼴: + · 연 · 봉, 한 칸씩 띄운다 — 진한 테두리는 굽을 때) */
const RAISE_GLYPHS: readonly (readonly string[])[] = [
  [".....", ".....", "..#..", "..#..", "#####", "..#..", "..#..", ".....", "....."],
  [".##...#", "#..#..#", "#..#.##", "#..#..#", ".##..##", "......#", "#......", "#......", "######."],
  [".#...#.", ".#####.", ".#...#.", ".#####.", "...#...", "#######", "..###..", ".#...#.", "..###.."],
];
const RAISE_TEXT = RAISE_GLYPHS[0].map((_, y) => RAISE_GLYPHS.map((gl) => gl[y]).join("."));

// ── 11/23 결재 도장 금빛 소나기 (2관왕) — 11/24 금빛 + 진홍 불꽃으로 다시 ──

const INK_R = 0xe8343a;
const INK_D = 0xa81c2a;
/** 더해 그려도 또렷한 진홍 · 짙은 진홍 */
const CRIM = 0xff3a4a;
const CRIM_D = 0xc8203a;
/** 금빛 불꽃 팔레트 (속 → 끝): 흰 금 · 금 · 금 · 주홍 · 진홍 */
const GOLD_FIRE: readonly [Color, Color, Color, Color, Color] = [0xfffbe0, GOLD_HI, GOLD, 0xff6a2a, CRIM_D];

/**
 * 결재 인장 반쪽 (발밑 큰 원판 64×20 — 노멀 금 인장 고리 48보다 크다. back = 위쪽 반 + 불 혀 자리 → 몸 뒤, front = 아래쪽 반 → 발 앞).
 * 바깥에서 안으로: 금 띠(눈금 32개가 돈다) · 진홍 띠(흰 금 글자 마디 8개가 거꾸로) · 가는 금 선 · 새김 살 12개 · 금 원 · 은은한 금빛 바닥.
 * 테두리에서 금·진홍 불 혀가 솟는다 (뒤쪽은 높게, 앞쪽은 낮게). 8단계 회전
 */
const DS_W = 64;
const DS_RY = 10;
const DS_UP = 7;
function duoSeal(half: "back" | "front"): () => Grid {
  const hh = half === "back" ? DS_UP + DS_RY : DS_RY + 2;
  return frames(DS_W, hh, 8, (g, ph) => {
    // 가상 판: 타원 가운데 줄 = back 판의 맨 아래 / front 판의 맨 위
    const cy = half === "back" ? hh : 0;
    const cx = DS_W / 2;
    const rx = cx - 0.5;
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < DS_W; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / DS_RY;
        const d = Math.hypot(dx, dy);
        if (d > 1.02) continue;
        const ang = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
        if (d > 0.91) {
          const tick = (ang * 32 + ph / 8) % 1 < 0.34;
          g.set(x, y, tick ? GOLD_HI : GOLD, tick ? 250 : 190);
        } else if (d > 0.8) {
          const stud = (ang * 8 - ph / 16 + 1) % 1 < 0.1;
          g.set(x, y, stud ? 0xfffbe0 : CRIM, stud ? 250 : 170);
        } else if (d > 0.74) g.set(x, y, GOLD_MID, 150);
        else if (d > 0.48) {
          const spoke = (ang * 12 + ph / 8) % 1 < 0.16;
          g.set(x, y, spoke ? GOLD : GOLD_MID, spoke ? 125 : 36);
        } else if (d > 0.4) g.set(x, y, GOLD_HI, 140);
        else g.set(x, y, GOLD, 52);
      }
    // 테두리 불 혀: 금 혀 · 불 혀가 뭉텅이로 번갈아
    for (let x = 1; x < DS_W - 1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      if (Math.abs(dx) > 0.96) continue;
      const rimY = cy + (half === "back" ? -1 : 1) * DS_RY * Math.sqrt(1 - dx * dx);
      const n = vnoise(x * 1.2, ph * 2.2, 1.6, half === "back" ? 31 : 32);
      const th = Math.round(half === "back" ? 1 + 6 * n * n : 1 + 2.5 * n * n);
      const gold = vnoise(x, 3, 3, 33) > 0.5;
      for (let j = 0; j < th; j++) {
        const y = Math.round(rimY) - j;
        if (y < 0 || y >= hh) continue;
        const v = j / th;
        const col = gold ? (v < 0.35 ? 0xfffbe0 : v < 0.7 ? GOLD_HI : GOLD) : v < 0.3 ? FIRE_Y : v < 0.65 ? FIRE_O : FIRE_R;
        g.set(x, y, col, Math.round(240 * (1 - v * 0.4)));
      }
    }
  });
}

/** 몸 뒤 햇살 64×64 (20갈래: 긴 금 빛살 · 짧은 진홍 불 빛살 번갈아, 4단계 회전) */
const duoRaysBuild = frames(64, 64, 4, (g, ph) => {
  const N = 20;
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const dx = x + 0.5 - 32;
      const dy = y + 0.5 - 32;
      const r = Math.hypot(dx, dy);
      const u = ((Math.atan2(dy, dx) / (Math.PI * 2) + 1) * N + ph / 4) % N;
      const i = Math.floor(u);
      const gold = i % 2 === 0;
      const len = gold ? 31 : 23;
      if (r > len || r < 8) continue;
      const across = Math.abs((u % 1) - 0.5) * 2;
      const wdt = gold ? 0.42 : 0.36;
      if (across > wdt) continue;
      const v = Math.min(1, (r - 8) / 6) * Math.pow(1 - r / len, 0.85) * (0.45 + 0.55 * (1 - across / wdt));
      if (v < 0.06) continue;
      const col = gold ? (v > 0.5 ? GOLD_HI : v > 0.25 ? GOLD : GOLD_MID) : v > 0.5 ? 0xffa040 : v > 0.25 ? 0xff5a2a : CRIM_D;
      g.set(x, y, col, Math.round(215 * Math.min(1, v * 1.3)));
    }
});

/** 금빛 빗줄기 44×56 (8장 — 한 장마다 7칸씩 내려와 처음으로 돈다). 위·아래·양옆으로 흐려지는 기둥 모양 */
const DR_W = 44;
const DR_H = 56;
const duoRainBuild = frames(DR_W, DR_H, 8, (g, f) => {
  for (let i = 0; i < 22; i++) {
    const x = 1 + Math.floor(h01(i, 141) * (DR_W - 2));
    const len = 3 + Math.floor(h01(i, 142) * 4);
    const y0 = (h01(i, 143) * DR_H + (f * DR_H) / 8) % DR_H;
    const ex = Math.abs(x + 0.5 - DR_W / 2) / (DR_W / 2);
    const side = 1 - ex * ex * 0.6;
    for (let j = 0; j < len; j++) {
      const yy = (Math.floor(y0) + j) % DR_H;
      const v = yy / DR_H;
      const env = Math.min(1, v / 0.3) * Math.min(1, (1 - v) / 0.12);
      const head = j === len - 1;
      const a = Math.round(240 * env * side * (head ? 1 : 0.35 + (0.5 * j) / len));
      if (a > 8) g.set(x, yy, head ? 0xfffbe0 : j === len - 2 ? GOLD_HI : GOLD, a);
    }
  }
});

/** 「결재」 금빛 글자 (10줄 글꼴 9칸씩 — 결 · 재, 진홍 테두리는 굽을 때) */
const SIGN_GLYPHS: readonly (readonly string[])[] = [
  ["#####..#.", "....#.##.", "....#..#.", "...#..##.", "..#....#.", ".#######.", ".......#.", ".#######.", ".#.......", ".#######."],
  ["......#.#", "......#.#", "#####.#.#", "..#...#.#", "..#...###", ".#.#..#.#", "#...#.#.#", "......#.#", "......#.#", "......#.#"],
];
const SIGN_TEXT = SIGN_GLYPHS[0].map((_, y) => SIGN_GLYPHS.map((gl) => gl[y]).join("."));

/** 큰 금 결재 도장 11×14 (손잡이 꼭지에 루비 · 몸통에 진홍 띠 · 붉은 인주 면) */
const BIG_STAMP_ART = [
  "....hgl....",
  "...hgggl...",
  "...hgRgl...",
  "....hgl....",
  "....hgl....",
  "...hgggl...",
  "..hgggggl..",
  ".hgggggggl.",
  "hgggggggggl",
  "crrRRRRRrrc",
  "hgggggggggl",
  "mgggggggggl",
  "mgggggggggl",
  "dIIIIIIIIId",
];
/** 결재 인주 자국 11×10 (0 붉은 인주 · 1 금빛): 둥근 테 안에 네모 도장 글 */
const DUO_IMPRINT_ART = [
  "...ooooo...",
  ".oo.....oo.",
  ".o.iiiii.o.",
  "o..i.i.i..o",
  "o..iiiii..o",
  "o..i.i.i..o",
  "o..iiiii..o",
  ".o.......o.",
  ".oo.....oo.",
  "...ooooo...",
];
/** 결재 서류 6×8 (금 집게 · 글줄 · 붉은 결재 도장) — 팔랑이는 네 장: 앞 · 기울게 · 날 · 뒷면 */
const DOC_ART = [
  ["..HG..", "PPPPPq", "PkkkPq", "PPPPPq", "PkkPPq", "PPPRRq", "PPPRrq", "qqqqqq"],
  ["..HG..", ".PPPq.", ".PkPq.", ".PPPq.", ".PkPq.", ".PPRq.", ".PPrq.", ".qqqq."],
  ["..G...", "..Pq..", "..Pq..", "..Pq..", "..Pq..", "..Pq..", "..Pq..", "..qq.."],
  ["..GH..", ".qPPP.", ".qPPP.", ".qPPP.", ".qPPP.", ".qPPP.", ".qPPP.", ".qqqq."],
];

export const CHAIR_FX_ART = {
  /** 몸 뒤 빛 26×36 (0 금 · 1 주홍, 더해 그린다) */
  chGlow: { w: 26, h: 36, frames: 2, build: frames(26, 36, 2, glow) },
  /** 발밑 빛 56×18 (0 금 · 1 주홍) */
  chGround: {
    w: 56,
    h: 18,
    frames: 2,
    build: frames(56, 18, 2, (g, f) => {
      g.ellipse(28, 9, 28, 9, f ? 0xc8301a : 0xd89a28, 40);
      g.ellipse(28, 9, 20, 6.5, f ? 0xff5a1e : 0xffc040, 64);
      g.ellipse(28, 9, 11, 3.5, f ? 0xffa040 : 0xfff0a0, 90);
    }),
  },
  /** 금 인장 고리 뒤쪽 반(몸 뒤)·앞쪽 반(발 앞) 48×8, 8단계 회전 */
  chSealBack: { w: SEAL_W, h: SEAL_H / 2, frames: 8, build: sealHalf("back") },
  chSealFront: { w: SEAL_W, h: SEAL_H / 2, frames: 8, build: sealHalf("front") },
  /** 몸 뒤 금빛 햇살 56×56 (긴 빛살·짧은 빛살 번갈아 16갈래, 4단계 회전 — 가운데는 몸에 가린다) */
  chRays: { w: 56, h: 56, frames: 4, build: () => raysBuild() },
  /** 밤에 빛 층에 한 번 더 그리는 햇살 (몸 자리가 뚫렸다) */
  chRaysRim: { w: 56, h: 56, frames: 4, build: holed(() => raysBuild(), 56, 4, 28, 30, 10, 17) },
  /** 빛기둥 5×40 (아래·위로 흐려지는 금빛 세로 빛) */
  chShaft: {
    w: 5,
    h: 40,
    frames: 1,
    build: () => {
      const g = new Grid(5, 40);
      for (let y = 0; y < 40; y++) {
        const k = Math.pow(Math.sin((Math.PI * (y + 0.5)) / 40), 0.8) * (0.3 + 0.7 * (y / 39));
        g.set(2, y, 0xfffbe0, Math.round(235 * k));
        g.set(1, y, GOLD, Math.round(150 * k));
        g.set(3, y, GOLD, Math.round(150 * k));
        g.set(0, y, GOLD_MID, Math.round(55 * k));
        g.set(4, y, GOLD_MID, Math.round(55 * k));
      }
      return g;
    },
  },
  /** ₩ 금화 5×5 (돈다: 앞 · 비스듬 · 날 · 반대로 비스듬) */
  chCoin: {
    w: 5,
    h: 5,
    frames: 4,
    build: frames(5, 5, 4, (g, f) => {
      const art = [
        [".hgm.", "hwgwl", "gwwwl", "mgwgl", ".mll."],
        [".hg..", "hwgl.", "gwwl.", "mgwl.", ".ml.."],
        ["..h..", "..g..", "..g..", "..m..", "..l.."],
        ["..gh.", ".lgwh", ".lwwg", ".lwgm", "..lm."],
      ][f];
      rows(g, art, { h: GOLD_HI, g: GOLD, m: GOLD_MID, l: GOLD_LO, w: 0xfffbe0 });
    }),
  },
  /** 금박 조각 3×3 (빙글 도는 네 장: 넓게 · 기울게 · 날 · 반대로 기울게) */
  chLeaf: {
    w: 3,
    h: 3,
    frames: 4,
    build: frames(3, 3, 4, (g, f) => {
      const art = [
        [".h.", "hgg", ".gl"],
        ["hg.", "ggl", ".l."],
        ["..h", ".g.", "l.."],
        [".gh", "lgg", ".l."],
      ][f];
      rows(g, art, { h: GOLD_HI, g: GOLD, l: GOLD_LO });
    }),
  },
  /** ↑ 화살표 5×6 (0 금 · 1 반짝) */
  chArrow: {
    w: 5,
    h: 6,
    frames: 2,
    build: frames(5, 6, 2, (g, f) => {
      rows(g, ["..h..", ".hgl.", "hgggl", "..g..", "..g..", "..l.."], f ? { h: 0xffffff, g: GOLD_HI, l: GOLD } : { h: GOLD_HI, g: GOLD, l: GOLD_LO });
    }),
  },
  /** ✦ 반짝 별 7×7 (0 작게 · 1 크게 · 2 중간) — 오라 반짝이·왕관 보석 빛 */
  chStar: {
    w: 7,
    h: 7,
    frames: 3,
    build: frames(7, 7, 3, (g, f) => {
      const arm = [1, 3, 2][f];
      g.set(3, 3, 0xffffff);
      for (let d = 1; d <= arm; d++) {
        const c = d === 1 ? 0xffffff : d === arm ? GOLD : GOLD_HI;
        const a = d === arm && arm > 1 ? 200 : 255;
        g.set(3 - d, 3, c, a);
        g.set(3 + d, 3, c, a);
        g.set(3, 3 - d, c, a);
        g.set(3, 3 + d, c, a);
      }
      if (f === 1) for (const [x, y] of [[2, 2], [4, 2], [2, 4], [4, 4]] as const) g.set(x, y, GOLD_HI, 150);
    }),
  },
  /** 「+연봉」 금빛 글자 23×11 */
  chRaise: {
    w: 23,
    h: 11,
    frames: 1,
    build: () => {
      const g = new Grid(23, 11);
      RAISE_TEXT.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && g.set(x + 1, y + 1, y < 3 ? GOLD_HI : y < 6 ? GOLD : GOLD_MID)));
      g.outline(0x5a3008, true, 255);
      return g;
    },
  },
  /** 금빛 섬광 21×21 (여덟 갈래 빛살) */
  chBurst: {
    w: 21,
    h: 21,
    frames: 1,
    build: () => {
      const g = new Grid(21, 21);
      g.ellipse(10.5, 10.5, 5, 5, GOLD, 90);
      for (let r = 0; r < 8; r++) {
        const a = (r * Math.PI) / 4;
        const len = r % 2 ? 7 : 10;
        for (let d = 1; d <= len; d++) g.set(Math.round(10 + Math.cos(a) * d), Math.round(10 + Math.sin(a) * d), d < 3 ? 0xffffff : GOLD_HI, Math.round(250 * (1 - d / (len + 1))));
      }
      g.set(10, 10, 0xffffff);
      return g;
    },
  },
  /** 왕관 둘레 금빛 번짐 24×18 (밤 — 가운데가 왕관 크기만큼 뚫려 왕관을 덮지 않는다) */
  chCrownGlow: {
    w: 24,
    h: 18,
    frames: 1,
    build: () => {
      const g = new Grid(24, 18);
      for (let y = 0; y < 18; y++)
        for (let x = 0; x < 24; x++) {
          const dx = x + 0.5 - 12;
          const dy = y + 0.5 - 9;
          const out = Math.hypot(dx / 12, dy / 9);
          const hole = Math.max(Math.abs(dx) / 6.5, Math.abs(dy) / 5);
          if (out > 1 || hole < 1) continue;
          const k = Math.min(1, (hole - 1) * 3) * Math.min(1, (1 - out) * 2.5);
          g.set(x, y, k > 0.6 ? GOLD_HI : GOLD, Math.round(140 * k));
        }
      return g;
    },
  },
  // ── 11/23 결재 도장 금빛 소나기 · 명패 왕관 (2관왕 — 11/24 금빛 + 진홍 불꽃으로 다시) ──
  /** 몸 뒤 빛 30×40 — 가운데 흰 금, 금, 바깥 진홍 (더해 그린다) */
  chDuoGlow: {
    w: 30,
    h: 40,
    frames: 1,
    build: () => {
      const g = new Grid(30, 40);
      g.ellipse(15, 20, 15, 20, CRIM_D, 36);
      g.ellipse(15, 20, 11, 15.5, 0xe8a030, 52);
      g.ellipse(15, 21, 6.5, 10, 0xfff0b0, 70);
      return g;
    },
  },
  /** 발밑 빛 72×24 — 은은한 보랏빛 테 · 진홍 · 금빛 안 */
  chDuoGround: {
    w: 72,
    h: 24,
    frames: 1,
    build: () => {
      const g = new Grid(72, 24);
      g.ellipse(36, 12, 36, 12, 0x7a48c8, 34);
      g.ellipse(36, 12, 28, 9, CRIM_D, 44);
      g.ellipse(36, 12, 19, 6, 0xe0b040, 66);
      g.ellipse(36, 12, 10, 3.2, 0xfff0a0, 90);
      return g;
    },
  },
  /** 결재 인장 뒤쪽 반(몸 뒤 — 불 혀 자리 포함)·앞쪽 반(발 앞) 64칸, 8단계 회전 */
  chDuoSealBack: { w: DS_W, h: DS_UP + DS_RY, frames: 8, build: duoSeal("back") },
  chDuoSealFront: { w: DS_W, h: DS_RY + 2, frames: 8, build: duoSeal("front") },
  /** 몸 뒤 금·진홍 햇살 64×64 (4단계 회전 — 가운데는 몸에 가린다) */
  chDuoRays: { w: 64, h: 64, frames: 4, build: () => duoRaysBuild() },
  /** 밤에 빛 층에 한 번 더 그리는 햇살 (몸 자리가 뚫렸다) */
  chDuoRaysRim: { w: 64, h: 64, frames: 4, build: holed(() => duoRaysBuild(), 64, 4, 32, 34, 10, 17) },
  /** 빛기둥 9×64 (가운데 흰 금 → 금 → 바깥 진홍, 위로 갈수록 흐려진다) */
  chDuoPillar: {
    w: 9,
    h: 64,
    frames: 1,
    build: () => {
      const g = new Grid(9, 64);
      const cols: readonly (readonly [number, Color, number])[] = [
        [4, 0xfffbe0, 235],
        [3, GOLD_HI, 185],
        [5, GOLD_HI, 185],
        [2, GOLD, 115],
        [6, GOLD, 115],
        [1, 0xff6a3a, 64],
        [7, 0xff6a3a, 64],
        [0, CRIM_D, 34],
        [8, CRIM_D, 34],
      ];
      for (let y = 0; y < 64; y++) {
        const k = Math.pow((y + 0.5) / 64, 1.1) * Math.min(1, (64 - y) / 5);
        for (const [x, c, a] of cols) g.set(x, y, c, Math.round(a * k));
      }
      return g;
    },
  },
  /** 금빛 빗줄기 44×56 (8장, 더해 그린다) */
  chDuoRain: { w: DR_W, h: DR_H, frames: 8, build: () => duoRainBuild() },
  /** 불씨 3×3 (0~2 금빛: 흰 금 → 금 → 식은 금 · 3~5 불씨: 노랑 → 주황 → 진홍) */
  chDuoSpark: {
    w: 3,
    h: 3,
    frames: 6,
    build: frames(3, 3, 6, (g, f) => {
      const [core, arm] = ([
        [0xffffff, GOLD_HI],
        [GOLD_HI, GOLD],
        [GOLD, GOLD_MID],
        [FIRE_Y, FIRE_O],
        [FIRE_O, FIRE_R],
        [FIRE_R, CRIM_D],
      ] as const)[f];
      g.set(1, 1, core);
      for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) g.set(x, y, arm, f % 3 === 0 ? 190 : 140);
    }),
  },
  /** 결재 서류 6×8 (팔랑이는 네 장) */
  chDuoDoc: {
    w: 6,
    h: 8,
    frames: 4,
    build: frames(6, 8, 4, (g, f) => rows(g, DOC_ART[f], { P: 0xfbf6e8, q: 0xd8ccb0, k: 0x8a8478, R: INK_R, r: INK_D, H: GOLD_HI, G: GOLD })),
  },
  /** 큰 금 결재 도장 13×16 (외곽선 포함 — 「쿵」 찍는 도장) */
  chDuoStamp: {
    w: 13,
    h: 16,
    frames: 1,
    build: () => {
      const g = new Grid(13, 16);
      rows(g, BIG_STAMP_ART, { h: GOLD_HI, g: GOLD, m: GOLD_MID, l: GOLD_LO, R: 0xf0384e, r: CRIM_D, c: 0x8a1020, I: INK_R, d: INK_D }, 1, 1);
      g.outline(0x4a1008, false, 220);
      return g;
    },
  },
  /** 결재 인주 자국 11×10 (0 붉은 인주 · 1 금빛 — 땅에 납작하게 sy로 눌러 그린다) */
  chDuoImprint: {
    w: 11,
    h: 10,
    frames: 2,
    build: frames(11, 10, 2, (g, f) => rows(g, DUO_IMPRINT_ART, f ? { o: GOLD_HI, i: GOLD } : { o: INK_R, i: INK_D })),
  },
  /** 도장이 찍힌 자리 물결 36×12 (바깥 진홍 · 안 금 두 겹 타원 테) */
  chDuoRipple: {
    w: 36,
    h: 12,
    frames: 1,
    build: () => {
      const g = new Grid(36, 12);
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 36; x++) {
          const d = Math.hypot((x + 0.5 - 18) / 18, (y + 0.5 - 6) / 6);
          if (d <= 1 && d > 0.86) g.set(x, y, CRIM, Math.round(200 * (1 - Math.abs(d - 0.93) / 0.08)));
          else if (d <= 0.78 && d > 0.62) g.set(x, y, d > 0.7 ? GOLD_HI : GOLD, Math.round(230 * (1 - Math.abs(d - 0.7) / 0.09)));
        }
      return g;
    },
  },
  /** 쿵 섬광 41×41 (몸 뒤 — 부드러운 금빛 속 + 금·진홍 빛살 16갈래) */
  chDuoFlash: {
    w: 41,
    h: 41,
    frames: 1,
    build: () => {
      const g = new Grid(41, 41);
      g.ellipse(20.5, 20.5, 11, 11, GOLD, 60);
      g.ellipse(20.5, 20.5, 6, 6, 0xfffbe0, 110);
      for (let r = 0; r < 16; r++) {
        const a = (r * Math.PI) / 8;
        const len = r % 2 ? 14 : 20;
        for (let d = 4; d <= len; d++)
          g.set(Math.round(20 + Math.cos(a) * d), Math.round(20 + Math.sin(a) * d), d < 8 ? 0xffffff : r % 2 ? 0xff6a3a : GOLD_HI, Math.round(250 * (1 - d / (len + 1))));
      }
      return g;
    },
  },
  /** 「결재」 금빛 글자 21×12 (진홍 테두리) */
  chDuoText: {
    w: 21,
    h: 12,
    frames: 1,
    build: () => {
      const g = new Grid(21, 12);
      SIGN_TEXT.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && g.set(x + 1, y + 1, y < 3 ? 0xfffbe0 : y < 6 ? GOLD_HI : GOLD)));
      g.outline(0x6a0e18, false, 255);
      return g;
    },
  },
  /** 명패 왕관 금 잔의 불꽃 5×9 (금빛 속 · 진홍 끝, 네 장 일렁임) */
  chDuoTipFlame: {
    w: 5,
    h: 9,
    frames: 4,
    build: frames(5, 9, 4, (g, f) => {
      flameCols(g, 5, 9, f, 41 + f, { jag: 0.45, hot: 0.55, sway: 1, peak: 1.15, pal: GOLD_FIRE });
      for (let x = 1; x < 4; x++) g.set(x, 8, x === 2 ? 0xfffbe0 : GOLD_HI);
    }),
  },
  /** 명패 왕관 둘레 금빛 번짐 34×20 (밤 — 가운데가 날개 달린 왕관 크기만큼 뚫렸다) */
  chDuoCrownGlow: {
    w: 34,
    h: 20,
    frames: 1,
    build: () => {
      const g = new Grid(34, 20);
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 34; x++) {
          const dx = x + 0.5 - 17;
          const dy = y + 0.5 - 10;
          const out = Math.hypot(dx / 17, dy / 10);
          const hole = Math.max(Math.abs(dx) / 9.5, Math.abs(dy) / 5.5);
          if (out > 1 || hole < 1) continue;
          const k = Math.min(1, (hole - 1) * 3) * Math.min(1, (1 - out) * 2.5);
          g.set(x, y, k > 0.6 ? GOLD_HI : x % 3 === 0 ? 0xff7a4a : GOLD, Math.round(150 * k));
        }
      return g;
    },
  },
  /** 명패를 훑는 빛 4×5 (비스듬한 흰 띠) */
  chPlateGlint: {
    w: 4,
    h: 5,
    frames: 1,
    build: () => {
      const g = new Grid(4, 5);
      for (let y = 0; y < 5; y++) {
        g.set(3 - Math.floor(y * 0.75), y, 0xffffff, 230);
        g.set(2 - Math.floor(y * 0.75), y, GOLD_HI, 150);
      }
      return g;
    },
  },
  // ── 사직서 불씨 ──
  /** 몸 뒤 불꽃 망토 30×40 (네 장 일렁임, 더해 그린다) */
  chMantle: { w: 30, h: 40, frames: 4, build: () => mantleBuild() },
  /** 밤에 빛 층에 한 번 더 그리는 불꽃 망토 (몸 자리가 뚫렸다) */
  chMantleRim: { w: 30, h: 40, frames: 4, build: holed(() => mantleBuild(), 30, 4, 15, 40, 9.5, 27) },
  /** 불꽃 고리 뒤쪽 반 (+ 불 혀 자리)·앞쪽 반, 6장 */
  chFireBack: { w: FR_W, h: FR_UP + FR_RY, frames: 6, build: fireRing("back") },
  chFireFront: { w: FR_W, h: FR_RY + 2, frames: 6, build: fireRing("front") },
  /** 불씨 3×3 (0 흰 노랑 · 1 주황 · 2 빨강 — 오를수록 식는다) */
  chEmber: {
    w: 3,
    h: 3,
    frames: 3,
    build: frames(3, 3, 3, (g, f) => {
      const c = [FIRE_Y, FIRE_O, FIRE_R][f];
      g.set(1, 1, f === 0 ? 0xffffff : c);
      for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) g.set(x, y, c, f === 0 ? 170 : 110);
    }),
  },
  /** 타는 사직서 조각 5×4 (오르며 차례로: 끝이 타는 종이 · 말려 드는 종이 · 시커멓게 탄 조각 · 흩어지는 재) */
  chPaper: {
    w: 5,
    h: 4,
    frames: 4,
    build: frames(5, 4, 4, (g, f) => {
      const art = [
        [".cpp.", "cpppe", "ppkpe", ".pee."],
        ["..cp.", ".cppe", "cpke.", ".ce.."],
        ["..c..", ".cce.", "cre..", ".c..."],
        ["..a..", ".a..a", "a.a..", "...a."],
      ][f];
      rows(g, art, { p: PAPER, k: 0xb8a888, c: CHAR, e: FIRE_O, r: FIRE_R, a: ASH });
    }),
  },
  /** 사직서 탄 끝 큰 불길 10×13 (앞·뒤 — 네 장. 아랫줄이 종이 탄 끝에 한 줄 겹친다) */
  chFlame: {
    w: 10,
    h: 13,
    frames: 4,
    build: frames(10, 13, 4, (g, f) => {
      flameCols(g, 10, 13, f, 21, { jag: 0.65, hot: 0.28, sway: 1.4, rim: true, peak: 1.3 });
      // 밑줄은 종이 폭(가운데 6칸) 전부 탄다
      for (let x = 2; x < 8; x++) g.set(x, 12, FIRE_O);
    }),
  },
  /** 옆모습 불길 6×12 (종이 모서리 두 칸 위) */
  chFlameSide: {
    w: 6,
    h: 12,
    frames: 4,
    build: frames(6, 12, 4, (g, f) => {
      flameCols(g, 6, 12, f, 33, { jag: 0.55, hot: 0.3, sway: -1, rim: true, peak: 1.1 });
      for (let x = 2; x < 4; x++) g.set(x, 11, FIRE_O);
    }),
  },
  /** 불길 둘레 번짐 15×17 (더해 그린다) */
  chFlameGlow: {
    w: 15,
    h: 17,
    frames: 1,
    build: () => {
      const g = new Grid(15, 17);
      g.ellipse(7.5, 9, 7.5, 8.5, 0xc8401a, 40);
      g.ellipse(7.5, 10, 5, 6, 0xff6a20, 64);
      g.ellipse(7.5, 11, 2.5, 3.5, 0xffc060, 90);
      return g;
    },
  },
} as const;

/** 착용 규칙 — 오라 (cosmeticFx COSMETIC_FX에 섞인다) */
export const CHAIR_FX = {
  chair_aura_gold: { kind: "aura", motion: "chGold" },
  chair_aura_ember: { kind: "aura", motion: "chEmber" },
  chair_aura_stamp: { kind: "aura", motion: "chStamp" },
} satisfies Record<string, FxSpec>;

/** 착용 규칙 — 시트 머리에 덧붙는 연출 (cosmeticFx GEAR_EXTRA_FX에 섞인다) */
export const CHAIR_GEAR_FX = {
  chair_crown: { kind: "aura", motion: "chCrown", light: true },
  chair_band: { kind: "aura", motion: "chFlame", light: true },
  chair_duo_crown: { kind: "aura", motion: "chDuoCrown", light: true },
} satisfies Record<string, FxSpec>;

function h01(i: number, salt = 0): number {
  let h = Math.imul((i + 1) * 374761393 + salt * 668265263, 2246822519);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 머리띠 불길이 그림 맨 위보다 솟는 높이 (이름표를 그만큼 올린다 — cosmeticFx labelTop) */
export const CHAIR_FLAME_UP = 9;
/** 황금 사원증 왕관 위 별·다이아 반짝임만큼 이름표를 올린다 (cosmeticFx labelTop) */
export const CHAIR_CROWN_UP = 5;
/** 명패 왕관 금 잔 불꽃이 그림 맨 위보다 솟는 높이 (cosmeticFx labelTop) */
export const CHAIR_DUO_UP = 8;

/** 「+연봉」 주기 · 불길 치솟음 주기 */
const RAISE_MS = 3600;
const FLARE_MS = 3000;

export function chairAura(motion: ChairMotion, f: FxInput, t: number, d: ChairDraw): void {
  if (motion === "chFlame") return bandFlame(f, t, d);
  if (motion === "chCrown") return crownShine(f, t, d);
  if (motion === "chDuoCrown") return duoCrownShine(f, t, d);
  // 화면 밖이면 그리지 않는다 (주간 1위 오라와 같은 규칙)
  if (f.offscreen) return;
  if (motion === "chGold") return goldAura(f, t, d);
  if (motion === "chStamp") return stampAura(f, t, d);
  return emberAura(f, t, d);
}

function goldAura(f: FxInput, t: number, d: ChairDraw): void {
  const calm = f.reduced || !!f.still;
  const bx = f.x;
  const fy = Math.round(f.headY);
  const back = d.depth - 0.3;
  const k = d.night ? 1 : 0.8;
  const W = f.aura?.wide ?? 1;
  const pulse = calm ? 0.85 : 0.78 + 0.22 * Math.sin(t / 600);
  const midY = Math.round(f.headY - f.artTop * 0.5);
  const lifted = f.y - f.headY > 3;
  // ① 몸 뒤 금빛 햇살 (천천히 돈다) · 몸 뒤 빛
  const rs = Math.max(0.85, (f.artTop + 12) / 46);
  const rf = calm ? 0 : Math.floor(t / 240) % 4;
  d.push("chRays", rf, bx, midY - 2, { sx: rs * W, sy: rs, alpha: (0.5 + 0.3 * pulse) * k, layer: "body", add: true, depth: back - 0.03 });
  // 밤: 몸 자리가 뚫린 햇살을 빛 층에 한 번 더 (어둠 속에서도 환하게)
  if (d.night) d.push("chRaysRim", rf, bx, midY - 2, { sx: rs * W, sy: rs, alpha: 0.45 + 0.2 * pulse, layer: "light", depth: 0 });
  const gs = Math.max(0.85, (f.artTop + 8) / 34);
  d.push("chGlow", 0, bx, midY + 2, { sx: (1 + 0.05 * pulse) * W, sy: gs * (1 + 0.05 * pulse), alpha: 0.75 * k * pulse, layer: "body", add: true, depth: back });
  // ② 발밑 빛 + 금 인장 고리 (뒤쪽 반은 몸 뒤, 앞쪽 반은 발 앞 빛 층)
  d.push("chGround", 0, bx, fy, { sx: W, sy: 1 + (W - 1) * 0.5, alpha: k * (0.65 + 0.35 * pulse), layer: lifted ? "body" : "ground", add: true, depth: lifted ? back - 0.04 : 0 });
  const ph = calm ? 0 : Math.floor(t / 85) % 8;
  const ss = (1 + 0.03 * Math.sin(t / 300)) * W;
  d.push("chSealBack", ph, bx, fy, { oy: 1, sx: ss, sy: ss, alpha: 0.95, layer: "body", add: true, depth: back + 0.01 });
  d.push("chSealFront", ph, bx, fy, { oy: 0, sx: ss, sy: ss, alpha: 0.95, layer: "light", depth: 0 });
  // ③ 양옆 빛기둥 (몸 뒤, 번갈아 숨 쉰다)
  for (let i = 0; i < 2; i++) {
    const h = (0.72 + 0.28 * (calm ? 0.5 : (Math.sin(t / 520 + i * 2.6) + 1) / 2)) * (f.artTop + 16);
    d.push("chShaft", 0, bx + (i ? 1 : -1) * 15, fy - 1, { oy: 1, sy: h / 40, alpha: 0.7 * k, layer: "body", add: true, depth: back - 0.02 });
  }
  // ④ 「+연봉」: 3.6초마다 머리 옆에서 글자가 톡 튀어 오르고, 뒤에서 섬광 · 발밑 고리가 퍼진다 (번갈아 왼쪽·오른쪽)
  const ru = calm ? 1 : ((t + (Math.round(bx) % 89) * 17) % RAISE_MS) / RAISE_MS;
  if (ru < 0.42) {
    const v = ru / 0.42;
    const sideX = Math.floor(t / RAISE_MS) % 2 ? 1 : -1;
    const tx = Math.round(bx + sideX * 13);
    const ty = Math.round(f.headY - f.artTop + 3 - v * 9);
    const pop = 1 + 0.35 * Math.max(0, 1 - v / 0.12);
    const al = v < 0.08 ? v / 0.08 : v > 0.7 ? (1 - v) / 0.3 : 1;
    d.push("chBurst", 0, tx, ty, { sx: 0.7 + v * 0.9, sy: 0.7 + v * 0.9, rot: v * 0.5, alpha: (1 - v) * 0.9, layer: "body", add: true, depth: d.depth + 0.45 });
    d.push("chRaise", 0, tx, ty, { sx: pop, sy: pop, alpha: al, layer: "body", depth: d.depth + 0.5 });
    if (d.night) d.push("chRaise", 0, tx, ty, { sx: pop, sy: pop, alpha: al * 0.35, layer: "light", depth: 0 });
    if (v < 0.5) {
      const gr = (1 + v * 1.4) * W;
      d.push("chSealBack", ph, bx, fy, { oy: 1, sx: gr, sy: gr, alpha: (1 - v * 2) * 0.85, layer: "body", add: true, depth: back - 0.01 });
      d.push("chSealFront", ph, bx, fy, { oy: 0, sx: gr, sy: gr, alpha: (1 - v * 2) * 0.85, layer: "light", depth: 0 });
    }
  }
  // ⑤ ₩ 금화 일곱: 몸 둘레 나선으로 빙글 돌며 솟는다
  for (let i = 0; i < 7; i++) {
    const u = calm ? (i + 0.5) / 7 : (t / 2800 + i / 7 + h01(i, 9) * 0.05) % 1;
    const a = i * 0.9 + u * 5.2 + (calm ? 0 : t / 1500);
    const z = Math.sin(a);
    const x = bx + Math.cos(a) * (12 - 3 * u);
    const y = fy - 2 - u * (f.artTop + 14) + z * 2;
    const fr = calm ? i % 4 : Math.floor(t / 85 + i * 1.3) % 4;
    d.push("chCoin", fr, Math.round(x), Math.round(y), d.around(z, { alpha: Math.sin(Math.PI * u) ** 0.5 }, d.night));
  }
  // ⑥ 금박 조각 다섯: 느린 나선으로 팔랑이며 떠오른다
  for (let i = 0; i < 5; i++) {
    const u = (t / 3400 + i / 5 + h01(i, 1) * 0.08) % 1;
    const a = i * 1.26 + u * 2.4 + t / 5200;
    const z = Math.sin(a);
    const x = bx + Math.cos(a) * (8 + 4 * u) + Math.sin(t / 500 + i) * 0.8;
    const y = f.headY - 3 - u * (f.artTop + 8) + z;
    const fr = calm ? i % 4 : Math.floor(t / 150 + i * 1.7) % 4;
    d.push("chLeaf", fr, Math.round(x), Math.round(y), d.around(z, { alpha: Math.sin(u * Math.PI) ** 0.7 }, d.night));
  }
  // ⑦ ↑ 화살표 둘: 양 어깨 앞에서 곧게 솟는다 (번갈아)
  for (let i = 0; i < 2; i++) {
    const u = (t / 2400 + i * 0.5) % 1;
    const x = bx + (i ? 1 : -1) * 9;
    const y = f.headY - f.artTop * 0.35 - u * 14;
    const al = Math.min(1, Math.min(1, u * 4) * (1 - u) * 1.6);
    const tw = !calm && Math.floor(t / 130 + i * 3) % 5 === 0 ? 1 : 0;
    d.push("chArrow", tw, Math.round(x), Math.round(y), { alpha: al, layer: d.night ? "light" : "body", depth: d.depth + 0.2 });
  }
  // ⑧ 반짝 별 넷: 몸 둘레 여기저기서 반짝 켜졌다 꺼진다
  if (!calm)
    for (let i = 0; i < 4; i++) {
      const per = 900 + i * 170;
      const n = Math.floor(t / per + i * 0.37);
      const u = (t / per + i * 0.37) % 1;
      const a = h01(n, 20 + i) * Math.PI * 2;
      const r = 11 + h01(n, 30 + i) * 6;
      const tw = Math.sin(Math.PI * u);
      d.push("chStar", tw > 0.75 ? 1 : tw > 0.4 ? 2 : 0, Math.round(bx + Math.cos(a) * r), Math.round(midY - 3 + Math.sin(a) * (f.artTop * 0.5 + 2)), { alpha: tw, layer: "light", depth: 0 });
    }
}

function emberAura(f: FxInput, t: number, d: ChairDraw): void {
  const calm = f.reduced || !!f.still;
  const bx = f.x;
  const fy = Math.round(f.headY);
  const back = d.depth - 0.3;
  const k = d.night ? 1 : 0.8;
  const W = f.aura?.wide ?? 1;
  const lifted = f.y - f.headY > 3;
  // 불꽃 일렁임 + 3초마다 불길이 확 치솟는다
  const flick = calm ? 0.85 : 0.74 + 0.13 * Math.sin(t / 110) + 0.13 * Math.sin(t / 47 + 1.3);
  const fu = calm ? 1 : ((t + (Math.round(bx) % 83) * 19) % FLARE_MS) / FLARE_MS;
  const flare = fu < 0.22 ? Math.sin((Math.PI * fu) / 0.22) : 0;
  const midY = Math.round(f.headY - f.artTop * 0.5);
  // ① 몸 뒤 불꽃 망토 · 주홍빛
  const ms = Math.max(0.8, (f.artTop + 12) / 40);
  const mf = calm ? 0 : Math.floor(t / 105) % 4;
  const mo = { oy: 1, sx: ms * (1 + 0.15 * flare) * W, sy: ms * (1 + 0.45 * flare) };
  d.push("chMantle", mf, bx, fy + 1, { ...mo, alpha: Math.min(1, (0.75 + 0.2 * flick) * k + 0.3 * flare), layer: "body", add: true, depth: back - 0.02 });
  // 밤: 몸 자리가 뚫린 불꽃 망토를 빛 층에 한 번 더
  if (d.night) d.push("chMantleRim", mf, bx, fy + 1, { ...mo, alpha: Math.min(1, 0.4 + 0.15 * flick + 0.4 * flare), layer: "light", depth: 0 });
  const gs = Math.max(0.85, (f.artTop + 8) / 34);
  d.push("chGlow", 1, bx, midY, { sx: (1 + 0.06 * flick) * W, sy: gs * (1 + 0.06 * flick), alpha: k * flick, layer: "body", add: true, depth: back });
  // ② 발밑 빛 + 불꽃 고리
  d.push("chGround", 1, bx, fy, { sx: W, sy: 1 + (W - 1) * 0.5, alpha: k * (0.6 + 0.4 * flick), layer: lifted ? "body" : "ground", add: true, depth: lifted ? back - 0.04 : 0 });
  const rf = calm ? 0 : Math.floor(t / 95) % 6;
  const rsx = (1 + 0.12 * flare) * W;
  d.push("chFireBack", rf, bx, fy, { oy: 1, sx: rsx, sy: 1 + 0.3 * flare, alpha: 0.95, layer: "body", add: true, depth: back + 0.01 });
  d.push("chFireFront", rf, bx, fy, { oy: 0, sx: rsx, alpha: 0.95, layer: "light", depth: 0 });
  // ③ 불씨 회오리 열둘: 발치에서 몸 둘레를 빠르게 돌며 솟고, 오를수록 좁아지고 식는다
  for (let i = 0; i < 12; i++) {
    const u = calm ? (i + 0.5) / 12 : (t / 1900 + i / 12 + h01(i, 2) * 0.1) % 1;
    const a = i * 2.4 + u * 7 + (calm ? 0 : t / 700);
    const z = Math.sin(a);
    const x = bx + Math.cos(a) * (13 - 7 * u) + (calm ? 0 : Math.sin(t / 160 + i * 2) * 0.8);
    const y = fy - 1 - u * (f.artTop + 18) + z * 1.5;
    const fr = u < 0.35 ? 0 : u < 0.7 ? 1 : 2;
    d.push("chEmber", fr, Math.round(x), Math.round(y), d.around(z, { alpha: Math.min(1, (1 - u) * 1.6) }, true));
  }
  // ④ 타는 사직서 조각 넷: 흔들리며 떠올라 말리고 까맣게 타서 재로 흩어진다
  for (let i = 0; i < 4; i++) {
    const u = calm ? (i + 0.3) / 4 : (t / 4200 + i / 4 + h01(i, 5) * 0.1) % 1;
    const a = i * 1.7 + u * 2.2 + (calm ? 0 : t / 6000);
    const z = Math.sin(a);
    const x = bx + Math.cos(a) * (10 + 2 * u) + (calm ? 0 : Math.sin(t / 600 + i) * 1.5);
    const y = fy - 6 - u * (f.artTop + 10);
    const fr = Math.min(3, Math.floor(u * 4.2));
    // 재(마지막 장)는 흐릿하게 흩어진다
    d.push("chPaper", fr, Math.round(x), Math.round(y), d.around(z, { alpha: Math.min(1, Math.sin(u * Math.PI) * 1.6) * (fr === 3 ? 0.5 : 1), flip: i % 2 === 1 }));
  }
  // ⑤ 불길 치솟음: 불씨 여섯이 사방으로 튄다
  if (flare > 0)
    for (let i = 0; i < 6; i++) {
      const v = fu / 0.22;
      const a = (i / 6) * Math.PI * 2 + h01(Math.floor(t / FLARE_MS), i) * 0.8;
      const x = bx + Math.cos(a) * (10 + v * 12);
      const y = midY + Math.sin(a) * (f.artTop * 0.45 + 2 + v * 8) - v * 6;
      d.push("chEmber", v < 0.5 ? 0 : 1, Math.round(x), Math.round(y), { sx: 1.3, sy: 1.3, alpha: 1 - v * 0.7, layer: "light", depth: 0 });
    }
}

/**
 * 몸 모양별 머리 윗면(faceAnchor top) → [머리 반지름(반올림), 모자를 한 줄 위에 그리는지]. avatarCore metrics와 같은 값:
 * 키다리 21 · 이불 18 · 기본(두건·고양이·토끼) 17 · 동글이 14 (동글이는 모자를 한 줄 위에 그린다)
 */
const HEAD_OF_TOP: Readonly<Record<number, readonly [number, number]>> = { 21: [4, 0], 18: [6, 0], 17: [5, 0], 14: [7, 1] };

/** 황금 사원증 왕관: 2초마다 보석 띠를 훑는 빛 + 꼭대기 다이아 반짝 + 왕관을 도는 작은 별 셋 + 밤 금빛 번짐 */
function crownShine(f: FxInput, t: number, d: ChairDraw): void {
  if (f.hidden) return;
  const calm = f.reduced || !!f.still;
  const k = f.scale ?? 1;
  const ft = f.face?.top ?? 17;
  const [rx, up] = HEAD_OF_TOP[ft] ?? [5, 0];
  const n = crownRows(ft);
  const side = f.dir === DIR.left || f.dir === DIR.right;
  const mir = f.dir === DIR.left ? -1 : 1;
  // 왕관 맨 윗줄 위 끝 (앉으면 그림 맨 위를 따라 내려간다)
  const top = Math.max(f.headY - (ft + up + n) * k, f.headY - f.artTop + k);
  const rowY = (j: number) => top + (j + 0.5) * k;
  const gemY = Math.round(rowY(n - 2));
  const diaY = Math.round(rowY(n === 9 ? 0.5 : 0));
  const span = side || rx < 4.5 ? 3.5 : 4.5;
  const xs = [-span, -2.5, 0, 2.5, span];
  const fd = d.depth + 0.25;
  if (d.night) d.push("chCrownGlow", 0, f.x, Math.round(rowY(n / 2)), { sx: (side || rx < 4.5 ? 0.85 : 1) * k, sy: (n / 9) * k, alpha: 0.8, layer: "light", depth: 0 });
  if (calm) {
    d.push("chStar", 0, f.x, diaY, { sx: k, sy: k, alpha: 0.9, layer: "light", depth: 0 });
    return;
  }
  // 보석 띠를 훑는 빛 (2초마다 0.36초 — 보는 방향 쪽으로)
  const u = ((t + (Math.round(f.x) % 53) * 23) % 2000) / 2000;
  if (u < 0.36) {
    const i = Math.min(4, Math.floor((u / 0.36) * 5));
    d.push("chStar", i === 2 ? 1 : 2, Math.round(f.x + xs[i] * mir * k), gemY, { sx: k, sy: k, alpha: 1, layer: "light", depth: 0 });
  }
  // 꼭대기 다이아 반짝 (훑고 나서 한 번 크게)
  if (u > 0.42 && u < 0.62) {
    const v = (u - 0.42) / 0.2;
    d.push("chStar", v < 0.3 || v > 0.75 ? 2 : 1, f.x, diaY, { sx: k * 1.15, sy: k * 1.15, alpha: 1, layer: "light", depth: 0 });
  } else d.push("chStar", 0, f.x, diaY, { sx: k, sy: k, alpha: 0.35 + 0.25 * Math.sin(t / 260), layer: "light", depth: 0 });
  // 왕관을 도는 작은 별 셋 (뒤로 돌면 왕관 뒤에 숨는다)
  for (let i = 0; i < 3; i++) {
    const a = t / 1100 + (i * Math.PI * 2) / 3;
    const z = Math.sin(a);
    // 앞을 지날 때 왕관 가운데에서는 사라진다 (얼굴·보석을 가리지 않게)
    const tw = (0.55 + 0.45 * Math.sin(t / 170 + i * 2.1)) * (z < 0 ? 1 : Math.min(1, Math.abs(Math.cos(a)) * 2.2));
    if (tw < 0.05) continue;
    const x = Math.round(f.x + Math.cos(a) * (span + 4) * k);
    const y = Math.round(rowY(n - 3) + z * 2 * k);
    d.push("chStar", tw > 0.85 ? 2 : 0, x, y, z < 0 ? { sx: k, sy: k, alpha: tw * 0.7, layer: "body", add: true, depth: d.depth - 0.05 } : { sx: k, sy: k, alpha: tw, layer: "light", depth: fd });
  }
}

/** 결재 도장 금빛 소나기: 큰 도장이 쿵 찍히는 주기 · 그 안에서 찍히는 때(0~1) · 불씨 수 */
const SLAM_MS = 4200;
const SLAM_HIT = 0.16;
const DUO_SPARKS = 6;

/**
 * 결재 도장 금빛 소나기 (2관왕 — 게임에서 가장 화려한 오라. 몸은 덮지 않는다: 몸과 겹치는 것은 모두 몸 뒤, 몸 바깥 빛만 빛 층):
 *  ① 몸 뒤 금·진홍 빛 · 햇살 · 빛기둥 (밤엔 햇살 테와 머리 위 빛기둥을 빛 층에 한 번 더) ② 발밑 빛 + 결재 인장 (도는 두 띠 · 금·불 혀)
 *  ③ 금빛 빗줄기 ④ 금·진홍 불씨가 나선으로 솟는다 ⑤ 결재 서류 셋이 허리춤을 돈다
 *  ⑥ 4.2초마다 큰 금 도장이 옆(번갈아)에 쿵 → 몸 뒤 섬광 · 인장 충격파 · 찍힌 자리 물결 · 불꽃 넷 · 「결재」 금빛 글자
 * 그림 수: 밤·쿵 순간에도 31장 안팎 (왕관 7장과 합쳐 상한 40 안)
 */
function stampAura(f: FxInput, t: number, d: ChairDraw): void {
  const calm = f.reduced || !!f.still;
  const bx = f.x;
  const fy = Math.round(f.headY);
  const back = d.depth - 0.3;
  const k = d.night ? 1 : 0.85;
  const W = f.aura?.wide ?? 1;
  const WY = 1 + (W - 1) * 0.5;
  const midY = Math.round(f.headY - f.artTop * 0.5);
  const lifted = f.y - f.headY > 3;
  const floor = lifted ? "body" : "ground";
  const floorDepth = lifted ? back - 0.04 : 0;
  const breathe = calm ? 0.85 : 0.8 + 0.2 * Math.sin(t / 650);
  // 쿵 시각 (사람마다 어긋나게)
  const off = (Math.round(bx) % 97) * 13;
  const su = calm ? 1 : ((t + off) % SLAM_MS) / SLAM_MS;
  const round = Math.floor((t + off) / SLAM_MS);
  const sideX = round % 2 ? 1 : -1;
  const hv = su >= SLAM_HIT ? (su - SLAM_HIT) / (1 - SLAM_HIT) : -1;
  const flash = !calm && hv >= 0 && hv < 0.1 ? 1 - hv / 0.1 : 0;

  // ① 몸 뒤 빛 · 햇살 · 빛기둥 (쿵 하면 확 밝아진다)
  const gs = Math.max(0.9, (f.artTop + 8) / 34);
  d.push("chDuoGlow", 0, bx, midY + 2, { sx: W * (1 + 0.15 * flash), sy: gs * (1 + 0.1 * flash), alpha: Math.min(1, 0.85 * k * breathe + 0.4 * flash), layer: "body", add: true, depth: back });
  const rs = Math.max(0.9, (f.artTop + 14) / 46) * (1 + 0.18 * flash);
  const rf = calm ? 0 : Math.floor(t / 220) % 4;
  d.push("chDuoRays", rf, bx, midY - 2, { sx: rs * W, sy: rs, alpha: Math.min(1, (0.5 + 0.3 * breathe) * k + 0.4 * flash), layer: "body", add: true, depth: back - 0.03 });
  if (d.night) d.push("chDuoRaysRim", rf, bx, midY - 2, { sx: rs * W, sy: rs, alpha: Math.min(1, 0.45 + 0.2 * breathe + 0.35 * flash), layer: "light", depth: 0 });
  const pillar = calm ? 1 : 0.85 + 0.15 * Math.sin(t / 480);
  d.push("chDuoPillar", 0, bx, fy + 1, { oy: 1, sx: W, sy: (pillar * (f.artTop + 34)) / 64, alpha: Math.min(1, (d.night ? 0.85 : 0.6) + 0.3 * flash), layer: "body", add: true, depth: back - 0.04 });
  // 밤: 이름표 위부터 하늘로 빛기둥 (빛 층 — 몸·이름표와 겹치지 않게 그 위에서 시작)
  if (d.night) d.push("chDuoPillar", 0, bx, Math.round(f.headY - f.artTop - 15), { oy: 1, sx: W * 0.85, sy: pillar * 0.9, alpha: Math.min(1, 0.55 + 0.3 * flash), layer: "light", depth: 0 });

  // ② 발밑 빛 + 결재 인장 (뒤쪽 반은 몸 뒤, 앞쪽 반은 발 앞 빛 층)
  // 낮: 밝은 바닥에 더해 그리면 분홍빛으로 바래서 인장은 제 색(금·진홍)으로 칠한다. 밤: 더해 그려 어둠 속에 빛난다
  d.push("chDuoGround", 0, bx, fy, { sx: W, sy: WY, alpha: Math.min(1, (d.night ? 0.7 + 0.3 * breathe : 0.45 + 0.15 * breathe) + 0.3 * flash), layer: floor, add: true, depth: floorDepth });
  const sp = calm ? 0 : Math.floor(t / 90) % 8;
  const ss = (calm ? 1 : 1 + 0.025 * Math.sin(t / 320)) * (1 + 0.06 * flash);
  const sealO = { sx: ss * W, sy: ss * WY };
  d.push("chDuoSealBack", sp, bx, fy, { ...sealO, oy: 1, alpha: d.night ? 0.95 : 0.9, layer: "body", add: d.night || undefined, depth: back + 0.01 });
  d.push("chDuoSealFront", sp, bx, fy, d.night ? { ...sealO, oy: 0, alpha: 0.95, layer: "light", depth: 0 } : { ...sealO, oy: 0, alpha: 0.9, layer: floor, depth: floorDepth + 0.001 });

  // ③ 금빛 빗줄기 (몸 뒤)
  const rr = Math.max(0.9, (f.artTop + 18) / 50);
  d.push("chDuoRain", calm ? 3 : Math.floor(t / 65) % 8, bx, fy + 2, { oy: 1, sx: rr * W, sy: rr, alpha: 0.9 * k, layer: "body", add: true, depth: back - 0.02 });

  // ④ 금·진홍 불씨: 몸 둘레 나선으로 솟는다 (짝수 = 금빛이 식으며 금으로, 홀수 = 불씨가 주황 → 진홍)
  const nSpark = calm ? 4 : DUO_SPARKS;
  for (let i = 0; i < nSpark; i++) {
    const u = calm ? (i + 0.5) / nSpark : (t / 2300 + i / nSpark + h01(i, 101) * 0.06) % 1;
    const a = i * 2.1 + u * 5.6 + (calm ? 0 : t / 1400);
    const z = Math.sin(a);
    const x = bx + Math.cos(a) * (14 - 5 * u) * W + (calm ? 0 : Math.sin(t / 170 + i * 2) * 0.7);
    const y = fy - 2 - u * (f.artTop + 20) + z * 2;
    const fr = (i % 2 ? 3 : 0) + Math.min(2, Math.floor(u * 3));
    d.push("chDuoSpark", fr, Math.round(x), Math.round(y), d.around(z, { sx: 1.2, sy: 1.2, alpha: Math.min(1, Math.sin(Math.PI * u) * 1.5) }, true));
  }

  // ⑤ 결재 서류 셋: 허리춤을 천천히 돌며 팔랑인다 (몸 앞 가운데를 지날 땐 비켜 사라진다)
  for (let i = 0; i < 3; i++) {
    const a = (calm ? 0.5 : t / 2100) + (i * Math.PI * 2) / 3;
    const c = Math.cos(a);
    const z = Math.sin(a);
    const vis = z < 0 ? 1 : Math.min(1, Math.max(0, (Math.abs(c) - 0.62) / 0.2));
    if (vis < 0.05) continue;
    const x = bx + c * 15 * W;
    const y = midY + 2 + z * 3 + (calm ? 0 : Math.sin(t / 380 + i * 2) * 1.5);
    const fr = calm ? 0 : Math.floor(t / 150 + i * 3) % 4;
    d.push("chDuoDoc", fr, Math.round(x), Math.round(y), { ...d.around(z, { alpha: vis }), rot: calm ? 0 : Math.sin(t / 300 + i) * 0.25 });
  }

  // ⑥ 큰 결재 도장 쿵 (번갈아 왼쪽·오른쪽 — 인장 위에 찍힌다)
  const sx0 = Math.round(bx + sideX * 19 * W);
  if (calm) {
    // 멈춘 그림(미리보기·움직임 줄이기): 찍힌 금빛 결재 자국 + 몸 뒤 은은한 섬광 (가장 화려한 한 장면)
    d.push("chDuoImprint", 1, sx0, fy + 1, { sx: 1.1, sy: 0.6, alpha: 0.85, layer: floor, depth: floorDepth + 0.002 });
    d.push("chDuoFlash", 0, bx, midY, { sx: 1.3 * W, sy: 1.3, alpha: 0.5, layer: "body", add: true, depth: back - 0.05 });
    return;
  }
  if (su < SLAM_HIT + 0.08) {
    // 내려온다 (점점 빨리) → 닿으면 납작하게 눌렸다가 → 들어 올리며 사라진다
    const down = Math.min(1, su / SLAM_HIT);
    const lift = Math.max(0, (su - SLAM_HIT) / 0.08);
    const y = fy + 1 - (1 - down * down) * (f.artTop + 16) - lift * 6;
    const squash = su >= SLAM_HIT && lift < 0.4 ? 0.8 : 1;
    const al = Math.min(1, down * 3) * (1 - lift);
    const o = { oy: 1, sx: 2 - squash, sy: squash };
    d.push("chDuoStamp", 0, sx0, Math.round(y), { ...o, alpha: al, layer: "body", depth: d.depth + 0.1 });
    if (d.night) d.push("chDuoStamp", 0, sx0, Math.round(y), { ...o, alpha: 0.35 * al, layer: "light", depth: 0 });
  }
  if (hv >= 0) {
    // 금빛 결재 자국 (처음엔 크게 찍히고 서서히 사라진다)
    const pop = 1 + 0.3 * Math.max(0, 1 - hv / 0.08);
    d.push("chDuoImprint", 1, sx0, fy + 1, { sx: 1.1 * pop, sy: 0.6 * pop, alpha: (1 - hv) * 0.95, layer: floor, depth: floorDepth + 0.002 });
    if (hv < 0.5) {
      const v = hv / 0.5;
      // 충격파: 결재 인장이 크게 퍼진다 · 찍힌 자리 물결
      const gr = 1 + v * 0.8;
      d.push("chDuoSealBack", sp, bx, fy, { oy: 1, sx: gr * W, sy: gr * WY, alpha: (1 - v) * 0.8, layer: "body", add: true, depth: back - 0.005 });
      d.push("chDuoSealFront", sp, bx, fy, { oy: 0, sx: gr * W, sy: gr * WY, alpha: (1 - v) * 0.8, layer: "light", depth: 0 });
      d.push("chDuoRipple", 0, sx0, fy + 1, { sx: 0.5 + v * 1.1, sy: 0.5 + v * 1.1, alpha: (1 - v) * 0.9, layer: floor, add: true, depth: floorDepth + 0.003 });
    }
    // 섬광: 몸 뒤 빛살이 터지고 찍힌 자리가 번쩍
    if (hv < 0.14) {
      const v = hv / 0.14;
      d.push("chDuoFlash", 0, bx, midY, { sx: (1 + v * 1.2) * W, sy: 1 + v * 1.2, rot: v * 0.4, alpha: (1 - v) * 0.95, layer: "body", add: true, depth: back - 0.05 });
      d.push("chBurst", 0, sx0, fy - 3, { sx: 0.8 + v, sy: 0.6 + v * 0.8, alpha: 1 - v, layer: "light", depth: 0 });
    }
    // 금·진홍 불꽃 넷이 바깥 위로 튄다 (몸 쪽으로는 튀지 않는다)
    if (hv < 0.32) {
      const v = hv / 0.32;
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * (0.1 + 0.42 * (i / 3)) + (h01(round, 110 + i) - 0.5) * 0.25;
        const x = sx0 + sideX * Math.cos(a) * (3 + v * 15);
        const y = fy - 2 - Math.sin(a) * v * 18 + v * v * 8;
        d.push("chDuoSpark", (i % 2 ? 3 : 0) + Math.min(2, Math.floor(v * 3)), Math.round(x), Math.round(y), { sx: 1.4, sy: 1.4, alpha: 1 - v * 0.7, layer: "light", depth: 0 });
      }
    }
    // 「결재」 금빛 글자: 찍힌 자리 위로 톡 튀어 올라 사라진다
    if (hv < 0.55) {
      const v = hv / 0.55;
      const pop2 = 1 + 0.35 * Math.max(0, 1 - v / 0.12);
      const al = v > 0.65 ? (1 - v) / 0.35 : 1;
      const ty = Math.round(fy - f.artTop * 0.6 - 4 - v * 8);
      d.push("chDuoText", 0, sx0, ty, { sx: pop2, sy: pop2, alpha: al, layer: "body", depth: d.depth + 0.5 });
      if (d.night) d.push("chDuoText", 0, sx0, ty, { sx: pop2, sy: pop2, alpha: al * 0.3, layer: "light", depth: 0 });
    }
  } else {
    // 도장이 내려오는 동안: 반짝 별 하나가 빗줄기 사이에서 켜졌다 꺼진다
    const u = su / SLAM_HIT;
    const tw = Math.sin(Math.PI * u);
    d.push("chStar", tw > 0.75 ? 1 : 2, Math.round(bx - sideX * 12 * W), Math.round(midY - f.artTop * 0.3), { alpha: tw * 0.9, layer: "light", depth: 0 });
  }
}

/** 회장실 금장 명패 왕관: 양 끝 금 잔 불꽃 일렁임 + 2.4초마다 명패 위를 훑는 빛 + 꼭대기 다이아 반짝 + 도는 별 둘 + 밤 금빛 번짐 */
function duoCrownShine(f: FxInput, t: number, d: ChairDraw): void {
  if (f.hidden) return;
  const calm = f.reduced || !!f.still;
  const k = f.scale ?? 1;
  const ft = f.face?.top ?? 17;
  const [rx, up] = HEAD_OF_TOP[ft] ?? [5, 0];
  const n = crownRows(ft);
  const side = f.dir === DIR.left || f.dir === DIR.right;
  const back = f.dir === DIR.up;
  const mir = f.dir === DIR.left ? -1 : 1;
  const narrow = side || rx < 4.5;
  // 왕관 맨 윗줄 위 끝 (앉으면 그림 맨 위를 따라 내려간다)
  const top = Math.max(f.headY - (ft + up + n) * k, f.headY - f.artTop + k);
  const rowY = (j: number) => top + (j + 0.5) * k;
  const tipY = Math.round(rowY(0));
  const plateY = Math.round(rowY(n - 1 - duoPlateUp(n)));
  const half = (narrow ? 5 : 6) * k;
  if (d.night) d.push("chDuoCrownGlow", 0, f.x, Math.round(rowY(n / 2)), { sx: (narrow ? 0.85 : 1) * k, sy: (n / 9) * k, alpha: 0.8, layer: "light", depth: 0 });
  // 양 끝 금 잔의 불꽃 (밑 두 줄이 그림의 불꽃에 겹친다 — 밤엔 빛 층에서 환하게)
  const cupY = Math.round(top + 2 * k);
  for (let i = 0; i < 2; i++) {
    const fr = calm ? i * 2 : Math.floor(t / 95 + i * 2 + (Math.round(f.x) % 5)) % 4;
    const o = { oy: 1, sx: k, sy: k * (calm ? 1 : 1 + 0.12 * Math.sin(t / 140 + i * 2)), flip: i === 1 };
    d.push("chDuoTipFlame", fr, f.x + (i ? 1 : -1) * DUO_CUP_DX * k, cupY, d.night ? { ...o, alpha: 0.85, layer: "light", depth: 0 } : { ...o, layer: "body", depth: d.depth + 0.25 });
  }
  if (calm) {
    if (!back) d.push("chStar", 0, f.x, tipY, { sx: k, sy: k, alpha: 0.9, layer: "light", depth: 0 });
    return;
  }
  // 명패를 훑는 빛 (2.4초마다 0.5초 — 보는 방향 쪽으로. 뒷모습은 명패가 없어 건너뛴다)
  const u = ((t + (Math.round(f.x) % 59) * 29) % 2400) / 2400;
  if (!back && u < 0.5) {
    const v = u / 0.5;
    const x = f.x + (-half + v * half * 2) * mir;
    d.push("chPlateGlint", 0, Math.round(x), plateY, { sx: k, sy: k, alpha: Math.sin(Math.PI * v), layer: "light", depth: 0 });
  }
  // 꼭대기 다이아 (훑고 나서 크게)
  if (!back) {
    if (u > 0.52 && u < 0.7) {
      const v = (u - 0.52) / 0.18;
      d.push("chStar", v < 0.3 || v > 0.75 ? 2 : 1, f.x, tipY, { sx: k * 1.2, sy: k * 1.2, alpha: 1, layer: "light", depth: 0 });
    } else d.push("chStar", 0, f.x, tipY, { sx: k, sy: k, alpha: 0.4 + 0.25 * Math.sin(t / 260), layer: "light", depth: 0 });
  }
  // 왕관을 도는 별 둘 (뒤로 돌면 왕관 뒤에 숨고, 앞 가운데에서는 사라진다)
  for (let i = 0; i < 2; i++) {
    const a = t / 1000 + i * Math.PI;
    const z = Math.sin(a);
    const tw = (0.55 + 0.45 * Math.sin(t / 170 + i * 2.1)) * (z < 0 ? 1 : Math.min(1, Math.abs(Math.cos(a)) * 2.2));
    if (tw < 0.05) continue;
    const x = Math.round(f.x + Math.cos(a) * (half + 4 * k));
    const y = Math.round(rowY(n - 3) + z * 2 * k);
    d.push("chStar", tw > 0.85 ? 2 : 0, x, y, z < 0 ? { sx: k, sy: k, alpha: tw * 0.7, layer: "body", add: true, depth: d.depth - 0.05 } : { sx: k, sy: k, alpha: tw, layer: "light", depth: d.depth + 0.25 });
  }
}

/** 불타는 사직서 머리띠: 종이 탄 끝 (chairGear band — 앞·뒤 가운데 6칸, 옆은 머리 앞 끝 2칸) 위에서 큰 불길이 일렁 */
function bandFlame(f: FxInput, t: number, d: ChairDraw): void {
  if (f.hidden) return;
  const calm = f.reduced || !!f.still;
  const k = f.scale ?? 1;
  const ft = f.face?.top ?? 17;
  const [rx, up] = HEAD_OF_TOP[ft] ?? [5, 0];
  const side = f.dir === DIR.left || f.dir === DIR.right;
  // 옆모습 종이 두 칸 (chairGear bandSideX = cx + rx - 3 · cx + rx - 2)의 가운데
  const dx = side ? (rx - 2) * (f.dir === DIR.left ? -1 : 1) : 0;
  // 불꽃 밑줄 = 종이 탄 끝 바로 아래 줄 (서 있을 때 머리 윗면 세 줄 위). 앉으면 그림 맨 위(외곽선 한 줄 아래)를 따라 내려간다
  // (한 줄 더 내려 탄 끝 두 줄에 겹친다 — 걸을 때 머리가 한 칸 내려가도 불이 종이에서 뜨지 않게)
  const y = Math.round(Math.max(f.headY - (ft + BAND_PAPER_UP + up - 1) * k, f.headY - f.artTop + 2 * k));
  const x = f.x + dx * k;
  const fr = calm ? 0 : Math.floor(t / 90 + (Math.round(f.x) % 7)) % 4;
  const art = side ? "chFlameSide" : "chFlame";
  const fl = { ox: 0.5, oy: 1, sx: k, sy: k * (calm ? 1 : 1 + 0.08 * Math.sin(t / 130)), flip: f.dir === DIR.left };
  d.push(art, fr, x, y, { ...fl, layer: "body", depth: d.depth + 0.25 });
  // 불빛 번짐 (밤에는 불길도 빛 층에 한 번 더 — 어둠 속에서 환하게)
  d.push("chFlameGlow", 0, x, y + 2 * k, { oy: 1, sx: k, sy: k, layer: "light", depth: 0, alpha: d.night ? 0.75 : 0.35 });
  if (d.night) d.push(art, fr, x, y, { ...fl, layer: "light", depth: 0, alpha: 0.55 });
  if (calm) return;
  // 불티 셋: 불길 위로 흔들리며 오르다 꺼진다 (엇갈려서)
  for (let i = 0; i < 3; i++) {
    const per = 700 + i * 160;
    const ph = ((t + i * 260) % per) / per;
    const n = Math.floor((t + i * 260) / per);
    const ex = x + (h01(n, 7 + i) - 0.5) * 8 * k + Math.sin(t / 90 + i) * 0.8;
    d.push("chEmber", ph < 0.4 ? 0 : 1, Math.round(ex), Math.round(y - 9 * k - ph * 9 * k), { alpha: 1 - ph, layer: d.night ? "light" : "body", depth: d.depth + 0.26 });
  }
}

// ── 아이콘 16×16 (가방·상점) ──

/** 둥근 빛 (가운데 진하고 가장자리로 사라진다) 위에, 외곽선을 두른 그림을 얹는다 */
function iconOn(c0: Color, c1: Color, art: Grid, line: Color): Grid {
  const g = new Grid(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8.5) / 7.5;
      if (r <= 1) g.set(x, y, mix(c1, c0, r), Math.round(235 * (1 - r) ** 0.8));
    }
  art.outline(line, false, 220);
  for (let i = 0; i < art.px.length; i++) if (art.px[i] & 255) g.px[i] = art.px[i];
  return g;
}

/** 금빛 위에 큰 ↑ 화살표 + ₩ 금화 셋 */
function goldIcon(): Grid {
  const a = new Grid(16, 16);
  rows(a, [
    "",
    "",
    "",
    ".......hh",
    "......hggl",
    ".....hggggl",
    "....hgggggll",
    ".......gl",
    ".......gl",
    ".......gl",
    ".......gl",
    ".......gl",
    ".......ll",
  ], { h: 0xffffff, g: GOLD, l: GOLD_LO });
  for (const [x, y] of [[1, 3], [11, 8], [1, 10]] as const) rows(a, [".hg.", "hwgl", "gwwl", ".ml."], { h: GOLD_HI, g: GOLD, m: GOLD_MID, l: GOLD_LO, w: 0xfffbe0 }, x, y);
  const g = iconOn(0xe8a020, 0xfff2b0, a, 0x6a4a10);
  for (const [x, y] of [[13, 2], [3, 1], [14, 13]] as const) g.set(x, y, 0xffffff);
  return g;
}

/** 주홍빛 위에 타는 사직서 조각 + 불씨 */
function emberIcon(): Grid {
  const a = new Grid(16, 16);
  rows(a, [
    "",
    "",
    "",
    "",
    ".......cce",
    "......cppPe",
    ".....cppkpPe",
    "....epppkkpP",
    ".....ppkkppP",
    "......pppPP",
    ".......ppP",
  ], { p: 0xf4ead0, P: 0xd8c8a8, c: CHAR, e: FIRE_O, k: 0x9a8a70 });
  const g = iconOn(0xc83a1a, 0xffb050, a, 0x3a1a10);
  // 불씨는 외곽선 없이 밝게
  for (const [x, y, c] of [[3, 3, FIRE_Y], [12, 2, FIRE_O], [13, 6, FIRE_Y], [2, 9, FIRE_R], [12, 12, FIRE_O], [7, 1, FIRE_Y], [4, 12, FIRE_O]] as const) g.set(x, y, c);
  return g;
}

/** 금빛 → 진홍 둥근 빛 위에 금·진홍 결재 인장(뒤 테두리에 불 혀) + 그 위로 쿵 찍히는 금 도장 + 반짝·불씨 (2관왕 — 가방에서도 가장 튀게) */
function stampIcon(): Grid {
  const a = new Grid(16, 16);
  // 결재 인장 (발밑 타원: 금 테 눈금 · 진홍 띠 · 흰 금 가운데)
  for (let y = 8; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot((x + 0.5 - 8) / 7.6, (y + 0.5 - 12.5) / 3.1);
      if (d > 1.04) continue;
      if (d > 0.74) a.set(x, y, x % 3 === 0 ? GOLD_HI : d > 0.9 ? GOLD : GOLD_MID);
      else if (d > 0.46) a.set(x, y, x % 4 === 1 ? GOLD_HI : CRIM_D);
      else a.set(x, y, 0xfff0b0);
    }
  // 인장 뒤 테두리 불 혀
  for (const [x, y, c] of [[2, 8, FIRE_Y], [2, 9, FIRE_O], [1, 9, FIRE_R], [3, 8, FIRE_O], [3, 7, FIRE_R], [13, 8, FIRE_Y], [13, 9, FIRE_O], [14, 9, FIRE_R], [12, 8, FIRE_O], [12, 7, FIRE_R]] as const) a.set(x, y, c);
  // 큰 금 도장 (루비 꼭지 · 진홍 띠 · 붉은 인주 면) — 인장 가운데로 쿵
  rows(a, ["..hg..", ".hRRg.", "..hg..", "..hg..", ".hggl.", "hggggl", "crRRrc", "hggggl", "mggggl", "dIIIId"], { h: GOLD_HI, g: GOLD, m: GOLD_MID, l: GOLD_LO, R: 0xf0384e, r: CRIM_D, c: 0x8a1020, I: INK_R, d: INK_D }, 5, 2);
  const g = iconOn(CRIM_D, 0xfff0b0, a, 0x3a1008);
  // 불씨 · 반짝 (외곽선 없이 밝게)
  for (const [x, y, c] of [[2, 9, FIRE_Y], [13, 9, FIRE_Y], [8, 0, 0xffffff], [2, 2, 0xffffff], [13, 1, GOLD_HI], [1, 5, FIRE_O], [14, 4, FIRE_Y], [12, 3, 0xffffff]] as const) g.set(x, y, c);
  return g;
}

export function chairIcon(id: string): Grid | null {
  if (id === "chair_aura_gold") return goldIcon();
  if (id === "chair_aura_ember") return emberIcon();
  if (id === "chair_aura_stamp") return stampIcon();
  return null;
}
