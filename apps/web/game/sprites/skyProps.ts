import { darken, Grid, lighten, type Color } from "./pixel";

// 놀이기구 2 (관람차·열기구) 픽셀아트 (코드 생성). 텍스처는 SkyRides가 처음 쓸 때 등록한다 (ensureSkyTextures).
//  - 관람차: 다리·발판(고정) + 바퀴 테·살(돌아가는 프레임 SPOKE_FRAMES장, 살 12개라 30°마다 같은 모양) + 칸(뒤 판·앞 판으로 나눠 앉은 사람을 가운데에)
//  - 열기구: 풍선·밧줄(위) + 바구니(뒤 판·앞 판) + 버너 불꽃 2프레임 + 땅 그림자 + 출발장 바닥·팻말

const OUT = 0x1f1d1a;
const STEEL = { hi: 0xa8adb8, mid: 0x7d8290, lo: 0x50545e, line: 0x2a2c33 };
const WOOD = { hi: 0x9a7854, mid: 0x7d5e40, lo: 0x5c432d, line: 0x2e2219 };
const WICKER = { hi: 0xc8a068, mid: 0xa47c48, lo: 0x7a5a32, line: 0x3e2c18 };

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
}

export const SKY_TEX = {
  ferrisFrame: "sky-ferris-frame",
  ferrisWheel: "sky-ferris-wheel",
  carBack: (v: number) => `sky-car-back-${v}`,
  carFront: (v: number) => `sky-car-front-${v}`,
  balloonTop: (v: number) => `sky-balloon-top-${v}`,
  basketBack: "sky-basket-back",
  basketFront: "sky-basket-front",
  flame: "sky-flame",
  shadow: "sky-shadow",
  pad: "sky-pad",
  sign: "sky-sign",
} as const;

// ── 관람차 ──
export const FERRIS_FRAME_W = 64;
export const FERRIS_FRAME_H = 66;
/** 다리·받침: 원점 = 아래 가운데 (받침 바닥). 바퀴 축은 위로 58px (FERRIS_FRAME_H − 1 − 58 = 7, skyMath.WHEEL_HUB_H) */
export function ferrisFrame(): HTMLCanvasElement {
  const W = FERRIS_FRAME_W;
  const H = FERRIS_FRAME_H;
  const g = new Grid(W, H);
  const cx = 32;
  const hubY = H - 1 - 58;
  // 다리 (A자 두 개가 겹쳐 보인다)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) line(g, cx + s * (1 + k), hubY + 1, cx + s * (22 + k), H - 4, k ? STEEL.lo : STEEL.mid);
    line(g, cx + s * 3, hubY + 3, cx + s * 18, H - 4, STEEL.lo);
  }
  // 가로대
  for (let x = cx - 15; x <= cx + 15; x++) g.set(x, hubY + 36, STEEL.mid);
  for (let x = cx - 9; x <= cx + 9; x++) g.set(x, hubY + 22, STEEL.lo);
  // 발 받침 돌
  for (const s of [-1, 1]) g.rect(cx + s * 22 - 3, H - 4, 7, 4, 0x8e8b84);
  // 타는 곳 발판 (나무, 계단 두 칸)
  g.rect(cx - 13, H - 7, 26, 4, WOOD.mid);
  g.hline(cx - 13, cx + 12, H - 7, WOOD.hi);
  for (let x = cx - 12; x < cx + 13; x += 5) g.vline(x, H - 6, H - 4, WOOD.lo);
  g.rect(cx - 9, H - 3, 18, 3, WOOD.lo);
  g.hline(cx - 9, cx + 8, H - 3, WOOD.mid);
  g.outline(OUT);
  return g.toCanvas();
}

export const WHEEL_SIZE = 76;
/** 바퀴 프레임 수 (3°씩, 살 12개라 30°면 같은 모양) */
export const SPOKE_FRAMES = 10;
export const SPOKE_STEP = (3 / 180) * Math.PI;
/** 바퀴 테·살 (원점 = 가운데 축). 프레임 f = 살이 f×3° 돌아간 모습 */
export function ferrisWheelSheet(): HTMLCanvasElement {
  const S = WHEEL_SIZE;
  const sheet = new Grid(S * SPOKE_FRAMES, S);
  const R = 34;
  for (let f = 0; f < SPOKE_FRAMES; f++) {
    const g = new Grid(S, S);
    const c = S / 2;
    const rot = f * SPOKE_STEP;
    // 살 12개 (테 안쪽 고리와 바깥 테 사이는 두 갈래)
    for (let k = 0; k < 12; k++) {
      const a = rot + (k / 12) * Math.PI * 2;
      const sx = Math.sin(a);
      const sy = Math.cos(a);
      line(g, c + sx * 4, c + sy * 4, c + sx * (R - 1), c + sy * (R - 1), k % 2 ? 0xb8b0a0 : 0xd0c8b8);
    }
    // 안쪽 고리
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      g.set(Math.round(c + Math.sin(a) * 21), Math.round(c + Math.cos(a) * 21), 0xa89f90);
    }
    // 바깥 테 (두 줄, 위쪽이 밝다)
    for (let i = 0; i < 320; i++) {
      const a = (i / 320) * Math.PI * 2;
      const lit = Math.cos(a) < 0 ? 0xf0e8d8 : 0xd8cfbe;
      g.set(Math.round(c + Math.sin(a) * R), Math.round(c + Math.cos(a) * R), lit);
      g.set(Math.round(c + Math.sin(a) * (R - 1)), Math.round(c + Math.cos(a) * (R - 1)), 0xb0a798);
    }
    // 테의 꼬마전구 (살 끝마다, 바퀴와 함께 돈다)
    for (let k = 0; k < 12; k++) {
      const a = rot + (k / 12) * Math.PI * 2 + Math.PI / 12;
      g.set(Math.round(c + Math.sin(a) * R), Math.round(c + Math.cos(a) * R), k % 2 ? 0xffe27a : 0xff9ad0);
    }
    // 축
    g.ellipse(c, c, 4, 4, STEEL.mid);
    g.ellipse(c - 0.5, c - 0.5, 2, 2, STEEL.hi);
    g.set(c, c, STEEL.line);
    g.outline(OUT);
    sheet.draw(g, f * S, 0);
  }
  return sheet.toCanvas();
}

export const CAR_W = 20;
export const CAR_H = 22;
/** 칸 색 (칸마다) */
export const CAR_COLORS: readonly Color[] = [0xd8505a, 0x4f8fd0, 0xe8b440, 0x58b080, 0xb070c8, 0xe88840];
/** 칸: 원점 = 위 가운데 (바퀴 테에 매달린 점). back = 지붕·안쪽·뒷벽 (사람 뒤), front = 앞 판·기둥 (사람 앞) */
export function ferrisCar(color: Color, layer: "back" | "front"): HTMLCanvasElement {
  const g = new Grid(CAR_W, CAR_H);
  const c = { hi: lighten(color, 0.25), mid: color, lo: darken(color, 0.3) };
  // 앉은 사람 발 = 위에서 18px (skyMath.CAR_FEET_DY). 지붕 아래 창으로 머리·어깨가 보이고 앞 판이 아래를 가린다
  if (layer === "back") {
    g.rect(9, 0, 2, 3, STEEL.lo); // 고리
    // 지붕 (둥글게)
    g.hline(5, 14, 2, c.hi);
    g.hline(3, 16, 3, c.mid);
    g.hline(2, 17, 4, c.lo);
    // 안쪽 (어둡게)
    g.rect(3, 5, 14, 11, 0x2a2834);
    g.hline(3, 16, 5, 0x3a3846);
    // 뒷벽 아래
    g.rect(2, 16, 16, 5, c.lo);
    g.outline(OUT);
  } else {
    // 기둥
    g.vline(2, 5, 20, c.mid);
    g.vline(17, 5, 20, c.lo);
    // 앞 판 (줄무늬)
    g.rect(2, 13, 16, 8, c.mid);
    g.hline(2, 17, 13, c.hi);
    g.hline(3, 16, 16, 0xf2ead8);
    g.hline(2, 17, 20, c.lo);
    g.outline(OUT);
  }
  return g.toCanvas();
}

// ── 열기구 ──
export const BALLOON_W = 36;
export const BALLOON_TOP_H = 54;
/** 풍선 색 (기구마다 두 가지 줄무늬) */
export const BALLOON_COLORS: readonly [Color, Color][] = [
  [0xd84a4a, 0xf0e2c0],
  [0x3f78c8, 0xf0c848],
];
/** 풍선 + 밧줄: 원점 = 아래 가운데 (바구니 윗변) */
export function balloonTop(colors: readonly [Color, Color]): HTMLCanvasElement {
  const W = BALLOON_W;
  const H = BALLOON_TOP_H;
  const g = new Grid(W, H);
  const cx = W / 2;
  const half = (y: number) => {
    if (y <= 17) return 17 * Math.sqrt(Math.max(0, 1 - ((y - 17) / 17.5) ** 2));
    return 17 - ((y - 17) / 23) * 11.5; // 아래로 갈수록 좁아진다 (y = 40에서 5.5)
  };
  for (let y = 0; y <= 40; y++) {
    const w = half(y + 0.5);
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > w) continue;
      const k = dx / Math.max(1, w); // −1..1
      const gore = Math.floor((k + 1) * 3.0001);
      let col = gore % 2 === 0 ? colors[0] : colors[1];
      // 왼쪽 위가 밝고 오른쪽이 어둡다
      const shade = k * 0.45 + (y / 40) * 0.25;
      col = shade > 0.2 ? darken(col, Math.min(0.45, shade - 0.05)) : shade < -0.2 ? lighten(col, Math.min(0.3, -shade - 0.1)) : col;
      g.set(x, y, col);
    }
  }
  // 반짝임
  g.rect(9, 7, 2, 4, 0xffffff, 140);
  g.set(11, 6, 0xffffff, 140);
  // 아랫자락 (치마)
  g.rect(cx - 5, 41, 10, 3, 0x5a3a2a);
  g.hline(cx - 5, cx + 4, 41, 0x7a5238);
  g.outline(OUT);
  // 밧줄 (치마 → 바구니 네 귀퉁이)
  const rope = 0x6a5440;
  line(g, cx - 5, 44, cx - 9, H - 1, rope);
  line(g, cx + 4, 44, cx + 8, H - 1, rope);
  line(g, cx - 2, 44, cx - 4, H - 1, darken(rope, 0.25));
  line(g, cx + 1, 44, cx + 3, H - 1, darken(rope, 0.25));
  return g.toCanvas();
}

export const BASKET_W = 20;
export const BASKET_H = 12;
/** 바구니: 원점 = 아래 가운데. back = 뒷벽 (사람 뒤), front = 앞벽 아래쪽 (사람 다리를 가린다) */
export function basket(layer: "back" | "front"): HTMLCanvasElement {
  const g = new Grid(BASKET_W, BASKET_H);
  const weave = (x: number, y: number) => ((x >> 1) + y) % 2 === 0 ? WICKER.mid : WICKER.lo;
  if (layer === "back") {
    for (let y = 1; y < BASKET_H - 1; y++) for (let x = 2; x < BASKET_W - 2; x++) g.set(x, y, darken(weave(x, y), 0.25));
    g.hline(2, BASKET_W - 3, 0, 0x3a2414);
    g.hline(2, BASKET_W - 3, 1, 0x5a3820);
  } else {
    for (let y = 5; y < BASKET_H; y++) for (let x = 1; x < BASKET_W - 1; x++) g.set(x, y, weave(x, y));
    g.hline(1, BASKET_W - 2, 4, 0x3a2414);
    g.hline(1, BASKET_W - 2, 5, 0x6a4428);
    g.hline(2, BASKET_W - 3, BASKET_H - 1, WICKER.lo);
    g.recolor((x, y) => y === 7 && x % 3 === 0, WICKER.hi);
  }
  g.outline(OUT);
  return g.toCanvas();
}

export const FLAME_W = 6;
export const FLAME_H = 9;
/** 버너 불꽃 2프레임 (원점 = 아래 가운데) */
export function flameSheet(): HTMLCanvasElement {
  const sheet = new Grid(FLAME_W * 2, FLAME_H);
  for (let f = 0; f < 2; f++) {
    const g = new Grid(FLAME_W, FLAME_H);
    g.ellipse(3, 6, 2.6, 3, 0xff8a20);
    g.ellipse(3, 4 - f, 1.6, 2.6, 0xffc040);
    g.ellipse(3, 5, 0.9, 1.6, 0xfff2b0);
    g.set(2 + f, 0, 0xffc040);
    sheet.draw(g, f * FLAME_W, 0);
  }
  return sheet.toCanvas();
}

/** 땅 그림자 (가운데 원점) */
export function skyShadow(): HTMLCanvasElement {
  const g = new Grid(26, 8);
  g.ellipse(13, 4, 12.5, 3.6, 0x000000, 70);
  g.ellipse(13, 4, 8, 2.4, 0x000000, 90);
  return g.toCanvas();
}

/** 출발장 바닥 (둥근 나무 발판에 칠한 고리, 가운데 원점) */
export function balloonPad(): HTMLCanvasElement {
  const g = new Grid(50, 24);
  g.ellipse(25, 12, 24, 11, WOOD.lo);
  g.ellipse(25, 11.5, 23, 10, WOOD.mid);
  for (let y = 2; y < 22; y += 3) for (let x = 2; x < 48; x++) if (g.filled(x, y) && (x + y) % 7 !== 0) g.set(x, y, WOOD.lo);
  // 칠한 고리
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    g.set(Math.round(25 + Math.sin(a) * 15), Math.round(11.5 + Math.cos(a) * 6.5), 0xe8d8a8);
  }
  g.outline(WOOD.line);
  return g.toCanvas();
}

/** 출발장 팻말 (작은 열기구 그림, 원점 = 아래 가운데) */
export function balloonSign(): HTMLCanvasElement {
  const g = new Grid(16, 24);
  g.rect(7, 12, 2, 12, WOOD.lo);
  g.rect(1, 1, 14, 12, WOOD.mid);
  g.hline(1, 14, 1, WOOD.hi);
  g.ellipse(8, 5.5, 3.5, 3.5, 0xd84a4a);
  g.rect(7, 8, 2, 1, 0x5a3a2a);
  g.rect(6, 10, 4, 2, WICKER.mid);
  g.set(6, 6, 0xf0e2c0);
  g.outline(OUT);
  return g.toCanvas();
}
