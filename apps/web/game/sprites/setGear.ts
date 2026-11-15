import { avatarFrameGrid, AV_H, AV_W } from "./avatar";
import { darken, Grid, lighten, mix, type Color } from "./pixel";

// 초월(레벨 50+) 세트 장비 그림 — 디자인 미리보기 단계 (아직 카탈로그·상점·드롭에 연결하지 않았다).
//  세트 4종(야근·결재·회의·출장) × 다섯 부위(무기·갑옷·머리·장신구 2) × 직급 4단계(사원·대리·과장·임원).
//  아이콘은 기존 사냥 장비(game/rpg/icons.ts)와 같은 16×16·같은 외곽선. 직급이 오를수록:
//   사원급 = 빛바랜 색·장식 없음 → 대리급 = 세트 색 그대로 + 작은 띠 → 과장급 = 은빛 금속 테 + 은은한 빛
//   → 임원급 = 금 테 + 보석 + 반짝임 2프레임. 모양(실루엣)은 직급마다 같고 재질·장식만 바뀐다.
//  착용 미리보기(setGearDollGrid)는 기본 아바타(두건, 앞모습)에 갑옷·머리·장신구를 입히고 무기를 손에 쥐여 준다.

export type SetGearSet = "overtime" | "approval" | "meeting" | "trip";
export type SetGearPiece = "weapon" | "armor" | "head" | "acc1" | "acc2";
export type SetGearGrade = 0 | 1 | 2 | 3;

export const SET_GEAR_SETS: readonly SetGearSet[] = ["overtime", "approval", "meeting", "trip"];
export const SET_GEAR_PIECES: readonly SetGearPiece[] = ["weapon", "armor", "head", "acc1", "acc2"];
export const SET_GEAR_GRADE_NAMES = ["사원급", "대리급", "과장급", "임원급"] as const;

export const SET_GEAR_INFO: Record<SetGearSet, { name: string; styles: string; pieces: Record<SetGearPiece, string> }> = {
  overtime: {
    name: "야근 세트",
    styles: "내려찍기·휘두르기",
    pieces: { weapon: "막차 놓친 도끼", armor: "사흘째 같은 셔츠", head: "충혈된 눈 고글", acc1: "에너지 드링크 반지", acc2: "빈 커피 컵 목걸이" },
  },
  approval: {
    name: "결재 세트",
    styles: "찌르기·던지기",
    pieces: { weapon: "반려 도장 창", armor: "결재판 흉갑", head: "돋보기 안경", acc1: "만년필 브로치", acc2: "사장실 출입증" },
  },
  meeting: {
    name: "회의 세트",
    styles: "범위 마법",
    pieces: { weapon: "끝없는 PPT 마법서", armor: "회의실 커튼 로브", head: "프로젝터 왕관", acc1: "레이저 포인터 귀걸이", acc2: "회의록 수첩" },
  },
  trip: {
    name: "출장 세트",
    styles: "쏘기·연타",
    pieces: { weapon: "기내용 캐리어 대포", armor: "경량 패딩", head: "목베개 투구", acc1: "마일리지 카드", acc2: "면세점 영수증" },
  },
};

const OUT = 0x16151a;
const WHITE = 0xf8f8f4;

// ── 색 ──

/** 세트 고유 색 (대리급 기준). m = 주재료, a = 포인트, p = 밝은 재료(종이·셔츠·화면), x·e = 세트별 보조 */
type SetPal = {
  m: Color; mHi: Color; mLo: Color;
  a: Color; aHi: Color; aLo: Color;
  p: Color; pLo: Color;
  x: Color; xLo: Color;
  e: Color;
  glow: Color;
  gem: Color; gemHi: Color;
  /** 대리급 띠 색 (없으면 포인트 a) — 세트 색에 금이 들어간 결재 세트는 금을 임원급에만 남긴다 */
  trim1?: [Color, Color, Color];
};

const PAL: Record<SetGearSet, SetPal> = {
  // 야근: 지친 남색 + 에너지 드링크 형광 초록 (+ 커피 갈색·충혈 빨강)
  overtime: {
    m: 0x34407a, mHi: 0x5264a8, mLo: 0x1f2750,
    a: 0x8cf03c, aHi: 0xd8ffa0, aLo: 0x3c9a2c,
    p: 0xd2dcee, pLo: 0x9eaac4,
    x: 0x8a5a34, xLo: 0x5a3820,
    e: 0xe0404a,
    glow: 0xa8ff60,
    gem: 0x3cf08a, gemHi: 0xd8fff0,
  },
  // 결재: 인주 빨강 + 상아색 종이 + 금 (+ 결재판 검정 가죽)
  approval: {
    m: 0xc8323c, mHi: 0xee6a70, mLo: 0x86202a,
    a: 0xd8a838, aHi: 0xffe08a, aLo: 0x9a7220,
    p: 0xf2ead3, pLo: 0xcabd98,
    x: 0x4e3032, xLo: 0x342022,
    e: 0x26326a,
    trim1: [0xc8323c, 0xee6a70, 0x86202a],
    glow: 0xffd27a,
    gem: 0xff3a5a, gemHi: 0xffd0d8,
  },
  // 회의: 커튼 버건디 + 프로젝터 파란 빛 (+ 회의실 숯색·레이저 빨강)
  meeting: {
    m: 0x7c2444, mHi: 0xac4466, mLo: 0x4c142a,
    a: 0x4ab8ff, aHi: 0xc4f0ff, aLo: 0x2a68d0,
    p: 0xe6f2ff, pLo: 0xa8bcd8,
    x: 0x383a44, xLo: 0x23242c,
    e: 0xff3040,
    glow: 0x80dcff,
    gem: 0x3a64ff, gemHi: 0xd0dcff,
  },
  // 출장: 캐리어 주황 + 여권 남색 + 기내 흰색 (+ 수하물 꼬리표 빨강·하늘색)
  trip: {
    m: 0xf08a24, mHi: 0xffbe6a, mLo: 0xb0561a,
    a: 0x24346e, aHi: 0x4a64ac, aLo: 0x141c44,
    p: 0xf2f5fa, pLo: 0xbcc6d4,
    x: 0xd83c3c, xLo: 0x8e2226,
    e: 0x8ad4ff,
    glow: 0x9ae4ff,
    gem: 0x38e0f0, gemHi: 0xe0ffff,
  },
};

const SILVER = { c: 0xb8c2d0, hi: 0xf0f6ff, lo: 0x6e7888 };
const GOLD = { c: 0xf0c040, hi: 0xfff2a8, lo: 0xa8741c };

/** 직급까지 반영한 색 묶음 (그림 함수가 받는다) */
export type SetTierPal = SetPal & {
  g: SetGearGrade;
  /** 테두리·띠: 사원 = 주재료 그늘, 대리 = 세트 포인트, 과장 = 은, 임원 = 금 */
  t: Color; tHi: Color; tLo: Color;
  /** 박힌 알: 사원 = 무광 단추, 대리 = 포인트, 과장 = 빛, 임원 = 보석 */
  G: Color; GHi: Color;
  /** 켜지는 빛(화면·렌즈): 사원 = 꺼짐, 대리 = 밝은 재료, 과장·임원 = 세트 빛 */
  L: Color; LHi: Color;
};

type T = SetTierPal;

function gray(c: Color): Color {
  const l = Math.round(((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11);
  return (l << 16) | (l << 8) | l;
}

function tierPal(set: SetGearSet, g: SetGearGrade): T {
  const b = PAL[set];
  // 사원급: 빛바랜 색 (세트 색은 알아보되 채도·밝기를 낮춘다)
  const dull = (c: Color, k = 0.5) => (g === 0 ? darken(mix(c, gray(c), k), 0.06) : c);
  const base: SetPal = {
    ...b,
    m: dull(b.m), mHi: dull(b.mHi), mLo: dull(b.mLo),
    a: dull(b.a, 0.55), aHi: dull(b.aHi, 0.55), aLo: dull(b.aLo, 0.55),
    p: g === 0 ? mix(b.p, 0xb8b2a0, 0.35) : b.p,
    pLo: g === 0 ? mix(b.pLo, 0x8a8474, 0.35) : b.pLo,
    x: dull(b.x), xLo: dull(b.xLo), e: dull(b.e, 0.4),
  };
  const trim =
    g === 0 ? { c: base.mLo, hi: base.m, lo: darken(base.mLo, 0.25) }
    : g === 1 ? (b.trim1 ? { c: b.trim1[0], hi: b.trim1[1], lo: b.trim1[2] } : { c: base.a, hi: base.aHi, lo: base.aLo })
    : g === 2 ? SILVER
    : GOLD;
  const gem =
    g === 0 ? { c: darken(base.mLo, 0.1), hi: base.mLo }
    : g === 1 ? { c: base.a, hi: base.aHi }
    : g === 2 ? { c: b.glow, hi: lighten(b.glow, 0.6) }
    : { c: b.gem, hi: b.gemHi };
  const light =
    g === 0 ? { c: base.pLo, hi: base.p }
    : g === 1 ? { c: b.p, hi: WHITE }
    : g === 2 ? { c: b.glow, hi: lighten(b.glow, 0.55) }
    : { c: lighten(b.glow, 0.15), hi: WHITE };
  return { ...base, g, t: trim.c, tHi: trim.hi, tLo: trim.lo, G: gem.c, GHi: gem.hi, L: light.c, LHi: light.hi };
}

// ── 도구 ──

/** 문자 그림: 줄마다 한 글자 = 한 픽셀. '.'·' ' = 건너뜀. 색은 표에서 */
function stamp(g: Grid, rows: readonly string[], key: Record<string, Color | undefined>, ox = 0, oy = 0): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      const c = key[ch];
      if (c !== undefined) g.set(ox + x, oy + y, c);
    }
  });
}

/** 공통 문자 표: M/H/m 주재료, A/B/a 포인트, P/p 밝은 재료, X/x 보조, E 보조2, T/t/U 테, G/g 알, L/l 빛, K 진한 선, W 흰색 */
function keyOf(t: T): Record<string, Color> {
  return {
    M: t.m, H: t.mHi, m: t.mLo,
    A: t.a, B: t.aHi, a: t.aLo,
    P: t.p, p: t.pLo,
    X: t.x, x: t.xLo, E: t.e,
    T: t.t, t: t.tHi, U: t.tLo,
    G: t.G, g: t.GHi,
    L: t.L, l: t.LHi,
    K: OUT, W: WHITE,
    S: 0xa8b0bc, s: 0x6a7280, Z: 0xe8eef6, // 쇠 (날·바퀴)
  };
}

type Art = {
  /** 임원급 반짝임 자리 [프레임0, 프레임1] */
  spark: [number, number][];
  /** 무기: 손잡이 자리 (착용 미리보기에서 손에 맞춘다) */
  grip?: [number, number];
};

type Painter = (g: Grid, t: T, k: Record<string, Color>) => Art;

// ── 아이콘 16×16 ──
// 직급별 차이는 문자 표(T/G/L)와 g 값으로 고른 덧그림으로 낸다. 실루엣은 같다.

const ICON: Record<SetGearSet, Record<SetGearPiece, Painter>> = {
  overtime: {
    /** 막차 놓친 도끼: 남색 강철 부채꼴 날 + 형광 날끝 + 초승달 새김 + 도끼 등의 막차 시계 */
    weapon(g, t) {
      // 날 (자루 위왼쪽 부채꼴). 사원 = 무딘 쇠, 대리+ = 남색 강철
      const body = t.g === 0 ? 0x8a909c : t.m;
      const bodyHi = t.g === 0 ? 0xb4bac4 : t.mHi;
      const edge = t.g === 0 ? 0xd0d4dc : t.a;
      const edgeHi = t.g === 0 ? 0xf0f2f4 : t.aHi;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const d = Math.hypot(x + 0.5 - 11, y + 0.5 - 5);
          const u = x - y;
          if (d <= 6.4 && x + y <= 15 && u >= -1 && u <= 11) g.set(x, y, d > 5.2 ? edge : x + y < 11 && d < 4 ? bodyHi : body);
        }
      g.recolor((x, y) => (g.get(x, y) >>> 8) === edge && (x + y < 9 || y < 1), edgeHi);
      // 초승달 새김
      const moon = t.g === 0 ? 0x6a707c : t.g === 1 ? t.aHi : t.LHi;
      g.set(8, 4, moon); g.set(7, 5, moon); g.set(7, 6, moon); g.set(8, 7, moon);
      // 자루 (남색, 손잡이에 형광 테이프)
      for (let i = 0; i < 11; i++) {
        g.set(2 + i, 14 - i, i > 8 ? t.tHi : t.mHi);
        g.set(3 + i, 14 - i, i > 8 ? t.t : t.mLo);
      }
      if (t.g >= 1) for (const i of [1, 3]) { g.set(2 + i, 14 - i, t.a); g.set(3 + i, 14 - i, t.aLo); }
      g.set(1, 15, t.t); g.set(2, 15, t.tLo);
      // 날과 자루 이음 띠
      g.set(9, 7, t.t); g.set(10, 6, t.tHi); g.set(11, 7, t.tLo);
      // 막차 시계 (도끼 등, 23시 59분)
      g.ellipse(13, 8, 2.6, 2.6, t.t);
      g.ellipse(13, 8, 1.7, 1.7, t.g === 0 ? t.pLo : WHITE);
      g.set(13, 7, OUT); g.set(13, 8, OUT);
      if (t.g >= 2) { g.set(12, 6, t.tHi); g.set(11, 7, t.tHi); }
      if (t.g === 3) { g.set(10, 3, t.G); g.set(11, 3, t.G); g.set(10, 2, t.GHi); }
      return { spark: [[3, 6], [14, 5]], grip: [3, 13] };
    },
    /** 사흘째 같은 셔츠: 구겨진 셔츠 + 풀린 남색 넥타이(형광 사선) + 커피 얼룩 */
    armor(g, t, k) {
      stamp(g, [
        "................",
        ".....PWW..WWP...",
        "...PPPWWKKWWPP..",
        "..PPPPPWKKWPPPP.",
        ".PPPPPPPKKPPPPPP",
        ".PPPPpPPPPPPPPpP",
        ".PPP.PPPPPPPP.pP",
        ".PPp.PPPPPPPP.pP",
        ".ppp.PPPPPPpP.pp",
        ".TTT.PPPPpPPP.TT",
        ".....PPPPPPPpP..",
        ".....PPpPPPPPP..",
        ".....PPPPPPPPP..",
        ".....PPPPPPPPPp.",
        ".....pPPP.pPPpp.",
        "................",
      ], k);
      if (t.g === 0) g.recolor((x, y) => (g.get(x, y) >>> 8) === WHITE, t.p);
      for (const [x, y] of [[6, 6], [7, 7], [11, 10], [12, 11], [6, 11], [7, 12]] as const) g.set(x, y, t.pLo);
      // 풀린 넥타이 (비뚤게)
      stamp(g, ["HM", "MA", "AM", "MMA", ".AM", ".MA", ".mm"], k, 7, 4);
      // 주머니 + (대리+) 형광펜
      g.hline(11, 13, 6, t.pLo);
      if (t.g >= 1) { g.set(12, 5, t.a); g.set(12, 4, t.aHi); }
      // 커피 얼룩 (사원은 더 많다)
      g.set(10, 9, t.x); g.set(11, 9, t.xLo); g.set(10, 10, t.x);
      if (t.g === 0) { g.set(6, 13, t.x); g.set(13, 8, t.xLo); g.set(2, 6, t.x); }
      // 단추 (대리+)
      if (t.g >= 1) for (const y of [11, 13]) g.set(9, y, t.g >= 2 ? t.t : t.pLo);
      // 깃 끝·넥타이핀·커프스
      if (t.g >= 2) { g.set(5, 1, t.t); g.set(12, 1, t.t); g.set(7, 8, t.t); g.set(8, 8, t.tHi); g.set(9, 8, t.t); g.hline(1, 3, 9, t.t); g.hline(14, 15, 9, t.t); }
      if (t.g === 3) { g.set(2, 9, t.G); g.set(15, 9, t.G); g.set(5, 1, t.tHi); g.set(12, 1, t.tHi); }
      return { spark: [[8, 8], [2, 9]] };
    },
    /** 충혈된 눈 고글: 남색 끈 + 핏발 선 눈알 렌즈 (과장+ 형광 홍채) */
    head(g, t) {
      g.rect(0, 6, 16, 3, t.m);
      g.hline(0, 15, 6, t.mHi);
      g.hline(0, 15, 8, t.mLo);
      if (t.g >= 1) for (let x = 0; x < 16; x += 3) g.set(x, 7, t.a);
      for (const cx of [4.5, 11.5]) {
        g.ellipse(cx, 7.5, 3.9, 3.9, t.t);
        g.ellipse(cx, 7.5, 2.9, 2.9, t.g === 0 ? 0xe8e2d8 : WHITE);
      }
      g.set(3, 4, t.tHi); g.set(10, 4, t.tHi);
      for (const [ex, flip] of [[4, 0], [11, 1]] as const) {
        const iris = t.g >= 2 ? t.a : t.g === 1 ? t.m : 0x5a5450;
        g.rect(ex, 7, 2, 2, iris);
        g.set(ex + (flip ? 0 : 1), 7, OUT);
        g.set(ex - 2, 6, t.e); g.set(ex - 1, 7, t.e); g.set(ex + 3, 9, t.e); g.set(ex + 2, 9, t.e);
        g.set(ex - 1, 9, t.e); g.set(ex + 3, 6, mix(t.e, WHITE, 0.4));
      }
      g.rect(7, 8, 2, 2, t.tLo);
      if (t.g === 3) { g.set(7, 5, t.G); g.set(8, 5, t.G); g.set(7, 4, t.GHi); g.set(8, 4, t.G); }
      return { spark: [[2, 5], [13, 10]] };
    },
    /** 에너지 드링크 반지: 반지 위에 작은 캔 (번개 무늬) */
    acc1(g, t, k) {
      g.ellipse(8, 11.5, 5, 3.6, t.t);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (((x + 0.5 - 8) / 3.2) ** 2 + ((y + 0.5 - 11.5) / 1.9) ** 2 <= 1) g.px[y * 16 + x] = 0;
      g.set(4, 10, t.tHi); g.set(5, 9, t.tHi);
      g.hline(5, 11, 14, t.tLo);
      stamp(g, [
        ".sZZs.",
        "ZSSSSs",
        "AABAAa",
        "AMMMAa",
        "AAMMAa",
        "AMMAAa",
        "AAAAAa",
        ".sSSs.",
      ], k, 5, 1);
      const bolt = t.g >= 1 ? t.aHi : t.p;
      g.set(8, 4, bolt); g.set(7, 5, bolt); g.set(8, 5, bolt); g.set(7, 6, bolt);
      if (t.g >= 2) { g.hline(6, 9, 1, t.t); g.set(7, 1, t.tHi); g.hline(5, 10, 8, t.t); }
      if (t.g === 3) { g.set(7, 15, t.G); g.set(8, 15, t.G); g.set(8, 14, t.GHi); }
      return { spark: [[6, 2], [12, 12]] };
    },
    /** 빈 커피 컵 목걸이: 줄 + 종이컵 펜던트 (뚜껑·남색 슬리브에 형광 번개) */
    acc2(g, t, k) {
      const chain = t.g === 0 ? t.mLo : t.t;
      const chainHi = t.g >= 2 ? t.tHi : chain;
      for (let i = 0; i < 5; i++) {
        g.set(1 + i, i, i % 2 ? chain : chainHi);
        g.set(14 - i, i, i % 2 ? chain : chainHi);
      }
      g.set(6, 4, chain); g.set(9, 4, chain); g.set(7, 4, chainHi); g.set(8, 4, chain);
      stamp(g, [
        "..pPPp..",
        ".PPPPPPp",
        ".pppppp.",
        ".PPPPPp.",
        ".MMBMMm.",
        ".MBMMMm.",
        "..MMMm..",
        "..PPPp..",
        "..PPpp..",
      ], k, 4, 5);
      if (t.g === 0) g.recolor((x, y) => y >= 9 && y <= 11 && (g.get(x, y) >>> 8) !== 0, t.mLo);
      if (t.g >= 2) g.hline(5, 10, 8, t.t);
      if (t.g === 3) { g.set(7, 13, t.G); g.set(8, 13, t.GHi); }
      return { spark: [[5, 7], [10, 13]] };
    },
  },
  approval: {
    /** 반려 도장 창: 붉은 옻칠 자루 + 'X' 새긴 붉은 도장 + 쇠 창날 + 술 */
    weapon(g, t) {
      // 자루
      for (let i = 0; i < 10; i++) {
        g.set(2 + i, 14 - i, t.m);
        g.set(3 + i, 14 - i, t.mLo);
      }
      for (const i of [2, 6]) if (t.g >= 1) { g.set(2 + i, 14 - i, t.tHi); g.set(3 + i, 14 - i, t.t); }
      // 창날
      const S = t.g >= 2 ? 0xd8e0ea : 0xa8b0bc, Sh = WHITE, Sl = t.g >= 2 ? 0x8a94a4 : 0x6a7280;
      for (let i = 0; i < 4; i++) { g.set(11 + i, 4 - i, S); g.set(12 + i, 4 - i, Sl); g.set(11 + i, 3 - i, Sh); }
      g.set(15, 0, Sh); g.set(12, 4, Sl);
      // 도장 (붉은 원판에 상아색 X)
      g.ellipse(9.5, 6.5, 4.2, 4.2, t.t);
      g.ellipse(9.5, 6.5, 3.5, 3.5, t.m);
      const ink = t.g === 0 ? t.pLo : t.p;
      for (let i = 0; i < 5; i++) { g.set(7 + i, 4 + i, ink); g.set(11 - i, 4 + i, ink); }
      if (t.g === 3) g.set(9, 6, t.G);
      // 술 (자루 끝)
      g.set(1, 14, t.t); g.set(1, 15, t.m); g.set(0, 15, t.mLo); g.set(2, 15, t.mHi);
      return { spark: [[15, 0], [7, 4]], grip: [4, 12] };
    },
    /** 결재판 흉갑: 검은 가죽 결재판 + 상아 서류 + 결재 칸 (직급마다 찍힌 도장이 늘어난다) */
    armor(g, t, k) {
      stamp(g, [
        "................",
        "................",
        ".TTt.UTtTU.tTT..",
        "TttTXxTttTxXTttT",
        "TTTXppppppppppXU",
        ".UXXpPPpPPpPPpX.",
        "..XXpPPpPPpPPpX.",
        "..XXppppppppppX.",
        "..XXPPPPPPPPPPX.",
        "..XXPppppPPPPPXx",
        "..XXPPPPPPPPPPXx",
        "..XXPpppppppPPXx",
        "..xXPPPPPPPPPPXx",
        "...xXXXXXXXXXXx.",
        "....xxxxxxxxxx..",
        "................",
      ], k);
      // 결재 칸 3개에 도장 (직급마다 하나씩 늘어난다: 사원 1 · 대리 2 · 과장 3 · 임원 3 + 금 도장)
      const stamps = Math.min(3, t.g + 1);
      [5, 8, 11].forEach((x, i) => {
        if (i >= stamps) return;
        const gold = t.g === 3 && i === 2;
        g.set(x, 5, gold ? GOLD.hi : t.mHi); g.set(x + 1, 5, gold ? GOLD.c : t.m);
        g.set(x, 6, gold ? GOLD.c : t.m); g.set(x + 1, 6, gold ? GOLD.lo : t.mLo);
      });
      if (t.g === 3) g.set(12, 6, t.G);
      // 집게
      g.rect(6, 2, 4, 2, t.t); g.set(7, 2, t.tHi);
      return { spark: [[2, 3], [11, 5]] };
    },
    /** 돋보기 안경: 작은 알 + 큰 돋보기 알 (눈이 커 보인다) + (과장+) 안경줄 */
    head(g, t) {
      const frame = t.g === 0 ? 0x6a5a50 : t.g === 1 ? t.m : t.t;
      const frameLo = t.g === 0 ? 0x4a3e38 : t.g === 1 ? t.mLo : t.tLo;
      const lens = t.g === 0 ? 0xd8dcd8 : 0xe8f4fa;
      // 다리
      g.hline(0, 2, 6, frameLo); g.hline(14, 15, 6, frameLo);
      // 작은 알
      g.ellipse(4, 7, 2.9, 2.9, frame);
      g.ellipse(4, 7, 1.9, 1.9, lens);
      g.set(4, 7, OUT);
      // 큰 돋보기 알
      g.ellipse(10.5, 7.5, 4.5, 4.5, frame);
      g.ellipse(10.5, 7.5, 3.4, 3.4, lens);
      g.rect(10, 7, 2, 2, OUT); g.rect(9, 6, 4, 4, OUT);
      g.set(9, 6, lens); g.set(12, 6, lens); g.set(9, 9, lens); g.set(12, 9, lens);
      g.set(10, 6, WHITE);
      g.set(9, 5, WHITE); g.set(8, 6, WHITE);
      g.set(6, 6, frame);
      g.set(13, 4, t.g >= 2 ? t.tHi : mix(frame, WHITE, 0.4));
      // 안경줄
      if (t.g >= 2) {
        for (const [x, y] of [[0, 8], [0, 10], [1, 12], [3, 13], [5, 14], [7, 14], [9, 14], [11, 14], [13, 13], [14, 12], [15, 10], [15, 8]] as const) g.set(x, y, t.t);
        for (const [x, y] of [[0, 9], [0, 11], [2, 13], [4, 14], [6, 14], [8, 14], [10, 14], [12, 14], [14, 13], [15, 11], [15, 9]] as const) g.set(x, y, t.tLo);
      }
      if (t.g === 3) { g.set(10, 3, t.G); g.set(11, 3, t.G); g.set(10, 12, t.G); }
      return { spark: [[13, 4], [3, 5]] };
    },
    /** 만년필 브로치: 붉은 로제트 위에 위로 선 펜촉 (갈라진 틈 + 숨구멍) */
    acc1(g, t, k) {
      const nib = t.g <= 1 ? 0xb8c0cc : t.t, nibHi = t.g <= 1 ? 0xeef2f8 : t.tHi, nibLo = t.g <= 1 ? 0x6a7280 : t.tLo;
      // 로제트 (톱니 원) + 리본 꼬리
      g.rect(4, 11, 2, 5, t.m); g.rect(10, 11, 2, 5, t.mLo); g.set(4, 15, t.mLo); g.set(11, 15, t.mLo);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.ellipse(8 + Math.cos(a) * 4.7, 7.5 + Math.sin(a) * 4.7, 1.3, 1.3, i % 2 ? t.mLo : t.m);
      }
      g.ellipse(8, 7.5, 4.7, 4.7, t.m);
      g.ellipse(8, 7.5, 3.7, 3.7, t.g === 0 ? t.mLo : t.a);
      g.ellipse(8, 7.5, 2.9, 2.9, t.mLo);
      // 펜촉
      stamp(g, [
        "..KK..",
        ".lNNn.",
        ".lNKn.",
        "lNNKNn",
        "lNNKNn",
        "lNKKNn",
        "lNNNNn",
        ".nnnn.",
      ], { ...k, N: nib, l: nibHi, n: nibLo }, 5, 3);
      g.set(7, 3, nibHi); g.set(8, 3, nib);
      if (t.g === 3) { g.set(7, 13, t.G); g.set(8, 13, t.G); g.set(7, 12, t.GHi); }
      return { spark: [[7, 2], [12, 5]] };
    },
    /** 사장실 출입증: 붉은 목줄 + 상아색 카드 (빨간 머리띠·사진·금 칩) */
    acc2(g, t, k) {
      for (let i = 0; i < 5; i++) { g.set(2 + i, i, t.m); g.set(13 - i, i, t.mLo); g.set(3 + i, i, t.mHi); g.set(12 - i, i, t.m); }
      g.rect(7, 4, 2, 2, t.t); g.set(7, 4, t.tHi);
      stamp(g, [
        "PPPPPPPPPP",
        "MHMMMMMMMm",
        "MMMMaMMMMm",
        "PPPPPPPPPp",
        "PppPPKKKPp",
        "PpKpPPPPPp",
        "PpKpPKKPPp",
        "PKKKPPPPPp",
        "PPPPPTTPPp",
        "pppppppppp",
      ], k, 3, 6);
      if (t.g === 0) g.recolor((x, y) => y >= 7 && y <= 8, 0x9a7a78);
      g.set(7, 8, t.g === 0 ? t.pLo : t.a); g.set(8, 8, t.g === 0 ? t.pLo : t.aHi);
      if (t.g >= 2) { g.set(8, 14, t.tHi); g.rect(4, 6, 8, 1, t.t); g.set(5, 6, t.tHi); }
      if (t.g === 3) { g.set(11, 13, t.G); g.set(11, 12, t.GHi); }
      return { spark: [[4, 7], [11, 13]] };
    },
  },
  meeting: {
    /** 끝나지 않는 PPT 마법서: 펼친 버건디 마법서 위로 떠오른 슬라이드 화면 (뒤로 끝없이 겹친 장들) */
    weapon(g, t, k) {
      // 뒤로 끝없이 날아가는 슬라이드 (작은 장들)
      const pg = t.g === 0 ? t.pLo : t.p;
      g.rect(12, 0, 3, 2, pg); g.hline(12, 14, 0, t.g === 0 ? t.pLo : t.a);
      g.rect(13, 3, 3, 2, pg); g.hline(13, 15, 3, t.g === 0 ? t.pLo : t.a);
      // 떠오른 슬라이드 (화면 + 막대그래프)
      g.rect(1, 1, 11, 7, t.g === 0 ? t.pLo : t.aLo);
      g.rect(2, 2, 9, 5, t.L);
      g.hline(2, 10, 2, t.g === 0 ? t.pLo : t.a);
      const bar = t.g === 0 ? 0x8a8478 : t.aLo;
      g.vline(4, 5, 6, bar); g.vline(6, 4, 6, t.g >= 1 ? t.m : bar); g.vline(8, 3, 6, bar);
      // 책에서 화면으로 올라가는 빛
      if (t.g >= 1) for (let x = 3; x <= 10; x++) g.set(x, 8, t.L, 110);
      // 펼친 책
      stamp(g, [
        ".PPPPPP..PPPPPP.",
        "PPppppPKKPppppPP",
        "PPPPPPPKKPPPPPPP",
        "PPpppPPKKPPpppPP",
        "MPPPPPPKKPPPPPPM",
        "MMMMMMMMMMMMMMMm",
        ".mmmmmmmmmmmmmm.",
      ], k, 0, 9);
      if (t.g >= 2) { g.set(0, 12, t.t); g.set(15, 12, t.t); g.set(1, 14, t.t); g.set(14, 14, t.t); g.set(0, 13, t.tHi); g.set(15, 13, t.tLo); }
      if (t.g === 3) { g.set(7, 14, t.G); g.set(8, 14, t.G); g.set(7, 13, t.GHi); }
      // 책갈피
      g.set(11, 15, t.g === 0 ? t.pLo : t.a);
      return { spark: [[14, 1], [2, 10]], grip: [0, 12] };
    },
    /** 회의실 커튼 로브: 어깨 위 커튼 봉·고리 + 넓은 소매 + 주름 진 버건디 천 + 파란 끈, 밑단에 프로젝터 빛 */
    armor(g, t) {
      // 봉 + 고리
      g.hline(1, 14, 1, t.t);
      g.hline(2, 13, 1, t.tHi);
      g.set(0, 1, t.G); g.set(15, 1, t.G);
      for (let x = 3; x <= 12; x += 3) { g.set(x, 2, t.tLo); g.set(x + 1, 2, t.t); }
      // 몸판 (아래로 퍼짐, 주름)
      for (let y = 3; y <= 15; y++) {
        const hw = 4.5 + (y - 3) * 0.13;
        for (let x = Math.ceil(7.5 - hw); x <= Math.floor(7.5 + hw); x++) {
          const ph = (x + 30) % 3;
          g.set(x, y, ph === 0 ? t.mLo : ph === 1 ? t.mHi : t.m);
        }
      }
      // 넓은 소매
      for (let y = 4; y <= 11; y++) {
        const w = 1 + Math.floor((y - 4) * 0.36);
        for (let i = 1; i <= w; i++) { g.set(3 - i, y, i === w ? t.mHi : t.m); g.set(12 + i, y, i === w ? t.mLo : t.m); }
      }
      g.vline(3, 5, 11, t.mLo); g.vline(12, 5, 11, t.mLo);
      const cuff = t.g === 0 ? t.mLo : t.t;
      for (let x = 0; x <= 2; x++) g.set(x, 11, cuff);
      for (let x = 13; x <= 15; x++) g.set(x, 11, t.g === 0 ? t.mLo : t.tLo);
      // 목 트임
      g.set(7, 3, OUT); g.set(8, 3, OUT); g.set(7, 4, OUT); g.set(8, 4, t.mLo); g.set(7, 5, t.mLo);
      // 밑단 (프로젝터 빛이 비친다)
      if (t.g >= 1) for (let x = 0; x < 16; x++) if (g.filled(x, 15)) g.set(x, 15, x % 2 ? t.a : t.aLo);
      // 허리끈 + 술
      const rope = t.g === 0 ? t.mLo : t.g === 1 ? t.a : t.t;
      const ropeHi = t.g === 0 ? t.m : t.g === 1 ? t.aHi : t.tHi;
      g.hline(4, 11, 9, rope);
      for (let x = 4; x <= 11; x += 2) g.set(x, 9, ropeHi);
      g.vline(10, 10, 12, rope); g.set(10, 13, ropeHi); g.set(9, 13, rope); g.set(11, 13, rope);
      if (t.g === 3) { g.set(10, 9, t.G); g.set(10, 10, t.GHi); }
      return { spark: [[0, 0], [10, 9]] };
    },
    /** 프로젝터 왕관: 벨벳 왕관 + 띠 가운데 프로젝터 렌즈 (사원급은 판지 왕관) */
    head(g, t, k) {
      const card = t.g === 0;
      const kk = { ...k, T: card ? 0xa8a090 : t.t, t: card ? 0xccc4b0 : t.tHi, U: card ? 0x787060 : t.tLo, G: t.g === 3 ? t.G : card ? 0xa8a090 : t.tHi, g: t.g === 3 ? t.GHi : card ? 0xccc4b0 : WHITE };
      // 빛줄기 (렌즈 위로)
      if (t.g >= 2) for (let y = 0; y <= 7; y++) { const hw = (7 - y) * 0.45 + 0.5; for (let x = Math.ceil(8 - hw); x <= Math.floor(7 + hw); x++) g.set(x, y, t.L, 30 + y * 6); }
      stamp(g, [
        "................",
        ".......gG.......",
        ".......TT.......",
        ".gG...tTTU...Gg.",
        ".tT..tTMMTU..TU.",
        ".tTTtTMHMMMTUTU.",
        ".tTMMMHMMMMMMTU.",
        ".tTMHMMMMMMMmTU.",
        ".tMMMMMMMMMmmmU.",
        "ttTTTTTTTTTTTTUU",
        "tTGTTTTTTTTTGTTU",
        "UUUUUUUUUUUUUUUU",
      ], kk, 0, 1);
      // 렌즈
      g.ellipse(8, 10.5, 2.7, 2.7, t.x);
      g.ellipse(8, 10.5, 1.7, 1.7, t.L);
      g.set(7, 10, t.LHi);
      return { spark: [[8, 1], [2, 3]] };
    },
    /** 레이저 포인터 귀걸이: 고리에 비스듬히 매달린 숯색 포인터 + 빨간 레이저와 점 */
    acc1(g, t) {
      // 고리
      g.ellipse(3.5, 3.5, 2.8, 2.8, t.t);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (((x + 0.5 - 3.5) / 1.5) ** 2 + ((y + 0.5 - 3.5) / 1.5) ** 2 <= 1) g.px[y * 16 + x] = 0;
      g.set(2, 1, t.tHi); g.set(1, 2, t.tHi);
      g.set(6, 6, t.t);
      // 포인터 몸통 (비스듬히, 3칸 두께)
      for (let i = 0; i < 6; i++) {
        g.set(6 + i, 7 + i, mix(t.x, WHITE, 0.3));
        g.set(7 + i, 7 + i, t.x);
        g.set(7 + i, 8 + i, t.x);
        g.set(8 + i, 7 + i, t.xLo);
        if (i > 0) g.set(6 + i, 8 + i, t.xLo);
      }
      g.set(6, 7, t.t); g.set(7, 7, t.tHi); g.set(7, 8, t.t); g.set(8, 7, t.tLo);
      g.set(9, 10, t.e); g.set(10, 10, t.g === 0 ? t.pLo : t.a);
      g.set(12, 12, t.t); g.set(13, 12, t.tLo); g.set(12, 13, t.tLo);
      // 빨간 빛
      g.set(13, 13, t.e);
      g.set(14, 14, t.e, 220);
      g.ellipse(15, 15, 1.6, 1.6, t.e, 110);
      g.set(15, 15, lighten(t.e, 0.6));
      if (t.g === 3) { g.set(9, 9, t.G); g.set(8, 9, t.GHi); }
      return { spark: [[2, 1], [11, 9]] };
    },
    /** 회의록 수첩: 스프링 + 파란 표지 + 라벨 + 버건디 고무줄·책갈피 */
    acc2(g, t) {
      const cover = t.g === 0 ? t.aLo : t.aLo, coverHi = t.a;
      g.rect(3, 2, 10, 13, cover);
      g.vline(3, 2, 14, coverHi);
      g.hline(3, 12, 14, darken(cover, 0.3));
      g.vline(13, 3, 14, t.p); g.vline(14, 4, 14, t.pLo);
      // 라벨
      g.rect(5, 5, 6, 4, t.p);
      g.hline(6, 9, 6, t.pLo); g.hline(6, 8, 7, t.pLo);
      // 고무줄
      g.vline(11, 2, 14, t.m); g.set(11, 9, t.mHi);
      // 스프링
      for (let x = 4; x <= 12; x += 2) { g.set(x, 1, t.t); g.set(x, 2, t.tLo); }
      // 책갈피
      g.set(6, 15, t.m);
      if (t.g >= 1) { g.vline(12, 0, 4, t.e); g.set(12, 0, t.t); }
      if (t.g >= 2) { g.set(3, 2, t.t); g.set(3, 14, t.t); g.set(12, 14, t.t); }
      if (t.g === 3) { g.set(8, 11, t.G); g.set(8, 12, t.GHi); }
      return { spark: [[4, 1], [10, 12]] };
    },
  },
  trip: {
    /** 기내용 캐리어 대포: 주황 하드 캐리어 + 남색 포신 + 늘린 손잡이 + 수하물 꼬리표 */
    weapon(g, t, k) {
      // 손잡이 (늘린 막대)
      g.vline(3, 1, 5, 0x9aa2ae); g.vline(6, 1, 5, 0x6a7280);
      g.hline(3, 6, 1, t.g >= 2 ? t.t : 0x3a3f4a); g.set(4, 0, 0x3a3f4a); g.set(5, 0, 0x3a3f4a);
      // 포신 (굵게)
      for (let i = 0; i < 6; i++) {
        g.set(8 + i, 7 - i, t.aHi);
        g.set(8 + i, 8 - i, t.a);
        g.set(9 + i, 8 - i, t.a);
        g.set(9 + i, 9 - i, t.aLo);
        g.set(10 + i, 9 - i, t.aLo);
      }
      // 포구 테
      g.set(12, 0, t.tHi); g.set(13, 0, t.t); g.set(15, 2, t.t); g.set(15, 3, t.tLo); g.set(12, 1, t.t);
      g.set(14, 1, OUT); g.set(14, 2, OUT); g.set(13, 1, OUT); g.set(15, 1, t.tHi); g.set(14, 3, t.tLo); g.set(14, 0, t.t);
      // 캐리어
      stamp(g, [
        "HHHHHHHM",
        "HMMHMMMm",
        "HMmHMmMm",
        "HMmHMmMm",
        "HMmHMmMm",
        "HMmHMmMm",
        "HMmHMmMm",
        "HMmHMmMm",
        "mmmmmmmm",
      ], k, 1, 6);
      // 모서리 보호대·바퀴
      g.set(1, 6, t.a); g.set(8, 6, t.a); g.set(1, 14, t.a); g.set(8, 14, t.a);
      g.set(2, 15, 0x3a3f4a); g.set(7, 15, 0x3a3f4a);
      // 포신 받침 띠
      g.set(8, 7, t.t); g.set(9, 8, t.tLo);
      // 꼬리표
      g.set(2, 4, t.x); g.set(1, 5, t.x); g.set(2, 5, t.xLo); g.set(1, 4, t.g >= 1 ? WHITE : t.pLo);
      // 흰 줄 (항공사)
      g.hline(1, 8, 10, t.g === 0 ? t.pLo : t.p);
      if (t.g === 3) { g.set(4, 10, t.G); g.set(5, 10, t.GHi); g.hline(1, 8, 6, t.t); }
      if (t.g === 2) g.hline(2, 7, 6, t.t);
      return { spark: [[14, 1], [6, 8]], grip: [1, 9] };
    },
    /** 경량 패딩: 가로 퀼팅 주황 패딩 + 남색 깃·지퍼 + 흰 띠 */
    armor(g, t) {
      for (let y = 2; y <= 14; y++) {
        const hw = y < 4 ? 5 : 6.5;
        for (let x = Math.ceil(7.5 - hw); x <= Math.floor(7.5 + hw); x++) g.set(x, y, t.m);
      }
      // 소매
      for (let y = 4; y <= 12; y++) { g.set(0, y, t.m); g.set(15, y, t.mLo); }
      // 퀼팅 (두 줄마다 오목 선 + 볼록 빛)
      for (let y = 4; y <= 14; y += 3) for (let x = 0; x < 16; x++) if (g.filled(x, y)) g.set(x, y, t.mLo);
      for (let y = 5; y <= 14; y += 3) for (let x = 0; x < 16; x++) if (g.filled(x, y) && x % 5 !== 4) g.set(x, y, t.mHi);
      // 깃
      g.rect(4, 1, 8, 2, t.a); g.hline(5, 10, 1, t.aHi);
      g.set(7, 2, OUT); g.set(8, 2, OUT);
      // 지퍼
      g.vline(8, 3, 14, t.g === 0 ? t.aLo : t.t);
      g.set(8, 4, t.g >= 2 ? t.tHi : t.aHi); g.set(8, 5, t.g >= 2 ? t.tHi : t.aHi);
      // 흰 띠 + 비행기 표시
      g.hline(0, 15, 7, t.g === 0 ? t.pLo : t.p);
      g.vline(8, 7, 7, t.g === 0 ? t.aLo : t.t);
      if (t.g >= 1) { g.set(4, 7, t.a); g.set(3, 7, t.a); g.set(4, 6, t.a); g.set(4, 8, t.a); }
      g.set(15, 7, t.pLo);
      if (t.g === 3) { g.set(11, 4, t.G); g.set(11, 3, t.GHi); }
      return { spark: [[2, 5], [12, 11]] };
    },
    /** 목베개 투구: 머리에 거꾸로 쓴 U자 목베개 + 이마를 가로지르는 남색 안대 (감은 눈 수) */
    head(g, t, k) {
      stamp(g, [
        "................",
        ".....HHHHMM.....",
        "...HHHMMMMMMm...",
        "..HHMMMMMMMMMm..",
        ".HMMMmmmmmmmMMm.",
        ".HMMm......mMMm.",
        "HHMm........mMMm",
        "AAAAAAAAAAAAAAAA",
        "ABAAAAAAAAAAAABa",
        "aaaaaaaaaaaaaaaa",
        "HMMm........mMMm",
        "HMMm........mMMm",
        "HMMm........mMMm",
        ".MMm........mMm.",
        ".TTU........TTU.",
        "................",
      ], k);
      // 바느질 점선
      for (const [x, y] of [[2, 4], [4, 2], [7, 1], [10, 1], [12, 2], [14, 5], [1, 11], [14, 11]] as const) g.set(x, y, t.g === 0 ? t.mHi : t.p);
      // 감은 눈 수
      const thread = t.g === 0 ? t.pLo : WHITE;
      for (const ex of [4, 10]) { g.set(ex, 7, thread); g.set(ex + 1, 8, thread); g.set(ex + 2, 8, thread); g.set(ex + 3, 7, thread); }
      if (t.g >= 2) { g.rect(7, 0, 2, 2, t.t); g.set(7, 0, t.tHi); }
      if (t.g === 3) { g.set(7, 1, t.G); g.set(8, 1, t.GHi); g.set(5, 0, t.t); g.set(10, 0, t.t); g.set(6, 0, t.tHi); g.set(9, 0, t.tHi); }
      return { spark: [[3, 2], [13, 9]] };
    },
    /** 마일리지 카드: 남색 카드 + 주황 띠 + 흰 비행기 + 칩 */
    acc1(g, t) {
      g.rect(1, 4, 14, 9, t.a);
      g.hline(1, 14, 4, t.aHi);
      g.vline(1, 4, 12, t.aHi);
      g.rect(1, 10, 14, 2, t.m); g.hline(1, 14, 11, t.mLo);
      // 비행기
      const pl = t.g === 0 ? t.pLo : WHITE;
      g.hline(3, 7, 7, pl); g.set(5, 6, pl); g.set(5, 8, pl); g.set(4, 5, pl); g.set(4, 9, pl); g.set(3, 6, pl); g.set(8, 7, pl);
      // 칩
      g.rect(10, 6, 3, 2, t.t); g.set(10, 6, t.tHi); g.set(11, 7, t.tLo);
      if (t.g >= 2) { g.hline(2, 14, 12, t.t); }
      if (t.g === 3) { g.set(13, 5, t.G); g.set(13, 4, t.GHi); g.hline(2, 13, 4, GOLD.hi); }
      return { spark: [[13, 4], [2, 11]] };
    },
    /** 면세점 영수증: 길게 늘어진 영수증 (주황 머리글·금액 줄·바코드) + 아래로 말린 끝 */
    acc2(g, t) {
      const ink = t.g === 0 ? 0x9a9a98 : 0x8a92a4;
      g.rect(4, 1, 8, 12, t.p);
      g.vline(11, 1, 12, t.pLo);
      g.hline(4, 11, 0, t.pLo);
      // 머리글
      g.rect(5, 2, 6, 2, t.m); g.hline(5, 10, 2, t.mHi);
      // 글줄 + 금액 (왼쪽 품목, 오른쪽 값)
      for (const [y, w] of [[5, 2], [6, 3], [7, 2], [8, 3]] as const) { g.hline(5, 4 + w, y, ink); g.set(10, y, ink); g.set(9, y, y % 2 ? ink : t.p); }
      for (let x = 5; x <= 10; x += 2) g.set(x, 9, t.pLo);
      g.hline(5, 10, 10, t.a); g.set(10, 10, t.aLo);
      // 바코드
      for (let x = 5; x <= 10; x++) g.set(x, 12, x === 6 || x === 9 ? t.pLo : 0x3a3e48);
      // 말린 끝
      g.ellipse(8, 13.5, 4.2, 2.1, t.pLo);
      g.hline(5, 11, 13, t.p);
      g.set(4, 13, t.p); g.set(7, 14, ink); g.set(8, 14, t.pLo);
      // 집게 (대리+)
      if (t.g >= 1) { g.rect(3, 1, 2, 3, t.t); g.set(3, 1, t.tHi); }
      if (t.g === 3) { g.set(10, 6, t.G); g.set(10, 5, t.GHi); }
      if (t.g >= 1) { g.set(9, 6, t.x); g.set(10, 7, t.x); g.set(9, 7, t.xLo); }
      return { spark: [[12, 2], [4, 13]] };
    },
  },
};

// ── 마무리: 외곽선 · 빛 · 반짝임 ──

/** 외곽선 바깥 한 칸에 세트 빛을 반투명으로 (과장 은은하게, 임원 더 밝게·프레임마다 숨쉬기) */
function halo(g: Grid, c: Color, a: number, only?: Grid): void {
  const src = only ?? g;
  // 바깥과 이어진 빈칸에만 (반지 구멍·투구 안쪽은 비워 둔다)
  const outside = new Uint8Array(g.w * g.h);
  const stack: number[] = [];
  for (let x = 0; x < g.w; x++) stack.push(x, 0);
  for (let y = 0; y < g.h; y++) stack.push(0, y, g.w - 1, y);
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    if (x < 0 || y < 0 || x >= g.w || y >= g.h || outside[y * g.w + x] || g.filled(x, y)) continue;
    outside[y * g.w + x] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  const add: number[] = [];
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (g.filled(x, y) || !outside[y * g.w + x]) continue;
      if (src.filled(x - 1, y) || src.filled(x + 1, y) || src.filled(x, y - 1) || src.filled(x, y + 1)) add.push(x, y);
    }
  for (let i = 0; i < add.length; i += 2) g.set(add[i], add[i + 1], c, a);
}

/** 반짝임: 큰 별(십자 5칸 + 가운데 흰색) / 작은 점 */
function sparkle(g: Grid, x: number, y: number, big: boolean, c: Color): void {
  g.set(x, y, WHITE);
  if (!big) return;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const tx = x + dx, ty = y + dy;
    if (!g.filled(tx, ty) || (g.get(tx, ty) & 255) < 255) g.set(tx, ty, c);
    else g.set(tx, ty, lighten(c, 0.5));
  }
}

function finishFx(g: Grid, t: T, spark: [number, number][], frame: number, src?: Grid): void {
  if (t.g >= 2) halo(g, t.glow, t.g === 2 ? 60 : frame ? 140 : 95, src);
  if (t.g === 3) {
    const [a, b] = frame ? [spark[1], spark[0]] : [spark[0], spark[1]];
    sparkle(g, a[0], a[1], true, GOLD.hi);
    if (b) sparkle(g, b[0], b[1], false, GOLD.hi);
  }
}

function paintPiece(set: SetGearSet, piece: SetGearPiece, grade: SetGearGrade): { g: Grid; art: Art; t: T } {
  const t = tierPal(set, grade);
  const g = new Grid(16, 16);
  const art = ICON[set][piece](g, t, keyOf(t));
  return { g, art, t };
}

/** 인벤토리 아이콘 16×16 (frame 0·1 = 임원급 반짝임 두 장, 나머지 직급은 같다) */
export function setGearIconGrid(set: SetGearSet, piece: SetGearPiece, grade: SetGearGrade, frame = 0): Grid {
  const { g, art, t } = paintPiece(set, piece, grade);
  g.outline(OUT);
  finishFx(g, t, art.spark, frame);
  return g;
}

// ── 착용 미리보기 (기본 아바타 앞모습 + 세트 전체) ──

export const DOLL_W = 40;
export const DOLL_H = 32;
/** 아바타를 놓는 자리 (DOLL 안) */
const AX = 5;
const AY = 3;

type DollPainter = {
  /** 몸통 (아바타 좌표: 망토 y19~24 — y19·20 x6~13, y21·22 x5~14, y23·24 x4~15) */
  armor: (g: Grid, t: T, k: Record<string, Color>) => void;
  /** 머리 (두건 x5~14·y10~18, 얼굴 구멍 y14~18 x7~12, 눈 (8,16)·(11,16), 두건 꼭지 (13~15, 8~10)). 반짝임 자리를 돌려준다 */
  head: (g: Grid, t: T, k: Record<string, Color>) => [number, number];
  /** 장신구 두 개 (가슴·귀·왼손 자리) */
  acc: (g: Grid, t: T, k: Record<string, Color>) => void;
  /** 무기 쥔 손 위에 덧그리기 (반지 등, 손 왼쪽 위 기준) */
  hand?: (g: Grid, t: T, x: number, y: number) => void;
};

const DOLL: Record<SetGearSet, DollPainter> = {
  overtime: {
    armor(g, t, k) {
      stamp(g, [
        "..PWWKKWWP..",
        "..PPPMMPPP..",
        ".PPPPAMPPPP.",
        ".PPPPMAPPPP.",
        "PPPPPAMPPPPP",
        "PPPPPMAPPPPp",
        ".pp..mm..pp.",
      ], k, 4, 19);
      if (t.g === 0) g.recolor((x, y) => (g.get(x, y) >>> 8) === WHITE, t.p);
      g.set(13, 23, t.x); g.set(12, 22, t.xLo);
      if (t.g === 0) g.set(7, 24, t.x);
      if (t.g >= 2) { g.set(9, 22, t.t); g.set(10, 22, t.tHi); }
      if (t.g === 3) { g.set(4, 23, t.G); g.set(15, 23, t.G); g.set(6, 19, t.tHi); g.set(13, 19, t.tHi); }
    },
    head(g, t, k) {
      // 끈 + 남색 고글 (핏발 선 눈, 위 테에 직급 띠)
      g.hline(3, 16, 15, t.m); g.hline(3, 16, 16, t.mLo);
      stamp(g, [
        "MTTMMTTM",
        "MEWMMWEM",
        "MWIMMIWM",
        "mmmmmmmm",
      ], { ...k, I: t.g >= 2 ? t.a : t.g === 1 ? t.mHi : 0x5a5450, W: t.g === 0 ? 0xe8e2d8 : WHITE }, 6, 14);
      if (t.g >= 1) { g.set(4, 15, t.a); g.set(15, 15, t.a); }
      if (t.g === 3) { g.set(9, 14, t.G); g.set(10, 14, t.GHi); }
      return [7, 13];
    },
    acc(g, t) {
      // 빈 커피 컵 목걸이 (왼쪽 가슴)
      g.set(6, 21, t.g === 0 ? t.mLo : t.t);
      g.hline(5, 6, 22, OUT);
      g.hline(5, 6, 23, t.g === 0 ? t.mLo : t.m);
      g.hline(5, 6, 24, t.pLo);
    },
    hand(g, t, x, y) {
      // 에너지 드링크 반지 (손가락에 작은 캔)
      g.set(x, y, t.g === 0 ? 0x8a9a80 : t.a);
      g.set(x, y - 1, t.t);
    },
  },
  approval: {
    armor(g, t, k) {
      stamp(g, [
        ".TTt..XXXX..tTT.",
        "TtTTXXXXXXXXTTtU",
        ".UTXXXXPPPPXXTU.",
        "..XXXXXPPPPXXX..",
        ".XXXXXXPppPXXXX.",
        ".xXXXXXXXXXXXXx.",
        "..xxxxxxxxxxxx..",
      ], k, 2, 19);
      g.rect(9, 19, 2, 1, t.t);
      // 결재 칸 도장 (직급마다 늘어난다)
      const stamps = Math.min(3, t.g + 1);
      for (let i = 0; i < 3; i++) g.set(9 + i, 21, i < stamps ? (t.g === 3 && i === 2 ? GOLD.c : t.m) : t.pLo);
      g.set(10, 20, t.pLo);
    },
    head(g, t) {
      const frame = t.g === 0 ? 0x6a5a50 : t.t;
      const frameLo = t.g === 0 ? 0x4a3e38 : t.tLo;
      const lens = t.g === 0 ? 0xd8dcd8 : 0xe8f4fa;
      // 다리
      g.hline(4, 6, 15, frameLo); g.set(15, 15, frameLo);
      // 작은 알 (왼눈): 동그란 테
      for (const [x, y] of [[8, 15], [7, 16], [9, 16], [8, 17]] as const) g.set(x, y, frame);
      g.set(8, 16, lens);
      // 큰 돋보기 알 (오른눈, 눈이 크게)
      for (let x = 11; x <= 13; x++) { g.set(x, 14, frame); g.set(x, 18, frame); }
      for (let y = 15; y <= 17; y++) { g.set(10, y, frame); g.set(14, y, frame); }
      g.rect(11, 15, 3, 3, lens);
      g.rect(11, 16, 2, 2, OUT); g.set(11, 15, WHITE);
      g.set(13, 14, t.g >= 2 ? t.tHi : mix(frame, WHITE, 0.4));
      if (t.g >= 2) { g.vline(15, 16, 19, t.tLo); }
      if (t.g === 3) g.set(12, 14, t.G);
      return [14, 13];
    },
    acc(g, t) {
      // 사장실 출입증 (왼쪽 가슴, 붉은 목줄)
      g.set(7, 20, t.m); g.set(6, 21, t.m);
      g.rect(4, 22, 3, 3, t.p);
      g.hline(4, 6, 22, t.m);
      g.set(5, 24, t.g >= 1 ? t.t : t.pLo);
      if (t.g === 3) g.set(6, 24, t.G);
      // 만년필 브로치 (오른쪽 가슴)
      g.set(13, 21, t.m); g.set(13, 22, t.mLo); g.set(12, 21, t.mLo);
      g.set(13, 20, t.g <= 1 ? 0xc8d0dc : t.tHi);
    },
  },
  meeting: {
    armor(g, t) {
      // 긴 로브 (발까지)
      for (let y = 19; y <= 25; y++) {
        const hw = y < 21 ? 4 : y < 23 ? 5 : 6;
        for (let x = 10 - hw; x < 10 + hw; x++) {
          const ph = (x + 30) % 3;
          g.set(x, y, ph === 0 ? t.mLo : ph === 1 ? t.mHi : t.m);
        }
      }
      // 커튼 봉 (어깨) + 고리
      g.hline(3, 16, 19, t.t); g.hline(4, 15, 19, t.tHi);
      g.set(2, 19, t.G); g.set(17, 19, t.G);
      for (let x = 5; x <= 14; x += 3) g.set(x, 20, t.tLo);
      // 허리끈
      const rope = t.g === 0 ? t.mLo : t.g === 1 ? t.a : t.t;
      g.hline(5, 14, 22, rope); g.set(12, 23, rope); g.set(12, 24, rope);
      if (t.g >= 1) for (let x = 4; x < 16; x++) if (x % 2) g.set(x, 25, t.a);
      if (t.g === 3) g.set(12, 22, t.G);
    },
    head(g, t, k) {
      const card = t.g === 0;
      const kk = { ...k, T: card ? 0xa8a090 : t.t, t: card ? 0xccc4b0 : t.tHi, U: card ? 0x787060 : t.tLo, G: t.g === 3 ? t.G : card ? 0xa8a090 : t.tHi };
      stamp(g, [
        "....G..G..G....",
        "....T.tTU.T....",
        "...tTTTMMTTTU..",
        "...tMMMMMMmmU..",
        "...tTTTTTTTTU..",
        "...UUUUUUUUUU..",
      ], kk, 2, 6);
      g.set(9, 10, t.x); g.set(10, 10, t.x); g.set(9, 9, t.L); g.set(10, 9, t.LHi);
      return [9, 5];
    },
    acc(g, t) {
      // 레이저 포인터 귀걸이 (왼쪽 귀)
      g.set(4, 17, t.t); g.set(4, 18, t.x); g.set(4, 19, t.x); g.set(4, 20, t.e);
      // 회의록 수첩 (왼손)
      g.rect(0, 21, 4, 5, t.aLo); g.vline(0, 21, 25, t.a);
      g.rect(1, 22, 2, 1, t.p);
      g.vline(3, 21, 25, t.m);
      for (let x = 0; x <= 3; x += 2) g.set(x, 20, t.t);
      g.rect(4, 22, 1, 2, 0x8a8f9c);
    },
  },
  trip: {
    armor(g, t) {
      // 경량 패딩 (가로 퀼팅, 살짝 부푼 옆선)
      for (let y = 19; y <= 25; y++) {
        const hw = y < 21 ? 5 : y < 23 ? 6 : 7;
        for (let x = 10 - hw; x < 10 + hw; x++) g.set(x, y, t.m);
      }
      for (const y of [21, 23]) for (let x = 0; x < 20; x++) if (g.filled(x, y)) g.set(x, y, t.mLo);
      for (const y of [20, 22, 24]) for (let x = 0; x < 20; x++) if (g.filled(x, y) && x % 4 !== 3) g.set(x, y, t.mHi);
      for (let x = 0; x < 20; x++) if (g.filled(x, 25)) g.set(x, 25, t.mLo);
      // 깃 + 지퍼 + 흰 띠
      g.hline(6, 13, 19, t.a); g.hline(7, 12, 19, t.aHi);
      g.vline(10, 20, 25, t.g === 0 ? t.aLo : t.t);
      g.hline(4, 15, 22, t.g === 0 ? t.pLo : t.p); g.set(10, 22, t.g === 0 ? t.aLo : t.t);
      if (t.g >= 1) g.set(6, 22, t.a);
      if (t.g === 3) g.set(13, 20, t.G);
    },
    head(g, t) {
      // 머리에 거꾸로 쓴 U자 목베개
      for (let y = 6; y <= 19; y++)
        for (let x = 2; x <= 17; x++) {
          const o = ((x + 0.5 - 10) / 7.2) ** 2 + ((y + 0.5 - 15) / 8.2) ** 2;
          const i = ((x + 0.5 - 10) / 4.6) ** 2 + ((y + 0.5 - 16) / 6.4) ** 2;
          if (o <= 1 && i > 1) g.set(x, y, x > 13 ? t.mLo : x < 6 && y < 13 ? t.mHi : t.m);
        }
      for (const [x, y] of [[5, 10], [8, 8], [12, 8], [15, 10]] as const) g.set(x, y, t.g === 0 ? t.mHi : t.p);
      // 안대 띠 (이마)
      g.hline(4, 15, 12, t.a); g.hline(4, 15, 13, t.aLo);
      for (const ex of [6, 11]) { g.set(ex, 12, t.g === 0 ? t.pLo : WHITE); g.set(ex + 1, 13, t.g === 0 ? t.pLo : WHITE); g.set(ex + 2, 12, t.g === 0 ? t.pLo : WHITE); }
      if (t.g >= 2) { g.set(9, 6, t.t); g.set(10, 6, t.tHi); }
      if (t.g === 3) g.set(10, 7, t.G);
      return [10, 5];
    },
    acc(g, t) {
      // 마일리지 카드 (왼손)
      g.rect(0, 21, 5, 3, t.a); g.hline(0, 4, 23, t.m); g.set(3, 21, t.t); g.hline(0, 4, 21, t.aHi); g.set(3, 21, t.t);
      g.rect(4, 22, 1, 2, 0x8a8f9c);
      // 면세점 영수증 (주머니에서 늘어진다)
      g.vline(13, 23, 27, t.p); g.vline(14, 23, 26, t.pLo); g.set(13, 25, 0x8a92a4); g.set(13, 23, t.m);
    },
  },
};

/** 무기 쥐는 손 (아바타 좌표). 앞모습 기본 손 자리 = 몸 오른쪽 */
const HAND: [number, number] = [16, 21];

/**
 * 착용 미리보기 (DOLL_W×DOLL_H): 두건 아바타 앞모습에 갑옷·머리·장신구, 오른손에 무기.
 * frame 0·1 = 임원급 반짝임. color = 아바타 색 (기본: 장비가 잘 보이는 회색).
 */
export function setGearDollGrid(set: SetGearSet, grade: SetGearGrade, frame = 0, color = "#8a8f9c"): Grid {
  const t = tierPal(set, grade);
  const k = keyOf(t);
  const dp = DOLL[set];
  const out = new Grid(DOLL_W, DOLL_H);
  const gearMask = new Grid(DOLL_W, DOLL_H);

  const av = avatarFrameGrid("hood", "down", 0, color, []);
  out.draw(av, AX, AY);

  // 아바타 좌표에서 그린 덧그림을 외곽선 둘러 얹는다
  // soft = 외곽선은 바깥(빈칸)으로만 — 몸 위에 얹는 갑옷·작은 장신구가 지저분해지지 않게
  const layer = (paint: (g: Grid) => void, soft = false) => {
    const l = new Grid(AV_W, AV_H);
    paint(l);
    if (soft) {
      const o = new Grid(AV_W, AV_H);
      o.draw(l, 0, 0);
      o.outline(OUT);
      for (let y = 0; y < AV_H; y++)
        for (let x = 0; x < AV_W; x++) if (!l.filled(x, y) && o.filled(x, y) && !out.filled(AX + x, AY + y)) l.set(x, y, OUT);
    } else l.outline(OUT);
    out.draw(l, AX, AY);
    gearMask.draw(l, AX, AY);
  };
  layer((l) => dp.armor(l, t, k), true);
  layer((l) => dp.acc(l, t, k), true);
  let headSpark: [number, number] = [0, 0];
  layer((l) => { headSpark = dp.head(l, t, k); });

  // 무기: 아이콘 그림을 손잡이가 손에 오게
  const w = paintPiece(set, "weapon", grade);
  const grip = w.art.grip ?? [3, 12];
  w.g.outline(OUT);
  const wx = AX + HAND[0] - grip[0];
  const wy = AY + HAND[1] - grip[1];
  out.draw(w.g, wx, wy);
  gearMask.draw(w.g, wx, wy);
  // 손 (무기 손잡이를 감싼다)
  const hand = avatarFrameGrid("hood", "down", 0, color, []).get(10, 12) >>> 8;
  out.rect(AX + HAND[0], AY + HAND[1], 2, 2, hand);
  out.set(AX + HAND[0] + 1, AY + HAND[1] + 1, darken(hand, 0.25));
  dp.hand?.(out, t, AX + HAND[0], AY + HAND[1]);

  const spark: [number, number][] = [
    [wx + w.art.spark[0][0], wy + w.art.spark[0][1]],
    [AX + headSpark[0], AY + headSpark[1]],
  ];
  finishFx(out, t, spark, frame, gearMask);
  return out;
}

// ── 11/15 사냥 장비창 인형: 내 아바타 시트(look = 사냥터와 같은 huntLook 착용 목록)에 무기를 손에 든다 ──

export type HuntDollPiece = { set: SetGearSet; grade: SetGearGrade };
export type HuntDollOpts = {
  color: string;
  body?: string;
  /** 아바타 시트에 같이 그릴 착용 목록 (사냥터와 같은 huntLook 결과 — 입은 사냥 장비 sgw.·마을 꾸미기) */
  look?: readonly string[];
  armor?: HuntDollPiece | null;
  head?: HuntDollPiece | null;
  /** 낀 세트 장신구 (세트마다 그 세트 장신구 그림 한 벌 — 몸에서는 몇 픽셀이라 부위는 나누지 않는다) */
  accs?: HuntDollPiece[];
  /** 손에 든 무기: 세트 무기 또는 상점 무기 아이콘 그림 (손잡이 자리) */
  weapon?: HuntDollPiece | { grid: Grid; grip?: [number, number] } | null;
  /** 무기 강화 빛 (+10 푸른·+13 보랏·+15 금) */
  glow?: Color | null;
  frame?: number;
};

/** 사냥 장비창 인형 (DOLL_W×DOLL_H) */
export function huntDollGrid(o: HuntDollOpts): Grid {
  const body = o.body ?? "hood";
  const out = new Grid(DOLL_W, DOLL_H);
  const gearMask = new Grid(DOLL_W, DOLL_H);
  const av = avatarFrameGrid(body, "down", 0, o.color, o.look ?? []);
  out.draw(av, AX, AY);
  const layer = (paint: (g: Grid) => void, soft = false) => {
    const l = new Grid(AV_W, AV_H);
    paint(l);
    if (soft) {
      const ol = new Grid(AV_W, AV_H);
      ol.draw(l, 0, 0);
      ol.outline(OUT);
      for (let y = 0; y < AV_H; y++)
        for (let x = 0; x < AV_W; x++) if (!l.filled(x, y) && ol.filled(x, y) && !out.filled(AX + x, AY + y)) l.set(x, y, OUT);
    } else l.outline(OUT);
    out.draw(l, AX, AY);
    gearMask.draw(l, AX, AY);
  };
  const sparks: [number, number][] = [];
  let topT: T | null = null;
  const pal = (p: HuntDollPiece) => {
    const t = tierPal(p.set, p.grade);
    if (!topT || t.g > topT.g) topT = t;
    return t;
  };
  if (o.armor) {
    const t = pal(o.armor);
    layer((l) => DOLL[o.armor!.set].armor(l, t, keyOf(t)), true);
  }
  for (const a of o.accs ?? []) {
    const t = pal(a);
    layer((l) => DOLL[a.set].acc(l, t, keyOf(t)), true);
  }
  if (o.head) {
    const t = pal(o.head);
    layer((l) => {
      const sp = DOLL[o.head!.set].head(l, t, keyOf(t));
      sparks.push([AX + sp[0], AY + sp[1]]);
    });
  }
  const w = o.weapon;
  if (w) {
    let g: Grid;
    let grip: [number, number];
    let wt: T | null = null;
    if ("grid" in w) {
      g = new Grid(16, 16);
      g.draw(w.grid, 0, 0);
      grip = w.grip ?? [3, 12];
    } else {
      const pp = paintPiece(w.set, "weapon", w.grade);
      pal(w);
      wt = pp.t;
      g = pp.g;
      g.outline(OUT);
      grip = pp.art.grip ?? [3, 12];
      sparks.unshift([AX + HAND[0] - grip[0] + pp.art.spark[0][0], AY + HAND[1] - grip[1] + pp.art.spark[0][1]]);
    }
    const wx = AX + HAND[0] - grip[0];
    const wy = AY + HAND[1] - grip[1];
    if (o.glow) {
      // 강화 빛: 무기 둘레에 은은한 테
      const ring = new Grid(16, 16);
      ring.draw(g, 0, 0);
      ring.outline(o.glow, true, 150);
      out.draw(ring, wx, wy);
    }
    out.draw(g, wx, wy);
    gearMask.draw(g, wx, wy);
    const hand = avatarFrameGrid(body, "down", 0, o.color, []).get(10, 12) >>> 8;
    out.rect(AX + HAND[0], AY + HAND[1], 2, 2, hand);
    out.set(AX + HAND[0] + 1, AY + HAND[1] + 1, darken(hand, 0.25));
    if (wt && !("grid" in w)) DOLL[w.set].hand?.(out, wt, AX + HAND[0], AY + HAND[1]);
  }
  // 반짝임 자리는 늘 둘 (프레임 0·1이 서로 바꿔 쓴다)
  while (sparks.length < 2) sparks.push(sparks.length ? [AX + 4, AY + 22] : [AX + 10, AY + 12]);
  if (topT) finishFx(out, topT, sparks, o.frame ?? 0, gearMask);
  return out;
}

/** 11/15 사냥 중 입은 모습 (game/sprites/setGearWear): 직급까지 반영한 세트 색 묶음 · 금빛 */
export const setWearPal = (set: SetGearSet, g: SetGearGrade): SetTierPal => tierPal(set, g);
export const SET_GOLD = GOLD;
