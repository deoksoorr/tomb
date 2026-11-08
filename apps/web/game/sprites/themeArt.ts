import { darken, Grid, lighten, rng, type Color } from "./pixel";
import { altar, bench, chair, deadTree, tree, type LeafPal, type WoodPal } from "./props";

// 테마별 소품. 산사(temple)는 props.ts 그대로, 고딕·벚꽃은 여기서 그린다.
// 등불류는 모두 받침 기준 빛 위치가 LANTERN_LIGHT_DY(-15)에 오도록 26px 높이로 맞춘다 (빛 위치 공유).

const OUT = 0x1d1b1a;

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

// ── 고딕 ──
const IRON: WoodPal = { hi: 0x4a4c54, mid: 0x33353c, lo: 0x24252b, line: 0x111114 };
const PINE: LeafPal = { hi: 0x34463c, mid: 0x26362e, lo: 0x1c2923, deep: 0x141d19 };

export const gothic = {
  tree: (v: number) => tree(v, PINE, { hi: 0x4a3c34, mid: 0x3a2e28, lo: 0x2a221e }),
  dead: (v: number) => deadTree(v, 0x2f2a2a, 0x413a38),
  bench: (w: number) => bench(w, IRON),
  chair: (f: "down" | "left" | "right") => chair(f, IRON),
  /** 가스등 */
  lamp(): HTMLCanvasElement {
    const g = new Grid(12, 26);
    g.rect(3, 22, 6, 3, IRON.mid);
    g.rect(5, 12, 2, 10, IRON.mid);
    g.set(5, 12, IRON.hi);
    // 등 머리
    g.rect(3, 7, 6, 6, 0x2c2e34);
    g.rect(4, 8, 4, 4, 0xf4efc4);
    g.rect(5, 9, 2, 2, 0xfffbe2);
    g.hline(2, 9, 6, IRON.hi);
    g.hline(3, 8, 5, IRON.mid);
    g.set(5, 4, IRON.mid);
    g.set(6, 3, IRON.hi);
    g.outline(IRON.line);
    shadow(g, 6, 25, 5, 1.1, 70);
    return g.toCanvas();
  },
  altar(): HTMLCanvasElement {
    // 석관 모양 제단 + 촛대
    const g = new Grid(44, 30);
    const s = { hi: 0x8c8a92, mid: 0x6a6870, lo: 0x4c4a52 };
    g.rect(0, 23, 44, 5, s.lo);
    g.rect(4, 11, 36, 12, s.mid);
    g.rect(4, 11, 36, 2, s.hi);
    g.rect(4, 18, 36, 5, s.lo);
    // 아치 장식
    for (const x of [10, 20, 30]) {
      g.rect(x, 14, 4, 4, s.lo);
      g.set(x + 1, 13, s.lo);
      g.set(x + 2, 13, s.lo);
    }
    g.rect(2, 9, 40, 2, s.hi);
    g.rect(7, 6, 3, 4, 0xe8e0c8);
    g.rect(34, 6, 3, 4, 0xe8e0c8);
    g.rect(20, 3, 4, 6, IRON.mid);
    g.hline(18, 25, 3, IRON.hi);
    g.outline(OUT);
    shadow(g, 22, 28.5, 21, 1.4, 70);
    return g.toCanvas();
  },
  gate(): HTMLCanvasElement {
    // 돌기둥 두 개 + 아치형 철문
    const g = new Grid(72, 44);
    const s = { hi: 0x8a8890, mid: 0x6a6870, lo: 0x4a4850 };
    for (const x0 of [4, 58]) {
      g.rect(x0, 10, 10, 33, s.mid);
      g.rect(x0, 10, 2, 33, s.hi);
      g.rect(x0 + 8, 10, 2, 33, s.lo);
      g.rect(x0 - 1, 7, 12, 3, s.hi);
      // 기둥 위 항아리
      g.ellipse(x0 + 5, 4, 3, 2.5, s.mid);
    }
    for (let x = 15; x < 57; x += 4) {
      const arch = Math.round(6 * Math.sin(((x - 15) / 42) * Math.PI));
      g.vline(x, 16 - arch, 42, IRON.mid);
      g.set(x, 15 - arch, IRON.hi);
    }
    g.hline(15, 56, 30, IRON.mid);
    g.hline(15, 56, 40, IRON.mid);
    g.outline(OUT);
    return g.toCanvas();
  },
  /** 아래 담장: 돌 받침 + 철책 */
  wallFace(): HTMLCanvasElement {
    const g = new Grid(16, 16);
    g.rect(0, 9, 16, 7, 0x4c4a50);
    g.rect(0, 9, 16, 1, 0x66646a);
    g.hline(0, 15, 13, 0x36343a);
    g.hline(0, 15, 2, IRON.mid);
    g.hline(0, 15, 6, IRON.mid);
    for (const x of [1, 5, 9, 13]) {
      g.vline(x, 0, 8, IRON.mid);
      g.set(x, 0, IRON.hi);
    }
    return g.toCanvas();
  },
};

// ── 벚꽃 ──
const BLOSSOM: LeafPal = { hi: 0xfad4de, mid: 0xf0b4c4, lo: 0xd88ea4, deep: 0xc07890 };
const BLOSSOM2: LeafPal = { hi: 0xfde4ea, mid: 0xf6c6d2, lo: 0xe4a2b4, deep: 0xcf8aa0 };
const LIGHT_WOOD: WoodPal = { hi: 0xc4a07a, mid: 0xa8845e, lo: 0x846446, line: 0x4a3626 };

export const sakura = {
  tree: (v: number) => tree(v, v ? BLOSSOM2 : BLOSSOM, { hi: 0x6e4e44, mid: 0x5a3e36, lo: 0x44302a }),
  /** 어린 벚나무 (마른 나무 자리) */
  dead: (v: number) => tree(v + 1, BLOSSOM2, { hi: 0x6e4e44, mid: 0x5a3e36, lo: 0x44302a }),
  bench: (w: number) => bench(w, LIGHT_WOOD),
  chair: (f: "down" | "left" | "right") => chair(f, LIGHT_WOOD),
  /** 등롱: 나무 기둥에 매단 둥근 종이등 */
  lamp(): HTMLCanvasElement {
    const g = new Grid(12, 26);
    g.rect(2, 22, 8, 3, LIGHT_WOOD.lo);
    g.rect(5, 2, 2, 20, LIGHT_WOOD.mid);
    g.hline(3, 9, 2, LIGHT_WOOD.hi);
    g.vline(8, 3, 5, 0x3a2e26);
    g.ellipse(8.5, 10, 3.2, 4, 0xfbe7c6);
    g.hline(6, 11, 6, 0xc8463c);
    g.hline(6, 11, 14, 0xc8463c);
    g.set(8, 10, 0xfff6e0);
    g.outline(LIGHT_WOOD.line);
    shadow(g, 6, 25, 5, 1.1, 60);
    return g.toCanvas();
  },
  altar(): HTMLCanvasElement {
    // 산사 제단 위에 분홍 천
    const c = altar();
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e8a0b4";
    ctx.fillRect(14, 11, 16, 2);
    ctx.fillRect(18, 13, 8, 6);
    ctx.fillStyle = "#c97f95";
    ctx.fillRect(18, 18, 8, 1);
    return c;
  },
  gate(): HTMLCanvasElement {
    // 밝은 나무 문 + 기와 지붕, 지붕에 꽃잎
    const g = new Grid(72, 44);
    for (const x0 of [6, 58]) {
      g.rect(x0, 12, 8, 31, LIGHT_WOOD.mid);
      g.rect(x0, 12, 2, 31, LIGHT_WOOD.hi);
      g.rect(x0 + 6, 12, 2, 31, LIGHT_WOOD.lo);
    }
    g.rect(1, 9, 70, 4, 0xa8463c);
    g.hline(1, 70, 9, 0xc8665a);
    for (let y = 0; y < 8; y++) {
      const inset = Math.max(0, 6 - y);
      g.hline(inset, 71 - inset, y + 1, y < 2 ? 0x6a6e78 : y < 6 ? 0x4e525c : 0x3a3e46);
    }
    const r = rng(5);
    for (let i = 0; i < 14; i++) g.set(4 + Math.floor(r() * 64), 1 + Math.floor(r() * 6), 0xf6c6d2);
    g.outline(OUT);
    return g.toCanvas();
  },
  wallFace(): HTMLCanvasElement {
    const g = new Grid(16, 16);
    g.rect(0, 0, 16, 16, 0xd3cab8);
    g.rect(0, 0, 16, 3, 0x4e525c);
    g.hline(0, 15, 3, 0x6a6e78);
    g.rect(0, 13, 16, 3, 0xa89f8e);
    g.set(5, 8, 0xc4baa6);
    g.set(11, 6, 0xc4baa6);
    return g.toCanvas();
  },
};

// ── 테마 공통 분위기 소품 ──

/** 까마귀: 날기 2프레임 (11×7) */
export function crowFly(): HTMLCanvasElement {
  const g = new Grid(22, 7);
  const c = 0x15151a;
  for (let f = 0; f < 2; f++) {
    const o = f * 11;
    g.hline(o + 3, o + 7, 4, c);
    g.set(o + 8, 3, c);
    g.set(o + 9, 3, 0xd8a040);
    if (f === 0) {
      g.hline(o + 1, o + 3, 2, c);
      g.hline(o + 6, o + 8, 2, c);
      g.set(o, 1, c);
      g.set(o + 9, 1, c);
    } else {
      g.hline(o + 1, o + 3, 5, c);
      g.hline(o + 6, o + 8, 5, c);
      g.set(o, 6, c);
    }
  }
  return g.toCanvas();
}

/** 앉아 있는 까마귀 2프레임 (고개 돌림, 7×7) */
export function crowPerch(): HTMLCanvasElement {
  const g = new Grid(14, 7);
  const c = 0x15151a;
  for (let f = 0; f < 2; f++) {
    const o = f * 7;
    g.ellipse(o + 3.5, 4.5, 2.5, 2, c);
    g.set(o + (f ? 1 : 5), 2, c);
    g.set(o + (f ? 2 : 4), 2, c);
    g.set(o + (f ? 0 : 6), 2, 0xd8a040);
    g.set(o + 2, 6, 0x3a3020);
    g.set(o + 4, 6, 0x3a3020);
  }
  return g.toCanvas();
}

export function petalPink(): HTMLCanvasElement {
  const g = new Grid(3, 2);
  g.rect(0, 0, 3, 2, 0xf6c0cf);
  g.set(2, 1, 0xe08aa2);
  return g.toCanvas();
}

export function deadLeaf(): HTMLCanvasElement {
  const g = new Grid(3, 2);
  g.rect(0, 0, 3, 2, 0x8a5a32);
  g.set(0, 1, 0x6a4024);
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
