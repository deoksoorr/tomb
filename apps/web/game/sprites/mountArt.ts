import { padArt, type ArtPad } from "./artPad";
import { Grid, type Color } from "./pixel";

// 동물원 펫 그림 (타는 펫 3종 + 달빛 여우). 그림 규칙은 cosmeticFx.ts의 펫과 같다: 옆모습은 오른쪽을 본다(왼쪽은 좌우 반전).
//
// 타는 펫 시트 = 24×22 프레임 10장, 발바닥이 맨 아랫줄(21):
//   0·1 옆모습 걷기 · 2·3 앞모습(아래를 볼 때) · 4·5 뒷모습(위를 볼 때)
//   6·7 앞모습 덧그림(머리·목 — 탄 사람 앞에 그린다) · 8·9 뒷모습 덧그림(엉덩이·꼬리·다리 — 탄 사람 앞에)
//   11/17 알파카·북극곰은 뒤에 옆모습 4장을 덧붙인다: 10·11 멈춤(앉기·눈 깜빡) · 12·13 가끔 하는 동작 (mountFrames)
//   12월 루돌프 썰매는 너비 40 (mountW) + 그 뒤에 옆모습 덧그림 한 장 (mountSideOver — 탄 사람 앞에 썰매 옆판)
// 탄 사람은 등 위(MOUNT_SEAT 줄)에 앉는다 — 발바닥이 그 줄에 오도록 몸을 들어 올린다.

export const MOUNT_W = 24;
export const MOUNT_H = 22;
export const MOUNT_FRAMES = 10;
export type MountKind = "hound" | "goose" | "deer" | "carp" | "alpaca" | "polar" | "sleigh";
/** 탄 사람의 발바닥이 오는 줄 (그림 맨 위에서) → 들어 올리는 높이 = MOUNT_H - 1 - 이 값 */
/**
 * 11/17 옆모습에서 탈것을 보는 쪽(앞)으로 미는 칸 — 탄 사람이 탈것 가운데보다 뒤쪽에 앉아 보이게.
 * 루돌프 썰매는 앞에 루돌프가 있어 가운데에 앉으면 너무 앞으로 쏠려 보였다 (사용자 피드백)
 */
export const MOUNT_SIDE_SHIFT: Partial<Record<MountKind, number>> = { sleigh: 13 };
// 11/19 월척 잉어 9 → 11: 몸이 얇고 낮아(등 맨 윗줄 8~9) 등 꼭대기에 앉히면 엉덩이가 등에 1~2줄만 걸쳐(걸으며 출렁이면 1줄) 둥둥 떠 보였다 (사용자 제보).
// 몸통 안으로 옆모습 4줄·앞뒤 6줄 앉힌다 (더 내리면 얇은 몸이 탄 사람에 거의 가려진다. 앞·뒷모습 엉덩이는 머리·꼬리 덧그림 뒤로 들어간다)
export const MOUNT_SEAT: Record<MountKind, number> = { hound: 10, goose: 11, deer: 9, carp: 11, alpaca: 10, polar: 9, sleigh: 15 };
/** 탄 사람을 들어 올리는 높이 (px) */
export function mountLift(kind: MountKind): number {
  return MOUNT_H - 1 - MOUNT_SEAT[kind];
}
/**
 * 11/19 발걸음이 없는 탈것 (물결 위를 미끄러지는 잉어) — 몸이 프레임마다 그대로라 탄 사람만 1px 출렁이면
 * 엉덩이가 등에서 떴다 붙었다 해 보인다 → 걸어도 탄 사람을 출렁이지 않는다
 */
export const MOUNT_GLIDE: Partial<Record<MountKind, true>> = { carp: true };

type Draw = (g: Grid, f: number) => void;
/** under = 외곽선을 두르지 않고 몸 밑에 까는 것 (월척 잉어의 물결 — 옆·앞·뒷모습에만) */
/** extra = 11/17 기본 10장 뒤에 덧붙이는 옆모습 (멈춤·동작). after가 있으면 외곽선을 두른 뒤 덧그린다 (튀긴 눈처럼 테가 없어야 하는 것) */
type Extra = Draw | { draw: Draw; after: Draw };
/** w = 프레임 너비 (없으면 MOUNT_W), sideOver = 옆모습에서 탄 사람 앞에 덧그리는 한 장 (extra 뒤) */
type View = "side" | "front" | "back";
type Views = { side: Draw; front: Draw; back: Draw; frontOver: Draw; backOver: Draw; line: Color; under?: (g: Grid, f: number, view: View) => void; extra?: readonly Extra[]; w?: number; sideOver?: Draw };

/** 타는 펫 외곽선 알파 */
const OUTLINE_A = 225;

function sheet(v: Views): Grid {
  const W = v.w ?? MOUNT_W;
  const g = new Grid(W * (MOUNT_FRAMES + (v.extra?.length ?? 0) + (v.sideOver ? 1 : 0)), MOUNT_H);
  const put = (i: number, draw: Draw, f: number, outline = true, under?: View, after?: Draw) => {
    const one = new Grid(W, MOUNT_H);
    draw(one, f);
    if (outline) one.outline(v.line, false, OUTLINE_A);
    after?.(one, f);
    if (under && v.under) {
      const base = new Grid(W, MOUNT_H);
      v.under(base, f, under);
      base.draw(one, 0, 0);
      g.draw(base, i * W, 0);
      return;
    }
    g.draw(one, i * W, 0);
  };
  for (let f = 0; f < 2; f++) {
    put(0 + f, v.side, f, true, "side");
    put(2 + f, v.front, f, true, "front");
    put(4 + f, v.back, f, true, "back");
    put(6 + f, v.frontOver, f);
    put(8 + f, v.backOver, f);
  }
  v.extra?.forEach((e, i) => (typeof e === "function" ? put(MOUNT_FRAMES + i, e, i) : put(MOUNT_FRAMES + i, e.draw, i, true, undefined, e.after)));
  if (v.sideOver) put(MOUNT_FRAMES + (v.extra?.length ?? 0), v.sideOver, 0);
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

// ── 11/15 수집 의뢰 보상: 월척 잉어 (비단잉어 — 흰 바탕에 주홍 무늬, 등엔 금빛 비늘 윤기). 다리 대신 물결 위를 미끄러진다 ──
const CARP = { white: 0xfaf6ee, shade: 0xd8d0c2, red: 0xf0582a, redLo: 0xb83a1a, gold: 0xffd25a, fin: 0xffe2d0, finLo: 0xf0b8a0, eye: 0x1a1210, whisker: 0xe8c890, line: 0x5a2a1a };

function carpSide(g: Grid, f: number): void {
  const c = CARP;
  // 꼬리 (갈라진 지느러미, 프레임마다 위아래로 흔든다)
  const sw = f ? 1 : -1;
  for (const [x, y] of [[3, 11], [2, 10 + sw], [1, 9 + sw], [2, 13 + sw], [1, 14 + sw], [0, 8 + sw], [0, 15 + sw], [1, 11 + sw], [1, 12 + sw]]) g.set(x, y, c.fin);
  g.set(0, 9 + sw, c.finLo);
  g.set(0, 14 + sw, c.finLo);
  // 몸통
  g.ellipse(11.5, 12, 8.6, 3.7, c.white);
  g.recolor((x, y) => y >= 14, c.shade);
  // 주홍 무늬 (등 위 큰 무늬 둘 + 머리 꼭대기 단정 무늬)
  g.recolor((x, y) => y <= 11 && ((x >= 6 && x <= 9) || (x >= 12 && x <= 15 && y <= 10)), c.red);
  g.recolor((x, y) => y === 9 && x >= 7 && x <= 14, c.gold);
  g.recolor((x, y) => y >= 12 && y <= 13 && x >= 7 && x <= 8, c.redLo);
  g.set(18, 9, c.red);
  g.set(17, 9, c.red);
  // 머리·눈·입·수염
  g.set(19, 11, c.eye);
  g.set(21, 13, c.redLo);
  g.set(21, 14, c.whisker);
  g.set(22, 15, c.whisker);
  // 가슴지느러미 (반투명 분홍)
  g.set(14, 15, c.fin);
  g.set(13, 16, f ? c.finLo : c.fin);
  g.set(15, 16, c.fin);
}
/** 앞모습 머리 (탄 사람 앞에 덧그린다): 흰 얼굴 + 정수리 붉은 동그라미(단정) + 양옆 눈 + 동그란 입 + 수염 */
function carpHeadFront(g: Grid): void {
  const c = CARP;
  g.ellipse(12, 14.5, 4.6, 3.4, c.white);
  g.recolor((x, y) => y >= 16, c.shade);
  g.ellipse(12, 12.8, 1.7, 1.2, c.red);
  g.set(11, 12, c.gold);
  g.set(8, 14, c.eye);
  g.set(16, 14, c.eye);
  g.set(8, 13, 0xffffff);
  g.set(16, 13, 0xffffff);
  g.rect(11, 16, 3, 2, 0xf0a0a0);
  g.set(12, 17, 0x8a2a1a);
  g.set(10, 17, c.whisker);
  g.set(9, 18, c.whisker);
  g.set(14, 17, c.whisker);
  g.set(15, 18, c.whisker);
}
function carpFront(g: Grid, f: number): void {
  const c = CARP;
  // 가슴지느러미: 양옆으로 넓게 펼친 반투명 부채 (살랑)
  const up = f ? 0 : 1;
  for (const d of [-1, 1] as const) {
    const x0 = d < 0 ? 7 : 16;
    for (let i = 1; i <= 3; i++) {
      g.set(x0 + d * i, 13 + up - (i === 3 ? 1 : 0), c.fin);
      g.set(x0 + d * i, 14 + up, i === 3 ? c.finLo : c.fin);
    }
  }
  // 몸통 (탄 사람 뒤로 멀어지는 등)
  g.ellipse(12, 10.5, 5.2, 3.2, c.white);
  g.recolor((x, y) => y <= 10 && (x <= 9 || x >= 15), c.red);
  g.vline(12, 7, 9, c.gold);
  carpHeadFront(g);
}
/** 뒷모습 꼬리 (탄 사람 앞에 덧그린다): 나비처럼 넓게 퍼지는 꼬리지느러미 + 엉덩이 */
function carpBackBody(g: Grid, f: number): void {
  const c = CARP;
  const sw = f ? 1 : -1;
  for (let y = 14; y <= 20; y++) {
    const half = Math.round(1 + (y - 14) * 0.95);
    const shift = y >= 17 ? sw : 0;
    for (let x = 12 - half + shift; x <= 12 + half + shift; x++) {
      if (y === 20 && (x + 20) % 2 === 0) continue;
      const streak = (x - shift + 20) % 2 === 0;
      g.set(x, y, y >= 19 ? c.finLo : streak ? c.fin : 0xfff2e8);
    }
  }
  g.ellipse(12, 12.6, 3.2, 2.2, c.white);
  g.recolor((x, y) => y <= 12 && x >= 12, c.red);
}
function carpBack(g: Grid, f: number): void {
  const c = CARP;
  g.ellipse(12, 10, 5.4, 3.4, c.white);
  g.recolor((x, y) => y <= 9 && (x <= 9 || x >= 14), c.red);
  g.vline(12, 6, 9, c.gold);
  g.set(5, 11, c.fin);
  g.set(4, 12, c.finLo);
  g.set(18, 11, c.fin);
  g.set(19, 12, c.finLo);
  carpBackBody(g, f);
}
/** 잉어 밑 물결 (외곽선 없이, 반투명) */
function carpWater(g: Grid, f: number): void {
  // 물결 고리 두 겹 (가운데는 비친다)
  g.ellipse(12, 20, 10, 1.9, 0x8ad0f4, 170);
  g.ellipse(12, 20, 8.4, 1.1, 0x4a90c0, 70);
  g.ellipse(12, 20, 5, 0.8, 0xbfe8fa, 170);
  for (const [x, y] of f ? [[4, 19], [19, 20], [12, 21]] : [[6, 20], [17, 19], [10, 21]]) g.set(x, y, 0xffffff, 220);
}

// ── 11/17 뭉게 알파카: 크림빛 곱슬 털 · 긴 목 · 정수리 솜뭉치 · 바나나 귀 · 등에 알록달록 줄무늬 담요 (탄 사람이 앉는 자리) ──
const ALPACA = { wool: 0xf6ecd8, lo: 0xe0cfae, hi: 0xfffaf0, face: 0xf2e2c6, muzzle: 0xfff6e6, ear: 0xd6bc94, leg: 0xead9bb, hoof: 0x6a5040, eye: 0x2a1e14, nose: 0x8a6252, blush: 0xf4a8a8, pink: 0xe8708e, teal: 0x4ec0b0, yellow: 0xf6d050, line: 0x6a5642 };

/** 몽글몽글한 등 털 (위쪽 가장자리에 작은 솜뭉치) */
function alpacaFluff(g: Grid, xs: readonly number[], y: number): void {
  for (const x of xs) g.ellipse(x, y, 1.7, 1.3, ALPACA.wool);
}
/** 줄무늬 담요 (y0부터 세 줄 + 술) */
function alpacaBlanket(g: Grid, x0: number, x1: number, y0: number): void {
  const c = ALPACA;
  g.hline(x0, x1, y0, c.pink);
  g.hline(x0, x1, y0 + 1, c.teal);
  g.hline(x0, x1, y0 + 2, c.yellow);
  for (let x = x0; x <= x1; x += 2) g.set(x, y0 + 3, c.pink);
}
function alpacaHeadSide(g: Grid, dx: number, dy: number, mouth: "shut" | "chew" | "chewShut" = "shut", blink = false): void {
  const c = ALPACA;
  g.set(17 + dx, 0 + dy, c.ear);
  g.set(17 + dx, 1 + dy, c.ear);
  g.set(21 + dx, 0 + dy, c.ear);
  g.ellipse(19.5 + dx, 3.8 + dy, 2.6, 2.1, c.face);
  g.ellipse(18.6 + dx, 1.8 + dy, 1.9, 1.3, c.hi); // 정수리 솜뭉치
  g.ellipse(22 + dx, 4.8 + dy, 1.5, 1.2, c.muzzle);
  g.set(23 + dx, 4 + dy, c.nose);
  if (blink) {
    g.set(19 + dx, 3 + dy, c.eye);
    g.set(20 + dx, 4 + dy, c.eye);
  } else {
    g.set(20 + dx, 3 + dy, c.eye);
    g.set(20 + dx, 2 + dy, c.eye); // 긴 속눈썹
  }
  g.set(21 + dx, 5 + dy, c.blush);
  if (mouth === "chew" || mouth === "chewShut") {
    // 풀 한 줄기를 오물오물
    g.set(23 + dx, 6 + dy, 0x6ac05a);
    g.set(23 + dx, 7 + dy, 0x4a9a3a);
    if (mouth === "chew") g.set(22 + dx, 6 + dy, 0xc87a7a);
  }
}
function alpacaSide(g: Grid, f: number): void {
  const c = ALPACA;
  for (const x of f ? [7, 15] : [6, 16]) {
    g.vline(x, 15, 20, c.lo);
    g.set(x, 21, c.hoof);
  }
  g.ellipse(11, 12.5, 7.6, 4.2, c.wool);
  alpacaFluff(g, [5, 8, 14], 9.2);
  g.recolor((x, y) => y >= 15, c.lo);
  g.ellipse(3, 10.6, 1.5, 1.5, c.hi); // 꼬리 솜뭉치
  alpacaBlanket(g, 8, 13, 9);
  // 긴 목 (곱슬 가장자리)
  const lean = f ? 1 : 0;
  g.rect(16 + lean, 4, 3, 8, c.wool);
  for (const y of [5, 7, 9]) g.set(19 + lean, y, c.wool);
  g.set(16 + lean, 11, c.lo);
  alpacaHeadSide(g, lean, 0);
  for (const x of f ? [9, 13] : [4, 18]) {
    g.vline(x, 15, 20, c.leg);
    g.set(x, 15, c.wool);
    g.set(x, 21, c.hoof);
  }
}
function alpacaHeadFront(g: Grid): void {
  const c = ALPACA;
  g.rect(10, 5, 4, 8, c.wool);
  for (const y of [6, 8, 10]) {
    g.set(9, y, c.wool);
    g.set(14, y, c.wool);
  }
  g.vline(8, 0, 2, c.ear);
  g.vline(16, 0, 2, c.ear);
  g.ellipse(12, 3.8, 3.2, 2.5, c.face);
  g.ellipse(12, 1.4, 2.4, 1.4, c.hi);
  g.ellipse(12, 5.4, 1.7, 1.1, c.muzzle);
  g.set(12, 5, c.nose);
  g.set(10, 3, c.eye);
  g.set(14, 3, c.eye);
  g.set(9, 5, c.blush);
  g.set(15, 5, c.blush);
}
function alpacaFront(g: Grid, f: number): void {
  const c = ALPACA;
  g.ellipse(12, 14, 6.2, 4.4, c.wool);
  alpacaFluff(g, [8, 16], 11);
  g.recolor((x, y) => y >= 17, c.lo);
  g.hline(6, 8, 12, c.pink);
  g.hline(16, 18, 12, c.pink);
  g.hline(6, 8, 13, c.teal);
  g.hline(16, 18, 13, c.teal);
  for (const [x, lift] of [[9, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.vline(x, 17, 20 - lift, c.leg);
    g.set(x, 21 - lift, c.hoof);
  }
  alpacaHeadFront(g);
}
function alpacaBackBody(g: Grid, f: number): void {
  const c = ALPACA;
  for (const [x, lift] of [[9, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.vline(x, 17, 20 - lift, c.lo);
    g.set(x, 21 - lift, c.hoof);
  }
  g.ellipse(12, 13.6, 6.2, 4.6, c.wool);
  alpacaFluff(g, [8, 12, 16], 10.6);
  g.recolor((x, y) => y >= 17, c.lo);
  alpacaBlanket(g, 8, 16, 10);
  // 꼬리 솜뭉치 (살랑)
  g.ellipse(f ? 12.6 : 11.6, 15.4, 1.4, 1.3, c.hi);
}
function alpacaBack(g: Grid, f: number): void {
  const c = ALPACA;
  g.rect(10, 4, 4, 8, c.wool);
  g.vline(9, 0, 2, c.ear);
  g.vline(15, 0, 2, c.ear);
  g.ellipse(12, 3, 2.9, 2.3, c.wool);
  g.ellipse(12, 1.6, 2.2, 1.3, c.hi);
  alpacaBackBody(g, f);
}
/** 멈춤·동작: 다리를 접고 폭 앉는다 (open·blink = 멈춤, chew·chewShut = 풀을 오물오물) */
function alpacaRest(g: Grid, pose: "open" | "blink" | "chew" | "chewShut"): void {
  const c = ALPACA;
  const dy = 4;
  g.ellipse(11, 16.6, 8, 4, c.wool);
  alpacaFluff(g, [5, 8, 14], 13.2);
  g.recolor((x, y) => y >= 19, c.lo);
  g.ellipse(3, 15, 1.5, 1.5, c.hi);
  alpacaBlanket(g, 8, 13, 13);
  for (const x of [5, 15]) {
    g.hline(x, x + 1, 21, c.hoof);
  }
  g.rect(16, 4 + dy, 3, 8, c.wool);
  for (const y of [5, 7, 9]) g.set(19, y + dy, c.wool);
  alpacaHeadSide(g, 0, dy, pose === "chew" || pose === "chewShut" ? pose : "shut", pose === "blink");
}

// ── 11/17 포근 북극곰: 새하얀 털 (그늘은 푸른빛) · 동그란 귀 · 까만 코 · 하늘색 뜨개 목도리 ──
const POLAR = { fur: 0xfaf8f2, lo: 0xd4dce6, hi: 0xffffff, ear: 0xe8b8c4, nose: 0x1e1e26, eye: 0x1a1a22, pad: 0x8a8c9a, mouth: 0xe07a8a, scarf: 0x4a94dc, stripe: 0xeef4ff, blush: 0xf6b0bc, line: 0x485466 };

function polarHeadSide(g: Grid, x: number, y: number, o: { blink?: boolean; yawn?: 0 | 1 | 2 } = {}): void {
  const c = POLAR;
  g.ellipse(x - 1.4, y - 3.2, 1.3, 1.1, c.fur); // 귀
  g.set(x - 2, y - 3, c.ear);
  g.ellipse(x, y, 3.4, 3, c.fur);
  g.ellipse(x + 3, y + 1 - (o.yawn ? 1 : 0), 1.8, 1.4, c.fur);
  g.set(x + 4, y - (o.yawn ? 1 : 0), c.nose);
  if (o.yawn) {
    // 하품: 입을 크게 (2 = 더 크게), 눈은 꼭
    g.set(x + 3, y + 2, c.mouth);
    g.set(x + 2, y + 2, c.mouth);
    if (o.yawn === 2) {
      g.set(x + 3, y + 3, c.mouth);
      g.set(x + 2, y + 3, 0xb04a5a);
    }
    g.set(x, y - 1, c.eye);
    g.set(x + 1, y - 1, c.eye);
  } else if (o.blink) {
    g.set(x, y - 1, c.eye);
    g.set(x + 1, y, c.eye);
  } else g.set(x + 1, y - 1, c.eye);
  g.set(x + 1, y + 1, c.blush);
}
function polarScarfSide(g: Grid, x: number, y0: number, f: number): void {
  const c = POLAR;
  g.vline(x, y0, y0 + 5, c.scarf);
  g.vline(x + 1, y0, y0 + 5, c.scarf);
  g.set(x, y0 + 2, c.stripe);
  g.set(x + 1, y0 + 2, c.stripe);
  // 끝자락 펄럭
  g.set(x - 1, y0 + 5 + f, c.scarf);
  g.set(x - 2, y0 + 6, c.stripe);
}
function polarSide(g: Grid, f: number): void {
  const c = POLAR;
  for (const x of f ? [6, 14] : [5, 15]) {
    g.rect(x, 15, 3, 6, c.lo);
    g.hline(x, x + 2, 21, c.pad);
  }
  g.ellipse(11, 12, 8.6, 4.8, c.fur);
  g.recolor((x, y) => y >= 15, c.lo);
  g.recolor((x, y) => y <= 8 && x >= 6 && x <= 14, c.hi);
  g.set(2, 10, c.fur); // 짧은 꼬리
  g.set(1, 10, c.lo);
  polarHeadSide(g, 19, 8);
  polarScarfSide(g, 15, 7, f);
  for (const x of f ? [8, 13] : [3, 16]) {
    g.rect(x, 15, 3, 6, c.fur);
    g.hline(x, x + 2, 21, c.pad);
  }
}
function polarHeadFront(g: Grid): void {
  const c = POLAR;
  for (const x of [8, 16]) {
    g.ellipse(x, 4, 1.5, 1.4, c.fur);
    g.set(x, 4, c.ear);
  }
  g.ellipse(12, 7, 4.2, 3.4, c.fur);
  g.ellipse(12, 8.6, 2, 1.4, c.hi);
  g.set(11, 8, c.nose);
  g.set(12, 8, c.nose);
  g.set(10, 6, c.eye);
  g.set(14, 6, c.eye);
  g.set(9, 8, c.blush);
  g.set(15, 8, c.blush);
  g.hline(8, 16, 10, c.scarf);
  g.hline(8, 16, 11, c.scarf);
  g.set(10, 11, c.stripe);
  g.set(14, 11, c.stripe);
  g.vline(15, 12, 13, c.scarf);
}
function polarFront(g: Grid, f: number): void {
  const c = POLAR;
  g.ellipse(12, 14.4, 6.8, 4.6, c.fur);
  g.recolor((x, y) => y >= 17, c.lo);
  for (const [x, lift] of [[7, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.rect(x, 17, 3, 4 - lift, c.fur);
    g.hline(x, x + 2, 21 - lift, c.pad);
  }
  polarHeadFront(g);
}
function polarBackBody(g: Grid, f: number): void {
  const c = POLAR;
  for (const [x, lift] of [[7, f ? 1 : 0], [14, f ? 0 : 1]] as const) {
    g.rect(x, 17, 3, 4 - lift, c.lo);
    g.hline(x, x + 2, 21 - lift, c.pad);
  }
  g.ellipse(12, 13.6, 6.8, 4.8, c.fur);
  g.recolor((x, y) => y >= 17, c.lo);
  g.recolor((x, y) => y <= 10, c.hi);
  // 동그란 꼬리 (살랑)
  g.ellipse(f ? 12.6 : 11.6, 15.6, 1.2, 1.1, c.hi);
}
function polarBack(g: Grid, f: number): void {
  const c = POLAR;
  for (const x of [8.5, 15.5]) g.ellipse(x, 3.6, 1.4, 1.3, c.fur);
  g.ellipse(12, 6, 3.8, 3, c.fur);
  g.hline(8, 16, 8, c.scarf);
  g.hline(8, 16, 9, c.scarf);
  g.set(12, 9, c.stripe);
  polarBackBody(g, f);
}
/** 멈춤·동작: 엉덩이를 깔고 앉는다 (open·blink = 멈춤, yawn·yawnWide = 기지개 켜며 하품) */
function polarSit(g: Grid, pose: "open" | "blink" | "yawn" | "yawnWide"): void {
  const c = POLAR;
  const yawn = pose === "yawn" ? 1 : pose === "yawnWide" ? 2 : 0;
  g.ellipse(10, 15.4, 6.4, 5.8, c.fur);
  g.recolor((x, y) => y >= 18 || x <= 5, c.lo);
  g.ellipse(9, 13, 3, 2.6, c.hi); // 배
  // 뒷발 (발바닥이 앞으로)
  g.ellipse(15, 19.6, 2.4, 1.6, c.fur);
  g.set(17, 19, c.pad);
  g.set(17, 20, c.pad);
  g.set(3, 19, c.fur);
  // 앞발: 앉으면 배 위, 하품이면 위로 쭉
  if (yawn) {
    for (const [x, y] of [[13, 9], [14, 8], [15, 7], [15, 6]] as const) g.set(x, y - yawn + 1, c.fur);
    g.set(15, 5 - yawn + 1, c.pad);
  } else {
    g.ellipse(13, 14, 1.6, 1.3, c.fur);
    g.set(14, 14, c.pad);
  }
  polarHeadSide(g, 14, yawn ? 6 : 7, { blink: pose === "blink", yawn: yawn as 0 | 1 | 2 });
  g.hline(10, 16, 10 - (yawn ? 1 : 0), c.scarf);
  g.hline(10, 16, 11 - (yawn ? 1 : 0), c.scarf);
  g.set(12, 11 - (yawn ? 1 : 0), c.stripe);
  g.set(9, 12, c.scarf);
  g.set(8, 13, c.stripe);
}

// ── 12월 루돌프 썰매 (이벤트 한정 타는 펫): 빨간 나무 썰매 · 금빛 테두리와 썰매 날 · 앞코에 방울 · 뒤칸에 선물 자루, 앞에서 꼬마 루돌프(xm_deer와 같은 색)가 끈다 ──
// 루돌프까지 들어가도록 이 그림만 52칸 너비 (11/17 40 → 52: 루돌프가 옆으로 눌려 보였다 — 몸을 길게, 썰매와 사이를 띄움).
// 앞·뒷모습은 예전 40칸 그림을 가운데(x 26)로 6칸 옮겨 그린다 (SLEIGH_PAD). 옆모습 탄 사람 자리는 MOUNT_SIDE_SHIFT. 옆모습은 탄 사람 앞에 썰매 옆판을 한 번 더 덧그려(sideOver) 다리가 썰매 안에 들어간다.
// 달릴 때(0~5) 썰매 날 뒤·발굽 밑에 눈가루가 날리고(under — 외곽선 없이) 방울이 흔들린다. 멈춤 10·11, 동작 12·13 = 루돌프가 앞발로 눈을 긁는다.
const SLEIGH_W = 52;
/** 앞·뒷모습(40칸 기준 그림)을 넓힌 프레임 가운데로 옮기는 칸 */
const SLEIGH_PAD = (SLEIGH_W - 40) / 2;
const SL = { red: 0xd42c3c, redLo: 0x9a1c2c, redHi: 0xec5a5e, gold: 0xf2c84a, goldHi: 0xfff2b0, goldLo: 0xb88a22, sack: 0x9a6a3a, sackHi: 0xc89a62, sackLo: 0x6e4826, rope: 0xe8cf98, box1: 0x3aa05a, box2: 0x4a8ad8, ribbon: 0xff4a5a, holly: 0x2e8a4a, strap: 0x6a3a1a, snow: 0xf4faff, snowLo: 0xcfe6f6, line: 0x3a1418 };
const RD = { antler: 0xe0b878, dark: 0x8a5430, head: 0xb07440, back: 0xc88a52, body: 0xa86a3c, far: 0x6a3e22, belly: 0xf2dcb8, eye: 0x2a1a14, nose: 0xff3a44, collar: 0xd42c3c, hoof: 0x4a3020 };

/** 선물 자루 (옆모습 뒤칸): 불룩한 자루 + 삐죽 나온 선물 상자 둘 */
function sleighSack(g: Grid): void {
  const c = SL;
  g.ellipse(7.5, 6, 4.2, 4, c.sack);
  g.recolor((x, y) => x >= 10 && y >= 5, c.sackLo);
  g.set(5, 5, c.sackHi);
  g.set(6, 4, c.sackHi);
  g.set(5, 6, c.sackHi);
  g.hline(5, 10, 2, c.rope);
  g.set(11, 3, c.rope); // 묶은 끈 끝
  // 초록 상자 (금 리본) · 파란 상자 (빨간 리본)
  g.rect(4, 0, 3, 2, c.box1);
  g.set(5, 0, c.gold);
  g.set(5, 1, c.gold);
  g.rect(8, 0, 3, 2, c.box2);
  g.set(9, 0, c.ribbon);
  g.set(9, 1, c.ribbon);
}
/** 썰매 몸통 옆판 (등받이 · 옆판 · 앞코 · 금테 · 금빛 소용돌이 장식 · 호랑가시) — 옆모습과 탄 사람 앞 덧그림이 함께 쓴다 */
function sleighPanel(g: Grid): void {
  const c = SL;
  // 등받이 (둥근 위) · 옆판 · 앞코 (앞으로 솟아 말린다)
  g.ellipse(6.5, 9.2, 2.8, 1.8, c.red);
  g.rect(4, 9, 6, 3, c.red);
  g.rect(4, 11, 23, 6, c.red);
  g.rect(24, 9, 4, 4, c.red);
  g.set(27, 8, c.red);
  g.recolor((x, y) => y >= 15, c.redLo);
  g.recolor((x, y) => y === 12 && x >= 10 && x <= 23, c.redHi);
  // 금테 (위·아래 · 앞코 가장자리)
  g.recolor((x, y) => y === 8 && x <= 9, c.gold);
  g.vline(4, 9, 15, c.goldLo);
  g.hline(10, 23, 11, c.gold);
  g.hline(4, 26, 16, c.goldLo);
  g.vline(28, 9, 12, c.gold);
  g.set(28, 8, c.goldHi);
  g.set(29, 9, c.gold);
  // 금빛 소용돌이 둘
  for (const ox of [11, 18]) {
    for (const [x, y] of [[0, 1], [1, 0], [2, 1], [2, 2], [1, 3], [0, 3]] as const) g.set(ox + x, 12 + y, c.gold);
    g.set(ox + 1, 2 + 12, c.goldHi);
  }
  // 앞코 위 호랑가시 잎과 열매
  g.set(25, 8, c.holly);
  g.set(26, 7, c.holly);
  g.set(26, 8, c.ribbon);
}
/** 썰매 날 · 버팀대 */
function sleighRunners(g: Grid): void {
  const c = SL;
  g.vline(8, 17, 20, c.goldLo);
  g.vline(22, 17, 20, c.goldLo);
  g.hline(3, 27, 21, c.gold);
  for (const [x, y] of [[28, 20], [29, 19], [29, 18], [28, 17], [2, 20], [2, 19]] as const) g.set(x, y, c.gold);
  g.set(29, 18, c.goldHi);
  g.set(12, 21, c.goldHi);
  g.set(20, 21, c.goldHi);
}
/** 앞코에 매단 금방울 (sw = 흔들린 쪽) */
function sleighBell(g: Grid, sw: number): void {
  g.set(28, 13, SL.strap);
  g.set(28 + sw, 14, SL.gold);
  g.set(28 + sw, 15, SL.goldLo);
}
/** 옆모습 루돌프 (가슴끈으로 썰매를 끈다). pose: walk(f로 다리 번갈아) · stand · blink · paw(앞발 들기) · scrape(앞발로 긁기)
 *  11/17 몸을 길게(11칸) · 목을 세우고 · 썰매와 다섯 칸 띄웠다. 뒷다리 36·37, 앞다리 44·45 */
function reindeerSide(g: Grid, pose: "walk" | "stand" | "blink" | "paw" | "scrape", f = 0): void {
  const c = RD;
  const nod = pose === "paw" || pose === "scrape" ? 1 : 0;
  // 가슴끈 (썰매 앞코에서 루돌프 엉덩이까지 · 금 버클)
  g.hline(28, 35, 14, SL.strap);
  g.set(31, 14, SL.gold);
  // 먼 쪽 다리 (달릴 때는 아래 reindeerGallop이 네 다리를 함께 그린다)
  if (pose !== "walk")
    for (const x of [37, 45]) {
      g.vline(x, 16, 20, c.far);
      g.set(x, 21, c.hoof);
    }
  // 몸 · 등 줄무늬 · 배 · 꼬리
  g.ellipse(40.5, 13.4, 5.6, 2.4, c.body);
  g.recolor((x, y) => x >= 36 && x <= 46 && y === 11, c.back);
  g.recolor((x, y) => x >= 37 && x <= 44 && y === 15, c.belly);
  g.set(34, 12, c.belly);
  g.set(34, 11, c.belly);
  // 목 (앞으로 비스듬히 세운다) · 머리 (앞발로 긁을 땐 고개를 살짝 숙인다). 맨 오른쪽 열은 외곽선이 덮으니 코는 한 칸 안쪽에
  g.rect(44, 9 + nod, 2, 4, c.head);
  g.set(46, 9 + nod, c.head);
  g.set(46, 10 + nod, c.head);
  g.ellipse(48, 7.4 + nod, 2.2, 1.6, c.head);
  g.set(50, 8 + nod, c.belly);
  g.set(50, 7 + nod, c.nose);
  if (pose === "blink") g.set(48, 7 + nod, c.dark);
  else g.set(48, 6 + nod, c.eye);
  g.set(46, 6 + nod, c.dark); // 귀
  // 뿔 (가지 셋)
  g.vline(47, 3 + nod, 5 + nod, c.antler);
  g.set(46, 3 + nod, c.antler);
  g.set(45, 2 + nod, c.antler);
  g.set(48, 2 + nod, c.antler);
  g.set(49, 3 + nod, c.antler);
  g.set(44, 4 + nod, c.antler);
  // 빨간 목걸이 + 금방울 (달릴 때 흔들)
  g.hline(44, 46, 11 + nod, c.collar);
  g.set(pose === "walk" && f ? 46 : 45, 12 + nod, SL.gold);
  // 가까운 쪽 다리
  if (pose === "paw") {
    // 앞발을 들어 올린다
    g.vline(36, 16, 20, c.dark);
    g.set(36, 21, c.hoof);
    g.set(44, 16, c.dark);
    g.set(45, 17, c.dark);
    g.set(46, 17, c.hoof);
  } else if (pose === "scrape") {
    // 앞발로 눈을 긁어 뒤로 쓸어 내린다
    g.vline(36, 16, 20, c.dark);
    g.set(36, 21, c.hoof);
    g.vline(44, 16, 19, c.dark);
    g.set(45, 20, c.hoof);
  } else if (pose === "walk") reindeerGallop(g, f);
  else
    for (const x of [36, 44]) {
      g.vline(x, 16, 20, c.dark);
      g.set(x, 21, c.hoof);
    }
}
/** 달리는 루돌프 다리: 0 = 쭉 뻗기 (뒷다리는 뒤로, 앞다리는 앞으로 비스듬히) · 1 = 모으기 */
function reindeerGallop(g: Grid, f: number): void {
  const c = RD;
  const leg = (pts: readonly (readonly [number, number])[], col: number) => {
    pts.forEach(([x, y], i) => g.set(x, y, i === pts.length - 1 ? c.hoof : col));
  };
  if (f === 0) {
    leg([[38, 16], [38, 17], [38, 18], [37, 19], [37, 20], [37, 21]], c.far);
    leg([[44, 16], [44, 17], [44, 18], [45, 19], [45, 20], [45, 21]], c.far);
    leg([[37, 16], [37, 17], [36, 18], [36, 19], [35, 20], [35, 21]], c.dark);
    leg([[45, 16], [45, 17], [46, 18], [46, 19], [47, 20], [47, 21]], c.dark);
  } else {
    leg([[37, 16], [37, 17], [37, 18], [37, 19], [37, 20], [37, 21]], c.far);
    leg([[45, 16], [45, 17], [45, 18], [45, 19], [45, 20]], c.far);
    leg([[38, 16], [38, 17], [38, 18], [38, 19], [38, 20], [38, 21]], c.dark);
    leg([[44, 16], [44, 17], [44, 18], [43, 19], [43, 20]], c.dark);
  }
}
function sleighSide(g: Grid, f: number): void {
  sleighSack(g);
  sleighPanel(g);
  sleighRunners(g);
  sleighBell(g, f);
  reindeerSide(g, "walk", f);
}
/** 옆모습 멈춤·동작 (눈가루 없이, 루돌프만 바뀐다) */
function sleighRest(pose: "stand" | "blink" | "paw" | "scrape"): Draw {
  return (g) => {
    sleighSack(g);
    sleighPanel(g);
    sleighRunners(g);
    sleighBell(g, 0);
    reindeerSide(g, pose);
  };
}
/** 앞발로 긁어 튀긴 눈 (외곽선 위에 덧그린다) */
function sleighScrapeSnow(g: Grid, f: number): void {
  const pts = f ? [[46, 21], [47, 20], [43, 20], [42, 19], [47, 18]] : [[47, 21], [46, 20], [47, 19]];
  for (const [x, y] of pts) g.set(x, y, SL.snow, 235);
}
/** 달릴 때 눈가루 (몸 밑에 외곽선 없이). side = 썰매 날 뒤 + 발굽 밑, 그 밖은 양쪽 날 밑 */
function sleighSpray(side: boolean): Draw {
  return (g, f) => {
    const pts = side
      ? f
        ? [[0, 18], [1, 18], [1, 20], [2, 17], [0, 21], [2, 19], [0, 15], [37, 21], [38, 20], [47, 21]]
        : [[1, 19], [0, 20], [0, 19], [3, 18], [1, 16], [2, 21], [0, 17], [36, 20], [37, 21], [34, 21]]
      : f
        ? [[9 + SLEIGH_PAD, 20], [10 + SLEIGH_PAD, 18], [30 + SLEIGH_PAD, 19], [31 + SLEIGH_PAD, 21]]
        : [[10 + SLEIGH_PAD, 21], [9 + SLEIGH_PAD, 19], [31 + SLEIGH_PAD, 20], [30 + SLEIGH_PAD, 18]];
    pts.forEach(([x, y], i) => g.set(x, y, i % 2 ? SL.snowLo : SL.snow, 220));
  };
}
/** 앞모습 (탄 사람 뒤): 등받이 · 위로 삐죽 나온 선물 자루 · 양옆 판 · 썰매 날 */
function sleighFront(g: Grid): void {
  const c = SL;
  g.ellipse(20, 3.2, 4.2, 3, c.sack);
  g.rect(16, 0, 2, 2, c.box1);
  g.rect(22, 0, 2, 2, c.box2);
  g.set(16, 0, c.gold);
  g.set(23, 0, c.ribbon);
  g.rect(13, 5, 15, 7, c.red);
  g.hline(13, 27, 5, c.gold);
  g.rect(11, 9, 19, 8, c.red);
  g.recolor((x, y) => y >= 15, c.redLo);
  for (const x of [12, 28]) {
    g.vline(x, 17, 21, c.gold);
    g.set(x, 21, c.goldLo);
  }
}
/** 앞모습 덧그림 (탄 사람 앞): 앞판 · 앞코 말림 · 그 앞에서 고개를 든 꼬마 루돌프 */
function sleighFrontOver(g: Grid, f: number): void {
  const c = SL;
  const r = RD;
  g.rect(11, 11, 19, 6, c.red);
  g.recolor((x, y) => y >= 15, c.redLo);
  g.hline(11, 29, 11, c.gold);
  g.hline(11, 29, 16, c.goldLo);
  for (const x of [11, 29]) {
    g.set(x, 10, c.gold);
    g.set(x, 9, c.goldHi);
  }
  for (const x of [12, 28]) g.vline(x, 17, 21, c.gold);
  // 썰매 앞코 방울 둘 (흔들)
  g.set(13 + f, 17, c.gold);
  g.set(27 - f, 17, c.gold);
  // 루돌프 (앞을 본다)
  const lift = f ? 1 : 0;
  for (const [x, up] of [[18, lift], [22, 1 - lift]] as const) {
    g.vline(x, 19 - up, 20 - up, r.dark);
    g.set(x, 21 - up, r.hoof);
  }
  g.ellipse(20, 17.6, 2.8, 2.2, r.body);
  g.set(20, 18, r.belly);
  g.set(19, 18, r.belly);
  g.hline(18, 22, 16, r.collar);
  g.set(20 + f, 17, c.gold);
  g.ellipse(20, 13.6, 2.3, 2.1, r.head);
  g.hline(19, 21, 15, r.belly);
  g.set(20, 15, r.nose);
  g.set(19, 13, r.eye);
  g.set(21, 13, r.eye);
  g.set(17, 12, r.dark);
  g.set(23, 12, r.dark);
  for (const [x, y] of [[18, 10], [17, 9], [18, 9], [16, 8], [22, 10], [23, 9], [22, 9], [24, 8]] as const) g.set(x, y, r.antler);
}
/** 뒷모습 (탄 사람 뒤): 앞코 · 루돌프에게 이어진 가슴끈 둘. 끈 끝 위쪽에 멀리 루돌프 뒷모습 — 탈 때는 탄 사람에 가리고, 11/17 안 타고 따라올 때(위로 걷기) 보인다 */
function sleighBack(g: Grid): void {
  const c = SL;
  const r = RD;
  // 루돌프 뒷모습 (엉덩이·흰 꼬리·뒷다리, 머리 위로 뿔 끝)
  for (const x of [18, 22]) {
    g.vline(x, 5, 7, r.dark);
    g.set(x, 8, r.hoof);
  }
  g.ellipse(20, 3.4, 3.2, 2.4, r.body);
  g.recolor((x, y) => y <= 1 && x >= 18 && x <= 22, r.back);
  g.set(20, 3, r.belly);
  g.set(20, 4, r.belly);
  for (const [x, y] of [[17, 0], [16, 0], [23, 0], [24, 0]] as const) g.set(x, y, r.antler);
  for (let i = 0; i <= 8; i++) {
    g.set(13 + Math.round(i * 0.5), 8 - i, c.strap);
    g.set(27 - Math.round(i * 0.5), 8 - i, c.strap);
  }
  g.rect(11, 8, 19, 9, c.red);
  g.hline(11, 29, 8, c.gold);
  g.set(11, 7, c.goldHi);
  g.set(29, 7, c.goldHi);
  g.recolor((x, y) => y >= 15, c.redLo);
  for (const x of [12, 28]) g.vline(x, 17, 21, c.gold);
}
/** 뒷모습 덧그림 (탄 사람 앞): 등받이 뒷면(금 소용돌이) · 왼쪽 뒤칸에 불룩한 선물 자루 · 썰매 날 뒤끝 말림 */
function sleighBackOver(g: Grid, f: number): void {
  const c = SL;
  // 자루는 왼쪽 뒤칸에 (가운데를 비워 탄 사람 등이 보이게)
  g.ellipse(13.5, 9.4, 3.2, 2.8, c.sack);
  g.recolor((x, y) => x >= 15 && y >= 9, c.sackLo);
  g.set(12, 8, c.sackHi);
  g.hline(11, 15, 7, c.rope);
  g.rect(11, 5, 2, 2, c.box1);
  g.rect(14, 6, 2, 1, c.box2);
  g.set(14, 5, c.ribbon);
  g.rect(12, 10, 17, 7, c.red);
  g.recolor((x, y) => y >= 15, c.redLo);
  g.hline(12, 28, 10, c.gold);
  g.hline(12, 28, 16, c.goldLo);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1], [2, 2], [1, 3], [0, 3]] as const) g.set(19 + x, 11 + y, c.gold);
  for (const x of [12, 28]) {
    g.vline(x, 17, 21, c.gold);
    g.set(x, 21, c.goldHi);
  }
  // 등받이 뒤 방울 (흔들)
  g.set(14 + f, 17, c.gold);
  g.set(26 - f, 17, c.gold);
}

/** 40칸 기준으로 그린 앞·뒷모습을 넓힌 썰매 프레임 가운데로 옮겨 그린다 */
function padded(draw: Draw): Draw {
  return (g, f) => {
    const one = new Grid(40, MOUNT_H);
    draw(one, f);
    g.draw(one, SLEIGH_PAD, 0);
  };
}

const VIEWS: Record<MountKind, Views> = {
  hound: { side: houndSide, front: houndFront, back: houndBack, frontOver: houndHeadFront, backOver: houndBackBody, line: HOUND.line },
  goose: { side: gooseSide, front: gooseFront, back: gooseBack, frontOver: (g) => gooseNeckFront(g), backOver: gooseBackBody, line: GOOSE.line },
  deer: { side: deerSide, front: deerFront, back: deerBack, frontOver: (g) => deerHeadFront(g), backOver: deerBackBody, line: DEER.line },
  carp: { side: carpSide, front: carpFront, back: carpBack, frontOver: (g) => carpHeadFront(g), backOver: carpBackBody, line: CARP.line, under: carpWater },
  alpaca: { side: alpacaSide, front: alpacaFront, back: alpacaBack, frontOver: (g) => alpacaHeadFront(g), backOver: alpacaBackBody, line: ALPACA.line, extra: [(g) => alpacaRest(g, "open"), (g) => alpacaRest(g, "blink"), (g) => alpacaRest(g, "chew"), (g) => alpacaRest(g, "chewShut")] },
  polar: { side: polarSide, front: polarFront, back: polarBack, frontOver: (g) => polarHeadFront(g), backOver: polarBackBody, line: POLAR.line, extra: [(g) => polarSit(g, "open"), (g) => polarSit(g, "blink"), (g) => polarSit(g, "yawn"), (g) => polarSit(g, "yawnWide")] },
  sleigh: {
    side: sleighSide,
    front: padded((g) => sleighFront(g)),
    back: padded((g) => sleighBack(g)),
    frontOver: padded(sleighFrontOver),
    backOver: padded(sleighBackOver),
    line: SL.line,
    w: SLEIGH_W,
    under: (g, f, view) => sleighSpray(view === "side")(g, f),
    extra: [sleighRest("stand"), sleighRest("blink"), { draw: sleighRest("paw"), after: (g) => sleighScrapeSnow(g, 0) }, { draw: sleighRest("scrape"), after: (g) => sleighScrapeSnow(g, 1) }],
    sideOver: (g) => sleighPanel(g),
  },
};

/** 타는 펫 시트 (MOUNT_W × MOUNT_H × mountFrames(kind)) */
export function mountSheet(kind: MountKind): Grid {
  return sheet(VIEWS[kind]);
}
/** 타는 펫 시트 프레임 수 (기본 10장 + 덧붙인 멈춤·동작 + 옆모습 덧그림) */
export function mountFrames(kind: MountKind): number {
  return MOUNT_FRAMES + (VIEWS[kind].extra?.length ?? 0) + (VIEWS[kind].sideOver ? 1 : 0);
}
/** 타는 펫 프레임 너비 (루돌프 썰매만 넓다) */
export function mountW(kind: MountKind): number {
  return VIEWS[kind].w ?? MOUNT_W;
}
/**
 * 11/26 게임에서 쓰는 타는 펫 그림 (FX_ART): 프레임 끝에 닿은 꼬리지느러미(월척 잉어 옆모습)·뿔 끝·머리 꼭대기를
 * 여백을 두고 외곽선으로 닫는다 (artPad). 발밑(oy 1)·가운데(ox 0.5) 기준이라 탄 사람 자리·높이는 그대로
 */
export function mountArtDef(kind: MountKind, pad: Partial<ArtPad>) {
  return padArt({ w: mountW(kind), h: MOUNT_H, frames: mountFrames(kind), build: () => mountSheet(kind) }, VIEWS[kind].line, OUTLINE_A, pad);
}
/** 옆모습에서 탄 사람 앞에 덧그리는 프레임 (없으면 null) */
export function mountSideOver(kind: MountKind): number | null {
  const v = VIEWS[kind];
  return v.sideOver ? MOUNT_FRAMES + (v.extra?.length ?? 0) : null;
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
