import type { GearM, GearView } from "./avatarGear";
import { drawNwCoat, type NwCtx } from "./npcWear";
import { darken, Grid, lighten, mix, type Color } from "./pixel";
import { GEAR2, ICONS2 } from "./seasonSetGear2";
import { GEAR3, ICONS3 } from "./seasonSetGear3";
import { GEAR4, ICONS4, setBungeoCtx } from "./bungeoGear";

// 11/19 계절 한정 세트 중 "아바타 시트에 같이 그려지는 것" (avatar.ts drawFrame이 부른다 — 코디 기획안 시안 코드를 그대로 옮겼다).
//  「첫눈 출근길」 귀달이 털모자 · 무릎까지 롱패딩 · 군고구마 봉투
//  「산타 견습 요정」 견습 요정 모자 · 선물 배달 자루 · 진저브레드 쿠키
// 한 아이템이 여러 자리에 그린다 (롱패딩 = 몸통 외투 + 높은 깃, 선물 자루 = 어깨끈 + 머리 다 그린 뒤 몸 뒤로 솟는 자루) →
// 아이템마다 자리별 그리기를 모아 두고, drawFrame이 자리마다 착용한 것을 차례로 부른다 (몸 기준점 GearM이라 15가지 몸 모두에 맞는다).
// 외곽선은 avatar.ts가 프레임 전체에 한 번 두르고, glow는 외곽선 뒤에 밝게 다시 찍는 점이다.
// 따로 그리는 연출(입김 오라 · 꼬마전구 발자국 · 꼬마 눈오리 · 세트 덤)은 seasonSetFx.ts, 이름표는 lib/nameStyle.ts.
// 11/20 나머지 여섯 벌(야근 요정 · 안개 묘지기 · 설날 까치 · 의리 초콜릿 · 벚꽃 소풍 · 사내 체육대회)의 시트 그림은 seasonSetGear2.ts (여기서 함께 부른다).
// 11/20 새 다섯 벌(송년회 3차 · 해맞이 산행 · 작심삼일 · 빙어 축제 · 서리 내린 묘역)의 시트 그림은 seasonSetGear3.ts (여기서 함께 부른다).
// 11/22 골목 붕어빵 수레 한정 꾸미기 열 점 + 외형 「붕어빵 장수 유령」 덧그림(bd_*)은 bungeoGear.ts (여기서 함께 부른다).

type FB = string;
type V = GearView;

/** 첫 두 벌 중 시트에 그려지는 것 */
const SHEET_IDS_1 = ["sc_earflap", "sc_padding", "sc_goguma", "si_elfhat", "si_sack", "si_cookie"] as const;
/** 시트에 그려지는 계절 한정 꾸미기 (시트 키에 들어간다) — 11/20 나머지 여섯 벌(seasonSetGear2 GEAR2)까지 */
//  11/22 붕어빵 수레(GEAR4)까지 — 외형 덧그림 bd_*는 착용 목록에 오지 않으니 뺀다 (avatarCore drawFrame이 vendor 몸이면 붙인다)
export const SEASON_SHEET_IDS: readonly string[] = [...SHEET_IDS_1, ...Object.keys(GEAR2), ...Object.keys(GEAR3), ...Object.keys(GEAR4).filter((id) => !id.startsWith("bd_"))];

type SsItem = {
  /** 두건 꼭지·새싹을 덮는 모자 */
  covers?: boolean;
  /** 머리에 무언가 쓴 것으로 본다 (기본: head가 있으면 true) */
  headWorn?: boolean;
  head?(g: Grid, v: V, m: GearM, fb: FB, top: number, body: string): void;
  neck?(g: Grid, v: V, m: GearM, fb: FB, body: string): void;
  hand?(g: Grid, v: V, m: GearM, fb: FB, body: string): void;
  back?(g: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void;
  glow?(g: Grid, v: V, m: GearM, fb: FB, top: number, body: string): void;
};

// ── 그림 도우미 (시안 kit와 같다) ──

/** 프레임 맨 위 세 줄은 비워 둔다 (xmasGear safe와 같다) */
const SAFE_TOP = 3;
function safe(g: Grid): Grid {
  const set = g.set.bind(g);
  return Object.assign(Object.create(g) as Grid, { set: (x: number, y: number, c: Color, a?: number) => (y >= SAFE_TOP ? set(x, y, c, a) : undefined) });
}

/** 문자 그림 → 그리드 ('.' 투명) */
export function rows(g: Grid, a: readonly string[], pal: Record<string, Color>, ox = 0, oy = 0): void {
  a.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === "." || pal[ch] === undefined) return;
      g.set(ox + x, oy + y, pal[ch]);
    }),
  );
}

/** 문자 그림 → 새 그리드 */
export function art(a: readonly string[], pal: Record<string, Color>): Grid {
  const g = new Grid(Math.max(...a.map((r) => r.length)), a.length);
  rows(g, a, pal);
  return g;
}

/** 16×16 아이콘: 문자 그림을 가운데에 + 외곽선 */
export function iconOf(a: readonly string[], pal: Record<string, Color>, after?: (g: Grid, ox: number, oy: number) => void, lineC = 0x1e1c1a): Grid {
  const g = new Grid(16, 16);
  const w = Math.max(...a.map((r) => r.length));
  const ox = Math.floor((16 - w) / 2);
  const oy = Math.max(0, Math.floor((16 - a.length) / 2));
  rows(g, a, pal, ox, oy);
  g.outline(lineC, false, 170);
  after?.(g, ox, oy);
  return g;
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color, a = 255): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.set(x0, y0, c, a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** 다른 그리드를 알파 섞어 겹친다 (a 0..1 배율) */
export function over(dst: Grid, src: Grid, ox: number, oy: number, a = 1): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const v = src.px[y * src.w + x];
      const sa = ((v & 255) / 255) * a;
      if (sa <= 0) continue;
      const tx = x + ox;
      const ty = y + oy;
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
      const d = dst.px[ty * dst.w + tx];
      const da = (d & 255) / 255;
      const oa = sa + da * (1 - sa);
      const sc = v >>> 8;
      const dc = d >>> 8;
      const c = da <= 0 ? sc : mix(dc, sc, sa / oa);
      dst.px[ty * dst.w + tx] = Grid.rgba(c, Math.round(oa * 255));
    }
}

/** 한 점을 알파 섞어 찍는다 */
export function dot(g: Grid, x: number, y: number, c: Color, a = 255): void {
  const s = new Grid(1, 1);
  s.set(0, 0, c, a);
  over(g, s, Math.round(x), Math.round(y));
}

/** 목도리 반폭 (avatar.ts 목도리와 같은 값) */
const neckHalf = (fb: FB) => (fb === "round" || fb === "sheet" ? 6 : fb === "tall" ? 3 : 4);
/** 앞을 가리는 몸 (상자·머그잔·튜브) */
const objectBody = (b: string) => b === "box" || b === "cup" || b === "tube";

// ══ 「첫눈 출근길」 ══
// 한 벌 색: 남색 니트 · 크림 털실 · 다홍 방울 · 숯빛 패딩 · 크라프트 봉투 · 자색 고구마
const NAVY = 0x2f4f86;
const NAVY_HI = 0x5277b4;
const NAVY_LO = 0x1f3462;
const CREAM = 0xf4ecda;
const CREAM_LO = 0xd2c6ac;
const SC_RED = 0xd8464c;
const SC_RED_LO = 0x9e2c36;
const PAD = 0x3a4054;
const PAD_HI = 0x5c6680;
const PAD_LO = 0x272b3a;
const FUR = 0xf2efe8;
const FUR_LO = 0xc8c8d0;
const KRAFT = 0xcf9f5c;
const KRAFT_HI = 0xe8c48a;
const KRAFT_LO = 0x9a6c36;
const YAM = 0x8a3a66;
const YAM_LO = 0x5e2446;
const YAM_IN = 0xf8c650;

// ── 귀달이 털모자: 남색 니트 정수리 + 크림 노르딕 띠 + 다홍 방울 + 양옆 귀달이(안쪽 크림 털)와 땋은 끈 ──
function earflapHead(g0: Grid, v: V, m: GearM, _fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const hy = Math.round(m.hy);
  const side = v === "side";
  const rx = Math.round(m.rx);
  // 정수리 (니트 결: 왼쪽 밝게, 오른쪽 두 칸 그늘)
  const dome: [number, number][] = [
    [top - 2, Math.max(2, Math.round(rx * 0.6))],
    [top - 1, rx],
    [top, rx],
  ];
  for (const [y, h] of dome) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? NAVY_LO : x === cx - h ? NAVY_HI : (x + y) % 4 === 0 ? NAVY_HI : NAVY);
  // 크림 노르딕 띠 + 다홍 점, 그 아래 골지 단
  for (let x = cx - rx; x < cx + rx; x++) {
    g.set(x, top + 1, (x - cx + 30) % 3 === 1 ? SC_RED : x >= cx + rx - 1 ? CREAM_LO : CREAM);
    g.set(x, top + 2, (x + 40) % 2 ? NAVY : NAVY_LO);
  }
  // 앞이마 눈꽃 한 점
  if (v === "down") g.set(cx - 1, top - 1, CREAM);
  // 꼭대기 다홍 방울 (2×2)
  const py = Math.max(SAFE_TOP, top - 4);
  const px = side ? cx - 2 : cx - 1;
  g.set(px, py, SC_RED);
  g.set(px + 1, py, SC_RED);
  g.set(px, py + 1, SC_RED);
  g.set(px + 1, py + 1, SC_RED_LO);
  if (py + 2 < top - 2) g.set(px + 1, py + 2, NAVY_LO);
  // 귀달이 (바깥 남색 + 안쪽 크림 털) + 땋은 끈 + 꼬마 방울
  const bottom = hy + 1;
  const flap = (outer: number, inner: number) => {
    for (let y = top + 3; y <= bottom; y++) {
      g.set(outer, y, y === bottom ? NAVY_LO : NAVY);
      if (y < bottom) g.set(inner, y, y === top + 3 ? NAVY : CREAM);
    }
    // 끈 (크림·그늘 번갈아) + 다홍 방울
    g.set(outer, bottom + 1, CREAM);
    g.set(outer, bottom + 2, CREAM_LO);
    g.set(outer, bottom + 3, SC_RED);
  };
  if (side) {
    // 옆모습: 귀 자리(머리 가운데 뒤쪽)에 한 장
    for (let y = top + 3; y <= bottom; y++) {
      g.set(cx - 2, y, NAVY);
      g.set(cx - 1, y, y === bottom ? NAVY_LO : NAVY_HI);
      g.set(cx, y, CREAM);
    }
    g.set(cx - 1, bottom + 1, CREAM);
    g.set(cx - 1, bottom + 2, CREAM_LO);
    g.set(cx - 1, bottom + 3, SC_RED);
  } else {
    flap(cx - rx - 1, cx - rx);
    flap(cx + rx, cx + rx - 1);
  }
}

function earflapIcon(): Grid {
  return iconOf(
    [
      "......rr......",
      "......rR......",
      "....nnnnnn....",
      "..nNnnnnnnnl..",
      ".nNnnnwnnnnnl.",
      ".nnnnnnnnnnnl.",
      ".crccrccrccrc.",
      ".mnmnmnmnmnmn.",
      ".nw........wn.",
      ".nw........wn.",
      ".nw........wn.",
      ".mm........mm.",
      "..w........w..",
      "..v........v..",
      "..r........r..",
    ],
    { n: NAVY, N: NAVY_HI, l: NAVY_LO, m: NAVY_LO, w: CREAM, c: CREAM, v: CREAM_LO, r: SC_RED, R: SC_RED_LO },
  );
}

// ── 무릎까지 롱패딩 (NPC 겨울옷 패딩 그림 + 높은 깃 · 털 후드 · 가슴 상표) ──
function ctxOf(v: V, m: GearM, fb: FB, body: string, hem: number, sit: number): NwCtx {
  return { view: v, fb, body, m, sit: sit as 0 | 1 | 2, bob: 0, hem, f0: [0, 0], f1: [0, 0], lie: false, sink: false, arms: "none", handBusy: false };
}

/** 이불 유령: 얼굴 아래부터 누빈 패딩 자락 */
function sheetPadding(g: Grid, m: GearM): void {
  const { cx } = m;
  const y0 = Math.round(m.hy) + 4;
  // 11/20 칸 검사: 누빈 칸 부풂까지 아바타 칸 안(x 1~18)에서만 (칸 끝으로 나가면 테두리 없이 잘린다)
  for (let y = y0; y < 27; y++)
    for (let x = 1; x <= 18; x++) {
      if (!g.filled(x, y)) continue;
      const k = y - y0;
      let c = x >= cx + 4 ? PAD_LO : x <= cx - 6 ? PAD_HI : PAD;
      if (k % 3 === 2) c = darken(PAD, 0.4);
      g.set(x, y, c);
      // 누빈 칸마다 한 칸 부풂
      if (k % 3 === 1 && !g.filled(x - 1, y) && x < cx && x - 1 >= 1) g.set(x - 1, y, PAD_HI);
      if (k % 3 === 1 && !g.filled(x + 1, y) && x > cx && x + 1 <= 18) g.set(x + 1, y, PAD_LO);
    }
  for (let y = y0 + 1; y < 25; y++) g.set(cx - 1, y, 0xd8dce6);
}

function paddingBack(g: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  const { cx, neck } = m;
  if (layer === "back") {
    // 옆모습: 등 뒤로 도톰한 후드 뭉치
    if (v === "side" && fb !== "round" && fb !== "sheet") {
      g.rect(cx - 5, neck - 2, 3, 3, PAD);
      g.set(cx - 5, neck - 2, FUR);
      g.set(cx - 4, neck - 2, FUR_LO);
      g.set(cx - 5, neck - 1, PAD_HI);
    }
    return;
  }
  if (objectBody(body)) return;
  if (fb === "sheet") sheetPadding(g, m);
  else drawNwCoat(g, ctxOf(v, m, fb, body, hem, sit), { coat: { kind: "puffer", c: PAD, c2: PAD_HI } });
  // 가슴 상표 (흰 네모 하나)
  if (v === "down" && fb !== "round" && fb !== "sheet") {
    const y = (fb === "tall" ? 13 : 18) + (sit === 1 ? 3 : sit === 2 ? 2 : 0) + 2;
    g.set(cx + 1, y, 0xf4f4f8);
  }
}

/** 앞을 가리는 몸(상자·머그잔·튜브): 몸통 외투가 가려지므로 턱 밑까지 올린 도톰한 패딩 깃만 (뒷모습은 털 후드) */
function objectPaddingNeck(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx } = m;
  const half = neckHalf(fb) + (fb === "round" ? 0 : 1);
  const y0 = fb === "round" ? Math.round(m.hy) + 1 : m.neck - 1;
  const x0 = v === "side" ? cx - half + 2 : cx - half;
  const x1 = cx + half - 1;
  for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1;
    g.set(x, y0 - 1, v === "up" ? ((x + 1) % 3 === 0 ? FUR_LO : FUR) : edge ? PAD : x >= x1 - 1 ? PAD_LO : PAD_HI);
    g.set(x, y0, x >= x1 - 1 ? PAD_LO : x === x0 ? PAD_HI : PAD);
    g.set(x, y0 + 1, x >= x1 - 1 ? PAD_LO : darken(PAD, 0.25));
  }
  if (v === "down") {
    g.set(cx - 1, y0 - 1, 0xd8dce6);
    g.set(cx - 1, y0, 0xd8dce6);
    g.set(cx - 1, y0 + 1, 0xa8b0bc);
  } else if (v === "side") g.set(x1 - 1, y0, 0xa8b0bc);
}

function paddingNeck(g: Grid, v: V, m: GearM, fb: FB, body: string): void {
  if (objectBody(body)) return objectPaddingNeck(g, v, m, fb);
  if (fb === "round" || fb === "sheet") return;
  const { cx, neck } = m;
  const half = neckHalf(fb);
  if (v === "up") {
    // 뒷모습: 목 뒤 털 후드
    for (let x = cx - half; x < cx + half; x++) {
      g.set(x, neck, (x + 1) % 3 === 0 ? FUR_LO : FUR);
      g.set(x, neck + 1, x >= cx + half - 2 ? PAD_LO : PAD_HI);
      g.set(x, neck + 2, x >= cx + half - 2 ? PAD_LO : PAD);
    }
    g.set(cx - 1, neck + 3, PAD_LO);
    g.set(cx, neck + 3, PAD_LO);
    return;
  }
  // 앞·옆: 턱 밑까지 올린 높은 깃 + 지퍼 손잡이
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  const x1 = cx + half - 1;
  for (let x = x0; x <= x1; x++) {
    g.set(x, neck - 1, x === x0 ? PAD_HI : x >= x1 - 1 ? PAD_LO : PAD);
    g.set(x, neck, x >= x1 - 1 ? PAD_LO : x === x0 ? PAD_HI : PAD);
  }
  if (v === "down") {
    g.set(cx - 1, neck - 1, 0xd8dce6);
    g.set(cx - 1, neck, 0xa8b0bc);
  } else g.set(x1 - 1, neck, 0xa8b0bc);
}

function paddingIcon(): Grid {
  return iconOf(
    [
      "....fFffFf....",
      "...fppppppf...",
      "..hpppzppppl..",
      ".hhpppzpppppl.",
      ".hsssszsssssl.",
      "hhppppzwppppll",
      "hpppppzpppppll",
      "hssssszsssssll",
      "hpppppzpppppll",
      ".hppppzppppl..",
      ".hssssszsssl..",
      ".hpppppzpppl..",
      ".hpppppzpppl..",
      "..llllllllll..",
    ],
    { f: FUR, F: FUR_LO, p: PAD, h: PAD_HI, l: PAD_LO, s: darken(PAD, 0.4), z: 0xd8dce6, w: 0xf4f4f8 },
  );
}

// ── 군고구마 봉투: 크라프트 종이봉투 위로 삐죽 나온 군고구마 + 김 (김은 외곽선 밖 반투명) ──
function gogumaHand(g: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const x = m.hx;
  const y = m.hY;
  // 11/20 칸 검사: 앉은 자세(손이 내려간다)에선 봉투 밑을 한 칸 줄여 칸 바닥(y 26) 위에서 닫는다
  const h = Math.min(4, 27 - y);
  g.rect(x - 1, y, 3, h, KRAFT);
  g.vline(x + 1, y + 1, y + h - 1, KRAFT_LO);
  g.hline(x - 1, x + 1, y, KRAFT_HI);
  g.set(x, y + h - 1, KRAFT_LO);
  g.set(x - 1, y - 1, YAM);
  g.set(x, y - 1, YAM_IN);
  g.set(x, y - 2, YAM);
  g.set(x + 1, y - 1, YAM_LO);
}
function gogumaGlow(g: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  dot(g, m.hx, m.hY - 4, 0xffffff, 170);
  dot(g, m.hx - 1, m.hY - 5, 0xffffff, 120);
  dot(g, m.hx, m.hY - 6, 0xffffff, 80);
  g.set(m.hx, m.hY - 1, YAM_IN);
}
function gogumaIcon(): Grid {
  return iconOf(
    [
      "........s.....",
      ".......s.s....",
      "......yyO.....",
      ".....yYyOo....",
      "..yyO.yyyl....",
      ".yYyOoyyl.....",
      "..yyyl.l......",
      "..hHhhHhhhH...",
      "..kkkkkkkkK...",
      "..kkkkkkkkK...",
      "..kkkKKkkkK...",
      "..kkkkkkkkK...",
      "..kkkkkkkkK...",
      "..KKKKKKKKK...",
    ],
    { y: YAM, Y: lighten(YAM, 0.28), l: YAM_LO, o: 0xffe08a, O: YAM_IN, h: KRAFT_HI, H: 0xf2d8a8, k: KRAFT, K: KRAFT_LO, s: 0xffffff },
  );
}

// ══ 「산타 견습 요정」 ══
// 크리스마스 이벤트 세트(빨간 벨벳·흰 털·금·얼음빛)와 겹치지 않게: 초록·빨강 줄무늬 + 금방울, 삼베 자루, 갈색 쿠키
const GREEN = 0x2e9a4e;
const GREEN_HI = 0x5cc474;
const GREEN_LO = 0x1c6a36;
const GREEN_DEEP = 0x124a26;
const RED = 0xd63a3a;
const RED_HI = 0xf26a5e;
const RED_LO = 0x962430;
const GOLD = 0xf2c84a;
const GOLD_HI = 0xfff2b0;
const GOLD_LO = 0xb88a22;
const SACK = 0xc8a46a;
const SACK_HI = 0xe4c890;
const SACK_LO = 0x9a7642;
const SACK_DEEP = 0x6e5230;
const GB = 0xb86a32;
const GB_HI = 0xdc8e4c;
const GB_LO = 0x8a4a22;
const ICING = 0xfff6ec;

// ── 견습 요정 모자: 접힌 꼭지가 옆으로 늘어진 줄무늬 고깔 + 톱니 단 + 끝 금방울 ──
function elfPoints(m: GearM, top: number, d: 1 | -1) {
  const { cx } = m;
  const rx = Math.round(m.rx);
  const peak = Math.max(SAFE_TOP, top - 4);
  const mir = (x: number) => (d > 0 ? x : 2 * cx - 1 - x);
  // 11/20 칸 검사: 늘어진 꼭지 끝 + 금방울(끝에서 두 칸 더)이 칸 안(x 1~18)에 들게 — 머리가 넓은 몸(동글이·이불 유령·머그잔·튜브)은 꼭지를 짧게
  const tipX = Math.min(cx + rx + 1, d > 0 ? 16 : 2 * cx - 4);
  return { cx, rx, peak, mir, tipX };
}

function elfHead(g0: Grid, v: V, m: GearM, _fb: FB, top: number): void {
  const g = safe(g0);
  const d: 1 | -1 = v === "down" ? 1 : -1;
  const { cx, rx, peak, mir, tipX } = elfPoints(m, top, d);
  const put = (x: number, y: number, c: Color) => g.set(mir(x), y, c);
  // 고깔 몸통: top-1에서 peak까지 좁아지며 꼭지 쪽(+)으로 기운다. 두 줄마다 초록·빨강 줄무늬
  const n = top - 1 - peak;
  for (let i = 0; i <= n; i++) {
    const y = top - 1 - i;
    const t = n ? i / n : 1;
    const half = Math.max(1.5, rx - t * (rx - 1.5));
    const shift = Math.round(t * 2);
    const x0 = Math.round(cx - half + shift);
    const x1 = Math.round(cx + half - 1 + shift);
    const stripe = Math.floor((top - 1 - y) / 2) % 2 === 0;
    const [c, hi, lo] = stripe ? [GREEN, GREEN_HI, GREEN_LO] : [RED, RED_HI, RED_LO];
    for (let x = x0; x <= x1; x++) put(x, y, x === x0 ? hi : x >= x1 - 1 ? lo : c);
  }
  // 꼭지: peak 줄에서 옆으로 뻗었다가 머리 옆으로 축 늘어진다
  const startX = Math.round(cx + 1.5 + 2);
  for (let x = startX; x <= tipX; x++) put(x, peak, x >= tipX - 1 ? GREEN_LO : GREEN);
  put(tipX - 1, peak + 1, GREEN_DEEP);
  put(tipX, peak + 1, RED);
  put(tipX + 1, peak + 1, RED_LO);
  put(tipX + 1, peak + 2, GREEN);
  // 금방울 (2×2)
  put(tipX + 1, peak + 3, GOLD_HI);
  put(tipX + 2, peak + 3, GOLD);
  put(tipX + 1, peak + 4, GOLD);
  put(tipX + 2, peak + 4, GOLD_LO);
  // 머리를 감싸는 단: 빨강 띠 + 아래로 톱니 (요정 옷깃처럼)
  for (let x = cx - rx; x < cx + rx; x++) put(x, top, x >= cx + rx - 2 ? RED_LO : (x - cx + 20) % 3 === 0 ? RED_HI : RED);
  for (let x = cx - rx; x < cx + rx; x++) if ((x - cx + 20) % 2 === 0) put(x, top + 1, x >= cx + rx - 2 ? GREEN_DEEP : GREEN_LO);
  // 단 위 금실 한 땀 (앞모습)
  if (v === "down") {
    put(cx - 2, top, GOLD);
    put(cx + 1, top, GOLD);
  }
}

function elfGlow(g0: Grid, v: V, m: GearM, _fb: FB, top: number): void {
  const g = safe(g0);
  const d: 1 | -1 = v === "down" ? 1 : -1;
  const { peak, mir, tipX } = elfPoints(m, top, d);
  g.set(mir(tipX + 1), peak + 3, 0xffffff);
}

function elfIcon(): Grid {
  return iconOf(
    [
      "........ggl...",
      ".......gGgglr.",
      "......rrrl..rR",
      ".....rRrrl...g",
      "....gGgggl..yY",
      "...gGgggggl.yL",
      "..rRrrrrrrrl..",
      ".rRrrrrrrrrrl.",
      "gGgggggggggggl",
      "rRryrrrrryrrrl",
      "d.d.d.d.d.d.d.",
    ],
    { g: GREEN, G: GREEN_HI, l: GREEN_LO, d: GREEN_LO, r: RED, R: RED_HI, y: GOLD, Y: GOLD_HI, L: GOLD_LO },
    (g, ox, oy) => g.set(ox + 12, oy + 4, 0xffffff),
  );
}

// ── 선물 배달 자루 (전설 대표): 삼베 자루 + 빨간 끈 + 위로 삐져나온 선물 상자 둘과 지팡이 사탕 ──
/** 자루 하나: 가운데 (ox, oy), 반지름 rx·ry. gifts = 위로 삐져나온 선물 */
function sack(g: Grid, ox: number, oy: number, rx: number, ry: number, gifts: boolean, flip = false): void {
  ox = Math.round(ox);
  oy = Math.round(oy);
  const f = (x: number) => (flip ? 2 * ox - x : x);
  const mouth = oy - ry + 1;
  if (gifts) {
    // 빨간 상자 + 금 리본 (왼쪽, 크게)
    const bx = ox - 3;
    const by = mouth - 4;
    for (let y = by; y < by + 4; y++)
      for (let x = bx; x < bx + 4; x++) g.set(f(x), y, x === bx + 1 || y === by + 1 ? GOLD : x === bx + 3 ? RED_LO : y === by ? RED_HI : RED);
    g.set(f(bx), by - 1, GOLD);
    g.set(f(bx + 2), by - 1, GOLD);
    g.set(f(bx + 1), by - 1, GOLD_LO);
    // 초록 상자 + 빨간 리본 (오른쪽, 낮게)
    const cx2 = ox + 1;
    const cy2 = mouth - 3;
    for (let y = cy2; y < cy2 + 3; y++)
      for (let x = cx2; x < cx2 + 3; x++) g.set(f(x), y, x === cx2 + 1 ? RED : x === cx2 + 2 ? GREEN_LO : y === cy2 ? GREEN_HI : GREEN);
    g.set(f(cx2 + 1), cy2 - 1, RED_HI);
    // 지팡이 사탕 끝 (빨강·하양 갈고리)
    const sx = ox + 4;
    g.set(f(sx), mouth - 1, ICING);
    g.set(f(sx), mouth - 2, RED);
    g.set(f(sx), mouth - 3, ICING);
    g.set(f(sx - 1), mouth - 4, RED);
    g.set(f(sx - 2), mouth - 3, ICING);
  }
  // 자루 몸 (아래가 묵직한 타원) + 결 + 명암
  for (let y = oy - ry; y <= oy + ry; y++)
    for (let x = ox - rx - 1; x <= ox + rx + 1; x++) {
      const dy = (y + 0.5 - oy) / ry;
      const w = rx * Math.sqrt(Math.max(0, 1 - dy * dy)) + (dy > 0 ? 0.6 : 0);
      if (Math.abs(x + 0.5 - ox) > w) continue;
      const rel = (x + 0.5 - ox) / Math.max(1, w);
      let c: Color = rel < -0.55 ? SACK_HI : rel > 0.5 ? SACK_LO : SACK;
      if (y >= oy + ry - 1) c = SACK_DEEP;
      else if ((x * 2 + y * 3) % 7 === 0 && rel > -0.55) c = SACK_LO;
      g.set(f(x), y, c);
    }
  // 입구 주름 (밝은 톱니) + 빨간 끈 매듭
  for (let x = ox - rx + 1; x <= ox + rx - 1; x++) g.set(f(x), mouth - 1 + ((x + 20) % 2), (x + 20) % 2 ? SACK_HI : SACK);
  for (let x = ox - rx + 1; x <= ox + rx - 1; x++) g.set(f(x), mouth + 1, x === ox ? RED_HI : RED);
  g.set(f(ox + 1), mouth + 2, RED_LO);
  g.set(f(ox + 2), mouth + 3, RED);
  // 기운 천 조각 (초록 덧댐)
  if (ry >= 4) {
    g.set(f(ox - 1), oy + 1, GREEN);
    g.set(f(ox), oy + 1, GREEN_LO);
    g.set(f(ox - 1), oy + 2, GREEN_LO);
  }
}

/** 몸 뒤에 놓기: 임시 그리드에 그린 뒤 빈 칸에만 옮긴다 (머리 명암 칠이 끝난 뒤에 불러야 자루 색이 머리 색으로 물들지 않는다) */
function behind(g: Grid, draw: (t: Grid) => void): void {
  const t = new Grid(g.w, g.h);
  draw(t);
  for (let y = SAFE_TOP; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const v = t.get(x, y);
      if (v & 255 && !g.filled(x, y)) g.set(x, y, v >>> 8, v & 255);
    }
}

function sackBehind(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx, shY } = m;
  // 11/20 칸 검사: 자루 왼쪽 끝이 칸 밖(x 0 이하)으로 나가 일자로 잘렸다 → 앞모습은 한 칸 좁히고(반지름 5 → 4) 한 칸(넓은 몸 두 칸) 안쪽,
  // 옆모습은 두 칸(넓은 몸 세 칸) 안쪽 — 왼쪽 끝이 칸 안 x 1에서 닫힌다
  if (v === "down") behind(g, (t) => sack(t, cx - 4, shY - (fb === "tall" ? 2 : 4), 4, 4, true));
  else if (v === "side") behind(g, (t) => sack(t, cx - 5, shY - 2, 3, 4, true, true));
}

function sackBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, _sit: number, body: string): void {
  const g = safe(g0);
  const { cx, shY, shL, shR } = m;
  const big = fb === "round" || fb === "sheet";
  if (layer !== "front") return;
  if (v === "down") {
    if (!big && !objectBody(body)) {
      // 가슴을 가로지르는 빨간 끈
      // 11/20 칸 검사: 앉은 자세에선 끈 끝을 칸 바닥(y 26)에서
      const sb = Math.min(shY + 3, 26);
      line(g, shL, shY - 1, shR - 1, sb, RED);
      g.set(shR - 1, sb, RED_LO);
    } else if (big) {
      g.set(shL + 1, shY - 1, RED);
      g.set(shL + 2, shY, RED_LO);
    }
  } else if (v === "side") {
    if (!big) line(g, cx - 2, shY - 1, cx + 1, shY + 2, RED);
  } else {
    // 뒷모습: 등 전체를 덮는 자루, 어깨 위로 선물
    // 11/20 칸 검사: 걷기 출렁임·앉은 자세에서 자루 밑이 칸 바닥(y 26) 아래로 → 가운데를 y 22까지만 내린다
    sack(g, cx - 1, Math.min(shY + 1, 22), big ? 5 : 4, 4, true);
  }
}

function sackIcon(): Grid {
  const g = new Grid(16, 16);
  sack(g, 8, 10, 5, 4, true);
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 진저브레드 쿠키 ──
const COOKIE = [".hbB.", ".wbw.", "hbbbB", ".brB.", ".bwB.", "hB.bB"];
const COOKIE_PAL: Record<string, Color> = { b: GB, h: GB_HI, B: GB_LO, w: ICING, r: RED };
function cookieHand(g: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  g.draw(art(COOKIE, COOKIE_PAL), m.hx - 2, m.hY - 3);
}
function cookieIcon(): Grid {
  return iconOf(
    [
      "....hbbb....",
      "...hbbbbB...",
      "...bwbbwB...",
      "...bbwwbB...",
      "....bbbB....",
      ".hbbbbbbbbB.",
      "hbwbbrbbbwbB",
      ".BB.bbbbB.B.",
      "....bwbbB...",
      "...hbbbbbB..",
      "...bbB.bbB..",
      "..bwB...bwB.",
      "..BB.....BB.",
    ],
    { b: GB, h: GB_HI, B: GB_LO, w: ICING, r: RED },
  );
}

// ── 선물 포장 이름표 아이콘 (판 그림은 lib/nameStyle si_wrap → NameStyleView·StyledName) ──
function wrapIcon(): Grid {
  return iconOf(
    [
      ".....yy..yy...",
      "....yYLyyLYy..",
      ".....yyyyyy...",
      ".eeeeeyyeeeee.",
      "erggrrYyggrrge",
      "egrrgrYyrggrre",
      "erggrrYygrrgge",
      "egrrggYyrggrre",
      ".eeeeeyyeeeee.",
    ],
    { r: RED, g: GREEN, e: 0x5a1018, y: GOLD, Y: GOLD_HI, L: GOLD_LO },
  );
}

// ── 등록 ──

const ITEMS: Readonly<Record<string, SsItem>> = {
  sc_earflap: { covers: true, head: (g, v, m, fb, top) => earflapHead(g, v, m, fb, top) },
  sc_padding: { back: paddingBack, neck: paddingNeck },
  sc_goguma: { hand: (g, v, m) => gogumaHand(g, v, m), glow: (g, v, m) => gogumaGlow(g, v, m) },
  si_elfhat: { covers: true, head: (g, v, m, fb, top) => elfHead(g, v, m, fb, top), glow: (g, v, m, fb, top) => elfGlow(g, v, m, fb, top) },
  // 선물 자루는 head 자리에서 "머리 다 그린 뒤 몸 뒤 빈칸"에 자루를 놓는다 (모자를 쓴 것은 아니다)
  si_sack: { headWorn: false, back: sackBack, head: (g, v, m, fb) => sackBehind(g, v, m, fb) },
  si_cookie: { hand: (g, v, m) => cookieHand(g, v, m) },
  ...GEAR2,
  ...GEAR3,
  ...GEAR4,
};

const ICONS: Readonly<Record<string, () => Grid>> = {
  sc_earflap: earflapIcon,
  sc_padding: paddingIcon,
  sc_goguma: gogumaIcon,
  si_elfhat: elfIcon,
  si_sack: sackIcon,
  si_cookie: cookieIcon,
  si_wrap: wrapIcon,
  ...ICONS2,
  ...ICONS3,
  ...ICONS4,
};

/** 착용 목록 → 시트에 그릴 계절 한정 꾸미기 id (부위 순서는 상관없다 — 자리마다 따로 부른다) */
export function seasonGearOf(look: readonly string[]): string[] {
  return SEASON_SHEET_IDS.filter((id) => look.includes(id));
}
const each = (ids: readonly string[]) => ids.map((id) => ITEMS[id]).filter((x): x is SsItem => !!x);

/** 머리에 무언가 쓴 것으로 보는지 (왕관 외형 왕관을 숨기는 등) */
export const ssHeadWorn = (ids: readonly string[]) => each(ids).some((i) => i.headWorn ?? !!i.head);
/** 두건 꼭지·새싹을 덮는 모자인지 */
export const ssCovers = (ids: readonly string[]) => each(ids).some((i) => !!i.covers);

export function drawSsBack(g: Grid, v: V, ids: readonly string[], m: GearM, fb: FB, layer: "back" | "front", hem: number, sit: number, body: string): void {
  for (const i of each(ids)) i.back?.(g, v, m, fb, layer, hem, sit, body);
}
export function drawSsNeck(g: Grid, v: V, ids: readonly string[], m: GearM, fb: FB, body: string): void {
  for (const i of each(ids)) i.neck?.(g, v, m, fb, body);
}
export function drawSsHead(g: Grid, v: V, ids: readonly string[], m: GearM, fb: FB, top: number, body: string): void {
  for (const i of each(ids)) i.head?.(g, v, m, fb, top, body);
}
export function drawSsHand(g: Grid, v: V, ids: readonly string[], m: GearM, fb: FB, body: string): void {
  for (const i of each(ids)) i.hand?.(g, v, m, fb, body);
}
/** 외곽선 뒤에 밝게 찍는 점 (고구마 김 · 요정 모자 금방울 반짝) */
export function drawSsGlow(g: Grid, v: V, ids: readonly string[], m: GearM, fb: FB, top: number, body: string): void {
  for (const i of each(ids)) i.glow?.(g, v, m, fb, top, body);
}

/** 프레임 하나를 그리기 전에 avatarCore drawFrame이 넘기는 상태 (붕어빵 장수 유령 덧그림: 앞치마·조끼 색, 수건·집게·깃을 벗을지) */
export type SsFrameCtx = {
  /** 포인트 색 (염색 전이면 null) */
  accent: Color | null;
  /** 몸 부위 색 (외형 기본색 포함) */
  body: Color;
  /** 이 프레임에 그리는 계절·골목 꾸미기 id (gear.ss) */
  ids: readonly string[];
  /** 계절 꾸미기 밖의 머리 꾸미기·모자를 썼다 */
  headBusy: boolean;
  /** 계절 꾸미기 밖의 손 꾸미기·등불을 들었다 */
  handBusy: boolean;
  /** 계절 꾸미기 밖의 목 꾸미기·목도리·갑옷을 했다 */
  neckBusy: boolean;
};
export function ssFrameCtx(c: SsFrameCtx): void {
  const mine = (id: string) => !id.startsWith("bd_");
  const its = c.ids.filter(mine).map((id) => ITEMS[id]).filter((x): x is SsItem => !!x);
  setBungeoCtx({
    accent: c.accent,
    body: c.body,
    ids: c.ids,
    headBusy: c.headBusy || its.some((i) => (i.headWorn ?? !!i.head) && !!i.head),
    handBusy: c.handBusy || its.some((i) => !!i.hand),
    neckBusy: c.neckBusy || its.some((i) => !!i.neck),
  });
}

/** 시트 그림 꾸미기·이름표 아이콘 16×16 (해당 없으면 null) */
export function seasonGearIcon(id: string): Grid | null {
  return ICONS[id]?.() ?? null;
}
