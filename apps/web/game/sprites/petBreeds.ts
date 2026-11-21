import type { FxSpec } from "./cosmeticFx";
import { Grid, mix, type Color } from "./pixel";

// 11/19 강아지·고양이 품종 펫 12종 (강아지 6 · 고양이 6) — 멍냥 분양소 전용 (protocol items.ts petShop).
// 그림 규칙은 petPack(11/17 새 펫 묶음)과 같다: 옆모습은 오른쪽을 본다(왼쪽은 좌우 반전), 발바닥이 맨 아랫줄, 테두리는 진한 색 반투명(220).
// 시트: 0·1 걷기 · 2·3 멈춤(앉기 · 3은 눈 깜빡) · 4·5 가끔 하는 품종별 동작 (PetSpec.pose).
// BREED_ART는 cosmeticFx FX_ART에, BREED_FX는 COSMETIC_FX에 섞인다 (petPack과 같은 방식). 아이템은 protocol items.ts (petShop: 멍냥 분양소 전용).
//
// 그림은 글자 지도로 그린다. 글자 = 부위, 품종 팔레트 = 부위 색 → 같은 몸틀(고양이 6종이 걷기·앉기 틀을 같이 쓴다)에 털색·무늬만 바꿔 입힌다.
//   f 털  h 등·정수리 밝은 털  l 배·먼 쪽 다리(그늘)  c 가슴  m 주둥이·볼  w 흰 털(품종마다 다름)  p 발
//   t 꼬리  y 꼬리 줄무늬 자리  x 꼬리 끝  r 귀  i 귀 속  z 줄무늬 자리  e 눈  q 감은 눈  n 코  b 볼터치  k 혀·입속  d 입선
//   o 품종별 무늬 1 (삼색이 주황 · 시바 등 짙은 털 등)  u 품종별 무늬 2

type Pal = Partial<Record<string, Color>>;
type Art = readonly string[];

const EYE = 0x2a1e18;
const BLUSH = 0xf6a0b0;
const TONGUE = 0xf07a8a;
const PINK = 0xf2a8b4;

/** 글자 지도 한 장을 칠한다 ('.' 투명, 팔레트에 없는 글자는 건너뜀). ox·oy = 칸 안 여백 */
function paint(g: Grid, art: Art, pal: Pal, ox = 0, oy = 0): void {
  art.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (row[x] !== "." && c !== undefined) g.set(x + ox, y + oy, c);
    }
  });
}

/**
 * 11/20 프레임 여백 (사용자 「옆으로 돌리면 왼쪽·오른쪽이 잘린다」): 옆모습 글자 지도는 칸 끝(꼬리 털·코끝·귀 끝)까지 칠해져 있어
 * 테(외곽선)가 칸 밖으로 나가 잘리고 잘린 면이 그대로 보였다 (앞·뒷모습은 가운데 12칸이라 멀쩡). 좌우 1칸·위 1칸 여백을 두고 그린다.
 * 원점 = 바닥 가운데라 게임 속 자리·발 줄은 그대로다 (BREED_ART w·h에 여백이 들어 있다)
 */
export const BREED_PAD_X = 1;
export const BREED_PAD_TOP = 1;

/** 글자 지도 일부만 바꾼 복사본 ([x, y, 글자]) */
function edit(art: Art, changes: readonly (readonly [number, number, string])[]): Art {
  const rows = art.map((r) => [...r]);
  for (const [x, y, ch] of changes) rows[y][x] = ch;
  return rows.map((r) => r.join(""));
}

/** 프레임 글자 지도들 → 시트 그리드 (각 프레임에 테두리) */
function sheet(w: number, h: number, arts: readonly Art[], pal: Pal, line: Color): () => Grid {
  for (const a of arts) {
    if (a.length !== h || a.some((r) => r.length !== w)) throw new Error(`petBreeds: 지도 크기가 ${w}×${h}가 아니에요\n${a.join("\n")}`);
  }
  const W = w + BREED_PAD_X * 2;
  const H = h + BREED_PAD_TOP;
  return () => {
    const g = new Grid(W * arts.length, H);
    arts.forEach((a, f) => {
      const one = new Grid(W, H);
      paint(one, a, pal, BREED_PAD_X, BREED_PAD_TOP);
      one.outline(line, false, 220);
      g.draw(one, f * W, 0);
    });
    return g;
  };
}

// ════════════════════════ 네 방향 (11/19 추가) ════════════════════════
// 옆모습 6장(0~5) 뒤에 앞·뒷모습 8장을 덧붙인다: 6·7 앞 걷기 · 8·9 앞 앉기(9 깜빡) · 10·11 뒤 걷기 · 12·13 뒤 앉기(13 꼬리 살랑).
// 주인이 아래로 걸으면 뒤따르는 펫도 아래(앞모습), 위로 걸으면 뒷모습 (BREED_FX.dirs → cosmeticFx pet()이 마지막으로 걸은 방향으로 고른다).
// 틀은 12칸 × 11줄로 그리고, 품종 프레임(옆모습과 같은 크기) 가운데·발바닥 맨 아랫줄에 놓는다.

const FW = 12;
const FH = 11;
type Four = { walkA: Art; walkB: Art; sit: Art; sitBlink: Art; backA: Art; backB: Art; backSit: Art; backSitTail: Art };

/** 짧은 다리 (코기·닥스훈트·포메): 9줄도 몸으로 채우고 발은 맨 아랫줄 한 줄만 (걸을 때 발이 좌우로 콩콩) */
function shortLegs(f: Four): Four {
  const leg = (a: Art, row: string) => {
    const r = [...a];
    r[9] = r[8];
    r[10] = row;
    return r;
  };
  return {
    ...f,
    walkA: leg(f.walkA, "..v.p..p.v.."),
    walkB: leg(f.walkB, "..vp....pv.."),
    backA: leg(f.backA, "..p.v..v.p.."),
    backB: leg(f.backB, "...pv..vp..."),
  };
}

const CAT4_HEAD: Art = ["............", "...r....r...", "..ri....ir..", "..fhhzzhhf..", "..feffffef..", "..fbfnnfbf..", "...fmmmmf..."];
const CAT4_BACK_HEAD: Art = ["............", "...r....r...", "..rr....rr..", "..fhhzzhhf..", "..ffzffzff..", "..ffffffff..", "...ffffff..."];
const CAT4: Four = (() => {
  const walkA = [...CAT4_HEAD.slice(0, 3), "..fhhzzhhf.x", "..feffffef.t", "..fbfnnfbfy.", "...fmmmmfy..", "..hfccccfh..", "..lfccccfl..", "..l.p..f.l..", "..l....p.l.."];
  const walkB = edit(walkA, [[4, 9, "f"], [4, 10, "p"], [7, 9, "p"], [7, 10, "."], [11, 3, "."], [10, 2, "x"], [11, 4, "."], [10, 3, "t"], [10, 4, "y"]]);
  const sit = [...CAT4_HEAD, "..hfccccfh..", ".hffccccffh.", ".fzfccccfzfx", ".llfppppflyt"];
  const back = [...CAT4_BACK_HEAD.slice(0, 2), "..rr....rr.x", "..fhhzzhhf.t", "..ffzffzff.y", "...ffffff.t.", "..hfzffzfhy.", "..fffffffft.", "..lffffffl..", "..f.l..l.f..", "..p.l..l.p.."];
  return {
    walkA,
    walkB,
    sit,
    // 감은 눈은 가로 두 칸 (뜬 눈 자리 한 칸이면 색이 같아 안 보인다)
    sitBlink: edit(sit, [[2, 4, "q"], [3, 4, "q"], [8, 4, "q"], [9, 4, "q"], [11, 9, "."], [11, 10, "x"]]),
    backA: edit(back, [[2, 10, "."], [2, 9, "p"]]),
    backB: edit(back, [[9, 10, "."], [9, 9, "p"], [11, 2, "."], [10, 1, "x"], [11, 3, "x"]]),
    backSit: [...CAT4_BACK_HEAD.slice(0, 6), "..hfzffzfh..", ".hffffffffh.", ".fzffffffzf.", ".ffffffffff.", "xtytyllllll."],
    backSitTail: [...CAT4_BACK_HEAD.slice(0, 6), "..hfzffzfh..", ".hffffffffh.", ".fzffffffzf.", "xffffffffff.", "tytyyllllll."],
  };
})();

const DOG4_HEAD: Art = ["............", "...r....r...", "..ri....ir..", "..rhhhhhhr..", "..feffffef..", "..fwwnnwwf..", "...wmmmmw..."];
const DOG4_BACK_HEAD: Art = ["............", "...r....r...", "..rr....rr..", "..rhhhhhhr..", "..ffffffff..", "..ffffffff..", "...ffffff..."];
const FLOP4_HEAD: Art = ["............", "....hhhh....", "...hffffh...", "..hffffffh..", ".rfeffffefr.", ".rfbfnnfbfr.", ".rr.fmmf.rr."];
const FLOP4_BACK_HEAD: Art = ["............", "....hhhh....", "...hffffh...", "..hffffffh..", ".rffffffffr.", ".rffffffffr.", ".rr.ffff.rr."];
function dog4(head: Art, backHead: Art): Four {
  const walkA = [...head, "..hfwwwwfh..", "..lfwwwwfl..", "..v.p..w.v..", "..v....p.v.."];
  const walkB = edit(walkA, [[4, 9, "w"], [4, 10, "p"], [7, 9, "p"], [7, 10, "."]]);
  const sit = [...head, "..hfwwwwfh..", ".hffwwwwffh.", ".fffwwwwfff.", ".llvpwwpvll."];
  const back = [...backHead, "..hffffffh..", "..lffffffl..", "..f.v..v.f..", "..p.v..v.p.."];
  return {
    walkA,
    walkB,
    sit,
    sitBlink: edit(sit, [[2, 4, "q"], [3, 4, "q"], [8, 4, "q"], [9, 4, "q"]]),
    backA: edit(back, [[2, 10, "."], [2, 9, "p"]]),
    backB: edit(back, [[9, 10, "."], [9, 9, "p"]]),
    backSit: [...backHead, "..hffffffh..", ".hffffffffh.", ".ffffffffff.", ".llllllllll."],
    backSitTail: edit([...backHead, "..hffffffh..", ".hffffffffh.", ".ffffffffff.", ".llllllllll."], [[3, 1, "."], [2, 1, "r"]]),
  };
}
const DOG4 = dog4(DOG4_HEAD, DOG4_BACK_HEAD);
const FLOP4 = dog4(FLOP4_HEAD, FLOP4_BACK_HEAD);

/** 품종 생김새 고치기: (앞·뒤, 프레임 지도) → 지도 */
type Four4Shape = (view: "front" | "back", a: Art, sit: boolean) => Art;
const mapAll = (f: Four, fn: Four4Shape): Four => ({
  walkA: fn("front", f.walkA, false),
  walkB: fn("front", f.walkB, false),
  sit: fn("front", f.sit, true),
  sitBlink: fn("front", f.sitBlink, true),
  backA: fn("back", f.backA, false),
  backB: fn("back", f.backB, false),
  backSit: fn("back", f.backSit, true),
  backSitTail: fn("back", f.backSitTail, true),
});
const recolorArt = (a: Art, fn: (ch: string, x: number, y: number) => string | null): Art => a.map((r, y) => [...r].map((ch, x) => (ch === "." ? ch : (fn(ch, x, y) ?? ch))).join(""));

/** 12×11 틀 → 품종 프레임 크기 (가운데 · 아래 맞춤) */
function placeFour(a: Art, w: number, h: number): Art {
  const ox = Math.floor((w - FW) / 2);
  const oy = h - FH;
  const blank = ".".repeat(w);
  const rows: string[] = Array(h).fill(blank);
  a.forEach((r, y) => {
    if (y + oy < 0) return;
    rows[y + oy] = ".".repeat(ox) + r + ".".repeat(w - ox - FW);
  });
  return rows;
}
const fourList = (f: Four): Art[] => [f.walkA, f.walkB, f.sit, f.sitBlink, f.backA, f.backB, f.backSit, f.backSitTail];

/** 앞·뒷모습에 없는 글자는 비슷한 부위 색으로 (강아지 팔레트에는 가슴·주둥이 글자가 없다) */
function fillPal(pal: Pal): Pal {
  return { ...pal, c: pal.c ?? pal.w ?? pal.f, m: pal.m ?? pal.w ?? pal.f, w: pal.w ?? pal.c ?? pal.f, b: pal.b ?? BLUSH, t: pal.t ?? pal.f, x: pal.x ?? pal.t ?? pal.f, y: pal.y ?? pal.t ?? pal.f, z: pal.z ?? pal.f, v: pal.v ?? pal.l, r: pal.r ?? pal.f, i: pal.i ?? pal.f, p: pal.p ?? pal.f, d: pal.d ?? 0x5a2a20, k: pal.k ?? TONGUE };
}

/** 옆모습 6장 + 앞·뒷모습 8장 시트 */
function sheet4(w: number, h: number, side: readonly Art[], four: Four, pal: Pal, line: Color): () => Grid {
  const front = fourList(four).map((a) => placeFour(a, w, h));
  const sideG = sheet(w, h, side, pal, line);
  const fourG = sheet(w, h, front, fillPal(pal), line);
  return () => {
    const a = sideG();
    const b = fourG();
    const g = new Grid(a.w + b.w, a.h);
    g.draw(a, 0, 0);
    g.draw(b, a.w, 0);
    return g;
  };
}

// ════════════════════════ 고양이 (14×12, 6종이 걷기·앉기 틀을 같이 쓴다) ════════════════════════

const CAT_W = 14;
const CAT_H = 12;

const CAT_WALK_A: Art = [
  "..............",
  "..x.....r..r..",
  ".t......rihir.",
  ".t......fzhzf.",
  ".y......fffef.",
  "..t..hhhffbmn.",
  "..y.fzfzfffmm.",
  "...ffzfzfffc..",
  "...ffffffffc..",
  "...llllllll...",
  "...l.f...l.f..",
  "...l.p...l.p..",
];
const CAT_WALK_B: Art = [
  "..............",
  "........r..r..",
  "........rihir.",
  "x.......fzhzf.",
  "t.......fffef.",
  ".y...hhhffbmn.",
  "..t.fzfzfffmm.",
  "...ffzfzfffc..",
  "...ffffffffc..",
  "...llllllll...",
  "....fl..lf....",
  "....pl..lp....",
];
const CAT_SIT: Art = [
  "..............",
  ".......r..r...",
  ".......rihir..",
  ".......fzhzf..",
  ".......fffef..",
  "......hffbmn..",
  ".....hzffcmm..",
  "...hfzfffcc...",
  "..hfzffffcc...",
  "..fzfffffcc...",
  "..ffffffxlc...",
  "..ltytytylp...",
];
/** 앉아 눈 깜빡 + 꼬리 끝 살랑 */
const CAT_SIT_BLINK = edit(CAT_SIT, [
  [9, 4, "q"],
  [10, 4, "q"],
  [8, 10, "f"],
  [8, 11, "x"],
]);

// ── 고양이 동작 6가지 (품종마다 하나) ──

/** 식빵 굽기 → 꾸벅 (치즈냥) */
const CAT_LOAF: Art = [
  "..............",
  "..............",
  "..............",
  "..............",
  "........r..r..",
  "........rihir.",
  ".....hhhfzhzf.",
  "...hhfzfffqf..",
  "..hfzfzfffbmn.",
  "..fffffffffmm.",
  "..ffffffffffc.",
  "..lttytyttpp..",
];
const CAT_LOAF_NOD: Art = [
  "..............",
  "..............",
  "..............",
  "..............",
  "..............",
  "........r..r..",
  ".....hhhrihir.",
  "...hhfzffzhzf.",
  "..hfzfzffqqff.",
  "..fffffffffbn.",
  "..ffffffffffm.",
  "..lttytyttllc.",
];

/** 앞발로 세수 (고등어): 4 = 앞발 들어 핥기 · 5 = 앞발로 얼굴 문지르기 */
const CAT_GROOM_LICK = edit(CAT_SIT, [
  [10, 10, "l"],
  [10, 11, "."],
  [11, 7, "f"],
  [12, 6, "p"],
  [12, 5, "p"],
  [11, 6, "k"],
  [9, 4, "q"],
  [10, 4, "q"],
]);
const CAT_GROOM_WIPE = edit(CAT_SIT, [
  [10, 10, "l"],
  [10, 11, "."],
  [11, 7, "f"],
  [12, 6, "f"],
  [12, 5, "p"],
  [12, 4, "p"],
  [11, 4, "p"],
  [10, 4, "q"],
]);

/** 쩍 하품 (턱시도): 4 = 입 벌리기 · 5 = 크게 쩍 + 앞발 쭉 */
const CAT_YAWN = edit(CAT_SIT, [
  [9, 4, "q"],
  [10, 4, "q"],
  [10, 6, "d"],
  [11, 6, "k"],
  [11, 7, "m"],
]);
const CAT_YAWN_BIG = edit(CAT_SIT, [
  [9, 4, "q"],
  [10, 4, "q"],
  [9, 3, "h"],
  [10, 6, "d"],
  [11, 6, "k"],
  [12, 6, "k"],
  [11, 7, "k"],
  [12, 7, "m"],
  [10, 11, "."],
  [11, 11, "p"],
  [12, 11, "p"],
  [11, 10, "c"],
]);

/** 냥냥펀치 (삼색이) */
const CAT_PUNCH_UP = edit(CAT_SIT, [
  [12, 4, "p"],
  [11, 5, "f"],
  [12, 5, "."],
  [11, 6, "f"],
  [10, 7, "f"],
  [10, 8, "c"],
  [10, 9, "l"],
  [10, 10, "l"],
  [10, 11, "."],
]);
const CAT_PUNCH_HIT = edit(CAT_SIT, [
  [12, 7, "p"],
  [11, 7, "f"],
  [11, 8, "f"],
  [10, 9, "l"],
  [10, 10, "l"],
  [10, 11, "."],
  [9, 4, "e"],
  [10, 4, "f"],
]);

/** 꾹꾹이 (러시안블루) — 눈 감고 앞발 번갈아 */
const CAT_KNEAD_A = edit(CAT_WALK_A, [
  [11, 4, "q"],
  [10, 4, "f"],
  [11, 10, "p"],
  [11, 11, "."],
  [2, 1, "."],
  [1, 2, "x"],
  [1, 3, "t"],
  [1, 4, "y"],
  [2, 5, "t"],
  [2, 6, "y"],
]);
const CAT_KNEAD_B = edit(CAT_KNEAD_A, [
  [11, 10, "f"],
  [11, 11, "p"],
  [9, 10, "p"],
  [9, 11, "."],
]);

/** 야옹 대답 (샴) */
const CAT_MEOW = edit(CAT_SIT, [
  [11, 6, "k"],
  [10, 6, "d"],
]);
const CAT_MEOW_FLICK = edit(CAT_SIT_BLINK, [
  [9, 4, "f"],
  [10, 4, "e"],
  [11, 6, "k"],
  [10, 6, "d"],
  [11, 7, "k"],
]);

/** 고양이 공통 팔레트 → 품종별로 덮어쓴다 */
function catPal(o: Pal & { fur: Color; hi: Color; lo: Color }): Pal {
  return {
    // 귀 속: 털색에 분홍을 조금만 (진한 분홍은 정수리에 눈이 두 개 더 있는 것처럼 보인다)
    i: mix(o.fur, PINK, 0.45),
    f: o.fur,
    h: o.hi,
    l: o.lo,
    c: o.fur,
    m: o.fur,
    p: o.fur,
    t: o.fur,
    y: o.fur,
    x: o.fur,
    r: o.fur,
    z: o.fur,
    e: EYE,
    q: EYE,
    n: 0xe88a9a,
    b: BLUSH,
    k: TONGUE,
    d: 0x5a2a2a,
    ...o,
  };
}

function catSheet(act: readonly [Art, Art], pal: Pal, line: Color, pat?: (art: Art) => Art, four: Four4Shape = (_v, a) => a): () => Grid {
  const arts = [CAT_WALK_A, CAT_WALK_B, CAT_SIT, CAT_SIT_BLINK, act[0], act[1]];
  return sheet4(CAT_W, CAT_H, pat ? arts.map((a) => pat(a)) : arts, mapAll(CAT4, four), pal, line);
}

// 치즈냥 — 노랑 줄무늬 · 흰 주둥이·가슴·발
const CHEESE = catPal({ fur: 0xf2a84a, hi: 0xf8c878, lo: 0xd4863a, z: 0xd8742a, y: 0xd8742a, x: 0xd8742a, c: 0xfff4e2, m: 0xfff4e2, p: 0xfff4e2 });
const catCheese = catSheet([CAT_LOAF, CAT_LOAF_NOD], CHEESE, 0x6a3410);

// 고등어 — 회갈색 바탕 · 검은 고등어 줄무늬
const MACKEREL = catPal({ fur: 0x9a948a, hi: 0xb8b2a6, lo: 0x7a746a, z: 0x3e3a36, y: 0x3e3a36, x: 0x3e3a36, c: 0xe2dccf, m: 0xe2dccf, p: 0xf0ebe0, r: 0x6e685e });
const catMackerel = catSheet([CAT_GROOM_LICK, CAT_GROOM_WIPE], MACKEREL, 0x2a2622);

// 턱시도 — 검은 정장 · 흰 셔츠(가슴)·흰 장갑(발)·흰 코밑 · 노란 눈
const TUX = catPal({ fur: 0x302e38, hi: 0x5a586c, lo: 0x1e1c22, c: 0xfbf8f2, m: 0xfbf8f2, p: 0xfbf8f2, i: 0xc87888, n: 0xd87a8a, e: 0xe8c840, q: 0x8a8a96 });
const catTux = catSheet([CAT_YAWN, CAT_YAWN_BIG], TUX, 0x0e0c10);

// 삼색이 — 흰 바탕 · 주황·검정 얼룩
const CALICO = catPal({ fur: 0xfbf6ec, hi: 0xffffff, lo: 0xe6dccc, o: 0xe8902a, u: 0x34302c, r: 0x34302c });
/** 삼색이 얼룩: 머리 위 주황·검정 반반 · 등 앞쪽 주황 · 엉덩이 검정 · 꼬리 검정에 끝만 주황 */
function calicoSpots(art: Art): Art {
  return art.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch === "t" || ch === "y") return "u";
        if (ch === "x") return "o";
        if (ch !== "f" && ch !== "h" && ch !== "z") return ch;
        if (y <= 3) return x <= 9 ? "o" : "u";
        if (y <= 7 && x >= 5 && x <= 8) return "o";
        if (y >= 5 && y <= 8 && x <= 4) return "u";
        return ch;
      })
      .join(""),
  );
}
/** 삼색이 앞·뒤: 정수리 왼쪽 주황·오른쪽 검정, 몸 왼쪽 주황 · 오른쪽 아래 검정, 꼬리 검정 */
const calico4: Four4Shape = (view, a) =>
  recolorArt(a, (ch, x, y) => {
    if (ch === "t" || ch === "y") return "u";
    if (ch === "x") return "o";
    if (ch !== "f" && ch !== "h" && ch !== "z") return null;
    if (y <= 3) return (view === "front" ? x <= 5 : x >= 6) ? "o" : "u";
    if (y >= 7 && x <= 3) return view === "front" ? "o" : "u";
    if (y >= 7 && x >= 8) return view === "front" ? "u" : "o";
    return null;
  });
const catCalico = catSheet([CAT_PUNCH_UP, CAT_PUNCH_HIT], CALICO, 0x3a2c22, calicoSpots, calico4);

// 러시안블루 — 은회색 푸른 털 · 초록 눈
const BLUE = catPal({ fur: 0x8a9ab0, hi: 0xaebcd0, lo: 0x6a7a90, r: 0x7a8aa0, i: 0xc8a0b0, e: 0x3ab06a, n: 0x6a6a7a, p: 0x7a8aa0 });
const catBlue = catSheet([CAT_KNEAD_A, CAT_KNEAD_B], BLUE, 0x2a3242);

// 샴 — 크림 몸 · 얼굴 가면·귀·발·꼬리 진한 갈색 포인트 · 파란 눈
const SIAM = catPal({ fur: 0xf6ead4, hi: 0xfff6e6, lo: 0xe2d0b2, c: 0xfff6e6, m: 0x5a3a2a, u: 0x5a3a2a, o: 0xc0a080, r: 0x4a2e22, i: 0x8a5a4a, p: 0x5a3a2a, t: 0x5a3a2a, y: 0x5a3a2a, x: 0x3e2618, e: 0x3a8ae8, n: 0x2e1c14, b: 0x7a4e3a });
/** 샴 가면: 눈 둘레·눈 앞(주둥이 쪽)은 진하게, 한 칸 더 바깥은 중간 톤으로 번진다. 발목도 중간 톤 */
function siamMask(art: Art): Art {
  let ex = -1;
  let ey = -1;
  art.forEach((row, y) => [...row].forEach((ch, x) => (ch === "e" || ch === "q") && x > ex && ((ex = x), (ey = y))));
  return art.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch !== "f" && ch !== "h" && ch !== "z" && ch !== "b" && ch !== "l") return ch;
        const d = Math.max(Math.abs(x - ex), Math.abs(y - ey));
        if (ch !== "l" && (d <= 1 || (x > ex && Math.abs(y - ey) <= 2))) return "u";
        if (ch !== "l" && d === 2) return "o";
        // 다리 아래쪽 (발 바로 위)
        if (y >= art.length - 2 && row[x] !== "t") return "o";
        return ch;
      })
      .join(""),
  );
}
/** 샴 앞모습 가면: 눈·코 둘레 진하게, 한 칸 바깥 중간 톤. 다리 아래도 중간 톤 */
const siam4: Four4Shape = (view, a) => {
  const pts: [number, number][] = [];
  a.forEach((r, y) => [...r].forEach((ch, x) => (ch === "e" || ch === "q" || ch === "n") && pts.push([x, y])));
  return recolorArt(a, (ch, x, y) => {
    if (ch === "l" && y >= 9) return "o";
    if (view === "back" || !pts.length || (ch !== "f" && ch !== "h" && ch !== "z" && ch !== "b")) return null;
    const d = Math.min(...pts.map(([px, py]) => Math.max(Math.abs(px - x), Math.abs(py - y))));
    // 가면은 눈 사이·코 둘레만 (볼 바깥은 크림 그대로 — 넓히면 머리 전체가 갈색이 된다)
    return y <= 6 && x >= 3 && x <= 8 && d <= 1 ? (y === 3 ? "o" : "u") : null;
  });
};
const catSiam = catSheet([CAT_MEOW, CAT_MEOW_FLICK], SIAM, 0x3a2418, siamMask, siam4);

// ════════════════════════ 강아지 (품종마다 몸틀이 다르다) ════════════════════════

// 시바 (14×12) — 붉은 털 · 볼·가슴·배 크림(우라지로) · 등에 말린 꼬리. 동작 = 납작 엎드려 버티기 (흘끔)
const SHIBA_W = 14;
const SHIBA_H = 12;
const SHIBA_WALK_A: Art = [
  "..............",
  "........r..r..",
  ".tt....ri.ri..",
  "twwt...fhhhf..",
  "twwt...fffewn.",
  ".tthhhffwwww..",
  "..fffffffwww..",
  "..ffffffffww..",
  "..lllllllww...",
  "..w.l...l.w...",
  "..w.l...l.w...",
  "..p.l...l.p...",
];
const SHIBA_WALK_B: Art = [
  "..............",
  "........r..r..",
  "..tt...ri.ri..",
  ".twwt..fhhhf..",
  ".twwt..fffewn.",
  "..tthhffwwww..",
  "..fffffffwww..",
  "..ffffffffww..",
  "..lllllllww...",
  "...wl....lw...",
  "...wl....lw...",
  "...pl....lp...",
];
const SHIBA_SIT: Art = [
  "..............",
  "........r..r..",
  ".......ri.ri..",
  ".......fhhhf..",
  ".......fffewn.",
  "......ffwwww..",
  "..tt.fffwww...",
  ".twwtffffww...",
  ".twwtfffwww...",
  "..tthfffflw...",
  "..ffffffflw...",
  "..llllpp.lp...",
];
const SHIBA_SIT_BLINK = edit(SHIBA_SIT, [
  [10, 4, "q"],
  [9, 4, "q"],
]);
const SHIBA_FLAT: Art = [
  "..............",
  "..............",
  "..............",
  "..............",
  "..............",
  "..............",
  "..tt....r..r..",
  ".twwt..ri.ri..",
  ".twwt..fhhhf..",
  "..tthhhfffqwn.",
  "..ffffffwwwww.",
  ".lllllllwwpp..",
];
const SHIBA_FLAT_PEEK = edit(SHIBA_FLAT, [
  [10, 9, "f"],
  [9, 9, "e"],
  [2, 6, "."],
  [3, 6, "."],
  [1, 7, "."],
  [4, 7, "."],
  [1, 6, "t"],
  [2, 6, "t"],
  [0, 7, "t"],
  [3, 7, "t"],
]);
const SHIBA_PAL: Pal = { v: 0xe6d2b2, f: 0xd8803a, h: 0xe89a52, l: 0xb8642a, t: 0xd8803a, w: 0xfaecd2, r: 0xc8702e, i: 0xf6d8c0, e: EYE, q: EYE, n: 0x2a1a14, p: 0xfaecd2, k: TONGUE };
/** 등에 말린 꼬리: 앞 = 오른쪽 어깨 너머 · 뒤 = 엉덩이 위 고리. ring = 가운데 뚫린 고리(백구 — 가운데를 옅은 그늘로) */
const curl4 = (ring: boolean): Four4Shape => (view, a, sit) =>
  view === "front"
    ? edit(a, [[10, 6, "t"], [11, 6, "t"], [11, 5, "t"], [11, 7, ring ? "t" : "w"]])
    : edit(a, sit ? [[4, 7, "t"], [5, 7, "t"], [6, 7, "t"], [7, 7, "t"], [5, 8, ring ? "v" : "w"], [6, 8, ring ? "v" : "w"], [4, 8, "t"], [7, 8, "t"]] : [[4, 6, "t"], [5, 6, "t"], [6, 6, "t"], [7, 6, "t"], [5, 7, ring ? "v" : "w"], [6, 7, ring ? "v" : "w"], [4, 7, "t"], [7, 7, "t"], [5, 8, "t"], [6, 8, "t"]]);
const dogShiba = sheet4(SHIBA_W, SHIBA_H, [SHIBA_WALK_A, SHIBA_WALK_B, SHIBA_SIT, SHIBA_SIT_BLINK, SHIBA_FLAT, SHIBA_FLAT_PEEK], mapAll(DOG4, curl4(false)), { ...SHIBA_PAL, t: 0xeea460 }, 0x5a2c10);

// 진돗개 백구 (15×13) — 크고 다리가 긴 흰 개 · 쫑긋 선 귀 · 위로 동그랗게 말린 꼬리. 동작 = 앉아서 「손!」
const JINDO_W = 15;
const JINDO_H = 13;
const JINDO_WALK_A: Art = [
  "...............",
  ".........r..r..",
  "..tt....ri.ri..",
  ".t..t...fhhhf..",
  ".t..t...fffef..",
  "..tt.hhhffbwwn.",
  "...hffffffffww.",
  "...ffffffffww..",
  "...fffffffffw..",
  "...llllllllll..",
  "...v.f....v.f..",
  "...v.f....v.f..",
  "...v.p....v.p..",
];
const JINDO_WALK_B = edit(JINDO_WALK_A, [
  ...[10, 11, 12].flatMap((y) => [[3, y, "."], [5, y, "."], [10, y, "."], [12, y, "."], [4, y, "f"], [5, y, "v"], [10, y, "v"], [11, y, "f"]] as [number, number, string][]),
  [4, 12, "p"],
  [11, 12, "p"],
  [2, 2, "."],
  [3, 2, "t"],
  [4, 2, "t"],
  [1, 3, "."],
  [2, 3, "t"],
  [5, 3, "t"],
  [1, 4, "."],
  [2, 4, "t"],
  [5, 4, "t"],
  [3, 5, "t"],
  [4, 5, "t"],
  [2, 5, "."],
]);
const JINDO_SIT: Art = [
  "...............",
  ".........r..r..",
  "........ri.ri..",
  "........fhhhf..",
  "........fffef..",
  ".......hffbwwn.",
  "......hfffffww.",
  "..tt..fffffww..",
  ".t..tffffffww..",
  ".t..fffffffww..",
  "..ttfffffffvw..",
  "...ffffffffvw..",
  "...lllllpp.vp..",
];
const JINDO_SIT_BLINK = edit(JINDO_SIT, [
  [11, 4, "q"],
  [10, 4, "q"],
]);
/** 손! — 가까운 앞발을 앞으로 척 */
const JINDO_PAW = edit(JINDO_SIT, [
  [12, 10, "."],
  [12, 11, "."],
  [12, 12, "."],
  [13, 9, "w"],
  [14, 9, "p"],
]);
const JINDO_PAW_HI = edit(JINDO_SIT, [
  [12, 10, "."],
  [12, 11, "."],
  [12, 12, "."],
  [13, 8, "w"],
  [14, 7, "p"],
  [13, 7, "k"],
  [11, 4, "q"],
  [10, 4, "q"],
]);
const JINDO_PAL: Pal = { f: 0xf8f2e4, h: 0xffffff, l: 0xdcd0b8, v: 0xd0c4aa, t: 0xf8f2e4, w: 0xfffaf0, r: 0xf0e6d2, i: 0xf2b8b8, e: EYE, q: EYE, n: 0x2a2220, p: 0xfffaf0, b: 0xf8c8c8, k: TONGUE };
const dogJindo = sheet4(JINDO_W, JINDO_H, [JINDO_WALK_A, JINDO_WALK_B, JINDO_SIT, JINDO_SIT_BLINK, JINDO_PAW, JINDO_PAW_HI], mapAll(DOG4, curl4(true)), { ...JINDO_PAL, t: 0xeee4d0 }, 0x5a4a3a);

// 웰시코기 (16×11) — 주황 등 · 흰 이마 줄·주둥이·가슴·배·발 · 커다란 귀 · 짧은 다리 · 하얀 궁둥이. 동작 = 뒷다리 쭉 펴고 납작 (스플롯)
const CORGI_W = 16;
const CORGI_H = 11;
const CORGI_WALK_A: Art = [
  "................",
  "..........r..r..",
  ".........ri.ri..",
  ".........fhhhf..",
  ".........fwfef..",
  "..hhhhhhffwwwwn.",
  ".fffffffffwwww..",
  ".wffffffffwww...",
  ".wwfffffffww....",
  "..wwwwwwwwww....",
  "..p.v....v.p....",
];
const CORGI_WALK_B = edit(CORGI_WALK_A, [
  [2, 10, "."],
  [4, 10, "."],
  [9, 10, "."],
  [11, 10, "."],
  [3, 10, "p"],
  [4, 10, "v"],
  [9, 10, "v"],
  [10, 10, "p"],
]);
const CORGI_SIT: Art = [
  "................",
  "..........r..r..",
  ".........ri.ri..",
  ".........fhhhf..",
  ".........fwfef..",
  "........ffwwwwn.",
  ".......hffwwww..",
  ".....hffffwww...",
  "...wfffffwww....",
  "..wwffffffvw....",
  "..wwvvvpp.vp....",
];
const CORGI_SIT_BLINK = edit(CORGI_SIT, [
  [12, 4, "q"],
  [11, 4, "q"],
]);
const CORGI_SPLOOT: Art = [
  "................",
  "................",
  "................",
  "................",
  "..........r..r..",
  ".........ri.ri..",
  ".........fhhhf..",
  "..hhhhhhhfwfef..",
  ".fffffffffwwwwn.",
  "vwffffffffwwww..",
  "pvwwwwwwwwwwpp..",
];
const CORGI_SPLOOT_WIGGLE = edit(CORGI_SPLOOT, [
  [10, 4, "."],
  [9, 4, "r"],
  [12, 7, "q"],
  [11, 7, "q"],
  [13, 9, "k"],
]);
const CORGI_PAL: Pal = { f: 0xe8943e, h: 0xf4b064, l: 0xc8762a, w: 0xfff8ec, v: 0xe2d6c2, r: 0xd88434, i: 0xf6c8b4, e: EYE, q: EYE, n: 0x2a1a14, p: 0xfff8ec, k: TONGUE };
/** 코기: 커다란 귀(한 칸 더 넓게) · 흰 이마 줄 · 뒤는 하얀 궁둥이 */
const corgi4: Four4Shape = (view, a) =>
  edit(a, view === "front" ? [[2, 1, "r"], [9, 1, "r"], [5, 3, "w"], [6, 3, "w"], [5, 4, "w"], [6, 4, "w"]] : [[2, 1, "r"], [9, 1, "r"], [5, 8, "w"], [6, 8, "w"], [4, 9, "w"], [5, 9, "w"], [6, 9, "w"], [7, 9, "w"]]);
const dogCorgi = sheet4(CORGI_W, CORGI_H, [CORGI_WALK_A, CORGI_WALK_B, CORGI_SIT, CORGI_SIT_BLINK, CORGI_SPLOOT, CORGI_SPLOOT_WIGGLE], mapAll(shortLegs(DOG4), corgi4), CORGI_PAL, 0x5a2e10);

// 포메라니안 (14×11) — 동글동글 솜뭉치 · 가슴 갈기 · 등에 펼쳐 얹은 깃털 꼬리 · 작은 여우 얼굴. 동작 = 웅크렸다 폴짝 뛰며 왈! (pose.lift)
const POM_W = 14;
const POM_H = 11;
const POM_WALK_A: Art = [
  "..............",
  "...xx....r.r..",
  "..xttx..rihir.",
  ".xttttxhfhhhf.",
  ".xtttthffffef.",
  "..xthffffwbfn.",
  ".hfffffwwwwd..",
  "hffffffwwwwww.",
  "fffffffwwwww..",
  ".lllllllwww...",
  "..p.v...vp....",
];
const POM_WALK_B = edit(POM_WALK_A, [
  [2, 10, "."],
  [4, 10, "."],
  [8, 10, "."],
  [9, 10, "."],
  [3, 10, "p"],
  [4, 10, "v"],
  [8, 10, "p"],
  [7, 10, "v"],
  [3, 1, "."],
  [2, 1, "x"],
]);
const POM_SIT: Art = [
  "..............",
  "..............",
  "...xx....r.r..",
  "..xttx..rihir.",
  ".xttttxhfhhhf.",
  ".xtttthffffef.",
  "..xthffffwbfn.",
  ".hfffffwwwwd..",
  "hffffffwwwwww.",
  "fffffffwwwww..",
  ".lllllllpwp...",
];
const POM_SIT_BLINK = edit(POM_SIT, [
  [11, 5, "q"],
  [10, 5, "q"],
]);
/** 웅크렸다가 → 폴짝 왈! */
const POM_CROUCH = edit(POM_SIT, [
  [11, 5, "q"],
  [10, 5, "q"],
]);
const POM_HOP = edit(POM_WALK_A, [
  [2, 10, "."],
  [4, 10, "."],
  [8, 10, "."],
  [9, 10, "."],
  [1, 10, "p"],
  [3, 10, "v"],
  [8, 10, "v"],
  [10, 10, "p"],
  [11, 6, "k"],
  [12, 6, "d"],
  [12, 5, "n"],
]);
const POM_PAL: Pal = { f: 0xec9844, h: 0xf6b464, l: 0xcc7830, w: 0xfde6b8, v: 0xcc7830, t: 0xfbcf8e, x: 0xfff2d6, r: 0xe0903e, i: 0xf6c4a8, e: EYE, q: EYE, n: 0x2a1a14, p: 0xfde2b0, b: BLUSH, k: TONGUE, d: 0x8a4a2a };
/** 포메: 볼·가슴 갈기가 얼굴을 감싸고, 깃털 꼬리가 어깨 너머(앞)·등 위(뒤)에 펼쳐진다 */
const pom4: Four4Shape = (view, a) =>
  edit(
    a,
    view === "front"
      ? [[1, 5, "w"], [10, 5, "w"], [1, 6, "w"], [10, 6, "w"], [2, 6, "w"], [9, 6, "w"], [10, 2, "x"], [10, 3, "t"], [11, 3, "x"], [11, 4, "t"], [10, 4, "t"]]
      : [[3, 5, "x"], [4, 5, "t"], [5, 5, "x"], [6, 5, "t"], [7, 5, "x"], [8, 5, "t"], [3, 6, "t"], [4, 6, "x"], [5, 6, "t"], [6, 6, "x"], [7, 6, "t"], [8, 6, "x"], [4, 7, "t"], [5, 7, "t"], [6, 7, "t"], [7, 7, "t"]],
  );
const dogPom = sheet4(POM_W, POM_H, [POM_WALK_A, POM_WALK_B, POM_SIT, POM_SIT_BLINK, POM_CROUCH, POM_HOP], mapAll(shortLegs(DOG4), pom4), POM_PAL, 0x6a3410);

// 비숑 (14×12) — 구름 같은 흰 솜털 · 동그란 머리 · 늘어진 귀 · 까만 눈코. 동작 = 부르르 몸 털기
const BICHON_W = 14;
const BICHON_H = 12;
const BICHON_WALK_A: Art = [
  "..............",
  "........hhh...",
  ".hh....hffffh.",
  "hffh..hfaffff.",
  "hfff..ffafeff.",
  ".fffhhffafbfn.",
  ".ffffflfaffdf.",
  ".fffffflffff..",
  ".ffffffffff...",
  ".llllllllll...",
  "..ff.v..v.ff..",
  "..pp.v..v.pp..",
];
const BICHON_WALK_B = edit(BICHON_WALK_A, [
  ...[10, 11].flatMap((y) => [[2, y, "."], [3, y, y === 11 ? "p" : "f"], [4, y, y === 11 ? "p" : "f"], [5, y, "v"], [8, y, "v"], [9, y, y === 11 ? "p" : "f"], [10, y, y === 11 ? "p" : "f"], [11, y, "."]] as [number, number, string][]),
  [0, 3, "."],
  [0, 4, "."],
  [1, 2, "."],
  [2, 2, "h"],
  [3, 3, "f"],
]);
const BICHON_SIT: Art = [
  "..............",
  "........hhh...",
  ".......hffffh.",
  "......hfaffff.",
  "......ffafeff.",
  ".hh..hffafbfn.",
  "hffh.flfaffdf.",
  "hfffffflfff...",
  ".ffffffffff...",
  ".fffffffffff..",
  "..fffffffvff..",
  "..llllpp.vpp..",
];
const BICHON_SIT_BLINK = edit(BICHON_SIT, [
  [10, 4, "q"],
  [9, 4, "q"],
]);
/** 부르르: 귀가 펄럭 뜨고 솜털이 들썩 (좌우로 한 번씩) */
const BICHON_SHAKE_A = edit(BICHON_WALK_A, [
  [8, 3, "f"],
  [8, 4, "f"],
  [8, 5, "f"],
  [8, 6, "f"],
  [7, 1, "a"],
  [6, 2, "a"],
  [10, 4, "q"],
  [9, 4, "q"],
  [0, 7, "h"],
  [0, 8, "h"],
  [11, 8, "h"],
]);
const BICHON_SHAKE_B = edit(BICHON_WALK_A, [
  [8, 3, "f"],
  [8, 4, "f"],
  [8, 5, "f"],
  [8, 6, "f"],
  [7, 6, "a"],
  [6, 7, "a"],
  [10, 4, "q"],
  [9, 4, "q"],
  [12, 7, "h"],
  [0, 6, "h"],
]);
const BICHON_PAL: Pal = { f: 0xfdfaf4, h: 0xffffff, l: 0xe8dccb, a: 0xf2e2c8, v: 0xd8ccbc, e: 0x1e1814, q: 0x1e1814, n: 0x1e1814, p: 0xf2ece0, b: 0xf8c4c8, d: 0x8a4a4a, k: TONGUE };
/** 비숑: 늘어진 귀는 살구빛(a), 뒤는 동그란 꼬리 폼폼 */
const bichon4: Four4Shape = (view, a) => {
  const b = recolorArt(a, (ch) => (ch === "r" ? "a" : null));
  return view === "back" ? edit(b, [[5, 7, "h"], [6, 7, "h"], [5, 6, "h"], [6, 6, "h"]]) : b;
};
const dogBichon = sheet4(BICHON_W, BICHON_H, [BICHON_WALK_A, BICHON_WALK_B, BICHON_SIT, BICHON_SIT_BLINK, BICHON_SHAKE_A, BICHON_SHAKE_B], mapAll(FLOP4, bichon4), BICHON_PAL, 0x6e6058);

// 닥스훈트 (18×12) — 길쭉한 몸 · 짧은 다리 · 긴 주둥이 · 축 늘어진 귀 · 반들반들 적갈색. 동작 = 뒷발로 서서 간식 조르기
const DACHS_W = 18;
const DACHS_H = 12;
const DACHS_WALK_A: Art = [
  "..................",
  "..................",
  "..................",
  "...........hhhh...",
  "x.........frrfef..",
  ".t.......ffrrfmmn.",
  "..thhhhhhfrrrfmm..",
  "..fffffffffrrcc...",
  "..ffffffffffccc...",
  "...llllllllllll...",
  "...f.v......v.f...",
  "...p.v......v.p...",
];
const DACHS_WALK_B = edit(DACHS_WALK_A, [
  ...[10, 11].flatMap((y) => [[3, y, "."], [5, y, "."], [12, y, "."], [14, y, "."], [4, y, y === 11 ? "p" : "f"], [5, y, "v"], [12, y, "v"], [13, y, y === 11 ? "p" : "f"]] as [number, number, string][]),
  [0, 4, "."],
  [0, 5, "x"],
  [1, 5, "t"],
]);
const DACHS_SIT: Art = [
  "..................",
  "..................",
  ".........hhhh.....",
  "........frrfef....",
  "........frrffmmn..",
  "........frrrfmm...",
  ".......hfrrcc.....",
  "......hfffcc......",
  ".....hffffcc......",
  "....hffffflc......",
  "..xtfffffflc......",
  "...lllpp..lp......",
];
const DACHS_SIT_BLINK = edit(DACHS_SIT, [
  [12, 3, "q"],
  [11, 3, "q"],
  [2, 10, "."],
  [2, 9, "x"],
]);
/** 뒷발로 서서 앞발 모으고 조르기 (5 = 앞발 까딱 + 혀) */
const DACHS_BEG: Art = [
  "..................",
  ".........hhhh.....",
  "........frrfef....",
  "........frrffmmn..",
  "........frrrfmm...",
  "........hfrrcp....",
  ".......hfffccp....",
  ".......ffffcc.....",
  ".......ffffcc.....",
  "...x...fffffc.....",
  "....t..lfffl......",
  ".....t.pp.pp......",
];
const DACHS_BEG_BOB = edit(DACHS_BEG, [
  [13, 5, "."],
  [13, 6, "."],
  [14, 6, "p"],
  [13, 7, "p"],
  [12, 7, "c"],
  [14, 4, "k"],
  [12, 2, "q"],
  [11, 2, "q"],
  [3, 9, "."],
  [3, 10, "x"],
]);
const DACHS_PAL: Pal = { f: 0xb05a2c, h: 0xd8864c, l: 0x8a4220, v: 0x7a3a1c, t: 0xb05a2c, x: 0x8a4220, r: 0x7a3418, c: 0xc46a38, m: 0xc06836, e: EYE, q: EYE, n: 0x1e120c, p: 0x9a4c26, k: TONGUE };
/** 닥스훈트: 긴 주둥이(코가 한 칸 아래) · 뒤는 엉덩이에 가는 꼬리 */
const dachs4: Four4Shape = (view, a) =>
  view === "front" ? edit(a, [[5, 5, "m"], [6, 5, "m"], [5, 6, "n"], [6, 6, "n"]]) : edit(a, [[6, 7, "x"], [6, 8, "x"], [5, 8, "h"]]);
const dogDachs = sheet4(DACHS_W, DACHS_H, [DACHS_WALK_A, DACHS_WALK_B, DACHS_SIT, DACHS_SIT_BLINK, DACHS_BEG, DACHS_BEG_BOB], mapAll(shortLegs(FLOP4), dachs4), DACHS_PAL, 0x3a1a0a);

/** 옆모습 6장 + 앞·뒷모습 8장 */
export const BREED_FRAMES = 14;
/** 앞·뒷모습 프레임 번호 (cosmeticFx에 붙일 때 PetSpec.dirs로) */
export const BREED_DIRS = { down: { walk: [6, 7], rest: [8, 8, 8, 9] }, up: { walk: [10, 11], rest: [12, 12, 12, 13] } } as const;

export const BREED_ART = {
  pbCatCheese: { w: CAT_W + BREED_PAD_X * 2, h: CAT_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: catCheese },
  pbCatMackerel: { w: CAT_W + BREED_PAD_X * 2, h: CAT_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: catMackerel },
  pbCatTux: { w: CAT_W + BREED_PAD_X * 2, h: CAT_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: catTux },
  pbCatCalico: { w: CAT_W + BREED_PAD_X * 2, h: CAT_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: catCalico },
  pbCatBlue: { w: CAT_W + BREED_PAD_X * 2, h: CAT_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: catBlue },
  pbCatSiam: { w: CAT_W + BREED_PAD_X * 2, h: CAT_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: catSiam },
  pbDogShiba: { w: SHIBA_W + BREED_PAD_X * 2, h: SHIBA_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: dogShiba },
  pbDogJindo: { w: JINDO_W + BREED_PAD_X * 2, h: JINDO_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: dogJindo },
  pbDogCorgi: { w: CORGI_W + BREED_PAD_X * 2, h: CORGI_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: dogCorgi },
  pbDogPom: { w: POM_W + BREED_PAD_X * 2, h: POM_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: dogPom },
  pbDogBichon: { w: BICHON_W + BREED_PAD_X * 2, h: BICHON_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: dogBichon },
  pbDogDachs: { w: DACHS_W + BREED_PAD_X * 2, h: DACHS_H + BREED_PAD_TOP, frames: BREED_FRAMES, build: dogDachs },
} as const;

export type BreedArtId = keyof typeof BREED_ART;

/** 연출 규칙 (petPack PET_PACK_FX와 같은 모양 — cosmeticFx COSMETIC_FX에 섞인다). dirs = 위·아래로 걸을 때 앞·뒷모습 */
const CAT_IDLE = [2, 2, 2, 3] as const;
const DOG_IDLE = [2, 2, 3, 2] as const;

/** 아이템 id(제안) → 연출. 고양이는 사무실 고양이(pet_cat)와, 강아지는 퇴근 강아지(pet_dog)와 걸음 빠르기가 같다 */
/** 11/20 품종 펫은 주인과 한 발짝 떨어져 따라온다 (사용자 「너무 바짝 붙어 있다」) */
const BREED_FAR = 1.8;

export const BREED_FX = {
  pet_cheese: { kind: "pet", art: "pbCatCheese", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 7, idleFps: 1.5, pose: { idle: CAT_IDLE, act: [4, 4, 4, 5, 5, 5, 5, 4], actMs: 420, every: 9000 } },
  pet_godeung: { kind: "pet", art: "pbCatMackerel", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 7, idleFps: 1.5, pose: { idle: CAT_IDLE, act: [4, 5, 4, 5, 4, 5, 4], actMs: 220, every: 7000 } },
  pet_tuxedo: { kind: "pet", art: "pbCatTux", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 7, idleFps: 1.5, pose: { idle: CAT_IDLE, act: [4, 5, 5, 5, 4], actMs: 320, every: 8000 } },
  pet_calico: { kind: "pet", art: "pbCatCalico", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 7, idleFps: 1.5, pose: { idle: CAT_IDLE, act: [4, 5, 4, 5, 4, 5], actMs: 130, every: 6500 } },
  pet_russian: { kind: "pet", art: "pbCatBlue", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 7, idleFps: 1.5, pose: { idle: CAT_IDLE, act: [4, 5, 4, 5, 4, 5, 4, 5], actMs: 260, every: 7500 } },
  pet_siamese: { kind: "pet", art: "pbCatSiam", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 7, idleFps: 1.5, pose: { idle: CAT_IDLE, act: [4, 5, 4, 2, 4, 5], actMs: 260, every: 7000 } },
  pet_shiba: { kind: "pet", art: "pbDogShiba", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 8, idleFps: 2, pose: { idle: DOG_IDLE, act: [4, 4, 5, 4, 5, 4, 4], actMs: 320, every: 8000 } },
  pet_jindo: { kind: "pet", art: "pbDogJindo", hover: 0, dirs: BREED_DIRS, fps: 8, idleFps: 2, far: BREED_FAR * 1.15, pose: { idle: DOG_IDLE, act: [4, 4, 5, 5, 5, 4], actMs: 260, every: 7000 } },
  pet_corgi: { kind: "pet", art: "pbDogCorgi", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 9, idleFps: 2, pose: { idle: DOG_IDLE, act: [4, 4, 5, 4, 5, 4, 4], actMs: 320, every: 8000 } },
  pet_pom: { kind: "pet", art: "pbDogPom", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 9, idleFps: 2, pose: { idle: DOG_IDLE, act: [4, 5, 4, 5, 4, 5], actMs: 150, every: 5500, lift: [0, 3, 0, 3, 0, 3] } },
  pet_bichon: { kind: "pet", art: "pbDogBichon", hover: 0, far: BREED_FAR, dirs: BREED_DIRS, fps: 8, idleFps: 2, pose: { idle: DOG_IDLE, act: [4, 5, 4, 5, 4, 5, 4, 5], actMs: 90, every: 7000 } },
  pet_dachs: { kind: "pet", art: "pbDogDachs", hover: 0, dirs: BREED_DIRS, fps: 9, idleFps: 2, far: BREED_FAR * 1.2, pose: { idle: DOG_IDLE, act: [4, 5, 4, 5, 4, 5, 4], actMs: 200, every: 7000 } },
} satisfies Record<string, FxSpec>;

/** 품종 펫 아이콘 16×16: 앞을 보고 앉은 모습(프레임 8 — 얼굴·무늬가 가장 또렷)을 가운데·아래에 담는다. 해당 없으면 null */
export function breedIconGrid(id: string): Grid | null {
  const spec = (BREED_FX as Record<string, (typeof BREED_FX)[keyof typeof BREED_FX]>)[id];
  if (!spec) return null;
  const a = BREED_ART[spec.art];
  const src = a.build();
  const frame = BREED_DIRS.down.rest[0];
  const g = new Grid(16, 16);
  const ox = Math.floor((16 - a.w) / 2);
  const oy = 16 - a.h;
  for (let j = 0; j < a.h; j++)
    for (let i = 0; i < a.w; i++) {
      const v = src.px[j * src.w + frame * a.w + i];
      const tx = ox + i;
      const ty = oy + j;
      if ((v & 255) === 0 || tx < 0 || ty < 0 || tx >= 16 || ty >= 16) continue;
      g.px[ty * 16 + tx] = v;
    }
  return g;
}
