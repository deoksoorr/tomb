import {
  darken,
  Grid,
  hash2,
  lighten,
  mix,
  type Color,
} from "../../sprites/pixel";
import { DADUMI_SEAT, RURAL_CX } from "@/lib/housing/campExclusive/rural";
import { AV_ANIM, avatarFrameGrid } from "../../sprites/avatarCore";
import {
  has,
  type CxArt,
  type CxCoverArtMap,
  type CxDraw,
  type CxHeldArtMap,
  type CxTile,
} from "./types";

// 11/27 촌캉스 전용 가구 8 · 바닥 3 · 벽지 3 그림 (시안 scratchpad/furnmock/rural 승인본을 옮김).
// 규칙은 ./types.ts 머리말: 그림 = (칸 w×16) × (칸 h×16 + up), 옆모습(왼쪽을 봄)은 가로·세로 칸이 바뀌고 오른쪽은 장면이 뒤집는다.
// 3/4 내려다보기: 바닥 깊이 d(위 = 먼 쪽)와 높이 z → 그림 y = up + d − z.
// 그림 변형 v (lib rural.ts act와 맞춘다):
//  - 등잔: 켜짐 "on" (처음 놓으면 켜짐, 끄면 "s1") · 불꽃 장면 "f1"
//  - 다듬잇돌: 누가 무릎 꿇고 앉아 있으면 "use" (돌 위 방망이가 그 사람 두 손으로 — 하나는 들고 하나는 천을 친다) · 장면 "f1"은 손을 바꾼다
//  - 곶감 걸이: 먹은 개수 "s1"~"s3" (켜기 값 — 방 상태로 남는다) · 먹을 때 잠깐 "eat"
//  - 옛날 선풍기: 켜짐 "on" + 바람 세기 "s1"~"s3" · 고개 돌림 장면 "f1"~"f3"
//  - 쌀뒤주: 서서 쓰기 "open"
//  - 브라운관 TV: 켜짐 "on" + 채널 "s1"~"s3" · 켤 때·채널 돌릴 때 잠깐 지지직 "static" (장면 "f1")
// 장면 "f1"… 은 lib rural.ts toggle.anim · seatAnim 표대로 장면이 붙여 준다 (움직임 줄이기면 첫 장면 그대로).

type View = 0 | 1 | 2; // 0 앞 · 1 옆(왼쪽을 봄) · 2 뒤
const frameOf = (v: string) =>
  Number(
    v
      .split("-")
      .find((t) => /^f\d$/.test(t))
      ?.slice(1) ?? 0,
  );
const stepOf = (v: string) =>
  Number(
    v
      .split("-")
      .find((t) => /^s\d$/.test(t))
      ?.slice(1) ?? 0,
  );

const EDGE = 0x2e1e14;
const EDGE_A = 175;

const PINE = {
  hi: 0xb07a48,
  mid: 0x8e5c34,
  lo: 0x6a4226,
  line: 0x46281a,
} as const;
const BRASS = { hi: 0xf6dc8a, mid: 0xd0a24a, lo: 0x8e6a2a } as const;
const IRON = { hi: 0x6e6a72, mid: 0x45414a, lo: 0x29262c } as const;

const foot = (g: Grid, x0: number, x1: number, y: number) => {
  for (let x = x0; x <= x1; x++) if (!g.filled(x, y)) g.set(x, y, 0x1a1006, 70);
};
/** 3/4 상자: 바닥 x0..x1, 깊이 d0..d1(먼→가까운), 높이 z0..z1 */
function box3(
  g: Grid,
  up: number,
  x0: number,
  x1: number,
  d0: number,
  d1: number,
  z0: number,
  z1: number,
  top: Color,
  front: Color,
  opt: { topHi?: Color; frontLo?: Color } = {},
) {
  const ty0 = up + d0 - z1;
  const ty1 = up + d1 - z1;
  g.rect(x0, ty0, x1 - x0 + 1, ty1 - ty0 + 1, top);
  if (opt.topHi !== undefined) g.hline(x0, x1, ty0, opt.topHi);
  const fy0 = ty1 + 1;
  const fy1 = up + d1 - z0;
  if (fy1 >= fy0) {
    g.rect(x0, fy0, x1 - x0 + 1, fy1 - fy0 + 1, front);
    if (opt.frontLo !== undefined) g.hline(x0, x1, fy1, opt.frontLo);
  }
  return { ty0, ty1, fy0, fy1 };
}
const clearCorners = (
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) => {
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ])
    g.set(x, y, 0, 0);
};

// ════════════════ 1. 꽃무늬 방석 (1×1) ════════════════
const INDIGO = {
  hi: 0x5e80c4,
  mid: 0x3a5a9e,
  lo: 0x283f74,
  line: 0x1c2c56,
} as const;
const PEONY = {
  hi: 0xfde0e8,
  mid: 0xf4a2bc,
  lo: 0xd8638c,
  core: 0xf6cf52,
} as const;
const LEAF = { hi: 0x8ad07a, mid: 0x4ea05a, lo: 0x2e7448 } as const;
const PIPING = 0xe0587a;

/** 방석 무늬 10×10 (앞을 볼 때: 잎이 아래로). 문자 → 색 */
const CUSHION_MOTIF = [
  "..........",
  "...hmmh...",
  "..hmmmml..",
  "..mmccml..",
  "..mmccml..",
  "..lmmmll..",
  "...llll...",
  "..g.ss.g..",
  "..GgssgG..",
  "....ss....",
];
const motifColor: Record<string, Color> = {
  h: PEONY.hi,
  m: PEONY.mid,
  l: PEONY.lo,
  c: PEONY.core,
  g: LEAF.mid,
  G: LEAF.hi,
  s: LEAF.lo,
};

function cushion(g: Grid, W: number, H: number, view: View): void {
  const UP = H - 16;
  // 폭신한 방석: 윗면 + 두께 3 (칸을 거의 다 채운다 — 앉은 사람 둘레로 방석이 보이게)
  const b = box3(g, UP, 1, 14, 1, 14, 0, 3, INDIGO.mid, INDIGO.lo);
  // 볼록한 윗면 명암
  for (let y = b.ty0; y <= b.ty1; y++)
    for (let x = 1; x <= 14; x++) {
      const dx = (x - 7.5) / 7;
      const dy = (y - (b.ty0 + b.ty1) / 2) / 7;
      const r = dx * dx + dy * dy;
      if (r > 0.8) g.set(x, y, INDIGO.lo);
      else if (dx < -0.2 && dy < -0.2 && r > 0.25) g.set(x, y, INDIGO.hi);
    }
  // 테두리 바느질(분홍 줄)
  for (let x = 3; x <= 12; x++) {
    g.set(x, b.ty0 + 1, PIPING);
    g.set(x, b.ty1 - 1, darken(PIPING, 0.15));
  }
  for (let y = b.ty0 + 2; y <= b.ty1 - 2; y++) {
    g.set(2, y, PIPING);
    g.set(13, y, darken(PIPING, 0.15));
  }
  // 가운데 목단 (보는 쪽으로 잎)
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 10; i++) {
      // 앞(0): 그대로 · 옆(왼쪽을 봄): 시계 방향 90° (잎이 왼쪽) · 뒤: 180°
      let si = i;
      let sj = j;
      if (view === 1) {
        si = j;
        sj = 9 - i;
      } else if (view === 2) {
        si = 9 - i;
        sj = 9 - j;
      }
      const ch = CUSHION_MOTIF[sj][si];
      if (ch === ".") continue;
      g.set(3 + i, b.ty0 + 2 + j, motifColor[ch]);
    }
  // 두께 면: 앞쪽 바느질 + 아랫단 그늘
  g.hline(1, 14, b.fy0, INDIGO.mid);
  g.hline(2, 13, b.fy0 + 1, darken(PIPING, 0.25));
  g.hline(1, 14, b.fy1, INDIGO.line);
  clearCorners(g, 1, b.ty0, 14, b.fy1);
  // 네 귀 술 (분홍)
  const TAS = 0xf0587a;
  for (const [x, y] of [
    [2, b.ty0],
    [13, b.ty0],
    [1, b.ty0 + 1],
    [14, b.ty0 + 1],
    [1, b.fy1 - 1],
    [14, b.fy1 - 1],
    [2, b.fy1],
    [13, b.fy1],
  ])
    g.set(x, y, TAS);
  foot(g, 1, 14, b.fy1 + 1);
}

// ════════════════ 2. 등잔 (1×1, 등경걸이 + 백자 등잔) ════════════════
const LAMP_UP = 22;

function flame(g: Grid, wx: number, wy: number, f: number): void {
  const O = 0xf27a26;
  const M = 0xffc23e;
  const C = 0xfff6cc;
  const shapes = [
    [" o ", "omo", "mcm", " c "],
    ["  o", " om", "mcm", " c "],
  ];
  const s = shapes[f % 2];
  for (let j = 0; j < s.length; j++)
    for (let i = 0; i < 3; i++) {
      const ch = s[j][i];
      if (ch === " ") continue;
      g.set(
        wx - 1 + i,
        wy - s.length + 1 + j,
        ch === "o" ? O : ch === "m" ? M : C,
      );
    }
}

function lamp(g: Grid, W: number, H: number, view: View, state: string): void {
  const U = LAMP_UP;
  const on = has(state, "on");
  const f = frameOf(state) % 2;
  // 받침 (납작한 네모 판)
  const b = box3(g, U, 4, 11, 7, 12, 0, 2, PINE.hi, PINE.lo);
  g.hline(5, 10, b.ty0 + 1, lighten(PINE.hi, 0.15));
  g.hline(4, 11, b.fy1, PINE.line);
  const px = view === 1 ? 9 : view === 2 ? 6 : 7; // 기둥 x (뒤: 심지 불꽃이 기둥 옆으로 보이게 살짝 왼쪽)
  const postTop = U + 9 - 27;
  const postBot = U + 9 - 2;
  const post = () => {
    g.rect(px, postTop + 2, 2, postBot - postTop - 1, PINE.mid);
    g.vline(px, postTop + 2, postBot, PINE.hi);
    // 꼭대기 갈고리 (ㄱ자)
    g.rect(px - 1, postTop, 4, 2, PINE.lo);
    g.hline(px - 1, px + 2, postTop, PINE.mid);
    // 높이 맞추는 구멍
    for (const y of [postTop + 12, postTop + 15, postTop + 18])
      g.set(px + 1, y, PINE.line);
  };
  // 등잔 받침판 + 백자 등잔 (높이 17): 앞 = 기둥 앞으로, 옆 = 왼쪽으로, 뒤 = 기둥 뒤로
  const tray = () => {
    const [tx0, tx1, d0, d1] =
      view === 0 ? [5, 10, 10, 12] : view === 1 ? [3, 8, 8, 10] : [6, 11, 5, 7];
    const t = box3(g, U, tx0, tx1, d0, d1, 16, 17, PINE.mid, PINE.lo);
    if (view === 1) g.hline(tx1, px, t.ty1, PINE.lo);
    // 백자 등잔: 하얀 종지 + 기름
    const cx = (tx0 + tx1) / 2;
    const dy = t.ty0 - 2;
    g.rect(Math.floor(cx) - 2, dy, 6, 3, 0xf4f2ea);
    g.hline(Math.floor(cx) - 2, Math.floor(cx) + 3, dy, 0xfdfcf8);
    g.hline(Math.floor(cx) - 1, Math.floor(cx) + 2, dy + 2, 0xbcc2bc);
    g.hline(Math.floor(cx) - 1, Math.floor(cx) + 2, dy, 0xc08e30); // 기름
    // 심지
    const wx = Math.floor(cx) + 1;
    g.set(wx, dy - 1, on ? 0x6a3a1a : 0x2a1c12);
    if (on) flame(g, wx, dy - 2, f);
  };
  if (view === 2) {
    tray();
    post();
  } else {
    post();
    tray();
  }
  foot(g, 4, 11, b.fy1 + 1);
}

// ════════════════ 3. 다듬잇돌 (2×1, 화강암 + 개어 둔 흰 다듬이감 + 방망이 둘) ════════════════
const GRANITE = {
  hi: 0xc6c4be,
  mid: 0x9c9a95,
  lo: 0x75736f,
  line: 0x4e4c49,
} as const;
const CLOTH = { hi: 0xffffff, mid: 0xf0f2f2, lo: 0xc4ccd4 } as const;
const BAT = { hi: 0xd49a5c, mid: 0xa6703c, lo: 0x6e4622 } as const;
const speckle = (
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  salt: number,
) => {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!g.filled(x, y)) continue;
      const h = hash2(x, y, salt);
      if (h < 0.07) g.set(x, y, GRANITE.lo);
      else if (h > 0.95) g.set(x, y, 0xe2e0da);
    }
};
/** 비스듬히 누운 방망이: (x0,y0) 몸통 끝 → (x1,y1) 손잡이 끝 */
function batLine(g: Grid, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / n);
    const y = Math.round(y0 + ((y1 - y0) * k) / n);
    if (k > n * 0.68) g.set(x, y, BAT.lo);
    else {
      g.set(x, y, BAT.mid);
      g.set(x, y - 1, BAT.hi);
      g.set(x + 1, y, BAT.lo);
    }
  }
}
/** 돌 앞면: 윗단은 꽉, 아래로 갈수록 1px씩 들어간다(발 쪽이 좁은 돌) */
function stoneFront(g: Grid, x0: number, x1: number, fy0: number, fy1: number) {
  for (let y = fy0; y <= fy1; y++) {
    const inset = y - fy0 >= 5 ? 1 : 0;
    for (let x = x0 + inset; x <= x1 - inset; x++)
      g.set(
        x,
        y,
        y === fy0 ? GRANITE.mid : y >= fy1 - 1 ? GRANITE.line : GRANITE.lo,
      );
    if (inset) {
      g.set(x0, y, 0, 0);
      g.set(x1, y, 0, 0);
    }
  }
  g.hline(x0 + 2, x1 - 2, fy0 + 3, GRANITE.line); // 허리 홈
}
/** 다듬이감(천) 가운데 — 그림 좌표 (두드리는 자리) */
/** 다듬잇돌 솟는 높이: 무릎 꿇은 사람이 방망이를 머리 위로 들어 올릴 자리까지 (놓아 두면 위는 빈칸) */
const DADUMI_UP = 16;
function dadumiCloth(view: View, H: number): [number, number] {
  const U = H - (view === 1 ? 32 : 16);
  if (view === 1) return [8, U + 3 - 8 + 13];
  return [16, U + 7 - 8 + (view === 2 ? 3 : 2)];
}
function dadumi(
  g: Grid,
  W: number,
  H: number,
  view: View,
  state: string,
): void {
  const U = H - (view === 1 ? 32 : 16);
  const using = has(state, "use");
  // 두드리는 중 (앉아 있는 동안 use · use-f1): 무릎 꿇은 사람(rural.ts DADUMI_SEAT) 두 손에 방망이 — 한 손은 들어 올리고 한 손은 천을 친다, 장면마다 번갈아
  const pound = () => {
    if (!using) return;
    const d = view as 0 | 1 | 2;
    const seat = DADUMI_SEAT(d, view === 1 ? 16 : 32, view === 1 ? 32 : 16);
    const fx = seat.x;
    const fy = seat.y + U;
    // 앉은 그림은 3px 들려 그려진다 (AvatarView SIT_CHAIR_LIFT) — 손은 발에서 10px쯤 위
    const hands: [number, number][] =
      view === 1
        ? [
            [fx - 6, fy - 11],
            [fx - 4, fy - 9],
          ]
        : [
            [fx - 6, fy - 10],
            [fx + 5, fy - 10],
          ];
    const [tx, ty] = dadumiCloth(view, H);
    const f = frameOf(state) % 2;
    const inX = (x: number) => Math.max(1, Math.min(W - 3, x)); // batLine은 오른쪽으로 1px 그늘을 더 그린다
    hands.forEach(([hx, hy], k) => {
      const hxx = inX(hx);
      if ((k + f) % 2 === 0) {
        // 들어 올린 방망이: 손에서 위로
        batLine(
          g,
          inX(hxx + (view === 1 ? 1 : k ? 2 : -2)),
          Math.max(2, hy - 11),
          hxx,
          hy,
        );
      } else {
        // 천을 치는 방망이: 손에서 천으로 + 탁 자국
        const ax = tx + (view !== 1 ? (k ? 4 : -5) : 0);
        const ay = ty + (view === 1 ? (k ? 4 : -5) : 0);
        batLine(g, ax, ay, hxx, hy);
        for (const [dx, dy] of view === 1
          ? [
              [-3, 0],
              [3, 1],
            ]
          : [
              [-3, -2],
              [3, -2],
            ])
          if (g.filled(inX(ax + dx), ay + dy))
            g.set(inX(ax + dx), ay + dy, 0xffffff);
      }
    });
  };
  if (view === 1) {
    const top = box3(g, U, 4, 11, 3, 29, 0, 8, GRANITE.mid, GRANITE.lo);
    for (let y = top.ty0; y <= top.ty1; y++)
      for (let x = 4; x <= 11; x++)
        g.set(
          x,
          y,
          x === 4 || y === top.ty0
            ? GRANITE.hi
            : x === 11
              ? GRANITE.lo
              : mix(GRANITE.mid, GRANITE.hi, 0.45),
        );
    stoneFront(g, 4, 11, top.fy0, top.fy1);
    speckle(g, 4, top.ty0, 11, top.ty1, 3);
    clearCorners(g, 4, top.ty0, 11, -1);
    // 다듬이감 (개어 쌓음)
    const cy0 = top.ty0 + 6;
    const cy1 = top.ty1 - 6;
    g.rect(6, cy0, 5, cy1 - cy0 + 1, CLOTH.mid);
    g.vline(6, cy0, cy1, CLOTH.hi);
    for (let y = cy0 + 3; y < cy1; y += 4) g.hline(7, 10, y, CLOTH.lo);
    g.hline(6, 10, cy1 + 1, CLOTH.lo);
    g.hline(6, 10, cy1 + 2, darken(CLOTH.lo, 0.1));
    if (!using) {
      // 천 위에 엇갈려 놓은 방망이 둘 (X)
      batLine(g, 5, top.ty0 + 6, 10, top.ty0 + 20);
      batLine(g, 10, top.ty0 + 7, 5, top.ty0 + 21);
    }
    pound();
    foot(g, 4, 11, top.fy1 + 1);
    return;
  }
  const top = box3(g, U, 3, 28, 7, 13, 0, 8, GRANITE.mid, GRANITE.lo);
  for (let y = top.ty0; y <= top.ty1; y++)
    for (let x = 3; x <= 28; x++)
      g.set(
        x,
        y,
        y === top.ty0 || x === 3
          ? GRANITE.hi
          : x === 28
            ? GRANITE.lo
            : mix(GRANITE.mid, GRANITE.hi, 0.45),
      );
  stoneFront(g, 3, 28, top.fy0, top.fy1);
  speckle(g, 3, top.ty0, 28, top.ty1, 3);
  clearCorners(g, 3, top.ty0, 28, -1);
  // 다듬이감: 가운데에 개어 쌓은 흰 천 (두께 2줄)
  const back = view === 2;
  const cy0 = back ? top.ty0 + 2 : top.ty0 + 1;
  g.rect(9, cy0, 14, 3, CLOTH.mid);
  g.hline(9, 22, cy0, CLOTH.hi);
  g.set(22, cy0 + 1, CLOTH.lo);
  g.hline(9, 22, cy0 + 3, CLOTH.lo);
  g.hline(9, 22, cy0 + 4, darken(CLOTH.lo, 0.12));
  if (!using) {
    // 천 위에 엇갈려 놓은 방망이 둘 (X)
    batLine(g, 7, top.ty0 + 1, 22, top.ty1);
    batLine(g, 24, top.ty0 + 1, 9, top.ty1);
  }
  pound();
  foot(g, 3, 28, top.fy1 + 1);
}

// ════════════════ 4. 곶감 걸이 (2×1, 혼자 서는 나무 틀 — 앞에서 보면 넓은 틀에 곶감 세 줄이 나란히) ════════════════
// 11/27 1×2 시안을 2×1로: 앞·뒤 = 시안의 옆모습(넓은 틀, 깊이 방향 가로대 셋에 한 줄씩), 옆 = 시안의 앞모습(깊이로 긴 틀, 줄 셋이 앞뒤로).
// 줄 A·B·C (앞에서 왼쪽→오른쪽). 빼 먹으면 C줄(옆에서 보면 가장 가까운 줄) 아래에서부터 하나씩 비고 짚 끈만 남는다.
const GAM = {
  hi: 0xee9442,
  mid: 0xc4601f,
  lo: 0x8a3612,
  frost: 0xf6e8d4,
  cap: 0x4a4018,
} as const;
const RACK = {
  hi: 0xa88a68,
  mid: 0x806648,
  lo: 0x5c4630,
  line: 0x3e2e1e,
} as const;
const STRAW = 0xe2c886;
const GOT_UP = 26;
/** 곶감 한 알 (5×4): 꼭지 + 납작한 몸 (가끔 하얀 분) */
function persimmon(g: Grid, x: number, y: number, frost: boolean) {
  g.hline(x + 1, x + 3, y, GAM.cap);
  g.set(x + 2, y, darken(GAM.cap, 0.2));
  g.hline(x, x + 4, y + 1, GAM.mid);
  g.set(x, y + 1, GAM.hi);
  g.set(x + 1, y + 1, GAM.hi);
  g.hline(x, x + 4, y + 2, GAM.mid);
  g.set(x, y + 2, GAM.hi);
  g.set(x + 4, y + 2, GAM.lo);
  if (frost) g.set(x + 2, y + 2, GAM.frost);
  g.hline(x + 1, x + 3, y + 3, GAM.lo);
}
/** 곶감 줄: 매듭(y)에서 아래로 n알. skip = 아래에서부터 빠진 개수 */
function strand(
  g: Grid,
  x: number,
  y: number,
  n: number,
  skip: number,
  salt: number,
) {
  const keep = n - skip;
  g.set(x + 2, y, STRAW);
  for (let i = 0; i < keep; i++)
    persimmon(g, x, y + 1 + i * 4, hash2(salt, i, 7) > 0.8);
  // 빼 먹은 자리: 짚 끈만 남는다
  if (skip > 0) g.vline(x + 2, y + 1 + keep * 4, y + keep * 4 + 3, STRAW);
}
const GOT_N = 6;
/** 줄 하나에서 빠진 개수 (C줄 = 2번만 준다) */
const eatenOn = (strandIdx: number, v: string) =>
  strandIdx === 2 ? Math.min(3, stepOf(v)) : 0;
function gotgam(
  g: Grid,
  W: number,
  H: number,
  view: View,
  state: string,
): void {
  const U = GOT_UP;
  const Y = (d: number, z: number) => U + d - z;
  const TOP = 25;
  const post = (x: number, d: number, back: boolean) => {
    g.vline(x, Y(d, TOP), Y(d, 0), back ? RACK.lo : RACK.mid);
    g.vline(x + 1, Y(d, TOP), Y(d, 0), back ? RACK.line : RACK.lo);
    if (!back) {
      g.set(x, Y(d, TOP), RACK.hi);
      g.set(x - 1, Y(d, 0), RACK.lo);
      g.set(x + 2, Y(d, 0), RACK.lo);
    }
  };
  if (view !== 1) {
    // 앞·뒤: 넓은 틀. 난간 둘(먼 쪽 d3 · 가까운 쪽 d13), 깊이 방향 가로대 셋에 한 줄씩 (뒤에서 보면 줄 순서가 거꾸로)
    post(2, 3, true);
    post(28, 3, true);
    g.hline(2, 29, Y(3, TOP), RACK.mid);
    [8, 16, 24].forEach((x, k) => {
      const s = view === 2 ? 2 - k : k;
      g.vline(x, Y(3, TOP), Y(13, TOP), RACK.lo);
      strand(g, x - 2, Y(8, TOP), GOT_N, eatenOn(s, state), s);
    });
    g.hline(2, 29, Y(13, TOP), RACK.hi);
    post(2, 13, false);
    post(28, 13, false);
    g.hline(3, 28, Y(13, 2), RACK.lo);
    foot(g, 1, 30, Y(13, 0) + 1);
    return;
  }
  // 옆(왼쪽을 봄): 깊이로 긴 틀 — 세로 난간 둘(x2·x12), 가로대 셋(d 7·15·23)에 줄 A(먼)·B·C(가까운)
  post(2, 3, true);
  post(12, 3, true);
  g.vline(2, Y(3, TOP), Y(29, TOP), RACK.mid);
  g.vline(13, Y(3, TOP), Y(29, TOP), RACK.lo);
  [7, 15, 23].forEach((d, k) => {
    g.hline(3, 12, Y(d, TOP), RACK.hi);
    strand(g, 5, Y(d, TOP) + 1, GOT_N, eatenOn(k, state), k);
  });
  post(2, 29, false);
  post(12, 29, false);
  g.hline(2, 13, Y(29, TOP), RACK.hi);
  g.hline(3, 12, Y(29, 2), RACK.lo);
  foot(g, 1, 14, Y(29, 0) + 1);
}

// ════════════════ 5. 옛날 선풍기 (1×1, 민트 몸통 + 하늘색 날개, 고개 돌림) ════════════════
const MINT = {
  hi: 0xbdeedd,
  mid: 0x7ccab4,
  lo: 0x4e9c8a,
  line: 0x2e6c5e,
} as const;
const BLADE = { hi: 0xc4e6f8, mid: 0x86c2e6, lo: 0x5a98c0 } as const;
const WIRE = 0xe6ecee;
const FAN_UP = 20;
/** 상태 → (바라보는 각 φ의 흔들림, 날개 회전 단계, 켜짐) */
/** 상태 → (바라보는 각의 흔들림, 날개 회전 단계, 켜짐, 바람 세기 1~3). 고개는 장면 f0~f3마다 가운데 → 왼쪽 → 가운데 → 오른쪽 (멈춘 그림 f0은 정면) */
function fanPose(state: string): {
  yaw: number;
  spin: number;
  on: boolean;
  speed: number;
} {
  if (!has(state, "on")) return { yaw: 0, spin: 0, on: false, speed: 0 };
  const f = frameOf(state) % 4;
  const yaws = [0, -38, 0, 38];
  return {
    yaw: yaws[f],
    spin: f,
    on: true,
    speed: Math.max(1, Math.min(3, stepOf(state))),
  };
}
function fan(g: Grid, W: number, H: number, view: View, state: string): void {
  const U = FAN_UP;
  const { yaw, spin, on, speed } = fanPose(state);
  // 바람이 셀수록 밝은 호가 넓어지고(흐릿한 날개) 장면마다 더 많이 돈다
  const bandW = [0.9, 0.9, 1.2, 1.6][speed];
  const base0 = view === 0 ? 0 : view === 1 ? 90 : 180;
  const phi = ((base0 + yaw) * Math.PI) / 180;
  const cosp = Math.cos(phi);
  const sinp = Math.sin(phi);
  // 받침 (둥근 네모) + 누름 단추
  const b = box3(g, U, 4, 11, 6, 12, 0, 2, MINT.mid, MINT.lo, {
    topHi: MINT.hi,
  });
  clearCorners(g, 4, b.ty0, 11, b.fy1);
  g.hline(4, 11, b.fy1, MINT.line);
  g.set(4, b.fy1, 0, 0);
  g.set(11, b.fy1, 0, 0);
  const keys = (pts: [number, number][]) =>
    pts.forEach(([x, y], i) => {
      g.set(x, y, on && i === 1 ? 0xf07a5a : 0xf6f2e8);
      g.set(x, y + 1, on && i === 1 ? 0xc0503a : 0xc8c4b8);
    });
  if (view === 0)
    keys([
      [5, b.ty1 - 1],
      [7, b.ty1 - 1],
      [9, b.ty1 - 1],
    ]);
  else if (view === 1)
    keys([
      [5, b.ty0],
      [5, b.ty0 + 2],
      [5, b.ty0 + 4],
    ]);
  else
    keys([
      [6, b.ty0],
      [8, b.ty0],
      [10, b.ty0],
    ]);
  // 기둥 (크롬)
  const cx = 7.5;
  const cy = U + 9 - 19;
  g.rect(7, cy + 4, 2, b.ty0 + 3 - (cy + 4), 0xc8d0d4);
  g.vline(7, cy + 4, b.ty0 + 2, 0xeef2f4);
  // 머리: 망 원판 (반지름 6) + 뒤 모터
  const R = 6.5;
  const rx = Math.max(2.4, R * Math.abs(cosp));
  const mx = cx + sinp * 3.6;
  const my = cy - cosp * 1.2;
  const motor = () => {
    g.ellipse(mx, my, 2.8, 3, MINT.mid);
    g.ellipse(mx - 0.4, my - 0.6, 1.6, 1.8, MINT.hi);
    if (cosp < -0.3) {
      // 뒤에서 보면 모터 뚜껑 통풍 줄
      for (let y = Math.round(my - 1); y <= Math.round(my + 1); y += 2)
        g.hline(Math.round(mx - 1), Math.round(mx + 1), y, MINT.line);
    }
    g.set(Math.round(mx), Math.round(my - 3), MINT.line); // 고개 멈춤 손잡이
    g.set(Math.round(mx), Math.round(my - 4), MINT.lo);
  };
  const disc = () => {
    const face = cosp >= 0;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / R;
        const r = Math.hypot(u, v);
        if (r > 1) continue;
        let c: Color;
        if (r > 0.82) c = WIRE;
        else if (r < 0.26) c = face ? MINT.mid : MINT.lo;
        else {
          let a = Math.atan2(v, face ? u : -u);
          if (on) {
            // 도는 날개: 흐린 고리 + 장면마다 밝은 호
            const band =
              Math.abs(
                ((a - spin * (0.6 + speed * 0.5) + Math.PI * 3) %
                  (Math.PI * 2)) -
                  Math.PI,
              ) < bandW;
            c = band ? BLADE.hi : mix(BLADE.mid, 0x4e6e7a, 0.25);
          } else {
            a = (a + Math.PI * 2) % ((Math.PI * 2) / 3);
            const blade = Math.abs(a - Math.PI / 3) < 0.62 - r * 0.1;
            c = blade ? (r < 0.55 ? BLADE.hi : BLADE.mid) : 0x7a96a2;
          }
          if (!face) c = darken(c, 0.25);
          // 망살 (안쪽 고리 + 살)
          if (Math.abs(r - 0.56) < 0.08 && (x + y) % 2 === 0) c = WIRE;
        }
        g.set(x, y, c);
      }
  };
  // 목 (기둥 → 모터)
  g.vline(Math.round(mx), Math.round(my + 2), Math.round(cy + 4), 0xc8d0d4);
  if (cosp >= 0) {
    motor();
    disc();
  } else {
    disc();
    motor();
  }
  foot(g, 3, 12, b.fy1 + 1);
}

// ════════════════ 6. 쌀뒤주 (2×1, 느티나무 + 무쇠 장석 + 놋쇠 자물쇠) ════════════════
const ELM = {
  hi: 0xa86a40,
  mid: 0x864c2a,
  lo: 0x62341c,
  line: 0x3e1e0e,
} as const;
const RAW = { hi: 0xdcb07c, mid: 0xc4945e } as const;
const RICE = { hi: 0xfbf8ee, mid: 0xece6d4, lo: 0xd0c6ac } as const;
const SSAL_UP = 16;
function ironCorner(g: Grid, x: number, y: number, dx: number, dy: number) {
  g.set(x, y, IRON.mid);
  g.set(x + dx, y, IRON.mid);
  g.set(x + 2 * dx, y, IRON.lo);
  g.set(x, y + dy, IRON.mid);
  g.set(x, y + 2 * dy, IRON.lo);
  g.set(x, y, IRON.hi);
}
function ssal(g: Grid, W: number, H: number, view: View, state: string): void {
  const U = SSAL_UP;
  const open = has(state, "open");
  if (view === 1) {
    // 왼쪽을 봄: 긴 쪽이 깊이. 뚜껑 = 윗면 왼쪽 절반(앞쪽)
    const Y = (d: number, z: number) => U + d - z;
    const b = box3(g, U, 2, 13, 3, 29, 4, 17, ELM.mid, ELM.mid, {
      topHi: ELM.hi,
    });
    // 옆판: 테 + 판
    g.rect(2, b.fy0, 12, 2, ELM.lo);
    g.rect(2, b.fy1 - 1, 12, 2, ELM.lo);
    g.rect(4, b.fy0 + 3, 8, b.fy1 - b.fy0 - 5, ELM.lo);
    g.rect(5, b.fy0 + 4, 6, b.fy1 - b.fy0 - 7, ELM.mid);
    g.hline(5, 10, b.fy0 + 4, ELM.hi);
    ironCorner(g, 2, b.fy0, 1, 1);
    ironCorner(g, 13, b.fy0, -1, 1);
    // 앞면 쪽 놋쇠 고리가 왼쪽 끝에 살짝
    g.vline(2, b.fy0 + 1, b.fy0 + 3, BRASS.mid);
    g.set(2, b.fy0 + 1, BRASS.hi);
    // 다리
    g.rect(5, Y(29, 3), 6, 4, 0x24140a, 150);
    for (const x of [2, 11]) g.rect(x, Y(29, 3), 3, 4, ELM.line);
    // 윗면: 이음줄 x7 / 뚜껑 x2..6
    g.vline(7, b.ty0, b.ty1, ELM.line);
    g.vline(2, b.ty0, b.ty1, ELM.hi);
    if (open) {
      // 뚜껑은 뒤쪽 반 위에 뒤집어 얹힘 (안쪽 생나무, 1px 두께)
      g.rect(8, b.ty0 - 1, 6, b.ty1 - b.ty0 + 1, RAW.mid);
      g.vline(8, b.ty0 - 1, b.ty1 - 1, RAW.hi);
      g.hline(8, 13, b.ty1, ELM.lo);
      // 쌀
      g.rect(3, b.ty0 + 1, 4, b.ty1 - b.ty0 - 1, RICE.mid);
      g.hline(3, 6, b.ty0, ELM.line);
      for (let y = b.ty0 + 1; y < b.ty1; y++)
        for (let x = 3; x <= 6; x++)
          if (hash2(x, y, 4) > 0.8) g.set(x, y, RICE.hi);
      for (let y = b.ty0 + 2; y < b.ty1; y += 3) g.set(4 + (y % 2), y, RICE.lo);
      // 됫박
      g.rect(3, b.ty0 + 15, 4, 3, PINE.hi);
      g.rect(4, b.ty0 + 16, 2, 1, PINE.lo);
    } else {
      g.rect(3, b.ty0, 4, b.ty1 - b.ty0 + 1, ELM.mid);
      g.vline(3, b.ty0, b.ty1, ELM.hi);
      for (const y of [b.ty0 + 5, b.ty1 - 5]) g.hline(4, 9, y, IRON.mid);
      // 고리
      g.rect(2, b.ty0 + 11, 2, 3, BRASS.mid);
      g.set(2, b.ty0 + 11, BRASS.hi);
    }
    foot(g, 2, 13, Y(29, 0) + 1);
    return;
  }
  const Y = (d: number, z: number) => U + d - z;
  const b = box3(g, U, 2, 29, 3, 13, 4, 17, ELM.mid, ELM.mid, {
    topHi: ELM.hi,
  });
  const back = view === 2;
  // 앞판(뒤에서 보면 뒤판)
  g.rect(2, b.fy0, 28, 2, ELM.lo);
  g.rect(2, b.fy1 - 1, 28, 2, ELM.lo);
  g.rect(2, b.fy0, 3, b.fy1 - b.fy0 + 1, ELM.lo);
  g.rect(27, b.fy0, 3, b.fy1 - b.fy0 + 1, ELM.lo);
  if (back) {
    for (let x = 7; x < 27; x += 5) g.vline(x, b.fy0 + 2, b.fy1 - 2, ELM.lo);
  } else {
    g.rect(15, b.fy0, 2, b.fy1 - b.fy0 + 1, ELM.lo);
    for (const x0 of [6, 18]) {
      g.rect(x0, b.fy0 + 3, 8, b.fy1 - b.fy0 - 5, ELM.mid);
      g.hline(x0, x0 + 7, b.fy0 + 3, ELM.hi);
      g.set(x0 + 1, b.fy0 + 6, ELM.lo);
      g.set(x0 + 5, b.fy0 + 8, ELM.lo);
    }
  }
  ironCorner(g, 2, b.fy0, 1, 1);
  ironCorner(g, 29, b.fy0, -1, 1);
  ironCorner(g, 2, b.fy1, 1, -1);
  ironCorner(g, 29, b.fy1, -1, -1);
  // 다리
  g.rect(5, Y(13, 3), 22, 4, 0x24140a, 150);
  for (const x of [2, 27]) {
    g.rect(x, Y(13, 3), 3, 4, ELM.line);
    g.set(x, Y(13, 3), ELM.lo);
  }
  // 윗면: 뚜껑 = 앞쪽 반 (뒤에서 보면 먼 쪽 반)
  const seam = b.ty0 + 4;
  g.hline(2, 29, seam, ELM.line);
  const lid: [number, number] = back ? [b.ty0, seam - 1] : [seam + 1, b.ty1];
  const fixed: [number, number] = back ? [seam + 1, b.ty1] : [b.ty0, seam - 1];
  if (open) {
    // 쌀이 보이는 자리
    g.rect(4, lid[0], 24, lid[1] - lid[0] + 1, RICE.mid);
    g.hline(4, 27, lid[0], ELM.line);
    for (let y = lid[0] + 1; y <= lid[1]; y++)
      for (let x = 4; x <= 27; x++)
        if (hash2(x, y, 4) > 0.8) g.set(x, y, RICE.hi);
    for (let x = 5; x < 27; x += 4)
      g.set(x + (x % 3), lid[1] - (x % 2), RICE.lo);
    // 됫박
    const dy = lid[0] + 1;
    g.rect(20, dy, 5, 3, PINE.hi);
    g.rect(21, dy + 1, 3, 1, PINE.lo);
    // 뒤집어 얹은 뚜껑 (고정 판 위, 1px 높게)
    g.rect(3, fixed[0] - 1, 26, fixed[1] - fixed[0] + 1, RAW.mid);
    g.hline(3, 28, fixed[0] - 1, RAW.hi);
    g.hline(3, 28, fixed[1], ELM.lo);
    for (const x of [8, 22]) g.vline(x, fixed[0] - 1, fixed[1] - 1, IRON.lo);
  } else {
    g.rect(3, lid[0], 26, lid[1] - lid[0] + 1, ELM.mid);
    g.hline(3, 28, lid[0], ELM.hi);
    for (const x of [8, 22]) {
      g.vline(x, lid[0], lid[1], IRON.mid);
      g.vline(x + 1, lid[0], lid[1], IRON.lo);
      g.set(x, seam, IRON.hi);
      g.set(x, back ? seam + 1 : seam - 1, IRON.mid);
    }
    // 걸쇠
    if (!back) {
      g.rect(14, lid[1] - 1, 4, 2, BRASS.mid);
      g.hline(14, 17, lid[1] - 1, BRASS.hi);
    } else {
      g.rect(14, lid[0], 4, 1, BRASS.mid);
    }
  }
  if (!back) {
    // 앞바탕 놋쇠 + 자물쇠
    g.rect(12, b.fy0, 8, 3, BRASS.mid);
    g.hline(12, 19, b.fy0, BRASS.hi);
    g.set(12, b.fy0 + 2, BRASS.lo);
    g.set(19, b.fy0 + 2, BRASS.lo);
    if (open) {
      g.rect(13, b.fy0 + 3, 2, 3, BRASS.lo);
    } else {
      g.hline(11, 20, b.fy0 + 2, BRASS.lo);
      g.rect(14, b.fy0 + 3, 4, 3, BRASS.mid);
      g.hline(14, 17, b.fy0 + 3, BRASS.hi);
      g.set(15, b.fy0 + 4, BRASS.lo);
    }
  }
  foot(g, 2, 29, Y(13, 0) + 1);
}

// ════════════════ 7. 브라운관 TV (2×1, 나무 받침장 + 레이스 덮개 + 토끼 귀 안테나) ════════════════
const TVW = {
  hi: 0x8e6040,
  mid: 0x6c4428,
  lo: 0x4c2e1a,
  line: 0x2e1a0e,
} as const;
const BEZEL = { hi: 0xe2e4e6, mid: 0xb8bcc0, lo: 0x8a9096 } as const;
const STAND = {
  hi: 0xc69660,
  mid: 0xa87642,
  lo: 0x80542c,
  line: 0x5a3818,
} as const;
const LACE = 0xfaf6ee;
const TV_UP = 24;
/** 화면 내용: off · st0/st1(지지직) · ch1(색 막대) · ch2(사극) · ch3(일기 예보) */
function screen(
  g: Grid,
  x0: number,
  y0: number,
  w: number,
  h: number,
  state: string,
): void {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = x0 + i;
      const y = y0 + j;
      let c: Color;
      if (state === "off") {
        c = mix(0x2e3c38, 0x46564e, j / h);
        if (i + j === 3 || i + j === 4) c = 0x7a8a84;
      } else if (state.startsWith("st")) {
        const s = hash2(i, j, state === "st1" ? 91 : 37);
        c = s > 0.62 ? 0xf2f4f6 : s > 0.3 ? 0x9aa0a8 : 0x50565e;
        if (j === (state === "st1" ? 7 : 3)) c = lighten(c, 0.35);
      } else if (state === "ch1") {
        const bars = [
          0xf2f2f2, 0xf0e050, 0x60d8e8, 0x60c860, 0xd060c8, 0xe05050, 0x4a5ad8,
        ];
        c =
          j < h - 3
            ? bars[Math.floor((i * bars.length) / w)]
            : i < w / 2
              ? 0x2a2a3a
              : 0xe8e8e8;
      } else if (state === "ch2") {
        // 사극: 노을 하늘 + 갓 쓴 두 사람 그림자
        c = j < h * 0.55 ? mix(0xf0a060, 0xe07050, j / (h * 0.55)) : 0x6a3a2a;
        const fig = (fx: number) => {
          const dx = i - fx;
          if (j === 2 && dx >= -2 && dx <= 2) return true; // 갓 챙
          if (j === 1 && dx >= -1 && dx <= 0) return true; // 갓 위
          if (j >= 3 && j <= 4 && dx >= -1 && dx <= 0) return true; // 머리
          if (j >= 5 && dx >= -2 && dx <= 1) return true; // 몸
          return false;
        };
        if (fig(3) || fig(w - 3)) c = 0x2a1a20;
      } else {
        // 일기 예보: 파란 바탕 + 초록 땅 + 해·구름
        c = 0x3a6ac8;
        const land = (i - w * 0.45) ** 2 / 9 + (j - h * 0.55) ** 2 / 14 < 1;
        if (land) c = j % 3 === 0 ? 0x4aa050 : 0x5ab860;
        if ((i - 2) ** 2 + (j - 2) ** 2 <= 2) c = 0xf8d040;
        if (j === 7 && i >= w - 4 && i <= w - 2) c = 0xf4f8fc;
        if (j === 6 && i === w - 3) c = 0xf4f8fc;
      }
      g.set(x, y, c);
    }
  // 둥근 브라운관 모서리
  for (const [cx, cy] of [
    [x0, y0],
    [x0 + w - 1, y0],
    [x0, y0 + h - 1],
    [x0 + w - 1, y0 + h - 1],
  ])
    g.set(cx, cy, BEZEL.lo);
}
const CH_TICK: Record<string, [number, number]> = {
  off: [0, -1],
  st0: [1, -1],
  st1: [1, -1],
  ch1: [1, 0],
  ch2: [1, 1],
  ch3: [0, 1],
};
function antenna(g: Grid, bx: number, by: number, tips: [number, number][]) {
  g.rect(bx - 1, by - 1, 3, 2, 0x3a3a40);
  g.set(bx, by - 1, 0x6a6a72);
  for (const [tx, ty] of tips) {
    const n = Math.max(Math.abs(tx - bx), Math.abs(ty - by));
    for (let k = 1; k <= n; k++)
      g.set(
        Math.round(bx + ((tx - bx) * k) / n),
        Math.round(by - 1 + ((ty - by + 1) * k) / n),
        0xb0b6bc,
      );
    g.set(tx, ty, 0xe8ecf0);
  }
}
/** 그림 변형 → 화면 (꺼짐 off · 지지직 st0/st1 · 채널 ch1~ch3) */
function tvScreen(v: string): string {
  if (has(v, "static")) return `st${frameOf(v) % 2}`;
  if (!has(v, "on")) return "off";
  return `ch${Math.max(1, Math.min(3, stepOf(v)))}`;
}
function tv(g: Grid, W: number, H: number, view: View, v: string): void {
  const U = TV_UP;
  const state = tvScreen(v);
  const on = state !== "off";
  if (view === 1) {
    const Y = (d: number, z: number) => U + d - z;
    // 받침장 옆
    const s = box3(g, U, 2, 13, 2, 29, 0, 11, STAND.mid, STAND.mid, {
      topHi: STAND.hi,
    });
    g.rect(3, s.fy0 + 2, 10, s.fy1 - s.fy0 - 4, STAND.lo);
    g.rect(4, s.fy0 + 3, 8, s.fy1 - s.fy0 - 6, STAND.mid);
    g.hline(2, 13, s.fy1, STAND.line);
    for (const x of [2, 12]) g.rect(x, Y(29, 1), 2, 2, STAND.line);
    // TV 옆 (앞쪽 = 왼쪽): 나무 상자 x3..10 + 뒤로 튀어나온 브라운관 x11..13
    const bulge = box3(g, U, 11, 13, 11, 22, 13, 25, 0x6a625e, 0x524a46, {
      topHi: 0x7e7672,
    });
    for (let y = bulge.fy0 + 1; y < bulge.fy1; y += 2)
      g.hline(11, 12, y, 0x2a2426);
    const t = box3(
      g,
      U,
      3,
      10,
      6,
      27,
      11,
      28,
      mix(TVW.mid, TVW.hi, 0.5),
      TVW.mid,
      { topHi: TVW.hi },
    );
    g.vline(3, t.ty0, t.ty1, BEZEL.mid);
    for (let y = t.fy0 + 2; y < t.fy1 - 1; y += 3) g.hline(5, 9, y, TVW.lo);
    for (let y = t.fy0 + 3; y < t.fy1 - 3; y += 2) g.hline(7, 9, y, TVW.line);
    g.hline(3, 10, t.fy1, TVW.line);
    // 앞면(화면 테) 한 줄 + 켜지면 화면 빛이 왼쪽 끝에 비친다
    g.vline(3, t.fy0, t.fy1 - 1, BEZEL.hi);
    if (on)
      g.vline(
        2,
        t.fy0 + 1,
        t.fy1 - 2,
        // 화면 빛이 옆으로 비친다 (지지직은 장면마다 밝기, 채널은 그 화면 색: 색 막대 흰빛 · 사극 노을 · 일기 예보 파랑)
        (
          {
            st0: 0xeef2f6,
            st1: 0xc4ccd6,
            ch1: 0xe6ecf6,
            ch2: 0xf0a878,
            ch3: 0x6a9ae0,
          } as Record<string, Color>
        )[state] ?? 0x9ac0f0,
      );
    // 레이스 덮개 (가운데만)
    g.rect(5, t.ty0 + 6, 5, t.ty1 - t.ty0 - 11, LACE);
    for (let y = t.ty0 + 6; y < t.ty1 - 5; y += 2) g.set(4, y, LACE);
    antenna(g, 7, t.ty0 + 10, [
      [3, 1],
      [11, 2],
    ]);
    foot(g, 2, 13, Y(29, 0) + 1);
    return;
  }
  const Y = (d: number, z: number) => U + d - z;
  const back = view === 2;
  // 받침장
  const s = box3(g, U, 2, 29, 3, 14, 0, 11, STAND.mid, STAND.mid, {
    topHi: STAND.hi,
  });
  g.hline(2, 29, s.fy0, STAND.hi);
  if (back) {
    for (let x = 6; x < 28; x += 5) g.vline(x, s.fy0 + 1, s.fy1 - 2, STAND.lo);
  } else {
    // 미닫이 문 둘 + 동그란 손잡이 구멍
    for (const x0 of [4, 16]) {
      g.rect(x0, s.fy0 + 2, 12, s.fy1 - s.fy0 - 4, STAND.lo);
      g.rect(x0 + 1, s.fy0 + 3, 10, s.fy1 - s.fy0 - 6, STAND.mid);
      g.hline(x0 + 1, x0 + 10, s.fy0 + 3, STAND.hi);
    }
    g.rect(13, s.fy0 + 5, 2, 2, STAND.line);
    g.rect(17, s.fy0 + 5, 2, 2, STAND.line);
  }
  g.hline(2, 29, s.fy1, STAND.line);
  for (const x of [2, 28]) g.rect(x, Y(14, 1), 2, 2, STAND.line);
  if (back) {
    // 뒤: 브라운관 뒤통수(좁아지는 회갈색 상자) + 통풍구
    const t = box3(g, U, 4, 27, 6, 12, 11, 28, TVW.mid, TVW.mid, {
      topHi: TVW.hi,
    });
    const bk = box3(g, U, 9, 22, 11, 15, 12, 24, 0x5a5250, 0x4a4442, {
      topHi: 0x6e6664,
    });
    for (let y = bk.fy0 + 2; y < bk.fy1 - 1; y += 2)
      for (let x = 11; x <= 20; x += 2) g.set(x, y, 0x2a2426);
    g.rect(24, t.fy1 - 4, 2, 2, 0x2a2426); // 전선 구멍
    g.rect(10, t.ty0 + 1, 12, 3, LACE);
    antenna(g, 16, t.ty0 + 2, [
      [9, 1],
      [22, 2],
    ]);
    foot(g, 2, 29, Y(14, 0) + 1);
    return;
  }
  const t = box3(g, U, 4, 27, 6, 12, 11, 28, TVW.mid, TVW.mid, {
    topHi: TVW.hi,
  });
  // 나뭇결
  for (let y = t.fy0 + 1; y < t.fy1; y += 3) g.set(4, y, TVW.lo);
  g.vline(27, t.ty0, t.fy1, TVW.lo);
  g.hline(4, 27, t.fy1, TVW.line);
  // 화면 테 + 화면
  g.rect(5, t.fy0 + 1, 16, t.fy1 - t.fy0 - 2, BEZEL.mid);
  g.hline(5, 20, t.fy0 + 1, BEZEL.hi);
  g.hline(5, 20, t.fy1 - 2, BEZEL.lo);
  screen(g, 6, t.fy0 + 2, 14, t.fy1 - t.fy0 - 4, state);
  // 오른쪽 손잡이판: 채널 다이얼(큰) + 소리(작은) + 스피커 구멍
  g.rect(21, t.fy0 + 1, 6, t.fy1 - t.fy0 - 2, TVW.lo);
  const kx = 22;
  const ky = t.fy0 + 2;
  g.rect(kx, ky, 4, 4, BEZEL.mid);
  g.hline(kx, kx + 3, ky, BEZEL.hi);
  g.set(kx, ky, TVW.lo);
  g.set(kx + 3, ky + 3, TVW.lo);
  const [tx, ty] = CH_TICK[state] ?? [1, -1];
  g.set(
    kx + 1 + (tx > 0 ? 1 : 0),
    ky + 1 + (ty > 0 ? 1 : ty < 0 ? 0 : 1),
    0x2a2a30,
  );
  g.rect(kx + 1, ky + 5, 2, 2, BEZEL.mid);
  for (let y = ky + 8; y < t.fy1 - 2; y += 2)
    for (let x = kx; x <= kx + 3; x += 2) g.set(x, y, TVW.line);
  g.set(kx + 3, ky + 5, on ? 0xff4a3a : 0x5a2a24); // 켜짐 불
  // 레이스 덮개 (가운데만, 앞으로 물결 끝이 늘어짐)
  g.rect(10, t.ty0 + 1, 12, t.ty1 - t.ty0, LACE);
  for (let x = 10; x <= 21; x++) if (x % 2 === 0) g.set(x, t.fy0, LACE);
  for (let x = 11; x <= 20; x += 3) g.set(x, t.ty0 + 3, 0xd8d0c4);
  antenna(g, 16, t.ty0 + 2, [
    [9, 1],
    [23, 2],
  ]);
  foot(g, 2, 29, Y(14, 0) + 1);
}

// ════════════════ 8. 목화솜 이불 + 요 (3×2, 두 사람) ════════════════
const SATIN = { hi: 0xf06a86, mid: 0xd8405e, lo: 0xae2a48 } as const;
const LINING = { hi: 0xffffff, mid: 0xf6f4ee, lo: 0xd8d2c6 } as const;
const YO = { mid: 0xeef2f6, lo: 0xc8d2dc, line: 0xa8c0d8 } as const;
const PILLOW = { hi: 0xeaf6ef, mid: 0xc6e2d4, lo: 0x94c0ac } as const;
const BED_UP = 4;
/** 이불 무늬 (이불 칸 안 좌표 i,j: 이불 앞(발치)이 아래가 되게 돌린 좌표) — 큰 목단 + 잎 */
function satinAt(i: number, j: number): Color {
  // 목단 중심 격자 (엇갈림)
  const cell = 12;
  const row = Math.floor(j / cell);
  const ox = row % 2 ? cell / 2 : 0;
  const ci = ((((i + ox) % cell) + cell) % cell) - cell / 2;
  const cj = (((j % cell) + cell) % cell) - cell / 2;
  const r2 = ci * ci + cj * cj;
  if (r2 <= 1) return PEONY.core;
  if (r2 <= 5) return ci + cj < 0 ? PEONY.hi : PEONY.mid;
  if (r2 <= 9) return PEONY.lo;
  // 잎 (꽃 오른쪽 아래)
  if (
    (ci === 3 && cj === 3) ||
    (ci === 4 && cj === 3) ||
    (ci === 4 && cj === 4)
  )
    return LEAF.mid;
  if (ci === -4 && cj === -3) return LEAF.lo;
  // 공단 윤기 (사선)
  if ((i - j * 2 + 400) % 17 === 0) return SATIN.hi;
  return SATIN.mid;
}
/** 이불 본 좌표계: front(머리 위) · side(머리 오른쪽) · back(머리 아래) */
function bedding(
  g: Grid,
  W: number,
  H: number,
  view: View,
  _state: string,
  quiltMask?: Grid,
): void {
  const U = BED_UP;
  const mark = (x: number, y: number) => quiltMask?.set(x, y, 0xffffff);
  if (view === 1) {
    // 2×3: 발치가 왼쪽, 머리(베개)가 오른쪽
    const yo = box3(g, U, 1, 30, 1, 46, 0, 2, YO.mid, YO.lo);
    for (let y = yo.ty0 + 1; y < yo.ty1; y++) {
      g.set(2, y, YO.line);
      g.set(29, y, YO.line);
    }
    g.hline(2, 29, yo.ty0 + 1, YO.line);
    g.hline(2, 29, yo.ty1 - 1, YO.line);
    // 베개 둘 (세로로 놓인 원통, 가까운 끝에 베갯모)
    for (const [d0, d1] of [
      [5, 20],
      [26, 41],
    ]) {
      const p = box3(g, U, 21, 26, d0, d1, 2, 6, PILLOW.mid, PILLOW.lo);
      g.vline(21, p.ty0, p.ty1, PILLOW.hi);
      g.vline(26, p.ty0, p.ty1, PILLOW.lo);
      clearCorners(g, 21, p.ty0, 26, p.fy1);
      beggaemo(g, 23.5, p.fy0 + 1.5, 2.6, 2.2);
    }
    // 이불: x 3..19, 깃(접힌 안감)이 오른쪽 x 17..19
    const q = box3(g, U, 3, 19, 3, 45, 2, 6, SATIN.mid, LINING.lo);
    for (let y = q.ty0; y <= q.ty1; y++)
      for (let x = 3; x <= 19; x++) {
        const i = q.ty1 - y; // 이불 가로(앞에서 본 i) = 아래→위
        const j = x - 3; // 발치(왼쪽) 0
        let c = satinAt(i, 16 - j);
        if (x >= 17) c = x === 17 ? LINING.lo : LINING.mid;
        else if (y <= q.ty0 + 1 || y >= q.ty1 - 1 || x <= 4) c = LINING.mid;
        g.set(x, y, c);
        mark(x, y);
      }
    g.vline(19, q.ty0, q.ty1, LINING.hi);
    // 두께 면 (안감이 감싼 흰 단)
    for (let y = q.fy0; y <= q.fy1; y++)
      g.hline(3, 19, y, y === q.fy1 ? LINING.lo : LINING.mid);
    g.hline(5, 16, q.fy0, SATIN.lo);
    clearCorners(g, 3, q.ty0, 19, q.fy1);
    foot(g, 1, 30, yo.fy1 + 1);
    return;
  }
  const back = view === 2;
  const yo = box3(g, U, 1, 46, 1, 30, 0, 2, YO.mid, YO.lo);
  g.hline(2, 45, yo.ty0 + 1, YO.line);
  g.hline(2, 45, yo.ty1 - 1, YO.line);
  for (let y = yo.ty0 + 1; y < yo.ty1; y++) {
    g.set(2, y, YO.line);
    g.set(45, y, YO.line);
  }
  const pillows = () => {
    const [d0, d1] = back ? [23, 28] : [3, 8];
    for (const [x0, x1] of [
      [6, 19],
      [28, 41],
    ]) {
      const p = box3(g, U, x0, x1, d0, d1, 2, 6, PILLOW.mid, PILLOW.lo);
      g.hline(x0, x1, p.ty0, PILLOW.hi);
      clearCorners(g, x0, p.ty0, x1, p.fy1);
      // 양 끝 베갯모 (원통 끝이 옆으로 보인다)
      beggaemo(g, x0 + 1, (p.ty0 + p.fy1) / 2, 1.6, 4);
      beggaemo(g, x1, (p.ty0 + p.fy1) / 2, 1.6, 4);
    }
  };
  const quilt = () => {
    const [d0, d1] = back ? [3, 22] : [9, 30];
    const q = box3(g, U, 4, 43, d0, d1, 2, 6, SATIN.mid, LINING.lo);
    for (let y = q.ty0; y <= q.ty1; y++)
      for (let x = 4; x <= 43; x++) {
        const fold = back ? y >= q.ty1 - 2 : y <= q.ty0 + 2;
        const i = back ? 43 - x : x - 4;
        const j = back ? q.ty1 - y : y - q.ty0;
        let c = satinAt(i, j);
        if (fold)
          c = (back ? y === q.ty1 - 2 : y === q.ty0 + 2)
            ? LINING.lo
            : LINING.mid;
        else if (x <= 5 || x >= 42 || (back ? y <= q.ty0 + 1 : y >= q.ty1 - 1))
          c = LINING.mid;
        g.set(x, y, c);
        mark(x, y);
      }
    g.hline(4, 43, back ? q.ty1 : q.ty0, LINING.hi);
    for (let y = q.fy0; y <= q.fy1; y++)
      g.hline(4, 43, y, y === q.fy1 ? LINING.lo : LINING.mid);
    if (!back) g.hline(6, 41, q.fy0, SATIN.lo);
    clearCorners(g, 4, q.ty0, 43, q.fy1);
  };
  if (back) {
    quilt();
    pillows();
  } else {
    pillows();
    quilt();
  }
  foot(g, 1, 46, yo.fy1 + 1);
}
/** 베갯모: 붉은 테 + 노란 꽃심 + 파란 꽃잎 */
function beggaemo(g: Grid, cx: number, cy: number, rx: number, ry: number) {
  g.ellipse(cx, cy, rx, ry, 0xc83848);
  g.ellipse(cx, cy, Math.max(0.8, rx - 0.8), Math.max(0.8, ry - 1.2), 0x3a62b0);
  g.set(Math.floor(cx), Math.floor(cy), 0xf6cf52);
}

// ════════════════ 바닥 3 · 벽 3 (16×16 · 16×40 벽지 칸) ════════════════
const FLOORS: Record<string, CxTile> = {
  // 반들 비닐 장판 (11/27 이름 확정 — 시안 「노란 장판」): 기본보다 진한 꿀빛 + 돗자리 엠보 결 + 사선 윤기 줄, 칸 이음선 없음, 가끔 연탄 눌은 자국
  cx_rr_floor_vinyl: (g, v) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const weave = ((x >> 2) + (y >> 2)) % 2 ? y % 2 === 0 : x % 2 === 0;
        let c = mix(
          0xd6962e,
          0xeab04a,
          0.45 + hash2(x + v * 31, y, 2) * 0.08 - y / 120,
        );
        if (weave) c = lighten(c, 0.05);
        const s = (x + y + 32) % 16;
        const k = [0.5, 0.25, 0, 0.12][v];
        if (s === 5) c = mix(c, 0xfff0c0, k);
        else if (s === 4 || s === 6) c = mix(c, 0xfff0c0, k * 0.4);
        g.set(x, y, c);
      }
  },
  // 콩댐 한지 장판: 8px 한지 조각을 엇갈려 붙이고 콩기름 — 조각마다 결이 다른 캐러멜빛, 겹친 가장자리가 진하다
  cx_rr_floor_kongdam: (g, v) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const piece = (x >> 3) + (y >> 3) * 2 + v * 4;
        const tone = hash2(piece, v, 11);
        let c = mix(
          0xb07c3c,
          0xcc9a54,
          0.35 + tone * 0.35 + hash2(x, y, v + 3) * 0.06,
        );
        const px = x % 8;
        const py = y % 8;
        // 한지 조각 가장자리: 겹친 쪽(오른쪽·아래)이 진하고 바로 안쪽이 살짝 밝다
        if (px === 7 || py === 7) c = darken(c, 0.14);
        else if (px === 0 || py === 0) c = lighten(c, 0.06);
        // 콩기름 윤기 (사선 짧은 줄)
        if ((x - y + 32) % 16 === 3 && px > 1 && px < 6) c = lighten(c, 0.16);
        if (hash2(x, y, 40 + v) > 0.96) c = lighten(c, 0.1);
        g.set(x, y, c);
      }
  },
  // 대청마루: 옅은 회갈색 우물마루 — 긴 귀틀(가로)마다 짧은 청판(세로)
  cx_rr_floor_daecheong: (g, v) => {
    const boards = [0xddcaa4, 0xd2bd96, 0xe2d2b0, 0xd6c29c];
    for (let x = 0; x < 16; x++) {
      const b = x >> 2;
      const base = boards[(b + v) % 4];
      for (let y = 3; y < 16; y++) {
        let c = base;
        if (x % 4 === 3) c = 0xa08a66;
        else if (x % 4 === 0) c = lighten(base, 0.1);
        if (hash2(x, y, v + 50) > 0.95 && x % 4 !== 3) c = darken(base, 0.06);
        g.set(x, y, c);
      }
    }
    // 귀틀 (가로 긴 나무)
    g.hline(0, 15, 0, 0xc4ae86);
    g.hline(0, 15, 1, 0xb49c74);
    g.hline(0, 15, 2, 0x8e7656);
    if (v === 2) g.set(7, 9, 0x8e7656);
  },
};
const PY0 = 6;
const PY1 = 40 - 6;
const PAPERS: Record<string, CxTile> = {
  // 창호 한지 벽: 벽 전체가 정자살 창호 + 아래 머름 판, 위 인방
  cx_rr_wall_changho: (g, v) => {
    for (let y = PY0; y <= PY1; y++)
      for (let x = 0; x < 16; x++)
        g.set(
          x,
          y,
          mix(0xfbf6e8, 0xefe4c8, hash2(x, y, 21) * 0.4 + (y - PY0) / 60),
        );
    // 인방
    g.rect(0, PY0, 16, 2, PINE.mid);
    g.hline(0, 15, PY0, PINE.hi);
    // 살 (가로·세로 4px, 가운데 띠는 두 줄)
    for (let y = PY0 + 2; y <= PY1 - 8; y++)
      for (let x = 0; x < 16; x++)
        if (x % 4 === 1 || (y - PY0) % 4 === 1) g.set(x, y, 0xb48858);
    for (let x = 0; x < 16; x += 4) g.set(x + 1, PY0 + 2, 0x9a6e42);
    // 머름 (아래 판)
    g.rect(0, PY1 - 7, 16, 8, PINE.mid);
    g.hline(0, 15, PY1 - 7, PINE.hi);
    g.rect(2, PY1 - 5, 12, 4, PINE.lo);
    g.hline(2, 13, PY1 - 5, PINE.line);
    if (v === 0) {
      g.rect(0, PY0, 2, PY1 - PY0 + 1, PINE.lo);
      g.vline(0, PY0, PY1, PINE.mid);
    }
  },
  // 황토 흙벽: 붉은 황토 + 지푸라기 + 나무 기둥·인방
  cx_rr_wall_hwangto: (g, v) => {
    for (let y = PY0; y <= PY1; y++)
      for (let x = 0; x < 16; x++) {
        const n = hash2(x >> 1, y >> 1, 60 + v) * 0.6 + hash2(x, y, 61) * 0.4;
        g.set(x, y, mix(0xa6643a, 0xc4834c, n));
      }
    // 지푸라기
    for (let k = 0; k < 7; k++) {
      const x = Math.floor(hash2(k, v, 70) * 14) + 1;
      const y = PY0 + 3 + Math.floor(hash2(k, v, 71) * (PY1 - PY0 - 6));
      const dir = hash2(k, v, 72) > 0.5 ? 1 : -1;
      g.set(x, y, 0xe6cc8c);
      g.set(x + dir, y + 1, 0xd8b878);
      if (k % 2) g.set(x - dir, y - 1, 0xf0d89c);
    }
    // 실금
    if (v === 1)
      for (let i = 0; i < 4; i++) g.set(5 + i, 26 + (i % 2), 0x7e4626);
    // 인방 (가로 나무)
    g.rect(0, 15, 16, 2, 0x5a3a22);
    g.hline(0, 15, 15, 0x7a5434);
    if (v === 0) {
      g.rect(0, PY0, 3, PY1 - PY0 + 1, 0x5a3a22);
      g.vline(1, PY0, PY1, 0x7a5434);
    }
  },
  // 신문지 도배 벽: 누렇게 바랜 신문 조각을 엇갈려 바름 — 글자는 알아볼 수 없는 회색 점·줄
  cx_rr_wall_news: (g, v) => {
    for (let y = PY0; y <= PY1; y++)
      for (let x = 0; x < 16; x++) {
        const row = Math.floor((y - PY0) / 10);
        const sx = x + (row % 2 ? 6 : 0) + v * 3;
        const sheet = Math.floor(sx / 11) + row * 5;
        const tone = hash2(sheet, row, 81);
        let c = mix(0xeae0c4, 0xd6c49a, tone);
        const lx = ((sx % 11) + 11) % 11;
        const ly = (y - PY0) % 10;
        if (lx === 0 || ly === 0) c = darken(c, 0.12);
        else {
          const kind = Math.floor(hash2(sheet, 3, 82) * 4);
          if (kind === 0 && ly >= 2 && ly <= 3 && lx >= 2 && lx <= 8)
            c = 0x5a564c; // 제목 막대
          else if (kind === 1 && ly >= 2 && ly <= 6 && lx >= 2 && lx <= 6)
            c = ly === 3 && lx === 4 ? 0xb0aa9c : 0x8a8478; // 사진
          else if (ly % 2 === 0 && lx >= 1 && hash2(x + v * 16, y, 83) > 0.35)
            c = mix(c, 0x6e6a60, 0.55); // 글줄
        }
        g.set(x, y, c);
      }
    // 물 얼룩
    if (v === 2)
      for (let y = 24; y < 30; y++)
        for (let x = 3; x < 9; x++)
          if ((x - 6) ** 2 / 9 + (y - 27) ** 2 / 9 < 1)
            g.set(x, y, darken((g.get(x, y) >>> 8) & 0xffffff, 0.1));
  },
};

// ════════════════ 모음 (art.ts가 끼워 넣는다) ════════════════
type ViewDraw = (g: Grid, W: number, H: number, view: View, v: string) => void;
const front =
  (fn: ViewDraw): CxDraw =>
  (g, W, H, v) =>
    fn(g, W, H, 0, v);
const spinOf = (fn: ViewDraw) => ({
  side: ((g, W, H, v) => fn(g, W, H, 1, v)) as CxDraw,
  back: ((g, W, H, v) => fn(g, W, H, 2, v)) as CxDraw,
});

const FURN: Record<string, { fn: ViewDraw; up: number }> = {
  cx_rr_cushion: { fn: (g, W, H, view) => cushion(g, W, H, view), up: 3 },
  cx_rr_lamp: { fn: lamp, up: LAMP_UP },
  cx_rr_dadumi: { fn: dadumi, up: DADUMI_UP },
  cx_rr_gotgam: { fn: gotgam, up: GOT_UP },
  cx_rr_fan: { fn: fan, up: FAN_UP },
  cx_rr_ssal: { fn: ssal, up: SSAL_UP },
  cx_rr_tv: { fn: tv, up: TV_UP },
  cx_rr_bedding: {
    fn: (g, W, H, view, v) => bedding(g, W, H, view, v),
    up: BED_UP,
  },
};

export const RURAL_ART: CxArt = {
  draw: Object.fromEntries(
    Object.entries(FURN).map(([id, f]) => [id, front(f.fn)]),
  ),
  spin: Object.fromEntries(
    Object.entries(FURN).map(([id, f]) => [id, spinOf(f.fn)]),
  ),
  up: Object.fromEntries(Object.entries(FURN).map(([id, f]) => [id, f.up])),
  floors: FLOORS,
  papers: PAPERS,
  // 옆벽·칸막이 윗면: 창호·황토는 짙은 나무색, 신문지는 바랜 먹빛 갈색
  wallCap: {
    cx_rr_wall_changho: 0x5a3a22,
    cx_rr_wall_hwangto: 0x5a3a22,
    cx_rr_wall_news: 0x5a4a38,
  },
  edge: { color: EDGE, a: EDGE_A },
};

/**
 * 창문 덧칠 (벽지 id → 창문 그림을 받아 고친다). 창호 한지 벽은 벽 전체가 나무 살이라 기본 한지 창살 창 테가 묻히므로
 * 창의 나무(틀·살·문턱)를 한 단계 짙게 칠한다. 한지·하늘은 그대로.
 */
export const windowOver: Record<string, (g: Grid) => void> = {
  cx_rr_wall_changho: (g) => {
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const v = g.get(x, y);
        if (!(v & 255)) continue;
        const c = (v >>> 8) & 0xffffff;
        const r = (c >> 16) & 255;
        const gg = (c >> 8) & 255;
        const b = c & 255;
        const lum = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
        // 나무 (붉은 갈색·밝기 중간 아래) · 놋쇠 문고리는 빼고
        if (r - b > 40 && lum < 0.62 && !(r > 180 && gg > 140))
          g.set(x, y, darken(c, 0.42), v & 255);
      }
  },
};

// ── 손에 드는 물건 (./types.ts 「손에 들기」: 그림 한가운데가 손 자리) ──
export const heldArt: CxHeldArtMap = {
  // 곶감 한 알 (한 입 베어 문 자리)
  gotgam: () => {
    const g = new Grid(9, 8);
    g.vline(4, 0, 1, STRAW);
    persimmon(g, 2, 2, true);
    g.set(6, 3, 0, 0);
    g.set(6, 4, GAM.lo);
    g.hline(2, 6, 6, darken(GAM.lo, 0.1));
    g.set(2, 6, 0, 0);
    g.set(6, 6, 0, 0);
    g.outline(EDGE, false, EDGE_A);
    return g;
  },
};

// ── 누운 사람 덮개 (./types.ts 「덮개」) ──
// 목화솜 이불 요 두 자리마다 (키 cx_rr_bedding_0·_1): 누운 자세 프레임의 점을 자리 앵커·기울기로 가구 그림 좌표에 옮겨,
// 그 자리가 이불이면 이불 그림 색을 그대로 가져온다 (몸 모양만큼 살짝 밝게 + 테두리 그늘 = 이불 밑 몸). 이불 밖(베개·요)은 비워 머리가 보인다.
const BED_ROW = RURAL_CX.find((r) => r.id === "cx_rr_bedding")!;
/** 덮개 첫 줄이 놓이는 프레임 줄 (보통 몸의 어깨선 — indoorPose neck) */
const COVER_NECK = 19;
let bodyMask: Grid | null = null;
function coverBody(): Grid {
  // 두건 몸 누운 프레임의 실루엣 (다른 몸도 어깨 아래는 비슷하다)
  bodyMask ??= avatarFrameGrid("hood", "down", AV_ANIM.hammock.col);
  return bodyMask;
}
function beddingCover(k: number, d: number): Grid {
  const view = (d === 3 ? 1 : d) as View;
  const fw = (d % 2 ? 2 : 3) * 16;
  const fh = (d % 2 ? 3 : 2) * 16;
  const W = fw;
  const H = fh + BED_UP;
  const art0 = new Grid(W, H);
  const mask0 = new Grid(W, H);
  bedding(art0, W, H, view, "", mask0);
  const art = d === 3 ? art0.mirrored() : art0;
  const mask = d === 3 ? mask0.mirrored() : mask0;
  const seat = BED_ROW.act!.seats!(d as 0 | 1 | 2 | 3, fw, fh)[k];
  const th = ((seat.tilt ?? 0) * Math.PI) / 180;
  const cos = Math.round(Math.cos(th));
  const sin = Math.round(Math.sin(th));
  const body = coverBody();
  const rows = 28 - COVER_NECK + 1;
  const g = new Grid(20, rows);
  const inBody = (x: number, y: number) => body.filled(x, COVER_NECK + y);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < 20; x++) {
      if (!inBody(x, y)) continue;
      const dx = x + 0.5 - 10;
      const dy = COVER_NECK + y + 0.5 - 27;
      const ax = Math.floor(seat.x + dx * cos - dy * sin);
      const ay = Math.floor(seat.y + dx * sin + dy * cos + BED_UP);
      if (!mask.filled(ax, ay)) continue;
      const c = (art.get(ax, ay) >>> 8) & 0xffffff;
      const rim =
        !inBody(x - 1, y) ||
        !inBody(x + 1, y) ||
        !inBody(x, y + 1) ||
        (y > 0 && !inBody(x, y - 1));
      g.set(x, y, rim ? darken(c, 0.16) : lighten(c, 0.1));
    }
  return g;
}
export const coverArt: CxCoverArtMap = {
  cx_rr_bedding_0: (d) => beddingCover(0, d),
  cx_rr_bedding_1: (d) => beddingCover(1, d),
};
