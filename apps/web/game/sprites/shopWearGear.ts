import type { GearM } from "./avatarGear";
import { Grid, hash2, type Color } from "./pixel";
import { bigBody, FIT_X0, FIT_X1, FIT_Y1, iconOf, neckHalf as kitNeckHalf, objectBody, safe, SAFE_TOP, type FB, type SsItem, type V } from "./seasonSetKit";

// 11/22 잡화점 「옷」 다섯 벌 (일반 상점 — 24시간·영구 ×4, 되팔기 가능). 시안 newoutfit 2차 → 운영자 승인안.
// 옷 칸 꾸미기가 몸 아래 다섯 줄에만 보여 색만 다른 옷은 다 같아 보였다 → 벌마다 윤곽을 바꾸는 큰 특징 하나씩:
//  지각 셔츠 = 어깨 너머로 휘날리는 넥타이 · 지하철 숏패딩 = 양옆으로 두세 칸 부푼 짧은 점퍼 · 재택 수면 가운 = 바닥까지 고이는 자락·털 슬리퍼
//  탕비실 앞치마 = 턱밑까지 솟은 가슴판·등 뒤로 튀어나온 리본 · 말 걸지 마 코트 = 얼굴 양옆까지 세운 깃
// 천은 한 색 계열 4톤(빛·바탕·그늘·가장 짙은 선 — gearDye GEAR_DYE_REGIONS), 넥타이·지퍼·단추·크림 테·슬리퍼는 염색 밖.
// 깃·넥타이는 neck 자리에서 그린다 (avatarCore가 옷 깃 → 목 꾸미기 순서로 그려 사원증·목도리가 위로 온다).
// 시트 칠은 아바타 칸 안 (x 1~18, y 26 이하 — seasonSetBounds.test). seasonSetGear.ts가 GEAR5·ICONS5를 합친다.

// ── 그림 도우미 (bungeoGear와 같다) ──
function fit(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, {
    set: (x: number, y: number, c: Color, a?: number) => (x >= FIT_X0 && x <= FIT_X1 && y <= FIT_Y1 && y >= SAFE_TOP ? set(x, y, c, a) : undefined),
  });
}
const brush = (g: Grid) => fit(safe(g));
type W = { v: V; m: GearM; fb: FB; body: string; hem: number; sit: number };
function torsoTB(w: W, long = 0): { top: number; bot: number } {
  const tall = w.fb === "tall";
  const sitDrop = w.sit === 1 ? 3 : w.sit === 2 ? 2 : 0;
  const top = w.body === "suit" ? w.m.neck : (tall ? 13 : 18) + sitDrop;
  const bot = Math.min(26, (w.sit === 1 ? 26 : 24 + (w.sit === 2 ? 1 : 0)) + (w.sit ? 0 : long));
  return { top, bot };
}
function span(w: W, y: number): [number, number] {
  const { cx } = w.m;
  if (w.body === "suit") {
    const half = w.v === "side" ? 4 : 5;
    return [cx - half, cx + half];
  }
  const tall = w.fb === "tall";
  const sitDrop = w.sit === 1 ? 3 : w.sit === 2 ? 2 : 0;
  const top = (tall ? 13 : 18) + sitDrop;
  const spread = w.sit === 1 ? (tall ? 0.55 : 0.75) : tall ? 0.3 : 0.5;
  const hw = (tall ? 2.5 : 3) + (y - top) * spread;
  return [Math.floor(cx - hw), Math.ceil(cx + hw)];
}
function inBall(w: W, x: number, y: number): boolean {
  const ry = w.sit ? 5.5 : 6;
  return ((x + 0.5 - w.m.cx) / 6.5) ** 2 + ((y + 0.5 - w.m.hy) / ry) ** 2 <= 1;
}
const bigTop = (w: W) => Math.round(w.m.hy) + (w.fb === "round" ? 2 : 4);
type Cell = { x: number; y: number; k: number; l: number; r: number; top: number; bot: number };
function paintTorso(g: Grid, w: W, col: (c: Cell) => Color | null, opt: { long?: number; pad?: (y: number, k: number, bot: number) => number } = {}): { top: number; bot: number } {
  if (w.fb === "sheet" || w.fb === "round") {
    const top = bigTop(w);
    let bot = top;
    for (let y = top; y < 27; y++) for (let x = 1; x <= 18; x++) if (g.filled(x, y) && (w.fb === "sheet" || inBall(w, x, y))) bot = Math.max(bot, y);
    for (let y = top; y <= bot; y++) {
      let l = 99;
      let r = -1;
      for (let x = 1; x <= 18; x++)
        if (g.filled(x, y) && (w.fb === "sheet" || inBall(w, x, y))) {
          l = Math.min(l, x);
          r = Math.max(r, x + 1);
        }
      for (let x = l; x < r; x++) {
        if (!g.filled(x, y)) continue;
        const c = col({ x, y, k: y - top, l, r, top, bot });
        if (c !== null) g.set(x, y, c);
      }
    }
    return { top, bot };
  }
  const { top, bot } = torsoTB(w, opt.long ?? 0);
  for (let y = top; y <= bot; y++) {
    const [l0, r0] = span(w, y);
    const p = opt.pad?.(y, y - top, bot) ?? 0;
    const l = Math.max(1, l0 - (w.v === "side" ? Math.min(p, 1) : p));
    const r = Math.min(19, r0 + p);
    for (let x = l; x < r; x++) {
      const c = col({ x, y, k: y - top, l, r, top, bot });
      if (c !== null) g.set(x, y, c);
    }
  }
  return { top, bot };
}
const neckHalf = (fb: FB) => kitNeckHalf(fb);
const neckY = (w: { m: GearM; fb: FB }) => (w.fb === "round" ? Math.round(w.m.hy) + 2 : w.fb === "sheet" ? Math.round(w.m.hy) + 4 : w.m.neck);
function hideScarfTail(g: Grid, v: V, m: GearM, body: string, c: Color): void {
  if (body !== "hood" && body !== "tall") return;
  const { cx, neck } = m;
  if (v === "down") {
    g.set(cx + 2, neck + 1, c);
    g.set(cx + 2, neck + 2, c);
  } else if (v === "up") {
    g.set(cx - 2, neck + 1, c);
    g.set(cx - 2, neck + 2, c);
  } else {
    const half = body === "tall" ? 3 : 4;
    if (g.filled(cx - half, neck + 1)) g.set(cx - half, neck + 1, c);
    if (g.filled(cx - half, neck)) g.set(cx - half, neck, c);
  }
}
/** 천 4톤 */
type T = { hi: Color; c: Color; lo: Color; deep: Color };
/** 기본 명암: 왼쪽 한 칸 빛, 오른쪽 두 칸 그늘(맨 끝은 가장 짙게) */
const shade = (t: T, x: number, l: number, r: number, c: Color = t.c): Color => (x === l ? t.hi : x === r - 1 ? t.deep : x === r - 2 ? t.lo : c);
/** 목깃 줄 (x0..x1) */
function collarSpan(v: V, m: GearM, fb: FB, body: string, extra = 0): { y: number; x0: number; x1: number; half: number } {
  const half = neckHalf(fb) + (objectBody(body) ? 1 : 0) + extra;
  const x0 = v === "side" ? m.cx - half + 1 : m.cx - half;
  return { y: neckY({ m, fb }), x0, x1: m.cx + half - 1, half };
}


/** 한 줄 칠하기 (x0..x1 포함) */
function row(g: Grid, y: number, x0: number, x1: number, col: (x: number, a: number, b: number) => Color | null): void {
  for (let x = Math.max(1, x0); x <= Math.min(18, x1); x++) {
    const c = col(x, x0, x1);
    if (c !== null) g.set(x, y, c);
  }
}
const edge = (t: T, c: Color = t.c) => (x: number, a: number, b: number): Color => (x === a ? t.hi : x === b ? t.deep : x === b - 1 ? t.lo : c);
/** 큰 몸(동글이·이불)에서 이미 칠한 칸만 천으로 (top 줄부터) */
function bigFill(g: Grid, w: W, top: number, col: (x: number, y: number, l: number, r: number) => Color | null): { l: number[]; r: number[]; bot: number } {
  const L: number[] = [];
  const R: number[] = [];
  let bot = top;
  for (let y = top; y < 27; y++) {
    let l = 99;
    let r = -1;
    for (let x = 1; x <= 18; x++) if (g.filled(x, y) && (w.fb === "sheet" || inBall(w, x, y))) { l = Math.min(l, x); r = Math.max(r, x); }
    if (r < 0) continue;
    bot = y;
    L[y] = l;
    R[y] = r;
    for (let x = l; x <= r; x++) if (g.filled(x, y)) { const c = col(x, y, l, r); if (c !== null) g.set(x, y, c); }
  }
  return { l: L, r: R, bot };
}

// ══ 1. 지각 셔츠: 흰 셔츠 + 뛰느라 어깨 너머로 휘날리는 줄무늬 넥타이 ══
const SH: T = { hi: 0xfcfdff, c: 0xe0e7f3, lo: 0xbfc9dd, deep: 0x8e9ab8 };
const TIE = 0xd8404a;
const TIE_HI = 0xf47a7e;
const TIE_LO = 0x9a2a36;
const TIE_ST = 0x2e3a6e;
/** 넥타이 리본: [dy, dx0, dx1] (목 줄 기준, 앞모습은 오른쪽 위로) */
const TIE_FLY: readonly [number, number, number][] = [
  [0, -1, 1],
  [-1, 1, 4],
  [-2, 3, 6],
  [-3, 5, 8],
  [-4, 7, 8],
];
function tieRibbon(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx } = m;
  const n = neckY({ m, fb });
  const put = (x: number, y: number, k: number, i: number, last: boolean) => {
    // 대각 줄무늬 (남색) + 위 테 밝게 · 아래 테 그늘
    const st = (x + y + 40) % 3 === 0 && k > 0;
    g.set(x, y, st ? TIE_ST : i === 0 ? TIE_HI : last ? TIE_LO : TIE);
  };
  if (v === "down") {
    TIE_FLY.forEach(([dy, a, b], k) => { for (let dx = a; dx <= b; dx++) put(cx + dx, n + dy, k, dx - a, dx === b); });
    g.set(cx - 1, n, TIE_HI);
    g.set(cx, n, TIE);
  } else if (v === "side") {
    // 옆(오른쪽을 본다): 가슴 앞 매듭 → 어깨 너머 등 뒤로
    const fly: [number, number, number][] = [[0, 1, 3], [-1, -3, 1], [-2, -6, -3], [-3, -8, -6], [-4, -9, -8]];
    fly.forEach(([dy, a, b], k) => { for (let dx = a; dx <= b; dx++) put(cx + dx, n + dy, k, b - dx, dx === a); });
  } else {
    // 뒤: 어깨 너머로 넘어간 끝자락만 (머리 밖)
    const fly: [number, number, number][] = [[-1, -6, -4], [-2, -8, -6], [-3, -9, -7], [-4, -9, -8]];
    fly.forEach(([dy, a, b], k) => { for (let dx = a; dx <= b; dx++) put(cx + dx, n + dy, k + 1, b - dx, dx === a); });
  }
}
function shirtBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  const { top, bot } = paintTorso(g, w, ({ x, y, l, r, bot }) => (y === bot ? (x >= r - 2 ? SH.deep : SH.lo) : shade(SH, x, l, r)));
  if (bigBody(fb)) return;
  if (v === "down") {
    for (let y = top + 3; y < bot; y++) {
      const [a, b] = span(w, y);
      g.set(a + 1, y, SH.lo);
      g.set(b - 3, y, SH.lo);
    }
    for (let y = top + 4; y < bot; y++) g.set(cx - 1, y, y === top + 5 ? 0xa6acba : SH.lo);
  } else if (v === "side") {
    for (let y = top + 3; y < bot; y++) g.set(cx - 1, y, SH.lo);
  } else {
    const yk = top + 3;
    const [a, b] = span(w, yk);
    for (let x = a + 1; x < b - 2; x++) g.set(x, yk, SH.lo);
    for (let y = yk + 1; y < bot; y++) g.set(cx - 1, y, SH.lo);
  }
}
function shirtNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const { y, x0, x1, half } = collarSpan(v, m, fb, body);
  if (!objectBody(body) && !bigBody(fb)) {
    hideScarfTail(g, v, m, body, SH.c);
    if (v === "up") for (let x = cx - half; x < cx + half; x++) g.set(x, y, x >= cx + half - 2 ? SH.lo : SH.hi);
    else {
      for (let x = x0; x <= x1; x++) g.set(x, y, x >= x1 - 1 ? SH.lo : SH.hi);
      if (v === "down") {
        g.set(cx - 2, y + 1, SH.hi);
        g.set(cx + 1, y + 1, SH.c);
        g.set(cx - 2, y + 2, SH.deep);
        g.set(cx + 1, y + 2, SH.deep);
      }
    }
  }
  // 넥타이는 셔츠의 일부 — 목 꾸미기(사원증·목도리)는 avatarCore가 그 다음에 그려 위로 온다
  tieRibbon(g, v, m, fb);
}

// ══ 2. 지하철 숏패딩: 양옆으로 두세 칸 빵빵하게 부푼 짧은 누빔 점퍼 ══
const PF: T = { hi: 0xa3a065, c: 0x7d7a48, lo: 0x5e5c34, deep: 0x40401f };
const PF_ZIP = 0xf2f4f8;
const PF_ZIP_LO = 0xb4bac6;
const PF_TAG = 0xf6f4ee;
function pufBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  if (bigBody(fb)) {
    const top = bigTop(w) - 1;
    const { l, r, bot } = bigFill(g, w, top, (x, y, a, b) => ((y - top) % 3 === 2 ? (x >= b - 1 ? PF.deep : PF.lo) : x === a ? PF.hi : x >= b - 1 ? PF.lo : (y - top) % 3 === 0 ? PF.hi : PF.c));
    for (let y = top; y <= bot; y++) if (l[y] !== undefined && (y - top) % 3 !== 2) { g.set(l[y] - 1, y, PF.hi); g.set(r[y] + 1, y, PF.lo); }
    return;
  }
  const n = neckY({ m, fb });
  const { bot } = torsoTB(w);
  for (let y = n; y <= bot; y++) pufRow(g, w, y, n, bot);
  if (v === "down") {
    // 굵고 밝은 지퍼 (은색 이빨 줄 + 오른쪽 여밈 그늘) · 소매 경계 박음질 · 왼가슴 흰 상표
    for (let y = n + 1; y < bot; y++) {
      g.set(cx - 1, y, (y + 40) % 2 ? PF_ZIP : PF_ZIP_LO);
      g.set(cx, y, PF.deep);
      const [l0, r0] = span(w, y);
      if (y > n + 1) { g.set(l0, y, PF.lo); g.set(r0 - 1, y, PF.deep); }
    }
    g.set(cx - 4, n + 1, PF_TAG);
  } else if (v === "side") {
    for (let y = n + 1; y < bot; y++) g.set(span(w, y)[1] + 1, y, PF.deep);
    for (let y = n + 2; y < bot; y++) g.set(cx - 1, y, PF.lo);
  } else {
    for (let y = n + 2; y < bot; y++) { const [l0, r0] = span(w, y); g.set(l0, y, PF.lo); g.set(r0 - 1, y, PF.deep); }
  }
}
function pufRow(g: Grid, w: W, y: number, n: number, bot: number): void {
  const v = w.v;
  // 줄마다 부풂 (몸 폭 + e): 어깨 3, 누빔 칸 3 · 박음선 2 번갈아, 밑단 위 칸은 가장 빵빵하게, 밑단(조인 골지) 1
  {
    const k = y - n;
    const hemRow = y === bot;
    const fat = y === bot - 1;
    const seam = !hemRow && !fat && k > 0 && k % 2 === 0;
    const e = hemRow ? 1 : fat ? 3.5 : seam ? 2 : 3;
    const [l0, r0] = span(w, y);
    const l = Math.floor(l0 - e);
    const r = Math.ceil(r0 - 1 + e);
    const L = v === "side" ? Math.max(l, l0 - 2) : l;
    row(g, y, L, r, (x, a, b) => {
      if (hemRow) return x === a ? PF.lo : x >= b - 1 ? PF.deep : (x + 40) % 2 ? PF.lo : PF.c;
      if (seam) return x >= b - 1 ? PF.deep : PF.lo;
      const upper = k === 0 || (y - n) % 2 === 1;
      return x === a ? PF.hi : x === b ? PF.deep : x === b - 1 ? PF.lo : upper && x <= a + 2 ? PF.hi : PF.c;
    });
  }
}

function pufNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  if (bigBody(fb) && !objectBody(body)) return;
  const n = neckY({ m, fb });
  const half = neckHalf(fb) + (objectBody(body) ? 2 : 0);
  if (!objectBody(body)) {
    hideScarfTail(g, v, m, body, PF.c);
    // 몸 기본 목도리 줄을 어깨 부풂으로 덮는다
    pufRow(g, { v, m, fb, body, hem: 0, sit: 0 }, n, n, torsoTB({ v, m, fb, body, hem: 0, sit: 0 }).bot);
  }
  // 턱 밑까지 세운 두툼한 깃 (두 줄)
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  row(g, n - 1, x0, x1, (x, a, b) => (x === a ? PF.hi : x >= b - 1 ? PF.lo : PF.hi));
  if (objectBody(body)) {
    row(g, n, x0 - 1, x1 + 1, edge(PF));
    row(g, n + 1, x0 - 1, x1 + 1, (x, a, b) => (x >= b - 1 ? PF.deep : PF.lo));
  }
  if (v === "down") {
    // 지퍼 손잡이 (깃 위까지 올린 은색 고리)
    g.set(cx - 1, n - 1, PF_ZIP);
    g.set(cx - 1, n, PF_ZIP);
    g.set(cx, n - 1, PF.deep);
    g.set(cx, n, PF.deep);
  }
}

// ══ 3. 재택 수면 가운: 바닥까지 끌리는 분홍 수면 가운 · 허리끈 · 숄 깃 · 털 슬리퍼 ══
const RB: T = { hi: 0xe496b0, c: 0xc46a8a, lo: 0x9a4e6a, deep: 0x6e3049 };
const RB_IN = 0xf2ede4;
const SLIP = 0xf8f4ec;
const SLIP_LO = 0xd8d0c4;
const fluff = (x: number, y: number, c: Color) => (hash2(x, y, 417) < 0.12 ? RB.hi : c);
function robeBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  const by = bigBody(fb) ? bigTop(w) + 2 : torsoTB(w).top + 4;
  if (bigBody(fb)) {
    const top = bigTop(w);
    const { bot } = bigFill(g, w, top, (x, y, a, b) => (y === top + 2 ? RB.deep : x === a ? RB.hi : x >= b - 1 ? RB.lo : fluff(x, y, RB.c)));
    // 바닥까지 자락 + 털 슬리퍼
    if (!sit)
      for (let y = bot + 1; y <= 26; y++) row(g, y, cx - 5 - (y - bot - 1), cx + 4 + (y - bot - 1), (x, a, b) => (y === 26 && x > a + 1 && x < b - 1 ? null : edge(RB)(x, a, b)));
    if (!sit) for (const x of [cx - 3, cx - 2, cx + 1, cx + 2]) g.set(x, 26, x === cx + 2 || x === cx - 2 ? SLIP_LO : SLIP);
    return;
  }
  const { top, bot } = torsoTB(w);
  const floor = sit ? bot : 26;
  for (let y = top; y <= floor; y++) {
    let [l, r] = y <= bot ? span(w, y) : span(w, bot);
    r -= 1;
    // 몸통은 몸에 맞게 곧게, 바닥에 닿는 두 줄만 넓게 고여 퍼진다 (가장 넓은 곳이 바닥)
    if (y > bot) { l -= y - bot + 1; r += y - bot + 1; }
    if (v === "side" && y > bot && !sit) l -= y - bot + 1; // 옆: 뒤로 끌리는 자락
    const hemRow = y === floor;
    row(g, y, l, r, (x, a, b) => {
      if (y === by) return x === a ? RB.lo : RB.deep;
      if (hemRow) return (x + hem + 40) % 3 === 0 ? RB.lo : x >= b - 1 ? RB.deep : RB.c;
      return x === a ? RB.hi : x === b ? RB.deep : x === b - 1 ? RB.lo : fluff(x, y, RB.c);
    });
  }
  if (v === "down") {
    // 숄 깃 (밝게 말린 V) → 허리끈 매듭 + 늘어진 끈 두 가닥 · 앞자락 여밈
    for (let y = top + 3; y < by; y++) {
      const d = y - (top + 3);
      g.set(cx - 2 + d, y, RB.hi);
      g.set(cx + 1 - d, y, RB.hi);
    }
    g.set(cx - 1, by - 1, RB_IN);
    g.set(cx, by - 1, RB_IN);
    // 허리끈은 오른쪽 옆구리에서 묶어 몸 밖으로 늘어진다
    const [, rb] = span(w, by);
    // 매듭 (2×2) + 몸 밖으로 늘어진 두 가닥
    g.set(rb, by - 1, RB.hi); g.set(rb + 1, by - 1, RB.c);
    g.set(rb, by, RB.c); g.set(rb + 1, by, RB.lo);
    for (let k = 1; k <= 3; k++) { g.set(rb + 1, by + k, k === 3 ? RB.deep : RB.c); g.set(rb + 2, by + k + 1, k === 3 ? RB.deep : RB.lo); }
    for (let y = by + 1; y < floor; y++) g.set(cx - 1, y, RB.lo);
    if (!sit) {
      // 털 슬리퍼 앞코 (자락 밑으로)
      for (const x of [cx - 3, cx - 2, cx + 1, cx + 2]) g.set(x, 26, x === cx - 2 || x === cx + 2 ? SLIP_LO : SLIP);
    }
  } else if (v === "side") {
    for (let y = top + 3; y < by; y++) g.set(span(w, y)[1] - 2, y, RB.hi);
    g.set(span(w, by)[1] - 1, by + 1, RB.deep);
    g.set(span(w, by)[1] - 1, by + 2, RB.deep);
    if (!sit) { g.set(span(w, bot)[1] - 2, 26, SLIP); g.set(span(w, bot)[1] - 1, 26, SLIP_LO); }
  } else {
    // 뒤: 허리끈 고리 둘 + 가운데 주름
    g.set(cx - 4, by - 1, RB.deep);
    g.set(cx + 3, by - 1, RB.deep);
    for (let y = by + 1; y < floor; y++) g.set(cx - 1, y, RB.lo);
  }
}
function robeNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const { y, x0, x1, half } = collarSpan(v, m, fb, body, 1);
  if (bigBody(fb) && !objectBody(body)) return;
  if (!objectBody(body)) hideScarfTail(g, v, m, body, RB.c);
  // 두툼한 숄 깃 (밝게)
  if (v === "up") {
    row(g, y, cx - half, cx + half - 1, (x, a, b) => (x >= b - 1 ? RB.lo : RB.hi));
    return;
  }
  row(g, y, x0, x1, (x, a, b) => (x >= b - 1 ? RB.c : RB.hi));
  if (v === "down") {
    g.set(cx - 1, y, RB_IN);
    g.set(cx, y, RB_IN);
    g.set(cx - 1, y + 1, RB_IN);
    g.set(cx, y + 1, 0xd8d2c6);
  }
}

// ══ 4. 탕비실 앞치마: 턱밑까지 솟은 가슴판 · 허리끈 · 등 뒤로 툭 튀어나온 큰 리본 · 주머니에 믹스커피 ══
const AP: T = { hi: 0x5fb48a, c: 0x3f8f6a, lo: 0x2e6e50, deep: 0x1f4c37 };
const AP_TRIM = 0xf6efdc;
const AP_TRIM_LO = 0xd8ceb6;
const MIX = 0xf2c84a;
const MIX_LO = 0xb88a2a;
/** 뒤 리본: [dy, dx0, dx1] (허리 줄 기준, 가운데 매듭) */
function bowBack(g: Grid, cx: number, wy: number): void {
  const loops: [number, number, number][] = [[-1, -4, -2], [0, -4, -1], [1, -4, -2], [-1, 1, 3], [0, 0, 3], [1, 1, 3]];
  for (const [dy, a, b] of loops) for (let dx = a; dx <= b; dx++) g.set(cx + dx, wy + dy, dy === -1 ? AP.hi : dx === a || dx === b ? AP.lo : AP.c);
  g.set(cx - 1, wy, AP.deep);
  g.set(cx, wy, AP.deep);
  // 늘어진 끈 두 가닥
  for (let k = 2; k <= 3; k++) { g.set(cx - 2, wy + k, AP.lo); g.set(cx + 1, wy + k, AP.deep); }
}
function apronBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  const n = neckY({ m, fb });
  const big = bigBody(fb);
  const { bot } = big ? { bot: 24 } : torsoTB(w);
  const wy = big ? n + 2 : n + 2; // 허리끈 줄
  const low = sit ? bot : Math.min(25, bot + 1);
  if (v === "down") {
    // 허리끈 (몸 폭) + 양옆으로 비죽 나온 뒤 리본 끝
    const [l0, r0] = big ? [cx - 6, cx + 6] : span(w, wy);
    row(g, wy, l0, r0 - 1, (x, a, b) => (x === a ? AP.lo : AP.deep));
    if (!big) {
      g.set(l0 - 1, wy, AP.c); g.set(l0 - 2, wy, AP.hi); g.set(l0 - 2, wy - 1, AP.hi); g.set(l0 - 2, wy + 1, AP.lo);
      g.set(r0, wy, AP.lo); g.set(r0 + 1, wy, AP.c); g.set(r0 + 1, wy - 1, AP.c); g.set(r0 + 1, wy + 1, AP.deep);
    }
    // 치마판 (몸 폭만큼 넓게, 발등까지 · 아래 모서리는 둥글게)
    for (let y = wy + 1; y <= low; y++) {
      const [a, b] = big ? [cx - 6, cx + 6] : span(w, Math.min(y, bot));
      const rd = y === low ? 1 : 0;
      // 치마판 가장자리·밑단에 크림 테 한 줄
      row(g, y, a + rd, b - 1 - rd, (x, xa, xb) => (y === low ? (x >= xb - 1 ? AP_TRIM_LO : AP_TRIM) : x === xa ? AP_TRIM : x === xb ? AP_TRIM_LO : x === xb - 1 ? AP.lo : x === xa + 1 ? AP.hi : AP.c));
    }
    // 앞주머니 + 믹스커피 세 봉
    const py = wy + 2;
    if (py < low) {
      row(g, py, cx - 3, cx + 2, (x) => AP.deep);
      g.set(cx - 2, py - 1, MIX); g.set(cx - 1, py - 1, MIX_LO); g.set(cx, py - 1, MIX);
    }
  } else if (v === "side") {
    // 옆(오른쪽을 본다): 앞판 + 등 뒤로 튀어나온 리본
    const [l0, r0] = big ? [cx - 6, cx + 6] : span(w, wy);
    row(g, wy, l0, r0 - 1, () => AP.deep);
    for (let y = wy + 1; y <= low; y++) { const [, b] = big ? [0, cx + 6] : span(w, Math.min(y, bot)); row(g, y, cx - 1, b - 1, (x, a, bb) => (y === low ? (x >= bb - 1 ? AP_TRIM_LO : AP_TRIM) : x === bb ? AP_TRIM_LO : edge(AP)(x, a, bb))); }
    // 리본 (몸 뒤 밖으로 세 칸)
    const bx = l0 - 1;
    const loops: [number, number, number][] = [[-1, -2, -1], [0, -3, 0], [1, -2, -1]];
    for (const [dy, a, b] of loops) for (let dx = a; dx <= b; dx++) g.set(bx + dx, wy + dy, dy === -1 ? AP.hi : dx === 0 ? AP.deep : AP.c);
    g.set(bx - 1, wy + 2, AP.lo); g.set(bx, wy + 2, AP.deep); g.set(bx, wy + 3, AP.lo);
  } else {
    // 뒤: 목끈 + 허리끈 + 큰 리본, 양옆으로 치마판 가장자리
    const [l0, r0] = big ? [cx - 6, cx + 6] : span(w, wy);
    row(g, wy, l0, r0 - 1, () => AP.deep);
    for (let y = wy + 1; y <= low; y++) {
      const [a, b] = big ? [cx - 5, cx + 5] : span(w, Math.min(y, bot));
      g.set(a, y, AP.c); g.set(b - 1, y, AP.lo);
    }
    bowBack(g, cx, wy);
  }
}
function apronNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const n = neckY({ m, fb });
  if (objectBody(body)) {
    // 앞을 가리는 몸: 가슴판 윗부분만
    if (v === "down") row(g, n, cx - 3, cx + 2, edge(AP));
    return;
  }
  // 몸 기본 목도리 줄은 몸 색으로 (앞치마 밖은 맨몸) — 바로 아래 줄 몸 색을 빌린다
  const half = neckHalf(fb);
  const big = bigBody(fb);
  if (!big) {
    if (body === "hood" || body === "tall") {
      const hh = body === "tall" ? 3 : 4;
      const pts = v === "down" ? [[cx + 2, n + 1, 1], [cx + 2, n + 2, 1]] : v === "up" ? [[cx - 2, n + 1, -1], [cx - 2, n + 2, -1]] : [[cx - hh, n + 1, 1], [cx - hh, n, 1]];
      for (const [x, y, d] of pts) { const c = g.get(x + d, y + (v === "side" ? 1 : 0)); if ((c & 255) && (g.get(x, y) & 255)) g.set(x, y, c >>> 8); }
    }
    for (let x = cx - half; x < cx + half; x++) { const c = g.get(x, n + 1); if ((c & 255) && (x < cx - 2 || x > cx + 1 || v !== "down")) g.set(x, n, c >>> 8); }
  }
  const wy = n + 2;
  if (v === "down") {
    // 가슴판 (목 줄 위 한 칸까지 솟는다 — 얼굴 아래) + 목끈
    // 가슴판 (크림 테 · 안쪽 초록) + 양 모서리에서 목 뒤로 걸리는 끈
    for (let y = n - 1; y < wy; y++) row(g, y, cx - 3, cx + 2, (x, a, b) => (y === n - 1 || x === a ? AP_TRIM : x === b ? AP_TRIM_LO : x === a + 1 ? AP.hi : x === b - 1 ? AP.lo : AP.c));
    for (const [x, y] of [[cx - 3, n - 2], [cx - 4, n - 3], [cx + 2, n - 2], [cx + 3, n - 3]]) g.set(x, y, AP.deep);
  } else if (v === "side") {
    const r = big ? cx + 5 : span({ v, m, fb, body, hem: 0, sit: 0 }, Math.max(n, torsoTB({ v, m, fb, body, hem: 0, sit: 0 }).top))[1];
    for (let y = n - 1; y < wy; y++) row(g, y, r - 3, r - 1, (x, a, b) => (y === n - 1 ? AP_TRIM : x === b ? AP_TRIM_LO : edge(AP)(x, a, b)));
    g.set(r - 4, n - 1, AP.deep);
    g.set(r - 4, n - 2, AP.deep);
  } else row(g, n, cx - 2, cx + 1, () => AP.deep);
}

// ══ 5. 말 걸지 마 코트: 얼굴 양옆까지 바짝 세운 큰 깃 · 각진 오버핏 롱코트 · 더블 단추 ══
const CT: T = { hi: 0x6a5c80, c: 0x4a3f5c, lo: 0x372e46, deep: 0x241e30 };
const CT_IN = 0x1a181e;
const CT_BTN = 0xc8b48a;
/** 앞 깃 날개 (목 줄 기준 [dy, 왼쪽 dx0, dx1]) — 오른쪽은 거울 (얼굴 x cx-3..cx+2 는 비운다) */
const WING: readonly [number, number, number][] = [
  [-5, -7, -7],
  [-4, -7, -6],
  [-3, -7, -5],
  [-2, -6, -4],
];
function coatBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const g = brush(g0);
  if (layer !== "front" || objectBody(body)) return;
  const { cx } = m;
  const w: W = { v, m, fb, body, hem, sit };
  if (bigBody(fb)) {
    const top = bigTop(w);
    bigFill(g, w, top, (x, y, a, b) => (x === a ? CT.hi : x >= b - 1 ? CT.lo : CT.c));
    if (v === "down") { g.set(cx - 2, top + 2, CT_BTN); g.set(cx + 1, top + 2, CT_BTN); }
    return;
  }
  const n = neckY({ m, fb });
  const { bot } = torsoTB(w);
  const low = sit ? bot : Math.min(26, bot + 1);
  // 각진 오버핏: 어깨부터 밑단 폭 그대로 (사다리꼴이 아닌 네모)
  const [L, R] = span(w, bot);
  for (let y = n; y <= low; y++) {
    const l = v === "side" ? span(w, Math.min(y, bot))[0] : L;
    row(g, y, l, R - 1, (x, a, b) => (y === low ? (x >= b - 1 ? CT.deep : CT.lo) : edge(CT)(x, a, b)));
  }
  if (v === "down") {
    // 앞여밈 + 더블 단추 두 쌍 + 주머니 덮개
    for (let y = n + 1; y < low; y++) g.set(cx, y, CT.deep);
    for (const y of [n + 2, n + 4]) if (y < low) { g.set(cx - 2, y, CT_BTN); g.set(cx + 2, y, CT_BTN); }
    g.set(L + 1, low - 2, CT.deep); g.set(L + 2, low - 2, CT.deep);
    g.set(R - 4, low - 2, CT.deep); g.set(R - 3, low - 2, CT.deep);
  } else if (v === "side") {
    for (let y = n + 1; y < low; y++) g.set(cx - 1, y, CT.lo);
    g.set(R - 2, n + 2, CT_BTN);
  } else {
    for (let y = n + 3; y <= low; y++) g.set(cx - 1, y, y >= low - 1 ? CT.deep : CT.lo);
  }
}
function coatNeck(g0: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const g = brush(g0);
  const { cx } = m;
  const n = neckY({ m, fb });
  if (!objectBody(body) && !bigBody(fb)) hideScarfTail(g, v, m, body, CT.c);
  if (v === "down") {
    for (const [dy, a, b] of WING) {
      row(g, n + dy, cx + a, cx + b, (x, xa, xb) => (x === xa ? CT.c : x === xb ? CT.lo : CT.hi));
      row(g, n + dy, cx - 1 - b, cx - 1 - a, (x, xa, xb) => (x === xb ? CT.deep : x === xa ? CT.lo : CT.c));
    }
    // 몸 기본 목도리 줄 덮기 → 깃 아래 띠 + 가운데 검은 폴라
    if (!bigBody(fb) && !objectBody(body)) { const [L, R] = span({ v, m, fb, body, hem: 0, sit: 0 }, torsoTB({ v, m, fb, body, hem: 0, sit: 0 }).bot); row(g, n, L, R - 1, edge(CT)); }
    row(g, n - 1, cx - 5, cx + 4, (x, a, b) => (x === a ? CT.hi : x >= b - 1 ? CT.lo : CT.c));
    g.set(cx - 1, n - 1, CT_IN);
    g.set(cx, n - 1, CT_IN);
    g.set(cx - 1, n, CT_IN);
    g.set(cx - 2, n, CT.hi); g.set(cx + 1, n, CT.lo);
  } else if (v === "side") {
    // 옆: 머리 뒤로 높이 선 깃 + 턱 앞 짧은 깃
    const back: [number, number, number][] = [[-6, -7, -7], [-5, -7, -6], [-4, -7, -5], [-3, -7, -5], [-2, -6, -4], [-1, -5, 4]];
    if (!bigBody(fb) && !objectBody(body)) { const ww = { v, m, fb, body, hem: 0, sit: 0 }; row(g, n, span(ww, n)[0], span(ww, torsoTB(ww).bot)[1] - 1, edge(CT)); }
    for (const [dy, a, b] of back) row(g, n + dy, cx + a, cx + b, (x, xa, xb) => (x === xa ? CT.hi : x === xb ? CT.lo : CT.c));
    row(g, n - 2, cx + 4, cx + 5, () => CT.lo);
    g.set(cx + 5, n - 3, CT.c);
  } else {
    // 뒤: 뒤통수 아래를 감싸는 큰 깃 (위 끝은 양옆으로 뾰족)
    if (!bigBody(fb) && !objectBody(body)) { const ww = { v, m, fb, body, hem: 0, sit: 0 }; const [L, R] = span(ww, torsoTB(ww).bot); row(g, n, L, R - 1, edge(CT)); }
    const back: [number, number, number][] = [[-5, -7, -7], [-4, -7, -5], [-3, -7, 6], [-2, -6, 5], [-1, -5, 4]];
    for (const [dy, a, b] of back) row(g, n + dy, cx + a, cx + b, (x, xa, xb) => (dy === -3 ? CT.hi : x === xa ? CT.hi : x >= xb - 1 ? CT.lo : CT.c));
    row(g, n - 5, cx + 6, cx + 6, () => CT.lo);
    row(g, n - 4, cx + 4, cx + 6, () => CT.lo);
  }
}

// ── 등록 ──

// ── 상점·가방 아이콘 (16×16) ──
function shirtIcon(): Grid {
  return iconOf(
    [
      "...........Rr.",
      ".........rrnrL",
      "....hhHrrnrL..",
      "..hhHHrrnLHll.",
      ".hhcccrLcccclL",
      "hhcccccdcccclL",
      "hhcdcccbcccdlL",
      "hhcdcccdcccdlL",
      "hhcdcccbcccdlL",
      "lllhcccdccccLL",
      "...hcccbcccl..",
      "...hcccdcccl..",
      "...lllllllll..",
    ],
    { h: SH.hi, H: SH.hi, c: SH.c, l: SH.lo, d: SH.deep, b: 0xa6acba, r: TIE, R: TIE_HI, L: TIE_LO, n: TIE_ST },
  );
}
function pufferIcon(): Grid {
  return iconOf(
    [
      ".....hhzh.....",
      "...hhhhzdhh...",
      ".hhhhhczdcccl.",
      "hhcccccZdccclL",
      ".lllllcZdllll.",
      "hhhcwccZdccclL",
      "hhcccccZdccclL",
      ".lllllcZdllll.",
      "hhhcccczdccclL",
      "hhcccccZdccclL",
      ".dldldlZdldld.",
    ],
    { h: PF.hi, c: PF.c, l: PF.lo, L: PF.deep, d: PF.deep, z: PF_ZIP, Z: PF_ZIP_LO, w: PF_TAG },
  );
}
function robeIcon(): Grid {
  return iconOf(
    [
      "....hhhhhh....",
      "...hhiiiihl...",
      "..hcchiihccl..",
      ".hccccHHccccl.",
      ".hcccccHcccclL",
      "ddddddddddddLc",
      ".hcccccLccccdL",
      ".hccccccLccc.L",
      "hccccccLccccl.",
      "hcccccccLcccll",
      "hccccccccLcccl",
      "lllllllllllllL",
      "..ss.....ss...",
    ],
    { h: RB.hi, H: RB.hi, c: RB.c, l: RB.lo, L: RB.deep, d: RB.deep, i: RB_IN, s: SLIP },
  );
}
function apronIcon(): Grid {
  return iconOf(
    [
      "....dddddd....",
      "...d......d...",
      "...d......d...",
      "....tttttt....",
      "....thccct....",
      "....thccct....",
      "dddddddddddddd",
      "..tthccccclt..",
      "..thcmMmcclt..",
      "..thdddddclt..",
      "..thcccccclt..",
      "..tttttttttt..",
    ],
    { d: AP.deep, t: AP_TRIM, h: AP.hi, c: AP.c, l: AP.lo, m: MIX, M: MIX_LO },
  );
}
function coatIcon(): Grid {
  return iconOf(
    [
      "h............l",
      "hh..........ll",
      "hhc........cll",
      ".hcc......ccl.",
      ".hccciiiiccll.",
      "hhcccciicccllL",
      "hhccbccLcbcllL",
      "hhcccccLccclLL",
      "hhccbccLcbcllL",
      "hhcccccLccclLL",
      "hhcLLccLccLLlL",
      "hhcccccLccclLL",
      "lllllllLlllLLL",
    ],
    { h: CT.hi, c: CT.c, l: CT.lo, L: CT.deep, i: CT_IN, b: CT_BTN },
  );
}

// ── 등록 (seasonSetGear ITEMS·ICONS에 합친다) ──
export const GEAR5: Readonly<Record<string, SsItem>> = {
  wr_shirt: { back: shirtBack, neck: shirtNeck },
  wr_puffer: { back: pufBack, neck: pufNeck },
  wr_robe: { back: robeBack, neck: robeNeck },
  wr_apron: { back: apronBack, neck: apronNeck },
  wr_coat: { back: coatBack, neck: coatNeck },
};
export const ICONS5: Readonly<Record<string, () => Grid>> = {
  wr_shirt: shirtIcon,
  wr_puffer: pufferIcon,
  wr_robe: robeIcon,
  wr_apron: apronIcon,
  wr_coat: coatIcon,
};
/** 염색 묶음 (gearDye GEAR_DYE_REGIONS가 쓴다): 천 4톤 [빛, 바탕, 그늘, 가장 짙은 선], 기준 = 바탕 */
export const SHOP_WEAR_TONES: Readonly<Record<string, readonly [Color, Color, Color, Color]>> = {
  wr_shirt: [SH.hi, SH.c, SH.lo, SH.deep],
  wr_puffer: [PF.hi, PF.c, PF.lo, PF.deep],
  wr_robe: [RB.hi, RB.c, RB.lo, RB.deep],
  wr_apron: [AP.hi, AP.c, AP.lo, AP.deep],
  wr_coat: [CT.hi, CT.c, CT.lo, CT.deep],
};
