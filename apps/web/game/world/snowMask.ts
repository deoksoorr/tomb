import type * as Phaser from "phaser";
import { CHAR_PROP } from "./charTint";

// 11/18 눈싸움 마을 표현 (사용자 「집에다가 던지니까 아예 표현이 안 되네?」 · 「묘비한테도 안 맞아」 · 「고양이한테 맞춰도 아예 위에 올라가 있네」):
//  - 그림의 불투명 픽셀을 한 번 구워 둔다 (프레임마다 한 번 — FrameMask). 고양이·강아지처럼 위가 비어 있는 그림도 실제 몸 높이로 맞는다
//  - 마을의 키 큰 물체(건물·가게·나무·가로등·벤치 — 밑동에 맵 충돌이 있는 그림)와 묘비 그림을 칸으로 묶어 둔다 (SnowOccluders).
//    날아가는 공이 그 그림 뒤로 들어가려는 순간(공 깊이 < 그림 깊이, 보이는 공이 불투명 픽셀 위) 그 그림 앞면에 박힌다
//    → 퍽·자국을 그림 깊이 + 1로 그려 앞에 보인다 (예전엔 충돌 상자 밑동 깊이로 그려 집 그림 뒤에 숨었다)
//  - 낮은 물체(벤치·울타리)는 공이 그 그림보다 높이 날면 위로 넘어간다 (over)

/** 프레임 하나의 불투명 픽셀 (frame 실제 크기 기준) + 불투명 상자 */
export type FrameMask = { w: number; h: number; a: Uint8Array; top: number; bottom: number; left: number; right: number };

const ALPHA_MIN = 96;
const masks = new WeakMap<Phaser.Textures.Frame, FrameMask | null>();
let canvas: HTMLCanvasElement | null = null;

/** 프레임의 불투명 픽셀 (처음 한 번 굽는다). 읽을 수 없는 그림(렌더 텍스처 등)이면 null */
export function frameMask(frame: Phaser.Textures.Frame | null | undefined): FrameMask | null {
  if (!frame) return null;
  const had = masks.get(frame);
  if (had !== undefined) return had;
  let m: FrameMask | null = null;
  try {
    m = bakeMask(frame);
  } catch {
    m = null;
  }
  masks.set(frame, m);
  return m;
}

function bakeMask(frame: Phaser.Textures.Frame): FrameMask | null {
  const src = frame.source?.image as unknown;
  if (typeof document === "undefined" || !(src instanceof HTMLImageElement || src instanceof HTMLCanvasElement || (typeof ImageBitmap !== "undefined" && src instanceof ImageBitmap))) return null;
  const w = Math.round(frame.realWidth);
  const h = Math.round(frame.realHeight);
  if (!(w > 0 && h > 0) || w * h > 512 * 512) return null;
  canvas ??= document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  g.clearRect(0, 0, w, h);
  // 잘라 낸(trim) 프레임은 원래 자리(frame.x, frame.y)에 놓는다
  const ox = frame.trimmed ? frame.x : 0;
  const oy = frame.trimmed ? frame.y : 0;
  g.drawImage(src as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, ox, oy, frame.cutWidth, frame.cutHeight);
  const px = g.getImageData(0, 0, w, h).data;
  const a = new Uint8Array(w * h);
  let top = h,
    bottom = -1,
    left = w,
    right = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < ALPHA_MIN) continue;
      a[y * w + x] = 1;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  if (bottom < 0) return null;
  return { w, h, a, top, bottom, left, right };
}

type Img = Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;

/** 그림의 화면 상자 (회전 없는 그림만) */
export function imgRect(img: Img): { left: number; top: number; sx: number; sy: number } {
  return { left: img.x - img.originX * img.displayWidth, top: img.y - img.originY * img.displayHeight, sx: Math.abs(img.scaleX) || 1, sy: Math.abs(img.scaleY) || 1 };
}

/** 그림의 보이는 불투명 상자 (화면 좌표). 마스크가 없으면 그림 상자 전체 */
export function opaqueRect(img: Img): { left: number; top: number; right: number; bottom: number } {
  const r = imgRect(img);
  const m = frameMask(img.frame);
  if (!m) return { left: r.left, top: r.top, right: r.left + img.displayWidth, bottom: r.top + img.displayHeight };
  const l = img.flipX ? m.w - 1 - m.right : m.left;
  const rr = img.flipX ? m.w - 1 - m.left : m.right;
  const t = img.flipY ? m.h - 1 - m.bottom : m.top;
  const b = img.flipY ? m.h - 1 - m.top : m.bottom;
  return { left: r.left + l * r.sx, top: r.top + t * r.sy, right: r.left + (rr + 1) * r.sx, bottom: r.top + (b + 1) * r.sy };
}

/** 화면 점 (x, y)가 그림의 불투명 픽셀 위인가 (마스크가 없으면 상자 안이면 true) */
export function opaqueAt(img: Img, x: number, y: number): boolean {
  const r = imgRect(img);
  const u = Math.floor((x - r.left) / r.sx);
  const v = Math.floor((y - r.top) / r.sy);
  const m = frameMask(img.frame);
  if (!m) return u >= 0 && v >= 0 && x < r.left + img.displayWidth && y < r.top + img.displayHeight;
  if (u < 0 || v < 0 || u >= m.w || v >= m.h) return false;
  const uu = img.flipX ? m.w - 1 - u : u;
  const vv = img.flipY ? m.h - 1 - v : v;
  return m.a[vv * m.w + uu] === 1;
}

/**
 * 화면 점 (x, y)에서 그림의 불투명 픽셀을 아래로 따라 내려간 끝 (화면 y). 그 픽셀이 땅에 닿는 자리로 본다:
 * 벽·기둥이면 밑동, 마당 디딤돌·길처럼 땅에 깔린 것이면 그 자리 그대로 (공이 그 위를 날아가면 앞에 있는 것). 빈칸 2px까지는 잇는다.
 * 마스크가 없으면 그림 밑
 */
export function opaqueFoot(img: Img, x: number, y: number): number {
  const r = imgRect(img);
  const m = frameMask(img.frame);
  if (!m) return r.top + img.displayHeight;
  const u0 = Math.floor((x - r.left) / r.sx);
  let v = Math.floor((y - r.top) / r.sy);
  if (u0 < 0 || u0 >= m.w) return r.top + img.displayHeight;
  const u = img.flipX ? m.w - 1 - u0 : u0;
  const at = (vv: number) => vv >= 0 && vv < m.h && m.a[(img.flipY ? m.h - 1 - vv : vv) * m.w + u] === 1;
  let last = v;
  for (let gap = 0; v < m.h && gap <= 2; v++) {
    if (at(v)) {
      last = v;
      gap = 0;
    } else gap++;
  }
  return r.top + (last + 1) * r.sy;
}

/** 칸 하나에 묶인 물체 */
type Occ = { img: Img; x: number; y: number; frame: Phaser.Textures.Frame; left: number; top: number; right: number; bottom: number; depth: number; grave: boolean; low: boolean };

/** 칸 크기 (px) · 다시 굽는 간격 (공이 날 때만 — 물체가 생기거나 없어진 걸 따라간다) */
const CELL = 32;
const REBAKE_MS = 1_000;
/** 묘비는 얇다: 공이 묘비 깊이보다 이만큼 안쪽(뒤)일 때만 닿는다 */
const GRAVE_THICK = 8;
/** 공 반지름 (보이는 공 아랫가장자리가 닿아도 맞는다 — 낮은 의자 등받이를 스치듯 넘지 않게) */
const BALL_R = 3;
/** 이 키 이하 물체(의자·벤치·탁자)는 그림 상자 전체로 잰다 — 등받이 옆 빈칸으로 스치듯 넘지 않고 맞는다 (11/18 「의자에 맞게」) */
const LOW_H = 24;
const GRAVE_KEY = /(^|~)(grave-|gy-old-)/;
/** 허공에 걸린 줄 장식(전구 줄)은 공을 막지 않는다 */
const SKIP_KEY = /(string|garland|mist|glow)/;
const PROP_KEY = /(chair|bench|table|stool|seat|stump|swing|hammock|snowman|gifts|xtree|cairn|lamp|lantern|kiosk|well|fountain|trampoline|telescope|board|placard|timetable|shelter|stall|woodpile|pine|tree|bare|dead|sign)/;

export type SnowOccludersOpts = {
  scene: Phaser.Scene;
  /** 맵 충돌 칸 (밑동이 막힌 그림만 물체로 친다 — 바닥 장식·풀은 빠진다) */
  solid: (x: number, y: number) => boolean;
  /** 빼야 할 그림 (NPC 그림 등 움직이는 것 — 묶을 때 한 번 묻는다) */
  skip?: () => ReadonlySet<unknown>;
};

/**
 * 마을의 공을 막는 그림들 (건물·가게·나무·가로등·벤치·울타리·묘비). 처음 공이 날 때 장면 그림을 훑어 칸(CELL)으로 묶고,
 * 공이 나는 동안 REBAKE_MS마다 다시 묶는다 (묘비가 생기거나 집이 바뀌어도 따라간다). 캐릭터 그림(CHAR_PROP)은 빠진다
 */
export class SnowOccluders {
  private cells = new Map<number, Occ[]>();
  private bakedAt = -Infinity;
  private readonly cols = 4096;

  constructor(private readonly o: SnowOccludersOpts) {}

  /** 공이 날고 있으면 부른다: 오래됐으면 다시 묶는다 */
  refresh(now: number): void {
    if (now - this.bakedAt < REBAKE_MS) return;
    this.bakedAt = now;
    this.bake();
  }

  /** 다음 공 때 다시 묶는다 */
  dirty(): void {
    this.bakedAt = -Infinity;
  }

  private bake(): void {
    this.cells = new Map();
    const skip = this.o.skip?.();
    for (const go of this.o.scene.children.list) {
      if (go.type !== "Image" && go.type !== "Sprite") continue;
      const img = go as Img;
      if (!img.visible || img.alpha < 0.5 || img.rotation !== 0 || img.blendMode !== 0 /* NORMAL */) continue;
      if ((img as unknown as Record<string, unknown>)[CHAR_PROP]) continue;
      if (!(img.depth >= 0 && img.depth < 0xffff)) continue;
      if (img.displayHeight < 8 || img.displayWidth < 3) continue;
      if (skip?.has(img)) continue;
      const key = img.texture?.key ?? "";
      // 사람이 세운 묘비(grave-*)와 묘역의 옛 묘비(gy-old-*) — 맵 충돌이 없어도 공을 막는다
      const grave = GRAVE_KEY.test(key);
      const left = img.x - img.originX * img.displayWidth;
      const top = img.y - img.originY * img.displayHeight;
      const right = left + img.displayWidth;
      const bottom = top + img.displayHeight;
      // 맵 충돌이 없는 앉는 자리·소품(의자·탁자·그네·눈사람·선물 상자…)도 공을 막는다 (11/18 사용자 「의자에다가 던지니까 의자 위로」)
      const prop = PROP_KEY.test(key);
      if (SKIP_KEY.test(key) || (!grave && !prop && !this.footed(left, right, top, bottom, img.depth))) continue;
      const occ: Occ = { img, x: img.x, y: img.y, frame: img.frame, left, top, right, bottom, depth: img.depth, grave, low: prop && img.displayHeight <= LOW_H };
      for (let cy = Math.floor(top / CELL); cy <= Math.floor((bottom - 0.01) / CELL); cy++)
        for (let cx = Math.floor(left / CELL); cx <= Math.floor((right - 0.01) / CELL); cx++) {
          const k = cy * this.cols + cx;
          const list = this.cells.get(k);
          if (list) list.push(occ);
          else this.cells.set(k, [occ]);
        }
    }
  }

  /** 그림 밑동(깊이 줄 위로 24px 안)에 맵 충돌이 있나 — 길을 막는 물체만 */
  private footed(left: number, right: number, top: number, bottom: number, depth: number): boolean {
    const base = Math.min(bottom, depth + 2);
    for (let y = Math.max(top, base - 24); y <= base + 2; y += 3) for (let x = left + 1; x < right - 1; x += 3) if (this.o.solid(x, y)) return true;
    return false;
  }

  private live(o: Occ): boolean {
    const i = o.img;
    return i.active && i.visible && i.alpha >= 0.5 && i.x === o.x && i.y === o.y && i.frame === o.frame;
  }

  /**
   * 공(바닥 x,y · 높이 z)이 지금 어느 그림 뒤로 들어가며 그 불투명 픽셀 위에 보이나 → 그 그림 (앞면에 박힌다). 없으면 null.
   * 공이 그림 깊이보다 그 그림 높이 넘게 뒤면 (멀리 뒤로 지나감) 아니다
   */
  hit(x: number, y: number, z: number): { depth: number; vy: number } | null {
    const vy = y - z;
    const list = this.cells.get(Math.floor((vy + BALL_R) / CELL) * this.cols + Math.floor(x / CELL));
    if (!list) return null;
    let best: Occ | null = null;
    for (const o of list) {
      if (x < o.left || x >= o.right || vy + BALL_R < o.top || vy >= o.bottom) continue;
      if (!(o.depth > y + 0.5)) continue;
      if (o.depth - y > (o.grave ? GRAVE_THICK : o.bottom - o.top + 4)) continue;
      if (!this.live(o)) continue;
      if (!o.low) {
        const py = opaqueAt(o.img, x, vy) ? vy : opaqueAt(o.img, x, vy + BALL_R) ? vy + BALL_R : null;
        // 그 픽셀이 땅에 닿는 자리보다 공이 앞(남쪽)이면 그 위를 날아가는 것 (마당 디딤돌·길)
        if (py === null || y >= opaqueFoot(o.img, x, py)) continue;
      }
      if (!best || o.depth > best.depth) best = o;
    }
    if (!best) return null;
    // 낮은 물체는 자국을 그 줄 그림 꼭대기 아래로 (의자 좌판 위 허공에 뜨지 않게)
    return { depth: best.depth, vy: best.low ? Math.max(vy, Math.min(best.bottom - 2, this.colTop(best, x) + 2)) : vy };
  }

  /** 막힌 자리(x,y)의 물체가 공(높이 z)보다 낮아 공이 위로 지나가나 (벤치·울타리 위로). 그 자리에 물체 그림이 없으면 false */
  over(x: number, y: number, z: number): boolean {
    const list = this.cells.get(Math.floor(y / CELL) * this.cols + Math.floor(x / CELL));
    if (!list) return false;
    const vy = y - z;
    let seen = false;
    for (const o of list) {
      if (x < o.left || x >= o.right || y < o.top || y > o.bottom + 2 || o.depth < y - 2) continue;
      if (!this.live(o)) continue;
      seen = true;
      // 이 줄에서 그림 꼭대기 (불투명 픽셀) 보다 공이 아래면 넘어가지 못한다
      if (vy + BALL_R >= (o.low ? o.top : this.colTop(o, x))) return false;
    }
    return seen;
  }

  /** 막힌 자리(x,y)에 선 물체 그림의 깊이 (자국을 그 앞에 그린다). 없으면 null */
  depthAt(x: number, y: number): number | null {
    const list = this.cells.get(Math.floor(y / CELL) * this.cols + Math.floor(x / CELL));
    if (!list) return null;
    let d: number | null = null;
    for (const o of list) {
      if (x < o.left || x >= o.right || y < o.top || y > o.bottom + 2 || o.depth < y - 2) continue;
      if (!this.live(o)) continue;
      if (d === null || o.depth > d) d = o.depth;
    }
    return d;
  }

  /** 그림의 x 줄 불투명 꼭대기 (화면 y) */
  private colTop(o: Occ, x: number): number {
    const img = o.img;
    const m = frameMask(img.frame);
    const r = imgRect(img);
    if (!m) return r.top;
    const u0 = Math.floor((x - r.left) / r.sx);
    if (u0 < 0 || u0 >= m.w) return r.top + img.displayHeight;
    const u = img.flipX ? m.w - 1 - u0 : u0;
    for (let v = 0; v < m.h; v++) {
      const vv = img.flipY ? m.h - 1 - v : v;
      if (m.a[vv * m.w + u]) return r.top + v * r.sy;
    }
    return r.top + img.displayHeight;
  }

  clear(): void {
    this.cells = new Map();
    this.bakedAt = -Infinity;
  }
}
