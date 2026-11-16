import { darken, Grid, hash2, lighten, type Color } from "../sprites/pixel";

// 11/16 바닷가 세트 가구·오두막 바닥·벽 픽셀아트 (game/housing/art.ts가 DRAW·SPIN_ART·UP·FLOOR·PAPER에 끼워 넣어요).
// 포구 그림(game/sea/seaArt.ts)과 같은 결: 원색 없이 한 톤 눌린 파스텔, 단계 사이는 4×4 순서 디더, 테는 검은 선 대신 따뜻한 갈색.
// 모두 네 방향 가구(spin): 앞(DRAW)·왼쪽을 보는 옆모습(side)·뒷모습(back). 오른쪽을 보는 모습은 옆모습을 좌우로 뒤집어요.
// 그림 크기 = (칸 w×16) × (칸 h×16 + 솟는 높이). 옆모습은 가로·세로 칸이 바뀌어요 (3×1 해먹 → 16 × 48+솟음).
// 순수 함수(Grid)라 Phaser 없이 시험해요.

type Draw = (g: Grid, W: number, H: number, v: string) => void;
type SpinArt = { side: Draw; back: Draw };

/** 바닷가 가구 테 (포구 그림의 연한 갈색 테) */
export const SEA_EDGE = 0x5c4a42;
export const SEA_EDGE_A = 150;

const hexes = (a: readonly string[]): readonly Color[] => a.map((h) => parseInt(h.slice(1), 16));
/** 밝은 쪽 → 어두운 쪽 (seaArt RAMP와 같은 색) */
const R = {
  wood: hexes(["#f1d3a6", "#e5c191", "#d6ad7c", "#c39869", "#ae845b"]),
  drift: hexes(["#efe4d2", "#e2d4bd", "#d2c1a6", "#bfac91", "#a8977e"]),
  rattan: hexes(["#f3dcaa", "#e6c68c", "#d4ac70", "#bd925a", "#a27a4a"]),
  aqua: hexes(["#e9f8f4", "#cdf0ec", "#ade6e4", "#8dd9de", "#71c9d8", "#5db5cf"]),
  coral: hexes(["#fbd0c2", "#f4b1a0", "#e8968a", "#d88173"]),
  shell: hexes(["#fff3e6", "#fbe0cc", "#f4c8b0", "#e6ac96", "#d4927e"]),
  brass: hexes(["#f6e2a0", "#e8c878", "#d2aa5a", "#b48c44"]),
  sky: hexes(["#e4f2f8", "#cde6f2", "#b4d8ea", "#9cc8e0", "#86b6d2"]),
} as const;

const B4M = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
/** 단계 고르기 (v 0 밝음 ~ 1 어두움, 단계 사이는 4×4 순서 디더) */
function pick(ramp: readonly Color[], v: number, x: number, y: number): Color {
  const n = ramp.length - 1;
  const f = Math.max(0, Math.min(n, v * n));
  const i = Math.floor(f);
  return ramp[Math.min(n, i + (f - i > B4M[((y & 3) << 2) | (x & 3)] ? 1 : 0))];
}
/** 사각형을 위 밝음 → 아래 어두움으로 칠한다 (v0 → v1) */
function shade(g: Grid, x: number, y: number, w: number, h: number, ramp: readonly Color[], v0: number, v1: number): void {
  for (let j = 0; j < h; j++) {
    const v = h <= 1 ? v0 : v0 + ((v1 - v0) * j) / (h - 1);
    for (let i = 0; i < w; i++) g.set(x + i, y + j, pick(ramp, v, x + i, y + j));
  }
}
/** 타원을 왼쪽 위 빛으로 칠한다 */
function orb(g: Grid, cx: number, cy: number, rx: number, ry: number, ramp: readonly Color[], base = 0.35, span = 0.55): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / Math.max(0.5, rx);
      const dy = (y - cy) / Math.max(0.5, ry);
      if (dx * dx + dy * dy > 1) continue;
      g.set(x, y, pick(ramp, base + span * ((dx + dy) / 2.6 + 0.2), x, y));
    }
}
/** 아랫변 발밑 그림자 한 줄 */
const foot = (g: Grid, x0: number, x1: number, y: number) => {
  for (let x = x0; x <= x1; x++) g.set(x, y, 0x8a7868, 120);
};
const has = (v: string, part: string) => v.split("-").includes(part);

// ── 솟는 높이 (px) ──
export const SEA_UP: Record<string, number> = {
  sea_hammock: 12,
  rattan_chair: 8,
  rattan_bench: 8,
  surfboard: 22,
  shell_decor: 10,
  life_ring: 10,
  sea_lantern: 12,
  ship_wheel: 14,
};

// ── 해먹 ── 기둥 둘 + 늘어진 줄무늬 천 (산호·크림·민트)
const STRIPES: readonly (readonly Color[])[] = [R.coral, R.shell, R.aqua];
// 말뚝 색 (seaArt trunk)
const TRUNK = hexes(["#c99a6b", "#a97b52", "#8b6142"]);
function postT(g: Grid, x: number, y0: number, y1: number): void {
  shade(g, x, y0, 3, y1 - y0 + 1, TRUNK, 0.15, 0.85);
  g.hline(x, x + 2, y0, lighten(TRUNK[0], 0.25));
}

/**
 * 가로로 걸린 해먹 (앞·뒤). back이면 바깥면이라 한 단계 어둡게.
 * posts = 기둥만 (누가 누운 동안 — 줄·천·몸은 마을 해먹과 같은 누운 사람 그림이 그린다, sprites/hammockArt)
 */
function hammockLong(g: Grid, W: number, H: number, back: boolean, posts = false): void {
  const top = 2;
  const L = 2;
  const Rx = W - 5;
  postT(g, L, top, H - 3);
  postT(g, Rx, top, H - 3);
  foot(g, L - 1, L + 3, H - 1);
  foot(g, Rx - 1, Rx + 3, H - 1);
  if (posts) return;
  // 줄 (기둥 꼭대기 → 천 끝)
  const a = L + 3;
  const b = Rx - 1;
  const sag = (x: number) => 9 + 7 * Math.sin(((x - a) / (b - a)) * Math.PI);
  for (let x = a; x <= a + 4; x++) g.set(x, top + 2 + Math.round(((x - a) / 4) * 6), 0xd8c8a8);
  for (let x = b - 4; x <= b; x++) g.set(x, top + 2 + Math.round(((b - x) / 4) * 6), 0xd8c8a8);
  // 천 (윗줄 ~ 아랫줄, 세로 줄무늬)
  for (let x = a + 4; x <= b - 4; x++) {
    const y0 = Math.round(sag(x) - 1);
    const y1 = Math.round(sag(x) + 4 + 2 * Math.sin(((x - a) / (b - a)) * Math.PI));
    const ramp = STRIPES[Math.floor((x - a) / 4) % 3];
    for (let y = y0; y <= y1; y++) g.set(x, y, pick(ramp, (back ? 0.45 : 0.15) + ((y - y0) / Math.max(1, y1 - y0)) * 0.6, x, y));
    g.set(x, y0, back ? pick(ramp, 0.6, x, y0) : lighten(pick(ramp, 0.05, x, y0), 0.2));
  }
  // 천 아래 그림자
  for (let x = a + 8; x <= b - 8; x++) g.set(x, H - 2, 0x8a7868, 70);
  // 술 장식
  if (!back) for (let x = a + 6; x <= b - 6; x += 3) g.set(x, Math.round(sag(x) + 6 + 2 * Math.sin(((x - a) / (b - a)) * Math.PI)), 0xf6efe2);
}

/** 세로로 걸린 해먹 (옆모습: 위·아래 기둥, 천은 좁은 띠) */
function hammockSide(g: Grid, W: number, H: number, posts = false): void {
  postT(g, 6, 0, 15);
  postT(g, 6, H - 16, H - 2);
  foot(g, 5, 9, H - 1);
  if (posts) return;
  const a = 14;
  const b = H - 17;
  for (let y = a; y <= b; y++) {
    const bulge = Math.round(2 * Math.sin(((y - a) / (b - a)) * Math.PI));
    const x0 = 4 - bulge;
    const x1 = 11 + bulge;
    const ramp = STRIPES[Math.floor((y - a) / 4) % 3];
    for (let x = x0; x <= x1; x++) g.set(x, y, pick(ramp, 0.15 + ((x - x0) / Math.max(1, x1 - x0)) * 0.6, x, y));
  }
  // 줄
  g.vline(7, 12, a, 0xd8c8a8);
  g.vline(7, b, b + 4, 0xd8c8a8);
  for (let y = a + 4; y < b; y += 6) g.set(13, y, 0x8a7868, 90);
}

// ── 라탄 의자·벤치 ── 엮은 결(체크 디더) + 하늘빛 방석
function weave(g: Grid, x: number, y: number, w: number, h: number, v0: number, v1: number): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const v = v0 + ((v1 - v0) * j) / Math.max(1, h - 1) + (((i + j) >> 1) % 2 ? 0.12 : 0);
      g.set(x + i, y + j, pick(R.rattan, v, x + i, y + j));
    }
}
function cushion(g: Grid, x: number, y: number, w: number, h: number): void {
  shade(g, x, y, w, h, R.aqua, 0.2, 0.75);
  g.hline(x + 1, x + w - 2, y, lighten(R.aqua[0], 0.1));
}
function rattanLegs(g: Grid, xs: number[], y0: number, H: number): void {
  for (const x of xs) g.vline(x, y0, H - 1, R.rattan[4]);
}

// ── 서핑보드 ── 하늘색 보드 + 흰 줄 + 산호 끝 + 핀
function board(g: Grid, cx: number, top: number, bottom: number, half: number, under: boolean): void {
  const mid = (top + bottom) / 2;
  for (let y = top; y <= bottom; y++) {
    const t = (y - mid) / ((bottom - top) / 2);
    const w = Math.max(0, half * Math.sqrt(Math.max(0, 1 - t * t)));
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
      const v = (under ? 0.45 : 0.1) + ((x - (cx - w)) / Math.max(1, 2 * w)) * 0.5;
      g.set(x, y, pick(R.sky, v, x, y));
    }
  }
  if (!under) {
    g.vline(Math.round(cx), top + 3, bottom - 3, 0xfffcf6);
    for (let y = top + 1; y <= top + 4; y++) {
      const t = (y - mid) / ((bottom - top) / 2);
      const w = Math.round(half * Math.sqrt(Math.max(0, 1 - t * t)));
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) g.set(x, y, pick(R.coral, 0.3, x, y));
    }
  } else {
    // 밑면 핀
    g.rect(Math.round(cx) - 1, bottom - 7, 2, 4, R.coral[3]);
    g.vline(Math.round(cx), top + 2, bottom - 8, pick(R.sky, 0.7, 0, 0));
  }
}

// ── 소라 장식 ── 유목 받침 + 큰 소라
function driftBase(g: Grid, x: number, y: number, w: number): void {
  shade(g, x, y, w, 4, R.drift, 0.2, 0.8);
  g.set(x + 2, y + 1, R.drift[4]);
  g.set(x + w - 4, y + 2, R.drift[4]);
}
/** 회전한 타원 안인지 (a = 라디안). 안이면 중심에서 거리 비율(0..1), 밖이면 -1 */
function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, a: number): number {
  const dx = x - cx;
  const dy = y - cy;
  const u = (dx * Math.cos(a) + dy * Math.sin(a)) / rx;
  const v = (-dx * Math.sin(a) + dy * Math.cos(a)) / ry;
  const d = u * u + v * v;
  return d <= 1 ? Math.sqrt(d) : -1;
}

/** 진주빛 소라 색 (밝음 → 어두움): 크림 · 연분홍 · 살구 · 모래갈색 */
const CONCH = hexes(["#fffaf2", "#fbeadb", "#f6d3c0", "#e9b49e", "#cf9580", "#a8705e"]);
const CONCH_LIP = hexes(["#fff1ea", "#fcd2c8", "#f4a9a0", "#e08880", "#bf6a66"]);

/**
 * 11/16 소라 픽셀 지도 (손으로 찍은 그림 — 1배에서도 소라로 읽히게).
 * a~f = 진주빛 몸 (밝음 → 어두움, e = 나선 골), w = 반짝, L~P = 입구 (크림 입술 → 깊은 분홍)
 * 앞: 몸은 왼쪽 아래, 꼭지는 오른쪽 위로 세 단 (단마다 아래에 골), 입구가 왼쪽에 크게 벌어진다. 수관은 왼쪽 아래로
 */
const CONCH_FRONT = [
  "............ab.",
  "..........abbce",
  "..........eeed.",
  "........abbbcd.",
  "......abwbbccd.",
  "......eeeeeedd.",
  "...LLabwbbbccdd",
  "..LMNbbbbbcccdd",
  ".LMNOcbbbccccde",
  ".LMOPcbbcccdde.",
  "..LNOdccdddde..",
  ".ddLMdde.......",
  "dd.............",
];
/** 옆: 꼭지가 위로 선 모습 (입구는 왼쪽 가장자리의 분홍 틈) */
const CONCH_SIDE = [
  ".....ab.....",
  "....abce....",
  "....eeee....",
  "...abbcde...",
  "..abwbccde..",
  "..eeeeeeee..",
  ".abwbbbccde.",
  ".Mbbbbcccde.",
  ".Nbbbbcccdd.",
  ".Obbbcccdde.",
  "..Mcccddde..",
  "...cddde....",
  "....dd......",
  ".....d......",
];
/** 뒤: 앞을 돌려 본 모습 (꼭지는 왼쪽 위, 입구 대신 몸을 감는 골) */
const CONCH_BACK = CONCH_FRONT.map((row, y) =>
  [...row]
    .reverse()
    .map((c) => ({ L: "b", M: "c", N: y === 8 ? "e" : "c", O: "d", P: "d" })[c as "L"] ?? c)
    .join(""),
);
const CONCH_KEY: Record<string, Color> = {
  w: 0xffffff,
  a: CONCH[0],
  b: CONCH[1],
  c: CONCH[3],
  d: CONCH[4],
  e: CONCH[5],
  f: CONCH[5],
  L: CONCH_LIP[1],
  M: CONCH_LIP[2],
  N: CONCH_LIP[3],
  O: CONCH_LIP[4],
  P: 0x9c4a4e,
};

/** 소라 하나 (map의 왼쪽 위 = x, y). 몸 칸은 디더로 이웃 단계와 살짝 섞는다 (진주빛 결) */
function conch(g: Grid, x: number, y: number, map: readonly string[]): void {
  map.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      const c = CONCH_KEY[ch];
      if (c === undefined) return;
      // 몸 칸은 그 단계와 다음 단계를 디더로 (진주빛 결)
      const k = { a: 0, b: 1, c: 3, d: 4 }[ch as "a"];
      g.set(x + i, y + j, k !== undefined ? pick(CONCH, (k + 0.35) / 5, x + i, y + j) : c);
    }),
  );
}

/** 작은 불가사리 (5갈래, 산호색) */
function starfish(g: Grid, cx: number, cy: number): void {
  const arms = [
    [0, -2],
    [2, -1],
    [1, 2],
    [-1, 2],
    [-2, -1],
  ];
  g.set(cx, cy, R.coral[1]);
  for (const [dx, dy] of arms) {
    g.set(cx + Math.sign(dx), cy + Math.sign(dy), R.coral[2]);
    g.set(cx + dx, cy + dy, R.coral[3]);
  }
  g.set(cx, cy - 1, R.shell[0]);
}

/** 조약돌 (회청색 둥근 돌, 위 밝음) */
function pebble(g: Grid, x: number, y: number, w: number): void {
  const ramp = hexes(["#dfe6ea", "#c2ccd3", "#a3afb9", "#86929d"]);
  for (let i = 0; i < w; i++) {
    g.set(x + i, y, pick(ramp, 0.15 + (i / w) * 0.3, x + i, y));
    g.set(x + i, y + 1, pick(ramp, 0.6 + (i / w) * 0.3, x + i, y + 1));
  }
}

/** 소라 장식 한 벌: 유목 받침 + 소라 + 불가사리·조약돌 (view: 소라 방향) */
function shellDecor(g: Grid, H: number, view: "front" | "side" | "back"): void {
  driftBase(g, 1, H - 5, 14);
  // 소라는 받침 위에 (앞·뒤는 비스듬히 누워, 옆은 꼭지를 세워) · 받침 앞에 불가사리, 옆에 조약돌
  if (view === "front") {
    conch(g, 0, H - 17, CONCH_FRONT);
    pebble(g, 12, H - 7, 3);
    starfish(g, 12, H - 3);
  } else if (view === "back") {
    conch(g, 1, H - 17, CONCH_BACK);
    pebble(g, 1, H - 7, 3);
    starfish(g, 3, H - 3);
  } else {
    conch(g, 2, H - 18, CONCH_SIDE);
    pebble(g, 12, H - 7, 3);
    starfish(g, 3, H - 3);
  }
}

// ── 구명 튜브 ── 말뚝에 건 빨강·하양 고리 (empty = 튜브를 낀 동안 빈 말뚝)
function ringFace(g: Grid, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r || d < r * 0.48) continue;
      const ang = Math.atan2(y - cy, x - cx);
      const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2;
      const ramp = seg ? R.coral : R.shell;
      g.set(x, y, pick(ramp, 0.05 + ((x - cx + y - cy) / (2 * r) + 0.5) * 0.55, x, y));
    }
  // 줄 감기
  g.set(Math.round(cx - r + 1), Math.round(cy), 0xf6efe2);
  g.set(Math.round(cx + r - 1), Math.round(cy), 0xf6efe2);
}
function ringEdge(g: Grid, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    const seg = Math.floor((y - cy + r) / 3) % 2;
    for (let x = cx - 1; x <= cx + 1; x++) g.set(x, y, pick(seg ? R.coral : R.shell, 0.2 + (x - cx + 1) * 0.2, x, y));
  }
}
function ringPost(g: Grid, x: number, H: number): void {
  postT(g, x, 2, H - 3);
  foot(g, x - 1, x + 3, H - 1);
  g.rect(x - 1, 2, 5, 2, TRUNK[0]); // 말뚝 머리
}

// ── 뱃등 ── 나무 상자 받침 + 놋쇠 등 (off = 꺼짐: 유리가 어둡다)
function lanternBody(g: Grid, cx: number, top: number, lit: boolean, side: boolean): void {
  const hw = side ? 3 : 4;
  // 고리·뚜껑
  g.rect(cx - 1, top, 2, 2, R.brass[3]);
  shade(g, cx - hw, top + 2, hw * 2, 2, R.brass, 0.1, 0.6);
  // 유리
  for (let y = top + 4; y < top + 11; y++)
    for (let x = cx - hw + 1; x < cx + hw - 1; x++) g.set(x, y, lit ? pick(hexes(["#fff6d6", "#ffe6a8", "#ffd08a"]), (y - top - 4) / 7, x, y) : pick(hexes(["#5a6a78", "#4a5866", "#3c4856"]), (y - top - 4) / 7, x, y));
  // 놋쇠 살
  g.vline(cx - hw, top + 4, top + 10, R.brass[2]);
  g.vline(cx + hw - 1, top + 4, top + 10, R.brass[3]);
  if (!side) g.vline(cx - 1, top + 4, top + 10, R.brass[2]);
  if (lit) g.set(cx, top + 7, 0xffffff);
  shade(g, cx - hw, top + 11, hw * 2, 2, R.brass, 0.3, 0.8);
}
function crate(g: Grid, x: number, y: number, w: number, h: number, darker = 0): void {
  shade(g, x, y, w, h, R.wood, 0.2 + darker, 0.85);
  g.hline(x, x + w - 1, y, lighten(R.wood[0], 0.2));
  g.hline(x, x + w - 1, y + Math.floor(h / 2), R.wood[4]);
}

// ── 조타륜 ── 받침 기둥 + 바퀴 (turn = 살이 반 칸 돌아간 장면)
function wheelFace(g: Grid, cx: number, cy: number, r: number, turned: boolean, back: boolean): void {
  // 손잡이 살 8개
  const off = turned ? Math.PI / 8 : 0;
  for (let k = 0; k < 8; k++) {
    const a = off + (k * Math.PI) / 4;
    for (let t = 0; t <= r + 2; t++) g.set(Math.round(cx + Math.cos(a) * t), Math.round(cy + Math.sin(a) * t), t > r ? R.wood[1] : R.wood[back ? 4 : 3]);
  }
  // 테
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    g.set(x, y, pick(R.wood, back ? 0.6 : 0.25 + (Math.sin(a) + 1) * 0.25, x, y));
    g.set(Math.round(cx + Math.cos(a) * (r - 1)), Math.round(cy + Math.sin(a) * (r - 1)), pick(R.wood, back ? 0.75 : 0.45, x, y));
  }
  orb(g, cx, cy, 1.6, 1.6, R.brass, 0.1, 0.4);
}

export const SEA_DRAW: Record<string, Draw> = {
  sea_hammock: (g, W, H, v) => hammockLong(g, W, H, false, has(v, "lie")),
  rattan_chair: (g, _W, H) => {
    // 둥근 등받이 (부채꼴)
    for (let y = 0; y < 10; y++)
      for (let x = 1; x < 15; x++) {
        const d = Math.hypot((x - 7.5) / 7, (y - 9) / 9);
        if (d <= 1 && d >= 0.55) g.set(x, y, pick(R.rattan, 0.15 + d * 0.4 + (((x + y) >> 1) % 2 ? 0.1 : 0), x, y));
      }
    weave(g, 2, 9, 12, 5, 0.1, 0.5);
    cushion(g, 3, 9, 10, 3);
    rattanLegs(g, [3, 12], 14, H);
    foot(g, 2, 13, H - 1);
  },
  rattan_bench: (g, W, H) => {
    weave(g, 1, 0, W - 2, 8, 0.05, 0.45);
    g.hline(1, W - 2, 0, lighten(R.rattan[0], 0.15));
    weave(g, 1, 8, W - 2, 6, 0.15, 0.6);
    cushion(g, 3, 8, W / 2 - 4, 3);
    cushion(g, W / 2 + 1, 8, W / 2 - 4, 3);
    rattanLegs(g, [2, W / 2, W - 3], 14, H);
    foot(g, 1, W - 2, H - 1);
  },
  surfboard: (g, _W, H) => {
    board(g, 8, 0, H - 3, 5, false);
    foot(g, 3, 12, H - 1);
    g.rect(6, H - 3, 4, 2, R.wood[3]); // 받침목
  },
  shell_decor: (g, _W, H) => shellDecor(g, H, "front"),
  life_ring: (g, _W, H, v) => {
    ringPost(g, 7, H);
    if (!has(v, "empty")) ringFace(g, 8, H - 13, 6.5);
  },
  sea_lantern: (g, _W, H, v) => {
    crate(g, 2, H - 8, 12, 7);
    lanternBody(g, 8, H - 22, !has(v, "off"), false);
    foot(g, 2, 13, H - 1);
  },
  ship_wheel: (g, _W, H, v) => {
    g.rect(6, H - 12, 4, 10, TRUNK[1]);
    g.vline(6, H - 12, H - 3, TRUNK[0]);
    crate(g, 3, H - 4, 10, 3);
    wheelFace(g, 8, H - 18, 6, has(v, "turn"), false);
    foot(g, 3, 12, H - 1);
  },
};

export const SEA_SPIN: Record<string, SpinArt> = {
  sea_hammock: {
    side: (g, W, H, v) => hammockSide(g, W, H, has(v, "lie")),
    back: (g, W, H, v) => hammockLong(g, W, H, true, has(v, "lie")),
  },
  rattan_chair: {
    // 왼쪽을 봄: 앉는 판이 왼쪽, 둥근 등받이가 오른쪽에 선다
    side: (g, _W, H) => {
      for (let y = 0; y < 14; y++)
        for (let x = 9; x < 14; x++) {
          const d = Math.hypot((x - 13) / 4, (y - 13) / 13);
          if (d <= 1 && d >= 0.45) g.set(x, y, pick(R.rattan, 0.2 + d * 0.4 + (((x + y) >> 1) % 2 ? 0.1 : 0), x, y));
        }
      weave(g, 2, 9, 11, 5, 0.1, 0.55);
      cushion(g, 2, 9, 9, 3);
      rattanLegs(g, [3, 11], 14, H);
      foot(g, 2, 12, H - 1);
    },
    // 뒤: 엮은 등받이 뒷면이 앞에 선다
    back: (g, _W, H) => {
      cushion(g, 3, 4, 10, 3);
      for (let y = 0; y < 15; y++)
        for (let x = 1; x < 15; x++) {
          const d = Math.hypot((x - 7.5) / 7, (y - 14) / 14);
          if (d <= 1 && d >= 0.3 && y > 3) g.set(x, y, pick(R.rattan, 0.3 + d * 0.4 + (((x + y) >> 1) % 2 ? 0.12 : 0), x, y));
        }
      rattanLegs(g, [3, 12], 15, H);
      foot(g, 2, 13, H - 1);
    },
  },
  rattan_bench: {
    // 왼쪽을 봄 (세로로 긴 벤치): 오른쪽에 등받이, 왼쪽에 앉는 판 둘
    side: (g, _W, H) => {
      weave(g, 10, 0, 4, H - 3, 0.1, 0.5);
      weave(g, 2, 8, 9, H - 11, 0.15, 0.55);
      cushion(g, 2, 9, 8, 12);
      cushion(g, 2, 24, 8, 12);
      rattanLegs(g, [3, 12], H - 3, H);
      foot(g, 2, 13, H - 1);
    },
    // 뒤: 등받이 뒷면이 앞에, 방석은 뒤로 살짝
    back: (g, W, H) => {
      cushion(g, 3, 3, W / 2 - 4, 3);
      cushion(g, W / 2 + 1, 3, W / 2 - 4, 3);
      weave(g, 1, 5, W - 2, 10, 0.3, 0.7);
      g.hline(1, W - 2, 5, R.rattan[1]);
      rattanLegs(g, [2, W / 2, W - 3], 15, H);
      foot(g, 1, W - 2, H - 1);
    },
  },
  surfboard: {
    // 옆: 날을 세운 보드 (얇은 띠) + 핀
    side: (g, _W, H) => {
      for (let y = 1; y < H - 3; y++) {
        const t = Math.abs((y - H / 2) / (H / 2));
        const w = t > 0.85 ? 1 : 2;
        for (let x = 7; x < 7 + w; x++) g.set(x, y, pick(R.sky, 0.2 + (x - 7) * 0.3, x, y));
        g.set(9 - (w === 1 ? 1 : 0), y, 0xfffcf6);
      }
      g.rect(4, H - 9, 3, 3, R.coral[3]); // 핀이 왼쪽으로
      for (let y = 1; y < 5; y++) g.set(7, y, R.coral[1]);
      g.rect(5, H - 3, 6, 2, R.wood[3]);
      foot(g, 4, 11, H - 1);
    },
    back: (g, _W, H) => {
      board(g, 8, 0, H - 3, 5, true);
      g.rect(6, H - 3, 4, 2, R.wood[3]);
      foot(g, 3, 12, H - 1);
    },
  },
  shell_decor: {
    side: (g, _W, H) => shellDecor(g, H, "side"),
    // 뒤: 꼭지가 왼쪽 위 (앞을 돌려 본 모습) — 입구는 안 보이고 나선 골만
    back: (g, _W, H) => shellDecor(g, H, "back"),
  },
  life_ring: {
    // 옆: 고리가 날을 보이고 말뚝 왼쪽에 걸려 있다
    side: (g, _W, H, v) => {
      ringPost(g, 8, H);
      if (!has(v, "empty")) ringEdge(g, 6, H - 13, 6);
    },
    // 뒤: 말뚝이 앞, 고리는 말뚝 뒤로 보인다
    back: (g, _W, H, v) => {
      if (!has(v, "empty")) ringFace(g, 8, H - 13, 6.5);
      ringPost(g, 7, H);
    },
  },
  sea_lantern: {
    side: (g, _W, H, v) => {
      crate(g, 3, H - 8, 10, 7, 0.1);
      lanternBody(g, 8, H - 22, !has(v, "off"), true);
      foot(g, 3, 12, H - 1);
    },
    back: (g, _W, H, v) => {
      crate(g, 2, H - 8, 12, 7, 0.2);
      lanternBody(g, 8, H - 22, !has(v, "off"), false);
      // 뒤 살이 하나 더 보인다
      g.vline(5, H - 18, H - 12, R.brass[3]);
      foot(g, 2, 13, H - 1);
    },
  },
  ship_wheel: {
    // 옆: 바퀴가 날을 보인다 (세로 막대 + 손잡이가 위·아래로)
    side: (g, _W, H, v) => {
      g.rect(7, H - 12, 4, 10, TRUNK[1]);
      crate(g, 3, H - 4, 10, 3);
      const turned = has(v, "turn");
      for (let y = H - 26; y <= H - 10; y++) g.set(5, y, pick(R.wood, 0.3 + ((y - H + 26) / 16) * 0.5, 5, y));
      for (const y of turned ? [H - 27, H - 21, H - 15, H - 9] : [H - 28, H - 18, H - 8]) {
        g.set(4, y, R.wood[1]);
        g.set(5, y, R.wood[2]);
      }
      g.hline(5, 8, H - 18, R.brass[2]); // 굴대
      foot(g, 3, 12, H - 1);
    },
    back: (g, _W, H, v) => {
      wheelFace(g, 8, H - 18, 6, has(v, "turn"), true);
      g.rect(6, H - 14, 4, 12, TRUNK[1]);
      g.vline(6, H - 14, H - 3, TRUNK[0]);
      crate(g, 3, H - 4, 10, 3, 0.15);
      foot(g, 3, 12, H - 1);
    },
  },
};

// ── 바닥·벽 (16×16 바닥 타일, 16×40 벽 타일) ──

type Tile = (g: Grid, v: number) => void;

export const SEA_FLOORS: Record<string, Tile> = {
  // 갑판 마루: 바닷바람에 바랜 옅은 널 4줄, 이음매 엇갈림, 잔 결
  floor_deck: (g, v) => {
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const tone = 0.15 + ((row * 3 + v) % 4) * 0.08;
      for (let j = 0; j < 3; j++) for (let x = 0; x < 16; x++) g.set(x, y + j, pick(R.drift, tone + j * 0.05 + hash2(x, y + j, v) * 0.12, x, y + j));
      g.hline(0, 15, y + 3, R.drift[4]);
      const seam = (row * 7 + v * 5) % 16;
      g.vline(seam, y, y + 2, R.drift[4]);
      g.hline((seam + 4) % 16, (seam + 7) % 16, y + 1, lighten(R.drift[0], 0.3));
    }
  },
  // 11/16 모래빛 타일: 옅은 모래색 8칸 타일 + 줄눈, 가끔 작은 조개 무늬
  floor_sand: (g, v) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) g.set(x, y, pick(R.shell, 0.05 + hash2(x, y, v + 3) * 0.25 + (((x >> 3) + (y >> 3) + v) % 2) * 0.12, x, y));
    g.hline(0, 15, 0, R.shell[3]);
    g.vline(0, 0, 15, R.shell[3]);
    g.hline(0, 15, 8, R.shell[2]);
    g.vline(8, 0, 15, R.shell[2]);
    if (v % 2 === 0) {
      const cx = 3 + v * 2;
      g.set(cx, 4, R.coral[2]);
      g.set(cx + 1, 4, R.coral[1]);
      g.set(cx, 5, R.coral[1]);
    }
  },
  // 11/16 물빛 모자이크: 하늘·청록 작은 조각 (욕실 타일 느낌)
  floor_mosaic: (g, v) => {
    for (let y = 0; y < 16; y += 4)
      for (let x = 0; x < 16; x += 4) {
        const t = hash2(x + v * 5, y, 9);
        const ramp = t > 0.6 ? R.aqua : R.sky;
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) g.set(x + i, y + j, pick(ramp, 0.15 + t * 0.4 + j * 0.05, x + i, y + j));
        g.hline(x, x + 3, y + 3, 0xf4f6f2);
        g.vline(x + 3, y, y + 3, 0xf4f6f2);
      }
  },
};

const PAPER_Y0 = 6;
const PAPER_Y1 = 40 - 6;

export const SEA_PAPERS: Record<string, Tile> = {
  // 하늘색 판자 벽: 세로 판자 + 아래 흰 징두리, 판자마다 옅은 결
  wall_sea: (g, v) => {
    for (let x = 0; x < 16; x += 4) {
      const t = ((x / 4 + v) % 2) * 0.12;
      for (let y = PAPER_Y0; y <= PAPER_Y1; y++) for (let i = 0; i < 3; i++) g.set(x + i, y, pick(R.sky, 0.1 + t + ((y - PAPER_Y0) / (PAPER_Y1 - PAPER_Y0)) * 0.35, x + i, y));
      g.vline(x + 3, PAPER_Y0, PAPER_Y1, R.sky[4]);
    }
    // 흰 징두리
    for (let y = PAPER_Y1 - 8; y <= PAPER_Y1; y++) for (let x = 0; x < 16; x++) g.set(x, y, pick(hexes(["#fffaf2", "#f7eedf", "#ecdfca"]), (y - PAPER_Y1 + 8) / 9, x, y));
    g.hline(0, 15, PAPER_Y1 - 9, R.sky[4]);
    if (v % 2) g.set(6, 14 + v * 2, R.sky[4]);
  },
  // 11/16 조개 벽지: 크림 바탕에 작은 조개·불가사리가 흩어진 벽지
  wall_shell: (g, v) => {
    for (let y = PAPER_Y0; y <= PAPER_Y1; y++) for (let x = 0; x < 16; x++) g.set(x, y, pick(R.shell, 0.02 + ((y - PAPER_Y0) / (PAPER_Y1 - PAPER_Y0)) * 0.18, x, y));
    for (let y = PAPER_Y0 + 4; y < PAPER_Y1 - 2; y += 9) {
      const x = ((y - PAPER_Y0) / 9) % 2 ? 11 : 3 + (v % 2);
      g.set(x, y, R.coral[2]);
      g.set(x - 1, y + 1, R.coral[1]);
      g.set(x + 1, y + 1, R.coral[1]);
      g.set(x, y + 1, R.coral[3]);
      g.set(x + 5, y + 4, R.aqua[4]);
    }
  },
  // 11/16 유목 판자 벽: 바랜 회갈색 가로 널 (오래된 배 창고처럼)
  wall_driftwood: (g, v) => {
    for (let y = PAPER_Y0; y <= PAPER_Y1; y++) {
      const row = Math.floor((y - PAPER_Y0) / 5);
      for (let x = 0; x < 16; x++) g.set(x, y, pick(R.drift, 0.25 + ((row + v) % 3) * 0.15 + hash2(x, row, v) * 0.1, x, y));
      if ((y - PAPER_Y0) % 5 === 4) g.hline(0, 15, y, R.drift[4]);
    }
    g.vline((v * 5 + 3) % 16, PAPER_Y0, PAPER_Y0 + 4, R.drift[4]);
  },
};

/** 하늘색 판자 벽의 옆벽 윗면 색 */
export const SEA_WALL_CAP: Record<string, Color> = { wall_sea: 0x4e6a7c, wall_shell: 0x6a5048, wall_driftwood: 0x4a4038 };

/** 바닷가 세트 가구인지 (테를 연한 갈색으로) */
export const isSeaArt = (id: string) => id in SEA_DRAW;

/** 구명 튜브를 낀 사람 허리에 두르는 고리 그림 (가로 14 × 6) */
export function wornRingGrid(): Grid {
  const g = new Grid(14, 6);
  for (let x = 0; x < 14; x++)
    for (let y = 0; y < 6; y++) {
      const dx = (x - 6.5) / 7;
      const dy = (y - 2.5) / 3;
      const d = dx * dx + dy * dy;
      if (d > 1 || (d < 0.3 && y < 3)) continue;
      const seg = Math.floor(x / 3.5) % 2;
      g.set(x, y, seg ? (y > 2 ? darken(R.coral[2], 0.08) : R.coral[1]) : y > 2 ? R.shell[2] : R.shell[0]);
    }
  g.outline(SEA_EDGE, false, SEA_EDGE_A);
  return g;
}
