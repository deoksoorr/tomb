// 11/26 캠핑장 집 겉모습 그림 ① 카라반 셋(티어드롭·에어스트림·버스)·차양·번호 말뚝·분양 줄·연결 기둥·등 기둥·경계 통나무.
// 6차 시안(game/camp/mock/mockArt.ts — 실서버 빌드에서 빠짐) 그림을 그대로 옮기고, 앞마당 단계마다 커지는 카라반(caravanStageArt)을 더했다.
// 캠핑장 그림 규칙 그대로 (campArt): 코드로 그린 픽셀, 윤곽 0x2c2018, 왼쪽 위 빛, 바닥 그림자 타원, 원점 = 바닥 가운데.

import { darken, Grid, hash2, lighten, mix, vnoise, type Color } from "../sprites/pixel";
import { SNOW } from "../sprites/winterArt";
import { padGrid, padMask, padPt, type Pad } from "./campArtPad";
import type { CampYard, CaravanDesign, CaravanModel } from "@tomb/protocol";

/** 앞마당 한 단계마다 카라반 몸통이 길어지는 픽셀 (1단계 = 시안 그대로) */
export const STAGE_GROW = 12;
/**
 * 11/26 운영자 「2·3단계가 거의 같다」: 3단계는 몸통이 더 길어진다 (에어스트림 — 버스는 옆 자리 카라반과 닿아 길이 대신 팝업 지붕을 다 올리고,
 * 티어드롭은 3번 자리가 관리소 지붕과 물가 등 기둥 사이 78px라 길이 대신 긴 차양·꽃 상자로)
 */
export const STAGE3_EXTRA = { teardrop: 0, airstream: 4, bus: 0 } as const;
const stageW = (base: number, stage: CampYard, extra: number) => base + STAGE_GROW * (stage - 1) + (stage >= 3 ? extra : 0);

const OUT = 0x2c2018;

const WOOD = { hi: 0xd2a66c, mid: 0xb08250, lo: 0x845e38, line: 0x4a321e } as const;

const LOG = { hi: 0xa87a4c, mid: 0x86603a, lo: 0x5e4228, ring: 0xe0c08a } as const;

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x1a1006, a);
    }
}

function frame(g: Grid, x: number, y: number, w: number, h: number, c: Color): void {
  g.hline(x, x + w - 1, y, c);
  g.hline(x, x + w - 1, y + h - 1, c);
  g.vline(x, y, y + h - 1, c);
  g.vline(x + w - 1, y, y + h - 1, c);
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
}

const DIGITS: readonly string[] = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];

function drawNumber(g: Grid, n: number, x: number, y: number, c: Color): void {
  String(n)
    .split("")
    .forEach((ch, i) => {
      const bits = DIGITS[Number(ch)];
      for (let k = 0; k < 15; k++) if (bits[k] === "1") g.set(x + i * 4 + (k % 3), y + Math.floor(k / 3), c);
    });
}

export type CaravanPal = { body: Color; hi: Color; lo: Color };

export const TEARDROP_PALS: readonly CaravanPal[] = [
  { body: 0x9ed6c0, hi: 0xc4ecdc, lo: 0x6eaa94 }, // 민트
  { body: 0xe8806a, hi: 0xf8aa94, lo: 0xb85a48 }, // 산호
  { body: 0xf0c050, hi: 0xffe08a, lo: 0xc89432 }, // 겨자
  { body: 0x8ac4e8, hi: 0xb8e0f8, lo: 0x5a94bc }, // 하늘
];

export const BUS_PALS: readonly CaravanPal[] = [
  { body: 0x6cb0d4, hi: 0x9cd0ec, lo: 0x4a88ac }, // 하늘
  { body: 0x86b894, hi: 0xaed8b8, lo: 0x5e9070 }, // 세이지
  // 11/26 카라반 디자인 고르기 — 버스 색 둘 더 (protocol CARAVAN_COLOR_NAMES.bus)
  { body: 0xd4605a, hi: 0xec8c84, lo: 0xa8443e }, // 체리
  { body: 0xe8b448, hi: 0xf8d688, lo: 0xb8882c }, // 겨자
];

/** 에어스트림 색 띠: 남색·빨강 + 11/26 디자인 고르기로 청록·겨자 */
export const AIR_ACCENT: readonly Color[] = [0x3a5a8a, 0xc84a3a, 0x2ea88e, 0xd8a032];

const ALU = { hi: 0xeef2f6, a: 0xd6dce2, b: 0xbcc4cc, c: 0xa2acb6, lo: 0x86909c, seam: 0x98a2ac } as const;

const WIN = { warm: 0xffd890, warm2: 0xffc070, glass: 0x5a7a90, glassHi: 0x9cc4d8, curtain: 0xd8786a } as const;

/**
 * 11/26 운영자 「제일 큰 단계에서 확장 칸이 덧붙인 것 같고 문짝이 떠 있다」 — 카라반 단계 그림을 다시 그렸다.
 *  - 확장 칸은 같은 몸통 재질·같은 창 높이·같은 색 띠로 (몸통에서 한 겹 밀려 나온 칸: 테두리 이음매 + 오른쪽·아래 그늘)
 *  - 문은 몸통 바닥선까지 내려오고, 문 아래 계단 두 칸 + 땅에 발판 (마을 집 현관처럼 들어가는 곳이 바로 보이게)
 *  - 차양은 앞마당에 따로 세우던 큰 천 대신 지붕선에 붙은 옆 차양 (문 위 — 문을 가리지 않는다) + 기둥, 3단계는 그 아래 줄전구
 */
export type CaravanOpts = { awning?: number; xmas?: boolean };
/** awning = 옆 차양 천 (그리드 좌표 x0..x1, y = 천 아래 끝 바로 밑 줄), bulbs = 3단계 차양 꼬마전구 (밤 불빛 자리) */
export type CaravanArt = {
  grid: Grid;
  roof: Uint8Array;
  /** 문 가운데 x · 문턱(몸통 바닥선) y · 문 윗선 top */
  door: { x: number; y: number; top: number };
  windows: { x: number; y: number }[];
  awning?: { x0: number; x1: number; y: number };
  bulbs: { x: number; y: number }[];
};

/**
 * 11/26 운영자 「카라반 왼쪽 견인고리 쪽 픽셀이 잘려 있다」: 티어드롭·에어스트림은 연결 고리·받침 다리가 캔버스 왼쪽 끝 열(윤곽)까지 닿아
 * 맵 확대 배율에 따라 끝 열이 잘렸다 → 세 모델 모두 좌우에 빈 칸 2를 두른다 (바닥 가운데 원점이라 맵 자리는 그대로, 그림 안 좌표만 옮긴다)
 */
export const CARAVAN_PAD = 2;
function padCaravan(a: CaravanArt): CaravanArt {
  const o: Pad = { x: CARAVAN_PAD, top: 0, bottom: 0 };
  return {
    grid: padGrid(a.grid, o),
    roof: padMask(a.roof, a.grid.w, a.grid.h, o),
    door: { ...padPt(a.door, o), top: a.door.top },
    windows: a.windows.map((w) => padPt(w, o)),
    bulbs: a.bulbs.map((b) => padPt(b, o)),
    ...(a.awning ? { awning: { x0: a.awning.x0 + o.x, x1: a.awning.x1 + o.x, y: a.awning.y } } : {}),
  };
}

/** 지붕 마스크로 눈 얹을 자리 표시 */
function roofMask(g: Grid, test: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(g.w * g.h);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.filled(x, y) && test(x, y)) m[y * g.w + x] = 1;
  return m;
}

const STEP = { hi: 0xdfe4e8, mid: 0xaab2ba, lo: 0x6c747c } as const;
const MAT = { a: 0xb86a42, b: 0x8a4a2e, edge: 0x5a3422 } as const;
const POLE = 0x4a4a50;

/** 문 아래 계단 두 칸 (위 칸은 문보다 좁게, 아래 칸은 문 폭). 문 왼쪽 dx·폭 dw, 몸통 바닥선 yb — 윤곽 전에 그린다 */
function doorSteps(g: Grid, dx: number, dw: number, yb: number): void {
  g.rect(dx + 1, yb, dw - 2, 2, STEP.mid);
  g.hline(dx + 1, dx + dw - 2, yb, STEP.hi);
  g.rect(dx, yb + 2, dw, 2, STEP.mid);
  g.hline(dx, dx + dw - 1, yb + 2, STEP.hi);
  g.hline(dx, dx + dw - 1, yb + 3, STEP.lo);
}

/** 계단 앞 땅에 깐 발판 (윤곽 뒤·그림자 전에 — 땅에 붙은 천이라 검은 윤곽 없이 테두리 색만) */
function doorMat(g: Grid, dx: number, dw: number, y: number): void {
  for (let x = dx - 1; x <= dx + dw; x++) {
    g.set(x, y, (x - dx) % 2 ? MAT.a : MAT.b);
    g.set(x, y + 1, MAT.edge);
  }
}

/** 크리스마스판 문 리스 (문 가운데 아래, 초록 고리 + 빨간 리본) */
function doorWreath(g: Grid, cx: number, cy: number, door: Color): void {
  g.ellipse(cx, cy, 2.9, 2.9, 0x2f6a3a);
  g.ellipse(cx, cy, 1.3, 1.3, door);
  g.set(Math.round(cx) - 2, Math.round(cy) - 2, 0x5aa864);
  g.set(Math.round(cx) + 1, Math.round(cy) - 2, 0xd83a3a);
  g.set(Math.round(cx) - 2, Math.round(cy) + 1, 0xffd040);
  g.set(Math.round(cx), Math.round(cy) + 2, 0xd83a3a);
  g.set(Math.round(cx) - 1, Math.round(cy) + 3, 0xb82a2a);
  g.set(Math.round(cx) + 1, Math.round(cy) + 3, 0xb82a2a);
}

/**
 * 옆 차양 (지붕선에 붙여 문 위로 펼친 줄무늬 천 — 앞에서 보면 얇은 띠 + 물결 테). ay = 천 윗줄 (천 4줄 + 테 1줄 → 문 윗선보다 위),
 * poles = 땅까지 내려가는 앞 기둥 x (ground = 기둥 바닥), arms = 몸통 벽에 붙는 팔 x (armTo까지 — 바퀴 앞을 지나는 기둥 대신), rail = 위 말아 넣는 통
 */
function sideAwning(g: Grid, ax0: number, ax1: number, ay: number, ci: number, poles: number[], ground: number, arms: number[] = [], armTo = ground, rail = true): void {
  awningCloth(g, ax0, ax1, ay, ci, rail);
  for (const px of poles) {
    g.vline(px, ay + AWNING_CLOTH_H - 1, ground, POLE);
    g.set(px - 1, ground, POLE);
    g.set(px + 1, ground, POLE);
  }
  for (const px of arms) g.vline(px, ay + AWNING_CLOTH_H - 1, armTo, POLE);
}

/**
 * 눈 얹을 자리에서 차양 천은 뺀다 (윗줄만 눈 — 천에 눈이 덮이면 차양 색이 안 보였다). 차양 밖이면 null (그림 원래 규칙대로)
 * aw.y = 천 아래 끝 바로 밑 줄
 */
function awningSnow(aw: { x0: number; x1: number; y: number } | undefined, x: number, y: number): boolean | null {
  if (!aw || x < aw.x0 || x > aw.x1 || y < aw.y - AWNING_CLOTH_H - 1 || y >= aw.y) return null;
  return y <= aw.y - AWNING_CLOTH_H;
}

/** 꼬마전구 색 (크리스마스판은 알록달록) */
const BULB_XMAS: readonly Color[] = [0xffd040, 0xff6a5a, 0x7ad0ff, 0x9aee8a];

/**
 * 11/26 운영자 「차양 색이 거의 안 보인다」: 줄무늬 천을 5줄 + 물결 테 1줄(6px)로, 줄무늬 폭 4px.
 * ay = 천 윗줄 · AWNING_CLOTH_H = 테까지 높이 (천 아래 끝 = ay + AWNING_CLOTH_H - 1)
 */
const AWNING_CLOTH_H = 6;
function awningCloth(g: Grid, ax0: number, ax1: number, ay: number, ci: number, rail: boolean): void {
  const [a, b] = AWNING_COLORS[ci % AWNING_COLORS.length];
  if (rail) g.hline(ax0, ax1, ay - 1, 0x8a9096);
  for (let x = ax0; x <= ax1; x++) {
    const c = Math.floor((x - ax0) / 4) % 2 === 0 ? a : b;
    g.set(x, ay, lighten(c, 0.3));
    for (let k = 1; k <= 3; k++) g.set(x, ay + k, c);
    g.set(x, ay + 4, darken(c, 0.14));
    if ((x - ax0) % 4 !== 3) g.set(x, ay + 5, darken(c, 0.24));
  }
}

/** 3단계: 앞 기둥 둘 사이에 늘어진 꼬마전구 줄 (테 바로 아래에서 sag px만큼 처진다). 전구 자리를 돌려준다 (밤 불빛) */
function festoon(g: Grid, xa: number, xb: number, y: number, sag: number, xmas: boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = xb - xa;
  for (let i = 0, k = 0; i <= n; i++) {
    const t = i / n;
    const yy = Math.round(y + Math.sin(t * Math.PI) * sag);
    const x = xa + i;
    if (i % 4 === 2) {
      g.set(x, yy + 1, xmas ? BULB_XMAS[k % BULB_XMAS.length] : 0xffe6a0);
      out.push({ x, y: yy + 1 });
      k++;
    }
    g.set(x, yy, 0x3a3430);
  }
  return out;
}

/** 3단계: 창 아래 꽃 상자 (나무 상자 + 꽃 — 크리스마스판은 빨간 열매·초록 잎). x0..x0+w-1, y = 상자 윗줄 (3줄: 꽃·상자·상자 밑) */
function flowerBox(g: Grid, x0: number, w: number, y: number, xmas: boolean): void {
  g.hline(x0, x0 + w - 1, y + 1, 0x9a6a3e);
  g.hline(x0, x0 + w - 1, y + 2, 0x6e4a2a);
  for (let x = x0; x < x0 + w; x++) g.set(x, y, (x - x0) % 2 ? 0x4f8a48 : xmas ? 0xd8343a : [0xf06a8a, 0xffd04a, 0xf6f0f0][(x - x0) % 3]);
}

/** 확장 칸 (몸통에서 밀려 나온 방): 같은 재질 면 + 이음매 테 + 오른쪽·아래 그늘 + 몸통과 같은 높이의 창 panes개 + 같은 색 띠 */
function slideBox(
  g: Grid,
  a: number,
  w: number,
  y0: number,
  y1: number,
  face: (x: number, y: number) => Color,
  o: { seam: Color; shade: Color; winY: number; winH: number; frame: Color; stripes?: { y: number; c: Color }[]; panes: number },
): { x: number; y: number }[] {
  for (let y = y0; y <= y1; y++) for (let x = a; x < a + w; x++) g.set(x, y, y === y0 ? lighten(face(x, y), 0.35) : lighten(face(x, y), 0.05));
  // 테 (밀려 나온 두께): 왼쪽·위 이음매, 오른쪽·아래 몸통에 진 그늘
  g.vline(a - 1, y0 - 1, y1, o.seam);
  g.hline(a - 1, a + w - 1, y0 - 1, o.seam);
  g.vline(a + w, y0, y1 + 1, o.shade);
  g.vline(a + w + 1, y0 + 1, y1 + 1, mix(o.shade, face(a + w + 1, y0 + 1), 0.5));
  g.hline(a, a + w, y1 + 1, o.shade);
  for (const st of o.stripes ?? []) g.hline(a, a + w - 1, st.y, st.c);
  const out: { x: number; y: number }[] = [];
  const gap = 3;
  const pw = Math.floor((w - gap * (o.panes + 1)) / o.panes);
  for (let k = 0; k < o.panes; k++) {
    const wx = a + gap + k * (pw + gap);
    g.rect(wx - 1, o.winY - 1, pw + 2, o.winH + 2, o.frame);
    g.rect(wx, o.winY, pw, o.winH, WIN.warm);
    g.hline(wx, wx + pw - 1, o.winY, WIN.warm2);
    g.vline(wx, o.winY, o.winY + o.winH - 1, WIN.curtain);
    g.vline(wx + pw - 1, o.winY, o.winY + o.winH - 1, WIN.curtain);
    out.push({ x: wx + Math.floor(pw / 2), y: o.winY + Math.floor(o.winH / 2) });
  }
  return out;
}

/** 작은 티어드롭 (앞은 둥글게 솟고 뒤는 물방울처럼 흘러내린다). 문은 앞 창 바로 뒤, 바퀴는 문 뒤. 단계마다 몸통이 길어지고 둥근 창이 하나씩 는다 */
export const TEARDROP_W = 56;

export const TEARDROP_H = 42;

export function teardropArt(i: number, stage: CampYard = 1, o: CaravanOpts = {}): CaravanArt {
  const W = stageW(TEARDROP_W, stage, STAGE3_EXTRA.teardrop);
  const H = TEARDROP_H;
  const g = new Grid(W, H);
  const pal = TEARDROP_PALS[i % TEARDROP_PALS.length];
  const x0 = 9;
  const x1 = W - 4;
  const yb = H - 8;
  const hgt = 26;
  const topAt = (x: number): number => {
    const t = (x - x0) / (x1 - x0);
    const sh = t < 0.36 ? Math.sqrt(Math.max(0, 1 - ((0.36 - t) / 0.36) ** 2)) : 1 - ((t - 0.36) / 0.64) ** 2.2 * 0.82;
    return Math.round(yb - hgt * sh);
  };
  for (let x = x0; x <= x1; x++) {
    const ty = topAt(x);
    for (let y = ty; y < yb; y++) {
      const d = y - ty;
      let c: Color = d < 2 ? pal.hi : pal.body;
      if (d === 2) c = mix(pal.hi, pal.body, 0.5);
      if (y >= yb - 6) c = y >= yb - 2 ? ALU.lo : y === yb - 6 ? ALU.hi : ALU.b; // 알루미늄 아래 띠
      g.set(x, y, c);
    }
  }
  // 둥근 창 (불빛): 앞 창 하나 + 단계마다 문 뒤로 하나씩
  const port = (cx: number) => {
    g.ellipse(cx, yb - 14, 4.2, 3.6, darken(pal.lo, 0.25));
    g.ellipse(cx, yb - 14, 3, 2.5, WIN.warm);
    g.set(cx - 1, yb - 15, 0xfff4d0);
  };
  const wins = [x0 + 11, ...(stage >= 2 ? [x0 + 33] : []), ...(stage >= 3 ? [x0 + 45] : [])];
  for (const wx of wins) port(wx);
  // 3단계: 문 뒤 둥근 창 둘 아래 꽃 상자
  if (stage >= 3) for (const wx of [x0 + 33, x0 + 45]) flowerBox(g, wx - 4, 9, yb - 10, !!o.xmas);
  // 문 (앞 창 바로 뒤, 몸통 바닥선까지) + 문 위 작은 창 + 손잡이
  const dx = x0 + 17;
  const DW = 9;
  const dTop = yb - 15;
  g.rect(dx, dTop, DW, yb - dTop, darken(pal.lo, 0.1));
  g.rect(dx + 1, dTop + 1, DW - 2, yb - dTop - 1, pal.lo);
  g.rect(dx + 2, dTop + 2, DW - 4, 4, WIN.warm2);
  g.set(dx + DW - 3, dTop + 8, 0xe8e0d0);
  if (o.xmas) doorWreath(g, dx + DW / 2 - 0.5, dTop + 10, pal.lo);
  // 뒤 짐칸 문 줄
  for (let x = x1 - 12; x <= x1 - 2; x++) {
    const ty = topAt(x) + 3;
    g.set(x, ty + Math.round((x - (x1 - 12)) * 0.4), darken(pal.body, 0.25));
  }
  // 바퀴 + 흙받이 (문 뒤 — 2단계부터 바퀴 2쌍)
  const axles = stage >= 2 ? [x0 + 36, x0 + 46] : [x0 + 32];
  for (const wx of axles) {
    g.ellipse(wx, yb + 1, 5, 4, 0x2e2a28);
    g.ellipse(wx, yb + 1, 2, 1.6, 0xb8b4ac);
    for (let x = wx - 6; x <= wx + 6; x++) g.set(x, yb - 4 + Math.round(((x - wx) / 6) ** 2 * 2), ALU.hi);
  }
  // 연결 고리 (앞, 왼쪽) + 받침 바퀴
  line(g, x0, yb - 3, 1, yb, 0x4a4a50);
  line(g, x0, yb - 1, 1, yb, 0x4a4a50);
  g.rect(2, yb, 2, 4, 0x4a4a50);
  g.ellipse(3, yb + 4, 1.6, 1.2, 0x2e2a28);
  // 지붕 등 (작은 환기창)
  const vx = x0 + 18;
  g.rect(vx, topAt(vx) - 1, 6, 2, 0xd8dde2);
  doorSteps(g, dx, DW, yb);
  // 2단계부터 옆 차양 (문 위 지붕선 — 문 왼쪽 기둥부터 뒤 창 사이 벽 팔까지, 3단계는 창 하나만큼 더 길게)
  let awning: CaravanArt["awning"];
  let bulbs: CaravanArt["bulbs"] = [];
  if (stage >= 2) {
    const ay = dTop - 1 - AWNING_CLOTH_H;
    const ax0 = dx - 1;
    if (stage >= 3) {
      // 3단계: 뒤 창 둘을 덮는 긴 차양 + 앞으로 내민 기둥 둘 (뒤 바퀴 뒤) + 그 사이 꼬마전구 줄
      const ax1 = x0 + 55;
      sideAwning(g, ax0, ax1, ay, o.awning ?? 0, [ax0, ax1], yb + 6);
      bulbs = festoon(g, ax0 + 1, ax1 - 1, ay + AWNING_CLOTH_H, 2, !!o.xmas);
      awning = { x0: ax0, x1: ax1, y: ay + AWNING_CLOTH_H };
    } else {
      const ax1 = x0 + 40;
      sideAwning(g, ax0, ax1, ay, o.awning ?? 0, [ax0], yb + 4, [ax1], yb - 7);
      awning = { x0: ax0, x1: ax1, y: ay + AWNING_CLOTH_H };
    }
  }
  const roof = roofMask(g, (x, y) => awningSnow(awning, x, y) ?? (y < topAt(x) + 3 && x >= x0 && x <= x1));
  g.outline(OUT);
  doorMat(g, dx, DW, yb + 5);
  shadow(g, (x0 + x1) / 2, yb + 4, (x1 - x0) / 2 + 2, 2.6, 64);
  return padCaravan({ grid: g, roof, door: { x: dx + 4, y: yb, top: dTop }, windows: wins.map((x) => ({ x, y: yb - 14 })), bulbs, ...(awning ? { awning } : {}) });
}

/** 은색 에어스트림 (둥근 빵 모양 알루미늄, 리벳 줄·반사광). 앞은 왼쪽(둘러싼 창), 문은 뒤쪽 */
export const AIRSTREAM_W = 80;

export const AIRSTREAM_H = 46;

export function airstreamArt(i: number, stage: CampYard = 1, o: CaravanOpts = {}): CaravanArt {
  const W = stageW(AIRSTREAM_W, stage, STAGE3_EXTRA.airstream);
  const H = AIRSTREAM_H;
  const g = new Grid(W, H);
  const acc = AIR_ACCENT[i % AIR_ACCENT.length];
  const x0 = 7;
  const x1 = W - 4;
  const yt = 9;
  const yb = H - 8;
  const R = 12;
  const inside = (x: number, y: number) => {
    if (x < x0 || x > x1 || y < yt || y >= yb) return false;
    const cx = x < x0 + R ? x0 + R : x > x1 - R ? x1 - R : x;
    const cy = y < yt + R ? yt + R : y;
    if (cx === x && cy === y) return true;
    return Math.hypot((x - cx) / R, (y - cy) / (R * 1.05)) <= 1 || (cy === y && Math.abs(x - cx) <= R && y >= yt + R);
  };
  const alu = (x: number, y: number): Color => {
    const v = (y - yt) / (yb - yt);
    let c: Color = v < 0.12 ? ALU.hi : v < 0.3 ? ALU.a : v < 0.55 ? ALU.b : v < 0.8 ? ALU.c : ALU.lo;
    // 하늘 반사 (위쪽 푸르스름) · 눈밭 반사 (아래쪽 밝게)
    if (v > 0.12 && v < 0.4) c = mix(c, 0xb8d4ec, 0.18);
    if (v > 0.86) c = mix(c, 0xdfe8f0, 0.35);
    // 세로 반사광 두 줄
    const rx = (x - x0) / (x1 - x0);
    if (Math.abs(rx - 0.22) < 0.025 || Math.abs(rx - 0.64) < 0.018) c = mix(c, 0xffffff, 0.55);
    // 가로 이음매 + 리벳
    const ly = y - yt;
    if (ly > 2 && ly % 6 === 0) c = (x + ly) % 3 === 0 ? ALU.hi : ALU.seam;
    if ((x - x0) % 13 === 0 && v > 0.15) c = mix(c, ALU.seam, 0.6);
    return c;
  };
  for (let y = yt; y < yb; y++) for (let x = x0; x <= x1; x++) if (inside(x, y)) g.set(x, y, alu(x, y));
  // 색 띠 (11/26 「남색·청록이 멀리서 안 갈린다」: 굵은 띠 3줄 + 아래 가는 줄 — 확장 칸에도 같은 높이로 이어진다)
  const stripes = [
    { y: yb - 11, c: lighten(acc, 0.25) },
    { y: yb - 10, c: acc },
    { y: yb - 9, c: darken(acc, 0.18) },
    { y: yb - 7, c: acc },
  ];
  for (const st of stripes) for (let x = x0 + 3; x <= x1 - 3; x++) if (inside(x, st.y)) g.set(x, st.y, st.c);
  // 앞 둘러싼 창 (왼쪽 끝 둥근 면)
  for (let y = yt + 8; y < yt + 15; y++)
    for (let x = x0 + 1; x < x0 + 12; x++) if (inside(x - 1, y) && inside(x + 1, y)) g.set(x, y, y === yt + 8 ? WIN.glassHi : WIN.glass);
  const dx = x1 - 20;
  const DW = 10;
  // 2·3단계 확장 칸 (문 앞쪽 — 3단계는 둘, 창 둘씩). 옆 창은 확장 칸과 겹치지 않는 것만 남긴다
  const slides: [number, number][] = stage >= 3 ? [[x0 + 17, 26], [x0 + 47, 26]] : stage >= 2 ? [[x0 + 36, 21]] : [];
  const wins = [x0 + 22, x0 + 36].filter((wx) => !slides.some(([a, w]) => wx + 10 > a - 3 && wx < a + w + 3));
  // 옆 창 (둥근 모서리, 따뜻한 불빛 + 커튼)
  for (const wx of wins) {
    g.rect(wx, yt + 8, 10, 7, darken(ALU.lo, 0.3));
    g.rect(wx + 1, yt + 9, 8, 5, WIN.warm);
    g.rect(wx + 1, yt + 9, 3, 5, WIN.curtain);
    g.set(wx, yt + 8, ALU.b);
    g.set(wx + 9, yt + 8, ALU.b);
  }
  const extra: { x: number; y: number }[] = [];
  for (const [a, w] of slides)
    extra.push(
      ...slideBox(g, a, w, yt + 5, yb - 4, alu, {
        seam: darken(ALU.lo, 0.25),
        shade: darken(ALU.lo, 0.35),
        winY: yt + 9,
        winH: 5,
        frame: darken(ALU.lo, 0.3),
        stripes,
        panes: 2,
      }),
    );
  // 3단계: 확장 칸 창 아래 꽃 상자
  if (stage >= 3) for (const [a, w] of slides) flowerBox(g, a + 3, w - 6, yt + 15, !!o.xmas);
  // 문 (뒤쪽, 둥근 위 + 작은 창, 몸통 바닥선까지)
  g.rect(dx, yt + 7, DW, yb - yt - 7, darken(ALU.lo, 0.15));
  g.rect(dx + 1, yt + 8, DW - 2, yb - yt - 8, ALU.b);
  g.rect(dx + 2, yt + 10, 6, 4, WIN.warm2);
  g.set(dx + 7, yt + 19, 0xf6f6f0);
  if (o.xmas) doorWreath(g, dx + 4.5, yt + 22, ALU.b);
  // 바퀴 (치마에 반쯤 가린다 — 단계마다 차축 하나씩, 문 앞쪽)
  const wheels = stage >= 3 ? [x0 + 34, x0 + 43, x0 + 52] : stage >= 2 ? [x0 + 30, x0 + 39, x0 + 48] : [x0 + 30, x0 + 40];
  for (const wx of wheels) {
    g.ellipse(wx, yb + 1, 4.4, 3.6, 0x2e2a28);
    g.ellipse(wx, yb + 1, 1.8, 1.4, 0xc8ccd0);
  }
  g.rect(wheels[0] - 6, yb - 2, wheels[wheels.length - 1] - wheels[0] + 12, 2, ALU.lo);
  // 연결 고리 (앞)
  line(g, x0 + 2, yb - 3, 1, yb, 0x4a4a50);
  g.rect(1, yb, 2, 4, 0x4a4a50);
  // 지붕 환기 상자 · 에어컨
  g.rect(x0 + 30, yt - 2, 12, 3, 0xe4e8ec);
  g.hline(x0 + 30, x0 + 41, yt - 2, 0xffffff);
  doorSteps(g, dx, DW, yb);
  // 2단계부터 옆 차양 (문 위 지붕선 — 확장 칸 옆 벽 팔부터 뒤 둥근 면 벽 팔까지. 기둥을 땅에 세우면 바퀴 앞을 지나 지저분해 벽 팔로)
  let awning: CaravanArt["awning"];
  let bulbs: CaravanArt["bulbs"] = [];
  if (stage >= 2) {
    const ay = yt;
    const ax1 = x1 - 6;
    if (stage >= 3) {
      // 3단계: 확장 칸 둘·문을 다 덮는 긴 차양 + 앞으로 내민 기둥 둘 (바퀴 앞을 피해 양 끝) + 그 사이 꼬마전구 줄
      const ax0 = x0 + 15;
      sideAwning(g, ax0, ax1, ay, o.awning ?? 0, [ax0, ax1], yb + 6);
      bulbs = festoon(g, ax0 + 1, ax1 - 1, ay + AWNING_CLOTH_H, 2, !!o.xmas);
      awning = { x0: ax0, x1: ax1, y: ay + AWNING_CLOTH_H };
    } else {
      const ax0 = x0 + 33;
      sideAwning(g, ax0, ax1, ay, o.awning ?? 0, [], yb + 4, [ax0, ax1], yb - 4);
      awning = { x0: ax0, x1: ax1, y: ay + AWNING_CLOTH_H };
    }
  } else {
    // 1단계: 말아 둔 차양 막대 (문 위)
    g.rect(dx - 8, yt + 4, 26, 2, acc);
    g.hline(dx - 8, dx + 17, yt + 4, lighten(acc, 0.3));
  }
  const roof = roofMask(g, (x, y) => awningSnow(awning, x, y) ?? y < yt + 3);
  g.outline(OUT);
  doorMat(g, dx, DW, yb + 5);
  shadow(g, (x0 + x1) / 2, yb + 4, (x1 - x0) / 2 + 2, 2.6, 64);
  return padCaravan({ grid: g, roof, door: { x: dx + 5, y: yb, top: yt + 7 }, windows: [...wins.map((x) => ({ x: x + 5, y: yt + 11 })), ...extra], bulbs, ...(awning ? { awning } : {}) });
}

/** 버스 개조 캠핑카 (두 색 몸통, 팝업 지붕 텐트, 지붕 위 스키, 둥근 앞코). 앞은 오른쪽 — 앞바퀴는 운전석 아래, 미닫이 문은 바로 뒤. 길어지면 옆 창이 는다 */
export const BUS_W = 88;

export const BUS_H = 58;

export function busCamperArt(i: number, stage: CampYard = 1, o: CaravanOpts = {}): CaravanArt {
  const W = stageW(BUS_W, stage, STAGE3_EXTRA.bus);
  const H = BUS_H;
  const g = new Grid(W, H);
  const pal = BUS_PALS[i % BUS_PALS.length];
  const CREAM = { hi: 0xfcf6e8, mid: 0xf2e8d2, lo: 0xd8cbb0 };
  const x0 = 4;
  const x1 = W - 5;
  const yt = 20;
  const yb = H - 9;
  const mid = yt + 14;
  const nose = 12;
  for (let y = yt; y < yb; y++)
    for (let x = x0; x <= x1; x++) {
      // 앞(오른쪽) 위 모서리 둥글게, 뒤 위 모서리 조금
      const fr = x > x1 - nose && y < yt + nose && Math.hypot(x - (x1 - nose), (y - (yt + nose)) * 1.1) > nose;
      const br = x < x0 + 4 && y < yt + 4 && Math.hypot(x - (x0 + 4), y - (yt + 4)) > 4;
      if (fr || br) continue;
      // 앞코 V자 색 경계 (VW 버스처럼)
      const vx = x - (x1 - 14);
      const split = vx > 0 ? mid - Math.min(6, vx * 0.6) : mid;
      let c: Color = y < split ? (y < yt + 2 ? CREAM.hi : CREAM.mid) : y < split + 1 ? lighten(pal.body, 0.2) : pal.body;
      if (y >= yb - 3) c = pal.lo;
      g.set(x, y, c);
    }
  // 크롬 띠 (몸통 가운데)
  for (let x = x0 + 1; x < x1 - 14; x++) g.set(x, mid, 0xe8ecf0);
  // 미닫이 문 (운전석 바로 뒤, 지붕선 아래 ~ 문턱) — 몸통 두 색 그대로, 테 + 창 + 손잡이
  const DW = 11;
  const dx = x1 - 27;
  const dTop = yt + 5;
  const dBot = yb - 3;
  frame(g, dx, dTop, DW, dBot - dTop + 1, darken(pal.lo, 0.25));
  g.rect(dx + 2, dTop + 2, DW - 4, 5, darken(CREAM.lo, 0.35));
  g.rect(dx + 3, dTop + 3, DW - 6, 3, WIN.warm);
  g.hline(dx + 2, dx + DW - 3, mid + 3, lighten(pal.body, 0.3));
  g.set(dx + 2, mid + 5, 0xe8ecf0);
  if (o.xmas) doorWreath(g, dx + DW / 2 - 0.5, mid + 7, pal.body);
  // 옆 창 (불빛 + 커튼 — 몸통이 길어질수록 하나씩)
  const wins: number[] = [];
  for (let wx = x0 + 8; wx + 9 <= dx - 6; wx += 13) wins.push(wx);
  for (const wx of wins) {
    g.rect(wx, yt + 3, 10, 8, darken(CREAM.lo, 0.35));
    g.rect(wx + 1, yt + 4, 8, 6, WIN.warm);
    g.rect(wx + 1, yt + 4, 8, 2, WIN.curtain);
    g.set(wx + 2, yt + 6, 0xfff0c8);
  }
  // 앞유리 (둘로 나뉜)
  g.rect(x1 - 11, yt + 4, 10, 7, WIN.glass);
  g.vline(x1 - 6, yt + 4, yt + 10, CREAM.lo);
  g.hline(x1 - 11, x1 - 2, yt + 4, WIN.glassHi);
  // 전조등 · 범퍼
  g.ellipse(x1 - 3, yb - 7, 2, 2, 0xfff6d0);
  g.hline(x0 - 1, x1 + 1, yb - 1, 0xc8ccd0);
  g.hline(x0 - 1, x1 + 1, yb - 2, 0xe8ecf0);
  // 뒤 예비 바퀴
  g.ellipse(x0 + 1, mid + 6, 2.5, 5, 0x3a3634);
  // 바퀴 (흰 휠캡 — 앞바퀴는 운전석 아래, 2단계부터 뒤 바퀴 2쌍)
  for (const wx of stage >= 2 ? [x0 + 14, x0 + 26, x1 - 9] : [x0 + 16, x1 - 9]) {
    g.ellipse(wx, yb + 1, 5.5, 4.4, 0x2a2624);
    g.ellipse(wx, yb + 1, 2.6, 2, 0xf2f2ec);
    g.set(wx, yb + 1, 0x9a9a94);
  }
  // 팝업 지붕 텐트 (줄무늬 천, 지퍼 창) + 지붕 위 스키 둘. 3단계는 지붕을 끝까지 올려 텐트가 높고 창이 둘
  const px0 = x0 + 10;
  const px1 = x0 + 50;
  const tentH = stage >= 3 ? 14 : 9;
  for (let y = yt - tentH; y < yt; y++)
    for (let x = px0; x <= px1 - Math.max(0, yt - 6 - y) * (stage >= 3 ? 1 : 2); x++) {
      const stripe = Math.floor((x - px0) / 4) % 2 === 0;
      g.set(x, y, y === yt - tentH ? 0xe86a4a : stripe ? 0xf4a060 : 0xfaf0dc);
    }
  if (stage >= 3) {
    for (const wx of [px0 + 6, px0 + 20]) {
      g.rect(wx, yt - 11, 9, 6, 0x5a6a78);
      g.rect(wx + 1, yt - 10, 7, 4, WIN.warm);
      g.hline(wx + 1, wx + 7, yt - 10, WIN.curtain);
    }
  } else g.rect(px0 + 14, yt - 7, 8, 4, 0x5a6a78);
  g.hline(px0 - 1, px1 + 1, yt - 1, 0x8a8478);
  // 루프랙 + 스키
  g.hline(x1 - 30, x1 - 12, yt - 2, 0x5a5a60);
  for (const k of [0, 3]) {
    g.hline(x1 - 32, x1 - 10, yt - 4 - k, k ? 0xd84a3a : 0x3a7ac8);
    g.set(x1 - 9, yt - 5 - k, k ? 0xd84a3a : 0x3a7ac8);
  }
  doorSteps(g, dx, DW, yb);
  // 2단계부터 옆 차양 (지붕 가장자리에서 문 위로 — 뒤쪽 기둥은 창 사이, 앞쪽은 문 옆 벽에 붙은 팔. 3단계는 창 하나만큼 더 길게)
  let awning: CaravanArt["awning"];
  let bulbs: CaravanArt["bulbs"] = [];
  if (stage >= 2) {
    const ay = dTop - 1 - AWNING_CLOTH_H;
    const back = wins[Math.max(0, wins.length - (stage >= 3 ? 3 : 1))];
    const ax0 = back - 2;
    const ax1 = dx + DW;
    if (stage >= 3) {
      // 3단계: 창 셋·문을 덮는 긴 차양 + 앞으로 내민 기둥 둘 (앞바퀴 앞을 피해 문 바로 옆) + 꼬마전구 줄 + 창 아래 꽃 상자
      sideAwning(g, ax0, ax1, ay, o.awning ?? 0, [ax0, ax1], yb + 6, [], dBot, false);
      bulbs = festoon(g, ax0 + 1, ax1 - 1, ay + AWNING_CLOTH_H, 2, !!o.xmas);
      for (const wx of wins.slice(-2)) flowerBox(g, wx, 10, yt + 11, !!o.xmas);
    } else sideAwning(g, ax0, ax1, ay, o.awning ?? 0, [ax0], yb + 4, [ax1], dBot, false);
    awning = { x0: ax0, x1: ax1, y: ay + AWNING_CLOTH_H };
  }
  // 팝업 텐트는 윗줄 둘만 눈 (3단계 텐트 창이 보이게)
  const roof = roofMask(g, (x, y) => awningSnow(awning, x, y) ?? (x >= px0 && x <= px1 && y < yt ? y < yt - tentH + 2 : y < yt + 2));
  g.outline(OUT);
  doorMat(g, dx, DW, yb + 5);
  shadow(g, (x0 + x1) / 2, yb + 4, (x1 - x0) / 2 + 3, 2.8, 66);
  return padCaravan({ grid: g, roof, door: { x: dx + 5, y: yb, top: dTop }, windows: wins.map((x) => ({ x: x + 5, y: yt + 7 })), bulbs, ...(awning ? { awning } : {}) });
}

/** 카라반 옆 차양 줄무늬 두 색 (11/26 디자인의 차양 색 — protocol CARAVAN_AWNING_NAMES 순서: 빨강·파랑·초록·주황) */
export const AWNING_COLORS: readonly [Color, Color][] = [
  [0xd84a3a, 0xf6ecdc],
  [0x3a7ac8, 0xf6ecdc],
  [0x4f9a6a, 0xf2ead0],
  [0xe8a03a, 0xfaf2de],
];

/** 11/26 3단계 차양 아래 땅에 까는 야외 러그 (차양 색 줄무늬 + 크림 테 + 술). 위에서 본 판 — 원점 = 위 가운데 */
export const RUG_H = 9;
export function outdoorRugArt(w: number, ci: number): Grid {
  const [a] = AWNING_COLORS[ci % AWNING_COLORS.length];
  const g = new Grid(w, RUG_H);
  const edge = 0xf2e6c8;
  for (let y = 0; y < RUG_H; y++)
    for (let x = 1; x < w - 1; x++) {
      let c: Color = Math.floor((x - 1) / 5) % 2 === 0 ? a : mix(a, edge, 0.55);
      if (y === 0 || y === RUG_H - 1 || x === 1 || x === w - 2) c = edge;
      if (y === RUG_H - 1) c = darken(edge, 0.18);
      g.set(x, y, c);
    }
  // 양 끝 술
  for (let y = 1; y < RUG_H - 1; y += 2) {
    g.set(0, y, edge);
    g.set(w - 1, y, edge);
  }
  return g;
}

/** 11/26 카라반 3단계 피크닉 탁자 밑 네모 러그 (차양 색 · 세로 줄무늬 · 둘레 테 · 위아래 술) — 바닥에 깐다 */
export function patioRugArt(w: number, h: number, ci: number): Grid {
  const [a] = AWNING_COLORS[ci % AWNING_COLORS.length];
  const g = new Grid(w, h);
  const edge = 0xf2e6c8;
  for (let y = 1; y < h - 1; y++)
    for (let x = 0; x < w; x++) {
      let c: Color = Math.floor(x / 5) % 2 === 0 ? a : mix(a, edge, 0.55);
      if (x === 0 || x === w - 1 || y === 1 || y === h - 2) c = edge;
      if (y === h - 2) c = darken(edge, 0.18);
      g.set(x, y, c);
    }
  for (let x = 1; x < w - 1; x += 2) {
    g.set(x, 0, edge);
    g.set(x, h - 1, darken(edge, 0.18));
  }
  return g;
}

/** 11/26 고른 디자인으로 카라반 그리기 (모델 · 몸통 색 · 차양 색 — 캠핑장 맵·분양 창 미리보기·디자인 목록 시트 공용) */
export function caravanDesignArt(d: CaravanDesign, stage: CampYard = 1, o: { xmas?: boolean } = {}): CaravanArt {
  const opts: CaravanOpts = { awning: d.awning, xmas: o.xmas };
  return d.model === "teardrop" ? teardropArt(d.color, stage, opts) : d.model === "airstream" ? airstreamArt(d.color, stage, opts) : busCamperArt(d.color, stage, opts);
}

/** 디자인 고르기 칸의 색 견본 (몸통 색 — 에어스트림은 색 띠 색) */
export function caravanBodySwatch(model: CaravanModel, color: number): Color {
  if (model === "airstream") return AIR_ACCENT[color % AIR_ACCENT.length];
  return (model === "teardrop" ? TEARDROP_PALS : BUS_PALS)[color % 4].body;
}

/** 번호 말뚝 (자리 앞 왼쪽 모서리). sale = 분양 전 팻말 (빨간 리본 + 더 큰 판) */
/** 물가 앞줄 자리 = 물빛 번호판, 숲 뒷줄 = 나무색 (멀리서도 어느 줄인지 보이게) */
const ROW_PLATE = { front: { bg: 0xcfe6f2, band: 0x3a86b8 }, back: { bg: 0xf2e6c8, band: 0x5a9a5a } } as const;

/** mailbox = 11/26 분양된 카라반 자리: 말뚝에 작은 빨간 우편함 (깃발 세움) */
export function sitePostArt(n: number, sale: boolean, front = false, mailbox = false): Grid {
  const P = front ? ROW_PLATE.front : ROW_PLATE.back;
  const W = sale ? 26 : 16;
  const H = sale ? 30 : 22;
  const g = new Grid(W, H);
  const pw = n >= 10 ? 11 : 7;
  if (sale) {
    // 말뚝 둘 + 넓은 판 (번호 + 「분양」 자리 줄무늬)
    g.rect(4, 12, 2, H - 14, WOOD.lo);
    g.rect(W - 6, 12, 2, H - 14, WOOD.lo);
    g.rect(1, 3, W - 2, 12, P.bg);
    frame(g, 1, 3, W - 2, 12, WOOD.line);
    drawNumber(g, n, Math.round(W / 2 - pw / 2) + 1, 5, 0x3a2a1e);
    g.hline(3, W - 4, 12, P.band);
    g.hline(3, W - 4, 11, P.band);
    // 빨간 리본 (판 위 매듭)
    g.set(W / 2, 2, 0xd84a3a);
    g.set(W / 2 - 1, 1, 0xd84a3a);
    g.set(W / 2 + 1, 1, 0xd84a3a);
    g.set(W / 2 - 2, 2, 0xb83a2e);
    g.set(W / 2 + 2, 2, 0xb83a2e);
  } else {
    g.rect(3, 6, 2, H - 8, WOOD.lo);
    g.vline(3, 6, H - 3, WOOD.mid);
    g.rect(2, 1, pw + 2, 8, P.bg);
    frame(g, 2, 1, pw + 2, 8, WOOD.line);
    g.hline(3, pw + 2, 7, P.band);
    drawNumber(g, n, 4, 2, 0x3a2a1e);
    if (mailbox) {
      g.rect(6, 11, 8, 5, 0xc8343a);
      g.hline(6, 13, 11, 0xe85a5a);
      g.hline(7, 12, 13, 0x7a1e22);
      g.vline(13, 7, 11, 0x4a4a50);
      g.rect(14, 7, 2, 2, 0xf2c444);
    }
  }
  g.outline(OUT);
  shadow(g, W / 2, H - 1.5, W / 2 - 2, 1.2, 50);
  // 11/26 팻말 판이 캔버스 양 끝 열(윤곽)까지 닿아 배율에 따라 잘렸다
  return padGrid(g);
}

/** 전기·물 연결 기둥 (자리마다 하나, 작은 회색 함 + 초록 불) */
export function hookupArt(): Grid {
  const g = new Grid(8, 14);
  g.rect(1, 2, 6, 10, 0x8a949e);
  g.rect(1, 2, 6, 2, 0xb8c0c8);
  g.rect(2, 5, 4, 3, 0x5a6470);
  g.set(5, 9, 0x7ae08a);
  g.outline(OUT);
  for (let x = 1; x < 7; x++) g.set(x, 13, 0x1a1006, 60);
  return padGrid(g);
}

/** 위에서 본 판(다리)에 군데군데 쌓인 눈 (CampConceptDecor.snowFloor와 같은 생각) */
export function snowDust(src: Grid, cover = 0.42, seed = 0): Grid {
  const g = new Grid(src.w, src.h);
  g.px.set(src.px);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.get(x, y);
      if ((v & 255) < 200) continue;
      const c = v >>> 8;
      const L0 = 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
      if (L0 < 60) continue;
      const n = vnoise(x, y, 6, 461 + seed) * 0.75 + hash2(x, y, 463 + seed) * 0.25;
      if (n > 1 - cover) g.set(x, y, L0 < 110 ? SNOW.shade : L0 < 150 ? SNOW.lo : n > 0.82 ? SNOW.hi : SNOW.mid);
      else g.set(x, y, mix(c, 0xc8d4e0, 0.14));
    }
  return g;
}

/** 분양 전 자리 둘레 말뚝 + 빨강·흰 줄 (자리 크기 w×h, 원점 = 바닥 가운데 — 앞 줄이 바닥) */
export function plotRopeArt(w: number, h: number): Grid {
  const W = w + 4;
  const H = h + 8;
  const g = new Grid(W, H);
  const rope = (x0: number, y0: number, x1: number, y1: number, sag: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag);
      g.set(x, y, Math.floor(i / 3) % 2 ? 0xf6f0e6 : 0xd84a3a);
    }
  };
  const corners: [number, number][] = [
    [2, 6],
    [W - 3, 6],
    [2, H - 3],
    [W - 3, H - 3],
  ];
  // 줄 (말뚝 머리 높이 = 바닥에서 4px 위)
  rope(2, 2, W - 3, 2, 1.5);
  rope(2, 2, 2, H - 7, 0);
  rope(W - 3, 2, W - 3, H - 7, 0);
  rope(2, H - 7, W - 3, H - 7, 2);
  for (const [x, y] of corners) {
    g.rect(x - 1, y - 6, 2, 6, WOOD.lo);
    g.set(x - 1, y - 6, SNOW.hi);
    g.set(x, y - 6, SNOW.hi);
  }
  return g;
}

/** 길가 등 기둥 (나무 기둥 + 작은 등, 밤에 켜진다) */
export function lampPostArt(): Grid {
  const g = new Grid(9, 24);
  g.rect(3, 8, 3, 14, WOOD.lo);
  g.vline(3, 8, 21, WOOD.mid);
  g.rect(1, 2, 7, 7, 0x3a3634);
  g.rect(2, 3, 5, 5, WIN.warm);
  g.set(3, 4, 0xfff6d8);
  g.hline(0, 8, 1, 0x2a2624);
  g.set(4, 0, 0x2a2624);
  g.outline(OUT);
  shadow(g, 4.5, 22.5, 3.5, 1, 56);
  // 11/26 등 갓이 캔버스 양 끝에 닿아 잘렸다
  return padGrid(g);
}

/** 마당 가장자리에 눕혀 둔 짧은 통나무 (경계 표시 — 테두리 대신 군데군데) */
export function edgeLogArt(len: number): Grid {
  const g = new Grid(len + 2, 7);
  g.rect(1, 1, len, 4, LOG.mid);
  g.hline(1, len, 1, LOG.hi);
  g.hline(1, len, 4, LOG.lo);
  g.ellipse(len, 3, 1.5, 2, LOG.ring);
  g.outline(OUT);
  for (let x = 1; x <= len; x++) g.set(x, 6, 0x1a1006, 50);
  return padGrid(g);
}
