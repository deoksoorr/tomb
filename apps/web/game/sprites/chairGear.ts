import type { GearM, GearView } from "./avatarGear";
import { Grid, mix, type Color } from "./pixel";

// 11/20 「회장님 독대」 주간 1위 보상 머리 (avatarGear.ts 머리 그리기가 여기로 넘긴다 — 상점에 없고 1위가 한 주 빌려 입는다).
//  chair_crown 황금 사원증 왕관(보통): 붉은 벨벳을 감싼 높은 금관 — 두 겹 금 띠 · 보석 띠(루비·사파이어·다이아) · 세 뾰족(양 끝 진주 · 가운데 다이아).
//    금 사슬 목줄 끝에 회장실 사원증 (걸으면 흔들린다). 보석 반짝·둘레 별·밤빛은 chairFx
//  chair_band 불타는 사직서 머리띠(지옥): 빨간 머리띠(끈 둘이 펄럭인다) + 이마 앞에 꽂은 높은 사직서 (윗머리가 그을려 타는 중 — 큰 불꽃은 chairFx)
//  11/23 chair_duo_crown 회장실 금장 명패 왕관(2관왕): 보랏빛 벨벳 금관 — 이마 띠가 회장실 책상 명패(검은 옻칠 판 + 금 테 + 금박 글자 「회장」),
//    세 뾰족(양 끝 금 잔의 불꽃 · 가운데 다이아와 루비) · 양옆 금 구슬 · 명패 양옆 금·진홍 날개 (11/24 노멀 금 + 헬 불꽃).
//    보라 리본 끝에 루비 박힌 금 메달 (걸으면 흔들린다). 불꽃 일렁임·명패를 훑는 빛·반짝·밤빛은 chairFx
// 그림 규칙은 avatarGear와 같다 (몸 기준점 GearM에 맞춰 모든 몸에, 외곽선은 avatar.ts가 프레임 전체에 한 번 두른다).

export const CHAIR_HEAD = ["chair_crown", "chair_band", "chair_duo_crown"] as const;

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
  if (id === "chair_duo_crown") return duoCrown(g, view, m, top, hem);
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

// ── 11/23 회장실 금장 명패 왕관 (2관왕) ──
// 11/24 「덜 튄다」: 노멀(금) + 헬(불)을 한 왕관에 — 양 끝 뾰족이 금 잔에 담긴 진홍 불꽃, 가운데 큰 다이아 아래 루비,
//   명패 양옆으로 금·진홍 날개가 위로 뻗는다 (18칸 — 사원증 왕관보다 넓고 높게). 불꽃 일렁임·반짝임은 chairFx

const VIO = 0x8a4ad8;
const VIO_LO = 0x55289a;
const PLATE = 0x231b30;
const PLATE_HI = 0x40345a;
const ENGRAVE = 0xffe28a;
const FLAME_Y = 0xfff0a0;
const FLAME_O = 0xff8a2a;
const FLAME_R = 0xe8381e;
const CRIMSON = 0xc8203a;

/** 명패 왕관 팔레트: 금 · 보라 벨벳(U u) · 루비(R) · 불꽃(Y 노랑 · F 주황 · f 빨강) · 진홍 깃(C) · 검은 옻칠 명패(N, 윗줄 n) · 금박 글자(T) */
const DUO_PAL: Record<string, Color> = {
  G: GOLD,
  H: GOLD_HI,
  M: GOLD_MID,
  L: GOLD_LO,
  W: 0xffffff,
  R: RUBY,
  C: CRIMSON,
  Y: FLAME_Y,
  F: FLAME_O,
  f: FLAME_R,
  U: VIO,
  u: VIO_LO,
  N: PLATE,
  n: PLATE_HI,
  T: ENGRAVE,
};

/**
 * 명패 왕관 몸통 (맨 아랫줄 = 머리 윗면 줄, 12칸). 아래 다섯 줄이 명패: 금 윗테 · 검은 옻칠 판에 금박 글자 두 자(3×3 「회장」 — ㅁ 꼴 · ㅐ 꼴) · 금 밑테.
 * 위로 세 뾰족: 양 끝은 금 잔(2·9번째 칸)에 담긴 불꽃, 가운데는 다이아 · 금 · 루비.
 * 9줄(동글이) · 8줄(기본·이불 — 벨벳 아치 줄을 뺀다) · 5줄(키다리) — 사원증 왕관(CROWN_9)과 같은 높이 규칙 (chairFx 반짝이도 같은 줄 수)
 */
export const DUO_CROWN_9 = [
  "..F..WW..F..",
  ".fYf.HM.fYf.",
  "H.GUGRRMuG.H",
  "GHGUUGMuuGML",
  "HHHHHHHHHMMM",
  "LNTTTNNTNTNL",
  "LNTNTNNTTTNL",
  "LNTTTNNTNTNL",
  "LLMLLLLLLMLL",
];
const DUO_CROWN_8 = [...DUO_CROWN_9.slice(0, 3), ...DUO_CROWN_9.slice(4)];
const DUO_CROWN_5 = ["..F..WW..F..", "HfYfURRufYfH", "HHHHHHHHHMMM", "LNTTNTTNTTNL", "LLMLLLLLLMLL"];
const DUO_OF: Record<9 | 8 | 5, readonly string[]> = { 9: DUO_CROWN_9, 8: DUO_CROWN_8, 5: DUO_CROWN_5 };
/** 명패 글자 줄이 머리 윗면 줄에서 몇 줄 위인지 (chairFx 명패 빛도 같은 값) — 9·8줄은 두 줄, 5줄은 한 줄 */
export const duoPlateUp = (rows: 9 | 8 | 5) => (rows === 5 ? 1 : 2);
/** 불꽃 잔 자리: 몸통 12칸(좁으면 10칸)의 가운데에서 ±3.5칸 (chairFx 불꽃이 같은 값) */
export const DUO_CUP_DX = 3.5;

/** 명패 양옆 날개 (맨 아랫줄에서 몇 줄 위 → [왼쪽 세 칸, 오른쪽 세 칸]): 몸통 옆 금 깃이 바깥 위로 뻗고 끝으로 갈수록 진홍 → 불꽃 */
const DUO_WING: Readonly<Record<number, readonly [string, string]>> = {
  1: ["..L", "L.."],
  2: [".CG", "MC."],
  3: ["CRG", "MRC"],
  4: ["RGH", "MGR"],
  5: ["FH.", ".MF"],
  6: ["Y..", "..Y"],
};

/** 좁은 머리·옆모습 글자 (두 자를 2칸씩): 12칸 글자 줄 → 10칸 */
const NARROW_TEXT: Record<string, string> = { LNTTTNNTNTNL: "LNTTNNTNNL", LNTNTNNTTTNL: "LNTTNNTTNL", LNTTNTTNTTNL: "LNTTNNTTNL" };
/** 좁은 머리·옆모습: 1·10번째 칸을 빼고 글자 줄은 두 자로 다시 */
function narrowDuo(art: readonly string[]): string[] {
  return art.map((r) => NARROW_TEXT[r] ?? r.slice(0, 1) + r.slice(2, 10) + r.slice(11));
}

/** 몸통 + 날개 (left·right = 그 쪽 날개를 붙인다. 옆모습은 뒤쪽 날개 하나) */
function withWings(art: readonly string[], left: boolean, right: boolean): string[] {
  const n = art.length;
  return art.map((r, j) => {
    const w = DUO_WING[n - 1 - j];
    return (left ? (w?.[0] ?? "...") : "...") + r + (right ? (w?.[1] ?? "...") : "...");
  });
}

/** 몸 모양·보는 방향별 명패 왕관 그림 (날개 포함, 가운데 = 머리 가운데) */
export function duoCrownArt(view: GearView, rx: number, faceTop: number): string[] {
  const full = DUO_OF[crownRows(faceTop)];
  const side = view === "side";
  let art = side || rx < 4.5 ? narrowDuo(full) : full;
  // 뒷모습: 명패 뒤판은 금 (글자·옻칠 없이, 다이아 대신 금)
  if (view === "up") art = art.map((r, j) => (j === 0 ? r.replace(/W/g, "H") : r.replace(/[TN]/g, "G")));
  return withWings(art, true, !side);
}

function duoCrown(g: Grid, view: GearView, m: GearM, top: number, hem: number): void {
  const { cx } = m;
  const side = view === "side";
  const art = duoCrownArt(view, m.rx, faceTopOf(m));
  const x0 = cx - art[0].length / 2;
  const y0 = top - art.length + 1;
  art.forEach((r, j) => [...r].forEach((ch, i) => ch !== "." && g.set(x0 + i, y0 + j, DUO_PAL[ch])));

  // 보라 리본 → 가슴의 루비 금 메달 (걸으면 한 칸씩 흔들린다)
  const n = m.neck;
  const sw = hem === 1 ? -1 : hem === 2 ? 1 : 0;
  if (view === "up") {
    if (m.rx > 6) return;
    for (let x = cx - 2; x <= cx + 1; x++) g.set(x, n, x % 2 ? VIO : VIO_LO);
    return;
  }
  if (side) {
    g.set(cx, n, VIO);
    g.set(cx + 1 + Math.max(0, sw), n + 1, VIO_LO);
    const kx = cx + 1 + sw;
    g.set(kx, n + 2, GOLD_HI);
    g.set(kx + 1, n + 2, GOLD);
    g.set(kx, n + 3, RUBY);
    g.set(kx + 1, n + 3, GOLD_LO);
    return;
  }
  g.set(cx - 3, n, VIO);
  g.set(cx + 2, n, VIO_LO);
  g.set(cx - 2 + Math.min(0, sw), n + 1, VIO);
  g.set(cx + 1 + Math.max(0, sw), n + 1, VIO_LO);
  // 리본 매듭 + 둥근 메달 4×3 (금 테 · 가운데 루비)
  const kx = cx - 2 + sw;
  g.set(kx + 1, n + 1, VIO);
  g.set(kx + 2, n + 1, VIO_LO);
  g.set(kx + 1, n + 2, GOLD_HI);
  g.set(kx + 2, n + 2, GOLD);
  g.set(kx, n + 3, GOLD);
  g.set(kx + 1, n + 3, RUBY);
  g.set(kx + 2, n + 3, CRIMSON);
  g.set(kx + 3, n + 3, GOLD_LO);
  g.set(kx + 1, n + 4, GOLD_MID);
  g.set(kx + 2, n + 4, GOLD_LO);
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
  if (id === "chair_duo_crown") {
    // 명패 금박 글자 · 불꽃 속 · 다이아는 외곽선 뒤에도 또렷하게 (뒷모습은 불꽃만)
    const art = duoCrownArt(view, m.rx, faceTopOf(m));
    const x0 = m.cx - art[0].length / 2;
    const y0 = top - art.length + 1;
    art.forEach((r, j) => [...r].forEach((ch, i) => (ch === "T" || ch === "Y" || ch === "W") && g.set(x0 + i, y0 + j, DUO_PAL[ch])));
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

/** 금빛 → 진홍 둥근 빛 위에 날개 달린 명패 왕관 + 루비 메달 — 금 잔 불꽃 · 다이아가 외곽선 위로 빛난다 (2관왕 — 가방에서도 가장 튀게) */
function duoCrownIcon(): Grid {
  const a = new Grid(16, 16);
  // 보라 리본 (왕관 양 끝에서 가운데 메달로)
  for (const [x, y, c] of [[4, 11, VIO], [5, 12, VIO_LO], [11, 11, VIO_LO], [10, 12, VIO]] as const) a.set(x, y, c);
  // 왕관 (날개 18칸 → 바깥 끝 한 칸씩은 잘린다), 셋째 줄부터 · 명패 판은 조금 밝은 옻칠로
  const art = withWings(DUO_CROWN_9, true, true);
  const put = (g: Grid, test: (ch: string) => boolean) =>
    art.forEach((r, j) => [...r].forEach((ch, i) => ch !== "." && test(ch) && g.set(i - 1, j + 2, ch === "N" ? PLATE_HI : DUO_PAL[ch])));
  put(a, () => true);
  // 루비 금 메달
  a.set(6, 12, VIO);
  a.set(9, 12, VIO_LO);
  a.rect(6, 13, 4, 3, GOLD);
  a.hline(6, 8, 13, GOLD_HI);
  a.set(7, 14, RUBY);
  a.set(8, 14, CRIMSON);
  a.set(9, 14, GOLD_LO);
  a.hline(7, 9, 15, GOLD_LO);
  a.outline(0x1e1c1a, false, 200);
  // 둥근 빛 (가운데 흰 금 → 가장자리 진홍)
  const out = new Grid(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 7) / 8.5;
      if (r <= 1) out.set(x, y, mix(0xfff4c0, 0xd0283e, Math.min(1, r * 1.1)), Math.round(245 * (1 - r) ** 0.55));
    }
  for (let i = 0; i < a.px.length; i++) if (a.px[i] & 255) out.px[i] = a.px[i];
  // 금박 글자 · 불꽃 속 · 다이아는 외곽선 위로 밝게, 불꽃 끝은 한 칸 더 솟는다 + 둘레 반짝
  put(out, (ch) => ch === "T" || ch === "Y" || ch === "W");
  for (const [x, y, c] of [[4, 1, FLAME_Y], [11, 1, FLAME_Y], [4, 0, FLAME_O], [11, 0, FLAME_O], [7, 1, 0xffffff], [8, 1, 0xffffff], [1, 1, 0xffffff], [14, 2, GOLD_HI], [1, 13, FLAME_Y], [14, 12, 0xffffff]] as const) out.set(x, y, c);
  return out;
}

export function chairGearIcon(id: string): Grid | null {
  if (id === "chair_crown") return crownIcon();
  if (id === "chair_band") return bandIcon();
  if (id === "chair_duo_crown") return duoCrownIcon();
  return null;
}
