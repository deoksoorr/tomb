import { darken, Grid, hash2, lighten, mix, type Color } from "../sprites/pixel";

// 11/16 포구 오두막 집 안 (game/housing/HouseScene이 집이 오두막일 때만 쓴다).
//  - 집 밖 마당 = 모래사장, 그 아래(남쪽)로 갯벌·바다. 물가 선은 지금 물때(0 간조 ~ 1 만조)를 따라 오르내려요
//    (만조: 물이 집 앞 바로 아래까지, 간조: 갯벌이 넓게 드러나고 물은 아래 끝에)
//  - 아래쪽(남쪽) 벽 창: 앞벽 양쪽에 바다가 보이는 창 (위 하늘 · 수평선 · 바다, 간조엔 갯벌 띠)
// 물때는 tideClock(시험용 ?tide= 덮어쓰기 포함)을 장면이 넘겨요. 그림은 물때 0.1 단위로 다시 구워요

/** 그림을 다시 굽는 물때 단위 (0..10) */
export const tideBucket = (level: number) => Math.max(0, Math.min(10, Math.round(level * 10)));

const SAND = [0xe8d4a8, 0xdcc494, 0xf0dcb4] as const;
const WET = 0xb8a07a;
const FLAT = [0x8a7a62, 0x7a6c56, 0x96866c] as const;
const SEA_SHALLOW = 0x7cc4cc;
const SEA_DEEP = 0x3e8aa8;
const FOAM = 0xf4fbff;

/** 물가 선 y (캔버스 안). top = 앞벽 바깥 아래 끝, bottom = 캔버스 끝 */
export function seaLineY(level: number, top: number, bottom: number): number {
  const near = top + 16;
  const far = bottom - 10;
  return Math.round(far + (near - far) * Math.max(0, Math.min(1, level)));
}

/**
 * 집 밖 바닷가 (W×H 캔버스 전체). top = 앞벽 밑동 y (그 위는 모래), level = 물 높이, night = 밤 (어둡고 푸르게)
 * 집 안 바닥은 장면이 그 위에 다시 그려요
 */
export function seaYardCanvas(W: number, H: number, top: number, level: number, night: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const line = seaLineY(level, top, H);
  // 젖은 모래 띠 (간조 때 넓게) · 갯벌은 만조 물가 아래부터
  const flatTop = top + 22;
  const put = (x: number, y: number, col: Color) => {
    const k = night ? mix(col, 0x1a2440, 0.45) : col;
    const i = (y * W + x) * 4;
    img.data[i] = (k >> 16) & 255;
    img.data[i + 1] = (k >> 8) & 255;
    img.data[i + 2] = k & 255;
    img.data[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = hash2(x, y, 7);
      // 물가는 조금 물결지게
      const wave = Math.round(Math.sin(x / 9 + y * 0.02) * 2 + Math.sin(x / 23) * 2);
      const ly = line + wave;
      let col: Color;
      if (y >= ly) {
        const d = Math.min(1, (y - ly) / 40);
        col = mix(SEA_SHALLOW, SEA_DEEP, d);
        // 잔물결 줄
        if ((y - ly) % 7 === 2 && n > 0.55) col = lighten(col, 0.18);
        if (y - ly < 2) col = FOAM;
        else if (y - ly < 4 && n > 0.4) col = mix(FOAM, SEA_SHALLOW, 0.5);
      } else if (y >= flatTop) {
        // 갯벌 (물이 빠진 곳): 진한 회갈색 + 물웅덩이 반짝
        col = FLAT[Math.floor(n * 3)];
        if (y > ly - 6) col = darken(col, 0.12);
        if (n > 0.985) col = 0xa8c8cc;
      } else {
        col = y > flatTop - 6 ? mix(SAND[0], WET, (y - (flatTop - 6)) / 6) : SAND[Math.floor(n * 3)];
        if (n > 0.97) col = 0xfff4dc; // 조개 부스러기
      }
      put(x, y, col);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export const SEA_WIN_W = 30;
export const SEA_WIN_H = 11;

/** 아래쪽 벽(앞벽) 창: 나무 틀 안에 하늘 · 수평선 · 바다 (간조엔 아래에 갯벌 띠) */
export function seaWindowGrid(level: number, night: boolean): Grid {
  const W = SEA_WIN_W;
  const H = SEA_WIN_H;
  const g = new Grid(W, H);
  const frame = 0xf2ece0;
  const frameD = 0xbfb6a4;
  g.rect(0, 0, W, H, frame);
  g.hline(0, W - 1, H - 1, frameD);
  const x0 = 2;
  const x1 = W - 3;
  const y0 = 2;
  const y1 = H - 3;
  const sky0 = night ? 0x1a2444 : 0x9ad0ee;
  const sky1 = night ? 0x2a3658 : 0xd6eefa;
  const sea = night ? 0x1e3a5a : 0x4a9cc0;
  const horizon = y0 + 3;
  // 간조면 아래쪽에 갯벌이 드러나요 (물이 멀다)
  const flatRows = Math.round((1 - Math.max(0, Math.min(1, level))) * 3);
  for (let y = y0; y <= y1; y++) {
    let col: Color;
    if (y < horizon) col = mix(sky0, sky1, (y - y0) / Math.max(1, horizon - y0));
    else if (y > y1 - flatRows) col = night ? 0x3a3a3a : 0x8a7a62;
    else col = y === horizon ? lighten(sea, 0.15) : sea;
    g.hline(x0, x1, y, col);
  }
  // 반짝임 (낮) · 달빛 (밤)
  if (night) g.set(x1 - 4, y0, 0xf2ecc8);
  else for (const x of [x0 + 5, x0 + 14, x0 + 21]) g.set(x, horizon + 2, 0xffffff);
  // 가운데 창살
  g.vline(Math.floor(W / 2), y0, y1, frame);
  return g;
}
