import type * as Phaser from "phaser";
import { addCanvasTexture } from "../assets/manifest";
import { Grid, hash2, type Color } from "../sprites/pixel";
import { SNOW } from "../sprites/winterArt";

// 11/18 마을·캠핑장 「눈싸움」 그림. 순수 Grid라 Phaser·DOM 없이 테스트한다 (텍스처 굽기만 Phaser).
//  - 눈뭉치: 손으로 꼭 쥔 울퉁불퉁한 공 (윗왼쪽 빛, 아래오른쪽 그늘, 회청색 테) 두 장 — 날면서 살짝 구른다
//  - 퍽: 네 장 — 납작한 별 모양 덩이 → 둘레로 튀는 조각 → 흩어지는 가루 → 옅은 가루
//  - 바닥 눈 자국: 납작하게 퍼진 눈과 둘레 부스러기 (세 가지)
//  - 11/18 벽·나무에 박힌 눈 자국: 벽면에 철퍽 납작하게 붙어 사방으로 튄 갈래 + 아래로 흘러내린 줄기 (세 가지)
//  - 눈 묻은 얼굴: 앞·옆·뒤 (얼굴 한쪽을 덮은 덩이 + 흘러내리는 한 방울) · 머리 위에 얹힌 눈
// 원점은 쓰는 쪽(SnowFight·AvatarView)이 정한다. 크기는 플레이어(20×28)에 맞춘다.

/** 눈 윤곽 (눈사람 그림과 같은 차가운 회청색 — 눈밭 위에서도 모양이 보이게) */
const EDGE = 0x55606c;
const EDGE_SOFT = 0x7c8a9a;

export const SNOWFIGHT_TEX = {
  ball: "sf-ball",
  shadow: "sf-shadow",
  puff: "sf-puff",
  bit: "sf-bit",
  mark: (v: number) => `sf-mark${v}`,
  wall: (v: number) => `sf-wall${v}`,
  face: (v: FaceView) => `sf-face-${v}`,
  cap: "sf-cap",
} as const;
export type FaceView = "down" | "side" | "up";
export const MARK_VARIANTS = 3;
export const BALL_FRAME = 7;
export const PUFF_W = 24;
export const PUFF_H = 18;
export const PUFF_FRAMES = 4;

/** 눈 덩이 명암: 빛이 왼쪽 위에서 온다 (dx,dy = 덩이 가운데에서의 위치, r = 반지름) */
function shadeSnow(dx: number, dy: number, r: number): Color {
  const l = (-dx - dy) / (r * 1.6);
  if (l > 0.55) return SNOW.hi;
  if (l > -0.15) return SNOW.mid;
  if (l > -0.6) return SNOW.lo;
  return SNOW.shade;
}

/** 울퉁불퉁한 눈 덩이를 그린다 (seed로 가장자리를 조금씩 뜯는다) */
function lump(g: Grid, cx: number, cy: number, rx: number, ry: number, seed: number): void {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      const bite = (hash2(x * 7 + seed, y * 13 - seed) % 100) / 100;
      if (d <= 1 - (d > 0.7 ? bite * 0.35 : 0)) g.set(x, y, shadeSnow(x + 0.5 - cx, y + 0.5 - cy, Math.max(rx, ry)));
    }
}

/** 눈뭉치 두 장 (7×7씩 가로로): 0 = 빛이 왼쪽 위, 1 = 반 바퀴 굴러 결이 바뀐 것 */
export function snowballArt(): Grid {
  const g = new Grid(BALL_FRAME * 2, BALL_FRAME);
  for (let f = 0; f < 2; f++) {
    const one = new Grid(BALL_FRAME, BALL_FRAME);
    lump(one, 3.5, 3.5, 2.6, 2.5, f ? 11 : 3);
    // 꼭 쥔 손자국 결 (한 줄 그늘) + 반짝이는 점
    if (f === 0) {
      one.set(2, 2, 0xffffff);
      one.set(4, 4, SNOW.lo);
      one.set(3, 4, SNOW.lo);
    } else {
      one.set(3, 2, 0xffffff);
      one.set(2, 4, SNOW.lo);
      one.set(4, 3, SNOW.lo);
    }
    one.outline(EDGE);
    g.draw(one, f * BALL_FRAME, 0);
  }
  return g;
}

/** 날아가는 공의 바닥 그림자 (6×3, 반투명) */
export function snowShadowArt(): Grid {
  const g = new Grid(6, 3);
  g.ellipse(3, 1.5, 3, 1.5, 0x1a2230, 110);
  g.rect(1, 1, 4, 1, 0x1a2230, 150);
  return g;
}

/**
 * 퍽 (24×18 네 장): 0 = 맞은 자리에 납작하게 터진 별 모양 덩이, 1 = 둘레로 튀는 굵은 조각과 가운데 가루,
 * 2 = 더 멀리 흩어진 작은 조각, 3 = 옅게 남은 가루
 */
export function snowPuffArt(): Grid {
  const g = new Grid(PUFF_W * PUFF_FRAMES, PUFF_H);
  const cx = PUFF_W / 2;
  const cy = PUFF_H / 2;
  const frame = (f: number): Grid => {
    const one = new Grid(PUFF_W, PUFF_H);
    if (f === 0) {
      lump(one, cx, cy, 5.2, 4.2, 5);
      // 별 모양으로 삐져나온 끝
      for (const [dx, dy] of [
        [-7, -1],
        [6, -3],
        [-3, -5],
        [4, 4],
        [-5, 4],
        [7, 2],
      ] as const)
        lump(one, cx + dx, cy + dy, 1.6, 1.3, dx * 3 + dy);
      one.outline(EDGE);
      one.set(cx - 2, cy - 2, 0xffffff);
      one.set(cx - 1, cy - 2, 0xffffff);
    } else if (f === 1) {
      lump(one, cx, cy + 0.5, 3.2, 2.6, 9);
      for (const [dx, dy, r] of [
        [-8, -3, 1.6],
        [8, -4, 1.5],
        [-2, -7, 1.4],
        [5, 5, 1.5],
        [-7, 4, 1.4],
        [9, 2, 1.2],
        [2, -6, 1.1],
      ] as const)
        lump(one, cx + dx, cy + dy, r, r * 0.9, dx + dy * 5);
      one.outline(EDGE_SOFT);
    } else if (f === 2) {
      for (const [dx, dy] of [
        [-10, -4],
        [10, -6],
        [-3, -8],
        [6, 6],
        [-9, 5],
        [11, 1],
        [0, 7],
        [-5, -1],
        [4, -2],
      ] as const) {
        one.set(cx + dx, cy + dy, SNOW.hi);
        one.set(cx + dx + 1, cy + dy, SNOW.lo);
      }
      for (const [dx, dy] of [
        [-1, 0],
        [1, 1],
        [0, -1],
        [2, -1],
        [-2, 1],
      ] as const)
        one.set(cx + dx, cy + dy, SNOW.mid, 200);
    } else {
      for (const [dx, dy] of [
        [-11, -3],
        [11, -5],
        [-4, -9],
        [7, 7],
        [-10, 6],
        [1, 8],
        [0, -1],
        [-2, 1],
      ] as const)
        one.set(cx + dx, cy + dy, SNOW.hi, 150);
    }
    return one;
  };
  for (let f = 0; f < PUFF_FRAMES; f++) g.draw(frame(f), f * PUFF_W, 0);
  return g;
}

/** 튀는 눈 조각 (3×3 두 장 — 큰 것·작은 것) */
export function snowBitArt(): Grid {
  const g = new Grid(6, 3);
  g.rect(0, 0, 2, 2, SNOW.hi);
  g.set(2, 1, SNOW.lo);
  g.set(1, 2, SNOW.lo);
  g.set(1, 1, SNOW.mid);
  g.set(4, 1, SNOW.hi);
  g.set(5, 1, SNOW.lo);
  return g;
}

/** 바닥 눈 자국 (13×6): 납작하게 퍼진 덩이 + 둘레 부스러기 (v = 모양) */
export function snowMarkArt(v: number): Grid {
  const g = new Grid(13, 6);
  const s = v * 17 + 5;
  // 바닥에 닿아 생긴 옅은 그늘 (덩이보다 살짝 넓게)
  g.ellipse(6.5, 3.4, 5.6, 2.2, SNOW.shade, 120);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const dx = (x + 0.5 - 6.5) / 4.2;
      const dy = (y + 0.5 - 2.9) / 1.7;
      const d = dx * dx + dy * dy;
      if (d > 1 - (hash2(x + s, y * 3 - s) % 100) / 300) continue;
      g.set(x, y, dy < -0.2 ? SNOW.hi : dx > 0.3 ? SNOW.lo : SNOW.mid);
    }
  const bits = [
    [0, 3],
    [12, 2],
    [2, 0],
    [10, 5],
    [11, 0],
    [1, 5],
  ];
  for (let i = 0; i < bits.length; i++) if ((hash2(i, s) & 3) !== 0) g.set(bits[i][0], bits[i][1], SNOW.hi, 220);
  return g;
}

/**
 * 눈 묻은 얼굴 (앞 10×8 · 옆 7×8 · 뒤 9×7). 철퍽 붙어 납작하게 퍼진 눈 + 흘러내리는 방울 + 튄 부스러기.
 * 앞모습은 얼굴 한쪽(보는 사람 기준 오른쪽 눈 자리)을 덮고 왼쪽 눈은 보인다. 옆모습은 얼굴 쪽(오른쪽)에 붙인다 — 왼쪽을 볼 때는 뒤집어 쓴다.
 * 뒷모습은 뒤통수에 퍽 하고 붙은 자국. 테두리는 옅게 (단단한 공이 아니라 부서진 눈처럼)
 */
export function snowFaceArt(v: FaceView): Grid {
  const splat = (g: Grid, cx: number, cy: number, rx: number, ry: number, seed: number, arms: readonly (readonly [number, number])[]) => {
    lump(g, cx, cy, rx, ry, seed);
    // 퍼져 나간 짧은 갈래 (철퍽 붙은 자국)
    for (const [dx, dy] of arms) {
      g.set(cx + dx, cy + dy, SNOW.mid);
      g.set(cx + dx * 0.5, cy + dy * 0.5, SNOW.hi);
    }
  };
  if (v === "side") {
    const g = new Grid(7, 8);
    splat(g, 3.6, 3.2, 2.2, 2.4, 21, [
      [3, -1],
      [-2, -2],
      [2, 2],
    ]);
    g.outline(EDGE_SOFT);
    g.set(3, 2, 0xffffff);
    g.set(2, 2, SNOW.hi);
    // 흘러내리는 방울 두 줄기
    g.set(3, 6, SNOW.lo);
    g.set(3, 7, SNOW.shade, 200);
    g.set(5, 6, SNOW.lo, 220);
    return g;
  }
  if (v === "up") {
    const g = new Grid(9, 7);
    splat(g, 4.5, 3.0, 3.0, 2.0, 33, [
      [-4, -1],
      [4, -2],
      [3, 2],
      [-3, 2],
    ]);
    g.outline(EDGE_SOFT);
    g.set(3, 2, 0xffffff);
    g.set(4, 6, SNOW.lo, 220);
    return g;
  }
  const g = new Grid(10, 8);
  splat(g, 6.0, 3.4, 2.7, 2.3, 13, [
    [-4, -1],
    [3, -3],
    [3, 2],
    [-3, 2],
  ]);
  g.outline(EDGE_SOFT);
  g.set(5, 2, 0xffffff);
  g.set(6, 2, SNOW.hi);
  // 볼에 튄 부스러기 + 턱으로 흐르는 방울
  g.set(1, 2, SNOW.hi);
  g.set(2, 5, SNOW.mid, 220);
  g.set(6, 6, SNOW.lo);
  g.set(6, 7, SNOW.shade, 200);
  return g;
}

/** 머리 위에 얹힌 눈 (9×5): 소복이 얹혀 가장자리로 부스러기가 흘러내린다 */
export function snowCapArt(): Grid {
  const g = new Grid(9, 5);
  lump(g, 4.5, 2.6, 3.4, 1.6, 17);
  lump(g, 5.4, 1.4, 1.5, 1.1, 3);
  g.outline(EDGE_SOFT);
  g.set(3, 1, 0xffffff);
  g.set(4, 1, SNOW.hi);
  g.set(0, 4, SNOW.mid, 200);
  g.set(8, 4, SNOW.lo, 200);
  return g;
}

/**
 * 벽·나무에 박힌 눈 자국 (13×12): 철퍽 부딪혀 납작하게 퍼진 가운데 덩이 + 사방으로 튄 굵고 가는 갈래와 부스러기 +
 * 아래로 흘러내린 줄기 (v = 모양). 가운데는 두껍게(빛·그늘), 갈래 끝은 얇게 — 종이 딱지처럼 네모나 보이지 않게
 */
export function snowWallArt(v: number): Grid {
  const g = new Grid(13, 12);
  const s = v * 29 + 7;
  const cx = 6.5;
  const cy = 4.6;
  lump(g, cx, cy, 2.5, 2.1, s);
  // 튄 갈래: 각도마다 길이가 다르다 (가운데에서 끝으로 가늘게)
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + ((hash2(i, s) % 100) / 100) * 0.6;
    const len = 3.2 + ((hash2(i * 3, s) % 100) / 100) * 2.6;
    for (let r = 2; r <= len; r += 0.7) {
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.8;
      g.set(x, y, r < len - 1 ? SNOW.mid : SNOW.lo);
    }
  }
  g.outline(EDGE_SOFT, false, 200);
  // 가운데 빛 (눈이 두껍게 붙은 자리)
  g.set(5, 3, 0xffffff);
  g.set(6, 3, 0xffffff);
  g.set(5, 4, SNOW.hi);
  g.set(7, 6, SNOW.lo);
  // 떨어져 붙은 부스러기
  for (const [x, y] of [
    [1, 2],
    [11, 1],
    [12, 6],
    [0, 7],
  ] as const)
    if (hash2(x, y + s) & 1) g.set(x, y, SNOW.hi, 230);
  // 흘러내린 줄기 한두 개 (아래로 갈수록 옅게)
  const drips = [5 + (s % 2), 8 - (v % 2)];
  for (let i = 0; i < (v === 1 ? 1 : 2); i++) {
    const x = drips[i];
    g.set(x, 8, SNOW.lo);
    g.set(x, 9, SNOW.lo, 210);
    g.set(x, 10, SNOW.shade, i === 0 ? 170 : 0);
  }
  return g;
}

/** 눈싸움 텍스처를 한 번 굽는다 (이미 있으면 건너뛴다) */
export function ensureSnowFightTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(SNOWFIGHT_TEX.cap)) return;
  addCanvasTexture(scene, SNOWFIGHT_TEX.ball, { canvas: snowballArt().toCanvas(), frameW: BALL_FRAME, frameH: BALL_FRAME });
  addCanvasTexture(scene, SNOWFIGHT_TEX.shadow, { canvas: snowShadowArt().toCanvas() });
  addCanvasTexture(scene, SNOWFIGHT_TEX.puff, { canvas: snowPuffArt().toCanvas(), frameW: PUFF_W, frameH: PUFF_H });
  addCanvasTexture(scene, SNOWFIGHT_TEX.bit, { canvas: snowBitArt().toCanvas(), frameW: 3, frameH: 3 });
  for (let v = 0; v < MARK_VARIANTS; v++) addCanvasTexture(scene, SNOWFIGHT_TEX.mark(v), { canvas: snowMarkArt(v).toCanvas() });
  for (let v = 0; v < MARK_VARIANTS; v++) addCanvasTexture(scene, SNOWFIGHT_TEX.wall(v), { canvas: snowWallArt(v).toCanvas() });
  for (const v of ["down", "side", "up"] as const) addCanvasTexture(scene, SNOWFIGHT_TEX.face(v), { canvas: snowFaceArt(v).toCanvas() });
  addCanvasTexture(scene, SNOWFIGHT_TEX.cap, { canvas: snowCapArt().toCanvas() });
}
