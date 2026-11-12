import { Grid, type Color } from "./pixel";

// 동물원 펫 그림 (타는 펫 3종 + 달빛 여우). 그림 규칙은 cosmeticFx.ts의 펫과 같다: 옆모습은 오른쪽을 본다(왼쪽은 좌우 반전).
//
// 타는 펫 시트 = 24×22 프레임 10장, 발바닥이 맨 아랫줄(21):
//   0·1 옆모습 걷기 · 2·3 앞모습(아래를 볼 때) · 4·5 뒷모습(위를 볼 때)
//   6·7 앞모습 덧그림(머리·목 — 탄 사람 앞에 그린다) · 8·9 뒷모습 덧그림(엉덩이·꼬리·다리 — 탄 사람 앞에)
// 탄 사람은 등 위(MOUNT_SEAT 줄)에 앉는다 — 발바닥이 그 줄에 오도록 몸을 들어 올린다.

export const MOUNT_W = 24;
export const MOUNT_H = 22;
export const MOUNT_FRAMES = 10;
export type MountKind = "hound" | "goose" | "deer";
/** 탄 사람의 발바닥이 오는 줄 (그림 맨 위에서) → 들어 올리는 높이 = MOUNT_H - 1 - 이 값 */
export const MOUNT_SEAT: Record<MountKind, number> = { hound: 10, goose: 11, deer: 9 };
/** 탄 사람을 들어 올리는 높이 (px) */
export function mountLift(kind: MountKind): number {
  return MOUNT_H - 1 - MOUNT_SEAT[kind];
}

type Draw = (g: Grid, f: number) => void;
type Views = { side: Draw; front: Draw; back: Draw; frontOver: Draw; backOver: Draw; line: Color };

function sheet(v: Views): Grid {
  const g = new Grid(MOUNT_W * MOUNT_FRAMES, MOUNT_H);
  const put = (i: number, draw: Draw, f: number, outline = true) => {
    const one = new Grid(MOUNT_W, MOUNT_H);
    draw(one, f);
    if (outline) one.outline(v.line, false, 225);
    g.draw(one, i * MOUNT_W, 0);
  };
  for (let f = 0; f < 2; f++) {
    put(0 + f, v.side, f);
    put(2 + f, v.front, f);
    put(4 + f, v.back, f);
    put(6 + f, v.frontOver, f);
    put(8 + f, v.backOver, f);
  }
  return g;
}

// ── 듬직한 큰 개 ──
const HOUND = { fur: 0xc89a62, lo: 0x9a7040, chest: 0xf2e0bc, ear: 0x7a5030, nose: 0x1a1210, eye: 0x1e140c, collar: 0xd84a4a, tag: 0xffd84a, tongue: 0xf08aa0, paw: 0x6a4a2a, line: 0x3a2414 };

function houndSide(g: Grid, f: number): void {
  const c = HOUND;
  // 먼 쪽 다리 (어둡게) → 몸 → 가까운 쪽 다리
  for (const x of f ? [6, 15] : [5, 16]) {
    g.rect(x, 14, 2, 7, c.lo);
    g.set(x, 21, c.paw);
    g.set(x + 1, 21, c.paw);
  }
  g.ellipse(11, 11.5, 8.2, 3.8, c.fur);
  g.recolor((x, y) => y >= 13 && x >= 12, c.chest);
  g.recolor((x, y) => y <= 8, 0xd8ac74);
  // 목·머리
  g.rect(15, 6, 4, 6, c.fur);
  g.ellipse(19.5, 6.5, 3.3, 2.8, c.fur);
  g.ellipse(22.2, 8, 1.8, 1.3, c.chest);
  g.set(23, 7, c.nose);
  g.set(20, 5, c.eye);
  g.rect(16, 4, 2, 4, c.ear);
  if (f === 0) g.set(22, 9, c.tongue);
  // 목걸이
  g.vline(15, 8, 10, c.collar);
  g.set(15, 11, c.tag);
  // 꼬리 흔들기
  if (f === 0) {
    g.set(3, 9, c.fur);
    g.set(2, 8, c.fur);
    g.set(1, 7, c.lo);
  } else {
    g.set(3, 10, c.fur);
    g.set(2, 10, c.fur);
    g.set(1, 11, c.lo);
  }
  for (const x of f ? [8, 14] : [3, 17]) {
    g.rect(x, 14, 2, 7, c.fur);
    g.set(x, 21, c.paw);
    g.set(x + 1, 21, c.paw);
  }
}
function houndHeadFront(g: Grid, f: number): void {
  const c = HOUND;
  g.rect(7, 6, 2, 5, c.ear);
  g.rect(15, 6, 2, 5, c.ear);
  g.ellipse(12, 8, 4, 3.4, c.fur);
  g.ellipse(12, 10.2, 2.2, 1.6, c.chest);
  g.set(11, 9, c.nose);
  g.set(12, 9, c.nose);
  g.set(10, 7, c.eye);
  g.set(14, 7, c.eye);
  if (f === 0) g.set(12, 11, c.tongue);
  g.hline(9, 15, 12, c.collar);
  g.set(12, 13, c.tag);
}
function houndFront(g: Grid, f: number): void {
  const c = HOUND;
  g.ellipse(12, 13, 6, 4.2, c.fur);
  g.ellipse(12, 14.5, 3, 2.4, c.chest);
  for (const [x, lift] of [[8, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.rect(x, 16, 2, 5 - lift, c.fur);
    g.set(x, 21 - lift, c.paw);
    g.set(x + 1, 21 - lift, c.paw);
  }
  houndHeadFront(g, f);
}
function houndBackBody(g: Grid, f: number): void {
  const c = HOUND;
  g.ellipse(12, 12.5, 6, 4.5, c.fur);
  g.recolor((x, y) => y <= 9, 0xd8ac74);
  for (const [x, lift] of [[8, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.rect(x, 16, 2, 5 - lift, c.lo);
    g.set(x, 21 - lift, c.paw);
    g.set(x + 1, 21 - lift, c.paw);
  }
  // 꼬리 (위로 살랑)
  const tx = f ? 13 : 11;
  g.vline(tx, 7, 10, c.fur);
  g.set(tx, 6, c.lo);
}
function houndBack(g: Grid, f: number): void {
  const c = HOUND;
  g.ellipse(12, 5, 3.4, 2.8, c.fur);
  g.rect(8, 4, 2, 3, c.ear);
  g.rect(14, 4, 2, 3, c.ear);
  houndBackBody(g, f);
}

// ── 왕거위 ──
const GOOSE = { white: 0xf6f4ee, shade: 0xd6d2c8, wing: 0xe2ded2, beak: 0xf09a3a, beakLo: 0xc0702a, eye: 0x1a1a1a, line: 0x5a5048 };

function gooseSide(g: Grid, f: number): void {
  const c = GOOSE;
  // 발 (주황, 짧은 다리 + 물갈퀴)
  const feet = f ? [10, 11] : [8, 13];
  for (const x of feet) {
    g.vline(x, 18, 20, c.beak);
    g.hline(x - 1, x + 1, 21, c.beakLo);
  }
  g.ellipse(10, 14, 8, 4.4, c.white);
  g.recolor((x, y) => y >= 17, c.shade);
  g.ellipse(9, 13.5, 5, 2.6, c.wing);
  g.recolor((x, y) => y === 15 && x >= 5 && x <= 13, c.shade);
  // 꽁지
  g.set(1, 11, c.white);
  g.set(2, 11, c.white);
  g.set(2, 12, c.white);
  // 긴 목·머리 (걸을 때 살짝 앞으로)
  const lean = f ? 1 : 0;
  g.rect(15 + lean, 6, 2, 7, c.white);
  g.set(15, 12, c.white);
  g.ellipse(17.5 + lean, 4.5, 2.6, 2.2, c.white);
  g.rect(20 + lean, 5, 2, 2, c.beak);
  g.set(22 + lean, 5, c.beakLo);
  g.set(18 + lean, 4, c.eye);
}
function gooseNeckFront(g: Grid): void {
  const c = GOOSE;
  g.rect(11, 6, 2, 8, c.white);
  g.ellipse(12, 5, 2.4, 2.2, c.white);
  g.rect(11, 6, 2, 2, c.beak);
  g.set(11, 7, c.beakLo);
  g.set(10, 4, c.eye);
  g.set(13, 4, c.eye);
}
function gooseFront(g: Grid, f: number): void {
  const c = GOOSE;
  for (const [x, lift] of [[9, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.vline(x, 19 - lift, 20 - lift, c.beak);
    g.hline(x - 1, x + 1, 21 - lift, c.beakLo);
  }
  g.ellipse(12, 15, 6.5, 4.6, c.white);
  g.recolor((x, y) => (x <= 7 || x >= 16) && y >= 13, c.wing);
  g.recolor((x, y) => y >= 18, c.shade);
  gooseNeckFront(g);
}
function gooseBackBody(g: Grid, f: number): void {
  const c = GOOSE;
  for (const [x, lift] of [[9, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.vline(x, 19 - lift, 20 - lift, c.beak);
    g.hline(x - 1, x + 1, 21 - lift, c.beakLo);
  }
  g.ellipse(12, 14.5, 6.5, 4.8, c.white);
  g.recolor((x, y) => (x <= 7 || x >= 16) && y >= 12, c.wing);
  // 꽁지깃 (살랑)
  const tx = f ? 12 : 11;
  g.rect(tx, 18, 2, 2, c.shade);
}
function gooseBack(g: Grid, f: number): void {
  const c = GOOSE;
  g.rect(11, 5, 2, 7, c.white);
  g.ellipse(12, 4.5, 2.4, 2.2, c.white);
  g.set(12, 2, c.shade);
  gooseBackBody(g, f);
}

// ── 달빛 사슴 ──
const DEER = { fur: 0xb07a4a, lo: 0x8a5a32, belly: 0xf0e0c4, spot: 0xf8ecd8, antler: 0xe8dcc0, glow: 0xbfeaff, hoof: 0x3a2a1a, nose: 0x2a1a10, eye: 0x1a120c, line: 0x3a2214 };

function deerSide(g: Grid, f: number): void {
  const c = DEER;
  for (const x of f ? [7, 15] : [5, 17]) {
    g.vline(x, 12, 20, c.lo);
    g.set(x, 21, c.hoof);
  }
  g.ellipse(11, 10.5, 7.8, 3.4, c.fur);
  g.recolor((x, y) => y >= 12, c.belly);
  for (const [x, y] of [[8, 9], [11, 8], [13, 10], [6, 10], [10, 11]]) g.set(x, y, c.spot);
  // 목·머리·귀
  g.rect(15, 5, 3, 6, c.fur);
  g.ellipse(18.5, 4.5, 2.6, 2.1, c.fur);
  g.rect(20, 5, 2, 2, c.belly);
  g.set(22, 5, c.nose);
  g.set(19, 4, c.eye);
  g.set(16, 3, c.lo);
  // 뿔 (끝이 달빛으로 빛난다)
  g.vline(18, 0, 2, c.antler);
  g.set(17, 1, c.antler);
  g.set(19, 1, c.antler);
  g.set(17, 0, c.glow);
  g.set(19, 0, c.glow);
  g.set(20, 1, c.glow);
  // 흰 꼬리
  g.set(3, 8, c.spot);
  g.set(3, 9, c.spot);
  for (const x of f ? [9, 13] : [3, 19]) {
    g.vline(x, 12, 20, c.fur);
    g.set(x, 21, c.hoof);
  }
}
function deerHeadFront(g: Grid): void {
  const c = DEER;
  // 뿔 (탄 사람 앞으로 솟는다)
  g.vline(9, 0, 4, c.antler);
  g.set(8, 1, c.antler);
  g.set(10, 2, c.antler);
  g.vline(15, 0, 4, c.antler);
  g.set(16, 1, c.antler);
  g.set(14, 2, c.antler);
  for (const [x, y] of [[9, 0], [8, 1], [15, 0], [16, 1]]) g.set(x, y, c.glow);
  g.set(7, 5, c.lo);
  g.set(17, 5, c.lo);
  g.ellipse(12, 7, 3, 2.7, c.fur);
  g.ellipse(12, 9, 1.8, 1.3, c.belly);
  g.set(12, 9, c.nose);
  g.set(10, 6, c.eye);
  g.set(14, 6, c.eye);
}
function deerFront(g: Grid, f: number): void {
  const c = DEER;
  g.ellipse(12, 12, 5, 3.8, c.fur);
  g.ellipse(12, 13, 2.5, 2.2, c.belly);
  for (const [x, lift] of [[9, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.vline(x, 15, 20 - lift, c.fur);
    g.set(x, 21 - lift, c.hoof);
  }
  deerHeadFront(g);
}
function deerBackBody(g: Grid, f: number): void {
  const c = DEER;
  g.ellipse(12, 12, 5, 4, c.fur);
  for (const [x, y] of [[9, 10], [14, 11], [11, 9]]) g.set(x, y, c.spot);
  // 흰 엉덩이 털·꼬리
  g.ellipse(12, 11.5, 2, 1.6, c.spot);
  g.set(f ? 13 : 12, 9, c.spot);
  for (const [x, lift] of [[9, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.vline(x, 15, 20 - lift, c.lo);
    g.set(x, 21 - lift, c.hoof);
  }
}
function deerBack(g: Grid, f: number): void {
  const c = DEER;
  g.vline(10, 0, 3, c.antler);
  g.vline(14, 0, 3, c.antler);
  g.set(9, 1, c.antler);
  g.set(15, 1, c.antler);
  g.set(10, 0, c.glow);
  g.set(14, 0, c.glow);
  g.ellipse(12, 5, 2.6, 2.3, c.fur);
  g.set(9, 4, c.lo);
  g.set(15, 4, c.lo);
  deerBackBody(g, f);
}

const VIEWS: Record<MountKind, Views> = {
  hound: { side: houndSide, front: houndFront, back: houndBack, frontOver: houndHeadFront, backOver: houndBackBody, line: HOUND.line },
  goose: { side: gooseSide, front: gooseFront, back: gooseBack, frontOver: (g) => gooseNeckFront(g), backOver: gooseBackBody, line: GOOSE.line },
  deer: { side: deerSide, front: deerFront, back: deerBack, frontOver: (g) => deerHeadFront(g), backOver: deerBackBody, line: DEER.line },
};

/** 타는 펫 시트 (MOUNT_W × MOUNT_H × MOUNT_FRAMES) */
export function mountSheet(kind: MountKind): Grid {
  return sheet(VIEWS[kind]);
}

/** 달빛 여우 (데리고 다니는 작은 펫, 12×10 두 프레임 — 꼬리 끝이 은은하게 빛난다) */
export function foxSheet(): Grid {
  const W = 12;
  const g = new Grid(W * 2, 10);
  for (let f = 0; f < 2; f++) {
    const one = new Grid(W, 10);
    const c = 0xe07a3a;
    const white = 0xf8f0e0;
    const dark = 0x5a2a12;
    // 복슬복슬한 꼬리 (끝은 달빛)
    if (f === 0) {
      one.ellipse(2, 4.4, 2, 1.5, c);
      one.set(0, 3, 0xd8f0ff);
      one.set(1, 3, white);
    } else {
      one.ellipse(2, 5.6, 2, 1.5, c);
      one.set(0, 6, 0xd8f0ff);
      one.set(1, 7, white);
    }
    one.ellipse(5.6, 6.4, 3.6, 2, c);
    one.ellipse(9, 4.2, 2.2, 2, c);
    one.set(8, 1, dark);
    one.set(8, 2, c);
    one.set(10, 1, dark);
    one.set(10, 2, c);
    one.set(11, 5, white);
    one.set(11, 4, dark);
    one.set(9, 4, 0x1a1008);
    one.set(8, 6, white);
    one.set(7, 7, white);
    for (const x of f === 0 ? [3, 7] : [4, 6]) one.set(x, 8, dark);
    one.outline(0x4a1e08, false, 220);
    g.draw(one, f * W, 0);
  }
  return g;
}
