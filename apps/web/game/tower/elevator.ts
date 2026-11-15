import * as Phaser from "phaser";
import { css, hash2, makeCanvas, type Color } from "../sprites/pixel";
import type { TowerSoundEv } from "./towerSound";

// 11/15 야근 빌딩 엘리베이터 연출 (HuntScene이 판 시작·층 사이에 띄운다). 화면(카메라 시야)을 덮는 철제 엘리베이터 문:
//  - 들어갈 때: 열린 문 너머 1층 로비 → 문이 닫히고 → 층 표시가 L에서 시작 층까지 오르며 웅 → 띵 → 문이 열리며 그 층
//  - 층 사이: 문이 지금 방을 덮으며 닫히고 → 층 표시 11 → 12 (살짝 흔들림·웅) → 띵 → 새 층으로 열린다 (약 2.2초)
//  - 우두머리 층: 표시가 붉게 깜빡이고 낮은 두 음 종소리
//  - 움직임 줄이기: 검게 잠깐 덮였다 걷히고 층 표시만
// 시간은 씬의 게임 시간(멈춤 제외)으로 움직인다 — 멈추면 같이 멈춘다.

const DEPTH = 2_000_000;

export type LiftKind = "enter" | "floor";

type Plan = {
  kind: LiftKind;
  t0: number;
  from: number;
  to: number;
  boss: boolean;
  /** 각 구간 끝 시각 (t0 기준 ms) */
  show: number;
  close: number;
  ride: number;
  open: number;
  fade: number;
  swapped: boolean;
  dinged: boolean;
  shown: number;
};

const TEX = { door: "tw-lift-door", lobby: "tw-lift-lobby", steel: "tw-lift-steel" } as const;

function R(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: Color, a = 1): void {
  c.fillStyle = css(col, a);
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function ensure(scene: Phaser.Scene): void {
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, make());
  };
  // 문 한 짝: 세로로 긁힌 스테인리스 + 반사 띠 + 가운데 고무 패킹
  add(TEX.door, () => {
    const W = 96;
    const H = 160;
    const { canvas, ctx } = makeCanvas(W, H);
    // 가로로 빛이 흐르는 스테인리스 (가운데가 밝고 가장자리로 어두워진다) + 세로 결
    for (let x = 0; x < W; x++) {
      const v = 0.5 + 0.35 * Math.sin(x / 9) + (hash2(x, 0, 5) - 0.5) * 0.35 - Math.abs(x - W * 0.45) / W;
      const base = Math.round(168 + v * 52);
      ctx.fillStyle = `rgb(${base - 10},${base - 2},${base + 12})`;
      ctx.fillRect(x, 0, 1, H);
    }
    for (let k = 0; k < 400; k++) R(ctx, hash2(k, 1, 6) * W, hash2(k, 2, 6) * H, 1, 3 + hash2(k, 3, 6) * 8, 0xd8e0ea, 0.25);
    // 사선 반사
    for (let y = 0; y < H; y++) R(ctx, 20 + y * 0.35, y, 14, 1, 0xffffff, 0.12);
    for (let y = 0; y < H; y++) R(ctx, 52 + y * 0.35, y, 5, 1, 0xffffff, 0.08);
    R(ctx, W - 3, 0, 3, H, 0x2a2e36);
    R(ctx, W - 4, 0, 1, H, 0xe8eef6);
    R(ctx, 0, 0, 1, H, 0x6a707a);
    return canvas;
  });
  // 문틀 철판 (작은 무늬)
  add(TEX.steel, () => {
    const { canvas, ctx } = makeCanvas(32, 32);
    R(ctx, 0, 0, 32, 32, 0x5a626e);
    for (let k = 0; k < 60; k++) R(ctx, hash2(k, 1, 7) * 32, hash2(k, 2, 7) * 32, 1, 1, 0x6e7684);
    for (let x = 0; x < 32; x += 8) R(ctx, x, 0, 1, 32, 0x4e5662);
    return canvas;
  });
  // 1층 로비 (대리석 바닥·회전문·경비 데스크·화분·빛)
  add(TEX.lobby, () => {
    const W = 448;
    const H = 288;
    const { canvas, ctx } = makeCanvas(W, H);
    R(ctx, 0, 0, W, 110, 0x2a3040);
    // 통유리 너머 밤 도시
    R(ctx, 20, 14, W - 40, 80, 0x0a1020);
    for (let k = 0; k < 30; k++) {
      const x = 24 + k * 14;
      const h = 20 + hash2(k, 1, 9) * 50;
      R(ctx, x, 94 - h, 12, h, 0x141c2c);
      for (let y = 94 - h + 3; y < 92; y += 5) for (let i = 2; i < 10; i += 4) if (hash2(x + i, y, 10) < 0.4) R(ctx, x + i, y, 2, 2, 0xf0d070);
    }
    for (let x = 20; x < W - 20; x += 52) R(ctx, x, 14, 2, 80, 0x3a4458);
    // 대리석 바닥
    for (let y = 110; y < H; y += 24)
      for (let x = 0; x < W; x += 24) {
        R(ctx, x, y, 24, 24, ((x + y) / 24) % 2 ? 0xd8d2c4 : 0xc8c0b0);
        for (let k = 0; k < 4; k++) R(ctx, x + hash2(x, y + k, 11) * 24, y + hash2(x + k, y, 12) * 24, 6, 1, 0xa8a090, 0.6);
      }
    // 바닥에 비친 빛
    R(ctx, 0, 110, W, 6, 0x000000, 0.25);
    // 회전문
    R(ctx, 190, 30, 68, 80, 0x3a4458);
    R(ctx, 194, 34, 60, 76, 0x7aa0c0, 0.6);
    R(ctx, 223, 34, 2, 76, 0x9aa8b8);
    R(ctx, 196, 70, 56, 2, 0x9aa8b8);
    // 경비 데스크
    R(ctx, 60, 150, 120, 34, 0x5a3e2a);
    R(ctx, 60, 150, 120, 4, 0x7a5a3a);
    R(ctx, 70, 140, 22, 12, 0x1a1e28);
    R(ctx, 72, 142, 18, 8, 0x3ab0ff);
    // 경비원 (작게)
    R(ctx, 120, 128, 12, 14, 0x2a3450);
    R(ctx, 122, 120, 8, 8, 0xe8c8a0);
    R(ctx, 121, 118, 10, 3, 0x1a2030);
    // 화분
    for (const x of [16, 410]) {
      R(ctx, x, 210, 22, 20, 0x8a5a3a);
      for (let k = 0; k < 14; k++) R(ctx, x + 11 + Math.cos(k) * 12, 200 + Math.sin(k * 1.7) * 10, 6, 4, k % 2 ? 0x3a8a3a : 0x5aaa4a);
    }
    // 천장 등
    for (const x of [80, 224, 368]) R(ctx, x - 30, 0, 60, 4, 0xfff4d8);
    return canvas;
  });
}

/** 엘리베이터 연출 하나 (씬마다 하나, 재사용) */
export class ElevatorCut {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly lobby: Phaser.GameObjects.Image;
  private readonly doorL: Phaser.GameObjects.Image;
  private readonly doorR: Phaser.GameObjects.Image;
  private readonly frame: Phaser.GameObjects.TileSprite[];
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly black: Phaser.GameObjects.Rectangle;
  private plan: Plan | null = null;
  private onSwap: (() => void) | null = null;
  private onDone: (() => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly reduced: boolean,
    private readonly sound: (ev: TowerSoundEv) => void,
  ) {
    ensure(scene);
    const d = DEPTH;
    this.lobby = scene.add.image(0, 0, TEX.lobby).setOrigin(0.5, 0.5).setDepth(d).setVisible(false);
    this.g = scene.add.graphics().setDepth(d + 1).setVisible(false);
    this.doorL = scene.add.image(0, 0, TEX.door).setOrigin(1, 0).setDepth(d + 2).setVisible(false);
    this.doorR = scene.add.image(0, 0, TEX.door).setOrigin(1, 0).setFlipX(true).setDepth(d + 2).setVisible(false);
    // 위 머리판·양쪽 문설주·아래 문턱
    this.frame = [0, 1, 2, 3].map(() => scene.add.tileSprite(0, 0, 8, 8, TEX.steel).setOrigin(0, 0).setDepth(d + 3).setVisible(false));
    this.panel = scene.add.graphics().setDepth(d + 4).setVisible(false);
    this.black = scene.add.rectangle(0, 0, 8, 8, 0x05060a).setOrigin(0, 0).setDepth(d + 5).setVisible(false);
  }

  get busy(): boolean {
    return this.plan !== null;
  }

  /**
   * 연출 시작. onSwap: 문이 닫혀 있는 동안 (새 층 지도로 바꿀 때), onDone: 다 열린 뒤.
   * enter는 L(로비)에서 to층까지 올라간다
   */
  start(now: number, kind: LiftKind, from: number, to: number, boss: boolean, onSwap: () => void, onDone: () => void): void {
    this.onSwap = onSwap;
    this.onDone = onDone;
    const steps = Math.max(1, to - from);
    const rideMs = kind === "enter" ? Math.min(1300, 420 + steps * 60) : 1100;
    if (this.reduced) {
      this.plan = { kind, t0: now, from, to, boss, show: 0, close: 220, ride: 220 + 700, open: 220 + 700, fade: 220 + 700 + 260, swapped: false, dinged: false, shown: -1 };
    } else {
      const show = kind === "enter" ? 650 : 0;
      const close = show + 380;
      const ride = close + rideMs;
      const open = ride + 380;
      this.plan = { kind, t0: now, from, to, boss, show, close, ride, open, fade: open + 220, swapped: false, dinged: false, shown: -1 };
    }
    for (const o of [this.g, this.doorL, this.doorR, this.panel, ...this.frame]) o.setVisible(!this.reduced);
    this.lobby.setVisible(kind === "enter" && !this.reduced);
    this.black.setVisible(this.reduced || kind === "enter");
    this.panel.setVisible(true);
    if (kind === "floor" && !this.reduced) this.sound("door");
    if (kind === "enter" && !this.reduced) this.black.setAlpha(1);
  }

  /** 매 프레임 (게임 시간) */
  update(now: number): void {
    const p = this.plan;
    if (!p) return;
    const t = now - p.t0;
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    // 문이 닫혀 오르는 동안 살짝 흔들린다
    const riding = t >= p.close && t < p.ride;
    const shake = riding && !this.reduced ? Math.round(Math.sin(now / 23) * 0.7) : 0;
    const x0 = v.x;
    const y0 = v.y + shake;
    const W = v.width;
    const H = v.height;
    // 틀: 위 머리판(층 표시) 높이·문설주 폭
    const head = Math.max(26, Math.round(H * 0.17));
    const jamb = Math.max(10, Math.round(W * 0.06));
    const sill = Math.max(6, Math.round(H * 0.04));
    const innerW = W - jamb * 2;
    const innerH = H - head - sill;
    const cx = x0 + W / 2;

    if (this.reduced) {
      // 검게 덮였다가 → 표시 → 걷힌다
      const a = t < p.close ? t / p.close : t < p.ride ? 1 : Math.max(0, 1 - (t - p.ride) / (p.fade - p.ride));
      this.black.setPosition(x0, v.y).setSize(W, H).setAlpha(a);
      if (!p.swapped && t >= p.close) this.swap(p);
      if (!p.dinged && t >= p.close + 200) this.ding(p);
      this.drawPanel(p, now, cx, v.y + H * 0.42, Math.max(2, Math.round(H / 60)), p.to, Math.min(1, a * 1.5));
      if (t >= p.fade) this.finish();
      return;
    }

    // 1) 들어갈 때: 로비가 보이다가 (검은 화면에서 밝아진다)
    if (p.kind === "enter") {
      this.lobby.setPosition(cx, y0 + head + innerH / 2).setDisplaySize(innerW, (innerW * 288) / 448 < innerH ? innerH : (innerW * 288) / 448);
      this.black.setPosition(x0, v.y).setSize(W, H).setAlpha(t < 200 ? 1 - t / 200 : 0);
    }
    // 문: 닫힘 정도 0(열림)..1(닫힘)
    let k: number;
    if (t < p.show) k = 0;
    else if (t < p.close) k = ease((t - p.show) / (p.close - p.show));
    else if (t < p.ride) k = 1;
    else if (t < p.open) k = 1 - ease((t - p.ride) / (p.open - p.ride));
    else k = 0;
    const leaf = innerW / 2 + 1;
    this.doorL.setDisplaySize(leaf, innerH).setPosition(x0 + jamb + leaf * k, y0 + head);
    this.doorR.setDisplaySize(leaf, innerH).setPosition(x0 + W - jamb - leaf * k + leaf, y0 + head);
    this.doorL.setVisible(k > 0.001);
    this.doorR.setVisible(k > 0.001);
    if (p.kind === "floor" && t >= p.close && !p.swapped) this.swap(p);
    if (p.kind === "enter" && t >= p.close && !p.swapped) this.swap(p);
    if (t >= p.close && this.lobby.visible) this.lobby.setVisible(false);
    if (!p.dinged && t >= p.ride - 60) this.ding(p);
    // 틀은 연출 끝에 사라진다
    const fa = t < p.open ? 1 : Math.max(0, 1 - (t - p.open) / (p.fade - p.open));
    const [top, left, right, bot] = this.frame;
    top.setPosition(x0, y0).setSize(W, head).setAlpha(fa);
    left.setPosition(x0, y0 + head).setSize(jamb, innerH + sill).setAlpha(fa);
    right.setPosition(x0 + W - jamb, y0 + head).setSize(jamb, innerH + sill).setAlpha(fa);
    bot.setPosition(x0 + jamb, y0 + H - sill).setSize(innerW, sill).setAlpha(fa);
    // 틀 그림자·테두리
    const g = this.g;
    g.clear().setAlpha(fa);
    g.fillStyle(0x000000, 0.35).fillRect(x0 + jamb, y0 + head, innerW, 3);
    g.fillStyle(0x0a0c10, 1).fillRect(x0 + jamb - 2, y0 + head, 2, innerH).fillRect(x0 + W - jamb, y0 + head, 2, innerH);
    g.fillStyle(0xc8d0da, 1).fillRect(x0, y0 + head - 2, W, 1);
    // 문턱 홈
    g.fillStyle(0x22262e, 1).fillRect(x0 + jamb, y0 + H - sill + 1, innerW, 2);
    // 오르는 동안 문 틈에서 새는 빛
    if (riding) g.fillStyle(p.boss ? 0xff4a3a : 0xfff0c0, 0.25 + 0.15 * Math.sin(now / 60)).fillRect(cx - 1, y0 + head, 2, innerH);
    // 층 표시판
    const scale = Math.max(3, Math.round(head / 10));
    this.drawPanel(p, now, cx, y0 + head / 2, scale, this.shownFloor(p, t), fa);
    if (t >= p.fade) this.finish();
  }

  /** 지금 표시할 층 (오르는 동안 하나씩 넘어간다, 들어갈 때 0 = L) */
  private shownFloor(p: Plan, t: number): number {
    if (t < p.close) return p.from;
    if (t >= p.ride - 120) return p.to;
    const u = (t - p.close) / Math.max(1, p.ride - 120 - p.close);
    const f = Math.min(p.to, p.from + Math.floor(u * (p.to - p.from + 1)));
    if (f !== p.shown && t > p.close) {
      if (p.shown >= 0) this.sound("tickFloor");
      if (p.shown < 0) this.sound("hum");
      p.shown = f;
    }
    return f;
  }

  private drawPanel(p: Plan, now: number, cx: number, cy: number, s: number, f: number, alpha: number): void {
    const g = this.panel;
    g.clear().setAlpha(alpha);
    const text = f <= 0 ? "L" : String(f);
    const w = text.length * 4 * s - s;
    const pw = w + 14 * s;
    const ph = 7 * s + 4;
    const bx = Math.round(cx - pw / 2);
    const by = Math.round(cy - ph / 2);
    const done = now - p.t0 >= p.ride - 60;
    const red = p.boss && done;
    const blink = red && !this.reduced ? Math.floor(now / 140) % 2 === 0 : true;
    g.fillStyle(0x1a1e26, 1).fillRect(bx - 2, by - 2, pw + 4, ph + 4);
    g.fillStyle(0x05060a, 1).fillRect(bx, by, pw, ph);
    const col = red ? 0xff3a2a : 0xffb43a;
    // 오름 화살표 ▲ (오르는 동안 깜빡)
    const up = now - p.t0 >= p.close && now - p.t0 < p.ride && Math.floor(now / 200) % 2 === 0;
    const ax = bx + 3 * s;
    const ay = by + 2 + s;
    for (let j = 0; j < 3; j++) g.fillStyle(col, up || done ? 1 : 0.25).fillRect(ax + (2 - j) * s * 0.5, ay + j * s * 1.5, (j * 2 + 1) * s * 0.5 + s * 0.5, s);
    // 숫자 (L은 글자표에 없어서 직접)
    g.fillStyle(col, blink ? 1 : 0.3);
    const tx = bx + 8 * s;
    const ty = by + 2 + s;
    if (text === "L") {
      g.fillRect(tx, ty, s, 5 * s);
      g.fillRect(tx, ty + 4 * s, 3 * s, s);
    } else {
      let ox = tx;
      for (const ch of text) {
        const rows = GLYPH[ch];
        rows?.forEach((row, j) => [...row].forEach((q, i) => q === "#" && g.fillRect(ox + i * s, ty + j * s, s, s)));
        ox += 4 * s;
      }
    }
    // 띵: 표시판 둘레가 번쩍
    if (done && now - p.t0 < p.ride + 500) g.lineStyle(1, col, 1 - (now - p.t0 - p.ride + 60) / 560).strokeRect(bx - 3, by - 3, pw + 6, ph + 6);
    if (red && blink) g.fillStyle(0xff3a2a, 0.15).fillRect(bx - 6, by - 6, pw + 12, ph + 12);
  }

  private swap(p: Plan): void {
    p.swapped = true;
    this.onSwap?.();
  }

  private ding(p: Plan): void {
    p.dinged = true;
    this.sound(p.boss ? "dingBoss" : "ding");
    if (!this.reduced) this.sound("door");
  }

  private finish(): void {
    this.plan = null;
    for (const o of [this.g, this.doorL, this.doorR, this.panel, this.lobby, this.black, ...this.frame]) o.setVisible(false);
    const done = this.onDone;
    this.onDone = this.onSwap = null;
    done?.();
  }

  destroy(): void {
    for (const o of [this.g, this.doorL, this.doorR, this.panel, this.lobby, this.black, ...this.frame]) o.destroy();
  }
}

const ease = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** 층 숫자 3×5 (serverRoomMap digits와 같은 글자) */
const GLYPH: Record<string, string[]> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
};
