import type { CottageStyleId, PlotTierId } from "@/lib/housing/catalog";
import { Grid, lighten, mix, type Color } from "../sprites/pixel";
import { detailPass, fbm, pick, RAMP, toneOutline } from "./seaArt";

// 11/16 포구 오두막 바깥 그림 (나무 오두막·파란 지붕 어부집·등대지기 집). Phaser 없이 Grid로 그려요 (seaArt와 같은 바닷가 그림 규칙:
// 디더로 섞은 부드러운 색 단계, 물체 둘레는 따뜻한 갈색의 연한 테, 빛은 왼쪽 위).
// 그림 원점 = 터 사각형 왼쪽 위에서 (0, -COTTAGE_RISE). 터 울타리·땅은 맵(lotArt)이 그리니 여기는 집·길·앞마루·소품만, 나머지는 투명.
// 집은 터 뒤쪽(북쪽)에 남쪽을 보고 서요 (문 = 앞벽 아래 가운데). 크기는 터 크기(작은 터·넓은 터·대저택)에 따라 커져요.

export type CottageLot = { w: number; h: number; gate: "s" | "e" | "w" };
export type CottageArtOpts = { style: CottageStyleId; tier: PlotTierId; deck: boolean; night: boolean; lot: CottageLot };

/** 그림이 터 위쪽(뒤 울타리)보다 위로 솟는 높이 (지붕·등대지기 집 망루) */
export const COTTAGE_RISE = 28;

/** 터 크기별 집 몸통: 폭·벽 높이·지붕 높이·앞벽 밑(터 기준 y) */
const SIZE: Record<PlotTierId, { w: number; wall: number; roof: number; base: number }> = {
  small: { w: 60, wall: 20, roof: 17, base: 40 },
  wide: { w: 80, wall: 22, roof: 19, base: 43 },
  manor: { w: 100, wall: 24, roof: 21, base: 46 },
};
/** 앞마루(데크 터) 깊이 */
const PORCH = 11;
/** 맵이 그리는 바다 쪽 데크가 시작하는 줄 (터 아래에서 이만큼 위 — seaArt lotArt와 같은 값) */
const LOT_DECK_FROM_BOTTOM = 26;

export type CottageBox = { x: number; y: number; w: number; h: number; base: number; doorX: number };

/**
 * 집 몸통 상자 (터 기준 좌표, 지붕 포함 — y는 음수일 수 있어요: 뒤 울타리 위로 솟는 지붕).
 * base = 앞벽 밑 줄 (depth 기준), doorX = 문 가운데
 */
export function cottageBox(tier: PlotTierId, lot: { w: number; h: number }): CottageBox {
  const s = SIZE[tier] ?? SIZE.small;
  const x = Math.round((lot.w - s.w) / 2);
  const top = s.base - s.wall - s.roof;
  return { x, y: top, w: s.w, h: s.base - top, base: s.base, doorX: x + Math.round(s.w / 2) };
}

const hexes = (a: readonly string[]): readonly Color[] => a.map((h) => parseInt(h.slice(1), 16));
const PAL = {
  shingle: hexes(["#e4b48a", "#d29e74", "#bc875f", "#a3714f", "#8a5e43"]),
  tin: hexes(["#d3ebf6", "#b0d8ee", "#8fc2e3", "#74a9d4", "#5f90c0"]),
  cream: hexes(["#fff4d8", "#f8e6bc", "#eed4a0", "#e0c088", "#cfa977"]),
  stripe: hexes(["#f7b5a8", "#ec9a8d", "#dc8176", "#c86d64"]),
  stone: hexes(["#e5e3dc", "#d2cfc6", "#bdb9ae", "#a7a297"]),
} as const;
// 11/16 r16 톤 맞추기: 캠핑장·마을처럼 짙은 따뜻한 갈색 1px 테
const EDGE = 0x5a463a; // r17 캠핑장 테두리 세기에 맞춰

const WARM = 0xffd890;
const WARM_HI = 0xfff2c4;

/** v(0..1)를 0..1로 자르기 */
const cl = (v: number) => Math.max(0, Math.min(1, v));

/** 땅에 깔린 연한 그림자 (반투명) */
function softShadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 52): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1 && !g.filled(x, y)) g.set(x, y, EDGE, Math.round(a * (1 - d * 0.6)));
    }
}

/** 창 하나 (낮 = 하늘빛 유리, 밤 = 따뜻한 불빛) */
function windowAt(g: Grid, x: number, y: number, w: number, h: number, night: boolean, frameC: Color, shutter: Color | null): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const t = (i + j * 0.6) / (w + h * 0.6);
      g.set(x + i, y + j, night ? (j < h / 2 && i > 0 && i < w - 1 ? WARM_HI : WARM) : pick(RAMP.glass, cl(0.15 + t * 0.85), x + i, y + j));
    }
  if (!night) g.set(x + 1, y + 1, 0xffffff);
  // 틀·십자 창살
  for (let i = -1; i <= w; i++) {
    g.set(x + i, y - 1, frameC);
    g.set(x + i, y + h, lighten(frameC, 0.12));
  }
  for (let j = -1; j <= h; j++) {
    g.set(x - 1, y + j, frameC);
    g.set(x + w, y + j, frameC);
  }
  g.vline(x + Math.floor(w / 2), y, y + h - 1, frameC);
  g.hline(x, x + w - 1, y + Math.floor(h / 2), frameC);
  // 창턱
  g.hline(x - 2, x + w + 1, y + h + 1, mix(frameC, 0xffffff, 0.35));
  if (shutter !== null)
    for (const sx of [x - 4, x + w + 1])
      for (let j = 0; j < h + 1; j++) for (let i = 0; i < 3; i++) g.set(sx + i, y - 1 + j, j % 3 === 2 ? mix(shutter, 0x000000, 0.18) : i === 0 ? lighten(shutter, 0.15) : shutter);
}

/** 문 (가운데 아래 = (cx, base)) */
function doorAt(g: Grid, cx: number, base: number, w: number, h: number, c: Color, frameC: Color, night: boolean): void {
  const x = cx - Math.floor(w / 2);
  const y = base - h;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.set(x + i, y + j, i === 0 ? lighten(c, 0.12) : i % 3 === 0 ? mix(c, 0x000000, 0.12) : c);
  // 문 위 작은 채광창
  for (let i = 1; i < w - 1; i++) g.set(x + i, y + 2, night ? WARM : RAMP.glass[1]);
  g.set(x + w - 2, y + Math.floor(h * 0.6), 0xf2d27a);
  for (let j = -1; j < h; j++) {
    g.set(x - 1, y + j, frameC);
    g.set(x + w, y + j, frameC);
  }
  g.hline(x - 1, x + w, y - 1, frameC);
  // 문턱 돌계단
  g.hline(x - 2, x + w + 1, base, PAL.stone[1]);
  g.hline(x - 3, x + w + 2, base + 1, PAL.stone[2]);
}

/** 지붕 (앞에서 내려다본 모임지붕: 위 용마루가 좁고 처마로 갈수록 넓어요). kind = 결 무늬 */
function roofAt(g: Grid, x0: number, x1: number, top: number, eave: number, ramp: readonly Color[], kind: "shingle" | "tin" | "plain"): void {
  const W = x1 - x0;
  const ridge = Math.round(W * 0.56);
  for (let y = top; y <= eave; y++) {
    const t = (y - top) / Math.max(1, eave - top);
    const half = (ridge + (W + 8 - ridge) * t) / 2;
    const cx = (x0 + x1) / 2;
    const a = Math.round(cx - half);
    const b = Math.round(cx + half);
    for (let x = a; x <= b; x++) {
      const side = (x - a) / Math.max(1, b - a);
      let v = 0.12 + t * 0.55 + side * 0.18 + (fbm(x * 0.3, y * 0.4) - 0.5) * 0.18;
      if (kind === "shingle") {
        const row = Math.floor((y - top) / 3);
        // 11/16 r14 기와 줄: 줄 윗선은 빛, 아랫선은 그늘, 엇갈린 이음 (캠핑장 지붕 결처럼)
        if ((y - top) % 3 === 2) v += 0.28;
        else if ((y - top) % 3 === 0) v -= 0.1;
        else if ((x + row * 2) % 5 === 0) v += 0.18;
      } else if (kind === "tin") {
        if ((x - a) % 3 === 0) v += 0.25;
        else if ((x - a) % 3 === 1) v -= 0.08;
      } else if ((y - top) % 4 === 3) v += 0.16;
      else if ((y - top) % 4 === 0) v -= 0.08;
      // r16 지붕 명암 대비를 조금 더 (마을 집처럼 지붕·벽·테가 또렷하게)
      g.set(x, y, pick(ramp, cl(0.5 + (v - 0.5) * 1.3), x, y));
    }
    // 용마루 (맨 위 한 줄은 밝게) · 처마 끝 (진하게)
    if (y === top) for (let x = a; x <= b; x++) g.set(x, y, ramp[0]);
    if (y === eave) for (let x = a; x <= b; x++) g.set(x, y, ramp[ramp.length - 1]);
  }
}

/** 등대지기 집 망루 (둥근 몸통 줄무늬 + 유리 등실 + 붉은 갓). 반환 = 등실 가운데 */
function towerAt(g: Grid, x: number, w: number, top: number, base: number, night: boolean): { x: number; y: number } {
  for (let y = top; y <= base; y++)
    for (let i = 0; i < w; i++) {
      const band = Math.floor((base - y) / 5) % 2 === 0;
      const v = 0.2 + (i / w) * 0.6 + (i === 0 ? -0.15 : 0);
      g.set(x + i, y, band ? pick(PAL.stripe, cl(v), x + i, y) : pick(RAMP.wall, cl(v * 0.9), x + i, y));
    }
  // 작은 창
  g.rect(x + Math.floor(w / 2) - 1, top + 9, 3, 4, night ? WARM : RAMP.glass[2]);
  // 난간 받침
  g.hline(x - 2, x + w + 1, top - 1, 0x8a5e50);
  g.hline(x - 2, x + w + 1, top - 2, 0xb07868);
  for (let i = -2; i <= w + 1; i += 3) g.set(x + i, top - 3, 0x8a5e50);
  // 등실 (유리)
  const lx = x + 2;
  const lw = w - 4;
  const ly = top - 9;
  for (let j = 0; j < 6; j++) for (let i = 0; i < lw; i++) g.set(lx + i, ly + j, night ? (j > 1 && j < 5 && i > 0 && i < lw - 1 ? WARM_HI : WARM) : pick(RAMP.glass, cl(0.1 + (i / lw) * 0.8), lx + i, ly + j));
  g.vline(lx + Math.floor(lw / 2), ly, ly + 5, 0x8a5e50);
  // 붉은 갓 (둥근 지붕) + 피뢰침
  for (let j = 0; j < 4; j++) {
    const half = Math.round((lw + 2) / 2 - (3 - j) * 1.2);
    const cx = lx + lw / 2;
    for (let i = Math.round(cx - half); i < Math.round(cx + half); i++) g.set(i, ly - 4 + j, pick(PAL.stripe, cl(0.35 + j * 0.15 + (i - cx) / 20), i, ly - 4 + j));
  }
  g.vline(Math.round(lx + lw / 2), ly - 7, ly - 5, 0x8a5e50);
  return { x: lx + lw / 2, y: ly + 3 };
}

/** 앞벽 (스타일별 결) */
function wallsAt(g: Grid, style: CottageStyleId, x0: number, x1: number, top: number, base: number): void {
  for (let y = top; y < base; y++)
    for (let x = x0; x < x1; x++) {
      const side = (x - x0) / Math.max(1, x1 - x0);
      const n = (fbm(x * 0.25, y * 0.3) - 0.5) * 0.2;
      if (style === "wood") {
        // 통나무 벽: 4줄마다 한 통 (위는 밝고 아래는 진하게)
        const k = (y - top) % 4;
        // 11/16 r14 통나무 결: 짧은 가로 나뭇결 (통마다 자리가 달라요)
        const grain = (x * 7 + Math.floor((y - top) / 4) * 13) % 11 === 0 && k !== 0 ? 0.12 : 0;
        g.set(x, y, pick(RAMP.wood, cl(0.18 + k * 0.17 + side * 0.15 + n + grain), x, y));
      } else if (style === "blue") {
        // 흰 회벽 + 아래 돌 띠
        if (y >= base - 3) g.set(x, y, pick(PAL.stone, cl(0.3 + (y - (base - 3)) * 0.2 + n), x, y));
        // 11/16 r14 회벽 결: 아주 옅은 알갱이 (캠핑장 벽처럼)
        else g.set(x, y, pick(RAMP.wall, cl(0.08 + side * 0.3 + (y - top) / (base - top) * 0.25 + n + ((x * 5 + y * 3) % 13 === 0 ? 0.1 : 0)), x, y));
      } else {
        // 빨강·하양 가로 줄무늬
        const band = Math.floor((base - 1 - y) / 5) % 2 === 0;
        g.set(x, y, band ? pick(PAL.stripe, cl(0.15 + side * 0.4 + n), x, y) : pick(RAMP.wall, cl(0.08 + side * 0.35 + n), x, y));
      }
    }
  if (style === "wood") {
    // 모서리 통나무 끝 (둥근 나이테)
    for (let y = top + 1; y < base; y += 4)
      for (const cx of [x0 - 1, x1]) {
        g.ellipse(cx + 0.5, y + 1, 2, 1.8, RAMP.wood[1]);
        g.set(cx, y + 1, RAMP.wood[3]);
      }
  }
  // 처마 밑 그늘
  g.hline(x0, x1 - 1, top, mix(g.get(x0 + 2, top + 2) >>> 8, 0x000000, 0.25));
  g.hline(x0, x1 - 1, top + 1, mix(g.get(x0 + 2, top + 3) >>> 8, 0x000000, 0.12));
}

type Built = { grid: Grid; baseY: number; door: { x: number; y: number }; lights: { x: number; y: number }[] };

const cache = new Map<string, Built>();

/**
 * 오두막 그림 (Grid). 크기 = 터 폭 × (터 높이 + COTTAGE_RISE). 순수 함수라 시험에서 그대로 돌려요 (같은 값이면 저장해 둔 걸 돌려줘요).
 * lights = 밤에 빛이 나는 창 자리 (그림 좌표)
 */
export function cottageGrid(o: CottageArtOpts): Built {
  const key = `${o.style}|${o.tier}|${o.deck ? 1 : 0}|${o.night ? 1 : 0}|${o.lot.w}x${o.lot.h}${o.lot.gate}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const R = COTTAGE_RISE;
  const W = Math.max(1, Math.round(o.lot.w));
  const H = Math.max(1, Math.round(o.lot.h)) + R;
  const g = new Grid(W, H);
  const s = SIZE[o.tier] ?? SIZE.small;
  const box = cottageBox(o.tier, o.lot);
  const x0 = box.x;
  const x1 = box.x + s.w;
  const base = R + s.base; // 앞벽 밑 (그림 좌표)
  const wallTop = base - s.wall;
  const roofTop = wallTop - s.roof + 2;
  const doorX = box.doorX;
  const lights: { x: number; y: number }[] = [];

  // ── 바닥에 깔리는 것: 그림자 · 길 · 앞마루 ──
  softShadow(g, (x0 + x1) / 2 + 3, base + 1, s.w / 2 + 6, 3.2, 58);
  const porchBot = o.deck ? base + PORCH : base + 2;
  const stones: { x: number; y: number }[] = [];
  const lotDeckTop = R + o.lot.h - LOT_DECK_FROM_BOTTOM;
  const step = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 6));
    for (let i = 0; i <= n; i++) stones.push({ x: ax + ((bx - ax) * i) / n, y: ay + ((by - ay) * i) / n });
  };
  const pathTop = porchBot + 3;
  if (o.lot.gate === "s") {
    const end = o.deck ? lotDeckTop - 2 : R + o.lot.h - 4;
    step(doorX, pathTop, W / 2, end);
  } else {
    // 옆 출입구: 문 앞에서 아래로 조금, 그다음 출입구 쪽으로 비스듬히
    const gx = o.lot.gate === "w" ? 4 : W - 5;
    const gy = R + o.lot.h / 2 + 2;
    const turnY = Math.max(pathTop + 4, gy + 10);
    step(doorX, pathTop, doorX, turnY);
    step(doorX, turnY, gx + (o.lot.gate === "w" ? 6 : -6), gy + 4);
    step(gx + (o.lot.gate === "w" ? 6 : -6), gy + 4, gx, gy);
  }
  stones.forEach((p, i) => {
    if (i > 0 && Math.hypot(p.x - stones[i - 1].x, p.y - stones[i - 1].y) < 3) return;
    const rx = 3.2 + ((i * 7) % 3) * 0.4;
    g.ellipse(p.x + 0.5, p.y + 1, rx, 2.1, PAL.stone[3]);
    g.ellipse(p.x, p.y, rx, 2, PAL.stone[1]);
    g.set(Math.round(p.x - 1), Math.round(p.y - 1), PAL.stone[0]);
  });

  // ── 집 몸통 (따로 그려 연한 테를 두른 뒤 얹어요) ──
  const h = new Grid(W, H);
  const keeper = o.style === "keeper";
  const towerW = keeper ? Math.max(12, Math.round(s.w * 0.17)) : 0;
  const bodyX1 = keeper ? x1 - towerW + 3 : x1;
  wallsAt(h, o.style, x0, bodyX1, wallTop, base);
  // 굴뚝 (나무 오두막) — 지붕보다 먼저 뒤에
  if (o.style === "wood") {
    const cx = x0 + Math.round(s.w * 0.72);
    for (let y = roofTop - 6; y < roofTop + 6; y++) for (let i = 0; i < 6; i++) h.set(cx + i, y, pick(PAL.stone, cl(0.2 + i / 8 + ((y >> 1) % 2) * 0.15), cx + i, y));
    h.hline(cx - 1, cx + 6, roofTop - 7, PAL.stone[3]);
  }
  const roofRamp = o.style === "wood" ? PAL.shingle : o.style === "blue" ? PAL.tin : PAL.cream;
  roofAt(h, x0, bodyX1, roofTop, wallTop + 1, roofRamp, o.style === "wood" ? "shingle" : o.style === "blue" ? "tin" : "plain");
  // 문 + 창
  const doorW = o.tier === "small" ? 8 : 10;
  const doorH = Math.min(s.wall - 4, o.tier === "manor" ? 16 : 14);
  const frameC = o.style === "wood" ? 0x8b6142 : o.style === "blue" ? 0x5f90c0 : 0xb07868;
  const doorC = o.style === "wood" ? 0x9a6a46 : o.style === "blue" ? 0x4e86b8 : 0x3f8a86;
  const shutter = o.style === "blue" ? 0x6aa2d0 : null;
  const winW = 9;
  const winH = 7;
  const winY = wallTop + Math.max(4, Math.round(s.wall * 0.28));
  const leftSpan = doorX - doorW / 2 - 3 - x0;
  const rightSpan = bodyX1 - (doorX + doorW / 2 + 3);
  const perSide = o.tier === "manor" ? 2 : 1;
  const winXs: number[] = [];
  for (let k = 0; k < perSide; k++) {
    winXs.push(Math.round(x0 + (leftSpan * (k + 1)) / (perSide + 1) - winW / 2));
    if (rightSpan > winW + 6) winXs.push(Math.round(doorX + doorW / 2 + 3 + (rightSpan * (k + 1)) / (perSide + 1) - winW / 2));
  }
  for (const wx of winXs) {
    windowAt(h, wx, winY, winW, winH, o.night, frameC, shutter);
    if (o.night) lights.push({ x: wx + winW / 2, y: winY + winH / 2 });
  }
  doorAt(h, doorX, base, doorW, doorH, doorC, frameC, o.night);
  // 스타일 소품
  if (o.style === "wood") {
    // 처마 밑 그물 (왼쪽 모서리) + 주황 부표 둘
    const nx = x0 + 2;
    const ny = wallTop + 2;
    const nw = Math.min(14, Math.max(8, leftSpan - winW - 6));
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < nw - j; i++) if ((i + j) % 3 === 0 || (i - j + 30) % 3 === 0) h.set(nx + i, ny + j, 0x7a6450, 220);
    h.ellipse(nx + 3, ny + 9, 1.8, 1.8, 0xf08a5a);
    h.set(nx + 2, ny + 8, 0xffc0a0);
    const bx = bodyX1 - 4;
    h.vline(bx, wallTop + 1, wallTop + 6, 0x7a6450);
    h.ellipse(bx + 0.5, wallTop + 8, 2.2, 2.4, 0xf27a5a);
    h.hline(bx - 1, bx + 1, wallTop + 8, 0xfff2e6);
  } else if (o.style === "blue") {
    // 문 위 작은 차양 (파랑)
    for (let i = -doorW / 2 - 3; i < doorW / 2 + 3; i++) {
      h.set(doorX + i, base - doorH - 3, PAL.tin[3]);
      h.set(doorX + i, base - doorH - 2, i % 2 ? PAL.tin[1] : PAL.tin[2]);
    }
  } else {
    // 문 옆 구명 튜브
    const rx = Math.round(doorX + doorW / 2 + 6);
    const ry = base - doorH + 4;
    for (let a = 0; a < 16; a++) {
      const t = (a / 16) * Math.PI * 2;
      h.set(Math.round(rx + Math.cos(t) * 2.6), Math.round(ry + Math.sin(t) * 2.6), Math.floor(a / 4) % 2 ? 0xfff6ec : 0xe8604c);
    }
  }
  if (keeper) {
    const tx = x1 - towerW;
    const lamp = towerAt(h, tx, towerW, roofTop - 6, base - 1, o.night);
    if (o.night) lights.push(lamp);
  }
  // r17 제 색에서 나온 테두리 (바닷가 사물과 같은 규칙 — 집은 조금 더 또렷하게)
  toneOutline(h, 0.42);
  g.draw(h, 0, 0);

  // ── 앞마루 (데크 터: 바다를 보는 나무 마루 + 난간, 가운데는 내려가는 틈) ──
  if (o.deck) {
    const px0 = x0 - 6;
    const px1 = x1 + 5;
    const top = base + 2;
    const bot = base + PORCH;
    for (let y = top; y <= bot; y++)
      for (let x = px0; x <= px1; x++) {
        const k = (y - top) % 3;
        g.set(x, y, pick(RAMP.wood, cl(0.12 + k * 0.18 + (y === bot ? 0.4 : 0) + ((x - px0) % 14 === 0 ? 0.25 : 0)), x, y));
      }
    // 난간 (앞·옆 · 문 앞 가운데 비움)
    const gap0 = doorX - 7;
    const gap1 = doorX + 6;
    const rail = (x: number, y0: number, y1: number) => {
      g.vline(x, y0, y1, RAMP.wood[3]);
      g.set(x, y0, RAMP.wood[1]);
    };
    for (let x = px0; x <= px1; x++) if (x < gap0 || x > gap1) g.set(x, bot - 5, RAMP.wood[2]);
    for (let x = px0; x <= px1; x += 6) if (x < gap0 - 1 || x > gap1 + 1) rail(x, bot - 6, bot);
    rail(gap0 - 1, bot - 6, bot);
    rail(gap1 + 1, bot - 6, bot);
    rail(px1, bot - 6, bot);
    for (const sx of [px0, px1]) for (let y = top; y <= bot - 5; y++) g.set(sx, y, RAMP.wood[2]);
    // 계단 한 칸
    g.hline(gap0, gap1, bot + 1, RAMP.wood[3]);
    g.hline(gap0 + 1, gap1 - 1, bot + 2, RAMP.wood[4]);
  }

  // ── 앞마당 소품 (파란 지붕 어부집: 생선 말리는 대) ──
  if (o.style === "blue") {
    const ry = (o.deck ? base + PORCH : base) + 9;
    const rx0 = Math.min(W - 26, doorX + 14);
    const rx1 = rx0 + 18;
    if (ry + 2 < R + o.lot.h - (o.deck ? LOT_DECK_FROM_BOTTOM : 6)) {
      const r = new Grid(W, H);
      for (const px of [rx0, rx1]) r.vline(px, ry - 9, ry, RAMP.wood[3]);
      r.hline(rx0, rx1, ry - 8, 0xc9b48f);
      for (let k = 0; k < 4; k++) {
        const fx = rx0 + 3 + k * 4;
        for (let j = 0; j < 4; j++) r.set(fx, ry - 7 + j, j === 3 ? 0x9aa8b4 : 0xc8d4dc);
        r.set(fx + 1, ry - 6, 0xb3bec7);
      }
      r.outline(EDGE, false, 90);
      softShadow(g, (rx0 + rx1) / 2, ry + 1, 11, 1.6, 40);
      g.draw(r, 0, 0);
    }
  }

  const out: Built = { grid: g, baseY: base, door: { x: doorX, y: base }, lights };
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

/** 오두막 그림 캔버스 (맵 텍스처용). baseY = 앞벽 밑 (depth 기준), door = 문 가운데 아래 */
export function cottageCanvas(o: CottageArtOpts): {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  baseY: number;
  door: { x: number; y: number };
  lights: { x: number; y: number }[];
} {
  const b = cottageGrid(o);
  // 11/16 r14 바닷가 사물 결 (빛은 왼쪽 위 · 그늘 쪽 1px 테 · 나뭇결 — seaArt detailPass)
  detailPass(b.grid, { wood: true, salt: 5 });
  return { canvas: b.grid.toCanvas(), w: b.grid.w, h: b.grid.h, baseY: b.baseY, door: b.door, lights: b.lights };
}

/** 부동산 창 미리보기: 모래 마당 위 집 하나 (dataURL, scale배 픽셀) */
export function cottagePreviewUrl(style: CottageStyleId, tier: PlotTierId, scale: number, night = false): { url: string; w: number; h: number } {
  const lot: CottageLot = { w: 120, h: 70, gate: "s" };
  const b = cottageGrid({ style, tier, deck: false, night, lot });
  const g = new Grid(lot.w, b.baseY + 12);
  // 모래 마당 (부드러운 타원)
  const cx = lot.w / 2;
  const cy = b.baseY + 2;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const d = ((x + 0.5 - cx) / (lot.w / 2)) ** 2 + ((y + 0.5 - cy) / 16) ** 2;
      if (d <= 1 && y > cy - 14) g.set(x, y, pick(night ? RAMP.wet : RAMP.sand, cl(0.2 + d * 0.6 + (fbm(x * 0.2, y * 0.3) - 0.5) * 0.3), x, y));
    }
  g.draw(b.grid, 0, 0);
  // 위아래 빈 줄은 잘라요
  let top = 0;
  while (top < g.h - 1 && ![...Array(g.w).keys()].some((x) => g.filled(x, top))) top++;
  const h = g.h - top;
  const c = document.createElement("canvas");
  c.width = g.w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.toCanvas(), 0, top, g.w, h, 0, 0, g.w * scale, h * scale);
  return { url: c.toDataURL("image/png"), w: c.width, h: c.height };
}
