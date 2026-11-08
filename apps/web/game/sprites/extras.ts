import { darken, Grid, lighten, rng, type Color } from "./pixel";

// 꾸미기·상점 소품: 묘비 꾸미기(화환·리본·작은 석등·유령 고양이), 꽃잎, 유령 잡화점 오두막과 실내.

const OUT = 0x1d1b1a;

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

export function petalPink(): HTMLCanvasElement {
  const g = new Grid(3, 2);
  g.rect(0, 0, 3, 2, 0xf6c0cf);
  g.set(2, 1, 0xe08aa2);
  return g.toCanvas();
}

// ── 묘비 꾸미기 ──
export function wreath(): HTMLCanvasElement {
  const g = new Grid(14, 9);
  for (let a = 0; a < 32; a++) {
    const x = Math.round(7 + Math.cos((a / 32) * Math.PI * 2) * 5.5);
    const y = Math.round(4.5 + Math.sin((a / 32) * Math.PI * 2) * 3.5);
    g.set(x, y, a % 3 ? 0x4f7040 : 0x3c5a32);
  }
  for (const [x, y, c] of [[2, 3, 0xf2e8d4], [7, 0, 0xf2b8c6], [12, 4, 0xf2e8d4], [5, 8, 0xe6d27e], [10, 7, 0xf2b8c6]] as const) g.set(x, y, c);
  g.outline(0x22301e, false, 160);
  return g.toCanvas();
}

export function ribbon(): HTMLCanvasElement {
  const g = new Grid(7, 8);
  const c = 0x1c1c22;
  g.set(1, 0, c);
  g.set(2, 1, c);
  g.set(5, 0, c);
  g.set(4, 1, c);
  g.rect(2, 2, 3, 2, c);
  g.set(3, 2, 0x4a4a56);
  g.vline(2, 4, 7, c);
  g.vline(4, 4, 6, c);
  return g.toCanvas();
}

/** 작은 석등 (빛은 따로) */
export function miniLantern(): HTMLCanvasElement {
  const g = new Grid(8, 13);
  const s = { hi: 0xa4a297, mid: 0x8a887e, lo: 0x67655d };
  g.rect(1, 10, 6, 2, s.mid);
  g.rect(3, 7, 2, 3, s.lo);
  g.rect(1, 3, 6, 4, s.mid);
  g.rect(2, 4, 4, 2, 0xffd27a);
  g.hline(0, 7, 2, s.hi);
  g.set(3, 1, s.mid);
  g.outline(0x3a3934);
  return g.toCanvas();
}

/** 유령 고양이 2프레임 (꼬리 흔들기, 12×8) */
export function ghostCat(): HTMLCanvasElement {
  const g = new Grid(24, 8);
  const body = 0xe8f2f8;
  const shade = 0xb8cad6;
  for (let f = 0; f < 2; f++) {
    const o = f * 12;
    const b = new Grid(12, 8);
    b.ellipse(6, 5.5, 4.5, 2.5, body);
    b.ellipse(3, 3.5, 2.2, 2, body);
    b.set(1, 1, body);
    b.set(4, 1, body);
    b.set(2, 3, 0x40506a);
    b.set(4, 3, 0x40506a);
    b.recolor((x, y) => y >= 6, shade);
    if (f === 0) {
      b.set(10, 4, body);
      b.set(11, 3, body);
    } else {
      b.set(10, 6, body);
      b.set(11, 6, body);
    }
    b.outline(0x8aa0b4, false, 140);
    g.draw(b, o, 0);
  }
  return g.toCanvas();
}

/** 작은 무지개 아치 (24×12, 원점 아래 가운데). 일곱 빛깔 중 다섯 띠 */
export function rainbow(): HTMLCanvasElement {
  const W = 24;
  const H = 12;
  const g = new Grid(W, H);
  const bands = [0xff6a6a, 0xffb050, 0xfff07a, 0x7ae08a, 0x7ab8ff, 0xb08aff];
  const cx = W / 2 - 0.5;
  const cy = H - 0.5;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, (y - cy) * 1.05);
      const i = Math.floor(11.6 - d);
      if (i >= 0 && i < bands.length) g.set(x, y, bands[i], 215);
    }
  // 양 끝 구름 받침
  for (const ox of [1, W - 6]) {
    g.ellipse(ox + 2.5, H - 1.5, 2.8, 1.6, 0xf4f6ff);
    g.set(ox + 1, H - 3, 0xffffff);
  }
  return g.toCanvas();
}

/** 나비 2프레임 (날개 펴기/접기, 7×5 × 2) */
export function butterfly(): HTMLCanvasElement {
  const g = new Grid(14, 5);
  const wing = 0xffffff;
  for (let f = 0; f < 2; f++) {
    const o = f * 7;
    g.vline(o + 3, 1, 4, 0x3a2a30);
    if (f === 0) {
      // 활짝
      g.rect(o, 0, 3, 2, wing);
      g.rect(o + 4, 0, 3, 2, wing);
      g.rect(o + 1, 2, 2, 2, wing);
      g.rect(o + 4, 2, 2, 2, wing);
      g.set(o + 1, 0, 0xd8d8d8);
      g.set(o + 5, 0, 0xd8d8d8);
    } else {
      // 접힘 (위로 세운 날개)
      g.rect(o + 2, 0, 1, 3, wing);
      g.rect(o + 4, 0, 1, 3, wing);
    }
  }
  return g.toCanvas();
}

/** 작은 눈사람 (10×15, 원점 아래 가운데): 빨간 목도리, 나뭇가지 팔, 숯 단추 */
export function snowman(): HTMLCanvasElement {
  const g = new Grid(12, 15);
  const snow = 0xf4f8ff;
  const shade = 0xc8d4e8;
  g.ellipse(6, 10.5, 4.2, 3.6, snow);
  g.ellipse(6, 4.5, 3, 2.8, snow);
  g.recolor((x, y) => g.filled(x, y) && x >= 8 && y >= 8, shade);
  g.recolor((x, y) => g.filled(x, y) && y >= 13, shade);
  // 모자 없이 눈·코
  g.set(5, 4, 0x2a2a30);
  g.set(7, 4, 0x2a2a30);
  g.set(6, 5, 0xf08a3a);
  // 목도리
  g.hline(3, 9, 7, 0xd04a3c);
  g.set(8, 8, 0xd04a3c);
  g.set(8, 9, 0xa8382e);
  // 단추
  g.set(6, 10, 0x3a3a40);
  g.set(6, 12, 0x3a3a40);
  g.outline(0x6a7a94, false, 200);
  // 나뭇가지 팔 (외곽선 뒤)
  g.set(1, 8, 0x6a4a30);
  g.set(0, 7, 0x6a4a30);
  g.set(11, 8, 0x6a4a30);
  shadow(g, 6, 14, 5, 1, 60);
  return g.toCanvas();
}

/** 작은 화분 (9×12, 원점 아래 가운데): 테라코타 화분 + 초록 잎 + 노란 꽃 */
export function flowerpot(): HTMLCanvasElement {
  const g = new Grid(9, 12);
  const pot = { hi: 0xd88a5a, mid: 0xb8683c, lo: 0x8e4a2a };
  g.rect(1, 6, 7, 2, pot.hi);
  for (let y = 8; y < 11; y++) g.hline(2 - (y > 9 ? 0 : 0) + (y === 10 ? 1 : 0), 6 - (y === 10 ? 1 : 0), y, y === 10 ? pot.lo : pot.mid);
  g.vline(4, 2, 5, 0x4f8a40);
  g.set(2, 4, 0x6aa850);
  g.set(3, 5, 0x6aa850);
  g.set(6, 3, 0x6aa850);
  g.set(5, 4, 0x6aa850);
  g.rect(3, 0, 3, 2, 0xffd84a);
  g.set(4, 1, 0xf08a3a);
  g.outline(OUT, false, 170);
  return g.toCanvas();
}

// ── 유령 잡화점 ──
export const SHOP_HUT_W = 60;
export const SHOP_HUT_H = 54;

/** 바깥 오두막 (원점: 바닥 가운데, 문은 가운데 아래) */
export function shopHut(): HTMLCanvasElement {
  const g = new Grid(SHOP_HUT_W, SHOP_HUT_H);
  const w = { hi: 0x8e6e4e, mid: 0x6e5238, lo: 0x52402c };
  const roof = { hi: 0x5c4a6e, mid: 0x463858, lo: 0x342844 };
  // 벽
  g.rect(6, 24, 48, 28, w.mid);
  for (let y = 26; y < 52; y += 4) g.hline(6, 53, y, w.lo);
  g.vline(6, 24, 51, w.hi);
  // 지붕 (보랏빛 기와)
  for (let y = 4; y < 26; y++) {
    const inset = Math.max(0, Math.round((26 - y) * 1.15) - 2);
    g.hline(Math.max(0, 2 + inset - 6), Math.min(59, 57 - inset + 6), y, y < 10 ? roof.hi : y < 20 ? roof.mid : roof.lo);
  }
  for (let x = 4; x < 56; x += 5) g.vline(x, 14, 25, roof.lo);
  // 굴뚝
  g.rect(42, 0, 6, 10, 0x6a6460);
  g.hline(41, 48, 0, 0x8a847e);
  // 창문 (따뜻한 빛)
  for (const x0 of [12, 40]) {
    g.rect(x0, 31, 8, 7, 0x2a2018);
    g.rect(x0 + 1, 32, 6, 5, 0xffd27a);
    g.vline(x0 + 4, 32, 36, 0x7a5a36);
    g.hline(x0 + 1, x0 + 6, 34, 0x7a5a36);
  }
  // 문
  g.rect(24, 36, 12, 16, 0x2c2018);
  g.rect(25, 37, 10, 15, 0x4a3524);
  g.set(33, 44, 0xe8c070);
  // 간판 (유령 얼굴)
  g.rect(21, 26, 18, 7, 0x3a2c22);
  g.rect(22, 27, 16, 5, 0xd8cfb8);
  g.ellipse(30, 29.5, 3, 2.4, 0xf4f8fb);
  g.set(29, 29, 0x2a2a34);
  g.set(31, 29, 0x2a2a34);
  g.outline(OUT);
  shadow(g, 30, 52.5, 27, 1.5, 70);
  return g.toCanvas();
}

/** 실내 바닥 타일 (나무 마루) */
export function shopFloor(): HTMLCanvasElement {
  const g = new Grid(16, 16);
  const r = rng(3);
  for (let y = 0; y < 16; y++) {
    const plank = Math.floor(y / 4);
    const base = plank % 2 ? 0x7a5a3c : 0x86644a;
    g.hline(0, 15, y, base);
  }
  for (let p = 0; p < 4; p++) {
    g.hline(0, 15, p * 4 + 3, 0x5e4430);
    g.set((p * 7) % 16, p * 4 + 1, 0x5e4430);
  }
  for (let i = 0; i < 6; i++) g.set(Math.floor(r() * 16), Math.floor(r() * 16), 0x9a7656);
  return g.toCanvas();
}

/** 실내 벽 (선반이 걸리는 위쪽 벽 한 칸, 16×32) */
export function shopWall(): HTMLCanvasElement {
  const g = new Grid(16, 32);
  g.rect(0, 0, 16, 32, 0x4a3a4e);
  for (let y = 3; y < 30; y += 6) g.hline(0, 15, y, 0x3e3042);
  g.rect(0, 28, 16, 4, 0x2e2432);
  g.hline(0, 15, 28, 0x5a4a5e);
  return g.toCanvas();
}

/** 선반 (물건이 놓인, 32×22) */
export function shopShelf(seed: number): HTMLCanvasElement {
  const g = new Grid(32, 22);
  const w = { hi: 0x9a7656, mid: 0x7a5a3c, lo: 0x5a4028 };
  g.rect(1, 0, 30, 21, w.lo);
  g.rect(2, 1, 28, 19, 0x3a2c22);
  for (const y of [7, 14, 20]) g.hline(1, 30, y, w.mid);
  const r = rng(seed);
  const colors: Color[] = [0xc8463c, 0x4a8ab8, 0xe8c070, 0x7ab86a, 0xc98ad8, 0xf2e8d4, 0xf2b8c8];
  for (const shelfY of [6, 13, 19]) {
    let x = 3;
    while (x < 28) {
      const kind = Math.floor(r() * 3);
      const c = colors[Math.floor(r() * colors.length)];
      if (kind === 0) {
        // 병
        g.rect(x, shelfY - 4, 3, 4, c);
        g.set(x + 1, shelfY - 5, lighten(c, 0.3));
        g.set(x, shelfY - 3, lighten(c, 0.4));
        x += 4;
      } else if (kind === 1) {
        // 폭죽 막대
        g.vline(x, shelfY - 5, shelfY - 1, c);
        g.vline(x + 1, shelfY - 4, shelfY - 1, darken(c, 0.2));
        g.set(x, shelfY - 6, 0xf4e8c0);
        x += 3;
      } else {
        // 상자
        g.rect(x, shelfY - 3, 4, 3, darken(c, 0.25));
        g.hline(x, x + 3, shelfY - 3, c);
        x += 5;
      }
    }
  }
  g.outline(OUT);
  return g.toCanvas();
}

/** 계산대 (48×18) */
export function shopCounter(): HTMLCanvasElement {
  const g = new Grid(48, 18);
  g.rect(0, 4, 48, 13, 0x6e5238);
  g.rect(0, 2, 48, 3, 0x9a7656);
  for (let x = 6; x < 46; x += 8) g.vline(x, 6, 16, 0x52402c);
  g.rect(36, 0, 6, 3, 0xe8c070);
  g.set(38, 0, 0xfff0b0);
  g.outline(OUT);
  return g.toCanvas();
}

/** 유령 주인장: 둥근 모자를 쓴 홑이불 유령 2프레임 (16×22) */
export function shopKeeper(): HTMLCanvasElement {
  const g = new Grid(32, 22);
  for (let f = 0; f < 2; f++) {
    const o = f * 16;
    const b = new Grid(16, 22);
    const body = 0xeef4f8;
    b.ellipse(8, 10, 6, 6, body);
    b.rect(2, 10, 12, 8, body);
    // 너울거리는 아랫단
    for (let x = 2; x < 14; x++) if ((x + f) % 3 !== 0) b.set(x, 18, body);
    b.recolor((x, y) => x > 10 || y > 15, 0xc8d6e0);
    // 눈과 동그란 안경
    b.set(6, 9, 0x2a2a34);
    b.set(10, 9, 0x2a2a34);
    for (const cx of [6, 10]) {
      b.set(cx - 1, 9, 0x8a6a40);
      b.set(cx + 1, 9, 0x8a6a40);
    }
    b.set(8, 12, 0xe8a0b0);
    // 모자
    b.hline(3, 13, 4, 0x3a2c4a);
    b.rect(5, 1, 7, 3, 0x4a3a5e);
    b.hline(5, 11, 3, 0xc8463c);
    b.outline(0x7a8ea0, false, 200);
    g.draw(b, o, f ? 1 : 0);
  }
  return g.toCanvas();
}

/** 실내 문 (아래 벽 가운데, 24×18) */
export function shopDoor(): HTMLCanvasElement {
  const g = new Grid(24, 18);
  g.rect(0, 0, 24, 18, 0x2e2432);
  g.rect(3, 2, 18, 16, 0x1a1418);
  g.rect(4, 3, 16, 15, 0x5a4028);
  g.vline(12, 3, 17, 0x3a2a1c);
  g.set(10, 10, 0xe8c070);
  g.set(14, 10, 0xe8c070);
  return g.toCanvas();
}
