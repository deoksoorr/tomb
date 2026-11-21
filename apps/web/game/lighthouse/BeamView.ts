import * as Phaser from "phaser";
import { PONDS } from "@tomb/protocol";
import { DEPTH } from "../config";
import { LOT_HOUSE, LOT_LIT, LOTS_CHANGED } from "../housing/worldLots";
import { makeCanvas } from "../sprites/pixel";
import { TOWER } from "../tower/towerLayout";
import type { Lighting } from "../world/Lighting";
import { beamPose, groundEllipse, groundYAt, POOL_ALONG, projectT, SQUASH, type BeamPose } from "./beamMath";
import { LIGHTHOUSE, LIGHTHOUSE_LAMP } from "./lighthouseLayout";

// 11/20 등대 빛줄기 (밤·어스름만). 원근 있는 원뿔 둘이 마주 보며 천천히 돈다:
//  - 원뿔은 등불에서 땅 위 빛 웅덩이까지 (그림 한 장을 돌리고 늘릴 뿐), 보는 사람 쪽(남)이면 넓고 밝게, 먼 쪽(북)이면 가늘고 흐리게
//  - 가림: 둘레 큰 그림(야근 빌딩·등대 몸·나무…)의 실루엣을 한 번 읽어 사각형 묶음으로 두고,
//    매 프레임 「빛줄기 바로 아래 땅보다 앞(아래)에 선 것」만 골라 반전 스텐실 마스크로 — 뒤로 돌면 빌딩 뒤로 숨는다
//  - 빛 웅덩이: 땅 타원으로 미끄러지며 Lighting 어둠을 걷는다. 까마귀 연못 위면 반짝이·물결 빛, 야근 빌딩 앞을 지나면 정면이 잠깐 환하게
//  - 등불이 보는 사람 쪽을 향하면 번쩍 (가로 빛살)
//  - 11/21 빛 웅덩이가 앞에 선 그림(집·나무·등·팻말…)에 걸치면 그 그림을 웅덩이 크기로 잘라 더한다 (집은 진하게·창은 반짝, 소품은 옅게).
//    겹친 사각형 셋(바깥·가운데·안)을 포개 도트 계단처럼 부드럽게. 집이 서고 바뀌면 WorldMap이 LOTS_CHANGED → 바로 다시 모은다
// 움직임 줄이기: 남서·북동에 멈춘다.

const KEY = {
  beam: "lh-beam2",
  pool: "lh-pool",
  flare: "lh-flare",
  spark: "lh-spark",
  glint: "lh-glint",
} as const;
/** 빛줄기 그림: 가로 길이, 세로, 웅덩이가 닿는 x, 그 자리 반폭, 먼지 프레임 수 */
const BW = 256;
const BH = 64;
const TIP_X = 196;
const HW_TIP = 25;
const DUST_FRAMES = 4;
/** 한 바퀴 (ms) */
const TURN_MS = 16_000;
/** 움직임 줄이기 방위 (남서) */
const STILL_TH = Math.PI * 0.78;
const POND = PONDS.find((p) => p.id === "pondNE") ?? PONDS[0];
const SPARKS = 44;
/** 가림 그림을 찾는 범위 (등대 둘레) */
const OCC_HALF_W = 380;
const OCC_MAX_Y = LIGHTHOUSE.y + 260;
/** 그림 빛 자리 수 (자리마다 계단 3장) · 세기 (밤 창 / 소품 — 집은 빛줄기마다 마스크 웅덩이 roof) */
const LIT_SLOTS = 6;
const LIT_STEPS = [1, 0.66, 0.36] as const;
const LIT_A = { win: 0.8, prop: 0.3 } as const;
/** 집 지붕 빛: 웅덩이보다 아래로 (웅덩이 세로 반지름 배) · 세로로 크게 — 집 뒤에 내려앉은 빛이 지붕에 번지게 */
const ROOF_DROP = 0.7;
const ROOF_GROW = 1.5;

type Occ = {
  img: Phaser.GameObjects.Image;
  frame: Phaser.Textures.Frame;
  depth: number;
  cx: number;
  cy: number;
  rects: number[];
  lh: boolean;
  /** 빛을 받는 종류 (등대 몸·야근 빌딩은 null) */
  kind: keyof typeof LIT_A | "house" | null;
  /** 실루엣 경계 (월드) */
  l: number;
  t: number;
  r: number;
  b: number;
};
/** 그림 빛 한 자리: 그 그림을 잘라 더하는 계단 3장 */
type LitSlot = { imgs: Phaser.GameObjects.Image[]; occ: Occ | null; a: number; x: number; y: number; rad: number };
type Beam = {
  layer: Phaser.GameObjects.Container;
  mask: Phaser.GameObjects.Graphics;
  pool: Phaser.GameObjects.Image;
  cone: Phaser.GameObjects.Image;
  glint: Phaser.GameObjects.Image;
  /** 집 지붕 빛: 웅덩이 그림을 빛 받는 집 실루엣으로만 (마스크). 밤 톤(곱하기) 위 빛 층이라 야근 빌딩 띠처럼 앞 사람 위에도 조금 얹힌다 */
  roof: Phaser.GameObjects.Image;
  roofMask: Phaser.GameObjects.Graphics;
  /** 지금 마스크에 그린 집 (가림 목록 번호) — 바뀔 때만 다시 그린다 */
  roofSet: string;
  roofA: number;
  pose: BeamPose;
  used: Uint8Array;
  usedN: number;
  pe: { rot: number; rx: number; ry: number };
  water: number;
};

const spanCache = new WeakMap<Phaser.Textures.Frame, number[]>();
/** 실루엣 문턱 (이 알파 이상이 「그림 몸」) · 몸 가운데 다 불투명한 칸이 이만큼은 돼야 단단한 그림 */
const SOLID_A = 110;
const SOLID_MIN = 0.25;

/** 프레임 잘린 칸(cut)의 픽셀 — 못 읽으면 null */
function framePixels(frame: Phaser.Textures.Frame): Uint8ClampedArray | null {
  const w = frame.cutWidth;
  const h = frame.cutHeight;
  if (!w || !h) return null;
  try {
    const { ctx } = makeCanvas(w, h);
    ctx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

/**
 * 그림 프레임의 불투명 실루엣 → 줄마다 불투명 구간들(2px 틈까지는 잇는다)을 위아래로 이어 붙인 사각형 (프레임 좌표 x,y,w,h …).
 * 11/21 떨어진 덩어리(집터 뒤 나무 둘·울타리 기둥)가 한 줄 구간으로 합쳐져 그 사이 빈 곳까지 빛을 가리던 것 → 구간 여럿
 * 11/21 안개처럼 반투명뿐인 그림(불투명 칸 거의 없음)은 빈 목록 — 가리지도, 빛 받지도 않는다 (떠다니는 안개를 잘라 더하면 흰 사각형)
 */
function frameSpans(frame: Phaser.Textures.Frame): number[] {
  const hit = spanCache.get(frame);
  if (hit) return hit;
  const out: number[] = [];
  const w = frame.cutWidth;
  const h = frame.cutHeight;
  const d = framePixels(frame);
  let body = 0;
  let solid = 0;
  if (d) {
    for (let i = 3; i < d.length; i += 4)
      if (d[i] >= SOLID_A) {
        body++;
        if (d[i] >= 230) solid++;
      }
  }
  if (d && body && solid / body >= SOLID_MIN) {
    // 바로 위 줄에서 이어 붙이던 사각형들 (out 안 시작 칸)
    let open: number[] = [];
    let next: number[] = [];
    for (let y = 0; y < h; y++) {
      next = [];
      let x = 0;
      while (x < w) {
        while (x < w && d[(y * w + x) * 4 + 3] < SOLID_A) x++;
        if (x >= w) break;
        const x0 = x;
        let x1 = x;
        let gap = 0;
        for (x++; x < w && gap <= 2; x++)
          if (d[(y * w + x) * 4 + 3] >= SOLID_A) {
            x1 = x;
            gap = 0;
          } else gap++;
        x = x1 + 1;
        // 위 줄과 같은 구간(±1px)이면 높이만 늘린다
        const at = open.find((i) => Math.abs(out[i] - x0) <= 1 && Math.abs(out[i] + out[i + 2] - 1 - x1) <= 1);
        if (at !== undefined) {
          out[at + 3]++;
          next.push(at);
        } else {
          next.push(out.length);
          out.push(x0, y, x1 - x0 + 1, 1);
        }
      }
      open = next;
    }
  }
  spanCache.set(frame, out);
  return out;
}

/** 빛 씌우기용 실루엣 그림: 몸(알파 ≥ SOLID_A)만 불투명 흰색, 나머지(그림자·반투명)는 비움 — 프레임 cut 크기 그대로 */
function silhouetteCanvas(frame: Phaser.Textures.Frame): HTMLCanvasElement | null {
  const d = framePixels(frame);
  if (!d) return null;
  const { canvas, ctx } = makeCanvas(frame.cutWidth, frame.cutHeight);
  const img = ctx.createImageData(frame.cutWidth, frame.cutHeight);
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] < SOLID_A) continue;
    img.data[i - 3] = 255;
    img.data[i - 2] = 255;
    img.data[i - 1] = 255;
    img.data[i] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
let silSeq = 0;

function beamCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(BW, BH * DUST_FRAMES);
  const img = ctx.createImageData(BW, BH * DUST_FRAMES);
  const cy = BH / 2;
  const hw = (x: number) => 1.6 + (HW_TIP - 1.6) * (x / TIP_X);
  // 먼지 알갱이 (프레임마다 바깥으로 3px씩 흐른다)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dust: { x: number; v: number; b: number }[] = [];
  for (let i = 0; i < 90; i++) dust.push({ x: rnd() * BW, v: rnd() * 2 - 1, b: 0.35 + rnd() * 0.5 });
  for (let f = 0; f < DUST_FRAMES; f++) {
    const a = new Float32Array(BW * BH);
    for (let y = 0; y < BH; y++)
      for (let x = 0; x < BW; x++) {
        const w = hw(Math.min(x, TIP_X + 30));
        const u = Math.abs(y + 0.5 - cy) / w;
        if (u >= 1) continue;
        // 가로: 등불 곁이 가장 밝고 멀어질수록 흐리게, 웅덩이 너머는 금방 사라진다
        // 가운데쯤도 꺼지지 않게 바닥을 두고, 웅덩이에 닿는 끝은 살짝 다시 밝게
        const along = 0.4 + 0.6 * Math.exp(-x / 42) + 0.12 * Math.exp(-(((x - TIP_X) / 28) ** 2));
        const tail = x <= TIP_X ? 1 : Math.max(0, 1 - (x - TIP_X) / (BW - TIP_X));
        const start = Math.min(1, (x + 1) / 6);
        // 세로: 부드러운 원뿔 + 가운데 심
        const edge = Math.pow(1 - u * u, 1.4);
        const core = Math.exp(-((u / 0.22) ** 2)) * 0.55 * Math.exp(-x / 90);
        a[y * BW + x] = Math.min(1, (edge * along + core) * tail * tail * start);
      }
    for (const d of dust) {
      const x = Math.floor((d.x + f * 3) % (TIP_X + 20));
      const y = Math.round(cy + d.v * hw(x) * 0.8);
      if (x < 10 || y < 0 || y >= BH) continue;
      const i = y * BW + x;
      a[i] = Math.min(1, a[i] + d.b * (0.5 + 0.5 * Math.min(1, x / 60)));
    }
    for (let y = 0; y < BH; y++)
      for (let x = 0; x < BW; x++) {
        // 12단계로 끊어 도트 띠 느낌
        const k = Math.round(a[y * BW + x] * 12) / 12;
        if (k <= 0) continue;
        const o = ((f * BH + y) * BW + x) * 4;
        img.data[o] = 255;
        img.data[o + 1] = 246;
        img.data[o + 2] = 214;
        img.data[o + 3] = Math.round(255 * k);
      }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 빛 웅덩이: 부드러운 원 (가운데 조금 더 환하게), 10단계 */
function poolCanvas(): HTMLCanvasElement {
  const S = 64;
  const { canvas, ctx } = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
      if (r >= 1) continue;
      let k = Math.pow(1 - r, 1.5) * 0.8 + Math.max(0, 1 - r / 0.45) * 0.25;
      k = Math.round(Math.min(1, k) * 10) / 10;
      const o = (y * S + x) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 236;
      img.data[o + 2] = 190;
      img.data[o + 3] = Math.round(255 * k);
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 등불 번쩍: 가로 빛살 (가운데 밝은 점) */
function flareCanvas(): HTMLCanvasElement {
  const W = 128;
  const H = 9;
  const { canvas, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x + 0.5 - W / 2) / (W / 2);
      const v = Math.abs(y + 0.5 - H / 2) / (H / 2);
      const k = Math.max(Math.pow(1 - u, 2.2) * Math.pow(Math.max(0, 1 - v), 2), Math.max(0, 1 - Math.hypot(u * 14, v)) * 1);
      if (k <= 0.02) continue;
      const o = (y * W + x) * 4;
      img.data[o] = 255;
      img.data[o + 1] = 248;
      img.data[o + 2] = 224;
      img.data[o + 3] = Math.round(255 * Math.min(1, k));
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** 물 반짝이 (5×5 십자) */
function sparkCanvas(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(5, 5);
  const px = (x: number, y: number, a: number) => {
    ctx.fillStyle = `rgba(255,250,228,${a})`;
    ctx.fillRect(x, y, 1, 1);
  };
  px(2, 2, 1);
  px(1, 2, 0.6);
  px(3, 2, 0.6);
  px(2, 1, 0.45);
  px(2, 3, 0.45);
  px(0, 2, 0.22);
  px(4, 2, 0.22);
  return canvas;
}

/** 물결 빛: 타원 안에 가로 짧은 줄들 (가운데 빽빽·밝게). 두 프레임이 번갈아 일렁인다 */
const GLINT_W = 64;
const GLINT_H = 22;
function glintCanvas(): HTMLCanvasElement {
  const W = GLINT_W;
  const H = GLINT_H;
  const { canvas, ctx } = makeCanvas(W, H * 2);
  for (let f = 0; f < 2; f++) {
    let seed = 11 + f * 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let row = 1 + f; row < H - 1; row += 2) {
      const v = Math.abs(row + 0.5 - H / 2) / (H / 2);
      const half = Math.sqrt(Math.max(0, 1 - v * v)) * (W / 2 - 2);
      const n = Math.round(1 + (1 - v) * 4);
      for (let i = 0; i < n; i++) {
        const len = 1 + Math.floor(rnd() * (2 + (1 - v) * 5));
        const u = (rnd() * 2 - 1) * (rnd() * 0.6 + 0.4);
        const x = Math.round(W / 2 + u * half - len / 2);
        const near = 1 - Math.abs(u);
        const a = (0.25 + 0.6 * near * (1 - v)) * (0.6 + rnd() * 0.4);
        ctx.fillStyle = `rgba(255,244,210,${a.toFixed(2)})`;
        ctx.fillRect(x, f * H + row, len, 1);
      }
    }
  }
  return canvas;
}

function ensureTextures(scene: Phaser.Scene): void {
  const add = (key: string, make: () => HTMLCanvasElement, linear: boolean, frames?: { w: number; h: number; n: number }) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.addCanvas(key, make());
    if (!t) return;
    if (linear) t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    if (frames) for (let i = 0; i < frames.n; i++) t.add(i, 0, 0, i * frames.h, frames.w, frames.h);
  };
  add(KEY.beam, beamCanvas, true, { w: BW, h: BH, n: DUST_FRAMES });
  add(KEY.pool, poolCanvas, true);
  add(KEY.flare, flareCanvas, true);
  add(KEY.spark, sparkCanvas, false);
  add(KEY.glint, glintCanvas, false, { w: GLINT_W, h: GLINT_H, n: 2 });
}

/** 그림의 잘린 칸(cut)이 월드에 놓인 왼쪽 위 + 배율 (아틀라스 다듬은 프레임은 real 상자 안 f.x·f.y만큼 밀린다, 뒤집힘 반영) */
function cutBox(img: Phaser.GameObjects.Image): { x: number; y: number; sx: number; sy: number } {
  const f = img.frame;
  const sx = img.displayWidth / f.realWidth;
  const sy = img.displayHeight / f.realHeight;
  const ox = img.flipX ? f.realWidth - f.x - f.cutWidth : f.x;
  const oy = img.flipY ? f.realHeight - f.y - f.cutHeight : f.y;
  return { x: img.x - img.originX * img.displayWidth + ox * sx, y: img.y - img.originY * img.displayHeight + oy * sy, sx, sy };
}

export class BeamView {
  private readonly beams: Beam[] = [];
  private readonly flare: Phaser.GameObjects.Image;
  private readonly sparks: Phaser.GameObjects.Image[] = [];
  private readonly sparkAt: { x: number; y: number; w: number; ph: number }[] = [];
  private readonly wash: Phaser.GameObjects.Image;
  private readonly lit: LitSlot[] = [];
  private readonly litCand: { a: number; o: Occ; px: number; py: number; hx: number; hy: number }[] = [];
  private occ: Occ[] = [];
  private tower: Occ | null = null;
  private level = 0;
  private sparksOn = false;
  /** 시험용: 방위를 고정 (null이면 시간 따라 돈다) */
  fixTh: number | null = null;
  /** 지금 번쩍임 0..1 (등불 빛무리가 읽는다) */
  flash = 0;
  private washA = 0;
  private recollectAt = 0;
  private stillAt = 0;
  private washY = 0;
  private washH = 0;
  /** 프레임 → 실루엣 그림 키 (못 만들면 null) */
  private readonly sil = new Map<Phaser.Textures.Frame, string | null>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
  ) {
    ensureTextures(scene);
    for (let i = 0; i < 2; i++) {
      const pool = scene.add.image(0, 0, KEY.pool).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe2a6);
      const cone = scene.add.image(0, 0, KEY.beam, 0).setOrigin(0, 0.5).setBlendMode(Phaser.BlendModes.ADD).setTint(0xfff0cc);
      const mask = scene.make.graphics({}, false);
      const gm = mask.createGeometryMask();
      gm.setInvertAlpha(true);
      // 물결 빛도 같은 가림 마스크 안에 (앞 소품 위로 흰 줄이 얹히지 않게) — 웅덩이 아래 순서는 그대로
      const glint = scene.make.image({ x: 0, y: 0, key: KEY.glint, frame: 0 }, false).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const layer = scene.add
        .container(0, 0, [glint, pool, cone])
        .setDepth(DEPTH.lights + 0.1)
        .setMask(gm)
        .setVisible(false);
      const roofMask = scene.make.graphics({}, false);
      const roof = scene.add
        .image(0, 0, KEY.pool)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xffe2a6)
        .setDepth(DEPTH.lights + 0.03)
        .setMask(roofMask.createGeometryMask())
        .setVisible(false);
      this.beams.push({
        layer,
        mask,
        pool,
        cone,
        glint,
        roof,
        roofMask,
        roofSet: "",
        roofA: 0,
        pose: beamPose(0),
        used: new Uint8Array(0),
        usedN: -1,
        pe: { rot: 0, rx: 1, ry: 1 },
        water: 0,
      });
    }
    this.flare = scene.add
      .image(LIGHTHOUSE_LAMP.x + 0.5, LIGHTHOUSE_LAMP.y, KEY.flare)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff4d8)
      .setDepth(DEPTH.lights + 0.3)
      .setVisible(false);
    this.wash = scene.add
      .image(0, 0, KEY.pool)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffecc4)
      .setDepth(DEPTH.lights + 0.05)
      .setVisible(false);
    for (let i = 0; i < LIT_SLOTS; i++)
      this.lit.push({
        imgs: LIT_STEPS.map(() =>
          scene.add.image(0, 0, KEY.pool).setBlendMode(Phaser.BlendModes.ADD).setTintFill(0xffe2a6).setDepth(DEPTH.lights + 0.02).setVisible(false),
        ),
        occ: null,
        a: 0,
        x: 0,
        y: 0,
        rad: 0,
      });
    // 연못 반짝이 자리 (타원 안 고르게, 결정적)
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    while (this.sparkAt.length < SPARKS) {
      const u = rnd() * 2 - 1;
      const v = rnd() * 2 - 1;
      if (u * u + v * v > 1) continue;
      const x = Math.round(POND.x + u * POND.rx * 0.9);
      const y = Math.round(POND.y + v * POND.ry * 0.78);
      this.sparkAt.push({ x, y, w: 2.2 + rnd() * 3.5, ph: rnd() * 6.28 });
      this.sparks.push(
        scene.add
          .image(x, y, KEY.spark)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.lights + 0.04)
          .setVisible(false),
      );
    }
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.on(LOTS_CHANGED, this.lotsChanged, this);
  }

  /** 집이 서고 지워지고 바뀌었다 → 다음 프레임에 가림·빛 그림을 다시 모은다 */
  private lotsChanged(): void {
    this.recollectAt = 0;
    for (const s of this.lit) this.hideSlot(s);
  }

  /** 밤 세기 0..1 (LighthouseView가 200ms마다) */
  setLevel(v: number): void {
    const was = this.level > 0;
    this.level = v;
    const on = v > 0;
    if (on && !was) this.recollectAt = 0; // 다음 프레임에 가림 그림을 모은다 (씬이 다 만들어진 뒤)
    for (const b of this.beams) b.layer.setVisible(on);
    if (!on) {
      for (const b of this.beams) b.glint.setVisible(false);
      this.flare.setVisible(false);
      this.wash.setVisible(false);
      for (const s of this.lit) this.hideSlot(s);
      for (const b of this.beams) b.roof.setVisible(false);
      this.hideSparks();
      this.flash = 0;
    }
    if (on) this.place(this.scene.time.now);
  }

  /** 등대 둘레의 큰 그림(월드 깊이 정렬 구간)을 가림 후보로 모은다 — 밤이 될 때마다 (계절 옷 바뀐 그림도 따라) */
  private collect(): void {
    const out: Occ[] = [];
    this.tower = null;
    for (const o of this.scene.children.list) {
      if (!(o instanceof Phaser.GameObjects.Image) || o.blendMode !== Phaser.BlendModes.NORMAL) continue;
      if (o.depth < 0 || o.depth > DEPTH.worldMax || o.displayHeight < 16 || o.alpha < 0.6) continue;
      const left = o.x - o.originX * o.displayWidth;
      const top = o.y - o.originY * o.displayHeight;
      if (left > LIGHTHOUSE.x + OCC_HALF_W || left + o.displayWidth < LIGHTHOUSE.x - OCC_HALF_W || top > OCC_MAX_Y || top + o.displayHeight < -20) continue;
      const occ: Occ = {
        img: o,
        frame: o.frame,
        depth: o.depth,
        cx: left + o.displayWidth / 2,
        cy: top + o.displayHeight / 2,
        rects: [],
        lh: false,
        kind: o.name === LOT_HOUSE ? "house" : o.name === LOT_LIT ? "win" : "prop",
        l: 0,
        t: 0,
        r: 0,
        b: 0,
      };
      this.fill(occ);
      if (!occ.rects.length) continue;
      occ.lh = Math.abs(o.x - LIGHTHOUSE.x) < 2 && Math.abs(o.depth - LIGHTHOUSE.y) < 1 && o.displayHeight > 100;
      if (Math.abs(occ.cx - TOWER.x) < 2 && Math.abs(o.depth - TOWER.y) < 1 && o.displayHeight > 120) this.tower = occ;
      if (occ.lh || occ === this.tower) occ.kind = null;
      out.push(occ);
    }
    this.occ = out;
    for (const s of this.lit) this.hideSlot(s);
    this.recollectAt = this.scene.time.now + 20_000;
    for (const b of this.beams) {
      b.used = new Uint8Array(out.length);
      b.usedN = -1;
      b.roofSet = "-";
    }
    if (this.tower) this.wash.setTexture(this.tower.img.texture.key, this.tower.img.frame.name);
    // 이제 없는 그림의 실루엣은 버린다 (빛 자리는 위에서 다 숨겼다)
    const live = new Set(out.map((o) => o.frame));
    for (const [f, k] of this.sil)
      if (!live.has(f)) {
        if (k) this.scene.textures.remove(k);
        this.sil.delete(f);
      }
  }

  /** 가림 그림 사각형 (월드 좌표, 뒤집힘 반영) */
  private fill(o: Occ): void {
    const img = o.img;
    const f = img.frame;
    o.frame = f;
    const sp = frameSpans(f);
    const { x: left, y: top, sx, sy } = cutBox(img);
    const r: number[] = [];
    let l = Infinity;
    let t = Infinity;
    let rr = -Infinity;
    let bb = -Infinity;
    for (let i = 0; i < sp.length; i += 4) {
      const x = img.flipX ? f.cutWidth - sp[i] - sp[i + 2] : sp[i];
      const y = img.flipY ? f.cutHeight - sp[i + 1] - sp[i + 3] : sp[i + 1];
      const wx = left + x * sx;
      const wy = top + y * sy;
      r.push(wx, wy, sp[i + 2] * sx, sp[i + 3] * sy);
      l = Math.min(l, wx);
      t = Math.min(t, wy);
      rr = Math.max(rr, wx + sp[i + 2] * sx);
      bb = Math.max(bb, wy + sp[i + 3] * sy);
    }
    o.rects = r;
    o.l = l;
    o.t = t;
    o.r = rr;
    o.b = bb;
  }

  private update(): void {
    if (this.level <= 0) return;
    const now = this.scene.time.now;
    // 새로 생긴 그림(계절 장식 등)도 가끔 다시 모은다
    if (now >= this.recollectAt) this.collect();
    const cam = this.scene.cameras.main.worldView;
    // 화면이 등대 둘레에서 멀면 쉰다
    if (cam.right < LIGHTHOUSE.x - 420 || cam.x > LIGHTHOUSE.x + 420 || cam.y > LIGHTHOUSE.y + 300 || cam.bottom < -40) {
      for (const b of this.beams) b.layer.setVisible(false);
      for (const s of this.lit) this.hideSlot(s);
      for (const b of this.beams) b.roof.setVisible(false);
      return;
    }
    // 움직임 줄이기: 멈춘 빛줄기라 가끔만 (가림·세기 맞추기)
    if (this.reduced) {
      if (now < this.stillAt) return;
      this.stillAt = now + 500;
    }
    this.place(now);
  }

  private place(now: number): void {
    const lvl = this.level;
    const th0 = this.fixTh ?? (this.reduced ? STILL_TH : (now / TURN_MS) * Math.PI * 2);
    const dust = this.reduced ? 0 : Math.floor(now / 140) % DUST_FRAMES;
    let flash = 0;
    let washA = 0;
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      const p = beamPose(th0 + i * Math.PI);
      b.pose = p;
      b.layer.setVisible(true);
      // 빛줄기: 등불에서 웅덩이까지 늘려 돌린다. 먼 쪽은 가늘고 흐리게
      b.cone
        .setPosition(LIGHTHOUSE_LAMP.x + 0.5, LIGHTHOUSE_LAMP.y)
        .setRotation(p.ang)
        .setScale(Math.max(0.04, p.len / TIP_X), p.half / HW_TIP)
        .setFrame(dust)
        .setAlpha(lvl * (0.5 + 0.2 * p.s));
      // 땅 위 빛 웅덩이 (빛줄기 방향으로 긴 타원)
      const pe = groundEllipse(th0 + i * Math.PI, POOL_ALONG * p.near, (p.half / p.near) * 1.25 * p.near);
      b.pe = pe;
      b.pool
        .setPosition(p.px, p.py)
        .setRotation(pe.rot)
        .setScale(pe.rx / 30, pe.ry / 30)
        .setAlpha(lvl * (0.5 + 0.12 * p.s) * (1 + 0.5 * b.water));
      this.occlude(b);
      // 연못 위면 물결 빛
      const ex = (p.px - POND.x) / POND.rx;
      const ey = (p.py - POND.y) / POND.ry;
      const inside = Math.min(1, Math.max(0, (1 - (ex * ex + ey * ey)) * 2.5));
      b.water = inside;
      if (inside > 0.01) {
        b.glint
          .setVisible(true)
          .setPosition(p.px, p.py)
          .setFrame(this.reduced ? 0 : Math.floor(now / 170 + i) % 2)
          .setScale(Math.min(1.5, Math.max(0.75, (pe.rx * 2.2) / GLINT_W)))
          .setAlpha(lvl * inside * 0.85);
      } else if (b.glint.visible) b.glint.setVisible(false);
      // 등불이 보는 사람 쪽을 향하면 번쩍
      flash = Math.max(flash, Math.pow(Math.max(0, p.s), 14));
      // 야근 빌딩 앞을 지나는 빛 (빛줄기가 빌딩보다 앞일 때만)
      if (this.tower && p.px < LIGHTHOUSE_LAMP.x - 40) {
        const t = (TOWER.x - LIGHTHOUSE_LAMP.x) / (p.px - LIGHTHOUSE_LAMP.x);
        if (t > 0 && t < 1.2) {
          const front = Math.min(1, Math.max(0, (groundYAt(p, Math.min(1, t)) - TOWER.y) / 8));
          const y = LIGHTHOUSE_LAMP.y + t * (p.py - LIGHTHOUSE_LAMP.y);
          const a = front * Math.min(1, (1.2 - t) * 3) * Math.min(1, Math.max(0, (TOWER.y - y) / 10));
          if (a > washA) {
            washA = a;
            this.washY = y;
            this.washH = Math.max(6, p.half * Math.min(1, t) * 0.9);
          }
        }
      }
    }
    this.flash = flash;
    this.flare
      .setVisible(flash > 0.02)
      .setAlpha(lvl * flash * 0.95)
      .setScale(0.7 + 1.1 * flash, 0.8 + 0.5 * flash);
    this.washA = washA * lvl;
    this.placeWash();
    this.placeLit();
    this.placeSparks(now);
  }

  /** 이 빛줄기 아래 땅보다 앞에 선 그림만 마스크에 (바뀐 때만 다시 그린다) */
  private occlude(b: Beam): void {
    const p = b.pose;
    const used = b.used;
    let changed = b.usedN < 0;
    let n = 0;
    for (let k = 0; k < this.occ.length; k++) {
      const o = this.occ[k];
      if (o.img.active && o.img.frame !== o.frame) {
        this.fill(o);
        changed = true;
        for (const bb of this.beams) bb.roofSet = "-";
      }
      let on: boolean;
      // 보이기(칸 컬링)는 보지 않는다 — 화면 밖이면 어차피 상관없다
      if (!o.img.active) on = false;
      else if (o.lh) on = p.s < 0;
      else on = o.depth > groundYAt(p, projectT(p, o.cx, o.cy)) + 1;
      const v = on ? 1 : 0;
      if (used[k] !== v) {
        used[k] = v;
        changed = true;
      }
      n += v;
    }
    if (!changed) return;
    b.usedN = n;
    const g = b.mask;
    g.clear();
    g.fillStyle(0xffffff, 1);
    for (let k = 0; k < this.occ.length; k++) {
      if (!used[k]) continue;
      const r = this.occ[k].rects;
      for (let i = 0; i < r.length; i += 4) g.fillRect(r[i], r[i + 1], r[i + 2], r[i + 3]);
    }
  }

  /** 야근 빌딩 정면 빛 띠: 빌딩 그림을 띠만큼 잘라 더한다 (실루엣 밖으로 새지 않는다) */
  private placeWash(): void {
    const t = this.tower;
    if (!t || this.washA < 0.02) {
      if (this.wash.visible) this.wash.setVisible(false);
      return;
    }
    const img = t.img;
    if (this.wash.frame !== img.frame) this.wash.setTexture(img.texture.key, img.frame.name);
    const top = img.y - img.originY * img.displayHeight;
    const fy = Math.max(0, Math.round(this.washY - this.washH - top));
    const fh = Math.max(1, Math.min(img.frame.cutHeight - fy, Math.round(this.washH * 2)));
    this.wash
      .setVisible(true)
      .setPosition(img.x, img.y)
      .setOrigin(img.originX, img.originY)
      .setFlipX(img.flipX)
      .setScale(img.scaleX, img.scaleY)
      .setCrop(0, fy, img.frame.cutWidth, fh)
      .setAlpha(this.washA * 0.55);
  }

  /**
   * 빛 웅덩이가 걸친 앞 그림(이 빛줄기를 가리는 쪽)에 빛: 그림을 웅덩이 경계만큼 잘라 더한다 — 바깥·가운데·안 계단 셋.
   * 뒤에 선 그림은 웅덩이 자체가 이미 위에 그려지니 건너뛴다. 세기 큰 것부터 LIT_SLOTS 자리
   */
  private placeLit(): void {
    const lvl = this.level;
    const cand = this.litCand;
    cand.length = 0;
    for (const b of this.beams) {
      const p = b.pose;
      const { rot, rx, ry } = b.pe;
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      // 돌린 타원의 경계 반폭 (조금 넉넉히)
      const hx = Math.hypot(rx * c, ry * sn) * 1.15;
      const hy = Math.hypot(rx * sn, ry * c) * 1.15;
      let set = "";
      let roofA = 0;
      for (let k = 0; k < this.occ.length; k++) {
        const o = this.occ[k];
        if (!o.kind || !b.used[k] || !o.img.active || !o.img.visible) continue;
        // 집은 지붕에 번지는 빛이라 조금 아래·크게 본다
        const house = o.kind === "house";
        const cy = house ? p.py + ry * ROOF_DROP : p.py;
        const vy = house ? hy * ROOF_GROW : hy;
        if (o.r < p.px - hx || o.l > p.px + hx || o.b < cy - vy || o.t > cy + vy) continue;
        // 웅덩이 가운데 → 그림 경계 거리 (타원 정규화)
        const dx = Math.max(o.l - p.px, 0, p.px - o.r) / hx;
        const dy = Math.max(o.t - cy, 0, cy - o.b) / vy;
        const near = 1 - Math.hypot(dx, dy);
        if (near <= 0.05) continue;
        const k1 = Math.min(1, near * 1.6);
        if (o.kind === "house") {
          set += `${k},`;
          roofA = Math.max(roofA, k1);
          continue;
        }
        cand.push({ a: lvl * LIT_A[o.kind] * k1, o, px: p.px, py: p.py, hx, hy });
      }
      this.placeRoof(b, set, roofA);
    }
    if (cand.length > 1) cand.sort((x, y) => y.a - x.a);
    for (let i = 0; i < this.lit.length; i++) {
      const slot = this.lit[i];
      const c = cand[i];
      if (!c) {
        this.hideSlot(slot);
        continue;
      }
      const o = c.o;
      const img = o.img;
      const f = img.frame;
      // 실루엣 그림 (몸만 불투명) — 원래 그림을 tintFill하면 반투명 칸까지 납작한 사각형이 된다
      const sil = this.silKey(f);
      if (!sil) {
        this.hideSlot(slot);
        continue;
      }
      const { x: left, y: top, sx, sy } = cutBox(img);
      slot.occ = o;
      slot.a = c.a;
      for (let j = 0; j < LIT_STEPS.length; j++) {
        const im = slot.imgs[j];
        const w = LIT_STEPS[j];
        const x0 = Math.max(o.l, c.px - c.hx * w);
        const x1 = Math.min(o.r, c.px + c.hx * w);
        const y0 = Math.max(o.t, c.py - c.hy * w);
        const y1 = Math.min(o.b, c.py + c.hy * w);
        if (j === 0) {
          slot.x = (x0 + x1) / 2;
          slot.y = (y0 + y1) / 2;
          slot.rad = Math.max(x1 - x0, y1 - y0) * 0.6 + 6;
        }
        if (x1 - x0 < 1 || y1 - y0 < 1) {
          if (im.visible) im.setVisible(false);
          continue;
        }
        // 프레임 좌표로 (뒤집힌 그림은 그 축을 통째로 — 띠로만)
        let fx = Math.floor((x0 - left) / sx);
        let fw = Math.ceil((x1 - left) / sx) - fx;
        let fy = Math.floor((y0 - top) / sy);
        let fh = Math.ceil((y1 - top) / sy) - fy;
        if (img.flipX) {
          fx = 0;
          fw = f.cutWidth;
        }
        if (img.flipY) {
          fy = 0;
          fh = f.cutHeight;
        }
        if (im.texture.key !== sil) im.setTexture(sil);
        // 실루엣은 cut 크기 그대로 → cut 상자 왼쪽 위에 맞춘다 (자르기는 프레임 좌표 그대로)
        im.setPosition(left, top)
          .setOrigin(0, 0)
          .setScale(sx, sy)
          .setFlip(img.flipX, img.flipY)
          .setCrop(fx, fy, fw, fh)
          .setAlpha(c.a * (j === 0 ? 0.4 : 0.35))
          .setVisible(true);
      }
    }
  }

  /** 웅덩이가 집에 걸치면: 웅덩이 그림을 그 집 실루엣 안에만 (집에 가려진 웅덩이 대신 지붕·벽이 환하게) */
  private placeRoof(b: Beam, set: string, a: number): void {
    b.roofA = set ? a * this.level : 0;
    if (!set) {
      if (b.roof.visible) b.roof.setVisible(false);
      return;
    }
    if (set !== b.roofSet) {
      b.roofSet = set;
      const g = b.roofMask;
      g.clear();
      g.fillStyle(0xffffff, 1);
      for (const k of set.split(",")) {
        const r = this.occ[+k]?.rects;
        if (r) for (let i = 0; i < r.length; i += 4) g.fillRect(r[i], r[i + 1], r[i + 2], r[i + 3]);
      }
    }
    const { rot, rx, ry } = b.pe;
    b.roof
      .setVisible(true)
      .setPosition(b.pose.px, b.pose.py + ry * ROOF_DROP)
      .setRotation(rot)
      .setScale((rx / 30) * 1.2, (ry / 30) * ROOF_GROW)
      .setAlpha(b.roofA * 0.95);
  }

  private silKey(f: Phaser.Textures.Frame): string | null {
    const hit = this.sil.get(f);
    if (hit !== undefined) return hit;
    const cv = silhouetteCanvas(f);
    const key = cv ? `lh-sil-${++silSeq}` : null;
    if (key && cv && !this.scene.textures.addCanvas(key, cv)) {
      this.sil.set(f, null);
      return null;
    }
    this.sil.set(f, key);
    return key;
  }

  private hideSlot(s: LitSlot): void {
    if (!s.occ) return;
    s.occ = null;
    s.a = 0;
    for (const im of s.imgs) im.setVisible(false);
  }

  private placeSparks(now: number): void {
    let any = false;
    for (const b of this.beams) if (b.water > 0 || Math.abs(b.pose.px - POND.x) < POND.rx + 70) any = true;
    if (!any) {
      this.hideSparks();
      return;
    }
    this.sparksOn = true;
    const t = now / 1000;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparkAt[i];
      let inf = 0;
      for (const b of this.beams) {
        const p = b.pose;
        // 땅 거리 (남북은 납작함을 풀어서)
        const dx = (s.x - p.px) / (POOL_ALONG * 1.3);
        const dy = (s.y - p.py) / SQUASH / (POOL_ALONG * 1.3);
        inf = Math.max(inf, Math.exp(-(dx * dx + dy * dy) * 1.6));
      }
      const tw = this.reduced ? 0.7 : Math.pow(Math.max(0, Math.sin(t * s.w + s.ph)), 4);
      const a = this.level * inf * (0.15 + 0.85 * tw);
      const img = this.sparks[i];
      if (a < 0.04) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      img.setVisible(true).setAlpha(Math.min(1, a * 1.4));
    }
  }

  private hideSparks(): void {
    if (!this.sparksOn) return;
    this.sparksOn = false;
    for (const s of this.sparks) s.setVisible(false);
  }

  /** 어둠 걷기 (WorldScene.updateLighting): 웅덩이를 타원 따라 원 셋으로, 빛줄기 길에 옅게, 빌딩 정면 띠 */
  addLights(lit: Lighting): void {
    const lvl = this.level;
    if (lvl <= 0) return;
    for (const b of this.beams) {
      if (!b.layer.visible) continue;
      const p = b.pose;
      const { rot, rx, ry } = b.pe;
      const cx = Math.cos(rot) * rx * 0.5;
      const cy = Math.sin(rot) * rx * 0.5;
      const r = ry * 1.4 + 8;
      lit.add(p.px, p.py, Math.max(rx, ry) * 1.1, 0.55 * lvl);
      lit.add(p.px - cx, p.py - cy, r, 0.45 * lvl);
      lit.add(p.px + cx, p.py + cy, r, 0.45 * lvl);
      // 빛줄기 길: 보는 사람 쪽일수록 (뒤로 돌면 가린 그림까지 밝히지 않게 옅게)
      const fa = 0.22 * lvl * (0.4 + 0.6 * Math.max(0, p.s));
      for (const t of [0.35, 0.7]) {
        const x = LIGHTHOUSE_LAMP.x + (p.px - LIGHTHOUSE_LAMP.x) * t;
        const y = LIGHTHOUSE_LAMP.y + (p.py - LIGHTHOUSE_LAMP.y) * t;
        lit.add(x, y, p.half * t + 10, fa);
      }
    }
    if (this.washA > 0.02) lit.add(TOWER.x, this.washY, this.washH * 1.6 + 10, 0.5 * this.washA);
    // 빛 받은 그림: 어둠을 걷어 낮 빛깔이 드러나게 (집은 거의 다, 소품은 조금)
    for (const b of this.beams)
      if (b.roofA > 0.02 && b.roof.visible) lit.add(b.pose.px, b.pose.py + b.pe.ry * ROOF_DROP, Math.max(b.pe.rx, b.pe.ry) * 1.1, Math.min(1, b.roofA * 0.9));
    for (const s of this.lit) if (s.occ?.kind) lit.add(s.x, s.y, s.rad, Math.min(1, s.a * (s.occ.kind === "prop" ? 0.8 : 1.4)));
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.off(LOTS_CHANGED, this.lotsChanged, this);
    for (const s of this.lit) for (const im of s.imgs) im.destroy();
    for (const b of this.beams) {
      b.layer.clearMask(true);
      b.layer.destroy();
      b.mask.destroy();
      b.glint.destroy();
      b.roof.clearMask(true);
      b.roof.destroy();
      b.roofMask.destroy();
    }
    this.flare.destroy();
    this.wash.destroy();
    for (const k of this.sil.values()) if (k) this.scene.textures.remove(k);
    this.sil.clear();
    for (const s of this.sparks) s.destroy();
  }
}
