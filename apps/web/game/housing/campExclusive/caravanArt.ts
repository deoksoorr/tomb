import { darken, Grid, hash2, lighten, mix, type Color } from "../../sprites/pixel";
import { CARAVAN_CX } from "@/lib/housing/campExclusive/caravan";
import { has, type CxArt, type CxCoverArtMap, type CxDraw, type CxHeldArtMap, type CxTile } from "./types";

// 11/27 카라반 전용 가구 8 · 바닥 3 · 벽지 3 그림 — 운영자가 고른 시안(scratchpad/furnmock/caravan/src/items.mts·skins.mts)을 그대로 옮겼다.
// 크기·테·변형 규칙은 ./types.ts 머리말. 앉고 눕는 자리·켜기·서서 쓰기는 lib/housing/campExclusive/caravan.ts.
//  - 변형: 켜기·끄기 가구(라디오·랜턴·캐노피)는 "on" (라디오는 켜진 동안 "f1"로 음표가 오르내린다), 아이스박스 E는 "open", 머그 선반 E는 "pour",
//    릴렉스 체어에 누가 누우면 "lie" (담요가 다리 받침까지)
//  - 전구 줄 캐노피의 가는 줄·전구는 테를 두른 다음에 얹는다 (withAfterEdge — 테에 묻혀 굵어지지 않게)
//  - 누운 사람 덮개(coverArt): 릴렉스 체어 겨자색 니트 담요, 벙커 위층 초록 침낭 · 아래층 남색 줄무늬 이불 — 가구 그림 좌표 그대로 이어진다

// ── 팔레트 (카라반 벽 자작나무·바닥 갈색 널과 겹치지 않게: 숲 초록·코발트·청록·남색·빨강·먹쇠·호두) ──
const IRON = { hi: 0x7a828e, mid: 0x4e545e, lo: 0x33373e } as const;
const GREEN = { hi: 0x74b282, mid: 0x46845c, lo: 0x305e44, dk: 0x22442f } as const;
const BLUE = { hi: 0x8cc2f0, mid: 0x4a8ad2, lo: 0x2f62a4, dk: 0x234a7c } as const;
const NAVY = { hi: 0x6a86ba, mid: 0x435c92, lo: 0x2e406a, dk: 0x223050 } as const;
const TEAL = { hi: 0x96dccb, mid: 0x52b0a0, lo: 0x348476, dk: 0x24605a } as const;
const MUSTARD = { hi: 0xf6d070, mid: 0xdea640, lo: 0xae7a2c } as const;
const RED = { hi: 0xf07a62, mid: 0xcc4a3c, lo: 0x922f2a, dk: 0x6a2020 } as const;
const WALNUT = { hi: 0x9a6a42, mid: 0x7a5032, lo: 0x5a3822, line: 0x3a2214 } as const;
const CREAM = 0xf6f0e2;
const CREAM_D = 0xd8cfba;
const STEEL = { hi: 0xe8ecf0, mid: 0xc4ccd4, lo: 0x98a2ac, dark: 0x5a6470 } as const;
const GLASS_OFF = 0xc8d6dc;
const BULB_ON = 0xffe27a;
const BULB_HOT = 0xfffbe0;
/** 가구 테 (campFurnitureArt CAMP_EDGE와 같은 따뜻한 짙은 갈색) */
const EDGE: Color = 0x2e1e14;
const EDGE_A = 175;

const box = (g: Grid, x: number, y: number, w: number, h: number, c: Color, edge = darken(c, 0.3)) => {
  g.rect(x, y, w, h, c);
  g.hline(x, x + w - 1, y + h - 1, edge);
};
const foot = (g: Grid, x0: number, x1: number, y: number) => {
  for (let x = x0; x <= x1; x++) if (!g.filled(x, y)) g.set(x, y, 0x1a1006, 70);
};
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / Math.max(1, n)), Math.round(y0 + ((y1 - y0) * i) / Math.max(1, n)), c);
}
const md = (n: number, k: number) => ((n % k) + k) % k;
type Rect = { x0: number; x1: number; y0: number; y1: number };

// ════════════════ 1. 접이식 캠핑 의자 (1×1) ════════════════
const chairFront: CxDraw = (g, W, H) => {
  // 등받이 기둥 + 초록 캔버스 (겨자색 줄 하나) — 앉은 사람 어깨 높이
  g.vline(2, 4, 18, IRON.mid);
  g.vline(13, 4, 18, IRON.mid);
  g.rect(3, 5, 10, 7, GREEN.mid);
  g.hline(3, 12, 5, GREEN.hi);
  g.hline(3, 12, 7, MUSTARD.mid);
  g.hline(3, 12, 11, GREEN.lo);
  // 앉는 판 (가운데가 처진 천)
  g.rect(3, 12, 10, 6, GREEN.hi);
  g.hline(4, 11, 14, lighten(GREEN.hi, 0.12));
  g.hline(3, 12, 17, GREEN.lo);
  // 팔걸이 + 오른쪽 컵홀더
  g.rect(1, 12, 3, 2, IRON.hi);
  g.rect(12, 12, 3, 2, IRON.hi);
  g.rect(13, 10, 2, 2, 0x2a2e34);
  g.set(13, 10, IRON.lo);
  // X자 다리
  g.vline(3, 18, H - 2, IRON.mid);
  g.vline(12, 18, H - 2, IRON.mid);
  line(g, 4, 18, 11, H - 3, IRON.lo);
  line(g, 11, 18, 4, H - 3, IRON.lo);
  foot(g, 2, W - 3, H - 1);
};
const chairSide: CxDraw = (g, W, H) => {
  // 왼쪽을 봄: 등받이가 오른쪽에서 살짝 뒤로 젖혀져 서고, 앉는 판이 왼쪽으로
  for (let y = 4; y <= 15; y++) {
    const x = 12 - Math.floor((y - 4) / 6);
    g.set(x - 1, y, GREEN.hi);
    g.set(x, y, GREEN.mid);
    g.set(x + 1, y, GREEN.lo);
  }
  g.hline(11, 13, 6, MUSTARD.mid);
  g.vline(13, 4, 16, IRON.mid);
  g.rect(2, 12, 9, 4, GREEN.hi);
  g.hline(2, 10, 15, GREEN.lo);
  g.hline(3, 9, 13, lighten(GREEN.hi, 0.12));
  // 팔걸이 (앞에서 뒤로 긴 막대) + 앞 끝 컵홀더
  g.hline(2, 12, 10, IRON.hi);
  g.vline(3, 10, 12, IRON.mid);
  g.rect(1, 8, 2, 2, 0x2a2e34);
  // X자 다리
  g.vline(2, 16, H - 2, IRON.mid);
  g.vline(12, 16, H - 2, IRON.mid);
  line(g, 3, 16, 11, H - 3, IRON.lo);
  line(g, 11, 16, 3, H - 3, IRON.lo);
  foot(g, 1, W - 3, H - 1);
};
const chairBack: CxDraw = (g, W, H) => {
  // 뒤: 앉는 판은 뒤로 조금, 등받이 뒷면(짙은 초록 + 주머니)이 앞에 선다 — 앉은 사람 머리·어깨가 위로 보인다
  g.rect(3, 8, 10, 3, GREEN.hi);
  g.vline(2, 8, H - 2, IRON.mid);
  g.vline(13, 8, H - 2, IRON.mid);
  g.rect(3, 11, 10, 8, GREEN.lo);
  g.hline(3, 12, 11, GREEN.mid);
  g.hline(3, 12, 18, GREEN.dk);
  // 뒷주머니 + 겨자색 고리
  g.rect(5, 13, 6, 4, GREEN.dk);
  g.hline(5, 10, 13, GREEN.mid);
  g.set(7, 12, MUSTARD.mid);
  g.set(8, 12, MUSTARD.mid);
  g.rect(1, 12, 2, 2, IRON.hi);
  g.rect(13, 12, 2, 2, IRON.hi);
  line(g, 4, 19, 11, H - 3, IRON.lo);
  line(g, 11, 19, 4, H - 3, IRON.lo);
  foot(g, 2, W - 3, H - 1);
};

// ════════════════ 2. 아이스박스 (1×1, 코발트 몸통 + 흰 뚜껑) ════════════════
function coolerInside(g: Grid, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y, md(x * 3 + y * 5, 7) < 2 ? 0xbfe2f2 : 0xe6f6fc);
}
const coolerFront: CxDraw = (g, W, H, v) => {
  const open = has(v, "open");
  // 몸통
  g.rect(1, 11, 14, H - 12, BLUE.mid);
  g.hline(1, 14, 11, BLUE.hi);
  g.vline(14, 12, H - 2, BLUE.lo);
  g.hline(1, 14, H - 2, BLUE.dk);
  // 흰 상표 띠 (빨간 줄)
  g.rect(4, 14, 8, 4, CREAM);
  g.hline(5, 10, 15, RED.mid);
  g.hline(5, 8, 16, 0x9aa4ae);
  // 옆 손잡이
  g.rect(0, 13, 1, 3, STEEL.lo);
  g.rect(15, 13, 1, 3, STEEL.lo);
  if (!open) {
    g.rect(1, 6, 14, 5, CREAM);
    g.hline(1, 14, 6, 0xffffff);
    g.hline(1, 14, 10, CREAM_D);
    g.hline(5, 10, 4, 0xe6e0d0);
    g.set(5, 5, CREAM_D);
    g.set(10, 5, CREAM_D);
    g.rect(7, 10, 2, 2, STEEL.dark);
  } else {
    // 뚜껑이 뒤로 젖혀져 섰다 (안쪽 면이 보인다)
    g.rect(1, 1, 14, 7, CREAM);
    g.rect(2, 2, 12, 5, 0xdde6ea);
    g.hline(2, 13, 6, 0xc8d4da);
    g.set(3, 8, STEEL.dark);
    g.set(12, 8, STEEL.dark);
    // 안: 얼음 + 캔·병
    g.rect(1, 8, 14, 3, CREAM);
    coolerInside(g, 2, 8, 13, 10);
    g.rect(3, 8, 2, 2, RED.mid);
    g.set(3, 8, RED.hi);
    g.rect(7, 8, 2, 2, MUSTARD.mid);
    g.set(7, 8, MUSTARD.hi);
    g.rect(10, 7, 2, 3, GREEN.mid);
    g.set(10, 6, GREEN.hi);
    g.hline(1, 14, 11, BLUE.hi);
  }
  foot(g, 1, W - 2, H - 1);
};
const coolerSide: CxDraw = (g, W, H, v) => {
  // 왼쪽을 봄 = 좁은 옆면 (손잡이 고리 + 물 빼는 마개). 뚜껑 경첩이 오른쪽(뒤)
  const open = has(v, "open");
  g.rect(3, 11, 10, H - 12, BLUE.mid);
  g.hline(3, 12, 11, BLUE.hi);
  g.vline(12, 12, H - 2, BLUE.lo);
  g.hline(3, 12, H - 2, BLUE.dk);
  // 손잡이 고리
  g.hline(5, 10, 13, STEEL.mid);
  g.vline(5, 13, 15, STEEL.mid);
  g.vline(10, 13, 15, STEEL.mid);
  g.rect(6, 19, 2, 2, 0x2a2e34);
  if (!open) {
    g.rect(3, 6, 10, 5, CREAM);
    g.hline(3, 12, 6, 0xffffff);
    g.hline(3, 12, 10, CREAM_D);
    g.vline(6, 4, 6, 0xe6e0d0);
  } else {
    // 뚜껑이 오른쪽(뒤)에 세워졌다 (옆에서 보니 얇은 판)
    g.rect(12, 1, 3, 10, CREAM);
    g.vline(12, 1, 10, 0xdde6ea);
    g.rect(3, 6, 9, 5, CREAM);
    coolerInside(g, 4, 6, 11, 9);
    g.rect(5, 6, 2, 2, RED.mid);
    g.rect(9, 7, 2, 2, MUSTARD.mid);
    g.rect(7, 5, 2, 3, GREEN.mid);
  }
  foot(g, 2, W - 3, H - 1);
};
const coolerBack: CxDraw = (g, W, H, v) => {
  const open = has(v, "open");
  g.rect(1, 11, 14, H - 12, BLUE.lo);
  g.hline(1, 14, 11, BLUE.mid);
  for (const x of [4, 8, 11]) g.vline(x, 13, H - 4, BLUE.dk);
  g.hline(1, 14, H - 2, BLUE.dk);
  g.rect(0, 13, 1, 3, STEEL.lo);
  g.rect(15, 13, 1, 3, STEEL.lo);
  if (!open) {
    g.rect(1, 6, 14, 5, CREAM);
    g.hline(1, 14, 6, 0xffffff);
    g.hline(1, 14, 10, CREAM_D);
    g.hline(5, 10, 4, 0xe6e0d0);
    g.set(3, 10, STEEL.dark);
    g.set(12, 10, STEEL.dark);
  } else {
    // 경첩이 앞(보는 쪽)이라 젖힌 뚜껑 바깥면이 안을 가린다
    g.rect(1, 1, 14, 10, CREAM);
    g.hline(1, 14, 1, 0xffffff);
    g.hline(5, 10, 4, CREAM_D);
    g.set(5, 3, CREAM_D);
    g.set(10, 3, CREAM_D);
    g.hline(1, 14, 10, CREAM_D);
  }
  foot(g, 1, W - 2, H - 1);
};

// ════════════════ 3. 레트로 라디오 (1×1, 나무 상자 위 청록 라디오) ════════════════
function notes(g: Grid, x: number, f: number): void {
  // 작은 음표 둘 (켠 모습) — 켜진 동안 장면 f1마다 번갈아 오르내린다 (라디오 몸통 위 1~5줄 안)
  const c = 0xfff4d0;
  const n = (nx: number, ny: number) => {
    g.vline(nx + 1, ny, ny + 2, c);
    g.set(nx, ny + 3, c);
    g.set(nx + 1, ny + 3, c);
    g.set(nx + 2, ny, c);
  };
  n(x, 2 - f);
  n(x + 5, 1 + f);
}
function crate(g: Grid, x0: number, x1: number, y0: number, y1: number, side: boolean): void {
  box(g, x0, y0, x1 - x0 + 1, y1 - y0 + 1, WALNUT.mid, WALNUT.line);
  g.hline(x0, x1, y0, WALNUT.hi);
  g.hline(x0 + 1, x1 - 1, Math.round((y0 + y1) / 2), WALNUT.lo);
  if (!side) {
    // 상자 옆 글자판 (겨자색 도장)
    g.rect(x0 + 3, y0 + 3, 4, 2, MUSTARD.lo);
    g.set(x1 - 3, y0 + 3, MUSTARD.lo);
  } else g.rect(x0 + 2, y0 + 2, 3, 1, WALNUT.line);
}
/** 라디오 몸통을 아래로 RO px 내려 그리는 그리드 (위 빈 줄에 음표) */
const RO = 4;
function shifted(g: Grid, dy: number): Grid {
  const p = Object.create(g) as Grid;
  p.set = (x: number, y: number, c: Color, a = 255) => g.set(x, y + dy, c, a);
  p.get = (x: number, y: number) => g.get(x, y + dy);
  p.filled = (x: number, y: number) => g.filled(x, y + dy);
  return p;
}
const radioFront: CxDraw = (g0, W, H, v) => {
  const on = has(v, "on");
  const g = shifted(g0, RO);
  crate(g, 1, 14, 14, H - RO - 2, false);
  // 손잡이 + 짧은 안테나
  g.hline(5, 10, 2, IRON.mid);
  g.set(4, 3, IRON.mid);
  g.set(11, 3, IRON.mid);
  line(g, 12, 4, 14, 1, STEEL.lo);
  // 몸통 (모서리 둥글게)
  g.rect(2, 4, 12, 10, TEAL.mid);
  g.hline(3, 12, 4, TEAL.hi);
  g.set(2, 4, 0, 0);
  g.set(13, 4, 0, 0);
  g.hline(2, 13, 13, TEAL.dk);
  // 스피커 그물 (크림 + 가로줄)
  g.rect(3, 6, 6, 6, CREAM);
  for (const y of [7, 9, 11]) g.hline(3, 8, y, CREAM_D);
  // 다이얼 창 + 바늘 + 손잡이 둘
  g.rect(10, 6, 3, 3, on ? BULB_ON : 0xe8dcc0);
  g.vline(11, 6, 8, on ? RED.mid : RED.lo);
  if (on) g.set(10, 6, BULB_HOT);
  g.set(10, 11, MUSTARD.mid);
  g.set(12, 11, MUSTARD.mid);
  if (on) notes(g0, 1, has(v, "f1") ? 1 : 0);
  foot(g, 1, W - 2, H - RO - 1);
};
const radioSide: CxDraw = (g0, W, H, v) => {
  // 왼쪽을 봄: 앞판(그물)이 왼쪽 가장자리에 한 줄, 몸통 옆면은 청록 판
  const on = has(v, "on");
  const g = shifted(g0, RO);
  crate(g, 3, 12, 14, H - RO - 2, true);
  g.vline(7, 2, 3, IRON.mid);
  g.vline(8, 2, 3, IRON.mid);
  line(g, 9, 4, 12, 1, STEEL.lo);
  g.rect(4, 4, 8, 10, TEAL.mid);
  g.hline(5, 11, 4, TEAL.hi);
  g.vline(11, 5, 12, TEAL.lo);
  g.hline(4, 11, 13, TEAL.dk);
  // 앞판 가장자리 (그물 + 다이얼 빛)
  g.vline(4, 6, 11, CREAM);
  g.set(4, 7, on ? BULB_ON : CREAM_D);
  // 옆 손잡이 (돌리는 단추)
  g.rect(7, 8, 2, 2, MUSTARD.mid);
  g.set(7, 8, MUSTARD.hi);
  if (on) notes(g0, 1, has(v, "f1") ? 0 : 1);
  foot(g, 2, W - 3, H - RO - 1);
};
const radioBack: CxDraw = (g0, W, H, v) => {
  const on = has(v, "on");
  const g = shifted(g0, RO);
  crate(g, 1, 14, 14, H - RO - 2, false);
  g.hline(5, 10, 2, IRON.mid);
  g.set(4, 3, IRON.mid);
  g.set(11, 3, IRON.mid);
  line(g, 3, 4, 1, 1, STEEL.lo);
  g.rect(2, 4, 12, 10, TEAL.lo);
  g.hline(3, 12, 4, TEAL.mid);
  g.set(2, 4, 0, 0);
  g.set(13, 4, 0, 0);
  // 뒤판: 바람구멍 + 상표 딱지 + 전깃줄
  for (const y of [6, 8, 10]) g.hline(4, 11, y, TEAL.dk);
  g.rect(9, 11, 3, 2, CREAM_D);
  g.set(3, 13, 0x2a2e34);
  g.set(2, 14, 0x2a2e34);
  if (on) notes(g0, 6, has(v, "f1") ? 1 : 0);
  foot(g, 1, W - 2, H - RO - 1);
};

// ════════════════ 4. 랜턴 스탠드 (1×2 — 갈고리 막대에 매단 빨간 허리케인 랜턴) ════════════════
/** 랜턴 (7×12, x·y = 왼쪽 위) */
function lantern(g: Grid, x: number, y: number, on: boolean): void {
  // 고리 손잡이
  g.hline(x + 2, x + 4, y, IRON.mid);
  g.set(x + 1, y + 1, IRON.mid);
  g.set(x + 5, y + 1, IRON.mid);
  // 뚜껑 (빨강)
  g.rect(x + 1, y + 2, 5, 2, RED.mid);
  g.hline(x + 2, x + 4, y + 2, RED.hi);
  // 유리 갓
  g.rect(x, y + 4, 7, 5, on ? BULB_ON : GLASS_OFF);
  g.vline(x, y + 4, y + 8, RED.lo);
  g.vline(x + 6, y + 4, y + 8, RED.lo);
  if (on) {
    g.rect(x + 2, y + 5, 3, 3, BULB_HOT);
    g.set(x + 3, y + 5, 0xffffff);
  } else {
    g.vline(x + 3, y + 6, y + 7, 0x8a7a6a);
    g.set(x + 2, y + 5, 0xeef4f6);
  }
  // 아래 기름통
  g.rect(x, y + 9, 7, 3, RED.mid);
  g.hline(x, x + 6, y + 9, RED.hi);
  g.hline(x, x + 6, y + 11, RED.dk);
}
const lanternFront: CxDraw = (g, _W, H, v) => {
  // 뒤 칸에 받침·기둥, 갈고리가 앞(보는 쪽)으로 나와 랜턴이 기둥 앞에 매달린다 (살짝 오른쪽으로 돌린 각도)
  const on = has(v, "on");
  const by = H - 22; // 뒤 칸 가운데쯤
  g.ellipse(7.5, by, 5, 2, IRON.lo);
  g.hline(4, 11, by - 1, IRON.mid);
  g.rect(6, 2, 2, by - 2, IRON.mid);
  g.vline(6, 2, by - 2, IRON.hi);
  // 갈고리 (기둥 꼭대기에서 오른쪽 앞으로 휘어 내려온다)
  g.hline(7, 10, 2, IRON.mid);
  g.vline(11, 3, 17, IRON.mid);
  g.vline(12, 4, 16, IRON.lo);
  g.set(10, 2, IRON.hi);
  lantern(g, 8, 18, on);
  foot(g, 3, 12, by + 2);
};
const lanternSide: CxDraw = (g, _W, H, v) => {
  // 왼쪽을 봄: 받침·기둥은 오른쪽 칸, 갈고리 팔이 왼쪽으로 뻗어 왼쪽 칸 위에 랜턴
  const on = has(v, "on");
  const by = H - 7;
  g.ellipse(23.5, by, 5, 2, IRON.lo);
  g.hline(20, 27, by - 1, IRON.mid);
  g.rect(23, 2, 2, by - 2, IRON.mid);
  g.vline(23, 2, by - 2, IRON.hi);
  // 팔 (위에서 왼쪽으로, 끝이 아래로 말림)
  g.hline(8, 23, 2, IRON.mid);
  g.hline(9, 22, 1, IRON.hi);
  g.vline(8, 2, 5, IRON.mid);
  g.set(9, 6, IRON.mid);
  // 버팀 사선
  line(g, 17, 3, 22, 8, IRON.lo);
  lantern(g, 5, 7, on);
  foot(g, 19, 28, by + 2);
};
const lanternBack: CxDraw = (g, _W, H, v) => {
  // 뒤: 받침은 앞 칸, 갈고리가 뒤(위쪽)로 — 랜턴이 기둥 꼭대기 너머에 보인다
  const on = has(v, "on");
  const by = H - 6;
  lantern(g, 4, 6, on);
  g.hline(5, 9, 2, IRON.mid);
  g.vline(4, 3, 5, IRON.mid);
  g.vline(9, 3, 20, IRON.mid);
  g.ellipse(8.5, by, 5, 2, IRON.lo);
  g.hline(5, 12, by - 1, IRON.mid);
  g.rect(8, 20, 2, by - 21, IRON.mid);
  g.vline(9, 20, by - 2, IRON.hi);
  foot(g, 4, 13, by + 2);
};

// ════════════════ 5. 캠핑 머그 선반 (2×1) ════════════════
/** 법랑 머그 (4×4) */
function mug(g: Grid, x: number, y: number, c: Color, rim: Color, handleRight = true): void {
  g.rect(x, y, 3, 4, c);
  g.hline(x, x + 2, y, rim);
  g.set(handleRight ? x + 3 : x - 1, y + 1, c);
  g.set(handleRight ? x + 3 : x - 1, y + 2, darken(c, 0.15));
  g.hline(x, x + 2, y + 3, darken(c, 0.2));
}
/** 남색 법랑 퍼컬레이터 (점박이) */
function percolator(g: Grid, x: number, y: number, tilt: boolean): void {
  if (!tilt) {
    g.rect(x + 1, y + 2, 5, 7, NAVY.mid);
    g.hline(x + 1, x + 5, y + 2, NAVY.hi);
    g.hline(x + 2, x + 4, y + 1, NAVY.lo);
    g.set(x + 3, y, 0xb8e0f0);
    g.set(x + 6, y + 4, NAVY.mid);
    g.set(x, y + 3, NAVY.lo);
    g.set(x - 1, y + 3, NAVY.lo);
    g.vline(x + 7, y + 3, y + 6, IRON.lo);
    g.hline(x + 6, x + 7, y + 3, IRON.lo);
    for (const [dx, dy] of [
      [2, 4],
      [4, 6],
      [3, 8],
      [5, 3],
    ])
      g.set(x + dx, y + dy, 0xe8eef6);
    g.hline(x + 1, x + 5, y + 8, NAVY.dk);
  } else {
    // 따르는 중: 들어 오른쪽으로 40° 기울였다 (돌린 타원 몸통 + 아래로 향한 주둥이 + 왼쪽 위 손잡이)
    const cx = x + 4;
    const cy = y + 5;
    const an = 0.7;
    const ca = Math.cos(an);
    const sa = Math.sin(an);
    for (let dy = -7; dy <= 7; dy++)
      for (let dx = -7; dx <= 7; dx++) {
        const u = dx * ca - dy * sa;
        const w = dx * sa + dy * ca;
        if ((u / 3) ** 2 + (w / 4.4) ** 2 > 1) continue;
        const c = u < -1.6 ? NAVY.hi : w > 3 ? NAVY.dk : NAVY.mid;
        g.set(cx + dx, cy + dy, c);
      }
    for (const [dx, dy] of [
      [-1, -1],
      [1, 2],
      [2, -2],
    ])
      g.set(cx + dx, cy + dy, 0xe8eef6);
    // 유리 꼭지 (위가 오른쪽으로 기움)
    g.set(cx + 3, cy - 4, 0xb8e0f0);
    // 주둥이 (오른쪽 아래)
    g.set(cx + 4, cy + 1, NAVY.mid);
    g.set(cx + 5, cy + 2, NAVY.mid);
    g.set(cx + 6, cy + 3, NAVY.lo);
    // 손잡이 (왼쪽)
    g.vline(cx - 5, cy - 2, cy + 1, IRON.lo);
    g.set(cx - 4, cy - 3, IRON.lo);
  }
}
function steam(g: Grid, x: number, y: number): void {
  for (const [dx, dy] of [
    [0, 0],
    [1, -1],
    [0, -2],
    [1, -3],
    [2, -1],
    [2, -4],
  ])
    g.set(x + dx, y + dy, 0xffffff, 170);
}
const shelfFront: CxDraw = (g, W, H, v) => {
  const pour = has(v, "pour");
  // 뒤판: 숲 초록 타공판
  g.rect(3, 2, W - 6, H - 6, GREEN.lo);
  for (let y = 4; y < H - 4; y += 3) for (let x = 4 + (y % 2); x < W - 4; x += 3) g.set(x, y, GREEN.dk);
  // 쇠 기둥 둘
  g.rect(1, 1, 2, H - 2, IRON.mid);
  g.vline(1, 1, H - 2, IRON.hi);
  g.rect(W - 3, 1, 2, H - 2, IRON.mid);
  g.vline(W - 3, 1, H - 2, IRON.hi);
  // 윗선반 + 아랫선반 (호두 판)
  g.rect(1, 13, W - 2, 2, WALNUT.hi);
  g.hline(1, W - 2, 14, WALNUT.mid);
  g.rect(1, 24, W - 2, 2, WALNUT.hi);
  g.hline(1, W - 2, 25, WALNUT.mid);
  // 윗선반 위: 퍼컬레이터 + 머그 둘 (따를 때는 퍼컬레이터를 들어 앞 머그에 따른다)
  if (!pour) {
    percolator(g, 4, 4, false);
    mug(g, 17, 9, CREAM, NAVY.mid);
    mug(g, 23, 9, RED.mid, RED.hi);
  } else {
    mug(g, 23, 9, RED.mid, RED.hi);
    mug(g, 15, 9, CREAM, NAVY.mid);
    g.hline(15, 17, 9, 0x6a3a1e);
    percolator(g, 6, 0, true);
    // 커피 줄기 (주둥이 → 머그)
    g.vline(16, 9 - 1, 8, 0x5a2e14);
    g.set(16, 7, 0x7a4424);
    steam(g, 18, 7);
  }
  // 고리에 걸린 머그 셋 (윗선반 아래)
  for (const [x, c] of [
    [6, GREEN.mid],
    [13, MUSTARD.mid],
    [20, CREAM],
  ] as const) {
    g.set(x + 1, 15, IRON.lo);
    mug(g, x, 16, c, c === CREAM ? NAVY.mid : lighten(c, 0.2));
  }
  // 아랫선반 위: 커피 깡통 + 원두 자루 + 법랑 접시
  g.rect(24, 17, 4, 7, RED.mid);
  g.hline(24, 27, 17, STEEL.mid);
  g.rect(24, 19, 4, 2, CREAM);
  g.rect(4, 26, 7, 4, 0xb89a6a);
  g.hline(4, 10, 26, 0xd0b484);
  g.set(6, 27, 0x5a3422);
  g.set(8, 28, 0x5a3422);
  g.rect(14, 27, 6, 3, CREAM);
  g.hline(14, 19, 27, NAVY.mid);
  foot(g, 1, W - 2, H - 1);
};
const shelfSide: CxDraw = (g, W, H, v) => {
  // 왼쪽을 봄: 긴 선반 윗면이 세로로 길고, 앞 끝(아래) 옆판에 아랫칸이 보인다. 뒤판은 오른쪽
  const pour = has(v, "pour");
  g.rect(W - 4, 1, 3, H - 9, GREEN.lo);
  g.vline(W - 3, 2, H - 10, GREEN.mid);
  g.rect(2, 4, W - 6, H - 18, WALNUT.hi);
  g.vline(2, 4, H - 15, WALNUT.mid);
  for (let y = 8; y < H - 15; y += 6) g.hline(3, W - 5, y, darken(WALNUT.hi, 0.08));
  // 위에 놓인 것 (먼 쪽부터): 퍼컬레이터 · 머그 · 머그
  if (!pour) percolator(g, 3, 2, false);
  mug(g, 5, 16, RED.mid, RED.hi, false);
  mug(g, 5, 23, CREAM, NAVY.mid, false);
  if (pour) {
    percolator(g, 3, 11, true);
    g.vline(9, 17, 22, 0x5a2e14);
    steam(g, 9, 21);
  }
  // 걸린 머그 손잡이가 앞(왼쪽)으로 삐죽
  for (const y of [11, 19, 27]) g.set(1, y, IRON.lo);
  // 앞 끝 (쇠 기둥 사이로 아랫칸 + 깡통)
  g.rect(1, H - 15, W - 2, 13, GREEN.lo);
  g.rect(1, H - 15, W - 2, 2, WALNUT.hi);
  g.rect(1, H - 15, 2, 13, IRON.mid);
  g.rect(W - 4, H - 15, 2, 13, IRON.mid);
  g.rect(3, H - 6, W - 7, 2, WALNUT.hi);
  g.rect(5, H - 10, 4, 6, RED.mid);
  g.hline(5, 8, H - 10, STEEL.mid);
  g.hline(1, W - 2, H - 3, WALNUT.line);
  foot(g, 1, W - 2, H - 1);
};
const shelfBack: CxDraw = (g, W, H, v) => {
  // 뒤: 뒤판 널이 앞에 서고, 위로 퍼컬레이터 꼭지·머그 테만 보인다
  const pour = has(v, "pour");
  if (!pour) {
    g.rect(W - 11, 2, 5, 3, NAVY.mid);
    g.set(W - 9, 1, 0xb8e0f0);
  } else {
    g.rect(W - 17, 1, 5, 3, NAVY.mid);
    steam(g, 9, 4);
  }
  g.rect(6, 4, 3, 2, CREAM);
  g.rect(11, 4, 3, 2, RED.mid);
  g.rect(1, 5, W - 2, H - 7, WALNUT.mid);
  g.hline(1, W - 2, 5, WALNUT.hi);
  for (let y = 9; y < H - 3; y += 5) g.hline(3, W - 4, y, WALNUT.lo);
  g.rect(1, 5, 2, H - 7, IRON.mid);
  g.vline(1, 5, H - 3, IRON.hi);
  g.rect(W - 3, 5, 2, H - 7, IRON.mid);
  g.rect(W / 2 - 3, 14, 6, 3, MUSTARD.lo);
  g.hline(1, W - 2, H - 2, WALNUT.line);
  foot(g, 1, W - 2, H - 1);
};

// ════════════════ 6. 릴렉스 체어 (1×2, 남색 패드 무중력 의자) ════════════════
const relaxFront: CxDraw = (g, W, H) => {
  // 머리가 위: 젖힌 등판(위) → 앉는 자리 → 다리 받침(아래). 양옆 쇠 프레임
  g.vline(2, 4, H - 3, IRON.mid);
  g.vline(13, 4, H - 3, IRON.mid);
  g.rect(3, 2, 10, 33, NAVY.mid);
  g.hline(3, 12, 2, NAVY.hi);
  for (let y = 7; y < 17; y += 4) g.hline(3, 12, y, NAVY.lo);
  g.rect(3, 17, 10, 6, NAVY.hi);
  g.hline(3, 12, 22, NAVY.lo);
  for (let y = 26; y < 34; y += 4) g.hline(3, 12, y, NAVY.lo);
  g.hline(3, 12, 34, NAVY.dk);
  // 머리 베개 (크림)
  g.rect(4, 3, 8, 4, CREAM);
  g.hline(4, 11, 6, CREAM_D);
  // 팔걸이 + 컵홀더
  g.rect(1, 15, 2, 4, IRON.hi);
  g.rect(13, 15, 2, 4, IRON.hi);
  g.rect(13, 13, 2, 2, 0x2a2e34);
  // 다리
  g.vline(3, 35, H - 2, IRON.lo);
  g.vline(12, 35, H - 2, IRON.lo);
  foot(g, 2, W - 3, H - 1);
};
/** 옆모습 패드 가운데 줄 (x마다) — 다리 쪽(왼쪽)이 살짝 들리고, 등판(오른쪽)이 높이 젖혀진다 */
const rxC = (x: number) => (x < 11 ? 12 - (11 - x) * 0.25 : x <= 18 ? 12 : 12 - (x - 18) * 0.62);
const relaxSide: CxDraw = (g, W, H) => {
  // 왼쪽을 봄: 머리가 오른쪽
  for (let x = 2; x <= W - 3; x++) {
    const c = Math.round(rxC(x));
    for (let y = c - 5; y <= c + 3; y++) g.set(x, y, y === c - 5 ? NAVY.hi : x % 4 === 0 ? NAVY.lo : NAVY.mid);
    g.set(x, c + 4, NAVY.dk);
    g.set(x, c + 5, IRON.mid);
  }
  // 머리 베개
  g.rect(W - 8, Math.round(rxC(W - 6)) - 4, 5, 7, CREAM);
  g.vline(W - 8, Math.round(rxC(W - 6)) - 4, Math.round(rxC(W - 6)) + 2, CREAM_D);
  // 팔걸이 (앞쪽) + 컵홀더
  g.hline(12, 21, 14, IRON.hi);
  g.rect(10, 13, 2, 2, 0x2a2e34);
  // 다리 (앞뒤 두 쌍, 바닥까지)
  for (const x of [6, 25]) g.vline(x, Math.round(rxC(x)) + 5, H - 2, IRON.lo);
  line(g, 9, 18, 22, H - 2, IRON.lo);
  foot(g, 3, W - 4, H - 1);
};
const relaxBack: CxDraw = (g, W, H) => {
  // 머리가 아래: 다리 받침이 먼 쪽(위), 젖힌 등판 뒷면이 앞(아래)에 선다
  g.vline(2, 3, H - 3, IRON.mid);
  g.vline(13, 3, H - 3, IRON.mid);
  g.rect(3, 2, 10, 22, NAVY.mid);
  g.hline(3, 12, 2, NAVY.hi);
  for (let y = 6; y < 16; y += 4) g.hline(3, 12, y, NAVY.lo);
  g.rect(3, 16, 10, 6, NAVY.hi);
  // 베개 윗머리가 등판 위로
  g.rect(4, 24, 8, 3, CREAM);
  // 등판 뒷면 (짙은 남색 + 쇠 테 + 주머니)
  g.rect(2, 27, 12, 9, NAVY.lo);
  g.hline(2, 13, 27, IRON.hi);
  g.rect(5, 29, 6, 4, NAVY.dk);
  g.set(7, 28, MUSTARD.mid);
  g.rect(1, 14, 2, 4, IRON.hi);
  g.rect(13, 14, 2, 4, IRON.hi);
  g.vline(3, 36, H - 2, IRON.lo);
  g.vline(12, 36, H - 2, IRON.lo);
  foot(g, 2, W - 3, H - 1);
};
/** 기대 누운 사람 덮개: 겨자색 니트 담요 (술 장식 줄) */
const knit = (x: number, y: number): Color => (md(y, 4) === 0 ? MUSTARD.lo : md(x + y, 3) === 0 ? MUSTARD.hi : MUSTARD.mid);
/** 옆으로 놓인 릴렉스 체어 담요 (가로로 누우니 줄도 세로) */
const knitSide = (x: number, y: number): Color => (md(x, 4) === 0 ? MUSTARD.lo : md(x + y, 3) === 0 ? MUSTARD.hi : MUSTARD.mid);

/**
 * 누가 누워 있을 때(변형 "lie") 담요가 다리 받침 끝까지 이어진다 (시안 extend — 누운 그림 프레임 밖이라 가구 그림에서 덮는다).
 * 장면(HouseScene cxVariant)이 누가 누운 동안 "lie"를 붙인다
 */
const relaxBlanket =
  (base: CxDraw, rect: Rect, pat: (x: number, y: number) => Color): CxDraw =>
  (g, W, H, v) => {
    base(g, W, H, v);
    if (!has(v, "lie")) return;
    const navy: readonly number[] = [NAVY.hi, NAVY.mid, NAVY.lo, NAVY.dk];
    for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) if (navy.includes(g.get(x, y) >>> 8) && g.filled(x, y)) g.set(x, y, pat(x, y));
  };

// ════════════════ 7. 전구 줄 캐노피 (3×1) ════════════════
// 지붕 = 빨강·크림 줄무늬 캔버스, 기둥 둘(호두), 전구 줄은 테를 두른 뒤에 얹는다 (가는 줄이 테에 묻혀 굵어지지 않게)
const STRIPE = (i: number): Color => (md(i, 8) < 4 ? RED.mid : CREAM);
const ROPE = 0xc8b898;
function bulb(g: Grid, x: number, y: number, on: boolean): void {
  g.set(x, y, 0x3a3430);
  g.set(x, y + 1, on ? BULB_ON : 0xeae4d6);
  g.set(x, y + 2, on ? BULB_HOT : 0xbcb6a8);
  if (on) {
    g.set(x - 1, y + 1, BULB_ON, 150);
    g.set(x + 1, y + 1, BULB_ON, 150);
    g.set(x, y + 3, BULB_ON, 120);
  }
}
const CF = { roofB: 13, valB: 16 };
const canopyFrontBase: CxDraw = (g, W, H) => {
  // 기둥 둘 (양 끝 앞)
  for (const x of [2, W - 4]) {
    g.rect(x, CF.roofB, 2, H - CF.roofB - 2, WALNUT.mid);
    g.vline(x, CF.roofB, H - 3, WALNUT.hi);
    g.rect(x - 1, H - 3, 4, 2, WALNUT.lo);
    foot(g, x - 1, x + 2, H - 1);
  }
  // 지붕 윗면 (안쪽으로 갈수록 살짝 어둡게) + 물결 끝단
  for (let y = 1; y <= CF.roofB; y++) for (let x = 1; x <= W - 2; x++) g.set(x, y, y === 1 ? lighten(STRIPE(x), 0.15) : darken(STRIPE(x), (CF.roofB - y) * 0.012));
  for (let x = 1; x <= W - 2; x++) {
    const d = [1, 2, 2, 1][md(x - 1, 4)];
    for (let j = 1; j <= d + 1; j++) g.set(x, CF.roofB + j, j === d + 1 ? darken(STRIPE(x), 0.3) : STRIPE(x));
  }
  g.hline(1, W - 2, CF.roofB, darken(RED.mid, 0.25));
  for (let x = 1; x <= W - 2; x++) if (md(x, 8) >= 4) g.set(x, CF.roofB, CREAM_D);
};
/** 앞·뒤 전구 줄 (기둥 사이로 처진 줄 + 전구) — 뒷모습은 줄 끝 매듭이 반대 기둥 */
const canopyFrontAfter =
  (back: boolean): CxDraw =>
  (g, W, _H, v) => {
    const on = has(v, "on");
    for (let x = 4; x <= W - 5; x++) {
      const t = (x - W / 2) / (W / 2 - 4);
      const y = Math.round(CF.valB + 2 + 4 * (1 - t * t));
      g.set(x, y, 0x3a3430);
      if ((x - 4) % 5 === 2) bulb(g, x, y + 1, on);
    }
    const kx = back ? W - 3 : 3;
    g.set(kx, CF.valB + 1, 0x3a3430);
    g.set(kx, CF.valB + 2, 0x3a3430);
  };
const canopySideBase: CxDraw = (g, W, H) => {
  // 왼쪽을 봄 (끝에서 봄): 긴 지붕 윗면이 세로로 길고, 먼 기둥은 지붕에 가려 안 보이고 가까운 기둥만 선다
  const bot = H - 30;
  for (let y = 1; y <= bot; y++) for (let x = 2; x <= W - 3; x++) g.set(x, y, x === 2 ? lighten(STRIPE(y), 0.15) : x === W - 3 ? darken(STRIPE(y), 0.15) : STRIPE(y));
  // 양옆 끝단 (긴 가장자리)
  for (let y = 1; y <= bot; y++) {
    g.set(1, y, md(y, 4) < 2 ? STRIPE(y) : darken(STRIPE(y), 0.25));
    g.set(W - 2, y, darken(STRIPE(y), 0.3));
  }
  // 가까운 끝 단 (물결)
  for (let x = 1; x <= W - 2; x++) {
    const d = md(x - 1, 4) < 2 ? 2 : 1;
    for (let j = 1; j <= d + 1; j++) g.set(x, bot + j, j === d + 1 ? darken(RED.mid, 0.3) : RED.mid);
  }
  // 가까운 기둥
  g.rect(7, bot + 2, 2, H - bot - 4, WALNUT.mid);
  g.vline(7, bot + 2, H - 3, WALNUT.hi);
  g.rect(6, H - 3, 4, 2, WALNUT.lo);
  foot(g, 5, 10, H - 1);
};
const canopySideAfter: CxDraw = (g, W, H, v) => {
  const on = has(v, "on");
  const bot = H - 30;
  // 기둥 줄 끈 (양옆 바닥으로)
  line(g, 7, bot + 4, 2, H - 3, ROPE);
  line(g, 8, bot + 4, 13, H - 3, ROPE);
  // 양옆 긴 가장자리에 늘어진 전구 줄
  for (const x of [1, W - 2]) {
    for (let y = 3; y <= bot - 1; y++) g.set(x, y, 0x3a3430);
    for (let y = 4; y <= bot - 3; y += 6) bulb(g, x, y, on);
  }
};
/**
 * 테를 두른 다음에 얹는 그림 (가는 줄·전구): art.ts furnitureGrid는 draw 바로 뒤에 같은 그리드에 outline을 두른다.
 * 그 그리드의 outline을 이 그리드에서만 바꿔 「얹은 그림을 걷고 테를 두른 뒤 다시 얹는다」. outline을 부르지 않는 곳(미리보기 등)도
 * 얹은 그림은 그대로 보인다
 */
const withAfterEdge =
  (base: CxDraw, after: CxDraw): CxDraw =>
  (g, W, H, v) => {
    base(g, W, H, v);
    const bare = g.px.slice();
    after(g, W, H, v);
    const outline = g.outline.bind(g);
    g.outline = (c, diagonal, a) => {
      g.px.set(bare);
      outline(c, diagonal, a);
      after(g, W, H, v);
    };
  };

// ════════════════ 8. 2층 벙커 침대 (2×3) ════════════════
/** 위칸 침낭 (숲 초록 + 지퍼 줄) — 그림 좌표 그대로 이어지는 무늬 */
const sleepingBag = (x: number, y: number): Color => (md(x, 9) === 4 ? 0xd8d0bc : md(y, 5) === 0 ? GREEN.lo : GREEN.mid);
const sleepingBagSide = (x: number, y: number): Color => (md(y, 9) === 4 ? 0xd8d0bc : md(x, 5) === 0 ? GREEN.lo : GREEN.mid);
/** 아래칸 남색·크림 줄무늬 이불 */
const navyStripe = (_x: number, y: number): Color => (md(y, 6) < 2 ? CREAM : md(y, 6) === 2 ? NAVY.hi : NAVY.mid);
const navyStripeSide = (x: number): Color => (md(x, 6) < 2 ? CREAM : md(x, 6) === 2 ? NAVY.hi : NAVY.mid);
const BUNK_SHEET = 0xf0e8d8;

// 앞모습 자리 (그림 좌표)
const BF = {
  upMat: { x0: 3, x1: 28, y0: 6, y1: 29 },
  upFold: 14,
  loMat: { x0: 3, x1: 28, y0: 39, y1: 68 },
  loFold: 47,
};
const bunkFront: CxDraw = (g, W, H) => {
  const F = WALNUT;
  // 위칸: 머리판 + 매트리스 + 침낭
  box(g, 1, 1, W - 2, 6, F.lo);
  g.hline(3, W - 4, 2, F.hi);
  g.rect(BF.upMat.x0, BF.upMat.y0, BF.upMat.x1 - BF.upMat.x0 + 1, BF.upMat.y1 - BF.upMat.y0 + 1, BUNK_SHEET);
  g.rect(7, 7, W - 14, 5, 0xfbf8f0);
  g.hline(7, W - 8, 11, 0xd8d0c0);
  for (let y = BF.upFold; y <= BF.upMat.y1; y++) for (let x = BF.upMat.x0; x <= BF.upMat.x1; x++) g.set(x, y, sleepingBag(x, y));
  g.hline(BF.upMat.x0, BF.upMat.x1, BF.upFold, lighten(GREEN.hi, 0.1));
  // 위칸 앞(발치) 난간 판 — 사다리 걸이
  box(g, 1, 30, W - 2, 6, F.mid, F.line);
  g.hline(1, W - 2, 30, F.hi);
  // 위칸 밑면 그늘 (아래칸 동굴 윗줄)
  g.rect(3, 36, W - 6, 3, 0x2a1c14);
  // 아래칸
  g.rect(BF.loMat.x0, BF.loMat.y0, BF.loMat.x1 - BF.loMat.x0 + 1, BF.loMat.y1 - BF.loMat.y0 + 1, BUNK_SHEET);
  g.rect(7, 39, W - 14, 5, 0xfbf8f0);
  g.hline(7, W - 8, 43, 0xd8d0c0);
  for (let y = BF.loFold; y <= BF.loMat.y1; y++) for (let x = BF.loMat.x0; x <= BF.loMat.x1; x++) g.set(x, y, navyStripe(x, y));
  g.hline(BF.loMat.x0, BF.loMat.x1, BF.loFold, 0xffffff);
  // 기둥 (네 귀 — 앞에서 보면 양옆 둘)
  g.rect(1, 1, 2, H - 3, F.lo);
  g.vline(1, 1, H - 3, F.mid);
  g.rect(W - 3, 1, 2, H - 3, F.lo);
  g.vline(W - 3, 1, H - 3, F.mid);
  // 아래칸 발판
  box(g, 1, H - 7, W - 2, 5, F.mid, F.line);
  g.hline(1, W - 2, H - 7, F.hi);
  // 발치 사다리 (오른쪽, 위칸 난간에 걸침)
  for (const x of [W - 9, W - 5]) g.vline(x, 26, H - 3, F.hi);
  for (let y = 40; y < H - 6; y += 6) g.hline(W - 9, W - 5, y, F.hi);
  g.hline(W - 10, W - 4, 26, F.mid);
  foot(g, 1, W - 2, H - 1);
};
const BS = {
  upMat: { x0: 3, x1: 42, y0: 4, y1: 19 },
  upFold: 30,
  loMat: { x0: 3, x1: 42, y0: 29, y1: 51 },
  loFold: 30,
};
const bunkSide: CxDraw = (g, W, H) => {
  // 왼쪽을 봄: 머리가 오른쪽. 긴 옆면이 보이고, 위칸은 높이, 아래칸은 그 아래로 열려 있다. 발치(왼쪽) 끝판에 사다리
  const F = WALNUT;
  // 위칸
  g.rect(BS.upMat.x0, BS.upMat.y0, BS.upMat.x1 - BS.upMat.x0 + 1, BS.upMat.y1 - BS.upMat.y0 + 1, BUNK_SHEET);
  for (let y = BS.upMat.y0; y <= BS.upMat.y1; y++) for (let x = BS.upMat.x0; x < BS.upFold; x++) g.set(x, y, sleepingBagSide(x, y));
  g.vline(BS.upFold, BS.upMat.y0, BS.upMat.y1, lighten(GREEN.hi, 0.1));
  g.rect(W - 13, 6, 7, 12, 0xfbf8f0);
  g.vline(W - 13, 6, 17, 0xd8d0c0);
  g.hline(BS.upMat.x0, BS.upMat.x1, BS.upMat.y0, lighten(BUNK_SHEET, 0.3));
  // 위칸 옆판 (앞 긴 면) + 위칸 밑 그늘
  box(g, 1, 20, W - 2, 6, F.mid, F.line);
  g.hline(1, W - 2, 20, F.hi);
  g.rect(3, 26, W - 6, 3, 0x2a1c14);
  // 아래칸
  g.rect(BS.loMat.x0, BS.loMat.y0, BS.loMat.x1 - BS.loMat.x0 + 1, BS.loMat.y1 - BS.loMat.y0 + 1, BUNK_SHEET);
  for (let y = BS.loMat.y0; y <= BS.loMat.y1; y++) for (let x = BS.loMat.x0; x < BS.loFold; x++) g.set(x, y, navyStripeSide(x));
  g.vline(BS.loFold, BS.loMat.y0, BS.loMat.y1, 0xffffff);
  g.rect(W - 13, 32, 7, 16, 0xfbf8f0);
  g.vline(W - 13, 32, 47, 0xd8d0c0);
  // 아래칸 옆판
  box(g, 1, H - 8, W - 2, 6, F.mid, F.line);
  g.hline(1, W - 2, H - 8, F.hi);
  // 머리 끝판 (오른쪽, 높이) + 발치 끝판 (왼쪽)
  g.rect(W - 5, 1, 4, H - 3, F.lo);
  g.vline(W - 4, 3, H - 4, F.mid);
  g.hline(W - 5, W - 2, 1, F.hi);
  g.rect(1, 1, 3, H - 3, F.lo);
  g.vline(2, 2, H - 4, F.mid);
  // 사다리 (발치 쪽, 바닥 → 위칸)
  for (const x of [5, 9]) g.vline(x, 6, H - 3, F.hi);
  for (let y = 10; y < H - 4; y += 6) g.hline(5, 9, y, F.hi);
  foot(g, 1, W - 2, H - 1);
};
const BB = {
  upMat: { x0: 3, x1: 28, y0: 5, y1: 30 },
  loMat: { x0: 3, x1: 28, y0: 39, y1: 64 },
};
const bunkBack: CxDraw = (g, W, H) => {
  // 머리가 아래: 위칸 발치(위) → 침낭 → 베개 → 위칸 머리판(사람 머리 앞), 아래칸도 같은 차례. 사다리는 먼 쪽이라 고리만
  const F = WALNUT;
  box(g, 1, 1, W - 2, 4, F.lo);
  g.hline(1, W - 2, 1, F.mid);
  g.hline(W - 10, W - 4, 1, F.hi);
  g.rect(BB.upMat.x0, BB.upMat.y0, 26, 26, BUNK_SHEET);
  for (let y = 5; y <= 22; y++) for (let x = 3; x <= 28; x++) g.set(x, y, sleepingBag(x, y));
  g.hline(3, 28, 22, lighten(GREEN.hi, 0.1));
  g.rect(7, 25, W - 14, 5, 0xfbf8f0);
  // 위칸 머리판 (가까운 끝, 사람 머리 앞)
  box(g, 1, 29, W - 2, 8, F.mid, F.line);
  g.rect(3, 31, W - 6, 4, F.hi);
  g.hline(3, W - 4, 31, lighten(F.hi, 0.15));
  g.rect(3, 37, W - 6, 2, 0x2a1c14);
  // 아래칸
  g.rect(3, 39, 26, 26, BUNK_SHEET);
  for (let y = 39; y <= 56; y++) for (let x = 3; x <= 28; x++) g.set(x, y, navyStripe(x, y));
  g.hline(3, 28, 56, 0xffffff);
  g.rect(7, 59, W - 14, 5, 0xfbf8f0);
  // 아래칸 머리판
  box(g, 1, H - 13, W - 2, 11, F.mid, F.line);
  g.rect(3, H - 11, W - 6, 6, F.hi);
  g.hline(3, W - 4, H - 11, lighten(F.hi, 0.15));
  g.rect(1, 1, 2, H - 3, F.lo);
  g.vline(1, 1, H - 3, F.mid);
  g.rect(W - 3, 1, 2, H - 3, F.lo);
  g.vline(W - 3, 1, H - 3, F.mid);
  foot(g, 1, W - 2, H - 1);
};

// ════════════════ 바닥 3 · 벽지 3 (skins.mts) ════════════════
const PAPER_Y0 = 6;
const PAPER_Y1 = 40 - 6;

const FLOORS: Record<string, CxTile> = {
  // 레트로 체크 장판: 70년대 장판 — 테라코타·아이보리 마름모 체크 (민트 타일의 네모 칸과 겹치지 않게 45° 돌린 체크) + 옅은 윤기
  cx_cv_floor_check: (g, v) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const a = md(x + y, 16) < 8;
        const b = md(x - y, 16) < 8;
        const dark = a === b;
        let c: Color = dark ? 0xca8670 : 0xf0dec2;
        if (md(x + y, 8) === 0 || md(x - y, 8) === 0) c = dark ? 0xbe7a64 : 0xe8d4b6;
        g.set(x, y, c);
      }
    if (v === 1) for (let i = 0; i < 2; i++) g.set(11 + i, 12 - i, 0xfaf0dc);
  },
  // 캠핑 러그 마루: 짙은 훈연 호두 널 + 칸마다 가로로 깐 킬림 러그 띠 (빨강·겨자·초록 지그재그)
  cx_cv_floor_rug: (g, v) => {
    const tones = [0x6e4a32, 0x664430, 0x744e36, 0x6a4632];
    for (let row = 0; row < 2; row++) {
      const y = row * 5;
      const c = tones[(row + v) % 4];
      g.rect(0, y, 16, 5, c);
      g.hline(0, 15, y, lighten(c, 0.1));
      g.hline(0, 15, y + 4, 0x3e2818);
      if ((row + v) % 2 === 0) g.vline((row * 7 + v * 5) % 16, y + 1, y + 3, 0x3e2818);
    }
    // 러그 띠 (10~15줄): 끝 술 + 크림 테 + 빨강 바탕에 겨자 지그재그 + 초록 점
    g.hline(0, 15, 10, 0xd8ccb0);
    for (let x = 0; x < 16; x++) {
      for (let y = 11; y <= 14; y++) g.set(x, y, 0x9c5444);
      const zz = 11 + [0, 1, 2, 3, 2, 1][md(x, 6)];
      g.set(x, zz, 0xd4a456);
      if (md(x, 6) === 3) g.set(x, 12, 0x5a7a5a);
    }
    g.hline(0, 15, 15, 0x3e2818);
    for (let x = 1; x < 16; x += 2) g.set(x, 10, 0xc8b898);
  },
  // 민트 체크 타일: 50년대 다이너 — 파스텔 민트·크림 8px 타일 + 옅은 줄눈 + 유약 반짝
  cx_cv_floor_mint: (g, v) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const mint = ((x >> 3) + (y >> 3)) % 2 === 0;
        g.set(x, y, mint ? 0xa6dcc6 : 0xf8f2e2);
      }
    for (let i = 0; i < 16; i++) {
      g.set(i, 0, 0xd6d2c4);
      g.set(0, i, 0xd6d2c4);
      g.set(i, 8, 0xd6d2c4);
      g.set(8, i, 0xd6d2c4);
    }
    // 유약 반짝 (타일 왼쪽 위 귀)
    g.set(2, 2, 0xe6fff4);
    g.set(3, 2, 0xd0f2e4);
    g.set(10, 10, 0xe6fff4);
    if (v % 2) g.set(11, 2, 0xffffff);
  },
};

const PAPERS: Record<string, CxTile> = {
  // 크림색 합판 벽: 기본 자작 판(누런 4px 세로판)과 겹치지 않게 — 더 하얀 크림 16px 합판 + 나사못 + 가운데 은색 몰딩 + 아래 청록 띠(옛 카라반 투톤)
  cx_cv_wall_ply: (g, v) => {
    for (let y = PAPER_Y0; y <= PAPER_Y1; y++) for (let x = 0; x < 16; x++) g.set(x, y, mix(0xf6eedc, 0xece0c8, hash2(x >> 2, y >> 3, v + 3) * 0.6));
    // 합판 결 (옅은 물결)
    for (let x = 0; x < 16; x++) {
      const k = Math.round(12 + Math.sin((x + v * 4) / 2.6) * 1.5);
      g.set(x, k, 0xe2d4b8);
    }
    g.vline(15, PAPER_Y0, PAPER_Y1, 0xc8b898);
    g.vline(0, PAPER_Y0, PAPER_Y1, 0xfffaee);
    g.set(2, PAPER_Y0 + 2, 0xb0a088);
    g.set(13, PAPER_Y0 + 2, 0xb0a088);
    // 은색 몰딩 (리벳)
    g.hline(0, 15, 21, 0xb8c2c8);
    g.hline(0, 15, 22, 0x8a949c);
    g.set(4, 21, 0xf0f4f6);
    g.set(12, 21, 0xf0f4f6);
    // 아래 청록 띠
    for (let y = 23; y <= PAPER_Y1; y++) for (let x = 0; x < 16; x++) g.set(x, y, y === 23 ? 0x7cc0b2 : 0x5ea89a);
    g.vline(15, 23, PAPER_Y1, 0x4a8e82);
    g.set(2, PAPER_Y1 - 2, 0x3e7a70);
    g.set(13, PAPER_Y1 - 2, 0x3e7a70);
  },
  // 빈티지 체리 패널: 붉은 체리목 세로 판 + 가로 띠 몰딩 + 아래 액자 판
  cx_cv_wall_cherry: (g, v) => {
    for (let x = 0; x < 16; x += 8) {
      const c = (x / 8 + v) % 2 ? 0x9a4632 : 0x8e3e2c;
      g.rect(x, PAPER_Y0, 8, PAPER_Y1 - PAPER_Y0 + 1, c);
      g.vline(x, PAPER_Y0, PAPER_Y1, lighten(c, 0.14));
      g.vline(x + 7, PAPER_Y0, PAPER_Y1, 0x5a2218);
      // 결
      for (let y = PAPER_Y0 + 2; y < 19; y += 3) g.set(x + 2 + ((y + v) % 4), y, darken(c, 0.1));
    }
    // 가로 띠 몰딩
    g.rect(0, 19, 16, 3, 0xb05a40);
    g.hline(0, 15, 19, 0xd07a5a);
    g.hline(0, 15, 21, 0x5a2218);
    // 아래 액자 판 (판 하나에 하나)
    for (let y = 22; y <= PAPER_Y1; y++) for (let x = 0; x < 16; x++) g.set(x, y, 0x84382a);
    g.rect(2, 24, 12, 8, 0x96432f);
    g.hline(2, 13, 24, 0x6a2a1e);
    g.vline(2, 24, 31, 0x6a2a1e);
    g.hline(2, 13, 31, 0xb05a40);
    g.vline(13, 24, 31, 0xb05a40);
  },
  // 줄무늬 캔버스 벽: 텐트 천 — 올리브·크림 세로 줄 + 바느질 점선 + 위쪽 끈 고리 + 천 주름 그늘
  cx_cv_wall_canvas: (g, v) => {
    for (let y = PAPER_Y0; y <= PAPER_Y1; y++)
      for (let x = 0; x < 16; x++) {
        const olive = md(x, 8) < 4;
        let c: Color = olive ? 0x7e9058 : 0xeee6cc;
        // 천 주름: 아래로 갈수록 살짝 어둡고 주름 줄이 x 3·11 근처
        if (md(x + v, 8) === 3) c = darken(c, 0.08);
        c = darken(c, (y - PAPER_Y0) / 260);
        g.set(x, y, c);
      }
    // 바느질 점선 (줄 경계)
    for (let y = PAPER_Y0 + 1; y <= PAPER_Y1; y += 2) {
      g.set(4, y, 0xc8c0a0);
      g.set(12, y, 0xc8c0a0);
    }
    // 위 끈 고리 (아일렛)
    g.rect(0, PAPER_Y0, 16, 2, 0x5a6a3e);
    g.set(6, PAPER_Y0 + 2, 0xb0a070);
    g.set(7, PAPER_Y0 + 3, 0x8a7a50);
    g.set(14, PAPER_Y0 + 2, 0xb0a070);
    g.set(15, PAPER_Y0 + 3, 0x8a7a50);
  },
};

// ════════════════ 묶음 ════════════════
const UP: Record<string, number> = {
  cx_cv_camp_chair: 10,
  cx_cv_icebox: 10,
  cx_cv_radio: 12,
  cx_cv_lantern: 24,
  cx_cv_mug_shelf: 16,
  cx_cv_relax_chair: 8,
  cx_cv_canopy: 28,
  cx_cv_bunk: 28,
};
const VIEWS: Record<string, readonly [front: CxDraw, side: CxDraw, back: CxDraw]> = {
  cx_cv_camp_chair: [chairFront, chairSide, chairBack],
  cx_cv_icebox: [coolerFront, coolerSide, coolerBack],
  cx_cv_radio: [radioFront, radioSide, radioBack],
  cx_cv_lantern: [lanternFront, lanternSide, lanternBack],
  cx_cv_mug_shelf: [shelfFront, shelfSide, shelfBack],
  cx_cv_relax_chair: [
    relaxBlanket(relaxFront, { x0: 3, x1: 12, y0: 22, y1: 33 }, knit),
    relaxBlanket(relaxSide, { x0: 3, x1: 12, y0: 0, y1: 17 }, knitSide),
    relaxBlanket(relaxBack, { x0: 3, x1: 12, y0: 3, y1: 8 }, knit),
  ],
  cx_cv_canopy: [withAfterEdge(canopyFrontBase, canopyFrontAfter(false)), withAfterEdge(canopySideBase, canopySideAfter), withAfterEdge(canopyFrontBase, canopyFrontAfter(true))],
  cx_cv_bunk: [bunkFront, bunkSide, bunkBack],
};

export const CARAVAN_ART: CxArt = {
  draw: Object.fromEntries(Object.entries(VIEWS).map(([id, [front]]) => [id, front])),
  spin: Object.fromEntries(Object.entries(VIEWS).map(([id, [, side, back]]) => [id, { side, back }])),
  up: UP,
  floors: FLOORS,
  papers: PAPERS,
  wallCap: { cx_cv_wall_ply: 0x6a7a74, cx_cv_wall_cherry: 0x4a1e16, cx_cv_wall_canvas: 0x3e4a2c },
  edge: { color: EDGE, a: EDGE_A },
};

// ════════════════ 손에 드는 물건 (act.hold.item) ════════════════
// 앞을 본 캐릭터 손에 든 모습, 그림 한가운데가 손 자리. 테는 가구 테와 같은 갈색

/** 아이스박스에서 꺼낸 사이다 캔 (초록 캔 + 흰 띠 + 은색 뚜껑, 물방울 하나) */
function canArt(): Grid {
  const g = new Grid(9, 11);
  g.rect(3, 2, 4, 7, 0x3aa860);
  g.vline(3, 2, 8, 0x6ccc88);
  g.vline(6, 2, 8, 0x26804a);
  g.rect(3, 4, 4, 3, 0xf4f8f4);
  g.hline(4, 5, 5, 0x3aa860);
  g.hline(3, 6, 1, STEEL.mid);
  g.set(4, 1, STEEL.hi);
  g.hline(3, 6, 9, STEEL.lo);
  g.outline(EDGE, false, 200);
  // 차가운 물방울 (테 밖)
  g.set(1, 3, 0xd8f2ff);
  return g;
}
/** 머그 선반에서 탄 커피 (초록 법랑 머그 + 손잡이 + 김) */
function mugArt(): Grid {
  const g = new Grid(10, 12);
  g.rect(2, 5, 5, 5, GREEN.mid);
  g.hline(2, 6, 5, lighten(GREEN.hi, 0.2));
  g.hline(3, 5, 5, 0x5a2e14);
  g.vline(2, 6, 9, GREEN.hi);
  g.hline(2, 6, 9, GREEN.lo);
  g.set(7, 6, GREEN.mid);
  g.set(8, 7, GREEN.lo);
  g.set(7, 8, GREEN.lo);
  g.set(4, 7, 0xe8eef6);
  g.outline(EDGE, false, 200);
  // 김 (테 없이 반투명)
  for (const [x, y] of [
    [4, 3],
    [5, 2],
    [4, 1],
    [6, 3],
  ])
    g.set(x, y, 0xffffff, 170);
  return g;
}
export const heldArt: CxHeldArtMap = { can: canArt, mug: mugArt };

// ════════════════ 누운 사람 덮개 (seats lie + cover) ════════════════
// 가구 그림 좌표로 옮겨 무늬를 그림 그대로 잇는다: 자세 프레임 (fx, fy) → 그 방향 가구 그림 (ax, ay)
// (장면이 누운 그림을 발 원점 기준 tilt만큼 돌린다 — campFurnitureArt frameToArt와 같은 식)
//  - 덮개 윗줄 = 목선 (기본 몸 hood 기준 19줄 — 다른 몸은 1~2px 차이), 윗줄 밝은 깃 · 다음 줄 시트 · 그 아래 무늬
//  - 매트리스·패드 칸(mat) 밖이거나 가구 그림이 비어 있는 칸은 몸을 지운다 (알파 1 — 가구 밖으로 다리가 삐져나오지 않게)
//  - 사람 앞에 오는 가구 부분(front: 사다리·난간 등)은 가구 그림을 그대로 덮는다

/** 자세 프레임 (sprites/avatarCore AV_W·AV_H, 발 원점 = 가운데·맨 아랫줄) */
const POSE_W = 20;
const POSE_H = 28;
const NECK = 19;
/** 덮개 그림 줄 수 (목선이 높은 몸까지 — 프레임 밖은 paintCxCover가 자른다) */
const COVER_H = POSE_H - 14;
const ERASE = Grid.rgba(0, 1);

type CoverSpec = {
  /** 이 방향에서 덮개가 들어가는 칸 (가구 그림 좌표, d3은 뒤집기 전 옆모습 좌표) */
  mat: Rect;
  pat: (x: number, y: number) => Color;
  sheet: Color;
  /** 사람 앞에 오는 가구 부분 (사다리·난간·머리판 — 몸을 지워 가구 그림이 보이게) */
  front?: (x: number, y: number) => boolean;
};
/** 덮개 키 → 방향 d → 덮개 규칙 (d3은 d1 그림을 뒤집으므로 d1 규칙) */
const COVERS: Record<string, (d: number, W: number, H: number) => CoverSpec> = {
  cx_cv_relax_chair: (d, W) =>
    d % 2 === 1
      ? { mat: { x0: 2, x1: W - 9, y0: 0, y1: 99 }, pat: knitSide, sheet: MUSTARD.hi }
      : d === 2
        ? { mat: { x0: 3, x1: 12, y0: 2, y1: 26 }, pat: knit, sheet: MUSTARD.hi }
        : { mat: { x0: 3, x1: 12, y0: 2, y1: 34 }, pat: knit, sheet: MUSTARD.hi },
  cx_cv_bunk_up: (d, W) =>
    d % 2 === 1
      ? { mat: BS.upMat, pat: sleepingBagSide, sheet: BUNK_SHEET, front: (x, y) => x >= W - 5 || y >= 20 }
      : d === 2
        ? { mat: BB.upMat, pat: sleepingBag, sheet: BUNK_SHEET, front: (_x, y) => y >= 29 || y <= 4 }
        : { mat: BF.upMat, pat: sleepingBag, sheet: BUNK_SHEET, front: (_x, y) => y >= 30 },
  cx_cv_bunk_lo: (d, W, H) =>
    d % 2 === 1
      ? { mat: BS.loMat, pat: (x) => navyStripeSide(x), sheet: BUNK_SHEET, front: (x, y) => x >= W - 5 || y >= H - 8 || y <= 28 }
      : d === 2
        ? { mat: BB.loMat, pat: navyStripe, sheet: BUNK_SHEET, front: (_x, y) => y >= H - 13 || y <= 38 }
        : { mat: BF.loMat, pat: navyStripe, sheet: BUNK_SHEET, front: (x, y) => y <= 38 || (x >= W - 10 && x <= W - 4) || y >= H - 7 },
};
/** 덮개 키 → 가구 id · 자리 번호 (lib caravan.ts seats의 몇 번째 자리) */
const COVER_SEAT: Record<string, { id: string; seat: number }> = {
  cx_cv_relax_chair: { id: "cx_cv_relax_chair", seat: 0 },
  cx_cv_bunk_up: { id: "cx_cv_bunk", seat: 0 },
  cx_cv_bunk_lo: { id: "cx_cv_bunk", seat: 1 },
};

/**
 * 덮개 그림 (가로 POSE_W, 맨 윗줄 = 목선). 자리(앵커 x·y)는 lib 종류 파일 seats를 그대로 읽어 그림과 자리가 늘 같이 움직인다
 */
export function cvCoverGrid(key: string, d: number): Grid {
  const { id, seat } = COVER_SEAT[key];
  const dir = (d & 3) as 0 | 1 | 2 | 3;
  const row = CARAVAN_CX.find((r) => r.id === id)!;
  const side = dir % 2 === 1;
  const fw = (side ? row.h : row.w) * 16;
  const fh = (side ? row.w : row.h) * 16;
  const W = fw;
  const H = fh + UP[id];
  // 가구 그림 (d3은 뒤집기 전 옆모습)
  const art = new Grid(W, H);
  VIEWS[id][side ? 1 : dir === 2 ? 2 : 0](art, W, H, "");
  const s = row.act!.seats!(dir, fw, fh)[seat];
  const X = s.x;
  const Y = s.y + UP[id];
  const spec = COVERS[key](dir, W, H);
  const hi = lighten(spec.sheet, 0.3);
  const g = new Grid(POSE_W, COVER_H);
  for (let r = 0; r < COVER_H; r++)
    for (let fx = 0; fx < POSE_W; fx++) {
      const ox = fx - POSE_W / 2;
      const oy = NECK + r - (POSE_H - 1);
      let ax: number;
      let ay: number;
      if (dir === 0) [ax, ay] = [X + ox, Y + oy];
      else if (dir === 1) [ax, ay] = [X - oy - 1, Y + ox];
      else if (dir === 2) [ax, ay] = [X - ox - 1, Y - oy - 1];
      // 오른쪽을 봄: 장면은 뒤집은 옆모습 위에 −90° — 뒤집기 전 옆모습 좌표로 옮긴다
      else [ax, ay] = [W - 1 - (X + oy), Y - ox - 1];
      const m = spec.mat;
      if (spec.front?.(ax, ay) || ax < m.x0 || ax > m.x1 || ay < m.y0 || ay > m.y1 || !art.filled(ax, ay)) {
        g.px[r * POSE_W + fx] = ERASE;
        continue;
      }
      g.set(fx, r, r === 0 ? hi : r === 1 ? spec.sheet : spec.pat(ax, ay));
    }
  return g;
}
const coverCache = new Map<string, Grid>();
/** 덮개 없이 (빈 그림 — 장면이 자리로 미끄러지는 동안 쓴다: HouseScene CX_BARE) */
const BARE = new Grid(POSE_W, 1);
export const coverArt: CxCoverArtMap = Object.fromEntries(
  Object.keys(COVERS).map((key) => [
    key,
    (d: number) => {
      const k = `${key}|${d & 3}`;
      let g = coverCache.get(k);
      if (!g) coverCache.set(k, (g = cvCoverGrid(key, d)));
      return g;
    },
  ]),
);
coverArt.cx_bare = () => BARE;
