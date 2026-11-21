import { darken, Grid, type Color } from "../sprites/pixel";

// 11/20 판교 회장님 도트 (Phaser 없이 — 싸움 텍스처 game/chairman/art 와 입장 창 초상 components/chairman 이 같이 쓴다)

export const OUT = 0x141218;

export function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 400; n++) {
    g.set(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

const rgb = (g: Grid, x: number, y: number) => g.get(x, y) >>> 8;

// ───────── 판교 회장님 ─────────

export const VEST = { hi: 0x5a6a86, mid: 0x45526a, lo: 0x323c50 };
export const SHIRT = { hi: 0xc4d6e8, mid: 0xa8c0d8, lo: 0x8aa2bc };
export const SKIN = { hi: 0xf8dcc4, mid: 0xf0cbaa, lo: 0xd8ac8c };
export const HAIR = { hi: 0xf2f0f6, mid: 0xd8d6e0, lo: 0xa8a2b8 };

export type Pose = {
  f?: number;
  crouch?: number;
  step?: number;
  lean?: number;
  arms?: [number, number, number, number];
  brow?: number;
  mouth?: number;
  glint?: number;
  red?: number;
  hurt?: boolean;
  blink?: boolean;
  sweat?: boolean;
  prop?: "tumbler" | "stylus" | "phone" | "folder" | "finger" | "capsule" | "mic" | "clock";
  ang?: number;
};

export const POSES: Record<string, Pose> = {
  idle0: { prop: "tumbler", arms: [6, 36, 34, 34] },
  idle1: { f: 1, prop: "tumbler", arms: [6, 36, 34, 34] },
  walk0: { step: 0 },
  walk1: { step: 1 },
  walk2: { step: 2 },
  walk3: { step: 3 },
  castUp: { arms: [9, 8, 31, 8], brow: 1, mouth: 2 },
  castRed: { arms: [9, 6, 31, 6], brow: 1, mouth: 2, glint: 2, red: 1 },
  throw: { arms: [4, 30, 38, 26], mouth: 2, brow: 1 },
  throwFolder: { arms: [6, 34, 32, 12], prop: "folder", brow: 1, mouth: 1 },
  point: { arms: [6, 36, 39, 26], prop: "finger", brow: 1, mouth: 2 },
  armsWide: { arms: [0, 22, 40, 22], mouth: 2 },
  dash: { lean: 2, arms: [4, 36, 38, 34], brow: 1, mouth: 1, step: 1 },
  slam: { crouch: 1, arms: [11, 42, 29, 42], brow: 1, red: 1, mouth: 2 },
  crouch: { crouch: 2, arms: [7, 38, 33, 38], brow: 1, red: 1 },
  jump: { arms: [11, 4, 29, 4], brow: 1, mouth: 1 },
  stylus: { arms: [6, 36, 33, 16], prop: "stylus", ang: -1.0, glint: 1 },
  stylusDown: { arms: [6, 36, 37, 30], prop: "stylus", ang: 0.6, mouth: 1 },
  phone: { arms: [6, 36, 30, 18], prop: "phone", mouth: 1 },
  capsule: { arms: [6, 36, 34, 14], prop: "capsule", mouth: 2 },
  sweat: { arms: [4, 26, 36, 26], mouth: 1, sweat: true },
  hurt: { hurt: true, mouth: 1 },
  laugh: { mouth: 2, f: 1, blink: true, prop: "tumbler", arms: [6, 36, 34, 34] },
  flip: { arms: [4, 12, 36, 12], brow: 1, mouth: 2, red: 1, crouch: 1 },
  mic: { arms: [3, 14, 30, 22], prop: "mic", mouth: 2, brow: 1 },
  clock: { arms: [6, 36, 33, 14], prop: "clock", brow: 1, mouth: 1 },
};
export const POSE_NAMES = Object.keys(POSES);
export type PoseName = keyof typeof POSES;
export const BOSS_W = 40;
export const BOSS_H = 50;

/** 판교 회장님 한 장 (몸 g + 빛 층 em). stg 0..5 = 벗어 던진 단계 (4부터 빨간 눈·곤두선 머리, 5부터 머리띠) */
export function pangyo(p: Pose, stg: number): { g: Grid; em: Grid } {
  const g = new Grid(BOSS_W, BOSS_H);
  const em = new Grid(BOSS_W, BOSS_H);
  const cx = 20;
  const f = (p.f ?? 0) + (p.crouch ?? 0);
  const st = p.step ?? -1;
  const lg = st < 0 ? 0 : st % 2 === 0 ? 1 : -1;
  const lift = st === 1 || st === 3 ? 1 : 0;
  const by = f + lift + 4;
  const ln = p.lean ?? 0;
  // 다리·운동화
  g.rect(14 + lg, 32 + by, 5, 8, 0x8a7a62);
  g.rect(21 - lg, 32 + by, 5, 8, 0x8a7a62);
  g.vline(18 + lg, 32 + by, 43, 0x6a5a48);
  g.rect(12 + lg, 43, 7, 4, 0xece8e0);
  g.rect(21 - lg, 43, 7, 4, 0xece8e0);
  g.hline(12 + lg, 18 + lg, 46, 0x8a8696);
  g.hline(21 - lg, 27 - lg, 46, 0x8a8696);
  g.set(13 + lg, 44, 0x6a8ac0);
  g.set(22 - lg, 44, 0x6a8ac0);
  const arms = p.arms ?? [6, 36, 34, 36];
  const arm = (sx: number, sy: number, hx: number, hy: number) => {
    line(g, sx, sy, hx, hy, SHIRT.mid);
    line(g, sx + 1, sy, hx + 1, hy, SHIRT.mid);
    line(g, sx, sy + 1, hx, hy + 1, SHIRT.lo);
    line(g, sx + 1, sy + 1, hx + 1, hy + 1, SHIRT.lo);
    g.rect(hx - 1, hy - 1, 3, 3, SKIN.mid);
    g.set(hx - 1, hy - 1, SKIN.hi);
  };
  arm(11 + ln, 26 + by, arms[0], arms[1] + by);
  // 몸: 체크 셔츠 + 패딩 조끼
  for (let y = 23; y < 38; y++) {
    const hw = 9 + (y > 28 && y < 36 ? 1 : 0);
    for (let x = cx - hw; x <= cx + hw; x++) {
      const rel = (x - cx) / hw;
      let c = rel < -0.5 ? SHIRT.hi : rel > 0.45 ? SHIRT.lo : SHIRT.mid;
      if ((x + y) % 4 === 0 || (y % 3 === 0 && x % 2 === 0)) c = darken(c, 0.1);
      g.set(x + ln, y + by, c);
    }
  }
  if (stg < 1) {
    for (const side of [-1, 1])
      for (let y = 24; y < 38; y++) {
        const x0 = side < 0 ? cx - 10 : cx + 4;
        const x1 = side < 0 ? cx - 4 : cx + 10;
        for (let x = x0; x <= x1; x++) {
          const rel = side < 0 ? (x - x0) / 6 : 1 - (x - x0) / 6;
          let c = y < 26 ? VEST.hi : rel < 0.3 ? VEST.lo : VEST.mid;
          if ((y - 24) % 4 === 3) c = darken(c, 0.25);
          g.set(x + ln, y + by, c);
        }
      }
    g.vline(cx - 4 + ln, 24 + by, 37 + by, 0x9aa4b4);
    g.vline(cx + 4 + ln, 24 + by, 37 + by, 0x9aa4b4);
  } else {
    for (let y = 26; y < 37; y += 3) {
      g.set(cx - 9 + ln, y + by, 0xffffff);
      g.set(cx + 9 + ln, y + by, 0xffffff);
    }
    g.rect(cx - 1 + ln, 23 + by, 2, 9, 0xc9402f);
  }
  // 사원증
  if (stg < 2) {
    line(g, cx - 3 + ln, 23 + by, cx - 1 + ln, 27 + by, 0xd8604a);
    line(g, cx + 3 + ln, 23 + by, cx + 1 + ln, 27 + by, 0xd8604a);
    g.rect(cx - 2 + ln, 28 + by, 5, 6, 0xf6f4ee);
    g.rect(cx - 1 + ln, 29 + by, 3, 2, 0x6a9ad0);
    g.hline(cx - 1 + ln, cx + 1 + ln, 32 + by, 0x9a9aa6);
  }
  // 머리
  const hy = by + 1;
  const hx = cx + ln;
  g.rect(hx - 10, hy + 9, 2, 4, SKIN.lo);
  g.rect(hx + 9, hy + 9, 2, 4, SKIN.lo);
  g.ellipse(hx + 0.5, hy + 11, 9.4, 9, SKIN.mid);
  for (let y = hy; y < hy + 22; y++)
    for (let x = hx - 10; x <= hx + 11; x++)
      if (g.filled(x, y) && rgb(g, x, y) === SKIN.mid) {
        if (x > hx + 6 || y > hy + 17) g.set(x, y, SKIN.lo);
        else if (x < hx - 5 && y < hy + 13) g.set(x, y, SKIN.hi);
      }
  if (p.red)
    for (let y = hy + 6; y < hy + 20; y++)
      for (let x = hx - 9; x <= hx + 10; x++) {
        const v = rgb(g, x, y);
        if (g.filled(x, y) && (v === SKIN.mid || v === SKIN.hi || v === SKIN.lo)) g.set(x, y, v === SKIN.lo ? 0xd07060 : 0xf09080);
      }
  // 은발
  g.ellipse(hx + 0.5, hy + 5, 9, 5, HAIR.mid);
  g.rect(hx - 9, hy + 5, 3, 7, HAIR.mid);
  g.rect(hx + 8, hy + 5, 3, 7, HAIR.lo);
  for (let x = hx - 7; x < hx + 2; x++) g.set(x, hy + 2, HAIR.hi);
  for (let x = hx - 5; x < hx; x++) g.set(x, hy + 3, HAIR.hi);
  g.hline(hx - 8, hx + 9, hy + 8, HAIR.lo);
  g.vline(hx + 3, hy + 1, hy + 5, HAIR.lo);
  // 눈썹 · 안경 · 눈
  const br = 0x8a8494;
  g.hline(hx - 7, hx - 3, hy + 10, br);
  g.hline(hx + 3, hx + 7, hy + 10, br);
  if (p.brow) {
    g.set(hx - 3, hy + 11, br);
    g.set(hx + 3, hy + 11, br);
    g.set(hx - 7, hy + 9, br);
    g.set(hx + 7, hy + 9, br);
  }
  if (stg < 3) {
    for (const gx of [hx - 8, hx + 2]) {
      g.hline(gx + 1, gx + 4, hy + 12, 0x6a4a3a);
      g.hline(gx + 1, gx + 4, hy + 16, 0x6a4a3a);
      g.vline(gx, hy + 13, hy + 15, 0x6a4a3a);
      g.vline(gx + 5, hy + 13, hy + 15, 0x6a4a3a);
      g.rect(gx + 1, hy + 13, 4, 3, p.glint === 2 ? 0xff5a44 : 0xe8f2f6);
      if (p.hurt || p.blink) g.hline(gx + 1, gx + 4, hy + 14, 0x1a1420);
      else {
        g.rect(gx + 2, hy + 13, 2, 2, 0x1a1420);
        g.set(gx + 2, hy + 13, 0xffffff);
      }
      if (p.glint) {
        g.set(gx + 1, hy + 13, 0xffffff);
        em.rect(gx + 1, hy + 13, 4, 3, p.glint === 2 ? 0xff7a60 : 0xffffff);
      }
    }
    g.hline(hx - 3, hx + 2, hy + 13, 0x6a4a3a);
  } else {
    const red = p.glint === 2 || stg >= 4;
    for (const gx of [hx - 7, hx + 3]) {
      g.rect(gx, hy + 12, 4, 4, red ? 0xff4a3a : 0xffffff);
      if (p.hurt || p.blink) {
        g.rect(gx, hy + 12, 4, 4, SKIN.mid);
        g.hline(gx, gx + 3, hy + 14, 0x1a1420);
      } else {
        g.rect(gx + 1, hy + 13, 2, 3, red ? 0x6a0000 : 0x1a1420);
        g.set(gx + 1, hy + 13, 0xffffff);
        if (red) em.rect(gx, hy + 12, 4, 4, 0xff6a50);
      }
      g.hline(gx - 1, gx + 4, hy + 11, 0x5a5464);
    }
    g.rect(hx - 8, hy + 16, 4, 1, 0xd8a890);
    g.rect(hx + 4, hy + 16, 4, 1, 0xd8a890);
  }
  if (stg >= 4) {
    for (const [dx, dy] of [
      [-6, -1],
      [-3, -2],
      [0, -2],
      [3, -2],
      [6, -1],
      [-8, 1],
      [9, 1],
    ]) {
      g.set(hx + dx, hy + dy, HAIR.mid);
      g.set(hx + dx, hy + dy + 1, HAIR.mid);
    }
    g.set(hx - 3, hy - 3, HAIR.hi);
    g.set(hx + 3, hy - 3, HAIR.hi);
  }
  if (stg >= 5) {
    g.rect(hx - 9, hy + 6, 20, 3, 0xd83a2a);
    g.hline(hx - 9, hx + 10, hy + 6, 0xff7a5a);
    g.rect(hx - 3, hy + 7, 7, 1, 0xfff4dc);
    g.rect(hx + 10, hy + 7, 3, 2, 0xd83a2a);
    g.rect(hx + 11, hy + 9, 2, 3, 0xb02a1e);
  }
  g.rect(hx - 9, hy + 17, 2, 1, 0xe89a8a);
  g.rect(hx + 8, hy + 17, 2, 1, 0xe89a8a);
  g.hline(hx - 4, hx + 4, hy + 18, 0xdcd8e0);
  g.hline(hx - 5, hx + 5, hy + 19, 0xc4c0cc);
  g.set(hx - 6, hy + 20, 0xc4c0cc);
  g.set(hx + 6, hy + 20, 0xc4c0cc);
  const mo = p.mouth ?? 0;
  if (mo === 0) g.hline(hx - 2, hx + 2, hy + 20, 0xb06050);
  else if (mo === 1) g.rect(hx - 2, hy + 20, 4, 2, 0x6a2020);
  else {
    g.rect(hx - 3, hy + 20, 7, 3, 0x6a2020);
    g.hline(hx - 2, hx + 2, hy + 20, 0xffffff);
    g.hline(hx - 2, hx + 2, hy + 22, 0xd06060);
  }
  if (p.sweat) {
    g.rect(hx + 11, hy + 6, 1, 2, 0xa8dcff);
    g.set(hx + 11, hy + 8, 0xe0f4ff);
  }
  // 앞쪽 팔 + 손에 든 것 (단계 4부터 텀블러도 던졌다)
  arm(29 + ln, 26 + by, arms[2], arms[3] + by);
  const ax = arms[2];
  const ay = arms[3] + by;
  const pa = p.ang ?? 0;
  const prop = p.prop === "tumbler" && stg >= 4 ? undefined : p.prop;
  if (prop === "tumbler") {
    g.rect(ax - 1, ay - 7, 4, 8, 0x6aa88a);
    g.hline(ax - 1, ax + 2, ay - 7, 0xf4f2ec);
    g.vline(ax, ay - 6, ay, 0x9ad0b4);
  }
  if (prop === "stylus") {
    const ex = Math.round(ax + Math.cos(pa) * 14);
    const ey = Math.round(ay + Math.sin(pa) * 14);
    line(g, ax, ay, ex, ey, 0x3a3a46);
    line(g, ax + 1, ay, ex + 1, ey, 0x3a3a46);
    g.rect(ex - 1, ey - 1, 3, 3, 0xff7a9a);
    em.rect(ex - 1, ey - 1, 3, 3, 0xffb0c8);
  }
  if (prop === "phone") {
    g.rect(ax - 1, ay - 5, 3, 7, 0x1a1420);
    g.rect(ax, ay - 4, 1, 4, 0x6ab8e8);
    em.rect(ax, ay - 4, 1, 4, 0x9ad8ff);
  }
  if (prop === "folder") {
    g.rect(ax - 5, ay - 7, 11, 8, 0xe8b850);
    g.rect(ax - 5, ay - 8, 5, 1, 0xe8b850);
    g.hline(ax - 5, ax + 5, ay - 7, 0xf8d880);
    g.set(ax + 5, ay - 9, 0x6a4a3a);
    g.set(ax + 6, ay - 10, 0xff7a3c);
    em.set(ax + 6, ay - 10, 0xffd25a);
  }
  if (prop === "finger") g.rect(ax + 1, ay - 1, 4, 1, SKIN.mid);
  if (prop === "capsule") {
    g.ellipse(ax, ay - 4, 3.4, 3.4, 0xff6a8a);
    g.hline(ax - 3, ax + 3, ay - 4, 0xf6f4ee);
    g.rect(ax - 3, ay - 3, 7, 3, 0xf6f4ee);
  }
  if (prop === "mic") {
    g.vline(ax, ay - 1, ay + 4, 0x1a1420);
    g.rect(ax - 1, ay - 4, 3, 3, 0x5a5a68);
  }
  if (prop === "clock") {
    g.ellipse(ax, ay - 6, 5, 5, 0xf6f2e4);
    g.vline(ax, ay - 9, ay - 6, 0x1a1420);
    g.hline(ax, ax + 3, ay - 6, 0xc9402f);
  }
  g.outline(OUT);
  return { g, em };
}
