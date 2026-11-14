import type * as Phaser from "phaser";
import { makeCanvas } from "../sprites/pixel";
import type { GhostLook } from "./ghostKinds";
import { mulberry } from "./maze";

// 귀신의집 귀신 그림 (코드로 그리는 픽셀아트, 이 게임 그림체로 따로 지은 것). 브라우저에서만 부른다.
//  - 미로 안 귀신 10종의 작은 그림(여러 프레임) — 종류마다 크기·프레임 수가 다르다 (GHOST_SHEET)
//  - 놀래키는 얼굴 10종 (64×64, 크게 늘려 화면을 채운다)
//  - 벽에서 튀어나오는 손 (벽 속의 손 귀신이 여러 개 띄운다)

type Ctx = CanvasRenderingContext2D;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
function px(ctx: Ctx, x: number, y: number, w: number, h: number, c: number, a = 1): void {
  ctx.globalAlpha = a;
  ctx.fillStyle = hex(c);
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
  ctx.globalAlpha = 1;
}
function oval(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: number, a = 1): void {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    px(ctx, cx - w, cy + y, w * 2 + 1, 1, c, a);
  }
}
/** 두께 w의 픽셀 선 (돌려 그려도 흐려지지 않게 점을 찍어 잇는다) */
function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: number, w = 1): void {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  const h = Math.floor(w / 2);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    px(ctx, x - h, y - h, w, w, c);
  }
}
/** 여러 점을 잇는 선 */
function poly(ctx: Ctx, pts: readonly (readonly [number, number])[], c: number, w = 1): void {
  for (let i = 1; i < pts.length; i++) line(ctx, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, w);
}

/** 귀신마다 한 프레임 크기와 프레임 수 (가로로 늘어선 한 장) */
export const GHOST_SHEET: Record<GhostLook, { w: number; h: number; n: number }> = {
  hanger: { w: 16, h: 44, n: 2 },
  hands: { w: 8, h: 14, n: 2 },
  mirror: { w: 14, h: 24, n: 4 },
  eye: { w: 12, h: 16, n: 5 },
  dollhead: { w: 10, h: 10, n: 5 },
  crawler: { w: 22, h: 14, n: 4 },
  broken: { w: 16, h: 26, n: 3 },
  sobok: { w: 16, h: 24, n: 2 },
  shadow: { w: 16, h: 30, n: 2 },
  mannequin: { w: 14, h: 26, n: 3 },
};

// 자주 쓰는 색
const BLACK = 0x000000;
const HAIR = 0x08060a;
const PALE = 0xc4ccd2;
const PALE_D = 0x98a0a6;

function drawFrame(ctx: Ctx, look: GhostLook, o: number, f: number): void {
  switch (look) {
    case "hanger": {
      // 천장에 거꾸로 매달린 여자: 맨발이 위, 흰 옷이 머리 쪽으로 흘러내리고, 거꾸로 된 얼굴 아래로 머리카락이 길게 늘어진다
      const s = f ? 1 : 0;
      px(ctx, o + 5, 0, 2, 3, 0xb0b8be);
      px(ctx, o + 9, 0, 2, 3, 0xb0b8be);
      px(ctx, o + 5, 3, 2, 6, PALE_D);
      px(ctx, o + 9, 3, 2, 6, PALE_D);
      for (let y = 8; y <= 22; y++) {
        const hw = Math.min(6, 3 + Math.floor((y - 8) * 0.25));
        px(ctx, o + 8 - hw, y, hw * 2, 1, 0xe4e2dc);
      }
      for (let y = 10; y < 22; y += 3) px(ctx, o + 6 + ((y >> 1) % 3), y, 1, 2, 0xc8c6c0);
      for (let x = 2; x < 14; x += 2) px(ctx, o + x, 22, 1, 1 + ((x + f) % 2), 0xd8d6d0);
      // 축 늘어진 두 팔 (머리 아래까지)
      px(ctx, o + 2, 14, 1, 21, PALE_D);
      px(ctx, o + 13, 14, 1, 21 + s, PALE_D);
      for (const [x, d] of [
        [1, 0],
        [2, 1],
        [3, 0],
        [12, 0],
        [13, 1],
        [14, 0],
      ] as const)
        px(ctx, o + x, 35 + d + (x > 8 ? s : 0), 1, 3, 0x8a9298);
      // 목·거꾸로 된 얼굴 (입이 위, 눈이 아래)
      px(ctx, o + 7, 23, 2, 2, PALE);
      oval(ctx, o + 8, 28, 3, 4, 0xd0d8dc);
      px(ctx, o + 7, 25, 2, 2, 0x2a0608);
      px(ctx, o + 6, 29, 1, 1, BLACK);
      px(ctx, o + 10, 29, 1, 1, BLACK);
      px(ctx, o + 6, 30, 1, 2, 0x3a3038);
      // 머리카락: 정수리에서 아래로 길게
      px(ctx, o + 4, 26, 1, 6, HAIR);
      px(ctx, o + 12, 26, 1, 6, HAIR);
      px(ctx, o + 3, 31, 10, 6, HAIR);
      for (let x = 3; x < 13; x++) px(ctx, o + x + (x % 3 === 0 ? s : 0), 37, 1, 2 + ((x * 7 + f * 3) % 5), HAIR);
      break;
    }
    case "hands": {
      // 창백한 손 하나 (손가락이 위). f=1 이면 움켜쥔다
      px(ctx, o + 3, 8, 2, 6, PALE_D);
      px(ctx, o + 2, 5, 4, 4, PALE);
      if (!f) {
        px(ctx, o + 1, 1, 1, 5, PALE);
        px(ctx, o + 3, 0, 1, 5, PALE);
        px(ctx, o + 5, 1, 1, 5, PALE);
        px(ctx, o + 6, 3, 1, 3, PALE);
        px(ctx, o + 0, 5, 1, 2, PALE_D);
        for (const x of [1, 3, 5]) px(ctx, o + x, x === 3 ? 0 : 1, 1, 1, 0x3a2a2a);
      } else {
        px(ctx, o + 2, 3, 4, 2, PALE);
        px(ctx, o + 1, 4, 1, 3, PALE_D);
        px(ctx, o + 6, 4, 1, 3, PALE_D);
        px(ctx, o + 2, 3, 4, 1, 0x3a2a2a);
      }
      px(ctx, o + 4, 9, 1, 4, 0x6a7276);
      break;
    }
    case "mirror": {
      // 세워 둔 거울. 0 가만히 · 1 고개를 갸웃 · 2 웃는다 · 3 금이 간다
      px(ctx, o + 0, 0, 14, 21, 0x4a3418);
      px(ctx, o + 1, 1, 12, 19, 0x6a4c22);
      px(ctx, o + 2, 2, 10, 17, 0x34424e);
      px(ctx, o + 3, 3, 1, 6, 0x5a6a78);
      px(ctx, o + 4, 3, 1, 3, 0x5a6a78);
      px(ctx, o + 2, 21, 2, 3, 0x3a2812);
      px(ctx, o + 10, 21, 2, 3, 0x3a2812);
      // 거울 속 그것 (내가 아니다)
      const tilt = f >= 1 ? 1 : 0;
      oval(ctx, o + 7 + tilt, 7 + tilt, 2, 3, 0x0c1014);
      px(ctx, o + 5, 10, 5, 9, 0x0c1014);
      px(ctx, o + 4, 12, 1, 6, 0x0c1014);
      px(ctx, o + 10, 12, 1, 6, 0x0c1014);
      if (f >= 2) {
        px(ctx, o + 6 + tilt, 6 + tilt, 1, 1, 0xff3030);
        px(ctx, o + 8 + tilt, 6 + tilt, 1, 1, 0xff3030);
        px(ctx, o + 5 + tilt, 9 + tilt, 5, 1, 0xe8e8e0);
        px(ctx, o + 6 + tilt, 9 + tilt, 1, 1, 0x0c1014);
        px(ctx, o + 8 + tilt, 9 + tilt, 1, 1, 0x0c1014);
      }
      if (f === 3) {
        poly(ctx, [[o + 9, 8], [o + 11, 4], [o + 12, 2]], 0xd8e0e8);
        poly(ctx, [[o + 9, 8], [o + 3, 5]], 0xd8e0e8);
        poly(ctx, [[o + 9, 8], [o + 7, 14], [o + 8, 18]], 0xd8e0e8);
        poly(ctx, [[o + 9, 8], [o + 12, 12]], 0xd8e0e8);
        px(ctx, o + 10, 6, 1, 2, BLACK);
      }
      break;
    }
    case "eye": {
      // 벽에 난 좁은 문틈과 그 안의 눈. 0 가운데 · 1 왼쪽 · 2 오른쪽 봄 · 3 감음 · 4 크게 뜸
      px(ctx, o + 1, 0, 10, 16, 0x24160e);
      px(ctx, o + 2, 1, 8, 15, 0x3a2618);
      for (let y = 3; y < 16; y += 4) px(ctx, o + 2, y, 8, 1, 0x2a1a10);
      const wide = f === 4;
      const gx = wide ? 3 : 4;
      const gw = wide ? 6 : 4;
      px(ctx, o + gx, 1, gw, 14, BLACK);
      if (f === 3) {
        px(ctx, o + 4, 7, 4, 1, 0x7a6a62);
      } else {
        px(ctx, o + gx, 6, gw, 1, 0x6a5a52);
        px(ctx, o + gx, 7, gw, wide ? 2 : 1, 0xe0dcd0);
        px(ctx, o + gx, wide ? 9 : 8, gw, 1, 0x5a2a2a);
        const pxx = wide ? 6 : f === 1 ? 4 : f === 2 ? 7 : 5;
        px(ctx, o + pxx, 7, wide ? 1 : 2, wide ? 2 : 1, BLACK);
        px(ctx, o + gx + gw - 1, 7, 1, 1, 0xa02020);
      }
      px(ctx, o + 9, 9, 1, 1, 0x8a6a30);
      break;
    }
    case "dollhead": {
      // 굴러오는 도자기 인형 머리. 0 앞 · 1 옆 · 2 뒤통수 · 3 다른 옆 · 4 한쪽 눈이 빈 채 노려봄
      const skin = 0xf0e4dc;
      const hair = 0x6a3a1a;
      if (f === 2) {
        oval(ctx, o + 5, 5, 4, 4, hair);
        for (const [x, y] of [
          [2, 3],
          [5, 2],
          [7, 5],
          [4, 7],
        ] as const)
          px(ctx, o + x, y, 1, 1, 0x4a2610);
        break;
      }
      oval(ctx, o + 5, 5, 4, 4, skin);
      oval(ctx, o + 5, 6, 3, 2, 0xe8d8cc);
      if (f === 1 || f === 3) {
        const l = f === 1;
        px(ctx, o + (l ? 5 : 1), 1, 4, 8, hair);
        px(ctx, o + (l ? 2 : 7), 4, 1, 1, 0x2a5aa0);
        px(ctx, o + (l ? 1 : 8), 6, 1, 1, 0xa02030);
        break;
      }
      px(ctx, o + 1, 1, 8, 2, hair);
      px(ctx, o + 1, 2, 1, 5, hair);
      px(ctx, o + 8, 2, 1, 5, hair);
      px(ctx, o + 2, 4, 2, 2, 0x2a5aa0);
      px(ctx, o + 3, 5, 1, 1, BLACK);
      if (f === 4) {
        px(ctx, o + 6, 4, 2, 2, BLACK);
        line(ctx, o + 6, 6, o + 5, 8, 0x5a4a40);
      } else {
        px(ctx, o + 6, 4, 2, 2, 0x2a5aa0);
        px(ctx, o + 6, 5, 1, 1, BLACK);
      }
      px(ctx, o + 4, 7, 2, 1, 0xa02030);
      px(ctx, o + 2, 6, 1, 1, 0xe0a0a8);
      break;
    }
    case "crawler": {
      // 네 발로 기는 아이 (오른쪽을 향함, 왼쪽은 뒤집어 쓴다). 무릎·팔꿈치가 거미처럼 높이 솟는다
      const k = f % 2 ? 1 : -1;
      const far = 0x6a7276;
      const near = 0x98a0a4;
      // 먼 쪽 팔다리
      poly(ctx, [[o + 8, 8], [o + 7 - k, 3], [o + 5 - k, 13]], far);
      poly(ctx, [[o + 14, 8], [o + 16 + k, 4], [o + 18 + k, 13]], far);
      // 몸 (등이 굽었다)
      px(ctx, o + 6, 6, 10, 3, 0xa8b0b4);
      px(ctx, o + 9, 5, 4, 1, 0xa8b0b4);
      px(ctx, o + 6, 8, 10, 1, 0x7a8286);
      for (let x = 8; x < 15; x += 2) px(ctx, o + x, 6, 1, 1, 0x8a9296);
      // 가까운 쪽 팔다리
      poly(ctx, [[o + 7, 8], [o + 6 + k, 2], [o + 4 + k, 13]], near);
      poly(ctx, [[o + 15, 8], [o + 14 - k, 3], [o + 16 - k, 13]], near);
      px(ctx, o + 3 + k, 13, 2, 1, near);
      px(ctx, o + 16 - k, 13, 2, 1, near);
      // 머리: 고개를 들어 이쪽을 본다
      oval(ctx, o + 18, 6, 3, 3, 0xb8c0c4);
      px(ctx, o + 16, 2, 5, 2, HAIR);
      px(ctx, o + 16, 4, 1, 4 + (f % 2), HAIR);
      px(ctx, o + 20, 4, 1, 3, HAIR);
      px(ctx, o + 17, 5, 1, 2, BLACK);
      px(ctx, o + 19, 5, 1, 2, BLACK);
      px(ctx, o + 18, 8, 1, 1 + (f >> 1), BLACK);
      break;
    }
    case "broken": {
      // 목이 오른쪽 어깨 위로 꺾인 형체. 0·1 걸음 · 2 고개가 더 꺾이며 입이 벌어진다
      const robe = 0x1e1a22;
      const s = f === 1 ? 1 : 0;
      const tw = f === 2 ? 1 : 0;
      for (let y = 11; y < 25; y++) {
        const hw = 4 + Math.floor((y - 11) / 4);
        px(ctx, o + 8 - hw, y, hw * 2, 1, robe);
      }
      for (let x = 3; x < 13; x += 2) px(ctx, o + x + s, 25, 1, 1, robe);
      px(ctx, o + 5, 13, 1, 10, 0x2a2430);
      // 팔: 축 늘어져 무릎까지
      px(ctx, o + 2, 12, 1, 11 + s, PALE_D);
      px(ctx, o + 13, 12, 1, 11 - s, PALE_D);
      px(ctx, o + 1, 23 + s, 1, 2, 0x7a8288);
      px(ctx, o + 3, 23 + s, 1, 2, 0x7a8288);
      px(ctx, o + 14, 23 - s, 1, 2, 0x7a8288);
      // 어깨·꺾인 목
      px(ctx, o + 4, 10, 8, 2, robe);
      px(ctx, o + 7, 8, 2, 3, 0x9aa2a6);
      px(ctx, o + 8, 9, 1, 1, 0x4a3a4a);
      // 옆으로 누운 머리 (정수리가 오른쪽)
      oval(ctx, o + 11, 8 + tw, 4, 3, 0xa8b0b4);
      px(ctx, o + 14, 5 + tw, 2, 8, HAIR);
      px(ctx, o + 15, 13 + tw, 1, 4, HAIR);
      px(ctx, o + 13, 12 + tw, 1, 3, HAIR);
      px(ctx, o + 12, 6 + tw, 1, 1, BLACK);
      px(ctx, o + 12, 10 + tw, 1, 1, BLACK);
      px(ctx, o + 8, 7 + tw, 2, 3 + tw, 0x1a0608);
      break;
    }
    case "sobok": {
      // 소복 입은 처녀귀신: 긴 검은 머리가 얼굴을 덮고, 흰 옷자락 아래는 발이 없다
      px(ctx, o + 4, 9, 8, 13, 0xe8e6e0);
      px(ctx, o + 3, 13, 10, 8, 0xe8e6e0);
      px(ctx, o + 2, 18, 12, 4 - f, 0xd8d6d0);
      for (let x = 2; x < 14; x += 2) px(ctx, o + x + f, 21 - f, 1, 2, 0xd8d6d0);
      px(ctx, o + 3, 11, 1, 7, 0xd0cec8);
      px(ctx, o + 12, 11, 1, 7, 0xd0cec8);
      px(ctx, o + 4, 1, 8, 3, HAIR);
      px(ctx, o + 3, 3, 10, 12 + f, HAIR);
      px(ctx, o + 2, 6, 1, 8, HAIR);
      px(ctx, o + 13, 6, 1, 9 - f, HAIR);
      px(ctx, o + 7, 5, 2, 6, 0xc8d0d8);
      px(ctx, o + 7, 7, 1, 1, BLACK);
      px(ctx, o + 8, 9, 1, 1, 0x5a1010);
      break;
    }
    case "shadow": {
      // 키 큰 검은 그림자: 무릎까지 닿는 긴 팔, 붉은 눈 두 점
      const c = 0x050407;
      oval(ctx, o + 8, 5, 3, 4, c);
      px(ctx, o + 7, 9, 2, 1, c);
      px(ctx, o + 5, 10, 6, 12, c);
      px(ctx, o + 4, 11, 1, 3, c);
      px(ctx, o + 11, 11, 1, 3, c);
      px(ctx, o + 3, 13, 1, 11 + f, c);
      px(ctx, o + 12, 13, 1, 12 - f, c);
      for (const x of [2, 3, 4]) px(ctx, o + x, 24 + f, 1, 2 + (x % 2), c);
      for (const x of [11, 12, 13]) px(ctx, o + x, 25 - f, 1, 2 + (x % 2), c);
      px(ctx, o + 5, 22, 2, 8 - f, c);
      px(ctx, o + 9, 22, 2, 7 + f, c);
      px(ctx, o + 5, 4, 2, 2, 0x5a0808);
      px(ctx, o + 9, 4, 2, 2, 0x5a0808);
      px(ctx, o + 6, 4, 1, 1, 0xff3030);
      px(ctx, o + 9, 4, 1, 1, 0xff3030);
      px(ctx, o + 6, 7, 4, 1, 0x2a0406);
      break;
    }
    case "mannequin": {
      // 마네킹: 매끈한 달걀 머리에 칠한 눈구멍, 마디진 팔다리. 0 가만히 · 1 고개를 돌림 · 2 팔을 뻗음
      const b = 0xd8c8a8;
      const sh = 0xb0a080;
      const j = 0x8a7a60;
      const turn = f >= 1 ? 1 : 0;
      oval(ctx, o + 7 + turn, 5, 3, 4, b);
      px(ctx, o + 9 + turn, 3, 1, 5, sh);
      px(ctx, o + 5 + turn * 2, 4, 1, 2, 0x3a2e24);
      px(ctx, o + 8 + turn, 4, 1, 2, 0x3a2e24);
      line(ctx, o + 8 + turn, 1, o + 9 + turn, 3, 0x5a4a38);
      px(ctx, o + 6, 9, 2, 2, sh);
      px(ctx, o + 4, 11, 6, 7, b);
      px(ctx, o + 9, 11, 1, 7, sh);
      px(ctx, o + 4, 17, 6, 1, j);
      if (f === 2) {
        px(ctx, o + 1, 11, 3, 1, b);
        px(ctx, o + 0, 9, 1, 3, b);
        px(ctx, o + 10, 11, 3, 1, b);
        px(ctx, o + 13, 9, 1, 3, b);
        px(ctx, o + 3, 11, 1, 1, j);
        px(ctx, o + 10, 11, 1, 1, j);
      } else {
        px(ctx, o + 2, 11, 2, 1, j);
        px(ctx, o + 2, 12, 1, 8, b);
        px(ctx, o + 10, 11, 2, 1, j);
        px(ctx, o + 11, 12, 1, 8, sh);
        px(ctx, o + 2, 16, 1, 1, j);
        px(ctx, o + 11, 16, 1, 1, j);
      }
      px(ctx, o + 4, 18, 2, 8, b);
      px(ctx, o + 8, 18, 2, 8, sh);
      px(ctx, o + 4, 22, 2, 1, j);
      px(ctx, o + 8, 22, 2, 1, j);
      break;
    }
  }
}

function ghostSheet(look: GhostLook): HTMLCanvasElement {
  const { w, h, n } = GHOST_SHEET[look];
  const { canvas, ctx } = makeCanvas(w * n, h);
  for (let f = 0; f < n; f++) drawFrame(ctx, look, f * w, f);
  return canvas;
}

// ── 놀래키는 얼굴 (64×64) ──

const FACE = 64;

/** 캔버스를 위아래로 뒤집은 새 캔버스 */
function flipV(src: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.setTransform(1, 0, 0, -1, 0, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** 캔버스를 시계 방향 90° 돌린 새 캔버스 (픽셀 그대로) */
function rotCW(src: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.height, src.width);
  ctx.setTransform(0, 1, -1, 0, src.height, 0);
  ctx.drawImage(src, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** 소복: 머리카락 사이 퀭한 눈과 벌린 입 (원래 있던 얼굴) */
function faceSobok(ctx: Ctx): void {
  const r = mulberry(13);
  oval(ctx, 32, 28, 26, 26, 0x070509);
  px(ctx, 6, 28, 52, 36, 0x070509);
  oval(ctx, 32, 34, 16, 22, 0xb8c4c8);
  oval(ctx, 32, 36, 14, 19, 0xc8d2d4);
  for (let i = 0; i < 9; i++) {
    px(ctx, 32 - i * 2 - 2, 12 + i, 2, 6 + i, 0x070509);
    px(ctx, 32 + i * 2, 12 + i, 2, 6 + i, 0x070509);
  }
  for (const ex of [24, 40]) {
    oval(ctx, ex, 31, 6, 5, 0x6a7078);
    oval(ctx, ex, 31, 5, 4, BLACK);
    px(ctx, ex - (ex < 32 ? -1 : 1), 31, 2, 2, 0xffffff);
    px(ctx, ex - 1, 36, 1, 8 + Math.floor(r() * 4), 0x2a2228);
  }
  oval(ctx, 32, 47, 6, 7, 0x1a0608);
  oval(ctx, 32, 48, 5, 5, BLACK);
  px(ctx, 28, 41, 8, 1, 0x7a8288);
  for (let i = 0; i < 26; i++) px(ctx, 18 + Math.floor(r() * 28), 18 + Math.floor(r() * 34), 1, 1, r() < 0.5 ? 0x8a9298 : 0x9aa2a8);
  px(ctx, 19, 38, 3, 6, 0x98a2a8);
  px(ctx, 42, 38, 3, 6, 0x98a2a8);
}

/** 천장의 여자: 흰자만 남은 뒤집힌 눈, 길게 찢어진 입 — 바로 선 얼굴로 그린 뒤 위아래를 뒤집는다 (목이 위, 머리카락이 아래로 쏟아진다) */
function faceHanger(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(FACE, FACE);
  const r = mulberry(21);
  // 머리카락 (뒤집으면 화면 아래 끝까지 늘어진다)
  oval(ctx, 32, 26, 27, 24, HAIR);
  px(ctx, 5, 0, 54, 30, HAIR);
  for (let x = 0; x < 64; x += 2) {
    const l = 10 + Math.floor(r() * 18);
    px(ctx, x, 0, 1 + (x % 4 === 0 ? 1 : 0), l, HAIR);
  }
  // 목 (뒤집으면 천장 쪽으로 이어진다)
  px(ctx, 26, 52, 12, 12, 0xa4b0b4);
  px(ctx, 28, 58, 1, 6, 0x7a868c);
  oval(ctx, 32, 36, 15, 20, 0xb4c0c4);
  oval(ctx, 32, 37, 13, 18, 0xccd6d8);
  // 이마를 가르는 머리카락
  for (let i = 0; i < 7; i++) {
    px(ctx, 30 - i * 2, 16 + i, 2, 4 + i, HAIR);
    px(ctx, 32 + i * 2, 16 + i, 2, 3 + i, HAIR);
  }
  // 뒤집힌 눈: 흰자 + 위로 말려 올라간 눈동자 끝 + 핏발
  for (const ex of [24, 40]) {
    oval(ctx, ex, 32, 6, 4, 0x4a5058);
    oval(ctx, ex, 32, 5, 3, 0xf0eee6);
    px(ctx, ex - 2, 29, 4, 1, 0x1a1a1a);
    px(ctx, ex - 4, 33, 1, 1, 0xb03030);
    px(ctx, ex + 3, 31, 1, 1, 0xb03030);
    px(ctx, ex - 1, 36, 1, 7, 0x2a2228);
  }
  // 아래로 길게 벌어진 입 (뒤집으면 위로 찢어진다)
  oval(ctx, 32, 47, 4, 7, 0x3a0808);
  oval(ctx, 32, 48, 3, 5, BLACK);
  for (const x of [30, 32, 34]) px(ctx, x, 41, 1, 2, 0xe0dcd0);
  for (let i = 0; i < 30; i++) px(ctx, 19 + Math.floor(r() * 26), 20 + Math.floor(r() * 32), 1, 1, r() < 0.5 ? 0x9aa4aa : 0xaab4b8);
  return flipV(canvas);
}

/** 기어 오는 아이: 새까만 두 눈, 바늘 같은 이가 촘촘한 입 */
function faceCrawler(ctx: Ctx): void {
  const r = mulberry(31);
  oval(ctx, 32, 33, 21, 23, 0x8a98a0);
  oval(ctx, 32, 34, 19, 21, 0xa0aeb6);
  // 젖은 머리카락 몇 가닥
  for (const [x, l] of [
    [20, 14],
    [25, 10],
    [31, 16],
    [38, 12],
    [44, 15],
  ] as const) {
    line(ctx, x, 11, x - 2 + Math.floor(r() * 4), 11 + l, HAIR, 2);
  }
  px(ctx, 18, 10, 28, 4, HAIR);
  // 핏줄
  poly(ctx, [[14, 26], [17, 30], [15, 35]], 0x5a6a78);
  poly(ctx, [[50, 25], [47, 30], [49, 36]], 0x5a6a78);
  // 새까만 큰 눈
  for (const ex of [23, 41]) {
    oval(ctx, ex, 31, 7, 8, 0x5a6670);
    oval(ctx, ex, 31, 6, 7, BLACK);
    px(ctx, ex + (ex < 32 ? 2 : -2), 28, 1, 1, 0xf0f0f0);
  }
  // 바늘 이빨 입
  oval(ctx, 32, 48, 10, 6, 0x1a0406);
  oval(ctx, 32, 48, 9, 5, BLACK);
  for (let x = 24; x <= 40; x += 2) {
    px(ctx, x, 43 + (x % 4 === 0 ? 0 : 1), 1, 2, 0xe8e4d8);
    px(ctx, x + 1, 52 - (x % 4 === 0 ? 0 : 1), 1, 2, 0xe8e4d8);
  }
  for (let i = 0; i < 24; i++) px(ctx, 16 + Math.floor(r() * 32), 18 + Math.floor(r() * 36), 1, 1, 0x8a98a0);
}

/** 손 하나 (얼굴용, 큰 것): 손바닥 가운데 (cx,cy), 손가락이 가리키는 방향 ang(라디안) */
function bigHand(ctx: Ctx, cx: number, cy: number, ang: number, s: number): void {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const vx = -uy;
  const vy = ux;
  const at = (a: number, b: number): [number, number] => [cx + ux * a * s + vx * b * s, cy + uy * a * s + vy * b * s];
  // 팔목 → 손바닥
  line(ctx, ...at(-14, 0), ...at(-2, 0), 0x9aa2a8, Math.round(5 * s));
  for (let b = -3; b <= 3; b++) line(ctx, ...at(-3, b), ...at(3, b), 0xc8ccd0, 2);
  // 길고 마른 손가락 넷 + 엄지
  const fingers: [number, number][] = [
    [-3, 10],
    [-1, 12],
    [1, 11],
    [3, 9],
  ];
  for (const [b, l] of fingers) {
    line(ctx, ...at(3, b), ...at(3 + l, b * 1.6), 0xc8ccd0, Math.max(1, Math.round(1.6 * s)));
    const tip = at(3 + l, b * 1.6);
    px(ctx, tip[0], tip[1], 2, 2, 0x3a2a2a);
  }
  line(ctx, ...at(0, -4), ...at(5, -9), 0xb8bcc0, Math.max(1, Math.round(1.6 * s)));
}

/** 벽 속의 손: 비명 지르는 얼굴을 사방에서 손들이 움켜쥔다 (손가락 사이로 눈 하나) */
function faceHands(ctx: Ctx): void {
  px(ctx, 0, 0, FACE, FACE, 0x050407);
  oval(ctx, 32, 34, 15, 20, 0x9aa4aa);
  oval(ctx, 32, 35, 13, 18, 0xb0b8bc);
  // 눈 하나 (다른 쪽은 손에 가렸다)
  oval(ctx, 40, 30, 5, 4, 0x4a3a3a);
  oval(ctx, 40, 30, 4, 3, 0xe8e4d8);
  px(ctx, 40, 30, 1, 1, BLACK);
  px(ctx, 37, 29, 1, 1, 0xb02020);
  px(ctx, 43, 31, 1, 1, 0xb02020);
  // 비명 지르는 입
  oval(ctx, 33, 47, 5, 7, 0x1a0406);
  oval(ctx, 33, 48, 4, 5, BLACK);
  // 손들
  bigHand(ctx, 12, 30, 0.1, 1.15);
  bigHand(ctx, 36, 2, Math.PI / 2 + 0.15, 1);
  bigHand(ctx, 56, 56, -2.4, 1.05);
  bigHand(ctx, 8, 58, -0.8, 0.9);
  bigHand(ctx, 62, 18, Math.PI - 0.2, 0.85);
}

/** 거울 속 그것: 금 간 유리 너머 귀까지 찢어진 웃음과 붉은 눈 */
function faceMirror(ctx: Ctx): void {
  const r = mulberry(41);
  px(ctx, 0, 0, FACE, FACE, 0x1c242c);
  for (let i = 0; i < 40; i++) px(ctx, Math.floor(r() * 64), Math.floor(r() * 64), 2, 1, 0x26303a);
  oval(ctx, 32, 26, 22, 20, HAIR);
  oval(ctx, 32, 33, 16, 21, 0x5a6268);
  oval(ctx, 32, 34, 14, 19, 0x6e767c);
  for (const ex of [24, 40]) {
    oval(ctx, ex, 28, 5, 4, BLACK);
    oval(ctx, ex, 28, 2, 2, 0xd02020);
    px(ctx, ex, 28, 1, 1, BLACK);
  }
  // 귀까지 찢어진 웃음 (이빨 사이가 까맣다)
  for (let x = 15; x <= 49; x++) {
    const t = (x - 32) / 17;
    const y = Math.round(42 - 6 * t * t);
    px(ctx, x, y - 1, 1, 6, BLACK);
    if (x > 16 && x < 48) px(ctx, x, y, 1, 4, x % 2 ? 0xe8e8e0 : 0xb8b8b0);
    if (x % 3 === 0) px(ctx, x, y, 1, 4, BLACK);
  }
  // 금
  const cx = 45;
  const cy = 17;
  for (const [ex, ey] of [
    [64, 6],
    [64, 34],
    [30, 0],
    [8, 22],
    [26, 64],
    [52, 64],
  ] as const) {
    const mx = (cx + ex) / 2 + (r() - 0.5) * 8;
    const my = (cy + ey) / 2 + (r() - 0.5) * 8;
    poly(ctx, [[cx, cy], [mx, my], [ex, ey]], 0xd8e0e8);
  }
  oval(ctx, cx, cy, 2, 2, 0xf0f4f8);
}

/** 목 꺾인 것: 옆으로 누운 얼굴 (그린 뒤 90° 돌린다), 한쪽 눈이 핏발 섰고 턱이 빠졌다 */
function faceBroken(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(FACE, FACE);
  const r = mulberry(51);
  px(ctx, 0, 0, FACE, FACE, 0x050407);
  // 늘어난 목과 꺾인 자국
  px(ctx, 26, 50, 12, 14, 0x8a968e);
  poly(ctx, [[26, 54], [31, 57], [27, 60], [33, 63]], 0x3a2a34, 2);
  oval(ctx, 32, 22, 21, 18, HAIR);
  oval(ctx, 32, 31, 15, 20, 0x94a098);
  oval(ctx, 32, 32, 13, 18, 0xa8b4ac);
  for (const [ex, red] of [
    [24, false],
    [40, true],
  ] as const) {
    oval(ctx, ex, 28, 6, 5, 0x3a3a40);
    oval(ctx, ex, 28, 5, 4, 0xf0ece0);
    px(ctx, ex, 28, 1, 1, BLACK);
    if (red) for (let i = 0; i < 6; i++) px(ctx, ex - 4 + Math.floor(r() * 8), 25 + Math.floor(r() * 6), 1, 1, 0xc02020);
  }
  // 빠진 턱
  oval(ctx, 30, 46, 6, 9, 0x1a0406);
  oval(ctx, 30, 47, 5, 7, BLACK);
  px(ctx, 26, 38, 2, 2, 0xd8d4c8);
  px(ctx, 32, 38, 2, 2, 0xd8d4c8);
  for (let i = 0; i < 26; i++) px(ctx, 19 + Math.floor(r() * 26), 16 + Math.floor(r() * 34), 1, 1, 0x7a867e);
  return rotCW(canvas);
}

/** 문틈의 눈: 화면을 채우는 핏발 선 눈 하나, 바늘구멍만 한 눈동자 */
function faceEye(ctx: Ctx): void {
  const r = mulberry(61);
  px(ctx, 0, 0, FACE, FACE, 0x5a4a44);
  for (let i = 0; i < 80; i++) px(ctx, Math.floor(r() * 64), Math.floor(r() * 64), 2, 1, r() < 0.5 ? 0x4a3a34 : 0x6a5a52);
  // 흰자 (아몬드 꼴)
  for (let x = 2; x <= 62; x++) {
    const t = (x - 32) / 30;
    const hh = Math.round(17 * (1 - t * t));
    px(ctx, x, 32 - hh, 1, hh * 2 + 1, 0xe8e2d4);
  }
  // 핏줄
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const sx = 32 + side * (16 + r() * 14);
    const sy = 32 + (r() - 0.5) * 20;
    poly(ctx, [[sx, sy], [sx - side * (4 + r() * 6), sy + (r() - 0.5) * 6], [32 + side * 14, 32 + (r() - 0.5) * 10]], 0xb02020);
  }
  oval(ctx, 32, 32, 14, 14, 0x3a2414);
  oval(ctx, 32, 32, 12, 12, 0x5a3a1c);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    line(ctx, 32 + Math.cos(a) * 5, 32 + Math.sin(a) * 5, 32 + Math.cos(a) * 11, 32 + Math.sin(a) * 11, i % 2 ? 0x6a4a24 : 0x4a2c14);
  }
  oval(ctx, 32, 32, 3, 3, BLACK);
  px(ctx, 36, 27, 3, 2, 0xffffff);
  // 눈꺼풀 테두리·속눈썹
  for (let x = 2; x <= 62; x++) {
    const t = (x - 32) / 30;
    const hh = Math.round(17 * (1 - t * t));
    px(ctx, x, 31 - hh, 1, 2, 0x1a100c);
    px(ctx, x, 32 + hh, 1, 1, 0x8a3030);
    if (x % 4 === 0 && x > 6 && x < 58) line(ctx, x, 30 - hh, x + (x < 32 ? -2 : 2), 25 - hh, 0x1a100c);
  }
}

/** 빛 밖의 그림자: 새까만 얼굴에 붉게 타는 눈, 들쭉날쭉한 이빨이 가득한 입 */
function faceShadow(ctx: Ctx): void {
  const r = mulberry(71);
  px(ctx, 0, 0, FACE, FACE, BLACK);
  oval(ctx, 32, 32, 26, 30, 0x0c0810);
  for (let i = 0; i < 40; i++) px(ctx, 6 + Math.floor(r() * 52), 2 + Math.floor(r() * 60), 2, 2, r() < 0.5 ? 0x000000 : 0x140c18);
  for (const [ex, d] of [
    [21, 1],
    [43, -1],
  ] as const) {
    oval(ctx, ex, 24, 8, 5, 0x3a0406);
    for (let i = -6; i <= 6; i++) px(ctx, ex + i, 24 + Math.round((i * d) / 3), 1, 3, 0xe02020);
    oval(ctx, ex, 25, 2, 1, 0xffc040);
  }
  // 입
  for (let x = 12; x <= 52; x++) {
    const t = (x - 32) / 20;
    const top = Math.round(40 - 3 * (1 - t * t));
    const bot = Math.round(46 + 10 * (1 - t * t));
    px(ctx, x, top, 1, bot - top, 0x2a0206);
  }
  for (let x = 14; x <= 50; x += 3) {
    const t = (x - 32) / 20;
    const top = Math.round(40 - 3 * (1 - t * t));
    const bot = Math.round(46 + 10 * (1 - t * t));
    const l1 = 3 + Math.floor(r() * 5);
    const l2 = 2 + Math.floor(r() * 5);
    for (let k = 0; k < l1; k++) px(ctx, x + (k > l1 / 2 ? 1 : 0), top + k, k < l1 - 1 ? 2 : 1, 1, 0xd8d0c0);
    for (let k = 0; k < l2; k++) px(ctx, x + 1, bot - 1 - k, k < l2 - 1 ? 2 : 1, 1, 0xc8c0b0);
  }
}

/** 마네킹: 매끈한 달걀 얼굴, 텅 빈 눈구멍, 칠한 듯 너무 긴 웃음, 갈라진 금 */
function faceMannequin(ctx: Ctx): void {
  px(ctx, 0, 0, FACE, FACE, 0x050407);
  oval(ctx, 32, 32, 19, 25, 0xb8a888);
  oval(ctx, 31, 31, 17, 23, 0xd8c8a8);
  oval(ctx, 26, 22, 5, 6, 0xe4d6b8);
  for (const ex of [24, 40]) {
    oval(ctx, ex, 30, 5, 4, 0x2a2018);
    oval(ctx, ex, 30, 4, 3, BLACK);
  }
  px(ctx, 41, 30, 1, 1, 0xf0f0f0);
  // 칠한 웃음
  for (let x = 19; x <= 45; x++) {
    const t = (x - 32) / 13;
    px(ctx, x, Math.round(46 - 3 * t * t), 1, 1, 0x8a2020);
  }
  // 금과 흘러내린 자국
  poly(ctx, [[36, 7], [38, 13], [35, 18], [40, 25]], 0x4a3a28);
  poly(ctx, [[40, 34], [42, 40], [39, 46], [41, 53]], 0x4a3a28);
  px(ctx, 40, 34, 1, 14, 0x2a1a10);
  px(ctx, 24, 34, 1, 6, 0x5a4a38);
  px(ctx, 13, 32, 2, 1, 0x8a7a60);
  px(ctx, 49, 32, 2, 1, 0x8a7a60);
}

/** 인형 머리: 금 간 도자기 얼굴, 한쪽 눈이 빠진 구멍, 붉은 리본 */
function faceDoll(ctx: Ctx): void {
  const r = mulberry(81);
  px(ctx, 0, 0, FACE, FACE, 0x0a0608);
  // 곱슬머리
  oval(ctx, 32, 26, 26, 22, 0x6a3a1a);
  for (let i = 0; i < 14; i++) {
    const a = Math.PI * (0.9 + (i / 13) * 1.2);
    oval(ctx, Math.round(32 + Math.cos(a) * 24), Math.round(30 + Math.sin(a) * 22), 3, 4, i % 2 ? 0x5a2e12 : 0x7a4622);
  }
  for (const sx of [8, 56]) for (let k = 0; k < 4; k++) oval(ctx, sx + (k % 2 ? 2 : -2), 34 + k * 7, 3, 3, k % 2 ? 0x5a2e12 : 0x7a4622);
  oval(ctx, 32, 35, 17, 19, 0xd8ccc4);
  oval(ctx, 32, 35, 16, 18, 0xf0e6dc);
  // 리본
  oval(ctx, 20, 12, 5, 3, 0x8a1020);
  oval(ctx, 30, 12, 5, 3, 0x8a1020);
  oval(ctx, 25, 12, 2, 2, 0xa02030);
  // 유리 눈 하나
  oval(ctx, 24, 32, 5, 5, 0xffffff);
  oval(ctx, 24, 32, 4, 4, 0x2a5aa0);
  oval(ctx, 24, 32, 2, 2, BLACK);
  px(ctx, 25, 30, 1, 1, 0xffffff);
  for (let x = 19; x <= 29; x += 2) line(ctx, x, 27, x + (x - 24) / 3, 24, 0x2a1a10);
  // 빠진 눈 구멍과 금
  oval(ctx, 40, 32, 5, 5, 0x1a0e0a);
  oval(ctx, 40, 32, 4, 4, BLACK);
  poly(ctx, [[44, 34], [48, 40], [45, 46], [49, 50]], 0x5a4a40);
  poly(ctx, [[37, 28], [35, 21], [38, 17]], 0x5a4a40);
  poly(ctx, [[41, 37], [40, 42], [42, 50]], 0x2a0a0a);
  // 볼·입술
  oval(ctx, 21, 41, 3, 2, 0xe8b0b0);
  oval(ctx, 32, 46, 3, 2, 0xa02030);
  px(ctx, 31, 46, 3, 1, BLACK);
  for (let i = 0; i < 12; i++) px(ctx, 20 + Math.floor(r() * 24), 22 + Math.floor(r() * 28), 1, 1, 0xe0d4ca);
}

function faceCanvas(look: GhostLook): HTMLCanvasElement {
  if (look === "hanger") return faceHanger();
  if (look === "broken") return faceBroken();
  const { canvas, ctx } = makeCanvas(FACE, FACE);
  switch (look) {
    case "crawler":
      faceCrawler(ctx);
      break;
    case "hands":
      faceHands(ctx);
      break;
    case "mirror":
      faceMirror(ctx);
      break;
    case "eye":
      faceEye(ctx);
      break;
    case "shadow":
      faceShadow(ctx);
      break;
    case "mannequin":
      faceMannequin(ctx);
      break;
    case "dollhead":
      faceDoll(ctx);
      break;
    default:
      faceSobok(ctx);
  }
  return canvas;
}

export const ghostTex = (look: GhostLook) => `haunt-ghost2-${look}`;
export const faceTex = (look: GhostLook) => `haunt-face-${look}`;

/** 귀신 그림·얼굴을 장면에 올린다 (이미 있으면 건너뛴다) */
export function ensureGhostTextures(scene: Phaser.Scene, looks: readonly GhostLook[]): void {
  for (const look of looks) {
    const key = ghostTex(look);
    if (!scene.textures.exists(key)) {
      const { w, h, n } = GHOST_SHEET[look];
      const tex = scene.textures.addCanvas(key, ghostSheet(look));
      if (tex) for (let i = 0; i < n; i++) tex.add(i, 0, i * w, 0, w, h);
    }
    const fk = faceTex(look);
    if (!scene.textures.exists(fk)) scene.textures.addCanvas(fk, faceCanvas(look));
  }
}
