import { darken, Grid, lighten, type Color } from "./pixel";

// 낚시·채집물 픽셀아트 아이콘 16×16 (가방·도감·NPC 창·잡았을 때 머리 위). 종마다 틀(물고기·나비·딱정벌레·풀·버섯·광석 …)에
// 색과 무늬를 넣어 그린다. itemIcons.ts가 forage 아이템 id(f_/b_/h_/o_/d_)를 여기로 넘긴다. Phaser 없이 캔버스만.

const OUT = 0x1e1c1a;
const g16 = () => new Grid(16, 16);

// ── 물고기 ──
type FishShape = "round" | "slim" | "long" | "big" | "sturgeon";
type FishSpec = {
  shape: FishShape;
  body: Color;
  belly?: Color;
  fin?: Color;
  pattern?: "stripes" | "spots" | "band" | "shine" | "plates";
  mark?: Color;
  whiskers?: boolean;
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
  }
  // 눈
  const ex = Math.round(d.cx + d.rx - 2);
  const ey = Math.round(d.cy - 1);
  g.set(ex, ey, 0xffffff);
  g.set(ex + 1, ey, 0x101014);
  if (f.whiskers) {
    const mx = Math.round(d.cx + d.rx);
    g.set(mx + 1, ey + 2, 0x3a3028);
    g.set(mx + 2, ey + 3, 0x3a3028);
    g.set(mx + 1, ey + 3, 0x3a3028);
  }
  g.outline(OUT);
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

function beetle(shell: Color, opts: { dots?: Color; horn?: boolean; jaws?: boolean; ball?: boolean; shine?: boolean } = {}): Grid {
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
  g.set(6, 7, lighten(shell, 0.5));
  g.outline(OUT, false, 200);
  return g;
}

function hopper(body: Color, mantis = false): Grid {
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
  } else {
    g.set(14, 5, dark);
    g.set(15, 4, dark);
  }
  g.outline(OUT, false, 200);
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

// ── 광석 ──
function rock(base: Color, vein?: Color, opts: { crystal?: Color; nugget?: Color; glow?: Color; smooth?: boolean } = {}): Grid {
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
};

const JUNK_ART: Record<string, () => Grid> = {
  f_shoe: () => art(["....####...", "....#bb#...", "....#bb#...", "#####bb####", "#bbbbbbbbb#", "###########"], { "#": 0x1a1a20, b: 0x4a4a56 }),
  f_badge: () => art(["...##...", "...##...", "########", "#wwwwww#", "#wffwww#", "#wffwll#", "#wwwwww#", "#bbbbbb#", "########"], { "#": 0x3a6ad0, w: 0xf2f2ee, f: 0xe0b896, l: 0x8a9aaa, b: 0x3a6ad0 }),
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
};

function draw(id: string): Grid | null {
  if (FISH_SPECS[id]) return fish(FISH_SPECS[id]);
  if (JUNK_ART[id]) return JUNK_ART[id]();
  if (DIG_ART[id]) return DIG_ART[id]();
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
    default:
      return null;
  }
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
