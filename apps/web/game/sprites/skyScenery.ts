import { darken, Grid, lighten, mix, rng, type Color } from "./pixel";

// 놀이기구 2 탑승 중 장면 (옆에서 본 2D 도트 풍경) 그림 — 코드로 그린다. SkyStage가 탈 때 한 번 만들어 텍스처로 캐시하고 층을 움직이기만 한다.
//  - 모든 색은 낮 기준. 시간대·날씨 색은 SkyStage가 층마다 곱해(tint) 입히고, 밤 불빛은 따로 그린 불빛 층(lights)을 밤에만 켠다
//  - 층(Band): 위쪽에 솟은 것(나무·지붕·비석)과 아래로 이어지는 땅. 땅 아래는 SkyStage가 fill 색 사각형으로 채운다
//  - 가로로 이어 붙는 층은 wrap(끝과 처음이 이어지게) 그린다

export type Spot = { x: number; y: number };
export type Band = {
  w: number;
  h: number;
  base: HTMLCanvasElement;
  /** 밤 불빛 (창문·가로등·촛불) */
  lights: HTMLCanvasElement;
  /** 물 반짝임 두 장 (번갈아 켠다) — 없으면 null */
  glint: [HTMLCanvasElement, HTMLCanvasElement] | null;
  /** 불꽃 애니메이션을 얹을 자리 (불꽃 아래 가운데) */
  fires: (Spot & { big: boolean })[];
  /** 땅 아래를 채우는 색 */
  fill: Color;
};

const OUT = 0x24231f;
const GRASS = { hi: 0x75804f, mid: 0x626d45, lo: 0x515a3a, dark: 0x434b31 };
const TREE = { hi: 0x6c8448, mid: 0x55693b, lo: 0x435331, trunk: 0x5c432d };
const PINE = { hi: 0x5a7448, mid: 0x46593a, lo: 0x37472f, trunk: 0x4e3a28 };
const STONE = { hi: 0xb0aea2, mid: 0x908e83, lo: 0x6c6b63 };
const WATER = { hi: 0x9cc2d6, mid: 0x5481a0, lo: 0x426a87, deep: 0x395b75 };
const WOOD = { hi: 0x9a7854, mid: 0x7d5e40, lo: 0x5c432d };
const COBBLE = { a: 0x7b746b, b: 0x6a645b, line: 0x544f48 };
const DIRT = { hi: 0x86735a, mid: 0x6c5b46, lo: 0x584a39 };
const IRON = 0x2f2f36;
const WALL = { hi: 0xd6c6a6, mid: 0xc0ae8e, lo: 0x9c8c70 };
const ROOFS: readonly Color[] = [0x8f4c43, 0x56647f, 0x7a5b3c, 0x6d4f70, 0x4f6b5a];
const WINDOW = 0x3a3d4a;
const LIGHT = 0xffd98a;
const CANDLE = 0xffaa4c;
const LAMP = 0xfff0b8;
const SILHOUETTE = 0x3d3a3c;

// ── 그리기 도구 ──

type Light = { x: number; y: number; c: Color; glow?: boolean };
type Spr = { g: Grid; ax: number; ay: number; lights?: Light[]; fire?: Spot & { big: boolean } };

/** 층 하나를 그리는 붓: 가로 wrap, 불빛·반짝임 층을 함께 들고 다닌다 */
class Pen {
  readonly g: Grid;
  readonly lit: Grid;
  readonly glA: Grid;
  readonly glB: Grid;
  readonly fires: (Spot & { big: boolean })[] = [];
  private glints = 0;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly wrap: boolean,
  ) {
    this.g = new Grid(w, h);
    this.lit = new Grid(w, h);
    this.glA = new Grid(w, h);
    this.glB = new Grid(w, h);
  }
  x(x: number): number {
    x = Math.floor(x);
    return this.wrap ? ((x % this.w) + this.w) % this.w : x;
  }
  set(x: number, y: number, c: Color, a = 255): void {
    this.g.set(this.x(x), y, c, a);
  }
  rect(x: number, y: number, w: number, h: number, c: Color, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, a = 255): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
  }
  light(x: number, y: number, c: Color = LIGHT, glow = false): void {
    const X = this.x(x);
    this.lit.set(X, y, c);
    if (!glow) return;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      if ((this.lit.get(this.x(x + dx), y + dy) & 255) === 0) this.lit.set(this.x(x + dx), y + dy, c, 120);
  }
  glint(x: number, y: number, len = 2): void {
    const g = this.glints++ % 2 ? this.glB : this.glA;
    for (let i = 0; i < len; i++) g.set(this.x(x + i), y, 0xe8f4ff, 230);
  }
  /** 작은 그림을 바닥 가운데(ax, ay)가 (x, ground)에 오게 찍는다 */
  stamp(s: Spr, x: number, ground: number): void {
    const ox = Math.round(x) - s.ax;
    const oy = Math.round(ground) - s.ay;
    for (let y = 0; y < s.g.h; y++)
      for (let i = 0; i < s.g.w; i++) {
        const v = s.g.px[y * s.g.w + i];
        if ((v & 255) === 0) continue;
        const ty = y + oy;
        if (ty < 0 || ty >= this.h) continue;
        const tx = this.x(i + ox);
        if (tx < 0 || tx >= this.w) continue;
        this.g.px[ty * this.w + tx] = v;
      }
    for (const l of s.lights ?? []) this.light(ox + l.x, oy + l.y, l.c, l.glow);
    if (s.fire) this.fires.push({ x: this.x(ox + s.fire.x), y: oy + s.fire.y, big: s.fire.big });
  }
  band(fill: Color): Band {
    const hasGlint = this.glints > 0;
    return {
      w: this.w,
      h: this.h,
      base: this.g.toCanvas(),
      lights: this.lit.toCanvas(),
      glint: hasGlint ? [this.glA.toCanvas(), this.glB.toCanvas()] : null,
      fires: this.fires,
      fill,
    };
  }
}

/** 가로로 이어지는(주기 w) 부드러운 높낮이 */
function ridge(x: number, w: number, seed: number, amp: number, ks: readonly number[]): number {
  let v = 0;
  let norm = 0;
  ks.forEach((k, i) => {
    const a = 1 / (i + 1);
    v += a * Math.sin((2 * Math.PI * k * x) / w + seed * (i + 1.7));
    norm += a;
  });
  return (v / norm) * amp;
}

// ── 작은 그림들 (바닥 가운데가 기준점) ──

function tree(r: number, seed: number, pal = TREE): Spr {
  const R = rng(seed);
  const trunkH = Math.max(2, Math.round(r * 0.55));
  const w = r * 2 + 5;
  const h = r * 2 + trunkH + 3;
  const g = new Grid(w, h);
  const cx = w / 2;
  const cy = r + 1.5;
  g.rect(Math.floor(cx) - 1, Math.floor(cy + r * 0.4), 2, h - Math.floor(cy + r * 0.4), pal.trunk);
  g.ellipse(cx, cy, r, r * 0.92, pal.mid);
  g.ellipse(cx - r * 0.5, cy + r * 0.3, r * 0.6, r * 0.55, pal.mid);
  g.ellipse(cx + r * 0.5, cy + r * 0.25, r * 0.62, r * 0.6, pal.mid);
  const canopy = (y: number) => y < cy + r * 0.9;
  g.recolor((x, y) => canopy(y) && (x - cx) * 0.45 + (y - cy) > r * 0.3, pal.lo);
  g.recolor((x, y) => canopy(y) && (x - cx) + (y - cy) * 1.2 < -r * 0.5, pal.hi);
  for (let i = 0; i < r * 2; i++) {
    const x = Math.floor(cx - r + R() * r * 2);
    const y = Math.floor(cy - r + R() * r * 1.6);
    if (g.filled(x, y) && canopy(y)) g.set(x, y, R() < 0.5 ? pal.hi : pal.lo);
  }
  g.outline(OUT);
  return { g, ax: Math.floor(cx), ay: h - 1 };
}

function pine(h: number, pal = PINE): Spr {
  const w = Math.round(h * 0.6) | 1;
  const g = new Grid(w + 2, h + 3);
  const cx = Math.floor((w + 2) / 2);
  g.rect(cx, h - 1, 1, 3, pal.trunk);
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const top = Math.round((t * h) / (tiers + 1));
    const bot = Math.round(((t + 2) * h) / (tiers + 1));
    for (let y = top; y <= bot; y++) {
      const half = Math.round(((y - top) / (bot - top)) * (w / 2) * (0.6 + 0.4 * ((t + 1) / tiers)));
      for (let x = cx - half; x <= cx + half; x++) g.set(x, y, x < cx ? pal.hi : x > cx + half / 2 ? pal.lo : pal.mid);
    }
  }
  g.outline(OUT);
  return { g, ax: cx, ay: h + 1 };
}

function bush(r: number): Spr {
  const g = new Grid(r * 2 + 3, r + 3);
  g.ellipse(r + 1.5, r + 1, r, r * 0.8, TREE.mid);
  g.recolor((x, y) => y > r, TREE.lo);
  g.set(r, 2, TREE.hi);
  g.set(r - 1, 3, TREE.hi);
  g.outline(OUT);
  return { g, ax: r + 1, ay: r + 2 };
}

function house(w: number, wallH: number, roof: Color, lit: boolean): Spr {
  const roofH = Math.max(3, Math.round(w * 0.42));
  const W = w + 4;
  const g = new Grid(W, wallH + roofH + 3);
  const top = roofH + 1;
  g.rect(2, top, w, wallH, WALL.mid);
  g.rect(2, top, w, 1, WALL.lo);
  g.rect(2 + w - 2, top, 2, wallH, WALL.lo);
  for (let i = 0; i <= roofH; i++) {
    const half = Math.round(((i + 1) / (roofH + 1)) * (w / 2 + 1));
    for (let x = W / 2 - half; x < W / 2 + half; x++) g.set(x, i + 1, i === roofH ? darken(roof, 0.25) : x < W / 2 ? lighten(roof, 0.12) : roof);
  }
  const lights: Light[] = [];
  const winY = top + Math.max(1, Math.floor(wallH / 2) - 1);
  const wins = w >= 10 ? [3, w - 3] : [Math.floor(w / 2) + 1];
  for (const wx of wins) {
    g.rect(wx, winY, 2, 2, WINDOW);
    if (lit) {
      lights.push({ x: wx, y: winY, c: LIGHT }, { x: wx + 1, y: winY, c: LIGHT }, { x: wx, y: winY + 1, c: LIGHT }, { x: wx + 1, y: winY + 1, c: LIGHT });
    }
  }
  if (w >= 8) g.rect(Math.floor(W / 2) - 1, top + wallH - 3, 2, 3, WOOD.lo);
  if (w >= 12) g.rect(W - 6, 0, 2, 3, darken(roof, 0.3));
  g.outline(OUT);
  return { g, ax: Math.floor(W / 2), ay: top + wallH - 1, lights };
}

function grave(kind: number, big = false): Spr {
  const w = big ? 7 : 5;
  const h = big ? 9 : 7;
  const g = new Grid(w + 2, h + 2);
  if (kind % 3 === 2) {
    // 십자
    const cx = Math.floor((w + 2) / 2);
    g.rect(cx, 1, 1, h, STONE.mid);
    g.rect(cx - 2, 3, 5, 1, STONE.mid);
    g.set(cx, 1, STONE.hi);
  } else {
    g.rect(1, 2, w, h - 1, STONE.mid);
    g.rect(2, 1, w - 2, 1, STONE.mid);
    g.rect(1, 2, 1, h - 1, STONE.hi);
    g.rect(w, 2, 1, h - 1, STONE.lo);
    if (kind % 3 === 1) g.rect(2, 4, w - 2, 1, STONE.lo);
  }
  g.outline(OUT);
  return { g, ax: Math.floor((w + 2) / 2), ay: h + 1, lights: kind % 4 === 0 ? [{ x: w + 1, y: h, c: CANDLE }] : [] };
}

function lamp(h: number): Spr {
  const g = new Grid(5, h + 2);
  g.rect(2, 3, 1, h - 2, IRON);
  g.rect(1, h, 3, 1, IRON);
  g.rect(1, 1, 3, 2, LAMP);
  g.set(2, 0, IRON);
  g.outline(OUT);
  return { g, ax: 2, ay: h, lights: [{ x: 1, y: 1, c: LAMP, glow: true }, { x: 2, y: 1, c: LAMP, glow: true }, { x: 3, y: 2, c: LAMP, glow: true }] };
}

function stall(w: number, color: Color): Spr {
  const h = 18;
  const g = new Grid(w + 2, h + 2);
  // 기둥
  g.rect(2, 6, 1, h - 6, WOOD.lo);
  g.rect(w - 1, 6, 1, h - 6, WOOD.lo);
  // 차양 (줄무늬)
  for (let y = 1; y < 6; y++) for (let x = 1; x <= w; x++) g.set(x, y, Math.floor((x - 1) / 3) % 2 ? 0xeee2cc : color);
  for (let x = 1; x <= w; x += 3) g.set(x + 1, 6, Math.floor((x - 1) / 3) % 2 ? 0xeee2cc : color);
  // 판대
  g.rect(1, h - 7, w, 4, WOOD.mid);
  g.rect(1, h - 7, w, 1, WOOD.hi);
  for (let x = 3; x < w - 1; x += 3) g.set(x, h - 8, [0xd9832e, 0xc94a4a, 0xe8c45a][x % 3]);
  g.outline(OUT);
  return { g, ax: Math.floor((w + 2) / 2), ay: h - 1, lights: [{ x: 3, y: 6, c: LIGHT, glow: true }, { x: w - 2, y: 6, c: LIGHT, glow: true }] };
}

function campfire(big: boolean): Spr {
  const w = big ? 22 : 12;
  const g = new Grid(w + 2, big ? 9 : 6);
  const cx = (w + 2) / 2;
  const cy = big ? 5 : 3;
  g.ellipse(cx, cy, w / 2, big ? 3.5 : 2.2, STONE.mid);
  g.ellipse(cx, cy - 0.5, w / 2 - 2, big ? 2.2 : 1.2, 0x3a2a20);
  // 장작
  for (let i = -2; i <= 2; i++) g.set(Math.floor(cx + i * (big ? 2 : 1)), cy - (Math.abs(i) < 2 ? 1 : 0), WOOD.lo);
  g.outline(OUT);
  return { g, ax: Math.floor(cx), ay: g.h - 1, fire: { x: Math.floor(cx), y: cy, big }, lights: [{ x: Math.floor(cx), y: cy, c: CANDLE, glow: true }] };
}

function ironFence(p: Pen, x0: number, x1: number, y: number, h = 5): void {
  for (let x = Math.floor(x0); x <= x1; x++) {
    p.set(x, y - h + 1, IRON);
    if ((x - Math.floor(x0)) % 2 === 0) for (let j = 0; j < h; j++) p.set(x, y - j, IRON);
    if ((x - Math.floor(x0)) % 2 === 0) p.set(x, y - h, IRON);
  }
}

function woodFence(p: Pen, x0: number, x1: number, y: number, h = 6): void {
  for (let x = Math.floor(x0); x <= x1; x++) {
    p.set(x, y - h + 2, WOOD.mid);
    p.set(x, y - 2, WOOD.mid);
    if ((x - Math.floor(x0)) % 6 === 0) {
      for (let j = 0; j <= h; j++) p.set(x, y - j, j === h ? WOOD.hi : WOOD.lo);
      p.set(x + 1, y - h, OUT);
    }
  }
}

type Animal = "giraffe" | "elephant" | "deer" | "bear";
function animal(kind: Animal): Spr {
  const c = SILHOUETTE;
  const hi = 0x57524f;
  let g: Grid;
  if (kind === "giraffe") {
    g = new Grid(14, 22);
    g.rect(3, 12, 8, 4, c);
    for (const lx of [3, 5, 8, 10]) g.rect(lx, 16, 1, 6, c);
    for (let i = 0; i < 10; i++) g.rect(9 + Math.floor(i / 4), 11 - i, 2, 1, c);
    g.rect(11, 0, 3, 2, c);
    g.set(11, 0, hi);
    g.rect(3, 12, 8, 1, hi);
  } else if (kind === "elephant") {
    g = new Grid(18, 13);
    g.ellipse(8, 6, 7, 4.5, c);
    for (const lx of [3, 5, 10, 12]) g.rect(lx, 9, 2, 4, c);
    g.ellipse(14, 4, 3, 3, c);
    g.rect(16, 5, 1, 6, c);
    g.rect(17, 10, 1, 1, c);
    g.rect(4, 2, 7, 1, hi);
  } else if (kind === "deer") {
    g = new Grid(12, 13);
    g.rect(2, 6, 7, 3, c);
    for (const lx of [2, 4, 7, 8]) g.rect(lx, 9, 1, 4, c);
    g.rect(8, 3, 2, 4, c);
    g.rect(9, 2, 3, 2, c);
    g.set(8, 0, c);
    g.set(9, 1, c);
    g.set(11, 0, c);
    g.set(10, 1, c);
    g.rect(2, 6, 7, 1, hi);
  } else {
    g = new Grid(13, 10);
    g.ellipse(6, 5, 5.5, 3.5, c);
    for (const lx of [2, 4, 8, 10]) g.rect(lx, 7, 2, 3, c);
    g.ellipse(11, 3, 2, 2, c);
    g.set(10, 0, c);
    g.rect(2, 2, 6, 1, hi);
  }
  return { g, ax: Math.floor(g.w / 2), ay: g.h - 1 };
}

function pumpkin(): Spr {
  const g = new Grid(6, 5);
  g.ellipse(3, 3, 2.6, 1.8, 0xd9832e);
  g.set(2, 3, 0xb86622);
  g.set(3, 1, 0x5a7a3a);
  g.outline(0x5a3a1c);
  return { g, ax: 3, ay: 4 };
}

function boat(): Spr {
  const g = new Grid(16, 6);
  for (let y = 0; y < 3; y++) g.rect(1 + y, 2 + y, 14 - y * 2, 1, y === 0 ? WOOD.hi : WOOD.mid);
  g.rect(7, 0, 1, 2, WOOD.lo);
  g.outline(OUT);
  return { g, ax: 8, ay: 4 };
}

function telescope(): Spr {
  const g = new Grid(10, 10);
  for (let i = 0; i < 6; i++) g.rect(2 + i, 5 - Math.floor(i / 2), 2, 2, 0x8a7a5a);
  g.set(8, 2, 0xd8c890);
  g.rect(4, 7, 1, 3, WOOD.lo);
  g.rect(6, 7, 1, 3, WOOD.lo);
  g.outline(OUT);
  return { g, ax: 5, ay: 9 };
}

function waterRows(p: Pen, x0: number, x1: number, y0: number, y1: number, seed: number): void {
  const R = rng(seed);
  for (let y = y0; y < y1; y++) {
    const c = y === y0 ? WATER.hi : y < y0 + 2 ? WATER.mid : y > y1 - 4 ? WATER.deep : WATER.lo;
    for (let x = Math.floor(x0); x < x1; x++) p.set(x, y, c);
  }
  // 물결
  const n = Math.floor(((x1 - x0) * (y1 - y0)) / 40);
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0 - 3);
    const y = Math.floor(y0 + 2 + R() * (y1 - y0 - 3));
    const len = 2 + Math.floor(R() * 4);
    for (let k = 0; k < len; k++) p.set(x + k, y, WATER.mid);
    if (R() < 0.45) p.glint(x + 1, y, Math.min(3, len));
  }
}

function grassBody(p: Pen, x0: number, x1: number, y0: number, seed: number, pal = GRASS): void {
  const R = rng(seed);
  for (let x = Math.floor(x0); x < x1; x++) {
    p.set(x, y0, pal.hi);
    for (let y = y0 + 1; y < p.h; y++) p.set(x, y, y < y0 + 3 ? pal.mid : pal.mid);
  }
  const n = Math.floor(((x1 - x0) * (p.h - y0)) / 18);
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0);
    const y = Math.floor(y0 + 2 + R() * (p.h - y0 - 2));
    p.set(x, y, R() < 0.5 ? pal.lo : pal.hi);
    if (R() < 0.3) p.set(x, y - 1, pal.lo);
  }
}

// ── 공통: 먼 산 능선 · 하늘 ──

/** 먼 산 능선 두 겹 (가로로 이어짐) */
export function mountains(w = 384, h = 64, seed = 3): Band {
  const p = new Pen(w, h, true);
  const back = 0x8b97a8;
  const front = 0x6f7f87;
  for (let x = 0; x < w; x++) {
    const tb = Math.round(h * 0.28 + ridge(x, w, seed, h * 0.2, [2, 5, 11]));
    for (let y = Math.max(0, tb); y < h; y++) p.set(x, y, y < tb + 2 && tb < h * 0.2 ? 0xdfe6ea : back);
    const tf = Math.round(h * 0.55 + ridge(x, w, seed + 4, h * 0.16, [3, 7, 13]));
    for (let y = Math.max(0, tf); y < h; y++) p.set(x, y, y === tf ? lighten(front, 0.15) : front);
  }
  return p.band(front);
}

/** 하늘 그라데이션 (위 → 지평선, 도트 디더링 띠). 높이 h, 지평선 hz 아래는 지평선 색 */
export function skyGradient(h: number, hz: number, top: Color, mid: Color, low: Color): HTMLCanvasElement {
  const g = new Grid(8, h);
  const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const N = 14;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 8; x++) {
      const t = Math.min(1, y / Math.max(1, hz));
      const v = t * N + (B[(y % 4) * 4 + (x % 4)] / 16 - 0.5);
      const q = Math.max(0, Math.min(N, Math.round(v))) / N;
      const c = q < 0.55 ? mix(top, mid, q / 0.55) : mix(mid, low, (q - 0.55) / 0.45);
      g.set(x, y, c);
    }
  }
  return g.toCanvas();
}

export function stars(w = 256, h = 128, seed = 7): HTMLCanvasElement {
  const g = new Grid(w, h);
  const R = rng(seed);
  for (let i = 0; i < (w * h) / 90; i++) {
    const x = Math.floor(R() * w);
    const y = Math.floor(R() * h);
    const b = R();
    g.set(x, y, b > 0.8 ? 0xfff6d8 : 0xdfe6ff, Math.round(110 + b * 145));
    if (b > 0.96) {
      g.set(x + 1, y, 0xdfe6ff, 120);
      g.set(x - 1, y, 0xdfe6ff, 120);
      g.set(x, y + 1, 0xdfe6ff, 120);
      g.set(x, y - 1, 0xdfe6ff, 120);
    }
  }
  return g.toCanvas();
}

export function moon(): HTMLCanvasElement {
  const g = new Grid(14, 14);
  g.ellipse(7, 7, 6, 6, 0xf4eed2);
  // 초승달: 오른쪽 위를 파낸다
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) if (((x + 0.5 - 9.5) / 5) ** 2 + ((y + 0.5 - 5.5) / 5.5) ** 2 <= 1) g.px[y * 14 + x] = 0;
  g.set(4, 8, 0xd8d0b0);
  g.set(5, 10, 0xd8d0b0);
  return g.toCanvas();
}

export function sun(): HTMLCanvasElement {
  const g = new Grid(18, 18);
  g.ellipse(9, 9, 8.5, 8.5, 0xffd9a0, 90);
  g.ellipse(9, 9, 6, 6, 0xffe9b8);
  g.ellipse(8, 8, 3, 3, 0xfff6dc);
  return g.toCanvas();
}

export function cloud(v: number): HTMLCanvasElement {
  const R = rng(31 + v * 17);
  const w = [44, 60, 34, 72][v % 4];
  const h = Math.round(w * 0.42);
  const g = new Grid(w, h);
  const base = h - 2;
  const n = 5 + (v % 3);
  // 둥근 덩어리 여러 개 (가운데가 크고 높게, 가장자리는 작게), 바닥은 납작하게 자른다
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const cx = 4 + (w - 8) * k + (R() - 0.5) * 3;
    const r = (h - 3) * (0.22 + 0.5 * Math.sin(k * Math.PI) ** 1.5) * (0.85 + R() * 0.3);
    g.ellipse(cx, base - r * 0.7, r * 1.1, r, 0xf2f4f6);
  }
  g.ellipse(w / 2, base - 1.5, w / 2 - 5, 2.5, 0xf2f4f6);
  for (let y = base + 1; y < h; y++) for (let x = 0; x < w; x++) g.px[y * w + x] = 0;
  g.recolor((_x, y) => y >= base - 2, 0xd3dbe3);
  g.recolor((x, y) => !g.filled(x, y - 2) && y < base - 3, 0xffffff);
  return g.toCanvas();
}

/** 새: 날개 위·아래 두 프레임 (가로로 붙인 시트, 한 칸 7×4) */
export function birdSheet(): HTMLCanvasElement {
  const g = new Grid(14, 4);
  const c = 0x2c2b30;
  // 날개 위
  g.set(0, 0, c);
  g.set(1, 1, c);
  g.set(2, 2, c);
  g.set(3, 2, c);
  g.set(4, 1, c);
  g.set(5, 0, c);
  g.set(3, 3, c);
  // 날개 아래
  g.set(7, 2, c);
  g.set(8, 1, c);
  g.set(9, 1, c);
  g.set(10, 1, c);
  g.set(11, 1, c);
  g.set(12, 2, c);
  g.set(10, 2, c);
  return g.toCanvas();
}

/** 불꽃 시트 3프레임 (가로). big = 광장 큰 모닥불 */
export const FIRE_W = { small: 8, big: 14 } as const;
export const FIRE_H = { small: 11, big: 20 } as const;
export function fireSheet(big: boolean): HTMLCanvasElement {
  const w = big ? FIRE_W.big : FIRE_W.small;
  const h = big ? FIRE_H.big : FIRE_H.small;
  const g = new Grid(w * 3, h);
  for (let f = 0; f < 3; f++) {
    const ox = f * w;
    const cx = w / 2 + (f === 1 ? 0.5 : f === 2 ? -0.5 : 0);
    const tongues = [
      { dx: 0, hh: h - 1 - f },
      { dx: -w * 0.22, hh: h * (0.62 + 0.1 * f) },
      { dx: w * 0.22, hh: h * (0.72 - 0.08 * f) },
    ];
    for (const t of tongues) {
      for (let y = 0; y < t.hh; y++) {
        const k = y / t.hh;
        const half = (w * 0.36 * (1 - k * k)) / (t.dx ? 1.6 : 1);
        for (let x = Math.floor(cx + t.dx - half); x <= cx + t.dx + half; x++) {
          const yy = h - 1 - y;
          const inner = Math.abs(x + 0.5 - cx - t.dx) < half * 0.45 && k < 0.6;
          g.set(ox + x, yy, inner ? (k < 0.3 ? 0xfff4c0 : 0xffd060) : k > 0.7 ? 0xd85a24 : 0xf08a2a);
        }
      }
    }
  }
  return g.toCanvas();
}

/** 버너 불꽃 3프레임 (가로, 위로 뿜는다) */
export const JET_W = 12;
export const JET_H = 26;
export function jetSheet(): HTMLCanvasElement {
  const g = new Grid(JET_W * 3, JET_H);
  for (let f = 0; f < 3; f++) {
    const ox = f * JET_W;
    const hh = JET_H - 1 - f * 3;
    for (let y = 0; y < hh; y++) {
      const k = y / hh;
      const half = 1.2 + 4 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.9) * (1 - k * 0.5) + (f === 1 && k > 0.5 ? 0.6 : 0);
      for (let x = Math.floor(JET_W / 2 - half); x <= JET_W / 2 + half; x++) {
        const yy = JET_H - 1 - y;
        const inner = Math.abs(x + 0.5 - JET_W / 2) < half * 0.45;
        const c = k < 0.18 ? (inner ? 0xd8ecff : 0x7fa8ff) : inner ? (k < 0.5 ? 0xfff4c0 : 0xffd060) : k > 0.75 ? 0xe0642a : 0xf59a32;
        g.set(ox + x, yy, c);
      }
    }
  }
  return g.toCanvas();
}

export function rainTile(): HTMLCanvasElement {
  const g = new Grid(64, 64);
  const R = rng(91);
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(R() * 64);
    const y = Math.floor(R() * 64);
    for (let k = 0; k < 4; k++) g.set((x - Math.floor(k / 2) + 64) % 64, (y + k) % 64, 0xc8daf0, 150);
  }
  return g.toCanvas();
}

export function snowTile(): HTMLCanvasElement {
  const g = new Grid(64, 64);
  const R = rng(57);
  for (let i = 0; i < 34; i++) {
    const x = Math.floor(R() * 64);
    const y = Math.floor(R() * 64);
    g.set(x, y, 0xffffff, 230);
    if (R() < 0.3) {
      g.set(x + 1, y, 0xffffff, 200);
      g.set(x, y + 1, 0xffffff, 200);
      g.set(x + 1, y + 1, 0xffffff, 160);
    }
  }
  return g.toCanvas();
}

// ── 관람차: 창밖 세 층 ──

/** 먼 층: 언덕·호수 */
export function ferrisFar(w = 512, h = 64): Band {
  const p = new Pen(w, h, true);
  const R = rng(11);
  const hill = { hi: 0x82906a, mid: 0x6e7c58, lo: 0x5f6c4c };
  for (let x = 0; x < w; x++) {
    const t = Math.round(18 + ridge(x, w, 2, 9, [1, 3, 6]));
    for (let y = t; y < h; y++) p.set(x, y, y === t ? hill.hi : y > t + 14 ? hill.lo : hill.mid);
  }
  // 호수 (가운데 골짜기)
  const lx = 300;
  for (let y = 36; y < 50; y++) {
    const half = 92 * Math.sqrt(Math.max(0, 1 - ((y - 36) / 14) ** 2));
    for (let x = lx - half; x < lx + half; x++) p.set(x, y, y === 36 ? WATER.hi : y < 39 ? 0x7aa0bc : 0x648cab);
  }
  for (let i = 0; i < 26; i++) p.glint(lx - 80 + R() * 160, 38 + Math.floor(R() * 9), 2 + Math.floor(R() * 3));
  // 앞 낮은 언덕 (호수 양옆)
  for (let x = 0; x < w; x++) {
    const d = Math.abs(((x - lx + w * 1.5) % w) - w / 2);
    if (d > w / 2 - 70) continue;
    const t = Math.round(44 + ridge(x, w, 6, 4, [2, 5]) + Math.max(0, 70 - (w / 2 - d)) * 0.1);
    for (let y = t; y < h; y++) p.set(x, y, y === t ? hill.mid : hill.lo);
  }
  // 나무 점·작은 집
  for (let i = 0; i < 60; i++) {
    const x = R() * w;
    if (Math.abs(x - lx) < 96) continue;
    const t = Math.round(18 + ridge(x, w, 2, 9, [1, 3, 6]));
    const y = t + 1 + Math.floor(R() * 20);
    p.ellipse(x, y, 2, 1.5, R() < 0.5 ? 0x4e5c3c : 0x56653f);
  }
  for (const hx of [70, 96, 130, 420, 452]) {
    const t = Math.round(18 + ridge(hx, w, 2, 9, [1, 3, 6])) + 6;
    p.rect(hx, t, 4, 3, WALL.lo);
    p.rect(hx - 1, t - 1, 6, 1, ROOFS[hx % ROOFS.length]);
    p.light(hx + 1, t + 1, LIGHT);
  }
  return p.band(hill.lo);
}

/** 중간 층: 집들·동물원 울타리·묘역 비석 줄 / 그 아래 강물 반짝임 */
export function ferrisMid(w = 512, h = 150): Band {
  const p = new Pen(w, h, true);
  const R = rng(23);
  const y0 = 26;
  grassBody(p, 0, w, y0, 5);
  // 집들 (왼쪽)
  for (let i = 0; i < 7; i++) {
    const x = 14 + i * 27 + Math.floor(R() * 6);
    p.stamp(tree(5 + Math.floor(R() * 3), 40 + i, TREE), x - 12, y0 + 3);
    p.stamp(house(12 + Math.floor(R() * 5), 8 + Math.floor(R() * 3), ROOFS[i % ROOFS.length], true), x, y0 + 4 + (i % 2));
  }
  // 동물원 울타리 + 동물
  const zx0 = 214;
  const zx1 = 318;
  p.stamp(animal("giraffe"), zx0 + 24, y0 + 7);
  p.stamp(animal("elephant"), zx0 + 58, y0 + 8);
  p.stamp(animal("deer"), zx0 + 86, y0 + 8);
  woodFence(p, zx0, zx1, y0 + 9);
  // 묘역: 철책 + 비석 세 줄
  const gx0 = 336;
  const gx1 = 500;
  p.stamp(tree(7, 77, { ...TREE, mid: 0x4f5e3c, hi: 0x5f6e48 }), gx1 - 4, y0 + 2);
  ironFence(p, gx0, gx1, y0 + 1);
  for (let row = 0; row < 3; row++) {
    const gy = y0 + 9 + row * 9;
    for (let x = gx0 + 6 + row * 2; x < gx1 - 6; x += 12 + row) p.stamp(grave((x + row * 7) % 7, row === 2), x, gy);
  }
  // 가로등 (강가)
  for (let x = 30; x < w; x += 96) p.stamp(lamp(10), x, 61);
  // 강 (가로로 흐른다)
  for (let x = 0; x < w; x++) {
    p.set(x, 60, DIRT.hi);
    p.set(x, 61, DIRT.mid);
  }
  waterRows(p, 0, w, 62, 80, 9);
  for (let x = 0; x < w; x++) p.set(x, 80, DIRT.mid);
  // 강 아래: 풀밭·덤불
  for (let i = 0; i < 18; i++) p.stamp(bush(3 + Math.floor(R() * 3)), R() * w, 92 + Math.floor(R() * 40));
  for (let i = 0; i < 6; i++) p.stamp(tree(6 + Math.floor(R() * 3), 90 + i), R() * w, 100 + Math.floor(R() * 40));
  return p.band(GRASS.mid);
}

/** 가까운 층: 광장 지붕·나무·가로등·모닥불 */
export function ferrisNear(w = 512, h = 150): Band {
  const p = new Pen(w, h, true);
  const R = rng(37);
  const y0 = 56;
  // 광장 바닥 (돌)
  for (let y = y0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const row = Math.floor((y - y0) / 4);
      const off = row % 2 ? 3 : 0;
      const edge = (y - y0) % 4 === 3 || (x + off) % 6 === 5;
      p.set(x, y, y === y0 ? GRASS.hi : edge ? COBBLE.line : (x + row) % 11 === 0 ? COBBLE.b : COBBLE.a);
    }
  // 뒤쪽 큰 나무
  for (const [x, r] of [
    [20, 14],
    [118, 16],
    [214, 12],
    [392, 15],
    [470, 13],
  ] as const)
    p.stamp(tree(r, x, TREE), x, y0 + 2);
  // 줄 전구 (가로등 사이)
  const lamps = [58, 168, 250, 352, 440];
  for (let i = 0; i < lamps.length; i++) {
    const a = lamps[i];
    const b = i + 1 < lamps.length ? lamps[i + 1] : lamps[0] + w;
    for (let x = a; x <= b; x++) {
      const k = (x - a) / (b - a);
      const y = Math.round(y0 - 27 + Math.sin(k * Math.PI) * 6);
      p.set(x, y, 0x3a3836);
      if ((x - a) % 7 === 3) {
        p.set(x, y + 1, [0xe86a5a, 0xf0d060, 0x6ab0e8, 0x8ad07a][(x >> 3) % 4]);
        p.light(x, y + 1, [0xff8a7a, 0xffe080, 0x9ad0ff, 0xb0f0a0][(x >> 3) % 4]);
      }
    }
  }
  for (const x of lamps) p.stamp(lamp(28), x, y0 + 6);
  // 노점 지붕
  p.stamp(stall(28, 0xc04848), 92, y0 + 14);
  p.stamp(stall(24, 0x4a7ab0), 196, y0 + 12);
  p.stamp(stall(30, 0x5a9a5a), 418, y0 + 16);
  // 모닥불 + 둘러앉는 통나무
  const fx = 300;
  p.stamp(campfire(true), fx, y0 + 26);
  for (const dx of [-26, 26]) {
    p.rect(fx + dx - 6, y0 + 26, 12, 3, WOOD.mid);
    p.rect(fx + dx - 6, y0 + 26, 12, 1, WOOD.hi);
  }
  // 앞쪽 화분·덤불
  for (let i = 0; i < 10; i++) p.stamp(bush(3 + Math.floor(R() * 3)), R() * w, y0 + 40 + Math.floor(R() * 40));
  return p.band(COBBLE.b);
}

// ── 열기구: 옆으로 흘러가는 풍경 ──

/** 먼 층: 언덕 (가로로 이어짐) */
export function balloonFar(w = 384, h = 56): Band {
  const p = new Pen(w, h, true);
  const R = rng(13);
  const hill = { hi: 0x84926b, mid: 0x707e59, lo: 0x606d4d };
  for (let x = 0; x < w; x++) {
    const t = Math.round(16 + ridge(x, w, 8, 10, [1, 2, 5]));
    for (let y = t; y < h; y++) p.set(x, y, y === t ? hill.hi : y > t + 16 ? hill.lo : hill.mid);
  }
  for (let i = 0; i < 70; i++) {
    const x = R() * w;
    const t = Math.round(16 + ridge(x, w, 8, 10, [1, 2, 5]));
    p.ellipse(x, t + 2 + R() * 24, 2, 1.5, 0x51603f);
  }
  for (const hx of [40, 150, 260, 330]) {
    const t = Math.round(16 + ridge(hx, w, 8, 10, [1, 2, 5])) + 8;
    p.rect(hx, t, 4, 3, WALL.lo);
    p.rect(hx - 1, t - 1, 6, 1, ROOFS[hx % ROOFS.length]);
    p.light(hx + 2, t + 1);
  }
  return p.band(hill.lo);
}

/** 중간 층: 밭·생울타리·나무줄·농가 (가로로 이어짐) */
export function balloonMid(w = 384, h = 80): Band {
  const p = new Pen(w, h, true);
  const R = rng(17);
  const y0 = 20;
  grassBody(p, 0, w, y0, 3, { hi: 0x7c8653, mid: 0x68734a, lo: 0x58623e, dark: 0x4a5235 });
  // 밭 조각
  let x = 0;
  while (x < w) {
    const fw = 30 + Math.floor(R() * 40);
    const fy = y0 + 4 + Math.floor(R() * 16);
    const fh = 8 + Math.floor(R() * 12);
    const col = [0x8a8a52, 0x7a6a48, 0x6f7f4a, 0x9a9058][Math.floor(R() * 4)];
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw - 3; i++) p.set(x + i, fy + j, j % 3 === 0 ? darken(col, 0.12) : col);
    for (let i = 0; i < fw; i++) p.set(x + i, fy + fh, 0x4a5a36);
    x += fw;
  }
  for (let i = 0; i < 16; i++) p.stamp(tree(4 + Math.floor(R() * 3), 200 + i), R() * w, y0 + 2 + Math.floor(R() * 4));
  for (const hx of [60, 220, 300]) p.stamp(house(12, 7, ROOFS[hx % ROOFS.length], true), hx, y0 + 4);
  for (let i = 0; i < 10; i++) p.stamp(bush(2 + Math.floor(R() * 2)), R() * w, y0 + 30 + Math.floor(R() * 40));
  return p.band(0x68734a);
}

export const STRIP_H = 132;
export const STRIP_GROUND = 50;
export type StripSeg = { x0: number; x1: number; id: string | null };

/**
 * 가까운 땅 띠 (항로를 그대로 편 긴 그림): segs = 항로 구역을 띠 좌표(x0..x1)로 옮긴 것.
 * 구역마다: 언덕(망원경), 묘역(철책·비석), 광장(큰 모닥불·노점·가로등), 강·호수(물·배), 호박밭, 안개 숲, 동물원(울타리·동물 실루엣), 주거(집)
 */
export function balloonStrip(width: number, segs: readonly StripSeg[]): Band {
  const h = STRIP_H;
  const y0 = STRIP_GROUND;
  const p = new Pen(width, h, false);
  const R = rng(29);
  grassBody(p, 0, width, y0, 41);
  const hillPal = { hi: 0x8a9566, mid: 0x75805a, lo: 0x646e4c, dark: 0x555e41 };
  for (const s of segs) {
    const x0 = s.x0;
    const x1 = s.x1;
    const w = x1 - x0;
    const mid = (x0 + x1) / 2;
    switch (s.id) {
      case "hill": {
        // 솟은 언덕
        for (let x = Math.floor(x0); x < x1; x++) {
          const k = Math.sin(Math.max(0, Math.min(1, (x - x0) / Math.max(1, w))) * Math.PI);
          const t = Math.round(y0 - 12 * k);
          for (let y = t; y < h; y++) p.set(x, y, y === t ? hillPal.hi : y < t + 3 ? hillPal.mid : y > y0 + 30 ? GRASS.mid : hillPal.lo);
        }
        if (w > 60) {
          p.stamp(telescope(), mid, y0 - 11);
          p.rect(mid + 10, y0 - 13, 10, 2, WOOD.mid);
          p.rect(mid + 11, y0 - 11, 1, 2, WOOD.lo);
          p.rect(mid + 18, y0 - 11, 1, 2, WOOD.lo);
          p.stamp(lamp(12), mid - 18, y0 - 10);
        }
        for (let i = 0; i < w / 6; i++) p.set(x0 + R() * w, y0 - 4 + Math.floor(R() * 30), [0xf0e080, 0xe8a0c0, 0xffffff][i % 3]);
        for (let x = x0 + 14; x < x1 - 14; x += 70) p.stamp(tree(9 + Math.floor(R() * 4), Math.floor(x)), x + R() * 20, y0 - 2);
        break;
      }
      case "graveyard": {
        ironFence(p, x0 + 4, x1 - 4, y0 + 1, 6);
        for (let row = 0; row < 3; row++) {
          const gy = y0 + 12 + row * 13;
          for (let x = x0 + 10 + row * 3; x < x1 - 8; x += 16 + row) p.stamp(grave(Math.floor(x + row * 3) % 7, row > 0), x, gy);
        }
        if (w > 40) p.stamp(tree(10, 5, { ...TREE, mid: 0x4c5a3a, hi: 0x5c6a46, lo: 0x3c4830 }), x0 + 10, y0 + 2);
        if (w > 80) p.stamp(lamp(14), x1 - 14, y0 + 3);
        break;
      }
      case "plaza": {
        for (let y = y0; y < h; y++)
          for (let x = Math.floor(x0); x < x1; x++) {
            const row = Math.floor((y - y0) / 4);
            const edge = (y - y0) % 4 === 3 || (x + (row % 2 ? 3 : 0)) % 6 === 5;
            p.set(x, y, y === y0 ? GRASS.hi : edge ? COBBLE.line : COBBLE.a);
          }
        for (let x = x0 + 12; x < x1 - 10; x += 64) p.stamp(tree(12, Math.floor(x)), x, y0 + 1);
        for (let x = x0 + 40; x < x1 - 20; x += 90) p.stamp(lamp(24), x, y0 + 4);
        if (w > 120) {
          p.stamp(stall(26, 0xc04848), x0 + 30, y0 + 22);
          p.stamp(stall(26, 0x4a7ab0), x1 - 34, y0 + 22);
        }
        p.stamp(campfire(true), mid, y0 + 40);
        for (const dx of [-30, 30]) {
          p.rect(mid + dx - 7, y0 + 40, 14, 3, WOOD.mid);
          p.rect(mid + dx - 7, y0 + 40, 14, 1, WOOD.hi);
        }
        break;
      }
      case "river":
      case "lake":
      case "pond":
      case "fishing": {
        const top = s.id === "pond" ? y0 + 10 : y0 + 4;
        const bot = s.id === "pond" ? y0 + 34 : h - 10;
        for (let x = Math.floor(x0); x < x1; x++) {
          p.set(x, top - 1, DIRT.hi);
          p.set(x, bot, DIRT.mid);
          p.set(x, bot + 1, DIRT.lo);
        }
        waterRows(p, x0, x1, top, bot, Math.floor(x0));
        // 갈대
        for (const ex of [x0 + 2, x1 - 10])
          for (let i = 0; i < 6; i++) {
            const rx = ex + i + R() * 2;
            for (let j = 0; j < 4 + (i % 3); j++) p.set(rx, top - j, 0x6f7a44);
            p.set(rx, top - 4 - (i % 3), 0x7a5a32);
          }
        if (s.id === "lake" && w > 60) p.stamp(boat(), mid + 10, top + 16);
        if (s.id === "river" && w > 120) {
          // 나무다리
          const bx = x0 + w * 0.3;
          for (let y = top - 1; y <= bot; y++) for (let i = 0; i < 10; i++) p.set(bx + i, y, i === 0 || i === 9 ? WOOD.lo : y % 2 ? WOOD.mid : WOOD.hi);
        }
        if (s.id === "fishing")
          for (let y = top - 1; y < top + 14; y++) for (let i = 0; i < Math.min(w - 4, 30); i++) p.set(x0 + 2 + i, y, y % 3 ? WOOD.mid : WOOD.lo);
        break;
      }
      case "meadow": {
        for (let y = y0 + 4; y < h - 6; y += 6) for (let x = Math.floor(x0) + 2; x < x1 - 2; x++) p.set(x, y, DIRT.mid);
        for (let y = y0 + 9; y < h - 8; y += 12) for (let x = x0 + 6; x < x1 - 6; x += 9 + (y % 5)) p.stamp(pumpkin(), x, y);
        if (w > 50) {
          // 허수아비
          const sx = mid;
          p.rect(sx, y0 - 14, 1, 18, WOOD.lo);
          p.rect(sx - 6, y0 - 9, 13, 1, WOOD.lo);
          p.rect(sx - 2, y0 - 10, 5, 7, 0x8a5a3a);
          p.ellipse(sx + 0.5, y0 - 14, 2.5, 2.5, 0xd8c890);
          p.rect(sx - 3, y0 - 17, 7, 1, 0x6a5030);
        }
        break;
      }
      case "forest": {
        for (let x = x0 + 4; x < x1 - 2; x += 7) p.stamp(pine(20 + Math.floor(R() * 12)), x + R() * 3, y0 + 4 + Math.floor(R() * 6));
        for (let x = x0 + 8; x < x1 - 4; x += 11) p.stamp(pine(16 + Math.floor(R() * 8)), x, y0 + 18 + Math.floor(R() * 10));
        // 안개 자락
        for (let y = y0 + 6; y < y0 + 30; y += 7) for (let x = Math.floor(x0); x < x1; x++) if ((x + y) % 9 < 6) p.set(x, y, 0xdfe4e6, 110);
        break;
      }
      case "zoo": {
        const kinds: Animal[] = ["giraffe", "elephant", "deer", "bear"];
        let i = 0;
        for (let x = x0 + 20; x < x1 - 16; x += 38) p.stamp(animal(kinds[i++ % kinds.length]), x, y0 + 18);
        woodFence(p, x0 + 3, x1 - 3, y0 + 22, 8);
        for (let x = x0 + 12; x < x1 - 10; x += 60) p.stamp(tree(8, Math.floor(x) + 3), x + 30, y0 + 1);
        if (w > 40) {
          // 정문 간판
          p.rect(x0 + 6, y0 + 6, 2, 16, WOOD.lo);
          p.rect(x0 + 22, y0 + 6, 2, 16, WOOD.lo);
          p.rect(x0 + 4, y0 + 3, 22, 5, 0x9a5a3a);
          p.rect(x0 + 5, y0 + 4, 20, 1, 0xd8b070);
        }
        break;
      }
      case "housing": {
        for (let x = x0 + 14; x < x1 - 10; x += 30) p.stamp(house(16, 11, ROOFS[Math.floor(x) % ROOFS.length], true), x, y0 + 14 + (Math.floor(x) % 2) * 4);
        for (let x = x0 + 28; x < x1 - 10; x += 60) p.stamp(tree(7, Math.floor(x)), x, y0 + 8);
        break;
      }
      case "gate": {
        p.rect(mid - 14, y0 - 16, 4, 20, STONE.mid);
        p.rect(mid + 10, y0 - 16, 4, 20, STONE.mid);
        p.rect(mid - 16, y0 - 20, 32, 5, STONE.lo);
        p.rect(mid - 16, y0 - 20, 32, 1, STONE.hi);
        break;
      }
      default: {
        // 구역 밖: 들판 · 나무 · 덤불
        for (let x = x0 + 10; x < x1 - 6; x += 34 + Math.floor(R() * 30)) p.stamp(tree(7 + Math.floor(R() * 5), Math.floor(x)), x, y0 + 4 + Math.floor(R() * 10));
        for (let x = x0; x < x1; x += 14) p.stamp(bush(2 + Math.floor(R() * 2)), x + R() * 10, y0 + 30 + Math.floor(R() * 40));
      }
    }
  }
  return p.band(GRASS.mid);
}

/** 이륙장 둘레 (이륙 때 아래로 내려가고 착륙 때 올라온다): 출발장 바닥·팻말·꽃·울타리 */
export const FIELD_W = 1024;
export const FIELD_H = 96;
export function balloonField(): Band {
  const w = FIELD_W;
  const h = FIELD_H;
  const y0 = 30;
  const p = new Pen(w, h, false);
  const R = rng(61);
  grassBody(p, 0, w, y0, 77, { hi: 0x8a9566, mid: 0x75805a, lo: 0x646e4c, dark: 0x555e41 });
  const cx = w / 2;
  // 출발장 바닥 (나무판)
  for (let y = y0 + 6; y < y0 + 22; y++) for (let x = cx - 40; x < cx + 40; x++) p.set(x, y, y === y0 + 6 ? WOOD.hi : (x - cx + 40) % 8 === 7 ? WOOD.lo : WOOD.mid);
  // 팻말
  p.rect(cx + 58, y0 - 16, 2, 22, WOOD.lo);
  p.rect(cx + 50, y0 - 22, 18, 8, WOOD.mid);
  p.rect(cx + 51, y0 - 21, 16, 1, WOOD.hi);
  p.rect(cx + 53, y0 - 19, 12, 1, 0x3a2a1a);
  p.rect(cx + 53, y0 - 17, 9, 1, 0x3a2a1a);
  woodFence(p, 40, cx - 90, y0 + 2, 9);
  woodFence(p, cx + 100, w - 40, y0 + 2, 9);
  for (let x = 30; x < w - 20; x += 90 + Math.floor(R() * 60)) if (Math.abs(x - cx) > 120) p.stamp(tree(12 + Math.floor(R() * 5), x), x, y0 + 2);
  for (let i = 0; i < 90; i++) {
    const x = R() * w;
    if (Math.abs(x - cx) < 46) continue;
    p.set(x, y0 + 4 + Math.floor(R() * (h - y0 - 6)), [0xf0e080, 0xe8a0c0, 0xffffff, 0xb0c0f0][i % 4]);
  }
  p.stamp(lamp(20), cx - 60, y0 + 8);
  p.stamp(lamp(20), cx + 76, y0 + 8);
  return p.band(0x75805a);
}

// ── 화면 테두리 ──

/** 관람차 칸 창틀 (화면 크기 그대로). sill = 창 아래 턱의 y (앉은 사람 기준) */
export function ferrisWindow(W: number, H: number, color: Color): { canvas: HTMLCanvasElement; sill: number } {
  const g = new Grid(W, H);
  const side = Math.max(7, Math.min(16, Math.round(Math.min(W, H) * 0.045)));
  const top = Math.max(9, Math.round(H * 0.07));
  const sill = Math.round(H * 0.82);
  const rc = 7;
  const x0 = side;
  const x1 = W - side;
  const y0 = top;
  const y1 = sill;
  const inside = (x: number, y: number) => {
    if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
    const cx = x < x0 + rc ? x0 + rc : x >= x1 - rc ? x1 - rc - 1 : x;
    const cy = y < y0 + rc ? y0 + rc : y >= y1 - rc ? y1 - rc - 1 : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= rc * rc;
  };
  const body = color;
  const hi = lighten(color, 0.25);
  const lo = darken(color, 0.25);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (inside(x, y)) continue;
      let c = body;
      if (y >= sill) c = y < sill + 4 ? WOOD.hi : y < sill + 7 ? WOOD.mid : darken(color, 0.12);
      else if (x < 3 || x >= W - 3 || y < 3) c = lo;
      g.set(x, y, c);
    }
  // 창 둘레 테두리: 안쪽 어두운 선 + 밝은 선
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (inside(x, y)) continue;
      const n = inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1);
      if (n) g.set(x, y, OUT);
      else if (inside(x - 2, y) || inside(x + 2, y) || inside(x, y - 2) || inside(x, y + 2)) g.set(x, y, y >= sill ? WOOD.hi : hi);
    }
  // 나사
  for (let x = 6; x < W - 4; x += 16) g.set(x, Math.floor(top / 2), lo);
  for (let y = top + 6; y < sill - 4; y += 16) {
    g.set(Math.floor(side / 2), y, lo);
    g.set(W - 1 - Math.floor(side / 2), y, lo);
  }
  // 손잡이 막대 (창 아래쪽)
  const ry = sill - 8;
  for (let x = x0 + 6; x < x1 - 6; x++) {
    g.set(x, ry, 0xa8adb8);
    g.set(x, ry + 1, 0x6a6e78);
  }
  for (const bx of [x0 + 6, x1 - 7]) for (let y = ry; y < sill; y++) g.set(bx, y, 0x6a6e78);
  // 유리 반사 (사선)
  for (let k = 0; k < 2; k++) {
    const bx = x0 + 14 + k * 9;
    for (let i = 0; i < Math.min(40, (y1 - y0) * 0.5); i++) {
      const x = bx + i;
      const y = y0 + 4 + i;
      for (let t = 0; t < (k ? 2 : 4); t++) if (inside(x + t, y)) g.set(x + t, y, 0xffffff, 34);
    }
  }
  // 아래 판: 의자 등받이 무늬
  for (let x = 4; x < W - 4; x += 10) for (let y = sill + 9; y < H - 3; y++) g.set(x, y, lo);
  return { canvas: g.toCanvas(), sill };
}

/** 열기구: 위 풍선 아랫부분·밧줄·버너 틀, 아래 바구니 가장자리. burner = 버너 불꽃이 나오는 점, rim = 바구니 가장자리 위 y */
export function balloonRig(W: number, H: number, colors: readonly [Color, Color]): { canvas: HTMLCanvasElement; burner: Spot; rim: number } {
  const g = new Grid(W, H);
  const rim = Math.round(H * 0.84);
  const envBot = Math.round(H * 0.17);
  const cx = W / 2;
  // 풍선 (아래쪽 호): 큰 타원의 아랫부분, 세로 줄무늬
  const rx = W * 0.72;
  const ry = H * 0.62;
  const ecy = envBot - ry;
  for (let y = 0; y <= envBot; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - ecy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const ang = Math.atan2(dx, dy);
      const gore = Math.floor((ang + Math.PI) / (Math.PI / 9));
      let c = gore % 2 ? colors[0] : colors[1];
      if (d > 0.93) c = darken(c, 0.35);
      else if (d > 0.8) c = darken(c, 0.15);
      else if (dx < -0.3) c = lighten(c, 0.1);
      g.set(x, y, c);
    }
  // 풍선 입구 (어두운 구멍)
  const mouthW = Math.max(10, Math.round(W * 0.09));
  for (let y = envBot - 3; y <= envBot; y++) for (let x = Math.floor(cx - mouthW); x < cx + mouthW; x++) if (g.filled(x, y)) g.set(x, y, 0x2a1e1a);
  g.outline(OUT);
  // 밧줄: 풍선 가장자리 → 바구니 모서리
  const rope = 0xc8b48a;
  const anchors = [
    [cx - rx * 0.62, envBot - 2, 3, rim],
    [cx + rx * 0.62, envBot - 2, W - 4, rim],
    [cx - mouthW - 2, envBot + 1, cx - W * 0.22, rim],
    [cx + mouthW + 2, envBot + 1, cx + W * 0.22, rim],
  ];
  for (const [ax, ay, bx, by] of anchors) {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + ((bx - ax) * i) / n);
      const y = Math.round(ay + ((by - ay) * i) / n);
      g.set(x, y, rope);
      g.set(x + 1, y, 0x6a5a3a);
    }
  }
  // 버너 틀
  const by = envBot + Math.round(H * 0.07);
  for (let x = Math.floor(cx - 10); x < cx + 10; x++) {
    g.set(x, by, 0x8f949e);
    g.set(x, by + 1, 0x5a5e68);
  }
  for (const bx of [cx - 5, cx + 3]) {
    g.set(bx, by - 2, 0x6a6e78);
    g.set(bx + 1, by - 2, 0x6a6e78);
    g.set(bx, by - 1, 0xa8adb8);
    g.set(bx + 1, by - 1, 0xa8adb8);
  }
  for (const [ax, bx] of [
    [cx - 10, cx - W * 0.22],
    [cx + 9, cx + W * 0.22],
  ]) {
    const n = rim - by;
    for (let i = 0; i <= n; i += 1) g.set(Math.round(ax + ((bx - ax) * i) / n), by + i, 0x5a5e68);
  }
  // 바구니 가장자리: 가죽 테 + 고리버들 짜임
  for (let y = rim; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c: Color;
      if (y < rim + 3) c = y === rim ? 0x8a5a3a : 0x6a4028;
      else {
        const k = ((x >> 1) + (y >> 1)) % 4;
        c = k === 0 ? 0xc8a068 : k === 2 ? 0x7a5a32 : 0xa47c48;
        if ((y - rim) % 5 === 4) c = 0x5e4426;
      }
      g.set(x, y, c);
    }
  for (let x = 6; x < W; x += 12) g.set(x, rim + 1, 0xd8b890);
  for (let x = 0; x < W; x++) g.set(x, rim - 1, OUT);
  return { canvas: g.toCanvas(), burner: { x: Math.round(cx), y: by - 2 }, rim };
}
