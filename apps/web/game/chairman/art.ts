import * as Phaser from "phaser";
import { darken, Grid, hash2, lighten, type Color } from "../sprites/pixel";
import { BOSS_H, BOSS_W, line, OUT, pangyo, POSE_NAMES, POSES, VEST } from "./chairmanPixels";
import { furnitureGrid } from "../housing/art";
import { ARENA, COVER_FP, FL, WH, WW, type CoverKind } from "./rules";

// 11/20 회장님 독대 그림 (도트 Grid — 판이 뜰 때 한 번 텍스처로 굽는다).
//  - 회장실: 판교의 등대 꼭대기 · 밤 (창밖 야경, 나무 마루 + 붉은·금빛 융단, 가장자리 사무실 소품, 현수막)
//  - 판교 회장님: 패딩 조끼 · 체크 셔츠 · 사원증 · 텀블러. 단계(stg 0..5)마다 하나씩 벗어 던진 모습 × 동작
//  - 던진 물건 · 구조물 · 탄 · 벌레 · 트럭 · 직원 유령 · 글자 그림 (매 프레임 글자를 새로 그리지 않는다)

const FONT = '"Galmuri11", "Galmuri9", monospace';

export const CTX = {
  room: "ch-room",
  roomUp: "ch-room-up",
  roomDown: "ch-room-down",
  beam: "ch-beam",
  boss: (stg: number) => `ch-boss-${stg}`,
  bossEm: (stg: number) => `ch-boss-em-${stg}`,
  item: (k: number) => `ch-item-${k}`,
  cover: (k: CoverKind) => `ch-cv-${k}`,
  bug: "ch-bug",
  block: (i: number) => `ch-block-${i}`,
  folder: "ch-folder",
  cap: (i: number) => `ch-cap-${i}`,
  truck: "ch-truck",
  staff: (i: number) => `ch-staff-${i}`,
  tag: "ch-tag",
  paper: "ch-paper",
  arrow: "ch-arrow",
  seat: "ch-seat",
  coffee: "ch-coffee",
  dot: "ch-dot",
  label: (k: string) => `ch-lb-${k}`,
} as const;

// ── 작은 도구 ──

/** 윗면 + 앞면 상자 */
function box3(g: Grid, x: number, y: number, w: number, top: number, front: number, cTop: Color, cFront: Color): void {
  g.rect(x, y, w, top, cTop);
  g.rect(x, y + top, w, front, cFront);
  g.hline(x, x + w - 1, y, lighten(cTop, 0.2));
  g.hline(x, x + w - 1, y + top, darken(cTop, 0.15));
}

/** 3×5 도트 글자 (포스터·달력) */
const TF: Record<string, string> = { "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "9": "111101111001111", "-": "000000111000000", D: "110101101101110", "!": "010010010000010", Q: "111101101111001", A: "010101111101101", B: "110101110101110", "+": "000010111010000" };
function tiny(g: Grid, x: number, y: number, s: string, c: Color, k = 1): void {
  let cx = x;
  for (const ch of s) {
    const m = TF[ch];
    if (m) for (let i = 0; i < 15; i++) if (m[i] === "1") g.rect(cx + (i % 3) * k, y + Math.floor(i / 3) * k, k, k, c);
    cx += 4 * k;
  }
}

function addCanvas(scene: Phaser.Scene, key: string, cv: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
}
const addGrid = (scene: Phaser.Scene, key: string, g: Grid) => {
  if (!scene.textures.exists(key)) addCanvas(scene, key, g.toCanvas());
};

/** 단계마다 동작 프레임을 한 장에 (frame 이름 = 동작 이름). 빛 층(눈빛·펜 끝)은 따로 */
function ensureBoss(scene: Phaser.Scene, stg: number): void {
  const key = CTX.boss(stg);
  if (scene.textures.exists(key)) return;
  const n = POSE_NAMES.length;
  const body = document.createElement("canvas");
  const glow = document.createElement("canvas");
  body.width = glow.width = BOSS_W * n;
  body.height = glow.height = BOSS_H;
  const bc = body.getContext("2d")!;
  const gc = glow.getContext("2d")!;
  POSE_NAMES.forEach((name, i) => {
    const { g, em } = pangyo(POSES[name], stg);
    bc.drawImage(g.toCanvas(), i * BOSS_W, 0);
    gc.drawImage(em.toCanvas(), i * BOSS_W, 0);
  });
  const t = scene.textures.addCanvas(key, body);
  const te = scene.textures.addCanvas(CTX.bossEm(stg), glow);
  POSE_NAMES.forEach((name, i) => {
    t?.add(name, 0, i * BOSS_W, 0, BOSS_W, BOSS_H);
    te?.add(name, 0, i * BOSS_W, 0, BOSS_W, BOSS_H);
  });
}

export { BOSS_H, BOSS_W, POSE_NAMES, POSES, type PoseName } from "./chairmanPixels";

// ───────── 던지는 물건 · 탄 · 배우 ─────────

function vestS(): Grid {
  const g = new Grid(20, 16);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 20; x++) {
      if ((x > 7 && x < 12 && y < 6) || (y > 11 && (x < 2 || x > 17))) continue;
      let c = y < 2 ? VEST.hi : x > 14 ? VEST.lo : VEST.mid;
      if (y % 4 === 3) c = darken(c, 0.25);
      g.set(x, y + 1, c);
    }
  g.vline(9, 6, 14, 0x9aa4b4);
  g.outline(OUT);
  return g;
}
function cardS(): Grid {
  const g = new Grid(10, 12);
  line(g, 1, 0, 4, 4, 0xd8604a);
  line(g, 8, 0, 5, 4, 0xd8604a);
  g.rect(2, 4, 6, 7, 0xf6f4ee);
  g.rect(3, 5, 4, 3, 0x6a9ad0);
  g.hline(3, 6, 9, 0x9a9aa6);
  g.outline(OUT);
  return g;
}
function glassesS(): Grid {
  const g = new Grid(14, 6);
  for (const x of [0, 8]) {
    g.hline(x + 1, x + 4, 0, 0x6a4a3a);
    g.hline(x + 1, x + 4, 4, 0x6a4a3a);
    g.vline(x, 1, 3, 0x6a4a3a);
    g.vline(x + 5, 1, 3, 0x6a4a3a);
    g.rect(x + 1, 1, 4, 3, 0xd8eef6);
    g.set(x + 2, 2, 0xffffff);
  }
  g.hline(6, 7, 1, 0x6a4a3a);
  // 금 간 알
  g.set(10, 2, 0x8aa0b0);
  g.set(11, 3, 0x8aa0b0);
  g.set(3, 3, 0x8aa0b0);
  g.outline(OUT);
  return g;
}
function tumblerS(): Grid {
  const g = new Grid(6, 10);
  g.rect(1, 1, 4, 8, 0x6aa88a);
  g.hline(1, 4, 1, 0xf4f2ec);
  g.vline(2, 2, 8, 0x9ad0b4);
  g.outline(OUT);
  return g;
}
function bugS(): Grid {
  const g = new Grid(11, 8);
  g.ellipse(5.5, 4.5, 4, 3, 0x3a8a3a);
  g.vline(5, 2, 7, 0x1a4a1a);
  g.rect(4, 0, 3, 2, 0x2a2a2a);
  g.set(4, 0, 0xff5a44);
  g.set(6, 0, 0xff5a44);
  for (const y of [3, 5]) {
    g.set(0, y, 0x1a1420);
    g.set(10, y, 0x1a1420);
  }
  g.set(3, 3, 0x8ae07a);
  g.outline(OUT);
  return g;
}
function blockS(c: Color): Grid {
  const g = new Grid(14, 14);
  g.rect(1, 1, 12, 12, c);
  g.hline(1, 12, 1, lighten(c, 0.35));
  g.vline(1, 1, 12, lighten(c, 0.2));
  g.hline(1, 12, 12, darken(c, 0.35));
  g.vline(12, 1, 12, darken(c, 0.25));
  g.rect(3, 3, 3, 3, lighten(c, 0.5));
  g.outline(OUT);
  return g;
}
export const BLOCK_COLORS = [0xe8604c, 0xf2c46b, 0x6ad07a, 0x4a78c0, 0xb07cff, 0xff8ac0];
function folderS(): Grid {
  const g = new Grid(16, 13);
  g.rect(1, 3, 14, 10, 0xe8b850);
  g.rect(1, 2, 6, 1, 0xe8b850);
  g.hline(1, 14, 3, 0xf8d880);
  g.rect(4, 6, 8, 1, 0xb8862e);
  g.rect(4, 8, 6, 1, 0xb8862e);
  line(g, 13, 2, 15, 0, 0x6a4a3a);
  g.set(15, 0, 0xffd25a);
  g.outline(OUT);
  return g;
}
/** 11/22 탕비실 믹스커피 종이컵 (위가 넓다 · 노랑·빨강 띠) */
function coffeeS(): Grid {
  const g = new Grid(10, 12);
  g.hline(1, 8, 1, 0xffffff);
  g.hline(2, 7, 2, 0x7a4a2a);
  g.set(1, 2, 0xffffff);
  g.set(8, 2, 0xffffff);
  for (let y = 3; y <= 10; y++) {
    const i = Math.floor((y - 3) / 4);
    g.hline(1 + i, 8 - i, y, 0xf2ead8);
    g.set(8 - i, y, 0xd8ccb0);
  }
  g.hline(1, 7, 5, 0xf2c46b);
  g.hline(1, 7, 6, 0xc9402f);
  g.hline(3, 6, 11, 0xd8ccb0);
  g.outline(OUT);
  return g;
}
const CAP_COLORS = [0xff6a8a, 0x6ab8ff, 0xffd25a, 0x8ae07a];
function capS(c: Color): Grid {
  const g = new Grid(10, 10);
  g.ellipse(5, 5, 4.4, 4.4, c);
  for (let y = 5; y < 10; y++) for (let x = 0; x < 10; x++) if (g.filled(x, y)) g.set(x, y, 0xf6f4ee);
  g.hline(1, 8, 5, darken(c, 0.3));
  g.set(3, 2, 0xffffff);
  g.outline(OUT);
  return g;
}
function truckS(c: Color): Grid {
  const g = new Grid(56, 26);
  box3(g, 2, 0, 34, 4, 16, lighten(c, 0.1), c);
  g.rect(4, 5, 30, 12, 0x101420);
  box3(g, 37, 6, 15, 3, 13, 0xf2ead3, 0xd8d0b8);
  g.rect(40, 10, 9, 5, 0x6a9ad0);
  for (const x of [8, 26, 44]) {
    g.ellipse(x, 22, 3.4, 3.4, 0x1a1a22);
    g.set(x, 22, 0x8a8a98);
  }
  g.rect(50, 15, 3, 2, 0xffe08a);
  g.outline(OUT);
  return g;
}
const SUITS = [0x4a5a7a, 0x5a4a6a, 0x6a5a4a, 0x3a5a5a, 0x7a4a4a, 0x4a4a6a];
const TIES = [0xc9402f, 0x4a78c0, 0xf2c46b];
/** 야근하는 직원 (명찰을 단 정장, 반은 졸린 눈) */
function staffS(i: number): Grid {
  const g = new Grid(14, 22);
  const suit = SUITS[i % SUITS.length];
  g.rect(4, 17, 2, 4, 0x2a2a34);
  g.rect(8, 17, 2, 4, 0x2a2a34);
  g.rect(3, 10, 8, 8, suit);
  g.rect(2, 11, 2, 5, darken(suit, 0.15));
  g.rect(10, 11, 2, 5, darken(suit, 0.15));
  g.rect(6, 10, 2, 5, 0xf6f4ee);
  g.vline(7, 11, 14, TIES[i % 3]);
  g.rect(4, 13, 2, 2, 0xf6f4ee);
  g.ellipse(7, 6, 4, 4, 0xf0cbaa);
  g.rect(3, 2, 8, 3, i % 2 ? 0x3a2a22 : 0x1a1420);
  if (i % 3 === 0) {
    g.hline(5, 6, 6, 0x1a1420);
    g.hline(8, 9, 6, 0x1a1420);
  } else {
    g.set(5, 6, 0x1a1420);
    g.set(9, 6, 0x1a1420);
  }
  g.outline(OUT);
  return g;
}
/** 다시 앉을 「내 자리」 의자 */
function seatS(): Grid {
  const g = new Grid(14, 16);
  g.rect(3, 0, 8, 8, 0x4a78c0);
  g.hline(3, 10, 0, 0x6a98e0);
  box3(g, 1, 7, 12, 3, 3, 0x5a88d0, 0x3a5aa0);
  g.vline(7, 13, 15, 0x3a3a46);
  g.hline(3, 11, 15, 0x3a3a46);
  g.outline(OUT);
  return g;
}

// ───────── 구조물 (숨을 곳) ─────────

function partitionS(): Grid {
  const g = new Grid(34, 30);
  g.rect(2, 26, 2, 3, 0x3a4256);
  g.rect(30, 26, 2, 3, 0x3a4256);
  g.rect(0, 4, 34, 22, 0x3a4256);
  g.rect(2, 6, 30, 18, 0x7a8aa6);
  g.hline(2, 31, 6, 0x9aaac4);
  for (let y = 8; y < 24; y += 3) for (let x = 3; x < 31; x += 2) if (hash2(x, y, 5) < 0.3) g.set(x, y, 0x6a7a96);
  for (const [x, y, c] of [
    [5, 9, 0xffe08a],
    [11, 13, 0xff9ac0],
    [21, 8, 0x9ae0a8],
    [25, 15, 0xffe08a],
    [8, 18, 0x9ad0ff],
  ]) {
    g.rect(x, y, 4, 4, c);
    g.hline(x, x + 3, y, lighten(c, 0.3));
  }
  g.outline(OUT);
  return g;
}
function coverGrid(k: CoverKind): Grid {
  if (k === "partition") return partitionS();
  const id = { copier: "copier", cooler: "water_cooler", table: "meeting_table", pile: "paper_pile" }[k];
  const g = furnitureGrid(id);
  if (g) return g;
  const w = COVER_FP[k][0];
  const fb = new Grid(w, 20);
  box3(fb, 0, 0, w, 6, 14, 0x9a9aa6, 0x6a6a76);
  fb.outline(OUT);
  return fb;
}

// ───────── 글자 그림 ─────────

/** 글자를 한 번 텍스처로 굽는다 (도트 글꼴 원래 크기 → 화면에서 정수배) */
export function labelTex(scene: Phaser.Scene, key: string, text: string, o: { color?: string; px?: number; stroke?: string; strokeW?: number; bg?: string; border?: string; padX?: number; padY?: number } = {}): string {
  const k = CTX.label(key);
  if (scene.textures.exists(k)) return k;
  const px = o.px ?? 12;
  const cv = document.createElement("canvas");
  const c0 = cv.getContext("2d")!;
  c0.font = `${px}px ${FONT}`;
  const tw = Math.ceil(c0.measureText(text).width);
  const padX = o.padX ?? (o.bg ? 5 : 2);
  const padY = o.padY ?? (o.bg ? 3 : 2);
  cv.width = tw + padX * 2;
  cv.height = px + padY * 2 + 2;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  if (o.bg) {
    c.fillStyle = o.bg;
    c.fillRect(0, 0, cv.width, cv.height);
    if (o.border) {
      const bw = px >= 18 ? 3 : 2;
      c.strokeStyle = o.border;
      c.lineWidth = bw;
      c.strokeRect(bw / 2, bw / 2, cv.width - bw, cv.height - bw);
    }
  }
  c.font = `${px}px ${FONT}`;
  c.textBaseline = "top";
  if (o.stroke) {
    c.strokeStyle = o.stroke;
    c.lineWidth = o.strokeW ?? 3;
    c.lineJoin = "round";
    c.strokeText(text, padX, padY + 1);
  }
  c.fillStyle = o.color ?? "#fff4dc";
  c.fillText(text, padX, padY + 1);
  scene.textures.addCanvas(k, cv);
  return k;
}

/** 말풍선 글자 크기 (화면 px — 도트 글꼴 11의 두 배라 또렷하다) · 한 줄 최대 너비 */
export const BUBBLE_PX = 22;
const BUBBLE_MAXW = BUBBLE_PX * 12;

/** 띄어쓰기 단위로 줄을 나눈다 (한 줄이 maxW를 넘지 않게, 한 낱말이 길면 그대로) */
export function wrapWords(text: string, maxW: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(next) > maxW) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * 말풍선 (회장님 머리 위). 11/20 사용자 「말풍선 글씨도 더 잘 보이게」 → 글자 22px(예전 12px의 1.8배)·두꺼운 검은 테·아래 그림자,
 * 길면 두 줄. 판마다 한 번 굽는다 (같은 대사는 같은 그림)
 */
export function bubbleTex(scene: Phaser.Scene, key: string, text: string): string {
  const k = CTX.label(`bb2-${key}`);
  if (scene.textures.exists(k)) return k;
  const px = BUBBLE_PX;
  const lh = px + 4;
  const cv = document.createElement("canvas");
  const c0 = cv.getContext("2d")!;
  c0.font = `${px}px ${FONT}`;
  const lines = wrapWords(text, BUBBLE_MAXW, (t) => c0.measureText(t).width);
  const tw = Math.ceil(Math.max(...lines.map((l) => c0.measureText(l).width)));
  const B = 3;
  const w = tw + 24;
  const h = lines.length * lh + 14;
  const tail = 10;
  cv.width = w + 4;
  cv.height = h + tail + 4;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  const mx = Math.round(w / 2);
  // 그림자 (아래·오른쪽 3px)
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.fillRect(4, 4, w, h);
  // 테 + 바탕 (모서리를 깎은 상자)
  c.fillStyle = "#120c10";
  c.fillRect(2, 0, w - 4, h);
  c.fillRect(0, 2, w, h - 4);
  c.fillStyle = "#fffaf0";
  c.fillRect(B + 1, B, w - 2 * B - 2, h - 2 * B);
  c.fillRect(B, B + 1, w - 2 * B, h - 2 * B - 2);
  // 꼬리
  c.fillStyle = "#120c10";
  c.fillRect(mx - 9, h - 1, 19, 3);
  c.fillRect(mx - 7, h + 2, 15, 3);
  c.fillRect(mx - 4, h + 5, 9, 3);
  c.fillRect(mx - 1, h + 8, 3, 2);
  c.fillStyle = "#fffaf0";
  c.fillRect(mx - 6, h - B, 13, B + 1);
  c.fillRect(mx - 4, h + 1, 9, 2);
  c.fillRect(mx - 2, h + 3, 5, 3);
  c.fillRect(mx, h + 6, 1, 1);
  c.font = `${px}px ${FONT}`;
  c.textBaseline = "top";
  c.textAlign = "center";
  lines.forEach((l, i) => {
    c.fillStyle = "#c8b89a";
    c.fillText(l, mx + 1, 8 + i * lh + 1);
    c.fillStyle = "#1a0e08";
    c.fillText(l, mx, 8 + i * lh);
  });
  scene.textures.addCanvas(k, cv);
  return k;
}

// ───────── 회장실 ─────────

export const WINS: readonly [number, number, number, number][] = [
  [14, 8, 70, 30],
  [556, 8, 70, 30],
];

function chairDesk(): Grid {
  const W = 92;
  const g = new Grid(W, 46);
  g.rect(36, 0, 20, 20, 0x5a2a24);
  g.rect(36, 0, 20, 2, 0x8a4434);
  g.rect(38, 3, 16, 14, 0x6a3228);
  for (let y = 5; y < 16; y += 4) for (let x = 40; x < 53; x += 4) g.set(x, y, 0x3a1810);
  box3(g, 2, 16, 88, 9, 14, 0x7a4a2c, 0x5a3220);
  g.hline(2, 89, 16, 0xa06a42);
  for (let x = 8; x < 88; x += 20) g.vline(x, 26, 37, 0x4a2818);
  g.rect(36, 27, 20, 7, 0xd8a840);
  g.rect(37, 28, 18, 5, 0xf2c46b);
  g.hline(37, 54, 28, 0xffe08a);
  for (const [x, c] of [
    [8, 0x3a8a5a],
    [62, 0x5a5ad0],
  ] as const) {
    g.rect(x, 4, 22, 13, 0x22252e);
    g.rect(x + 1, 5, 20, 10, c);
    g.rect(x + 9, 17, 4, 2, 0x22252e);
  }
  g.ellipse(17, 12, 4, 3, 0x8ae07a);
  g.set(15, 11, 0x1a1420);
  g.set(19, 11, 0x1a1420);
  g.hline(10, 28, 14, 0x2a6a3a);
  for (let i = 0; i < 5; i++) g.rect(64 + i * 4, 13 - i * 2, 3, 2 + i * 2, i === 4 ? 0xff5a44 : 0x9ad0ff);
  g.rect(33, 9, 5, 5, 0xf2c46b);
  g.rect(34, 14, 3, 2, 0xb8862e);
  g.rect(33, 16, 5, 1, 0xb8862e);
  g.rect(57, 10, 3, 6, 0x6aa88a);
  g.hline(57, 59, 10, 0xf4f2ec);
  for (let k = 0; k < 4; k++) g.rect(44 + k, 13 - k, 9, 3, k % 2 ? 0xf6f2e4 : 0xe6e0cc);
  g.outline(OUT);
  return g;
}
function poster(kind: "dday" | "slime" | "qa"): Grid {
  const g = new Grid(20, 26);
  if (kind === "dday") {
    g.rect(0, 0, 20, 26, 0xc9402f);
    g.rect(1, 1, 18, 24, 0xe0503c);
    tiny(g, 2, 7, "D-3", 0xfff4dc, 2);
    g.rect(2, 19, 16, 2, 0xfff4dc);
  } else if (kind === "slime") {
    g.rect(0, 0, 20, 26, 0x2a3a5a);
    g.rect(1, 1, 18, 24, 0x3a5a8a);
    for (let y = 2; y < 12; y++) for (let x = 2; x < 18; x++) if (hash2(x, y, 7) < 0.06) g.set(x, y, 0xffffff);
    g.ellipse(10, 17, 6, 5, 0x6ad07a);
    g.rect(4, 18, 13, 4, 0x6ad07a);
    g.hline(5, 9, 14, 0xb8f0b0);
    g.set(8, 17, 0x1a1420);
    g.set(12, 17, 0x1a1420);
    g.rect(9, 3, 2, 6, 0xf2c46b);
    tiny(g, 2, 2, "B", 0xffe08a);
  } else {
    g.rect(0, 0, 20, 26, 0xf2ead3);
    g.rect(1, 1, 18, 24, 0xfaf6ea);
    tiny(g, 3, 3, "QA", 0x3a3a48);
    tiny(g, 3, 10, "999", 0xc9402f);
    tiny(g, 3, 17, "+", 0xc9402f);
    for (let x = 7; x < 18; x++) g.set(x, 21 - Math.round((x - 7) * 0.4), 0x4a78c0);
  }
  g.outline(OUT);
  return g;
}
function arcade(): Grid {
  const g = new Grid(20, 36);
  g.rect(2, 2, 16, 32, 0x3a2a6a);
  g.rect(2, 2, 16, 4, 0xe85a9a);
  g.rect(4, 3, 12, 2, 0xffd0e8);
  g.rect(4, 8, 12, 10, 0x101420);
  g.rect(5, 9, 10, 8, 0x2a6ad0);
  for (let i = 0; i < 6; i++) g.set(6 + i, 15 - (i % 3), 0xffe08a);
  g.rect(9, 11, 2, 2, 0xff5a44);
  box3(g, 1, 20, 18, 4, 3, 0x4a3a7a, 0x2a1a5a);
  g.rect(5, 21, 2, 2, 0xff5a44);
  g.rect(11, 21, 2, 2, 0x6aff9a);
  g.rect(3, 27, 14, 6, 0x2a1a5a);
  g.rect(8, 29, 4, 2, 0xf2c46b);
  g.outline(OUT);
  return g;
}
function beanbag(c: Color, sleeper: boolean): Grid {
  const g = new Grid(26, 18);
  g.ellipse(13, 11, 12, 6, c);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 26; x++) if (g.filled(x, y)) g.set(x, y, y < 8 ? lighten(c, 0.18) : y > 13 ? darken(c, 0.2) : c);
  if (sleeper) {
    g.ellipse(10, 7, 4, 4, 0xeccaa8);
    g.rect(6, 4, 8, 2, 0x3a2a22);
    g.rect(12, 8, 9, 4, 0x6a7a9a);
    g.hline(8, 11, 8, 0x1a1420);
  }
  g.outline(OUT);
  return g;
}
function pizza(): Grid {
  const g = new Grid(16, 14);
  for (let k = 0; k < 3; k++) box3(g, 0, 8 - k * 4, 16, 2, 2, 0xd8b078, 0xb88a50);
  g.rect(5, 0, 6, 2, 0xc9402f);
  g.outline(OUT);
  return g;
}
function whiteboard(): Grid {
  const g = new Grid(40, 24);
  g.rect(0, 0, 40, 20, 0xd8dce4);
  g.rect(1, 1, 38, 18, 0xf6f8fa);
  g.rect(4, 20, 2, 4, 0x8a8a98);
  g.rect(34, 20, 2, 4, 0x8a8a98);
  for (let x = 4; x < 36; x++) g.set(x, 4 + Math.round((x - 4) * 0.35), 0x4a78c0);
  for (let x = 4; x < 36; x++) g.set(x, 16 - Math.round(Math.max(0, x - 20) * 0.7), 0xc9402f);
  tiny(g, 30, 3, "!", 0xc9402f);
  g.outline(OUT);
  return g;
}
function clockS(): Grid {
  const g = new Grid(14, 14);
  g.ellipse(7, 7, 6, 6, 0xf6f2e4);
  g.vline(7, 3, 7, 0x1a1420);
  g.hline(7, 10, 7, 0xc9402f);
  tiny(g, 5, 9, "3", 0x9a9aa6);
  g.outline(OUT);
  return g;
}
function boxS(c: Color, w: number, h: number): Grid {
  const g = new Grid(w, h);
  box3(g, 0, 0, w, 3, h - 3, lighten(c, 0.15), c);
  g.vline(Math.floor(w / 2), 0, 2, 0xd8c8a0);
  g.outline(OUT);
  return g;
}
function papersFloor(seed: number): Grid {
  const g = new Grid(20, 8);
  for (let k = 0; k < 4; k++) {
    const x = Math.floor(hash2(k, seed, 3) * 12);
    const y = Math.floor(hash2(k, seed, 9) * 4);
    g.rect(x, y, 7, 4, k % 2 ? 0xf6f2e4 : 0xe6e0cc);
    g.hline(x + 1, x + 5, y + 1, 0xb8b0a0);
  }
  return g;
}

/** 마루 한 칸 색 (판 밖 아래로 이어 그릴 때도 같은 무늬) */
function woodAt(x: number, y: number): Color {
  const row = Math.floor((y - FL) / 8);
  const off = (row * 37) % 64;
  const plank = Math.floor((x + off) / 64);
  let c: Color = (row + plank) % 2 ? 0xa07048 : 0x936240;
  if ((y - FL) % 8 === 0) c = 0x6a4228;
  else if ((x + off) % 64 === 0) c = 0x7a4c30;
  else if (hash2(x >> 1, y, row) < 0.05) c = darken(c, 0.08);
  return c;
}

/** 큰 바닥·벽 (도트 한 장) */
function roomGrid(): Grid {
  const g = new Grid(WW, WH);
  // 벽지 (짙은 자줏빛) + 몰딩 + 걸레받이
  for (let y = 0; y < FL; y++)
    for (let x = 0; x < WW; x++) {
      let c = 0x4a3a54;
      if (x % 24 === 0) c = 0x423350;
      if (y < 3) c = 0x2e2436;
      if (y > FL - 6) c = y > FL - 3 ? 0x2a1c18 : 0x5a3a2c;
      g.set(x, y, c);
    }
  // 나무 마루 (판자 줄 · 이음매)
  for (let y = FL; y < WH; y++) for (let x = 0; x < WW; x++) g.set(x, y, woodAt(x, y));
  // 큰 융단 (빨강·금빛 테)
  // 융단 = 걸을 수 있는 판 전체 (금빛 테가 판 끝)
  const x0 = ARENA.x0;
  const x1 = ARENA.x1;
  const y0 = ARENA.y0;
  const y1 = ARENA.y1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const e = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      let c: Color;
      if (e < 2) c = 0xb8862e;
      else if (e < 3) c = 0xf2c46b;
      else if (e < 9) c = ((x + y) >> 1) % 4 === 0 ? 0xe8b850 : 0x6a1a24;
      else if (e < 10) c = 0xd8a840;
      else {
        c = (x + y * 2) % 16 === 0 || (x * 2 - y) % 16 === 0 ? 0xa83a40 : 0x962a36;
        // 가운데 금빛 체크 원은 뺐다 (기술 경고 칸처럼 보였다)
        if (hash2(x, y, 11) < 0.05) c = darken(c, 0.08);
      }
      g.set(x, y, c);
    }
  for (let x = x0; x < x1; x += 4) {
    g.set(x, y1, 0xe8d8b0);
    g.set(x + 1, y1 + 1, 0xe8d8b0);
    g.set(x, y0 - 1, 0xe8d8b0);
  }
  // 창문 (밤 하늘 · 판교 야경)
  for (const [wx, wy, ww, wh] of WINS) {
    g.rect(wx - 2, wy - 2, ww + 4, wh + 4, 0x2a1e18);
    for (let y = 0; y < wh; y++)
      for (let x = 0; x < ww; x++) {
        const k = y / wh;
        let c = k < 0.5 ? 0x0e1430 : k < 0.8 ? 0x16204a : 0x2a2a5a;
        if (hash2(x + wx, y, 21) < 0.01 && k < 0.5) c = 0xe8f0ff;
        g.set(wx + x, wy + y, c);
      }
    // 빌딩 실루엣 + 불 켜진 창
    let bx = wx;
    let n = 0;
    while (bx < wx + ww) {
      const bw = 6 + Math.floor(hash2(bx, n, 4) * 10);
      const bh = 6 + Math.floor(hash2(bx, n, 8) * 16);
      for (let y = wy + wh - bh; y < wy + wh; y++)
        for (let x = bx; x < Math.min(bx + bw, wx + ww); x++) {
          const lit = (x - bx) % 3 === 1 && (y - (wy + wh - bh)) % 3 === 1 && hash2(x, y, 31) < 0.45;
          g.set(x, y, lit ? (hash2(x, y, 5) < 0.5 ? 0xffd890 : 0xa8d8ff) : 0x0a0c1a);
        }
      bx += bw + 1;
      n++;
    }
    g.vline(wx + Math.floor(ww / 2), wy, wy + wh - 1, 0x2a1e18);
    g.hline(wx, wx + ww - 1, wy + wh, 0x8a5a38);
    g.hline(wx - 2, wx + ww + 1, wy + wh + 2, 0x6a4228);
  }
  // 달 (오른쪽 끝 창)
  g.ellipse(612, 16, 4, 4, 0xfff4c8);
  g.ellipse(614, 15, 3, 3, 0x0e1430);
  return g;
}

type Piece = { g: Grid; x: number; y: number };

/** 회장실 한 장 (밤 조명까지 구워 둔다) */
function roomCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = WW;
  cv.height = WH;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  c.drawImage(roomGrid().toCanvas(), 0, 0);
  const put: Piece[] = [];
  const add = (g: Grid | null, x: number, y: number) => g && put.push({ g, x, y });
  // 벽: 포스터 · 시계 · 화이트보드 · 트로피 선반
  // 위 가운데는 피해 계기판 자리 → 현수막은 왼쪽 창 옆, 가운데엔 트로피 선반·시계
  // 11/20 판을 640×400으로 좁히며 다시 배치 (창 둘 · 현수막 왼쪽 · 오른쪽 벽에 시계·화이트보드·포스터)
  for (const [x, k] of [
    [490, "slime"],
    [514, "dday"],
    [538, "qa"],
  ] as const)
    add(poster(k), x, 46);
  add(whiteboard(), 450, 50);
  add(clockS(), 408, 26);
  add(chairDesk(), WW / 2, 116);
  add(furnitureGrid("rubber_tree"), WW / 2 - 70, 116);
  add(furnitureGrid("rubber_tree"), WW / 2 + 70, 116);
  add(furnitureGrid("banker_lamp"), WW / 2 - 104, 104);
  add(furnitureGrid("file_cabinet"), WW / 2 + 104, 112);
  add(furnitureGrid("file_cabinet"), WW / 2 + 122, 112);
  // 왼쪽: 개발팀 자리 · 오락기 · 빈백 · 피자
  for (const y of [158, 222, 286]) {
    add(furnitureGrid("monitor_desk"), 42, y);
    add(furnitureGrid("swivel_chair"), 42, y + 14);
  }
  add(arcade(), 16, 360);
  add(arcade(), 38, 360);
  add(furnitureGrid("coffee_machine"), 66, 350);
  add(beanbag(0x4a78c0, true), 30, 388);
  add(pizza(), 66, 398);
  add(furnitureGrid("rubber_tree"), 14, 110);
  // 오른쪽: 서버 랙 · 복사기 · 정수기 · 기획팀 자리
  for (const x of [584, 604, 624]) add(furnitureGrid("server_rack"), x, 150);
  add(furnitureGrid("copier"), 600, 214);
  add(furnitureGrid("water_cooler"), 628, 258);
  add(furnitureGrid("monitor_desk"), 598, 304);
  add(furnitureGrid("swivel_chair"), 598, 318);
  add(furnitureGrid("rubber_tree"), 626, 372);
  add(beanbag(0xc9402f, false), 594, 392);
  add(boxS(0xb88a5a, 14, 12), 572, 360);
  add(furnitureGrid("rubber_tree"), WW - 14, 110);
  for (const [x, y] of [
    [150, 396],
    [290, 398],
    [400, 396],
    [500, 398],
  ])
    add(papersFloor(x), x, y);
  put.sort((a, b) => a.y - b.y);
  for (const p of put) c.drawImage(p.g.toCanvas(), Math.round(p.x - p.g.w / 2), Math.round(p.y - p.g.h));
  // 현수막 「야근은 집합의 힘이다!」
  const bw = 136;
  const bcx = 162;
  const bx = bcx - bw / 2;
  c.fillStyle = "#5a1420";
  c.fillRect(bx - 1, 5, bw + 2, 22);
  c.fillStyle = "#8a2030";
  c.fillRect(bx, 6, bw, 20);
  c.fillStyle = "#d8a840";
  c.fillRect(bx, 6, bw, 2);
  c.fillRect(bx, 24, bw, 2);
  c.fillStyle = "#d8a840";
  for (const x of [bx - 3, bx + bw + 1]) c.fillRect(x, 3, 2, 26);
  c.font = `12px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "top";
  c.fillStyle = "#2a0810";
  c.fillText("야근은 집합의 힘이다!", bcx + 1, 10);
  c.fillStyle = "#ffe0a8";
  c.fillText("야근은 집합의 힘이다!", bcx, 9);
  // 트로피 선반
  c.fillStyle = "#6a4a30";
  c.fillRect(WW / 2 - 70, 40, 140, 3);
  for (let i = 0; i < 6; i++) {
    const x = WW / 2 - 60 + i * 24;
    c.fillStyle = i % 2 ? "#c8ccd8" : "#f2c46b";
    c.fillRect(x, 32, 6, 6);
    c.fillRect(x + 2, 38, 2, 2);
  }
  // 밤: 방 전체를 푸르스름하게 누르고, 등불·모니터·창이 따뜻하게 비춘다
  c.globalCompositeOperation = "multiply";
  c.fillStyle = "#7a7aae";
  c.fillRect(0, 0, WW, WH);
  c.globalCompositeOperation = "lighter";
  const glow = (x: number, y: number, r: number, col: string, a: number, sy = 0.7) => {
    c.save();
    c.translate(x, y);
    c.scale(1, sy);
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, col.replace("A", String(a)));
    gr.addColorStop(1, col.replace("A", "0"));
    c.fillStyle = gr;
    c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();
  };
  glow(WW / 2, 250, 230, "rgba(255,200,130,A)", 0.16, 0.55);
  glow(WW / 2, 100, 90, "rgba(255,210,140,A)", 0.22);
  glow(WW / 2 - 104, 96, 46, "rgba(255,216,140,A)", 0.4);
  for (const y of [158, 222, 286]) glow(42, y - 6, 36, "rgba(150,220,180,A)", 0.18);
  glow(598, 298, 36, "rgba(160,190,255,A)", 0.18);
  glow(27, 350, 36, "rgba(255,140,220,A)", 0.22);
  for (const x of [584, 604, 624]) glow(x, 136, 20, "rgba(140,255,170,A)", 0.16);
  glow(bcx, 16, 90, "rgba(255,180,140,A)", 0.14, 0.4);
  for (const [wx, wy, ww, wh] of WINS) glow(wx + ww / 2, wy + wh + 14, 60, "rgba(150,170,255,A)", 0.12, 0.5);
  c.globalCompositeOperation = "source-over";
  return cv;
}

// 11/21 폰 회장님 독대: 카메라가 HUD에 가린 만큼 판 위·아래로 더 굴러가 방 밖 검은 빈칸이 보였다
//  → 방 그림을 위(벽·천장 테·밤하늘)·아래(마루·소파 → 남쪽 벽 윗면 → 빌딩 유리벽)로 이어 그린다
/** 방 위로 이어 그린 높이 · 아래로 이어 그린 높이 (월드 px — 카메라가 이보다 더 굴러가지 않는다) */
export const EXT_T = 150;
export const EXT_B = 180;

/** 방 밖 띠 한 장에 밤 조명 (방과 같은 색 누름) */
function nightTint(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.globalCompositeOperation = "multiply";
  c.fillStyle = "#7a7aae";
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "source-over";
}

/** 빌딩 유리벽 (밤 · 불 켜진 칸 몇 개) — y0부터 h줄, 아래로 갈수록 어둡게 */
function glassWall(g: Grid, y0: number, h: number, seed: number, down: boolean): void {
  for (let y = 0; y < h; y++) {
    const k = down ? y / h : 1 - y / h;
    for (let x = 0; x < WW; x++) {
      const cx = Math.floor(x / 32);
      const cy = Math.floor(y / 22);
      let c: Color = darken(0x1c2440, k * 0.45);
      if (x % 32 === 0 || y % 22 === 0) c = darken(0x3a3a50, k * 0.4);
      else if (x % 32 === 1 || y % 22 === 1) c = darken(0x2a3254, k * 0.4);
      else {
        const lit = hash2(cx, cy, seed);
        if (lit < 0.22 && (x % 32) > 3 && (y % 22) > 3 && (x % 32) < 29 && (y % 22) < 19) c = darken(lit < 0.12 ? 0xe8c070 : 0x8ab0e0, 0.35 + k * 0.3);
        else if ((x + y) % 23 === 0) c = darken(0x3a4a78, k * 0.4);
      }
      g.set(x, y0 + y, c);
    }
  }
}

/** 방 아래 띠: 마루 이어짐 + 대기 소파·소품 → 남쪽 벽 윗면 → 빌딩 유리벽 */
function roomBelowCanvas(): HTMLCanvasElement {
  const FLOOR = 64;
  const CAP = 14;
  const g = new Grid(WW, EXT_B);
  for (let y = 0; y < FLOOR; y++) for (let x = 0; x < WW; x++) g.set(x, y, woodAt(x, WH + y));
  // 벽 아래 그늘
  for (let y = FLOOR - 5; y < FLOOR; y++) for (let x = 0; x < WW; x++) g.set(x, y, darken(woodAt(x, WH + y), 0.08 * (y - FLOOR + 6)));
  // 남쪽 벽 윗면 (걸레받이와 같은 짙은 나무)
  for (let x = 0; x < WW; x++) {
    g.set(x, FLOOR, 0x8a5a38);
    g.set(x, FLOOR + 1, 0x6a4228);
    for (let y = FLOOR + 2; y < FLOOR + CAP - 3; y++) g.set(x, y, x % 48 === 0 ? 0x3a2418 : hash2(x, y, 41) < 0.06 ? 0x4a2c1e : 0x5a3a2c);
    for (let y = FLOOR + CAP - 3; y < FLOOR + CAP; y++) g.set(x, y, 0x2a1c18);
  }
  glassWall(g, FLOOR + CAP, EXT_B - FLOOR - CAP, 57, true);
  const cv = document.createElement("canvas");
  cv.width = WW;
  cv.height = EXT_B;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  c.drawImage(g.toCanvas(), 0, 0);
  const put: Piece[] = [];
  const add = (p: Grid | null, x: number, y: number) => p && put.push({ g: p, x, y });
  // 아래 벽에 붙은 대기 자리 (가운데는 비워 둔다 — 내 캐릭터 발밑)
  add(furnitureGrid("bookshelf"), 110, FLOOR + 2);
  add(furnitureGrid("pot"), 146, FLOOR + 2);
  add(furnitureGrid("floor_lamp"), 196, FLOOR + 2);
  add(furnitureGrid("sofa"), 236, FLOOR + 4);
  add(furnitureGrid("table"), 272, FLOOR + 4);
  add(furnitureGrid("sofa"), 404, FLOOR + 4);
  add(furnitureGrid("floor_lamp"), 444, FLOOR + 2);
  add(boxS(0xb88a5a, 16, 12), 496, FLOOR + 2);
  add(boxS(0xa07a4a, 14, 10), 510, FLOOR - 1);
  add(furnitureGrid("rubber_tree"), 540, FLOOR + 2);
  add(furnitureGrid("coffee_machine"), 70, FLOOR + 2);
  add(papersFloor(320), 330, 22);
  add(papersFloor(560), 584, 30);
  put.sort((a, b) => a.y - b.y);
  for (const p of put) c.drawImage(p.g.toCanvas(), Math.round(p.x - p.g.w / 2), Math.round(p.y - p.g.h));
  nightTint(c, WW, EXT_B);
  c.globalCompositeOperation = "lighter";
  const glow = (x: number, y: number, r: number, a: number) => {
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,214,140,${a})`);
    gr.addColorStop(1, "rgba(255,214,140,0)");
    c.fillStyle = gr;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // 방 가운데 등불이 아래로 번진 끝 + 스탠드 두 개
  glow(WW / 2, -30, 200, 0.1);
  for (const x of [196, 444]) glow(x, FLOOR - 30, 40, 0.3);
  c.globalCompositeOperation = "source-over";
  return cv;
}

/** 방 위 띠: 밤하늘·먼 빌딩 → 벽 윗면 → 위쪽 벽지 (방 맨 위 몰딩으로 이어진다) */
function roomAboveCanvas(): HTMLCanvasElement {
  const PAPER = 44;
  const CAP = 12;
  const g = new Grid(WW, EXT_T);
  const sky = EXT_T - PAPER - CAP;
  for (let y = 0; y < sky; y++)
    for (let x = 0; x < WW; x++) {
      const k = y / sky;
      let c: Color = k < 0.5 ? 0x0a0e24 : k < 0.85 ? 0x0e1430 : 0x16204a;
      if (hash2(x, y, 23) < 0.006) c = 0xe8f0ff;
      g.set(x, y, c);
    }
  // 먼 빌딩 실루엣 (창밖 야경과 같은 무늬)
  let bx = 0;
  let n = 0;
  while (bx < WW) {
    const bw = 8 + Math.floor(hash2(bx, n, 4) * 18);
    const bh = 10 + Math.floor(hash2(bx, n, 8) * 34);
    for (let y = sky - bh; y < sky; y++)
      for (let x = bx; x < Math.min(bx + bw, WW); x++) {
        const lit = (x - bx) % 3 === 1 && (y - (sky - bh)) % 3 === 1 && hash2(x, y, 31) < 0.4;
        g.set(x, y, lit ? (hash2(x, y, 5) < 0.5 ? 0xffd890 : 0xa8d8ff) : 0x0a0c1a);
      }
    bx += bw + 1;
    n++;
  }
  // 벽 윗면
  for (let x = 0; x < WW; x++) {
    g.set(x, sky, 0x2a1c18);
    for (let y = sky + 1; y < sky + CAP - 3; y++) g.set(x, y, x % 48 === 0 ? 0x3a2418 : hash2(x, y, 43) < 0.06 ? 0x4a2c1e : 0x5a3a2c);
    g.set(x, sky + CAP - 3, 0x8a5a38);
    for (let y = sky + CAP - 2; y < sky + CAP; y++) g.set(x, y, 0x2a1c18);
  }
  // 위쪽 벽지 (방 벽지보다 조금 어둡게) + 천장 테
  for (let y = sky + CAP; y < EXT_T; y++)
    for (let x = 0; x < WW; x++) {
      let c: Color = x % 24 === 0 ? 0x3a2c46 : 0x433450;
      if (y < sky + CAP + 4) c = y === sky + CAP + 2 ? 0xb8862e : 0x6a4a30;
      g.set(x, y, c);
    }
  const cv = document.createElement("canvas");
  cv.width = WW;
  cv.height = EXT_T;
  const c = cv.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  c.drawImage(g.toCanvas(), 0, 0);
  nightTint(c, WW, EXT_T);
  return cv;
}

/** 창밖 등대 빛줄기 (창마다 타일로 흘려 보낸다) */
function beamCanvas(): HTMLCanvasElement {
  const w = 160;
  const h = 30;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const x0 = 40 + y * 0.6;
    const gr = c.createLinearGradient(x0, 0, x0 + 30, 0);
    gr.addColorStop(0, "rgba(255,236,170,0)");
    gr.addColorStop(0.5, "rgba(255,236,170,0.45)");
    gr.addColorStop(1, "rgba(255,236,170,0)");
    c.fillStyle = gr;
    c.fillRect(x0, y, 30, 1);
  }
  return cv;
}

/** 판 하나에 필요한 그림 전부 (이미 있으면 건너뛴다) */
export function ensureChairTextures(scene: Phaser.Scene): void {
  for (let s = 0; s <= 5; s++) ensureBoss(scene, s);
  if (!scene.textures.exists(CTX.room)) addCanvas(scene, CTX.room, roomCanvas());
  if (!scene.textures.exists(CTX.roomUp)) addCanvas(scene, CTX.roomUp, roomAboveCanvas());
  if (!scene.textures.exists(CTX.roomDown)) addCanvas(scene, CTX.roomDown, roomBelowCanvas());
  if (!scene.textures.exists(CTX.beam)) addCanvas(scene, CTX.beam, beamCanvas());
  [null, vestS(), cardS(), glassesS(), tumblerS()].forEach((g, i) => g && addGrid(scene, CTX.item(i), g));
  for (const k of ["partition", "copier", "cooler", "table", "pile"] as const) addGrid(scene, CTX.cover(k), coverGrid(k));
  addGrid(scene, CTX.bug, bugS());
  BLOCK_COLORS.forEach((c, i) => addGrid(scene, CTX.block(i), blockS(c)));
  addGrid(scene, CTX.folder, folderS());
  CAP_COLORS.forEach((c, i) => addGrid(scene, CTX.cap(i), capS(c)));
  addGrid(scene, CTX.truck, truckS(0x4a5a7a));
  for (let i = 0; i < 6; i++) addGrid(scene, CTX.staff(i), staffS(i));
  addGrid(scene, CTX.seat, seatS());
  addGrid(scene, CTX.coffee, coffeeS());
  // 명찰 탄 (색은 tint) · 서류 파편 · 화면 가장자리 화살표 · 흰 점
  const tag = new Grid(8, 6);
  tag.rect(0, 0, 8, 6, 0xffffff);
  tag.rect(1, 1, 3, 2, 0xd8d8e0);
  tag.hline(1, 6, 4, 0xb0b0c0);
  addGrid(scene, CTX.tag, tag);
  const paper = new Grid(7, 5);
  paper.rect(0, 0, 7, 5, 0x141218);
  paper.rect(1, 1, 5, 3, 0xf6f2e4);
  paper.hline(2, 4, 2, 0xc9402f);
  addGrid(scene, CTX.paper, paper);
  const arrow = new Grid(14, 14);
  for (let x = 0; x < 12; x++) {
    const h = Math.round((12 - x) * 0.55);
    arrow.vline(x + 1, 7 - h, 7 + h, 0xff3b30);
  }
  arrow.outline(0x3a0808);
  addGrid(scene, CTX.arrow, arrow);
  const dot = new Grid(4, 4);
  dot.rect(0, 0, 4, 4, 0xffffff);
  addGrid(scene, CTX.dot, dot);
}
