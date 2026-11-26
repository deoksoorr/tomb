import * as Art from "./campArt";
import type { HomePlan } from "./campHousingPlan";

// 11/26 캠핑장 그림 테스트용 캔버스 (campHomePath.test에서 옮김 — 여러 테스트가 같이 쓴다. 테스트 파일을 import하면 그 테스트까지 다시 돈다)
// ── 테스트용 캔버스 (픽셀만 담는다 — putImageData/getImageData/drawImage(정수 자리)만 진짜, 나머지 그리기는 아무것도 안 한다) ──
type Img = { width: number; height: number; data: Uint8ClampedArray };
export type FakeCanvas = { width: number; height: number; px: () => Uint8ClampedArray; getContext: () => unknown };
export function installFakeCanvas(): void {
  const make = (): FakeCanvas => {
    let buf: Uint8ClampedArray | null = null;
    let bw = 0;
    let bh = 0;
    const c: FakeCanvas = {
      width: 0,
      height: 0,
      px: () => {
        if (!buf || bw !== c.width || bh !== c.height) {
          buf = new Uint8ClampedArray(c.width * c.height * 4);
          bw = c.width;
          bh = c.height;
        }
        return buf;
      },
      getContext: () => ctx,
    };
    const put = (img: Img, dx: number, dy: number, over: boolean) => {
      const d = c.px();
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx < 0 || ty < 0 || tx >= c.width || ty >= c.height) continue;
          const s = (y * img.width + x) * 4;
          if (over && img.data[s + 3] === 0) continue;
          const t = (ty * c.width + tx) * 4;
          for (let k = 0; k < 4; k++) d[t + k] = img.data[s + k];
        }
    };
    const real: Record<string, unknown> = {
      createImageData: (w: number, h: number): Img => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (img: Img, x: number, y: number) => put(img, x | 0, y | 0, false),
      getImageData: (x: number, y: number, w: number, h: number): Img => {
        const d = c.px();
        const out = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++)
          for (let i = 0; i < w; i++) {
            const sx = i + x;
            const sy = j + y;
            if (sx < 0 || sy < 0 || sx >= c.width || sy >= c.height) continue;
            for (let k = 0; k < 4; k++) out[(j * w + i) * 4 + k] = d[(sy * c.width + sx) * 4 + k];
          }
        return { width: w, height: h, data: out };
      },
      drawImage: (src: FakeCanvas, x = 0, y = 0) => {
        if (src && typeof src.px === "function") put({ width: src.width, height: src.height, data: src.px() }, Math.round(x), Math.round(y), true);
      },
    };
    const noop = () => undefined;
    const ctx: unknown = new Proxy(real, {
      get: (t, k: string) => (k in t ? t[k] : k === "canvas" ? c : noop),
      set: () => true,
    });
    return c;
  };
  (globalThis as { document?: unknown }).document = { createElement: () => make() };
}


const T = Art.CAMP_TEX;
/** 캠핑장 공용 그림 (plan에 make 없이 키만 오는 것) */
export const CAMP_GRID: Record<string, () => { w: number; h: number; px: Uint32Array }> = {
  [T.logChair]: Art.logChairArt,
  [T.brazier]: Art.brazierArt,
  [T.foldTable]: Art.foldTableArt,
  [T.picnicV]: Art.picnicTableVArt,
  [T.benchV]: Art.picnicBenchVArt,
  [T.campChairFront(0)]: () => Art.campChairFrontArt(0),
  [T.campChairFront(1)]: () => Art.campChairFrontArt(1),
  [T.campChairFront(2)]: () => Art.campChairFrontArt(2),
  [T.lantern]: Art.lanternArt,
  [T.pole]: Art.poleArt,
  [T.pebbles(0)]: () => Art.pebblesArt(0),
  [T.pebbles(1)]: () => Art.pebblesArt(1),
  [T.pebbles(2)]: () => Art.pebblesArt(2),
};

export type Box = { x0: number; y0: number; x1: number; y1: number };
/** 소품이 칠한 칸 (불투명 픽셀 테두리 상자 — 월드 좌표). 그림을 모르면 null */
export function drawnBox(q: HomePlan["props"][number]): Box | null {
  let w = 0;
  let h = 0;
  let alpha: (i: number) => number;
  if (q.make) {
    const c = q.make() as unknown as FakeCanvas;
    w = c.width;
    h = c.height;
    const d = c.px();
    alpha = (i) => d[i * 4 + 3];
  } else if (CAMP_GRID[q.key]) {
    const g = CAMP_GRID[q.key]();
    w = g.w;
    h = g.h;
    alpha = (i) => g.px[i] & 255;
  } else return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (alpha(y * w + x) >= 128) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x + 1);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y + 1);
      }
  if (x1 < x0) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  if (q.crop) {
    x0 = Math.max(x0, q.crop[0]);
    y0 = Math.max(y0, q.crop[1]);
    x1 = Math.min(x1, q.crop[0] + q.crop[2]);
    y1 = Math.min(y1, q.crop[1] + q.crop[3]);
  }
  const left = q.x - (q.ox ?? 0.5) * w;
  const top = q.y - (q.oy ?? 1) * h;
  const fx = (x: number) => (q.flip ? w - x : x);
  return { x0: left + Math.min(fx(x0), fx(x1)), x1: left + Math.max(fx(x0), fx(x1)), y0: top + y0, y1: top + y1 };
}

// ── 11/26 그림 끝 잘림 검사 (campSpriteEdge.test와 같은 규칙 — 마을·바닷가 검사도 같이 쓴다) ──

/** 칠한 판 (RGBA — 캔버스·Grid 공용) */
export type Pix = { w: number; h: number; rgba: (x: number, y: number) => [number, number, number, number] };
export const pixOfCanvas = (cv: unknown): Pix => {
  const c = cv as FakeCanvas;
  const d = c.px();
  return { w: c.width, h: c.height, rgba: (x, y) => [d[(y * c.width + x) * 4], d[(y * c.width + x) * 4 + 1], d[(y * c.width + x) * 4 + 2], d[(y * c.width + x) * 4 + 3]] };
};
export const pixOfGrid = (g: { w: number; h: number; get: (x: number, y: number) => number }): Pix => ({
  w: g.w,
  h: g.h,
  rgba: (x, y) => {
    const v = g.get(x, y);
    return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  },
});
const EDGE_OUTLINES = new Set([0x2c2018, 0x55606c, 0x1e2430, 0x5a3018, 0x5a5650]);
/**
 * 끝 열·줄에 닿은 칸 수 (가장 길게 이어진, 프레임마다). 왼쪽·오른쪽·윗줄은 불투명(알파 ≥ 128)이면 윤곽이라도 닿은 것,
 * 아랫줄은 땅에 닿는 줄이라 윤곽(어두운 픽셀)·그림자는 두고 윤곽 아닌 칠만 본다
 */
export function edgeRunsOf(p: Pix, frameW = p.w): { left: number; right: number; top: number; bottom: number } {
  const open = (x: number, y: number) => {
    const [r, g, b, a] = p.rgba(x, y);
    if (a < 128) return false;
    return !EDGE_OUTLINES.has((r << 16) | (g << 8) | b) && 0.3 * r + 0.59 * g + 0.11 * b >= 40;
  };
  const solid = (x: number, y: number) => p.rgba(x, y)[3] >= 128;
  const run = (pts: [number, number][], hit: (x: number, y: number) => boolean) => {
    let best = 0;
    let cur = 0;
    for (const [x, y] of pts) {
      cur = hit(x, y) ? cur + 1 : 0;
      best = Math.max(best, cur);
    }
    return best;
  };
  const out = { left: 0, right: 0, top: 0, bottom: 0 };
  for (let f = 0; f * frameW < p.w; f++) {
    const x0 = f * frameW;
    const col = (x: number) => Array.from({ length: p.h }, (_, y) => [x, y] as [number, number]);
    const row = (y: number) => Array.from({ length: frameW }, (_, x) => [x0 + x, y] as [number, number]);
    out.left = Math.max(out.left, run(col(x0), solid));
    out.right = Math.max(out.right, run(col(x0 + frameW - 1), solid));
    out.top = Math.max(out.top, run(row(0), solid));
    out.bottom = Math.max(out.bottom, run(row(p.h - 1), open));
  }
  return out;
}
export const edgeBad = (r: ReturnType<typeof edgeRunsOf>) => r.left > 0 || r.right > 0 || r.top > 0 || r.bottom > 0;
export const edgeFmt = (r: ReturnType<typeof edgeRunsOf>) => `L${r.left} R${r.right} T${r.top} B${r.bottom}`;
