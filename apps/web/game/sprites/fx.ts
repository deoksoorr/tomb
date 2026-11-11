import { css, Grid, makeCanvas, radial, rng } from "./pixel";

// 연출용 작은 텍스처: 빛, 반딧불, 먼지, 꽃잎, 흙, 말풍선, 촛불, 유령불, 안개/비/눈/구름 그림자 타일, 비네트.

export function glow(): HTMLCanvasElement {
  return radial(64, [
    [0, "rgba(255,255,255,0.9)"],
    [0.25, "rgba(255,255,255,0.45)"],
    [0.6, "rgba(255,255,255,0.12)"],
    [1, "rgba(255,255,255,0)"],
  ]);
}

export function firefly(): HTMLCanvasElement {
  const g = new Grid(5, 5);
  g.set(2, 2, 0xfffbe0);
  for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]]) g.set(x, y, 0xf2e27a, 150);
  for (const [x, y] of [[1, 1], [3, 1], [1, 3], [3, 3]]) g.set(x, y, 0xd8c860, 50);
  return g.toCanvas();
}

/** 점프할 때 바닥에 남는 그림자 (12×4) */
export function groundShadow(): HTMLCanvasElement {
  const g = new Grid(12, 4);
  g.ellipse(6, 2, 6, 2, 0x000000, 90);
  g.ellipse(6, 2, 3.5, 1.2, 0x000000, 130);
  return g.toCanvas();
}

export function dust(): HTMLCanvasElement {
  const g = new Grid(4, 4);
  g.ellipse(2, 2, 2, 2, 0xcabba0, 200);
  return g.toCanvas();
}

export function petal(): HTMLCanvasElement {
  const g = new Grid(3, 2);
  g.rect(0, 0, 3, 2, 0xf1e8d8);
  g.set(2, 1, 0xdcb4b8);
  return g.toCanvas();
}

export function dirtBit(): HTMLCanvasElement {
  const g = new Grid(2, 2);
  g.rect(0, 0, 2, 2, 0x6a5641);
  g.set(1, 1, 0x4c3d2f);
  return g.toCanvas();
}

export function spark(): HTMLCanvasElement {
  const g = new Grid(5, 5);
  g.set(2, 2, 0xffffff);
  g.set(2, 1, 0xfff4c8);
  g.set(2, 3, 0xfff4c8);
  g.set(1, 2, 0xfff4c8);
  g.set(3, 2, 0xfff4c8);
  g.set(2, 0, 0xfff4c8, 110);
  g.set(2, 4, 0xfff4c8, 110);
  g.set(0, 2, 0xfff4c8, 110);
  g.set(4, 2, 0xfff4c8, 110);
  return g.toCanvas();
}

/** "…" 말풍선 */
export function bubble(): HTMLCanvasElement {
  const g = new Grid(15, 11);
  const fill = 0xf3eedf;
  g.rect(1, 1, 13, 6, fill);
  g.hline(2, 12, 0, fill);
  g.hline(2, 12, 7, fill);
  g.set(5, 8, fill);
  g.set(4, 9, fill);
  for (const x of [4, 7, 10]) g.set(x, 4, 0x2a2826);
  g.outline(0x2a2826);
  return g.toCanvas();
}

/** 촛불 2프레임 (3×8) */
export function candle(): HTMLCanvasElement {
  const g = new Grid(6, 8);
  for (let f = 0; f < 2; f++) {
    const ox = f * 3;
    g.rect(ox, 4, 3, 4, 0xe8e0c8);
    g.set(ox + 2, 4, 0xc9c0a8);
    g.set(ox + 1, 3, 0x3a3127);
    g.set(ox + 1, 2, 0xffc45a);
    g.set(ox + 1, f ? 0 : 1, 0xfff2b8);
    if (f) g.set(ox + 1, 1, 0xffa94a);
  }
  return g.toCanvas();
}

/** 유령불 2프레임 (8×10) */
export function wisp(): HTMLCanvasElement {
  const g = new Grid(16, 10);
  for (let f = 0; f < 2; f++) {
    const ox = f * 8;
    const b = new Grid(8, 10);
    b.ellipse(4, 6.5, 3, 3, 0x9fd6e8);
    b.ellipse(4, 6.5, 1.8, 1.8, 0xe8fbff);
    b.set(f ? 3 : 4, 2, 0x9fd6e8);
    b.set(f ? 4 : 3, 3, 0x9fd6e8);
    b.set(4, 3, 0xc8f0fa);
    b.set(f ? 5 : 2, 4, 0x9fd6e8);
    g.draw(b, ox, 0);
  }
  return g.toCanvas();
}

/** 이모트 아이콘: 꽃 */
export function flowerIcon(): HTMLCanvasElement {
  const g = new Grid(7, 8);
  const c = 0xefe9d6;
  g.set(3, 1, c);
  g.set(2, 2, c);
  g.set(4, 2, c);
  g.set(3, 3, c);
  g.set(3, 2, 0xe2b84e);
  g.vline(3, 4, 6, 0x5b7044);
  g.set(4, 5, 0x5b7044);
  g.outline(0x2a2826);
  return g.toCanvas();
}

export function splash(): HTMLCanvasElement {
  const g = new Grid(5, 3);
  g.set(0, 1, 0xd5e6f0, 200);
  g.set(4, 1, 0xd5e6f0, 200);
  g.set(1, 0, 0xd5e6f0, 220);
  g.set(3, 0, 0xd5e6f0, 220);
  g.set(2, 2, 0xd5e6f0, 120);
  return g.toCanvas();
}

export function pixel(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(4, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 4, 4);
  return canvas;
}

export function vignette(): HTMLCanvasElement {
  return radial(256, [
    [0, "rgba(0,0,0,0)"],
    [0.55, "rgba(0,0,0,0)"],
    [0.85, "rgba(0,0,0,0.45)"],
    [1, "rgba(0,0,0,0.85)"],
  ]);
}

/** 이음매 없는 값 노이즈 (주기 period로 감싼다) */
function tileNoise(size: number, period: number, seed: number): Float32Array {
  const r = rng(seed);
  const lattice = new Float32Array(period * period).map(() => r());
  const out = new Float32Array(size * size);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = s(fx - x0);
      const ty = s(fy - y0);
      const v = (i: number, j: number) => lattice[((j + period) % period) * period + ((i + period) % period)];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx;
      const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function noiseCanvas(size: number, octaves: [number, number][], seed: number, color: [number, number, number], alpha: (v: number) => number) {
  const { canvas, ctx } = makeCanvas(size, size);
  const acc = new Float32Array(size * size);
  let total = 0;
  octaves.forEach(([period, weight], i) => {
    const n = tileNoise(size, period, seed + i * 101);
    for (let k = 0; k < acc.length; k++) acc[k] += n[k] * weight;
    total += weight;
  });
  const img = ctx.createImageData(size, size);
  for (let k = 0; k < acc.length; k++) {
    const v = acc[k] / total;
    img.data[k * 4] = color[0];
    img.data[k * 4 + 1] = color[1];
    img.data[k * 4 + 2] = color[2];
    img.data[k * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, alpha(v))));
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function fog(): HTMLCanvasElement {
  return noiseCanvas(256, [[4, 1], [8, 0.5], [16, 0.25]], 7, [214, 220, 226], (v) => (v - 0.35) * 1.6);
}

export function cloudShadow(): HTMLCanvasElement {
  return noiseCanvas(256, [[3, 1], [6, 0.4]], 19, [8, 10, 18], (v) => (v - 0.5) * 2.2);
}

/** 비스듬한 빗줄기 타일 (이음매 없음) */
export function rain(density: number, seed: number): HTMLCanvasElement {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  const r = rng(seed);
  ctx.fillStyle = css(0xcfdcea, 0.55);
  for (let i = 0; i < density; i++) {
    const x0 = Math.floor(r() * size);
    const y0 = Math.floor(r() * size);
    const len = 4 + Math.floor(r() * 4);
    for (let k = 0; k < len; k++) {
      const x = (x0 - Math.floor(k / 3) + size) % size;
      const y = (y0 + k) % size;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

export function snow(density: number, seed: number): HTMLCanvasElement {
  const size = 64;
  const { canvas, ctx } = makeCanvas(size, size);
  const r = rng(seed);
  for (let i = 0; i < density; i++) {
    const x = Math.floor(r() * size);
    const y = Math.floor(r() * size);
    ctx.fillStyle = css(0xf4f8ff, 0.6 + r() * 0.4);
    ctx.fillRect(x, y, 1, 1);
    if (r() < 0.3) {
      ctx.fillStyle = css(0xf4f8ff, 0.45);
      ctx.fillRect((x + 1) % size, y, 1, 1);
      ctx.fillRect(x, (y + 1) % size, 1, 1);
    }
  }
  return canvas;
}

/** 연못 물빛 반짝임 */
export function shimmer(): HTMLCanvasElement {
  const g = new Grid(7, 1);
  g.hline(1, 5, 0, 0xcfe3ea);
  g.set(0, 0, 0xcfe3ea, 100);
  g.set(6, 0, 0xcfe3ea, 100);
  return g.toCanvas();
}

// ── 아바타 꾸미기 연출 (AvatarView) ──

/** 등의 작은 유령 날개: 프레임 0 = 앞·뒷모습(양쪽 날개), 1 = 옆모습(뒤로 뻗은 한쪽 날개). 각 26×12 */
export function avatarWings(): HTMLCanvasElement {
  const g = new Grid(52, 12);
  const fill = 0xf4f1ff;
  const mid = 0xe2ddf6;
  const lo = 0xb9b2dc;
  /** 어깨(ox)에서 dir 쪽으로 len칸 뻗는 날개. 바깥으로 갈수록 위로 솟고 아래 끝은 깃털처럼 들쭉날쭉 */
  const wing = (ox: number, dir: 1 | -1, len: number) => {
    for (let i = 0; i < len; i++) {
      const x = ox + dir * i;
      const y0 = 4 - Math.round(Math.sin((i / len) * Math.PI * 0.9) * 3.5);
      const y1 = 8 - Math.floor(i / 3) + (i % 3 === 2 ? -1 : 0);
      for (let y = y0; y <= y1; y++) g.set(x, y, y === y1 ? lo : y > y0 + 2 ? mid : fill, 235);
    }
  };
  wing(11, -1, 10);
  wing(14, 1, 10);
  wing(26 + 15, 1, 10);
  g.outline(0x5e5880, false, 210);
  return g.toCanvas();
}

/** 그림자 유령 친구 (9×10): 반투명 보랏빛 그림자에 눈 두 점 */
export function petGhost(): HTMLCanvasElement {
  const g = new Grid(9, 10);
  const body = 0x3c3552;
  g.ellipse(4.5, 4, 3.6, 3.6, body);
  g.rect(1, 4, 7, 4, body);
  for (const x of [1, 3, 5, 7]) g.set(x, 8, body);
  g.set(3, 3, 0xf6efd4);
  g.set(5, 3, 0xf6efd4);
  g.set(2, 2, 0x5a5078);
  g.outline(0x1a1626, false, 160);
  return g.toCanvas();
}

/** 발자국 꽃: 3가지 색 (각 5×5) */
export function footFlower(): HTMLCanvasElement {
  const g = new Grid(15, 5);
  const cols = [0xf2b8c6, 0xf3e27a, 0xb8c8f2];
  cols.forEach((c, i) => {
    const ox = i * 5;
    g.set(ox + 2, 1, c);
    g.set(ox + 1, 2, c);
    g.set(ox + 3, 2, c);
    g.set(ox + 2, 3, c);
    g.set(ox + 2, 2, 0xfff4c0);
    g.set(ox + 3, 4, 0x6f9a4c);
  });
  return g.toCanvas();
}

/** 수면 물결 고리 (14×5) */
export function ripple(): HTMLCanvasElement {
  const g = new Grid(14, 5);
  g.ellipse(7, 2.5, 7, 2.5, 0xd8f0fa, 170);
  g.ellipse(7, 2.5, 5.5, 1.5, 0x000000, 0);
  for (let i = 0; i < g.px.length; i++) if ((g.px[i] & 255) === 0) g.px[i] = 0;
  return g.toCanvas();
}

/** 잠수 물방울 (3×3) */
export function avBubble(): HTMLCanvasElement {
  const g = new Grid(3, 3);
  for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]]) g.set(x, y, 0xd8f0fa, 220);
  g.set(1, 1, 0xffffff, 90);
  return g.toCanvas();
}
