import { css, Grid, makeCanvas, radial, rng } from "./pixel";

// 연출용 작은 텍스처: 빛, 반딧불, 먼지, 꽃잎, 흙, 말풍선, 촛불, 유령불, 안개·구름 그림자 조각, 비/눈 타일, 비네트.

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

/**
 * 안개·구름 그림자 조각 (흰색, 쓰는 쪽에서 tint): size×size 프레임 frames개를 가로로.
 * 둥근 빛무리를 노이즈로 일그러뜨려 가장자리가 들쭉날쭉하고 속도 고르지 않다 — 여러 장을 겹쳐 흘려보내면 벽지처럼 되풀이되지 않는다
 */
export function puff(size = 128, frames = 4): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(size * frames, size);
  const img = ctx.createImageData(size * frames, size);
  const W = size * frames;
  for (let f = 0; f < frames; f++) {
    const edge = tileNoise(size, 5, 311 + f * 37);
    const edge2 = tileNoise(size, 11, 523 + f * 41);
    const body = tileNoise(size, 7, 733 + f * 43);
    // 프레임마다 무게중심을 조금씩 옮겨 모양이 서로 다르게
    const r = rng(97 + f);
    const cx = size * (0.44 + 0.12 * r());
    const cy = size * (0.44 + 0.12 * r());
    const rad = size * 0.47;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const k = y * size + x;
        const d = Math.hypot(x - cx, y - cy) / rad;
        // 가장자리 반지름을 노이즈로 0.6~1.0배 흔든다
        const rr = d / (0.6 + 0.3 * edge[k] + 0.1 * edge2[k]);
        const t = Math.max(0, Math.min(1, (1 - rr) / 0.8));
        const fall = t * t * (3 - 2 * t);
        const a = fall * (0.55 + 0.45 * body[k]);
        const o = (y * W + f * size + x) * 4;
        img.data[o] = 255;
        img.data[o + 1] = 255;
        img.data[o + 2] = 255;
        img.data[o + 3] = Math.round(255 * Math.max(0, Math.min(1, a)));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 무늬 몰림 정도: 낮은 주파수 노이즈로 한 타일 안에서도 촘촘한 곳·성긴 곳이 생긴다 (받을 확률 0.2~1) */
function clumpAccept(dens: Float32Array, size: number, x: number, y: number, u: number): boolean {
  return u < Math.min(1, 0.2 + 1.2 * dens[y * size + x]);
}

export type RainSheet = { size: number; count: number; seed: number; len: [number, number]; alpha: [number, number] };

/**
 * 비스듬한 빗줄기 타일 (이음매 없음). 줄마다 길이·기울기·밝기가 다르고, 꼬리는 흐리고 머리(아래)는 밝다.
 * 타일 안에서도 빗줄기가 몰린 곳·빈 곳이 있어서 크게 이어 붙여도 격자처럼 보이지 않는다
 */
export function rain(o: RainSheet): HTMLCanvasElement {
  const { size } = o;
  const { canvas, ctx } = makeCanvas(size, size);
  const r = rng(o.seed);
  const dens = tileNoise(size, 4, o.seed + 7);
  const [l0, l1] = o.len;
  const [a0, a1] = o.alpha;
  let placed = 0;
  for (let tries = 0; placed < o.count && tries < o.count * 30; tries++) {
    const x0 = Math.floor(r() * size);
    const y0 = Math.floor(r() * size);
    if (!clumpAccept(dens, size, x0, y0, r())) continue;
    placed++;
    // 짧은 줄이 많고 긴 줄은 드물게
    const len = l0 + Math.floor((l1 - l0 + 1) * Math.pow(r(), 1.6));
    const q = r();
    const step = q < 0.55 ? 3 : q < 0.8 ? 4 : q < 0.93 ? 2.5 : 5;
    const a = a0 + (a1 - a0) * r();
    const col = r() < 0.15 ? 0xe6eef8 : r() < 0.3 ? 0xb8c8da : 0xcfdcea;
    for (let k = 0; k < len; k++) {
      const x = (((x0 - Math.floor(k / step)) % size) + size) % size;
      const y = (y0 + k) % size;
      ctx.fillStyle = css(col, a * (0.4 + (0.6 * (k + 1)) / len));
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

export type SnowSheet = { size: number; count: number; seed: number; big: number; cross: number };

/** 눈송이 타일: 한 점·2×2 송이·십자 송이가 섞이고, 밝기·몰림이 고르지 않다 */
export function snow(o: SnowSheet): HTMLCanvasElement {
  const { size } = o;
  const { canvas, ctx } = makeCanvas(size, size);
  const r = rng(o.seed);
  const dens = tileNoise(size, 4, o.seed + 13);
  const px = (x: number, y: number, a: number) => {
    ctx.fillStyle = css(0xf4f8ff, a);
    ctx.fillRect(((x % size) + size) % size, ((y % size) + size) % size, 1, 1);
  };
  let placed = 0;
  for (let tries = 0; placed < o.count && tries < o.count * 30; tries++) {
    const x = Math.floor(r() * size);
    const y = Math.floor(r() * size);
    if (!clumpAccept(dens, size, x, y, r())) continue;
    placed++;
    const a = 0.5 + r() * 0.5;
    const q = r();
    px(x, y, a);
    if (q < o.cross) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) px(x + dx, y + dy, a * 0.5);
    } else if (q < o.cross + o.big) {
      px(x + 1, y, a * 0.55);
      px(x, y + 1, a * 0.55);
      px(x + 1, y + 1, a * 0.3);
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

/** 등의 작은 유령 날개: 프레임 0 = 앞·뒷모습(양쪽 날개), 1 = 옆모습(뒤로 뻗은 한쪽 날개). 각 26×12.
 *  11/22 염색되게 cosmeticFx 날개(wingsSmall)로 옮겼다 — 그림은 그대로 */
export function avatarWingsGrid(): Grid {
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
  return g;
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
