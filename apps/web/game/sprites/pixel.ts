// 코드로 픽셀아트를 그리기 위한 작은 도구 모음 (캔버스 2D). 브라우저에서만 호출된다.

export type Color = number; // 0xRRGGBB

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

export function parseHex(hex: string, fallback: Color = 0xe8d9b0): Color {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  return m ? parseInt(m[1], 16) : fallback;
}

export function mix(a: Color, b: Color, t: number): Color {
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t)) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}

export const lighten = (c: Color, t: number) => mix(c, 0xffffff, t);
export const darken = (c: Color, t: number) => mix(c, 0x000000, t);

export function css(c: Color, a = 1): string {
  return a >= 1
    ? `#${c.toString(16).padStart(6, "0")}`
    : `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

/** 결정적 2D 해시 → [0,1) */
export function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 시드 고정 난수 (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 픽셀 단위 그리드. 도형을 채운 뒤 외곽선을 자동으로 두르고 캔버스에 찍는다.
 * 값은 0xRRGGBBAA (0 = 투명).
 */
export class Grid {
  readonly px: Uint32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint32Array(w * h);
  }

  static rgba(c: Color, a = 255): number {
    return ((c << 8) | (a & 255)) >>> 0;
  }

  set(x: number, y: number, c: Color, a = 255): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = Grid.rgba(c, a);
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x];
  }

  filled(x: number, y: number): boolean {
    return (this.get(x, y) & 255) > 0;
  }

  rect(x: number, y: number, w: number, h: number, c: Color, a = 255): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }

  hline(x0: number, x1: number, y: number, c: Color): void {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }

  vline(x: number, y0: number, y1: number, c: Color): void {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }

  /** 채운 타원 (픽셀 중심 기준) */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, a = 255): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }

  /** 이미 칠해진 픽셀만 색을 바꾼다 (명암 넣기) */
  recolor(test: (x: number, y: number) => boolean, c: Color): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.filled(x, y) && test(x, y)) this.set(x, y, c);
  }

  /** 칠해진 영역 바깥 테두리를 c로 두른다 */
  outline(c: Color, diagonal = false, a = 255): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.filled(x, y)) continue;
        const n =
          this.filled(x - 1, y) ||
          this.filled(x + 1, y) ||
          this.filled(x, y - 1) ||
          this.filled(x, y + 1) ||
          (diagonal &&
            (this.filled(x - 1, y - 1) || this.filled(x + 1, y - 1) || this.filled(x - 1, y + 1) || this.filled(x + 1, y + 1)));
        if (n) add.push(x, y);
      }
    }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c, a);
  }

  /** 좌우 반전 복사본 */
  mirrored(): Grid {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.px[y * this.w + (this.w - 1 - x)] = this.px[y * this.w + x];
    return g;
  }

  /** 다른 그리드를 (ox,oy)에 겹쳐 그린다 (투명은 건너뜀) */
  draw(src: Grid, ox: number, oy: number): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const v = src.px[y * src.w + x];
        if ((v & 255) === 0) continue;
        const tx = x + ox;
        const ty = y + oy;
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        this.px[ty * this.w + tx] = v;
      }
  }

  /** 캔버스 (dx,dy)에 찍는다 */
  blit(ctx: CanvasRenderingContext2D, dx = 0, dy = 0): void {
    const img = ctx.createImageData(this.w, this.h);
    const d = img.data;
    for (let i = 0; i < this.px.length; i++) {
      const v = this.px[i];
      d[i * 4] = (v >>> 24) & 255;
      d[i * 4 + 1] = (v >>> 16) & 255;
      d[i * 4 + 2] = (v >>> 8) & 255;
      d[i * 4 + 3] = v & 255;
    }
    // putImageData는 합성 없이 덮어쓰므로, 겹쳐 그릴 때는 임시 캔버스를 거친다
    const tmp = document.createElement("canvas");
    tmp.width = this.w;
    tmp.height = this.h;
    tmp.getContext("2d")!.putImageData(img, 0, 0);
    ctx.drawImage(tmp, dx, dy);
  }

  toCanvas(): HTMLCanvasElement {
    const { canvas, ctx } = makeCanvas(this.w, this.h);
    this.blit(ctx);
    return canvas;
  }
}

/** 부드러운 원형 그라데이션 (빛·안개용) */
export function radial(size: number, stops: [number, string][]): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
