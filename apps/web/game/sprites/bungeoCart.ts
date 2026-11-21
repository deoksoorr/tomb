import "./avatar"; // 계절·붕어빵 수레 꾸미기 그림 등록 (avatarCore registerSeasonArt) — 붕어빵 장수 외형 덧그림
import { avatarFrameGrid, AV_H, AV_W } from "./avatarCore";
import { darken, Grid, mix, type Color } from "./pixel";

// 11/22 골목 붕어빵 수레 맵 그림 (시안 scratchpad cos-korea render.ts cart · cartsprites.ts를 옮겼다).
//  - 수레: 빨강·흰 줄 차양, 전구 하나, 빨강 앞판 + 크림 간판(붕어빵 셋·하트), 무쇠 틀 위 노릇한 붕어빵, 바퀴 둘, 김
//  - 낮 빈자리: 바퀴 자국 두 줄 + 식은 숯 무더기 + 떨어진 종이봉투 귀퉁이 (수레가 없을 때)
//  - 붕어빵 장수: 게임 아바타 그림(외형 「붕어빵 장수 유령」 vendor)을 그대로 두 장 (숨쉬기)

export const CART_W = 52;
export const CART_H = 54;
/** 수레 그림 안 발바닥 줄·가운데 x */
export const CART_FOOT = CART_H - 3;
export const CART_CX = 26;
export const EMPTY_W = 60;
export const EMPTY_H = 26;
export const EMPTY_CX = 27;
export const EMPTY_FOOT = 22;
/** 붕어빵 장수 그림 (아바타 한 칸) */
export const VENDOR_W = AV_W;
export const VENDOR_H = AV_H;
export const VENDOR_COLOR = "#9fb8d8";

/** 다른 그리드를 알파 섞어 한 점 찍기 */
function dot(g: Grid, x: number, y: number, c: Color, a = 255): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
  const d = g.px[y * g.w + x];
  const da = (d & 255) / 255;
  const sa = a / 255;
  const oa = sa + da * (1 - sa);
  const col = da <= 0 ? c : mix(d >>> 8, c, sa / oa);
  g.px[y * g.w + x] = Grid.rgba(col, Math.round(oa * 255));
}

/** 수레 그림 (가로 CART_W · 세로 CART_H, 발바닥 = CART_FOOT 줄). 밤 빛 자리 [x, y, 반지름]도 돌려준다 */
export function cartGrid(): { g: Grid; lights: [number, number, number][] } {
  const g = new Grid(CART_W, CART_H);
  const x0 = 3;
  const foot = CART_FOOT;
  const W = 46;
  const set = (x: number, y: number, c: Color, a = 255) => g.set(x0 + x, y, c, a);
  const rect = (x: number, y: number, w: number, h: number, c: Color) => g.rect(x0 + x, y, w, h, c);
  const top = foot - 44;
  // 그림자
  for (let x = 2; x < W - 2; x++) for (let y = 0; y < 2; y++) dot(g, x0 + x, foot + y, 0x000000, 50);
  // 기둥
  for (const px of [3, W - 4])
    for (let y = top + 6; y < foot - 18; y++) {
      set(px, y, 0x5a5a62);
      set(px + 1, y, 0x3a3a42);
    }
  // 차양 (줄무늬 + 물결 밑단)
  for (let y = top; y < top + 7; y++)
    for (let x = 0; x < W; x++) {
      const inset = y === top ? 2 : y === top + 1 ? 1 : 0;
      if (x < inset || x >= W - inset) continue;
      const stripe = Math.floor(x / 4) % 2 === 0;
      let c = stripe ? 0xd8403a : 0xf6efe4;
      if (y === top) c = stripe ? 0xf0605a : 0xffffff;
      if (y >= top + 5) c = darken(c, 0.12);
      set(x, y, c);
    }
  for (let x = 0; x < W; x++) if (x % 4 === 1 || x % 4 === 2) set(x, top + 7, Math.floor(x / 4) % 2 === 0 ? 0xa82c2a : 0xd6cfc2);
  for (let x = 2; x < W - 2; x++) set(x, top - 1, 0x6a2a24);
  // 전구 (갓 + 따뜻한 알)
  const bx = 22;
  set(bx, top + 8, 0x3a3438);
  set(bx, top + 9, 0x3a3438);
  for (const dx of [-1, 0, 1]) set(bx + dx, top + 10, 0x6a6a72);
  set(bx, top + 11, 0xfff2b8);
  set(bx - 1, top + 11, 0xffd77a);
  set(bx + 1, top + 11, 0xffd77a);
  set(bx, top + 12, 0xffc860);
  // 수레 몸통 (빨강 앞판) + 크림 간판 띠 (붕어빵 셋)
  const by = foot - 18;
  rect(1, by, W - 2, 13, 0xc8443a);
  for (let x = 1; x < W - 1; x++) {
    set(x, by, 0xe86a5a);
    set(x, by + 12, 0x8a2a24);
  }
  for (let y = by; y < by + 13; y++) {
    set(1, y, 0xe86a5a);
    set(W - 2, y, 0x8a2a24);
  }
  rect(5, by + 3, W - 10, 6, 0xf6ecd8);
  for (let x = 5; x < W - 5; x++) set(x, by + 8, 0xd8c8a8);
  const FP: Record<string, Color> = { h: 0xf6c878, f: 0xe0a048, F: 0xb4742e, e: 0x5a3018, T: 0xb4742e };
  for (const fx of [9, 19, 29]) [".hhhT.", "effffT", ".FFFT."].forEach((r, j) => [...r].forEach((ch, i) => ch !== "." && set(fx + i, by + 4 + j, FP[ch])));
  // 하트 하나 (간판 끝)
  set(W - 9, by + 5, 0xd8403a);
  set(W - 8, by + 5, 0xd8403a);
  set(W - 9, by + 6, 0xd8403a);
  set(W - 8, by + 6, 0xa82c2a);
  // 판 (스테인리스 위판) + 무쇠 틀 + 노릇한 붕어빵
  const ty = by - 4;
  rect(0, ty + 2, W, 2, 0xb8bcc4);
  for (let x = 0; x < W; x++) set(x, ty + 3, 0x8a8e98);
  for (let i = 0; i < 6; i++) {
    const mx = 4 + i * 6;
    rect(mx, ty, 5, 2, 0x2e2e34);
    set(mx, ty, 0x4a4a52);
    if (i % 2 === 0) {
      set(mx + 1, ty - 1, 0xf6c878);
      set(mx + 2, ty - 1, 0xe0a048);
      set(mx + 3, ty - 1, 0xb4742e);
      set(mx + 1, ty, 0xe0a048);
      set(mx + 2, ty, 0xe0a048);
      set(mx + 3, ty, 0xb4742e);
    }
  }
  // 바퀴 둘
  for (const wx of [8, W - 10]) {
    g.ellipse(x0 + wx + 1, foot - 3, 3, 3, 0x2a2a30);
    g.ellipse(x0 + wx + 1, foot - 3, 1.5, 1.5, 0x8a8e98);
    set(wx + 1, foot - 3, 0x4a4a52);
  }
  return {
    g,
    lights: [
      [x0 + bx + 0.5, top + 11.5, 26],
      [x0 + 20, ty, 14],
    ],
  };
}

/** 수레 위 김 (반투명 흰 점 — 두 장 번갈아 위로 피어오른다). 수레 그림과 같은 크기 */
export function cartSteamGrid(frame: 0 | 1): Grid {
  const g = new Grid(CART_W, CART_H);
  const x0 = 3;
  const ty = CART_FOOT - 22;
  const up = frame;
  for (const [x, y, a] of [
    [9, ty - 3, 150],
    [10, ty - 5, 110],
    [9, ty - 7, 70],
    [21, ty - 3, 140],
    [22, ty - 5, 100],
    [33, ty - 4, 130],
    [32, ty - 6, 80],
  ] as const)
    dot(g, x0 + x + (up && x % 2 ? 1 : 0), y - up, 0xffffff, a);
  return g;
}

/** 낮 빈자리: 바퀴 자국 두 줄 + 식은 숯 무더기 + 종이봉투 귀퉁이 */
export function emptySpotGrid(): Grid {
  const d = new Grid(EMPTY_W, EMPTY_H);
  for (const wx of [11, 43])
    for (let k = 0; k < 18; k++) {
      const x = wx - Math.round(k * 0.55);
      const y = 20 - k;
      if (k % 5 !== 4) {
        d.set(x, y, 0x5a5048, Math.max(0, 110 - k * 4));
        d.set(x + 1, y, 0x5a5048, Math.max(0, 70 - k * 3));
      }
    }
  [".aAa.", "aAcAa", "AcaAc", ".aaa."].forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && d.set(24 + x, 15 + y, ch === "a" ? 0x9a948e : ch === "A" ? 0x7a746e : 0x26221f, 230)));
  d.set(30, 18, 0x26221f, 230);
  d.set(22, 18, 0x7a746e, 200);
  d.set(36, 21, 0xf4ecda);
  d.set(37, 21, 0xd4c6a8);
  d.set(36, 22, 0xd4c6a8);
  d.set(37, 22, 0xc8463c);
  return d;
}

/** 붕어빵 장수 두 장 (서기 두 칸 — 숨쉬기), 앞모습. 가로로 이어 붙인 시트 */
export function vendorSheet(): Grid {
  const g = new Grid(VENDOR_W * 2, VENDOR_H);
  for (let c = 0; c < 2; c++) g.draw(avatarFrameGrid("vendor", "down", c, VENDOR_COLOR, []), c * VENDOR_W, 0);
  return g;
}
