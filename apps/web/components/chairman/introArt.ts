import { bodyCanvas, glowCanvas, LAMP_AT } from "@/game/lighthouse/lighthouseArt";
import { LIGHTHOUSE_ART_FOOT, LIGHTHOUSE_ART_H, LIGHTHOUSE_ART_W } from "@/game/lighthouse/lighthouseLayout";
import { avatarFrameGrid } from "@/game/sprites/avatar";
import { Grid, hash2, makeCanvas, rng, vnoise } from "@/game/sprites/pixel";
import { snowPine, streetLamp } from "@/game/sprites/worldProps";
import { advance, boltFlash, bolts, door, type IntroMode, pulse, shake, smooth, spot, storm, WALK_MS } from "./introTime";

// 11/20 회장님 독대 입장 연출 「지옥으로 가는 길」 (긴장 버전):
// 밤 돌길(모드7 바닥)을 내 캐릭터 뒷모습이 걸어간다 → 하늘이 피빛 폭풍으로, 등대 꼭대기에 구름이 소용돌이, 붉은 번개에 탑 실루엣,
// 가로등은 지나가면 깜빡이다 꺼지고(문 앞 둘은 빨갛게), 소나무가 바람에 휘고, 눈 대신 재·불티가 날아오른다, 바닥엔 붉은 안개·탑 앞 갈라진 틈.
// 빛줄기가 빨개져 쓸다가 나를 비추고(들킴), 탑이 덮쳐 오며 걸음이 느려지고, 문이 삐걱 열리며 붉은 빛이 쏟아진다.
// 헬: 지평선 불길 · 불붙은 사직서가 날아간다. (11/21 하늘 「반려」 도장은 뺐다 — 반려는 등장 화면 대사에서 처음 터진다)
// 작은 캔버스(가로 427×240 또는 세로 200×300)에 그리고 CSS로 화면을 덮게 키운다. 그림은 처음에 한 번 굽고, 매 프레임은 바닥 픽셀 루프 + drawImage뿐.
// 밀어 들어가기·손떨림은 draw가 돌려주는 CSS transform (캔버스 요소에 건다).

const F = 100;
const K = 143 * 20;
/** 등대 자리 · 다 걸었을 때 남는 거리 · 등대를 마을보다 크게 (덮쳐 오게) */
const TOWER_Z = 232;
const END_ZR = 60;
const ADV = TOWER_Z - END_ZR;
const TS = 1.05;
/** 문 (등대 그림 안 좌표) */
const LX = Math.round((LIGHTHOUSE_ART_W - 1) / 2);
const BASE = LIGHTHOUSE_ART_H - LIGHTHOUSE_ART_FOOT;
const DOOR_R = { x: LX - 3, y: BASE - 17, w: 7, h: 12 };
/** 갈라진 틈이 있는 곳 (세계 z) */
const CR0 = 200;
const CR1 = 228;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

type Spr = { c: HTMLCanvasElement; sil: HTMLCanvasElement };
type Obj = { kind: "tree" | "lamp" | "tower"; s: Spr; x: number; z: number; i: number; doorLamp?: boolean };

const le = (c: number) => ((255 << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;
function mixC(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * k;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * k;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
const rgba = (c: number, a: number) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** 곱하기로 물들이기 (원래 투명도 유지) */
function tint(src: HTMLCanvasElement, mul: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = mul;
  ctx.fillRect(0, 0, src.width, src.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(src, 0, 0);
  return canvas;
}

/** 한 색 실루엣 */
function silhouette(src: HTMLCanvasElement, col: string): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, src.width, src.height);
  return canvas;
}

/** 가장자리 빛 (위·옆이 빈 픽셀만 한 색) */
function rim(src: HTMLCanvasElement, col: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const d = src.getContext("2d")!.getImageData(0, 0, w, h).data;
  const g = new Grid(w, h);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (on(x, y) && (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1))) g.set(x, y, col);
  return g.toCanvas();
}

/** 디더 세로 그라데이션 (픽셀 하늘). stops = [위치 0..1, 색] */
function ditherSky(w: number, h: number, stops: [number, number][]): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const buf = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
    // 4단 색 계단 + 바이어 디더
    const q = k * 4;
    const lo = Math.floor(q);
    const fr = q - lo;
    for (let x = 0; x < w; x++) {
      const step = fr > BAYER[(y & 3) * 4 + (x & 3)] ? lo + 1 : lo;
      buf[y * w + x] = le(mixC(ca, cb, Math.min(4, step) / 4));
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 돌길 (256×256, 밤빛) */
function roadTex(): Uint32Array {
  const d = new Uint32Array(65536);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const row = y >> 3;
      const sx = x + (row & 1) * 6;
      const col = Math.floor(sx / 12);
      const mortar = y % 8 === 0 || sx % 12 === 0;
      const tone = hash2(col, row, 7);
      let c = mortar ? 0x1a1a26 : mixC(0x343a4c, 0x4c546a, tone * 0.8);
      if (!mortar && y % 8 === 1) c = mixC(c, 0x7a84a4, 0.3);
      if (hash2(x, y, 11) < 0.04 + vnoise(x, y, 24, 3) * 0.1) c = mixC(c, 0xb0bad8, 0.55);
      d[y * 256 + x] = le(c);
    }
  return d;
}

/** 눈밭 (256×256, 밤빛) */
function snowTex(): Uint32Array {
  const d = new Uint32Array(65536);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const n = vnoise(x, y, 18, 5) * 0.6 + vnoise(x, y, 6, 9) * 0.4;
      let c = mixC(0x5a6694, 0x8492c0, Math.floor(n * 4) / 4);
      if (hash2(x, y, 3) < 0.01) c = 0xd0daf4;
      d[y * 256 + x] = le(c);
    }
  return d;
}

/** 탄 땅 (재 + 숯 + 불씨) */
function ashTex(): Uint32Array {
  const d = new Uint32Array(65536);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const n = vnoise(x, y, 14, 21) * 0.65 + vnoise(x, y, 5, 22) * 0.35;
      let c = mixC(0x1e161c, 0x463a42, Math.floor(n * 4) / 4);
      const e = hash2(x, y, 23);
      if (e < 0.012) c = 0xff7a3a;
      else if (e < 0.03) c = 0x8a2a1c;
      d[y * 256 + x] = le(c);
    }
  return d;
}

/** 갈라진 틈 (0 없음 · 1 가장자리 · 2 속불) — 등대 문 앞에서 이쪽으로 뻗는 금. 세계 좌표(u=wx, v=wz*2)로 그린다 */
function crackMask(): Uint8Array {
  const m = new Uint8Array(65536);
  const r = rng(616);
  const put = (wx: number, v: number, k: number) => {
    const i = ((v & 255) << 8) | (Math.floor(wx) & 255);
    if (m[i] < k) m[i] = k;
  };
  const walk = (x: number, z: number, th: number, len: number, depth: number) => {
    for (let i = 0; i < len; i++) {
      th += (r() - 0.5) * 0.45;
      x += Math.sin(th) * 1.3;
      z -= Math.cos(th) * 1.3;
      if (Math.abs(x) > 27 || z < CR0 + 2) break;
      const v = Math.round(z * 2);
      put(x, v, 2);
      put(x, v + 1, 2);
      put(x + (th > 0 ? -1 : 1), v, 1);
      if (depth < 2 && r() < 0.07) walk(x, z, th + (r() < 0.5 ? -0.8 : 0.8), 4 + r() * 9, depth + 1);
    }
  };
  for (let k = 0; k < 6; k++) walk((r() - 0.5) * 10, TOWER_Z - 9, (k / 5 - 0.5) * 1.9 + (r() - 0.5) * 0.3, 18 + r() * 26, 0);
  return m;
}

/** 재와 눈이 섞이는 경계 (세계에 붙은 얼룩 — 걸어도 흔들리지 않는다) */
function blendTex(): Uint8Array {
  const d = new Uint8Array(65536);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) d[y * 256 + x] = Math.round((vnoise(x, y, 11, 41) * 0.75 + hash2(x, y, 42) * 0.25) * 255);
  return d;
}

/** 번개 (위에서 아래로 갈라짐, 가지 둘) */
function boltSprite(seed: number, h: number): HTMLCanvasElement {
  const W = 56;
  const g = new Grid(W, h);
  const core = new Grid(W, h);
  const r = rng(seed);
  const line = (x0: number, y0: number, x1: number, y1: number, fat: boolean) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      core.set(x, y, 0xfff2f6);
      if (fat) core.set(x + 1, y, 0xffd0dc);
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ])
        g.set(x + dx + (fat && dx > 0 ? 1 : 0), y + dy, 0xff3a5a, 200);
    }
  };
  const branch = (x: number, y: number, yEnd: number, spread: number, kids: number, fat: boolean) => {
    while (y < yEnd) {
      const nx = Math.max(2, Math.min(W - 3, x + (r() - 0.5) * spread));
      const ny = y + 3 + r() * 6;
      line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), fat);
      if (kids > 0 && r() < 0.14) {
        branch(nx, ny, Math.min(yEnd, ny + 14 + r() * 26), spread * 0.8, kids - 1, false);
        kids--;
      }
      x = nx;
      y = ny;
    }
  };
  branch(W / 2, 0, h - 2, 12, 2, true);
  g.draw(core, 0, 0);
  return g.toCanvas();
}

/** 구름 둑 (덩어리 진 폭풍 구름 — 속은 검붉고, 아래 가장자리가 불빛에 붉게 비친다) */
function cloudBank(w: number, h: number, seed: number, hell: boolean): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const buf = new Uint32Array(img.data.buffer);
  const dens = (x: number, y: number) => vnoise(x, y * 1.7, 46, seed) * 0.6 + vnoise(x, y * 1.4, 15, seed + 1) * 0.28 + vnoise(x, y, 5, seed + 2) * 0.12;
  // 0 속 · 1 윗면 · 2 아래 어스름 · 3 아래 붉은 빛 · 4 가장 밝은 테
  const pal = hell ? [0x12040a, 0x2a0a12, 0x5a1414, 0xb83a1c, 0xff8a3a] : [0x0c0410, 0x22081a, 0x4a1020, 0x9a2428, 0xe0583a];
  const D = new Float32Array(w * (h + 8));
  for (let y = 0; y < h + 8; y++) for (let x = 0; x < w; x++) D[y * w + x] = dens(x, y);
  for (let y = 0; y < h; y++) {
    const fade = y / h;
    const thr = 0.44 + 0.26 * fade * fade;
    for (let x = 0; x < w; x++) {
      const d = D[y * w + x];
      if (d < thr) continue;
      const b2 = D[(y + 2) * w + x] < thr;
      const b5 = D[(y + 5) * w + x] < thr;
      const up = y > 0 && D[(y - 1) * w + x] < thr;
      let k = 0;
      if (b2) k = hash2(x, y, 5) < 0.35 ? 4 : 3;
      else if (b5) k = (x + y) & 1 && d - thr < 0.05 ? 3 : 2;
      else if (up) k = 1;
      buf[y * w + x] = le(pal[k]);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 소용돌이 구름 한 덩이 */
function puff(seed: number, s: number): HTMLCanvasElement {
  const g = new Grid(s + 4, Math.ceil(s * 0.7) + 4);
  const r = rng(seed);
  const cy = g.h / 2;
  for (let i = 0; i < 5; i++) {
    const rx = s * (0.18 + r() * 0.14);
    g.ellipse(2 + rx + r() * (s - rx * 2), cy + (r() - 0.5) * s * 0.18, rx, rx * 0.7, 0x2a0a14);
  }
  // 아래쪽은 붉게 비친다
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      if (!g.filled(x, y)) continue;
      if (!g.filled(x, y + 1)) g.set(x, y, 0xf06a3e);
      else if (!g.filled(x, y + 2)) g.set(x, y, 0xa82a26);
      else if (!g.filled(x, y + 3)) g.set(x, y, 0x5a1620);
      else if (!g.filled(x, y - 1)) g.set(x, y, 0x3a1020);
      else g.set(x, y, 0x16060c);
    }
  return g.toCanvas();
}

/** 지평선 불길 (헬, 세 장) */
function fireStrip(w: number, frame: number): HTMLCanvasElement {
  const H = 34;
  const g = new Grid(w, H);
  for (let x = 0; x < w; x++) {
    const hgt = 6 + 20 * Math.pow(vnoise(x + frame * 7, frame * 3, 6, 31), 1.6) + 6 * vnoise(x, 0, 23, 32);
    for (let y = 0; y < hgt; y++) {
      const k = y / hgt + (BAYER[((H - y) & 3) * 4 + (x & 3)] - 0.5) * 0.25;
      const c = k < 0.3 ? 0xffe27a : k < 0.55 ? 0xff9a30 : k < 0.8 ? 0xe0461a : 0x8a1410;
      g.set(x, H - 1 - y, c);
    }
  }
  return g.toCanvas();
}

/** 땅 안개 띠 (붉게, 디더로 점점이) */
function fogStrip(w: number, h: number, seed: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const buf = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const edge = Math.sin((Math.PI * y) / h);
      const d = (vnoise(x, y * 2.2, 26, seed) * 0.7 + vnoise(x, y * 2, 9, seed + 1) * 0.3) * edge;
      if (d > 0.58) buf[y * w + x] = (((0.42 * 255) | 0) << 24) | (0x2a << 16) | (0x22 << 8) | 0xa8;
      else if (d > 0.47) buf[y * w + x] = (((0.26 * 255) | 0) << 24) | (0x1c << 16) | (0x14 << 8) | 0x80;
      else if (d > 0.38) buf[y * w + x] = (((0.13 * 255) | 0) << 24) | (0x18 << 16) | (0x10 << 8) | 0x60;
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 불붙은 사직서 (헬, 두 장) */
function letter(frame: number): HTMLCanvasElement {
  const g = new Grid(11, 13);
  g.rect(1, 1, 9, 11, 0xf2ead8);
  g.hline(2, 8, 2, 0x3a3030);
  for (const y of [4, 6, 8]) g.hline(2, frame ? 7 : 8, y, 0x9a9090);
  g.set(7, 2, 0xc02020);
  // 오른쪽 아래가 탄다 (숯 가장자리 + 불)
  for (let y = 5; y < 13; y++)
    for (let x = 4; x < 11; x++) {
      const d = x - 4 + y - 5;
      if (d > 9 + (hash2(x, y, frame) < 0.5 ? 1 : 0)) g.set(x, y, 0, 0);
      else if (d > 7) g.set(x, y, 0x2a1a14);
    }
  g.set(9, 10, 0xffd060);
  g.set(10, 9, 0xff8a28);
  g.set(8, 11, frame ? 0xff8a28 : 0xffd060);
  g.set(10, 8, frame ? 0xffd060 : 0xe04018);
  g.outline(0x1f1d1a);
  return g.toCanvas();
}


export type IntroArt = {
  road: Uint32Array;
  snow: Uint32Array;
  ash: Uint32Array;
  crack: Uint8Array;
  blend: Uint8Array;
  objs: Obj[];
  hero: HTMLCanvasElement[];
  heroRim: HTMLCanvasElement[];
  heroSil: HTMLCanvasElement[];
  lampOff: HTMLCanvasElement;
  lampGlow: HTMLCanvasElement;
  lampRed: HTMLCanvasElement;
  towerGlow: HTMLCanvasElement;
  puffs: HTMLCanvasElement[];
  bolts: HTMLCanvasElement[];
  letters: HTMLCanvasElement[];
};

/** 그림 한 번 굽기 (내 캐릭터 뒷모습 걷기 네 장 + 등대·소나무·가로등) */
export function buildIntroArt(me: { body: string; color: string; look: readonly string[] }): IntroArt {
  const trees: Spr[] = [0, 1, 2, 3].map((v) => {
    const c = tint(snowPine(v), "#7a86b8");
    return { c, sil: silhouette(c, "#0c0408") };
  });
  const lampC = streetLamp();
  const lampN = tint(lampC, "#8a90b0");
  const lamp: Spr = { c: lampN, sil: silhouette(lampN, "#0c0408") };
  // 꺼진 가로등: 머리 유리를 어둡게
  const off = makeCanvas(lampN.width, lampN.height);
  off.ctx.drawImage(lampN, 0, 0);
  off.ctx.fillStyle = "#24202a";
  off.ctx.fillRect(4, 3, 4, 4);
  const head = makeCanvas(lampC.width, 8);
  head.ctx.drawImage(lampC, 0, 0, lampC.width, 8, 0, 0, lampC.width, 8);
  const tw = tint(bodyCanvas(), "#7480b0");
  const tower: Spr = { c: tw, sil: silhouette(tw, "#08030a") };
  const objs: Obj[] = [];
  const r = rng(5150);
  let n = 0;
  for (let z = 30; z < 460; z += 10 + r() * 14)
    for (const side of [-1, 1]) {
      const x = side * (36 + r() * (40 + z * 0.35));
      const zz = z + r() * 4;
      // 등대 바로 앞뒤 가운데는 비운다
      if (Math.abs(zz - TOWER_Z) < 26 && Math.abs(x) < 52) continue;
      objs.push({ kind: "tree", s: trees[Math.floor(r() * trees.length)], x, z: zz, i: n++ });
    }
  for (const z of [96, 150, 204, 280, 340]) for (const side of [-1, 1]) objs.push({ kind: "lamp", s: lamp, x: side * 23, z, i: n++, doorLamp: z === 204 });
  objs.push({ kind: "tower", s: tower, x: 0, z: TOWER_Z, i: n++ });
  objs.sort((a, b) => b.z - a.z);
  const hero = [2, 3, 4, 5].map((col) => tint(avatarFrameGrid(me.body, "up", col, me.color, me.look).toCanvas(), "#8a92c0"));
  return {
    road: roadTex(),
    snow: snowTex(),
    ash: ashTex(),
    crack: crackMask(),
    blend: blendTex(),
    objs,
    hero,
    heroRim: hero.map((c) => rim(c, 0xff3a2a)),
    heroSil: hero.map((c) => silhouette(c, "#14060c")),
    lampOff: off.canvas,
    lampGlow: head.canvas,
    lampRed: tint(silhouette(head.canvas, "#ffffff"), "#ff3020"),
    towerGlow: glowCanvas(),
    puffs: [11, 12, 13, 14].map((sd, i) => puff(sd, 16 + i * 5)),
    bolts: [boltSprite(71, 150), boltSprite(93, 130)],
    letters: [letter(0), letter(1)],
  };
}

export type IntroFrame = { tf: string; vig: number; hot: number };
export type IntroView = { draw(ms: number, still: boolean): IntroFrame };

/** 화면 하나 (w×h 작은 캔버스) */
export function makeIntroView(cv: HTMLCanvasElement, art: IntroArt, mode: IntroMode, w: number, h: number, beats: readonly number[]): IntroView {
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const hell = mode === "hell";
  const hy = h - 144;
  const cx = w / 2;
  const img = ctx.createImageData(w, h - hy - 1);
  const buf = new Uint32Array(img.data.buffer);
  const zRow = new Float32Array(h);
  for (let y = hy + 1; y < h; y++) zRow[y] = K / (y - hy);
  const EDGE_D = le(0x221e2c);
  const EDGE_C = le(0x8a96b8);
  // 하늘 둘 (밤 · 폭풍) — 별·달은 밤 하늘에만
  const skyN = ditherSky(w, hy + 1, [
    [0, 0x070a22],
    [0.55, 0x161e48],
    [1, 0x34406e],
  ]);
  {
    const r = rng(88);
    for (let i = 0; i < 60; i++) {
      skyN.getContext("2d")!.fillStyle = i % 5 === 0 ? "#fff2c0" : "#c8d4f0";
      skyN.getContext("2d")!.fillRect(Math.floor(r() * w), Math.floor(r() * (hy - 14)), 1, 1);
    }
  }
  const skyS = ditherSky(
    w,
    hy + 1,
    hell
      ? [
          [0, 0x060104],
          [0.35, 0x1e0408],
          [0.75, 0x6a1208],
          [1, 0xd8501a],
        ]
      : [
          [0, 0x050106],
          [0.4, 0x16040c],
          [0.8, 0x4a0c12],
          [1, 0x9a2418],
        ],
  );
  // 핏빛 달 (폭풍 하늘, 구름 뒤)
  const moon = new Grid(15, 15);
  moon.ellipse(7, 7, 6.5, 6.5, 0xc0302a);
  moon.ellipse(5, 5, 3, 3, 0xe0503a);
  moon.set(9, 9, 0x8a1c1c);
  moon.set(10, 6, 0x8a1c1c);
  moon.set(4, 9, 0x8a1c1c);
  const moonC = moon.toCanvas();
  // 먼 능선 (밤 · 폭풍 실루엣)
  const ridge = (fill: string, top: string) => {
    const { canvas, ctx: c } = makeCanvas(w, 26);
    for (let x = 0; x < w; x++) {
      const t = 25 - 6 - 12 * vnoise(x, 0, 38, 3) - 4 * vnoise(x, 0, 11, 5);
      c.fillStyle = fill;
      c.fillRect(x, Math.floor(t) + 1, 1, 26);
      c.fillStyle = top;
      c.fillRect(x, Math.floor(t), 1, 1);
    }
    return canvas;
  };
  const ridgeN = ridge("#222c52", "#6a7aa8");
  const ridgeS = ridge("#0e0408", hell ? "#ff7a30" : "#c83a2a");
  const bankH = Math.round(hy * 0.62);
  const bank = cloudBank(w + 90, bankH, hell ? 41 : 40, hell);
  const bank2 = cloudBank(w + 90, Math.round(bankH * 0.7), 55, hell);
  const fire = hell ? [0, 1, 2].map((f) => fireStrip(w, f)) : [];
  const fogH = Math.round((h - hy) * 0.55);
  const fogs = [fogStrip(w + 120, fogH, 61), fogStrip(w + 120, Math.round(fogH * 0.7), 63)];
  // 재·불티
  const motes = Array.from({ length: Math.round((w * h) / 520) }, (_, i) => ({
    x: hash2(i, 1, 4) * w,
    y: hash2(i, 2, 4) * h,
    s: 0.3 + hash2(i, 3, 4) * 0.7,
    d: hash2(i, 4, 4) * 6.28,
    ember: hash2(i, 5, 4),
    big: hash2(i, 6, 4) < 0.2,
  }));
  const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));
  const boltAt = bolts(mode);
  const sils: { c: HTMLCanvasElement; x: number; y: number; w: number; h: number; k: number; gy: number }[] = [];

  return {
    draw(ms0, still) {
      const ms = ms0;
      const s = storm(ms, mode);
      const fl = still ? 0 : boltFlash(ms, mode);
      const sp = spot(ms);
      const dr = door(ms);
      const adv = advance(ms);
      const A = ADV * adv;
      const t = ms / 1000;
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      // 하늘: 밤 → 폭풍
      ctx.drawImage(skyN, 0, 0);
      ctx.globalAlpha = s;
      ctx.drawImage(skyS, 0, 0);
      ctx.globalAlpha = Math.min(1, s * 1.4);
      ctx.drawImage(moonC, Math.round(w * 0.17), Math.round(hy * 0.22));
      // 구름 둑 (흐른다)
      ctx.globalAlpha = Math.min(1, s * 1.25);
      ctx.drawImage(bank, -Math.round(10 + t * 9), -4);
      ctx.drawImage(bank2, -Math.round(70 - t * 6), Math.round(hy * 0.32));
      ctx.globalAlpha = 1;
      // 번개 (탑 뒤)
      let boltI = -1;
      for (let i = 0; i < boltAt.length; i++) if (ms >= boltAt[i] && ms < boltAt[i] + 260) boltI = i;
      // 헬: 지평선 불길 + 불빛
      if (hell) {
        const g = ctx.createLinearGradient(0, hy - 46, 0, hy);
        g.addColorStop(0, "rgba(255,90,30,0)");
        g.addColorStop(1, `rgba(255,110,40,${0.45 * (0.6 + 0.4 * s)})`);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(0, hy - 46, w, 46);
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(fire[Math.floor(ms / 110) % 3], 0, hy - 30);
      }
      // 먼 능선
      ctx.drawImage(ridgeN, 0, hy - 25);
      ctx.globalAlpha = s;
      ctx.drawImage(ridgeS, 0, hy - 25);
      ctx.globalAlpha = 1;
      // 바닥 (모드7): 돌길 · 눈밭 → 탑 가까이는 탄 땅 · 갈라진 틈(속불이 박동에 맞춰 숨쉰다)
      const hb = pulse(ms, beats);
      const hz = mixC(0x2e3866, hell ? 0x6a1a0e : 0x3a0c14, s);
      const hzR = (hz >> 16) & 255;
      const hzG = (hz >> 8) & 255;
      const hzB = hz & 255;
      const crE = le(mixC(0x221418, 0x7a1a0c, s));
      const crC = le(mixC(0x2a1418, mixC(0xff5a1a, 0xffe08a, 0.25 + 0.6 * hb), s));
      const ashOn = 0.25 + 0.75 * s;
      for (let y = hy + 1; y < h; y++) {
        const z = zRow[y];
        const du = (z / F) * 2;
        const wz = z + A;
        const v = ((wz * 2) | 0) & 255;
        const ashT = (Math.min(1, Math.max(0, (wz - 110) / 90)) * ashOn * 255) | 0;
        const cr = wz > CR0 && wz < CR1;
        const fog = Math.min(0.8, Math.max(0, (z - 60) / 260));
        const fh = (fog * 256) | 0;
        const o = (y - hy - 1) * w;
        for (let x = 0; x < w; x++) {
          const wx = (x - cx) * du;
          const aw = Math.abs(wx);
          const iu = Math.floor(wx) & 255;
          const ti = v * 256 + iu;
          let c: number;
          if (aw < 28) {
            c = art.road[ti];
            if (cr) {
              const m = art.crack[ti];
              if (m) c = m === 2 ? crC : crE;
            }
          } else if (aw < 31) c = aw < 29.5 ? EDGE_D : EDGE_C;
          else c = ashT > art.blend[ti] ? art.ash[ti] : art.snow[ti];
          if (fh) {
            const r = c & 255;
            const g = (c >> 8) & 255;
            const b = (c >> 16) & 255;
            c = ((255 << 24) | ((b + (((hzB - b) * fh) >> 8)) << 16) | ((g + (((hzG - g) * fh) >> 8)) << 8) | (r + (((hzR - r) * fh) >> 8))) >>> 0;
          }
          buf[o + x] = c;
        }
      }
      ctx.putImageData(img, 0, hy + 1);
      // 붉은 땅 안개 (옆으로 흐른다)
      if (s > 0.05) {
        ctx.globalAlpha = Math.min(1, s * 1.2);
        ctx.drawImage(fogs[0], -Math.round(20 + t * 14), hy - 6);
        ctx.drawImage(fogs[1], -Math.round(100 - t * 10), h - fogs[1].height + 6);
        ctx.globalAlpha = 1;
      }
      // 소나무·가로등·등대 (먼 것부터)
      const lights: { x: number; y: number; r: number; c: number; a: number }[] = [];
      let lamp: { x: number; y: number; sc: number } | null = null;
      let doorBox: { x: number; y: number; w: number; h: number; sc: number } | null = null;
      sils.length = 0;
      const wind = still ? 0.06 : 0.025 + 0.085 * s;
      const drawPuffs = (front: boolean) => {
        if (!lamp || s < 0.08) return;
        const L = lamp;
        ctx.globalAlpha = Math.min(1, s * 1.3);
        for (let i = 0; i < 22; i++) {
          const a = hash2(i, 1, 9) * 6.28 + t * (0.8 + 0.9 * s) * (1 + hash2(i, 2, 9) * 0.5);
          const sn = Math.sin(a);
          if (sn >= 0 !== front) continue;
          const rr = (18 + hash2(i, 3, 9) * 34) * L.sc;
          const pc = art.puffs[i % art.puffs.length];
          const pw = Math.round(pc.width * L.sc * 1.25);
          const ph = Math.round(pc.height * L.sc * 1.25);
          const px = L.x + Math.cos(a) * rr;
          const py = L.y + sn * rr * 0.24 - (6 + hash2(i, 4, 9) * 22) * L.sc;
          ctx.drawImage(pc, Math.round(px - pw / 2), Math.round(py - ph / 2), pw, ph);
        }
        ctx.globalAlpha = 1;
      };
      for (const ob of art.objs) {
        const zr = ob.z - A;
        if (zr < (ob.kind === "tree" ? 34 : 22)) continue;
        const sc = (F / zr) * (ob.kind === "tower" ? TS : 1);
        const sx = cx + ob.x * (F / zr);
        const gy = hy + K / zr;
        let c = ob.s.c;
        const dw = Math.max(1, Math.round(c.width * sc));
        const dh = Math.max(1, Math.round(c.height * sc));
        if (sx + dw < 0 || sx - dw > w) continue;
        const dx = Math.round(sx - dw / 2);
        const dy = Math.round(gy - dh);
        if (ob.kind === "tower") {
          lamp = { x: dx + LAMP_AT.x * sc, y: dy + LAMP_AT.y * sc, sc };
          drawPuffs(false);
          ctx.drawImage(c, dx, dy, dw, dh);
          // 빛 층: 따뜻한 등 → 붉게
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 1 - 0.5 * s;
          ctx.drawImage(art.towerGlow, dx, dy, dw, dh);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
          doorBox = { x: dx + DOOR_R.x * sc, y: dy + DOOR_R.y * sc, w: DOOR_R.w * sc, h: DOOR_R.h * sc, sc };
          lights.push({ x: lamp.x, y: lamp.y, r: Math.min(140, 34 * sc), c: mixC(0xffe8a0, 0xff3020, s), a: 0.6 });
          sils.push({ c: ob.s.sil, x: dx, y: dy, w: dw, h: dh, k: 0, gy });
          continue;
        }
        if (ob.kind === "lamp") {
          // 지나가면 깜빡이다 꺼진다 (문 앞 둘은 폭풍이 오면 빨갛게)
          let on = 1;
          if (!ob.doorLamp && zr < 98) on = zr < 72 ? 0 : hash2(Math.floor(ms / 55), ob.i, 3) < (zr - 72) / 26 ? 1 : 0;
          if (!still && s > 0.5 && s < 0.62 && hash2(Math.floor(ms / 40), ob.i, 5) < 0.5) on = 0;
          if (!on) c = art.lampOff;
          ctx.drawImage(c, dx, dy, dw, dh);
          if (on) {
            const red = s > 0.55;
            ctx.globalCompositeOperation = "lighter";
            ctx.drawImage(red ? art.lampRed : art.lampGlow, dx, dy, dw, Math.max(1, Math.round(8 * sc)));
            ctx.globalCompositeOperation = "source-over";
            lights.push({ x: dx + 6 * sc, y: dy + 5 * sc, r: Math.min(110, 20 * sc), c: red ? 0xff2a1a : 0xffc070, a: red ? 0.55 : 0.45 });
          }
          sils.push({ c: ob.s.sil, x: dx, y: dy, w: dw, h: dh, k: 0, gy });
          continue;
        }
        // 소나무: 바람에 휜다 (밑동은 그대로, 위가 밀린다)
        const k = -wind * (0.7 + 0.3 * Math.sin(t * 2.6 + ob.i * 1.7)) - (still ? 0 : wind * 0.6 * Math.max(0, Math.sin(t * 1.3 + ob.x * 0.02)));
        ctx.setTransform(1, 0, k, 1, -k * gy, 0);
        ctx.drawImage(c, dx, dy, dw, dh);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        sils.push({ c: ob.s.sil, x: dx, y: dy, w: dw, h: dh, k, gy });
      }
      drawPuffs(true);
      // 내 캐릭터 뒷모습 (아래 가운데, 문 앞에서 느려지며 선다)
      const stepD = A / 4.4;
      const f = still ? 0 : Math.floor(stepD) % 4;
      const vel = adv < 1 ? Math.min(1, (advance(ms + 16) - adv) * WALK_MS / 16 / 1.1) : 0;
      const bob = still ? 0 : Math.round(Math.abs(Math.sin(stepD * Math.PI * 0.5)) * 1.5 * vel);
      const rise = 6 + 12 * ease(adv);
      const hc = art.hero[f];
      const hs = 2;
      const hw = hc.width * hs;
      const hh = hc.height * hs;
      const hx = Math.round(cx - hw / 2);
      const hyy = Math.round(h - 8 - rise - bob - hh);
      // 문에서 쏟아지는 붉은 빛 (땅 → 나까지)
      const D = doorBox as { x: number; y: number; w: number; h: number; sc: number } | null;
      if (D && dr > 0) {
        const gx0 = D.x + D.w / 2;
        const gb = D.y + D.h;
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createLinearGradient(0, gb, 0, h);
        g.addColorStop(0, rgba(0xff4a20, 0.55 * dr));
        g.addColorStop(1, rgba(0xff2010, 0));
        ctx.fillStyle = g;
        const open = D.w * dr;
        ctx.beginPath();
        ctx.moveTo(gx0 - open / 2, gb);
        ctx.lineTo(gx0 + open / 2, gb);
        ctx.lineTo(gx0 + open * 2.6, h);
        ctx.lineTo(gx0 - open * 2.6, h);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.drawImage(hc, hx, hyy, hw, hh);
      // 열린 문 빛에 등이 검게
      if (dr > 0) {
        ctx.globalAlpha = 0.55 * dr;
        ctx.drawImage(art.heroSil[f], hx, hyy, hw, hh);
        ctx.globalAlpha = 1;
      }
      // 헬: 불붙은 사직서가 바람에 날아간다 (폭풍 색이 같이 입혀진다, 불빛은 나중에)
      const embers: { x: number; y: number; r: number }[] = [];
      if (hell) {
        for (let i = 0; i < 6; i++) {
          const start = 300 + i * 680;
          const life = 2300 + hash2(i, 1, 7) * 900;
          const k = (ms - start) / life;
          if (still ? i !== 2 : k < 0 || k > 1) continue;
          const kk = still ? 0.45 : k;
          const near = 0.8 + hash2(i, 2, 7) * 0.9;
          const lx = -20 + kk * (w + 40);
          const ly = h * (0.25 + hash2(i, 3, 7) * 0.5) - kk * h * 0.25 + Math.sin(kk * 9 + i) * 10;
          const lc = art.letters[Math.floor(ms / 120 + i) % 2];
          ctx.save();
          ctx.translate(Math.round(lx), Math.round(ly));
          ctx.rotate(kk * 7 + i);
          ctx.scale(near * Math.max(0.35, Math.abs(Math.cos(kk * 11 + i))), near);
          ctx.drawImage(lc, -lc.width / 2, -lc.height / 2);
          ctx.restore();
          embers.push({ x: lx, y: ly, r: 7 * near });
        }
      }
      // 폭풍 색 입히기 (곱하기 — 모두 붉고 어둡게)
      if (s > 0) {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = rgba(mixC(0xffffff, hell ? 0xc05a44 : 0xa86064, s), 1);
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
      // 문: 삐걱 열리며 안에서 붉은 빛
      if (D && dr > 0) {
        const sc = D.sc;
        const px = (v: number) => Math.round(v);
        ctx.fillStyle = "#2a0606";
        ctx.fillRect(px(D.x), px(D.y), px(D.w), px(D.h));
        const inner = D.w * dr;
        const ix = D.x + (D.w - inner) / 2;
        const g = ctx.createLinearGradient(0, D.y, 0, D.y + D.h);
        g.addColorStop(0, "#8a1408");
        g.addColorStop(0.6, "#ff4a1a");
        g.addColorStop(1, "#ffd27a");
        ctx.fillStyle = g;
        ctx.fillRect(px(ix), px(D.y + sc), Math.max(1, px(inner)), px(D.h - sc));
        // 두 문짝 (안쪽으로 접히며 좁아진다)
        const leaf = Math.max(0, ((D.w - inner) / 2) | 0);
        ctx.fillStyle = "#3a2214";
        ctx.fillRect(px(D.x), px(D.y), leaf, px(D.h));
        ctx.fillRect(px(D.x + D.w - leaf), px(D.y), leaf, px(D.h));
        ctx.globalCompositeOperation = "lighter";
        lights.push({ x: D.x + D.w / 2, y: D.y + D.h * 0.6, r: Math.min(160, (30 + 50 * dr) * sc), c: 0xff3a14, a: 0.7 * dr });
        ctx.globalCompositeOperation = "source-over";
      }
      // 불빛 번짐
      ctx.globalCompositeOperation = "lighter";
      for (const e of embers) lights.push({ x: e.x, y: e.y, r: e.r, c: 0xff8a2a, a: 0.55 });
      for (const l of lights) {
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
        g.addColorStop(0, rgba(l.c, l.a));
        g.addColorStop(1, rgba(l.c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      // 등대 빛줄기: 쓸다가 나를 찾아 멈춘다 (빨갛게)
      if (lamp) {
        const L: { x: number; y: number; sc: number } = lamp;
        const px = cx;
        const py = hyy + hh * 0.45;
        const aim = Math.atan2((py - L.y) / 0.55, px - L.x);
        const sweep = still ? aim : 0.75 * Math.sin(ms / 900);
        const th = sweep + (aim - sweep) * sp;
        const dist = Math.hypot(px - L.x, (py - L.y) / 0.55);
        const R = Math.max(w, h) * 1.2 * (1 - sp) + dist * 1.12 * sp;
        const bc = mixC(0xdcecff, 0xff2a1a, Math.min(1, s * 1.3));
        const wid = 0.09 + 0.05 * sp;
        for (const a of sp > 0.5 ? [th] : [th, th + Math.PI]) {
          // 납작하게 그리므로 번짐 끝도 화면 위 실제 길이에 맞춘다 (끝이 칼처럼 잘리지 않게)
          const len = Math.hypot(Math.cos(a) * R, Math.sin(a) * R * 0.55);
          const g = ctx.createRadialGradient(L.x, L.y, 2, L.x, L.y, len);
          g.addColorStop(0, rgba(bc, 0.5 + 0.2 * sp));
          g.addColorStop(1, rgba(bc, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(L.x, L.y);
          ctx.lineTo(L.x + Math.cos(a - wid) * R, L.y + Math.sin(a - wid) * R * 0.55);
          ctx.lineTo(L.x + Math.cos(a + wid) * R, L.y + Math.sin(a + wid) * R * 0.55);
          ctx.closePath();
          ctx.fill();
        }
        // 들킴: 내 발밑 빛 동그라미 + 몸 가장자리 빨갛게
        if (sp > 0) {
          const rx = hw * 0.9;
          const g = ctx.createRadialGradient(px, h - 8 - rise, 0, px, h - 8 - rise, rx);
          g.addColorStop(0, rgba(0xff3a20, 0.5 * sp));
          g.addColorStop(1, rgba(0xff3a20, 0));
          ctx.fillStyle = g;
          ctx.setTransform(1, 0, 0, 0.35, 0, (h - 8 - rise) * 0.65);
          ctx.fillRect(px - rx, h - 8 - rise - rx, rx * 2, rx * 2);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
      const rimA = Math.max(sp, dr * 0.9);
      if (rimA > 0) {
        ctx.globalAlpha = rimA;
        ctx.drawImage(art.heroRim[f], hx, hyy, hw, hh);
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = "source-over";
      // 번개: 하늘이 번쩍, 줄기, 탑·나무가 검은 실루엣
      if (fl > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgba(hell ? 0xff7a50 : 0xff4a4a, 0.75 * fl);
        ctx.fillRect(0, 0, w, hy + 2);
        ctx.fillStyle = rgba(0xff3a4a, 0.22 * fl);
        ctx.fillRect(0, hy + 2, w, h - hy);
        ctx.globalCompositeOperation = "source-over";
        if (boltI >= 0 && fl > 0.3 && lamp) {
          const L: { x: number; y: number; sc: number } = lamp;
          const b = art.bolts[boltI % art.bolts.length];
          const bx = Math.round(L.x + (boltI % 2 ? 1 : -1) * (40 + 20 * (boltI % 3)) - b.width / 2);
          const bh = Math.min(b.height, hy - 2);
          ctx.globalCompositeOperation = "lighter";
          const gl = ctx.createRadialGradient(bx + b.width / 2, bh * 0.4, 0, bx + b.width / 2, bh * 0.4, bh * 0.8);
          gl.addColorStop(0, rgba(0xff4a6a, 0.45 * fl));
          gl.addColorStop(1, rgba(0xff4a6a, 0));
          ctx.fillStyle = gl;
          ctx.fillRect(bx + b.width / 2 - bh, 0, bh * 2, bh * 1.2);
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(b, 0, 0, b.width, bh, bx, 0, b.width, bh);
        }
        ctx.globalAlpha = Math.min(1, fl * 1.1);
        for (const si of sils) {
          if (si.k) ctx.setTransform(1, 0, si.k, 1, -si.k * si.gy, 0);
          ctx.drawImage(si.c, si.x, si.y, si.w, si.h);
          if (si.k) ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ctx.drawImage(art.heroSil[f], hx, hyy, hw, hh);
        ctx.globalAlpha = 1;
      }
      // 재·불티 (바람 따라 위로)
      const up = 8 + 22 * s;
      for (const m of motes) {
        const fx0 = still ? m.x : m.x + t * (10 + 26 * s) * m.s + Math.sin(t * 1.7 + m.d) * 5;
        const fy0 = still ? m.y : m.y - t * up * (0.5 + m.s);
        const fx = ((fx0 % w) + w) % w;
        const fy = ((fy0 % h) + h) % h;
        if (m.ember < 0.15 + 0.6 * s) {
          const tw = hash2(Math.floor(ms / 90), m.d * 100, 2) < 0.2;
          ctx.fillStyle = tw ? "#ffe08a" : m.ember < 0.3 ? "#ff8a30" : "#e0401a";
          ctx.fillRect(Math.floor(fx), Math.floor(fy), m.big ? 2 : 1, m.big && !tw ? 2 : 1);
        } else {
          ctx.fillStyle = s > 0.5 ? "#6a5a60" : "#a8acc0";
          ctx.fillRect(Math.floor(fx), Math.floor(fy), m.big ? 2 : 1, 1);
        }
      }
      // 처음: 어둠에서 / 끝: 붉게 타오름
      const fadeIn = still ? 0 : 1 - smooth(0, 420, ms);
      if (fadeIn > 0) {
        ctx.fillStyle = `rgba(0,0,0,${fadeIn})`;
        ctx.fillRect(0, 0, w, h);
      }
      const burn = smooth(WALK_MS - 250, WALK_MS + 450, ms);
      if (burn > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = rgba(0xff3a1a, 0.5 * burn);
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
      // 카메라: 천천히 밀어 들어가기 + 커지는 손떨림 + 박동
      const sh = still ? 0 : shake(ms, mode) * (hell ? 7 : 5.5);
      const jx = sh * (Math.sin(ms * 0.031) * 0.6 + Math.sin(ms * 0.083 + 1.3) * 0.4);
      const jy = sh * (Math.sin(ms * 0.027 + 2.1) * 0.6 + Math.sin(ms * 0.071) * 0.4);
      const zoom = 1 + 0.07 * ease(ms / WALK_MS) + 0.012 * hb + (still ? 0.04 : 0);
      return {
        tf: `translate(${jx.toFixed(1)}px, ${jy.toFixed(1)}px) scale(${zoom.toFixed(4)})`,
        vig: Math.min(1, 0.35 + 0.4 * s + 0.25 * hb + 0.2 * sp),
        hot: Math.min(1, s * 0.6 + sp * 0.4 + hb * 0.2),
      };
    },
  };
}
