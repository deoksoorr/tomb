import { Grid } from "../sprites/pixel";

// 11/26 운영자 「곁채 지붕이 잘린다」·「펜션 앞 화단 양옆이 잘려 있다」·「카라반 견인고리 쪽 픽셀이 잘려 있다」:
// 캔버스 끝 열·줄까지 칠한 그림은 (1) 끝에 윤곽을 둘 자리가 없어 잘린 면이 그대로 보이고, (2) 맵 확대가 소수 배율이면
// 텍스처 끝 열이 반 칸만 그려지거나 빠진다. 그림을 다 그린 뒤 둘레에 빈 칸을 두르고, 끝에 닿아 있던 윤곽 아닌 칠은 윤곽으로 닫는다.
// 원점이 바닥 가운데(0.5, 1)인 그림은 좌우 같은 폭·위에만 두르면 맵 자리가 그대로다 (아래는 땅에 닿는 줄 — bottom은 따로).

const OUT = 0x2c2018;
/** 윤곽으로 보는 색 (캠핑장 윤곽 · 눈 윤곽) — 이 색이 끝에 닿아 있으면 이미 닫힌 면 */
const LINES = new Set([OUT, 0x55606c, 0x1e2430, 0x5a3018, 0x5a5650]);

/** 끝에 닿은 이 픽셀이 윤곽 아닌 칠인지 (윤곽으로 닫아야 하는지) */
function open(v: number): boolean {
  if ((v & 255) < 128) return false;
  const c = v >>> 8;
  if (LINES.has(c)) return false;
  return 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255) >= 40;
}

export type Pad = { x: number; top: number; bottom: number };
export const PAD_NONE: Pad = { x: 0, top: 0, bottom: 0 };

/** 그림 둘레에 빈 칸 (좌우 x 기본 2 — 끝에 닿은 칠을 닫는 윤곽 바깥에도 한 칸 · 위 top 기본 2 — 눈 얹은 판은 윤곽 위로 한 줄 소복이 쌓여서 · 아래 bottom). 끝에 닿아 있던 칠은 바깥 칸에 윤곽을 그어 닫는다 */
/** o.line = 끝을 닫는 윤곽 색 (기본 캠핑장 윤곽 — 마을·바닷가 그림은 그 그림 윤곽 색을 준다) */
export function padGrid(g: Grid, o: Partial<Pad> & { line?: number; lineAlpha?: number } = {}): Grid {
  const p: Pad = { x: o.x ?? 2, top: o.top ?? 2, bottom: o.bottom ?? 0 };
  const line = o.line ?? OUT;
  const lineAlpha = o.lineAlpha ?? 255;
  const out = new Grid(g.w + 2 * p.x, g.h + p.top + p.bottom);
  out.draw(g, p.x, p.top);
  const close = (x: number, y: number, tx: number, ty: number) => {
    if (open(g.get(x, y)) && !out.filled(tx, ty)) out.set(tx, ty, line, lineAlpha);
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

/** 지붕 마스크 같은 칸 배열을 둘레 빈 칸만큼 옮긴다 */
export function padMask(m: Uint8Array, w: number, h: number, o: Pad): Uint8Array {
  const W = w + 2 * o.x;
  const out = new Uint8Array(W * (h + o.top + o.bottom));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[(y + o.top) * W + x + o.x] = m[y * w + x];
  return out;
}

/** 그림 안 좌표를 둘레 빈 칸만큼 옮긴다 */
export const padPt = <T extends { x: number; y: number }>(p: T, o: Pad): T => ({ ...p, x: p.x + o.x, y: p.y + o.top });

/** 좌표 묶음 안의 x·x0·x1(좌우) · y·top(위) 값을 둘레 빈 칸만큼 옮긴다 (점·점 배열·{x0,x1,y} 모두) */
function shiftPts(v: unknown, o: Pad): unknown {
  if (Array.isArray(v)) return v.map((e) => shiftPts(e, o));
  if (!v || typeof v !== "object" || v instanceof Grid || ArrayBuffer.isView(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, e] of Object.entries(v)) out[k] = typeof e === "number" ? (k === "x" || k === "x0" || k === "x1" ? e + o.x : k === "y" || k === "top" ? e + o.top : e) : shiftPts(e, o);
  return out;
}

/** 그림 + 지붕 마스크 + 그림 안 좌표(문·창·굴뚝·간판…)를 한꺼번에 둘레 빈 칸만큼 넓힌다 */
export function padArt<T extends { grid: Grid; roof?: Uint8Array }>(a: T, po: Partial<Pad> = {}): T {
  const o: Pad = { x: po.x ?? 2, top: po.top ?? 2, bottom: po.bottom ?? 0 };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a)) out[k] = k === "grid" ? padGrid(a.grid, o) : k === "roof" && a.roof ? padMask(a.roof, a.grid.w, a.grid.h, o) : shiftPts(v, o);
  return out as T;
}

/** 다 구운 캔버스(눈 얹은 그림·winterArt 그림)에 둘레 빈 칸 */
export function padCanvas(cv: HTMLCanvasElement, o: Partial<Pad> & { line?: number; lineAlpha?: number } = {}): HTMLCanvasElement {
  const d = cv.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, cv.width, cv.height).data;
  const g = new Grid(cv.width, cv.height);
  for (let i = 0; i < g.px.length; i++) g.px[i] = ((d[i * 4] << 24) | (d[i * 4 + 1] << 16) | (d[i * 4 + 2] << 8) | d[i * 4 + 3]) >>> 0;
  return padGrid(g, o).toCanvas();
}
