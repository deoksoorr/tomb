import type { GearM } from "./avatarGear";
import { Grid, type Color } from "./pixel";
import { art, behind, bigBody, centerIn, clampX, dot, edit, eyes, halfAt, iconOf, line, objectBody, over, petCel, safe, SAFE_TOP, type FB, type SsItem, type V } from "./seasonSetKit";

// 11/20 계절 보따리상 새 다섯 벌 (12/26 ~ 1/23 출시) 중 "아바타 시트에 같이 그려지는 것" + 따로 그리는 연출의 그림 재료.
// 코디 기획안 시안(운영자 확정, 좌우 잘림 고친 최종본) 코드를 그대로 옮겼다 — 모양·색은 시안 그대로.
//  「송년회 3차」 넥타이 머리띠 · 애창곡 마이크 · 흥부자 탬버린 · 알딸딸 오라(볼 발그레만 시트에) · 꼬마 너구리
//  「해맞이 산행」 해돋이 털모자 · 등산 배낭 · 믹스커피 보온병 · 첫 햇살 오라 · 꼬마 산양
//  「작심삼일」 헬스 머리띠 · 단백질 쉐이크 · 새 운동 가방 · 새해 계획표 이름표(아이콘만) · 사흘째 발자국
//  「빙어 축제」 털 귀마개 · 빙어 낚싯대 · 빙어 아이스박스 · 핫팩 오라 · 빙어 도둑 펭귄
//  「서리 내린 묘역」 고드름 왕관 · 서리꽃 망토 · 성에 발자국 · 서리 앉은 이름(아이콘만) · 꼬마 눈토끼
// 시트 칠은 모두 아바타 칸 안(x 1~18, y 26 이하 — seasonSetBounds.test). 자리별 그리기(GEAR3)는 seasonSetGear.ts가 함께 부르고,
// 오라·발자국·펫·세트 덤은 seasonSetFx3.ts가 여기 그림 재료(SS3_PARTS)로 움직인다. 이름 글자·이름표 그림은 lib/nameStyle.ts.
// 세트마다 그림 이름이 겹치지 않는다 (시안 다섯 파일을 그대로 이어 붙였다).

type Art = readonly string[];
// 새 세트 1 「송년회 3차」 (12/26): 넥타이 머리띠 · 애창곡 마이크 · 흥부자 탬버린 · 알딸딸 오라 · 꼬마 너구리
// 한 벌 색: 와인 빛 빨강 넥타이(남색 사선) · 금빛 노래방 마이크(분홍 불빛) · 빨간 탬버린 테 + 금 찰랑이 + 리본 세 가닥 · 볼 빨간 분홍 거품

const TIE = 0xc8323e;
const TIE_HI = 0xe85a5a;
const TIE_LO = 0x8a1e2c;
const TIE_ST = 0x2c3a6e;
const GOLD = 0xf0c040;
const GOLD_HI = 0xfff0a0;
const GOLD_LO = 0xa8761c;
const SILVER = 0xc8ccd8;
const SILVER_HI = 0xf4f6fa;
const SILVER_LO = 0x7c8294;
const PINK = 0xff5aa8;
const PINK_HI = 0xffb8dc;
const RIM = 0xd8404a;
const RIM_LO = 0x962a36;
const RIB: Color[] = [0xff7ab8, 0xffd84a, 0x5ad0e8];
const BLUSH = 0xff7a9a;

// ── 넥타이 머리띠: 이마에 질끈 묶은 넥타이 + 옆머리에 매듭 + 축 늘어진 두 자락 ──
function tieColor(x: number, y: number, x0: number, x1: number): Color {
  if ((x + y * 2 + 30) % 4 === 0) return TIE_ST;
  if (x === x0) return TIE_HI;
  if (x >= x1 - 1) return TIE_LO;
  return TIE;
}
/** 자락 하나: (x, y)에서 d쪽 아래로 len칸, 끝은 뾰족 */
function tail(g: Grid, x: number, y: number, d: 1 | -1, len: number, lean: number): void {
  for (let i = 0; i < len; i++) {
    const xx = Math.round(x + d * i * lean);
    const yy = y + i;
    const tip = i === len - 1;
    g.set(xx, yy, (i + 1) % 3 === 0 ? TIE_ST : tip ? TIE_LO : TIE);
    if (!tip) g.set(xx + d, yy, (i + 2) % 3 === 0 ? TIE_ST : TIE_LO);
  }
}
function tieHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const y = top + 2;
  const half = Math.max(2, halfAt(m, y));
  const x0 = Math.round(m.cx - half);
  const x1 = Math.round(m.cx + half) - 1;
  // 띠 (머리 너비 + 양 끝 한 칸씩 감싼다)
  for (let x = x0; x <= x1; x++) {
    g.set(x, y, tieColor(x, y, x0, x1));
    g.set(x, y + 1, x >= x1 - 1 ? TIE_LO : x === x0 ? TIE : (x + y) % 4 === 1 ? TIE_ST : TIE_LO);
  }
  if (v === "side") {
    // 옆모습: 뒤통수에 매듭, 자락은 뒤로 펄럭
    // (머리가 넓은 몸도 칸 안에 들게, 자락은 뒤통수를 따라 아래로)
    const kx = Math.max(2, x0 - 1);
    g.set(kx, y, TIE_LO);
    g.set(kx, y + 1, TIE);
    g.set(kx + 1, y - 1, TIE);
    for (let i = 0; i < 5; i++) {
      const xx = Math.max(1, kx - Math.round(i * 0.35));
      g.set(xx, y + 2 + i, (i + 1) % 3 === 0 ? TIE_ST : i === 4 ? TIE_LO : TIE);
      if (i < 4) g.set(xx + 1, y + 2 + i, (i + 2) % 3 === 0 ? TIE_ST : TIE_LO);
    }
    return;
  }
  // 앞모습: 왼쪽 관자놀이(보는 쪽 오른쪽)에 매듭, 뒷모습: 보는 쪽 왼쪽
  const d: 1 | -1 = v === "down" ? 1 : -1;
  const edge = d > 0 ? x1 : x0;
  g.set(edge, y, TIE_LO);
  g.set(edge, y + 1, TIE_LO);
  g.set(edge + d, y, TIE_HI);
  g.set(edge + d, y + 1, TIE);
  g.set(edge + d, y - 1, TIE);
  tail(g, edge + d, y + 2, d, 5, 0.45);
  tail(g, edge + 2 * d, y, d, 3, 0.9);
  void fb;
}
function tieIcon(): Grid {
  return iconOf(
    [
      "....rrrrrr....",
      "..rRsrrsrrrr..",
      ".rR........rrk",
      ".r..........kK",
      ".rr........rkrr",
      "..rrsrrsrrrr.rs",
      "....rrrrrr...sr",
      ".............rr",
      "..............s",
      "..............r",
    ].map((r) => r.slice(0, 15)),
    { r: TIE, R: TIE_HI, s: TIE_ST, k: TIE_LO, K: TIE_HI },
  );
}

// ── 애창곡 마이크: 금빛 손잡이 + 은색 그릴 공 + 분홍 불빛 테 ──
function micHand(g0: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const g = g0;
  const x = m.hx;
  const y = m.hY;
  // 손잡이 (아래로 가늘어진다)
  g.set(x, y, GOLD);
  g.set(x, y + 1, GOLD_LO);
  g.set(x, y + 2, GOLD_LO);
  g.set(x - 1, y, GOLD_HI);
  // 분홍 불빛 테
  g.set(x - 1, y - 1, PINK);
  g.set(x, y - 1, PINK);
  g.set(x + 1, y - 1, 0xc83a80);
  // 그릴 공 (3×3, 모서리 깎음)
  g.set(x - 1, y - 3, SILVER_HI);
  g.set(x, y - 3, SILVER);
  g.set(x - 1, y - 2, SILVER);
  g.set(x, y - 2, SILVER_LO);
  g.set(x + 1, y - 2, SILVER_LO);
  g.set(x + 1, y - 3, SILVER_LO);
  g.set(x, y - 4, SILVER);
}
function micGlow(g: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  g.set(m.hx - 1, m.hY - 1, PINK_HI);
  g.set(m.hx - 1, m.hY - 3, 0xffffff);
}
function micIcon(): Grid {
  return iconOf(
    [
      ".......wss..",
      "......wsSsl.",
      "......sSsll.",
      ".......sll..",
      "......ppP...",
      ".....gGp....",
      "....gGl.....",
      "...gGl......",
      "..gGl.......",
      ".gGl........",
      ".gl.........",
    ],
    { w: SILVER_HI, s: SILVER, S: 0x9aa0b0, l: SILVER_LO, p: PINK, P: 0xc83a80, g: GOLD, G: GOLD_HI },
    (g, ox, oy) => {
      g.set(ox + 7, oy + 4, PINK_HI);
      g.set(ox + 7, oy + 1, 0xffffff);
    },
  );
}

// ── 흥부자 탬버린: 빨간 테 + 금 찰랑이 + 크림 가죽 + 리본 세 가닥 ──
/** 탬버린 한 개: 빨간 플라스틱 고리 + 은 찰랑이 쌍 (가운데 x, y, 가로 반지름 rx, 세로 반지름 ry). ribbons = 아래로 늘어진 리본 방향 (0 = 없음) */
function tambo(g: Grid, x: number, y: number, rx: number, ry: number, ribbons: number, len = 5): void {
  if (ribbons)
    RIB.forEach((c, i) => {
      const sx = x - 1 + i;
      for (let k = 0; k < len; k++) {
        const xx = Math.round(sx + ribbons * (k * 0.45) + (k % 2 ? 0.5 : 0) * ribbons);
        const yy = Math.round(y + ry) + k - (i === 1 ? 0 : 1);
        // 리본 끝은 칸 바닥(26) 위에서 끝난다 (앉으면 짧아 보인다)
        if (yy <= 26) g.set(xx, yy, k === len - 1 || yy === 26 ? mixC(c) : c);
      }
    });
  // 고리 (안쪽은 비어 있다)
  const inner = (xx: number, yy: number) => ((xx + 0.5 - x) / Math.max(0.6, rx - 1.6)) ** 2 + ((yy + 0.5 - y) / Math.max(0.6, ry - 1.6)) ** 2 <= 1;
  for (let yy = Math.floor(y - ry) - 1; yy <= Math.ceil(y + ry) + 1; yy++)
    for (let xx = Math.floor(x - rx) - 1; xx <= Math.ceil(x + rx) + 1; xx++) {
      const d = ((xx + 0.5 - x) / rx) ** 2 + ((yy + 0.5 - y) / ry) ** 2;
      if (d > 1) continue;
      if (rx > 2 && inner(xx, yy)) continue;
      const lit = (xx + 0.5 - x) / rx + (yy + 0.5 - y) / ry;
      g.set(xx, yy, lit < -0.7 ? 0xf06a6a : lit > 0.6 ? RIM_LO : RIM);
    }
  // 찰랑이 (고리 칸마다 은 동전 한 쌍)
  const n = rx > 2.5 ? 4 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / 4;
    const xx = Math.round(x - 0.5 + Math.cos(a) * (rx - 0.8));
    const yy = Math.round(y - 0.5 + Math.sin(a) * (ry - 0.8));
    g.set(xx, yy, SILVER_HI);
    if (rx > 2.5) g.set(xx + (Math.cos(a) > 0 ? -1 : 1) * 0, yy + (Math.sin(a) > 0 ? -1 : 1), GOLD);
  }
}
const mixC = (c: Color) => ((c >> 1) & 0x7f7f7f) + 0x404040;

function tamboBehind(g: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const { cx, shY } = m;
  const big = bigBody(fb);
  // 앞: 왼 어깨 뒤로 반쯤 숨은 고리 (칸 왼쪽 끝 x=1 안), 리본은 몸 뒤로. 옆: 등에 비스듬히, 리본 짧게
  if (v === "down") behind(g, (t) => tambo(t, cx - (big ? 6 : 5.4), shY - (fb === "tall" ? 3 : big ? 5 : 4), big ? 3 : 3.4, big ? 3 : 3.4, 0.4, 4));
  else if (v === "side") behind(g, (t) => tambo(t, cx - (big ? 6.5 : 5.5), shY - 2, 1.6, 4, 0.3, 3));
  void body;
}
function tamboBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, _sit: number, body: string): void {
  const g = safe(g0);
  if (layer !== "front") return;
  const { cx, shY, shL, shR } = m;
  const big = bigBody(fb);
  if (v === "down") {
    if (objectBody(body)) return;
    // 가슴을 가로지르는 분홍 끈
    if (!big) {
      const sb = Math.min(shY + 3, 26);
      line(g, shL, shY - 1, shR - 1, sb, GOLD);
      g.set(shR - 1, sb, GOLD_LO);
      g.set(shL + 1, shY - 1, GOLD_HI);
    } else {
      g.set(shL + 1, shY - 1, GOLD);
      g.set(shL + 2, shY, GOLD_LO);
    }
  } else if (v === "side") {
    if (!big) line(g, cx - 2, shY - 1, cx + 1, shY + 2, GOLD);
  } else {
    // 뒷모습: 어깨끈 + 등 한가운데 탬버린 + 리본
    line(g, cx - 4, shY - 1, cx + 3, shY - 1, GOLD_LO);
    tambo(g, cx - 0.5, Math.min(shY + 1, 21.8), big ? 4.6 : 4.2, 4.2, 0.6, 2);
  }
}
function tamboIcon(): Grid {
  const g = new Grid(16, 16);
  tambo(g, 7.5, 7.5, 6.1, 6.1, 0);
  // 리본 세 가닥 (오른쪽 아래로 흩날림)
  RIB.forEach((c, i) => {
    for (let k = 0; k < 4; k++) g.set(11 + i + (k >> 1), 11 + k + (i === 1 ? 0 : -1), c);
  });
  g.outline(0x1e1c1a, false, 170);
  g.set(3, 4, 0xffffff);
  return g;
}

// ── 알딸딸 오라: 발그레한 볼 + 머리 둘레로 보글보글 올라가는 분홍·금 거품 ──
function bubble(g: Grid, x: number, y: number, r: number, c: Color, a = 230): void {
  x = Math.round(x);
  y = Math.round(y);
  if (r <= 0) {
    dot(g, x, y, c, a);
    return;
  }
  const s = new Grid(7, 7);
  if (r === 1) {
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) s.set(3 + dx, 3 + dy, c, a);
    s.set(3, 3, 0xffffff, 90);
    s.set(2, 2, 0xffffff, a);
  } else {
    for (const [dx, dy] of [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [0, 2], [1, 2]] as const) s.set(3 + dx, 3 + dy, c, a);
    for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) s.set(3 + xx, 3 + yy, c, 60);
    s.set(2, 2, 0xffffff, 255);
  }
  over(g, s, x - 3, y - 3);
}
function tipsyIcon(): Grid {
  const g = new Grid(16, 16);
  const face = art(
    [
      "..hhhh..",
      ".hhhhhh.",
      "rsrrsrrr",
      "hhhhhhhh",
      "hkhhhkhh",
      "khkhkhkh",
      "bbhhhbbh",
      ".hhhhhl.",
      "..llll..",
    ],
    { h: 0xc8c0d8, l: 0x948aa8, k: 0x17161d, r: TIE, s: TIE_ST, b: BLUSH },
  );
  const f = new Grid(16, 16);
  f.draw(face, 1, 6);
  f.outline(0x1e1c1a, false, 170);
  g.draw(f, 0, 0);
  bubble(g, 12, 8, 2, 0xff9ac4, 255);
  bubble(g, 13, 3, 1, 0xffb8d8, 255);
  bubble(g, 9, 3, 0, 0xffffff, 255);
  return g;
}

// ── 꼬마 너구리 (펫): 회갈색 털 + 까만 눈 가리개 + 하얀 볼 털 + 끝이 까만 복슬 꼬리 + 머리에 작은 넥타이 ──
const RAC: Record<string, Color> = {
  f: 0x9a8470,
  h: 0xbca88e,
  l: 0x74624f,
  m: 0x3a2e2a,
  w: 0xf4ecda,
  W: 0xd8ccb4,
  o: 0xffffff,
  n: 0x241a18,
  t: 0x8a7460,
  x: 0x3e322c,
  p: 0x4a3c34,
  r: 0x5a4a3e,
  i: 0xe8c0a8,
  R: TIE,
  S: TIE_ST,
  b: 0xf6a0b0,
};
const RAC_LINE = 0x2e2420;
// 옆모습 (오른쪽을 본다) 14×11
const RAC_SIDE_A: Art = [
  ".........r.RS.",
  "........rhhRRh",
  "..xx....hhhwwh",
  ".xxt....fhmmom",
  ".ttt.hhhfwmwwn",
  "..tthffffwwww.",
  "...tfffffff...",
  "....lffffffl..",
  "....llllllll..",
  "....pp...pp...",
  "....p.....p...",
];
const RAC_SIDE_B = edit(RAC_SIDE_A, [
  [4, 10, "."], [5, 10, "p"], [10, 10, "."], [9, 10, "p"],
  [2, 2, "."], [3, 2, "."], [1, 3, "."], [2, 3, "x"], [3, 3, "x"], [0, 4, "x"], [1, 4, "t"],
]);
// 앞모습 12×11 (머리 위 넥타이 매듭, 처진 눈 가리개 + 반짝 눈)
const RAC_FRONT_A: Art = [
  "..r......r..",
  ".rir.RS.rir.",
  ".rhhhRRhhhr.",
  "hhwwhhhhwwhh",
  "hmmmwhhwmmmh",
  "wmomwwwwmomw",
  "wwmwwnnwwmww",
  ".wwwwbbwwww.",
  "..lffffffl..",
  "..pp....pp..",
  "..p......p..",
];
const RAC_FRONT_B = edit(RAC_FRONT_A, [[2, 10, "."], [3, 10, "p"], [9, 10, "."], [8, 10, "p"], [7, 7, "w"], [6, 7, "w"], [5, 7, "w"]]);
const RAC_BACK_A: Art = [
  "..r......r..",
  ".rrr.RS.rrr.",
  ".rhhhRRhhhr.",
  "hhhhhhhhhhhh",
  "hhffffffffhf",
  ".ffffffffff.",
  "..ffffffff..",
  "..lfffffflx.",
  "..lffffflxt.",
  "..pp....xtt.",
  "..p.....tx..",
];
const RAC_BACK_B = edit(RAC_BACK_A, [[2, 10, "."], [3, 10, "p"], [8, 9, "p"], [9, 9, "x"], [10, 9, "t"], [8, 10, "."], [9, 10, "t"], [10, 10, "x"], [10, 8, "t"], [11, 7, "x"], [10, 7, "t"]]);
const racViews = {
  side: [petCel(RAC_SIDE_A, RAC, RAC_LINE), petCel(RAC_SIDE_B, RAC, RAC_LINE)],
  down: [petCel(RAC_FRONT_A, RAC, RAC_LINE), petCel(RAC_FRONT_B, RAC, RAC_LINE)],
  up: [petCel(RAC_BACK_A, RAC, RAC_LINE), petCel(RAC_BACK_B, RAC, RAC_LINE)],
};
function racIcon(): Grid {
  return centerIn(racViews.down[0], 14);
}


// 새 세트 2 「해맞이 산행」 (1/2): 해돋이 털모자 · 등산 배낭 · 믹스커피 보온병 · 첫 햇살 오라 · 꼬마 산양
// 한 벌 색: 다홍 → 주황 → 노랑으로 물드는 니트 · 숲빛 초록 배낭 + 주황 덮개 + 노랑 돗자리 · 은빛 보온병 + 빨간 뚜껑 · 금빛 해

const RED = 0xd8463a;
const RED_LO = 0xa02e2e;
const ORA = 0xf07a32;
const ORA_HI = 0xffa050;
const AMB = 0xf8a838;
const YEL = 0xf8d050;
const YEL_LO = 0xd0a030;
const YEL_HI = 0xfff0a0;
const GRN = 0x3e7a4a;
const GRN_HI = 0x5e9e62;
const GRN_LO = 0x2a5634;
const STRAP = 0x2e3a2e;
const MAT = 0x4a8ad0;
const MAT_LO = 0x2e5e9a;
const STEEL = 0xc8d0dc;
const STEEL_HI = 0xf4f8fc;
const STEEL_LO = 0x8a94a4;

// ── 해돋이 털모자: 다홍 정수리 → 주황 → 노랑 단 + 해님 방울 ──
function beanieHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const rx = Math.round(m.rx);
  const rows: [number, number, Color, Color, Color][] = [
    [top - 2, Math.max(2, Math.round(rx * 0.6)), RED, 0xe85a40, RED_LO],
    [top - 1, rx, ORA, ORA_HI, 0xc85a28],
    [top, rx, AMB, 0xffc060, 0xd08428],
  ];
  for (const [y, h, c, hi, lo] of rows)
    for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? lo : x === cx - h ? hi : (x * 3 + y) % 5 === 0 ? hi : c);
  // 노랑 골지 단 (두 줄)
  for (let x = cx - rx; x < cx + rx; x++) {
    g.set(x, top + 1, (x + 40) % 2 ? YEL : YEL_HI);
    g.set(x, top + 2, x >= cx + rx - 2 ? YEL_LO : (x + 40) % 2 ? YEL_LO : YEL);
  }
  // 앞 단에 작은 해 자수 (반원 + 빛살)
  if (v === "down") {
    g.set(cx - 1, top + 1, RED);
    g.set(cx, top + 1, RED);
    g.set(cx - 2, top + 2, ORA);
    g.set(cx + 1, top + 2, ORA);
  }
  // 해님 방울 (3×3, 모서리 깎음) — 꼭대기에서 살짝 뒤로
  const px = v === "side" ? cx - 2 : cx - 1;
  const py = Math.max(SAFE_TOP, top - 5);
  g.set(px, py, YEL_HI);
  g.set(px + 1, py, YEL);
  g.set(px - 1, py + 1, YEL);
  g.set(px, py + 1, YEL_HI);
  g.set(px + 1, py + 1, YEL);
  g.set(px + 2, py + 1, YEL_LO);
  g.set(px, py + 2, YEL_LO);
  g.set(px + 1, py + 2, YEL_LO);
  void fb;
}
function beanieIcon(): Grid {
  return iconOf(
    [
      ".....yYy.....",
      "....yYyyl....",
      ".....lll.....",
      "....rrrrr....",
      "..rRrrrrrrq..",
      ".oOoooooooqq.",
      ".aAaaaaaaaaq.",
      "yYyYyrryYyYyl",
      "lylyoylyoylyl",
    ],
    { r: RED, R: 0xe85a40, q: RED_LO, o: ORA, O: ORA_HI, a: AMB, A: 0xffc060, y: YEL, Y: YEL_HI, l: YEL_LO },
  );
}

// ── 등산 배낭: 숲빛 초록 몸 + 주황 덮개 + 위에 말아 얹은 파랑 돗자리 + 옆에 매단 양은 컵 + 정상 리본 ──
function matRoll(g: Grid, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) {
    const end = x === x0 || x === x1;
    g.set(x, y, end ? MAT_LO : (x - x0) % 4 === 1 ? YEL : MAT);
    g.set(x, y + 1, end ? MAT_LO : (x - x0) % 4 === 1 ? YEL_LO : MAT_LO);
  }
}
function packBody(g: Grid, x0: number, w: number, y0: number, h0: number, ribbon: 1 | -1 | 0): void {
  // 바닥 줄은 칸 바닥(26)까지 — 앉은 자세에선 배낭이 한두 칸 짧아진다
  const h = Math.max(4, Math.min(h0, 27 - y0));
  // 몸통 (위 모서리 둥글게)
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      if (y === y0 && (x === x0 || x === x0 + w - 1)) continue;
      g.set(x, y, x === x0 ? GRN_HI : x >= x0 + w - 2 ? GRN_LO : GRN);
    }
  // 주황 덮개 (위 두 줄) + 버클
  for (let x = x0; x < x0 + w; x++) {
    if (!(x === x0 || x === x0 + w - 1)) g.set(x, y0, ORA_HI);
    g.set(x, y0 + 1, x >= x0 + w - 2 ? 0xc85a28 : ORA);
  }
  const mid = x0 + Math.floor(w / 2);
  g.set(mid - 1, y0 + 2, 0x1e2420);
  g.set(mid, y0 + 2, 0x1e2420);
  // 앞주머니
  if (h >= 6) {
    for (let x = x0 + 1; x < x0 + w - 1; x++) g.set(x, y0 + h - 3, GRN_LO);
    g.set(mid - 1, y0 + h - 2, GRN_HI);
  }
  // 정상 리본 (빨강·노랑 두 가닥이 옆으로 나부낀다)
  if (ribbon) {
    const rx = ribbon > 0 ? x0 + w : x0 - 1;
    g.set(rx, y0 + 1, RED);
    g.set(rx + ribbon, y0 + 2, RED);
    g.set(rx + ribbon, y0 + 1, YEL);
    g.set(rx + 2 * ribbon, y0 + 2, YEL);
  }
}
function cup(g: Grid, x: number, y: number): void {
  g.set(x, y, STEEL_LO);
  g.set(x, y + 1, STEEL);
  g.set(x + 1, y + 1, STEEL_HI);
  g.set(x, y + 2, STEEL_LO);
  g.set(x + 1, y + 2, STEEL);
}
function packBehind(g: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const { cx, shY } = m;
  const big = bigBody(fb);
  if (v === "down") {
    behind(g, (t) => {
      // 머리 양옆으로 삐죽 나온 돗자리 끝 + 어깨 위 배낭 윗단
      const half = big ? 9 : 8;
      matRoll(t, cx - half, cx + half - 1, shY - (fb === "tall" ? 5 : 7));
      // 리본은 오른쪽으로 두 칸만 (칸 오른쪽 끝 x=18 안)
      packBody(t, cx - (big ? 7 : 6), big ? 13 : 12, shY - (fb === "tall" ? 3 : 5), 5, big ? 0 : 1);
    });
  } else if (v === "side") {
    behind(g, (t) => {
      // 옆: 등 뒤 x = cx-9부터 (칸 왼쪽 끝 안). 리본은 위로 나부끼게 안쪽으로
      const x0 = cx - 9;
      matRoll(t, x0 + 1, x0 + 6, shY - 6);
      packBody(t, x0 + 1, 6, shY - 4, 8, 0);
      cup(t, x0, shY);
      t.set(x0 + 2, shY - 7, RED);
      t.set(x0 + 3, shY - 8, YEL);
    });
  }
  void body;
}
function packBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, _sit: number, body: string): void {
  const g = safe(g0);
  if (layer !== "front") return;
  const { cx, shY, shL, shR } = m;
  const big = bigBody(fb);
  if (v === "down") {
    if (objectBody(body)) return;
    // 어깨끈 두 줄 + 가슴끈
    if (!big) {
      const sb = Math.min(shY + 3, 26);
      g.vline(shL + 1, shY, sb, STRAP);
      g.vline(shR - 1, shY, sb, STRAP);
      g.hline(shL + 1, shR - 1, Math.min(shY + 2, 26), ORA);
      g.set(cx - 1, shY + 2, 0x1e2420);
    } else {
      g.set(shL + 2, shY - 1, STRAP);
      g.set(shR - 2, shY - 1, STRAP);
    }
  } else if (v === "side") {
    if (!big) g.vline(cx - 1, shY, Math.min(shY + 3, 26), STRAP);
  } else {
    // 뒷모습: 등을 다 덮는 배낭 + 위에 돗자리 + 옆에 컵
    const w = big ? 11 : fb === "tall" ? 8 : 9;
    const x0 = Math.round(cx - w / 2);
    matRoll(g, x0 - 1, x0 + w, shY - 4);
    packBody(g, x0, w, shY - 2, 8, 1);
    cup(g, x0 - 2, Math.min(shY + 1, 24));
  }
}
function packIcon(): Grid {
  const g = new Grid(16, 16);
  matRoll(g, 3, 14, 2);
  packBody(g, 4, 10, 4, 11, -1);
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 믹스커피 보온병: 은빛 몸 + 빨간 컵 뚜껑 + 김 ──
function flaskHand(g0: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const g = g0;
  const x = m.hx;
  const y = m.hY;
  // 몸 (2×5) + 밝은 결
  for (let yy = y - 2; yy <= y + 2; yy++) {
    g.set(x - 1, yy, yy === y - 1 ? STEEL_HI : STEEL);
    g.set(x, yy, STEEL_LO);
  }
  g.set(x - 1, y + 2, STEEL_LO);
  // 빨간 컵 뚜껑 (위로 조금 넓게)
  g.set(x - 1, y - 3, RED);
  g.set(x, y - 3, RED_LO);
  g.set(x - 2, y - 4, 0xf06050);
  g.set(x - 1, y - 4, RED);
  g.set(x, y - 4, RED);
  g.set(x + 1, y - 4, RED_LO);
}
function flaskGlow(g: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  dot(g, m.hx, m.hY - 6, 0xffffff, 170);
  dot(g, m.hx - 1, m.hY - 7, 0xffffff, 120);
  dot(g, m.hx, m.hY - 8, 0xffffff, 70);
}
function flaskIcon(): Grid {
  return iconOf(
    [
      "..s.....",
      "...s....",
      "..s.....",
      ".RrrrQ..",
      "..rrQ...",
      "..WSL...",
      "..WSL...",
      "..SSL...",
      "..WSL...",
      "..SSL...",
      "..SSL...",
      "..LLL...",
    ],
    { r: RED, R: 0xf06050, Q: RED_LO, W: STEEL_HI, S: STEEL, L: STEEL_LO, s: 0xffffff },
    (g, ox, oy) => {
      // 김은 외곽선 없이 반투명
      for (const [x, y] of [[2, 0], [3, 1], [2, 2]]) g.set(ox + x, oy + y, 0xffffff, 150);
    },
  );
}

// ── 첫 햇살 오라: 등 뒤로 떠오르는 큰 해 (아래쪽은 구름 틈) + 빛살 + 금빛 반짝 ──
/** phase = 1이면 긴·짧은 빛살이 자리를 바꾼다 (반짝이는 두 장 — seasonSetFx3) */
function sunDisk(g: Grid, x: number, y: number, r: number, a = 235, phase = 0): void {
  const s = new Grid(r * 2 + 16, r * 2 + 16);
  const o = r + 8;
  // 바깥 번짐
  s.ellipse(o, o, r + 2.2, r + 2.2, 0xffd070, 60);
  s.ellipse(o, o, r + 1.2, r + 1.2, 0xffc060, 110);
  for (let yy = -r; yy <= r; yy++)
    for (let xx = -r; xx <= r; xx++) {
      if ((xx + 0.5) ** 2 + (yy + 0.5) ** 2 > r * r) continue;
      const t = (yy + r) / (2 * r);
      // 아래쪽 가는 구름 틈 (두 줄)
      if (yy === Math.round(r * 0.35) || yy === Math.round(r * 0.68)) {
        s.set(o + xx, o + yy, 0xffb0a0, 120);
        continue;
      }
      const c = t < 0.35 ? (t < 0.12 ? 0xfff2a8 : 0xffd860) : t < 0.6 ? 0xffb048 : 0xf8783a;
      s.set(o + xx, o + yy, c, 255);
    }
  // 빛살 (짧고 긴 것 번갈아)
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2 + Math.PI / 12;
    if (Math.sin(th) > 0.55) continue; // 아래쪽은 땅에 가려 없다
    const r0 = r + 3;
    const r1 = r + ((i + phase) % 2 ? 5 : 7);
    for (let k = r0; k <= r1; k++) s.set(Math.round(o + Math.cos(th) * k), Math.round(o + Math.sin(th) * k), 0xffd860, k === r1 ? 120 : 200);
  }
  over(g, s, Math.round(x - o), Math.round(y - o), a / 255);
}
function sunIcon(): Grid {
  // 산 능선 위로 떠오르는 해 (칸 안 1..14에 들게 작은 빛살)
  const g = new Grid(16, 16);
  const cx = 7.5;
  const cy = 9;
  const r = 4.6;
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2 + Math.PI / 8;
    if (Math.sin(th) > 0.3) continue;
    for (let k = r + 1.4; k <= r + 2.2; k += 0.4) g.set(Math.round(cx + Math.cos(th) * k - 0.5), Math.round(cy + Math.sin(th) * k - 0.5), 0xffd860);
  }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      const t = (y + 0.5 - (cy - r)) / (2 * r);
      g.set(x, y, t < 0.2 ? 0xfff2a8 : t < 0.45 ? 0xffd860 : t < 0.7 ? 0xffb048 : 0xf8783a);
    }
  // 산 능선 둘 (가운데가 겹친다)
  for (let x = 1; x <= 14; x++) {
    const top = Math.min(Math.round(9 + Math.abs(x - 4) * 0.9), Math.round(10 + Math.abs(x - 11) * 0.8));
    for (let y = top; y <= 14; y++) g.set(x, y, y === top ? 0x6a7a9a : 0x3a4866);
  }
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 꼬마 산양 (펫): 크림빛 회색 털 + 까만 작은 뿔 + 새해 빨간 목도리 ──
const GOAT: Record<string, Color> = {
  f: 0xd6cec2,
  h: 0xf2ece2,
  l: 0xa89c8e,
  d: 0x8a7a68,
  k: 0x3a3230,
  K: 0x7a6e66,
  w: 0xffffff,
  E: 0x1e1a18,
  n: 0x4a3a34,
  m: 0xeae2d6,
  e: 0xc8bcae,
  i: 0xf0c0b0,
  L: 0x8a7c6c,
  p: 0x3a3230,
  R: RED,
  Q: RED_LO,
  Y: YEL,
  b: 0xf6b0b8,
};
const GOAT_LINE = 0x3a3028;
const GOAT_SIDE_A: Art = [
  "..........kK..",
  ".........kfhh.",
  ".......eefhhhh",
  "........ffhEhm",
  "........fffmmn",
  "..dddddRRRmm..",
  ".hhhhhhRQh....",
  "thffffffQf....",
  ".lffffffff....",
  "..lllllll.....",
  "..L.L..L.L....",
  "..p.p..p.p....",
];
const GOAT_SIDE_B = edit(GOAT_SIDE_A, [
  [2, 10, "."], [3, 10, "L"], [2, 11, "."], [3, 11, "p"],
  [9, 10, "."], [8, 10, "L"], [9, 11, "."], [8, 11, "p"],
  [7, 10, "."], [6, 10, "L"], [7, 11, "."], [6, 11, "p"],
  [8, 8, "Q"], [8, 7, "f"],
]);
const GOAT_FRONT_A: Art = [
  "...k....k...",
  "...kK..Kk...",
  ".eehhhhhhee.",
  "eie.hhhh.eie",
  "...fEhhEf...",
  "...fhmmhf...",
  "....mnnm....",
  "...RRRRRR...",
  "..lhhRQhhl..",
  "..lffRQffl..",
  "..L.L..L.L..",
  "..p.p..p.p..",
];
const GOAT_FRONT_B = edit(GOAT_FRONT_A, [[2, 10, "."], [2, 11, "."], [3, 10, "L"], [3, 11, "p"], [9, 10, "."], [9, 11, "."], [8, 10, "L"], [8, 11, "p"], [7, 10, "."], [7, 11, "."], [4, 10, "."], [4, 11, "."], [5, 10, "L"], [5, 11, "p"], [6, 10, "L"], [6, 11, "p"]]);
const GOAT_BACK_A: Art = [
  "...k....k...",
  "...kK..Kk...",
  ".eehhhhhhee.",
  "eie.ffff.eie",
  "...ffffff...",
  "...ffddff...",
  "....fddf....",
  "...RRRRRR...",
  "..lhfRQfhl..",
  "..lffdQffl..",
  "..L.LhhL.L..",
  "..p.p..p.p..",
];
const GOAT_BACK_B = edit(GOAT_BACK_A, [[2, 10, "."], [2, 11, "."], [3, 10, "L"], [3, 11, "p"], [9, 10, "."], [9, 11, "."], [8, 10, "L"], [8, 11, "p"], [7, 10, "."], [7, 11, "."], [4, 10, "."], [4, 11, "."], [5, 10, "h"], [6, 10, "L"], [6, 11, "p"]]);
const goatViews = {
  side: [petCel(GOAT_SIDE_A, GOAT, GOAT_LINE), petCel(GOAT_SIDE_B, GOAT, GOAT_LINE)],
  down: [petCel(GOAT_FRONT_A, GOAT, GOAT_LINE), petCel(GOAT_FRONT_B, GOAT, GOAT_LINE)],
  up: [petCel(GOAT_BACK_A, GOAT, GOAT_LINE), petCel(GOAT_BACK_B, GOAT, GOAT_LINE)],
};


// 새 세트 3 「작심삼일」 (1/9): 헬스 머리띠 · 단백질 쉐이크 · 새 운동 가방 · 새해 계획표 이름표 · 사흘째 발자국 (펫 없음)
// 한 벌 색: 하얀 타월 머리띠 + 형광 분홍·민트 줄 · 초코 쉐이크 · 남색 더플백 + 형광 분홍 띠 + 하얀 가격표

const WHITE = 0xfafafa;
const TOWEL = 0xe8ecf2;
const TOWEL_LO = 0xc4ccd8;
const NPINK = 0xff4f9a;
const NPINK_LO = 0xc8306e;
const MINT = 0x3ad8c0;
const MINT_LO = 0x1e9a8a;
const DROP = 0x9ee4ff;
const CAP = 0x2a2a32;
const CAP_HI = 0x50505e;
const CHOCO = 0x8a5634;
const CHOCO_LO = 0x5e3820;
const CHOCO_HI = 0xc08a5c;
const BOTTLE = 0xe4eef6;
const NAVY = 0x2c3654;
const NAVY_HI = 0x46527c;
const NAVY_LO = 0x1a2036;
const TAG = 0xffffff;
const TAG_RED = 0xe84040;

// ── 헬스 머리띠: 분홍 줄 · 하얀 타월 · 민트 줄 세 겹 + 관자놀이 땀방울 ──
function bandHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const rowsY: [number, (x: number, x0: number, x1: number) => Color][] = [
    [top + 1, (x, x0, x1) => (x >= x1 - 1 ? NPINK_LO : NPINK)],
    [top + 2, (x, x0, x1) => (x >= x1 - 1 ? TOWEL_LO : x === x0 ? WHITE : (x + 20) % 2 ? TOWEL : WHITE)],
    [top + 3, (x, x0, x1) => (x >= x1 - 1 ? MINT_LO : MINT)],
  ];
  for (const [y, col] of rowsY) {
    const half = Math.max(2, halfAt(m, y) + 0.4);
    const x0 = Math.round(m.cx - half);
    const x1 = Math.round(m.cx + half) - 1;
    for (let x = x0; x <= x1; x++) g.set(x, y, col(x, x0, x1));
  }
  // 앞모습: 가운데 작은 아령 자수
  if (v === "down") {
    g.set(m.cx - 2, top + 2, CAP);
    g.set(m.cx - 1, top + 2, CAP_HI);
    g.set(m.cx, top + 2, CAP_HI);
    g.set(m.cx + 1, top + 2, CAP);
  }
  void fb;
}
function bandGlow(g0: Grid, v: V, m: GearM, _fb: FB, top: number): void {
  if (v === "up") return;
  const g = safe(g0);
  // 땀방울 (관자놀이 옆, 외곽선 밖)
  const y = top + 5;
  const x = v === "side" ? Math.round(m.cx + halfAt(m, y)) - 3 : Math.round(m.cx - halfAt(m, y)) - 1;
  g.set(x, y, DROP);
  g.set(x, y + 1, 0x5ab0e0);
  g.set(x, y - 1, 0xffffff, 200);
}
function bandIcon(): Grid {
  return iconOf(
    [
      "...pppppppp...",
      ".ppPpppppppqq.",
      "pwWwwWwwkKkwwt",
      "wwWwWwWwwwwwwt",
      "mmmmmmmmmmmmnn",
      ".mmm......mmn.",
      "..d...........",
      "..D...........",
    ],
    { p: NPINK, P: 0xff8ac0, q: NPINK_LO, w: TOWEL, W: WHITE, t: TOWEL_LO, m: MINT, n: MINT_LO, k: CAP, K: CAP_HI, d: DROP, D: 0x5ab0e0 },
  );
}

// ── 단백질 쉐이크: 까만 뚜껑 + 반투명 통 + 초코 ──
function shakeHand(g0: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const g = g0;
  const x = m.hx;
  const y = m.hY;
  // 뚜껑 + 꼭지 고리
  g.set(x - 1, y - 3, CAP_HI);
  g.set(x, y - 3, CAP);
  g.set(x + 1, y - 3, CAP);
  g.set(x, y - 4, CAP);
  g.set(x + 1, y - 5, CAP_HI);
  // 통 (위는 거품, 아래는 초코)
  for (let yy = y - 2; yy <= y + 2; yy++) {
    const foam = yy === y - 2;
    g.set(x - 1, yy, foam ? BOTTLE : yy === y - 1 ? BOTTLE : CHOCO_HI);
    g.set(x, yy, foam ? 0xe8d0b0 : CHOCO);
    g.set(x + 1, yy, foam ? 0xc8a888 : CHOCO_LO);
  }
}
function shakeIcon(): Grid {
  return iconOf(
    [
      ".....kk..",
      "....k..k.",
      "..KKKkkk.",
      "..kkkkkk.",
      "..wffffl.",
      "..wwfffl.",
      "..hcwccL.",
      "..hcccCL.",
      "..hcwccL.",
      "..hcccCL.",
      "..hcwccL.",
      "..hcccCL.",
      "..LLLLLL.",
    ],
    { k: CAP, K: CAP_HI, w: BOTTLE, f: 0xe8d0b0, l: 0xc8a888, h: CHOCO_HI, c: CHOCO, C: CHOCO_LO, L: CHOCO_LO },
    (g, ox, oy) => {
      g.set(ox + 4, oy + 6, 0xffffff);
      g.set(ox + 4, oy + 8, 0xffffff);
      g.set(ox + 4, oy + 10, 0xffffff);
    },
  );
}

// ── 새 운동 가방: 남색 더플백 + 형광 분홍 띠 + 손잡이 + 아직 안 뗀 하얀 가격표 ──
function duffel(g: Grid, x0: number, y0: number, w: number, h0: number, tag: 1 | -1 | 0): void {
  const h = Math.max(3, Math.min(h0, 27 - y0));
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const corner = (x === x0 || x === x0 + w - 1) && (y === y0 || y === y0 + h - 1);
      if (corner) continue;
      const end = x === x0 || x === x0 + w - 1;
      let c: Color = y === y0 ? NAVY_HI : y === y0 + h - 1 ? NAVY_LO : NAVY;
      if (end) c = NAVY_LO;
      if (y === y0 + Math.floor(h / 2)) c = end ? NPINK_LO : NPINK;
      g.set(x, y, c);
    }
  // 손잡이 고리 둘
  const m1 = x0 + Math.floor(w / 2) - 2;
  g.set(m1, y0 - 1, NAVY_LO);
  g.set(m1 + 1, y0 - 2, NAVY_LO);
  g.set(m1 + 2, y0 - 2, NAVY_LO);
  g.set(m1 + 3, y0 - 1, NAVY_LO);
  // 가격표 (끈 + 하얀 표 + 빨간 줄)
  if (tag) {
    const tx = tag > 0 ? x0 + w : x0 - 1;
    g.set(tx, y0 + 1, 0xb0b8c8);
    g.set(tx + tag, y0 + 2, TAG);
    g.set(tx + tag, y0 + 3, TAG_RED);
    g.set(tx + tag, y0 + 4, TAG);
    g.set(tx + 2 * tag, y0 + 2, TAG);
    g.set(tx + 2 * tag, y0 + 3, TAG);
    g.set(tx + 2 * tag, y0 + 4, 0xd8dce4);
  }
}
function bagBehind(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx, shY } = m;
  const big = bigBody(fb);
  // 앞·옆: 왼 허리 뒤로 가방 끝만 (x = cx-8부터, 칸 안). 가격표는 뒷모습에서만
  if (v === "down") behind(g, (t) => duffel(t, cx - 8, shY + (big ? 2 : 0), 5, 5, 0));
  else if (v === "side") behind(g, (t) => duffel(t, cx - 8, shY, 5, 5, 0));
}
function bagBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, _sit: number, body: string): void {
  const g = safe(g0);
  if (layer !== "front") return;
  const { cx, shY, shL, shR } = m;
  const big = bigBody(fb);
  if (v === "down") {
    if (objectBody(body)) return;
    // 오른 어깨에서 왼 허리로 비스듬한 끈
    if (!big) line(g, shR - 1, shY - 1, shL, Math.min(shY + 3, 26), NAVY_LO);
    else g.set(shR - 2, shY - 1, NAVY_LO);
  } else if (v === "side") {
    if (!big) line(g, cx + 1, shY - 1, cx - 2, shY + 2, NAVY_LO);
  } else {
    // 뒷모습: 등을 가로지르는 더플백 + 오른쪽 끝에 가격표
    const w = 11;
    line(g, cx - 3, shY - 1, cx + 3, shY + 1, NAVY_LO);
    duffel(g, Math.round(cx - w / 2) - 1, Math.min(shY + 1, 22), w, 5, 1);
  }
}
function bagIcon(): Grid {
  const g = new Grid(16, 16);
  duffel(g, 1, 6, 11, 7, 1);
  // 어깨끈
  for (let x = 3; x <= 9; x++) g.set(x, Math.round(5 - Math.sin(((x - 3) / 6) * Math.PI) * 3), NAVY_LO);
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 새해 계획표 이름표 (판은 compose.py — 아이콘만) ──
function plannerIcon(): Grid {
  return iconOf(
    [
      ".r.r.r.r.r.",
      "ppppppppppp",
      "pbbbpllllll",
      "pb.bpllllll",
      "pbbbp......",
      "pbbbpllllll",
      "pb.bpllllll",
      "pbbbp......",
      "pbbbpllllll",
      "pb.bp......",
      "pbbbp......",
      "ppppppppppp",
    ],
    { p: 0xfbf6e8, b: 0x5a6680, l: 0xa8c4e8, r: 0x8a92a4 },
    (g, ox, oy) => {
      // 체크 두 개는 초록, 셋째 칸은 비어 있다
      for (const by of [2, 5]) {
        g.set(ox + 2, oy + by + 1, 0x3aa86a);
        g.set(ox + 3, oy + by, 0x3aa86a);
        g.set(ox + 4, oy + by - 1, 0x3aa86a);
      }
      g.set(ox + 2, oy + 9, 0xffffff);
      // 빨간 여백선
      for (let y = 1; y < 11; y++) g.set(ox + 5, oy + y, 0xe88a8a);
    },
  );
}

// ── 사흘째 발자국: 형광 운동화 자국 (둘) → 삼선 슬리퍼 자국 ──
const SNEAK = [".pp.", "pppp", "pqqp", "pppp", ".pp.", ".pp.", ".qq."];
const SLIP = [".nnn.", "nwnwn", "nwnwn", "nwnwn", "nnnnn", "nnnnn", ".nnn."];
function sneaker(): Grid {
  const g = new Grid(4, 7);
  SNEAK.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && g.set(x, y, ch === "p" ? NPINK : 0xffb0d0, 190)));
  return g;
}
function slipper(): Grid {
  const g = new Grid(5, 7);
  SLIP.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && g.set(x, y, ch === "n" ? 0x3a5ab0 : 0xf4f8ff, 200)));
  return g;
}
function day3Icon(): Grid {
  const g = new Grid(16, 16);
  const big = (a: string[], pal: Record<string, Color>, ox: number, oy: number) => a.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && g.set(ox + x, oy + y, pal[ch])));
  big([".pppp.", "pppppp", "pqqqqp", "pppppp", "pqqqqp", ".pppp.", "..pp..", ".pppp.", ".pqqp.", "..pp.."], { p: NPINK, q: 0xffb0d0 }, 1, 1);
  big([".nnnnn.", "nnnnnnn", "nwnwnwn", "nwnwnwn", "nwnwnwn", "nnnnnnn", "nnnnnnn", "nnnnnnn", ".nnnnn."], { n: 0x3a5ab0, w: 0xf4f8ff }, 8, 6);
  g.outline(0x1e1c1a, false, 160);
  return g;
}


// 새 세트 4 「빙어 축제」 (1/16): 털 귀마개 · 빙어 낚싯대 · 빙어 아이스박스 · 핫팩 오라 · 빙어 도둑 펭귄
// 한 벌 색: 분홍 털 귀마개 + 연보라 띠 · 빨강·하양 얼음낚싯대 + 은빛 빙어 · 하늘색 아이스박스 + 하얀 뚜껑 · 주황 온기

const MUFF = 0xf8b4c8;
const MUFF_HI = 0xffe2ec;
const MUFF_LO = 0xd88aa4;
const BAND = 0x8a7ab8;
const BAND_HI = 0xb4a6dc;
const ROD = 0xe23a40;
const ROD_W = 0xf6f6f6;
const CORK = 0xc89a62;
const LINE = 0xdfe6ee;
const SMELT = 0xe4f0f8;
const SMELT_BK = 0x8ab4cc;
const SMELT_EYE = 0x1a2a3a;
const BOX = 0x5ab4e8;
const BOX_HI = 0x8ad0f6;
const BOX_LO = 0x3a86c0;
const LID = 0xf4f8fc;
const LID_LO = 0xc8d6e4;
const WARM = 0xff8a3a;
const WARM_HI = 0xffd080;

// ── 털 귀마개: 양 귀 자리에 복슬 털 뭉치 + 머리 위를 넘는 연보라 띠 ──
function puff(g: Grid, x: number, y: number, rx: number, ry: number): void {
  for (let yy = Math.floor(y - ry); yy <= Math.ceil(y + ry); yy++)
    for (let xx = Math.floor(x - rx); xx <= Math.ceil(x + rx); xx++) {
      const dx = (xx + 0.5 - x) / rx;
      const dy = (yy + 0.5 - y) / ry;
      if (dx * dx + dy * dy > 1) continue;
      g.set(xx, yy, dx + dy < -0.6 ? MUFF_HI : dx + dy > 0.7 ? MUFF_LO : (xx + yy) % 3 === 0 ? MUFF_HI : MUFF);
    }
}
function earY(m: GearM, fb: FB): number {
  return Math.round(fb === "round" ? m.hy - 3 : fb === "tall" ? m.hy : m.hy);
}
function muffHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const ey = earY(m, fb);
  if (v === "side") {
    // 띠: 머리 위를 넘어 귀 자리로
    for (let y = top - 1; y < ey - 1; y++) g.set(cx - 1, y, y === top - 1 ? BAND_HI : BAND);
    for (let x = cx - 3; x <= cx + 1; x++) g.set(x, top - 1, x === cx - 3 ? BAND_HI : BAND);
    puff(g, cx - 0.5, ey + 0.5, 2.3, 2.6);
    return;
  }
  // 띠: 정수리 위 한 줄 + 양옆으로 내려와 털 뭉치에 닿는다
  const ht = Math.max(2, Math.round(halfAt(m, top + 1)));
  for (let x = cx - ht; x < cx + ht; x++) g.set(x, top - 1, (x + 30) % 4 === 0 ? BAND_HI : BAND);
  for (let y = top; y < ey - 1; y++) {
    const h = Math.round(halfAt(m, y) + 0.5);
    g.set(cx - h - 1, y, BAND);
    g.set(cx + h, y, BAND);
  }
  const hw = m.rx + 0.3;
  puff(g, cx - hw - 0.2, ey + 0.5, 1.9, 2.5);
  puff(g, cx + hw + 0.2, ey + 0.5, 1.9, 2.5);
  void v;
}
function muffIcon(): Grid {
  const g = new Grid(16, 16);
  // 띠 (반원)
  for (let i = 0; i <= 20; i++) {
    const a = Math.PI + (i / 20) * Math.PI;
    g.set(Math.round(7.5 + Math.cos(a) * 4.6), Math.round(9 + Math.sin(a) * 6.5), i % 5 === 0 ? BAND_HI : BAND);
  }
  puff(g, 3.3, 10.5, 2.3, 3.2);
  puff(g, 12.7, 10.5, 2.3, 3.2);
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 빙어 낚싯대: 코르크 손잡이 + 빨강·하양 낚싯대 + 줄 끝에 파닥이는 빙어 ──
function smelt(g: Grid, x: number, y: number, wiggle: number): void {
  // 세로로 매달린 빙어 (머리 위 · 꼬리 아래)
  g.set(x, y, SMELT_BK);
  g.set(x, y + 1, SMELT_EYE);
  g.set(x, y + 2, SMELT);
  g.set(x + wiggle, y + 3, SMELT);
  g.set(x - 1 + wiggle, y + 4, SMELT_BK);
  g.set(x + 1 + wiggle, y + 4, SMELT_BK);
}
function rodHand(g0: Grid, v: V, m: GearM): void {
  if (v === "up") return;
  const g = g0;
  const x = m.hx;
  const y = m.hY;
  g.set(x, y, CORK);
  g.set(x, y + 1, 0x9a7040);
  // 낚싯대: 손에서 위로, 끝은 앞으로 (손이 칸 오른쪽에 붙은 몸은 끝을 안쪽으로 — 빙어 꼬리까지 x ≤ 17)
  const dx = Math.min(2, 16 - x);
  const tipY = y - 5;
  for (let i = 1; i <= 5; i++) g.set(x + Math.round((dx * i) / 5), y - i, i % 2 ? ROD : ROD_W);
  // 줄 + 빙어 (빙어 다섯 줄이 칸 바닥 위에 들게)
  const fx = x + dx + (dx >= 0 ? 1 : -1);
  const fy = Math.min(y, 22);
  for (let yy = tipY + 1; yy < fy; yy++) g.set(fx, yy, LINE, 170);
  g.set(fx, tipY, LINE, 170);
  smelt(g, fx, fy, 0);
}
function rodIcon(): Grid {
  const g = new Grid(16, 16);
  line(g, 2, 14, 9, 2, ROD);
  for (let i = 0; i < 7; i++) if (i % 2) g.set(Math.round(2 + i * 1), Math.round(14 - i * 1.7), ROD_W);
  g.set(2, 14, CORK);
  g.set(3, 13, CORK);
  g.set(2, 13, 0x9a7040);
  g.vline(10, 2, 6, LINE);
  // 큰 빙어 (세로)
  const f = [".b.", "beb", "sss", "sws", "sss", ".s.", "b.b"];
  f.forEach((r, yy) => [...r].forEach((ch, xx) => ch !== "." && g.set(9 + xx, 7 + yy, ch === "b" ? SMELT_BK : ch === "e" ? SMELT_EYE : ch === "w" ? 0xffffff : SMELT)));
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 빙어 아이스박스: 하늘색 통 + 하얀 뚜껑 + 손잡이 + 삐져나온 빙어 꼬리 ──
function icebox(g: Grid, x0: number, y0: number, w: number, h0: number, tail: boolean): void {
  const h = Math.max(3, Math.min(h0, 27 - y0));
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const lid = y < y0 + 2;
      let c: Color = lid ? (y === y0 ? LID : LID_LO) : x === x0 ? BOX_HI : x >= x0 + w - 2 ? BOX_LO : BOX;
      if (!lid && y === y0 + h - 1) c = BOX_LO;
      if (y === y0 && (x === x0 || x === x0 + w - 1)) continue;
      g.set(x, y, c);
    }
  // 걸쇠 (양옆 회색)
  g.set(x0, y0 + 2, 0x6a7a8a);
  g.set(x0 + w - 1, y0 + 2, 0x6a7a8a);
  // 하얀 물고기 그림 (가운데)
  if (w >= 7 && h >= 5) {
    const mx = x0 + Math.floor(w / 2);
    const my = y0 + 3 + Math.floor((h - 4) / 2);
    g.set(mx - 1, my, 0xffffff);
    g.set(mx, my, 0xffffff);
    g.set(mx + 1, my - 1, 0xffffff);
    g.set(mx + 1, my + 1, 0xffffff);
  }
  // 손잡이
  g.set(x0 + 2, y0 - 1, 0x8a98a8);
  g.set(x0 + w - 3, y0 - 1, 0x8a98a8);
  for (let x = x0 + 2; x <= x0 + w - 3; x++) g.set(x, y0 - 2, 0x8a98a8);
  // 뚜껑 틈으로 빙어 꼬리
  if (tail) {
    g.set(x0 + w - 2, y0 - 1, SMELT);
    g.set(x0 + w - 1, y0 - 2, SMELT_BK);
    g.set(x0 + w - 3, y0 - 2, SMELT_BK);
  }
}
function boxBehind(g: Grid, v: V, m: GearM, fb: FB): void {
  const { cx, shY } = m;
  const big = bigBody(fb);
  // 앞: 왼 허리 뒤로 상자 모서리 (x = cx-8부터), 옆: 등 뒤 (x = cx-9부터) — 칸 왼쪽 끝 안
  if (v === "down") behind(g, (t) => icebox(t, cx - 8, shY + (big ? 1 : 0), 6, 5, false));
  else if (v === "side") behind(g, (t) => icebox(t, cx - 9, shY - 1, 6, 7, true));
}
function boxBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", _hem: number, _sit: number, body: string): void {
  const g = safe(g0);
  if (layer !== "front") return;
  const { cx, shY, shL, shR } = m;
  const big = bigBody(fb);
  if (v === "down") {
    if (objectBody(body)) return;
    if (!big) line(g, shR - 1, shY - 1, shL, Math.min(shY + 3, 26), 0x4a5a70);
    else g.set(shR - 2, shY - 1, 0x4a5a70);
  } else if (v === "side") {
    if (!big) line(g, cx + 1, shY - 1, cx - 2, shY + 2, 0x4a5a70);
  } else {
    const w = big ? 11 : 9;
    line(g, cx - 3, shY - 1, cx + 3, shY - 1, 0x4a5a70);
    icebox(g, Math.round(cx - w / 2), shY, w, 6, true);
  }
}
function boxIcon(): Grid {
  const g = new Grid(16, 16);
  icebox(g, 2, 5, 12, 9, true);
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 핫팩 오라: 몸 둘레로 아른아른 올라가는 따뜻한 김 + 옆에 둥실 뜬 핫팩 하나 ──
function wave(g: Grid, x: number, y: number, len: number, ph: number, a: number): void {
  for (let i = 0; i < len; i++) {
    const xx = x + Math.round(Math.sin((i + ph) * 1.1) * 1);
    const t = i / len;
    dot(g, xx, y - i, i < len / 2 ? WARM : WARM_HI, Math.round(a * (1 - t * 0.7)));
  }
}
/** 손바닥만 한 주황 핫팩 (위아래 톱니 봉합 + 하얀 상표 칸, tilt = 기울임) */
function hotpack(g: Grid, x: number, y: number, tilt = 0): void {
  const s = new Grid(8, 8);
  const a = tilt ? ["..c.c.", ".oooo.", "oowwo.", ".owwoo", ".oooo.", ".c.c.."] : ["c.c.c", "ooooo", "owwwo", "owwwo", "ooooo", "c.c.c"];
  a.forEach((r, yy) => [...r].forEach((ch, xx) => ch !== "." && s.set(xx + 1, yy + 1, ch === "o" ? 0xff8a2a : ch === "w" ? 0xfff6e8 : 0xffc080)));
  s.set(1 + (tilt ? 3 : 2), 1 + (tilt ? 2 : 3), 0xff4a3a);
  s.outline(0x8a3a1a, false, 210);
  over(g, s, Math.round(x - 3), Math.round(y - 3));
}
function hotIcon(): Grid {
  const g = new Grid(16, 16);
  const s = new Grid(16, 16);
  // 주황 핫팩 (위아래 톱니 봉합 + 하얀 상표 칸 + 빨간 해 무늬)
  const a = ["c.c.c.c.c", "ooooooooo", "ooooooooo", "owwwwwwwo", "owwrrrwwo", "owwrrrwwo", "owwwwwwwo", "ooooooooo", "ooooooooo", "c.c.c.c.c"];
  a.forEach((r, yy) => [...r].forEach((ch, xx) => ch !== "." && s.set(xx + 3, yy + 4, ch === "o" ? 0xff8a2a : ch === "w" ? 0xfff6e8 : ch === "r" ? 0xff4a3a : 0xffc080)));
  for (let yy = 5; yy < 13; yy++) s.set(11, yy, 0xd86a1a);
  s.outline(0x8a3a1a, false, 210);
  g.draw(s, 0, 0);
  wave(g, 5, 3, 3, 0, 255);
  wave(g, 10, 3, 3, 2, 255);
  return g;
}

// ── 빙어 도둑 펭귄 (펫): 남색 등 + 하얀 배 + 부리에 문 빙어 한 마리 ──
const PEN: Record<string, Color> = {
  k: 0x262c44,
  K: 0x46507a,
  w: 0xfafcff,
  W: 0xd8dee8,
  y: 0xf8b830,
  Y: 0xd08a20,
  o: 0xf89838,
  e: 0x101018,
  b: 0xf6a8b8,
  s: 0xc4dcec,
  S: 0x5a8aae,
  T: 0x8ab4cc,
  q: SMELT_EYE,
};
const PEN_LINE = 0x1a1e30;
const PEN_SIDE_A: Art = [
  "....kkkk....",
  "...kKkkkk...",
  "..kKkkwwkk..",
  "..kkkwwewk..",
  "..kkkwwwbyy.",
  ".kkkkwwwwkq.",
  ".kKKkwwwwkS.",
  "kkKKkwwwwkS.",
  ".kkkkwwwwkT.",
  "..kkkWwwWk..",
  "...kkWWWk...",
  "....oo.oo...",
];
const PEN_SIDE_B = edit(PEN_SIDE_A, [[4, 11, "."], [5, 11, "o"], [6, 11, "o"], [7, 11, "."], [8, 11, "."], [0, 7, "."], [0, 6, "k"], [10, 8, "."], [11, 8, "T"], [10, 7, "T"]]);
const PEN_FRONT_A: Art = [
  "...kkkkk...",
  "..kKkkkkk..",
  ".kKwwkwwkk.",
  ".kwewwwewk.",
  "TSsSyyySsSq",
  ".kwwwYwwwk.",
  "kkwwwwwwwkk",
  "kkwwwwwwwkk",
  ".kwwwwwwwk.",
  ".kWwwwwwWk.",
  "..kWWWWWk..",
  "..oo...oo..",
];
const PEN_FRONT_B = edit(PEN_FRONT_A, [[2, 11, "."], [3, 11, "."], [1, 11, "o"], [2, 10, "k"], [0, 6, "."], [0, 5, "k"], [10, 7, "."], [10, 8, "k"], [0, 4, "."], [1, 3, "S"]]);
const PEN_BACK_A: Art = [
  "...kkkkk...",
  "..kKkkkkk..",
  ".kKkkkkkkk.",
  ".kKkkkkkkk.",
  "SkKkkkkkkks",
  ".kKkkkkkkk.",
  "kkKkkkkkkkk",
  "kkKkkkkkkkk",
  ".kKkkkkkkk.",
  ".kkkkKkkkk.",
  "..kkKKKkk..",
  "..oo...oo..",
];
const PEN_BACK_B = edit(PEN_BACK_A, [[7, 11, "."], [8, 11, "."], [9, 11, "o"], [8, 10, "k"], [10, 6, "."], [10, 5, "k"], [0, 7, "."], [0, 8, "k"]]);
const penViews = {
  side: [petCel(PEN_SIDE_A, PEN, PEN_LINE), petCel(PEN_SIDE_B, PEN, PEN_LINE)],
  down: [petCel(PEN_FRONT_A, PEN, PEN_LINE), petCel(PEN_FRONT_B, PEN, PEN_LINE)],
  up: [petCel(PEN_BACK_A, PEN, PEN_LINE), petCel(PEN_BACK_B, PEN, PEN_LINE)],
};


// 새 세트 5 「서리 내린 묘역」 (1/23): 고드름 왕관 · 서리꽃 망토 · 성에 발자국 · 서리 앉은 이름 · 꼬마 눈토끼
// 한 벌 색: 얼음빛 하양·연청 · 새벽 묘역 연보라 망토 + 하얀 서리꽃 수 + 털 깃 · 잎사귀 귀 눈토끼 (빨간 열매 눈)

const ICE = 0xc8e8fa;
const ICE_HI = 0xffffff;
const ICE_MID = 0x9ccff0;
const ICE_LO = 0x6aa0d0;
const ICE_DEEP = 0x4a78b0;
const GEM = 0x5ae0f0;
const CLOAK = 0xa8b8e4;
const CLOAK_HI = 0xd0dcf6;
const CLOAK_LO = 0x7c8cc0;
const CLOAK_DEEP = 0x5a6aa0;
const FROST = 0xf4f8ff;
const FUR = 0xf6f9ff;
const FUR_LO = 0xc8d4ec;

// ── 고드름 왕관: 서리 낀 은빛 띠 + 위로 솟은 얼음 뿔 다섯 + 이마로 늘어진 작은 고드름 ──
function crownHead(g0: Grid, v: V, m: GearM, fb: FB, top: number): void {
  const g = safe(g0);
  const { cx } = m;
  const y = top - 1;
  const half = Math.max(3, Math.round(halfAt(m, top + 1) + 0.3));
  const x0 = cx - half;
  const x1 = cx + half - 1;
  // 띠 두 줄
  for (let x = x0; x <= x1; x++) {
    g.set(x, y, x === x0 ? ICE_HI : x >= x1 - 1 ? ICE_LO : (x + 20) % 3 === 0 ? ICE_HI : ICE);
    g.set(x, y + 1, x >= x1 - 1 ? ICE_DEEP : ICE_MID);
  }
  // 얼음 뿔: 가운데가 가장 높다 (옆모습은 넷, 뒤로 갈수록 낮게)
  const spikes: [number, number][] =
    v === "side"
      ? [[x0 + 1, 2], [cx - 1, 3], [cx + 1, 4], [x1, 3]]
      : [[x0, 2], [cx - 3, 3], [cx - 1, 4], [cx + 1, 3], [x1, 2]].map(([sx, h]) => [Math.max(x0, Math.min(x1, sx)), h]) as [number, number][];
  for (const [sx, h] of spikes)
    for (let k = 1; k <= h; k++) {
      const yy = y - k;
      if (yy < SAFE_TOP) break;
      g.set(sx, yy, k === h ? ICE_HI : k === 1 ? ICE_MID : ICE);
      // 굵은 뿌리 (두 칸)
      if (k <= Math.floor(h / 2) && sx + 1 <= x1) g.set(sx + 1, yy, ICE_LO);
    }
  // 가운데 얼음 보석
  if (v === "down") {
    g.set(cx - 1, y, GEM);
    g.set(cx, y, 0x2aa8c8);
  }
  // 띠 아래로 늘어진 작은 고드름 (머리 테두리 밖으로 삐죽 — 앞·뒤 양 끝, 옆은 뒤쪽)
  if (v === "side") {
    g.set(x0, y + 2, ICE_MID);
    g.set(x0, y + 3, ICE_HI);
  } else {
    g.set(x0, y + 2, ICE_MID);
    g.set(x0, y + 3, ICE);
    g.set(x1, y + 2, ICE_LO);
  }
  void fb;
}
function crownGlow(g0: Grid, v: V, m: GearM, _fb: FB, top: number): void {
  const g = safe(g0);
  // 뿔 끝 반짝 (외곽선 밖 한 칸)
  const sx = v === "side" ? m.cx + 1 : m.cx - 1;
  const yy = top - 1 - 5;
  if (yy >= SAFE_TOP) g.set(sx, yy, 0xffffff, 200);
}
function crownIcon(): Grid {
  return iconOf(
    [
      "......w......",
      "......w......",
      "..w...ci..w..",
      "..w..wci..w..",
      "..ci.cci.ci..",
      "w.cicccicci.w",
      "cicccccccccic",
      "wwiwwggwwiwwl",
      "mmmmmmmmmmmdd",
      ".c.........i.",
      ".w...........",
    ],
    { w: ICE_HI, c: ICE, i: ICE_LO, m: ICE_MID, d: ICE_DEEP, l: ICE_LO, g: GEM },
  );
}

// ── 서리꽃 망토: 연보라 자락 + 하얀 서리꽃 수 + 털 깃 + 밑단 고드름 ──
function frostFlower(g: Grid, x: number, y: number, big: boolean): void {
  g.set(x, y, FROST);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) g.set(x + dx, y + dy, big ? FROST : CLOAK_HI);
  if (big) for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]] as const) g.set(x + dx * 2, y + dy * 2, CLOAK_HI);
}
function capeShape(g: Grid, cx: number, y0: number, bottom: number, w0: number, spread: number, hem: number): void {
  for (let y = y0; y <= bottom; y++) {
    const s = Math.round((y - y0) * spread);
    // 자락은 칸 안(x 1..18)까지만 퍼진다 — 넓은 몸은 아래에서 곧게 떨어진다
    const x0 = clampX(cx - w0 - s);
    const x1 = clampX(cx + w0 - 1 + s);
    for (let x = x0; x <= x1; x++) {
      if (y === bottom && (x + hem) % 3 === 2) continue;
      let c: Color = x <= x0 + 1 ? CLOAK_HI : x >= x1 - 1 ? CLOAK_LO : CLOAK;
      // 세로 주름
      if ((x - cx + 40) % 4 === 0 && y > y0 + 2) c = CLOAK_LO;
      if (y === bottom) c = CLOAK_DEEP;
      g.set(x, y, c);
    }
    // 밑단 고드름 (짝수 칸에 한 칸씩)
    if (y === bottom) for (let x = x0 + 1; x < x1; x += 3) g.set(x, bottom + 1, ICE_HI);
  }
}
function cloakBehind(g: Grid, v: V, m: GearM, fb: FB, body: string): void {
  const { cx, shY, shL, shR } = m;
  const bottom = 25;
  if (v === "down") {
    behind(g, (t) => {
      // 앞모습: 몸 뒤로 넓게 퍼지는 자락 (양옆만 보인다) + 서리꽃 하나씩
      // 앞에서는 자락 안감(짙은 새벽빛)이 보이고 테두리는 얼음빛 (밝은 몸 옆에서도 실루엣이 선다)
      const w0 = Math.round((shR - shL) / 2) + 1;
      for (let y = shY; y <= bottom; y++) {
        const sp = Math.round((y - shY) * 0.9);
        const x0 = clampX(cx - w0 - sp);
        const x1 = clampX(cx + w0 - 1 + sp);
        for (let x = x0; x <= x1; x++) {
          const rim = x === x0 || x === x1;
          t.set(x, y, y === bottom ? (rim ? ICE_MID : CLOAK_DEEP) : rim ? ICE : (x * 3 + y * 2) % 11 === 0 ? 0x9aa8dc : 0x4e5c94);
        }
      }
      // 머리 뒤로 서는 높은 깃 (양옆으로 벌어진 얼음 깃)
      const hx = Math.round(m.rx) + (fb === "round" || fb === "sheet" ? 0 : 1);
      const y1 = shY - 1;
      const y0 = Math.round(m.hy) - (fb === "round" ? 4 : 1);
      for (let y = y0; y <= y1; y++) {
        const k = (y1 - y) / Math.max(1, y1 - y0);
        const out = Math.round(k * 2);
        for (const d of [-1, 1]) {
          const xa = d < 0 ? cx - hx - out : cx + hx - 1 + out;
          t.set(xa, y, y === y0 ? ICE_HI : ICE);
          t.set(xa - d, y, 0x4e5c94);
        }
      }
      t.set(clampX(cx - w0 - 2) + 1, bottom - 3, FROST);
      t.set(clampX(cx + w0 + 1) - 1, bottom - 4, FROST);
    });
  } else if (v === "side") {
    behind(g, (t) => {
      for (let y = shY - 1; y <= bottom; y++) {
        const k = (y - shY) / Math.max(1, bottom - shY);
        const back = Math.round(2 + k * 5);
        for (let x = cx - back - 2; x <= cx; x++) t.set(x, y, x === cx - back - 2 ? CLOAK_HI : y === bottom ? CLOAK_DEEP : (x + y) % 5 === 0 ? CLOAK_LO : CLOAK);
        if (y === bottom) for (let x = cx - back - 1; x < cx; x += 3) t.set(x, bottom + 1, ICE_HI);
      }
      frostFlower(t, cx - 5, bottom - 4, true);
    });
  }
  void fb;
  void body;
}
function cloakBack(g0: Grid, v: V, m: GearM, fb: FB, layer: "back" | "front", hem: number, _sit: number, body: string): void {
  const g = safe(g0);
  if (layer !== "front") return;
  const { cx, shY, shL, shR, neck } = m;
  const big = bigBody(fb);
  if (v === "up") {
    // 뒷모습: 등 전체 자락 + 서리꽃 수 셋 + 털 깃
    const w0 = Math.round((shR - shL) / 2) + 1;
    capeShape(g, cx, shY - 1, 25, w0, 0.5, hem);
    frostFlower(g, cx - 1, Math.min(shY + 3, 22), true);
    frostFlower(g, cx - 4, shY + 0, false);
    frostFlower(g, cx + 2, 22, false);
    for (let x = cx - w0 - 1; x <= cx + w0; x++) g.set(x, shY - 1, (x + 20) % 2 ? FUR : FUR_LO);
    return;
  }
  if (objectBody(body)) return;
  // 앞·옆: 목둘레 하얀 털 깃 + 얼음 걸쇠
  const half = big ? 6 : fb === "tall" ? 3 : 4;
  const y = big ? Math.round(m.hy) + 4 : neck;
  const x0 = v === "side" ? cx - half + 1 : cx - half;
  for (let x = x0; x < cx + half; x++) {
    g.set(x, y, (x + 20) % 2 ? FUR : FUR_LO);
    if (x === x0 || x === cx + half - 1) g.set(x, y + 1, FUR_LO);
  }
  if (v === "down") {
    g.set(cx - 1, y + 1, GEM);
    g.set(cx, y + 1, 0x2aa8c8);
  }
}
function cloakIcon(): Grid {
  const g = new Grid(16, 16);
  for (let x = 4; x <= 11; x++) g.set(x, 2, (x % 2) ? FUR : FUR_LO);
  capeShape(g, 8, 3, 13, 3, 0.4, 0);
  frostFlower(g, 7, 7, true);
  frostFlower(g, 10, 11, false);
  g.set(7, 2, GEM);
  g.set(8, 2, 0x2aa8c8);
  g.outline(0x1e1c1a, false, 170);
  return g;
}

// ── 성에 발자국: 밟은 자리에 번지는 얼음 꽃 (유리창 성에처럼 가지가 뻗는다) ──
function rime(kind: number): Grid {
  const g = new Grid(9, 7);
  const c = (x: number, y: number, col: Color, a = 230) => g.set(x, y, col, a);
  const cx = 4;
  const cy = 3;
  c(cx, cy, 0xffffff, 255);
  const arms: [number, number][] = kind === 0 ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [-1, -1], [1, -1], [-1, 1], [1, 0], [-1, 0]];
  for (const [dx, dy] of arms)
    for (let k = 1; k <= (dx && dy ? 2 : 3); k++) {
      c(cx + dx * k, cy + dy * k, k === 1 ? 0xe8f6ff : 0xb8e2ff, k === 3 ? 150 : 220);
      // 잔가지
      if (k === 2 && !(dx && dy)) {
        c(cx + dx * k + (dy ? 1 : 0), cy + dy * k + (dx ? 1 : 0), 0xb8e2ff, 140);
        c(cx + dx * k - (dy ? 1 : 0), cy + dy * k - (dx ? 1 : 0), 0xb8e2ff, 140);
      }
    }
  return g;
}
function rimeIcon(): Grid {
  const g = new Grid(16, 16);
  const big = (x: number, y: number, n: number) => {
    g.set(x, y, 0xffffff);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
      for (let k = 1; k <= n; k++) g.set(Math.round(x + Math.cos(a) * k), Math.round(y + Math.sin(a) * k), k === n ? ICE_MID : 0xe8f6ff);
      const bx = x + Math.cos(a) * (n - 1);
      const by = y + Math.sin(a) * (n - 1);
      g.set(Math.round(bx + Math.cos(a + 1) * 1.2), Math.round(by + Math.sin(a + 1) * 1.2), ICE);
      g.set(Math.round(bx + Math.cos(a - 1) * 1.2), Math.round(by + Math.sin(a - 1) * 1.2), ICE);
    }
  };
  big(6, 6, 4);
  big(11, 11, 2);
  g.outline(0x3a5a88, false, 190);
  return g;
}

// ── 서리 앉은 이름 (글자는 compose.py — 아이콘만) ──
const SEO = [
  "...##.....##",
  "...##.....##",
  "...##.....##",
  "..####....##",
  "..#..#..####",
  ".##..##.####",
  ".#....#...##",
  "##....##..##",
  "#......#..##",
  "..........##",
  "..........##",
];
function nameIcon(): Grid {
  // 「서」 한 글자: 얼음빛 (연청 → 옅은 보라) + 윗머리마다 하얀 서리 + 옅은 푸른 번짐
  const g = new Grid(16, 16);
  const halo = new Grid(16, 16);
  halo.ellipse(8, 8, 7.5, 7, 0x9cd4ff, 55);
  over(g, halo, 0, 0);
  const t = new Grid(16, 16);
  const stops = [0xb8e4ff, 0x8cc4f4, 0xc4c8ff];
  SEO.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== "#") return;
      const top = y === 0 || SEO[y - 1][x] !== "#";
      const k = Math.min(1.999, (x / 11) * 2);
      const i = Math.floor(k);
      const c = top ? 0xffffff : mixc(stops[i], stops[i + 1], k - i);
      t.set(x + 2, y + 2, c);
    }),
  );
  t.outline(0x0a0b10, true, 235);
  over(g, t, 0, 0);
  g.set(14, 1, 0xffffff);
  g.set(1, 6, 0xe0f2ff, 200);
  return g;
}
function mixc(a: Color, b: Color, f: number): Color {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ── 꼬마 눈토끼 (펫): 뭉친 눈 몸 + 초록 잎사귀 귀 + 빨간 열매 눈. 걸을 땐 깡충 (둘째 장은 한 칸 뜬다) ──
const BUN: Record<string, Color> = {
  w: 0xf8fbff,
  h: 0xffffff,
  s: 0xdde7f4,
  d: 0xb4c4da,
  g: 0x4aa860,
  G: 0x86d48e,
  q: 0x2e7a44,
  r: 0xe8323c,
  R: 0xff9a9a,
  b: 0xffc4d4,
};
const BUN_LINE = 0x50618a;
const lift = (a: Art): Art => [...a.slice(1), ".".repeat(a[0].length)];
const BUN_SIDE: Art = [
  ".Gg.........",
  "..gGg.......",
  "...qgGg.....",
  ".....qwwww..",
  "...wwwwwwww.",
  "..wwwwwwwwrw",
  ".hwwwwwwwwwb",
  ".swwwwwwwwww",
  ".sswwwwwwwws",
  "..ddssssssd.",
];
const BUN_SIDE_B: Art = lift([
  "Gg..........",
  ".gGgg.......",
  "...qgGg.....",
  ".....qwwww..",
  "...wwwwwwww.",
  "..wwwwwwwwrw",
  ".hwwwwwwwwwb",
  ".swwwwwwwwww",
  ".sswwwwwwwws",
  "..ddssssssd.",
]);
const BUN_FRONT: Art = [
  ".gG....Gg.",
  ".gG....Gg.",
  "..qG..Gq..",
  "..wwwwww..",
  ".wwwwwwww.",
  "wwrwwwwrww",
  "wbwwwwwwbw",
  "swwwwwwwws",
  "sswwwwwwss",
  ".ddssssdd.",
];
const BUN_FRONT_B: Art = lift([
  "gG......Gg",
  ".gG....Gg.",
  "..qG..Gq..",
  "..wwwwww..",
  ".wwwwwwww.",
  "wwrwwwwrww",
  "wbwwwwwwbw",
  "swwwwwwwws",
  "sswwwwwwss",
  ".ddssssdd.",
]);
const BUN_BACK: Art = [
  ".gG....Gg.",
  ".gG....Gg.",
  "..qG..Gq..",
  "..wwwwww..",
  ".wwwwwwww.",
  "wwwwwwwwww",
  "wwwwwwwwww",
  "swwwhhwwws",
  "sswwhhwwss",
  ".ddssssdd.",
];
const BUN_BACK_B: Art = lift([
  "gG......Gg",
  ".gG....Gg.",
  "..qG..Gq..",
  "..wwwwww..",
  ".wwwwwwww.",
  "wwwwwwwwww",
  "wwwwwwwwww",
  "swwwhhwwws",
  "sswwhhwwss",
  ".ddssssdd.",
]);
/** 열매 눈 반짝 (테두리 다음에) */
const shine = (pts: [number, number][]) => (g: Grid) => {
  for (const [x, y] of pts) g.set(x + 1, y + 1, 0xff9a9a);
};
const bunViews = {
  side: [petCel(BUN_SIDE, BUN, BUN_LINE), petCel(BUN_SIDE_B, BUN, BUN_LINE)],
  down: [petCel(BUN_FRONT, BUN, BUN_LINE, shine([])), petCel(BUN_FRONT_B, BUN, BUN_LINE)],
  up: [petCel(BUN_BACK, BUN, BUN_LINE), petCel(BUN_BACK_B, BUN, BUN_LINE)],
};


// ── 「송년회 3차」 알딸딸 오라의 발그레한 볼: 시안은 장면 위에 눈 자리 옆을 칠했다 → 시트 빛 점으로 (걷기 프레임마다 얼굴을 따라간다) ──
function tipsyBlush(g: Grid, v: V, m: GearM, fb: FB): void {
  if (v === "up") return;
  const e = eyes(fb, v, m);
  const spots: [number, number][] = v === "side" ? [[e.xs[0], e.y + 1]] : [[e.xs[0] - 1, e.y + 1], [e.xs[e.xs.length - 1] + 1, e.y + 1]];
  for (const [x, y] of spots) {
    dot(g, x, y, BLUSH, 200);
    dot(g, x + 1, y, BLUSH, 150);
  }
}

// ── 펫 시트 (petBreeds와 같은 열 배치: 0·1 옆 걷기 · 2·3 옆 멈춤(3 눈 깜빡) · 4·5 귀여운 동작 · 6·7 앞 걷기 · 8·9 앞 멈춤(9 깜빡) · 10·11 뒤 걷기 · 12·13 뒤 멈춤) ──
// 시안은 방향마다 걷기 두 장 → 멈춤·깜빡·동작 장은 시안 그림을 몇 칸만 고쳐 만든다.

/** 꼬마 너구리: 깜빡 = 눈 반짝이를 가리개 색으로, 동작 = 꼬리 살랑 (들썩 — 흥 오른 3차) */
const RAC_SIDE_BLINK = edit(RAC_SIDE_A, [[12, 3, "m"]]);
const RAC_SIDE_TAIL = edit(RAC_SIDE_A, [[2, 2, "."], [3, 2, "."], [1, 3, "."], [2, 3, "x"], [3, 3, "x"], [0, 4, "x"], [1, 4, "t"]]);
const RAC_FRONT_BLINK = edit(RAC_FRONT_A, [[2, 5, "m"], [9, 5, "m"]]);
const RAC_BACK_TAIL = edit(RAC_BACK_A, [[10, 8, "t"], [11, 7, "x"], [10, 7, "t"]]);
/** 꼬마 산양: 깜빡 = 눈을 그늘 털로, 동작 = 바위 타듯 다리를 모아 깡충 (lift는 seasonSetFx3) */
const GOAT_SIDE_BLINK = edit(GOAT_SIDE_A, [[11, 3, "d"]]);
const GOAT_FRONT_BLINK = edit(GOAT_FRONT_A, [[4, 4, "d"], [7, 4, "d"]]);
const GOAT_BACK_EAR = edit(GOAT_BACK_A, [[11, 3, "."], [10, 3, "e"], [11, 2, "e"]]);
/** 빙어 도둑 펭귄: 깜빡 = 눈을 감고, 동작 = 날개를 들썩 (모른 척 뒤뚱) */
const PEN_SIDE_BLINK = edit(PEN_SIDE_A, [[7, 3, "w"]]);
const PEN_SIDE_FLAP = edit(PEN_SIDE_A, [[0, 7, "."], [0, 6, "k"], [1, 5, "K"]]);
const PEN_FRONT_BLINK = edit(PEN_FRONT_A, [[2, 3, "w"], [7, 3, "w"]]);
const PEN_BACK_FLAP = edit(PEN_BACK_A, [[10, 6, "."], [10, 5, "k"], [0, 7, "."], [0, 8, "k"]]);
/** 꼬마 눈토끼: 깜빡 = 열매 눈을 눈 그늘로, 동작 = 깡충 (시안 둘째 장 — 한 칸 뜬 모습), 뒤 = 잎사귀 귀 쫑긋 */
const BUN_SIDE_BLINK = edit(BUN_SIDE, [[10, 5, "s"]]);
const BUN_FRONT_BLINK = edit(BUN_FRONT, [[2, 5, "s"], [7, 5, "s"]]);
const BUN_BACK_EAR: Art = ["gG......Gg", ...BUN_BACK.slice(1)];

type PetSheet = { cels: Grid[]; w: number; h: number };
function petSheet(cels: Grid[]): PetSheet {
  return { cels, w: Math.max(...cels.map((c) => c.w)), h: Math.max(...cels.map((c) => c.h)) };
}
const PET3_SHEETS: Readonly<Record<string, () => PetSheet>> = {
  ye_raccoon: () => {
    const c = (a: Art) => petCel(a, RAC, RAC_LINE);
    return petSheet([...racViews.side, c(RAC_SIDE_A), c(RAC_SIDE_BLINK), c(RAC_SIDE_TAIL), c(RAC_SIDE_A), ...racViews.down, c(RAC_FRONT_A), c(RAC_FRONT_BLINK), ...racViews.up, c(RAC_BACK_A), c(RAC_BACK_TAIL)]);
  },
  su_goat: () => {
    const c = (a: Art) => petCel(a, GOAT, GOAT_LINE);
    return petSheet([...goatViews.side, c(GOAT_SIDE_A), c(GOAT_SIDE_BLINK), c(GOAT_SIDE_B), c(GOAT_SIDE_A), ...goatViews.down, c(GOAT_FRONT_A), c(GOAT_FRONT_BLINK), ...goatViews.up, c(GOAT_BACK_A), c(GOAT_BACK_EAR)]);
  },
  ic_penguin: () => {
    const c = (a: Art) => petCel(a, PEN, PEN_LINE);
    return petSheet([...penViews.side, c(PEN_SIDE_A), c(PEN_SIDE_BLINK), c(PEN_SIDE_FLAP), c(PEN_SIDE_A), ...penViews.down, c(PEN_FRONT_A), c(PEN_FRONT_BLINK), ...penViews.up, c(PEN_BACK_A), c(PEN_BACK_FLAP)]);
  },
  fr_snowbun: () => {
    const c = (a: Art) => petCel(a, BUN, BUN_LINE);
    return petSheet([...bunViews.side, c(BUN_SIDE), c(BUN_SIDE_BLINK), c(BUN_SIDE_B), c(BUN_SIDE), ...bunViews.down, c(BUN_FRONT), c(BUN_FRONT_BLINK), ...bunViews.up, c(BUN_BACK), c(BUN_BACK_EAR)]);
  },
};

// ── 등록 ──

/** 시트에 그려지는 것: 자리별 그리기 (seasonSetGear ITEMS에 섞인다) */
export const GEAR3: Readonly<Record<string, SsItem>> = {
  ye_tiehead: { head: (g, v, m, fb, top) => tieHead(g, v, m, fb, top) },
  ye_mic: { hand: (g, v, m) => micHand(g, v, m), glow: (g, v, m) => micGlow(g, v, m) },
  // 탬버린·배낭·운동 가방·아이스박스·망토 자락은 head 자리에서 "머리 다 그린 뒤 몸 뒤 빈칸"에 놓는다 (모자를 쓴 것은 아니다)
  ye_tambo: { headWorn: false, back: tamboBack, head: (g, v, m, fb, _top, body) => tamboBehind(g, v, m, fb, body) },
  ye_tipsy: { glow: (g, v, m, fb) => tipsyBlush(g, v, m, fb) },
  su_beanie: { covers: true, head: (g, v, m, fb, top) => beanieHead(g, v, m, fb, top) },
  su_pack: { headWorn: false, back: packBack, head: (g, v, m, fb, _top, body) => packBehind(g, v, m, fb, body) },
  su_flask: { hand: (g, v, m) => flaskHand(g, v, m), glow: (g, v, m) => flaskGlow(g, v, m) },
  rs_band: { head: (g, v, m, fb, top) => bandHead(g, v, m, fb, top), glow: (g, v, m, fb, top) => bandGlow(g, v, m, fb, top) },
  rs_shake: { hand: (g, v, m) => shakeHand(g, v, m) },
  rs_gymbag: { headWorn: false, back: bagBack, head: (g, v, m, fb) => bagBehind(g, v, m, fb) },
  ic_earmuff: { head: (g, v, m, fb, top) => muffHead(g, v, m, fb, top) },
  ic_rod: { hand: (g, v, m) => rodHand(g, v, m) },
  ic_icebox: { headWorn: false, back: boxBack, head: (g, v, m, fb) => boxBehind(g, v, m, fb) },
  fr_icicle: { covers: true, head: (g, v, m, fb, top) => crownHead(g, v, m, fb, top), glow: (g, v, m, fb, top) => crownGlow(g, v, m, fb, top) },
  fr_cloak: { headWorn: false, back: cloakBack, head: (g, v, m, fb, _top, body) => cloakBehind(g, v, m, fb, body) },
};

/** 시트 그림 꾸미기·이름 글자·이름표 아이콘 16×16 */
export const ICONS3: Readonly<Record<string, () => Grid>> = {
  ye_tiehead: tieIcon,
  ye_mic: micIcon,
  ye_tambo: tamboIcon,
  su_beanie: beanieIcon,
  su_pack: packIcon,
  su_flask: flaskIcon,
  rs_band: bandIcon,
  rs_shake: shakeIcon,
  rs_gymbag: bagIcon,
  rs_planner: plannerIcon,
  ic_earmuff: muffIcon,
  ic_rod: rodIcon,
  ic_icebox: boxIcon,
  fr_icicle: crownIcon,
  fr_cloak: cloakIcon,
  fr_icename: nameIcon,
};

/** 따로 그리는 연출(오라·발자국·펫)의 아이콘 16×16 (seasonSetFx3이 쓴다). 알딸딸 오라는 볼만 시트에 그려 여기 둔다 */
export const FX_ICONS3: Readonly<Record<string, () => Grid>> = {
  ye_tipsy: tipsyIcon,
  ye_raccoon: racIcon,
  su_sunrise: sunIcon,
  su_goat: () => centerIn(goatViews.down[0], 14),
  rs_day3: day3Icon,
  ic_hotpack: hotIcon,
  ic_penguin: () => centerIn(penViews.down[0], 14),
  fr_rime: rimeIcon,
  fr_snowbun: () => centerIn(bunViews.down[0], 14),
};

/** 따로 그리는 연출의 그림 재료 (seasonSetFx3이 프레임으로 굽는다) */
export const SS3_PARTS = {
  bubble,
  sunDisk,
  wave,
  hotpack,
  sneaker,
  slipper,
  rime,
  smelt,
  pets: PET3_SHEETS,
  pink: PINK,
  pinkHi: PINK_HI,
  gold: GOLD,
  goldHi: GOLD_HI,
  tie: TIE,
  warm: WARM,
  warmHi: WARM_HI,
  drop: DROP,
  smeltBody: SMELT,
  smeltBack: SMELT_BK,
  smeltEye: SMELT_EYE,
  ice: ICE,
  iceHi: ICE_HI,
  iceMid: ICE_MID,
  iceLo: ICE_LO,
  gem: GEM,
} as const;
