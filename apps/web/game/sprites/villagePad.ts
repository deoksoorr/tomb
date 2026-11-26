import { BENCH_TEX_PAD_TOP } from "./props";
import { GY } from "./graveyardProps";
import { GRAVE_MOUND_H, GRAVE_STONE_H } from "./graves";
import type { GraveShape } from "../graveShape";
import { Grid } from "./pixel";
import { WP } from "./worldProps";

// 11/26 운영자 「나무 도트 잘린 게 중간중간 있다」 (캠핑장 → 마을까지): 마을 소품 그림이 캔버스 끝 열·맨 윗줄까지 칠해져
// 윤곽이 캔버스 밖으로 나가 잘리거나(지붕 처마·벤치 판 끝·석등 지붕), 맵 확대가 소수 배율일 때 끝 열이 반만 그려졌다.
// 그림 함수(아이콘·다른 장면도 같이 쓴다)는 그대로 두고, 맵 텍스처로 등록할 때(manifest) 둘레에 빈 칸을 두르고 끝에 닿은 칠은
// 그 그림의 윤곽 색으로 닫는다. 원점이 바닥 가운데(0.5, 1)인 그림은 좌우 같은 폭·위만(아래 0) 넓혀 맵 자리가 픽셀 그대로다.
// 원점이 다른 그림(묘비 꾸미기)은 원점이 가리키는 점이 그대로 오게 넓히거나(가운데 원점 = 위아래 같은 폭), 쓰는 쪽(Grave.ts)이 여백만큼 옮긴다.

/** 둘레 여백 (x = 좌우 각각, top·bottom) + 끝을 닫는 윤곽 색·알파 (alpha 0 = 닫지 않고 빈 칸만 — 윤곽 없는 풀·불꽃·무지개) */
export type VPad = { x: number; top: number; bottom: number; line: number; alpha?: number };

const OUT = 0x1f1d1a; // props·worldProps 윤곽
const WOOD_LINE = 0x2e2219;
const STONE_LINE = 0x3a3934;
const GY_OUT = 0x1c1a1a;
const EX_OUT = 0x1d1b1a; // extras 윤곽
const GRAVE_OUT = 0x2b2a27;

const up = (x: number, line: number, alpha?: number): VPad => ({ x, top: 2, bottom: 0, line, alpha });
const side = (x: number, line: number, alpha?: number): VPad => ({ x, top: 0, bottom: 0, line, alpha });

/** 묘비 둘레 여백 (모든 모양 같음 — 꾸미기·빛 자리는 받침 기준 월드 좌표라 그대로, 원점만 graveTexOriginY) */
export const GRAVE_TEX_PAD = { x: 2, top: 3, bottom: 0 } as const; // 위 3 — 눈판(snowWorldTextures) 꼭대기 눈 윤곽이 닫은 윤곽 위로 한 줄 더
/** 묘비 텍스처 원점 y (받침 줄 — 위 여백만큼 아래로) */
export function graveTexOriginY(shape: GraveShape): number {
  const sh = GRAVE_STONE_H[shape];
  return (GRAVE_TEX_PAD.top + sh) / (GRAVE_TEX_PAD.top + sh + GRAVE_MOUND_H + GRAVE_TEX_PAD.bottom);
}
const GRAVE_LINE: Readonly<Record<string, number>> = { server: 0x111216, crystal: 0x3a3a5a, gold: 0x5a4410 };
/** 꽃다발 (원점 위 가운데 — 위 한 줄 넓힌 만큼 Grave.ts가 한 줄 올려 놓는다) */
export const FLOWERS_TEX_PAD: VPad = { x: 0, top: 2, bottom: 2, line: 0x3a2e10, alpha: 220 };
/** 내 묘비 깃발 (원점 x 0.15 — 넓힌 뒤 원점 x는 mineFlagOriginX) */
export const MINE_FLAG_TEX_PAD: VPad = { x: 2, top: 2, bottom: 0, line: 0x2a2620 };
export const MINE_FLAG_W = 8;
export const MINE_FLAG_ORIGIN_X = (0.15 * MINE_FLAG_W + MINE_FLAG_TEX_PAD.x) / (MINE_FLAG_W + MINE_FLAG_TEX_PAD.x * 2);
/** 묘비 리본 (원점 위 가운데 — 위 한 줄 넓힌 만큼 Grave.ts가 한 줄 올려 놓는다) */
export const RIBBON_TEX_PAD: VPad = { x: 0, top: 1, bottom: 0, line: EX_OUT, alpha: 0 };
/** 벤치 뒤에서 본 그림 (WorldMap 등받이 앞 조각 BENCH_UP_BACK_ROW는 이 위 여백만큼 내려 쓴다 — props.ts) */
export const BENCH_TEX_PAD: VPad = { x: 2, top: BENCH_TEX_PAD_TOP, bottom: 0, line: WOOD_LINE };
/** 가로등 (크리스마스 리본·리스 자리 xmasLamp는 이 위 여백만큼 옮긴다) */
export const STREET_LAMP_TEX_PAD: VPad = up(0, OUT);
/** 유령 잡화점 오두막 (크리스마스 문 리스·처마 전구 자리 HUT_DRESS는 이 여백만큼 옮긴다) */
export const SHOP_HUT_TEX_PAD: VPad = { x: 2, top: 3, bottom: 0, line: EX_OUT }; // 위 3 — 눈판 지붕 눈 윤곽이 닫은 윤곽 위로 한 줄 더
/** 둥근 나무 (겨울판 눈 나무 snowyRoundTree도 같은 여백) */
export const TREE_TEX_PAD: VPad = up(0, OUT);
/** 겨울 꽃밭 (호랑가시) */
export const HOLLY_TEX_PAD: VPad = { x: 1, top: 1, bottom: 0, line: 0x55606c, alpha: 200 };

/** 텍스처 키 → 여백 (여기 없는 텍스처는 그대로) */
export const VILLAGE_TEX_PAD: Readonly<Record<string, VPad>> = {
  "prop-tree-0": TREE_TEX_PAD,
  "prop-tree-1": TREE_TEX_PAD,
  "prop-dead-0": up(0, OUT),
  "prop-dead-1": up(0, OUT),
  "prop-lantern": up(2, STONE_LINE),
  "prop-bench-2": BENCH_TEX_PAD,
  "prop-bench-3": BENCH_TEX_PAD,
  "prop-bench-4": BENCH_TEX_PAD,
  "prop-bench-2-up": BENCH_TEX_PAD,
  "prop-bench-3-up": BENCH_TEX_PAD,
  "prop-bench-4-up": BENCH_TEX_PAD,
  "prop-chair-down": up(1, WOOD_LINE),
  "prop-chair-left": up(1, WOOD_LINE),
  "prop-chair-right": up(1, WOOD_LINE),
  "prop-table": up(1, STONE_LINE),
  "prop-altar": up(2, STONE_LINE),
  "prop-gate": up(2, OUT),
  "decor-wreath": { x: 2, top: 2, bottom: 2, line: 0x22301e, alpha: 160 },
  "decor-ribbon": RIBBON_TEX_PAD,
  "decor-lantern": up(2, STONE_LINE),
  "decor-ghostcat": { x: 2, top: 2, bottom: 0, line: 0x8aa0b4, alpha: 140 },
  "decor-rainbow": side(1, 0, 0),
  "decor-butterfly": { x: 1, top: 1, bottom: 1, line: 0, alpha: 0 },
  "decor-snowman": up(2, 0x6a7a94, 200),
  "decor-flowerpot": up(1, EX_OUT, 170),
  "shop-hut": SHOP_HUT_TEX_PAD,
  "grave-mine-flag": MINE_FLAG_TEX_PAD,
  [WP.autumn0]: TREE_TEX_PAD,
  [WP.autumn1]: TREE_TEX_PAD,
  [WP.blossom0]: TREE_TEX_PAD,
  [WP.blossom1]: TREE_TEX_PAD,
  [WP.maple0]: TREE_TEX_PAD,
  [WP.maple1]: TREE_TEX_PAD,
  [WP.ginkgo0]: TREE_TEX_PAD,
  [WP.ginkgo1]: TREE_TEX_PAD,
  [WP.shrineTree]: TREE_TEX_PAD,
  [WP.pine0]: up(1, OUT),
  [WP.pine1]: up(1, OUT),
  [WP.snowPine0]: up(1, OUT),
  [WP.snowPine1]: up(1, OUT),
  [WP.bush0]: side(1, OUT),
  [WP.bush1]: side(1, OUT),
  [WP.bush2]: side(1, OUT),
  [WP.well]: up(1, OUT),
  [WP.swing]: up(1, WOOD_LINE),
  [WP.bell]: up(2, OUT),
  [WP.cairn0]: up(1, STONE_LINE),
  [WP.cairn1]: up(1, STONE_LINE),
  [WP.mushroom0]: side(2, OUT, 200),
  [WP.mushroom1]: side(2, OUT, 200),
  [WP.scarecrow]: up(1, OUT),
  [WP.reeds0]: side(1, 0, 0),
  [WP.reeds1]: side(1, 0, 0),
  [WP.jar]: up(1, OUT),
  [WP.cave]: side(1, OUT),
  [WP.logSeat]: up(1, WOOD_LINE),
  [WP.stumpSeat]: up(1, WOOD_LINE),
  [WP.boat]: side(2, WOOD_LINE),
  [WP.pumpkin0]: up(1, OUT),
  [WP.pumpkin1]: up(1, OUT),
  [WP.lamp]: STREET_LAMP_TEX_PAD,
  [GY.old0]: side(1, GY_OUT),
  [GY.old1]: side(1, GY_OUT),
  [GY.old2]: side(1, GY_OUT),
  [GY.old3]: side(1, GY_OUT),
  [GY.old4]: side(1, GY_OUT),
  [GY.crypt]: up(1, GY_OUT),
  // 가로 울타리는 이어 붙이는 조각 (좌우 끝은 옆 조각과 이어진다 — 위만)
  [GY.fenceH]: up(0, GY_OUT, 200),
  [GY.fenceV]: side(1, GY_OUT, 200),
  [GY.fencePost]: up(2, GY_OUT),
  // 큰 모닥불 불꽃 (프레임마다 위 한 줄 — 불꽃 끝은 윤곽 없이)
  [GY.bigFire]: { x: 0, top: 1, bottom: 0, line: 0, alpha: 0 },
};

/** 묘비 텍스처 키(grave-모양-변형)의 여백 */
export function graveTexPad(key: string): VPad | null {
  const m = /^grave-([A-Za-z0-9]+)-\d+$/.exec(key);
  if (!m || m[1] === "mine" || m[1] === "plot" || m[1] === "up") return null;
  return { ...GRAVE_TEX_PAD, line: GRAVE_LINE[m[1]] ?? GRAVE_OUT };
}
export function flowersTexPad(key: string): VPad | null {
  return /^flowers-\d+$/.test(key) ? FLOWERS_TEX_PAD : null;
}
/** 이 텍스처 키의 여백 (없으면 null) */
export function villageTexPad(key: string): VPad | null {
  return VILLAGE_TEX_PAD[key] ?? graveTexPad(key) ?? flowersTexPad(key);
}

/**
 * 마을 그림 윤곽 색 (그림마다 따로 쓴 윤곽 — 끝에 닿아 있어도 이미 닫힌 면이라 새로 닫지 않는다).
 * 어두운 픽셀(밝기 < 40)도 윤곽으로 본다
 */
export const VILLAGE_LINES: ReadonlySet<number> = new Set([
  OUT, STONE_LINE, WOOD_LINE, EX_OUT, GY_OUT, GRAVE_OUT, 0x34332f, 0x2a2018, 0x5a4410, 0x111216, 0x6e6a64, 0x3a3a5a, 0x3a2e10, 0x2a2620, 0x22301e, 0x8aa0b4, 0x6a7a94, 0x7a8ea0, 0x9a968e,
  0x55606c, 0x2c2018,
]);
/** 끝에 닿은 이 픽셀이 윤곽 아닌 칠인지 (바깥 칸에 윤곽을 그어 닫아야 하는지) */
function openPx(v: number): boolean {
  if ((v & 255) < 255) return false;
  const c = v >>> 8;
  if (VILLAGE_LINES.has(c)) return false;
  return 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255) >= 40;
}

/** 한 프레임에 여백 — 끝에 닿은 윤곽 아닌 칠은 바깥 칸에 그 그림의 윤곽 색으로 닫는다 */
function padFrame(g: Grid, p: VPad): Grid {
  const out = new Grid(g.w + p.x * 2, g.h + p.top + p.bottom);
  out.draw(g, p.x, p.top);
  const a = p.alpha ?? 255;
  if (a === 0) return out;
  const close = (x: number, y: number, tx: number, ty: number) => {
    if (openPx(g.get(x, y)) && !out.filled(tx, ty)) out.set(tx, ty, p.line, a);
  };
  if (p.x)
    for (let y = 0; y < g.h; y++) {
      close(0, y, p.x - 1, y + p.top);
      close(g.w - 1, y, p.x + g.w, y + p.top);
    }
  if (p.top) for (let x = 0; x < g.w; x++) close(x, 0, x + p.x, p.top - 1);
  if (p.bottom) for (let x = 0; x < g.w; x++) close(x, g.h - 1, x + p.x, p.top + g.h);
  return out;
}

/** 캔버스 → Grid */
function gridOf(cv: HTMLCanvasElement): Grid {
  const d = cv.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, cv.width, cv.height).data;
  const g = new Grid(cv.width, cv.height);
  for (let i = 0; i < g.px.length; i++) g.px[i] = ((d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3]) >>> 0;
  return g;
}

/** 그림(가로로 놓인 프레임 시트도)에 여백 — 프레임마다 따로 두르고 새 프레임 크기를 돌려준다 */
export function padTexCanvas(cv: HTMLCanvasElement, p: VPad, frameW?: number, frameH?: number): { canvas: HTMLCanvasElement; frameW?: number; frameH?: number } {
  const src = gridOf(cv);
  const fw = frameW ?? src.w;
  const fh = frameH ?? src.h;
  const n = Math.max(1, Math.floor(src.w / fw));
  const W = fw + p.x * 2;
  const H = fh + p.top + p.bottom;
  const out = new Grid(W * n, H);
  for (let f = 0; f < n; f++) {
    const part = new Grid(fw, fh);
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) part.px[y * fw + x] = src.get(f * fw + x, y);
    out.draw(padFrame(part, p), f * W, 0);
  }
  return { canvas: out.toCanvas(), frameW: frameW ? W : undefined, frameH: frameH ? H : undefined };
}
