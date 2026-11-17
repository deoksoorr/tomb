import type { FxArtId, FxCmd, FxInput, FxSpec } from "./cosmeticFx";
import { DIR } from "@tomb/protocol";
import { Grid } from "./pixel";
import { xmasGearIcon } from "./xmasGear";

// 12월 크리스마스 이벤트 한정 꾸미기 중 "아바타 시트 밖에 따로 그리는 것" (썰매 방울 걸음 · 눈송이 오라 · 꼬마 루돌프)
// + 시트 그림에 덧붙는 빛 (눈꽃 왕관 결정 반짝 · 지팡이 사탕 별빛).
// 그림(XMAS_FX_ART)은 cosmeticFx FX_ART에, 규칙(XMAS_FX·XMAS_GEAR_FX)은 COSMETIC_FX·GEAR_EXTRA_FX에 섞여 들어간다.
// 움직임 중 새로 만든 것(xSnow·xCrown·xCane)은 xmasAura가 그리고, cosmeticFx가 그리기 도우미(push·around)를 넘겨준다
// (이 파일은 cosmeticFx를 타입으로만 읽는다 — 서로 불러 초기화 순서가 꼬이지 않게).

const RED = 0xd42c3c;
const RED_LO = 0x9a1c2c;
const FUR = 0xfbf8f2;
const GOLD = 0xf2c84a;
const GOLD_HI = 0xfff2b0;
const GOLD_LO = 0xb88a22;
const ICE = 0x8fdcff;
const ICE_HI = 0xe8faff;

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

/** 문자 그림 → 그리드 ('.' 투명) */
function rows(g: Grid, art: readonly string[], pal: Record<string, number>, ox = 0, oy = 0): void {
  art.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && pal[ch] !== undefined && g.set(ox + x, oy + y, pal[ch])));
}

/** 꼬마 루돌프 몸 (13×12, 오른쪽을 본다). 다리만 프레임마다 다르다 */
const DEER_BODY = [
  "........a.a..",
  ".......aa.aa.",
  "........a.a..",
  ".......ehhh..",
  "........hhkm.",
  "t.uuuuuuhhmmN",
  ".bbbbbbbbsss.",
  ".bbbbbbbbsGs.",
  ".BBcccccBBB..",
];
const DEER_LEGS = [
  [".l.l....l.l..", ".l.l....l.l..", ".d.d....d.d.."],
  ["..l.l..l.l...", "..l.l..l.l...", "..d.d..d.d..."],
];
const DEER_PAL = {
  a: 0xe0b878,
  e: 0x8a5430,
  h: 0xb07440,
  k: 0x2a1a14,
  m: 0xf2dcb8,
  N: 0xff3a44,
  t: 0xf2dcb8,
  u: 0xc88a52,
  b: 0xa86a3c,
  B: 0x7e4a28,
  c: 0xf2dcb8,
  s: RED,
  G: GOLD,
  l: 0x8a5430,
  d: 0x4a3020,
};

export const XMAS_FX_ART = {
  /** 썰매 방울 걸음: 빨간 리본 단 금방울 (두 모양) + 포슬한 눈뭉치 */
  xmBell: {
    w: 5,
    h: 6,
    frames: 3,
    build: frames(5, 6, 3, (g, f) => {
      if (f === 2) {
        rows(g, ["..w..", ".wiw.", "wiWiw", ".wiw.", "..w.."], { w: 0xeaf6ff, i: 0xc8e8ff, W: 0xffffff }, 0, 1);
        return;
      }
      rows(g, [".r.r.", "..y..", ".yYy.", "yyyyy", "LLLLL", "..k.."], { r: RED, y: GOLD, Y: GOLD_HI, L: GOLD_LO, k: 0x5a3a10 });
      if (f === 1) g.set(1, 2, GOLD_HI);
      g.outline(0x5a3010, false, 150);
    }),
  },
  /** 눈송이 오라: 커다란 얼음 결정 (여덟 갈래 + 잔가지 / 작은 별 결정) */
  xmFlake: {
    w: 9,
    h: 9,
    frames: 2,
    build: frames(9, 9, 2, (g, f) => {
      const pal = { w: 0xf4fbff, b: ICE, i: 0xc8ecff, h: ICE_HI, W: 0xffffff };
      if (f === 0)
        rows(g, ["....w....", "..b.w.b..", "...bwb...", ".b.ihi.b.", "wwwhWhwww", ".b.ihi.b.", "...bwb...", "..b.w.b..", "....w...."], pal);
      else rows(g, [".........", "....w....", "..b.i.b..", "...ihi...", ".wihWhiw.", "...ihi...", "..b.i.b..", "....w....", "........."], pal);
      g.outline(0x4a7ab8, false, 110);
    }),
  },
  /** 눈송이 오라 발밑: 얼음빛 서리 고리 (반투명) */
  xmFrost: {
    w: 26,
    h: 8,
    frames: 1,
    build: () => {
      const g = new Grid(26, 8);
      g.ellipse(13, 4, 13, 4, 0x8fdcff, 45);
      g.ellipse(13, 4, 10, 2.8, 0xd8f4ff, 55);
      for (const [x, y] of [[4, 4], [9, 2], [17, 6], [21, 3], [13, 1]]) g.set(x, y, 0xffffff, 200);
      return g;
    },
  },
  /** 왕관 결정·지팡이 별 반짝 (+ 모양 빛, 얼음빛 / 금빛) */
  xmGlint: {
    w: 7,
    h: 7,
    frames: 2,
    build: frames(7, 7, 2, (g, f) => {
      const c = f ? 0xffe9a0 : 0xd8f4ff;
      g.set(3, 3, 0xffffff);
      for (const [x, y] of [[3, 2], [3, 4], [2, 3], [4, 3]]) g.set(x, y, c, 240);
      for (const [x, y] of [[3, 1], [3, 5], [1, 3], [5, 3]]) g.set(x, y, c, 150);
      for (const [x, y] of [[3, 0], [3, 6], [0, 3], [6, 3]]) g.set(x, y, c, 70);
    }),
  },
  /** 지팡이 별·루돌프 코 둘레 번짐 (0 = 따뜻한 금빛, 1 = 빨간 코) */
  xmHalo: {
    w: 11,
    h: 11,
    frames: 2,
    build: frames(11, 11, 2, (g, f) => {
      const [o, i] = f ? [0xff3a44, 0xff9a90] : [0xffc84a, 0xfff0b0];
      g.ellipse(5.5, 5.5, 5.5, 5.5, o, 45);
      g.ellipse(5.5, 5.5, 3.2, 3.2, i, 90);
      g.ellipse(5.5, 5.5, 1.4, 1.4, 0xffffff, 120);
    }),
  },
  /** 루돌프 코 번짐 (작은 빨간 빛) */
  xmNose: {
    w: 7,
    h: 7,
    frames: 1,
    build: () => {
      const g = new Grid(7, 7);
      g.ellipse(3.5, 3.5, 3.5, 3.5, 0xff3a44, 55);
      g.ellipse(3.5, 3.5, 1.8, 1.8, 0xff9a90, 110);
      return g;
    },
  },
  /** 꼬마 루돌프 (펫): 갈색 순록 · 금빛 뿔 · 빨간 코 · 빨간 목도리에 금방울 */
  xmDeer: {
    w: 13,
    h: 12,
    frames: 2,
    build: frames(13, 12, 2, (g, f) => {
      rows(g, DEER_BODY, DEER_PAL);
      rows(g, DEER_LEGS[f], DEER_PAL, 0, 9);
      // 걸을 때 고개가 살짝 끄덕 (뒷프레임은 귀가 한 칸 아래)
      if (f === 1) g.set(7, 4, DEER_PAL.e);
      g.outline(0x3a2414, false, 220);
      // 코·방울·눈빛은 외곽선 위에서도 밝게
      g.set(12, 5, 0xff3a44);
      g.set(12, 4, 0xffb0a8, 200);
      g.set(10, 7, GOLD_HI);
    }),
  },
} as const;

export type XmasFxArtId = keyof typeof XMAS_FX_ART;

/** 루돌프 코 자리 (펫 그림 아래 가운데 기준, 오른쪽을 볼 때 dx · 위로 up) */
export const XMAS_DEER_NOSE: readonly [number, number] = [6, 6.5];

/** 아이템 → 연출 규칙 (cosmeticFx COSMETIC_FX에 섞인다) */
export const XMAS_FX = {
  xm_bells: { kind: "trail", art: "xmBell", step: 9, life: 1700, motion: "pop" },
  xm_snow: { kind: "aura", motion: "xSnow", light: true },
  xm_deer: { kind: "pet", art: "xmDeer", hover: 0, fps: 8, idleFps: 2, glow: true, glowArt: "xmNose", glowAt: XMAS_DEER_NOSE },
} satisfies Record<string, FxSpec>;

/** 시트 그림(xmasGear)에 덧붙는 빛 (cosmeticFx GEAR_EXTRA_FX에 섞인다) */
export const XMAS_GEAR_FX = {
  xm_crown: { kind: "aura", motion: "xCrown", light: true },
  xm_cane: { kind: "aura", motion: "xCane", light: true },
} satisfies Record<string, FxSpec>;

export type XmasMotion = "xSnow" | "xCrown" | "xCane";

/** cosmeticFx가 넘겨주는 그리기 도우미: push = 명령 하나 넣기, around = 몸 둘레 앞뒤 처리 (z = -1 뒤 … 1 앞) */
export type XmasDraw = {
  push: (art: FxArtId, frame: number, x: number, y: number, o?: Partial<FxCmd>) => void;
  around: (z: number, o: Partial<FxCmd>, light?: boolean) => Partial<FxCmd>;
  /** 밤인지 (밤엔 눈 결정도 빛처럼 더해 그려 어둠에 묻히지 않게) */
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

/** 새 움직임 그리기. t = 시각(움직임 줄이기·미리보기면 0) */
export function xmasAura(motion: XmasMotion, f: FxInput, t: number, d: XmasDraw): void {
  const calm = f.reduced || !!f.still;
  const bx = f.x;
  switch (motion) {
    case "xSnow": {
      // 발밑 서리 고리 (숨 쉬듯) + 커다란 눈 결정 다섯이 기울어진 고리를 따라 천천히 돌며 제자리에서 빙그르르
      // + 작은 눈송이가 머리 위에서 내리고, 앞쪽 결정에 가끔 반짝
      const breathe = calm ? 0.8 : 0.7 + 0.3 * Math.sin(t / 1100);
      d.push("xmFrost", 0, Math.round(bx), Math.round(f.headY + 1), { alpha: 0.75 * breathe, layer: "ground", depth: 0 });
      const n = 5;
      for (let i = 0; i < n; i++) {
        const a = (calm ? 0.4 : t / 2600) + (i * Math.PI * 2) / n;
        const z = Math.sin(a);
        const x = bx + Math.cos(a) * 12;
        const y = f.headY - f.artTop * 0.55 + z * 3 + (calm ? 0 : Math.sin(t / 700 + i * 1.3) * 1.5);
        const sc = 0.5 + 0.2 * (z * 0.5 + 0.5);
        // 몸 앞을 지날 때는 얼굴을 가리지 않게 옅게
        const front = z > 0 ? 0.3 + 0.7 * Math.min(1, Math.abs(Math.cos(a)) * 2.4) : 1;
        d.push("xmFlake", i % 2, Math.round(x), Math.round(y), d.around(z, { rot: calm ? i * 0.4 : t / 1800 + i, sx: sc, sy: sc, alpha: 0.95 * front }, d.night));
        // 앞쪽으로 올 때 반짝
        const tw = calm ? 0 : Math.max(0, Math.sin(t / 380 + i * 2.2) - 0.55) / 0.45;
        if (z > 0.2 && tw > 0.05) d.push("xmGlint", 0, Math.round(x + 2), Math.round(y - 2), { sx: 0.6 + 0.5 * tw, sy: 0.6 + 0.5 * tw, alpha: tw, layer: "light", depth: 0 });
      }
      const m = 5;
      const fallH = f.artTop + 12;
      for (let i = 0; i < m; i++) {
        const ph = calm ? (i + 0.5) / m : (t / 3000 + i / m + h01(i, 3) * 0.2) % 1;
        const ang = h01(i, 4) * Math.PI * 2 + (calm ? 0 : t / 5000);
        const z = Math.sin(ang);
        const x = bx + Math.cos(ang) * (6 + h01(i, 5) * 6) + (calm ? 0 : Math.sin(t / 500 + i) * 1);
        const y = f.headY - f.artTop - 8 + ph * fallH + z * 2;
        const al = ph < 0.12 ? ph / 0.12 : ph > 0.85 ? (1 - ph) / 0.15 : 1;
        d.push("snowflake", i % 2, Math.round(x), Math.round(y), d.around(z, { alpha: al * 0.9 }, d.night));
      }
      break;
    }
    case "xCrown": {
      // 눈꽃 왕관: 2.2초에 한 번 꼭대기 결정이 반짝 (빛살이 커졌다 작아진다)
      if (f.hidden || calm) return;
      const cyc = 2200;
      const u = (t % cyc) / 650;
      if (u >= 1) return;
      const tw = Math.sin(u * Math.PI);
      const sideX = f.dir === DIR.right ? 0.5 : -0.5;
      d.push("xmGlint", 0, Math.round(bx + sideX), Math.round(f.headY - f.artTop + 2), { sx: 0.6 + 0.7 * tw, sy: 0.6 + 0.7 * tw, alpha: tw, layer: "light", depth: 0 });
      break;
    }
    case "xCane": {
      // 지팡이 사탕 별: 따뜻한 금빛 번짐이 숨 쉬듯 + 가끔 반짝 (뒷모습은 손이 가려 없음)
      if (f.hidden || f.dir === DIR.up) return;
      const sx = Math.round(f.x + f.hand.dx + Math.sign(f.hand.dx || 1));
      const sy = Math.round(f.headY - f.hand.up - 8);
      const pulse = calm ? 0.8 : 0.65 + 0.35 * Math.sin(t / 520);
      d.push("xmHalo", 0, sx, sy, { alpha: (d.night ? 0.95 : 0.45) * pulse, sx: 0.8, sy: 0.8, layer: "light", depth: 0 });
      const tw = calm ? 0 : Math.max(0, Math.sin(t / 300) - 0.7) / 0.3;
      if (tw > 0.05) d.push("xmGlint", 1, sx, sy, { sx: 0.6 + 0.6 * tw, sy: 0.6 + 0.6 * tw, alpha: tw, layer: "light", depth: 0 });
      break;
    }
  }
}

function blit(dst: Grid, art: XmasFxArtId, frame: number, x: number, y: number, flip = false): void {
  const a = XMAS_FX_ART[art];
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

/** 크리스마스 선물상자 아이콘 (16×16): 빨간 상자 + 금 리본 십자 + 위에 금 리본 매듭 + 흰 눈 한 줌 */
function boxIcon(): Grid {
  const g = new Grid(16, 16);
  rows(
    g,
    [
      "....yy....yy....",
      "...yYyy..yyYy...",
      "....yyyYYyyy....",
      "......yLLy......",
      ".wwwwwwyYwwwwww.",
      ".hrrrrryYrrrrrl.",
      "..hrrrryYrrrrl..",
      "..hrrrryYrrrrl..",
      "..yyyyyyYyyyyy..",
      "..hrrrryYrrrrl..",
      "..hrrrryYrrrrl..",
      "..hrrrryYrrrrl..",
      "..lllllyLllllll.",
    ],
    { y: GOLD, Y: GOLD_HI, L: GOLD_LO, w: FUR, h: 0xf0505a, r: RED, l: RED_LO },
    0,
    2,
  );
  g.outline(0x2a0a10, false, 190);
  g.set(5, 8, 0xffffff);
  return g;
}

/** 크리스마스 꾸미기·선물상자 아이콘 16×16 (시트 그림 + 따로 그리는 연출). 해당 없으면 null */
export function xmasIconGrid(id: string): Grid | null {
  const sheet = xmasGearIcon(id);
  if (sheet) return sheet;
  const g = new Grid(16, 16);
  switch (id) {
    case "xm_box":
      return boxIcon();
    case "xm_bells":
      blit(g, "xmBell", 0, 1, 9);
      blit(g, "xmBell", 1, 9, 5);
      blit(g, "xmBell", 2, 6, 0);
      blit(g, "xmBell", 2, 11, 11);
      return g;
    case "xm_snow":
      blit(g, "xmFlake", 0, 0, 1);
      blit(g, "xmFlake", 1, 7, 7);
      for (const [x, y] of [[12, 1], [2, 12]] as const) {
        g.set(x, y, 0xffffff);
        g.set(x - 1, y, ICE, 200);
        g.set(x + 1, y, ICE, 200);
      }
      return g;
    case "xm_deer":
      blit(g, "xmDeer", 0, 1, 3);
      return g;
    default:
      return null;
  }
}
