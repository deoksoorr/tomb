import type * as Phaser from "phaser";
import { BUMPER_GATE, BUMPER_RIM, BUMPER_RINK } from "@tomb/protocol";
import { darken, hash2, lighten, makeCanvas, mix } from "../sprites/pixel";

// 범퍼카장 그림 (11/16, 코드로 그리는 픽셀아트). 브라우저에서만 부른다 — 처음 가까이 갔을 때 한 번 굽는다 (BumperView).
//  - 링크 바닥(반짝이는 철판 + 빨강·노랑 고무 테두리), 조명 기둥, 위·아래 전구 줄, 입구 간판 아치 「유령 범퍼카」, 매표소(무료)
//  - 가운데 기둥(유령 등불)·쌓은 타이어, 부딪힘 별
//  - 범퍼카: 차머리 16방향 × 색 8가지. 바닥 위에 층을 쌓아(고무 테두리 → 차체 → 좌석 → 더듬이) 기울인 위에서 본 모습으로 굽는다.
//    뒤 판(탄 사람 뒤)과 앞 판(탄 사람 다리를 가리는 아랫부분) 두 장

export const BTEX = {
  floor: "bumper-floor",
  bulbs: "bumper-bulbs",
  string: "bumper-string",
  pole: "bumper-pole",
  bulbGlow: "bumper-bulb-glow",
  pillar: "bumper-pillar",
  tyre: "bumper-tyre",
  booth: "bumper-booth",
  arch: "bumper-arch",
  sign: "bumper-sign",
  signGlow: "bumper-sign-glow",
  star: "bumper-star",
  beam: "bumper-beam",
  carBack: (c: number) => `bumper-car-back-${c}`,
  carFront: (c: number) => `bumper-car-front-${c}`,
} as const;

/** 범퍼카 색 (차 번호 순서 = BUMPER_SEATS의 car) */
export const CAR_COLORS: readonly number[] = [0xe8434f, 0xf28c38, 0xf2cf3a, 0x5cc85a, 0x3fc4d8, 0x4a78e0, 0x9a5ae0, 0xf27ab8];
/** 차머리 방향 갈래 */
export const CAR_DIRS = 16;
/** 차 그림 한 칸 (가운데 아래 CAR_CX, CAR_CY = 차 가운데 바닥 = 탄 사람 발) */
export const CAR_W = 30;
export const CAR_H = 36;
export const CAR_CX = 15;
export const CAR_CY = 26;
/** 앞 판: 이 줄(그림 y)부터 아래만 — 탄 사람 다리·허리 아래를 가린다 */
export const CAR_FRONT_ROW = 20;
/** 탄 사람을 바닥에서 올려 앉히는 높이 (px) */
export const CAR_SEAT_LIFT = 1;
/** 위아래 눌림 (기울여 위에서 본 각도) */
const SQ = 0.72;

/** 전구 줄 한 줄에 다는 전구 수 · 줄 처짐 */
export const STRING_BULBS = 13;
/** 조명 기둥 높이 (받침에서 등까지) */
export const POLE_H = 30;
/** 전구 색 (돌아가며) */
export const BULB_COLORS: readonly number[] = [0xff5a7a, 0xffd84a, 0x6ad8ff, 0x8aff7a, 0xd88aff];

const OUT = 0x1a1418;

// ── 픽셀 버퍼 ──
class Buf {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: number, a = 255): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a < 255 && this.data[i + 3] > 0) {
      const t = a / 255;
      this.data[i] = Math.round(this.data[i] * (1 - t) + ((c >> 16) & 255) * t);
      this.data[i + 1] = Math.round(this.data[i + 1] * (1 - t) + ((c >> 8) & 255) * t);
      this.data[i + 2] = Math.round(this.data[i + 2] * (1 - t) + (c & 255) * t);
      return;
    }
    this.data[i] = (c >> 16) & 255;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = a;
  }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }
  has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    return this.data[(y * this.w + x) * 4 + 3] > 0;
  }
  /** 바깥 테두리 (빈 칸 중 그림과 맞닿은 칸) */
  outline(c = OUT): void {
    const mark: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (!this.has(x, y) && (this.has(x - 1, y) || this.has(x + 1, y) || this.has(x, y - 1) || this.has(x, y + 1))) mark.push(x, y);
    for (let i = 0; i < mark.length; i += 2) this.set(mark[i], mark[i + 1], c);
  }
  canvas(): HTMLCanvasElement {
    const { canvas, ctx } = makeCanvas(this.w, this.h);
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

function add(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, frame?: { w: number; h: number; n: number }): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex || !frame) return;
  for (let i = 0; i < frame.n; i++) tex.add(i, 0, i * frame.w, 0, frame.w, frame.h);
}

// ── 링크 바닥 ──

/** 링크 바닥 (링크 바깥 사각형 크기 + 아래 테두리 앞면 3px). 왼쪽 위 = BUMPER_RINK.x, y */
export const FLOOR_FACE = 3;
function floorCanvas(): HTMLCanvasElement {
  const W = BUMPER_RINK.w;
  const H = BUMPER_RINK.h + FLOOR_FACE;
  const b = new Buf(W, H);
  const t = BUMPER_RIM;
  const inH = BUMPER_RINK.h;
  // 철판: 미끄러운 회청색 + 마름모 무늬 + 비스듬한 반짝임 띠
  for (let y = t; y < inH - t; y++)
    for (let x = t; x < W - t; x++) {
      let c = 0x4e5666;
      if ((x + y) % 6 === 0 && (x - y + 600) % 6 === 3) c = 0x6a7484;
      else if ((x + y) % 6 === 1 && (x - y + 600) % 6 === 4) c = 0x3e4452;
      const band = (x + y * 1.4) % 70;
      if (band < 9) c = mix(c, 0xb8c8e0, band < 3 ? 0.22 : 0.12);
      if (hash2(x, y, 31) < 0.012) c = 0x8a96aa;
      b.set(x, y, c);
    }
  // 바닥 가장자리 그늘 (테두리 안쪽)
  for (let s = 0; s < 4; s++) {
    const a = Math.round(90 * (1 - s / 4));
    for (let x = t; x < W - t; x++) b.set(x, t + s, 0x000000, a);
    for (let y = t; y < inH - t; y++) {
      b.set(t + s, y, 0x000000, Math.round(a * 0.6));
      b.set(W - t - 1 - s, y, 0x000000, Math.round(a * 0.6));
    }
  }
  // 고무 테두리: 빨강·노랑 덧댄 쿠션 (12px마다 바꾼다), 윗면 밝게, 안쪽 아랫단 어둡게
  const pad = (x: number, y: number, along: number) => {
    const red = Math.floor(along / 12) % 2 === 0;
    return red ? 0xd8384a : 0xf0c03a;
  };
  for (let y = 0; y < inH; y++)
    for (let x = 0; x < W; x++) {
      const inRim = x < t || y < t || x >= W - t || y >= inH - t;
      if (!inRim) continue;
      const horiz = y < t || y >= inH - t;
      const along = horiz ? x : y;
      let c = pad(x, y, along);
      const depth = horiz ? (y < t ? y : inH - 1 - y) : x < t ? x : W - 1 - x;
      if (depth === 0) c = darken(c, 0.45);
      else if (depth === 1) c = lighten(c, 0.25);
      else if (depth >= t - 2) c = darken(c, 0.28);
      if (along % 12 === 0) c = darken(c, 0.35); // 쿠션 이음매
      b.set(x, y, c);
    }
  // 입구 틈 (위 테두리 가운데): 고무 대신 바닥 + 쇠사슬 막대
  const g0 = BUMPER_GATE.x0 - BUMPER_RINK.x;
  const g1 = BUMPER_GATE.x1 - BUMPER_RINK.x;
  for (let y = 0; y < t; y++) for (let x = g0; x < g1; x++) b.set(x, y, y < 2 ? 0x8a8478 : 0x6c6860);
  for (let x = g0; x < g1; x++) b.set(x, 2, x % 3 === 0 ? 0xd8d0c0 : 0x9a9488);
  // 아래 테두리 앞면 (바깥쪽으로 보이는 옆면)
  for (let y = inH; y < H; y++) for (let x = 0; x < W; x++) b.set(x, y, darken(pad(x, y, x), 0.5 + (y - inH) * 0.1));
  return b.canvas();
}

// ── 전구·조명 기둥·전구 줄 ──

/** 전구 한 알 (3×3, 가운데 밝게) — 색은 tint */
function bulbCanvas(): HTMLCanvasElement {
  const b = new Buf(3, 3);
  b.set(1, 0, 0xffffff);
  b.set(0, 1, 0xffffff);
  b.set(1, 1, 0xffffff);
  b.set(2, 1, 0xffffff);
  b.set(1, 2, 0xd0d0d0);
  return b.canvas();
}
function glowCanvas(size: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
/** 조명 기둥 (가로 7 × 세로 POLE_H + 6). 원점 = 받침 가운데. 꼭대기에 둥근 등 (색은 위에 덧씌우는 전구) */
function poleCanvas(): HTMLCanvasElement {
  const W = 7;
  const H = POLE_H + 6;
  const b = new Buf(W, H);
  for (let y = 5; y < H - 2; y++) {
    const stripe = Math.floor(y / 4) % 2 === 0;
    b.set(3, y, stripe ? 0xf0e8e0 : 0xd8384a);
    b.set(2, y, stripe ? 0xc8c0b8 : 0xa82838);
  }
  b.rect(1, H - 2, 5, 2, 0x4a4650);
  b.rect(2, H - 3, 3, 1, 0x6a6670);
  // 등 갓
  b.rect(1, 1, 5, 4, 0xfff4d0);
  b.rect(2, 0, 3, 1, 0x5a5660);
  b.rect(1, 4, 5, 1, 0x5a5660);
  b.outline();
  return b.canvas();
}
/** 전구 줄 (위·아래 두 줄 공통): 기둥 등 사이에 늘어진 검은 전선. 전구는 BumperView가 따로 단다 */
export function stringSag(i: number, n: number): number {
  const u = i / (n - 1);
  return Math.round(Math.sin(u * Math.PI) * 7);
}
function stringCanvas(): HTMLCanvasElement {
  const W = BUMPER_RINK.w - 4;
  const b = new Buf(W, 10);
  for (let x = 0; x < W; x++) {
    const u = x / (W - 1);
    const y = Math.round(Math.sin(u * Math.PI) * 7) + 1;
    b.set(x, y, 0x2a2630);
  }
  return b.canvas();
}

// ── 가운데 기둥 · 타이어 ──

/** 가운데 기둥 (가로 20 × 세로 46): 둥근 고무 받침 + 줄무늬 기둥 + 꼭대기 유령 등불. 원점 = 받침 가운데 아래 */
export const PILLAR_H = 46;
function pillarCanvas(): HTMLCanvasElement {
  const W = 20;
  const H = PILLAR_H;
  const b = new Buf(W, H);
  const cx = 10;
  // 받침 (타원 고무)
  for (let y = -5; y <= 4; y++)
    for (let x = -9; x <= 9; x++) {
      const e = (x * x) / 81 + (y * y) / 25;
      if (e > 1) continue;
      const c = y < -2 ? 0x5a5662 : e > 0.7 ? 0x2a2830 : 0x3c3a44;
      b.set(cx + x, H - 6 + y, c);
    }
  // 기둥
  for (let y = 8; y < H - 8; y++) {
    const s = Math.floor((y + 2) / 5) % 2 === 0;
    b.rect(cx - 2, y, 4, 1, s ? 0xf0e8e0 : 0x6a52c8);
    b.set(cx + 1, y, s ? 0xc8c0b8 : 0x4a3aa0);
  }
  // 유령 등불 (꼭대기)
  const g = [
    "..####..",
    ".######.",
    "##o##o##",
    "########",
    "########",
    "#.##.##.",
  ];
  g.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === "#") b.set(cx - 4 + i, 1 + j, j < 2 ? 0xf4fff8 : 0xd8f0e8);
      else if (ch === "o") b.set(cx - 4 + i, 1 + j, 0x2a2440);
    }),
  );
  b.outline();
  return b.canvas();
}
/** 쌓은 타이어 세 개 (가로 18 × 세로 18). 원점 = 받침 가운데 아래 */
function tyreCanvas(): HTMLCanvasElement {
  const b = new Buf(18, 18);
  for (let k = 0; k < 3; k++) {
    const cy = 13 - k * 4;
    for (let y = -3; y <= 3; y++)
      for (let x = -8; x <= 8; x++) {
        const e = (x * x) / 64 + (y * y) / 9;
        if (e > 1) continue;
        const hole = (x * x) / 16 + (y * y) / 2.2 < 1;
        if (hole && k === 2) {
          b.set(9 + x, cy + y, 0x14121a);
          continue;
        }
        let c = y > 0 ? 0x2a2830 : 0x3a3842;
        if (Math.abs(e - 0.62) < 0.1) c = k === 1 ? 0xf0c03a : 0xe8e0d8; // 옆면 줄 (가운데만 노랑)
        b.set(9 + x, cy + y, c);
      }
  }
  b.outline();
  return b.canvas();
}

// ── 매표소 ──

/** 매표소 (가로 28 × 세로 34): 분홍·흰 줄무늬 차양, 창 안 유령 직원, 「무료」 팻말. 원점 = 바닥 가운데 */
export const BOOTH_W = 28;
export const BOOTH_H = 38;
/** 매표소 그림 위쪽 팻말 높이 (그 아래로 차양·몸통) */
const BOOTH_SIGN_H = 11;
function boothCanvas(text: ((b: Buf, x: number, y: number) => void) | null): HTMLCanvasElement {
  const b = new Buf(BOOTH_W, BOOTH_H);
  const o = BOOTH_SIGN_H - 7; // 팻말이 커진 만큼 차양·몸통을 아래로
  // 몸통
  b.rect(3, 14 + o, 22, 19, 0x7a4a8a);
  b.rect(3, 14 + o, 22, 1, 0x9a6aaa);
  for (let y = 16 + o; y < 33 + o; y += 4) b.rect(4, y, 20, 1, 0x6a3a7a);
  // 창 (밤에도 따뜻한 빛)
  b.rect(7, 16 + o, 14, 9, 0xffe8b0);
  b.rect(7, 16 + o, 14, 1, 0xfff4d8);
  // 창 안 유령 직원
  const ghost = ["..###..", ".#####.", "#o#o###", "#######", "#######"];
  ghost.forEach((row, j) => [...row].forEach((ch, i) => (ch === "#" ? b.set(10 + i, 19 + o + j, 0xf8fff8) : ch === "o" ? b.set(10 + i, 19 + o + j, 0x302838) : 0)));
  // 계산대
  b.rect(5, 25 + o, 18, 2, 0xc89a60);
  b.rect(5, 25 + o, 18, 1, 0xe0b878);
  // 차양 (줄무늬 + 물결 끝)
  for (let x = 1; x < BOOTH_W - 1; x++)
    for (let y = 7 + o; y < 13 + o; y++) {
      const s = Math.floor((x - 1) / 3) % 2 === 0;
      b.set(x, y, y === 7 + o ? (s ? 0xffa0c8 : 0xffffff) : s ? 0xf0609a : 0xf4ecf0);
    }
  for (let x = 1; x < BOOTH_W - 1; x++) if (x % 3 !== 0) b.set(x, 13 + o, Math.floor((x - 1) / 3) % 2 === 0 ? 0xd04880 : 0xd8d0d8);
  // 지붕 위 「무료」 팻말 (기둥 둘)
  b.rect(4, 0, 20, BOOTH_SIGN_H, 0x1e5a2e);
  b.rect(5, 1, 18, BOOTH_SIGN_H - 2, 0x2f8a46);
  b.rect(8, BOOTH_SIGN_H, 1, 7 + o - BOOTH_SIGN_H, 0x5a4a3a);
  b.rect(19, BOOTH_SIGN_H, 1, 7 + o - BOOTH_SIGN_H, 0x5a4a3a);
  if (text) text(b, 14, 0);
  b.outline();
  return b.canvas();
}

// ── 입구 간판 아치 ──

const SIGN_FONT = `11px "Galmuri11", "Galmuri9", monospace`;
const SMALL_FONT = `9px "Galmuri9", "Galmuri11", monospace`;
export const SIGN_TEXT = "유령 범퍼카";
const FREE_TEXT = "무료";
/** 아치 기둥 사이 (가운데에서 양쪽으로) · 기둥 높이 */
export const ARCH_HALF = 20;
export const ARCH_H = 34;

/** 글씨를 이진화해 찍는 함수 (글꼴이 늦게 오면 null) */
function textStamp(font: string, text: string): { w: number; h: number; on: (x: number, y: number) => boolean } | null {
  if (typeof document === "undefined") return null;
  const probe = makeCanvas(8, 8).ctx;
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text).width);
  const h = 14;
  const { ctx } = makeCanvas(tw + 2, h);
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, 1, 11);
  const img = ctx.getImageData(0, 0, tw + 2, h);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < tw + 2 && y < h && img.data[(y * (tw + 2) + x) * 4 + 3] >= 110;
  return { w: tw + 2, h, on };
}

/** 아치 기둥 둘 (사탕 줄무늬) — 간판판은 sign 텍스처. 원점 = 바닥 가운데 */
function archCanvas(): HTMLCanvasElement {
  const W = ARCH_HALF * 2 + 6;
  const b = new Buf(W, ARCH_H);
  for (const px of [2, W - 4]) {
    for (let y = 4; y < ARCH_H - 1; y++) {
      const s = Math.floor((y + px) / 3) % 2 === 0;
      b.set(px, y, s ? 0xffffff : 0xe8435a);
      b.set(px + 1, y, s ? 0xd8d0d0 : 0xb02840);
    }
    b.rect(px - 1, ARCH_H - 2, 4, 2, 0x4a4650);
    b.rect(px - 1, 2, 4, 2, 0xffd84a);
  }
  b.outline();
  return b.canvas();
}

/** 간판판 (전구 테두리 + 글씨) 과 글씨만 있는 빛 층. 원점 = 아래 가운데 */
function signCanvases(): { sign: HTMLCanvasElement; glow: HTMLCanvasElement; w: number; h: number } {
  const st = textStamp(SIGN_FONT, SIGN_TEXT);
  const tw = st ? st.w : 56;
  const W = tw + 12;
  const H = 19;
  const b = new Buf(W, H);
  const gl = new Buf(W, H);
  // 둥근 판
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const corner = (x < 2 || x > W - 3) && (y < 2 || y > H - 3);
      if (corner) continue;
      b.set(x, y, y < 2 || y > H - 3 || x < 2 || x > W - 3 ? 0x3a1a4a : 0x5a2a72);
    }
  // 테두리 전구 (번갈아 색)
  let k = 0;
  for (let x = 3; x < W - 3; x += 4) {
    const c = BULB_COLORS[k++ % BULB_COLORS.length];
    b.set(x, 0, c);
    b.set(x, H - 1, c);
    gl.set(x, 0, c);
    gl.set(x, H - 1, c);
  }
  for (let y = 4; y < H - 3; y += 4) {
    const c = BULB_COLORS[k++ % BULB_COLORS.length];
    b.set(0, y, c);
    b.set(W - 1, y, c);
    gl.set(0, y, c);
    gl.set(W - 1, y, c);
  }
  if (st) {
    const ox = 6;
    const oy = 3;
    for (let y = 0; y < st.h; y++)
      for (let x = 0; x < st.w; x++) {
        if (st.on(x, y)) continue;
        if (st.on(x - 1, y) || st.on(x + 1, y) || st.on(x, y - 1) || st.on(x, y + 1)) b.set(ox + x, oy + y, 0x1a0a22);
      }
    for (let y = 0; y < st.h; y++)
      for (let x = 0; x < st.w; x++) {
        if (!st.on(x, y)) continue;
        // 위는 하양, 아래로 갈수록 분홍 (네온 느낌)
        const c = mix(0xffffff, 0xff8ad0, y / st.h);
        b.set(ox + x, oy + y, c);
        gl.set(ox + x, oy + y, c);
      }
  }
  return { sign: b.canvas(), glow: gl.canvas(), w: W, h: H };
}

// ── 부딪힘 별 · 헤드라이트 ──

function starCanvas(): HTMLCanvasElement {
  const b = new Buf(7, 7);
  const pts = ["...#...", "...#...", "..###..", "#######", ".#####.", ".##.##.", "#.....#"];
  pts.forEach((row, j) => [...row].forEach((ch, i) => ch === "#" && b.set(i, j, j < 3 ? 0xfff8c0 : 0xffd84a)));
  return b.canvas();
}
/** 헤드라이트 빛 (앞으로 퍼지는 부채꼴, 오른쪽을 보는 그림 — 돌려 쓴다). 원점 = 왼쪽 가운데 */
function beamCanvas(): HTMLCanvasElement {
  const W = 34;
  const H = 22;
  const { canvas, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = x / W;
      const dy = Math.abs(y + 0.5 - H / 2) / (H / 2);
      if (dy > 0.25 + dx * 0.85) continue;
      const a = (1 - dx) * (1 - dy * 0.8) * 0.9;
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 244;
      img.data[i + 2] = 200;
      img.data[i + 3] = Math.round(255 * Math.max(0, a));
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// ── 범퍼카 ──

/** 재질 번호 → 색 (차 색 base로) */
const M = { none: 0, rubberSide: 1, rubberTop: 2, bodySide: 3, bodyTop: 4, bodyHi: 5, stripe: 6, eye: 7, seat: 8, seatTop: 9, pole: 10, spark: 11, light: 12 } as const;
type M = (typeof M)[keyof typeof M];
function matColor(m: M, base: number): number {
  switch (m) {
    case M.rubberSide:
      return 0x24222a;
    case M.rubberTop:
      return 0x46444e;
    case M.bodySide:
      return darken(base, 0.35);
    case M.bodyTop:
      return base;
    case M.bodyHi:
      return lighten(base, 0.3);
    case M.stripe:
      return 0xf4f0ea;
    case M.eye:
      return 0x1e1a2a;
    case M.seat:
      return 0x3a2a3c;
    case M.seatTop:
      return 0x5a4258;
    case M.pole:
      return 0x9a9aa4;
    case M.spark:
      return 0xfff4a0;
    case M.light:
      return 0xfff8d8;
    default:
      return 0;
  }
}

/** 둥근 네모 안인지 (가운데 0, 반너비 hx·hy, 귀퉁이 반지름 r) */
function inRound(x: number, y: number, hx: number, hy: number, r: number): boolean {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax > hx || ay > hy) return false;
  const cx = ax - (hx - r);
  const cy = ay - (hy - r);
  if (cx > 0 && cy > 0) return cx * cx + cy * cy <= r * r;
  return true;
}

/** 차 한 칸 재질 (차머리 h, 높이 z의 한 층에서 (lx, ly) — lx 앞쪽 +, ly 오른쪽 +) */
function carMat(lx: number, ly: number, z: number): M {
  // 더듬이 (뒤 가운데, 위로 길게) + 끝 불꽃
  if (Math.abs(lx + 8.5) < 0.75 && Math.abs(ly) < 0.75) {
    if (z >= 5 && z <= 15) return M.pole;
    if (z >= 16 && z <= 17) return M.spark;
  }
  // 좌석 등받이 (뒤쪽, 차체 위로 솟음)
  if (z >= 5 && z <= 8 && lx > -8 && lx < -3.5 && Math.abs(ly) < 4.6) return z === 8 ? M.seatTop : M.seat;
  // 차체 (z 3..4)
  if (z >= 3 && z <= 4 && inRound(lx, ly, 9, 6, 4)) {
    if (z === 3) return M.bodySide;
    // 윗면: 앞 코 밝게, 가운데 흰 줄, 앞쪽 눈 둘 (유령 차), 좌석 자리는 어둡게
    if (lx > 4.8 && lx < 7.6 && Math.abs(Math.abs(ly) - 2.6) < 1.05) return M.eye;
    if (lx > 7.6) return M.bodyHi;
    if (Math.abs(ly) < 0.9 && lx > -2.5) return M.stripe;
    if (lx < -2.6 && lx > -8 && Math.abs(ly) < 4.2) return M.seat;
    return M.bodyTop;
  }
  // 고무 테두리 (z 0..2)
  if (z <= 2 && inRound(lx, ly, 11, 8, 6)) {
    if (z === 2) return lx > 9.5 && Math.abs(ly) > 2.5 && Math.abs(ly) < 5.5 ? M.light : M.rubberTop;
    return M.rubberSide;
  }
  return M.none;
}

/** 한 방향의 재질 지도 (CAR_W × CAR_H) */
function carMap(h: number): Uint8Array {
  const out = new Uint8Array(CAR_W * CAR_H);
  const c = Math.cos(h);
  const s = Math.sin(h);
  for (let py = 0; py < CAR_H; py++)
    for (let px = 0; px < CAR_W; px++) {
      let m: M = M.none;
      for (let z = 0; z <= 17; z++) {
        const gx = px + 0.5 - CAR_CX;
        const gy = (py + 0.5 - CAR_CY + z) / SQ;
        const lx = gx * c + gy * s;
        const ly = -gx * s + gy * c;
        const k = carMat(lx, ly, z);
        if (k !== M.none) m = k;
      }
      out[py * CAR_W + px] = m;
    }
  return out;
}

let carMaps: Uint8Array[] | null = null;
function allCarMaps(): Uint8Array[] {
  carMaps ??= Array.from({ length: CAR_DIRS }, (_, i) => carMap((i / CAR_DIRS) * Math.PI * 2));
  return carMaps;
}

/** 차 색 하나의 뒤 판·앞 판 (가로로 CAR_DIRS칸) */
function carSheets(base: number): { back: HTMLCanvasElement; front: HTMLCanvasElement } {
  const maps = allCarMaps();
  const back = new Buf(CAR_W * CAR_DIRS, CAR_H);
  const front = new Buf(CAR_W * CAR_DIRS, CAR_H);
  maps.forEach((map, f) => {
    const one = new Buf(CAR_W, CAR_H);
    for (let y = 0; y < CAR_H; y++)
      for (let x = 0; x < CAR_W; x++) {
        const m = map[y * CAR_W + x] as M;
        if (m !== M.none) one.set(x, y, matColor(m, base));
      }
    one.outline();
    for (let y = 0; y < CAR_H; y++)
      for (let x = 0; x < CAR_W; x++) {
        const i = (y * CAR_W + x) * 4;
        if (one.data[i + 3] === 0) continue;
        const c = (one.data[i] << 16) | (one.data[i + 1] << 8) | one.data[i + 2];
        back.set(f * CAR_W + x, y, c);
        const m = map[y * CAR_W + x] as M;
        // 앞 판: 아랫부분의 차체·테두리·좌석 (더듬이는 뒤 판에만)
        if (y >= CAR_FRONT_ROW && m !== M.pole && m !== M.spark) front.set(f * CAR_W + x, y, c);
      }
  });
  return { back: back.canvas(), front: front.canvas() };
}

/** 링크·소품 그림 (가볍다 — 처음 가까이 갔을 때). 간판 글씨는 글꼴을 불러온 뒤 ensureBumperSign으로 */
export function ensureBumperTextures(scene: Phaser.Scene): void {
  add(scene, BTEX.floor, floorCanvas());
  add(scene, BTEX.bulbs, bulbCanvas());
  add(scene, BTEX.bulbGlow, glowCanvas(24));
  add(scene, BTEX.pole, poleCanvas());
  add(scene, BTEX.string, stringCanvas());
  add(scene, BTEX.pillar, pillarCanvas());
  add(scene, BTEX.tyre, tyreCanvas());
  add(scene, BTEX.arch, archCanvas());
  add(scene, BTEX.star, starCanvas());
  add(scene, BTEX.beam, beamCanvas());
}

/** 범퍼카 8색 × 16방향 (조금 무겁다 — 처음 가까이 갔을 때 한 번) */
export function ensureCarTextures(scene: Phaser.Scene): void {
  CAR_COLORS.forEach((base, i) => {
    if (scene.textures.exists(BTEX.carBack(i))) return;
    const { back, front } = carSheets(base);
    add(scene, BTEX.carBack(i), back, { w: CAR_W, h: CAR_H, n: CAR_DIRS });
    add(scene, BTEX.carFront(i), front, { w: CAR_W, h: CAR_H, n: CAR_DIRS });
  });
}

/** 간판·매표소 (글씨가 들어가 글꼴을 불러온 뒤). 이미 있으면 그대로 */
export function ensureBumperSign(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BTEX.sign)) {
    const s = signCanvases();
    add(scene, BTEX.sign, s.sign);
    add(scene, BTEX.signGlow, s.glow);
  }
  if (!scene.textures.exists(BTEX.booth)) {
    const st = textStamp(SMALL_FONT, FREE_TEXT);
    add(
      scene,
      BTEX.booth,
      boothCanvas(
        st
          ? (b, cx, y) => {
              const ox = Math.round(cx - st.w / 2);
              // 글씨 기준선(11)이 팻말 아래쪽 안에 오게 (윗줄 1px 띄움)
              for (let j = 0; j < st.h; j++) for (let i = 0; i < st.w; i++) if (st.on(i, j) && y + j - 1 >= 1 && y + j - 1 < BOOTH_SIGN_H - 1) b.set(ox + i, y + j - 1, 0xfff8d0);
            }
          : null,
      ),
    );
  }
}

/** 간판 글꼴을 불러온 뒤 한 번 부른다 (이미 있으면 바로) */
export function whenBumperFont(cb: () => void): void {
  if (typeof document === "undefined" || !document.fonts) return cb();
  if (document.fonts.check(SIGN_FONT, SIGN_TEXT) && document.fonts.check(SMALL_FONT, FREE_TEXT)) return cb();
  Promise.all([document.fonts.load(SIGN_FONT, SIGN_TEXT), document.fonts.load(SMALL_FONT, FREE_TEXT)]).then(cb, cb);
}
