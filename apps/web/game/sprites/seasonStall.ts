import type { MapConcept } from "@/lib/mapConcept";
import { seasonHat, seasonHolly, seasonMitt, seasonScarf } from "./npcSeasonArt";
import { darken, Grid, hash2, lighten, makeCanvas, mix, type Color } from "./pixel";
import { ICE, SNOW } from "./winterArt";

// 11/19 시안: 광장 「계절 보따리상」 — 계절 한정 코디 세트를 2~4주씩 파는 기간 상점의 노점과 주인 NPC (그림만, 게임 연결 전).
//  - 노점은 맵 컨셉마다 다르다: 기본 = 남색·크림 줄무늬 천막 + 나무 매대 + 걸린 옷, 겨울 = 같은 천막에 눈·고드름·작은 쇠 랜턴,
//    크리스마스 = 사탕 지팡이 기둥·전구 꽃줄 + 빨간 썰매 매대 + 선물 상자.
//  - 보따리상은 커다란 보자기 보따리를 진 유령 행상 (패랭이에 목화송이, 지팡이 끝 작은 초롱). 2프레임 숨쉬기.
//  - 간판 글씨는 넣지 않는다 (이름표는 게임이 따로 띄운다).
// 모든 그림은 원점 = 바닥 가운데 (0.5, 1), 맨 아래 줄 근처는 그림자 (props.ts와 같은 규칙).

const OUT = 0x1f1d1a;
/** NPC 윤곽 (forage/art·zooArt의 NPC와 같은 색) */
const NPC_OUT = 0x16121a;
/** 눈 윤곽 (winterArt와 같은 색 — 검은 윤곽보다 차갑고 옅게) */
const SNOW_EDGE = 0x55606c;

const WOOD = { hi: 0x927252, mid: 0x7a5d40, lo: 0x5a432e, line: 0x2e2219 };
/** 보따리상 가게 색: 보자기 남색 + 무명 크림 + 겨자 장식 */
const INDIGO = { hi: 0x5a72b0, mid: 0x3e5592, lo: 0x2c3c6c };
const CREAM = { hi: 0xfaf3e0, mid: 0xefe2c2, lo: 0xcfbf9c };
const MUSTARD = { hi: 0xf4d27a, mid: 0xe0b050, lo: 0xa87c2c };
const RED = { hi: 0xf0505a, mid: 0xd42c3c, lo: 0x9a1c2c, deep: 0x6e1220 };
const GOLD = { hi: 0xfff2b0, mid: 0xf2c84a, lo: 0xb88a22 };
const GREEN = { hi: 0x4aa868, mid: 0x2e8a4e, lo: 0x1f6634, deep: 0x174a28 };
/** 초롱·랜턴 불빛 */
const FLAME = { hi: 0xfff4c8, mid: 0xffd27a, lo: 0xe8a040 };
const BULB_COLORS: readonly Color[] = [0xff5a5a, 0xffd84a, 0x5adc7a, 0x5ab0ff, 0xfff4e0];

export const SEASON_STALL_W = 52;
export const SEASON_STALL_H = 48;
export const SEASON_PEDDLER_W = 30;
export const SEASON_PEDDLER_H = 32;

/** 빛 한 점 (그림 왼쪽 위 기준 픽셀 좌표 + 색 + 크기). 원점 기준 위치는 x - W/2, y - H */
export type StallLight = { x: number; y: number; c: Color; big: boolean };

type Drawn = { g: Grid; lights: StallLight[] };

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
function topSnow(g: Grid, y0: number, y1: number, seed: number, skip = 0.25): void {
  const hits: [number, number][] = [];
  for (let x = 1; x < g.w - 1; x++)
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

// ── 걸어 둔 옷 (뒤 막대에 매단다: x0 = 왼쪽, y0 = 어깨 줄) ──

/** 스웨터: 어깨 9칸·몸판 7칸·소매 늘어짐, 뜨개 결 + 아래 단. pat = 가슴 노르딕 띠 색 */
function sweater(g: Grid, x0: number, y0: number, c: Color, pat?: Color): void {
  const lo = darken(c, 0.2);
  g.hline(x0, x0 + 8, y0, c);
  g.rect(x0 + 1, y0 + 1, 7, 7, c);
  g.vline(x0, y0 + 1, y0 + 6, lo);
  g.vline(x0 + 8, y0 + 1, y0 + 6, lo);
  for (let y = y0 + 1; y <= y0 + 6; y++) for (let x = x0 + 1; x <= x0 + 7; x++) if ((x + y) % 2 === 0 && x > x0 + 5) g.set(x, y, lo);
  g.hline(x0 + 3, x0 + 5, y0, darken(c, 0.35)); // 목둘레
  if (pat !== undefined) {
    // 노르딕 띠 (지그재그 + 가운데 줄)
    for (let x = x0; x <= x0 + 8; x++) {
      g.set(x, y0 + 2, x % 2 ? pat : c);
      g.set(x, y0 + 3, pat);
      g.set(x, y0 + 4, x % 2 ? c : pat);
    }
    g.set(x0 + 8, y0 + 3, darken(pat, 0.2));
  }
  g.hline(x0 + 1, x0 + 7, y0 + 7, lighten(c, 0.25)); // 고무단
  g.set(x0, y0 + 7, lighten(c, 0.25));
  g.set(x0 + 8, y0 + 7, lighten(c, 0.25));
}

/** 긴 목도리 (2칸 폭, 줄무늬 + 술) */
function scarfHang(g: Grid, x: number, y0: number, len: number, c: Color, c2: Color): void {
  for (let i = 0; i < len; i++) {
    const cc = Math.floor(i / 2) % 2 ? c2 : c;
    g.set(x, y0 + i, cc);
    g.set(x + 1, y0 + i, darken(cc, 0.15));
  }
  g.set(x, y0 + len, lighten(c2, 0.2));
  g.set(x + 1, y0 + len, lighten(c, 0.2));
}

/** 코트: 9칸 폭·긴 몸판, 깃 V·단추 둘. puffer면 가로 누빔 줄 */
function coat(g: Grid, x0: number, y0: number, len: number, c: Color, button: Color, puffer = false): void {
  const lo = darken(c, 0.2);
  g.hline(x0, x0 + 8, y0, c);
  g.rect(x0 + 1, y0 + 1, 7, len - 1, c);
  g.vline(x0, y0 + 1, y0 + len - 3, lo);
  g.vline(x0 + 8, y0 + 1, y0 + len - 3, lo);
  g.vline(x0 + 7, y0 + 1, y0 + len - 1, lo);
  if (puffer) {
    for (let y = y0 + 2; y < y0 + len; y += 3) g.hline(x0 + 1, x0 + 7, y, darken(c, 0.12));
    g.hline(x0 + 2, x0 + 6, y0, lighten(c, 0.35)); // 털 칼라
    g.vline(x0 + 4, y0 + 1, y0 + len - 1, darken(c, 0.25)); // 지퍼
  } else {
    // 깃 V
    g.set(x0 + 3, y0, darken(c, 0.35));
    g.set(x0 + 5, y0, darken(c, 0.35));
    g.set(x0 + 4, y0 + 1, darken(c, 0.35));
    g.set(x0 + 3, y0 + 1, lighten(c, 0.15));
    g.set(x0 + 5, y0 + 1, lighten(c, 0.15));
    g.set(x0 + 4, y0 + 3, button);
    g.set(x0 + 4, y0 + 6, button);
  }
  g.hline(x0 + 1, x0 + 7, y0 + len - 1, darken(c, 0.12));
}

/** 방울 털모자 (6칸) */
function beanie(g: Grid, x0: number, y0: number, c: Color, pom: Color): void {
  g.hline(x0 + 2, x0 + 3, y0, pom);
  g.hline(x0 + 1, x0 + 4, y0 + 1, c);
  g.rect(x0, y0 + 2, 6, 2, c);
  g.set(x0 + 5, y0 + 2, darken(c, 0.2));
  g.set(x0 + 5, y0 + 3, darken(c, 0.2));
  for (let x = x0; x < x0 + 6; x++) g.set(x, y0 + 4, x % 2 ? lighten(c, 0.3) : lighten(c, 0.18));
  g.set(x0 + 2, y0, lighten(pom, 0.4));
}

/** 벙어리장갑 한 켤레 (끈으로 이어 매단다) */
function mittens(g: Grid, x0: number, y0: number, c: Color): void {
  g.hline(x0 + 1, x0 + 4, y0, 0x4a3a30);
  for (const x of [x0, x0 + 4]) {
    g.rect(x, y0 + 1, 2, 3, c);
    g.set(x + 1, y0 + 2, darken(c, 0.2));
    g.set(x + 1, y0 + 3, darken(c, 0.2));
    g.set(x, y0 + 4, lighten(c, 0.4));
    g.set(x + 1, y0 + 4, lighten(c, 0.3));
  }
}

/** 귀마개 (머리띠 + 털 귀) */
function earmuffs(g: Grid, x0: number, y0: number, c: Color, band: Color): void {
  g.hline(x0 + 2, x0 + 4, y0, band);
  g.set(x0 + 1, y0 + 1, band);
  g.set(x0 + 5, y0 + 1, band);
  for (const x of [x0, x0 + 5]) {
    g.rect(x, y0 + 2, 2, 3, c);
    g.set(x, y0 + 2, lighten(c, 0.3));
  }
}

/** 개어 쌓은 옷 더미 (매대 위, y = 매대 윗면) */
function foldedStack(g: Grid, x0: number, y: number, colors: readonly Color[]): void {
  colors.forEach((c, i) => {
    const yy = y - 2 * (i + 1);
    g.hline(x0, x0 + 6, yy, lighten(c, 0.2));
    g.hline(x0, x0 + 6, yy + 1, c);
    g.set(x0 + 6, yy + 1, darken(c, 0.2));
  });
}

/** 매대 위 바구니 (짚 결) + 위로 삐죽 나온 양말·장갑 */
function basket(g: Grid, x0: number, y: number, tops: readonly Color[]): void {
  tops.forEach((c, i) => {
    g.set(x0 + 1 + i * 2, y - 4, c);
    g.set(x0 + 2 + i * 2, y - 4, darken(c, 0.15));
    g.set(x0 + 1 + i * 2, y - 5, lighten(c, 0.2));
  });
  for (let yy = y - 3; yy < y; yy++) for (let x = x0; x <= x0 + 7; x++) g.set(x, yy, (x + yy) % 2 ? 0xb88a50 : 0x9a6e3e);
  g.hline(x0, x0 + 7, y - 3, 0xd0a466);
}

/** 땅에 놓인 작은 보따리 (크림 무명 보자기에 남색 점 + 위로 묶은 겨자 귀 둘) */
function groundBundle(dst: Grid, cx: number, by: number): void {
  // 따로 그려 테를 두른 뒤 얹는다 (매대 앞에서도 모양이 갈리게)
  const g = new Grid(dst.w, dst.h);
  const c = CREAM;
  g.ellipse(cx + 0.5, by - 3, 4.4, 3.2, c.mid);
  g.rect(cx - 3, by - 2, 8, 2, c.mid);
  g.recolor((x, y) => y >= by - 6 && y <= by && x >= cx + 3 && Math.abs(x - cx) <= 6, c.lo);
  g.recolor((x, y) => y <= by - 5 && x <= cx && Math.abs(x - cx) <= 6 && y >= by - 7, c.hi);
  for (const [dx, dy] of [[-2, -3], [1, -2], [3, -4], [-1, -5], [-3, -1]] as const) g.set(cx + dx, by + dy, INDIGO.mid);
  // 위 매듭 (겨자 끈 + 귀 둘이 V로 벌어진다)
  g.set(cx, by - 7, MUSTARD.lo);
  g.set(cx + 1, by - 7, MUSTARD.lo);
  g.set(cx - 1, by - 8, MUSTARD.mid);
  g.set(cx - 2, by - 9, MUSTARD.hi);
  g.set(cx + 2, by - 8, MUSTARD.mid);
  g.set(cx + 3, by - 9, MUSTARD.lo);
  g.outline(OUT);
  dst.draw(g, 0, 0);
}

// ── 천막 (기본·겨울 공용) ──

const ROOF_TOP = 4;
const ROOF_EAVE = 15;
const ROOF_CX = 26;
const COUNTER_Y = 31;
const STALL_BASE = 44;

/** 줄 지는 천막 지붕 + 물결 처마 + 꼭대기 겨자 깃발 */
function tentTop(g: Grid): void {
  // 꼭대기 깃발 (작은 삼각 깃)
  g.vline(ROOF_CX, 0, ROOF_TOP - 1, WOOD.lo);
  g.hline(ROOF_CX + 1, ROOF_CX + 4, 0, MUSTARD.mid);
  g.hline(ROOF_CX + 1, ROOF_CX + 3, 1, MUSTARD.lo);
  g.set(ROOF_CX + 1, 2, MUSTARD.lo);
  // 지붕: 꼭대기에서 퍼지는 여덟 쪽 (왼쪽 위에서 빛)
  for (let y = ROOF_TOP; y <= ROOF_EAVE; y++) {
    const t = (y - ROOF_TOP) / (ROOF_EAVE - ROOF_TOP);
    const hw = Math.round(3 + Math.pow(t, 0.85) * 22);
    for (let x = ROOF_CX - hw; x < ROOF_CX + hw; x++) {
      const u = (x + 0.5 - ROOF_CX) / hw;
      const panel = Math.min(7, Math.floor((u + 1) * 4));
      const a = panel % 2 === 0;
      let c: Color = a ? INDIGO.mid : CREAM.mid;
      if (u > 0.5) c = a ? INDIGO.lo : CREAM.lo;
      else if (u < -0.55 || y <= ROOF_TOP + 1) c = a ? INDIGO.hi : CREAM.hi;
      g.set(x, y, c);
    }
  }
  // 처마 겨자 띠
  g.hline(ROOF_CX - 25, ROOF_CX + 24, ROOF_EAVE, MUSTARD.mid);
  g.hline(ROOF_CX + 12, ROOF_CX + 24, ROOF_EAVE, MUSTARD.lo);
  // 물결 처마 (6칸 한 쪽, 아래가 둥글게)
  for (let x = ROOF_CX - 25; x < ROOF_CX + 25; x++) {
    const k = (x - (ROOF_CX - 25)) % 6;
    const panel = Math.floor((x - (ROOF_CX - 25)) / 6);
    const c = panel % 2 ? CREAM.mid : INDIGO.mid;
    const shade = x > ROOF_CX + 12 ? darken(c, 0.15) : c;
    g.set(x, ROOF_EAVE + 1, shade);
    g.set(x, ROOF_EAVE + 2, shade);
    if (k >= 1 && k <= 4) g.set(x, ROOF_EAVE + 3, shade);
    if (k >= 2 && k <= 3) g.set(x, ROOF_EAVE + 4, darken(shade, 0.1));
  }
}

/** 물결 처마 맨 아래 칸 (x마다) */
function valanceBottom(x: number): number {
  const k = (x - (ROOF_CX - 25)) % 6;
  return ROOF_EAVE + (k >= 2 && k <= 3 ? 4 : k >= 1 && k <= 4 ? 3 : 2);
}

/** 기둥 둘 + 안쪽 어둠 벽 + 옷 막대 */
function tentFrame(g: Grid): void {
  g.rect(8, ROOF_EAVE + 1, 36, COUNTER_Y - ROOF_EAVE - 1, 0x2e2630);
  // 안쪽 벽 아래로 갈수록 살짝 밝게 (천막 안 따뜻한 빛)
  for (let y = ROOF_EAVE + 9; y < COUNTER_Y; y++) g.hline(8, 43, y, mix(0x2e2630, 0x5a4038, (y - ROOF_EAVE - 9) / 10));
  g.hline(8, 43, ROOF_EAVE + 5, WOOD.lo); // 옷 막대
  g.rect(5, ROOF_EAVE + 1, 2, STALL_BASE - ROOF_EAVE, WOOD.mid);
  g.vline(5, ROOF_EAVE + 1, STALL_BASE, WOOD.hi);
  g.rect(45, ROOF_EAVE + 1, 2, STALL_BASE - ROOF_EAVE, WOOD.lo);
  g.vline(45, ROOF_EAVE + 1, STALL_BASE, WOOD.mid);
}

/** 나무 매대 + 앞에 드리운 보자기 천 */
function counter(g: Grid, cloth: { c: Color; c2: Color; trim: Color }): void {
  g.rect(3, COUNTER_Y, 46, 2, WOOD.hi);
  g.hline(3, 48, COUNTER_Y, lighten(WOOD.hi, 0.25));
  g.rect(4, COUNTER_Y + 2, 44, STALL_BASE - COUNTER_Y - 1, WOOD.mid);
  for (let x = 8; x < 48; x += 5) g.vline(x, COUNTER_Y + 2, STALL_BASE, WOOD.lo);
  g.hline(4, 47, STALL_BASE, WOOD.lo);
  // 보자기 천 (가운데, 아래 물결)
  const x0 = 13;
  const x1 = 38;
  for (let y = COUNTER_Y + 2; y <= COUNTER_Y + 8; y++)
    for (let x = x0; x <= x1; x++) {
      const k = (x - x0) % 5;
      if (y === COUNTER_Y + 8 && (k === 0 || k === 4)) continue;
      let c = cloth.c;
      if ((x * 3 + y * 5) % 9 === 0) c = cloth.c2;
      if (x >= x1 - 4) c = darken(c, 0.12);
      g.set(x, y, c);
    }
  g.hline(x0, x1, COUNTER_Y + 2, cloth.trim);
  // 가운데 매화 무늬 하나
  const mx = 25;
  const my = COUNTER_Y + 5;
  g.set(mx, my, cloth.trim);
  g.set(mx - 1, my, cloth.c2);
  g.set(mx + 1, my, cloth.c2);
  g.set(mx, my - 1, cloth.c2);
  g.set(mx, my + 1, cloth.c2);
  // 술 (양 끝)
  for (const x of [x0, x1]) {
    g.vline(x, COUNTER_Y + 8, COUNTER_Y + 10, cloth.trim);
    g.set(x, COUNTER_Y + 11, darken(cloth.trim, 0.2));
  }
}

/** 종이 초롱 (매단 줄 + 둥근 몸 + 위아래 테) */
function paperLantern(g: Grid, cx: number, y0: number, string: number): StallLight {
  g.vline(cx, y0, y0 + string - 1, 0x3a3434);
  const y = y0 + string;
  g.hline(cx - 1, cx + 1, y, 0x5a2a2a);
  g.rect(cx - 2, y + 1, 5, 4, 0xe8503c);
  g.vline(cx - 2, y + 2, y + 3, 0xd8402c);
  g.rect(cx - 1, y + 1, 3, 4, 0xff8a5a);
  g.set(cx, y + 2, FLAME.hi);
  g.set(cx, y + 3, FLAME.mid);
  g.hline(cx - 1, cx + 1, y + 5, 0x5a2a2a);
  g.set(cx, y + 6, MUSTARD.mid);
  return { x: cx, y: y + 3, c: 0xffa860, big: true };
}

/** 겨울 작은 쇠 랜턴 (검은 테·유리 속 불빛·고리) */
function ironLantern(g: Grid, cx: number, y0: number, string: number): StallLight {
  g.vline(cx, y0, y0 + string - 1, 0x2a2a30);
  const y = y0 + string;
  g.set(cx, y, 0x3a3a44);
  g.hline(cx - 1, cx + 1, y + 1, 0x3a3a44);
  g.hline(cx - 2, cx + 2, y + 2, 0x2a2a34);
  g.rect(cx - 2, y + 3, 5, 4, 0x2a2a34);
  g.rect(cx - 1, y + 3, 3, 4, FLAME.mid);
  g.set(cx, y + 4, FLAME.hi);
  g.set(cx, y + 5, FLAME.hi);
  g.set(cx + 1, y + 6, FLAME.lo);
  g.hline(cx - 2, cx + 2, y + 7, 0x2a2a34);
  return { x: cx, y: y + 5, c: 0xffc070, big: true };
}

function defaultStall(): Drawn {
  const g = new Grid(SEASON_STALL_W, SEASON_STALL_H);
  tentFrame(g);
  const rod = ROOF_EAVE + 6;
  sweater(g, 9, rod, 0xd8643a);
  scarfHang(g, 19, rod, 9, CREAM.hi, 0xc8463c);
  coat(g, 22, rod, 10, 0xb8885a, 0x5a3a24);
  beanie(g, 32, rod, MUSTARD.mid, CREAM.hi);
  mittens(g, 38, rod - 1, 0x3a8a7a);
  tentTop(g);
  counter(g, { c: INDIGO.mid, c2: CREAM.hi, trim: MUSTARD.mid });
  foldedStack(g, 8, COUNTER_Y, [0x3a8a7a, CREAM.mid, 0xd8643a]);
  basket(g, 36, COUNTER_Y, [0xc8463c, MUSTARD.mid, 0x5a72b0]);
  const lights = [paperLantern(g, 2, ROOF_EAVE + 1, 3), paperLantern(g, 49, ROOF_EAVE + 1, 3)];
  groundBundle(g, 45, STALL_BASE);
  g.outline(OUT);
  shadow(g, 26, STALL_BASE + 1.5, 25, 2.4, 70);
  return { g, lights };
}

/** 천막 지붕에 소복한 눈 (외곽선 다음에 — 윗 테는 차가운 눈 윤곽으로) */
function roofSnow(g: Grid, seed: number): void {
  for (let x = 0; x < g.w; x++) {
    let yo = -1;
    for (let y = ROOF_TOP - 1; y <= ROOF_EAVE; y++)
      if (g.filled(x, y)) {
        yo = y;
        break;
      }
    if (yo < 0) continue;
    // 깃대 줄은 건너뛴다
    if (Math.abs(x - ROOF_CX) <= 1 && yo < ROOF_TOP) continue;
    const edge = x <= 1 || x >= g.w - 2;
    const d = edge ? 1 : 2 + Math.floor(hash2(x >> 1, 3, seed) * 2.6) + (Math.abs(x - ROOF_CX) < 8 ? 1 : 0);
    // 소복이 한 줄 더 (가운데 쪽만, 군데군데)
    const mound = !edge && Math.abs(x - ROOF_CX) > 2 && hash2(x >> 2, 7, seed) < 0.55;
    if (mound) {
      g.set(x, yo - 1, SNOW_EDGE);
      g.set(x, yo, SNOW.hi);
    } else g.set(x, yo, SNOW_EDGE);
    for (let k = 1; k <= d; k++) {
      const y = yo + k;
      if (y > ROOF_EAVE - 1) break;
      g.set(x, y, k === d ? SNOW.lo : k === 1 ? SNOW.hi : x > ROOF_CX + 12 ? SNOW.mid : hash2(x, y, seed) < 0.2 ? SNOW.mid : SNOW.hi);
    }
    // 눈 녹아 흐른 자국 (처마 쪽으로 한 칸)
    if (!edge && hash2(x, 11, seed) < 0.12 && yo + d + 1 < ROOF_EAVE) g.set(x, yo + d + 1, SNOW.shade);
  }
}

/** 물결 처마 아래 고드름 (외곽선 다음에 — 천막 안 어둠 앞에 반짝 걸린다) */
function icicles(g: Grid, seed: number): void {
  let last = -9;
  for (let x = ROOF_CX - 25; x < ROOF_CX + 25; x++) {
    if (x - last < 2 || hash2(x, 5, seed) < 0.38) continue;
    if ((x >= 4 && x <= 7) || (x >= 44 && x <= 47) || x <= 1 || x >= 50) continue; // 기둥·초롱 줄은 비운다
    last = x;
    const y = valanceBottom(x) + 1;
    const len = 1 + Math.floor(hash2(x, 9, seed) * 3.4);
    for (let k = 0; k < len; k++) g.set(x, y + k, k === len - 1 ? ICE.lo : k === 0 ? ICE.hi : ICE.mid);
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

function winterStall(): Drawn {
  const g = new Grid(SEASON_STALL_W, SEASON_STALL_H);
  tentFrame(g);
  const rod = ROOF_EAVE + 6;
  coat(g, 9, rod, 10, 0x8fb0c8, 0x3a4a5a, true); // 하늘색 누빔 패딩
  sweater(g, 19, rod, CREAM.hi, 0xc8463c); // 노르딕 스웨터
  scarfHang(g, 29, rod, 9, 0xc8463c, CREAM.hi);
  earmuffs(g, 32, rod, 0xf2b8c8, 0x8a6a8a);
  mittens(g, 38, rod - 1, 0x3a5a8a);
  tentTop(g);
  counter(g, { c: INDIGO.mid, c2: CREAM.hi, trim: MUSTARD.mid });
  foldedStack(g, 8, COUNTER_Y, [0x8fb0c8, CREAM.hi, 0xc8463c]);
  basket(g, 36, COUNTER_Y, [0xc8463c, 0x3a5a8a, CREAM.hi]);
  // 매대 위 솔가지 한 줌 + 빨간 열매 (겨울 장식)
  for (const [x, y, c] of [
    [17, COUNTER_Y - 1, GREEN.lo],
    [18, COUNTER_Y - 2, GREEN.mid],
    [19, COUNTER_Y - 1, GREEN.mid],
    [20, COUNTER_Y - 2, GREEN.lo],
    [21, COUNTER_Y - 1, GREEN.mid],
    [19, COUNTER_Y - 3, GREEN.hi],
  ] as const)
    g.set(x, y, c);
  g.set(19, COUNTER_Y - 2, RED.mid);
  const lights = [ironLantern(g, 2, ROOF_EAVE + 1, 2), ironLantern(g, 49, ROOF_EAVE + 1, 2)];
  groundBundle(g, 45, STALL_BASE);
  g.outline(OUT);
  roofSnow(g, 7);
  icicles(g, 13);
  // 랜턴 머리·보따리 위 눈 한 줌
  for (const cx of [2, 49]) {
    g.set(cx - 1, ROOF_EAVE + 4, SNOW.hi);
    g.set(cx, ROOF_EAVE + 3, SNOW.hi);
    g.set(cx + 1, ROOF_EAVE + 4, SNOW.mid);
  }
  // 보따리 어깨 위 눈
  for (const [x, y, c] of [
    [42, STALL_BASE - 6, SNOW.hi],
    [43, STALL_BASE - 6, SNOW.hi],
    [41, STALL_BASE - 5, SNOW.mid],
    [47, STALL_BASE - 6, SNOW.mid],
    [48, STALL_BASE - 5, SNOW.lo],
  ] as const)
    g.set(x, y, c);
  topSnow(g, COUNTER_Y + 2, STALL_BASE, 31, 0.1);
  // 매대 끝 눈 (천막 밖으로 나온 모서리)
  for (const x of [3, 4, 47, 48]) {
    g.set(x, COUNTER_Y - 1, SNOW.hi);
    g.set(x, COUNTER_Y - 2, SNOW_EDGE);
  }
  snowDrift(g, 5, STALL_BASE + 1, 6, 2);
  snowDrift(g, 30, STALL_BASE + 1, 4, 1);
  shadow(g, 26, STALL_BASE + 1.5, 25, 2.4, 60);
  return { g, lights };
}

// ── 크리스마스: 사탕 지팡이 기둥 + 전구 꽃줄 + 빨간 썰매 매대 ──

const X_TOP = 2;
const X_GARLAND = 6;
const X_ROD = 12;
const SLED_TOP = 30;
const SLED_BOT = 40;
const RUNNER = 43;
/** 사탕 지팡이 기둥은 썰매 안에 꽂혀 있다 (아래는 몸통에 가린다) */
const CANE_L = 13;
const CANE_R = 40;

/** 사탕 지팡이 기둥 (dir = 고리가 휘는 쪽) */
function candyCane(g: Grid, x: number, dir: -1 | 1): void {
  const stripe = (xx: number, yy: number) => (Math.floor((yy - xx * dir + 40) / 2) % 2 ? RED.mid : CREAM.hi);
  for (let y = X_TOP + 2; y <= SLED_BOT; y++) {
    g.set(x, y, stripe(x, y));
    g.set(x + 1, y, darken(stripe(x + 1, y), 0.15));
  }
  // 고리 (바깥으로 휜 반원, 두 칸 굵기)
  const pts: [number, number][] = [
    [0, 1],
    [0, 0],
    [dir, -1],
    [2 * dir, -1],
    [3 * dir, 0],
    [3 * dir, 1],
    [3 * dir, 2],
  ];
  for (const [dx, dy] of pts) {
    const xx = x + dx;
    g.set(xx, X_TOP + 1 + dy, stripe(xx, X_TOP + 1 + dy));
    g.set(xx + 1, X_TOP + 1 + dy, darken(stripe(xx + 1, X_TOP + 1 + dy), 0.1));
  }
}

/** 늘어진 솔잎 꽃줄 + 전구 (x0~x1, 가운데가 sag만큼 처진다) */
function garland(g: Grid, x0: number, x1: number, y: number, sag: number, lights: StallLight[]): void {
  let n = 0;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / (x1 - x0);
    const yy = Math.round(y + sag * 4 * t * (1 - t));
    for (let k = -1; k <= 1; k++) g.set(x, yy + k, k === -1 ? GREEN.mid : k === 0 ? ((x * 7) % 3 ? GREEN.lo : GREEN.mid) : GREEN.deep);
    if (hash2(x, 1, 3) < 0.3) g.set(x, yy - 2, GREEN.lo);
    if ((x - x0) % 4 === 2 && x > x0 + 2 && x < x1 - 2) {
      const c = BULB_COLORS[n++ % BULB_COLORS.length];
      g.set(x, yy + 2, c);
      g.set(x, yy + 3, darken(c, 0.25));
      lights.push({ x, y: yy + 2, c, big: false });
    }
  }
}

/** 리본 매듭 (가운데 cx, 위 y) */
function bow(g: Grid, cx: number, y: number, c: Color): void {
  g.rect(cx - 3, y, 2, 2, c);
  g.rect(cx + 2, y, 2, 2, darken(c, 0.15));
  g.set(cx - 2, y - 1, lighten(c, 0.2));
  g.set(cx + 2, y - 1, c);
  g.rect(cx - 1, y, 3, 2, darken(c, 0.25));
  g.set(cx, y, lighten(c, 0.3));
  g.set(cx - 1, y + 2, c);
  g.set(cx - 2, y + 3, darken(c, 0.15));
  g.set(cx + 1, y + 2, darken(c, 0.15));
  g.set(cx + 2, y + 3, darken(c, 0.25));
}

/** 선물 상자 (리본 십자 + 위 매듭) */
function gift(g: Grid, x0: number, y0: number, w: number, h: number, c: Color, rib: Color): void {
  g.rect(x0, y0, w, h, c);
  g.vline(x0 + w - 1, y0, y0 + h - 1, darken(c, 0.2));
  g.hline(x0, x0 + w - 1, y0, lighten(c, 0.2));
  const rx = x0 + Math.floor(w / 2);
  g.vline(rx, y0, y0 + h - 1, rib);
  g.hline(x0, x0 + w - 1, y0 + Math.floor(h / 2), rib);
  g.set(rx - 1, y0 - 1, rib);
  g.set(rx + 1, y0 - 1, darken(rib, 0.15));
  g.set(rx, y0 - 1, lighten(rib, 0.3));
}

/** 엘프 튜닉 (초록 몸판·빨간 지그재그 깃·금 허리띠) */
function elfTunic(g: Grid, x0: number, y0: number): void {
  coat(g, x0, y0, 10, GREEN.mid, GOLD.mid);
  for (let x = x0 + 1; x <= x0 + 7; x++) g.set(x, y0 + 1, x % 2 ? RED.mid : RED.hi);
  g.set(x0 + 4, y0 + 2, RED.mid);
  g.hline(x0 + 1, x0 + 7, y0 + 6, 0x2a2018);
  g.set(x0 + 4, y0 + 6, GOLD.hi);
  for (let x = x0 + 1; x <= x0 + 7; x++) if (x % 2) g.set(x, y0 + 10, GREEN.mid);
}

/** 엘프 모자 (뾰족 초록 고깔 + 빨간 단 + 끝 방울) */
function elfHat(g: Grid, x0: number, y0: number): void {
  const rows: [number, number][] = [
    [3, 1],
    [2, 2],
    [1, 3],
    [1, 4],
    [0, 6],
  ];
  rows.forEach(([dx, w], i) => g.hline(x0 + dx, x0 + dx + w - 1, y0 + 1 + i, i === 4 ? RED.mid : i % 2 ? GREEN.lo : GREEN.mid));
  g.set(x0 + 5, y0, GOLD.mid);
  g.set(x0 + 4, y0 + 1, GREEN.mid);
  g.hline(x0, x0 + 5, y0 + 5, RED.hi);
  g.set(x0 + 5, y0 + 5, RED.lo);
}

/** 빨간 망토 (흰 털 단) */
function cape(g: Grid, x0: number, y0: number): void {
  g.hline(x0 + 2, x0 + 6, y0, CREAM.hi);
  for (let i = 1; i <= 8; i++) {
    const w = 5 + Math.floor(i / 2);
    const l = x0 + 4 - Math.floor(w / 2);
    g.hline(l, l + w - 1, y0 + i, i === 8 ? CREAM.hi : RED.mid);
    g.set(l + w - 1, y0 + i, i === 8 ? CREAM.lo : RED.lo);
  }
  g.set(x0 + 4, y0 + 1, GOLD.mid);
}

/** 굵은 붓 한 점 (r = 반지름) */
function dab(g: Grid, x: number, y: number, r: number, c: Color): void {
  g.ellipse(x + 0.5, y + 0.5, r, r, c);
}

/** 썰매 몸통의 왼쪽 경계 (아래 앞이 둥글게 들어간다) */
function sledLeft(y: number): number {
  const t = Math.max(0, (y - SLED_TOP) / (SLED_BOT - SLED_TOP));
  return 11 + Math.round(Math.pow(t, 2) * 4);
}

function sleigh(g: Grid): void {
  // 몸통
  for (let y = SLED_TOP; y <= SLED_BOT; y++) {
    const l = sledLeft(y);
    const r = 46 - (y === SLED_BOT ? 1 : 0);
    for (let x = l; x <= r; x++) {
      let c: Color = RED.mid;
      if (y <= SLED_TOP + 1) c = RED.hi;
      else if (y >= SLED_BOT - 1 || x >= r - 2) c = RED.lo;
      g.set(x, y, c);
    }
  }
  // 뒤 등받이 (오른쪽이 높고 둥글다)
  for (let y = 22; y < SLED_TOP; y++)
    for (let x = 40; x <= 47; x++) {
      if (y === 22 && (x <= 41 || x >= 47)) continue;
      if (y === 23 && x === 40) continue;
      g.set(x, y, x >= 46 ? RED.lo : y <= 23 ? RED.hi : RED.mid);
    }
  // 앞 백조 목 (몸통 앞에서 왼쪽 위로 휘어 올라 안으로 말린다)
  const neck: [number, number, number][] = [
    [12, 31, 2],
    [10, 29, 2],
    [8, 27, 2],
    [6, 25, 2],
    [5, 23, 1.8],
    [5, 21, 1.6],
    [6, 19, 1.5],
    [8, 18, 1.4],
    [10, 18, 1.3],
    [11, 20, 1.1],
  ];
  for (const [x, y, r] of neck) dab(g, x, y, r, RED.mid);
  // 목 바깥쪽 밝게, 말린 안쪽은 어둡게
  g.recolor((x, y) => y >= 17 && y <= 30 && x <= 12 && !g.filled(x - 1, y - 1), RED.hi);
  g.set(9, 20, RED.deep);
  g.set(9, 19, RED.lo);
  // 금 테: 몸통 윗단·아랫단, 등받이 테, 목을 따라 한 줄
  for (let x = sledLeft(SLED_TOP + 2); x <= 45; x++) g.set(x, SLED_TOP + 2, GOLD.mid);
  for (let x = sledLeft(SLED_BOT - 3); x <= 45; x++) g.set(x, SLED_BOT - 3, GOLD.lo);
  for (let y = 23; y <= SLED_TOP + 1; y++) g.set(41, y, GOLD.mid);
  for (const [x, y] of [
    [11, 31],
    [10, 30],
    [9, 29],
    [8, 28],
    [7, 27],
    [6, 26],
    [6, 25],
    [5, 24],
    [5, 23],
    [5, 22],
    [5, 21],
    [6, 20],
    [6, 19],
    [7, 18],
  ] as const)
    g.set(x + 1, y, GOLD.mid);
  // 옆판 금 소용돌이 무늬 + 금 징
  const swirl: [number, number][] = [
    [22, 35],
    [23, 34],
    [24, 34],
    [25, 35],
    [25, 36],
    [24, 36],
    [27, 35],
    [28, 34],
    [29, 34],
    [30, 35],
    [30, 36],
    [29, 36],
    [26, 35],
    [26, 36],
  ];
  for (const [x, y] of swirl) g.set(x, y, GOLD.mid);
  g.set(26, 34, GOLD.hi);
  for (const x of [16, 36]) g.set(x, 35, GOLD.lo);
  // 버팀대
  for (const x of [15, 27, 39]) g.vline(x, SLED_BOT + 1, RUNNER - 1, GOLD.lo);
  // 썰매 날 (앞 끝이 둥글게 말려 오른다)
  g.hline(6, 48, RUNNER, GOLD.mid);
  g.hline(10, 44, RUNNER, GOLD.hi);
  for (const [x, y] of [
    [5, RUNNER],
    [4, RUNNER - 1],
    [3, RUNNER - 2],
    [3, RUNNER - 3],
    [4, RUNNER - 4],
    [5, RUNNER - 4],
  ] as const)
    g.set(x, y, GOLD.mid);
  g.set(49, RUNNER - 1, GOLD.mid);
}

function christmasStall(): Drawn {
  const g = new Grid(SEASON_STALL_W, SEASON_STALL_H);
  const lights: StallLight[] = [];
  candyCane(g, CANE_L, -1);
  candyCane(g, CANE_R, 1);
  // 옷 막대 (금빛) + 걸린 옷: 엘프 튜닉·빨간 망토·엘프 모자
  g.hline(CANE_L + 2, CANE_R - 1, X_ROD, GOLD.mid);
  elfTunic(g, 15, X_ROD + 1);
  cape(g, 24, X_ROD + 1);
  elfHat(g, 34, X_ROD + 1);
  garland(g, CANE_L, CANE_R + 1, X_GARLAND, 3, lights);
  bow(g, 27, X_GARLAND + 2, RED.mid);
  // 리본 아래 금 방울 둘
  for (const x of [25, 29]) {
    g.set(x, X_GARLAND + 6, GOLD.hi);
    g.set(x, X_GARLAND + 7, GOLD.mid);
    g.set(x + 1, X_GARLAND + 7, GOLD.lo);
  }
  // 썰매 안 선물 (썰매보다 먼저 그려 아래가 몸통에 가린다)
  gift(g, 14, 25, 7, 6, GREEN.mid, RED.hi);
  gift(g, 21, 23, 8, 8, CREAM.hi, RED.mid);
  gift(g, 29, 26, 6, 5, 0x3a6ec8, GOLD.mid);
  gift(g, 34, 24, 6, 7, GOLD.mid, GREEN.mid);
  sleigh(g);
  g.outline(OUT);
  // 눈 (꽃줄 위·고리 위·선물 위·썰매 테)
  topSnow(g, 1, SLED_TOP + 1, 21, 0.3);
  snowDrift(g, 3, RUNNER + 1, 4, 2);
  snowDrift(g, 49, RUNNER + 1, 3, 1);
  shadow(g, 26, RUNNER + 2, 24, 2.2, 60);
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

/** 계절 보따리상 노점 (52×48, 원점 바닥 가운데) */
export function seasonStall(concept: MapConcept = "default"): HTMLCanvasElement {
  return drawn(concept).g.toCanvas();
}

/** 노점 불빛 자리 (초롱·랜턴·전구) */
export function seasonStallLights(concept: MapConcept = "default"): readonly StallLight[] {
  return drawn(concept).lights;
}

/**
 * 노점 불빛 겹 (가산 섞기로 위에 얹는다): 노점과 같은 크기 두 장을 가로로. 초롱은 은은히 일렁이고, 전구는 절반씩 번갈아 밝다.
 * 밤에만 보이게 쓰는 쪽에서 알파를 조절한다.
 */
export function seasonStallGlowSheet(concept: MapConcept = "default"): HTMLCanvasElement {
  const W = SEASON_STALL_W;
  const H = SEASON_STALL_H;
  const { canvas, ctx } = makeCanvas(W * 2, H);
  const lights = seasonStallLights(concept);
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

// ── 보따리상 NPC ──

/** 보자기 무늬 점 (사선 격자) */
const dotAt = (x: number, y: number) => (x * 3 + y * 5) % 11 === 0;

/** 큰 보따리 (등 뒤 — 머리 위로 둥글게 솟고 꼭대기에 매듭 귀 둘). 따로 그려 외곽선을 두른다 */
function bigBundle(b: number, cloth: { hi: Color; mid: Color; lo: Color; dot: Color }, snowy: boolean, knot: { hi: Color; mid: Color; lo: Color } = cloth): Grid {
  const g = new Grid(SEASON_PEDDLER_W, SEASON_PEDDLER_H);
  const cy = 13.5 + b;
  g.ellipse(15, cy, 12.6, 8.6, cloth.mid);
  // 왼쪽 위에서 빛, 오른쪽·아래는 그늘
  g.recolor((x, y) => (x - 15) * 0.6 + (y - cy) < -5, cloth.hi);
  g.recolor((x, y) => x > 23 || y > cy + 5.5, cloth.lo);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.filled(x, y) && dotAt(x, y - b)) g.set(x, y, cloth.dot);
  // 꼭대기 매듭 + V로 벌어진 귀 둘
  const ky = 4 + b;
  g.rect(14, ky, 3, 2, knot.lo);
  g.set(15, ky, knot.mid);
  for (const [x, y, c] of [
    [13, ky - 1, knot.mid],
    [12, ky - 2, knot.hi],
    [11, ky - 3, knot.hi],
    [12, ky - 3, knot.mid],
    [17, ky - 1, knot.mid],
    [18, ky - 2, knot.mid],
    [19, ky - 3, knot.lo],
    [18, ky - 3, knot.mid],
  ] as const)
    g.set(x, y, c);
  g.outline(NPC_OUT);
  if (snowy) {
    // 보따리 어깨 위 눈 (매듭 둘레는 비운다)
    for (let x = 4; x <= 26; x++) {
      if (x >= 10 && x <= 20) continue;
      let y = 0;
      while (y < g.h && !g.filled(x, y)) y++;
      if (y >= g.h - 1) continue;
      g.set(x, y, SNOW_EDGE);
      g.set(x, y + 1, x > 22 ? SNOW.lo : SNOW.hi);
      if (x > 5 && x < 9) g.set(x, y + 2, SNOW.mid);
    }
  }
  return g;
}

/** 패랭이 (대나무 갓 + 양옆 하얀 목화송이). y = 갓 꼭대기 줄 */
function paraengi(g: Grid, y: number, snowy: boolean): void {
  const straw = { hi: 0xe8c890, mid: 0xc89a5a, lo: 0x9a7040 };
  g.hline(12, 18, y, straw.hi);
  g.rect(11, y + 1, 9, 2, straw.mid);
  g.recolor((x, yy) => yy >= y + 1 && yy <= y + 2 && x >= 17 && x <= 19, straw.lo);
  g.hline(11, 19, y + 3, 0x3a2a22); // 끈 띠
  g.hline(7, 23, y + 4, straw.mid);
  g.hline(8, 22, y + 5, straw.lo);
  g.set(7, y + 4, straw.hi);
  for (let x = 9; x <= 21; x += 3) g.set(x, y + 4, straw.hi);
  // 목화송이
  for (const cx of [10, 20]) {
    const o = cx < 15 ? -1 : 1;
    g.set(cx, y + 1, CREAM.hi);
    g.set(cx + o, y + 1, CREAM.mid);
    g.set(cx, y + 2, CREAM.mid);
    g.set(cx + o, y + 2, CREAM.lo);
  }
  if (snowy) {
    g.hline(12, 18, y - 1, SNOW.hi);
    g.set(13, y - 1, SNOW.mid);
    g.hline(8, 10, y + 3, SNOW.hi);
    g.hline(20, 22, y + 3, SNOW.mid);
  }
}

/** 보따리상: 30×32. frame 0·1 = 숨쉬기 (위 몸이 한 칸 내려앉고 자락이 일렁인다) */
export function seasonPeddler(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const b = frame ? 1 : 0;
  const xmas = concept === "christmas";
  const winter = concept === "winter";
  // 크리스마스엔 보따리가 초록 선물 자루 (금 점 + 빨간 리본 매듭 — 산타 모자와 겹쳐도 갈린다)
  const cloth = xmas ? { hi: GREEN.hi, mid: GREEN.mid, lo: GREEN.lo, dot: GOLD.mid } : { hi: INDIGO.hi, mid: INDIGO.mid, lo: INDIGO.lo, dot: CREAM.hi };
  const back = bigBundle(b, cloth, concept !== "default", xmas ? RED : cloth);

  const g = new Grid(SEASON_PEDDLER_W, SEASON_PEDDLER_H);
  const body = 0xf0ebe0;
  const shade = darken(body, 0.16);
  const hy = 17 + b; // 머리 가운데
  // 유령 몸 (머리 + 몸 + 물결 자락)
  g.ellipse(15, hy, 6, 6.2, body);
  g.rect(9, hy, 13, 27 - hy, body);
  for (let x = 9; x <= 21; x++) if ((x + frame) % 3 !== 0) g.set(x, 27, body);
  g.recolor((x, y) => x >= 19 && y > hy - 3, shade);
  g.recolor((x, y) => y >= 26 && x >= 17, shade);
  // 눈·볼·입
  for (const ex of [13, 17]) {
    g.set(ex, hy, 0x1a1620);
    g.set(ex, hy + 1, 0x1a1620);
  }
  g.set(12, hy + 2, 0xf0a0a8);
  g.set(18, hy + 2, 0xf0a0a8);
  g.set(15, hy + 3, 0x8a4a50);
  // 목도리 (겨울·크리스마스)
  if (winter) seasonScarf(g, 9, 21, hy + 5, { c: 0xc8463c, thick: true, tail: 10 });
  else if (xmas) seasonScarf(g, 9, 21, hy + 5, { c: RED.mid, c2: CREAM.hi, pat: "stripe", thick: true, tail: 10 });
  // 보따리 멜끈 (어깨 → 가슴 앞 매듭)
  const strap = cloth.lo;
  line(g, 10, hy + 4, 13, hy + 7, strap);
  line(g, 20, hy + 4, 17, hy + 7, strap);
  g.rect(14, hy + 6, 3, 2, cloth.mid);
  g.set(14, hy + 6, cloth.hi);
  g.set(13, hy + 8, cloth.mid);
  g.set(17, hy + 8, cloth.lo);
  if (xmas) seasonHolly(g, 15, hy + 6);
  // 지팡이 + 끝에 매단 작은 초롱
  const sy = hy - 4;
  g.vline(24, sy, 28, 0x7a5a3a);
  g.vline(25, sy, sy + 1, 0x7a5a3a);
  g.set(26, sy + 1, 0x7a5a3a);
  g.set(26, sy + 2, 0x3a3434);
  g.rect(25, sy + 3, 3, 3, 0xe8503c);
  g.set(26, sy + 4, FLAME.hi);
  g.set(26, sy + 3, FLAME.mid);
  g.hline(25, 27, sy + 6, 0x5a2a2a);
  // 지팡이 잡은 손
  if (concept === "default") {
    g.set(22, hy + 4, body);
    g.set(23, hy + 4, body);
    g.set(23, hy + 5, shade);
  } else seasonMitt(g, 22, hy + 3, winter ? 0x3a5a8a : RED.mid);
  if (!xmas) paraengi(g, hy - 9, winter);
  g.outline(NPC_OUT);
  if (xmas) {
    // 산타 모자 (패랭이 대신) — 따로 테를 둘러 얹는다
    const hat = new Grid(SEASON_PEDDLER_W, SEASON_PEDDLER_H);
    seasonHat(hat, 15, hy, 6, hy - 6, { kind: "santa" });
    hat.outline(NPC_OUT);
    g.draw(hat, 0, 0);
  }
  // 보따리 위에 유령을 얹는다
  back.draw(g, 0, 0);
  shadow(back, 15, 29.5, 8, 1.3, 50);
  return back.toCanvas();
}

/** 보따리상 초롱 자리 (그림 왼쪽 위 기준) */
export function seasonPeddlerLight(frame: number): StallLight {
  return { x: 26, y: 17 + (frame ? 1 : 0), c: 0xffa860, big: true };
}

/** 두 프레임을 가로로 붙인 시트 (60×32) */
export function seasonPeddlerSheet(concept: MapConcept = "default"): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(SEASON_PEDDLER_W * 2, SEASON_PEDDLER_H);
  for (let f = 0; f < 2; f++) ctx.drawImage(seasonPeddler(f, concept), f * SEASON_PEDDLER_W, 0);
  return canvas;
}
