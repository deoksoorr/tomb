import { darken, Grid, lighten, type Color } from "./pixel";

// 낚시·채집물 픽셀아트 아이콘 16×16 (가방·도감·NPC 창·잡았을 때 머리 위). 종마다 틀(물고기·나비·딱정벌레·풀·버섯·광석 …)에
// 색과 무늬를 넣어 그린다. itemIcons.ts가 forage 아이템 id(f_/b_/h_/o_/d_)를 여기로 넘긴다. Phaser 없이 캔버스만.

const OUT = 0x1e1c1a;
const g16 = () => new Grid(16, 16);

// ── 물고기 ──
type FishShape = "round" | "slim" | "long" | "big" | "sturgeon" | "deep" | "torpedo";
type FishSpec = {
  shape: FishShape;
  body: Color;
  belly?: Color;
  fin?: Color;
  pattern?: "stripes" | "spots" | "band" | "shine" | "plates" | "scales";
  mark?: Color;
  whiskers?: boolean;
  /** 위로 들린 입 (강준치) */
  jaw?: boolean;
  /** 눈동자 색 (열목어는 빨갛다) */
  eye?: Color;
  /** 비쳐 보이는 몸 (유령 잉어) */
  ghost?: boolean;
  /** 11/26 틀 위에 더 그리기 (외곽선 전에 — 학꽁치 아래턱·볼락 큰 눈) */
  extra?: (g: Grid) => void;
};

function fish(f: FishSpec): Grid {
  const g = g16();
  const belly = f.belly ?? lighten(f.body, 0.45);
  const fin = f.fin ?? darken(f.body, 0.25);
  const dims: Record<FishShape, { cx: number; cy: number; rx: number; ry: number; tail: number }> = {
    round: { cx: 8.5, cy: 8, rx: 5.2, ry: 3.6, tail: 3 },
    slim: { cx: 8.5, cy: 8, rx: 5.6, ry: 2.4, tail: 3 },
    long: { cx: 8, cy: 8.5, rx: 6.6, ry: 1.7, tail: 2 },
    big: { cx: 8.5, cy: 8, rx: 6, ry: 3.4, tail: 3 },
    sturgeon: { cx: 8.5, cy: 8.5, rx: 6.4, ry: 2.4, tail: 3 },
    deep: { cx: 8.5, cy: 8, rx: 4.8, ry: 4.4, tail: 3 },
    torpedo: { cx: 8.5, cy: 8, rx: 6.4, ry: 2.9, tail: 3 },
  };
  const d = dims[f.shape];
  const left = Math.round(d.cx - d.rx);
  // 꼬리 (왼쪽)
  for (let i = 0; i < d.tail; i++) {
    const x = left - i;
    g.vline(x, Math.round(d.cy - 1 - i), Math.round(d.cy + 1 + i), fin);
  }
  g.ellipse(d.cx, d.cy, d.rx, d.ry, f.body);
  // 배 (아래 절반 밝게)
  g.recolor((x, y) => y > d.cy + 0.3 && x > left + 1, belly);
  // 등지느러미
  if (f.shape !== "long") g.hline(Math.round(d.cx - 2), Math.round(d.cx + 1), Math.round(d.cy - d.ry - 0.5), fin);
  if (f.shape === "sturgeon") {
    // 뾰족한 주둥이
    g.set(Math.round(d.cx + d.rx) + 1, Math.round(d.cy), f.body);
    g.set(Math.round(d.cx + d.rx) + 2, Math.round(d.cy) + 1, f.body);
  }
  const m = f.mark ?? darken(f.body, 0.35);
  switch (f.pattern) {
    case "stripes":
      for (let x = left + 3; x < d.cx + d.rx - 2; x += 3) g.recolor((px, py) => px === x && py < d.cy + d.ry - 0.5, m);
      break;
    case "spots":
      for (const [x, y] of [[left + 3, d.cy - 1], [left + 6, d.cy], [left + 8, d.cy - 2], [left + 5, d.cy + 1], [left + 9, d.cy + 1]])
        if (g.filled(Math.round(x), Math.round(y))) g.set(Math.round(x), Math.round(y), m);
      break;
    case "band":
      g.recolor((x, y) => Math.round(y) === Math.round(d.cy) && x > left + 1 && x < d.cx + d.rx - 1, m);
      break;
    case "plates":
      for (let x = left + 2; x < d.cx + d.rx - 1; x += 2) g.set(x, Math.round(d.cy - d.ry + 0.5), m);
      break;
    case "shine":
      g.set(Math.round(d.cx - 1), Math.round(d.cy - 1), 0xfff6c0);
      g.set(Math.round(d.cx), Math.round(d.cy - 2), 0xffffff);
      g.set(Math.round(d.cx + 2), Math.round(d.cy - 1), 0xfff6c0);
      break;
    case "scales":
      // 비늘: 몸통에 어긋난 점
      for (let y = Math.round(d.cy - d.ry) + 1; y < d.cy + d.ry - 0.5; y += 2)
        for (let x = left + 2 + (y % 2); x < d.cx + d.rx - 2; x += 2) if (g.filled(x, y)) g.set(x, y, m);
      break;
  }
  // 눈
  const ex = Math.round(d.cx + d.rx - 2);
  const ey = Math.round(d.cy - 1);
  g.set(ex, ey, 0xffffff);
  g.set(ex + 1, ey, f.eye ?? 0x101014);
  if (f.jaw) {
    // 위로 들린 아래턱
    g.set(Math.round(d.cx + d.rx), ey - 1, f.body);
    g.set(Math.round(d.cx + d.rx) + 1, ey - 2, f.body);
  }
  if (f.whiskers) {
    const mx = Math.round(d.cx + d.rx);
    g.set(mx + 1, ey + 2, 0x3a3028);
    g.set(mx + 2, ey + 3, 0x3a3028);
    g.set(mx + 1, ey + 3, 0x3a3028);
  }
  f.extra?.(g);
  g.outline(OUT);
  if (f.ghost) {
    // 테두리와 눈동자만 진하게, 나머지는 반쯤 비친다
    for (let i = 0; i < g.px.length; i++) {
      const v = g.px[i];
      const rgb = v >>> 8;
      if ((v & 255) && rgb !== OUT && rgb !== 0x101014) g.px[i] = Grid.rgba(rgb, 150);
    }
  }
  return g;
}

// ── 곤충 ──
function butterfly(w1: Color, w2: Color, body = 0x2a2420, tails = false, dots?: Color): Grid {
  const g = g16();
  g.ellipse(4.5, 5.5, 3.6, 3.2, w1);
  g.ellipse(11.5, 5.5, 3.6, 3.2, w1);
  g.ellipse(5, 10.5, 2.8, 2.4, w2);
  g.ellipse(11, 10.5, 2.8, 2.4, w2);
  if (tails) {
    g.vline(4, 12, 15, w2);
    g.vline(11, 12, 15, w2);
  }
  if (dots) for (const [x, y] of [[3, 4], [12, 4], [4, 10], [11, 10]]) g.set(x, y, dots);
  g.vline(8, 3, 12, body);
  g.vline(7, 4, 11, body);
  g.set(6, 1, body);
  g.set(9, 1, body);
  g.set(6, 2, body);
  g.set(9, 2, body);
  g.outline(OUT, false, 200);
  return g;
}

function dragonfly(body: Color): Grid {
  const g = g16();
  const wing = 0xd8eef8;
  g.ellipse(4.5, 5, 3.6, 1.6, wing, 210);
  g.ellipse(11.5, 5, 3.6, 1.6, wing, 210);
  g.ellipse(4.5, 8, 3.2, 1.4, wing, 210);
  g.ellipse(11.5, 8, 3.2, 1.4, wing, 210);
  g.rect(7, 2, 2, 2, darken(body, 0.2));
  g.vline(7, 4, 14, body);
  g.vline(8, 4, 14, body);
  g.set(7, 2, 0xffffff);
  g.outline(OUT, false, 180);
  return g;
}

function beetle(
  shell: Color,
  opts: { dots?: Color; horn?: boolean; jaws?: boolean; ball?: boolean; shine?: boolean; tri?: Color; stripe?: Color; antennae?: Color } = {},
): Grid {
  const g = g16();
  const leg = 0x2a2420;
  for (const y of [7, 9, 11]) {
    g.set(3, y, leg);
    g.set(12, y, leg);
  }
  g.ellipse(8, 9.5, 4.4, 4.6, shell);
  g.rect(6, 3, 4, 3, darken(shell, 0.45));
  g.vline(8, 6, 13, darken(shell, 0.35));
  if (opts.dots) for (const [x, y] of [[6, 8], [10, 8], [5, 11], [11, 11], [7, 12], [9, 10]]) g.set(x, y, opts.dots);
  if (opts.horn) {
    g.vline(8, 0, 3, darken(shell, 0.2));
    g.set(9, 0, darken(shell, 0.2));
  }
  if (opts.jaws) {
    g.set(5, 1, 0x3a2418);
    g.set(5, 2, 0x3a2418);
    g.set(6, 2, 0x3a2418);
    g.set(10, 1, 0x3a2418);
    g.set(10, 2, 0x3a2418);
    g.set(9, 2, 0x3a2418);
  }
  if (opts.shine) {
    g.set(6, 7, 0xffffff);
    g.set(7, 6, 0xfff2b0);
  }
  if (opts.ball) g.ellipse(13, 13.5, 2.4, 2.2, 0x7a5a3a);
  if (opts.tri) {
    // 노린재 등의 방패 무늬
    g.hline(6, 10, 7, opts.tri);
    g.hline(7, 9, 8, opts.tri);
    g.set(8, 9, opts.tri);
  }
  if (opts.stripe) {
    g.vline(6, 8, 12, opts.stripe);
    g.vline(10, 8, 12, opts.stripe);
  }
  if (opts.antennae) {
    // 하늘소: 몸보다 긴 더듬이
    for (const [x, y] of [[5, 2], [4, 1], [3, 1], [2, 2], [1, 3], [10, 2], [11, 1], [12, 1], [13, 2], [14, 3]]) g.set(x, y, opts.antennae);
  }
  g.set(6, 7, lighten(shell, 0.5));
  g.outline(OUT, false, 200);
  return g;
}

function hopper(body: Color, mantis = false, antennae = false): Grid {
  const g = g16();
  const dark = darken(body, 0.3);
  g.ellipse(7.5, 9, 5.5, 2, body);
  g.ellipse(13, 7.5, 1.8, 1.8, body);
  g.set(14, 7, 0x101014);
  // 뒷다리
  g.set(5, 7, dark);
  g.set(4, 6, dark);
  g.set(3, 7, dark);
  g.set(2, 11, dark);
  g.set(3, 10, dark);
  g.set(6, 11, dark);
  g.set(9, 11, dark);
  if (mantis) {
    g.vline(12, 9, 12, dark);
    g.set(13, 12, dark);
    g.set(11, 4, dark);
    g.set(12, 5, dark);
  } else if (antennae) {
    // 여치: 등 뒤로 넘어가는 긴 더듬이
    for (const [x, y] of [[13, 5], [12, 4], [11, 3], [10, 2], [9, 2], [8, 1], [14, 5], [15, 4]]) g.set(x, y, dark);
  } else {
    g.set(14, 5, dark);
    g.set(15, 4, dark);
  }
  g.outline(OUT, false, 200);
  return g;
}

function cicada(body: Color): Grid {
  const g = g16();
  const wing = 0xd8eef0;
  g.ellipse(4.8, 9.5, 2.6, 5.4, wing, 190);
  g.ellipse(11.2, 9.5, 2.6, 5.4, wing, 190);
  g.vline(4, 6, 13, darken(wing, 0.35));
  g.vline(11, 6, 13, darken(wing, 0.35));
  g.ellipse(8, 9, 2.4, 4.6, body);
  g.rect(5, 3, 6, 2, darken(body, 0.2));
  g.set(5, 3, 0xd84a3a);
  g.set(10, 3, 0xd84a3a);
  g.hline(7, 9, 9, lighten(body, 0.3));
  g.outline(OUT, false, 180);
  return g;
}

function bee(): Grid {
  const g = g16();
  g.ellipse(4.5, 5.5, 2.8, 2.2, 0xf4f8ff, 200);
  g.ellipse(11.5, 5.5, 2.8, 2.2, 0xf4f8ff, 200);
  g.ellipse(8, 9.5, 3.4, 4.4, 0xf0c030);
  for (const y of [8, 11]) g.hline(5, 11, y, 0x2a2420);
  g.ellipse(8, 4, 2, 1.6, 0x3a3028);
  g.set(6, 1, 0x3a3028);
  g.set(10, 1, 0x3a3028);
  g.set(8, 14, 0x2a2420);
  g.outline(OUT, false, 200);
  return g;
}

function ant(c: Color): Grid {
  const g = g16();
  const leg = darken(c, 0.2);
  for (const [x, y] of [[5, 6], [4, 5], [11, 6], [12, 5], [5, 8], [4, 9], [11, 8], [12, 9], [6, 10], [10, 10]]) g.set(x, y, leg);
  g.ellipse(8, 3.5, 1.8, 1.6, c);
  g.ellipse(8, 7.5, 1.4, 1.8, c);
  g.ellipse(8, 12, 2.6, 3, c);
  g.set(6, 1, leg);
  g.set(10, 1, leg);
  g.set(7, 11, lighten(c, 0.35));
  g.outline(OUT, false, 200);
  return g;
}

function strider(c: Color): Grid {
  const g = g16();
  // 물결 위에 선 긴 다리
  g.ellipse(8, 13.5, 6.5, 1.3, 0x8ac8e8, 140);
  for (const [x, y] of [[6, 6], [5, 5], [4, 4], [3, 3], [10, 6], [11, 5], [12, 4], [13, 3], [6, 9], [5, 10], [4, 11], [3, 12], [10, 9], [11, 10], [12, 11], [13, 12]]) g.set(x, y, c);
  g.vline(7, 3, 11, c);
  g.vline(8, 3, 11, darken(c, 0.25));
  g.set(7, 2, darken(c, 0.4));
  g.outline(OUT, false, 160);
  return g;
}

function mayfly(c: Color): Grid {
  const g = g16();
  const wing = 0xf0f4f8;
  g.ellipse(5, 5.5, 3, 3.6, wing, 200);
  g.ellipse(11, 5.5, 3, 3.6, wing, 200);
  g.vline(8, 3, 11, c);
  g.vline(7, 4, 10, darken(c, 0.2));
  // 꼬리 실 세 가닥
  for (const [x, y] of [[6, 12], [5, 13], [4, 14], [8, 12], [8, 13], [8, 14], [9, 12], [10, 13], [11, 14]]) g.set(x, y, darken(c, 0.15));
  g.outline(OUT, false, 170);
  return g;
}

function firefly(glow: Color): Grid {
  const g = g16();
  g.ellipse(8, 9, 5, 5, glow, 70);
  g.ellipse(8, 9, 3, 3, glow, 130);
  g.rect(7, 4, 2, 4, 0x2a2420);
  g.rect(6, 5, 1, 2, 0xd0d8e0);
  g.rect(9, 5, 1, 2, 0xd0d8e0);
  g.rect(7, 8, 2, 3, lighten(glow, 0.4));
  g.set(7, 3, 0xd04a3a);
  g.set(8, 3, 0xd04a3a);
  return g;
}

// ── 약초·버섯 ──
function plant(leaf: Color, flower?: Color, opts: { tall?: boolean; curl?: boolean } = {}): Grid {
  const g = g16();
  const dark = darken(leaf, 0.3);
  g.vline(8, opts.tall ? 4 : 7, 14, dark);
  for (const [x, y, s] of [[5, 10, 1], [11, 9, 1], [6, 7, 1], [10, 6, 1]] as const) {
    g.ellipse(x, y, 2.2 * s, 1.2, leaf);
  }
  g.ellipse(8, 14, 3.4, 1.2, 0x6a4a30);
  if (opts.curl) {
    g.set(9, 4, leaf);
    g.set(10, 4, leaf);
    g.set(10, 5, leaf);
    g.set(9, 5, dark);
  }
  if (flower) {
    g.ellipse(8, 4, 2.2, 2.2, flower);
    g.set(8, 4, lighten(flower, 0.6));
  }
  g.outline(OUT, false, 200);
  return g;
}

function clover(leaves: 3 | 4, c = 0x5aa84a): Grid {
  const g = g16();
  const pts: [number, number][] = leaves === 4 ? [[5.5, 5.5], [10.5, 5.5], [5.5, 10], [10.5, 10]] : [[8, 4.5], [5, 9], [11, 9]];
  for (const [x, y] of pts) g.ellipse(x, y, 2.8, 2.6, c);
  g.vline(8, 9, 15, darken(c, 0.3));
  g.set(8, 7, lighten(c, 0.35));
  g.outline(OUT, false, 200);
  return g;
}

function mushroom(cap: Color, stem = 0xe8dcc0, opts: { spots?: Color; fan?: boolean; glow?: Color } = {}): Grid {
  const g = g16();
  if (opts.glow) g.ellipse(8, 8, 7, 7, opts.glow, 60);
  if (opts.fan) {
    g.ellipse(8, 8, 6, 4, cap);
    g.recolor((x, y) => y > 8, darken(cap, 0.2));
    g.ellipse(8, 7, 3, 1.5, lighten(cap, 0.25));
    g.rect(7, 11, 2, 4, stem);
  } else {
    g.rect(6, 9, 4, 6, stem);
    g.ellipse(8, 7.5, 6, 3.6, cap);
    g.recolor((x, y) => y <= 5, lighten(cap, 0.18));
    if (opts.spots) for (const [x, y] of [[5, 6], [9, 5], [11, 7]]) g.set(x, y, opts.spots);
  }
  g.outline(OUT, false, 200);
  return g;
}

function root(c: Color, berry?: Color): Grid {
  const g = g16();
  g.ellipse(8, 10, 2.4, 4, c);
  g.set(6, 13, c);
  g.set(5, 14, c);
  g.set(10, 13, c);
  g.set(11, 14, c);
  g.set(8, 15, c);
  g.recolor((x) => x >= 9, darken(c, 0.15));
  for (const [x, y] of [[7, 4], [9, 3], [6, 3], [10, 5]]) g.ellipse(x, y, 1.6, 1, 0x4a9a3a);
  if (berry) {
    g.set(8, 1, berry);
    g.set(9, 2, berry);
    g.set(7, 2, berry);
  }
  g.outline(OUT, false, 200);
  return g;
}

/** 열매 송이 (오미자·헛개) */
function berries(c: Color, leaf = 0x4a9a3a): Grid {
  const g = g16();
  g.ellipse(11, 3.5, 3, 1.6, leaf);
  g.vline(8, 2, 6, 0x6a4a30);
  for (const [x, y] of [[8, 7], [6, 8], [10, 8], [7, 10], [9, 10], [5, 11], [11, 11], [8, 12], [6, 13], [10, 13], [8, 14]]) g.ellipse(x + 0.5, y + 0.5, 1.3, 1.3, c);
  for (const [x, y] of [[8, 7], [6, 10], [10, 11], [8, 13]]) g.set(x, y, lighten(c, 0.45));
  g.outline(OUT, false, 200);
  return g;
}

/** 넓은 꽃잎 한 송이 (연꽃·복수초). base = 아래 받침(잎·눈밭) */
function cupFlower(petal: Color, base: Color, heart: Color): Grid {
  const g = g16();
  g.ellipse(8, 12.5, 7, 2.6, base);
  g.ellipse(4.5, 7.5, 2, 3.4, petal);
  g.ellipse(11.5, 7.5, 2, 3.4, petal);
  g.ellipse(8, 6, 2.4, 4.2, lighten(petal, 0.15));
  g.ellipse(6, 9, 2.2, 2, darken(petal, 0.1));
  g.ellipse(10, 9, 2.2, 2, darken(petal, 0.1));
  g.rect(7, 8, 2, 2, heart);
  g.outline(OUT, false, 200);
  return g;
}

/** 바닥에 붙은 넓은 잎 (질경이·곰취). spike = 가운데 꽃대 */
function rosette(leaf: Color, opts: { spike?: Color; round?: boolean } = {}): Grid {
  const g = g16();
  const r = opts.round ? 3.2 : 2.6;
  for (const [x, y] of [[4, 10], [12, 10], [5.5, 6.5], [10.5, 6.5]] as const) g.ellipse(x, y, r, r * 0.75, leaf);
  g.ellipse(8, 11.5, 3, 2.4, lighten(leaf, 0.12));
  for (const [x, y] of [[4, 10], [12, 10], [6, 7], [10, 7]]) g.set(x, y, darken(leaf, 0.3));
  if (opts.spike) {
    g.vline(8, 1, 9, darken(leaf, 0.3));
    for (let y = 1; y <= 5; y++) g.set(y % 2 ? 7 : 9, y, opts.spike);
  }
  g.outline(OUT, false, 200);
  return g;
}

/** 물가 풀 (미나리): 가는 줄기 끝에 잎 뭉치 */
function stems(leaf: Color): Grid {
  const g = g16();
  g.ellipse(8, 14, 6, 1.4, 0x6aa8d0, 150);
  for (const [x, top] of [[5, 6], [8, 3], [11, 5]] as const) {
    g.vline(x, top + 2, 13, darken(leaf, 0.35));
    g.ellipse(x, top, 1.8, 1.6, leaf);
    g.ellipse(x - 1, top + 2, 1.2, 1, leaf);
    g.ellipse(x + 1, top + 2, 1.2, 1, leaf);
  }
  g.outline(OUT, false, 200);
  return g;
}

/** 둥글게 간 보석 (옥·오팔). spark = 속에서 반짝이는 색들 */
function cabochon(c: Color, spark: readonly Color[] = []): Grid {
  const g = g16();
  g.ellipse(8, 9, 5.5, 4.6, c);
  g.recolor((x, y) => y > 10, darken(c, 0.2));
  g.ellipse(6.5, 7, 2, 1.4, lighten(c, 0.35));
  g.set(6, 6, 0xffffff);
  spark.forEach((s, i) => {
    const [x, y] = [[9, 8], [10, 10], [7, 10], [11, 8], [8, 11], [5, 9]][i % 6];
    g.set(x, y, s);
  });
  g.outline(OUT, false, 200);
  return g;
}

// ── 광석 ──
function rock(
  base: Color,
  vein?: Color,
  opts: { crystal?: Color; nugget?: Color; glow?: Color; smooth?: boolean; spark?: Color; flakes?: Color; glass?: boolean } = {},
): Grid {
  const g = g16();
  if (opts.glow) g.ellipse(8, 9, 7.5, 6.5, opts.glow, 70);
  if (opts.smooth) g.ellipse(8, 10, 5.5, 3.5, base);
  else {
    g.ellipse(8, 10, 6, 4.4, base);
    g.rect(4, 7, 3, 2, base);
  }
  g.recolor((x, y) => y > 11, darken(base, 0.25));
  g.recolor((x, y) => y < 8 && x < 8, lighten(base, 0.2));
  if (vein) for (const [x, y] of [[5, 9], [6, 10], [9, 8], [10, 9], [11, 11], [7, 12]]) g.set(x, y, vein);
  if (opts.crystal) {
    const c = opts.crystal;
    g.vline(7, 3, 8, c);
    g.vline(8, 2, 8, lighten(c, 0.3));
    g.vline(10, 5, 8, c);
    g.vline(5, 5, 8, darken(c, 0.15));
    g.set(8, 2, 0xffffff);
  }
  if (opts.nugget) {
    g.ellipse(7, 9, 1.6, 1.3, opts.nugget);
    g.ellipse(10.5, 11, 1.4, 1.1, opts.nugget);
    g.set(7, 8, 0xffffff);
  }
  if (opts.flakes) {
    // 운모: 얇게 겹친 반짝이 판
    for (const y of [7, 9, 11]) g.recolor((x, py) => py === y && x > 3 && x < 12, opts.flakes);
  }
  if (opts.glass) {
    // 흑요석: 매끈한 유리 광택
    g.set(5, 8, 0xffffff);
    g.set(6, 7, 0xd8d8f0);
    g.set(10, 10, 0x9a98c8);
    g.set(11, 9, 0x9a98c8);
  }
  if (opts.spark) {
    // 부싯돌 불꽃
    for (const [x, y] of [[12, 3], [13, 2], [11, 2], [14, 4], [12, 5]]) g.set(x, y, opts.spark);
    g.set(13, 4, 0xffffff);
  }
  g.outline(OUT, false, 200);
  return g;
}

function gem(c: Color): Grid {
  const g = g16();
  const rows = ["..#####..", ".#######.", "#########", ".#######.", "..#####..", "...###...", "....#...."];
  rows.forEach((r, y) => [...r].forEach((v, x) => v === "#" && g.set(x + 3, y + 5, y < 1 ? lighten(c, 0.5) : x % 3 === 0 ? darken(c, 0.15) : c)));
  g.set(6, 6, 0xffffff);
  g.set(5, 2, 0xffffff);
  g.set(12, 3, 0xffffff);
  g.outline(OUT, false, 200);
  return g;
}

// ── 발굴품 ──
function art(rows: string[], pal: Record<string, Color>): Grid {
  const g = g16();
  const oy = Math.floor((16 - rows.length) / 2);
  rows.forEach((r, y) => {
    const ox = Math.floor((16 - r.length) / 2);
    [...r].forEach((ch, x) => {
      const c = pal[ch];
      if (c !== undefined) g.set(ox + x, oy + y, c);
    });
  });
  g.outline(OUT, false, 200);
  return g;
}

const DIG_ART: Record<string, () => Grid> = {
  d_coin: () => art(["..####..", ".#hhhh#.", "#hh##hh#", "#h#..#h#", "#h#..#h#", "#hh##hh#", ".#hhhh#.", "..####.."], { "#": 0xb8743a, h: 0xd89a5a, ".": 0xe8b07a }),
  d_mug: () => art(["#######..", "#wwwwww#.", "#wwwwwwh#", "#wrrrww.h", "#wwwwwwh#", "#wwwwww#.", ".######.."], { "#": 0x9aa4ae, w: 0xf2f2ee, h: 0x9aa4ae, r: 0xd84a3a }),
  d_cap: () => art([".#.#.#.", "#######", "#rrrrr#", "#rwwwr#", "#rrrrr#", "#######", ".#.#.#."], { "#": 0xb8bec4, r: 0xd84a3a, w: 0xf2f2ee }),
  d_key: () => art([".###.......", "#...#......", "#...#######", "#...#..#.#.", ".###.......".replace(/\./g, ".")], { "#": 0x9a6a3a }),
  d_floppy: () => art(["##########", "#sssss.#.#", "#sssss.#.#", "#########.", "#wwwwwwww#", "#wllllllw#", "#wwwwwwww#", "##########"], { "#": 0x3a6ad0, s: 0xc0c8d0, w: 0xf2f2ee, l: 0x8a9aaa, ".": 0x3a6ad0 }),
  d_diary: () => art(["#########", "#ppppppp#l", "#pwwwwwp#l", "#ppppppp#", "#ppppppp#l", "#ppppppp#", "#########"], { "#": 0xb04a6a, p: 0xe88aa8, w: 0xffffff, l: 0xe8c24a }),
  d_usb: () => art(["........", "###.....", "#s######", "#s#bbbbb#", "#s#bbbbb#", "#s######", "###....."], { "#": 0x9aa4ae, s: 0xd8dde2, b: 0x2a2a34 }),
  d_plan: () => art(["#########", "#wwwwwww#", "#wlllllw#", "#wwwwxww#", "#wllxllw#", "#wwxwwww#", "#wxlllw.#", "#wwwwww##", "########."], { "#": 0x8a8070, w: 0xf6f0e0, l: 0x8aa0c0, x: 0xd84a3a }),
  d_pottery: () => art(["....####", "..##bbb#", ".#bzbzb#", "#bzbzbb#", "#bbzbzb#", ".#bbbb#.", "..####.."], { "#": 0x7a4a2a, b: 0xb8784a, z: 0x8a5232 }),
  d_fossil: () => art(["##......##", "#b#....#b#", ".#bbbbbb#.", ".#bbbbbb#.", "#b#....#b#", "##......##"], { "#": 0x9a9080, b: 0xf0e8d0 }),
  d_capsule: () => art(["..####..", ".#rrrr#.", "#rrrrrr#", "#yyyyyy#", "#ssssss#", "#ssssss#", ".#ssss#.", "..####.."], { "#": 0x5a5a64, r: 0xd84a3a, y: 0xe8c24a, s: 0xb8c0c8 }),
  d_ring: () => art(["...gg...", "..gwwg..", "...gg...", ".######.", "#y....y#", "#y....y#", ".######."], { "#": 0xc8902a, y: 0xffd060, g: 0x4ad0c0, w: 0xffffff }),
  d_crown: () => art(["y...y...y", "yy.yyy.yy", "yyyyyyyyy", "yrybyryby", "yyyyyyyyy", "#########"], { y: 0xffd060, r: 0xd84a3a, b: 0x4a8ad8, "#": 0xc8902a }),
  // 2차
  d_clip: () => art([".sssss.", "s.....s", "s.sss.s", "s.s.s.s", "s.s.r.s", "s.s.s.s", "s.s.s.s", "s.r...s", "s.sssss", "s......", ".sssss."], { s: 0xb8bec8, r: 0xb0703a }),
  d_marble: () => art(["..####..", ".#bbww#.", "#bbbbwb#", "#byybbb#", "#bbyybb#", "#bbbyyb#", ".#bbbb#.", "..####.."], { "#": 0x3a8ac8, b: 0x8ad0f4, w: 0xffffff, y: 0xf0c040 }),
  d_pager: () => art(["##########", "#gggggggg#", "#gdgdgdgg#", "#gggggggg#", "##########", "#kk#kk#kk#", "##########"], { "#": 0x2a2a30, g: 0x9ac87a, d: 0x2a4a2a, k: 0x6a6a74 }),
  d_cards: () => art(["...#########", "...#ccccccc#", "#########cc#", "#wwwwwww#cc#", "#wnnnwww#cc#", "#wwwwwww#cc#", "#wllllww####", "#wwwwwww#...", "#########..."], { "#": 0x6a6a74, c: 0xe8e0c8, w: 0xffffff, n: 0x2a2a38, l: 0x8a9aaa }),
  d_cassette: () => art(["############", "#llllllllll#", "#lwwwwwwwwl#", "#lw##ww##wl#", "#lw##ww##wl#", "#lwwwwwwwwl#", "#lll####lll#", "############"], { "#": 0x2a2a30, l: 0xe0783a, w: 0xf2f2ee }),
  d_arrowhead: () => art(["...s...", "..sss..", "..sls..", ".sssss.", ".slsss.", "sssssls", "sslssss", "sssssss", ".s...s.", "ss...ss"], { s: 0x8a8478, l: 0xc0baae }),
  d_celadon: () => art(["....###...", "..##ccc#..", ".#cccwcc#.", "#ccwwwccc#", "#cccwcccc#", ".#ccccc##.", "..#cc##...", "...##....."], { "#": 0x4a8070, c: 0x9ad0b8, w: 0xf2f2ee }),
  d_letter: () => art(["############", "#w#wwwwww#w#", "#ww#wwww#ww#", "#www#ww#www#", "#wwww##wwww#", "#wwwwwwwwrr#", "#wwwwwwwwrr#", "############"], { "#": 0x9a8a70, w: 0xf6f0e0, r: 0xd84a3a }),
  d_mirror: () => art(["...####...", ".##bbbb##.", ".#bggbbb#.", "#bbg##gbb#", "#bb#kk#bb#", "#bb#kk#bb#", "#bbg##gbb#", ".#bbbggb#.", ".##bbbb##.", "...####..."], { "#": 0x6a4a2a, b: 0xb8864a, g: 0x5aa08a, k: 0xf0c060 }),
  d_shoes: () => art(["......####..", ".....#yyyy#.", "....#yydyy#.", "#####yyyyyy#", "#yydyyydyyy#", "#yyyyyyyyyy#", "############", ".#.#.#.#.#.."], { "#": 0x8a6020, y: 0xe8b040, d: 0xa87020 }),
  // 11/16 갯벌 (발굴품 칸)
  d_clam: () => art(["...llll...", ".lllmllll.", "lmllllmlll", "llmllmllml", "lllmlllmll", "mllllmllll", ".llmllllm.", "..mmmmmm.."], { l: 0xc8b8a0, m: 0x7a6a5a }),
  d_mudcrab: () => art(["..e......e..", "..s......s..", "cc.bbbbbb.cc", "c.bbbbbbbb.c", "..bbbbbbbb..", ".l.l.ll.l.l.", "l..l....l..l"], { b: 0x7a6a4a, c: 0x8a7a5a, e: 0x101014, s: 0x5a4a32, l: 0x5a4a32 }),
  d_whelk: () => art(["....d....", "...ddl...", "..dlldd..", ".ddlldld.", "dlldllddl", "ddlddllld", ".dllldddd", "..ddddd.."], { d: 0x6a5038, l: 0xc8a878 }),
  d_razor: () => art(["sssssssssss..", "slllllllllsff", "slllllllllsff", "sssssssssss.."], { s: 0xa89060, l: 0xe8d8a8, f: 0xf0c8a0 }),
  d_fiddler: () => art(["..e....e....", "..s....s....", "..bbbbbb.RRR", ".bbbbbbbbRR.", ".bbbbbbbbR..", "l.l.ll.l.l..", ".l.l..l.l..."], { b: 0x4a5a52, e: 0x101014, s: 0x3a4a42, R: 0xe0402a, l: 0x3a4a42 }),
  d_turban: () => art([".k..k..k..", "kddddddddk", ".dlldllld.", "kdlddllddk", ".ddlllldd.", "..dddlldd.", "...ddlll..", "....dddd.."], { d: 0x8a5a3a, l: 0xe8c098, k: 0x6a4028 }),
  d_seacuc: () => art(["..k...k...k...", ".dddddddddddd.", "dkddkddkddkddd", "dddddddddddddd", ".dddddddddddd.", "..k...k...k..."], { d: 0x4a3a32, k: 0x7a5a48 }),
  d_nakji: () => art(["...hhhh.....", "..hhwehh....", "..hhhhhh....", "...hhhh.....", ".l.l.ll.l...", "l..l.l..l.l.", "l.l...l..l.l", ".l...l..l..l"], { h: 0xb87a6a, w: 0xffffff, e: 0x101014, l: 0xd8988a }),
  d_penshell: () => art(["...........d", ".........ddl", ".......ddlld", ".....ddlldld", "...ddlldldld", ".ddlldldldld", "ddlldldldldl", ".ddddddddddd"], { d: 0x3a3028, l: 0x8a7a6a }),
  // 11/17 갈매기 깃털 (하얀 깃 · 회색 끝 · 깃대) · 붉은 갈매기 깃털 (매운 과자 빛 — 끝에 작은 김)
  d_gullfeather: () => art(["........ww", ".......wwg", "......wwwg", ".....wwwg.", "....wwwgg.", "...wwlgg..", "..wwlgg...", ".wllgg....", ".lgg......", "q........."], { w: 0xfbfbf6, l: 0xd8dde4, g: 0x8a96a6, q: 0xc8a060 }),
  d_redfeather: () => art(["........s.", ".......rrs", "......rrro", ".....rrro.", "....rrroo.", "...rrhoo..", "..rrhoo...", ".rhhoo....", ".hoo......", "q........."], { r: 0xff7a5a, h: 0xffc0a0, o: 0xd83a2a, s: 0xffffff, q: 0xc8a060 }),
  d_goldclam: () => art(["...llll..k", ".lllmllll.", "lmllkllmll", "llmllmllml", "lllmlllmll", "mllllmllll", ".llmllllm.", "..mmmmmm.."], { l: 0xffd060, m: 0xc8902a, k: 0xffffff }),
  d_goldkey: () => art([".yyyy........", "yhhhhy.......", "yh..hyyyyyyyy", "yh..hyhhhhhhy", "yhhhhy...y.y.", ".yyyy....y.y.", "rr.rr........", ".rrr........."], { y: 0xffd060, h: 0xc8902a, r: 0xd83a3a }),
};

const JUNK_ART: Record<string, () => Grid> = {
  f_shoe: () => art(["....####...", "....#bb#...", "....#bb#...", "#####bb####", "#bbbbbbbbb#", "###########"], { "#": 0x1a1a20, b: 0x4a4a56 }),
  f_badge: () => art(["...##...", "...##...", "########", "#wwwwww#", "#wffwww#", "#wffwll#", "#wwwwww#", "#bbbbbb#", "########"], { "#": 0x3a6ad0, w: 0xf2f2ee, f: 0xe0b896, l: 0x8a9aaa, b: 0x3a6ad0 }),
  f_report: () => art(["#########", "#wwwwwww#", "#wllbbll#", "#wwbbbww#", "#wlbbllw#", "#wwwwwww#", "#wrrwrrw#", "#wrrwrrw#", "#########"], { "#": 0x8a8070, w: 0xe0dccc, l: 0x8a9aaa, b: 0x6a8ac8, r: 0xd88a8a }),
};

/** 그림으로 그리는 약초 (틀로 안 되는 모양) */
const HERB_ART: Record<string, () => Grid> = {
  h_edelweiss: () => art(["....w....", "..w.w.w..", "...wyw...", ".wwyyyww.", "...wyw...", "..w.w.w..", "....g....", "...ggg...", "..g.g.g..", "....g....", "..ggggg.."], { w: 0xf4f4ee, y: 0xd8c860, g: 0x8aa890 }),
  h_morel: () => art(["...##...", "..#bd#..", ".#bdbd#.", ".#dbdb#.", ".#bdbd#.", ".#dbdb#.", "..#bd#..", "..#ss#..", "..#ss#..", ".#ssss#."], { "#": 0x5a3a20, b: 0xb08a5a, d: 0x6a4a2a, s: 0xf0e8d4 }),
  h_chaga: () => art(["wwww.....", "wkww.....", "wwwwddd..", "wwwdkkkd.", "wkwdkbkkd", "wwwdkkkkd", "wwwwdkkd.", "wwkw.dd..", "wwww.....", "wkww....."], { w: 0xf0ece0, k: 0x2a2420, d: 0x4a3a2a, b: 0xb06a2a }),
  h_elixir: () =>
    art(["y.........y.", "...######...", "..#rrrrrr#..", ".#rrhhhhrr#.", "#rrrrrrrrrr#", "#gggggggggg#", ".####ss####.", ".....ss.....", ".....ss...y.", "....ssss.yyy"], {
      "#": 0x6a2018,
      r: 0xb03a2a,
      h: 0xd86a4a,
      g: 0xf0c040,
      s: 0x8a5a2a,
      y: 0xfff0a0,
    }),
  // 11/26 캠핑장 숲
  h_enoki: () => art(["..c.c.c..", ".cwcwcwc.", "..s.s.s..", "..s.s.s..", ".s..s..s.", ".s..s..s.", "..s.s.s..", "...sss...", "..bbbbb.."], { c: 0xf4ecd8, w: 0xe0d4b8, s: 0xfaf6ec, b: 0xb89a6a }),
  h_pinecone: () => art(["...g....", "..ggg...", "..bdb...", ".bdbdb..", ".dbdbd..", ".bdbdb..", "..dbd...", "...d...."], { b: 0x9a6a3a, d: 0x6a4428, g: 0x4a8a3a }),
  h_ghostpipe: () => art(["..ww......", ".wwww..ww.", ".w.ww.wwww", "...w..ww.w", "...w...w..", "...w...w..", "..w....w..", "..w...w...", ".gggggggg."], { w: 0xf4f6f8, g: 0x5a4a3a }),
};

const FISH_SPECS: Record<string, FishSpec> = {
  f_crucian: { shape: "round", body: 0x8a8a5a, fin: 0x6a6a42 },
  f_bluegill: { shape: "round", body: 0x5a7a9a, pattern: "stripes", mark: 0x3a5272, belly: 0xe8b05a },
  f_minnow: { shape: "slim", body: 0xa8b8c0, belly: 0xe8eef0, pattern: "band", mark: 0x6a7a88 },
  f_chub: { shape: "slim", body: 0x9ab0b8, pattern: "stripes", mark: 0xd0807a },
  f_loach: { shape: "long", body: 0x8a7a52, pattern: "spots", mark: 0x5a4a32, whiskers: true },
  f_carp: { shape: "big", body: 0xb08a3a, belly: 0xe8cc8a },
  f_catfish: { shape: "big", body: 0x4a4a4a, belly: 0x9a9a8a, whiskers: true },
  f_bass: { shape: "big", body: 0x6a8a4a, pattern: "band", mark: 0x3a4a2a },
  f_smelt: { shape: "slim", body: 0xc8d8e8, belly: 0xf4f8fc, pattern: "band", mark: 0x9ab0c8 },
  f_sweetfish: { shape: "slim", body: 0x9aa868, belly: 0xf0f0d0, pattern: "shine" },
  f_bullhead: { shape: "slim", body: 0xb08a3a, pattern: "spots", mark: 0x5a3a1a, whiskers: true },
  f_kkeokji: { shape: "round", body: 0x6a6a52, pattern: "stripes", mark: 0x3a3a2a, fin: 0xd08a3a },
  f_mandarin: { shape: "big", body: 0xc8b07a, pattern: "spots", mark: 0x3a2a1a },
  f_rainbow: { shape: "slim", body: 0x7a9a8a, pattern: "band", mark: 0xe87aa0 },
  f_eel: { shape: "long", body: 0x3a4a3a, belly: 0xc8c89a },
  f_snakehead: { shape: "big", body: 0x5a5a3a, pattern: "spots", mark: 0x2a2a1a },
  f_trout: { shape: "slim", body: 0x8a9a7a, pattern: "spots", mark: 0x3a3a5a, fin: 0xd8a04a },
  f_koi: { shape: "big", body: 0xf0a020, belly: 0xffe08a, pattern: "shine" },
  f_salmon: { shape: "big", body: 0xb05a4a, belly: 0xe8b8a8, pattern: "spots", mark: 0x5a2a2a },
  f_sturgeon: { shape: "sturgeon", body: 0x6a7480, pattern: "plates", mark: 0xc8d0d8 },
  f_king: { shape: "big", body: 0xffc830, belly: 0xfff0a0, fin: 0xd84a3a, pattern: "shine" },
  f_moon: { shape: "slim", body: 0xb8c8f0, belly: 0xf0f4ff, pattern: "shine", fin: 0x8aa0e0 },
  // 2차
  f_bitterling: { shape: "round", body: 0x9a9ab8, pattern: "band", mark: 0xe87aa0, fin: 0xd86a5a },
  f_willow: { shape: "slim", body: 0x8a8a6a, pattern: "spots", mark: 0x4a4a32, fin: 0x6a6a4a },
  f_goby: { shape: "long", body: 0x9a8a6a, belly: 0xd8ccb0, pattern: "stripes", mark: 0x5a4a32 },
  f_skygazer: { shape: "slim", body: 0xb8c4cc, belly: 0xf0f4f6, fin: 0xd0a0a0, jaw: true },
  f_nuchi: { shape: "big", body: 0xa8a088, belly: 0xece4cc, pattern: "spots", mark: 0x7a7058 },
  f_lunchcarp: { shape: "deep", body: 0xb0b4a0, belly: 0xe8ead8, pattern: "scales", mark: 0x8a8e7a },
  f_grasscarp: { shape: "torpedo", body: 0x7a7a4a, belly: 0xd8d0a0, pattern: "scales", mark: 0x5a5a32 },
  f_lenok: { shape: "torpedo", body: 0x8a7a5a, pattern: "spots", mark: 0x3a2a1a, eye: 0xe02a2a, fin: 0x6a5a3a },
  f_miyugi: { shape: "slim", body: 0x5a4a3a, belly: 0xa89878, whiskers: true },
  f_ungeo: { shape: "long", body: 0xd8dce4, belly: 0xf8f8fc, pattern: "shine" },
  f_whitefish: { shape: "deep", body: 0xe8ecf0, belly: 0xffffff, fin: 0xb8c0c8 },
  f_goldmandarin: { shape: "big", body: 0xf0c040, pattern: "spots", mark: 0x8a5a10 },
  f_huchen: { shape: "torpedo", body: 0x8a5a4a, belly: 0xd8c0b0, pattern: "spots", mark: 0x3a2020, fin: 0xa04a3a },
  f_ghostcarp: { shape: "big", body: 0xb8dce8, belly: 0xe8f6fa, fin: 0x8ab8c8, ghost: true },
  f_dragon: { shape: "big", body: 0xd83a2a, belly: 0xffd060, fin: 0xffd060, pattern: "shine", whiskers: true },
  // 11/16 바닷물고기 (갑오징어·문어·고래 비늘은 SEA_ART)
  f_mackerel: { shape: "slim", body: 0x3a6a9a, belly: 0xe8eef0, pattern: "stripes", mark: 0x1a3050 },
  f_horsemack: { shape: "slim", body: 0x9ab0b8, belly: 0xeef4f4, pattern: "band", mark: 0xd8c050 },
  f_rockfish: { shape: "round", body: 0x5a5048, belly: 0x9a8a7a, pattern: "spots", mark: 0x2a2420, fin: 0x3a3430 },
  f_flounder: { shape: "deep", body: 0x8a7a5a, belly: 0x9a8a6a, pattern: "spots", mark: 0x4a3a28 },
  f_mullet: { shape: "torpedo", body: 0x7a8a9a, belly: 0xe8eef2, pattern: "stripes", mark: 0x5a6a7a },
  f_redbream: { shape: "deep", body: 0xe87a8a, belly: 0xf8d0d0, pattern: "spots", mark: 0x4ab0e8, fin: 0xd05a6a },
  f_yellowtail: { shape: "torpedo", body: 0x4a6a98, belly: 0xeef2f4, pattern: "band", mark: 0xf0c840, fin: 0xd8b840 },
  // 11/26 캠핑장 — 옛길 계곡
  f_kumgang: { shape: "slim", body: 0x9a8a6a, belly: 0xf0e0c0, pattern: "band", mark: 0x4a3a2a, fin: 0xd89a4a },
  f_galgyeoni: { shape: "slim", body: 0x8a9ab0, belly: 0xf0f2f4, pattern: "band", mark: 0x34425e, fin: 0xd8705a },
  f_jonggae: { shape: "long", body: 0xd8c08a, pattern: "spots", mark: 0x6a4a2a, whiskers: true },
  f_dongsari: { shape: "round", body: 0x6a5a42, pattern: "spots", mark: 0x3a2e20, fin: 0x5a4a32 },
  f_tunggari: { shape: "slim", body: 0xb07a3a, belly: 0xe0b870, fin: 0x8a5a2a, whiskers: true },
  f_saekomi: { shape: "long", body: 0xc8b890, pattern: "stripes", mark: 0x6a5a3a, fin: 0xd85a4a, whiskers: true },
  f_swiri: { shape: "slim", body: 0x7a8ab0, belly: 0xf4f4f8, pattern: "band", mark: 0xe0c040, fin: 0x3a3a5a },
  f_dukjung: { shape: "round", body: 0x7a6a52, pattern: "spots", mark: 0x4a3a2a, fin: 0x9a8a6a, eye: 0x3a5a3a },
  f_kkuguri: { shape: "long", body: 0xc8a060, pattern: "stripes", mark: 0x5a3a1a, fin: 0x8a6a3a },
  f_eoreumchi: { shape: "big", body: 0xb8bcc4, belly: 0xf0f0f4, pattern: "spots", mark: 0x2a2a30, fin: 0xd85a3a },
  // 달그늘 소
  f_beodeulgae: { shape: "slim", body: 0x8a7a5a, pattern: "spots", mark: 0x4a3a2a, fin: 0x6a5a3a, belly: 0xe8d8b8 },
  f_gondal: { shape: "torpedo", body: 0x5a6a7a, belly: 0xe8d0b0, pattern: "spots", mark: 0xf0e0c0, fin: 0xd88a5a },
  f_lamprey: { shape: "long", body: 0x5a5048, belly: 0x9a8a78, pattern: "spots", mark: 0xd8d0b0, eye: 0x6ab0d8 },
  f_imugi: { shape: "long", body: 0x2e6a6a, belly: 0xc8d8a0, fin: 0xd8b040, pattern: "shine", whiskers: true, eye: 0xd84a3a },
  // 윤슬 낚시터 · 나룻배
  f_chambung: { shape: "round", body: 0xa8a48a, belly: 0xe8e4d0, pattern: "band", mark: 0x6a6a5a },
  f_molgae: { shape: "slim", body: 0xb8c0c4, belly: 0xf2f4f6, pattern: "band", mark: 0x8a96a0, fin: 0xa0aab0 },
  f_hyangeo: { shape: "big", body: 0x7a7a6a, belly: 0xd8d4b8, pattern: "scales", mark: 0xa8a890 },
  f_salchi: { shape: "deep", body: 0xd0d8e0, belly: 0xffffff, fin: 0xb0bcc8, pattern: "shine" },
  f_kkeuri: { shape: "torpedo", body: 0x6a8ab0, belly: 0xeef2f6, pattern: "band", mark: 0x3a4a7a, fin: 0xd8604a, jaw: true },
  f_silvercarp: { shape: "big", body: 0xc8ccd4, belly: 0xf4f6f8, fin: 0xa8aeb8, pattern: "scales", mark: 0xb0b6c0 },
};

// 11/16 바다에서 낚는 물고기 아닌 것 (물고기 칸)
const SEA_ART: Record<string, () => Grid> = {
  f_cuttle: () =>
    art(["..ffffffff....", ".fbbdbbdbbf...", "fbdbbdbbdbbe.t", "fbbbbbbbbbbbtt", "fbdbbdbbdbbe.t", ".fbbdbbdbbf...", "..ffffffff...."], {
      f: 0xe8d0b0,
      b: 0xc89a6a,
      d: 0x8a5a3a,
      e: 0x101014,
      t: 0xd8a878,
    }),
  f_octopus: () =>
    art(["...rrrrrr...", "..rrrrrrrr..", ".rrrrrrrrrr.", ".rrwerrwerr.", ".rrrrrrrrrr.", "..rrrrrrrr..", ".rr.rr.rr.r.", "r.r.rr.r.r.r", "r..r..r..r.r", ".rr..rr.rr.."], {
      r: 0xc84a5a,
      w: 0xffffff,
      e: 0x101014,
    }),
  f_whalescale: () =>
    art(["...ssss...", "..swwwws..", ".swwbbkws.", "swwbbbbwws", "swbbbbbbws", "swbbbkbbws", "swbbbbbbws", ".swbbbbws.", "..swbbws..", "...swws...", "....ss...."], {
      s: 0x8ab8d8,
      w: 0xe8f6ff,
      b: 0xb8dcf0,
      k: 0xffffff,
    }),
};

// ── 11/26 도감 확장 84종 (바닷가 48 · 캠핑장 36) ── 같은 16×16·외곽선 규칙. 틀(물고기·나비·딱정벌레·광석 …)이 맞으면 틀로, 아니면 점 그림으로
/** 반투명 날개 (모시나비): 바깥 테두리·몸통은 그대로, 날개 색만 비치게 */
function sheer(g: Grid, colors: readonly Color[], a = 170): Grid {
  const keys = new Set(colors.map((c) => Grid.rgba(c)));
  for (let i = 0; i < g.px.length; i++) if (keys.has(g.px[i])) g.px[i] = Grid.rgba(g.px[i] >>> 8, a);
  return g;
}
/** 은은한 빛무리를 뒤에 깐 점 그림 (전설·빛나는 것) */
function glowArt(rows: string[], pal: Record<string, Color>, glow: Color, r = 7): Grid {
  const g = g16();
  g.ellipse(8, 8, r, r, glow, 60);
  g.ellipse(8, 8, r - 2.5, r - 2.5, glow, 90);
  g.draw(art(rows, pal), 0, 0);
  return g;
}

const EXP_ICONS: Record<string, () => Grid> = {
  // ─ 바다 물고기 (10) ─
  f_mangdung: () =>
    art(["........w.w...", ".......kbkb...", "d....bbbbbbb..", "dd.bbsbbbsbbb.", "ddbbbbbbbbbbbm", "dd.bblllllll..", "d....f...f...."], {
      b: 0x7a6a50,
      s: 0x5ac0e8,
      l: 0xc8b890,
      d: 0x5a4a38,
      w: 0xffffff,
      k: 0x101014,
      m: 0x3a2a20,
      f: 0x8a7a5a,
    }),
  f_halfbeak: () =>
    fish({
      shape: "long",
      body: 0x7aa8c8,
      belly: 0xf0f6fa,
      pattern: "band",
      mark: 0x2a5a8a,
      extra: (g) => {
        // 길게 나온 아래턱 (끝이 빨갛다)
        g.hline(14, 15, 9, 0x2a4a6a);
        g.set(15, 9, 0xe04a3a);
      },
    }),
  f_tshirt: () =>
    art(["...######...", "..#wwwwww#..", "####wwww####", "#ww#wwww#ww#", "#www#ww#www#", "...#wbbw#...", "...#wwww#...", "...#wbbw#...", "...#wwww#...", "...######..."], {
      "#": 0x2a6ab0,
      w: 0x6aa8e0,
      b: 0xf4f4ee,
    }),
  f_greenling: () => fish({ shape: "torpedo", body: 0x9a6a4a, belly: 0xe8d0b0, pattern: "spots", mark: 0x5a3a24, fin: 0xc8885a }),
  f_bollak: () =>
    fish({
      shape: "deep",
      body: 0x5a4a40,
      belly: 0xa8907a,
      pattern: "stripes",
      mark: 0x2e2620,
      fin: 0x3a302a,
      extra: (g) => {
        // 해 지면 커지는 큰 눈
        g.rect(11, 5, 2, 2, 0xffffff);
        g.set(12, 6, 0x101014);
      },
    }),
  f_puffer: () =>
    art(["....yyyyy...", "..yykyykyyy.", "d.yyyyyyyywk", "ddyykyyykyyy", "ddywwwwwwwyy", "d..wwwwwwww.", "....wwwwww.."], {
      y: 0xb89a4a,
      k: 0x3a2a1a,
      w: 0xf4f0e0,
      d: 0x8a7038,
    }),
  f_blackbream: () => fish({ shape: "deep", body: 0x56606a, belly: 0xc8ccd2, pattern: "stripes", mark: 0x3a424a, fin: 0x22262c }),
  f_seabass: () => fish({ shape: "torpedo", body: 0x8a9a9a, belly: 0xf2f4f4, pattern: "spots", mark: 0x24302e, fin: 0x5a6a6a }),
  f_knifejaw: () => fish({ shape: "deep", body: 0xdcdccc, belly: 0xf2f2e8, pattern: "stripes", mark: 0x1e1e22, fin: 0x3a3a3e }),
  f_moonhair: () =>
    glowArt(
      ["mm...........", "m...........s", "m..........sk", "..........sws", ".........sws.", "........sws..", ".......sws...", "......sws....", ".....sws.....", "....sws......", "...sws.......", "..sws........", ".ss.........."],
      { m: 0xfff0a0, s: 0x8aa8e0, w: 0xf2f6ff, k: 0x101014 },
      0x8ab0ff,
    ),
  // ─ 바닷가 곤충 (12) ─
  b_seaslater: () =>
    art(["a..........a", ".a........a.", "..a.bbbb.a..", "...bddddb...", "..bbbbbbbb..", "l.bddddddb.l", ".lbbbbbbbbl.", "l.bddddddb.l", ".lbbbbbbbbl.", "...bddddb...", "....bbbb....", "...t....t...", "..t......t.."], {
      a: 0x5a5048,
      b: 0x8a7a68,
      d: 0x5e5246,
      l: 0x4a4038,
      t: 0x6a5e50,
    }),
  b_darkling: () => beetle(0x5a4e42, { stripe: 0x8e7e64, dots: 0xd8c49a }),
  b_pyrgo: () =>
    art(["......s.....", ".....sss..k.", "....ssssss..", "...gggggggg.", "..gggggggggk", ".gggggggggg.", "ggllllllll..", ".l...l..l...", "l....l...l.."], {
      g: 0x7ab848,
      s: 0x9ad068,
      l: 0x4a7a2a,
      k: 0x101014,
    }),
  b_glider: () => dragonfly(0xe0a030),
  b_tigerbeetle: () => beetle(0x2a8a5a, { dots: 0xf4f4ee, tri: 0xd04a2a, jaws: true, shine: true }),
  b_earwig: () =>
    art(["..aa.aa..", "...hhh...", "..lhhhl..", "...ttt...", "..lwwwl..", "...www...", "..lbbbl..", "...bbb...", "...bbb...", "...bbb...", "..f...f..", "..f...f..", "...f.f..."], {
      a: 0x3a2418,
      h: 0x4a2a1a,
      t: 0x6a3a22,
      w: 0xc8884a,
      b: 0x7a4426,
      l: 0x3a2418,
      f: 0x2a1810,
    }),
  b_antlion: () => {
    // 모래 깔때기 구덩이 (위에서 비스듬히) — 바닥에 개미귀신 큰 턱
    const g = g16();
    g.ellipse(8, 10, 7.4, 4.6, 0xe8d4a0);
    g.ellipse(8, 10.4, 5.2, 3.2, 0xd0b47e);
    g.ellipse(8, 10.8, 3.4, 2, 0x8a6a44);
    g.ellipse(8, 11.2, 2, 1.1, 0x3e2a1a);
    // 구덩이 바닥에서 벌린 큰 턱
    for (const [x, y] of [[6, 10], [6, 9], [7, 8], [10, 10], [10, 9], [9, 8]]) g.set(x, y, 0xe0c890);
    g.set(8, 11, 0x9a7a4a);
    for (const [x, y] of [[12, 5], [13, 5], [12, 4]]) g.set(x, y, 0x2a2420);
    g.outline(OUT, false, 200);
    return g;
  },
  b_seaskater: () => strider(0x2a3a5a),
  b_antlionfly: () => dragonfly(0x4a3a2e),
  b_chestnut: () => butterfly(0xc8e0f0, 0xa0502a, 0x2a2420, false, 0x2a2420),
  b_seafirefly: () => {
    // 밤 파도에 번지는 푸른 빛 + 씨앗 같은 작은 갑각류
    const g = g16();
    g.ellipse(8, 10, 7.4, 4.6, 0x1e3050);
    g.ellipse(8, 10, 5.6, 3.2, 0x284a78);
    for (const [x, y, r] of [[4, 9, 1.6], [11, 11, 1.8], [8, 7, 1.2], [12, 8, 1.1]] as const) g.ellipse(x, y, r + 1, r + 0.6, 0x4ad8ff, 120);
    for (const [x, y] of [[4, 9], [11, 11], [8, 7], [12, 8], [6, 12]]) g.set(x, y, 0xb8f6ff);
    g.ellipse(7.5, 10.5, 1.8, 1.1, 0xd8c8a0);
    g.set(9, 10, 0x101014);
    g.outline(OUT, false, 200);
    for (const [x, y] of [[2, 3], [13, 2], [5, 2]]) g.set(x, y, 0x8ae8ff, 200);
    return g;
  },
  b_dragonmsg: () => butterfly(0x3ad0c8, 0x2a6ad8, 0xffd060, true, 0xffd060),

  // ─ 바닷가 약초·버섯 (12) ─
  h_tot: () =>
    art(["...o..o..", "..ooo.oo.", ".oo.oooo.", "..oooo.o.", ".o.oo.oo.", "..oo.oo..", "...ooo...", "....o....", "..rrrrr..", ".rrrrrrr."], {
      o: 0x6a6a2a,
      r: 0x6a6460,
    }),
  h_hamcho: () =>
    art(["..r...r..r.", "..g..rg..g.", ".gg..gg.gg.", "..g.gg..g..", "..gg.g.gg..", "...g.g.g...", "...ggggg...", "....ggg....", "..mmmmmmm..", ".mmmmmmmmm."], {
      g: 0x5aa848,
      r: 0xd8504a,
      m: 0x8a7a68,
    }),
  h_beachglory: () =>
    art(["...pppp....", "..pppppp...", ".ppwwwwpp..", ".ppwyywpp..", ".ppwwwwpp..", "..pppppp...", "...pppp.ll.", "....g..llll", ".llgggg.ll.", "llll..gg...", ".ll....ggg."], {
      p: 0xf0a0c8,
      w: 0xfce8f2,
      y: 0xf8e070,
      g: 0x4a8a3a,
      l: 0x5aa848,
    }),
  h_parae: () =>
    art(["..g....g...", ".ggg..ggl..", ".glg.ggg...", "..gggglg.g.", ".g.gglgggg.", "gglggggglg.", ".gggglggg..", "..ggggggg..", ".rrrrrrrrr.", "rrrrrrrrrrr"], {
      g: 0x6ad050,
      l: 0xa8f088,
      r: 0x6a6460,
    }),
  h_miyeok: () =>
    art(["....kk....", "...kkkk...", "..kkllkk..", "..kklkkk..", ".kkllkkkk.", ".kkklkkkk.", "kkkkllkkk.", ".kkklkkkk.", "..kkkkkk..", "...kkkk...", "....ss....", "..rrrrrr.."], {
      k: 0x4a5a28,
      l: 0x7a8a3a,
      s: 0x3a4220,
      r: 0x6a6460,
    }),
  h_bangpung: () => rosette(0x3e7a52, { round: true, spike: 0xe8e0c8 }),
  h_haedang: () =>
    art(["...p.p.....", "..ppppp....", ".ppyyypp...", "..pyyyp....", ".ppppppp...", "..p.g.p....", "....g..ll..", "..llg.llll.", ".lll.g.ll..", "..l..g.t...", ".....g......"], {
      p: 0xe8508a,
      y: 0xf8d040,
      g: 0x4a7a3a,
      l: 0x5a9a48,
      t: 0xd8c8a0,
    }),
  h_agar: () =>
    art(["..r..r..r..", ".rdr.rr.rr.", "..rrdr.rd..", ".r.rrrrr.r.", "..rr.drr.r.", "...rrrrrr..", "....rdr....", ".....r.....", "..mmmmmmm..", ".mmmmmmmmm."], {
      r: 0xb83a4a,
      d: 0x7a2030,
      m: 0x8a7a68,
    }),
  h_laver: () =>
    art(["..kkkkkkk...", ".kpkkpkkkk..", ".kkkkkkpkk..", "kkpkkkkkkkk.", ".kkkpkkpkk..", "..kkkkkkk...", ".rrrrrrrrrr.", "rrrrlrrrrlrr", ".rrrrrrrrrr."], {
      k: 0x2a2434,
      p: 0x5a3a6a,
      r: 0x6a6a72,
      l: 0x8a8a92,
    }),
  h_sandball: () =>
    art(["...bbbbb...", "..bbbbbbb..", ".bbhbbbbbb.", ".bhbbbkkbb.", ".bbbbkkkbb.", "..bbbbkbb..", "...bbbbb...", ".sssssssss.", "sssssssssss"], {
      b: 0xb8946a,
      h: 0xe0c49a,
      k: 0x2a2224,
      s: 0xe8d4a0,
    }),
  h_pungran: () =>
    art(["..w...w....", ".www.www...", "..wyw.wy...", "...w...w...", "..ll.ll....", ".llllll....", "lll..lll...", "...gg......", "..g.g.g....", ".rrrrrrrr..", "rrrrrrrrrr."], {
      w: 0xf8f6f0,
      y: 0xe8d070,
      l: 0x3a7a3a,
      g: 0xb8c8a8,
      r: 0x6a6a72,
    }),
  h_dragonkelp: () =>
    glowArt(
      ["....yy....", "...ytty...", "..yttty...", "..ttytt...", ".tttytt...", ".ttyttt.y.", "..ttytt...", "..tttyt...", "...ttt....", "....y.....", "...yyy...."],
      { t: 0x2ab8a0, y: 0xffd860 },
      0x6af0d0,
    ),

  // ─ 바닷가 광석 (10) ─
  o_mongdol: () =>
    art(["...........", "..aaaa.....", ".aahaaa....", ".aaaaaa.bb.", "..aaaa.bhbb", ".cccc..bbbb", "chcccc..bb.", "cccccc.....", ".cccc......"], {
      a: 0x6a7280,
      b: 0x8a8478,
      c: 0x4e525a,
      h: 0xc8ccd4,
    }),
  o_basalt: () => rock(0x4a4a52, 0x1e1e24),
  o_seasalt: () =>
    art(["....ww.....", "...wwwh....", "...whhh.ww.", ".ww.hh.wwwh", "wwwh..wwhhh", "whhh.wwhhh.", ".hhwwwh.hh.", "..wwwhhh...", "..whhhh....", "...hhh....."], {
      w: 0xffffff,
      h: 0xd8e0e8,
    }),
  o_seaglass: () =>
    art(["..gggg.....", ".gglggg....", ".gllggg....", ".ggggggg...", "..ggggg.bb.", "...ggg.bblb", "......bbllb", "......bbbbb", ".......bbb."], {
      g: 0x6ad0a8,
      l: 0xd0fff0,
      b: 0x6aa8e8,
    }),
  o_columnar: () =>
    art([".....tt.....", "....tttt....", ".tt.lmmd....", "ttttlmmd.tt.", "lmmdlmmdtttt", "lmmdlmmdlmmd", "lmmdlmmdlmmd", "lmmdlmmdlmmd", "lmmdlmmdlmmd", "lmmdlmmdlmmd", "rrrrrrrrrrrr"], {
      t: 0x9aa0a8,
      l: 0x6e747c,
      m: 0x555960,
      d: 0x3a3e46,
      r: 0xe8d4a0,
    }),
  o_pearl: () =>
    art(["....wwww....", "...whhwww...", "..whhwwwww..", "..wwwwwwwp..", "..wwwwwwpp..", "...wwwppp...", "....pppp....", "bbbbbbbbbbbb", "bllblllblllb", ".bllbllbllb.", "..bbbbbbbb.."], {
      w: 0xf8f4ec,
      h: 0xffffff,
      p: 0xe0d0e0,
      b: 0xb8a088,
      l: 0xe8d8c8,
    }),
  o_agate: () =>
    art(["...oooo...", "..owwooo..", ".owoooowo.", ".oowwwwoo.", "owoorroowo", "owwrwwrowo", "owoorroowo", ".oowwwwoo.", "..oooooo..", "...oooo..."], {
      o: 0xd8783a,
      w: 0xf8e8d0,
      r: 0xa8402a,
    }),
  o_blackpearl: () =>
    art(["....kkkk....", "...kgkkkk...", "..kgpkkkkk..", "..kpkkkkkk..", "..kkkkkkgk..", "...kkkkgk...", "....kkkk....", "............", ".hhhhhhhhhh.", "hhhhhhhhhhhh"], {
      k: 0x2a2a34,
      g: 0x5a8a7a,
      p: 0x8a6aa8,
      h: 0xb8a088,
    }),
  o_coral: () =>
    art(["r...r....r.", "r..rr..rr..", ".rr.r.rr..r", "..r.rrr..rr", "...rrrr.rr.", "....rrrrr..", ".....rrr...", ".....rr....", "..sssssss..", ".sssssssss."], {
      r: 0xe0443a,
      s: 0xe8d4a0,
    }),
  o_mermaid: () =>
    glowArt(["...b....", "...bb...", "..bwb...", "..bwbb..", ".bwbbbb.", ".bwbbbb.", "bbbbbbdb", "bbbbbbdb", ".bbbbdb.", "..bddb.."], { b: 0x4ab0f0, w: 0xe8f8ff, d: 0x2a6ac8 }, 0x6ad0ff),

  // ─ 바닷가 발굴품 (4) ─
  d_sandflag: () =>
    art(["...rrrr...", "...rrrrr..", "...rrr....", "...p......", "...p......", "...p......", "..sssss...", ".sssssss..", "sssssssss.", "sssssssss."], {
      r: 0xe0403a,
      p: 0x8a6a42,
      s: 0xe8d4a0,
    }),
  d_beachticket: () =>
    art(["############", "#yyyyyyyy.y#", "#ybbbbyyy.y#", "#yyyyyyyy.y#", "#ynnnnnny.y#", "#yyyyyyyy.y#", "############"], {
      "#": 0x9a7a4a,
      y: 0xf0d8a0,
      b: 0x3a6ab0,
      n: 0xa08a6a,
      ".": 0xc8a870,
    }),
  d_bottlemail: () =>
    art(["........kk.", ".......gkg.", "......ggg..", ".....gwwg..", "....gwwwg..", "...gwwwg...", "..gwwwg....", ".ggwwg.....", ".gggg......", "..gg......."], {
      g: 0x5ab08a,
      w: 0xf0e4c0,
      k: 0x8a5a3a,
    }),
  d_ambergris: () =>
    art(["....aaaa...", "..aaaaaaaa.", ".aalaaaaaa.", "aaaaadaaala", "aldaaaaaaaa", ".aaaaadaaa.", "..aaaaaaa..", "...aaaa...."], {
      a: 0x9a948a,
      l: 0xc8c4b8,
      d: 0x6a6458,
    }),

  // ─ 캠핑장 곤충 (9) ─
  b_demoiselle: () => {
    // 까만 날개 물잠자리: 잠자리 틀의 날개만 검게
    const g = dragonfly(0x2a9a6a);
    const wing = Grid.rgba(0xd8eef8, 210);
    for (let i = 0; i < g.px.length; i++) if (g.px[i] === wing) g.px[i] = Grid.rgba(0x4a4458, 240);
    return g;
  },
  b_stonefly: () =>
    art([".a.....a..", "..a...a...", "...hhh....", "...hhh....", "..wwwww...", "..wwwww...", "..wwwww...", "..wwwww...", "...www....", "...t.t....", "..t...t...", ".sssssss..", "sssssssss."], {
      a: 0x3a3a40,
      h: 0x2a2a30,
      w: 0x4a4a54,
      t: 0x3a3a40,
      s: 0xf2f6fa,
    }),
  b_mosquito: () =>
    art(["....w..w....", "...ww..ww...", "..www..www..", "....kkk.....", "....ksk.....", "....kkk.....", "....kwk.....", "....kkk.....", "...l.k.l....", "..l..k..l...", ".l...p...l..", ".....p......"], {
      w: 0xd8e8f0,
      k: 0x3a3a40,
      s: 0xf4f4f4,
      l: 0x5a5a62,
      p: 0xd84a3a,
    }),
  b_groundbeetle: () => beetle(0x3a2a3a, { stripe: 0xd8402a, shine: true }),
  b_divingbeetle: () =>
    art([".....kk.....", "....kkkk....", "...ykkkky...", "..ykkkkkky..", "l.ykkkkkky.l", ".lykkhkkky.l", "l.ykkkkkky.l", "..ykkkkkky..", "...ykkkky...", "....yyyy..w.", ".........wbw", "..........w."], {
      k: 0x2e3a2a,
      y: 0xc8b048,
      h: 0x6a7a5a,
      l: 0x2a2420,
      w: 0xd8f0ff,
      b: 0x8ac8e8,
    }),
  b_glacialis: () => sheer(butterfly(0xeef0f0, 0xd4d8d8, 0x2a2420, false, 0x6a6a70), [0xeef0f0, 0xd4d8d8]),
  b_dobson: () =>
    art(["j........j.", ".j.hhhhh.j..", "..jhhhhhj...", "...hhhhh....", "..wwwwwww...", ".wwmwwwmww..", "wwwwbbbwwww.", "wwmwbbbwmww.", ".wwwbbbwww..", "..wwbbbww...", "....bbb.....", ".....b......"], {
      j: 0x3a2418,
      h: 0x6a4a2e,
      w: 0xb8a888,
      m: 0x6a5a42,
      b: 0x5a3e26,
    }),
  b_redspot: () => butterfly(0xf2f0ea, 0xe4e0d6, 0x2a2420, false, 0xd83a2a),
  b_gumiho: () => {
    const g = g16();
    g.ellipse(8, 8, 7.5, 7.5, 0xffb060, 55);
    g.draw(butterfly(0xf8f0e0, 0xe8883a, 0x3a2a20, true, 0xe8883a), 0, 0);
    for (const x of [6, 9]) {
      g.set(x, 14, 0xf8f0e0);
      g.set(x, 15, 0xe8883a);
    }
    return g;
  },
  // ─ 캠핑장 약초·버섯 (9) ─
  h_rockmaple: () =>
    art(["..w.w.w....", ".wwwwwww...", "..wpwpw....", "...g.g.....", "....g..rr..", "..ll.g.rlr.", ".llll.gllr.", "..ll..gg...", "..mmmmmmmm.", ".mmhmmmmmmm", ".mmmmmmhmm."], {
      w: 0xfaf6f2,
      p: 0xf0b8c8,
      g: 0x6a5a3a,
      l: 0x5aa848,
      r: 0xc8503a,
      m: 0x7a7c84,
      h: 0xa0a2aa,
    }),
  h_moss: () =>
    art(["...g.g.g....", "..gglgglg...", ".gglgglgggg.", ".gggggggggl.", "glgggglgggg.", "mmmmmmmmmmmm", "mhmmmmmhmmmm", ".mmmmmmmmmm."], {
      g: 0x4a9a3a,
      l: 0x8ad060,
      m: 0x7a7c84,
      h: 0xa0a2aa,
    }),
  h_darae: () => berries(0x8ac850, 0x4a7a2a),
  h_chopi: () =>
    art(["......ll...", ".....llll..", "...b.ll....", "..rkr.b....", "...r.rkr...", ".rkr..r.b..", "..r.b...rkr", ".b.rkr...r.", "....r.rkr..", "......r....", "....bbb...."], {
      r: 0xb8402a,
      k: 0x1e1a1a,
      b: 0x6a4a2a,
      l: 0x4a8a3a,
    }),
  h_kudzu: () => root(0x6e4a2e),
  h_lionmane: () =>
    art(["..wwwwww...", ".wwhwwhww..", "wwhwwhwwhw.", "whwwhwwhww.", "wwhwwhwwhw.", "whwwhwwhww.", ".whwwhwwh..", "..w.w.w.w..", ".bbbbbbbb..", "bbbbbbbbbb."], {
      w: 0xf6f2e8,
      h: 0xd8d0c0,
      b: 0x6a4a2e,
    }),
  h_wasabi: () =>
    art(["..ll...ll..", ".llll.llll.", ".lllllllll.", "..lllllll..", "....sss....", "....sss....", "...gggggg..", "...gghggg..", "...ggggggg.", "....gggggg.", "....wwwwww.", "...wwwwww.."], {
      l: 0x4aa040,
      s: 0x6a9a4a,
      g: 0x9ac870,
      h: 0xd8f0b8,
      w: 0x8ac8e8,
    }),
  h_neungi: () =>
    art([".kkkkkkkkk.", "kbkbkbkbkbk", "kkbkbkbkbkk", ".kkkbbbkkk.", "...kbbbk...", "....bbb....", "....bbb....", "...ttttt...", "..ttttttt.."], {
      k: 0x3a2618,
      b: 0x6a4a32,
      t: 0x8a6a4a,
    }),
  h_hasuo: () =>
    glowArt(
      ["...ll.l..", "..l.ll...", "...rrr...", "..rhrrr..", "..rrrrr..", ".r.rrr.r.", "r..rrr..r", "...r.r...", "..r...r..", "..r...r.."],
      { l: 0x4a9a3a, r: 0xa86a3a, h: 0xe8b878 },
      0xffd860,
    ),

  // ─ 캠핑장 돌 (8) ─
  o_chadol: () => rock(0xe8e4dc, 0xffffff, { smooth: true }),
  o_gneiss: () =>
    art(["...gggggg...", "..ggggggggg.", ".gdddggddgg.", "gggggddgggg.", "gddggggggdd.", "ggggddddggg.", "ggdddggggdd.", ".gggggdddg..", "..gggggggg.."], {
      g: 0x9a9488,
      d: 0x4a463e,
    }),
  o_petrified: () =>
    art(["...bbbbbb...", "..bccccccb..", ".bcddddddcb.", ".bcdccccdcb.", ".bcdcrrcdcb.", ".bcdccccdcb.", ".bcddddddcb.", "..bccccccb..", "...bbbbbb..."], {
      b: 0x7a6248,
      c: 0xc8a878,
      d: 0x9a7a58,
      r: 0xa85a3a,
    }),
  o_pyrite: () =>
    art(["....yyyy...", "...yyyyyd..", "...hhhyyd..", "...yyyyyd..", ".yyyydddyyy", "yyyyydyyyyd", "hhhyyd.hyyd", "yyyyyd.yyyd", "yyyyyd.dddd", "dddddd....."], {
      y: 0xc8a840,
      h: 0xf8e890,
      d: 0x8a7024,
    }),
  o_fluorite: () =>
    glowArt(
      ["...pppp...", "..ppllpp..", ".pplppppp.", ".pppppgg..", "..pppgggg.", "..ppggggg.", ".gggglggg.", ".gggggggg.", "..gggggg..", "...gggg..."],
      { p: 0x9a6ae0, l: 0xe8d8ff, g: 0x5ad0a0 },
      0x9a7aff,
      6,
    ),
  o_topaz: () => gem(0xf0c040),
  o_orbicular: () =>
    art(["...gggggg...", "..gggggggg..", ".gwkwggwkwg.", ".gkwkggkwkg.", "ggwkwggwkwgg", "gggggwkwgggg", "ggggwkwkwggg", ".gggwkwgggg.", "..gggggggg.."], {
      g: 0x8a8c90,
      w: 0xf0ece0,
      k: 0x2e2c2a,
    }),
  o_yeouiju: () => {
    const g = g16();
    g.ellipse(8, 9, 7, 6.5, 0x6ad0ff, 70);
    for (const [x, y] of [[8, 1], [7, 2], [9, 2], [6, 3], [10, 3]]) g.set(x, y, 0xffd060);
    g.ellipse(8, 9, 4.2, 4.2, 0x5aa8f0);
    g.recolor((x, y) => y >= 11 && g.filled(x, y), 0x3a7ad0);
    g.ellipse(6.5, 7.5, 1.6, 1.2, 0xd8f4ff);
    g.set(6, 7, 0xffffff);
    g.set(10, 10, 0xffe890);
    g.outline(OUT, false, 200);
    return g;
  },

  // ─ 캠핑장 발굴품 (10) ─
  d_tentpeg: () =>
    art(["..hhh.....", "..hsh.....", "...s......", "...s......", "...s......", "....s.....", "....s.....", ".....s....", ".....ss...", "......ss..", ".......s.."], {
      h: 0xd84a3a,
      s: 0xb8bec8,
    }),
  d_sock: () =>
    art(["....rrrr..", "....wwww..", "....gggg..", "....gggg..", "....gggg..", "....gggg..", "...ggggg..", ".gggggggg.", "gghgggggg.", "gggggggg..", ".rrrrrr..."], {
      r: 0xd84a3a,
      w: 0xf2f2ee,
      g: 0x6a7a5a,
      h: 0x8a9a7a,
    }),
  d_coppel: () =>
    art(["....hh....", "...h..h...", ".rrrrrrrr.", "rrorrrrorr", "rrrrorrrrr", "rorrrrrror", "rrrrrrorrr", ".rrrrrrrr."], {
      h: 0x6a6a72,
      r: 0x9aa0a8,
      o: 0xb0703a,
    }),
  d_film: () =>
    art(["kkkkkkkkkkkk", "k.k.k.k.k.k.", "kaaakbbbkcck", "kaaakbbbkcck", "kaaakbbbkcck", "k.k.k.k.k.k.", "kkkkkkkkkkkk"], {
      k: 0x3a2a22,
      ".": 0xc8a870,
      a: 0xd8a060,
      b: 0x8ab8c8,
      c: 0xc89a6a,
    }),
  d_float: () =>
    art(["...a......", "...a......", "..rrr.....", "..rrr.....", "..yyy.....", "..www.....", "..www.....", "...w......", "...w......", "......ww..", ".....ww...", ".....w....", "....w....."], {
      a: 0x3a3a40,
      r: 0xe0403a,
      y: 0xf0c040,
      w: 0xf4f0e0,
    }),
  d_knife: () =>
    art(["...........", "..o........", ".oso.......", "..oso......", "...ososs...", "....rrrrrr.", "...rrwrrrrr", "....rrrrrr.", "..........."], {
      o: 0xb0703a,
      s: 0xb8bec8,
      r: 0xc8402a,
      w: 0xf4f4ee,
    }),
  d_rooftile: () =>
    art(["..kkkkkkkk..", ".kkkkkkkkkk.", "kkggkkggkkkk", "kgkkgggkgkk.", "kkgkkkkgkk..", ".kkggggkk...", "..kkkkkk....", "...kkk......"], {
      k: 0x5a5e66,
      g: 0x8a9098,
    }),
  d_trilobite: () =>
    art(["...ssss...", "..sbbbbs..", ".sbbbbbbs.", ".sbsbbsbs.", "..sbbbbs..", ".sbsbbsbs.", "..sbbbbs..", ".sbsbbsbs.", "..sbbbbs..", "...sbbs...", "....ss...."], {
      s: 0x6a6458,
      b: 0xb8ae98,
    }),
  d_yeopjeon: () =>
    art(["r.........", ".r........", "..cc......", ".cyyc.....", ".cykc.cc..", ".cyyc.yyc.", "..cc.cykc.", "...rrcyyc.", ".....rcc..", "....cc.r..", "...cyyc...", "...cykc...", "...cyyc...", "....cc...."], {
      r: 0xb84a3a,
      c: 0xa87828,
      y: 0xd8a848,
      k: 0x3a2a1a,
    }),
  d_goldaxe: () =>
    glowArt(
      [".yyyy......", "yyhyyyww...", "yhyyyyww...", "yyyyyyww...", "yyyyyyww...", ".yyyy.ww...", ".....ww....", ".....ww....", ".....ww....", ".....ww....", ".....ww....", ".....rr...."],
      { y: 0xffc830, h: 0xfff0a0, w: 0x9a6a3a, r: 0x6a4424 },
      0xffe080,
      6.5,
    ),
};

function draw(id: string): Grid | null {
  if (EXP_ICONS[id]) return EXP_ICONS[id]();
  if (FISH_SPECS[id]) return fish(FISH_SPECS[id]);
  if (SEA_ART[id]) return SEA_ART[id]();
  if (JUNK_ART[id]) return JUNK_ART[id]();
  if (DIG_ART[id]) return DIG_ART[id]();
  if (HERB_ART[id]) return HERB_ART[id]();
  switch (id) {
    // 곤충
    case "b_cabbage":
      return butterfly(0xf4f4ee, 0xe8e8de, undefined, false, 0x2a2420);
    case "b_swallowtail":
      return butterfly(0xf0d040, 0x2a2420, undefined, true, 0x2a2420);
    case "b_snowwing":
      return butterfly(0xe8f4ff, 0xb8d8f8, 0x6a8ab0, false, 0xffffff);
    case "b_lunar":
      return butterfly(0xc8f0b0, 0xa8e090, 0x6a5a3a, true, 0xe8b04a);
    case "b_moth":
      return butterfly(0x9a8a7a, 0x7a6a5a, 0x4a3a2a, false, 0x5a4a3a);
    case "b_redfly":
      return dragonfly(0xd83a2a);
    case "b_ladybug":
      return beetle(0xd83a2a, { dots: 0x1a1a1a });
    case "b_gold":
      return beetle(0xf0b828, { shine: true });
    case "b_stag":
      return beetle(0x5a3a22, { jaws: true });
    case "b_rhino":
      return beetle(0x6a3a1a, { horn: true });
    case "b_dung":
      return beetle(0x2a2a2e, { ball: true });
    case "b_hopper":
      return hopper(0x7ab040);
    case "b_cricket":
      return hopper(0x4a3a2a);
    case "b_mantis":
      return hopper(0x8ac050, true);
    case "b_firefly":
      return firefly(0xffe060);
    case "b_wisp":
      return firefly(0x6ad0ff);
    case "b_cicada":
      return cicada(0x5a4a32);
    case "b_bee":
      return bee();
    case "b_ant":
      return ant(0x3a2420);
    case "b_skimmer":
      return dragonfly(0x5a8ad8);
    case "b_strider":
      return strider(0x4a4038);
    case "b_katydid":
      return hopper(0x5ac060, false, true);
    case "b_stink":
      return beetle(0x6a7a3a, { tri: 0xd8c050 });
    case "b_jewel":
      return beetle(0x2a9a6a, { shine: true, stripe: 0xb05ae0 });
    case "b_mayfly":
      return mayfly(0xd8c890);
    case "b_anglewing":
      return butterfly(0xe0782a, 0xb05a20, 0x3a2a1a, false, 0x2a1a10);
    case "b_hawkmoth":
      return butterfly(0x8a7a6a, 0xe88a9a, 0x5a4a3a, false, 0x3a2a2a);
    case "b_emperor":
      return butterfly(0x6a4ab0, 0x4a3a8a, 0x2a2420, false, 0xf4f4ee);
    case "b_wintermoth":
      return butterfly(0xd8d4c8, 0xb8b4a8, 0x6a6458, false, 0x8a8478);
    case "b_longhorn":
      return beetle(0x3a3028, { dots: 0xc8a04a, antennae: 0x3a3028 });
    // 11/26 캠핑장 숲 곤충
    case "b_springtail":
      return ant(0x5a6a8a);
    case "b_cranefly":
      return mayfly(0xb08a5a);
    case "b_camelcricket":
      return hopper(0x8a6a4a, false, true);
    case "b_caddis":
      return butterfly(0x8a7a5a, 0x6a5a42, 0x3a2a1a, false, 0xc8b48a);
    case "b_rainbowbeetle":
      return beetle(0x2a5ad0, { shine: true, stripe: 0x4ad08a, antennae: 0x2a2420 });
    case "b_snowscorp":
      return hopper(0x4a4a5a, true, true);
    // 약초·버섯
    case "h_mugwort":
      return plant(0x8aa88a);
    case "h_dandelion":
      return plant(0x5a9a3a, 0xf8d030);
    case "h_clover":
      return clover(3);
    case "h_fourleaf":
      return clover(4, 0x4ac05a);
    case "h_shepherd":
      return plant(0x6aa84a, 0xf4f4ee);
    case "h_bellflower":
      return plant(0x5a9a4a, 0x8a7ae0, { tall: true });
    case "h_fern":
      return plant(0x6ab04a, undefined, { tall: true, curl: true });
    case "h_mistletoe":
      return plant(0x5a8a3a, 0xf4f4ee);
    case "h_deodeok":
      return root(0xd8c8a0);
    case "h_ginseng":
      return root(0xe8d8b0, 0xd83a2a);
    case "h_cordyceps":
      return root(0xe89040);
    case "h_shiitake":
      return mushroom(0x8a5a3a, 0xe8dcc0, { spots: 0xd8c0a0 });
    case "h_songi":
      return mushroom(0xa07a4a, 0xf0e8d4);
    case "h_reishi":
      return mushroom(0x9a3a2a, 0xc89a5a, { fan: true });
    case "h_glowcap":
      return mushroom(0x5ad0d0, 0xc8f0f0, { glow: 0x6af0f0, spots: 0xe0ffff });
    case "h_dropwort":
      return stems(0x5ac070);
    case "h_plantain":
      return rosette(0x4a9a3a, { spike: 0xc8c08a });
    case "h_oyster":
      return mushroom(0xb8b0a8, 0xe0dcd4, { fan: true });
    case "h_gomchwi":
      return rosette(0x3a8a3a, { round: true });
    case "h_omija":
      return berries(0xd8303a);
    case "h_lotus":
      return cupFlower(0xf0a0c0, 0x4a9a4a, 0xf8d040);
    case "h_hovenia":
      return berries(0x8a5a2a, 0x6a8a3a);
    case "h_adonis":
      return cupFlower(0xf8d020, 0xf4f8ff, 0x9a7a20);
    // 11/26 캠핑장 숲 버섯·나물
    case "h_woodear":
      return mushroom(0x6a3a2a, 0x5a3020, { fan: true });
    case "h_wildgarlic":
      return rosette(0x6ab85a, { spike: 0xf4f4ee });
    case "h_poria":
      return root(0xa88458, 0x6a4a2a);
    case "h_sanghwang":
      return mushroom(0xb07a2a, 0x6a4a2a, { fan: true, spots: 0xe8c040 });
    // 광석
    case "o_pebble":
      return rock(0x9aa0a6, undefined, { smooth: true });
    case "o_coal":
      return rock(0x2e2e34, 0x4a4a54);
    case "o_copper":
      return rock(0x7a6a5a, 0xe08a4a);
    case "o_iron":
      return rock(0x6a5a52, 0xb05a3a);
    case "o_quartz":
      return rock(0x8a8e94, undefined, { crystal: 0xe8f0f8 });
    case "o_silver":
      return rock(0x6a6e78, 0xe0e4ea);
    case "o_amethyst":
      return rock(0x6a6470, undefined, { crystal: 0xa86ae0 });
    case "o_gold":
      return rock(0x6a5e4a, undefined, { nugget: 0xffd040 });
    case "o_meteor":
      return rock(0x3a3448, 0x8ad0ff, { glow: 0x6ab0ff });
    case "o_diamond":
      return gem(0xc8f0ff);
    case "o_flint":
      return rock(0x5a5a62, 0x8a8a92, { spark: 0xffd040 });
    case "o_lead":
      return rock(0x4a5260, 0x7a8698, { smooth: true });
    case "o_mica":
      return rock(0x7a7068, undefined, { flakes: 0xe8e0c8 });
    case "o_jade":
      return cabochon(0x4ab07a);
    case "o_garnet":
      return rock(0x6a5a5a, undefined, { nugget: 0xc8283a });
    case "o_obsidian":
      return rock(0x24222c, undefined, { glass: true });
    case "o_aquamarine":
      return rock(0x8a8e94, undefined, { crystal: 0x6ad8e8 });
    case "o_ruby":
      return gem(0xe02a4a);
    case "o_sapphire":
      return gem(0x2a5ad8);
    // 11/26 캠핑장 바위
    case "o_skipstone":
      return rock(0x6a7480, 0xa8b0b8, { smooth: true });
    case "o_suseok":
      return rock(0x3e4450, 0x6a7480);
    case "o_placer":
      return rock(0xd8c8a0, undefined, { flakes: 0xffd040 });
    case "o_moonstone":
      return cabochon(0xd8e4f4, [0x9ab8f0, 0xffffff]);
    case "o_opal":
      return cabochon(0xe8f0f8, [0xf06a8a, 0x6ad0a0, 0x6a9af0, 0xf0c040, 0xb07ae0]);
    default:
      return null;
  }
}

/** forage 아이템 그림 그리드 (캔버스 없이 — 시험에서 그림끼리 비교할 때). 모르는 id면 null */
export function forageIconGrid(id: string): Grid | null {
  return draw(id);
}

const cache = new Map<string, HTMLCanvasElement | null>();

/** forage 아이템 아이콘 (16×16 캔버스). 모르는 id면 null */
export function forageIconCanvas(id: string): HTMLCanvasElement | null {
  if (cache.has(id)) return cache.get(id)!;
  const g = draw(id);
  const c = g ? g.toCanvas() : null;
  cache.set(id, c);
  return c;
}

/** 이 id가 forage 아이템 아이콘인지 (그림이 있는지) */
export function isForageIcon(id: string): boolean {
  return /^[fbhod]_/.test(id) && draw(id) !== null;
}
