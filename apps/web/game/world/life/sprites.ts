import * as Phaser from "phaser";
import { darken, Grid, lighten, makeCanvas, type Color } from "../../sprites/pixel";

// 22번 마을 생물 그림 (코드로 그리는 픽셀아트): 고양이 5색 × 자세, 꼬마 유령 3색, 황금 고블린, 망원경, 반짝이·별똥별.
// 처음 쓸 때 장면 텍스처에 한 번 올린다 (ensureLifeTextures).

export const LTEX = {
  cat: (v: number, f: CatFrame) => `life-cat-${v}-${f}`,
  ghost: (v: number, f: number) => `life-ghost-${v}-${f}`,
  dog: (v: number, f: DogFrame) => `life-dog-${v}-${f}`,
  goblin: (f: number) => `life-goblin-${f}`,
  telescope: "life-telescope",
  sparkle: "life-sparkle",
  heart: "life-heart",
  streak: "life-streak",
  zzz: "life-zzz",
} as const;

export type CatFrame = "walk0" | "walk1" | "sit" | "loaf" | "groom" | "sleep";
export const CAT_FRAMES: readonly CatFrame[] = ["walk0", "walk1", "sit", "loaf", "groom", "sleep"];
export const CAT_VARIANTS = 5;
export const GHOST_VARIANTS = 3;

type CatColors = { base: Color; mark: Color; belly: Color; eye: Color; patches?: Color };
const CAT_COLORS: readonly CatColors[] = [
  { base: 0xe8a04a, mark: 0xc0762c, belly: 0xf6dcb0, eye: 0x3a5a20 }, // 치즈
  { base: 0x2c2c34, mark: 0x3e3e4a, belly: 0x3a3a46, eye: 0xd8c040 }, // 까망
  { base: 0x8c929a, mark: 0x5c6068, belly: 0xd4d6da, eye: 0x4a6a30 }, // 고등어
  { base: 0xf2ece0, mark: 0xe0904a, belly: 0xffffff, eye: 0x3a5a20, patches: 0x3a3330 }, // 삼색
  { base: 0x26262e, mark: 0x26262e, belly: 0xf2f2f2, eye: 0x7ab040 }, // 턱시도
];
const OUT = 0x16121a;

// ── 강아지 (16×12, 오른쪽을 본다, 발은 맨 아래 줄). 0 백구(진돗개) · 1 누렁이 · 2 점박이 ──
export type DogFrame = "walk0" | "walk1" | "sit0" | "sit1" | "lie" | "sleep" | "sniff0" | "sniff1";
export const DOG_FRAMES: readonly DogFrame[] = ["walk0", "walk1", "sit0", "sit1", "lie", "sleep", "sniff0", "sniff1"];
type DogColors = { base: Color; ear: Color; muzzle: Color; spots?: Color; prick: boolean };
const DOG_COLORS: readonly DogColors[] = [
  { base: 0xf2ecdc, ear: 0xe2cfae, muzzle: 0xfffaf0, prick: true }, // 백구
  { base: 0xd09a52, ear: 0xa8743a, muzzle: 0xf0d6a8, prick: false }, // 누렁이
  { base: 0xf4f0e8, ear: 0x2e2a2a, muzzle: 0xffffff, spots: 0x3a3434, prick: false }, // 점박이
];
/** 강아지 그림 수 (DOG_COLORS + 비숑 우유) */
export const DOG_VARIANTS = DOG_COLORS.length + 1;
const BICHON = DOG_COLORS.length;

/** 우유 (비숑): 하얀 솜뭉치 몸, 동그란 머리털, 까만 눈·코, 짧은 다리, 등에 말린 꼬리 (16×12, 오른쪽을 본다) */
function bichon(f: DogFrame): HTMLCanvasElement {
  const g = new Grid(16, 12);
  const fur = 0xfbfaf6;
  const shade = 0xe6e0d6;
  const black = 0x1e1a1a;
  const fluff = (cx: number, cy: number, rx: number, ry: number) => {
    g.ellipse(cx, cy, rx, ry, fur);
    // 솜털 결: 아래쪽 가장자리에 옅은 그늘 몇 점
    g.recolor((x, y) => g.filled(x, y) && y > cy + ry * 0.4 && (x + y) % 3 === 0, shade);
  };
  // 동그란 머리털 + 얼굴 (cx, cy = 머리 가운데)
  const head = (cx: number, cy: number, closed = false) => {
    fluff(cx, cy, 3.1, 2.9);
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (closed) g.hline(x, x + 1, y, 0x8a7f78);
    else {
      // 까만 눈 두 개 (살짝 옆모습)
      g.set(x, y - 1, black);
      g.set(x + 2, y - 1, black);
    }
    g.set(x + 3, y + 1, black); // 코
    g.set(x - 2, y + 1, shade); // 처진 귀털
    g.set(x - 2, y + 2, shade);
  };
  // 등 위로 말린 꼬리 (wag면 좌우로)
  const tail = (x: number, y: number, wag: 0 | 1) => {
    g.set(x, y, fur);
    g.set(x - 1 + wag, y - 1, fur);
    g.set(x + wag, y - 2, fur);
    g.set(x + 1, y - 1, shade);
  };
  if (f === "walk0" || f === "walk1" || f === "sniff0" || f === "sniff1") {
    const sniff = f.startsWith("sniff");
    const step = f === "walk1" ? 1 : 0;
    fluff(7, 7.5, 4.4, 2.8);
    const legs = step ? [5, 9] : [4, 10];
    for (const x of legs) g.vline(x, 10, 11, fur);
    g.vline(legs[0] + 1, 10, 11, shade);
    g.vline(legs[1] + 1, 10, 11, shade);
    head(sniff ? 11.6 : 11.2, sniff ? 7.6 : 4.6);
    tail(3, 5, sniff ? (f === "sniff1" ? 1 : 0) : step);
  } else if (f === "sit0" || f === "sit1") {
    fluff(7, 8, 3.4, 3.2);
    g.vline(8, 10, 11, fur);
    g.vline(10, 10, 11, fur);
    head(9.2, 4.2);
    tail(4, 7, f === "sit1" ? 1 : 0);
  } else {
    // 엎드리기·낮잠: 납작한 솜뭉치
    fluff(7, 9, 5, 2.3);
    head(11.4, f === "sleep" ? 8.6 : 7.6, f === "sleep");
    g.hline(12, 15, 11, fur);
    tail(3, 8, 0);
  }
  g.outline(0x6a5f58, false, 200);
  return g.toCanvas();
}

function dog(v: number, f: DogFrame): HTMLCanvasElement {
  if (v === BICHON) return bichon(f);
  const c = DOG_COLORS[v % DOG_COLORS.length];
  const g = new Grid(16, 12);
  const nose = 0x2a2020;
  const eye = 0x2a2018;
  // 머리: (hx, hy) 가운데, 주둥이는 오른쪽
  const head = (hx: number, hy: number, closed = false) => {
    g.ellipse(hx, hy, 2.3, 2.1, c.base);
    const y = Math.round(hy);
    g.rect(Math.round(hx) + 2, y, 2, 2, c.muzzle);
    g.set(Math.round(hx) + 3, y, nose);
    if (closed) g.hline(Math.round(hx), Math.round(hx) + 1, y, darken(c.base, 0.45));
    else g.set(Math.round(hx) + 1, y - 1, eye);
    // 귀: 백구는 쫑긋, 나머지는 축 처진 귀
    const ex = Math.round(hx) - 1;
    if (c.prick) {
      g.set(ex, y - 3, c.ear);
      g.set(ex, y - 2, c.ear);
      g.set(ex + 1, y - 2, c.ear);
    } else {
      g.set(ex - 1, y - 1, c.ear);
      g.set(ex - 1, y, c.ear);
      g.set(ex, y - 2, c.ear);
      g.set(ex - 1, y + 1, c.ear);
    }
  };
  // 꼬리: up = 말아 올린 꼬리(흔들면 좌우), down = 바닥에 늘어진 꼬리
  const tail = (x: number, y: number, wag: 0 | 1, up: boolean) => {
    if (up) {
      g.set(x, y, c.base);
      g.set(x - 1 + wag, y - 1, c.base);
      g.set(x - 1 + wag * 2, y - 2, c.base);
    } else {
      g.set(x, y, c.base);
      g.set(x - 1, y - wag, c.base);
      g.set(x - 2, y - wag * 2, c.base);
    }
  };
  if (f === "walk0" || f === "walk1" || f === "sniff0" || f === "sniff1") {
    const sniff = f.startsWith("sniff");
    const step = f === "walk1" ? 1 : 0;
    g.ellipse(7, 6.5, 4.6, 2.3, c.base);
    g.hline(5, 9, 8, c.muzzle);
    const legs = sniff ? [4, 6, 9, 10] : step ? [4, 7, 8, 11] : [3, 6, 9, 10];
    for (const x of legs) g.vline(x, 8, 11, c.base);
    head(sniff ? 12.5 : 12, sniff ? 7.5 : 4.2);
    tail(2, 5, sniff ? (f === "sniff1" ? 1 : 0) : (step as 0 | 1), true);
  } else if (f === "sit0" || f === "sit1") {
    g.ellipse(7, 7.5, 3, 3.2, c.base);
    g.rect(7, 7, 3, 3, c.muzzle);
    g.ellipse(5, 9.8, 2.2, 1.6, c.base); // 뒷다리
    g.vline(8, 9, 11, c.base);
    g.vline(10, 9, 11, c.base);
    head(9.5, 3.6);
    tail(3, 10, f === "sit1" ? 1 : 0, false);
  } else {
    // 엎드리기·낮잠: 납작하게, 앞발은 앞으로
    g.ellipse(7, 9, 5, 2.1, c.base);
    head(11.5, f === "sleep" ? 8.6 : 7.4, f === "sleep");
    g.hline(11, 15, 11, c.base);
    tail(2, 10, 0, false);
  }
  if (c.spots) g.recolor((x, y) => g.filled(x, y) && x < 10 && ((x * 7 + y * 5) % 13 === 0 || (x * 3 + y * 11) % 17 === 0), c.spots);
  g.outline(OUT, false, 200);
  return g.toCanvas();
}

/** 고양이 한 장 (16×12, 오른쪽을 본다, 발은 맨 아래 줄) */
function cat(v: number, f: CatFrame): HTMLCanvasElement {
  const c = CAT_COLORS[v % CAT_COLORS.length];
  const g = new Grid(16, 12);
  const ear = (x: number, y: number) => {
    g.set(x, y, c.base);
    g.set(x, y + 1, c.base);
  };
  if (f === "walk0" || f === "walk1") {
    g.ellipse(7.5, 7, 4.6, 2.4, c.base);
    g.ellipse(12, 5, 2.4, 2.2, c.base);
    ear(10, 2);
    ear(13, 2);
    // 꼬리 (위로 살짝)
    g.set(3, 6, c.base);
    g.set(2, 5, c.base);
    g.set(2, 4, c.base);
    g.set(1, 3, c.base);
    const legs = f === "walk0" ? [4, 6, 9, 11] : [5, 7, 8, 10];
    for (const x of legs) {
      g.set(x, 9, c.base);
      g.set(x, 10, c.base);
    }
    g.hline(5, 10, 8, c.belly);
    g.set(13, 5, c.eye);
    g.set(14, 6, darken(c.base, 0.3));
    for (const x of [6, 8, 10]) g.set(x, 5, c.mark);
  } else if (f === "sit") {
    g.ellipse(7.5, 8, 3.2, 3.2, c.base);
    g.ellipse(8.5, 4, 2.6, 2.4, c.base);
    ear(6, 1);
    ear(10, 1);
    g.rect(6, 8, 4, 3, c.belly);
    g.set(7, 4, c.eye);
    g.set(10, 4, c.eye);
    g.set(9, 5, darken(c.base, 0.35));
    // 꼬리를 앞발에 감는다
    g.hline(10, 13, 10, c.base);
    g.set(13, 9, c.base);
    g.set(7, 11, c.base);
    g.set(9, 11, c.base);
  } else {
    // 식빵·그루밍·낮잠: 납작하게 엎드림
    g.ellipse(7, 8.5, 5, 2.4, c.base);
    const hx = f === "sleep" ? 11 : 12;
    const hy = f === "sleep" ? 8 : f === "groom" ? 6 : 6.5;
    g.ellipse(hx, hy, 2.4, 2.2, c.base);
    ear(hx - 2, Math.round(hy) - 3);
    ear(hx + 1, Math.round(hy) - 3);
    g.hline(2, 3, 10, c.base);
    g.set(1, 9, c.base);
    for (const x of [5, 7, 9]) g.set(x, 7, c.mark);
    if (f === "sleep") {
      g.hline(hx, hx + 1, Math.round(hy), darken(c.base, 0.45));
    } else {
      g.set(hx + 1, Math.round(hy) - 0, c.eye);
      if (f === "groom") {
        g.set(hx + 2, Math.round(hy) + 2, 0xe07080); // 혀
        g.set(hx + 1, Math.round(hy) + 2, c.base); // 들어 올린 앞발
        g.set(hx + 1, Math.round(hy) + 1, c.base);
      }
    }
    g.hline(9, 13, 10, c.base); // 앞발
  }
  if (c.patches) {
    // 삼색이: 검은 무늬 몇 점
    g.recolor((x, y) => g.filled(x, y) && ((x * 7 + y * 3) % 11 === 0 || (x > 3 && x < 6 && y > 5 && y < 8)), c.patches);
    g.recolor((x, y) => g.filled(x, y) && (x * 5 + y * 2) % 9 === 0, c.mark);
  }
  g.outline(OUT, false, 200);
  return g.toCanvas();
}

type GhostColors = { body: Color; cheek: Color };
const GHOST_COLORS: readonly GhostColors[] = [
  { body: 0xe6eeff, cheek: 0xf2b8c6 },
  { body: 0xfff2c4, cheek: 0xf0b070 },
  { body: 0xd2f0d8, cheek: 0xb8e0a0 },
];

/** 꼬마 유령 (11×13, 2장: 꼬리 물결) */
function ghost(v: number, f: number): HTMLCanvasElement {
  const c = GHOST_COLORS[v % GHOST_COLORS.length];
  const g = new Grid(11, 13);
  g.ellipse(5.5, 5, 4.4, 4.4, c.body);
  g.rect(1, 5, 9, 5, c.body);
  const tips = f === 0 ? [1, 3, 5, 7, 9] : [2, 4, 6, 8];
  for (const x of tips) g.set(x, 10, c.body);
  for (const x of tips) if (x % 4 === 1) g.set(x, 11, c.body);
  g.set(3, 4, 0x2a2a40);
  g.set(7, 4, 0x2a2a40);
  g.set(5, 6, 0x2a2a40);
  g.set(2, 5, c.cheek);
  g.set(8, 5, c.cheek);
  g.set(3, 2, lighten(c.body, 0.6));
  g.outline(darken(c.body, 0.45), false, 150);
  return g.toCanvas();
}

/** 황금 고블린(보너스 요정) (15×16, 3장: 서 있기·달리기 2). 넥타이를 맨 사무실 요정이 보너스 주머니를 든다 */
function goblin(f: number): HTMLCanvasElement {
  const gold = 0xf2c84b;
  const hi = 0xfff0a0;
  const sh = 0xc8962a;
  const g = new Grid(15, 16);
  // 머리 + 뾰족 귀
  g.ellipse(7, 5, 3.6, 3.2, gold);
  for (let i = 0; i < 3; i++) {
    g.set(2 - (i === 2 ? 1 : 0), 3 + i, gold);
    g.set(12 + (i === 2 ? 1 : 0), 3 + i, gold);
  }
  g.set(1, 3, gold);
  g.set(13, 3, gold);
  // 몸 (셔츠 + 넥타이)
  g.rect(5, 8, 5, 4, 0xf4f0e6);
  g.vline(7, 8, 11, 0xc0392b);
  g.set(7, 8, 0xe05040);
  // 다리
  if (f === 0) {
    g.vline(5, 12, 14, sh);
    g.vline(9, 12, 14, sh);
  } else if (f === 1) {
    g.set(4, 12, sh);
    g.set(4, 13, sh);
    g.set(3, 14, sh);
    g.set(10, 12, sh);
    g.set(10, 13, sh);
    g.set(11, 13, sh);
  } else {
    g.set(5, 12, sh);
    g.set(6, 13, sh);
    g.set(6, 14, sh);
    g.set(9, 12, sh);
    g.set(8, 13, sh);
    g.set(8, 14, sh);
  }
  // 보너스 주머니 (오른손)
  g.ellipse(11.5, 10.5, 1.8, 1.8, 0xd8a838);
  g.set(11, 9, 0x8a5a20);
  g.set(12, 10, hi);
  // 얼굴
  g.set(5, 5, 0x1a1208);
  g.set(9, 5, 0x1a1208);
  g.hline(6, 8, 7, sh);
  g.set(6, 3, hi);
  g.set(7, 2, hi);
  g.outline(0x5a3a10, false, 230);
  return g.toCanvas();
}

/** 망원경 (18×24, 받침 가운데 아래). 놋쇠 경통이 하늘(오른쪽 위)을 본다 */
function telescope(): HTMLCanvasElement {
  const g = new Grid(18, 24);
  const wood = 0x5a4030;
  // 삼각대
  for (let i = 0; i < 11; i++) {
    g.set(9 - Math.round(i * 0.45), 12 + i, wood);
    g.set(9 + Math.round(i * 0.45), 12 + i, wood);
    g.set(9, 12 + Math.min(i, 9), darken(wood, 0.2));
  }
  // 경통 (비스듬히)
  for (let i = 0; i < 12; i++) {
    const x = 3 + i;
    const y = 12 - Math.round(i * 0.75);
    g.set(x, y, 0xc8a050);
    g.set(x, y + 1, 0xa07830);
    g.set(x, y - 1, 0xe8c878);
  }
  g.rect(14, 1, 3, 3, 0xd8b060); // 대물렌즈 테
  g.set(15, 2, 0x9ad0f0);
  g.rect(2, 11, 2, 3, 0x3a3a40); // 접안렌즈
  g.outline(OUT, false, 200);
  return g.toCanvas();
}

/** 반짝이 별 (5×5) */
function sparkle(): HTMLCanvasElement {
  const g = new Grid(5, 5);
  g.vline(2, 0, 4, 0xfff6c0);
  g.hline(0, 4, 2, 0xfff6c0);
  g.set(2, 2, 0xffffff);
  return g.toCanvas();
}

/** 하트 (7×6) */
function heart(): HTMLCanvasElement {
  const g = new Grid(7, 6);
  const c = 0xf27a9a;
  g.hline(1, 2, 0, c);
  g.hline(4, 5, 0, c);
  g.hline(0, 6, 1, c);
  g.hline(0, 6, 2, c);
  g.hline(1, 5, 3, c);
  g.hline(2, 4, 4, c);
  g.set(3, 5, c);
  g.set(1, 1, 0xffc8d8);
  return g.toCanvas();
}

/** 졸음 표시 z (5×5) */
function zzz(): HTMLCanvasElement {
  const g = new Grid(5, 5);
  g.hline(0, 4, 0, 0xdce6f4);
  g.set(3, 1, 0xdce6f4);
  g.set(2, 2, 0xdce6f4);
  g.set(1, 3, 0xdce6f4);
  g.hline(0, 4, 4, 0xdce6f4);
  return g.toCanvas();
}

/** 별똥별 꼬리 (40×3, 오른쪽 끝이 머리) */
function streak(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(40, 3);
  const grad = ctx.createLinearGradient(0, 0, 40, 0);
  grad.addColorStop(0, "rgba(180,200,255,0)");
  grad.addColorStop(0.8, "rgba(220,230,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 1, 40, 1);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(36, 0, 4, 3);
  return canvas;
}

export function ensureLifeTextures(scene: Phaser.Scene): void {
  const tx = scene.textures;
  if (tx.exists(LTEX.telescope)) return;
  for (let v = 0; v < CAT_VARIANTS; v++) for (const f of CAT_FRAMES) tx.addCanvas(LTEX.cat(v, f), cat(v, f));
  for (let v = 0; v < DOG_VARIANTS; v++) for (const f of DOG_FRAMES) tx.addCanvas(LTEX.dog(v, f), dog(v, f));
  for (let v = 0; v < GHOST_VARIANTS; v++) for (let f = 0; f < 2; f++) tx.addCanvas(LTEX.ghost(v, f), ghost(v, f));
  for (let f = 0; f < 3; f++) tx.addCanvas(LTEX.goblin(f), goblin(f));
  tx.addCanvas(LTEX.telescope, telescope());
  tx.addCanvas(LTEX.sparkle, sparkle());
  tx.addCanvas(LTEX.heart, heart());
  tx.addCanvas(LTEX.zzz, zzz());
  tx.addCanvas(LTEX.streak, streak());
}
