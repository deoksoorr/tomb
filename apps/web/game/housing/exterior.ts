import { HOUSE_LOT_H, HOUSE_LOT_W } from "@tomb/protocol";
import type { HouseExteriorMap } from "@/lib/housing/catalog";
import { darken, Grid, hash2, lighten, mix, type Color } from "../sprites/pixel";

// 집 외관 = 필지 한 칸 전체 그림 (F2·F18). 메인 맵 주거 구역·분양 마을(2단지)·외관 꾸미기 미리보기가 같은 그림을 쓴다.
//  - 필지 크기(가로 W × 세로 H)는 프로토콜의 HOUSE_LOT_W/H를 따르고, 크기가 바뀌면 집·마당이 비율대로 따라간다.
//  - 층 4장: ground(마당·길·경계석, 바닥 깊이) · house(집 몸체·지붕·굴뚝, 깊이 = 집 밑변) ·
//    front(앞 울타리·우편함·간판·가로등, 깊이 = 필지 아랫변) · lit(밤에 켜지는 창 불빛, 집 위에 겹쳐 알파로 켠다)
//  - 터 크기(tier)에 따라 집이 확실히 달라진다: 작은 터 = 오두막 + 텃밭, 넓은 터 = 별채 달린 집 + 꽃밭,
//    대저택 = 2층 본채 + 양쪽 날개 + 돌 앞마당·대문 기둥.
//  - 모든 벽·지붕 무늬는 그 면의 크기로 만든 작은 그리드에 그린 뒤 얹는다 → 돌벽 같은 무늬가 벽 밖으로 삐져나오지 않는다.

const OUT = 0x1a1612;
const WOOD = 0x7a5236;
const WOOD_D = 0x553722;
const WOOD_L = 0x9c6d45;
const STONE = 0x8c8a82;
const STONE_D = 0x5f5d57;
const STONE_L = 0xaaa79c;
const LEAF = 0x4f7a4a;
const LEAF_D = 0x34563a;
const LEAF_L = 0x76a466;
const GLASS = 0x2c4258;
const GLASS_L = 0x86aec8;
const GLOW = 0xffd27a;
const GLOW_L = 0xfff0bc;
const FLOWERS = [0xf0a0c0, 0xf0e080, 0xb0a0f0, 0xf6f2e8];

/** 기본 필지 크기 (프로토콜 HOUSE_LOT_W/H) */
export const FACADE_W = HOUSE_LOT_W;
export const FACADE_H = HOUSE_LOT_H;

export type LotSize = { w: number; h: number };
const DEFAULT_SIZE: LotSize = { w: FACADE_W, h: FACADE_H };

type Rect = { x: number; y: number; w: number; h: number };
type Block = { x: number; w: number; wallH: number; roof: "gable" | "hip"; roofH: number; over: number; wins: Rect[]; main?: boolean };

/** 집 배치 계획 (필지 좌표) */
export type HousePlan = {
  tier: "small" | "wide" | "manor";
  W: number;
  H: number;
  cx: number;
  /** 집 밑변 y (문 아래) */
  baseY: number;
  blocks: Block[];
  door: Rect & { double: boolean };
  chimneys: Rect[];
  /** 지붕·굴뚝 맨 위 y (문패를 그 위에) */
  roofTop: number;
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function housePlan(tierId: string, size: LotSize = DEFAULT_SIZE): HousePlan {
  const W = size.w;
  const H = size.h;
  const tier = tierId === "manor" || tierId === "wide" ? tierId : "small";
  // 기준 필지(128×104) 대비 배율. 그림이 너무 작아지거나 커지지 않게 묶는다
  const k = Math.max(0.75, Math.min(1.6, Math.min(W / 128, H / 104)));
  const s = (n: number) => Math.round(n * k);
  const cx = Math.floor(W / 2);
  const baseY = H - 16;
  const blocks: Block[] = [];
  const chimneys: Rect[] = [];
  let door: HousePlan["door"];
  const win = (x: number, y: number, w = 9, h = 10): Rect => ({ x, y, w: s(w), h: s(h) });

  if (tier === "small") {
    const w = even(s(54));
    const x = cx - w / 2;
    const wallH = s(26);
    const top = baseY - wallH;
    blocks.push({ x, w, wallH, roof: "gable", roofH: s(20), over: 4, main: true, wins: [win(x + s(7), top + s(7)), win(x + w - s(7) - s(9), top + s(7))] });
    chimneys.push({ x: cx + s(11), y: top - s(19), w: 6, h: s(13) });
    door = { x: cx - 5, y: baseY - s(16), w: 10, h: s(16), double: false };
  } else if (tier === "wide") {
    const w = even(s(58));
    const x = cx - w / 2;
    const wallH = s(30);
    const top = baseY - wallH;
    // 오른쪽 별채 (낮은 모임지붕) — 본채보다 먼저 그려 본채가 겹친다
    const ww = s(28);
    const wx = x + w - 2;
    const wH = s(22);
    blocks.push({ x: wx, w: ww, wallH: wH, roof: "hip", roofH: s(12), over: 3, wins: [win(wx + Math.round((ww - s(14)) / 2) + 1, baseY - wH + s(6), 14, 9)] });
    blocks.push({ x, w, wallH, roof: "gable", roofH: s(24), over: 4, main: true, wins: [win(x + s(7), top + s(9)), win(x + w - s(7) - s(9), top + s(9))] });
    chimneys.push({ x: wx + ww - s(10), y: baseY - wH - s(16), w: 6, h: s(12) });
    door = { x: cx - 5, y: baseY - s(17), w: 10, h: s(17), double: false };
  } else {
    const w = even(s(50));
    const x = cx - w / 2;
    const wallH = s(48);
    const top = baseY - wallH;
    const ww = s(26);
    const wH = s(34);
    const wTop = baseY - wH;
    const lx = x - ww + 2;
    const rx = x + w - 2;
    const wingWins = (bx: number) => [win(bx + s(5), wTop + s(8), 7, 13), win(bx + ww - s(5) - s(7), wTop + s(8), 7, 13)];
    blocks.push({ x: lx, w: ww, wallH: wH, roof: "hip", roofH: s(14), over: 3, wins: wingWins(lx) });
    blocks.push({ x: rx, w: ww, wallH: wH, roof: "hip", roofH: s(14), over: 3, wins: wingWins(rx) });
    const up = top + s(6);
    blocks.push({
      x,
      w,
      wallH,
      roof: "gable",
      roofH: s(22),
      over: 4,
      main: true,
      wins: [win(x + s(5), up), win(cx - Math.round(s(9) / 2), up), win(x + w - s(5) - s(9), up), win(x + s(4), baseY - s(19), 8, 11), win(x + w - s(4) - s(8), baseY - s(19), 8, 11)],
    });
    chimneys.push({ x: lx + s(6), y: wTop - s(17), w: 6, h: s(13) }, { x: rx + ww - s(12), y: wTop - s(17), w: 6, h: s(13) });
    door = { x: cx - 7, y: baseY - s(19), w: 14, h: s(19), double: true };
  }
  let roofTop = Infinity;
  for (const b of blocks) roofTop = Math.min(roofTop, baseY - b.wallH - b.roofH);
  for (const c of chimneys) roofTop = Math.min(roofTop, c.y - 2);
  return { tier, W, H, cx, baseY, blocks, door, chimneys, roofTop: Math.max(0, roofTop) };
}

// ── 정보 (충돌·빛·문·연기) ──

export type FacadeInfo = {
  /** 문 앞 (필지 좌표, 발밑) */
  door: { x: number; y: number };
  /** 집 발 자리 (충돌용) */
  body: { x: number; y: number; w: number; h: number };
  lights: { x: number; y: number; r: number; color: number }[];
  /** 굴뚝 꼭대기 (연기) */
  chimneys: { x: number; y: number }[];
  /** 지붕 맨 위 y (문패 자리) */
  roofTop: number;
  /** 집 밑변 y (깊이 정렬) */
  baseY: number;
};

/** 집 발 자리 깊이 (앞에서 본 그림이라 몸체 높이보다 얕게: 그 뒤로 걸어가면 지붕에 가려진다) */
const FOOT_DEPTH = 26;

export function facadeInfo(ext: Partial<HouseExteriorMap>, tier: string, size: LotSize = DEFAULT_SIZE): FacadeInfo {
  const p = housePlan(tier, size);
  const x0 = Math.min(...p.blocks.map((b) => b.x));
  const x1 = Math.max(...p.blocks.map((b) => b.x + b.w));
  const lights: FacadeInfo["lights"] = [];
  // 창 불빛: 채마다 하나 (창 여러 개의 가운데). 빛이 너무 많으면 밤 화면이 무거워진다
  for (const b of p.blocks) {
    if (!b.wins.length) continue;
    const wx0 = Math.min(...b.wins.map((w) => w.x));
    const wx1 = Math.max(...b.wins.map((w) => w.x + w.w));
    const wy = b.wins.reduce((s, w) => s + w.y + w.h / 2, 0) / b.wins.length;
    lights.push({ x: (wx0 + wx1) / 2, y: wy + 2, r: Math.min(26, 10 + (wx1 - wx0) / 3), color: 0xffc070 });
  }
  const f = front(p);
  if (ext.garden === "garden_lanterns") for (const lx of f.lanterns) lights.push({ x: lx, y: p.baseY + 2, r: 18, color: 0xffb060 });
  if (ext.sign === "sign_neon") lights.push({ x: Math.min(f.signX, p.W - 21) + 8, y: p.H - 18, r: 20, color: 0xff7ac0 });
  lights.push({ x: f.lampX, y: p.H - 19, r: 26, color: 0xffd080 });
  if (p.tier === "manor") for (const gx of f.pillars) lights.push({ x: gx, y: p.H - 19, r: 18, color: 0xffd080 });
  return {
    door: { x: p.cx, y: p.baseY + 4 },
    body: { x: x0, y: p.baseY - FOOT_DEPTH, w: x1 - x0, h: FOOT_DEPTH },
    lights,
    chimneys: p.chimneys.map((c) => ({ x: c.x + c.w / 2, y: c.y - 1 })),
    roofTop: p.roofTop,
    baseY: p.baseY,
  };
}

/** 앞마당 물건 자리 */
function front(p: HousePlan) {
  const gap = p.tier === "manor" ? 11 : 9;
  return {
    /** 길 반폭 (울타리·담이 비우는 곳) */
    gap,
    mailX: p.cx - gap - 16,
    signX: p.cx + gap + 4,
    lampX: 4,
    lanterns: [p.cx - gap + 1, p.cx + gap - 2],
    pillars: [p.cx - gap - 2, p.cx + gap + 1],
  };
}

// ── 지붕 ──

const ROOF: Record<string, [Color, Color, Color]> = {
  roof_slate: [0x56606e, 0x3e4450, 0x2c313a],
  roof_red: [0xc0583e, 0xa04030, 0x7a2c22],
  roof_teal: [0x46a6a0, 0x2f7a78, 0x205856],
  roof_thatch: [0xd8b868, 0xb8954a, 0x8a6a30],
  roof_moss: [0x76a466, 0x4f6e3a, 0x3a5228],
};

function roofColor(kind: string, x: number, row: number, rows: number): Color | null {
  const [l, m, d] = ROOF[kind] ?? ROOF.roof_slate;
  switch (kind) {
    case "roof_red": {
      const r = row % 3;
      if (r === 2) return x % 4 === 1 ? m : d;
      if (r === 0 && x % 4 === 2) return l;
      return m;
    }
    case "roof_teal":
      if (x % 5 === 0) return l;
      if (x % 5 === 1) return d;
      return row === rows - 1 ? d : m;
    case "roof_thatch": {
      const h = hash2(x, row, 17);
      if (row === rows - 1 && h < 0.35) return null; // 처마 끝 들쭉날쭉
      return h < 0.2 ? l : h > 0.8 ? d : m;
    }
    case "roof_moss": {
      if (row % 3 === 2) return d;
      const h = hash2(x >> 1, row >> 1, 23);
      return h > 0.72 ? l : h < 0.08 ? 0x8a8c80 : m;
    }
    default: {
      // 슬레이트: 줄마다 어긋난 비늘
      if (row % 3 === 2) return d;
      if ((x + Math.floor(row / 3) * 3) % 6 === 0) return d;
      return row % 3 === 0 && x % 6 === 3 ? l : m;
    }
  }
}

function drawRoof(g: Grid, kind: string, b: Block, baseY: number): void {
  const wallTop = baseY - b.wallH;
  const half = b.w / 2 + b.over;
  const mid = b.x + b.w / 2;
  const topHalf = b.roof === "hip" ? Math.max(3, Math.round(b.w * 0.18)) : 0;
  const rows = b.roofH;
  const [, , d] = ROOF[kind] ?? ROOF.roof_slate;
  for (let i = 0; i < rows; i++) {
    const t = (i + 1) / rows;
    const hw = Math.round(topHalf + (half - topHalf) * t);
    const y = wallTop - rows + i + 2;
    const l = Math.round(mid - hw);
    const r = Math.round(mid + hw) - 1;
    for (let x = l; x <= r; x++) {
      let c = roofColor(kind, x, i, rows);
      if (c === null) continue;
      if (b.roof === "gable" && x >= mid) c = darken(c, 0.14); // 오른쪽 경사면은 그늘
      if (x === l || x === r) c = darken(d, 0.2); // 박공 테두리
      g.set(x, y, c);
    }
  }
  // 용마루
  if (b.roof === "hip") g.hline(Math.round(mid - topHalf), Math.round(mid + topHalf) - 1, wallTop - rows + 2, lighten(d, 0.15));
  // 처마 그늘
  g.hline(b.x, b.x + b.w - 1, wallTop + 2, 0x1e1812);
}

/** 박공 다락 창 (넓은 터 본채) */
function atticWindow(g: Grid, lit: Grid, cx: number, y: number): void {
  g.ellipse(cx, y, 4, 4, 0x2a1c14);
  g.ellipse(cx, y, 3, 3, GLASS);
  g.set(cx - 2, y - 2, GLASS_L);
  lit.ellipse(cx, y, 3, 3, GLOW);
  lit.set(cx - 1, y - 1, GLOW_L);
  for (const gg of [g, lit]) {
    gg.vline(cx, y - 3, y + 2, 0x2a1c14);
    gg.hline(cx - 3, cx + 2, y, 0x2a1c14);
  }
}

// ── 벽 ──

const FACADE_BASE: Record<string, Color> = {
  facade_plank: 0x7a5a3c,
  facade_brick: 0x8a3e30,
  facade_stone: 0x6c6a63,
  facade_white: 0xd8d2c0,
};

/** 벽 무늬를 벽 크기 그리드에 그린다 (밖으로 나갈 수 없다) */
function wallPattern(kind: string, w: number, h: number, seed: number): Grid {
  const g = new Grid(w, h);
  switch (kind) {
    case "facade_brick": {
      g.rect(0, 0, w, h, 0x5e2a20);
      for (let j = 0, row = 0; j < h; j += 4, row++)
        for (let i = row % 2 ? -4 : 0; i < w; i += 8) {
          const c = hash2(i + seed, row, 3) > 0.75 ? 0x9a4a3a : hash2(i, row + seed, 5) < 0.15 ? 0x7a3428 : 0x8a3e30;
          g.rect(i + 1, j + 1, 7, 3, c);
        }
      break;
    }
    case "facade_stone": {
      // 돌벽: 줄마다 폭이 다른 돌. 벽 크기 그리드라 오른쪽 끝 돌은 잘린다 (예전엔 벽 밖으로 나갔다)
      g.rect(0, 0, w, h, 0x4a4843);
      for (let j = 0, row = 0; j < h; j += 5, row++) {
        let i = row % 2 ? -3 : 0;
        while (i < w) {
          const sw = 5 + Math.floor(hash2(i + seed, row, 7) * 5);
          const c = [STONE, 0x7c7a72, 0x98968c][Math.floor(hash2(row, i + seed, 9) * 3)];
          g.rect(i + 1, j + 1, sw - 1, 4, c);
          g.set(i + 1, j + 1, lighten(c, 0.25));
          i += sw;
        }
      }
      break;
    }
    case "facade_white": {
      g.rect(0, 0, w, h, 0xd8d2c0);
      for (let n = 0; n < (w * h) / 40; n++) g.set(Math.floor(hash2(n, seed, 11) * w), Math.floor(hash2(seed, n, 13) * h), 0xc8c2b0);
      g.hline(0, w - 1, 0, 0xb8b09c);
      break;
    }
    default: {
      // 나무 판자
      g.rect(0, 0, w, h, 0x7a5a3c);
      for (let j = 3; j < h; j += 4) g.hline(0, w - 1, j, 0x5e4430);
      for (let n = 0; n < w / 6; n++) {
        const x = Math.floor(hash2(n, seed, 15) * w);
        const y = Math.floor(hash2(seed, n, 19) * Math.floor(h / 4)) * 4 + 1;
        g.hline(x, Math.min(w - 1, x + 3), y, 0x8a6a4a);
      }
      for (let j = 1; j < h; j += 8) {
        g.set(2, j, 0x3e2c20);
        g.set(w - 3, j + 4, 0x3e2c20);
      }
    }
  }
  return g;
}

function drawWall(g: Grid, kind: string, b: Block, baseY: number, seed: number): void {
  const top = baseY - b.wallH;
  g.draw(wallPattern(kind, b.w, b.wallH, seed), b.x, top);
  const base = FACADE_BASE[kind] ?? FACADE_BASE.facade_plank;
  // 모서리 기둥·기단
  const corner = kind === "facade_white" ? WOOD_D : darken(base, 0.35);
  g.vline(b.x, top, baseY - 1, corner);
  g.vline(b.x + b.w - 1, top, baseY - 1, corner);
  if (kind === "facade_white") {
    g.hline(b.x, b.x + b.w - 1, top + Math.round(b.wallH / 2), WOOD_D); // 반목조 띠
  }
  g.rect(b.x, baseY - 3, b.w, 3, STONE_D);
  g.hline(b.x, b.x + b.w - 1, baseY - 3, STONE);
}

function drawWindow(g: Grid, lit: Grid, w: Rect, opt: { shutters: boolean; box: boolean; arch: boolean }): void {
  const frame = 0x3a281a;
  g.rect(w.x - 1, w.y - 1, w.w + 2, w.h + 2, frame);
  if (opt.arch) g.hline(w.x, w.x + w.w - 1, w.y - 2, frame);
  g.rect(w.x, w.y, w.w, w.h, GLASS);
  g.set(w.x + 1, w.y + 1, GLASS_L);
  g.set(w.x + 2, w.y + 1, GLASS_L);
  g.set(w.x + 1, w.y + 2, GLASS_L);
  g.set(w.x + w.w - 2, w.y + w.h - 2, 0x3c5670);
  lit.rect(w.x, w.y, w.w, w.h, GLOW);
  lit.rect(w.x + 1, w.y + 1, Math.max(1, w.w - 2), Math.max(1, Math.floor(w.h / 2) - 1), GLOW_L);
  const mx = w.x + Math.floor(w.w / 2);
  const my = w.y + Math.floor(w.h / 2);
  for (const gg of [g, lit]) {
    gg.vline(mx, w.y, w.y + w.h - 1, frame);
    gg.hline(w.x, w.x + w.w - 1, my, frame);
  }
  // 창턱
  g.hline(w.x - 2, w.x + w.w + 1, w.y + w.h + 1, 0xc8b89a);
  if (opt.shutters) {
    g.rect(w.x - 4, w.y - 1, 3, w.h + 2, 0x3e5a48);
    g.rect(w.x + w.w + 1, w.y - 1, 3, w.h + 2, 0x3e5a48);
    g.vline(w.x - 3, w.y, w.y + w.h - 1, 0x2e4636);
    g.vline(w.x + w.w + 2, w.y, w.y + w.h - 1, 0x2e4636);
  }
  if (opt.box) {
    g.rect(w.x - 1, w.y + w.h + 2, w.w + 2, 2, WOOD);
    for (let i = 0; i < w.w + 2; i += 2) {
      g.set(w.x - 1 + i, w.y + w.h + 1, LEAF);
      if (i % 4 === 0) g.set(w.x - 1 + i, w.y + w.h, FLOWERS[(i / 2) % FLOWERS.length]);
    }
  }
}

function drawDoor(g: Grid, lit: Grid, p: HousePlan, kind: string): void {
  const d = p.door;
  const color = kind === "door_red" ? 0xa83a30 : kind === "door_arch" ? 0x4a3020 : 0x5a3a26;
  const frame = p.tier === "manor" ? STONE_L : WOOD_D;
  g.rect(d.x - 1, d.y - 1, d.w + 2, d.h + 1, frame);
  g.rect(d.x, d.y, d.w, d.h, color);
  if (kind === "door_arch") {
    g.hline(d.x, d.x + d.w - 1, d.y - 1, color);
    g.hline(d.x + 1, d.x + d.w - 2, d.y - 2, color);
    g.hline(d.x + 2, d.x + d.w - 3, d.y - 3, frame);
    g.set(d.x - 1, d.y - 1, frame);
    g.set(d.x + d.w, d.y - 1, frame);
    const wx = d.x + Math.floor(d.w / 2) - 2;
    g.rect(wx, d.y + 2, 4, 3, GLASS);
    lit.rect(wx, d.y + 2, 4, 3, GLOW);
  } else if (kind === "door_red") {
    g.rect(d.x + 2, d.y + 2, d.w - 4, 5, lighten(color, 0.12));
    g.rect(d.x + 2, d.y + 9, d.w - 4, d.h - 11, lighten(color, 0.12));
  } else {
    for (let x = d.x + 2; x < d.x + d.w - 1; x += 3) g.vline(x, d.y + 1, d.y + d.h - 1, darken(color, 0.3));
  }
  if (d.double) g.vline(d.x + d.w / 2, d.y, d.y + d.h - 1, darken(color, 0.45));
  // 손잡이
  g.set(d.x + d.w - 3, d.y + Math.floor(d.h / 2) + 1, 0xe0c060);
  if (d.double) g.set(d.x + 2, d.y + Math.floor(d.h / 2) + 1, 0xe0c060);
  // 넓은 터·대저택: 문 위 채광창
  if (p.tier === "wide" && kind !== "door_arch") {
    g.rect(d.x, d.y - 4, d.w, 3, GLASS);
    lit.rect(d.x, d.y - 4, d.w, 3, GLOW);
    g.hline(d.x - 1, d.x + d.w, d.y - 5, frame);
  }
  // 문턱 계단
  g.rect(d.x - 3, p.baseY, d.w + 6, 2, STONE);
  g.hline(d.x - 3, d.x + d.w + 2, p.baseY, STONE_L);
}

function drawChimney(g: Grid, c: Rect): void {
  g.rect(c.x, c.y, c.w, c.h, 0x7a4a3a);
  for (let j = c.y + 3; j < c.y + c.h; j += 3) g.hline(c.x, c.x + c.w - 1, j, 0x5a3428);
  g.vline(c.x + c.w - 1, c.y, c.y + c.h - 1, 0x5a3428);
  g.rect(c.x - 1, c.y - 2, c.w + 2, 2, 0x3a2c22);
}

// ── 마당 (바닥층) ──

function drawGround(g: Grid, p: HousePlan, ext: HouseExteriorMap): void {
  const { W, H, cx, baseY, tier } = p;
  const lawn = tier === "manor" ? 0x456538 : tier === "wide" ? 0x426038 : 0x3d5634;
  g.rect(0, 0, W, H, lawn);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const h = hash2(x, y, 31);
      if (tier === "small") {
        if (h > 0.9) g.set(x, y, 0x4a6a3e);
        else if (h < 0.06) g.set(x, y, 0x32482a);
      } else {
        // 깎은 잔디 줄무늬 (대저택은 바둑판)
        const stripe = tier === "manor" ? (Math.floor(x / 8) + Math.floor(y / 8)) % 2 : Math.floor(y / 6) % 2;
        if (stripe) g.set(x, y, lighten(lawn, 0.06));
        if (h > 0.94) g.set(x, y, 0x55784a);
      }
    }
  for (const t of backTrees(p)) g.ellipse(t.x, t.y, t.kind === "cone" ? 6 : 9, 2.5, darken(lawn, 0.3));
  // 필지 경계 (낮은 경계석 테두리)
  for (let x = 0; x < W; x++) {
    g.set(x, 0, 0x2c3b26);
    g.set(x, H - 1, x % 4 === 0 ? STONE_D : STONE);
    g.set(x, H - 2, 0x2c3b26);
  }
  for (let y = 0; y < H; y++) {
    g.set(0, y, 0x2c3b26);
    g.set(W - 1, y, 0x2c3b26);
  }
  // 집 아래 그늘
  const x0 = Math.min(...p.blocks.map((b) => b.x));
  const x1 = Math.max(...p.blocks.map((b) => b.x + b.w));
  g.rect(x0 - 1, baseY - 4, x1 - x0 + 2, 6, darken(lawn, 0.35));
  // 길
  const f = front(p);
  if (tier === "manor") {
    // 돌 앞마당: 날개 앞부터 대문까지 자갈 깐 마당
    const fx0 = cx - 34;
    const fx1 = cx + 34;
    for (let y = baseY + 1; y < H - 2; y++)
      for (let x = fx0; x <= fx1; x++) {
        const edge = x === fx0 || x === fx1;
        g.set(x, y, edge ? STONE_D : (x + (y % 2) * 2) % 4 === 0 ? 0x77756c : hash2(x, y, 41) > 0.5 ? 0x8f8c82 : 0x85827a);
      }
    for (let y = baseY + 1; y < H - 2; y++) for (let x = cx - f.gap + 3; x <= cx + f.gap - 4; x++) g.set(x, y, (x + y) % 3 ? 0xa29e92 : 0x928e82);
  } else if (tier === "wide") {
    for (let y = baseY + 2; y < H - 2; y += 4)
      for (let x = cx - 5; x <= cx + 4; x += 5) {
        g.rect(x, y, 4, 3, hash2(x, y, 43) > 0.5 ? STONE : 0x9a978c);
        g.hline(x, x + 3, y + 2, STONE_D);
      }
  } else {
    for (let y = baseY + 3, i = 0; y < H - 3; y += 4, i++) {
      const sx = cx + (i % 2 ? 1 : -2);
      g.ellipse(sx, y, 3, 1.6, STONE);
      g.set(sx - 1, y - 1, STONE_L);
    }
  }
  // 터마다 마당 꾸밈
  if (tier === "small") {
    // 왼쪽 텃밭
    const vx = 6;
    const vy = baseY - 22;
    const vw = Math.max(10, x0 - 12);
    g.rect(vx, vy, vw, 16, 0x4a3626);
    for (let r = 0; r < 4; r++) {
      g.hline(vx + 1, vx + vw - 2, vy + 2 + r * 4, 0x5e4430);
      for (let x = vx + 2; x < vx + vw - 2; x += 3) {
        g.set(x, vy + 1 + r * 4, LEAF_L);
        g.set(x + 1, vy + 1 + r * 4, LEAF);
      }
    }
  } else if (tier === "wide") {
    // 왼쪽 둥근 꽃밭
    const fx = Math.max(10, Math.round(x0 / 2));
    g.ellipse(fx, baseY - 14, Math.min(10, x0 / 2 - 3), 6, 0x4a3626);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.set(Math.round(fx + Math.cos(a) * 6), Math.round(baseY - 14 + Math.sin(a) * 3.5), FLOWERS[i % FLOWERS.length]);
    }
    g.set(fx, baseY - 14, LEAF_L);
  }
  // 앞마당 꽃밭 (정원)
  if (ext.garden === "garden_flowers") {
    for (let x = x0 + 1; x < x1 - 1; x++) {
      if (Math.abs(x - cx) < p.door.w / 2 + 4) continue;
      g.set(x, baseY + 2, x % 2 ? LEAF : LEAF_D);
      if (x % 3 === 0) g.set(x, baseY + 1, FLOWERS[x % FLOWERS.length]);
      g.set(x, baseY + 3, 0x3a2c22);
    }
    for (let y = baseY + 5; y < H - 4; y += 3) {
      g.set(cx - f.gap + 1, y, FLOWERS[y % 4]);
      g.set(cx + f.gap - 2, y + 1, FLOWERS[(y + 1) % 4]);
    }
  }
}

// ── 집 몸체층 ──

function drawHouse(g: Grid, lit: Grid, p: HousePlan, ext: HouseExteriorMap): void {
  const roof = ext.roof;
  // 굴뚝은 지붕보다 먼저 (지붕이 밑동을 덮는다)
  for (const c of p.chimneys) drawChimney(g, c);
  for (const [i, b] of p.blocks.entries()) {
    drawWall(g, ext.facade, b, p.baseY, i * 7 + 3);
    drawRoof(g, roof, b, p.baseY);
    for (const w of b.wins) drawWindow(g, lit, w, { shutters: p.tier === "small", box: ext.garden === "garden_flowers", arch: p.tier === "manor" && !b.main });
  }
  const main = p.blocks.find((b) => b.main)!;
  if (p.tier === "wide") atticWindow(g, lit, p.cx, p.baseY - main.wallH - Math.round(main.roofH * 0.45) + 2);
  if (p.tier === "manor") {
    // 2층 발코니 + 문 양옆 기둥
    const by = p.baseY - Math.round(main.wallH / 2) + 1;
    g.rect(main.x + 1, by, main.w - 2, 2, STONE_L);
    g.hline(main.x + 1, main.x + main.w - 2, by + 2, STONE_D);
    for (let x = main.x + 2; x < main.x + main.w - 2; x += 3) g.vline(x, by - 4, by - 1, STONE_L);
    g.hline(main.x + 1, main.x + main.w - 2, by - 5, STONE_L);
    for (const px of [p.door.x - 5, p.door.x + p.door.w + 2]) {
      g.rect(px, by + 3, 3, p.baseY - by - 3, 0xe6e0d0);
      g.vline(px + 2, by + 3, p.baseY - 1, 0xb8b2a2);
      g.rect(px - 1, by + 3, 5, 1, 0xf4f0e4);
    }
    // 박공 둥근 창
    atticWindow(g, lit, p.cx, p.baseY - main.wallH - Math.round(main.roofH * 0.42) + 2);
  }
  drawDoor(g, lit, p, ext.door);
  // 집에 붙은 정원 물건
  const x0 = Math.min(...p.blocks.map((b) => b.x));
  const x1 = Math.max(...p.blocks.map((b) => b.x + b.w));
  if (ext.garden === "garden_pots") {
    for (const px of [x0 + 2, p.door.x - 9, p.door.x + p.door.w + 4, x1 - 8]) {
      g.rect(px, p.baseY - 4, 5, 4, 0xa85a3a);
      g.hline(px - 1, px + 5, p.baseY - 4, 0xc8704a);
      g.ellipse(px + 2.5, p.baseY - 6, 3, 2.5, LEAF);
      g.set(px + 2, p.baseY - 8, FLOWERS[px % FLOWERS.length]);
    }
  }
  if (p.tier === "small") {
    // 오른쪽 장작더미
    const lx = x1 + 3;
    if (lx + 12 < p.W - 4) {
      for (let r = 0; r < 3; r++)
        for (let i = 0; i < 3 - (r === 2 ? 1 : 0); i++) {
          const ex = lx + i * 4 + (r === 2 ? 2 : 0);
          const ey = p.baseY - 4 - r * 3;
          g.ellipse(ex + 1.5, ey + 1.5, 2, 1.6, WOOD_L);
          g.set(ex + 1, ey + 1, 0xc89a68);
        }
    }
  } else if (p.tier === "wide") {
    // 왼쪽 벤치
    const bx = Math.max(4, x0 - 20);
    g.rect(bx, p.baseY - 7, 14, 2, WOOD_L);
    g.rect(bx, p.baseY - 10, 14, 2, WOOD);
    g.vline(bx + 1, p.baseY - 5, p.baseY - 1, WOOD_D);
    g.vline(bx + 12, p.baseY - 5, p.baseY - 1, WOOD_D);
  }
  g.outline(OUT, false, 170);
}

// ── 뒤뜰층 (필지 위쪽 구석 나무: 깊이 = 나무 밑동) ──

/** 뒤뜰 나무 자리 (필지 좌표, 밑동) */
function backTrees(p: HousePlan): { x: number; y: number; kind: "round" | "cone" }[] {
  const y = Math.max(22, Math.round(p.H * 0.36));
  if (p.tier === "manor") return [{ x: 8, y, kind: "cone" }, { x: p.W - 9, y, kind: "cone" }];
  if (p.tier === "wide") return [{ x: 15, y, kind: "round" }];
  return [{ x: 16, y, kind: "round" }, { x: p.W - 16, y: y - 4, kind: "cone" }];
}

function drawBack(g: Grid, p: HousePlan): void {
  for (const t of backTrees(p)) {
    if (t.kind === "cone") {
      g.rect(t.x - 1, t.y - 4, 3, 4, 0x5a3e2a);
      for (let i = 0; i < 22; i++) {
        const hw = Math.round(1 + (i / 22) * 5);
        g.hline(t.x - hw, t.x + hw, t.y - 26 + i, i % 5 === 4 ? LEAF_D : 0x3e6640);
      }
      for (let i = 2; i < 20; i += 4) g.set(t.x - 1 + (i % 3), t.y - 25 + i, LEAF_L);
    } else {
      g.rect(t.x - 1, t.y - 9, 3, 9, 0x5a3e2a);
      g.ellipse(t.x, t.y - 16, 10, 9, LEAF_D);
      g.ellipse(t.x - 3, t.y - 19, 6, 5, LEAF);
      g.ellipse(t.x + 4, t.y - 14, 4, 3.5, LEAF);
      for (let i = 0; i < 8; i++) g.set(t.x - 7 + ((i * 5) % 14), t.y - 23 + ((i * 3) % 12), LEAF_L);
      g.set(t.x + 5, t.y - 20, 0xd8843a);
      g.set(t.x - 6, t.y - 13, 0xd8843a);
    }
  }
  g.outline(OUT, false, 150);
}

// ── 앞층 (울타리·우편함·간판·가로등) ──

function drawFront(g: Grid, p: HousePlan, ext: HouseExteriorMap): void {
  const { W, H, cx, baseY } = p;
  const f = front(p);
  const fy = H - 3; // 울타리 밑동
  // 울타리: 앞줄 + 양옆 (가운데 길은 비운다). 그리드가 필지 크기라 바깥으로 나가지 않는다
  if (ext.fence !== "fence_none") {
    const sideTop = Math.max(2, baseY - 30);
    const post = (x: number, y: number) => {
      if (ext.fence === "fence_picket") {
        g.vline(x, y - 6, y, 0xe8e2d0);
        g.set(x, y - 7, 0xf6f2e8);
      } else if (ext.fence === "fence_stone") {
        g.rect(x - 1, y - 4, 3, 5, (x >> 2) % 2 ? STONE : 0x7c7a72);
        g.set(x - 1, y - 4, STONE_L);
      } else {
        g.ellipse(x, y - 3, 2.4, 3, LEAF_D);
        g.set(x, y - 5, LEAF);
      }
    };
    for (let x = 2; x < W - 2; x++) {
      if (Math.abs(x + 0.5 - cx) < f.gap) continue;
      if (ext.fence === "fence_picket") {
        if (x % 3 === 0) post(x, fy);
        g.set(x, fy - 2, 0xd8d2c0);
        g.set(x, fy - 5, 0xd8d2c0);
      } else if (ext.fence === "fence_stone") {
        g.vline(x, fy - 4, fy, (Math.floor(x / 4) + 1) % 2 ? STONE : STONE_D);
        g.set(x, fy - 4, (x >> 2) % 2 ? STONE_L : STONE);
        if (x % 4 === 0) g.vline(x, fy - 3, fy, 0x4a4843);
      } else {
        g.vline(x, fy - 5 + ((x * 7) % 3 === 0 ? 0 : 1), fy, x % 5 ? LEAF_D : LEAF);
        if (x % 4 === 1) g.set(x, fy - 4, LEAF_L);
      }
    }
    for (let y = sideTop; y <= fy; y += 3) {
      post(2, y);
      post(W - 3, y);
    }
    // 문 기둥
    for (const gx of [cx - f.gap, cx + f.gap - 1]) {
      g.rect(gx - 1, fy - 8, 3, 9, ext.fence === "fence_stone" ? STONE_D : ext.fence === "fence_hedge" ? LEAF_D : 0xe8e2d0);
      g.set(gx, fy - 9, ext.fence === "fence_picket" ? 0xf6f2e8 : STONE_L);
    }
  }
  // 대저택: 대문 기둥 + 기둥 등, 앞쪽 구석의 둥근 정원수
  if (p.tier === "manor") {
    for (const gx of f.pillars) {
      g.rect(gx - 2, fy - 12, 5, 13, STONE_L);
      g.vline(gx + 2, fy - 12, fy, STONE);
      g.rect(gx - 3, fy - 13, 7, 2, STONE);
      g.rect(gx - 1, fy - 17, 3, 3, 0xffd080);
      g.hline(gx - 2, gx + 2, fy - 18, 0x3a3c42);
    }
    for (const tx of [10, W - 11]) {
      g.rect(tx - 2, fy - 4, 5, 4, 0xa85a3a);
      g.ellipse(tx + 0.5, fy - 9, 4.5, 5, LEAF_D);
      g.ellipse(tx - 0.5, fy - 10, 2.5, 2.5, LEAF);
    }
  }
  // 정원 등불 (길 양옆)
  if (ext.garden === "garden_lanterns")
    for (const lx of f.lanterns) {
      const ly = baseY + 8;
      g.vline(lx, ly - 5, ly, 0x3a3c42);
      g.rect(lx - 1, ly - 9, 3, 4, 0xffd080);
      g.hline(lx - 2, lx + 2, ly - 10, 0x3a3c42);
    }
  // 우편함 (길 왼쪽)
  if (ext.mailbox !== "mailbox_none") {
    const mx = f.mailX;
    const my = H - 6;
    g.vline(mx + 3, my - 8, my, WOOD_D);
    if (ext.mailbox === "mailbox_ghost") {
      g.ellipse(mx + 3, my - 12, 5, 5, 0xc8d0e0);
      g.rect(mx - 2, my - 11, 11, 4, 0xc8d0e0);
      g.set(mx + 1, my - 13, 0x303848);
      g.set(mx + 5, my - 13, 0x303848);
      g.hline(mx + 2, mx + 4, my - 10, 0x303848);
    } else {
      g.rect(mx - 1, my - 15, 9, 7, 0xb04030);
      g.hline(mx - 1, mx + 7, my - 15, 0xc85a48);
      g.rect(mx + 7, my - 18, 1, 4, 0xe0c060);
      g.set(mx + 8, my - 18, 0xe0c060);
    }
  }
  // 간판 (길 오른쪽 기둥)
  if (ext.sign !== "sign_none") {
    const sx = Math.min(f.signX, W - 21);
    const sy = H - 5;
    g.vline(sx + 3, sy - 8, sy, WOOD_D);
    g.vline(sx + 13, sy - 8, sy, WOOD_D);
    const neon = ext.sign === "sign_neon";
    g.rect(sx, sy - 18, 17, 10, neon ? 0x2a1e34 : WOOD_L);
    if (neon) {
      g.hline(sx, sx + 16, sy - 18, 0xff7ac0);
      g.hline(sx, sx + 16, sy - 9, 0xff7ac0);
      g.vline(sx, sy - 18, sy - 9, 0xff7ac0);
      g.vline(sx + 16, sy - 18, sy - 9, 0xff7ac0);
      g.hline(sx + 4, sx + 12, sy - 14, 0x9ae8ff);
    } else {
      g.hline(sx + 3, sx + 13, sy - 15, WOOD_D);
      g.hline(sx + 3, sx + 10, sy - 12, WOOD_D);
    }
  }
  // 거리 가로등 (필지 앞 왼쪽 구석)
  const lx = f.lampX;
  g.vline(lx, H - 18, H - 2, 0x2a2c30);
  g.hline(lx - 1, lx + 1, H - 2, 0x2a2c30);
  g.rect(lx - 2, H - 22, 5, 4, 0xffd080);
  g.hline(lx - 2, lx + 2, H - 23, 0x2a2c30);
  g.outline(OUT, false, 150);
}

// ── 조립 ──

export type LotLayers = { ground: Grid; back: Grid; house: Grid; front: Grid; lit: Grid; info: FacadeInfo; /** 뒤뜰층 깊이 기준 (필지 좌표) */ backBase: number };

const layerCache = new Map<string, LotLayers>();

export function lotLayers(ext: HouseExteriorMap, tier: string, size: LotSize = DEFAULT_SIZE): LotLayers {
  const key = `${tier}:${size.w}x${size.h}:${Object.values(ext).join(",")}`;
  const hit = layerCache.get(key);
  if (hit) return hit;
  const p = housePlan(tier, size);
  const ground = new Grid(p.W, p.H);
  const back = new Grid(p.W, p.H);
  const house = new Grid(p.W, p.H);
  const frontG = new Grid(p.W, p.H);
  const lit = new Grid(p.W, p.H);
  drawGround(ground, p, ext);
  drawBack(back, p);
  drawHouse(house, lit, p, ext);
  drawFront(frontG, p, ext);
  const out = { ground, back, house, front: frontG, lit, info: facadeInfo(ext, tier, size), backBase: Math.max(...backTrees(p).map((t) => t.y)) };
  if (layerCache.size > 64) layerCache.clear();
  layerCache.set(key, out);
  return out;
}

/** 밤 색조 (미리보기용: 곱하기) */
const NIGHT_TINT = 0x5a6690;

function multiplied(src: Grid, tint: Color): Grid {
  const g = new Grid(src.w, src.h);
  for (let i = 0; i < src.px.length; i++) {
    const v = src.px[i];
    if ((v & 255) === 0) continue;
    const c = v >>> 8;
    const r = (((c >> 16) & 255) * ((tint >> 16) & 255)) / 255;
    const gg = (((c >> 8) & 255) * ((tint >> 8) & 255)) / 255;
    const b = ((c & 255) * (tint & 255)) / 255;
    g.px[i] = Grid.rgba((Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b), v & 255);
  }
  return g;
}

/** 한 장으로 합친 필지 그림 (UI 미리보기·아이콘). night면 어둡게 + 창 불빛 */
export function facadeGrid(ext: HouseExteriorMap, tier: string, opts: { size?: LotSize; night?: boolean } = {}): Grid {
  const L = lotLayers(ext, tier, opts.size ?? DEFAULT_SIZE);
  let g = new Grid(L.ground.w, L.ground.h);
  g.draw(L.ground, 0, 0);
  g.draw(L.back, 0, 0);
  g.draw(L.house, 0, 0);
  g.draw(L.front, 0, 0);
  if (opts.night) {
    g = multiplied(g, NIGHT_TINT);
    g.draw(L.lit, 0, 0);
    // 등불·가로등 유리도 켠다
    for (let i = 0; i < g.px.length; i++) {
      const v = (L.front.px[i] >>> 8) & 0xffffff;
      if ((L.front.px[i] & 255) && v === 0xffd080) g.px[i] = Grid.rgba(GLOW_L);
    }
    for (const l of L.info.lights) {
      // 빛 번짐 (작은 원 몇 겹)
      for (let r = 3; r >= 1; r--) {
        const rad = (l.r * r) / 6;
        for (let y = Math.floor(l.y - rad); y <= l.y + rad; y++)
          for (let x = Math.floor(l.x - rad); x <= l.x + rad; x++) {
            if ((x - l.x) ** 2 + (y - l.y) ** 2 > rad * rad) continue;
            const v = g.get(x, y);
            if ((v & 255) === 0) continue;
            g.set(x, y, mix(v >>> 8, l.color, 0.07), v & 255);
          }
      }
    }
  }
  return g;
}

// ── 빈 필지 ──

export function emptyLotLayers(taken: boolean, size: LotSize = DEFAULT_SIZE): { ground: Grid; front: Grid; signY: number } {
  const W = size.w;
  const H = size.h;
  const ground = new Grid(W, H);
  ground.rect(0, 0, W, H, 0x3a5232);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const h = hash2(x, y, 53);
      if (h > 0.88) ground.set(x, y, 0x4a6a3e);
      else if (h < 0.05) ground.set(x, y, 0x2e4428);
    }
  if (taken) {
    // 공사 중: 흙 다진 자리
    ground.rect(Math.round(W * 0.25), Math.round(H * 0.35), Math.round(W * 0.5), Math.round(H * 0.4), 0x5a4432);
    for (let i = 0; i < 40; i++) ground.set(Math.round(W * 0.25 + hash2(i, 1, 57) * W * 0.5), Math.round(H * 0.35 + hash2(1, i, 59) * H * 0.4), 0x6a5240);
  }
  // 경계석 + 말뚝 줄
  for (let x = 0; x < W; x++) {
    ground.set(x, H - 1, x % 4 === 0 ? STONE_D : STONE);
    if (x % 3 !== 2 && x > 6 && x < W - 7) {
      ground.set(x, 8, 0xd9d4c3);
      ground.set(x, H - 8, 0xd9d4c3);
    }
  }
  for (let y = 9; y < H - 8; y++)
    if (y % 3 !== 2) {
      ground.set(6, y, 0xd9d4c3);
      ground.set(W - 7, y, 0xd9d4c3);
    }
  const front = new Grid(W, H);
  for (const [x, y] of [
    [6, 8],
    [W - 7, 8],
    [6, H - 8],
    [W - 7, H - 8],
  ]) {
    front.rect(x - 1, y - 6, 2, 7, WOOD);
    front.set(x - 1, y - 6, WOOD_L);
  }
  const cx = Math.floor(W / 2);
  const signY = H - 24; // game/world/layout.ts lotInteractable의 팻말 자리와 같게
  if (taken) {
    // 목재 더미 + 고깔
    const lx = Math.round(W * 0.3);
    for (let r = 0; r < 3; r++) front.rect(lx + r * 2, signY + 2 - r * 3, 22 - r * 4, 3, r % 2 ? WOOD_L : WOOD);
    const kx = Math.round(W * 0.7);
    for (let i = 0; i < 6; i++) front.hline(kx - Math.floor(i / 2), kx + Math.floor(i / 2), signY - 3 + i, i % 3 === 1 ? 0xf6f2e8 : 0xe07a30);
  }
  // 분양 팻말 (말뚝 + 판)
  front.vline(cx, signY - 12, signY, WOOD_D);
  front.rect(cx - 11, signY - 21, 22, 11, taken ? STONE_D : WOOD_L);
  front.hline(cx - 7, cx + 6, signY - 16, 0x3a2c22);
  front.hline(cx - 5, cx + 4, signY - 13, 0x3a2c22);
  front.outline(OUT, false, 160);
  return { ground, front, signY };
}

/** 밤 창 불빛 알파: 시간대 빛 세기(lightGlow) 낮 0.1 → 0, 새벽 0.5 → 0.6, 해 질 녘·밤 → 1 */
export function litAlpha(lightGlow: number): number {
  return Math.max(0, Math.min(1, (lightGlow - 0.15) / 0.55));
}
