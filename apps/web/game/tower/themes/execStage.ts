import * as Phaser from "phaser";
import { HUNT_ZONES, MONSTERS } from "@/lib/rpg/catalog";
import { inTelegraph, type TelegraphShape } from "@/lib/rpg/patterns";
import { towerVisitName } from "@/lib/rpg/tower";
import { EX_BOSS_CALL, EX_BOSS_FINAL, EX_BOSS_STAMP, EX_SECRETARY_TOUR, exRules, type ExRules } from "@/lib/rpg/towerThemes/exec";
import { css, hash2, makeCanvas, mix, radial, type Color } from "../../sprites/pixel";
import type { FilterKind, Layer, Wave } from "../../rpg/skillSound";
import { EX_ROOM_NAMES, EX_TOP, exChandeliers, exPortraitSpots, exWindows } from "./execMap";
import { FxPool, MonGrid } from "./fxPool";
import { foldMultiply } from "./overlay";
import type { ThemeHost, ThemeMon, TowerThemeRuntime } from "./runtime";

// 11/15 임원층 실행부 (층마다 하나): 움직이는 배경(창밖 하늘·도시 불빛·흔들리는 샹들리에·트로피 반짝임·햇살·층 번호판),
// 기믹 「결재 서류 비」(그림자가 진해지면 서류 더미가 떨어진다 — 떨어진 더미는 잠깐 발을 붙잡는다)와 「회장님 순시」(스포트라이트가 방을 훑고, 빛 속 몬스터는 빨라지고 세진다,
// 내가 빛에 들키면 서류가 내 쪽으로 몰린다), 몬스터 열넷의 행동, 우두머리 대표이사 네 단계(도장 → 임원 소집 → 도장 연타 → 구조조정 빛줄기).
// 시간은 씬의 게임 시간(멈춤 제외). 서버 검증과 상관있는 것: 수행 임원은 catalog summon 몫(3 × 2번)까지만 부른다.

const AW = 448;
const AH = 288;
const SIDE = 10;
const FLOOR_Y0 = EX_TOP + 6;

const D_SKY = -992;
const D_WALLFX = -975;
const D_FLOORFX = -460;
const D_PILE = -455;
const D_SPOT = 9010;
const D_AIR = 9020;
const D_CHAND = 9030;
const D_ADD = 9040;
const D_SPARK = 9045;

const T = {
  soft: "ex-soft",
  px: "ex-px",
  sky: (night: boolean) => `ex-sky-${night ? 1 : 0}`,
  chand: "ex-chand",
  pile: "ex-pile",
  paper: "ex-paper",
  stamp: "ex-stamp",
  ball: "ex-ball",
  recv: "ex-recv",
  grenade: "ex-grenade",
  card: "ex-cardbit",
  shard: "ex-shard",
  stain: "ex-stain",
  car: "ex-car",
  beam: "ex-sunbeam",
  boss: "ex-chairman",
  sign: (f: number) => `ex-sign-${f}`,
  inlay: (f: number) => `ex-inlay-${f}`,
} as const;

// ── 소리 (합성음) ──

const osc = (wave: Wave, at: number, dur: number, f0: number, f1: number, gain: number, x: Partial<Layer> = {}): Layer => ({ src: "osc", wave, at, dur, f0, f1, gain, atk: 0.004, env: "perc", ...x });
const nz = (at: number, dur: number, gain: number, type: FilterKind, f0: number, f1 = f0, q = 1.2): Layer => ({ src: "noise", at, dur, gain, atk: 0.004, env: "perc", flt: { type, f0, f1, q } });
const SOUNDS = {
  ring: [0, 0.09, 0.18, 0.27].map((t, i) => osc("sine", t, 0.08, i % 2 ? 1480 : 1180, i % 2 ? 1480 : 1180, 0.12, { env: "hold" })),
  horn: [osc("square", 0, 0.42, 392, 392, 0.09, { env: "hold", flt: { type: "lowpass", f0: 1400, f1: 1200, q: 2 } }), osc("square", 0, 0.42, 494, 494, 0.08, { env: "hold", flt: { type: "lowpass", f0: 1400, f1: 1200, q: 2 } })],
  chime: [osc("sine", 0, 0.9, 784, 784, 0.16, { verb: 0.5 }), osc("sine", 0.22, 1.1, 1046, 1046, 0.14, { verb: 0.5 }), osc("sine", 0.44, 1.3, 1318, 1318, 0.12, { verb: 0.5 })],
  paper: [nz(0, 0.16, 0.22, "bandpass", 3200, 1800), nz(0.05, 0.12, 0.12, "highpass", 5000)],
  stamp: [osc("sine", 0, 0.2, 110, 48, 0.4), nz(0, 0.08, 0.25, "lowpass", 900, 200)],
  beep: [osc("square", 0, 0.06, 2100, 2100, 0.06), osc("square", 0.11, 0.06, 2100, 2100, 0.06)],
  glass: [nz(0, 0.22, 0.2, "highpass", 6000, 3000), osc("sine", 0, 0.5, 3150, 3100, 0.06, { verb: 0.4 }), osc("sine", 0.02, 0.4, 4420, 4400, 0.04)],
  beam: [osc("sawtooth", 0, 1.2, 140, 90, 0.08, { env: "swell", flt: { type: "lowpass", f0: 900, f1: 400, q: 4 } }), nz(0, 1.2, 0.08, "bandpass", 600, 300)],
  putt: [osc("sine", 0, 0.05, 1800, 1500, 0.15), nz(0, 0.03, 0.15, "highpass", 4000)],
} satisfies Record<string, Layer[]>;
type Snd = keyof typeof SOUNDS;

// ── 그림 ──

function ensureTextures(sc: Phaser.Scene): void {
  const add = (key: string, make: () => HTMLCanvasElement) => {
    if (!sc.textures.exists(key)) sc.textures.addCanvas(key, make());
  };
  const R = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: Color, a = 1) => {
    c.fillStyle = css(col, a);
    c.fillRect(x, y, w, h);
  };
  add(T.soft, () => radial(32, [[0, "rgba(255,255,255,0.9)"], [0.5, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
  add(T.px, () => {
    const { canvas, ctx } = makeCanvas(2, 2);
    R(ctx, 0, 0, 2, 2, 0xffffff);
    return canvas;
  });
  for (const night of [false, true]) add(T.sky(night), () => skyCanvas(night));
  add(T.chand, () => {
    const { canvas, ctx: c } = makeCanvas(36, 28);
    R(c, 17, 0, 2, 6, 0xb08a40);
    R(c, 10, 6, 16, 3, 0xd8b050);
    R(c, 6, 9, 24, 2, 0xb08a40);
    for (let k = 0; k < 6; k++) {
      const x = 4 + k * 5.4;
      R(c, x, 11, 1, 4 + (k % 2) * 3, 0xd8f0ff);
      R(c, x, 15 + (k % 2) * 3, 2, 2, 0xffffff);
      R(c, x - 1, 7, 3, 3, 0xfff0b0);
    }
    for (let k = 0; k < 5; k++) R(c, 8 + k * 5, 12 + (k % 2) * 2, 1, 8, 0xc8e8ff, 0.8);
    R(c, 16, 18, 4, 8, 0xe8f8ff);
    R(c, 17, 26, 2, 2, 0xffffff);
    return canvas;
  });
  add(T.pile, () => {
    const { canvas, ctx: c } = makeCanvas(20, 14);
    for (let k = 0; k < 5; k++) {
      const o = (k % 2) * 2 - 1;
      R(c, 2 + o, 10 - k * 2, 16, 3, k % 2 ? 0xf2ead3 : 0xe0d8c0);
      R(c, 2 + o, 12 - k * 2, 16, 1, 0xb8b0a0);
    }
    R(c, 3, 1, 14, 2, 0xf8f4ea);
    R(c, 5, 2, 8, 1, 0x3a3a5a);
    R(c, 14, 1, 3, 2, 0xd04040);
    R(c, 8, 0, 4, 12, 0xc83a3a, 0.8);
    return canvas;
  });
  add(T.paper, () => {
    const { canvas, ctx } = makeCanvas(4, 3);
    R(ctx, 0, 0, 4, 3, 0xf8f4ea);
    R(ctx, 1, 1, 2, 1, 0x8a8a9a);
    return canvas;
  });
  add(T.stamp, () => {
    const { canvas, ctx: c } = makeCanvas(24, 18);
    c.fillStyle = css(0xd03030, 0.85);
    c.beginPath();
    c.ellipse(12, 9, 11, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "rgba(0,0,0,0)";
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.ellipse(12, 9, 8.5, 5.8, 0, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "source-over";
    // 결재 (막대 글자 흉내)
    R(c, 7, 6, 4, 1, 0xd03030);
    R(c, 9, 6, 1, 6, 0xd03030);
    R(c, 7, 11, 4, 1, 0xd03030);
    R(c, 13, 5, 1, 8, 0xd03030);
    R(c, 13, 8, 4, 1, 0xd03030);
    R(c, 16, 5, 1, 8, 0xd03030);
    return canvas;
  });
  add(T.ball, () => {
    const { canvas, ctx } = makeCanvas(4, 4);
    R(ctx, 1, 0, 2, 4, 0xffffff);
    R(ctx, 0, 1, 4, 2, 0xffffff);
    R(ctx, 2, 2, 1, 1, 0xc8c8c8);
    return canvas;
  });
  add(T.recv, () => {
    const { canvas, ctx } = makeCanvas(11, 5);
    R(ctx, 0, 1, 11, 2, 0x2a2a2e);
    R(ctx, 0, 2, 3, 3, 0x2a2a2e);
    R(ctx, 8, 2, 3, 3, 0x2a2a2e);
    R(ctx, 1, 1, 9, 1, 0x5a5a62);
    return canvas;
  });
  add(T.grenade, () => {
    const { canvas, ctx } = makeCanvas(8, 6);
    R(ctx, 0, 1, 8, 4, 0xf2f2f2);
    R(ctx, 0, 4, 8, 1, 0xb8b8b8);
    R(ctx, 3, 0, 2, 6, 0x2a4a8a);
    return canvas;
  });
  add(T.card, () => {
    const { canvas, ctx } = makeCanvas(5, 3);
    R(ctx, 0, 0, 5, 3, 0xf8f4ea);
    R(ctx, 1, 1, 3, 1, 0xc8a040);
    return canvas;
  });
  add(T.shard, () => {
    const { canvas, ctx } = makeCanvas(3, 3);
    R(ctx, 0, 0, 2, 1, 0xe8f8ff);
    R(ctx, 1, 1, 2, 1, 0xb8d8e8);
    R(ctx, 2, 2, 1, 1, 0xffffff);
    return canvas;
  });
  add(T.stain, () => {
    const { canvas, ctx: c } = makeCanvas(20, 10);
    c.fillStyle = css(0x6a0e22, 0.75);
    c.beginPath();
    c.ellipse(10, 5, 9, 4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = css(0x9a1a3a, 0.6);
    c.beginPath();
    c.ellipse(8, 4, 4, 2, 0, 0, Math.PI * 2);
    c.fill();
    return canvas;
  });
  add(T.car, carCanvas);
  add(T.beam, () => {
    const { canvas, ctx } = makeCanvas(16, 96);
    const g = ctx.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 96);
    return canvas;
  });
  add(T.boss, () => {
    // 회장님 실루엣 (순시 때 벽 너머로 지나간다)
    const { canvas, ctx: c } = makeCanvas(16, 24);
    c.fillStyle = "#0a0806";
    c.beginPath();
    c.ellipse(8, 5, 4, 4.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillRect(2, 9, 12, 12);
    c.fillRect(3, 21, 4, 3);
    c.fillRect(9, 21, 4, 3);
    c.fillStyle = "#e8c050";
    c.fillRect(7, 10, 2, 5);
    return canvas;
  });
}

/** 창밖: 하늘 + 먼 빌딩 + 가까운 빌딩 불빛 (낮은 금빛 오후, 밤은 짙은 남색) */
function skyCanvas(night: boolean): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(AW, EX_TOP);
  const R = (x: number, y: number, w: number, h: number, col: Color, a = 1) => {
    c.fillStyle = css(col, a);
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const [top, bot] = night ? [0x060a1c, 0x1a2244] : [0x6a9ad8, 0xffd29a];
  for (let y = 0; y < EX_TOP; y++) R(0, y, AW, 1, mix(top, bot, y / EX_TOP));
  if (night) for (let i = 0; i < 60; i++) R(hash2(i, 1, 3) * AW, hash2(i, 2, 3) * 20, 1, 1, 0xe8f0ff, 0.4 + hash2(i, 3, 3) * 0.5);
  else {
    // 오후 해 + 구름
    for (let r = 14; r > 0; r -= 2) {
      c.fillStyle = css(0xfff0c0, 0.12);
      c.beginPath();
      c.arc(AW * 0.7, 30, r * 1.6, 0, Math.PI * 2);
      c.fill();
    }
    for (let k = 0; k < 6; k++) R(hash2(k, 7, 1) * AW, 6 + hash2(k, 8, 1) * 14, 30 + hash2(k, 9, 1) * 40, 3, 0xfff4e8, 0.45);
  }
  // 강과 다리 (멀리)
  R(0, EX_TOP - 9, AW, 9, night ? 0x0a1426 : 0x8ab0d0);
  for (let x = 0; x < AW; x += 6) R(x, EX_TOP - 8, 3, 1, night ? 0x3a5a8a : 0xffffff, night ? 0.6 : 0.35);
  for (const [col, hk, sl] of [
    [night ? 0x141c34 : 0x7a8ab0, 26, 11],
    [night ? 0x0a0e1c : 0x4a5674, 34, 23],
  ] as const) {
    let x = 0;
    let k = 0;
    while (x < AW) {
      const bw = 8 + Math.floor(hash2(k, 1, sl) * 16);
      const bh = 6 + Math.floor(hash2(k, 2, sl) * hk);
      const by = EX_TOP - 8 - bh;
      R(x, by, bw, bh, col);
      for (let yy = by + 2; yy < EX_TOP - 9; yy += 3)
        for (let xx = x + 1; xx < x + bw - 1; xx += 2) if (hash2(xx, yy, sl) < (night ? 0.42 : 0.12)) R(xx, yy, 1, 1, night ? 0xffe08a : 0xffffff, night ? 0.9 : 0.5);
      if (hash2(k, 5, sl) < 0.18) {
        R(x + bw / 2, by - 5, 1, 5, col);
        if (night) R(x + bw / 2, by - 6, 1, 1, 0xff3a3a);
      }
      x += bw + 1;
      k++;
    }
  }
  return canvas;
}

/** 임원 차 (옆모습, 오른쪽으로 달린다) */
function carCanvas(): HTMLCanvasElement {
  const { canvas, ctx: c } = makeCanvas(56, 22);
  const R = (x: number, y: number, w: number, h: number, col: Color, a = 1) => {
    c.fillStyle = css(col, a);
    c.fillRect(x, y, w, h);
  };
  R(2, 9, 52, 8, 0x14141a);
  R(12, 3, 28, 7, 0x14141a);
  R(14, 4, 11, 5, 0x5a7090);
  R(27, 4, 11, 5, 0x5a7090);
  R(15, 4, 3, 1, 0xc8d8f0);
  R(2, 9, 52, 1, 0x4a4a56);
  R(2, 13, 52, 1, 0xc8ccd4);
  R(50, 10, 4, 3, 0xfff4c0);
  R(2, 10, 3, 2, 0xd02020);
  R(30, 10, 3, 1, 0xc8ccd4);
  for (const x of [10, 42]) {
    R(x - 5, 14, 10, 8, 0x0a0a0a);
    R(x - 2, 17, 4, 2, 0xa8acb4);
  }
  R(46, 6, 2, 3, 0xd8b050);
  return canvas;
}

type St = {
  mode: number;
  at: number;
  until: number;
  hitAt: number;
  ang: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  // 전화 수화기
  recv?: { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; back: boolean; t0: number };
  // 만년필 서명
  sig?: { x: number; y: number }[];
  // 초상화
  blinkAt?: number;
  // 분재
  rooted?: boolean;
  // 차 키·잔·임원
  talkAt?: number;
  clinkAt?: number;
  // 비서실장
  orderAt?: number;
  // 우두머리
  stamps?: number;
  beamAt?: number;
};

type Drop = { x: number; y: number; t0: number; at: number; img: Phaser.GameObjects.Image };
type Pile = { x: number; y: number; until: number; img: Phaser.GameObjects.Image };
type Mark = { x: number; y: number; until: number; img: Phaser.GameObjects.Image; hitAt: number; src: ThemeMon };
type Ball = { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; until: number; bounces: number; src: ThemeMon; on: boolean };
type Lob = { img: Phaser.GameObjects.Image; x0: number; y0: number; x1: number; y1: number; t0: number; t1: number; on: boolean };
type Car = { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number; dir: number; on: boolean; hit: boolean; src: ThemeMon };
type Spot = { img: Phaser.GameObjects.Image; core: Phaser.GameObjects.Image; x: number; y: number; ph: number };
type Thorn = { x: number; y: number; a: number; until: number };
type Beam = { hor: boolean; t0: number; t1: number; gap: number; hit: boolean; src: ThemeMon };

const SPOT_RX = 46;
const SPOT_RY = 28;

export class ExecStage implements TowerThemeRuntime {
  private readonly sc: Phaser.Scene;
  private readonly floor: number;
  private readonly visit: number;
  private readonly rules: ExRules;
  private readonly room: number;
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly st = new Map<ThemeMon, St>();
  private readonly t0: number;
  private readonly rnd: () => number;
  // 연출 그림
  private floorG!: Phaser.GameObjects.Graphics;
  private airG!: Phaser.GameObjects.Graphics;
  private addG!: Phaser.GameObjects.Graphics;
  private sparks!: FxPool;
  private bits!: FxPool;
  private chand: { img: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; ph: number }[] = [];
  private beams: { img: Phaser.GameObjects.Image; base: number; ph: number }[] = [];
  private trophies: { x: number; y: number }[] = [];
  private glintAt = 0;
  private plane: Phaser.GameObjects.Image | null = null;
  private planeX = -20;
  private wins: { x: number; y: number; w: number; h: number }[] = [];
  // 결재 서류 비
  private drops: Drop[] = [];
  private dropPool: Phaser.GameObjects.Image[] = [];
  private piles: Pile[] = [];
  private pilePool: Phaser.GameObjects.Image[] = [];
  private rainNext = 0;
  private rainTold = false;
  private pileTold = false;
  private onPile = false;
  // 회장님 순시
  private tour = { next: 0, warnAt: 0, until: 0, on: false, warned: false, toldLit: false };
  private spots: Spot[] = [];
  /** 지도의 분위기 곱하기 층 (순시 동안 방을 어둡게 — 층을 더 두지 않고 그 색만 바꾼다) */
  private amb: { rect: Phaser.GameObjects.Rectangle; base: number } | null = null;
  private dim = 0;
  private chairman!: Phaser.GameObjects.Image;
  private lit = 0;
  private buffed = new Map<ThemeMon, { speed: number; atk: number }>();
  private secretary = false;
  // 몬스터 연출
  private marks: Mark[] = [];
  private markPool: Phaser.GameObjects.Image[] = [];
  private balls: Ball[] = [];
  private lobs: Lob[] = [];
  private cars: Car[] = [];
  private stains: { img: Phaser.GameObjects.Image; until: number }[] = [];
  private thorns: Thorn[] = [];
  private beam: Beam | null = null;
  private grid = new MonGrid(32);
  /** 차선 경고가 깔려 있는 동안 (차는 한 번에 한 대) */
  private laneUntil = 0;

  constructor(
    private readonly host: ThemeHost,
    seed: number,
  ) {
    this.sc = host.scene;
    this.floor = host.floor();
    this.visit = host.visit();
    this.rules = exRules(this.visit);
    this.room = host.layout().variant;
    this.t0 = host.now();
    let s = (seed ^ 0x45584543) >>> 0;
    this.rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.rainNext = this.t0 + 3500;
    this.tour.next = this.t0 + this.rules.tourFirst;
    ensureTextures(this.sc);
    this.build();
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private snd(k: Snd): void {
    this.host.synth(`ex-${k}`, SOUNDS[k]);
  }

  title(): string {
    const name = EX_ROOM_NAMES[this.room] ?? "";
    const v = towerVisitName(HUNT_ZONES.ex_exec, this.visit);
    return v ? `${name} · ${v}` : name;
  }

  // ── 배경 ──

  private build(): void {
    const sc = this.sc;
    const l = this.host.layout();
    const night = this.rules.night;
    // 창밖 (창마다 잘라 보여 준다)
    this.wins = exWindows(this.room);
    for (const w of this.wins) this.keep(sc.add.image(0, 0, T.sky(night)).setOrigin(0, 0).setCrop(w.x, w.y, w.w, w.h - 2).setDepth(D_SKY));
    if (this.wins.length) {
      // 밤엔 비행기 불빛, 낮엔 반사광이 창을 가로지른다
      this.plane = this.keep(sc.add.image(-20, 10, T.px).setDepth(D_SKY + 1).setTint(night ? 0xff4a4a : 0xffffff).setScale(0.6));
    }
    // 낮: 창에서 비스듬히 드는 햇살
    if (!night)
      for (const w of this.wins)
        for (let x = w.x + 20; x < w.x + w.w - 10; x += 56) {
          const img = this.keep(sc.add.image(x, w.y + w.h, T.beam).setOrigin(0.5, 0).setRotation(0.5).setDisplaySize(26, 150).setTint(0xffd890).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_SPOT - 2).setAlpha(0.1));
          this.beams.push({ img, base: 0.1, ph: this.rnd() * 6 });
        }
    // 밤: 화면 전체 곱하기는 지도의 분위기 층에 섞어 넣는다 (층 하나 덜 칠한다)
    if (night) {
      const own = foldMultiply(sc, 0x7a7ab4, 9000, () => sc.add.rectangle(-200, -200, AW + 400, AH + 400, 0x7a7ab4).setOrigin(0, 0).setDepth(9000).setBlendMode(Phaser.BlendModes.MULTIPLY));
      if (own) this.keep(own);
    }
    // 샹들리에 (천장에 매달려 살짝 흔들린다) + 아래로 퍼지는 빛
    for (const p of exChandeliers(this.room)) {
      const glow = this.keep(sc.add.image(p.x, p.y + 30, T.soft).setDisplaySize(130, 80).setTint(0xffd890).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_SPOT - 1).setAlpha(night ? 0.42 : 0.22));
      const img = this.keep(sc.add.image(p.x, p.y - 22, T.chand).setOrigin(0.5, 0).setDepth(D_CHAND));
      this.chand.push({ img, glow, ph: this.rnd() * 6 });
    }
    // 트로피 장식장 (반짝임 자리)
    for (const p of l.props) if (p.kind === "ex_trophy_case") this.trophies.push({ x: p.x, y: p.y - 30 });
    // 층 번호판 (벽, 빈 액자 자리) + 바닥 금실 층 번호
    const fk = T.sign(this.floor);
    if (!sc.textures.exists(fk)) sc.textures.addCanvas(fk, signCanvas(this.floor));
    const spot = exPortraitSpots(this.room).find((_, i) => i % 2 === 1);
    if (spot) this.keep(sc.add.image(spot.x, 24, fk).setDepth(D_WALLFX));
    const ik = T.inlay(this.floor);
    if (!sc.textures.exists(ik)) sc.textures.addCanvas(ik, inlayCanvas(this.floor));
    this.keep(sc.add.image(l.start.x, Math.min(AH - 22, l.start.y + 24), ik).setDepth(D_FLOORFX - 2).setAlpha(0.7));
    // 연출 그림 셋 (바닥 · 공중 · 빛)
    this.floorG = this.keep(sc.add.graphics().setDepth(D_FLOORFX));
    this.airG = this.keep(sc.add.graphics().setDepth(D_AIR));
    this.addG = this.keep(sc.add.graphics().setDepth(D_ADD).setBlendMode(Phaser.BlendModes.ADD));
    this.sparks = new FxPool(sc, T.soft, 48, D_SPARK, true);
    this.bits = new FxPool(sc, T.paper, 70, D_AIR + 1, false);
    // 회장님 순시 스포트라이트 (둘까지 미리)
    for (let i = 0; i < 2; i++) {
      const img = this.keep(sc.add.image(0, 0, T.soft).setDisplaySize(SPOT_RX * 2.5, SPOT_RY * 2.5).setTint(0xfff2c8).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_SPOT).setVisible(false));
      const core = this.keep(sc.add.image(0, 0, T.soft).setDisplaySize(SPOT_RX * 1.5, SPOT_RY * 1.5).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_SPOT).setVisible(false));
      this.spots.push({ img, core, x: 30, y: 70, ph: i * Math.PI });
    }
    const amb = sc.children.list.find((o): o is Phaser.GameObjects.Rectangle => o instanceof Phaser.GameObjects.Rectangle && o.blendMode === Phaser.BlendModes.MULTIPLY && o.depth === 9000 && o.visible);
    if (amb) this.amb = { rect: amb, base: amb.fillColor };
    this.chairman = this.keep(sc.add.image(-30, 40, T.boss).setOrigin(0.5, 1).setDepth(D_WALLFX + 1).setAlpha(0).setScale(1.1));
  }

  // ── 몬스터 ──

  private s(m: ThemeMon): St {
    let x = this.st.get(m);
    if (!x) {
      x = { mode: 0, at: this.host.now() + 1200 + this.rnd() * 1600, until: 0, hitAt: 0, ang: 0, tx: 0, ty: 0, sx: 0, sy: 0 };
      this.st.set(m, x);
    }
    return x;
  }

  spawned(m: ThemeMon): void {
    const s = this.s(m);
    const H = this.host;
    switch (m.id) {
      case "ex_phone":
        s.recv = { img: this.keep(this.sc.add.image(m.x, m.y, T.recv).setDepth(D_AIR).setVisible(false)), x: m.x, y: m.y, vx: 0, vy: 0, back: false, t0: 0 };
        break;
      case "ex_portrait":
        s.blinkAt = H.now() + 400;
        break;
      case "ex_secretary":
        H.flash("정예 「비서실장」 등장! 살아 있는 동안 순시가 잦아지고 서류가 나한테 몰려요", 2600);
        s.orderAt = H.now() + 4000;
        break;
      case "ex_ceo":
        s.beamAt = 0;
        break;
      case "ex_entourage":
        s.talkAt = H.now() + 1500 + this.rnd() * 3000;
        break;
    }
  }

  /** 걸음을 맡는 몬스터: 의자(돌진)·초상화(벽에 걸림)·분재(자리 잡음)·만년필(서명 중)·도장(점프 중) */
  move(m: ThemeMon, dt: number): boolean {
    const s = this.st.get(m);
    if (!s) return false;
    switch (m.id) {
      case "ex_portrait":
        return true;
      case "ex_bonsai":
        return !!s.rooted;
      case "ex_pen":
        return s.mode > 0;
      case "ex_seal":
        if (s.mode === 2) {
          const t = Math.min(1, (this.host.now() - s.at) / 650);
          const nx = s.sx + (s.tx - s.sx) * t;
          const ny = s.sy + (s.ty - s.sy) * t;
          this.host.moveMon(m, nx - m.x, ny - m.y);
        }
        return s.mode > 0;
      case "ex_chair":
        return this.chairMove(m, s, dt);
    }
    return false;
  }

  killed(m: ThemeMon): void {
    const s = this.st.get(m);
    this.unbuff(m);
    if (s?.recv) s.recv.img.setVisible(false);
    if (m.id === "ex_wine") {
      this.snd("glass");
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const v = 50 + this.rnd() * 60;
        this.bits.emit(m.x, m.y - 8, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 160, ms: 520, tint: 0xffffff, tex: T.shard, s0: 1, s1: 0.6 });
      }
      const st = this.stains.find((x) => x.until < this.host.now());
      const img = st?.img ?? this.keep(this.sc.add.image(0, 0, T.stain).setDepth(D_PILE - 1));
      img.setPosition(m.x, m.y).setVisible(true).setAlpha(0.9);
      if (st) st.until = this.host.now() + 5000;
      else this.stains.push({ img, until: this.host.now() + 5000 });
    }
    if (m.id === "ex_secretary") this.secretary = false;
    if (m.id === "ex_cards") for (let k = 0; k < 6; k++) this.bits.emit(m.x, m.y - 6, { vx: (this.rnd() - 0.5) * 120, vy: -40 - this.rnd() * 50, g: 140, ms: 600, tint: 0xffffff, tex: T.card });
    this.st.delete(m);
  }

  playerVelocity(v: { x: number; y: number }): { x: number; y: number } {
    if (!this.onPile) return v;
    return { x: v.x * 0.6, y: v.y * 0.6 };
  }

  // ── 매 프레임 ──

  update(now: number, dt: number): void {
    const H = this.host;
    const calm = H.calm();
    this.floorG.clear();
    this.airG.clear();
    this.addG.clear();
    this.tickBackground(now, dt);
    this.sparks.update(dt);
    this.bits.update(dt);
    this.secretary = H.mons().some((m) => m.alive && m.id === "ex_secretary");
    if (!calm) {
      this.tickTour(now);
      this.tickRain(now);
    } else this.endTour();
    this.tickMarks(now);
    this.tickMonsters(now, dt);
    this.tickBalls(now, dt);
    this.tickLobs(now);
    this.tickCars(now, dt);
    this.tickThorns(now);
    this.tickBeam(now);
  }

  private tickBackground(now: number, dt: number): void {
    const reduced = this.host.reduced;
    for (const c of this.chand) {
      const sw = reduced ? 0 : Math.sin(now / 1400 + c.ph) * 0.04;
      c.img.setRotation(sw);
      c.glow.setAlpha((this.rules.night ? 0.42 : 0.22) * (reduced ? 1 : 0.92 + 0.08 * Math.sin(now / 300 + c.ph)));
      if (!reduced && this.rnd() < dt * 2.2) this.sparks.emit(c.img.x + (this.rnd() - 0.5) * 26, c.img.y + 12 + this.rnd() * 12, { ms: 380, tint: 0xfff4d0, s0: 0.12, s1: 0.02, a: 0.9 });
    }
    for (const b of this.beams) b.img.setAlpha(reduced ? b.base : b.base * (0.8 + 0.2 * Math.sin(now / 900 + b.ph)));
    if (this.trophies.length && now >= this.glintAt) {
      this.glintAt = now + 500 + this.rnd() * 900;
      const t = this.trophies[Math.floor(this.rnd() * this.trophies.length)];
      this.sparks.emit(t.x + (this.rnd() - 0.5) * 22, t.y + (this.rnd() - 0.5) * 16, { ms: 520, tint: 0xffffff, s0: 0.05, s1: 0.22, a: 1 });
    }
    // 창밖 불빛 반짝 · 비행기
    if (this.wins.length) {
      if (this.rules.night && this.rnd() < dt * 3) {
        const w = this.wins[Math.floor(this.rnd() * this.wins.length)];
        this.sparks.emit(w.x + this.rnd() * w.w, w.y + w.h * (0.45 + this.rnd() * 0.45), { ms: 700, tint: 0xffe08a, s0: 0.06, s1: 0.03, a: 0.9, depth: D_SKY + 1 });
      }
      if (this.plane) {
        this.planeX += dt * 14;
        if (this.planeX > AW + 30) this.planeX = -30;
        const w = this.wins.find((q) => this.planeX > q.x && this.planeX < q.x + q.w);
        this.plane.setPosition(this.planeX, 12 + Math.sin(this.planeX / 60) * 2).setVisible(!!w && (reduced || Math.floor(now / 400) % 2 === 0));
      }
    }
  }

  // ── 회장님 순시 ──

  private tickTour(now: number): void {
    const H = this.host;
    const tr = this.tour;
    const every = this.rules.tourEvery * (this.secretary ? EX_SECRETARY_TOUR : 1);
    if (!tr.on && !tr.warned && now >= tr.next - 1500) {
      tr.warned = true;
      tr.warnAt = now;
      H.flash("회장님 순시! 스포트라이트 속 몬스터는 더 빠르고 세져요", 2200);
      this.snd("chime");
    }
    if (!tr.on && now >= tr.next) {
      tr.on = true;
      tr.toldLit = false;
      tr.until = now + this.rules.tourMs;
      for (const sp of this.spots) {
        sp.x = 32;
        sp.y = FLOOR_Y0 + 12;
      }
    }
    // 문 앞이 환해진다 (예고)
    if (tr.warned && !tr.on) {
      const k = Math.min(1, (now - tr.warnAt) / 1500);
      this.addG.fillStyle(0xfff2c8, 0.18 * k).fillEllipse(32, FLOOR_Y0 + 10, 50 * k, 26 * k);
    }
    if (!tr.on) return;
    const t = (now - (tr.until - this.rules.tourMs)) / 1000;
    const fade = Math.min(1, t / 0.8, (tr.until - now) / 800);
    this.setDim(fade);
    const P = H.player();
    let litP = false;
    for (let i = 0; i < this.spots.length; i++) {
      const sp = this.spots[i];
      const on = i < this.rules.spots;
      sp.img.setVisible(on && fade > 0);
      sp.core.setVisible(on && fade > 0);
      if (!on) continue;
      // 방을 8자로 훑는다 (둘이면 서로 반대쪽)
      const cx = AW / 2 + Math.sin(t * 0.55 + sp.ph) * (AW / 2 - 60);
      const cy = (FLOOR_Y0 + AH - SIDE) / 2 + Math.sin(t * 1.1 + sp.ph) * ((AH - SIDE - FLOOR_Y0) / 2 - 34);
      const k = Math.min(1, t / 1.6);
      sp.x = 32 + (cx - 32) * k;
      sp.y = FLOOR_Y0 + 12 + (cy - FLOOR_Y0 - 12) * k;
      const pulse = this.host.reduced ? 1 : 0.9 + 0.1 * Math.sin(now / 120);
      sp.img.setPosition(sp.x, sp.y).setAlpha(0.75 * fade * pulse);
      sp.core.setPosition(sp.x, sp.y).setAlpha(0.45 * fade * pulse);
      this.floorG.lineStyle(2, 0xffe08a, 0.7 * fade).strokeEllipse(sp.x, sp.y, SPOT_RX * 2, SPOT_RY * 2);
      this.floorG.lineStyle(1, 0xffffff, 0.35 * fade).strokeEllipse(sp.x, sp.y, SPOT_RX * 2 + 6, SPOT_RY * 2 + 4);
      // 천장 쪽에서 내려오는 빛 원뿔
      this.addG.fillStyle(0xfff2c8, 0.05 * fade).fillTriangle(sp.x - 8, 0, sp.x + 8, 0, sp.x + SPOT_RX, sp.y);
      this.addG.fillTriangle(sp.x - 8, 0, sp.x - SPOT_RX, sp.y, sp.x + SPOT_RX, sp.y);
      if (inSpot(sp, P.x, P.y)) litP = true;
    }
    // 빛 속 몬스터: 빨라지고 세진다 (빛을 벗어나면 돌아온다)
    for (const m of H.mons()) {
      if (!m.alive) continue;
      const inside = fade > 0.3 && this.spots.some((sp, i) => i < this.rules.spots && inSpot(sp, m.x, m.y));
      if (inside && !this.buffed.has(m)) {
        this.buffed.set(m, { speed: m.st.speed, atk: m.st.atk });
        m.st.speed *= this.rules.buff;
        m.st.atk = Math.round(m.st.atk * this.rules.buff);
        H.float(m.x, m.y - MONSTERS[m.id].size - 6, "주목!", "#ffe08a");
      } else if (!inside && this.buffed.has(m)) this.unbuff(m);
      if (inside && this.rnd() < 0.25) this.sparks.emit(m.x + (this.rnd() - 0.5) * 14, m.y - this.rnd() * MONSTERS[m.id].size, { vy: -20, ms: 420, tint: 0xffd050, s0: 0.1, s1: 0.03 });
    }
    if (litP) {
      this.lit = now + 1500;
      if (!tr.toldLit) {
        tr.toldLit = true;
        H.float(P.x, P.y - 30, "눈에 띄었다! 서류가 몰려와요", "#ffe08a");
      }
    }
    // 벽 위로 지나가는 회장님 실루엣
    const wx = AW + 20 - ((now - (tr.until - this.rules.tourMs)) / this.rules.tourMs) * (AW + 40);
    this.chairman.setPosition(wx, EX_TOP - 4 + (this.host.reduced ? 0 : Math.abs(Math.sin(now / 160)) * -1)).setAlpha(0.75 * fade).setFlipX(true);
    if (now >= tr.until) this.endTour();
  }

  private endTour(): void {
    const tr = this.tour;
    if (!tr.on && !tr.warned) return;
    if (tr.on) tr.next = this.host.now() + this.rules.tourEvery * (this.secretary ? EX_SECRETARY_TOUR : 1);
    tr.on = false;
    tr.warned = false;
    for (const sp of this.spots) {
      sp.img.setVisible(false);
      sp.core.setVisible(false);
    }
    this.setDim(0);
    this.chairman.setAlpha(0);
    for (const m of [...this.buffed.keys()]) this.unbuff(m);
  }

  /** 순시 중엔 방이 어두워지고 스포트라이트만 밝다 (분위기 층 색을 곱해 낮춘다) */
  private setDim(k: number): void {
    if (!this.amb || Math.abs(k - this.dim) < 0.02) return;
    this.dim = k;
    const b = this.amb.base;
    const f = 1 - 0.42 * k;
    const ch = (sh: number) => Math.round(((b >> sh) & 255) * f);
    this.amb.rect.setFillStyle((ch(16) << 16) | (ch(8) << 8) | ch(0));
  }

  private unbuff(m: ThemeMon): void {
    const b = this.buffed.get(m);
    if (!b) return;
    m.st.speed = b.speed;
    m.st.atk = b.atk;
    this.buffed.delete(m);
  }

  // ── 결재 서류 비 ──

  private tickRain(now: number): void {
    const H = this.host;
    const P = H.player();
    const boss = H.mons().find((m) => m.alive && m.id === "ex_ceo");
    const final = !!boss && boss.hp / boss.st.maxHp <= EX_BOSS_FINAL;
    if (now >= this.rainNext) {
      this.rainNext = now + this.rules.rainEvery * (final ? 0.75 : 1);
      const n = this.rules.rainN + (final ? 2 : 0);
      const aim = this.lit > now || this.secretary;
      for (let i = 0; i < n; i++) {
        let x: number;
        let y: number;
        if (aim && i < Math.ceil(n / 2)) {
          x = P.x + (i === 0 ? 0 : (this.rnd() - 0.5) * 70);
          y = P.y + (i === 0 ? 0 : (this.rnd() - 0.5) * 50);
        } else {
          x = 30 + this.rnd() * (AW - 60);
          y = FLOOR_Y0 + 14 + this.rnd() * (AH - SIDE - FLOOR_Y0 - 24);
        }
        this.addDrop(x, y, now + i * 160);
      }
      if (!this.rainTold && this.visit === 0) {
        this.rainTold = true;
        H.flash("바닥 그림자가 진해지면 그 자리로 결재 서류가 떨어져요", 2000);
      }
    }
    for (const d of this.drops) {
      if (now < d.t0) continue;
      const k = Math.min(1, (now - d.t0) / (d.at - d.t0));
      const r = this.rules.rainR;
      this.floorG.fillStyle(0x000000, 0.25 + 0.45 * k).fillEllipse(d.x, d.y, r * 2 * (0.45 + 0.55 * k), r * 1.2 * (0.45 + 0.55 * k));
      this.floorG.lineStyle(1, k > 0.6 ? 0xff5a3a : 0xf2ead3, 0.45 + 0.55 * k).strokeEllipse(d.x, d.y, r * 2 + 2, r * 1.2 + 2);
      // 하늘에서 내려오는 줄 (어디로 떨어지는지 먼저 보인다)
      this.floorG.lineStyle(1, 0xf2ead3, 0.18 * k).lineBetween(d.x, d.y - 150, d.x, d.y - 4);
      const fall = Math.max(0, (k - 0.35) / 0.65);
      d.img.setVisible(fall > 0).setPosition(d.x, d.y - (1 - fall) * 150).setAngle((1 - fall) * 40).setDepth(d.y + 40);
    }
    const landed = this.drops.filter((d) => now >= d.at);
    if (landed.length) {
      this.drops = this.drops.filter((d) => now < d.at);
      for (const d of landed) this.land(d);
    }
    // 떨어진 더미: 밟으면 발이 묶인다 (느려진다)
    this.onPile = false;
    for (const p of this.piles) {
      if (p.until <= now) {
        if (p.img.visible) {
          p.img.setVisible(false);
          this.pilePool.push(p.img);
        }
        continue;
      }
      const k = (p.until - now) / 1000;
      p.img.setAlpha(Math.min(1, k));
      if (Math.abs(P.x - p.x) < 11 && Math.abs(P.y - p.y) < 7) this.onPile = true;
    }
    this.piles = this.piles.filter((p) => p.until > now);
    if (this.onPile && !this.pileTold) {
      this.pileTold = true;
      H.float(P.x, P.y - 28, "서류 더미에 발이 묶였다", "#f2ead3");
    }
  }

  private addDrop(x: number, y: number, t0: number): void {
    const p = this.host.place(Phaser.Math.Clamp(x, 24, AW - 24), Phaser.Math.Clamp(y, FLOOR_Y0 + 8, AH - SIDE - 8), 8);
    const img = this.dropPool.pop() ?? this.keep(this.sc.add.image(0, 0, T.pile).setOrigin(0.5, 1));
    img.setVisible(false).setAlpha(1);
    this.drops.push({ x: p.x, y: p.y, t0, at: t0 + this.rules.rainWarn, img });
  }

  private land(d: Drop): void {
    const H = this.host;
    const P = H.player();
    d.img.setVisible(false);
    this.dropPool.push(d.img);
    this.snd("paper");
    H.shake(60, 0.002);
    for (let k = 0; k < 8; k++) this.bits.emit(d.x + (this.rnd() - 0.5) * 12, d.y - 6, { vx: (this.rnd() - 0.5) * 110, vy: -30 - this.rnd() * 70, g: 170, ms: 700, tint: 0xffffff, tex: T.paper });
    if (Math.hypot(P.x - d.x, (P.y - d.y) * 1.4) < this.rules.rainR + 4) {
      H.hurtPct(0.06);
      H.float(P.x, P.y - 30, "결재 서류에 깔렸다!", "#ff9a7a");
    }
    // 더미가 4초 남는다
    if (this.piles.length < 10) {
      const img = this.pilePool.pop() ?? this.keep(this.sc.add.image(0, 0, T.pile).setOrigin(0.5, 1));
      img.setPosition(d.x, d.y + 4).setDepth(D_PILE).setVisible(true).setAlpha(1).setAngle(0);
      this.piles.push({ x: d.x, y: d.y, until: this.host.now() + 4000, img });
    }
  }

  // ── 도장 자국 (인감·대표이사 결재 도장) ──

  private addMark(x: number, y: number, src: ThemeMon, ms: number, big = false): void {
    const now = this.host.now();
    const img = this.markPool.pop() ?? this.keep(this.sc.add.image(0, 0, T.stamp).setDepth(D_PILE - 2));
    img.setPosition(x, y).setVisible(true).setAlpha(0.95).setScale(big ? 1.6 : 1).setAngle((this.rnd() - 0.5) * 30);
    this.marks.push({ x, y, until: now + ms, img, hitAt: 0, src });
    if (this.marks.length > 14) {
      const old = this.marks.shift()!;
      old.img.setVisible(false);
      this.markPool.push(old.img);
    }
  }

  private tickMarks(now: number): void {
    const P = this.host.player();
    for (const k of this.marks) {
      const left = k.until - now;
      k.img.setAlpha(Math.min(0.95, left / 600));
      if (left > 0 && Math.abs(P.x - k.x) < 10 * k.img.scaleX && Math.abs(P.y - k.y) < 6 * k.img.scaleX && now >= k.hitAt) {
        k.hitAt = now + 600;
        this.host.strike(k.src, 0.25);
        this.host.float(P.x, P.y - 26, "따끔", "#ff6a5a");
      }
    }
    const gone = this.marks.filter((k) => k.until <= now);
    if (gone.length) {
      for (const k of gone) {
        k.img.setVisible(false);
        this.markPool.push(k.img);
      }
      this.marks = this.marks.filter((k) => k.until > now);
    }
    for (const s of this.stains) if (s.img.visible) s.img.setAlpha(Math.max(0, Math.min(0.9, (s.until - now) / 800))).setVisible(s.until > now);
  }

  // ── 몬스터마다 ──

  private tickMonsters(now: number, dt: number): void {
    const H = this.host;
    const P = H.player();
    const mons = H.mons();
    this.grid.fill(mons);
    // 판 밖에서 사라진 몬스터 (층 정리 등): 수화기·빛 버프를 거둔다
    for (const [m, s] of this.st)
      if (!m.alive) {
        s.recv?.img.setVisible(false);
        this.unbuff(m);
        this.st.delete(m);
      }
    for (const m of mons) {
      if (!m.alive) continue;
      const s = this.s(m);
      const d = Math.hypot(P.x - m.x, P.y - m.y);
      const free = !m.hidden && now >= m.stunUntil;
      switch (m.id) {
        case "ex_phone":
          this.tickPhone(m, s, now, dt, d, free);
          break;
        case "ex_pen":
          this.tickPen(m, s, now, d, free);
          break;
        case "ex_putter":
          if (s.mode === 0 && free && now >= s.at && d < 220) {
            s.mode = 1;
            s.until = now + 520;
            m.windUntil = s.until;
            s.ang = Math.atan2(P.y - m.y, P.x - m.x);
          } else if (s.mode === 1) {
            const a = s.ang;
            this.floorG.lineStyle(1, 0xffffff, 0.35).lineBetween(m.x, m.y, m.x + Math.cos(a) * 40, m.y + Math.sin(a) * 40);
            if (now >= s.until) {
              s.mode = 0;
              s.at = now + 2600 + this.rnd() * 1200;
              this.putt(m, a);
            }
          }
          break;
        case "ex_wine": {
          // 건배: 잔 둘이 가까우면 "짠!"
          if (now >= (s.clinkAt ?? 0))
            this.grid.near(m.x, m.y, 20, (o) => {
              if (o === m || o.id !== "ex_wine") return false;
              s.clinkAt = now + 4000;
              this.s(o).clinkAt = now + 4000;
              H.float((m.x + o.x) / 2, Math.min(m.y, o.y) - 18, "짠!", "#ffd0e0");
              this.sparks.emit((m.x + o.x) / 2, Math.min(m.y, o.y) - 10, { ms: 400, tint: 0xffffff, s0: 0.05, s1: 0.3 });
              return true;
            });
          if (!H.reduced && this.rnd() < dt * 1.5) this.bits.emit(m.x + (this.rnd() - 0.5) * 6, m.y - 10, { vy: 10, g: 60, ms: 400, tint: 0x9a1a3a, s0: 0.5, tex: T.px });
          break;
        }
        case "ex_chair":
          if (s.mode === 3) {
            const k = (now - (s.until - 520)) / 520;
            m.sprite.scaleX = Math.cos(k * Math.PI * 4) >= 0 ? Math.max(0.3, Math.abs(Math.cos(k * Math.PI * 4))) : -Math.max(0.3, Math.abs(Math.cos(k * Math.PI * 4)));
            this.addG.lineStyle(2, 0xd8b060, 0.4 * (1 - k)).strokeEllipse(m.x, m.y - 4, 56 * k + 12, 34 * k + 8);
          }
          break;
        case "ex_portrait":
          this.tickPortrait(m, s, now, d);
          break;
        case "ex_seal":
          this.tickSeal(m, s, now, d, free);
          break;
        case "ex_cards":
          if (s.mode === 0 && free && now >= s.at && d < 180 && d > 30) {
            s.at = now + 3600 + this.rnd() * 1200;
            this.lobCard(m, P.x, P.y);
          }
          break;
        case "ex_bonsai":
          this.tickBonsai(m, s, now, d, free);
          break;
        case "ex_car_key":
          if (free && now >= s.at && now >= this.laneUntil && !this.cars.some((c) => c.on)) {
            s.at = now + 6500 + this.rnd() * 2500;
            this.callCar(m);
          }
          break;
        case "ex_entourage":
          if (now >= (s.talkAt ?? 0)) {
            s.talkAt = now + 4000 + this.rnd() * 4000;
            if (this.rnd() < 0.5) H.float(m.x, m.y - 20, ["네, 맞습니다", "좋은 말씀이세요", "그렇죠"][Math.floor(this.rnd() * 3)], "#d8e0e8");
          }
          break;
        case "ex_secretary":
          if (free && now >= (s.orderAt ?? 0)) {
            s.orderAt = now + 6500;
            H.float(m.x, m.y - 26, "결재 올려 주세요!", "#ffe08a");
            this.addDrop(P.x, P.y, now);
            this.airG.lineStyle(1, 0xf0d040, 0.8).lineBetween(m.x + 6, m.y - 14, P.x, P.y - 10);
          }
          break;
        case "ex_ceo":
          this.tickCeo(m, s, now);
          break;
      }
    }
  }

  /** 전화: 따르릉 → 수화기를 던지고 줄에 매달려 되돌아온다 */
  private tickPhone(m: ThemeMon, s: St, now: number, dt: number, d: number, free: boolean): void {
    const H = this.host;
    const P = H.player();
    const rc = s.recv ?? (s.recv = { img: this.keep(this.sc.add.image(m.x, m.y, T.recv).setDepth(D_AIR).setVisible(false)), x: m.x, y: m.y, vx: 0, vy: 0, back: false, t0: 0 });
    if (s.mode === 0) {
      rc.img.setVisible(false);
      if (free && now >= s.at && d < 200) {
        s.mode = 1;
        s.until = now + 700;
        m.windUntil = s.until;
        H.float(m.x, m.y - 20, "따르릉", "#ffe08a");
        this.snd("ring");
      }
      return;
    }
    if (s.mode === 1) {
      const k = 1 - (s.until - now) / 700;
      for (let i = 0; i < 2; i++) this.addG.lineStyle(1, 0xffe08a, 0.6 - i * 0.2).strokeCircle(m.x, m.y - 9, 6 + ((k * 14 + i * 6) % 14));
      if (!H.reduced) m.sprite.setAngle(Math.sin(now / 18) * 8);
      if (now >= s.until) {
        m.sprite.setAngle(0);
        s.mode = 2;
        const a = Math.atan2(P.y - 6 - (m.y - 8), P.x - m.x);
        rc.x = m.x;
        rc.y = m.y - 8;
        rc.vx = Math.cos(a) * 240;
        rc.vy = Math.sin(a) * 240;
        rc.back = false;
        rc.t0 = now;
        s.hitAt = 0;
        H.sfx("swish", 0.35);
      }
      return;
    }
    // 날아가는 수화기
    if (!rc.back && (now - rc.t0 > 620 || Math.hypot(rc.x - m.x, rc.y - m.y) > 150)) rc.back = true;
    if (rc.back) {
      const a = Math.atan2(m.y - 8 - rc.y, m.x - rc.x);
      rc.vx = Math.cos(a) * 270;
      rc.vy = Math.sin(a) * 270;
      if (Math.hypot(m.x - rc.x, m.y - 8 - rc.y) < 8) {
        s.mode = 0;
        s.at = now + 2400 + this.rnd() * 1200;
        rc.img.setVisible(false);
        return;
      }
    }
    rc.x += rc.vx * dt;
    rc.y += rc.vy * dt;
    rc.img.setVisible(true).setPosition(rc.x, rc.y).setRotation(now / 60);
    // 꼬인 줄 (살짝 늘어진 곡선)
    const g = this.airG.lineStyle(1, 0x1a1a1e, 0.9);
    g.beginPath();
    g.moveTo(m.x, m.y - 6);
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      g.lineTo(m.x + (rc.x - m.x) * u + Math.sin(u * 18) * 1.5, m.y - 6 + (rc.y - m.y + 6) * u + Math.sin(u * Math.PI) * 6);
    }
    g.strokePath();
    if (Math.hypot(P.x - rc.x, P.y - 8 - rc.y) < 9 && now >= s.hitAt) {
      s.hitAt = now + 500;
      H.strike(m, 0.9);
    }
  }

  /** 만년필: 멈춰서 금빛 서명을 휘갈긴 뒤 그 선이 번쩍 벤다 */
  private tickPen(m: ThemeMon, s: St, now: number, d: number, free: boolean): void {
    const H = this.host;
    const P = H.player();
    if (s.mode === 0) {
      if (free && now >= s.at && d < 150) {
        s.mode = 1;
        s.until = now + 900;
        m.windUntil = now + 1200;
        // 내 자리를 지나는 구불구불한 서명 (여덟 마디)
        const a = this.rnd() * Math.PI;
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < 9; i++) {
          const u = (i - 4) / 4;
          const along = u * 54;
          const side = Math.sin(i * 1.7) * 12 + (i % 2 ? 6 : -6);
          pts.push({ x: P.x + Math.cos(a) * along - Math.sin(a) * side, y: P.y - 4 + (Math.sin(a) * along + Math.cos(a) * side) * 0.7 });
        }
        s.sig = pts;
        H.float(m.x, m.y - 18, "서명!", "#e8c050");
        H.sfx("ink", 0.4);
      }
      return;
    }
    const pts = s.sig!;
    const draw = s.mode === 1 ? Math.min(1, 1 - (s.until - now) / 900) : 1;
    const n = Math.max(1, Math.floor(draw * (pts.length - 1)));
    const blink = s.mode === 2 && !H.reduced ? (Math.floor(now / 60) % 2 ? 1 : 0.5) : 0.8;
    this.floorG.lineStyle(2, 0xe8c050, blink);
    this.floorG.beginPath();
    this.floorG.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= n; i++) this.floorG.lineTo(pts[i].x, pts[i].y);
    this.floorG.strokePath();
    for (let i = 0; i <= n; i += 2) this.floorG.fillStyle(0x1a1a3a, 0.8).fillCircle(pts[i].x, pts[i].y, 1.5);
    // 펜 끝에서 서명 끝까지 잉크 줄
    this.airG.lineStyle(1, 0xe8c050, 0.4).lineBetween(m.x - 4, m.y - 2, pts[n].x, pts[n].y);
    if (s.mode === 1 && now >= s.until) {
      s.mode = 2;
      s.until = now + 320;
    } else if (s.mode === 2 && now >= s.until) {
      s.mode = 3;
      s.until = now + 220;
      H.sfx("swish", 0.5);
      let hit = false;
      for (let i = 1; i < pts.length; i++) if (segDist(P.x, P.y - 4, pts[i - 1], pts[i]) < 7) hit = true;
      if (hit) H.strike(m, 1.2);
      for (let i = 0; i < pts.length; i += 2) this.sparks.emit(pts[i].x, pts[i].y, { ms: 300, tint: 0xffe8a0, s0: 0.2, s1: 0.04 });
    } else if (s.mode === 3) {
      const k = (s.until - now) / 220;
      this.addG.lineStyle(4, 0xffe8a0, k);
      this.addG.beginPath();
      this.addG.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) this.addG.lineTo(pts[i].x, pts[i].y);
      this.addG.strokePath();
      if (now >= s.until) {
        s.mode = 0;
        s.at = now + 3200 + this.rnd() * 1500;
      }
    }
  }

  /** 골프공: 벽에 세 번까지 튕긴다 */
  private putt(m: ThemeMon, a: number): void {
    this.snd("putt");
    let b = this.balls.find((x) => !x.on);
    if (!b) {
      if (this.balls.length >= 10) return;
      b = { img: this.keep(this.sc.add.image(0, 0, T.ball).setDepth(D_AIR)), x: 0, y: 0, vx: 0, vy: 0, until: 0, bounces: 0, src: m, on: false };
      this.balls.push(b);
    }
    Object.assign(b, { x: m.x + Math.cos(a) * 8, y: m.y - 3, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, until: this.host.now() + 5000, bounces: 0, src: m, on: true });
    b.img.setVisible(true);
  }

  private tickBalls(now: number, dt: number): void {
    const P = this.host.player();
    for (const b of this.balls) {
      if (!b.on) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let hit = false;
      if (b.x < SIDE + 3 || b.x > AW - SIDE - 3) {
        b.vx = -b.vx;
        b.x = Phaser.Math.Clamp(b.x, SIDE + 3, AW - SIDE - 3);
        hit = true;
      }
      if (b.y < FLOOR_Y0 || b.y > AH - SIDE - 3) {
        b.vy = -b.vy;
        b.y = Phaser.Math.Clamp(b.y, FLOOR_Y0, AH - SIDE - 3);
        hit = true;
      }
      if (hit) {
        b.bounces++;
        this.sparks.emit(b.x, b.y, { ms: 200, tint: 0xffffff, s0: 0.2, s1: 0.02 });
        this.host.sfx("tick", 0.2);
      }
      b.img.setPosition(b.x, b.y - 2).setDepth(b.y + 1);
      this.floorG.fillStyle(0x000000, 0.3).fillEllipse(b.x, b.y + 1, 4, 2);
      if (Math.hypot(P.x - b.x, P.y - 6 - b.y) < 7) {
        this.host.strike(b.src, 0.8);
        b.until = 0;
      }
      if (now >= b.until || b.bounces > 3) {
        b.on = false;
        b.img.setVisible(false);
      }
    }
  }

  /** 의자: 노려보기 → 쭉 돌진 → 멈춘 자리에서 한 바퀴 */
  private chairMove(m: ThemeMon, s: St, dt: number): boolean {
    const H = this.host;
    const now = H.now();
    const P = H.player();
    if (s.mode === 0) {
      if (now >= s.at && Math.hypot(P.x - m.x, P.y - m.y) < 200) {
        s.mode = 1;
        s.until = now + 900;
        m.windUntil = s.until;
        s.ang = Math.atan2(P.y - m.y, P.x - m.x);
        const shape: TelegraphShape = { kind: "line", len: 210, width: 18 };
        H.tele.add(shape, m.x, m.y, s.ang, now, 900);
        H.float(m.x, m.y - 24, "흠…", "#d8b060");
        return true;
      }
      return false;
    }
    if (s.mode === 1) {
      if (!H.reduced) m.sprite.setAngle(Math.sin(now / 30) * 4);
      if (now >= s.until) {
        m.sprite.setAngle(0);
        s.mode = 2;
        s.until = now + 800;
        s.hitAt = 0;
        H.sfx("swish", 0.45);
      }
      return true;
    }
    if (s.mode === 2) {
      const bx = m.x;
      const by = m.y;
      H.moveMon(m, Math.cos(s.ang) * 270 * dt, Math.sin(s.ang) * 270 * dt);
      const stuck = Math.hypot(m.x - bx, m.y - by) < 270 * dt * 0.3;
      this.floorG.lineStyle(2, 0x2a1a10, 0.35).lineBetween(m.x - Math.cos(s.ang) * 14, m.y - Math.sin(s.ang) * 14, m.x, m.y);
      if (!s.hitAt && Math.hypot(P.x - m.x, P.y - m.y) < MONSTERS[m.id].size / 2 + 7) {
        s.hitAt = 1;
        H.strike(m, 1.2);
      }
      if (now >= s.until || stuck) {
        if (stuck) {
          H.sfx("thud", 0.4);
          H.shake(60, 0.002);
        }
        s.mode = 3;
        s.until = now + 520;
        if (Math.hypot(P.x - m.x, P.y - m.y) < 30) H.strike(m, 0.7);
      }
      return true;
    }
    if (now >= s.until) {
      s.mode = 0;
      s.at = now + 1800 + this.rnd() * 1400;
      m.sprite.scaleX = 1;
    }
    return true;
  }

  /** 초상화: 벽에 걸려 눈빛을 쏘아 훑고, 가끔 사라졌다 다른 벽에 걸린다 */
  private tickPortrait(m: ThemeMon, s: St, now: number, d: number): void {
    const H = this.host;
    const P = H.player();
    const spots = exPortraitSpots(this.room);
    if (s.mode === 0 && now >= (s.blinkAt ?? 0)) {
      s.mode = 3;
      s.until = now + 400;
      m.hidden = true;
    }
    if (s.mode === 3) {
      const k = (s.until - now) / 400;
      m.sprite.setAlpha(Math.max(0, k));
      if (now >= s.until) {
        // 다른 빈 자리로 (사람과 너무 붙지 않게)
        const cand = spots.filter((p) => Math.abs(p.x - m.x) > 30 && Math.abs(p.x - P.x) > 40);
        const p = cand.length ? cand[Math.floor(this.rnd() * cand.length)] : { x: 40 + this.rnd() * (AW - 80), y: 0 };
        m.x = p.x;
        m.y = FLOOR_Y0 + 6;
        s.mode = 4;
        s.until = now + 400;
      }
      return;
    }
    if (s.mode === 4) {
      m.sprite.setPosition(m.x, m.y - 4).setAlpha(1 - (s.until - now) / 400);
      if (now >= s.until) {
        m.hidden = false;
        m.sprite.setAlpha(1);
        s.mode = 0;
        s.blinkAt = now + 7000 + this.rnd() * 3000;
        s.at = now + 900;
      }
      return;
    }
    m.sprite.setPosition(m.x, m.y - 4);
    if (s.mode === 0 && now >= s.at && d < 260 && now >= m.stunUntil) {
      s.mode = 1;
      s.until = now + 800;
      m.windUntil = now + 2000;
      s.ang = Math.atan2(P.y - 6 - (m.y - 12), P.x - m.x);
    }
    const ex = m.x;
    const ey = m.y - 12;
    if (s.mode === 1) {
      const k = 1 - (s.until - now) / 800;
      this.addG.fillStyle(0xff2a1a, 0.5 + 0.5 * k).fillCircle(ex - 2, ey, 1.5 + k).fillCircle(ex + 2, ey, 1.5 + k);
      this.floorG.lineStyle(1, 0xff3a2a, 0.3 * k).lineBetween(ex, ey, ex + Math.cos(s.ang - 0.45) * 280, ey + Math.sin(s.ang - 0.45) * 280);
      this.floorG.lineStyle(1, 0xff3a2a, 0.3 * k).lineBetween(ex, ey, ex + Math.cos(s.ang + 0.45) * 280, ey + Math.sin(s.ang + 0.45) * 280);
      if (now >= s.until) {
        s.mode = 2;
        s.until = now + 1200;
        s.hitAt = 0;
        this.snd("beam");
      }
    } else if (s.mode === 2) {
      const k = 1 - (s.until - now) / 1200;
      const a = s.ang - 0.45 + 0.9 * k;
      const x1 = ex + Math.cos(a) * 300;
      const y1 = ey + Math.sin(a) * 300;
      this.addG.lineStyle(5, 0xff2a1a, 0.35).lineBetween(ex, ey, x1, y1);
      this.addG.lineStyle(2, 0xffd0c0, 0.9).lineBetween(ex, ey, x1, y1);
      if (segDist(P.x, P.y - 6, { x: ex, y: ey }, { x: x1, y: y1 }) < 6 && now >= s.hitAt) {
        s.hitAt = now + 450;
        H.strike(m, 0.55);
      }
      if (now >= s.until) {
        s.mode = 0;
        s.at = now + 3600 + this.rnd() * 1400;
      }
    }
  }

  /** 인감: 웅크렸다 높이 뛰어 내 자리에 쾅 — 붉은 도장 자국이 남는다 */
  private tickSeal(m: ThemeMon, s: St, now: number, d: number, free: boolean): void {
    const H = this.host;
    const P = H.player();
    if (s.mode === 0 && free && now >= s.at && d < 130) {
      s.mode = 1;
      s.until = now + 320;
      m.windUntil = now + 1000;
    } else if (s.mode === 1 && now >= s.until) {
      s.mode = 2;
      s.at = now;
      s.sx = m.x;
      s.sy = m.y;
      const t = H.place(P.x, P.y, 7);
      s.tx = t.x;
      s.ty = t.y;
      H.tele.add({ kind: "circle", r: 22 }, t.x, t.y, 0, now, 650, () => {
        this.snd("stamp");
        H.shake(110, 0.004);
        const pp = H.player();
        if (Math.hypot(pp.x - t.x, pp.y - t.y) < 24) H.strike(m, 1.3);
        if (m.alive) this.addMark(t.x, t.y, m, 3500);
      });
    } else if (s.mode === 2) {
      const k = Math.min(1, (now - s.at) / 650);
      m.sprite.setY(m.sprite.y - Math.sin(k * Math.PI) * 30);
      this.floorG.fillStyle(0x000000, 0.25).fillEllipse(m.x, m.y + 1, 14 * (1 - Math.sin(k * Math.PI) * 0.4), 5);
      if (k >= 1) {
        s.mode = 0;
        s.at = now + 2800 + this.rnd() * 1400;
      }
    }
  }

  /** 명함 수류탄: 내 자리로 포물선 → 터지며 명함이 사방으로 */
  private lobCard(m: ThemeMon, x: number, y: number): void {
    const H = this.host;
    const now = H.now();
    let l = this.lobs.find((q) => !q.on);
    if (!l) {
      if (this.lobs.length >= 8) return;
      l = { img: this.keep(this.sc.add.image(0, 0, T.grenade).setDepth(D_AIR)), x0: 0, y0: 0, x1: 0, y1: 0, t0: 0, t1: 0, on: false };
      this.lobs.push(l);
    }
    Object.assign(l, { x0: m.x, y0: m.y - 10, x1: x, y1: y, t0: now, t1: now + 1000, on: true });
    l.img.setVisible(true);
    H.sfx("flick", 0.35);
    H.tele.add({ kind: "circle", r: 26 }, x, y, 0, now, 1000, () => {
      this.host.sfx("slam", 0.35);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        this.bits.emit(x, y - 6, { vx: Math.cos(a) * 130, vy: Math.sin(a) * 90, ms: 380, tint: 0xffffff, tex: T.card });
      }
      const pp = this.host.player();
      if (Math.hypot(pp.x - x, pp.y - y) < 28) this.host.strike(m, 1.0);
    });
  }

  private tickLobs(now: number): void {
    for (const l of this.lobs) {
      if (!l.on) continue;
      const k = (now - l.t0) / (l.t1 - l.t0);
      if (k >= 1) {
        l.on = false;
        l.img.setVisible(false);
        continue;
      }
      l.img.setPosition(l.x0 + (l.x1 - l.x0) * k, l.y0 + (l.y1 - l.y0) * k - Math.sin(k * Math.PI) * 50).setRotation(k * 9).setDepth(9000);
    }
  }

  /** 분재: 자리를 잡고 세 갈래 가시 가지 */
  private tickBonsai(m: ThemeMon, s: St, now: number, d: number, free: boolean): void {
    const H = this.host;
    const P = H.player();
    if (!s.rooted && d < 150) {
      s.rooted = true;
      H.float(m.x, m.y - 20, "자리 잡음", "#8ad08a");
      for (let k = 0; k < 5; k++) this.bits.emit(m.x + (this.rnd() - 0.5) * 12, m.y, { vy: -20, ms: 400, tint: 0x8a5a2a, tex: T.px });
    }
    if (!s.rooted || !free || now < s.at) return;
    s.at = now + 4300 + this.rnd() * 1200;
    m.windUntil = now + 1000;
    const base = Math.atan2(P.y - m.y, P.x - m.x);
    for (const off of [-0.6, 0, 0.6]) {
      const a = base + off;
      const shape: TelegraphShape = { kind: "line", len: 150, width: 12 };
      H.tele.add(shape, m.x, m.y - 4, a, now, 1000, () => {
        this.thorns.push({ x: m.x, y: m.y - 4, a, until: this.host.now() + 520 });
        const pp = this.host.player();
        if (m.alive && inTelegraph(shape, m.x, m.y - 4, a, pp.x, pp.y, 4)) this.host.strike(m, 1.0);
      });
    }
  }

  private tickThorns(now: number): void {
    this.thorns = this.thorns.filter((t) => t.until > now);
    for (const t of this.thorns) {
      const k = (t.until - now) / 520;
      const g = this.floorG;
      const len = 150 * Math.min(1, (1 - k) * 4);
      const ex = t.x + Math.cos(t.a) * len;
      const ey = t.y + Math.sin(t.a) * len;
      g.lineStyle(3, 0x5a3a20, k).lineBetween(t.x, t.y, ex, ey);
      g.lineStyle(1, 0x3a7a3a, k).lineBetween(t.x, t.y - 1, ex, ey - 1);
      for (let u = 12; u < len; u += 10) {
        const px = t.x + Math.cos(t.a) * u;
        const py = t.y + Math.sin(t.a) * u;
        const side = (u / 10) % 2 ? 1 : -1;
        g.lineStyle(1, 0xd8d0a0, k).lineBetween(px, py, px + Math.cos(t.a + side * 1.2) * 5, py + Math.sin(t.a + side * 1.2) * 5);
      }
    }
  }

  /** 차 키: 삑삑 → 내 줄에 차선 경고 → 임원 차가 전조등을 켜고 달려 지나간다 */
  private callCar(m: ThemeMon): void {
    const H = this.host;
    const now = H.now();
    const P = H.player();
    const y = Phaser.Math.Clamp(P.y, FLOOR_Y0 + 14, AH - SIDE - 8);
    const dir = this.rnd() < 0.5 ? 1 : -1;
    H.float(m.x, m.y - 16, "삑삑", "#ff8a7a");
    this.snd("beep");
    const shape: TelegraphShape = { kind: "line", len: AW - SIDE * 2, width: 22 };
    this.laneUntil = now + 1400 + 1200;
    H.tele.add(shape, dir > 0 ? SIDE : AW - SIDE, y, dir > 0 ? 0 : Math.PI, now, 1400, () => {
      let c = this.cars.find((q) => !q.on);
      if (!c) {
        c = {
          img: this.keep(this.sc.add.image(0, 0, T.car).setOrigin(0.5, 1)),
          glow: this.keep(this.sc.add.image(0, 0, T.soft).setTint(0xfff4c0).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(70, 26).setDepth(D_ADD)),
          x: 0,
          y: 0,
          dir: 1,
          on: false,
          hit: false,
          src: m,
        };
        this.cars.push(c);
      }
      Object.assign(c, { x: dir > 0 ? -40 : AW + 40, y: y + 8, dir, on: true, hit: false, src: m });
      c.img.setVisible(true).setFlipX(dir < 0);
      c.glow.setVisible(true);
      this.snd("horn");
    });
  }

  private tickCars(now: number, dt: number): void {
    const P = this.host.player();
    for (const c of this.cars) {
      if (!c.on) continue;
      c.x += c.dir * 560 * dt;
      c.img.setPosition(c.x, c.y).setDepth(c.y);
      c.glow.setPosition(c.x + c.dir * 40, c.y - 8).setAlpha(0.7);
      if (!c.hit && Math.abs(P.x - c.x) < 28 && Math.abs(P.y - (c.y - 8)) < 13) {
        c.hit = true;
        this.host.strike(c.src, 1.6);
        this.host.movePlayer(c.dir * 26, 0);
        this.host.shake(120, 0.005);
      }
      if (!this.host.reduced && this.rnd() < 0.5) this.bits.emit(c.x - c.dir * 28, c.y - 2, { vx: -c.dir * 40, vy: -10, ms: 300, tint: 0x8a8a8a, tex: T.px, s0: 1.5, s1: 3, a: 0.5 });
      if (c.x < -60 || c.x > AW + 60) {
        c.on = false;
        c.img.setVisible(false);
        c.glow.setVisible(false);
      }
    }
  }

  // ── 우두머리 대표이사 ──

  private tickCeo(m: ThemeMon, s: St, now: number): void {
    const H = this.host;
    const P = H.player();
    const ratio = m.hp / m.st.maxHp;
    // 임원 소집(75% · 50%에 셋씩)은 지도(arena/Arena)가 catalog summon대로 한다 — 서버 상한과 같은 몫
    if (m.hidden || now < m.stunUntil) return;
    // 결재 도장: 처음엔 두 번, 50%부터 줄지어 다섯 번
    if (now >= s.at && !this.beam) {
      const combo = ratio <= EX_BOSS_STAMP;
      s.at = now + (combo ? 3400 : 3800) * (ratio <= EX_BOSS_FINAL ? 1.25 : 1);
      m.windUntil = now + 600;
      const n = combo ? 5 : 2;
      const a = Math.atan2(P.y - m.y, P.x - m.x);
      for (let i = 0; i < n; i++) {
        const x = combo ? m.x + Math.cos(a) * (36 + i * 34) : P.x + (i ? (this.rnd() - 0.5) * 60 : 0);
        const y = combo ? m.y + Math.sin(a) * (36 + i * 34) * 0.85 : P.y + (i ? (this.rnd() - 0.5) * 40 : 0);
        const t = H.place(Phaser.Math.Clamp(x, 24, AW - 24), Phaser.Math.Clamp(y, FLOOR_Y0 + 8, AH - SIDE - 8), 8);
        H.tele.add({ kind: "circle", r: 28 }, t.x, t.y, 0, now, 950 + i * (combo ? 200 : 300), () => {
          this.snd("stamp");
          H.shake(130, 0.005);
          const pp = H.player();
          if (Math.hypot(pp.x - t.x, pp.y - t.y) < 30) H.strike(m, 1.25);
          if (m.alive) this.addMark(t.x, t.y, m, 3000, true);
          for (let k = 0; k < 6; k++) this.bits.emit(t.x, t.y - 4, { vx: (this.rnd() - 0.5) * 90, vy: -40 - this.rnd() * 40, g: 160, ms: 500, tint: 0xffffff, tex: T.paper });
        });
      }
      if (combo) H.float(m.x, m.y - 50, "결재! 결재! 결재!", "#ff8a7a");
    }
    // 25%부터 「구조조정」: 방을 훑는 붉은 빛줄기 (틈이 하나 있다)
    if (ratio <= EX_BOSS_FINAL && !this.beam && now >= (s.beamAt ?? 0)) {
      if (!s.beamAt) H.flash("「구조조정」! 붉은 빛줄기가 방을 훑어요, 초록 틈으로!", 2600);
      s.beamAt = now + 7600;
      const hor = ((s.stamps = (s.stamps ?? 0) + 1) % 2) === 1;
      const lo = hor ? 30 : FLOOR_Y0 + 20;
      const hi = hor ? AW - 30 : AH - SIDE - 20;
      const near = hor ? P.x : P.y;
      // 틈은 내 자리에서 조금 떨어진 곳 (움직여야 산다)
      let gap = lo + this.rnd() * (hi - lo);
      if (Math.abs(gap - near) < 50) gap = near + (gap < near ? -1 : 1) * (60 + this.rnd() * 40);
      gap = Phaser.Math.Clamp(gap, lo, hi);
      this.beam = { hor, t0: now + 1700, t1: now + 1700 + 2600, gap, hit: false, src: m };
      this.snd("beam");
    }
  }

  private tickBeam(now: number): void {
    const b = this.beam;
    if (!b) return;
    const H = this.host;
    const P = H.player();
    const GAP = 26;
    // hor: 가로 빛줄기가 위에서 아래로 내려온다 (틈은 x 위치), 아니면 세로 빛줄기가 왼쪽에서 오른쪽으로 (틈은 y 위치)
    const from = b.hor ? FLOOR_Y0 : SIDE;
    const to = b.hor ? AH - SIDE : AW - SIDE;
    const g = this.addG;
    const line = (pos: number, w: number, col: number, a: number) => {
      g.lineStyle(w, col, a);
      if (b.hor) {
        g.lineBetween(SIDE, pos, b.gap - GAP, pos);
        g.lineBetween(b.gap + GAP, pos, AW - SIDE, pos);
      } else {
        g.lineBetween(pos, FLOOR_Y0, pos, b.gap - GAP);
        g.lineBetween(pos, b.gap + GAP, pos, AH - SIDE);
      }
    };
    if (now < b.t0) {
      // 예고: 출발선 + 틈 표시 (초록 괄호, 그 줄 전체)
      const k = 1 - (b.t0 - now) / 1700;
      const blink = H.reduced ? 0.6 : 0.4 + 0.4 * Math.abs(Math.sin(now / 90));
      line(from + 2, 2, 0xff2a1a, blink);
      const f = this.floorG;
      f.fillStyle(0x3aff7a, 0.12 + 0.1 * k);
      if (b.hor) f.fillRect(b.gap - GAP + 4, FLOOR_Y0, GAP * 2 - 8, AH - SIDE - FLOOR_Y0);
      else f.fillRect(SIDE, b.gap - GAP + 4, AW - SIDE * 2, GAP * 2 - 8);
      f.lineStyle(1, 0x7aff9a, 0.8);
      if (b.hor) {
        f.lineBetween(b.gap - GAP + 4, FLOOR_Y0, b.gap - GAP + 4, AH - SIDE);
        f.lineBetween(b.gap + GAP - 4, FLOOR_Y0, b.gap + GAP - 4, AH - SIDE);
      } else {
        f.lineBetween(SIDE, b.gap - GAP + 4, AW - SIDE, b.gap - GAP + 4);
        f.lineBetween(SIDE, b.gap + GAP - 4, AW - SIDE, b.gap + GAP - 4);
      }
      return;
    }
    const k = Math.min(1, (now - b.t0) / (b.t1 - b.t0));
    const pos = from + (to - from) * k;
    // 틈 줄은 훑는 동안에도 은은하게
    this.floorG.fillStyle(0x3aff7a, 0.1);
    if (b.hor) this.floorG.fillRect(b.gap - GAP + 4, FLOOR_Y0, GAP * 2 - 8, AH - SIDE - FLOOR_Y0);
    else this.floorG.fillRect(SIDE, b.gap - GAP + 4, AW - SIDE * 2, GAP * 2 - 8);
    line(pos, 14, 0xff1a0a, 0.28);
    line(pos, 6, 0xff3a2a, 0.7);
    line(pos, 2, 0xfff0e0, 1);
    // 지나간 자리 잔광
    for (let i = 1; i <= 3; i++) line(pos - i * 7, 2, 0xff3a2a, 0.25 / i);
    if (!H.reduced && this.rnd() < 0.6) this.sparks.emit(b.hor ? SIDE + this.rnd() * (AW - SIDE * 2) : pos, b.hor ? pos : FLOOR_Y0 + this.rnd() * (AH - SIDE - FLOOR_Y0), { ms: 260, tint: 0xff6a4a, s0: 0.15, s1: 0.02 });
    const pa = b.hor ? P.y - 6 : P.x;
    const pg = b.hor ? P.x : P.y - 6;
    if (!b.hit && Math.abs(pa - pos) < 7 && Math.abs(pg - b.gap) > GAP - 6) {
      b.hit = true;
      H.strike(b.src, 1.6);
      H.float(P.x, P.y - 32, "구조조정 대상!", "#ff6a4a");
      H.shake(160, 0.006);
    }
    if (k >= 1) this.beam = null;
  }

  destroy(): void {
    for (const m of [...this.buffed.keys()]) this.unbuff(m);
    this.sparks.destroy();
    this.bits.destroy();
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
    this.st.clear();
    this.drops = [];
    this.piles = [];
    this.marks = [];
    this.balls = [];
    this.lobs = [];
    this.cars = [];
    this.beam = null;
  }
}

function inSpot(sp: { x: number; y: number }, x: number, y: number): boolean {
  const dx = (x - sp.x) / SPOT_RX;
  const dy = (y - sp.y) / SPOT_RY;
  return dx * dx + dy * dy <= 1;
}

/** 점과 선분 거리 */
function segDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2));
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}

/** 놋쇠 층 번호판 "37F" */
function signCanvas(floor: number): HTMLCanvasElement {
  const text = `${floor}F`;
  const w = text.length * 8 + 8;
  const { canvas, ctx: c } = makeCanvas(w, 16);
  c.fillStyle = css(0x6a4a1a);
  c.fillRect(0, 0, w, 16);
  c.fillStyle = css(0xd8b050);
  c.fillRect(1, 1, w - 2, 14);
  c.fillStyle = css(0x3a2810);
  c.fillRect(2, 2, w - 4, 12);
  pixText(c, 4, 3, text, 0xf0d070, 2);
  c.fillStyle = css(0xfff0b0);
  c.fillRect(1, 1, w - 2, 1);
  return canvas;
}

/** 바닥 금실 층 번호 */
function inlayCanvas(floor: number): HTMLCanvasElement {
  const text = `${floor}F`;
  const w = text.length * 16 + 12;
  const { canvas, ctx } = makeCanvas(w, 24);
  ctx.strokeStyle = css(0xc8a050, 0.6);
  ctx.strokeRect(1.5, 1.5, w - 3, 21);
  pixText(ctx, 6, 2, text, 0xd8b050, 4, 0.55);
  return canvas;
}

const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
function pixText(c: CanvasRenderingContext2D, x: number, y: number, text: string, col: Color, k = 1, a = 1): void {
  c.fillStyle = css(col, a);
  let cx = x;
  for (const ch of text) {
    if (ch === "F") for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [0, 3], [0, 4]]) c.fillRect(cx + dx * k, y + dy * k, k, k);
    else {
      const bits = DIGITS[Number(ch)] ?? "";
      for (let i = 0; i < 15; i++) if (bits[i] === "1") c.fillRect(cx + (i % 3) * k, y + Math.floor(i / 3) * k, k, k);
    }
    cx += 4 * k;
  }
}

/** 임원층 실행부 만들기 (game/tower/themes 표에 한 줄로) */
export const makeExec = (host: ThemeHost, _zone: string, seed: number): TowerThemeRuntime => new ExecStage(host, seed);
