import type { MapConcept } from "@/lib/mapConcept";
import { seasonHat, seasonHolly, seasonMitt, seasonScarf } from "./npcSeasonArt";
import { darken, Grid, hash2, lighten, makeCanvas, type Color } from "./pixel";
import { ICE, SNOW } from "./winterArt";

// 11/19 시안: 「가구 보따리상」 — 계절마다 새 가구 묶음을 파는 기간 상점(매주 토요일 새벽 5시 새 묶음)의 노점과 주인 NPC (그림만, 게임 연결 전).
//  코디 보따리상(seasonStall.ts — 남색·크림 둥근 천막 + 보자기 보따리)과 한눈에 갈리게:
//  - 노점은 꿀빛 참나무 「이동 가구점」 손수레: 큰 바퀴 하나·손잡이 채·받침 다리, 너와(나무 비늘) 지붕 + 세이지 초록 처마 판 + 삼각 깃발 줄.
//    지붕 위엔 뒤집은 의자·말아 묶은 러그, 수레 안엔 갓 스탠드·액자·서랍장·안락의자, 옆엔 기대 세운 전신 거울과 화분.
//  - 맵 컨셉마다: 기본 / 겨울 = 지붕 짐에 체크 담요를 덮고 눈·고드름, 수레 안 작은 무쇠 난로 /
//    크리스마스 = 지붕에 삼베로 뿌리를 싼 트리 묘목 둘 + 선물, 처마 전구 줄, 앞판 리스, 흔들목마.
//  - 주인은 나무 의자를 등에 진 목수 유령 (두건·귀 뒤 연필·캔버스 앞치마·허리 줄자·망치, 의자 기둥 끝 작은 등). 2프레임 숨쉬기.
//  - 간판 글씨는 넣지 않는다 (이름표는 게임이 따로 띄운다).
// 모든 그림은 원점 = 바닥 가운데 (0.5, 1), 맨 아래 줄 근처는 그림자 (props.ts·seasonStall.ts와 같은 규칙).

const OUT = 0x1f1d1a;
/** NPC 윤곽 (forage/art·zooArt·seasonStall의 NPC와 같은 색) */
const NPC_OUT = 0x16121a;
/** 눈 윤곽 (winterArt·seasonStall과 같은 색) */
const SNOW_EDGE = 0x55606c;

/** 수레 몸: 꿀빛 참나무 */
const OAK = { hi: 0xe2b276, mid: 0xc08a52, lo: 0x8e5e36, deep: 0x5e3c22 };
/** 가구: 짙은 호두나무 */
const WALNUT = { hi: 0x9a6a44, mid: 0x76502f, lo: 0x553821, deep: 0x3a2516 };
/** 칠한 판: 세이지 초록 */
const SAGE = { hi: 0xa8cca0, mid: 0x76a07a, lo: 0x527a5a, deep: 0x3a5a44 };
const CREAM = { hi: 0xfaf3e0, mid: 0xefe2c2, lo: 0xcfbf9c };
const TERRA = { hi: 0xf09a6a, mid: 0xd46a42, lo: 0x9e4a2c };
const MUSTARD = { hi: 0xf4d27a, mid: 0xe0b050, lo: 0xa87c2c };
const BRASS = { hi: 0xffe6a0, mid: 0xd8b056, lo: 0x9a7630 };
const IRON = { hi: 0x6a6670, mid: 0x46424c, lo: 0x2c2a32 };
const RED = { hi: 0xf0505a, mid: 0xd42c3c, lo: 0x9a1c2c };
const GOLD = { hi: 0xfff2b0, mid: 0xf2c84a, lo: 0xb88a22 };
const GREEN = { hi: 0x4aa868, mid: 0x2e8a4e, lo: 0x1f6634, deep: 0x174a28 };
const LEAF = { hi: 0x8ccf6a, mid: 0x58a84a, lo: 0x3a7a3a };
/** 불빛 */
const FLAME = { hi: 0xfff4c8, mid: 0xffd27a, lo: 0xe8a040 };
const BULB_COLORS: readonly Color[] = [0xff5a5a, 0xffd84a, 0x5adc7a, 0x5ab0ff, 0xfff4e0];

export const FURNITURE_STALL_W = 52;
export const FURNITURE_STALL_H = 48;
export const FURNITURE_CRAFTER_W = 30;
export const FURNITURE_CRAFTER_H = 32;

/** 빛 한 점 (그림 왼쪽 위 기준 픽셀 좌표 + 색 + 크기). 원점 기준 위치는 x - W/2, y - H */
export type FurnitureLight = { x: number; y: number; c: Color; big: boolean };

type Drawn = { g: Grid; lights: FurnitureLight[] };

function shadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 70): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x000000, a);
    }
}

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) g.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c);
}

/** 윗면에 눈을 한 겹 얹는다 (외곽선 다음에): 윗면 윤곽 칸은 눈으로, 그 위 빈칸은 눈 윤곽. y0~y1 사이만, skip = 군데군데 비울 비율 */
function topSnow(g: Grid, y0: number, y1: number, seed: number, skip = 0.25, x0 = 1, x1 = g.w - 2): void {
  const hits: [number, number][] = [];
  for (let x = x0; x <= x1; x++)
    for (let y = Math.max(1, y0); y <= y1; y++) {
      if (!g.filled(x, y) || g.filled(x, y - 1) || !g.filled(x, y + 1)) continue;
      if ((g.get(x, y) >>> 8) !== OUT || (g.get(x, y + 1) >>> 8) === OUT) continue;
      if (hash2(x, y, seed) < skip) continue;
      hits.push([x, y]);
    }
  for (const [x, y] of hits) {
    g.set(x, y, hash2(x, y, seed + 1) < 0.25 ? SNOW.mid : SNOW.hi);
    g.set(x, y - 1, SNOW_EDGE);
  }
}

/** 눈 둔덕 (바닥) */
function snowDrift(g: Grid, cx: number, by: number, rx: number, h: number): void {
  for (let y = by - h; y <= by; y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const top = by - h * (1 - dx * dx);
      if (Math.abs(dx) > 1 || y < Math.round(top)) continue;
      g.set(x, y, y === Math.round(top) ? SNOW.hi : y === by ? SNOW.shade : dx > 0.3 ? SNOW.lo : SNOW.mid);
    }
}

// ── 수레 뼈대 ──
// 세로: 지붕 윗면 9~13 · 처마 판 14~15 · 깃발 16~18 · 수레 안 17~28 · 짐칸 윗단 29 · 앞판 30~35 · 바퀴 33~45 · 그림자 45~47
const ROOF_TOP = 9;
const FASCIA = 14;
const BED_TOP = 29;
const BED_X0 = 5;
const BED_X1 = 43;
const POST_L = 7;
const POST_R = 40;
const WHEEL = { cx: 31, cy: 39, r: 6 } as const;
const BASE = 45;

/** 안쪽 뒷벽 (짙은 나무 판, 아래로 갈수록 따뜻하게) */
function backWall(g: Grid): void {
  for (let y = FASCIA + 2; y < BED_TOP; y++)
    for (let x = POST_L + 2; x < POST_R; x++) {
      const t = (y - FASCIA - 2) / (BED_TOP - FASCIA - 2);
      let c: Color = t < 0.45 ? 0x3a2a24 : t < 0.75 ? 0x4a3428 : 0x5a3e2c;
      if ((x - POST_L) % 6 === 0) c = darken(c, 0.25); // 판자 이음
      g.set(x, y, c);
    }
}

/** 기둥 둘 (지붕을 받친다) */
function posts(g: Grid): void {
  g.rect(POST_L, FASCIA, 2, BED_TOP - FASCIA, OAK.mid);
  g.vline(POST_L, FASCIA, BED_TOP - 1, OAK.hi);
  g.rect(POST_R, FASCIA, 2, BED_TOP - FASCIA, OAK.lo);
  g.vline(POST_R, FASCIA, BED_TOP - 1, OAK.mid);
}

/** 너와 지붕 (나무 비늘 세 줄) + 세이지 처마 판 */
function roof(g: Grid): void {
  for (let y = ROOF_TOP; y < FASCIA; y++) {
    const row = y - ROOF_TOP;
    const inset = row === 0 ? 2 : row === 1 ? 1 : 0;
    for (let x = 3 + inset; x <= 48 - inset; x++) {
      const k = (x + (row % 2) * 2) % 4;
      let c: Color = k === 0 ? WALNUT.lo : row % 2 ? WALNUT.mid : WALNUT.hi;
      if (row === 4) c = k === 0 ? WALNUT.deep : WALNUT.lo; // 비늘 끝 그늘
      if (x >= 40 && c !== WALNUT.deep) c = darken(c, 0.12);
      g.set(x, y, c);
    }
  }
  // 처마 판 (칠한 나무 + 크림 테)
  g.hline(2, 49, FASCIA, SAGE.mid);
  g.hline(2, 49, FASCIA + 1, SAGE.lo);
  g.hline(2, 30, FASCIA, SAGE.hi);
  for (let x = 4; x <= 47; x += 6) g.set(x, FASCIA + 1, CREAM.lo); // 못 머리
}

/** 처마 아래 삼각 깃발 줄 (테라코타·크림·겨자 번갈아) */
function bunting(g: Grid, palette: readonly Color[]): void {
  let n = 0;
  for (let x = 10; x <= 38; x += 4) {
    const c = palette[n++ % palette.length];
    g.hline(x, x + 2, FASCIA + 2, c);
    g.set(x + 1, FASCIA + 3, darken(c, 0.12));
  }
}

/** 짐칸 윗단 + 앞판 + 쇠 모서리 + 받침 다리 + 손잡이 채 (바퀴는 따로) */
function cartBed(g: Grid, front: { c: Color; hi: Color; lo: Color }): void {
  // 짐칸 바닥 (앞단)
  g.hline(BED_X0, BED_X1, BED_TOP, OAK.hi);
  g.hline(BED_X0 + 1, BED_X1, BED_TOP + 1, OAK.mid);
  // 앞판 (칠한 판자 + 크림 줄)
  for (let y = BED_TOP + 2; y <= BED_TOP + 6; y++)
    for (let x = BED_X0; x <= BED_X1; x++) {
      let c = y === BED_TOP + 2 ? front.hi : y === BED_TOP + 6 ? front.lo : front.c;
      if (x >= BED_X1 - 5 && y > BED_TOP + 2) c = darken(c, 0.12);
      g.set(x, y, c);
    }
  g.hline(BED_X0 + 2, BED_X1 - 2, BED_TOP + 3, mixLine(front.c));
  // 쇠 모서리 덧쇠
  for (const x of [BED_X0, BED_X1 - 1]) {
    g.rect(x, BED_TOP + 2, 2, 5, IRON.mid);
    g.set(x, BED_TOP + 2, IRON.hi);
    g.set(x + 1, BED_TOP + 4, BRASS.mid); // 징
  }
  // 바닥 밑 굴대·그늘
  g.hline(BED_X0 + 3, BED_X1 - 2, BED_TOP + 7, WALNUT.deep);
  // 받침 다리 (왼쪽, 비스듬히 벌어진 두 발)
  g.vline(8, BED_TOP + 7, BASE - 1, OAK.lo);
  g.vline(9, BED_TOP + 7, BASE - 1, OAK.mid);
  g.set(7, BASE - 1, OAK.lo);
  g.hline(7, 10, BASE, WALNUT.deep);
  // 손잡이 채 (오른쪽으로 길게, 먼 채는 어둡게) + 끝 가로 손잡이
  g.hline(BED_X1 + 1, 48, BED_TOP + 1, OAK.lo);
  g.hline(BED_X1 + 1, 48, BED_TOP + 3, OAK.mid);
  g.set(48, BED_TOP + 3, OAK.hi);
  g.vline(49, BED_TOP, BED_TOP + 4, WALNUT.mid);
}

/** 앞판 가운데 줄 색 (앞판보다 살짝 밝은 결) */
function mixLine(c: Color): Color {
  return lighten(c, 0.18);
}

/** 큰 나무 바퀴 (쇠 테 · 나무 테 · 바퀴살 여덟 · 쇠 굴대) */
function wheel(g: Grid): void {
  const { cx, cy, r } = WHEEL;
  g.ellipse(cx + 0.5, cy + 0.5, r - 1, r - 1, 0x4a3226);
  for (let y = cy - r - 1; y <= cy + r + 1; y++)
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - (cx + 0.5), y + 0.5 - (cy + 0.5));
      if (d > r + 0.5) continue;
      if (d > r - 0.6) g.set(x, y, y < cy && x < cx ? IRON.hi : IRON.lo);
      else if (d > r - 1.7) g.set(x, y, y < cy - 1 ? OAK.mid : OAK.lo);
    }
  // 바퀴살 여덟 (가로·세로·대각선, 픽셀에 딱 맞게)
  for (let k = 2; k <= r - 2; k++) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const)
      g.set(cx + dx * k, cy + dy * k, dy < 0 || dx < 0 ? OAK.hi : OAK.mid);
    if (k <= r - 3) for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const)
      g.set(cx + dx * k, cy + dy * k, dy < 0 && dx < 0 ? OAK.hi : OAK.lo);
  }
  // 굴대 (쇠 + 놋 못)
  g.rect(cx - 1, cy - 1, 3, 3, IRON.mid);
  g.set(cx - 1, cy - 1, IRON.hi);
  g.set(cx, cy, BRASS.mid);
}

// ── 수레 안 가구 ──

/** 갓 스탠드 (크림 갓 + 술 장식, 놋 기둥). 빛 자리를 돌려준다 */
function floorLamp(g: Grid, cx: number, shade: Color = CREAM.hi): FurnitureLight {
  const y0 = FASCIA + 3;
  // 갓 (사다리꼴)
  g.hline(cx - 1, cx + 1, y0, darken(shade, 0.08));
  g.hline(cx - 2, cx + 2, y0 + 1, shade);
  g.hline(cx - 2, cx + 2, y0 + 2, shade);
  g.hline(cx - 3, cx + 3, y0 + 3, darken(shade, 0.12));
  g.set(cx + 2, y0 + 1, darken(shade, 0.15));
  g.set(cx + 2, y0 + 2, darken(shade, 0.15));
  g.set(cx - 1, y0 + 1, FLAME.hi);
  for (let x = cx - 3; x <= cx + 3; x += 2) g.set(x, y0 + 4, MUSTARD.mid); // 술
  // 기둥 + 받침
  g.vline(cx, y0 + 4, BED_TOP - 1, BRASS.lo);
  g.set(cx, y0 + 7, BRASS.hi);
  g.hline(cx - 2, cx + 2, BED_TOP - 1, BRASS.mid);
  return { x: cx, y: y0 + 2, c: 0xffc878, big: true };
}

/** 벽에 건 액자 (금 테 + 작은 풍경). snowy면 눈 덮인 산 */
function picture(g: Grid, x0: number, y0: number, snowy: boolean): void {
  const w = 8;
  const h = 6;
  g.rect(x0, y0, w, h, GOLD.mid);
  g.hline(x0, x0 + w - 1, y0, GOLD.hi);
  g.vline(x0 + w - 1, y0 + 1, y0 + h - 1, GOLD.lo);
  g.hline(x0 + 1, x0 + w - 1, y0 + h - 1, GOLD.lo);
  // 그림: 하늘 → 산 → 들
  for (let y = y0 + 1; y < y0 + h - 1; y++)
    for (let x = x0 + 1; x < x0 + w - 1; x++) {
      const yy = y - y0;
      const xx = x - x0;
      let c: Color = snowy ? 0xb8d0e8 : 0x9cd0f0;
      if (yy >= 3 || (yy === 2 && xx >= 3 && xx <= 4)) c = snowy ? SNOW.mid : 0x6ab060;
      if (yy === 2 && xx >= 3 && xx <= 4 && snowy) c = SNOW.hi;
      if (yy === 4) c = snowy ? SNOW.lo : 0x4a8a48;
      g.set(x, y, c);
    }
  g.set(x0 + 5, y0 + 1, snowy ? 0xfff4e0 : 0xffd84a); // 해·달
  // 걸이 끈
  g.set(x0 + 3, y0 - 1, CREAM.lo);
  g.set(x0 + 4, y0 - 1, CREAM.lo);
}

/** 서랍장 (호두나무, 서랍 셋 + 놋 손잡이) */
function drawerChest(g: Grid, x0: number, w = 8): void {
  const top = BED_TOP - 7;
  g.hline(x0 - 1, x0 + w, top, OAK.hi);
  g.rect(x0, top + 1, w, 6, OAK.mid);
  g.vline(x0 + w - 1, top + 1, top + 6, OAK.lo);
  for (const dy of [2, 4]) g.hline(x0, x0 + w - 1, top + dy, OAK.deep);
  for (const dy of [1, 3, 5]) {
    g.set(x0 + Math.floor(w / 2) - 1, top + dy, BRASS.mid);
    g.set(x0 + Math.floor(w / 2), top + dy, BRASS.hi);
  }
}

/** 작은 꽃병 (서랍장 위) */
function vase(g: Grid, cx: number, y: number, flower: Color): void {
  g.set(cx, y - 1, CREAM.mid);
  g.set(cx, y - 2, CREAM.hi);
  g.set(cx, y - 3, LEAF.mid);
  g.set(cx - 1, y - 4, flower);
  g.set(cx + 1, y - 4, flower);
  g.set(cx, y - 4, lighten(flower, 0.3));
  g.set(cx, y - 5, flower);
}

/** 안락의자 (둥근 등받이 + 팔걸이 + 방석, 나무 다리) */
function armchair(g: Grid, x0: number, c: Color): void {
  const lo = darken(c, 0.2);
  const hi = lighten(c, 0.22);
  const by = BED_TOP - 1; // 다리 줄
  // 등받이
  g.hline(x0 + 2, x0 + 5, by - 8, hi);
  g.rect(x0 + 1, by - 7, 6, 4, c);
  g.vline(x0 + 6, by - 7, by - 4, lo);
  g.set(x0 + 3, by - 6, lo); // 단추
  // 팔걸이 + 방석
  g.rect(x0, by - 4, 2, 3, c);
  g.set(x0, by - 4, hi);
  g.rect(x0 + 6, by - 4, 2, 3, lo);
  g.hline(x0 + 2, x0 + 5, by - 3, hi);
  g.hline(x0 + 2, x0 + 5, by - 2, c);
  g.hline(x0, x0 + 7, by - 1, lo);
  // 다리
  g.set(x0 + 1, by, WALNUT.lo);
  g.set(x0 + 6, by, WALNUT.lo);
}

/** 기대 세운 전신 거울 (나무 테 타원 + 하늘빛 유리 + 반짝) */
function mirror(g: Grid, x0: number): void {
  const top = BED_TOP - 4;
  const bot = BASE - 1;
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / (bot - top);
    const round = y === top || y === bot - 1 ? 1 : 0;
    for (let x = x0 + round; x <= x0 + 4 - round; x++) {
      const edge = x === x0 + round || x === x0 + 4 - round || y === top || y === bot - 1;
      g.set(x, y, edge ? (x > x0 + 2 ? WALNUT.lo : WALNUT.mid) : t < 0.5 ? 0xc8e4f2 : 0xa8cce0);
    }
  }
  g.set(x0 + 1, top + 2, 0xffffff);
  g.set(x0 + 1, top + 3, 0xeef8fd);
  g.set(x0 + 2, top + 5, 0xeef8fd);
  // 받침발
  g.hline(x0, x0 + 4, bot, WALNUT.deep);
}

/** 땅 화분 (테라코타 + 잎 몽실) */
function pottedPlant(g: Grid, cx: number, by: number, pine = false): void {
  // 화분
  g.hline(cx - 3, cx + 3, by - 5, TERRA.hi);
  g.rect(cx - 2, by - 4, 5, 4, TERRA.mid);
  g.vline(cx + 2, by - 4, by - 1, TERRA.lo);
  if (pine) {
    // 작은 소나무 묘목 (세 단)
    const rows: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 2],
      [3, 3],
      [4, 3],
    ];
    for (const [i, hw] of rows) for (let x = cx - hw; x <= cx + hw; x++) g.set(x, by - 11 + i + (i > 2 ? 1 : 0), x > cx ? GREEN.lo : i % 2 ? GREEN.mid : GREEN.hi);
    g.set(cx, by - 12, GREEN.hi);
    return;
  }
  // 몬스테라 잎
  const leaves: [number, number, Color][] = [
    [-3, -7, LEAF.mid],
    [-2, -8, LEAF.hi],
    [-1, -7, LEAF.mid],
    [0, -9, LEAF.hi],
    [1, -8, LEAF.mid],
    [0, -7, LEAF.lo],
    [2, -7, LEAF.mid],
    [3, -8, LEAF.lo],
    [3, -6, LEAF.lo],
    [-2, -6, LEAF.lo],
    [1, -10, LEAF.mid],
    [-1, -9, LEAF.mid],
    [4, -7, LEAF.lo],
    [-4, -6, LEAF.mid],
  ];
  for (const [dx, dy, c] of leaves) g.set(cx + dx, by + dy, c);
  g.set(cx, by - 6, LEAF.lo);
}

// ── 지붕 위 짐 ──

/** 뒤집어 얹은 나무 의자 (방석이 아래, 다리 넷이 하늘로) */
function upsideChair(g: Grid, x0: number): void {
  const seat = ROOF_TOP - 1;
  g.hline(x0, x0 + 9, seat, OAK.mid);
  g.hline(x0 + 1, x0 + 9, seat - 1, OAK.hi);
  g.set(x0 + 9, seat, OAK.lo);
  // 다리 (앞 둘은 밝고 길게, 뒤 둘은 짧고 어둡게)
  for (const [x, top, c] of [
    [x0 + 1, seat - 7, OAK.hi],
    [x0 + 8, seat - 7, OAK.mid],
    [x0 + 3, seat - 5, OAK.lo],
    [x0 + 6, seat - 5, OAK.lo],
  ] as const)
    g.vline(x, top, seat - 2, c);
  // 가로대
  g.hline(x0 + 2, x0 + 7, seat - 4, OAK.lo);
}

/** 말아 묶은 러그 (가로로 누운 두루마리 + 끝 소용돌이 + 끈 둘) */
function rugRoll(g: Grid, x0: number, x1: number, y0: number, c: { a: Color; b: Color; c: Color }): void {
  for (let y = y0; y < y0 + 5; y++)
    for (let x = x0; x <= x1; x++) {
      const band = (x - x0) % 5;
      let col = band < 2 ? c.a : band < 4 ? c.b : c.c;
      if (y === y0) col = lighten(col, 0.2);
      if (y === y0 + 4) col = darken(col, 0.2);
      g.set(x, y, col);
    }
  // 끝 (소용돌이)
  g.rect(x1 + 1, y0, 2, 5, darken(c.a, 0.1));
  g.set(x1 + 1, y0 + 2, c.c);
  g.set(x1 + 2, y0 + 1, c.b);
  g.set(x1 + 2, y0 + 3, darken(c.c, 0.25));
  // 묶은 끈
  for (const x of [x0 + 3, x1 - 3]) g.vline(x, y0, y0 + 4, CREAM.hi);
}

/** 작은 둥근 걸상 (지붕 끝에 얹는다) */
function stool(g: Grid, x0: number, by: number): void {
  g.hline(x0, x0 + 5, by - 4, OAK.hi);
  g.hline(x0, x0 + 5, by - 3, OAK.mid);
  g.set(x0 + 5, by - 3, OAK.lo);
  g.vline(x0 + 1, by - 2, by, OAK.lo);
  g.vline(x0 + 4, by - 2, by, OAK.lo);
  g.hline(x0 + 1, x0 + 4, by - 1, WALNUT.lo);
}

/** 매단 놋 등 (지붕 끝 고리 → 작은 사각 등). 빛 자리를 돌려준다 */
function brassLantern(g: Grid, cx: number, y0: number, len: number): FurnitureLight {
  g.vline(cx, y0, y0 + len - 1, 0x3a3434);
  const y = y0 + len;
  g.hline(cx - 1, cx + 1, y, BRASS.lo);
  g.rect(cx - 2, y + 1, 5, 4, BRASS.mid);
  g.rect(cx - 1, y + 1, 3, 4, FLAME.mid);
  g.set(cx, y + 2, FLAME.hi);
  g.set(cx, y + 3, FLAME.hi);
  g.set(cx + 1, y + 4, FLAME.lo);
  g.hline(cx - 2, cx + 2, y + 5, BRASS.lo);
  return { x: cx, y: y + 3, c: 0xffb868, big: true };
}

// ── 기본 ──

function defaultStall(): Drawn {
  const g = new Grid(FURNITURE_STALL_W, FURNITURE_STALL_H);
  const lights: FurnitureLight[] = [];
  backWall(g);
  // 수레 안 가구 (뒤 → 앞)
  picture(g, 17, FASCIA + 5, false);
  lights.push(floorLamp(g, 12));
  drawerChest(g, 26);
  vase(g, 29, BED_TOP - 7, TERRA.hi);
  armchair(g, 33, MUSTARD.mid);
  posts(g);
  roof(g);
  bunting(g, [TERRA.mid, CREAM.hi, MUSTARD.mid]);
  // 지붕 위 짐
  upsideChair(g, 6);
  rugRoll(g, 18, 33, ROOF_TOP - 5, { a: TERRA.mid, b: MUSTARD.mid, c: CREAM.hi });
  stool(g, 38, ROOF_TOP);
  cartBed(g, { c: SAGE.mid, hi: SAGE.hi, lo: SAGE.lo });
  // 앞판 가운데 작은 의자 무늬 (크림 칠)
  emblemHouse(g, 15, BED_TOP + 2, CREAM.hi);
  wheel(g);
  lights.push(brassLantern(g, 47, FASCIA + 2, 2));
  mirror(g, 1);
  pottedPlant(g, 41, BASE);
  g.outline(OUT);
  shadow(g, 26, BASE + 1, 25, 2.2, 70);
  return { g, lights };
}

/** 앞판 장식: 작은 집 그림 (5×5 — 「집 꾸밀 가구」 가게 표시, 글씨 대신) + 양옆 못 머리 */
function emblemHouse(g: Grid, x0: number, y0: number, c: Color): void {
  g.set(x0 + 2, y0, c);
  g.hline(x0 + 1, x0 + 3, y0 + 1, c);
  g.hline(x0, x0 + 4, y0 + 2, c);
  g.hline(x0 + 1, x0 + 3, y0 + 3, c);
  g.hline(x0 + 1, x0 + 3, y0 + 4, c);
  g.set(x0 + 2, y0 + 4, darken(c, 0.55)); // 문
  g.set(x0 + 3, y0 + 3, MUSTARD.mid); // 창 불빛
  for (const dx of [-5, -3, 7, 9]) g.set(x0 + dx, y0 + 2, darken(c, 0.15));
}

// ── 겨울 ──

/** 지붕 짐을 덮은 체크 담요 (가운데 불룩, 끈으로 묶음). 의자 다리 둘은 담요 밖으로 */
function blanketLoad(g: Grid): void {
  // 담요 속 짐 모양 (의자·러그 위로 둥글게)
  for (let x = 5; x <= 44; x++) {
    const t = (x - 5) / 39;
    const h = Math.round(4 + Math.sin(t * Math.PI) * 3 + (x < 16 ? 1 : 0));
    for (let y = ROOF_TOP - h; y < ROOF_TOP; y++) {
      const cx = Math.floor((x + 40) / 3);
      const cy = Math.floor((y + 40) / 3);
      let c: Color = (cx + cy) % 2 ? RED.mid : RED.lo;
      if (x % 3 === 1 || y % 3 === 1) c = (x % 3 === 1 && y % 3 === 1) ? CREAM.mid : lighten(c, 0.18);
      if (y === ROOF_TOP - h) c = lighten(c, 0.15);
      if (x >= 38) c = darken(c, 0.12);
      g.set(x, y, c);
    }
    // 담요 술 (아래 끝 늘어짐)
    if (x % 2 === 0) g.set(x, ROOF_TOP, CREAM.lo);
  }
  // 묶은 끈 둘
  for (const x of [14, 33]) {
    for (let y = 0; y < ROOF_TOP; y++) if (g.filled(x, y)) g.set(x, y, 0x8a6a48);
  }
  // 담요 밖으로 나온 의자 다리 둘
  g.vline(7, ROOF_TOP - 10, ROOF_TOP - 6, OAK.hi);
  g.vline(11, ROOF_TOP - 9, ROOF_TOP - 6, OAK.mid);
}

/** 작은 무쇠 난로 (불 창 + 굴뚝 관이 지붕을 뚫고 오른다). 빛 자리를 돌려준다 */
function ironStove(g: Grid, x0: number): FurnitureLight {
  const by = BED_TOP - 1;
  g.hline(x0, x0 + 6, by - 7, IRON.hi);
  g.rect(x0, by - 6, 7, 6, IRON.mid);
  g.vline(x0 + 6, by - 6, by - 1, IRON.lo);
  // 불 창
  g.rect(x0 + 2, by - 4, 3, 2, FLAME.mid);
  g.set(x0 + 3, by - 4, FLAME.hi);
  g.set(x0 + 4, by - 3, FLAME.lo);
  // 다리
  g.set(x0, by, IRON.lo);
  g.set(x0 + 6, by, IRON.lo);
  // 굴뚝 관
  g.vline(x0 + 3, FASCIA + 2, by - 8, IRON.mid);
  g.vline(x0 + 4, FASCIA + 2, by - 8, IRON.lo);
  return { x: x0 + 3, y: by - 4, c: 0xff9a50, big: true };
}

/** 고드름 (처마 판 아래) */
function icicles(g: Grid, seed: number): void {
  let last = -9;
  for (let x = 3; x <= 48; x++) {
    if (x - last < 2 || hash2(x, 5, seed) < 0.4) continue;
    if ((x >= POST_L - 1 && x <= POST_L + 2) || (x >= POST_R - 1 && x <= POST_R + 2) || (x >= 45 && x <= 48)) continue;
    last = x;
    const len = 1 + Math.floor(hash2(x, 9, seed) * 3.2);
    for (let k = 0; k < len; k++) g.set(x, FASCIA + 2 + k, k === len - 1 ? ICE.lo : k === 0 ? ICE.hi : ICE.mid);
  }
}

function winterStall(): Drawn {
  const g = new Grid(FURNITURE_STALL_W, FURNITURE_STALL_H);
  const lights: FurnitureLight[] = [];
  backWall(g);
  picture(g, 16, FASCIA + 5, true);
  lights.push(floorLamp(g, 11, 0xfbe6c8));
  lights.push(ironStove(g, 25));
  armchair(g, 33, SAGE.mid);
  // 안락의자에 걸친 뜨개 담요 (크림 + 빨간 줄)
  for (let y = BED_TOP - 8; y <= BED_TOP - 3; y++) {
    g.set(38, y, y % 2 ? CREAM.hi : RED.mid);
    g.set(39, y, y % 2 ? CREAM.mid : RED.lo);
  }
  posts(g);
  roof(g);
  blanketLoad(g);
  cartBed(g, { c: SAGE.mid, hi: SAGE.hi, lo: SAGE.lo });
  emblemHouse(g, 15, BED_TOP + 2, CREAM.hi);
  wheel(g);
  lights.push(brassLantern(g, 47, FASCIA + 2, 2));
  mirror(g, 1);
  pottedPlant(g, 41, BASE, true);
  g.outline(OUT);
  // 지붕 짐·처마·손잡이 위 눈
  topSnow(g, 0, ROOF_TOP + 1, 17, 0.12);
  topSnow(g, FASCIA - 1, FASCIA + 1, 23, 0.2);
  icicles(g, 11);
  topSnow(g, BED_TOP - 2, BED_TOP + 2, 31, 0.35, 42, 50);
  // 놋 등 머리·거울 위 눈 한 줌
  g.set(46, FASCIA + 4, SNOW.hi);
  g.set(47, FASCIA + 4, SNOW.hi);
  g.set(48, FASCIA + 4, SNOW.mid);
  g.set(2, BED_TOP - 5, SNOW.hi);
  g.set(3, BED_TOP - 5, SNOW.mid);
  snowDrift(g, 6, BASE + 1, 7, 2);
  snowDrift(g, 44, BASE + 1, 5, 1);
  shadow(g, 26, BASE + 1, 25, 2.2, 60);
  return { g, lights };
}

// ── 크리스마스 ──

/** 삼베로 뿌리를 싼 트리 묘목 (by = 삼베 아래, h = 나무 높이) */
function sapling(g: Grid, cx: number, by: number, h: number): void {
  // 삼베 뿌리분 + 빨간 끈
  g.hline(cx - 2, cx + 2, by - 1, 0xb89868);
  g.hline(cx - 3, cx + 3, by - 2, 0xc8a878);
  g.hline(cx - 2, cx + 2, by - 3, 0xd8b888);
  g.hline(cx - 2, cx + 2, by - 2, 0xc8a878);
  g.set(cx + 2, by - 2, 0x9a7a50);
  g.hline(cx - 2, cx + 2, by - 3, RED.mid);
  // 나무 (세모 층층)
  const top = by - 3 - h;
  for (let y = top; y < by - 3; y++) {
    const t = (y - top) / h;
    const hw = Math.round(0.5 + t * 3.6 - ((y - top) % 3 === 0 && y > top ? 1 : 0));
    for (let x = cx - hw; x <= cx + hw; x++) g.set(x, y, x > cx ? GREEN.lo : (y - top) % 3 === 1 ? GREEN.hi : GREEN.mid);
  }
  g.set(cx, top - 1, GOLD.mid);
}

/** 처마 판을 따라 늘어진 전구 줄 */
function bulbString(g: Grid, lights: FurnitureLight[]): void {
  let n = 0;
  for (let x = 3; x <= 48; x++) {
    const k = (x - 3) % 6;
    const y = FASCIA + 1;
    g.set(x, y, 0x2a3a2a);
    if (k === 3 && !(x >= POST_L - 1 && x <= POST_L + 2) && !(x >= POST_R - 1 && x <= POST_R + 2)) {
      const c = BULB_COLORS[n++ % BULB_COLORS.length];
      g.set(x, y + 1, c);
      g.set(x, y + 2, darken(c, 0.25));
      lights.push({ x, y: y + 1, c, big: false });
    } else if (k === 0) {
      const c = BULB_COLORS[(n + 2) % BULB_COLORS.length];
      g.set(x, y, c);
      lights.push({ x, y, c, big: false });
    }
  }
}

/** 리스 (둥근 솔가지 고리 + 빨간 열매 + 리본) — 가운데 cx, cy */
function wreath(g: Grid, cx: number, cy: number): void {
  for (let y = cy - 3; y <= cy + 3; y++)
    for (let x = cx - 3; x <= cx + 3; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > 3.4 || d < 1.4) continue;
      g.set(x, y, x > cx ? GREEN.lo : (x + y) % 2 ? GREEN.mid : GREEN.hi);
    }
  g.set(cx - 2, cy - 2, RED.hi);
  g.set(cx + 2, cy - 1, RED.mid);
  g.set(cx - 3, cy + 1, RED.mid);
  // 아래 리본
  g.set(cx - 1, cy + 3, RED.hi);
  g.set(cx + 1, cy + 3, RED.mid);
  g.set(cx, cy + 3, RED.lo);
  g.set(cx - 1, cy + 4, RED.mid);
  g.set(cx + 1, cy + 4, RED.lo);
}

/** 흔들목마 (빨간 말 + 금 갈기 + 흔들 다리) — 왼쪽 x0, 바닥 by. 머리는 왼쪽을 본다 (수레 받침 다리와 안 겹치게) */
function rockingHorse(g: Grid, x0: number, by: number): void {
  const X = (dx: number) => x0 + 9 - dx;
  // 흔들 다리 (둥근 활)
  for (let dx = 0; dx <= 8; dx++) g.set(X(dx), by - Math.round(Math.sin((dx / 8) * Math.PI) * 1.2), WALNUT.mid);
  g.set(X(2), by - 2, WALNUT.lo);
  g.set(X(6), by - 2, WALNUT.lo);
  // 몸통
  for (let dx = 2; dx <= 6; dx++) {
    g.set(X(dx), by - 5, RED.hi);
    g.set(X(dx), by - 4, RED.mid);
  }
  g.set(X(4), by - 5, GOLD.mid); // 안장
  // 목·머리
  for (let dy = 6; dy <= 8; dy++) {
    g.set(X(6), by - dy, RED.mid);
    g.set(X(7), by - dy, RED.hi);
  }
  g.set(X(8), by - 8, RED.mid);
  g.set(X(9), by - 7, RED.lo);
  g.set(X(8), by - 7, RED.mid);
  g.set(X(7), by - 8, 0x1a1620); // 눈
  // 갈기·꼬리
  g.set(X(5), by - 7, GOLD.mid);
  g.set(X(5), by - 6, GOLD.lo);
  g.set(X(6), by - 9, GOLD.hi);
  g.set(X(1), by - 5, GOLD.mid);
  g.set(X(1), by - 4, GOLD.lo);
}

function christmasStall(): Drawn {
  const g = new Grid(FURNITURE_STALL_W, FURNITURE_STALL_H);
  const lights: FurnitureLight[] = [];
  backWall(g);
  // 액자 대신 벽에 건 양말 둘 + 액자 하나
  picture(g, 17, FASCIA + 5, true);
  for (const [x, c] of [
    [27, RED.mid],
    [31, GREEN.mid],
  ] as const) {
    g.hline(x, x + 1, FASCIA + 5, CREAM.hi);
    g.rect(x, FASCIA + 6, 2, 3, c);
    g.hline(x, x + 2, FASCIA + 9, c);
    g.set(x + 2, FASCIA + 9, darken(c, 0.2));
  }
  lights.push(floorLamp(g, 12, 0xfbe0c0));
  drawerChest(g, 25);
  // 서랍장 위 포인세티아
  for (const [dx, dy, c] of [
    [0, -1, TERRA.mid],
    [1, -1, TERRA.lo],
    [0, -2, RED.mid],
    [-1, -3, RED.hi],
    [1, -3, RED.mid],
    [0, -4, RED.hi],
    [0, -3, GOLD.mid],
    [2, -2, GREEN.mid],
    [-1, -2, GREEN.lo],
  ] as const)
    g.set(29 + dx, BED_TOP - 7 + dy, c);
  armchair(g, 33, RED.mid);
  g.set(36, BED_TOP - 4, GREEN.mid); // 초록 쿠션
  g.set(37, BED_TOP - 4, GREEN.lo);
  posts(g);
  roof(g);
  // 지붕 위: 트리 묘목 둘 + 선물 상자 + 작은 걸상
  sapling(g, 11, ROOF_TOP, 9);
  sapling(g, 21, ROOF_TOP, 7);
  // 선물 상자
  g.rect(27, ROOF_TOP - 5, 7, 5, CREAM.hi);
  g.vline(33, ROOF_TOP - 5, ROOF_TOP - 1, CREAM.lo);
  g.vline(30, ROOF_TOP - 5, ROOF_TOP - 1, RED.mid);
  g.hline(27, 33, ROOF_TOP - 3, RED.mid);
  g.set(29, ROOF_TOP - 6, RED.hi);
  g.set(31, ROOF_TOP - 6, RED.mid);
  rugRoll(g, 35, 43, ROOF_TOP - 5, { a: GREEN.mid, b: RED.mid, c: CREAM.hi });
  // 앞판은 눈빛 크림 칠 (코디 보따리상의 빨간 썰매와 갈리게) + 리스
  cartBed(g, { c: CREAM.mid, hi: CREAM.hi, lo: CREAM.lo });
  wreath(g, 17, BED_TOP + 3);
  for (const x of [26, 28]) g.set(x, BED_TOP + 4, RED.mid); // 빨간 징 장식
  wheel(g);
  bulbString(g, lights);
  lights.push(brassLantern(g, 47, FASCIA + 2, 2));
  // 왼쪽 땅: 화분에 심은 작은 트리 (금 별)
  rockingHorse(g, 0, BASE);
  pottedPlant(g, 42, BASE, true);
  g.set(42, BASE - 13, GOLD.hi);
  g.set(41, BASE - 8, RED.hi);
  g.set(43, BASE - 9, GOLD.mid);
  g.set(40, BASE - 6, BULB_COLORS[3]);
  g.outline(OUT);
  topSnow(g, 0, ROOF_TOP + 1, 21, 0.25);
  topSnow(g, BED_TOP - 2, BED_TOP + 2, 29, 0.4, 42, 50);
  snowDrift(g, 9, BASE + 1, 4, 1);
  snowDrift(g, 48, BASE + 1, 3, 1);
  shadow(g, 26, BASE + 1, 25, 2.2, 60);
  return { g, lights };
}

const cache = new Map<string, Drawn>();
function drawn(concept: MapConcept): Drawn {
  let d = cache.get(concept);
  if (!d) {
    d = concept === "christmas" ? christmasStall() : concept === "winter" ? winterStall() : defaultStall();
    cache.set(concept, d);
  }
  return d;
}

/** 가구 보따리상 노점 — 이동 가구점 손수레 (52×48, 원점 바닥 가운데) */
export function furnitureStall(concept: MapConcept = "default"): HTMLCanvasElement {
  return drawn(concept).g.toCanvas();
}

/** 노점 불빛 자리 (갓 스탠드·놋 등·난로·전구) */
export function furnitureStallLights(concept: MapConcept = "default"): readonly FurnitureLight[] {
  return drawn(concept).lights;
}

/**
 * 노점 불빛 겹 (가산 섞기로 위에 얹는다): 노점과 같은 크기 두 장을 가로로. 등불은 은은히 일렁이고, 전구는 절반씩 번갈아 밝다.
 * 밤에만 보이게 쓰는 쪽에서 알파를 조절한다 (seasonStallGlowSheet와 같은 짜임).
 */
export function furnitureStallGlowSheet(concept: MapConcept = "default"): HTMLCanvasElement {
  const W = FURNITURE_STALL_W;
  const H = FURNITURE_STALL_H;
  const { canvas, ctx } = makeCanvas(W * 2, H);
  const lights = furnitureStallLights(concept);
  for (let f = 0; f < 2; f++)
    lights.forEach((l, i) => {
      const on = l.big ? true : (i + f) % 2 === 0;
      const R = l.big ? (f ? 9 : 8) : on ? 4 : 2.5;
      const a = l.big ? 0.75 : on ? 0.95 : 0.45;
      const rgb = `${(l.c >> 16) & 255},${(l.c >> 8) & 255},${l.c & 255}`;
      const cx = f * W + l.x + 0.5;
      const cy = l.y + 0.5;
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      gr.addColorStop(0, `rgba(${rgb},${a})`);
      gr.addColorStop(0.35, `rgba(${rgb},${a * 0.45})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    });
  return canvas;
}

// ── 목수 유령 NPC ──

/** 등에 진 사다리 등받이 나무 의자 (머리 위로 기둥·가로살, 양옆으로 다리). 따로 그려 외곽선을 두른다 */
function backChair(b: number, concept: MapConcept): Grid {
  const g = new Grid(FURNITURE_CRAFTER_W, FURNITURE_CRAFTER_H);
  const xmas = concept === "christmas";
  const top = 3 + b;
  // 등받이 기둥 둘 (끝에 둥근 꼭지)
  for (const [x, c, c2] of [
    [7, OAK.hi, OAK.mid],
    [22, OAK.mid, OAK.lo],
  ] as const) {
    g.vline(x, top, 20 + b, c);
    g.vline(x + 1, top, 20 + b, c2);
    g.set(x, top - 1, OAK.hi);
    g.set(x + 1, top - 1, OAK.mid);
  }
  // 가로살 셋 (사다리 등받이)
  for (const [dy, c] of [
    [1, OAK.mid],
    [4, OAK.lo],
    [7, OAK.lo],
  ] as const) {
    g.hline(9, 21, top + dy, c);
    g.hline(9, 21, top + dy + 1, dy === 1 ? OAK.lo : WALNUT.lo);
    if (dy === 1) g.hline(9, 14, top + dy, OAK.hi);
  }
  // 방석 모서리 (몸 양옆으로 비죽) + 다리 (아래로)
  g.hline(5, 8, 19 + b, OAK.hi);
  g.hline(22, 25, 19 + b, OAK.mid);
  g.hline(5, 8, 20 + b, OAK.lo);
  g.hline(22, 25, 20 + b, OAK.lo);
  g.vline(5, 21 + b, 25, OAK.mid);
  g.vline(25, 21 + b, 25, OAK.lo);
  g.hline(5, 6, 23, WALNUT.lo);
  g.hline(24, 25, 23, WALNUT.lo);
  if (xmas) {
    // 꼭대기 빨간 리본 + 기둥 따라 작은 전구
    g.set(13, top, RED.hi);
    g.set(14, top, RED.mid);
    g.set(13, top + 1, RED.mid);
    g.set(16, top, RED.mid);
    g.set(17, top, RED.lo);
    g.set(17, top + 1, RED.lo);
    g.set(15, top + 1, RED.lo);
    g.set(14, top + 2, RED.mid);
    g.set(16, top + 2, RED.lo);
    for (const [x, y, c] of [
      [7, top + 3, BULB_COLORS[1]],
      [8, top + 7, BULB_COLORS[0]],
      [22, top + 5, BULB_COLORS[2]],
      [23, top + 9, BULB_COLORS[3]],
    ] as const)
      g.set(x, y, c);
  }
  g.outline(NPC_OUT);
  if (concept !== "default") {
    // 기둥 꼭지·맨 위 가로살에 소복한 눈
    for (const x of [7, 8, 22, 23]) {
      g.set(x, top - 2, SNOW_EDGE);
      g.set(x, top - 1, SNOW.hi);
    }
    for (let x = 10; x <= 20; x++) {
      if (xmas && x >= 12 && x <= 18) continue;
      if (hash2(x, 3, 5) < 0.3) continue;
      g.set(x, top, SNOW.hi);
    }
  }
  return g;
}

/** 두건 (테라코타 천, 왼쪽 매듭 꼬리 둘). y = 정수리 줄 */
function bandana(g: Grid, hy: number): void {
  const y = hy - 6;
  g.hline(12, 18, y, TERRA.hi);
  g.hline(10, 20, y + 1, TERRA.mid);
  g.hline(9, 21, y + 2, TERRA.mid);
  g.hline(9, 21, y + 3, TERRA.lo);
  g.set(19, y + 1, TERRA.lo);
  g.set(20, y + 2, TERRA.lo);
  g.set(12, y + 1, TERRA.hi);
  // 이마 쪽 크림 테 한 줄 (물방울 무늬는 버섯처럼 보여 뺐다)
  g.hline(10, 19, y + 3, CREAM.mid);
  g.set(20, y + 3, CREAM.lo);
  // 왼쪽 매듭 + 꼬리
  g.set(8, y + 3, TERRA.mid);
  g.set(7, y + 4, TERRA.hi);
  g.set(7, y + 5, TERRA.mid);
  g.set(8, y + 5, TERRA.lo);
}

/** 귀 뒤에 꽂은 연필 (오른쪽 머리 옆, 비스듬히) */
function pencil(g: Grid, hy: number): void {
  g.set(20, hy - 4, 0xf0a0a8); // 지우개
  g.set(21, hy - 3, MUSTARD.hi);
  g.set(22, hy - 2, MUSTARD.mid);
  g.set(23, hy - 1, 0xe8c8a0); // 깎은 나무
  g.set(24, hy, 0x2a2a30); // 심
}

/** 목수 유령: 30×32. frame 0·1 = 숨쉬기 (위 몸이 한 칸 내려앉고 자락이 일렁인다) */
export function furnitureCrafter(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const b = frame ? 1 : 0;
  const xmas = concept === "christmas";
  const winter = concept === "winter";
  const back = backChair(b, concept);

  const g = new Grid(FURNITURE_CRAFTER_W, FURNITURE_CRAFTER_H);
  const body = 0xf0ebe0;
  const shade = darken(body, 0.16);
  const hy = 17 + b; // 머리 가운데
  // 유령 몸 (머리 + 몸 + 물결 자락) — 보따리상과 같은 몸
  g.ellipse(15, hy, 6, 6.2, body);
  g.rect(9, hy, 13, 27 - hy, body);
  for (let x = 9; x <= 21; x++) if ((x + frame) % 3 !== 0) g.set(x, 27, body);
  g.recolor((x, y) => x >= 19 && y > hy - 3, shade);
  g.recolor((x, y) => y >= 26 && x >= 17, shade);
  // 눈·볼·입 (살짝 웃는 입)
  for (const ex of [13, 17]) {
    g.set(ex, hy, 0x1a1620);
    g.set(ex, hy + 1, 0x1a1620);
  }
  g.set(12, hy + 2, 0xf0a0a8);
  g.set(18, hy + 2, 0xf0a0a8);
  g.set(14, hy + 3, 0x8a4a50);
  g.set(16, hy + 3, 0x8a4a50);
  g.set(15, hy + 4, 0x8a4a50);
  // 캔버스 앞치마 (가슴 받이 + 아래 넓게, 앞주머니에 접자)
  const apron = winter ? 0x8a9aa8 : xmas ? GREEN.mid : 0xc8a070;
  const apLo = darken(apron, 0.2);
  const ay = hy + 6;
  g.hline(12, 18, ay, apron);
  g.rect(11, ay + 1, 9, 26 - ay, apron);
  g.vline(19, ay + 1, 26, apLo);
  g.hline(11, 19, 26, apLo);
  // 목끈
  g.set(11, ay - 1, apLo);
  g.set(19, ay - 1, apLo);
  // 앞주머니 + 꽂은 접자(노랑)·연필
  g.hline(12, 17, ay + 4, apLo);
  g.rect(12, ay + 5, 6, 2, darken(apron, 0.1));
  g.vline(13, ay + 2, ay + 4, MUSTARD.mid);
  g.set(13, ay + 2, MUSTARD.hi);
  g.vline(16, ay + 3, ay + 4, TERRA.mid);
  if (xmas) seasonHolly(g, 15, ay + 1);
  // 허리 줄자 (왼쪽 옆구리, 노란 통 + 늘어진 줄)
  g.rect(9, ay + 2, 3, 3, MUSTARD.mid);
  g.set(9, ay + 2, MUSTARD.hi);
  g.set(10, ay + 3, 0x3a3434);
  g.set(11, ay + 4, MUSTARD.lo);
  g.vline(11, ay + 5, Math.min(26, ay + 8), MUSTARD.hi);
  // 목도리 (겨울·크리스마스)
  if (winter) seasonScarf(g, 9, 21, hy + 5, { c: SAGE.mid, c2: CREAM.hi, pat: "check", thick: true, tail: 10 });
  else if (xmas) seasonScarf(g, 9, 21, hy + 5, { c: RED.mid, c2: GREEN.mid, pat: "stripe", thick: true, tail: 10 });
  // 오른손에 든 망치 (나무 자루 + 쇠 머리)
  g.vline(23, hy + 3, hy + 8, OAK.mid);
  g.set(23, hy + 8, OAK.lo);
  g.hline(21, 25, hy + 1, IRON.hi);
  g.hline(21, 25, hy + 2, IRON.mid);
  g.set(25, hy + 2, IRON.lo);
  g.set(21, hy + 2, IRON.lo);
  if (concept === "default") {
    g.set(22, hy + 5, body);
    g.set(23, hy + 5, body);
    g.set(22, hy + 6, shade);
  } else seasonMitt(g, 22, hy + 4, winter ? 0xc8463c : RED.mid);
  // 머리: 기본 = 두건 + 연필, 겨울 = 털 귀덮개 모자 + 연필, 크리스마스 = 엘프 모자
  if (concept === "default") bandana(g, hy);
  if (!xmas) pencil(g, hy);
  g.outline(NPC_OUT);
  if (winter || xmas) {
    const hat = new Grid(FURNITURE_CRAFTER_W, FURNITURE_CRAFTER_H);
    seasonHat(hat, 15, hy, 6, hy - 6, winter ? { kind: "trapper", c: 0x7a5236 } : { kind: "elf" });
    hat.outline(NPC_OUT);
    g.draw(hat, 0, 0);
  }
  // 의자 앞에 유령을 얹는다 + 의자 오른쪽 기둥 끝에 매단 작은 등
  back.draw(g, 0, 0);
  const lx = 26;
  const ly = 5 + b;
  const lamp = new Grid(FURNITURE_CRAFTER_W, FURNITURE_CRAFTER_H);
  lamp.hline(24, 25, ly - 2, OAK.lo); // 고리 막대
  lamp.vline(lx, ly - 1, ly - 1, 0x3a3434);
  lamp.hline(lx - 1, lx + 1, ly, BRASS.lo);
  lamp.rect(lx - 1, ly + 1, 3, 3, BRASS.mid);
  lamp.set(lx, ly + 1, FLAME.hi);
  lamp.set(lx, ly + 2, FLAME.mid);
  lamp.hline(lx - 1, lx + 1, ly + 4, BRASS.lo);
  lamp.outline(NPC_OUT);
  back.draw(lamp, 0, 0);
  shadow(back, 15, 29.5, 9, 1.3, 50);
  return back.toCanvas();
}

/** 목수 유령 등불 자리 (그림 왼쪽 위 기준) */
export function furnitureCrafterLight(frame: number): FurnitureLight {
  return { x: 26, y: 7 + (frame ? 1 : 0), c: 0xffb868, big: true };
}

/** 두 프레임을 가로로 붙인 시트 (60×32) */
export function furnitureCrafterSheet(concept: MapConcept = "default"): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(FURNITURE_CRAFTER_W * 2, FURNITURE_CRAFTER_H);
  for (let f = 0; f < 2; f++) ctx.drawImage(furnitureCrafter(f, concept), f * FURNITURE_CRAFTER_W, 0);
  return canvas;
}
