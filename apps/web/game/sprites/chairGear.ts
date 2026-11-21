import type { GearM, GearView } from "./avatarGear";
import { Grid, type Color } from "./pixel";

// 11/20 「회장님 독대」 주간 1위 보상 머리 (avatarGear.ts 머리 그리기가 여기로 넘긴다 — 상점에 없고 1위가 한 주 빌려 입는다).
//  chair_crown 황금 사원증 왕관(보통): 붉은 벨벳을 감싼 높은 금관 — 두 겹 금 띠 · 보석 띠(루비·사파이어·다이아) · 세 뾰족(양 끝 진주 · 가운데 다이아).
//    금 사슬 목줄 끝에 회장실 사원증 (걸으면 흔들린다). 보석 반짝·둘레 별·밤빛은 chairFx
//  chair_band 불타는 사직서 머리띠(지옥): 빨간 머리띠(끈 둘이 펄럭인다) + 이마 앞에 꽂은 높은 사직서 (윗머리가 그을려 타는 중 — 큰 불꽃은 chairFx)
// 그림 규칙은 avatarGear와 같다 (몸 기준점 GearM에 맞춰 모든 몸에, 외곽선은 avatar.ts가 프레임 전체에 한 번 두른다).

export const CHAIR_HEAD = ["chair_crown", "chair_band"] as const;

const GOLD = 0xf6c83a;
const GOLD_LO = 0xb8841a;
const GOLD_HI = 0xfff4b0;
const GOLD_MID = 0xe0a828;
const RUBY = 0xf0384e;
const SAPH = 0x3a8af0;
const CARD = 0xfafaf6;
const HAIR = 0x4a3a32;
const SKIN = 0xf0c8a0;
const TEXT = 0x9aa0b4;
const BAND = 0xd8283a;
const BAND_LO = 0x98182a;
const BAND_HI = 0xff6a6a;
const PAPER = 0xf8f2e2;
const PAPER_LO = 0xd8ccb0;
const INK = 0x7a7468;
const SEAL = 0xd8303a;
const SINGE = 0xb07a44;
const SINGE_LT = 0xd8b07a;
const CHAR = 0x3a2620;
const EMBER = 0xff8a2a;
const EMBER_HI = 0xffd060;

/** 왕관 그림 팔레트 */
const CROWN_PAL: Record<string, Color> = {
  G: GOLD,
  H: GOLD_HI,
  M: GOLD_MID,
  L: GOLD_LO,
  W: 0xffffff,
  w: 0xa8dcff,
  R: RUBY,
  B: SAPH,
  V: 0xc8283e,
  v: 0x8a1830,
  P: 0xfff8ec,
};

/**
 * 왕관 (맨 아랫줄 = 머리 윗면 줄, 12칸 — 가운데 두 칸이 머리 가운데). 몸마다 머리 위 자리만큼 세 가지 높이:
 * 9줄(동글이) · 8줄(기본·이불 — 끝 장식 한 줄, 왕 외형 무지개 테가 프레임 맨 위에 닿지 않게) · 5줄(키다리 — 뾰족이 낮다)
 */
const CROWN_9 = [
  "..W..WW..W..",
  "..H..wW..M..",
  "P.GV.GM.vG.P",
  "G.GVVGMvvG.G",
  "GHGVVGMvvGMG",
  "GGGGGGGGGGGM",
  "HHHHHHHHHMMM",
  "GRGBGWWGBGRL",
  "LLMLLLLLLMLL",
];
const CROWN_8 = [CROWN_9[0], ...CROWN_9.slice(2)];
const CROWN_5 = ["P.W..WW..W.P", "GHGVVGMvvGMG", "HHHHHHHHHMMM", "GRGBGWWGBGRL", "LLMLLLLLLMLL"];
/** 좁은 머리(키다리)·옆모습: 12칸에서 1·10번째 칸을 빼고 보석 띠는 다시 */
function narrow(art: readonly string[]): string[] {
  return art.map((r, i) => (i === art.length - 2 ? "RGBGWWGBGR" : r.slice(0, 1) + r.slice(2, 10) + r.slice(11)));
}

/** 몸(머리 반지름·윗면 높이)별 왕관 줄 수 — chairFx 반짝이도 같은 값 (faceAnchor top: 키다리 21 · 이불 18 · 기본 17 · 동글이 14) */
export function crownRows(faceTop: number): 9 | 8 | 5 {
  return faceTop >= 21 ? 5 : faceTop === 14 ? 9 : 8;
}
const CROWN_OF: Record<9 | 8 | 5, readonly string[]> = { 9: CROWN_9, 8: CROWN_8, 5: CROWN_5 };

/** 프레임 맨 위 두 줄은 비워 둔다 — 외곽선 한 줄 자리 (키다리 몸에서 끝이 잘리지 않게) */
function safe(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, { set: (x: number, y: number, c: Color, a?: number) => (y >= 2 ? set(x, y, c, a) : undefined) });
}

/** 사직서 옆모습 자리 (머리 앞 끝 두 칸 중 왼쪽 x) — chairFx 불꽃도 같은 값을 쓴다 (cx + rx - 3) */
export const bandSideX = (m: Pick<GearM, "cx" | "rx">) => m.cx + Math.round(m.rx) - 3;
/** 사직서 탄 윗머리가 머리 윗면에서 몇 줄 위인지 (chairFx 불꽃 밑줄) */
export const BAND_PAPER_UP = 4;

export function drawChairHead(g0: Grid, view: GearView, id: string, m: GearM, top: number, hem = 0): void {
  const g = safe(g0);
  if (id === "chair_crown") return crown(g, view, m, top, hem);
  if (id === "chair_band") return band(g, g0, view, m, top, hem);
}

/** 몸 기준점 → faceAnchor top 값 (avatarCore: AV_H - 1 - m.top). 머리 반지름으로 몸을 가른다 (앉기·출렁임에도 같은 왕관) */
function faceTopOf(m: GearM): number {
  return m.rx < 4.5 ? 21 : m.rx === 6 ? 18 : 17;
}

function crown(g: Grid, view: GearView, m: GearM, top: number, hem: number): void {
  const { cx } = m;
  const side = view === "side";
  const full = CROWN_OF[crownRows(faceTopOf(m))];
  const art = side || m.rx < 4.5 ? narrow(full) : full;
  const w = art[0].length;
  const x0 = cx - w / 2;
  const y0 = top - art.length + 1;
  art.forEach((r, j) => [...r].forEach((ch, i) => ch !== "." && g.set(x0 + i, y0 + j, CROWN_PAL[ch])));
  // 뒷모습: 보석 띠 앞 다이아 대신 금 (앞에만 큰 다이아)
  if (view === "up") {
    g.set(cx - 1, top - 1, GOLD);
    g.set(cx, top - 1, GOLD_MID);
  }

  // 금 사슬 목줄 → 가슴의 회장실 사원증 (걸으면 한 칸씩 흔들린다)
  const n = m.neck;
  const sw = hem === 1 ? -1 : hem === 2 ? 1 : 0;
  if (view === "up") {
    // 동글이는 목이 몸 한가운데라 뒷모습 목줄은 그리지 않는다
    if (m.rx > 6) return;
    for (let x = cx - 2; x <= cx + 1; x++) g.set(x, n, x % 2 ? GOLD : GOLD_HI);
    return;
  }
  if (side) {
    g.set(cx, n, GOLD);
    g.set(cx + 1 + Math.max(0, sw), n + 1, GOLD_HI);
    const kx = cx + 1 + sw;
    g.rect(kx, n + 2, 2, 3, CARD);
    g.set(kx, n + 2, RUBY);
    g.set(kx + 1, n + 3, TEXT);
    g.set(kx, n + 4, GOLD);
    g.set(kx + 1, n + 4, GOLD_MID);
    return;
  }
  g.set(cx - 3, n, GOLD_HI);
  g.set(cx + 2, n, GOLD);
  g.set(cx - 2 + Math.min(0, sw), n + 1, GOLD);
  g.set(cx + 1 + Math.max(0, sw), n + 1, GOLD_MID);
  // 집게 (빨강) + 사원증 4×3: 사진(머리·얼굴) · 글줄 · 금 줄 (회장실 출입증)
  const kx = cx - 2 + sw;
  g.set(kx + 1, n + 1, RUBY);
  g.set(kx + 2, n + 1, RUBY);
  g.rect(kx, n + 2, 4, 2, CARD);
  g.set(kx, n + 2, HAIR);
  g.set(kx, n + 3, SKIN);
  g.set(kx + 2, n + 2, TEXT);
  g.set(kx + 3, n + 2, TEXT);
  g.set(kx + 2, n + 3, RUBY);
  g.hline(kx, kx + 3, n + 4, GOLD);
  g.set(kx + 3, n + 4, GOLD_MID);
}

/** 머리띠 끈 (매듭 기준 [dx, dy, 진하기]) — 걷기 단계마다 펄럭이는 세 모양. 옆모습은 뒤(-x)로 날린다 */
const TAILS_SIDE: readonly (readonly (readonly [number, number, 0 | 1])[])[] = [
  [[-1, 0, 1], [-1, 1, 0], [-2, 1, 0], [-3, 1, 1], [-4, 0, 0], [-5, 0, 1], [-2, 2, 0], [-3, 3, 1], [-4, 3, 0], [-5, 4, 1]],
  [[-1, 0, 1], [-1, 1, 0], [-2, 1, 0], [-3, 2, 1], [-4, 2, 0], [-5, 1, 1], [-2, 2, 0], [-2, 3, 1], [-3, 4, 0], [-4, 5, 1]],
  [[-1, 0, 1], [-1, 1, 0], [-2, 0, 0], [-3, 0, 1], [-4, 1, 0], [-5, 1, 1], [-2, 2, 0], [-3, 2, 1], [-4, 3, 0], [-5, 3, 1]],
];

function band(g: Grid, raw: Grid, view: GearView, m: GearM, top: number, hem: number): void {
  const { cx } = m;
  const rx = Math.round(m.rx);
  const by = top + 2;
  const side = view === "side";
  const lx = side ? bandSideX(m) : cx - 3;
  const lw = side ? 2 : 6;
  // 사직서 (머리띠 밑으로 꽂혀 아랫부분은 띠에 가린다 — 머리 위로 네 줄 솟는다). 뒷모습은 머리 위로 삐져나온 윗부분만
  const y0 = top - BAND_PAPER_UP;
  const y1 = view === "up" ? top - 1 : by + 1;
  for (let y = y0 + 1; y <= y1; y++) for (let x = lx; x < lx + lw; x++) g.set(x, y, x === lx + lw - 1 || view === "up" ? PAPER_LO : PAPER);
  // 타 들어간 윗머리: 들쭉날쭉 까만 끝(1·4칸은 타서 없다) + 그을린 두 줄 (아래로 갈수록 옅게)
  for (let i = 0; i < lw; i++) {
    if (lw === 2 || (i !== 1 && i !== 4)) g.set(lx + i, y0, CHAR);
    g.set(lx + i, y0 + 1, i === 2 && lw > 2 ? CHAR : SINGE);
    if (lw === 2 ? i === 0 : i % 3 === 0) g.set(lx + i, y0 + 2, SINGE_LT);
  }
  if (view === "down") {
    // 「사직서」 글줄 + 붉은 도장
    g.hline(lx + 1, lx + 4, top - 1, INK);
    g.hline(lx + 1, lx + 2, top + 1, INK);
    g.set(lx + 4, top + 1, SEAL);
  } else if (side) g.set(lx, top, INK);
  // 머리띠 두 줄 (머리 폭 그대로 — 이미 칠한 머리 칸만)
  for (const [y, c] of [
    [by, BAND],
    [by + 1, BAND_LO],
  ] as const)
    for (let x = cx - rx - 1; x <= cx + rx; x++) if (raw.filled(x, y) || (x >= lx && x < lx + lw && view !== "up")) g.set(x, y, c);
  const tail = (x: number, y: number, dark: 0 | 1, under = false) => {
    if (!under || !raw.filled(x, y)) g.set(x, y, dark ? BAND_LO : BAND);
  };
  if (view === "down") {
    g.set(cx - rx, by, BAND_HI);
    g.set(cx - rx + 1, by, BAND_HI);
    // 머리 뒤 매듭에서 날리는 끈 끝이 오른쪽으로 삐져나온다 (머리·몸에 가린 칸은 그리지 않는다)
    const ex = cx + rx;
    const f = hem % 3;
    tail(ex, by + 1, 1, true);
    tail(ex + 1, by + 1 + (f === 1 ? 1 : 0), 0, true);
    tail(ex + 2, by + (f === 2 ? 1 : 2), 1, true);
    tail(ex + 1, by + 2 + (f === 0 ? 1 : 0), 0, true);
  } else if (side) {
    // 뒤통수 매듭 + 바람에 날리는 두 끈
    const kx = cx - rx;
    for (const [dx, dy, d] of TAILS_SIDE[hem % 3]) tail(kx + dx, by + dy, d, true);
  } else {
    // 뒷모습: 가운데 매듭 + 아래로 늘어져 흔들리는 두 끈
    const s = hem === 1 ? -1 : hem === 2 ? 1 : 0;
    g.set(cx - 1, by, BAND_LO);
    g.set(cx, by, BAND_LO);
    g.set(cx - 1, by + 1, BAND_HI);
    g.set(cx, by + 1, BAND);
    tail(cx - 2, by + 2, 0);
    tail(cx - 2 + Math.min(0, s), by + 3, 1);
    tail(cx - 3 + s, by + 4, 0);
    tail(cx + 1, by + 2, 0);
    tail(cx + 1 + Math.max(0, s), by + 3, 0);
    tail(cx + 2 + s, by + 4, 1);
  }
}

/** 외곽선 뒤에도 밝게 남는 점: 왕관 다이아 빛 · 사직서 탄 끝의 불씨 (반짝임·불꽃 자체는 chairFx) */
export function drawChairHeadGlow(g0: Grid, view: GearView, id: string, m: GearM, top: number): void {
  const g = safe(g0);
  if (id === "chair_crown") {
    if (view === "up") return;
    g.set(m.cx - 1, top - 1, 0xffffff);
    return;
  }
  if (id !== "chair_band") return;
  const y0 = top - BAND_PAPER_UP;
  if (view === "side") {
    g.set(bandSideX(m) + 1, y0, EMBER_HI);
    g.set(bandSideX(m), y0 + 1, EMBER);
    return;
  }
  const lx = m.cx - 3;
  // 타서 없어진 두 칸 자리에 붉은 불씨 테두리
  g.set(lx + 1, y0 + 1, EMBER_HI);
  g.set(lx + 4, y0 + 1, EMBER_HI);
  g.set(lx, y0, EMBER);
  g.set(lx + 3, y0, EMBER_HI);
  g.set(lx + 5, y0, EMBER);
}

// ── 아이콘 (16×16) ──

function crownIcon(): Grid {
  const g = new Grid(16, 16);
  // 금 사슬 (왕관 양 끝에서 가운데 사원증으로)
  for (const [x, y, c] of [[3, 10, GOLD_HI], [4, 11, GOLD], [5, 12, GOLD_HI], [12, 10, GOLD], [11, 11, GOLD_HI], [10, 12, GOLD]] as const) g.set(x, y, c);
  // 왕관 (9줄 그림 그대로)
  CROWN_9.forEach((r, j) => [...r].forEach((ch, i) => ch !== "." && g.set(2 + i, j, CROWN_PAL[ch])));
  // 사원증 (빨간 집게 + 사진 · 글줄 · 금 줄)
  g.set(7, 12, RUBY);
  g.set(8, 12, RUBY);
  g.rect(6, 13, 4, 2, CARD);
  g.set(6, 13, HAIR);
  g.set(6, 14, SKIN);
  g.set(8, 13, TEXT);
  g.set(9, 13, TEXT);
  g.set(8, 14, RUBY);
  g.hline(6, 9, 15, GOLD);
  const out = new Grid(16, 16);
  out.draw(g, 0, 0);
  out.outline(0x1e1c1a, false, 170);
  // 다이아·보석 반짝 (외곽선 위로)
  out.set(7, 0, 0xffffff);
  out.set(1, 3, 0xfff4b0);
  out.set(14, 5, 0xfff4b0);
  return out;
}

function bandIcon(): Grid {
  const g = new Grid(16, 16);
  // 사직서 (띠 뒤에 꽂혀 윗부분이 솟는다)
  g.rect(5, 3, 6, 8, PAPER);
  g.vline(10, 3, 10, PAPER_LO);
  for (const x of [6, 9]) g.set(x, 3, 0);
  for (const x of [5, 7, 8, 10]) g.set(x, 3, CHAR);
  g.hline(5, 10, 4, SINGE);
  g.set(7, 4, CHAR);
  g.hline(6, 9, 6, INK);
  g.hline(6, 8, 8, INK);
  g.set(9, 8, SEAL);
  // 머리띠 (살짝 휜 두 줄) + 오른쪽 매듭과 날리는 두 끈
  for (let x = 1; x <= 12; x++) {
    const y = x <= 2 || x >= 11 ? 10 : 11;
    g.set(x, y, x < 5 ? BAND_HI : BAND);
    g.set(x, y + 1, BAND);
    g.set(x, y + 2, BAND_LO);
  }
  // 매듭 + 두 끈
  g.rect(13, 9, 2, 3, BAND_LO);
  g.set(13, 9, BAND);
  for (const [x, y, c] of [[14, 12, BAND], [15, 13, BAND_LO], [13, 12, BAND], [12, 13, BAND], [12, 14, BAND_LO]] as const) g.set(x, y, c);
  // 불 혀 넷
  for (const [x, y, c] of [[5, 2, 0xe8381e], [6, 2, 0xffa030], [6, 1, 0xfff0a0], [7, 2, 0xffa030], [8, 2, 0xffa030], [8, 1, 0xffa030], [8, 0, 0xfff0a0], [7, 1, 0xe8381e], [9, 2, 0xe8381e], [10, 2, 0xffa030], [10, 1, 0xfff0a0], [9, 1, 0xffa030]] as const) g.set(x, y, c);
  const out = new Grid(16, 16);
  out.draw(g, 0, 1);
  out.outline(0x1e1c1a, false, 170);
  // 불씨는 외곽선 위로도 밝게
  out.set(8, 1, 0xfff0a0);
  out.set(7, 4, EMBER_HI);
  out.set(10, 4, EMBER);
  out.set(5, 4, EMBER);
  out.set(3, 2, EMBER_HI);
  out.set(12, 3, EMBER);
  return out;
}

export function chairGearIcon(id: string): Grid | null {
  if (id === "chair_crown") return crownIcon();
  if (id === "chair_band") return bandIcon();
  return null;
}
