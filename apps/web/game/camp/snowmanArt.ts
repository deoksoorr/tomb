import { darken, Grid, hash2, lighten, mix, rng, type Color } from "../sprites/pixel";
import { SNOW } from "../sprites/winterArt";

// 11/17 캠핑장 「눈사람 만들기」 그림 (겨울·크리스마스 판에서만 쓴다). 순수 Grid라 Phaser·DOM 없이 테스트한다.
//  - 눈더미(집는 곳): 소복한 눈 둔덕 + 퍼 간 자국 + 꽂아 둔 꼬마 삽·뒤집은 양동이
//  - 눈덩이 세 크기(머리·배·몸통): 굴러가는 4프레임(가로·세로), 바닥에 내려놓은 덩이, 1단·2단 쌓은 모습, 굴린 자국
//  - 완성 눈사람: 씨앗(seed)으로 얼굴·모자·목도리·팔·코·단추를 고른다 (모두에게 같은 모습). 녹는 단계 0~3, 물웅덩이
// 원점 = 바닥 가운데 (0.5, 1), 맨 아래 줄 근처는 그림자 (캠핑장 소품과 같은 규칙). 크기는 플레이어(20×28)에 맞춘다.

/** 눈 윤곽 (winterArt 눈사람과 같은 차가운 회청색 — 눈밭 위에서도 모양이 보이게) */
const EDGE = 0x55606c;
const COAL = 0x22262c;
const CARROT = { hi: 0xf29a4a, mid: 0xe8762a, lo: 0xc85a1a } as const;
const TWIG = { hi: 0x7a5a40, mid: 0x5a4232 } as const;
const WATER = { deep: 0x5a7c9c, mid: 0x86a6c2, hi: 0xc8dcec } as const;
const BLUSH = 0xf0a0a8;

// ── 크기 ──

/** 눈덩이 크기 단계: 0 머리(작음) · 1 배(중간) · 2 몸통(큼) */
export type BallSize = 0 | 1 | 2;
export const BALL_SIZES: readonly BallSize[] = [0, 1, 2];
/** 크기별 반지름 (px). 세로는 살짝 눌려 있다 (BALL_SQUASH) */
export const BALL_R: Readonly<Record<BallSize, number>> = { 0: 5.4, 1: 6.6, 2: 8.4 };
const BALL_SQUASH = 0.9;
/** 크기별 이름 (안내 문구) */
export const BALL_NAME: Readonly<Record<BallSize, string>> = { 0: "머리", 1: "배", 2: "몸통" };

/** 눈덩이 그림 한 장 크기 (그림자 포함) */
export function ballFrameSize(s: BallSize): { w: number; h: number } {
  const r = BALL_R[s];
  return { w: Math.ceil(r * 2) + 4, h: Math.ceil(r * 2 * BALL_SQUASH) + 5 };
}
/** 굴러가는 프레임 수 (가로·세로 따로) */
export const BALL_ROLL_FRAMES = 4;

/** 쌓을 때 위 덩이가 아래 덩이에 묻히는 깊이 (px) */
const STACK_SINK = 2.4;

// ── 공용 ──

function shadowEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64, c: Color = 0x30486a): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, c, a);
    }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
}

/**
 * 눈덩이 하나를 칠한다 (외곽선 없이). 빛은 왼쪽 위, 그늘은 오른쪽 아래·아래 둘레 — 구처럼 보이게 둥근 명암 4단.
 * 다른 덩이 위에 칠할 때 그 덩이 픽셀만 덮는다 (겹친 부분은 위 덩이가 이긴다)
 */
function snowBall(g: Grid, cx: number, cy: number, rx: number, ry: number, seed = 0): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      // 빛 방향 (왼쪽 위) 쪽으로 얼마나 향했는지
      const lit = -dx * 0.55 - dy * 0.75 + (1 - d) * 0.35;
      const n = (hash2(x, y, 6101 + seed) - 0.5) * 0.12;
      const t = lit + n;
      let c: Color;
      if (t > 0.5) c = SNOW.hi;
      else if (t > -0.05) c = SNOW.mid;
      else if (t > -0.45) c = SNOW.lo;
      else c = SNOW.shade;
      // 맨 아래 둘레는 더 짙은 그늘 (바닥에 닿은 쪽)
      if (dy > 0.55 && d > 0.72) c = SNOW.deep;
      g.set(x, y, c);
    }
}

/** 둥근 눈 위 작은 반짝임 (빛 쪽 한두 점) */
function glint(g: Grid, cx: number, cy: number, r: number): void {
  const x = Math.round(cx - r * 0.45);
  const y = Math.round(cy - r * 0.5);
  if (g.filled(x, y)) g.set(x, y, 0xffffff);
  if (r > 5 && g.filled(x + 1, y - 1)) g.set(x + 1, y - 1, 0xffffff);
}

/** 위 덩이가 얹힌 자리: 아래 덩이 윗면에 눌린 그늘 한 줄 */
function seam(g: Grid, cx: number, y: number, rx: number): void {
  for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) if (g.filled(x, y)) g.set(x, y, SNOW.shade);
}

// ── 눈더미 (집는 곳) ──

export const SNOW_PILE_W = 34;
export const SNOW_PILE_H = 30;
/** 눈더미 모양 수 (꽂힌 도구: 빨간 삽·파란 삽·초록 양동이) */
export const SNOW_PILE_VARIANTS = 3;

/** 눈더미 (34×30, 원점 바닥 가운데). 소복한 둔덕 꼭대기가 퍼 간 듯 움푹하고 꼬마 삽이 꽂혀 있다 → "여기서 눈을 퍼요" */
export function snowPileArt(v: number): Grid {
  const g = new Grid(SNOW_PILE_W, SNOW_PILE_H);
  const r = rng(6201 + v * 13);
  const kind = ((v % SNOW_PILE_VARIANTS) + SNOW_PILE_VARIANTS) % SNOW_PILE_VARIANTS;
  const cx = 17;
  const by = SNOW_PILE_H - 4;
  // 둔덕 셋 (가운데 높은 것 + 양옆 낮은 것) + 굴러 나온 작은 눈뭉치 둘
  snowBall(g, cx - 8 + r() * 1.5, by - 3.6, 6.5, 4.2, v);
  snowBall(g, cx + 8 + r() * 1.5, by - 3.2, 6, 3.8, v + 1);
  snowBall(g, cx, by - 6.6, 10.5, 7, v + 2);
  snowBall(g, 3.6, by - 1.6, 2.4, 2.1, v + 3);
  snowBall(g, 30.6, by - 1.3, 2, 1.8, v + 5);
  // 맨 윗줄은 소복하게 밝게
  g.recolor((x, y) => !g.filled(x, y - 1) && x < cx + 7, SNOW.hi);
  // 퍼 간 자리: 꼭대기 오른쪽이 움푹 (안쪽 그늘 + 아래 테 밝게)
  const sx = cx + 3 + Math.floor(r() * 2);
  const sy = by - 11;
  for (let y = sy - 1; y <= sy + 2; y++)
    for (let x = sx - 3; x <= sx + 3; x++) {
      const dx = (x + 0.5 - sx) / 3.4;
      const dy = (y + 0.5 - sy) / 2.2;
      if (dx * dx + dy * dy > 1 || !g.filled(x, y)) continue;
      g.set(x, y, dy < 0.1 ? SNOW.deep : SNOW.shade);
    }
  for (let x = sx - 2; x <= sx + 2; x++) if (g.filled(x, sy + 2)) g.set(x, sy + 2, SNOW.hi);
  // 반짝이 몇 점
  for (let i = 0; i < 5; i++) {
    const x = 6 + Math.floor(r() * 22);
    const y = by - 9 + Math.floor(r() * 7);
    if (g.filled(x, y) && g.get(x, y) >>> 8 === SNOW.mid) g.set(x, y, 0xffffff);
  }
  if (kind < 2) {
    // 꼬마 삽: 꼭대기 왼쪽에 비스듬히 꽂힘 (삽날 아래는 눈에 묻혔다), 손잡이 끝은 T자
    const blade = kind === 0 ? 0xd8423c : 0x3a7ad8;
    const lean = kind === 0 ? -1 : 1;
    const bx = kind === 0 ? cx - 4 : cx + 1;
    let top = 0;
    while (top < by && !g.filled(bx, top)) top++;
    g.rect(bx - 1, top - 3, 4, 4, blade);
    g.vline(bx - 1, top - 3, top, lighten(blade, 0.3));
    g.set(bx + 2, top - 3, darken(blade, 0.25));
    const wood = 0xc8a070;
    for (let i = 0; i < 7; i++) g.set(bx + Math.round(((i + 1) * lean) / 3) + (lean > 0 ? 1 : 0), top - 4 - i, i > 4 ? darken(wood, 0.15) : wood);
    const tx = bx + Math.round((7 * lean) / 3) + (lean > 0 ? 1 : 0);
    g.hline(tx - 1, tx + 1, top - 11, 0x8a6a48);
    // 삽날 밑동을 덮은 눈
    g.hline(bx - 2, bx + 3, top, SNOW.hi);
    g.hline(bx - 1, bx + 2, top + 1, SNOW.mid);
  } else {
    // 옆에 엎어 둔 초록 양동이 (모래성 틀처럼 — 위에 눈 한 줌) + 손잡이
    const bx = 28;
    const col = 0x3aa060;
    for (let y = 0; y < 6; y++) g.hline(bx - 2 - (y >> 1), bx + 2 + (y >> 1), by - 6 + y, y === 0 ? lighten(col, 0.25) : y === 5 ? darken(col, 0.25) : y === 2 ? darken(col, 0.1) : col);
    g.set(bx - 3, by - 3, lighten(col, 0.35));
    line(g, bx + 4, by - 3, bx + 6, by - 6, 0x8a8f96);
    g.hline(bx - 2, bx + 2, by - 7, SNOW.hi);
    g.hline(bx - 1, bx + 1, by - 8, SNOW.mid);
  }
  g.outline(EDGE);
  shadowEllipse(g, cx, by + 1.6, 16, 2.4, 70);
  return g;
}

// ── 굴리는 눈덩이 ──

/** 굴러가는 방향: h = 옆으로(오른쪽 기준, 왼쪽은 좌우 반전), v = 위아래 */
export type RollAxis = "h" | "v";

/**
 * 굴리는 눈덩이 한 장 (크기 s, 프레임 f 0..3). 겉에 묻은 다져진 눈 덩어리·마른 잎 한 장·잔가지가 돌아가며 굴러가는 게 보인다.
 * 세로(v)는 위로 굴릴 때 프레임을 거꾸로 돌린다
 */
export function rollingBallArt(s: BallSize, axis: RollAxis, f: number): Grid {
  const { w, h } = ballFrameSize(s);
  const g = new Grid(w, h);
  const r = BALL_R[s];
  const ry = r * BALL_SQUASH;
  const cx = w / 2;
  const cy = h - 3 - ry;
  snowBall(g, cx, cy, r, ry, s);
  // 표면 무늬 (구 위의 점들 — 회전각에 따라 앞면으로 나오면 그린다)
  const marks: { a: number; b: number; c: Color; n: number }[] = [
    { a: 0.2, b: -0.35, c: SNOW.lo, n: 2 },
    { a: 1.9, b: 0.25, c: SNOW.shade, n: 2 },
    { a: 3.4, b: -0.1, c: 0xb8862e, n: s === 0 ? 1 : 2 }, // 마른 잎
    { a: 4.7, b: 0.4, c: SNOW.lo, n: 1 },
    { a: 5.5, b: -0.5, c: TWIG.mid, n: s === 2 ? 3 : 2 }, // 잔가지
  ];
  const turn = ((((f % BALL_ROLL_FRAMES) + BALL_ROLL_FRAMES) % BALL_ROLL_FRAMES) / BALL_ROLL_FRAMES) * Math.PI * 2;
  for (const m of marks) {
    const ang = m.a + turn;
    const front = Math.cos(ang);
    if (front < 0.15) continue;
    const u = Math.sin(ang) * 0.82; // 굴러가는 방향 성분
    const k = m.b * Math.sqrt(1 - Math.min(0.9, m.b * m.b)); // 옆 성분
    const px = axis === "h" ? cx + u * r : cx + k * r;
    const py = axis === "h" ? cy + k * ry : cy - u * ry;
    for (let i = 0; i < m.n; i++) {
      const x = Math.floor(px + (axis === "h" ? 0 : i - (m.n >> 1)));
      const y = Math.floor(py + (axis === "h" ? i - (m.n >> 1) : 0));
      if (!g.filled(x, y)) continue;
      // 가장자리로 갈수록 옅게 (구 옆면)
      g.set(x, y, front > 0.55 ? m.c : mix(m.c, g.get(x, y) >>> 8, 0.5));
    }
  }
  glint(g, cx, cy, r);
  g.outline(EDGE);
  // 굴러가며 앞에 밀리는 눈가루 (진행 방향 앞 아래 — 프레임마다 조금씩)
  const spray = (f & 1) === 0;
  if (axis === "h") {
    const x = Math.round(cx + r + 0.5);
    if (spray && !g.filled(x, h - 4)) g.set(x, h - 4, SNOW.hi);
    if (!g.filled(x + (spray ? 0 : 1), h - 3)) g.set(x + (spray ? 0 : 1), h - 3, SNOW.lo);
  }
  shadowEllipse(g, cx, h - 2.4, r * 0.95, 1.7, 70);
  return g;
}

/** 굴리는 눈덩이 시트 (가로로 BALL_ROLL_FRAMES장: 축 h 다음 v → 8장) */
export function rollingBallSheet(s: BallSize): { grid: Grid; frameW: number; frameH: number } {
  const { w, h } = ballFrameSize(s);
  const g = new Grid(w * BALL_ROLL_FRAMES * 2, h);
  (["h", "v"] as const).forEach((axis, ai) => {
    for (let f = 0; f < BALL_ROLL_FRAMES; f++) g.draw(rollingBallArt(s, axis, f), (ai * BALL_ROLL_FRAMES + f) * w, 0);
  });
  return { grid: g, frameW: w, frameH: h };
}

/** 굴린 자국 한 점 (다져진 눈 — 반투명, 장면이 시간이 지나면 지운다) */
export function rollTrackArt(s: BallSize): Grid {
  const r = Math.ceil(BALL_R[s] * 0.7);
  const g = new Grid(r * 2 + 2, 5);
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < g.w; x++) {
      const dx = (x + 0.5 - g.w / 2) / (r + 0.5);
      const dy = (y + 0.5 - 2.5) / 2.4;
      if (dx * dx + dy * dy > 1) continue;
      g.set(x, y, dy < -0.2 ? 0x9cb0c6 : 0xb4c4d4, 120);
    }
  return g;
}

// ── 내려놓은 덩이 · 쌓는 중 ──

/** 쌓은 덩이들 높이 (아래부터 크기). 맨 위 덩이 꼭대기까지 (px, 바닥에서) */
export function stackHeight(sizes: readonly BallSize[]): number {
  let top = 0;
  for (let i = 0; i < sizes.length; i++) {
    const ry = BALL_R[sizes[i]] * BALL_SQUASH;
    top += ry * 2 - (i > 0 ? STACK_SINK : 0);
  }
  return Math.ceil(top);
}

/** 쌓은 덩이 그림 크기 */
export function stackSize(sizes: readonly BallSize[]): { w: number; h: number } {
  const big = Math.max(...sizes.map((s) => BALL_R[s]));
  return { w: Math.ceil(big * 2) + 6, h: stackHeight(sizes) + 6 };
}

/** 덩이 가운데 y들 (아래부터, 그림 안 좌표). 바닥 줄 = h - 3 */
function stackCenters(sizes: readonly BallSize[], h: number, sag = 0): number[] {
  const out: number[] = [];
  let bottom = h - 3;
  for (let i = 0; i < sizes.length; i++) {
    const ry = BALL_R[sizes[i]] * BALL_SQUASH * (1 - sag * 0.18);
    const cy = bottom - ry;
    out.push(cy);
    bottom = cy - ry + STACK_SINK + sag * 1.2;
  }
  return out;
}

/**
 * 바닥에 내려놓은 덩이·쌓는 중인 덩이 (아래부터 크기 — 1단이면 한 개). 얼굴·장식 없이 눈덩이만.
 * 바닥에 닿은 쪽은 살짝 납작, 얹힌 자리마다 눌린 그늘
 */
export function stackArt(sizes: readonly BallSize[]): Grid {
  const { w, h } = stackSize(sizes);
  const g = new Grid(w, h);
  const cx = w / 2;
  const cys = stackCenters(sizes, h);
  sizes.forEach((s, i) => {
    const r = BALL_R[s];
    snowBall(g, cx, cys[i], r, r * BALL_SQUASH, 40 + i);
    if (i > 0) seam(g, cx, Math.round(cys[i] + r * BALL_SQUASH - 0.5), r * 0.8);
    glint(g, cx, cys[i], r);
  });
  // 바닥에 눌린 자리 (맨 아래 한 줄을 넓게)
  const r0 = BALL_R[sizes[0]];
  for (let x = Math.round(cx - r0 * 0.7); x <= Math.round(cx + r0 * 0.7); x++) g.set(x, h - 3, SNOW.deep);
  g.outline(EDGE);
  shadowEllipse(g, cx, h - 2.2, r0 * 1.05, 1.8, 70);
  return g;
}

// ── 완성 눈사람 ──

export type SnowmanFace = "smile" | "surprise" | "sleepy" | "wink" | "grumpy" | "happy" | "blush";
export type SnowmanHat = "none" | "beanie" | "bucket" | "santa" | "antlers" | "tophat" | "earmuffs";
export type SnowmanArms = "up" | "down" | "wave" | "out" | "mittens";
export type SnowmanNose = "long" | "short" | "crooked" | "button";
export type SnowmanButtons = "coal3" | "coal2" | "pebbles" | "none";
export type SnowmanLook = {
  face: SnowmanFace;
  hat: SnowmanHat;
  /** 모자 색 (털모자·귀마개) */
  hatColor: Color;
  scarf: Color;
  /** 줄무늬 목도리 (둘째 색) */
  stripe: Color | null;
  /** 목도리 꼬리가 늘어진 쪽 */
  tail: -1 | 1;
  arms: SnowmanArms;
  nose: SnowmanNose;
  buttons: SnowmanButtons;
};

export const SNOWMAN_FACES: readonly SnowmanFace[] = ["smile", "surprise", "sleepy", "wink", "grumpy", "happy", "blush"];
export const SNOWMAN_HATS: readonly SnowmanHat[] = ["none", "beanie", "bucket", "santa", "antlers", "tophat", "earmuffs"];
export const SNOWMAN_ARMS: readonly SnowmanArms[] = ["up", "down", "wave", "out", "mittens"];
export const SNOWMAN_NOSES: readonly SnowmanNose[] = ["long", "short", "crooked", "button"];
export const SNOWMAN_BUTTONS: readonly SnowmanButtons[] = ["coal3", "coal2", "pebbles", "none"];
const SCARVES: readonly Color[] = [0xd8423c, 0x2f8a52, 0x3a6ec8, 0xe8b830, 0x8a4ac8, 0xe8763a, 0x2aa0a8];
const KNITS: readonly Color[] = [0xd8423c, 0x3a6ec8, 0x2f8a52, 0xe8b830, 0xc85a9a, 0x6a4ac8];
/** 겨울판 모자 비중 / 크리스마스판 (산타 모자·루돌프 뿔이 훨씬 자주) */
const HAT_WEIGHTS: Readonly<Record<"winter" | "christmas", Readonly<Record<SnowmanHat, number>>>> = {
  winter: { none: 2, beanie: 4, bucket: 3, santa: 1, antlers: 1, tophat: 2, earmuffs: 2 },
  christmas: { none: 1, beanie: 2, bucket: 1, santa: 6, antlers: 4, tophat: 1, earmuffs: 1 },
};

function pickWeighted<T extends string>(r: () => number, w: Readonly<Record<T, number>>): T {
  const keys = Object.keys(w) as T[];
  let sum = 0;
  for (const k of keys) sum += w[k];
  let x = r() * sum;
  for (const k of keys) {
    x -= w[k];
    if (x < 0) return k;
  }
  return keys[keys.length - 1];
}

/** 무작위 모습 (같은 씨앗이면 누구에게나 같다). christmas면 산타 모자·루돌프 뿔·빨강/초록 목도리가 더 자주 */
export function snowmanLook(seed: number, christmas: boolean): SnowmanLook {
  const r = rng((seed >>> 0) ^ 0x5eed5);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length) % a.length];
  const face = pick(SNOWMAN_FACES);
  const hat = pickWeighted(r, HAT_WEIGHTS[christmas ? "christmas" : "winter"]);
  const hatColor = pick(KNITS);
  const scarf = christmas && r() < 0.5 ? pick([0xd8423c, 0x2f8a52] as const) : pick(SCARVES);
  const stripe = r() < 0.3 ? (scarf === 0xd8423c && christmas ? 0xf6f6f6 : pick([0xf6f6f6, 0xf2d060, 0x2a2a30] as const)) : null;
  const tail: -1 | 1 = r() < 0.5 ? -1 : 1;
  const arms = pick(SNOWMAN_ARMS);
  const nose = pick(SNOWMAN_NOSES);
  const buttons = pick(SNOWMAN_BUTTONS);
  return { face, hat, hatColor, scarf, stripe, tail, arms, nose, buttons };
}

/** 모습 가짓수 (얼굴 × 모자 × 모자 색(털모자·귀마개만) × 목도리 × 줄무늬 × 꼬리 × 팔 × 코 × 단추 — 보고용 대략) */
export const SNOWMAN_COMBOS = SNOWMAN_FACES.length * SNOWMAN_HATS.length * SCARVES.length * 2 * SNOWMAN_ARMS.length * SNOWMAN_NOSES.length * SNOWMAN_BUTTONS.length;

export const SNOWMAN_W = 34;
export const SNOWMAN_H = 46;
/** 녹는 단계: 0 그대로 · 1 살짝 처짐 · 2 많이 녹음 · 3 덩어리만 */
export const SNOWMAN_MELT_STAGES = 4;
/** 이름표 높이 (그림 바닥에서 모자 꼭대기 위로, 녹는 단계별) */
export function snowmanTop(melt: number): number {
  return [40, 38, 32, 18][Math.max(0, Math.min(3, melt | 0))];
}

/** 완성 눈사람 (34×46, 원점 바닥 가운데). melt = 녹는 단계 0~3 */
export function snowmanArt(look: SnowmanLook, melt = 0): Grid {
  const m = Math.max(0, Math.min(3, melt | 0));
  if (m === 3) return meltLumpArt(look);
  const g = new Grid(SNOWMAN_W, SNOWMAN_H);
  const cx = SNOWMAN_W / 2;
  const sag = m * 0.6;
  const sizes: BallSize[] = [2, 1, 0];
  const cys = stackCenters(sizes, SNOWMAN_H, sag);
  const rx = (s: BallSize) => BALL_R[s] * (1 + sag * 0.1) - (m === 2 && s === 0 ? 0.6 : 0);
  const ry = (s: BallSize) => BALL_R[s] * BALL_SQUASH * (1 - sag * 0.18);
  // 녹으면 머리가 한쪽으로 기운다
  const lean = m === 0 ? 0 : look.tail * (m === 1 ? 0.5 : 1.5);
  const bx = [cx, cx + lean * 0.4, cx + lean];
  const [bodyY, bellyY, headY] = cys;
  const headR = rx(0);
  const headRy = ry(0);
  const hx = bx[2];

  // 팔 (덩이 뒤)
  drawArms(g, look.arms, m, bx[1], bellyY, rx(1));
  sizes.forEach((s, i) => {
    snowBall(g, bx[i], cys[i], rx(s), ry(s), 70 + i);
    if (i > 0) seam(g, bx[i], Math.round(cys[i] + ry(s) - 0.5), rx(s) * 0.8);
    glint(g, bx[i], cys[i], rx(s));
  });
  // 녹는 중: 몸에 녹은 물자국 (반짝이는 얼음빛)·아래 둘레 젖음
  if (m >= 1) {
    for (const [dx, dy] of [
      [-3, 2],
      [4, 4],
      [-5, 6],
    ]) {
      const x = Math.round(bx[0] + dx);
      const y = Math.round(bodyY + dy);
      if (g.filled(x, y)) g.set(x, y, 0xc4e0ee);
      if (m >= 2 && g.filled(x, y + 1)) g.set(x, y + 1, 0x9cc6dc);
    }
  }
  // 단추 (배 가운데 → 몸통 위)
  drawButtons(g, look.buttons, Math.round(bx[1] - 0.5), bellyY, bodyY, ry(1), m);
  // 얼굴
  drawFace(g, look, Math.round(hx - 0.5), Math.round(headY), m);
  // 목도리 (머리와 배 사이)
  drawScarf(g, look, hx, Math.round(headY + headRy - 1), headR, m);
  // 모자
  drawHat(g, look, hx, Math.round(headY - headRy), headR, m);
  g.outline(EDGE);
  // 밖으로 나온 것 (잔가지 끝·졸린 z) — 테두리 없이
  if (look.face === "sleepy" && m === 0) {
    const zx = Math.round(hx + headR + 2);
    const zy = Math.round(headY - headRy - 1);
    const z = 0x8ab4dc;
    g.hline(zx, zx + 2, zy, z);
    g.set(zx + 1, zy + 1, z);
    g.hline(zx, zx + 2, zy + 2, z);
  }
  // 그림자 (녹으면 젖은 물웅덩이가 번진다)
  if (m >= 1) puddleUnder(g, cx, SNOWMAN_H - 2.6, 10 + m * 3, 2 + m * 0.4, m);
  shadowEllipse(g, cx, SNOWMAN_H - 2.6, 10, 2, 70);
  return g;
}

/** 녹아서 덩어리만 남은 눈사람 (3단계): 납작한 눈 둔덕 위에 모자·당근·숯, 목도리가 흘러내림 */
function meltLumpArt(look: SnowmanLook): Grid {
  const g = new Grid(SNOWMAN_W, SNOWMAN_H);
  const cx = SNOWMAN_W / 2;
  const by = SNOWMAN_H - 3;
  snowBall(g, cx, by - 4.2, 10, 4.6, 91);
  snowBall(g, cx + look.tail * 1.5, by - 8.5, 5.5, 3.6, 92);
  glint(g, cx + look.tail * 1.5, by - 8.5, 5);
  // 숯 눈 두 개 (흘러내려 비뚤게)
  const fx = Math.round(cx + look.tail * 1.5 - 0.5);
  g.set(fx - 2, by - 9, COAL);
  g.set(fx + 2, by - 8, COAL);
  // 당근 (옆으로 누움)
  g.hline(fx, fx + 2, by - 6, CARROT.mid);
  g.set(fx + 3, by - 6, CARROT.lo);
  // 목도리가 둔덕에 걸쳐 흘러내림
  const sc = look.scarf;
  for (let i = 0; i < 9; i++) {
    const x = Math.round(cx - 6 + i * 1.4);
    const y = by - 5 + Math.round(Math.sin(i * 0.8) * 1.2);
    g.set(x, y, look.stripe && i % 2 ? look.stripe : sc);
    g.set(x, y + 1, darken(sc, 0.25));
  }
  // 모자 (기울어 얹힘)
  drawHat(g, look, cx + look.tail * 1.5, by - 12, 4.4, 3);
  g.outline(EDGE);
  // 잔가지 팔 하나는 바닥에 떨어져 있다
  line(g, Math.round(cx - 13), by - 1, Math.round(cx - 8), by - 2, TWIG.mid);
  g.set(Math.round(cx - 11), by - 2, TWIG.hi);
  puddleUnder(g, cx, by + 0.4, 15, 2.6, 3);
  shadowEllipse(g, cx, by + 0.4, 11, 2, 60);
  return g;
}

/** 녹은 물 (반투명 물빛 + 비친 하늘 한 줄). 비어 있는 픽셀만 */
function puddleUnder(g: Grid, cx: number, cy: number, rx: number, ry: number, m: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d > 1 || g.filled(x, y)) continue;
      const c = d > 0.7 ? WATER.deep : hash2(x >> 1, y, 6301) < 0.18 ? WATER.hi : WATER.mid;
      g.set(x, y, c, 120 + m * 25);
    }
}

function drawArms(g: Grid, arms: SnowmanArms, m: number, cx: number, cy: number, r: number): void {
  // 녹으면 팔이 처진다 (2단계는 한쪽이 바닥으로 떨어짐)
  const kind: SnowmanArms = m >= 1 && arms === "up" ? "out" : m >= 2 ? "down" : arms;
  for (const side of [-1, 1] as const) {
    if (m >= 2 && side === 1) continue; // 떨어진 팔 (바닥 그림은 녹은 덩어리 쪽에서)
    const sx = cx + side * (r - 1.5);
    const sy = cy - 1;
    let ex: number;
    let ey: number;
    const wave = kind === "wave" && side === 1;
    if (kind === "up" || wave) {
      ex = sx + side * 6;
      ey = sy - 7;
    } else if (kind === "down") {
      ex = sx + side * 6;
      ey = sy + 4;
    } else {
      ex = sx + side * 7;
      ey = sy - (kind === "wave" ? 1 : 2);
    }
    line(g, Math.round(sx), Math.round(sy), Math.round(ex), Math.round(ey), TWIG.mid);
    // 잔가지 손가락 (끝에서 둘로 갈라짐)
    const ix = Math.round(ex);
    const iy = Math.round(ey);
    if (kind === "mittens") {
      // 벙어리장갑 (빨강·흰 테)
      g.rect(ix - (side < 0 ? 1 : 0), iy - 1, 2, 2, 0xd8423c);
      g.set(ix + side, iy - 2, 0xd8423c);
      g.set(ix - side, iy + 1, 0xf2f2f2);
    } else {
      g.set(ix + side, iy - 1, TWIG.hi);
      g.set(ix, iy - 1, TWIG.mid);
      if (kind !== "down") g.set(ix + side, iy + 1, TWIG.hi);
      else g.set(ix + side, iy + 1, TWIG.mid);
      // 가운데 곁가지
      const mx = Math.round((sx + ex) / 2);
      const my = Math.round((sy + ey) / 2);
      g.set(mx, my - 1, TWIG.hi);
    }
  }
}

function drawButtons(g: Grid, kind: SnowmanButtons, x: number, bellyY: number, bodyY: number, bellyRy: number, m: number): void {
  if (kind === "none") return;
  const sink = m; // 녹으면 단추가 조금씩 내려앉는다
  const ys =
    kind === "coal3"
      ? [bellyY - 1, bellyY + 2, Math.round(bodyY - 2)]
      : kind === "coal2"
        ? [bellyY, bellyY + Math.round(bellyRy * 0.6)]
        : [bellyY - 1, bellyY + 2, Math.round(bodyY - 2), Math.round(bodyY + 2)];
  for (const [i, y0] of ys.entries()) {
    const y = Math.round(y0 + sink * 0.5);
    if (!g.filled(x, y)) continue;
    if (kind === "pebbles") {
      const c = i % 2 ? 0x8a8f96 : 0x6a6e76;
      g.set(x, y, c);
      if (g.filled(x + 1, y)) g.set(x + 1, y, darken(c, 0.2));
    } else {
      g.set(x, y, COAL);
      if (y0 === bodyY - 2 && g.filled(x + 1, y)) g.set(x + 1, y, 0x3a3e46);
    }
  }
}

function drawFace(g: Grid, look: SnowmanLook, x: number, y: number, m: number): void {
  // x = 머리 가운데 왼쪽 픽셀, 눈은 x-2·x+2, 코는 x에서 오른쪽으로
  const el = x - 2;
  const er = x + 2;
  const ey = y - 2 + (m >= 2 ? 1 : 0);
  const face: SnowmanFace = m >= 2 ? "sleepy" : look.face;
  const eye = (ex: number, yy: number) => g.set(ex, yy, COAL);
  switch (face) {
    case "smile":
      eye(el, ey);
      eye(er, ey);
      g.set(el, y + 2, COAL);
      g.set(el + 1, y + 3, COAL);
      g.set(er - 1, y + 3, COAL);
      g.set(er, y + 2, COAL);
      break;
    case "surprise":
      eye(el, ey);
      eye(el, ey - 1);
      eye(er, ey);
      eye(er, ey - 1);
      // 동그란 입
      g.set(x, y + 2, COAL);
      g.set(x + 1, y + 2, COAL);
      g.set(x, y + 3, 0x5a2a2a);
      g.set(x + 1, y + 3, COAL);
      break;
    case "sleepy":
      g.hline(el - 1, el, ey, COAL);
      g.hline(er, er + 1, ey, COAL);
      g.hline(x, x + 1, y + 3, 0x4a4e56);
      break;
    case "wink":
      eye(el, ey);
      g.set(er - 1, ey, COAL);
      g.set(er, ey - 1, COAL);
      g.set(er + 1, ey, COAL);
      g.set(el, y + 2, COAL);
      g.set(el + 1, y + 3, COAL);
      g.set(er - 1, y + 3, COAL);
      g.set(er, y + 2, COAL);
      g.set(er + 1, y + 1, BLUSH);
      break;
    case "grumpy":
      eye(el, ey);
      eye(er, ey);
      // 눈썹이 안쪽으로 내려간다
      g.set(el - 1, ey - 2, COAL);
      g.set(el, ey - 2, COAL);
      g.set(el + 1, ey - 1, COAL);
      g.set(er + 1, ey - 2, COAL);
      g.set(er, ey - 2, COAL);
      g.set(er - 1, ey - 1, COAL);
      // 입꼬리가 내려간 입
      g.set(el, y + 3, COAL);
      g.set(el + 1, y + 2, COAL);
      g.set(er - 1, y + 2, COAL);
      g.set(er, y + 3, COAL);
      break;
    case "happy":
      // ^^ 눈
      g.set(el - 1, ey, COAL);
      g.set(el, ey - 1, COAL);
      g.set(el + 1, ey, COAL);
      g.set(er - 1, ey, COAL);
      g.set(er, ey - 1, COAL);
      g.set(er + 1, ey, COAL);
      // 크게 웃는 입
      g.hline(el, er, y + 2, COAL);
      g.hline(el + 1, er - 1, y + 3, 0xc8505a);
      break;
    case "blush":
      eye(el, ey);
      eye(er, ey);
      g.set(el - 1, y + 1, BLUSH);
      g.set(er + 1, y + 1, BLUSH);
      g.set(x, y + 3, COAL);
      g.set(x + 1, y + 3, COAL);
      break;
  }
  // 당근 코 (오른쪽으로 — 3/4 얼굴)
  const ny = y + (m >= 1 ? 1 : 0);
  switch (look.nose) {
    case "long":
      g.hline(x, x + 3, ny, CARROT.mid);
      g.set(x, ny, CARROT.hi);
      g.set(x + 4, ny, CARROT.lo);
      if (m < 2) g.set(x + 1, ny + 1, CARROT.lo);
      break;
    case "short":
      g.hline(x, x + 1, ny, CARROT.mid);
      g.set(x + 2, ny, CARROT.lo);
      break;
    case "crooked":
      g.hline(x, x + 2, ny, CARROT.mid);
      g.set(x + 3, ny + 1, CARROT.mid);
      g.set(x + 4, ny + 2, CARROT.lo);
      break;
    case "button":
      g.set(x, ny, CARROT.hi);
      g.set(x + 1, ny, CARROT.mid);
      g.set(x, ny + 1, CARROT.mid);
      g.set(x + 1, ny + 1, CARROT.lo);
      break;
  }
}

function drawScarf(g: Grid, look: SnowmanLook, hx: number, y: number, headR: number, m: number): void {
  const c = look.scarf;
  const dk = darken(c, 0.28);
  const lt = lighten(c, 0.22);
  const x0 = Math.round(hx - headR - 0.5);
  const x1 = Math.round(hx + headR - 0.5);
  for (let x = x0; x <= x1; x++) {
    const st = look.stripe && ((x - x0) >> 1) % 2 === 1;
    g.set(x, y, st ? look.stripe! : x < hx - 1 ? lt : c);
    g.set(x, y + 1, st ? darken(look.stripe!, 0.2) : dk);
  }
  // 꼬리 (늘어진 쪽, 끝에 술)
  const tx = look.tail < 0 ? x0 + 1 : x1 - 1;
  const len = 4 + (m >= 1 ? 1 : 0);
  for (let i = 0; i < len; i++) {
    const st = look.stripe && i % 2 === 1;
    g.set(tx + (i > 2 ? look.tail : 0), y + 2 + i, st ? look.stripe! : i === len - 1 ? dk : c);
    g.set(tx + 1 * look.tail + (i > 2 ? look.tail : 0), y + 2 + i, st ? darken(look.stripe!, 0.2) : dk);
  }
  const fy = y + 2 + len;
  const fx = tx + (len > 3 ? look.tail : 0);
  g.set(fx, fy, lt);
  g.set(fx + look.tail, fy, c);
}

function drawHat(g: Grid, look: SnowmanLook, hx: number, top: number, headR: number, m: number): void {
  // top = 머리 꼭대기 줄. 녹으면 모자가 기운다
  const tilt = m >= 1 ? look.tail : 0;
  const cx = Math.round(hx - 0.5);
  switch (look.hat) {
    case "none":
      // 모자 대신 머리에 눈 한 줌 (밋밋하지 않게)
      g.hline(cx - 1, cx + 1, top - 1, SNOW.hi);
      break;
    case "beanie": {
      const c = look.hatColor;
      for (let y = 0; y < 4; y++) {
        const w = Math.round(headR - 0.5) - (y === 3 ? 2 : y === 2 ? 1 : 0);
        g.hline(cx - w + tilt * (y >> 1), cx + w + 1 + tilt * (y >> 1), top + 1 - y, y === 0 ? darken(c, 0.15) : c);
      }
      // 접은 단 (니트 결)
      const w0 = Math.round(headR - 0.5);
      for (let x = cx - w0; x <= cx + w0 + 1; x++) g.set(x, top + 2, (x & 1) === 0 ? lighten(c, 0.35) : lighten(c, 0.2));
      // 결 세로줄
      for (let x = cx - w0 + 1; x <= cx + w0; x += 2) g.set(x + tilt, top, darken(c, 0.12));
      // 방울
      const px = cx + tilt * 2;
      g.rect(px, top - 4, 2, 2, 0xf6f6f6);
      g.set(px + 1, top - 3, 0xd8dce4);
      break;
    }
    case "bucket": {
      // 뒤집어 쓴 양동이 (함석 — 위가 좁다), 손잡이
      const c = 0x8c9aa8;
      for (let y = 0; y < 6; y++) {
        const w = Math.round(headR - 0.5) + 1 - (y >> 1);
        const off = tilt * (y >> 2);
        g.hline(cx - w + off, cx + w + 1 + off, top + 1 - y, y === 0 ? darken(c, 0.25) : y === 5 ? lighten(c, 0.3) : c);
        g.set(cx - w + 1 + off, top + 1 - y, lighten(c, 0.35));
        g.set(cx + w + off, top + 1 - y, darken(c, 0.2));
      }
      // 테두리 띠
      const w0 = Math.round(headR - 0.5) + 1;
      g.hline(cx - w0, cx + w0 + 1, top - 1, darken(c, 0.12));
      // 손잡이 (옆으로 늘어짐)
      g.set(cx + w0 + 2, top - 1, 0x6a737c);
      g.set(cx + w0 + 2, top, 0x6a737c);
      g.set(cx + w0 + 1, top + 1, 0x6a737c);
      break;
    }
    case "santa": {
      // 빨간 고깔이 한쪽으로 늘어지고 흰 방울
      const red = 0xd23a3a;
      const side = tilt || 1;
      const w0 = Math.round(headR - 0.5);
      for (let y = 0; y < 5; y++) {
        const w = w0 - y;
        if (w < 0) break;
        g.hline(cx - w + side * (y >> 1), cx + w + 1 + side * (y >> 1), top - y, y === 0 ? darken(red, 0.1) : red);
      }
      g.set(cx + side * 3, top - 4, red);
      g.set(cx + side * 4, top - 3, darken(red, 0.2));
      g.set(cx + side * 5, top - 2, darken(red, 0.25));
      // 흰 털 단
      for (let x = cx - w0 - 1; x <= cx + w0 + 2; x++) {
        g.set(x, top + 1, 0xf6f6f6);
        g.set(x, top + 2, (x & 1) === 0 ? 0xe6eaf0 : 0xf6f6f6);
      }
      // 방울
      g.rect(cx + side * 6 - (side < 0 ? 1 : 0), top - 2, 2, 2, 0xf6f6f6);
      g.set(cx + side * 6 + (side < 0 ? -1 : 1), top - 1, 0xd8dce4);
      break;
    }
    case "antlers": {
      // 루돌프 뿔 (갈색 가지 둘) + 머리띠
      const br = 0x8a5a32;
      const hi = 0xa8743e;
      const w0 = Math.round(headR - 0.5);
      g.hline(cx - w0 + 1, cx + w0, top, 0x6a3a22);
      for (const side of [-1, 1] as const) {
        const bx = side < 0 ? cx - 2 : cx + 3;
        const ox = tilt;
        g.vline(bx + ox, top - 5, top - 1, br);
        g.set(bx + ox + side, top - 6, br);
        g.set(bx + ox + side * 2, top - 7, hi);
        // 곁가지
        g.set(bx + ox + side, top - 3, hi);
        g.set(bx + ox + side * 2, top - 4, br);
        g.set(bx + ox - side, top - 4, hi);
        g.set(bx + ox - side, top - 5, br);
      }
      // 크리스마스 리본 하나 (빨강·초록 방울)
      g.set(cx - w0 + 1, top + 1, 0xd23a3a);
      g.set(cx - w0 + 2, top + 1, 0x2f8a52);
      break;
    }
    case "tophat": {
      const c = 0x2a2a32;
      const w0 = Math.round(headR - 0.5);
      // 챙
      g.hline(cx - w0 - 1 + tilt, cx + w0 + 2 + tilt, top, 0x3a3a44);
      // 높은 몸통
      for (let y = 1; y <= 6; y++) g.hline(cx - w0 + 2 + tilt, cx + w0 - 1 + tilt, top - y, y === 6 ? 0x44444e : c);
      // 띠 (목도리 색과 맞춘다)
      g.hline(cx - w0 + 2 + tilt, cx + w0 - 1 + tilt, top - 2, look.scarf);
      g.vline(cx - w0 + 2 + tilt, top - 5, top - 3, 0x4a4a56);
      break;
    }
    case "earmuffs": {
      const c = look.hatColor;
      const w0 = Math.round(headR);
      // 머리 위 띠
      for (let x = cx - w0 + 2; x <= cx + w0 - 1; x++) g.set(x + tilt, top - (Math.abs(x - cx - 0.5) < 2 ? 1 : 0), 0x5a5a66);
      // 귀 털뭉치
      for (const side of [-1, 1] as const) {
        const ex = side < 0 ? cx - w0 : cx + w0;
        g.rect(ex - 1 + (side > 0 ? 0 : 0), top + 2, 3, 3, c);
        g.set(ex + (side < 0 ? -1 : 1), top + 2, lighten(c, 0.4));
        g.set(ex, top + 3, lighten(c, 0.25));
        g.set(ex + (side < 0 ? 1 : -1), top + 4, darken(c, 0.25));
      }
      break;
    }
  }
}

// ── 물웅덩이 (다 녹은 자리) ──

export const PUDDLE_W = 30;
export const PUDDLE_H = 12;

/** 다 녹은 자리: 물웅덩이에 당근·숯·목도리·모자가 남는다 (장면이 잠깐 두었다가 흐려지며 지운다) */
export function puddleArt(look: SnowmanLook): Grid {
  const g = new Grid(PUDDLE_W, PUDDLE_H);
  const cx = PUDDLE_W / 2;
  const cy = PUDDLE_H - 4;
  // 물 (가장자리는 짙게, 가운데 비친 하늘)
  for (let y = 0; y < PUDDLE_H; y++)
    for (let x = 0; x < PUDDLE_W; x++) {
      const dx = (x + 0.5 - cx) / 13.5;
      const dy = (y + 0.5 - cy) / 3.6;
      const wob = (hash2(x >> 2, 0, 6401) - 0.5) * 0.25;
      const d = dx * dx + dy * dy + wob;
      if (d > 1) continue;
      const c = d > 0.72 ? WATER.deep : dy < -0.2 && Math.abs(dx) < 0.5 && (x + y) % 3 === 0 ? WATER.hi : WATER.mid;
      g.set(x, y, c, d > 0.72 ? 170 : 150);
    }
  // 젖은 눈 테두리 (녹다 남은 눈 조금)
  for (const [x, y] of [
    [3, cy],
    [4, cy - 1],
    [26, cy + 1],
    [25, cy + 2],
    [12, cy + 3],
  ])
    g.set(x, y, SNOW.lo);
  // 당근
  g.hline(cx - 6, cx - 3, cy, CARROT.mid);
  g.set(cx - 6, cy, CARROT.hi);
  g.set(cx - 2, cy, CARROT.lo);
  // 숯 둘
  g.set(cx + 2, cy - 1, COAL);
  g.set(cx + 4, cy + 1, COAL);
  // 목도리 (물에 젖어 짙게)
  const sc = darken(look.scarf, 0.15);
  for (let i = 0; i < 7; i++) g.set(Math.round(cx + 3 + i), cy + 1 + (i > 3 ? 1 : 0), look.stripe && i % 2 ? darken(look.stripe, 0.15) : sc);
  // 모자 (작게 옆으로 누움)
  const hatAt = { x: Math.round(cx - 11), y: cy - 3 };
  switch (look.hat) {
    case "beanie":
    case "earmuffs":
      g.rect(hatAt.x, hatAt.y, 4, 3, look.hatColor);
      g.set(hatAt.x - 1, hatAt.y + 1, 0xf6f6f6);
      break;
    case "bucket":
      g.rect(hatAt.x, hatAt.y, 4, 3, 0x8c9aa8);
      g.vline(hatAt.x + 4, hatAt.y, hatAt.y + 2, 0x6a737c);
      break;
    case "santa":
      g.rect(hatAt.x, hatAt.y + 1, 4, 2, 0xd23a3a);
      g.hline(hatAt.x, hatAt.x + 3, hatAt.y + 3, 0xf6f6f6);
      g.set(hatAt.x - 1, hatAt.y, 0xf6f6f6);
      break;
    case "antlers":
      g.set(hatAt.x, hatAt.y + 2, 0x8a5a32);
      g.set(hatAt.x + 1, hatAt.y + 1, 0x8a5a32);
      g.set(hatAt.x + 2, hatAt.y + 2, 0xa8743e);
      g.set(hatAt.x + 3, hatAt.y + 1, 0x8a5a32);
      break;
    case "tophat":
      g.rect(hatAt.x, hatAt.y, 3, 3, 0x2a2a32);
      g.vline(hatAt.x + 3, hatAt.y - 1, hatAt.y + 3, 0x3a3a44);
      break;
    case "none":
      break;
  }
  // 잔가지 하나
  g.hline(cx + 5, cx + 9, cy - 2, TWIG.mid);
  g.set(cx + 8, cy - 3, TWIG.hi);
  return g;
}
