import { OUT } from "@/game/chairman/chairmanPixels";
import { Grid, hash2, mix, rng, type Color } from "@/game/sprites/pixel";

// 11/20 회장님 독대 등장 컷 「안경을 집어던지고 빨간 눈」 (도착 이름 카드의 하얀 바탕을 갈음):
// 안경 쓴 회장님 상반신(숨쉬기 · 안경 번뜩) → 콧등 안경 잡기 → 확 벗어 던짐(안경이 빙글 날아감) → 빨간 눈 포효(집중선 · 흔들림 · 이름판 쾅).
// 상반신 네 장·안경·종이·별빛은 한 번만 굽고, 매 프레임은 작은 캔버스(짧은 변 약 180칸)에 바탕 픽셀 + drawImage. CSS로 화면을 덮게 키운다.

export type SplashMode = "normal" | "hell";

/** 시각 (ms, 등장 컷 시작부터) */
export const GLINT_AT = 380;
export const GRAB_AT = 720;
export const THROW_AT = 1000;
export const ROAR_AT = 1200;
export const SPLASH_MS = 2500;
/** 안경이 화면에 부딪히는 때 (포효 바로 앞) */
const IMPACT = ROAR_AT - 30;

const BW = 168;
const BH = 168;
const CX = 84;
/** 얼굴 가운데 (상반신 칸) */
const FACE_Y = 60;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ───────── 모양 틀 ─────────

class Mask {
  readonly m: Uint8Array;
  constructor(
    readonly w = BW,
    readonly h = BH,
  ) {
    this.m = new Uint8Array(w * h);
  }
  has(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && this.m[y * this.w + x] === 1;
  }
  put(x: number, y: number, v: number): void {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.m[y * this.w + x] = v;
  }
  ell(cx: number, cy: number, rx: number, ry: number, v = 1): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, v);
      }
    return this;
  }
  poly(p: number[], v = 1): this {
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 1; i < p.length; i += 2) {
      y0 = Math.min(y0, p[i]);
      y1 = Math.max(y1, p[i]);
    }
    const n = p.length / 2;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const py = y + 0.5;
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = p[i * 2];
        const ay = p[i * 2 + 1];
        const bx = p[((i + 1) % n) * 2];
        const by = p[((i + 1) % n) * 2 + 1];
        if (ay <= py !== by <= py) xs.push(ax + ((py - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.put(x, y, v);
    }
    return this;
  }
  /** 둥근 막대 (선분까지 거리 ≤ r) */
  cap(x0: number, y0: number, x1: number, y1: number, r: number, v = 1): this {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y0, y1) - r); y <= Math.ceil(Math.max(y0, y1) + r); y++)
      for (let x = Math.floor(Math.min(x0, x1) - r); x <= Math.ceil(Math.max(x0, x1) + r); x++) {
        const t = clamp(((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / L, 0, 1);
        const ex = x + 0.5 - (x0 + dx * t);
        const ey = y + 0.5 - (y0 + dy * t);
        if (ex * ex + ey * ey <= r * r) this.put(x, y, v);
      }
    return this;
  }
  keep(fn: (x: number, y: number) => boolean): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.m[y * this.w + x] && !fn(x, y)) this.m[y * this.w + x] = 0;
    return this;
  }
}

type Ramp = readonly Color[];
type ShadeOpt = {
  /** 빛 방향 (화면 쪽이 +z) */
  key?: [number, number, number];
  /** 오른쪽 뒤에서 드는 테두리 빛 */
  rim?: Color;
  rimW?: number;
  /** 단계 더하기 (누빔·체크 무늬) */
  mod?: (x: number, y: number) => number;
  /** 세로 둥글기 (0 = 원기둥) */
  round?: number;
  base?: number;
};

const KEY: [number, number, number] = [-0.55, -0.42, 0.72];

/** 틀을 원기둥·공처럼 보고 단계 명암 + 디더 + 테두리 빛으로 칠한다 */
function shade(g: Grid, m: Mask, ramp: Ramp, o: ShadeOpt = {}): void {
  const { w, h } = m;
  const rl = new Int16Array(h).fill(-1);
  const rr = new Int16Array(h).fill(-1);
  const ct = new Int16Array(w).fill(-1);
  const cb = new Int16Array(w).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m.m[y * w + x]) continue;
      if (rl[y] < 0) rl[y] = x;
      rr[y] = x;
      if (ct[x] < 0) ct[x] = y;
      cb[x] = y;
    }
  const [kx, ky, kz] = o.key ?? KEY;
  const kl = Math.hypot(kx, ky, kz);
  const rnd = o.round ?? 0.7;
  const rimW = o.rimW ?? 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m.m[y * w + x]) continue;
      const nx = rr[y] > rl[y] ? ((x - rl[y]) / (rr[y] - rl[y])) * 2 - 1 : 0;
      const ny = cb[x] > ct[x] ? (((y - ct[x]) / (cb[x] - ct[x])) * 2 - 1) * rnd : 0;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx * 0.9 - ny * ny));
      const lam = (nx * kx + ny * ky + nz * kz) / (Math.hypot(nx, ny, nz) * kl);
      const v = (o.base ?? 0.12) + 0.88 * Math.max(0, lam);
      let i = Math.floor(v * ramp.length + (bay(x, y) - 0.5) * 0.55) + (o.mod?.(x, y) ?? 0);
      i = clamp(i, 0, ramp.length - 1);
      let c = ramp[i];
      if (o.rim && x > rr[y] - rimW && ny < 0.55) c = mix(c, o.rim, 0.8);
      g.set(x, y, c);
    }
}

/** 따로 그린 조각에 테를 두르고 얹는다 */
function piece(dst: Grid, fn: (g: Grid) => void, outline: Color = OUT): void {
  const g = new Grid(dst.w, dst.h);
  fn(g);
  g.outline(outline);
  dst.draw(g, 0, 0);
}

function seg(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, wd = 1): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let k = 0; k < wd; k++) g.set(x + k, y, c);
  }
}

function bitmap(g: Grid, rows: readonly string[], x: number, y: number, c: Color): void {
  rows.forEach((r, j) => {
    for (let i = 0; i < r.length; i++) if (r[i] === "#") g.set(x + i, y + j, c);
  });
}

// ───────── 색 ─────────

const SKIN: Ramp = [0x4a2228, 0x86453f, 0xbb6f58, 0xdf9978, 0xf4c39e, 0xfde0c4];
const HAIR: Ramp = [0x3e3650, 0x6a6482, 0x9894b0, 0xc6c4d8, 0xeceaf4, 0xffffff];
const VEST: Ramp = [0x10141f, 0x1d2435, 0x2b3550, 0x3d4a6a, 0x56678c, 0x7488ac];
const SHIRT: Ramp = [0x2a3654, 0x445a82, 0x6680ac, 0x8ea8cc, 0xb6cce4, 0xdae6f4];
const TUMB: Ramp = [0x183a30, 0x2a5a4a, 0x3e7a64, 0x5a9a7e, 0x82c0a2, 0xb4e2cc];
const BAND: Ramp = [0x5a0a10, 0x8a1418, 0xb82020, 0xdc3a2c, 0xff6a48];
const PAPER: Ramp = [0x8a8478, 0xb8b2a4, 0xdcd6c8, 0xf6f2e8];

const RIM_N = 0xff5a4a;
const RIM_H = 0xffb048;

const PIL = ["#####.#", ".#.#..#", "#####.#", "......#", "#####..", "....#..", "#####..", "#......", "#####.."];
const SEUNG = ["...#...", "..#.#..", ".#...#.", ".......", "#######", ".......", ".#####.", "#.....#", ".#####."];
const ANGER = ["..#.#..", ".##.##.", "##...##", ".......", "##...##", ".##.##.", "..#.#.."];

// ───────── 회장님 상반신 ─────────

/** 0 = 안경 씀 · 1 = 콧등 안경 잡기 · 2 = 던짐 · 3 = 빨간 눈 포효 */
export type Frame = 0 | 1 | 2 | 3;

const TORSO = [CX - 24, 98, CX - 54, 108, CX - 72, 118, CX - 80, 132, CX - 81, 170, CX + 81, 170, CX + 80, 132, CX + 72, 118, CX + 54, 108, CX + 24, 98];

function checkMod(x: number, y: number): number {
  const a = (x + 3) % 9 < 2 ? -1 : 0;
  const b = (y + 1) % 9 < 2 ? -1 : 0;
  const c = (x + 3) % 9 === 5 || (y + 1) % 9 === 5 ? 1 : 0;
  return a + b + c;
}

/** 주먹 (손가락 마디가 화면 쪽, 엄지가 앞을 가로지른다) */
function fist(dst: Grid, cx: number, cy: number, rx: number, ry: number, rim?: Color): void {
  piece(dst, (g) => {
    const m = new Mask().ell(cx, cy, rx, ry).poly([cx - rx, cy, cx + rx, cy, cx + rx * 0.85, cy + ry * 0.95, cx - rx * 0.85, cy + ry * 0.95]);
    shade(g, m, SKIN, { rim, rimW: 2, base: 0.02, key: [-0.6, -0.6, 0.55] });
    const top = Math.round(cy - ry);
    for (let k = 1; k < 4; k++) {
      const fx = Math.round(cx - rx + (rx * 2 * k) / 4);
      seg(g, fx, top + 1, fx, Math.round(cy + ry * 0.55), SKIN[0]);
      seg(g, fx + 1, top + 2, fx + 1, Math.round(cy + ry * 0.4), SKIN[2]);
    }
    for (let k = 0; k < 4; k++) {
      const fc = Math.round(cx - rx + (rx * 2 * (k + 0.5)) / 4);
      g.hline(fc - 2, fc, top + 2, SKIN[5]);
      g.set(fc - 1, top + 3, SKIN[4]);
      g.hline(fc - 2, fc + 1, Math.round(cy + ry * 0.05), SKIN[1]);
    }
  });
  piece(dst, (g) => {
    const m = new Mask().cap(cx - rx * 0.8, cy + ry * 0.5, cx + rx * 0.2, cy + ry * 0.38, Math.max(2.5, ry * 0.3));
    shade(g, m, SKIN, { base: 0.35 });
  });
}

function sleeve(dst: Grid, x0: number, y0: number, x1: number, y1: number, r: number, rim?: Color): void {
  piece(dst, (g) => shade(g, new Mask().cap(x0, y0, x1, y1, r), SHIRT, { mod: checkMod, rim, rimW: 2 }));
}

/** 회장님 상반신 한 장 (168×168) */
function bust(mode: SplashMode, f: Frame): Grid {
  const hell = mode === "hell";
  const rim = hell ? RIM_H : RIM_N;
  const shirt = SHIRT;
  const g = new Grid(BW, BH);

  // 몸: 체크 셔츠 (헬은 싸움 속 모습처럼 조끼·사원증을 벗고 빨간 넥타이)
  piece(g, (p) => shade(p, new Mask().poly(TORSO), shirt, { mod: checkMod, rim, rimW: 2, round: 0.3 }));
  if (!hell) {
    // 패딩 조끼 (가운데 열림 · 누빔)
    piece(g, (p) => {
      const m = new Mask()
        .poly(TORSO)
        .poly([CX - 21, 96, CX + 21, 96, CX + 14, 170, CX - 14, 170], 0)
        .cap(CX - 76, 140, CX - 78, 180, 11, 0)
        .cap(CX + 76, 140, CX + 78, 180, 11, 0);
      shade(p, m, VEST, {
        rim,
        rimW: 2,
        round: 0.3,
        mod: (x, y) => {
          const b = (y + Math.round(((x - CX) / 26) ** 2 * 2)) % 10;
          return b === 0 ? -2 : b <= 2 ? 1 : b >= 8 ? -1 : 0;
        },
      });
      // 지퍼 단
      seg(p, CX - 20, 99, CX - 14, 169, 0x8a96ac);
      seg(p, CX + 20, 99, CX + 14, 169, 0x6a7690);
    });
  } else {
    // 풀어 헤친 넥타이
    piece(g, (p) => {
      const m = new Mask().poly([CX - 4, 104, CX + 4, 104, CX + 7, 150, CX, 158, CX - 6, 148]);
      shade(p, m, BAND, { round: 0.2 });
    });
  }
  // 목
  piece(g, (p) => {
    shade(p, new Mask().poly([CX - 15, 80, CX + 15, 80, CX + 18, 108, CX - 18, 108]), SKIN, { base: 0.02, rim, rimW: 1 });
    for (let x = CX - 15; x <= CX + 15; x++) for (let y = 80; y < 92; y++) if (p.filled(x, y) && bay(x, y) < 0.75) p.set(x, y, SKIN[1]);
  });
  // 셔츠 깃
  for (const sd of [-1, 1])
    piece(g, (p) => {
      const m = new Mask().poly([CX + sd * 23, 96, CX + sd * 2, 112, CX + sd * 9, 124, CX + sd * 28, 106]);
      shade(p, m, shirt, { round: 0.2, base: 0.35, mod: checkMod });
    });
  // 사원증 (노멀)
  if (!hell) {
    seg(g, CX - 13, 100, CX - 4, 132, 0xf07a5a, 2);
    seg(g, CX + 12, 100, CX + 3, 132, 0xb8402e, 2);
    piece(g, (p) => {
      shade(p, new Mask().poly([CX - 10, 132, CX + 11, 132, CX + 11, 158, CX - 10, 158]), PAPER, { round: 0.1, base: 0.45 });
      p.rect(CX - 7, 136, 7, 9, 0x6a9ad0);
      p.ellipse(CX - 3.5, 139, 2, 2, 0xf0cbaa);
      p.rect(CX - 6, 142, 5, 3, 0x2b3550);
      p.hline(CX + 2, CX + 8, 137, 0x8a8478);
      p.hline(CX + 2, CX + 7, 140, 0xb8b2a4);
      p.hline(CX + 2, CX + 8, 143, 0xb8b2a4);
      p.rect(CX - 9, 150, 20, 5, 0x2f63b8);
      p.hline(CX - 9, CX + 10, 150, 0x5a8ae0);
    });
    g.rect(CX - 2, 130, 5, 3, 0x5a5a68);
  }

  // 오른손 (화면 오른쪽): 텀블러 (포효 땐 주먹)
  if (f < 3 && !hell) {
    sleeve(g, CX + 86, 132, CX + 64, 172, 13, rim);
    piece(g, (p) => {
      shade(p, new Mask().poly([CX + 50, 124, CX + 66, 124, CX + 65, 158, CX + 51, 158]), TUMB, { round: 0.15, rim: 0xffffff });
      p.rect(CX + 50, 121, 17, 4, 0xe8e6f0);
      p.hline(CX + 50, CX + 66, 121, 0xffffff);
      p.rect(CX + 53, 118, 8, 3, 0xc8c6d4);
      p.vline(CX + 53, 127, 155, 0xc8f0dc);
    });
    piece(g, (p) => {
      shade(p, new Mask().ell(CX + 62, 146, 9, 8), SKIN, { base: 0.25, rim, rimW: 1 });
      for (let k = 0; k < 3; k++) p.hline(CX + 54, CX + 59, 141 + k * 4, SKIN[1]);
    });
  } else {
    sleeve(g, CX + 90, 168, CX + 64, 148, 13, rim);
    fist(g, CX + 58, 140, 12, 10, rim);
  }

  // 왼손 (화면 왼쪽)
  if (f === 0) sleeve(g, CX - 76, 128, CX - 77, 176, 11);
  if (f === 3) {
    sleeve(g, CX - 96, 180, CX - 58, 144, 15);
    fist(g, CX - 50, 132, 17, 14);
  }

  // 머리 (얼굴 · 턱 · 귀)
  const roar = f === 3;
  piece(g, (p) => {
    const m = new Mask()
      .ell(CX, 58, 30, 33)
      .ell(CX, roar ? 79 : 76, 27, roar ? 21 : 19)
      .ell(CX - 30, 62, 5, 9)
      .ell(CX + 30, 62, 5, 9);
    shade(p, m, SKIN, { rim, rimW: 2, round: 0.75 });
    // 귓속
    seg(p, CX - 31, 58, CX - 30, 66, SKIN[1]);
    seg(p, CX + 30, 58, CX + 31, 66, SKIN[1]);
    // 턱 아래 그늘 (아래에서 올려다본 무게감)
    for (let y = 84; y < 100; y++) for (let x = CX - 26; x <= CX + 26; x++) if (p.filled(x, y) && (y > 93 || bay(x, y) < (y - 84) / 12)) p.set(x, y, mix(p.get(x, y) >>> 8, SKIN[1], 0.55));
  });
  face(g, mode, f);
  hair(g, mode, f);
  // 이마 핏대
  if (roar) {
    piece(g, (p) => bitmap(p, ANGER, hell ? CX + 14 : CX + 11, hell ? 43 : 33, 0xff3a3a), 0x3a0a0e);
  }

  // 왼팔 (얼굴 앞)
  if (f === 1) {
    // 안경 테 옆을 움켜쥔다
    sleeve(g, CX - 76, 128, CX - 58, 136, 11);
    sleeve(g, CX - 58, 136, CX - 37, 80, 8, rim);
    piece(g, (p) => {
      const m = new Mask().ell(CX - 33, 68, 7, 9);
      m.cap(CX - 33, 60, CX - 22, 53, 2).cap(CX - 33, 64, CX - 21, 59, 2).cap(CX - 31, 74, CX - 21, 68, 2.2);
      shade(p, m, SKIN, { rim, base: 0.3 });
      p.hline(CX - 27, CX - 23, 56, SKIN[1]);
      p.hline(CX - 27, CX - 23, 61, SKIN[1]);
    });
  }
  if (f === 2) {
    sleeve(g, CX - 74, 126, CX - 72, 84, 11, rim);
    sleeve(g, CX - 72, 84, CX - 66, 38, 9, rim);
    piece(g, (p) => {
      const m = new Mask().ell(CX - 66, 30, 9, 8);
      for (let k = 0; k < 4; k++) m.cap(CX - 66, 28, CX - 74 + k * 6, 12 - Math.abs(k - 1.5) * 2, 2.2);
      m.cap(CX - 62, 32, CX - 52, 26, 2.4);
      shade(p, m, SKIN, { rim, base: 0.3 });
    });
    // 휘두른 자취
    for (const [r, c] of [
      [96, 0xffffff],
      [102, 0xffd8c8],
      [108, 0xff9a80],
    ] as const)
      for (let a = -2.25; a < -1.15; a += 0.006) {
        if (hash2(Math.round(a * 60), r, 5) < 0.25) continue;
        g.set(Math.round(CX - 74 + Math.cos(a) * r * 0.62), Math.round(128 + Math.sin(a) * r), c);
      }
  }
  return g;
}

function hair(g: Grid, mode: SplashMode, f: Frame): void {
  const hell = mode === "hell";
  const rim = hell ? RIM_H : RIM_N;
  piece(g, (p) => {
    const m = new Mask().ell(CX, 38, 33, 24).keep((x, y) => {
      const dx = (x - CX) / 26;
      if (Math.abs(x - CX) >= 25) return y < 58;
      return y < 31 + dx * dx * 9;
    });
    m.ell(CX - 29, 48, 6, 11).ell(CX + 29, 48, 6, 11);
    // 가르마 왼쪽에서 넘긴 앞머리 · 정수리 머리 뭉치
    m.poly([CX - 27, 28, CX - 2, 27, CX - 11, 35, CX - 17, 39, CX - 25, 36]);
    for (let k = -3; k <= 3; k++) m.ell(CX + k * 9, 17 + k * k * 0.9, 7, 5);
    if (hell || f === 3) {
      // 곤두선 머리 (포효 땐 노멀도 머리가 선다)
      const tall = hell ? 1 : 0.7;
      for (let k = -3; k <= 3; k++) {
        const bx = CX + k * 8.5;
        const by = 18 + k * k * 1.1;
        m.poly([bx - 6, by + 8, bx + 6, by + 8, bx + k * 2.2, by - (15 - Math.abs(k) * 1.5) * tall]);
      }
    }
    shade(p, m, HAIR, {
      rim,
      rimW: 2,
      round: 0.6,
      key: [-0.4, -0.7, 0.6],
      mod: (x, y) => {
        // 뒤로 빗어 넘긴 결 (아래 한 점에서 부채꼴로 퍼지는 줄)
        const a = (Math.atan2(y - 74, x - CX) + Math.PI) * 26;
        const fr = a - Math.floor(a);
        const strand = fr < 0.2 ? -1 : fr > 0.55 && fr < 0.7 && hash2(Math.floor(a), 2, 9) < 0.5 ? 1 : 0;
        // 윤기 띠
        const d = Math.hypot(x - CX + 6, (y - 46) * 1.25);
        const shine = d > 23 && d < 27 && y < 32 && x < CX + 14 ? 2 : 0;
        return strand + shine;
      },
    });
  });
  if (hell) {
    // 필승 머리띠
    piece(g, (p) => {
      const m = new Mask().poly([CX - 33, 30, CX + 33, 30, CX + 33, 41, CX - 33, 41]).keep((x, y) => {
        const dx = (x + 0.5 - CX) / 31.5;
        return dx * dx + ((y - 46) / 40) ** 2 <= 1.02;
      });
      shade(p, m, BAND, { rim: 0xffd080, rimW: 1, round: 0.2 });
      p.rect(CX - 10, 31, 21, 10, 0xfff4dc);
      p.hline(CX - 10, CX + 10, 40, 0xd8c8a8);
      bitmap(p, PIL, CX - 8, 31, 0x1a0a0a);
      bitmap(p, SEUNG, CX + 2, 31, 0x1a0a0a);
    });
    piece(g, (p) => {
      const m = new Mask().poly([CX + 30, 33, CX + 50, 22, CX + 56, 28, CX + 34, 39]).poly([CX + 31, 36, CX + 54, 40, CX + 52, 47, CX + 32, 41]);
      shade(p, m, BAND, { round: 0.2 });
    });
  }
}

function face(g: Grid, mode: SplashMode, f: Frame): void {
  const hell = mode === "hell";
  const glasses = f < 2;
  const roar = f === 3;
  const brow = hell ? 0x8a8494 : 0x9894b0;
  // 눈 언저리 그늘
  for (const sd of [-1, 1]) {
    const ex = CX + sd * 13;
    for (let y = 52; y < 68; y++)
      for (let x = ex - 11; x <= ex + 11; x++) {
        const d = ((x - ex) / 11) ** 2 + ((y - 60) / 7) ** 2;
        if (d < 1 && g.filled(x, y) && bay(x, y) < 1.1 - d) g.set(x, y, mix(g.get(x, y) >>> 8, roar ? SKIN[0] : SKIN[1], roar ? 0.5 : 0.45));
      }
  }
  // 이마 주름
  if (!hell) {
    seg(g, CX - 12, 37, CX + 12, 37, SKIN[2]);
    seg(g, CX - 9, 40, CX + 9, 40, SKIN[2]);
  }
  // 눈썹 (안쪽이 내려간 성난 눈썹)
  const dip = roar ? 3 : glasses ? 1 : 2;
  for (const sd of [-1, 1]) {
    const pts: number[] = [];
    pts.push(CX + sd * 25, 44, CX + sd * 5, 49 + dip, CX + sd * 5, 53 + dip, CX + sd * 24, 48);
    const m = new Mask().poly(pts);
    for (let y = 0; y < BH; y++)
      for (let x = 0; x < BW; x++)
        if (m.has(x, y)) g.set(x, y, m.has(x, y - 1) ? (m.has(x, y + 1) ? brow : 0x4a4458) : 0xe0dfec);
  }
  // 미간 주름
  seg(g, CX - 2, 47, CX - 2, 54, SKIN[1]);
  seg(g, CX + 2, 47, CX + 2, 54, SKIN[1]);
  // 코 (올려다본 콧구멍)
  seg(g, CX + 4, 60, CX + 6, 70, SKIN[2]);
  g.ellipse(CX + 0.5, 70.5, 5.5, 4, SKIN[4]);
  g.hline(CX - 2, CX + 2, 68, SKIN[5]);
  g.rect(CX - 4, 73, 3, 2, SKIN[0]);
  g.rect(CX + 3, 73, 3, 2, SKIN[0]);
  g.hline(CX - 5, CX + 6, 75, SKIN[2]);
  // 팔자 주름
  seg(g, CX - 8, 72, CX - 15, 86, SKIN[1]);
  seg(g, CX + 9, 72, CX + 16, 86, SKIN[1]);
  // 입
  if (roar) {
    const m = new Mask().ell(CX, 89, 14, 10);
    for (let y = 78; y < 100; y++)
      for (let x = CX - 15; x <= CX + 15; x++) {
        if (!m.has(x, y)) continue;
        let c: Color = 0x2a0608;
        if (y < 83) c = (x - CX + 40) % 4 === 0 ? 0xb8ac9c : 0xf4eee0;
        else if (y > 95) c = (x - CX + 40) % 4 === 0 ? 0xb8ac9c : 0xe8e0d0;
        else if (y > 91 && Math.abs(x - CX) < 9) c = 0xb03a40;
        if (!m.has(x, y - 1) || !m.has(x, y + 1) || !m.has(x - 1, y) || !m.has(x + 1, y)) c = 0x3a0a0e;
        g.set(x, y, c);
      }
    g.set(CX - 6, 86, 0xf4eee0);
    g.set(CX + 6, 86, 0xf4eee0);
  } else {
    const h = f === 2 ? 7 : 5;
    for (let y = 82; y < 82 + h; y++)
      for (let x = CX - 11; x <= CX + 11; x++) {
        const edge = y === 82 || y === 81 + h || Math.abs(x - CX) === 11;
        g.set(x, y, edge ? 0x4a1416 : (x - CX + 40) % 4 === 0 || y === 82 + (h >> 1) ? 0xa89c8c : 0xf2ece0);
      }
    g.set(CX - 12, 84, 0x4a1416);
    g.set(CX + 12, 84, 0x4a1416);
    g.set(CX - 13, 85, 0x4a1416);
    g.set(CX + 13, 85, 0x4a1416);
  }
  // 눈
  if (glasses) {
    for (const sd of [-1, 1]) lens(g, CX + sd * 13, 59, true);
    g.hline(CX - 3, CX + 3, 57, 0x4a2a1e);
    g.hline(CX - 3, CX + 3, 58, 0x7a4a30);
    seg(g, CX - 23, 57, CX - 30, 58, 0x4a2a1e, 1);
    seg(g, CX + 23, 57, CX + 30, 58, 0x4a2a1e, 1);
  } else {
    for (const sd of [-1, 1]) {
      const ex = CX + sd * 13;
      for (let y = 54; y < 66; y++)
        for (let x = ex - 8; x <= ex + 8; x++) {
          const dx = x - ex;
          const tilt = dx * sd * 0.28; // 안쪽 끝이 내려간 눈
          const dy = y - 59 - tilt;
          const lim = 3.2 - Math.abs(dx) * 0.33;
          if (Math.abs(dy) > lim) continue;
          let c: Color = roar ? 0xff2a1a : 0xffd4b4;
          if (roar && Math.abs(dx) <= 2 && Math.abs(dy) <= 1.2) c = 0xfff0c0;
          else if (roar && Math.abs(dx) <= 4) c = 0xff7a3a;
          if (!roar && Math.abs(dx) <= 1 && Math.abs(dy) <= 1.2) c = 0xff3a2a;
          g.set(x, y, c);
        }
      // 윗눈꺼풀
      for (let x = ex - 8; x <= ex + 8; x++) {
        const lim = 3.2 - Math.abs(x - ex) * 0.33;
        if (lim < 0) continue;
        g.set(x, Math.round(59 + (x - ex) * sd * 0.28 - lim - 1), 0x240a0e);
      }
    }
  }
}

/** 둥근 갈색 안경알 하나 (glare = 하얗게 번뜩여 눈이 안 보인다) */
function lens(g: Grid, cx: number, cy: number, glare: boolean): void {
  for (let y = cy - 11; y <= cy + 11; y++)
    for (let x = cx - 11; x <= cx + 11; x++) {
      const d = Math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5));
      if (d > 10.4) continue;
      if (d > 8.4) {
        g.set(x, y, y < cy - 2 ? 0x9a6440 : y < cy + 4 ? 0x6a4028 : 0x3e2218);
        continue;
      }
      const s = x - cx + (y - cy);
      let c: Color = y > cy + 3 ? 0xb4cad8 : 0xd8e8f2;
      if (glare && ((s > -8 && s < -3) || s === 1 || s === 2)) c = 0xffffff;
      if (!glare) c = mix(c, 0x6a8aa0, 0.3);
      g.set(x, y, c);
    }
}

/** 날아가는 안경 (56×24) */
function glassesSprite(): HTMLCanvasElement {
  const g = new Grid(60, 26);
  lens(g, 16, 13, true);
  lens(g, 42, 13, true);
  g.hline(26, 32, 11, 0x4a2a1e);
  g.hline(26, 32, 12, 0x7a4a30);
  seg(g, 6, 11, 1, 6, 0x4a2a1e, 2);
  seg(g, 52, 11, 57, 6, 0x4a2a1e, 2);
  g.outline(OUT);
  return g.toCanvas();
}

/** 종이 (사표 봉투 · 서류) 뒤집히는 네 장 */
function paperSprites(): HTMLCanvasElement[][] {
  const out: HTMLCanvasElement[][] = [];
  for (const env of [false, true]) {
    const flat = new Grid(10, 13);
    flat.rect(0, 0, 10, 13, env ? 0xfaf6ec : 0xf2eee2);
    if (env) {
      // 사표 봉투: 붉은 세로 글씨 자국
      // 세로 글씨 「사직서」 자국 세 덩이 + 붉은 도장
      flat.rect(4, 2, 2, 2, 0x1a1418);
      flat.set(6, 3, 0x1a1418);
      flat.rect(4, 5, 3, 1, 0x1a1418);
      flat.set(5, 6, 0x1a1418);
      flat.rect(4, 8, 2, 2, 0x1a1418);
      flat.set(6, 8, 0x1a1418);
      flat.rect(6, 10, 3, 2, 0xd83a2a);
    } else {
      for (let y = 2; y < 12; y += 2) flat.hline(2, y % 4 === 0 ? 6 : 7, y, 0xa8a294);
      flat.rect(7, 0, 3, 3, 0xc8c2b4);
    }
    const frames: HTMLCanvasElement[] = [];
    for (const w of [10, 7, 4, 2, 4, 7]) {
      const g = new Grid(12, 15);
      const back = frames.length > 3;
      for (let y = 0; y < 13; y++)
        for (let x = 0; x < w; x++) {
          const sx = Math.min(9, Math.floor((x * 10) / w));
          const v = flat.get(back ? 9 - sx : sx, y) >>> 8;
          g.set(1 + Math.floor((10 - w) / 2) + x, 1 + y, back || w < 5 ? mix(v, 0x9a9488, 0.35) : v);
        }
      g.outline(0x2a2228);
      frames.push(g.toCanvas());
    }
    out.push(frames);
  }
  return out;
}

/** 번뜩 별빛 (13×13) */
function glintSprite(): HTMLCanvasElement {
  const g = new Grid(13, 13);
  for (let i = 0; i < 13; i++) {
    const d = Math.abs(i - 6);
    g.set(6, i, d < 4 ? 0xffffff : 0xcfe8ff);
    g.set(i, 6, d < 4 ? 0xffffff : 0xcfe8ff);
  }
  g.rect(5, 5, 3, 3, 0xffffff);
  for (const [dx, dy] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ])
    g.set(6 + dx, 6 + dy, 0xeaf4ff);
  return g.toCanvas();
}

/** 눈빛 번짐 (디더 둥근 빛, 더하기 합성용) */
function glowSprite(r: number, hot: Color, mid: Color, cool: Color): HTMLCanvasElement {
  const n = r * 2 + 1;
  const g = new Grid(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - r, y - r) / r;
      if (d > 1) continue;
      const lv = (1 - d) * 3 + (bay(x, y) - 0.5) * 0.9;
      if (lv < 0.4) continue;
      g.set(x, y, lv > 2.2 ? hot : lv > 1.3 ? mid : cool);
    }
  return g.toCanvas();
}

/** 실루엣 (뒤에 크게 드리운 그림자) */
function silhouette(src: Grid, c: Color, edge: Color): HTMLCanvasElement {
  const g = new Grid(src.w, src.h);
  for (let i = 0; i < src.px.length; i++) if (src.px[i] & 255) g.px[i] = Grid.rgba(c);
  // 윤곽만 붉게 (거대한 그림자 머리 모양이 읽히게)
  const e = new Grid(src.w, src.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.filled(x, y) && (!g.filled(x - 1, y) || !g.filled(x + 1, y) || !g.filled(x, y - 1))) e.set(x, y, edge);
  g.draw(e, 0, 0);
  return g.toCanvas();
}

export type SplashArt = {
  frames: HTMLCanvasElement[];
  glasses: HTMLCanvasElement;
  papers: HTMLCanvasElement[][];
  glint: HTMLCanvasElement;
  eye: HTMLCanvasElement;
  eyeBig: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
};

const artCache = new Map<SplashMode, SplashArt>();

/** 그림 한 번 굽기 (모드마다 한 번) */
export function buildSplashArt(mode: SplashMode): SplashArt {
  const hit = artCache.get(mode);
  if (hit) return hit;
  const grids = ([0, 1, 2, 3] as const).map((f) => bust(mode, f));
  const hell = mode === "hell";
  const art: SplashArt = {
    frames: grids.map((x) => x.toCanvas()),
    glasses: glassesSprite(),
    papers: paperSprites(),
    glint: glintSprite(),
    eye: hell ? glowSprite(9, 0xfff0a0, 0xff8a20, 0xa02a08) : glowSprite(8, 0xffe0c0, 0xff3a1a, 0x8a0a0a),
    eyeBig: hell ? glowSprite(24, 0xc8601a, 0x7a2a08, 0x3a1004) : glowSprite(24, 0xb02018, 0x6a0c0c, 0x300608),
    shadow: silhouette(grids[3], hell ? 0x2a0802 : 0x1e0408, hell ? 0xa83a0c : 0x8a1420),
  };
  artCache.set(mode, art);
  return art;
}

// ───────── 장면 ─────────

type Pal = { base: Color; line: Color; line2: Color; glow: Color[] };
const PAL: Record<SplashMode, [Pal, Pal]> = {
  normal: [
    { base: 0x0c0a18, line: 0x1c1830, line2: 0x2a2444, glow: [0x221c3a, 0x342a54, 0x4a3a70] },
    { base: 0x180306, line: 0x4a0810, line2: 0x8a121a, glow: [0x6a0c12, 0xb8221e, 0xff5a32, 0xffc890] },
  ],
  hell: [
    { base: 0x160604, line: 0x2e0c06, line2: 0x48140a, glow: [0x3a1006, 0x5a1a08, 0x7a2a0c] },
    { base: 0x1e0402, line: 0x6a1404, line2: 0xc23a0a, glow: [0x8a1a04, 0xd84a0c, 0xff9a20, 0xfff0a0] },
  ],
};

const le = (c: Color) => ((255 << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

type Fly = { x: number; y: number; vx: number; vy: number; ph: number; sp: number; env: number; front: boolean; at: number };

export type SplashView = {
  /** 그리고, 캔버스에 줄 확대·흔들림(CSS transform)을 돌려준다 */
  draw(ms: number): string;
  /** 얼굴 가운데 (캔버스 비율 0..1, transform-origin용) */
  focus: [number, number];
};

/** 화면 비율에 맞춘 작은 캔버스 (짧은 변 약 180칸 · 정수 배율) */
export function splashSize(vw: number, vh: number): { w: number; h: number } {
  // 세로 화면은 가로 150칸에 맞춘다 (회장님이 꽉 차게 · 폰은 화소가 촘촘해 정수 배율이 아니어도 고르다)
  if (vh > vw) return { w: 150, h: Math.round((150 * vh) / Math.max(1, vw)) };
  const s = Math.max(1, Math.round(vh / 180));
  return { w: Math.ceil(vw / s), h: Math.ceil(vh / s) };
}

export function makeSplashView(cv: HTMLCanvasElement, mode: SplashMode, vw: number, vh: number): SplashView {
  const art = buildSplashArt(mode);
  const { w: W, h: H } = splashSize(vw, vh);
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const portrait = H > W;
  // 상반신 자리: 가로는 오른쪽으로 비켜 이름판 자리를 둔다, 세로는 아래에 붙인다
  const bx = Math.round(portrait ? W / 2 - CX : Math.max(W * 0.63, W - 120) - CX);
  const by = portrait ? H - BH + 4 : H - BH + 10;
  const fx = bx + CX;
  const fy = by + FACE_Y;
  // 바탕 (각도·거리 미리 계산)
  const img = ctx.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);
  const ang = new Float32Array(W * H);
  const rad = new Float32Array(W * H);
  const R = Math.hypot(Math.max(fx, W - fx), Math.max(fy, H - fy));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      ang[y * W + x] = (Math.atan2(y - fy, x - fx) / (Math.PI * 2) + 1) % 1;
      rad[y * W + x] = Math.hypot(x - fx, (y - fy) * 1.08) / R;
    }
  const r0 = rng(mode === "hell" ? 41 : 17);
  const flies: Fly[] = [];
  for (let i = 0; i < 26; i++) {
    const burst = i >= 10;
    // 터지는 종이는 어깨 양옆에서 바깥으로 (얼굴을 가리지 않게)
    const side = i % 2 === 0 ? -1 : 1;
    const a = burst ? (side < 0 ? Math.PI : 0) + side * (-0.2 - r0() * 1.1) : r0() * Math.PI * 2;
    const sp = burst ? 110 + r0() * 150 : 8 + r0() * 14;
    flies.push({
      x: burst ? fx + side * (46 + r0() * 30) : r0() * W,
      y: burst ? fy + 30 + r0() * 50 : r0() * H,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      ph: r0() * 6,
      sp: 6 + r0() * 10,
      env: r0() < 0.4 ? 1 : 0,
      front: burst && r0() < 0.6,
      at: burst ? ROAR_AT - 30 : 0,
    });
  }
  // 안경이 날아가 부딪히는 곳 (화면 왼쪽 위)
  const hx0 = bx + CX - 66;
  const hy0 = by + 26;
  const ix = portrait ? Math.round(W * 0.2) : Math.round(Math.max(28, bx - 6));
  const iy = portrait ? Math.round(H * 0.33) : Math.round(H * 0.2);
  const cracks: { x: number; y: number; d: number }[] = [];
  const rc = rng(7);
  const crackLen = Math.min(W, H) * 0.42;
  const walk = (x: number, y: number, a: number, len: number, d0: number, depth: number) => {
    let l = 0;
    while (l < len) {
      const st = 4 + rc() * 6;
      a += (rc() - 0.5) * 0.7;
      const nx = x + Math.cos(a) * st;
      const ny = y + Math.sin(a) * st;
      const n = Math.ceil(st);
      for (let i = 0; i < n; i++) cracks.push({ x: Math.round(x + ((nx - x) * i) / n), y: Math.round(y + ((ny - y) * i) / n), d: d0 + (l + (st * i) / n) / crackLen });
      x = nx;
      y = ny;
      l += st;
      if (depth < 1 && rc() < 0.18) walk(x, y, a + (rc() < 0.5 ? -0.8 : 0.8), len * 0.4, d0 + l / crackLen, depth + 1);
    }
  };
  for (let k = 0; k < 9; k++) walk(ix, iy, (k / 9) * Math.PI * 2 + rc() * 0.5, crackLen * (0.35 + rc() * 0.65), 0, 0);
  // 가운데 동그란 금
  for (const r of [5, 11]) for (let a = 0; a < Math.PI * 2; a += 0.12) if (rc() < 0.8) cracks.push({ x: Math.round(ix + Math.cos(a) * r), y: Math.round(iy + Math.sin(a) * r * 0.9), d: r / crackLen });
  const shards = Array.from({ length: 22 }, () => {
    const a = rc() * Math.PI * 2;
    const v = 50 + rc() * 170;
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, s: rc() < 0.3 ? 2 : 1, c: rc() < 0.15 ? "#7a4a30" : rc() < 0.5 ? "#ffffff" : "#bfe0f4" };
  });
  const embers = Array.from({ length: mode === "hell" ? 40 : 0 }, () => ({ x: r0() * W, y: r0() * H, s: 20 + r0() * 50, ph: r0() * 9 }));

  const paper = (p: Fly, ms: number) => {
    if (ms < p.at) return;
    const t = (ms - p.at) / 1000;
    const drag = p.at > 0 ? 1 - Math.exp(-t * 1.6) : t;
    const k = p.at > 0 ? drag / 1.6 : t;
    let x = p.x + p.vx * k;
    let y = p.y + p.vy * k + (p.at > 0 ? 40 * t * t : 0);
    if (p.at === 0) {
      x = ((x % (W + 20)) + W + 20) % (W + 20) - 10;
      y = ((y % (H + 20)) + H + 20) % (H + 20) - 10;
    }
    const fr = art.papers[p.env][Math.floor(p.ph + t * p.sp) % 6];
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(Math.round((p.ph + t * 2) * 4) / 4);
    ctx.drawImage(fr, -6, -7);
    ctx.restore();
  };

  const draw = (ms: number): string => {
    const rage = clamp((ms - ROAR_AT) / 140, 0, 1);
    const [c0, c1] = PAL[mode];
    const P = rage < 0.5 ? c0 : c1;
    const spin = ms < ROAR_AT ? ms * 0.00004 : ROAR_AT * 0.00004 + (ms - ROAR_AT) * 0.00022;
    const flick = Math.floor(ms / 70);
    const N = rage > 0.5 ? 56 : 40;
    const glowR = rage > 0.5 ? 0.34 + Math.sin(ms / 90) * 0.01 : 0.26;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const r = rad[i];
        let c = P.base;
        const t = (ang[i] + spin) * N;
        const k = Math.floor(t);
        const fr = t - k;
        const wd = 0.08 + 0.42 * hash2(k % N, rage > 0.5 ? flick % 5 : 0, 3);
        const inner = 0.16 + hash2(k % N, flick % 7, 8) * 0.22;
        if (fr < wd && r > inner) c = r > 0.62 || hash2(k % N, 1, 2) > 0.6 ? P.line2 : P.line;
        // 가운데 빛 (디더 계단)
        const lv = (1 - r / glowR) * P.glow.length + (bay(x, y) - 0.5) * 0.9;
        if (lv > 0) c = P.glow[Math.min(P.glow.length - 1, Math.floor(lv))];
        // 가장자리 어둡게
        if (r > 0.9 && bay(x, y) < (r - 0.9) * 6) c = mix(c, 0x000000, 0.5);
        buf[i] = le(c);
      }
    ctx.putImageData(img, 0, 0);

    // 포효: 뒤로 크게 드리운 그림자 (세로 화면 위쪽 빈자리)
    if (rage > 0 && portrait) {
      ctx.globalAlpha = rage * 0.85;
      const s2 = 2;
      ctx.drawImage(art.shadow, Math.round(fx - CX * s2), Math.round(fy - FACE_Y * s2 - (portrait ? 70 : 34)), BW * s2, BH * s2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "lighter";
      for (const sd of [-1, 1]) ctx.drawImage(art.eyeBig, Math.round(fx + sd * 26 - 24), Math.round(fy - FACE_Y * 2 + 59 * 2 - (portrait ? 70 : 34) - 24));
      ctx.globalCompositeOperation = "source-over";
    }
    // 불티 (헬)
    for (const e of embers) {
      const yy = (((e.y - (ms / 1000) * e.s) % H) + H) % H;
      const xx = e.x + Math.sin(ms / 300 + e.ph) * 4;
      ctx.fillStyle = (Math.floor(ms / 120 + e.ph) & 1) === 0 ? "#ffcf5a" : "#ff6a1a";
      ctx.fillRect(Math.round(xx), Math.round(yy), 1, rage > 0.5 ? 2 : 1);
    }
    for (const p of flies) if (!p.front) paper(p, ms);

    // 회장님
    const f: Frame = ms < GRAB_AT ? 0 : ms < THROW_AT ? 1 : ms < ROAR_AT ? 2 : 3;
    const breath = f === 0 ? Math.round(Math.sin(ms / 170)) : 0;
    const roarShake = f === 3 && ms < ROAR_AT + 450 ? Math.round(Math.sin(ms / 17) * 2) : 0;
    ctx.drawImage(art.frames[f], bx + roarShake, by + breath);

    // 안경 번뜩
    if (f === 0 && ms > GLINT_AT && ms < GLINT_AT + 260) {
      const k = 1 - Math.abs((ms - GLINT_AT) / 130 - 1);
      const s = Math.max(1, Math.round(k * 3)) / 2;
      ctx.drawImage(art.glint, Math.round(bx + CX - 19 - 6.5 * s), Math.round(by + 54 + breath - 6.5 * s), 13 * s, 13 * s);
      if (k > 0.6) ctx.drawImage(art.glint, bx + CX + 6, by + 52 + breath, 7, 7);
    }
    if (f === 1) ctx.drawImage(art.glint, bx + CX + 12 - 6, by + 52 - 6);
    // 빨간 눈빛
    if (f >= 2) {
      ctx.globalCompositeOperation = "lighter";
      const pulse = f === 3 ? 1 + ((Math.floor(ms / 80) & 1) === 0 ? 0.25 : 0) * (mode === "hell" ? 1.4 : 1) : 0.6;
      for (const sd of [-1, 1]) {
        const ex = bx + roarShake + CX + sd * 13;
        const ey = by + 59;
        const s = Math.round(pulse * 4) / 4;
        const e = art.eye;
        ctx.drawImage(e, Math.round(ex - (e.width * s) / 2), Math.round(ey - (e.height * s) / 2), Math.round(e.width * s), Math.round(e.height * s));
        if (f === 3 && mode === "hell") {
          // 헬: 눈에서 뻗는 불꼬리
          for (let j = 1; j < 9; j++) {
            ctx.fillStyle = j < 4 ? "#ffe070" : j < 7 ? "#ff8a20" : "#a02a08";
            ctx.fillRect(ex + sd * (6 + j * 3), ey - 1 - Math.round(j * 0.6 + Math.sin(ms / 60 + j) * 0.8), 3, j < 5 ? 2 : 1);
          }
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // 날아가는 안경: 빙글 돌며 화면 쪽으로 커지다 화면에 부딪혀 쨍그랑
    if (ms >= THROW_AT && ms < IMPACT) {
      const t = (ms - THROW_AT) / (IMPACT - THROW_AT);
      const sx = hx0 + (ix - hx0) * t;
      const sy = hy0 + (iy - hy0) * t - Math.sin(Math.PI * t) * 18;
      const sc = Math.round((1 + 4 * t * t) * 2) / 2;
      ctx.save();
      ctx.translate(Math.round(sx), Math.round(sy));
      ctx.rotate(Math.round(-t * 7 * 4) / 4);
      ctx.drawImage(art.glasses, Math.round(-30 * sc), Math.round(-13 * sc), Math.round(60 * sc), Math.round(26 * sc));
      ctx.restore();
      if ((Math.floor(ms / 50) & 1) === 0) ctx.drawImage(art.glint, Math.round(sx - 6 + 8 * sc), Math.round(sy - 6 - 4 * sc));
    }
    for (const p of flies) if (p.front) paper(p, ms);

    // 화면 금 + 유리 조각
    if (ms >= IMPACT) {
      const t = ms - IMPACT;
      const reach = Math.min(1, t / 120);
      for (const c of cracks) {
        if (c.d > reach) continue;
        ctx.fillStyle = "rgba(10,14,24,0.7)";
        ctx.fillRect(c.x + 1, c.y + 1, 1, 1);
        ctx.fillStyle = c.d < 0.25 ? "#ffffff" : "#d8ecff";
        ctx.fillRect(c.x, c.y, 1, 1);
      }
      for (const sh of shards) {
        const u = t / 1000;
        if (u > 0.9) break;
        ctx.fillStyle = sh.c;
        ctx.fillRect(Math.round(ix + sh.vx * u), Math.round(iy + sh.vy * u + 260 * u * u), sh.s, sh.s);
      }
      if (t < 110) {
        const k = 3 - Math.floor(t / 40);
        ctx.drawImage(art.glint, ix - 6.5 * k, iy - 6.5 * k, 13 * k, 13 * k);
      }
    }

    // 포효 충격파 + 붉은 번쩍
    if (ms >= ROAR_AT && ms < ROAR_AT + 520) {
      const t = (ms - ROAR_AT) / 520;
      const rr = 20 + t * Math.max(W, H) * 0.9;
      ctx.fillStyle = mode === "hell" ? "#ffd070" : "#ffe0d0";
      for (let a = 0; a < 360; a += 1.2) {
        const x = Math.round(fx + Math.cos((a * Math.PI) / 180) * rr);
        const y = Math.round(fy + Math.sin((a * Math.PI) / 180) * rr);
        if (hash2(Math.floor(a / 6), 1, 4) > 0.2) ctx.fillRect(x, y, 2, 2);
      }
      ctx.fillStyle = mode === "hell" ? `rgba(255,140,30,${(1 - t) * 0.45})` : `rgba(255,40,30,${(1 - t) * 0.42})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 확대 · 흔들림
    const punch = ms < 260 ? 1 + 0.32 * (1 - ms / 260) ** 2 : 1;
    const roarPunch = ms >= ROAR_AT && ms < ROAR_AT + 200 ? 1 + 0.07 * (1 - (ms - ROAR_AT) / 200) : 1;
    let sx = 0;
    let sy = 0;
    if (ms >= ROAR_AT && ms < ROAR_AT + 420) {
      const a = 1 - (ms - ROAR_AT) / 420;
      // 11/21 가운데 대사 쾅과 같이 조금 더 세게
      sx = Math.round(Math.sin(ms * 0.11) * 12 * a);
      sy = Math.round(Math.cos(ms * 0.13) * 10 * a);
    }
    return `translate(${sx}px, ${sy}px) scale(${(punch * roarPunch).toFixed(3)})`;
  };
  return { draw, focus: [fx / W, fy / H] };
}

/** 움직임 줄이기용 한 장 (빨간 눈 포효) */
export const SPLASH_STILL = ROAR_AT + 900;

