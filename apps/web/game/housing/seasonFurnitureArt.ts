import { Grid, lighten, mix, type Color } from "../sprites/pixel";

// 11/19 시즌 가구상 시안: 겨울·크리스마스 4주 묶음 (첫눈 오는 거실 · 크리스마스 이브 · 연말 파티 · 새해 아침).
// 아직 카탈로그·상점에 붙이지 않았어요. 붙일 때는 바닷가 세트처럼 art.ts의 DRAW·SPIN_ART·UP에 펼쳐 넣으면 돼요.
//  - 그림 크기 = (칸 w×16) × (칸 h×16 + 솟는 높이 SEASON_UP). 아래 h×16이 차지 칸이에요 (furnitureGrid와 같은 규칙).
//  - 바닥에 까는 물건(knit_rug)은 위에서 내려다본 그림이라 솟는 높이 0, 테도 두르지 않아요 (러그와 같이).
//  - 빛나는 물건은 처음부터 켜진 그림이고 변형 "off"가 꺼진 모습이에요 (석등·촛대와 같은 규칙).
//  - 한 번 해 보는 동작(E)은 잠깐 바뀌는 변형 이름으로 그려요 (flash: "breath"·"stamp"·"sing"…).
//  - 명암은 바닷가 세트처럼 색 단계(ramp) + 4×4 순서 디더, 빛은 늘 왼쪽 위에서 와요.
// 순수 함수(Grid)라 Phaser 없이 그려 볼 수 있어요.

type Draw = (g: Grid, W: number, H: number, v: string) => void;
type SpinArt = { side: Draw; back: Draw };

/** 시즌 가구 테 (기존 가구 OUT보다 살짝 따뜻한 갈색, 같은 진하기) */
export const SEASON_EDGE = 0x2a1c16;
export const SEASON_EDGE_A = 170;
/** 테를 두르지 않는 바닥 물건 */
export const SEASON_NO_EDGE: ReadonlySet<string> = new Set(["knit_rug"]);

const rp = (...a: string[]): readonly Color[] => a.map((h) => parseInt(h.slice(1), 16));
/** 색 단계 (밝음 → 어두움) */
const IRON = rp("#80828e", "#62646f", "#4a4c57", "#373943", "#26272f");
const FIRE = rp("#fff7cc", "#ffd870", "#ffa646", "#f06c2e", "#c44620");
const KNIT = rp("#fbf6ea", "#f1e6d0", "#e4d4b6", "#cfbc98");
const KRED = rp("#ee8c80", "#d6625c", "#b6474a", "#8e3438");
const WOOD = rp("#deb07e", "#c69264", "#a8764c", "#865a3a", "#643f28");
const BIRCH = rp("#f6f1e6", "#e2dacb", "#c6bca8");
const GRAIN = rp("#f4dca8", "#deb680", "#b88a5c", "#8a6440");
const WICKER = rp("#e6be80", "#cc9c5e", "#aa7c46", "#885c34");
const PINE = rp("#94c88a", "#66a46c", "#488658", "#346c48", "#244e38");
const GOLD = rp("#fff4bc", "#f6d676", "#deae48", "#b6862e");
const STONE = rp("#d8d6ce", "#bebcb4", "#a4a29a", "#8a8880", "#6c6a64");
const SNOW = rp("#ffffff", "#eef4fa", "#d8e4f0", "#bccadc");
const RED = rp("#f28a7a", "#de5648", "#ba3c38", "#8e2c2e");
const GREEN = rp("#8cc89c", "#5ca272", "#408258", "#2c6244");
const BLUE = rp("#a2c8ee", "#709ed6", "#5078b4", "#3a5a90");
const PAPER = rp("#ffffff", "#f6f4ec", "#e8e4d6", "#d2ccba");
/** 초록 서류철 (결재 서류 트리의 잎) */
const FOLDER = rp("#a6d8a4", "#7cbc80", "#5a9c66", "#427c50");
const CLOTH = rp("#fffdf6", "#f6efe0", "#e8dcc6", "#d4c4a8");
const PINK = rp("#ffdce4", "#f8b0c4", "#e888a2", "#c86482");
const MINT = rp("#dcf8ec", "#aee8d0", "#7ecfb2", "#58ae94");
const SILVER = rp("#ffffff", "#dde3eb", "#b6bec9", "#8c96a5", "#666e7d");
const VELVET = rp("#e88cb4", "#c85a90", "#a23e74", "#7c2c58", "#581e40");
const LACQ = rp("#c86444", "#a44a30", "#823626", "#5e261c");
const HANJI = rp("#fcf5e4", "#f3e8cc", "#e5d6b2", "#cfbd94");
const JADE = rp("#a4ceba", "#7cb29c", "#5a947e", "#407662");
const CHERRY = rp("#f4cad6", "#e89ab2", "#c86a8a");
const INK = 0x221c1a;

const B4M = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 단계 고르기 (v 0 밝음 ~ 1 어두움, 단계 사이는 4×4 순서 디더) */
function pick(ramp: readonly Color[], v: number, x: number, y: number): Color {
  const n = ramp.length - 1;
  const f = Math.max(0, Math.min(n, v * n));
  const i = Math.floor(f);
  return ramp[Math.min(n, i + (f - i > B4M[((y & 3) << 2) | (x & 3)] ? 1 : 0))];
}
/** 사각형을 위 → 아래로 v0 → v1 */
function shade(g: Grid, x: number, y: number, w: number, h: number, ramp: readonly Color[], v0: number, v1: number): void {
  for (let j = 0; j < h; j++) {
    const v = h <= 1 ? v0 : v0 + ((v1 - v0) * j) / (h - 1);
    for (let i = 0; i < w; i++) g.set(x + i, y + j, pick(ramp, v, x + i, y + j));
  }
}
/** 사각형을 왼쪽 → 오른쪽으로 v0 → v1 (기둥·연통) */
function shadeX(g: Grid, x: number, y: number, w: number, h: number, ramp: readonly Color[], v0: number, v1: number): void {
  for (let i = 0; i < w; i++) {
    const v = w <= 1 ? v0 : v0 + ((v1 - v0) * i) / (w - 1);
    for (let j = 0; j < h; j++) g.set(x + i, y + j, pick(ramp, v, x + i, y + j));
  }
}
/** 타원을 왼쪽 위 빛으로 칠한다 */
function orb(g: Grid, cx: number, cy: number, rx: number, ry: number, ramp: readonly Color[], base = 0.35, span = 0.55): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / Math.max(0.5, rx);
      const dy = (y + 0.5 - cy) / Math.max(0.5, ry);
      if (dx * dx + dy * dy > 1) continue;
      g.set(x, y, pick(ramp, base + span * ((dx + dy) / 2.6 + 0.2), x, y));
    }
}
/** 동그란 장식 (2×2 방울: 밝은 점 하나) */
function bauble(g: Grid, x: number, y: number, ramp: readonly Color[]): void {
  g.set(x, y, lighten(ramp[0], 0.4));
  g.set(x + 1, y, ramp[1]);
  g.set(x, y + 1, ramp[2]);
  g.set(x + 1, y + 1, ramp[3]);
}
/** 글자 지도 찍기 (점 = 빈칸) */
function stamp(g: Grid, x: number, y: number, rows: readonly string[], pal: Record<string, Color>): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = pal[row[i]];
      if (c !== undefined) g.set(x + i, y + j, c);
    }
  });
}
const has = (v: string, part: string) => v.split("-").includes(part);
const hash = (x: number, y: number, s: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ── 솟는 높이 (px) ──
export const SEASON_UP: Record<string, number> = {
  // 1주 첫눈 오는 거실
  winter_stove: 20,
  knit_rug: 0,
  frost_window: 14,
  log_basket: 6,
  cocoa_table: 6,
  scarf_grave: 8,
  // 2주 크리스마스 이브
  xmas_tree: 24,
  paper_tree: 24,
  stocking_fireplace: 20,
  gift_pile: 6,
  nutcracker: 18,
  wreath_stand: 12,
  // 3주 연말 파티
  cake_table: 12,
  balloon_bunch: 24,
  disco_ball: 24,
  party_sofa: 8,
  champagne_tower: 12,
  karaoke: 14,
  // 4주 새해 아침
  folding_screen: 16,
  tteokguk_table: 4,
  lucky_pouch: 12,
  shield_kite: 16,
  cheongsa_lantern: 18,
  resolution_scroll: 20,
};

// ═══════════════ 1주 「첫눈 오는 거실」 ═══════════════

/** 난로 유리창 속 불 (x0..x1, y0..y1). lit=false면 잉걸불 두어 점 */
function fireWindow(g: Grid, x0: number, y0: number, x1: number, y1: number, lit: boolean): void {
  const cx = (x0 + x1 + 1) / 2;
  const hw = (x1 - x0 + 1) / 2;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!lit) {
        g.set(x, y, y === y1 ? 0x3a2620 : 0x221816);
        continue;
      }
      const t = (y1 - y) / Math.max(1, y1 - y0); // 0 아래 ~ 1 위
      const dx = Math.abs(x + 0.5 - cx) / hw;
      const heat = 1.05 - t * 0.95 - dx * 0.55 + (hash(x, y, 7) - 0.5) * 0.18;
      const c = heat > 0.78 ? FIRE[0] : heat > 0.58 ? FIRE[1] : heat > 0.38 ? FIRE[2] : heat > 0.18 ? FIRE[3] : 0x5a2418;
      g.set(x, y, c);
    }
  // 장작 (아래 한 줄)
  for (let x = x0; x <= x1; x++) g.set(x, y1, lit ? (x % 3 ? 0x6a3a22 : 0xff8a3a) : x % 3 ? 0x3a2620 : 0x9a3a22);
}

/** 빨간 머그 + 생크림 (x = 몸 왼쪽, 손잡이는 handleRight면 오른쪽) */
function redMug(g: Grid, x: number, y: number, handleRight: boolean): void {
  shadeX(g, x, y, 4, 5, RED, 0.1, 0.8);
  g.hline(x, x + 3, y + 4, RED[3]);
  orb(g, x + 2, y - 0.5, 2.3, 1.5, SNOW, 0.0, 0.4);
  g.set(x + 2, y - 2, 0xffffff);
  g.set(x + 3, y - 1, 0x9a5a34); // 계피 가루
  const hx = handleRight ? x + 4 : x - 1;
  g.set(hx, y + 1, RED[2]);
  g.set(hx, y + 2, RED[2]);
  g.set(hx, y + 3, RED[3]);
}
/** 크림색 머그 (초록 줄) + 코코아 + 마시멜로 */
function creamMug(g: Grid, x: number, y: number, handleLeft: boolean): void {
  shadeX(g, x, y, 4, 4, CLOTH, 0.05, 0.7);
  g.hline(x, x + 3, y + 2, GREEN[2]);
  g.hline(x, x + 3, y + 3, CLOTH[3]);
  g.hline(x, x + 3, y - 1, 0x6a3a22);
  g.set(x + 1, y - 1, 0xffffff);
  g.set(x + 3, y - 1, PINK[1]);
  const hx = handleLeft ? x - 1 : x + 4;
  g.set(hx, y, CLOTH[2]);
  g.set(hx, y + 1, CLOTH[3]);
}

/** 1주 짜임 무늬 (눈꽃 7×7) */
const FLAKE7 = ["...#...", ".#.#.#.", "..###..", "#######", "..###..", ".#.#.#.", "...#..."];
/** 종이 눈꽃 5×5 */
const FLAKE5 = ["..#..", "#.#.#", ".###.", "#.#.#", "..#.."];

// ═══════════════ 2주 「크리스마스 이브」 ═══════════════

/** 호두까기 인형 (16×34) — 손으로 찍은 지도 */
const NUTCRACKER = [
  "........P.......",
  ".......PPp......",
  "........p.......",
  ".....KKKKKK.....",
  ".....kKKKKK.....",
  ".....kKKKKK.....",
  ".....kKKKKK.....",
  ".....GGGGGG.....",
  ".....KKYYKK.....",
  "....GGGGGGGG....",
  ".....HSSSSH.....",
  ".....HESSEH.....",
  ".....HcnncH.....",
  ".....WWWWWW.....",
  ".....WMttMW.....",
  "......WWWW......",
  "....RRRRRRRR....",
  "...GRRRYYRRRG...",
  "...RRRRLLRRRR...",
  "...rRRRYYRRRr...",
  "...rRRRLLRRRr...",
  "...rRRRYYRRRr...",
  "...SLLLLLLLLS...",
  "....RRRGGRRR....",
  "....rRRRRRRr....",
  ".....BG..BG.....",
  ".....BG..BG.....",
  ".....Bb..Bb.....",
  ".....Bb..Bb.....",
  ".....Bb..Bb.....",
  "....OOo..OOo....",
  "....OOO..OOO....",
  "..VVVVVVVVVVVV..",
  "...vvvvvvvvvv...",
];
const NUT_PAL: Record<string, Color> = {
  P: 0xe85a50,
  p: 0xb63a36,
  K: 0x2a2a3a,
  k: 0x4c4c66,
  G: 0xf0c860,
  Y: 0xffe28c,
  H: 0xf2ece0,
  S: 0xf6d2b0,
  c: 0xf0a8a0,
  n: 0xe0a080,
  E: 0x2a1e1e,
  W: 0xfaf6ee,
  M: 0x5a2a2a,
  t: 0xffffff,
  R: 0xd84a44,
  r: 0xa83434,
  L: 0xf4f0e6,
  B: 0x40609e,
  b: 0x2e4478,
  O: 0x1e1e26,
  o: 0x50505e,
  V: 0x4e8e5e,
  v: 0x346c46,
};

// ═══════════════ 4주 「새해 아침」 ═══════════════

/** 족자 글씨 「칼퇴」 (7칸 폭, 붓글씨) */
const GLYPH_KAL = ["###..#.", "..#..#.", "###..##", "..#..#.", "..#..#.", ".......", "######.", ".....#.", "######.", "#......", "######."];
const GLYPH_TOE = ["#####.#", "#.....#", "#####.#", "#.....#", "#####.#", "..#...#", "#####.#", "......#"];
/** 「100」 점수 숫자 3×5 */
const DIGIT: Record<string, string[]> = {
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "0": ["###", "#.#", "#.#", "#.#", "###"],
};

// ── 그림 ──
export const SEASON_DRAW: Record<string, Draw> = {
  // ─────────── 1주 첫눈 오는 거실 ───────────
  /** 무쇠 난로: 연통 + 둥근 어깨 몸통 + 불 보이는 유리문 + 빨간 법랑 주전자 */
  winter_stove: (g, _W, H, v) => {
    const lit = !has(v, "off");
    // 연통 (천장으로)
    shadeX(g, 9, 0, 3, 17, IRON, 0.05, 0.9);
    for (const y of [4, 10]) g.hline(9, 11, y, IRON[4]);
    g.hline(8, 12, 0, IRON[2]);
    // 윗판
    shade(g, 1, 16, 14, 2, IRON, 0.0, 0.35);
    g.hline(2, 13, 16, lighten(IRON[0], 0.2));
    // 몸통
    for (let y = 18; y <= 30; y++)
      for (let x = 2; x <= 13; x++) g.set(x, y, pick(IRON, 0.25 + ((x - 2) / 11) * 0.55 + ((y - 18) / 12) * 0.15, x, y));
    g.vline(2, 18, 30, IRON[1]);
    // 문틀 + 유리
    g.rect(4, 20, 8, 8, IRON[4]);
    g.hline(4, 11, 20, IRON[3]);
    fireWindow(g, 5, 21, 10, 26, lit);
    if (lit) g.set(5, 21, 0xfff2d0); // 유리 반짝
    g.rect(12, 23, 1, 2, GOLD[1]); // 손잡이
    // 재 서랍
    g.hline(4, 11, 29, IRON[4]);
    g.set(8, 29, GOLD[2]);
    // 휜 다리
    for (const x of [3, 11]) {
      g.rect(x, 31, 2, 3, IRON[3]);
      g.set(x, 31, IRON[2]);
    }
    g.set(2, 34, IRON[3]);
    g.set(13, 34, IRON[3]);
    g.hline(2, 4, 35, IRON[4]);
    g.hline(11, 13, 35, IRON[4]);
    // 빨간 법랑 주전자 (윗판 위)
    orb(g, 4.5, 13.5, 3, 2.6, RED, 0.2, 0.6);
    g.hline(3, 6, 15, RED[3]);
    g.hline(3, 5, 11, RED[2]);
    g.set(4, 10, IRON[1]); // 뚜껑 꼭지
    for (const [x, y] of [[2, 11], [2, 10], [3, 9], [4, 9], [5, 9], [6, 10], [6, 11]] as const) g.set(x, y, IRON[1]); // 손잡이
    g.set(8, 12, RED[2]); // 주둥이
    g.set(8, 11, RED[1]);
    g.set(3, 13, 0xffffff);
  },

  /** 니트 러그: 크림 겉뜨기 결 + 빨간 줄 + 가운데 눈꽃 띠 + 양끝 술 (위에서 본 그림) */
  knit_rug: (g, W, H) => {
    const x0 = 2;
    const x1 = W - 3;
    const y0 = 1;
    const y1 = H - 2;
    const band0 = Math.floor(H / 2) - 5;
    const band1 = band0 + 9;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        // 겉뜨기 V 결: 두 칸씩 짝지어 위아래로 엇갈린다
        const up = (x & 1) === 0 ? (y & 1) === 0 : (y & 1) === 1;
        const red = (y >= 4 && y <= 5) || (y >= y1 - 4 && y <= y1 - 3) || (y >= band0 && y <= band1);
        const ramp = red ? KRED : KNIT;
        let val = up ? 0.12 : 0.42;
        // 꽈배기 줄 (크림 부분 6칸마다)
        if (!red && (x - x0) % 6 === 2 && ((y >> 1) & 1) === 0) val += 0.35;
        if (x === x0 || x === x1 || y === y0 || y === y1) val = 0.85;
        g.set(x, y, pick(ramp, val, x, y));
      }
    // 눈꽃 띠 (빨강 바탕에 크림 눈꽃) + 사이 점
    const n = Math.floor((x1 - x0 - 1) / 9);
    const start = x0 + Math.floor((x1 - x0 + 1 - n * 9 + 2) / 2);
    for (let i = 0; i < n; i++) {
      stamp(g, start + i * 9, band0 + 1, FLAKE7, { "#": KNIT[1] });
      g.set(start + i * 9 + 8, band0 + 4, KNIT[2]);
    }
    // 띠 위아래 점줄
    for (let x = x0 + 2; x < x1; x += 3) {
      g.set(x, band0 - 2, KRED[1]);
      g.set(x, band1 + 2, KRED[1]);
    }
    // 양끝 술
    for (let y = y0 + 2; y < y1 - 1; y += 2) {
      g.set(0, y, KNIT[2]);
      g.set(1, y, KNIT[1]);
      g.set(W - 2, y, KNIT[1]);
      g.set(W - 1, y, KNIT[2]);
    }
  },

  /** 눈꽃 창가: 흰 창틀 + 눈 내리는 바깥 + 서리 + 종이 눈꽃, 창턱에 쌓인 눈, 아래 라디에이터 */
  frost_window: (g, W, H, v) => {
    // 뒤(back): 칠하지 않은 나무 창틀, 종이 눈꽃은 뒷면이라 흐릿하고 리본·양말은 앞쪽이라 안 보인다
    const back = has(v, "back");
    const frame = back ? WOOD : CLOTH;
    // 창틀
    shade(g, 1, 0, W - 2, 21, frame, 0.1, 0.5);
    if (!back) g.hline(1, W - 2, 0, 0xffffff);
    // 유리 4칸
    const panes = [
      [3, 2, 14, 9],
      [17, 2, 28, 9],
      [3, 11, 14, 18],
      [17, 11, 28, 18],
    ] as const;
    for (const [px0, py0, px1, py1] of panes)
      for (let y = py0; y <= py1; y++)
        for (let x = px0; x <= px1; x++) {
          // 하늘 (위 진함 → 아래 옅음)
          const t = (y - 2) / 16;
          let c = mix(0x8cb4da, 0xcfe2f2, t);
          // 먼 전나무 숲 + 눈 덮인 땅 (아래 칸)
          const ridge = 14 + Math.round(Math.abs(((x * 3) % 7) - 3) * 0.7);
          if (y >= ridge && y <= 16) c = mix(0x5e8496, 0x7a9cae, (x % 5) / 5);
          if (y >= 17) c = 0xf4f8fc;
          // 서리 (칸 귀퉁이에서 번진다)
          const cd = Math.min(Math.hypot(x - px0, y - py0), Math.hypot(px1 - x, py1 - y), Math.hypot(x - px0, py1 - y), Math.hypot(px1 - x, y - py0));
          const fr = 1 - cd / 3.2;
          if (fr > B4M[((y & 3) << 2) | (x & 3)]) c = mix(c, 0xffffff, 0.6);
          g.set(x, y, c);
        }
    // 내리는 눈
    for (const [x, y] of [[6, 4], [11, 7], [20, 3], [25, 6], [8, 13], [13, 11], [21, 14], [26, 12], [23, 9 - 7]] as const) g.set(x, y, 0xffffff);
    // 종이 눈꽃
    const flake = back ? 0xdde6ee : 0xffffff;
    stamp(g, 5, 4, FLAKE5, { "#": flake });
    stamp(g, 21, 12, FLAKE5, { "#": flake });
    g.set(24, 5, 0xffffff);
    g.set(23, 4, 0xffffff);
    g.set(25, 4, 0xffffff);
    g.set(24, 3, 0xffffff);
    g.set(24, 4, 0xdfeaf6);
    // 창살
    g.rect(15, 2, 2, 17, frame[2]);
    g.vline(15, 2, 18, frame[1]);
    g.hline(3, 28, 10, frame[2]);
    // 입김 하트 (잠깐)
    if (has(v, "breath")) {
      for (let y = 12; y <= 18; y++) for (let x = 4; x <= 13; x++) if (Math.hypot((x - 8.5) / 5, (y - 15) / 3.6) < 1) g.set(x, y, mix((g.get(x, y) >>> 8) & 0xffffff, 0xffffff, 0.6));
      stamp(g, 6, 13, [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."], { "#": 0xb8cde0 });
    }
    // 위 가운데 리본 + 솔가지
    if (!back) {
      for (const [x, y] of [[13, 1], [14, 0], [17, 0], [18, 1]] as const) g.set(x, y, PINE[2]);
      stamp(g, 14, 0, ["#..#", ".##.", "#..#"], { "#": RED[1] });
      g.set(15, 1, RED[2]);
      g.set(16, 1, RED[2]);
    }
    // 창턱 + 쌓인 눈
    shade(g, 0, 19, W, 3, WOOD, 0.1, 0.6);
    for (let x = 1; x < W - 1; x++) {
      const bump = (x % 7 === 2 || x % 7 === 3 || x % 11 === 6) ? 1 : 0;
      g.set(x, 19, SNOW[x % 3 === 0 ? 1 : 0]);
      if (bump) g.set(x, 18, SNOW[0]);
    }
    // 라디에이터
    for (let x = 3; x <= W - 4; x++) {
      const fin = (x - 3) % 3 !== 2;
      for (let y = 23; y <= H - 2; y++) g.set(x, y, fin ? pick(SILVER, 0.15 + (y - 23) / (H - 25) * 0.55, x, y) : SILVER[4]);
    }
    g.hline(3, W - 4, 22, SILVER[2]);
    g.hline(3, W - 4, H - 2, SILVER[4]);
    g.set(4, H - 1, SILVER[4]);
    g.set(W - 5, H - 1, SILVER[4]);
    // 라디에이터에 걸어 말리는 빨간 양말 (뒤에서는 위 끝만 살짝)
    if (!back) {
      stamp(g, 20, 23, ["SSS", "rrr", "rrr", "rrr", "rrrr", ".rrr"], { S: 0xf6f0e4, r: KRED[1] });
      g.set(23, 27, KRED[2]);
    } else g.hline(9, 11, 22, 0xf6f0e4);
    // 뒤: 라디에이터 밸브·관
    if (back) {
      g.rect(1, 25, 2, 2, GOLD[2]);
      g.hline(0, 2, 28, SILVER[3]);
    }
  },

  /** 장작 바구니: 엮은 바구니에 통나무 단면 넷 + 뒤에 세운 자작나무 */
  log_basket: (g, W, H) => {
    // 자작나무 (뒤)
    for (let y = 1; y <= 11; y++) {
      const x = 11 + (y < 6 ? 1 : 0);
      g.set(x, y, BIRCH[0]);
      g.set(x + 1, y, BIRCH[1]);
      g.set(x + 2, y, BIRCH[2]);
      if (y % 3 === 1) g.set(x + 1, y, 0x3a3430);
    }
    g.set(12, 0, GRAIN[1]);
    g.set(13, 0, GRAIN[2]);
    // 통나무 단면 (진한 껍질 테 → 밝은 결 → 나이테 고리 → 가운데 심)
    const end = (cx: number, cy: number, r: number) => {
      g.ellipse(cx, cy, r + 0.9, r + 0.8, WOOD[4]);
      g.ellipse(cx - 0.3, cy - 0.3, r + 0.5, r + 0.4, WOOD[3]);
      orb(g, cx, cy, r - 0.2, r - 0.3, GRAIN, 0.0, 0.3);
      for (let a = 0; a < 6.28; a += 0.9) g.set(Math.floor(cx + Math.cos(a) * r * 0.55), Math.floor(cy + Math.sin(a) * r * 0.55), GRAIN[2]);
      g.set(Math.floor(cx), Math.floor(cy), GRAIN[3]);
    };
    end(5.5, 7, 2.1);
    end(10, 6.8, 2.1);
    end(3.5, 10.4, 2.2);
    end(8, 10.6, 2.3);
    end(12.6, 10.4, 2);
    // 바구니
    for (let y = 12; y <= H - 2; y++) {
      const inset = y >= H - 3 ? 1 : 0;
      for (let x = 1 + inset; x <= W - 2 - inset; x++) {
        const v = 0.15 + ((y - 12) / (H - 14)) * 0.5 + (((x + (y >> 1)) >> 1) % 2 ? 0.14 : 0) + (x > W - 5 ? 0.12 : 0);
        g.set(x, y, pick(WICKER, v, x, y));
      }
    }
    g.hline(1, W - 2, 12, lighten(WICKER[0], 0.15));
    g.hline(1, W - 2, 13, WICKER[2]);
    // 손잡이 고리
    for (const x of [0, W - 1]) {
      g.set(x, 13, WICKER[2]);
      g.set(x, 14, WICKER[3]);
    }
    // 바구니에 꽂은 솔방울
    orb(g, 3.5, 13.5, 1.6, 1.4, WOOD, 0.4, 0.5);
    g.set(3, 13, WOOD[1]);
  },

  /** 코코아 탁자: 둥근 사이드 테이블 + 레이스 받침 + 머그 둘 (생크림·마시멜로) + 쿠키 */
  cocoa_table: (g, _W, H, v) => {
    const sip = has(v, "sip");
    // 받침·기둥
    orb(g, 8, H - 1.5, 4.5, 1.4, WOOD, 0.5, 0.4);
    shadeX(g, 7, 14, 2, H - 16, WOOD, 0.4, 0.8);
    // 상판 (윗면 + 앞 두께)
    orb(g, 8, 12.5, 7.5, 2.6, WOOD, 0.6, 0.3);
    orb(g, 8, 11.5, 7.5, 2.8, WOOD, 0.05, 0.35);
    // 레이스 받침
    orb(g, 8, 11.3, 5, 1.8, CLOTH, 0.05, 0.3);
    for (const x of [3, 5, 11, 13]) g.set(x, 12, CLOTH[0]);
    // 쿠키
    g.set(7, 11, GOLD[2]);
    g.set(8, 11, GOLD[1]);
    g.set(8, 12, GOLD[3]);
    g.set(7, 12, GOLD[2]);
    g.set(8, 11, 0x6a3a22);
    // 머그 둘: 앞은 빨간 머그가 왼쪽 뒤, 옆(alt)은 크림색 머그가 왼쪽에 온다
    const alt = has(v, "alt");
    redMug(g, alt ? 9 : 3, alt ? 6 : 6, alt);
    if (!sip) creamMug(g, alt ? 3 : 9, 7, alt);
  },

  /** 털모자 쓴 비석: 둥근 비석에 방울 털모자 + 줄무늬 목도리, 받침에 눈 */
  scarf_grave: (g, W, H) => {
    // 받침
    shade(g, 1, H - 4, W - 2, 3, STONE, 0.4, 0.9);
    g.hline(1, W - 2, H - 1, STONE[4]);
    for (let x = 1; x < W - 1; x++) g.set(x, H - 4, x % 4 === 1 ? SNOW[1] : SNOW[0]);
    g.set(3, H - 5, SNOW[0]);
    g.set(11, H - 5, SNOW[0]);
    g.set(12, H - 5, SNOW[1]);
    // 비석 (둥근 머리, 넓적하게)
    for (let y = 5; y <= H - 5; y++)
      for (let x = 2; x <= 13; x++) {
        if (y < 9 && Math.hypot((x + 0.5 - 8) / 6, (y + 0.5 - 9.5) / 4.5) > 1) continue;
        g.set(x, y, pick(STONE, 0.12 + ((x - 2) / 11) * 0.55 + (y > H - 8 ? 0.1 : 0), x, y));
      }
    g.vline(2, 9, H - 5, STONE[1]);
    // 새긴 글 (이름 두 줄) + 작은 꽃
    g.hline(5, 8, 15, STONE[4]);
    g.hline(5, 9, 17, STONE[4]);
    g.hline(5, 7, 19, STONE[3]);
    g.set(3, H - 5, 0xf0a0c0);
    g.set(4, H - 5, PINE[2]);
    // 털모자 (빨강 겉뜨기 + 흰 단 + 방울) — 비석 머리에 살짝 비스듬히
    for (let y = 1; y <= 6; y++)
      for (let x = 3; x <= 12; x++) {
        if (Math.hypot((x + 0.5 - 8) / 4.6, (y + 0.5 - 7) / 5.4) > 1) continue;
        const knit = ((x + (y >> 1)) & 1) === 0 ? 0.08 : 0.32;
        g.set(x, y, pick(KRED, knit + (x - 3) / 16, x, y));
      }
    for (let x = 3; x <= 12; x++) g.set(x, 6, pick(KNIT, 0.1 + (x & 1) * 0.25, x, 6));
    for (let x = 3; x <= 12; x++) g.set(x, 7, pick(KNIT, 0.35 + (x & 1) * 0.25, x, 7));
    orb(g, 8.5, 1, 1.9, 1.5, KNIT, 0.0, 0.5);
    // 목도리 (목에 두르고 오른쪽 앞으로 늘어진 꼬리, 끝에 술)
    for (let y = 10; y <= 11; y++)
      for (let x = 1; x <= 14; x++) g.set(x, y, Math.floor((x - 1) / 2) % 2 ? pick(KNIT, 0.12 + (y - 10) * 0.3, x, y) : pick(KRED, 0.12 + (y - 10) * 0.35, x, y));
    for (let y = 12; y <= 17; y++)
      for (let x = 10; x <= 11; x++) g.set(x + (y > 15 ? 1 : 0), y, Math.floor((y - 12) / 2) % 2 ? pick(KNIT, 0.3, x, y) : pick(KRED, 0.25 + (x - 10) * 0.3, x, y));
    for (const x of [11, 13]) g.set(x, 18, KNIT[1]);
    g.set(12, 18, KNIT[2]);
  },

  // ─────────── 2주 크리스마스 이브 ───────────
  /** 작은 전나무 트리: 세 단 잎 + 금빛 반짝이 줄 + 방울 + 꼬마전구 + 별, 빨간 화분 */
  xmas_tree: (g, _W, H, v) => {
    const lit = !has(v, "off");
    // 화분
    for (let y = H - 7; y <= H - 1; y++) {
      const ins = y === H - 7 ? 0 : y >= H - 2 ? 2 : 1;
      for (let x = 3 + ins; x <= 12 - ins; x++) g.set(x, y, pick(RED, 0.15 + ((x - 3) / 9) * 0.6, x, y));
    }
    g.hline(3, 12, H - 7, RED[0]);
    g.hline(4, 11, H - 5, GOLD[1]);
    g.set(5, H - 5, GOLD[0]);
    // 줄기
    g.rect(7, H - 9, 2, 2, WOOD[3]);
    // 잎 세 단 (아래 단부터)
    // 단마다 위는 좁고 아래로 활짝 퍼진다 (아래 단부터 그려 위 단이 덮게)
    const tiers = [
      [15, 31, 2.5, 8],
      [9, 21, 1.5, 6.5],
      [3, 12, 0.6, 4.6],
    ] as const;
    const cx = 8;
    for (const [top, bot, w0, w1] of tiers)
      for (let y: number = top; y <= bot; y++) {
        const t = (y - top) / (bot - top);
        const hw = w0 + (w1 - w0) * Math.sqrt(t);
        for (let x = Math.ceil(cx - hw); x < Math.floor(cx + hw); x++) {
          if (y === bot && (x & 1)) continue; // 아래 끝 톱니
          const u = (x + 0.5 - (cx - hw)) / (2 * hw);
          let val = 0.08 + u * 0.62 + t * 0.15;
          if (y >= bot - 1) val = Math.min(1, val + 0.2); // 단 아래 그늘
          if (hash(x, y, 3) > 0.88) val -= 0.25; // 솔잎 반짝
          g.set(x, y, pick(PINE, val, x, y));
        }
      }
    // 금빛 반짝이 줄 (단마다 늘어진 곡선 하나)
    for (const [y0, xa, xb] of [[8, 5, 10], [15, 3, 13], [24, 1, 14]] as const)
      for (let x = xa; x <= xb; x++) {
        const y = y0 + Math.round(1.8 * Math.sin(((x - xa) / (xb - xa)) * Math.PI));
        if (g.filled(x, y)) g.set(x, y, (x & 1) ? GOLD[1] : GOLD[0]);
      }
    // 방울
    // 옆모습(alt)은 방울·전구 자리가 달라 돌려 놓은 티가 난다
    const alt = has(v, "alt");
    const orns = alt
      ? ([[6, 6, BLUE], [10, 10, GOLD], [4, 13, RED], [9, 18, RED], [3, 19, GOLD], [12, 23, RED], [6, 27, BLUE], [10, 28, RED]] as const)
      : ([[8, 5, RED], [4, 11, BLUE], [10, 12, RED], [6, 18, GOLD], [11, 19, BLUE], [3, 27, RED], [8, 28, GOLD], [12, 27, BLUE]] as const);
    for (const [x, y, r] of orns) bauble(g, x, y, r);
    // 꼬마전구
    const bulbs = alt
      ? ([[8, 8], [5, 10], [11, 14], [6, 16], [4, 22], [8, 21], [11, 26], [3, 25], [8, 31], [12, 30], [14, 29]] as const)
      : ([[6, 7], [9, 10], [5, 14], [8, 16], [12, 16], [3, 20], [5, 23], [10, 23], [13, 24], [6, 26], [2, 30], [10, 30], [14, 30]] as const);
    for (const [x, y] of bulbs) g.set(x, y, lit ? ((x + y) % 3 ? 0xfff2a8 : 0xffb8c8) : 0x8a7a4a);
    // 별
    stamp(g, 6, 0, ["..#..", ".###.", "#####", ".#.#."], { "#": lit ? GOLD[1] : GOLD[2] });
    g.set(8, 1, lit ? 0xffffff : GOLD[1]);
  },

  /** 결재 서류 트리: 서류철을 원뿔로 쌓고 집게·포스트잇·결재 도장으로 꾸몄어요. 꼭대기엔 빨간 「승인」 도장 */
  paper_tree: (g, _W, H, v) => {
    const stamped = has(v, "stamp");
    const alt = has(v, "alt");
    // 서류함 (회색 철제 받침). 앞은 이름표, 옆은 손잡이 홈
    shade(g, 2, H - 6, 12, 6, SILVER, 0.35, 0.85);
    g.hline(2, 13, H - 6, SILVER[1]);
    if (!alt && !has(v, "back")) {
      g.rect(6, H - 4, 4, 2, PAPER[1]); // 이름표
      g.hline(7, 8, H - 3, 0x8a8a8a);
    } else g.hline(5, 10, H - 4, SILVER[4]);
    // 서류 층 (아래 → 위): 흰 서류와 누런 서류철이 번갈아 원뿔로. 층마다 종이 귀가 살짝 삐져나온다
    const cx = 8;
    const n = 9;
    for (let k = 0; k < n; k++) {
      const yb = H - 7 - k * 3;
      const hw = 7.2 - k * 0.72;
      const ramp = k % 2 ? FOLDER : PAPER;
      const sk = (k % 4 === 1 ? 1 : k % 4 === 3 ? -1 : 0) * (alt ? -1 : 1); // 살짝 비뚤게 쌓인 층
      for (let y = yb - 2; y <= yb; y++)
        for (let x = Math.ceil(cx - hw) + sk; x < Math.floor(cx + hw) + sk; x++) {
          const right = x >= Math.floor(cx + hw) + sk - 2;
          g.set(x, y, pick(ramp, (y === yb - 2 ? 0 : y === yb ? 0.75 : 0.3) + (right ? 0.15 : 0), x, y));
        }
      // 흰 서류엔 글 줄, 초록 서류철엔 색 인덱스 탭
      if (!(k % 2) && hw > 2.5) for (let x = Math.ceil(cx - hw) + 1 + sk; x < Math.floor(cx + hw) - 1 + sk; x += 2) g.set(x, yb - 1, 0xa8a49a);
      if (k % 2) g.set(Math.ceil(cx - hw) + sk - 1, yb - 2, [0x7ab8e8, 0xf08a9a, 0x8ad0a0, 0xf6d060][(k >> 1) % 4]);
    }
    // 장식: 빨간 결재 도장 방울
    for (const [x, y] of alt ? ([[10, 28], [3, 25], [9, 19], [5, 13]] as const) : ([[4, 28], [11, 25], [6, 19], [9, 13]] as const)) {
      g.set(x, y, RED[1]);
      g.set(x + 1, y, RED[2]);
      g.set(x, y + 1, RED[2]);
      g.set(x + 1, y + 1, RED[3]);
      g.set(x, y, 0xff9a8a);
    }
    // 노란 포스트잇
    for (const [x, y] of alt ? ([[4, 30], [11, 22], [4, 17]] as const) : ([[9, 30], [3, 22], [10, 18]] as const)) {
      g.rect(x, y, 2, 2, 0xf6e070);
      g.set(x + 1, y + 1, 0xd8c050);
    }
    // 검은 집게 (은빛 손잡이)
    for (const [x, y] of alt ? ([[6, 24], [9, 15]] as const) : ([[7, 25], [5, 15]] as const)) {
      g.rect(x, y, 2, 2, 0x22242a);
      g.set(x, y - 1, SILVER[1]);
      g.set(x + 1, y - 1, SILVER[2]);
    }
    // 꼭대기 「승인」 도장 (빨간 동그라미)
    stamp(g, 5, 0, [".###.", "#...#", "#.#.#", "#...#", ".###."], { "#": stamped ? 0xff4a3a : RED[2] });
    g.rect(6, 1, 3, 3, stamped ? 0xffe4dc : PAPER[1]);
    g.set(7, 2, stamped ? 0xff4a3a : RED[2]);
    // 방금 찍은 도장 (앞 서류에 큰 빨간 동그라미)
    if (stamped) stamp(g, 5, 24, [".##.", "#..#", "#..#", ".##."], { "#": 0xe83a30 });
  },

  /** 양말 걸린 벽난로: 흰 선반 + 솔가지 장식(꼬마전구) + 양말 셋 + 붉은 벽돌 + 불, 선반 위 촛불·스노볼 */
  stocking_fireplace: (g, W, H, v) => {
    const lit = !has(v, "off");
    // 선반 위 소품: 촛불 둘 + 스노볼
    for (const x of [3, 27]) {
      g.rect(x, 3, 2, 5, CLOTH[1]);
      g.vline(x + 1, 3, 7, CLOTH[3]);
      g.rect(x - 1, 7, 4, 1, GOLD[2]);
      if (lit) {
        g.set(x, 1, FIRE[1]);
        g.set(x, 2, FIRE[2]);
        g.set(x + 1, 2, FIRE[0]);
      } else g.set(x, 2, 0x3a3028);
    }
    orb(g, 15.5, 4, 3, 3, rp("#e8f4fc", "#cfe4f4", "#b2d2ec"), 0.0, 0.5);
    g.set(15, 3, PINE[2]);
    g.set(15, 4, PINE[2]);
    g.set(16, 4, PINE[3]);
    g.set(14, 2, 0xffffff);
    g.rect(13, 7, 6, 1, WOOD[2]);
    // 선반
    shade(g, 0, 8, W, 3, CLOTH, 0.0, 0.45);
    g.hline(1, W - 2, 11, CLOTH[3]);
    // 벽돌 몸통
    for (let y = 12; y <= H - 4; y++)
      for (let x = 2; x <= W - 3; x++) {
        const row = Math.floor((y - 12) / 3);
        const mortar = (y - 12) % 3 === 2 || (x + (row % 2) * 3) % 6 === 0;
        g.set(x, y, mortar ? 0xc8a898 : pick(RED, 0.3 + ((x - 2) / (W - 4)) * 0.35 + hash(Math.floor((x + (row % 2) * 3) / 6), row, 5) * 0.2, x, y));
      }
    // 아궁이 (아치)
    for (let y = 17; y <= H - 5; y++)
      for (let x = 9; x <= W - 10; x++) {
        if (y < 20 && Math.hypot((x + 0.5 - W / 2) / 7, (y + 0.5 - 20.5) / 3.6) > 1) continue;
        g.set(x, y, 0x1a1210);
      }
    // 아치 테 (흰 돌)
    for (let x = 8; x <= W - 9; x++) {
      for (let y = 15; y <= 21; y++) {
        const d = Math.hypot((x + 0.5 - W / 2) / 8, (y + 0.5 - 20.5) / 4.6);
        if (d <= 1 && d > 0.8 && !(g.get(x, y) === 0)) g.set(x, y, CLOTH[2]);
      }
    }
    // 불
    if (lit) {
      for (let y = 21; y <= H - 7; y++)
        for (let x = 11; x <= W - 12; x++) {
          const t = (H - 7 - y) / (H - 28);
          const dx = Math.abs(x + 0.5 - W / 2) / 5;
          const heat = 1.1 - t * 1.0 - dx * 0.7 + (hash(x, y, 11) - 0.5) * 0.25;
          if (heat > 0.12) g.set(x, y, heat > 0.8 ? FIRE[0] : heat > 0.6 ? FIRE[1] : heat > 0.4 ? FIRE[2] : heat > 0.25 ? FIRE[3] : FIRE[4]);
        }
    }
    // 장작
    shade(g, 11, H - 6, W - 22, 2, WOOD, 0.5, 0.9);
    g.set(11, H - 6, GRAIN[1]);
    g.set(W - 12, H - 6, GRAIN[1]);
    if (lit) g.hline(12, W - 13, H - 6, 0xff8a3a);
    // 바닥 돌
    shade(g, 0, H - 3, W, 3, STONE, 0.15, 0.7);
    // 솔가지 장식 (선반 앞으로 늘어진다) + 열매·전구
    for (let x = 0; x < W; x++) {
      const sag = Math.round(1.6 * Math.abs(Math.sin(((x + 2) / 9) * Math.PI)));
      for (let k = 0; k < 2; k++) g.set(x, 10 + sag + k, pick(PINE, 0.2 + k * 0.4 + ((x & 1) ? 0.15 : 0), x, 10 + sag + k));
      if (x % 4 === 1) g.set(x, 10 + sag, lit ? (x % 8 === 1 ? 0xfff0a0 : 0xffb0c0) : 0x8a7a4a);
      if (x % 6 === 3) g.set(x, 11 + sag, RED[1]);
    }
    // 양말 셋 (빨강·초록 줄무늬·빨강흰 줄무늬)
    const sock = (x: number, y: number, body: readonly Color[], stripe: boolean) => {
      stamp(g, x, y, ["CCCCC", "CCCCC", ".bbbb", ".bbbb", ".bbbb", ".bbbb", ".bbbbb", "bbbbbb", "bbbbb."], { C: CLOTH[0], b: body[1] });
      for (let j = 2; j < 9; j++)
        for (let i = 0; i < 6; i++) {
          if (!g.filled(x + i, y + j) || g.get(x + i, y + j) >>> 8 !== body[1]) continue;
          const c = stripe && (j % 2 === 0) ? CLOTH[1] : pick(body, 0.2 + i * 0.12, x + i, y + j);
          g.set(x + i, y + j, c);
        }
      g.hline(x, x + 4, y + 1, CLOTH[2]);
    };
    sock(3, 12, KRED, false);
    sock(13, 13, GREEN, true);
    sock(24, 12, KRED, true);
  },

  /** 선물 더미: 빨강·초록·줄무늬·분홍 상자에 금빛·빨강 리본 */
  gift_pile: (g, _W, H, v) => {
    const sh = has(v, "shake") ? 1 : 0;
    const box = (x: number, y: number, w: number, h: number, body: readonly Color[], ribbon: Color, striped = false) => {
      // 윗면 2줄 밝게, 앞면 위→아래 어둡게
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const top = j < 2;
          let c = pick(body, top ? 0.05 : 0.3 + (j / h) * 0.45 + (i >= w - 2 ? 0.12 : 0), x + i, y + j);
          if (striped && !top && ((i + j) % 4 < 2)) c = pick(BLUE, 0.3 + (j / h) * 0.3, x + i, y + j);
          g.set(x + i, y + j, c);
        }
      const rx = x + Math.floor(w / 2) - 1;
      for (let j = 0; j < h; j++) {
        g.set(rx, y + j, ribbon);
        g.set(rx + 1, y + j, mix(ribbon, 0x000000, 0.2));
      }
      if (h > 6) g.hline(x, x + w - 1, y + Math.floor(h / 2) + 1, mix(ribbon, 0x000000, 0.1));
      // 리본 매듭
      g.set(rx - 1, y - 1, ribbon);
      g.set(rx - 2, y - 2, ribbon);
      g.set(rx + 2, y - 1, ribbon);
      g.set(rx + 3, y - 2, ribbon);
      g.set(rx, y - 1, lighten(ribbon, 0.3));
      g.set(rx + 1, y - 1, ribbon);
    };
    if (has(v, "alt")) {
      // 옆에서 본 더미: 초록 큰 상자가 뒤, 빨간 상자가 앞 왼쪽, 분홍 상자는 초록 위
      box(6, 7, 9, 10, GREEN, CLOTH[0]);
      box(1, 12, 7, 8, RED, GOLD[1]);
      box(8 + sh, 2 - sh, 6, 5, PINK, RED[1]);
      box(9, 16, 6, 5, CLOTH, RED[1], true);
      return;
    }
    box(1, 8, 8, 9, RED, GOLD[1]);
    box(8, 11, 7, 9, GREEN, CLOTH[0]);
    box(2 + sh, 3 - sh, 6, 5, PINK, RED[1]);
    box(2, 16, 6, 5, CLOTH, RED[1], true);
  },

  /** 호두까기 인형: 높은 털모자·흰 수염·빨간 제복·금단추, 초록 받침 */
  nutcracker: (g, _W, _H, v) => {
    stamp(g, 0, 0, NUTCRACKER, NUT_PAL);
    // 「딱!」: 입이 크게 벌어지고 호두 조각이 튄다
    if (has(v, "crack")) {
      g.hline(6, 9, 14, 0x3a1a1a);
      g.hline(6, 9, 15, NUT_PAL.t);
      g.set(13, 13, WOOD[2]);
      g.set(14, 12, WOOD[3]);
      g.set(2, 12, WOOD[2]);
    }
  },

  /** 리스 걸이: 솔잎 고리 + 빨간 열매 + 금방울 + 빨간 리본, 나무 이젤 */
  wreath_stand: (g, W, H, v) => {
    const ring = has(v, "ring") ? 1 : 0;
    // 이젤 (뒤 다리 → 앞 다리)
    for (let y = 10; y <= H - 1; y++) {
      const t = (y - 10) / (H - 11);
      g.set(Math.round(7.5 - t * 4.5), y, WOOD[2]);
      g.set(Math.round(8.5 + t * 4.5), y, WOOD[3]);
    }
    g.vline(8, 12, H - 3, WOOD[4]);
    g.hline(4, 12, H - 7, WOOD[2]);
    // 고리
    const cx = 8;
    const cy = 8.5;
    for (let y = 0; y <= 17; y++)
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.05);
        if (d > 7.2 || d < 3.2) continue;
        const ang = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
        const lit = -Math.cos(ang + Math.PI / 4); // 왼쪽 위가 밝다
        let val = 0.45 - lit * 0.3 + (hash(x, y, 9) - 0.5) * 0.35;
        if (d > 6.5 || d < 3.8) val += 0.15;
        g.set(x, y, pick(PINE, val, x, y));
      }
    // 열매
    for (const [x, y] of [[4, 4], [5, 3], [11, 3], [12, 5], [3, 9], [13, 10], [6, 13], [10, 13]] as const) {
      g.set(x, y, RED[1]);
      g.set(x + 1, y, RED[2]);
    }
    for (const [x, y] of [[4, 4], [11, 3], [3, 9]] as const) g.set(x, y, 0xffc0b0);
    // 금방울 둘
    for (const [x, y] of [[5 - ring, 14], [10 + ring, 14]] as const) {
      g.rect(x, y, 2, 2, GOLD[1]);
      g.set(x, y, GOLD[0]);
      g.set(x + 1, y + 1, GOLD[3]);
    }
    // 리본
    stamp(g, 4, 13, ["RR.....RR", "RRRrRrRRR", ".RR.r.RR.", "....R....", "...R.R...", "..R...R.."], { R: RED[1], r: RED[3] });
    g.set(8, 14, RED[0]);
    if (ring) {
      g.set(2, 13, GOLD[0]);
      g.set(14, 13, GOLD[0]);
    }
  },

  // ─────────── 3주 연말 파티 ───────────
  /** 송년 케이크 테이블: 레이스 식탁보 + 2단 딸기 케이크(촛불) + 샴페인 잔 + 접시 */
  cake_table: (g, W, H, v) => {
    const lit = !has(v, "off");
    // 다리
    for (const x of [3, W - 5]) shadeX(g, x, H - 4, 2, 4, WOOD, 0.5, 0.9);
    // 식탁보 (윗면 + 앞으로 늘어진 천 + 레이스 단)
    shade(g, 0, 14, W, 3, CLOTH, 0.0, 0.2);
    for (let y = 17; y <= H - 5; y++)
      for (let x = 1; x <= W - 2; x++) {
        const fold = Math.abs(((x + 3) % 7) - 3) / 3; // 주름
        g.set(x, y, pick(CLOTH, 0.25 + fold * 0.35 + ((y - 17) / (H - 22)) * 0.2, x, y));
      }
    g.hline(1, W - 2, 17, GOLD[2]);
    for (let x = 1; x <= W - 2; x++) {
      g.set(x, H - 4, x % 2 ? CLOTH[1] : CLOTH[3]);
      if (x % 3 === 1) g.set(x, H - 3, CLOTH[2]);
    }
    // 색종이 점
    for (const [x, y, c] of [[3, 19, PINK[1]], [27, 20, MINT[1]], [6, 22, GOLD[1]], [24, 18, BLUE[1]], [14, 21, PINK[1]], [19, 23, GOLD[1]]] as const) g.set(x, y, c);
    // 케이크 아래 단
    shade(g, 9, 8, 14, 7, CLOTH, 0.05, 0.5);
    g.hline(9, 22, 8, 0xffffff);
    for (let x = 9; x <= 22; x++) {
      g.set(x, 9, PINK[1]);
      if (x % 3 !== 1) g.set(x, 10, PINK[1]); // 흘러내린 분홍 크림
      if (x % 3 === 0) g.set(x, 11, PINK[2]);
    }
    g.hline(9, 22, 14, PINK[2]);
    // 위 단
    shade(g, 12, 4, 8, 4, CLOTH, 0.0, 0.4);
    g.hline(12, 19, 4, 0xffffff);
    for (let x = 12; x <= 19; x++) if (x % 2) g.set(x, 5, PINK[1]);
    // 딸기
    for (const x of [10, 13, 18, 21]) {
      g.set(x, 7, RED[1]);
      g.set(x + 1, 7, RED[2]);
      g.set(x, 6, GREEN[1]);
    }
    for (const x of [14, 17]) g.set(x, 3, RED[1]);
    // 초
    for (const x of [13, 16, 18]) {
      g.vline(x, 1, 3, (x % 2) ? PINK[1] : MINT[1]);
      g.set(x, 2, CLOTH[0]);
      g.set(x, 0, lit ? FIRE[1] : 0x3a3028);
    }
    // 샴페인 잔 (왼쪽)
    for (const x of [3, 6]) {
      g.rect(x, 7, 2, 4, GOLD[1]);
      g.set(x, 7, GOLD[0]);
      g.set(x + 1, 10, GOLD[2]);
      g.vline(x, 11, 13, SILVER[2]);
      g.hline(x - 1, x + 1, 13, SILVER[1]);
    }
    g.set(4, 8, 0xffffff);
    // 접시 + 포크 (오른쪽)
    orb(g, 27, 13, 3.4, 1.1, SILVER, 0.0, 0.4);
    orb(g, 27, 12.4, 3, 0.9, SILVER, 0.0, 0.3);
    g.rect(26, 11, 2, 2, PINK[1]);
    g.set(26, 11, CLOTH[0]);
    g.vline(30, 10, 13, SILVER[3]);
  },

  /** 풍선 다발: 금·분홍·민트·하늘·산호 풍선 다섯, 반짝 하이라이트, 금빛 선물 추 */
  balloon_bunch: (g, _W, H, v) => {
    const b = has(v, "bop") ? 1 : 0;
    const CORAL = rp("#ffd0c0", "#f8a48e", "#e67c66", "#c45a48");
    const balloons: [number, number, number, readonly Color[]][] = has(v, "alt")
      ? [
          [10.5, 5.5, 4.2, PINK],
          [4.5, 7, 4, MINT],
          [9, 12.5, 4, GOLD],
          [12.6, 15, 3.4, BLUE],
          [3.8, 14.5, 3.6, CORAL],
        ]
      : [
          [5, 6, 4.2, GOLD],
          [11, 5.5, 4, PINK],
          [8.5, 12.5, 4.2, MINT],
          [3.6, 15, 3.6, BLUE],
          [12.8, 14.5, 3.5, CORAL],
        ];
    const knots: [number, number][] = [];
    for (const [cx0, cy0, r, ramp] of balloons) {
      const cx = cx0 + b;
      const cy = cy0 - b;
      orb(g, cx, cy, r * 0.92, r, ramp, 0.15, 0.7);
      // 하이라이트
      g.set(Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.5), 0xffffff);
      g.set(Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.5) + 1, lighten(ramp[0], 0.5));
      // 매듭
      const ky = Math.floor(cy + r) + 1;
      g.set(Math.floor(cx), ky, ramp[3]);
      knots.push([Math.floor(cx), ky + 1]);
    }
    // 끈: 매듭에서 한 점으로 모였다가 한 줄로 추까지 (살짝 물결)
    const gx = 8;
    const gy = 24;
    for (const [kx, ky] of knots)
      for (let y = ky; y <= gy; y++) {
        const t = (y - ky) / Math.max(1, gy - ky);
        const x = Math.round(kx + (gx - kx) * t);
        if (!g.filled(x, y)) g.set(x, y, 0xf2ece2);
      }
    for (let y = gy; y < H - 6; y++) g.set(gx + ((y >> 2) & 1), y, 0xf2ece2);
    // 금빛 선물 추
    shade(g, 5, H - 6, 6, 5, GOLD, 0.1, 0.8);
    g.vline(7, H - 6, H - 2, RED[1]);
    g.vline(8, H - 6, H - 2, RED[2]);
    g.set(6, H - 7, RED[1]);
    g.set(9, H - 7, RED[1]);
    g.hline(5, 10, H - 1, GOLD[3]);
  },

  /** 디스코볼 조명: 크롬 기둥 위에 거울 조각 공 (켜면 분홍·하늘·노랑 반사) */
  disco_ball: (g, _W, H, v) => {
    const lit = !has(v, "off");
    // 돌린 방향마다 거울 조각 자리가 달라 보이게 (옆 alt · 뒤 alt2)
    const spin = (has(v, "spin") ? 0.21 : 0) + (has(v, "alt") ? 0.12 : 0) + (has(v, "alt2") ? 0.27 : 0);
    // 받침 + 기둥
    orb(g, 8, H - 2, 5.5, 1.6, SILVER, 0.3, 0.5);
    shadeX(g, 7, 15, 2, H - 17, SILVER, 0.1, 0.8);
    g.hline(6, 9, 15, SILVER[2]);
    // 고리
    g.rect(7, 0, 2, 2, SILVER[3]);
    // 공
    const cx = 8;
    const cy = 8.5;
    const r = 7;
    const glint = [0xff9ad0, 0x8ae0ff, 0xfff08a, 0xc8a0ff];
    for (let y = 1; y <= 16; y++)
      for (let x = 0; x < 16; x++) {
        const dx = (x + 0.5 - cx) / r;
        const dy = (y + 0.5 - cy) / r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;
        const lat = Math.asin(Math.max(-1, Math.min(1, dy)));
        const rr = Math.sqrt(Math.max(0.0001, 1 - dy * dy));
        const lon = Math.asin(Math.max(-1, Math.min(1, dx / rr)));
        const fi = Math.floor((lon + spin) / 0.36);
        const fj = Math.floor(lat / 0.36);
        const nz = Math.sqrt(1 - d2);
        const light = -0.55 * dx - 0.6 * dy + 0.55 * nz; // 왼쪽 위 빛
        let val = 0.6 - light * 0.45 + (hash(fi, fj, 13) - 0.5) * 0.55;
        // 조각 사이 줄눈
        const edgeLon = ((lon + spin) / 0.36) % 1;
        const edgeLat = (lat / 0.36) % 1;
        if (Math.abs(edgeLon) < 0.14 || Math.abs(edgeLat) < 0.14) val += 0.25;
        let c = pick(SILVER, val, x, y);
        const hh = hash(fi, fj, 17);
        if (lit && hh > 0.82) c = glint[Math.floor(hh * 100) % 4];
        if (!lit) c = mix(c, 0x3a3e4a, 0.35);
        g.set(x, y, c);
      }
    // 큰 반짝임
    if (lit) {
      g.set(4, 4, 0xffffff);
      g.set(3, 4, 0xffffff);
      g.set(4, 3, 0xffffff);
      g.set(5, 4, 0xffffff);
      g.set(4, 5, 0xffffff);
    }
  },

  /** 파티 소파: 자줏빛 벨벳 + 단추 누빔 + 말린 팔걸이 + 금빛 술 + 금 다리, 고깔모자·반짝이 쿠션 */
  party_sofa: (g, W, H) => {
    // 다리
    for (const x of [3, W - 5]) {
      g.rect(x, H - 4, 2, 3, GOLD[2]);
      g.set(x, H - 4, GOLD[0]);
      g.set(x + 1, H - 1, GOLD[3]);
    }
    // 등받이
    for (let y = 0; y <= 11; y++)
      for (let x = 3; x <= W - 4; x++) {
        if (y < 2 && (x < 5 || x > W - 6)) continue;
        g.set(x, y, pick(VELVET, 0.2 + (y / 11) * 0.35 + (x > W - 8 ? 0.1 : 0), x, y));
      }
    g.hline(5, W - 6, 0, VELVET[0]);
    // 누빔 단추 (마름모 주름)
    for (const [x, y] of [[8, 4], [16, 4], [24, 4], [12, 8], [20, 8]] as const) {
      g.set(x, y, VELVET[4]);
      g.set(x - 1, y - 1, VELVET[1]);
      g.set(x + 1, y + 1, VELVET[3]);
    }
    // 앉는 쿠션 둘
    for (const [x0, x1] of [[5, 15], [16, 26]] as const) {
      shade(g, x0, 11, x1 - x0 + 1, 5, VELVET, 0.0, 0.5);
      g.hline(x0 + 1, x1 - 1, 11, lighten(VELVET[0], 0.2));
    }
    g.vline(15, 11, 15, VELVET[3]);
    // 치마 + 금빛 술
    shade(g, 1, 16, W - 2, 3, VELVET, 0.55, 0.85);
    for (let x = 1; x <= W - 2; x++) g.set(x, 19, x % 2 ? GOLD[1] : GOLD[2]);
    // 팔걸이 (말린 모양)
    for (const x0 of [0, W - 6]) {
      for (let y = 5; y <= 18; y++) for (let x = x0; x < x0 + 6; x++) g.set(x, y, pick(VELVET, 0.25 + ((x - x0) / 5) * 0.4 + (y > 15 ? 0.2 : 0), x, y));
      orb(g, x0 + 3, 6, 3, 2, VELVET, 0.0, 0.5);
      g.set(x0 + 2, 5, lighten(VELVET[0], 0.3));
      g.hline(x0 + 1, x0 + 4, 19, x0 ? GOLD[2] : GOLD[1]);
    }
    // 반짝이 쿠션 (오른쪽, 금 스팽글)
    for (let y = 6; y <= 11; y++) for (let x = 19; x <= 24; x++) g.set(x, y, hash(x, y, 21) > 0.6 ? GOLD[0] : pick(GOLD, 0.35 + (y - 6) * 0.08, x, y));
    // 고깔모자 (왼쪽 쿠션 위)
    for (let y = 5; y <= 11; y++) {
      const hw = (y - 5) * 0.5;
      for (let x = Math.round(9 - hw); x <= Math.round(9 + hw); x++) g.set(x, y, (y + x) % 3 === 0 ? MINT[1] : (y % 2 ? GOLD[1] : PINK[1]));
    }
    g.set(9, 4, 0xffffff);
    g.set(9, 3, PINK[0]);
    // 색종이
    for (const [x, y, c] of [[7, 13, GOLD[0]], [13, 12, MINT[1]], [21, 13, PINK[0]], [25, 14, BLUE[1]]] as const) g.set(x, y, c);
  },

  /** 샴페인 타워: 쿠페 잔 3·2·1 피라미드 + 넘쳐흐르는 금빛 샴페인, 둥근 식탁보 받침 */
  champagne_tower: (g, W, H, v) => {
    // 받침 (흰 천을 두른 둥근 탁자)
    for (let y = 18; y <= H - 2; y++) for (let x = 2; x <= W - 3; x++) g.set(x, y, pick(CLOTH, 0.2 + ((x - 2) / (W - 5)) * 0.45 + (Math.abs(((x + 1) % 5) - 2) / 2) * 0.2, x, y));
    orb(g, 7.5, 17.3, 7.5, 1.6, CLOTH, 0.0, 0.25);
    g.hline(2, W - 3, H - 2, CLOTH[3]);
    g.hline(3, W - 4, H - 1, WOOD[3]);
    g.hline(2, W - 3, 19, GOLD[2]);
    // 쿠페 잔: 5칸 폭 (테·샴페인·잔대)
    const glass = (x: number, y: number) => {
      g.set(x, y, SILVER[1]);
      g.set(x + 4, y, SILVER[2]);
      g.hline(x + 1, x + 3, y, GOLD[1]);
      g.set(x + 1, y, GOLD[0]);
      g.hline(x + 1, x + 3, y + 1, GOLD[2]);
      g.set(x + 2, y + 2, SILVER[2]);
      g.hline(x + 1, x + 3, y + 3, SILVER[1]);
    };
    for (const x of [0, 5, 10]) glass(x, 13);
    for (const x of [2.5, 7.5]) glass(Math.round(x), 9);
    glass(5, 5);
    // 넘쳐흐르는 샴페인 (잔 가장자리로 한 방울씩)
    for (const [x, y] of [[4, 7], [10, 7], [2, 11], [12, 11]] as const) g.set(x, y, GOLD[0]);
    // 위에서 기울여 붓는 병 (짙은 초록 + 금박 목)
    if (has(v, "alt")) {
      // 옆에서 보면 병이 뒤에서 거의 곧게 기울어 붓는다
      stamp(g, 3, 0, ["BBB.", "BBBb", ".BBb", "..gG", "...y"], { G: GOLD[1], g: GOLD[2], B: 0x2e5a3e, b: 0x1e3e2a, y: GOLD[0] });
      g.set(4, 0, 0x5a8a6a);
    } else {
      stamp(g, 8, 0, ["....GG", "...gBB", "..BBBb", ".BBBb.", "gBBb..", "y....."], { G: GOLD[1], g: GOLD[2], B: 0x2e5a3e, b: 0x1e3e2a, y: GOLD[0] });
      g.set(6, 4, GOLD[0]);
      g.set(7, 3, 0x5a8a6a);
    }
    if (has(v, "clink")) {
      stamp(g, 0, 1, [".#.", "###", ".#."], { "#": 0xffffff });
      stamp(g, 13, 7, [".#.", "###", ".#."], { "#": GOLD[0] });
    }
  },

  /** 회식 노래방 기계: 가사 화면 TV + 스피커 장 + 무지개 불빛 + 걸어 둔 마이크 + 탬버린 */
  karaoke: (g, W, H, v) => {
    const lit = !has(v, "off");
    const sing = has(v, "sing");
    // TV
    g.rect(1, 1, W - 2, 11, 0x2a2a36);
    g.hline(1, W - 2, 1, 0x464656);
    for (let y = 2; y <= 9; y++)
      for (let x = 2; x <= W - 3; x++) g.set(x, y, lit ? mix(0x3a3a9a, 0xa24a9a, (y - 2) / 7 + (x - 2) / 40) : 0x1e2028);
    if (lit && !sing) {
      // 가사 두 줄 (앞 절반은 노랗게 칠해진다) + 음표
      g.hline(3, 11, 6, 0xffffff);
      g.hline(3, 6, 6, 0xffe060);
      g.hline(4, 12, 8, 0xd8d8f0);
      g.set(3, 3, 0xffe060);
      g.set(3, 4, 0xffe060);
      g.set(4, 3, 0xffe060);
      g.set(2, 4, 0xffe060);
      // 반짝 별
      g.set(12, 3, 0xffffff);
      g.set(10, 4, 0xa8e0ff);
    }
    if (lit && sing) {
      // 「100」점!
      let x = 3;
      for (const ch of "100") {
        stamp(g, x, 3, DIGIT[ch], { "#": 0xffe060 });
        x += 4;
      }
      g.set(2, 2, 0xff9ad0);
      g.set(13, 8, 0x8ae0ff);
    }
    g.rect(6, 10, 4, 2, 0x2a2a36);
    // 스피커 장
    shade(g, 2, 12, W - 4, H - 14, rp("#5a4a6a", "#463a54", "#342a40", "#241c2e"), 0.1, 0.8);
    g.hline(2, W - 3, 12, 0x6e5e80);
    // 무지개 불빛 줄
    const rainbow = [0xff6a6a, 0xffb05a, 0xffe060, 0x7ae08a, 0x6ac0ff, 0xb08aff];
    for (let x = 3; x <= W - 4; x++) g.set(x, 13, lit ? rainbow[(x - 3) % 6] : 0x3a3446);
    // 스피커 둘
    for (const cy of [17.5, 24]) {
      orb(g, 8, cy, 3.4, 3, rp("#3a3a44", "#26262e", "#18181e"), 0.2, 0.6);
      orb(g, 8, cy, 1.4, 1.2, SILVER, 0.2, 0.6);
    }
    // 걸어 둔 마이크 + 줄
    g.rect(13, 15, 2, 2, SILVER[1]);
    g.set(14, 16, SILVER[3]);
    g.vline(13, 17, 20, 0x22222a);
    g.vline(14, 17, 20, 0x3a3a46);
    for (let y = 21; y < H - 1; y++) g.set(14 + ((y >> 1) & 1), y, 0x22222a);
    // 탬버린 (왼쪽 아래에 기대어)
    orb(g, 2.5, H - 5, 2.4, 2.6, GOLD, 0.2, 0.5);
    g.set(2, H - 5, 0xf8e8c0);
    for (const [x, y] of [[0, H - 6], [4, H - 4], [2, H - 8]] as const) g.set(x, y, SILVER[1]);
    // 다리
    g.hline(3, W - 4, H - 2, 0x18141e);
    g.set(3, H - 1, 0x18141e);
    g.set(W - 4, H - 1, 0x18141e);
  },

  // ─────────── 4주 새해 아침 ───────────
  /** 매화 병풍: 네 폭 접이 병풍 (짙은 옻칠 테) + 비단 바탕에 해돋이·먼 산·매화 가지 */
  folding_screen: (g, W, H, v) => {
    if (has(v, "fold")) {
      // 접은 병풍: 네 폭이 겹쳐 서 있다
      for (let k = 3; k >= 0; k--) {
        const x0 = 11 + k * 2;
        for (let y = 2 + (k % 2); y <= H - 3; y++) for (let x = x0; x < x0 + 8; x++) g.set(x, y, x === x0 || x === x0 + 7 || y === 2 + (k % 2) || y === H - 3 ? LACQ[3] : pick(HANJI, 0.25 + k * 0.1, x, y));
      }
      g.rect(12, H - 2, 2, 2, LACQ[3]);
      g.rect(24, H - 2, 2, 2, LACQ[3]);
      return;
    }
    const panels = [
      [0, 7],
      [8, 15],
      [16, 23],
      [24, 31],
    ] as const;
    // 뒤(back): 접힌 방향이 반대라 들어간 폭·나온 폭이 바뀌고, 그림 없이 비단 뒷면 마름모 무늬
    const back = has(v, "back");
    const top = (k: number) => ((k % 2) !== (back ? 1 : 0) ? 2 : 0);
    const bot = (k: number) => ((k % 2) !== (back ? 1 : 0) ? H - 3 : H - 4);
    panels.forEach(([x0, x1], k) => {
      for (let y = top(k); y <= bot(k); y++)
        for (let x: number = x0; x <= x1; x++) {
          const frame = x === x0 || x === x1 || y <= top(k) + 1 || y >= bot(k) - 1;
          if (frame) {
            g.set(x, y, y === top(k) ? LACQ[1] : x === x0 ? LACQ[2] : LACQ[3]);
            continue;
          }
          // 비단: 폭마다 빛이 달라 접힌 느낌
          g.set(x, y, pick(HANJI, ((k % 2) !== (back ? 1 : 0) ? 0.34 : 0) + (y > bot(k) - 6 ? 0.2 : 0), x, y));
          if (back && (x + y) % 4 === 0 && (y >> 2) % 2 === 0) g.set(x, y, HANJI[3]);
        }
      // 발
      g.rect(x0 + 1, bot(k) + 1, 2, H - 1 - bot(k), LACQ[3]);
      g.rect(x1 - 2, bot(k) + 1, 2, H - 1 - bot(k), LACQ[3]);
    });
    const inside = (x: number, y: number) => {
      const k = Math.min(3, Math.floor(x / 8));
      const [x0, x1] = panels[k];
      return x > x0 && x < x1 && y > top(k) + 1 && y < bot(k) - 1;
    };
    const paint = (x: number, y: number, c: Color) => {
      if (inside(x, y)) g.set(x, y, c);
    };
    if (back) {
      // 뒷면 가운데 폭마다 작은 붉은 표지 (병풍 이름표)
      paint(11, 5, RED[2]);
      paint(12, 5, RED[2]);
      return;
    }
    // 먼 산 (옅은 쪽빛)
    for (let x = 0; x < W; x++) {
      const ridge = 19 + Math.round(2.2 * Math.sin(x / 4.2) + 1.3 * Math.sin(x / 1.7));
      for (let y = ridge; y <= 25; y++) paint(x, y, y === ridge ? 0x9cb4c4 : mix(0xb4c8d4, 0xd8e2e2, (y - ridge) / 6));
    }
    // 해돋이 (붉은 해)
    for (let y = 2; y <= 10; y++) for (let x = 20; x <= 30; x++) if (Math.hypot(x + 0.5 - 26, y + 0.5 - 6.5) < 3.2) paint(x, y, x < 26 && y < 6 ? 0xf27a62 : 0xdc5444);
    // 매화 가지 (왼쪽 아래 → 오른쪽 위)
    const branch: [number, number][] = [];
    for (let x = 1; x <= 22; x++) branch.push([x, Math.round(24 - x * 0.62 - 2.2 * Math.sin(x / 3.4))]);
    for (const [x, y] of branch) {
      paint(x, y, 0x3a2a24);
      if (x < 9) paint(x, y + 1, 0x4a3830);
    }
    // 곁가지
    for (let i = 0; i < 5; i++) {
      paint(6 + i, 16 - i, 0x3a2a24);
      paint(14 + i, 18 - i, 0x4a3830);
    }
    // 꽃 (분홍 다섯 잎 + 노란 술)
    for (const [x, y] of [[5, 19], [9, 13], [12, 16], [16, 10], [19, 13], [21, 7], [3, 21], [14, 9], [18, 15]] as const) {
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) paint(x + dx, y + dy, CHERRY[(dx + dy + 2) % 2]);
      paint(x, y, 0xf6d860);
    }
    // 봉오리
    for (const [x, y] of [[7, 11], [11, 14], [17, 12], [22, 5], [2, 18]] as const) paint(x, y, CHERRY[2]);
  },

  /** 떡국 소반: 붉은 옻칠 개다리소반 + 흰 사기그릇 떡국(지단·김·파) + 놋수저 + 김치 종지 */
  tteokguk_table: (g, W, H, v) => {
    const eaten = has(v, "eat");
    // 개다리 (바깥으로 휘었다 안으로)
    for (const [x, dir] of [[2, -1], [W - 4, 1]] as const) {
      for (let y = 13; y <= H - 1; y++) {
        const bow = y >= 15 && y <= 17 ? dir : 0;
        g.set(x + bow, y, LACQ[2]);
        g.set(x + 1 + bow, y, LACQ[3]);
      }
    }
    g.hline(3, W - 4, H - 3, LACQ[3]); // 아래 가로대
    // 상판 + 운각 (앞 두께)
    shade(g, 1, 9, W - 2, 3, LACQ, 0.0, 0.25);
    g.hline(1, W - 2, 9, lighten(LACQ[0], 0.15));
    g.hline(1, W - 2, 12, LACQ[2]);
    for (let x = 3; x <= W - 4; x++) if (Math.abs(x - 7.5) > 2) g.set(x, 13, LACQ[3]);
    // 옆(alt)에서 보면 김치 종지가 오른쪽, 수저가 왼쪽
    const alt = has(v, "alt");
    const o = alt ? 1 : 0;
    // 김치 종지
    const kx = alt ? W - 4 : 1;
    g.rect(kx, 8, 3, 2, CLOTH[1]);
    g.hline(kx, kx + 2, 8, RED[1]);
    g.set(kx + 1, 8, RED[2]);
    // 떡국 그릇
    for (let y = 7; y <= 10; y++) {
      const ins = y === 10 ? 1 : 0;
      for (let x = 4 + ins; x <= 11 - ins; x++) g.set(x - o, y, pick(PAPER, 0.05 + ((x - 4) / 7) * 0.5, x, y));
    }
    g.hline(4 - o, 11 - o, 8, BLUE[2]);
    g.set(5 - o, 8, BLUE[1]);
    for (let x = 4; x <= 11; x++) g.set(x - o, 6, PAPER[1]);
    for (let x = 5; x <= 10; x++) g.set(x - o, 5, eaten ? PAPER[2] : 0xf2e8d0);
    g.set(4 - o, 6, PAPER[2]);
    if (!eaten) {
      g.hline(5 - o, 10 - o, 6, 0xf2e8d0);
      // 떡 · 지단 · 김 · 파
      for (const x of [5, 8]) g.set(x - o, 6, 0xffffff);
      g.set(7 - o, 5, 0xffffff);
      g.set(6 - o, 5, 0xf6d040);
      g.set(9 - o, 5, 0xf6d040);
      g.set(10 - o, 6, 0xffffff);
      g.set(7 - o, 6, 0x2e3a2c);
      g.set(9 - o, 6, 0x6aa850);
    } else g.hline(5 - o, 10 - o, 6, PAPER[2]);
    // 놋수저
    const sx = alt ? 1 : 12;
    g.hline(sx, sx + 2, 10, GOLD[2]);
    g.set(alt ? sx + 2 : sx, 10, GOLD[1]);
    g.hline(sx, sx + 2, 11, GOLD[3]);
  },

  /** 복주머니 걸이: 나무 걸이 + 매듭 끈 + 붉은 비단 복주머니(금빛 복 무늬·오색 끈·술) */
  lucky_pouch: (g, W, H, v) => {
    const sh = has(v, "shake") ? -1 : 0;
    // 옆(alt): 기둥이 주머니 뒤 오른쪽에 서고 걸이 팔은 짧다. 뒤(back): 주머니 뒷면이라 복 무늬 대신 솔기
    const alt = has(v, "alt");
    const back = has(v, "back");
    const px = alt ? 11 : 2;
    const ax0 = alt ? 7 : 2;
    const ax1 = alt ? 13 : W - 3;
    // 걸이
    shade(g, alt ? 8 : 0, H - 2, 7, 2, WOOD, 0.3, 0.8);
    shadeX(g, px, 2, 2, H - 4, WOOD, 0.2, 0.7);
    shade(g, ax0, 1, ax1 - ax0 + 1, 2, WOOD, 0.1, 0.6);
    g.set(ax1, 1, WOOD[0]);
    // 매듭 끈
    const k0 = alt ? 8 : 10;
    const kx = k0 + sh;
    g.vline(k0, 3, 5, RED[2]);
    stamp(g, kx - 1, 5, [".R.", "RrR", ".R."], { R: RED[1], r: GOLD[1] });
    g.set(kx, 8, RED[2]);
    // 주머니 목 (주름) + 오색 끈
    for (let x = kx - 2; x <= kx + 2; x++) g.set(x, 9, x % 2 ? RED[1] : RED[2]);
    g.hline(kx - 3, kx + 3, 10, BLUE[1]);
    g.set(kx - 3, 10, GOLD[1]);
    g.set(kx + 3, 10, PINK[1]);
    // 주머니 몸
    for (let y = 11; y <= 21; y++)
      for (let x = kx - 6; x <= kx + 6; x++) {
        const dx = (x + 0.5 - kx - 0.5) / 5;
        const dy = (y + 0.5 - 16.5) / 5.5;
        if (dx * dx + dy * dy * (dy > 0 ? 1.1 : 1.6) > 1) continue;
        g.set(x, y, pick(RED, 0.1 + (dx + dy) * 0.35 + 0.25, x, y));
      }
    if (back) {
      // 뒷면: 가운데 솔기 + 금실 점 두엇
      for (let y = 12; y <= 20; y++) if (y % 2) g.set(kx, y, RED[3]);
      g.set(kx - 3, 15, GOLD[2]);
      g.set(kx + 3, 17, GOLD[2]);
    } else {
      // 금빛 복 무늬 (둥근 테 + 가운데 십자). 옆에서 보면 왼쪽으로 비켜 보인다
      const mx = kx - 1 - (alt ? 2 : 0);
      stamp(g, mx, 14, alt ? ["GG.", ".GG", "GGG", ".GG", "GG."] : [".GGG.", "G.G.G", "GGGGG", "G.G.G", ".GGG."], { G: GOLD[1] });
      if (!alt) g.set(kx + 1, 16, RED[2]);
      for (const [x, y] of [[kx - 3, 19], [kx + 4, 18], [kx - 4, 13], [kx + 4, 13]] as const) g.set(x, y, GOLD[2]);
    }
    // 술 (양옆으로 늘어진 끈)
    g.vline(kx - 4, 11, 14, BLUE[2]);
    g.vline(kx + 4 + 1, 11, 12, PINK[2]);
    // 흔들면 엽전이 반짝
    if (sh) {
      g.set(kx - 5, 22, GOLD[0]);
      g.set(kx + 4, 22, GOLD[1]);
    }
  },

  /** 방패연: 한지 연 (가운데 방구멍·붉은 꼭지·파랑/빨강 치마·대살) + 나무 받침 + 얼레 */
  shield_kite: (g, W, H) => {
    // 받침 기둥 + 발
    shadeX(g, 7, 17, 2, H - 19, WOOD, 0.2, 0.7);
    shade(g, 3, H - 2, 9, 2, WOOD, 0.3, 0.8);
    // 연 바탕
    for (let y = 0; y <= 17; y++) for (let x = 2; x <= 13; x++) g.set(x, y, x >= 11 ? HANJI[1] : HANJI[0]);
    // 치마 (아래 두 줄)
    for (let x = 2; x <= 13; x++) {
      g.set(x, 15, pick(BLUE, 0.3, x, 15));
      g.set(x, 16, pick(BLUE, 0.5, x, 16));
      g.set(x, 17, pick(RED, 0.4, x, 17));
    }
    // 꼭지 (붉은 반원)
    for (let y = 0; y <= 3; y++) for (let x = 5; x <= 10; x++) if (Math.hypot(x + 0.5 - 8, y + 0.5 - 0.5) < 3.2) g.set(x, y, pick(RED, 0.2 + (x - 5) * 0.08, x, y));
    // 대살 (가로 위·가운데 세로·대각 둘)
    for (let i = 0; i <= 11; i++) {
      const x = 2 + i;
      const y1 = Math.round((i / 11) * 14);
      if (y1 < 15) {
        g.set(x, y1, HANJI[3]);
        g.set(15 - x, y1, HANJI[3]);
      }
    }
    g.vline(8, 4, 14, HANJI[3]);
    // 방구멍 (뚫린 동그라미)
    for (let y = 6; y <= 12; y++) for (let x = 5; x <= 11; x++) if (Math.hypot(x + 0.5 - 8, y + 0.5 - 9) < 2.6) g.set(x, y, 0, 0);
    // 얼레 (실 감긴 나무 실패) + 연줄
    g.rect(10, H - 9, 5, 6, WOOD[2]);
    g.rect(11, H - 8, 3, 4, CLOTH[0]);
    g.hline(11, 13, H - 6, CLOTH[2]);
    g.vline(10, H - 10, H - 3, WOOD[3]);
    g.vline(14, H - 10, H - 3, WOOD[3]);
    g.rect(14, H - 4, 2, 1, WOOD[1]); // 손잡이
    for (let y = 18; y < H - 9; y++) g.set(Math.round(9 + ((y - 18) / (H - 27)) * 3), y, 0xf2ece0);
  },

  /** 청사초롱: 나무 걸이 기둥 + 붉은 비단 몸에 위아래 푸른 단, 금 테, 아래 붉은 술 (켜면 속이 환하다) */
  cheongsa_lantern: (g, _W, H, v) => {
    const lit = !has(v, "off");
    // 옆(alt): 기둥이 초롱 바로 뒤에 서고 초롱이 가운데. 뒤(back): 금 살 대신 솔기
    const alt = has(v, "alt");
    const back = has(v, "back");
    const o = alt ? -2 : 0;
    // 걸이 기둥
    if (alt) {
      shade(g, 4, H - 3, 9, 3, STONE, 0.2, 0.8);
      shadeX(g, 9, 2, 2, H - 5, WOOD, 0.3, 0.9);
      g.rect(7, 1, 4, 2, WOOD[2]); // 앞으로 뻗은 팔 (짧게 보인다)
      g.set(7, 1, WOOD[0]);
    } else {
      shade(g, 0, H - 3, 7, 3, STONE, 0.2, 0.8);
      shadeX(g, 2, 2, 2, H - 5, WOOD, 0.3, 0.9);
      shade(g, 2, 1, 11, 2, WOOD, 0.2, 0.7);
      g.set(12, 1, WOOD[0]);
    }
    g.vline(10 + o, 3, 5, GOLD[3]);
    // 뚜껑 (검은 옻칠 + 금 테)
    g.hline(7 + o, 13 + o, 6, 0x2a2228);
    g.hline(6 + o, 14 + o, 7, 0x3a3038);
    g.hline(6 + o, 14 + o, 8, GOLD[2]);
    // 몸통: 위 푸른 단 · 가운데 붉은 비단 · 아래 푸른 단
    const cx = 10 + o;
    for (let y = 9; y <= 20; y++) {
      const bulge = y >= 11 && y <= 18 ? 1 : 0;
      for (let x = 6 - bulge; x <= 14 + bulge; x++) {
        const blue = y <= 10 || y >= 19;
        const u = (x - (6 - bulge)) / (8 + bulge * 2);
        let val = 0.15 + u * 0.55;
        if (lit && !blue) val = 0.02 + Math.abs(x + o + 0.5 - cx - 0.5) / 7 + (Math.abs(y - 14.5) / 10) * 0.4;
        let c = pick(blue ? BLUE : RED, val, x + o, y);
        if (lit && !blue && Math.abs(x + o + 0.5 - cx - 0.5) < 2.2 && Math.abs(y - 14.5) < 3) c = mix(c, 0xffd8a0, 0.45);
        g.set(x + o, y, c);
      }
    }
    // 금 살 (세로 둘) — 뒤는 가운데 솔기 하나
    for (const x of back ? [10] : alt ? [7, 11] : [8, 12])
      for (let y = 9; y <= 20; y++) if ((y & 1) === 0) g.set(x + (back ? o : 0), y, mix((g.get(x, y) >>> 8) & 0xffffff, back ? RED[3] : GOLD[1], 0.6));
    // 아래 뚜껑 + 술
    g.hline(6 + o, 14 + o, 21, GOLD[2]);
    g.hline(7 + o, 13 + o, 22, 0x2a2228);
    g.rect(9 + o, 23, 3, 2, GOLD[1]);
    for (let y = 25; y <= 29; y++) for (let x = 9; x <= 11; x++) g.set(x + o + (y > 27 && x === 9 ? -1 : 0), y, (x + y) % 2 ? RED[1] : RED[2]);
    g.hline(8 + o, 12 + o, 30, RED[3]);
  },

  /** 새해 다짐 족자: 나무 족자걸이 + 옥빛 비단 + 한지에 붓글씨 「칼퇴」 + 붉은 낙관 */
  resolution_scroll: (g, W, H) => {
    // 걸이 (기둥 둘 + 위 가로대 + 발)
    shade(g, 0, 0, W, 2, WOOD, 0.1, 0.6);
    g.set(0, 0, WOOD[2]);
    g.set(W - 1, 0, WOOD[2]);
    for (const x of [1, W - 2]) shadeX(g, x, 2, 1, H - 4, WOOD, x === 1 ? 0.3 : 0.7, 0.7);
    shade(g, 0, H - 2, 4, 2, WOOD, 0.3, 0.8);
    shade(g, W - 4, H - 2, 4, 2, WOOD, 0.3, 0.8);
    // 걸이 끈
    g.set(6, 2, 0x8a6a4a);
    g.set(9, 2, 0x8a6a4a);
    g.hline(7, 8, 2, 0x8a6a4a);
    // 위 축
    g.hline(3, 12, 3, WOOD[3]);
    g.set(2, 3, GOLD[2]);
    g.set(13, 3, GOLD[2]);
    // 비단 테 + 한지
    shade(g, 3, 4, 10, H - 9, JADE, 0.1, 0.45);
    shade(g, 4, 6, 8, H - 13, HANJI, 0.0, 0.3);
    // 「칼」 「퇴」
    stamp(g, 5, 8, GLYPH_KAL, { "#": INK });
    stamp(g, 5, 20, GLYPH_TOE, { "#": INK });
    // 낙관
    g.rect(9, H - 9, 2, 2, 0xc8362e);
    g.set(9, H - 9, 0xe86a5a);
    // 아래 축
    g.hline(2, 13, H - 5, WOOD[3]);
    g.hline(3, 12, H - 4, WOOD[4]);
    g.set(1, H - 5, GOLD[2]);
    g.set(14, H - 5, GOLD[2]);
  },
};

// ═══════════════ 옆·뒤 모습 (24점 모두 네 방향) ═══════════════
// 규칙: 옆모습 = 왼쪽을 보는 모습 (오른쪽은 집 장면이 좌우로 뒤집어요), 뒷모습 = 반 바퀴 돌린 모습.
// 둥근 물건(트리·풍선·탁자…)은 장식 자리를 바꾼 앞 그림(alt)을 옆모습으로, 앞 그림을 좌우로 뒤집은 것을 뒷모습으로 써요.
// 네 방향이 서로 다른 그림이어야 돌린 티가 나요 (옆모습은 좌우 비대칭 — 뒤집은 오른쪽 모습과 달라야 해요).

const tok = (v: string, t: string) => [v, t].filter(Boolean).join("-");
/** 앞 그림에 변형 조각(alt…)을 더해 그린다 */
const withTok = (id: string, t: string): Draw => (g, W, H, v) => SEASON_DRAW[id](g, W, H, tok(v, t));
/** 앞 그림(+조각)을 좌우로 뒤집어 그린다 */
const flipOf = (id: string, t = ""): Draw => (g, W, H, v) => {
  const tmp = new Grid(W, H);
  SEASON_DRAW[id](tmp, W, H, tok(v, t));
  g.draw(tmp.mirrored(), 0, 0);
};

/** 벽돌 칠하기 (사각형 안, 3줄마다 줄눈) */
function bricks(g: Grid, x0: number, y0: number, x1: number, y1: number, dark = 0): void {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const row = Math.floor((y - y0) / 3);
      const mortar = (y - y0) % 3 === 2 || (x + (row % 2) * 3) % 6 === 0;
      g.set(x, y, mortar ? mix(0xc8a898, 0x000000, dark * 0.5) : pick(RED, 0.3 + dark + ((x - x0) / Math.max(1, x1 - x0)) * 0.3 + hash(Math.floor((x + (row % 2) * 3) / 6), row, 5) * 0.2, x, y));
    }
}

/** 엮은 바구니 (y0부터 아래 끝까지) */
function basket(g: Grid, W: number, H: number, y0: number): void {
  for (let y = y0; y <= H - 2; y++) {
    const inset = y >= H - 3 ? 1 : 0;
    for (let x = 1 + inset; x <= W - 2 - inset; x++) {
      const v = 0.15 + ((y - y0) / (H - y0 - 2)) * 0.5 + (((x + (y >> 1)) >> 1) % 2 ? 0.14 : 0) + (x > W - 5 ? 0.12 : 0);
      g.set(x, y, pick(WICKER, v, x, y));
    }
  }
  g.hline(1, W - 2, y0, lighten(WICKER[0], 0.15));
  g.hline(1, W - 2, y0 + 1, WICKER[2]);
}

/** 호두까기 인형 옆모습 (왼쪽을 봄: 코·턱이 왼쪽, 흰 머리가 뒤로) */
const NUTCRACKER_SIDE = [
  "........P.......",
  ".......pPP......",
  "........P.......",
  "......KKKKK.....",
  "......kKKKK.....",
  "......kKKKK.....",
  "......kKKKK.....",
  "......GGGGG.....",
  "......KKKKK.....",
  ".....GGGGGGG....",
  "......SSSHHH....",
  "......ESSHHH....",
  ".....nSSSHHH....",
  ".....WWWWHH.....",
  ".....MtWWHH.....",
  "......WWWH......",
  "......RRRRR.....",
  ".....RRGGRRR....",
  ".....RRRRRRR....",
  ".....YRrRRRR....",
  ".....RRrRRRR....",
  ".....YRrRRRR....",
  ".....LLSLLLL....",
  ".....RRRRRRr....",
  "......RRRRr.....",
  "......BBGb......",
  "......BBGb......",
  "......BbGb......",
  "......BbBb......",
  "......BbBb......",
  ".....OOOOOo.....",
  ".....OOOOOO.....",
  "..VVVVVVVVVVVV..",
  "...vvvvvvvvvv...",
];
/** 호두까기 인형 뒷모습 (흰 머리·제복 등판·갈라진 자락) */
const NUTCRACKER_BACK = [
  "........P.......",
  ".......PPp......",
  "........p.......",
  ".....KKKKKK.....",
  ".....KKKKKk.....",
  ".....KKKKKk.....",
  ".....KKKKKk.....",
  ".....GGGGGG.....",
  ".....KKKKKK.....",
  "....GGGGGGGG....",
  ".....HHHHHH.....",
  ".....HHHHHH.....",
  ".....HHHHHH.....",
  ".....HHHHHH.....",
  "......HHHH......",
  "......RRRR......",
  "....RRRRRRRR....",
  "...GRRRRRRRRG...",
  "...RRRRRRRRRR...",
  "...rRRRRRRRRr...",
  "...rRRRrRRRRr...",
  "...rRRRrRRRRr...",
  "...SLLLLLLLLS...",
  "....RRRrrRRR....",
  "....rRR..RRr....",
  ".....Bb..Bb.....",
  ".....Bb..Bb.....",
  ".....Bb..Bb.....",
  ".....Bb..Bb.....",
  ".....Bb..Bb.....",
  "....OOO..OOO....",
  "....OOO..OOO....",
  "..VVVVVVVVVVVV..",
  "...vvvvvvvvvv...",
];

export const SEASON_SPIN: Record<string, SpinArt> = {
  // ─────────── 1주 ───────────
  winter_stove: {
    // 왼쪽을 봄: 옆판(리벳)·연통은 뒤(오른쪽), 앞 유리문 틈으로 불빛이 왼쪽에 새어 나온다. 주전자 주둥이도 왼쪽
    side: (g, _W, H, v) => {
      const lit = !has(v, "off");
      shadeX(g, 10, 0, 3, 17, IRON, 0.05, 0.9);
      for (const y of [4, 10]) g.hline(10, 12, y, IRON[4]);
      g.hline(9, 13, 0, IRON[2]);
      shade(g, 2, 16, 12, 2, IRON, 0.0, 0.35);
      g.hline(3, 12, 16, lighten(IRON[0], 0.2));
      for (let y = 18; y <= 30; y++) for (let x = 3; x <= 12; x++) g.set(x, y, pick(IRON, 0.3 + ((x - 3) / 9) * 0.4 + ((y - 18) / 12) * 0.15, x, y));
      g.vline(3, 18, 30, IRON[1]);
      for (const [x, y] of [[5, 20], [10, 20], [5, 28], [10, 28]] as const) g.set(x, y, IRON[0]);
      g.hline(5, 10, 24, IRON[3]);
      // 앞 유리문 모서리 + 새는 불빛
      g.rect(1, 20, 2, 8, IRON[4]);
      for (let y = 21; y <= 26; y++) g.set(2, y, lit ? (y > 23 ? FIRE[2] : FIRE[1]) : 0x2a1c18);
      g.set(1, 23, GOLD[1]);
      for (const x of [4, 10]) {
        g.rect(x, 31, 2, 3, IRON[3]);
        g.set(x, 31, IRON[2]);
      }
      g.hline(3, 5, 35, IRON[4]);
      g.hline(9, 11, 35, IRON[4]);
      // 주전자 (주둥이가 왼쪽)
      orb(g, 6, 13.5, 2.8, 2.6, RED, 0.2, 0.6);
      g.hline(4, 8, 15, RED[3]);
      g.set(6, 10, IRON[1]);
      for (const [x, y] of [[4, 10], [5, 9], [6, 9], [7, 9], [8, 10]] as const) g.set(x, y, IRON[1]);
      g.set(2, 11, RED[1]);
      g.set(3, 12, RED[2]);
      g.set(5, 12, 0xffffff);
    },
    // 뒤: 문 없는 뒤판(세로 골)·작은 공기 구멍, 연통은 왼쪽, 주전자는 오른쪽
    back: (g, _W, H, v) => {
      const lit = !has(v, "off");
      shadeX(g, 4, 0, 3, 17, IRON, 0.05, 0.9);
      for (const y of [4, 10]) g.hline(4, 6, y, IRON[4]);
      g.hline(3, 7, 0, IRON[2]);
      shade(g, 1, 16, 14, 2, IRON, 0.0, 0.35);
      g.hline(2, 13, 16, lighten(IRON[0], 0.2));
      for (let y = 18; y <= 30; y++) for (let x = 2; x <= 13; x++) g.set(x, y, pick(IRON, 0.35 + ((x - 2) / 11) * 0.45 + ((y - 18) / 12) * 0.15, x, y));
      for (let x = 4; x <= 11; x += 3) g.vline(x, 19, 29, IRON[3]);
      g.rect(6, 26, 4, 2, IRON[4]);
      if (lit) {
        g.set(7, 27, 0x8a3a1e);
        g.set(8, 27, 0xb8501e);
      }
      for (const x of [3, 11]) {
        g.rect(x, 31, 2, 3, IRON[3]);
        g.set(x, 31, IRON[2]);
      }
      g.hline(2, 4, 35, IRON[4]);
      g.hline(11, 13, 35, IRON[4]);
      orb(g, 11.5, 13.5, 3, 2.6, RED, 0.25, 0.6);
      g.hline(10, 13, 15, RED[3]);
      g.hline(10, 12, 11, RED[2]);
      for (const [x, y] of [[9, 11], [9, 10], [10, 9], [11, 9], [12, 9], [13, 10], [13, 11]] as const) g.set(x, y, IRON[1]);
      g.set(8, 12, RED[2]);
    },
  },
  frost_window: {
    // 왼쪽을 봄 (16 × 46): 비스듬히 본 좁은 창 — 유리 두 칸이 위아래로, 창턱과 눈은 왼쪽으로, 아래는 라디에이터 옆모습
    side: (g, W, H) => {
      shade(g, 4, 0, 8, 34, CLOTH, 0.1, 0.5);
      g.hline(4, 11, 0, 0xffffff);
      for (const [y0, y1] of [[2, 15], [18, 31]] as const)
        for (let y = y0; y <= y1; y++)
          for (let x = 6; x <= 9; x++) {
            let c = mix(0x8cb4da, 0xcfe2f2, (y - y0) / (y1 - y0));
            if (y >= y1 - 1) c = 0xf4f8fc;
            if ((x === 6 || y === y0) && B4M[((y & 3) << 2) | (x & 3)] < 0.6) c = mix(c, 0xffffff, 0.6);
            g.set(x, y, c);
          }
      for (const [x, y] of [[7, 5], [8, 10], [7, 22], [9, 26]] as const) g.set(x, y, 0xffffff);
      g.hline(6, 9, 16, CLOTH[2]);
      g.hline(6, 9, 17, CLOTH[1]);
      // 창턱 + 눈 (왼쪽으로 나와 있다)
      shade(g, 1, 32, 12, 3, WOOD, 0.1, 0.6);
      for (let x = 1; x <= 11; x++) g.set(x, 32, SNOW[x % 3 === 0 ? 1 : 0]);
      g.set(2, 31, SNOW[0]);
      g.set(3, 31, SNOW[0]);
      // 라디에이터 옆모습 (가로 골)
      for (let y = 36; y <= H - 2; y++) for (let x = 4; x <= 11; x++) g.set(x, y, (y - 36) % 3 === 2 ? SILVER[4] : pick(SILVER, 0.15 + ((x - 4) / 7) * 0.45, x, y));
      g.hline(4, 11, 35, SILVER[2]);
      g.set(5, H - 1, SILVER[4]);
      g.set(10, H - 1, SILVER[4]);
      // 앞쪽(왼쪽)에 걸린 양말
      stamp(g, 2, 36, ["S", "r", "r", "r", "rr", ".r"], { S: 0xf6f0e4, r: KRED[1] });
      g.set(3, 41, KRED[2]);
      void W;
    },
    back: flipOf("frost_window", "back"),
  },
  log_basket: {
    // 왼쪽을 봄: 통나무가 길게 누운 모습 (껍질 결 + 왼쪽 끝 단면), 자작나무는 왼쪽 뒤
    side: (g, W, H) => {
      for (let y = 0; y <= 11; y++) {
        g.set(3, y, BIRCH[0]);
        g.set(4, y, BIRCH[1]);
        g.set(5, y, BIRCH[2]);
        if (y % 3 === 2) g.set(4, y, 0x3a3430);
      }
      const log = (x0: number, x1: number, y: number) => {
        for (let x = x0; x <= x1; x++) for (let j = 0; j < 3; j++) g.set(x, y + j, pick(WOOD, 0.25 + j * 0.25 + (hash(x, y, 4) > 0.75 ? 0.15 : 0), x, y + j));
        g.rect(x0, y, 2, 3, GRAIN[1]);
        g.set(x0, y + 1, GRAIN[2]);
        g.set(x0 + 1, y + 1, GRAIN[3]);
      };
      log(6, 13, 5);
      log(2, 10, 8);
      log(7, 14, 9);
      basket(g, W, H, 12);
      g.rect(7, 12, 2, 1, WICKER[3]); // 앞으로 보이는 손잡이 고리
      orb(g, 12.5, 13.5, 1.6, 1.4, WOOD, 0.4, 0.5);
    },
    back: flipOf("log_basket"),
  },
  cocoa_table: { side: withTok("cocoa_table", "alt"), back: flipOf("cocoa_table") },
  scarf_grave: {
    // 왼쪽을 봄: 얇은 비석 옆면, 털모자 방울이 뒤로, 목도리 꼬리가 앞(왼쪽)으로
    side: (g, W, H) => {
      shade(g, 1, H - 4, W - 2, 3, STONE, 0.4, 0.9);
      g.hline(1, W - 2, H - 1, STONE[4]);
      for (let x = 1; x < W - 1; x++) g.set(x, H - 4, x % 4 === 1 ? SNOW[1] : SNOW[0]);
      for (let y = 6; y <= H - 5; y++)
        for (let x = 6; x <= 10; x++) {
          if (y < 8 && (x === 6 || x === 10)) continue;
          g.set(x, y, pick(STONE, 0.15 + ((x - 6) / 4) * 0.55, x, y));
        }
      g.vline(6, 8, H - 5, STONE[1]);
      for (let y = 1; y <= 6; y++)
        for (let x = 4; x <= 12; x++) {
          if (Math.hypot((x + 0.5 - 8.5) / 4.2, (y + 0.5 - 7) / 5.4) > 1) continue;
          g.set(x, y, pick(KRED, (((x + (y >> 1)) & 1) === 0 ? 0.08 : 0.32) + (x - 4) / 16, x, y));
        }
      for (let x = 4; x <= 12; x++) {
        g.set(x, 6, pick(KNIT, 0.1 + (x & 1) * 0.25, x, 6));
        g.set(x, 7, pick(KNIT, 0.35 + (x & 1) * 0.25, x, 7));
      }
      orb(g, 10.5, 1.2, 1.9, 1.5, KNIT, 0.0, 0.5);
      for (let y = 10; y <= 11; y++) for (let x = 5; x <= 11; x++) g.set(x, y, Math.floor((x - 5) / 2) % 2 ? pick(KNIT, 0.12 + (y - 10) * 0.3, x, y) : pick(KRED, 0.12 + (y - 10) * 0.35, x, y));
      for (let y = 12; y <= 17; y++) for (let x = 3; x <= 4; x++) g.set(x - (y > 15 ? 1 : 0), y, Math.floor((y - 12) / 2) % 2 ? pick(KNIT, 0.3, x, y) : pick(KRED, 0.25 + (x - 3) * 0.3, x, y));
      g.set(2, 18, KNIT[1]);
      g.set(4, 18, KNIT[1]);
      g.set(3, 18, KNIT[2]);
    },
    // 뒤: 새김 없는 비석 뒷면, 목도리 매듭과 꼬리 둘이 가운데로
    back: (g, W, H) => {
      shade(g, 1, H - 4, W - 2, 3, STONE, 0.4, 0.9);
      g.hline(1, W - 2, H - 1, STONE[4]);
      for (let x = 1; x < W - 1; x++) g.set(x, H - 4, x % 4 === 3 ? SNOW[1] : SNOW[0]);
      for (let y = 5; y <= H - 5; y++)
        for (let x = 2; x <= 13; x++) {
          if (y < 9 && Math.hypot((x + 0.5 - 8) / 6, (y + 0.5 - 9.5) / 4.5) > 1) continue;
          g.set(x, y, pick(STONE, 0.3 + ((x - 2) / 11) * 0.5, x, y));
        }
      for (const [x, y] of [[4, 16], [5, 17], [11, 14], [10, 19]] as const) g.set(x, y, 0x7a9a6a); // 이끼
      for (let y = 1; y <= 6; y++)
        for (let x = 3; x <= 12; x++) {
          if (Math.hypot((x + 0.5 - 8) / 4.6, (y + 0.5 - 7) / 5.4) > 1) continue;
          g.set(x, y, pick(KRED, (((x + (y >> 1)) & 1) === 0 ? 0.2 : 0.42) + (x - 3) / 16, x, y));
        }
      for (let x = 3; x <= 12; x++) {
        g.set(x, 6, pick(KNIT, 0.2 + (x & 1) * 0.25, x, 6));
        g.set(x, 7, pick(KNIT, 0.45 + (x & 1) * 0.25, x, 7));
      }
      orb(g, 7.5, 1, 1.9, 1.5, KNIT, 0.1, 0.5);
      for (let y = 10; y <= 11; y++) for (let x = 1; x <= 14; x++) g.set(x, y, Math.floor((x - 1) / 2) % 2 ? pick(KNIT, 0.2 + (y - 10) * 0.3, x, y) : pick(KRED, 0.2 + (y - 10) * 0.35, x, y));
      g.rect(7, 10, 2, 3, KRED[3]); // 매듭
      for (let y = 13; y <= 18; y++) {
        g.set(6, y, Math.floor((y - 13) / 2) % 2 ? KNIT[1] : KRED[1]);
        g.set(9, y + (y > 16 ? 0 : 0), Math.floor((y - 13) / 2) % 2 ? KRED[2] : KNIT[2]);
      }
      g.set(6, 19, KNIT[1]);
      g.set(9, 19, KNIT[1]);
    },
  },
  // ─────────── 2주 ───────────
  xmas_tree: { side: withTok("xmas_tree", "alt"), back: flipOf("xmas_tree") },
  paper_tree: { side: withTok("paper_tree", "alt"), back: flipOf("paper_tree", "back") },
  stocking_fireplace: {
    // 왼쪽을 봄 (16 × 52): 선반 윗면이 세로로 길게, 앞(아래 끝)에 벽돌 끝면, 왼쪽 가장자리에 양말·솔가지·불빛
    side: (g, W, H, v) => {
      const lit = !has(v, "off");
      // 선반 윗면 (깊이 방향으로 길다)
      shadeX(g, 2, 6, 12, H - 22, CLOTH, 0.0, 0.4);
      g.vline(13, 6, H - 17, CLOTH[3]);
      // 선반 위 소품: 촛불 둘 + 스노볼
      for (const y of [8, H - 24]) {
        g.rect(7, y, 2, 5, CLOTH[1]);
        g.vline(8, y, y + 4, CLOTH[3]);
        if (lit) {
          g.set(7, y - 2, FIRE[1]);
          g.set(7, y - 1, FIRE[2]);
        } else g.set(7, y - 1, 0x3a3028);
      }
      orb(g, 8, Math.floor(H / 2) - 6, 2.6, 2.6, rp("#e8f4fc", "#cfe4f4", "#b2d2ec"), 0.0, 0.5);
      g.set(8, Math.floor(H / 2) - 6, PINE[2]);
      // 앞 끝면: 선반 끝 + 벽돌 + 바닥 돌
      shade(g, 2, H - 17, 12, 3, CLOTH, 0.1, 0.5);
      bricks(g, 4, H - 14, 13, H - 4, 0.05);
      shade(g, 1, H - 3, 14, 3, STONE, 0.15, 0.7);
      // 아궁이 불빛이 왼쪽으로 번진다
      for (let y = H - 13; y <= H - 4; y++) g.set(3, y, lit ? (y > H - 8 ? FIRE[2] : FIRE[3]) : 0x2a1c18);
      if (lit) g.set(2, H - 5, FIRE[1]);
      // 왼쪽 가장자리 솔가지 + 열매·전구
      for (let y = 6; y <= H - 15; y++) {
        g.set(1, y, pick(PINE, 0.25 + (y & 1 ? 0.2 : 0), 1, y));
        if (y % 4 === 1) g.set(1, y, lit ? (y % 8 === 1 ? 0xfff0a0 : 0xffb0c0) : 0x8a7a4a);
        if (y % 6 === 3) g.set(2, y, RED[1]);
      }
      // 양말 셋 (옆에서 보면 납작하게, 발끝이 왼쪽으로)
      const sock = (y: number, body: readonly Color[], stripe: boolean) => {
        g.rect(0, y, 2, 2, CLOTH[0]);
        for (let j = 2; j < 8; j++) g.set(1, y + j, stripe && j % 2 === 0 ? CLOTH[1] : body[1]);
        g.set(0, y + 7, body[2]);
        g.set(0, y + 6, body[1]);
      };
      sock(13, KRED, false);
      sock(23, GREEN, true);
      sock(33, KRED, true);
    },
    // 뒤: 벽돌 뒷벽 + 위로 좁아지는 굴뚝, 선반 뒤 끝, 솔가지 끝이 양옆으로 삐져나온다
    back: (g, W, H) => {
      bricks(g, 9, 0, 22, 9, 0.1);
      bricks(g, 2, 10, W - 3, H - 4, 0.1);
      shade(g, 0, 9, W, 2, CLOTH, 0.3, 0.6);
      shade(g, 0, H - 3, W, 3, STONE, 0.15, 0.7);
      for (const x of [0, 1, W - 2, W - 1]) for (let y = 11; y <= 12; y++) g.set(x, y, pick(PINE, 0.3 + (y - 11) * 0.3, x, y));
      g.set(0, 12, RED[1]);
      g.set(W - 1, 11, RED[1]);
    },
  },
  gift_pile: { side: withTok("gift_pile", "alt"), back: flipOf("gift_pile") },
  nutcracker: {
    side: (g, _W, _H, v) => {
      stamp(g, 0, 0, NUTCRACKER_SIDE, NUT_PAL);
      if (has(v, "crack")) {
        g.set(5, 14, 0x3a1a1a);
        g.set(5, 15, NUT_PAL.t);
        g.set(2, 12, WOOD[2]);
        g.set(1, 14, WOOD[3]);
      }
    },
    back: (g) => stamp(g, 0, 0, NUTCRACKER_BACK, NUT_PAL),
  },
  wreath_stand: {
    // 왼쪽을 봄: 이젤이 ㅅ자로 보이고 리스는 납작한 고리, 리본·방울은 앞(왼쪽)
    side: (g, _W, H, v) => {
      const ring = has(v, "ring") ? 1 : 0;
      for (let y = 9; y <= H - 1; y++) {
        const t = (y - 9) / (H - 10);
        g.set(Math.round(8 - t * 5), y, WOOD[2]);
        g.set(Math.round(9 + t * 4), y, WOOD[3]);
      }
      g.hline(6, 11, H - 8, WOOD[3]);
      for (let y = 1; y <= 16; y++)
        for (let x = 5; x <= 11; x++) {
          const d = Math.hypot((x + 0.5 - 8) / 2.8, (y + 0.5 - 8.5) / 7.6);
          if (d > 1) continue;
          g.set(x, y, pick(PINE, 0.25 + ((x - 5) / 6) * 0.45 + (hash(x, y, 9) - 0.5) * 0.3, x, y));
        }
      for (const [x, y] of [[5, 4], [6, 9], [5, 12], [7, 2]] as const) g.set(x, y, RED[1]);
      stamp(g, 2, 13, ["RR..", "RRrR", ".RR.", "..R.", "..R."], { R: RED[1], r: RED[3] });
      g.rect(3 - ring, 16, 2, 2, GOLD[1]);
      g.set(3 - ring, 16, GOLD[0]);
    },
    // 뒤: 뒷다리가 가운데 앞에 서고 리스 뒷면(열매 적게), 리본 꼬리만 아래로
    back: (g, W, H) => {
      for (let y = 10; y <= H - 1; y++) {
        const t = (y - 10) / (H - 11);
        g.set(Math.round(7.5 - t * 4.5), y, WOOD[3]);
        g.set(Math.round(8.5 + t * 4.5), y, WOOD[3]);
      }
      for (let y = 0; y <= 17; y++)
        for (let x = 0; x < W; x++) {
          const d = Math.hypot(x + 0.5 - 8, (y + 0.5 - 8.5) * 1.05);
          if (d > 7.2 || d < 3.2) continue;
          g.set(x, y, pick(PINE, 0.55 + (hash(x, y, 19) - 0.5) * 0.35, x, y));
        }
      for (const [x, y] of [[12, 4], [3, 6]] as const) g.set(x, y, RED[2]);
      g.vline(7, 12, H - 1, WOOD[2]); // 뒷다리 (앞으로 보인다)
      g.vline(8, 12, H - 1, WOOD[3]);
      g.set(6, 15, RED[2]);
      g.set(9, 16, RED[2]);
      g.set(5, 16, RED[3]);
    },
  },
  // ─────────── 3주 ───────────
  cake_table: {
    // 왼쪽을 봄 (16 × 44): 식탁보 윗면이 세로로 길고, 케이크는 가운데, 잔은 먼 쪽(위)·접시는 가까운 쪽(아래)
    side: (g, W, H, v) => {
      const lit = !has(v, "off");
      for (const x of [2, W - 4]) shadeX(g, x, H - 3, 2, 3, WOOD, 0.5, 0.9);
      shadeX(g, 0, 13, W, H - 26, CLOTH, 0.0, 0.25);
      for (let y = H - 13; y <= H - 5; y++) for (let x = 1; x <= W - 2; x++) g.set(x, y, pick(CLOTH, 0.25 + (Math.abs(((x + 3) % 7) - 3) / 3) * 0.35, x, y));
      g.hline(1, W - 2, H - 13, GOLD[2]);
      for (let x = 1; x <= W - 2; x++) g.set(x, H - 4, x % 2 ? CLOTH[1] : CLOTH[3]);
      for (let y = 14; y < H - 13; y += 2) g.set(0, y, CLOTH[3]); // 왼쪽으로 늘어진 천 주름
      // 잔 둘 (먼 쪽)
      for (const x of [9, 12]) {
        g.rect(x, 6, 2, 4, GOLD[1]);
        g.set(x, 6, GOLD[0]);
        g.vline(x, 10, 12, SILVER[2]);
        g.hline(x - 1, x + 1, 12, SILVER[1]);
      }
      // 케이크 (옆에서 봐도 둥글다)
      shade(g, 2, 19, 12, 8, CLOTH, 0.05, 0.5);
      g.hline(2, 13, 19, 0xffffff);
      for (let x = 2; x <= 13; x++) {
        g.set(x, 20, PINK[1]);
        if (x % 3 !== 2) g.set(x, 21, PINK[1]);
      }
      g.hline(2, 13, 26, PINK[2]);
      shade(g, 4, 15, 8, 4, CLOTH, 0.0, 0.4);
      g.hline(4, 11, 15, 0xffffff);
      for (const x of [3, 7, 11]) {
        g.set(x, 18, RED[1]);
        g.set(x + 1, 18, RED[2]);
      }
      for (const x of [5, 8, 10]) {
        g.vline(x, 12, 14, x % 2 ? PINK[1] : MINT[1]);
        g.set(x, 11, lit ? FIRE[1] : 0x3a3028);
      }
      // 접시 (가까운 쪽)
      orb(g, 8, 29.5, 3.4, 1.1, SILVER, 0.0, 0.4);
      g.rect(7, 28, 2, 2, PINK[1]);
      g.set(7, 28, CLOTH[0]);
      for (const [x, y, c] of [[3, 16, GOLD[1]], [12, 23, MINT[1]], [2, 30, PINK[1]]] as const) g.set(x, y, c);
    },
    back: flipOf("cake_table"),
  },
  balloon_bunch: { side: withTok("balloon_bunch", "alt"), back: flipOf("balloon_bunch") },
  disco_ball: { side: withTok("disco_ball", "alt"), back: withTok("disco_ball", "alt2") },
  champagne_tower: { side: withTok("champagne_tower", "alt"), back: flipOf("champagne_tower") },
  karaoke: {
    // 왼쪽을 봄: TV 옆면(화면 빛이 왼쪽 가장자리에), 장 옆판, 무지개 줄은 앞 모서리, 마이크는 앞쪽 걸이
    side: (g, _W, H, v) => {
      const lit = !has(v, "off");
      g.rect(5, 1, 8, 11, 0x2a2a36);
      g.hline(5, 12, 1, 0x464656);
      for (let y = 2; y <= 9; y++) g.set(4, y, lit ? mix(0x6a5ac0, 0xc06ab0, (y - 2) / 7) : 0x1e2028);
      g.rect(7, 10, 3, 2, 0x2a2a36);
      shade(g, 4, 12, 9, H - 14, rp("#5a4a6a", "#463a54", "#342a40", "#241c2e"), 0.1, 0.8);
      g.hline(4, 12, 12, 0x6e5e80);
      const rainbow = [0xff6a6a, 0xffb05a, 0xffe060, 0x7ae08a, 0x6ac0ff, 0xb08aff];
      for (let y = 13; y <= H - 4; y++) g.set(4, y, lit ? rainbow[(y - 13) % 6] : 0x3a3446);
      for (let y = 16; y <= H - 6; y += 3) g.hline(7, 11, y, 0x2a2232); // 옆판 바람구멍
      // 마이크 (앞쪽 걸이) + 줄
      g.rect(1, 15, 2, 2, SILVER[1]);
      g.set(2, 16, SILVER[3]);
      g.vline(1, 17, 20, 0x22222a);
      g.vline(2, 17, 20, 0x3a3a46);
      for (let y = 21; y < H - 1; y++) g.set(1 + ((y >> 1) & 1), y, 0x22222a);
      // 탬버린 (뒤쪽 오른쪽에 기대어)
      orb(g, 13.5, H - 5, 2, 2.6, GOLD, 0.3, 0.5);
      g.set(14, H - 8, SILVER[1]);
      g.hline(4, 12, H - 2, 0x18141e);
      g.set(5, H - 1, 0x18141e);
      g.set(11, H - 1, 0x18141e);
    },
    // 뒤: TV 뒷면(바람구멍)·장 뒤판, 엉킨 전선, 마이크는 왼쪽·탬버린은 오른쪽
    back: (g, W, H) => {
      g.rect(2, 1, W - 4, 10, 0x34343e);
      g.hline(2, W - 3, 1, 0x4a4a56);
      for (let y = 3; y <= 8; y += 2) g.hline(5, 10, y, 0x24242c);
      g.rect(6, 10, 4, 2, 0x2a2a36);
      shade(g, 2, 12, W - 4, H - 14, rp("#4e4060", "#3c324a", "#2c2438", "#201a2a"), 0.2, 0.85);
      g.hline(2, W - 3, 12, 0x5e5070);
      for (let y = 15; y <= H - 6; y += 2) for (let x = 5; x <= 10; x += 2) g.set(x, y, 0x1a1420);
      for (let y = 18; y < H - 1; y++) g.set(8 + Math.round(Math.sin(y / 2) * 1.5), y, 0x16161c); // 전선
      g.rect(1, 15, 2, 2, SILVER[1]);
      g.vline(1, 17, 20, 0x22222a);
      orb(g, 13.5, H - 5, 2.4, 2.6, GOLD, 0.25, 0.5);
      g.hline(3, W - 4, H - 2, 0x18141e);
      g.set(3, H - 1, 0x18141e);
      g.set(W - 4, H - 1, 0x18141e);
    },
  },
  party_sofa: {
    // 왼쪽을 봄 (16 × 40): 앉는 면(밝게)이 가운데 세로로, 오른쪽에 등받이가 솟고, 위·아래 끝에 말린 팔걸이
    side: (g, W, H) => {
      // 금 다리 (아래 끝 둘만 보인다)
      for (const x of [2, W - 4]) {
        g.rect(x, H - 3, 2, 3, GOLD[2]);
        g.set(x, H - 3, GOLD[0]);
      }
      // 등받이 (오른쪽, 위로 솟음) — 윗면 밝게, 단추 누빔
      for (let y = 1; y <= H - 8; y++) for (let x = W - 5; x <= W - 2; x++) g.set(x, y, pick(VELVET, 0.3 + ((x - (W - 5)) / 3) * 0.4, x, y));
      g.vline(W - 5, 1, H - 8, VELVET[1]);
      for (const y of [12, 20, 28]) {
        g.set(W - 3, y, VELVET[4]);
        g.set(W - 4, y - 1, VELVET[1]);
      }
      // 앉는 쿠션 둘 (위에서 본 면)
      for (const [y0, y1] of [[9, 20], [21, 31]] as const) {
        shade(g, 1, y0, W - 6, y1 - y0 + 1, VELVET, 0.05, 0.35);
        g.hline(2, W - 7, y0, lighten(VELVET[0], 0.2));
      }
      g.vline(1, 9, 31, VELVET[2]);
      // 위 팔걸이 (말린 윗면)
      for (let y = 3; y <= 9; y++) for (let x = 0; x <= W - 2; x++) g.set(x, y, pick(VELVET, 0.05 + ((y - 3) / 6) * 0.45, x, y));
      g.hline(1, W - 3, 3, lighten(VELVET[0], 0.3));
      // 아래 팔걸이 (윗면 + 앞면) + 치마·금술
      for (let y = 30; y <= H - 5; y++) for (let x = 0; x <= W - 2; x++) g.set(x, y, pick(VELVET, y <= 32 ? 0.05 + (y - 30) * 0.1 : 0.5 + (y - 33) * 0.08, x, y));
      g.hline(1, W - 3, 30, lighten(VELVET[0], 0.3));
      for (let x = 0; x <= W - 2; x++) g.set(x, H - 4, x % 2 ? GOLD[1] : GOLD[2]);
      // 쿠션 위 고깔모자 + 색종이
      for (let y = 13; y <= 18; y++) {
        const hw = (y - 13) * 0.5;
        for (let x = Math.round(5 - hw); x <= Math.round(5 + hw); x++) g.set(x, y, (x + y) % 3 === 0 ? MINT[1] : y % 2 ? GOLD[1] : PINK[1]);
      }
      g.set(5, 12, 0xffffff);
      for (const [x, y, c] of [[8, 24, GOLD[0]], [3, 27, MINT[1]], [9, 15, BLUE[1]]] as const) g.set(x, y, c);
    },
    // 뒤: 넓은 등판 (세로 누빔 줄) + 팔걸이 뒤
    back: (g, W, H) => {
      for (const x of [3, W - 5]) g.rect(x, H - 4, 2, 3, GOLD[3]);
      for (let y = 4; y <= H - 5; y++) for (let x = 1; x <= W - 2; x++) g.set(x, y, pick(VELVET, 0.3 + ((y - 4) / (H - 9)) * 0.45, x, y));
      for (let y = 0; y <= 6; y++) for (let x = 3; x <= W - 4; x++) if (!(y < 2 && (x < 5 || x > W - 6))) g.set(x, y, pick(VELVET, 0.2 + y * 0.04, x, y));
      g.hline(5, W - 6, 0, VELVET[1]);
      for (let x = 7; x < W - 4; x += 6) g.vline(x, 3, H - 7, VELVET[3]);
      for (const x0 of [0, W - 6]) orb(g, x0 + 3, 6, 3, 2, VELVET, 0.2, 0.5);
      for (let x = 1; x <= W - 2; x++) g.set(x, H - 5, x % 2 ? GOLD[2] : GOLD[3]);
    },
  },
  // ─────────── 4주 ───────────
  folding_screen: {
    // 왼쪽을 봄 (16 × 48): 네 폭이 지그재그로 접혀 선 모습을 비스듬히. 폭마다 빛이 달라 접힌 결이 보인다
    side: (g, _W, H, v) => {
      const fold = has(v, "fold");
      const amp = fold ? 2 : 6;
      const ph = 19; // 폭 높이
      for (let k = 0; k < 4; k++)
        for (let t = 0; t < 8; t++) {
          const yb = 21 + Math.round(((k * 8 + t) * (H - 24)) / 32);
          const x = k % 2 === 0 ? 4 + Math.round((t / 7) * amp) : 4 + amp - Math.round((t / 7) * amp);
          const lightSide = k % 2 === 0;
          for (let y = yb - ph; y <= yb; y++)
            for (let i = 0; i < 2; i++) {
              const frame = y <= yb - ph + 1 || y >= yb - 1 || t === 0;
              g.set(x + i, y, frame ? (y === yb - ph ? LACQ[1] : LACQ[3]) : pick(HANJI, lightSide ? 0.05 : 0.4, x + i, y));
            }
          // 그림 조각 (매화·해)
          if (!fold && t === 4) {
            g.set(x, yb - Math.round(ph * 0.55), CHERRY[1]);
            g.set(x + 1, yb - Math.round(ph * 0.4), 0x3a2a24);
            if (k === 3) g.set(x, yb - ph + 5, 0xdc5444);
          }
          if (t === 0 || t === 7) g.rect(x, yb + 1, 2, 2, LACQ[3]);
        }
    },
    back: flipOf("folding_screen", "back"),
  },
  tteokguk_table: { side: withTok("tteokguk_table", "alt"), back: flipOf("tteokguk_table") },
  lucky_pouch: { side: withTok("lucky_pouch", "alt"), back: flipOf("lucky_pouch", "back") },
  shield_kite: {
    // 왼쪽을 봄: 비스듬히 본 좁은 연 (꼭지·구멍·치마가 좁게), 받침 기둥, 얼레는 앞(왼쪽)
    side: (g, W, H) => {
      shadeX(g, 8, 17, 2, H - 19, WOOD, 0.2, 0.7);
      shade(g, 4, H - 2, 9, 2, WOOD, 0.3, 0.8);
      for (let y = 0; y <= 17; y++) for (let x = 5; x <= 11; x++) g.set(x, y, x >= 10 ? HANJI[2] : HANJI[0]);
      for (let x = 5; x <= 11; x++) {
        g.set(x, 15, pick(BLUE, 0.3, x, 15));
        g.set(x, 16, pick(BLUE, 0.5, x, 16));
        g.set(x, 17, pick(RED, 0.4, x, 17));
      }
      for (let y = 0; y <= 2; y++) for (let x = 6; x <= 9; x++) if (Math.hypot((x + 0.5 - 8) / 1.9, y + 0.5 - 0.5) < 2.6) g.set(x, y, RED[1]);
      g.vline(8, 4, 14, HANJI[3]);
      for (let y = 7; y <= 11; y++) for (let x = 7; x <= 9; x++) if (Math.hypot((x + 0.5 - 8.3) / 1.3, (y + 0.5 - 9) / 2.4) < 1) g.set(x, y, 0, 0);
      // 얼레 (앞쪽)
      g.rect(1, H - 9, 5, 6, WOOD[2]);
      g.rect(2, H - 8, 3, 4, CLOTH[0]);
      g.hline(2, 4, H - 6, CLOTH[2]);
      g.vline(1, H - 10, H - 3, WOOD[3]);
      g.vline(5, H - 10, H - 3, WOOD[3]);
      g.rect(0, H - 4, 1, 1, WOOD[1]);
      for (let y = 18; y < H - 9; y++) g.set(Math.round(7 - ((y - 18) / (H - 27)) * 3), y, 0xf2ece0);
      void W;
    },
    // 뒤: 한지 뒷면 (색이 흐리게 비치고 대살이 또렷), 얼레는 왼쪽
    back: (g, W, H) => {
      shadeX(g, 7, 17, 2, H - 19, WOOD, 0.2, 0.7);
      shade(g, 3, H - 2, 9, 2, WOOD, 0.3, 0.8);
      for (let y = 0; y <= 17; y++) for (let x = 2; x <= 13; x++) g.set(x, y, x <= 4 ? HANJI[2] : HANJI[1]);
      for (let x = 2; x <= 13; x++) {
        g.set(x, 15, mix(HANJI[1], BLUE[2], 0.35));
        g.set(x, 16, mix(HANJI[1], BLUE[2], 0.45));
        g.set(x, 17, mix(HANJI[1], RED[2], 0.4));
      }
      for (let y = 0; y <= 3; y++) for (let x = 5; x <= 10; x++) if (Math.hypot(x + 0.5 - 8, y + 0.5 - 0.5) < 3.2) g.set(x, y, mix(HANJI[1], RED[1], 0.4));
      // 대살 (뒤에서 또렷)
      for (let i = 0; i <= 11; i++) {
        const y1 = Math.round((i / 11) * 14);
        g.set(2 + i, y1, WOOD[2]);
        g.set(13 - i, y1, WOOD[2]);
      }
      g.vline(7, 0, 16, WOOD[2]);
      g.hline(2, 13, 1, WOOD[2]);
      g.hline(2, 13, 9, WOOD[3]);
      for (let y = 6; y <= 12; y++) for (let x = 4; x <= 11; x++) if (Math.hypot(x + 0.5 - 7.5, y + 0.5 - 9) < 2.6) g.set(x, y, 0, 0);
      g.rect(1, H - 9, 5, 6, WOOD[3]);
      g.rect(2, H - 8, 3, 4, CLOTH[1]);
      g.vline(1, H - 10, H - 3, WOOD[4]);
      g.vline(5, H - 10, H - 3, WOOD[4]);
      for (let y = 18; y < H - 9; y++) g.set(Math.round(6 - ((y - 18) / (H - 27)) * 2), y, 0xf2ece0);
      void W;
    },
  },
  cheongsa_lantern: { side: withTok("cheongsa_lantern", "alt"), back: flipOf("cheongsa_lantern", "back") },
  resolution_scroll: {
    // 왼쪽을 봄: 걸이 기둥 하나(뒤)와 앞으로 뻗은 가로대, 족자는 비스듬히 좁게 (글씨는 먹 점으로)
    side: (g, W, H) => {
      shadeX(g, 10, 1, 2, H - 3, WOOD, 0.4, 0.8);
      shade(g, 4, 0, 9, 2, WOOD, 0.1, 0.6);
      g.set(4, 0, WOOD[0]);
      shade(g, 7, H - 2, 8, 2, WOOD, 0.3, 0.8);
      g.set(6, 2, 0x8a6a4a);
      g.hline(4, 9, 3, WOOD[3]);
      shade(g, 5, 4, 4, H - 9, JADE, 0.1, 0.45);
      shade(g, 6, 6, 2, H - 13, HANJI, 0.0, 0.3);
      for (const y of [9, 11, 14, 17, 21, 23, 26]) g.set(6, y, INK);
      g.set(7, 12, INK);
      g.set(7, 24, INK);
      g.set(7, H - 9, 0xc8362e);
      g.hline(4, 9, H - 5, WOOD[3]);
      g.hline(5, 8, H - 4, WOOD[4]);
      void W;
    },
    // 뒤: 걸이 뒤 + 옥빛 비단 뒷면 (글씨 없이), 위쪽에 제목 쪽지
    back: (g, W, H) => {
      shade(g, 0, 0, W, 2, WOOD, 0.3, 0.7);
      for (const x of [1, W - 2]) shadeX(g, x, 2, 1, H - 4, WOOD, 0.6, 0.6);
      shade(g, 0, H - 2, 4, 2, WOOD, 0.4, 0.8);
      shade(g, W - 4, H - 2, 4, 2, WOOD, 0.4, 0.8);
      g.hline(6, 9, 2, 0x8a6a4a);
      g.hline(3, 12, 3, WOOD[3]);
      shade(g, 3, 4, 10, H - 9, JADE, 0.3, 0.6);
      shade(g, 4, 6, 2, 6, HANJI, 0.0, 0.2); // 제목 쪽지
      g.vline(5, 7, 10, 0x6a6058);
      g.hline(2, 13, H - 5, WOOD[3]);
      g.hline(3, 12, H - 4, WOOD[4]);
    },
  },
};

export const isSeasonArt = (id: string) => id in SEASON_DRAW;
