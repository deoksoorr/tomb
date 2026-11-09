import { Grid, hash2, lighten, rng, type Color } from "./pixel";
import { tree, type LeafPal } from "./props";

// v3 월드 소품 픽셀아트: 여러 종류 나무(가을나무·소나무·덤불), 우물, 그네, 종루, 돌무더기, 꽃밭, 버섯, 허수아비,
// 작은 다리, 갈대, 반딧불 항아리, 특별한 장소(사냥터 동굴 입구·분양 사무소·성황당 나무).
// 모두 원점 = 바닥 가운데 (0.5, 1). 맨 아래 줄 근처는 그림자 (props.ts와 같은 규칙).

const OUT = 0x1f1d1a;
const WOOD = { hi: 0x927252, mid: 0x7a5d40, lo: 0x5a432e, line: 0x2e2219 };
const STONE = { hi: 0xa4a297, mid: 0x8a887e, lo: 0x67655d, line: 0x3a3934 };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, w = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.rect(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), w, w, c);
}

// ── 나무 ──
const AUTUMN: LeafPal = { hi: 0xb07a3c, mid: 0x8f5a2e, lo: 0x6a4024, deep: 0x55331e };
const BLOSSOM: LeafPal = { hi: 0xc99aa8, mid: 0xa77887, lo: 0x7f5866, deep: 0x6a4855 };

export function autumnTree(v: number): HTMLCanvasElement {
  return tree(v, AUTUMN);
}
export function blossomTree(v: number): HTMLCanvasElement {
  return tree(v, BLOSSOM);
}

/** 소나무: 층층이 쌓인 삼각 수관 (24×40) */
export function pine(v: number): HTMLCanvasElement {
  const g = new Grid(24, 40);
  const r = rng(91 + v * 13);
  const leaf = { hi: 0x46604a, mid: 0x334a39, lo: 0x26372b };
  g.rect(11, 30, 3, 7, 0x5a4632);
  g.set(11, 30, 0x6e5840);
  const tiers = v % 2 ? [[4, 9], [12, 9], [20, 10]] : [[3, 8], [10, 9], [18, 10], [25, 11]];
  for (const [top, hw] of tiers) {
    const h = 9;
    for (let y = 0; y < h; y++) {
      const w = Math.round(1 + (hw * y) / h);
      g.hline(12 - w, 11 + w, top + y, y > h - 3 ? leaf.lo : leaf.mid);
    }
  }
  g.set(11, 1, leaf.mid);
  g.set(12, 1, leaf.mid);
  g.set(11, 2, leaf.hi);
  g.recolor((x, y) => x < 11 && !g.filled(x - 1, y), leaf.hi);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(r() * 24);
    const y = Math.floor(r() * 32);
    if (g.filled(x, y)) g.set(x, y, r() < 0.5 ? leaf.lo : leaf.hi);
  }
  g.outline(OUT);
  shadow(g, 12, 38, 8, 1.8, 65);
  return g.toCanvas();
}

/** 낮은 덤불 (18×14, 충돌 없음) */
export function bush(v: number): HTMLCanvasElement {
  const g = new Grid(18, 14);
  const leaf = v % 2 ? { hi: 0x5a7046, mid: 0x435a36, lo: 0x33452a } : { hi: 0x52683e, mid: 0x3d5131, lo: 0x2e3e26 };
  g.ellipse(9, 8, 7.5, 4.5, leaf.mid);
  g.ellipse(5.5, 7, 3.5, 3, leaf.mid);
  g.ellipse(12.5, 6.5, 4, 3.5, leaf.mid);
  g.recolor((x, y) => !g.filled(x, y - 1), leaf.hi);
  g.recolor((x, y) => !g.filled(x, y + 1), leaf.lo);
  if (v % 3 === 2) for (const [x, y] of [[5, 6], [11, 5], [13, 8]]) g.set(x, y, 0xe7c9d6);
  g.outline(OUT);
  shadow(g, 9, 12.5, 7, 1.2, 55);
  return g.toCanvas();
}

// ── 우물 (26×30) ──
export function well(): HTMLCanvasElement {
  const g = new Grid(26, 30);
  const s = STONE;
  // 돌 둘레
  g.ellipse(13, 22, 11, 5, s.mid);
  g.ellipse(13, 20.5, 9, 3, 0x1e2a30);
  g.ellipse(13, 21.3, 7, 1.6, 0x2c4650);
  for (let x = 2; x < 24; x += 4) g.set(x, 24, s.lo);
  g.recolor((x, y) => y >= 25 && g.filled(x, y), s.lo);
  g.hline(4, 21, 17, s.hi);
  // 기둥 + 지붕
  g.rect(3, 6, 2, 13, WOOD.mid);
  g.rect(21, 6, 2, 13, WOOD.lo);
  for (let y = 0; y < 6; y++) g.hline(1 + Math.max(0, 3 - y) * 0, 24, y + 1, y < 2 ? 0x6a5a6e : y < 4 ? 0x544658 : 0x403444);
  for (let x = 2; x < 25; x += 3) g.vline(x, 2, 6, 0x403444);
  // 도르래 + 두레박
  g.hline(5, 20, 8, WOOD.lo);
  g.vline(13, 9, 13, 0xbfb59c);
  g.rect(11, 13, 5, 4, WOOD.mid);
  g.hline(11, 15, 13, WOOD.hi);
  g.outline(OUT);
  shadow(g, 13, 28, 11, 1.4, 70);
  return g.toCanvas();
}

// ── 그네 (34×32): A자 기둥 + 가로대 + 줄 + 판 ──
export function swing(): HTMLCanvasElement {
  const g = new Grid(34, 32);
  const w = WOOD;
  line(g, 2, 29, 6, 3, w.lo, 2);
  line(g, 10, 29, 6, 3, w.mid, 2);
  line(g, 31, 29, 27, 3, w.lo, 2);
  line(g, 23, 29, 27, 3, w.mid, 2);
  g.rect(4, 2, 26, 2, w.mid);
  g.hline(4, 29, 2, w.hi);
  g.outline(w.line);
  shadow(g, 17, 30, 15, 1.4, 60);
  return g.toCanvas();
}

/** 그네 줄 + 판 (틀과 같은 34×32 캔버스, 같은 자리에 겹쳐 그린다). 누가 타면 숨기고 아바타가 자기 줄·판을 그린다 */
export function swingSeat(): HTMLCanvasElement {
  const g = new Grid(34, 32);
  const w = WOOD;
  g.vline(13, 4, 21, 0xa89a7e);
  g.vline(20, 4, 21, 0xa89a7e);
  g.rect(12, 22, 10, 2, w.mid);
  g.hline(12, 21, 22, w.hi);
  g.outline(w.line);
  return g.toCanvas();
}

// ── 종루 (24×40): 나무 틀, 기와 지붕, 청동 종 ──
export function bellTower(): HTMLCanvasElement {
  const g = new Grid(24, 40);
  const w = WOOD;
  g.rect(3, 9, 2, 28, w.mid);
  g.rect(19, 9, 2, 28, w.lo);
  g.vline(3, 9, 36, w.hi);
  g.rect(2, 34, 20, 3, STONE.mid);
  g.hline(2, 21, 34, STONE.hi);
  // 지붕
  for (let y = 0; y < 8; y++) {
    const inset = Math.max(0, 5 - y);
    g.hline(inset, 23 - inset, y + 1, y < 2 ? 0x5a6266 : y < 6 ? 0x434a4e : 0x2f3437);
  }
  g.hline(1, 22, 9, w.lo);
  // 종
  g.vline(12, 10, 11, 0x3a3127);
  g.rect(10, 12, 4, 2, 0xa9783a);
  g.rect(9, 14, 6, 5, 0x9a6a30);
  g.rect(8, 19, 8, 2, 0x8a5c28);
  g.vline(10, 13, 19, 0xd1a35a);
  g.set(11, 20, 0x5b3d1c);
  // 당목(종 치는 막대)
  g.hline(15, 18, 16, w.hi);
  g.outline(OUT);
  shadow(g, 12, 38, 10, 1.4, 70);
  return g.toCanvas();
}

// ── 돌무더기 (16×16) ──
export function cairn(v: number): HTMLCanvasElement {
  const g = new Grid(16, 16);
  const s = STONE;
  const stones: [number, number, number, number][] =
    v % 2
      ? [[8, 12, 6, 2.6], [8, 8.5, 4.5, 2], [8, 5.5, 3, 1.6], [8, 3, 1.8, 1.2]]
      : [[8, 12, 6.5, 2.6], [7, 8.5, 4, 2], [9, 5.5, 3, 1.6], [8, 3, 2, 1.3], [12.5, 12.5, 2, 1.5]];
  stones.forEach(([cx, cy, rx, ry], i) => {
    g.ellipse(cx, cy, rx, ry, i % 2 ? s.mid : lighten(s.mid, 0.08));
    g.recolor((x, y) => Math.abs(y - (cy - ry)) < 0.8 && Math.abs(x + 0.5 - cx) < rx - 0.5, s.hi);
  });
  g.outline(s.line);
  shadow(g, 8, 14.5, 6.5, 1.2, 60);
  return g.toCanvas();
}

// ── 꽃밭 (22×10, 충돌 없음) ──
const BED_COLORS: readonly (readonly Color[])[] = [
  [0xe9b8c8, 0xf3d36b, 0xffffff],
  [0xb9a6e6, 0x8fb7e8, 0xe9e2cf],
  [0xf09a6a, 0xf3d36b, 0xe86a5a],
];
export function flowerBed(v: number): HTMLCanvasElement {
  const g = new Grid(22, 10);
  const r = rng(7 + v * 19);
  g.ellipse(11, 6, 10, 3.2, 0x3f5232);
  g.recolor((x, y) => y <= 4, 0x4d6340);
  const cols = BED_COLORS[v % BED_COLORS.length];
  for (let i = 0; i < 14; i++) {
    const x = 2 + Math.floor(r() * 18);
    const y = 3 + Math.floor(r() * 5);
    if (!g.filled(x, y)) continue;
    const c = cols[i % cols.length];
    g.set(x, y, c);
    if (r() < 0.5) g.set(x, y - 1, lighten(c, 0.3));
  }
  shadow(g, 11, 8.5, 9, 1, 40);
  return g.toCanvas();
}

// ── 버섯 무리 (12×9) ──
export function mushrooms(v: number): HTMLCanvasElement {
  const g = new Grid(12, 9);
  const cap = v % 2 ? { hi: 0xd9b48a, mid: 0xb0835a } : { hi: 0xe87a68, mid: 0xbe4a3e };
  const one = (x: number, y: number, s: number) => {
    g.rect(x, y, 1, s + 1, 0xe8e0c8);
    g.hline(x - s, x + s, y - 1, cap.mid);
    g.hline(x - s + 1, x + s - 1, y - 2, cap.hi);
    if (v % 2 === 0) g.set(x - 1, y - 2, 0xffffff);
  };
  one(4, 5, 2);
  one(8, 6, 1);
  if (v % 3 !== 1) one(10, 7, 1);
  g.outline(OUT, false, 200);
  shadow(g, 6, 8, 5, 0.8, 50);
  return g.toCanvas();
}

// ── 허수아비 (18×30) ──
export function scarecrow(): HTMLCanvasElement {
  const g = new Grid(18, 30);
  g.rect(8, 9, 2, 19, WOOD.lo);
  g.hline(1, 16, 12, WOOD.mid);
  // 옷
  g.rect(5, 11, 8, 8, 0x6c7a8c);
  g.rect(5, 11, 8, 1, 0x8494a6);
  g.rect(8, 13, 2, 2, 0xb0885a);
  for (const x of [5, 7, 10, 12]) g.set(x, 19, 0xd8c070);
  g.set(1, 13, 0xd8c070);
  g.set(16, 13, 0xd8c070);
  // 머리 (자루) + 밀짚모자
  g.ellipse(9, 7, 3.2, 3, 0xd8c8a0);
  g.set(8, 7, 0x3a3127);
  g.set(10, 7, 0x3a3127);
  g.hline(8, 10, 9, 0x8c6a4a);
  g.hline(3, 15, 4, 0xe2c27a);
  g.rect(6, 1, 6, 3, 0xe2c27a);
  g.hline(6, 11, 3, 0x8c4a32);
  g.outline(OUT);
  shadow(g, 9, 28.5, 4, 1, 60);
  return g.toCanvas();
}

// ── 작은 다리 (BRIDGE_W×BRIDGE_H): 시냇물 위를 남북으로 건너는 나무 판자. 바닥 높이에 그린다 ──
export const BRIDGE_W = 22;
export const BRIDGE_H = 34;
export function bridge(): HTMLCanvasElement {
  const g = new Grid(BRIDGE_W, BRIDGE_H);
  const w = WOOD;
  for (let y = 1; y < BRIDGE_H - 1; y++) {
    const c = y % 4 === 0 ? w.lo : y % 4 === 1 ? w.hi : w.mid;
    g.hline(3, BRIDGE_W - 4, y, c);
  }
  // 난간 (낮은 통나무)
  g.rect(1, 0, 2, BRIDGE_H, w.lo);
  g.rect(BRIDGE_W - 3, 0, 2, BRIDGE_H, w.lo);
  g.vline(1, 0, BRIDGE_H - 1, w.hi);
  for (const y of [1, BRIDGE_H - 3]) {
    g.rect(0, y, 4, 3, w.mid);
    g.rect(BRIDGE_W - 4, y, 4, 3, w.mid);
  }
  g.outline(w.line);
  return g.toCanvas();
}

// ── 갈대 (10×13, 충돌 없음) ──
export function reeds(v: number): HTMLCanvasElement {
  const g = new Grid(10, 13);
  const r = rng(33 + v * 7);
  const n = 4 + (v % 2);
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor((i * 8) / n + r() * 2);
    const h = 6 + Math.floor(r() * 5);
    const lean = r() < 0.5 ? -1 : 1;
    for (let y = 0; y < h; y++) g.set(x + (y > h - 3 ? lean : 0), 12 - y, y < 2 ? 0x4c6236 : 0x6a7f46);
    if (r() < 0.6) {
      g.set(x + lean, 12 - h, 0x7a5a3a);
      g.set(x + lean, 11 - h, 0x7a5a3a);
    }
  }
  return g.toCanvas();
}

// ── 반딧불 항아리 (10×14) ──
export const JAR_LIGHT_DY = -6;
export function fireflyJar(): HTMLCanvasElement {
  const g = new Grid(10, 14);
  g.rect(3, 1, 4, 2, 0x8a6a40);
  g.hline(3, 6, 1, 0xa8885a);
  g.rect(1, 3, 8, 9, 0x5a7b78);
  g.rect(2, 4, 6, 7, 0x6f9490);
  for (const [x, y] of [[3, 6], [6, 5], [5, 9], [3, 9]]) g.set(x, y, 0xf6f2a0);
  g.set(2, 4, 0xd6eee8);
  g.outline(OUT);
  shadow(g, 5, 12.8, 4, 0.9, 60);
  return g.toCanvas();
}

// ── 사냥터 입구: 윗담에 붙은 바위 동굴 (CAVE_W×CAVE_H) ──
export const CAVE_W = 52;
export const CAVE_H = 42;
/** 횃불 위치 (받침 기준) */
export const CAVE_TORCHES: readonly [number, number][] = [
  [-19, -26],
  [19, -26],
];
export function caveGate(): HTMLCanvasElement {
  const g = new Grid(CAVE_W, CAVE_H);
  const rock = { hi: 0x7e7a72, mid: 0x625f58, lo: 0x47453f };
  g.ellipse(26, 26, 25, 18, rock.mid);
  g.rect(1, 26, 50, 14, rock.mid);
  // 바위 결
  const r = rng(77);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * 52);
    const y = Math.floor(r() * 40);
    if (g.filled(x, y)) g.set(x, y, r() < 0.5 ? rock.lo : rock.hi);
  }
  g.recolor((x, y) => !g.filled(x, y - 2), rock.hi);
  // 어두운 입구 (아치)
  g.ellipse(26, 28, 10, 13, 0x0f0e12);
  g.rect(16, 28, 21, 12, 0x0f0e12);
  g.recolor((x, y) => y > 36 && g.get(x, y) !== 0 && Math.abs(x - 26) < 10, 0x1a1820);
  // 나무 문틀 + 현판
  g.rect(14, 18, 2, 22, WOOD.mid);
  g.rect(37, 18, 2, 22, WOOD.lo);
  g.rect(13, 16, 27, 3, WOOD.mid);
  g.hline(13, 39, 16, WOOD.hi);
  g.rect(21, 11, 11, 5, 0x3e2f22);
  for (const x of [23, 26, 29]) g.rect(x, 12, 2, 3, 0xe08a5a);
  // 횃불 (불꽃은 빛으로)
  for (const [dx] of CAVE_TORCHES) {
    const x = 26 + dx;
    g.rect(x, 16, 1, 8, WOOD.lo);
    g.rect(x - 1, 13, 3, 3, 0xffa040);
    g.set(x, 12, 0xffe08a);
  }
  // 길 가 돌
  g.outline(OUT);
  shadow(g, 26, 40.5, 24, 1.3, 70);
  return g.toCanvas();
}

// ── 분양 사무소 (OFFICE_W×OFFICE_H): 하얀 회벽 사무실 오두막 + 간판 ──
export const OFFICE_W = 60;
export const OFFICE_H = 54;
export function officeHut(): HTMLCanvasElement {
  const g = new Grid(OFFICE_W, OFFICE_H);
  const wall = { hi: 0xd9d0bc, mid: 0xc2b89f, lo: 0x9e957f };
  const roof = { hi: 0x4f6a78, mid: 0x3d5562, lo: 0x2c3f4a };
  // 벽
  g.rect(6, 24, 48, 26, wall.mid);
  g.rect(6, 24, 48, 2, wall.hi);
  g.rect(50, 24, 4, 26, wall.lo);
  g.rect(6, 47, 48, 3, 0x7a705c);
  // 지붕 (평평한 사무실 지붕 + 처마)
  for (let y = 0; y < 12; y++) {
    const inset = Math.max(0, 10 - y);
    g.hline(2 + inset, 57 - inset, 12 + y, y < 3 ? roof.hi : y < 9 ? roof.mid : roof.lo);
  }
  for (let x = 6; x < 56; x += 5) g.vline(x, 15, 22, roof.lo);
  // 간판
  g.rect(16, 4, 28, 9, 0x2f3a44);
  g.rect(17, 5, 26, 7, 0x3e4c58);
  for (const x of [20, 25, 30, 35]) g.rect(x, 7, 3, 3, 0xe8e0c8);
  g.vline(18, 13, 14, 0x2f3a44);
  g.vline(41, 13, 14, 0x2f3a44);
  // 문
  g.rect(25, 33, 10, 17, 0x6e5238);
  g.rect(26, 34, 8, 15, 0x8e6e4e);
  g.rect(28, 36, 4, 4, 0xbfdde8);
  g.set(33, 42, 0xf3d36b);
  // 창 (불빛)
  for (const x of [11, 40]) {
    g.rect(x, 30, 9, 8, 0x52402c);
    g.rect(x + 1, 31, 7, 6, 0xffd98a);
    g.vline(x + 4, 31, 36, 0x52402c);
    g.hline(x + 1, x + 7, 33, 0x52402c);
  }
  // 우편함
  g.rect(52, 40, 4, 4, 0xb85a4a);
  g.vline(54, 44, 49, WOOD.lo);
  g.outline(OUT);
  shadow(g, 30, 51.5, 27, 1.6, 70);
  return g.toCanvas();
}

// ── 성황당 나무: 오색 천을 묶은 고목 + 금줄 ──
export function shrineTree(): HTMLCanvasElement {
  const base = tree(0);
  const c = document.createElement("canvas");
  c.width = base.width;
  c.height = base.height;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(base, 0, 0);
  const px = (x: number, y: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 1, 1);
  };
  // 금줄 (새끼줄) 줄기 둘레
  for (let x = 12; x <= 19; x++) px(x, 27 + ((x & 1) as number), "#d8c8a0");
  const strips = ["#d8433a", "#3a6ad8", "#f0c040", "#ffffff", "#3aa060"];
  // 가지에 묶인 천 조각 (아래로 늘어진다)
  const spots: [number, number][] = [
    [5, 19],
    [8, 22],
    [11, 20],
    [24, 20],
    [21, 23],
    [27, 17],
    [3, 15],
    [17, 21],
    [29, 13],
  ];
  spots.forEach(([x, y], i) => {
    const col = strips[i % strips.length];
    const len = 4 + Math.floor(hash2(x, y, 5) * 4);
    px(x, y - 1, "#3a2a1a");
    for (let k = 0; k < len; k++) {
      px(x + (k > 3 ? 1 : 0), y + k, col);
      if (k < 2) px(x + 1, y + k, col);
    }
  });
  // 줄기에 감긴 천
  for (let x = 13; x <= 18; x++) px(x, 31, strips[x % strips.length]);
  return c;
}

// ── 모닥불 (v4) ──
export const FIRE_W = 18;
export const FIRE_H = 24;
export const FIRE_FRAMES = 6;
/** 모닥불 빛 색 */
export const FIRE_TINT = 0xffa048;

/** 타오르는 불꽃 시트 (FIRE_FRAMES 프레임, 18×24, 원점 바닥 가운데). 맨 아래는 엇갈린 장작 */
export function campfireSheet(): HTMLCanvasElement {
  const g = new Grid(FIRE_W * FIRE_FRAMES, FIRE_H);
  const layers: [number, Color][] = [
    [1, 0xc8402a],
    [0.78, 0xf0802c],
    [0.55, 0xffc048],
    [0.3, 0xfff0b0],
  ];
  for (let f = 0; f < FIRE_FRAMES; f++) {
    const ox = f * FIRE_W;
    const ph = (f / FIRE_FRAMES) * Math.PI * 2;
    const r = rng(311 + f * 7);
    // 장작 (엇갈린 두 개 + 숯)
    line(g, ox + 3, 21, ox + 14, 18, WOOD.lo, 2);
    line(g, ox + 3, 18, ox + 14, 21, WOOD.mid, 2);
    g.set(ox + 3, 21, WOOD.hi);
    g.set(ox + 14, 21, WOOD.hi);
    g.set(ox + 8, 20, 0xff6a2a);
    g.set(ox + 10, 19, 0xffa040);
    // 불꽃: 가운데가 높고 프레임마다 혀가 일렁인다
    for (const [k, c] of layers) {
      for (let x = 2; x <= 15; x++) {
        const t = (x - 8.5) / 7;
        const prof = Math.max(0, 1 - t * t * 1.15);
        const flick = 0.78 + 0.22 * Math.sin(ph + x * 1.3) + 0.08 * Math.sin(ph * 2 - x * 0.7);
        const h = Math.round(17 * prof * flick * k);
        if (h <= 0) continue;
        const sway = Math.round(Math.sin(ph + (x - 8) * 0.25) * 0.8 * (k < 0.5 ? 0.5 : 1));
        for (let y = 19 - h; y <= 19; y++) g.set(ox + x + (y < 19 - h * 0.5 ? sway : 0), y, c);
      }
    }
    // 위로 튀는 불티 두세 개
    for (let i = 0; i < 3; i++) {
      const x = 4 + Math.floor(r() * 10);
      const y = 1 + Math.floor(r() * 6);
      g.set(ox + x, y, r() < 0.5 ? 0xffd060 : 0xff8a3a, 200);
    }
  }
  return g.toCanvas();
}

/** 불 받침: 돌 고리 + 재 (바닥 장식, 30×14, 원점 가운데) */
export function campfireRing(): HTMLCanvasElement {
  const g = new Grid(30, 14);
  // 그을린 바닥
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 30; x++) {
      const dx = (x + 0.5 - 15) / 14;
      const dy = (y + 0.5 - 7) / 6.5;
      const d = dx * dx + dy * dy;
      if (d <= 1) g.set(x, y, d < 0.45 ? 0x2a2422 : 0x3a3430, d < 0.45 ? 230 : 120);
    }
  // 돌 고리
  const r = rng(77);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = Math.round(15 + Math.cos(a) * 11.5);
    const y = Math.round(7 + Math.sin(a) * 4.6);
    const c = r() < 0.4 ? STONE.hi : r() < 0.7 ? STONE.mid : STONE.lo;
    g.rect(x - 1, y - 1, 3, 2, c);
    g.set(x - 1, y, STONE.lo);
  }
  // 재 속 잉걸
  for (const [x, y] of [[12, 7], [17, 6], [15, 8], [19, 8]]) g.set(x, y, 0xb04a24);
  return g.toCanvas();
}

/** 통나무 의자 (2인, 34×11): 껍질 결 + 양 끝 나이테 */
export function logSeat(): HTMLCanvasElement {
  const g = new Grid(34, 11);
  const bark = { hi: 0x8a6a48, mid: 0x6e5236, lo: 0x4e3a26 };
  g.rect(2, 2, 30, 6, bark.mid);
  g.hline(3, 30, 2, bark.hi);
  g.hline(3, 30, 3, bark.hi);
  g.hline(2, 31, 7, bark.lo);
  const r = rng(41);
  for (let i = 0; i < 16; i++) g.set(4 + Math.floor(r() * 26), 3 + Math.floor(r() * 4), r() < 0.5 ? bark.lo : bark.hi);
  for (const ex of [1, 31]) {
    g.rect(ex, 2, 2, 6, 0xc8a878);
    g.set(ex, 4, 0x9a7a52);
    g.set(ex + 1, 5, 0x9a7a52);
  }
  g.outline(WOOD.line);
  shadow(g, 17, 9.5, 16, 1.2, 60);
  return g.toCanvas();
}

/** 그루터기 (1인, 14×11) */
export function stumpSeat(): HTMLCanvasElement {
  const g = new Grid(14, 11);
  g.rect(2, 3, 10, 5, 0x6e5236);
  g.vline(2, 3, 7, 0x4e3a26);
  g.vline(11, 3, 7, 0x4e3a26);
  g.ellipse(6.5, 2.5, 5, 1.6, 0xc8a878);
  g.set(6, 2, 0x9a7a52);
  g.set(7, 3, 0x9a7a52);
  g.set(4, 2, 0xdcc08e);
  g.outline(WOOD.line);
  shadow(g, 7, 9.5, 6, 1.1, 60);
  return g.toCanvas();
}

/** 연기 한 줌 (12×12, 부드러운 회색) */
export function smokePuff(): HTMLCanvasElement {
  const g = new Grid(12, 12);
  g.ellipse(6, 6, 5, 4.5, 0xb8b4ae, 120);
  g.ellipse(5, 5, 3, 2.5, 0xd0ccc6, 150);
  return g.toCanvas();
}

/** 반딧불 항아리·횃불 등 빛 색 */
export const TORCH_TINT = 0xffa850;
export const JAR_TINT = 0xd8f080;

// ── 텍스처 키 (manifest가 WORLD_PROP_ART를 코드 생성 항목으로 등록한다) ──
export const WP = {
  autumn0: "prop-autumn-0",
  autumn1: "prop-autumn-1",
  blossom0: "prop-blossom-0",
  blossom1: "prop-blossom-1",
  pine0: "prop-pine-0",
  pine1: "prop-pine-1",
  bush0: "prop-bush-0",
  bush1: "prop-bush-1",
  bush2: "prop-bush-2",
  well: "prop-well",
  swing: "prop-swing",
  swingSeat: "prop-swing-seat",
  bell: "prop-bell",
  cairn0: "prop-cairn-0",
  cairn1: "prop-cairn-1",
  flowers0: "prop-flowers-0",
  flowers1: "prop-flowers-1",
  flowers2: "prop-flowers-2",
  mushroom0: "prop-mushroom-0",
  mushroom1: "prop-mushroom-1",
  scarecrow: "prop-scarecrow",
  bridge: "prop-bridge",
  reeds0: "prop-reeds-0",
  reeds1: "prop-reeds-1",
  jar: "prop-jar",
  cave: "place-cave",
  office: "place-office",
  shrineTree: "place-shrine-tree",
  fire: "prop-campfire",
  fireRing: "prop-campfire-ring",
  logSeat: "prop-log-seat",
  stumpSeat: "prop-stump-seat",
  smoke: "fx-smoke-puff",
} as const;

export const WORLD_PROP_ART: Readonly<Record<string, () => HTMLCanvasElement>> = {
  [WP.autumn0]: () => autumnTree(0),
  [WP.autumn1]: () => autumnTree(1),
  [WP.blossom0]: () => blossomTree(0),
  [WP.blossom1]: () => blossomTree(1),
  [WP.pine0]: () => pine(0),
  [WP.pine1]: () => pine(1),
  [WP.bush0]: () => bush(0),
  [WP.bush1]: () => bush(1),
  [WP.bush2]: () => bush(2),
  [WP.well]: well,
  [WP.swing]: swing,
  [WP.swingSeat]: swingSeat,
  [WP.bell]: bellTower,
  [WP.cairn0]: () => cairn(0),
  [WP.cairn1]: () => cairn(1),
  [WP.flowers0]: () => flowerBed(0),
  [WP.flowers1]: () => flowerBed(1),
  [WP.flowers2]: () => flowerBed(2),
  [WP.mushroom0]: () => mushrooms(0),
  [WP.mushroom1]: () => mushrooms(1),
  [WP.scarecrow]: scarecrow,
  [WP.bridge]: bridge,
  [WP.reeds0]: () => reeds(0),
  [WP.reeds1]: () => reeds(1),
  [WP.jar]: fireflyJar,
  [WP.cave]: caveGate,
  [WP.office]: officeHut,
  [WP.shrineTree]: shrineTree,
  [WP.fireRing]: campfireRing,
  [WP.logSeat]: logSeat,
  [WP.stumpSeat]: stumpSeat,
  [WP.smoke]: smokePuff,
};

/** 프레임으로 나뉜 시트 (manifest가 frameW/H와 함께 등록한다) */
export const WORLD_PROP_SHEETS: Readonly<Record<string, { build: () => HTMLCanvasElement; frameW: number; frameH: number }>> = {
  [WP.fire]: { build: campfireSheet, frameW: FIRE_W, frameH: FIRE_H },
};
